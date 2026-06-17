import type { AnalysisResult } from "@/types";

export type VerdictLevel = "normal" | "mild" | "moderate" | "marked";

export interface Verdict {
  level: VerdictLevel;
  headline: string;
  detail: string;
  reducedConfidence: boolean;
  dominantIndicator: "oculomotor" | "arousal" | "motor_speech" | "combined" | null;
}

/**
 * Map 3-indicator deviation scores to a qualitative DEVIATION level.
 *
 * No driving-fitness verdict, no BAC estimate, no "drive / don't drive" text.
 * The output describes *how much the current capture deviates from what would
 * be expected for a rested, sober adult* — nothing more. Interpretation is
 * left to the user + the Claude narrative that accompanies this verdict.
 *
 * The three backend keys (`alcohol` / `fatigue` / `substances`) are legacy
 * names that we now interpret as:
 *   - alcohol     → oculomotor deviation indicator
 *   - fatigue     → arousal / fatigue indicator
 *   - substances  → motor / speech deviation indicator
 *
 * See docs/superpowers/plans/valk-v3/02-product-repositioning.md for the
 * rationale for this retitling.
 */
export function computeVerdict(result: AnalysisResult): Verdict {
  const { alcohol, fatigue, substances } = result.categories;
  const oc = alcohol.score;
  const ar = fatigue.score;
  const ms = substances.score;
  const reducedConfidence = result.dataQuality.overallQuality === "poor";
  const max = Math.max(oc, ar, ms);
  const dominantIndicator: Verdict["dominantIndicator"] =
    max === 0
      ? null
      : oc === max
        ? "oculomotor"
        : ar === max
          ? "arousal"
          : "motor_speech";

  if (max >= 76) {
    return {
      level: "marked",
      headline: "Déviation marquée",
      detail:
        "Un ou plusieurs indicateurs s'écartent nettement des valeurs attendues. Ce n'est pas un verdict médical — lis les observations détaillées et considère les explications alternatives. Si tu as bu, ne conduis pas.",
      reducedConfidence,
      dominantIndicator,
    };
  }
  if (max >= 51) {
    return {
      level: "moderate",
      headline: "Déviation modérée",
      detail:
        "Certains indicateurs s'écartent des valeurs attendues. Regarde les observations détaillées pour comprendre lesquels. Si tu as consommé de l'alcool, ne conduis pas.",
      reducedConfidence,
      dominantIndicator,
    };
  }
  if (max >= 26) {
    return {
      level: "mild",
      headline: "Déviation légère",
      detail:
        "Les indicateurs sont globalement dans les plages attendues avec quelques signaux intermédiaires. Capture de meilleure qualité ou baseline personnelle recommandée pour plus de précision.",
      reducedConfidence,
      dominantIndicator,
    };
  }

  return {
    level: "normal",
    headline: "Indicateurs dans les plages attendues",
    detail:
      "Aucune déviation significative détectée par rapport aux valeurs attendues. Ce test ne remplace pas un éthylotest et n'est pas un verdict de capacité à conduire.",
    reducedConfidence,
    dominantIndicator: null,
  };
}
