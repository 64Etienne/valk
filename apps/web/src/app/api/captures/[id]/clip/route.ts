import { readFileSync } from "node:fs";
import { getStore } from "@/lib/observability/db";
import { checkDebugKey, unauthorized } from "@/lib/observability/auth";

export const runtime = "nodejs";

/** Sert le clip d'une capture (gaté par VALK_DEBUG_KEY). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkDebugKey(request)) return unauthorized();
  const { id } = await params;
  const cap = getStore().getCapture(id);
  if (!cap) return Response.json({ error: "not found" }, { status: 404 });
  let buf: Buffer;
  try {
    buf = readFileSync(cap.clipPath);
  } catch {
    return Response.json({ error: "clip absent du disque" }, { status: 404 });
  }
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "video/quicktime", "cache-control": "no-store" },
  });
}
