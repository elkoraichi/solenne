# Où nous en sommes

> Dix lignes, tenues à jour **à la fin de chaque arrêt**. C'est le premier fichier
> à lire dans une session neuve, et le seul qui dise l'état d'un travail *en
> cours* — le tableau de bord du §2, lui, ne parle que des modules terminés.

| | |
|---|---|
| **Dernier commit** | `OCCUP-B` — module `OCCUP` terminé (34/34 cas), rapport de fin de module |
| **Lot en cours** | 3 — Séjours ★ (vague 1) |
| **Module en cours** | `OCCUP` ✅ terminé — Mode Opératoire §2 et §14 (v1.12) mis à jour |
| **Arrêt en cours** | rien — `OCCUP-A` et `OCCUP-B` clos |
| **Prochain arrêt** | **S3 · `AVAIL-A`** — **Opus requis** : garde-fou G1, R1 blocages, R2/R3 exclusivité, R4 capacité |
| **Prochaine action** | Lire `Mode Operatoire - Detail/Lot3-Sejours.md`, section `AVAIL` (§118 et suivants), avant tout code |
| **Suite de tests** | verte — 647 Vitest (45 s) + 448 Playwright, 6 ignorés (1 min 20) |
| **En attente de Yassine** | rien |

## Ce qui a été arrêté à `OCCUP-B`

- Les 11 cas restants (`OCCUP-015`, `018→026`) sont écrits et verts.
- **`OCCUP-018` rejoué avec deux séjours confirmés**, pas avec un dormeur
  d'événement : `DORMEUR_ÉVÉNEMENT` étant encore dormant, une présence sous ce
  contributeur serait filtrée avant la déduplication — le test aurait été vrai
  pour une mauvaise raison. Le mécanisme éprouvé (`dejaComptees`, partagé par
  toutes les présences retenues d'un jour) est le même que celui que `SLEEP`
  activera au lot 4 ; **à rejouer tel quel** avec un vrai dormeur à ce moment-là.
- **Grille S1→S12 sans objet, vérifié et non supposé** : `src/server/occupation.ts`
  ne porte aucune Server Action, n'est appelé par aucun client.
- **Aucun outil de couverture dans le dépôt** : le critère « couverture 100 % »
  a été vérifié à la main, fonction par fonction, plutôt que d'ajouter une
  dépendance pour produire un chiffre.
- Rapport de module écrit : `Rapports/Lot3-Sejours.md`. Journal `Mode
  Operatoire.md` §14.3 → entrée **1.12**. Tableau de bord §2 → lot 3 à
  34/133, `OCCUP` marqué livré.

## Deux points d'outillage

- **Le dépôt n'a pas de configuration Prettier.** Ne pas lancer `npx prettier` :
  il réécrit tout en double quotes et points-virgules, contre le style du code.
  Le style se vérifie avec `npx eslint .`.
- Session ouverte sur Sonnet pour `OCCUP-B`, conformément au plan — le prochain
  arrêt (`AVAIL-A`) exige de repasser sur **Opus** avant tout code.
