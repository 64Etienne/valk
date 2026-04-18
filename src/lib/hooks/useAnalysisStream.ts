"use client";

import { useState, useCallback, useRef } from "react";
import { parseSSE } from "@/lib/streaming/sse";
import { analysisResultSchema } from "@/lib/analysis/response-schema";
import { getSessionId } from "@/lib/logger/logger";
import type { AnalysisPayload, AnalysisResult } from "@/types";

export type StreamPhase =
  | "idle"
  | "streaming"
  | "done"
  | "error"
  | "quality_insufficient";

export interface QualityIssue {
  gate: string;
  measuredValue: number | string;
  threshold: number | string;
  humanReason: string;
}

export interface UseAnalysisStreamState {
  partial: Partial<AnalysisResult> | null;
  final: AnalysisResult | null;
  phase: StreamPhase;
  error: string | null;
  qualityIssues: QualityIssue[] | null;
}

const TIMEOUT_MS = 120_000;

export function useAnalysisStream() {
  const [state, setState] = useState<UseAnalysisStreamState>({
    partial: null,
    final: null,
    phase: "idle",
    error: null,
    qualityIssues: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(
    async (payload: AnalysisPayload): Promise<AnalysisResult | null> => {
      setState({
        partial: null,
        final: null,
        phase: "streaming",
        error: null,
        qualityIssues: null,
      });

      const controller = new AbortController();
      abortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const resp = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Tie the analyze request to the client's log session so the
            // server can append the payload + Claude response to the same
            // server-side audit trail retrievable via /api/logs/:sid.
            "X-Session-Id": getSessionId(),
          },
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
                  qualityIssues: null,
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
            } else if (evt.event === "status") {
              // Phase 1.2 (valk-v3): server refused to score due to hard
              // quality gates. Client renders a dedicated screen instead
              // of a fake verdict.
              const statusData = evt.data as {
                code?: string;
                issues?: QualityIssue[];
              };
              if (statusData.code === "quality_insufficient") {
                setState((s) => ({
                  ...s,
                  phase: "quality_insufficient",
                  qualityIssues: statusData.issues ?? [],
                }));
              }
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
