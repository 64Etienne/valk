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
import { PreflightGate } from "@/components/preflight/PreflightGate";
import { BaselineRequiredModal } from "./BaselineRequiredModal";
import {
  isDebugEnabled,
  createDebugRecorder,
  uploadDebugBundle,
} from "@/lib/debug/debug-mode";
import {
  loadBaseline,
  saveBaseline,
  condenseBaseline,
} from "@/lib/calibration/baseline";
import { DebugStatusOverlay } from "@/components/debug/DebugStatusOverlay";
import { log, logError } from "@/lib/logger/logger";

// Phase durations in ms
const PHASE_DURATIONS: Partial<Record<CapturePhase, number>> = {
  phase_1: 5000,        // baseline pupil + blink
  phase_2_flash: 3000,  // PLR flash
  phase_2_dark: 5000,   // PLR dark recovery
  phase_3: 8000,        // smooth pursuit, 2 sinusoidal cycles
};

// Full protocol by default (includes PLR dilatation test).
// Set ?basic=1 to skip PLR for quick "leaving the bar" captures.
const FULL_PHASE_ORDER: CapturePhase[] = [
  "phase_1",
  "phase_2_close",
  "phase_2_flash",
  "phase_2_dark",
  "phase_3",
];
const BASIC_PHASE_ORDER: CapturePhase[] = ["phase_1", "phase_3"];

interface GuidedCaptureProps {
  mode?: "analyze" | "baseline";
}

export function GuidedCapture({ mode = "analyze" }: GuidedCaptureProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skipPLR = searchParams?.get("basic") === "1";
  const PHASE_ORDER = useMemo(
    () => (skipPLR ? BASIC_PHASE_ORDER : FULL_PHASE_ORDER),
    [skipPLR]
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
  // Phase 1.3 (valk-v3): block analyze flow on mount if no baseline.
  // In baseline mode, always allow (user is calibrating). In analyze mode,
  // show modal until either the user opts to continue or navigates to /baseline.
  const [baselineGateDismissed, setBaselineGateDismissed] = useState(false);
  const [needsBaselineGate, setNeedsBaselineGate] = useState(false);
  useEffect(() => {
    if (mode !== "analyze") {
      setNeedsBaselineGate(false);
      return;
    }
    if (baselineGateDismissed) return;
    if (loadBaseline() === null) setNeedsBaselineGate(true);
  }, [mode, baselineGateDismissed]);
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const [phase3StartMs, setPhase3StartMs] = useState(0);
  const [eyesClosed, setEyesClosed] = useState(false);
  const [preflightPassed, setPreflightPassed] = useState(false);
  const debugRecorderRef = useRef<ReturnType<typeof createDebugRecorder> | null>(null);
  const sessionIdRef = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const phaseStartRef = useRef(0);
  const captureStartRef = useRef(0);
  const rafRef = useRef<number>(0);
  const eyesClosedSinceRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const phaseRef = useRef<CapturePhase>("idle");

  // Keep phaseRef in sync so RAF loop always reads current phase
  useEffect(() => {
    phaseRef.current = phase;
    log("capture.phase.changed", { phase });
  }, [phase]);

  // Start camera + load MediaPipe model
  const handleInit = useCallback(async () => {
    log("capture.handleInit.start", { mode });
    const t0 = performance.now();
    await Promise.all([
      camera.start().catch((e) => logError("capture.camera.start.rejected", { msg: String(e) })),
      mediapipe.load().catch((e) => logError("capture.mediapipe.load.rejected", { msg: String(e) })),
    ]);
    log("capture.handleInit.done", { elapsedMs: Math.round(performance.now() - t0) });
  }, [camera, mediapipe, mode]);

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

  // After reading task, save payload and navigate to /results where streaming begins.
  // Streaming is managed by /results for progressive UI (first-token ~2s vs ~90s blocking).
  const handleReadingComplete = useCallback(
    async (voiceFeats: VoiceFeatures) => {
      setPhase("extracting");
      if (!context) return;
      const durationMs = performance.now() - captureStartRef.current;
      const payload = extraction.buildPayload(
        context,
        camera.resolution,
        durationMs,
        voiceFeats
      );

      // Baseline mode: save as personal baseline and exit without running analysis
      if (mode === "baseline") {
        saveBaseline(payload);
        router.push("/baseline?saved=1");
        return;
      }

      // Analyze mode: attach condensed personal baseline if available
      const baselineRaw = loadBaseline();
      if (baselineRaw) {
        payload.personalBaseline = condenseBaseline(baselineRaw);
      }

      // Debug mode: stop recorder + upload bundle (fire-and-forget)
      if (isDebugEnabled() && debugRecorderRef.current) {
        const video = await debugRecorderRef.current.stop();
        uploadDebugBundle({
          sessionId: sessionIdRef.current,
          video,
          landmarks: null,
          payload,
          result: null,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
        }).then(({ sessionId, ok }) => {
          if (ok) console.info("[DEBUG] session uploaded:", sessionId);
        });
        try {
          sessionStorage.setItem("valk-debug-session-id", sessionIdRef.current);
        } catch {
          /* ignore */
        }
      }

      try {
        sessionStorage.setItem("valk-payload", JSON.stringify(payload));
        sessionStorage.removeItem("valk-result");
      } catch {
        /* iOS Private Browsing — fall through, /results will detect and redirect */
      }
      router.push("/results");
    },
    [context, extraction, camera.resolution, router, mode]
  );

  // Advance to the next phase, or finish if all phases are done
  const advancePhase = useCallback(() => {
    const currentIdx = PHASE_ORDER.indexOf(phaseRef.current);
    if (currentIdx < 0) return;

    if (currentIdx < PHASE_ORDER.length - 1) {
      const nextPhase = PHASE_ORDER[currentIdx + 1];
      const now = performance.now();
      phaseStartRef.current = now;

      // Record flash onset/offset for PLR analysis
      if (nextPhase === "phase_2_flash") {
        extraction.setFlashTiming(
          now,
          now + (PHASE_DURATIONS.phase_2_flash ?? 2000)
        );
      }

      // Mark phase_3 start so PursuitDot can run its own RAF animation
      if (nextPhase === "phase_3") {
        setPhase3StartMs(now);
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
      // UI motion is driven by PursuitDot's own RAF (60Hz) for smoothness.
      // Here we only compute target position for pursuit-gain measurement,
      // using the SAME formula as PursuitDot so measurement matches visual.
      if (currentPhase === "phase_3") {
        const elapsed = timestamp - phaseStartRef.current;
        const phaseDuration = PHASE_DURATIONS.phase_3 ?? 5000;
        const progress = Math.min(1, elapsed / phaseDuration);

        // Matches PursuitDot: 1.5 cycles, amplitude 0.4, centered at 0.5
        const targetX = 0.5 + 0.4 * Math.sin(progress * Math.PI * 2 * 1.5);
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

  // ── Auto-transition: once camera + model ready AND preflight passes, show context form ──
  useEffect(() => {
    if (camera.isActive && mediapipe.isLoaded && preflightPassed && phase === "idle") {
      setPhase("context_form");
    }
  }, [camera.isActive, mediapipe.isLoaded, preflightPassed, phase]);

  // ── Debug mode: start MediaRecorder when capture phase_1 begins ──
  useEffect(() => {
    if (!isDebugEnabled()) return;
    if (phase === "phase_1" && !debugRecorderRef.current) {
      const stream = camera.videoRef.current?.srcObject as MediaStream | null;
      if (stream) {
        debugRecorderRef.current = createDebugRecorder();
        debugRecorderRef.current.start(stream);
      }
    }
  }, [phase, camera.videoRef]);

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
      {/* Phase 1.3 (valk-v3): mandatory modal on analyze without baseline. */}
      {needsBaselineGate && (
        <BaselineRequiredModal
          onContinueWithoutBaseline={() => {
            setBaselineGateDismissed(true);
            setNeedsBaselineGate(false);
          }}
        />
      )}
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
              <PhaseIndicator
                phase={phase}
                groups={
                  skipPLR
                    ? ["phase_1", "phase_3", "phase_4"]
                    : ["phase_1", "phase_2", "phase_3", "phase_4"]
                }
              />
            </div>
          )}

          {/* Preflight gate: measures FPS + resolution before capture.
              Gated on camera.videoReady (not ref.current read at render time)
              to avoid a commit-phase race where videoRef is still null when
              this subtree first mounts. videoReady flips to true only after
              loadedmetadata fires AND videoWidth>0. */}
          {camera.isActive && camera.videoReady && mediapipe.isLoaded && !preflightPassed && phase === "idle" && (
            <PreflightGate
              videoEl={camera.videoRef.current}
              onReady={() => {
                log("preflight.onReady");
                setPreflightPassed(true);
              }}
            />
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
          {phase === "phase_3" && phase3StartMs > 0 && (
            <PursuitDot
              phaseStartMs={phase3StartMs}
              phaseDurationMs={PHASE_DURATIONS.phase_3 ?? 8000}
            />
          )}

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

          {/* MediaPipe model loading — prominent top banner. Previously this
              was a tiny bottom-left badge that users missed on mobile. */}
          {mediapipe.isLoading && phase === "idle" && (
            <div className="absolute top-4 left-4 right-4 z-30 flex items-center gap-3 bg-violet-950/95 border border-violet-500/50 rounded-xl px-4 py-3 shadow-lg">
              <Spinner size="sm" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-violet-100">
                  Chargement du modèle IA...
                </div>
                <div className="text-xs text-zinc-300">
                  5-30 secondes au premier lancement
                </div>
              </div>
            </div>
          )}

          {/* MediaPipe error — previously invisible once camera was active */}
          {mediapipe.error && phase === "idle" && (
            <div className="absolute top-4 left-4 right-4 z-30 bg-red-950/95 border border-red-500/60 rounded-xl px-4 py-3 shadow-lg">
              <div className="text-sm font-semibold text-red-200">
                Erreur de chargement du modèle
              </div>
              <div className="text-xs text-zinc-300 mt-1">{mediapipe.error}</div>
              <button
                onClick={() => mediapipe.load()}
                className="mt-2 text-xs text-violet-300 underline hover:text-violet-200"
              >
                Réessayer
              </button>
            </div>
          )}

          {/* Waiting for the first frame after camera permission granted */}
          {camera.isActive && !camera.videoReady && !mediapipe.error && phase === "idle" && (
            <div className="absolute top-4 left-4 right-4 z-30 flex items-center gap-3 bg-zinc-900/95 border border-zinc-700 rounded-xl px-4 py-3">
              <Spinner size="sm" />
              <span className="text-sm text-zinc-300">
                Initialisation de la caméra…
              </span>
            </div>
          )}
        </div>

        <DebugStatusOverlay
          state={{
            phase,
            "camera.isActive": camera.isActive,
            "camera.videoReady": camera.videoReady,
            "camera.error": camera.error,
            "camera.resolution": `${camera.resolution.width}x${camera.resolution.height}`,
            "video.videoWidth": camera.videoRef.current?.videoWidth ?? null,
            "video.videoHeight": camera.videoRef.current?.videoHeight ?? null,
            "video.readyState": camera.videoRef.current?.readyState ?? null,
            "video.srcObject": !!camera.videoRef.current?.srcObject,
            "mp.isLoading": mediapipe.isLoading,
            "mp.isLoaded": mediapipe.isLoaded,
            "mp.error": mediapipe.error,
            preflightPassed,
            mode,
            "wakeLock.supported": typeof navigator !== "undefined" && "wakeLock" in navigator,
            "speechSynthesis.supported": typeof speechSynthesis !== "undefined",
          }}
        />
      </CameraPermissionGate>
    </div>
  );
}
