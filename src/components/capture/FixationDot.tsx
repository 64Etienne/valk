"use client";

export function FixationDot() {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
      <div className="relative">
        <div className="w-4 h-4 rounded-full bg-violet-500 shadow-lg shadow-violet-500/50" />
        <div className="absolute inset-0 w-4 h-4 rounded-full bg-violet-500 animate-ping opacity-30" />
      </div>
    </div>
  );
}
