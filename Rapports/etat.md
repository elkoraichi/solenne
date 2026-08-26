# Où nous en sommes

> Dix lignes, tenues à jour **à la fin de chaque arrêt**. C'est le premier fichier
> à lire dans une session neuve, et le seul qui dise l'état d'un travail *en
> cours* — le tableau de bord du §2, lui, ne parle que des modules terminés.

| | |
|---|---|
| **Dernier commit** | à faire dans cette session — `STAY` clos (10/10), lot 3 à sa clôture près. Journal §14 entrée 1.18 et tableau de bord §2 à jour |
| **Lot en cours** | 3 — Séjours ★ (vague 1) |
| **Module en cours** | aucun — les six modules du lot sont clos |
| **Arrêt en cours** | aucun — `STAY` est **clos** (10 cas de la fiche, sécurité `S02`/`S04`, concurrence, écran `/gerer` + `/sejours`, E2E 320 px, journal, tableau de bord) |
| **Prochain arrêt** | **Clôture du lot 3** — Sonnet, session neuve. Trois tailles (320/768/1440) sur l'ensemble du lot, régression complète, rapport de clôture, jugement visuel **L2** à demander à Yassine |
| **Prochaine action** | Rejouer Playwright aux trois tailles sur les écrans du lot 3 (`/sejours`, `/gerer` et ce qui en dépend), consigner les captures, puis rédiger le rapport de clôture et solliciter Yassine pour L2. Ensuite : module `DEPLOY`, dernier de la vague 1 |
| **Suite de tests** | **852 Vitest verts en ~50 s**, unité + intégration. `npx tsc --noEmit` et `npx eslint .` muets. E2E `/gerer` + `/sejours` rejoué en 320 px : 5 vérifications au vert (2 tailles restantes réservées à la clôture du lot, mesure M2) |
| **En attente de Yassine** | Jugement visuel **L2** à la clôture du lot 3 (prochain arrêt) |

## `STAY` — les 10 cas, écrits et verts (session du 26/08/2026, Sonnet)

Fichiers nouveaux : `src/domain/stays/sejour.ts` (`verifierAnnulable`,
`sejourEstPasse`), `src/server/actions/sejours.ts` (cinq actions :
`creerSejourPersonnel`, `mesSejours`, `sejoursDeLaMaison`, `annulerSejour`,
`annulerSejourParSolenne`, `suggestionsLiberation`), `src/server/taches/cloture-sejours.ts`,
`src/server/transaction-serialisable.ts` (`avecRejeuSerialisable`, extrait de
`decisions-sejour.ts`), `src/components/formulaires/gestion-sejours.tsx`,
`src/components/formulaires/mes-sejours.tsx`. Migration `lot3_stay_annulation`
(`cancel_reason` sur `stays`). Code d'erreur `STAY_NOT_CANCELLABLE`.

1. **Création directe (`STAY-002`)** dispute la même capacité que l'acceptation
   d'une demande (`STAYDEC-A`) : `avecRejeuSerialisable` — désormais partagé,
   plus dupliqué — rejoue `evaluerDemande` dans une transaction `Serializable`.
   Un test de concurrence dédié (création directe contre acceptation, même
   capacité) le démontre.
2. **Annulation des deux côtés** (`STAY-003` ami, `STAY-005`/`006` Solenne
   avec motif obligatoire) : transaction ordinaire, aucune course possible —
   annuler ne fait que retirer une occupation.
3. **Clôture automatique (`STAY-008`)** : `cloturerSejoursTerminees`,
   délibérément pas une Server Action — `DEPLOY` la branchera sur une tâche
   planifiée derrière un secret partagé, pas une session.
4. **Historique conservé (`STAY-009`)** et **suggestion après libération
   (`STAY-010`)** : `mesSejours()` rend tous les statuts ; `suggestionsLiberation()`
   rejoue `evaluerDemande` sur les demandes refusées à venir.
5. **Sécurité `S02`/`S04`** : un ami reçoit `FORBIDDEN` sur les deux actions
   réservées à Solenne, et `NOT_FOUND` (refus neutre) en tentant d'annuler le
   séjour d'un autre.

**Piège E2E** : le jeu de démonstration porte déjà un séjour personnel
confirmé de Solenne — un locator texte (« Solenne · ») ne distingue pas ce
séjour de celui que le test vient de créer, et un `.last()` sur les boutons
peut tomber sur la mauvaise ligne si le rafraîchissement n'est pas encore
retombé. Corrigé en comptant les lignes (`toHaveCount`) plutôt qu'en lisant un
texte de date formaté. Aucun défaut d'application trouvé — l'annulation
ciblait déjà correctement ce qu'on lui donnait.

Détail complet dans `Rapports/Lot3-Sejours.md` (section `STAY`).

## `STAYDEC` ★, `STAYREQ`, `POLICY`, `AVAIL` ★, `OCCUP`, pour mémoire

Tous clos : détail dans `Mode Operatoire.md` §14 (entrées 1.12→1.17) et
`Rapports/Lot3-Sejours.md`.

## Deux points d'outillage

- **Le dépôt n'a pas de configuration Prettier.** Ne pas lancer `npx prettier`.
  Le style se vérifie avec `npx eslint .`.
- **La base de dev (`solenne_dev`) est reseedée à chaque `npx playwright test`.**
  Les IDs changent d'une exécution à l'autre — ne jamais s'y fier d'une session
  à l'autre, seuls les statuts et les dates comptent.
