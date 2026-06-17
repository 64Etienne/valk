import type { AnalysisPayload } from "@/types";

export interface BaselineDelta {
  pupilDiameterDeltaMm: number;
  blinkRateDeltaPerMin: number;
  perclosDelta: number;
  pursuitGainDelta: number;
  saccadeCountDelta: number;
  // null when either side lacks the (optional) scleral redness index
  // (Phase 0.3 valk-v3 made these fields optional).
  scleralRednessDelta: number | null;
  speechRateDeltaWpm: number | null;
  pauseCountDelta: number | null;
}

function avgPupil(p: AnalysisPayload): number {
  return (
    (p.baseline.pupilDiameterMm.left + p.baseline.pupilDiameterMm.right) / 2
  );
}

export function computeBaselineDelta(
  baseline: AnalysisPayload,
  session: AnalysisPayload
): BaselineDelta {
  return {
    pupilDiameterDeltaMm: avgPupil(session) - avgPupil(baseline),
    blinkRateDeltaPerMin:
      session.baseline.blinkRate - baseline.baseline.blinkRate,
    perclosDelta: session.baseline.perclos - baseline.baseline.perclos,
    pursuitGainDelta:
      session.pursuit.smoothPursuitGainRatio -
      baseline.pursuit.smoothPursuitGainRatio,
    saccadeCountDelta:
      session.pursuit.saccadeCount - baseline.pursuit.saccadeCount,
    scleralRednessDelta:
      session.baseline.scleralRednessIndex !== undefined &&
      baseline.baseline.scleralRednessIndex !== undefined
        ? session.baseline.scleralRednessIndex -
          baseline.baseline.scleralRednessIndex
        : null,
    speechRateDeltaWpm:
      session.voiceAnalysis && baseline.voiceAnalysis
        ? session.voiceAnalysis.speechRateWordsPerMin -
          baseline.voiceAnalysis.speechRateWordsPerMin
        : null,
    pauseCountDelta:
      session.voiceAnalysis && baseline.voiceAnalysis
        ? session.voiceAnalysis.pauseCount - baseline.voiceAnalysis.pauseCount
        : null,
  };
}
