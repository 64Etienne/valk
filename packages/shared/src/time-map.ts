/**
 * Résout la carte temporelle linéaire video = a·stim + b reliant le temps-stimulus
 * (horloge monotone du device) au temps-vidéo (frames décodées côté serveur),
 * à partir d'ancres de synchronisation in-band (flash début/fin). Moindres carrés.
 */
export function fitLinearTimeMap(
  anchors: Array<{ stim: number; video: number }>,
): { a: number; b: number; anchors: number } {
  const n = anchors.length;
  if (n < 2) {
    throw new Error(`fitLinearTimeMap requiert au moins 2 ancres, reçu ${n}`);
  }
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  for (const { stim, video } of anchors) {
    sumX += stim;
    sumY += video;
    sumXX += stim * stim;
    sumXY += stim * video;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) {
    throw new Error('fitLinearTimeMap : ancres dégénérées (même temps-stimulus)');
  }
  const a = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - a * sumX) / n;
  return { a, b, anchors: n };
}
