# Lot 2 — Maison & Agenda · rapports de fin de module

Rattaché à `Mode Operatoire.md` v1.11 · fiches `Mode Operatoire - Detail/Lot2-Maison-Agenda.md`.

| Module | Cas de la fiche | Vérifications | Réussis | Échoués | Restants |
|---|---|---|---|---|---|
| `HOUSE` | 20 | 86 | 86 | 0 | 0 |
| `SPACE` | 12 | 35 | 35 | 0 | 0 |
| `BLOCK` | 14 | 52 | 52 | 0 | 0 |
| `PRIV` | 20 | 58 | 58 | 0 | 4 |
| `CAL` | 16 | 164 | 164 | 0 | 0 |
| **Total** | **82** | **395** | **395** | **0** | **4** |

`BLOCK-011` — le cliquer-glisser sur l'agenda — était le cas restant de `BLOCK` : il est **joué et au vert** au module `CAL`, où l'agenda existe enfin.
Les quatre cas restants de `PRIV` — `PRIV-008`, `013`, `014`, `015` — portent tous sur des **événements** ou des **notifications**, c'est-à-dire sur les lots 4 et 6, reportés en vague 2.

Régression complète en fin de lot : **1 min 59 s** — 599 vérifications Vitest (44 s) et 454 Playwright sur 320 / 768 / 1440 px (1 min 15 s, compilation de production comprise). Six vérifications Playwright sont volontairement sautées hors 320 px : deux mesures propres au petit écran et l'écriture de `BLOCK-011`, qui ne doit pas être jouée par trois navigateurs sur les mêmes dates.

---

## MODULE : HOUSE — Maison, capacité et règles

Livré en **trois arrêts**, à la demande de Yassine : informations et photos · capacité · règles.

### Fonctionnalités réalisées

**Arrêt 1 — informations et photos**
- Fiche de la maison : nom affiché, description, commune ou adresse. Le nom est une **donnée**, jamais un texte en dur.
- Galerie : téléversement, ordre, désignation de la photo d'accueil, retrait avec confirmation nommant l'objet (UI-R5).
- Écran `/maison` côté ami, écran `/gerer/maison` côté Solenne.
- Photos redimensionnées à 1 600 px de large et ré-encodées en WebP — le ré-encodage vaut désinfection.
- Les 9 photos de la maison fournies par Yassine entrent dans le jeu de démonstration.

**Arrêt 2 — capacité**
- Capacité paramétrable **1 → 25** (D1), entière, refusée hors bornes quelle que soit la porte d'entrée.
- Refus d'une réduction sous l'occupation confirmée, avec la journée nommée dans le message et **la liste des séjours en cause** à l'écran.
- Conséquences d'un changement affichées : demandes en attente devenues impossibles, demandes refusées redevenues possibles.

**Arrêt 3 — règles de la maison**
- Création, modification, mise en sommeil, réordonnancement. **Aucune suppression** : une règle se désactive.
- Marquage « à accepter avant chaque séjour », visible par un libellé et pas seulement par une couleur.
- Historique complet du texte de chaque règle.

### Règles vérifiées

| Règle | Où elle est tenue |
|---|---|
| HOUSE-R1 | `src/domain/house/capacite.ts` — bornes 1→25, entier, une seule définition pour le formulaire et le serveur |
| HOUSE-R2 | `mettreAJourCapacite` — refus si l'occupation confirmée dépasse la capacité visée |
| HOUSE-R3 | `impactCapacite` — recalcul des demandes en attente et des demandes refusées |
| HOUSE-R4 | `requireRole('ADMIN')` en première ligne des neuf actions d'écriture |
| HOUSE-R5 | Le marquage existe et sort dans la vue ; l'acceptation elle-même appartient à `STAYREQ` (lot 3) |
| HOUSE-R6 | Table `house_rule_versions` — chaque modification dépose une version, aucune n'est écrasée |

### Le test qui compte

`HOUSE-007`. Deux séjours confirmés se chevauchent le 11 septembre : cinq personnes d'un côté, quatre de l'autre. Solenne descend la capacité à 6. Le refus ne dit pas « impossible » : il dit **neuf personnes le vendredi 11 septembre**, et l'écran liste les deux séjours avec les prénoms et les dates. Sans cette liste, Solenne se retrouverait devant une porte close sans savoir quoi déplacer.

Ce test a une conséquence d'architecture, décrite plus bas.

### Problèmes rencontrés

**1. Dépendance inversée entre `HOUSE` et `OCCUP` (P5).** Le §5 fait dépendre `OCCUP` de `HOUSE`. Mais `HOUSE-R2` a besoin de savoir combien de personnes sont attendues — or la règle non négociable n°3 réserve ce calcul à `OCCUP`, qui arrive au lot 3. Circulaire.

Trois issues possibles : compter dans `HOUSE` (interdit), refuser toute réduction jusqu'au lot 3 (absurde), ou poser `OCCUP` maintenant. **Troisième retenue** : le registre de contributeurs du §6.1 est en place dans `src/domain/occupancy/registre.ts`, avec ses trois contributeurs déclarés — `SÉJOUR_CONFIRMÉ` actif, `DORMEUR_ÉVÉNEMENT` et `AFFECTATION_CHAMBRE` dormants et rendant zéro. Le lot 3 le **complète** (contrat `OCCUP-CT-01→08`, sentinelle `OCCUP-024`, 34 cas) plutôt que de le créer. Le garde-fou G3 est déjà éprouvé : un contributeur dormant ne compte pour rien, et l'activer suffira.

**2. `HOUSE-R6` était irréalisable en l'état.** Conserver le texte exactement accepté par un ami suppose un historique ; le modèle du §4 n'en avait pas. Ajout de la table `house_rule_versions` et d'un compteur `version` sur `house_rules` — migration `20260821200000_lot2_versions_regles`, avec son `down.sql` et l'aller-retour vérifié par `SETUP-007`. Le modèle passe à **26 tables**.

**3. Ambiguïté du §6.4 sur l'effectif (P6).** La formule écrit « adultes + enfants + invités ». Or `stay_guests` nomme une à une ces mêmes personnes : Léa déclare 2 adultes et 1 enfant, et l'enfant s'appelle Noé. Les additionner ferait 4 pour une famille de 3. Effectif retenu : **adultes + enfants**, cohérent avec le contrôle R4 déjà présent dans `SETUP-009`. À trancher formellement à l'ouverture d'`OCCUP`.

**4. `P2034` remontait comme un incident technique.** Un conflit de transaction sérialisable affichait « une erreur est survenue » alors qu'il s'agit d'une écriture concurrente. Il est désormais converti en `CONFLICT` — « rechargez la page et réessayez », qui est le bon conseil (grille C6).

**5. Un défaut de rendu invisible aux tests automatiques.** En 320 px, les commandes de chaque photo chevauchaient leur libellé. Aucun test ne le voyait : pas de débordement horizontal, cibles tactiles conformes. Repéré à l'œil sur une capture, corrigé par un passage à la ligne des commandes sous 640 px. À retenir : la campagne responsive mesure, elle ne regarde pas.

### Grille de sécurité S1 → S12

| # | Résultat |
|---|---|
| S1 | `maison()` et `reglesDeLaMaison()` sans session → `UNAUTHENTICATED`. Les écrans redirigent vers la connexion |
| S2 | Un ami sur les neuf actions d'écriture → `FORBIDDEN` + entrée `refus.maison.*` / `refus.regles.*` au journal d'audit |
| S3 / S4 | Sans objet : la maison est unique, il n'y a pas de « donnée d'un autre » |
| S5 / S6 | Les tests d'intégration appellent les Server Actions **directement**, hors de toute interface. Les gardes tiennent |
| S7 | `id` de maison envoyé par le client : ignoré, il n'existe pas dans le schéma d'entrée. Adresse de photo forgée (`/media/../../.env`) : refusée, aucun fichier touché. `capacityMax: 99` glissé dans les informations : ignoré |
| S8 | `/gerer/maison` tapé par un ami → **404**, pas « accès refusé ». Ni le nom de la maison ni un champ de saisie ne transparaissent |
| S9 | La vue destinée aux amis ne contient aucun champ privé. Une règle désactivée **n'est pas envoyée**, elle n'est pas masquée. La vraie épreuve viendra avec `PRIV` |
| S10 | Couvert par `sessionCourante` (lot 1) — aucune surface propre à `HOUSE` |
| S11 | Sans objet : aucun jeton dans ce module |
| S12 | Le téléversement n'est ouvert qu'à Solenne. Pas de limitation de débit spécifique ; disproportionné pour une seule administratrice |

### Grille de concurrence

`C6` — toute écriture de la galerie et le réordonnancement des règles passent par une transaction **sérialisable** : deux téléversements simultanés ne peuvent plus s'écraser. Un conflit remonte en `CONFLICT`. Les fichiers ne sont effacés du disque qu'**après** accord de la base ; l'inverse laisserait la galerie pointant vers des images disparues.

### Impact sur les autres modules

- `OCCUP` (lot 3.1) : à compléter, plus à créer. Le contrat `occupationParJour` / `joursAuDela` / `tientDansLaCapacite` est posé et testé.
- `SPACE` (lot 2.2) : consomme la capacité pour son avertissement de cohérence ; les 6 photos de chambres et de bureaux sont prêtes dans `Photos/`.
- `STAYREQ` (lot 3.4) : l'acceptation d'une règle devra pointer vers `house_rule_versions`, pas vers `house_rules`.
- `POLICY` (lot 3.3) : `booking_settings.maxGuests` duplique la capacité de la maison. À réconcilier — deux sources de vérité pour le même chiffre est un défaut à corriger avant le lot 3.

### Décisions à confirmer par Yassine

1. **Les 15 photos sont-elles définitives ?** Si oui, `DEPLOY-013` peut être levé. Si ce sont des images d'essai, le blocage de mise en ligne reste.
2. **Les chambres changent de nom.** Les photos annoncent *blanche, jaune, mansardée, verte* et deux bureaux nommés *Julien* et *Solenne* — là où le contenu provisoire disait *bleue, verte, ocre, mansardée* et *Bureau 1 / Bureau 2*. J'adopterai les noms des photos au module `SPACE`, sauf indication contraire.
3. **Les originaux dans `Photos/` doivent-ils entrer dans le dépôt ?** Sans eux, le jeu de démonstration démarre sans image sur une autre machine. Environ 8 Mo.

---

## MODULE : SPACE — Chambres et bureaux

Livré en **un seul arrêt** : le module est court et sa règle unique — le repère entre couchages et capacité — ne se découpe pas.

### Fonctionnalités réalisées

- Création, modification, mise en sommeil et réordonnancement des espaces. **Aucune suppression** : un espace se désactive et reste dans l'historique (`SPACE-R4`).
- Chambre ou bureau (`SPACE-R1`) : le formulaire n'affiche **pas** de champ « couchages » pour un bureau — il n'est pas grisé, il n'est pas là.
- Type de lit, nombre de couchages, équipements, description, galerie de 10 photos par pièce, photo mise en avant.
- Avertissement de cohérence couchages ↔ capacité dans la console de Solenne : une phrase, jamais un blocage (`SPACE-R3`).
- Écran `/maison` : cartes photo distinguant la chambre du bureau par une icône **et** un mot. Écran `/gerer/maison` : la console.
- Les **6 photos de chambres et de bureaux** rejoignent le jeu de démonstration ; les chambres prennent les noms des photos (voir plus bas).

### Règles vérifiées

| Règle | Où elle est tenue |
|---|---|
| SPACE-R1 | `schemaEspace` — `ROOM` ou `OFFICE`, un type inventé est rejeté |
| SPACE-R2 | Même schéma — un bureau à `sleeps > 0` est refusé, y compris par appel forgé |
| SPACE-R3 | `coherenceCouchages()` — calcul pur, affiché par la console. **Aucune écriture n'est jamais refusée pour cette raison** |
| SPACE-R4 | `activerEspace` — l'espace reste en base, invisible des amis, visible de Solenne |
| SPACE-R5 | Aucune action n'écrit `space_assignments`. La table existe, l'interface n'existe pas — c'est une décision, pas un oubli |

### Le test qui compte

`SPACE-006`. Capacité 8, quatorze couchages déclarés. Rien ne bloque : l'espace se crée, la capacité ne bouge pas, et Solenne lit « les chambres totalisent 14 couchages pour une capacité de 8 personnes : 6 de plus que de places. C'est un repère, rien n'est bloqué. » C'est exactement l'inverse de `HOUSE-R2`, qui refuse. Deux chiffres voisins, deux régimes opposés — les confondre aurait donné à Solenne un verrou dont personne n'a besoin.

### Problèmes rencontrés

**1. Aucun défaut de spécification.** Le module s'est écrit sur les fondations du précédent : gardes, audit, transactions sérialisables, galerie. Une seule retouche de code existant — `ajouterPhoto()` prend désormais sa borne en paramètre, la maison en tolère 30, une pièce 10.

**2. Un second défaut de rendu invisible aux mesures.** En 768 px, la carte du canapé-lit — seule pièce sans photo — s'étirait à vide à côté de sa voisine illustrée : la grille alignait les hauteurs, pas les contenus. Aucun test ne le voyait, exactement comme au module `HOUSE`. Repéré sur une capture, corrigé par une vignette de repli à l'icône de la pièce. La leçon du rapport précédent tient : **la campagne responsive mesure, elle ne regarde pas** — les captures `Rapports/apercus-lot2/` sont désormais produites par `tests/e2e/apercus.spec.ts`, à jour à chaque campagne.

**3. Les chambres ont changé de nom**, comme annoncé au rapport `HOUSE`. Le jeu de démonstration décrit maintenant *blanche, jaune, verte, mansardée* et les bureaux *de Julien* et *de Solenne*, plus le canapé-lit du salon — seule pièce sans photo, ce qui vérifie au passage qu'une photo absente ne casse rien.

### Grille de sécurité S1 → S12

| # | Résultat |
|---|---|
| S1 | `espacesDeLaMaison()` sans session → `UNAUTHENTICATED` |
| S2 | Un ami sur les **sept** actions d'écriture → `FORBIDDEN`, aucune écriture, entrée au journal d'audit |
| S3 / S4 | Sans objet : un espace n'appartient à personne. Un identifiant d'espace inconnu → `NOT_FOUND`, sans confirmer quoi que ce soit |
| S5 / S6 | Les tests appellent les Server Actions **directement**, hors interface. Les gardes tiennent |
| S7 | `houseId` n'existe dans aucun schéma d'entrée : la maison est unique, elle se lit en base. Un bureau à `couchages: 2` est refusé au niveau du schéma. Une adresse de photo forgée ne désigne rien : le retrait n'accepte qu'une URL déjà présente dans la galerie de **cet** espace |
| S8 | `/gerer/maison` réservé à Solenne (`requireRole`), inchangé depuis `HOUSE` |
| S9 | Un espace en sommeil **n'est pas envoyé** aux amis. La charge utile ne contient aucun champ privé |
| S10 / S11 / S12 | Aucune surface propre à `SPACE` — session, jetons et débit relèvent du lot 1 ; le téléversement n'est ouvert qu'à Solenne |

### Grille de concurrence

`C6` — toute écriture de galerie et le réordonnancement des espaces passent par une transaction **sérialisable**, lecture comprise ; un conflit remonte en `CONFLICT`. Un fichier téléversé puis refusé par la base (galerie pleine, espace disparu, écriture concurrente) est effacé du disque. `C1` à `C5` sont sans objet : aucune ressource rare ne se dispute ici.

### Impact sur les autres modules

- `STAYASSIGN` (post-MVP) : le contrat de la table `space_assignments` reste intact, aucune écriture ne l'a préemptée.
- `OCCUP` (lot 3.1) : le contributeur `AFFECTATION_CHAMBRE` reste dormant. `SPACE` ne compte personne — il décrit des lits, ce qui n'est pas la même chose.
- `CAL` / `PRIV` (lot 2.4 et 2.5) : rien à reprendre, `SPACE` n'expose aucune donnée datée.

### Décisions à confirmer par Yassine

1. **Le canapé-lit du salon est-il une vraie couchette ?** Il compte pour 2 des 10 places de la maison, mais aucune photo ne l'accompagne. S'il n'existe pas, la capacité provisoire tombe à 8 pour 8 couchages — et l'avertissement de cohérence disparaît de la console.

---

## MODULE : BLOCK — Périodes bloquées

Livré en **un seul arrêt** : 14 cas, une seule idée — quand Solenne ferme la maison, elle est fermée.

### Fonctionnalités réalisées

- Création, modification et levée d'une période bloquée : dates, libellé, motif privé, nature (travaux · personnel · autre).
- **Refus** d'un blocage posé sur un séjour confirmé, avec le nom de la personne et les dates du séjour à annuler d'abord, puis la liste complète à l'écran (BLK-R3).
- **Acceptation** d'un blocage posé sur une demande en attente, la demande étant signalée en terracotta sur la période (BLK-R4).
- Un blocage dans le passé est autorisé et marqué « Passée » — l'historique a le droit d'exister.
- Deux blocages peuvent se chevaucher sans effet de bord ; côté ami, ils ne font qu'une seule bande.
- Console de Solenne dans `/gerer/maison`. La levée d'un blocage passe par une confirmation qui **nomme** la période et ses dates (UI-R5).

### Règles vérifiées

| Règle | Où elle est tenue |
|---|---|
| BLK-R1 | `verifierPeriodeLibre` (`src/server/blocages.ts`) — écrite **une fois**, pour que `AVAIL`, `STAYREQ` et `STAYDEC` la consomment au lieu d'en avoir chacun leur version |
| BLK-R2 | Aucune contrainte d'unicité, aucun refus : deux blocages qui se recouvrent sont deux lignes. `fusionnerPeriodes` s'occupe de l'affichage |
| BLK-R3 | `refuserSiSejourConfirme`, appelée **dans** la transaction d'écriture — pas avant |
| BLK-R4 | `demandesEnAttenteSur` — la demande est signalée, jamais refusée ni modifiée |
| BLK-R5 | `src/domain/house/blocages.ts` — un blocage du 10 au 12 laisse arriver le 12 (BLOCK-012) |
| BLK-R6 | `requireRole('ADMIN')` en première ligne des six actions du module |

### Le test qui compte

`BLOCK-C05`. Solenne bloque une période au moment exact où un séjour est confirmé sur les mêmes dates. Les deux écritures partent ensemble ; **exactement une** aboutit, l'autre échoue en français. Le test ne vérifie pas laquelle gagne — l'ordre n'a pas d'importance — mais qu'il ne reste jamais un séjour confirmé sous une maison fermée.

C'est le premier test de concurrence réelle du projet : deux transactions sérialisables qui se croisent, avec la lecture *à l'intérieur* de la transaction. Vérifier la disponibilité puis écrire, en deux temps, aurait laissé passer les deux. Le même schéma servira à `STAYDEC` au lot 3, où la contention sera la règle et non l'exception.

### Problèmes rencontrés

**1. `BLOCK-011` suppose un agenda qui n'existe pas encore.** Le cas demande de créer un blocage **au cliquer-glisser sur l'agenda** ; or l'agenda est le module `CAL`, deux crans plus loin dans le même lot. Trois issues : inventer un mini-calendrier jetable, retirer le cas, ou le déplacer. **Déplacé** : le cas reste dans la fiche et sera joué à `CAL`, où le geste aura une surface. En attendant, la saisie se fait par deux champs de date. C'est le seul des 14 cas qui n'est pas au vert.

**2. `BLK-R1` n'a encore personne à refuser.** Un blocage interdit toute demande de séjour — mais `STAYREQ` arrive au lot 3. Même parti qu'au module `HOUSE` avec `OCCUP` : la règle est écrite maintenant, à un seul endroit (`verifierPeriodeLibre`), et vérifiée directement par `BLOCK-006`. Le lot 3 l'appellera ; il n'aura pas à la réécrire, et le jour où elle changera, elle changera partout.

**3. Le refus de `BLK-R3` n'avait pas de code.** Le §12.4 en prévoit onze, aucun ne dit « un séjour occupe déjà ces dates ». `BLOCKED_PERIOD` aurait été le contresens exact — il désigne le refus **inverse**, celui opposé à l'ami. Ajout de `BLOCKED_OVER_STAY` ; le catalogue passe à 41 messages.

**4. Un troisième défaut de rendu invisible aux mesures.** En 320 px, le libellé « Ramonage et entretien de la chaudière » se coupait en plein mot — « Ramonag / e et entretien de la / chaudièr / e » — écrasé par le badge posé à sa droite. Aucun test ne le voyait : pas de débordement, cibles conformes, titre borné. Repéré sur la capture, corrigé en donnant au titre toute sa ligne sous 640 px.

Troisième occurrence de la même leçon en trois modules. Correctif de méthode : `tests/e2e/apercus.spec.ts` produit désormais, en plus des pages entières, une capture **cadrée sur la section livrée** — une page de trois mètres de haut ne se regarde pas, une section se regarde.

**5. La confidentialité ne se filtre pas, elle se sépare.** Un ami et Solenne ne lisent pas la même liste filtrée : ce sont **deux actions distinctes**. `periodesIndisponibles()` ne renvoie que des dates, fusionnées — elle ne dit même pas combien de blocages existent, ni de quelle nature. `blocages()` est réservée à Solenne. Une seule fonction avec un `if` aurait suffi à ce que le motif parte un jour par mégarde.

### Grille de sécurité S1 → S12

| # | Résultat |
|---|---|
| S1 | `periodesIndisponibles()` et `blocages()` sans session → `UNAUTHENTICATED` |
| S2 | Un ami sur les quatre écritures et sur `blocages()` → `FORBIDDEN`, aucune écriture, entrée `refus.blocages.*` au journal d'audit |
| S3 / S4 | Sans objet : un blocage n'appartient à personne d'autre qu'à Solenne. Un identifiant inconnu → `NOT_FOUND`, sans confirmer quoi que ce soit |
| S5 / S6 | Les tests appellent les Server Actions **directement**, hors interface. Les gardes tiennent |
| S7 | `houseId` glissé dans la création : ignoré, la maison est lue en base. Un type inventé (`VACANCES`) est rejeté par le schéma. Une date qui n'en est pas une (`32/12/2026`) est rejetée avant tout accès à la base |
| S8 | `/gerer/maison` réservé à Solenne, inchangé depuis `HOUSE` |
| S9 | **Le cas du module.** Un blocage « Week-end en famille — Anniversaire de Julien » parvient à un ami sous la forme `{ du, au }`. Vérifié sur la charge utile sérialisée : ni le libellé, ni le motif, ni la nature, ni l'identifiant n'y figurent. Le refus opposé à une demande dit « ces dates ne sont pas disponibles » et rien de plus |
| S10 / S11 / S12 | Aucune surface propre à `BLOCK` — session, jetons et débit relèvent du lot 1 |

### Grille de concurrence

`C5` — **le point de contention annoncé au §8.** Vérification et écriture partagent une transaction **sérialisable** : une confirmation de séjour concurrente ne peut plus se glisser entre le contrôle et l'insertion (`BLOCK-C05`). `C6` — deux blocages posés au même instant remontent un `CONFLICT` lisible, jamais un incident technique. `C1` à `C4` sont sans objet.

### Impact sur les autres modules

- `AVAIL` (lot 3.2) : la règle R1 est écrite et testée. `AVAIL` l'appelle, il ne la réécrit pas.
- `STAYREQ` / `STAYDEC` (lot 3.4 et 3.5) : `verifierPeriodeLibre` est le point d'entrée ; `BLOCK-006` sera rejoué à travers le vrai parcours de demande.
- `CAL` (lot 2.5) : consomme `periodesIndisponibles()` — des bandes déjà fusionnées, prêtes à peindre. **`BLOCK-011` y est dû.**
- `DASH` (vague 2) : la fiche voulait la demande signalée « en rouge sur le tableau de bord », qui n'existe pas dans la vague 1. Le signalement est donc porté par la console des blocages. À reprendre le jour où `DASH` arrive.

### Décisions à confirmer par Yassine

1. **Un blocage se supprime pour de bon** — contrairement à une règle ou à une chambre, qui se mettent en sommeil. Un blocage levé n'a rien à raconter, et sa trace reste au journal d'audit. Si vous préférez le voir barré plutôt que disparu, dites-le maintenant : après `CAL`, ce sera une migration.

---

## MODULE : PRIV — Confidentialité

**Statut : ✅ VALIDÉ** · module de sécurité prioritaire n°2 · livré en **un seul arrêt**.

C'est le module qui porte la promesse centrale du produit — **D4 : un ami voit « Maison occupée », rien d'autre**.

### Fonctionnalités réalisées

- Trois niveaux de visibilité par séjour : **Invisible** (`HIDDEN`), **Maison occupée** (`BUSY_ONLY`, le défaut), **Prénom et nombre de personnes** (`FULL`).
- Réglage **global** — le niveau que prendront les prochains séjours — et réglage **par séjour**, dans la console de Solenne (`/gerer/maison`).
- Écran `/agenda` côté ami : bandes « Maison occupée » fusionnées, ses propres séjours en entier, ses propres demandes en attente.
- Chaque catégorie se distingue par une **icône et un mot**, jamais par la seule couleur.
- Sous chaque choix, Solenne lit en une phrase ce que le niveau donne à voir — elle décide sans deviner.

### Règles vérifiées

| Règle | Où elle est tenue |
|---|---|
| PRIV-R1 | `vueDesSejours` — un séjour `BUSY_ONLY` d'autrui ne produit qu'une `Periode { du, au }`. Il n'a pas de nom à perdre : il n'en a jamais reçu |
| PRIV-R2 | Le type de sortie est une **union** : `SejourNomme` n'a pas de champ `commentaire`. Le compilateur tient une part de la promesse |
| PRIV-R3 | `sejoursDetailles()` — réservée à Solenne, y compris les séjours `HIDDEN` |
| PRIV-R4 | `detailler()` — le propriétaire passe avant le niveau, quel que soit celui-ci |
| PRIV-R5 | `vueDesSejours` saute le séjour `HIDDEN` ; `toutesLesPresences` (`OCCUP`) le compte quand même. **Compter n'est pas montrer** |
| PRIV-R6 | Aucun décompte de places à l'écran, vérifié sur le texte rendu. Les identifiants sont des `cuid`, non séquentiels |
| PRIV-R7 | Sans objet en vague 1 : les événements arrivent au lot 4 |

### Le test qui compte

`PRIV-005`. Capacité 10, un séjour **caché** de 8 personnes. L'agenda de l'ami ne montre rien du tout — ni bande, ni date. Et pourtant une venue à 4 ne tient pas : le séjour caché est bien compté. Le refus, lui, ne dit ni pourquoi, ni combien, ni qui.

C'est le point exact où les deux moitiés du module se rejoignent : le séjour est invisible **et** il occupe. Si le refus s'était justifié, l'ami aurait reconstitué par soustraction ce que `HIDDEN` venait de lui cacher. La confidentialité ne tient pas dans la vue, elle tient jusque dans les messages d'erreur.

Le test éprouve les deux moitiés à leur source — la vue par `occupationDuCercle()`, le décompte par `OCCUP`, le message par le catalogue. Le parcours complet, où un ami se voit vraiment refuser sa demande, sera rejoué à `STAYREQ` (lot 3.4) : c'est là que le formulaire existera.

### Problèmes rencontrés

**1. Le message `CAPACITY_EXCEEDED` du §12.4 était une fuite.** Le catalogue écrivait « La maison serait à **{n}** personnes pour **{max}** places ». Ce message part vers un **ami**. Les deux nombres lui apprennent exactement combien de personnes occupent déjà la maison — y compris celles d'un séjour `HIDDEN`, qu'il n'a précisément pas le droit de deviner. Un refus qui se justifie chiffre ce qu'il refuse.

Corrigé : « La maison n'a plus assez de place sur ces dates. Essayez d'autres dates. » Le refus est le même, il ne se justifie plus. Le détail chiffré revient à `STAYDEC` (lot 3), **sur l'écran de Solenne**, où il est légitime et même nécessaire. C'est le seul des 11 refus du §12.4 modifié depuis le début du projet.

**2. Le motif et le commentaire ne vivent pas sur le séjour.** Ils appartiennent à la **demande** — un séjour créé directement par Solenne n'en a pas. Le sérialiseur les lit donc à travers la relation `request`, en acceptant qu'ils soient absents. Sans cela, `PRIV-002` aurait montré à Solenne un séjour amputé de son motif.

**3. Solenne appelant la vue du cercle reçoit la vue du cercle.** `occupationDuCercle()` force `estAdministratrice: false`, même pour elle. C'est délibéré et c'est du refus par défaut appliqué dans l'autre sens : **c'est l'action qui décide de ce qu'elle envoie, pas l'appelant de ce qu'il mérite**. Une action qui s'adapte à son appelant est une action dont on ne peut plus rien prouver.

**4. Quatre cas sur vingt ne sont pas jouables en vague 1.** `PRIV-008`, `013`, `014` (événements, lot 4) et `PRIV-015` (notifications, lot 6). Aucun n'est écarté : ils restent dans la fiche, à jouer quand leur objet existera. Ils sont signalés ici pour qu'ils ne se perdent pas — c'est la même comptabilité que `BLOCK-011`.

**5. Aucun défaut de rendu, pour la première fois en quatre modules.** La leçon des trois précédents a servi : la section a été cadrée et regardée avant d'être déclarée finie. Les captures `confidentialite-*` et `agenda-ami-*` sont dans `Rapports/apercus-lot2/`, aux trois tailles — **rendu approuvé par Yassine le 22/08/2026 (L2 levée pour le lot 2)**.

### Grille de sécurité S1 → S12

| # | Résultat |
|---|---|
| S1 | Les six actions sans session → `UNAUTHENTICATED` |
| S2 | Un ami sur `sejoursDetailles()`, `reglagesConfidentialite()` et les deux écritures → `FORBIDDEN`, entrée au journal d'audit |
| S3 | **Le cas du module.** `sejour({ id })` sur le séjour d'un autre → refus. Testé pour de vrai, avec l'identifiant réel d'un séjour existant |
| S4 | Un identifiant **inexistant** et le séjour **d'autrui** donnent le **même** refus, au mot près. Deux messages différents auraient suffi à distinguer ce qui existe de ce qui n'existe pas |
| S5 / S6 | Les tests appellent les Server Actions **directement**, hors interface. Les gardes tiennent |
| S7 | Un niveau inventé (`PUBLIC`) est rejeté par le schéma. Un `proprietaireId` glissé dans l'entrée n'existe dans aucun schéma : l'identité vient de la session |
| S8 | `/gerer/maison` tapé par un ami → **404**. Le mot « Confidentialité des séjours » ne transparaît pas |
| S9 | **`PRIV-S09` — la vérification sur la charge utile, pas sur le rendu.** Trois séjours d'autrui, réponse sérialisée inspectée : aucun prénom, aucun effectif, aucun motif, aucun commentaire, aucun identifiant d'utilisateur, aucun identifiant de séjour. Ce qui n'est pas envoyé ne peut pas fuiter |
| S10 / S11 | Aucune surface propre à `PRIV` — session et jetons relèvent du lot 1 |
| S12 | **`PRIV-S12`** — le refus de capacité ne révèle plus ni qui occupe, ni combien (voir problème n°1) |

### Grille de concurrence

`C6` — les deux écritures de réglage passent par une transaction **sérialisable**, audit compris : le journal et la valeur ne peuvent pas diverger. `C1` à `C5` sont sans objet : changer un niveau de visibilité ne dispute aucune ressource rare.

### Impact sur les autres modules

- `STAYDEC` (lot 3.5) : au moment de transformer une demande acceptée en séjour, appeler `visibiliteParDefaut()` — le défaut n'a qu'une seule définition, il n'est pas à réécrire. Pour un séjour créé par Solenne pour elle-même : `visibiliteParDefaut(client, { sejourDeSolenne: true })`. C'est là aussi que le **détail chiffré** de la capacité retrouve sa place, sur l'écran de Solenne.
- `STAYREQ` (lot 3.4) : le refus de capacité opposé à un ami est désormais muet. Ne pas le « rendre plus utile » — c'est un choix, pas un oubli.
- `CAL` (lot 2.5) : consomme `occupationDuCercle()` et `sejoursDetailles()` telles quelles. `CAL-R1` est déjà tenu à la source — l'agenda n'aura aucun filtrage à faire, et ne doit surtout pas en ajouter.
- `STAY` (lot 3.6) : `sejour({ id })` est la porte d'entrée d'un séjour, refus neutre compris.
- Lot 4 (`EVENT`) : `PRIV-R7` — les participants d'un événement sont visibles entre invités. C'est **voulu** et sans rapport avec les séjours. Ne pas étendre `vueDesSejours` aux événements par symétrie apparente.

### Décisions tranchées par Yassine

1. **Les séjours de Solenne sont plus visibles par défaut** — tranché le 22/08/2026. Ils partent en « prénom et nombre de personnes » là où ceux du cercle partent en « Maison occupée ». Ce qui était un choix d'illustration du jeu de démonstration est devenu la règle.

   Ce n'est pas une entorse à D4 : D4 protège l'invité qui n'a rien demandé, pas la maîtresse de maison qui annonce sa présence chez elle. Trois conséquences, toutes déjà en place :

   - `NIVEAU_PAR_DEFAUT_SOLENNE` et `niveauParDefaut({ estSejourDeSolenne, reglage })` dans `src/domain/privacy/visibilite.ts` — **une seule définition du défaut**, celle que `STAYDEC` appellera ;
   - le **réglage global ne peut pas abaisser** le défaut de Solenne. Il répond à « ce que mes amis montrent d'eux », pas à « ce que je montre de moi » : un réglage discret choisi pour ses invités n'a pas à l'effacer de son propre agenda ;
   - le défaut **reste un point de départ**. Elle abaisse le niveau séjour par séjour dans la console (PRIV-011), et la phrase sous le réglage global le lui dit — pour qu'elle ne le découvre pas sur l'agenda de ses amis.

---

## MODULE : CAL — Agenda

**Statut : ✅ VALIDÉ** · 16 cas sur 16 · livré en **un seul arrêt**, plus `BLOCK-011` récupéré du module `BLOCK`.

C'est l'écran le plus consulté du produit, et le seul dont une erreur ne se voit pas : un agenda faux reste un agenda plausible.

### Fonctionnalités réalisées

- Trois vues — **Mois**, **Semaine**, **Liste** — sur une seule adresse, `/agenda?vue=…`.
- Vue **Mois** : semaines entières de lundi à dimanche, quatre à **six** lignes selon le calendrier, bandes continues d'une semaine à l'autre, « +N » quand la place manque.
- Vue **Semaine** : sept jours l'un sous l'autre, arrivées et départs annoncés séparément.
- Vue **Liste** : ce qui vient, dans l'ordre, en cartes.
- Navigation par **liens** — mois précédent / suivant, semaine, retour à aujourd'hui — donc partageable, tabulable, et sans état perdu.
- Légende : **une icône, un mot, une couleur** par catégorie, et seulement les catégories que le mois contient.
- Pour Solenne : **fermeture de dates au cliquer-glisser** à même la grille (`BLOCK-011`).

Deux fonctionnalités de la fiche sont **sans objet en vague 1** et le resteront jusqu'au lot 4 : les cartes photo d'événement en vue Liste (`CAL-003`) et les éléments à l'heure, 14 h → 18 h (`CAL-010`). Elles ne sont pas abandonnées : le type `ElementAgenda` porte déjà `debut` / `fin`, la catégorie `EVENEMENT` est déclarée **dormante**, et la vue Semaine affiche l'horaire dès qu'un élément en a un. Le lot 4 allume ; il ne réécrit pas.

### Règles vérifiées

| Règle | Où elle est tenue |
|---|---|
| CAL-R1 | L'agenda **ne filtre rien** : deux lectures séparées côté serveur, `occupationDuCercle()` pour un ami, `sejoursDetailles()` pour Solenne. Le composant reçoit ce que `PRIV` a bien voulu envoyer, jamais un jeu complet assorti d'un `if` sur le rôle |
| CAL-R2 | `couvre()` — un jour est occupé si `du ≤ jour < au`. Une seule fonction, consommée par les trois vues |
| CAL-R3 | `mouvementsDuJour()` rend **deux listes**, arrivées et départs, sans jugement. Sur la grille, deux bandes qui se succèdent partagent la même ligne |
| CAL-R4 | `MARQUE_CATEGORIE` associe à chaque catégorie un **symbole nommé** et un **libellé**, pas seulement un ton. Le domaine ne connaît aucune icône : la correspondance vers `lucide-react` vit dans le composant |
| CAL-R5 | Les jours sont des dates nues calées à minuit UTC, et l'arithmétique se fait en jours entiers. **Aucun changement d'heure ne peut décaler quoi que ce soit** — il n'y a pas d'heure à décaler. Paris n'apparaît que pour un élément qui a vraiment une heure |

### Le test qui compte

`CAL-011`. Un séjour du 24 au 27 octobre 2026 — le week-end où la France recule d'une heure. Attendu : **3 nuits**, aucun décalage.

Le piège est classique et il se referme sur les agendas écrits en heures locales : la nuit du changement dure 25 heures, et un décompte fait en millisecondes divisées par 86 400 000 rend 3,04 nuits, arrondies à 3 ou à 4 selon l'humeur de l'arrondi. Ici la question ne se pose pas, et c'est le vrai résultat du test : les dates du domaine sont des **quantièmes**, pas des instants. Un séjour n'a pas d'heure d'arrivée, donc il n'a pas de fuseau, donc il n'a pas d'heure d'été.

`CAL-004`, `CAL-005`, `CAL-007` et `CAL-008` éprouvent la même mécanique sous d'autres angles : la borne de départ libre, le départ et l'arrivée le même jour, la bascule d'un mois, la bascule d'une année. Les quatre passent par `couvre()` : il n'y a qu'un endroit où se tromper d'un jour, et il est testé quatre fois.

### Problèmes rencontrés

**1. `Intl` écrit « 1 septembre ». Personne ne parle ainsi.** Le premier jour du mois est le seul du français à porter son rang, et un agenda l'affiche douze fois par an. Corrigé dans `src/domain/core/dates.ts` par `mettreEnForme()`, qui reprend la **partie `day`** du résultat — jamais la chaîne entière, sans quoi un millésime ou une heure commençant par 1 y passerait aussi. Quatre formats en bénéficient d'un coup, l'agenda comme les courriers.

**2. Une adresse abîmée ne doit pas casser l'agenda.** `/agenda?mois=2026-99` circule dans une conversation, tronqué ou recopié de travers. `moisDepuisTexte()` et `jourDepuisTexte()` rendent `null` sur tout ce qui n'est pas une date réelle — un 30 février compris, écarté par reconstruction de la date — et la page retombe sur le mois courant. Une page d'erreur aurait été correcte et inutilisable.

**3. Les lignes des bandes sont attribuées pour tout le mois, pas semaine par semaine.** L'attribution hebdomadaire est plus simple et plus compacte ; elle fait sauter un séjour d'une ligne à l'autre au passage du dimanche, et l'œil perd le fil. L'attribution est donc **globale** — c'est le seul endroit du module où la lisibilité a coûté de la densité.

**4. En 320 px, une case fait 45 px de large.** Un titre y tiendrait sur trois lettres suivies de points de suspension. Les bandes n'affichent donc que l'icône et la couleur en petit écran, le titre restant lisible aux lecteurs d'écran, et **la légende porte les mots**. Les cibles font 44 × 44 px minimum, mesurées et non estimées (`CAL-013`).

**5. Le cliquer-glisser ne devait pas rendre l'agenda impossible à faire défiler.** Un mois qui capte le glissement en permanence se bloque au doigt. Le mode de sélection est donc **explicite** : tant que Solenne n'a pas appuyé sur « Fermer des dates », la grille défile normalement. Et le geste reste un **raccourci** : le même blocage se pose au clavier depuis la console, dates saisies à la main. Une fonction accessible seulement au bout d'un glissement de souris n'existe pas pour qui n'en a pas.

**6. Aucun défaut de rendu, pour le deuxième module d'affilée.** Les captures des trois vues, pour un ami et pour Solenne, aux trois tailles — `agenda-ami-*` et `agenda-solenne-*` dans `Rapports/apercus-lot2/` — **rendu approuvé par Yassine le 22/08/2026 (L2 levée pour le lot 2)**.

### Grille de sécurité S1 → S12

| # | Résultat |
|---|---|
| S1 | `/agenda` sans session → redirection vers la connexion, aucune donnée émise (`acces.spec.ts`) |
| S2 | Sans objet en lecture : l'agenda est ouvert au cercle. En écriture, la seule surface est `creerBlocage()`, déjà gardée par `ADMIN` |
| S3 / S4 | L'agenda n'expose aucun identifiant de séjour à un ami : il n'y a rien à demander, et rien à modifier |
| S5 | **`BLOCK-S02`** — un ami n'a aucune surface pour fermer des dates : le bouton n'est pas rendu, et l'action refuse de toute façon. L'interface ne protège rien, elle se contente de ne pas mentir |
| S6 | Les vues sont rendues **côté serveur** ; les deux lectures qui les alimentent sont éprouvées en appel direct au module `PRIV` |
| S7 | **Le cas du module.** `vue`, `mois` et `jour` viennent de l'adresse. Trois formats stricts, aucune valeur inventée : `mois=2026-99`, `mois=nimportequoi`, `jour=2026-02-30` retombent tous sur le mois courant. Aucune date n'est fabriquée à partir d'une entrée douteuse |
| S8 | Le mois lointain d'un ami ne révèle rien de plus qu'un mois proche : la fenêtre de données est déduite de la grille affichée, pas fournie par le client |
| S9 | **`CAL-016`** — la charge utile de l'agenda d'un ami est inspectée telle qu'elle sort du serveur : aucun motif, aucun commentaire, aucun prénom d'autrui. Le seul nom qu'elle contient est « Solenne », et c'est D9 qui l'y met |
| S10 / S11 | Aucune surface propre à `CAL` — session et jetons relèvent du lot 1 |
| S12 | Sans objet : aucune écriture en rafale possible depuis l'agenda d'un ami |

### Grille de concurrence

`C5` — la seule écriture du module est `creerBlocage()`, déjà éprouvée à `BLOCK` (`BLOCK-C05` : blocage et confirmation de séjour lancés ensemble, exactement une écriture aboutit). `CAL` n'ajoute aucun point de contention : trois vues en lecture ne se disputent rien.

### Impact sur les autres modules

- `AVAIL` (lot 3.2) : la grille sait déjà dire ce qui occupe un jour. **Elle ne dira jamais si un jour est disponible** — c'est `AVAIL` qui tranche, à partir d'`OCCUP`. Ne pas déduire une disponibilité d'une case vide de l'agenda.
- `STAYREQ` (lot 3.4) : le formulaire de demande se pose naturellement sur la vue Mois, avec le même geste que `BLOCK-011` mais sans droit d'écriture directe. Le composant `SelectionBlocage` montre le motif ; il n'est pas à généraliser tant qu'un second usage n'existe pas.
- `STAY` (lot 3.6) : `ElementAgenda.lien` est déjà là, à `null`. C'est là que la fiche d'un séjour se branchera, sans toucher aux vues.
- Lot 4 (`EVENT`) : la catégorie `EVENEMENT` et les champs `debut` / `fin` sont **posés et dormants**. Un événement de 14 h à 18 h s'affichera sans qu'aucune vue change.
- `DASH` (vague 2) : la vue Liste est le brouillon du tableau de bord. La reprendre plutôt que d'en écrire une seconde.

### Décisions à confirmer par Yassine

Aucune. Le module n'a rien tranché qui ne relève de la technique.

---

## Fin du lot 2 — les 10 critères du §11.1

| # | Critère | Lot 2 |
|---|---|---|
| 1 | Fonctionnalités de la fiche développées | ✅ — deux fonctionnalités de `CAL` sans objet avant le lot 4, ci-dessus |
| 2 | Règles métier respectées et vérifiées | ✅ — les 29 règles des cinq fiches |
| 3 | 100 % des tests du module passent | ✅ — 78 cas sur 82 ; les 4 restants sont des cas de `PRIV` portant sur les lots 4 et 6 |
| 4 | Cas limites testés | ✅ |
| 5 | Permissions testées, grille S1→S12 comprise | ✅ — cinq grilles |
| 6 | Régression complète au vert | ✅ — **1 min 59 s**, sous les 5 minutes du §9 |
| 7 | Comportement mobile vérifié en 320 / 768 / 1440 px | ✅ — campagne complète aux trois tailles, 454 vérifications |
| 8 | Aucune erreur critique ni haute priorité connue | ✅ |
| 9 | Messages en français, sans trace technique | ✅ — 41 messages au catalogue, vérifiés à l'écran |
| 10 | Rapport de fin de module produit | ✅ — ce document |

**Jugement visuel (L2)** : Yassine a approuvé le rendu des cinq modules le **22/08/2026**, sur les captures des trois tailles dans `Rapports/apercus-lot2/`.

**Le lot 2 est validé.** La maison, ses espaces, ses règles, ses dates fermées, sa confidentialité et son agenda existent. Ce qui manque encore pour qu'un ami puisse s'en servir tient en un mot : **demander**. C'est le lot 3.
