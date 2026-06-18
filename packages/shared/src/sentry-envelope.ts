/**
 * Envoi d'events à Sentry en **HTTP direct** (format "envelope"), sans le SDK
 * natif `@sentry/react-native` — indispensable en Expo Go où le module natif est
 * indisponible. Pur (les identifiants/horloge sont injectés) → testable.
 */

export type SentryLevel = "fatal" | "error" | "warning" | "info" | "debug";

export interface SentryEvent {
  level?: SentryLevel;
  message?: string;
  logger?: string;
  exception?: { values: Array<{ type: string; value: string }> };
  tags?: Record<string, string>;
  environment?: string;
  release?: string;
  extra?: Record<string, unknown>;
}

export interface ParsedDsn {
  key: string;
  host: string;
  projectId: string;
  ingestUrl: string;
}

export function parseSentryDsn(dsn: string): ParsedDsn | null {
  const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (!m) return null;
  const [, key, host, projectId] = m;
  return {
    key,
    host,
    projectId,
    ingestUrl: `https://${host}/api/${projectId}/envelope/?sentry_key=${key}&sentry_version=7`,
  };
}

/**
 * Construit l'URL d'ingestion et le corps "envelope" (3 lignes NDJSON) pour un event.
 * `ids` est injecté (eventId 32 hex sans tirets, timestampSec, sentAtIso) pour rester pur.
 */
export function buildSentryEnvelope(
  dsn: string,
  event: SentryEvent,
  ids: { eventId: string; timestampSec: number; sentAtIso: string },
): { url: string; body: string; contentType: string } | null {
  const parsed = parseSentryDsn(dsn);
  if (!parsed) return null;
  const envelopeHeader = JSON.stringify({ event_id: ids.eventId, sent_at: ids.sentAtIso, dsn });
  const itemHeader = JSON.stringify({ type: "event" });
  const payload = JSON.stringify({
    event_id: ids.eventId,
    timestamp: ids.timestampSec,
    platform: "javascript",
    ...event,
  });
  return {
    url: parsed.ingestUrl,
    body: `${envelopeHeader}\n${itemHeader}\n${payload}\n`,
    contentType: "application/x-sentry-envelope",
  };
}
