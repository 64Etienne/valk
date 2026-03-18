"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { getCamera, stopCamera, getCameraResolution } from "../utils/camera";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState({ width: 0, height: 0 });

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await getCamera();
      streamRef.current = stream;

      const res = getCameraResolution(stream);
      setResolution(res);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsActive(true);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Accès à la caméra refusé. Veuillez autoriser l'accès dans les paramètres de votre navigateur."
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "Aucune caméra détectée sur cet appareil."
            : "Impossible d'accéder à la caméra.";
      setError(message);
      setIsActive(false);
    }
  }, []);

  // CameraView mounts only after isActive=true (behind CameraPermissionGate),
  // so videoRef is null during start(). Attach stream once the element appears.
  useEffect(() => {
    const video = videoRef.current;
    if (isActive && video && streamRef.current && !video.srcObject) {
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }
  }, [isActive]);

  const stop = useCallback(() => {
    stopCamera(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera(streamRef.current);
    };
  }, []);

  return { videoRef, isActive, error, resolution, start, stop };
}
