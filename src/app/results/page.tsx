"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressiveResults } from "@/components/results/ProgressiveResults";
import { useAnalysisStream } from "@/lib/hooks/useAnalysisStream";
import {
  loadResult,
  loadPayload,
  saveResult,
} from "@/lib/storage/session-result";
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

    const cached = cachedRef.current;
    if (cached) {
      setMode("cached");
      return;
    }

    const payload = loadPayload() as AnalysisPayload | null;
    if (!payload) {
      router.replace("/capture");
      return;
    }

    setMode("streaming");
    stream.analyze(payload).then((finalResult) => {
      if (finalResult) {
        saveResult(finalResult, payload);
      }
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
    return (
      <div className="min-h-screen bg-zinc-950">
        <ProgressiveResults
          partial={stream.partial}
          final={stream.final}
          phase={stream.phase}
          error={stream.error}
        />
      </div>
    );
  }

  return null;
}
