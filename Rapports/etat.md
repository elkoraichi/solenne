# Où nous en sommes

> Dix lignes, tenues à jour **à la fin de chaque arrêt**. C'est le premier fichier
> à lire dans une session neuve, et le seul qui dise l'état d'un travail *en
> cours* — le tableau de bord du §2, lui, ne parle que des modules terminés.

| | |
|---|---|
| **Dernier commit** | `AVAIL-A` — garde-fou G1, R1, R2/R3, R4 · 15 cas verts |
| **Lot en cours** | 3 — Séjours ★ (vague 1) |
| **Module en cours** | `AVAIL` — 15 cas sur 35 ; `OCCUP` ✅ terminé |
| **Arrêt en cours** | rien — `AVAIL-A` clos |
| **Prochain arrêt** | **S4 · `AVAIL-B`** — Sonnet : R5 cohabitation, R6 événements *(dormant)*, R7 séjour pendant événement, R8 délégation à `POLICY` |
| **Prochaine action** | Lire `Mode Operatoire - Detail/Lot3-Sejours.md` lignes 160→199 (cas de test `AVAIL`), puis `src/domain/availability/disponibilite.ts` avant tout code |
| **Suite de tests** | verte — 671 Vitest (45 s) + 448 Playwright, 6 ignorés (1 min 12) |
| **En attente de Yassine** | rien |

## Ce qui a été figé à `AVAIL-A`

- **Le contrat** vit dans `src/domain/availability/` : `conflits.ts` (forme d'un
  refus, ordre de gravité) et `disponibilite.ts` (`verifierDisponibilite`).
  `AVAIL-B` et `AVAIL-C` **ajoutent des règles dans ce cadre**, ils ne le
  réécrivent pas.
- **Garde-fou G1 prouvé deux fois**, parce qu'aucune preuve ne suffisait seule :
  par le comportement (une présence sous contributeur dormant ne remplit pas la
  maison — un `AVAIL` qui compterait la verrait) et par analyse statique (toute
  lecture de `presences` hors de l'appel à `occupationSur` fait rougir le test).
  Troisième verrou, dans les types : **`SejourExistant` ne porte pas d'effectif**
  — `AVAIL` n'a physiquement rien à additionner.
- **Ordre de gravité arrêté** (`ORDRE_GRAVITE`) : `PRE, R1, R2, R3, R6, R4, R8`.
  Critère : d'abord ce qu'aucune modification de la demande ne réparerait, en
  dernier ce qui se corrige en changeant un nombre. `AVAIL-C` l'éprouvera sur
  les combinaisons ; il n'a pas à le redéfinir.
- **Tension `AVAIL-009` / PRIV-005 résolue sans arbitrage de Yassine.** La fiche
  attend « 12 personnes pour 10 places » ; PRIV-005 avait retiré les chiffres du
  message destiné à un ami. Les deux versions coexistent désormais dans
  `messages.ts` : `CATALOGUE_MESSAGES` (l'ami, aucun chiffre) et
  `CATALOGUE_DETAILS` (Solenne, chiffré). `pourAmi()` **retire** le détail au
  lieu de compter sur l'écran pour le masquer — règle non négociable n°4.
- **`AVAIL-026` avancé depuis S4** : sans son contrôle préalable, `occupationSur`
  lèverait `INVALID_DATES` au lieu de rendre un conflit. Le cas est écrit et
  vert ; il ne reste que 12 cas à S4, pas 13.
- **Grille S1→S12 sans objet, vérifié et non supposé** : `grep -rn availability
  src` ne rend que le module lui-même — aucune Server Action, aucune surface.
  Grille C1→C6 sans objet : fonction pure, aucune écriture.

## Deux points d'outillage

- **Le dépôt n'a pas de configuration Prettier.** Ne pas lancer `npx prettier` :
  il réécrit tout en double quotes et points-virgules, contre le style du code.
  Le style se vérifie avec `npx eslint .`.
- `AVAIL-B` se fait sur **Sonnet** : il applique un motif déjà posé, règle après
  règle. `AVAIL-C` exigera de revenir sur **Opus**.
