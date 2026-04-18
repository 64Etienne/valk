# 03 — Protocole SFST-équivalent : design des 4 sous-tests

**But :** spécifier précisément les 4 sous-tests du Tier 2 Quick Check, leur implémentation technique, leurs métriques, et leurs seuils initiaux.

---

## 1. Vue d'ensemble

Le Tier 2 reproduit, sur smartphone grand public, les 4 dimensions que teste un SFST policier :
1. **Oculomotor control** → HGN-alike
2. **Postural control** → Romberg sway IMU
3. **Divided attention / cognition** → tâches verbales STT-scorées
4. **Reaction time / motor** → tap test

Durée totale : ~3-4 min. Tous consécutifs, avec transitions guidées.

Stimulus + prompts en français (langue produit). Voir section 7 pour internationalisation future.

---

## 2. Test 1 — HGN-alike *(90s)*

### Fondement scientifique
- Stuster & Burns 1998 : HGN 4+ clues = 88% accuracy à BAC ≥0.08%
- Tyson 2021 : pursuit gain dose-dependent dès 0.015% BAC, saccades compensent
- Protocole clinique HGN : stimulus 30-40 cm des yeux, déplacement latéral lent à 45°, hold 4s

### Adaptation iPhone
Phone tenu à ~25-30 cm face utilisateur, utilisateur immobile tête droite, suit l'œil seulement.

### Stimulus
Pastille verte 24 px sur fond blanc (max contrast).
Trajectoire en 3 passes :

```
t=0-2s   : center → right 45° (rampe linéaire lente)
t=2-6s   : hold 45° right (4s)
t=6-8s   : right → center
t=8-10s  : center → left 45°
t=10-14s : hold 45° left (4s)
t=14-16s : left → center
t=16-18s : center → up 30° (vertical, détection vestibular-gaze)
t=18-22s : hold 30° up (4s)
t=22-24s : up → center
```

Total 24s actifs + 10s instructions/calibrage distance → 90s avec marge.

### Détection distance user-caméra
Avant démarrage : MediaPipe iris landmark diameter en pixels → distance estimée par iris ≈ 11.7 mm (iris constant). Gate sur 20-35 cm. Si hors range, instruction "rapproche / éloigne".

### Features extraites par œil
Pour chaque œil (L, R), sur chaque phase (right-ramp, right-hold, left-ramp, left-hold, up-ramp, up-hold) :

- **Pursuit velocity ratio** (rampes) : iris_velocity / target_velocity via optical flow sur iris landmarks
- **Pursuit lag** : corrélation décalée iris(t-τ) vs target(t), τ optimal
- **FFT iris position** (holds 4s) : power dans bande 3-6 Hz (nystagmus)
- **Saccade count** (rampes) : détection jerks > threshold
- **Deviation angle** : position iris à fin de rampe en deg

### Clues HGN-like *(par œil)*
1. **Lack of smooth pursuit** : velocity_ratio < 0.80 sur au moins 50% de la rampe
2. **Distinct nystagmus at max deviation** : FFT power 3-6 Hz / baseline power > threshold (calibré)
3. **Onset before max deviation** : premier nystagmus spectral peak pendant la rampe (avant hold)

Total : 3 clues × 2 yeux = **6 clues max**.

### Seuils initiaux *(à calibrer avec corpus)*
- velocity_ratio threshold : 0.80 (de la litt : 0.85-1.15 normal → 0.80 est déjà marge)
- FFT 3-6 Hz ratio : 3.0 (3x la baseline spectrale)

### Score sous-test HGN
- 0-1 clues → sous-score HGN = 0
- 2-3 clues → sous-score HGN = 33
- 4 clues → sous-score HGN = 66 (seuil Stuster&Burns)
- 5-6 clues → sous-score HGN = 100

### Qualité minimum requise
- FPS moyen ≥ 20 sur la séquence
- Face tracking continu ≥ 90% du temps
- Si pas atteint → HGN excluded from fusion, weight 0

### Implementation notes
- Nouveau composant `src/components/capture/HgnStimulus.tsx` animant la pastille via Web Animations API (compositor-thread, même approche que PursuitDot v2)
- Nouveau `src/lib/analysis/hgn.ts` : algorithme de détection nystagmus, pursuit ratio
- Test unitaire sur signal synthétique (sinusoïde pure vs bruit)

---

## 3. Test 2 — Romberg postural sway *(20s)*

### Fondement scientifique
- Hedlund, Moskowitz et al. — postural sway amplitude augmente à BAC 0.04%+
- Cooper 2020 : IMU smartphone suffisant pour capter ce signal
- Protocole clinique Romberg : debout, pieds joints, bras croisés, yeux fermés, 30-60s

### Adaptation iPhone
Utilisateur tient le phone à bras tendu, yeux fermés, 20s. L'IMU du phone capture les micro-mouvements du bras, qui reflètent la stabilité posturale globale.

Alternative considérée : phone posé sur le torse, mais complique la consigne. Bras tendu reste plus simple.

### Prérequis
- `DeviceMotionEvent.requestPermission()` à l'entrée du test (iOS 13+)
- HTTPS obligatoire
- Si refus permission → test skipé, sous-score = null, weight = 0 en fusion

### Données collectées
- `accelerationIncludingGravity` à ~60 Hz (iOS native) sur 20s = 1200 samples
- Axes x, y, z

### Pré-traitement
1. Re-échantillonner à 50 Hz (certains devices à 10-100 Hz variable)
2. High-pass filter à 0.5 Hz pour retirer la composante gravité statique
3. Calcul du jerk (dérivée de l'accélération) — signal reflétant tremor + sway

### Features
- **Sway RMS** : RMS de la magnitude du jerk filtré
- **Sway peak frequency** : FFT, pic dominant en Hz
- **High-frequency content ratio** : (4-8 Hz band) / (total power) — tremor physiologique alcool
- **Total sway path** : intégrale de la magnitude

### Seuils initiaux *(à calibrer)*
- Sway RMS sobre attendu : 0.02-0.08 m/s³
- Sway RMS alcool BAC 0.05%+ attendu : >0.12 m/s³
- Ratio 4-8 Hz sobre : < 0.15
- Ratio 4-8 Hz alcool : > 0.25

### Score sous-test Romberg
Normalisation sur les seuils calibrés par corpus, score 0-100.

### Quality gates
- Si permission refusée → null + weight 0
- Si < 15s de données valides → null + weight 0
- Si outliers majeurs (phone tombé, >2g spike) → null

### Implementation notes
- Nouveau hook `src/lib/hooks/useDeviceMotion.ts` gérant la permission et l'accumulation
- Nouveau `src/lib/analysis/postural-sway.ts` : FFT + filtering + scoring
- Composant UI `src/components/capture/RombergTest.tsx` avec countdown visuel 20s

---

## 4. Test 3 — Cognitive verbal *(90s)*

### Fondement scientifique
- Fillmore 2003 : divided attention + alcohol → performance degradation dose-dependent
- SFST cognitive tasks (compter à rebours, alphabet) utilisés depuis 1970s en clinique
- Moskowitz 1988 : accuracy + speed de tâches verbales corrélées BAC

### Deux tâches séquentielles

#### Tâche A — "Compte à rebours de 100 par 7"
- Consigne : "Comptez à rebours de 100 par 7, à voix haute. Arrêtez à 2 ou moins."
- Séquence attendue : 100, 93, 86, 79, 72, 65, 58, 51, 44, 37, 30, 23, 16, 9, 2
- 15 nombres, chacun sur ~2 secondes → ~30s attendu
- STT via Web Speech API (iOS Safari 14.5+) en français

#### Tâche B — "Mois de l'année à l'envers"
- Consigne : "Récitez les mois de l'année en partant de décembre."
- Séquence : décembre, novembre, octobre, septembre, août, juillet, juin, mai, avril, mars, février, janvier
- 12 mots, ~15-20s attendu
- STT également

### Features par tâche
- **Accuracy** : (items corrects / items attendus) × 100
- **Completion time** : temps total pour terminer la séquence
- **Pause longueur** : nombre de pauses > 1s entre items
- **Self-corrections** : detectable via STT ("non, je veux dire", "euh", "attends", répétitions)
- **Off-sequence items** : items dits qui ne sont ni dans la séquence attendue ni une auto-correction évidente

### Scoring per-task via Claude
Ici Claude **peut légitimement contribuer** — il évalue la qualité du langage. On lui passe :
- Transcription STT brute
- Séquence attendue
- Timing des mots (start/end ms)

Claude répond en JSON :
```json
{
  "attempted": true,
  "accuracy": 0.87,
  "completion_time_ms": 34000,
  "hesitation_count": 3,
  "self_corrections": 1,
  "off_sequence_items": 0,
  "qualitative_note": "completed with moderate fluency, slight hesitation on 93→86"
}
```

### Features finales fusion
Pour les 2 tâches :
- Accuracy globale (moyenne)
- Completion time globale (somme)
- Hesitation rate globale

### Seuils initiaux *(à calibrer)*
- Accuracy sobre attendu : > 0.90
- Accuracy impaired attendu : < 0.70
- Completion time sobre attendu : < 45s pour les 2
- Completion time impaired attendu : > 70s pour les 2

### Score sous-test cognitif
Score 0-100 sur la base accuracy + time normalisés aux seuils corpus.

### Quality gates
- Si STT ne capte rien → null + weight 0
- Si SNR audio < 10 dB → low confidence, poids réduit 0.5x
- Si accuracy = 0 (aucune séquence reconnue) → user didn't speak or mic failed, null

### Fallback STT
Web Speech API peut ne pas être fiable. Plan de repli :
- Option 1 : Whisper.cpp WASM côté client (modèle small ~150MB, too big probably)
- Option 2 : envoi audio au serveur → Whisper via API (hors scope privacy)
- Option 3 : heuristiques acoustiques (durée voiced, pause count, pitch variations) → approximation

Décision : commencer avec Web Speech API. Si accuracy STT insuffisante en test réel, envisager envoi côté serveur avec disclaimer explicite.

### Implementation notes
- Nouveau `src/components/capture/CognitiveTest.tsx` affichant l'instruction, gérant STT, affichant le texte reconnu en temps réel
- Nouveau `src/lib/analysis/cognitive-scoring.ts` pour appel Claude + scoring
- Nouvelle route `/api/cognitive-score` qui prend transcription + expected sequence et retourne score structuré

---

## 5. Test 4 — Reaction time tap *(30s)*

### Fondement scientifique
- Moskowitz & Fiorentino 2000 : RT ↑ 20-40% à BAC 0.08%
- Go/no-go paradigm classique en psycho-pharmacologie
- Mesure robuste, peu sensible à la qualité caméra/micro

### Protocole
- Écran noir, au centre apparaît aléatoirement une forme : **carré vert** (go), **rond rouge** (no-go), **triangle jaune** (no-go)
- L'utilisateur tape sur l'écran dès qu'il voit le carré vert
- Intervalle entre stimuli : 1-3s (randomisé)
- 20 stimuli total, ~6-8 carrés (go), ~12-14 ronds/triangles (no-go)
- Durée totale ~30-40s

### Features
- **Mean RT** : temps moyen de tap après apparition du carré vert (ms)
- **RT SD** : écart-type de RT (variabilité cognitive)
- **Commission errors** : taps sur no-go (rond/triangle)
- **Omission errors** : carrés verts manqués
- **Hit rate** : (carrés tapés / carrés présentés)

### Seuils initiaux *(à calibrer)*
- Mean RT sobre attendu : 350-500 ms
- Mean RT impaired attendu : > 550 ms
- Commission errors sobre : < 5%
- Commission errors impaired : > 15%

### Score sous-test RT
Composite des 4 features normalisées aux seuils corpus, 0-100.

### Quality gates
- Si user ne tape aucun carré → invalid, null
- Si commission rate = 100% (user tape tout) → invalid, null
- Si phone device is slow and frame rate drops, RT measurement has >50ms jitter → flag low confidence

### Implementation notes
- Nouveau `src/components/capture/ReactionTimeTest.tsx` avec canvas 2D simple
- RequestAnimationFrame pour timing précis
- Nouveau `src/lib/analysis/reaction-time.ts` pour scoring
- Timer précision : use `performance.now()` sur l'event `pointerdown`

---

## 6. Fusion des 4 sous-scores

### Logique
```
overall = (w_HGN × score_HGN
         + w_Romberg × score_Romberg
         + w_Cognitive × score_Cognitive
         + w_RT × score_RT)
        / Σ weights
```

### Poids initiaux
Basés sur la fiabilité du signal sur smartphone :
- w_HGN = 0.30 (fort signal biologique, mais fragile à FPS/bruit)
- w_Romberg = 0.25 (robuste si permission accordée)
- w_Cognitive = 0.30 (résistant, insensible au hardware eye/camera)
- w_RT = 0.15 (simple, robuste, mais moins discriminant)

Si un sous-test est `null` (quality gate), son poids passe à 0 et les autres sont re-normalisés.

### Verdict final
```
overall < 30 → "low" (indicateurs globalement normaux)
30 ≤ overall < 60 → "moderate" (indicateurs mitigés, prudence)
overall ≥ 60 → "high" (indicateurs compatibles avec impairment)
```

### Seuils à calibrer via corpus
Les poids et les seuils finaux sont **à déterminer via le corpus labelisé** :
- Pour chaque capture, on a BAC vraie + les 4 sous-scores
- Logistic regression avec lasso ou Random Forest pour apprendre les poids optimaux
- LOSO cross-validation pour éviter overfitting

### Role de Claude dans la fusion
**Claude ne calcule pas le score**. Il reçoit :
- Les 4 sous-scores numériques
- Les quality gates qui ont passé / échoué
- Le context (heure, éclairage)
- Les features les plus saillantes

Il produit :
- Une **explication narrative** en français : "ton test HGN montre du nystagmus à 4 Hz dans les deux yeux, ce qui est compatible avec alcohol ou fatigue"
- Une **recommandation contextualisée** : "à 02h37 avec 15h d'éveil, la fatigue pourrait contribuer ; si tu as aussi bu, les deux effets s'additionnent"
- **Jamais** un verdict ou un chiffre BAC

---

## 7. Internationalisation (post-MVP)

Pour l'instant français only. Post-release :
- Anglais (extensive STT support Web Speech)
- Séquences alternatives selon la langue (alphabet backward, months, etc.)
- Prompts traduits

---

## 8. Calibration via corpus

Le document [04-corpus-collection.md](./04-corpus-collection.md) détaille comment recueillir un corpus de captures labellisées BAC pour calibrer les seuils Tier 2. Sans corpus, le Tier 2 utilise des seuils extrapolés de la littérature — précision sous-optimale, à documenter dans les disclaimers.

---

## 9. Tests unitaires prévus

- `hgn.test.ts` : signal synthétique sinusoïde pure, nystagmus simulé, bruit
- `postural-sway.test.ts` : signal IMU stable vs avec tremor synthétique
- `cognitive-scoring.test.ts` : transcriptions artificielles avec erreurs connues
- `reaction-time.test.ts` : séquences de taps simulées avec RT distributions connues
- `fusion.test.ts` : combinaisons de sous-scores et quality gates

---

## 10. UX flow complet Tier 2

```
/quick (entrée)
  ↓ modal explicatif + consent
  ↓ demande permission DeviceMotionEvent + caméra + micro
  ↓ instructions visuelles + audio
  ↓ Test 1 HGN (90s)
  ↓ transition 3s
  ↓ Test 2 Romberg (20s)
  ↓ transition 3s
  ↓ Test 3 Cognitive (90s)
  ↓ transition 3s
  ↓ Test 4 RT (30s)
  ↓ "Analyse en cours" (spinner)
  ↓ fusion scoring
  ↓ /quick/results
     ↓ Verdict + 4 sous-scores + Claude narrative + disclaimer
```
