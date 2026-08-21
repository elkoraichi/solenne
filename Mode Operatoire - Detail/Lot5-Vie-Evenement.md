# Lot 5 — Vie de l'événement · Fiches détaillées

`ITEM` · `COMMENT` — 2 modules, 31 cas de test.
Rattaché à `Mode Operatoire.md` v1.0.

---

# MODULE `ITEM` — À apporter

## 1. Objectif
Remplacer la conversation WhatsApp interminable par une liste claire où chacun voit ce qui manque et se déclare en un clic, sans doublon.

## 2. Fonctionnalités
Liste d'objets à apporter par événement (libellé, catégorie, nombre de personnes attendues, unité, notes) · bouton **« Je m'en charge »** · retrait de sa prise en charge · compteur « 2 sur 2 » · fermeture automatique d'un créneau complet · ajout d'un objet par un invité (paramétrable) · suggestions par type d'événement.

## 3. Données manipulées
`event_items`, `event_item_claims`.

## 4. Règles métier
| # | Règle |
|---|---|
| ITEM-R1 | **Une personne ne peut se déclarer qu'une fois par objet** — garanti par une contrainte d'unicité `(item_id, user_id)`, pas seulement par l'interface |
| ITEM-R2 | Le nombre de preneurs ne peut pas dépasser le nombre attendu |
| ITEM-R3 | Un objet complet n'accepte plus de preneur |
| ITEM-R4 | Chacun ne retire que sa propre prise en charge |
| ITEM-R5 | Solenne peut retirer la prise en charge de n'importe qui |
| ITEM-R6 | La suppression d'un objet déjà pris en charge exige une confirmation et notifie les preneurs |
| ITEM-R7 | Aucune prise en charge sur un événement annulé ou passé |

## 5. Permissions
| | Visiteur | Ami invité | Ami non invité | Solenne |
|---|---|---|---|---|
| Voir la liste | ❌ | ✅ | ❌ | ✅ |
| Se déclarer / se retirer | ❌ | ✅ | ❌ | ✅ |
| Retirer quelqu'un d'autre | ❌ | ❌ | ❌ | ✅ |
| Créer, modifier, supprimer un objet | ❌ | ⚙️ *(si autorisé)* | ❌ | ✅ |

## 6. Dépendances
`EVENT`.

## 7. Cas nominaux
Solenne crée la liste (viande ×2, salades ×1, dessert ×2, boissons ×2, pain ×1, jeux ×1) · Marc clique « Je m'en charge » sur *Dessert*, son nom apparaît · quand le second preneur arrive, le créneau se ferme.

## 8. Cas limites
Dernier créneau · deux clics simultanés sur le dernier créneau · double clic de la même personne · retrait libérant un créneau · suppression d'un objet pris en charge · événement annulé · 30 objets · libellé très long.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Doublon — deux fois la même personne sur un objet | HIGH | Contrainte d'unicité en base, `ITEM-004` |
| **Deux personnes sur le dernier créneau simultanément** | HIGH | `ITEM-C02` |
| Retrait de la prise en charge d'autrui | MEDIUM | `ITEM-S04` |

## 10. Critères d'acceptation
Les 18 tests passent · aucun doublon possible, même par appel direct · aucun dépassement du nombre attendu sous accès concurrent.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| ITEM-001 | Création d'un objet | Session admin, événement | « Dessert », 2 personnes | Créé, visible des invités | MEDIUM | Integration |
| ITEM-002 | Prise en charge | Objet « Dessert » 0/2 | Clic « Je m'en charge » | Nom affiché, compteur 1/2 | HIGH | Integration |
| ITEM-003 | Créneau complet | Objet 1/2, second preneur | Clic | 2/2, bouton désactivé pour les autres | HIGH | Integration |
| ITEM-004 | Anti-doublon | Marc déjà preneur | Nouvelle prise en charge par Marc | ❌ Refus au niveau **base**, compteur inchangé | HIGH | Security |
| ITEM-005 | Dépassement | Objet 2/2 | 3ᵉ preneur | ❌ « Ce créneau est complet » | HIGH | Integration |
| ITEM-006 | Retrait | Marc preneur | Retrait | Compteur décrémenté, créneau rouvert | MEDIUM | Integration |
| ITEM-007 | Retrait par Solenne | Marc preneur | Retrait par Solenne | Accepté, Marc notifié | LOW | Integration |
| ITEM-008 | Suppression d'un objet pris | Objet 2/2 | Suppression par Solenne | Confirmation demandée, preneurs notifiés | MEDIUM | Integration |
| ITEM-009 | Événement annulé | Événement `CANCELLED` | Prise en charge | ❌ Refus | MEDIUM | Integration |
| ITEM-010 | Événement passé | Événement terminé | Prise en charge | ❌ Refus | LOW | Integration |
| ITEM-011 | Ajout par un invité | Option activée | Un ami ajoute « Glace » | Créé, attribué à son auteur | LOW | Integration |
| ITEM-012 | Ajout interdit | Option désactivée | Un ami tente d'ajouter | ❌ Refus | MEDIUM | Security |
| ITEM-013 | Liste vide | Aucun objet | Consultation | État vide avec suggestion de démarrage | LOW | Unit |
| ITEM-014 | Longue liste | 30 objets | Rendu 320 px | Lisible, regroupée par catégorie | MEDIUM | Responsive |
| ITEM-015 | Libellé très long | 200 caractères | Rendu | Tronqué proprement | LOW | Responsive |
| ITEM-016 | Vue d'ensemble | 10 objets, 6 pris | Consultation | « 6 sur 10 pourvus », manquants mis en avant | MEDIUM | Integration |
| ITEM-C02 | **Dernier créneau, deux clics simultanés** | Objet 1/2, deux requêtes parallèles | Exécution concurrente | **Un seul preneur ajouté**, l'autre voit « Ce créneau vient d'être pris ». Jamais 3/2 | HIGH | Concurrency |
| ITEM-S04 | Retrait de la prise d'autrui | Ami A, prise en charge de B | Appel direct | ❌ Refus, aucune écriture | HIGH | Security |

---

# MODULE `COMMENT` — Fil de discussion

## 1. Objectif
Offrir une communication légère autour d'un événement ou d'un séjour, sans construire une messagerie.

## 2. Fonctionnalités
Fil chronologique par événement et par demande de séjour · publication, modification et suppression de ses propres messages · suppression par Solenne · horodatage et auteur · notification des participants.

## 3. Données manipulées
`comments` (entityType `EVENT` ou `STAY_REQUEST`, entityId, authorId, body, editedAt, deletedAt).

## 4. Règles métier
| # | Règle |
|---|---|
| CMT-R1 | Chacun ne modifie et ne supprime que **ses propres** messages |
| CMT-R2 | Solenne peut supprimer n'importe quel message |
| CMT-R3 | Une suppression est logique (`deletedAt`), le message devient « Message supprimé » |
| CMT-R4 | Un message modifié porte la mention « modifié » |
| CMT-R5 | Le fil d'un événement n'est accessible qu'aux invités |
| CMT-R6 | Le fil d'une demande de séjour n'est accessible qu'au demandeur et à Solenne |
| CMT-R7 | Aucun message sur un événement annulé, mais le fil reste lisible |

## 5. Permissions
| | Visiteur | Ami invité | Auteur | Solenne |
|---|---|---|---|---|
| Lire le fil d'un événement | ❌ | ✅ | ✅ | ✅ |
| Lire le fil d'un séjour | ❌ | ❌ | ✅ | ✅ |
| Publier | ❌ | ✅ | ✅ | ✅ |
| Modifier un message | ❌ | ❌ | ✅ | ❌ *(elle supprime, elle ne réécrit pas)* |
| Supprimer un message | ❌ | ❌ | ✅ | ✅ |

**Interdit absolu :** lire le fil d'une demande de séjour dont on n'est pas l'auteur — il contient des informations privées.

## 6. Dépendances
`EVENT`, `STAYREQ`.

## 7. Cas nominaux
Un ami écrit « Est-ce que quelqu'un peut apporter une enceinte ? » · un autre répond « J'arriverai vers 18h ».

## 8. Cas limites
Message vide · message très long · message sur un événement annulé · modification après suppression · fil vide · 100 messages · lecture par un non-invité.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Lecture du fil d'un séjour d'autrui | HIGH | `COMMENT-S03` |
| Modification du message d'un autre | MEDIUM | `COMMENT-S04` |
| Contenu injecté s'exécutant à l'affichage | HIGH | `COMMENT-011` |

## 10. Critères d'acceptation
Les 13 tests passent · aucun accès croisé entre fils de séjours · aucun contenu injecté ne s'exécute.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| COMMENT-001 | Publication | Ami invité | « J'arriverai vers 18h » | Publié, horodaté, auteur affiché | MEDIUM | Integration |
| COMMENT-002 | Ordre chronologique | 5 messages | Consultation | Du plus ancien au plus récent | LOW | Integration |
| COMMENT-003 | Modification de son message | Message de Marc | Modification par Marc | Modifié, mention « modifié » | LOW | Integration |
| COMMENT-004 | Suppression de son message | Message de Marc | Suppression par Marc | Remplacé par « Message supprimé », conservé en base | MEDIUM | Integration |
| COMMENT-005 | Suppression par Solenne | Message d'un ami | Suppression | Accepté + audit | MEDIUM | Integration |
| COMMENT-006 | Message vide | Champ vide | Envoi | ❌ Refus | LOW | Unit |
| COMMENT-007 | Message très long | 10 000 caractères | Envoi | ❌ Refus au-delà de la limite, message explicite | LOW | Unit |
| COMMENT-008 | Fil d'un événement annulé | Événement `CANCELLED` | Publication | ❌ Refus ; fil toujours lisible | LOW | Integration |
| COMMENT-009 | Fil vide | Aucun message | Consultation | État vide encourageant | LOW | Unit |
| COMMENT-010 | Notification | Nouveau message | Vérification | Participants notifiés, sans saturation | MEDIUM | Integration |
| COMMENT-011 | Contenu injecté | Message contenant du balisage exécutable | Affichage | Affiché en texte brut, jamais interprété | HIGH | Security |
| COMMENT-S03 | Fil d'un séjour d'autrui | Ami A, demande de B | Lecture | ❌ Refus, message neutre | CRITICAL | Security |
| COMMENT-S04 | Modification du message d'un autre | Ami A, message de B | Appel direct | ❌ Refus, aucune écriture | HIGH | Security |
