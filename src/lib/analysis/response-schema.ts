import { z } from "zod";

const categoryScoreSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.enum(["low", "moderate", "high"]),
  confidenceExplanation: z.string(),
  label: z.string(),
  observations: z.array(z.string()),
  scientificBasis: z.string(),
  limitations: z.array(z.string()),
  alternativeExplanations: z.array(z.string()),
});

export const analysisResultSchema = z.object({
  summary: z.string(),
  categories: z.object({
    alcohol: categoryScoreSchema,
    fatigue: categoryScoreSchema,
    substances: categoryScoreSchema,
    stress: categoryScoreSchema,
    ocularHealth: categoryScoreSchema,
    emotionalState: categoryScoreSchema,
  }),
  dataQuality: z.object({
    overallQuality: z.enum(["good", "fair", "poor"]),
    issues: z.array(z.string()),
  }),
});

export type ValidatedAnalysisResult = z.infer<typeof analysisResultSchema>;
