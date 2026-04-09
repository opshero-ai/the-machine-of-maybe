"use client";

import {
  TASK_STATUS_COLOR,
  type TaskStatus,
  type RunStatus,
  type AgentState,
} from "@/types/entities";

const RUN_STATUS_COLOR: Record<string, string> = {
  compiling: "#94a3b8",
  planning: "#3b82f6",
  executing: "#f59e0b",
  reviewing: "#8b5cf6",
  completed: "#10b981",
  failed: "#ef4444",
  canceled: "#6b7280",
  // Backend status values
  pending: "#94a3b8",
  running: "#f59e0b",
  waiting_for_input: "#8b5cf6",
  cancelled: "#6b7280",
};

const AGENT_STATE_COLOR: Record<AgentState, string> = {
  idle: "#94a3b8",
  thinking: "#6366f1",
  acting: "#3b82f6",
  waiting: "#f59e0b",
  done: "#10b981",
  error: "#ef4444",
};

const ACTIVE_STATES = new Set([
  "active",
  "executing",
  "thinking",
  "acting",
  "retrying",
  "compiling",
  "planning",
  "reviewing",
]);

function getColor(
  status: string,
  variant: "task" | "run" | "agent"
): string {
  switch (variant) {
    case "task":
      return TASK_STATUS_COLOR[status as TaskStatus] ?? "#94a3b8";
    case "run":
      return RUN_STATUS_COLOR[status as RunStatus] ?? "#94a3b8";
    case "agent":
      return AGENT_STATE_COLOR[status as AgentState] ?? "#94a3b8";
    default:
      return "#94a3b8";
  }
}

function formatLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface StatusBadgeProps {
  status: string;
  variant: "task" | "run" | "agent";
  size?: "sm" | "md";
}

export default function StatusBadge({
  status,
  variant,
  size = "sm",
}: StatusBadgeProps) {
  const color = getColor(status, variant);
  const isActive = ACTIVE_STATES.has(status);
  const dotSize = size === "sm" ? "6px" : "8px";
  const textClass =
    size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${textClass}`}
      style={{
        background: `${color}18`,
        color,
      }}
    >
      <span
        className="relative inline-block flex-shrink-0 rounded-full"
        style={{
          width: dotSize,
          height: dotSize,
          background: color,
        }}
      >
        {isActive && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              background: color,
              opacity: 0.6,
            }}
          />
        )}
      </span>
      {formatLabel(status)}
    </span>
  );
}
