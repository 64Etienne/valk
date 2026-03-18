import { LandmarkPoint } from "./types";
import {
  LEFT_EYE_CONTOUR, RIGHT_EYE_CONTOUR,
  LEFT_IRIS, RIGHT_IRIS,
} from "./landmark-utils";
import { rgbToLab } from "../utils/color-space";
import { mean } from "../utils/math";

interface ScleraResult {
  leftLAB: [number, number, number];
  rightLAB: [number, number, number];
  rednessIndex: number;   // a* channel — higher = redder
  yellownessIndex: number; // b* channel — higher = more yellow
}

export class ScleraAnalyzer {
  private canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  // Initialize with canvas for pixel sampling
  initCanvas(width: number, height: number): void {
    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(width, height);
      this.ctx = this.canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    } else {
      this.canvas = document.createElement("canvas");
      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx = this.canvas.getContext("2d");
    }
  }

  // Analyze a video frame for scleral color
  analyze(
    videoFrame: HTMLVideoElement | ImageBitmap,
    landmarks: LandmarkPoint[],
    imageWidth: number,
    imageHeight: number
  ): ScleraResult {
    if (!this.ctx || !this.canvas) {
      this.initCanvas(imageWidth, imageHeight);
    }

    const ctx = this.ctx!;
    const canvas = this.canvas!;

    // Draw current video frame to offscreen canvas
    if (canvas instanceof HTMLCanvasElement) {
      canvas.width = imageWidth;
      canvas.height = imageHeight;
    } else {
      (canvas as OffscreenCanvas).width = imageWidth;
      (canvas as OffscreenCanvas).height = imageHeight;
    }
    ctx.drawImage(videoFrame as CanvasImageSource, 0, 0, imageWidth, imageHeight);

    // Sample sclera pixels for each eye
    const leftLAB = this.sampleScleraRegion(ctx, landmarks, LEFT_EYE_CONTOUR, LEFT_IRIS, imageWidth, imageHeight);
    const rightLAB = this.sampleScleraRegion(ctx, landmarks, RIGHT_EYE_CONTOUR, RIGHT_IRIS, imageWidth, imageHeight);

    // Redness = average a* channel (positive a* = red)
    const rednessIndex = (leftLAB[1] + rightLAB[1]) / 2;
    // Yellowness = average b* channel (positive b* = yellow)
    const yellownessIndex = (leftLAB[2] + rightLAB[2]) / 2;

    return {
      leftLAB: leftLAB.map((v) => Math.round(v * 10) / 10) as [number, number, number],
      rightLAB: rightLAB.map((v) => Math.round(v * 10) / 10) as [number, number, number],
      rednessIndex: Math.round(rednessIndex * 10) / 10,
      yellownessIndex: Math.round(yellownessIndex * 10) / 10,
    };
  }

  private sampleScleraRegion(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    landmarks: LandmarkPoint[],
    contourIndices: number[],
    irisIndices: number[],
    imageWidth: number,
    imageHeight: number
  ): [number, number, number] {
    // Get eye contour points
    const contour = contourIndices
      .map((i) => landmarks[i])
      .filter(Boolean)
      .map((p) => ({ x: Math.round(p.x * imageWidth), y: Math.round(p.y * imageHeight) }));

    // Get iris center and approximate radius
    const irisCenter = landmarks[irisIndices[0]];
    if (!irisCenter || contour.length < 4) return [80, 5, 10]; // default sclera-ish LAB

    const irisCx = irisCenter.x * imageWidth;
    const irisCy = irisCenter.y * imageHeight;
    const irisEdge = landmarks[irisIndices[1]];
    const irisRadius = irisEdge
      ? Math.sqrt((irisEdge.x * imageWidth - irisCx) ** 2 + (irisEdge.y * imageHeight - irisCy) ** 2) * 1.3
      : 15;

    // Get bounding box of eye contour
    const xs = contour.map((p) => p.x);
    const ys = contour.map((p) => p.y);
    const minX = Math.max(0, Math.min(...xs));
    const maxX = Math.min(imageWidth, Math.max(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxY = Math.min(imageHeight, Math.max(...ys));

    if (maxX - minX < 2 || maxY - minY < 2) return [80, 5, 10];

    // Sample pixels in the bounding box
    const imageData = ctx.getImageData(minX, minY, maxX - minX, maxY - minY);
    const pixels = imageData.data;

    const lValues: number[] = [];
    const aValues: number[] = [];
    const bValues: number[] = [];

    // Sample points, skip iris area
    const step = 2; // sample every 2nd pixel for performance
    for (let y = 0; y < maxY - minY; y += step) {
      for (let x = 0; x < maxX - minX; x += step) {
        const absX = x + minX;
        const absY = y + minY;

        // Skip if inside iris circle
        const distFromIris = Math.sqrt((absX - irisCx) ** 2 + (absY - irisCy) ** 2);
        if (distFromIris < irisRadius) continue;

        // Simple point-in-polygon for eye contour
        if (!this.pointInPolygon(absX, absY, contour)) continue;

        const idx = (y * (maxX - minX) + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];

        // Skip very dark pixels (eyelashes, shadows)
        if (r + g + b < 90) continue;

        const [L, a, bVal] = rgbToLab(r, g, b);
        lValues.push(L);
        aValues.push(a);
        bValues.push(bVal);
      }
    }

    if (lValues.length === 0) return [80, 5, 10];

    return [mean(lValues), mean(aValues), mean(bValues)];
  }

  private pointInPolygon(x: number, y: number, polygon: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }
}
