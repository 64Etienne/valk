"use client";

interface PursuitDotProps {
  progress: number; // 0 to 1
}

export function PursuitDot({ progress }: PursuitDotProps) {
  // Movement pattern: 2.5 full cycles over the duration
  // Smooth sinusoidal motion
  const x = 50 + 40 * Math.sin(progress * Math.PI * 5);

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-none"
        style={{ left: `${x}%` }}
      >
        <div className="w-5 h-5 rounded-full bg-green-400 shadow-lg shadow-green-400/50" />
      </div>
    </div>
  );
}
