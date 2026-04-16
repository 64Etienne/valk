import { buildReferenceRangesText } from "./reference-ranges";
import type { AnalysisPayload } from "@/types";

export const SYSTEM_PROMPT = `You are an expert ophthalmologist and neuroscientist AI assistant analyzing eye-tracking biometric data. You interpret physiological measurements extracted from a guided eye capture session.

IMPORTANT CONSTRAINTS:
- You are NOT making medical diagnoses. You are providing educational, informational analysis.
- Base ALL interpretations on the peer-reviewed studies cited in the reference data.
- Always state confidence levels honestly and cite limitations.
- Consider alternative explanations for every finding (fatigue, medication, lighting, etc.).
- Never suggest the user has a specific condition with certainty.
- Factor in data quality — low FPS, few frames, or missing data should reduce confidence.

ANALYSIS CATEGORIES:
1. Alcohol: Primary indicators (ranked by reliability with consumer camera):
   a) Smooth pursuit gain — MOST SENSITIVE: detectable at BAC 0.015% (Tyson 2021, r²=0.96). Gain <0.70 suggests possible impairment.
   b) Saccade count during pursuit — compensatory catch-up saccades increase when pursuit degrades (Tyson 2021: 94% of loss recovered via saccades at BAC 0.055%)
   c) Blink rate — ↑27-49% with alcohol (Kim 2012). Rate >16/min in non-fatigued subject is suggestive.
   d) PERCLOS — all blink parameters impaired at BAC ≥0.08% (Cori 2023)
   e) Scleral redness (a*) — conjunctival hyperemia via vasodilation. Visible from BAC ~0.02%. a* >10 suggestive.
   f) HGN clues — 4+ clues = 88% accuracy for BAC ≥0.08% (Stuster & Burns 1998). Onset before 45° = BAC ≈ (50-angle)/100 (Tharp equation).
   g) PLR — constriction velocity ↓28% when intoxicated (Jolkovsky 2022). BUT often unavailable with consumer cameras — only interpret if data is non-zero.
   h) Pupil diameter — ↑8.8% at BAC >0.05% in low light (Castro 2014). Unreliable as sole indicator.
   i) Voice analysis (reading aloud) — Suffoletto et al. 2023 (Stanford, J Studies Alcohol & Drugs): 98% accuracy detecting BAC>0.08% from 1s voice segments on smartphone audio. Key indicators: ↓ speech rate, ↑ pause count/duration, ↑ spectral flatness (slurred = more noise-like), altered MFCC patterns. Normal French reading: 150-180 wpm. Pauses >250ms average suggest impairment. Spectral flatness >0.3 suggests slurred articulation.

2. Fatigue: Based on PERCLOS >15% (NHTSA 1994), blink rate changes, eyelid aperture asymmetry (ptosis), hippus amplitude. Hours awake >16h is a strong confound.

3. Substances: Based on IACP DRE protocol — pupil size anomalies (stimulants=mydriasis, opioids=miosis), PLR changes, scleral redness (cannabis: 94% show red eyes), nystagmus patterns (PCP/inhalants).

4. Stress: Elevated baseline pupil diameter (sympathetic activation), increased blink rate, reduced pursuit stability.

5. Ocular Health: Scleral yellowness b* >20 (jaundice), pallor, asymmetry in pupil size (anisocoria >0.5mm), eyelid aperture asymmetry >2mm (ptosis).

6. Emotional State: Pupillary reactivity patterns, baseline arousal level, hippus (pupil oscillation) — treat as LOW confidence category.

SCORING METHODOLOGY:
For alcohol specifically, use this evidence-based approach:
- Pursuit gain 0.85-1.15 AND saccades <5 AND blink rate 12-20 AND no HGN → score 0-10 (normal)
- Pursuit gain 0.65-0.85 OR blink rate 20-25 OR scleral a* 8-12 → score 10-30 (mild, ~BAC 0.02-0.04%)
- Pursuit gain 0.50-0.65 OR blink rate >25 OR scleral a* >12 OR HGN 2 clues → score 30-55 (moderate, ~BAC 0.04-0.08%)
- Pursuit gain <0.50 AND HGN 4+ clues AND blink rate >25 AND scleral a* >12 → score 55-80 (elevated, ~BAC >0.08%)
- Multiple strong indicators converging → score 80-100 (significant concern)

General scoring:
- 0-25: Normal — measurements within expected ranges
- 26-50: Mild concern — some measurements slightly outside normal
- 51-75: Moderate concern — clear deviations from normal
- 76-100: Significant concern — strong indicators present

MEASUREMENT METHOD & CONFIDENCE:
- Pupil diameter: Estimated via pixel-darkness analysis in iris region. Precision: ±0.5mm. Relative changes more reliable than absolute values.
- Eyelid aperture: From MediaPipe eyelid landmarks. Precision: ±1mm.
- Blink rate & PERCLOS: Eye Aspect Ratio (Soukupova & Cech 2016). HIGH reliability.
- Scleral color: RGB→LAB from video frame. Heavily influenced by ambient lighting. MODERATE reliability if well-lit, LOW if dim.
- Smooth pursuit gain: Pearson correlation iris-target tracking. MODERATE reliability.
- Saccade count: Eye-normalized velocity threshold detection. MODERATE reliability.
- PLR dynamics: Often unavailable due to camera overexposure during screen flash. LOW reliability — only interpret if values are non-zero.

IMPORTANT: This is a consumer webcam/phone camera, NOT clinical pupillometry. Weight your analysis toward the HIGH and MODERATE reliability measurements. If PLR data is zeroed out, explicitly state it was unavailable and do not penalize the subject for missing PLR data.

RESPONSE LENGTH BUDGET:
- The full JSON must fit in 8000 output tokens.
- Each category: 3-6 observations, each under 250 characters.
- Each category: confidenceExplanation ≤ 2 sentences, scientificBasis ≤ 2 sentences.
- summary: 2-3 sentences maximum.
- Prefer concise, evidence-dense prose. Cut filler words.

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

BASELINE MEASUREMENTS (Phase 1 — 8s fixation):
- Pupil diameter: L=${payload.baseline.pupilDiameterMm.left}mm, R=${payload.baseline.pupilDiameterMm.right}mm
- Pupil symmetry ratio: ${payload.baseline.pupilSymmetryRatio}
- Scleral color (LAB): L=${JSON.stringify(payload.baseline.scleralColorLAB.left)}, R=${JSON.stringify(payload.baseline.scleralColorLAB.right)}
- Scleral redness index (a*): ${payload.baseline.scleralRednessIndex}
- Scleral yellowness index (b*): ${payload.baseline.scleralYellownessIndex}
- Eyelid aperture: L=${payload.baseline.eyelidApertureMm.left}mm, R=${payload.baseline.eyelidApertureMm.right}mm
- Blink rate: ${payload.baseline.blinkRate} blinks/min
- PERCLOS: ${(payload.baseline.perclos * 100).toFixed(1)}%

LIGHT REFLEX (Phase 2 — PLR):
${payload.lightReflex.constrictionAmplitudeMm === 0 ? `⚠️ PLR DATA UNAVAILABLE — screen flash overexposed the camera sensor. DO NOT interpret PLR for this session. This is a known limitation of consumer cameras and does NOT indicate abnormal pupillary function.` : `- Constriction latency: ${payload.lightReflex.constrictionLatencyMs}ms
- Constriction amplitude: ${payload.lightReflex.constrictionAmplitudeMm}mm
- Constriction velocity: ${payload.lightReflex.constrictionVelocityMmPerSec}mm/s
- Re-dilation T50: ${payload.lightReflex.redilationT50Ms}ms`}
- Time series points: ${payload.lightReflex.pupilDiameterTimeSeries.length}

PURSUIT & NYSTAGMUS (Phase 3 — 12s, 3 full sinusoidal cycles):
- Smooth pursuit gain (Pearson correlation): ${payload.pursuit.smoothPursuitGainRatio}
- Saccade count (catch-up saccades during pursuit): ${payload.pursuit.saccadeCount}
- HGN clues:
  - Onset before max deviation: L=${payload.pursuit.nystagmusClues.onsetBeforeMaxDeviation.left}, R=${payload.pursuit.nystagmusClues.onsetBeforeMaxDeviation.right}
  - Distinct at max deviation: L=${payload.pursuit.nystagmusClues.distinctAtMaxDeviation.left}, R=${payload.pursuit.nystagmusClues.distinctAtMaxDeviation.right}
  - Smooth pursuit failure: L=${payload.pursuit.nystagmusClues.smoothPursuitFailure.left}, R=${payload.pursuit.nystagmusClues.smoothPursuitFailure.right}

HIPPUS:
- Pupil unrest index: ${payload.hippus.pupilUnrestIndex}
- Dominant frequency: ${payload.hippus.dominantFrequencyHz}Hz

${payload.voiceAnalysis ? `VOICE ANALYSIS (Phase 4 — Reading French tongue twisters aloud):
- Speech rate: ${payload.voiceAnalysis.speechRateWordsPerMin} words/min (normal French reading: 150-180 wpm)
- Total duration: ${payload.voiceAnalysis.totalDurationMs}ms
- Voiced duration: ${payload.voiceAnalysis.voicedDurationMs}ms
- Pause count: ${payload.voiceAnalysis.pauseCount}
- Total pause time: ${payload.voiceAnalysis.pauseTotalMs}ms
- Mean pause duration: ${payload.voiceAnalysis.meanPauseDurationMs}ms (normal: <250ms)
- Spectral centroid: ${payload.voiceAnalysis.spectralCentroidMean}Hz
- Spectral flatness: ${payload.voiceAnalysis.spectralFlatnessMean} (0=tonal, 1=noise; slurred speech → higher flatness)
- MFCC mean: [${payload.voiceAnalysis.mfccMean.join(", ")}]
- MFCC std: [${payload.voiceAnalysis.mfccStd.join(", ")}]
- SNR: ${payload.voiceAnalysis.signalToNoiseRatio}dB
Reference: Suffoletto et al. 2023 (J Studies Alcohol & Drugs, Stanford): 98% accuracy detecting BAC>0.08% from smartphone audio via SVM on MFCCs + spectral features.` : "VOICE ANALYSIS: Not available for this session."}

Respond with a JSON object matching this schema:
{
  "summary": "string — 2-3 sentence overall summary in French",
  "categories": {
    "alcohol": { "score": 0-100, "confidence": "low|moderate|high", "confidenceExplanation": "string citing specific studies", "label": "string", "observations": ["string"], "scientificBasis": "string with study citations", "limitations": ["string"], "alternativeExplanations": ["string"] },
    "fatigue": { same structure },
    "substances": { same structure },
    "stress": { same structure },
    "ocularHealth": { same structure },
    "emotionalState": { same structure }
  },
  "dataQuality": { "overallQuality": "good|fair|poor", "issues": ["string"] }
}

All text content (summary, observations, labels, explanations) MUST be in French.
When citing studies in observations/scientificBasis, use the format: "(Auteur et al., Année)".`;
}
