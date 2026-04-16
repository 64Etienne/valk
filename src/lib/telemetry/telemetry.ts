import type { AnalysisPayload, AnalysisResult } from "@/types";
import type { VerdictLevel } from "@/lib/analysis/verdict";

export interface TelemetryEvent {
  ua_family: string | null;
  os_family: string | null;
  viewport_bucket: "phone" | "tablet" | "desktop";
  phase_durations_ms: Record<string, number>;
  capture_fps: number;
  camera_resolution: string;
  voice_speech_ratio: number | null;
  voice_speech_rate_wpm: number | null;
  voice_snr_db: number | null;
  pursuit_gain: number;
  blink_rate_per_min: number;
  perclos: number;
  scleral_redness: number;
  alcohol_score: number;
  fatigue_score: number;
  substances_score: number;
  verdict_level: VerdictLevel;
  data_quality: "good" | "fair" | "poor";
  claude_latency_ms: number;
  total_session_ms: number;
}

function parseUA(ua: string): { uaFamily: string; osFamily: string } {
  const lc = ua.toLowerCase();
  let uaFamily = "unknown";
  if (lc.includes("edg/")) uaFamily = "edge";
  else if (lc.includes("firefox/")) uaFamily = "firefox";
  else if (lc.includes("chrome/")) uaFamily = "chrome";
  else if (lc.includes("safari/")) uaFamily = "safari";

  let osFamily = "unknown";
  if (lc.includes("android")) osFamily = "Android";
  else if (lc.includes("iphone") || lc.includes("ipad")) osFamily = "iOS";
  else if (lc.includes("mac os x")) osFamily = "macOS";
  else if (lc.includes("windows")) osFamily = "Windows";
  else if (lc.includes("linux")) osFamily = "Linux";

  return { uaFamily, osFamily };
}

function viewportBucket(w: number): "phone" | "tablet" | "desktop" {
  if (w < 600) return "phone";
  if (w < 1024) return "tablet";
  return "desktop";
}

export function buildTelemetryEvent(
  payload: AnalysisPayload,
  result: AnalysisResult,
  verdictLevel: VerdictLevel,
  claudeLatencyMs: number
): TelemetryEvent {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const { uaFamily, osFamily } = parseUA(ua);
  const w = typeof window !== "undefined" ? window.innerWidth : 0;

  const voiceRatio = payload.voiceAnalysis
    ? payload.voiceAnalysis.totalDurationMs > 0
      ? payload.voiceAnalysis.voicedDurationMs /
        payload.voiceAnalysis.totalDurationMs
      : null
    : null;

  return {
    ua_family: uaFamily,
    os_family: osFamily,
    viewport_bucket: viewportBucket(w),
    phase_durations_ms: {},
    capture_fps: payload.meta.averageFps,
    camera_resolution: `${payload.meta.cameraResolution.width}x${payload.meta.cameraResolution.height}`,
    voice_speech_ratio: voiceRatio,
    voice_speech_rate_wpm: payload.voiceAnalysis?.speechRateWordsPerMin ?? null,
    voice_snr_db: payload.voiceAnalysis?.signalToNoiseRatio ?? null,
    pursuit_gain: payload.pursuit.smoothPursuitGainRatio,
    blink_rate_per_min: payload.baseline.blinkRate,
    perclos: payload.baseline.perclos,
    scleral_redness: payload.baseline.scleralRednessIndex,
    alcohol_score: result.categories.alcohol.score,
    fatigue_score: result.categories.fatigue.score,
    substances_score: result.categories.substances.score,
    verdict_level: verdictLevel,
    data_quality: result.dataQuality.overallQuality,
    claude_latency_ms: Math.round(claudeLatencyMs),
    total_session_ms: payload.meta.captureDurationMs,
  };
}

/**
 * Best-effort telemetry send. Never throws.
 */
export async function sendTelemetry(event: TelemetryEvent): Promise<void> {
  try {
    await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    /* swallow */
  }
}
