# Valk v2 — Reconstruction pour fiabilité scientifique + technique

**Date :** 2026-04-18
**Auteur :** Claude (après audit PubMed des citations du prompt Claude)
**Statut :** proposé, en attente d'exécution

---

## 0. Résumé exécutif

L'app actuelle cite 7 études pour justifier son scoring. **3 citations sont fabriquées** (Kim 2012, Jolkovsky 2022, Castro 2014 — introuvables dans PubMed), **3 sont distordues** (Tyson 2021 r²=0.96, Suffoletto thresholds absolus, Cori pour "détection d'alcool par blinks"), et **1 est un rapport gouvernemental non peer-reviewed avec biais de base-rate massif** (Stuster & Burns 1998). Les seuils absolus utilisés dans le prompt (`gain <0.70`, `blink >16/min`, `pause mean >250ms`, `flatness >0.3`, `94% saccade recovery`) **sont tous inventés**.

Parallèlement, l'audit télémétrique de 3 sessions iPhone Safari réelles montre que l'implémentation technique diverge des méthodologies citées d'environ 1-2 ordres de grandeur :
- FPS mesuré : **4** (Tyson utilise 1000 Hz ; Suffoletto enregistre à 44,1 kHz)
- VAD effectif : **9,6 %** du signal audio reconnu comme voix (seuil d'alerte littérature : 30 %)
- Asymétrie pupillaire baseline : **0,87 mm** (physiologiquement implausible, artefact de landmarking)
- PLR : **0 mm** de constriction (saturation du capteur par l'écran flash, connu)
- Couleur sclérale : a*=17,8 (norme -2 à 8, aucune calibration colorimétrique)

**Conclusion d'audit :** l'app ne peut pas délivrer un verdict BAC-équivalent fiable sur webcam grand public. Elle peut, en revanche, fonctionner comme **outil de détection de déviation intra-sujet** à condition (a) d'imposer une calibration sobre, (b) de gate sur la qualité de capture, (c) de reformuler le prompt comme Δ-from-baseline et non score absolu.

Ce plan rebâtit l'app sur cette base honnête.

---

## 1. État actuel (référence)

### 1.1 Ce qui existe et fonctionne

- Capture guidée 4 phases (baseline/PLR/pursuit/reading)
- MediaPipe FaceLandmarker iris landmarks
- Stream SSE Claude avec UI progressive
- Page `/baseline` dédiée, `loadBaseline()`/`saveBaseline()` en localStorage
- `BaselineCompareBanner` + `BaselineStatusBadge`
- Pipeline audit serveur (commit `1267e2e`) : `analyze.payload.parsed` + `analyze.claude.rawText` + `analyze.final` récupérables via `GET /api/logs/:sid` en JSON brut
- Telemetry opt-in vers Supabase (non actif, env vars absentes)
- Debug mode `?debug=<key>` avec upload vidéo (non actif)
- Service worker v2 avec network-first HTML
- Pre-flight gate FPS + résolution
- 53 tests Vitest passants

### 1.2 Ce qui ne fonctionne pas scientifiquement

1. Citations du prompt Claude partiellement **fabriquées** (Kim/Jolkovsky/Castro) ou **distordues** (Tyson r², Suffoletto thresholds, Cori application)
2. **Seuils absolus sans baseline** : invalides étant donné la variance interindividuelle (blink rate 5-35/min normal, pursuit gain 0,65-1,05 normal)
3. **"HGN clues"** calculés sur sinusoïde continue alors que le protocole HGN requiert un stimulus static-then-slow-ramp à 45° avec hold de 4 s
4. **Pursuit gain = corrélation Pearson** alors que Tyson mesure un velocity ratio séparé en open-loop/closed-loop
5. **Voice features envoyés comme mean/std MFCC à un LLM** alors que Suffoletto utilise un SVM entraîné sur 50 composantes PCA d'un spectrogramme window-par-window, avec baseline individuel
6. **Scleral color LAB** non calibré (aucune référence colorimétrique ; AGC/white-balance iPhone modifient le signal)
7. **Pupil diameter en mm** calculé par hypothèse d'iris = 11,7 mm (variance réelle 10,2-13 mm → ±10 % d'erreur avant mesure)

### 1.3 Ce qui ne fonctionne pas techniquement (données session `52c08e1c`, iPhone 18.7 Safari 26.4)

| Problème | Mesure | Cible |
|---|---|---|
| FPS MediaPipe | 4 | ≥15 |
| Voiced ratio audio | 9,6 % | ≥40 % |
| Speech rate calculé | 1895 wpm (impossible) | 140-180 wpm |
| Asymétrie pupillaire baseline | 0,87 mm | <0,3 mm (anisocories réelles <20 % pop) |
| Blink rate baseline | 4,2/min | 12-20/min |
| PLR amplitude | 0 mm | ≥0,3 mm ou exclu |
| Scleral redness a* | 17,8 | norme -2 à 8 |

### 1.4 Problèmes UX/produit

- Pas de gate baseline : l'app scorie sans référence personnelle
- Pas de gate capture-quality : score donné même quand FPS=4, voicedRatio=10 %
- Verdict rouge/jaune/vert présenté comme actionable "CTA Uber" sans disclaimer sur la fiabilité
- Link "Pas de baseline — calibrer" sur ContextForm trop discret, souvent manqué
- Pas de mode "retry si capture poor"

---

## 2. État cible

**Positionnement redéfini :** outil **personnel de détection de déviation**, pas estimateur BAC. Après calibration sobre, l'app détecte si ton état courant s'écarte significativement de ta référence. Ne remplace aucun test clinique. Ne donne pas de verdict "tu peux conduire".

**Garanties scientifiques :**
- Aucune citation non-vérifiable dans le prompt
- Tous les seuils exprimés comme Δ vs baseline personnel (quand applicables) ou retirés
- Refus de scorer sans calibration + qualité de capture suffisante
- Chaque output inclut son intervalle de confiance et ses limitations

**Garanties techniques :**
- FPS iPhone Safari ≥15 (via downscale avant inférence)
- VAD robuste avec voicedRatio ≥40 % sur lecture normale
- Pupillometrie filtrée (blinks exclus, trimmed mean, confidence interval)
- PLR déclaré unavailable si amplitude < seuil physiologique
- Sclera color désactivé sauf si calibration couleur disponible

---

## 3. Plan en phases

Chaque phase est une suite de commits livrables indépendamment. Chaque item a une **condition de vérification** explicite.

### Phase 0 — Arrêter de mentir (bloqueur pour toute utilisation publique)

**Objectif :** supprimer les affirmations scientifiques non-étayées avant de faire autre chose.

**Commits :**

0.1 **Réécriture `claude-prompt.ts`** — suppression des fabriquées, réancrage sur sources vérifiables uniquement.

- Retirer : toute mention de "Kim 2012", "Jolkovsky 2022", "Castro 2014"
- Retirer les seuils numériques absolus non-étayés : `gain <0.70`, `blink rate >16/min suggestif`, `mean pause >250ms`, `flatness >0.3`, `94% saccade recovery`, `r²=0.96`, `98% accuracy` sans contexte within-subject
- Reformuler "HGN clues" en "pursuit deviation indicators" (clairement distinct du protocole SFST)
- Inclure les sources vérifiées avec leur contexte exact :
  - **Tyson et al. 2021, J Physiol, N=16, NASA labo 144 Hz** — [DOI 10.1113/JP280395](https://doi.org/10.1113/JP280395) : pursuit gain décroît avec BAC dès 0,015 % ; saccades compensent jusqu'à ~0,055 % ; **pupil response unaffected jusqu'à 0,065 %**
  - **Roche & King 2010, Psychopharmacology, N=138** — [DOI 10.1007/s00213-010-1906-8](https://doi.org/10.1007/s00213-010-1906-8) : pursuit + saccades altérés à 0,4 et 0,8 g/kg ; doses subtilisées aux niveaux US DUI
  - **Suffoletto et al. 2023, JSAD, N=18 (tous W/NH), SVM on PCA(50) MFCCs+spectrals, within-subject baseline, 1-s windows** — [DOI 10.15288/jsad.22-00375](https://doi.org/10.15288/jsad.22-00375) : 98 % accuracy **uniquement en within-subject avec baseline**
  - **Cori et al. 2023, Hum Psychopharmacol, N=12, Optalert commercial device** — [DOI 10.1002/hup.2870](https://doi.org/10.1002/hup.2870) : blink params altérés à BAC 0,08 %, **dispositif IR dédié** non équivalent webcam
  - **Stuster & Burns 1998, NHTSA DOT HS 808 839** : rapport gouvernemental non peer-reviewed, 88 % accuracy HGN avec base-rate biaisée (72 % positifs dans l'échantillon)
- Ajouter un bloc **"IMPLEMENTATION DIVERGENCE NOTE"** au prompt système :
  > "This app uses MediaPipe FaceLandmarker on consumer webcams (typically 10-15 FPS on mobile Safari, up to 4 FPS on constrained devices) and audio from getUserMedia with noise suppression + AGC. This is 1-2 orders of magnitude less precise than the clinical eye trackers (1 kHz) or controlled-audio SVMs used in the cited studies. Treat every measurement as a coarse proxy. Do NOT generate BAC estimates. Score only as relative deviation signals (low/moderate/high confidence) and ALWAYS include limitations."

**Vérification 0.1 :** grep sur le nouveau prompt → zéro occurrence des phrases "Kim 2012", "Jolkovsky", "Castro 2014", "r²=0.96", "94% of loss recovered", "<110 wpm suggestive", ">250ms mean suggests".

0.2 **Gate anti-score dans `/api/analyze`** : refus de scorer si conditions non remplies.

Retour d'un event SSE `status: "quality_insufficient"` + reason codes enum au lieu d'un verdict :

```ts
enum QualityGate {
  NO_BASELINE = "baseline_required",
  LOW_FPS = "fps_below_minimum",
  VOICE_CAPTURE_FAILED = "voiced_ratio_below_minimum",
  FACE_TRACKING_UNSTABLE = "face_lost_rate_above_maximum",
  PUPIL_ASYMMETRY_ARTIFACT = "pupil_asymmetry_suggests_landmarking_error",
}
```

Seuils initiaux :
- FPS < 10 → `LOW_FPS`
- voicedRatio < 30 % → `VOICE_CAPTURE_FAILED`
- face_lost rate > 10 % → `FACE_TRACKING_UNSTABLE`
- pupil ratio < 0,70 ou > 1,30 en baseline → `PUPIL_ASYMMETRY_ARTIFACT`

**Vérification 0.2 :** tests unitaires sur `qualityGate()`; test E2E avec payload dégradé → route retourne 200 SSE `status` event, pas de verdict.

0.3 **UI `/results` : afficher l'état "non-scorable"** au lieu d'un score.

Ajouter composant `QualityInsufficientBanner` qui affiche :
- Raison claire ("La caméra a tourné à 4 images/s — trop lent pour une mesure fiable")
- Actionable ("Refais un test en plein jour, appareil posé, iPhone débloqué")
- Pas de CTA Uber, pas de chiffre score

**Vérification 0.3 :** UI test Playwright avec payload dégradé → aucun nombre ne s'affiche, seulement la bannière.

---

### Phase 1 — Baseline obligatoire

**Objectif :** aligner sur Suffoletto/Tyson/Cori qui utilisent tous un within-subject baseline.

1.1 **`/capture` redirige vers `/baseline` si `loadBaseline()` null**.

- Ajouter check dans `GuidedCapture` mount : si `mode === "analyze"` et `loadBaseline() === null`, montrer modal plein-écran avec explication et CTA "Calibrer maintenant (3 min)"
- Après calibration, rediriger automatiquement vers `/capture`

**Vérification 1.1 :** test E2E avec localStorage vide → `/capture` affiche modal, jamais le flow de capture.

1.2 **Validation de baseline sur sauvegarde**.

La baseline doit elle-même passer les quality gates (sinon on sauvegarde du garbage). Ajouter dans `GuidedCapture` mode `baseline` :
- Exécuter le même `qualityGate()` sur la baseline
- Si échec : ne pas sauvegarder, montrer "Calibration ratée, recommence dans de meilleures conditions"

**Vérification 1.2 :** test E2E avec mock getUserMedia dégradé → saveBaseline non appelé.

1.3 **Baseline expiry stricte**.

Actuellement `stale` après 90 jours (warning). Passer à : **refus** si > 90 jours. Message : "Ta baseline a 97 jours, recalibre avant utilisation."

**Vérification 1.3 :** test unitaire `getBaselineStatus()` avec timestamp -100j → `state: "stale"`, et `qualityGate()` retourne `BASELINE_STALE`.

---

### Phase 2 — Capture pipeline fixes

**Objectif :** atteindre les seuils de qualité avant de parler science.

2.1 **Downscale MediaPipe input**.

Aujourd'hui : la frame vidéo 720×1280 est passée telle quelle à `detectForVideo()`. Sur iPhone Safari c'est le gros contributeur au 4 FPS.

Fix : créer un `<canvas>` offscreen 480×640, dessiner `drawImage(video, 0, 0, 480, 640)` avant chaque détection, passer le canvas.

**Vérification 2.1 :** test E2E Chromium avec face.mp4 → averageFps mesuré > 20. Rapporter le Δ FPS dans les logs audit.

2.2 **VAD robuste — énergie + ZCR**.

Remplacer le seuil RMS adaptatif par un VAD classique :
- Short-time energy sur fenêtre 20 ms
- Zero-crossing rate
- Decision : voiced si energy > threshold_E ET ZCR dans [0.02, 0.20]
- Hystérésis 100 ms pour éviter les oscillations

Tuning : désactiver aussi `autoGainControl` dans getUserMedia audio constraints (laisse `noiseSuppression` pour bar ambient).

**Vérification 2.2 :** test unitaire sur un WAV de voix réelle (clip 10 s) → voicedRatio entre 40 % et 75 %.

2.3 **Pupil diameter : filtrage + IC**.

- Exclure les frames où EAR < 0,20 (blink en cours)
- Trimmed mean 10-90 percentile sur les frames valides
- Rapporter aussi l'écart-type et le nombre de frames utilisées
- Si < 10 frames valides → pupil diameter = null, ne pas inclure dans payload

**Vérification 2.3 :** test unitaire avec série synthétique contenant 5 blinks → pupilDiameter égale la médiane des valeurs non-blink.

2.4 **Pupil asymmetry sanity check**.

Si `|L-R| > 0.5 mm` sur la baseline, c'est presque certainement un artefact de landmarking (anisocorie réelle chez ~20 % pop mais rarement >0.3 mm). Marker `pupilAsymmetryArtifactSuspected: true` dans payload.

2.5 **PLR physiological sanity**.

Si `constrictionAmplitudeMm < 0.2` ou > 3 ou latency > 1000 ms : marquer `plrUnavailable: true`, ne pas envoyer de chiffre à Claude. Le prompt ignore déjà ce cas.

2.6 **Scleral color : désactiver jusqu'à calibration**.

Sans référence colorimétrique (carte couleur devant la caméra, ou iris comme reference interne), les valeurs LAB sont non-informatives. Deux options :
- **Minimal :** retirer `scleralColorLAB` + `scleralRednessIndex` du payload et du prompt
- **Ambitieux (P2) :** calibrer par le **blanc de l'oeil moyen** d'un gros pool de captures baseline → réutiliser comme référence blanc

Pour cette phase, option minimale. Promise scientifique : "scleral color not yet calibrated — excluded from analysis".

**Vérification 2.6 :** grep sur le prompt → aucune mention de scleral redness/yellowness. Payload schema : fields retirés.

---

### Phase 3 — Refonte du scoring : déterministe + LLM explicatif

**Objectif :** remplacer le scoring LLM par un calcul déterministe de Δ-from-baseline + explications Claude.

**Rationale :** Suffoletto et Tyson utilisent des modèles statistiques/SVM déterministes entraînés sur données. On ne peut pas répliquer ça sans données d'entraînement. Mais on peut faire une **distance normalisée** de chaque feature courante vs baseline, agréger en un score de déviation, et demander à Claude d'expliquer en langage naturel les features les plus déviantes.

3.1 **Module `src/lib/analysis/deviation.ts`** — scoring déterministe.

```ts
interface DeviationReport {
  overallDeviation: number;  // 0-100 scalar
  perFeature: Array<{
    name: string;
    currentValue: number;
    baselineValue: number;
    deviationZ: number;  // z-score if we have SD, else normalized delta
    severity: "normal" | "mild" | "moderate" | "marked";
  }>;
  worstFeatures: string[];  // top 3 deviant
  qualityAdjusted: boolean;  // whether we adjusted thresholds because of low FPS
}
```

Features incluses (ordre de fiabilité) :
1. **Pursuit gain delta** (si baseline pursuit gain > 0.6, sinon baseline suspect)
2. **Pursuit saccade rate delta** (rate of catch-up saccades per second during pursuit)
3. **Blink rate delta** (si baseline dans [8, 30])
4. **PERCLOS delta** (si baseline < 20 %)
5. **Voice MFCC cosine distance** (vecteur 13 coeffs mean, normalized)
6. **Voice spectral flatness delta**
7. **Voice speech-rate delta** (après fix VAD)

Agrégation : somme pondérée par qualité de la mesure baseline + data quality courante. Score final 0-100.

3.2 **Claude prompt mode "explain deviation"**.

Nouveau prompt : Claude reçoit `DeviationReport` + context (heure, heures d'éveil, éclairage) + quality gates. Son rôle :
- Ne PAS inventer un score
- **Expliquer** les 3 features les plus déviantes en langage clair
- Proposer des **explications alternatives** (fatigue, stress, alcool, caféine, etc.) en évitant la causalité définitive
- Rappeler les limites

Le score numérique vient du calcul déterministe, pas de Claude.

**Vérification 3.2 :** test intégration avec DeviationReport injecté → Claude output contient les 3 features listées, mentionne les alternatives, ne contient pas de chiffre BAC.

3.3 **Suppression de "3 catégories"**.

L'ancienne structure alcool/fatigue/substances était implicitement un diagnostic différentiel — pas défendable sans modèle entraîné. Remplacer par :
- **Un score de déviation global** (0-100)
- **3 features les plus déviantes** avec interprétations possibles
- **Pas de verdict rouge/jaune/vert** — remplacer par "déviation minime / notable / significative" avec explication

**Vérification 3.3 :** `response-schema.ts` mis à jour, tests passants, UI `/results` refondue.

---

### Phase 4 — UX honnête

4.1 **Disclaimer visible**.

Sur la page d'accueil, `/capture`, `/baseline`, `/results` : bandeau persistant :
> "Outil expérimental. Mesures grand public, 1-2 ordres de grandeur moins précises que les tests cliniques. Ne pas utiliser pour décision de conduite. Si vous avez bu, ne conduisez pas."

4.2 **Retrait des CTA Uber sur verdict**.

Le bouton "Uber" après verdict rouge suggère que le rouge signifie "tu as bu trop". Or notre rouge peut venir de fatigue, capture dégradée, stress, etc. Retirer.

Remplacer par : message informatif "Si tu as bu, même un peu, ne conduis pas. Sinon, assure-toi d'être alerte."

4.3 **Mode "recalibration"**.

Permettre à l'utilisateur de recalibrer sa baseline depuis n'importe quel écran. Visible dans le settings-like header.

4.4 **Debug mode pour utilisateurs avertis**.

Page `/debug` accessible avec toggle → affiche dernière session complète en JSON, avec lien d'export. Pas besoin de `VALK_DEBUG_KEY` pour cette vue locale (seul l'upload requiert la key).

---

### Phase 5 — Validation empirique

5.1 **Corpus de test sobre**.

Avant public release, collecter 20+ captures sobres (toi + 3-5 volontaires) dans différentes conditions (matin frais vs soir, iPhone vs Android, lumineux vs ambiance), **avec baseline perso**. Mesurer : taux de faux positif (score >30 chez sobres) doit être < 10 %.

5.2 **Test de stabilité intra-sujet**.

Même personne, 3 captures sobres dans la même journée → score de déviation entre captures doit rester < 15.

5.3 **Test de détection (limité)**.

Si tu consommes (légalement), 1-2 captures post-consommation avec même baseline → score doit monter proportionnellement. C'est anecdotique, pas statistique (N<5), mais donne un indice de réalité.

5.4 **Analyse post-deployment**.

Avec la télémétrie serveur déjà en place, monitorer les 10 premières sessions réelles :
- Distribution FPS
- Distribution voicedRatio
- Taux de quality_insufficient vs scoring complet
- Distribution des scores de déviation

Ajuster les seuils si nécessaire.

---

### Phase 6 — Plaintes scientifiques persistantes (long-terme, post-MVP)

- **Pursuit gain via velocity ratio** au lieu de corrélation Pearson (nécessite optical flow sur iris landmark sur fenêtres non-saccadiques)
- **Stimulus pursuit step-ramp** (Tyson-aligned) au lieu de sinusoïde continue
- **Voice avec embedding pré-entraîné** (Wav2Vec 2.0 / HuBERT features) + distance cosine vs baseline — beaucoup plus proche du SVM Suffoletto
- **Sclera color calibration** via iris-as-reference
- **PLR via LED phone flash** au lieu d'écran blanc (si accessible via native wrapper)

---

## 4. Non-goals explicites

Pour éviter les dérives d'ambition :

- **Pas d'estimation BAC numérique.** L'app ne dira jamais "tu es à 0.07 %".
- **Pas de verdict "tu peux conduire".** L'app ne remplace pas un éthylotest, n'a aucune valeur légale, aucune responsabilité.
- **Pas de "détection de drogue spécifique".** L'ancienne catégorie "substances" avec différentiation stimulants/opioïdes/cannabis est retirée.
- **Pas d'intégration clinique.** Le disclaimer "outil expérimental" reste visible. Aucune revendication médicale.
- **Pas de ré-entraînement de modèle maison.** Trop peu de données, trop de biais sans contrôle BAC.

---

## 5. Risques + mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Downscale 480p dégrade pupil measurement | Moyen | Mesurer en parallèle 720p et 480p sur 5 sessions ; si dégradation > 20 %, downscaler seulement pour pursuit/blink, garder 720p pour baseline frame-at-rest |
| VAD fix casse les captures actuelles | Faible | Toggle `?oldVad=1` pour A/B, 1 semaine avant rollout complet |
| Refus de scorer sans baseline frustre utilisateurs | Moyen | UX calibration clair, ~3 min, explication "pourquoi c'est nécessaire" |
| Suppression scleral color / substances laisse des features inutilisées dans DB | Faible | Garder les colonnes mais nulled ; migration propre au refactor |
| Auto-replay de iPhone Safari sur SW v2→v3 | Moyen | Déjà géré via controllerchange reload |

---

## 6. Critères de succès (ce qui valide le plan)

Au terme de la Phase 4 :

- [ ] Prompt Claude ne contient **aucune** citation non-vérifiable (grep check)
- [ ] FPS moyen iPhone Safari ≥ 15 sur 3 sessions consécutives
- [ ] voicedRatio ≥ 40 % sur lecture normale (test E2E avec clip voice réel)
- [ ] Capture sans baseline → modal obligatoire (test E2E)
- [ ] Capture avec FPS < 10 → retour `quality_insufficient` (test E2E)
- [ ] Sur 10 captures sobres miennes + volontaires, < 2 avec score de déviation > 30
- [ ] Test répété même personne/jour : variance score < 15
- [ ] Disclaimer visible sur toutes les pages
- [ ] Pas de CTA Uber post-verdict
- [ ] 53 tests Vitest passants (ou plus après additions)
- [ ] E2E Chromium complet OK
- [ ] Lighthouse performance score stable ou améliorée

---

## 7. Ordre d'exécution proposé

Séquence linéaire recommandée, chaque phase est une journée de travail +/- :

1. **Phase 0** (prompt honnête + gates scoring + UI non-scorable)
2. **Phase 1** (baseline obligatoire)
3. **Phase 2** (capture fixes : FPS, VAD, pupil, sclera)
4. **Phase 3** (refonte scoring déterministe + Claude explicatif)
5. **Phase 4** (UX honnête)
6. **Phase 5** (validation empirique)
7. **Phase 6** (post-MVP, optionnel)

Après chaque phase : commit + push + re-test iPhone + pull télémétrie serveur pour validation.

---

## 8. Engagement

Je livre chaque commit avec :
- diff clair
- effet attendu
- test de vérification (manuel ou automatisé)
- attente de feedback avant de passer au suivant

Je ne fais pas "je corrige tout en silence". Je ne prétendrai pas avoir fait ce que je n'ai pas fait. Je signalerai tout ce qui me paraît risqué ou qui dévie du plan.
