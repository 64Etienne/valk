"use client";

import { useEffect, useState } from "react";
import { FaceGuideOval } from "./FaceGuideOval";

interface CaptureCountdownProps {
  onComplete: () => void;
  faceDetected: boolean;
}

export function CaptureCountdown({
  onComplete,
  faceDetected,
}: CaptureCountdownProps) {
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
    <div className="absolute inset-0 z-20">
      {/* Semi-transparent overlay */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Face guide oval */}
      <FaceGuideOval detected={faceDetected} />

      {/* Status text */}
      <div className="absolute bottom-16 left-0 right-0 text-center z-30">
        {!faceDetected ? (
          <p className="text-amber-400 text-base font-medium">
            Centrez votre visage dans l&apos;ovale
          </p>
        ) : (
          <div>
            <p className="text-8xl font-bold text-green-400 animate-pulse">
              {count}
            </p>
            <p className="text-zinc-400 mt-2">Restez immobile...</p>
          </div>
        )}
      </div>
    </div>
  );
}
