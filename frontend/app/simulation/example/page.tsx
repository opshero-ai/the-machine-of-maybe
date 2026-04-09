"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  showcaseRun,
  showcaseAgents,
  showcaseTasks,
  showcaseEvents,
  showcaseOutcome,
} from "@/lib/showcase-data";
import type { SimulationMode } from "@/types/entities";
import ModeToggle from "@/components/shared/ModeToggle";
import StatusBadge from "@/components/shared/StatusBadge";
import TimelineStream from "@/components/timeline/TimelineStream";
import InspectorPanel from "@/components/inspector/InspectorPanel";
import OutcomePanel from "@/components/outcome/OutcomePanel";
import ForceGraph from "@/components/graph/ForceGraph";
import OnboardingOverlay from "@/components/shared/OnboardingOverlay";

type SidebarTab = "timeline" | "inspector" | "outcome";

const SIDEBAR_TABS: { value: SidebarTab; label: string }[] = [
  { value: "timeline", label: "Timeline" },
  { value: "inspector", label: "Inspector" },
  { value: "outcome", label: "Outcome" },
];

const SPEEDS = [1, 2, 4] as const;

export default function ExampleSimulationPage() {
  const run = showcaseRun;
  const agents = showcaseAgents;
  const tasks = showcaseTasks;
  const events = showcaseEvents;
  const outcome = showcaseOutcome;

  const [mode, setMode] = useState<SimulationMode>(run.mode);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("timeline");
  const [selectedNode, setSelectedNode] = useState<{ type: "agent" | "task"; id: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [showBanner, setShowBanner] = useState(true);

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

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <OnboardingOverlay />

      {/* ─── Example Banner ─── */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
            style={{ background: "var(--color-accent)10", borderBottom: "1px solid var(--color-accent)30" }}
          >
            <div className="flex items-center justify-between px-5 py-2.5">
              <p className="text-sm" style={{ color: "var(--color-accent)" }}>
                <strong>Example Simulation</strong> &mdash; This is a pre-run showcase of a data center outage response orchestrated by 6 AI agents in 18 minutes.
              </p>
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="rounded-lg px-3 py-1 text-xs font-medium transition-colors"
                  style={{ background: "var(--color-accent)", color: "var(--color-text-inverse)" }}
                >
                  Try Your Own
                </Link>
                <button
                  onClick={() => setShowBanner(false)}
                  className="text-sm"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  &#x2715;
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          <StatusBadge status={run.status} variant="run" size="md" />
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
                animate={{ width: `${run.progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="text-xs font-mono tabular-nums" style={{ color: "var(--color-text-muted)" }}>
              {run.progress}%
            </span>
          </div>
          <ModeToggle mode={mode} onModeChange={handleModeChange} />
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Graph */}
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
            <ForceGraph
              agents={agents}
              tasks={tasks}
              selectedNodeId={selectedNode?.id ?? null}
              onNodeClick={handleNodeClick}
              isPlaying={isPlaying}
            />
            <div
              className="absolute bottom-4 left-4 rounded-md px-3 py-1.5 text-xs font-mono"
              style={{ background: "var(--color-surface)cc", color: "var(--color-text-muted)" }}
            >
              Agent Graph &mdash; {agents.length} agents, {tasks.length} tasks
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
            showcase/dc-outage
          </span>
        </div>
      </footer>
    </div>
  );
}
