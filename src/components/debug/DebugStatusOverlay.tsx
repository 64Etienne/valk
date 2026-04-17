"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface DebugStatusOverlayProps {
  state: Record<string, unknown>;
}

function truncate(v: unknown, max = 60): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (!s) return String(v);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * Diagnostic overlay shown when the URL includes `?debug=1`. Dumps all
 * state we care about for diagnosing capture-flow stalls on unfamiliar
 * devices (iOS Safari in particular). Designed to be screenshot-friendly.
 */
export function DebugStatusOverlay({ state }: DebugStatusOverlayProps) {
  const params = useSearchParams();
  const enabled = params?.get("debug") === "1";
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "?";
  const now = Math.floor(performance.now() / 1000);

  return (
    <div className="fixed top-2 right-2 z-[100] max-w-[90vw] bg-black/90 text-emerald-300 font-mono text-[10px] leading-tight p-2 rounded border border-emerald-500/30 pointer-events-none select-none">
      <div className="text-emerald-500 font-bold mb-1">[debug] t+{now}s #{tick}</div>
      <div className="text-zinc-400 mb-1">{truncate(ua, 80)}</div>
      {Object.entries(state).map(([k, v]) => (
        <div key={k} className="flex gap-1">
          <span className="text-zinc-500">{k}:</span>
          <span
            className={
              typeof v === "boolean"
                ? v
                  ? "text-emerald-300"
                  : "text-zinc-600"
                : v === null || v === undefined
                  ? "text-zinc-600"
                  : "text-amber-200"
            }
          >
            {truncate(v)}
          </span>
        </div>
      ))}
    </div>
  );
}
