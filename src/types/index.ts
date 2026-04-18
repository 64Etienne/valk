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
  | "phase_4_reading"
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
    // Phase 0.3 (valk-v3): sclera color fields are no longer calibrated
    // (no white reference on consumer webcam). Optional in wire format;
    // the feature extractor may still emit them, but they are ignored by
    // the prompt and scoring. Full removal in Phase 2.6.
    scleralColorLAB?: { left: [number, number, number]; right: [number, number, number] };
    scleralRednessIndex?: number;
    scleralYellownessIndex?: number;
    eyelidApertureMm: { left: number; right: number };
    blinkRate: number;
    perclos: number;
    // Phase 2.7 (valk-v3): window over which blinkRate is computed, excluding
    // non-processed frames (e.g. phase_2_close when eyes are intentionally shut).
    blinkRateActiveDurationMs?: number;
    // Phase 2.7: true only if active duration ≥ 20 s — below that, the blink
    // rate is a too-sparse measurement to compare to population norms.
    blinkRateReliable?: boolean;
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
    // Phase 0.3 (valk-v3): our phase_3 stimulus is a sinusoid, not the SFST
    // HGN protocol — calling these fields "nystagmus clues" is scientifically
    // inaccurate. Optional in wire format; legacy extractor still populates.
    nystagmusClues?: {
      onsetBeforeMaxDeviation: { left: boolean; right: boolean };
      distinctAtMaxDeviation: { left: boolean; right: boolean };
      smoothPursuitFailure: { left: boolean; right: boolean };
    };
    irisPositionTimeSeries: Array<{ timeMs: number; x: number; y: number }>;
  };
  hippus: { pupilUnrestIndex: number; dominantFrequencyHz: number };
  voiceAnalysis?: {
    mfccMean: number[];
    mfccStd: number[];
    spectralCentroidMean: number;
    spectralFlatnessMean: number;
    speechRateWordsPerMin: number;
    pauseCount: number;
    pauseTotalMs: number;
    meanPauseDurationMs: number;
    // Diagnostic / optional
    voicedDurationExclPeripheralSilenceMs?: number;
    rmsDistribution?: {
      min: number; p10: number; p25: number; p50: number; p75: number; p90: number; max: number;
      adaptiveThreshold: number;
    };
    zcrDistribution?: {
      p10: number; p50: number; p90: number; voicedP50: number; silentP50: number;
    };
    framesTotal?: number;
    framesVoiced?: number;
    framesRejectedLowEnergy?: number;
    framesRejectedZcrOutOfRange?: number;
    totalDurationMs: number;
    voicedDurationMs: number;
    signalToNoiseRatio: number;
  };
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
  personalBaseline?: PersonalBaseline;
  // Deep-dive diagnostics — optional. When present, lets the server-side
  // audit explain *why* a capture was low-quality (FPS bottleneck, delegate
  // fallback, etc). See docs/superpowers/plans/valk-v3/*.md.
  debug?: {
    mediapipe?: {
      sampleCount: number;
      medianDetectMs: number;
      p95DetectMs: number;
      maxDetectMs: number;
      medianDrawMs: number;
      p95DrawMs: number;
      medianInterFrameMs: number;
      p95InterFrameMs: number;
      activeDelegate: "GPU" | "CPU";
      downscaleApplied: boolean;
      sourceWidth: number;
      sourceHeight: number;
      downscaleWidth: number | null;
      downscaleHeight: number | null;
    };
    camera?: {
      nativeFps: number | null;
      trackSettings: {
        width?: number;
        height?: number;
        frameRate?: number;
        facingMode?: string;
        deviceId?: string;
      } | null;
    };
  };
}

export interface PersonalBaseline {
  pupilDiameterAvgMm: number;
  blinkRate: number;
  perclos: number;
  pursuitGain: number;
  saccadeCount: number;
  // Phase 0.3 (valk-v3): optional — sclera color is not calibrated on
  // consumer webcam and will be removed entirely in Phase 2.6.
  scleralRedness?: number;
  speechRateWpm?: number;
  pauseCount?: number;
  capturedAt: string;
  ageDays: number;
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
  };
  dataQuality: {
    overallQuality: "good" | "fair" | "poor";
    issues: string[];
  };
}
