/**
 * Phase 1.2 (valk-v3): quality gates for /api/analyze.
 *
 * Refuses to produce a score when the capture is so degraded that any Claude
 * output would be meaningless noise — instead of a faux verdict, the UI
 * displays a clear "capture quality insufficient" explanation so the user
 * re-tests under better conditions.
 */
import type { AnalysisPayload } from "@/types";

export enum QualityGate {
  LOW_FPS = "fps_below_minimum",
  VOICE_CAPTURE_FAILED = "voiced_ratio_below_minimum",
  FACE_TRACKING_UNSTABLE = "face_tracking_unstable",
  PUPIL_ASYMMETRY_ARTIFACT = "pupil_asymmetry_suggests_landmarking_error",
  BLINK_SAMPLE_TOO_SMALL = "blink_rate_sample_below_minimum",
}

export interface QualityGateIssue {
  gate: QualityGate;
  measuredValue: number | string;
  threshold: number | string;
  humanReason: string;
}

const FPS_MIN = 10;
const VOICED_RATIO_MIN = 0.30;
const PUPIL_SYMMETRY_MIN = 0.70;
const PUPIL_SYMMETRY_MAX = 1.30;
const FRAME_COUNT_MIN_FOR_CAPTURE = 150; // ≈ 10 s × 15 FPS

/**
 * Returns the list of gates that FAIL (i.e. block scoring). Empty array ⇒
 * capture is good enough to score.
 */
export function checkQualityGates(
  payload: AnalysisPayload
): QualityGateIssue[] {
  const issues: QualityGateIssue[] = [];

  // FPS
  const fps = payload.meta.averageFps;
  if (fps > 0 && fps < FPS_MIN) {
    issues.push({
      gate: QualityGate.LOW_FPS,
      measuredValue: fps,
      threshold: FPS_MIN,
      humanReason: `Cadence de capture ${fps} FPS, minimum requis ${FPS_MIN}. Les signaux oculomoteurs dynamiques (pursuit, saccades, nystagmus) ne peuvent pas être mesurés de façon fiable en dessous.`,
    });
  }

  // Frame count sanity
  if (payload.meta.frameCount > 0 && payload.meta.frameCount < FRAME_COUNT_MIN_FOR_CAPTURE) {
    issues.push({
      gate: QualityGate.FACE_TRACKING_UNSTABLE,
      measuredValue: payload.meta.frameCount,
      threshold: FRAME_COUNT_MIN_FOR_CAPTURE,
      humanReason: `Seulement ${payload.meta.frameCount} frames valides capturées — tracking de visage trop instable ou capture interrompue.`,
    });
  }

  // Voiced ratio
  if (payload.voiceAnalysis) {
    const totalMs = payload.voiceAnalysis.totalDurationMs;
    const voicedMs = payload.voiceAnalysis.voicedDurationMs;
    if (totalMs > 0) {
      const ratio = voicedMs / totalMs;
      if (ratio < VOICED_RATIO_MIN) {
        issues.push({
          gate: QualityGate.VOICE_CAPTURE_FAILED,
          measuredValue: Math.round(ratio * 100) / 100,
          threshold: VOICED_RATIO_MIN,
          humanReason: `Ratio voix/total ${(ratio * 100).toFixed(0)} %, minimum ${(VOICED_RATIO_MIN * 100).toFixed(0)} %. Probablement : micro masqué, environnement trop bruyant, ou lecture interrompue.`,
        });
      }
    }
  }

  // Pupil asymmetry — likely landmarking artifact
  const ratio = payload.baseline.pupilSymmetryRatio;
  if (ratio > 0 && (ratio < PUPIL_SYMMETRY_MIN || ratio > PUPIL_SYMMETRY_MAX)) {
    issues.push({
      gate: QualityGate.PUPIL_ASYMMETRY_ARTIFACT,
      measuredValue: ratio,
      threshold: `${PUPIL_SYMMETRY_MIN}–${PUPIL_SYMMETRY_MAX}`,
      humanReason: `Asymétrie pupillaire ratio ${ratio.toFixed(2)} hors plage physiologique plausible (${PUPIL_SYMMETRY_MIN}–${PUPIL_SYMMETRY_MAX}). Très probable artefact de détection des landmarks iris — pas interprétable comme signal clinique.`,
    });
  }

  // Blink rate unreliable (Phase 2.7 flag)
  if (payload.baseline.blinkRateReliable === false) {
    issues.push({
      gate: QualityGate.BLINK_SAMPLE_TOO_SMALL,
      measuredValue: payload.baseline.blinkRateActiveDurationMs ?? 0,
      threshold: 20_000,
      humanReason: `Blink rate mesuré sur moins de 20 secondes de capture active — taille d'échantillon insuffisante pour une évaluation fiable.`,
    });
  }

  return issues;
}

/**
 * Distinguishes "hard" gates (refuse to score) from "soft" warnings (score
 * but reduce confidence). Hard gates are the ones that make scoring actively
 * misleading. Soft gates are data-quality annotations.
 */
export function isHardGate(gate: QualityGate): boolean {
  return (
    gate === QualityGate.LOW_FPS ||
    gate === QualityGate.VOICE_CAPTURE_FAILED ||
    gate === QualityGate.FACE_TRACKING_UNSTABLE
  );
}

export function hasHardGateFailure(issues: QualityGateIssue[]): boolean {
  return issues.some((i) => isHardGate(i.gate));
}
