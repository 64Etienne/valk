import { centeredMA, pearson, type PursuitWindowPoint } from "./gaze";

/** Calibration utilisée pour convertir gazeH en unités écran (cf. B2). */
export interface CalibrationRef {
  id: string;
  m: number;
  c: number;
  r2: number;
  createdAt: number;
}

export interface PursuitMetrics {
  /** Pente regard-calibré ~ stimulus après alignement au lag. 1.0 = poursuite parfaite. null sans calibration. */
  gain: number | null;
  /** Décalage maximisant |r| (ms). Positif = le regard RETARDE, négatif = anticipe. */
  lagMs: number;
  /** |r| au meilleur décalage. */
  rPeak: number;
  /** RMS de l'erreur de suivi, signaux centrés, unités écran. null sans calibration. */
  rmse: number | null;
  saccades: number;
  saccadesPerSec: number;
  calibrationId: string | null;
  calibrationR2: number | null;
  calibrationAgeMs: number | null;
  status: "ok" | "no_calibration";
}

function mean(xs: number[]): number {
  return xs.reduce((p, c) => p + c, 0) / xs.length;
}

/** Aligne (série, stim) pour un décalage d : d>0 ⇒ compare série[i+d] à stim[i] (regard en retard). */
function shifted(series: number[], stim: number[], d: number): [number[], number[]] {
  const n = series.length;
  if (d > 0) return [series.slice(d), stim.slice(0, n - d)];
  if (d < 0) return [series.slice(0, n + d), stim.slice(-d)];
  return [series, stim];
}

/**
 * Métriques de poursuite sur la fenêtre du stimulus (B3).
 * Le gain/RMSE exigent une calibration (B2) PROCHE EN GÉOMÉTRIE de la capture
 * (validé : même-géométrie → gain 0.81 plausible ; autre géométrie → absurde).
 */
export function computePursuitMetrics(
  window: PursuitWindowPoint[],
  fps: number,
  calib: CalibrationRef | null,
  nowMs: number,
): PursuitMetrics {
  const base: PursuitMetrics = {
    gain: null,
    lagMs: 0,
    rPeak: 0,
    rmse: null,
    saccades: 0,
    saccadesPerSec: 0,
    calibrationId: calib?.id ?? null,
    calibrationR2: calib?.r2 ?? null,
    calibrationAgeMs: calib ? Math.max(0, nowMs - calib.createdAt) : null,
    status: calib ? "ok" : "no_calibration",
  };
  const n = window.length;
  if (n < 10 || fps <= 0) return base;
  const gazeRaw = window.map((p) => p.gaze);
  const stim = window.map((p) => p.stim);

  // Série pour le lag : calibrée si possible (le signe du miroir est porté par m<0),
  // sinon gazeH brut (la corrélation est invariante d'échelle ; on maximise |r|).
  const smooth = centeredMA(gazeRaw, 7);
  const series = calib ? smooth.map((g) => calib.m * g + calib.c) : smooth;

  // LAG : corrélation croisée sur ±500 ms.
  const maxShift = Math.min(Math.round(0.5 * fps), Math.floor(n / 2) - 1);
  let bestD = 0;
  let bestAbsR = -1;
  for (let d = -maxShift; d <= maxShift; d++) {
    const [x, y] = shifted(series, stim, d);
    if (x.length < 10) continue;
    const r = Math.abs(pearson(x, y));
    if (r > bestAbsR) {
      bestAbsR = r;
      bestD = d;
    }
  }
  base.lagMs = (bestD * 1000) / fps;
  base.rPeak = Math.max(0, bestAbsR);

  // GAIN + RMSE (calibrés uniquement), après alignement au lag.
  if (calib) {
    const [ga, sa] = shifted(series, stim, bestD);
    const ma = mean(ga);
    const ms = mean(sa);
    let cov = 0;
    let varS = 0;
    for (let i = 0; i < ga.length; i++) {
      cov += (ga[i] - ma) * (sa[i] - ms);
      varS += (sa[i] - ms) ** 2;
    }
    if (varS > 1e-12) {
      base.gain = cov / varS;
      let se = 0;
      for (let i = 0; i < ga.length; i++) se += (ga[i] - ma - (sa[i] - ms)) ** 2;
      base.rmse = Math.sqrt(se / ga.length);
    }
  }

  // SACCADES : pics de vitesse (lissage léger), seuil robuste MAD, réfractaire 100 ms.
  // Indépendant de la calibration (le seuil s'auto-échelonne).
  const light = centeredMA(gazeRaw, 3);
  const av: number[] = [];
  for (let i = 1; i < light.length; i++) av.push(Math.abs((light[i] - light[i - 1]) * fps));
  const sorted = av.slice().sort((x, y) => x - y);
  const med = sorted[Math.floor(sorted.length / 2)];
  const devs = sorted.map((v) => Math.abs(v - med)).sort((x, y) => x - y);
  const mad = devs[Math.floor(devs.length / 2)];
  const th = med + 6 * 1.4826 * Math.max(mad, 1e-9);
  const refractory = Math.max(1, Math.floor(0.1 * fps));
  let count = 0;
  for (let i = 0; i < av.length; ) {
    if (av[i] > th) {
      count++;
      i += refractory;
    } else {
      i++;
    }
  }
  base.saccades = count;
  base.saccadesPerSec = count / (n / fps);
  return base;
}
