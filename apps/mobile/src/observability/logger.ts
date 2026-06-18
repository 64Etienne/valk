import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Application from "expo-application";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  LogChannel,
  buildSentryEnvelope,
  type DeviceContext,
  type LogBatch,
  type LogEntry,
  type LogLevel,
  type SentryEvent,
  type SentryLevel,
} from "@valk/shared";

const STORAGE_KEY = "valk:pending-logs";
const FLUSH_INTERVAL_MS = 5000;

function detectRuntime(): DeviceContext["runtime"] {
  // executionEnvironment : 'storeClient' (Expo Go) | 'standalone' | 'bare'
  const env = Constants.executionEnvironment;
  if (env === "storeClient") return "expoGo";
  if (env === "standalone" || env === "bare") return "devBuild";
  return "unknown";
}

function buildDevice(): DeviceContext {
  return {
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    model: Device.modelName ?? undefined,
    appVersion:
      Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? undefined,
    runtime: detectRuntime(),
  };
}

function genId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "sess-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function apiBase(): string {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  return extra?.apiBaseUrl ?? "";
}

function monotonic(): number {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return p?.now ? Math.round(p.now()) : Date.now();
}

const send = async (batch: LogBatch): Promise<boolean> => {
  const base = apiBase();
  if (!base) return false; // pas de serveur configuré → on garde en buffer (capé)
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/logs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // évite la page d'avertissement ngrok sur les tunnels de test (sans effet ailleurs)
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(batch),
    });
    return res.ok;
  } catch {
    return false;
  }
};

// --- Sentry via HTTP direct (envelope) ---
// Le SDK @sentry/react-native ne fonctionne pas en Expo Go (module natif absent).
// On envoie donc les events en POST fetch sur l'endpoint d'ingestion Sentry.
const SENTRY_LEVEL: Record<LogLevel, SentryLevel> = {
  trace: "debug",
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
};

function sentryDsn(): string {
  return (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn ?? "";
}

function hexEventId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const raw = c?.randomUUID
    ? c.randomUUID()
    : Math.random().toString(16).slice(2) + Date.now().toString(16);
  return raw.replace(/-/g, "").padEnd(32, "0").slice(0, 32);
}

function sendSentryEvent(event: SentryEvent): void {
  const dsn = sentryDsn();
  if (!dsn) return;
  const env = buildSentryEnvelope(dsn, event, {
    eventId: hexEventId(),
    timestampSec: Date.now() / 1000,
    sentAtIso: new Date().toISOString(),
  });
  if (!env) return;
  // fire-and-forget, best-effort
  void fetch(env.url, {
    method: "POST",
    headers: { "content-type": env.contentType },
    body: env.body,
  }).catch(() => {});
}

function sentryMirror(level: LogLevel, category: string, message: string): void {
  if (level !== "warn" && level !== "error") return;
  sendSentryEvent({
    level: SENTRY_LEVEL[level],
    message: `${category}: ${message}`,
    logger: category,
    tags: { runtime: detectRuntime() },
  });
}

let channel: LogChannel | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

async function persistRemainder(): Promise<void> {
  if (!channel) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(channel.pendingSnapshot()));
  } catch {
    /* best-effort */
  }
}

/** À appeler une fois au démarrage (montage racine). Idempotent. */
export async function initObservability(): Promise<void> {
  if (channel) return;
  channel = new LogChannel({
    sessionId: genId(),
    device: buildDevice(),
    send,
    flushThreshold: 20,
    now: monotonic,
    wallNow: () => Date.now(),
  });

  // Restaure les logs non envoyés d'une session précédente (offline buffer).
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      channel.restore(JSON.parse(raw) as LogEntry[]);
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }

  timer = setInterval(() => {
    void channel?.flush().then(persistRemainder);
  }, FLUSH_INTERVAL_MS);

  emit("info", "observability", "init", { runtime: detectRuntime() });
}

/** Arrête le flush périodique (rarement utile ; surtout pour les tests/HMR). */
export function stopObservability(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function emit(level: LogLevel, category: string, message: string, data?: unknown): void {
  channel?.log(level, category, message, data);
  sentryMirror(level, category, message);
}

/** Capture une exception : log local (→ /debug) + Sentry (best-effort). */
function captureException(e: unknown, context?: Record<string, unknown>): void {
  const msg = e instanceof Error ? e.message : String(e);
  channel?.log("error", "exception", msg, context);
  sendSentryEvent({
    level: "error",
    exception: { values: [{ type: e instanceof Error ? e.name : "Error", value: msg }] },
    logger: "exception",
    tags: { runtime: detectRuntime() },
    extra: context,
  });
}

export const logger = {
  captureException,
  trace: (category: string, message: string, data?: unknown) => emit("trace", category, message, data),
  debug: (category: string, message: string, data?: unknown) => emit("debug", category, message, data),
  info: (category: string, message: string, data?: unknown) => emit("info", category, message, data),
  warn: (category: string, message: string, data?: unknown) => emit("warn", category, message, data),
  error: (category: string, message: string, data?: unknown) => emit("error", category, message, data),
  /** Force l'envoi immédiat du buffer (ex. avant un écran critique). */
  flush: (): Promise<void> => channel?.flush().then(persistRemainder) ?? Promise.resolve(),
};
