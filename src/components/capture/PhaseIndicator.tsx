"use client";

import type { CapturePhase } from "@/types";

interface PhaseIndicatorProps {
  phase: CapturePhase;
  /**
   * The ordered list of high-level phase group keys actually included in
   * this run. Example in full protocol: ["phase_1","phase_2","phase_3","phase_4"].
   * Example in basic mode (PLR skipped): ["phase_1","phase_3","phase_4"].
   * If not provided, falls back to the full 4-phase display.
   */
  groups?: ReadonlyArray<"phase_1" | "phase_2" | "phase_3" | "phase_4">;
}

const GROUP_META: Record<
  "phase_1" | "phase_2" | "phase_3" | "phase_4",
  { label: string; duration: string }
> = {
  phase_1: { label: "Baseline", duration: "5s" },
  phase_2: { label: "Réflexe", duration: "14s" },
  phase_3: { label: "Poursuite", duration: "8s" },
  phase_4: { label: "Lecture", duration: "~20s" },
};

// Global phase execution order, used to determine "complete" status
const GLOBAL_PHASE_ORDER: CapturePhase[] = [
  "idle",
  "context_form",
  "instructions",
  "countdown",
  "phase_1",
  "phase_2_close",
  "phase_2_flash",
  "phase_2_dark",
  "phase_3",
  "phase_4_reading",
  "extracting",
  "analyzing",
  "results",
];

function isGroupActive(
  current: CapturePhase,
  group: "phase_1" | "phase_2" | "phase_3" | "phase_4"
): boolean {
  if (group === "phase_1") return current === "phase_1";
  if (group === "phase_2")
    return ["phase_2_close", "phase_2_flash", "phase_2_dark"].includes(current);
  if (group === "phase_3") return current === "phase_3";
  if (group === "phase_4") return current === "phase_4_reading";
  return false;
}

function isGroupComplete(
  current: CapturePhase,
  group: "phase_1" | "phase_2" | "phase_3" | "phase_4"
): boolean {
  const currentIdx = GLOBAL_PHASE_ORDER.indexOf(current);
  if (currentIdx < 0) return false;
  const groupEnd: Record<typeof group, number> = {
    phase_1: GLOBAL_PHASE_ORDER.indexOf("phase_1"),
    phase_2: GLOBAL_PHASE_ORDER.indexOf("phase_2_dark"),
    phase_3: GLOBAL_PHASE_ORDER.indexOf("phase_3"),
    phase_4: GLOBAL_PHASE_ORDER.indexOf("phase_4_reading"),
  };
  return currentIdx > groupEnd[group];
}

const DEFAULT_GROUPS: ReadonlyArray<
  "phase_1" | "phase_2" | "phase_3" | "phase_4"
> = ["phase_1", "phase_2", "phase_3", "phase_4"];

export function PhaseIndicator({
  phase,
  groups = DEFAULT_GROUPS,
}: PhaseIndicatorProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      {groups.map((group) => {
        const meta = GROUP_META[group];
        const active = isGroupActive(phase, group);
        const complete = isGroupComplete(phase, group);
        return (
          <div key={group} className="flex items-center gap-2 flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-full h-1.5 rounded-full transition-colors ${
                  complete
                    ? "bg-violet-500"
                    : active
                      ? "bg-violet-500 animate-pulse"
                      : "bg-zinc-700"
                }`}
              />
              <span
                className={`text-xs mt-1 ${
                  active
                    ? "text-violet-400 font-medium"
                    : complete
                      ? "text-zinc-400"
                      : "text-zinc-600"
                }`}
              >
                {meta.label} ({meta.duration})
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
