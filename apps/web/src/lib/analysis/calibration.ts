import type { Sidecar } from "@valk/shared";
import type { TimeMap } from "../observability/flash-detect";
import type { Extraction } from "./gaze";

export interface CalibrationResult {
  kind: "calibration";
  m: number;
  c: number;
  r2: number;
  points: { x: number; gazeH: number; residual: number; n: number }[];
  status: "ok" | "calibration_poor" | "failed";
}

const SETTLE_MS = 400;

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Calibre `x = m·gazeH + c` : médiane du gazeH par fixation (settle ignoré) → régression
 * moindres carrés + R². Statut `ok`/`calibration_poor`(R²<0.8)/`failed`(<3 fixations).
 */
export function fitCalibration(extraction: Extraction, sidecar: Sidecar, timeMap: TimeMap): CalibrationResult {
  const failed: CalibrationResult = { kind: "calibration", m: 0, c: 0, r2: 0, points: [], status: "failed" };
  const model = sidecar.stimuli[0]?.model;
  if (!model || model.type !== "fixation_h") return failed;
  const { a, b } = timeMap;

  const pairs: { x: number; gazeH: number; n: number }[] = [];
  for (const fp of model.points) {
    const gazes: number[] = [];
    for (const f of extraction.frames) {
      if (!f.ok || f.gazeH == null) continue;
      const stimMs = (f.t * 1000 - b) / a;
      if (stimMs >= fp.startMs + SETTLE_MS && stimMs <= fp.startMs + fp.durMs) gazes.push(f.gazeH);
    }
    if (gazes.length >= 3) pairs.push({ x: fp.x, gazeH: median(gazes), n: gazes.length });
  }
  if (pairs.length < 3) return failed;

  const n = pairs.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of pairs) {
    sx += p.gazeH;
    sy += p.x;
    sxx += p.gazeH * p.gazeH;
    sxy += p.gazeH * p.x;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return failed;
  const m = (n * sxy - sx * sy) / denom;
  const c = (sy - m * sx) / n;

  const yMean = sy / n;
  let ssRes = 0;
  let ssTot = 0;
  const points = pairs.map((p) => {
    const pred = m * p.gazeH + c;
    ssRes += (p.x - pred) ** 2;
    ssTot += (p.x - yMean) ** 2;
    return { x: p.x, gazeH: p.gazeH, residual: p.x - pred, n: p.n };
  });
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const status: CalibrationResult["status"] = r2 < 0.8 ? "calibration_poor" : "ok";
  return { kind: "calibration", m, c, r2, points, status };
}
