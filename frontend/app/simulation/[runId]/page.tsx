"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { getRun, streamRunEvents } from "@/lib/api";
import {
  mockRun,
  mockAgents,
  mockTasks,
  mockEvents,
  mockOutcome,
} from "@/lib/mock-data";
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

// ─── Sidebar Tabs ───

type SidebarTab = "timeline" | "inspector" | "outcome";

const SIDEBAR_TABS: { value: SidebarTab; label: string }[] = [
  { value: "timeline", label: "Timeline" },
  { value: "inspector", label: "Inspector" },
  { value: "outcome", label: "Outcome" },
];

// ─── Playback Speeds ───

const SPEEDS = [1, 2, 4] as const;

export default function SimulationPage() {
  const params = useParams();
  const runId = params.runId as string;

  // Core state
  const [run, setRun] = useState<Run>(mockRun);
  const [agents] = useState<Agent[]>(mockAgents);
  const [tasks] = useState<Task[]>(mockTasks);
  const [events, setEvents] = useState<RunEvent[]>(mockEvents);
  const [outcome] = useState<Outcome | null>(mockOutcome);

  // UI state
  const [mode, setMode] = useState<SimulationMode>(mockRun.mode);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("timeline");
  const [selectedNode, setSelectedNode] = useState<{
    type: "agent" | "task";
    id: string;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  // SSE connection ref
  const disconnectRef = useRef<(() => void) | null>(null);

  // Fetch run data and connect SSE on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      const res = await getRun(runId);
      if (res.data && mounted) {
        setRun(res.data);
        setMode(res.data.mode);
      }

      // Connect to SSE stream
      const disconnect = streamRunEvents(
        runId,
        (event) => {
          if (mounted) {
            setEvents((prev) => [...prev, event]);
          }
        },
        (err) => {
          console.error("SSE error:", err);
        }
      );
      disconnectRef.current = disconnect;
    }

    init();

    return () => {
      mounted = false;
      disconnectRef.current?.();
    };
  }, [runId]);

  const handleModeChange = useCallback((newMode: SimulationMode) => {
    setMode(newMode);
  }, []);

  const handleSpeedCycle = useCallback(() => {
    setSpeed((prev) => {
      const idx = SPEEDS.indexOf(prev);
      return SPEEDS[(idx + 1) % SPEEDS.length];
    });
  }, []);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

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

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ─── Top Bar ─── */}
      <header
        className="flex items-center justify-between px-5 py-3"
        style={{
          background: "var(--color-surface-raised)",
          borderBottom: "1px solid var(--color-surface-overlay)",
        }}
      >
        <div className="flex items-center gap-4">
          {/* Back to home */}
          <Link
            href="/"
            className="text-sm font-medium transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-muted)";
            }}
          >
            &#8592; Machine of Maybe
          </Link>

          <div
            className="h-4 w-px"
            style={{ background: "var(--color-surface-overlay)" }}
          />

          <StatusBadge status={run.status} variant="run" size="md" />

          {run.summary && (
            <span
              className="hidden text-sm sm:inline-block"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {run.summary}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Progress */}
          <div className="hidden items-center gap-2 sm:flex">
            <div
              className="h-1.5 w-24 rounded-full"
              style={{ background: "var(--color-surface)" }}
            >
              <motion.div
                className="h-1.5 rounded-full"
                style={{ background: "var(--color-accent)" }}
                animate={{ width: `${run.progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span
              className="text-xs font-mono tabular-nums"
              style={{ color: "var(--color-text-muted)" }}
            >
              {run.progress}%
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
            {/* D3 Force-Directed Agent Graph */}
            <ForceGraph
              agents={agents}
              tasks={tasks}
              selectedNodeId={selectedNode?.id ?? null}
              onNodeClick={handleNodeClick}
              isPlaying={isPlaying}
            />

            {/* Canvas label */}
            <div
              className="absolute bottom-4 left-4 rounded-md px-3 py-1.5 text-xs font-mono"
              style={{
                background: "var(--color-surface)cc",
                color: "var(--color-text-muted)",
              }}
            >
              Agent Graph - {agents.length} agents, {tasks.length} tasks
            </div>
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
          {/* Sidebar Tab Bar */}
          <div
            className="flex gap-0.5 p-2"
            style={{ borderBottom: "1px solid var(--color-surface-overlay)" }}
          >
            {SIDEBAR_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSidebarTab(tab.value)}
                className="relative flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  color:
                    sidebarTab === tab.value
                      ? "var(--color-text-inverse)"
                      : "var(--color-text-muted)",
                }}
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

          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <AnimatePresence mode="wait">
              {sidebarTab === "timeline" && (
                <motion.div
                  key="timeline"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full"
                >
                  <TimelineStream events={events} />
                </motion.div>
              )}
              {sidebarTab === "inspector" && (
                <motion.div
                  key="inspector"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <InspectorPanel
                    selectedNode={selectedNode}
                    agents={agents}
                    tasks={tasks}
                  />
                </motion.div>
              )}
              {sidebarTab === "outcome" && (
                <motion.div
                  key="outcome"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full"
                >
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
        style={{
          background: "var(--color-surface-raised)",
          borderTop: "1px solid var(--color-surface-overlay)",
        }}
      >
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            onClick={handlePlayPause}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
            style={{
              background: "var(--color-surface-overlay)",
              color: "var(--color-text-primary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--color-accent)25";
              e.currentTarget.style.color = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--color-surface-overlay)";
              e.currentTarget.style.color = "var(--color-text-primary)";
            }}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="2" y="1" width="3.5" height="12" rx="1" />
                <rect x="8.5" y="1" width="3.5" height="12" rx="1" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M3 1.5v11l9-5.5z" />
              </svg>
            )}
          </button>

          {/* Speed */}
          <button
            onClick={handleSpeedCycle}
            className="rounded-md px-2.5 py-1 text-xs font-mono font-bold transition-colors"
            style={{
              background: "var(--color-surface-overlay)",
              color: "var(--color-text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-secondary)";
            }}
            title="Playback speed"
          >
            {speed}x
          </button>
        </div>

        {/* Event counter */}
        <div className="flex items-center gap-4">
          <span
            className="text-xs font-mono tabular-nums"
            style={{ color: "var(--color-text-muted)" }}
          >
            {events.length} events
          </span>

          <div
            className="h-4 w-px"
            style={{ background: "var(--color-surface-overlay)" }}
          />

          <span
            className="text-xs font-mono"
            style={{ color: "var(--color-text-muted)" }}
          >
            run/{runId.slice(0, 12)}
          </span>
        </div>
      </footer>
    </div>
  );
}
