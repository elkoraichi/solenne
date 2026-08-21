# Lot 0 — Fondations · rapports de fin de module

Format imposé par le §11.2 du Mode Opératoire.
Suite complète au vert le 21/08/2026 : **135 vérifications Vitest** (21 s) +
**60 vérifications Playwright** sur 320 / 768 / 1440 px (24 s).

---

## MODULE : SETUP — Socle technique

**Statut : ✅ VALIDÉ**

### Fonctionnalités réalisées
Projet Next.js 15.5 en TypeScript strict (`strict`, `noUncheckedIndexedAccess`,
`allowJs: false`) · PostgreSQL 17 + Prisma 7 avec adaptateur `pg` · scripts
`dev`, `build`, `test`, `test:e2e`, `db:migrate`, `db:deploy`, `db:seed`,
`db:reset`, `verify` · intégration continue bloquante en deux travaux
(vérification puis parcours) · variables d'environnement validées par Zod au
chargement de la configuration Next, donc **avant** que le serveur n'écoute ·
jeu de démonstration rejouable, refusé en production.

Deux migrations : `init_schema` (25 tables) et `garanties_base`. La seconde pose
ce que Prisma ne sait pas exprimer et qui devra tenir dès le lot 3 :

- extension `btree_gist` ;
- contrainte d'exclusion `stays_sans_chevauchement_exclusif` (règle R2, D2) ;
- contrainte d'exclusion `events_sans_chevauchement` (règle R6, D8) ;
- contrôles de cohérence des intervalles `[début, fin[` et des effectifs ;
- capacité de la maison bornée à 1→25 en base (D1) ;
- **journal d'audit en écriture seule** : trois déclencheurs refusent `UPDATE`,
  `DELETE` et `TRUNCATE`.

Chaque migration possède son `down.sql`, et l'aller-retour est testé.

### Tests
| Prévus | Réussis | Échoués | Corrigés | Restants |
|---|---|---|---|---|
| 11 | 11 | 0 | 1 | 0 |

`SETUP-001` 4,4 s pour un serveur de développement qui répond 200 ·
`SETUP-002` build de production en 8,7 s · `SETUP-005` requête de vérification
sous la milliseconde · `SETUP-006/007/008` sur une base créée et détruite pour
l'occasion.

### Problèmes rencontrés
1. **Node, PostgreSQL et Docker absents de la machine.** Node était installé
   mais hors `PATH` ; PostgreSQL 17 a été installé et démarré, deux bases créées
   (`solenne_dev`, `solenne_test`). Aucune action demandée à Yassine.
2. **13 vulnérabilités dans les dépendances**, dont 3 critiques (`next-auth`
   bêta ancienne) et 6 hautes (`postcss`, `sharp` épinglés par Next 15).
   Corrigées par une montée de version et trois `overrides` ciblés :
   `npm audit` renvoie **0 vulnérabilité** sans quitter Next 15.
3. **Le journal d'audit se défendait trop bien** : le déclencheur `DELETE`
   empêchait le jeu de démonstration de se rejouer. Il est désactivé le temps du
   nettoyage, et uniquement hors production.
4. **`SETUP-011` s'auto-contredisait** : le commentaire d'en-tête du fichier
   d'intégration continue contenait la chaîne que le test interdit. Commentaire
   reformulé.

### Corrections apportées à la spécification
| Écart | Ce que dit la fiche | Ce qui a été fait | Pourquoi |
|---|---|---|---|
| Nombre de tables | `SETUP-006` : 18 | **25** | Le §4 de `02_Analyse_Architecture.md` en décrit 24, plus `password_reset_tokens` qu'exige le module `PWD` |
| Capacité du jeu de démonstration | `SETUP-009` : 12 | **10** | D1 et `04_Contenu_a_fournir.md` (v1.2, postérieure) |
| Chambres du jeu de démonstration | `SETUP-009` : 3 | **5** | `04_Contenu_a_fournir.md` §2 |

### Impact sur les autres modules
`STAYDEC` (lot 3) et `EVENT` (lot 4) héritent d'un filet de sécurité en base
déjà posé et déjà testé : la grille de concurrence C1 et C5 s'appuiera dessus au
lieu de l'inventer. Le module `AUDIT` du lot 1 écrit dans une table déjà
inviolable.

### Décisions à confirmer par Yassine
Aucune. Les trois écarts ci-dessus sont des corrections de cohérence
documentaire, pas des choix fonctionnels.

---

## MODULE : CORE — Noyau transverse

**Statut : ✅ VALIDÉ**

### Fonctionnalités réalisées
Type `Resultat<T> = Succes<T> | Echec` employé par toute action serveur ·
catalogue centralisé de 21 codes (les 11 refus métier du §12.4 au mot près, plus
10 codes transverses) avec substitution de paramètres · conversion de toute
erreur technique en refus présentable · journalisation structurée avec masquage
systématique des secrets · validation Zod en français · utilitaires de dates
séparant les **jours** (dates nues) des **instants** (affichés en `Europe/Paris`).

Choix de conception : les dates de séjour sont des dates nues calées à minuit
UTC, jamais des instants. Le changement d'heure ne peut donc pas décaler une
nuit — c'est structurel, pas une correction après coup.

### Règles vérifiées
`CORE-R1` aucune trace technique à l'écran · `CORE-R2` messages français avec
une issue · `CORE-R3` détail technique complet au journal · `CORE-R4` aucun
secret journalisé · `CORE-R5` UTC en base, Paris à l'affichage · `CORE-R6`
convention `[arrivée, départ[`.

### Tests
| Prévus | Réussis | Échoués | Corrigés | Restants |
|---|---|---|---|---|
| 12 | 12 | 0 | 0 | 0 |

Le masquage des secrets est vérifié sur la **forme du nom de champ** et non sur
une liste de champs connus : un `resetToken` ajouté demain sera masqué sans
qu'on y pense. Les références circulaires et les textes de 100 000 caractères
sont traités sans plantage.

### Problèmes rencontrés
Aucun de fond. Deux ajustements de typage sous `strict`.

### Impact sur les autres modules
Tout module qui lèvera une `ErreurMetier` obtient automatiquement un refus
français, journalisé, sans détail technique. Aucun module n'a de raison
d'écrire un message d'erreur en dur : le test `CORE-012` le vérifiera à mesure
que le catalogue grandit.

### Décisions à confirmer par Yassine
Aucune.

---

## MODULE : UI — Design system

**Statut : ⚠️ VALIDÉ SOUS RÉSERVE — 9 critères sur 10**

Le seul critère manquant est le n°8 au sens du §11.1 lu strictement : la
**validation visuelle de Yassine** (limite L2) n'a pas encore eu lieu. Tout le
reste est au vert.

### Fonctionnalités réalisées
Palette lin / olive / terracotta / bois / encre, déclarée une seule fois et
vérifiée · titres Fraunces, corps Inter · bouton, champ, zone de texte, carte,
badge, feuille modale, tiroir, avatar, état vide, squelette, bandeau d'erreur,
dialogue de confirmation · coquille applicative avec lien d'évitement · barre
basse à 5 onglets, 6ᵉ onglet « Gérer » pour Solenne avec pastille de compteur.

Une page `/vitrine`, **présente en développement seulement**, rassemble tous les
composants : c'est le support de la validation visuelle et des mesures
responsive.

### Règles vérifiées
`UI-R1` les 19 paires texte/fond réellement utilisées passent le seuil AA —
la plus juste est à 4,63 · `UI-R2` toutes les cibles mesurées en 320, 768 et
1440 px font au moins 44 × 44 px · `UI-R3` aucun débordement horizontal ·
`UI-R4` chargement, vide et erreur existent · `UI-R5` la confirmation nomme
l'objet supprimé · `UI-R6` le focus est visible et la tabulation commence par
« Aller au contenu ».

### Tests
| Prévus | Réussis | Échoués | Corrigés | Restants |
|---|---|---|---|---|
| 11 | 11 | 0 | 4 | 0 |

### Problèmes rencontrés
1. **`bois` sur `lin` échouait le seuil AA** (4,35 pour 4,5 exigés). Couleur
   assombrie de `#8B6F4E` à `#7E6444` — 5,14. Le test interdit désormais toute
   paire non déclarée.
2. **Le repli d'avatar ne se déclenchait pas** quand l'image échouait avant
   l'hydratation : React n'avait pas encore posé son gestionnaire, l'événement
   était perdu. Corrigé en interrogeant l'état réel de l'image au montage. Sans
   `UI-010`, ce défaut serait passé inaperçu — un ami sans photo aurait vu une
   icône cassée.
3. **L'indicateur de développement de Next** se superposait à la navigation
   basse et faussait la mesure des cibles tactiles. Désactivé.
4. **Le lien d'évitement** mesurait 1 × 1 px : normal tant qu'il est masqué,
   mais il fait maintenant 44 px de haut dès qu'il a le focus.

### Limite honnête
`UI-003`, `UI-004` et `UI-005` demandent « les 12 écrans peuplés ». Il en existe
**deux**. La campagne responsive s'étendra à chaque écran livré ; c'est consigné
au tableau de bord (P2). Écrire que le critère est rempli aujourd'hui serait
faux.

### Décisions à confirmer par Yassine
**Une seule, et elle est visuelle (L2).** Lancer `npm run dev` puis ouvrir
<http://localhost:3000/vitrine> sur un téléphone. Question : est-ce que cela
ressemble au carnet d'une maison de campagne, ou à un logiciel de gestion ?
Les couleurs, les polices et les arrondis se changent en une ligne — c'est le
bon moment pour le dire.
