import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  saveBaseline,
  loadBaseline,
  clearBaseline,
  getBaselineStatus,
  condenseBaseline,
  __setStorageForTests,
} from "@/lib/calibration/baseline";
import { computeBaselineDelta } from "@/lib/calibration/baseline-delta";
import type { AnalysisPayload } from "@/types";

const makePayload = (): AnalysisPayload =>
  ({
    baseline: {
      pupilDiameterMm: { left: 3.5, right: 3.5 },
      pupilSymmetryRatio: 1,
      scleralColorLAB: { left: [90, 0, 0], right: [90, 0, 0] },
      scleralRednessIndex: 5,
      scleralYellownessIndex: 5,
      eyelidApertureMm: { left: 10, right: 10 },
      blinkRate: 14,
      perclos: 0.08,
    },
    lightReflex: {
      constrictionLatencyMs: 0,
      constrictionAmplitudeMm: 0,
      constrictionVelocityMmPerSec: 0,
      redilationT50Ms: 0,
      pupilDiameterTimeSeries: [],
    },
    pursuit: {
      smoothPursuitGainRatio: 0.92,
      saccadeCount: 1,
      nystagmusClues: {
        onsetBeforeMaxDeviation: { left: false, right: false },
        distinctAtMaxDeviation: { left: false, right: false },
        smoothPursuitFailure: { left: false, right: false },
      },
      irisPositionTimeSeries: [],
    },
    hippus: { pupilUnrestIndex: 0.04, dominantFrequencyHz: 0.3 },
    voiceAnalysis: {
      mfccMean: [],
      mfccStd: [],
      spectralCentroidMean: 0,
      spectralFlatnessMean: 0,
      speechRateWordsPerMin: 160,
      pauseCount: 2,
      pauseTotalMs: 400,
      meanPauseDurationMs: 200,
      totalDurationMs: 22000,
      voicedDurationMs: 18000,
      signalToNoiseRatio: 22,
    },
    context: {
      timeOfDay: "morning",
      hoursSinceLastSleep: 9,
      age: 30,
      ambientLighting: "bright",
    },
    meta: {
      captureTimestamp: "2026-04-14T09:00:00Z",
      captureDurationMs: 20000,
      frameCount: 600,
      averageFps: 30,
      deviceInfo: "test",
      cameraResolution: { width: 1280, height: 720 },
    },
  }) as AnalysisPayload;

beforeEach(() => {
  __setStorageForTests(undefined as unknown as Storage);
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  clearBaseline();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("baseline persistence", () => {
  it("saves and loads a baseline round-trip", () => {
    saveBaseline(makePayload());
    const loaded = loadBaseline();
    expect(loaded?.pursuit.smoothPursuitGainRatio).toBeCloseTo(0.92, 2);
  });

  it("loadBaseline returns null when nothing saved", () => {
    expect(loadBaseline()).toBeNull();
  });

  it("clearBaseline removes stored baseline", () => {
    saveBaseline(makePayload());
    clearBaseline();
    expect(loadBaseline()).toBeNull();
  });

  it("getBaselineStatus reports 'none' when empty", () => {
    expect(getBaselineStatus().state).toBe("none");
  });

  it("getBaselineStatus reports 'fresh' within 30 days", () => {
    const p = makePayload();
    p.meta.captureTimestamp = new Date().toISOString();
    saveBaseline(p);
    expect(getBaselineStatus().state).toBe("fresh");
  });

  it("getBaselineStatus reports 'stale' after 90 days", () => {
    const p = makePayload();
    const old = new Date();
    old.setDate(old.getDate() - 120);
    p.meta.captureTimestamp = old.toISOString();
    saveBaseline(p);
    expect(getBaselineStatus().state).toBe("stale");
  });

  it("condenseBaseline extracts the key metrics", () => {
    const p = makePayload();
    p.meta.captureTimestamp = new Date().toISOString();
    const c = condenseBaseline(p);
    expect(c.pupilDiameterAvgMm).toBe(3.5);
    expect(c.blinkRate).toBe(14);
    expect(c.pursuitGain).toBeCloseTo(0.92, 2);
    expect(c.speechRateWpm).toBe(160);
  });
});

describe("baseline delta", () => {
  it("zero when session equals baseline", () => {
    const b = makePayload();
    const d = computeBaselineDelta(b, b);
    expect(d.pupilDiameterDeltaMm).toBe(0);
    expect(d.pursuitGainDelta).toBe(0);
  });

  it("negative pursuit gain delta when session worse", () => {
    const baseline = makePayload();
    const session = makePayload();
    session.pursuit.smoothPursuitGainRatio = 0.65;
    expect(computeBaselineDelta(baseline, session).pursuitGainDelta).toBeCloseTo(
      -0.27,
      2
    );
  });
});
