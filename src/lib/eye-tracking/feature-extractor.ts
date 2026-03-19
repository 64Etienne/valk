import { PupilAnalyzer } from "./pupil-analyzer";
import { ScleraAnalyzer } from "./sclera-analyzer";
import { BlinkDetector } from "./blink-detector";
import { NystagmusDetector } from "./nystagmus-detector";
import { LandmarkPoint, DEFAULT_CONFIG } from "./types";
import { LEFT_IRIS, RIGHT_IRIS, irisDiameterPx } from "./landmark-utils";
import type { AnalysisPayload, UserContext } from "@/types";

export class FeatureExtractor {
  private pupilAnalyzer = new PupilAnalyzer();
  private scleraAnalyzer = new ScleraAnalyzer();
  private blinkDetector = new BlinkDetector(DEFAULT_CONFIG.earBlinkThreshold);
  private nystagmusDetector = new NystagmusDetector();

  private startTime = 0;
  private frameCount = 0;
  private flashStartMs = 0;
  private flashEndMs = 0;
  private lastScleraResult: { leftLAB: [number, number, number]; rightLAB: [number, number, number]; rednessIndex: number; yellownessIndex: number } | null = null;
  private lastEyelidAperture: { left: number; right: number } = { left: 10, right: 10 };

  reset(): void {
    this.pupilAnalyzer.reset();
    this.blinkDetector.reset();
    this.nystagmusDetector.reset();
    this.startTime = 0;
    this.frameCount = 0;
    this.flashStartMs = 0;
    this.flashEndMs = 0;
    this.lastScleraResult = null;
    this.lastEyelidAperture = { left: 10, right: 10 };
  }

  setStartTime(timeMs: number): void {
    this.startTime = timeMs;
  }

  setFlashTiming(startMs: number, endMs: number): void {
    this.flashStartMs = startMs;
    this.flashEndMs = endMs;
  }

  // Process a frame during any phase
  processFrame(
    landmarks: LandmarkPoint[],
    timeMs: number,
    imageWidth: number,
    imageHeight: number,
    videoElement?: HTMLVideoElement
  ): { faceDetected: boolean; isBlinking: boolean } {
    this.frameCount++;

    // Pupil analysis (needs video for pixel-based pupil estimation)
    this.pupilAnalyzer.processFrame(landmarks, timeMs, imageWidth, imageHeight, videoElement);

    // Blink detection (with adaptive EAR threshold)
    const { isBlinking } = this.blinkDetector.processFrame(landmarks, timeMs);

    // Eyelid aperture (use avg iris as pixel reference)
    const avgIrisPx = (
      irisDiameterPx(landmarks, LEFT_IRIS, imageWidth, imageHeight) +
      irisDiameterPx(landmarks, RIGHT_IRIS, imageWidth, imageHeight)
    ) / 2;
    if (!isBlinking && avgIrisPx > 0) {
      this.lastEyelidAperture = this.blinkDetector.getEyelidAperture(
        landmarks, imageWidth, imageHeight, avgIrisPx
      );
    }

    // Sclera analysis (sample periodically, not every frame -- it's expensive)
    if (videoElement && this.frameCount % 10 === 0) {
      this.lastScleraResult = this.scleraAnalyzer.analyze(videoElement, landmarks, imageWidth, imageHeight);
    }

    return { faceDetected: true, isBlinking };
  }

  // Process pursuit frame (Phase 3)
  processPursuitFrame(
    landmarks: LandmarkPoint[],
    timeMs: number,
    targetX: number,
    targetY: number
  ): void {
    this.nystagmusDetector.processFrame(landmarks, timeMs, targetX, targetY);
  }

  // Build the final payload
  buildPayload(
    context: UserContext,
    cameraResolution: { width: number; height: number },
    captureDurationMs: number,
    voiceFeatures?: AnalysisPayload["voiceAnalysis"]
  ): AnalysisPayload {
    const baseline = this.pupilAnalyzer.getBaseline();
    const symmetry = this.pupilAnalyzer.getSymmetryRatio();
    const plr = this.pupilAnalyzer.computePLR(this.flashStartMs, this.flashEndMs);
    const hippus = this.pupilAnalyzer.computeHippus();

    const sclera = this.lastScleraResult ?? {
      leftLAB: [80, 5, 10] as [number, number, number],
      rightLAB: [80, 5, 10] as [number, number, number],
      rednessIndex: 5,
      yellownessIndex: 10,
    };

    const blinkRate = this.blinkDetector.getBlinkRate();
    const perclos = this.blinkDetector.getPERCLOS();

    const pursuitGain = this.nystagmusDetector.getSmoothPursuitGain();
    const saccadeCount = this.nystagmusDetector.getSaccadeCount();
    const nystagmusClues = this.nystagmusDetector.getNystagmusClues();

    return {
      baseline: {
        pupilDiameterMm: { left: baseline.left, right: baseline.right },
        pupilSymmetryRatio: symmetry,
        scleralColorLAB: { left: sclera.leftLAB, right: sclera.rightLAB },
        scleralRednessIndex: sclera.rednessIndex,
        scleralYellownessIndex: sclera.yellownessIndex,
        eyelidApertureMm: {
          left: Math.round(this.lastEyelidAperture.left * 10) / 10,
          right: Math.round(this.lastEyelidAperture.right * 10) / 10,
        },
        blinkRate: Math.round(blinkRate * 10) / 10,
        perclos: Math.round(perclos * 1000) / 1000,
      },
      lightReflex: {
        // Flag PLR as unreliable when values are physiologically impossible
        constrictionLatencyMs: plr.constrictionLatencyMs > 1000 ? 0 : plr.constrictionLatencyMs,
        constrictionAmplitudeMm: plr.constrictionAmplitudeMm < 0.1 ? 0 : plr.constrictionAmplitudeMm,
        constrictionVelocityMmPerSec: plr.constrictionVelocityMmPerSec < 0.1 ? 0 : plr.constrictionVelocityMmPerSec,
        redilationT50Ms: plr.redilationT50Ms < 50 || plr.redilationT50Ms > 5000 ? 0 : plr.redilationT50Ms,
        pupilDiameterTimeSeries: plr.timeSeries,
      },
      pursuit: {
        smoothPursuitGainRatio: pursuitGain,
        saccadeCount,
        nystagmusClues,
        irisPositionTimeSeries: this.nystagmusDetector.getTimeSeries(),
      },
      hippus: {
        pupilUnrestIndex: hippus.pupilUnrestIndex,
        dominantFrequencyHz: hippus.dominantFrequencyHz,
      },
      voiceAnalysis: voiceFeatures,
      context: {
        timeOfDay: context.timeOfDay,
        hoursSinceLastSleep: context.hoursSinceLastSleep,
        age: context.age,
        ambientLighting: context.ambientLighting,
        selfReportedSubstanceUse: context.selfReportedSubstanceUse,
      },
      meta: {
        captureTimestamp: new Date().toISOString(),
        captureDurationMs,
        frameCount: this.frameCount,
        averageFps: captureDurationMs > 0 ? Math.round((this.frameCount / captureDurationMs) * 1000) : 0,
        deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        cameraResolution,
      },
    };
  }
}
