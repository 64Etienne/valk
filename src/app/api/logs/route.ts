import { NextRequest, NextResponse } from "next/server";

/**
 * Client-side logger sink. Writes each batch to server stdout so it lands
 * in Vercel runtime logs (queryable via the Vercel MCP).
 *
 * Payload: { sessionId, ua, href, entries: LogEntry[] }
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
    const uaShort = (ua ?? "").slice(0, 80);

    for (const e of entries) {
      // Prefix `VALK-LOG` makes it easy to grep in Vercel runtime logs
      const line = `VALK-LOG sid=${sid} path=${path} t+${e.ts}ms [${e.level}] ${e.event} ${
        e.data !== undefined ? JSON.stringify(e.data).slice(0, 800) : ""
      }`;
      if (e.level === "error") console.error(line);
      else if (e.level === "warn") console.warn(line);
      else console.log(line);
    }
    // Also log once per batch a boundary marker
    console.log(`VALK-LOG-BATCH sid=${sid} count=${entries.length} ua=${uaShort}`);

    return NextResponse.json({ ok: true, count: entries.length });
  } catch (err) {
    console.error("VALK-LOG error processing batch:", err);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
