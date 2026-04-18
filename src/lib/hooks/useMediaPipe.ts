"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  initFaceLandmarker,
  closeFaceLandmarker,
  getActiveDelegate,
} from "../eye-tracking/mediapipe-setup";
import { log, logError } from "@/lib/logger/logger";

/**
 * Observability payload exposed after a capture so we can diagnose why FPS is
 * low on a specific device, without asking the user to install a debugger.
 */
export interface MediaPipeTimings {
  sampleCount: number;
  medianDetectMs: number;
  p95DetectMs: number;
  maxDetectMs: number;
  medianDrawMs: number;
  p95DrawMs: number;
  medianInterFrameMs: number;
  p95InterFrameMs: number;
  activeDelegate: "GPU" | "CPU";
  downscaleApplied: boolean;
  sourceWidth: number;
  sourceHeight: number;
  downscaleWidth: number | null;
  downscaleHeight: number | null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

// Phase 2.1 (valk-v3) : downscale input frame avant MediaPipe.
// iPhone Safari en 720×1280 sur le pipeline MediaPipe WASM tombe à ~4 FPS en
// conditions réelles ; à 480×854 (downscale préservant le ratio) on vise 15+
// FPS, et à 360×640 on sécurise même sur iPhone 11 et antérieur.
// Ratio conservé pour ne pas déformer la détection iris. Downscale via un
// OffscreenCanvas réutilisé (allocation-free en steady state).
const DOWNSCALE_SHORT_EDGE = 480;

export function useMediaPipe() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  // Canvas réutilisé pour le downscale. SSR-safe : créé à la première detect().
  const canvasRef = useRef<OffscreenCanvas | HTMLCanvasElement | null>(null);
  const ctxRef = useRef<
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
  >(null);
  const canvasSizeRef = useRef<{ w: number; h: number } | null>(null);

  // Observability: per-frame timing samples.
  const detectMsSamples = useRef<number[]>([]);
  const drawMsSamples = useRef<number[]>([]);
  const interFrameMsSamples = useRef<number[]>([]);
  const lastDetectStartRef = useRef<number>(0);
  const lastSourceSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const lastDownscaleSizeRef = useRef<{ w: number; h: number } | null>(null);
  const downscaleAppliedRef = useRef(false);

  const load = useCallback(async () => {
    if (isLoaded || isLoading) {
      log("mediapipe.load.skipped", { isLoaded, isLoading });
      return;
    }
    log("mediapipe.load.start");
    const t0 = performance.now();
    setIsLoading(true);
    setError(null);

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 30_000)
      );
      const landmarker = await Promise.race([initFaceLandmarker(), timeout]);
      landmarkerRef.current = landmarker;
      setIsLoaded(true);
      log("mediapipe.load.success", {
        elapsedMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === "timeout";
      const msg = isTimeout
        ? "Le modèle prend trop de temps à charger. Essayez de recharger la page."
        : "Impossible de charger le modèle de détection faciale.";
      setError(msg);
      logError("mediapipe.load.failed", {
        isTimeout,
        elapsedMs: Math.round(performance.now() - t0),
        errName: (err as Error)?.name,
        errMessage: (err as Error)?.message,
        errStack: (err as Error)?.stack?.slice(0, 600),
      });
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isLoading]);

  const detect = useCallback(
    (video: HTMLVideoElement, timestampMs: number) => {
      if (!landmarkerRef.current) return null;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) return null;

      lastSourceSizeRef.current = { w: vw, h: vh };

      const now = performance.now();
      if (lastDetectStartRef.current > 0) {
        const dt = now - lastDetectStartRef.current;
        if (dt > 0 && dt < 2000) interFrameMsSamples.current.push(dt);
      }
      lastDetectStartRef.current = now;

      // Compute target size preserving aspect ratio, short edge = DOWNSCALE_SHORT_EDGE.
      const shortEdge = Math.min(vw, vh);
      if (shortEdge <= DOWNSCALE_SHORT_EDGE) {
        downscaleAppliedRef.current = false;
        lastDownscaleSizeRef.current = null;
        // Source already small enough → pass through, no downscale cost.
        try {
          const t0 = performance.now();
          const result = landmarkerRef.current.detectForVideo(video, timestampMs);
          detectMsSamples.current.push(performance.now() - t0);
          return result;
        } catch (err) {
          logError("mediapipe.detect.failed", {
            errMessage: (err as Error)?.message,
          });
          return null;
        }
      }

      const scale = DOWNSCALE_SHORT_EDGE / shortEdge;
      const tw = Math.round(vw * scale);
      const th = Math.round(vh * scale);

      // (Re)create canvas if not allocated or size changed (e.g. camera rotation).
      if (
        !canvasRef.current ||
        !canvasSizeRef.current ||
        canvasSizeRef.current.w !== tw ||
        canvasSizeRef.current.h !== th
      ) {
        try {
          if (typeof OffscreenCanvas !== "undefined") {
            canvasRef.current = new OffscreenCanvas(tw, th);
            ctxRef.current = (
              canvasRef.current as OffscreenCanvas
            ).getContext("2d") as OffscreenCanvasRenderingContext2D | null;
          } else {
            const hc = document.createElement("canvas");
            hc.width = tw;
            hc.height = th;
            canvasRef.current = hc;
            ctxRef.current = hc.getContext("2d");
          }
          canvasSizeRef.current = { w: tw, h: th };
        } catch (err) {
          logError("mediapipe.downscale.canvas.failed", {
            errMessage: (err as Error)?.message,
          });
          canvasRef.current = null;
          ctxRef.current = null;
        }
      }

      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) {
        // Fallback : pass the full-resolution video if canvas setup failed.
        downscaleAppliedRef.current = false;
        try {
          const t0 = performance.now();
          const result = landmarkerRef.current.detectForVideo(video, timestampMs);
          detectMsSamples.current.push(performance.now() - t0);
          return result;
        } catch (err) {
          logError("mediapipe.detect.failed", {
            errMessage: (err as Error)?.message,
          });
          return null;
        }
      }

      downscaleAppliedRef.current = true;
      lastDownscaleSizeRef.current = { w: tw, h: th };

      try {
        const tDraw = performance.now();
        ctx.drawImage(video, 0, 0, tw, th);
        drawMsSamples.current.push(performance.now() - tDraw);

        const tDetect = performance.now();
        // MediaPipe accepts either a video element or a canvas-like input.
        const result = landmarkerRef.current.detectForVideo(
          canvas as unknown as HTMLCanvasElement,
          timestampMs
        );
        detectMsSamples.current.push(performance.now() - tDetect);
        return result;
      } catch (err) {
        logError("mediapipe.detect.failed", {
          errMessage: (err as Error)?.message,
        });
        return null;
      }
    },
    []
  );

  const getTimings = useCallback((): MediaPipeTimings => {
    const d = [...detectMsSamples.current].sort((a, b) => a - b);
    const dr = [...drawMsSamples.current].sort((a, b) => a - b);
    const inter = [...interFrameMsSamples.current].sort((a, b) => a - b);
    return {
      sampleCount: d.length,
      medianDetectMs: Math.round(percentile(d, 0.5) * 10) / 10,
      p95DetectMs: Math.round(percentile(d, 0.95) * 10) / 10,
      maxDetectMs: Math.round((d[d.length - 1] ?? 0) * 10) / 10,
      medianDrawMs: Math.round(percentile(dr, 0.5) * 10) / 10,
      p95DrawMs: Math.round(percentile(dr, 0.95) * 10) / 10,
      medianInterFrameMs: Math.round(percentile(inter, 0.5) * 10) / 10,
      p95InterFrameMs: Math.round(percentile(inter, 0.95) * 10) / 10,
      activeDelegate: getActiveDelegate(),
      downscaleApplied: downscaleAppliedRef.current,
      sourceWidth: lastSourceSizeRef.current.w,
      sourceHeight: lastSourceSizeRef.current.h,
      downscaleWidth: lastDownscaleSizeRef.current?.w ?? null,
      downscaleHeight: lastDownscaleSizeRef.current?.h ?? null,
    };
  }, []);

  const resetTimings = useCallback(() => {
    detectMsSamples.current = [];
    drawMsSamples.current = [];
    interFrameMsSamples.current = [];
    lastDetectStartRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      closeFaceLandmarker();
    };
  }, []);

  return { isLoaded, isLoading, error, load, detect, getTimings, resetTimings };
}
