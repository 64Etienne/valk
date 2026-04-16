import type { AnalysisResult } from "@/types";

export type VerdictLevel = "green" | "yellow" | "red";

export interface Verdict {
  level: VerdictLevel;
  headline: string;
  detail: string;
  reducedConfidence: boolean;
  dominantFactor: "alcohol" | "fatigue" | "substances" | "combined" | null;
}

/**
 * Map 3-category scores to a driving-fitness verdict.
 * Thresholds tuned for "leaving a bar":
 *   - red if alcohol/substances ≥ 60 (≈ BAC > 0.04-0.05% territory)
 *   - red on severe fatigue (≥ 75) alone
 *   - red on combined moderate alcohol + moderate fatigue
 * Deliberately conservative: prefer false-positive red over false-negative green.
 */
export function computeVerdict(result: AnalysisResult): Verdict {
  const { alcohol, fatigue, substances } = result.categories;
  const a = alcohol.score;
  const f = fatigue.score;
  const s = substances.score;
  const reducedConfidence = result.dataQuality.overallQuality === "poor";

  if (a >= 60 || s >= 60) {
    return {
      level: "red",
      headline: "NE CONDUIS PAS",
      detail:
        "Les indicateurs suggèrent une altération significative. Appelle un Uber ou un proche.",
      reducedConfidence,
      dominantFactor: a >= s ? "alcohol" : "substances",
    };
  }
  if (f >= 75) {
    return {
      level: "red",
      headline: "NE CONDUIS PAS",
      detail:
        "Fatigue élevée détectée. Le risque d'endormissement au volant est important.",
      reducedConfidence,
      dominantFactor: "fatigue",
    };
  }
  if (a >= 40 && f >= 40) {
    return {
      level: "red",
      headline: "NE CONDUIS PAS",
      detail:
        "Alcool modéré + fatigue modérée = risque cumulé élevé. Ne prends pas le volant.",
      reducedConfidence,
      dominantFactor: "combined",
    };
  }

  if (a >= 25 || f >= 35 || s >= 25) {
    return {
      level: "yellow",
      headline: "PRUDENCE — attends 30 min",
      detail:
        "Les indicateurs sont borderline. Attends un peu, bois de l'eau, et refais le test avant de conduire.",
      reducedConfidence,
      dominantFactor:
        a >= Math.max(f, s) ? "alcohol" : f >= s ? "fatigue" : "substances",
    };
  }

  return {
    level: "green",
    headline: "OK POUR CONDUIRE",
    detail:
      "Aucun indicateur d'altération significative détecté. Conduis prudemment.",
    reducedConfidence,
    dominantFactor: null,
  };
}
