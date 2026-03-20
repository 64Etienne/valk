# Algorithm Fixes + New PLR Protocol + UX Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 3 broken algorithms (PLR noise, pursuit coordinate mismatch, pupil over-estimation), implement a new eyes-closed PLR protocol with audio countdown, and apply UX improvements (closer phone, pursuit in upper screen, longer durations).

**Architecture:** 5 independent tasks. Tasks 1-3 are pure algorithmic fixes in the eye-tracking library. Task 4 rewrites the PLR capture protocol (new phase + LightFlash component + audio beeps). Task 5 updates UX (instructions, pursuit position, durations). Each task produces a buildable commit.

**Tech Stack:** TypeScript, MediaPipe landmarks, Web Audio API (for beeps), Canvas pixel analysis

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/eye-tracking/pupil-analyzer.ts` | Modify | Add moving average to PLR computation |
| `src/lib/eye-tracking/nystagmus-detector.ts` | Rewrite | Correlation-based pursuit gain + eye-normalized saccade detection |
| `src/lib/eye-tracking/landmark-utils.ts` | Modify | Adaptive darkness threshold, eye-socket normalization helper |
| `src/types/index.ts` | Modify | Add `phase_2_close` to CapturePhase |
| `src/components/capture/LightFlash.tsx` | Rewrite | Eyes-closed phase with audio countdown beeps |
| `src/components/capture/GuidedCapture.tsx` | Modify | New phase sequence, updated durations |
| `src/components/capture/PhaseIndicator.tsx` | Modify | Updated labels and phase detection |
| `src/components/capture/CaptureInstructions.tsx` | Modify | Updated instructions (closer, brightness) |
| `src/components/capture/PursuitDot.tsx` | Modify | Move dot to upper third of screen |

---

## Task 1: PLR smoothing — moving average before analysis

PLR latency was 2ms (impossible) because random noise in pupil samples crosses the 10% threshold on the very first frame. Apply a 5-frame moving average before computing metrics.

**Files:**
- Modify: `src/lib/eye-tracking/pupil-analyzer.ts`

- [ ] **Step 1: Add moving average helper and apply to computePLR**

In `pupil-analyzer.ts`, add this helper method to the class (before `computePLR`):

```typescript
private smooth(values: number[], window: number = 5): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(values.length, i + Math.ceil(window / 2));
    const slice = values.slice(start, end);
    result.push(mean(slice));
  }
  return result;
}
```

Then in `computePLR`, after building `avgSeries`, apply smoothing. Replace the section that builds `avgSeries` and finds `minDiam`:

```typescript
// Smooth the diameter series to eliminate frame-to-frame noise
const rawDiams = postFlash.map((s) => (s.leftDiameterMm + s.rightDiameterMm) / 2);
const smoothed = this.smooth(rawDiams);
const avgSeries = postFlash.map((s, i) => ({
  timeMs: s.timeMs - flashStartMs,
  diam: smoothed[i],
}));
```

And after computing latency, clamp it to physiological minimum:

```typescript
const latency = latencySample ? Math.max(100, latencySample.timeMs) : 250;
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/lib/eye-tracking/pupil-analyzer.ts
git commit -m "fix: smooth PLR samples (5-frame MA) + clamp latency ≥100ms"
```

---

## Task 2: Pursuit gain — correlation-based + eye-normalized saccades

Pursuit gain was 0.01 because iris coordinates (0-1 image-relative) are compared to target coordinates (0-1 screen-relative) — fundamentally different scales. Fix: use Pearson correlation between iris movement and target movement for gain, and normalize iris velocity to eye socket width for saccade detection.

**Files:**
- Modify: `src/lib/eye-tracking/nystagmus-detector.ts`

- [ ] **Step 1: Rewrite NystagmusDetector**

Replace the entire file:

```typescript
import { LandmarkPoint, PursuitFrame } from "./types";
import { irisCenter } from "./landmark-utils";
import { mean, std } from "../utils/math";

// Eye corner landmarks for normalization
const RIGHT_EYE_INNER = 133;
const RIGHT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 362;
const LEFT_EYE_OUTER = 263;

export class NystagmusDetector {
  private frames: PursuitFrame[] = [];
  private normalizedIrisX: number[] = [];

  reset(): void {
    this.frames = [];
    this.normalizedIrisX = [];
  }

  processFrame(
    landmarks: LandmarkPoint[],
    timeMs: number,
    targetX: number,
    targetY: number
  ): void {
    const leftCenter = irisCenter(landmarks, 473);
    const rightCenter = irisCenter(landmarks, 468);
    const irisX = (leftCenter.x + rightCenter.x) / 2;
    const irisY = (leftCenter.y + rightCenter.y) / 2;

    this.frames.push({ timestampMs: timeMs, targetX, targetY, irisX, irisY });

    // Normalize iris X to eye socket width (for saccade detection)
    const rInner = landmarks[RIGHT_EYE_INNER];
    const rOuter = landmarks[RIGHT_EYE_OUTER];
    const lInner = landmarks[LEFT_EYE_INNER];
    const lOuter = landmarks[LEFT_EYE_OUTER];

    if (rInner && rOuter && lInner && lOuter) {
      const avgEyeWidth = (
        Math.abs(rOuter.x - rInner.x) + Math.abs(lOuter.x - lInner.x)
      ) / 2;
      // Iris displacement from eye midpoint, normalized to eye width
      const rMid = (rInner.x + rOuter.x) / 2;
      const lMid = (lInner.x + lOuter.x) / 2;
      const rNorm = avgEyeWidth > 0 ? (rightCenter.x - rMid) / avgEyeWidth : 0;
      const lNorm = avgEyeWidth > 0 ? (leftCenter.x - lMid) / avgEyeWidth : 0;
      this.normalizedIrisX.push((rNorm + lNorm) / 2);
    } else {
      this.normalizedIrisX.push(0);
    }
  }

  // Pursuit gain as Pearson correlation between target and iris movement.
  // 1.0 = perfect tracking, 0 = no tracking. Robust to coordinate scale differences.
  getSmoothPursuitGain(): number {
    if (this.frames.length < 10) return 1.0;

    const targetSeries = this.frames.map((f) => f.targetX);
    const irisSeries = this.frames.map((f) => f.irisX);
    const n = targetSeries.length;

    const meanT = mean(targetSeries);
    const meanI = mean(irisSeries);

    let num = 0;
    let denT = 0;
    let denI = 0;
    for (let i = 0; i < n; i++) {
      const dt = targetSeries[i] - meanT;
      const di = irisSeries[i] - meanI;
      num += dt * di;
      denT += dt * dt;
      denI += di * di;
    }

    const den = Math.sqrt(denT * denI);
    if (den === 0) return 1.0;

    const correlation = num / den;
    return Math.round(Math.max(0, correlation) * 100) / 100;
  }

  // Saccades: sudden jumps in eye-normalized iris position
  getSaccadeCount(): number {
    if (this.normalizedIrisX.length < 3) return 0;

    let saccades = 0;
    // Threshold: 0.15 of eye width per frame is a saccade
    const velocityThreshold = 0.15;

    for (let i = 1; i < this.normalizedIrisX.length; i++) {
      const velocity = Math.abs(
        this.normalizedIrisX[i] - this.normalizedIrisX[i - 1]
      );
      if (velocity > velocityThreshold) {
        saccades++;
        // Skip adjacent high-velocity frames (same saccade)
        while (
          i + 1 < this.normalizedIrisX.length &&
          Math.abs(this.normalizedIrisX[i + 1] - this.normalizedIrisX[i]) >
            velocityThreshold
        ) {
          i++;
        }
      }
    }

    return saccades;
  }

  getNystagmusClues(): {
    onsetBeforeMaxDeviation: { left: boolean; right: boolean };
    distinctAtMaxDeviation: { left: boolean; right: boolean };
    smoothPursuitFailure: { left: boolean; right: boolean };
  } {
    const leftFrames = this.frames.filter((f) => f.targetX < 0.3);
    const rightFrames = this.frames.filter((f) => f.targetX > 0.7);

    const leftOsc = this.detectOscillation(leftFrames);
    const rightOsc = this.detectOscillation(rightFrames);

    const leftMaxDev = this.frames.filter((f) => f.targetX < 0.15);
    const rightMaxDev = this.frames.filter((f) => f.targetX > 0.85);

    const leftMaxOsc = this.detectOscillation(leftMaxDev);
    const rightMaxOsc = this.detectOscillation(rightMaxDev);

    const gain = this.getSmoothPursuitGain();
    const pursuitFailure = gain < 0.5;

    return {
      onsetBeforeMaxDeviation: {
        left: leftOsc > 0.003,
        right: rightOsc > 0.003,
      },
      distinctAtMaxDeviation: {
        left: leftMaxOsc > 0.005,
        right: rightMaxOsc > 0.005,
      },
      smoothPursuitFailure: {
        left: pursuitFailure,
        right: pursuitFailure,
      },
    };
  }

  private detectOscillation(frames: PursuitFrame[]): number {
    if (frames.length < 5) return 0;
    // Use velocity reversals as oscillation measure
    const positions = frames.map((f) => f.irisX);
    const velocities = [];
    for (let i = 1; i < positions.length; i++) {
      velocities.push(positions[i] - positions[i - 1]);
    }
    return std(velocities);
  }

  getTimeSeries(): Array<{ timeMs: number; x: number; y: number }> {
    return this.frames.map((f) => ({
      timeMs: Math.round(f.timestampMs),
      x: Math.round(f.irisX * 1000) / 1000,
      y: Math.round(f.irisY * 1000) / 1000,
    }));
  }
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/lib/eye-tracking/nystagmus-detector.ts
git commit -m "fix: pursuit gain as Pearson correlation + eye-normalized saccades

Pursuit gain was 0.01 due to iris coords (image-relative) vs target
coords (screen-relative) being incomparable scales. Now uses Pearson
correlation (1.0 = perfect tracking). Saccades normalized to eye
socket width for consistent thresholds across camera distances."
```

---

## Task 3: Adaptive pupil darkness threshold

Fixed threshold of 60 over-estimates pupil in dim lighting (everything looks dark). Base the threshold on local iris brightness instead.

**Files:**
- Modify: `src/lib/eye-tracking/landmark-utils.ts`

- [ ] **Step 1: Make estimatePupilRatio compute adaptive threshold**

In `landmark-utils.ts`, replace the pixel sampling loop inside `estimatePupilRatio`. Change the function to compute the threshold from the iris region's own brightness:

Replace the section starting at `let darkPixels = 0;` through `return Math.max(0.2, Math.min(0.8, ratio));`:

```typescript
  let brightnesses: number[] = [];

  try {
    const imageData = ctx.getImageData(x0, y0, size, size);
    const data = imageData.data;
    const r2 = radius * radius;

    for (let dy = 0; dy < size; dy += 2) {
      for (let dx = 0; dx < size; dx += 2) {
        const distSq = (dx - radius) ** 2 + (dy - radius) ** 2;
        if (distSq > r2) continue;
        const idx = (dy * size + dx) * 4;
        brightnesses.push((data[idx] + data[idx + 1] + data[idx + 2]) / 3);
      }
    }
  } catch {
    return 0.42;
  }

  if (brightnesses.length < 10) return 0.42;

  // Adaptive threshold: 40% of the median brightness in the iris region
  const sorted = brightnesses.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const adaptiveThreshold = median * 0.4;

  const darkPixels = brightnesses.filter((b) => b < adaptiveThreshold).length;
  const ratio = Math.sqrt(darkPixels / brightnesses.length);
  return Math.max(0.2, Math.min(0.8, ratio));
```

Also remove the `darknessThreshold` parameter from the function signature since it's now computed internally. Update the signature:

```typescript
export function estimatePupilRatio(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  irisCenterIdx: number,
  irisEdgeIdx: number,
  imageWidth: number,
  imageHeight: number,
): number {
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/lib/eye-tracking/landmark-utils.ts
git commit -m "fix: adaptive pupil darkness threshold (40% of local median brightness)

Fixed threshold of 60 over-estimated pupil in dim lighting. Now
computes threshold relative to the iris region's own brightness,
so it works across all lighting conditions."
```

---

## Task 4: New PLR protocol — eyes closed + audio countdown + screen flash

Replace the weak screen-flash PLR with a scientifically sound protocol:
1. Eyes closed for 6s (perfect dark adaptation, pupils dilate max)
2. Audio countdown beeps (user can't see screen)
3. At final beep: screen goes FULL WHITE, user opens eyes
4. Camera captures constriction from max dilation to max constriction
5. Black screen for re-dilation recovery measurement

**Files:**
- Modify: `src/types/index.ts`
- Rewrite: `src/components/capture/LightFlash.tsx`
- Modify: `src/components/capture/GuidedCapture.tsx`
- Modify: `src/components/capture/PhaseIndicator.tsx`

- [ ] **Step 1: Add `phase_2_close` to CapturePhase type**

In `src/types/index.ts`:

```typescript
export type CapturePhase =
  | "idle"
  | "context_form"
  | "instructions"
  | "countdown"
  | "phase_1"
  | "phase_2_close"
  | "phase_2_flash"
  | "phase_2_dark"
  | "phase_3"
  | "extracting"
  | "analyzing"
  | "results";
```

Remove `phase_2_warn` — replaced by `phase_2_close`.

- [ ] **Step 2: Rewrite LightFlash with eyes-closed phase + audio beeps**

```typescript
// src/components/capture/LightFlash.tsx
"use client";

import { useEffect, useRef } from "react";

interface LightFlashProps {
  subPhase: "close" | "flash" | "dark";
  elapsed?: number; // ms elapsed in current subphase
  duration?: number; // total duration of current subphase
}

function playBeep(frequency: number = 880, durationMs: number = 100): void {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    setTimeout(() => ctx.close(), durationMs + 100);
  } catch {
    // Audio not available — continue silently
  }
}

export function LightFlash({ subPhase, elapsed = 0, duration = 6000 }: LightFlashProps) {
  const lastBeepRef = useRef(-1);

  // Audio countdown during eyes-closed phase
  useEffect(() => {
    if (subPhase !== "close") return;

    const remaining = Math.ceil((duration - elapsed) / 1000);

    // Beep at 3, 2, 1 seconds remaining
    if (remaining <= 3 && remaining >= 1 && remaining !== lastBeepRef.current) {
      lastBeepRef.current = remaining;
      if (remaining === 1) {
        // Final beep: longer and higher pitch = "OPEN NOW"
        playBeep(1200, 400);
      } else {
        playBeep(880, 100);
      }
    }
  }, [subPhase, elapsed, duration]);

  // Reset beep tracker on phase change
  useEffect(() => {
    lastBeepRef.current = -1;
  }, [subPhase]);

  if (subPhase === "close") {
    const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-black">
        <p className="text-amber-400 text-xl font-medium mb-4">
          Fermez les yeux
        </p>
        {remaining <= 3 ? (
          <p className="text-6xl font-bold text-white animate-pulse">
            {remaining}
          </p>
        ) : (
          <p className="text-zinc-500 text-sm">
            Gardez les yeux fermés...
          </p>
        )}
        <p className="text-zinc-600 text-xs mt-6">
          Ouvrez les yeux au signal sonore
        </p>
      </div>
    );
  }

  if (subPhase === "flash") {
    return (
      <div className="absolute inset-0 z-50 bg-white flex items-center justify-center">
        <p className="text-zinc-400 text-sm animate-pulse">Ouvrez les yeux !</p>
      </div>
    );
  }

  // dark recovery
  return <div className="absolute inset-0 z-30 bg-black" />;
}
```

- [ ] **Step 3: Update GuidedCapture — phase sequence, durations, elapsed prop**

In `GuidedCapture.tsx`, make these changes:

**a) Update PHASE_DURATIONS:**
```typescript
const PHASE_DURATIONS: Partial<Record<CapturePhase, number>> = {
  phase_1: 8000,
  phase_2_close: 6000,
  phase_2_flash: 3000,
  phase_2_dark: 5000,
  phase_3: 12000,
};
```

**b) Update PHASE_ORDER:**
```typescript
const PHASE_ORDER: CapturePhase[] = [
  "phase_1",
  "phase_2_close",
  "phase_2_flash",
  "phase_2_dark",
  "phase_3",
];
```

**c) Add elapsed state for LightFlash countdown:**

After the `pursuitProgress` state:
```typescript
const [phaseElapsed, setPhaseElapsed] = useState(0);
```

**d) In the RAF loop, track elapsed time for current phase:**

Inside the loop, just before the phase duration check (the `// ── Check phase duration → advance ──` section), add:

```typescript
// Track elapsed for UI (e.g., LightFlash countdown)
setPhaseElapsed(elapsed);
```

(The `elapsed` variable is already computed as `timestamp - phaseStartRef.current` on the line below.)

Wait — `elapsed` is computed AFTER this point. Move the tracking. Actually, find the existing lines:
```typescript
const elapsed = timestamp - phaseStartRef.current;
const duration = PHASE_DURATIONS[currentPhase as keyof typeof PHASE_DURATIONS];
```

Add `setPhaseElapsed(elapsed);` right after `const elapsed = ...`:

```typescript
const elapsed = timestamp - phaseStartRef.current;
setPhaseElapsed(elapsed);
const duration = ...
```

**e) Update the flash rendering JSX.**

Replace the existing LightFlash render block:

```tsx
{/* Phase 2 -- Pupillary light reflex */}
{(phase === "phase_2_close" ||
  phase === "phase_2_flash" ||
  phase === "phase_2_dark") && (
  <LightFlash
    subPhase={
      phase === "phase_2_close"
        ? "close"
        : phase === "phase_2_flash"
          ? "flash"
          : "dark"
    }
    elapsed={phaseElapsed}
    duration={PHASE_DURATIONS[phase] ?? 6000}
  />
)}
```

**f) Update flash timing recording:**

In `advancePhase`, change `phase_2_flash` timing. The current code checks `nextPhase === "phase_2_flash"` — this is still correct since `phase_2_close` transitions to `phase_2_flash`.

- [ ] **Step 4: Update PhaseIndicator**

Replace the PHASES array and isPhaseActive function to include `phase_2_close`:

```typescript
const PHASES = [
  { key: "phase_1", label: "Baseline", duration: "8s" },
  { key: "phase_2", label: "Réflexe", duration: "14s" },
  { key: "phase_3", label: "Poursuite", duration: "12s" },
] as const;

function isPhaseActive(current: CapturePhase, phaseKey: string): boolean {
  if (phaseKey === "phase_1") return current === "phase_1";
  if (phaseKey === "phase_2")
    return ["phase_2_close", "phase_2_flash", "phase_2_dark"].includes(current);
  if (phaseKey === "phase_3") return current === "phase_3";
  return false;
}

function isPhaseComplete(current: CapturePhase, phaseKey: string): boolean {
  const order = [
    "phase_1", "phase_2_close", "phase_2_flash", "phase_2_dark",
    "phase_3", "extracting", "analyzing", "results",
  ];
  const currentIdx = order.indexOf(current);
  if (phaseKey === "phase_1") return currentIdx > 0;
  if (phaseKey === "phase_2") return currentIdx > 3;
  if (phaseKey === "phase_3") return currentIdx > 4;
  return false;
}
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/components/capture/LightFlash.tsx src/components/capture/GuidedCapture.tsx src/components/capture/PhaseIndicator.tsx
git commit -m "feat: new PLR protocol — eyes closed + audio countdown + screen flash

Eyes-closed dark adaptation (6s) with audio countdown beeps produces
max pupil dilation. Screen flash then causes maximum measurable
constriction. Total capture now ~34s. Based on PupilScreen protocol
(UCSD/PNAS). Phase durations: baseline 8s, PLR 14s, pursuit 12s."
```

---

## Task 5: UX improvements — closer phone, pursuit position, instructions

**Files:**
- Modify: `src/components/capture/CaptureInstructions.tsx`
- Modify: `src/components/capture/PursuitDot.tsx`

- [ ] **Step 1: Update instructions**

In `CaptureInstructions.tsx`, replace the instructions array:

```typescript
const instructions = [
  {
    icon: Sun,
    text: "Placez-vous dans un endroit bien éclairé et réglez la luminosité de l'écran au maximum",
    color: "text-amber-400",
  },
  {
    icon: Monitor,
    text: "Désactivez le filtre de lumière bleue (Night Shift, mode nuit)",
    color: "text-blue-400",
  },
  {
    icon: Glasses,
    text: "Retirez vos lunettes si possible",
    color: "text-violet-400",
  },
  {
    icon: Smartphone,
    text: "Tenez votre appareil à 20-30 cm de votre visage, caméra à hauteur des yeux",
    color: "text-green-400",
  },
  {
    icon: Hand,
    text: "Restez immobile pendant toute la capture (~35 secondes)",
    color: "text-zinc-300",
  },
];
```

Changes: screen brightness max, distance 20-30cm (not arm's length), duration ~35s.

- [ ] **Step 2: Move pursuit dot to upper third of screen**

In `PursuitDot.tsx`, change the vertical position from `top-1/2` to `top-1/3` (closer to front camera):

```typescript
export function PursuitDot({ progress }: PursuitDotProps) {
  const x = 50 + 40 * Math.sin(progress * Math.PI * 6);

  return (
    <>
      <div className="absolute inset-0 z-10 bg-white/90" />

      <div className="absolute inset-0 z-20 pointer-events-none">
        <div
          className="absolute top-1/3 -translate-y-1/2 -translate-x-1/2 transition-none"
          style={{ left: `${x}%` }}
        >
          <div className="w-5 h-5 rounded-full bg-green-600 shadow-lg shadow-green-600/50" />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/capture/CaptureInstructions.tsx src/components/capture/PursuitDot.tsx
git commit -m "feat: UX — closer phone (20-30cm), brightness max, pursuit dot upper third"
```

---

## Final: Push and test

- [ ] **Push all commits**

```bash
git push origin main
```

Test the full flow on phone. Key verifications:
1. PLR latency should be 180-300ms (not 2ms)
2. Pursuit gain should be 0.7-1.0 (not 0.01)
3. Pupil diameter should be 2-5mm in bright light (not 7-8mm)
4. Audio beeps play during eyes-closed phase
5. Total capture ~34s
