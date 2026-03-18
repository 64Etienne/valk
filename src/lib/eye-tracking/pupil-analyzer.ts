import { LandmarkPoint } from "./types";
import {
  RIGHT_IRIS, LEFT_IRIS,
  irisDiameterPx, pixelsToMm, landmarkDistance2D,
} from "./landmark-utils";
import { fft, dominantFrequency } from "../utils/fft";
import { mean, std } from "../utils/math";

interface PupilSample {
  timeMs: number;
  leftDiameterMm: number;
  rightDiameterMm: number;
}

export class PupilAnalyzer {
  private samples: PupilSample[] = [];
  private irisRefMm = 11.7;

  reset(): void {
    this.samples = [];
  }

  // Process a frame and return current pupil diameters
  procesFrame(
    landmarks: LandmarkPoint[],
    timeMs: number,
    imageWidth: number,
    imageHeight: number
  ): { leftMm: number; rightMm: number } {
    const rightIrisPx = irisDiameterPx(landmarks, RIGHT_IRIS, imageWidth, imageHeight);
    const leftIrisPx = irisDiameterPx(landmarks, LEFT_IRIS, imageWidth, imageHeight);

    // Pupil diameter approximated as ~40% of iris diameter (average)
    // More precisely: we measure the dark center area, but MediaPipe gives iris landmarks
    // We use the distance between iris center and nearest edge as radius estimate
    const rightCenter = landmarks[468];
    const leftCenter = landmarks[473];

    // Use iris diameter directly as the measurable quantity
    // The ratio vs reference gives us absolute size
    const leftMm = pixelsToMm(leftIrisPx, leftIrisPx, this.irisRefMm);
    const rightMm = pixelsToMm(rightIrisPx, rightIrisPx, this.irisRefMm);

    // For pupil, estimate ~42% of iris (Wyatt 1995)
    const leftPupilMm = leftMm * 0.42;
    const rightPupilMm = rightMm * 0.42;

    this.samples.push({
      timeMs,
      leftDiameterMm: leftPupilMm,
      rightDiameterMm: rightPupilMm,
    });

    return { leftMm: leftPupilMm, rightMm: rightPupilMm };
  }

  // Get baseline pupil diameter (average of first N samples)
  getBaseline(nSamples: number = 30): { left: number; right: number } {
    const slice = this.samples.slice(0, nSamples);
    if (slice.length === 0) return { left: 3.5, right: 3.5 };
    return {
      left: mean(slice.map((s) => s.leftDiameterMm)),
      right: mean(slice.map((s) => s.rightDiameterMm)),
    };
  }

  // Pupil symmetry ratio (closer to 1.0 = more symmetric)
  getSymmetryRatio(): number {
    const baseline = this.getBaseline();
    if (baseline.left === 0 || baseline.right === 0) return 1;
    const ratio = Math.min(baseline.left, baseline.right) / Math.max(baseline.left, baseline.right);
    return Math.round(ratio * 100) / 100;
  }

  // Compute PLR metrics from flash phase samples
  computePLR(
    flashStartMs: number,
    flashEndMs: number
  ): {
    constrictionLatencyMs: number;
    constrictionAmplitudeMm: number;
    constrictionVelocityMmPerSec: number;
    redilationT50Ms: number;
    timeSeries: Array<{ timeMs: number; diameterMm: number }>;
  } {
    // Get samples around flash
    const preFlash = this.samples.filter((s) => s.timeMs < flashStartMs && s.timeMs > flashStartMs - 2000);
    const postFlash = this.samples.filter((s) => s.timeMs >= flashStartMs);

    if (preFlash.length === 0 || postFlash.length === 0) {
      return {
        constrictionLatencyMs: 0,
        constrictionAmplitudeMm: 0,
        constrictionVelocityMmPerSec: 0,
        redilationT50Ms: 0,
        timeSeries: this.getTimeSeries(flashStartMs - 1000, flashEndMs + 3000),
      };
    }

    const baselineDiam = mean(preFlash.map((s) => (s.leftDiameterMm + s.rightDiameterMm) / 2));
    const avgSeries = postFlash.map((s) => ({
      timeMs: s.timeMs - flashStartMs,
      diam: (s.leftDiameterMm + s.rightDiameterMm) / 2,
    }));

    // Find minimum diameter (max constriction)
    let minDiam = baselineDiam;
    let minTime = 0;
    for (const s of avgSeries) {
      if (s.diam < minDiam) {
        minDiam = s.diam;
        minTime = s.timeMs;
      }
    }

    // Constriction latency: time to reach 10% of max constriction
    const threshold10 = baselineDiam - (baselineDiam - minDiam) * 0.1;
    const latencySample = avgSeries.find((s) => s.diam <= threshold10);
    const latency = latencySample ? latencySample.timeMs : 250;

    const amplitude = baselineDiam - minDiam;
    const velocity = minTime > 0 ? (amplitude / minTime) * 1000 : 0;

    // T50: time to recover 50% of constriction
    const halfRecovery = minDiam + amplitude * 0.5;
    const recoverySamples = avgSeries.filter((s) => s.timeMs > minTime);
    const t50Sample = recoverySamples.find((s) => s.diam >= halfRecovery);
    const t50 = t50Sample ? t50Sample.timeMs - minTime : 1000;

    return {
      constrictionLatencyMs: Math.round(latency),
      constrictionAmplitudeMm: Math.round(amplitude * 100) / 100,
      constrictionVelocityMmPerSec: Math.round(velocity * 100) / 100,
      redilationT50Ms: Math.round(t50),
      timeSeries: this.getTimeSeries(flashStartMs - 1000, flashEndMs + 3000),
    };
  }

  // Hippus analysis via FFT
  computeHippus(sampleRateHz: number = 30): { pupilUnrestIndex: number; dominantFrequencyHz: number } {
    if (this.samples.length < 16) {
      return { pupilUnrestIndex: 0, dominantFrequencyHz: 0 };
    }

    const signal = this.samples.map((s) => (s.leftDiameterMm + s.rightDiameterMm) / 2);
    const m = mean(signal);
    const detrended = signal.map((v) => v - m);

    const { frequency, magnitude } = dominantFrequency(detrended, sampleRateHz, 0.3, 0.8);

    // Pupil unrest index = std of diameter / mean diameter
    const pui = std(signal) / (m || 1);

    return {
      pupilUnrestIndex: Math.round(pui * 1000) / 1000,
      dominantFrequencyHz: Math.round(frequency * 100) / 100,
    };
  }

  private getTimeSeries(startMs: number, endMs: number): Array<{ timeMs: number; diameterMm: number }> {
    return this.samples
      .filter((s) => s.timeMs >= startMs && s.timeMs <= endMs)
      .map((s) => ({
        timeMs: Math.round(s.timeMs),
        diameterMm: Math.round(((s.leftDiameterMm + s.rightDiameterMm) / 2) * 100) / 100,
      }));
  }

  getSamples(): PupilSample[] {
    return this.samples;
  }
}
