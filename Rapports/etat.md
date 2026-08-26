# Où nous en sommes

> Dix lignes, tenues à jour **à la fin de chaque arrêt**. C'est le premier fichier
> à lire dans une session neuve, et le seul qui dise l'état d'un travail *en
> cours* — le tableau de bord du §2, lui, ne parle que des modules terminés.

| | |
|---|---|
| **Dernier commit** | à faire dans cette session — **lot 3 clos**. Journal §14 entrée 1.19, tableau de bord §2 (ligne lot 3 ✅ Validé 27/08/2026) et `Rapports/Lot3-Sejours.md` (section « Clôture du lot 3 ») à jour |
| **Lot en cours** | aucun — lot 3 **validé**. Prochain lot : 7 — `DEPLOY` seul (vague 1) |
| **Module en cours** | aucun |
| **Arrêt en cours** | aucun — clôture du lot 3 **faite** : régression complète, trois tailles, un défaut de test corrigé (`CAL-007`, dormant depuis le lot 2), captures produites |
| **Prochain arrêt** | Module **`DEPLOY`** — Sonnet, session neuve. Lire la fiche `Mode Operatoire - Detail/Lot7-*.md` (section `DEPLOY` seulement), préparer Netlify/Neon/Resend et les variables d'environnement (`babyplace.fr`, D6) |
| **Prochaine action** | Ouvrir la fiche `DEPLOY`, poser la checklist §11.3, puis solliciter Yassine pour **L1** (achat du domaine, création des comptes) avant toute mise en ligne |
| **Suite de tests** | **852 Vitest verts en ~54 s**, unité + intégration. `npx tsc --noEmit` et `npx eslint .` muets. Playwright complet aux trois tailles : **459 passés, 10 ignorés, 0 échoué** (~1 min 20, build de production compris) |
| **En attente de Yassine** | Jugement visuel **L2** sur les dix captures de `Rapports/apercus-lot3/` (`/sejours` ami, `/sejours` Solenne, `/gerer`, trois tailles chacune) |

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
