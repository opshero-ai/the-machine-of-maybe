"use client";

import { motion } from "framer-motion";
import type { SimulationMode } from "@/types/entities";

const MODES: { value: SimulationMode; label: string; description: string }[] = [
  { value: "play", label: "Play", description: "Watch it unfold" },
  { value: "explore", label: "Explore", description: "Pause and inspect" },
  { value: "prove", label: "Prove", description: "Verify every step" },
];

interface ModeToggleProps {
  mode: SimulationMode;
  onModeChange: (mode: SimulationMode) => void;
}

export default function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="relative flex items-center rounded-full bg-[var(--color-surface-overlay)] p-1">
      {MODES.map((m) => (
        <button
          key={m.value}
          onClick={() => onModeChange(m.value)}
          className="relative z-10 px-4 py-1.5 text-sm font-medium transition-colors duration-200"
          style={{
            color:
              mode === m.value
                ? "var(--color-text-inverse)"
                : "var(--color-text-secondary)",
          }}
          title={m.description}
        >
          {mode === m.value && (
            <motion.div
              layoutId="mode-indicator"
              className="absolute inset-0 rounded-full"
              style={{ background: "var(--color-accent)" }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 35,
              }}
            />
          )}
          <span className="relative z-10">{m.label}</span>
        </button>
      ))}
    </div>
  );
}
