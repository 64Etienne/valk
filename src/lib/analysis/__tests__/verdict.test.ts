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

describe("computeVerdict", () => {
  it("green if all scores low", () => {
    expect(computeVerdict(makeResult(10, 15, 5)).level).toBe("green");
  });

  it("yellow if any score in moderate zone", () => {
    expect(computeVerdict(makeResult(40, 20, 10)).level).toBe("yellow");
    expect(computeVerdict(makeResult(20, 50, 10)).level).toBe("yellow");
  });

  it("red if alcohol or substances ≥ 60", () => {
    expect(computeVerdict(makeResult(65, 20, 10)).level).toBe("red");
    expect(computeVerdict(makeResult(20, 20, 75)).level).toBe("red");
  });

  it("red if fatigue ≥ 75 alone", () => {
    expect(computeVerdict(makeResult(10, 80, 10)).level).toBe("red");
  });

  it("red if 2+ moderate-high combine (fatigue+alcohol)", () => {
    expect(computeVerdict(makeResult(50, 55, 10)).level).toBe("red");
  });

  it("downgrades confidence when dataQuality is poor", () => {
    const result = makeResult(70, 20, 10);
    result.dataQuality.overallQuality = "poor";
    const verdict = computeVerdict(result);
    expect(verdict.reducedConfidence).toBe(true);
  });
});
