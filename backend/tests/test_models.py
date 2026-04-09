"""Tests for Pydantic v2 models in The Machine of Maybe.

Validates that all models can be instantiated with valid data, reject
invalid data with ValidationError, and enum values are correct.
"""

from __future__ import annotations

import uuid
from datetime import datetime

import pytest
from pydantic import ValidationError

from app.models.entities import (
    Agent,
    AgentAction,
    AgentResult,
    AgentRole,
    AgentState,
    AlternativeStrategy,
    CompiledScenario,
    CompiledTaskNode,
    CreateRunRequest,
    CreateScenarioRequest,
    DecisionGate,
    EventType,
    FeedbackRequest,
    GateOption,
    GateStatus,
    Metric,
    Outcome,
    PlanSection,
    ResolveGateRequest,
    ReviewCheckpoint,
    RiskEntry,
    RiskLevel,
    Run,
    RunEvent,
    RunStatus,
    Scenario,
    ScenarioConstraints,
    ScenarioTemplate,
    SimulationMode,
    Task,
    TaskStatus,
    TemplateCategory,
)


# ---------------------------------------------------------------------------
# Enum tests
# ---------------------------------------------------------------------------


class TestEnums:
    """Verify all enum values are correct."""

    def test_simulation_mode_values(self):
        assert SimulationMode.FULL_AUTO == "full_auto"
        assert SimulationMode.GUIDED == "guided"
        assert SimulationMode.STEP_BY_STEP == "step_by_step"

    def test_run_status_values(self):
        assert RunStatus.PENDING == "pending"
        assert RunStatus.COMPILING == "compiling"
        assert RunStatus.RUNNING == "running"
        assert RunStatus.WAITING_FOR_INPUT == "waiting_for_input"
        assert RunStatus.COMPLETED == "completed"
        assert RunStatus.FAILED == "failed"
        assert RunStatus.CANCELLED == "cancelled"

    def test_agent_role_values(self):
        assert AgentRole.ARCHITECT == "architect"
        assert AgentRole.ANALYST == "analyst"
        assert AgentRole.OPERATOR == "operator"
        assert AgentRole.GUARDIAN == "guardian"
        assert AgentRole.ESCALATION_LEAD == "escalation_lead"
        assert AgentRole.NARRATOR == "narrator"

    def test_agent_state_values(self):
        assert AgentState.IDLE == "idle"
        assert AgentState.THINKING == "thinking"
        assert AgentState.ACTING == "acting"
        assert AgentState.WAITING == "waiting"
        assert AgentState.DONE == "done"
        assert AgentState.ERROR == "error"

    def test_task_status_values(self):
        assert TaskStatus.PENDING == "pending"
        assert TaskStatus.IN_PROGRESS == "in_progress"
        assert TaskStatus.BLOCKED == "blocked"
        assert TaskStatus.COMPLETED == "completed"
        assert TaskStatus.FAILED == "failed"
        assert TaskStatus.SKIPPED == "skipped"

    def test_risk_level_values(self):
        assert RiskLevel.LOW == "low"
        assert RiskLevel.MEDIUM == "medium"
        assert RiskLevel.HIGH == "high"
        assert RiskLevel.CRITICAL == "critical"

    def test_event_type_values(self):
        assert EventType.AGENT_THINKING == "agent_thinking"
        assert EventType.AGENT_ACTION == "agent_action"
        assert EventType.TASK_STARTED == "task_started"
        assert EventType.TASK_COMPLETED == "task_completed"
        assert EventType.TASK_FAILED == "task_failed"
        assert EventType.RISK_DETECTED == "risk_detected"
        assert EventType.GATE_CREATED == "gate_created"
        assert EventType.GATE_RESOLVED == "gate_resolved"
        assert EventType.NARRATIVE_UPDATE == "narrative_update"
        assert EventType.RUN_STATUS_CHANGED == "run_status_changed"
        assert EventType.ERROR == "error"

    def test_gate_status_values(self):
        assert GateStatus.PENDING == "pending"
        assert GateStatus.RESOLVED == "resolved"
        assert GateStatus.TIMED_OUT == "timed_out"
        assert GateStatus.AUTO_RESOLVED == "auto_resolved"

    def test_template_category_values(self):
        assert TemplateCategory.BUSINESS == "business"
        assert TemplateCategory.ENGINEERING == "engineering"
        assert TemplateCategory.CRISIS == "crisis"
        assert TemplateCategory.LOGISTICS == "logistics"
        assert TemplateCategory.HEALTHCARE == "healthcare"
        assert TemplateCategory.CREATIVE == "creative"


# ---------------------------------------------------------------------------
# Model instantiation tests
# ---------------------------------------------------------------------------


class TestScenarioConstraints:
    """Test ScenarioConstraints model."""

    def test_defaults(self):
        c = ScenarioConstraints()
        assert c.time_pressure is None
        assert c.budget is None
        assert c.team_size is None
        assert c.risk_tolerance == RiskLevel.MEDIUM
        assert c.custom is None

    def test_full(self):
        c = ScenarioConstraints(
            time_pressure="2 hours",
            budget="$10,000",
            team_size=5,
            risk_tolerance=RiskLevel.HIGH,
            custom={"region": "us-east"},
        )
        assert c.time_pressure == "2 hours"
        assert c.budget == "$10,000"
        assert c.team_size == 5
        assert c.custom == {"region": "us-east"}

    def test_team_size_bounds(self):
        with pytest.raises(ValidationError):
            ScenarioConstraints(team_size=0)
        with pytest.raises(ValidationError):
            ScenarioConstraints(team_size=101)


class TestScenario:
    """Test Scenario model."""

    def test_valid_scenario(self):
        s = Scenario(prompt="Plan a product launch for our new AI tool in Q3")
        assert len(s.id) > 0
        assert s.prompt == "Plan a product launch for our new AI tool in Q3"
        assert isinstance(s.constraints, ScenarioConstraints)
        assert isinstance(s.created_at, datetime)
        assert s.moderated is False

    def test_prompt_too_short(self):
        with pytest.raises(ValidationError):
            Scenario(prompt="short")

    def test_prompt_too_long(self):
        with pytest.raises(ValidationError):
            Scenario(prompt="x" * 5001)


class TestCreateScenarioRequest:
    """Test CreateScenarioRequest model."""

    def test_valid(self):
        r = CreateScenarioRequest(
            prompt="Launch a new product line for enterprise customers"
        )
        assert r.prompt == "Launch a new product line for enterprise customers"
        assert isinstance(r.constraints, ScenarioConstraints)

    def test_with_constraints(self):
        r = CreateScenarioRequest(
            prompt="Launch a new product line for enterprise customers",
            constraints=ScenarioConstraints(budget="$50,000"),
        )
        assert r.constraints.budget == "$50,000"


class TestRun:
    """Test Run model."""

    def test_defaults(self):
        r = Run(scenario_id="sc-123")
        assert r.scenario_id == "sc-123"
        assert r.status == RunStatus.PENDING
        assert r.mode == SimulationMode.GUIDED
        assert r.progress == 0.0
        assert r.event_count == 0

    def test_progress_bounds(self):
        with pytest.raises(ValidationError):
            Run(scenario_id="sc-123", progress=-0.1)
        with pytest.raises(ValidationError):
            Run(scenario_id="sc-123", progress=1.1)


class TestCreateRunRequest:
    """Test CreateRunRequest model."""

    def test_valid(self):
        r = CreateRunRequest(scenario_id="sc-123")
        assert r.mode == SimulationMode.GUIDED

    def test_full_auto(self):
        r = CreateRunRequest(
            scenario_id="sc-123", mode=SimulationMode.FULL_AUTO
        )
        assert r.mode == SimulationMode.FULL_AUTO


class TestAgent:
    """Test Agent model."""

    def test_valid(self):
        a = Agent(
            run_id="run-123",
            role=AgentRole.ARCHITECT,
            name="Architect",
        )
        assert a.state == AgentState.IDLE
        assert a.actions_taken == 0
        assert a.current_task_id is None


class TestTask:
    """Test Task model."""

    def test_valid(self):
        t = Task(
            run_id="run-123",
            title="Design system architecture",
            description="Create the high-level system design.",
        )
        assert t.status == TaskStatus.PENDING
        assert t.risk_level == RiskLevel.LOW
        assert t.retry_count == 0
        assert t.dependencies == []

    def test_with_dependencies(self):
        t = Task(
            run_id="run-123",
            title="Implement auth",
            description="Build authentication module.",
            dependencies=["task-1", "task-2"],
            risk_level=RiskLevel.HIGH,
        )
        assert len(t.dependencies) == 2
        assert t.risk_level == RiskLevel.HIGH


class TestRunEvent:
    """Test RunEvent model."""

    def test_valid(self):
        e = RunEvent(
            run_id="run-123",
            sequence=0,
            event_type=EventType.AGENT_THINKING,
            actor="Architect",
            payload={"task_id": "task-1"},
        )
        assert e.sequence == 0
        assert e.event_type == EventType.AGENT_THINKING

    def test_sequence_non_negative(self):
        with pytest.raises(ValidationError):
            RunEvent(
                run_id="run-123",
                sequence=-1,
                event_type=EventType.ERROR,
            )


class TestDecisionGate:
    """Test DecisionGate model."""

    def test_valid(self):
        g = DecisionGate(
            run_id="run-123",
            title="Approve budget increase",
            description="The project needs an additional $10K.",
            options=[
                GateOption(
                    label="Approve",
                    description="Approve the additional budget.",
                    pros=["Keeps project on track"],
                    cons=["Higher cost"],
                ),
                GateOption(
                    label="Deny",
                    description="Deny the additional budget.",
                    pros=["Cost savings"],
                    cons=["Project delays"],
                    risk=RiskLevel.HIGH,
                ),
            ],
        )
        assert g.status == GateStatus.PENDING
        assert len(g.options) == 2


class TestGateOption:
    """Test GateOption model."""

    def test_defaults(self):
        o = GateOption(label="Proceed", description="Continue as planned.")
        assert o.pros == []
        assert o.cons == []
        assert o.risk == RiskLevel.LOW


class TestResolveGateRequest:
    """Test ResolveGateRequest model."""

    def test_valid(self):
        r = ResolveGateRequest(
            gate_id="gate-123",
            selected_option="Approve",
            reasoning="Budget is justified.",
        )
        assert r.selected_option == "Approve"

    def test_missing_selected_option(self):
        with pytest.raises(ValidationError):
            ResolveGateRequest(gate_id="gate-123")


class TestOutcome:
    """Test Outcome model."""

    def test_valid(self):
        o = Outcome(
            run_id="run-123",
            summary="Simulation completed successfully.",
            success_score=0.85,
        )
        assert o.success_score == 0.85
        assert o.plan_sections == []
        assert o.lessons_learned == []

    def test_success_score_bounds(self):
        with pytest.raises(ValidationError):
            Outcome(run_id="run-123", summary="x", success_score=1.5)
        with pytest.raises(ValidationError):
            Outcome(run_id="run-123", summary="x", success_score=-0.1)


class TestPlanSection:
    """Test PlanSection model."""

    def test_valid(self):
        p = PlanSection(
            title="Design Phase",
            description="Architect designed the system.",
            tasks_completed=3,
            tasks_total=4,
        )
        assert p.success is True


class TestRiskEntry:
    """Test RiskEntry model."""

    def test_valid(self):
        r = RiskEntry(
            title="Supplier risk",
            level=RiskLevel.HIGH,
            description="Single point of failure in supply chain.",
        )
        assert r.materialized is False


class TestReviewCheckpoint:
    """Test ReviewCheckpoint model."""

    def test_valid(self):
        rc = ReviewCheckpoint(
            title="Go/No-Go Decision",
            description="Final launch approval.",
            decision_made="Go",
            rationale="All metrics met.",
        )
        assert rc.impact is None


class TestAlternativeStrategy:
    """Test AlternativeStrategy model."""

    def test_valid(self):
        a = AlternativeStrategy(
            title="Phased Rollout",
            description="Launch to 10% of users first.",
            pros=["Lower risk"],
            cons=["Slower time to market"],
            estimated_success=0.7,
        )
        assert a.estimated_success == 0.7

    def test_success_bounds(self):
        with pytest.raises(ValidationError):
            AlternativeStrategy(
                title="x",
                description="x",
                estimated_success=1.5,
            )


class TestMetric:
    """Test Metric model."""

    def test_valid(self):
        m = Metric(
            name="Tasks Completed",
            value=8.0,
            unit="tasks",
            target=10.0,
            met_target=False,
        )
        assert m.met_target is False

    def test_minimal(self):
        m = Metric(name="Score", value=0.95)
        assert m.unit is None
        assert m.target is None


class TestScenarioTemplate:
    """Test ScenarioTemplate model."""

    def test_valid(self):
        t = ScenarioTemplate(
            title="Startup Launch",
            description="Plan a product launch.",
            category=TemplateCategory.BUSINESS,
            prompt="Launch a new SaaS product for enterprise.",
        )
        assert t.difficulty == "medium"
        assert t.tags == []


class TestFeedbackRequest:
    """Test FeedbackRequest model."""

    def test_valid(self):
        f = FeedbackRequest(
            run_id="run-123",
            rating=5,
            comment="Great simulation!",
        )
        assert f.rating == 5

    def test_rating_too_low(self):
        with pytest.raises(ValidationError):
            FeedbackRequest(run_id="run-123", rating=0)

    def test_rating_too_high(self):
        with pytest.raises(ValidationError):
            FeedbackRequest(run_id="run-123", rating=6)

    def test_comment_too_long(self):
        with pytest.raises(ValidationError):
            FeedbackRequest(
                run_id="run-123",
                rating=3,
                comment="x" * 2001,
            )


class TestCompiledTaskNode:
    """Test CompiledTaskNode model."""

    def test_valid(self):
        n = CompiledTaskNode(
            title="Design API",
            description="Design the REST API surface.",
            assigned_role=AgentRole.ARCHITECT,
        )
        assert n.dependencies == []
        assert n.acceptance_criteria == []
        assert n.risk_level == RiskLevel.LOW


class TestCompiledScenario:
    """Test CompiledScenario model."""

    def test_valid(self):
        cs = CompiledScenario(
            scenario_summary="Launch a SaaS product.",
            domain="business",
            scenario_type="planning",
            goals=["Launch on time", "Stay under budget"],
        )
        assert cs.confidence == 0.5
        assert cs.task_graph == []
        assert cs.safety_flags == []

    def test_confidence_bounds(self):
        with pytest.raises(ValidationError):
            CompiledScenario(
                scenario_summary="x",
                domain="x",
                scenario_type="x",
                goals=["x"],
                confidence=1.5,
            )


class TestAgentAction:
    """Test AgentAction model."""

    def test_valid(self):
        a = AgentAction(
            action_type="execute_task",
            target_task_id="task-1",
            reasoning="This task is next in the DAG.",
        )
        assert a.details == {}

    def test_missing_action_type(self):
        with pytest.raises(ValidationError):
            AgentAction()


class TestAgentResult:
    """Test AgentResult model."""

    def test_success(self):
        r = AgentResult(
            success=True,
            output={"design": "microservices architecture"},
            duration_seconds=2.5,
        )
        assert r.error is None

    def test_failure(self):
        r = AgentResult(
            success=False,
            error="LLM timeout",
            duration_seconds=30.0,
        )
        assert r.output == {}
