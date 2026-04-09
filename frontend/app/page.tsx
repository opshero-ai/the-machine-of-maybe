"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { BUILT_IN_TEMPLATES, getRandomTemplate } from "@/lib/templates";
import { createScenario, startRun } from "@/lib/api";
import type {
  UrgencyLevel,
  RiskTolerance,
  AutonomyLevel,
  SimulationMode,
} from "@/types/entities";

// ─── Example Chips ───

const EXAMPLE_CHIPS = BUILT_IN_TEMPLATES.slice(0, 3).map((t) => ({
  label: t.title,
  prompt: t.prompt,
}));

// ─── How It Works Steps ───

const STEPS = [
  {
    number: "01",
    title: "Describe",
    description: "Write a messy, real-world scenario in plain language.",
  },
  {
    number: "02",
    title: "Compile",
    description: "The system parses your chaos into structured constraints.",
  },
  {
    number: "03",
    title: "Orchestrate",
    description: "Specialized agents collaborate, negotiate, and build a plan.",
  },
  {
    number: "04",
    title: "Outcome",
    description: "A complete operating plan with risks, approvals, and alternatives.",
  },
];

// ─── Stagger Animation Variants ───

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  },
};

// ─── Page Component ───

export default function HomePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [showControls, setShowControls] = useState(false);
  const [urgency, setUrgency] = useState<UrgencyLevel>("medium");
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>("balanced");
  const [autonomy, setAutonomy] = useState<AutonomyLevel>("guided");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSurpriseMe = useCallback(() => {
    const template = getRandomTemplate();
    setPrompt(template.prompt);
  }, []);

  const handleChipClick = useCallback((chipPrompt: string) => {
    setPrompt(chipPrompt);
  }, []);

  const handleRunSimulation = useCallback(async () => {
    if (!prompt.trim()) return;
    setIsRunning(true);
    setError(null);

    try {
      const scenarioRes = await createScenario(prompt, {
        urgency,
        risk_tolerance: riskTolerance,
        autonomy,
      });

      if (scenarioRes.error) {
        setError(scenarioRes.error);
        setIsRunning(false);
        return;
      }

      const mode: SimulationMode =
        riskTolerance === "conservative"
          ? "prove"
          : autonomy === "autonomous"
            ? "play"
            : "explore";

      const runRes = await startRun(scenarioRes.data.id, mode);

      if (runRes.error) {
        setError(runRes.error);
        setIsRunning(false);
        return;
      }

      router.push(`/simulation/${runRes.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsRunning(false);
    }
  }, [prompt, urgency, riskTolerance, autonomy, router]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ─── Hero ─── */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-2xl mx-auto flex flex-col items-center"
        >
          {/* Title */}
          <motion.h1
            variants={itemVariants}
            className="text-center text-5xl font-light tracking-tight sm:text-6xl md:text-7xl"
            style={{ color: "var(--color-text-primary)" }}
          >
            The Machine
            <br />
            <span className="font-semibold" style={{ color: "var(--color-accent)" }}>
              of Maybe
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={itemVariants}
            className="mt-5 text-center text-lg"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Describe a mess. Watch a system organize it.
          </motion.p>

          {/* Prompt Textarea */}
          <motion.div variants={itemVariants} className="mt-10 w-full">
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A shipping company just lost 60% of its fleet to a software glitch. 2,000 packages sit undelivered..."
                rows={4}
                className="w-full resize-none rounded-xl border-2 px-5 py-4 text-base leading-relaxed transition-all duration-300 placeholder:opacity-40"
                style={{
                  background: "var(--color-surface-raised)",
                  borderColor: prompt
                    ? "var(--color-accent)"
                    : "var(--color-surface-overlay)",
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-sans)",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-accent)";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 4px rgba(226, 163, 54, 0.12)";
                }}
                onBlur={(e) => {
                  if (!prompt) {
                    e.currentTarget.style.borderColor =
                      "var(--color-surface-overlay)";
                  }
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
          </motion.div>

          {/* Example Chips */}
          <motion.div
            variants={itemVariants}
            className="mt-4 flex flex-wrap items-center justify-center gap-2"
          >
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip.label}
                onClick={() => handleChipClick(chip.prompt)}
                className="rounded-full px-4 py-1.5 text-sm transition-all duration-200 hover:scale-[1.03]"
                style={{
                  background: "var(--color-surface-overlay)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-accent-dim)";
                  e.currentTarget.style.color = "var(--color-text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "transparent";
                  e.currentTarget.style.color = "var(--color-text-secondary)";
                }}
              >
                {chip.label}
              </button>
            ))}

            {/* Surprise Me */}
            <button
              onClick={handleSurpriseMe}
              className="rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 hover:scale-[1.03]"
              style={{
                background: "transparent",
                color: "var(--color-accent)",
                border: "1px solid var(--color-accent-dim)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-accent)15";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span className="mr-1.5">&#x2684;</span>
              Surprise Me
            </button>
          </motion.div>

          {/* Expandable Controls */}
          <motion.div variants={itemVariants} className="mt-6 w-full">
            <button
              onClick={() => setShowControls(!showControls)}
              className="flex items-center gap-2 text-sm transition-colors"
              style={{ color: "var(--color-text-muted)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--color-text-muted)";
              }}
            >
              <motion.span
                animate={{ rotate: showControls ? 90 : 0 }}
                transition={{ duration: 0.2 }}
                className="inline-block"
              >
                &#9656;
              </motion.span>
              Simulation controls
            </button>

            <AnimatePresence>
              {showControls && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {/* Urgency */}
                    <ControlGroup
                      label="Urgency"
                      value={urgency}
                      options={["low", "medium", "high", "critical"]}
                      onChange={(v) => setUrgency(v as UrgencyLevel)}
                    />
                    {/* Risk Tolerance */}
                    <ControlGroup
                      label="Risk Tolerance"
                      value={riskTolerance}
                      options={["conservative", "balanced", "aggressive"]}
                      onChange={(v) => setRiskTolerance(v as RiskTolerance)}
                    />
                    {/* Autonomy */}
                    <ControlGroup
                      label="Autonomy"
                      value={autonomy}
                      options={["supervised", "guided", "autonomous"]}
                      onChange={(v) => setAutonomy(v as AutonomyLevel)}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-4 w-full rounded-lg px-4 py-3 text-sm"
                style={{
                  background: "var(--color-state-failed)15",
                  color: "var(--color-state-failed)",
                }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Run Button */}
          <motion.div variants={itemVariants} className="mt-8">
            <motion.button
              onClick={handleRunSimulation}
              disabled={!prompt.trim() || isRunning}
              whileHover={prompt.trim() && !isRunning ? { scale: 1.03 } : {}}
              whileTap={prompt.trim() && !isRunning ? { scale: 0.98 } : {}}
              className="relative rounded-xl px-10 py-3.5 text-base font-semibold transition-all duration-300 disabled:cursor-not-allowed"
              style={{
                background:
                  !prompt.trim() || isRunning
                    ? "var(--color-surface-overlay)"
                    : "var(--color-accent)",
                color:
                  !prompt.trim() || isRunning
                    ? "var(--color-text-muted)"
                    : "var(--color-text-inverse)",
                boxShadow:
                  prompt.trim() && !isRunning
                    ? "0 0 24px rgba(226, 163, 54, 0.25)"
                    : "none",
              }}
            >
              {isRunning ? (
                <span className="flex items-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="inline-block"
                  >
                    &#x2699;
                  </motion.span>
                  Compiling...
                </span>
              ) : (
                "Run Simulation"
              )}
            </motion.button>
          </motion.div>
        </motion.div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="border-t px-6 py-20" style={{ borderColor: "var(--color-surface-overlay)" }}>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-4xl"
        >
          <h2
            className="text-center text-sm font-semibold uppercase tracking-widest mb-12"
            style={{ color: "var(--color-text-muted)" }}
          >
            How it works
          </h2>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, idx) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1, duration: 0.5 }}
                className="text-center"
              >
                <div
                  className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold font-mono"
                  style={{
                    background: "var(--color-surface-raised)",
                    color: "var(--color-accent)",
                    border: "1px solid var(--color-surface-overlay)",
                  }}
                >
                  {step.number}
                </div>
                <h3
                  className="text-lg font-semibold mb-2"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {step.title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ─── Footer ─── */}
      <footer
        className="border-t px-6 py-8 text-center"
        style={{ borderColor: "var(--color-surface-overlay)" }}
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Built with organized intelligence.{" "}
          <a
            href="https://opshero.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors duration-200"
            style={{ color: "var(--color-text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-secondary)";
            }}
          >
            OpsHero
          </a>
        </p>
      </footer>
    </div>
  );
}

// ─── Control Group ───

function ControlGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        className="block text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </label>
      <div
        className="flex rounded-lg p-0.5"
        style={{ background: "var(--color-surface)" }}
      >
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className="relative flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors"
            style={{
              color:
                value === opt
                  ? "var(--color-text-inverse)"
                  : "var(--color-text-muted)",
            }}
          >
            {value === opt && (
              <motion.div
                layoutId={`control-${label}`}
                className="absolute inset-0 rounded-md"
                style={{ background: "var(--color-accent)" }}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10">{opt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
