# Valk A4 — Upload + stockage + détection flashs + time-map — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Faire sortir les clips guidés du téléphone vers le serveur : **upload** streamé (clip + sidecar) → `POST /api/captures` → stockage (disque + SQLite) → **détection serveur des flashs** (ffmpeg `signalstats`) qui ancre `fitLinearTimeMap` (déjà dans `@valk/shared`). Boucle de synchro in-band fermée de bout en bout.

**Architecture:** Mobile : `expo-file-system` `uploadAsync` (MULTIPART, streamé, premier plan) envoie le `.mov` + le sidecar (param). Serveur (Node runtime) : endpoint `POST /api/captures` stocke `data/media/<captureId>/{clip.mov,sidecar.json}`, insère une ligne `captures` (SQLite via le store existant), lance la détection des 2 flashs (ffmpeg → YAVG par frame, détection adaptative de fronts) et fitte le time-map sur les 2 ancres (sidecar.scheduledMs ↔ temps vidéo). `GET /api/captures` (liste, gaté) + `GET /api/captures/:id/clip` (sert le clip) + section `/debug`. ffmpeg via `execFile` (jamais `exec`).

**Tech Stack:** ffmpeg 7.1 (`signalstats`), `node:sqlite`, `expo-file-system` uploadAsync, `fitLinearTimeMap`/`sidecarSchema` (`@valk/shared`).

## Global Constraints
- ffmpeg appelé via **`execFile('ffmpeg', [...args])`** (pas de shell, pas d'injection). maxBuffer large.
- Détection flashs **adaptative** (médiane + écart) — pas de seuil absolu (le flash illumine le visage, YAVG monte au-dessus du fond, pas jusqu'à 235). Valider sur clip réel au test device, tuner si besoin.
- Endpoints en `runtime='nodejs'`. `GET` gatés par `VALK_DEBUG_KEY` ; `POST /api/captures` = ingestion (ouverte, comme `/api/logs`).
- Stockage local (`data/media/`, déjà gitignored). Interface `Storage` étendue (table `captures`).
- Upload **premier plan** (garder l'app ouverte), `ngrok-skip-browser-warning`. Branche `feat/valk-A4-upload`.

## Task 1 — Serveur : détection flashs + time-map (`@valk/web`, headless)
**Files:** Create `apps/web/src/lib/observability/flash-detect.ts` + `__tests__/flash-detect.test.ts`.
- [ ] `extractLuma(clipPath): Promise<{t:number;y:number}[]>` via `execFile ffmpeg -vf signalstats,metadata=print:file=-` (parse `pts_time` + `lavfi.signalstats.YAVG`).
- [ ] `detectFlashes(luma): number[]` adaptatif : seuil = médiane + k·(p95−médiane) (ou MAD) ; fronts montants groupés en events ; retourne les temps (s) des fronts.
- [ ] `computeTimeMap(clipPath, sidecar)`: détecte 2 flashs, mappe au sidecar (start=1er, end=dernier), `fitLinearTimeMap([{stim:scheduledMs_start,video:t1*1000},{stim:scheduledMs_end,video:t2*1000}])` → `{a,b,anchors,status}` (status `'sync_unverified'` si <2 flashs).
- [ ] Test : générer une vidéo synthétique (ffmpeg drawbox 2 flashs) dans le test, `detectFlashes` trouve 2 fronts ; `computeTimeMap` renvoie a≈1 cohérent. (Le test crée la vidéo via execFile, l'analyse, nettoie.)
- [ ] `npm test -w @valk/web` vert. Commit.

## Task 2 — Serveur : ingestion + stockage + lecture
**Files:** Modify `apps/web/src/lib/observability/db.ts` (table `captures` + méthodes) ; Create `apps/web/src/app/api/captures/route.ts`, `apps/web/src/app/api/captures/[id]/clip/route.ts` ; Modify `apps/web/src/app/debug/page.tsx` (liste captures).
- [ ] `db.ts` : table `captures (id, session_id, created_at, clip_path, size, sidecar JSON, time_map JSON, status)` + `insertCapture`, `listCaptures`, `getCapture`.
- [ ] `POST /api/captures` (nodejs) : `request.formData()` → clip (Blob) + sidecar (string) ; valide `sidecarSchema` ; écrit `data/media/<id>/{clip.mov,sidecar.json}` ; `computeTimeMap` ; `insertCapture`. Renvoie `{captureId, timeMap}`.
- [ ] `GET /api/captures` (gaté) → `listCaptures`. `GET /api/captures/:id/clip` (gaté) → stream le `.mov`.
- [ ] `/debug` : section « Captures » (id, taille, durée, timeMap a/b/status, lien clip).
- [ ] Tests route (POST clip synthétique + sidecar → 200 + capture persistée + timeMap). `npm run build -w @valk/web` OK. Commit.

## Task 3 — Mobile : upload du clip + sidecar
**Files:** Modify `apps/mobile/app/protocol.tsx` (upload après capture).
- [ ] Après `capture.done` : bouton « Envoyer au serveur » (et/ou auto) → `uploadAsync(`${apiBase}/api/captures`, clipUri, { uploadType: MULTIPART, fieldName:'clip', mimeType:'video/quicktime', parameters:{ sidecar: JSON.stringify(sidecar), sessionId } , headers:{'ngrok-skip-browser-warning':'true'} })`.
- [ ] État upload (idle/uploading/done/error), `logger.info('protocol','upload.done',{captureId,status})`, erreurs → `captureException`. Garder l'app ouverte (texte).
- [ ] `tsc` + `expo export` OK. Commit.

## Task 4 — Validation device réel
- [ ] Re-tunnel + apiBaseUrl + republish (mémoire device-test-workflow). Utilisateur : capture guidée → « Envoyer au serveur ».
- [ ] Vérifier via `/debug` : capture stockée, **time-map calculé sur les 2 flashs réels** (a,b, status=verified), clip rejouable depuis le serveur. Critère d'acceptation A4 + tuning du seuil de détection si besoin sur le vrai clip.

## Différé → B
MediaPipe serveur (oculométrie), DSP voix, Claude vision, scoring within-subject — sur les clips uploadés.

## Self-Review
Couverture spec §7 (ingestion/stockage) + §9 (détection flashs + time-map) : T1-T3 ; device T4. `fitLinearTimeMap` (testé shared) consommé ici ; détection ffmpeg validée headless sur vidéo synthétique.
