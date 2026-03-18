"use client";

import { useEffect, useRef } from "react";

interface LightFlashProps {
  subPhase: "close" | "flash" | "dark";
  elapsed?: number;
  duration?: number;
}

function playBeep(frequency: number = 880, durationMs: number = 100): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    setTimeout(() => ctx.close(), durationMs + 100);
  } catch {
    // Audio not available
  }
}

export function LightFlash({
  subPhase,
  elapsed = 0,
  duration = 6000,
}: LightFlashProps) {
  const lastBeepRef = useRef(-1);

  // Audio countdown during eyes-closed phase
  useEffect(() => {
    if (subPhase !== "close") return;

    const remaining = Math.ceil((duration - elapsed) / 1000);

    if (remaining <= 3 && remaining >= 1 && remaining !== lastBeepRef.current) {
      lastBeepRef.current = remaining;
      if (remaining === 1) {
        playBeep(1200, 400);
      } else {
        playBeep(880, 100);
      }
    }
  }, [subPhase, elapsed, duration]);

  useEffect(() => {
    lastBeepRef.current = -1;
  }, [subPhase]);

  if (subPhase === "close") {
    const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-black">
        <p className="text-amber-400 text-xl font-medium mb-4">
          Fermez les yeux
        </p>
        {remaining <= 3 ? (
          <p className="text-6xl font-bold text-white animate-pulse">
            {remaining}
          </p>
        ) : (
          <p className="text-zinc-500 text-sm">
            Gardez les yeux fermés...
          </p>
        )}
        <p className="text-zinc-600 text-xs mt-6">
          Ouvrez les yeux au signal sonore
        </p>
      </div>
    );
  }

  if (subPhase === "flash") {
    return (
      <div className="absolute inset-0 z-50 bg-white flex items-center justify-center">
        <p className="text-zinc-400 text-sm animate-pulse">
          Ouvrez les yeux !
        </p>
      </div>
    );
  }

  return <div className="absolute inset-0 z-30 bg-black" />;
}
