# Où nous en sommes

> Dix lignes, tenues à jour **à la fin de chaque arrêt**. C'est le premier fichier
> à lire dans une session neuve, et le seul qui dise l'état d'un travail *en
> cours* — le tableau de bord du §2, lui, ne parle que des modules terminés.

| | |
|---|---|
| **Dernier commit** | `eab957d` (commit vide, correction d'identité Git) — **poussé sur GitHub**, `git push` fonctionne (garde-fou `.githooks/pre-push` franchi à chaque fois). Un premier blocage `git push` par `.claude/settings.json` a été résolu en laissant Yassine pousser lui-même — je n'ai jamais touché ce réglage |
| **Lot en cours** | 7 — `DEPLOY` seul (vague 1), en cours, **hors méthode par arrêts habituelle** : session d'infrastructure interactive (comptes, Netlify, base, GitHub), pas de développement de règles métier |
| **Module en cours** | `DEPLOY` — ni l'arrêt 1 (garde-fous, `DEPLOY-007/009/010/013/014`) ni les suivants ne sont commencés. Tout le travail des deux dernières sessions est de la mise en place d'hébergement |
| **Arrêt en cours** | Déploiement continu Netlify — **bloqué**, cf. « Prochaine action » |
| **État du déploiement** | Compte Netlify dédié (`koraichi@gmail.com`, ne jamais confondre avec le compte client `wbhabitat@gmail.com` présent sur cette machine). Site **baby-house-solenne** (`https://baby-house-solenne.netlify.app`, admin `https://app.netlify.com/projects/baby-house-solenne`). Base **Netlify DB** provisionnée, sauvegardes natives actives. **Dépôt GitHub relié en déploiement continu** (`netlify init` avec l'app GitHub officielle — clé et webhook posés automatiquement, `elkoraichi/solenne` branche `main`). Le bug qui faisait planter `prisma generate` au moment de l'installation des dépendances est corrigé (`prisma.config.ts`, commit `c1dc7fd`) |
| **Blocage actuel** | Chaque build déclenché par un push échoue **avant même de commencer** : `Build blocked: Unrecognized Git contributor. This plan allows only verified account members to push to private repos.` Netlify ne reconnaît pas l'auteur du commit comme un membre vérifié du compte. Un premier essai en réglant `git config user.email "koraichi@gmail.com"` (l'adresse du compte Netlify) **n'a pas suffi** — même erreur après. L'adresse vérifiée par GitHub pour le compte `elkoraichi` n'est probablement pas `koraichi@gmail.com` |
| **Prochaine action** | Yassine vérifie lui-même, en plein jour : (1) quelle(s) adresse(s) sont **vérifiées** sur GitHub pour le compte `elkoraichi` → `https://github.com/settings/emails` ; (2) régler `git config user.email` sur l'une d'elles, refaire un commit vide + push ; (3) si ça persiste, chercher côté tableau de bord Netlify (`Site settings → Build & deploy`, ou réglages d'équipe) un paramètre lié aux contributeurs autorisés — je n'ai pas trouvé ce réglage par l'API en fin de session |
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
