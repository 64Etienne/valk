"use client";

import { useEffect, useRef } from "react";
import { playBeep, vibrate } from "@/lib/audio/audio-context";
import { CircularProgress } from "../ui/CircularProgress";

interface LightFlashProps {
  subPhase: "close" | "flash" | "dark";
  eyesClosed?: boolean;
  elapsed?: number;
}

const CLOSE_DURATION = 6000;
const DARK_DURATION = 5000;

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
        playBeep(1200, 400, 0.8); // final beep: louder, longer, higher
        vibrate([200, 100, 200]); // vibration pattern for "open eyes now"
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

    // Eyes closed — countdown with circular ring
    const remaining = Math.max(
      0,
      Math.ceil((CLOSE_DURATION - elapsed) / 1000)
    );
    const ringProgress = 1 - (elapsed % 1000) / 1000;

    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-black">
        <p className="text-green-400 text-lg font-medium mb-6">
          Gardez les yeux fermés
        </p>
        <CircularProgress
          progress={ringProgress}
          size={100}
          strokeWidth={3}
          color={
            remaining <= 3 ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)"
          }
          trackColor="rgba(255,255,255,0.1)"
        >
          {remaining <= 3 ? (
            <span className="text-5xl font-bold text-white animate-pulse">
              {remaining}
            </span>
          ) : (
            <span className="text-3xl font-bold text-zinc-600">{remaining}</span>
          )}
        </CircularProgress>
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

  // Dark phase — subtle circular countdown so user knows it's not frozen
  const darkRemaining = Math.max(
    0,
    Math.ceil((DARK_DURATION - elapsed) / 1000)
  );
  const darkProgress = Math.max(0, 1 - elapsed / DARK_DURATION);

  return (
    <div className="absolute inset-0 z-30 bg-black flex flex-col items-center justify-center">
      <CircularProgress
        progress={darkProgress}
        size={72}
        strokeWidth={2}
        color="rgba(255,255,255,0.12)"
        trackColor="rgba(255,255,255,0.04)"
      >
        <span className="text-xl font-medium text-zinc-700">
          {darkRemaining}
        </span>
      </CircularProgress>
      <p className="text-zinc-700 text-xs mt-3">Mesure du réflexe...</p>
    </div>
  );
}
