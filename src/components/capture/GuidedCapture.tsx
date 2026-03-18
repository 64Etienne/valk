"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { Spinner } from "../ui/Spinner";
import type { CapturePhase, UserContext } from "@/types";
import type { LandmarkPoint } from "@/lib/eye-tracking/types";

// Phase durations in ms
const PHASE_DURATIONS: Partial<Record<CapturePhase, number>> = {
  phase_1: 3000,
  phase_2_warn: 1000,
  phase_2_flash: 2000,
  phase_2_dark: 2000,
  phase_3: 5000,
};

const PHASE_ORDER: CapturePhase[] = [
  "phase_1",
  "phase_2_warn",
  "phase_2_flash",
  "phase_2_dark",
  "phase_3",
];

const CAPTURE_PHASES = new Set<CapturePhase>(PHASE_ORDER);

export function GuidedCapture() {
  const router = useRouter();
  const camera = useCamera();
  const mediapipe = useMediaPipe();
  const extraction = useFeatureExtraction();
  const analysis = useAnalysis();

  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [context, setContext] = useState<UserContext | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceLost, setFaceLost] = useState(false);
  const [pursuitProgress, setPursuitProgress] = useState(0);

  const phaseStartRef = useRef(0);
  const captureStartRef = useRef(0);
  const rafRef = useRef<number>(0);
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

  // Finish capture: extract payload, send to analysis API, navigate on success
  const finishCapture = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    setPhase("extracting");

    if (!context) return;

    const durationMs = performance.now() - captureStartRef.current;
    const payload = extraction.buildPayload(context, camera.resolution, durationMs);

    setPhase("analyzing");

    const result = await analysis.analyze(payload);
    if (result) {
      sessionStorage.setItem("valk-result", JSON.stringify(result));
      sessionStorage.setItem("valk-payload", JSON.stringify(payload));
      router.push("/results");
    }
    // On failure, stay on "analyzing" phase -- the error is shown via analysis.error
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

      // During countdown, face detection is all we need
      if (currentPhase === "countdown") {
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
        const targetX = 0.5 + 0.4 * Math.sin(progress * Math.PI * 5);
        extraction.processPursuitFrame(landmarks, timestamp, targetX, 0.5);
      }

      // ── Check phase duration → advance ──
      const elapsed = timestamp - phaseStartRef.current;
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

          {/* Phase 2 -- Pupillary light reflex (warn → flash → dark recovery) */}
          {(phase === "phase_2_warn" ||
            phase === "phase_2_flash" ||
            phase === "phase_2_dark") && (
            <LightFlash
              subPhase={
                phase === "phase_2_warn"
                  ? "warn"
                  : phase === "phase_2_flash"
                    ? "flash"
                    : "dark"
              }
            />
          )}

          {/* Phase 3 -- Smooth pursuit tracking */}
          {phase === "phase_3" && <PursuitDot progress={pursuitProgress} />}

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
            <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-zinc-950/95">
              <Spinner size="lg" />
              <p className="text-zinc-300 mt-4 text-lg">
                {phase === "extracting"
                  ? "Extraction des données..."
                  : "Analyse en cours..."}
              </p>
              {analysis.error && (
                <div className="mt-4 text-center">
                  <p className="text-red-400 text-sm">{analysis.error}</p>
                  <button
                    onClick={() => {
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
                    className="mt-2 text-violet-400 text-sm underline hover:text-violet-300 transition-colors"
                  >
                    Réessayer
                  </button>
                </div>
              )}
            </div>
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
