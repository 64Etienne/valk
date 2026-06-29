import { describe, it, expect } from "vitest";
import { buildSignal, type Extraction } from "../gaze";
import { pursuitX, type Sidecar } from "@valk/shared";
import type { TimeMap } from "../../observability/flash-detect";

const model = {
  type: "smooth_pursuit_h",
  center: 0.5,
  amplitude: 0.4,
  cycles: 1.5,
  startMs: 1000,
  durationMs: 6000,
} as const;
const sidecar = {
  schemaVersion: 1,
  sessionId: "s",
  clock: { domain: "performance.now", t0Monotonic: 0, t0Wall: 1 },
  recording: { requestedQuality: "720p", mirror: false },
  syncMarkers: [
    { kind: "flash", edge: "start", scheduledMs: 1000, durationMs: 200 },
    { kind: "flash", edge: "end", scheduledMs: 7000, durationMs: 200 },
  ],
  stimuli: [{ type: "smooth_pursuit_h", model, samples: [] }],
} as unknown as Sidecar;
// time-map identité : video_ms = 1*stim_ms + 0
const timeMap: TimeMap = { a: 1, b: 0, anchors: 2, status: "verified" };

// 7s @ 30fps ; gazeH = transform(stimulus) sur la fenêtre
function frames(transform: (x: number) => number): Extraction {
  const fr = [];
  for (let i = 0; i < 210; i++) {
    const t = i / 30;
    const x = pursuitX(model, t * 1000); // stim_ms = t*1000 (timeMap identité)
    fr.push({ t, ok: true, gazeH: transform(x), irisPx: [x * 100, 50] as [number, number] });
  }
  return { fps: 30, width: 100, height: 100, frames: fr };
}

describe("buildSignal", () => {
  it("poursuite parfaite -> r proche de 1", () => {
    const s = buildSignal(frames((x) => x), sidecar, timeMap);
    expect(s.status).toBe("ok");
    expect(s.r).toBeGreaterThan(0.95);
    expect(s.signFlipped).toBe(false);
    expect(s.points.length).toBeGreaterThan(150);
  });

  it("signe inversé (miroir) -> détecté et r positif", () => {
    const s = buildSignal(frames((x) => 1 - x), sidecar, timeMap);
    expect(s.signFlipped).toBe(true);
    expect(s.r).toBeGreaterThan(0.95);
  });

  it("visage absent en majorité -> gaze_unreliable", () => {
    const e = frames((x) => x);
    e.frames.forEach((f, i) => {
      if (i % 3 !== 0) {
        f.ok = false;
        f.gazeH = null;
      }
    });
    const s = buildSignal(e, sidecar, timeMap);
    expect(s.facePct).toBeLessThan(60);
    expect(s.status).toBe("gaze_unreliable");
  });

  it("time-map non vérifié -> status sync_unverified mais calcule quand même", () => {
    const s = buildSignal(frames((x) => x), sidecar, { a: 1, b: 0, anchors: 0, status: "sync_unverified" });
    expect(s.status).toBe("sync_unverified");
    expect(s.points.length).toBeGreaterThan(0);
  });
});
