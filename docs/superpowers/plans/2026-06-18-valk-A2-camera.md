# Valk A2 — Caméra (enregistrement + relecture) — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. Steps en checkbox.

**Goal:** Prouver, sur l'iPhone réel via Expo Go, qu'on peut **enregistrer un clip vidéo court** (caméra frontale) et **le rejouer localement**, avec permissions, garde-fous, et logging via la couche d'observabilité A1.

**Architecture:** Un écran `app/capture.tsx` (expo-router) : gate permissions (caméra + micro) → `CameraView` monté **`mode='video'` en permanence** (contourne le bug iOS #27528) → bouton enregistrer/stop (`recordAsync`/`stopRecording`) → relecture du `.mov` via `expo-video` (`useVideoPlayer`/`VideoView`). `expo-keep-awake` + `expo-brightness` pendant la capture. Chaque étape est loggée (logger A1). **Pas d'upload ni d'analyse** (A4/B).

**Tech Stack:** expo-camera ~17, expo-video ~3, expo-keep-awake, expo-brightness, expo-file-system, expo-router, logger `@valk/shared`+mobile.

## Global Constraints

- **`CameraView` monté `mode='video'` dès le départ** (jamais picture→video juste avant `recordAsync`).
- **`videoQuality="720p"`** (cible beta) ; codec/bitrate fin → reporté à A4 (taille fichier importe à l'upload).
- `recordAsync({ maxDuration: 15 })` garde-fou ; `stopRecording()` pour arrêter.
- Ne pas se fier au statut de permission seul : si pas de frames/erreur, logger un diagnostic.
- Tout événement capture loggé via `logger` (A1) ; erreurs via `logger.captureException`.
- Branche `feat/valk-A2-camera`. Commits avec trailers harness.
- Validation finale = **sur device réel** (republish EAS + test utilisateur) — la caméra ne tourne pas en headless.

## Task 1 — Écran capture : permissions + preview caméra

**Files:** Create `apps/mobile/app/capture.tsx`; Modify `apps/mobile/app/index.tsx` (lien vers /capture).

- [ ] Gate : `useCameraPermissions()` + `useMicrophonePermissions()` ; si non accordées → écran d'explication + bouton « Autoriser » (request des deux). Logger `permission.camera`/`permission.mic` résultats.
- [ ] Si accordées : `CameraView` `mode="video"` `facing="front"` `videoQuality="720p"` en plein écran (miroir géré).
- [ ] `useKeepAwake()` actif sur l'écran. Bouton retour (router.back).
- [ ] Home : bouton « Démarrer une capture » → `router.push('/capture')`.
- [ ] **Vérif :** `tsc` mobile + `expo export` bundlent.

## Task 2 — Enregistrement (record/stop) + métadonnées

**Files:** Modify `apps/mobile/app/capture.tsx`.

- [ ] `ref` sur `CameraView`. État machine : `idle` → `recording` → `recorded`.
- [ ] Bouton « Enregistrer » : `expo-brightness` max (sauvegarde + restaure), `logger.info('capture','record.start')`, `recordAsync({ maxDuration: 15 })`. Bouton « Stop » : `stopRecording()`.
- [ ] À la résolution : récupérer `uri`, lire la taille via `expo-file-system` (`getInfoAsync`), `logger.info('capture','record.done',{uri,size,ms})`. Erreurs → `logger.captureException`.
- [ ] **Vérif :** `tsc` + `expo export`.

## Task 3 — Relecture locale (expo-video)

**Files:** Modify `apps/mobile/app/capture.tsx`.

- [ ] Vue `recorded` : `useVideoPlayer(uri)` + `<VideoView>` avec contrôles natifs ; afficher taille + durée. Boutons « Refaire » (retour idle) et « Terminé » (router.back).
- [ ] **Vérif :** `tsc` + `expo export`.

## Task 4 — Observabilité + UX capture

**Files:** Modify `apps/mobile/app/capture.tsx`.

- [ ] Logger l'ouverture de l'écran, le FPS/résolution effectifs si dispo, les transitions d'état. Gérer le cas `recordAsync` qui échoue silencieusement (timeout sans uri) → diagnostic loggué.
- [ ] Design moderne, zéro chevauchement (overlay de contrôles sur la preview, safe-area).
- [ ] **Vérif :** `tsc` + `expo export`.

## Task 5 — Validation device réel

- [ ] Re-tunnel + `apiBaseUrl` → republish EAS. Utilisateur : ouvre /capture, enregistre un clip, le rejoue.
- [ ] Confirmer via `/debug` : events `record.start`/`record.done` (uri, taille), pas d'erreur. Critère d'acceptation A2.

## Différé (sous-projets suivants)
- Codec hvc1 + bitrate plafonné, downscale taille (A4, à l'upload).
- Stimuli + marqueurs de synchro (A3). Upload (A4).

## Self-Review
Couverture : spec §6 (capture mobile) tâches 1-4 ; validation device tâche 5. APIs vérifiées (expo-camera 17 : CameraView mode/facing/videoQuality + ref recordAsync/stopRecording ; expo-video 3 : useVideoPlayer/VideoView).
