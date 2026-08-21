# Lot 4 — Événements · Fiches détaillées

`EVENT` · `RSVP` · `SLEEP` — 3 modules, 63 cas de test.
Rattaché à `Mode Operatoire.md` v1.0.

---

# MODULE `EVENT` — Événements et programme

## 1. Objectif
Permettre à Solenne de créer un événement complet — informations, programme heure par heure, invités — dans un seul écran, et le rendre désirable pour ceux qui le reçoivent.

## 2. Fonctionnalités
Création, modification, publication, déplacement, annulation · titre, description, dates et heures, lieu, capacité maximale, photo de couverture, informations pratiques · **programme d'activités** (titre, description, heure, durée, lieu, participants) · sélection des invités · statuts `DRAFT` / `PUBLISHED` / `CANCELLED`.

## 3. Données manipulées
`events`, `event_activities`, `activity_participants`, `event_participants` (invitations), `notifications`.

## 4. Règles métier
| # | Règle |
|---|---|
| EVT-R1 | Seule Solenne crée et modifie un événement |
| EVT-R2 | **Deux événements ne peuvent pas se chevaucher** (règle R6, décision D8) |
| EVT-R3 | Un brouillon n'est visible que de Solenne et n'envoie aucune invitation |
| EVT-R4 | La publication envoie les invitations |
| EVT-R5 | Un déplacement **remet tous les RSVP en `PENDING`** et notifie les invités |
| EVT-R6 | Une annulation notifie tous les inscrits et libère les couchages associés |
| EVT-R7 | L'heure de fin doit suivre l'heure de début |
| EVT-R8 | Une activité hors des bornes de l'événement produit un avertissement, jamais un blocage |
| EVT-R9 | Un événement annulé reste consultable en historique |

## 5. Permissions
| | Visiteur | Ami invité | Ami non invité | Solenne |
|---|---|---|---|---|
| Voir un événement publié | ❌ | ✅ | ❌ | ✅ |
| Voir un brouillon | ❌ | ❌ | ❌ | ✅ |
| Créer, modifier, déplacer, annuler | ❌ | ❌ | ❌ | ✅ |
| Voir le programme | ❌ | ✅ | ❌ | ✅ |
| S'inscrire à une activité | ❌ | ✅ | ❌ | ✅ |

**Interdit absolu :** un ami non invité ne doit obtenir aucune information sur l'événement, pas même son existence.

## 6. Dépendances
`CAL`, `PERM`, `AVAIL` (pour la règle R6).

## 7. Cas nominaux
Solenne crée « Week-end barbecue », 12→13 septembre, 10 personnes maximum, ajoute 6 activités et invite 8 amis, puis publie.

## 8. Cas limites
Chevauchement avec un autre événement · fin avant début · événement de plusieurs jours · capacité à 1 · aucun invité · 25 invités · activité hors bornes · activités qui se chevauchent · déplacement après des réponses · annulation avec des dormeurs déclarés · modification d'un événement passé.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Déplacement silencieux laissant des invités sur les anciennes dates | HIGH | `EVENT-013`, `EVENT-014` |
| Annulation ne libérant pas les couchages, capacité faussée | HIGH | `EVENT-017` |
| Événement visible d'un non-invité | HIGH | `EVENT-S03` |

## 10. Critères d'acceptation
Les 28 tests passent · aucun chevauchement d'événements possible · tout déplacement ou annulation notifie l'intégralité des inscrits.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| EVENT-001 | Création nominale | Session admin | « Week-end barbecue », 12→13/09, max 10 | Créé en `DRAFT` | HIGH | Integration |
| EVENT-002 | Publication | Événement en brouillon, 8 invités | Publication | Statut `PUBLISHED`, 8 invitations envoyées | HIGH | Integration |
| EVENT-003 | Brouillon invisible | Événement en `DRAFT` | Consultation par un ami invité | Absent de l'agenda et de la liste | HIGH | Security |
| EVENT-004 | Chevauchement refusé | Événement 12/09 14h→22h | Nouvel événement 12/09 18h→23h | ❌ `EVENT_OVERLAP` | CRITICAL | Integration |
| EVENT-005 | Événements contigus | Événement 12/09 14h→18h | Nouvel événement 18h→22h | ✅ Accepté | MEDIUM | Integration |
| EVENT-006 | Fin avant début | 20h→14h | Enregistrement | ❌ `INVALID_DATES` | MEDIUM | Unit |
| EVENT-007 | Événement de plusieurs jours | 12→15/09 | Création | Correct à l'agenda sur les 4 jours | MEDIUM | Integration |
| EVENT-008 | Capacité à 1 | max = 1 | Création puis 1 inscription | 2ᵉ inscription refusée | LOW | Integration |
| EVENT-009 | Aucun invité | Événement sans invité | Publication | Avertissement, publication possible | LOW | Integration |
| EVENT-010 | 25 invités | Liste complète | Publication | 25 invitations, affichage lisible en 320 px | MEDIUM | Responsive |
| EVENT-011 | Modification simple | Événement publié | Changer la description | Enregistré, invités notifiés d'une modification mineure | MEDIUM | Integration |
| EVENT-012 | Modification de la capacité sous les inscrits | 8 inscrits | Passer le maximum à 5 | ❌ Refus avec la liste des inscrits | HIGH | Integration |
| EVENT-013 | Déplacement | Événement du 12 avec 6 réponses | Déplacer au 19 | Dates changées, **les 6 RSVP repassent en `PENDING`** | HIGH | Integration |
| EVENT-014 | Notification de déplacement | Déplacement effectué | Vérification | Tous les invités notifiés, anciennes et nouvelles dates mentionnées | HIGH | Integration |
| EVENT-015 | Déplacement créant un chevauchement | Autre événement le 19 | Déplacer au 19 | ❌ `EVENT_OVERLAP` | HIGH | Integration |
| EVENT-016 | Annulation | Événement avec 8 inscrits | Annulation | Statut `CANCELLED`, 8 notifications, audit écrit | HIGH | Integration |
| EVENT-017 | Annulation libérant les couchages | Événement avec 6 dormeurs | Annulation | Occupation revenue à son niveau antérieur | CRITICAL | Integration |
| EVENT-018 | Événement annulé en historique | Événement annulé | Consultation de l'historique | Visible, marqué annulé | LOW | Integration |
| EVENT-019 | Modification d'un événement passé | Événement terminé | Modification | ❌ Refus | LOW | Integration |
| EVENT-020 | Photo de couverture | Image 3 Mo | Téléversement | Affichée en carte, redimensionnée | LOW | Integration |
| EVENT-021 | Création d'une activité | Événement existant | « Randonnée » 11h, 3 h, « Sentier du lac » | Ajoutée au programme, placée à l'heure | MEDIUM | Integration |
| EVENT-022 | Programme ordonné | 6 activités saisies dans le désordre | Consultation | Triées par heure | MEDIUM | Integration |
| EVENT-023 | Activités qui se chevauchent | Deux activités à 14h | Enregistrement | ✅ Accepté — deux choses peuvent se dérouler en parallèle | LOW | Unit |
| EVENT-024 | Activité hors bornes | Événement 14h→22h, activité à 23h | Enregistrement | ✅ Accepté avec avertissement (EVT-R8) | LOW | Unit |
| EVENT-025 | Inscription à une activité | Ami invité, activité « Randonnée » | Inscription | Nom ajouté, visible des autres | LOW | Integration |
| EVENT-026 | Programme sur mobile | 8 activités | Rendu 320 px | Chronologie lisible, aucun débordement | MEDIUM | Responsive |
| EVENT-S02 | Ami créant un événement | Session ami | Appel | Refus + audit | CRITICAL | Security |
| EVENT-S03 | Ami non invité | Événement publié, ami hors liste | Accès direct par identifiant | Refus, message neutre ; l'événement n'apparaît nulle part | HIGH | Security |

---

# MODULE `RSVP` — Réponses aux invitations

## 1. Objectif
Permettre à un invité de dire s'il vient, avec qui, et à quelle heure — en un geste, depuis son téléphone.

## 2. Fonctionnalités
Réponse Oui / Non / Peut-être · accompagnants adultes et enfants · heure d'arrivée et de départ · commentaire · changement de réponse · liste des participants · décompte par rapport à la capacité · réponse rapide depuis l'agenda.

## 3. Données manipulées
`event_participants`, `events.capacityMax`, `notifications`.

## 4. Règles métier
| # | Règle |
|---|---|
| RSVP-R1 | Seul un invité peut répondre, et seulement pour lui-même |
| RSVP-R2 | Le décompte inclut le participant **et** ses accompagnants |
| RSVP-R3 | Un « Oui » dépassant la capacité est refusé |
| RSVP-R4 | Un « Peut-être » ne consomme pas de place mais est signalé à Solenne |
| RSVP-R5 | La réponse est modifiable jusqu'au début de l'événement |
| RSVP-R6 | Passer de « Oui » à « Non » libère les places immédiatement |
| RSVP-R7 | Tout changement est notifié à Solenne |
| RSVP-R8 | Aucune réponse possible sur un événement annulé ou passé |

## 5. Permissions
| | Visiteur | Ami invité | Ami non invité | Solenne |
|---|---|---|---|---|
| Répondre pour soi | ❌ | ✅ | ❌ | ✅ |
| Répondre pour un autre | ❌ | ❌ | ❌ | ❌ **jamais** |
| Voir la liste des participants | ❌ | ✅ | ❌ | ✅ |
| Voir les commentaires de RSVP | ❌ | ❌ | ❌ | ✅ |

## 6. Dépendances
`EVENT`.

## 7. Cas nominaux
Marc répond « Oui », +1 adulte et 2 enfants, arrivée vers 18 h · il voit que 8 personnes viennent.

## 8. Cas limites
Dernière place · dépassement par les accompagnants · changement Oui → Non → Oui · réponse après le début · réponse sur un événement annulé · réponse d'un non-invité · 10 accompagnants · deux réponses simultanées sur la dernière place.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Capacité d'événement dépassée par les accompagnants | HIGH | `RSVP-005`, `RSVP-006` |
| Deux réponses simultanées sur la dernière place | HIGH | `RSVP-C03` |
| Réponse au nom d'un autre | CRITICAL | `RSVP-S04` |

## 10. Critères d'acceptation
Les 20 tests passent · la capacité d'un événement n'est jamais dépassée, y compris sous accès concurrent · nul ne peut répondre pour autrui.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| RSVP-001 | Réponse « Oui » | Ami invité | Oui, +1 adulte, 2 enfants | Enregistré, décompte à 4, Solenne notifiée | HIGH | Integration |
| RSVP-002 | Réponse « Non » | Ami invité | Non | Enregistré, aucune place consommée | MEDIUM | Integration |
| RSVP-003 | Réponse « Peut-être » | Ami invité | Peut-être | Aucune place consommée, signalé à Solenne | MEDIUM | Integration |
| RSVP-004 | Statut initial | Événement publié | Consultation | Tous les invités en `PENDING` | MEDIUM | Integration |
| RSVP-005 | Dernière place | Capacité 10, 9 inscrits | Oui pour 1 personne | ✅ Accepté, 10/10 | HIGH | Integration |
| RSVP-006 | Dépassement par accompagnants | Capacité 10, 8 inscrits | Oui + 3 accompagnants | ❌ Refus, « Il reste 2 places » | HIGH | Integration |
| RSVP-007 | Changement Oui → Non | Inscrit avec 3 personnes | Passage à Non | 3 places libérées immédiatement | HIGH | Integration |
| RSVP-008 | Changement Non → Oui | Refusé, événement complet entre-temps | Passage à Oui | ❌ Refus, « L'événement est complet » | HIGH | Integration |
| RSVP-009 | Changement de nombre | Oui +2 | Passer à +4, places suffisantes | ✅ Accepté, décompte à jour | MEDIUM | Integration |
| RSVP-010 | Heures d'arrivée et de départ | Oui | Arrivée 18h, départ le lendemain 11h | Enregistré et affiché à Solenne | LOW | Integration |
| RSVP-011 | Commentaire | Oui + « J'apporte une enceinte » | Envoi | Visible de Solenne | LOW | Integration |
| RSVP-012 | Réponse après le début | Événement commencé | Réponse | ❌ Refus, message explicatif | MEDIUM | Integration |
| RSVP-013 | Réponse sur événement annulé | Événement `CANCELLED` | Réponse | ❌ Refus | MEDIUM | Integration |
| RSVP-014 | Liste des participants | 8 réponses variées | Consultation par un invité | Oui, Non et Peut-être distingués, sans les commentaires | MEDIUM | Integration |
| RSVP-015 | Décompte affiché | 6 personnes sur 10 | Consultation | « 6 participants sur 10 » | LOW | Integration |
| RSVP-016 | Beaucoup d'accompagnants | Oui + 10 accompagnants, capacité 25 | Envoi | ✅ Accepté si la capacité le permet | LOW | Integration |
| RSVP-017 | Réponse rapide depuis l'agenda | Agenda affiché | Répondre depuis la feuille modale | Enregistré sans quitter l'agenda | MEDIUM | E2E |
| RSVP-018 | Réponse au pouce | Écran 320 px | Parcours complet | Boutons ≥ 44 px, aucun débordement | HIGH | Responsive |
| RSVP-C03 | **Dernière place, deux réponses simultanées** | Capacité 10, 9 inscrits, 2 réponses en parallèle | Exécution concurrente | **Une seule acceptée**, l'autre reçoit « L'événement vient d'être complet ». Jamais 11 | HIGH | Concurrency |
| RSVP-S04 | Réponse au nom d'un autre | `userId` d'un autre injecté | Envoi | Ignoré, réponse enregistrée pour l'appelant | CRITICAL | Security |

---

# MODULE `SLEEP` — Couchage sur place ⚠️

> Décision D3. Module à haut risque de régression — voir `Mode Operatoire.md` §6. Il **active** un contributeur déjà déclaré au lot 3 ; il ne réécrit aucune formule.

## 1. Objectif
Permettre à un invité de déclarer qu'il dort sur place, sans avoir à faire en plus une demande de séjour, et faire compter ces personnes dans l'occupation de la maison.

## 2. Fonctionnalités
Option « je dors sur place » dans le RSVP · nuits concernées (`nightFrom` / `nightTo`) · accompagnants dormant également · **activation du contributeur `DORMEUR_ÉVÉNEMENT`** dans `OCCUP` · vue de Solenne sur les dormeurs par nuit · retrait du couchage.

## 3. Données manipulées
`event_participants` (`sleepsOver`, `nightFrom`, `nightTo`), et par conséquence le calcul d'`OCCUP`.

## 4. Règles métier
| # | Règle |
|---|---|
| SLP-R1 | Le couchage n'est proposé que si la réponse est « Oui » |
| SLP-R2 | Les nuits déclarées doivent être comprises dans les bornes de l'événement, éventuellement étendues d'une nuit avant et après |
| SLP-R3 | Les dormeurs comptent dans l'occupation (D3), donc dans la capacité de la maison (D1) |
| SLP-R4 | Un dormeur déjà présent via un séjour n'est **pas compté deux fois** |
| SLP-R5 | Le retrait du couchage libère l'occupation immédiatement |
| SLP-R6 | Passer le RSVP à « Non » retire automatiquement le couchage |
| SLP-R7 | Un couchage qui dépasserait la capacité de la maison est refusé, message distinct de celui de la capacité de l'événement |

## 5. Permissions
| | Visiteur | Ami invité | Solenne |
|---|---|---|---|
| Déclarer son couchage | ❌ | ✅ | ✅ |
| Déclarer le couchage d'un autre | ❌ | ❌ | ✅ *(saisie pour un invité)* |
| Voir les dormeurs par nuit | ❌ | ❌ | ✅ |

## 6. Dépendances
`RSVP`, **`OCCUP`** (activation d'un contributeur, pas modification).

## 7. Cas nominaux
Marc répond « Oui » à l'anniversaire du 12, coche « je dors sur place » avec sa compagne et ses 2 enfants pour la nuit du 12 au 13 · Solenne voit 4 personnes de plus dans l'occupation du 12.

## 8. Cas limites
Couchage dépassant la capacité de la maison · dormeur déjà en séjour · nuits hors bornes · retrait · passage à « Non » · événement annulé · événement déplacé · demande de séjour concurrente sur la même nuit.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| **Surcapacité silencieuse : les dormeurs oubliés dans l'occupation** | CRITICAL | Contributeur déclaré dès le lot 3 + sentinelle `OCCUP-024` + régression obligatoire |
| Double comptage d'une personne à la fois en séjour et dormeuse | HIGH | `SLEEP-006`, `OCCUP-018` |
| Régression du moteur de disponibilité | CRITICAL | Suite `OCCUP` + `AVAIL` + `POLICY` + `STAYREQ` + `STAYDEC` + `CAL` intégralement rejouée (§9.3) |

## 10. Critères d'acceptation
Les 15 tests passent · **la suite complète du lot 3 est rejouée et au vert** · `OCCUP-024` confirme qu'aucune source d'occupation n'est omise · aucune modification de la formule d'occupation n'a été nécessaire, seulement une activation.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| SLEEP-001 | Activation du contributeur | Lot 4 déployé | Lecture du registre `OCCUP` | `DORMEUR_ÉVÉNEMENT` passé à « actif » | CRITICAL | Unit |
| SLEEP-002 | Déclaration nominale | Ami invité, réponse Oui | Couchage, +1 adulte, 2 enfants, nuit du 12 | Enregistré ; occupation du 12 augmentée de 4 | CRITICAL | Integration |
| SLEEP-003 | Couchage sans « Oui » | Réponse « Peut-être » | Tentative de couchage | Option indisponible | MEDIUM | Unit |
| SLEEP-004 | Plusieurs nuits | Événement 12→13 | Couchage nuits du 12 et du 13 | Occupation augmentée les deux jours | HIGH | Unit |
| SLEEP-005 | Nuit hors bornes | Événement le 12 | Couchage pour la nuit du 20 | ❌ Refus, message explicatif | MEDIUM | Unit |
| SLEEP-006 | Déjà présent en séjour | Marc en séjour 11→14 | Couchage déclaré pour le 12 | Compté **une seule fois** ; occupation inchangée | HIGH | Integration |
| SLEEP-007 | Dépassement de la capacité maison | Capacité 12, séjours 8 pers., événement | Couchage de 6 | ❌ Refus `CAPACITY_EXCEEDED`, message distinct de la capacité d'événement | CRITICAL | Integration |
| SLEEP-008 | Distinction des deux capacités | Événement plein mais maison libre | Couchage | Message précisant laquelle des deux limites est atteinte | MEDIUM | Integration |
| SLEEP-009 | Combinaison séjour + dormeurs | Capacité 12, séjour de 4, 6 dormeurs | Demande de séjour de 3 pers. | ❌ `CAPACITY_EXCEEDED` — « 13 personnes pour 12 places » | CRITICAL | Integration |
| SLEEP-010 | Retrait du couchage | Couchage de 4 déclaré | Retrait | Occupation libérée immédiatement | HIGH | Integration |
| SLEEP-011 | Passage à « Non » | Couchage déclaré | RSVP passé à Non | Couchage retiré automatiquement, occupation libérée | HIGH | Integration |
| SLEEP-012 | Événement annulé | 6 dormeurs déclarés | Annulation de l'événement | Occupation entièrement libérée | CRITICAL | Integration |
| SLEEP-013 | Événement déplacé | 6 dormeurs déclarés, événement déplacé | Déplacement | Couchages remis en attente, occupation des anciennes dates libérée | HIGH | Integration |
| SLEEP-014 | Vue des dormeurs | 5 dormeurs sur 2 nuits | Consultation par Solenne | Répartition par nuit correcte | MEDIUM | Integration |
| SLEEP-015 | **Régression du lot 3** | Contributeur activé | Rejouer `OCCUP` + `AVAIL` + `POLICY` + `STAYREQ` + `STAYDEC` + `CAL` | **100 % au vert**, aucune formule modifiée | CRITICAL | Regression |
