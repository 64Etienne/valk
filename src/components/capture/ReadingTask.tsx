"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "../ui/Button";
import { useAudioRecorder } from "@/lib/hooks/useAudioRecorder";
import { analyzeVoice } from "@/lib/audio/voice-analyzer";
import type { VoiceFeatures } from "@/lib/audio/voice-analyzer";
import { pickReadingText } from "@/lib/analysis/reading-text";

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
    const result = recorder.stop();
    setPhase("processing");

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
  }, [recorder, onComplete, selection]);

  if (phase === "processing") {
    return (
      <div className="absolute inset-0 z-30 bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-400">Analyse vocale...</p>
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
            <p className="text-zinc-500 text-xs mb-2">Puis, à un rythme normal :</p>
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
            <Button onClick={handleStop} size="lg" variant="secondary">
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
