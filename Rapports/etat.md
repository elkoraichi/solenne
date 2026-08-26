# Où nous en sommes

> Dix lignes, tenues à jour **à la fin de chaque arrêt**. C'est le premier fichier
> à lire dans une session neuve, et le seul qui dise l'état d'un travail *en
> cours* — le tableau de bord du §2, lui, ne parle que des modules terminés.

| | |
|---|---|
| **Dernier commit** | `a560aa3` — site et base Netlify provisionnés, repli `DATABASE_URL`. **Pas encore poussé sur GitHub** : `git push` refusé par `.claude/settings.json` (`deny: Bash(git push:*)`), délibéré, je n'y touche pas. Yassine pousse à la main : `git push origin main` (17 commits en attente) |
| **Lot en cours** | 7 — `DEPLOY` seul (vague 1), en cours, **hors méthode par arrêts habituelle** : session d'infrastructure interactive (comptes, Netlify, base), pas de développement de règles métier |
| **Module en cours** | `DEPLOY` — ni l'arrêt 1 (garde-fous, `DEPLOY-007/009/010/013/014`) ni les suivants ne sont commencés. Tout le travail de ce soir est de la mise en place d'hébergement, en amont du découpage en arrêts proposé plus tôt |
| **Arrêt en cours** | Mise en place Netlify — **bloqué**, cf. « Prochaine action » |
| **État du déploiement** | Compte Netlify dédié créé (`koraichi@gmail.com`, à ne pas confondre avec le compte client `wbhabitat@gmail.com` trouvé sur cette machine — ignoré, jamais touché). Site **baby-house-solenne** créé (`https://baby-house-solenne.netlify.app`, admin : `https://app.netlify.com/projects/baby-house-solenne`). Base **Netlify DB** (Neon en coulisses) provisionnée automatiquement, sauvegardes natives actives (quotidienne + à chaque publication). Verrou d'accès Netlify (`sso_login`) désactivé — le site répond publiquement. **Le site est en ligne mais l'application ne fonctionne pas encore** : `/api/sante` rend `indisponible` |
| **Cause du blocage, diagnostiquée** | `netlify deploy --build` construit **en local** sur cette machine ; Next.js fige `DATABASE_URL` depuis `.env`/`.env.production.local` **au moment du build**, avant que le repli vers `NETLIFY_DB_URL` (ajouté ce soir, `src/env/schema.ts::resoudreSourceEnv`) ne puisse s'appliquer — `NETLIFY_DB_URL` n'existe que sur les serveurs de Netlify, jamais sur cette machine. Le site déployé tente donc de joindre `127.0.0.1:5432` (ma base de dev) |
| **Prochaine action** | 1) Yassine pousse `git push origin main` (ou débloque le réglage s'il préfère que je le fasse — décision à lui, c'est un garde-fou du dépôt). 2) Relier le dépôt GitHub au site Netlify pour un **déploiement continu** (`Site settings → Build & deploy → Link repository` dans leur tableau de bord, ou `netlify init` qui demandera la même autorisation). Une fois relié : le build tournera chez Netlify, où `NETLIFY_DB_URL` existe réellement — `netlify.toml` lance déjà `prisma migrate deploy && npm run build`, rien d'autre à changer côté code |
| **Suite de tests** | Inchangée depuis la clôture du lot 3 : **852 Vitest, `tsc`/`eslint` muets**, Playwright complet vert. Quatre nouveaux tests unitaires pour `resoudreSourceEnv` (`tests/unite/setup/configuration.test.ts`, describe `DEPLOY-007`) |
| **En attente de Yassine** | 1) `git push` (ci-dessus). 2) Relier GitHub↔Netlify. 3) Jugement visuel **L2** sur les dix captures de `Rapports/apercus-lot3/`, toujours en attente depuis la clôture du lot 3 |

## Rebranding « Baby House » (demande directe de Yassine, hors méthode par arrêts)

Nom de la maison (donnée, `prisma/seed.ts`) et titre de l'écran de connexion
passent de « Solenne » à **Baby House** ; photo fournie par Yassine ajoutée en
habillage de `/connexion`. Commit `8b10e97`. Régression complète rejouée à ce
moment-là : verte.

## Netlify DB — ce qu'il faut savoir avant de continuer demain

- Le nom de variable injecté par Netlify est **`NETLIFY_DB_URL`** (confirmé
  dans leur documentation, pas deviné) — `NETLIFY_DATABASE_URL` est toléré en
  plus par prudence dans le code, mais n'est pas le vrai nom.
- La chaîne de connexion en **écriture** pour la branche `production` n'est
  **jamais** rendue par l'API (`getSiteDatabase`, `listSiteDatabaseBranches`
  ne rendent qu'un rôle `netlifydb_readonly`) — seul le tableau de bord, en
  tant que *Team Owner*, l'affiche. Ce n'est pas un problème une fois le
  déploiement continu en place : le build et l'exécution, côté Netlify,
  reçoivent la bonne chaîne automatiquement, sans qu'on ait à la manipuler.
- Le système de migration intégré de Netlify DB (`netlify/database/migrations`)
  n'est **pas utilisé** ici — on garde Prisma et son historique de migrations
  existant, lancé explicitement dans `netlify.toml`. C'est une pratique
  documentée et supportée par Netlify, pas un contournement fragile.
- Sauvegardes : quotidienne + à chaque publication, restaurable depuis le
  tableau de bord (rôle *Team Owner* requis) ou via l'API
  (`restoreSiteDatabaseSnapshot`) — de quoi couvrir `DEPLOY-005`/`006` une
  fois le site fonctionnel.

## Lot 3 (`OCCUP`→`STAY`), pour mémoire

Tous clos et validés (27/08/2026) : détail dans `Mode Operatoire.md` §14
(entrées 1.12→1.19) et `Rapports/Lot3-Sejours.md`.

## Trois points d'outillage

- **Le dépôt n'a pas de configuration Prettier.** Ne pas lancer `npx prettier`.
  Le style se vérifie avec `npx eslint .`.
- **La base de dev (`solenne_dev`) est reseedée à chaque `npx playwright test`.**
  Les IDs changent d'une exécution à l'autre — ne jamais s'y fier d'une session
  à l'autre, seuls les statuts et les dates comptent.
- **`netlify-cli` n'est pas installé** (ni globalement, ni en dépendance) —
  chaque commande passe par `npx --yes netlify-cli <commande>`. Le serveur de
  test local (`next start -p 3001`, `.env.production.local`) a été arrêté en
  fin de session ; le relancer si besoin de revérifier quelque chose en local.
