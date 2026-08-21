# Lot 7 — Finition & production · Fiches détaillées

`DASH` · `HIST` · `UX` · `DEPLOY` — 4 modules, 47 cas de test.
Rattaché à `Mode Operatoire.md` v1.0.

---

# MODULE `DASH` — Tableaux de bord

## 1. Objectif
Donner à chacun, dès l'ouverture, la réponse à « qu'est-ce qui me concerne ? » — sans navigation ni lecture.

## 2. Fonctionnalités
Accueil ami : prochain événement, prochain séjour, état de la maison, liste chronologique à venir · accueil Solenne : les mêmes blocs **plus** les demandes à traiter en tête, les alertes et les demandes signalées incompatibles · message d'accueil personnalisé (« Bienvenue chez Solenne 🌿 »).

## 3. Données manipulées
En lecture, filtrées par `PRIV` : `events`, `stays`, `stay_requests`, `blocked_periods`.

## 4. Règles métier
| # | Règle |
|---|---|
| DASH-R1 | L'accueil d'un ami ne contient **aucune** donnée privée d'autrui |
| DASH-R2 | Chez Solenne, les demandes en attente passent avant tout le reste |
| DASH-R3 | Une demande devenue incompatible est signalée visuellement |
| DASH-R4 | L'état de la maison est exprimé qualitativement (« Disponible » / « Occupée »), jamais par un décompte précis |
| DASH-R5 | Un accueil sans donnée reste accueillant, jamais vide |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Voir son accueil | ❌ | ✅ | ✅ |
| Voir les demandes à traiter | ❌ | ❌ | ✅ |
| Voir les alertes | ❌ | ❌ | ✅ |

## 6. Dépendances
`CAL`, `STAY`, `EVENT`, `PRIV`.

## 7. Cas nominaux
Marc ouvre l'application : « Prochain événement — Week-end barbecue, 12–13 septembre, 8 participants », « Votre prochain séjour — 18–20 septembre », « Maison — Disponible ».

## 8. Cas limites
Aucun événement ni séjour · 10 demandes en attente · événement le jour même · séjour en cours · demande incompatible · nouvel utilisateur sans historique.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Fuite de données privées sur l'écran le plus consulté | CRITICAL | `DASH-009` |
| Demande urgente noyée dans la page | MEDIUM | `DASH-005` |

## 10. Critères d'acceptation
Les 10 tests passent · aucune donnée d'autrui sur l'accueil d'un ami · les demandes en attente sont toujours visibles sans défilement chez Solenne.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| DASH-001 | Accueil ami complet | 1 événement, 1 séjour à venir | Consultation | Les 4 blocs du §21 présents et exacts | HIGH | Integration |
| DASH-002 | Accueil ami vide | Aucune donnée | Consultation | Message d'accueil chaleureux + invitation à demander un séjour | MEDIUM | Unit |
| DASH-003 | État de la maison | Maison libre puis occupée | Consultation | « Disponible » puis « Occupée » | MEDIUM | Integration |
| DASH-004 | Accueil Solenne | 2 demandes en attente | Consultation | « 2 demandes à traiter » en tête | HIGH | Integration |
| DASH-005 | Priorité des demandes | 10 demandes + 5 événements | Consultation | Les demandes restent visibles sans défilement en 320 px | MEDIUM | Responsive |
| DASH-006 | Demande incompatible signalée | Demande devenue incompatible | Consultation | Signalée visuellement avec le motif | HIGH | Integration |
| DASH-007 | Séjour en cours | Séjour commencé hier | Consultation | Affiché « En cours », pas « À venir » | MEDIUM | Unit |
| DASH-008 | Événement le jour même | Événement à 20h aujourd'hui | Consultation | Mis en avant avec l'heure | LOW | Unit |
| DASH-009 | Aucune fuite | 3 séjours d'autrui à venir | Accueil d'un ami, inspection de la réponse | Aucune donnée privée transmise | CRITICAL | Security |
| DASH-010 | Nouvel utilisateur | Compte créé à l'instant | Première ouverture | Écran d'accueil guidant vers la première action | MEDIUM | E2E |

---

# MODULE `HIST` — Historique et journal

## 1. Objectif
Permettre à Solenne de retrouver ce qui s'est passé : qui est venu, quand, ce qui a été refusé, et ce qui a été fait dans l'application.

## 2. Fonctionnalités
Historique des séjours passés, des événements passés, des demandes refusées et annulées · filtres date, utilisateur, statut, événement · liste des personnes ayant séjourné · **consultation du journal d'audit** (écrit dès le lot 1 par `PERM`) · export simple.

## 3. Données manipulées
`stays`, `stay_requests`, `events`, `event_participants`, `audit_logs`.

## 4. Règles métier
| # | Règle |
|---|---|
| HIST-R1 | L'historique est réservé à Solenne ; un ami ne voit que le sien |
| HIST-R2 | Les données anonymisées après suppression RGPD apparaissent en « Ancien invité » |
| HIST-R3 | Le journal d'audit est en lecture seule |
| HIST-R4 | Les filtres se combinent |
| HIST-R5 | L'historique ne peut pas être modifié |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Voir **son** historique | ❌ | ✅ | ✅ |
| Voir l'historique global | ❌ | ❌ | ✅ |
| Voir le journal d'audit | ❌ | ❌ | ✅ |
| Modifier ou effacer l'historique | ❌ | ❌ | ❌ |

## 6. Dépendances
`PERM` (audit), `STAY`, `EVENT`.

## 7. Cas nominaux
Solenne filtre les séjours de 2026 pour Marc et retrouve ses 3 venues · elle consulte le journal pour vérifier qui a modifié la capacité.

## 8. Cas limites
Historique vide · 500 entrées · utilisateur supprimé · filtres se contredisant · période sans résultat · journal volumineux.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Un ami accédant à l'historique global — carte des déplacements de tous | CRITICAL | `HIST-S02` |
| Journal modifiable, traçabilité sans valeur | HIGH | `HIST-009` |

## 10. Critères d'acceptation
Les 12 tests passent · aucun accès d'un ami à l'historique global · le journal est prouvé inaltérable.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| HIST-001 | Séjours passés | 8 séjours terminés | Consultation | Tous listés, du plus récent au plus ancien | MEDIUM | Integration |
| HIST-002 | Demandes refusées | 3 refus avec motifs | Consultation | Visibles avec leur motif et leur date | MEDIUM | Integration |
| HIST-003 | Demandes annulées | 2 annulations | Consultation | Visibles, auteur de l'annulation identifié | MEDIUM | Integration |
| HIST-004 | Filtre par utilisateur | 20 séjours, 5 personnes | Filtrer sur Marc | Seuls les séjours de Marc | MEDIUM | Integration |
| HIST-005 | Filtres combinés | Historique fourni | Utilisateur + statut + période | Intersection correcte | MEDIUM | Integration |
| HIST-006 | Aucun résultat | Filtres sans correspondance | Application | État vide explicite, filtres rappelés | LOW | Unit |
| HIST-007 | Personnes ayant séjourné | 12 séjours, 6 personnes | Consultation | 6 personnes, nombre de venues par personne | LOW | Integration |
| HIST-008 | Utilisateur supprimé | Compte effacé, 3 séjours passés | Consultation | « Ancien invité », séjours conservés | MEDIUM | Integration |
| HIST-009 | Journal inaltérable | Entrée d'audit existante | Tentative de modification puis de suppression | ❌ Refus dans les deux cas | HIGH | Security |
| HIST-010 | Journal complet | 20 actions d'administration | Consultation | 20 entrées, acteur et différentiel visibles | HIGH | Integration |
| HIST-011 | Volume | 500 entrées | Consultation | Pagination, réponse < 1 s | LOW | Integration |
| HIST-S02 | Ami accédant à l'historique global | Session ami | Appel direct | ❌ Refus + audit | CRITICAL | Security |

---

# MODULE `UX` — Revue d'expérience

> Ce module ne remplace pas les vérifications par module : le critère de validation n°7 impose déjà à **chaque** module d'être vérifié en 320 / 768 / 1440 px. `UX` est la revue transverse finale — cohérence entre écrans et parcours réels au doigt.

## 1. Objectif
S'assurer que l'ensemble se tient : mêmes formulations, mêmes gestes, mêmes états, et une application réellement agréable sur un téléphone tenu d'une main.

## 2. Fonctionnalités
Revue de cohérence des 12 écrans · uniformisation des états vides, de chargement et d'erreur · confirmations avant action destructrice · accessibilité clavier et lecteur d'écran · parcours complets au doigt · vérification des formulations françaises.

## 3. Données manipulées
Aucune.

## 4. Règles métier
| # | Règle |
|---|---|
| UX-R1 | Les 12 écrans utilisent le même vocabulaire pour la même chose |
| UX-R2 | Tout écran affichant des données possède ses trois états |
| UX-R3 | Toute action destructive est confirmée et nomme son objet |
| UX-R4 | Aucun message d'erreur ne culpabilise ; chacun propose une issue |
| UX-R5 | Les parcours principaux sont réalisables d'une seule main sur un téléphone |
| UX-R6 | Aucune violation d'accessibilité automatiquement détectable |

## 5. Permissions
Sans objet.

## 6. Dépendances
Tous les modules.

## 7. Cas nominaux
Un ami réalise l'ensemble de son parcours au pouce, sans hésitation ni erreur.

## 8. Cas limites
Connexion lente · texte agrandi à 200 % · mode sombre du système · rotation de l'écran · clavier virtuel masquant un champ · retour arrière du navigateur en milieu d'assistant.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| **Application correcte mais sans charme — échec du critère n°1 (§33)** | HIGH | Non automatisable : validation visuelle de Yassine (limite L2) |
| Clavier virtuel masquant le bouton de validation | MEDIUM | `UX-008` |
| Incohérences de vocabulaire entre écrans | MEDIUM | `UX-001` |

## 10. Critères d'acceptation
Les 13 tests passent · zéro violation d'accessibilité détectable · les 6 parcours principaux réalisables au pouce en 375 px · **validation visuelle explicite de Yassine**.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| UX-001 | Cohérence du vocabulaire | Les 12 écrans | Relevé des termes | Un seul mot par notion (« séjour », « demande », « événement ») | MEDIUM | Responsive |
| UX-002 | États vides partout | Base vide | Parcours des 12 écrans | Chacun propose un état vide utile | MEDIUM | Unit |
| UX-003 | États de chargement | Réseau ralenti à 3 s | Parcours | Squelettes, aucun saut de mise en page | MEDIUM | Responsive |
| UX-004 | Messages d'erreur | Provoquer une erreur sur chaque formulaire | Relevé | Tous en français, aucun terme technique, une issue proposée | HIGH | Unit |
| UX-005 | Confirmations destructives | Annulation, suppression, révocation | Déclenchement | Confirmation nommant l'objet visé | HIGH | Unit |
| UX-006 | Accessibilité automatisée | Les 12 écrans | Analyse | Zéro violation détectable | HIGH | Responsive |
| UX-007 | Navigation clavier | Application complète | Tabulation | Tout atteignable, focus visible, aucun piège | HIGH | Responsive |
| UX-008 | Clavier virtuel | Formulaire de demande, mobile | Saisie | Le bouton de validation reste atteignable | MEDIUM | Responsive |
| UX-009 | Texte agrandi | Zoom système à 200 % | Parcours | Aucun texte tronqué, aucun chevauchement | MEDIUM | Responsive |
| UX-010 | Rotation | Mobile en paysage | Agenda et formulaires | Utilisables | LOW | Responsive |
| UX-011 | Retour arrière en cours d'assistant | Assistant de demande, étape 2 | Retour navigateur | Données conservées, aucun état incohérent | MEDIUM | E2E |
| UX-012 | Parcours au pouce | 375 px, une seule main | Les 6 parcours principaux | Réalisables sans repositionner la main | HIGH | Responsive |
| UX-013 | Mode sombre du système | Préférence sombre | Parcours | Lisible, contrastes conformes | LOW | Responsive |

---

# MODULE `DEPLOY` — Production

## 1. Objectif
Mettre l'application en ligne de façon sûre et réversible, et garantir qu'une perte de données est récupérable.

## 2. Fonctionnalités
Déploiement Vercel · base Neon · migrations en production · variables d'environnement vérifiées · sauvegarde automatique et **restauration testée** · supervision des erreurs · documentation d'installation, de configuration et d'exploitation · procédure de retour arrière.

## 3. Données manipulées
Toutes, en lecture pour la sauvegarde.

## 4. Règles métier
| # | Règle |
|---|---|
| DEP-R1 | Aucun déploiement si un test est au rouge |
| DEP-R2 | Toute migration est réversible et testée avant application |
| DEP-R3 | Une sauvegarde quotidienne, avec **restauration effectivement testée** |
| DEP-R4 | Aucun secret dans le dépôt de code |
| DEP-R5 | Un retour arrière doit être possible en moins de 5 minutes |
| DEP-R6 | Le jeu de démonstration ne peut jamais s'exécuter en production |

## 5. Permissions
Accès à l'hébergement réservé à Yassine et à moi. Aucune surface applicative.

## 6. Dépendances
Tous les modules. **Prérequis externe L1** : domaine et comptes créés.

## 7. Cas nominaux
Déploiement réussi · migration appliquée · sauvegarde nocturne · restauration vérifiée sur un environnement de contrôle.

## 8. Cas limites
Migration échouant à mi-parcours · variable oubliée · déploiement pendant une utilisation active · retour arrière après migration · restauration d'une sauvegarde de la veille · base indisponible.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| **Perte de données sans sauvegarde exploitable** | CRITICAL | `DEPLOY-006` — la restauration est testée, pas seulement configurée |
| Migration irréversible bloquant une correction urgente | CRITICAL | `DEPLOY-004` |
| Secret exposé dans le dépôt | CRITICAL | `DEPLOY-009` |

## 10. Critères d'acceptation
Les 12 tests passent · **une restauration complète a été réalisée avec succès au moins une fois** · le retour arrière est documenté et chronométré · la checklist §11.3 du document maître est intégralement au vert.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| DEPLOY-001 | Build de production | Code validé | `npm run build` | Réussite, aucun avertissement bloquant | CRITICAL | Integration |
| DEPLOY-002 | Déploiement | Build réussi | Mise en ligne | Application accessible sur chezsolenne.fr | CRITICAL | E2E |
| DEPLOY-003 | Migration en production | Migration en attente | Application | Appliquée sans perte, durée journalisée | CRITICAL | Integration |
| DEPLOY-004 | Migration réversible | Migration appliquée | Retour arrière | État antérieur restauré intégralement | CRITICAL | Integration |
| DEPLOY-005 | Sauvegarde automatique | 24 h d'exploitation | Vérification | Sauvegarde présente et horodatée | CRITICAL | Integration |
| DEPLOY-006 | **Restauration testée** | Sauvegarde disponible | Restauration sur environnement de contrôle | Données intégralement restaurées, application fonctionnelle | CRITICAL | Integration |
| DEPLOY-007 | Variables d'environnement | Environnement de production | Vérification au démarrage | Toutes présentes ; l'absence d'une seule empêche le démarrage | HIGH | Integration |
| DEPLOY-008 | Retour arrière applicatif | Version défectueuse déployée | Retour à la précédente | Rétabli en moins de 5 minutes | HIGH | Integration |
| DEPLOY-009 | Aucun secret dans le dépôt | Dépôt complet | Analyse | Aucune clé, aucun mot de passe, aucun jeton | CRITICAL | Security |
| DEPLOY-010 | Seed impossible en production | Environnement de production | `db:seed` | Refus immédiat | CRITICAL | Security |
| DEPLOY-011 | Supervision | Erreur provoquée en production | Vérification | Alerte reçue, erreur consultable | HIGH | Integration |
| DEPLOY-012 | Documentation | Dépôt | Relecture | Installation, configuration, variables, base, lancement, tests, déploiement et comptes de démonstration documentés (§32) | HIGH | Integration |
| DEPLOY-013 | **Aucune photo de démonstration en production** | Photos provisoires sous licence libre en base | Vérification avant mise en ligne | Refus de déployer tant qu'une photo marquée `isPlaceholder` subsiste ; bandeau d'avertissement affiché dans l'administration jusqu'au remplacement | HIGH | Integration |
| DEPLOY-014 | **Aucun contenu provisoire en production** | Capacité, chambres et règles encore aux valeurs provisoires | Vérification | Liste des contenus non renseignés affichée à Solenne ; non bloquant sauf pour les photos et la capacité | MEDIUM | Integration |
