"use client";

import { useEffect, useState, useRef } from "react";
import { FaceGuideOval } from "./FaceGuideOval";
import { CircularProgress } from "../ui/CircularProgress";
import { playBeep, vibrate } from "@/lib/audio/audio-context";

interface CaptureCountdownProps {
  onComplete: () => void;
  faceDetected: boolean;
}

export function CaptureCountdown({
  onComplete,
  faceDetected,
}: CaptureCountdownProps) {
  const [count, setCount] = useState(3);
  const [ringProgress, setRingProgress] = useState(1);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  // Countdown timer (1s per step).
  // Audio cues: short tick at each step (3/2/1), longer "go" tone at 0.
  // AudioContext was unlocked in the previous phase (instructions onReady),
  // so these will play on iOS even with the device in silent mode.
  useEffect(() => {
    if (!faceDetected) return;

    if (count === 0) {
      playBeep(1200, 220, 0.35);
      vibrate([60, 40, 60]);
      onComplete();
      return;
    }

    playBeep(700, 80, 0.25);
    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, faceDetected, onComplete]);

  // Ring animation — smooth depletion over each second
  useEffect(() => {
    if (!faceDetected || count === 0) return;

    startRef.current = performance.now();
    setRingProgress(1);

    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const p = Math.max(0, 1 - elapsed / 1000);
      setRingProgress(p);
      if (p > 0) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [count, faceDetected]);

  return (
    <div className="absolute inset-0 z-20">
      <div className="absolute inset-0 bg-black/50" />

      <FaceGuideOval detected={faceDetected} />

      <div className="absolute bottom-16 left-0 right-0 text-center z-30">
        {!faceDetected ? (
          <p className="text-amber-400 text-base font-medium">
            Centrez votre visage dans l&apos;ovale
          </p>
        ) : (
          <div className="flex flex-col items-center">
            <CircularProgress
              progress={ringProgress}
              size={120}
              strokeWidth={4}
              color="#22c55e"
              trackColor="rgba(34, 197, 94, 0.2)"
            >
              <span className="text-6xl font-bold text-green-400">{count}</span>
            </CircularProgress>
            <p className="text-zinc-400 mt-4">Restez immobile...</p>
          </div>
        )}
      </div>
    </div>
  );
}
