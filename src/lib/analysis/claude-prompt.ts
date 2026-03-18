import { buildReferenceRangesText } from "./reference-ranges";
import type { AnalysisPayload } from "@/types";

export const SYSTEM_PROMPT = `You are an expert ophthalmologist and neuroscientist AI assistant analyzing eye-tracking biometric data. You interpret physiological measurements extracted from a guided eye capture session.

IMPORTANT CONSTRAINTS:
- You are NOT making medical diagnoses. You are providing educational, informational analysis.
- Base ALL interpretations on peer-reviewed scientific literature.
- Always state confidence levels honestly and cite limitations.
- Consider alternative explanations for every finding.
- Never suggest the user has a specific disease or condition with certainty.
- Factor in data quality — low FPS, few frames, or missing data should reduce confidence.

ANALYSIS CATEGORIES:
1. Alcohol: Based on HGN clues (Burns & Moskowitz 1977), PLR changes, scleral redness
2. Fatigue: Based on PERCLOS (NHTSA/FHWA 1994), blink rate, ptosis, hippus
3. Substances: Based on pupil size anomalies, PLR changes, scleral redness (IACP DRE protocol)
4. Stress: Based on elevated baseline pupil diameter, increased blink rate
5. Ocular Health: Based on scleral yellowness (jaundice), pallor (anemia), asymmetry
6. Emotional State: Based on pupillary reactivity patterns, baseline arousal

SCORING:
- 0-25: Normal — measurements within expected ranges
- 26-50: Mild concern — some measurements slightly outside normal
- 51-75: Moderate concern — clear deviations from normal
- 76-100: Significant concern — strong indicators present

You MUST respond with valid JSON matching the specified schema. No markdown, no explanation outside JSON.`;

export function buildUserPrompt(payload: AnalysisPayload): string {
  const ranges = buildReferenceRangesText(payload.context.age, payload.context.ambientLighting);

  return `Analyze the following eye-tracking biometric data and provide a structured assessment.

${ranges}

CAPTURE METADATA:
- Duration: ${payload.meta.captureDurationMs}ms
- Frames: ${payload.meta.frameCount}
- Average FPS: ${payload.meta.averageFps}
- Camera: ${payload.meta.cameraResolution.width}x${payload.meta.cameraResolution.height}
- Time: ${payload.context.timeOfDay}
- Hours awake: ~${payload.context.hoursSinceLastSleep}h
- Age: ${payload.context.age}
- Lighting: ${payload.context.ambientLighting}
${payload.context.selfReportedSubstanceUse ? `- Self-reported substance: ${payload.context.selfReportedSubstanceUse}` : ""}

BASELINE MEASUREMENTS (Phase 1 — 3s fixation):
- Pupil diameter: L=${payload.baseline.pupilDiameterMm.left}mm, R=${payload.baseline.pupilDiameterMm.right}mm
- Pupil symmetry ratio: ${payload.baseline.pupilSymmetryRatio}
- Scleral color (LAB): L=${JSON.stringify(payload.baseline.scleralColorLAB.left)}, R=${JSON.stringify(payload.baseline.scleralColorLAB.right)}
- Scleral redness index (a*): ${payload.baseline.scleralRednessIndex}
- Scleral yellowness index (b*): ${payload.baseline.scleralYellownessIndex}
- Eyelid aperture: L=${payload.baseline.eyelidApertureMm.left}mm, R=${payload.baseline.eyelidApertureMm.right}mm
- Blink rate: ${payload.baseline.blinkRate} blinks/min
- PERCLOS: ${(payload.baseline.perclos * 100).toFixed(1)}%

LIGHT REFLEX (Phase 2 — PLR):
- Constriction latency: ${payload.lightReflex.constrictionLatencyMs}ms
- Constriction amplitude: ${payload.lightReflex.constrictionAmplitudeMm}mm
- Constriction velocity: ${payload.lightReflex.constrictionVelocityMmPerSec}mm/s
- Re-dilation T50: ${payload.lightReflex.redilationT50Ms}ms
- Time series points: ${payload.lightReflex.pupilDiameterTimeSeries.length}

PURSUIT & NYSTAGMUS (Phase 3):
- Smooth pursuit gain: ${payload.pursuit.smoothPursuitGainRatio}
- Saccade count: ${payload.pursuit.saccadeCount}
- HGN clues:
  - Onset before max deviation: L=${payload.pursuit.nystagmusClues.onsetBeforeMaxDeviation.left}, R=${payload.pursuit.nystagmusClues.onsetBeforeMaxDeviation.right}
  - Distinct at max deviation: L=${payload.pursuit.nystagmusClues.distinctAtMaxDeviation.left}, R=${payload.pursuit.nystagmusClues.distinctAtMaxDeviation.right}
  - Smooth pursuit failure: L=${payload.pursuit.nystagmusClues.smoothPursuitFailure.left}, R=${payload.pursuit.nystagmusClues.smoothPursuitFailure.right}

HIPPUS:
- Pupil unrest index: ${payload.hippus.pupilUnrestIndex}
- Dominant frequency: ${payload.hippus.dominantFrequencyHz}Hz

Respond with a JSON object matching this schema:
{
  "summary": "string — 2-3 sentence overall summary in French",
  "categories": {
    "alcohol": { "score": 0-100, "confidence": "low|moderate|high", "confidenceExplanation": "string", "label": "string", "observations": ["string"], "scientificBasis": "string", "limitations": ["string"], "alternativeExplanations": ["string"] },
    "fatigue": { same structure },
    "substances": { same structure },
    "stress": { same structure },
    "ocularHealth": { same structure },
    "emotionalState": { same structure }
  },
  "dataQuality": { "overallQuality": "good|fair|poor", "issues": ["string"] }
}

All text content (summary, observations, labels, explanations) MUST be in French.`;
}
