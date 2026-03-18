"use client";

import { useRef, useCallback } from "react";
import { FeatureExtractor } from "../eye-tracking/feature-extractor";
import { LandmarkPoint } from "../eye-tracking/types";
import type { AnalysisPayload, UserContext } from "@/types";

export function useFeatureExtraction() {
  const extractorRef = useRef<FeatureExtractor>(new FeatureExtractor());

  const reset = useCallback(() => {
    extractorRef.current.reset();
  }, []);

  const setStartTime = useCallback((timeMs: number) => {
    extractorRef.current.setStartTime(timeMs);
  }, []);

  const setFlashTiming = useCallback((startMs: number, endMs: number) => {
    extractorRef.current.setFlashTiming(startMs, endMs);
  }, []);

  const processFrame = useCallback(
    (
      landmarks: LandmarkPoint[],
      timeMs: number,
      imageWidth: number,
      imageHeight: number,
      videoElement?: HTMLVideoElement
    ) => {
      return extractorRef.current.processFrame(landmarks, timeMs, imageWidth, imageHeight, videoElement);
    },
    []
  );

  const processPursuitFrame = useCallback(
    (landmarks: LandmarkPoint[], timeMs: number, targetX: number, targetY: number) => {
      extractorRef.current.processPursuitFrame(landmarks, timeMs, targetX, targetY);
    },
    []
  );

  const buildPayload = useCallback(
    (context: UserContext, resolution: { width: number; height: number }, durationMs: number): AnalysisPayload => {
      return extractorRef.current.buildPayload(context, resolution, durationMs);
    },
    []
  );

  return { reset, setStartTime, setFlashTiming, processFrame, processPursuitFrame, buildPayload };
}
