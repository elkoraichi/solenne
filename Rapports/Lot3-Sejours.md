# Lot 3 — Séjours ★ · rapports de fin de module

Rattaché à `Mode Operatoire.md` v1.12 · fiche `Mode Operatoire - Detail/Lot3-Sejours.md`.

| Module | Cas de la fiche | Vérifications | Réussis | Échoués | Restants |
|---|---|---|---|---|---|
| `OCCUP` | 34 | 48 | 48 | 0 | 0 |

---

## MODULE : OCCUP — Calcul de l'occupation ★

**Statut : ✅ VALIDÉ** · module de sécurité rétrograde n°1 (voir §6 du Mode Opératoire) · livré en **deux arrêts** — `OCCUP-A` (Opus, contrat) et `OCCUP-B` (Sonnet, exercice du contrat).

### Fonctionnalités réalisées

- Fonction pure `occupationSur(présences, période, options?) → { total, parSource, jours }`, contrat figé par `OCCUP-CT-01→08`.
- Registre de contributeurs (Mode Opératoire §6.1, option B) : `SÉJOUR_CONFIRMÉ` actif, `DORMEUR_ÉVÉNEMENT` et `AFFECTATION_CHAMBRE` déclarés et dormants — le lot 4 activera un interrupteur, sans réécrire de formule.
- Lectures dérivées, posées dès le lot 2 pour `HOUSE-R2` et reprises telles quelles : `occupationParJour`, `occupationMaximale`, `joursAuDela`, `presencesConcernees`, `tientDansLaCapacite`.
- Traduction des séjours en présences (`src/domain/occupancy/sejours.ts`) : effectif = adultes + enfants (P6), statuts comptés en **liste blanche** (`CONFIRMED`, `COMPLETED`).
- Exclusion d'une présence en cours de modification (`exclureReference`) — pour recalculer un séjour contre lui-même sans le compter deux fois.
- **Sentinelle `OCCUP-024`** : énumère `REGISTRE` dynamiquement et compare le total à la somme des contributeurs actifs — un contributeur ajouté sans être sommé la fait échouer automatiquement.

### Règles vérifiées

| Règle | Où elle est tenue |
|---|---|
| OCC-R1 | `occupationDUneJournee` — somme des contributeurs actifs couvrant le jour |
| OCC-R2 | `estActif` — un contributeur inactif rend 0, jamais une erreur (`OCCUP-CT-05`, `OCCUP-019`) |
| OCC-R3 | `effectifDuSejour` = adultes + enfants — les invités nommés ne s'additionnent pas (P6, `OCCUP-009`) |
| OCC-R4 | Sans objet en vague 1 : `DORMEUR_ÉVÉNEMENT` est dormant, sa formule attend le lot 4 |
| OCC-R5 | Convention `[arrivée, départ[` — `OCCUP-005`, `OCCUP-006`, `OCCUP-CT-08` |
| OCC-R6 | `STATUTS_COMPTES` — annulé, refusé, en attente ne comptent jamais (`OCCUP-010→012`) |
| OCC-R7 | La confidentialité n'entre pas dans `SejourCompte` (`OCCUP-013`) |
| OCC-R8 | `total === Σ parSource`, jamais négatif (`OCCUP-CT-03`, `OCCUP-CT-04`) |

### Le test qui compte

`OCCUP-018`. Seul `SÉJOUR_CONFIRMÉ` est actif au lot 3 — `DORMEUR_ÉVÉNEMENT` n'existe pas encore. Le cas a donc été rejoué avec deux séjours confirmés qui réclament le même occupant le même jour, plutôt qu'avec un séjour et une inscription dormeur comme le décrit littéralement la fiche : `dejaComptees` est un ensemble **partagé par toutes les présences retenues d'une journée**, quel que soit leur contributeur, donc le mécanisme est déjà exactement celui que le lot 4 réutilisera sans y toucher. Sans lui, deux séjours partageant un occupant compteraient 5 personnes là où il n'y en a que 4.

### Problèmes rencontrés

**1. `OCCUP-018` ne peut pas s'écrire littéralement avant le lot 4.** La fiche le décrit avec un « dormeur d'événement » — contributeur déclaré mais inactif jusqu'à `SLEEP`. Une présence sous ce contributeur est filtrée avant même d'atteindre la déduplication, ce qui aurait rendu le test vrai pour une mauvaise raison. Rejoué avec deux séjours confirmés partageant un occupant : le mécanisme testé est identique, seule la source diffère. `SLEEP` (lot 4) pourra rejouer le même test tel quel en changeant le second contributeur en `DORMEUR_ÉVÉNEMENT`.

**2. Aucun outil de couverture installé dans le dépôt.** Le critère « couverture 100 % » du §10 de la fiche a été vérifié à la main plutôt que par un chiffre outillé : chaque fonction exportée d'`occupation.ts`, `registre.ts` et `sejours.ts` est exercée sur toutes ses branches, `tientDansLaCapacite` compris (test d'intégration `confidentialite.test.ts`, lot 2). Ajouter une dépendance de couverture pour produire un chiffre n'a pas semblé justifié pour ce module.

**3. Grille de sécurité S1→S12 sans objet.** Confirmé au contact du code, pas seulement à la lecture de la fiche : `src/server/occupation.ts` ne porte aucune directive `'use server'`, n'est appelé par aucun formulaire ni aucune route, et n'est consommé que par du code serveur interne (`HOUSE`, bientôt `AVAIL`). Rien à opposer à un client. Le critère 5 du §11.1 est donc tenu par l'absence de surface, documentée ici plutôt que cochée sans preuve.

### Grille de sécurité S1 → S12

Sans objet — fiche §5 : « Aucune surface exposée. `OCCUP` est appelé exclusivement par `AVAIL` et par les écrans de décision, jamais directement par un client. » Vérifié : aucune Server Action, aucune route, aucun import React/Next dans le domaine (`OCCUP-CT-07`).

### Grille de concurrence

Sans objet — fonction pure, aucune écriture. `AVAIL` et `STAYDEC` porteront la concurrence réelle sur les séjours.

### Impact sur les autres modules

- `AVAIL` (lot 3.2) : consomme `occupationSur` sans jamais recompter (garde-fou G1). Peut démarrer.
- `HOUSE` (lot 2, déjà livré) : aucun changement — `occupationParJour`, `joursAuDela`, `tientDansLaCapacite` gardent leur signature.
- Lot 4 (`SLEEP`) : activera `DORMEUR_ÉVÉNEMENT` dans `REGISTRE` et ajoutera `presencesDesRsvps` dans `src/server/occupation.ts`, sans toucher à `occupation.ts`. `OCCUP-018` sera rejoué avec un vrai dormeur d'événement à cette occasion.

### Décisions à confirmer par Yassine

Aucune. Le module n'a rien tranché qui ne relève de la technique.
