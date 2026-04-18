"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { getCamera, stopCamera, getCameraResolution } from "../utils/camera";
import { log, logError, logWarn } from "@/lib/logger/logger";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState({ width: 0, height: 0 });

  const start = useCallback(async () => {
    try {
      log("camera.start.called");
      setError(null);
      setVideoReady(false);
      const stream = await getCamera();
      streamRef.current = stream;
      const res = getCameraResolution(stream);
      setResolution(res);
      log("camera.stream.acquired", {
        resolution: res,
        tracks: stream.getTracks().map((t) => ({
          kind: t.kind,
          label: t.label,
          readyState: t.readyState,
          enabled: t.enabled,
          muted: t.muted,
        })),
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
          log("camera.video.play.success.inline");
        } catch (playErr) {
          logWarn("camera.video.play.failed.inline", {
            name: (playErr as Error)?.name,
            message: (playErr as Error)?.message,
          });
        }
      } else {
        log("camera.videoRef.null.at.start", {
          note: "will attach via useEffect post-mount",
        });
      }

      setIsActive(true);
      log("camera.isActive.set", { value: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "?";
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Accès à la caméra refusé. Veuillez autoriser l'accès dans les paramètres de votre navigateur."
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "Aucune caméra détectée sur cet appareil."
            : "Impossible d'accéder à la caméra.";
      logError("camera.start.failed", {
        errName: name,
        errMessage: (err as Error)?.message,
      });
      setError(message);
      setIsActive(false);
      setVideoReady(false);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!isActive || !video) return;

    if (streamRef.current && !video.srcObject) {
      video.srcObject = streamRef.current;
      video.play().catch((playErr) => {
        logWarn("camera.video.play.failed.effect", {
          name: (playErr as Error)?.name,
          message: (playErr as Error)?.message,
        });
      });
      log("camera.srcObject.attached.effect");
    }

    const markReady = (evt?: Event) => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoReady(true);
        setResolution({ width: video.videoWidth, height: video.videoHeight });
        log("camera.videoReady", {
          trigger: evt?.type ?? "initial",
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
        });
      } else {
        logWarn("camera.markReady.skipped", {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
          eventType: evt?.type,
        });
      }
    };

    if (video.readyState >= 2 && video.videoWidth > 0) {
      markReady();
      return;
    }

    log("camera.videoReady.waiting", {
      readyState: video.readyState,
      videoWidth: video.videoWidth,
    });
    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("loadeddata", markReady);
    return () => {
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("loadeddata", markReady);
    };
  }, [isActive]);

  const stop = useCallback(() => {
    log("camera.stop.called");
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

  // Native camera FPS via requestVideoFrameCallback. Independent from the
  // MediaPipe detect loop; tells us whether the camera itself is delivering
  // 30 fps frames or if iOS is throttling us to 4 fps (low-power mode,
  // thermal throttling, etc).
  const frameCountRef = useRef(0);
  const firstFrameTsRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isActive || !videoReady) return;
    const video = videoRef.current;
    if (!video) return;
    type VideoWithRVFC = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number) => void) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    };
    const vel = video as VideoWithRVFC;
    if (!vel.requestVideoFrameCallback) {
      log("camera.rvfc.unsupported");
      return;
    }
    let cancelled = false;
    let handle = 0;
    const tick = (now: number) => {
      if (cancelled) return;
      if (firstFrameTsRef.current === null) firstFrameTsRef.current = now;
      lastFrameTsRef.current = now;
      frameCountRef.current++;
      handle = vel.requestVideoFrameCallback!(tick);
    };
    handle = vel.requestVideoFrameCallback!(tick);
    return () => {
      cancelled = true;
      if (vel.cancelVideoFrameCallback && handle) {
        vel.cancelVideoFrameCallback(handle);
      }
    };
  }, [isActive, videoReady]);

  const getNativeFps = useCallback((): number => {
    const first = firstFrameTsRef.current;
    const last = lastFrameTsRef.current;
    const count = frameCountRef.current;
    if (first === null || last === null || count < 2 || last === first) return 0;
    const durationMs = last - first;
    return Math.round((count / durationMs) * 1000 * 10) / 10;
  }, []);

  const getTrackSettings = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return null;
    try {
      const s = track.getSettings();
      return {
        width: s.width,
        height: s.height,
        frameRate: s.frameRate,
        facingMode: s.facingMode,
        deviceId: typeof s.deviceId === "string" ? s.deviceId.slice(0, 8) : undefined,
      };
    } catch {
      return null;
    }
  }, []);

  return {
    videoRef,
    isActive,
    videoReady,
    error,
    resolution,
    start,
    stop,
    getNativeFps,
    getTrackSettings,
  };
}
