"use client";

import { useState, useCallback } from "react";
import { analysisResultSchema } from "@/lib/analysis/response-schema";
import type { AnalysisPayload, AnalysisResult } from "@/types";

const TIMEOUT_MS = 120_000;

export function useAnalysis() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(
    async (payload: AnalysisPayload): Promise<AnalysisResult | null> => {
      setIsAnalyzing(true);
      setError(null);
      setResult(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Erreur serveur (${response.status})`);
        }

        const raw = await response.json();
        const validated = analysisResultSchema.safeParse(raw);
        if (!validated.success) {
          console.error(
            "Client-side response validation failed:",
            validated.error.issues
          );
          throw new Error("Réponse serveur malformée. Réessayez.");
        }

        setResult(validated.data);
        return validated.data;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setError(
            "L'analyse a dépassé 2 minutes. Vérifiez votre connexion et réessayez."
          );
          return null;
        }
        const message =
          err instanceof Error ? err.message : "Erreur lors de l'analyse.";
        setError(message);
        return null;
      } finally {
        clearTimeout(timeoutId);
        setIsAnalyzing(false);
      }
    },
    []
  );

  const retry = useCallback(
    async (payload: AnalysisPayload) => {
      return analyze(payload);
    },
    [analyze]
  );

  return { result, isAnalyzing, error, analyze, retry };
}
