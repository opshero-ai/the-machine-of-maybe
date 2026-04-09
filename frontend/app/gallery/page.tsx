"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { GALLERY_SCENARIOS, type GalleryScenario } from "@/lib/showcase-data";

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  medium: { bg: "var(--color-accent)20", text: "var(--color-accent)" },
  hard: { bg: "#f9731620", text: "#f97316" },
  impossible: { bg: "#ef444420", text: "#ef4444" },
};

const DOMAINS = ["All", ...Array.from(new Set(GALLERY_SCENARIOS.map((s) => s.domain)))];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

function ScenarioCard({ scenario, index }: { scenario: GalleryScenario; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const diff = DIFFICULTY_COLORS[scenario.difficulty] ?? DIFFICULTY_COLORS.medium;

  return (
    <motion.div
      variants={itemVariants}
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-surface-overlay)",
      }}
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold"
              style={{ background: `${scenario.domainColor}15`, color: scenario.domainColor }}
            >
              {index + 1}
            </span>
            <div>
              <h3 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {scenario.title}
              </h3>
              <span className="text-xs" style={{ color: scenario.domainColor }}>
                {scenario.domain}
              </span>
            </div>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide flex-shrink-0"
            style={{ background: diff.bg, color: diff.text }}
          >
            {scenario.difficulty}
          </span>
        </div>

        <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
          {scenario.summary}
        </p>

        {/* Stats Row */}
        <div
          className="flex items-center gap-4 rounded-lg px-4 py-2.5 mb-4"
          style={{ background: "var(--color-surface)" }}
        >
          <div className="text-center flex-1">
            <div className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
              {scenario.agents}
            </div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              Agents
            </div>
          </div>
          <div className="h-6 w-px" style={{ background: "var(--color-surface-overlay)" }} />
          <div className="text-center flex-1">
            <div className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
              {scenario.tasks}
            </div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              Tasks
            </div>
          </div>
          <div className="h-6 w-px" style={{ background: "var(--color-surface-overlay)" }} />
          <div className="text-center flex-1">
            <div className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
              {scenario.duration}
            </div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              Duration
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {scenario.keyMetrics.map((m) => (
            <div
              key={m.label}
              className="rounded-md px-3 py-2"
              style={{ background: "var(--color-surface)" }}
            >
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--color-text-muted)" }}>
                {m.label}
              </div>
              <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>

        {/* Outcome */}
        <div
          className="rounded-lg px-4 py-3 mb-4"
          style={{ background: "var(--color-surface)", borderLeft: `3px solid ${scenario.domainColor}` }}
        >
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--color-accent)" }}>
            Outcome
          </div>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {scenario.outcome}
          </p>
        </div>

        {/* Expandable Highlights */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs transition-colors mb-3"
          style={{ color: "var(--color-text-muted)" }}
        >
          <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }} className="inline-block">
            &#9656;
          </motion.span>
          {expanded ? "Hide" : "Show"} orchestration highlights
        </button>

        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-2 mb-4 overflow-hidden"
          >
            {scenario.highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span
                  className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ background: scenario.domainColor }}
                />
                <span style={{ color: "var(--color-text-secondary)" }}>{h}</span>
              </div>
            ))}
          </motion.div>
        )}

        {/* Action */}
        <div className="flex items-center gap-3">
          {scenario.hasExample ? (
            <Link
              href="/simulation/example"
              className="rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-200 hover:scale-[1.02]"
              style={{ background: "var(--color-accent)", color: "var(--color-text-inverse)" }}
            >
              View Full Simulation
            </Link>
          ) : (
            <span
              className="rounded-lg px-4 py-2 text-xs font-medium"
              style={{ background: "var(--color-surface-overlay)", color: "var(--color-text-muted)" }}
            >
              Summary Only
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function GalleryPage() {
  const [domainFilter, setDomainFilter] = useState("All");

  const filtered =
    domainFilter === "All"
      ? GALLERY_SCENARIOS
      : GALLERY_SCENARIOS.filter((s) => s.domain === domainFilter);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header
        className="sticky top-0 z-50 px-6 py-4"
        style={{
          background: "var(--color-surface)e6",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--color-surface-overlay)",
        }}
      >
        <div className="mx-auto max-w-5xl flex items-center justify-between">
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
            <h1 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Scenario Gallery
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-200 hover:scale-[1.02]"
            style={{ background: "var(--color-accent)", color: "var(--color-text-inverse)" }}
          >
            Run Your Own
          </Link>
        </div>
      </header>

      {/* Intro */}
      <section className="px-6 pt-12 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-5xl text-center"
        >
          <h2 className="text-3xl font-light tracking-tight sm:text-4xl" style={{ color: "var(--color-text-primary)" }}>
            Pre-run{" "}
            <span className="font-semibold" style={{ color: "var(--color-accent)" }}>Showcases</span>
          </h2>
          <p className="mt-3 text-base max-w-2xl mx-auto" style={{ color: "var(--color-text-secondary)" }}>
            Each scenario was orchestrated by six AI agents collaborating in real time.
            Explore the outcomes across different domains to see how multi-agent orchestration
            handles complexity.
          </p>
        </motion.div>
      </section>

      {/* Domain Filter */}
      <section className="px-6 pb-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center gap-2">
            {DOMAINS.map((domain) => (
              <button
                key={domain}
                onClick={() => setDomainFilter(domain)}
                className="rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-200"
                style={{
                  background: domainFilter === domain ? "var(--color-accent)" : "var(--color-surface-raised)",
                  color: domainFilter === domain ? "var(--color-text-inverse)" : "var(--color-text-secondary)",
                  border: `1px solid ${domainFilter === domain ? "var(--color-accent)" : "var(--color-surface-overlay)"}`,
                }}
              >
                {domain}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="px-6 pb-16">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mx-auto max-w-5xl grid grid-cols-1 gap-6 lg:grid-cols-2"
        >
          {filtered.map((scenario, idx) => (
            <ScenarioCard key={scenario.id} scenario={scenario} index={idx} />
          ))}
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-8 text-center" style={{ borderColor: "var(--color-surface-overlay)" }}>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Built with organized intelligence.{" "}
          <a
            href="https://opshero.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors duration-200"
            style={{ color: "var(--color-text-secondary)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-secondary)"; }}
          >
            OpsHero
          </a>
        </p>
      </footer>
    </div>
  );
}
