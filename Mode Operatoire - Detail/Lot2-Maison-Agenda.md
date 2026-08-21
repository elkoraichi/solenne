# Lot 2 — Maison & Agenda · Fiches détaillées

`HOUSE` · `SPACE` · `BLOCK` · `PRIV` · `CAL` — 5 modules, 82 cas de test.
Rattaché à `Mode Operatoire.md` v1.0.

---

# MODULE `HOUSE` — Maison, capacité et règles

## 1. Objectif
Décrire la maison, fixer sa capacité d'accueil — le paramètre le plus structurant du système — et publier les règles que chacun accepte avant de venir.

## 2. Fonctionnalités
Informations générales (nom, description, adresse) · photos et photo de couverture · **capacité maximale paramétrable entre 1 et 25** (décision D1) · règles de la maison (titre, texte, icône, ordre, activation, acceptation obligatoire).

## 3. Données manipulées
`houses` (name, description, address, capacityMax, photos, coverImage), `house_rules`.

## 4. Règles métier
| # | Règle |
|---|---|
| HOUSE-R1 | `1 ≤ capacityMax ≤ 25` — bornes strictes, valeur entière |
| HOUSE-R2 | Une réduction de capacité sous l'occupation déjà confirmée est **refusée**, avec la liste des séjours en cause |
| HOUSE-R3 | Un changement de capacité déclenche un recalcul des demandes en attente et signale celles devenues incompatibles |
| HOUSE-R4 | Seule Solenne modifie la maison et les règles |
| HOUSE-R5 | Les règles marquées « acceptation obligatoire » doivent être acceptées avant la confirmation d'un séjour |
| HOUSE-R6 | Modifier une règle n'invalide pas les acceptations passées ; la version acceptée est conservée |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Voir la maison et les règles | ❌ | ✅ | ✅ |
| Modifier informations, photos, capacité | ❌ | ❌ | ✅ |
| Créer, modifier, ordonner, désactiver une règle | ❌ | ❌ | ✅ |

**Interdit absolu :** un ami ne doit jamais pouvoir modifier la capacité — c'est la valeur qui gouverne toutes les acceptations de séjour.

## 6. Dépendances
`PERM`, `UI`.

## 7. Cas nominaux
Solenne renseigne la maison, téléverse des photos, fixe la capacité à 12, rédige 8 règles dont 3 obligatoires · un ami consulte la page Maison.

## 8. Cas limites
Capacité à 0, à 26, négative, décimale, textuelle · réduction sous l'occupation · augmentation débloquant des demandes refusées · aucune photo · règle au texte très long · réordonnancement.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Capacité modifiée créant une surcapacité rétroactive | CRITICAL | `HOUSE-007`, `HOUSE-008` |
| Capacité modifiable par un ami | CRITICAL | `HOUSE-S02`, `HOUSE-S07` |
| Règles modifiées après acceptation, litige sur ce qui a été accepté | MEDIUM | `HOUSE-018` |

## 10. Critères d'acceptation
Les 20 tests passent · aucune valeur hors 1–25 n'est acceptable · toute modification de capacité est journalisée et son impact affiché.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| HOUSE-001 | Informations générales | Session admin | Nom, description, adresse | Enregistré + audit | MEDIUM | Integration |
| HOUSE-002 | Capacité valide | Session admin | `12` | Enregistré | CRITICAL | Integration |
| HOUSE-003 | Borne basse | — | `1` | Accepté | HIGH | Unit |
| HOUSE-004 | Borne haute | — | `25` | Accepté | HIGH | Unit |
| HOUSE-005 | Sous la borne | — | `0` puis `-3` | Refus, « La capacité doit être comprise entre 1 et 25 » | HIGH | Unit |
| HOUSE-006 | Au-dessus de la borne | — | `26` | Refus, même message | HIGH | Unit |
| HOUSE-007 | Réduction sous l'occupation | Capacité 12, 9 personnes confirmées du 10 au 12/09 | Passer à 6 | **Refus**, liste des séjours concernés affichée | CRITICAL | Integration |
| HOUSE-008 | Réduction compatible | Capacité 12, 4 personnes confirmées | Passer à 6 | Accepté | HIGH | Integration |
| HOUSE-009 | Augmentation | Capacité 8, une demande refusée pour capacité | Passer à 14 | Accepté ; la demande refusée est signalée comme redevenue possible | MEDIUM | Integration |
| HOUSE-010 | Valeur non entière | — | `12,5` puis `douze` | Refus | MEDIUM | Unit |
| HOUSE-011 | Photos | Session admin | 5 photos | Enregistrées, ordre respecté, couverture désignable | LOW | Integration |
| HOUSE-012 | Aucune photo | Maison sans photo | Consultation | État vide chaleureux, pas d'image cassée | LOW | Unit |
| HOUSE-013 | Création d'une règle | Session admin | Titre + texte + obligatoire | Créée, visible des amis | MEDIUM | Integration |
| HOUSE-014 | Ordre des règles | 8 règles | Réordonnancement | Ordre conservé et restitué | LOW | Integration |
| HOUSE-015 | Désactivation d'une règle | Règle active | Désactivation | Masquée des amis, conservée en base | LOW | Integration |
| HOUSE-016 | Règle obligatoire | 3 règles obligatoires | Consultation | Marquées distinctement | MEDIUM | Unit |
| HOUSE-017 | Texte très long | Règle de 5 000 caractères | Affichage | Lisible, mise en page correcte en 320 px | LOW | Responsive |
| HOUSE-018 | Modification après acceptation | Règle acceptée par un ami puis modifiée | Consultation de l'historique | La version acceptée reste consultable | MEDIUM | Integration |
| HOUSE-S02 | Ami modifiant la maison | Session ami | Appel | Refus + audit | CRITICAL | Security |
| HOUSE-S07 | Capacité injectée | Ami envoyant `capacityMax: 99` | Appel | Refus, valeur inchangée | CRITICAL | Security |

---

# MODULE `SPACE` — Chambres et bureaux

## 1. Objectif
Décrire les espaces de la maison — chambres et bureaux — et préparer leur affectation future sans l'implémenter.

## 2. Fonctionnalités
Création d'un espace de type `ROOM` ou `OFFICE` · nom, description, nombre de couchages, type de lits, équipements, photos, ordre, activation · cohérence indicative entre la somme des couchages et la capacité.

## 3. Données manipulées
`spaces` (houseId, type, name, description, sleeps, bedType, amenities, photos, order, active).

## 4. Règles métier
| # | Règle |
|---|---|
| SPACE-R1 | Un espace est de type `ROOM` ou `OFFICE`, jamais les deux |
| SPACE-R2 | Un bureau n'a pas de couchage (`sleeps = 0`) |
| SPACE-R3 | Si la somme des couchages diffère de la capacité, **avertissement seulement** — jamais un blocage |
| SPACE-R4 | Un espace désactivé reste en base et dans l'historique |
| SPACE-R5 | L'affectation des espaces à un séjour est **post-MVP** ; la table existe, l'interface non |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Voir les espaces | ❌ | ✅ | ✅ |
| Créer, modifier, désactiver | ❌ | ❌ | ✅ |

## 6. Dépendances
`HOUSE`.

## 7. Cas nominaux
Solenne crée 3 chambres et 2 bureaux · un ami consulte la page Maison et voit « Chambre bleue — 1 lit double — 2 personnes ».

## 8. Cas limites
Couchages à 0 pour une chambre · somme des couchages supérieure ou inférieure à la capacité · bureau avec couchage · espace sans photo · 15 espaces.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Incohérence couchages/capacité induisant Solenne en erreur | MEDIUM | `SPACE-005`, `SPACE-006` |
| Sur-conception d'une fonctionnalité post-MVP | LOW | Périmètre borné par SPACE-R5 |

## 10. Critères d'acceptation
Les 12 tests passent · chambres et bureaux se distinguent clairement à l'écran · aucune interface d'affectation n'est exposée.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| SPACE-001 | Création d'une chambre | Session admin | « Chambre bleue », 1 lit double, 2 couchages | Créée et affichée | MEDIUM | Integration |
| SPACE-002 | Création d'un bureau | Session admin | « Bureau 1 », écran, Wi-Fi, imprimante | Créé, aucun champ couchage proposé | MEDIUM | Integration |
| SPACE-003 | Bureau avec couchage | Type OFFICE, `sleeps = 2` | Envoi | Refus ou remise à 0 avec message | LOW | Unit |
| SPACE-004 | Chambre sans couchage | Type ROOM, `sleeps = 0` | Envoi | Refus, « Une chambre doit avoir au moins un couchage » | LOW | Unit |
| SPACE-005 | Couchages inférieurs à la capacité | Capacité 12, 8 couchages | Consultation | Avertissement affiché, **aucun blocage** | MEDIUM | Integration |
| SPACE-006 | Couchages supérieurs à la capacité | Capacité 8, 14 couchages | Consultation | Avertissement, aucun blocage | MEDIUM | Integration |
| SPACE-007 | Équipements | Liste de 6 équipements | Enregistrement | Restitués dans l'ordre | LOW | Integration |
| SPACE-008 | Photos d'un espace | 3 photos | Téléversement | Affichées en galerie | LOW | Integration |
| SPACE-009 | Désactivation | Espace actif | Désactivation | Masqué des amis, conservé en base | LOW | Integration |
| SPACE-010 | Ordre d'affichage | 5 espaces | Réordonnancement | Ordre conservé | LOW | Integration |
| SPACE-011 | Affichage mobile | 5 espaces avec photos | Rendu 320 px | Cartes lisibles, aucun débordement | MEDIUM | Responsive |
| SPACE-S02 | Ami modifiant un espace | Session ami | Appel | Refus | CRITICAL | Security |

---

# MODULE `BLOCK` — Périodes bloquées

## 1. Objectif
Permettre à Solenne de rendre la maison indisponible sur une période, quelle qu'en soit la raison, et garantir que ce blocage est absolu.

## 2. Fonctionnalités
Création par saisie ou cliquer-glisser sur l'agenda · libellé, motif, type (`MAINTENANCE`, `PERSONAL`, `OTHER`) · modification, suppression · détection des conflits avec les séjours confirmés et les demandes en attente.

## 3. Données manipulées
`blocked_periods`, en lecture `stays` et `stay_requests`.

## 4. Règles métier
| # | Règle |
|---|---|
| BLK-R1 | Un blocage interdit toute nouvelle demande sur la période — règle R1, sans exception |
| BLK-R2 | Deux blocages peuvent se chevaucher, sans effet de bord |
| BLK-R3 | Un blocage posé sur un séjour **déjà confirmé** est refusé ; Solenne doit d'abord annuler le séjour |
| BLK-R4 | Un blocage posé sur une **demande en attente** est autorisé, et la demande est signalée en rouge |
| BLK-R5 | Convention `[début, fin[` |
| BLK-R6 | Seule Solenne crée un blocage |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Voir qu'une période est indisponible | ❌ | ✅ *(sans le motif)* | ✅ |
| Voir le motif du blocage | ❌ | ❌ | ✅ |
| Créer, modifier, supprimer | ❌ | ❌ | ✅ |

## 6. Dépendances
`PERM`, `UI`.

## 7. Cas nominaux
Solenne bloque du 1ᵉʳ au 5 octobre pour travaux · l'agenda affiche la période indisponible · une demande sur ces dates est refusée automatiquement.

## 8. Cas limites
Blocage d'un seul jour · fin avant début · blocage dans le passé · blocages qui se chevauchent · blocage sur un séjour confirmé · blocage sur une demande en attente · suppression d'un blocage rendant des dates à nouveau libres.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Blocage contourné par une demande acceptée | CRITICAL | `AVAIL-001` à `AVAIL-009`, `BLOCK-006` |
| Motif privé de Solenne visible d'un ami | HIGH | `BLOCK-S09` |
| Blocage écrasant un séjour confirmé sans prévenir | HIGH | `BLOCK-007` |

## 10. Critères d'acceptation
Les 14 tests passent · aucune demande ne peut être acceptée sur une période bloquée · le motif reste privé.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| BLOCK-001 | Création | Session admin | 01→05/10, « Travaux », MAINTENANCE | Créé, visible à l'agenda + audit | HIGH | Integration |
| BLOCK-002 | Blocage d'un jour | 12/10 → 13/10 | Création | Un seul jour bloqué | MEDIUM | Unit |
| BLOCK-003 | Dates inversées | Fin avant début | Création | Refus, `INVALID_DATES` | MEDIUM | Unit |
| BLOCK-004 | Blocage dans le passé | Dates révolues | Création | Autorisé (utile pour l'historique), signalé | LOW | Unit |
| BLOCK-005 | Chevauchement de blocages | Blocage 01→05, ajout 03→08 | Création | Accepté, agenda cohérent, pas de doublon visuel | MEDIUM | Integration |
| BLOCK-006 | Demande sur période bloquée | Blocage 01→05 | Demande 02→04 | Refus `BLOCKED_PERIOD`, message français | CRITICAL | Integration |
| BLOCK-007 | Blocage sur séjour confirmé | Séjour confirmé 10→12 | Blocage 09→13 | **Refus**, liste des séjours, invitation à les annuler d'abord | HIGH | Integration |
| BLOCK-008 | Blocage sur demande en attente | Demande en attente 10→12 | Blocage 09→13 | Accepté, demande signalée en rouge sur le tableau de bord | HIGH | Integration |
| BLOCK-009 | Suppression | Blocage existant | Suppression | Dates redevenues disponibles + audit | MEDIUM | Integration |
| BLOCK-010 | Modification | Blocage 01→05 | Étendu au 08 | Nouvelles dates prises en compte par le moteur | MEDIUM | Integration |
| BLOCK-011 | Cliquer-glisser | Agenda affiché | Sélection de 3 jours | Blocage créé aux bonnes dates | LOW | E2E |
| BLOCK-012 | Convention de bornes | Blocage 10→12 | Demande d'arrivée le 12 | **Autorisée** — le 12 n'est pas bloqué | HIGH | Unit |
| BLOCK-C05 | Blocage pendant une acceptation | Acceptation en cours sur 10→12 | Blocage simultané 09→13 | Ordre déterministe, aucun état incohérent, l'une des deux échoue proprement | HIGH | Concurrency |
| BLOCK-S09 | Motif privé | Blocage « Week-end en famille » | Agenda consulté par un ami | Seul « Indisponible » apparaît ; le motif est absent **de la réponse serveur** | HIGH | Security |

---

# MODULE `PRIV` — Confidentialité ⚠️

> Module de sécurité prioritaire n°2. Il porte la promesse centrale du produit : décision **D4 — un ami voit « Maison occupée », rien d'autre**.

## 1. Objectif
Garantir qu'un ami ne peut jamais accéder aux informations privées concernant les séjours des autres, ni à l'écran, ni dans la réponse du serveur, ni par recoupement.

## 2. Fonctionnalités
Sérialiseurs par rôle appliqués à toute donnée sortante · trois niveaux de visibilité par séjour (`HIDDEN`, `BUSY_ONLY`, `FULL`) · valeur par défaut `BUSY_ONLY` (D4) · réglage global dans les paramètres et ajustement au cas par cas par Solenne.

## 3. Données manipulées
`stays.privacyLevel`, `booking_settings.defaultStayPrivacy`, et en lecture toutes les entités affichées à l'agenda.

## 4. Règles métier
| # | Règle |
|---|---|
| PRIV-R1 | Par défaut, un ami voit **« Maison occupée »** : ni nom, ni nombre de personnes, ni motif, ni commentaire |
| PRIV-R2 | Le filtrage est **serveur** : la donnée privée n'est jamais envoyée au navigateur |
| PRIV-R3 | Solenne voit tout, sans exception |
| PRIV-R4 | Chacun voit intégralement **ses propres** séjours et demandes |
| PRIV-R5 | `HIDDEN` : le séjour n'apparaît pas du tout ; la période reste néanmoins comptée dans la capacité |
| PRIV-R6 | Aucune donnée dérivée ne doit permettre de deviner l'information masquée (nombre de places restantes affiché au chiffre près, initiales, couleurs distinctives) |
| PRIV-R7 | Les participants d'un **événement** sont visibles entre invités — c'est voulu (§9) et sans rapport avec la confidentialité des séjours |

## 5. Permissions
| Donnée | Visiteur | Ami | Propriétaire de la donnée | Solenne |
|---|---|---|---|---|
| Existence d'une occupation | ❌ | ✅ « Maison occupée » | ✅ | ✅ |
| Nom de l'occupant | ❌ | ❌ | ✅ | ✅ |
| Nombre de personnes | ❌ | ❌ | ✅ | ✅ |
| Motif, commentaire, besoins | ❌ | ❌ | ✅ | ✅ |
| Motif d'un blocage | ❌ | ❌ | — | ✅ |

**Interdits absolus :** aucun champ privé dans une réponse destinée à un ami · aucune inférence possible depuis un compteur, un identifiant séquentiel ou une couleur.

## 6. Dépendances
`PERM`.

## 7. Cas nominaux
Un ami ouvre l'agenda : les 12 et 13 septembre affichent « Maison occupée » · Solenne ouvre le même agenda : « Marc + 3, week-end famille ».

## 8. Cas limites
Séjour de l'ami lui-même · séjour `HIDDEN` · deux séjours simultanés · séjour plus événement le même jour · ami invité à l'événement mais pas au séjour · demande en attente d'un autre.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Donnée privée envoyée au navigateur puis masquée par l'interface | CRITICAL | `PRIV-S09` — vérification sur la charge utile, pas sur le rendu |
| Déduction du nombre de personnes via un compteur de places | HIGH | `PRIV-012` |
| Fuite via un identifiant séquentiel ou une URL devinable | MEDIUM | `PRIV-S08` |
| Fuite dans une notification ou un email | HIGH | `PRIV-015` |

## 10. Critères d'acceptation
Les 20 tests passent · **aucune réponse serveur destinée à un ami ne contient un champ privé** · le réglage par défaut est bien `BUSY_ONLY`.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| PRIV-001 | Défaut « Maison occupée » | Séjour de Marc, 4 personnes, 10→12/09 | Ami consulte l'agenda | « Maison occupée » seul | CRITICAL | Integration |
| PRIV-002 | Solenne voit tout | Même séjour | Admin consulte | Nom, nombre, motif, commentaire | CRITICAL | Integration |
| PRIV-003 | Propriétaire voit son séjour | Séjour de Marc | Marc consulte | Détail complet de **son** séjour | HIGH | Integration |
| PRIV-004 | Niveau `HIDDEN` | Séjour de Solenne en `HIDDEN` | Ami consulte | Rien n'apparaît à l'agenda | HIGH | Integration |
| PRIV-005 | `HIDDEN` compte quand même | Capacité 10, séjour caché de 8 | Ami demande 4 personnes | Refus `CAPACITY_EXCEEDED` **sans révéler pourquoi la maison est pleine** | CRITICAL | Integration |
| PRIV-006 | Niveau `FULL` | Séjour passé en `FULL` par Solenne | Ami consulte | Nom et nombre visibles, commentaire toujours masqué | MEDIUM | Integration |
| PRIV-007 | Deux séjours simultanés | Marc 4 pers., Julie 3 pers. | Ami consulte | Une seule mention « Maison occupée », aucun décompte | HIGH | Integration |
| PRIV-008 | Séjour + événement | Événement public + séjour privé | Ami invité consulte | Événement détaillé, séjour réduit à « Maison occupée » | HIGH | Integration |
| PRIV-009 | Demande en attente d'autrui | Demande de Marc en attente | Ami consulte | Invisible — une demande non validée n'existe pas pour les autres | HIGH | Integration |
| PRIV-010 | Réglage global | Défaut passé à `FULL` | Nouveaux séjours | Prennent le nouveau défaut ; les anciens gardent le leur | MEDIUM | Integration |
| PRIV-011 | Réglage par séjour | Séjour en `BUSY_ONLY` | Solenne le passe en `FULL` | Seul ce séjour change | MEDIUM | Integration |
| PRIV-012 | Aucune inférence par compteur | Capacité 12, 8 occupés | Ami consulte | Aucun « 4 places restantes » au chiffre près ; formulation qualitative | HIGH | Security |
| PRIV-013 | Participants d'événement visibles | Événement avec 8 inscrits | Ami invité consulte | Liste visible — comportement voulu (PRIV-R7) | MEDIUM | Integration |
| PRIV-014 | Ami non invité à l'événement | Événement restreint | Ami non invité consulte | Événement absent, période éventuellement « Maison occupée » | HIGH | Security |
| PRIV-015 | Pas de fuite par notification | Séjour de Marc accepté | Notification reçue par un autre ami | Aucune donnée privée dans le titre ni le corps | HIGH | Security |
| PRIV-016 | Pas de fuite par le tableau de bord | Accueil d'un ami | Consultation | Aucun séjour d'autrui détaillé | HIGH | Security |
| PRIV-S03 | Accès direct au séjour d'autrui | Identifiant du séjour de Marc | Lecture par un autre ami | Refus, message neutre | CRITICAL | Security |
| PRIV-S08 | Identifiant devinable | Identifiants séquentiels | Parcours d'identifiants voisins | Refus systématique ; identifiants non séquentiels | MEDIUM | Security |
| PRIV-S09 | **Charge utile propre** | Agenda d'un ami, 3 séjours d'autrui | Inspection de la réponse serveur | Aucun nom, aucun nombre, aucun motif, aucun identifiant d'utilisateur | CRITICAL | Security |
| PRIV-S12 | Fuite par messages d'erreur | Demande sur période pleine | Lecture du message | Indique l'indisponibilité sans révéler qui occupe | HIGH | Security |

---

# MODULE `CAL` — Agenda

## 1. Objectif
Offrir la vue centrale du produit : ce qui se passe dans la maison, lisible d'un coup d'œil, sur téléphone comme sur ordinateur.

## 2. Fonctionnalités
Vues Mois, Semaine et Liste · code couleur par catégorie (événement, séjour confirmé, indisponibilité, séjour de Solenne) · navigation entre périodes · cartes photo en vue Liste · pour Solenne : création directe d'un séjour et blocage par cliquer-glisser.

## 3. Données manipulées
En lecture : `stays`, `events`, `blocked_periods`, filtrés par `PRIV`.

## 4. Règles métier
| # | Règle |
|---|---|
| CAL-R1 | Toute donnée affichée passe par le filtre `PRIV` avant d'être envoyée |
| CAL-R2 | Convention `[début, fin[` : un séjour 10→12 occupe les 10 et 11, pas le 12 |
| CAL-R3 | Une arrivée le jour d'un départ n'est pas un conflit et s'affiche comme telle |
| CAL-R4 | Les catégories sont distinguées par couleur **et** par forme ou icône (daltonisme) |
| CAL-R5 | Fuseau `Europe/Paris`, changements d'heure gérés |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Consulter l'agenda | ❌ | ✅ *(filtré)* | ✅ *(complet)* |
| Créer un séjour directement | ❌ | ❌ | ✅ |
| Bloquer par cliquer-glisser | ❌ | ❌ | ✅ |

## 6. Dépendances
`BLOCK`, `PRIV`, `HOUSE`.

## 7. Cas nominaux
Un ami ouvre l'agenda du mois et repère les week-ends libres · Solenne bascule en vue Semaine pour préparer un week-end chargé.

## 8. Cas limites
Agenda vide · séjour à cheval sur deux mois · séjour à cheval sur deux années · 6 éléments le même jour · événement de quelques heures · changement d'heure · départ et arrivée le même jour · mois à 6 semaines affichées.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Décalage d'un jour à l'affichage | HIGH | `CAL-004`, `CAL-005`, `CAL-011` |
| Agenda illisible sur téléphone — c'est l'écran le plus consulté | HIGH | `CAL-013`, `CAL-014` |
| Fuite de données via l'agenda | CRITICAL | Traité par `PRIV`, revérifié en `CAL-016` |

## 10. Critères d'acceptation
Les 16 tests passent · les trois vues sont utilisables en 320 px · aucun décalage de date dans aucun scénario.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| CAL-001 | Vue Mois | 2 événements, 3 séjours, 1 blocage | Affichage | Tous positionnés aux bonnes dates, couleurs correctes | HIGH | Integration |
| CAL-002 | Vue Semaine | Même jeu | Bascule | Détail horaire correct | MEDIUM | Integration |
| CAL-003 | Vue Liste | Même jeu | Bascule | Ordre chronologique, cartes photo pour les événements | MEDIUM | Integration |
| CAL-004 | Bornes d'un séjour | Séjour 10→12/09 | Affichage | Les 10 et 11 occupés, **le 12 libre** | CRITICAL | Unit |
| CAL-005 | Départ et arrivée le même jour | Séjour A 08→10, séjour B 10→12 | Affichage | Aucun conflit signalé, transition lisible | HIGH | Unit |
| CAL-006 | Agenda vide | Aucune donnée | Affichage | État vide chaleureux, invitation à demander un séjour | MEDIUM | Unit |
| CAL-007 | Séjour à cheval sur deux mois | 28/09 → 03/10 | Navigation septembre puis octobre | Présent et correct dans les deux vues | HIGH | Integration |
| CAL-008 | Séjour à cheval sur deux années | 30/12 → 02/01 | Navigation | Correct | MEDIUM | Integration |
| CAL-009 | Journée chargée | 6 éléments le 12/09 | Affichage | Tous accessibles, indicateur « +N » si nécessaire | MEDIUM | Responsive |
| CAL-010 | Événement de quelques heures | 14h→18h | Vue Mois puis Semaine | Correct dans les deux | LOW | Integration |
| CAL-011 | Changement d'heure | Séjour 24→27/10/2026 | Affichage et décompte | 3 nuits, aucun décalage | HIGH | Unit |
| CAL-012 | Navigation entre mois | Agenda affiché | Avancer de 6 mois, revenir | Données correctes, aucune perte d'état | LOW | Integration |
| CAL-013 | Vue Mois en 320 px | Mois chargé | Rendu | Lisible, aucun débordement, jours atteignables au pouce | HIGH | Responsive |
| CAL-014 | Vue Semaine en 320 px | Semaine chargée | Rendu | Défilement vertical uniquement | MEDIUM | Responsive |
| CAL-015 | Distinction sans couleur | Toutes catégories | Rendu en nuances de gris | Catégories toujours distinguables (forme ou icône) | MEDIUM | Responsive |
| CAL-016 | Filtrage effectif | Agenda d'un ami, 3 séjours d'autrui | Inspection de la réponse serveur | Aucune donnée privée transmise | CRITICAL | Security |
