/**
 * Adaptateur de compatibilité legacy → store unifié.
 *
 * Les producteurs historiques (logger web `logger.ts`, audit de `/api/analyze`)
 * émettent des `ServerLogEntry` {ts, wallMs, level, event, data}. On les mappe
 * vers le contrat unifié `LogBatch` et on les persiste dans la **SQLite locale**
 * (`getStore()`), exactement comme les logs du mobile — tout converge au même
 * endroit, durable et inspectable via `/debug`.
 */
import { getStore } from "@/lib/observability/db";
import type { LogLevel } from "@valk/shared";

export interface ServerLogEntry {
  ts: number;
  wallMs: number;
  level: string;
  event: string;
  data?: unknown;
}

const LEVELS = new Set<string>(["trace", "debug", "info", "warn", "error"]);
function coerceLevel(l: string): LogLevel {
  return (LEVELS.has(l) ? l : "info") as LogLevel;
}

export function appendEntries(
  sid: string,
  ua: string,
  href: string,
  entries: ServerLogEntry[],
): void {
  if (!entries.length) return;
  const category = (href || "log").split("?")[0].slice(-60) || "log";
  getStore().insertLogs({
    sessionId: (sid || "anon").slice(0, 64),
    device: {
      platform: "web",
      runtime: "unknown",
      model: ua ? ua.slice(0, 120) : undefined,
    },
    entries: entries.map((e) => ({
      tsMonotonic: e.ts,
      tsWall: e.wallMs,
      level: coerceLevel(e.level),
      category,
      message: e.event,
      data: e.data,
    })),
  });
}
