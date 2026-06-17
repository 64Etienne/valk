"use client";

import { useEffect, useRef } from "react";

interface PursuitDotProps {
  phaseStartMs: number;
  phaseDurationMs: number;
}

const CYCLES = 1.5;
// 240 keyframes over 8s = one sample per ~33ms. The browser interpolates
// linearly between samples at compositor refresh rate (60–120 Hz).
const SAMPLES = 240;

/**
 * Smooth-pursuit target, animated on the compositor thread.
 *
 * Uses the Web Animations API with pre-computed keyframes of
 * `transform: translate3d(Xpx, 0, 0)` sampled from a sine wave.
 * `transform` + `translate3d` + `will-change: transform` forces hardware
 * compositing in WebKit/Blink — the animation runs on a separate thread and
 * is unaffected by main-thread blocks from MediaPipe's WASM detector
 * (40-80ms per frame on iPhone Safari). An earlier RAF-based implementation
 * stuttered because RAF itself was gated by the same blocked main thread.
 */
export function PursuitDot({ phaseStartMs, phaseDurationMs }: PursuitDotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const el = dotRef.current;
    if (!container || !el) return;

    const width = container.clientWidth;
    if (width === 0) return;

    const centerPx = width * 0.5;
    const ampPx = width * 0.4;

    const keyframes: Keyframe[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const p = i / SAMPLES;
      const x = centerPx + ampPx * Math.sin(p * Math.PI * 2 * CYCLES);
      keyframes.push({ transform: `translate3d(${x}px, 0, 0)` });
    }

    const anim = el.animate(keyframes, {
      duration: phaseDurationMs,
      easing: "linear",
      fill: "forwards",
    });

    const elapsed = performance.now() - phaseStartMs;
    if (elapsed > 0 && elapsed < phaseDurationMs) {
      anim.currentTime = elapsed;
    }

    return () => anim.cancel();
  }, [phaseStartMs, phaseDurationMs]);

  return (
    <>
      <div className="absolute inset-0 z-10 bg-white/90" />
      <div
        ref={containerRef}
        className="absolute inset-0 z-20 pointer-events-none"
      >
        <div
          ref={dotRef}
          style={{
            position: "absolute",
            left: 0,
            // Phase 2.9 (valk-v3): placed at 14 % of screen height, ≈ same
            // vertical band as FixationDot. iPhone camera is at the top of
            // the device, so keeping the gaze high minimises upper-eyelid
            // occlusion of the iris and stabilises EAR/pursuit detection.
            top: "14vh",
            willChange: "transform",
            transform: "translate3d(0, 0, 0)",
          }}
        >
          <div
            className="w-6 h-6 rounded-full bg-green-500 shadow-lg shadow-green-500/50 ring-2 ring-white/50"
            style={{ transform: "translate(-50%, -50%)" }}
          />
        </div>
      </div>
    </>
  );
}
