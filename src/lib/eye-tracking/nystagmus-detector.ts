import { LandmarkPoint, PursuitFrame } from "./types";
import { irisCenter } from "./landmark-utils";
import { mean, std } from "../utils/math";

// Eye corner landmarks for normalization
const RIGHT_EYE_INNER = 133;
const RIGHT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 362;
const LEFT_EYE_OUTER = 263;

export class NystagmusDetector {
  private frames: PursuitFrame[] = [];
  private normalizedIrisX: number[] = [];

  reset(): void {
    this.frames = [];
    this.normalizedIrisX = [];
  }

  processFrame(
    landmarks: LandmarkPoint[],
    timeMs: number,
    targetX: number,
    targetY: number
  ): void {
    const leftCenter = irisCenter(landmarks, 473);
    const rightCenter = irisCenter(landmarks, 468);
    const irisX = (leftCenter.x + rightCenter.x) / 2;
    const irisY = (leftCenter.y + rightCenter.y) / 2;

    this.frames.push({ timestampMs: timeMs, targetX, targetY, irisX, irisY });

    // Normalize iris X to eye socket width (for saccade detection)
    const rInner = landmarks[RIGHT_EYE_INNER];
    const rOuter = landmarks[RIGHT_EYE_OUTER];
    const lInner = landmarks[LEFT_EYE_INNER];
    const lOuter = landmarks[LEFT_EYE_OUTER];

    if (rInner && rOuter && lInner && lOuter) {
      const avgEyeWidth = (
        Math.abs(rOuter.x - rInner.x) + Math.abs(lOuter.x - lInner.x)
      ) / 2;
      const rMid = (rInner.x + rOuter.x) / 2;
      const lMid = (lInner.x + lOuter.x) / 2;
      const rNorm = avgEyeWidth > 0 ? (rightCenter.x - rMid) / avgEyeWidth : 0;
      const lNorm = avgEyeWidth > 0 ? (leftCenter.x - lMid) / avgEyeWidth : 0;
      this.normalizedIrisX.push((rNorm + lNorm) / 2);
    } else {
      this.normalizedIrisX.push(0);
    }
  }

  // Pursuit gain as Pearson correlation between target and iris movement.
  // 1.0 = perfect tracking, 0 = no tracking.
  getSmoothPursuitGain(): number {
    if (this.frames.length < 10) return 1.0;

    const targetSeries = this.frames.map((f) => f.targetX);
    const irisSeries = this.frames.map((f) => f.irisX);
    const n = targetSeries.length;

    const meanT = mean(targetSeries);
    const meanI = mean(irisSeries);

    let num = 0;
    let denT = 0;
    let denI = 0;
    for (let i = 0; i < n; i++) {
      const dt = targetSeries[i] - meanT;
      const di = irisSeries[i] - meanI;
      num += dt * di;
      denT += dt * dt;
      denI += di * di;
    }

    const den = Math.sqrt(denT * denI);
    if (den === 0) return 1.0;

    // Use absolute correlation: front camera mirrors the image, so iris
    // moves opposite to screen target. |correlation| captures tracking quality.
    const correlation = Math.abs(num / den);
    return Math.round(correlation * 100) / 100;
  }

  // Saccades: sudden jumps in eye-normalized iris position
  getSaccadeCount(): number {
    if (this.normalizedIrisX.length < 3) return 0;

    let saccades = 0;
    const velocityThreshold = 0.15;

    for (let i = 1; i < this.normalizedIrisX.length; i++) {
      const velocity = Math.abs(
        this.normalizedIrisX[i] - this.normalizedIrisX[i - 1]
      );
      if (velocity > velocityThreshold) {
        saccades++;
        while (
          i + 1 < this.normalizedIrisX.length &&
          Math.abs(this.normalizedIrisX[i + 1] - this.normalizedIrisX[i]) >
            velocityThreshold
        ) {
          i++;
        }
      }
    }

    return saccades;
  }

  getNystagmusClues(): {
    onsetBeforeMaxDeviation: { left: boolean; right: boolean };
    distinctAtMaxDeviation: { left: boolean; right: boolean };
    smoothPursuitFailure: { left: boolean; right: boolean };
  } {
    const leftFrames = this.frames.filter((f) => f.targetX < 0.3);
    const rightFrames = this.frames.filter((f) => f.targetX > 0.7);

    const leftOsc = this.detectOscillation(leftFrames);
    const rightOsc = this.detectOscillation(rightFrames);

    const leftMaxDev = this.frames.filter((f) => f.targetX < 0.15);
    const rightMaxDev = this.frames.filter((f) => f.targetX > 0.85);

    const leftMaxOsc = this.detectOscillation(leftMaxDev);
    const rightMaxOsc = this.detectOscillation(rightMaxDev);

    const gain = this.getSmoothPursuitGain();
    const pursuitFailure = gain < 0.5;

    return {
      onsetBeforeMaxDeviation: {
        left: leftOsc > 0.003,
        right: rightOsc > 0.003,
      },
      distinctAtMaxDeviation: {
        left: leftMaxOsc > 0.005,
        right: rightMaxOsc > 0.005,
      },
      smoothPursuitFailure: {
        left: pursuitFailure,
        right: pursuitFailure,
      },
    };
  }

  private detectOscillation(frames: PursuitFrame[]): number {
    if (frames.length < 5) return 0;
    const positions = frames.map((f) => f.irisX);
    const velocities = [];
    for (let i = 1; i < positions.length; i++) {
      velocities.push(positions[i] - positions[i - 1]);
    }
    return std(velocities);
  }

  getTimeSeries(): Array<{ timeMs: number; x: number; y: number }> {
    return this.frames.map((f) => ({
      timeMs: Math.round(f.timestampMs),
      x: Math.round(f.irisX * 1000) / 1000,
      y: Math.round(f.irisY * 1000) / 1000,
    }));
  }
}
