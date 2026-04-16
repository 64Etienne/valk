import { describe, it, expect } from "vitest";
import { analysisResultSchema } from "@/lib/analysis/response-schema";

const validCategory = {
  score: 42,
  confidence: "moderate" as const,
  confidenceExplanation: "explication",
  label: "label",
  observations: ["obs1"],
  scientificBasis: "basis",
  limitations: ["lim1"],
  alternativeExplanations: ["alt1"],
};

const validResult = {
  summary: "résumé",
  categories: {
    alcohol: validCategory,
    fatigue: validCategory,
    substances: validCategory,
  },
  dataQuality: { overallQuality: "good" as const, issues: [] },
};

describe("analysisResultSchema", () => {
  it("accepts a valid full response", () => {
    const r = analysisResultSchema.safeParse(validResult);
    expect(r.success).toBe(true);
  });

  it("rejects a response missing a required category", () => {
    const { alcohol, ...rest } = validResult.categories;
    void alcohol;
    const bad = { ...validResult, categories: rest };
    expect(analysisResultSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects out-of-range scores", () => {
    const bad = {
      ...validResult,
      categories: {
        ...validResult.categories,
        alcohol: { ...validCategory, score: 150 },
      },
    };
    expect(analysisResultSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid overallQuality literals", () => {
    const bad = {
      ...validResult,
      dataQuality: { overallQuality: "moyenne", issues: [] },
    };
    expect(analysisResultSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid confidence literals", () => {
    const bad = {
      ...validResult,
      categories: {
        ...validResult.categories,
        alcohol: {
          ...validCategory,
          confidence: "élevé" as unknown as "high",
        },
      },
    };
    expect(analysisResultSchema.safeParse(bad).success).toBe(false);
  });
});
