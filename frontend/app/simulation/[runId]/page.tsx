"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { getRunFull, streamRunEvents } from "@/lib/api";
import type {
  Run,
  Agent,
  Task,
  RunEvent,
  Outcome,
  SimulationMode,
} from "@/types/entities";
import ModeToggle from "@/components/shared/ModeToggle";
import StatusBadge from "@/components/shared/StatusBadge";
import TimelineStream from "@/components/timeline/TimelineStream";
import InspectorPanel from "@/components/inspector/InspectorPanel";
import OutcomePanel from "@/components/outcome/OutcomePanel";
import ForceGraph from "@/components/graph/ForceGraph";
import OnboardingOverlay from "@/components/shared/OnboardingOverlay";

// ─── Backend → Frontend Mapping ───

const BACKEND_STATUS_MAP: Record<string, string> = {
  pending: "compiling",
  compiling: "compiling",
  running: "executing",
  waiting_for_input: "reviewing",
  completed: "completed",
  failed: "failed",
  cancelled: "canceled",
};

const BACKEND_MODE_MAP: Record<string, SimulationMode> = {
  full_auto: "play",
  guided: "explore",
  step_by_step: "prove",
};

const BACKEND_TASK_STATUS_MAP: Record<string, string> = {
  pending: "queued",
  in_progress: "active",
  blocked: "blocked",
  completed: "completed",
  failed: "failed",
  skipped: "canceled",
};

function mapBackendRun(raw: Record<string, unknown>): Partial<Run> {
  return {
    id: raw.id as string,
    scenario_id: raw.scenario_id as string,
    status: (BACKEND_STATUS_MAP[raw.status as string] ?? raw.status) as Run["status"],
    mode: (BACKEND_MODE_MAP[raw.mode as string] ?? "explore") as SimulationMode,
    progress: Math.round(((raw.progress as number) ?? 0) * 100),
    summary: (raw.current_phase as string) ?? null,
    started_at: (raw.started_at as string) ?? (raw.created_at as string) ?? new Date().toISOString(),
    ended_at: (raw.completed_at as string) ?? null,
    agent_roster: [],
    task_graph: [],
  };
}

function mapBackendAgent(raw: Record<string, unknown>): Agent {
  return {
    id: raw.id as string,
    run_id: raw.run_id as string,
    name: raw.name as string,
    role: raw.role as Agent["role"],
    capabilities: [],
    confidence: 0.75,
    state: raw.state as Agent["state"],
    current_task_id: (raw.current_task_id as string) ?? null,
    last_action: null,
    messages_sent: (raw.actions_taken as number) ?? 0,
    messages_received: 0,
  };
}

function mapBackendTask(raw: Record<string, unknown>): Task {
  return {
    id: raw.id as string,
    run_id: raw.run_id as string,
    title: raw.title as string,
    description: raw.description as string,
    status: (BACKEND_TASK_STATUS_MAP[raw.status as string] ?? raw.status) as Task["status"],
    owner_agent_id: (raw.assigned_agent_id as string) ?? null,
    depends_on: (raw.dependencies as string[]) ?? [],
    risk_level: (raw.risk_level as Task["risk_level"]) ?? "low",
    phase: "",
    confidence: 0.5,
    started_at: (raw.started_at as string) ?? null,
    completed_at: (raw.completed_at as string) ?? null,
    retry_count: (raw.retry_count as number) ?? 0,
    failure_reason: (raw.error as string) ?? null,
  };
}

// ─── Phase Messages ───

const PHASE_MESSAGES: Record<string, { label: string; detail: string }> = {
  compiling: { label: "Compiling Scenario", detail: "Parsing constraints, risks, and building a task graph..." },
  planning: { label: "Spawning Agents", detail: "Assembling the team and assigning roles..." },
  executing: { label: "Orchestrating", detail: "Agents are collaborating to build your plan..." },
  reviewing: { label: "Awaiting Input", detail: "A decision gate requires your attention." },
  completed: { label: "Complete", detail: "Simulation finished. Review the outcome." },
  failed: { label: "Failed", detail: "Something went wrong during orchestration." },
};

// ─── Sidebar Tabs ───

type SidebarTab = "timeline" | "inspector" | "outcome";

const SIDEBAR_TABS: { value: SidebarTab; label: string }[] = [
  { value: "timeline", label: "Timeline" },
  { value: "inspector", label: "Inspector" },
  { value: "outcome", label: "Outcome" },
];

const SPEEDS = [1, 2, 4] as const;

export default function SimulationPage() {
  const params = useParams();
  const runId = params.runId as string;

  // Core state — starts empty, progressively populated from backend
  const [run, setRun] = useState<Partial<Run>>({
    id: runId,
    status: "compiling",
    mode: "explore",
    progress: 0,
    summary: null,
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [outcome] = useState<Outcome | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // UI state
  const [mode, setMode] = useState<SimulationMode>("explore");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("timeline");
  const [selectedNode, setSelectedNode] = useState<{ type: "agent" | "task"; id: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  const disconnectRef = useRef<(() => void) | null>(null);

  // Fetch run data and connect SSE on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      const res = await getRunFull(runId);
      if (!mounted) return;

      if (res.error) {
        setLoadError(res.error);
        setIsLoading(false);
        return;
      }

      const mappedRun = mapBackendRun(res.data.run);
      setRun((prev) => ({ ...prev, ...mappedRun }));
      if (mappedRun.mode) setMode(mappedRun.mode);

      if (res.data.agents?.length) setAgents(res.data.agents.map(mapBackendAgent));
      if (res.data.tasks?.length) setTasks(res.data.tasks.map(mapBackendTask));

      setIsLoading(false);

      // Connect to SSE stream
      const disconnect = streamRunEvents(
        runId,
        (event) => {
          if (mounted) setEvents((prev) => [...prev, event]);
        },
        (err) => console.error("SSE error:", err)
      );
      disconnectRef.current = disconnect;
    }

    init();

    return () => {
      mounted = false;
      disconnectRef.current?.();
    };
  }, [runId]);

  const handleModeChange = useCallback((newMode: SimulationMode) => setMode(newMode), []);
  const handleSpeedCycle = useCallback(() => {
    setSpeed((prev) => SPEEDS[(SPEEDS.indexOf(prev) + 1) % SPEEDS.length]);
  }, []);
  const handlePlayPause = useCallback(() => setIsPlaying((prev) => !prev), []);
  const handleNodeClick = useCallback(
    (type: "agent" | "task", id: string) => {
      if (selectedNode?.type === type && selectedNode?.id === id) {
        setSelectedNode(null);
      } else {
        setSelectedNode({ type, id });
        setSidebarTab("inspector");
      }
    },
    [selectedNode]
  );

  const currentPhase = PHASE_MESSAGES[run.status ?? "compiling"] ?? PHASE_MESSAGES.compiling;
  const hasData = agents.length > 0 || tasks.length > 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <OnboardingOverlay />

      {/* ─── Top Bar ─── */}
      <header
        className="flex items-center justify-between px-5 py-3"
        style={{
          background: "var(--color-surface-raised)",
          borderBottom: "1px solid var(--color-surface-overlay)",
        }}
      >
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm font-medium transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; }}
          >
            &#8592; Machine of Maybe
          </Link>
          <div className="h-4 w-px" style={{ background: "var(--color-surface-overlay)" }} />
          <StatusBadge status={run.status ?? "compiling"} variant="run" size="md" />
          {run.summary && (
            <span className="hidden text-sm sm:inline-block" style={{ color: "var(--color-text-secondary)" }}>
              {run.summary}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <div className="h-1.5 w-24 rounded-full" style={{ background: "var(--color-surface)" }}>
              <motion.div
                className="h-1.5 rounded-full"
                style={{ background: "var(--color-accent)" }}
                animate={{ width: `${run.progress ?? 0}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="text-xs font-mono tabular-nums" style={{ color: "var(--color-text-muted)" }}>
              {run.progress ?? 0}%
            </span>
          </div>
          <ModeToggle mode={mode} onModeChange={handleModeChange} />
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Graph Canvas */}
        <div className="relative flex-1 overflow-hidden" style={{ flexBasis: "70%" }}>
          <div
            id="graph-canvas"
            className="absolute inset-0"
            style={{
              background: "var(--color-surface-raised)",
              backgroundImage: `radial-gradient(circle, var(--color-surface-overlay) 1px, transparent 1px)`,
              backgroundSize: "24px 24px",
            }}
          >
            {hasData ? (
              <ForceGraph
                agents={agents}
                tasks={tasks}
                selectedNodeId={selectedNode?.id ?? null}
                onNodeClick={handleNodeClick}
                isPlaying={isPlaying}
              />
            ) : (
              /* Loading / Phase State */
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {loadError ? (
                  <div className="text-center max-w-md px-6">
                    <div className="text-3xl mb-4 opacity-40">&#x26A0;</div>
                    <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--color-state-failed)" }}>
                      Failed to load simulation
                    </h3>
                    <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>{loadError}</p>
                    <Link
                      href="/"
                      className="inline-block rounded-lg px-4 py-2 text-sm font-medium"
                      style={{ background: "var(--color-accent)", color: "var(--color-text-inverse)" }}
                    >
                      Back to Home
                    </Link>
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center"
                  >
                    {/* Animated rings */}
                    <div className="relative mx-auto mb-6 h-20 w-20">
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{ border: "2px solid var(--color-accent)", opacity: 0.3 }}
                        animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      />
                      <motion.div
                        className="absolute inset-2 rounded-full"
                        style={{ border: "2px solid var(--color-accent)", opacity: 0.5 }}
                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                      />
                      <div
                        className="absolute inset-4 flex items-center justify-center rounded-full"
                        style={{ background: "var(--color-accent)15", border: "1px solid var(--color-accent)40" }}
                      >
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          className="text-lg"
                          style={{ color: "var(--color-accent)" }}
                        >
                          &#x2699;
                        </motion.span>
                      </div>
                    </div>

                    <h3
                      className="text-lg font-semibold mb-1"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {currentPhase.label}
                    </h3>
                    <p className="text-sm max-w-xs" style={{ color: "var(--color-text-secondary)" }}>
                      {currentPhase.detail}
                    </p>
                  </motion.div>
                )}
              </div>
            )}

            {hasData && (
              <div
                className="absolute bottom-4 left-4 rounded-md px-3 py-1.5 text-xs font-mono"
                style={{ background: "var(--color-surface)cc", color: "var(--color-text-muted)" }}
              >
                Agent Graph &mdash; {agents.length} agents, {tasks.length} tasks
              </div>
            )}
          </div>
        </div>

        {/* Right: Sidebar */}
        <div
          className="flex flex-col overflow-hidden"
          style={{
            flexBasis: "30%",
            minWidth: "320px",
            maxWidth: "420px",
            background: "var(--color-surface-raised)",
            borderLeft: "1px solid var(--color-surface-overlay)",
          }}
        >
          <div className="flex gap-0.5 p-2" style={{ borderBottom: "1px solid var(--color-surface-overlay)" }}>
            {SIDEBAR_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSidebarTab(tab.value)}
                className="relative flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                style={{ color: sidebarTab === tab.value ? "var(--color-text-inverse)" : "var(--color-text-muted)" }}
              >
                {sidebarTab === tab.value && (
                  <motion.div
                    layoutId="sidebar-tab-bg"
                    className="absolute inset-0 rounded-md"
                    style={{ background: "var(--color-accent)" }}
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <AnimatePresence mode="wait">
              {sidebarTab === "timeline" && (
                <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <TimelineStream events={events} />
                </motion.div>
              )}
              {sidebarTab === "inspector" && (
                <motion.div key="inspector" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <InspectorPanel selectedNode={selectedNode} agents={agents} tasks={tasks} />
                </motion.div>
              )}
              {sidebarTab === "outcome" && (
                <motion.div key="outcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <OutcomePanel outcome={outcome} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ─── Bottom Playback Bar ─── */}
      <footer
        className="flex items-center justify-between px-5 py-2.5"
        style={{ background: "var(--color-surface-raised)", borderTop: "1px solid var(--color-surface-overlay)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={handlePlayPause}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
            style={{ background: "var(--color-surface-overlay)", color: "var(--color-text-primary)" }}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12" rx="1" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5v11l9-5.5z" /></svg>
            )}
          </button>
          <button
            onClick={handleSpeedCycle}
            className="rounded-md px-2.5 py-1 text-xs font-mono font-bold transition-colors"
            style={{ background: "var(--color-surface-overlay)", color: "var(--color-text-secondary)" }}
          >
            {speed}x
          </button>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono tabular-nums" style={{ color: "var(--color-text-muted)" }}>
            {events.length} events
          </span>
          <div className="h-4 w-px" style={{ background: "var(--color-surface-overlay)" }} />
          <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
            run/{runId.slice(0, 12)}
          </span>
        </div>
      </footer>
    </div>
  );
}
