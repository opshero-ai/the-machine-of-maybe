export type FactCategory =
  | "science"
  | "history"
  | "nature"
  | "technology"
  | "psychology"
  | "geography"
  | "space"
  | "medicine"
  | "art"
  | "culture";

export const CATEGORY_CONFIG: Record<
  FactCategory,
  { label: string; color: string; icon: string }
> = {
  science: { label: "Science", color: "#3b82f6", icon: "🔬" },
  history: { label: "History", color: "#f59e0b", icon: "📜" },
  nature: { label: "Nature", color: "#10b981", icon: "🌿" },
  technology: { label: "Technology", color: "#8b5cf6", icon: "⚡" },
  psychology: { label: "Psychology", color: "#ec4899", icon: "🧠" },
  geography: { label: "Geography", color: "#06b6d4", icon: "🌍" },
  space: { label: "Space", color: "#6366f1", icon: "🚀" },
  medicine: { label: "Medicine", color: "#ef4444", icon: "🩺" },
  art: { label: "Art", color: "#f97316", icon: "🎨" },
  culture: { label: "Culture", color: "#a855f7", icon: "🎭" },
};
