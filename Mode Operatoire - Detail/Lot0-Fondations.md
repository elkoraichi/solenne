# Lot 0 — Fondations · Fiches détaillées

`SETUP` · `CORE` · `UI` — 3 modules, 34 cas de test.
Rattaché à `Mode Operatoire.md` v1.0.

---

# MODULE `SETUP` — Socle technique

## 1. Objectif
Disposer d'un projet qui démarre, se construit, se teste et se déploie, avec une base de données migrable et un jeu de données de démonstration rejouable. Aucune fonctionnalité métier.

## 2. Fonctionnalités
Projet Next.js 15 + TypeScript strict · Prisma + PostgreSQL · scripts (`dev`, `build`, `test`, `test:e2e`, `db:migrate`, `db:seed`, `db:reset`) · intégration continue bloquante · variables d'environnement typées et validées au démarrage · jeu de données de démonstration (Solenne, 4 amis, la maison, 3 chambres, 2 bureaux, 2 événements, 3 séjours, 2 périodes bloquées).

## 3. Données manipulées
Le schéma Prisma complet (18 tables du §4 de `02_Analyse_Architecture.md`), sans logique associée. Table `_prisma_migrations`.

## 4. Règles métier
Aucune. Une seule règle technique : **l'application refuse de démarrer si une variable d'environnement obligatoire manque**, avec un message explicite nommant la variable.

## 5. Permissions
Sans objet — aucune surface exposée. Le jeu de démonstration ne doit **jamais** pouvoir s'exécuter en production (garde sur `NODE_ENV`).

## 6. Dépendances
Aucune. Premier module du projet.

## 7. Cas nominaux
Le projet démarre en local · le build de production réussit · les migrations s'appliquent sur une base vierge · le jeu de démonstration se crée et se réinitialise · l'intégration continue passe au vert.

## 8. Cas limites
Base de données injoignable · migration déjà appliquée · migration jouée deux fois · base non vide au moment du seed · variable d'environnement absente ou vide · rollback d'une migration.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Migration non réversible bloquant une correction en production | HIGH | Toute migration testée en aller-retour (`SETUP-007`) |
| Jeu de démonstration exécuté en production, écrasant des données réelles | CRITICAL | Garde `NODE_ENV` + test `SETUP-010` |
| Variable d'environnement oubliée découverte en production | HIGH | Validation au démarrage (`SETUP-004`) |

## 10. Critères d'acceptation
Les 11 tests passent · `npm run build` réussit · la base se crée, se migre, se peuple et se réinitialise en une commande · l'intégration continue refuse une fusion si un test échoue.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| SETUP-001 | Le projet démarre en développement | Dépendances installées, `.env` complet | `npm run dev` | Serveur en écoute, page d'accueil répond 200 | CRITICAL | Integration |
| SETUP-002 | Le build de production réussit | Code source valide | `npm run build` | Sortie sans erreur ni avertissement TypeScript | CRITICAL | Integration |
| SETUP-003 | TypeScript est en mode strict | `tsconfig.json` | Analyse statique | `strict: true`, `noUncheckedIndexedAccess: true`, zéro `any` implicite | HIGH | Unit |
| SETUP-004 | Variable d'environnement manquante | `DATABASE_URL` retirée | Démarrage | Refus de démarrer, message « Variable manquante : DATABASE_URL » | HIGH | Integration |
| SETUP-005 | Connexion à la base | Base PostgreSQL disponible | Requête de vérification | Réponse en moins de 1 s | CRITICAL | Integration |
| SETUP-006 | Migrations sur base vierge | Base vide | `db:migrate` | 18 tables créées, contraintes et index présents | CRITICAL | Integration |
| SETUP-007 | Migration réversible | Migration appliquée | Rollback puis réapplication | État final identique à l'état initial | HIGH | Integration |
| SETUP-008 | Migration idempotente | Migrations déjà appliquées | `db:migrate` à nouveau | Aucune action, aucune erreur | MEDIUM | Integration |
| SETUP-009 | Jeu de démonstration cohérent | Base migrée et vide | `db:seed` | Solenne + 4 amis + maison (capacité 12) + 3 chambres + 2 bureaux + 2 événements + 3 séjours + 2 blocages ; **aucune règle métier violée** | HIGH | Integration |
| SETUP-010 | Le seed est interdit en production | `NODE_ENV=production` | `db:seed` | Refus immédiat, aucune écriture | CRITICAL | Security |
| SETUP-011 | L'intégration continue bloque au rouge | Un test volontairement cassé | Déclenchement CI | Build marqué en échec, fusion impossible | HIGH | Integration |

---

# MODULE `CORE` — Noyau transverse

## 1. Objectif
Garantir qu'aucune erreur technique n'atteint jamais l'utilisateur, que toute entrée serveur est validée, et que les dates sont manipulées de façon cohérente dans toute l'application.

## 2. Fonctionnalités
Type de résultat `Succès | Échec(code, message)` utilisé par toutes les Server Actions · catalogue centralisé des messages français · convertisseur d'erreurs techniques en messages utilisateur · journalisation structurée (niveau, horodatage, utilisateur, action, détail technique) · validation Zod de toute entrée · utilitaires de dates en fuseau `Europe/Paris` avec convention `[début, fin[`.

## 3. Données manipulées
Aucune table propre. Traverse toutes les autres.

## 4. Règles métier
| # | Règle |
|---|---|
| CORE-R1 | Aucune trace technique (`PrismaClientKnownRequestError`, pile d'appels, requête SQL) ne doit apparaître à l'écran |
| CORE-R2 | Tout message utilisateur est en français, explique ce qui s'est passé et ce que la personne peut faire |
| CORE-R3 | Toute erreur est journalisée avec son détail technique complet |
| CORE-R4 | Aucun mot de passe, jeton ou donnée personnelle sensible dans les journaux |
| CORE-R5 | Toutes les dates sont stockées en UTC et affichées en `Europe/Paris` |
| CORE-R6 | Convention `[arrivée, départ[` : le jour du départ n'est pas occupé |

## 5. Permissions
Sans objet. Le journal n'est jamais exposé à l'utilisateur.

## 6. Dépendances
`SETUP`.

## 7. Cas nominaux
Une action réussie renvoie un succès typé · une action échouée renvoie un code et un message français · une entrée invalide est rejetée avant tout traitement.

## 8. Cas limites
Erreur base de données · violation de contrainte d'unicité · délai d'attente dépassé · erreur inattendue non prévue · entrée absente, vide, de mauvais type, trop longue · date au format inattendu · changement d'heure saisonnier.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Fuite d'information technique révélant la structure interne | HIGH | `CORE-001`, `CORE-002`, `CORE-012` |
| Mot de passe ou jeton dans les journaux | CRITICAL | `CORE-006` |
| Décalage d'un jour lors du changement d'heure | HIGH | `CORE-010`, `CORE-011` |

## 10. Critères d'acceptation
Les 12 tests passent · aucune trace technique n'est atteignable depuis l'interface · le catalogue de messages couvre 100 % des codes d'erreur du §12.4.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| CORE-001 | Erreur base convertie | Base injoignable | Appeler une action de lecture | « Une erreur est survenue. Votre demande n'a pas été enregistrée. Vous pouvez réessayer. » — aucun terme technique | CRITICAL | Unit |
| CORE-002 | Aucune pile d'appels exposée | Exception non gérée levée | Appeler l'action | Réponse sans pile, sans nom de fichier, sans requête SQL | CRITICAL | Security |
| CORE-003 | Violation d'unicité | Email déjà existant | Créer un doublon | Message « Cet email est déjà utilisé », code stable | HIGH | Unit |
| CORE-004 | Journalisation complète | Erreur provoquée | Lire le journal | Niveau, horodatage, utilisateur, action et détail technique présents | HIGH | Unit |
| CORE-005 | Résultat typé | Action nominale | Appel | `{ ok: true, data }` — jamais d'exception traversant la frontière serveur | HIGH | Unit |
| CORE-006 | Aucun secret journalisé | Connexion avec mot de passe | Lire le journal | Ni mot de passe, ni jeton, ni empreinte — champs remplacés par `[masqué]` | CRITICAL | Security |
| CORE-007 | Entrée invalide rejetée | Champ `adults` = `"abc"` | Soumettre | Rejet Zod avant tout accès base, message français par champ | HIGH | Unit |
| CORE-008 | Entrée absente rejetée | Champ obligatoire omis | Soumettre | Rejet, message nommant le champ | HIGH | Unit |
| CORE-009 | Entrée démesurée rejetée | Commentaire de 100 000 caractères | Soumettre | Rejet propre, pas de plantage ni de saturation | MEDIUM | Security |
| CORE-010 | Fuseau horaire | Date stockée en UTC | Affichage | Rendu en heure de Paris, sans décalage | HIGH | Unit |
| CORE-011 | Changement d'heure | Séjour du 25 au 27 octobre 2026 | Calcul du nombre de nuits | 2 nuits, malgré le passage à l'heure d'hiver | HIGH | Unit |
| CORE-012 | Catalogue complet | Les 11 codes du §12.4 | Vérification | Chaque code possède un message français ; aucun message en dur dans le code | MEDIUM | Unit |

---

# MODULE `UI` — Design system

## 1. Objectif
Fournir un vocabulaire visuel cohérent, chaleureux et accessible, utilisable sur les 12 écrans, et qui ne ressemble en rien à un logiciel de gestion (§20, §28).

## 2. Fonctionnalités
Jetons de couleur (lin, olive, terracotta, bois, encre) · typographie titres à empattements + corps sans-serif · composants de base (bouton, champ, carte, badge, feuille modale, tiroir, avatar, état vide, squelette de chargement, bandeau d'erreur) · mise en page applicative · **navigation basse à 5 onglets** (Accueil, Agenda, Séjours, Maison, Profil) + 6ᵉ onglet « Gérer » pour Solenne, avec pastille de compteur.

## 3. Données manipulées
Aucune.

## 4. Règles métier
| # | Règle |
|---|---|
| UI-R1 | Contraste texte/fond conforme WCAG AA (4,5:1 texte courant, 3:1 grands titres) |
| UI-R2 | Cible tactile ≥ 44 × 44 px |
| UI-R3 | Aucun débordement horizontal entre 320 px et 1920 px |
| UI-R4 | Tout composant affichant des données possède trois états : chargement, vide, erreur |
| UI-R5 | Toute action destructive demande une confirmation explicite |
| UI-R6 | Navigation complète possible au clavier, focus toujours visible |

## 5. Permissions
Le 6ᵉ onglet « Gérer » n'est rendu que pour le rôle ADMIN — **confort d'affichage uniquement** : la protection réelle est côté serveur (`PERM`).

## 6. Dépendances
`SETUP`.

## 7. Cas nominaux
Les composants se rendent correctement en 320, 768 et 1440 px · la navigation basse est atteignable au pouce · les états vides et de chargement s'affichent.

## 8. Cas limites
Titre très long · liste vide · image absente ou cassée · nom d'utilisateur à rallonge · connexion lente · 25 participants sur une même carte · texte agrandi à 200 %.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Interface jugée froide ou administrative — échec du critère n°1 du cahier des charges | HIGH | Validation visuelle par Yassine (L2), non automatisable |
| Débordement sur petit écran rendant un formulaire inutilisable | HIGH | `UI-003` sur les 12 écrans |
| Contraste insuffisant sur la palette terreuse | MEDIUM | `UI-001` automatisé |

## 10. Critères d'acceptation
Les 11 tests passent · les 12 écrans se rendent sans débordement en 320 px · zéro violation d'accessibilité automatiquement détectable · **validation visuelle explicite de Yassine**.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| UI-001 | Contrastes AA | Palette complète | Analyse automatisée de toutes les paires | Aucun couple sous le seuil AA | HIGH | Responsive |
| UI-002 | Cibles tactiles | Tous les composants interactifs | Mesure | Toutes ≥ 44 × 44 px | HIGH | Responsive |
| UI-003 | Aucun débordement en 320 px | Les 12 écrans peuplés | Rendu à 320 px | Aucun défilement horizontal | HIGH | Responsive |
| UI-004 | Rendu tablette | Les 12 écrans | Rendu à 768 px | Mise en page adaptée, rien de tronqué | MEDIUM | Responsive |
| UI-005 | Rendu desktop | Les 12 écrans | Rendu à 1440 px | Largeur de lecture bornée, pas de ligne à rallonge | MEDIUM | Responsive |
| UI-006 | Navigation au clavier | Application complète | Parcours à la tabulation | Tous les éléments atteignables, focus visible, ordre logique | HIGH | Unit |
| UI-007 | États vides | Aucune donnée | Rendu de chaque liste | Message chaleureux en français + action suggérée, jamais une page blanche | MEDIUM | Unit |
| UI-008 | États de chargement | Réseau ralenti à 3 s | Rendu | Squelette affiché, aucun saut de mise en page | MEDIUM | Unit |
| UI-009 | Titre très long | Événement au titre de 200 caractères | Rendu de la carte | Texte tronqué proprement, carte non déformée | LOW | Responsive |
| UI-010 | Image absente | Photo d'événement manquante | Rendu | Visuel de remplacement, jamais d'icône cassée | LOW | Unit |
| UI-011 | Confirmation destructive | Suppression d'un événement | Clic | Modale de confirmation nommant l'objet supprimé | HIGH | Unit |
