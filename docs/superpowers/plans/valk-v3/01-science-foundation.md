# 01 — Science Foundation : audit des citations et méthodologie

**But :** figer l'état de vérité scientifique sur lequel Valk v3 se construit. Chaque claim ici est vérifié via PubMed ou source primaire.

---

## 1. Citations du prompt Claude actuel : statut vérifié

### Vérifiées (à conserver avec contexte précis)

#### Tyson et al. 2021
- **Référence** : Tyson TL, Feick NH, Cravalho PF, Flynn-Evans EE, Stone LS. "Dose‐dependent sensorimotor impairment in human ocular tracking after acute low‐dose alcohol administration." *J Physiol*. 2021;599(4):1225-1242.
- **DOI** : [10.1113/JP280395](https://doi.org/10.1113/JP280395) (PMID: 33332605)
- **Méthodo** : N=16, within-subject pre/post alcohol, eye tracker laboratoire 1 kHz, monitor 144 Hz, step-ramp target
- **Résultats réels** :
  - Pursuit gain significativement réduit dès 0.015% BAC
  - Saccades compensent le déficit pursuit jusqu'à ~0.055% BAC
  - Réduction pursuit gain ~25% à 0.065% BAC
  - **PLR (pupil light response) NON affectée jusqu'à 0.065% BAC**
  - Analyse : régression linéaire simple (slope + intercept), **pas de r² rapporté pour pursuit gain**
- **Ce qui était fabriqué dans notre prompt** :
  - ~~r² = 0.96~~ — le papier ne rapporte pas cela
  - ~~Gain <0.70 threshold~~ — aucun seuil absolu proposé
  - ~~94% loss recovery~~ — le chiffre 94% n'apparaît pas
- **Usage correct pour Valk** : la mesure pursuit+saccade combinée a une base physiologique réelle. Mais **elle ne s'applique pas en zero-shot sans baseline** — Tyson compare chaque sujet à lui-même.

#### Roche & King 2010
- **Référence** : Roche DJ, King AC. "Alcohol impairment of saccadic and smooth pursuit eye movements: impact of risk factors for alcohol dependence." *Psychopharmacology*. 2011;212(1):33-44.
- **DOI** : [10.1007/s00213-010-1906-8](https://doi.org/10.1007/s00213-010-1906-8) (PMID: 20635179)
- **Méthodo** : N=138, within-subject placebo-controlled, doses 0.4 g/kg et 0.8 g/kg
- **Résultats réels** : pursuit gain + saccade latency/velocity/accuracy significativement altérés aux deux doses. Sous-groupes FH+/FH- différenciés.
- **Usage correct pour Valk** : confirme la dose-réponse pursuit+saccade dans la gamme 0.05-0.10% BAC typique US DUI. Fondement théorique de notre Tier 1 pursuit.

#### Suffoletto et al. 2023
- **Référence** : Suffoletto B, Anwar A, Glaister S, Sejdic E. "Detection of Alcohol Intoxication Using Voice Features: A Controlled Laboratory Study." *J Stud Alcohol Drugs*. 2023;84(6):808-813.
- **DOI** : [10.15288/jsad.22-00375](https://doi.org/10.15288/jsad.22-00375) (PMID: 37306378)
- **Méthodo** :
  - N=18, **tous W/NH** (limitation auteur-déclarée)
  - Tongue twisters, lus avant + chaque heure pendant 7h post-alcool (weight-based dose)
  - Voice cleaned (Wiener filter) + split 1-s windows à 44.1 kHz
  - Features : MFCC + spectral centroid + roll-off + flatness + bandwidth + contrast → **PCA à 50 composantes**
  - Classifier : **SVM**, leave-one-participant-out cross-validation
  - **Chaque timepoint comparé à baseline BrAC=0% du MÊME sujet**
- **Résultats réels** :
  - Accuracy 97.5% (CI 96.8-98.2), sensitivity 0.98, specificity 0.97 — par fenêtre 1-s
  - **Uniquement en within-subject**
- **Ce qui était distordu dans notre prompt** :
  - ~~"<110 wpm suggestive"~~ — paper ne mesure pas speech rate
  - ~~">250ms mean pause"~~ — paper ne mesure pas pauses
  - ~~">0.3 flatness slurred"~~ — flatness est feature, pas de seuil publié
- **Usage correct pour Valk** : Suffoletto est le fondement du Tier 1 voix. Méthode **repliquable techniquement** (MFCC + spectrals → cosine distance vs baseline). **Non applicable** sans baseline.

#### Cori et al. 2023
- **Référence** : Cori JM, Wilkinson VE, Jackson M, Westlake J, Stevens B, Barnes M, Swann P, Howard ME. "The impact of alcohol consumption on commercial eye blink drowsiness detection technology." *Hum Psychopharmacol*. 2023;38(4):e2870.
- **DOI** : [10.1002/hup.2870](https://doi.org/10.1002/hup.2870) (PMID: 37291082)
- **Méthodo** : N=12, 3 conditions BAC (0/0.05/0.08%), 60-min simulated driving, dispositif **Optalert** IR commercial
- **Résultats réels** : à 0.08% BAC, tous blink parameters affectés ; à 0.05% seul Johns Drowsiness Scale composite affecté
- **Ce qui était distordu dans notre prompt** : appliquer cette étude à la détection d'alcool par webcam est un stretch — le papier teste un dispositif IR dédié dans un contexte de détection de somnolence, pas webcam selfie.
- **Usage correct pour Valk** : blink rate + PERCLOS ont une base physiologique réelle pour alcohol, MAIS (a) hardware IR dédié, (b) contexte driving, (c) N=12 — pas extrapolable brut.

#### Stuster & Burns 1998
- **Référence** : Stuster J, Burns M. "Validation of the Standardized Field Sobriety Test Battery at BACs Below 0.10 Percent." NHTSA DOT HS 808 839.
- **URL** : [ojp.gov/pdffiles1/Photocopy/197439NCJRS.pdf](https://www.ojp.gov/pdffiles1/Photocopy/197439NCJRS.pdf)
- **Statut** : rapport gouvernemental non peer-reviewed
- **Méthodo** : N=297 (217 arrêtés, 80 non-arrêtés), sample biaisé 72% BAC ≥ 0.08%
- **Résultat** : officier avec SFST complet 91% accuracy ; HGN seul 4+ clues = 88% accuracy
- **Usage correct pour Valk** : protocole HGN source de notre Tier 2 HGN-alike. Rappeler la base-rate bias dans les disclaimers.

### Fabriquées (à retirer)

- ❌ **Kim 2012 blink rate +27-49%** : introuvable PubMed, recherches multiples, aucune source vérifiable. **Retirée.**
- ❌ **Jolkovsky 2022 PLR N=201** : introuvable PubMed. **Retirée.**
- ❌ **Castro 2014 pupil dilation +8.8%** : introuvable PubMed. **Retirée.**
- ❌ **Tyson 2021 r²=0.96** : n'apparaît pas dans le full-text du papier. **Retirée.**
- ❌ **"94% saccade recovery at 0.055%"** : pas dans Tyson. **Retirée.**
- ❌ **Seuil absolu "<110 wpm suggestive"** : pas dans Suffoletto. **Retirée.**
- ❌ **Seuil absolu ">250ms mean pause"** : pas dans Suffoletto. **Retirée.**
- ❌ **Seuil absolu ">0.3 spectral flatness slurred"** : pas dans Suffoletto. **Retirée.**

### Non vérifiées mais plausibles *(à traiter avec prudence)*

- Stern et al. 1994 blink rate norm 12-20/min : pas vérifié formellement mais cohérent avec corpus secondaire (Cruz 2011, Bentivoglio 1997). Acceptable comme ordre de grandeur.
- NHTSA/FHWA 1994 PERCLOS 15% threshold : cité largement dans littérature driver drowsiness, accepté comme seuil industriel.
- Moskowitz 1988 RT +20-40% à BAC 0.08% : cité dans revues NHTSA. Base utilisable pour Tier 2 RT.

---

## 2. Études cross-sectional (sans baseline) : quoi sert à Tier 2

Pour construire Tier 2, on s'appuie sur des études qui ont évalué une mesure en mode speaker/subject-independent :

### Interspeech 2011 Speaker State Challenge
- **Source** : [Schuller et al. 2011](https://www.bas.uni-muenchen.de/forschung/publikationen/Schuller-IS2011.pdf)
- Alcohol Language Corpus allemand, BAC cutoff ≥ 0.05%
- Meilleur individuel : **70.5% UAR** ; fusion de toutes équipes : 72.2% UAR
- Baseline : 65.9% UAR (chance 50%)
- **Plafond démontré de la voix cross-sectional sans baseline individuel**

### Bone et al. 2014
- **DOI/PMC** : [PMC3872081](https://pmc.ncbi.nlm.nih.gov/articles/PMC3872081/)
- Améliore Interspeech 2011 à ~70% sur ALC
- SOTA cross-sectional voice alcohol

### Koch et al. 2023 (CHI)
- **Arxiv** : [arxiv 2301.08978](https://arxiv.org/abs/2301.08978)
- N=30, simulator drive, **leave-one-subject-out cross-validation** (zero baseline per-subject)
- AUROC 0.88 (any alcohol) / 0.79 (above 0.05 g/dL)
- Hardware : driver monitoring camera + CAN telemetry
- Features : gaze, head movements, vehicle interaction — **pas un selfie statique**
- **Ce qui nous enseigne** : cross-sectional ML sur camera + contexte de conduite atteint AUROC 0.88. **Sans contexte driving**, on a moins.

### DADSS program *(15 ans)*
- [NHTSA overview](https://www.nhtsa.gov/sites/nhtsa.gov/files/hyundaidadss.pdf)
- Après 15 ans, convergence sur breath + touch spectroscopy ; caméra **adjuvante seulement**
- Implicite : camera-only cross-sectional insuffisant pour intégration véhicule critique

### Moskowitz & Fiorentino 2000
- **NHTSA report** : [809028.pdf](https://www.nhtsa.gov/sites/nhtsa.gov/files/809028.pdf)
- Revue systématique des effets comportementaux alcool aux différents BAC
- RT ↑ ~20-40% à 0.08% BAC
- Postural control (Romberg) dégradé de 0.04% BAC upward
- **Base de seuils Tier 2 RT et sway**

---

## 3. Ce que les études confirment qu'on peut mesurer vs pas

### Mesurable sur iPhone grand public avec protocole correct

| Mesure | Base scientifique | Notre feasibility |
|---|---|---|
| Pursuit gain (velocity ratio) | Tyson 2021, Roche&King 2010 | Oui si FPS≥25 et protocole step-ramp |
| Nystagmus (3-6 Hz) | Stuster&Burns 1998 (HGN) | Marginal — Nyquist limite à FPS≥15, bruit landmark iris |
| Saccade rate pendant pursuit | Tyson 2021 | Oui si FPS≥25 |
| Speech spectral features (MFCC etc.) | Suffoletto 2023, Interspeech 2011 | Oui |
| Speech rate (voiced-time) | Fillmore 2003 | Oui après fix VAD |
| Reaction time (tap) | Moskowitz 2000 | Oui, très robuste |
| Postural sway (Romberg via IMU) | Hedlund 1988, Cooper 2020 | Oui si DeviceMotionEvent permis |
| Cognitive accuracy (count-backward etc.) | Fillmore 2003, divided attention studies | Oui via STT + LLM scoring |

### Non mesurable fiablement sur iPhone grand public

| Mesure | Raison |
|---|---|
| PLR latency/amplitude/velocity | Screen flash overexposure capteur iPhone |
| Sclera color (LAB) | Aucune référence colorimétrique, AGC/WB destroy signal |
| HGN clinical-grade | Resolution angulaire insuffisante pour 0.5° nystagmus |
| BAC numérique | Aucun proxy consumer-hardware-friendly atteint ±0.01% |
| Walk-and-Turn | Phone camera ne voit pas les pieds |
| Iris color calibration | Front camera specs varient trop |
| Pupil size absolu (mm) | Distance face-caméra variable, calibration iris ~11.7mm est une approximation ±10% |

### Mesurable avec effort modéré

| Mesure | Effort requis |
|---|---|
| Pupil size **delta** (normalisé iris-diameter) | Iris landmark constance + trimmed mean |
| Blink rate stable | Durée de mesure ≥ 30s (pas 5s baseline actuel) |
| PERCLOS stable | Idem |
| Speech pause ≠ hesitation | STT + heuristiques cognitives (filled pauses "euh", self-corrections) |

---

## 4. Convention de citation pour Valk v3

Toute affirmation numérique dans le prompt Claude ou la UI doit inclure :
1. Auteur + année
2. DOI ou URL primaire
3. N de l'étude
4. Populations/limitations principales
5. Hardware utilisé (pour anticiper la transposabilité)

Exemple de format à utiliser dans le prompt :
```
Pursuit gain relative to target velocity may decrease with alcohol
(Tyson et al. 2021, J Physiol, N=16, 1 kHz lab eye tracker, within-subject).
This correlation is NOT directly transposable to consumer webcam at 15-30 FPS.
```

Pas de seuil absolu invoqué sans citation explicite de sa source et validation dans le contexte.

---

## 5. Ce document est la référence de vérité

Toute modification du prompt Claude, de la doc UX, du contenu des disclaimers doit être cross-checked contre ce document. Si une affirmation ne peut pas être sourcée ici, elle n'a pas lieu d'être dans le produit.

**Tenu à jour par :** chaque PR qui touche la littérature ou le scoring doit mettre à jour ce fichier si nécessaire.
