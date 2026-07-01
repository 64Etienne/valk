# Valk B3 — Métriques de poursuite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Gain (calibré), lag (ms), RMSE centré, saccades — calculés par `analyze`, stockés dans `analysis.metrics`, affichés dans `/debug`.

**Architecture:** helper `selectPursuitWindow` extrait de `gaze.ts` (partagé buildSignal/metrics) ; module pur `metrics.ts` ; la route poursuite attache `metrics` au `GazeSignal` (champ optionnel → pas de migration) en utilisant la calibration `ok` la plus récente du store ; `/debug` affiche la ligne métriques.

**Tech Stack:** TypeScript pur (aucune dépendance), vitest. Extraction/calibration réutilisées de B1/B2.

## Global Constraints
- Lag : corrélation croisée ±500 ms (`round(0.5·fps)` frames) ; **positif = retard**. Gain : pente `cov/var` après alignement. RMSE : **centré**. Saccades : seuil `médiane+6·1.4826·MAD(|v|)`, réfractaire 100 ms, lissage w=3.
- Sans calibration : `status='no_calibration'`, `gain/rmse=null`, lag/r/saccades calculés.
- Calibration choisie : premier `listCaptures()` (DESC) avec `calibration?.status==='ok'`. Branche `feat/valk-B3-metrics`.

### Task 1 — `selectPursuitWindow` + `metrics.ts` + tests
**Files:** Modify `apps/web/src/lib/analysis/gaze.ts` (extraire+exporter la sélection) ; Create `apps/web/src/lib/analysis/metrics.ts` + `__tests__/metrics.test.ts`.
**Interfaces:** `selectPursuitWindow(extraction, sidecar, timeMap): {t,gaze,stim}[] | null` (null si pas pursuit) ; `computePursuitMetrics(window, fps, calib: {id,m,c,r2,createdAt}|null, nowMs): PursuitMetrics`.
- [ ] Extraire la boucle de sélection de `buildSignal` en `selectPursuitWindow` exportée ; `buildSignal` la consomme (tests gaze inchangés verts).
- [ ] Écrire `metrics.test.ts` (5 cas : gain≈1/lag≈0/rmse≈0 ; amplitude 0.7→gain≈0.7 ; retard 4 frames→lag≈+133ms ; spikes→saccades>0 ; calib null→no_calibration) puis `metrics.ts`. Vitest vert.
- [ ] Commit `feat(analysis): computePursuitMetrics (gain calibré, lag, RMSE, saccades)`.

### Task 2 — câblage route + type + /debug
**Files:** Modify `gaze.ts` (type `GazeSignal.metrics?`), `analyze/route.ts` (calcul+attache), `debug/page.tsx` (ligne métriques).
- [ ] `GazeSignal` : `metrics?: PursuitMetrics`. Route poursuite : trouver calib récente, `computePursuitMetrics(selectPursuitWindow(...), extraction.fps, calib, Date.now())`, `signal.metrics = m` avant stockage, renvoyer `metrics` dans la réponse.
- [ ] `/debug` : sous les courbes : `gain=X · retard/avance Y ms · RMSE Z · N saccades (T/s) · calib <id-court> R²=…` (ou avertissement no_calibration).
- [ ] `npm test -w @valk/web` + `npm run build -w @valk/web` verts. Commit.

### Task 3 — validation device réelle
- [ ] Republier (recette mémoire, config test non commitée). Utilisateur : **Calibration puis Capture guidée enchaînées** (même position). Auto-upload.
- [ ] `analyze` des deux → calibration `ok` (R²) puis poursuite avec `metrics.gain` ∈ ~[0.6,1.2]. Screenshot `/debug`. Merge + push (finishing-a-development-branch).

## Self-Review
Spec couvert : définitions (T1), stockage/route/affichage (T2), same-géométrie validée au device (T3). Types cohérents (`PursuitMetrics` T1 consommé T2). Pas de placeholder (le code détaillé est écrit directement en T1/T2, module court).
