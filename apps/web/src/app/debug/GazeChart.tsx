import type { GazeSignal } from "@/lib/analysis/gaze";

/** Courbes x(t) : stimulus (violet) vs regard (turquoise), normalisés [0,1]. */
export function GazeChart({ signal }: { signal: GazeSignal }) {
  const { points } = signal;
  if (!points.length) return <p className="text-xs text-zinc-500">Aucun point.</p>;
  const W = 320;
  const H = 120;
  const pad = 4;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t || t0 + 1;
  const xs = (t: number) => pad + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * pad);
  const ys = (v: number) => pad + (1 - Math.max(0, Math.min(1, v))) * (H - 2 * pad);
  const line = (key: "stimulusX" | "gazeX") =>
    points.map((p, i) => `${i ? "L" : "M"}${xs(p.t).toFixed(1)},${ys(p[key]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-black/30 ring-1 ring-white/10">
      <path d={line("stimulusX")} fill="none" stroke="#a78bfa" strokeWidth="1.5" />
      <path d={line("gazeX")} fill="none" stroke="#2dd4bf" strokeWidth="1.5" />
    </svg>
  );
}
