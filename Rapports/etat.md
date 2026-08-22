# Où nous en sommes

> Dix lignes, tenues à jour **à la fin de chaque arrêt**. C'est le premier fichier
> à lire dans une session neuve, et le seul qui dise l'état d'un travail *en
> cours* — le tableau de bord du §2, lui, ne parle que des modules terminés.

| | |
|---|---|
| **Dernier commit** | `AVAIL-C` — les 8 combinaisons, table de décision, `AVAIL` ★ clos à 35/35 |
| **Lot en cours** | 3 — Séjours ★ (vague 1) |
| **Module en cours** | aucun — `OCCUP` ✅ et `AVAIL` ✅ terminés |
| **Arrêt en cours** | rien — `AVAIL-C` clos, module validé sur les 10 critères du §11.1 |
| **Prochain arrêt** | **S6 · `POLICY`** — Sonnet suffit : réglages configurables par Solenne, aucune règle qui se combine |
| **Prochaine action** | Lire la ligne `POLICY` de `Rapports/Plan-Vague1.md`, puis la section `POLICY` de `Mode Operatoire - Detail/Lot3-Sejours.md` (à partir de la ligne 200) |
| **Suite de tests** | verte — 731 Vitest (46 s) + 448 Playwright, 6 ignorés (1 min 12) |
| **En attente de Yassine** | rien |

## Ce qui a été figé à `AVAIL-C`

- **Une seule faute trouvée, et elle n'était visible qu'en combinaison.** R3
  refusait une privatisation sur une maison occupée, mais ne regardait que les
  séjours et l'occupation ; R7 n'a aucun code. Une maison sans un seul dormeur
  un jour d'événement passait donc pour libre. `ContexteDisponibilite` porte
  désormais `evenements?: readonly EvenementExistant[]` — **sans effectif**,
  G1 tenu — et R3 les compte parmi les occupants (`AVAIL-031`).
- **`EXCLUSIVE_REQUEST_CONFLICT` reformulé** au §12.4 du Mode Opératoire :
  « la maison est déjà occupée sur ces dates » au lieu de « un séjour est déjà
  prévu ». Devenu faux depuis le point précédent, et contraire à D4 — nommer
  l'occupant, c'est dire à un ami ce qui se passe dans la maison. Seul message
  du catalogue réécrit depuis sa rédaction.
- **`AVAIL-034` est une table de leviers, pas une matrice écrite à la main** :
  un geste minimal par règle, les 8 leviers seuls et leurs 28 paires, verdict
  attendu lu dans `ORDRE_GRAVITE` plutôt que rejoué par le moteur. Le levier
  `R3` a besoin d'un événement pour refuser quoi que ce soit — une privatisation
  ne se refuse jamais toute seule, et c'est écrit dans le test.
- **R6 est hors table, et un cas le dit.** `verifierChevauchementEvenements`
  applique D8 mais reste dormant ; deux événements qui se chevauchent dans le
  contexte ne font pas refuser un séjour. `EVENT` (lot 4) l'appellera.
- **`AVAIL-029` rejoué avec des séjours confirmés**, `DORMEUR_ÉVÉNEMENT` étant
  encore dormant dans `OCCUP` — même parade qu'`AVAIL-022` et `OCCUP-018`,
  **à rejouer tel quel** quand `SLEEP` (lot 4) activera le contributeur.
- **`ORDRE_GRAVITE` n'a pas bougé** depuis `AVAIL-A`. Trois arrêts plus tard et
  sur 36 combinaisons, il n'a demandé aucune retouche.
- **Grilles S1→S12 et C1→C6 sans objet, vérifié et non supposé** :
  `grep -rln availability src` ne rend que le module lui-même.

## Deux points d'outillage

- **Le dépôt n'a pas de configuration Prettier.** Ne pas lancer `npx prettier`.
  Le style se vérifie avec `npx eslint .`.
- `POLICY` ne demande pas Opus. Les trois arrêts Opus restants de la vague 1
  sont derrière nous sauf un : `STAYDEC-A`, la transaction concurrente.
</content>
</invoke>
