# 02 — Product Repositioning : deux tiers, honnête

**But :** documenter l'architecture produit à deux niveaux, les messages utilisateur, et les disclaimers non-négociables.

---

## 1. Pourquoi deux tiers

### Problème à résoudre
Un utilisateur qui sort d'un bar et veut "savoir s'il peut conduire" est dans un scénario où :
- Il n'a souvent **pas fait de calibration** préalable
- Il est dans un **environnement bruyant**
- Il veut une **réponse rapide**

Mais la littérature montre que :
- Cross-sectional sans baseline : plafond **70-80% accuracy** sur smartphone consumer
- Within-subject avec baseline : plafond **95%+** (Suffoletto)
- "Verdict peux-conduire" : impossible à garantir en-dessous de ~99%

### Solution : séparer les deux cas d'usage

**Tier 1 — Mode Personnel** : pour l'utilisateur habituel qui a calibré. Assez fiable pour être utile, peu pour "conduire". Positionné comme "auto-contrôle de déviation".

**Tier 2 — Mode Quick Check** : pour l'utilisateur occasionnel sans baseline. Moins fiable. Positionné comme "indicateur SFST-équivalent, à confidence limitée".

Aucun des deux ne dit "tu peux conduire". Les deux sont honnêtes sur leurs limitations.

---

## 2. Tier 1 — Mode Personnel détaillé

### Public cible
Utilisateur récurrent, qui a pris 3 min pour calibrer à jeun une fois.

### Promesse
> "Comparé à ta référence sobre habituelle, ton état actuel montre des signes de déviation."

Pas :
> ~~"Tu as bu."~~
> ~~"Tu peux conduire."~~
> ~~"BAC estimé 0.07%."~~

### Mesures
- Pursuit gain delta vs baseline
- Saccade rate pendant pursuit delta
- Blink rate delta
- PERCLOS delta (si baseline dans normes)
- Voice MFCC cosine distance vs baseline
- Voice speech-rate delta (après fix VAD)
- Voice spectral flatness delta

### Scoring
Déterministe, `src/lib/analysis/deviation.ts` :
- Chaque feature → z-score vs baseline (si variance estimable) ou delta normalisé
- Agrégation pondérée par fiabilité de la mesure dans le contexte
- Score final 0-100 : "normal" / "mild" / "moderate" / "marked"

### UX
```
/ → accueil
  └─ "Déjà calibré ?" yes/no
      ├─ no → /baseline (3 min) → saveBaseline → back to /
      └─ yes → /capture
              └─ captureFull → /results
                  └─ Δ-from-baseline report
                      + 3 features les plus déviantes
                      + Claude narrative
                      + disclaimer fort
```

### Durée
~3 min baseline (one-time) + ~45s capture analyze

---

## 3. Tier 2 — Mode Quick Check détaillé

### Public cible
- Visiteur occasionnel qui veut tester sans calibration
- Ami de l'utilisateur régulier ("essaie ça")

### Promesse
> "Sur la base de 4 tests-types similaires à ceux que ferait un agent de contrôle routier, nos indicateurs suggèrent un niveau d'impairment [faible / modéré / élevé]."

Pas :
> ~~"Tu as bu X."~~
> ~~"Tu peux conduire."~~

### Mesures
Détaillé dans [03-protocol-sfst-equivalent.md](./03-protocol-sfst-equivalent.md). Les 4 sous-tests :
1. HGN-alike : pursuit + nystagmus
2. Romberg postural sway (IMU)
3. Cognitive verbal (tâches STT-scorées)
4. Reaction time tap

### Scoring
Déterministe, par sous-test, fusionné :
- Chaque sous-test → 0-100 sous-score
- Fusion pondérée par fiabilité + calibration corpus
- Verdict 3-niveaux : "low / moderate / high indication d'impairment"

### UX
```
/ → accueil
  └─ "Quick check sans calibration ?" → /quick
     └─ Séquence 4 tests guidée (~3-4 min)
        ├─ Test 1 : HGN-alike (90s)
        ├─ Test 2 : Romberg (20s)
        ├─ Test 3 : Cognitive verbal (90s)
        └─ Test 4 : Reaction time (30s)
           → Fusion
           → /quick/results
              └─ Verdict low/moderate/high
                 + Claude narrative expliquant les sous-scores
                 + disclaimer fort
```

### Durée
~3-4 min total.

---

## 4. Différences d'UX entre Tier 1 et Tier 2

| Critère | Tier 1 | Tier 2 |
|---|---|---|
| Prérequis | Baseline calibré | Aucun |
| Durée | 45s | 3-4 min |
| Sous-tests | 1 capture combinée | 4 sous-tests séquentiels |
| Affichage résultat | "Score de déviation" | "Niveau d'indication" |
| Confidence attendue | Haute sur cet individu | Modérée |
| Disclaimer level | Standard | **Renforcé** |

---

## 5. Messages utilisateur obligatoires

### Bandeau permanent (toutes pages)
```
⚠ Valk est un outil expérimental. Ce n'est ni un éthylotest,
ni un test clinique, ni un substitut à l'un ou à l'autre.
Ne pas utiliser pour décider de conduire.
```

### Avant Tier 1 sans baseline
Modal bloquante :
```
Pour utiliser le mode Personnel, calibre d'abord ta référence
à jeun dans de bonnes conditions. C'est une capture de 3 minutes,
à faire une fois. Sans elle, le mode Personnel n'est pas fiable.

[Calibrer maintenant]  [Essayer le Quick Check à la place]
```

### Avant Tier 2
Modal bloquante :
```
Le Quick Check est un mode rapide sans calibration. Il se base
sur 4 mini-tests inspirés du protocole de contrôle routier
(HGN, Romberg, cognitif, temps de réaction). Sa précision est
modérée : il n'est pas un éthylotest et ne peut pas dire si
tu peux conduire. Durée ~4 minutes.

[Commencer]  [Calibrer plutôt (3 min)]
```

### Résultat Tier 1 moderate/marked
Texte autour du score :
```
Ta capture d'aujourd'hui s'écarte de ta référence sobre.
Cela peut refléter : alcool, fatigue, médicaments, stress,
maladie passagère, ou condition de capture dégradée.

Si tu as bu, ne conduis pas. Même un peu.
```

### Résultat Tier 2 moderate/high
```
Les indicateurs évalués montrent des signes comparables à
ceux qu'un agent de contrôle considérerait préoccupants.
CECI N'EST PAS UN TEST D'ALCOOLÉMIE. Si tu envisages de
conduire, utilise un vrai éthylotest certifié.
```

### Disclaimer long, sur /about
Référence le document 01-science-foundation.md, explique :
- Hardware grand public, précision bornée
- Études citées et leurs limites
- Facteurs confondants (fatigue, caféine, médicaments)
- Recommande un éthylotest pour décision de conduite

---

## 6. Ce qui est retiré de l'UI actuelle

- ❌ Bouton CTA "Uber" après verdict rouge
- ❌ Verdict "tu peux conduire" / "pas conseillé de conduire"
- ❌ Catégorisation alcool / fatigue / substances comme diagnostic (devient "indicateurs de déviation", "indicateurs d'impairment")
- ❌ Scores numériques exprimés comme "risque alcool X%"
- ❌ Toute mention de chiffres BAC

---

## 7. Accessibilité et consentement corpus

### Opt-in corpus éthylotest
Sur `/capture` (Tier 1) et `/quick` (Tier 2), après la capture, avant `/results` :
```
(Optionnel) Tu as un éthylotest à disposition ?
Saisis ta valeur : _____ g/L
Ta capture sera étiquetée localement. Ça aide à améliorer
la précision du modèle dans le temps.

[Passer]  [Ajouter la valeur]
```

### Consent pour sync Supabase (optionnel)
Sur `/settings` :
```
Autoriser la sync de tes captures étiquetées vers notre serveur
pour améliorer le modèle ?
- Rien n'est publié, rien n'est lié à ton identité
- Tu peux supprimer tes données à tout moment
- Sans ce toggle, tout reste en local

[ ] Activer sync corpus
```

### Droit à l'oubli
`/settings` : bouton "Supprimer toutes mes données" qui wipe localStorage + envoie DELETE /api/corpus/me à Supabase si sync activée.

---

## 8. Positionnement marketing implicite

Si on devait formuler une tagline honnête :
> **"Valk — outil personnel de contrôle de déviation. Après calibration, détecte les variations de ton état normal. Pas un éthylotest."**

---

## 9. Position juridique

- **Pas de claim médical** : outil non soumis FDA/CE mark (pas un dispositif médical)
- **Pas de claim légal** : pas un test de force probante
- **Pas de liability pour décision de conduite** : disclaimers, consent explicit, user assumes responsibility
- **RGPD** : traitement local par défaut, Supabase opt-in, droit à l'oubli fonctionnel, pas de PII dans le corpus (captures sont des features numériques + BAC, pas de vidéo stockée)
- **Terms of service** : à écrire avant release publique, couvrant surtout les limitations et le non-usage pour conduite

---

## 10. Validation du positionnement

Avant chaque release, passer le "checklist d'honnêteté" :
- [ ] Aucune mention de "tu peux conduire" dans le produit
- [ ] Aucun chiffre BAC dans l'UI
- [ ] Disclaimer permanent visible
- [ ] Modal d'entrée de Tier 1 et Tier 2 explicite sur les limitations
- [ ] Bouton pour éthylotest réel ou contact urgence (police/ambulance) si user en détresse
- [ ] Pas de CTA incitant à conduire après verdict "low"
- [ ] Lien vers éthylotests certifiés en cas de question vraie
