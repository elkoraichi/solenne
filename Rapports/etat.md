# Où nous en sommes

> Dix lignes, tenues à jour **à la fin de chaque arrêt**. C'est le premier fichier
> à lire dans une session neuve, et le seul qui dise l'état d'un travail *en
> cours* — le tableau de bord du §2, lui, ne parle que des modules terminés.

| | |
|---|---|
| **Dernier commit** | `ab27862` (non commité depuis) — `STAYDEC` ★ clos (19/19), lot 3 à un module de sa fin. Journal §14 entrée 1.17 et tableau de bord §2 à jour. Reste à committer les changements de `STAYDEC-B` |
| **Lot en cours** | 3 — Séjours ★ (vague 1) |
| **Module en cours** | `STAY` — dernier module du lot |
| **Arrêt en cours** | aucun — `STAYDEC-B` est **clos** (11 cas de la fiche, écran `/gerer`, sécurité S02/S06, régression, Playwright 320/768/1440, journal, tableau de bord) |
| **Prochain arrêt** | `STAY` — **Sonnet**, session neuve. Les 10 cas de la fiche (`001→010`) : séjours de Solenne créés sans demande, annulation des deux côtés, libération de la capacité, passage en `COMPLETED`, rapport de module, **clôture du lot 3** |
| **Prochaine action** | Lire la section `STAY` de la fiche du lot 3 (`sed -n '427,488p'`), puis écrire les 10 cas. `STAYDEC-A` a déjà posé `verifierDecidable` et le contexte de disponibilité ; `STAY` n'a pas de transaction concurrente à inventer — l'annulation libère la capacité en la retirant simplement du registre `OCCUP`, déjà démontré par `STAYDEC-C05` |
| **Suite de tests** | **832 Vitest verts en ~49 s**, unité + intégration, régression complète rejouée. `npx tsc --noEmit` et `npx eslint .` muets. Playwright rejoué sur l'écran `/gerer` aux trois tailles (320/768/1440) : 29 vérifications au vert |
| **En attente de Yassine** | rien |

## `STAYDEC-B` — les onze cas restants, écrits et verts (3ᵉ session du 22/08/2026, Sonnet)

Fichier étendu : `src/server/actions/decisions-sejour.ts` (quatre fonctions
ajoutées), `tests/integration/lot3/decisions-sejour.test.ts` (11 nouveaux cas),
`src/components/formulaires/file-attente-decisions.tsx` (nouveau), `src/app/(admin)/gerer/page.tsx`
(section ajoutée).

1. **`verifierDecisionSejour`** — lecture seule, le verdict complet promis à
   l'entrée 1.16 : `confirmationSuffirait`, conflits chiffrés pour Solenne
   (`resumePourSolenne`), occupation avant/avec la demande. Rejoue
   `evaluerAcceptation` sur `db`, jamais sur un client de transaction — SDEC-R2
   reste entier, l'écriture ne réutilise jamais ce verdict.
2. **`rejeterDemandeSejour`** et **`contreProposerDemandeSejour`** — transaction
   ordinaire, pas `Serializable` : le §9 de la fiche ne classe `CRITICAL` que la
   course à l'acceptation. `verifierDecidable` (déjà écrite à l'arrêt A)
   revérifiée avant chacune. La contre-proposition change les dates, laisse
   `status: 'PENDING'`, ne touche ni `decidedById` ni `decidedAt` ni
   `decisionNote` (SDEC-R8 — ce n'est pas une décision).
3. **`demandesEnAttente`** — la file, triée arrivée croissante puis dépôt
   croissant à égalité : la fiche demandait « les plus anciennes et les plus
   urgentes en tête », deux critères tenus par un seul tri.
4. **Écran `/gerer`** — section « Demandes de séjour » au-dessus de la console
   existante (`FileAttenteDecisions`). Verdict chargé à l'ouverture de chaque
   demande ; trois choix : accepter (confirmation exigée si
   `confirmationSuffirait`), refuser (motif obligatoire), proposer d'autres
   dates. Aucun problème d'écran cette fois : contexte de disponibilité et
   `CaseACocher` déjà posés depuis `STAYREQ`.
5. **Sécurité `S02`/`S06`** — un ami reçoit `FORBIDDEN` sur les cinq actions de
   décision, avec une entrée d'audit `refus.demandeSejour.*` par action ;
   l'appel direct de l'acceptation avec `confirme: true` forcé dans la charge
   ne contourne rien, la garde tranche avant que la confirmation ne compte.

Aucun nouveau code d'erreur (le motif obligatoire se tient en Zod, pas en
domaine), aucune migration.

## `STAYDEC-A`, pour mémoire

Les 8 premiers cas (`001`, `005`, `006`, `011`, `014`, `C01`, `C05`, `C06`) et
la transaction sérialisable : détail dans `Mode Operatoire.md` §14, entrée
1.16, et `Rapports/Lot3-Sejours.md` section `STAYDEC`.

## Ce qui a été figé à `STAYREQ` (arrêt B)

- **`verifierDisponibiliteSejour`** (Server Action, lecture seule) : le modèle
  qu'a repris `verifierDecisionSejour` ci-dessus.
- **`POLICY-012` fermé** — `POLICY` à 16/16.
- **Composant `CaseACocher`** (`src/components/ui/case-a-cocher.tsx`) —
  réutilisé cette session pour « J'accepte malgré ce conflit ».
- **Piège E2E** : `.check()` seul échoue sur une case `sr-only` — `check({ force: true })`.
- Rapport complet dans `Rapports/Lot3-Sejours.md` (section `STAYREQ`).

## `AVAIL` ★ et `OCCUP`, pour mémoire

Clos respectivement à `AVAIL-C` (35/35) et `OCCUP-B` (34/34) : détail dans
`Mode Operatoire.md` §14 (entrées 1.12, 1.13) et l'historique git.

## Deux points d'outillage

- **Le dépôt n'a pas de configuration Prettier.** Ne pas lancer `npx prettier`.
  Le style se vérifie avec `npx eslint .`.
- **`STAY` est un module Sonnet ordinaire** : plus d'arrêt Opus prévu dans la
  vague 1 après `STAYDEC-A`.
