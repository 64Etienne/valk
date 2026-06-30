# Valk B2 — Calibration du regard (fondation du vrai gain) — Design

> Sous-projet B, itération 2. Skill de suite : superpowers:writing-plans.

## Objectif

Permettre un **vrai gain de poursuite** (œil ÷ cible, ~1.0 = parfait) en construisant la
brique manquante : une **capture de calibration** où l'utilisateur **fixe** des points à
positions écran connues, dont le serveur déduit le mapping `gazeH → position-écran`. Ce
mapping (par-utilisateur, géométrie stable) sera consommé par B3 pour convertir le regard de
poursuite en unités comparables au stimulus.

## Périmètre

- **B2 (ce spec)** : mode de capture **calibration** (fixation de 5 points horizontaux) +
  fit serveur `iris→x` + stockage + affichage du fit (R²) dans `/debug`.
- **Différé → B3** : métriques (gain via calibration + retard + RMSE + saccades) et suivi
  longitudinal.
- YAGNI : calibration **horizontale 1D** (le stimulus de poursuite est horizontal) ; pas de
  grille 2D.

## Pourquoi une capture dédiée (et pas implicite)

La **fixation** d'un point statique est précise (pas de problème de gain), donc donne un
mapping `gazeH→x` fiable. Calibrer sur les extrêmes de la poursuite elle-même serait
**circulaire** (supposerait le gain qu'on veut mesurer). D'où une capture séparée.

## ⚠️ Caveat validé en amont (prototype B1)

L'iris-relatif-au-visage ne varie que de **~0.035** sur tout le balayage horizontal → 5 points
espacés de ~0.009. La **médiane sur ~1 s de fixation** (~30 frames) lisse le bruit ; le **R²
du fit est le juge** de la faisabilité, mesuré sur la capture réelle. R² bas ⇒ on ajuste
(plus de points / fixations plus longues). Honnête, pas caché.

## Architecture

### `@valk/shared` — sidecar : union de stimuli
`StimulusModel` devient une **union discriminée sur `type`** :
- `PursuitModel` = `{ type:'smooth_pursuit_h', center, amplitude, cycles, startMs, durationMs }` (existant, renommé).
- `FixationModel` = `{ type:'fixation_h', points: [{ x:number, startMs:number, durMs:number }] }` (nouveau).
- `StimulusModel = PursuitModel | FixationModel`. `pursuitX(model: PursuitModel, tMs)` reste typé sur le pursuit.
- `sidecarSchema` accepte les deux (rétro-compatible avec les sidecars de poursuite existants). Tests : parse `fixation_h`, rejette un point sans `x`.

### Mobile — `app/calibration.tsx`
Mode guidé jumeau de la poursuite, mais points **fixes** :
- `flash(start)` → pour `x ∈ {0.1, 0.3, 0.5, 0.7, 0.9}` : point statique à `x`, consigne
  « fixe le point », ~1.5 s chacun → `flash(end)`. Enregistré, horloge `performance.now`.
- Sidecar : `stimuli:[{ type:'fixation_h', model:{ type:'fixation_h', points:[{x,startMs,durMs}] }, samples:[] }]`.
- **Réutilisation** : extraire les helpers communs de `protocol.tsx` dans `src/capture/` —
  `saveSidecar`, `uploadCapture` (fetch multipart + `x-valk-debug-key`), `ClipPlayback`,
  l'overlay flash + `brightnessMax/restore` — partagés par les deux écrans (DRY). L'orchestration
  (séquence de points) reste propre à chaque écran. Re-vérifier `protocol.tsx` au bundle après extraction.
- Accueil : bouton « Calibration ».

### Serveur — `apps/web/src/lib/analysis/calibration.ts` (fonction pure)
`fitCalibration(extraction, sidecar, timeMap): CalibrationResult` :
- Pour chaque point `{x, startMs, durMs}` : frames dont `stim_ms=(t_video−b)/a ∈ [startMs+400, startMs+durMs]` (skip settle), **médiane `gazeH`** → paire `(gazeH, x)` + variance intra-fixation.
- Régression moindres carrés `x = m·gazeH + c` + **R²** + résidu par point.
- Retour : `{ kind:'calibration', m, c, r2, points:[{x, gazeH, residual}], status }`.
  `status`: `ok` | `calibration_poor` (R²<0.8) | `failed` (<3 fixations valides).

### Dispatch + stockage
`POST /api/captures/[id]/analyze` lit `sidecar.stimuli[0].model.type` → `fixation_h` ⇒
`fitCalibration` + `setCaptureCalibration` ; `smooth_pursuit_h` ⇒ `buildSignal` (B1) inchangé.
Nouvelle colonne **`captures.calibration TEXT`** (ALTER idempotent) + `setCaptureCalibration(id, CalibrationResult)` + lecture dans `getCapture`/`listCaptures` (non-intrusif pour `analysis`).

### Affichage `/debug`
Capture de calibration : **nuage de points** SVG (X=`gazeH`, Y=`x` écran) + droite `m·gazeH+c`
+ **R²** + `m,c` + `status`. Réutilise le style de chart B1. Le bouton « Analyser » existant marche (dispatch serveur).

## Flux

Accueil → « Calibration » → fixer 5 points → upload (gaté) + time-map (A4) → « Analyser »
→ `fitCalibration` → mapping stocké → nuage + droite + R² dans `/debug`.

## Gestion d'erreurs
- < 3 fixations exploitables → `failed` + message.
- R² < 0.8 → `calibration_poor` (stocké + averti, pas bloquant).
- Variance intra-fixation élevée sur un point → point signalé (mauvaise fixation).
- time-map `sync_unverified` → comme B1, on calibre quand même mais on marque l'incertitude.
- Logs SQLite par étape.

## Tests
- **Math Node (`fitCalibration`)** : frames synthétiques, 5 fixations `gazeH=f(x)+bruit` → `m,c` retrouvés, `R²≈1` ; skip settle ; `<3 fixations → failed`.
- **Shared** : `sidecarSchema` parse `fixation_h`, rejette un point sans `x` ; `pursuitX` toujours typé `PursuitModel`.
- **Device** : capture de calibration réelle → R² + droite affichés (R² = juge de faisabilité).

## Sécurité
Inchangée vs B1/A4 : `execFile`, endpoints gatés `VALK_DEBUG_KEY`, chemins serveur-contrôlés.

## Self-review
Couvre : sidecar union (shared), écran calibration (device + extraction helpers), fit serveur
(`fitCalibration`), stockage (colonne `calibration`), dispatch endpoint, affichage `/debug`,
erreurs, tests. Périmètre B2 = calibration seule (gain/métriques → B3). Réutilise massivement
B1 (extraction iris, sync, upload). Risque connu (dynamique iris faible) explicite, jugé par le R² réel.
