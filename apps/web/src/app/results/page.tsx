"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressiveResults } from "@/components/results/ProgressiveResults";
import { QualityInsufficientBanner } from "@/components/results/QualityInsufficientBanner";
import { useAnalysisStream } from "@/lib/hooks/useAnalysisStream";
import {
  loadResult,
  loadPayload,
  saveResult,
} from "@/lib/storage/session-result";
import { buildTelemetryEvent, sendTelemetry } from "@/lib/telemetry/telemetry";
import { computeVerdict } from "@/lib/analysis/verdict";
import { log, logError } from "@/lib/logger/logger";
import type { AnalysisPayload } from "@/types";

export default function ResultsPage() {
  const router = useRouter();
  const stream = useAnalysisStream();
  const [mode, setMode] = useState<"cached" | "streaming" | null>(null);
  const cachedRef = useRef(loadResult());
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    log("results.mount", {
      hasCached: !!cachedRef.current,
    });

    const cached = cachedRef.current;
    if (cached) {
      log("results.mode.cached");
      setMode("cached");
      return;
    }

    const payload = loadPayload() as AnalysisPayload | null;
    log("results.loadPayload", {
      hasPayload: !!payload,
      payloadSize: payload ? JSON.stringify(payload).length : 0,
    });
    if (!payload) {
      log("results.redirect.capture.noPayload");
      router.replace("/capture");
      return;
    }

    log("results.mode.streaming");
    setMode("streaming");
    const streamStart = performance.now();
    stream
      .analyze(payload)
      .then((finalResult) => {
        log("results.stream.settled", { hasFinal: !!finalResult });
        if (finalResult) {
          saveResult(finalResult, payload);
          try {
            if (localStorage.getItem("valk-telemetry-consent") === "1") {
              const verdict = computeVerdict(finalResult);
              sendTelemetry(
                buildTelemetryEvent(
                  payload,
                  finalResult,
                  verdict.level,
                  performance.now() - streamStart
                )
              );
              log("results.telemetry.sent", { verdict: verdict.level });
            }
          } catch (err) {
            logError("results.telemetry.failed", {
              msg: (err as Error)?.message,
            });
          }
        }
      })
      .catch((err) => {
        logError("results.stream.rejected", {
          msg: (err as Error)?.message,
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mode === "cached") {
    const cached = cachedRef.current;
    if (!cached) return null;
    return (
      <div className="min-h-screen bg-zinc-950">
        <ProgressiveResults
          partial={cached}
          final={cached}
          phase="done"
          error={null}
        />
      </div>
    );
  }

  if (mode === "streaming") {
    // Phase 1.2 (valk-v3): if the server refused to score because of hard
    // quality gates, render the dedicated banner instead of a fake verdict.
    if (stream.phase === "quality_insufficient" && stream.qualityIssues) {
      return (
        <div className="min-h-screen bg-zinc-950 py-8">
          <QualityInsufficientBanner issues={stream.qualityIssues} />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-zinc-950">
        <ProgressiveResults
          partial={stream.partial}
          final={stream.final}
          phase={stream.phase === "quality_insufficient" ? "error" : stream.phase}
          error={stream.error}
        />
      </div>
    );
  }

  return null;
}
