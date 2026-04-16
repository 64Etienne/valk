"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCamera } from "@/lib/hooks/useCamera";
import { useMediaPipe } from "@/lib/hooks/useMediaPipe";
import { useFeatureExtraction } from "@/lib/hooks/useFeatureExtraction";
import { useAnalysis } from "@/lib/hooks/useAnalysis";
import { CameraPermissionGate } from "./CameraPermissionGate";
import { CameraView } from "./CameraView";
import { ContextForm } from "./ContextForm";
import { CaptureInstructions } from "./CaptureInstructions";
import { CaptureCountdown } from "./CaptureCountdown";
import { PhaseIndicator } from "./PhaseIndicator";
import { FixationDot } from "./FixationDot";
import { LightFlash } from "./LightFlash";
import { PursuitDot } from "./PursuitDot";
import { ReadingTask } from "./ReadingTask";
import { AnalyzingOverlay } from "./AnalyzingOverlay";
import { Spinner } from "../ui/Spinner";
import type { CapturePhase, UserContext } from "@/types";
import type { VoiceFeatures } from "@/lib/audio/voice-analyzer";
import type { LandmarkPoint } from "@/lib/eye-tracking/types";
import { computeEAR, RIGHT_EAR_POINTS, LEFT_EAR_POINTS } from "@/lib/eye-tracking/landmark-utils";
import { unlockAudio } from "@/lib/audio/audio-context";
import { useWakeLock } from "@/lib/hooks/useWakeLock";
import { saveResult } from "@/lib/storage/session-result";

// Phase durations in ms — shortened for "leaving the bar" UX
const PHASE_DURATIONS: Partial<Record<CapturePhase, number>> = {
  phase_1: 5000,        // 8s → 5s: enough for baseline pupil + blink
  phase_2_flash: 3000,  // unchanged (advanced mode only)
  phase_2_dark: 5000,   // unchanged (advanced mode only)
  phase_3: 8000,        // 12s → 8s: 2 sinusoidal cycles sufficient for HGN
};

// Basic mode: skip PLR (unreliable on consumer cameras per user audit).
// Advanced mode (via ?advanced=1) adds phase_2_* for PLR attempt.
const BASIC_PHASE_ORDER: CapturePhase[] = ["phase_1", "phase_3"];
const ADVANCED_PHASE_ORDER: CapturePhase[] = [
  "phase_1",
  "phase_2_close",
  "phase_2_flash",
  "phase_2_dark",
  "phase_3",
];

export function GuidedCapture() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const includePLR = searchParams?.get("advanced") === "1";
  const PHASE_ORDER = useMemo(
    () => (includePLR ? ADVANCED_PHASE_ORDER : BASIC_PHASE_ORDER),
    [includePLR]
  );
  const CAPTURE_PHASES = useMemo(
    () => new Set<CapturePhase>(PHASE_ORDER),
    [PHASE_ORDER]
  );
  const camera = useCamera();
  const mediapipe = useMediaPipe();
  const extraction = useFeatureExtraction();
  const analysis = useAnalysis();

  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [context, setContext] = useState<UserContext | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceLost, setFaceLost] = useState(false);
  const [pursuitProgress, setPursuitProgress] = useState(0);
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const [eyesClosed, setEyesClosed] = useState(false);

  const phaseStartRef = useRef(0);
  const captureStartRef = useRef(0);
  const rafRef = useRef<number>(0);
  const eyesClosedSinceRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const phaseRef = useRef<CapturePhase>("idle");

  // Keep phaseRef in sync so RAF loop always reads current phase
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Start camera + load MediaPipe model
  const handleInit = useCallback(async () => {
    await Promise.all([camera.start(), mediapipe.load()]);
  }, [camera, mediapipe]);

  // Handle context form submission
  const handleContextSubmit = useCallback((ctx: UserContext) => {
    setContext(ctx);
    setPhase("instructions");
  }, []);

  const handleInstructionsReady = useCallback(() => {
    // Unlock audio context on user gesture (required for iOS silent mode)
    unlockAudio();
    setPhase("countdown");
  }, []);

  // Start capture phases after countdown finishes
  const handleCountdownComplete = useCallback(() => {
    extraction.reset();
    const now = performance.now();
    captureStartRef.current = now;
    phaseStartRef.current = now;
    extraction.setStartTime(now);
    setPhase("phase_1");
  }, [extraction]);

  // After eye capture phases, transition to reading task
  const finishCapture = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setPhase("phase_4_reading");
  }, []);

  // After reading task, build payload with voice features and analyze
  const handleReadingComplete = useCallback(async (voiceFeats: VoiceFeatures) => {
    setPhase("extracting");

    if (!context) return;

    const durationMs = performance.now() - captureStartRef.current;
    const payload = extraction.buildPayload(context, camera.resolution, durationMs, voiceFeats);

    setPhase("analyzing");

    const result = await analysis.analyze(payload);
    if (result) {
      saveResult(result, payload);
      router.push("/results");
    }
  }, [context, extraction, camera.resolution, analysis, router]);

  // Advance to the next phase, or finish if all phases are done
  const advancePhase = useCallback(() => {
    const currentIdx = PHASE_ORDER.indexOf(phaseRef.current);
    if (currentIdx < 0) return;

    if (currentIdx < PHASE_ORDER.length - 1) {
      const nextPhase = PHASE_ORDER[currentIdx + 1];
      phaseStartRef.current = performance.now();

      // Record flash onset/offset for PLR analysis
      if (nextPhase === "phase_2_flash") {
        const flashStart = performance.now();
        extraction.setFlashTiming(
          flashStart,
          flashStart + (PHASE_DURATIONS.phase_2_flash ?? 2000)
        );
      }

      setPhase(nextPhase);
    } else {
      // All capture phases complete
      finishCapture();
    }
  }, [extraction, finishCapture]);

  // ── Main RAF loop (countdown detection + capture phases) ────────────
  useEffect(() => {
    const isActivePhase = CAPTURE_PHASES.has(phase) || phase === "countdown";
    if (!isActivePhase) return;

    const loop = (timestamp: number) => {
      const currentPhase = phaseRef.current;

      // Bail if we left active phases between frames
      if (!CAPTURE_PHASES.has(currentPhase) && currentPhase !== "countdown")
        return;

      const video = camera.videoRef.current;

      // Wait for camera + model to be ready (readyState ≥ 2 = has frame data)
      if (!video || video.readyState < 2 || !mediapipe.isLoaded) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // Skip duplicate timestamps (some browsers fire twice)
      if (timestamp === lastTimestampRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      lastTimestampRef.current = timestamp;

      // ── Detect face landmarks ──
      const result = mediapipe.detect(video, timestamp);
      const landmarks = result?.faceLandmarks?.[0] as
        | LandmarkPoint[]
        | undefined;

      if (!landmarks || landmarks.length < 468) {
        setFaceDetected(false);
        if (currentPhase !== "countdown") setFaceLost(true);
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      setFaceDetected(true);
      setFaceLost(false);

      // During countdown, only face detection
      if (currentPhase === "countdown") {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // During phase_2_close: detect eye closure, no feature extraction
      if (currentPhase === "phase_2_close") {
        const rightEAR = computeEAR(landmarks, RIGHT_EAR_POINTS);
        const leftEAR = computeEAR(landmarks, LEFT_EAR_POINTS);
        const ear = (rightEAR + leftEAR) / 2;
        const closed = ear < 0.15; // well below blink threshold = eyes intentionally closed

        if (closed && !eyesClosedSinceRef.current) {
          eyesClosedSinceRef.current = timestamp;
          setEyesClosed(true);
        } else if (!closed) {
          eyesClosedSinceRef.current = 0;
          setEyesClosed(false);
        }

        // Countdown from eye closure (6s dark adaptation)
        if (eyesClosedSinceRef.current > 0) {
          const closedDuration = timestamp - eyesClosedSinceRef.current;
          setPhaseElapsed(closedDuration);
          if (closedDuration >= 6000) {
            eyesClosedSinceRef.current = 0;
            advancePhase();
            return;
          }
        }

        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;

      // ── Process frame features (pupil, blink, sclera, etc.) ──
      extraction.processFrame(landmarks, timestamp, w, h, video);

      // ── Phase 3: smooth pursuit tracking ──
      if (currentPhase === "phase_3") {
        const elapsed = timestamp - phaseStartRef.current;
        const phaseDuration = PHASE_DURATIONS.phase_3 ?? 5000;
        const progress = Math.min(1, elapsed / phaseDuration);
        setPursuitProgress(progress);

        // Sinusoidal target: 2.5 full cycles across the screen
        const targetX = 0.5 + 0.4 * Math.sin(progress * Math.PI * 6);
        extraction.processPursuitFrame(landmarks, timestamp, targetX, 0.5);
      }

      // ── Track elapsed for UI (e.g., LightFlash countdown) ──
      const elapsed = timestamp - phaseStartRef.current;
      setPhaseElapsed(elapsed);
      const duration =
        PHASE_DURATIONS[currentPhase as keyof typeof PHASE_DURATIONS];
      if (duration && elapsed >= duration) {
        advancePhase();
        return;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, camera.videoRef, mediapipe, extraction, advancePhase]);

  // ── Auto-transition: once camera + model ready, show context form ──
  useEffect(() => {
    if (camera.isActive && mediapipe.isLoaded && phase === "idle") {
      setPhase("context_form");
    }
  }, [camera.isActive, mediapipe.isLoaded, phase]);

  // ── Cleanup: stop camera on unmount ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      camera.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ──────────────────────────────────────────────────────────
  const isCapturing = CAPTURE_PHASES.has(phase);

  // Keep screen awake during capture + analysis, re-acquire on visibility return
  useWakeLock(
    isCapturing ||
      phase === "countdown" ||
      phase === "phase_4_reading" ||
      phase === "extracting" ||
      phase === "analyzing"
  );

  return (
    <div className="relative min-h-screen bg-zinc-950">
      <CameraPermissionGate
        isActive={camera.isActive}
        error={camera.error || mediapipe.error || null}
        onRequestPermission={handleInit}
      >
        {/* Camera feed -- always visible during capture */}
        <div className="relative w-full h-screen">
          <CameraView ref={camera.videoRef} className="w-full h-full" />

          {/* Phase progress indicator bar */}
          {isCapturing && (
            <div className="absolute top-0 left-0 right-0 z-20">
              <PhaseIndicator phase={phase} />
            </div>
          )}

          {/* Context form overlay */}
          {phase === "context_form" && (
            <div className="absolute inset-0 bg-zinc-950/90 z-20 flex items-center justify-center overflow-y-auto">
              <ContextForm onSubmit={handleContextSubmit} />
            </div>
          )}

          {/* Pre-capture instructions */}
          {phase === "instructions" && (
            <CaptureInstructions onReady={handleInstructionsReady} />
          )}

          {/* Countdown overlay (waits for face detection) */}
          {phase === "countdown" && (
            <CaptureCountdown
              onComplete={handleCountdownComplete}
              faceDetected={faceDetected}
            />
          )}

          {/* Phase 1 -- Fixation dot (baseline pupil + blink) */}
          {phase === "phase_1" && <FixationDot />}

          {/* Phase 2 -- Pupillary light reflex (eyes closed → flash → dark recovery) */}
          {(phase === "phase_2_close" ||
            phase === "phase_2_flash" ||
            phase === "phase_2_dark") && (
            <LightFlash
              subPhase={
                phase === "phase_2_close"
                  ? "close"
                  : phase === "phase_2_flash"
                    ? "flash"
                    : "dark"
              }
              eyesClosed={eyesClosed}
              elapsed={phaseElapsed}
            />
          )}

          {/* Phase 3 -- Smooth pursuit tracking */}
          {phase === "phase_3" && <PursuitDot progress={pursuitProgress} />}

          {/* Phase 4 -- Reading task (voice analysis) */}
          {phase === "phase_4_reading" && (
            <ReadingTask onComplete={handleReadingComplete} />
          )}

          {/* Face lost warning overlay */}
          {faceLost && isCapturing && (
            <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/70">
              <div className="text-center">
                <p className="text-amber-400 text-lg font-medium">
                  Visage non détecté
                </p>
                <p className="text-zinc-400 text-sm mt-1">
                  Repositionnez votre visage face à la caméra
                </p>
              </div>
            </div>
          )}

          {/* Extracting / Analyzing overlay */}
          {(phase === "extracting" || phase === "analyzing") && (
            <AnalyzingOverlay
              phase={phase as "extracting" | "analyzing"}
              error={analysis.error}
              onRetry={() => {
                if (context) {
                  const durationMs =
                    performance.now() - captureStartRef.current;
                  const payload = extraction.buildPayload(
                    context,
                    camera.resolution,
                    durationMs
                  );
                  analysis.retry(payload);
                }
              }}
            />
          )}

          {/* MediaPipe model loading indicator (bottom-left) */}
          {mediapipe.isLoading && (
            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 bg-zinc-900/80 rounded-lg px-3 py-2">
              <Spinner size="sm" />
              <span className="text-xs text-zinc-400">
                Chargement du modèle...
              </span>
            </div>
          )}
        </div>
      </CameraPermissionGate>
    </div>
  );
}
