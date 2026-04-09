"""Pydantic v2 models for The Machine of Maybe.

These mirror the TypeScript types defined in the frontend and serve as the
single source of truth for all API request/response shapes, Firestore
document schemas, and inter-service contracts.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class SimulationMode(StrEnum):
    """How the simulation executes."""

    FULL_AUTO = "full_auto"
    GUIDED = "guided"
    STEP_BY_STEP = "step_by_step"


class RunStatus(StrEnum):
    """Lifecycle states of a simulation run."""

    PENDING = "pending"
    COMPILING = "compiling"
    RUNNING = "running"
    WAITING_FOR_INPUT = "waiting_for_input"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentRole(StrEnum):
    """The fixed roster of agent roles."""

    ARCHITECT = "architect"
    ANALYST = "analyst"
    OPERATOR = "operator"
    GUARDIAN = "guardian"
    ESCALATION_LEAD = "escalation_lead"
    NARRATOR = "narrator"


class AgentState(StrEnum):
    """Current activity state of an agent."""

    IDLE = "idle"
    THINKING = "thinking"
    ACTING = "acting"
    WAITING = "waiting"
    DONE = "done"
    ERROR = "error"


class TaskStatus(StrEnum):
    """Lifecycle states of a task."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class RiskLevel(StrEnum):
    """Severity rating for risks."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EventType(StrEnum):
    """Types of events emitted during a simulation run."""

    AGENT_THINKING = "agent_thinking"
    AGENT_ACTION = "agent_action"
    TASK_STARTED = "task_started"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    RISK_DETECTED = "risk_detected"
    GATE_CREATED = "gate_created"
    GATE_RESOLVED = "gate_resolved"
    NARRATIVE_UPDATE = "narrative_update"
    RUN_STATUS_CHANGED = "run_status_changed"
    ERROR = "error"


class GateStatus(StrEnum):
    """Lifecycle states of a decision gate."""

    PENDING = "pending"
    RESOLVED = "resolved"
    TIMED_OUT = "timed_out"
    AUTO_RESOLVED = "auto_resolved"


class TemplateCategory(StrEnum):
    """Categories for scenario templates."""

    BUSINESS = "business"
    ENGINEERING = "engineering"
    CRISIS = "crisis"
    LOGISTICS = "logistics"
    HEALTHCARE = "healthcare"
    CREATIVE = "creative"


# ---------------------------------------------------------------------------
# Core Models
# ---------------------------------------------------------------------------


class ScenarioConstraints(BaseModel):
    """User-specified constraints that shape how the scenario is compiled."""

    time_pressure: str | None = Field(
        default=None,
        description="Time constraint, e.g. '2 hours', '1 week', 'urgent'.",
    )
    budget: str | None = Field(
        default=None,
        description="Budget constraint, e.g. '$10,000', 'minimal'.",
    )
    team_size: int | None = Field(
        default=None,
        ge=1,
        le=100,
        description="Maximum team/agent count.",
    )
    risk_tolerance: RiskLevel = Field(
        default=RiskLevel.MEDIUM,
        description="How much risk is acceptable.",
    )
    custom: dict[str, Any] | None = Field(
        default=None,
        description="Arbitrary additional constraints.",
    )


class Scenario(BaseModel):
    """A user-submitted scenario that will be compiled and executed."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    prompt: str = Field(
        ...,
        min_length=10,
        max_length=5000,
        description="The raw user prompt describing the scenario.",
    )
    constraints: ScenarioConstraints = Field(default_factory=ScenarioConstraints)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    moderated: bool = Field(default=False)
    moderation_note: str | None = None

    model_config = {"from_attributes": True}


class CreateScenarioRequest(BaseModel):
    """Request body for creating a new scenario."""

    prompt: str = Field(
        ...,
        min_length=10,
        max_length=5000,
        description="Describe your scenario in plain language.",
    )
    constraints: ScenarioConstraints = Field(default_factory=ScenarioConstraints)


class Run(BaseModel):
    """A simulation run — one execution of a compiled scenario."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    scenario_id: str
    status: RunStatus = RunStatus.PENDING
    mode: SimulationMode = SimulationMode.GUIDED
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    current_phase: str | None = None
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    error: str | None = None
    event_count: int = Field(default=0, ge=0)

    model_config = {"from_attributes": True}


class CreateRunRequest(BaseModel):
    """Request body for starting a new simulation run."""

    scenario_id: str
    mode: SimulationMode = SimulationMode.GUIDED


class Agent(BaseModel):
    """An agent instance within a simulation run."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    run_id: str
    role: AgentRole
    name: str
    state: AgentState = AgentState.IDLE
    current_task_id: str | None = None
    actions_taken: int = Field(default=0, ge=0)
    last_action_at: datetime | None = None

    model_config = {"from_attributes": True}


class Task(BaseModel):
    """A discrete unit of work within a simulation run."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    run_id: str
    title: str
    description: str
    status: TaskStatus = TaskStatus.PENDING
    assigned_role: AgentRole | None = None
    assigned_agent_id: str | None = None
    dependencies: list[str] = Field(default_factory=list)
    risk_level: RiskLevel = RiskLevel.LOW
    estimated_duration: str | None = None
    result: str | None = None
    error: str | None = None
    retry_count: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class RunEvent(BaseModel):
    """An event emitted during a simulation run, streamed to the frontend."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    run_id: str
    sequence: int = Field(..., ge=0)
    event_type: EventType
    actor: str | None = Field(
        default=None,
        description="Agent name or 'system'.",
    )
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"from_attributes": True}


class GateOption(BaseModel):
    """One option presented to the user at a decision gate."""

    label: str
    description: str
    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)
    risk: RiskLevel = RiskLevel.LOW


class DecisionGate(BaseModel):
    """A point where human input is required to proceed."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    run_id: str
    title: str
    description: str
    status: GateStatus = GateStatus.PENDING
    options: list[GateOption] = Field(default_factory=list)
    recommendation: str | None = None
    urgency: RiskLevel = RiskLevel.MEDIUM
    impact_of_delay: str | None = None
    selected_option: str | None = None
    resolved_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    blocking_task_ids: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ResolveGateRequest(BaseModel):
    """Request body for resolving a decision gate."""

    gate_id: str
    selected_option: str = Field(
        ...,
        description="The label of the chosen option.",
    )
    reasoning: str | None = Field(
        default=None,
        description="Optional human reasoning for the choice.",
    )


# ---------------------------------------------------------------------------
# Outcome Models
# ---------------------------------------------------------------------------


class PlanSection(BaseModel):
    """A section of the final execution plan / outcome report."""

    title: str
    description: str
    tasks_completed: int = 0
    tasks_total: int = 0
    success: bool = True
    notes: str | None = None


class RiskEntry(BaseModel):
    """A risk that was identified or materialized during the run."""

    title: str
    level: RiskLevel
    description: str
    materialized: bool = False
    mitigation: str | None = None


class ReviewCheckpoint(BaseModel):
    """A decision point and its outcome in the final report."""

    title: str
    description: str
    decision_made: str
    rationale: str
    impact: str | None = None


class AlternativeStrategy(BaseModel):
    """An alternative approach that could have been taken."""

    title: str
    description: str
    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)
    estimated_success: float = Field(ge=0.0, le=1.0)


class Metric(BaseModel):
    """A quantified performance metric from the simulation."""

    name: str
    value: float
    unit: str | None = None
    target: float | None = None
    met_target: bool | None = None


class Outcome(BaseModel):
    """The final outcome/report of a completed simulation run."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    run_id: str
    summary: str
    success_score: float = Field(ge=0.0, le=1.0)
    plan_sections: list[PlanSection] = Field(default_factory=list)
    risks_encountered: list[RiskEntry] = Field(default_factory=list)
    review_checkpoints: list[ReviewCheckpoint] = Field(default_factory=list)
    alternative_strategies: list[AlternativeStrategy] = Field(default_factory=list)
    metrics: list[Metric] = Field(default_factory=list)
    lessons_learned: list[str] = Field(default_factory=list)
    narrative_arc: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


class ScenarioTemplate(BaseModel):
    """A pre-built scenario template for quick starts."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    category: TemplateCategory
    prompt: str
    constraints: ScenarioConstraints = Field(default_factory=ScenarioConstraints)
    difficulty: str = Field(default="medium")
    estimated_duration: str | None = None
    tags: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------


class FeedbackRequest(BaseModel):
    """User feedback on a simulation run."""

    run_id: str
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)
    useful_features: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, v: int) -> int:
        if not 1 <= v <= 5:
            raise ValueError("Rating must be between 1 and 5")
        return v


# ---------------------------------------------------------------------------
# Internal / Compiler Models
# ---------------------------------------------------------------------------


class CompiledTaskNode(BaseModel):
    """A single node in the compiled task DAG."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    assigned_role: AgentRole
    dependencies: list[str] = Field(default_factory=list)
    estimated_duration: str | None = None
    risk_level: RiskLevel = RiskLevel.LOW
    acceptance_criteria: list[str] = Field(default_factory=list)


class CompiledScenario(BaseModel):
    """The output of the scenario compiler -- a fully structured specification."""

    scenario_summary: str
    domain: str
    scenario_type: str
    goals: list[str]
    subgoals: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    risks: list[RiskEntry] = Field(default_factory=list)
    task_graph: list[CompiledTaskNode] = Field(default_factory=list)
    required_roles: list[AgentRole] = Field(default_factory=list)
    human_review_points: list[str] = Field(default_factory=list)
    success_metrics: list[str] = Field(default_factory=list)
    safety_flags: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Agent Action / Result (used internally by agent runtime)
# ---------------------------------------------------------------------------


class AgentAction(BaseModel):
    """A structured action produced by an agent's think() step."""

    action_type: str = Field(
        ...,
        description="Type of action: 'execute_task', 'review', 'escalate', 'narrate', 'design'.",
    )
    target_task_id: str | None = None
    reasoning: str = ""
    details: dict[str, Any] = Field(default_factory=dict)


class AgentResult(BaseModel):
    """The result of an agent's act() step."""

    success: bool
    output: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    duration_seconds: float = 0.0
