"use client";

import { useRef, useState, useCallback } from "react";

export interface RecordingResult {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const startTimeRef = useRef(0);

  const start = useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 44100 });
      contextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(data));
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      startTimeRef.current = performance.now();
      setIsRecording(true);
    } catch {
      setError("Impossible d'accéder au microphone.");
    }
  }, []);

  const stop = useCallback((): RecordingResult | null => {
    const durationMs = performance.now() - startTimeRef.current;

    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    const sampleRate = contextRef.current?.sampleRate ?? 44100;
    contextRef.current?.close().catch(() => {});
    contextRef.current = null;
    streamRef.current = null;
    processorRef.current = null;
    setIsRecording(false);

    const chunks = chunksRef.current;
    if (chunks.length === 0) return null;

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const samples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }

    return { samples, sampleRate, durationMs };
  }, []);

  return { isRecording, error, start, stop };
}
