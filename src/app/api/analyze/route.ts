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

export const maxDuration = 300;

const anthropic = new Anthropic();

const payloadSchema = z.object({
  baseline: z.object({
    pupilDiameterMm: z.object({ left: z.number(), right: z.number() }),
    pupilSymmetryRatio: z.number(),
    scleralColorLAB: z.object({
      left: z.tuple([z.number(), z.number(), z.number()]),
      right: z.tuple([z.number(), z.number(), z.number()]),
    }),
    scleralRednessIndex: z.number(),
    scleralYellownessIndex: z.number(),
    eyelidApertureMm: z.object({ left: z.number(), right: z.number() }),
    blinkRate: z.number(),
    perclos: z.number(),
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
    nystagmusClues: z.object({
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
    }),
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

  const body = await request.json().catch(() => null);
  if (!body) return sseErrorResponse("Payload JSON invalide.", 400);

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
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

      try {
        const claudeStream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          messages: [{ role: "user", content: userPrompt }],
          system: SYSTEM_PROMPT,
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

        if (finalMessage.stop_reason === "max_tokens") {
          send("error", {
            error: "Réponse IA tronquée (budget de tokens atteint). Réessayez.",
          });
          controller.close();
          return;
        }

        const finalText = finalMessage.content.find((b) => b.type === "text");
        if (!finalText || finalText.type !== "text") {
          send("error", { error: "Pas de contenu texte dans la réponse." });
          controller.close();
          return;
        }

        const jsonText = extractJSONBlock(finalText.text);
        const finalData = jsonText ? parsePartialJSON(jsonText) : null;
        const validated = analysisResultSchema.safeParse(finalData);

        if (!validated.success) {
          console.error("Claude response schema miss:", validated.error.issues);
          send("error", {
            error: "Réponse IA malformée. Réessayez.",
            issues: validated.error.issues.slice(0, 5).map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          });
          controller.close();
          return;
        }

        send("final", validated.data);
        controller.close();
      } catch (err: unknown) {
        console.error("Streaming error:", err);
        const msg =
          err instanceof Error ? err.message : "Erreur pendant l'analyse.";
        send("error", { error: msg });
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
