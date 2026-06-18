import { getStore } from "@/lib/observability/db";
import { checkDebugKey, unauthorized, NO_LEAK_HEADERS } from "@/lib/observability/auth";

export const runtime = "nodejs";

/**
 * GET /api/logs/:sid — dump complet des logs d'une session depuis la SQLite.
 * **Gaté** par VALK_DEBUG_KEY (corrige l'IDOR : les logs contiennent des
 * données device potentiellement sensibles).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sid: string }> },
) {
  if (!checkDebugKey(request)) return unauthorized();
  const { sid } = await params;
  const logs = getStore().getSessionLogs(sid);
  return Response.json({ sessionId: sid, logs }, { headers: NO_LEAK_HEADERS });
}
