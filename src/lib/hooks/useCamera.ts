"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { getCamera, stopCamera, getCameraResolution } from "../utils/camera";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  // videoReady = video element exists, has srcObject attached, and the first
  // frame metadata has arrived (videoWidth/Height populated). This is the
  // ONLY reliable "the camera is truly usable" signal to gate downstream
  // consumers (PreflightGate, MediaPipe detection, etc.). Gating via
  // ref.current reads during render is a race condition.
  const [videoReady, setVideoReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState({ width: 0, height: 0 });

  const start = useCallback(async () => {
    try {
      setError(null);
      setVideoReady(false);
      const stream = await getCamera();
      streamRef.current = stream;

      const res = getCameraResolution(stream);
      setResolution(res);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
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
      setVideoReady(false);
    }
  }, []);

  // Attach stream + wire readiness tracking. This is the canonical place where
  // we flip videoReady=true, because we must wait for the <video> to emit
  // loadedmetadata/loadeddata before videoWidth/Height are meaningful.
  useEffect(() => {
    const video = videoRef.current;
    if (!isActive || !video) return;

    // Attach stream if not already done
    if (streamRef.current && !video.srcObject) {
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }

    const markReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoReady(true);
        setResolution({ width: video.videoWidth, height: video.videoHeight });
      }
    };

    // If the video is ALREADY ready (e.g., after remount), fire immediately.
    if (video.readyState >= 2 && video.videoWidth > 0) {
      markReady();
      return;
    }

    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("loadeddata", markReady);
    return () => {
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("loadeddata", markReady);
    };
  }, [isActive]);

  const stop = useCallback(() => {
    stopCamera(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
    setVideoReady(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera(streamRef.current);
    };
  }, []);

  return { videoRef, isActive, videoReady, error, resolution, start, stop };
}
