"use client";

import { useState, useCallback } from "react";
import type { AnalysisPayload, AnalysisResult } from "@/types";

export function useAnalysis() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (payload: AnalysisPayload): Promise<AnalysisResult | null> => {
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Erreur serveur (${response.status})`);
      }

      const data: AnalysisResult = await response.json();
      setResult(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'analyse.";
      setError(message);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const retry = useCallback(async (payload: AnalysisPayload) => {
    return analyze(payload);
  }, [analyze]);

  return { result, isAnalyzing, error, analyze, retry };
}
