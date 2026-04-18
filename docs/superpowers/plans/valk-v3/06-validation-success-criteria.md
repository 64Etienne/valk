# 06 — Validation & Success Criteria

**But :** définir précisément ce que signifie "done" pour chaque phase et pour la release v3.0.

---

## 1. Critères par phase

### Phase 0 — Démolition
- [ ] `grep -ri "Kim 2012\|Jolkovsky\|Castro 2014\|r²=0.96\|94%\|<110 wpm\|>250ms\|>0.3 flatness" src/` retourne 0
- [ ] Aucun CTA Uber dans le DOM `/results`
- [ ] Aucun wording "tu peux conduire" / "fit to drive"
- [ ] Disclaimer visible sur `/`, `/capture`, `/baseline`, `/results`
- [ ] Tests Vitest ≥ 53 passants (existants)
- [ ] Build Next.js OK, zéro TypeScript error

### Phase 1 — Tier 1 Baseline-mode
- [ ] `src/lib/analysis/deviation.ts` module existe, 10+ unit tests passants
- [ ] `/capture` sans baseline → modal bloquante avec 2 CTA
- [ ] Quality gates retournent `quality_insufficient` sur payload dégradé
- [ ] Baseline age > 90 days → gate BASELINE_STALE bloquant
- [ ] Prompt Claude "explain deviation" testé via snapshot
- [ ] UI `/results` Tier 1 affiche : score scalar + 3 features + narrative + disclaimer
- [ ] E2E Playwright : Tier 1 happy path + quality insufficient + no baseline — tous verts
- [ ] Pas de chiffre BAC dans `/results` UI (grep vérifiable)

### Phase 2 — Capture quality fixes
- [ ] Test Chromium E2E mesure `averageFps ≥ 20` (downscale)
- [ ] Test unitaire sur WAV réel : `voicedRatio ≥ 0.40`
- [ ] Pupil measurement exclut frames EAR<0.20, retourne `nFramesUsed`
- [ ] Anisocorie >0.5mm → flag dans payload
- [ ] PLR invalide → `plrUnavailable: true`
- [ ] Scleral color retiré du payload schema Zod (test schema)
- [ ] Pas de régression tests existants

### Phase 3 — Corpus infrastructure
- [ ] `/settings` existe avec toggle corpus
- [ ] Schema Supabase `valk_corpus_labels` créé (migration lintable)
- [ ] Mode corpus activé → `BacInputModal` apparaît après capture avant /results
- [ ] localStorage store fonctionne (test manuel)
- [ ] Export CSV `/settings/corpus` génère fichier valide
- [ ] Delete individual + delete all fonctionnent (test manuel)

### Phase 4 — Tier 2 SFST-équivalent
**Test 1 — HGN-alike :**
- [ ] `HgnStimulus` anime correctement trajectoire en 24s (visual test E2E)
- [ ] `detectNystagmusSpectralPower` sur signal 4 Hz pur retourne `powerRatio > 3`
- [ ] `computePursuitVelocityRatio` sur signaux synthétiques retourne valeurs attendues ±5%
- [ ] `computeHgnClues` retourne 0 clues sur signal clean, ≥4 clues sur signal simulé alcool

**Test 2 — Romberg :**
- [ ] `useDeviceMotion` demande permission (test manuel iPhone)
- [ ] `swayFeatures` sur IMU stable vs tremor synthétique distinguables
- [ ] Fallback si permission refusée : sous-score null, weight 0

**Test 3 — Cognitive :**
- [ ] Web Speech API capte en fr-FR (test manuel)
- [ ] `cognitive-score` route retourne JSON valide
- [ ] Accuracy calculée correctement sur séquences attendues
- [ ] Fallback si STT silencieux : null + quality flag

**Test 4 — Reaction time :**
- [ ] Canvas stimuli apparaissent aux intervalles corrects
- [ ] RT mesuré <5ms jitter (vérifié via E2E tap simulation)
- [ ] Commission + omission comptés correctement

**Fusion :**
- [ ] 4 sous-scores → fusion déterministe
- [ ] Poids re-normalisés quand sous-score null
- [ ] Verdict seuils appliqués correctement (tests unitaires)

**Flow UX :**
- [ ] `/quick` séquence les 4 tests avec transitions
- [ ] `/quick/results` affiche verdict + sous-scores + Claude narrative
- [ ] Disclaimer Tier 2 renforcé visible

**Tests globaux :**
- [ ] Playwright E2E Tier 2 complet passe
- [ ] Zéro chiffre BAC dans Tier 2 UI

### Phase 5 — Corpus collection + calibration
- [ ] ≥ 30 captures corpus labellisées dans la DB
- [ ] ≥ 6 participants différents
- [ ] Distribution BAC couvre [0.00, 0.08%] au minimum
- [ ] Notebook analyse produit `tier2-thresholds.json` calibré
- [ ] LOSO cross-validation accuracy ≥ 70% sur classification BAC≥0.05% (target Interspeech 2011 level)
- [ ] AUROC ≥ 0.75
- [ ] Sensitivity ≥ 0.75 à specificity ≥ 0.80
- [ ] Rapport validation écrit dans `05-validation-results.md`

### Phase 6 — Production hardening
- [ ] Sentry capte les erreurs (test forcé)
- [ ] Supabase migrations appliquées en prod
- [ ] Lighthouse : Performance ≥85, Accessibility ≥90, Best Practices ≥95
- [ ] Playwright E2E complets verts
- [ ] Manuel iPhone checklist 100% OK
- [ ] CHANGELOG à jour
- [ ] README mentionne la version, disclaimers, sources scientifiques
- [ ] Tag v3.0 sur main

---

## 2. Critères release v3.0 (tous obligatoires)

### Scientifiques
- [ ] `claude-prompt.ts` : zéro citation fabriquée (grep)
- [ ] Chaque chiffre du prompt sourceable depuis `01-science-foundation.md`
- [ ] Tier 2 seuils calibrés sur corpus ≥ 30 captures
- [ ] Validation LOSO ≥ 70% accuracy
- [ ] Disclaimer présent sur chaque page

### Techniques
- [ ] FPS iPhone Safari ≥ 15 mesuré en conditions réelles (3 sessions)
- [ ] Voiced ratio ≥ 40% sur lecture normale
- [ ] Pas de crash, pas d'erreur JS console
- [ ] Service worker v3 network-first HTML
- [ ] Build Vercel vert

### Tests
- [ ] Vitest ≥ 70 passants
- [ ] Playwright Chromium complet : 4 scénarios au minimum
- [ ] Manuel iPhone iOS 18+ Safari testé

### UX
- [ ] Onboarding clair avec choix Tier 1 / Tier 2
- [ ] Calibration Tier 1 < 4 min perçue
- [ ] Tier 2 complet < 5 min perçu
- [ ] Résultats lisibles, pas de jargon technique non expliqué

### Éthique / juridique
- [ ] Pas de verdict "tu peux conduire"
- [ ] Pas de chiffre BAC affiché
- [ ] CTA post-verdict ne pousse pas à conduire
- [ ] ToS écrit et accepté à la première session
- [ ] Opt-in corpus explicite, droit à l'effacement fonctionnel

---

## 3. Métriques de monitoring post-release

À tracker via Sentry + audit logs + corpus :

- Taux de `quality_insufficient` par tier (si >30%, problème hardware)
- Distribution des scores de déviation Tier 1 (devrait être bimodale si utilisée correctement)
- Distribution des verdicts Tier 2 (low/moderate/high) — si >80% low, trop permissif ; si >50% high, trop sévère
- Corpus growth rate (captures opt-in par semaine)
- Latence moyenne `/api/analyze` P50, P95, P99
- Claude token usage per session (cost control)
- Taux d'adoption baseline (calibrations / total installs)

---

## 4. Conditions de rollback

Si après release v3.0, on observe :
- Taux `quality_insufficient` > 50% en prod → gates trop stricts, tuning
- Erreur rate Sentry > 5% → bug en prod, hotfix ou rollback
- Plainte ou incident utilisateur lié à "j'ai conduit en me fiant à Valk" → rollback immédiat, disclaimer renforcé, audit juridique

Plan B : rollback vers v2.x (tag existant) via Vercel rollback button.

---

## 5. Success criteria "soft" (bonus)

Pas bloquants pour v3.0 mais visés :
- PWA installable sur iPhone sans friction
- Accessibilité VoiceOver fonctionnelle
- Mode sombre respecté
- Internationalisation anglaise (post-v3.0)
- Documentation développeur complète pour reprendre la main

---

## 6. Qui valide

- **Phase 0 à 4** : l'auteur (Etienne) via review de chaque commit et test manuel
- **Phase 5 calibration** : l'auteur + review du notebook par un œil extérieur si possible (bioinformaticien, statisticien volontaire)
- **Release v3.0** : décision de l'auteur, après passage complet de cette checklist

---

## 7. Document de validation finale

Pour release v3.0, produire un document `06-validation-release.md` qui :
1. Liste tous les critères cochés
2. Donne les chiffres réels mesurés (pas seulement "OK")
3. Liste les limitations connues restantes
4. Signe la release (auteur + date)

Ce document est la preuve que la version publique mérite la promesse qu'elle porte.
