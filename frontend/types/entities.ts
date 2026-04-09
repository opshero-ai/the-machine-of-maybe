// ─── Core Entity Types ─── The Machine of Maybe ───

export type SimulationMode = "play" | "explore" | "prove";
export type UrgencyLevel = "low" | "medium" | "high" | "critical";
export type RiskTolerance = "conservative" | "balanced" | "aggressive";
export type AutonomyLevel = "supervised" | "guided" | "autonomous";

// ─── Scenario ───

export type SafetyStatus = "safe" | "flagged" | "blocked" | "rewritten";

export interface ScenarioConstraints {
  urgency: UrgencyLevel;
  risk_tolerance: RiskTolerance;
  autonomy: AutonomyLevel;
  time_horizon?: string;
  custom?: string[];
}

export interface Scenario {
  id: string;
  raw_prompt: string;
  normalized_prompt: string;
  domain: string;
  safety_status: SafetyStatus;
  constraints: ScenarioConstraints;
  created_at: string;
}

// ─── Run ───

export type RunStatus =
  | "compiling"
  | "planning"
  | "executing"
  | "reviewing"
  | "completed"
  | "failed"
  | "canceled";

export interface Run {
  id: string;
  scenario_id: string;
  status: RunStatus;
  mode: SimulationMode;
  agent_roster: AgentSummary[];
  task_graph: TaskGraphEdge[];
  summary: string | null;
  started_at: string;
  ended_at: string | null;
  progress: number; // 0-100
}

export interface AgentSummary {
  id: string;
  name: string;
  role: AgentRole;
}

export interface TaskGraphEdge {
  from_task_id: string;
  to_task_id: string;
  relation: "depends_on" | "blocks" | "informs";
}

// ─── Agent ───

export type AgentRole =
  | "architect"
  | "analyst"
  | "operator"
  | "guardian"
  | "escalation_lead"
  | "narrator";

export type AgentState = "idle" | "thinking" | "acting" | "waiting" | "done" | "error";

export interface Agent {
  id: string;
  run_id: string;
  name: string;
  role: AgentRole;
  capabilities: string[];
  confidence: number; // 0-1
  state: AgentState;
  current_task_id: string | null;
  last_action: string | null;
  messages_sent: number;
  messages_received: number;
}

export const AGENT_DISPLAY: Record<AgentRole, { label: string; color: string; icon: string }> = {
  architect: { label: "Architect", color: "#6366f1", icon: "◆" },
  analyst: { label: "Analyst", color: "#06b6d4", icon: "◇" },
  operator: { label: "Operator", color: "#f59e0b", icon: "●" },
  guardian: { label: "Guardian", color: "#ef4444", icon: "■" },
  escalation_lead: { label: "Escalation Lead", color: "#8b5cf6", icon: "▲" },
  narrator: { label: "Narrator", color: "#64748b", icon: "◎" },
};

// ─── Task ───

export type TaskStatus =
  | "queued"
  | "active"
  | "blocked"
  | "failed"
  | "retrying"
  | "escalated"
  | "awaiting_approval"
  | "approved"
  | "completed"
  | "canceled";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface Task {
  id: string;
  run_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  owner_agent_id: string | null;
  depends_on: string[];
  risk_level: RiskLevel;
  phase: string;
  confidence: number;
  started_at: string | null;
  completed_at: string | null;
  retry_count: number;
  failure_reason: string | null;
}

export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  queued: "#94a3b8",
  active: "#3b82f6",
  blocked: "#f97316",
  failed: "#ef4444",
  retrying: "#eab308",
  escalated: "#a855f7",
  awaiting_approval: "#8b5cf6",
  approved: "#22c55e",
  completed: "#10b981",
  canceled: "#6b7280",
};

// ─── Event ───

export type EventType =
  | "run_started"
  | "scenario_compiled"
  | "agent_spawned"
  | "agent_thinking"
  | "agent_action"
  | "agent_message"
  | "task_created"
  | "task_status_changed"
  | "task_assigned"
  | "decision_gate_created"
  | "decision_gate_resolved"
  | "risk_identified"
  | "retry_triggered"
  | "escalation"
  | "human_review_requested"
  | "human_review_completed"
  | "run_completed"
  | "run_failed"
  | "narrator_update";

export interface RunEvent {
  id: string;
  run_id: string;
  type: EventType;
  actor: string;
  payload: Record<string, unknown>;
  timestamp: string;
  sequence: number;
}

// ─── Decision Gate ───

export type GateStatus = "pending" | "approved" | "rejected" | "deferred";

export interface DecisionGate {
  id: string;
  run_id: string;
  task_id: string | null;
  reason: string;
  required_action: string;
  status: GateStatus;
  risk_level: RiskLevel;
  options: GateOption[];
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface GateOption {
  label: string;
  description: string;
  action: "approve" | "reject" | "reroute";
  consequence: string;
}

// ─── Outcome ───

export interface Outcome {
  id: string;
  run_id: string;
  executive_summary: string;
  operating_plan: PlanSection[];
  risk_register: RiskEntry[];
  human_review_checkpoints: ReviewCheckpoint[];
  assumptions: string[];
  alternatives: AlternativeStrategy[];
  suggested_metrics: Metric[];
  confidence_notes: string[];
}

export interface PlanSection {
  phase: string;
  title: string;
  description: string;
  tasks: string[];
  owner: string;
  estimated_effort: string;
}

export interface RiskEntry {
  id: string;
  title: string;
  severity: RiskLevel;
  likelihood: "unlikely" | "possible" | "likely" | "certain";
  impact: string;
  mitigation: string;
  owner: string;
}

export interface ReviewCheckpoint {
  id: string;
  title: string;
  reason: string;
  phase: string;
  required: boolean;
}

export interface AlternativeStrategy {
  id: string;
  title: string;
  description: string;
  trade_offs: string;
  confidence: number;
}

export interface Metric {
  name: string;
  description: string;
  target: string;
  measurement: string;
}

// ─── Template ───

export interface ScenarioTemplate {
  id: string;
  title: string;
  teaser: string;
  prompt: string;
  domain: string;
  difficulty: "easy" | "medium" | "hard" | "impossible";
  safety_classification: SafetyStatus;
  constraints: Partial<ScenarioConstraints>;
  suggested_agent_roster: AgentRole[];
  suggested_mode: SimulationMode;
  category: TemplateCategory;
}

export type TemplateCategory =
  | "operations_rescue"
  | "event_planning"
  | "support_triage"
  | "supply_chain"
  | "absurd_challenge"
  | "public_service";

// ─── API Response Types ───

export interface ApiResponse<T> {
  data: T;
  error: string | null;
}

export interface StreamEvent {
  event: EventType;
  data: RunEvent;
}

// ─── Graph Visualization Types ───

export interface GraphNode {
  id: string;
  type: "agent" | "task" | "gate";
  label: string;
  role?: AgentRole;
  status?: TaskStatus | AgentState | GateStatus;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  confidence?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: "dependency" | "assignment" | "handoff" | "escalation";
  animated?: boolean;
}
