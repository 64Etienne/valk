// Mel-frequency cepstral coefficient extraction utilities
// Based on standard speech processing pipeline:
// Audio → Hamming window → FFT → Mel filterbank → Log → DCT → MFCCs

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

export function melFilterbank(
  fftSize: number,
  sampleRate: number,
  numFilters: number = 26
): Float64Array[] {
  const lowMel = hzToMel(300);
  const highMel = hzToMel(sampleRate / 2);
  const melPoints: number[] = [];

  for (let i = 0; i < numFilters + 2; i++) {
    melPoints.push(lowMel + (i * (highMel - lowMel)) / (numFilters + 1));
  }

  const binPoints = melPoints.map((mel) =>
    Math.floor(((fftSize + 1) * melToHz(mel)) / sampleRate)
  );

  const filters: Float64Array[] = [];
  for (let i = 0; i < numFilters; i++) {
    const filter = new Float64Array(fftSize / 2 + 1);
    const start = binPoints[i];
    const center = binPoints[i + 1];
    const end = binPoints[i + 2];

    for (let j = start; j < center; j++) {
      if (center !== start) filter[j] = (j - start) / (center - start);
    }
    for (let j = center; j < end; j++) {
      if (end !== center) filter[j] = (end - j) / (end - center);
    }
    filters.push(filter);
  }

  return filters;
}

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

export function hammingWindow(size: number): Float64Array {
  const w = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return w;
}

export function extractMFCCs(
  powerSpectrum: Float64Array,
  filters: Float64Array[],
  numCoeffs: number = 13
): Float64Array {
  const filterEnergies = new Float64Array(filters.length);
  for (let i = 0; i < filters.length; i++) {
    let energy = 0;
    const len = Math.min(powerSpectrum.length, filters[i].length);
    for (let j = 0; j < len; j++) {
      energy += powerSpectrum[j] * filters[i][j];
    }
    filterEnergies[i] = Math.log(Math.max(energy, 1e-10));
  }

  return dct(filterEnergies, numCoeffs);
}

export function spectralCentroid(
  powerSpectrum: Float64Array,
  sampleRate: number
): number {
  let weightedSum = 0;
  let totalEnergy = 0;
  const binWidth = sampleRate / (2 * powerSpectrum.length);

  for (let i = 0; i < powerSpectrum.length; i++) {
    weightedSum += i * binWidth * powerSpectrum[i];
    totalEnergy += powerSpectrum[i];
  }

  return totalEnergy > 0 ? weightedSum / totalEnergy : 0;
}

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
  return Math.exp(logSum / count) / (sum / count);
}

// Simple DFT power spectrum (sufficient for 2048-sample frames)
export function computePowerSpectrum(
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
