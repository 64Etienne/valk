import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/analysis/claude-prompt";
import { analysisResultSchema } from "@/lib/analysis/response-schema";

// Vercel function runtime budget — Fluid compute on Hobby supports up to 300s.
// Claude sonnet 4.6 with max_tokens=8192 + concision directive typically lands in 30-45s;
// 300s leaves headroom for slow completions and p99 network variance.
export const maxDuration = 300;

const anthropic = new Anthropic();

// Basic payload validation (not exhaustive — Claude handles interpretation)
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
    pupilDiameterTimeSeries: z.array(z.object({ timeMs: z.number(), diameterMm: z.number() })),
  }),
  pursuit: z.object({
    smoothPursuitGainRatio: z.number(),
    saccadeCount: z.number(),
    nystagmusClues: z.object({
      onsetBeforeMaxDeviation: z.object({ left: z.boolean(), right: z.boolean() }),
      distinctAtMaxDeviation: z.object({ left: z.boolean(), right: z.boolean() }),
      smoothPursuitFailure: z.object({ left: z.boolean(), right: z.boolean() }),
    }),
    irisPositionTimeSeries: z.array(z.object({ timeMs: z.number(), x: z.number(), y: z.number() })),
  }),
  hippus: z.object({
    pupilUnrestIndex: z.number(),
    dominantFrequencyHz: z.number(),
  }),
  voiceAnalysis: z.object({
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
  }).optional(),
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

/**
 * Extract a JSON object from Claude's response text.
 * Handles: pure JSON, ```json code blocks (with preamble/postamble),
 * and JSON embedded in free text.
 */
function extractJSON(raw: string): unknown {
  const text = raw.trim();

  // Try 1: pure JSON
  try {
    return JSON.parse(text);
  } catch { /* continue */ }

  // Try 2: markdown code block — extract content between fences
  const openIdx = text.indexOf("```");
  if (openIdx !== -1) {
    // Skip the opening fence line (```json or ```)
    const contentStart = text.indexOf("\n", openIdx);
    if (contentStart !== -1) {
      const closingIdx = text.indexOf("\n```", contentStart);
      if (closingIdx !== -1) {
        const inner = text.slice(contentStart + 1, closingIdx).trim();
        try {
          return JSON.parse(inner);
        } catch { /* fall through to try 3 */ }
      }
    }
  }

  // Try 3: find outermost balanced { … }
  const start = text.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\" && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return JSON.parse(text.slice(start, i + 1));
      }
    }
  }

  throw new SyntaxError(
    `Cannot extract JSON (length=${text.length}): ${text.slice(0, 300)}`
  );
}

// Simple in-memory rate limiting per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // requests per window
const RATE_WINDOW = 60_000; // 1 minute

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

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Trop de requêtes. Réessayez dans une minute." }, { status: 429 });
    }

    // Parse and validate payload
    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides.", details: parsed.error.issues.slice(0, 3) },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const userPrompt = buildUserPrompt(payload as any);

    // max_tokens=8192 with concision directive in prompt lands responses in 30-45s
    // while keeping 2x headroom over the 4K-token truncation incident we hit previously.
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: userPrompt }],
      system: SYSTEM_PROMPT,
    });

    // Fail loud on truncation — partial JSON masquerading as valid is still broken.
    if (message.stop_reason === "max_tokens") {
      console.error("Claude response truncated — partial JSON returned");
      return NextResponse.json(
        { error: "Réponse IA tronquée (budget de tokens atteint). Réessayez." },
        { status: 502 }
      );
    }

    // Extract text response
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Robustly extract JSON from Claude's response
    const resultData = extractJSON(textBlock.text);

    // Validate response structure — fail loud, do NOT return partial data.
    const validated = analysisResultSchema.safeParse(resultData);
    if (!validated.success) {
      console.error("Claude response validation failed:", validated.error.issues);
      return NextResponse.json(
        {
          error: "Réponse IA malformée. Réessayez.",
          issues: validated.error.issues.slice(0, 5).map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 502 }
      );
    }

    return NextResponse.json(validated.data);
  } catch (error: unknown) {
    console.error("Analysis error:", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Erreur de parsing de la réponse IA.", detail: error.message },
        { status: 500 }
      );
    }

    // Surface Anthropic SDK errors for debugging
    if (error && typeof error === "object" && "status" in error) {
      const apiErr = error as { status: number; message?: string };
      const msg = apiErr.message || "Erreur API Anthropic";
      return NextResponse.json(
        { error: `Anthropic ${apiErr.status}: ${msg}` },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de l'analyse. Veuillez réessayer." },
      { status: 500 }
    );
  }
}
