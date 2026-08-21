# La Maison de Solenne — Analyse, architecture et découpage MVP

> Réponse aux étapes 1 à 3 de `01_DemandeInitiale.txt`.
> **Aucune ligne de code applicatif n'a été écrite.** Ce document est à valider (ou annoter, façon `{Modification Yassine}`) avant l'étape 4.

---

## 0. Décisions arrêtées (21 août 2026)

| # | Sujet | Décision |
|---|---|---|
| D1 | **Capacité de la maison** | Paramétrable, **entre 1 et 25 personnes**. Valeur modifiable par Solenne à tout moment ; le moteur de disponibilité la relit à chaque vérification |
| D2 | **Séjour exclusif** | **Retenu.** Case « je souhaite privatiser la maison » sur la demande ; Solenne arbitre |
| D3 | **Séjours pendant un événement** | **Cas nominal, pas une exception.** Un anniversaire où des couples et des enfants dorment sur place est le scénario attendu. Conséquences : le RSVP porte une option « je dors sur place » qui crée l'occupation directement (pas de double saisie), et les dormeurs comptent dans la capacité D1 |
| D4 | **Confidentialité par défaut** | Un ami voit **« Maison occupée »**, sans nom ni détail. `privacyLevel = BUSY_ONLY` par défaut, ajustable par Solenne au cas par cas |
| D5 | **Administration** | **Solenne est seule administratrice.** L'énumération `Role` reste ouverte pour ajouter un co-hôte plus tard |
| D6 | **Domaine** | **chezsolenne.fr** |
| D7 | **Langue** | **Français uniquement.** Libellés en dur, pas de couche i18n au MVP |
| D8 | **Chevauchement d'événements** | Toujours interdit (règle R6) |

---

## Étape 1 — Analyse de l'existant

### 1.1 État du dépôt

| Élément | Constat |
|---|---|
| Répertoire | `/Users/koraichi/Documents/Solenne` |
| Contenu | 1 seul fichier : `01_DemandeInitiale.txt` (20 Ko) |
| Dépôt git | **Absent** (non initialisé) |
| `package.json`, lockfile, CI | Absents |
| Stack technique | **Aucune** |
| Authentification existante | **Aucune** |
| Code réutilisable | **Aucun** |

### 1.2 Conséquences

Deux consignes du cahier des charges deviennent sans objet :

- §6 « Si le projet possède déjà un système d'authentification, réutilise-le » → il n'y en a pas, il faut en choisir un.
- §24.4 « Ne remplace pas inutilement les technologies existantes » → aucune contrainte technique héritée.

Nous sommes donc libres de choisir la stack, ce qui est une bonne nouvelle : on peut optimiser directement pour les vraies priorités du projet (simplicité, sécurité, mobile, faible coût d'exploitation, un seul développeur).

### 1.3 Lecture du besoin — les 5 points structurants

L'analyse du cahier des charges fait ressortir cinq décisions de conception qui conditionnent tout le reste :

1. **La maison n'est pas exclusive.** C'est la modification la plus importante (§3, §13) : plusieurs séjours peuvent coexister sur les mêmes dates. Le système n'est donc pas un moteur de réservation « une période = un occupant », mais un **moteur de capacité** (combien de personnes / combien de couchages restent disponibles). C'est structurellement différent d'un clone Airbnb.
2. **Tout passe par une validation humaine.** Aucune confirmation automatique. Solenne est toujours dans la boucle. Le système propose, elle décide.
3. **La confidentialité est asymétrique et configurable.** Solenne voit tout ; un ami voit « Maison occupée » ou davantage selon un réglage. Cette règle doit vivre dans **une seule fonction serveur**, jamais dans le front.
4. **Deux volumétries opposées.** ~1 administratrice, quelques dizaines d'amis, quelques dizaines d'événements par an. Aucun enjeu de scalabilité ; l'enjeu est **l'ergonomie mobile et la maintenabilité à un développeur**.
5. **Le ton du produit est un différenciateur, pas une finition.** §20, §28 et §33 disent la même chose : « carnet numérique de la maison », pas « logiciel de gestion ». Le design ne peut pas être repoussé à la fin.

### 1.4 Risques identifiés dès maintenant

| Risque | Impact | Mitigation proposée |
|---|---|---|
| Sur-conception (la demande liste ~16 tables et 30 fonctionnalités) | Projet jamais mis en ligne | MVP en 8 lots livrables ; le reste explicitement post-MVP (§4.4) |
| Règles de disponibilité éparpillées dans l'UI | Bugs de double réservation, incohérences | Un **moteur de disponibilité unique** côté serveur, testé unitairement |
| Acceptations concurrentes (§30) | Sur-occupation de la maison | Transaction + contrainte d'exclusion PostgreSQL (§3.5) |
| Fuite de données privées entre amis | Perte de confiance, RGPD | Sérialiseurs par rôle : le serveur n'envoie **jamais** ce que l'utilisateur ne doit pas voir |
| WhatsApp (§16) | Coût + validation Meta, délai de plusieurs semaines | Architecture multi-canal prête, **canal WhatsApp non implémenté au MVP** |

---

## Étape 2 — Proposition

## 2. Architecture fonctionnelle

Le produit s'organise en **six domaines métier** indépendants, ce qui donne aussi le découpage du code :

```
┌─────────────────────────────────────────────────────────┐
│                    LA MAISON DE SOLENNE                  │
├───────────────┬───────────────┬─────────────────────────┤
│  IDENTITÉ     │   MAISON      │      CALENDRIER         │
│  utilisateurs │  chambres     │   vue unifiée de        │
│  invitations  │  bureaux      │   l'occupation          │
│  rôles        │  règles       │   (source de vérité     │
│  profils      │  photos       │    de la dispo)         │
├───────────────┼───────────────┼─────────────────────────┤
│  ÉVÉNEMENTS   │   SÉJOURS     │    COMMUNICATION        │
│  RSVP         │  demandes     │   notifications         │
│  activités    │  validation   │   fils de discussion    │
│  à apporter   │  conflits     │   emails                │
└───────────────┴───────────────┴─────────────────────────┘
                        ▲
         ┌──────────────┴──────────────┐
         │  MOTEUR DE DISPONIBILITÉ    │  ← cœur du système, code pur, testé
         │  (blocages, capacité,       │
         │   exclusivité, règles)      │
         └─────────────────────────────┘
```

**Le moteur de disponibilité est le cœur du produit.** Événements, séjours et calendrier l'interrogent tous ; il ne dépend de rien (fonction pure prenant en entrée l'occupation existante et une demande, rendant un verdict). C'est le seul module que je recommande de couvrir à 100 % par des tests.

### 2.1 Règles de disponibilité (formalisation des `{Modification Yassine}`)

Convention : **intervalles semi-ouverts `[arrivée, départ[`**. Un départ le 20 et une arrivée le 20 ne se chevauchent pas — la chambre est libérée le jour du départ.
Test de chevauchement : `A.début < B.fin ET B.début < A.fin`.

| # | Règle | Verdict |
|---|---|---|
| R1 | Chevauchement avec une **période bloquée** | ❌ Refus systématique |
| R2 | Chevauchement avec un séjour marqué **exclusif** (privatisation) | ❌ Refus |
| R3 | La demande est **exclusive** et un séjour existe déjà | ❌ Refus |
| R4 | `occupants confirmés + dormeurs d'événement + demandés > capacité (D1, 1→25)` | ❌ Refus |
| R5 | Chevauchement avec un **autre séjour non exclusif**, capacité OK | ✅ **Autorisé** (cohabitation — c'est la règle Yassine) |
| R6 | Deux **événements** qui se chevauchent | ❌ Refus |
| R7 | Séjours pendant un événement | ✅ **Cas nominal** (D3) — plusieurs séjours coexistent avec un événement ; seule la capacité R4 arbitre |
| R8 | Règles paramétrables : durée max, délai min avant arrivée, horizon max, jours interdits | ❌ Refus, message explicite |

Chaque refus renvoie un **code + un message en français** (`BLOCKED_PERIOD`, `CAPACITY_EXCEEDED`, …), affiché tel quel à l'utilisateur : jamais un « erreur 400 ».

**Occupation d'un jour donné** = séjours confirmés (adultes + enfants + invités) **+** participants d'événement ayant coché « je dors sur place » (accompagnants inclus). Une seule fonction calcule ce nombre ; l'agenda, la demande de séjour et l'écran de décision de Solenne l'appellent tous les trois. Le moteur prévient Solenne dès que la capacité D1 est approchée à moins de 20 %.

---

## 3. Architecture technique

### 3.1 Stack recommandée

| Couche | Choix | Pourquoi |
|---|---|---|
| Framework | **Next.js 15** (App Router, React 19, TypeScript strict) | Un seul projet front + back. Server Actions = pas d'API REST à écrire et à sécuriser deux fois. |
| Base de données | **PostgreSQL** (Neon ou Supabase) | Types `daterange` + contraintes d'exclusion : la protection anti-conflit est garantie par la base, pas seulement par le code. |
| ORM | **Prisma** | Migrations versionnées, typage bout-en-bout, lisible par un non-spécialiste. |
| Auth | **Auth.js v5** (email + mot de passe, Argon2id) | Ouvre Google/Apple/magic link plus tard sans réécriture (§6). |
| UI | **Tailwind CSS v4 + shadcn/ui** | Composants possédés (dans le repo), donc entièrement re-stylables : indispensable pour ne pas ressembler à un back-office. |
| Calendrier | Composant **maison** au-dessus de `date-fns` / `Temporal` | Les libs type FullCalendar sont conçues pour des agendas pro ; on veut un visuel chaleureux et une vue mobile spécifique. |
| Emails | **Resend + React Email** | Templates en React, gratuit à ce volume. |
| Images | **Vercel Blob** ou UploadThing + `next/image` | Photos de la maison en qualité et légères sur mobile. |
| Tests | **Vitest** (domaine) + **Playwright** (parcours) | Le moteur de dispo et les permissions doivent être testés ; le reste au jugé. |
| Hébergement | **Vercel** + Neon | Déploiement à chaque push, coût ~0 à cette échelle. |

**Alternative écartée : Supabase intégral (BaaS + RLS).** Séduisant pour la vitesse, mais la logique de confidentialité (§8) et le moteur de conflits deviennent des politiques SQL difficiles à tester et à faire évoluer. Avec un seul développeur, du TypeScript testable vaut mieux que du RLS subtil.

**Alternative écartée : Rails / Laravel.** Excellents pour ce type d'app, mais l'exigence UI (§20, §33) est plus rapide à atteindre en React.

### 3.2 Organisation du code

```
src/
├── app/
│   ├── (auth)/          connexion, invitation, mot de passe oublié
│   ├── (app)/           espace ami : accueil, calendrier, événements, séjours, maison, profil
│   └── (admin)/         espace Solenne
├── domain/              ★ cœur métier, sans dépendance framework
│   ├── availability/    moteur de disponibilité + tests
│   ├── privacy/         quelles données pour quel rôle
│   ├── events/          capacité, RSVP, anti-doublon "à apporter"
│   └── stays/           machine à états des demandes
├── server/
│   ├── actions/         Server Actions (validation Zod + garde de permission en 1re ligne)
│   ├── auth/            session, rôles, invitations
│   ├── notifications/   bus multi-canal (in-app | email | [whatsapp])
│   └── db.ts
├── components/
│   ├── ui/              primitives shadcn re-stylées
│   ├── calendar/        vues mois / semaine / agenda
│   └── ...
└── emails/
```

Règle d'or : `domain/` ne connaît ni Next.js, ni Prisma, ni React. On y teste les cas limites du §30 sans base de données.

### 3.3 Authentification et invitations (§6)

```
Solenne saisit un email + un rôle
   → Invitation créée : token aléatoire 32 octets, SEUL LE HASH est stocké en base
   → Email « Solenne vous invite… » avec /invitation/<token>
   → Expiration 14 jours, usage unique, révocable
   → La personne définit son mot de passe puis complète son profil
   → Compte actif
```

- **Aucune inscription libre.** La route d'inscription publique n'existe pas.
- Mots de passe hachés **Argon2id**, sessions en cookie `httpOnly` / `secure` / `sameSite=lax`.
- Réinitialisation par token à usage unique, 1 h de validité.
- Limitation de débit sur connexion, invitation et réinitialisation.
- Réponses volontairement identiques que l'email existe ou non (pas d'énumération de comptes).

### 3.4 Permissions

Contrôle **exclusivement côté serveur**, en première ligne de chaque Server Action :

```ts
const user = await requireRole('ADMIN')   // lève une erreur avant toute lecture de données
```

L'UI masque des boutons par confort, jamais par sécurité. Matrice cible :

| Action | Ami | Admin |
|---|---|---|
| Voir les événements auxquels il est invité | ✅ | ✅ (tous) |
| Créer / modifier / annuler un événement | ❌ | ✅ |
| Répondre à un RSVP (le sien) | ✅ | ✅ |
| Demander un séjour | ✅ | ✅ |
| Accepter / refuser une demande | ❌ | ✅ |
| Voir les détails d'un séjour d'autrui | ❌ (selon réglage) | ✅ |
| Bloquer des dates, gérer maison / chambres / règles | ❌ | ✅ |
| Inviter, désactiver, changer un rôle | ❌ | ✅ |
| Consulter le journal d'audit | ❌ | ✅ |

L'énumération `Role` (`ADMIN`, `FRIEND`, …) et une table de capacités permettent d'ajouter `CO_HOST` ou `FAMILY` plus tard sans toucher aux écrans (§5).

### 3.5 Concurrence — le cas « deux acceptations simultanées » (§30)

Trois protections superposées :

1. **Validation à l'acceptation, pas à la demande.** Une demande vieille de 3 semaines est revérifiée au moment du clic de Solenne.
2. **Transaction sérialisable** avec verrou sur la ligne `house`, revalidation du moteur *à l'intérieur* de la transaction.
3. **Filet de sécurité en base** — PostgreSQL refuse physiquement deux séjours exclusifs qui se chevauchent :

```sql
ALTER TABLE stays ADD CONSTRAINT no_overlapping_exclusive_stays
  EXCLUDE USING gist (
    house_id WITH =,
    daterange(start_date, end_date, '[)') WITH &&
  ) WHERE (exclusive AND status = 'CONFIRMED');
```

La même contrainte s'applique aux événements (règle R6).

---

## 4. Modèle de données

18 tables. Chaque table de la liste §25 est couverte ; les écarts sont justifiés en 4.4.

### 4.1 Identité et maison

| Table | Champs principaux |
|---|---|
| `users` | email (unique), passwordHash, firstName, lastName, phone, avatarUrl, **role**, **relationType** (`CLOSE_FRIEND`/`FAMILY`/`ACQUAINTANCE`/`OTHER`), childrenCount, notes, preferences (json), status (`ACTIVE`/`DISABLED`), lastLoginAt |
| `invitations` | email, **tokenHash**, role, invitedById, expiresAt, acceptedAt, revokedAt |
| `sessions` / `accounts` | gérées par Auth.js (`accounts` prépare Google/Apple) |
| `houses` | name, description, address, **capacityMax**, photos, coverImage — une seule ligne aujourd'hui, table prête pour le multi-maisons (§27) |
| `spaces` | houseId, **type** (`ROOM`/`OFFICE`), name, description, sleeps, bedType, amenities[], photos, order, active |
| `house_rules` | houseId, title, body, icon, order, active, requiresAcceptance |
| `booking_settings` | houseId, maxGuests, maxStayNights, minLeadTimeHours, maxAdvanceDays, blockedWeekdays[], **defaultStayPrivacy**, allowCoOccupancy |

> **Choix : une table `spaces` plutôt que `rooms` + `offices`.** Chambres et bureaux partagent 80 % de leurs champs et surtout leur avenir commun : « réserver le bureau 1 pendant mon séjour » et « affecter la chambre bleue » sont la même fonctionnalité (§14, §15, §27). Une table + un enum, c'est une seule interface d'administration et une seule table d'affectation à écrire le jour venu, au lieu de deux de chaque.

### 4.2 Événements

| Table | Champs principaux |
|---|---|
| `events` | houseId, title, description, **startAt**, **endAt**, location, capacityMax, coverImage, status (`DRAFT`/`PUBLISHED`/`CANCELLED`), createdById |
| `event_participants` | eventId, userId, **status** (`PENDING`/`YES`/`NO`/`MAYBE`), adultsExtra, childrenExtra, **sleepsOver**, **nightFrom / nightTo**, arrivalAt, departureAt, comment, respondedAt — **unique(eventId, userId)** |
| `event_activities` | eventId, title, description, startAt, durationMin, location, order |
| `activity_participants` | activityId, userId — unique(activityId, userId) |
| `event_items` | eventId, label, category, **slotsNeeded**, unit, notes |
| `event_item_claims` | itemId, userId, quantity — **unique(itemId, userId)** ← « éviter les doublons » (§10) garanti par la base |

Le compteur « 2 personnes sur 2 » se déduit de `count(claims) / slotsNeeded` : pas de compteur dénormalisé, donc pas de désynchronisation possible.

### 4.3 Séjours et occupation

| Table | Champs principaux |
|---|---|
| `stay_requests` | requesterId, arrivalDate, departureDate, adults, children, purpose, comment, specialNeeds, **exclusive**, **status** (`PENDING`/`ACCEPTED`/`REJECTED`/`CANCELLED`), decidedById, decidedAt, decisionNote, rulesAcceptedAt |
| `stays` | houseId, **requestId** (nullable), userId, startDate, endDate, adults, children, exclusive, **isOwnerStay**, privacyLevel (`HIDDEN`/`BUSY_ONLY`/`FULL`), status (`CONFIRMED`/`CANCELLED`/`COMPLETED`) |
| `stay_guests` | stayRequestId ou stayId, name, isChild |
| `space_assignments` | stayId, spaceId, from, to — **table créée, UI post-MVP** (§14, §15) |
| `blocked_periods` | houseId, startDate, endDate, label, reason, type (`MAINTENANCE`/`PERSONAL`/`OTHER`), createdById |

> **Choix : `stay_requests` et `stays` séparés.** La demande est un *dossier* (historique, motif, refus, échanges) ; le séjour est une *occupation du calendrier*. Les séparer permet à Solenne de bloquer ses propres séjours sans se faire une demande à elle-même (`isOwnerStay`, `requestId = null`), et conserve l'historique des refus (§19) sans polluer le calendrier.

### 4.4 Communication et traçabilité

| Table | Champs principaux |
|---|---|
| `notifications` | userId, type, title, body, entityType, entityId, payload, readAt |
| `notification_deliveries` | notificationId, **channel** (`INAPP`/`EMAIL`/`WHATSAPP`), status, sentAt, error |
| `notification_preferences` | userId, type, channels[] |
| `comments` | **entityType** (`EVENT`/`STAY_REQUEST`), entityId, authorId, body, editedAt, deletedAt |
| `audit_logs` | actorId, action, entityType, entityId, diff (json), ip, createdAt (§26) |

Écarts assumés par rapport à la liste §25 : `roles` est un enum + une table de capacités plutôt qu'une table (2 rôles au départ) ; `rooms` + `offices` fusionnent en `spaces` ; s'ajoutent `notification_deliveries`, `audit_logs`, `booking_settings` et `space_assignments`, exigés respectivement par §16, §26, §13 et §27.

---

## 5. Liste des écrans — 12 écrans

> Révision du 21 août 2026. La première version en comptait 28 : elle décrivait en réalité **deux applications parallèles**, une pour les amis et une pour Solenne. C'était une erreur de conception — elle double le code, double les tests, et oblige Solenne à apprendre deux interfaces.
>
> Principe retenu : **une seule application dont les écrans s'enrichissent selon le rôle.** Solenne ne va pas dans un back-office pour modifier un événement : elle clique sur l'événement et l'édite là où il est.

| # | Écran | Rôle | Ce qu'il contient |
|---|---|---|---|
| 1 | **Connexion** | public | Email + mot de passe. Mot de passe oublié et réinitialisation sont des **états** de cette page, pas des écrans |
| 2 | **Invitation** `/invitation/<token>` | public | « Solenne vous invite chez elle 🌿 » → mot de passe → profil, en 2 étapes |
| 3 | **Accueil** | les deux | Ami : prochain événement, prochain séjour, état de la maison, à venir (§21). Solenne : les mêmes blocs **plus** « 2 demandes à traiter » en tête |
| 4 | **Agenda** | les deux | Segments Mois / Semaine / Liste. La vue Liste porte les grandes cartes photo des événements (§20). Solenne y bloque des dates au cliquer-glisser et crée ses séjours personnels |
| 5 | **Événement** | les deux | RSVP (dont « je dors sur place », D3), participants, programme des activités, « à apporter », infos pratiques, fil de discussion. Solenne édite en place |
| 6 | **Éditeur d'événement** | Solenne | Création et modification dans un seul formulaire plein écran : infos, activités, liste à apporter, invités |
| 7 | **Séjours** | les deux | Ami : mes demandes et mes séjours. Solenne : segments « À traiter » / « À venir » / « Historique » |
| 8 | **Demander un séjour** | les deux | Assistant en 3 étapes, disponibilité en direct, case exclusivité (D2), acceptation des règles, rappel « soumis à l'accord de Solenne » |
| 9 | **La Maison** | les deux | Photos, chambres, bureaux, équipements **et règles de la maison**. Solenne édite en place |
| 10 | **Profil** | les deux | Infos, photo, enfants, préférences de notification |
| 11 | **Gérer** | Solenne | Console à onglets : Utilisateurs & invitations · Maison · Règles · Paramètres de réservation |
| 12 | **Historique** | Solenne | Anciens séjours, événements passés, demandes refusées et annulées, filtres date/utilisateur/statut (§19), journal d'audit |

**Ce qui n'est plus un écran mais un panneau superposé** — sur mobile, une feuille qui monte du bas, donc sans perte de contexte :

- notifications (tiroir depuis l'en-tête) ;
- détail d'un séjour et détail d'une demande, **avec le verdict du moteur de disponibilité en clair** pour Solenne (« ✅ Compatible — 6 personnes déjà prévues sur 25 » / « ⚠️ Chevauche une période bloquée ») ;
- acceptation des règles de la maison (modale à la confirmation d'un séjour) ;
- réponse rapide à un RSVP depuis l'agenda.

**Navigation mobile** (priorité §20) : barre basse à **5 onglets** — Accueil · Agenda · Séjours · Maison · Profil. Solenne voit un 6ᵉ onglet « Gérer », avec une pastille sur le nombre de demandes en attente.

> Précision honnête : passer de 28 à 12 écrans ne divise pas le temps de développement par deux — une partie du travail se déplace vers des composants plus riches et des états conditionnels. Le gain réel est la suppression de l'interface d'administration dupliquée (≈ 3–4 j), et surtout : moins de code à maintenir, moins de chemins à tester, et une prise en main immédiate pour Solenne.

**Direction artistique** : palette lin / olive / terracotta / bois, une police à empattements pour les titres (Fraunces ou Instrument Serif) et une sans-serif lisible pour le corps, coins arrondis généreux, ombres douces, la photo de la maison en fil rouge. Zéro tableau de données dans l'espace ami.

---

## 6. Parcours utilisateurs

**A. Un ami est invité**
Solenne saisit un email → l'ami reçoit « Solenne vous invite chez elle » → il clique, choisit un mot de passe, ajoute prénom / photo / téléphone → il arrive sur l'accueil avec le prochain événement déjà visible. *Objectif : moins de 90 secondes, entièrement au pouce.*

**B. Un ami demande un séjour**
Accueil → « Demander un séjour » → il choisit ses dates dans un calendrier qui montre déjà les jours bloqués → nombre d'adultes / enfants → motif et commentaire → *« Il reste de la place, mais Marc sera là avec sa compagne ce week-end »* → il coche les règles de la maison → envoi → « Votre demande sera envoyée à Solenne et ne sera confirmée qu'après son accord » → notification à l'acceptation.

**C. Solenne traite une demande**
Notification → tableau de bord, « 2 demandes en attente » → détail : le demandeur, ses dates, **le verdict du moteur** (« ✅ Compatible — 4 personnes déjà prévues, capacité 12 » ou « ⚠️ Chevauche l'anniversaire de Léa ») → Accepter (message optionnel) / Refuser (motif) / Proposer d'autres dates → le séjour apparaît au calendrier, l'ami est notifié.

**D. Solenne crée un événement**
Titre, dates, photo, capacité → programme heure par heure → liste « à apporter » (viande ×2, dessert ×2, pain ×1) → sélection des invités → publication → chacun reçoit son invitation.

**E. Un ami s'inscrit à un événement**
Notification → carte de l'événement → « Je viens » + 1 adulte, 2 enfants, arrivée vers 18 h → il voit qui vient → il clique « Je m'en charge » sur *Dessert* → son nom s'affiche, le créneau se ferme quand il est complet → il écrit « J'apporte aussi une enceinte » dans le fil.

**F. Un séjour est annulé**
L'ami annule → Solenne est notifiée → les dates redeviennent disponibles → si un autre ami avait été refusé faute de place sur ces dates, Solenne voit une suggestion « Ces dates se libèrent, prévenir Jean ? ».

---

## Étape 3 — MVP

## 7. Périmètre du MVP

Les 12 points exigés au §29 sont **tous** dans le MVP. Sont repoussés : affectation des chambres, réservation des bureaux, WhatsApp, album photo, cagnotte, ménage, clés, météo, synchronisation Google/Apple Calendar, multi-maisons (§27) — l'architecture les accueille sans refonte.

### Découpage en 8 lots livrables

| Lot | Contenu | Livrable vérifiable | Charge |
|---|---|---|---|
| **0 — Fondations** | Repo + git, Next.js/TS, Prisma, PostgreSQL, Vercel, CI, design tokens, layout, jeu de données de démo | Une page en ligne, aux bonnes couleurs, connectée à la base | ½ session |
| **1 — Identité** | Auth.js, invitations à token, réinitialisation, profils, rôle unique ADMIN (D5), gardes serveur | Solenne invite quelqu'un, il crée son compte et se connecte | ½ session |
| **2 — Maison & agenda** | Fiche maison, chambres, bureaux, règles, périodes bloquées, agenda mois/semaine/liste, filtre « Maison occupée » (D4) | Un ami ne voit que « Maison occupée » ; Solenne voit tout | 1 session |
| **3 — Séjours ★** | Moteur de disponibilité + tests, capacité 1→25 (D1), exclusivité (D2), demande, file d'attente, acceptation/refus, annulations, transactions | Bout en bout : demande → validation → apparition à l'agenda | 1–1,5 session |
| **4 — Événements** | CRUD, invités, RSVP oui/non/peut-être, accompagnants, **« je dors sur place » (D3)**, capacité, annulation/déplacement | Solenne crée un événement, un ami répond et réserve sa nuit | 1 session |
| **5 — Vie de l'événement** | Programme des activités, liste « à apporter » + « Je m'en charge » anti-doublon, fil de discussion | Deux amis se partagent la liste sans conflit | ½–1 session |
| **6 — Notifications** | Bus multi-canal, in-app + email (Resend sur chezsolenne.fr), préférences, rappels | Chaque événement du §16 déclenche la bonne notification | ½–1 session |
| **7 — Finition** | Accueil personnalisé, historique et filtres, états vides / chargement / erreurs, passe responsive, accessibilité, journal d'audit, documentation | Recette complète des 6 parcours sur un vrai téléphone | 1 session |

**≈ 6 à 8 sessions de travail.** Une « session » = une passe de développement suivie d'une relecture de votre part.

### 7.1 Temps calendaire réel

Le code n'est pas le facteur limitant. Ce qui gouverne la date de mise en service :

| Contrainte | Nature | Ordre de grandeur |
|---|---|---|
| Achat de `chezsolenne.fr`, comptes Vercel / Neon / Resend | Connexions interactives, **votre côté** | 1 h |
| Vérification DNS de l'expéditeur email | Attente technique, bloque la 1ʳᵉ invitation | 1 à 24 h |
| Vos relectures et arbitrages de ton | Irréductible, c'est là que le produit se joue | quelques heures réparties |
| Photos de la maison, chambres, bureaux, règles rédigées | **Votre côté — souvent le vrai goulot** | à préparer pendant les lots 0–1 |
| Corrections issues de l'usage réel | 2–3 allers-retours après le palier 1 | quelques heures |

| Palier | Lots | Disponible en |
|---|---|---|
| **1 — Exploitable** (inviter, agenda, demander et valider un séjour) | 0 → 3 | **le jour même ou le lendemain** de la création des comptes |
| **2 — MVP complet** (§29 intégralement) | 4 → 6 | **quelques jours à une semaine** |
| **3 — Poli** | 7 | **≈ une semaine et demie au total** |

**Recommandation : mettre le palier 1 en ligne pour de vrai**, avec Solenne et deux ou trois amis pilotes. Les demandes de séjour sont le besoin le plus immédiat et le plus autonome ; les événements peuvent rester sur WhatsApp encore quelques jours. L'usage réel corrigera des choses qu'aucune spécification ne révèle.

Le lot 3 est le plus risqué : il concentre tous les cas limites du §30 et les modifications Yassine. J'y écris les tests **avant** l'UI.

### Couverture des cas limites du §30

| Cas | Traitement |
|---|---|
| Deux demandes sur les mêmes dates | Autorisé si la capacité le permet (règle Yassine) ; sinon refus motivé « Capacité atteinte » |
| Acceptation concurrente | Transaction sérialisable + contrainte d'exclusion PostgreSQL (§3.5) |
| Un utilisateur annule son séjour | Statut `CANCELLED`, capacité libérée, Solenne notifiée, suggestion de relance |
| Solenne annule un séjour | Motif obligatoire, notification à l'intéressé, historique conservé |
| Événement déplacé / annulé | Les RSVP repassent en `PENDING` (déplacement) ; tous les inscrits sont notifiés |
| Un invité change sa réponse | Autorisé jusqu'au début ; historique dans l'audit |
| Capacité d'événement dépassée | Compteur incluant les accompagnants ; liste d'attente ou refus selon le réglage |
| Personne plus autorisée | `status = DISABLED` : sessions invalidées, séjours futurs à arbitrer, données conservées |
| Date bloquée après une demande | Les demandes en attente concernées sont signalées en rouge à Solenne |
| Demande sur une période occupée | Verdict du moteur affiché à Solenne avant décision |

---

## 8. Points ouverts

Les huit questions initiales ont été tranchées le 21 août 2026 : voir **§0 Décisions arrêtées**. Il ne reste que :

- **WhatsApp (§16)** — confirmé **post-MVP**. L'API Business impose une validation Meta et un coût par message ; le bus de notification est prêt à l'accueillir (`notification_deliveries.channel`), le canal n'est pas branché.

### 8.1 Ce dont j'ai besoin de votre part pour démarrer

| Quand | Quoi |
|---|---|
| Avant le lot 0 | Rien — je peux monter les fondations en local |
| Avant la mise en ligne | Achat de **chezsolenne.fr**, comptes **Vercel**, **Neon** et **Resend** (connexions interactives : à faire depuis cette session avec `! <commande>`, ou par vous dans le navigateur) |
| Avant la 1ʳᵉ invitation | Enregistrements **DNS** de `chezsolenne.fr` chez Resend (1 à 24 h de validation) |
| Pendant les lots 0–1 | **Photos de la maison**, description des chambres et des bureaux, **règles rédigées par Solenne**, liste des premiers amis à inviter |

---

## 9. Prochaine étape

Sur validation de ce document — ou après vos annotations `{Modification Yassine}` — j'enchaîne sur le **lot 0 (Fondations)** puis le **lot 1 (Identité)**, en livrant lot par lot et en vérifiant l'impact sur l'existant avant chaque changement structurant (§31).
