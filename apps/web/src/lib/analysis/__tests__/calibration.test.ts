import { describe, it, expect } from "vitest";
import { fitCalibration } from "../calibration";
import type { Extraction } from "../gaze";
import type { Sidecar } from "@valk/shared";
import type { TimeMap } from "../../observability/flash-detect";

const XS = [0.1, 0.3, 0.5, 0.7, 0.9];
const FIX = 1500;
// vrai mapping : x = M*gazeH + C  => gazeH = (x - C)/M
const M = -70;
const C = 35.5;
const timeMap: TimeMap = { a: 1, b: 0, anchors: 2, status: "verified" };

function sidecar(): Sidecar {
  const points = XS.map((x, i) => ({ x, startMs: 1000 + i * FIX, durMs: FIX }));
  return {
    schemaVersion: 1,
    sessionId: "c",
    clock: { domain: "performance.now", t0Monotonic: 0, t0Wall: 1 },
    recording: { requestedQuality: "720p", mirror: false },
    syncMarkers: [
      { kind: "flash", edge: "start", scheduledMs: 0, durationMs: 200 },
      { kind: "flash", edge: "end", scheduledMs: 1000 + XS.length * FIX, durationMs: 200 },
    ],
    stimuli: [{ type: "fixation_h", model: { type: "fixation_h", points }, samples: [] }],
  } as unknown as Sidecar;
}

// frames 30fps couvrant la fenêtre, gazeH = (x-C)/M pendant chaque fixation, sinon centre
function frames(): Extraction {
  const fr = [];
  const total = 1000 + XS.length * FIX + 600;
  for (let t = 0; t < (total / 1000) * 30; t++) {
    const ts = t / 30;
    const stimMs = ts * 1000;
    let gazeH = 0.5;
    XS.forEach((x, i) => {
      const s = 1000 + i * FIX;
      if (stimMs >= s && stimMs <= s + FIX) gazeH = (x - C) / M;
    });
    fr.push({ t: ts, ok: true, gazeH });
  }
  return { fps: 30, width: 100, height: 100, frames: fr };
}

describe("fitCalibration", () => {
  it("retrouve le mapping (R²≈1)", () => {
    const r = fitCalibration(frames(), sidecar(), timeMap);
    expect(r.status).toBe("ok");
    expect(r.points).toHaveLength(5);
    expect(r.r2).toBeGreaterThan(0.99);
    expect(r.m).toBeCloseTo(M, 0);
  });

  it("skip le settle : transitoire au début de fixation ignoré", () => {
    const e = frames();
    // pollue les 300 premières ms de chaque fixation (dans le settle) avec une valeur aberrante
    e.frames.forEach((f) => {
      XS.forEach((x, i) => {
        const s = 1000 + i * FIX;
        if (f.t * 1000 >= s && f.t * 1000 < s + 300) f.gazeH = 0.0;
      });
    });
    const r = fitCalibration(e, sidecar(), timeMap);
    expect(r.r2).toBeGreaterThan(0.99);
  });

  it("moins de 3 fixations exploitables -> failed", () => {
    const e: Extraction = { fps: 30, width: 100, height: 100, frames: [{ t: 0, ok: false, gazeH: null }] };
    expect(fitCalibration(e, sidecar(), timeMap).status).toBe("failed");
  });
});
