# Mode Opératoire — La Maison de Solenne

**Version 1.0 — COMPLÈTE** · 21 août 2026
**Statut : en attente de validation finale.** Aucune ligne de code applicatif n'a été écrite.

> Document maître. Les fiches détaillées des 32 modules et les cas de test se trouvent dans `Mode Operatoire - Detail/`.
> Une version lisible sans connaissance technique existe : **`Mode Operatoire - LIGHT.md`** — c'est celle à lire pour valider.

---

## Sommaire

| § | Section |
|---|---|
| 1 | [Engagement de responsabilité technique](#1-engagement-de-responsabilité-technique) |
| 2 | [Tableau de bord d'avancement](#2-tableau-de-bord-davancement) |
| 3 | [Révision du découpage — l'avocat du diable](#3-révision-du-découpage--lavocat-du-diable) |
| 4 | [Carte des 32 modules](#4-carte-des-32-modules) |
| 5 | [Ordre de développement et dépendances](#5-ordre-de-développement-et-dépendances) |
| 6 | [Traitement du problème d'occupation](#6-traitement-du-problème-doccupation-) |
| 7 | [Grille de sécurité S1→S12](#7-grille-de-sécurité-s1s12) |
| 8 | [Grille de concurrence C1→C6](#8-grille-de-concurrence-c1c6) |
| 9 | [Stratégie de non-régression](#9-stratégie-de-non-régression) |
| 10 | [Tests E2E — 23 parcours](#10-tests-e2e--23-parcours) |
| 11 | [Critères de validation](#11-critères-de-validation) |
| 12 | [Conventions](#12-conventions) |
| 13 | [Index des fiches détaillées](#13-index-des-fiches-détaillées) |
| 14 | [Gouvernance et journal](#14-gouvernance-et-journal) |

---

## 1. Engagement de responsabilité technique

### 1.1 Ce que je prends entièrement en charge

Conformément à vos §2 et §17, **aucun problème technique ne vous sera remonté pour résolution**.

| Domaine | Engagement |
|---|---|
| Erreurs de compilation, TypeScript, Prisma, SQL, build, runtime | J'identifie la cause, je corrige, je relance les tests concernés **puis** la régression complète |
| Tests en échec | Je corrige le code ou le test, en explicitant lequel des deux était faux |
| Failles de sécurité | Traitées comme bloquantes, avant toute nouvelle fonctionnalité |
| Migrations de base de données | Écrites, testées, rejouées et réversibles |
| Déploiement, variables d'environnement, sauvegardes | Préparés et vérifiés par mes soins |
| Messages d'erreur | Jamais de trace technique à l'écran — message français clair, détail dans les logs (§16) |

Je ne vous écrirai jamais « peux-tu corriger cette erreur ? » ni « modifie ce fichier manuellement ».

### 1.2 Les trois limites — **acceptées par Yassine le 21/08/2026**

| # | Ce qui reste de votre côté | Pourquoi | Quand |
|---|---|---|---|
| L1 | Acheter **babyplace.fr**, créer les comptes Netlify / Neon / Resend | Connexions interactives avec paiement et identité personnelle | Avant la mise en ligne (≈ 1 h) |
| L2 | **Juger le rendu visuel et le ton** | Je teste tailles, dépassements, contrastes, cibles tactiles — mais aucun test automatisé ne détecte la laideur, et c'est votre critère n°1 (§20, §33) | Fin de chaque lot |
| L3 | Fournir le **contenu réel** — photos, chambres, bureaux, règles rédigées par Solenne, liste des amis | Sans contenu, l'application reste une coquille | Pendant les lots 0–1 |

### 1.3 Quand je vous solliciterai

Uniquement pour une **décision fonctionnelle** — jamais pour un problème technique. Exemple type : « un ami peut-il annuler son séjour moins de 24 h avant l'arrivée, ou faut-il l'accord de Solenne ? ». Ces questions sont regroupées en fin de chaque rapport de module, sous la rubrique *Décisions à confirmer*.

### 1.4 Politique de test — **arbitrage validé le 21/08/2026**

| Nature du code | Règle appliquée |
|---|---|
| Logique métier, règles, permissions, Server Actions, moteurs | **Tests écrits et exécutés avant la première ligne de code.** Strict, sans exception |
| Interface | Cas de test et critères d'acceptation rédigés avant le code ; **tests E2E automatisés stabilisés juste après l'écran** |

Raison : un test E2E écrit contre un écran inexistant est réécrit trois fois et finit par tester ses propres suppositions. Là où le risque est réel — les règles, l'argent des autres, la vie privée, l'accès physique à la maison — la règle reste stricte.

### 1.5 Volumétrie des tests — **arbitrage validé le 21/08/2026**

Le nombre de tests n'est pas un objectif. Les fiches en comptent **567**, tous écrits pour une raison précise — aucun cas de remplissage. Contrainte dure : **la suite complète doit s'exécuter en moins de 5 minutes**. Au-delà, je fusionne les cas redondants et je le consigne au journal (§14). Une suite qu'on évite de lancer ne protège de rien.

---

## 2. Tableau de bord d'avancement

> Mis à jour à la fin de chaque module. C'est ici que vous savez où nous en sommes sans lire une ligne de code.

| Lot | Modules | Statut | Tests prévus | Réussis | Échoués | Validé le |
|---|---|---|---|---|---|---|
| 0 — Fondations | 3 | ✅ Validé | 34 | 34 | 0 | 21/08/2026 |
| 1 — Identité | 6 | ✅ Validé | 118 | 118 | 0 | 21/08/2026 |
| 2 — Maison & Agenda | 5 | ✅ Validé | 82 | 78 | 0 | 22/08/2026 |
| 3 — Séjours ★ | 6 | 🟨 6 modules livrés · clôture du lot restante | 134 | 134 | 0 | — |
| 4 — Événements | 3 | ⏸️ Reporté — après la vague 1 | 63 | — | — | — |
| 5 — Vie de l'événement | 2 | ⏸️ Reporté — après la vague 1 | 31 | — | — | — |
| 6 — Notifications | 3 | ⏸️ Reporté — après la vague 1 | 36 | — | — | — |
| 7 — Finition & production | 4 | 🟦 `DEPLOY` seul dans la vague 1 · 3 reportés | 49 | — | — | — |
| — Parcours E2E | — | ⬜ À faire | 23 | — | — | — |
| **TOTAL** | **32** | 🟦 | **570** | **364** | **0** | — |

Légende : ⬜ à faire · 🟦 en cours · 🟨 développé, tests en cours · ✅ validé · ⏸️ reporté · ❌ bloqué

Lot 2 : **78 cas sur 82**. Les quatre autres — `PRIV-008`, `013`, `014`, `015` — portent sur des événements ou des notifications, c'est-à-dire sur des lots reportés en vague 2 ; ils restent dans leur fiche, à jouer quand leur objet existera (P10).

Lot 3 : `OCCUP` livré à **34 cas sur 34**, en deux arrêts (`OCCUP-A` contrat, `OCCUP-B` exercice) ; `AVAIL` ★ livré à **35 cas sur 35**, en trois arrêts (`AVAIL-A` contrat et R1→R4, `AVAIL-B` R5→R8, `AVAIL-C` combinaisons) ; `POLICY` livré à **16 cas sur 16** (`POLICY-012` fermé par `STAYREQ`, seul module qui crée une vraie demande de séjour) ; `STAYREQ` livré à **20 cas sur 20**, en deux arrêts (`STAYREQ-A` Server Actions et composition R8, `STAYREQ-B` assistant en trois étapes et disponibilité en direct) ; `STAYDEC` ★ livré à **19 cas sur 19**, en deux arrêts (`STAYDEC-A`, Opus, la revalidation en transaction sérialisable et la grille C1→C6, qui a ajouté le cas `STAYDEC-C06` à la fiche ; `STAYDEC-B`, Sonnet, file d'attente, écran de décision, refus, contre-proposition et sécurité `S02`/`S06`) ; `STAY` livré à **10 cas sur 10**, en un seul arrêt (Sonnet) — création directe, annulation des deux côtés, clôture automatique, suggestion de libération. Les six modules du lot sont clos ; reste la clôture du lot (trois tailles, régression, jugement visuel L2) avant `DEPLOY`.

### 2.1 Périmètre de la vague 1 — **arrêté par Yassine le 22/08/2026**

Décision de **budget**, pas de produit : environ 100 € d'appels API ont été consommés pour les 11 premiers modules, et Yassine plafonne la suite à **50 €**. Les 21 modules restants ne tiennent pas dans ce plafond. Le périmètre est donc coupé en deux vagues, **sans rien supprimer** : tout ce qui est reporté garde sa fiche, ses cas de test et sa place dans les dépendances du §5.

| Vague | Modules | Ce que Yassine obtient |
|---|---|---|
| **1 — à faire maintenant** (10 modules) | `BLOCK` · `PRIV` · `CAL` · `OCCUP` ★ · `AVAIL` ★ · `POLICY` · `STAYREQ` · `STAYDEC` · `STAY` · `DEPLOY` | Une application **en ligne et réellement utilisable** : la maison, l'agenda, la confidentialité D4, les demandes de séjour et les décisions de Solenne |
| **2 — reportée** (11 modules, 165 cas) | Lot 4 `EVENT` · `RSVP` · `SLEEP` — lot 5 `ITEM` · `COMMENT` — lot 6 `NOTIF` · `MAIL` · `REMIND` — lot 7 `DASH` · `HIST` · `UX` | Les événements entre amis et tout ce qui en découle |

**Ce que la vague 1 ne fournit pas, et comment on s'en passe en attendant**

| Manque | Contournement retenu |
|---|---|
| Envoi d'emails (`MAIL`) | Le lien d'invitation reste **affiché à Solenne**, qui le transmet par WhatsApp. Pour un cercle d'une dizaine d'amis, c'est tenable (problème P4 maintenu, sans gravité) |
| Notifications et rappels (`NOTIF`, `REMIND`) | Solenne consulte son agenda. Aucune donnée n'est perdue : les événements métier existent, personne ne les écoute encore |
| Événements entre amis (lot 4) | Absents de l'interface. **Le modèle de données reste en place** — les tables `events`, `rsvps` et le contributeur d'occupation `DORMEUR_ÉVÉNEMENT` restent déclarés et dormants, exactement comme au §6.1 |
| Tableau de bord réel (`DASH`) | L'accueil actuel suffit (problème P2 maintenu) |
| Revue d'expérience (`UX`) | **Le seul report qui touche la qualité de la vague 1** : états vides, cohérence d'ensemble et accessibilité ne seront pas revus globalement avant la mise en ligne. Compensation : les critères sont tenus **module par module** (§11.1 critères 6 et 7), et la mise en ligne s'adresse à un cercle privé d'une dizaine de personnes, pas à un public. À rejouer en tête de vague 2 |

**Ce qui rend la vague 2 reprenable sans rien réécrire** — ces trois garde-fous sont des obligations de la vague 1, pas des intentions :

1. Le **registre de contributeurs** d'`OCCUP` (§6.1) déclare `DORMEUR_ÉVÉNEMENT` dès la vague 1, à l'état dormant. La vague 2 l'active ; elle ne réécrit aucune formule.
2. Le **modèle de données reste complet** — 26 tables. Aucune table du lot 4 ou 5 n'est retirée du schéma, sans quoi la vague 2 exigerait une migration destructrice.
3. Les **fiches et les 253 cas de test** de la vague 2 restent dans `Mode Operatoire - Detail/`, intacts.

### 2.2 Méthode économique — **appliquée à partir du 22/08/2026**

Le coût par module passe d'environ 8 € à environ 3 € sans rien céder sur les 10 critères du §11.1. Sept mesures — les cinq premières arrêtées le 22/08/2026, **M6 et M7 ajoutées le même jour après mesure au contact du code** :

| # | Mesure | Portée |
|---|---|---|
| M1 | **Sonnet** pour tous les modules ; **Opus** réservé à `OCCUP` et `AVAIL` | L'architecture est décidée et les motifs sont posés par `HOUSE` et `SPACE` : le reste est de la reproduction de motif. Les deux modules ★ gardent le modèle fort, une erreur de raisonnement y coûtant plus cher que l'économie |
| M2 | **E2E en 320 px par module**, les trois tailles **une fois par lot** | 90 % de l'usage est mobile. Le §11.1 critère 6 est tenu au niveau du lot, pas du module |
| M3 | **Les captures ne sont plus chargées en contexte** | Juger le rendu est la limite **L2** de Yassine. Je produis les fichiers dans `Rapports/`, il les ouvre |
| M4 | **Rapports et entrées de journal courts** | Le fond est conservé, la prose est coupée |
| M5 | **Session neuve à chaque module** | Une conversation longue renvoie tout son historique à chaque échange — c'est le premier poste de dépense, et le plus invisible |
| M6 | **Sorties d'outils filtrées** — journal muet sous test, rapporteur `dot`, jamais de recherche dans `src/generated/` | Ajoutée le 22/08/2026, après mesure : une passe Vitest écrivait **467 974** caractères, dont la quasi-totalité était le détail technique de refus **attendus** par les grilles S1→S12. Ramenée à **2 318**. Une campagne Playwright passe de 80 177 à 5 121. Ce qui entre dans la conversation s'y repaie à chaque tour |
| M7 | **Plafond de 40 000 jetons par session** — une session couvre **un arrêt**, pas un module ; fiche de reprise `Rapports/etat.md` à chaque fin d'arrêt | Ajoutée le 22/08/2026, à la demande de Yassine. Le plancher d'une session neuve est d'environ 15 000 jetons (harnais, outils, `CLAUDE.md`) : restent ~25 000 de marge utile, soit exactement un arrêt. **M7 rend M5 plus strict et le remplace** : session neuve par arrêt, non plus par module. Sans la fiche de reprise, on paie en redécouverte ce qu'on gagne en brièveté — mesuré le 22/08 : vingt appels d'outils pour retrouver qu'un module était écrit mais non clos |

Les 214 cas des lots 0, 1 et 2 sont couverts par **1 053 vérifications automatisées** — 599 avec Vitest (44 s), 454 avec Playwright sur les trois tailles d'écran (1 min 15 s, compilation de production comprise). La régression complète tient en **1 min 59 s**, sous les 5 minutes exigées au §9.

**Problèmes ouverts connus**

| # | Problème | Gravité | Suite |
|---|---|---|---|
| P1 | `SETUP-011` n'est vérifié que sur le **contenu** du fichier d'intégration continue : la preuve qu'une fusion est réellement bloquée demande un dépôt hébergé (limite **L1**) | MEDIUM | À rejouer dès la création du dépôt |
| P2 | La campagne responsive couvre **11 écrans sur 12** ; le douzième — le tableau de bord réel — n'existe pas encore | LOW | Lot 7, module `DASH` |
| ~~P3~~ | ~~Validation visuelle de Yassine (**L2**) non faite~~ — **levée le 21/08/2026** : parti visuel approuvé sur `/vitrine`, `UI` formellement clos | — | Clos |
| P4 | L'envoi d'emails est **simulé** : les courriers partent dans `.courriers/` et le lien d'invitation est affiché à Solenne | — | Prévu au lot 6 (`MAIL`), conforme à la fiche `INVITE` |
| P5 | **Dépendance inversée dans la spécification** : le §5 fait dépendre `OCCUP` de `HOUSE`, alors que `HOUSE-R2` (refuser une réduction de capacité sous l'occupation confirmée) ne peut pas s'écrire sans `OCCUP`. Le registre de contributeurs du §6 a donc été posé au lot 2 | MEDIUM | Le lot 3 **complète** `OCCUP` (contrat `OCCUP-CT-01→08`, sentinelle `OCCUP-024`, 34 cas) au lieu de le créer |
| P6 | Le §6.4 écrit « adultes + enfants + **invités** ». `stay_guests` nommant une à une ces mêmes personnes, les additionner compterait chaque enfant deux fois. Effectif retenu : **adultes + enfants** | MEDIUM | À trancher formellement à l'ouverture d'`OCCUP` (lot 3) |
| P7 | Les 15 photos fournies par Yassine sont traitées comme du contenu définitif. Si ce sont des images provisoires, `DEPLOY-013` reste bloquant | LOW | Une phrase de Yassine suffit à lever le doute |
| ~~P8~~ | ~~`BLOCK-011` demande de créer un blocage **au cliquer-glisser sur l'agenda**, alors que l'agenda arrive deux modules plus loin~~ — **levé le 22/08/2026** : joué et au vert au module `CAL`, mode de sélection explicite pour ne pas bloquer le défilement au doigt | — | Clos |
| P9 | `BLOCK-008` veut la demande en attente signalée « en rouge **sur le tableau de bord** ». `DASH` est reporté en vague 2 : le signalement est porté par la console des blocages | LOW | À reprendre à `DASH` |
| P10 | Quatre cas de `PRIV` — `008`, `013`, `014`, `015` — portent sur des **événements** ou des **notifications**, donc sur les lots 4 et 6, reportés en vague 2. Ils sont écrits dans la fiche mais n'ont pas d'objet à éprouver | LOW | À jouer à `EVENT` (lot 4) et `NOTIF` (lot 6) |
| P11 | Deux fonctionnalités de la fiche `CAL` sont sans objet avant le lot 4 : les **cartes photo d'événement** en vue Liste (`CAL-003`) et les **éléments à l'heure** 14 h → 18 h (`CAL-010`). Les champs `debut` / `fin` et la catégorie `EVENEMENT` sont posés et dormants | LOW | À allumer au lot 4, sans réécriture de vue |

**Dette assumée**

| # | Dette | Raison | Planifié |
|---|---|---|---|
| ~~D-a~~ | ~~Aucune photo dans le jeu de démonstration~~ — **levée le 21/08/2026** : les 15 photos de Yassine (`Photos/`) sont toutes posées — 9 sur la maison, 6 sur les chambres et les bureaux au module `SPACE` | — | Close |
| D-b | Le retour arrière d'une migration passe par des fichiers `down.sql` joués à la main | Prisma ne gère pas les migrations descendantes ; le mécanisme est testé (`SETUP-007`) mais reste manuel | Inchangé — proportionné au projet |

---

## 3. Révision du découpage — l'avocat du diable

Vous m'avez demandé de juger moi-même mon découpage. Verdict : **il était mal équilibré**. Cinq modules ne méritaient pas d'exister seuls, trois cachaient plusieurs responsabilités, et un — le plus important — était un module-valise.

### 3.1 Les cinq regroupements

| Module supprimé | Absorbé par | Argument contre lui |
|---|---|---|
| `SEED` (données de démo) | `SETUP` | Ce n'est pas un module fonctionnel mais de l'outillage. Il n'a ni règle métier, ni permission, ni cas limite. Lui faire une fiche en 11 sections aurait produit neuf sections vides |
| `RULES` (règles de la maison) | `HOUSE` | Du contenu éditorial sans logique propre. La seule vraie règle métier — la traçabilité de l'acceptation — appartient au parcours de séjour, donc à `STAYREQ`. Isolé, `RULES` n'aurait testé qu'un formulaire de saisie de texte |
| `ACTIVITY` (programme) | `EVENT` | Sous-ressource pure d'un événement, sans existence ni permission propre. Votre propre §4 la classait d'ailleurs dans « Module Événements ». Elle se crée et s'édite dans le même écran que l'événement |
| `PREF` (préférences de notification) | `NOTIF` | Une préférence est un filtre appliqué par le bus de notification, pas un domaine. En revanche les **rappels** qui y étaient mélangés méritent un module — voir 3.2 |
| `AUDIT` (journal) | `PERM` (écriture) + `HIST` (lecture) | **La faute la plus grave du découpage v0.1.** Placer l'audit en lot 7 garantissait un journal incomplet : on n'ajoute pas la traçabilité après coup sur trente modules déjà écrits. L'écriture au journal descend donc en lot 1, dans `PERM`, où elle devient une obligation dès la première Server Action |

### 3.2 Les quatre découpages

| Module éclaté | Devient | Argument |
|---|---|---|
| **`AVAIL`** (60 tests) ★ | **`OCCUP`** + **`AVAIL`** + **`POLICY`** | Module-valise mélangeant trois choses : *combien de personnes sont là* (calcul), *est-ce compatible* (8 règles), *le patron l'autorise-t-il* (réglages configurables). Trois taux de changement différents : le calcul évolue à chaque nouvelle source d'occupation, les règles sont stables, les réglages changent au gré de Solenne. Les garder ensemble, c'est rejouer 60 tests pour une modification de réglage — **et c'est exactement ce qui rendait « je dors sur place » dangereux** (voir §6) |
| **`AUTH`** (38 tests) | **`AUTH`** + **`PWD`** | Deux surfaces d'attaque sans rapport : la session (vol de cookie, force brute, énumération) et le cycle de vie du mot de passe (jeton de réinitialisation, rejeu, expiration). Les mélanger noie 14 tests de sécurité de réinitialisation dans une masse de tests de connexion |
| **`PREF`** | **`NOTIF`** + **`REMIND`** | Un rappel n'est pas une préférence : c'est une **tâche planifiée**, avec ses modes de panne propres — ne se déclenche pas, se déclenche deux fois, se déclenche pour un séjour annulé. Infrastructure et risques totalement différents |
| **La concurrence** | Grille transverse **C1→C6** | J'allais l'enfermer dans `STAYDEC`. Or elle frappe cinq endroits : acceptation de séjour, réservation du dernier créneau « je m'en charge », dernière place d'un événement, activation d'invitation, blocage de dates. En faire un module l'aurait laissée non testée ailleurs. Elle devient une grille systématique, comme la sécurité (§8) |

### 3.3 Ce que j'ai examiné et **décidé de ne pas changer**

Par honnêteté intellectuelle, voici les découpages que j'ai remis en cause sans les modifier :

- **`DASH` (10 tests)** — thin, presque uniquement de l'agrégation. Tentation : le fondre dans `CAL`. Refusé : c'est le premier écran que voient Solenne et ses amis, et le §21 lui consacre une spécification propre. Un module de 10 tests bien ciblés vaut mieux qu'un écran d'accueil traité en sous-produit.
- **`UX` (18 tests)** — objection légitime : « responsive et accessibilité doivent être vérifiés partout, pas dans un module de fin ». Elle est juste, et le critère de validation n°7 l'impose déjà à **chaque** module. `UX` survit uniquement comme **revue transverse finale** : cohérence entre écrans, états vides, parcours au doigt de bout en bout. Il ne remplace pas les vérifications par module.
- **`SPACE` (chambres et bureaux)** — tentation de le fondre dans `HOUSE` comme `RULES`. Refusé : il porte une vraie règle métier — la cohérence entre la somme des couchages et la capacité D1 — et il est le point d'ancrage de l'affectation des chambres post-MVP.
- **`PRIV` (confidentialité)** — tentation de le fondre dans `PERM`. Refusé, et c'est important : `PERM` répond à *« avez-vous le droit d'appeler cette action ? »*, `PRIV` répond à *« que contient la réponse ? »*. Un ami a parfaitement le droit de consulter l'agenda ; la question est ce qu'il y voit. Deux questions distinctes, deux modules, deux jeux de tests.
- **`CAL` (20 tests)** — envisagé de séparer données et affichage. Refusé : `PRIV` filtre déjà les données en amont ; scinder aurait créé deux modules anémiques.

### 3.4 Bilan

| | v0.1 | v1.0 |
|---|---|---|
| Modules | 33 | **32** |
| Regroupements | — | 5 |
| Découpages | — | 4 |
| Module le plus gros | `AVAIL`, 60 tests | `AVAIL`, 35 tests |
| Grilles transverses | 1 (sécurité) | **2** (sécurité + concurrence) |
| Audit journalisé à partir du | lot 7 | **lot 1** |

Le compte bouge à peine ; l'équilibre change complètement. Aucun module ne dépasse désormais 34 tests, et les deux risques les plus sérieux du projet — la formule d'occupation et la concurrence — sont traités structurellement plutôt que rangés dans un tiroir.

---

## 4. Carte des 32 modules

### Lot 0 — Fondations · 3 modules · 34 tests

| Module | Préfixe | Objectif | Tests |
|---|---|---|---|
| 0.1 Socle technique | `SETUP` | Next.js + TypeScript strict, Prisma, PostgreSQL, intégration continue, jeu de données de démonstration | 11 |
| 0.2 Noyau transverse | `CORE` | Erreurs typées, journalisation, validation des entrées, messages français, dates et fuseaux | 12 |
| 0.3 Design system | `UI` | Palette, typographie, composants, mise en page, navigation 5 onglets | 11 |

### Lot 1 — Identité · 6 modules · 118 tests

| Module | Préfixe | Objectif | Tests |
|---|---|---|---|
| 1.1 Permissions & audit ⚠️ | `PERM` | Gardes serveur, refus par défaut, rôles, **écriture au journal d'audit** | 26 |
| 1.2 Authentification | `AUTH` | Connexion, session, déconnexion, limitation de débit | 24 |
| 1.3 Mots de passe | `PWD` | Oubli, réinitialisation, changement, politique de robustesse | 18 |
| 1.4 Invitations | `INVITE` | Émission, envoi, activation, expiration, révocation, usage unique | 24 |
| 1.5 Profil | `PROFILE` | Informations, photo, enfants, préférences | 12 |
| 1.6 Utilisateurs | `USERS` | Liste, rôle, relation, désactivation, suppression RGPD | 14 |

### Lot 2 — Maison & Agenda · 5 modules · 82 tests

| Module | Préfixe | Objectif | Tests |
|---|---|---|---|
| 2.1 Maison & règles | `HOUSE` | Informations, photos, **capacité 1→25** (D1), règles de la maison | 20 |
| 2.2 Espaces | `SPACE` | Chambres et bureaux, couchages, équipements | 12 |
| 2.3 Périodes bloquées | `BLOCK` | Création, chevauchements, blocage rétroactif | 14 |
| 2.4 Confidentialité ⚠️ | `PRIV` | **« Maison occupée »** (D4), sérialisation par rôle | 20 |
| 2.5 Agenda | `CAL` | Vues mois / semaine / liste, rendu, navigation | 16 |

### Lot 3 — Séjours ★ · 6 modules · 133 tests

| Module | Préfixe | Objectif | Tests |
|---|---|---|---|
| 3.1 Occupation ★ | `OCCUP` | **Calcul unique du nombre de personnes présentes**, registre de contributeurs | 34 |
| 3.2 Moteur de compatibilité ★ | `AVAIL` | Les 8 règles R1→R8 et leurs combinaisons | 35 |
| 3.3 Règles de réservation | `POLICY` | Durée max, délai min, horizon, jours interdits (R8 paramétrable) | 16 |
| 3.4 Demande de séjour | `STAYREQ` | Formulaire, exclusivité (D2), acceptation des règles, cycle de vie | 20 |
| 3.5 Décision ⚠️ | `STAYDEC` | Acceptation, refus, contre-proposition, **concurrence** | 18 |
| 3.6 Séjours | `STAY` | Séjours confirmés, séjours de Solenne, annulation, clôture | 10 |

### Lot 4 — Événements · 3 modules · 63 tests

| Module | Préfixe | Objectif | Tests |
|---|---|---|---|
| 4.1 Événements & programme | `EVENT` | Création, publication, déplacement, annulation, non-chevauchement (D8), activités | 28 |
| 4.2 RSVP | `RSVP` | Oui / Non / Peut-être, accompagnants, capacité | 20 |
| 4.3 Couchage sur place ⚠️ | `SLEEP` | « Je dors sur place » (D3) — **active le contributeur d'occupation** | 15 |

### Lot 5 — Vie de l'événement · 2 modules · 31 tests

| Module | Préfixe | Objectif | Tests |
|---|---|---|---|
| 5.1 À apporter | `ITEM` | Liste, « Je m'en charge », quotas, anti-doublon | 18 |
| 5.2 Commentaires | `COMMENT` | Fil de discussion par événement et par séjour | 13 |

### Lot 6 — Notifications · 3 modules · 36 tests

| Module | Préfixe | Objectif | Tests |
|---|---|---|---|
| 6.1 Bus & préférences | `NOTIF` | Événements métier → notifications, multi-canal, réglages par utilisateur | 16 |
| 6.2 Emails | `MAIL` | Gabarits français, envoi, échecs, reprises | 10 |
| 6.3 Rappels | `REMIND` | Tâches planifiées avant séjour et avant événement | 10 |

### Lot 7 — Finition & production · 4 modules · 47 tests

| Module | Préfixe | Objectif | Tests |
|---|---|---|---|
| 7.1 Tableaux de bord | `DASH` | Accueil personnalisé ami et Solenne | 10 |
| 7.2 Historique & journal | `HIST` | Passés, refus, annulations, filtres, **consultation de l'audit** | 12 |
| 7.3 Revue d'expérience | `UX` | Cohérence, états vides, parcours au doigt, accessibilité | 13 |
| 7.4 Production | `DEPLOY` | Migrations, variables, sauvegarde et restauration, documentation, garde anti-contenu provisoire | 14 |

---

## 5. Ordre de développement et dépendances

```
LOT 0   SETUP ─► CORE ─► UI
                   │
LOT 1              ├─► PERM ★sécurité+audit
                   │     ├─► AUTH ─► PWD
                   │     ├─► INVITE   (dépend d'AUTH + MAIL différé)
                   │     ├─► PROFILE
                   │     └─► USERS
LOT 2              │
        HOUSE ─┬─► SPACE
               └─► (règles intégrées)
        BLOCK ──┐
        PRIV ───┴──► CAL
LOT 3
        OCCUP ★ ──► AVAIL ★ ──► STAYREQ ──► STAYDEC ──► STAY
        POLICY ────────┘
LOT 4
        EVENT ──► RSVP ──► SLEEP ──┐
                                   └──► active le contributeur EVENT_SLEEPER dans OCCUP
                                        (aucune modification de formule — voir §6)
LOT 5   ITEM  ‖  COMMENT            (parallélisables, dépendent d'EVENT)
LOT 6   NOTIF ──► MAIL ──► REMIND
LOT 7   DASH ──► HIST ──► UX ──► DEPLOY
```

### Table des dépendances

| Module | Dépend de |
|---|---|
| `CORE`, `UI` | `SETUP` |
| `PERM` | `CORE` |
| `AUTH`, `USERS` | `PERM` |
| `PWD`, `INVITE`, `PROFILE` | `AUTH` |
| `HOUSE`, `BLOCK` | `PERM`, `UI` |
| `SPACE` | `HOUSE` |
| `PRIV` | `PERM` |
| `CAL` | `BLOCK`, `PRIV`, `HOUSE` |
| `OCCUP` ★ | `HOUSE` (capacité) — **aucune dépendance UI ni base de données** |
| `AVAIL` ★ | `OCCUP`, `BLOCK`, `POLICY` |
| `POLICY` | `HOUSE` |
| `STAYREQ` | `AVAIL`, `HOUSE` (règles), `PROFILE` |
| `STAYDEC` | `STAYREQ`, `AVAIL`, `PERM` |
| `STAY` | `STAYDEC`, `CAL` |
| `EVENT` | `CAL`, `PERM` |
| `RSVP` | `EVENT` |
| `SLEEP` | `RSVP`, `OCCUP` *(activation d'un contributeur, pas modification)* |
| `ITEM`, `COMMENT` | `EVENT` |
| `NOTIF` | `CORE` + tous les modules émetteurs |
| `MAIL` | `NOTIF` · `REMIND` | `NOTIF`, `STAY`, `EVENT` |
| `DASH` | `CAL`, `STAY`, `EVENT` |
| `HIST` | `PERM` (audit), `STAY`, `EVENT` |
| `UX`, `DEPLOY` | tous |

**Note sur `INVITE` :** l'envoi réel de l'email dépend de `MAIL` (lot 6). En lot 1, l'invitation est produite avec un lien copiable et un émetteur d'email simulé, entièrement testable. Le branchement sur Resend intervient au lot 6 et ne modifie pas la logique d'invitation. C'est la seule dépendance différée du projet, et elle est volontaire : elle évite d'attendre la validation DNS (L1) pour avancer.

---

## 6. Traitement du problème d'occupation ★

> **Le problème, tel que je l'ai signalé et tel que vous m'avez demandé de le prendre en charge.**
> « Je dors sur place » (`SLEEP`, lot 4) modifie la formule d'occupation définie dans `AVAIL` (lot 3). C'est la seule dépendance rétrograde du projet : une fonctionnalité tardive vient changer le cœur déjà validé. C'est le scénario classique de régression silencieuse — les 34 tests d'`AVAIL` continuent de passer parce qu'ils testent l'ancienne formule, et la maison se retrouve en surcapacité un samedi soir.

### 6.1 La solution : isoler le calcul et prévoir la place à l'avance

> **Arbitrage rendu par Yassine le 21/08/2026 — Option B retenue.**
> Trois options lui ont été soumises : **A** compter les séjours au lot 3 puis modifier le calcul au lot 4 ; **B** déclarer un registre de contributeurs dès le lot 3 et n'activer que l'interrupteur au lot 4 ; **C** réordonner le projet pour construire les événements avant les séjours.
> **B** est retenue. **C** est écartée parce qu'elle repousserait le palier « application utilisable », alors que la demande de séjour est le besoin le plus urgent de Solenne. **A** est écartée parce qu'une surcapacité est une panne silencieuse : elle ne s'affiche nulle part, ne déclenche aucune alerte, et ne se découvre que le soir même sur le pas de la porte.
> Coût accepté : environ 8 tests supplémentaires et une heure de travail en plus au lot 3.

Je ne me contente pas de « rejouer les tests au lot 4 ». Je supprime la modification elle-même.

**Le calcul d'occupation devient un module autonome, `OCCUP`, avec un registre de contributeurs.**

```
                      ┌───────────────────────────────────┐
                      │            OCCUP                  │
                      │  occupationSur(période) → total   │
                      ├───────────────────────────────────┤
   contributeurs      │  ① SÉJOUR_CONFIRMÉ      actif     │  ← lot 3
   déclarés dès       │  ② DORMEUR_ÉVÉNEMENT    dormant   │  ← lot 3, rend 0
   le lot 3           │  ③ AFFECTATION_CHAMBRE  dormant   │  ← post-MVP
                      └───────────────┬───────────────────┘
                                      │ contrat figé
                                      ▼
                      ┌───────────────────────────────────┐
                      │  AVAIL — 8 règles R1→R8           │
                      │  ne compte jamais rien lui-même   │
                      └───────────────────────────────────┘
```

Les trois contributeurs sont **déclarés dès le lot 3**. Le contributeur « dormeur d'événement » existe, il est testé, et il renvoie zéro tant que le lot 4 n'existe pas.

**Conséquence : le lot 4 n'écrit aucune formule.** `SLEEP` se contente d'alimenter un contributeur déjà en place et déjà couvert par des tests. La formule d'occupation, elle, n'est jamais réécrite.

### 6.2 Les quatre garde-fous

| # | Garde-fou | Effet |
|---|---|---|
| G1 | **`AVAIL` n'a pas le droit de compter.** Il consomme `OCCUP` et rien d'autre | Une nouvelle source d'occupation ne peut pas être oubliée dans une règle : il n'y a qu'un seul endroit où l'on compte |
| G2 | **Tests de contrat `OCCUP-CT-01→08`** — le contrat de `OCCUP` est figé et rejoué à chaque ajout de contributeur | Toute modification du contrat casse un test immédiatement |
| G3 | **Test sentinelle `OCCUP-024`** — « le total est égal à la somme des contributeurs actifs, aucun oublié ». Il énumère le registre dynamiquement | Ajouter un contributeur sans l'inclure au total fait échouer ce test **sans qu'on ait à y penser** |
| G4 | **Suite `AVAIL` + `OCCUP` + `STAYREQ` + `STAYDEC` + `CAL` obligatoirement rejouée à la validation de `SLEEP`** | Filet de sécurité final, inscrit au §9.3 |

### 6.3 Ce que ça coûte, honnêtement

Un peu plus de structure au lot 3 : environ 8 tests supplémentaires (`OCCUP-CT-*` et le contributeur dormant) et une couche d'indirection. En échange, le lot 4 devient une activation triviale au lieu d'une chirurgie sur le cœur du système, et l'affectation des chambres post-MVP se branchera de la même façon. Le calcul est bon.

### 6.4 Formule de référence

> **Occupation d'un jour J** = Σ (adultes + enfants) des séjours confirmés couvrant J
> **+** Σ (participant + accompagnants adultes + enfants) des RSVP « je dors sur place » dont la nuit couvre J
> **+** *(post-MVP)* Σ des affectations de chambre couvrant J
>
> Convention : intervalles semi-ouverts `[arrivée, départ[`. Le jour du départ n'est pas occupé.
> Comparaison : `occupation(J) + demande ≤ capacité (D1, 1→25)`.

**P6 — arrêté le 22/08/2026, à l'ouverture d'`OCCUP`.** La ligne ci-dessus disait « adultes + enfants **+ invités** ». C'était faux : `stay_guests` ne décrit pas des personnes supplémentaires, il *nomme* celles qui sont déjà déclarées — son champ `is_child` le montre assez. Les additionner aurait compté deux fois chaque personne nommée, et la maison aurait refusé des demandes qu'elle peut accueillir. L'effectif d'un séjour est **adultes + enfants**, un point c'est tout (`OCCUP-009`).
Conséquence pour `STAYREQ` : c'est **à la saisie** de garantir que la liste des invités nommés ne dépasse pas `adultes + enfants`. Le calcul ne rattrape rien.

---

## 7. Grille de sécurité S1→S12

### 7.1 Principe

> **Une fonctionnalité n'est pas sécurisée parce qu'elle fonctionne. Elle l'est quand elle a été attaquée et qu'elle a tenu.**

Règle du projet : **refus par défaut**. Toute Server Action commence par une garde de permission avant la moindre lecture de données. L'interface ne protège rien — masquer un bouton n'est pas une sécurité.

### 7.2 La grille

Appliquée à **chaque fonctionnalité sensible**, sans exception. Elle génère mécaniquement les tests `<MODULE>-S01` à `-S12`.

| # | Attaque simulée | Attendu |
|---|---|---|
| S1 | Accès sans authentification | Redirection, aucune donnée émise |
| S2 | Compte ami sur une fonction de Solenne | Refus serveur + entrée au journal d'audit |
| S3 | Accès à une donnée d'un autre utilisateur | Refus, message neutre — ne pas confirmer l'existence de la ressource |
| S4 | Modification d'une donnée d'un autre | Refus, aucune écriture |
| S5 | Contournement de l'interface (bouton masqué forcé) | Sans effet, le serveur tranche |
| S6 | **Appel direct d'une Server Action** hors interface | Garde déclenchée, refus |
| S7 | Manipulation de paramètres (identifiant, rôle, statut, dates) | Validation stricte, rejet |
| S8 | URL privée devinée | Refus |
| S9 | Fuite dans la **réponse serveur** | Aucun champ privé dans la charge utile — pas seulement masqué à l'écran |
| S10 | Session expirée / compte désactivé | Déconnexion immédiate |
| S11 | Jeton expiré, déjà utilisé, révoqué, falsifié | Refus, message neutre |
| S12 | Connexions ou réinitialisations en rafale | Limitation de débit, pas d'énumération de comptes |

### 7.3 Cibles prioritaires

| Rang | Cible | Raison |
|---|---|---|
| 1 | `PERM` | Une faille ici compromet tout le reste |
| 2 | `PRIV` | La confidentialité (D4) est le socle de confiance du produit |
| 3 | `INVITE` + `AUTH` + `PWD` | Seule porte d'entrée de l'application |
| 4 | `STAYDEC` | Une acceptation frauduleuse donne un accès **physique** à la maison |
| 5 | `USERS` | Élévation de privilège |

### 7.4 Mesures permanentes

Mots de passe **Argon2id**, jamais renvoyés ni journalisés · jetons d'invitation et de réinitialisation **hachés en base**, à usage unique et expirants · cookies `httpOnly` / `secure` / `sameSite=lax`, invalidés à la désactivation d'un compte · validation Zod de **toute** entrée serveur · journal d'audit dès le lot 1 · données personnelles minimisées, suppression RGPD effective · aucune donnée réelle en environnement de test · audit de sécurité dédié avant mise en production (étape 10 de votre §23).

### 7.5 Limite honnête

Cette démarche couvre les vulnérabilités applicatives : permissions, fuite de données, jetons, injection, contournement d'interface. Elle **ne remplace pas un test d'intrusion professionnel**. Pour une application privée d'une trentaine d'utilisateurs sans paiement, le niveau est proportionné — mais je préfère l'écrire que le sous-entendre.

---

## 8. Grille de concurrence C1→C6

Nouvelle grille transverse, introduite en v1.0 (voir §3.2). Elle s'applique à **tout point de contention** — c'est-à-dire tout endroit où deux personnes peuvent agir en même temps sur une ressource limitée.

| # | Situation | Attendu |
|---|---|---|
| C1 | Deux acceptations simultanées de demandes incompatibles | Une seule réussit, l'autre reçoit un refus explicite. Jamais de surcapacité |
| C2 | Deux clics simultanés sur le **dernier créneau** d'un objet à apporter | Un seul preneur, l'autre voit « Ce créneau vient d'être pris » |
| C3 | Deux RSVP simultanés sur la **dernière place** d'un événement | Un seul accepté, capacité jamais dépassée |
| C4 | Double activation d'un même jeton d'invitation | Un seul compte créé |
| C5 | Blocage de dates pendant qu'une acceptation est en cours | Ordre déterministe, aucun état incohérent |
| C6 | Double soumission d'un formulaire (double clic, réseau lent) | Idempotence : une seule demande créée |

**Mise en œuvre :** transaction sérialisable avec verrou sur la ligne concernée, revalidation **à l'intérieur** de la transaction, et contrainte d'exclusion PostgreSQL comme filet de sécurité :

```sql
ALTER TABLE stays ADD CONSTRAINT no_overlapping_exclusive_stays
  EXCLUDE USING gist (
    house_id WITH =,
    daterange(start_date, end_date, '[)') WITH &&
  ) WHERE (exclusive AND status = 'CONFIRMED');
```

Contrainte équivalente sur `events` (règle R6 / décision D8) et unicité `(item_id, user_id)` sur les prises en charge.

**Points de contention identifiés :** `STAYDEC` (C1, C5) · `ITEM` (C2) · `RSVP` (C3) · `INVITE` (C4) · `BLOCK` (C5) · tous les formulaires (C6).

---

## 9. Stratégie de non-régression

### 9.1 Règle fondamentale

> **Après chaque modification importante, l'intégralité des tests existants est exécutée.**
> Aucun module n'est déclaré terminé si un test d'un module antérieur est au rouge.

### 9.2 Les quatre niveaux

| Niveau | Déclencheur | Portée | Durée cible |
|---|---|---|---|
| Rapide | Chaque modification de code | Tests unitaires du module en cours | < 10 s |
| Module | Fin d'une fonctionnalité | Module + dépendants directs | < 60 s |
| **Complet** | **Fin de chaque module** | **Toute la suite, tous lots confondus** | **< 5 min** |
| Production | Avant toute mise en ligne | Tout, y compris E2E et responsive | < 15 min |

L'intégration continue exécute la suite complète à chaque enregistrement de code et **bloque** au rouge.

### 9.3 Points de régression identifiés à l'avance

| Modification | Régression redoutée | Suite obligatoirement rejouée |
|---|---|---|
| **`SLEEP` active un contributeur d'occupation** | Surcapacité silencieuse | `OCCUP` + `AVAIL` + `POLICY` + `STAYREQ` + `STAYDEC` + `CAL` |
| Changement de la capacité de la maison | Séjours confirmés devenus invalides | `OCCUP` + `AVAIL` + `HOUSE` + `STAY` |
| Modification du niveau de confidentialité | Fuite de données à l'agenda | `PRIV` + `CAL` + `DASH` + grille S9 |
| Ajout d'un rôle | Toutes les gardes | `PERM` + grille S1→S12 complète |
| Modification du schéma de base | Migrations, données existantes | `SETUP` + suite complète |
| Ajout d'un canal de notification | Doublons, fuites | `NOTIF` + `MAIL` + `REMIND` |

### 9.4 Traitement d'une régression

Tout test qui passe au rouge est un **incident bloquant** : arrêt du développement en cours → identification de la cause → correction → **ajout d'un test qui reproduit précisément la régression** → suite complète relancée. L'incident et sa correction sont consignés au rapport de fin de module.

---

## 10. Tests E2E — 23 parcours

Automatisés avec Playwright sur navigateur réel, base dédiée réinitialisée à chaque campagne, exécutés en **desktop 1440 px et mobile 375 px**.

### 10.1 Vos 18 parcours (§12)

| ID | Parcours | Crit. |
|---|---|---|
| `E2E-001` | Solenne invite un ami | CRITICAL |
| `E2E-002` | L'ami accepte l'invitation et crée son compte | CRITICAL |
| `E2E-003` | L'ami se connecte | CRITICAL |
| `E2E-004` | Solenne crée un événement | HIGH |
| `E2E-005` | L'ami reçoit l'invitation et répond | HIGH |
| `E2E-006` | L'ami indique qu'il dort sur place | HIGH |
| `E2E-007` | L'ami indique ce qu'il apporte | MEDIUM |
| `E2E-008` | L'ami demande un séjour | CRITICAL |
| `E2E-009` | Solenne reçoit la demande | CRITICAL |
| `E2E-010` | Solenne accepte la demande | CRITICAL |
| `E2E-011` | Le séjour apparaît correctement à l'agenda | CRITICAL |
| `E2E-012` | Un autre ami demande les mêmes dates | CRITICAL |
| `E2E-013` | Le moteur calcule correctement la capacité | CRITICAL |
| `E2E-014` | Solenne refuse une demande | HIGH |
| `E2E-015` | Un séjour est annulé | HIGH |
| `E2E-016` | Un événement est déplacé, puis annulé | HIGH |
| `E2E-017` | Un utilisateur désactivé tente d'accéder à l'application | CRITICAL |
| `E2E-018` | Un utilisateur tente d'accéder à des informations interdites | CRITICAL |

### 10.2 Les 5 parcours ajoutés — **validés le 21/08/2026**

| ID | Parcours | Crit. | Pourquoi il manquait |
|---|---|---|---|
| `E2E-019` | Séjour **exclusif** demandé, accepté, puis une autre demande refusée | CRITICAL | La décision D2 n'était couverte par aucun parcours |
| `E2E-020` | Un ami consulte l'agenda et ne voit que **« Maison occupée »**, vérifié sur la réponse serveur | CRITICAL | D4 est la promesse de confidentialité centrale du produit |
| `E2E-021` | Deux amis cliquent « Je m'en charge » sur le **dernier créneau** simultanément | HIGH | Concurrence côté événement (grille C2) |
| `E2E-022` | Parcours complet **au doigt sur mobile 375 px**, de la connexion à la demande de séjour | CRITICAL | L'usage réel sera à 90 % sur téléphone (§20) |
| `E2E-023` | Mot de passe oublié → réinitialisation → reconnexion | HIGH | Parcours de secours vital, jamais testé |

Le détail de chaque parcours (préconditions, étapes, assertions) figure dans `Mode Operatoire - Detail/Lot8-E2E.md`.

---

## 11. Critères de validation

### 11.1 Un module est ✅ VALIDÉ si — et seulement si — les 10 critères sont satisfaits

| # | Critère |
|---|---|
| 1 | Toutes les fonctionnalités de la fiche sont développées |
| 2 | Les règles métier de la fiche sont respectées et vérifiées |
| 3 | 100 % des tests du module passent |
| 4 | Tous les cas limites de la fiche sont testés |
| 5 | Toutes les permissions sont testées, **grille S1→S12 comprise** |
| 6 | La suite de régression complète est au vert |
| 7 | Le comportement mobile est vérifié (320 / 768 / 1440 px) |
| 8 | Aucune erreur critique ni haute priorité connue |
| 9 | Les messages d'erreur sont en français, sans trace technique |
| 10 | Le rapport de fin de module est produit |

**« Le code compile » ne vaut jamais « la fonctionnalité est terminée ».** Un module qui échoue sur un seul critère est ❌ **NON VALIDÉ**, avec la raison explicite.

### 11.2 Rapport de fin de module (format §18)

```
MODULE : XXX — Nom
Statut : ✅ VALIDÉ / ❌ NON VALIDÉ
Fonctionnalités réalisées : …
Tests prévus / réussis / échoués / corrigés / restants : XX / XX / XX / XX / XX
Problèmes rencontrés : …
Corrections réalisées : …
Impact éventuel sur les autres modules : …
Décisions fonctionnelles à confirmer par Yassine : …
```

### 11.3 Checklist avant mise en production (§14)

| # | Vérification | Bloquant |
|---|---|---|
| 1 | Tests unitaires au vert | ✅ |
| 2 | Tests d'intégration au vert | ✅ |
| 3 | Tests E2E au vert — 23 parcours | ✅ |
| 4 | Tests de sécurité au vert — grille S1→S12 sur toutes les cibles | ✅ |
| 5 | Tests de concurrence au vert — grille C1→C6 | ✅ |
| 6 | Tests de régression au vert | ✅ |
| 7 | Tests responsive au vert — 3 tailles | ✅ |
| 8 | Build de production réussi | ✅ |
| 9 | Migrations vérifiées et réversibles | ✅ |
| 10 | Variables d'environnement complètes | ✅ |
| 11 | Aucune erreur critique | ✅ |
| 12 | Logs sans erreur bloquante | ✅ |
| 13 | Sauvegarde configurée et **restauration testée** | ✅ |
| 14 | Documentation à jour | ✅ |
| 15 | Validation visuelle par Yassine (L2) | ✅ |
| 16 | **Aucune photo de démonstration ni capacité provisoire subsistante** (`DEPLOY-013`, `DEPLOY-014`) | ✅ |

### 11.4 Principe « zéro erreur critique » (§20)

> **Aucune erreur critique ou haute priorité connue et non corrigée.**

Un problème MEDIUM ou LOW peut subsister, à trois conditions : **listé explicitement**, **raison de non-correction expliquée**, **planifié**. Je ne masquerai jamais un problème connu pour tenir une date.

### 11.5 Rapport final (§19)

Nombre de modules · tests par catégorie et total · réussis et échoués · problèmes rencontrés, corrigés et résiduels · vérifications sécurité, concurrence, responsive, base de données et déploiement · liste explicite de tout ce qui reste connu et non corrigé.

---

## 12. Conventions

### 12.1 Identifiants de test

| Forme | Usage | Exemple |
|---|---|---|
| `PRÉFIXE-NNN` | Test fonctionnel | `AVAIL-012` |
| `PRÉFIXE-Snn` | Test de sécurité, grille S1→S12 | `PRIV-S09` |
| `PRÉFIXE-Cnn` | Test de concurrence, grille C1→C6 | `STAYDEC-C01` |
| `PRÉFIXE-CT-nn` | Test de contrat | `OCCUP-CT-03` |
| `E2E-NNN` | Parcours de bout en bout | `E2E-019` |

Numérotation continue par module, **jamais réutilisée** : un test supprimé laisse son numéro vacant, ce qui garde l'historique lisible.

### 12.2 Criticité

| Niveau | Signification | Conséquence |
|---|---|---|
| **CRITICAL** | Perte de données, faille de sécurité, fonction vitale hors service | Bloque la mise en production |
| **HIGH** | Fonctionnalité majeure dégradée | Bloque la mise en production |
| **MEDIUM** | Gêne réelle, contournement possible | Peut être différé, avec justification |
| **LOW** | Confort, détail visuel | Peut être différé |

### 12.3 Types

`Unit` · `Integration` · `E2E` · `Security` · `Concurrency` · `Regression` · `Responsive`

### 12.4 Codes d'erreur métier

Chaque refus porte un code stable et un message français. Les codes servent aux tests, les messages aux humains.

| Code | Message utilisateur |
|---|---|
| `BLOCKED_PERIOD` | « Ces dates ne sont pas disponibles. » |
| `CAPACITY_EXCEEDED` | « La maison serait à {n} personnes pour {max} places. » |
| `EXCLUSIVE_CONFLICT` | « La maison est déjà privatisée sur ces dates. » |
| `EXCLUSIVE_REQUEST_CONFLICT` | « La maison est déjà occupée sur ces dates : la privatisation n'est pas possible. » *(reformulé à `AVAIL-C` : un événement seul suffit désormais à refuser une privatisation ; nommer le séjour dirait à un ami ce qui se passe dans la maison, contre D4)* |
| `EVENT_OVERLAP` | « Un autre événement est déjà prévu sur ce créneau. » |
| `MIN_LEAD_TIME` | « Il faut demander au moins {n} h à l'avance. » |
| `MAX_ADVANCE` | « Les demandes sont possibles jusqu'à {n} jours à l'avance. » |
| `MAX_DURATION` | « Un séjour ne peut pas dépasser {n} nuits. » |
| `FORBIDDEN_WEEKDAY` | « Les arrivées ne sont pas possibles ce jour-là. » |
| `INVALID_DATES` | « La date de départ doit être après la date d'arrivée. » |
| `PAST_DATES` | « Ces dates sont déjà passées. » |

### 12.5 Ordre de travail pour chaque module

```
1. Fiche module (11 sections)               6. Grille de concurrence si contention
2. Cas de test rédigés      ← AVANT le code 7. Régression complète
3. Tests automatisés (ils échouent)         8. Vérification mobile
4. Développement jusqu'au vert              9. Rapport de fin de module
5. Grille de sécurité S1→S12               10. Mise à jour de ce document
```

---

## 13. Index des fiches détaillées

| Fichier | Contenu |
|---|---|
| `Mode Operatoire - Detail/Lot0-Fondations.md` | `SETUP` · `CORE` · `UI` |
| `Mode Operatoire - Detail/Lot1-Identite.md` | `PERM` · `AUTH` · `PWD` · `INVITE` · `PROFILE` · `USERS` |
| `Mode Operatoire - Detail/Lot2-Maison-Agenda.md` | `HOUSE` · `SPACE` · `BLOCK` · `PRIV` · `CAL` |
| `Mode Operatoire - Detail/Lot3-Sejours.md` ★ | `OCCUP` · `AVAIL` · `POLICY` · `STAYREQ` · `STAYDEC` · `STAY` |
| `Mode Operatoire - Detail/Lot4-Evenements.md` | `EVENT` · `RSVP` · `SLEEP` |
| `Mode Operatoire - Detail/Lot5-Vie-Evenement.md` | `ITEM` · `COMMENT` |
| `Mode Operatoire - Detail/Lot6-Notifications.md` | `NOTIF` · `MAIL` · `REMIND` |
| `Mode Operatoire - Detail/Lot7-Finition.md` | `DASH` · `HIST` · `UX` · `DEPLOY` |
| `Mode Operatoire - Detail/Lot8-E2E.md` | Les 23 parcours détaillés |

Chaque fiche suit la structure imposée par votre §5 :

```
1. Objectif             5. Permissions (dont interdits absolus)   9. Risques
2. Fonctionnalités      6. Dépendances                           10. Critères d'acceptation
3. Données manipulées   7. Cas nominaux                          11. Cas de test
4. Règles métier        8. Cas limites
```

---

## 14. Gouvernance et journal

### 14.1 Document vivant

Mis à jour à chaque : changement de règle métier · ajout ou suppression de module · ajout ou modification de test · changement d'architecture · découverte d'une vulnérabilité · déplacement d'une fonctionnalité vers le post-MVP · fusion de tests redondants (§1.5).

### 14.2 Versionnage

`MAJEURE.MINEURE` — majeure à chaque validation formelle de votre part, mineure en cours de route.

### 14.3 Journal des modifications

| Version | Date | Modification |
|---|---|---|
| 0.1 | 21/08/2026 | Création — version Light : 33 modules, 18 parcours E2E, grille de sécurité |
| **1.0** | **21/08/2026** | **Version complète.** Découpage révisé : 33 → 32 modules (5 regroupements, 4 découpages). Éclatement d'`AVAIL` en `OCCUP` + `AVAIL` + `POLICY`. Traitement structurel du problème d'occupation par registre de contributeurs (§6). Descente du journal d'audit du lot 7 au lot 1. Ajout de la grille de concurrence C1→C6. Ajout des parcours `E2E-019` à `E2E-023`. Arbitrages §1.2, §1.4 et §1.5 validés par Yassine. Rédaction des 32 fiches et des 567 cas de test |
| 1.1 | 21/08/2026 | Arbitrage du traitement de l'occupation : **option B (registre de contributeurs) retenue** par Yassine, après comparaison avec l'option A (modification du calcul au lot 4) et l'option C (réordonnancement des lots). Consigné au §6.1 |
| 1.3 | 21/08/2026 | **Lot 0 livré.** Trois corrections de la spécification, constatées au contact du code : (a) le modèle du §4 décrit **25 tables**, pas 18 — `SETUP-006` annonçait un chiffre obsolète ; (b) le jeu de démonstration suit `04_Contenu_a_fournir.md` (capacité **10**, **5** chambres, 2 bureaux) et non les valeurs de `SETUP-009` (capacité 12, 3 chambres), antérieures à la v1.2 ; (c) ajout de la table `password_reset_tokens`, exigée par le module `PWD` et absente du §4. Choix techniques arrêtés : Next 15.5 · Prisma 7 avec adaptateur `pg` · Zod 4 · Vitest 4 · Playwright. Contraintes d'exclusion PostgreSQL et journal d'audit en écriture seule posés **dès le lot 0**, avant tout code métier |
| 1.4 | 21/08/2026 | **Lot 1 livré** — `PERM`, `AUTH`, `PWD`, `INVITE`, `PROFILE`, `USERS`, 118 cas au vert. Trois défauts de fond corrigés au passage : (a) `sessionCourante()` avalait le signal par lequel Next indique qu'une page devient **dynamique**, si bien que les écrans privés étaient prégénérés et la construction de production échouait — toute erreur portant un `digest` est désormais relancée (`src/server/flux-next.ts`) ; (b) un composant client importait une limite depuis un module `server-only` — les règles pures d'image sont descendues dans `src/domain/core/images.ts` ; (c) l'émission d'invitation écrivait une empreinte provisoire avant de la remplacer, laissant une invitation inutilisable en cas de panne entre les deux écritures. Campagne responsive refondue : **11 écrans sur 12** en 320 / 768 / 1440 px, avec un projet de préparation qui rejoue le jeu de démonstration et ouvre deux sessions. Nouveau fichier `tests/e2e/acces.spec.ts` : `AUTH-S01`, `PERM-S01`, `PERM-S05`, `PERM-S08` et `PROFILE-010` vus depuis le navigateur |
| 1.5 | 21/08/2026 | **Module `HOUSE` livré** — 20 cas au vert, en trois arrêts (informations et photos · capacité · règles). Cinq constats au contact du code : (a) **dépendance inversée** entre `HOUSE` et `OCCUP` — `HOUSE-R2` exige de connaître l'occupation, or seul `OCCUP` a le droit de compter (règle n°3) ; le registre de contributeurs du §6.1 est donc posé dès maintenant dans `src/domain/occupancy/`, avec ses trois contributeurs déclarés et deux dormants, le lot 3 le complétant sans le réécrire (problème P5) ; (b) `HOUSE-R6` — conserver le texte exact d'une règle acceptée — est impossible sans historique : ajout de la table **`house_rule_versions`** et d'un compteur `version` sur `house_rules`, portant le modèle à **26 tables** ; (c) l'effectif d'un séjour est **adultes + enfants**, `stay_guests` nommant ces mêmes personnes (problème P6) ; (d) `P2034`, le conflit de transaction sérialisable, se présentait comme un incident technique alors que c'est une écriture concurrente : il est désormais converti en `CONFLICT` (grille C6) ; (e) validation visuelle de Yassine obtenue — **P3 levé**, `UI` formellement clos. Deux codes d'erreur ajoutés : `TOO_MANY_PHOTOS`, `CAPACITY_BELOW_OCCUPANCY`. Les 15 photos réelles fournies par Yassine entrent dans le jeu de démonstration — **dette D-a levée** |
| 1.6 | 21/08/2026 | **Module `SPACE` livré** — 12 cas au vert, en un seul arrêt. Aucun défaut de spécification : le module s'est écrit sur les fondations de `HOUSE` (gardes, audit, transactions sérialisables, galerie). Une seule retouche de code existant — `ajouterPhoto()` prend sa borne en paramètre, la maison en tolère 30 photos, une pièce 10. `SPACE-R3` est tenu comme un **repère et non comme un verrou** : le calcul est pur (`coherenceCouchages`), affiché par la console, et aucune écriture n'est jamais refusée pour cet écart — c'est l'exact inverse de `HOUSE-R2`, et les confondre aurait donné à Solenne un blocage dont personne n'a besoin. `SPACE-R5` tenu par l'absence : aucune action n'écrit `space_assignments`. Les chambres prennent les noms des photos de Yassine (*blanche, jaune, verte, mansardée*, bureaux *de Julien* et *de Solenne*) ; les **6 dernières photos** entrent dans le jeu de démonstration — **dette D-a entièrement close**. Un second défaut de rendu invisible aux mesures automatiques — en 768 px, la carte de la seule pièce sans photo s'étirait à vide — a été repéré **à l'œil sur une capture** et corrigé par une vignette de repli ; les captures des écrans sont désormais produites par `tests/e2e/apercus.spec.ts`. Aucun nouveau code d'erreur |
| 1.7 | 22/08/2026 | **Périmètre coupé en deux vagues pour raison de budget** (§2.1). Yassine plafonne la suite à 50 € d'appels API après ~100 € consommés ; les 21 modules restants n'y tiennent pas. Vague 1 — 10 modules : `BLOCK`, `PRIV`, `CAL`, `OCCUP`, `AVAIL`, `POLICY`, `STAYREQ`, `STAYDEC`, `STAY`, `DEPLOY` — donne une application en ligne et utilisable. Vague 2 — 11 modules, 165 cas — reportée sans rien supprimer : fiches, cas de test, tables et contributeurs dormants restent en place, `DORMEUR_ÉVÉNEMENT` compris. Le seul report qui touche la qualité livrée est `UX`. Méthode économique M1→M5 adoptée en parallèle (§2.2) : Sonnet par défaut et Opus réservé à `OCCUP` et `AVAIL`, E2E 320 px par module et trois tailles par lot, captures non chargées en contexte, rapports courts, session neuve par module. Objectif : ~3 € par module au lieu de ~8 €, sans céder sur les 10 critères du §11.1 |
| 1.8 | 22/08/2026 | **Module `BLOCK` livré** — 13 cas sur 14 au vert, en un seul arrêt. `BLOCK-011` (création au cliquer-glisser) **déplacé au module `CAL`** : le geste suppose un agenda qui n'existe pas encore (P8). Quatre constats : (a) `BLK-R1` — un blocage interdit toute demande — est écrit dès maintenant dans `verifierPeriodeLibre`, un seul endroit que `AVAIL`, `STAYREQ` et `STAYDEC` consommeront, même parti qu'`OCCUP` au module `HOUSE` ; (b) le refus de `BLK-R3` n'avait pas de code au §12.4 — `BLOCKED_PERIOD` désigne le refus inverse — d'où l'ajout de `BLOCKED_OVER_STAY`, catalogue à 41 messages ; (c) premier test de concurrence réelle du projet (`BLOCK-C05`, point `C5` du §8) : blocage et confirmation de séjour lancés ensemble, exactement une écriture aboutit ; (d) **troisième défaut de rendu invisible aux mesures en trois modules** — un libellé coupé en plein mot en 320 px — d'où une capture désormais cadrée sur la section livrée, en plus des pages entières. Le signalement des demandes en attente de `BLOCK-008` est porté par la console faute de tableau de bord en vague 1 (P9) |
| 1.9 | 22/08/2026 | **Module `PRIV` livré** — 16 cas sur 20 au vert, en un seul arrêt. Les quatre restants (`PRIV-008`, `013`, `014`, `015`) portent sur des **événements** ou des **notifications**, lots 4 et 6, reportés en vague 2 : ils restent dans la fiche, à jouer quand leur objet existera (P10). Cinq constats : (a) **le message `CAPACITY_EXCEEDED` du §12.4 était une fuite** — « La maison serait à {n} personnes pour {max} places » est destiné à un **ami**, et ces deux nombres lui apprennent combien de personnes occupent déjà la maison, séjour `HIDDEN` compris (PRIV-R5, R6) ; réécrit en « La maison n'a plus assez de place sur ces dates. Essayez d'autres dates. », le détail chiffré étant rendu à `STAYDEC` sur l'écran de Solenne, où il est légitime — **seul des 11 refus du §12.4 modifié depuis le début du projet** ; (b) le motif, le commentaire et les besoins vivent sur la **demande** et non sur le séjour, un séjour créé par Solenne n'en ayant pas — le sérialiseur les lit à travers la relation `request` ; (c) la confidentialité est portée par le **type de sortie** : `SejourNomme` et `SejourDetaille` forment une union, `SejourNomme` n'a pas de champ `commentaire`, si bien qu'aucun oubli d'interface ne peut le laisser passer (règle non négociable n°4 tenue par le compilateur) ; (d) `occupationDuCercle()` force `estAdministratrice: false` **même pour Solenne** — c'est l'action qui décide de ce qu'elle envoie, pas l'appelant de ce qu'il mérite ; (e) **premier module sans défaut de rendu en quatre** — la section a été cadrée et regardée avant d'être déclarée finie, la leçon des trois précédents ayant servi. Aucun nouveau code d'erreur, aucune migration : `stays.privacyLevel` et `booking_settings.defaultStayPrivacy` existaient depuis le lot 0, tous deux à `BUSY_ONLY` par défaut (D4) |
| 1.10 | 22/08/2026 | **Décision D9 — les séjours de Solenne sont plus visibles par défaut**, tranchée par Yassine à la lecture du rapport `PRIV`. Ils partent en `FULL` (« prénom et nombre de personnes ») quand ceux du cercle partent en `BUSY_ONLY` (D4). Ce n'est pas une entorse à D4 mais son revers : D4 protège l'invité qui n'a rien demandé, pas la maîtresse de maison qui annonce sa présence chez elle. Trois points de mise en œuvre : (a) `NIVEAU_PAR_DEFAUT_SOLENNE` et `niveauParDefaut({ estSejourDeSolenne, reglage })` dans `src/domain/privacy/visibilite.ts` — **une seule définition du défaut**, celle que `STAYDEC` appellera via `visibiliteParDefaut(client, { sejourDeSolenne: true })` ; (b) le **réglage global ne peut pas abaisser** le défaut de Solenne : il répond à « ce que mes amis montrent d'eux », pas à « ce que je montre de moi » ; (c) le défaut reste un **point de départ** — elle abaisse le niveau séjour par séjour (PRIV-011), et la console le lui dit sous le réglage global. Aucune migration : le champ `stays.privacyLevel` porte déjà la valeur, seule la valeur initiale change |
| 1.11 | 22/08/2026 | **Module `CAL` livré et lot 2 clos** — 16 cas au vert, plus `BLOCK-011` récupéré du module `BLOCK` : **P8 levé**. Le lot 2 est validé à **78 cas sur 82**, les quatre restants relevant de lots reportés (**P10**, ajouté au tableau des problèmes où il manquait depuis la v1.9). Trois vues — Mois, Semaine, Liste — sur une seule adresse, alimentées par les deux lectures de `PRIV` **sans aucun filtrage supplémentaire** : un ami et Solenne ne reçoivent pas le même jeu de données, ils ne reçoivent pas le même jeu **filtré différemment** (CAL-R1). Quatre constats : (a) `CAL-R5` est tenu **par construction et non par précaution** — les jours du domaine sont des quantièmes calés à minuit UTC, si bien qu'un séjour du 24 au 27/10/2026, week-end du changement d'heure, n'a pas d'heure à décaler et compte trois nuits sans arrondi ; (b) `Intl` écrit « 1 septembre » : correction dans `src/domain/core/dates.ts` par `mettreEnForme()`, qui reprend la seule **partie `day`** du résultat — quatre formats en bénéficient, l'agenda comme les courriers ; (c) les lignes des bandes sont attribuées pour **tout le mois** et non semaine par semaine, seul endroit du module où la lisibilité a coûté de la densité — une attribution hebdomadaire fait sauter un séjour de ligne au passage du dimanche ; (d) le cliquer-glisser de `BLOCK-011` est armé par un bouton explicite, faute de quoi la grille cesserait de défiler au doigt, et reste un **raccourci** — le même blocage se pose au clavier depuis la console. Deux fonctionnalités de la fiche sont sans objet avant le lot 4 (**P11**) : cartes photo d'événement et éléments à l'heure ; la catégorie `EVENEMENT` et les champs `debut` / `fin` sont posés et **dormants**, même parti que le registre d'`OCCUP`. Second module d'affilée sans défaut de rendu. Aucun nouveau code d'erreur, aucune migration. Régression complète : **1 min 59 s** pour 1 053 vérifications. **Jugement visuel (L2) obtenu le 22/08/2026** sur les captures des trois tailles : le lot 2 est validé sur ses 10 critères et versé au dépôt |
| 1.12 | 22/08/2026 | **Module `OCCUP` livré, lot 3 ouvert** — 34 cas au vert (8 de contrat, 26 numérotés), en deux arrêts : `OCCUP-A` (Opus) a figé le contrat `occupationSur(période) → { total, parSource, jours }` et le registre de contributeurs ; `OCCUP-B` (Sonnet) a exercé le reste — périodes dégénérées, détail par source, pic d'occupation, volume, exclusion et la **sentinelle** `OCCUP-024`, qui énumère `REGISTRE` dynamiquement et échoue si un contributeur est ajouté sans être sommé. Trois constats : (a) `OCCUP-018` (une personne comptée une seule fois malgré deux sources) ne peut pas s'écrire littéralement avant le lot 4 — `DORMEUR_ÉVÉNEMENT` étant dormant, une présence sous ce contributeur est filtrée avant la déduplication ; rejoué avec deux séjours confirmés partageant un occupant, le mécanisme éprouvé est identique et `SLEEP` le rejouera tel quel ; (b) grille de sécurité S1→S12 **sans objet, vérifié et non supposé** — `src/server/occupation.ts` ne porte aucune Server Action et n'est consommé que par du code serveur interne ; (c) aucun outil de couverture dans le dépôt : le critère « couverture 100 % » a été vérifié à la main, fonction par fonction, plutôt que par l'ajout d'une dépendance pour produire un chiffre. Aucun nouveau code d'erreur, aucune migration : `OCCUP` ne touche pas la base |
| 1.13 | 22/08/2026 | **Module `AVAIL` ★ livré, l'application devient arbitrable** — 35 cas au vert, en trois arrêts : `AVAIL-A` (Opus) a figé la forme d'un refus et le garde-fou **G1** — `AVAIL` consomme `OCCUP` et ne compte jamais, `AVAIL-CT-01` le vérifie deux fois, par le comportement et par la forme du code ; `AVAIL-B` (Sonnet) a posé R5 à R8 ; `AVAIL-C` (Opus) a croisé les huit règles. Quatre constats : (a) **la seule faute du module n'était visible qu'en combinaison** — R7 dit qu'un séjour pendant un événement est le cas nominal (D3) et n'a donc aucun code ; R3 refusait une privatisation sur une maison occupée, mais ne regardait que les séjours et l'occupation. Une maison sans un seul dormeur un jour de fête passait pour libre, et `AVAIL-031` aurait accordé la privatisation. Le contexte porte désormais `evenements` — **sans effectif**, G1 tenu — et R3 les compte parmi les occupants ; (b) le message d'`EXCLUSIVE_REQUEST_CONFLICT` disait « un séjour est déjà prévu » : faux depuis (a), et contraire à D4, qui interdit de dire à un ami *ce qui* occupe la maison. Reformulé au §12.4 en « la maison est déjà occupée sur ces dates » — **seul message du catalogue réécrit depuis sa rédaction** ; (c) `AVAIL-034` remplace la matrice écrite à la main par une **table de leviers** : un geste minimal par règle, les 8 leviers seuls et leurs 28 paires, le verdict attendu lu dans `ORDRE_GRAVITE` et non rejoué par le moteur. Elle démontre autant ce que R5 et R7 **ne refusent jamais** que ce que les six autres refusent ; (d) **R6 est absent de cette table, et un cas le dit** : `verifierChevauchementEvenements` applique D8 mais reste dormant — `EVENT` (lot 4) l'appellera. Deux événements qui se chevauchent ne font pas refuser un séjour, et ce moteur-ci n'a pas à en rendre compte. Grilles S1→S12 et C1→C6 **sans objet, vérifié et non supposé** : `grep -rln availability src` ne rend que le module lui-même — fonction pure, aucune Server Action, aucune contention. Aucun nouveau code d'erreur, aucune migration. Régression complète : **731 Vitest (46 s) + 448 Playwright, 6 ignorés (1 min 12)**. Fin du lot 3 en vue : restent `POLICY`, `STAYREQ`, `STAYDEC` ★ et `STAY` |
| 1.14 | 22/08/2026 | **Module `POLICY` livré** — 15 cas sur 16 au vert, en deux arrêts : `POLICY-A` (Sonnet) a posé les huit réglages en domaine pur (`verifierReglages`, POL-R1, POL-R2) ; `POLICY-B` (Sonnet) a ajouté la persistance, la console de Solenne et la cohérence des réglages entre eux (`verifierCoherence`, POL-R5, POL-R9). `POLICY-012` (Solenne hors règles, cas `Integration`) reste dans la fiche : il suppose une vraie demande de séjour, que seul `STAYREQ` créera — la règle elle-même (POL-R1) est déjà prouvée en domaine pur, même parade que les cas reportés de `PRIV` (P10). Quatre constats : (a) **`RefusReglage` et `IncoherenceReglage` ne portent jamais `Regle`/`R8`** — `POLICY` dépend de `HOUSE` seul (§5) ; c'est `STAYREQ`, futur appelant, qui enveloppera un refus en `conflit('R8', code)` avant de le tendre à `AVAIL` (délégation déjà écrite à `AVAIL-B`) ; (b) **`max_guests`, `max_stay_nights`, `min_lead_time_hours`, `max_advance_days` deviennent nullables** en base (migration `lot3_policy_reglages_optionnels`) — `null` porte lui-même l'état « règle désactivée » (POL-R2), sans colonne `actif` séparée ; (c) POL-R9, absent de la fiche à l'écriture des cas, a été ajouté en cours d'arrêt : un délai minimum dépassant l'horizon maximum, ou les sept jours de la semaine interdits à la fois, rendraient toute demande impossible — exactement le risque que le critère 10 de la fiche («aucune combinaison ne peut rendre l'application inutilisable sans avertissement explicite ») nomme ; enregistrer de tels réglages est désormais un refus dur, pas un avertissement ; (d) le signalement des demandes en attente (POL-R4) réutilise **le même contrat que `HOUSE-R3`** — la liste des demandes devenues incompatibles est **rendue**, jamais bloquante, à charge pour Solenne d'en faire ce qu'elle veut dans sa console. Un code d'erreur ajouté (`MAX_PARTY_SIZE`) et une nouvelle catégorie `CODES_POLICY` (`POLICY_UNREACHABLE`, `MAX_PARTY_ABOVE_CAPACITY`). Régression complète : **765 Vitest (~46 s) + 448 Playwright, 6 ignorés (1 min 12)**. Fin du lot 3 en vue : restent `STAYREQ`, `STAYDEC` ★ et `STAY` |
| 1.2 | 21/08/2026 | Démarrage avec contenus provisoires acté : photos sous licence libre, capacité provisoire à 10, 4 chambres et 2 bureaux fictifs, domaine non arrêté (`chezsolenne.fr` ou `mamasolenne.fr`). Ajout de `DEPLOY-013` et `DEPLOY-014` — les contenus provisoires bloquent la mise en production. Nom de la maison et domaine deviennent des paramètres, jamais des textes en dur. Création de `04_Contenu_a_fournir.md` |
| 1.15 | 22/08/2026 | **Module `STAYREQ` livré, `POLICY` clos à 16 sur 16** — 20 cas au vert, en deux arrêts : `STAYREQ-A` (Sonnet) a posé les Server Actions créer/consulter/modifier/annuler et la composition R8 (`evaluerDemande`) ; `STAYREQ-B` (Sonnet) a ajouté l'assistant en trois étapes (dates → participants → informations), la disponibilité en direct et le récapitulatif. Quatre constats : (a) **`POLICY-012` est enfin prouvable** — `STAYREQ` est le premier module qui crée une vraie demande de séjour ; un test d'intégration fait échouer un réglage restrictif (`maxGuests: 1`) pour un ami puis le fait passer pour Solenne (POL-R1), fermant le report ouvert depuis le rapport `POLICY` ; (b) **la disponibilité en direct ne compte jamais elle-même** — l'assistant interroge une nouvelle Server Action, `verifierDisponibiliteSejour`, qui ne fait qu'appeler la même évaluation que la création et ne persiste rien (règle non négociable n°3) ; le bouton d'envoi devient « Envoyer quand même » quand elle répond incompatible, exactement SREQ-R4 ; (c) **une case à cocher native rate la cible tactile de 44 px** (UI-002) — le geste de `ChoixRadio` (entrée masquée en `sr-only`, étiquette entière cliquable) n'avait pas d'équivalent pour un choix binaire ; ajout de `CaseACocher` dans `src/components/ui/`, utilisée pour la privatisation et l'acceptation des règles, qui aurait sinon fait échouer `STAYREQ-018` en silence — la case restait visible, seulement trop petite ; (d) l'indicateur d'étapes débordait à 320 px avec ses trois intitulés complets (« Participants », « Informations ») : seule l'étape courante garde son libellé en dessous de `sm`, les deux autres ne montrent que leur numéro. Aucun nouveau code d'erreur, aucune migration. Régression complète : **795 Vitest (~47 s) + 455 Playwright, 8 ignorés (~1 min 15)**. Lot 3 : restent `STAYDEC` ★ et `STAY` |
| 1.16 | 22/08/2026 | **`STAYDEC` ★ à l'arrêt A — la transaction de décision tient** : 8 cas sur 19 au vert (`001`, `005`, `006`, `011`, `014`, `C01`, `C05`, `C06`), plus 18 assertions de domaine pur. L'arrêt précédent avait écrit le code avant les tests pour tenir le plafond de session ; les tests écrits ensuite ont trouvé trois choses. (a) **Le refus « il faut confirmer » portait un code générique.** `STAYDEC-C01` exige que le perdant de la course reçoive `CAPACITY_EXCEEDED`, et `Echec` n'a de place que pour **un** code : il porte désormais celui du conflit — la raison, pas la consigne — et `DECISION_CONFLICT_UNCONFIRMED` devient la phrase ajoutée derrière (« La maison serait à 12 personnes pour 10 places. Confirmez explicitement pour accepter quand même. »). Conséquence pour `STAYDEC-B` : l'écran ne peut pas déduire « forçable » du refus d'écriture, il lui faudra une action de lecture rendant le verdict complet, sur le modèle de `verifierDisponibiliteSejour`. (b) **La grille de concurrence a trouvé un défaut que les 18 cas de la fiche ne couvraient pas.** C1 et C5 étaient couverts ; C2/C3/C4 sont hors d'atteinte, vérifié par les écritures réelles du fichier ; **C6 manquait**. Le double clic sur « Accepter » laissait bien un seul séjour — l'index unique `stays_request_id_key` tenait — mais rendait `CONFLICT`, « quelqu'un a modifié en même temps », là où SDEC-R6 prévoit « cette demande a déjà été traitée ». L'invariant était sauf, le message faux. La violation d'unicité (`P2002` / `23505`) rejoint `40001` dans les courses rejouées : la transaction relit la demande, la trouve `ACCEPTED`, et rend le bon refus. **Cas `STAYDEC-C06` ajouté à la fiche** — lot 3 à 125 cas, total du projet à 570. (c) **Écart assumé avec la mise en œuvre du §8**, qui prescrit un verrou sur la ligne concernée : il n'y en a pas, et il n'apporterait rien — sous `Serializable`, verrouiller une ligne qu'une transaction concurrente vient de mettre à jour lève de toute façon `40001`. Le verrou déplacerait le code d'erreur sans supprimer le rejeu, qui est le mécanisme, les deux contraintes d'exclusion restant le filet. Les deux autres exigences du §8 sont tenues à la lettre. Deux corrections mineures au passage : l'audit d'une acceptation forcée garde le **code** du conflit et plus seulement sa phrase (un message se réécrit, un code jamais) ; et la sentinelle de schéma, **rouge avant cette session**, est remise au vert — le `down.sql` de la migration d'exclusivité stricte manquait et `SETUP-006`/`SETUP-007` ignoraient la nouvelle contrainte (dette **D-b** confirmée au passage). Régression : **821 Vitest (48 s)**, `tsc` et `eslint` muets. Playwright non rejoué — aucun écran touché à cet arrêt |
| 1.17 | 22/08/2026 | **`STAYDEC` ★ clos à `STAYDEC-B` — 19 cas sur 19, lot 3 à un module de sa fin.** Onze cas ajoutés (`002→004`, `007→010`, `012`, `013`, `S02`, `S06`), trois Server Actions et une action de lecture, un écran. (a) **Le verdict de lecture, promis par l'entrée 1.16, existe** : `verifierDecisionSejour` rejoue `evaluerAcceptation` hors transaction — mêmes lectures que `accepterDemandeSejour`, mais sur `db`, jamais sur un client de transaction — et rend `confirmationSuffirait`, les conflits chiffrés (`resumePourSolenne`) et l'occupation avant/avec la demande. SDEC-R2 tient : cette lecture n'est jamais réutilisée par l'écriture, qui revalide tout elle-même. (b) **Refus (SDEC-R5) et contre-proposition (SDEC-R8) n'ont pas eu besoin de la machinerie de l'arrêt A** — le §9 de la fiche ne classe `CRITICAL` que la course à l'acceptation ; une transaction ordinaire suffit à garder écriture, notification et audit solidaires, avec `verifierDecidable` (déjà écrite à l'arrêt A) revérifiée avant chacune. La contre-proposition change les dates et laisse `status: 'PENDING'` sans toucher `decidedById`/`decidedAt`/`decisionNote` — ce n'est pas une décision. (c) **La file d'attente (`STAYDEC-013`) trie sur deux critères tenus ensemble** : arrivée croissante (l'urgence), dépôt croissant à égalité (l'ancienneté) — la fiche demandait les deux, un seul tri les sert sans les opposer. (d) **Écran `/gerer`** : section « Demandes de séjour » au-dessus de la console existante, verdict chargé à l'ouverture de chaque demande, trois choix (accepter avec confirmation si besoin, refuser avec motif obligatoire, proposer d'autres dates). Aucun problème d'écran cette fois — le contexte de disponibilité et le composant `CaseACocher` étaient déjà en place depuis `STAYREQ`. Aucun nouveau code d'erreur (le motif obligatoire se tient en Zod, pas en domaine), aucune migration. Régression complète : **832 Vitest (~49 s)**, `tsc` et `eslint` muets ; Playwright rejoué sur l'écran `/gerer` aux trois tailles (320/768/1440), 29 vérifications au vert. Lot 3 : reste `STAY`, dernier module de la vague 1 avant sa clôture |
| 1.18 | 26/08/2026 | **`STAY` livré, les six modules du lot 3 sont clos** — 10 cas sur 10, en un seul arrêt (Sonnet), plus deux cas de sécurité (`S02`, `S04`) et un cas de concurrence hors fiche. Quatre constats : (a) **la création directe dispute la même ressource que l'acceptation** (`STAYDEC-A`) — `creerSejourPersonnel` rejoue `evaluerDemande` dans une transaction `Serializable`, avec le même rejeu de course ; `avecRejeuSerialisable` est donc **extrait** de `decisions-sejour.ts` vers `src/server/transaction-serialisable.ts`, `STAY` et `STAYDEC` n'en gardant plus qu'une seule définition. Un test de concurrence dédié (création directe contre acceptation, même capacité) le démontre, sur le modèle de `STAYDEC-C01` ; (b) **annuler ne dispute rien** — ça ne fait que retirer une occupation, aucune course possible : une transaction ordinaire suffit, même choix que le refus et la contre-proposition de `STAYDEC-B` ; (c) **« passé » se lit sur la date de départ, jamais sur le seul statut** (`verifierAnnulable`, `sejourEstPasse`) — le traitement quotidien qui bascule `CONFIRMED` en `COMPLETED` (`cloturerSejoursTerminees`, délibérément pas une Server Action : rien n'a de session à minuit, `DEPLOY` la branchera sur une tâche planifiée) n'a pas besoin d'être passé pour qu'un séjour terminé refuse déjà son annulation ; (d) **un test écran ciblait la mauvaise ligne** — le jeu de démonstration porte déjà un séjour personnel confirmé de Solenne, qu'un simple préfixe de texte (« Solenne · ») ne distingue pas de celui que le test vient de créer ; le clic « Annuler » `.last()` tombait sur la ligne de démonstration, laissant le séjour du test intact. Corrigé en comptant les lignes plutôt qu'en lisant un texte de date formaté — aucun défaut d'application, l'annulation elle-même était déjà correcte sur ce qu'elle ciblait. Un code d'erreur ajouté (`STAY_NOT_CANCELLABLE`), une migration (`cancel_reason` sur `stays`). Régression complète : **852 Vitest (~50 s)**, `tsc` et `eslint` muets ; E2E rejoué sur `/gerer` et `/sejours` en 320 px, 5 vérifications au vert (les deux autres tailles attendent la clôture du lot, mesure M2). **Lot 3 : les six modules sont clos. Reste la clôture du lot** — trois tailles, régression complète, rapport, jugement visuel L2 — avant `DEPLOY` |

### 14.4 Documents de référence

| Document | Rôle |
|---|---|
| `01_DemandeInitiale.txt` | Cahier des charges, annoté `{Modification Yassine}` |
| `02_Analyse_Architecture.md` | Architecture, modèle de données, écrans, décisions D1→D8 |
| `03_Instructions avant les développements.txt` | Exigences de méthode et de qualité |
| **`Mode Operatoire.md`** | **Ce document — référence obligatoire pendant toute la réalisation** |
| `Mode Operatoire - LIGHT.md` | Version lisible sans connaissance technique, destinée à la validation |
| `Mode Operatoire - Detail/` | Les 32 fiches modules et les 558 cas de test |
