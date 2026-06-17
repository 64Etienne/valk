// Normal reference ranges for physiological measurements
// Adjusted by age group and lighting conditions
// Based on peer-reviewed literature

interface ReferenceRange {
  normal: { min: number; max: number };
  unit: string;
  source: string;
}

interface AgeAdjustedRanges {
  young: ReferenceRange;  // 18-30
  middle: ReferenceRange; // 31-55
  senior: ReferenceRange; // 56+
}

function getRangeForAge(ranges: AgeAdjustedRanges, age: number): ReferenceRange {
  if (age <= 30) return ranges.young;
  if (age <= 55) return ranges.middle;
  return ranges.senior;
}

// ── Baseline ranges ──

export const PUPIL_DIAMETER: AgeAdjustedRanges = {
  young:  { normal: { min: 2.0, max: 5.0 }, unit: "mm", source: "Winn et al. 1994" },
  middle: { normal: { min: 2.0, max: 4.5 }, unit: "mm", source: "Winn et al. 1994" },
  senior: { normal: { min: 1.5, max: 4.0 }, unit: "mm", source: "Winn et al. 1994" },
};

export const BLINK_RATE: ReferenceRange = {
  normal: { min: 12, max: 20 },
  unit: "blinks/min",
  source: "Stern et al. 1994",
};

export const PERCLOS: ReferenceRange = {
  normal: { min: 0, max: 0.08 },
  unit: "proportion",
  source: "NHTSA/FHWA 1994",
};

export const PLR_LATENCY: ReferenceRange = {
  normal: { min: 180, max: 300 },
  unit: "ms",
  source: "Ellis 1981",
};

export const PLR_AMPLITUDE: AgeAdjustedRanges = {
  young:  { normal: { min: 0.8, max: 2.0 }, unit: "mm", source: "Bremner 2009" },
  middle: { normal: { min: 0.6, max: 1.5 }, unit: "mm", source: "Bremner 2009" },
  senior: { normal: { min: 0.4, max: 1.2 }, unit: "mm", source: "Bremner 2009" },
};

export const PLR_VELOCITY: ReferenceRange = {
  normal: { min: 1.0, max: 5.0 },
  unit: "mm/s",
  source: "Bremner 2009",
};

export const REDILATION_T50: ReferenceRange = {
  normal: { min: 500, max: 1500 },
  unit: "ms",
  source: "Bremner 2009",
};

export const SMOOTH_PURSUIT_GAIN: ReferenceRange = {
  normal: { min: 0.85, max: 1.15 },
  unit: "ratio",
  source: "Leigh & Zee 2015",
};

export const SCLERAL_REDNESS: ReferenceRange = {
  normal: { min: -2, max: 8 },
  unit: "LAB a*",
  source: "PMC3949462",
};

export const SCLERAL_YELLOWNESS: ReferenceRange = {
  normal: { min: 5, max: 20 },
  unit: "LAB b*",
  source: "AI jaundice detection lit.",
};

export const HIPPUS_FREQUENCY: ReferenceRange = {
  normal: { min: 0.2, max: 0.6 },
  unit: "Hz",
  source: "MDPI Bioengineering 2023",
};

// Build reference summary string for Claude prompt
export function buildReferenceRangesText(age: number, lighting: string): string {
  const pupil = getRangeForAge(PUPIL_DIAMETER, age);
  const plrAmp = getRangeForAge(PLR_AMPLITUDE, age);

  return `
REFERENCE RANGES (age ${age}, ${lighting} lighting):
- Pupil diameter: ${pupil.normal.min}-${pupil.normal.max} ${pupil.unit} (${pupil.source})
- Blink rate: ${BLINK_RATE.normal.min}-${BLINK_RATE.normal.max} ${BLINK_RATE.unit} (${BLINK_RATE.source})
- PERCLOS normal: <${PERCLOS.normal.max * 100}% (${PERCLOS.source})
- PLR latency: ${PLR_LATENCY.normal.min}-${PLR_LATENCY.normal.max} ${PLR_LATENCY.unit} (${PLR_LATENCY.source})
- PLR amplitude: ${plrAmp.normal.min}-${plrAmp.normal.max} ${plrAmp.unit} (${plrAmp.source})
- PLR velocity: ${PLR_VELOCITY.normal.min}-${PLR_VELOCITY.normal.max} ${PLR_VELOCITY.unit} (${PLR_VELOCITY.source})
- Re-dilation T50: ${REDILATION_T50.normal.min}-${REDILATION_T50.normal.max} ${REDILATION_T50.unit} (${REDILATION_T50.source})
- Smooth pursuit gain: ${SMOOTH_PURSUIT_GAIN.normal.min}-${SMOOTH_PURSUIT_GAIN.normal.max} (${SMOOTH_PURSUIT_GAIN.source})
- Scleral redness (a*): ${SCLERAL_REDNESS.normal.min}-${SCLERAL_REDNESS.normal.max} (${SCLERAL_REDNESS.source})
- Scleral yellowness (b*): ${SCLERAL_YELLOWNESS.normal.min}-${SCLERAL_YELLOWNESS.normal.max} (${SCLERAL_YELLOWNESS.source})
- Hippus frequency: ${HIPPUS_FREQUENCY.normal.min}-${HIPPUS_FREQUENCY.normal.max} ${HIPPUS_FREQUENCY.unit} (${HIPPUS_FREQUENCY.source})

ALCOHOL-SPECIFIC IMPAIRMENT THRESHOLDS (peer-reviewed):
BAC 0.015%: Pursuit gain ↓12%, open-loop acceleration ↓16% (Tyson et al. 2021, J Physiol, r²=0.96)
BAC 0.025%: Saccade amplitude ↑27% (Tyson et al. 2021)
BAC 0.035%: Saccade rate ↑24%, peak saccade velocity ↓21% (Tyson et al. 2021)
BAC 0.05%: Composite drowsiness score affected, visible conjunctival redness (Cori et al. 2023)
BAC 0.06%: Saccade velocities significantly degraded, gaze-evoked nystagmus (drift velocity 2x)
BAC 0.08%: ALL blink parameters impaired (Cori et al. 2023), HGN 4+ clues at 88% accuracy (Stuster & Burns 1998), PLR constriction velocity ↓28% (Jolkovsky et al. 2022), pupil dilation ↑8.8% (Castro et al. 2014)
BAC 0.10%: All oculomotor systems strongly impaired, HGN onset ≤40° (Tharp equation: BAC≈(50-onset°)/100)

ALCOHOL PLR EFFECTS (Jolkovsky et al. 2022, N=119 intoxicated vs 82 controls):
- Max pupil diameter: 4.33mm (sober) → 3.55mm (intoxicated), p<0.05
- Constriction velocity: 2.75mm/s → 1.99mm/s (↓28%), p<0.05
- Constriction %: 33.8% → 27.2% (↓20%), p<0.05
- Latency: 0.23s → 0.26s (↑13%), p<0.05
- Dilation velocity: 1.13mm/s → 0.88mm/s (↓22%), p<0.05

BLINK RATE & ALCOHOL (Kim et al. 2012):
- Sober baseline: 10.66 blinks/min
- 2h post-consumption: 13.56 blinks/min (↑27%)
- 12h post (hangover): 15.16 blinks/min (↑42%)

SMOOTH PURSUIT GAIN DOSE-RESPONSE (Tyson et al. 2021, r²=0.96):
- Sober baseline: 0.81±0.14
- BAC 0.035%: ~0.71 (↓12%)
- BAC 0.065%: ~0.63 (↓22%)
- At BAC 0.055%: 91% of tracking loss from pursuit deficit, but 94% recovered via compensatory saccades — so HIGH saccade count during pursuit = compensation for impaired pursuit

SACCADE IMPAIRMENT (Roche & King 2010, N=138 double-blind):
- Pro-saccade latency: significantly increased (F=35.2, p<0.0001)
- Pro-saccade velocity: significantly decreased (F=10.03, p<0.0001)
- Light drinkers more sensitive than heavy drinkers (dose × group: F=4.35, p<0.05)

MEASUREMENT RELIABILITY RANKING (consumer camera):
1. Blink rate — trivially measurable, ±1 blink/min (HIGH reliability)
2. PERCLOS — standard EAR-based, ±2% (HIGH reliability)
3. Scleral redness (a*) — detectable if lighting is adequate, ±2 LAB units (MODERATE reliability)
4. Smooth pursuit gain — Pearson correlation iris-target, ±0.1 (MODERATE reliability)
5. Saccade count during pursuit — catch-up saccades countable (MODERATE reliability)
6. Pupil diameter — pixel-based estimation, ±0.5mm (LOW-MODERATE reliability)
7. PLR dynamics — often unavailable on consumer cameras due to overexposure (LOW reliability)
${lighting === "dim" ? "\nNOTE: Dim lighting causes larger baseline pupil diameter — adjust interpretation accordingly. Scleral color measurements are unreliable in dim conditions." : ""}
${age >= 60 ? "\nNOTE: Age >60 typically shows reduced PLR amplitude and smaller baseline pupils." : ""}
`.trim();
}
