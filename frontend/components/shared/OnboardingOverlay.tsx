"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STORAGE_KEY = "mom-onboarding-dismissed";

interface Step {
  title: string;
  description: string;
  region: "graph" | "sidebar" | "playback" | "welcome";
}

const STEPS: Step[] = [
  {
    title: "Welcome to the Simulation Workspace",
    description:
      "This is where six AI agents collaborate to build a coordinated operating plan from your scenario. Let's walk through the workspace.",
    region: "welcome",
  },
  {
    title: "Agent Graph",
    description:
      "The force-directed graph shows agents (large nodes) and their assigned tasks (smaller nodes) in real time. Click any node to inspect it.",
    region: "graph",
  },
  {
    title: "Timeline & Inspector",
    description:
      "The sidebar has three tabs: Timeline streams every agent action live, Inspector shows details for the selected node, and Outcome presents the final operating plan.",
    region: "sidebar",
  },
  {
    title: "Playback Controls",
    description:
      "Pause the simulation or change playback speed. Event count and run ID are shown on the right.",
    region: "playback",
  },
];

// Region highlight positions (percentages relative to viewport)
const REGION_HIGHLIGHTS: Record<
  string,
  { top: string; left: string; width: string; height: string }
> = {
  welcome: { top: "25%", left: "25%", width: "50%", height: "50%" },
  graph: { top: "48px", left: "0", width: "70%", height: "calc(100% - 48px - 44px)" },
  sidebar: { top: "48px", left: "70%", width: "30%", height: "calc(100% - 48px - 44px)" },
  playback: { top: "calc(100% - 44px)", left: "0", width: "100%", height: "44px" },
};

export default function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // SSR / storage blocked
    }
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }, [step, dismiss]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  if (!visible) return null;

  const current = STEPS[step];
  const highlight = REGION_HIGHLIGHTS[current.region];
  const isWelcome = current.region === "welcome";

  // Position the tooltip card near the highlighted region
  const tooltipStyle = (): React.CSSProperties => {
    switch (current.region) {
      case "graph":
        return { top: "50%", left: "35%", transform: "translate(-50%, -50%)" };
      case "sidebar":
        return { top: "50%", right: "16px", transform: "translateY(-50%)" };
      case "playback":
        return { bottom: "56px", left: "50%", transform: "translateX(-50%)" };
      default:
        return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="onboarding-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100]"
        style={{ pointerEvents: "auto" }}
      >
        {/* Dark backdrop with cutout for highlighted region */}
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.7)" }}>
          {!isWelcome && (
            <motion.div
              key={current.region}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="absolute"
              style={{
                ...highlight,
                background: "transparent",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.7)",
                border: "2px solid var(--color-accent)",
                borderRadius: "8px",
                zIndex: 1,
              }}
            />
          )}
        </div>

        {/* Tooltip Card */}
        <motion.div
          key={`tooltip-${step}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="absolute z-10 w-[360px] rounded-xl p-6"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-surface-overlay)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            ...tooltipStyle(),
          }}
        >
          {/* Step counter */}
          <div className="flex items-center gap-2 mb-3">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full transition-colors duration-300"
                style={{
                  background: i <= step ? "var(--color-accent)" : "var(--color-surface-overlay)",
                }}
              />
            ))}
          </div>

          <h3
            className="text-base font-semibold mb-2"
            style={{ color: "var(--color-text-primary)" }}
          >
            {current.title}
          </h3>
          <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--color-text-secondary)" }}>
            {current.description}
          </p>

          <div className="flex items-center justify-between">
            <button
              onClick={dismiss}
              className="text-xs transition-colors"
              style={{ color: "var(--color-text-muted)" }}
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={prev}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: "var(--color-surface-overlay)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Back
                </button>
              )}
              <button
                onClick={next}
                className="rounded-lg px-4 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: "var(--color-accent)",
                  color: "var(--color-text-inverse)",
                }}
              >
                {step < STEPS.length - 1 ? "Next" : "Got it"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
