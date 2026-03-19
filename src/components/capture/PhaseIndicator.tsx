"use client";

import type { CapturePhase } from "@/types";

interface PhaseIndicatorProps {
  phase: CapturePhase;
}

const PHASES = [
  { key: "phase_1", label: "Baseline", duration: "8s" },
  { key: "phase_2", label: "Réflexe", duration: "14s" },
  { key: "phase_3", label: "Poursuite", duration: "12s" },
  { key: "phase_4", label: "Lecture", duration: "~15s" },
] as const;

const PHASE_ORDER = [
  "phase_1",
  "phase_2_close", "phase_2_flash", "phase_2_dark",
  "phase_3",
  "phase_4_reading",
  "extracting", "analyzing", "results",
];

function isPhaseActive(current: CapturePhase, phaseKey: string): boolean {
  if (phaseKey === "phase_1") return current === "phase_1";
  if (phaseKey === "phase_2") return ["phase_2_close", "phase_2_flash", "phase_2_dark"].includes(current);
  if (phaseKey === "phase_3") return current === "phase_3";
  if (phaseKey === "phase_4") return current === "phase_4_reading";
  return false;
}

function isPhaseComplete(current: CapturePhase, phaseKey: string): boolean {
  const currentIdx = PHASE_ORDER.indexOf(current);
  if (phaseKey === "phase_1") return currentIdx > 0;
  if (phaseKey === "phase_2") return currentIdx > 3;
  if (phaseKey === "phase_3") return currentIdx > 4;
  if (phaseKey === "phase_4") return currentIdx > 5;
  return false;
}

export function PhaseIndicator({ phase }: PhaseIndicatorProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      {PHASES.map(({ key, label, duration }) => {
        const active = isPhaseActive(phase, key);
        const complete = isPhaseComplete(phase, key);
        return (
          <div key={key} className="flex items-center gap-2 flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-full h-1.5 rounded-full transition-colors ${
                  complete ? "bg-violet-500" : active ? "bg-violet-500 animate-pulse" : "bg-zinc-700"
                }`}
              />
              <span className={`text-xs mt-1 ${active ? "text-violet-400 font-medium" : complete ? "text-zinc-400" : "text-zinc-600"}`}>
                {label} ({duration})
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
