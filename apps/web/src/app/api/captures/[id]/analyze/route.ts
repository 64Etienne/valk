import { getStore } from "@/lib/observability/db";
import { runExtraction, buildSignal, generateOverlay, selectPursuitWindow } from "@/lib/analysis/gaze";
import { fitCalibration } from "@/lib/analysis/calibration";
import { computePursuitMetrics } from "@/lib/analysis/metrics";
import { checkDebugKey, unauthorized } from "@/lib/observability/auth";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkDebugKey(request)) return unauthorized();
  const { id } = await params;
  const cap = getStore().getCapture(id);
  if (!cap) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    const extraction = await runExtraction(cap.clipPath);
    const timeMap = cap.timeMap ?? { a: 1, b: 0, anchors: 0, status: "sync_unverified" as const };
    const kind = cap.sidecar.stimuli[0]?.model.type;
    if (kind === "fixation_h") {
      const calib = fitCalibration(extraction, cap.sidecar, timeMap);
      getStore().setCaptureCalibration(id, calib);
      return Response.json({ ok: true, kind: "calibration", status: calib.status, r2: calib.r2, m: calib.m, c: calib.c });
    }
    const signal = buildSignal(extraction, cap.sidecar, timeMap);
    // Métriques B3 : calibration `ok` la plus récente (listCaptures est trié DESC)
    const calCap = getStore().listCaptures().find((x) => x.calibration?.status === "ok");
    const calibRef = calCap?.calibration
      ? { id: calCap.id, m: calCap.calibration.m, c: calCap.calibration.c, r2: calCap.calibration.r2, createdAt: calCap.createdAt }
      : null;
    const window = selectPursuitWindow(extraction, cap.sidecar, timeMap);
    if (window && window.length > 0) {
      signal.metrics = computePursuitMetrics(window, extraction.fps, calibRef, Date.now());
    }
    getStore().setCaptureAnalysis(id, signal);
    await generateOverlay(cap.clipPath, signal); // best-effort (gère ses erreurs)
    return Response.json({
      ok: true,
      kind: "pursuit",
      status: signal.status,
      r: signal.r,
      facePct: signal.facePct,
      signFlipped: signal.signFlipped,
      metrics: signal.metrics ?? null,
    });
  } catch (e) {
    console.error("VALK analyze failed:", e);
    getStore().setCaptureAnalysis(id, { points: [], r: 0, facePct: 0, signFlipped: false, status: "failed" });
    return Response.json({ ok: false, error: "analyse échouée" }, { status: 500 });
  }
}
