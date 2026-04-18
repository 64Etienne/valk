# Valk v3 — Plan directeur

Reconstruction scientifique + technique de Valk, pour en faire un produit fiable et défendable.

**Date :** 2026-04-18
**Durée estimée :** 4-6 semaines de dev + corpus collection en parallèle

---

## Table des matières

| # | Document | Résumé |
|---|---|---|
| 00 | [Master plan](./00-master-plan.md) | Vue d'ensemble, phases, dépendances, success criteria globaux |
| 01 | [Science foundation](./01-science-foundation.md) | Audit citations (fabriquées vs vérifiées), méthodologies réelles avec DOI |
| 02 | [Product repositioning](./02-product-repositioning.md) | Architecture deux-tiers (Personnel / Quick Check), disclaimers, UX |
| 03 | [Protocol SFST-équivalent](./03-protocol-sfst-equivalent.md) | Spec des 4 sous-tests Tier 2 : HGN, Romberg, cognitif, RT |
| 04 | [Corpus collection](./04-corpus-collection.md) | Protocole éthique pour collecter ~100 captures BAC-labellisées |
| 05 | [Engineering phases](./05-engineering-phases.md) | Breakdown commit-par-commit, ordre, tests, dépendances |
| 06 | [Validation & success criteria](./06-validation-success-criteria.md) | Ce que signifie "done" à chaque phase + release |
| 07 | [Risks & mitigations](./07-risks-mitigations.md) | Risk register complet avec plans de contingence |

---

## Résumé exécutif 3 minutes

**Positionnement :** outil personnel de détection de déviation. **Jamais** estimateur BAC, **jamais** verdict "peux conduire".

**Deux tiers :**
- **Personnel** *(baseline required)* : Δ-from-baseline scoring, 85-95% accuracy sur cet utilisateur, fondé sur Suffoletto 2023 + Tyson 2021
- **Quick Check** *(SFST-équivalent sans baseline)* : 4 sous-tests (HGN / Romberg / cognitif / RT), 70-85% accuracy cross-sectional après calibration corpus

**Science vérifiée :** 3 citations fabriquées retirées (Kim 2012, Jolkovsky 2022, Castro 2014), 4 vérifiées gardées avec contexte honnête (Tyson, Suffoletto, Cori, Roche&King).

**Corpus :** collecte de 30-100 captures labellisées BAC via 10-20 volontaires + éthylotest, pour calibrer les seuils Tier 2.

**Non-goals :** estimateur BAC numérique, verdict conduite, détection de substance spécifique, intégration voiture, Walk-and-Turn, PLR précis, scleral color LAB.

**Plan de phasing :**
- Semaine 0 : démolition (retirer les mensonges)
- Semaine 1 : ship Tier 1 (produit utile + infrastructure corpus)
- Semaine 2-5 : construire Tier 2 (4 sous-tests)
- Semaine 3-6 : collecter corpus en parallèle
- Semaine 6 : calibration + validation + release v3.0

**Release intermédiaires :**
- `v3.0-alpha` : fin semaine 1 — Tier 1 shipping
- `v3.0-beta` : fin semaine 5 — Tier 2 avec seuils littérature
- `v3.0` : fin semaine 6 — Tier 2 calibré sur corpus, prod-ready

---

## Prochaine étape

Phase 0 (démolition) : 2 jours, ~5 commits. Voir [05-engineering-phases.md § Phase 0](./05-engineering-phases.md#phase-0--démolition-2-jours).
