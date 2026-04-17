import { NextRequest, NextResponse } from "next/server";
import { appendEntries, listSessions } from "@/lib/logger/server-store";

/**
 * Client-side logger sink.
 * - POST: accept a batch of log entries, store in server memory (for later
 *   retrieval via GET /api/logs/:sid) AND emit to stdout (Vercel runtime logs).
 * - GET: return the list of recent sessions with metadata.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, ua, href, entries } = body as {
      sessionId?: string;
      ua?: string;
      href?: string;
      entries?: Array<{
        ts: number;
        wallMs: number;
        level: string;
        event: string;
        data?: unknown;
      }>;
    };

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const sid = (sessionId ?? "anon").slice(0, 36);
    const path = (href ?? "").split("?")[0].slice(-60);
    const uaShort = (ua ?? "").slice(0, 120);

    // Store in memory for GET retrieval
    appendEntries(sid, uaShort, href ?? "", entries);

    // Also emit to Vercel runtime logs for out-of-band visibility
    for (const e of entries) {
      const line = `VALK-LOG sid=${sid} path=${path} t+${e.ts}ms [${e.level}] ${e.event} ${
        e.data !== undefined ? JSON.stringify(e.data).slice(0, 800) : ""
      }`;
      if (e.level === "error") console.error(line);
      else if (e.level === "warn") console.warn(line);
      else console.log(line);
    }

    return NextResponse.json({ ok: true, count: entries.length });
  } catch (err) {
    console.error("VALK-LOG error processing batch:", err);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ sessions: listSessions() });
}
