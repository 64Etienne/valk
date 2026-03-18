import { LandmarkPoint, BlinkEvent } from "./types";
import {
  RIGHT_EAR_POINTS, LEFT_EAR_POINTS,
  RIGHT_EYELID_TOP, RIGHT_EYELID_BOTTOM,
  LEFT_EYELID_TOP, LEFT_EYELID_BOTTOM,
  computeEAR, landmarkDistance, pixelsToMm,
} from "./landmark-utils";
import { mean } from "../utils/math";

export class BlinkDetector {
  private earThreshold = 0.2;
  private earHistory: Array<{ timeMs: number; ear: number }> = [];
  private blinks: BlinkEvent[] = [];
  private inBlink = false;
  private blinkStartMs = 0;
  private closedFrames = 0;
  private totalFrames = 0;

  constructor(earThreshold: number = 0.2) {
    this.earThreshold = earThreshold;
  }

  reset(): void {
    this.earHistory = [];
    this.blinks = [];
    this.inBlink = false;
    this.blinkStartMs = 0;
    this.closedFrames = 0;
    this.totalFrames = 0;
  }

  // Process a frame and return current EAR + blink state
  processFrame(
    landmarks: LandmarkPoint[],
    timeMs: number
  ): { ear: number; isBlinking: boolean } {
    const rightEAR = computeEAR(landmarks, RIGHT_EAR_POINTS);
    const leftEAR = computeEAR(landmarks, LEFT_EAR_POINTS);
    const ear = (rightEAR + leftEAR) / 2;

    this.earHistory.push({ timeMs, ear });
    this.totalFrames++;

    const isBlinking = ear < this.earThreshold;

    if (isBlinking) {
      this.closedFrames++;
      if (!this.inBlink) {
        this.inBlink = true;
        this.blinkStartMs = timeMs;
      }
    } else {
      if (this.inBlink) {
        // Blink ended
        const duration = timeMs - this.blinkStartMs;
        if (duration > 50 && duration < 500) {
          // Valid blink (50-500ms)
          this.blinks.push({ timestampMs: this.blinkStartMs, durationMs: duration });
        }
        this.inBlink = false;
      }
    }

    return { ear, isBlinking };
  }

  // Blinks per minute
  getBlinkRate(): number {
    if (this.earHistory.length < 2) return 0;
    const durationMs = this.earHistory[this.earHistory.length - 1].timeMs - this.earHistory[0].timeMs;
    if (durationMs <= 0) return 0;
    return (this.blinks.length / durationMs) * 60000;
  }

  // PERCLOS: percentage of time eyes are >80% closed
  // Standard: proportion of time EAR is below threshold
  getPERCLOS(): number {
    if (this.totalFrames === 0) return 0;
    return this.closedFrames / this.totalFrames;
  }

  // Ptosis detection: measure eyelid aperture
  getEyelidAperture(
    landmarks: LandmarkPoint[],
    imageWidth: number,
    imageHeight: number,
    irisDiameterPx: number
  ): { left: number; right: number } {
    const rightTop = landmarks[RIGHT_EYELID_TOP];
    const rightBottom = landmarks[RIGHT_EYELID_BOTTOM];
    const leftTop = landmarks[LEFT_EYELID_TOP];
    const leftBottom = landmarks[LEFT_EYELID_BOTTOM];

    if (!rightTop || !rightBottom || !leftTop || !leftBottom) {
      return { left: 10, right: 10 }; // default mm
    }

    const rightAperturePx = Math.abs(rightTop.y - rightBottom.y) * imageHeight;
    const leftAperturePx = Math.abs(leftTop.y - leftBottom.y) * imageHeight;

    return {
      left: pixelsToMm(leftAperturePx, irisDiameterPx),
      right: pixelsToMm(rightAperturePx, irisDiameterPx),
    };
  }

  getBlinks(): BlinkEvent[] {
    return this.blinks;
  }

  // Check if currently blinking (useful for invalidating flash phase)
  isCurrentlyBlinking(): boolean {
    return this.inBlink;
  }
}
