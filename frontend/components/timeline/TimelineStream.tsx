"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AGENT_DISPLAY, type RunEvent, type AgentRole } from "@/types/entities";

// Map event types to human-readable descriptions
function describeEvent(event: RunEvent): string {
  const p = event.payload;
  switch (event.type) {
    case "run_started":
      return `Simulation started in ${p.mode ?? "play"} mode`;
    case "scenario_compiled":
      return `Scenario compiled: ${p.domain ?? "unknown"} domain, ${p.agents_count ?? "?"} agents`;
    case "agent_spawned":
      return `${event.actor} joined as ${formatRole(p.role as string)}`;
    case "agent_thinking":
      return `${event.actor}: "${truncate(p.thought as string, 80)}"`;
    case "agent_action":
      return `${event.actor}: ${truncate(p.action as string, 80)}`;
    case "agent_message":
      return `${event.actor} to ${p.to}: "${truncate(p.message as string, 60)}"`;
    case "task_created":
      return `New task: ${p.title}`;
    case "task_status_changed":
      return `Task ${p.task_id}: ${p.from} -> ${p.to}`;
    case "task_assigned":
      return `Task assigned to ${p.agent} (${formatRole(p.role as string)})`;
    case "decision_gate_created":
      return `Decision gate: ${truncate(p.reason as string, 70)}`;
    case "decision_gate_resolved":
      return `Gate resolved: ${p.action}`;
    case "risk_identified":
      return `Risk (${p.severity}): ${truncate(p.risk as string, 60)}`;
    case "retry_triggered":
      return `Retry #${p.attempt}: ${truncate(p.reason as string, 60)}`;
    case "escalation":
      return `Escalation (${p.severity}): ${truncate(p.reason as string, 60)}`;
    case "human_review_requested":
      return `Human review needed: ${truncate(p.reason as string, 60)}`;
    case "human_review_completed":
      return `Human review completed`;
    case "run_completed":
      return "Simulation completed successfully";
    case "run_failed":
      return `Simulation failed: ${p.reason ?? "unknown"}`;
    case "narrator_update":
      return truncate(p.summary as string, 120);
    default:
      return (event.type as string).replace(/_/g, " ");
  }
}

function formatRole(role: string): string {
  return role?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? "Unknown";
}

function truncate(text: string | undefined, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// Try to determine the agent role from event context
function getActorRole(event: RunEvent): AgentRole | null {
  const role = event.payload.role as string | undefined;
  if (role && role in AGENT_DISPLAY) return role as AgentRole;

  // Known actor-to-role mappings from mock data patterns
  const actorMap: Record<string, AgentRole> = {};
  // We rely on the role payload field or return null
  return actorMap[event.actor] ?? null;
}

const EVENT_TYPE_ICONS: Partial<Record<string, string>> = {
  run_started: ">>",
  scenario_compiled: "{}",
  agent_spawned: "+",
  agent_thinking: "...",
  agent_action: "!",
  agent_message: "->",
  task_created: "[]",
  task_status_changed: "~",
  task_assigned: "<-",
  decision_gate_created: "?!",
  decision_gate_resolved: "OK",
  risk_identified: "!!",
  retry_triggered: "<<",
  escalation: "^^",
  human_review_requested: "??",
  human_review_completed: "OK",
  run_completed: "**",
  run_failed: "XX",
  narrator_update: "~~",
};

interface TimelineStreamProps {
  events: RunEvent[];
}

export default function TimelineStream({ events }: TimelineStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new events arrive (most recent first)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [events.length]);

  const sortedEvents = [...events].sort((a, b) => b.sequence - a.sequence);

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-0.5 overflow-y-auto pr-1"
      style={{ maxHeight: "100%" }}
    >
      <AnimatePresence initial={false}>
        {sortedEvents.map((event) => {
          const role = getActorRole(event);
          const roleInfo = role ? AGENT_DISPLAY[role] : null;
          const iconLabel = EVENT_TYPE_ICONS[event.type] ?? "--";

          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: -12, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="group flex gap-3 rounded-md px-3 py-2 transition-colors hover:bg-[var(--color-surface-overlay)]"
            >
              {/* Actor icon */}
              <div className="flex flex-col items-center gap-1 pt-0.5">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-mono font-bold"
                  style={{
                    background: roleInfo
                      ? `${roleInfo.color}25`
                      : "var(--color-surface-overlay)",
                    color: roleInfo?.color ?? "var(--color-text-muted)",
                  }}
                  title={roleInfo?.label ?? event.actor}
                >
                  {roleInfo?.icon ?? iconLabel}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-xs font-semibold"
                    style={{
                      color: roleInfo?.color ?? "var(--color-text-secondary)",
                    }}
                  >
                    {event.actor}
                  </span>
                  <span
                    className="text-xs font-mono"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {formatTime(event.timestamp)}
                  </span>
                </div>
                <p
                  className="mt-0.5 text-sm leading-relaxed"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {describeEvent(event)}
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {sortedEvents.length === 0 && (
        <div
          className="flex items-center justify-center py-12 text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          Waiting for events...
        </div>
      )}
    </div>
  );
}
