"use client";

import { useEffect, useRef } from "react";

interface PursuitDotProps {
  /** performance.now() timestamp marking phase start. */
  phaseStartMs: number;
  /** Total phase duration in ms (e.g. 8000). */
  phaseDurationMs: number;
}

const CYCLES = 1.5;

/**
 * Smooth-pursuit target dot.
 *
 * Animates at a full display refresh rate (60–120 Hz) via its own RAF loop,
 * decoupled from MediaPipe's detection FPS (which drops to 10–15 Hz on iPhone
 * Safari). Writes the CSS `left` value directly to the DOM through a ref so
 * React never re-renders during the phase. Without this, the dot's position
 * was gated by React state updates tied to MediaPipe callbacks, producing the
 * jerky "saccadé" motion the user reported.
 */
export function PursuitDot({ phaseStartMs, phaseDurationMs }: PursuitDotProps) {
  const dotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = dotRef.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - phaseStartMs;
      const p = Math.max(0, Math.min(1, elapsed / phaseDurationMs));
      const x = 50 + 40 * Math.sin(p * Math.PI * 2 * CYCLES);
      el.style.left = `${x}%`;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phaseStartMs, phaseDurationMs]);

  return (
    <>
      <div className="absolute inset-0 z-10 bg-white/90" />
      <div className="absolute inset-0 z-20 pointer-events-none">
        <div
          ref={dotRef}
          className="absolute top-1/3 -translate-y-1/2 -translate-x-1/2"
          style={{ left: "50%", willChange: "left" }}
        >
          <div className="w-6 h-6 rounded-full bg-green-500 shadow-lg shadow-green-500/50 ring-2 ring-white/50" />
        </div>
      </div>
    </>
  );
}
