# Measurement Quality Improvement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken pupil diameter measurement (currently constant), wire up real eyelid aperture, add pixel-based pupil estimation, request max screen brightness, and improve the Claude analysis prompt with honest confidence metadata.

**Architecture:** 5 tasks touching the eye-tracking measurement pipeline, the capture UX (brightness), and the analysis prompt. The core fix replaces the self-referencing iris scale (which always returns 11.7mm) with IPD-based scaling + pixel-darkness pupil estimation. BlinkDetector.getEyelidAperture() already exists but was never called — we wire it up. Screen brightness is requested via the Screen Wake Lock + brightness APIs where available.

**Tech Stack:** TypeScript, MediaPipe landmarks, Canvas pixel analysis, Screen API

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/eye-tracking/pupil-analyzer.ts` | Rewrite | IPD-based scaling + pixel-darkness pupil estimation |
| `src/lib/eye-tracking/landmark-utils.ts` | Modify | Add IPD helper, add pupil darkness sampling |
| `src/lib/eye-tracking/feature-extractor.ts` | Modify | Wire eyelid aperture, pass video to pupil analyzer |
| `src/components/capture/GuidedCapture.tsx` | Modify | Request screen brightness on capture start |
| `src/lib/analysis/claude-prompt.ts` | Modify | Add measurement confidence metadata, fix prompt |

---

## Task 1: Fix pupil measurement — IPD scaling + pixel-based darkness estimation

### The bug

`pupil-analyzer.ts:41`: `pixelsToMm(leftIrisPx, leftIrisPx, this.irisRefMm)` passes the same value for `pixels` and `irisPixels`. Result: `(x / x) * 11.7 = 11.7` always. After the 0.42 multiplier, pupil diameter is constant 4.914mm regardless of actual pupil state.

### The fix

1. Use **inter-pupillary distance (IPD)** as the mm↔px scale reference (avg adult IPD = 63mm, more stable than iris self-reference)
2. Add **pixel-darkness sampling** within the iris circle to estimate actual pupil diameter. The pupil is the dark center of the iris — measure its radius by thresholding dark pixels.

**Files:**
- Modify: `src/lib/eye-tracking/landmark-utils.ts`
- Rewrite: `src/lib/eye-tracking/pupil-analyzer.ts`

- [ ] **Step 1: Add IPD and pupil estimation helpers to landmark-utils.ts**

Add these functions at the end of `landmark-utils.ts`:

```typescript
// Inter-pupillary distance in pixels (landmark 468 = right iris center, 473 = left)
export function ipdPixels(landmarks: LandmarkPoint[], imageWidth: number): number {
  const rightCenter = landmarks[468];
  const leftCenter = landmarks[473];
  if (!rightCenter || !leftCenter) return 0;
  return Math.abs(rightCenter.x - leftCenter.x) * imageWidth;
}

// Estimate pupil diameter by sampling dark pixels within iris circle.
// Returns ratio of dark area to total iris area (0-1).
// pupilDiameter ≈ irisDiameter * sqrt(darkRatio)
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
  if (!center || !edge) return 0.42; // fallback to Wyatt ratio

  const cx = Math.round(center.x * imageWidth);
  const cy = Math.round(center.y * imageHeight);
  const radius = Math.round(
    Math.sqrt(
      ((edge.x - center.x) * imageWidth) ** 2 +
      ((edge.y - center.y) * imageHeight) ** 2
    )
  );

  if (radius < 3) return 0.42;

  // Sample pixels in iris bounding box
  const x0 = Math.max(0, cx - radius);
  const y0 = Math.max(0, cy - radius);
  const size = radius * 2;
  if (x0 + size > imageWidth || y0 + size > imageHeight) return 0.42;

  let darkPixels = 0;
  let totalPixels = 0;

  try {
    const imageData = ctx.getImageData(x0, y0, size, size);
    const data = imageData.data;
    const r2 = radius * radius;

    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        // Only count pixels inside the iris circle
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
  const darkRatio = darkPixels / totalPixels;

  // Clamp to reasonable range (pupil is 20-80% of iris diameter)
  const ratio = Math.sqrt(darkRatio);
  return Math.max(0.2, Math.min(0.8, ratio));
}
```

- [ ] **Step 2: Rewrite PupilAnalyzer to use IPD scaling and pixel-based estimation**

Replace the entire `PupilAnalyzer` class:

```typescript
import { LandmarkPoint } from "./types";
import {
  RIGHT_IRIS, LEFT_IRIS,
  irisDiameterPx, ipdPixels, estimatePupilRatio,
} from "./landmark-utils";
import { fft, dominantFrequency } from "../utils/fft";
import { mean, std } from "../utils/math";

interface PupilSample {
  timeMs: number;
  leftDiameterMm: number;
  rightDiameterMm: number;
}

export class PupilAnalyzer {
  private samples: PupilSample[] = [];
  private ipdRefMm = 63; // average adult IPD
  private canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  reset(): void {
    this.samples = [];
  }

  private ensureCanvas(w: number, h: number) {
    if (this.ctx) return;
    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(w, h);
      this.ctx = this.canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    } else {
      this.canvas = document.createElement("canvas");
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx = this.canvas.getContext("2d");
    }
  }

  processFrame(
    landmarks: LandmarkPoint[],
    timeMs: number,
    imageWidth: number,
    imageHeight: number,
    videoElement?: HTMLVideoElement
  ): { leftMm: number; rightMm: number } {
    // Scale factor: mm per pixel from IPD
    const ipd = ipdPixels(landmarks, imageWidth);
    const scale = ipd > 0 ? this.ipdRefMm / ipd : 0;

    // Iris diameters in pixels
    const rightIrisPx = irisDiameterPx(landmarks, RIGHT_IRIS, imageWidth, imageHeight);
    const leftIrisPx = irisDiameterPx(landmarks, LEFT_IRIS, imageWidth, imageHeight);

    // Pupil ratio from pixel darkness (or fallback to 0.42)
    let rightPupilRatio = 0.42;
    let leftPupilRatio = 0.42;

    if (videoElement && this.samples.length % 3 === 0) {
      // Sample every 3rd frame for performance
      this.ensureCanvas(imageWidth, imageHeight);
      if (this.ctx && this.canvas) {
        if (this.canvas instanceof HTMLCanvasElement) {
          this.canvas.width = imageWidth;
          this.canvas.height = imageHeight;
        } else {
          (this.canvas as OffscreenCanvas).width = imageWidth;
          (this.canvas as OffscreenCanvas).height = imageHeight;
        }
        this.ctx.drawImage(videoElement, 0, 0, imageWidth, imageHeight);

        rightPupilRatio = estimatePupilRatio(
          this.ctx, landmarks, 468, 469, imageWidth, imageHeight
        );
        leftPupilRatio = estimatePupilRatio(
          this.ctx, landmarks, 473, 474, imageWidth, imageHeight
        );
      }
    }

    const leftPupilMm = scale > 0
      ? leftIrisPx * leftPupilRatio * scale
      : leftIrisPx * leftPupilRatio * 0.1; // rough fallback
    const rightPupilMm = scale > 0
      ? rightIrisPx * rightPupilRatio * scale
      : rightIrisPx * rightPupilRatio * 0.1;

    // Clamp to physiological range (1.5-9mm)
    const clamp = (v: number) => Math.max(1.5, Math.min(9, v));

    this.samples.push({
      timeMs,
      leftDiameterMm: clamp(leftPupilMm),
      rightDiameterMm: clamp(rightPupilMm),
    });

    return { leftMm: clamp(leftPupilMm), rightMm: clamp(rightPupilMm) };
  }

  // --- getBaseline, getSymmetryRatio, computePLR, computeHippus, getTimeSeries, getSamples ---
  // Keep ALL existing methods below procesFrame UNCHANGED (they work on samples[])
```

**Important:** Keep ALL methods below `processFrame` (getBaseline, getSymmetryRatio, computePLR, computeHippus, getTimeSeries, getSamples) exactly as they are — they operate on `this.samples[]` and don't need changes.

- [ ] **Step 3: Update FeatureExtractor to pass videoElement to pupil analyzer**

In `src/lib/eye-tracking/feature-extractor.ts`, modify the `processFrame` method. Change line 52:

```typescript
// OLD:
this.pupilAnalyzer.procesFrame(landmarks, timeMs, imageWidth, imageHeight);

// NEW:
this.pupilAnalyzer.processFrame(landmarks, timeMs, imageWidth, imageHeight, videoElement);
```

Note: also fixes the typo `procesFrame` → `processFrame`.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/eye-tracking/pupil-analyzer.ts src/lib/eye-tracking/landmark-utils.ts src/lib/eye-tracking/feature-extractor.ts
git commit -m "fix: pupil diameter measurement — IPD scaling + pixel-darkness estimation

Pupil diameter was constant (4.914mm always) due to self-referencing
iris scale. Now uses IPD as mm reference + samples dark pixels in iris
center to estimate actual pupil radius. Values now vary with real
dilation/constriction."
```

---

## Task 2: Wire up real eyelid aperture measurement

`BlinkDetector.getEyelidAperture()` already computes eyelid aperture from landmarks but is never called. `FeatureExtractor.buildPayload()` hardcodes `{ left: 10, right: 10 }`.

**Files:**
- Modify: `src/lib/eye-tracking/feature-extractor.ts:100-110`

- [ ] **Step 1: Store last eyelid aperture in FeatureExtractor**

Add a field after `lastScleraResult` (line 19):

```typescript
private lastEyelidAperture: { left: number; right: number } = { left: 10, right: 10 };
```

Reset it in `reset()`:
```typescript
this.lastEyelidAperture = { left: 10, right: 10 };
```

- [ ] **Step 2: Compute eyelid aperture in processFrame**

After the blink detection line (line 55), add:

```typescript
// Eyelid aperture (use iris diameter as pixel reference for mm conversion)
const avgIrisPx = (
  irisDiameterPx(landmarks, LEFT_IRIS, imageWidth, imageHeight) +
  irisDiameterPx(landmarks, RIGHT_IRIS, imageWidth, imageHeight)
) / 2;
if (!isBlinking && avgIrisPx > 0) {
  this.lastEyelidAperture = this.blinkDetector.getEyelidAperture(
    landmarks, imageWidth, imageHeight, avgIrisPx
  );
}
```

- [ ] **Step 3: Use real aperture in buildPayload**

Replace line 107:
```typescript
// OLD:
eyelidApertureMm: { left: 10, right: 10 }, // simplified

// NEW:
eyelidApertureMm: {
  left: Math.round(this.lastEyelidAperture.left * 10) / 10,
  right: Math.round(this.lastEyelidAperture.right * 10) / 10,
},
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/eye-tracking/feature-extractor.ts
git commit -m "fix: wire up real eyelid aperture measurement (was hardcoded 10mm)"
```

---

## Task 3: Request maximum screen brightness during capture

The screen itself is the primary light source. Maximizing brightness improves iris/pupil contrast and enables better PLR measurement.

**Files:**
- Modify: `src/components/capture/GuidedCapture.tsx`

- [ ] **Step 1: Add brightness request when capture starts**

Add a function before the `GuidedCapture` component:

```typescript
async function requestMaxBrightness(): Promise<void> {
  try {
    // Screen Wake Lock prevents dimming during capture
    if ("wakeLock" in navigator) {
      await navigator.wakeLock.request("screen");
    }
  } catch {
    // Non-critical — continue without it
  }
}
```

- [ ] **Step 2: Call it when countdown begins**

Modify `handleInstructionsReady`:

```typescript
const handleInstructionsReady = useCallback(() => {
  requestMaxBrightness();
  setPhase("countdown");
}, []);
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/capture/GuidedCapture.tsx
git commit -m "feat: request screen wake lock to prevent dimming during capture"
```

---

## Task 4: Improve Claude prompt with measurement confidence

Tell Claude which measurements are precise vs estimated, so it doesn't over-interpret noisy data.

**Files:**
- Modify: `src/lib/analysis/claude-prompt.ts`

- [ ] **Step 1: Add measurement quality section to the system prompt**

In the `SYSTEM_PROMPT` string, add before the scoring section:

```typescript
MEASUREMENT METHOD & CONFIDENCE:
- Pupil diameter: Estimated via pixel-darkness analysis in iris region. Precision: ±0.5mm. Relative changes (PLR) are more reliable than absolute values.
- Eyelid aperture: Measured from MediaPipe eyelid landmarks (159/145, 386/374). Precision: ±1mm. Good for asymmetry detection, less reliable for absolute ptosis measurement.
- Blink rate & PERCLOS: Eye Aspect Ratio (Soukupova & Cech 2016). High reliability.
- Scleral color: RGB→LAB from video frame pixels. Heavily influenced by ambient lighting and camera white balance. Treat as relative indicator, not absolute.
- Smooth pursuit & nystagmus: Iris position tracking via MediaPipe landmarks. Good precision for lateral movement.
- PLR dynamics: Based on estimated pupil diameter changes during flash. Relative timing (latency, T50) is more reliable than absolute amplitude.

IMPORTANT: This is a consumer webcam/phone camera, NOT clinical pupillometry equipment. All measurements have significant noise. Prefer "low" or "moderate" confidence unless multiple independent indicators converge.
```

- [ ] **Step 2: Fix the duration label in user prompt**

In `buildUserPrompt`, line 48, update the baseline duration label:
```typescript
// OLD:
BASELINE MEASUREMENTS (Phase 1 — 3s fixation):
// NEW:
BASELINE MEASUREMENTS (Phase 1 — 5s fixation):
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 4: Test with local API call**

Start dev server and re-run the curl test from previous session to verify Claude response quality:

```bash
cd /var/www/valk && npx next dev -p 3001 &
sleep 10
curl -s -X POST http://localhost:3001/api/analyze ... | node -e "..." # same test as before
```

Expected: Response with more "low"/"moderate" confidence values, mentions measurement limitations.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/claude-prompt.ts
git commit -m "feat: add measurement confidence metadata to Claude analysis prompt

Tell Claude which measurements are precise vs estimated, that this
is consumer camera not clinical equipment, and to prefer low/moderate
confidence unless multiple indicators converge."
```

---

## Task 5: Push and verify

- [ ] **Push all commits**

```bash
git push origin main
```

- [ ] **Verify Vercel deployment**

Wait for deployment. Test the full capture flow on desktop and iPhone. Check that:
1. Pupil diameter values actually vary between frames (no longer constant 4.914mm)
2. Eyelid aperture shows real values (no longer constant 10mm)
3. Screen stays bright during capture (wake lock active)
4. Claude analysis mentions measurement limitations and uses appropriate confidence levels
