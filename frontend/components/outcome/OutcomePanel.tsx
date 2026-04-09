"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Outcome, PlanSection, RiskEntry, ReviewCheckpoint, AlternativeStrategy } from "@/types/entities";

type OutcomeTab = "plan" | "risks" | "approvals" | "assumptions" | "alternatives";

const TABS: { value: OutcomeTab; label: string }[] = [
  { value: "plan", label: "Plan" },
  { value: "risks", label: "Risks" },
  { value: "approvals", label: "Approvals" },
  { value: "assumptions", label: "Assumptions" },
  { value: "alternatives", label: "Alternatives" },
];

const SEVERITY_COLORS: Record<string, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

const LIKELIHOOD_LABELS: Record<string, string> = {
  unlikely: "Unlikely",
  possible: "Possible",
  likely: "Likely",
  certain: "Certain",
};

// ─── Plan Tab ───

function PlanView({ sections }: { sections: PlanSection[] }) {
  return (
    <div className="space-y-4">
      {sections.map((section, idx) => (
        <motion.div
          key={section.phase}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.08, duration: 0.3 }}
          className="rounded-lg p-4"
          style={{ background: "var(--color-surface)" }}
        >
          <div className="flex items-baseline gap-3 mb-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold"
              style={{ background: "var(--color-accent)20", color: "var(--color-accent)" }}
            >
              {idx + 1}
            </span>
            <div>
              <h4
                className="text-sm font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                {section.title}
              </h4>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {section.phase} - {section.estimated_effort}
              </span>
            </div>
          </div>
          <p
            className="text-sm mb-3 pl-9"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {section.description}
          </p>
          <ul className="space-y-1 pl-9">
            {section.tasks.map((task, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span
                  className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ background: "var(--color-accent-dim)" }}
                />
                <span style={{ color: "var(--color-text-primary)" }}>{task}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 pl-9">
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Owner: {section.owner}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Risks Tab ───

function RisksView({ risks }: { risks: RiskEntry[] }) {
  return (
    <div className="space-y-3">
      {risks.map((risk, idx) => {
        const color = SEVERITY_COLORS[risk.severity] ?? "#94a3b8";
        return (
          <motion.div
            key={risk.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.06, duration: 0.3 }}
            className="rounded-lg p-4"
            style={{
              background: "var(--color-surface)",
              borderLeft: `3px solid ${color}`,
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4
                className="text-sm font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                {risk.title}
              </h4>
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0"
                style={{ background: `${color}20`, color }}
              >
                {risk.severity}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-3">
              <div>
                <span style={{ color: "var(--color-text-muted)" }}>Likelihood: </span>
                <span style={{ color: "var(--color-text-secondary)" }}>
                  {LIKELIHOOD_LABELS[risk.likelihood] ?? risk.likelihood}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--color-text-muted)" }}>Owner: </span>
                <span style={{ color: "var(--color-text-secondary)" }}>{risk.owner}</span>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Impact
                </span>
                <p style={{ color: "var(--color-text-secondary)" }}>{risk.impact}</p>
              </div>
              <div>
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Mitigation
                </span>
                <p style={{ color: "var(--color-text-secondary)" }}>{risk.mitigation}</p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Approvals Tab ───

function ApprovalsView({ checkpoints }: { checkpoints: ReviewCheckpoint[] }) {
  return (
    <div className="space-y-2">
      {checkpoints.map((cp, idx) => (
        <motion.div
          key={cp.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.06, duration: 0.25 }}
          className="flex items-start gap-3 rounded-lg p-3"
          style={{ background: "var(--color-surface)" }}
        >
          {/* Checkbox placeholder */}
          <div
            className="mt-0.5 flex h-5 w-5 items-center justify-center rounded border-2 flex-shrink-0"
            style={{
              borderColor: cp.required ? "var(--color-accent)" : "var(--color-text-muted)",
            }}
          >
            <span
              className="text-xs"
              style={{
                color: cp.required ? "var(--color-accent)" : "var(--color-text-muted)",
              }}
            >
              {cp.required ? "!" : "?"}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4
                className="text-sm font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                {cp.title}
              </h4>
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                style={{
                  background: cp.required ? "var(--color-accent)20" : "var(--color-surface-overlay)",
                  color: cp.required ? "var(--color-accent)" : "var(--color-text-muted)",
                }}
              >
                {cp.required ? "Required" : "Optional"}
              </span>
            </div>
            <p
              className="mt-0.5 text-xs"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {cp.reason}
            </p>
            <span
              className="mt-1 inline-block text-[10px] font-mono"
              style={{ color: "var(--color-text-muted)" }}
            >
              {cp.phase}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Assumptions Tab ───

function AssumptionsView({ assumptions }: { assumptions: string[] }) {
  return (
    <ul className="space-y-2">
      {assumptions.map((assumption, idx) => (
        <motion.li
          key={idx}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.05, duration: 0.25 }}
          className="flex items-start gap-3 rounded-lg p-3"
          style={{ background: "var(--color-surface)" }}
        >
          <span
            className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0"
            style={{ background: "var(--color-surface-overlay)", color: "var(--color-text-muted)" }}
          >
            {idx + 1}
          </span>
          <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {assumption}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

// ─── Alternatives Tab ───

function AlternativesView({ alternatives }: { alternatives: AlternativeStrategy[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {alternatives.map((alt, idx) => {
        const isOpen = expanded === alt.id;
        const confidence = Math.round(alt.confidence * 100);
        const barColor =
          confidence >= 75
            ? "var(--color-state-completed)"
            : confidence >= 50
              ? "var(--color-accent)"
              : "var(--color-state-blocked)";

        return (
          <motion.div
            key={alt.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08, duration: 0.3 }}
            className="rounded-lg overflow-hidden"
            style={{ background: "var(--color-surface)" }}
          >
            <button
              onClick={() => setExpanded(isOpen ? null : alt.id)}
              className="w-full text-left p-4 transition-colors hover:bg-[var(--color-surface-overlay)]"
            >
              <div className="flex items-start justify-between gap-2">
                <h4
                  className="text-sm font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {alt.title}
                </h4>
                <span
                  className="text-xs font-mono tabular-nums flex-shrink-0"
                  style={{ color: barColor }}
                >
                  {confidence}%
                </span>
              </div>
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {alt.description}
              </p>
              {/* Confidence bar */}
              <div
                className="mt-2 h-1 rounded-full"
                style={{ background: "var(--color-surface-overlay)" }}
              >
                <motion.div
                  className="h-1 rounded-full"
                  style={{ background: barColor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${confidence}%` }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </button>

            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div
                    className="px-4 pb-4 pt-0"
                    style={{
                      borderTop: "1px solid var(--color-surface-overlay)",
                    }}
                  >
                    <div className="pt-3">
                      <span
                        className="text-xs font-medium"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Trade-offs
                      </span>
                      <p
                        className="mt-1 text-sm"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {alt.trade_offs}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Export Helpers ───

function buildMarkdownReport(outcome: Outcome): string {
  const lines: string[] = [];
  lines.push("# Simulation Outcome Report");
  lines.push("");
  lines.push("## Executive Summary");
  lines.push(outcome.executive_summary);
  lines.push("");

  lines.push("## Operating Plan");
  outcome.operating_plan.forEach((s, i) => {
    lines.push(`### ${i + 1}. ${s.title} (${s.phase})`);
    lines.push(`**Owner:** ${s.owner} | **Effort:** ${s.estimated_effort}`);
    lines.push("");
    lines.push(s.description);
    lines.push("");
    s.tasks.forEach((t) => lines.push(`- ${t}`));
    lines.push("");
  });

  lines.push("## Risk Register");
  outcome.risk_register.forEach((r) => {
    lines.push(`### ${r.title}`);
    lines.push(`**Severity:** ${r.severity} | **Likelihood:** ${r.likelihood} | **Owner:** ${r.owner}`);
    lines.push("");
    lines.push(`**Impact:** ${r.impact}`);
    lines.push("");
    lines.push(`**Mitigation:** ${r.mitigation}`);
    lines.push("");
  });

  lines.push("## Review Checkpoints");
  outcome.human_review_checkpoints.forEach((c) => {
    lines.push(`- **${c.title}** (${c.phase}) ${c.required ? "[REQUIRED]" : "[Optional]"} — ${c.reason}`);
  });
  lines.push("");

  lines.push("## Assumptions");
  outcome.assumptions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  lines.push("");

  lines.push("## Alternative Strategies");
  outcome.alternatives.forEach((a) => {
    lines.push(`### ${a.title} (${Math.round(a.confidence * 100)}% confidence)`);
    lines.push(a.description);
    lines.push(`**Trade-offs:** ${a.trade_offs}`);
    lines.push("");
  });

  if (outcome.suggested_metrics.length > 0) {
    lines.push("## Suggested Metrics");
    outcome.suggested_metrics.forEach((m) => {
      lines.push(`- **${m.name}:** ${m.description} (Target: ${m.target})`);
    });
    lines.push("");
  }

  if (outcome.confidence_notes.length > 0) {
    lines.push("## Confidence Notes");
    outcome.confidence_notes.forEach((n) => lines.push(`- ${n}`));
    lines.push("");
  }

  lines.push("---");
  lines.push("*Generated by The Machine of Maybe — OpsHero*");

  return lines.join("\n");
}

// ─── Main Component ───

interface OutcomePanelProps {
  outcome: Outcome | null;
}

export default function OutcomePanel({ outcome }: OutcomePanelProps) {
  const [activeTab, setActiveTab] = useState<OutcomeTab>("plan");
  const [copied, setCopied] = useState(false);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleDownload = useCallback(() => {
    if (!outcome) return;
    const md = buildMarkdownReport(outcome);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `simulation-outcome-${outcome.run_id?.slice(0, 8) ?? "report"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [outcome]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (!outcome) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center"
        style={{ color: "var(--color-text-muted)" }}
      >
        <div className="text-3xl mb-3 opacity-40">...</div>
        <p className="text-sm">Outcome will appear when the simulation completes.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Export Actions Bar */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: copied ? "var(--color-state-completed)20" : "var(--color-surface)",
            color: copied ? "var(--color-state-completed)" : "var(--color-text-secondary)",
            border: `1px solid ${copied ? "var(--color-state-completed)40" : "var(--color-surface-overlay)"}`,
          }}
        >
          {copied ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 1H4a1 1 0 00-1 1v8a1 1 0 001 1h6a1 1 0 001-1V4L8 1z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 4v7a1 1 0 001 1h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/></svg>
          )}
          {copied ? "Copied!" : "Share Link"}
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: "var(--color-surface)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-surface-overlay)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          Export .md
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: "var(--color-surface)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-surface-overlay)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="5" width="8" height="4" rx="0.5" stroke="currentColor" strokeWidth="1"/><path d="M3 5V2h6v3" stroke="currentColor" strokeWidth="1"/><path d="M4 7h4M4 8.5h2" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/></svg>
          Print
        </button>
      </div>

      {/* Executive Summary */}
      <div
        className="rounded-lg p-4 mb-4"
        style={{ background: "var(--color-surface)" }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-2"
          style={{ color: "var(--color-accent)" }}
        >
          Executive Summary
        </h3>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {outcome.executive_summary}
        </p>
      </div>

      {/* Tab Bar */}
      <div
        className="flex gap-0.5 rounded-lg p-1 mb-4"
        style={{ background: "var(--color-surface)" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className="relative flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
            style={{
              color:
                activeTab === tab.value
                  ? "var(--color-text-inverse)"
                  : "var(--color-text-secondary)",
            }}
          >
            {activeTab === tab.value && (
              <motion.div
                layoutId="outcome-tab-bg"
                className="absolute inset-0 rounded-md"
                style={{ background: "var(--color-accent)" }}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto pr-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "plan" && (
              <PlanView sections={outcome.operating_plan} />
            )}
            {activeTab === "risks" && (
              <RisksView risks={outcome.risk_register} />
            )}
            {activeTab === "approvals" && (
              <ApprovalsView checkpoints={outcome.human_review_checkpoints} />
            )}
            {activeTab === "assumptions" && (
              <AssumptionsView assumptions={outcome.assumptions} />
            )}
            {activeTab === "alternatives" && (
              <AlternativesView alternatives={outcome.alternatives} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
