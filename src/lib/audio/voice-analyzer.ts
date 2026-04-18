import {
  melFilterbank,
  extractMFCCs,
  hammingWindow,
  spectralCentroid,
  spectralFlatness,
  computePowerSpectrum,
} from "./mfcc";

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

const FRAME_SIZE = 2048;
const HOP_SIZE = 512;
const SILENCE_THRESHOLD = 0.005;
const MIN_PAUSE_MS = 150;

// Phase 2.2 (valk-v3) : VAD énergie+ZCR.
// ZCR typique :
//   - voisé (voyelles + consonnes voisées) : 0.01-0.10
//   - fricatives non voisées (s, f, ch) : 0.15-0.35
//   - bruit large-bande : > 0.30
// On accepte [0.01, 0.30] pour couvrir la parole française complète (voix +
// fricatives) tout en excluant le bruit pur. Combiné avec le threshold
// d'énergie, ça discrimine voix active de silence ambient + bruit impulsif.
const ZCR_MIN = 0.01;
const ZCR_MAX = 0.30;

// Hystérésis : transition voiced→silent demande un minimum de frames
// silencieuses consécutives, et inverse. Évite les faux splits à 150 ms
// lors des phonèmes à faible énergie (nasales, liquides).
const HYSTERESIS_FRAMES = 4; // ~46 ms à 44.1 kHz avec HOP=512

function computeZcr(frame: Float64Array): number {
  let crossings = 0;
  for (let i = 1; i < frame.length; i++) {
    if ((frame[i - 1] >= 0) !== (frame[i] >= 0)) crossings++;
  }
  return crossings / frame.length;
}

/**
 * Remove isolated voiced frames (< hyst consecutive) and isolated silent
 * frames (< hyst consecutive). Smooths the raw VAD decision without
 * shifting boundaries more than ±hyst frames.
 */
function applyHysteresis(raw: boolean[], hyst: number): boolean[] {
  if (hyst <= 1 || raw.length === 0) return raw.slice();
  const out = raw.slice();
  // Forward pass: fill short silent gaps inside voiced runs.
  let i = 0;
  while (i < out.length) {
    if (out[i]) {
      // Look ahead for next silent run
      let j = i;
      while (j < out.length && out[j]) j++;
      // j points at first silent (or EOF)
      let k = j;
      while (k < out.length && !out[k]) k++;
      const silentRun = k - j;
      if (silentRun > 0 && silentRun < hyst && k < out.length) {
        for (let m = j; m < k; m++) out[m] = true;
      }
      i = k;
    } else {
      i++;
    }
  }
  // Backward pass: remove short voiced runs floating in silence.
  i = 0;
  while (i < out.length) {
    if (out[i]) {
      let j = i;
      while (j < out.length && out[j]) j++;
      const voicedRun = j - i;
      if (voicedRun < hyst) {
        for (let m = i; m < j; m++) out[m] = false;
      }
      i = j;
    } else {
      i++;
    }
  }
  return out;
}

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
  const zcrValues: number[] = [];
  const frameOffsets: number[] = [];
  // Also store raw (unwindowed) frames for ZCR — windowing biases ZCR by
  // attenuating frame edges.
  const rawFrames: Float64Array[] = [];

  // Pass 1: compute RMS + ZCR for all frames
  for (let i = 0; i + FRAME_SIZE <= samples.length; i += HOP_SIZE) {
    const windowedFrame = new Float64Array(FRAME_SIZE);
    const rawFrame = new Float64Array(FRAME_SIZE);
    let rms = 0;
    for (let j = 0; j < FRAME_SIZE; j++) {
      const x = samples[i + j];
      rawFrame[j] = x;
      windowedFrame[j] = x * window[j];
      rms += windowedFrame[j] * windowedFrame[j];
    }
    rms = Math.sqrt(rms / FRAME_SIZE);
    const zcr = computeZcr(rawFrame);
    rmsValues.push(rms);
    zcrValues.push(zcr);
    frameOffsets.push(i);
    rawFrames.push(windowedFrame);
  }

  // Adaptive energy threshold: 25th percentile × 2 as noise floor.
  // With AGC off (Phase 2.2), the RMS distribution has a real noise mode,
  // so percentile-based thresholding is stable. P25×2 is more conservative
  // than the previous P15×1.5 and handles brief silences better.
  const sortedRms = [...rmsValues].sort((a, b) => a - b);
  const adaptiveThreshold = Math.max(
    SILENCE_THRESHOLD,
    sortedRms[Math.floor(sortedRms.length * 0.25)] * 2
  );

  // Pass 2 VAD: energy + ZCR + hysteresis → boolean array per frame
  const voicedRaw: boolean[] = rmsValues.map(
    (rms, i) => rms >= adaptiveThreshold && zcrValues[i] >= ZCR_MIN && zcrValues[i] <= ZCR_MAX
  );
  const voiced: boolean[] = applyHysteresis(voicedRaw, HYSTERESIS_FRAMES);

  // Pass 3: extract spectral features for voiced frames
  for (let idx = 0; idx < rmsValues.length; idx++) {
    if (!voiced[idx]) continue;

    const powerSpectrum = computePowerSpectrum(rawFrames[idx], FRAME_SIZE);
    const mfccs = extractMFCCs(powerSpectrum, filters, 13);
    allMFCCs.push(Array.from(mfccs));
    centroids.push(spectralCentroid(powerSpectrum, sampleRate));
    flatnesses.push(spectralFlatness(powerSpectrum));
  }

  // Aggregate MFCCs
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

  // Pause detection (uses hysteresis-stabilised voiced[])
  const frameDurationMs = (HOP_SIZE / sampleRate) * 1000;
  let pauseCount = 0;
  let pauseTotalMs = 0;
  let inPause = false;
  let pauseStartFrame = 0;
  let voicedFrames = 0;

  for (let i = 0; i < voiced.length; i++) {
    const silent = !voiced[i];
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

  // Speech rate is measured over VOICED time (actual talking), not total time.
  // Otherwise prosodic pauses at commas/periods — which are normal in faithful
  // reading of a punctuated French text — artificially depress wpm and get
  // flagged as impairment. Suffoletto 2023 also normalises on voiced time.
  // Fallback to totalDurationMs if voiced detection failed (very short clip).
  const denomMs = voicedDurationMs > 1000 ? voicedDurationMs : totalDurationMs;
  const speechRateWordsPerMin =
    denomMs > 0 ? (expectedWords / denomMs) * 60000 : 0;

  // SNR estimate — use the hysteresis-stabilised voiced[] partitioning
  const voicedRms: number[] = [];
  const silentRms: number[] = [];
  for (let i = 0; i < rmsValues.length; i++) {
    if (voiced[i]) voicedRms.push(rmsValues[i]);
    else silentRms.push(rmsValues[i]);
  }
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

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    mfccMean,
    mfccStd,
    spectralCentroidMean: Math.round(avg(centroids) * 10) / 10,
    spectralFlatnessMean: Math.round(avg(flatnesses) * 1000) / 1000,
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
