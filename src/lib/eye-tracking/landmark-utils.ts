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

// Inter-pupillary distance in pixels (468 = right iris center, 473 = left)
export function ipdPixels(landmarks: LandmarkPoint[], imageWidth: number): number {
  const rightCenter = landmarks[468];
  const leftCenter = landmarks[473];
  if (!rightCenter || !leftCenter) return 0;
  return Math.abs(rightCenter.x - leftCenter.x) * imageWidth;
}

// Estimate pupil-to-iris ratio by sampling dark pixels within iris circle.
// Returns ratio (0.2-0.8). pupilDiameter ≈ irisDiameter * ratio.
export function estimatePupilRatio(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  irisCenterIdx: number,
  irisEdgeIdx: number,
  imageWidth: number,
  imageHeight: number,
  darknessThreshold: number = 60
): number {
  const center = landmarks[irisCenterIdx];
  const edge = landmarks[irisEdgeIdx];
  if (!center || !edge) return 0.42;

  const cx = Math.round(center.x * imageWidth);
  const cy = Math.round(center.y * imageHeight);
  const radius = Math.round(
    Math.sqrt(
      ((edge.x - center.x) * imageWidth) ** 2 +
      ((edge.y - center.y) * imageHeight) ** 2
    )
  );

  if (radius < 3) return 0.42;

  const x0 = Math.max(0, cx - radius);
  const y0 = Math.max(0, cy - radius);
  const size = Math.min(radius * 2, imageWidth - x0, imageHeight - y0);
  if (size < 6) return 0.42;

  let darkPixels = 0;
  let totalPixels = 0;

  try {
    const imageData = ctx.getImageData(x0, y0, size, size);
    const data = imageData.data;
    const r2 = radius * radius;

    for (let dy = 0; dy < size; dy += 2) {
      for (let dx = 0; dx < size; dx += 2) {
        const distSq = (dx - radius) ** 2 + (dy - radius) ** 2;
        if (distSq > r2) continue;
        totalPixels++;
        const idx = (dy * size + dx) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (brightness < darknessThreshold) darkPixels++;
      }
    }
  } catch {
    return 0.42;
  }

  if (totalPixels === 0) return 0.42;
  const ratio = Math.sqrt(darkPixels / totalPixels);
  return Math.max(0.2, Math.min(0.8, ratio));
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
