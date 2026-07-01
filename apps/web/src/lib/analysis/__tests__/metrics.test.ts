import { describe, it, expect } from "vitest";
import { computePursuitMetrics, type CalibrationRef } from "../metrics";
import type { PursuitWindowPoint } from "../gaze";

const FPS = 30;
const N = 180; // 6 s
// vraie calibration : x = M*gazeH + C  =>  gazeH = (x - C)/M
const M = -60;
const C = 30.5;
const calib: CalibrationRef = { id: "cal1", m: M, c: C, r2: 0.98, createdAt: 1000 };

const stimAt = (i: number): number => 0.5 + 0.4 * Math.sin((2 * Math.PI * 1.5 * i) / N);
const inverse = (x: number): number => (x - C) / M;

function win(gazeOf: (i: number) => number): PursuitWindowPoint[] {
  const pts: PursuitWindowPoint[] = [];
  for (let i = 0; i < N; i++) pts.push({ t: i / FPS, gaze: gazeOf(i), stim: stimAt(i) });
  return pts;
}

describe("computePursuitMetrics", () => {
  it("poursuite parfaite -> gain≈1, lag≈0, rmse≈0", () => {
    const m = computePursuitMetrics(win((i) => inverse(stimAt(i))), FPS, calib, 2000);
    expect(m.status).toBe("ok");
    expect(m.gain).toBeCloseTo(1, 1);
    expect(Math.abs(m.lagMs)).toBeLessThan(40);
    expect(m.rmse!).toBeLessThan(0.02);
    expect(m.rPeak).toBeGreaterThan(0.99);
    expect(m.calibrationId).toBe("cal1");
    expect(m.calibrationAgeMs).toBe(1000);
  });

  it("amplitude réduite (sous-poursuite) -> gain≈0.7", () => {
    const m = computePursuitMetrics(
      win((i) => inverse(0.5 + 0.7 * (stimAt(i) - 0.5))),
      FPS,
      calib,
      2000,
    );
    expect(m.gain).toBeCloseTo(0.7, 1);
  });

  it("regard retardé de 4 frames -> lag ≈ +133 ms", () => {
    const m = computePursuitMetrics(
      win((i) => inverse(stimAt(Math.max(0, i - 4)))),
      FPS,
      calib,
      2000,
    );
    expect(m.lagMs).toBeGreaterThan(99);
    expect(m.lagMs).toBeLessThan(168);
  });

  it("à-coups -> saccades comptées", () => {
    const m = computePursuitMetrics(
      win((i) => inverse(stimAt(i)) + (i > 0 && i % 40 === 0 ? 0.05 : 0)),
      FPS,
      calib,
      2000,
    );
    expect(m.saccades).toBeGreaterThanOrEqual(3);
    expect(m.saccadesPerSec).toBeGreaterThan(0.3);
  });

  it("sans calibration -> no_calibration, gain null mais lag/r présents", () => {
    const m = computePursuitMetrics(win((i) => inverse(stimAt(i))), FPS, null, 2000);
    expect(m.status).toBe("no_calibration");
    expect(m.gain).toBeNull();
    expect(m.rmse).toBeNull();
    expect(m.rPeak).toBeGreaterThan(0.95); // |r| : le miroir (m<0) ne casse pas la corrélation
    expect(Math.abs(m.lagMs)).toBeLessThan(40);
  });
});
