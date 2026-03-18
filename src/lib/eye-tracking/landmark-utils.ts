import { LandmarkPoint } from "./types";

// MediaPipe FaceLandmarker indices
// Iris landmarks (requires refineLandmarks: true)
export const RIGHT_IRIS = [468, 469, 470, 471, 472]; // 468 = center
export const LEFT_IRIS = [473, 474, 475, 476, 477];  // 473 = center

// Eye contour landmarks for EAR calculation and sclera region
export const RIGHT_EYE_UPPER = [159, 160, 161, 158, 157, 173];
export const RIGHT_EYE_LOWER = [145, 144, 163, 7, 33, 133];
export const LEFT_EYE_UPPER = [386, 385, 384, 387, 388, 466];
export const LEFT_EYE_LOWER = [374, 380, 381, 382, 362, 263];

// EAR landmarks (6 points per eye for Eye Aspect Ratio)
// Right eye: P1=33, P2=160, P3=158, P4=133, P5=153, P6=144
export const RIGHT_EAR_POINTS = [33, 160, 158, 133, 153, 144];
// Left eye: P1=362, P2=385, P3=387, P4=263, P5=373, P6=380
export const LEFT_EAR_POINTS = [362, 385, 387, 263, 373, 380];

// Eyelid aperture (top-bottom pairs)
export const RIGHT_EYELID_TOP = 159;
export const RIGHT_EYELID_BOTTOM = 145;
export const LEFT_EYELID_TOP = 386;
export const LEFT_EYELID_BOTTOM = 374;

// Full eye contour for sclera sampling
export const RIGHT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const LEFT_EYE_CONTOUR = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];

// Euclidean distance between two 3D landmarks
export function landmarkDistance(a: LandmarkPoint, b: LandmarkPoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

// 2D distance (ignore z)
export function landmarkDistance2D(a: LandmarkPoint, b: LandmarkPoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Eye Aspect Ratio (EAR) — Soukupova & Cech 2016
// EAR = (|P2-P6| + |P3-P5|) / (2 * |P1-P4|)
export function computeEAR(landmarks: LandmarkPoint[], indices: number[]): number {
  const [p1, p2, p3, p4, p5, p6] = indices.map((i) => landmarks[i]);
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0.3; // fallback open

  const vertical1 = landmarkDistance(p2, p6);
  const vertical2 = landmarkDistance(p3, p5);
  const horizontal = landmarkDistance(p1, p4);

  if (horizontal === 0) return 0.3;
  return (vertical1 + vertical2) / (2 * horizontal);
}

// Iris diameter in pixels (average of horizontal and vertical span)
export function irisDiameterPx(landmarks: LandmarkPoint[], irisIndices: number[], imageWidth: number, imageHeight: number): number {
  // Iris has center + 4 cardinal points
  const [, right, top, left, bottom] = irisIndices.map((i) => landmarks[i]);
  if (!right || !top || !left || !bottom) return 0;

  const horizPx = Math.abs(right.x - left.x) * imageWidth;
  const vertPx = Math.abs(top.y - bottom.y) * imageHeight;
  return (horizPx + vertPx) / 2;
}

// Convert pixel measurement to mm using iris as reference
// Average human iris diameter = 11.7mm
export function pixelsToMm(pixels: number, irisPixels: number, irisRefMm: number = 11.7): number {
  if (irisPixels === 0) return 0;
  return (pixels / irisPixels) * irisRefMm;
}

// Get normalized iris center position (0-1 range)
export function irisCenter(landmarks: LandmarkPoint[], centerIndex: number): { x: number; y: number } {
  const center = landmarks[centerIndex];
  if (!center) return { x: 0.5, y: 0.5 };
  return { x: center.x, y: center.y };
}

// Get polygon points for sclera region (eye contour excluding iris area)
export function getEyeContourPoints(
  landmarks: LandmarkPoint[],
  contourIndices: number[],
  imageWidth: number,
  imageHeight: number
): Array<{ x: number; y: number }> {
  return contourIndices
    .map((i) => landmarks[i])
    .filter(Boolean)
    .map((p) => ({ x: p.x * imageWidth, y: p.y * imageHeight }));
}
