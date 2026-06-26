import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getStore } from "@/lib/observability/db";
import { checkDebugKey, unauthorized } from "@/lib/observability/auth";

export const runtime = "nodejs";

const mediaRoot = (): string => process.env.VALK_MEDIA_DIR || "data/media";

/** Sert le clip d'une capture (gaté par VALK_DEBUG_KEY). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkDebugKey(request)) return unauthorized();
  const { id } = await params;
  const cap = getStore().getCapture(id);
  if (!cap) return Response.json({ error: "not found" }, { status: 404 });
  // Containment : ne servir que des fichiers sous le dossier media (défense lecture arbitraire).
  const root = resolve(mediaRoot());
  const path = resolve(cap.clipPath);
  if (path !== root && !path.startsWith(root + "/")) {
    return Response.json({ error: "hors périmètre" }, { status: 403 });
  }
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch {
    return Response.json({ error: "clip absent du disque" }, { status: 404 });
  }
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "video/quicktime", "cache-control": "no-store" },
  });
}
