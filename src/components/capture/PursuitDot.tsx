"use client";

interface PursuitDotProps {
  progress: number; // 0 to 1
}

export function PursuitDot({ progress }: PursuitDotProps) {
  const x = 50 + 40 * Math.sin(progress * Math.PI * 6);

  return (
    <>
      {/* White background — improves iris tracking contrast
          and provides consistent light stimulus */}
      <div className="absolute inset-0 z-10 bg-white/90" />

      {/* Tracking dot */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        <div
          className="absolute top-1/3 -translate-y-1/2 -translate-x-1/2 transition-none"
          style={{ left: `${x}%` }}
        >
          <div className="w-5 h-5 rounded-full bg-green-600 shadow-lg shadow-green-600/50" />
        </div>
      </div>
    </>
  );
}
