# Valk B3 — Métriques de poursuite (vrai gain via calibration) — Design

> Sous-projet B, itération 3. Suite de B1 (signal regard) + B2 (calibration gazeH→écran).

## Objectif

Quantifier chaque capture de poursuite avec des métriques standard d'oculométrie, suivies
dans le temps (within-subject) : **gain** (via la calibration B2), **retard/avance** (ms),
**RMSE** de suivi, **saccades de rattrapage**, `r` au pic.

## Dé-risquage (fait, sur données réelles)

- Poursuite du 29/06 + calibration **même géométrie** → **gain = 0.807** (plausible : poursuite
  lente saine ≈ 0.8–0.95). Avec une calibration d'**autre géométrie** → 0.324 (absurde).
  ⇒ **La calibration doit être proche dans le temps/géométrie de la poursuite.** Les métriques
  enregistrent la calibration utilisée (id, R², âge) ; validation device = calib + poursuite enchaînées.
- Lag mesuré −100 ms (**avance** = anticipation, normale sur sinusoïde prévisible) ; 4 saccades (0.66/s).
- L'offset absolu (intercept `c`) ne se transfère pas entre sessions → **RMSE centré** (moyennes
  soustraites), et le **gain = pente de régression** regard-calibré ~ stimulus (invariant à l'offset,
  robuste au bruit — contrairement au ratio d'écarts-types).

## Définitions des métriques

Sur la fenêtre du stimulus (sélection identique à B1), regard lissé (MA centrée w=7) :
- **Regard calibré** : `gx(t) = m·gazeH(t) + c` (unités écran 0..1), avec la **calibration `ok`
  la plus récente** (store). Sans calibration → `gain=null`, `rmse=null`, status `no_calibration`
  (lag/r/saccades restent calculés).
- **Lag** : corrélation croisée `gx` vs `stimulusX` sur ±500 ms ; le décalage qui maximise `r`.
  Convention : **positif = retard** du regard, négatif = avance. `rPeak` = r à ce décalage.
- **Gain** : pente de régression `gx ~ stim` **après alignement au lag** : `cov(gx,stim)/var(stim)`.
  1.0 = poursuite parfaite.
- **RMSE** : `rms((gx−mean(gx)) − (stim−mean(stim)))` après alignement (unités écran, centré).
- **Saccades** : pics de vitesse du regard (lissage w=3, dérivée·fps), seuil robuste
  `médiane+6·1.4826·MAD(|v|)`, réfractaire 100 ms → compte + taux/s. Indépendant de la calibration
  (seuil auto-échelonné).

## Architecture (extension minimale de B1/B2)

- **`apps/web/src/lib/analysis/metrics.ts`** (pure) :
  `computePursuitMetrics(window, fps, calib | null): PursuitMetrics` où `window = {t,gaze,stim}[]`
  vient d'un helper partagé `selectPursuitWindow(extraction, sidecar, timeMap)` extrait de `gaze.ts`
  (utilisé aussi par `buildSignal` — DRY).
  `PursuitMetrics = { gain|null, lagMs, rPeak, rmse|null, saccades, saccadesPerSec, calibrationId|null, calibrationR2|null, calibrationAgeMs|null, status: 'ok'|'no_calibration' }`.
- **Stockage** : champ optionnel `metrics?: PursuitMetrics` ajouté à `GazeSignal` (JSON en colonne
  `analysis` → rétro-compatible, pas de migration).
- **Route `analyze`** (branche poursuite) : après `buildSignal`, cherche la **calibration `ok` la
  plus récente** (`listCaptures()` est trié DESC → premier `calibration?.status==='ok'`), calcule
  les métriques, les attache au signal stocké, les renvoie.
- **`/debug`** : sous les courbes de poursuite, ligne métriques : `gain`, `retard/avance X ms`,
  `RMSE`, `saccades (taux)`, calibration utilisée (id court + R²). Avertissement si `no_calibration`.

## Tests

- **Unitaires `metrics.test.ts`** (synthétiques) : poursuite parfaite via mapping inverse → gain≈1,
  lag≈0, rmse≈0 ; amplitude 0.7 → gain≈0.7 ; retard de 4 frames → lag≈+133 ms ; spikes → saccades
  comptées ; calib null → `no_calibration` avec lag/r présents.
- **Device (validation finale)** : **calibration puis poursuite enchaînées** (même géométrie) →
  gain attendu ~0.8–1.1, métriques affichées dans `/debug`.

## Hors périmètre (B4+)
Historique/tendances des métriques dans le temps (UI), voix, Claude vision. Le protocole combiné
(calibration+poursuite en une seule capture) est noté comme amélioration future du protocole.
