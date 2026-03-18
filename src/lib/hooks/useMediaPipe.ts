"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { initFaceLandmarker, closeFaceLandmarker } from "../eye-tracking/mediapipe-setup";

export function useMediaPipe() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);

  const load = useCallback(async () => {
    if (isLoaded || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const landmarker = await initFaceLandmarker();
      landmarkerRef.current = landmarker;
      setIsLoaded(true);
    } catch (err) {
      setError("Impossible de charger le modèle de détection faciale.");
      console.error("MediaPipe init error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isLoading]);

  const detect = useCallback(
    (video: HTMLVideoElement, timestampMs: number) => {
      if (!landmarkerRef.current) return null;
      try {
        return landmarkerRef.current.detectForVideo(video, timestampMs);
      } catch {
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
