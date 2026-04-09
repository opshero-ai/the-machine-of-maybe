"""Concrete agent role implementations for The Machine of Maybe.

Each agent role has a unique system prompt, voice, and context-scoping
behavior. All inherit from BaseAgent and override think() to focus on
their specific responsibilities.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.models.entities import AgentAction, AgentRole
from app.prompts.system_prompts import (
    ANALYST_SYSTEM_PROMPT,
    ARCHITECT_SYSTEM_PROMPT,
    ESCALATION_LEAD_SYSTEM_PROMPT,
    GUARDIAN_SYSTEM_PROMPT,
    NARRATOR_SYSTEM_PROMPT,
    OPERATOR_SYSTEM_PROMPT,
)
from app.services.agents.base import BaseAgent

logger = logging.getLogger(__name__)


class ArchitectAgent(BaseAgent):
    """Translates scenario specifications into operational designs.

    Focuses on system boundaries, interfaces, data flows, integration
    points, resilience, and phased rollout strategies.
    """

    def __init__(self, run_id: str) -> None:
        super().__init__(
            role=AgentRole.ARCHITECT,
            name="Architect",
            run_id=run_id,
            system_prompt=ARCHITECT_SYSTEM_PROMPT,
            capabilities=[
                "operational_design",
                "system_architecture",
                "integration_planning",
                "failure_mode_analysis",
                "phased_rollout",
            ],
        )

    async def think(self, context: dict[str, Any]) -> AgentAction:
        """Architect-specific thinking: focus on design and structure.

        Scopes context to include scenario goals, constraints, current
        design state, and analyst findings. Filters out execution-level
        details that are not relevant to architectural decisions.
        """
        scoped_context = {
            "scenario_summary": context.get("scenario_summary", ""),
            "goals": context.get("goals", []),
            "constraints": context.get("constraints", []),
            "current_task": context.get("current_task", {}),
            "completed_tasks": context.get("completed_tasks", []),
            "analyst_findings": context.get("analyst_findings", {}),
            "risks": context.get("risks", []),
            "phase": context.get("current_phase", "design"),
        }
        return await super().think(scoped_context)

    def _format_context(self, context: dict[str, Any]) -> str:
        """Architect sees the big picture with emphasis on structure."""
        parts = [
            f"SCENARIO: {context.get('scenario_summary', 'N/A')}",
            f"GOALS: {json.dumps(context.get('goals', []), default=str)}",
            f"CONSTRAINTS: {json.dumps(context.get('constraints', []), default=str)}",
            f"CURRENT PHASE: {context.get('phase', 'N/A')}",
        ]
        if context.get("current_task"):
            parts.append(f"YOUR TASK: {json.dumps(context['current_task'], default=str)}")
        if context.get("analyst_findings"):
            parts.append(f"ANALYST INPUT: {json.dumps(context['analyst_findings'], default=str)}")
        if context.get("risks"):
            parts.append(f"KNOWN RISKS: {json.dumps(context['risks'], default=str)}")
        return "\n\n".join(parts)


class AnalystAgent(BaseAgent):
    """Identifies dependencies, edge cases, data needs, and risks.

    Provides quantitative analysis, dependency mapping, and sensitivity
    assessments to inform other agents' decisions.
    """

    def __init__(self, run_id: str) -> None:
        super().__init__(
            role=AgentRole.ANALYST,
            name="Analyst",
            run_id=run_id,
            system_prompt=ANALYST_SYSTEM_PROMPT,
            capabilities=[
                "dependency_analysis",
                "risk_assessment",
                "edge_case_detection",
                "data_requirements",
                "sensitivity_analysis",
                "bottleneck_identification",
            ],
        )

    async def think(self, context: dict[str, Any]) -> AgentAction:
        """Analyst-specific thinking: focus on data, dependencies, and risks.

        Scopes context to include all available data, task dependencies,
        and outcomes from completed tasks for quantitative analysis.
        """
        scoped_context = {
            "scenario_summary": context.get("scenario_summary", ""),
            "goals": context.get("goals", []),
            "current_task": context.get("current_task", {}),
            "all_tasks": context.get("all_tasks", []),
            "completed_tasks": context.get("completed_tasks", []),
            "task_results": context.get("task_results", {}),
            "risks": context.get("risks", []),
            "assumptions": context.get("assumptions", []),
            "architect_design": context.get("architect_design", {}),
        }
        return await super().think(scoped_context)

    def _format_context(self, context: dict[str, Any]) -> str:
        """Analyst sees everything with emphasis on data and dependencies."""
        parts = [
            f"SCENARIO: {context.get('scenario_summary', 'N/A')}",
            f"ALL TASKS: {json.dumps(context.get('all_tasks', []), default=str)}",
            f"COMPLETED: {json.dumps(context.get('completed_tasks', []), default=str)}",
            f"TASK RESULTS: {json.dumps(context.get('task_results', {}), default=str)}",
        ]
        if context.get("current_task"):
            parts.append(f"YOUR TASK: {json.dumps(context['current_task'], default=str)}")
        if context.get("risks"):
            parts.append(f"KNOWN RISKS: {json.dumps(context['risks'], default=str)}")
        if context.get("assumptions"):
            parts.append(f"ASSUMPTIONS: {json.dumps(context['assumptions'], default=str)}")
        return "\n\n".join(parts)


class OperatorAgent(BaseAgent):
    """Turns strategy into concrete task execution.

    Focuses on breaking down tasks, estimating resources, tracking progress,
    and reporting status. The workhorse of the simulation.
    """

    def __init__(self, run_id: str) -> None:
        super().__init__(
            role=AgentRole.OPERATOR,
            name="Operator",
            run_id=run_id,
            system_prompt=OPERATOR_SYSTEM_PROMPT,
            capabilities=[
                "task_execution",
                "resource_estimation",
                "progress_tracking",
                "blocker_identification",
                "workaround_planning",
                "parallel_coordination",
            ],
        )

    async def think(self, context: dict[str, Any]) -> AgentAction:
        """Operator-specific thinking: focus on execution and progress.

        Scopes context to the current task, its dependencies, available
        resources, and any blockers. Does not need high-level strategy.
        """
        scoped_context = {
            "current_task": context.get("current_task", {}),
            "task_dependencies_met": context.get("task_dependencies_met", True),
            "completed_tasks": context.get("completed_tasks", []),
            "task_results": context.get("task_results", {}),
            "blockers": context.get("blockers", []),
            "constraints": context.get("constraints", []),
            "architect_design": context.get("architect_design", {}),
            "elapsed_time": context.get("elapsed_time", "unknown"),
        }
        return await super().think(scoped_context)

    def _format_context(self, context: dict[str, Any]) -> str:
        """Operator sees execution details and blockers."""
        parts = []
        if context.get("current_task"):
            parts.append(f"YOUR TASK: {json.dumps(context['current_task'], default=str)}")
        parts.append(f"DEPENDENCIES MET: {context.get('task_dependencies_met', True)}")
        if context.get("blockers"):
            parts.append(f"BLOCKERS: {json.dumps(context['blockers'], default=str)}")
        if context.get("task_results"):
            parts.append(f"PRIOR RESULTS: {json.dumps(context['task_results'], default=str)}")
        if context.get("constraints"):
            parts.append(f"CONSTRAINTS: {json.dumps(context['constraints'], default=str)}")
        return "\n\n".join(parts)


class GuardianAgent(BaseAgent):
    """Checks risk, policy, safety, and ethical boundaries.

    Reviews every proposed action and can veto or require modifications.
    Has elevated authority to block unsafe actions.
    """

    def __init__(self, run_id: str) -> None:
        super().__init__(
            role=AgentRole.GUARDIAN,
            name="Guardian",
            run_id=run_id,
            system_prompt=GUARDIAN_SYSTEM_PROMPT,
            capabilities=[
                "risk_assessment",
                "policy_enforcement",
                "safety_review",
                "ethical_evaluation",
                "veto_authority",
                "safeguard_design",
            ],
        )

    async def think(self, context: dict[str, Any]) -> AgentAction:
        """Guardian-specific thinking: focus on risk and safety.

        Scopes context to include the proposed action, relevant risks,
        policy constraints, and any prior guardian findings. Gets full
        visibility into what other agents want to do.
        """
        scoped_context = {
            "scenario_summary": context.get("scenario_summary", ""),
            "proposed_action": context.get("proposed_action", {}),
            "current_task": context.get("current_task", {}),
            "risks": context.get("risks", []),
            "constraints": context.get("constraints", []),
            "safety_flags": context.get("safety_flags", []),
            "prior_guardian_findings": context.get("prior_guardian_findings", []),
            "all_agent_outputs": context.get("all_agent_outputs", {}),
        }
        return await super().think(scoped_context)

    def _format_context(self, context: dict[str, Any]) -> str:
        """Guardian sees everything through a risk/safety lens."""
        parts = [
            f"SCENARIO: {context.get('scenario_summary', 'N/A')}",
        ]
        if context.get("proposed_action"):
            parts.append(
                f"PROPOSED ACTION TO REVIEW: {json.dumps(context['proposed_action'], default=str)}"
            )
        if context.get("current_task"):
            parts.append(f"CURRENT TASK: {json.dumps(context['current_task'], default=str)}")
        if context.get("risks"):
            parts.append(f"KNOWN RISKS: {json.dumps(context['risks'], default=str)}")
        if context.get("safety_flags"):
            parts.append(f"SAFETY FLAGS: {json.dumps(context['safety_flags'], default=str)}")
        if context.get("constraints"):
            parts.append(f"POLICY CONSTRAINTS: {json.dumps(context['constraints'], default=str)}")
        return "\n\n".join(parts)


class EscalationLeadAgent(BaseAgent):
    """Determines when human approval or intervention is needed.

    Monitors the simulation for high-stakes decisions, frames them
    clearly for non-expert reviewers, and presents options.
    """

    def __init__(self, run_id: str) -> None:
        super().__init__(
            role=AgentRole.ESCALATION_LEAD,
            name="Escalation Lead",
            run_id=run_id,
            system_prompt=ESCALATION_LEAD_SYSTEM_PROMPT,
            capabilities=[
                "decision_framing",
                "urgency_assessment",
                "option_analysis",
                "human_interface",
                "impact_evaluation",
                "gate_creation",
            ],
        )

    async def think(self, context: dict[str, Any]) -> AgentAction:
        """Escalation Lead thinking: focus on decision quality and stakes.

        Reviews current state to determine if a decision gate should be
        created. Considers stakes, reversibility, uncertainty, and whether
        AI agents have sufficient context to proceed alone.
        """
        scoped_context = {
            "scenario_summary": context.get("scenario_summary", ""),
            "current_task": context.get("current_task", {}),
            "guardian_findings": context.get("guardian_findings", {}),
            "risks": context.get("risks", []),
            "pending_decisions": context.get("pending_decisions", []),
            "completed_gates": context.get("completed_gates", []),
            "progress": context.get("progress", 0.0),
            "mode": context.get("mode", "guided"),
        }
        return await super().think(scoped_context)

    def _format_context(self, context: dict[str, Any]) -> str:
        """Escalation Lead sees decision-relevant information."""
        parts = [
            f"SCENARIO: {context.get('scenario_summary', 'N/A')}",
            f"SIMULATION MODE: {context.get('mode', 'guided')}",
            f"PROGRESS: {context.get('progress', 0):.0%}",
        ]
        if context.get("current_task"):
            parts.append(f"CURRENT TASK: {json.dumps(context['current_task'], default=str)}")
        if context.get("guardian_findings"):
            parts.append(
                f"GUARDIAN FINDINGS: {json.dumps(context['guardian_findings'], default=str)}"
            )
        if context.get("risks"):
            parts.append(f"ACTIVE RISKS: {json.dumps(context['risks'], default=str)}")
        if context.get("pending_decisions"):
            parts.append(
                f"PENDING DECISIONS: {json.dumps(context['pending_decisions'], default=str)}"
            )
        return "\n\n".join(parts)


class NarratorAgent(BaseAgent):
    """Converts system state into readable, engaging explanations.

    Maintains narrative continuity, highlights interesting dynamics,
    and educates the user about orchestration concepts.
    """

    def __init__(self, run_id: str) -> None:
        super().__init__(
            role=AgentRole.NARRATOR,
            name="Narrator",
            run_id=run_id,
            system_prompt=NARRATOR_SYSTEM_PROMPT,
            capabilities=[
                "narrative_generation",
                "state_summarization",
                "insight_extraction",
                "tension_identification",
                "educational_commentary",
            ],
        )

    async def think(self, context: dict[str, Any]) -> AgentAction:
        """Narrator-specific thinking: focus on storytelling and clarity.

        Gets full visibility into all agent activities and task states
        to construct coherent narrative updates.
        """
        scoped_context = {
            "scenario_summary": context.get("scenario_summary", ""),
            "current_phase": context.get("current_phase", ""),
            "recent_events": context.get("recent_events", []),
            "agent_states": context.get("agent_states", {}),
            "completed_tasks": context.get("completed_tasks", []),
            "active_tasks": context.get("active_tasks", []),
            "pending_gates": context.get("pending_gates", []),
            "risks": context.get("risks", []),
            "progress": context.get("progress", 0.0),
            "prior_narratives": context.get("prior_narratives", []),
        }
        return await super().think(scoped_context)

    def _format_context(self, context: dict[str, Any]) -> str:
        """Narrator sees everything and distills it into narrative."""
        parts = [
            f"SCENARIO: {context.get('scenario_summary', 'N/A')}",
            f"CURRENT PHASE: {context.get('current_phase', 'N/A')}",
            f"PROGRESS: {context.get('progress', 0):.0%}",
        ]
        if context.get("recent_events"):
            parts.append(
                f"RECENT EVENTS: {json.dumps(context['recent_events'], default=str)}"
            )
        if context.get("agent_states"):
            parts.append(
                f"AGENT STATES: {json.dumps(context['agent_states'], default=str)}"
            )
        if context.get("active_tasks"):
            parts.append(
                f"ACTIVE TASKS: {json.dumps(context['active_tasks'], default=str)}"
            )
        if context.get("pending_gates"):
            parts.append(
                f"PENDING DECISIONS: {json.dumps(context['pending_gates'], default=str)}"
            )
        if context.get("prior_narratives"):
            # Only include the last 2 narratives for continuity
            recent = context["prior_narratives"][-2:]
            parts.append(f"PRIOR NARRATION: {json.dumps(recent, default=str)}")
        return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

ROLE_AGENT_MAP: dict[AgentRole, type[BaseAgent]] = {
    AgentRole.ARCHITECT: ArchitectAgent,
    AgentRole.ANALYST: AnalystAgent,
    AgentRole.OPERATOR: OperatorAgent,
    AgentRole.GUARDIAN: GuardianAgent,
    AgentRole.ESCALATION_LEAD: EscalationLeadAgent,
    AgentRole.NARRATOR: NarratorAgent,
}


def create_agent(role: AgentRole, run_id: str) -> BaseAgent:
    """Factory function to create an agent by role.

    Args:
        role: The AgentRole to instantiate.
        run_id: The simulation run ID.

    Returns:
        An initialized agent instance.

    Raises:
        ValueError: If the role is unknown.
    """
    agent_class = ROLE_AGENT_MAP.get(role)
    if agent_class is None:
        raise ValueError(f"Unknown agent role: {role}")
    return agent_class(run_id=run_id)
