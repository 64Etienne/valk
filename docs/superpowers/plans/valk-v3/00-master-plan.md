# Valk v3 — Master Plan

**Date :** 2026-04-18
**Durée estimée :** 4-6 semaines de dev + 2-4 semaines de collecte corpus (parallélisable)
**Ressources confirmées :** 1 éthylotest, 10-20 volontaires, auteur à temps plein

---

## 1. Mission

Construire un outil de self-check d'impairment, honnête scientifiquement, fonctionnant sur iPhone/smartphone grand public, avec **deux tiers de fonctionnement** :

- **Tier 1 — Mode Personnel** *(baseline required)* : après calibration sobre de l'utilisateur, détecte des déviations de son propre état normal. Fondé sur la littérature within-subject (Suffoletto 2023, Tyson 2021, Cori 2023). Précision attendue : 85-95% sur cet utilisateur.
- **Tier 2 — Mode Quick Check** *(sans baseline, SFST-équivalent)* : reproduit sur smartphone les 4 tests conceptuels du SFST police officer, adaptés au hardware. Fondé sur la littérature cross-sectional (Stuster&Burns 1998, Koch 2023, Moskowitz 2000). Précision attendue après calibration corpus : 75-85%, pour n'importe quel utilisateur, sans calibration préalable.

**Ce que le produit ne sera jamais** :
- Un estimateur BAC numérique
- Un verdict "tu peux conduire"
- Un substitut à un éthylotest ou à un test clinique
- Un outil médical-légal

---

## 2. Pourquoi deux tiers au lieu d'un seul

Deux raisons scientifiques :

1. **Le tier personnel est scientifiquement défendable aujourd'hui** avec un N minimal. Suffoletto a 98% within-subject sur N=18. On peut shipper Tier 1 en ~1 semaine.
2. **Le tier SFST-équivalent demande un corpus labelisé**, qu'on va construire progressivement **via** l'usage Tier 1. Chaque capture Tier 1 peut optionnellement inclure une valeur éthylotest saisie par l'utilisateur. Au bout de 50-100 entrées, on a de quoi calibrer les seuils Tier 2.

Le Tier 1 finance la construction du Tier 2, en le rendant utile **maintenant** et en générant ses données d'entraînement pendant l'usage.

---

## 3. Architecture produit globale

```
                    User opens Valk
                           |
                           v
                [Onboarding + disclaimer]
                           |
                 Has personal baseline?
                  /                  \
                 NO                  YES
                 |                    |
          Two choices:         "Personal mode"
             |                       (Tier 1)
       A) Calibrate (3 min)          |
       B) Quick check (3 min)        v
          |         |          Δ-from-baseline
          v         |          scoring + Claude
     Save baseline  |          explanation
          |         v                |
          +-->  SFST-equivalent <----+
                (Tier 2)       (if Tier2 enabled)
                   |
                   v
             Aggregate 4-test scoring
             (HGN / Romberg / cognitive / RT)
                   |
                   v
             Verdict low/moderate/high
             + Claude narrative
             + Disclaimer fort
```

---

## 4. Phases, ordre et dépendances

Organisé en **6 phases** avec dépendances explicites. Les phases parallélisables sont marquées.

### Phase 0 — Démolition *(semaine 0, ~2 jours)*
Supprimer ce qui est scientifiquement faux. Préparer le terrain.

- 0.1 Réécrire `claude-prompt.ts` en retirant les citations fabriquées (Kim 2012, Jolkovsky 2022, Castro 2014) et les seuils absolus non-étayés
- 0.2 Retirer la catégorisation alcool/fatigue/substances implicitement diagnostique
- 0.3 Retirer les CTA Uber et le framing "peux conduire"
- 0.4 Supprimer les features non-calibrables : scleral color LAB, pseudo-HGN clues
- 0.5 Adjuster payload schema + Zod

**Livrable :** commit qui supprime tout ce qui ment, sans encore remplacer.

### Phase 1 — Tier 1 Baseline-mode shipping *(semaine 1, ~5 jours)*
Option A du plan précédent, version finalisée.

- 1.1 `/capture` redirige vers `/baseline` si absent
- 1.2 Quality gates dans `/api/analyze` (FPS<15, voicedRatio<30%, face_lost>10%, anisocorie suspect)
- 1.3 Δ-from-baseline scoring déterministe dans `src/lib/analysis/deviation.ts`
- 1.4 Claude explicatif (pas scoreur) via nouveau prompt
- 1.5 UI résultats refondue : un seul score de déviation + 3 features les plus déviantes
- 1.6 Disclaimers visibles

**Livrable :** app utilisable Tier 1 en production, scientifiquement propre.

### Phase 2 — Capture quality fixes *(semaine 1-2, ~4 jours, parallèle à Phase 1 tests)*
Sans quoi Tier 1 ET Tier 2 sont cassés.

- 2.1 Downscale MediaPipe input (480p canvas offscreen) → FPS 4→15+
- 2.2 VAD énergie+ZCR, `autoGainControl: false` → voicedRatio ≥40%
- 2.3 Pupillométrie filtrée (blink-exclusion + trimmed mean)
- 2.4 Anisocorie sanity (|L-R|>0.5mm → flag artefact)
- 2.5 PLR sanity (amplitude < 0.2mm → null'd)

**Livrable :** captures iPhone produisent des features exploitables.

### Phase 3 — Corpus collection infrastructure *(semaine 2, ~3 jours)*
Préparer la machine à collecter des captures BAC-labelisées.

- 3.1 UI `/capture` : toggle opt-in "je viens de prendre mon éthylotest, j'ajoute la valeur" (caché derrière un switch, jamais dominant)
- 3.2 Champ numérique BAC avec unité (g/L) + vérification plausibilité (0.00 à 3.00)
- 3.3 Stockage local en premier (localStorage), sync Supabase en optionnel
- 3.4 Export CSV via page `/corpus` (admin) pour audit
- 3.5 Consent clair pour l'usage du corpus ("tes captures labellisées serviront à améliorer le modèle, rien n'est publié, tu peux tout supprimer")

**Livrable :** pipeline pour collecter une capture + sa label BAC.

### Phase 4 — Tier 2 SFST-équivalent protocol *(semaines 3-5, ~3 semaines)*
Le gros morceau. Détaillé dans `03-protocol-sfst-equivalent.md`.

- 4.1 **HGN-alike** : stimulus rampe-hold-retour, détection pursuit lag + nystagmus spectral
- 4.2 **Romberg postural sway** : `DeviceMotionEvent`, 20s, RMS jerk
- 4.3 **Cognitive verbal** : 2 tâches (100-7, mois-inverse), STT + scoring Claude
- 4.4 **Reaction time tap** : shapes, RT moyen + SD + taux d'erreurs
- 4.5 **Fusion déterministe** : agrégation 4 sous-scores → verdict low/moderate/high
- 4.6 UI guidée pour les 4 tests en séquence (~3-4 min total)

**Livrable :** mode Quick Check fonctionnel, seuils pré-calibrés depuis la littérature.

### Phase 5 — Collecte corpus + calibration *(semaines 3-6, parallèle)*
Activité continue pendant Phase 4, intensive en semaine 6.

- 5.1 Recrutement volontaires (toi + 10-20 autres)
- 5.2 Sessions contrôlées : baseline sobre + 2-3 points BAC croissants (éthylotest)
- 5.3 Stockage + audit des captures
- 5.4 Calibration des seuils Tier 2 sur le corpus
- 5.5 Validation LOSO (leave-one-subject-out) — reproduire la méthode Koch 2023

**Livrable :** ~30-100 captures labellisées, seuils calibrés, métriques accuracy mesurées.

### Phase 6 — Production hardening + validation finale *(semaine 6, ~5 jours)*
- 6.1 Tests E2E Chromium + manuel iPhone pour chaque tier
- 6.2 Sentry branché (déjà existant, juste configure)
- 6.3 Supabase branché (schema + RLS)
- 6.4 Perf Lighthouse vert
- 6.5 Disclaimers final validés
- 6.6 CHANGELOG + README

**Livrable :** version 1.0 du produit, scientifiquement défendable, techniquement robuste.

---

## 5. Décisions de design lockées

Ces choix ne se rediscutent pas sauf blocker majeur :

1. **Deux tiers** (pas un seul, pas trois). Tier 1 ship fast, Tier 2 suit avec corpus.
2. **Aucun chiffre BAC affiché** à l'utilisateur. Jamais.
3. **Aucun verdict "tu peux conduire"**. Jamais.
4. **Scoring déterministe** ; Claude explique, ne score pas.
5. **Tier 2 seuils = calibrés sur corpus**, pas extrapolés de la littérature seule. Si pas de corpus, pas de Tier 2 public.
6. **Corpus = opt-in explicite** avec consent. Stockage local par défaut, sync Supabase optionnel.
7. **Audit des features** : chaque version du schema payload est diffée et loggée.
8. **Disclaimers omniprésents** : pas une page sans "outil expérimental, non-médical".
9. **Tests E2E obligatoires** avant chaque merge sur main.

---

## 6. Stack technique cible

- Frontend : **Next.js 16 + React 19 + Tailwind 4** (existant)
- Eye tracking : **MediaPipe FaceLandmarker** (existant) + downscale 480p
- Voice : **getUserMedia** + custom VAD énergie+ZCR
- STT pour cognitif : **Web Speech API** (iOS Safari supporté depuis 14.5) avec fallback **Whisper client-side via `whisper.cpp` wasm** si accuracy insuffisante
- Accéléromètre : **`DeviceMotionEvent` iOS 13+** avec `requestPermission()`
- Analyse : **scoring déterministe TypeScript** + **Claude Opus via Anthropic SDK** pour explications
- Stockage corpus : **localStorage** d'abord, **Supabase** en optionnel (tables `valk_captures`, `valk_corpus_labels`)
- Observabilité : **Sentry** + pipeline audit logs existant (commit `1267e2e`)
- Tests : **Vitest + Playwright** (existant)

---

## 7. Non-goals explicites *(reprise du plan précédent, élargi)*

Ne seront **jamais** implémentés :
- Estimateur BAC numérique
- Verdict "fit / unfit to drive"
- Intégration CAN bus / OBD2 voiture (on n'est pas Koch 2023)
- Détection de substance spécifique (cannabis vs stimulants vs opioïdes) — requires DRE protocol
- Test déambulatoire (Walk-and-Turn) — phone camera can't see feet
- PLR précis (screen flash overexposure non-contournable)
- Scleral color LAB (pas de référence colorimétrique calibrée)
- API publique du scoring (réservé app)

---

## 8. Risques majeurs et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| STT iOS Safari inutilisable en bar bruyant | Tier 2 cognitif cassé en usage réel | Fallback Whisper côté client, consent sur "test à faire dans un endroit calme" ; tester en environnements bruyants |
| `DeviceMotionEvent` permission refusée | Romberg test cassé | Alternative : test main tendue phone-à-l'horizontal avec gyroscope, ou test alternatif sans IMU |
| Corpus volontaires sous-recrutement | Tier 2 calibration fragile | Commencer par toi seul + 2-3 amis, prouver concept ; élargir ensuite |
| Variabilité inter-individuelle domine Tier 2 | Plafond <70% | Accepter, documenter, positionner comme "signal" pas "verdict" |
| Utilisateur prend des risques à cause d'un verdict Tier 2 faux-négatif | Juridique + éthique | Disclaimers massifs, refus de répondre "peux conduire", log utilisateur si tentative de contourner |
| HGN-alike sur iPhone trop bruyant | Tier 2 sous-score fragile | Pondération plus faible du sous-score HGN si FPS<20 ou variance landmark > seuil |
| Supabase config hors-scope dev | Corpus stockage bloqué | Local-first par défaut, Supabase optionnel pour sync |

---

## 9. Success criteria globaux *(ce qui définit "terminé")*

Critères non-négociables avant release v1.0 :

- [ ] Grep `claude-prompt.ts` : zéro mention de Kim 2012, Jolkovsky, Castro, r²=0.96, <110 wpm, etc.
- [ ] Tier 1 utilisable sans baseline → redirige vers `/baseline` de façon bloquante
- [ ] Capture iPhone Safari : FPS moyen ≥15 sur 3 sessions d'affilée
- [ ] Voiced ratio ≥40% sur lecture normale (test E2E sur clip réel)
- [ ] Capture dégradée → retourne `quality_insufficient`, pas de score inventé
- [ ] Tier 2 : 4 sous-tests fonctionnels, fusion déterministe
- [ ] Corpus ≥30 captures labelisées avec BAC
- [ ] Tier 2 accuracy LOSO ≥ 70% sur le corpus (seuil minimum publiable)
- [ ] 10 captures sobres miennes : <2 faux positifs sur Tier 1, <3 sur Tier 2
- [ ] Variance intra-sujet jour-même < 15 sur Tier 1
- [ ] Disclaimers visibles sur toutes les pages
- [ ] Tests Vitest ≥ 70 passants (existant 53 + nouveaux)
- [ ] Playwright E2E Chromium vert complet
- [ ] Lighthouse score ≥ 85 (perf, accessibility, best-practices)

---

## 10. Documents associés

Ce master plan référence :
- [01-science-foundation.md](./01-science-foundation.md) — audit citations + méthodologie vérifiée
- [02-product-repositioning.md](./02-product-repositioning.md) — deux tiers, positioning, disclaimers
- [03-protocol-sfst-equivalent.md](./03-protocol-sfst-equivalent.md) — design des 4 sous-tests Tier 2
- [04-corpus-collection.md](./04-corpus-collection.md) — protocole de collecte corpus labellisé
- [05-engineering-phases.md](./05-engineering-phases.md) — breakdown commit-par-commit
- [06-validation-success-criteria.md](./06-validation-success-criteria.md) — critères de "terminé"
- [07-risks-mitigations.md](./07-risks-mitigations.md) — risk register détaillé
