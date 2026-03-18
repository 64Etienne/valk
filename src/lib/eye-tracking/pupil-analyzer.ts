import { LandmarkPoint } from "./types";
import {
  RIGHT_IRIS, LEFT_IRIS,
  irisDiameterPx, ipdPixels, estimatePupilRatio,
} from "./landmark-utils";
import { dominantFrequency } from "../utils/fft";
import { mean, std } from "../utils/math";

interface PupilSample {
  timeMs: number;
  leftDiameterMm: number;
  rightDiameterMm: number;
}

export class PupilAnalyzer {
  private samples: PupilSample[] = [];
  private ipdRefMm = 63; // average adult inter-pupillary distance
  private canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  private lastLeftRatio = 0.42;
  private lastRightRatio = 0.42;

  reset(): void {
    this.samples = [];
    this.lastLeftRatio = 0.42;
    this.lastRightRatio = 0.42;
  }

  private ensureCanvas(w: number, h: number) {
    if (this.ctx) return;
    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(w, h);
      this.ctx = this.canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    } else {
      this.canvas = document.createElement("canvas");
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx = this.canvas.getContext("2d");
    }
  }

  // Process a frame and return current pupil diameters
  processFrame(
    landmarks: LandmarkPoint[],
    timeMs: number,
    imageWidth: number,
    imageHeight: number,
    videoElement?: HTMLVideoElement
  ): { leftMm: number; rightMm: number } {
    // Scale factor: mm per pixel from inter-pupillary distance
    const ipd = ipdPixels(landmarks, imageWidth);
    const scale = ipd > 0 ? this.ipdRefMm / ipd : 0;

    // Iris diameters in pixels
    const rightIrisPx = irisDiameterPx(landmarks, RIGHT_IRIS, imageWidth, imageHeight);
    const leftIrisPx = irisDiameterPx(landmarks, LEFT_IRIS, imageWidth, imageHeight);

    // Pixel-based pupil ratio estimation (every 3rd frame for performance)
    if (videoElement && this.samples.length % 3 === 0) {
      this.ensureCanvas(imageWidth, imageHeight);
      if (this.ctx && this.canvas) {
        if (this.canvas instanceof HTMLCanvasElement) {
          this.canvas.width = imageWidth;
          this.canvas.height = imageHeight;
        } else {
          (this.canvas as OffscreenCanvas).width = imageWidth;
          (this.canvas as OffscreenCanvas).height = imageHeight;
        }
        this.ctx.drawImage(videoElement, 0, 0, imageWidth, imageHeight);

        this.lastRightRatio = estimatePupilRatio(
          this.ctx, landmarks, 468, 469, imageWidth, imageHeight
        );
        this.lastLeftRatio = estimatePupilRatio(
          this.ctx, landmarks, 473, 474, imageWidth, imageHeight
        );
      }
    }

    // Pupil diameter = iris diameter in pixels * pupil ratio * scale to mm
    let leftPupilMm: number;
    let rightPupilMm: number;

    if (scale > 0) {
      leftPupilMm = leftIrisPx * this.lastLeftRatio * scale;
      rightPupilMm = rightIrisPx * this.lastRightRatio * scale;
    } else {
      // Fallback: use iris reference (11.7mm) with pixel ratio
      leftPupilMm = 11.7 * this.lastLeftRatio;
      rightPupilMm = 11.7 * this.lastRightRatio;
    }

    // Clamp to physiological range (1.5-9mm)
    const clamp = (v: number) => Math.max(1.5, Math.min(9, v));
    leftPupilMm = clamp(leftPupilMm);
    rightPupilMm = clamp(rightPupilMm);

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

  private smooth(values: number[], window: number = 5): number[] {
    const result: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(values.length, i + Math.ceil(window / 2));
      result.push(mean(values.slice(start, end)));
    }
    return result;
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
    // Use Phase 1 baseline (first 30 samples) — pre-flash samples are from
    // eyes-closed period and are meaningless
    const baseline = this.getBaseline(30);
    const baselineDiam = (baseline.left + baseline.right) / 2;

    // Skip first 300ms of flash phase (eyes still opening after audio cue)
    const postFlash = this.samples.filter((s) => s.timeMs >= flashStartMs + 300);

    if (postFlash.length === 0 || baselineDiam === 0) {
      return {
        constrictionLatencyMs: 0,
        constrictionAmplitudeMm: 0,
        constrictionVelocityMmPerSec: 0,
        redilationT50Ms: 0,
        timeSeries: this.getTimeSeries(flashStartMs, flashEndMs + 5000),
      };
    }

    // Smooth diameter series to eliminate frame-to-frame noise
    const rawDiams = postFlash.map((s) => (s.leftDiameterMm + s.rightDiameterMm) / 2);
    const smoothed = this.smooth(rawDiams);
    const avgSeries = postFlash.map((s, i) => ({
      timeMs: s.timeMs - flashStartMs,
      diam: smoothed[i],
    }));

    let minDiam = baselineDiam;
    let minTime = 0;
    for (const s of avgSeries) {
      if (s.diam < minDiam) {
        minDiam = s.diam;
        minTime = s.timeMs;
      }
    }

    const threshold10 = baselineDiam - (baselineDiam - minDiam) * 0.1;
    const latencySample = avgSeries.find((s) => s.diam <= threshold10);
    const latency = latencySample ? Math.max(100, latencySample.timeMs) : 250;

    const amplitude = baselineDiam - minDiam;
    const velocity = minTime > 0 ? (amplitude / minTime) * 1000 : 0;

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

  computeHippus(sampleRateHz: number = 30): { pupilUnrestIndex: number; dominantFrequencyHz: number } {
    if (this.samples.length < 16) {
      return { pupilUnrestIndex: 0, dominantFrequencyHz: 0 };
    }

    const signal = this.samples.map((s) => (s.leftDiameterMm + s.rightDiameterMm) / 2);
    const m = mean(signal);
    const detrended = signal.map((v) => v - m);

    const { frequency } = dominantFrequency(detrended, sampleRateHz, 0.3, 0.8);

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
