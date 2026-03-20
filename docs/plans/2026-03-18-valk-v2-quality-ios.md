# Valk v2: iOS Fix + Capture Quality + UX Guidance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix iPhone infinite loading, fix broken sleep calculation, add pre-capture guidance and face positioning overlay, increase capture duration, and improve pursuit phase visual conditions.

**Architecture:** 6 independent tasks touching camera init, MediaPipe setup, context form, capture flow UI, phase timing, and pursuit overlay. Each task produces a working commit. No new dependencies. All changes are in existing files except one new component (CaptureInstructions) and one new component (FaceGuideOval).

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind 4, @mediapipe/tasks-vision 0.10.x

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/eye-tracking/mediapipe-setup.ts` | Modify | GPU→CPU fallback, pin WASM version |
| `src/lib/hooks/useMediaPipe.ts` | Modify | Add timeout to load(), expose delegate info |
| `src/lib/utils/camera.ts` | Modify | Mobile-aware constraints |
| `src/components/capture/ContextForm.tsx` | Modify | Fix hoursSinceLastSleep, add hoursAwake field |
| `src/types/index.ts` | Modify | Update UserContext if needed |
| `src/components/capture/CaptureInstructions.tsx` | Create | Pre-capture checklist screen |
| `src/components/capture/FaceGuideOval.tsx` | Create | SVG oval overlay for face positioning |
| `src/components/capture/CaptureCountdown.tsx` | Modify | Integrate FaceGuideOval |
| `src/components/capture/GuidedCapture.tsx` | Modify | Add instructions phase, update durations, integrate guide |
| `src/components/capture/PursuitDot.tsx` | Modify | Add white background option |

---

## Task 1: Fix iPhone — MediaPipe GPU fallback + pinned WASM

The root cause of iPhone infinite loading: `delegate: "GPU"` is hardcoded. iOS Safari has limited WebGL2 support — GPU init silently fails, CPU fallback is extremely slow, and the `@latest` WASM URL can break between CDN updates.

**Files:**
- Modify: `src/lib/eye-tracking/mediapipe-setup.ts`
- Modify: `src/lib/hooks/useMediaPipe.ts`

- [ ] **Step 1: Rewrite mediapipe-setup.ts with GPU→CPU fallback**

Replace the entire `initFaceLandmarker` function. Try GPU first, catch and retry with CPU. Pin WASM to the installed package version instead of `@latest`.

```typescript
// src/lib/eye-tracking/mediapipe-setup.ts
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let faceLandmarker: FaceLandmarker | null = null;
let isLoading = false;
let activeDelegate: "GPU" | "CPU" = "GPU";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const LANDMARKER_OPTIONS = {
  runningMode: "VIDEO" as const,
  numFaces: 1,
  outputFaceBlendshapes: false,
  outputFacialTransformationMatrixes: false,
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

async function createLandmarker(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  delegate: "GPU" | "CPU"
): Promise<FaceLandmarker> {
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    ...LANDMARKER_OPTIONS,
  });
}

export async function initFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarker) return faceLandmarker;
  if (isLoading) {
    while (isLoading) await new Promise((r) => setTimeout(r, 100));
    if (faceLandmarker) return faceLandmarker;
  }

  isLoading = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);

    // Try GPU first, fall back to CPU (critical for iOS Safari)
    try {
      faceLandmarker = await createLandmarker(vision, "GPU");
      activeDelegate = "GPU";
    } catch {
      console.warn("GPU delegate failed, falling back to CPU");
      faceLandmarker = await createLandmarker(vision, "CPU");
      activeDelegate = "CPU";
    }

    return faceLandmarker;
  } finally {
    isLoading = false;
  }
}

export function getActiveDelegate(): "GPU" | "CPU" {
  return activeDelegate;
}

export function getFaceLandmarker(): FaceLandmarker | null {
  return faceLandmarker;
}

export function closeFaceLandmarker(): void {
  faceLandmarker?.close();
  faceLandmarker = null;
}
```

- [ ] **Step 2: Add 30s timeout to useMediaPipe.load()**

Wrap the load call with a timeout so the app never hangs indefinitely on slow devices.

In `src/lib/hooks/useMediaPipe.ts`, modify the `load` callback:

```typescript
const load = useCallback(async () => {
  if (isLoaded || isLoading) return;
  setIsLoading(true);
  setError(null);

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 30_000)
    );
    const landmarker = await Promise.race([initFaceLandmarker(), timeout]);
    landmarkerRef.current = landmarker;
    setIsLoaded(true);
  } catch (err) {
    const msg =
      err instanceof Error && err.message === "timeout"
        ? "Le modèle prend trop de temps à charger. Essayez de recharger la page."
        : "Impossible de charger le modèle de détection faciale.";
    setError(msg);
    console.error("MediaPipe init error:", err);
  } finally {
    setIsLoading(false);
  }
}, [isLoaded, isLoading]);
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/eye-tracking/mediapipe-setup.ts src/lib/hooks/useMediaPipe.ts
git commit -m "fix: GPU→CPU fallback for iOS Safari + pinned WASM + load timeout"
```

---

## Task 2: Fix iPhone — Mobile-aware camera constraints

iPhones struggle with 1280x720@30fps constraints. Use conservative defaults on mobile.

**Files:**
- Modify: `src/lib/utils/camera.ts`

- [ ] **Step 1: Add mobile detection and lower constraints**

```typescript
// src/lib/utils/camera.ts
export interface CameraConstraints {
  width?: number;
  height?: number;
  facingMode?: "user" | "environment";
  frameRate?: number;
}

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export async function getCamera(
  constraints: CameraConstraints = {}
): Promise<MediaStream> {
  const mobile = isMobile();
  const {
    width = mobile ? 640 : 1280,
    height = mobile ? 480 : 720,
    facingMode = "user",
    frameRate = mobile ? 24 : 30,
  } = constraints;

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: frameRate },
      },
      audio: false,
    });
  } catch {
    // Fallback: minimal constraints
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode } },
      audio: false,
    });
  }
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function getCameraResolution(
  stream: MediaStream
): { width: number; height: number } {
  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings();
  return { width: settings?.width ?? 0, height: settings?.height ?? 0 };
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils/camera.ts
git commit -m "fix: mobile-aware camera constraints (640x480 on iPhone/Android)"
```

---

## Task 3: Fix ContextForm — broken hoursSinceLastSleep

The current formula `new Date().getHours() + (24 - hoursSleep)` is mathematically wrong (produces values like 32h or 37h). Replace with a direct "hours awake" input.

**Files:**
- Modify: `src/components/capture/ContextForm.tsx`

- [ ] **Step 1: Replace sleep hours field with hours-awake field**

In `ContextForm.tsx`, change the state and form field:

Replace `const [hoursSleep, setHoursSleep] = useState(7);` with:
```typescript
const [hoursAwake, setHoursAwake] = useState(8);
```

Replace the `handleSubmit` calculation (line 25):
```typescript
// OLD: hoursSinceLastSleep: Math.max(0, new Date().getHours() + (24 - hoursSleep)),
// NEW:
hoursSinceLastSleep: hoursAwake,
```

Replace the form field (lines 48-65) — the Moon/sleep section:
```tsx
<div>
  <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
    <Moon className="w-4 h-4 text-violet-400" />
    Heures d'éveil
  </label>
  <div className="flex items-center gap-3">
    <input
      type="range"
      min={0}
      max={36}
      step={0.5}
      value={hoursAwake}
      onChange={(e) => setHoursAwake(parseFloat(e.target.value))}
      className="flex-1 accent-violet-500"
    />
    <span className="text-sm text-zinc-300 w-10 text-right">{hoursAwake}h</span>
  </div>
  <p className="text-xs text-zinc-500 mt-1">Depuis combien de temps êtes-vous éveillé(e) ?</p>
</div>
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/capture/ContextForm.tsx
git commit -m "fix: replace broken sleep formula with direct hours-awake input"
```

---

## Task 4: Pre-capture instructions screen

Add a guidance screen between the context form and countdown. Tells the user how to prepare: lighting, filters, position, glasses.

**Files:**
- Create: `src/components/capture/CaptureInstructions.tsx`
- Modify: `src/components/capture/GuidedCapture.tsx`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add "instructions" to CapturePhase type**

In `src/types/index.ts`, add `"instructions"` between `"context_form"` and `"countdown"`:

```typescript
export type CapturePhase =
  | "idle"
  | "context_form"
  | "instructions"
  | "countdown"
  | "phase_1"
  // ... rest unchanged
```

- [ ] **Step 2: Create CaptureInstructions component**

```typescript
// src/components/capture/CaptureInstructions.tsx
"use client";

import { Sun, Smartphone, Glasses, Monitor, Hand } from "lucide-react";
import { Button } from "../ui/Button";

interface CaptureInstructionsProps {
  onReady: () => void;
}

const instructions = [
  {
    icon: Sun,
    text: "Placez-vous dans un endroit bien éclairé (lumière naturelle ou lampe de face)",
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
    text: "Tenez votre appareil à bout de bras, caméra à hauteur des yeux",
    color: "text-green-400",
  },
  {
    icon: Hand,
    text: "Restez immobile pendant toute la capture (~20 secondes)",
    color: "text-zinc-300",
  },
];

export function CaptureInstructions({ onReady }: CaptureInstructionsProps) {
  return (
    <div className="absolute inset-0 bg-zinc-950/95 z-20 flex items-center justify-center overflow-y-auto">
      <div className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-zinc-100 mb-1">
            Préparez la capture
          </h2>
          <p className="text-sm text-zinc-400">
            Pour des résultats fiables, suivez ces consignes :
          </p>
        </div>

        <ul className="space-y-4">
          {instructions.map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <item.icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${item.color}`} />
              <span className="text-sm text-zinc-300">{item.text}</span>
            </li>
          ))}
        </ul>

        <Button onClick={onReady} size="lg" className="w-full">
          Je suis prêt(e)
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire CaptureInstructions into GuidedCapture**

In `GuidedCapture.tsx`:

a) Add import at top:
```typescript
import { CaptureInstructions } from "./CaptureInstructions";
```

b) Modify `handleContextSubmit` to go to instructions first:
```typescript
const handleContextSubmit = useCallback((ctx: UserContext) => {
  setContext(ctx);
  setPhase("instructions");
}, []);
```

c) Add handler for instructions done:
```typescript
const handleInstructionsReady = useCallback(() => {
  setPhase("countdown");
}, []);
```

d) Add the JSX after the context form overlay block (after line 256):
```tsx
{/* Pre-capture instructions */}
{phase === "instructions" && (
  <CaptureInstructions onReady={handleInstructionsReady} />
)}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/components/capture/CaptureInstructions.tsx src/components/capture/GuidedCapture.tsx
git commit -m "feat: add pre-capture instructions screen (lighting, filters, position)"
```

---

## Task 5: Face positioning oval guide

Add an SVG oval overlay during countdown to help users center their face.

**Files:**
- Create: `src/components/capture/FaceGuideOval.tsx`
- Modify: `src/components/capture/CaptureCountdown.tsx`

- [ ] **Step 1: Create FaceGuideOval component**

```typescript
// src/components/capture/FaceGuideOval.tsx
"use client";

interface FaceGuideOvalProps {
  detected: boolean;
}

export function FaceGuideOval({ detected }: FaceGuideOvalProps) {
  const color = detected ? "#22c55e" : "#f59e0b"; // green-500 / amber-500
  const glowColor = detected
    ? "rgba(34, 197, 94, 0.15)"
    : "rgba(245, 158, 11, 0.1)";

  return (
    <svg
      viewBox="0 0 200 280"
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      style={{ width: "45vmin", height: "63vmin", maxWidth: 260, maxHeight: 364 }}
    >
      <ellipse
        cx="100"
        cy="140"
        rx="80"
        ry="120"
        fill={glowColor}
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={detected ? "none" : "8 6"}
        className="transition-all duration-300"
      />
      {/* Eye-level markers */}
      <line
        x1="40" y1="120" x2="60" y2="120"
        stroke={color} strokeWidth="1.5" opacity="0.5"
      />
      <line
        x1="140" y1="120" x2="160" y2="120"
        stroke={color} strokeWidth="1.5" opacity="0.5"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Integrate into CaptureCountdown**

Replace the entire `CaptureCountdown.tsx`:

```typescript
// src/components/capture/CaptureCountdown.tsx
"use client";

import { useEffect, useState } from "react";
import { FaceGuideOval } from "./FaceGuideOval";

interface CaptureCountdownProps {
  onComplete: () => void;
  faceDetected: boolean;
}

export function CaptureCountdown({
  onComplete,
  faceDetected,
}: CaptureCountdownProps) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (!faceDetected) return;

    if (count === 0) {
      onComplete();
      return;
    }

    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, faceDetected, onComplete]);

  return (
    <div className="absolute inset-0 z-20">
      {/* Semi-transparent overlay with oval cutout effect */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Face guide oval */}
      <FaceGuideOval detected={faceDetected} />

      {/* Status text */}
      <div className="absolute bottom-16 left-0 right-0 text-center z-30">
        {!faceDetected ? (
          <p className="text-amber-400 text-base font-medium">
            Centrez votre visage dans l'ovale
          </p>
        ) : (
          <div>
            <p className="text-8xl font-bold text-green-400 animate-pulse">
              {count}
            </p>
            <p className="text-zinc-400 mt-2">Restez immobile...</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/capture/FaceGuideOval.tsx src/components/capture/CaptureCountdown.tsx
git commit -m "feat: add face positioning oval guide during countdown"
```

---

## Task 6: Increase phase durations for better data quality

Current 13s is too short for reliable analysis. Extend to ~22s.

**Files:**
- Modify: `src/components/capture/GuidedCapture.tsx`

- [ ] **Step 1: Update PHASE_DURATIONS**

In `GuidedCapture.tsx`, replace the PHASE_DURATIONS object (lines 22-28):

```typescript
const PHASE_DURATIONS: Partial<Record<CapturePhase, number>> = {
  phase_1: 5000,        // was 3000 — more baseline samples
  phase_2_warn: 1500,   // was 1000 — more prep time
  phase_2_flash: 2500,  // was 2000 — better PLR capture
  phase_2_dark: 3000,   // was 2000 — full redilation T50
  phase_3: 8000,        // was 5000 — more pursuit cycles
};
```

Also update the pursuit sinusoidal calculation in the RAF loop. Find the line:
```typescript
const targetX = 0.5 + 0.4 * Math.sin(progress * Math.PI * 5);
```
Change to 3 full cycles (smoother tracking with longer duration):
```typescript
const targetX = 0.5 + 0.4 * Math.sin(progress * Math.PI * 6);
```

- [ ] **Step 2: Update PhaseIndicator labels to match**

Check `src/components/capture/PhaseIndicator.tsx` — update any hardcoded duration labels (e.g., "3s" → "5s", "5s" → "8s") if they exist.

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/capture/GuidedCapture.tsx src/components/capture/PhaseIndicator.tsx
git commit -m "feat: increase phase durations (13s → 22s) for better data quality"
```

---

## Task 7: White background during pursuit phase

The pursuit dot on dark camera background reduces contrast for iris tracking. Add a white semi-opaque overlay behind the dot during Phase 3.

**Files:**
- Modify: `src/components/capture/PursuitDot.tsx`

- [ ] **Step 1: Add white background to PursuitDot**

Replace `PursuitDot.tsx`:

```typescript
// src/components/capture/PursuitDot.tsx
"use client";

interface PursuitDotProps {
  progress: number; // 0 to 1
}

export function PursuitDot({ progress }: PursuitDotProps) {
  const x = 50 + 40 * Math.sin(progress * Math.PI * 6);

  return (
    <>
      {/* White background — improves iris tracking contrast
          and provides consistent light stimulus */}
      <div className="absolute inset-0 z-10 bg-white/90" />

      {/* Tracking dot */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-none"
          style={{ left: `${x}%` }}
        >
          <div className="w-5 h-5 rounded-full bg-green-600 shadow-lg shadow-green-600/50" />
        </div>
      </div>
    </>
  );
}
```

Note: green dot darkened from `green-400` to `green-600` for visibility on white background.

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/capture/PursuitDot.tsx
git commit -m "feat: white background during pursuit phase for better iris tracking"
```

---

## Final: Push all commits

- [ ] **Push to origin**

```bash
git push origin main
```

Verify Vercel deployment succeeds. Test on both desktop and iPhone Safari.
