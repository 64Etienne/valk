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
  if (luma.length < 10) return [];
  const sorted = luma.map((p) => p.y).slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // Écart robuste (MAD) : le flash illumine un visage souvent DÉJÀ clair
  // (auto-exposition iPhone) → il n'ajoute que ~4 unités de luminance. Seuil
  // sensible : médiane + 8·robustStd, plancher 1.5. Validé sur clip iPhone réel
  // (fond ~146.5, flashs ~150) ET sur vidéo synthétique (fond 16, flashs 235).
  const devs = sorted.map((y) => Math.abs(y - median)).sort((a, b) => a - b);
  const mad = devs[Math.floor(devs.length / 2)];
  const robustStd = 1.4826 * mad;
  const threshold = median + Math.max(1.5, 8 * robustStd);
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
