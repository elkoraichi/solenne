# Plan des sessions restantes — vague 1

> 15 sessions, une par **arrêt**. Chaque session déclare son **modèle** : Sonnet
> quand le travail reproduit un motif déjà posé, Opus quand il faut décider
> quelque chose qu'aucun test n'attraperait après coup.
>
> Règle d'ouverture de session, écrite dans `CLAUDE.md` : lire `Rapports/etat.md`,
> trouver l'arrêt en cours ci-dessous, et **si le modèle actif n'est pas celui de
> la ligne, le dire avant toute autre chose**.

## Comment le modèle est choisi

| | Sonnet | Opus |
|---|---|---|
| Nature du travail | Reproduire un motif posé — gardes, transactions, formulaires, écrans, énumération de cas contre un contrat déjà figé | Figer un contrat, ordonner des règles qui se combinent, tenir une transaction concurrente |
| Ce qu'une erreur coûte | Un test rouge, corrigé dans l'heure | Une formule fausse qui contamine les séjours, l'agenda et la confidentialité, et que les tests ne voient pas parce qu'ils testent ce qu'on a pensé à tester |
| Sessions concernées | 11 | 4 — `OCCUP-A`, `AVAIL-A`, `AVAIL-C`, `STAYDEC-A` |

`.claude/settings.json` fixe **Sonnet par défaut** : une session neuve démarre toujours au moins cher. Les quatre sessions Opus sont l'exception, annoncée à l'ouverture.

---

## Lot 3 — Séjours ★ · 133 cas · 13 sessions

### `OCCUP` — Calcul de l'occupation ★ · 34 cas

| | S1 · **OCCUP-A** | S2 · **OCCUP-B** |
|---|---|---|
| **Modèle** | **Opus** | Sonnet |
| Contenu | Contrat du registre `OCCUP-CT-01→08` · branchement du contributeur `SÉJOUR_CONFIRMÉ` · les fondamentaux du décompte | Périodes dégénérées, détail par source, occupation maximale, volume · **sentinelle** · grille de sécurité · rapport |
| Cas | `CT-01→08`, `001→014` (22) | `015→026` (12) |
| Fini quand | La formule est figée et `AVAIL` peut la consommer sans jamais recompter | `OCCUP-024` échoue si l'on ajoute une source sans la déclarer |

**Pourquoi Opus sur S1** : c'est le seul endroit du produit qui additionne des personnes (règle non négociable n°3). Le contrat qu'on y écrit, le lot 4 devra l'**allumer** sans le réécrire. Une erreur d'architecture ici ne se voit pas — elle se paie deux lots plus loin.

**À trancher à l'ouverture de S1** : problème **P6** — l'effectif est **adultes + enfants**, pas « + invités », `stay_guests` nommant les mêmes personnes. À acter formellement, pas à redécouvrir.

### `AVAIL` — Moteur de compatibilité ★ · 35 cas

| | S3 · **AVAIL-A** | S4 · **AVAIL-B** | S5 · **AVAIL-C** |
|---|---|---|---|
| **Modèle** | **Opus** | Sonnet | **Opus** |
| Contenu | Garde-fou G1 · R1 blocages · R2/R3 exclusivité · R4 capacité | R5 cohabitation · R6 événements *(dormant)* · R7 séjour pendant événement · R8 délégation à `POLICY` | Les 8 **combinaisons** · ordre d'évaluation · aucun conflit masqué · table de décision exhaustive · rapport |
| Cas | `CT-01`, `001→013` (14) | `014→026` (13) | `027→034` (8) |
| Fini quand | `AVAIL-CT-01` prouve qu'`AVAIL` ne compte pas lui-même | Les huit règles rendent chacune leur code stable et son message français | Une demande qui viole trois règles les rend **toutes les trois** |

**Pourquoi Opus sur S3 et S5** : S3 pose le garde-fou G1 — `AVAIL` consomme `OCCUP`, il ne recompte jamais. S5 est le seul endroit où les règles se combinent : c'est là que vivent les fautes qui ne ressemblent pas à des fautes. S4, entre les deux, applique un motif déjà établi, règle après règle.

### `POLICY` — Règles de réservation · 16 cas

| | S6 · **POLICY-A** | S7 · **POLICY-B** |
|---|---|---|
| **Modèle** | Sonnet | Sonnet |
| Contenu | Les huit réglages en domaine pur · **jamais opposés à Solenne** | Console de Solenne · persistance · sécurité `S02` · 320 px · rapport |
| Cas | `001→008`, `010`, `015` (10) | `009`, `011→014`, `S02` (6) |

### `STAYREQ` — Demande de séjour · 20 cas

| | S8 · **STAYREQ-A** | S9 · **STAYREQ-B** |
|---|---|---|
| **Modèle** | Sonnet | Sonnet |
| Contenu | Server Actions : créer, consulter, modifier, annuler · privatisation D2 · acceptation des règles · concurrence `C06` · sécurité `S04` | Assistant en 3 étapes · disponibilité en direct · récapitulatif « soumis à l'accord de Solenne » · E2E · 320 px · rapport |
| Cas | `001→009`, `011`, `012`, `014→017`, `C06`, `S04` (17) | `010`, `013`, `018` (3) |

### `STAYDEC` — Décision ⚠️ · 18 cas

| | S10 · **STAYDEC-A** | S11 · **STAYDEC-B** |
|---|---|---|
| **Modèle** | **Opus** | Sonnet |
| Contenu | **Revalidation dans la transaction sérialisable** · contrainte d'exclusion en base · grille de concurrence `C01` et `C05` | File d'attente · écran de décision · acceptation, refus, contre-proposition · sécurité `S02`/`S06` · 320 px · rapport |
| Cas | `001`, `005`, `006`, `011`, `014`, `C01`, `C05` (7) | `002→004`, `007→010`, `012`, `013`, `S02`, `S06` (11) |

**Pourquoi Opus sur S10** : c'est le module ⚠️ du projet. Deux acceptations à la même seconde sur la dernière place doivent produire exactement un séjour, et le refus de l'autre doit être un refus **métier**, pas une trace de base de données. C'est le seul endroit de la vague 1 où le code juste et le code presque juste sont indiscernables à la lecture.

### `STAY` — Séjours confirmés · 10 cas

| | S12 · **STAY** |
|---|---|
| **Modèle** | Sonnet |
| Contenu | Consultation · séjours de Solenne créés sans demande · annulation des deux côtés · libération de la capacité · passage en `COMPLETED` · rapport |
| Cas | `001→010` (10) |

### Clôture du lot 3

| | S13 · **Clôture** |
|---|---|
| **Modèle** | Sonnet |
| Contenu | Campagne responsive **aux trois tailles** (mesure M2, une fois par lot) · régression complète chronométrée · rapport de lot sur les 10 critères du §11.1 · tableau de bord §2 · journal §14.3 · captures pour votre jugement **L2** |

---

## Lot 7 — Mise en ligne · 14 cas · 2 sessions

| | S14 · **DEPLOY-A** | S15 · **DEPLOY-B** |
|---|---|---|
| **Modèle** | Sonnet | Sonnet |
| Contenu | Variables d'environnement vérifiées · migrations de production · procédure de **retour arrière** · documentation d'installation et d'exploitation | Mise en ligne Vercel + Neon · sauvegarde automatique et **restauration réellement testée** · supervision des erreurs |
| Bloqué par | — | **L1** — achat du domaine (D6 : `chezsolenne.fr` ou `mamasolenne.fr`) et création des comptes Vercel, Neon, Resend |

`DEPLOY-013` et `DEPLOY-014` restent bloquants tant que les contenus provisoires n'ont pas été confirmés (problème **P7** : les 15 photos sont-elles définitives ?).

---

## Ce que chaque session livre, sans exception

1. Les tests **avant** le code, verts à la fin.
2. Grille de sécurité S1→S12 si la session touche une surface sensible ; grille de concurrence C1→C6 s'il y a contention.
3. Régression complète au vert.
4. `Rapports/etat.md` mis à jour — module, arrêt, prochaine action.
5. Un commit.

Une session qui déborde le plafond de 40 000 jetons s'arrête **là où elle en est**, écrit la fiche de reprise, et rend la main. Un arrêt coupé en deux coûte moins qu'une session qui déborde.
