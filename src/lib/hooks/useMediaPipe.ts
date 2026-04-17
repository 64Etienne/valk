"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { initFaceLandmarker, closeFaceLandmarker } from "../eye-tracking/mediapipe-setup";
import { log, logError } from "@/lib/logger/logger";

export function useMediaPipe() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);

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
      try {
        return landmarkerRef.current.detectForVideo(video, timestampMs);
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
