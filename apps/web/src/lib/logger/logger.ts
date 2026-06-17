"use client";

/**
 * Client-side logger with multiple transports:
 *   1. console (always)
 *   2. Remote POST to /api/logs (throttled, batched) — server-side console.log
 *      lands in Vercel runtime logs, readable via MCP.
 *   3. In-memory ring buffer (exposed on window.__valkLogs for manual inspect)
 *
 * Also hooks:
 *   - window.onerror
 *   - window.onunhandledrejection
 *   - console.error / console.warn (wraps to capture every message)
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts: number;           // ms since page load
  wallMs: number;       // epoch ms
  level: LogLevel;
  event: string;
  data?: unknown;
  tag: string;          // "valk" — easy grep in Vercel logs
}

const MAX_BUFFER = 500;
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_MAX_BATCH = 50;

const BUFFER_KEY = "__valkLogs";

interface ValkLogGlobals {
  __valkLogs?: LogEntry[];
  __valkLogSessionId?: string;
  __valkLogStartedAt?: number;
}

function w(): Window & ValkLogGlobals {
  return (typeof window !== "undefined" ? window : {}) as Window & ValkLogGlobals;
}

let queue: LogEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let installed = false;
let sessionId = "";

function sid(): string {
  const win = w();
  if (win.__valkLogSessionId) return win.__valkLogSessionId;
  const gen =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  win.__valkLogSessionId = gen;
  win.__valkLogStartedAt = Date.now();
  return gen;
}

function push(level: LogLevel, event: string, data?: unknown) {
  const win = w();
  const now = performance.now();
  const entry: LogEntry = {
    ts: Math.round(now),
    wallMs: Date.now(),
    level,
    event,
    data: safeClone(data),
    tag: "valk",
  };
  queue.push(entry);
  win[BUFFER_KEY] = (win[BUFFER_KEY] ?? []).concat(entry).slice(-MAX_BUFFER);

  const prefix = `[valk ${level}] t+${(now / 1000).toFixed(1)}s`;
  const args = data !== undefined ? [prefix, event, data] : [prefix, event];
  if (level === "error") originalConsole.error(...args);
  else if (level === "warn") originalConsole.warn(...args);
  else if (level === "info") originalConsole.info(...args);
  else originalConsole.debug(...args);
}

function safeClone(v: unknown): unknown {
  if (v === undefined) return undefined;
  try {
    return JSON.parse(
      JSON.stringify(v, (_k, val) => {
        if (val instanceof Error) {
          return { name: val.name, message: val.message, stack: val.stack };
        }
        if (val instanceof Event) {
          return { type: val.type };
        }
        if (typeof val === "bigint") return val.toString();
        return val;
      })
    );
  } catch {
    return String(v);
  }
}

// Keep originals before wrapping so our own log() doesn't recurse
const originalConsole = {
  log: typeof console !== "undefined" ? console.log.bind(console) : () => {},
  info: typeof console !== "undefined" ? console.info.bind(console) : () => {},
  warn: typeof console !== "undefined" ? console.warn.bind(console) : () => {},
  error: typeof console !== "undefined" ? console.error.bind(console) : () => {},
  debug: typeof console !== "undefined" ? console.debug.bind(console) : () => {},
};

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, FLUSH_MAX_BATCH);
  try {
    await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        ua: typeof navigator !== "undefined" ? navigator.userAgent : "?",
        href: typeof location !== "undefined" ? location.href : "?",
        entries: batch,
      }),
      keepalive: true,
    });
  } catch {
    // Re-queue on failure, but bounded to avoid memory leak
    if (queue.length < MAX_BUFFER) queue.unshift(...batch.slice(0, 20));
  }
}

export function installLogger() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  sessionId = sid();

  // Wrap console.error + console.warn to capture EVERYTHING that hits them
  const win = w();
  win[BUFFER_KEY] = win[BUFFER_KEY] ?? [];

  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    push("error", "console.error", args.map(a => (a instanceof Error ? { name: a.name, message: a.message, stack: a.stack } : a)));
  };
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    push("warn", "console.warn", args);
  };

  // Global error handlers
  window.addEventListener("error", (e) => {
    push("error", "window.onerror", {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      errorName: e.error?.name,
      errorMessage: e.error?.message,
      stack: e.error?.stack,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason as unknown;
    push("error", "window.unhandledrejection", {
      reasonName: reason instanceof Error ? reason.name : typeof reason,
      reasonMessage: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  // Flush timer
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

  // Flush on unload
  window.addEventListener("beforeunload", () => flush());
  window.addEventListener("pagehide", () => flush());

  push("info", "logger.installed", { sessionId });
}

export function log(event: string, data?: unknown) {
  push("info", event, data);
}

export function logDebug(event: string, data?: unknown) {
  push("debug", event, data);
}

export function logWarn(event: string, data?: unknown) {
  push("warn", event, data);
}

export function logError(event: string, data?: unknown) {
  push("error", event, data);
}

export function getSessionId(): string {
  return sessionId || sid();
}
