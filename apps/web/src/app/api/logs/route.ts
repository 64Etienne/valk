import { logBatchSchema } from "@valk/shared";
import { getStore } from "@/lib/observability/db";
import { appendEntries, type ServerLogEntry } from "@/lib/logger/server-store";
import { checkDebugKey, unauthorized, NO_LEAK_HEADERS } from "@/lib/observability/auth";

export const runtime = "nodejs";

/**
 * Ingestion des logs (sink unifié → SQLite locale).
 * - POST : accepte le contrat unifié `logBatchSchema` (mobile) ET le format
 *   legacy {sessionId, ua, href, entries:[{ts,wallMs,level,event,data}]} (web).
 *   Public (ingestion ; pas de secret partageable côté client).
 * - GET : liste des sessions — **gaté** par VALK_DEBUG_KEY.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // Contrat unifié (mobile + futur web)
  const parsed = logBatchSchema.safeParse(body);
  if (parsed.success) {
    getStore().insertLogs(parsed.data);
    return Response.json({ ok: true, count: parsed.data.entries.length });
  }

  // Compat legacy
  const b = body as {
    sessionId?: string;
    ua?: string;
    href?: string;
    entries?: ServerLogEntry[];
  };
  if (b && Array.isArray(b.entries)) {
    if (b.entries.length === 0) return Response.json({ ok: true, skipped: true });
    appendEntries(b.sessionId ?? "anon", b.ua ?? "", b.href ?? "", b.entries);
    return Response.json({ ok: true, count: b.entries.length, legacy: true });
  }

  return Response.json({ ok: false, error: "unrecognized payload" }, { status: 400 });
}

export async function GET(request: Request) {
  if (!checkDebugKey(request)) return unauthorized();
  return Response.json(
    { sessions: getStore().listSessions() },
    { headers: NO_LEAK_HEADERS },
  );
}
