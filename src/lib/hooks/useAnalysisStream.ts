"use client";

import { useState, useCallback, useRef } from "react";
import { parseSSE } from "@/lib/streaming/sse";
import { analysisResultSchema } from "@/lib/analysis/response-schema";
import type { AnalysisPayload, AnalysisResult } from "@/types";

export type StreamPhase = "idle" | "streaming" | "done" | "error";

export interface UseAnalysisStreamState {
  partial: Partial<AnalysisResult> | null;
  final: AnalysisResult | null;
  phase: StreamPhase;
  error: string | null;
}

const TIMEOUT_MS = 120_000;

export function useAnalysisStream() {
  const [state, setState] = useState<UseAnalysisStreamState>({
    partial: null,
    final: null,
    phase: "idle",
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(
    async (payload: AnalysisPayload): Promise<AnalysisResult | null> => {
      setState({ partial: null, final: null, phase: "streaming", error: null });

      const controller = new AbortController();
      abortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const resp = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!resp.ok || !resp.body) {
          throw new Error(`Erreur serveur (${resp.status})`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalResult: AnalysisResult | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSSE(buffer);
          buffer = rest;

          for (const evt of events) {
            if (evt.event === "partial") {
              setState((s) => ({
                ...s,
                partial: evt.data as Partial<AnalysisResult>,
              }));
            } else if (evt.event === "final") {
              const validated = analysisResultSchema.safeParse(evt.data);
              if (validated.success) {
                finalResult = validated.data;
                setState({
                  partial: validated.data,
                  final: validated.data,
                  phase: "done",
                  error: null,
                });
              } else {
                setState((s) => ({
                  ...s,
                  phase: "error",
                  error: "Réponse serveur malformée.",
                }));
              }
            } else if (evt.event === "error") {
              const errData = evt.data as { error?: string };
              setState((s) => ({
                ...s,
                phase: "error",
                error: errData.error || "Erreur pendant l'analyse.",
              }));
            }
          }
        }

        return finalResult;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setState((s) => ({
            ...s,
            phase: "error",
            error:
              "L'analyse a dépassé 2 minutes. Vérifie ta connexion et réessaie.",
          }));
          return null;
        }
        const message =
          err instanceof Error ? err.message : "Erreur lors de l'analyse.";
        setState((s) => ({ ...s, phase: "error", error: message }));
        return null;
      } finally {
        clearTimeout(timeoutId);
        abortRef.current = null;
      }
    },
    []
  );

  return { ...state, analyze };
}
