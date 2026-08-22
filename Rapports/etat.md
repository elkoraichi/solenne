# Où nous en sommes

> Dix lignes, tenues à jour **à la fin de chaque arrêt**. C'est le premier fichier
> à lire dans une session neuve, et le seul qui dise l'état d'un travail *en
> cours* — le tableau de bord du §2, lui, ne parle que des modules terminés.

| | |
|---|---|
| **Dernier commit** | `OCCUP-A` — contrat figé du calcul d'occupation |
| **Lot en cours** | 3 — Séjours ★ (vague 1) |
| **Module en cours** | `OCCUP` — Calcul de l'occupation ★ |
| **Arrêt en cours** | **S1 · `OCCUP-A` terminé** — 22 cas prévus, 38 tests écrits |
| **Prochain arrêt** | **S2 · `OCCUP-B`** — Sonnet suffit : le contrat est figé, il reste à l'exercer |
| **Prochaine action** | `OCCUP-015`, `018→026` — détail par source, pic, volume, exclusion, **sentinelle `OCCUP-024`**, grille de sécurité, rapport de module |
| **Suite de tests** | verte — 637 Vitest (45 s) + 448 Playwright, 6 ignorés (1 min 20) |
| **En attente de Yassine** | rien |

## Ce qui a été arrêté à `OCCUP-A`

- **P6 tranché.** L'effectif d'un séjour est **adultes + enfants**. `stay_guests`
  *nomme* ces mêmes personnes, il n'en ajoute aucune. Le §6.4 du Mode Opératoire
  a été corrigé en conséquence. **À reporter dans `STAYREQ`** : c'est à la saisie
  d'interdire une liste de noms plus longue que `adultes + enfants`.
- **Le contrat figé** vit dans `src/domain/occupancy/occupation.ts`. Trois
  décisions y sont écrites en tête de fichier : le `total` d'une période est son
  **pic** ; `parSource` est le détail **du jour de pic** ; une personne
  identifiée n'est comptée **qu'une fois par jour**, et l'ordre de `REGISTRE`
  décide à quelle source elle est attribuée. Le lot 4 ne doit toucher à aucune
  ligne de ce fichier.
- **`registre.ts` ne compte plus rien** : il ne fait que déclarer les sources.
  Les cinq fonctions qui additionnaient (`occupationParJour`,
  `occupationMaximale`, `joursAuDela`, `presencesConcernees`,
  `tientDansLaCapacite`) sont passées dans `occupation.ts` et s'appuient
  désormais sur la formule unique. Les trois sites d'import du lot 2 ont suivi.
- **Statuts en liste blanche** (`STATUTS_COMPTES` = `CONFIRMED`, `COMPLETED`) :
  un statut inconnu vaut zéro. Une maison déclarée trop vide se rattrape ; une
  maison déclarée trop pleine un samedi soir, non.
- `OCCUP-016` et `017` (bornes de la période) ont été **avancés dans A** : le
  contrat devait définir son propre domaine de validité. Il en reste 11 pour B.

## Deux points d'outillage

- **Le dépôt n'a pas de configuration Prettier.** Ne pas lancer `npx prettier` :
  il réécrit tout en double quotes et points-virgules, contre le style du code.
  Le style se vérifie avec `npx eslint .`.
- La grille de sécurité S1→S12 n'a **pas** été passée : `OCCUP` n'expose aucune
  surface (fiche §5). Elle est au programme d'`OCCUP-B`, avec la sentinelle.
