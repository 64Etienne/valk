import { describe, it, expect } from "vitest";
import { sidecarSchema, pursuitX, type StimulusModel } from "../index";

const model: StimulusModel = {
  type: "smooth_pursuit_h",
  center: 0.5,
  amplitude: 0.4,
  cycles: 1.5,
  startMs: 1000,
  durationMs: 6000,
};

const validSidecar = {
  schemaVersion: 1,
  sessionId: "s1",
  clock: { domain: "performance.now", t0Monotonic: 1000, t0Wall: 1_700_000_000_000 },
  recording: { requestedQuality: "720p", mirror: false },
  syncMarkers: [
    { kind: "flash", edge: "start", scheduledMs: 1000, durationMs: 200 },
    { kind: "flash", edge: "end", scheduledMs: 7600, durationMs: 200 },
  ],
  stimuli: [{ type: "smooth_pursuit_h", model, samples: [] }],
};

describe("sidecarSchema", () => {
  it("accepte un sidecar valide", () => {
    const p = sidecarSchema.parse(validSidecar);
    expect(p.syncMarkers).toHaveLength(2);
    expect(p.stimuli[0].model.cycles).toBe(1.5);
  });
  it("rejette un marqueur sans edge", () => {
    const bad = {
      ...validSidecar,
      syncMarkers: [{ kind: "flash", scheduledMs: 1, durationMs: 200 }],
    };
    expect(() => sidecarSchema.parse(bad)).toThrow();
  });
  it("rejette un clock domain inattendu", () => {
    const bad = { ...validSidecar, clock: { ...validSidecar.clock, domain: "Date.now" } };
    expect(() => sidecarSchema.parse(bad)).toThrow();
  });
});

describe("pursuitX", () => {
  it("vaut le centre au démarrage", () => {
    expect(pursuitX(model, 1000)).toBeCloseTo(0.5, 6);
  });
  it("clamp avant le départ (progress 0 → centre)", () => {
    expect(pursuitX(model, 0)).toBeCloseTo(0.5, 6);
  });
  it("atteint l'amplitude max au quart de cycle", () => {
    // progress = 1/(4*cycles) = 1/6 → elapsed = 1000ms → tMs = 2000
    expect(pursuitX(model, 2000)).toBeCloseTo(0.9, 6);
  });
  it("reste borné dans [center-amp, center+amp]", () => {
    for (let t = 1000; t <= 7000; t += 137) {
      const x = pursuitX(model, t);
      expect(x).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(x).toBeLessThanOrEqual(0.9 + 1e-9);
    }
  });
});
