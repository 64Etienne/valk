export interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
}

export interface EyeMetrics {
  pupilDiameterPx: number;
  pupilDiameterMm: number;
  irisDiameterPx: number;
  eyeAspectRatio: number;
  eyelidAperturePx: number;
  eyelidApertureMm: number;
  irisCenterNormalized: { x: number; y: number };
}

export interface BlinkEvent {
  timestampMs: number;
  durationMs: number;
}

export interface FrameFeatures {
  timestampMs: number;
  leftEye: EyeMetrics;
  rightEye: EyeMetrics;
  isBlinking: boolean;
  faceDetected: boolean;
}

export interface ScleraColor {
  left: [number, number, number]; // LAB
  right: [number, number, number];
  rednessIndex: number;
  yellownessIndex: number;
}

export interface PursuitFrame {
  timestampMs: number;
  targetX: number;
  targetY: number;
  irisX: number;
  irisY: number;
}

export interface ExtractionConfig {
  irisRefDiameterMm: number; // 11.7mm average
  earBlinkThreshold: number; // 0.2 typical
  perclosThreshold: number;  // 0.8 (80% closed)
}

export const DEFAULT_CONFIG: ExtractionConfig = {
  irisRefDiameterMm: 11.7,
  earBlinkThreshold: 0.2,
  perclosThreshold: 0.8,
};
