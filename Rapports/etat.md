# Où nous en sommes

> Dix lignes, tenues à jour **à la fin de chaque arrêt**. C'est le premier fichier
> à lire dans une session neuve, et le seul qui dise l'état d'un travail *en
> cours* — le tableau de bord du §2, lui, ne parle que des modules terminés.

| | |
|---|---|
| **Dernier commit** | `0968688` (commit vide, test post-passage en public) — **poussé sur GitHub par Yassine**, build Netlify `ready` |
| **Lot en cours** | 7 — `DEPLOY` seul (vague 1), en cours, **hors méthode par arrêts habituelle** : session d'infrastructure interactive (comptes, Netlify, base, GitHub), pas de développement de règles métier |
| **Module en cours** | `DEPLOY` — ni l'arrêt 1 (garde-fous, `DEPLOY-007/009/010/013/014`) ni les suivants ne sont commencés. Le blocage de déploiement continu est résolu ; reste à écrire les tests/critères du module `DEPLOY` lui-même |
| **Arrêt en cours** | Déploiement continu Netlify — **débloqué et vérifié** (27/08). `https://baby-house-solenne.netlify.app` répond, redirige vers `/connexion` |
| **État du déploiement** | Compte Netlify dédié (`koraichi@gmail.com`, ne jamais confondre avec le compte client `wbhabitat@gmail.com` présent sur cette machine). Site **baby-house-solenne** (`https://baby-house-solenne.netlify.app`, admin `https://app.netlify.com/projects/baby-house-solenne`). Base **Netlify DB** provisionnée, sauvegardes natives actives. **Dépôt GitHub relié en déploiement continu et PASSÉ EN PUBLIC** (`elkoraichi/solenne`, branche `main`) — décision prise pour lever le blocage ci-dessous, aucun secret n'a jamais été committé (vérifié sur tout l'historique : seul `.env.example` est suivi). Le bug qui faisait planter `prisma generate` à l'installation est corrigé (`prisma.config.ts`, commit `c1dc7fd`) |
| **Blocage résolu** | `Build blocked: Unrecognized Git contributor. This plan allows only verified account members to push to private repos.` — ce n'était **pas** un problème d'email (celui de `elkoraichi` était déjà vérifié). C'est une protection anti-abus du plan **Free** Netlify (`block_builds_on_unmatched_git_contributors` / `block_unmatched_git_contributors_strict`, visibles via `netlify api listAccountsForUser`) qui s'applique aux dépôts privés. Solution retenue : **dépôt GitHub passé en public** (`gh repo edit ... --visibility public`), puis un nouveau push pour forcer Netlify à resynchroniser sa métadonnée `public_repo` (elle restait à `false` en cache tant qu'aucun push n'avait eu lieu après le changement de visibilité) |
| **Prochaine action** | Écrire les tests/critères du module `DEPLOY` (arrêts 14-15 du plan vague 1) — pas encore commencé malgré le site en ligne. Décision en attente : le dépôt public est-il acceptable durablement, ou faut-il plutôt ajouter un moyen de paiement au compte Netlify pour pouvoir repasser en privé ? |
| **Suite de tests** | Inchangée depuis la clôture du lot 3 : **856 Vitest, `tsc`/`eslint` muets**. Quatre tests unitaires pour `resoudreSourceEnv` (`tests/unite/setup/configuration.test.ts`, describe `DEPLOY-007`) |
| **En attente de Yassine** | 1) Débloquer « Unrecognized Git contributor » (ci-dessus). 2) Jugement visuel **L2** sur les dix captures de `Rapports/apercus-lot3/`, toujours en attente depuis la clôture du lot 3 |

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
- **Piège trouvé et corrigé** : `env()` de `prisma/config` **lève une erreur**
  si la variable est absente (`PrismaConfigEnvError`), au lieu de rendre
  `undefined` — inutilisable pour un repli `??`. Ça faisait planter
  `prisma generate` (`postinstall`) dès l'étape « Install dependencies » de
  Netlify, avant même d'atteindre le build. Remplacé par
  `process.env.DATABASE_URL` dans `prisma.config.ts` (commit `c1dc7fd`).
- **`netlify init` (non `--manual`) fonctionne bien mieux** que la version
  manuelle : l'app GitHub officielle pose seule la clé de déploiement et le
  webhook. La version `--manual` (clé SSH et webhook affichés à copier à la
  main) a échoué — `Permission denied (publickey)` au premier essai.

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
