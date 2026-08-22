# Où nous en sommes

> Dix lignes, tenues à jour **à la fin de chaque arrêt**. C'est le premier fichier
> à lire dans une session neuve, et le seul qui dise l'état d'un travail *en
> cours* — le tableau de bord du §2, lui, ne parle que des modules terminés.

| | |
|---|---|
| **Dernier commit** | `AVAIL-B` — R5, R6 (dormant), R7, R8 (délégation) · 27 cas verts |
| **Lot en cours** | 3 — Séjours ★ (vague 1) |
| **Module en cours** | `AVAIL` — 27 cas sur 35 ; `OCCUP` ✅ terminé |
| **Arrêt en cours** | rien — `AVAIL-B` clos |
| **Prochain arrêt** | **S5 · `AVAIL-C`** — **Opus requis** : les 8 combinaisons, ordre d'évaluation, aucun conflit masqué, table de décision exhaustive, rapport de fin de module |
| **Prochaine action** | Lire `Mode Operatoire - Detail/Lot3-Sejours.md` lignes 191→199 (`AVAIL-027→034`), puis `src/domain/availability/disponibilite.ts` et `conflits.ts` avant tout code |
| **Suite de tests** | verte — 684 Vitest (46 s) + 448 Playwright, 6 ignorés (1 min 12) |
| **En attente de Yassine** | rien |

## Ce qui a été figé à `AVAIL-B`

- **R5 et R7 n'ont aucun code** — ni l'un ni l'autre n'a de branche dédiée dans
  `verifierDisponibilite`. R5 (cohabitation) est ce qui se passe quand ni R2 ni
  R4 ne s'y opposent ; R7 (séjour pendant un événement) de même, parce
  qu'aucun code n'existe pour « un événement a lieu ». C'était déjà vrai à la
  sortie de S3 — S4 n'a fait que l'éprouver par les tests `AVAIL-014→017` et
  `021→023`.
- **`AVAIL-022` (dormeurs d'événement) rejoué avec des séjours confirmés**,
  `DORMEUR_ÉVÉNEMENT` étant encore dormant dans `OCCUP` — même mécanique que
  `OCCUP-018`, même parade documentée, **à rejouer tel quel** avec de vrais
  dormeurs quand `SLEEP` (lot 4) activera le contributeur.
- **R6 écrit et testé, dormant** : `verifierChevauchementEvenements` (dates
  horaires, pas des jours) applique D8, mais rien ne l'appelle — `EVENT`
  n'existe pas avant le lot 4. Même geste que les contributeurs dormants
  d'`OCCUP` : déclaré et prouvé avant d'avoir un appelant, jamais réécrit à
  l'arrivée de celui-ci.
- **R8 est une délégation, pas un calcul.** `POLICY` n'existe pas encore (module
  suivant, réglages sans rapport avec la disponibilité). `ContexteDisponibilite`
  gagne `conflitsPolitique?: readonly Conflit[]` : la future Server Action
  interroge `POLICY` d'abord, `AVAIL` reprend ses refus tels quels et les trie
  avec les siens — jamais ne les recalcule. `AVAIL-024/025` le prouvent avec des
  conflits construits à la main ; `POLICY` remplira ce tableau en vrai.
- **`ORDRE_GRAVITE` n'a pas bougé** : R6 et R8 y avaient déjà leur place depuis
  `AVAIL-A`, posée par anticipation. Un cas ajouté vérifie qu'un refus `AVAIL`
  (capacité) passe bien avant un refus `POLICY` dans un résultat mêlé.
- **Grilles S1→S12 et C1→C6 sans objet, vérifié et non supposé** : `grep -rn
  availability src` ne rend toujours que le module lui-même.

## Deux points d'outillage

- **Le dépôt n'a pas de configuration Prettier.** Ne pas lancer `npx prettier`.
  Le style se vérifie avec `npx eslint .`.
- `AVAIL-C` exige de repasser sur **Opus** avant tout code — c'est le seul
  endroit où les huit règles se combinent, et les fautes qui ne ressemblent pas
  à des fautes s'y cachent (Mode Opératoire, tableau des sessions).
