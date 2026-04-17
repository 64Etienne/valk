"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { AlertCircle, XCircle } from "lucide-react";
import {
  checkResolution,
  checkFPS,
  type PreflightIssue,
} from "@/lib/preflight/preflight-checks";

interface PreflightGateProps {
  videoEl: HTMLVideoElement | null;
  onReady: () => void;
}

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

// FPS measurement window: 600ms is enough for a rough average (≥15 frames @ 25fps)
// and keeps the gate imperceptible when conditions are fine.
const FPS_WINDOW_MS = 600;

export function PreflightGate({ videoEl, onReady }: PreflightGateProps) {
  const [issues, setIssues] = useState<PreflightIssue[]>([]);
  const [state, setState] = useState<"measuring" | "done">("measuring");
  const autoAdvancedRef = useRef(false);

  useEffect(() => {
    if (!videoEl) return;
    let cancelled = false;

    const run = async () => {
      const w = videoEl.videoWidth;
      const h = videoEl.videoHeight;
      const found: PreflightIssue[] = [];

      const resIssue = checkResolution(w, h);
      if (resIssue) found.push(resIssue);

      let frames = 0;
      const start = performance.now();
      const vEl = videoEl as RVFCVideo;
      await new Promise<void>((res) => {
        const tick = () => {
          frames++;
          if (performance.now() - start >= FPS_WINDOW_MS) {
            res();
            return;
          }
          if (vEl.requestVideoFrameCallback) {
            vEl.requestVideoFrameCallback(tick);
          } else {
            requestAnimationFrame(tick);
          }
        };
        if (vEl.requestVideoFrameCallback) {
          vEl.requestVideoFrameCallback(tick);
        } else {
          requestAnimationFrame(tick);
        }
      });
      if (cancelled) return;

      const elapsed = performance.now() - start;
      const fps = (frames * 1000) / elapsed;
      const fpsIssue = checkFPS(fps);
      if (fpsIssue) found.push(fpsIssue);

      setIssues(found);
      setState("done");
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [videoEl]);

  // Auto-advance the moment measurement is done AND no issues — zero extra click.
  useEffect(() => {
    if (
      state === "done" &&
      issues.length === 0 &&
      !autoAdvancedRef.current
    ) {
      autoAdvancedRef.current = true;
      onReady();
    }
  }, [state, issues, onReady]);

  const hasFail = issues.some((i) => i.severity === "fail");

  // Happy path: no UI during measuring (600ms is imperceptible) and no UI
  // when auto-advancing. Gate only shows when there are actual warnings or fails.
  if (state === "measuring") return null;
  if (issues.length === 0) return null;

  return (
    <div className="absolute inset-0 z-40 bg-zinc-950/95 flex items-center justify-center p-6">
      <div className="max-w-md space-y-4">
        <div className="flex items-center gap-2">
          {hasFail ? (
            <XCircle className="w-6 h-6 text-red-400" />
          ) : (
            <AlertCircle className="w-6 h-6 text-amber-400" />
          )}
          <h2 className="text-lg font-semibold text-zinc-100">
            {hasFail ? "Capture impossible" : "Conditions marginales"}
          </h2>
        </div>

        <ul className="space-y-2">
          {issues.map((iss, i) => (
            <li
              key={i}
              className={`text-sm ${
                iss.severity === "fail" ? "text-red-400" : "text-amber-400"
              }`}
            >
              • {iss.message}
            </li>
          ))}
        </ul>

        {!hasFail && (
          <Button onClick={onReady} size="lg" className="w-full">
            Continuer quand même
          </Button>
        )}
      </div>
    </div>
  );
}
