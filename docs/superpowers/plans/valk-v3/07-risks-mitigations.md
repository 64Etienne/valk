# 07 — Risks & Mitigations : ce qui peut tuer le projet et comment l'éviter

**But :** anticiper les modes de défaillance, leurs conséquences, et les plans de contingence.

---

## 1. Risques techniques

### R1 — Web Speech API iOS Safari défaillant en environnement bruyant
**Probabilité :** élevée (le bar est bruyant par définition)
**Impact :** Tier 2 cognitif dégradé ou inutilisable
**Mitigation :**
- Tester dès Phase 4.7 en conditions bruyantes (café animé ≥ 60 dB)
- Si accuracy STT < 80% en conditions bar → envisager fallback Whisper client-side WASM (whisper.cpp small ~150MB acceptable pour PWA)
- Alternative : heuristiques acoustiques sans STT (durée voiced, pauses count, pitch variance) — approximation
- Documenter dans UI : "Fais ce test dans un endroit raisonnablement calme"

### R2 — `DeviceMotionEvent.requestPermission()` refusé par l'utilisateur
**Probabilité :** modérée (iOS prompt est obscur)
**Impact :** Test Romberg inutilisable pour cet utilisateur
**Mitigation :**
- Expliquer CLAIREMENT la demande avant le prompt système : "Valk a besoin du capteur de mouvement pour mesurer ta stabilité posturale. Sans ça, le test de Romberg est sauté."
- Fallback : pondérer le verdict Tier 2 sans Romberg (réassignation des poids aux 3 autres sous-tests)
- Quality gate : si refusé, afficher dans résultat "Test postural sauté — permission non accordée"

### R3 — MediaPipe FPS ≥20 non atteint sur iPhone 12 et plus anciens
**Probabilité :** modérée pour iPhone 11 et antérieurs
**Impact :** HGN-alike dégradé, nystagmus non détectable
**Mitigation :**
- Phase 2.1 downscale 480p devrait suffire pour iPhone 12+
- Pour devices plus anciens, passer à 360p downscale
- Détecter le model device (user-agent) et adapter la résolution
- Quality gate strict : FPS < 15 → HGN sub-score null

### R4 — Web Audio API AGC/noise suppression non désactivables sur certains browsers
**Probabilité :** faible (la spec autorise le contrôle)
**Impact :** VAD toujours bruité
**Mitigation :**
- Tester sur Safari + Chrome iOS + Firefox iOS
- Si contrôle inefficace, utiliser un VAD robuste aux gains automatiques (énergie normalisée + ZCR combiné)
- Dernier recours : downstream pre-processing (compression dynamique inverse approximée)

### R5 — Écran iPhone ne supporte pas suffisamment de contraste pour HGN-alike en pleine lumière
**Probabilité :** faible
**Impact :** User difficulty tracking le stimulus
**Mitigation :**
- Brightness max demandé dans instructions
- Pastille verte foncée sur blanc max contraste
- Test en extérieur plein soleil comme sanity check

### R6 — Landmarks MediaPipe iris instables à 4 Hz nystagmus (bruit de ~1-2 px)
**Probabilité :** modérée
**Impact :** Faux positifs/négatifs nystagmus détection
**Mitigation :**
- Lisser le signal avec filtrage Savitzky-Golay
- Augmenter la taille de fenêtre FFT (8s au lieu de 4s) pour meilleure résolution fréquentielle
- Si impossible, accepter le sous-test HGN comme le plus bruité et pondérer moins en fusion
- **Acceptation honnête** : le HGN-alike sur iPhone ne remplace pas un eye-tracker clinique ; ses clues sont des proxys

---

## 2. Risques scientifiques

### R7 — Corpus <30 captures ne suffit pas à calibrer
**Probabilité :** modérée (dépendance volontaires)
**Impact :** Tier 2 seuils reste heuristiques, accuracy probable 60-70% au lieu de 75-85%
**Mitigation :**
- Plan B : release Tier 2 en beta publique, avec disclaimer "précision non-validée, en cours de calibration"
- Collecte corpus continue en production (opt-in utilisateurs)
- Retraining trimestriel quand corpus atteint N=100

### R8 — Variance inter-individuelle domine Tier 2
**Probabilité :** élevée (c'est documenté dans la littérature)
**Impact :** Plafond accuracy cross-sectional ~70%
**Mitigation :**
- **Accepter** : c'est le plafond scientifique, documenté dans disclaimers
- Recommander baseline (Tier 1) aux utilisateurs récurrents
- Positionner Tier 2 comme "signal", pas "verdict"

### R9 — Fatigue confound qui mime alcool
**Probabilité :** certaine (session nuit tardive)
**Impact :** Faux positifs alcool
**Mitigation :**
- Capture context : heure, hours since sleep → Claude explicite dans narrative
- Dans le corpus : stratifier par fatigue (captures alcool+sober+fatigued)
- Message UI : "fatigue et alcool produisent des signaux similaires — ton résultat peut refléter l'un ou l'autre ou les deux"

### R10 — Tyson 2021 et Suffoletto 2023 limitations non transposables
**Probabilité :** quasi-certaine (different hardware)
**Impact :** Accuracy réelle inférieure à la littérature
**Mitigation :**
- Documenté dans `01-science-foundation.md`
- Résultats measurés sur corpus sont LA vérité terrain (pas la littérature extrapolée)
- Calibration locale > extrapolation

---

## 3. Risques utilisateur / produit

### R11 — Utilisateur conduit après verdict Tier 2 "low"
**Probabilité :** possible malgré disclaimers
**Impact :** juridique + éthique majeur en cas d'incident
**Mitigation :**
- Disclaimers MULTIPLES : onboarding, pré-test, post-résultat
- Aucun CTA "tu peux conduire" jamais
- Message explicite : "ce test ne remplace pas un éthylotest, et un éthylotest ne remplace pas ton jugement"
- ToS avec clause de responsabilité explicite
- Log par user du disclaimer vu + accepté (localStorage avec timestamp)

### R12 — Utilisateur qui abuse : multi-captures rapides pour "faire passer"
**Probabilité :** prévisible
**Impact :** dégradation de la crédibilité du produit
**Mitigation :**
- Cooldown 10 min entre captures Tier 2 (pas de retry permis)
- Affichage dans UI : "ce test a déjà été fait il y a X min, même résultat attendu"
- Pas de "moyenne" des tentatives

### R13 — Modal baseline trop long, utilisateurs abandonnent
**Probabilité :** modérée
**Impact :** Tier 1 adoption basse, Tier 2 devient majoritaire (moins fiable)
**Mitigation :**
- Calibration Tier 1 le plus court possible (3 min, vérifier UX)
- Expliquer le bénéfice clair : "sans calibration, précision réduite"
- Option "Quick Check" accessible direct pour utilisateur pressé

### R14 — Plainte RGPD / demande d'accès aux données
**Probabilité :** faible mais non nulle
**Impact :** juridique
**Mitigation :**
- Stockage local par défaut, Supabase opt-in
- Consentement explicite à chaque opt-in
- Droit à l'effacement fonctionnel dans l'app
- Pas de PII collectée (features numériques + BAC self-reported + participant pseudonymisé)
- ToS et Privacy Policy clairs

---

## 4. Risques projet / planning

### R15 — Scope creep — vouloir ajouter Tier 3, Tier 4...
**Probabilité :** élevée (enthousiasme auteur)
**Impact :** release jamais shippée
**Mitigation :**
- Ce master plan est le scope. Tout ajout = un plan séparé post-v3.0.
- Reviews bi-hebdomadaires : "sommes-nous toujours dans le scope ?"
- Non-goals explicites dans `00-master-plan.md section 7`

### R16 — Calibration corpus prend plus long que prévu
**Probabilité :** modérée
**Impact :** release v3.0 retardée
**Mitigation :**
- **Release v3.0-alpha avec Tier 1 seulement** avant fin Phase 1 (donc semaine 1)
- Tier 1 est scientifiquement autosuffisant
- Tier 2 reste en beta interne jusqu'à corpus prêt
- Users ont déjà un produit utile dès semaine 1

### R17 — Dépendance à Claude API (cost + reliability)
**Probabilité :** certaine (on utilise Claude)
**Impact :** coût variable, latence occasionnelle
**Mitigation :**
- Scoring DÉTERMINISTE dans les deux tiers — Claude ne calcule pas le score
- Claude fournit seulement explications + cognitive scoring
- Si Claude down : fallback message "analyse narrative indisponible, score technique affiché"
- Budget Claude : estimer ~1500 tokens input + 1500 output par session, $0.01 per capture
- Monitoring coût Anthropic dashboard

### R18 — iPhone specific bugs que Chromium ne révèle pas
**Probabilité :** haute (WebKit ≠ Chromium)
**Impact :** Bug non détecté en CI
**Mitigation :**
- Tests manuels iPhone à chaque phase (checklist dédiée)
- Audit logs enrichis pour iPhone sessions (déjà en place via commit `1267e2e`)
- Test sur multiple iPhones (12, 13, 14, 15) si possible
- Feedback utilisateurs beta

---

## 5. Risques émergents

### R19 — iOS Safari mise à jour casse quelque chose (e.g. DeviceMotion, Web Speech)
**Probabilité :** faible mais réelle (Apple breaking changes)
**Impact :** test cassé en production
**Mitigation :**
- Audit logs captent les échecs de permission / API
- Sentry alert si erreur rate spike
- Rollback Vercel si incident majeur
- Test matrix iOS version au minimum tous les trimestres

### R20 — Anthropic change leur modèle Claude et le prompt drift
**Probabilité :** certaine à long terme
**Impact :** narratives Claude inattendues
**Mitigation :**
- Version le modèle dans les audit logs
- Regression tests snapshot sur sortie Claude
- Prompt eng budget post-release pour ajuster

---

## 6. Matrice globale des risques

| Risque | Probabilité | Impact | Score |
|---|---|---|---|
| R1 STT bruyant | Haute | Haut | **Critique** |
| R2 Motion refusé | Modérée | Modéré | Modéré |
| R3 FPS bas devices anciens | Modérée | Haut | **Important** |
| R4 AGC non désactivable | Faible | Haut | Modéré |
| R5 Écran bright low | Faible | Faible | Bas |
| R6 Landmarks bruités | Modérée | Modéré | Modéré |
| R7 Corpus <30 | Modérée | Haut | **Important** |
| R8 Variance inter-individuelle | Haute | Haut | **Critique** (accepté) |
| R9 Fatigue confound | Certaine | Modéré | **Important** (géré) |
| R10 Litt non transposable | Quasi-certaine | Haut | **Critique** (accepté) |
| R11 User conduit quand même | Possible | Haut | **Critique** |
| R12 Multi-captures abuse | Prévisible | Modéré | Modéré |
| R13 Baseline modal long | Modérée | Modéré | Modéré |
| R14 RGPD | Faible | Haut | Modéré |
| R15 Scope creep | Haute | Haut | **Important** |
| R16 Calibration tardive | Modérée | Modéré | Modéré (parade alpha) |
| R17 Claude API cost/down | Certaine | Faible | Bas |
| R18 iPhone-specific bugs | Haute | Modéré | **Important** |
| R19 iOS update | Faible | Haut | Modéré |
| R20 Claude model drift | Certaine | Faible | Bas |

**Risques critiques qui nécessitent vigilance active :**
- R1 STT bruyant : tester DANS le bar, pas juste au labo
- R8 variance inter-individuelle : accepter, documenter, ne pas vendre "verdict"
- R10 littérature non transposable : le corpus local est la seule vérité
- R11 user conduit : disclaimers + ToS + pas de CTA direction conduite

---

## 7. Plan de contingence global

Si un risque critique se matérialise :
1. **Arrêt des features touchées** (switch off via env var ou flag)
2. **Communication utilisateurs** (bandeau, email si sync activée)
3. **Post-mortem** dans `docs/postmortems/`
4. **Patch ou rollback** dans les 48h

---

## 8. Checklist pré-release pour risk sign-off

Avant tag v3.0 :
- [ ] R1 : STT testé en environnement bruyant, accuracy ≥ seuil acceptable documenté
- [ ] R3 : FPS mesuré sur iPhone 12 minimum, ≥ 15
- [ ] R7 : Corpus ≥ 30 OU release beta-only
- [ ] R11 : ToS disclaimers review juridique (au moins lecture attentive)
- [ ] R15 : Scope intact (pas d'ajouts hors master plan)
- [ ] R18 : Tests manuels iPhone 100% OK

Si un de ces points n'est pas OK → pas de release v3.0, itération supplémentaire.
