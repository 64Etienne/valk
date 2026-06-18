import { describe, it, expect } from "vitest";
import { parseSentryDsn, buildSentryEnvelope } from "../sentry-envelope";

const DSN = "https://abc123@o42.ingest.de.sentry.io/999";

describe("parseSentryDsn", () => {
  it("parse une DSN valide", () => {
    const p = parseSentryDsn(DSN);
    expect(p).not.toBeNull();
    expect(p!.key).toBe("abc123");
    expect(p!.host).toBe("o42.ingest.de.sentry.io");
    expect(p!.projectId).toBe("999");
    expect(p!.ingestUrl).toBe("https://o42.ingest.de.sentry.io/api/999/envelope/?sentry_key=abc123&sentry_version=7");
  });
  it("rejette une DSN invalide", () => {
    expect(parseSentryDsn("pas-une-dsn")).toBeNull();
    expect(parseSentryDsn("")).toBeNull();
  });
});

describe("buildSentryEnvelope", () => {
  const ids = { eventId: "deadbeef", timestampSec: 1700, sentAtIso: "2026-06-18T00:00:00.000Z" };

  it("construit une enveloppe NDJSON à 3 lignes", () => {
    const env = buildSentryEnvelope(DSN, { level: "error", message: "boom", logger: "test" }, ids);
    expect(env).not.toBeNull();
    expect(env!.url).toContain("/api/999/envelope/");
    expect(env!.contentType).toBe("application/x-sentry-envelope");
    const lines = env!.body.trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    const head = JSON.parse(lines[0]);
    const itemHead = JSON.parse(lines[1]);
    const payload = JSON.parse(lines[2]);
    expect(head.event_id).toBe("deadbeef");
    expect(itemHead.type).toBe("event");
    expect(payload.level).toBe("error");
    expect(payload.message).toBe("boom");
    expect(payload.platform).toBe("javascript");
    expect(payload.timestamp).toBe(1700);
  });

  it("renvoie null sur DSN invalide", () => {
    expect(buildSentryEnvelope("nope", { message: "x" }, ids)).toBeNull();
  });
});
