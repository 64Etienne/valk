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
  const frameOffsets: number[] = [];

  // Pass 1: compute RMS for all frames
  for (let i = 0; i + FRAME_SIZE <= samples.length; i += HOP_SIZE) {
    const frame = new Float64Array(FRAME_SIZE);
    let rms = 0;
    for (let j = 0; j < FRAME_SIZE; j++) {
      frame[j] = samples[i + j] * window[j];
      rms += frame[j] * frame[j];
    }
    rms = Math.sqrt(rms / FRAME_SIZE);
    rmsValues.push(rms);
    frameOffsets.push(i);
  }

  // Adaptive silence threshold: use 15th percentile * 1.5 as noise floor
  const sortedRms = [...rmsValues].sort((a, b) => a - b);
  const adaptiveThreshold = Math.max(
    SILENCE_THRESHOLD,
    sortedRms[Math.floor(sortedRms.length * 0.15)] * 1.5
  );

  // Pass 2: extract spectral features for voiced frames
  for (let idx = 0; idx < rmsValues.length; idx++) {
    if (rmsValues[idx] < adaptiveThreshold) continue;

    const frame = new Float64Array(FRAME_SIZE);
    const offset = frameOffsets[idx];
    for (let j = 0; j < FRAME_SIZE; j++) {
      frame[j] = samples[offset + j] * window[j];
    }

    const powerSpectrum = computePowerSpectrum(frame, FRAME_SIZE);
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

  // Pause detection
  const frameDurationMs = (HOP_SIZE / sampleRate) * 1000;
  let pauseCount = 0;
  let pauseTotalMs = 0;
  let inPause = false;
  let pauseStartFrame = 0;
  let voicedFrames = 0;

  for (let i = 0; i < rmsValues.length; i++) {
    const silent = rmsValues[i] < adaptiveThreshold;
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

  const speechRateWordsPerMin =
    totalDurationMs > 0 ? (expectedWords / totalDurationMs) * 60000 : 0;

  // SNR estimate
  const voicedRms = rmsValues.filter((r) => r >= adaptiveThreshold);
  const silentRms = rmsValues.filter((r) => r < adaptiveThreshold);
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
