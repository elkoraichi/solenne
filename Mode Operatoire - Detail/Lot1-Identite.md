# Lot 1 — Identité · Fiches détaillées

`PERM` · `AUTH` · `PWD` · `INVITE` · `PROFILE` · `USERS` — 6 modules, 118 cas de test.
Rattaché à `Mode Operatoire.md` v1.0.

---

# MODULE `PERM` — Permissions & audit ⚠️

> Module de sécurité central. Une faille ici compromet tout le reste. Développé **en premier** du lot 1.

## 1. Objectif
Garantir qu'aucune donnée n'est lue ni écrite sans qu'une garde serveur ait vérifié l'identité et le droit de l'appelant, et que toute action d'administration laisse une trace.

## 2. Fonctionnalités
Garde `requireUser()` et `requireRole('ADMIN')` en première ligne de chaque Server Action · résolution du rôle depuis la session serveur, jamais depuis le client · refus par défaut pour toute action non explicitement autorisée · invalidation immédiate des sessions d'un compte désactivé · **écriture au journal d'audit** (acteur, action, entité, différentiel, adresse IP, horodatage) · table de capacités par rôle, extensible.

## 3. Données manipulées
`users.role`, `users.status`, `sessions`, `audit_logs`.

## 4. Règles métier
| # | Règle |
|---|---|
| PERM-R1 | **Refus par défaut** : une action sans garde explicite est refusée |
| PERM-R2 | Le rôle est lu côté serveur depuis la session ; toute valeur venant du client est ignorée |
| PERM-R3 | Un compte `DISABLED` est refusé partout, y compris avec une session encore valide |
| PERM-R4 | Un refus ne révèle jamais l'existence de la ressource visée |
| PERM-R5 | Toute action d'administration est journalisée avant d'être considérée comme réussie |
| PERM-R6 | Le journal d'audit est en écriture seule : ni modification, ni suppression |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Appeler une action publique (connexion, invitation) | ✅ | ✅ | ✅ |
| Appeler une action authentifiée | ❌ | ✅ | ✅ |
| Appeler une action d'administration | ❌ | ❌ | ✅ |
| Lire le journal d'audit | ❌ | ❌ | ✅ |

**Interdits absolus :** un ami ne doit jamais pouvoir exécuter une action d'administration, même par appel direct · un visiteur ne doit jamais obtenir la moindre donnée métier · personne ne doit pouvoir modifier ou effacer le journal.

## 6. Dépendances
`CORE`.

## 7. Cas nominaux
Solenne appelle une action d'administration → autorisée et journalisée · un ami appelle une action d'ami → autorisée · un visiteur est redirigé vers la connexion.

## 8. Cas limites
Session expirée en cours d'action · compte désactivé pendant une session ouverte · rôle modifié pendant une session ouverte · action appelée sans session · identifiant d'une ressource inexistante · deux gardes imbriquées.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Une Server Action oubliée sans garde | CRITICAL | `PERM-012` énumère automatiquement toutes les actions et vérifie la présence d'une garde |
| Élévation de privilège par paramètre client | CRITICAL | `PERM-S07` |
| Journal incomplet parce qu'ajouté trop tard | HIGH | Audit intégré dès ce module, pas au lot 7 |

## 10. Critères d'acceptation
Les 26 tests passent · **`PERM-012` prouve qu'aucune Server Action n'est dépourvue de garde** · grille S1→S12 complète au vert · toute action d'administration produit une entrée d'audit vérifiable.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| PERM-001 | Visiteur refusé | Aucune session | Appeler une action authentifiée | Refus, redirection connexion, aucune donnée émise | CRITICAL | Security |
| PERM-002 | Ami autorisé | Session ami valide | Appeler une action d'ami | Succès | CRITICAL | Integration |
| PERM-003 | Ami refusé sur action admin | Session ami valide | Appeler « accepter une demande » | Refus, aucune écriture, entrée d'audit du refus | CRITICAL | Security |
| PERM-004 | Solenne autorisée | Session admin | Appeler une action admin | Succès + entrée d'audit | CRITICAL | Integration |
| PERM-005 | Session expirée | Session dépassée | Appeler une action | Refus, déconnexion, message « Votre session a expiré » | CRITICAL | Security |
| PERM-006 | Compte désactivé, session encore ouverte | Ami connecté puis désactivé | Appeler une action | Refus immédiat, session invalidée | CRITICAL | Security |
| PERM-007 | Rôle rétrogradé en cours de session | Admin devenu ami | Appeler une action admin | Refus — le rôle est relu à chaque appel | HIGH | Security |
| PERM-008 | Ressource inexistante | Identifiant inventé | Lire | Message neutre identique à un refus de droit — ne révèle pas l'absence | HIGH | Security |
| PERM-009 | Refus par défaut | Action sans garde déclarée | Appel | Refus | CRITICAL | Security |
| PERM-010 | Audit écrit | Solenne modifie la capacité | Action | Entrée avec acteur, action, entité, avant/après, IP, horodatage | HIGH | Integration |
| PERM-011 | Audit en écriture seule | Entrée existante | Tenter modification et suppression | Refus dans les deux cas | HIGH | Security |
| PERM-012 | **Aucune action sans garde** | Toutes les Server Actions | Énumération automatique | 100 % possèdent `requireUser` ou `requireRole` en première ligne | CRITICAL | Security |
| PERM-013 | Journal illisible par un ami | Session ami | Lire le journal | Refus | HIGH | Security |
| PERM-014 | Deux gardes imbriquées | Action admin appelant une action d'ami | Appel | Aucun double refus, aucune boucle | LOW | Unit |
| PERM-S01 | Accès non authentifié | Aucune session | Les 12 écrans + toutes les actions | Redirection systématique, aucune donnée | CRITICAL | Security |
| PERM-S02 | Ami sur fonction admin | Session ami | Toutes les actions admin | Refus systématique + audit | CRITICAL | Security |
| PERM-S03 | Donnée d'un autre utilisateur | Ami A, ressource de l'ami B | Lecture | Refus, message neutre | CRITICAL | Security |
| PERM-S04 | Modification d'une donnée d'autrui | Ami A, ressource de B | Écriture | Refus, aucune écriture en base | CRITICAL | Security |
| PERM-S05 | Contournement d'interface | Bouton admin réaffiché côté client | Clic | Serveur refuse | HIGH | Security |
| PERM-S06 | Appel direct de Server Action | Requête forgée hors interface | Appel | Garde déclenchée, refus | CRITICAL | Security |
| PERM-S07 | Rôle falsifié dans la charge utile | `role: "ADMIN"` injecté | Appel | Ignoré, rôle relu en session, refus | CRITICAL | Security |
| PERM-S08 | URL privée devinée | `/gerer/utilisateurs` en tant qu'ami | Navigation | Refus serveur, pas seulement masquage | CRITICAL | Security |
| PERM-S09 | Fuite dans la réponse | Réponse d'une action d'ami | Inspection de la charge utile | Aucun champ réservé à l'admin | CRITICAL | Security |
| PERM-S10 | Session révoquée | Déconnexion sur un autre appareil | Appel avec l'ancien cookie | Refus | HIGH | Security |
| PERM-S11 | Cookie de session falsifié | Signature altérée | Appel | Refus, aucune session créée | CRITICAL | Security |
| PERM-S12 | Rafale d'appels refusés | 100 appels admin par un ami | Appels | Tous refusés, limitation déclenchée, audit non saturé | MEDIUM | Security |

---

# MODULE `AUTH` — Authentification

## 1. Objectif
Permettre à une personne invitée de se connecter et de se déconnecter en sécurité, sans qu'aucune inscription libre ne soit possible.

## 2. Fonctionnalités
Connexion email + mot de passe · session en cookie `httpOnly`/`secure`/`sameSite=lax` · déconnexion · limitation de débit · **absence totale de route d'inscription publique** · préparation des fournisseurs externes (Google/Apple) sans les activer.

## 3. Données manipulées
`users` (email, passwordHash, status, lastLoginAt), `sessions`, `accounts`.

## 4. Règles métier
| # | Règle |
|---|---|
| AUTH-R1 | Aucune création de compte hors invitation |
| AUTH-R2 | Mot de passe haché en Argon2id, jamais renvoyé par le serveur |
| AUTH-R3 | Message d'échec identique que l'email existe ou non |
| AUTH-R4 | Un compte `DISABLED` ne peut pas se connecter |
| AUTH-R5 | 5 échecs en 15 minutes → blocage temporaire de 15 minutes |
| AUTH-R6 | La déconnexion invalide la session côté serveur, pas seulement le cookie |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Se connecter | ✅ | ✅ | ✅ |
| Créer un compte librement | ❌ **jamais** | ❌ | ❌ |
| Se déconnecter | — | ✅ | ✅ |

## 6. Dépendances
`PERM`.

## 7. Cas nominaux
Connexion réussie → redirection vers l'accueil · déconnexion → retour à l'écran de connexion.

## 8. Cas limites
Email inconnu · mot de passe erroné · compte désactivé · email avec majuscules ou espaces · 6ᵉ tentative · session ouverte sur deux appareils · cookie supprimé en cours de session.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Énumération de comptes révélant qui fréquente la maison | HIGH | `AUTH-005`, `AUTH-S12` — enjeu de vie privée réel ici |
| Force brute | HIGH | `AUTH-012` |
| Vol de cookie | CRITICAL | `AUTH-008`, `AUTH-S11` |

## 10. Critères d'acceptation
Les 24 tests passent · aucune route d'inscription n'existe · l'empreinte du mot de passe n'apparaît dans aucune réponse serveur.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| AUTH-001 | Connexion valide | Compte actif | Email + mot de passe corrects | Session créée, redirection accueil, `lastLoginAt` mis à jour | CRITICAL | Integration |
| AUTH-002 | Mot de passe erroné | Compte actif | Mauvais mot de passe | Refus, « Email ou mot de passe incorrect » | CRITICAL | Integration |
| AUTH-003 | Email inconnu | — | Email inexistant | **Message strictement identique à AUTH-002** | CRITICAL | Security |
| AUTH-004 | Délai de réponse constant | Email connu vs inconnu | Mesure | Écart de temps < 50 ms — pas d'énumération par chronométrage | MEDIUM | Security |
| AUTH-005 | Compte désactivé | Compte `DISABLED` | Identifiants corrects | Refus, message neutre, aucune session | CRITICAL | Security |
| AUTH-006 | Normalisation de l'email | ` Marc@Exemple.FR ` | Connexion | Reconnu, espaces et casse ignorés | MEDIUM | Unit |
| AUTH-007 | Hachage Argon2id | Compte créé | Inspection base | Empreinte Argon2id, jamais de mot de passe en clair | CRITICAL | Security |
| AUTH-008 | Attributs du cookie | Connexion réussie | Inspection en-têtes | `httpOnly`, `secure`, `sameSite=lax`, expiration bornée | CRITICAL | Security |
| AUTH-009 | Déconnexion | Session active | Déconnexion | Session détruite **côté serveur**, ancien cookie inutilisable | CRITICAL | Integration |
| AUTH-010 | Deux appareils | Sessions A et B | Déconnexion sur A | B reste valide | MEDIUM | Integration |
| AUTH-011 | Aucune inscription libre | — | Recherche de route d'inscription | Aucune route ne permet de créer un compte sans invitation | CRITICAL | Security |
| AUTH-012 | Limitation de débit | 5 échecs en 15 min | 6ᵉ tentative | Blocage temporaire, message expliquant le délai | HIGH | Security |
| AUTH-013 | Déblocage après délai | Compte bloqué | Attendre 15 min | Connexion à nouveau possible | MEDIUM | Security |
| AUTH-014 | Limitation par compte, pas par IP seule | Deux comptes, même IP | Échecs sur le compte A | Le compte B reste accessible | MEDIUM | Security |
| AUTH-015 | Empreinte jamais renvoyée | Connexion réussie | Inspection de la réponse | Aucun champ `passwordHash` | CRITICAL | Security |
| AUTH-016 | Session expirée | Session dépassée | Navigation | Redirection connexion, message explicite | HIGH | Integration |
| AUTH-017 | Renouvellement de session | Session active utilisée | Activité continue | Prolongation sans reconnexion | LOW | Integration |
| AUTH-018 | Champs vides | Formulaire vide | Envoi | Validation côté serveur, messages par champ | MEDIUM | Unit |
| AUTH-S01 | Accès sans session | — | Écrans privés | Redirection | CRITICAL | Security |
| AUTH-S06 | Appel direct de l'action de connexion | Requête forgée | Appel | Validation et limitation appliquées identiquement | HIGH | Security |
| AUTH-S07 | Paramètre `status` injecté | `status: "ACTIVE"` sur compte désactivé | Connexion | Ignoré, refus | CRITICAL | Security |
| AUTH-S10 | Session d'un compte supprimé | Compte effacé | Appel avec ancien cookie | Refus | HIGH | Security |
| AUTH-S11 | Cookie falsifié | Signature altérée | Appel | Refus, aucune session | CRITICAL | Security |
| AUTH-S12 | Énumération par messages | 20 emails, connus et inconnus | Comparaison des réponses | Réponses indiscernables | HIGH | Security |

---

# MODULE `PWD` — Mots de passe

## 1. Objectif
Permettre de récupérer un accès perdu et de changer son mot de passe, sans ouvrir de porte dérobée.

## 2. Fonctionnalités
Demande de réinitialisation · email avec jeton · écran de nouveau mot de passe · changement depuis le profil (ancien mot de passe exigé) · politique de robustesse · invalidation des sessions après changement.

## 3. Données manipulées
`users.passwordHash`, jetons de réinitialisation (hachés, expirants, à usage unique), `sessions`.

## 4. Règles métier
| # | Règle |
|---|---|
| PWD-R1 | Seul le **hash** du jeton est stocké |
| PWD-R2 | Jeton valable 1 heure, à usage unique |
| PWD-R3 | La demande répond toujours pareil, que l'email existe ou non |
| PWD-R4 | Minimum 10 caractères ; refus des mots de passe les plus courants |
| PWD-R5 | Un changement invalide **toutes** les autres sessions |
| PWD-R6 | Le changement depuis le profil exige l'ancien mot de passe |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Demander une réinitialisation | ✅ | ✅ | ✅ |
| Réinitialiser avec un jeton valide | ✅ | ✅ | ✅ |
| Changer son mot de passe | ❌ | ✅ | ✅ |
| Changer celui d'un autre | ❌ | ❌ | ❌ **jamais, même Solenne** |

## 6. Dépendances
`AUTH`.

## 7. Cas nominaux
Oubli → email → nouveau mot de passe → reconnexion · changement depuis le profil.

## 8. Cas limites
Jeton expiré, déjà utilisé, falsifié, appartenant à un autre · demande répétée · mot de passe trop faible · identique à l'ancien · compte désactivé.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Prise de contrôle par jeton rejoué | CRITICAL | `PWD-006`, `PWD-007` |
| Jeton lisible en base après fuite | HIGH | `PWD-003` |
| Sessions actives conservées après vol de compte | HIGH | `PWD-013` |

## 10. Critères d'acceptation
Les 18 tests passent · aucun jeton en clair en base · un jeton consommé est définitivement mort.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| PWD-001 | Demande sur email connu | Compte actif | Demande | Email envoyé, message neutre | HIGH | Integration |
| PWD-002 | Demande sur email inconnu | — | Demande | **Même message**, aucun email envoyé | CRITICAL | Security |
| PWD-003 | Jeton haché en base | Demande émise | Inspection base | Seule l'empreinte est stockée | CRITICAL | Security |
| PWD-004 | Réinitialisation valide | Jeton frais | Nouveau mot de passe | Mot de passe changé, connexion possible | CRITICAL | Integration |
| PWD-005 | Jeton expiré | Jeton de plus d'1 h | Utilisation | Refus, « Ce lien a expiré », proposition de recommencer | HIGH | Security |
| PWD-006 | Jeton déjà utilisé | Jeton consommé | Réutilisation | Refus | CRITICAL | Security |
| PWD-007 | Jeton falsifié | Jeton inventé | Utilisation | Refus, message neutre | CRITICAL | Security |
| PWD-008 | Jeton d'un autre compte | Jeton de B utilisé par A | Utilisation | Refus | CRITICAL | Security |
| PWD-009 | Mot de passe trop court | 6 caractères | Envoi | Refus, « Au moins 10 caractères » | HIGH | Unit |
| PWD-010 | Mot de passe trop courant | `motdepasse` | Envoi | Refus, message explicatif | MEDIUM | Security |
| PWD-011 | Identique à l'ancien | Même mot de passe | Envoi | Refus, « Choisissez un mot de passe différent » | LOW | Unit |
| PWD-012 | Changement depuis le profil | Session active | Ancien + nouveau | Succès | HIGH | Integration |
| PWD-013 | Sessions invalidées | Sessions A et B | Changement depuis A | B est déconnectée | HIGH | Security |
| PWD-014 | Ancien mot de passe erroné | Session active | Mauvais ancien | Refus | HIGH | Security |
| PWD-015 | Compte désactivé | Compte `DISABLED` | Demande | Aucun email, message neutre | HIGH | Security |
| PWD-016 | Demandes en rafale | 10 demandes en 1 min | Envois | Limitation, un seul jeton actif | MEDIUM | Security |
| PWD-017 | Ancien jeton invalidé par un nouveau | Deux demandes successives | Utiliser le premier jeton | Refus — seul le dernier vaut | MEDIUM | Security |
| PWD-018 | Aucun secret journalisé | Réinitialisation complète | Lecture des journaux | Ni jeton, ni mot de passe | CRITICAL | Security |

---

# MODULE `INVITE` — Invitations

## 1. Objectif
Faire entrer une personne dans le cercle privé, uniquement sur décision de Solenne, par un lien à usage unique.

## 2. Fonctionnalités
Émission d'une invitation (email + rôle) · envoi du lien · **lien copiable** en secours · activation avec création du compte · complétion du profil · expiration · révocation · relance · liste des invitations en cours.

## 3. Données manipulées
`invitations` (email, tokenHash, role, invitedById, expiresAt, acceptedAt, revokedAt), `users`.

## 4. Règles métier
| # | Règle |
|---|---|
| INV-R1 | Seule Solenne peut inviter |
| INV-R2 | Seul le **hash** du jeton est stocké |
| INV-R3 | Validité 14 jours, usage unique |
| INV-R4 | Une invitation révoquée est morte définitivement |
| INV-R5 | Un email déjà rattaché à un compte actif ne peut pas être réinvité |
| INV-R6 | Une relance **remplace** le jeton précédent |
| INV-R7 | L'activation crée le compte et ouvre la session dans la même transaction |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Émettre, relancer, révoquer | ❌ | ❌ | ✅ |
| Voir la liste des invitations | ❌ | ❌ | ✅ |
| Activer un lien valide | ✅ | — | — |

**Interdit absolu :** un ami ne doit jamais pouvoir inviter quelqu'un, ni s'auto-attribuer le rôle ADMIN à l'activation.

## 6. Dépendances
`AUTH`. Envoi réel de l'email différé au lot 6 (`MAIL`) — un émetteur simulé et un lien copiable rendent le module entièrement testable dès le lot 1.

## 7. Cas nominaux
Solenne invite → l'ami reçoit le lien → il crée son mot de passe → il complète son profil → il accède à l'application.

## 8. Cas limites
Jeton expiré, déjà utilisé, révoqué, falsifié · email déjà inscrit · email déjà invité et en attente · double activation simultanée · activation avec un rôle injecté · invitation d'un compte désactivé.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Lien d'invitation transféré à un tiers | HIGH | Usage unique + révocation + traçabilité (`INVITE-014`) |
| Élévation de privilège à l'activation | CRITICAL | `INVITE-S07` |
| Double activation créant deux comptes | HIGH | `INVITE-C04` |

## 10. Critères d'acceptation
Les 24 tests passent · aucun jeton en clair · aucun compte créé hors invitation · grille S1→S12 au vert.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| INVITE-001 | Émission par Solenne | Session admin | Email + rôle FRIEND | Invitation créée, lien produit, audit écrit | CRITICAL | Integration |
| INVITE-002 | Jeton haché | Invitation émise | Inspection base | Seule l'empreinte est stockée | CRITICAL | Security |
| INVITE-003 | Activation valide | Jeton frais | Mot de passe + profil | Compte créé en rôle FRIEND, session ouverte | CRITICAL | Integration |
| INVITE-004 | Jeton expiré | Invitation de 15 jours | Activation | Refus, « Cette invitation a expiré » | HIGH | Security |
| INVITE-005 | Jeton déjà utilisé | Invitation consommée | Réutilisation | Refus, « Cette invitation a déjà été utilisée », sans révéler l'email | CRITICAL | Security |
| INVITE-006 | Jeton révoqué | Invitation révoquée | Activation | Refus | CRITICAL | Security |
| INVITE-007 | Jeton falsifié | Jeton inventé | Activation | Refus, message neutre | CRITICAL | Security |
| INVITE-008 | Email déjà inscrit | Compte actif existant | Émission | Refus, « Cette personne a déjà un compte » | HIGH | Integration |
| INVITE-009 | Réinvitation d'un email en attente | Invitation déjà en cours | Émission | Relance proposée plutôt que doublon | MEDIUM | Integration |
| INVITE-010 | Relance | Invitation en attente | Relance | Nouveau jeton, **ancien invalidé** | MEDIUM | Integration |
| INVITE-011 | Révocation | Invitation en attente | Révocation | Statut révoqué, lien mort, audit écrit | HIGH | Integration |
| INVITE-012 | Liste des invitations | 3 en attente, 1 acceptée, 1 révoquée | Consultation | Statuts et dates d'expiration corrects | LOW | Integration |
| INVITE-013 | Transaction d'activation | Erreur simulée pendant la création du profil | Activation | Aucun compte partiel : tout ou rien | HIGH | Integration |
| INVITE-014 | Traçabilité | Activation | Consultation de l'audit | Qui a invité, quand, quel email, quand accepté | MEDIUM | Integration |
| INVITE-015 | Profil obligatoire | Activation | Prénom laissé vide | Refus, compte non finalisé | MEDIUM | Unit |
| INVITE-016 | Invitation d'un compte désactivé | Compte `DISABLED` | Émission | Proposition de réactivation plutôt qu'invitation | LOW | Integration |
| INVITE-C04 | Double activation simultanée | Un jeton, deux requêtes en parallèle | Activation concurrente | **Un seul compte créé**, l'autre reçoit un refus explicite | HIGH | Concurrency |
| INVITE-S01 | Émission sans session | Aucune session | Appel | Refus | CRITICAL | Security |
| INVITE-S02 | Émission par un ami | Session ami | Appel | Refus + audit | CRITICAL | Security |
| INVITE-S06 | Appel direct de l'émission | Requête forgée | Appel | Garde déclenchée | CRITICAL | Security |
| INVITE-S07 | Rôle injecté à l'activation | `role: "ADMIN"` dans la charge utile | Activation | Ignoré, rôle pris dans l'invitation, compte créé en FRIEND | CRITICAL | Security |
| INVITE-S09 | Fuite dans la page d'activation | Jeton valide | Inspection de la réponse | Ni email d'autres invités, ni liste d'utilisateurs | HIGH | Security |
| INVITE-S11 | Jeton d'une autre invitation | Jeton de B, email de A | Activation | Refus | CRITICAL | Security |
| INVITE-S12 | Devinette de jeton en rafale | 1000 jetons aléatoires | Tentatives | Toutes refusées, limitation déclenchée, entropie suffisante (32 octets) | HIGH | Security |

---

# MODULE `PROFILE` — Profil

## 1. Objectif
Permettre à chacun de gérer ses informations, et à Solenne de les consulter pour organiser les séjours.

## 2. Fonctionnalités
Prénom, nom, photo, email, téléphone, nombre d'enfants, préférences, informations utiles · type de relation (ami proche, famille, connaissance, autre) — **renseigné par Solenne uniquement** · téléversement de photo.

## 3. Données manipulées
`users` (champs de profil), stockage des images.

## 4. Règles métier
| # | Règle |
|---|---|
| PROF-R1 | Chacun ne modifie que son propre profil |
| PROF-R2 | Le **type de relation** est fixé par Solenne, jamais par l'intéressé |
| PROF-R3 | Le rôle n'est jamais modifiable depuis le profil |
| PROF-R4 | Le changement d'email exige une confirmation |
| PROF-R5 | Photo : formats image uniquement, 5 Mo maximum, redimensionnée |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Voir son profil | ❌ | ✅ | ✅ |
| Modifier son profil | ❌ | ✅ | ✅ |
| Voir le profil d'un autre | ❌ | ❌ *(prénom et photo seuls, via événements)* | ✅ complet |
| Modifier le type de relation | ❌ | ❌ | ✅ |
| Modifier le profil d'un autre | ❌ | ❌ | ❌ |

## 6. Dépendances
`AUTH`.

## 7. Cas nominaux
Modification des informations · téléversement de photo · Solenne consulte un profil.

## 8. Cas limites
Photo trop lourde, mauvais format, fichier renommé en `.jpg` · téléphone invalide · nom à rallonge · caractères spéciaux · email déjà pris.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Modification du profil d'autrui | CRITICAL | `PROFILE-S04` |
| Téléversement d'un fichier malveillant | HIGH | `PROFILE-006`, `PROFILE-007` |
| Élévation de privilège via le champ rôle | CRITICAL | `PROFILE-S07` |

## 10. Critères d'acceptation
Les 12 tests passent · aucun utilisateur ne peut modifier un profil qui n'est pas le sien · aucun fichier non-image ne peut être stocké.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| PROFILE-001 | Modification nominale | Session ami | Prénom, téléphone, enfants | Enregistré, confirmation affichée | HIGH | Integration |
| PROFILE-002 | Champs obligatoires | Prénom vidé | Envoi | Refus, message par champ | MEDIUM | Unit |
| PROFILE-003 | Téléphone invalide | `abcdef` | Envoi | Refus, format attendu indiqué | LOW | Unit |
| PROFILE-004 | Changement d'email | Nouvel email | Envoi | Confirmation demandée avant prise en compte | MEDIUM | Integration |
| PROFILE-005 | Email déjà pris | Email d'un autre compte | Envoi | Refus | HIGH | Integration |
| PROFILE-006 | Photo trop lourde | 12 Mo | Téléversement | Refus, « 5 Mo maximum » | MEDIUM | Security |
| PROFILE-007 | Fichier déguisé | Exécutable renommé `.jpg` | Téléversement | Refus après vérification du contenu réel | HIGH | Security |
| PROFILE-008 | Photo valide | JPEG 2 Mo | Téléversement | Stockée, redimensionnée, affichée | MEDIUM | Integration |
| PROFILE-009 | Solenne consulte un profil | Session admin | Consultation | Informations complètes visibles | MEDIUM | Integration |
| PROFILE-010 | Un ami consulte un autre profil | Session ami | Consultation | Prénom et photo seuls ; ni téléphone, ni email, ni notes | HIGH | Security |
| PROFILE-S04 | Modification du profil d'autrui | Ami A, identifiant de B | Écriture | Refus, aucune écriture | CRITICAL | Security |
| PROFILE-S07 | Rôle ou relation injectés | `role: "ADMIN"`, `relationType` modifiés | Envoi | Champs ignorés, valeurs inchangées | CRITICAL | Security |

---

# MODULE `USERS` — Gestion des utilisateurs

## 1. Objectif
Donner à Solenne la maîtrise du cercle : qui en fait partie, à quel titre, et qui n'en fait plus partie.

## 2. Fonctionnalités
Liste des utilisateurs avec recherche et filtres · consultation d'une fiche · modification du type de relation · désactivation et réactivation · suppression définitive (RGPD) · changement de rôle (architecture prête, un seul ADMIN au MVP — décision D5).

## 3. Données manipulées
`users`, `sessions`, `audit_logs`, et par ricochet `stays`, `stay_requests`, `event_participants`.

## 4. Règles métier
| # | Règle |
|---|---|
| USR-R1 | Seule Solenne gère les utilisateurs |
| USR-R2 | **Solenne ne peut ni se désactiver, ni se supprimer, ni se rétrograder** (D5 : administratrice unique) |
| USR-R3 | La désactivation invalide immédiatement toutes les sessions |
| USR-R4 | Un compte désactivé conserve ses données ; ses séjours futurs sont signalés pour arbitrage |
| USR-R5 | La suppression RGPD efface les données personnelles et anonymise les traces, sans casser l'historique |
| USR-R6 | Toute action est journalisée |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Lister les utilisateurs | ❌ | ❌ | ✅ |
| Désactiver, réactiver, supprimer | ❌ | ❌ | ✅ |
| Changer un rôle | ❌ | ❌ | ✅ |
| Se désactiver soi-même | — | — | ❌ **jamais** |

## 6. Dépendances
`PERM`, `PROFILE`.

## 7. Cas nominaux
Solenne consulte la liste · désactive un ami qui n'est plus le bienvenu · le réactive · supprime un compte à la demande de l'intéressé.

## 8. Cas limites
Désactivation d'un ami ayant un séjour confirmé à venir · désactivation pendant une session ouverte · suppression d'un ami présent dans un historique · Solenne tente de se désactiver · dernier administrateur.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Solenne se verrouille hors de son propre système | CRITICAL | `USERS-008`, `USERS-009` |
| Un ami exclu conserve un accès | CRITICAL | `USERS-004` |
| Suppression RGPD cassant l'historique des séjours | HIGH | `USERS-011` |

## 10. Critères d'acceptation
Les 14 tests passent · impossible de se retrouver sans administrateur · un compte désactivé n'a plus aucun accès dans la seconde.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| USERS-001 | Liste | 5 utilisateurs | Consultation | Liste complète, statuts et relations affichés | MEDIUM | Integration |
| USERS-002 | Recherche et filtres | 20 utilisateurs | Filtrer par relation « famille » | Résultats corrects | LOW | Integration |
| USERS-003 | Modification de la relation | Ami existant | Passer en « famille » | Enregistré + audit | LOW | Integration |
| USERS-004 | Désactivation | Ami avec session ouverte | Désactivation | Sessions invalidées immédiatement, accès refusé dès la requête suivante | CRITICAL | Security |
| USERS-005 | Réactivation | Compte désactivé | Réactivation | Connexion à nouveau possible | MEDIUM | Integration |
| USERS-006 | Désactivation avec séjour à venir | Séjour confirmé dans 10 jours | Désactivation | Avertissement listant les séjours concernés, arbitrage demandé | HIGH | Integration |
| USERS-007 | Séjours d'un compte désactivé | Compte désactivé | Consultation de l'agenda | Séjours toujours visibles pour Solenne, marqués « compte désactivé » | MEDIUM | Integration |
| USERS-008 | Solenne se désactive | Session admin | Auto-désactivation | Refus, « Vous ne pouvez pas désactiver votre propre compte » | CRITICAL | Security |
| USERS-009 | Solenne se rétrograde | Session admin | Passage en FRIEND | Refus — il doit rester au moins un administrateur | CRITICAL | Security |
| USERS-010 | Suppression RGPD | Ami sans historique | Suppression | Compte et données personnelles effacés | HIGH | Integration |
| USERS-011 | Suppression avec historique | Ami avec 3 séjours passés | Suppression | Données personnelles effacées, séjours anonymisés (« Ancien invité »), historique intact | HIGH | Integration |
| USERS-012 | Journalisation | Toute action de ce module | Consultation de l'audit | Une entrée par action, avec avant/après | MEDIUM | Integration |
| USERS-S02 | Un ami accède à la liste | Session ami | Consultation | Refus + audit | CRITICAL | Security |
| USERS-S07 | Auto-promotion | Ami envoyant `role: "ADMIN"` sur son propre compte | Appel | Refus, rôle inchangé | CRITICAL | Security |
