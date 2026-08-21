# La Maison de Solenne

Application web privée pour la maison de campagne de Solenne : événements entre
amis et demandes de séjour.

Ce fichier est destiné à qui reprend le code. Le suivi du projet vit dans
`Mode Operatoire.md` ; les contenus attendus de Solenne dans
`04_Contenu_a_fournir.md`.

## Démarrer

```bash
cp .env.example .env      # puis renseigner DATABASE_URL, AUTH_SECRET, APP_URL
npm install               # génère aussi le client Prisma
npm run db:deploy         # applique les migrations
npm run db:seed           # jeu de démonstration (interdit en production)
npm run dev
```

L'application **refuse de démarrer** si une variable obligatoire manque : le
message nomme la variable.

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | build de production |
| `npm run verify` | types + style + tests — ce que vérifie l'intégration continue |
| `npm test` | tests unitaires et d'intégration |
| `npm run test:e2e` | parcours Playwright en 320 / 768 / 1440 px |
| `npm run db:migrate` | crée et applique une migration |
| `npm run db:deploy` | applique les migrations existantes |
| `npm run db:seed` | (re)crée le jeu de démonstration |
| `npm run db:reset` | remet la base à zéro puis la repeuple |
| `npm run lock:ci` | régénère `package-lock.json` — **à lancer après toute installation de paquet** |

### Le fichier de verrouillage se régénère pour Linux

`npm install` lancé depuis macOS produit un `package-lock.json` amputé des
variantes binaires Linux : l'intégration continue échoue alors dès `npm ci`,
avant le premier test. Après tout ajout ou mise à jour de dépendance, lancer
`npm run lock:ci` et versionner le fichier obtenu. Le verrou ainsi produit
satisfait `npm ci` sur les deux plateformes ; le crochet `pre-push` le vérifie.

Les tests d'intégration travaillent sur `TEST_DATABASE_URL` et **jamais** sur la
base de développement.

Les parcours Playwright, eux, s'exécutent contre la base de **développement** :
`tests/e2e/preparation.setup.ts` la repeuple avant la campagne, puis ouvre deux
sessions — Solenne et un ami — rangées dans `tests/e2e/.session/`. Lancer
`npm run test:e2e` efface donc les données de développement en cours.

## Organisation

```
src/domain/     logique pure — zéro import React / Next / Prisma
  core/         résultat typé, messages, validation, dates, mot de passe, images
src/env/        variables d'environnement validées au démarrage
src/server/     accès base, journalisation, conversion des erreurs, actions
  auth/         sessions, gardes de permission, jetons, empreintes
  actions/      Server Actions — chacune commence par une garde (PERM-012)
src/components/ ui/ (design system) · layout/ (coquille, navigation basse)
src/app/        routes App Router
prisma/         schéma, migrations (avec leur `down.sql`), jeu de démonstration
tests/          unite/ · integration/ · e2e/
```

## Cinq règles à ne pas contourner

1. **Aucune trace technique à l'écran.** Une erreur produit un message français
   du catalogue (`src/domain/core/messages.ts`) ; le détail part au journal.
2. **Convention `[arrivée, départ[`.** Le jour du départ n'est pas occupé. Les
   jours sont des dates nues calées à minuit UTC, les instants sont affichés en
   `Europe/Paris`.
3. **Le journal d'audit est en écriture seule.** Des déclencheurs PostgreSQL
   refusent toute modification, suppression ou troncature.
4. **Toute Server Action commence par une garde.** `requireUser()` ou
   `requireRole('ADMIN')`, avant la moindre lecture. Les rares actions publiques
   portent `@public` et sa raison dans leur commentaire ; le test `PERM-012`
   énumère les actions et refuse toute nouvelle exception non déclarée.
5. **Ne jamais avaler une erreur de Next.** Redirection, page absente et bascule
   en rendu dynamique passent par une exception portant un `digest` :
   `src/server/flux-next.ts` la relance. L'avaler transforme une page privée en
   page prégénérée.

## Ce qui n'est pas encore réglé

- Le nom de domaine (`APP_URL`) n'est pas arrêté : il n'apparaît nulle part en dur.
- Les photos de la maison et la capacité définitive sont provisoires : elles
  bloquent la mise en production (`DEPLOY-013`, `DEPLOY-014`).
- L'intégration continue est écrite (`.github/workflows/ci.yml`) mais ne peut
  s'exécuter qu'une fois le dépôt hébergé — création des comptes, limite L1.
