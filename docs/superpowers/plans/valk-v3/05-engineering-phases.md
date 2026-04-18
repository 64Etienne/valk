# 05 — Engineering Phases : breakdown commit-par-commit

**But :** traduire les phases du master plan en suite de commits livrables, testables, reviewables.

Convention :
- Chaque item = 1 commit (sauf mention)
- Chaque commit = diff bornée + test + critère de vérification
- Pas de merge sans passage des tests

---

## Phase 0 — Démolition *(2 jours)*

### 0.1 Réécriture prompt Claude — retirer fabriqués et seuils non étayés
**Fichiers :** `src/lib/analysis/claude-prompt.ts`
**Changements :**
- Retirer toute mention de Kim 2012, Jolkovsky 2022, Castro 2014
- Retirer "r²=0.96", "94% recovery", "<110 wpm", ">250ms mean pause", ">0.3 flatness"
- Retirer les seuils absolus numériques sans citation vérifiée
- Ajouter bloc "IMPLEMENTATION DIVERGENCE NOTE"
- Reformuler les 3 catégories en "deviation indicators" (pas diagnostic)

**Tests :** `npm test` + grep suivants doivent retourner 0 :
```
grep -i "Kim 2012" src/lib/analysis/claude-prompt.ts
grep -i "r²=0.96" src/lib/analysis/claude-prompt.ts
grep -i "Jolkovsky" src/lib/analysis/claude-prompt.ts
grep -i "Castro" src/lib/analysis/claude-prompt.ts
grep -i "94%" src/lib/analysis/claude-prompt.ts
```

**Vérification :** lire le prompt final, chaque chiffre doit être sourceable depuis `01-science-foundation.md`.

### 0.2 Retirer CTA Uber + verdicts conduite
**Fichiers :** `src/components/results/VerdictBanner.tsx` (à supprimer ou refactorer), `src/app/results/page.tsx`
**Changements :**
- Supprimer le bouton/lien Uber
- Remplacer "tu ne peux pas conduire" par "si tu as bu, ne conduis pas" (statement, pas verdict)
- Retirer toute wording implying driving fitness determination

**Tests :** E2E Playwright vérifie absence du mot "Uber" et absence de "peux conduire" dans le DOM de `/results` pour tous les verdicts.

### 0.3 Retirer sclera color + pseudo-HGN du payload
**Fichiers :** `src/app/api/analyze/route.ts` (schema Zod), `src/lib/analysis/claude-prompt.ts`, features extraction
**Changements :**
- Zod : optional ou retirer `scleralColorLAB`, `scleralRednessIndex`, `scleralYellownessIndex`
- Prompt : ne pas mentionner scleral color / rougeur
- Nystagmus clues : retirer du schema pour Tier 1 (sera retravaillé pour Tier 2 HGN-alike)

**Tests :** unit test sur payload schema, E2E s'assurer que l'analyze fonctionne sans ces champs.

### 0.4 Onboarding disclaimer renforcé
**Fichiers :** `src/app/page.tsx`, nouveau `src/components/common/ExperimentalDisclaimer.tsx`
**Changements :**
- Ajouter bandeau permanent sur `/`, `/capture`, `/baseline`, `/results`, `/quick`
- Texte exact : voir [02-product-repositioning.md section 5](./02-product-repositioning.md#5-messages-utilisateur-obligatoires)

**Tests :** E2E vérifie présence du disclaimer sur chaque page listée.

### 0.5 Commit final phase 0
Merge les 4 précédents après review. Tag `v2.0-alpha` pour marquer la coupe.

---

## Phase 1 — Tier 1 Baseline-mode shipping *(5 jours)*

### 1.1 Type `DeviationReport` + module `src/lib/analysis/deviation.ts`
**Fichiers nouveaux :** `src/lib/analysis/deviation.ts`, `src/types.ts` (ajouts)
**Implémentation :**
```ts
export interface DeviationReport {
  overallDeviation: number; // 0-100
  perFeature: Array<{
    name: string;
    currentValue: number | null;
    baselineValue: number | null;
    deviationScore: number; // 0-100 or null if not computable
    severity: "normal" | "mild" | "moderate" | "marked";
    weight: number;
  }>;
  topDeviantFeatures: string[]; // top 3 by deviationScore
  qualityGatesFailed: string[];
}

export function computeDeviation(
  current: AnalysisPayload,
  baseline: PersonalBaseline
): DeviationReport { ... }
```

**Features incluses :** pursuit gain delta, saccade rate delta, blink rate delta, PERCLOS delta, MFCC cosine distance, speech rate delta, spectral flatness delta.

**Tests :** `deviation.test.ts` avec baselines + currents synthétiques → deviations attendues.

### 1.2 Quality gates dans `/api/analyze`
**Fichiers :** `src/app/api/analyze/route.ts`, nouveau `src/lib/analysis/quality-gates.ts`
**Implémentation :**
```ts
export enum QualityGate {
  BASELINE_REQUIRED = "baseline_required",
  LOW_FPS = "fps_below_minimum",
  VOICE_CAPTURE_FAILED = "voiced_ratio_below_minimum",
  FACE_TRACKING_UNSTABLE = "face_lost_rate_above_maximum",
  PUPIL_ASYMMETRY_ARTIFACT = "pupil_asymmetry_suggests_landmarking_error",
  BASELINE_STALE = "baseline_age_exceeds_limit",
}

export function checkQualityGates(payload: AnalysisPayload, baseline?: PersonalBaseline): QualityGate[] { ... }
```

Seuils :
- FPS < 10 → LOW_FPS (hard block)
- voicedRatio < 0.30 → VOICE_CAPTURE_FAILED
- face_lost_rate > 0.10 → FACE_TRACKING_UNSTABLE
- pupil ratio < 0.70 or > 1.30 → PUPIL_ASYMMETRY_ARTIFACT
- baseline ageDays > 90 → BASELINE_STALE

Dans route analyze :
```ts
const gates = checkQualityGates(parsed.data, baseline);
if (gates.length > 0) {
  send("status", { code: "quality_insufficient", gates });
  audit("analyze.quality_insufficient", { gates });
  return;
}
```

**Tests :** unit tests sur chaque gate, intégration test avec payload dégradé.

### 1.3 Mandatory baseline redirect
**Fichiers :** `src/components/capture/GuidedCapture.tsx`, `src/app/capture/page.tsx`
**Changement :**
```tsx
useEffect(() => {
  if (mode === "analyze" && !loadBaseline()) {
    setShowBaselineModal(true);
  }
}, [mode]);
```
Modal avec 2 CTA : "Calibrer" → `/baseline`, "Quick check" → `/quick` (futur)

**Tests :** E2E avec localStorage vide → modal apparaît, bouton Calibrer redirige.

### 1.4 Nouveau prompt Claude "explain deviation"
**Fichiers :** `src/lib/analysis/claude-prompt.ts`
**Changement :** nouvelle fonction `buildDeviationExplanationPrompt(report: DeviationReport, context: UserContext)` qui demande à Claude :
- Expliquer les 3 features les plus déviantes en langage clair
- Proposer 2-3 alternative explanations (fatigue, stress, medication, alcool, capture quality)
- Rappeler la limitation
- NE PAS donner de score, NE PAS dire "tu peux conduire"

**Tests :** snapshot tests avec DeviationReport fixtures → output contient les 3 features, ne contient aucun chiffre BAC.

### 1.5 UI `/results` Tier 1 refonte
**Fichiers :** `src/components/results/ProgressiveResults.tsx`, nouveau `src/components/results/DeviationReport.tsx`, `src/components/results/QualityInsufficientBanner.tsx`
**Changement :** remplacer les 3 CategoryCard par :
- 1 scalar principal "Score de déviation : 42/100 (modéré)"
- 3 feature cards expliquant les plus déviantes
- 1 Claude narrative section
- 1 disclaimer renforcé

Si `status.code === "quality_insufficient"` → afficher QualityInsufficientBanner avec raisons claires.

**Tests :** Playwright avec payload Tier 1 normal + Tier 1 quality-insufficient.

### 1.6 Baseline quality gate
**Fichiers :** `src/components/capture/GuidedCapture.tsx` (mode baseline)
**Changement :** en mode `baseline`, appliquer les mêmes quality gates. Si échec, ne pas saveBaseline, afficher message "Calibration ratée, recommence dans de meilleures conditions".

**Tests :** E2E avec getUserMedia mock dégradé → saveBaseline NOT called.

### 1.7 Tests et merge phase 1
Vérifier 53+ tests passants (existants + nouveaux).

---

## Phase 2 — Capture quality fixes *(4 jours, parallèle)*

### 2.1 Downscale MediaPipe via offscreen canvas
**Fichiers :** `src/lib/hooks/useMediaPipe.ts`, `src/components/capture/GuidedCapture.tsx`
**Changement :**
```ts
const offscreenCanvas = new OffscreenCanvas(480, 640);
const ctx = offscreenCanvas.getContext("2d");

function detectDownscaled(video: HTMLVideoElement, ts: number) {
  ctx.drawImage(video, 0, 0, 480, 640);
  return landmarker.detectForVideo(offscreenCanvas, ts);
}
```

**Tests :** E2E Chromium measure averageFPS before/after → expected 4→20 minimum on test system. iPhone verification deferred to manual test.

### 2.2 VAD énergie+ZCR
**Fichiers :** `src/lib/audio/vad.ts` (nouveau), `src/lib/audio/voice-analyzer.ts`
**Implémentation :**
```ts
const FRAME_MS = 20;
function energyZcrVad(samples: Float32Array, sampleRate: number): boolean[] { ... }
```
Threshold energy : moyenne adaptative + hystérésis 100 ms.
ZCR bound : [0.02, 0.20] pour voiced speech.

**Getter audio modifié :**
```ts
getUserMedia({
  audio: {
    echoCancellation: false,
    noiseSuppression: true,
    autoGainControl: false,  // <-- off
    sampleRate: { ideal: 44100 },
    channelCount: 1,
  }
})
```

**Tests :** unit test sur WAV réel → voicedRatio ≥ 0.40.

### 2.3 Pupil measurement filtering
**Fichiers :** `src/lib/eye-tracking/pupil.ts` (ou équivalent)
**Changement :**
- Filtrer frames EAR < 0.20 (blinks)
- Trimmed mean 10-90 percentile
- Retourner aussi `confidence`, `nFramesUsed`
- Si nFramesUsed < 10 → `pupilDiameter = null`

### 2.4 Anisocorie sanity check
**Fichiers :** extraction features
**Changement :** si |pupilL - pupilR| > 0.5mm → `pupilAsymmetryArtifactSuspected: true` dans payload, et un quality gate level "warning" dans route analyze.

### 2.5 PLR sanity
**Fichiers :** `src/lib/eye-tracking/plr.ts`
**Changement :** si amplitude < 0.2mm OR > 3mm OR latency > 1000ms → set all PLR fields to 0 et `plrUnavailable: true`.

### 2.6 Retrait scleral color
**Fichiers :** payload schema, claude-prompt.ts, extraction features
**Changement :** retirer complètement scleralColorLAB, scleralRednessIndex, scleralYellownessIndex du pipeline. Update Zod schema.

### 2.7 Blink rate / PERCLOS : agrégation sur la durée totale de capture
**Fichiers :** `src/lib/eye-tracking/feature-extractor.ts` (ou équivalent), `src/types/index.ts`
**Raison :** le champ `baseline.blinkRate` est actuellement mesuré sur la phase_1 de 5 s seulement. Statistiquement insuffisant (blink rate normal 12-20/min = 1-1,7 clignements en 5 s). Claude le signale dans ses limitations — il faut le réparer dans l'extraction.
**Changement :**
- Le blink detector aggrège sur toutes les phases pré-lecture (phase_1 + phase_2_close + phase_2_flash + phase_2_dark + phase_3), soit ~30 s au lieu de 5 s
- Exclure les périodes où l'utilisateur a les yeux intentionnellement fermés (phase_2_close après détection du closure)
- Si frames valides < 500 (≈ 30 s à 15 FPS) → `blinkRate = null`, exclu du scoring
- Même logique pour PERCLOS
- Mettre à jour le prompt pour indiquer la fenêtre de mesure ("blink rate mesuré sur ~30 s de capture active")
**Vérification :** test unitaire avec série synthétique 30 s contenant 8 blinks → blinkRate = 16/min (±1) ; avec 2 blinks sur 5 s → blinkRate = null ou flagged.

### 2.8 Tests et merge phase 2

---

## Phase 3 — Corpus collection infrastructure *(3 jours)*

### 3.1 Mode "corpus collection" dans Settings
**Fichiers :** nouveau `src/app/settings/page.tsx`, local state
**Changement :** page `/settings` avec toggle "Mode collecte corpus". Persistance dans localStorage. Si activé, affiche champ BAC après chaque capture.

### 3.2 Schema Supabase + migration
**Fichiers :** nouveau `supabase/migrations/20260420_corpus_labels.sql`
**Changement :** CREATE TABLE `valk_corpus_labels` (voir [04-corpus-collection.md section 4](./04-corpus-collection.md)).
RLS strict : seul le rôle admin peut lire. Écriture anonyme possible si opted-in.

### 3.3 Route `/api/corpus` POST
**Fichiers :** nouveau `src/app/api/corpus/route.ts`
**Logique :** insert in Supabase si configuré, sinon retour 204 (store local).

### 3.4 Store local + sync
**Fichiers :** nouveau `src/lib/corpus/store.ts`
**Logique :**
```ts
export function saveCorpusLabel(entry: CorpusEntry): Promise<void> {
  // Always save to localStorage
  // If user opted-in Supabase sync, POST /api/corpus too
}
```

### 3.5 UI saisie BAC post-capture
**Fichiers :** `src/components/capture/BacInputModal.tsx` (nouveau)
**Apparaît :** après capture Tier 1 ou Tier 2 si settings corpus = true, AVANT la page /results.
**Fields :** BAC 0.00-0.15, device model (optional), notes.

### 3.6 Page `/settings/corpus` — liste + export CSV
**Fichiers :** nouveau `src/app/settings/corpus/page.tsx`
**Features :** liste des captures labellisées locales, compte, bouton export CSV, bouton delete individual, bouton delete all (RGPD).

### 3.7 Tests phase 3
E2E : activer corpus, faire une capture mockée, vérifier que BAC modal apparaît, entrée, vérifier que stored local + (if Supabase) synced.

---

## Phase 4 — Tier 2 SFST-équivalent protocol *(15 jours)*

### 4.1 HGN-alike — stimulus
**Fichiers :** nouveau `src/components/capture/HgnStimulus.tsx`
**Implémentation :** Web Animations API pour animer la pastille selon la trajectoire spec dans [03-protocol](./03-protocol-sfst-equivalent.md#2-test-1--hgn-alike-90s). Compositor-thread comme PursuitDot v2.

### 4.2 HGN-alike — détection nystagmus + pursuit
**Fichiers :** nouveau `src/lib/analysis/hgn.ts`
**Fonctions :**
- `detectNystagmusSpectralPower(irisPositions, fpsEstimated): { powerRatio, peakHz }`
- `computePursuitVelocityRatio(irisPositions, targetPositions, fps): number`
- `computeHgnClues(capture: HgnCapture): { clues: HgnClue[], subScore: number }`

**Tests :** unit sur signaux synthétiques (nystagmus simulé à 4 Hz, pursuit parfait, etc.).

### 4.3 HGN-alike — intégration flow
**Fichiers :** nouveau composant `src/components/capture/Tier2HgnStep.tsx`
**Intégration :** dans un nouveau `src/components/capture/QuickCheck.tsx` séquençant les 4 tests.

### 4.4 Romberg — hook `useDeviceMotion`
**Fichiers :** nouveau `src/lib/hooks/useDeviceMotion.ts`
**Features :**
- `requestPermission()` pour iOS
- Accumule samples à ~60 Hz
- Retourne `{ samples: MotionSample[], permissionState, error }`

### 4.5 Romberg — sway analysis
**Fichiers :** nouveau `src/lib/analysis/postural-sway.ts`
**Fonctions :**
- `highPassFilter(samples, cutoffHz)`
- `computeJerk(samples)`
- `swayFeatures(samples): { rms, peakHz, hfRatio, totalPath }`
- `scorePostural(features, thresholds): number`

### 4.6 Romberg — UI step
**Fichiers :** `src/components/capture/Tier2RombergStep.tsx`
Countdown visuel 20s, phone à bras tendu, yeux fermés.

### 4.7 Cognitive — Web Speech API integration
**Fichiers :** nouveau `src/lib/hooks/useSpeechRecognition.ts`
**Features :**
- Start/stop recognition
- Continuous results
- `onResult(transcript, isFinal, timestamp)`
- French fr-FR locale

### 4.8 Cognitive — tasks flow
**Fichiers :** `src/components/capture/Tier2CognitiveStep.tsx`
Task A (100-7), Task B (months backward). UI montre la transcription en temps réel.

### 4.9 Cognitive — scoring route
**Fichiers :** nouveau `src/app/api/cognitive-score/route.ts`
Prompt Claude :
```
You evaluate a French speaker's recitation of a known sequence.
Task: {task_description}
Expected: {expected_sequence}
Transcribed: {stt_output}
Timing: {word_timestamps}

Respond with JSON:
{
  "attempted": bool,
  "accuracy": 0-1,
  "completion_time_ms": int,
  "hesitation_count": int,
  "self_corrections": int,
  "off_sequence_items": int,
  "qualitative_note": "1 sentence"
}
```

### 4.10 Reaction time — composant
**Fichiers :** nouveau `src/components/capture/Tier2ReactionTimeStep.tsx`
Canvas 2D, shapes randomisées, timing `performance.now()` sur `pointerdown`.

### 4.11 Reaction time — scoring
**Fichiers :** nouveau `src/lib/analysis/reaction-time.ts`
`scoreReactionTime(taps: TapEvent[], stimuli: StimulusEvent[]): { meanRT, sdRT, commissionRate, omissionRate, score }`

### 4.12 Fusion sous-scores
**Fichiers :** nouveau `src/lib/analysis/tier2-fusion.ts`
```ts
export function fuseTier2Scores(
  hgn: number | null,
  postural: number | null,
  cognitive: number | null,
  reactionTime: number | null,
  thresholds: Tier2Thresholds
): { overall: number, verdict: "low" | "moderate" | "high", subScores }
```

Poids from `src/lib/analysis/tier2-thresholds.json` (initialement heuristiques, remplacé après calibration corpus).

### 4.13 UI Tier 2 complete flow
**Fichiers :** `src/app/quick/page.tsx`, `src/components/capture/QuickCheck.tsx`
4 steps séquentiels avec transitions, instructions claires, progression bar.

### 4.14 UI `/quick/results`
**Fichiers :** `src/app/quick/results/page.tsx`, `src/components/quick-results/*`
Display verdict + 4 sub-scores + Claude narrative + strong disclaimer.

### 4.15 Claude narrative pour Tier 2
**Fichiers :** nouveau prompt dans `src/lib/analysis/claude-prompt.ts` : `buildTier2NarrativePrompt`

### 4.16 Tests Tier 2
Unit tests pour chaque analyzer, E2E Playwright pour le flow complet (avec mocks audio + motion).

---

## Phase 5 — Corpus collection + calibration *(en parallèle 4-5, intense semaine 6)*

### 5.1 Recrutement, sessions, captures
Tâches non-code, voir [04-corpus-collection.md](./04-corpus-collection.md).

### 5.2 Pipeline analyse offline (notebook)
**Fichiers :** nouveau `scripts/corpus-analyze.ipynb` (ou équivalent .py)
- Charger corpus → DataFrame
- Distributions par BAC bucket
- Optimisation seuils par test (ROC curves)
- Logistic regression L1 pour poids fusion
- LOSO cross-validation

### 5.3 Export thresholds calibrés
**Fichiers :** `src/lib/analysis/tier2-thresholds.json` (mis à jour)
Résultat de la calibration remplace les valeurs heuristiques.

### 5.4 Rapport validation
**Fichiers :** `docs/superpowers/plans/valk-v3/05-validation-results.md` (à créer)
Contient :
- N corpus atteint
- Répartition BAC
- LOSO accuracy / AUROC / sensitivity / specificity
- Discussion des limites
- Décision : release public ou retraining needed

---

## Phase 6 — Production hardening *(5 jours)*

### 6.1 Sentry configuration finale
**Fichiers :** `instrumentation.ts`, env vars Vercel
Configurer DSN + release tracking + source maps.

### 6.2 Supabase production
**Fichiers :** `supabase/migrations/*`, env vars
Déployer migrations, configurer RLS, créer roles.

### 6.3 Lighthouse optimization
Cibler : Performance ≥85, Accessibility ≥90, Best Practices ≥95.

### 6.4 Tests E2E complets
Playwright Chromium : 4 scénarios au minimum :
- Tier 1 happy path (avec baseline)
- Tier 1 sans baseline → redirect
- Tier 2 happy path
- Quality gate déclenché → quality_insufficient UI

### 6.5 Manual iPhone testing
Session de test manuel iPhone sur chaque flow. Checklist :
- [ ] Tier 1 FPS ≥15 mesuré via audit logs
- [ ] Tier 1 voicedRatio ≥40% mesuré
- [ ] Tier 2 HGN fonctionne sans erreur
- [ ] Tier 2 Romberg permission granted + data collected
- [ ] Tier 2 Cognitive STT reconnait la parole
- [ ] Tier 2 RT mesure des RT plausibles
- [ ] Fusion verdict cohérent
- [ ] Disclaimers visibles partout

### 6.6 CHANGELOG, README, licence
Update docs pour version v3.0.

### 6.7 Tag release v3.0
Merge main → tag v3.0 → deploy Vercel production.

---

## Ordre résumé

```
Semaine 0 (Phase 0)  : Démolition (2j)
Semaine 1 (Phase 1)  : Tier 1 baseline-mode (5j)
Semaine 1-2 (Phase 2): Capture quality fixes (4j, parallèle)
Semaine 2 (Phase 3)  : Corpus infrastructure (3j)
Semaines 3-5 (Phase 4): Tier 2 SFST-équivalent (15j)
Semaines 3-6 (Phase 5): Corpus collection + calibration (parallel)
Semaine 6 (Phase 6)  : Production hardening (5j)
```

Durée totale : **~6 semaines de dev** + corpus en parallèle.

---

## Dépendances critiques entre phases

- **Phase 2 doit être done avant Phase 4.3+** (sans VAD correct, impossible de faire cognitive test ; sans FPS corrigé, HGN-alike impossible)
- **Phase 3 doit être done avant début Phase 5** (corpus infra requis pour la collecte)
- **Phase 5 doit atteindre N≥30 avant fin Phase 6.4** (sinon pas de calibration valide, Tier 2 release avec seuils litt-seulement = précision limitée)
- **Phase 1 (Tier 1 shipping) peut être release publiquement avant Phase 4 (Tier 2)** — c'est même recommandé, donne du corpus

---

## Strategie de release incrémentale

- **v3.0-alpha** : fin Phase 1 — Tier 1 avec baseline, sans Tier 2. Release publiquement.
- **v3.0-beta** : fin Phase 4 — Tier 2 avec seuils littérature pré-calibration. Release à volontaires seulement.
- **v3.0-rc** : fin Phase 5 — Tier 2 avec seuils calibrés corpus. Test interne.
- **v3.0** : fin Phase 6 — production ready. Release publique.
