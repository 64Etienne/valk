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

## Validation préalable (faite — dé-risquage avant le plan)

Vérifié sur les 2 clips iPhone réels déjà uploadés, **avant** d'écrire le plan :
- **Env** : `venv` 3.12 via `uv` + `mediapipe 0.10.35` (API Tasks) + `opencv 4.13` : OK. Modèle
  `face_landmarker.task` (3.8 Mo) → **478 landmarks, visage détecté 100 %** des frames.
- **Signal** : iris-relatif-au-visage **suit le stimulus** (`r≈0.68` brut, **0.70 lissé**, consistant
  sur les 2 clips), avec un léger **retard** = dynamique de poursuite réelle. L'iris-dans-l'œil ne suit
  pas (`r≈0.08`) → écarté. Head-yaw négligeable (poursuite faite aux yeux).
- Pipeline d'alignement (flashs → time-map → `pursuitX`) tourne de bout en bout sur le clip réel.

⇒ La formule `gazeH` ci-dessous est la **version validée**, pas une hypothèse.

## Architecture (frontières nettes : vision isolée en Python, temps/orchestration en Node)

### `tools/vision/` — la vision (Python, venv 3.12 isolé)
- `extract_gaze.py <clip.mov>` → **stdout JSON** : `{ fps, width, height, frames: [{ t, gazeH, irisPx:[x,y], ok }] }`.
  - **MediaPipe Tasks `FaceLandmarker`** (modèle `face_landmarker.task`, `running_mode=VIDEO`, `num_faces=1`, **478 landmarks dont iris**). Lecture frames + timestamps via OpenCV (`cv2.VideoCapture`, timestamp = `idx/fps`). NB : mediapipe 0.10.35 n'expose **pas** l'API `solutions` (FaceMesh) → API Tasks obligatoire.
  - **`gazeH` = iris relatif à la largeur du VISAGE** (validé sur clips réels, cf. ci-dessous) :
    `gazeH = (irisX − faceLeftX) / (faceRightX − faceLeftX)`, avec `irisX` = moyenne des x des centres d'iris `468`/`473`, `faceLeftX = lm[234].x`, `faceRightX = lm[454].x`.
    ⚠️ **PAS** l'iris-dans-l'œil (ratio entre coins `33/133/362/263`) : testé → `r≈0.08`, **inutilisable** (coins trop bruités). L'iris-relatif-au-visage donne `r≈0.68`.
  - `irisPx` = pixel de l'iris (pour l'overlay). `ok=false` si pas de visage sur la frame.
- `draw_overlay.py <clip.mov> <signal.json> <out.mp4>` → dessine par frame le point iris +
  un repère de la position du stimulus (depuis `signal.json`) → `overlay.mp4`.
- Env : `tools/vision/.venv` (gitignoré), créé par `tools/vision/setup.sh` (`uv venv --python 3.12`
  + `uv pip install` mediapipe/opencv-python/numpy, **versions épinglées** dans `requirements.txt`).
  Override du binaire : `VALK_VISION_PYTHON` (défaut `tools/vision/.venv/bin/python`).

### Node — l'orchestration & le temps
- `apps/web/src/lib/analysis/gaze.ts` :
  - `runExtraction(clipPath)` : `execFile(visionPython, ['extract_gaze.py', clipPath])` (pas de shell),
    parse le JSON, timeout 120 s, maxBuffer large.
  - `buildSignal(frames, sidecar, timeMap)` : **lisse** `gazeH` (moyenne glissante CENTRÉE
    w≈7 frames/~0.23 s — validé : améliore `r` de 0.68 à 0.70 ; éviter le bug bord-de-convolution).
    Pour chaque frame à `t_v` (ms) → `stim_ms = (t_v − b)/a` ; `stimulusX = pursuitX(model, stim_ms)` ;
    ne garde que la fenêtre `[startMs, startMs+durationMs]`. Normalise `gazeH` (plage robuste
    p5–p95) et `stimulusX` en [0,1]. Aligne le **signe** sur le stimulus par corrélation
    (drapeau `signFlipped` exposé — le miroir caméra donne un signe négatif). Renvoie
    `{ points:[{t, stimulusX, gazeX, ok}], r, facePct, signFlipped }`.
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
de métriques → B2). Dépendances **déjà montées et validées** : venv 3.12 (`uv`) + mediapipe 0.10.35
(API Tasks) + opencv + modèle `face_landmarker.task`, signal de regard prouvé sur clips réels
(`r≈0.70`). Le plan formalise ces scripts/endpoints, pas un pari technique.
