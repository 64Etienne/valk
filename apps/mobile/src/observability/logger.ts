import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Application from "expo-application";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  LogChannel,
  type DeviceContext,
  type LogBatch,
  type LogEntry,
  type LogLevel,
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
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batch),
    });
    return res.ok;
  } catch {
    return false;
  }
};

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
}

export const logger = {
  trace: (category: string, message: string, data?: unknown) => emit("trace", category, message, data),
  debug: (category: string, message: string, data?: unknown) => emit("debug", category, message, data),
  info: (category: string, message: string, data?: unknown) => emit("info", category, message, data),
  warn: (category: string, message: string, data?: unknown) => emit("warn", category, message, data),
  error: (category: string, message: string, data?: unknown) => emit("error", category, message, data),
  /** Force l'envoi immédiat du buffer (ex. avant un écran critique). */
  flush: (): Promise<void> => channel?.flush().then(persistRemainder) ?? Promise.resolve(),
};
