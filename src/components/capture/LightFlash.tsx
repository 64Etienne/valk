"use client";

interface LightFlashProps {
  subPhase: "warn" | "flash" | "dark";
}

export function LightFlash({ subPhase }: LightFlashProps) {
  if (subPhase === "warn") {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/80">
        <div className="text-center">
          <p className="text-amber-400 text-lg font-medium mb-2">Flash lumineux imminent</p>
          <p className="text-zinc-400 text-sm">Gardez les yeux ouverts et fixez l&apos;écran</p>
        </div>
      </div>
    );
  }

  if (subPhase === "flash") {
    return <div className="absolute inset-0 z-50 bg-white" />;
  }

  // dark recovery
  return <div className="absolute inset-0 z-30 bg-black" />;
}
