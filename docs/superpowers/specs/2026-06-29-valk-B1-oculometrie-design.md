# Valk B1 — Oculométrie : extraction du regard + visualisation — Design

> Sous-projet B, itération 1. Skill de suite : superpowers:writing-plans.

## Objectif

Analyser une capture de poursuite oculaire lente côté serveur : **extraire la position
horizontale du regard frame par frame** (MediaPipe), l'**aligner au stimulus** via le
time-map vérifié (A4), et la **rendre visible** — courbes `x(t)` (regard vs stimulus) +
overlay vidéo. Objectif : confirmer *visuellement* que l'extraction est fiable et que la
poursuite est réelle, avant toute métrique.

## Périmètre

- **B1 (ce spec)** : extraction `gazeH`, alignement temporel, **visualisation** (courbes +
  overlay) + un indice de corrélation `r` quasi-gratuit.
- **Différé → B2** : métriques métrologiques (gain de poursuite, retard de phase, saccades
  de rattrapage), calibration du gaze absolu.
- YAGNI : on regarde le signal avant de le résumer.

## Architecture (frontières nettes : vision isolée en Python, temps/orchestration en Node)

### `tools/vision/` — la vision (Python, venv 3.12 isolé)
- `extract_gaze.py <clip.mov>` → **stdout JSON** : `{ fps, width, height, frames: [{ t, gazeH, irisPx:[x,y], ok }] }`.
  - MediaPipe FaceMesh (`refine_landmarks=True`, `max_num_faces=1`), lecture frames + timestamps via OpenCV.
  - `gazeH` = moyenne des ratios horizontaux de l'iris entre coins, par œil :
    - œil gauche-image : interne `133`, externe `33`, iris `468` → `(iris_x − 133_x)/(33_x − 133_x)`
    - œil droit-image : interne `362`, externe `263`, iris `473` → `(iris_x − 362_x)/(263_x − 362_x)`
  - `irisPx` = pixel de l'iris (pour l'overlay). `ok=false` si pas de visage sur la frame.
  - (Indices landmarks à confirmer à l'implémentation : la viz sur clip réel révèle toute erreur.)
- `draw_overlay.py <clip.mov> <signal.json> <out.mp4>` → dessine par frame le point iris +
  un repère de la position du stimulus (depuis `signal.json`) → `overlay.mp4`.
- Env : `tools/vision/.venv` (gitignoré), créé par `tools/vision/setup.sh` (`uv venv --python 3.12`
  + `uv pip install` mediapipe/opencv-python/numpy, **versions épinglées** dans `requirements.txt`).
  Override du binaire : `VALK_VISION_PYTHON` (défaut `tools/vision/.venv/bin/python`).

### Node — l'orchestration & le temps
- `apps/web/src/lib/analysis/gaze.ts` :
  - `runExtraction(clipPath)` : `execFile(visionPython, ['extract_gaze.py', clipPath])` (pas de shell),
    parse le JSON, timeout 120 s, maxBuffer large.
  - `buildSignal(frames, sidecar, timeMap)` : pour chaque frame à `t_v` (ms) →
    `stim_ms = (t_v − b)/a` ; `stimulusX = pursuitX(model, stim_ms)` ; ne garde que la
    fenêtre `[startMs, startMs+durationMs]`. Normalise `gazeH` (plage robuste p5–p95) et
    `stimulusX` en [0,1]. Aligne le **signe** sur le stimulus par corrélation (drapeau
    `signFlipped` exposé). Renvoie `{ points:[{t, stimulusX, gazeX, ok}], r, facePct, signFlipped }`.
- **`POST /api/captures/[id]/analyze`** (`runtime nodejs`, gaté `VALK_DEBUG_KEY`) :
  charge la capture, lance extraction + `buildSignal`, stocke le signal, génère `overlay.mp4`.
  Si le time-map n'est pas `verified`, **analyse quand même** mais marque `status=sync_unverified`
  + avertit (alignement approximatif) — pas de refus dur. Découplé de l'upload (ré-analyse/tuning possible).
- **`GET /api/captures/[id]/overlay`** (gaté + containment) : sert `overlay.mp4`.

### Stockage
- Table `captures` : colonne `analysis TEXT` (JSON : `{ status, r, facePct, signFlipped, points }`,
  ~200 points → léger). `overlay.mp4` à côté du clip dans `data/media/<id>/`.
- Statuts analyse : `ok` | `gaze_unreliable` (visage < seuil) | `sync_unverified` | `failed`.

### `/debug`
- Par capture : bouton **« Analyser »** (composant client → POST analyze → `router.refresh()`).
- Après analyse : **courbes `x(t)`** en SVG serveur (2 polylignes stimulus/regard, trous aux
  `ok=false`), `r` + `facePct` + « signe auto-aligné » si `signFlipped`, lien **overlay**.

## Flux

capture (A) → upload + time-map (A4) → **« Analyser » → `extract_gaze.py` → `buildSignal`
(alignement via time-map) → signal stocké + `overlay.mp4` → courbes + overlay dans `/debug`**.

## Visualisation

- **Courbes** : X = temps (s) sur la fenêtre stimulus (~6 s), Y = position horizontale [0,1]
  (gauche→droite). Stimulus (violet) + regard (turquoise). SVG `polyline`, zéro dépendance.
- **Overlay** : `overlay.mp4` = clip + point iris + repère stimulus par frame.
- **`r`** : corrélation de Pearson regard↔stimulus sur la fenêtre (après alignement du signe) —
  « ça suit » en un chiffre. Téaser de B2, pas une vraie métrique.

## Honnêteté méthodologique

`gazeH` (iris-dans-l'œil) mélange rotation des yeux **et** de la tête. Bon proxy pour la
poursuite tête immobile ; noté, et le protocole pourra rappeler « garde la tête immobile ».
Le signe dépend du miroir caméra → aligné par corrélation et **affiché** (`signFlipped`),
jamais caché. Calibration du gaze absolu = hors périmètre B1.

## Gestion d'erreurs (rien de silencieux)

- Venv/Python absent → endpoint « vision non configurée » + log ; pas de crash muet.
- Visage < seuil de frames → `gaze_unreliable` + `facePct` affiché.
- Time-map `sync_unverified` → on analyse quand même mais on marque `status=sync_unverified`
  et on affiche un avertissement (alignement approximatif), pas de refus dur.
- Crash MediaPipe → `failed` loggé, 500 avec message. Overlay non-bloquant (courbes OK sans lui).
- Logs SQLite par étape : `extract.done` (frames, facePct), `align.done` (r), `overlay.done`.

## Tests

- **Math Node (unitaire)** : `buildSignal` sur landmarks synthétiques (poursuite parfaite → `r≈1`,
  détection du flip de signe, trous gérés, fenêtre correcte).
- **Contrat Python** : `extract_gaze.py` sur vidéo sans visage → JSON valide, tous `ok=false`.
- **Intégration clip RÉEL** : extraction sur le clip iPhone déjà uploadé → `r` nettement > 0
  (le regard corrèle au stimulus). Validation « pas à l'aveugle ».
- **Overlay** : `overlay.mp4` valide (ffprobe).
- **Device/e2e** : capture → upload → « Analyser » → courbes + overlay + `r` visibles.

## Sécurité

`execFile` (pas de shell), chemin clip serveur-contrôlé, endpoints gatés `VALK_DEBUG_KEY`,
overlay servi avec containment au dossier media (comme le clip).

## Self-review

Couvre : extraction (Python), alignement (time-map inverse + `pursuitX`), visualisation
(courbes + overlay + `r`), erreurs, tests, sécurité, env Python. Périmètre resserré (viz, pas
de métriques → B2). Dépendances vérifiées : python3.13 présent mais mediapipe exige 3.9–3.12 →
**venv 3.12 via `uv`** (à valider en première tâche du plan, comme ffmpeg pour A4).
