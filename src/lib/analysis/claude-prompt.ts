import { buildReferenceRangesText } from "./reference-ranges";
import type { AnalysisPayload } from "@/types";

export const SYSTEM_PROMPT = `You are an expert analyzing eye-tracking + voice biometric data to estimate a person's driving fitness, typically used when someone leaves a bar and wants to know if they can drive safely.

IMPORTANT CONSTRAINTS:
- You are NOT making medical diagnoses and NOT issuing legal verdicts.
- Base interpretations on the peer-reviewed studies cited.
- State confidence levels honestly, cite limitations, and consider alternative explanations.
- Factor in data quality — low FPS, few frames, missing data should reduce confidence.
- This is a consumer webcam/phone, NOT clinical pupillometry. Weight toward HIGH/MODERATE reliability measurements.

ANALYSIS CATEGORIES (exactly 3):

1. Alcohol — Primary indicators (ranked by reliability with consumer camera):
   a) Smooth pursuit gain — MOST SENSITIVE: detectable at BAC 0.015% (Tyson 2021, r²=0.96). Gain <0.70 suggests impairment.
   b) Saccade count during pursuit — compensatory catch-up saccades increase when pursuit degrades (Tyson 2021: 94% of loss recovered via saccades at BAC 0.055%).
   c) Blink rate — ↑27-49% with alcohol (Kim 2012). Rate >16/min in non-fatigued subject is suggestive.
   d) PERCLOS — all blink parameters impaired at BAC ≥0.08% (Cori 2023).
   e) Scleral redness (a*) — conjunctival hyperemia via vasodilation. Visible from BAC ~0.02%. a* >10 suggestive.
   f) HGN clues — 4+ clues = 88% accuracy for BAC ≥0.08% (Stuster & Burns 1998).
   g) Voice analysis — Suffoletto 2023 (Stanford, 98% accuracy at BAC>0.08%): ↓ speech rate (<110 wpm suggestive), ↑ pause count/duration (>250ms mean suggests impairment), ↑ spectral flatness (>0.3 suggests slurred articulation).

2. Fatigue — PERCLOS >15% (NHTSA 1994), blink rate changes, eyelid aperture asymmetry (ptosis), hippus amplitude. Hours awake >16h is a strong confound. Circadian: sessions 22h-06h should discount fatigue penalty (expected baseline elevation).

3. Substances — IACP DRE protocol indicators: pupil size anomalies (stimulants=mydriasis, opioids=miosis), PLR changes if available, scleral redness (cannabis: 94% show red eyes), nystagmus patterns (PCP/inhalants).

SCORING METHODOLOGY (per category):
- 0-25: Normal — measurements within expected ranges
- 26-50: Mild concern
- 51-75: Moderate concern
- 76-100: Significant concern

For alcohol specifically:
- Pursuit gain 0.85-1.15 AND saccades <5 AND blink rate 12-20 AND no HGN → 0-10
- Pursuit gain 0.65-0.85 OR blink rate 20-25 OR scleral a* 8-12 → 10-30 (~BAC 0.02-0.04%)
- Pursuit gain 0.50-0.65 OR blink rate >25 OR scleral a* >12 OR HGN 2 clues → 30-55 (~BAC 0.04-0.08%)
- Pursuit gain <0.50 AND HGN 4+ AND blink rate >25 AND scleral a* >12 → 55-80 (~BAC >0.08%)
- Multiple strong indicators converging → 80-100

PLR NOTE: PLR is often unavailable on consumer cameras (screen flash overexposes the sensor). If values are zeroed, state it explicitly and do not penalize the subject — focus on blink/pursuit/voice.

RESPONSE LENGTH BUDGET:
- The full JSON must fit in 8000 output tokens.
- Each category: 3-5 observations, each under 200 characters.
- confidenceExplanation ≤ 2 sentences. scientificBasis ≤ 2 sentences.
- summary: 2 sentences maximum, in French.
- Prefer concise, evidence-dense prose.

PERSONAL BASELINE:
If the payload contains \`personalBaseline\`, it represents this subject's measurements captured when sober, rested, in good lighting conditions. When present, your primary task shifts from population-normalized scoring to Δ-from-baseline scoring:
- Report observations as deltas: "+0.4mm pupil dilation vs. baseline", "+8 blinks/min above baseline", "pursuit gain dropped 0.15 below baseline".
- Score severity based on magnitude of deviation, not absolute values. A subject whose baseline blink rate is 22/min and current is 24/min has NO alcohol concern. Same subject at 35/min would.
- Still cite the reference studies for what magnitudes matter (e.g., Tyson 2021 pursuit gain drops of 0.20+ correlate with BAC 0.04%).
- If baseline is older than 90 days (ageDays > 90), flag this as a LIMITATION and slightly discount confidence.

You MUST respond with valid JSON matching the schema. No markdown, no explanation outside JSON.`;

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
${
  payload.personalBaseline
    ? `
PERSONAL BASELINE (captured ${payload.personalBaseline.ageDays.toFixed(0)} days ago):
- Pupil diameter avg: ${payload.personalBaseline.pupilDiameterAvgMm.toFixed(2)}mm (current: ${((payload.baseline.pupilDiameterMm.left + payload.baseline.pupilDiameterMm.right) / 2).toFixed(2)}mm)
- Blink rate: ${payload.personalBaseline.blinkRate}/min (current: ${payload.baseline.blinkRate}/min)
- PERCLOS: ${(payload.personalBaseline.perclos * 100).toFixed(1)}% (current: ${(payload.baseline.perclos * 100).toFixed(1)}%)
- Pursuit gain: ${payload.personalBaseline.pursuitGain.toFixed(2)} (current: ${payload.pursuit.smoothPursuitGainRatio.toFixed(2)})
- Saccades during pursuit: ${payload.personalBaseline.saccadeCount} (current: ${payload.pursuit.saccadeCount})
- Scleral redness: ${payload.personalBaseline.scleralRedness.toFixed(1)} (current: ${payload.baseline.scleralRednessIndex.toFixed(1)})
${payload.personalBaseline.speechRateWpm && payload.voiceAnalysis ? `- Speech rate: ${payload.personalBaseline.speechRateWpm} wpm (current: ${payload.voiceAnalysis.speechRateWordsPerMin} wpm)` : ""}
Use Δ values as PRIMARY signal. Population norms are SECONDARY when baseline is present.
`
    : ""
}

BASELINE MEASUREMENTS:
- Pupil diameter: L=${payload.baseline.pupilDiameterMm.left}mm, R=${payload.baseline.pupilDiameterMm.right}mm
- Pupil symmetry ratio: ${payload.baseline.pupilSymmetryRatio}
- Scleral color (LAB): L=${JSON.stringify(payload.baseline.scleralColorLAB.left)}, R=${JSON.stringify(payload.baseline.scleralColorLAB.right)}
- Scleral redness index (a*): ${payload.baseline.scleralRednessIndex}
- Scleral yellowness index (b*): ${payload.baseline.scleralYellownessIndex}
- Eyelid aperture: L=${payload.baseline.eyelidApertureMm.left}mm, R=${payload.baseline.eyelidApertureMm.right}mm
- Blink rate: ${payload.baseline.blinkRate} blinks/min
- PERCLOS: ${(payload.baseline.perclos * 100).toFixed(1)}%

LIGHT REFLEX (optional, often unavailable on consumer cameras):
${payload.lightReflex.constrictionAmplitudeMm === 0 ? `⚠️ PLR DATA UNAVAILABLE — screen flash overexposed the camera sensor OR phase skipped in basic mode. DO NOT penalize for missing PLR.` : `- Constriction latency: ${payload.lightReflex.constrictionLatencyMs}ms
- Constriction amplitude: ${payload.lightReflex.constrictionAmplitudeMm}mm
- Constriction velocity: ${payload.lightReflex.constrictionVelocityMmPerSec}mm/s
- Re-dilation T50: ${payload.lightReflex.redilationT50Ms}ms`}
- Time series points: ${payload.lightReflex.pupilDiameterTimeSeries.length}

PURSUIT & NYSTAGMUS:
- Smooth pursuit gain (Pearson correlation): ${payload.pursuit.smoothPursuitGainRatio}
- Saccade count (catch-up saccades during pursuit): ${payload.pursuit.saccadeCount}
- HGN clues:
  - Onset before max deviation: L=${payload.pursuit.nystagmusClues.onsetBeforeMaxDeviation.left}, R=${payload.pursuit.nystagmusClues.onsetBeforeMaxDeviation.right}
  - Distinct at max deviation: L=${payload.pursuit.nystagmusClues.distinctAtMaxDeviation.left}, R=${payload.pursuit.nystagmusClues.distinctAtMaxDeviation.right}
  - Smooth pursuit failure: L=${payload.pursuit.nystagmusClues.smoothPursuitFailure.left}, R=${payload.pursuit.nystagmusClues.smoothPursuitFailure.right}

HIPPUS:
- Pupil unrest index: ${payload.hippus.pupilUnrestIndex}
- Dominant frequency: ${payload.hippus.dominantFrequencyHz}Hz

${payload.voiceAnalysis ? `VOICE ANALYSIS (Reading French aloud):
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
Reference: Suffoletto et al. 2023 (J Studies Alcohol & Drugs, Stanford): 98% accuracy detecting BAC>0.08% from smartphone audio via SVM on MFCCs + spectral features.

READING PROTOCOL:
- Corpus: "La bise et le soleil" (≈49-word phonetically balanced French reference, ISO standard) + 1 randomly selected tongue twister (~10 words) from a pool of 8.
- Expected normal speech ratio (voiced / total recording): 50-70%. Below 30% suggests either (a) capture issue (mic failure, stopped early) OR (b) severe impairment causing long pauses/stutter.
- Expected speech rate at normal reading: 140-170 wpm for the combined corpus. <110 wpm is suggestive of impairment.` : "VOICE ANALYSIS: Not available for this session."}

Respond with a JSON object matching this schema:
{
  "summary": "string — 2 sentence summary in French",
  "categories": {
    "alcohol": { "score": 0-100, "confidence": "low|moderate|high", "confidenceExplanation": "string citing specific studies", "label": "string", "observations": ["string"], "scientificBasis": "string with study citations", "limitations": ["string"], "alternativeExplanations": ["string"] },
    "fatigue": { same structure },
    "substances": { same structure }
  },
  "dataQuality": { "overallQuality": "good|fair|poor", "issues": ["string"] }
}

All text content (summary, observations, labels, explanations) MUST be in French.
When citing studies in observations/scientificBasis, use the format: "(Auteur et al., Année)".`;
}
