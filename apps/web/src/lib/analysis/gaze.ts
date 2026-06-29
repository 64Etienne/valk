import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { pursuitX, type Sidecar } from "@valk/shared";
import type { TimeMap } from "../observability/flash-detect";

const execFileP = promisify(execFile);

/** Racine du repo (où vit `tools/vision/`) — l'app tourne avec cwd=apps/web. */
function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "tools/vision"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export function visionPython(): string {
  return process.env.VALK_VISION_PYTHON || resolve(repoRoot(), "tools/vision/.venv/bin/python");
}
export function visionModel(): string {
  return resolve(repoRoot(), "tools/vision/models/face_landmarker.task");
}
function extractScript(): string {
  return resolve(repoRoot(), "tools/vision/extract_gaze.py");
}
function overlayScript(): string {
  return resolve(repoRoot(), "tools/vision/draw_overlay.py");
}

/** Lance le venv python + extract_gaze.py (execFile, pas de shell) et parse le JSON. */
export async function runExtraction(clipPath: string): Promise<Extraction> {
  const { stdout } = await execFileP(visionPython(), [extractScript(), clipPath, visionModel()], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
  return JSON.parse(stdout) as Extraction;
}

/** Génère `overlay.mp4` à côté du clip (best-effort). Renvoie le chemin ou null si échec. */
export async function generateOverlay(clipPath: string, signal: GazeSignal): Promise<string | null> {
  try {
    const dir = dirname(clipPath);
    const sigPath = join(dir, "signal.json");
    const outPath = join(dir, "overlay.mp4");
    writeFileSync(sigPath, JSON.stringify(signal));
    await execFileP(visionPython(), [overlayScript(), clipPath, sigPath, outPath, visionModel()], {
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    return outPath;
  } catch (e) {
    console.error("VALK overlay failed (non bloquant):", e);
    return null;
  }
}

export interface GazeFrame {
  t: number;
  ok: boolean;
  gazeH: number | null;
  irisPx?: [number, number] | null;
}
export interface Extraction {
  fps: number;
  width: number;
  height: number;
  frames: GazeFrame[];
}
export interface GazePoint {
  t: number;
  stimulusX: number;
  gazeX: number;
}
export interface GazeSignal {
  points: GazePoint[];
  r: number;
  facePct: number;
  signFlipped: boolean;
  status: "ok" | "gaze_unreliable" | "sync_unverified" | "failed";
}

const FACE_MIN_PCT = 60;

/** Moyenne glissante CENTRÉE (bords rétrécis, pas de zéro-padding). */
function centeredMA(xs: number[], w: number): number[] {
  const h = Math.floor(w / 2);
  return xs.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(xs.length - 1, i + h); j++) {
      s += xs[j];
      n++;
    }
    return s / n;
  });
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  const ma = a.reduce((p, c) => p + c, 0) / n;
  const mb = b.reduce((p, c) => p + c, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den < 1e-12 ? 0 : num / den;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
}
/** Normalise sur la plage robuste p5–p95 vers ~[0,1]. */
function robustNorm(xs: number[]): number[] {
  const s = xs.slice().sort((u, v) => u - v);
  const lo = percentile(s, 0.05);
  const hi = percentile(s, 0.95);
  const d = hi - lo || 1e-9;
  return xs.map((x) => (x - lo) / d);
}

export function buildSignal(extraction: Extraction, sidecar: Sidecar, timeMap: TimeMap): GazeSignal {
  const { frames } = extraction;
  const facePct = (100 * frames.filter((f) => f.ok).length) / Math.max(1, frames.length);
  const model = sidecar.stimuli[0].model;
  const { a, b } = timeMap;

  // frames OK dans la fenêtre du stimulus
  const sel: { t: number; gaze: number; stim: number }[] = [];
  for (const f of frames) {
    if (!f.ok || f.gazeH == null) continue;
    const stimMs = (f.t * 1000 - b) / a;
    if (stimMs >= model.startMs && stimMs <= model.startMs + model.durationMs) {
      sel.push({ t: f.t, gaze: f.gazeH, stim: pursuitX(model, stimMs) });
    }
  }

  if (sel.length < 5) {
    return { points: [], r: 0, facePct, signFlipped: false, status: "failed" };
  }

  const gazeSmooth = centeredMA(sel.map((p) => p.gaze), 7);
  const gazeN = robustNorm(gazeSmooth);
  const stimN = robustNorm(sel.map((p) => p.stim));

  let r = pearson(gazeN, stimN);
  let signFlipped = false;
  let gazeOut = gazeN;
  if (r < 0) {
    signFlipped = true;
    gazeOut = gazeN.map((x) => 1 - x);
    r = -r;
  }

  const points: GazePoint[] = sel.map((p, i) => ({ t: p.t, stimulusX: stimN[i], gazeX: gazeOut[i] }));

  let status: GazeSignal["status"] = "ok";
  if (timeMap.status !== "verified") status = "sync_unverified";
  else if (facePct < FACE_MIN_PCT) status = "gaze_unreliable";

  return { points, r, facePct, signFlipped, status };
}
