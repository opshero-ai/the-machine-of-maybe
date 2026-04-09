"""Orchestration engine for The Machine of Maybe.

The core state machine that drives simulation runs. Spawns agents, manages
the task DAG, coordinates agent think/act loops, handles decision gates,
and synthesizes final outcomes.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime
from typing import Any

from app.models.entities import (
    AgentRole,
    AgentState,
    CompiledScenario,
    DecisionGate,
    EventType,
    GateOption,
    GateStatus,
    Metric,
    Outcome,
    PlanSection,
    RiskEntry,
    RiskLevel,
    RunEvent,
    RunStatus,
    Scenario,
    SimulationMode,
    Task,
    TaskStatus,
)
from app.prompts.system_prompts import OUTCOME_SYNTHESIS_PROMPT
from app.services.agents.base import BaseAgent
from app.services.agents.roles import create_agent
from app.services.firestore_client import FirestoreClient

logger = logging.getLogger(__name__)

MAX_TASK_RETRIES = 2
DRAMATIC_PAUSE_SECONDS = 1.5  # Simulated delay for pacing


class OrchestrationEngine:
    """The core state machine that drives simulation execution.

    Manages the full lifecycle of a simulation run:
    1. Spawn agents based on compiled roster
    2. Create tasks from the compiled task graph
    3. Execute the task DAG with agent coordination
    4. Handle decision gates for human input
    5. Synthesize final outcome
    """

    def __init__(
        self,
        run_id: str,
        scenario: Scenario,
        compiled: CompiledScenario,
        mode: SimulationMode,
        firestore: FirestoreClient,
    ) -> None:
        self.run_id = run_id
        self.scenario = scenario
        self.compiled = compiled
        self.mode = mode
        self.firestore = firestore

        self.agents: dict[AgentRole, BaseAgent] = {}
        self.tasks: dict[str, Task] = {}
        self.task_results: dict[str, dict] = {}
        self.events: list[RunEvent] = []
        self.gates: dict[str, DecisionGate] = {}
        self.event_sequence = 0
        self.narratives: list[str] = []
        self.guardian_findings: list[dict] = []
        self.architect_design: dict = {}
        self.analyst_findings: dict = {}
        self._start_time: float = 0.0

    async def execute(self) -> Outcome:
        """Main execution loop for the simulation.

        Returns:
            The final Outcome summarizing the simulation results.
        """
        self._start_time = time.monotonic()

        try:
            # Phase 1: Update run status
            await self._update_run_status(RunStatus.COMPILING, "Initializing agents")
            await self._emit_event(
                EventType.RUN_STATUS_CHANGED,
                "system",
                {"status": "compiling", "message": "Spawning agents and creating tasks"},
            )

            # Phase 2: Spawn agents
            await self._spawn_agents()

            # Phase 3: Create tasks from compiled graph
            await self._create_tasks()

            # Phase 4: Enter execution loop
            await self._update_run_status(RunStatus.RUNNING, "Executing tasks")
            await self._execution_loop()

            # Phase 5: Synthesize outcome
            await self._update_run_status(RunStatus.RUNNING, "Synthesizing outcome")
            outcome = await self._synthesize_outcome()

            # Phase 6: Mark complete
            await self._update_run_status(RunStatus.COMPLETED, "Completed")
            await self._emit_event(
                EventType.RUN_STATUS_CHANGED,
                "system",
                {"status": "completed", "success_score": outcome.success_score},
            )

            return outcome

        except Exception as e:
            logger.error("Orchestration failed for run %s: %s", self.run_id, e)
            await self._update_run_status(RunStatus.FAILED, str(e))
            await self._emit_event(
                EventType.ERROR,
                "system",
                {"error": str(e), "phase": "orchestration"},
            )
            raise

    async def _spawn_agents(self) -> None:
        """Create agent instances based on the compiled roster."""
        roles = self.compiled.required_roles
        if not roles:
            # Default: spawn all roles
            roles = list(AgentRole)

        for role in roles:
            agent = create_agent(role, self.run_id)
            self.agents[role] = agent

            # Persist agent to Firestore
            await self.firestore.add_subcollection_doc(
                "runs",
                self.run_id,
                "agents",
                agent.to_dict(),
                doc_id=f"{role.value}",
            )

            await self._emit_event(
                EventType.AGENT_ACTION,
                agent.name,
                {"action": "spawned", "role": role.value, "capabilities": agent.capabilities},
            )

        logger.info(
            "Spawned %d agents for run %s: %s",
            len(self.agents),
            self.run_id,
            [r.value for r in self.agents.keys()],
        )

    async def _create_tasks(self) -> None:
        """Create Task objects from the compiled task graph and persist them."""
        for node in self.compiled.task_graph:
            task = Task(
                id=node.id,
                run_id=self.run_id,
                title=node.title,
                description=node.description,
                status=TaskStatus.PENDING,
                assigned_role=node.assigned_role,
                dependencies=node.dependencies,
                risk_level=node.risk_level,
                estimated_duration=node.estimated_duration,
            )
            self.tasks[task.id] = task

            await self.firestore.add_subcollection_doc(
                "runs",
                self.run_id,
                "tasks",
                task.model_dump(mode="json"),
                doc_id=task.id,
            )

        logger.info(
            "Created %d tasks for run %s",
            len(self.tasks),
            self.run_id,
        )

    async def _execution_loop(self) -> None:
        """Main loop: find executable tasks, assign to agents, execute."""
        max_iterations = len(self.tasks) * 4  # Safety bound
        iteration = 0

        while iteration < max_iterations:
            iteration += 1

            # Check for pending gates (human input needed)
            pending_gates = [g for g in self.gates.values() if g.status == GateStatus.PENDING]
            if pending_gates and self.mode != SimulationMode.FULL_AUTO:
                await self._update_run_status(
                    RunStatus.WAITING_FOR_INPUT,
                    f"Waiting for decision: {pending_gates[0].title}",
                )
                # In full_auto mode, auto-resolve gates. Otherwise, wait.
                await self._wait_for_gates(pending_gates)
                await self._update_run_status(RunStatus.RUNNING, "Resuming execution")

            # Find next executable tasks
            executable = self._find_executable_tasks()

            if not executable:
                # Check if we are done or stuck
                if self._all_tasks_terminal():
                    logger.info("All tasks terminal for run %s", self.run_id)
                    break
                elif self._has_blocked_tasks():
                    logger.warning("Run %s has blocked tasks with no executable work", self.run_id)
                    # Try to unblock by failing blocked tasks
                    await self._handle_deadlock()
                    continue
                else:
                    break

            # Execute tasks (potentially in parallel)
            await self._execute_tasks(executable)

            # Update progress
            progress = self._calculate_progress()
            await self.firestore.update_document(
                "runs",
                self.run_id,
                {"progress": progress, "event_count": self.event_sequence},
            )

            # Narrator update every few iterations
            if iteration % 2 == 0 and AgentRole.NARRATOR in self.agents:
                await self._narrator_update()

            # Time compression pause for dramatic pacing
            await asyncio.sleep(DRAMATIC_PAUSE_SECONDS)

        logger.info(
            "Execution loop completed for run %s after %d iterations",
            self.run_id,
            iteration,
        )

    async def _execute_tasks(self, tasks: list[Task]) -> None:
        """Execute a batch of tasks by assigning them to agents."""
        for task in tasks:
            agent = self._get_agent_for_task(task)
            if agent is None:
                logger.warning("No agent for role %s; skipping task %s", task.assigned_role, task.id)
                task.status = TaskStatus.SKIPPED
                await self._persist_task(task)
                continue

            task.status = TaskStatus.IN_PROGRESS
            task.started_at = datetime.utcnow()
            task.assigned_agent_id = f"{agent.role.value}"
            await self._persist_task(task)

            await self._emit_event(
                EventType.TASK_STARTED,
                agent.name,
                {"task_id": task.id, "task_title": task.title},
            )

            # Agent think
            context = self._build_context(task)
            await self._emit_event(
                EventType.AGENT_THINKING,
                agent.name,
                {"task_id": task.id, "phase": "thinking"},
            )
            action = await agent.think(context)

            # Guardian review (if not the guardian itself)
            if agent.role != AgentRole.GUARDIAN and AgentRole.GUARDIAN in self.agents:
                guardian_result = await self._guardian_review(task, action)
                if guardian_result and not guardian_result.get("approved", True):
                    # Guardian vetoed — check escalation
                    if guardian_result.get("escalation_needed", False):
                        await self._create_gate_from_guardian(task, guardian_result)
                        task.status = TaskStatus.BLOCKED
                        await self._persist_task(task)
                        continue

            # Escalation check (in guided/step-by-step modes)
            if (
                self.mode in (SimulationMode.GUIDED, SimulationMode.STEP_BY_STEP)
                and AgentRole.ESCALATION_LEAD in self.agents
            ):
                escalation = await self._check_escalation(task, action)
                if escalation and escalation.get("gate_required", False):
                    await self._create_gate_from_escalation(task, escalation)
                    task.status = TaskStatus.BLOCKED
                    await self._persist_task(task)
                    continue

            # Agent act
            await self._emit_event(
                EventType.AGENT_ACTION,
                agent.name,
                {"task_id": task.id, "action_type": action.action_type, "reasoning": action.reasoning},
            )
            result = await agent.act(action)

            # Handle result
            if result.success:
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.utcnow()
                task.result = json.dumps(result.output, default=str)[:5000]
                self.task_results[task.id] = result.output

                # Store role-specific outputs for cross-agent context
                if agent.role == AgentRole.ARCHITECT:
                    self.architect_design = result.output
                elif agent.role == AgentRole.ANALYST:
                    self.analyst_findings = result.output

                await self._emit_event(
                    EventType.TASK_COMPLETED,
                    agent.name,
                    {
                        "task_id": task.id,
                        "task_title": task.title,
                        "duration_seconds": result.duration_seconds,
                    },
                )
            else:
                # Retry logic
                task.retry_count += 1
                if task.retry_count <= MAX_TASK_RETRIES:
                    logger.warning(
                        "Task %s failed (attempt %d/%d): %s",
                        task.id,
                        task.retry_count,
                        MAX_TASK_RETRIES + 1,
                        result.error,
                    )
                    task.status = TaskStatus.PENDING
                    task.error = result.error
                else:
                    task.status = TaskStatus.FAILED
                    task.error = result.error
                    await self._emit_event(
                        EventType.TASK_FAILED,
                        agent.name,
                        {"task_id": task.id, "error": result.error, "retries_exhausted": True},
                    )

            await self._persist_task(task)

            # Update agent state in Firestore
            await self.firestore.update_subcollection_doc(
                "runs",
                self.run_id,
                "agents",
                agent.role.value,
                {
                    "state": agent.state.value,
                    "actions_taken": agent.actions_taken,
                    "last_action_at": datetime.utcnow().isoformat(),
                },
            )

    async def _guardian_review(self, task: Task, action) -> dict | None:
        """Have the Guardian agent review a proposed action."""
        guardian = self.agents.get(AgentRole.GUARDIAN)
        if guardian is None:
            return None

        context = {
            "scenario_summary": self.compiled.scenario_summary,
            "proposed_action": {
                "action_type": action.action_type,
                "target_task": task.title,
                "reasoning": action.reasoning,
                "details": action.details,
            },
            "current_task": {"id": task.id, "title": task.title, "description": task.description},
            "risks": [r.model_dump(mode="json") for r in self.compiled.risks],
            "safety_flags": self.compiled.safety_flags,
            "constraints": self.compiled.constraints,
            "prior_guardian_findings": self.guardian_findings[-5:],
        }

        await self._emit_event(
            EventType.AGENT_THINKING,
            guardian.name,
            {"task_id": task.id, "phase": "guardian_review"},
        )

        guardian_action = await guardian.think(context)
        result = await guardian.act(guardian_action)

        if result.success:
            finding = result.output
            self.guardian_findings.append(finding)

            risk_level = finding.get("risk_level", "low")
            if risk_level in ("high", "critical"):
                await self._emit_event(
                    EventType.RISK_DETECTED,
                    guardian.name,
                    {
                        "task_id": task.id,
                        "risk_level": risk_level,
                        "findings": finding.get("findings", []),
                    },
                )

            return finding

        return None

    async def _check_escalation(self, task: Task, action) -> dict | None:
        """Have the Escalation Lead decide if human input is needed."""
        escalation_lead = self.agents.get(AgentRole.ESCALATION_LEAD)
        if escalation_lead is None:
            return None

        context = {
            "scenario_summary": self.compiled.scenario_summary,
            "current_task": {"id": task.id, "title": task.title, "description": task.description},
            "guardian_findings": self.guardian_findings[-3:] if self.guardian_findings else {},
            "risks": [r.model_dump(mode="json") for r in self.compiled.risks],
            "pending_decisions": [
                {"id": g.id, "title": g.title}
                for g in self.gates.values()
                if g.status == GateStatus.PENDING
            ],
            "completed_gates": [
                {"id": g.id, "title": g.title, "selected": g.selected_option}
                for g in self.gates.values()
                if g.status == GateStatus.RESOLVED
            ],
            "progress": self._calculate_progress(),
            "mode": self.mode.value,
        }

        escalation_action = await escalation_lead.think(context)
        result = await escalation_lead.act(escalation_action)

        if result.success:
            return result.output
        return None

    async def _create_gate_from_guardian(self, task: Task, guardian_result: dict) -> None:
        """Create a decision gate based on Guardian findings."""
        gate = DecisionGate(
            id=str(uuid.uuid4()),
            run_id=self.run_id,
            title=f"Guardian Review: {task.title}",
            description=guardian_result.get(
                "findings",
                "The Guardian has flagged this task for human review.",
            )
            if isinstance(guardian_result.get("findings"), str)
            else json.dumps(guardian_result.get("findings", []), default=str),
            options=[
                GateOption(
                    label="Proceed",
                    description="Accept the risk and continue execution.",
                    pros=["Maintains momentum"],
                    cons=["Accepted risk"],
                    risk=RiskLevel(guardian_result.get("risk_level", "medium")),
                ),
                GateOption(
                    label="Modify",
                    description="Modify the approach to address Guardian concerns.",
                    pros=["Reduced risk"],
                    cons=["May delay execution"],
                    risk=RiskLevel.LOW,
                ),
                GateOption(
                    label="Skip",
                    description="Skip this task entirely.",
                    pros=["Avoids risk completely"],
                    cons=["May miss objectives"],
                    risk=RiskLevel.LOW,
                ),
            ],
            recommendation=guardian_result.get("recommended_safeguards", "Review and proceed with caution.") if isinstance(guardian_result.get("recommended_safeguards"), str) else "Review and proceed with caution.",
            urgency=RiskLevel(guardian_result.get("risk_level", "medium")),
            blocking_task_ids=[task.id],
        )

        self.gates[gate.id] = gate
        await self.firestore.add_subcollection_doc(
            "runs",
            self.run_id,
            "gates",
            gate.model_dump(mode="json"),
            doc_id=gate.id,
        )
        await self._emit_event(
            EventType.GATE_CREATED,
            "Guardian",
            {"gate_id": gate.id, "title": gate.title, "urgency": gate.urgency.value},
        )

    async def _create_gate_from_escalation(self, task: Task, escalation_result: dict) -> None:
        """Create a decision gate based on Escalation Lead recommendation."""
        options_raw = escalation_result.get("options", [])
        options = []
        for opt in options_raw:
            if isinstance(opt, dict):
                options.append(
                    GateOption(
                        label=opt.get("label", "Option"),
                        description=opt.get("description", ""),
                        pros=opt.get("pros", []),
                        cons=opt.get("cons", []),
                        risk=RiskLevel(opt.get("risk", "medium")),
                    )
                )

        if not options:
            options = [
                GateOption(
                    label="Proceed",
                    description="Continue with the current approach.",
                    pros=["Maintains progress"],
                    cons=["May miss nuances"],
                ),
                GateOption(
                    label="Pause",
                    description="Pause and reconsider the approach.",
                    pros=["Thorough review"],
                    cons=["Delays execution"],
                ),
            ]

        gate = DecisionGate(
            id=str(uuid.uuid4()),
            run_id=self.run_id,
            title=escalation_result.get("gate_description", f"Decision: {task.title}"),
            description=escalation_result.get("context_summary", task.description),
            options=options,
            recommendation=escalation_result.get("recommendation"),
            urgency=RiskLevel(escalation_result.get("urgency", "medium")),
            impact_of_delay=escalation_result.get("impact_of_delay"),
            blocking_task_ids=[task.id],
        )

        self.gates[gate.id] = gate
        await self.firestore.add_subcollection_doc(
            "runs",
            self.run_id,
            "gates",
            gate.model_dump(mode="json"),
            doc_id=gate.id,
        )
        await self._emit_event(
            EventType.GATE_CREATED,
            "Escalation Lead",
            {"gate_id": gate.id, "title": gate.title, "urgency": gate.urgency.value},
        )

    async def _wait_for_gates(self, pending_gates: list[DecisionGate]) -> None:
        """Wait for pending decision gates to be resolved.

        In full_auto mode, auto-resolves with the recommended option.
        In other modes, polls Firestore until the gate is resolved.
        """
        for gate in pending_gates:
            if self.mode == SimulationMode.FULL_AUTO:
                # Auto-resolve with recommendation
                recommended = gate.recommendation or (
                    gate.options[0].label if gate.options else "Proceed"
                )
                await self.resolve_gate(gate.id, recommended, "Auto-resolved in full_auto mode.")
                continue

            # Poll for resolution (max 5 minutes)
            max_wait = 300
            elapsed = 0
            while elapsed < max_wait:
                gate_data = await self.firestore.get_subcollection_doc(
                    "runs", self.run_id, "gates", gate.id
                )
                if gate_data and gate_data.get("status") in (
                    GateStatus.RESOLVED.value,
                    GateStatus.AUTO_RESOLVED.value,
                ):
                    gate.status = GateStatus(gate_data["status"])
                    gate.selected_option = gate_data.get("selected_option")
                    gate.resolved_at = datetime.utcnow()

                    # Unblock tasks
                    for task_id in gate.blocking_task_ids:
                        if task_id in self.tasks:
                            self.tasks[task_id].status = TaskStatus.PENDING
                            await self._persist_task(self.tasks[task_id])

                    await self._emit_event(
                        EventType.GATE_RESOLVED,
                        "user",
                        {
                            "gate_id": gate.id,
                            "selected_option": gate.selected_option,
                        },
                    )
                    break

                await asyncio.sleep(3)
                elapsed += 3

            if elapsed >= max_wait:
                # Timeout — auto-resolve
                logger.warning("Gate %s timed out; auto-resolving", gate.id)
                gate.status = GateStatus.TIMED_OUT
                await self.resolve_gate(
                    gate.id,
                    gate.options[0].label if gate.options else "Proceed",
                    "Timed out; auto-resolved.",
                )

    async def resolve_gate(self, gate_id: str, selected_option: str, reasoning: str = "") -> None:
        """Resolve a decision gate with the given option."""
        gate = self.gates.get(gate_id)
        if gate is None:
            logger.warning("Gate %s not found", gate_id)
            return

        gate.status = GateStatus.RESOLVED
        gate.selected_option = selected_option
        gate.resolved_at = datetime.utcnow()

        await self.firestore.update_subcollection_doc(
            "runs",
            self.run_id,
            "gates",
            gate_id,
            {
                "status": gate.status.value,
                "selected_option": selected_option,
                "resolved_at": gate.resolved_at.isoformat(),
            },
        )

        # Unblock tasks
        for task_id in gate.blocking_task_ids:
            if task_id in self.tasks:
                self.tasks[task_id].status = TaskStatus.PENDING
                await self._persist_task(self.tasks[task_id])

        await self._emit_event(
            EventType.GATE_RESOLVED,
            "user",
            {"gate_id": gate_id, "selected_option": selected_option, "reasoning": reasoning},
        )

    async def _narrator_update(self) -> None:
        """Have the Narrator agent summarize current state."""
        narrator = self.agents.get(AgentRole.NARRATOR)
        if narrator is None:
            return

        context = {
            "scenario_summary": self.compiled.scenario_summary,
            "current_phase": self._current_phase(),
            "recent_events": [
                {"type": e.event_type.value, "actor": e.actor, "payload": e.payload}
                for e in self.events[-10:]
            ],
            "agent_states": {
                role.value: agent.state.value for role, agent in self.agents.items()
            },
            "completed_tasks": [
                {"id": t.id, "title": t.title}
                for t in self.tasks.values()
                if t.status == TaskStatus.COMPLETED
            ],
            "active_tasks": [
                {"id": t.id, "title": t.title}
                for t in self.tasks.values()
                if t.status == TaskStatus.IN_PROGRESS
            ],
            "pending_gates": [
                {"id": g.id, "title": g.title}
                for g in self.gates.values()
                if g.status == GateStatus.PENDING
            ],
            "risks": [r.model_dump(mode="json") for r in self.compiled.risks],
            "progress": self._calculate_progress(),
            "prior_narratives": self.narratives[-3:],
        }

        action = await narrator.think(context)
        result = await narrator.act(action)

        if result.success:
            narrative = result.output.get("narrative", result.output.get("summary", ""))
            if narrative:
                self.narratives.append(narrative)
            await self._emit_event(
                EventType.NARRATIVE_UPDATE,
                narrator.name,
                result.output,
            )

    async def _synthesize_outcome(self) -> Outcome:
        """Produce the final Outcome using all collected data.

        Uses the Narrator (or a dedicated synthesis call) to create the
        comprehensive final report.
        """
        # Build synthesis context
        completed = [t for t in self.tasks.values() if t.status == TaskStatus.COMPLETED]
        failed = [t for t in self.tasks.values() if t.status == TaskStatus.FAILED]
        skipped = [t for t in self.tasks.values() if t.status == TaskStatus.SKIPPED]

        # Use the Narrator for synthesis if available, otherwise build from data
        narrator = self.agents.get(AgentRole.NARRATOR)
        synthesis_output = {}

        if narrator:
            # Temporarily override system prompt for synthesis
            original_prompt = narrator.system_prompt
            narrator.system_prompt = OUTCOME_SYNTHESIS_PROMPT

            context = {
                "scenario_summary": self.compiled.scenario_summary,
                "goals": self.compiled.goals,
                "success_metrics": self.compiled.success_metrics,
                "total_tasks": len(self.tasks),
                "completed_tasks": len(completed),
                "failed_tasks": len(failed),
                "skipped_tasks": len(skipped),
                "task_results": {
                    tid: json.dumps(res, default=str)[:500]
                    for tid, res in self.task_results.items()
                },
                "guardian_findings": self.guardian_findings[-10:],
                "gates_resolved": [
                    {"title": g.title, "selected": g.selected_option}
                    for g in self.gates.values()
                    if g.status in (GateStatus.RESOLVED, GateStatus.AUTO_RESOLVED)
                ],
                "narratives": self.narratives,
                "elapsed_seconds": time.monotonic() - self._start_time,
            }

            action = await narrator.think(context)
            result = await narrator.act(action)
            if result.success:
                synthesis_output = result.output

            narrator.system_prompt = original_prompt

        # Calculate success score
        total = len(self.tasks)
        completed_count = len(completed)
        success_score = completed_count / total if total > 0 else 0.0

        # Build plan sections from task groupings
        plan_sections = []
        roles_seen: set[str] = set()
        for task in self.tasks.values():
            role_key = task.assigned_role.value if task.assigned_role else "unassigned"
            if role_key not in roles_seen:
                roles_seen.add(role_key)
                role_tasks = [
                    t
                    for t in self.tasks.values()
                    if (t.assigned_role and t.assigned_role.value == role_key)
                ]
                role_completed = [t for t in role_tasks if t.status == TaskStatus.COMPLETED]
                plan_sections.append(
                    PlanSection(
                        title=f"{role_key.replace('_', ' ').title()} Workstream",
                        description=f"Tasks handled by the {role_key} agent.",
                        tasks_completed=len(role_completed),
                        tasks_total=len(role_tasks),
                        success=len(role_completed) == len(role_tasks),
                    )
                )

        # Build risk entries
        risks_encountered = []
        for finding in self.guardian_findings:
            if isinstance(finding, dict) and finding.get("risk_level") in ("high", "critical"):
                risks_encountered.append(
                    RiskEntry(
                        title=finding.get("title", "Guardian finding"),
                        level=RiskLevel(finding.get("risk_level", "medium")),
                        description=json.dumps(finding.get("findings", []), default=str)[:500],
                        materialized=True,
                    )
                )

        # Build metrics
        elapsed = time.monotonic() - self._start_time
        metrics = [
            Metric(name="Tasks Completed", value=float(completed_count), unit="tasks", target=float(total), met_target=completed_count == total),
            Metric(name="Tasks Failed", value=float(len(failed)), unit="tasks"),
            Metric(name="Decision Gates", value=float(len(self.gates)), unit="gates"),
            Metric(name="Elapsed Time", value=round(elapsed, 1), unit="seconds"),
            Metric(name="Agent Actions", value=float(sum(a.actions_taken for a in self.agents.values())), unit="actions"),
        ]

        outcome = Outcome(
            run_id=self.run_id,
            summary=synthesis_output.get("summary", f"Simulation completed: {completed_count}/{total} tasks succeeded."),
            success_score=round(success_score, 2),
            plan_sections=plan_sections,
            risks_encountered=risks_encountered,
            metrics=metrics,
            lessons_learned=synthesis_output.get("lessons_learned", []),
            narrative_arc=synthesis_output.get("narrative_arc"),
        )

        # Persist outcome
        await self.firestore.create_document(
            "outcomes",
            outcome.id,
            outcome.model_dump(mode="json"),
        )

        return outcome

    # -------------------------------------------------------------------
    # Helper methods
    # -------------------------------------------------------------------

    def _find_executable_tasks(self) -> list[Task]:
        """Find tasks whose dependencies are all met and that are pending."""
        executable = []
        for task in self.tasks.values():
            if task.status != TaskStatus.PENDING:
                continue
            # Check all dependencies are completed
            deps_met = all(
                self.tasks.get(dep_id) is not None
                and self.tasks[dep_id].status
                in (TaskStatus.COMPLETED, TaskStatus.SKIPPED)
                for dep_id in task.dependencies
            )
            if deps_met:
                executable.append(task)
        return executable

    def _all_tasks_terminal(self) -> bool:
        """Check if all tasks are in a terminal state."""
        terminal = {TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.SKIPPED}
        return all(t.status in terminal for t in self.tasks.values())

    def _has_blocked_tasks(self) -> bool:
        """Check if there are blocked tasks."""
        return any(t.status == TaskStatus.BLOCKED for t in self.tasks.values())

    async def _handle_deadlock(self) -> None:
        """Handle deadlock by failing stuck blocked tasks."""
        for task in self.tasks.values():
            if task.status == TaskStatus.BLOCKED:
                task.status = TaskStatus.FAILED
                task.error = "Deadlocked: blocked with no resolution path."
                await self._persist_task(task)
                await self._emit_event(
                    EventType.TASK_FAILED,
                    "system",
                    {"task_id": task.id, "error": task.error},
                )

    def _get_agent_for_task(self, task: Task) -> BaseAgent | None:
        """Get the appropriate agent for a task."""
        if task.assigned_role and task.assigned_role in self.agents:
            return self.agents[task.assigned_role]
        # Fallback to operator
        return self.agents.get(AgentRole.OPERATOR)

    def _build_context(self, task: Task) -> dict[str, Any]:
        """Build the context dict passed to an agent for a specific task."""
        completed_tasks = [
            {"id": t.id, "title": t.title, "result": t.result}
            for t in self.tasks.values()
            if t.status == TaskStatus.COMPLETED
        ]

        return {
            "scenario_summary": self.compiled.scenario_summary,
            "goals": self.compiled.goals,
            "constraints": self.compiled.constraints,
            "assumptions": self.compiled.assumptions,
            "risks": [r.model_dump(mode="json") for r in self.compiled.risks],
            "safety_flags": self.compiled.safety_flags,
            "current_task": {
                "id": task.id,
                "title": task.title,
                "description": task.description,
                "risk_level": task.risk_level.value,
                "dependencies": task.dependencies,
            },
            "all_tasks": [
                {"id": t.id, "title": t.title, "status": t.status.value}
                for t in self.tasks.values()
            ],
            "completed_tasks": completed_tasks,
            "task_results": self.task_results,
            "task_dependencies_met": True,
            "architect_design": self.architect_design,
            "analyst_findings": self.analyst_findings,
            "guardian_findings": self.guardian_findings[-5:] if self.guardian_findings else {},
            "prior_guardian_findings": self.guardian_findings[-5:],
            "all_agent_outputs": {
                role.value: agent.actions_taken for role, agent in self.agents.items()
            },
            "current_phase": self._current_phase(),
            "progress": self._calculate_progress(),
            "mode": self.mode.value,
            "elapsed_time": f"{time.monotonic() - self._start_time:.0f}s",
            "recent_events": [
                {"type": e.event_type.value, "actor": e.actor}
                for e in self.events[-5:]
            ],
            "agent_states": {
                role.value: agent.state.value for role, agent in self.agents.items()
            },
            "active_tasks": [
                {"id": t.id, "title": t.title}
                for t in self.tasks.values()
                if t.status == TaskStatus.IN_PROGRESS
            ],
            "pending_gates": [
                {"id": g.id, "title": g.title}
                for g in self.gates.values()
                if g.status == GateStatus.PENDING
            ],
            "prior_narratives": self.narratives[-3:],
            "blockers": [
                {"task_id": t.id, "error": t.error}
                for t in self.tasks.values()
                if t.status == TaskStatus.BLOCKED
            ],
            "pending_decisions": [
                {"id": g.id, "title": g.title}
                for g in self.gates.values()
                if g.status == GateStatus.PENDING
            ],
            "completed_gates": [
                {"id": g.id, "title": g.title, "selected": g.selected_option}
                for g in self.gates.values()
                if g.status == GateStatus.RESOLVED
            ],
            "proposed_action": {},
        }

    def _calculate_progress(self) -> float:
        """Calculate overall simulation progress (0.0-1.0)."""
        total = len(self.tasks)
        if total == 0:
            return 1.0
        terminal = {TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.SKIPPED}
        done = sum(1 for t in self.tasks.values() if t.status in terminal)
        return round(done / total, 2)

    def _current_phase(self) -> str:
        """Determine the current phase based on task progress."""
        progress = self._calculate_progress()
        if progress < 0.25:
            return "Planning & Design"
        elif progress < 0.5:
            return "Early Execution"
        elif progress < 0.75:
            return "Mid Execution"
        elif progress < 1.0:
            return "Late Execution"
        else:
            return "Completion"

    async def _emit_event(
        self,
        event_type: EventType,
        actor: str,
        payload: dict[str, Any],
    ) -> None:
        """Emit a run event to Firestore."""
        event = RunEvent(
            run_id=self.run_id,
            sequence=self.event_sequence,
            event_type=event_type,
            actor=actor,
            payload=payload,
        )
        self.event_sequence += 1
        self.events.append(event)

        try:
            await self.firestore.add_subcollection_doc(
                "runs",
                self.run_id,
                "events",
                event.model_dump(mode="json"),
                doc_id=event.id,
            )
        except Exception as e:
            logger.error("Failed to persist event %s: %s", event.id, e)

    async def _persist_task(self, task: Task) -> None:
        """Persist task state to Firestore."""
        try:
            await self.firestore.update_subcollection_doc(
                "runs",
                self.run_id,
                "tasks",
                task.id,
                task.model_dump(mode="json"),
            )
        except Exception as e:
            logger.error("Failed to persist task %s: %s", task.id, e)

    async def _update_run_status(self, status: RunStatus, phase: str) -> None:
        """Update run status and phase in Firestore."""
        update_data: dict[str, Any] = {
            "status": status.value,
            "current_phase": phase,
        }
        if status == RunStatus.RUNNING and not self._start_time:
            update_data["started_at"] = datetime.utcnow().isoformat()
        if status in (RunStatus.COMPLETED, RunStatus.FAILED):
            update_data["completed_at"] = datetime.utcnow().isoformat()
            update_data["progress"] = self._calculate_progress()

        try:
            await self.firestore.update_document("runs", self.run_id, update_data)
        except Exception as e:
            logger.error("Failed to update run status for %s: %s", self.run_id, e)
