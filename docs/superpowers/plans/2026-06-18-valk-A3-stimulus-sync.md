# Valk A3 — Stimulus + synchro in-band — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Une **capture guidée** sur l'iPhone : flash de synchro (début) → stimulus de poursuite (point mobile) → flash de synchro (fin), enregistrée en vidéo, qui produit un **sidecar JSON** (marqueurs de synchro + modèle analytique du stimulus) sauvegardé à côté du clip. Côté serveur (A4), les flashs détectés dans la vidéo ancreront le `fitLinearTimeMap` (déjà dans `@valk/shared`) pour reconstruire l'alignement stimulus↔frame.

**Architecture:** Écran `app/protocol.tsx` (expo-router). `CameraView` mode='video' enregistre toute la séquence. Orchestration sur **UNE horloge monotone** (`performance.now`, fallback `Date.now`). Stimulus = point piloté par une boucle `requestAnimationFrame` (position analytique `x(t)=center+amp·sin(2π·cycles·t/dur)`). Flash = overlay blanc plein écran (illumine le visage → pic de luminance détectable dans la vidéo) + `expo-brightness` au max. Sidecar validé par un schéma zod de `@valk/shared`. Relecture via le composant A2.

**Tech Stack:** expo-camera, expo-video, expo-brightness, expo-keep-awake, expo-file-system, zod (`@valk/shared`), logger A1.

## Global Constraints
- **Une seule horloge** pour tous les events du sidecar (`performance.now`). Jamais `Date.now` pour les deltas (seulement `t0Wall` informatif).
- **Flash = marqueur primaire** (visuel, fiable). **Pas de bip** en A3 (session audio exclusive de la caméra en Expo Go) — le double flash début/fin donne les 2 ancres nécessaires au time-map.
- Stimulus **analytique** : le sidecar stocke le modèle (pas d'échantillons par frame requis ; le serveur reconstruit). Échantillonnage rendu = raffinement futur.
- `CameraView` mode='video' permanent. `expo-brightness` max pendant le flash, restauré après.
- Sidecar versionné (`schemaVersion`), auto-suffisant. Sauvé à côté du `.mov`.
- Branche `feat/valk-A3-stimulus-sync`. Validation finale sur device réel.

## Contrat Sidecar (`@valk/shared`, zod)
```ts
SyncMarker = { kind: 'flash'; edge: 'start'|'end'; scheduledMs: number; durationMs: number }
StimulusModel = { type: 'smooth_pursuit_h'; center: number; amplitude: number; cycles: number; startMs: number; durationMs: number }
Sidecar = {
  schemaVersion: number; sessionId: string;
  clock: { domain: 'performance.now'; t0Monotonic: number; t0Wall: number };
  recording: { requestedQuality: string; mirror: boolean };
  syncMarkers: SyncMarker[];
  stimuli: { type: string; model: StimulusModel; samples: { tMs: number; x: number }[] }[];
}
```

## Task 1 — `@valk/shared` : schéma Sidecar
**Files:** Create `packages/shared/src/sidecar.ts` + `__tests__/sidecar.test.ts`; Modify `src/index.ts`.
- [ ] Schéma zod `sidecarSchema` (+ types) ; helper `pursuitX(model, tMs)` (position analytique, pur, réutilisé device+serveur).
- [ ] Test : parse d'un sidecar valide ; rejet si marqueur sans `edge` ; `pursuitX` aux extrêmes (t=0 → center, et symétrie).
- [ ] `npm test -w @valk/shared` vert. Commit.

## Task 2 — Écran capture guidée (`app/protocol.tsx`)
**Files:** Create `apps/mobile/app/protocol.tsx`; Modify `apps/mobile/app/index.tsx` (bouton « Capture guidée »).
- [ ] Composants internes : `FlashOverlay` (View blanche plein écran, opacité on/off) ; `PursuitDot` (point piloté par `requestAnimationFrame`, position via `pursuitX`).
- [ ] Orchestration (sur `performance.now`) au démarrage de l'enregistrement :
  1. `recordAsync({ maxDuration: 20 })` lancé ; `t0 = perf.now()`.
  2. Flash START (≈200ms, brightness max) → `syncMarkers.push({flash,start,scheduledMs})`.
  3. Stimulus poursuite (durée 6s, `model.startMs = perf.now()`), dot visible.
  4. Flash END (≈200ms) → `syncMarkers.push({flash,end,scheduledMs})`.
  5. `stopRecording()` → uri.
- [ ] Build du `Sidecar`, **validé par `sidecarSchema`**, sauvé `<clip>.sidecar.json` via expo-file-system. `logger.info('protocol','capture.done',{uri,size,markers,durMs})`.
- [ ] `useKeepAwake`. Erreurs → `logger.captureException`.
- [ ] `tsc` + `expo export` OK. Commit.

## Task 3 — Relecture + récap capture
**Files:** Modify `apps/mobile/app/protocol.tsx`.
- [ ] Après capture : relecture du clip (composant type A2) + affichage « sidecar OK : N marqueurs, stimulus 6s ». Boutons Refaire / Terminé.
- [ ] `tsc` + `expo export` OK. Commit.

## Task 4 — Validation device réel
- [ ] Re-tunnel + apiBaseUrl + republish (cf. mémoire device-test-workflow). Utilisateur : lance la capture guidée, voit les 2 flashs + le point qui bouge, relit le clip.
- [ ] Vérifier via `/debug` : `capture.done` avec `markers:2`, durée cohérente. Critère d'acceptation A3.

## Différé → A4
- Détection serveur des flashs (ffmpeg luminance) + `fitLinearTimeMap` sur les 2 ancres. Upload clip+sidecar. Échantillonnage rendu (vérif jank). Bip secondaire (dev build).

## Self-Review
Couverture spec §6/§8/§9 (stimulus, sidecar, sync) : tâches 1-3 ; device tâche 4. `fitLinearTimeMap` déjà testé dans shared ; ici on produit les ancres+modèle qu'il consommera.
