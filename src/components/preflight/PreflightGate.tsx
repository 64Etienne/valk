"use client";

import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
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

export function PreflightGate({ videoEl, onReady }: PreflightGateProps) {
  const [issues, setIssues] = useState<PreflightIssue[]>([]);
  const [state, setState] = useState<"measuring" | "done">("measuring");

  useEffect(() => {
    if (!videoEl) return;
    let cancelled = false;

    const run = async () => {
      const w = videoEl.videoWidth;
      const h = videoEl.videoHeight;
      const found: PreflightIssue[] = [];

      const resIssue = checkResolution(w, h);
      if (resIssue) found.push(resIssue);

      // Measure FPS over 1.5s
      let frames = 0;
      const start = performance.now();
      const vEl = videoEl as RVFCVideo;
      await new Promise<void>((res) => {
        const tick = () => {
          frames++;
          if (performance.now() - start >= 1500) {
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

  const hasFail = issues.some((i) => i.severity === "fail");

  if (state === "measuring") {
    return (
      <div className="absolute inset-0 z-40 bg-zinc-950/95 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-zinc-400 mt-4 text-sm">
            Vérification des conditions...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-40 bg-zinc-950/95 flex items-center justify-center p-6">
      <div className="max-w-md space-y-4">
        <div className="flex items-center gap-2">
          {hasFail ? (
            <XCircle className="w-6 h-6 text-red-400" />
          ) : issues.length > 0 ? (
            <AlertCircle className="w-6 h-6 text-amber-400" />
          ) : (
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          )}
          <h2 className="text-lg font-semibold text-zinc-100">
            {hasFail
              ? "Capture impossible"
              : issues.length > 0
                ? "Conditions marginales"
                : "Conditions OK"}
          </h2>
        </div>

        {issues.length > 0 && (
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
        )}

        {!hasFail && (
          <Button onClick={onReady} size="lg" className="w-full">
            {issues.length > 0
              ? "Continuer quand même"
              : "Commencer la capture"}
          </Button>
        )}
      </div>
    </div>
  );
}
