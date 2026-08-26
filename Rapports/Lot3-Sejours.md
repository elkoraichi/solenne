# Lot 3 — Séjours ★ · rapports de fin de module

Rattaché à `Mode Operatoire.md` v1.12 · fiche `Mode Operatoire - Detail/Lot3-Sejours.md`.

| Module | Cas de la fiche | Vérifications | Réussis | Échoués | Restants |
|---|---|---|---|---|---|
| `OCCUP` | 34 | 48 | 48 | 0 | 0 |
| `POLICY` | 16 | 34 | 34 | 0 | 1 (`POLICY-012`, reporté à `STAYREQ`) |

---

## MODULE : OCCUP — Calcul de l'occupation ★

**Statut : ✅ VALIDÉ** · module de sécurité rétrograde n°1 (voir §6 du Mode Opératoire) · livré en **deux arrêts** — `OCCUP-A` (Opus, contrat) et `OCCUP-B` (Sonnet, exercice du contrat).

### Fonctionnalités réalisées

- Fonction pure `occupationSur(présences, période, options?) → { total, parSource, jours }`, contrat figé par `OCCUP-CT-01→08`.
- Registre de contributeurs (Mode Opératoire §6.1, option B) : `SÉJOUR_CONFIRMÉ` actif, `DORMEUR_ÉVÉNEMENT` et `AFFECTATION_CHAMBRE` déclarés et dormants — le lot 4 activera un interrupteur, sans réécrire de formule.
- Lectures dérivées, posées dès le lot 2 pour `HOUSE-R2` et reprises telles quelles : `occupationParJour`, `occupationMaximale`, `joursAuDela`, `presencesConcernees`, `tientDansLaCapacite`.
- Traduction des séjours en présences (`src/domain/occupancy/sejours.ts`) : effectif = adultes + enfants (P6), statuts comptés en **liste blanche** (`CONFIRMED`, `COMPLETED`).
- Exclusion d'une présence en cours de modification (`exclureReference`) — pour recalculer un séjour contre lui-même sans le compter deux fois.
- **Sentinelle `OCCUP-024`** : énumère `REGISTRE` dynamiquement et compare le total à la somme des contributeurs actifs — un contributeur ajouté sans être sommé la fait échouer automatiquement.

### Règles vérifiées

| Règle | Où elle est tenue |
|---|---|
| OCC-R1 | `occupationDUneJournee` — somme des contributeurs actifs couvrant le jour |
| OCC-R2 | `estActif` — un contributeur inactif rend 0, jamais une erreur (`OCCUP-CT-05`, `OCCUP-019`) |
| OCC-R3 | `effectifDuSejour` = adultes + enfants — les invités nommés ne s'additionnent pas (P6, `OCCUP-009`) |
| OCC-R4 | Sans objet en vague 1 : `DORMEUR_ÉVÉNEMENT` est dormant, sa formule attend le lot 4 |
| OCC-R5 | Convention `[arrivée, départ[` — `OCCUP-005`, `OCCUP-006`, `OCCUP-CT-08` |
| OCC-R6 | `STATUTS_COMPTES` — annulé, refusé, en attente ne comptent jamais (`OCCUP-010→012`) |
| OCC-R7 | La confidentialité n'entre pas dans `SejourCompte` (`OCCUP-013`) |
| OCC-R8 | `total === Σ parSource`, jamais négatif (`OCCUP-CT-03`, `OCCUP-CT-04`) |

### Le test qui compte

`OCCUP-018`. Seul `SÉJOUR_CONFIRMÉ` est actif au lot 3 — `DORMEUR_ÉVÉNEMENT` n'existe pas encore. Le cas a donc été rejoué avec deux séjours confirmés qui réclament le même occupant le même jour, plutôt qu'avec un séjour et une inscription dormeur comme le décrit littéralement la fiche : `dejaComptees` est un ensemble **partagé par toutes les présences retenues d'une journée**, quel que soit leur contributeur, donc le mécanisme est déjà exactement celui que le lot 4 réutilisera sans y toucher. Sans lui, deux séjours partageant un occupant compteraient 5 personnes là où il n'y en a que 4.

### Problèmes rencontrés

**1. `OCCUP-018` ne peut pas s'écrire littéralement avant le lot 4.** La fiche le décrit avec un « dormeur d'événement » — contributeur déclaré mais inactif jusqu'à `SLEEP`. Une présence sous ce contributeur est filtrée avant même d'atteindre la déduplication, ce qui aurait rendu le test vrai pour une mauvaise raison. Rejoué avec deux séjours confirmés partageant un occupant : le mécanisme testé est identique, seule la source diffère. `SLEEP` (lot 4) pourra rejouer le même test tel quel en changeant le second contributeur en `DORMEUR_ÉVÉNEMENT`.

**2. Aucun outil de couverture installé dans le dépôt.** Le critère « couverture 100 % » du §10 de la fiche a été vérifié à la main plutôt que par un chiffre outillé : chaque fonction exportée d'`occupation.ts`, `registre.ts` et `sejours.ts` est exercée sur toutes ses branches, `tientDansLaCapacite` compris (test d'intégration `confidentialite.test.ts`, lot 2). Ajouter une dépendance de couverture pour produire un chiffre n'a pas semblé justifié pour ce module.

**3. Grille de sécurité S1→S12 sans objet.** Confirmé au contact du code, pas seulement à la lecture de la fiche : `src/server/occupation.ts` ne porte aucune directive `'use server'`, n'est appelé par aucun formulaire ni aucune route, et n'est consommé que par du code serveur interne (`HOUSE`, bientôt `AVAIL`). Rien à opposer à un client. Le critère 5 du §11.1 est donc tenu par l'absence de surface, documentée ici plutôt que cochée sans preuve.

### Grille de sécurité S1 → S12

Sans objet — fiche §5 : « Aucune surface exposée. `OCCUP` est appelé exclusivement par `AVAIL` et par les écrans de décision, jamais directement par un client. » Vérifié : aucune Server Action, aucune route, aucun import React/Next dans le domaine (`OCCUP-CT-07`).

### Grille de concurrence

Sans objet — fonction pure, aucune écriture. `AVAIL` et `STAYDEC` porteront la concurrence réelle sur les séjours.

### Impact sur les autres modules

- `AVAIL` (lot 3.2) : consomme `occupationSur` sans jamais recompter (garde-fou G1). Peut démarrer.
- `HOUSE` (lot 2, déjà livré) : aucun changement — `occupationParJour`, `joursAuDela`, `tientDansLaCapacite` gardent leur signature.
- Lot 4 (`SLEEP`) : activera `DORMEUR_ÉVÉNEMENT` dans `REGISTRE` et ajoutera `presencesDesRsvps` dans `src/server/occupation.ts`, sans toucher à `occupation.ts`. `OCCUP-018` sera rejoué avec un vrai dormeur d'événement à cette occasion.

### Décisions à confirmer par Yassine

Aucune. Le module n'a rien tranché qui ne relève de la technique.

---

## MODULE : POLICY — Règles de réservation

**Statut : ✅ VALIDÉ — 16 cas sur 16** (`POLICY-012` fermé par `STAYREQ`, voir plus bas et le rapport `STAYREQ`) · livré en **deux arrêts** — `POLICY-A` (Sonnet, domaine pur) et `POLICY-B` (Sonnet, persistance et console).

### Fonctionnalités réalisées

- Fonction pure `verifierReglages(demande, réglages) → RefusReglage[]` (`src/domain/policy/reglages.ts`) : les cinq réglages qui portent sur une demande — durée maximale, délai minimum, horizon maximum, jours d'arrivée interdits, personnes maximum par demande — plus POL-R6 (cohabitation désactivée ⇒ conflit d'exclusivité).
- Fonction pure `verifierCoherence(réglages, capacité) → IncoherenceReglage[]` : la cohérence des réglages **entre eux**, à l'enregistrement — POL-R5 (maximum par demande ≤ capacité) et POL-R9 (délai minimum et horizon maximum ne se contredisent pas ; les sept jours de la semaine ne sont pas tous interdits à la fois).
- Persistance sur `booking_settings`, une seule ligne comme `HOUSE` pour la maison (`src/server/actions/reglages-reservation.ts`) : lecture ouverte à tout le cercle, écriture réservée à Solenne.
- Console de Solenne (`ReglagesReservationMaison`, intégrée à `/gerer/maison`) : quatre champs numériques où un champ vidé veut dire « désactivée » (POL-R2), un choix de jours d'arrivée interdits, un choix de cohabitation, un seul bouton d'enregistrement.
- Signalement POL-R4 : après un durcissement, les demandes en attente devenues incompatibles sont **rendues** par la Server Action (jamais bloquées) et affichées dans la console, même contrat que `demandesDevenuesIncompatibles` de `HOUSE-R3`.
- Migration `lot3_policy_reglages_optionnels` : `max_guests`, `max_stay_nights`, `min_lead_time_hours`, `max_advance_days` deviennent nullables — `null` porte l'état « désactivée », sans colonne séparée.

### Règles vérifiées

| Règle | Où elle est tenue |
|---|---|
| POL-R1 | `verifierReglages` court-circuite tout en tête de fonction si `estSolenne` — aucun réglage ne s'oppose jamais à elle |
| POL-R2 | Un champ `null` (ou `joursArriveeInterdits` vide) n'est jamais évalué (`POLICY-008`, `010`) |
| POL-R3 | Tenu **par construction** : aucune ligne `Stay` n'est jamais relue par `mettreAJourReglagesReservation` (`POLICY-013`) |
| POL-R4 | Comparaison `verifierReglages` avant/après réglages sur les demandes `PENDING`, dans la Server Action (`POLICY-014`) |
| POL-R5 | `verifierCoherence` refuse l'enregistrement si le maximum par demande dépasse la capacité (`POLICY-011`) |
| POL-R6 | `verifierReglages` : cohabitation désactivée + période occupée ⇒ `EXCLUSIVE_CONFLICT` (`POLICY-015`) |
| POL-R9 | `verifierCoherence` refuse un délai minimum au-delà de l'horizon maximum, et les sept jours interdits à la fois (`POLICY-009`) — ajoutée en cours d'arrêt, absente de la numérotation de la fiche |

### Le test qui compte

`POLICY-014`. Un durcissement de réglage doit signaler les demandes en attente devenues incompatibles **sans en oublier ni en accuser à tort** : le test crée trois demandes (une trop longue, une qui tient, une déjà refusée) et vérifie que seule la première sort de `mettreAJourReglagesReservation`. Piège rencontré : des dates de test trop lointaines (`2027-09-10`) faisaient échouer *toutes* les demandes sur l'horizon maximum du jeu de réglages, masquant l'effet réel de la durée — corrigé en désactivant l'horizon (`null`) pour isoler la règle testée.

### Problèmes rencontrés

**1. Le client Prisma généré ne reflétait pas la nullabilité tout de suite.** Après la migration rendant quatre colonnes `Int?`, le typecheck échouait encore sur `bookingSettings.update` — `npx prisma generate` n'avait pas tourné avec le nouveau schéma en cache. Un `prisma generate` explicite a suffi ; leçon : ne pas supposer que `migrate dev` régénère toujours un client à jour dans la même commande.

**2. `SETUP-007` (aller-retour de migration) suppose la liste des migrations à jour.** Ce test annule des migrations nommément listées puis les rejoue : la nouvelle migration de ce module devait s'ajouter en tête de la liste, sinon `prisma migrate deploy` la considère comme déjà appliquée après le retour arrière des autres et ne la rejoue pas — les colonnes revenaient `NOT NULL`. Corrigé, avec un `down.sql` écrit à la main (restaure les valeurs par défaut avant de remettre la contrainte).

**3. `POLICY-012` (Solenne hors règles, cas `Integration`) n'a pas d'équivalent ici.** La fiche le décrit comme une vraie demande de séjour ; `STAYREQ`, qui seul crée des demandes, n'existe pas encore. La règle POL-R1 elle-même est déjà prouvée en domaine pur (test dédié dans `tests/unite/lot3/policy.test.ts`) — même parade que les quatre cas reportés de `PRIV` (P10).

> **Fermé par `STAYREQ`** (voir plus bas) : `tests/integration/lot3/demandes-sejour.test.ts` crée un réglage `maxGuests: 1`, puis une demande de 4 adultes au nom de Solenne — acceptée sans refus. `POLICY` passe à 16 cas sur 16.

### Grille de sécurité S1 → S12

Pertinentes : **S1** (lecture sans session → `UNAUTHENTICATED`), **S2/S6** (`POLICY-S02` : ami appelant directement `mettreAJourReglagesReservation` → `FORBIDDEN` + audit), **S7** (paramètres manipulés — durée négative, jour hors 1-7, champ manquant → `VALIDATION`, rien n'est écrit). Sans objet : S3/S4 (aucune ressource par utilisateur, une seule ligne partagée), S8/S11 (aucune URL ni jeton propres au module), S9 (rien de privé dans `ReglagesReservation` — un ami a le droit de voir ces réglages), S10/S12 (infrastructure transverse, déjà couverte ailleurs).

### Grille de concurrence

Sans objet formellement — pas de contention documentée pour ce module (D5 : Solenne seule administratrice, un seul écrivain possible). L'écriture (`upsert` + audit) est tout de même wrappée dans une transaction sérialisable, même parti que `PRIV`, pour que l'audit ne survive jamais à une écriture annulée.

### Impact sur les autres modules

- `AVAIL` (déjà livré) : `RefusReglage` n'est **pas** un `Conflit` — c'est `STAYREQ` qui enveloppera chaque refus en `conflit('R8', code)` avant `verifierDisponibilite`, jamais `POLICY` lui-même (dépendance documentée : `POLICY` → `HOUSE` seule).
- `STAYREQ` (à écrire) : consommera `reglagesReservation()` pour le formulaire, `verifierReglages()` pour valider une demande, et rejouera enfin `POLICY-012`.
- Lot 4 (`EVENT`/`SLEEP`) : aucun changement attendu — `POLICY` ignore les événements et les dormeurs par construction (dépendance `HOUSE` seule).

### Décisions à confirmer par Yassine

Aucune. Le module n'a rien tranché qui ne relève de la technique.

## MODULE : STAYREQ — Demande de séjour

**Statut : ✅ VALIDÉ — 20 cas sur 20** (`001→009`, `011`→`018`, `C06`, `S04`) · livré en **deux arrêts** — `STAYREQ-A` (Sonnet, Server Actions et composition R8) et `STAYREQ-B` (Sonnet, assistant et écran).

### Fonctionnalités réalisées

- Fonction pure `evaluerDemande(candidat, contexte) → { prealables, disponibilite }` (`src/domain/stays/demande.ts`) : trois refus durs propres au module (SREQ-R7, SREQ-R3), jamais contournables par `force`, composés avec `POLICY` fondu dans `AVAIL` (délégation R8 promise depuis `AVAIL-B`).
- Quatre Server Actions (`src/server/actions/demandes-sejour.ts`) : `creerDemandeSejour`, `mesDemandesSejour`, `modifierDemandeSejour`, `annulerDemandeSejour` — chacune ne touche que la demande de l'appelant (SREQ-R2, SREQ-R5/R6). Une cinquième, `verifierDisponibiliteSejour`, ne persiste rien : elle rend la même évaluation pour l'aperçu en direct (`STAYREQ-010`).
- Assistant en trois étapes (`AssistantDemandeSejour`) : dates → participants (personnes, invités nommés, privatisation D2) → informations (motif, règles obligatoires, récapitulatif). La disponibilité se revérifie à chaque changement (débattu 500 ms) et bascule le bouton d'envoi en « Envoyer quand même » si elle répond incompatible (SREQ-R4).
- Écran `/sejours` : la liste des demandes de l'ami (statut, annulation) au-dessus de l'assistant, remplaçant l'écran « à venir » du lot 2,5.
- Nouveau composant `CaseACocher` (`src/components/ui/`) — voir « Problèmes rencontrés ».
- Migration `lot3_stayreq_demande_unique_en_attente` : index unique partiel `(requester_id, arrival_date, departure_date) WHERE status = 'PENDING'`, parade de `STAYREQ-C06`.

### Règles vérifiées

| Règle | Où elle est tenue |
|---|---|
| SREQ-R1 | `creerDemandeSejour` n'écrit jamais un statut autre que `PENDING` (`STAYREQ-002`) |
| SREQ-R2 | `requesterId` n'est ni déclaré dans le schéma Zod ni lu depuis l'entrée — l'identité vient de `requireUser()` (`STAYREQ-S04`) |
| SREQ-R3 | Refus dur `RULES_NOT_ACCEPTED` si des règles obligatoires existent et ne sont pas cochées (`STAYREQ-008`, `009`) |
| SREQ-R4 | Un conflit `AVAIL`/`POLICY` refuse par défaut, `force: true` l'outrepasse et le journalise (`STAYREQ-010`, `011`) |
| SREQ-R5/R6 | `updateMany` filtré sur `status: 'PENDING'` — une demande décidée ne bouge plus, même course gagnée entre lecture et écriture (`STAYREQ-014`→`016`) |
| SREQ-R7 | Refus dur si 0 personne, ou plus d'invités nommés que de personnes déclarées (`STAYREQ-006`, `007`) |

### Le test qui compte

`POLICY-012`, fermé ici. La règle POL-R1 (Solenne échappe aux réglages de réservation) était déjà prouvée en domaine pur depuis le rapport `POLICY`, mais un domaine pur ne prouve pas qu'une vraie Server Action l'applique. Le test crée un réglage `maxGuests: 1`, puis fait passer une demande de 4 adultes au nom de Solenne par `creerDemandeSejour` : elle est acceptée. Ce n'était pas jouable avant `STAYREQ`, seul créateur réel de demandes — d'où le report depuis deux modules.

### Problèmes rencontrés

**1. Une case à cocher native ne tient pas la cible tactile de 44 px (UI-002).** Les deux cases de l'assistant (privatisation, acceptation des règles) auraient échoué `STAYREQ-018` en silence : l'élément est visible, seulement deux fois trop petit pour le pouce. Le dépôt avait déjà résolu ce problème pour un choix unique (`ChoixRadio`, entrée `sr-only`, étiquette entière cliquable) mais rien pour un choix binaire. Ajout de `CaseACocher` (`src/components/ui/case-a-cocher.tsx`), même principe, réutilisable pour tout futur module.

**2. Playwright ne coche pas une case masquée par `.check()` seul.** `sr-only` place l'entrée sous son étiquette dans l'ordre de rendu : la vérification d'actionabilité de Playwright refuse de cliquer un élément recouvert. `check({ force: true })` contourne la vérification — légitime ici, l'étiquette *est* la cible voulue, pas un obstacle.

**3. Le premier jet de l'indicateur d'étapes débordait à 320 px.** Trois intitulés complets (« Dates », « Participants », « Informations ») avec leurs puces ne tiennent pas sur une largeur de téléphone. Seule l'étape courante garde son libellé en dessous de `sm` ; les deux autres ne montrent que leur numéro — un motif déjà vu dans ce projet (HOUSE, SPACE, BLOCK) : la mesure automatique (aucun débordement) ne remplace pas la lecture de l'écran produit.

**4. Les tests écran ont buté sur les vrais réglages du jeu de démonstration.** Un premier jet de `STAYREQ-013`/`018` prenait des dates à 500+ jours et une demande sans case de règles cochée — refusées par `MAX_ADVANCE` (365 jours) et `RULES_NOT_ACCEPTED` (le jeu de démonstration porte trois règles obligatoires). Corrigé en choisissant des dates sous l'horizon et en cochant la case avant l'envoi — les mêmes contraintes qu'un vrai ami rencontrerait.

### Grille de sécurité S1 → S12

Pertinentes : **S1** (`creerDemandeSejour` sans session → `UNAUTHENTICATED`, `STAYREQ-001`) ; **S3/S4** (modifier ou annuler la demande d'un autre → `NOT_FOUND`, aucune écriture — hors fiche, ajoutés à l'arrêt A) ; **S6** (les quatre Server Actions sont appelées directement dans les tests d'intégration, sans passer par l'écran) ; **S7** (`schemaCreation`/`schemaModification` bornent dates, effectifs, longueurs de texte — `STAYREQ-003`→`007`) ; **S9** (`pourAmi()` filtre `regle` et `details` avant que le verdict ne quitte le serveur — un ami ne reçoit jamais de chiffre d'occupation). Sans objet : S2 (aucune fonction n'est réservée à Solenne dans ce module — elle demande comme un ami), S5 (le bouton « Envoyer quand même » n'est qu'un indice, `force` est revalidé serveur), S8/S10/S11/S12 (aucune URL ni jeton propres au module, transverse déjà couvert).

### Grille de concurrence

**C6** : `STAYREQ-C06`, double clic sur « Envoyer » — index unique partiel plutôt qu'un verrou, les deux clics réussissent et une seule demande existe (idempotence, pas un « premier gagne »). **C1→C5** sans objet ici : ce module ne fait qu'ouvrir une demande `PENDING` ; la contention réelle sur les dates et l'effectif se joue à la décision de Solenne, dans `STAYDEC` (prochain module), qui revalidera en transaction sérialisable avec le même `contexteDisponibilite` que celui-ci a posé (`src/server/disponibilite.ts`).

### Impact sur les autres modules

- `POLICY` (déjà livré) : passe à 16 cas sur 16, `POLICY-012` fermé ci-dessus.
- `STAYDEC` ★ (à écrire) : réutilisera `src/server/disponibilite.ts` et `src/domain/stays/demande.ts` pour sa revalidation en transaction sérialisable, sans en récrire un — l'arrêt Opus de ce module portera sur la transaction elle-même, pas sur le calcul de disponibilité, déjà posé.
- Lot 4 (`SLEEP`) : aucun changement attendu — `STAYREQ` ne compte jamais lui-même (règle non négociable n°3), il consomme `AVAIL` qui consomme `OCCUP`.

### Décisions à confirmer par Yassine

Aucune. Le module n'a rien tranché qui ne relève de la technique.

---

## MODULE : STAYDEC ★ — Décision

**Statut : ✅ VALIDÉ — 19 cas sur 19** (`001`, `002→004`, `005`, `006`, `007→010`, `011`, `012`, `013`, `014`, `C01`, `C05`, `C06`, `S02`, `S06`) · livré en **deux arrêts** — `STAYDEC-A` (**Opus**, revalidation en transaction sérialisable) et `STAYDEC-B` (Sonnet, file d'attente, écran de décision, refus, contre-proposition, sécurité).

### Fonctionnalités réalisées

- `evaluerAcceptation` (`src/domain/stays/decision.ts`, arrêt A) : le contrat de la décision — SDEC-R2 (rejeu, jamais de verdict pré-calculé), R2/R3 non forçables, le reste forçable avec `confirme: true`.
- `accepterDemandeSejour` (arrêt A) : transaction sérialisable, rejeu jusqu'à 3 tours sur les courses (`40001`/`40P01`/`23P01`/`23505`/`P2002`), séjour + statut + notification + audit solidaires.
- Trois Server Actions ajoutées à l'arrêt B (`src/server/actions/decisions-sejour.ts`) : `rejeterDemandeSejour` (SDEC-R5, motif obligatoire — validation Zod, pas une règle de domaine), `contreProposerDemandeSejour` (SDEC-R8, change les dates sans décider — statut, décideur et date de décision ne bougent pas), `demandesEnAttente` (SDEC — la file, triée arrivée croissante puis dépôt croissant).
- `verifierDecisionSejour`, quatrième action de l'arrêt B : le verdict complet en lecture seule (`confirmationSuffirait`, conflits chiffrés pour Solenne, occupation avant/avec la demande). Même principe que `verifierDisponibiliteSejour` (`STAYREQ-B`) : un aperçu pour l'écran, jamais une donnée que l'écriture réutilise — SDEC-R2 reste entier, `accepterDemandeSejour` revalide pour de vrai dans sa propre transaction.
- Écran `/gerer` : section « Demandes de séjour » au-dessus de la console existante (`FileAttenteDecisions`). Chaque demande s'ouvre sur le verdict en clair puis un choix à trois — accepter (avec confirmation si `confirmationSuffirait`), refuser (motif obligatoire), proposer d'autres dates.

### Règles vérifiées

| Règle | Où elle est tenue |
|---|---|
| SDEC-R1 | Les quatre nouvelles actions commencent par `requireRole('ADMIN', …)`, avant toute lecture (`STAYDEC-S02`) |
| SDEC-R2 | `verifierDecisionSejour` ne fait que prévisualiser ; l'écriture rejoue tout dans sa transaction — aucun verdict d'écran ne traverse vers l'acceptation |
| SDEC-R4 | L'écran ne propose « accepter quand même » que si `confirmationSuffirait` est vrai ; sinon aucune confirmation n'ouvre le refus (R2/R3) |
| SDEC-R5 | `rejeterDemandeSejour` : motif requis par le schéma Zod (`STAYDEC-004`, `007`) |
| SDEC-R6 | `verifierDecidable` (déjà écrite à l'arrêt A) revérifiée avant refus et contre-proposition — demande déjà traitée ou annulée refusée (`STAYDEC-009`, `010`) |
| SDEC-R7 | Refus et contre-proposition écrivent la notification et l'audit dans la même transaction que le changement d'état |
| SDEC-R8 | `contreProposerDemandeSejour` change `arrivalDate`/`departureDate`, laisse `status: 'PENDING'` et ne touche ni `decidedById` ni `decidedAt` ni `decisionNote` (`STAYDEC-008`) |

### Le test qui compte

`STAYDEC-013`. Trier une file semble anodin ; choisir *quoi* trier ne l'est pas. La fiche demande « les plus anciennes et les plus urgentes en tête » — deux critères, pas un. Le tri retenu (arrivée croissante, dépôt croissant à égalité) les tient tous les deux sans les opposer : l'urgence prime, l'ancienneté ne fait que départager. Le test crée cinq demandes dans le désordre pour que ce soit le tri, et non l'ordre d'insertion, qui produise le résultat.

### Problèmes rencontrés

Aucun, à l'arrêt B. L'aiguillage de la revalidation (§4 de `AVAIL`) et le contexte de disponibilité (`src/server/disponibilite.ts`) étaient déjà en place depuis `STAYREQ` et `STAYDEC-A` ; le verdict de lecture seule n'a fait que les appeler une troisième fois, avec la même discipline (client `db`, jamais la transaction d'écriture). Les problèmes de l'arrêt A (course sur le double clic, sentinelle de schéma) sont documentés dans `Rapports/etat.md`.

### Grille de sécurité S1 → S12

Pertinentes : **S2** (`STAYDEC-S02` : un ami appelant l'une des cinq actions de décision reçoit `FORBIDDEN` sur chacune, avec une entrée `refus.demandeSejour.*` par action) ; **S6** (`STAYDEC-S06` : appel direct de `accepterDemandeSejour` avec `confirme: true` forcé dans la charge — la garde tranche avant que la confirmation ne compte pour quoi que ce soit) ; **S7** (`schemaRefus` — motif non vide ; `schemaContreProposition` — dates valides via `schemaJour` + `periodeValide`) ; **S9** (`VerdictDecisionVue` n'est renvoyé qu'à `requireRole('ADMIN', …)` — jamais construit pour une session ami, contrairement à `pourAmi()` qui filtre après coup dans `STAYREQ`). Sans objet ici, transverse déjà couvert : S1, S3/S4 (aucune notion de demande « à soi » pour Solenne — elle décide de toutes), S5, S8, S10, S11, S12.

### Grille de concurrence C1 → C6 — arrêt A

C'est le module ⚠️ du projet, et le seul de la vague 1 où la grille se déroule
point par point plutôt qu'en une ligne. Trois points s'appliquent, trois sont
hors d'atteinte — vérifié, pas supposé.

| # | Verdict | Preuve |
|---|---|---|
| **C1** | ✅ couvert | `STAYDEC-C01` : deux demandes de 6 personnes, capacité 10, acceptées en parallèle. Exactement un séjour, occupation finale ≤ 10, la perdante reçoit `CAPACITY_EXCEEDED` — un refus **métier**, pas `40001` |
| C2 | sans objet | Créneaux d'objets à apporter : `EventItemClaim`, lot 5. Le chemin de décision n'écrit que dans `stays`, `stay_requests`, `notifications` et `audit_logs` (`grep` sur les écritures du fichier) |
| C3 | sans objet | Dernière place d'un événement : `EventParticipant`, lot 4. Même preuve |
| C4 | sans objet | Jeton d'invitation : couvert par `INVITE` au lot 1 ; aucune invitation n'est lue ni écrite ici |
| **C5** | ✅ couvert | `STAYDEC-C05` : acceptation et blocage lancés ensemble sur les mêmes dates. Exactement une écriture aboutit, `séjours × périodes = 0` dans tous les cas, et le perdant repart avec un refus lisible |
| **C6** | ✅ couvert, **et il manquait** | Double clic sur « Accepter ». Aucun des 7 cas de la fiche ne le couvrait : la grille l'a trouvé (voir ci-dessous) |

**Ce que C6 a révélé.** Deux acceptations simultanées de la **même** demande
laissaient bien un seul séjour — l'index unique `stays_request_id_key` tenait —
mais le second clic recevait `CONFLICT` (« quelqu'un a modifié en même temps »)
au lieu du refus prévu par SDEC-R6. L'invariant était sauf, le message faux :
Solenne aurait lu un incident là où elle venait simplement de cliquer deux fois.
La violation d'unicité (`P2002` / `23505`) est désormais reconnue comme une
course au même titre que `40001` ; la transaction rejouée relit la demande, la
trouve `ACCEPTED`, et rend « Cette demande a déjà été traitée ».

**Un écart assumé avec la mise en œuvre décrite au §8.** Le §8 prescrit « un
verrou sur la ligne concernée ». Il n'y en a pas, et en ajouter un n'apporterait
rien : sous `Serializable`, une transaction qui tente de verrouiller une ligne
qu'une transaction concurrente vient de mettre à jour lève de toute façon
`40001`. Le verrou déplacerait le code d'erreur sans supprimer le rejeu — qui
reste le vrai mécanisme, avec les deux contraintes d'exclusion en filet. Les
deux autres exigences du §8 sont tenues à la lettre : revalidation **à
l'intérieur** de la transaction (avec le client de la transaction, jamais `db`)
et contrainte d'exclusion PostgreSQL.

**Bruit connu.** Prisma écrit `prisma:error … write conflict` sur la sortie
standard pendant `C01`, `C05` et `C06`. C'est son journal interne sur une
transaction rejouée puis convertie en refus métier : rien n'atteint l'écran, et
les trois tests le vérifient explicitement (`message` sans `40001`, sans
`serialize`, sans `Unique`).

**Pas de nouveau tour de grille à l'arrêt B.** Le §9 de la fiche ne classe
`CRITICAL` que la course à l'acceptation ; refus et contre-proposition n'y
figurent pas. Les deux s'écrivent dans une transaction ordinaire (pas
`Serializable`), sans rejeu : la seule chose qu'ils doivent tenir est SDEC-R6
(une demande ne se décide qu'une fois), déjà vérifiée en lecture avant
l'écriture. Aucune plateforme de contention nouvelle : la file d'attente et le
verdict de lecture ne font qu'une seule requête chacun, jamais deux écritures
concurrentes sur la même ligne.

### Impact sur les autres modules

- `STAYREQ` (déjà livré) : inchangé — `verifierDisponibiliteSejour` et
  `verifierDecisionSejour` partagent `src/server/disponibilite.ts` sans le
  modifier.
- `STAY` (à écrire, `S12`) : lira les mêmes `stays` que `STAYDEC` produit ;
  aucune interface nouvelle à prévoir, `accepterDemandeSejour` n'a pas changé
  à cet arrêt.
- Lot 4 (`SLEEP`) : aucun changement attendu — les quatre nouvelles actions
  consomment `AVAIL`/`OCCUP`, elles ne comptent jamais elles-mêmes (règle non
  négociable n°3).

### Décisions à confirmer par Yassine

Aucune. Le module n'a rien tranché qui ne relève de la technique.

---
