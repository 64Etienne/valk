"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { initFaceLandmarker, closeFaceLandmarker } from "../eye-tracking/mediapipe-setup";
import { log, logError } from "@/lib/logger/logger";

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

      // Compute target size preserving aspect ratio, short edge = DOWNSCALE_SHORT_EDGE.
      const shortEdge = Math.min(vw, vh);
      if (shortEdge <= DOWNSCALE_SHORT_EDGE) {
        // Source already small enough → pass through, no downscale cost.
        try {
          return landmarkerRef.current.detectForVideo(video, timestampMs);
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
        try {
          return landmarkerRef.current.detectForVideo(video, timestampMs);
        } catch (err) {
          logError("mediapipe.detect.failed", {
            errMessage: (err as Error)?.message,
          });
          return null;
        }
      }

      try {
        ctx.drawImage(video, 0, 0, tw, th);
        // MediaPipe accepts either a video element or a canvas-like input.
        return landmarkerRef.current.detectForVideo(
          canvas as unknown as HTMLCanvasElement,
          timestampMs
        );
      } catch (err) {
        logError("mediapipe.detect.failed", {
          errMessage: (err as Error)?.message,
        });
        return null;
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      closeFaceLandmarker();
    };
  }, []);

  return { isLoaded, isLoading, error, load, detect };
}
