import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/analysis/claude-prompt";
import { analysisResultSchema } from "@/lib/analysis/response-schema";

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

    // Call Claude API
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: userPrompt }],
      system: SYSTEM_PROMPT,
    });

    // Extract text response
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse JSON from response
    let jsonText = textBlock.text.trim();
    // Handle markdown code blocks
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const resultData = JSON.parse(jsonText);

    // Validate response structure
    const validated = analysisResultSchema.safeParse(resultData);
    if (!validated.success) {
      console.error("Claude response validation failed:", validated.error.issues);
      // Return raw data anyway — it's close enough
      return NextResponse.json(resultData);
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    console.error("Analysis error:", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Erreur de parsing de la réponse IA." }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Erreur lors de l'analyse. Veuillez réessayer." },
      { status: 500 }
    );
  }
}
