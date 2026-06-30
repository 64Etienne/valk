import type { CalibrationResult } from "@/lib/analysis/calibration";

/** Nuage de points gazeH↔x + droite ajustée m·gazeH+c. */
export function CalibChart({ calib }: { calib: CalibrationResult }) {
  const { points, m, c } = calib;
  if (!points.length) return <p className="text-xs text-zinc-500">Aucun point.</p>;
  const W = 320;
  const H = 140;
  const pad = 18;
  const gz = points.map((p) => p.gazeH);
  const gMin = Math.min(...gz);
  const gMax = Math.max(...gz);
  const sx = (g: number) => pad + ((g - gMin) / (gMax - gMin || 1)) * (W - 2 * pad);
  const sy = (x: number) => H - pad - x * (H - 2 * pad); // x écran 0..1
  const lineX1 = m * gMin + c;
  const lineX2 = m * gMax + c;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-black/30 ring-1 ring-white/10">
      <line x1={sx(gMin)} y1={sy(lineX1)} x2={sx(gMax)} y2={sy(lineX2)} stroke="#a78bfa" strokeWidth="1.5" />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.gazeH)} cy={sy(p.x)} r="4" fill="#2dd4bf" />
      ))}
    </svg>
  );
}
