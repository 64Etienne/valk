"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { useAudioRecorder } from "@/lib/hooks/useAudioRecorder";
import { analyzeVoice } from "@/lib/audio/voice-analyzer";
import type { VoiceFeatures } from "@/lib/audio/voice-analyzer";
import { pickReadingText } from "@/lib/analysis/reading-text";
import { vibrate } from "@/lib/audio/audio-context";

interface ReadingTaskProps {
  onComplete: (features: VoiceFeatures) => void;
}

const EMPTY_FEATURES: VoiceFeatures = {
  mfccMean: new Array(13).fill(0),
  mfccStd: new Array(13).fill(0),
  spectralCentroidMean: 0,
  spectralFlatnessMean: 0,
  speechRateWordsPerMin: 0,
  pauseCount: 0,
  pauseTotalMs: 0,
  meanPauseDurationMs: 0,
  totalDurationMs: 0,
  voicedDurationMs: 0,
  signalToNoiseRatio: 0,
};

export function ReadingTask({ onComplete }: ReadingTaskProps) {
  const recorder = useAudioRecorder();
  const [phase, setPhase] = useState<"intro" | "recording" | "processing">(
    "intro"
  );
  const [elapsed, setElapsed] = useState(0);
  // Pick reading text ONCE on mount (stable across re-renders, random per mount)
  const selection = useMemo(() => pickReadingText(), []);

  useEffect(() => {
    if (phase !== "recording") return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const handleStart = useCallback(async () => {
    await recorder.start();
    setPhase("recording");
    setElapsed(0);
  }, [recorder]);

  const handleStop = useCallback(() => {
    if (phase === "processing") return;
    // Full-screen overlay is swapped in the SAME React commit as the click —
    // users see immediate confirmation. The previous button-only state update
    // could be skipped on iPhone because analyzeVoice (MFCC+FFT on a 20s
    // buffer, 200-400ms block) started before React committed the paint.
    vibrate(40);
    setPhase("processing");

    // Double RAF: guarantees ≥ 1 full frame (commit + paint) happens before
    // the blocking analyzeVoice call. First RAF fires before paint of the
    // next frame; the inner RAF fires AFTER that frame's paint.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const result = recorder.stop();
        if (result) {
          const features = analyzeVoice(
            result.samples,
            result.sampleRate,
            selection.totalWords
          );
          onComplete(features);
        } else {
          onComplete(EMPTY_FEATURES);
        }
      });
    });
  }, [recorder, onComplete, selection, phase]);

  if (phase === "processing") {
    return (
      <div className="absolute inset-0 z-40 bg-zinc-950 flex flex-col items-center justify-center gap-6 p-6">
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
          <div className="relative">
            <Spinner size="lg" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <p className="text-zinc-100 text-lg font-semibold">
            Analyse vocale en cours…
          </p>
          <p className="text-zinc-400 text-sm">
            Extraction des paramètres acoustiques
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 bg-zinc-950 flex items-center justify-center overflow-y-auto">
      <div className="max-w-lg mx-auto p-6 space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-zinc-100 mb-1">
            Lecture à voix haute
          </h2>
          <p className="text-sm text-zinc-400">
            {phase === "intro"
              ? "Lisez le texte ci-dessous à voix haute, clairement et à votre rythme normal."
              : `Enregistrement en cours... ${elapsed}s`}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-4">
          <p className="text-zinc-200 text-base leading-relaxed">
            {selection.lines[0]}
          </p>
          <div className="pt-3 border-t border-zinc-800">
            <p className="text-zinc-500 text-xs mb-2">
              Puis, à un rythme normal :
            </p>
            <p className="text-zinc-200 text-base leading-relaxed">
              {selection.lines[1]}
            </p>
          </div>
        </div>

        {phase === "recording" && (
          <div className="flex items-center justify-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 text-sm font-medium">
              Enregistrement
            </span>
          </div>
        )}

        <div className="flex justify-center">
          {phase === "intro" ? (
            <Button onClick={handleStart} size="lg">
              <Mic className="w-4 h-4" />
              Commencer la lecture
            </Button>
          ) : (
            <Button
              onClick={handleStop}
              size="lg"
              variant="secondary"
              className="active:scale-95 transition-transform duration-75"
            >
              <MicOff className="w-4 h-4" />
              J&apos;ai terminé
            </Button>
          )}
        </div>

        {recorder.error && (
          <p className="text-red-400 text-sm text-center">{recorder.error}</p>
        )}
      </div>
    </div>
  );
}
