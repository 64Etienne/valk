# Voice Analysis — Reading Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a voice analysis phase where the user reads French tongue twisters aloud. Record audio via phone mic, extract spectral features (MFCCs, spectral centroid/flatness, speech rate, pauses), and send to Claude alongside eye metrics for combined analysis. Based on Suffoletto et al. 2023 (Stanford, 98% accuracy with SVM on smartphone audio).

**Architecture:** New phase `phase_4_reading` after pursuit. A `ReadingTask` component displays tongue twisters and records audio via `getUserMedia`. A `VoiceAnalyzer` class extracts MFCCs and spectral features from the recording using Web Audio API (FFT + Mel filterbank + DCT). Features are added to the analysis payload. No server-side ML — Claude interprets features against published reference thresholds.

**Tech Stack:** Web Audio API (AudioContext, AnalyserNode, getUserMedia), TypeScript, Hamming window + FFT + Mel filterbank + DCT for MFCCs

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/audio/voice-analyzer.ts` | Create | MFCC extraction, spectral features, pause detection |
| `src/lib/audio/mfcc.ts` | Create | Mel filterbank + DCT math (pure functions) |
| `src/lib/hooks/useAudioRecorder.ts` | Create | getUserMedia audio, start/stop recording, get PCM buffer |
| `src/components/capture/ReadingTask.tsx` | Create | Display tongue twisters, recording indicator, timer |
| `src/types/index.ts` | Modify | Add `phase_4_reading` + `VoiceFeatures` type |
| `src/components/capture/GuidedCapture.tsx` | Modify | Add reading phase after pursuit |
| `src/components/capture/PhaseIndicator.tsx` | Modify | Add reading phase label |
| `src/lib/eye-tracking/feature-extractor.ts` | Modify | Include voice features in payload |
| `src/lib/analysis/claude-prompt.ts` | Modify | Add voice analysis section with Suffoletto references |
| `src/app/api/analyze/route.ts` | Modify | Add voice features to Zod schema |

---

## Task 1: MFCC math utilities

Pure math functions for Mel-frequency cepstral coefficient extraction. No DOM, no audio APIs — just number crunching.

**Files:**
- Create: `src/lib/audio/mfcc.ts`

- [ ] **Step 1: Create MFCC extraction module**

```typescript
// src/lib/audio/mfcc.ts

// Hertz to Mel scale
function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

// Mel to Hertz
function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

// Generate Mel filterbank (numFilters triangular filters)
export function melFilterbank(
  fftSize: number,
  sampleRate: number,
  numFilters: number = 26
): Float64Array[] {
  const lowMel = hzToMel(300); // skip below 300Hz (noise)
  const highMel = hzToMel(sampleRate / 2);
  const melPoints = new Float64Array(numFilters + 2);

  for (let i = 0; i < numFilters + 2; i++) {
    melPoints[i] = lowMel + (i * (highMel - lowMel)) / (numFilters + 1);
  }

  const binPoints = melPoints.map(
    (mel) => Math.floor(((fftSize + 1) * melToHz(mel)) / sampleRate)
  );

  const filters: Float64Array[] = [];
  for (let i = 0; i < numFilters; i++) {
    const filter = new Float64Array(fftSize / 2 + 1);
    const start = binPoints[i];
    const center = binPoints[i + 1];
    const end = binPoints[i + 2];

    for (let j = start; j < center; j++) {
      filter[j] = (j - start) / (center - start);
    }
    for (let j = center; j < end; j++) {
      filter[j] = (end - j) / (end - center);
    }
    filters.push(filter);
  }

  return filters;
}

// DCT-II (first numCoeffs coefficients)
export function dct(input: Float64Array, numCoeffs: number = 13): Float64Array {
  const N = input.length;
  const result = new Float64Array(numCoeffs);

  for (let k = 0; k < numCoeffs; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += input[n] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N));
    }
    result[k] = sum;
  }

  return result;
}

// Hamming window
export function hammingWindow(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}

// Extract MFCCs from a single audio frame (power spectrum)
export function extractMFCCs(
  powerSpectrum: Float64Array,
  filters: Float64Array[],
  numCoeffs: number = 13
): Float64Array {
  // Apply Mel filterbank
  const filterEnergies = new Float64Array(filters.length);
  for (let i = 0; i < filters.length; i++) {
    let energy = 0;
    for (let j = 0; j < powerSpectrum.length && j < filters[i].length; j++) {
      energy += powerSpectrum[j] * filters[i][j];
    }
    filterEnergies[i] = Math.log(Math.max(energy, 1e-10));
  }

  // DCT to get MFCCs
  return dct(filterEnergies, numCoeffs);
}

// Spectral centroid (center of mass of spectrum)
export function spectralCentroid(
  powerSpectrum: Float64Array,
  sampleRate: number
): number {
  let weightedSum = 0;
  let totalEnergy = 0;
  const binWidth = sampleRate / (2 * powerSpectrum.length);

  for (let i = 0; i < powerSpectrum.length; i++) {
    const freq = i * binWidth;
    weightedSum += freq * powerSpectrum[i];
    totalEnergy += powerSpectrum[i];
  }

  return totalEnergy > 0 ? weightedSum / totalEnergy : 0;
}

// Spectral flatness (Wiener entropy) — 0=tonal, 1=noise-like
export function spectralFlatness(powerSpectrum: Float64Array): number {
  const n = powerSpectrum.length;
  if (n === 0) return 0;

  let logSum = 0;
  let sum = 0;
  let count = 0;

  for (let i = 1; i < n; i++) {
    const val = Math.max(powerSpectrum[i], 1e-10);
    logSum += Math.log(val);
    sum += val;
    count++;
  }

  if (count === 0 || sum === 0) return 0;
  const geometricMean = Math.exp(logSum / count);
  const arithmeticMean = sum / count;

  return geometricMean / arithmeticMean;
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/lib/audio/mfcc.ts
git commit -m "feat: MFCC math utilities (Mel filterbank, DCT, spectral features)"
```

---

## Task 2: Audio recorder hook

Record audio from the microphone, return PCM samples.

**Files:**
- Create: `src/lib/hooks/useAudioRecorder.ts`

- [ ] **Step 1: Create the recorder hook**

```typescript
// src/lib/hooks/useAudioRecorder.ts
"use client";

import { useRef, useState, useCallback } from "react";

interface RecordingResult {
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
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 44100 });
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
    contextRef.current?.close();
    contextRef.current = null;
    streamRef.current = null;
    processorRef.current = null;
    setIsRecording(false);

    const chunks = chunksRef.current;
    if (chunks.length === 0) return null;

    // Merge chunks into single buffer
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
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useAudioRecorder.ts
git commit -m "feat: useAudioRecorder hook — mic recording to PCM Float32Array"
```

---

## Task 3: Voice analyzer — extract features from recording

Takes PCM samples, returns aggregated voice features.

**Files:**
- Create: `src/lib/audio/voice-analyzer.ts`

- [ ] **Step 1: Create VoiceAnalyzer**

```typescript
// src/lib/audio/voice-analyzer.ts
import {
  melFilterbank,
  extractMFCCs,
  hammingWindow,
  spectralCentroid,
  spectralFlatness,
} from "./mfcc";

export interface VoiceFeatures {
  // MFCCs (mean of 13 coefficients across all frames)
  mfccMean: number[];
  mfccStd: number[];
  // Spectral features (mean across frames)
  spectralCentroidMean: number;
  spectralFlatnessMean: number;
  // Speech rhythm
  speechRateWordsPerMin: number; // estimated from voiced segments
  pauseCount: number;
  pauseTotalMs: number;
  meanPauseDurationMs: number;
  // Timing
  totalDurationMs: number;
  voicedDurationMs: number;
  // Quality
  signalToNoiseRatio: number;
}

const FRAME_SIZE = 2048;
const HOP_SIZE = 512;
const SILENCE_THRESHOLD = 0.01; // RMS threshold for pause detection
const MIN_PAUSE_MS = 150; // minimum pause duration to count

export function analyzeVoice(
  samples: Float32Array,
  sampleRate: number,
  expectedWords: number
): VoiceFeatures {
  const window = hammingWindow(FRAME_SIZE);
  const filters = melFilterbank(FRAME_SIZE, sampleRate, 26);

  const allMFCCs: number[][] = [];
  const centroids: number[] = [];
  const flatnesses: number[] = [];
  const rmsValues: number[] = [];

  // Process frames
  for (let i = 0; i + FRAME_SIZE <= samples.length; i += HOP_SIZE) {
    // Apply window
    const frame = new Float64Array(FRAME_SIZE);
    let rms = 0;
    for (let j = 0; j < FRAME_SIZE; j++) {
      frame[j] = samples[i + j] * window[j];
      rms += frame[j] * frame[j];
    }
    rms = Math.sqrt(rms / FRAME_SIZE);
    rmsValues.push(rms);

    if (rms < SILENCE_THRESHOLD) continue; // skip silent frames

    // Simple FFT via DFT (for power spectrum)
    const powerSpectrum = computePowerSpectrum(frame, FRAME_SIZE);

    // MFCCs
    const mfccs = extractMFCCs(powerSpectrum, filters, 13);
    allMFCCs.push(Array.from(mfccs));

    // Spectral features
    centroids.push(spectralCentroid(powerSpectrum, sampleRate));
    flatnesses.push(spectralFlatness(powerSpectrum));
  }

  // Aggregate MFCCs (mean and std per coefficient)
  const numCoeffs = 13;
  const mfccMean = new Array(numCoeffs).fill(0);
  const mfccStd = new Array(numCoeffs).fill(0);

  if (allMFCCs.length > 0) {
    for (let c = 0; c < numCoeffs; c++) {
      const vals = allMFCCs.map((m) => m[c]);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      mfccMean[c] = Math.round(mean * 100) / 100;
      const variance =
        vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      mfccStd[c] = Math.round(Math.sqrt(variance) * 100) / 100;
    }
  }

  // Pause detection
  const frameDurationMs = (HOP_SIZE / sampleRate) * 1000;
  let pauseCount = 0;
  let pauseTotalMs = 0;
  let inPause = false;
  let pauseStartFrame = 0;
  let voicedFrames = 0;

  for (let i = 0; i < rmsValues.length; i++) {
    const silent = rmsValues[i] < SILENCE_THRESHOLD;
    if (silent && !inPause) {
      inPause = true;
      pauseStartFrame = i;
    } else if (!silent && inPause) {
      const pauseDuration = (i - pauseStartFrame) * frameDurationMs;
      if (pauseDuration >= MIN_PAUSE_MS) {
        pauseCount++;
        pauseTotalMs += pauseDuration;
      }
      inPause = false;
    }
    if (!silent) voicedFrames++;
  }

  const totalDurationMs = (samples.length / sampleRate) * 1000;
  const voicedDurationMs = voicedFrames * frameDurationMs;

  // Speech rate estimate
  const speechRateWordsPerMin =
    voicedDurationMs > 0
      ? (expectedWords / voicedDurationMs) * 60000
      : 0;

  // SNR estimate (ratio of voiced RMS to silent RMS)
  const voicedRms = rmsValues.filter((r) => r >= SILENCE_THRESHOLD);
  const silentRms = rmsValues.filter((r) => r < SILENCE_THRESHOLD);
  const meanVoiced =
    voicedRms.length > 0
      ? voicedRms.reduce((a, b) => a + b, 0) / voicedRms.length
      : 0;
  const meanSilent =
    silentRms.length > 0
      ? silentRms.reduce((a, b) => a + b, 0) / silentRms.length
      : 0.001;
  const snr =
    meanSilent > 0
      ? Math.round(20 * Math.log10(meanVoiced / meanSilent) * 10) / 10
      : 0;

  return {
    mfccMean,
    mfccStd,
    spectralCentroidMean:
      centroids.length > 0
        ? Math.round(
            (centroids.reduce((a, b) => a + b, 0) / centroids.length) * 10
          ) / 10
        : 0,
    spectralFlatnessMean:
      flatnesses.length > 0
        ? Math.round(
            (flatnesses.reduce((a, b) => a + b, 0) / flatnesses.length) * 1000
          ) / 1000
        : 0,
    speechRateWordsPerMin: Math.round(speechRateWordsPerMin),
    pauseCount,
    pauseTotalMs: Math.round(pauseTotalMs),
    meanPauseDurationMs:
      pauseCount > 0 ? Math.round(pauseTotalMs / pauseCount) : 0,
    totalDurationMs: Math.round(totalDurationMs),
    voicedDurationMs: Math.round(voicedDurationMs),
    signalToNoiseRatio: snr,
  };
}

// Simple DFT-based power spectrum (sufficient for our frame sizes)
function computePowerSpectrum(
  frame: Float64Array,
  fftSize: number
): Float64Array {
  const halfSize = fftSize / 2 + 1;
  const spectrum = new Float64Array(halfSize);

  for (let k = 0; k < halfSize; k++) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < fftSize; n++) {
      const angle = (2 * Math.PI * k * n) / fftSize;
      real += frame[n] * Math.cos(angle);
      imag -= frame[n] * Math.sin(angle);
    }
    spectrum[k] = (real * real + imag * imag) / fftSize;
  }

  return spectrum;
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/lib/audio/voice-analyzer.ts
git commit -m "feat: VoiceAnalyzer — MFCC, spectral, speech rate, pause detection"
```

---

## Task 4: Reading task UI component

Display tongue twisters, record audio, show timer.

**Files:**
- Create: `src/components/capture/ReadingTask.tsx`

- [ ] **Step 1: Create ReadingTask component**

```typescript
// src/components/capture/ReadingTask.tsx
"use client";

import { useState, useCallback, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "../ui/Button";
import { useAudioRecorder } from "@/lib/hooks/useAudioRecorder";
import { analyzeVoice, VoiceFeatures } from "@/lib/audio/voice-analyzer";

interface ReadingTaskProps {
  onComplete: (features: VoiceFeatures) => void;
}

const READING_TEXT = `Les chaussettes de l'archiduchesse sont-elles sèches, archi-sèches ?
Un chasseur sachant chasser sait chasser sans son chien de chasse.
Si six scies scient six cyprès, six cent six scies scient six cent six cyprès.`;

const WORD_COUNT = 30; // approximate word count of the text above

export function ReadingTask({ onComplete }: ReadingTaskProps) {
  const recorder = useAudioRecorder();
  const [phase, setPhase] = useState<"intro" | "recording" | "processing">("intro");
  const [elapsed, setElapsed] = useState(0);

  // Timer during recording
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
      const features = analyzeVoice(result.samples, result.sampleRate, WORD_COUNT);
      onComplete(features);
    } else {
      // No audio captured — send empty features
      onComplete({
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
      });
    }
  }, [recorder, onComplete]);

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

        {/* Text to read */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-3">
          {READING_TEXT.split("\n").map((line, i) => (
            <p key={i} className="text-zinc-200 text-base leading-relaxed">
              {line}
            </p>
          ))}
        </div>

        {/* Recording indicator */}
        {phase === "recording" && (
          <div className="flex items-center justify-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 text-sm font-medium">
              Enregistrement
            </span>
          </div>
        )}

        {/* Controls */}
        <div className="flex justify-center">
          {phase === "intro" ? (
            <Button onClick={handleStart} size="lg">
              <Mic className="w-4 h-4" />
              Commencer la lecture
            </Button>
          ) : (
            <Button onClick={handleStop} size="lg" variant="secondary">
              <MicOff className="w-4 h-4" />
              J'ai terminé
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
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/components/capture/ReadingTask.tsx
git commit -m "feat: ReadingTask UI — tongue twisters display + audio recording"
```

---

## Task 5: Integrate reading phase into capture flow

Wire everything together: new phase, payload, Claude prompt.

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/components/capture/GuidedCapture.tsx`
- Modify: `src/components/capture/PhaseIndicator.tsx`
- Modify: `src/lib/eye-tracking/feature-extractor.ts`
- Modify: `src/app/api/analyze/route.ts`
- Modify: `src/lib/analysis/claude-prompt.ts`

- [ ] **Step 1: Add types**

In `src/types/index.ts`, add `phase_4_reading` to CapturePhase (after `phase_3`):

```typescript
  | "phase_3"
  | "phase_4_reading"
  | "extracting"
```

Add the VoiceFeatures interface at the end of the file:

```typescript
export interface VoiceFeatures {
  mfccMean: number[];
  mfccStd: number[];
  spectralCentroidMean: number;
  spectralFlatnessMean: number;
  speechRateWordsPerMin: number;
  pauseCount: number;
  pauseTotalMs: number;
  meanPauseDurationMs: number;
  totalDurationMs: number;
  voicedDurationMs: number;
  signalToNoiseRatio: number;
}
```

Add `voiceAnalysis?: VoiceFeatures` to the `AnalysisPayload` interface (at the same level as `hippus`, `context`, `meta`).

- [ ] **Step 2: Update GuidedCapture**

a) Add imports:
```typescript
import { ReadingTask } from "./ReadingTask";
import type { VoiceFeatures } from "@/types";
```

b) Add state:
```typescript
const [voiceFeatures, setVoiceFeatures] = useState<VoiceFeatures | null>(null);
```

c) The reading phase does NOT go in PHASE_ORDER (it's manually managed like countdown). After pursuit finishes (`finishCapture` is called), instead of going straight to extracting, go to reading first.

Replace the `finishCapture` callback:
```typescript
const finishCapture = useCallback(async () => {
  cancelAnimationFrame(rafRef.current);
  setPhase("phase_4_reading");
}, []);
```

Add a new handler for when reading completes:
```typescript
const handleReadingComplete = useCallback(async (features: VoiceFeatures) => {
  setVoiceFeatures(features);
  setPhase("extracting");

  if (!context) return;

  const durationMs = performance.now() - captureStartRef.current;
  const payload = extraction.buildPayload(context, camera.resolution, durationMs, features);

  setPhase("analyzing");

  const result = await analysis.analyze(payload);
  if (result) {
    sessionStorage.setItem("valk-result", JSON.stringify(result));
    sessionStorage.setItem("valk-payload", JSON.stringify(payload));
    router.push("/results");
  }
}, [context, extraction, camera.resolution, analysis, router]);
```

d) Update the old `finishCapture` to remove the payload building (it's now in `handleReadingComplete`).

e) Add JSX after phase 3 pursuit block:
```tsx
{/* Phase 4 -- Reading task (voice analysis) */}
{phase === "phase_4_reading" && (
  <ReadingTask onComplete={handleReadingComplete} />
)}
```

- [ ] **Step 3: Update FeatureExtractor.buildPayload**

Add optional `voiceFeatures` parameter:
```typescript
buildPayload(
  context: UserContext,
  cameraResolution: { width: number; height: number },
  captureDurationMs: number,
  voiceFeatures?: VoiceFeatures
): AnalysisPayload {
```

Add to the return object:
```typescript
voiceAnalysis: voiceFeatures,
```

- [ ] **Step 4: Update PhaseIndicator**

Add reading phase to the indicator. Add to PHASES array:
```typescript
{ key: "phase_4", label: "Lecture", duration: "~15s" },
```

Update `isPhaseActive` and `isPhaseComplete` to handle `phase_4_reading`.

- [ ] **Step 5: Update API route Zod schema**

In `src/app/api/analyze/route.ts`, add optional voice features to `payloadSchema`:

```typescript
voiceAnalysis: z.object({
  mfccMean: z.array(z.number()),
  mfccStd: z.array(z.number()),
  spectralCentroidMean: z.number(),
  spectralFlatnessMean: z.number(),
  speechRateWordsPerMin: z.number(),
  pauseCount: z.number(),
  pauseTotalMs: z.number(),
  meanPauseDurationMs: z.number(),
  totalDurationMs: z.number(),
  voicedDurationMs: z.number(),
  signalToNoiseRatio: z.number(),
}).optional(),
```

- [ ] **Step 6: Update Claude prompt**

In the system prompt, add to ANALYSIS CATEGORIES under Alcohol:
```
   i) Voice analysis (reading aloud) — speech rate ↓, pause count ↑, spectral flatness ↑ with alcohol (Suffoletto et al. 2023, Stanford: 98% accuracy SVM on smartphone audio at BAC>0.08%). Intoxicated speech is slower, has lower amplitude, more errors. MFCCs capture spectral envelope changes from slurred articulation.
```

In `buildUserPrompt`, add a VOICE ANALYSIS section:
```typescript
${payload.voiceAnalysis ? `
VOICE ANALYSIS (Phase 4 — Reading tongue twisters aloud):
- Speech rate: ${payload.voiceAnalysis.speechRateWordsPerMin} words/min (normal French reading: 150-180 wpm)
- Total duration: ${payload.voiceAnalysis.totalDurationMs}ms
- Voiced duration: ${payload.voiceAnalysis.voicedDurationMs}ms
- Pause count: ${payload.voiceAnalysis.pauseCount}
- Total pause time: ${payload.voiceAnalysis.pauseTotalMs}ms
- Mean pause duration: ${payload.voiceAnalysis.meanPauseDurationMs}ms (normal: <250ms)
- Spectral centroid: ${payload.voiceAnalysis.spectralCentroidMean}Hz
- Spectral flatness: ${payload.voiceAnalysis.spectralFlatnessMean} (0=tonal, 1=noise; slurred speech ↑ flatness)
- MFCC mean: [${payload.voiceAnalysis.mfccMean.join(", ")}]
- MFCC std: [${payload.voiceAnalysis.mfccStd.join(", ")}]
- SNR: ${payload.voiceAnalysis.signalToNoiseRatio}dB
Reference: Suffoletto et al. 2023 (J Studies Alcohol & Drugs, Stanford): 98% accuracy detecting BAC>0.08% from 1s voice segments via SVM on MFCCs + spectral features. Key indicators: ↓ speech rate, ↑ pauses, ↑ spectral flatness, altered MFCC patterns.
` : "VOICE ANALYSIS: Not available for this session."}
```

- [ ] **Step 7: Build and verify**

Run: `npm run build`

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/components/capture/GuidedCapture.tsx src/components/capture/PhaseIndicator.tsx src/lib/eye-tracking/feature-extractor.ts src/app/api/analyze/route.ts src/lib/analysis/claude-prompt.ts
git commit -m "feat: integrate reading phase into capture flow + Claude prompt

New phase after pursuit: user reads French tongue twisters aloud.
Audio recorded, MFCC + spectral features extracted, sent to Claude
with reference thresholds from Suffoletto 2023 (Stanford, 98% acc).
Adds voice analysis section to analysis payload and prompt."
```

---

## Final: Push and test

- [ ] **Push all commits**

```bash
git push origin main
```

Test the full flow. Key verifications:
1. Mic permission requested when reading phase starts
2. Audio records while user reads
3. Voice features appear in the analysis results
4. Claude cites Suffoletto et al. in voice-related observations
5. Works on both desktop and iPhone Safari
