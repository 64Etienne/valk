// Re-export from main types for convenience
export type { AnalysisResult, CategoryScore } from "@/types";

// Score color mapping
export function getScoreColor(score: number): string {
  if (score <= 25) return "text-green-400";
  if (score <= 50) return "text-amber-400";
  if (score <= 75) return "text-orange-400";
  return "text-red-400";
}

export function getScoreBgColor(score: number): string {
  if (score <= 25) return "bg-green-500";
  if (score <= 50) return "bg-amber-500";
  if (score <= 75) return "bg-orange-500";
  return "bg-red-500";
}

export function getScoreLabel(score: number): string {
  if (score <= 25) return "Normal";
  if (score <= 50) return "Léger";
  if (score <= 75) return "Modéré";
  return "Significatif";
}

export function getConfidenceBadgeVariant(confidence: "low" | "moderate" | "high"): "warning" | "info" | "success" {
  switch (confidence) {
    case "low": return "warning";
    case "moderate": return "info";
    case "high": return "success";
  }
}

export function getConfidenceLabel(confidence: "low" | "moderate" | "high"): string {
  switch (confidence) {
    case "low": return "Faible";
    case "moderate": return "Modérée";
    case "high": return "Élevée";
  }
}

// Category display info
export const CATEGORY_INFO: Record<string, { label: string; icon: string; description: string }> = {
  alcohol: { label: "Alcoolémie", icon: "Wine", description: "HGN, réflexe pupillaire, rougeur sclérale" },
  fatigue: { label: "Fatigue", icon: "Moon", description: "PERCLOS, clignements, ptosis, hippus" },
  substances: { label: "Substances", icon: "Pill", description: "Taille pupillaire, PLR, rougeur" },
  stress: { label: "Stress", icon: "Zap", description: "Baseline pupillaire, fréquence clignements" },
  ocularHealth: { label: "Santé oculaire", icon: "Eye", description: "Jaunissement, pâleur, symétrie" },
  emotionalState: { label: "État émotionnel", icon: "Brain", description: "Réactivité pupillaire, baseline" },
};
