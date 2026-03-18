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
${lighting === "dim" ? "NOTE: Dim lighting causes larger baseline pupil diameter — adjust interpretation accordingly." : ""}
${age >= 60 ? "NOTE: Age >60 typically shows reduced PLR amplitude and smaller baseline pupils." : ""}
`.trim();
}
