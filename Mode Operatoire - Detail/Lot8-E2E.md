# Parcours E2E · Fiches détaillées

23 parcours — les 18 du §12 de `03_Instructions avant les développements.txt` et les 5 ajoutés, validés le 21/08/2026.
Rattaché à `Mode Operatoire.md` v1.0.

---

## Conditions d'exécution

| Élément | Valeur |
|---|---|
| Outil | Playwright, navigateur réel |
| Base | Environnement dédié, réinitialisé avant chaque campagne |
| Tailles | **Desktop 1440 px et mobile 375 px** pour chaque parcours |
| Emails | Émetteur simulé, messages capturés et inspectables |
| Comptes | `solenne@demo.fr` (ADMIN), `marc@demo.fr`, `julie@demo.fr`, `jean@demo.fr` (FRIEND), `paul@demo.fr` (DISABLED) |
| Maison | Capacité 12, 3 chambres, 2 bureaux, 6 règles dont 3 obligatoires |
| Durée cible | < 10 min pour la campagne complète |

**Règle de chaînage :** les parcours 001 à 011 s'enchaînent sur un même état, dans l'ordre. Les parcours 012 à 023 sont indépendants et repartent d'un état neuf.

---

## E2E-001 — Solenne invite un ami · CRITICAL

**Préconditions :** Solenne connectée, `nouveau@demo.fr` inconnu du système.
**Étapes :** Gérer → Utilisateurs → Inviter → saisir l'email et le rôle FRIEND → envoyer.
**Attendu :** invitation créée en attente · email capturé contenant un lien unique · lien copiable affiché · entrée d'audit écrite · l'invitation apparaît dans la liste avec sa date d'expiration à 14 jours.

## E2E-002 — L'ami accepte l'invitation et crée son compte · CRITICAL

**Préconditions :** `E2E-001` exécuté, lien récupéré.
**Étapes :** ouvrir le lien → définir un mot de passe conforme → saisir prénom, nom, téléphone → valider.
**Attendu :** compte créé en rôle **FRIEND** (jamais ADMIN) · session ouverte · arrivée sur l'accueil · invitation marquée acceptée · le lien réutilisé une seconde fois est refusé.

## E2E-003 — L'ami se connecte · CRITICAL

**Préconditions :** compte créé, déconnecté.
**Étapes :** écran de connexion → email + mot de passe → valider.
**Attendu :** session ouverte, arrivée sur l'accueil personnalisé · un mot de passe erroné produit un message identique à celui d'un email inconnu · cookie `httpOnly` et `secure`.

## E2E-004 — Solenne crée un événement · HIGH

**Préconditions :** Solenne connectée.
**Étapes :** Agenda → Nouvel événement → « Week-end barbecue », 12→13/09, max 10, photo → ajouter 4 activités → ajouter la liste « à apporter » (viande ×2, dessert ×2, pain ×1) → sélectionner 3 invités → publier.
**Attendu :** événement publié et visible à l'agenda · 3 invitations envoyées · programme trié par heure · liste à apporter visible des invités · brouillon invisible avant publication.

## E2E-005 — L'ami reçoit l'invitation et répond · HIGH

**Préconditions :** `E2E-004` exécuté, Marc connecté.
**Étapes :** notification → ouvrir l'événement → « Je viens » → +1 adulte, 2 enfants → arrivée 18h → commentaire → valider.
**Attendu :** RSVP enregistré · décompte à 4 personnes · Marc apparaît dans la liste des participants · Solenne notifiée · le commentaire n'est visible que de Solenne.

## E2E-006 — L'ami indique qu'il dort sur place · HIGH

**Préconditions :** `E2E-005` exécuté.
**Étapes :** sur l'événement → cocher « je dors sur place » → nuit du 12 au 13, 4 personnes → valider.
**Attendu :** couchage enregistré · **occupation du 12 augmentée de 4** · Solenne voit les dormeurs par nuit · l'option n'apparaît pas pour une réponse « Peut-être ».

## E2E-007 — L'ami indique ce qu'il apporte · MEDIUM

**Préconditions :** `E2E-005` exécuté.
**Étapes :** onglet « À apporter » → « Je m'en charge » sur *Dessert*.
**Attendu :** nom affiché, compteur à 1/2 · un second clic du même utilisateur est refusé · quand le second preneur arrive, le créneau se ferme.

## E2E-008 — L'ami demande un séjour · CRITICAL

**Préconditions :** Marc connecté, dates 18→20/09 libres.
**Étapes :** Séjours → Demander → dates → 2 adultes, 2 enfants → motif et commentaire → accepter les règles → envoyer.
**Attendu :** disponibilité affichée en direct pendant la saisie · **mention « soumis à l'accord de Solenne » présente** · demande créée en `PENDING`, jamais confirmée · acceptation des règles horodatée · Solenne notifiée.

## E2E-009 — Solenne reçoit la demande · CRITICAL

**Préconditions :** `E2E-008` exécuté, Solenne connectée.
**Étapes :** accueil → « 1 demande à traiter » → ouvrir.
**Attendu :** demande en tête de l'accueil · détail complet du demandeur et des dates · **verdict du moteur affiché en clair** : « ✅ Compatible — 4 personnes sur 12 ».

## E2E-010 — Solenne accepte la demande · CRITICAL

**Préconditions :** `E2E-009` exécuté.
**Étapes :** ouvrir la demande → Accepter → message d'accueil optionnel → confirmer.
**Attendu :** statut `ACCEPTED` · séjour confirmé créé dans la même transaction · Marc notifié par notification interne et email · entrée d'audit · une seconde acceptation de la même demande est refusée.

## E2E-011 — Le séjour apparaît correctement à l'agenda · CRITICAL

**Préconditions :** `E2E-010` exécuté.
**Étapes :** agenda de Solenne, puis agenda de Marc, puis agenda de Julie.
**Attendu :** Solenne voit « Marc + 3 » les 18 et 19 · Marc voit son séjour en détail · **Julie ne voit que « Maison occupée »** · le 20 (jour de départ) est libre dans les trois vues.

## E2E-012 — Un autre ami demande les mêmes dates · CRITICAL

**Préconditions :** séjour de Marc confirmé (4 personnes), capacité 12.
**Étapes :** Julie demande 3 personnes du 18 au 20/09.
**Attendu :** **demande acceptée par le moteur comme compatible** — cohabitation, règle R5 · occupation projetée à 7/12 · Julie ne voit pas qui occupe déjà.

## E2E-013 — Le moteur calcule correctement la capacité · CRITICAL

**Préconditions :** capacité 12, séjour de Marc (4) et séjour de Julie (3) confirmés sur 18→20.
**Étapes :** Jean demande 6 personnes sur les mêmes dates.
**Attendu :** ❌ refus `CAPACITY_EXCEEDED` · message français « La maison serait à 13 personnes pour 12 places » · **aucune information sur l'identité des occupants** · Solenne voit le détail complet de son côté.

## E2E-014 — Solenne refuse une demande · HIGH

**Préconditions :** une demande en attente.
**Étapes :** ouvrir → Refuser → saisir un motif → confirmer.
**Attendu :** statut `REJECTED` · un refus sans motif est bloqué · demandeur notifié avec le motif · demande conservée dans l'historique.

## E2E-015 — Un séjour est annulé · HIGH

**Préconditions :** séjour de Marc confirmé (4 personnes), capacité saturée.
**Étapes :** Marc annule son séjour → puis Jean redemande les dates précédemment refusées.
**Attendu :** statut `CANCELLED` · Solenne notifiée · **capacité libérée immédiatement** · la demande de Jean devient compatible · le séjour annulé reste dans l'historique.

## E2E-016 — Un événement est déplacé, puis annulé · HIGH

**Préconditions :** événement du 12/09 avec 3 réponses « Oui » et 2 déclarations de couchage.
**Étapes :** Solenne déplace au 19/09 → vérifier → puis annule l'événement.
**Attendu :** au déplacement, **les 3 RSVP repassent en `PENDING`** et tous les invités sont notifiés des anciennes et nouvelles dates · à l'annulation, tous sont notifiés et **l'occupation liée aux couchages est intégralement libérée** · l'événement reste consultable en historique.

## E2E-017 — Un utilisateur désactivé tente d'accéder · CRITICAL

**Préconditions :** Paul connecté sur un appareil, puis désactivé par Solenne.
**Étapes :** Paul tente de naviguer → puis de se reconnecter → puis d'appeler une action directement.
**Attendu :** session invalidée **immédiatement** · reconnexion refusée avec un message neutre · appel direct refusé · aucune donnée émise dans aucun des trois cas.

## E2E-018 — Un utilisateur tente d'accéder à des informations interdites · CRITICAL

**Préconditions :** Julie connectée, séjour et demande de Marc existants.
**Étapes :** accès direct à l'identifiant du séjour de Marc → au fil de sa demande → à `/gerer/utilisateurs` → à l'historique global → appel direct de l'action « accepter une demande ».
**Attendu :** **les cinq tentatives refusées** · messages neutres ne confirmant pas l'existence des ressources · aucune donnée privée dans aucune réponse serveur · chaque tentative sur une action d'administration est journalisée.

---

## Les 5 parcours ajoutés

## E2E-019 — Séjour exclusif · CRITICAL

> Couvre la décision D2, absente des 18 parcours initiaux.

**Préconditions :** maison libre du 25 au 27/09, capacité 12.
**Étapes :** Marc demande 4 personnes **en cochant « je souhaite privatiser la maison »** → Solenne voit la mention d'exclusivité et accepte → Julie demande 2 personnes sur les mêmes dates → puis Jean demande une privatisation sur des dates libres où un séjour existe déjà.
**Attendu :** séjour exclusif confirmé · demande de Julie **refusée `EXCLUSIVE_CONFLICT`** malgré une capacité largement suffisante · demande de Jean refusée `EXCLUSIVE_REQUEST_CONFLICT` · la contrainte d'exclusion PostgreSQL empêche physiquement tout séjour exclusif concurrent.

## E2E-020 — Confidentialité « Maison occupée » · CRITICAL

> Couvre la décision D4 en vérifiant **la réponse serveur**, pas l'affichage.

**Préconditions :** 3 séjours d'autres amis confirmés sur septembre, avec motifs et commentaires renseignés.
**Étapes :** Julie ouvre l'agenda → l'accueil → tente d'ouvrir un séjour par son identifiant. **Inspection de la charge utile de chaque réponse serveur.**
**Attendu :** « Maison occupée » seul à l'écran · **aucun nom, nombre de personnes, motif, commentaire ni identifiant d'utilisateur dans les réponses** · aucun décompte de places au chiffre près · accès direct refusé · Solenne, sur les mêmes écrans, voit l'intégralité.

## E2E-021 — Dernier créneau « Je m'en charge », deux clics simultanés · HIGH

> Couvre la grille de concurrence C2.

**Préconditions :** objet *Dessert* à 1 preneur sur 2, Julie et Jean sur l'écran en même temps.
**Étapes :** les deux cliquent « Je m'en charge » simultanément.
**Attendu :** **un seul preneur enregistré** · l'autre voit « Ce créneau vient d'être pris » · compteur à 2/2, jamais 3/2 · la contrainte d'unicité en base est la garantie finale.

## E2E-022 — Parcours mobile complet au doigt · CRITICAL

> L'usage réel sera à 90 % sur téléphone (§20).

**Préconditions :** navigateur en 375 × 812 px, simulation tactile, une seule main.
**Étapes :** connexion → accueil → agenda → consulter un événement → répondre au RSVP → déclarer un couchage → demander un séjour (assistant 3 étapes) → consulter la maison et les règles → modifier son profil → se déconnecter.
**Attendu :** aucun débordement horizontal · toutes les cibles ≥ 44 px · le clavier virtuel ne masque jamais le bouton de validation · les 3 étapes de l'assistant conservent les données au retour arrière · parcours entier réalisable au pouce sans repositionner la main.

## E2E-023 — Mot de passe oublié · HIGH

> Parcours de secours vital, absent des 18 parcours initiaux.

**Préconditions :** Marc a perdu son mot de passe.
**Étapes :** connexion → « Mot de passe oublié » → saisir son email → récupérer le lien → définir un nouveau mot de passe → se connecter → réutiliser l'ancien lien → réessayer avec un email inconnu.
**Attendu :** email capturé avec un lien unique · nouveau mot de passe accepté et connexion réussie · **les autres sessions de Marc sont invalidées** · le lien réutilisé est refusé (« Ce lien a déjà été utilisé ») · l'email inconnu produit **exactement le même message** que l'email connu · aucun jeton en clair en base ni dans les journaux.
