import { readFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { getStore } from "@/lib/observability/db";
import { checkDebugKey, unauthorized } from "@/lib/observability/auth";

export const runtime = "nodejs";

const mediaRoot = (): string => process.env.VALK_MEDIA_DIR || "data/media";

/** Sert overlay.mp4 d'une capture (gaté + containment au dossier media). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkDebugKey(request)) return unauthorized();
  const { id } = await params;
  const cap = getStore().getCapture(id);
  if (!cap) return Response.json({ error: "not found" }, { status: 404 });
  const path = resolve(join(dirname(cap.clipPath), "overlay.mp4"));
  const root = resolve(mediaRoot());
  if (path !== root && !path.startsWith(root + "/")) {
    return Response.json({ error: "hors périmètre" }, { status: 403 });
  }
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch {
    return Response.json({ error: "overlay absent" }, { status: 404 });
  }
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "video/mp4", "cache-control": "no-store" },
  });
}
