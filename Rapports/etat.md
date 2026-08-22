# Où nous en sommes

> Dix lignes, tenues à jour **à la fin de chaque arrêt**. C'est le premier fichier
> à lire dans une session neuve, et le seul qui dise l'état d'un travail *en
> cours* — le tableau de bord du §2, lui, ne parle que des modules terminés.

| | |
|---|---|
| **Dernier commit** | *(à créer)* `STAYREQ` clos (20/20) + `POLICY-012` (16/16) **et** le code de `STAYDEC-A` ci-dessous — un seul commit reste à faire pour les deux |
| **Lot en cours** | 3 — Séjours ★ (vague 1) |
| **Module en cours** | `STAYDEC` ★ — arrêt A : **7 cas + grille C1→C6 verts** |
| **Arrêt en cours** | `STAYDEC-A` — ⚠️ **OPUS REQUIS jusqu'à sa clôture**. Reste : journal `Mode Operatoire.md` §14, tableau de bord §2, et le commit (il en couvre trois : `STAYREQ`, `POLICY-012`, `STAYDEC-A`) |
| **Prochain arrêt** | clore `STAYDEC-A`, puis `STAYDEC-B` (Sonnet) |
| **Prochaine action** | Écrire l'entrée de journal §14 pour `STAYDEC-A`, mettre le §2 à jour, committer. Le rapport de module attend l'arrêt B ; sa grille de concurrence est **déjà écrite** dans `Rapports/Lot3-Sejours.md` |
| **Suite de tests** | **821 Vitest verts en 48 s**, unité + intégration, régression complète rejouée. `npx tsc --noEmit` et `npx eslint .` muets. Playwright **pas rejoué** |
| **En attente de Yassine** | rien |

## `STAYDEC-A` — les 7 cas, écrits et verts (2ᵉ session Opus du 22/08/2026)

`tests/unite/lot3/staydec.test.ts` (18 assertions de domaine pur) et
`tests/integration/lot3/decisions-sejour.test.ts` (les 7 cas : `001`, `005`,
`006`, `011`, `014`, `C01`, `C05`). Trois choses ont bougé dans le code, toutes
révélées par un test rouge, aucune décidée à l'avance :

1. **Le refus « il faut confirmer » porte désormais le code du conflit**
   (`CAPACITY_EXCEEDED`, `BLOCKED_PERIOD`, `MAX_PARTY_SIZE`…), plus le code
   générique `DECISION_CONFLICT_UNCONFIRMED`. `STAYDEC-C01` exige littéralement
   `CAPACITY_EXCEEDED` pour le perdant de la course, et `Echec` n'a de place
   que pour **un** code : le faire porter par la raison, pas par la consigne.
   `DECISION_CONFLICT_UNCONFIRMED` devient la phrase ajoutée derrière la raison
   (« La maison serait à 12 personnes pour 10 places. Confirmez explicitement
   pour accepter quand même. »). Le drapeau structuré `confirmationSuffirait`
   reste dans le verdict du domaine.
   **Conséquence pour `STAYDEC-B`** : l'écran ne peut pas déduire « forçable »
   du refus d'écriture — il lui faut une action de lecture qui rende le verdict
   complet, sur le modèle de `verifierDisponibiliteSejour` (`STAYREQ-B`).
2. **L'audit d'une acceptation forcée garde le code du conflit**, pas seulement
   sa phrase : `{ code, resume }` (un message se réécrit, un code jamais).
3. **Sentinelle de schéma remise au vert** : `down.sql` manquait pour la
   migration d'exclusivité stricte, et `SETUP-006` / `SETUP-007` ignoraient la
   nouvelle contrainte. Les deux échouaient **avant** cette session.
4. **Grille C1→C6 déroulée** (détail dans `Rapports/Lot3-Sejours.md`, section
   `STAYDEC`). C1 et C5 étaient couverts par les cas de la fiche ; **C6 ne
   l'était pas et a trouvé un vrai défaut** : le double clic sur « Accepter »
   rendait `CONFLICT` au lieu du refus SDEC-R6. La violation d'unicité
   (`P2002` / `23505`) rejoint désormais `40001` dans les courses rejouées, et
   un 8ᵉ test le verrouille. C2/C3/C4 sans objet, vérifié par les écritures
   réelles du fichier. Écart assumé avec le §8 : pas de verrou de ligne — sous
   `Serializable` il ne supprimerait pas le rejeu, il changerait seulement le
   code d'erreur.

**Vérifié depuis** : `visibiliteParDefaut` et `journaliserAudit` acceptent bien
le client de transaction à l'exécution (`001` et `011` le prouvent).

Bruit connu, sans conséquence : Prisma écrit `prisma:error … write conflict` sur
la sortie standard pendant `C01` et `C05`. C'est son journal interne, sur une
transaction rejouée puis convertie en refus métier — rien n'atteint l'écran.

### Ce qui était déjà écrit (1ʳᵉ session Opus du 22/08/2026)

Quatre fichiers, tous compilés (`npx tsc --noEmit` muet) et propres (`npx eslint` muet) :

1. **`prisma/migrations/20260822120000_lot3_staydec_exclusivite_stricte/`** — appliquée.
   Le lot 0 couvrait déjà exclusif↔exclusif. Manquait le cas mixte : nouvelle
   contrainte `stays_exclusif_sans_cohabitation`, `EXCLUDE … "exclusive" WITH <>`.
   Les deux contraintes réunies couvrent D2 en entier.
2. **`src/domain/core/error-codes.ts` / `messages.ts`** — nouveau bloc
   `CODES_STAYDEC` : `REQUEST_CANCELLED`, `DECISION_CONFLICT_UNCONFIRMED`.
3. **`src/domain/stays/decision.ts`** — le contrat. Trois choix figés, tous
   argumentés dans l'en-tête du fichier :
   - `evaluerAcceptation` ne reçoit **aucun verdict pré-calculé** (SDEC-R2) ;
   - `demandeurEstSolenne`, jamais le décideur — sinon `POLICY` ne s'appliquerait
     plus à personne (POL-R1) ;
   - **R2/R3 ne sont pas forçables** ; R1/R4/R8 le sont avec `confirme: true`.
4. **`src/server/actions/decisions-sejour.ts`** — `accepterDemandeSejour`.
   Revalidation **avec le client de la transaction** (c'est la ligne qui fait
   tout : sous `Serializable`, elle pose les verrous de prédicat). Rejeu jusqu'à
   3 tours sur `40001` / `40P01` / `23P01` / `P2034` : le perdant de la course
   obtient au tour suivant un refus **métier** (`CAPACITY_EXCEEDED`), pas une
   trace de base. Séjour + statut + notification + audit dans la même transaction.

Deux appuis pour les tests à venir : la panne de `STAYDEC-011` se simule en
faisant échouer `journaliserAudit` (dernière écriture de la transaction) via
`vi.mock` + `vi.hoisted` ; la fabrique `creerDemande` accepte maintenant
`exclusif` (`STAYDEC-014`).

## Ce qui a été figé à `STAYREQ` (arrêt B)

- **`verifierDisponibiliteSejour`** (nouvelle Server Action, lecture seule) : même évaluation que `creerDemandeSejour`, sans persister ni journaliser — c'est l'assistant qui l'appelle à chaque changement de dates ou de personnes (débattu 500 ms). `STAYDEC` peut s'en inspirer mais n'en a pas besoin : sa revalidation se fait dans la transaction d'écriture, pas en aperçu.
- **`POLICY-012` fermé** — `tests/integration/lot3/demandes-sejour.test.ts` : réglage `maxGuests: 1`, demande de 4 adultes au nom de Solenne, acceptée (POL-R1). `POLICY` passe de 15/16 à 16/16.
- **Nouveau composant `CaseACocher`** (`src/components/ui/case-a-cocher.tsx`) — une case à cocher native ne tient pas 44 px (UI-002) ; même principe que `ChoixRadio` (entrée `sr-only`, étiquette entière cliquable). À réutiliser pour tout futur choix binaire ami-facing plutôt que `<input type="checkbox">` brut.
- **Piège E2E : `.check()` seul échoue sur une case `sr-only`** — Playwright refuse de cliquer un élément recouvert par son étiquette. `check({ force: true })` est le bon contournement ici (l'étiquette est la cible voulue).
- **Écran `/sejours`** : liste des demandes de l'ami (`MesDemandesSejour`, statut + annulation avec confirmation) au-dessus de l'assistant (`AssistantDemandeSejour`). Pas de modification via l'écran (SREQ-R5 le permet mais aucun cas de test `STAYREQ-B` ne l'exige) — annuler puis refaire une demande couvre le besoin.
- Rapport complet dans `Rapports/Lot3-Sejours.md` (section `STAYREQ`) et journal `Mode Operatoire.md` §14, entrée 1.15.

## `AVAIL` ★ et `OCCUP`, pour mémoire

Clos respectivement à `AVAIL-C` (35/35) et `OCCUP-B` (34/34) : détail dans `Mode Operatoire.md` §14 (entrées 1.12, 1.13) et l'historique git. `AVAIL-029` a été rejoué avec des séjours confirmés en l'absence de `DORMEUR_ÉVÉNEMENT` — `SLEEP` (lot 4) le rejouera tel quel avec le vrai contributeur.

## Deux points d'outillage

- **Le dépôt n'a pas de configuration Prettier.** Ne pas lancer `npx prettier`.
  Le style se vérifie avec `npx eslint .`.
- `STAYDEC-A` est le **dernier arrêt Opus** de la vague 1 : contrat de décision + transaction concurrente. Après lui, `STAYDEC-B` et `STAY` reviennent à Sonnet.
