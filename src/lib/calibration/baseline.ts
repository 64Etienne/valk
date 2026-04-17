import type { AnalysisPayload, PersonalBaseline } from "@/types";

const KEY = "valk-personal-baseline";
const FRESH_DAYS = 30;
const STALE_DAYS = 90;

export type BaselineStatus =
  | { state: "none" }
  | { state: "fresh"; capturedAt: Date; ageDays: number }
  | { state: "aging"; capturedAt: Date; ageDays: number }
  | { state: "stale"; capturedAt: Date; ageDays: number };

let testStorage: Storage | null | undefined = undefined;

// Pass `undefined` to fall back to window.localStorage (default).
// Pass a mock Storage to inject one. Pass `null` to simulate no storage.
export function __setStorageForTests(s: Storage | null | undefined): void {
  testStorage = s;
}

function getStorage(): Storage | null {
  if (testStorage !== undefined) return testStorage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveBaseline(payload: AnalysisPayload): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("baseline save failed:", err);
  }
}

export function loadBaseline(): AnalysisPayload | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AnalysisPayload;
  } catch {
    return null;
  }
}

export function clearBaseline(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export function getBaselineStatus(): BaselineStatus {
  const baseline = loadBaseline();
  if (!baseline) return { state: "none" };
  const capturedAt = new Date(baseline.meta.captureTimestamp);
  if (Number.isNaN(capturedAt.getTime())) return { state: "none" };
  const ageDays =
    (Date.now() - capturedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= FRESH_DAYS) return { state: "fresh", capturedAt, ageDays };
  if (ageDays <= STALE_DAYS)
    return { state: "aging", capturedAt, ageDays };
  return { state: "stale", capturedAt, ageDays };
}

/**
 * Distill an AnalysisPayload into a compact PersonalBaseline for sending
 * alongside future payloads (so Claude scores Δ-from-baseline).
 */
export function condenseBaseline(payload: AnalysisPayload): PersonalBaseline {
  const avgPupil =
    (payload.baseline.pupilDiameterMm.left +
      payload.baseline.pupilDiameterMm.right) /
    2;
  const capturedAt = payload.meta.captureTimestamp;
  const ageDays =
    (Date.now() - new Date(capturedAt).getTime()) / (1000 * 60 * 60 * 24);
  return {
    pupilDiameterAvgMm: avgPupil,
    blinkRate: payload.baseline.blinkRate,
    perclos: payload.baseline.perclos,
    pursuitGain: payload.pursuit.smoothPursuitGainRatio,
    saccadeCount: payload.pursuit.saccadeCount,
    scleralRedness: payload.baseline.scleralRednessIndex,
    speechRateWpm: payload.voiceAnalysis?.speechRateWordsPerMin,
    pauseCount: payload.voiceAnalysis?.pauseCount,
    capturedAt,
    ageDays: Math.max(0, ageDays),
  };
}
