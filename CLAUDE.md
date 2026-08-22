# La Maison de Solenne — brief permanent

Application web privée pour la maison de campagne de Solenne : événements entre amis et demandes de séjour. Pas une plateforme commerciale, pas un Airbnb.

## Documents de référence (ne pas tout relire — cibler)

| Fichier | Quand le lire |
|---|---|
| `Mode Operatoire.md` | §6 avant le lot 3 · §7 grille sécurité · §8 grille concurrence · §11 critères de validation |
| `Mode Operatoire - Detail/Lot<N>-*.md` | **au début du lot N uniquement** — fiches + cas de test |
| `02_Analyse_Architecture.md` | §4 modèle de données · §5 écrans |
| `04_Contenu_a_fournir.md` | contenus provisoires en attente |
| `01_...txt`, `03_...txt` | archives — ne pas relire sauf besoin précis |

Mettre à jour le tableau de bord (§2 du Mode Opératoire) et le journal (§14) à chaque fin de module.

## Interlocuteur

Yassine **n'est pas développeur**. Il ne débogue rien, ne lit pas de trace, ne corrige aucun fichier.
- Toute erreur technique : je cherche la cause, je corrige, je relance les tests, puis la régression. Je ne lui demande jamais de réparer quoi que ce soit.
- Je ne le sollicite que pour une **décision fonctionnelle**, regroupée en fin de rapport de module.
- Trois limites acceptées : **L1** achat du domaine et création des comptes · **L2** jugement visuel · **L3** contenu réel (photos, chambres, règles).

## Décisions arrêtées

| | |
|---|---|
| D1 | Capacité paramétrable **1→25**, provisoirement **10** |
| D2 | Séjour **exclusif** (privatisation) retenu |
| D3 | Séjours pendant un événement = **cas nominal** ; RSVP porte « je dors sur place » ; les dormeurs comptent dans la capacité |
| D4 | Confidentialité par défaut : un ami voit **« Maison occupée »**, rien d'autre |
| D5 | Solenne **seule administratrice** |
| D6 | Domaine **non arrêté** (`chezsolenne.fr` ou `mamasolenne.fr`) → paramètre d'environnement, jamais en dur |
| D7 | **Français uniquement**, pas de couche i18n |
| D8 | Deux événements ne peuvent jamais se chevaucher |
| D9 | Séjours **de Solenne** plus visibles par défaut (« prénom et nombre ») ; le réglage global ne vaut que pour le cercle |
| — | Occupation : **option B** — registre de contributeurs (Mode Opératoire §6) |
| — | Nom affiché de la maison = **donnée**, jamais un texte en dur |
| — | WhatsApp : post-MVP, canal déclaré mais inactif |

## Stack

Next.js 15 (App Router, Server Actions) · TypeScript strict · PostgreSQL + Prisma · Auth.js v5 (Argon2id) · Tailwind v4 + shadcn/ui · Resend + React Email · Vitest + Playwright · Vercel + Neon.
Agenda : composant maison, pas de bibliothèque de calendrier.

## Organisation du code

```
src/domain/     logique pure — zéro import React / Next / Prisma
  occupancy/    OCCUP ★ registre de contributeurs
  availability/ AVAIL ★ règles R1→R8, ne compte jamais lui-même
  policy/ privacy/ stays/ events/
src/server/actions|auth|notifications
src/app/(auth)|(app)|(admin)   src/components/ui|calendar   src/emails
```

## Règles non négociables

1. **Refus par défaut** : chaque Server Action commence par `requireUser()` / `requireRole('ADMIN')`. Aucune exception.
2. **Rôle et identité lus côté serveur** depuis la session. Toute valeur venant du client est ignorée.
3. **`AVAIL` ne compte jamais** : il consomme `OCCUP`. Un seul endroit additionne des personnes.
4. **Confidentialité serveur** : la donnée privée n'est pas envoyée puis masquée — elle n'est pas envoyée.
5. **Aucune trace technique à l'écran.** Message français + issue proposée ; le détail va dans les journaux. Jamais de mot de passe ni de jeton journalisé.
6. **Jetons hachés en base**, usage unique, expirants. Aucune inscription libre.
7. **Convention de dates `[arrivée, départ[`** — le jour du départ n'est pas occupé. UTC en base, `Europe/Paris` à l'affichage.
8. **Audit dès le lot 1** : toute action d'administration journalisée, journal en écriture seule.
9. **Validation Zod** de toute entrée serveur.
10. **Concurrence** : transaction sérialisable + revalidation dans la transaction + contrainte d'exclusion PostgreSQL sur les séjours exclusifs et les événements.

## Méthode par module

```
1. Relire la fiche du module (fichier de son lot)
2. Écrire les tests AVANT le code — strict pour domaine, règles, permissions, Server Actions
   (pour l'UI : critères d'acceptation avant, E2E stabilisés juste après l'écran — arbitrage validé)
3. Développer jusqu'au vert
4. Grille sécurité S1→S12 · grille concurrence C1→C6 si contention
5. Régression complète (< 5 min ; au-delà, fusionner les redondances et le consigner)
6. Vérifier 320 / 768 / 1440 px
7. Rapport de fin de module + mise à jour du tableau de bord
```

Un module est validé si et seulement si les **10 critères** du §11.1 sont réunis. « Le code compile » ne vaut jamais « c'est terminé ».

## Ordre des lots

`0 Fondations` → `1 Identité` → `2 Maison & Agenda` → `3 Séjours ★` → `4 Événements` → `5 Vie de l'événement` → `6 Notifications` → `7 Finition`.
Fin du lot 3 = application déjà exploitable.
**Lot 4 `SLEEP`** : activer le contributeur `DORMEUR_ÉVÉNEMENT`, **ne réécrire aucune formule**, puis rejouer `OCCUP` + `AVAIL` + `POLICY` + `STAYREQ` + `STAYDEC` + `CAL`.

## Ton du produit

Carnet numérique d'une maison de campagne, pas un logiciel de gestion. Lin, olive, terracotta, bois. Titres à empattements, corps sans-serif. Grandes cartes photo, coins arrondis, ombres douces. Mobile d'abord — 90 % de l'usage. Aucun tableau de données côté ami.

## Économie de contexte

- Écrire dans les fichiers, ne pas recopier leur contenu dans la conversation.
- Lire la fiche du lot en cours, pas les autres.
- Sortie de tests : ne remonter que les échecs.
- Rapports de fin de module : courts, format imposé.
- Repartir d'une session neuve entre deux lots.

## Plafond de session — 40 000 jetons

**Une session couvre un arrêt, pas un module.** Approchant du plafond, je m'arrête où j'en suis, je mets `Rapports/etat.md` à jour et je demande une session neuve. Un arrêt inachevé repris proprement coûte moins qu'une session qui déborde.

| Règle | Pourquoi |
|---|---|
| Lire une fiche **par plage de lignes** (`sed -n '297,362p'`) | Le fichier d'un lot pèse ~10 000 jetons ; la section d'un module en pèse 2 000 |
| Ne jamais chercher dans `src/generated/` ni `node_modules/` | Une seule ligne du client Prisma généré fait 24 209 caractères |
| Ne pas relire un fichier que je viens d'écrire | `Edit` échoue si l'écriture n'a pas eu lieu — la relire ne prouve rien |
| Sortie de tests : rapporteur `dot`, et ne commenter que les échecs | Le journal est déjà filtré (`JOURNAL_NIVEAU_MIN`) : une passe verte tient en 2 300 caractères |
| Grouper les commandes indépendantes en un seul appel | Chaque aller-retour d'outil se repaie à tous les tours suivants |
| Fin d'arrêt : `Rapports/etat.md` en dix lignes, puis stop | Sans elle, la session suivante dépense vingt appels d'outils à retrouver où nous en sommes |

Le modèle se choisit par session (`/model`) : **Sonnet par défaut**, Opus réservé à `OCCUP` et `AVAIL` (§2.2, mesure M1).
