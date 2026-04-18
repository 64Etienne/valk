import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/analysis/claude-prompt";
import { analysisResultSchema } from "@/lib/analysis/response-schema";
import { encodeSSE } from "@/lib/streaming/sse";
import {
  parsePartialJSON,
  extractJSONBlock,
} from "@/lib/streaming/partial-json";
import { appendEntries } from "@/lib/logger/server-store";
import {
  checkQualityGates,
  hasHardGateFailure,
} from "@/lib/analysis/quality-gates";

export const maxDuration = 300;

const anthropic = new Anthropic();

// Phase 0.3 (valk-v3) : scleral color LAB + nystagmusClues rendus optionnels.
// Raison : ces champs sont calculés par le pipeline existant mais :
//   - sclera color n'est pas calibrée (pas de référence colorimétrique, AGC/WB iPhone
//     détruit le signal) → retirée du prompt en Phase 0.1, ignorée par le scoring
//   - nystagmusClues vient d'un stimulus sinusoïdal, pas du protocole HGN SFST
//     → ne peut pas porter ce nom, retirée du prompt en Phase 0.1
// Retrait complet du pipeline d'extraction prévu en Phase 2.6.
// En attendant, on accepte ces champs pour back-compat mais on ne les exploite plus.
const payloadSchema = z.object({
  baseline: z.object({
    pupilDiameterMm: z.object({ left: z.number(), right: z.number() }),
    pupilSymmetryRatio: z.number(),
    scleralColorLAB: z
      .object({
        left: z.tuple([z.number(), z.number(), z.number()]),
        right: z.tuple([z.number(), z.number(), z.number()]),
      })
      .optional(),
    scleralRednessIndex: z.number().optional(),
    scleralYellownessIndex: z.number().optional(),
    eyelidApertureMm: z.object({ left: z.number(), right: z.number() }),
    blinkRate: z.number(),
    perclos: z.number(),
    blinkRateActiveDurationMs: z.number().optional(),
    blinkRateReliable: z.boolean().optional(),
  }),
  lightReflex: z.object({
    constrictionLatencyMs: z.number(),
    constrictionAmplitudeMm: z.number(),
    constrictionVelocityMmPerSec: z.number(),
    redilationT50Ms: z.number(),
    pupilDiameterTimeSeries: z.array(
      z.object({ timeMs: z.number(), diameterMm: z.number() })
    ),
  }),
  pursuit: z.object({
    smoothPursuitGainRatio: z.number(),
    saccadeCount: z.number(),
    nystagmusClues: z
      .object({
        onsetBeforeMaxDeviation: z.object({
          left: z.boolean(),
          right: z.boolean(),
        }),
        distinctAtMaxDeviation: z.object({
          left: z.boolean(),
          right: z.boolean(),
        }),
        smoothPursuitFailure: z.object({
          left: z.boolean(),
          right: z.boolean(),
        }),
      })
      .optional(),
    irisPositionTimeSeries: z.array(
      z.object({ timeMs: z.number(), x: z.number(), y: z.number() })
    ),
  }),
  hippus: z.object({
    pupilUnrestIndex: z.number(),
    dominantFrequencyHz: z.number(),
  }),
  voiceAnalysis: z
    .object({
      mfccMean: z.array(z.number()),
      mfccStd: z.array(z.number()),
      spectralCentroidMean: z.number(),
      spectralFlatnessMean: z.number(),
      speechRateWordsPerMin: z.number(),
      pauseCount: z.number(),
      pauseTotalMs: z.number(),
      meanPauseDurationMs: z.number(),
      totalDurationMs: z.number(),
      voicedDurationMs: z.number(),
      signalToNoiseRatio: z.number(),
    })
    .optional(),
  context: z.object({
    timeOfDay: z.string(),
    hoursSinceLastSleep: z.number(),
    age: z.number(),
    ambientLighting: z.string(),
    selfReportedSubstanceUse: z.string().optional(),
  }),
  meta: z.object({
    captureTimestamp: z.string(),
    captureDurationMs: z.number(),
    frameCount: z.number(),
    averageFps: z.number(),
    deviceInfo: z.string(),
    cameraResolution: z.object({ width: z.number(), height: z.number() }),
  }),
});

// Simple in-memory rate limiting per IP (broken on serverless cold starts — acceptable MVP)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function sseErrorResponse(error: string, status: number): Response {
  return new Response(encodeSSE("error", { error }), {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return sseErrorResponse("Trop de requêtes. Réessayez dans une minute.", 429);
  }

  const sid = request.headers.get("x-session-id") || "anon";
  const ua = request.headers.get("user-agent") || "";
  const host = request.headers.get("host") || process.env.VERCEL_URL || "";
  const logsUrl = host ? `https://${host}/api/logs` : "";
  // Audit buffer — flushed to /api/logs at request end so all entries land
  // in the SAME lambda's store as the client logger, retrievable in raw JSON
  // via GET /api/logs/:sid (no MCP display truncation).
  const auditBuffer: Array<{
    ts: number;
    wallMs: number;
    level: string;
    event: string;
    data?: unknown;
  }> = [];

  const audit = (event: string, data?: unknown, level: string = "info") => {
    const entry = { ts: 0, wallMs: Date.now(), level, event, data };
    // Sink 1: same-lambda in-memory store (best-effort)
    appendEntries(sid, ua, "/api/analyze", [entry]);
    // Sink 2: stdout (visible in Vercel runtime logs, but MCP display truncates)
    try {
      const line = `VALK-AUDIT sid=${sid} [${level}] ${event} ${
        data !== undefined ? JSON.stringify(data) : ""
      }`;
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    } catch {
      /* JSON.stringify circular — unlikely with plain data */
    }
    // Sink 3: buffer for end-of-request flush to /api/logs (cross-lambda)
    auditBuffer.push(entry);
  };

  const flushAudit = async (): Promise<void> => {
    if (auditBuffer.length === 0 || !logsUrl) return;
    const entries = auditBuffer.splice(0);
    try {
      await fetch(logsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          ua,
          href: "/api/analyze",
          entries,
        }),
      });
    } catch (err) {
      console.error("VALK-AUDIT flush to /api/logs failed:", err);
    }
  };

  const body = await request.json().catch(() => null);
  if (!body) {
    audit("analyze.body.invalid", { reason: "json parse failed" }, "error");
    await flushAudit();
    return sseErrorResponse("Payload JSON invalide.", 400);
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    audit(
      "analyze.payload.schema.miss",
      {
        issues: parsed.error.issues.slice(0, 10).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      "error"
    );
    await flushAudit();
    return new Response(
      encodeSSE("error", {
        error: "Données invalides.",
        details: parsed.error.issues.slice(0, 3).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  // Full feature-set audit — tied to the client's sessionId so every number
  // the model sees ends up queryable via GET /api/logs/:sid.
  audit("analyze.payload.parsed", parsed.data);

  // Phase 1.2 (valk-v3): quality gates. Refuse to call Claude if the capture
  // is so degraded that any score would be meaningless. Return a structured
  // SSE status so the client can render a dedicated "capture insufficient"
  // screen rather than a fake verdict.
  const qualityIssues = checkQualityGates(parsed.data);
  if (hasHardGateFailure(qualityIssues)) {
    audit("analyze.quality.refused", { issues: qualityIssues }, "warn");
    await flushAudit();
    return new Response(
      encodeSSE("status", {
        code: "quality_insufficient",
        issues: qualityIssues,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      }
    );
  }
  if (qualityIssues.length > 0) {
    // Soft issues: let scoring proceed but log them for audit + UI
    // will still display as data-quality warnings.
    audit("analyze.quality.soft_issues", { issues: qualityIssues });
  }

  const userPrompt = buildUserPrompt(
    parsed.data as Parameters<typeof buildUserPrompt>[0]
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(encodeSSE(event, data)));
      };

      let accumulatedText = "";
      let lastEmittedLen = 0;

      const t0 = Date.now();
      try {
        const claudeStream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          messages: [{ role: "user", content: userPrompt }],
          system: SYSTEM_PROMPT,
        });

        audit("analyze.claude.start", {
          model: "claude-sonnet-4-6",
          promptLength: userPrompt.length,
        });
        send("start", { ts: Date.now() });

        for await (const chunk of claudeStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            accumulatedText += chunk.delta.text;

            // Emit partials sparingly (~every 200 chars of new content)
            if (accumulatedText.length - lastEmittedLen < 200) continue;
            lastEmittedLen = accumulatedText.length;

            const jsonText = extractJSONBlock(accumulatedText);
            if (jsonText) {
              const parsedPartial = parsePartialJSON(jsonText);
              if (parsedPartial && typeof parsedPartial === "object") {
                send("partial", parsedPartial);
              }
            }
          }
        }

        const finalMessage = await claudeStream.finalMessage();
        const elapsedMs = Date.now() - t0;

        audit("analyze.claude.finalMessage", {
          elapsedMs,
          stop_reason: finalMessage.stop_reason,
          input_tokens: finalMessage.usage?.input_tokens,
          output_tokens: finalMessage.usage?.output_tokens,
        });

        if (finalMessage.stop_reason === "max_tokens") {
          audit("analyze.error.max_tokens", { elapsedMs }, "error");
          send("error", {
            error: "Réponse IA tronquée (budget de tokens atteint). Réessayez.",
          });
          await flushAudit();
          controller.close();
          return;
        }

        const finalText = finalMessage.content.find((b) => b.type === "text");
        if (!finalText || finalText.type !== "text") {
          audit("analyze.error.no_text_block", { elapsedMs }, "error");
          send("error", { error: "Pas de contenu texte dans la réponse." });
          await flushAudit();
          controller.close();
          return;
        }

        // Persist the raw Claude response regardless of schema validity — the
        // raw text is the most informative artefact when diagnosing mismatches.
        audit("analyze.claude.rawText", { rawText: finalText.text });

        const jsonText = extractJSONBlock(finalText.text);
        const finalData = jsonText ? parsePartialJSON(jsonText) : null;
        const validated = analysisResultSchema.safeParse(finalData);

        if (!validated.success) {
          console.error("Claude response schema miss:", validated.error.issues);
          audit(
            "analyze.error.schema_miss",
            {
              elapsedMs,
              issues: validated.error.issues.slice(0, 10).map((i) => ({
                path: i.path.join("."),
                message: i.message,
              })),
            },
            "error"
          );
          send("error", {
            error: "Réponse IA malformée. Réessayez.",
            issues: validated.error.issues.slice(0, 5).map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          });
          await flushAudit();
          controller.close();
          return;
        }

        audit("analyze.final", validated.data);
        send("final", validated.data);
        await flushAudit();
        controller.close();
      } catch (err: unknown) {
        console.error("Streaming error:", err);
        const msg =
          err instanceof Error ? err.message : "Erreur pendant l'analyse.";
        audit("analyze.error.exception", {
          message: msg,
          stack: err instanceof Error ? err.stack?.slice(0, 600) : undefined,
        }, "error");
        send("error", { error: msg });
        await flushAudit();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
