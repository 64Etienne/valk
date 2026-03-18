"use client";

import { useEffect, useState } from "react";

interface CaptureCountdownProps {
  onComplete: () => void;
  faceDetected: boolean;
}

export function CaptureCountdown({ onComplete, faceDetected }: CaptureCountdownProps) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (!faceDetected) return;

    if (count === 0) {
      onComplete();
      return;
    }

    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, faceDetected, onComplete]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20">
      {!faceDetected ? (
        <div className="text-center">
          <div className="text-6xl font-bold text-amber-400 mb-4">👀</div>
          <p className="text-zinc-300 text-lg">Positionnez votre visage face à la caméra</p>
        </div>
      ) : (
        <div className="text-center">
          <div className="text-8xl font-bold text-violet-400 animate-pulse">{count}</div>
          <p className="text-zinc-400 mt-4">Préparez-vous...</p>
        </div>
      )}
    </div>
  );
}
