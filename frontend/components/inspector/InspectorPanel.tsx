"use client";

import { motion } from "framer-motion";
import { AGENT_DISPLAY, TASK_STATUS_COLOR, type Agent, type Task, type TaskStatus } from "@/types/entities";
import StatusBadge from "@/components/shared/StatusBadge";

interface InspectorPanelProps {
  selectedNode: { type: "agent" | "task"; id: string } | null;
  agents: Agent[];
  tasks: Task[];
}

// ─── Confidence Meter ───

function ConfidenceMeter({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  const percentage = Math.round(value * 100);
  const height = size === "sm" ? "h-1.5" : "h-2";
  const color =
    percentage >= 75
      ? "var(--color-state-completed)"
      : percentage >= 50
        ? "var(--color-accent)"
        : percentage >= 25
          ? "var(--color-state-blocked)"
          : "var(--color-state-failed)";

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex-1 rounded-full ${height}`}
        style={{ background: "var(--color-surface)" }}
      >
        <motion.div
          className={`rounded-full ${height}`}
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span
        className="text-xs font-mono tabular-nums"
        style={{ color: "var(--color-text-secondary)", minWidth: "2.5rem", textAlign: "right" }}
      >
        {percentage}%
      </span>
    </div>
  );
}

// ─── Task Counts for Summary ───

function TaskCountBar({ tasks }: { tasks: Task[] }) {
  const counts: Partial<Record<TaskStatus, number>> = {};
  tasks.forEach((t) => {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
  });

  const total = tasks.length;
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: "var(--color-surface)" }}>
        {Object.entries(counts).map(([status, count]) => (
          <motion.div
            key={status}
            style={{
              background: TASK_STATUS_COLOR[status as TaskStatus],
              width: `${((count ?? 0) / total) * 100}%`,
            }}
            initial={{ width: 0 }}
            animate={{ width: `${((count ?? 0) / total) * 100}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(counts).map(([status, count]) => (
          <div key={status} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: TASK_STATUS_COLOR[status as TaskStatus] }}
            />
            <span style={{ color: "var(--color-text-secondary)" }}>
              {count} {status.replace(/_/g, " ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Summary View ───

function RunSummary({ agents, tasks }: { agents: Agent[]; tasks: Task[] }) {
  const activeAgents = agents.filter(
    (a) => a.state === "thinking" || a.state === "acting"
  ).length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const totalTasks = tasks.length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-5"
    >
      <div>
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: "var(--color-text-muted)" }}
        >
          Run Progress
        </h3>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--color-text-secondary)" }}>
              {completedTasks} of {totalTasks} tasks
            </span>
            <span
              className="font-mono tabular-nums"
              style={{ color: "var(--color-accent)" }}
            >
              {progress}%
            </span>
          </div>
          <div
            className="h-2 rounded-full"
            style={{ background: "var(--color-surface)" }}
          >
            <motion.div
              className="h-2 rounded-full"
              style={{ background: "var(--color-accent)" }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      </div>

      <div>
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: "var(--color-text-muted)" }}
        >
          Agents
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Total" value={agents.length.toString()} />
          <Stat label="Active" value={activeAgents.toString()} accent />
        </div>
        <div className="mt-3 space-y-1.5">
          {agents.map((agent) => {
            const display = AGENT_DISPLAY[agent.role];
            return (
              <div
                key={agent.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5"
                style={{ background: "var(--color-surface)" }}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded text-xs font-bold"
                  style={{ background: `${display.color}25`, color: display.color }}
                >
                  {display.icon}
                </span>
                <span className="flex-1 text-sm" style={{ color: "var(--color-text-primary)" }}>
                  {agent.name}
                </span>
                <StatusBadge status={agent.state} variant="agent" size="sm" />
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: "var(--color-text-muted)" }}
        >
          Tasks by Status
        </h3>
        <TaskCountBar tasks={tasks} />
      </div>
    </motion.div>
  );
}

// ─── Agent Detail ───

function AgentDetail({ agent, tasks }: { agent: Agent; tasks: Task[] }) {
  const display = AGENT_DISPLAY[agent.role];
  const currentTask = agent.current_task_id
    ? tasks.find((t) => t.id === agent.current_task_id)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold"
          style={{ background: `${display.color}20`, color: display.color }}
        >
          {display.icon}
        </span>
        <div className="flex-1">
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {agent.name}
          </h3>
          <p className="text-sm" style={{ color: display.color }}>
            {display.label}
          </p>
        </div>
        <StatusBadge status={agent.state} variant="agent" />
      </div>

      {/* Confidence */}
      <div>
        <h4
          className="text-xs font-semibold uppercase tracking-wider mb-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          Confidence
        </h4>
        <ConfidenceMeter value={agent.confidence} />
      </div>

      {/* Current Task */}
      {currentTask && (
        <div>
          <h4
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            Current Task
          </h4>
          <div
            className="rounded-lg p-3"
            style={{ background: "var(--color-surface)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                {currentTask.title}
              </span>
              <StatusBadge status={currentTask.status} variant="task" size="sm" />
            </div>
            <p
              className="mt-1.5 text-xs leading-relaxed"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {currentTask.description}
            </p>
          </div>
        </div>
      )}

      {/* Last Action */}
      {agent.last_action && (
        <div>
          <h4
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            Last Action
          </h4>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {agent.last_action}
          </p>
        </div>
      )}

      {/* Capabilities */}
      <div>
        <h4
          className="text-xs font-semibold uppercase tracking-wider mb-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          Capabilities
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {agent.capabilities.map((cap) => (
            <span
              key={cap}
              className="rounded-md px-2 py-0.5 text-xs"
              style={{
                background: "var(--color-surface)",
                color: "var(--color-text-secondary)",
              }}
            >
              {cap.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>

      {/* Message Stats */}
      <div>
        <h4
          className="text-xs font-semibold uppercase tracking-wider mb-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          Communication
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Sent" value={agent.messages_sent.toString()} />
          <Stat label="Received" value={agent.messages_received.toString()} />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Task Detail ───

function TaskDetail({
  task,
  agents,
  allTasks,
}: {
  task: Task;
  agents: Agent[];
  allTasks: Task[];
}) {
  const owner = task.owner_agent_id
    ? agents.find((a) => a.id === task.owner_agent_id)
    : null;
  const ownerDisplay = owner ? AGENT_DISPLAY[owner.role] : null;

  const dependencyTasks = task.depends_on
    .map((depId) => allTasks.find((t) => t.id === depId))
    .filter(Boolean) as Task[];

  const riskColors: Record<string, string> = {
    low: "var(--color-state-completed)",
    medium: "var(--color-accent)",
    high: "var(--color-state-blocked)",
    critical: "var(--color-state-failed)",
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {task.title}
          </h3>
          <StatusBadge status={task.status} variant="task" />
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
          {task.description}
        </p>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <h4
            className="text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            Phase
          </h4>
          <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
            {task.phase}
          </span>
        </div>
        <div>
          <h4
            className="text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            Risk Level
          </h4>
          <span
            className="text-sm font-medium"
            style={{ color: riskColors[task.risk_level] ?? "var(--color-text-primary)" }}
          >
            {task.risk_level.charAt(0).toUpperCase() + task.risk_level.slice(1)}
          </span>
        </div>
      </div>

      {/* Confidence */}
      <div>
        <h4
          className="text-xs font-semibold uppercase tracking-wider mb-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          Confidence
        </h4>
        <ConfidenceMeter value={task.confidence} />
      </div>

      {/* Owner */}
      {owner && ownerDisplay && (
        <div>
          <h4
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            Assigned To
          </h4>
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: "var(--color-surface)" }}
          >
            <span
              className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold"
              style={{ background: `${ownerDisplay.color}25`, color: ownerDisplay.color }}
            >
              {ownerDisplay.icon}
            </span>
            <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
              {owner.name}
            </span>
            <span className="text-xs" style={{ color: ownerDisplay.color }}>
              {ownerDisplay.label}
            </span>
          </div>
        </div>
      )}

      {/* Dependencies */}
      {dependencyTasks.length > 0 && (
        <div>
          <h4
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            Dependencies
          </h4>
          <div className="space-y-1.5">
            {dependencyTasks.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center justify-between rounded-md px-3 py-1.5"
                style={{ background: "var(--color-surface)" }}
              >
                <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                  {dep.title}
                </span>
                <StatusBadge status={dep.status} variant="task" size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retry / Failure */}
      {task.retry_count > 0 && (
        <div>
          <h4
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            Retries
          </h4>
          <Stat label="Attempts" value={task.retry_count.toString()} />
          {task.failure_reason && (
            <p
              className="mt-2 rounded-md px-3 py-2 text-xs"
              style={{
                background: "var(--color-state-failed)15",
                color: "var(--color-state-failed)",
              }}
            >
              {task.failure_reason}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Stat Helper ───

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: "var(--color-surface)" }}
    >
      <div
        className="text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </div>
      <div
        className="text-lg font-semibold font-mono tabular-nums"
        style={{
          color: accent ? "var(--color-accent)" : "var(--color-text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Main Component ───

export default function InspectorPanel({
  selectedNode,
  agents,
  tasks,
}: InspectorPanelProps) {
  if (!selectedNode) {
    return <RunSummary agents={agents} tasks={tasks} />;
  }

  if (selectedNode.type === "agent") {
    const agent = agents.find((a) => a.id === selectedNode.id);
    if (!agent) return <RunSummary agents={agents} tasks={tasks} />;
    return <AgentDetail agent={agent} tasks={tasks} />;
  }

  if (selectedNode.type === "task") {
    const task = tasks.find((t) => t.id === selectedNode.id);
    if (!task) return <RunSummary agents={agents} tasks={tasks} />;
    return <TaskDetail task={task} agents={agents} allTasks={tasks} />;
  }

  return <RunSummary agents={agents} tasks={tasks} />;
}
