# 04 — Corpus Collection : protocole pour corpus labellisé BAC

**But :** construire un corpus de captures étiquetées par éthylotest, nécessaire à la calibration des seuils Tier 2 et à la validation statistique de Tier 1.

**Responsable :** l'auteur + 10-20 volontaires confirmés.

---

## 1. Objectif quantitatif

- **Minimum viable** : 30 captures labellisées sur 6-10 sujets différents, répartis sur la courbe BAC 0.00 → 0.10%
- **Cible** : 100 captures sur 15-20 sujets
- **Stretch** : 200+ captures multi-sessions pour valider reproductibilité intra-sujet

Distribution idéale des captures :
- ~40% à BAC 0.00% (sober control, crucial pour spécificité)
- ~20% à 0.01-0.03% (ultra-low, très discriminant pour Tier 1 Δ-from-baseline)
- ~20% à 0.04-0.06% (sub-legal en FR — 0.05% limite)
- ~20% à 0.07-0.10% (légalement impaired dans la plupart des pays)

**Ne jamais collecter à BAC > 0.10%** — éthique et sécurité.

---

## 2. Considérations éthiques *(non-négociables)*

### Participants
- Adultes 21+ uniquement
- Buveurs habituels (au moins 1 fois / semaine) pour limiter les effets cascade
- Pas d'antécédent de dépendance alcool
- Pas de médicaments interagissant (rappel explicite)
- Consentement éclairé écrit avant chaque session

### Sécurité
- **Pas de conduite** pendant / après la session. Ramener en Uber/taxi ou dormir sur place.
- Nourriture disponible pendant la session (réduire vitesse absorption)
- Hydratation imposée
- Session en présence d'un co-auteur sober qui surveille
- Arrêt immédiat si un participant se sent mal

### Consentement écrit incluant
1. Description de l'étude (calibration modèle Valk)
2. Risques (intoxication modérée, effets secondaires possibles)
3. Protection des données (features numériques uniquement stockées, pas de vidéo)
4. Droit de retirer ses données à tout moment
5. Pas d'indemnité financière (bénévole)

### Conformité RGPD
- Pas d'enregistrement vidéo/audio persistant (seules les features extraites sont stockées)
- Données pseudonymisées par ID de participant (pas de nom/email lié aux features)
- Corpus stocké localement ou Supabase avec RLS stricte
- Droit à l'effacement : une demande → suppression DELETE FROM `valk_corpus_labels` WHERE participant_id = ?

---

## 3. Protocole de session

### Matériel
- 1 éthylotest certifié (ex. Alcosense Pro, Drivesafe, ou équivalent ~40-80€, calibré < 1 an)
- 1 iPhone en mode capture Valk (idéalement iPhone 12+ pour FPS stables)
- Alcool (au choix : vin ~12%, bière ~5%, spiritueux ~40% selon préférence)
- Balance pour peser le participant (dose par kg)
- Eau + nourriture légère
- Consentement papier signé

### Dose par kg — référence
Pour cibler BAC progressifs, règle approximative :
- 0.1 g/kg alcool pur ≈ +0.01-0.02% BAC chez homme non-tolérant
- 0.2 g/kg ≈ +0.03-0.04%
- 0.4 g/kg ≈ +0.06-0.08%

Exemples pratiques pour un homme 75 kg :
- Dose 1 : 1 verre de vin (10 cl × 12% × 0.8 g/mL = 9.6 g alcool = 0.13 g/kg) → viser 0.02%
- Dose 2 : 2 verres cumulés → ~0.04%
- Dose 3 : 3 verres cumulés → ~0.06%
- Dose 4 : 4 verres cumulés → ~0.08%

Chez femmes et individus légers, doses adaptées.

### Timeline type d'une session (3h)
```
T-30min : consent signé, questionnaire (âge, poids, dernière alcoolémie, médicaments, sommeil)
T-0min  : baseline capture sober (BAC=0.00 vérifié à l'éthylotest)
T+20min : dose 1 consommée sur 10 min, attend 10 min d'absorption
T+30min : BAC mesurée, capture Valk
T+60min : dose 2, attend, BAC mesurée, capture Valk
T+90min : dose 3, attend, BAC mesurée, capture Valk
T+120min: dose 4, attend, BAC mesurée, capture Valk (ciblé ≤ 0.10%)
T+150min: nourriture, hydratation, retour à domicile organisé
```

Arrêt de protocole si BAC mesuré > 0.10% avant la dernière dose (skip la suivante).

### Chaque capture
Pour chaque point BAC dans la session :
1. Souffler dans l'éthylotest, **noter la valeur à 2 décimales**
2. Ouvrir Valk, activer mode "corpus collection" (à créer)
3. Entrer valeur BAC dans le champ corpus
4. Effectuer capture Tier 1 complète (baseline-like protocol)
5. Effectuer capture Tier 2 complète (4 sous-tests)
6. Noter dans le consent-log l'horodatage
7. Confirmer que la capture est sauvegardée + synchronisée (si Supabase actif)

Durée par capture : ~5 min (baseline ~45s + SFST ~4 min)

### Par session, par participant : 4-5 points BAC → 4-5 captures Tier 1 + 4-5 captures Tier 2 = **8-10 rows étiquetées par session**

### Cible collecte
- 10 sessions × 10 rows = 100 captures labellisées
- Au moins 6 participants différents

---

## 4. Format des données stockées

### Table `valk_corpus_labels` (Supabase, ou localStorage mirror)

```sql
CREATE TABLE valk_corpus_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  participant_id text NOT NULL,  -- pseudonymised UUID, consistent per volunteer
  session_id text NOT NULL,       -- groups captures from same session
  capture_id text NOT NULL,       -- matches capture.sessionId from Valk logger
  tier integer NOT NULL CHECK (tier IN (1, 2)),
  -- Self-reported label
  bac_self_reported decimal(4,3) NOT NULL,  -- e.g., 0.047
  bac_device_model text,                    -- e.g., "AlcoSense Pro"
  bac_device_calibration_date date,
  -- Context
  hours_since_last_meal decimal(3,1),
  hours_since_last_sleep decimal(3,1),
  participant_weight_kg decimal(4,1),
  participant_age_years integer,
  participant_sex text CHECK (participant_sex IN ('M', 'F', 'O', 'NR')),
  -- Capture metadata (copied for convenience)
  capture_device text,      -- user-agent
  capture_fps decimal(4,1),
  capture_ambient_lighting text,
  -- Features JSON (the entire analyze.payload)
  features_json jsonb NOT NULL,
  -- Results (the Claude response if any)
  result_json jsonb,
  -- Quality gates
  quality_gates_passed boolean NOT NULL,
  quality_gates_failed_reasons text[],
  -- Soft-delete for RGPD
  deleted_at timestamptz
);

CREATE INDEX idx_corpus_participant ON valk_corpus_labels (participant_id);
CREATE INDEX idx_corpus_bac ON valk_corpus_labels (bac_self_reported);

-- RLS : only admin role can read
ALTER TABLE valk_corpus_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read" ON valk_corpus_labels
  FOR SELECT USING (auth.role() = 'admin');
```

### Local storage format (fallback si Supabase non configuré)
Array JSON dans `localStorage.valk_corpus` :
```json
[
  {
    "id": "uuid",
    "createdAt": "2026-04-20T21:30:00Z",
    "participantId": "anon-abc123",
    ... identical structure
  }
]
```

Limite localStorage ~5MB — suffit pour ~500 captures (features ~10KB chacune).

---

## 5. Pipeline d'ingestion

### Depuis l'app
Mode `corpusCollection: true` activable dans `/settings` (caché derrière un `?mode=corpus` query param pour limiter l'accès utilisateurs naïfs).

Quand activé :
- Le flow `/capture` et `/quick` affiche un champ BAC obligatoire avant le résultat
- Champ avec validation 0.00-0.15
- La capture + BAC → insert dans la table (localStorage d'abord, Supabase si configuré)
- Affiche dans `/settings/corpus` la liste des captures collectées

### Export pour analyse offline
Route admin `/admin/corpus/export` → CSV de toutes les captures :
```
capture_id, participant_id, tier, bac, feature_1, feature_2, ..., result_summary
```

Loadable dans un notebook Python pour entraînement modèle.

---

## 6. Calibration des seuils Tier 2

Une fois le corpus atteint N ≥ 30 :

### Pipeline analyse offline (Jupyter notebook, hors repo principal)
1. Charger `valk_corpus_labels` → DataFrame pandas
2. Filter `tier = 2` (captures SFST-alike)
3. Par sous-test, calculer distribution des features à BAC 0.00 vs BAC ≥ 0.05
4. **Seuil sous-test** = optimiser sensitivity + specificity via ROC
5. **Poids fusion** = logistic regression L1 sur les 4 sous-scores → BAC >= 0.05 (binary)
6. **Cross-validation LOSO** : pour chaque participant, leave-one-out, mesurer accuracy sur held-out
7. Résultats → `src/lib/analysis/tier2-thresholds.json` committé dans le repo

### Critère de succès de la calibration
- LOSO accuracy ≥ 70% sur classification BAC ≥ 0.05% (target Interspeech 2011 level)
- AUROC ≥ 0.75 (target under Koch 2023 but without driving signal)
- Sensitivity ≥ 0.75 à spécificité ≥ 0.80

Si on n'atteint pas, on retravaille :
- Plus de données
- Features additionnelles
- Ou on documente honnêtement dans les disclaimers "précision mesurée X%"

---

## 7. Validation continue post-release

Même après release, chaque capture opt-in avec label BAC continue à nourrir le corpus. Pipeline de retraining trimestriel.

### Drift monitoring
- Vérifier que la distribution des captures production matche la distribution corpus (même device types, conditions similaires)
- Si drift significatif (ex: majorité iPhone 12 en corpus, mais majorité iPhone 15 en prod), flag pour retraining

---

## 8. Budget temps et coûts

### Temps
- Recrutement + consent : 2-3h par participant
- Session collecte : 3h par session
- Pour atteindre 10 participants × 1 session = 30h de temps humain (participant + superviseur)
- Parallélisable : peut être étalé sur 3-4 semaines

### Coûts
- Éthylotest : 40-80€ (un seul, réutilisable)
- Alcool : ~20€ par session × 10 = 200€
- Nourriture/boisson : ~10€ par session × 10 = 100€
- Taxis retour si besoin : ~20€ × 10 = 200€
- **Total : ~500-600€**

### Si impossible d'atteindre 10 participants
Plan B : l'auteur seul, sur 10 sessions espacées (une par week-end sur 10 week-ends). Ne pas dépasser 1 session par week-end pour éviter accoutumance/dépendance.

Limite scientifique : toutes les captures chez le même sujet = corpus intra-sujet, utile pour Tier 1 validation seulement, pas pour Tier 2 cross-sectional (qui a besoin de variabilité inter-sujet).

---

## 9. Non-goals corpus collection

- ❌ Collecte dans des bars/soirées (pas contrôlable, impossible d'éthylotest calibré)
- ❌ Scraping d'autres corpus (Alcohol Language Corpus allemand par ex. — licences)
- ❌ Crowdsourcing via app publique (qualité variable, BAC self-reported peu fiable)
- ❌ Vidéo/audio persistant (seulement features numériques)
- ❌ Mineurs

---

## 10. Risk register corpus

| Risque | Mitigation |
|---|---|
| Éthylotest mal calibré | Acheter certifié NF ou DOT, vérifier date cal |
| Participant qui se blesse (chute) | Surveillance active, arrêt si incident |
| Captures mal étiquetées (saisie erreur) | Double-check sur place, champ obligatoire, plausibility check |
| Accusation de conduite en état d'ivresse après session | Logistique retour écrite à l'avance |
| Fuite corpus (RGPD) | Pseudonymisation, pas de vidéo, RLS Supabase, local-first |
| Corpus trop petit (<30) | Accepter et documenter limitations dans disclaimers |
| Trop homogène (mêmes profils) | Viser diversité âge/sexe/poids volontaire |
