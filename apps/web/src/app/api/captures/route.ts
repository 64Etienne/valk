import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sidecarSchema } from "@valk/shared";
import { getStore, type CaptureRecord } from "@/lib/observability/db";
import { computeTimeMap } from "@/lib/observability/flash-detect";
import { checkDebugKey, unauthorized, NO_LEAK_HEADERS } from "@/lib/observability/auth";

export const runtime = "nodejs";

// Lu au runtime (pas en const d'import) pour rester surchargeable en test.
const mediaRoot = (): string => process.env.VALK_MEDIA_DIR || "data/media";

const MAX_CLIP_BYTES = 300 * 1024 * 1024;

/** id = nom de dossier → sanitize du sessionId (anti path-traversal : pas de `/`, `..`). */
function newCaptureId(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "anon";
  return `${safe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Ingestion d'une capture : multipart { clip (.mov), sidecar (JSON), sessionId }.
 * Stocke le clip + sidecar sur disque, détecte les flashs → time-map, persiste en SQLite.
 */
export async function POST(request: Request) {
  if (!checkDebugKey(request)) return unauthorized();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "form invalide" }, { status: 400 });
  }
  const clip = form.get("clip");
  const sidecarStr = form.get("sidecar");
  const sessionId = (form.get("sessionId") as string) || "anon";
  if (!(clip instanceof File) || typeof sidecarStr !== "string") {
    return Response.json({ ok: false, error: "clip + sidecar requis" }, { status: 400 });
  }
  if (clip.size > MAX_CLIP_BYTES) {
    return Response.json({ ok: false, error: "clip trop volumineux" }, { status: 413 });
  }
  let sidecar;
  try {
    sidecar = sidecarSchema.parse(JSON.parse(sidecarStr));
  } catch {
    return Response.json({ ok: false, error: "sidecar invalide" }, { status: 400 });
  }

  const id = newCaptureId(sessionId.slice(0, 48));
  const dir = join(mediaRoot(), id);
  mkdirSync(dir, { recursive: true });
  const clipPath = join(dir, "clip.mov");
  const buf = Buffer.from(await clip.arrayBuffer());
  writeFileSync(clipPath, buf);
  writeFileSync(join(dir, "sidecar.json"), sidecarStr);

  let timeMap = null;
  try {
    timeMap = await computeTimeMap(clipPath, sidecar);
  } catch (e) {
    console.error("VALK computeTimeMap failed:", e);
  }

  const rec: CaptureRecord = {
    id,
    sessionId,
    createdAt: Date.now(),
    clipPath,
    size: buf.length,
    sidecar,
    timeMap,
    status: timeMap?.status ?? "sync_unverified",
    analysis: null,
    calibration: null,
  };
  getStore().insertCapture(rec);
  return Response.json({ ok: true, captureId: id, timeMap });
}

export async function GET(request: Request) {
  if (!checkDebugKey(request)) return unauthorized();
  return Response.json({ captures: getStore().listCaptures() }, { headers: NO_LEAK_HEADERS });
}
