import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fitLinearTimeMap, type Sidecar } from "@valk/shared";

const execFileP = promisify(execFile);

export interface TimeMap {
  a: number;
  b: number;
  anchors: number;
  status: "verified" | "sync_unverified";
}

/**
 * Luminance moyenne (YAVG) par frame avec son timestamp vidéo (s), via ffmpeg signalstats.
 * `execFile` (pas de shell → pas d'injection).
 */
export async function extractLuma(clipPath: string): Promise<{ t: number; y: number }[]> {
  const { stdout, stderr } = await execFileP(
    "ffmpeg",
    ["-i", clipPath, "-vf", "signalstats,metadata=print:file=-", "-an", "-f", "null", "-"],
    { maxBuffer: 128 * 1024 * 1024 },
  );
  const text = `${stdout}\n${stderr}`;
  const out: { t: number; y: number }[] = [];
  let curT: number | null = null;
  for (const line of text.split("\n")) {
    const mt = line.match(/pts_time:([0-9.]+)/);
    if (mt) {
      curT = parseFloat(mt[1]);
      continue;
    }
    const my = line.match(/lavfi\.signalstats\.YAVG=([0-9.]+)/);
    if (my && curT != null) out.push({ t: curT, y: parseFloat(my[1]) });
  }
  return out;
}

/**
 * Détecte les fronts montants de luminance (flashs in-band) avec un seuil ADAPTATIF
 * (le flash illumine le visage : YAVG monte au-dessus du fond, pas jusqu'au blanc pur).
 */
export function detectFlashes(luma: { t: number; y: number }[]): number[] {
  if (luma.length < 3) return [];
  const sorted = luma.map((p) => p.y).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const threshold = median + Math.max(20, (p95 - median) * 0.5);
  const edges: number[] = [];
  let above = false;
  for (const p of luma) {
    if (p.y > threshold && !above) {
      edges.push(p.t);
      above = true;
    } else if (p.y <= threshold) {
      above = false;
    }
  }
  return edges;
}

/**
 * Calcule la carte temporelle video = a·stim + b en ancrant les 2 flashs détectés
 * (1er = début, dernier = fin) sur les `scheduledMs` du sidecar.
 */
export async function computeTimeMap(clipPath: string, sidecar: Sidecar): Promise<TimeMap> {
  const flashes = detectFlashes(await extractLuma(clipPath));
  const start = sidecar.syncMarkers.find((m) => m.edge === "start");
  const end = sidecar.syncMarkers.find((m) => m.edge === "end");
  if (flashes.length < 2 || !start || !end) {
    return { a: 1, b: 0, anchors: flashes.length, status: "sync_unverified" };
  }
  const fit = fitLinearTimeMap([
    { stim: start.scheduledMs, video: flashes[0] * 1000 },
    { stim: end.scheduledMs, video: flashes[flashes.length - 1] * 1000 },
  ]);
  return { a: fit.a, b: fit.b, anchors: 2, status: "verified" };
}
