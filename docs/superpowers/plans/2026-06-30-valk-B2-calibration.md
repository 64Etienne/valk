# Valk B2 — Calibration du regard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture de calibration (fixation de 5 points horizontaux) → fit serveur `x = m·gazeH + c` (+ R²) → mapping stocké, fondation du vrai gain (B3).

**Architecture:** Le sidecar devient une union `pursuit | fixation` (`@valk/shared`). Un nouvel écran mobile `calibration.tsx` (jumeau de la poursuite, points fixes) réutilise des helpers de capture extraits de `protocol.tsx`. Côté serveur, `fitCalibration` (médiane `gazeH` par fixation → régression) est dispatché par le même endpoint `analyze` selon le type de stimulus, stocké en colonne `calibration`, affiché en nuage de points dans `/debug`.

**Tech Stack:** zod (`@valk/shared`), Expo (expo-camera/video/file-system), Next.js/Node (`node:sqlite`), Python mediapipe (déjà monté, réutilisé tel quel via `runExtraction`), vitest.

## Global Constraints

- **gazeH = iris relatif au visage** (validé B1) ; extraction Python inchangée (`runExtraction`).
- **Calibration horizontale 1D**, 5 points `x ∈ {0.1, 0.3, 0.5, 0.7, 0.9}`, ~1.5 s/point, **skip 400 ms** de settle au début de chaque fixation.
- `pursuitX(model: PursuitModel, …)` reste typé sur le pursuit ; `StimulusModel = PursuitModel | FixationModel` (union discriminée sur `type`).
- Endpoint `analyze` dispatché par `sidecar.stimuli[0].model.type`. Statuts calibration : `ok` | `calibration_poor` (R²<0.8) | `failed` (<3 fixations).
- Dé-risqué : mapping monotone fittable, R²≈0.88–0.97 (pseudo-calib pessimiste). `gazeH` décroît quand `x` croît (pente négative).
- Branche `feat/valk-B2-calibration`. Tester en réel (clips `data/media/proto-*` pour les tests existants ; capture de calibration device pour T8).

## File Structure

- `packages/shared/src/sidecar.ts` *(modif)* — union pursuit|fixation.
- `packages/shared/src/index.ts` *(modif)* — exports.
- `packages/shared/src/__tests__/sidecar.test.ts` *(modif)* — tests fixation.
- `apps/mobile/src/capture/helpers.ts` *(créer)* — `saveSidecar`, `uploadCapture`, `brightnessMax`/`restoreBrightness`.
- `apps/mobile/src/capture/ClipPlayback.tsx` *(créer)* — relecture partagée.
- `apps/mobile/app/protocol.tsx` *(modif)* — utilise les helpers extraits.
- `apps/mobile/app/calibration.tsx` *(créer)* — écran de fixation.
- `apps/mobile/app/index.tsx` *(modif)* — bouton « Calibration ».
- `apps/web/src/lib/analysis/calibration.ts` *(créer)* — `fitCalibration`.
- `apps/web/src/lib/analysis/__tests__/calibration.test.ts` *(créer)*.
- `apps/web/src/lib/observability/db.ts` *(modif)* — colonne `calibration` + `setCaptureCalibration`.
- `apps/web/src/lib/observability/__tests__/db.test.ts` *(modif)*.
- `apps/web/src/app/api/captures/[id]/analyze/route.ts` *(modif)* — dispatch.
- `apps/web/src/app/debug/CalibChart.tsx` *(créer)* — nuage + droite.
- `apps/web/src/app/debug/page.tsx` *(modif)* — affichage calibration.

---

### Task 1: Shared — sidecar union pursuit|fixation

**Files:**
- Modify: `packages/shared/src/sidecar.ts`, `packages/shared/src/index.ts`, `packages/shared/src/__tests__/sidecar.test.ts`
- Modify (consommateurs du type) : `apps/web/src/lib/analysis/gaze.ts`, `apps/mobile/app/protocol.tsx`

**Interfaces:**
- Produces : `pursuitModelSchema`, `fixationModelSchema`, `stimulusModelSchema` (union) ; types `PursuitModel`, `FixationModel`, `StimulusModel` ; `pursuitX(model: PursuitModel, tMs): number` (inchangé sauf le type).

- [ ] **Step 1: Écrire les tests fixation dans `sidecar.test.ts`**

Ajouter (le fichier importe déjà `sidecarSchema`) :

```ts
import { stimulusModelSchema } from "../index";

describe("fixation_h", () => {
  it("sidecar accepte un stimulus de fixation", () => {
    const sc = {
      schemaVersion: 1, sessionId: "c",
      clock: { domain: "performance.now", t0Monotonic: 0, t0Wall: 1 },
      recording: { requestedQuality: "720p", mirror: false },
      syncMarkers: [
        { kind: "flash", edge: "start", scheduledMs: 0, durationMs: 200 },
        { kind: "flash", edge: "end", scheduledMs: 9000, durationMs: 200 },
      ],
      stimuli: [{
        type: "fixation_h",
        model: { type: "fixation_h", points: [{ x: 0.1, startMs: 500, durMs: 1500 }] },
        samples: [],
      }],
    };
    expect(() => sidecarSchema.parse(sc)).not.toThrow();
  });
  it("rejette un point de fixation sans x", () => {
    expect(() => stimulusModelSchema.parse({ type: "fixation_h", points: [{ startMs: 0, durMs: 1 }] })).toThrow();
  });
  it("accepte toujours un modèle de poursuite (rétro-compat)", () => {
    expect(() => stimulusModelSchema.parse({ type: "smooth_pursuit_h", center: 0.5, amplitude: 0.4, cycles: 1.5, startMs: 0, durationMs: 6000 })).not.toThrow();
  });
});
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `npm test -w @valk/shared`
Expected: FAIL (`stimulusModelSchema` n'est plus un objet simple / `fixation_h` rejeté).

- [ ] **Step 3: Réécrire les schémas dans `sidecar.ts`**

Remplacer le bloc `stimulusModelSchema` + `pursuitX` par :

```ts
/** Stimulus de poursuite horizontale (le serveur reconstruit la position). */
export const pursuitModelSchema = z.object({
  type: z.literal("smooth_pursuit_h"),
  center: z.number(),
  amplitude: z.number(),
  cycles: z.number(),
  startMs: z.number(),
  durationMs: z.number(),
});
export type PursuitModel = z.infer<typeof pursuitModelSchema>;

/** Stimulus de calibration : fixations successives de points à x connus. */
export const fixationModelSchema = z.object({
  type: z.literal("fixation_h"),
  points: z.array(z.object({ x: z.number(), startMs: z.number(), durMs: z.number() })),
});
export type FixationModel = z.infer<typeof fixationModelSchema>;

export const stimulusModelSchema = z.discriminatedUnion("type", [pursuitModelSchema, fixationModelSchema]);
export type StimulusModel = z.infer<typeof stimulusModelSchema>;

/**
 * Position horizontale (0..1) du point de poursuite à l'instant `tMs`
 * (même horloge que `model.startMs`). Pur — réutilisé device ET serveur.
 */
export function pursuitX(model: PursuitModel, tMs: number): number {
  const elapsed = tMs - model.startMs;
  const progress = Math.max(0, Math.min(1, elapsed / model.durationMs));
  return model.center + model.amplitude * Math.sin(2 * Math.PI * model.cycles * progress);
}
```

- [ ] **Step 4: Exporter dans `index.ts`**

Remplacer les exports sidecar par :

```ts
export {
  syncMarkerSchema,
  pursuitModelSchema,
  fixationModelSchema,
  stimulusModelSchema,
  sidecarSchema,
  pursuitX,
  SIDECAR_SCHEMA_VERSION,
} from './sidecar';
export type { SyncMarker, PursuitModel, FixationModel, StimulusModel, Sidecar } from './sidecar';
```

- [ ] **Step 5: Narrow chez les consommateurs**

Dans `apps/web/src/lib/analysis/gaze.ts`, au début de `buildSignal`, après `const { frames } = extraction;` remplacer `const model = sidecar.stimuli[0].model;` par :

```ts
  const model = sidecar.stimuli[0].model;
  if (model.type !== "smooth_pursuit_h") {
    return { points: [], r: 0, facePct: 0, signFlipped: false, status: "failed" };
  }
  // model est désormais PursuitModel
```

Dans `apps/mobile/app/protocol.tsx`, importer `type PursuitModel` au lieu de `type StimulusModel`, et typer le state stimulus + `PursuitDot` en `PursuitModel` (remplacer les occurrences `StimulusModel` → `PursuitModel`).

- [ ] **Step 6: Lancer tests shared + typecheck mobile/web**

Run: `npm test -w @valk/shared && npx --no-install tsc --noEmit -p apps/mobile && echo TC-MOBILE-OK`
Expected: shared PASS ; mobile tsc exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/shared apps/web/src/lib/analysis/gaze.ts apps/mobile/app/protocol.tsx
git commit -m "feat(shared): sidecar union pursuit|fixation (FixationModel) + narrow consommateurs"
```

---

### Task 2: Mobile — extraire les helpers de capture partagés

**Files:**
- Create: `apps/mobile/src/capture/helpers.ts`, `apps/mobile/src/capture/ClipPlayback.tsx`
- Modify: `apps/mobile/app/protocol.tsx` (utiliser les helpers)

**Interfaces:**
- Produces :
  - `saveSidecar(clipUri: string, sidecar: Sidecar): string`
  - `uploadCapture(clipUri: string, sidecar: Sidecar): Promise<{ ok: boolean; captureId?: string; detail?: string }>`
  - `brightnessMax(prev: { current: number | null }): Promise<void>` / `restoreBrightness(prev): Promise<void>`
  - `<ClipPlayback uri info upload onUpload onRedo onDone />` (composant identique à celui de `protocol.tsx`).

- [ ] **Step 1: Créer `apps/mobile/src/capture/helpers.ts`**

```ts
import Constants from "expo-constants";
import * as Brightness from "expo-brightness";
import { File } from "expo-file-system";
import type { Sidecar } from "@valk/shared";
import { logger } from "../observability/logger";

export function saveSidecar(clipUri: string, sidecar: Sidecar): string {
  const uri = `${clipUri}.sidecar.json`;
  const f = new File(uri);
  try {
    f.create();
  } catch {
    /* existe déjà */
  }
  f.write(JSON.stringify(sidecar));
  return uri;
}

export async function brightnessMax(prev: { current: number | null }): Promise<void> {
  prev.current = await Brightness.getBrightnessAsync().catch(() => null);
  await Brightness.setBrightnessAsync(1).catch(() => {});
}
export async function restoreBrightness(prev: { current: number | null }): Promise<void> {
  if (prev.current != null) {
    await Brightness.setBrightnessAsync(prev.current).catch(() => {});
    prev.current = null;
  }
}

export async function uploadCapture(
  clipUri: string,
  sidecar: Sidecar,
): Promise<{ ok: boolean; captureId?: string; detail?: string }> {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string; debugKey?: string } | undefined;
  const base = extra?.apiBaseUrl ?? "";
  if (!base) return { ok: false, detail: "serveur non configuré" };
  const form = new FormData();
  form.append("clip", { uri: clipUri, name: "clip.mov", type: "video/quicktime" } as unknown as Blob);
  form.append("sidecar", JSON.stringify(sidecar));
  form.append("sessionId", sidecar.sessionId);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/captures`, {
      method: "POST",
      body: form,
      headers: {
        "ngrok-skip-browser-warning": "true",
        ...(extra?.debugKey ? { "x-valk-debug-key": extra.debugKey } : {}),
      },
    });
    const j = (await res.json()) as { ok?: boolean; captureId?: string; timeMap?: { status?: string } };
    if (!res.ok || !j.ok) throw new Error(`HTTP ${res.status}`);
    logger.info("capture", "upload.done", { captureId: j.captureId, sync: j.timeMap?.status });
    return { ok: true, captureId: j.captureId, detail: `Envoyé · sync ${j.timeMap?.status ?? "?"}` };
  } catch (e) {
    logger.captureException(e, { where: "uploadCapture" });
    return { ok: false, detail: "échec de l'envoi" };
  }
}
```

- [ ] **Step 2: Créer `apps/mobile/src/capture/ClipPlayback.tsx`**

Déplacer **tel quel** le composant `Playback` de `protocol.tsx` (relecture `useVideoPlayer`/`VideoView` + boutons Envoyer/Refaire/Terminé + styles associés) dans ce fichier, exporté `export function ClipPlayback(props) {…}` avec la même signature de props (`uri, info, upload, onUpload, onRedo, onDone`). Inclure les styles utilisés (`fill, overlay, topBar, meta, bottomStack, startBtn, startText, uploadMsg, uploadErr, uploadOk, controlsRow, button, buttonGhost, buttonText, pressed`).

- [ ] **Step 3: Refactor `protocol.tsx` pour utiliser les helpers**

Dans `protocol.tsx` : supprimer les définitions locales de `saveSidecar`, `brightnessMax`, `restoreBrightness`, la logique d'upload (`uploadClip`) et le composant `Playback` ; importer à la place :

```ts
import { saveSidecar, brightnessMax, restoreBrightness, uploadCapture } from "../src/capture/helpers";
import { ClipPlayback } from "../src/capture/ClipPlayback";
```

Adapter `brightnessMax()/restoreBrightness()` aux appels `brightnessMax(prevBrightness)/restoreBrightness(prevBrightness)` (passer la ref). Remplacer `uploadClip` par un wrapper :

```ts
const uploadClip = async () => {
  if (!clip) return;
  setUpload({ state: "uploading" });
  const r = await uploadCapture(clip.uri, clip.sidecar);
  setUpload({ state: r.ok ? "done" : "error", msg: r.detail });
};
```

Et le rendu `recorded` utilise `<ClipPlayback … />` (mêmes props). Supprimer le `saveSidecar` local (utiliser l'importé). Garder le reste de l'orchestration de poursuite.

- [ ] **Step 4: Vérifier le bundle (non-régression A3/A4)**

Run: `npx --no-install tsc --noEmit -p apps/mobile && rm -rf /tmp/me && node_modules/.bin/expo export --platform ios --output-dir /tmp/me 2>&1 | grep -iE 'Exported|error|Unable to resolve' | head -3`
Expected: tsc OK + `Exported`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/capture apps/mobile/app/protocol.tsx
git commit -m "refactor(mobile): extraire les helpers de capture partagés (saveSidecar/upload/ClipPlayback)"
```

---

### Task 3: Mobile — écran `calibration.tsx`

**Files:**
- Create: `apps/mobile/app/calibration.tsx`
- Modify: `apps/mobile/app/index.tsx` (bouton « Calibration »)

**Interfaces:**
- Consumes : helpers de Task 2, `FixationModel`/`Sidecar`/`SIDECAR_SCHEMA_VERSION`/`sidecarSchema` (`@valk/shared`).

- [ ] **Step 1: Écrire `apps/mobile/app/calibration.tsx`**

```tsx
import { useRef, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import { File } from "expo-file-system";
import {
  sidecarSchema, SIDECAR_SCHEMA_VERSION,
  type FixationModel, type Sidecar, type SyncMarker,
} from "@valk/shared";
import { logger } from "../src/observability/logger";
import { saveSidecar, brightnessMax, restoreBrightness, uploadCapture } from "../src/capture/helpers";
import { ClipPlayback } from "../src/capture/ClipPlayback";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const DOT = 30;
const FLASH_MS = 200;
const XS = [0.1, 0.3, 0.5, 0.7, 0.9];
const FIX_MS = 1500;

const now = (): number => {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return p?.now ? p.now() : Date.now();
};
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Phase = "idle" | "running" | "recorded";

export default function Calibration() {
  useKeepAwake();
  const router = useRouter();
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const camRef = useRef<CameraView>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [flashOn, setFlashOn] = useState(false);
  const [dotX, setDotX] = useState<number | null>(null);
  const [clip, setClip] = useState<{ uri: string; size: number | null; summary: string; sidecar: Sidecar } | null>(null);
  const [upload, setUpload] = useState<{ state: "idle" | "uploading" | "done" | "error"; msg?: string }>({ state: "idle" });
  const prevBrightness = useRef<number | null>(null);

  const uploadClip = async () => {
    if (!clip) return;
    setUpload({ state: "uploading" });
    const r = await uploadCapture(clip.uri, clip.sidecar);
    setUpload({ state: r.ok ? "done" : "error", msg: r.detail });
  };

  const run = async () => {
    if (phase !== "idle") return;
    setPhase("running");
    const markers: SyncMarker[] = [];
    const t0 = now();
    const t0Wall = Date.now();
    try {
      const recPromise = camRef.current?.recordAsync({ maxDuration: 30 });
      logger.info("calibration", "capture.start", {});
      // FLASH start
      await brightnessMax(prevBrightness);
      markers.push({ kind: "flash", edge: "start", scheduledMs: now(), durationMs: FLASH_MS });
      setFlashOn(true); await delay(FLASH_MS); setFlashOn(false);
      await restoreBrightness(prevBrightness);
      await delay(400);
      // FIXATIONS
      const points = [];
      for (const x of XS) {
        const startMs = now();
        setDotX(x);
        await delay(FIX_MS);
        points.push({ x, startMs, durMs: FIX_MS });
      }
      setDotX(null);
      await delay(400);
      // FLASH end
      await brightnessMax(prevBrightness);
      markers.push({ kind: "flash", edge: "end", scheduledMs: now(), durationMs: FLASH_MS });
      setFlashOn(true); await delay(FLASH_MS); setFlashOn(false);
      await restoreBrightness(prevBrightness);

      camRef.current?.stopRecording();
      const result = await recPromise;
      if (!result?.uri) { setPhase("idle"); return; }
      let size: number | null = null;
      try { size = new File(result.uri).size; } catch { /* best-effort */ }

      const model: FixationModel = { type: "fixation_h", points };
      const sidecar: Sidecar = {
        schemaVersion: SIDECAR_SCHEMA_VERSION,
        sessionId: `calib-${t0Wall}`,
        clock: { domain: "performance.now", t0Monotonic: t0, t0Wall },
        recording: { requestedQuality: "720p", mirror: false },
        syncMarkers: markers,
        stimuli: [{ type: "fixation_h", model, samples: [] }],
      };
      sidecarSchema.parse(sidecar);
      saveSidecar(result.uri, sidecar);
      logger.info("calibration", "capture.done", { uri: result.uri, size, points: points.length });
      setUpload({ state: "idle" });
      setClip({ uri: result.uri, size, sidecar, summary: `Calibration · ${points.length} points · ${size != null ? (size / 1048576).toFixed(1) + " Mo" : "—"}` });
      setPhase("recorded");
    } catch (e) {
      await restoreBrightness(prevBrightness);
      setFlashOn(false); setDotX(null);
      logger.captureException(e, { where: "calibration.run" });
      setPhase("idle");
    }
  };

  if (!camPerm || !micPerm) return <View style={styles.centered}><ActivityIndicator color="#c4b5fd" /></View>;
  if (!camPerm.granted || !micPerm.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Caméra & micro</Text>
        <Pressable style={({ pressed }) => [styles.button, pressed && styles.pressed]} onPress={async () => {
          await requestCam(); await requestMic();
        }}><Text style={styles.buttonText}>Autoriser</Text></Pressable>
        <Pressable onPress={() => router.back()}><Text style={styles.link}>Retour</Text></Pressable>
      </View>
    );
  }
  if (phase === "recorded" && clip) {
    return <ClipPlayback uri={clip.uri} info={clip.summary} upload={upload} onUpload={uploadClip}
      onRedo={() => { setClip(null); setPhase("idle"); }} onDone={() => router.back()} />;
  }
  return (
    <View style={styles.fill}>
      <CameraView ref={camRef} style={styles.fill} facing="front" mode="video" videoQuality="720p" />
      {dotX != null && <View style={[styles.dot, { left: dotX * (SCREEN_W - DOT), top: SCREEN_H / 2 - DOT / 2 }]} />}
      {flashOn && <View style={styles.flash} />}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} disabled={phase === "running"}>
            <Text style={[styles.link, phase === "running" && styles.dim]}>Fermer</Text>
          </Pressable>
          {phase === "running" && <Text style={styles.recDot}>● Calibration…</Text>}
        </View>
        {phase === "idle" && (
          <View style={styles.controls}>
            <Pressable style={({ pressed }) => [styles.startBtn, pressed && styles.pressed]} onPress={run}>
              <Text style={styles.startText}>Lancer la calibration</Text>
            </Pressable>
            <Text style={styles.hint}>Fixe chaque point qui apparaît (~1,5 s), tête immobile</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0b12", padding: 32 },
  overlay: { ...StyleSheet.absoluteFillObject, paddingTop: 56, paddingBottom: 40, justifyContent: "space-between" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  controls: { alignItems: "center", gap: 12, paddingHorizontal: 20 },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: "#ffffff" },
  dot: { position: "absolute", width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: "#f59e0b", borderWidth: 3, borderColor: "#fff" },
  title: { color: "#c4b5fd", fontSize: 24, fontWeight: "800", marginBottom: 20 },
  link: { color: "#c4b5fd", fontSize: 16, fontWeight: "600" },
  dim: { opacity: 0.4 },
  recDot: { color: "#f59e0b", fontSize: 14, fontWeight: "800" },
  hint: { color: "#e5e7eb", fontSize: 13, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, overflow: "hidden" },
  startBtn: { backgroundColor: "#7c3aed", paddingHorizontal: 34, paddingVertical: 18, borderRadius: 16 },
  startText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  button: { backgroundColor: "#7c3aed", paddingHorizontal: 26, paddingVertical: 14, borderRadius: 14 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.8 },
});
```

- [ ] **Step 2: Bouton « Calibration » sur l'accueil**

Dans `apps/mobile/app/index.tsx`, après le bouton « Capture libre », ajouter :

```tsx
<Pressable
  style={({ pressed }) => [styles.buttonSecondary, pressed && styles.buttonPressed]}
  onPress={() => router.push("/calibration")}
>
  <Text style={styles.buttonText}>Calibration</Text>
</Pressable>
```

- [ ] **Step 3: tsc + bundle**

Run: `npx --no-install tsc --noEmit -p apps/mobile && rm -rf /tmp/me && node_modules/.bin/expo export --platform ios --output-dir /tmp/me 2>&1 | grep -iE 'Exported|error' | head -3`
Expected: tsc OK + `Exported`.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/calibration.tsx apps/mobile/app/index.tsx
git commit -m "feat(mobile): écran de calibration (fixation 5 points -> sidecar fixation_h)"
```

---

### Task 4: Serveur — `fitCalibration` + tests math

**Files:**
- Create: `apps/web/src/lib/analysis/calibration.ts`, `apps/web/src/lib/analysis/__tests__/calibration.test.ts`

**Interfaces:**
- Consumes : `Extraction` (`./gaze`), `Sidecar` (`@valk/shared`), `TimeMap` (`../observability/flash-detect`).
- Produces :
  - `interface CalibrationResult { kind: "calibration"; m: number; c: number; r2: number; points: { x: number; gazeH: number; residual: number; n: number }[]; status: "ok" | "calibration_poor" | "failed" }`
  - `fitCalibration(extraction: Extraction, sidecar: Sidecar, timeMap: TimeMap): CalibrationResult`

- [ ] **Step 1: Écrire les tests `calibration.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { fitCalibration } from "../calibration";
import type { Extraction } from "../gaze";
import type { Sidecar } from "@valk/shared";
import type { TimeMap } from "../../observability/flash-detect";

const XS = [0.1, 0.3, 0.5, 0.7, 0.9];
const FIX = 1500, SETTLE = 400;
// vrai mapping : x = M*gazeH + C  => gazeH = (x - C)/M
const M = -70, C = 35.5;
const timeMap: TimeMap = { a: 1, b: 0, anchors: 2, status: "verified" };

function sidecar(): Sidecar {
  const points = XS.map((x, i) => ({ x, startMs: 1000 + i * FIX, durMs: FIX }));
  return {
    schemaVersion: 1, sessionId: "c",
    clock: { domain: "performance.now", t0Monotonic: 0, t0Wall: 1 },
    recording: { requestedQuality: "720p", mirror: false },
    syncMarkers: [
      { kind: "flash", edge: "start", scheduledMs: 0, durationMs: 200 },
      { kind: "flash", edge: "end", scheduledMs: 1000 + XS.length * FIX, durationMs: 200 },
    ],
    stimuli: [{ type: "fixation_h", model: { type: "fixation_h", points }, samples: [] }],
  } as unknown as Sidecar;
}

// frames 30fps couvrant la fenêtre, gazeH = (x-C)/M pendant chaque fixation (+ bruit), sinon centre
function frames(noise = 0): Extraction {
  const fr = [];
  const total = 1000 + XS.length * FIX + 600;
  for (let t = 0; t < total / 1000 * 30; t++) {
    const ts = t / 30;
    const stimMs = ts * 1000;
    let gazeH = 0.5;
    XS.forEach((x, i) => {
      const s = 1000 + i * FIX;
      if (stimMs >= s && stimMs <= s + FIX) gazeH = (x - C) / M + (noise ? (t % 5 - 2) * noise : 0);
    });
    fr.push({ t: ts, ok: true, gazeH });
  }
  return { fps: 30, width: 100, height: 100, frames: fr };
}

describe("fitCalibration", () => {
  it("retrouve le mapping (R²≈1)", () => {
    const r = fitCalibration(frames(), sidecar(), timeMap);
    expect(r.status).toBe("ok");
    expect(r.points).toHaveLength(5);
    expect(r.r2).toBeGreaterThan(0.99);
    expect(r.m).toBeCloseTo(M, 0);
  });
  it("skip le settle : robuste à un transitoire au début de fixation", () => {
    const e = frames();
    // pollue les 300 premières ms de chaque fixation (dans le settle) avec une valeur aberrante
    e.frames.forEach((f) => {
      XS.forEach((x, i) => {
        const s = 1000 + i * FIX;
        if (f.t * 1000 >= s && f.t * 1000 < s + 300) f.gazeH = 0.0;
      });
    });
    const r = fitCalibration(e, sidecar(), timeMap);
    expect(r.r2).toBeGreaterThan(0.99); // les frames du settle sont ignorées
  });
  it("moins de 3 fixations exploitables -> failed", () => {
    const e: Extraction = { fps: 30, width: 100, height: 100, frames: [{ t: 0, ok: false, gazeH: null }] };
    expect(fitCalibration(e, sidecar(), timeMap).status).toBe("failed");
  });
});
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx --no-install vitest run src/lib/analysis/__tests__/calibration.test.ts --root apps/web`
Expected: FAIL (`fitCalibration` introuvable).

- [ ] **Step 3: Écrire `calibration.ts`**

```ts
import type { Sidecar } from "@valk/shared";
import type { TimeMap } from "../observability/flash-detect";
import type { Extraction } from "./gaze";

export interface CalibrationResult {
  kind: "calibration";
  m: number;
  c: number;
  r2: number;
  points: { x: number; gazeH: number; residual: number; n: number }[];
  status: "ok" | "calibration_poor" | "failed";
}

const SETTLE_MS = 400;

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function fitCalibration(extraction: Extraction, sidecar: Sidecar, timeMap: TimeMap): CalibrationResult {
  const failed: CalibrationResult = { kind: "calibration", m: 0, c: 0, r2: 0, points: [], status: "failed" };
  const model = sidecar.stimuli[0]?.model;
  if (!model || model.type !== "fixation_h") return failed;
  const { a, b } = timeMap;

  const pairs: { x: number; gazeH: number; n: number }[] = [];
  for (const fp of model.points) {
    const gazes: number[] = [];
    for (const f of extraction.frames) {
      if (!f.ok || f.gazeH == null) continue;
      const stimMs = (f.t * 1000 - b) / a;
      if (stimMs >= fp.startMs + SETTLE_MS && stimMs <= fp.startMs + fp.durMs) gazes.push(f.gazeH);
    }
    if (gazes.length >= 3) pairs.push({ x: fp.x, gazeH: median(gazes), n: gazes.length });
  }
  if (pairs.length < 3) return failed;

  const n = pairs.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pairs) {
    sx += p.gazeH;
    sy += p.x;
    sxx += p.gazeH * p.gazeH;
    sxy += p.gazeH * p.x;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return failed;
  const m = (n * sxy - sx * sy) / denom;
  const c = (sy - m * sx) / n;

  const yMean = sy / n;
  let ssRes = 0, ssTot = 0;
  const points = pairs.map((p) => {
    const pred = m * p.gazeH + c;
    ssRes += (p.x - pred) ** 2;
    ssTot += (p.x - yMean) ** 2;
    return { x: p.x, gazeH: p.gazeH, residual: p.x - pred, n: p.n };
  });
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const status: CalibrationResult["status"] = r2 < 0.8 ? "calibration_poor" : "ok";
  return { kind: "calibration", m, c, r2, points, status };
}
```

- [ ] **Step 4: Lancer — succès attendu**

Run: `npx --no-install vitest run src/lib/analysis/__tests__/calibration.test.ts --root apps/web`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/analysis/calibration.ts apps/web/src/lib/analysis/__tests__/calibration.test.ts
git commit -m "feat(analysis): fitCalibration (médiane gazeH par fixation -> régression x=m·gazeH+c + R²)"
```

---

### Task 5: DB — colonne `calibration`

**Files:**
- Modify: `apps/web/src/lib/observability/db.ts`, `apps/web/src/lib/observability/__tests__/db.test.ts`

**Interfaces:**
- Produces : `setCaptureCalibration(id: string, calibration: CalibrationResult): void` ; `CaptureRecord.calibration: CalibrationResult | null` (idem `CaptureSummary`).

- [ ] **Step 1: Migration + type + statement + méthode** (même schéma que `analysis` de B1)

- Import : `import type { CalibrationResult } from "../analysis/calibration";`
- `migrate` : après l'`ALTER … analysis`, ajouter dans un second try/catch : `db.exec("ALTER TABLE captures ADD COLUMN calibration TEXT")`.
- `CaptureRecord` et `CaptureSummary` : ajouter `calibration: CalibrationResult | null;`.
- `ObservabilityStore` : ajouter `setCaptureCalibration(id: string, calibration: CalibrationResult): void;`.
- `selCaptures` SELECT : ajouter `, calibration`.
- Statement : `const updCalib = db.prepare("UPDATE captures SET calibration = ? WHERE id = ?");`.
- `listCaptures` + `getCapture` mapping : `calibration: r.calibration != null ? (JSON.parse(r.calibration as string) as CalibrationResult) : null`.
- Méthode : `setCaptureCalibration(id, calibration) { updCalib.run(JSON.stringify(calibration), id); }`.
- `insertCapture` : la route ajoute déjà `analysis: null` ; ajouter `calibration: null` à l'objet `CaptureRecord` dans `apps/web/src/app/api/captures/route.ts`.

- [ ] **Step 2: Test db** (ajouter dans `db.test.ts`)

```ts
it("setCaptureCalibration met à jour et relit", () => {
  const store = createSqliteStore(":memory:");
  store.insertCapture({
    id: "c2", sessionId: "s", createdAt: 1, clipPath: "/x.mov", size: 1,
    sidecar: {} as never, timeMap: null, status: "verified", analysis: null, calibration: null,
  });
  store.setCaptureCalibration("c2", { kind: "calibration", m: -70, c: 35, r2: 0.95, points: [], status: "ok" });
  expect(store.getCapture("c2")?.calibration?.r2).toBeCloseTo(0.95);
  expect(store.listCaptures()[0].calibration?.status).toBe("ok");
});
```
(Adapter le test `setCaptureAnalysis` existant : ajouter `calibration: null` à son `insertCapture`.)

- [ ] **Step 3: Lancer tests db**

Run: `npx --no-install vitest run src/lib/observability/__tests__/db.test.ts --root apps/web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/observability/db.ts apps/web/src/lib/observability/__tests__/db.test.ts apps/web/src/app/api/captures/route.ts
git commit -m "feat(db): colonne captures.calibration + setCaptureCalibration"
```

---

### Task 6: Endpoint — dispatch poursuite|calibration

**Files:**
- Modify: `apps/web/src/app/api/captures/[id]/analyze/route.ts`

**Interfaces:**
- Consumes : `fitCalibration`, `buildSignal`, `runExtraction`, `setCaptureAnalysis`/`setCaptureCalibration`.

- [ ] **Step 1: Réécrire le corps du `try` de `POST`**

```ts
    const extraction = await runExtraction(cap.clipPath);
    const timeMap = cap.timeMap ?? { a: 1, b: 0, anchors: 0, status: "sync_unverified" as const };
    const kind = cap.sidecar.stimuli[0]?.model.type;
    if (kind === "fixation_h") {
      const calib = fitCalibration(extraction, cap.sidecar, timeMap);
      getStore().setCaptureCalibration(id, calib);
      return Response.json({ ok: true, kind: "calibration", status: calib.status, r2: calib.r2, m: calib.m, c: calib.c });
    }
    const signal = buildSignal(extraction, cap.sidecar, timeMap);
    getStore().setCaptureAnalysis(id, signal);
    await generateOverlay(cap.clipPath, signal);
    return Response.json({ ok: true, kind: "pursuit", status: signal.status, r: signal.r, facePct: signal.facePct, signFlipped: signal.signFlipped });
```

Ajouter l'import : `import { fitCalibration } from "@/lib/analysis/calibration";`.

- [ ] **Step 2: Build web**

Run: `npm run build -w @valk/web`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/api/captures/[id]/analyze/route.ts"
git commit -m "feat(api): analyze dispatche poursuite|calibration selon le type de stimulus"
```

---

### Task 7: `/debug` — nuage de points calibration

**Files:**
- Create: `apps/web/src/app/debug/CalibChart.tsx`
- Modify: `apps/web/src/app/debug/page.tsx`

**Interfaces:**
- Consumes : `CaptureSummary.calibration` (`CalibrationResult | null`).

- [ ] **Step 1: Écrire `CalibChart.tsx`**

```tsx
import type { CalibrationResult } from "@/lib/analysis/calibration";

/** Nuage gazeH↔x + droite ajustée m·gazeH+c. */
export function CalibChart({ calib }: { calib: CalibrationResult }) {
  const { points, m, c } = calib;
  if (!points.length) return <p className="text-xs text-zinc-500">Aucun point.</p>;
  const W = 320, H = 140, pad = 18;
  const gz = points.map((p) => p.gazeH);
  const gMin = Math.min(...gz), gMax = Math.max(...gz);
  const sx = (g: number) => pad + ((g - gMin) / (gMax - gMin || 1)) * (W - 2 * pad);
  const sy = (x: number) => H - pad - x * (H - 2 * pad); // x écran 0..1
  const lineX1 = m * gMin + c, lineX2 = m * gMax + c;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-black/30 ring-1 ring-white/10">
      <line x1={sx(gMin)} y1={sy(lineX1)} x2={sx(gMax)} y2={sy(lineX2)} stroke="#a78bfa" strokeWidth="1.5" />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.gazeH)} cy={sy(p.x)} r="4" fill="#2dd4bf" />
      ))}
    </svg>
  );
}
```

- [ ] **Step 2: Câbler dans `page.tsx`**

Importer `CalibChart` + `type CalibrationResult`. Dans la carte capture, après le bloc d'analyse de poursuite (B1), ajouter :

```tsx
{c.calibration && (
  <div className="mt-2">
    <span className="text-xs text-zinc-400">
      calibration {c.calibration.status} · R²={c.calibration.r2.toFixed(3)} · {c.calibration.points.length} pts
    </span>
    <div className="mt-1"><CalibChart calib={c.calibration} /></div>
  </div>
)}
```

- [ ] **Step 3: Build web**

Run: `npm run build -w @valk/web`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/debug
git commit -m "feat(debug): nuage de points calibration (gazeH↔x + droite + R²)"
```

---

### Task 8: Validation device réelle

**Files:** (vérification)

- [ ] **Step 1: Suite complète**

Run: `npm test -w @valk/shared && npm test -w @valk/web`
Expected: tous verts.

- [ ] **Step 2: Republier + capture device**

Re-tunnel + `apiBaseUrl`/`debugKey` + `eas update` (recette `device-test-workflow`). L'utilisateur ouvre l'app → « Calibration » → fixe les 5 points → « Envoyer au serveur ».

- [ ] **Step 3: Analyser + vérifier le R²**

Serveur lancé avec `VALK_MEDIA_DIR=/var/www/valk/data/media`. Puis :
```bash
ID=$(curl -s "http://localhost:3939/api/captures?key=valknight" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const c=j.captures.find(x=>x.id.startsWith('calib-'))||j.captures[0];process.stdout.write(c.id)})")
curl -s -X POST -H "x-valk-debug-key: valknight" "http://localhost:3939/api/captures/$ID/analyze" | cat
```
Expected: `{"ok":true,"kind":"calibration","status":"ok","r2":>0.8,...}` (R² réel = juge ; si `calibration_poor`, tuner durées/points et le noter).

- [ ] **Step 4: Visuel `/debug`**

Screenshot `/debug?key=valknight` montrant le nuage gazeH↔x + droite + R² pour la capture de calibration. Présenter à l'utilisateur.

- [ ] **Step 5: Commit éventuel + finalisation**

Invoquer **superpowers:finishing-a-development-branch** (tests → options → merge `main` + push).

---

## Self-Review

**Couverture spec :** sidecar union → T1 ✓ ; extraction helpers device → T2 ✓ ; écran calibration → T3 ✓ ; `fitCalibration` → T4 ✓ ; stockage colonne → T5 ✓ ; dispatch endpoint → T6 ✓ ; `/debug` nuage → T7 ✓ ; validation device + R² juge → T8 ✓. Erreurs (`failed`/`calibration_poor`/settle) → T4. Sécurité inchangée (réutilise endpoints gatés B1).

**Cohérence types :** `CalibrationResult` (kind/m/c/r2/points/status) défini T4, consommé T5/T6/T7 sous le même nom. `FixationModel` (T1) consommé T3 (device) + T4 (`model.type==='fixation_h'`). `Extraction`/`runExtraction`/`buildSignal` réutilisés de B1. `setCaptureCalibration(id, CalibrationResult)` cohérent T5↔T6.

**Placeholders :** aucun (code complet par étape ; T5 décrit les modifs db de façon explicite, calquées sur le pattern `analysis` de B1 déjà en place).
