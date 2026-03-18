import { LandmarkPoint, PursuitFrame } from "./types";
import { LEFT_IRIS, RIGHT_IRIS, irisCenter } from "./landmark-utils";
import { mean, std } from "../utils/math";

export class NystagmusDetector {
  private frames: PursuitFrame[] = [];

  reset(): void {
    this.frames = [];
  }

  // Record iris position relative to pursuit target
  processFrame(
    landmarks: LandmarkPoint[],
    timeMs: number,
    targetX: number,
    targetY: number
  ): void {
    const leftCenter = irisCenter(landmarks, 473); // LEFT_IRIS center
    const rightCenter = irisCenter(landmarks, 468); // RIGHT_IRIS center

    // Average of both eyes
    const irisX = (leftCenter.x + rightCenter.x) / 2;
    const irisY = (leftCenter.y + rightCenter.y) / 2;

    this.frames.push({ timestampMs: timeMs, targetX, targetY, irisX, irisY });
  }

  // Compute smooth pursuit gain ratio
  // Gain = (eye velocity / target velocity) — 1.0 = perfect tracking
  getSmoothPursuitGain(): number {
    if (this.frames.length < 10) return 1.0;

    let totalTargetVel = 0;
    let totalEyeVel = 0;

    for (let i = 1; i < this.frames.length; i++) {
      const dt = this.frames[i].timestampMs - this.frames[i - 1].timestampMs;
      if (dt === 0) continue;

      const targetVel = Math.abs(this.frames[i].targetX - this.frames[i - 1].targetX) / dt;
      const eyeVel = Math.abs(this.frames[i].irisX - this.frames[i - 1].irisX) / dt;

      totalTargetVel += targetVel;
      totalEyeVel += eyeVel;
    }

    if (totalTargetVel === 0) return 1.0;
    return Math.round((totalEyeVel / totalTargetVel) * 100) / 100;
  }

  // Count saccades (sudden jumps in eye position)
  // A saccade is detected when eye velocity exceeds a threshold
  getSaccadeCount(): number {
    if (this.frames.length < 3) return 0;

    let saccades = 0;
    const velocityThreshold = 0.003; // normalized units per ms

    for (let i = 1; i < this.frames.length; i++) {
      const dt = this.frames[i].timestampMs - this.frames[i - 1].timestampMs;
      if (dt === 0) continue;

      const velocity = Math.abs(this.frames[i].irisX - this.frames[i - 1].irisX) / dt;
      if (velocity > velocityThreshold) {
        saccades++;
        // Skip adjacent frames to avoid counting one saccade multiple times
        while (i + 1 < this.frames.length) {
          const nextDt = this.frames[i + 1].timestampMs - this.frames[i].timestampMs;
          if (nextDt === 0) { i++; continue; }
          const nextVel = Math.abs(this.frames[i + 1].irisX - this.frames[i].irisX) / nextDt;
          if (nextVel > velocityThreshold) { i++; } else { break; }
        }
      }
    }

    return saccades;
  }

  // HGN clues at 3 key positions:
  // - Onset before max deviation (45°)
  // - Distinct at max deviation (45°)
  // - Smooth pursuit failure
  getNystagmusClues(): {
    onsetBeforeMaxDeviation: { left: boolean; right: boolean };
    distinctAtMaxDeviation: { left: boolean; right: boolean };
    smoothPursuitFailure: { left: boolean; right: boolean };
  } {
    // Split frames into left-looking (target < 0.3) and right-looking (target > 0.7)
    const leftFrames = this.frames.filter((f) => f.targetX < 0.3);
    const rightFrames = this.frames.filter((f) => f.targetX > 0.7);

    // Detect oscillation (nystagmus) by checking variance of eye position deviation from target
    const leftOscillation = this.detectOscillation(leftFrames);
    const rightOscillation = this.detectOscillation(rightFrames);

    // Check at max deviation positions
    const leftMaxDev = this.frames.filter((f) => f.targetX < 0.15);
    const rightMaxDev = this.frames.filter((f) => f.targetX > 0.85);

    const leftMaxOsc = this.detectOscillation(leftMaxDev);
    const rightMaxOsc = this.detectOscillation(rightMaxDev);

    // Smooth pursuit failure: gain significantly below 1.0
    const gain = this.getSmoothPursuitGain();
    const pursuitFailure = gain < 0.7;

    return {
      onsetBeforeMaxDeviation: {
        left: leftOscillation > 0.005,
        right: rightOscillation > 0.005,
      },
      distinctAtMaxDeviation: {
        left: leftMaxOsc > 0.008,
        right: rightMaxOsc > 0.008,
      },
      smoothPursuitFailure: {
        left: pursuitFailure,
        right: pursuitFailure,
      },
    };
  }

  // Detect oscillation by measuring std of (eye - target) over time
  private detectOscillation(frames: PursuitFrame[]): number {
    if (frames.length < 5) return 0;
    const deviations = frames.map((f) => f.irisX - f.targetX);
    return std(deviations);
  }

  // Get position time series for payload
  getTimeSeries(): Array<{ timeMs: number; x: number; y: number }> {
    return this.frames.map((f) => ({
      timeMs: Math.round(f.timestampMs),
      x: Math.round(f.irisX * 1000) / 1000,
      y: Math.round(f.irisY * 1000) / 1000,
    }));
  }
}
