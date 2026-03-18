"use client";

import { useEffect, useRef } from "react";

interface LightFlashProps {
  subPhase: "close" | "flash" | "dark";
  eyesClosed?: boolean;
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

const CLOSE_DURATION = 6000;

export function LightFlash({
  subPhase,
  eyesClosed = false,
  elapsed = 0,
}: LightFlashProps) {
  const lastBeepRef = useRef(-1);

  // Audio countdown during eyes-closed phase
  useEffect(() => {
    if (subPhase !== "close" || !eyesClosed) return;

    const remaining = Math.ceil((CLOSE_DURATION - elapsed) / 1000);

    if (remaining <= 3 && remaining >= 1 && remaining !== lastBeepRef.current) {
      lastBeepRef.current = remaining;
      if (remaining === 1) {
        playBeep(1200, 400); // final beep: longer, higher = "OPEN NOW"
      } else {
        playBeep(880, 100);
      }
    }
  }, [subPhase, eyesClosed, elapsed]);

  useEffect(() => {
    lastBeepRef.current = -1;
  }, [subPhase]);

  if (subPhase === "close") {
    if (!eyesClosed) {
      // Waiting for user to close eyes
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-black">
          <p className="text-amber-400 text-xl font-medium mb-4">
            Fermez les yeux
          </p>
          <p className="text-zinc-500 text-sm">
            Le décompte commence quand vos yeux sont fermés
          </p>
        </div>
      );
    }

    // Eyes closed — countdown running
    const remaining = Math.max(0, Math.ceil((CLOSE_DURATION - elapsed) / 1000));
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-black">
        <p className="text-green-400 text-lg font-medium mb-4">
          Gardez les yeux fermés
        </p>
        {remaining <= 3 ? (
          <p className="text-6xl font-bold text-white animate-pulse">
            {remaining}
          </p>
        ) : (
          <p className="text-4xl font-bold text-zinc-600">{remaining}</p>
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
