"use client";

interface PursuitDotProps {
  progress: number; // 0 to 1
}

/**
 * Tracking dot for smooth-pursuit phase.
 *
 * Motion: horizontal sinusoid in the top third (closer to front camera =
 * less eyelid occlusion). 1.5 full cycles in 8s = 5.3s per cycle, slow
 * enough to stay below perceptible jitter at 10 FPS iPhone capture.
 *
 * CSS `transition: left 70ms linear` smooths out irregular React state
 * updates — the dot keeps moving continuously between progress updates.
 */
export function PursuitDot({ progress }: PursuitDotProps) {
  const CYCLES = 1.5;
  const p = Math.max(0, Math.min(1, progress));
  const x = 50 + 40 * Math.sin(p * Math.PI * 2 * CYCLES);

  return (
    <>
      {/* White background: iris tracking contrast + consistent light stimulus */}
      <div className="absolute inset-0 z-10 bg-white/90" />

      <div className="absolute inset-0 z-20 pointer-events-none">
        <div
          className="absolute top-1/3 -translate-y-1/2 -translate-x-1/2"
          style={{
            left: `${x}%`,
            transition: "left 70ms linear",
            willChange: "left",
          }}
        >
          <div className="w-6 h-6 rounded-full bg-green-500 shadow-lg shadow-green-500/50 ring-2 ring-white/50" />
        </div>
      </div>
    </>
  );
}
