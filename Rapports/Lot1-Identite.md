# Lot 1 — Identité · rapports de fin de module

Format imposé par le §11.2 du Mode Opératoire.
Suite complète au vert le 21/08/2026 : **319 vérifications Vitest** (31 s) +
**289 vérifications Playwright** sur 320 / 768 / 1440 px (1 min 12 s).
Régression totale **1 min 43 s**, très en deçà des 5 minutes du §9.

Les 118 cas de test du lot sont réalisés par **182 vérifications Vitest** —
un cas de la fiche se traduit souvent par plusieurs assertions distinctes.

| Module | Cas de la fiche | Vérifications | Réussis | Échoués | Restants |
|---|---|---|---|---|---|
| `PERM` | 26 | 36 | 36 | 0 | 0 |
| `AUTH` | 24 | 30 | 30 | 0 | 0 |
| `PWD` | 18 | 27 | 27 | 0 | 0 |
| `INVITE` | 24 | 34 | 34 | 0 | 0 |
| `PROFILE` | 12 | 26 | 26 | 0 | 0 |
| `USERS` | 14 | 29 | 29 | 0 | 0 |
| **Total** | **118** | **182** | **182** | **0** | **0** |

---

## MODULE : PERM — Permissions & audit

**Statut : ✅ VALIDÉ**

### Fonctionnalités réalisées
Gardes `requireUser()` et `requireRole('ADMIN')` en première ligne de chaque
Server Action · rôle et identité **relus en base à chaque appel**, jamais pris
dans la charge utile · refus neutre `refusNeutre()` / `exigerAcces()` :
ressource absente et ressource interdite produisent le même refus · sessions
opaques adossées à une ligne en base, donc révocables à la seconde · journal
d'audit avec acteur, action, entité, différentiel avant/après, adresse IP et
horodatage · anti-saturation du journal sur une minute glissante par acteur et
par action.

Le journal d'audit est en écriture seule, garanti par les trois déclencheurs
PostgreSQL posés au lot 0 : le module n'expose **aucune** fonction de
modification ou de suppression, et la base refuserait de toute façon.

### Règles vérifiées
`PERM-R1` refus par défaut · `PERM-R2` rôle lu côté serveur · `PERM-R3` compte
désactivé refusé même avec session valide, sessions fermées dans la foulée ·
`PERM-R4` un refus ne révèle rien · `PERM-R5` action d'administration
journalisée avant d'être réussie · `PERM-R6` journal inviolable.

### Le test qui compte
`PERM-012` **énumère mécaniquement** les fonctions exportées des fichiers
d'actions et exige que chacune contienne une garde. Les sept exceptions
publiques — connexion, consultation et activation d'invitation, demande et
réinitialisation de mot de passe, confirmation d'adresse, identité courante —
sont marquées `@public` avec leur raison, et la liste elle-même est figée par le
test : une huitième action publique ajoutée demain fait échouer l'intégration
continue. C'est la seule protection réelle contre l'oubli.

### Problèmes rencontrés
1. **Une page privée rendue comme une page statique.** `sessionCourante()`
   entourait la lecture des cookies d'un `try/catch` muet. Or Next signale par
   une exception qu'une page devient dynamique : le signal était avalé, la page
   `/agenda` était prégénérée, la garde levait « session expirée » et la
   construction de production échouait. Corrigé par `src/server/flux-next.ts` :
   toute erreur portant un `digest` — redirection, page absente, bascule en
   rendu dynamique — est relancée telle quelle. Les trois `catch` de
   `session.ts` et celui de `audit.ts` passent par là.

### Impact sur les autres modules
Tous les lots suivants héritent du couple garde + audit. Une action de séjour ou
d'événement écrite sans garde sera refusée par `PERM-012` avant même la revue.

### Décisions à confirmer par Yassine
Aucune.

---

## MODULE : AUTH — Authentification

**Statut : ✅ VALIDÉ**

### Fonctionnalités réalisées
Connexion email + mot de passe, empreinte **Argon2id** · session en cookie
`httpOnly` / `secure` en production / `sameSite=lax`, expiration bornée à 30
jours et prolongée à l'usage · déconnexion qui détruit la ligne en base avant le
cookie · limitation de débit en base, par compte et par adresse IP · **aucune
route d'inscription** : le seul chemin vers un compte est l'invitation.

Les fournisseurs externes (Google, Apple) restent hors service : la table
`accounts` existe, rien ne s'y branche. C'est ce que demande la fiche.

### Règles vérifiées
`AUTH-R1` aucun compte hors invitation · `AUTH-R2` Argon2id, jamais renvoyé ·
`AUTH-R3` message d'échec identique que l'email existe ou non · `AUTH-R4` compte
désactivé refusé · `AUTH-R5` 5 échecs en 15 minutes, par compte · `AUTH-R6`
déconnexion effective côté serveur.

### Points de sécurité mesurés
`AUTH-004` compare le temps de réponse sur un email connu et un inconnu : la
vérification d'empreinte est faite dans les deux cas, sur une empreinte factice
quand le compte n'existe pas. Sans cela, la seule durée de la réponse
trahirait qui fréquente la maison. `AUTH-014` vérifie que bloquer un compte ne
bloque pas les autres personnes derrière la même connexion.

### Problèmes rencontrés
Aucun de fond à la reprise du lot.

### Décisions à confirmer par Yassine
Aucune.

---

## MODULE : PWD — Mots de passe

**Statut : ✅ VALIDÉ**

### Fonctionnalités réalisées
Demande de réinitialisation à réponse constante · jeton de 32 octets, **haché en
base**, valable 1 heure, à usage unique, invalidé par toute nouvelle demande ·
écran de nouveau mot de passe · changement depuis le profil avec ancien mot de
passe exigé · politique de robustesse (10 caractères minimum, refus des mots de
passe les plus courants) · fermeture de toutes les autres sessions après
changement.

### Règles vérifiées
`PWD-R1` seule l'empreinte du jeton est stockée · `PWD-R2` une heure, usage
unique · `PWD-R3` réponse identique sur email connu et inconnu · `PWD-R4`
politique appliquée côté serveur · `PWD-R5` un changement déconnecte partout
ailleurs · `PWD-R6` ancien mot de passe exigé depuis le profil.

`PWD-018` relit les journaux produits pendant une réinitialisation complète et
vérifie qu'aucun jeton ni mot de passe n'y figure — le masquage se fait sur la
**forme du nom de champ**, pas sur une liste tenue à la main.

### Problèmes rencontrés
Aucun de fond à la reprise du lot.

### Décisions à confirmer par Yassine
Aucune.

---

## MODULE : INVITE — Invitations

**Statut : ✅ VALIDÉ**

### Fonctionnalités réalisées
Émission par Solenne seule, avec rôle inscrit dans l'invitation · jeton haché,
valable 14 jours, à usage unique · **lien copiable** rendu à l'écran, en secours
tant que l'envoi réel d'emails n'est pas branché (lot 6) · activation créant le
compte, le profil et la session **dans une seule transaction** · relance qui tue
le jeton précédent · révocation définitive · liste des invitations avec statuts
et dates.

Le rôle du compte créé vient de l'invitation, jamais de la charge utile : un
`role: "ADMIN"` injecté à l'activation est ignoré (`INVITE-S07`).

### Règles vérifiées
`INV-R1` à `INV-R7`, toutes couvertes. `INVITE-C04` lance deux activations
simultanées du même jeton : **un seul compte est créé**, l'autre requête reçoit
un refus explicite.

### Corrections apportées
L'émission créait la ligne d'invitation avec une empreinte provisoire, remplacée
par un second écrit. Une panne entre les deux laissait une invitation en attente
portant un jeton inutilisable — et bloquait toute nouvelle invitation de la même
personne pendant 14 jours. Le jeton naît maintenant avec la ligne, en une seule
écriture.

### Décisions à confirmer par Yassine
Aucune. L'envoi d'emails reste simulé : les courriers partent dans `.courriers/`
et le lien est affiché à Solenne. Le branchement de Resend est prévu au lot 6.

---

## MODULE : PROFILE — Profil

**Statut : ✅ VALIDÉ**

### Fonctionnalités réalisées
Prénom, nom, téléphone, nombre d'enfants, préférences et informations utiles ·
changement d'email **en deux temps**, avec lien de confirmation envoyé à la
nouvelle adresse · téléversement de photo · consultation complète réservée à
Solenne, un ami ne voit d'un autre que son prénom et sa photo.

Le type de relation et le rôle ne sont pas modifiables depuis le profil : les
champs sont ignorés côté serveur, pas seulement absents de l'écran
(`PROFILE-S07`).

### Règles vérifiées
`PROF-R1` chacun ne modifie que son profil · `PROF-R2` relation fixée par
Solenne · `PROF-R3` rôle jamais modifiable ici · `PROF-R4` changement d'email
confirmé · `PROF-R5` images seules, 5 Mo maximum, redimensionnées.

### Contrôle du téléversement
Trois barrières, dans cet ordre : la taille annoncée, la taille réelle après
lecture, puis la **signature du contenu**. Un exécutable renommé `.jpg` est
refusé (`PROFILE-007`). L'image acceptée est ré-encodée en WebP 512 px : le
ré-encodage vaut désinfection — ce qui sort est une image et rien d'autre.

### Corrections apportées
Le formulaire de profil, composant client, importait la limite de 5 Mo depuis le
module de stockage marqué `server-only` — la construction de production
échouait. Les règles pures (seuils, reconnaissance de format) sont descendues
dans `src/domain/core/images.ts`, où les deux côtés peuvent les lire ; le
stockage lui-même reste au serveur.

### Décisions à confirmer par Yassine
Aucune.

---

## MODULE : USERS — Gestion des utilisateurs

**Statut : ✅ VALIDÉ**

### Fonctionnalités réalisées
Liste avec recherche (prénom, nom, email) et filtres (relation, statut) ·
modification du type de relation · désactivation, avec **avertissement listant
les séjours confirmés à venir** · réactivation · suppression RGPD anonymisant
les traces sans casser l'historique · changement de rôle, architecture prête
pour plus tard · journal d'audit sur chaque action.

### Règles vérifiées
`USR-R1` Solenne seule · `USR-R2` elle ne peut ni se désactiver, ni se
supprimer, ni se rétrograder (D5) · `USR-R3` la désactivation ferme les sessions
immédiatement · `USR-R4` les données d'un compte désactivé restent, ses séjours
futurs sont signalés · `USR-R5` la suppression efface les données personnelles
et anonymise les traces · `USR-R6` tout est journalisé.

`USERS-004` vérifie ce qui compte vraiment : un ami désactivé pendant qu'il est
connecté est refusé **dès la requête suivante**, pas à l'expiration de son
cookie.

### Problèmes rencontrés
Un test de permissions ne compilait plus sous `strict` : TypeScript inférait le
type du premier élément d'un tableau d'appels hétérogènes. Tableau annoté, sans
toucher au code de production.

### Décisions à confirmer par Yassine
Aucune.

---

## Campagne responsive — état après le lot 1

La campagne du lot 0 ne connaissait que deux écrans, et tenait l'accueil pour
public. Les gardes du lot 1 l'ont rendu privé : douze vérifications sont tombées
d'un coup. La campagne a été refondue sur ce qui existe réellement.

**Onze écrans sur douze** sont maintenant mesurés en 320 / 768 / 1440 px :
connexion, invitation périmée, nouveau mot de passe, vitrine, accueil, agenda,
séjours, maison, profil, confirmation d'adresse, console de gestion. Manquent le
tableau de bord réel (lot 7) et les écrans de séjour et d'événement, qui
remplaceront les pages « à venir ».

Chaque écran est contrôlé sur : absence de débordement horizontal, cibles
tactiles d'au moins 44 × 44 px, largeur de lecture bornée, titres qui ne
déforment pas leur carte, lien d'évitement en tête de tabulation, navigation
basse posée en bas, et **aucune trace technique à l'écran**.

Un projet de préparation rejoue le jeu de démonstration puis ouvre deux sessions
— Solenne et un ami — rangées sur disque. Les écrans du cercle repartent de ces
sessions au lieu de se reconnecter à chaque test : la campagne complète tient en
1 min 12 s.

**Nouveau fichier `tests/e2e/acces.spec.ts`** : ce qu'obtient quelqu'un qui tape
l'adresse à la main. Les sept écrans privés renvoient à la connexion sans livrer
le moindre fragment (`AUTH-S01`, `PERM-S01`) ; `/gerer` répond **404 à un ami**,
pas « accès refusé » — le refus ne confirme pas l'existence de la console
(`PERM-S08`) ; l'onglet « Gérer » ne lui est pas proposé (`PERM-S05`) ; son
profil ne montre que ses propres informations (`PROFILE-010`).

---

## Grilles

**Sécurité S1→S12** : appliquée aux six modules du lot, dont les 29 cas issus
mécaniquement de la grille (`-S01` à `-S12`). Sur les 118 cas du lot, **73 sont
de type sécurité** — la majorité, ce qui est normal pour un lot qui ne fait que
des portes et des serrures. Tous au vert. Les mesures permanentes du §7.4
sont en place : Argon2id, jetons hachés à usage unique, cookies verrouillés,
validation Zod de toute entrée, journal d'audit, aucun secret journalisé.

**Concurrence C1→C6** : un seul point de contention dans ce lot, `C4` — double
activation d'un même jeton d'invitation. Traité en transaction, vérifié par
`INVITE-C04`. `C1`, `C2`, `C3` et `C5` relèvent des lots 3 à 5 ; `C6` sera repris
avec les formulaires de séjour.

---

## Ce qui reste connu et non corrigé

| # | Point | Gravité | Suite |
|---|---|---|---|
| P1 | `SETUP-011` : la preuve qu'une fusion est bloquée demande un dépôt hébergé (L1) | MEDIUM | À rejouer à la création du dépôt |
| P2 | 11 écrans sur 12 dans la campagne responsive | LOW | Le douzième arrive au lot 7 (`DASH`) |
| P3 | Validation visuelle de Yassine (L2) toujours en attente | HIGH | Bloquant pour clore `UI`, pas pour le lot 1 |
| P4 | Envoi réel d'emails simulé | — | Prévu, lot 6 (`MAIL`) — conforme à la fiche `INVITE` |

Aucune erreur critique ni haute priorité **technique** connue et non corrigée.
P3 n'est pas un défaut du code : c'est un avis qui n'a pas encore été donné.
