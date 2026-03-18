// Capture phases
export type CapturePhase =
  | "idle"
  | "context_form"
  | "instructions"
  | "countdown"
  | "phase_1"
  | "phase_2_close"
  | "phase_2_flash"
  | "phase_2_dark"
  | "phase_3"
  | "extracting"
  | "analyzing"
  | "results";

// User context form
export interface UserContext {
  timeOfDay: string;
  hoursSinceLastSleep: number;
  age: number;
  ambientLighting: "bright" | "moderate" | "dim";
  selfReportedSubstanceUse?: string;
}

// Analysis payload sent to server (NO images)
export interface AnalysisPayload {
  baseline: {
    pupilDiameterMm: { left: number; right: number };
    pupilSymmetryRatio: number;
    scleralColorLAB: { left: [number, number, number]; right: [number, number, number] };
    scleralRednessIndex: number;
    scleralYellownessIndex: number;
    eyelidApertureMm: { left: number; right: number };
    blinkRate: number;
    perclos: number;
  };
  lightReflex: {
    constrictionLatencyMs: number;
    constrictionAmplitudeMm: number;
    constrictionVelocityMmPerSec: number;
    redilationT50Ms: number;
    pupilDiameterTimeSeries: Array<{ timeMs: number; diameterMm: number }>;
  };
  pursuit: {
    smoothPursuitGainRatio: number;
    saccadeCount: number;
    nystagmusClues: {
      onsetBeforeMaxDeviation: { left: boolean; right: boolean };
      distinctAtMaxDeviation: { left: boolean; right: boolean };
      smoothPursuitFailure: { left: boolean; right: boolean };
    };
    irisPositionTimeSeries: Array<{ timeMs: number; x: number; y: number }>;
  };
  hippus: { pupilUnrestIndex: number; dominantFrequencyHz: number };
  context: {
    timeOfDay: string;
    hoursSinceLastSleep: number;
    age: number;
    ambientLighting: string;
    selfReportedSubstanceUse?: string;
  };
  meta: {
    captureTimestamp: string;
    captureDurationMs: number;
    frameCount: number;
    averageFps: number;
    deviceInfo: string;
    cameraResolution: { width: number; height: number };
  };
}

// Analysis result from Claude
export interface CategoryScore {
  score: number;
  confidence: "low" | "moderate" | "high";
  confidenceExplanation: string;
  label: string;
  observations: string[];
  scientificBasis: string;
  limitations: string[];
  alternativeExplanations: string[];
}

export interface AnalysisResult {
  summary: string;
  categories: {
    alcohol: CategoryScore;
    fatigue: CategoryScore;
    substances: CategoryScore;
    stress: CategoryScore;
    ocularHealth: CategoryScore;
    emotionalState: CategoryScore;
  };
  dataQuality: {
    overallQuality: "good" | "fair" | "poor";
    issues: string[];
  };
}
