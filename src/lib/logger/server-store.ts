/**
 * In-memory log store on the server side. Client batches POST to /api/logs →
 * stored here, queryable via GET /api/logs/sessions (list) or GET /api/logs/:sid
 * (full log dump). Survives warm lambda instances; cleared on cold start.
 *
 * NOT persistent across deploys — but good enough for live iterative debugging
 * (including reading what the user's iPhone actually did in real time).
 */

export interface ServerLogEntry {
  ts: number;
  wallMs: number;
  level: string;
  event: string;
  data?: unknown;
}

interface Session {
  sid: string;
  ua: string;
  href: string;
  firstSeen: number;
  lastSeen: number;
  entries: ServerLogEntry[];
}

const MAX_SESSIONS = 50;
const MAX_ENTRIES_PER_SESSION = 2000;
const MAX_AGE_MS = 60 * 60 * 1000; // 1h

// Module-level Map; persists across warm invocations of the same lambda instance.
const store: Map<string, Session> = new Map();

function gc() {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [k, v] of store.entries()) {
    if (v.lastSeen < cutoff) store.delete(k);
  }
  // Also cap total count
  if (store.size > MAX_SESSIONS) {
    const sorted = Array.from(store.entries()).sort(
      (a, b) => a[1].lastSeen - b[1].lastSeen
    );
    for (let i = 0; i < sorted.length - MAX_SESSIONS; i++) {
      store.delete(sorted[i][0]);
    }
  }
}

export function appendEntries(
  sid: string,
  ua: string,
  href: string,
  entries: ServerLogEntry[]
): void {
  gc();
  let session = store.get(sid);
  const now = Date.now();
  if (!session) {
    session = {
      sid,
      ua,
      href,
      firstSeen: now,
      lastSeen: now,
      entries: [],
    };
    store.set(sid, session);
  }
  session.lastSeen = now;
  session.href = href; // latest
  session.entries.push(...entries);
  if (session.entries.length > MAX_ENTRIES_PER_SESSION) {
    session.entries = session.entries.slice(-MAX_ENTRIES_PER_SESSION);
  }
}

export function getSession(sid: string): Session | undefined {
  gc();
  return store.get(sid);
}

export function listSessions(): Array<{
  sid: string;
  ua: string;
  href: string;
  firstSeen: number;
  lastSeen: number;
  entryCount: number;
}> {
  gc();
  return Array.from(store.values())
    .map((s) => ({
      sid: s.sid,
      ua: s.ua,
      href: s.href,
      firstSeen: s.firstSeen,
      lastSeen: s.lastSeen,
      entryCount: s.entries.length,
    }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}
