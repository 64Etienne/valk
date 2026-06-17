import { describe, it, expect } from "vitest";
import { computeVerdict } from "@/lib/analysis/verdict";
import type { AnalysisResult } from "@/types";

const makeResult = (alc: number, fat: number, sub: number): AnalysisResult => ({
  summary: "",
  categories: {
    alcohol: {
      score: alc,
      confidence: "moderate",
      confidenceExplanation: "",
      label: "",
      observations: [],
      scientificBasis: "",
      limitations: [],
      alternativeExplanations: [],
    },
    fatigue: {
      score: fat,
      confidence: "moderate",
      confidenceExplanation: "",
      label: "",
      observations: [],
      scientificBasis: "",
      limitations: [],
      alternativeExplanations: [],
    },
    substances: {
      score: sub,
      confidence: "moderate",
      confidenceExplanation: "",
      label: "",
      observations: [],
      scientificBasis: "",
      limitations: [],
      alternativeExplanations: [],
    },
  },
  dataQuality: { overallQuality: "good", issues: [] },
});

// NOTE: the thresholds reflect the max-of-the-three indicator model
// (see src/lib/analysis/verdict.ts). Combined scoring below the
// per-indicator thresholds is NO LONGER promoted to a higher level —
// that heuristic was implicitly claiming a diagnostic power we don't have.
describe("computeVerdict", () => {
  it("normal if max score < 26", () => {
    expect(computeVerdict(makeResult(10, 15, 5)).level).toBe("normal");
    expect(computeVerdict(makeResult(0, 0, 0)).level).toBe("normal");
  });

  it("mild when max in [26, 50]", () => {
    expect(computeVerdict(makeResult(40, 20, 10)).level).toBe("mild");
    expect(computeVerdict(makeResult(20, 45, 10)).level).toBe("mild");
  });

  it("moderate when max in [51, 75]", () => {
    expect(computeVerdict(makeResult(65, 20, 10)).level).toBe("moderate");
    expect(computeVerdict(makeResult(20, 60, 10)).level).toBe("moderate");
    expect(computeVerdict(makeResult(20, 20, 75)).level).toBe("moderate");
  });

  it("marked when max ≥ 76", () => {
    expect(computeVerdict(makeResult(80, 20, 10)).level).toBe("marked");
    expect(computeVerdict(makeResult(10, 80, 10)).level).toBe("marked");
    expect(computeVerdict(makeResult(10, 20, 90)).level).toBe("marked");
  });

  it("propagates reducedConfidence when dataQuality is poor", () => {
    const result = makeResult(70, 20, 10);
    result.dataQuality.overallQuality = "poor";
    const verdict = computeVerdict(result);
    expect(verdict.reducedConfidence).toBe(true);
  });

  it("dominantIndicator reflects the highest-scoring indicator", () => {
    expect(computeVerdict(makeResult(70, 20, 10)).dominantIndicator).toBe(
      "oculomotor"
    );
    expect(computeVerdict(makeResult(20, 70, 10)).dominantIndicator).toBe(
      "arousal"
    );
    expect(computeVerdict(makeResult(10, 20, 70)).dominantIndicator).toBe(
      "motor_speech"
    );
    expect(computeVerdict(makeResult(0, 0, 0)).dominantIndicator).toBeNull();
  });

  it("headline does not present itself as a driving verdict", () => {
    // Acceptable: "ne conduis pas" appears in `detail` as a SAFETY REMINDER
    // (not a verdict). The regression we guard against here is the OLD
    // headlines which issued a verdict ("NE CONDUIS PAS" / "OK POUR CONDUIRE")
    // and the Uber CTA. Those are removed by the Phase 0.2 refactor.
    for (const [a, f, s] of [
      [90, 80, 70],
      [10, 15, 5],
      [40, 20, 10],
    ] as const) {
      const verdict = computeVerdict(makeResult(a, f, s));
      expect(verdict.headline).not.toMatch(/NE CONDUIS PAS/);
      expect(verdict.headline).not.toMatch(/OK POUR CONDUIRE/);
      expect(`${verdict.headline} ${verdict.detail}`).not.toMatch(/Uber/i);
    }
  });
});
