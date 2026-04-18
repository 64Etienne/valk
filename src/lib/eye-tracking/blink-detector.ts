import { LandmarkPoint, BlinkEvent } from "./types";
import {
  RIGHT_EAR_POINTS, LEFT_EAR_POINTS,
  RIGHT_EYELID_TOP, RIGHT_EYELID_BOTTOM,
  LEFT_EYELID_TOP, LEFT_EYELID_BOTTOM,
  computeEAR, pixelsToMm,
} from "./landmark-utils";
import { mean } from "../utils/math";

const CALIBRATION_FRAMES = 15; // first N frames used to calibrate EAR threshold

export class BlinkDetector {
  private earThreshold = 0.2;
  private calibrated = false;
  private calibrationSamples: number[] = [];
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
    this.calibrated = false;
    this.calibrationSamples = [];
  }

  processFrame(
    landmarks: LandmarkPoint[],
    timeMs: number
  ): { ear: number; isBlinking: boolean } {
    const rightEAR = computeEAR(landmarks, RIGHT_EAR_POINTS);
    const leftEAR = computeEAR(landmarks, LEFT_EAR_POINTS);
    const ear = (rightEAR + leftEAR) / 2;

    // Adaptive calibration: use first N frames to determine open-eye baseline
    if (!this.calibrated) {
      this.calibrationSamples.push(ear);
      if (this.calibrationSamples.length >= CALIBRATION_FRAMES) {
        const openEAR = mean(this.calibrationSamples);
        // Threshold = 75% of open-eye EAR (standard approach)
        this.earThreshold = openEAR * 0.75;
        // Clamp to reasonable range
        this.earThreshold = Math.max(0.1, Math.min(0.3, this.earThreshold));
        this.calibrated = true;
      }
    }

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
        const duration = timeMs - this.blinkStartMs;
        if (duration > 50 && duration < 500) {
          this.blinks.push({ timestampMs: this.blinkStartMs, durationMs: duration });
        }
        this.inBlink = false;
      }
    }

    return { ear, isBlinking };
  }

  /**
   * Active duration in ms = sum of inter-frame gaps < 500 ms. Excludes long
   * blackouts like phase_2_close (eyes intentionally shut, frames skipped by
   * the extractor) that would otherwise inflate the blink-rate denominator.
   */
  getActiveDurationMs(): number {
    if (this.earHistory.length < 2) return 0;
    let activeMs = 0;
    const GAP_THRESHOLD = 500;
    for (let i = 1; i < this.earHistory.length; i++) {
      const dt = this.earHistory[i].timeMs - this.earHistory[i - 1].timeMs;
      if (dt > 0 && dt < GAP_THRESHOLD) activeMs += dt;
    }
    return activeMs;
  }

  getBlinkRate(): number {
    const activeMs = this.getActiveDurationMs();
    if (activeMs <= 0) return 0;
    return (this.blinks.length / activeMs) * 60000;
  }

  /**
   * Reliability flag for blink-rate / PERCLOS. A minimum of 20 s of active
   * processing is required for blink rate to be statistically meaningful
   * (normal rate 12-20/min → 4-7 blinks expected in 20 s). Below this, the
   * measurement is too sparse to compare to population norms.
   */
  getBlinkRateReliable(): boolean {
    return this.getActiveDurationMs() >= 20_000 && this.earHistory.length >= 300;
  }

  getPERCLOS(): number {
    if (this.totalFrames === 0) return 0;
    return this.closedFrames / this.totalFrames;
  }

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
      return { left: 10, right: 10 };
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

  isCurrentlyBlinking(): boolean {
    return this.inBlink;
  }
}
