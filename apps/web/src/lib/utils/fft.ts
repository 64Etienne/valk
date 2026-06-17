// Radix-2 Cooley-Tukey FFT — input length must be power of 2
export function fft(real: number[]): { magnitudes: number[]; frequencies: number[] } {
  const n = real.length;
  // Pad to next power of 2
  let size = 1;
  while (size < n) size <<= 1;

  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < n; i++) re[i] = real[i];

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // FFT
  for (let len = 2; len <= size; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < size; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm;
        const vIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }

  const magnitudes = new Array(size / 2);
  const frequencies = new Array(size / 2);
  for (let i = 0; i < size / 2; i++) {
    magnitudes[i] = Math.sqrt(re[i] ** 2 + im[i] ** 2) / n;
    frequencies[i] = i; // multiply by (sampleRate / size) to get Hz
  }

  return { magnitudes, frequencies };
}

// Find dominant frequency in a band
export function dominantFrequency(
  signal: number[],
  sampleRate: number,
  bandLow: number,
  bandHigh: number
): { frequency: number; magnitude: number } {
  const { magnitudes } = fft(signal);
  let size = 1;
  while (size < signal.length) size <<= 1;

  const freqRes = sampleRate / size;
  let maxMag = 0;
  let maxFreq = 0;

  for (let i = 0; i < magnitudes.length; i++) {
    const freq = i * freqRes;
    if (freq >= bandLow && freq <= bandHigh && magnitudes[i] > maxMag) {
      maxMag = magnitudes[i];
      maxFreq = freq;
    }
  }

  return { frequency: maxFreq, magnitude: maxMag };
}
