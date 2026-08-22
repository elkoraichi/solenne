# Où nous en sommes

> Dix lignes, tenues à jour **à la fin de chaque arrêt**. C'est le premier fichier
> à lire dans une session neuve, et le seul qui dise l'état d'un travail *en
> cours* — le tableau de bord du §2, lui, ne parle que des modules terminés.

| | |
|---|---|
| **Dernier commit** | `761559d` — silence des refus attendus dans la sortie des tests |
| **Lot en cours** | 3 — Séjours ★ (vague 1) |
| **Module en cours** | aucun — le lot 3 n'est pas ouvert |
| **Arrêt en cours** | — |
| **Prochain arrêt** | **S1 · `OCCUP-A`** — exige **Opus** (`Rapports/Plan-Vague1.md`) |
| **Prochaine action** | Lire la section `OCCUP` de `Mode Operatoire - Detail/Lot3-Sejours.md`, acter P6, écrire `OCCUP-CT-01→08` et `OCCUP-001→014` avant le code |
| **Suite de tests** | verte — 599 Vitest (44 s) + 454 Playwright (1 min 15) |
| **En attente de Yassine** | rien |

## À savoir avant d'ouvrir `OCCUP`

- Le **registre de contributeurs** existe déjà : `src/domain/occupancy/registre.ts`, posé au module `HOUSE` (problème P5). `OCCUP` le **complète** — contrat `OCCUP-CT-01→08`, sentinelle `OCCUP-024`, 34 cas — il ne le crée pas.
- L'effectif d'un séjour est **adultes + enfants**. Le §6.4 écrit « + invités » : les additionner compterait chaque enfant deux fois, `stay_guests` nommant les mêmes personnes (problème P6, à trancher formellement à l'ouverture du module).
- `DORMEUR_ÉVÉNEMENT` reste **déclaré et dormant**. Le lot 4 l'allumera sans réécrire de formule.
- Règle non négociable n°3 : **`AVAIL` ne compte jamais.** Un seul endroit additionne des personnes, et c'est `OCCUP`.
