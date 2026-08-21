# Lot 6 — Notifications · Fiches détaillées

`NOTIF` · `MAIL` · `REMIND` — 3 modules, 36 cas de test.
Rattaché à `Mode Operatoire.md` v1.0.

---

# MODULE `NOTIF` — Bus de notification et préférences

## 1. Objectif
Garantir que chaque personne est prévenue de ce qui la concerne — et seulement de ce qui la concerne — par un mécanisme unique capable d'accueillir de nouveaux canaux sans réécriture.

## 2. Fonctionnalités
Bus recevant les événements métier et produisant les notifications · notifications internes avec compteur et tiroir · marquage comme lu · préférences par type et par canal · architecture multi-canal (`INAPP`, `EMAIL`, `WHATSAPP`) · journal des envois.

## 3. Données manipulées
`notifications`, `notification_deliveries`, `notification_preferences`.

## 4. Règles métier — les 12 déclencheurs du §16

| Déclencheur | Destinataire |
|---|---|
| Nouvelle demande de séjour | Solenne |
| Demande annulée par le demandeur | Solenne |
| Nouvelle inscription à un événement | Solenne |
| Changement de participation | Solenne |
| Nouveau message dans un fil | Participants concernés |
| Invitation à un événement | Invités |
| Événement modifié ou déplacé | Inscrits |
| Événement annulé | Inscrits |
| Demande de séjour acceptée | Demandeur |
| Demande refusée | Demandeur |
| Séjour annulé par Solenne | Intéressé |
| Rappel avant séjour et avant événement | Concernés (voir `REMIND`) |

| # | Règle |
|---|---|
| NTF-R1 | Une notification ne part **qu'aux personnes concernées** |
| NTF-R2 | Aucune donnée privée d'un tiers dans le titre ni le corps |
| NTF-R3 | Un même événement métier ne produit qu'une notification par destinataire |
| NTF-R4 | Une préférence désactivée supprime l'envoi sur le canal concerné, jamais la notification interne critique |
| NTF-R5 | L'échec d'un canal n'empêche ni les autres canaux ni l'action métier |
| NTF-R6 | Aucun envoi vers un compte désactivé |
| NTF-R7 | Le canal `WHATSAPP` est déclaré mais **inactif au MVP** |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Voir **ses** notifications | ❌ | ✅ | ✅ |
| Voir celles d'un autre | ❌ | ❌ | ❌ **jamais, même Solenne** |
| Modifier **ses** préférences | ❌ | ✅ | ✅ |

## 6. Dépendances
`CORE` et tous les modules émetteurs.

## 7. Cas nominaux
Marc envoie une demande → Solenne reçoit une notification interne et un email · Solenne accepte → Marc est notifié.

## 8. Cas limites
Destinataire désactivé · préférence désactivée · échec d'envoi · action déclenchant deux notifications · 50 notifications non lues · notification d'un événement annulé entre-temps.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Notification envoyée à la mauvaise personne, révélant un déplacement privé | CRITICAL | `NOTIF-003`, `NOTIF-S03` |
| Donnée privée dans un objet d'email | HIGH | `NOTIF-004`, `MAIL-008` |
| Échec d'envoi bloquant une acceptation de séjour | HIGH | `NOTIF-009` |

## 10. Critères d'acceptation
Les 16 tests passent · les 12 déclencheurs produisent la bonne notification au bon destinataire · aucune fuite vers un tiers.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| NOTIF-001 | Les 12 déclencheurs | Jeu de données complet | Déclencher chacun | 12 notifications, bon type, bon destinataire | HIGH | Integration |
| NOTIF-002 | Notification interne | Nouvelle demande | Consultation par Solenne | Visible dans le tiroir, compteur incrémenté | HIGH | Integration |
| NOTIF-003 | **Aucune fuite** | Demande de Marc acceptée | Notifications des autres amis | Aucun autre ami notifié | CRITICAL | Security |
| NOTIF-004 | Contenu sans donnée privée | Séjour de Marc accepté | Notification reçue par un tiers concerné | Ni motif, ni nombre de personnes, ni commentaire | HIGH | Security |
| NOTIF-005 | Marquage comme lu | 5 non lues | Ouverture | Compteur remis à jour | LOW | Integration |
| NOTIF-006 | Aucun doublon | Une acceptation | Vérification | Une seule notification pour le demandeur | MEDIUM | Integration |
| NOTIF-007 | Préférence désactivée | Email désactivé pour « nouveau message » | Nouveau message | Notification interne seule, aucun email | MEDIUM | Integration |
| NOTIF-008 | Notification critique non désactivable | Toutes préférences coupées | Refus d'une demande | Notification interne quand même délivrée | HIGH | Integration |
| NOTIF-009 | Échec d'un canal | Service d'email en panne | Acceptation d'une demande | **Le séjour est bien confirmé** ; l'échec est journalisé et reprogrammé | HIGH | Integration |
| NOTIF-010 | Compte désactivé | Ami `DISABLED` | Événement le concernant | Aucun envoi | HIGH | Security |
| NOTIF-011 | Volume | 50 notifications non lues | Consultation | Pagination, aucun ralentissement | LOW | Integration |
| NOTIF-012 | Canal WhatsApp inactif | Canal déclaré | Déclenchement | Marqué `SKIP — post-MVP`, aucun envoi, aucune erreur | MEDIUM | Integration |
| NOTIF-013 | Journal des envois | 10 notifications | Consultation par Solenne | Statut par canal, échecs visibles | LOW | Integration |
| NOTIF-014 | Événement annulé entre-temps | Notification en file, événement annulé | Traitement | Notification annulée ou reformulée, jamais trompeuse | MEDIUM | Integration |
| NOTIF-S03 | Notifications d'un autre | Ami A, identifiant de B | Lecture | ❌ Refus | CRITICAL | Security |
| NOTIF-S09 | Fuite dans la charge utile | Tiroir de notifications d'un ami | Inspection de la réponse | Aucune notification d'autrui | CRITICAL | Security |

---

# MODULE `MAIL` — Emails

## 1. Objectif
Faire sortir l'information de l'application, avec des messages lisibles au téléphone et une expéditrice reconnaissable.

## 2. Fonctionnalités
Gabarits français en React Email · envoi via Resend depuis `chezsolenne.fr` (décision D6) · gestion des échecs et reprises · émetteur simulé en développement et en test · désabonnement pour les messages non critiques.

## 3. Données manipulées
`notification_deliveries`, `users.email`.

## 4. Règles métier
| # | Règle |
|---|---|
| MAIL-R1 | Tous les emails sont en français, signés « La maison de Solenne » |
| MAIL-R2 | Un objet d'email ne contient **jamais** de donnée privée d'un tiers |
| MAIL-R3 | Un échec d'envoi est journalisé et réessayé jusqu'à 3 fois, avec délai croissant |
| MAIL-R4 | Aucun email réel n'est envoyé en développement ni en test |
| MAIL-R5 | Chaque email contient un lien direct vers l'écran concerné |
| MAIL-R6 | Aucun envoi vers un compte désactivé |

## 5. Permissions
Aucune surface exposée. `MAIL` est appelé exclusivement par `NOTIF`.

## 6. Dépendances
`NOTIF`. **Prérequis externe L1 :** domaine acheté et DNS validés chez Resend.

## 7. Cas nominaux
Solenne invite Marc → Marc reçoit « Solenne vous invite chez elle 🌿 » avec son lien.

## 8. Cas limites
Adresse invalide · service indisponible · quota atteint · email très long · rendu sur client mobile · lien expiré au moment du clic.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Envoi accidentel à de vraies personnes depuis l'environnement de test | HIGH | `MAIL-004` |
| Email classé indésirable, invitations jamais reçues | HIGH | Validation DNS (SPF, DKIM, DMARC) vérifiée en `MAIL-009` |
| Donnée privée dans un objet visible sur un écran verrouillé | HIGH | `MAIL-008` |

## 10. Critères d'acceptation
Les 10 tests passent · aucun envoi réel hors production · authentification du domaine vérifiée.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| MAIL-001 | Email d'invitation | Invitation émise | Envoi | Reçu, français, lien fonctionnel | CRITICAL | Integration |
| MAIL-002 | Gabarits complets | Les 12 déclencheurs | Génération | 12 gabarits existent, aucun texte de remplacement oublié | HIGH | Integration |
| MAIL-003 | Rendu mobile | Gabarit le plus long | Rendu à 375 px | Lisible, boutons cliquables, aucun défilement horizontal | MEDIUM | Responsive |
| MAIL-004 | Aucun envoi en test | `NODE_ENV=test` | Déclenchement | Aucun appel réseau, message capturé localement | HIGH | Security |
| MAIL-005 | Adresse invalide | Email mal formé | Envoi | Échec journalisé, aucune interruption de l'action métier | MEDIUM | Integration |
| MAIL-006 | Service indisponible | Fournisseur en panne | Envoi | 3 tentatives espacées, puis abandon journalisé | HIGH | Integration |
| MAIL-007 | Lien direct | Email d'acceptation | Clic | Arrivée sur le séjour concerné, après connexion si nécessaire | MEDIUM | E2E |
| MAIL-008 | Objet sans donnée privée | Séjour accepté | Lecture de l'objet | « Votre demande a été acceptée » — ni nom de tiers, ni motif | HIGH | Security |
| MAIL-009 | Authentification du domaine | `chezsolenne.fr` configuré | Vérification | SPF, DKIM et DMARC valides | HIGH | Integration |
| MAIL-010 | Compte désactivé | Ami `DISABLED` | Déclenchement | Aucun envoi | HIGH | Security |

---

# MODULE `REMIND` — Rappels

> Module créé en v1.0 par éclatement de `PREF` : un rappel est une **tâche planifiée**, avec des modes de panne propres, et non une préférence.

## 1. Objectif
Prévenir au bon moment, sans jamais rappeler quelque chose qui n'aura pas lieu.

## 2. Fonctionnalités
Tâche planifiée quotidienne · rappel J−2 avant un séjour · rappel J−2 avant un événement · rappel de RSVP sans réponse à J−3 · rappel à Solenne des demandes en attente depuis plus de 48 h · marquage anti-doublon.

## 3. Données manipulées
`stays`, `events`, `event_participants`, `stay_requests`, `notifications`.

## 4. Règles métier
| # | Règle |
|---|---|
| RMD-R1 | Un rappel n'est jamais envoyé deux fois pour le même objet |
| RMD-R2 | Aucun rappel pour un séjour ou un événement annulé |
| RMD-R3 | Aucun rappel pour un objet déjà passé |
| RMD-R4 | Une exécution manquée est rattrapée à l'exécution suivante, sans rafale de retard |
| RMD-R5 | Une double exécution de la tâche ne produit aucun doublon (idempotence) |
| RMD-R6 | Aucun rappel vers un compte désactivé |

## 5. Permissions
Tâche système, sans surface exposée. L'exécution manuelle est réservée à Solenne, à des fins de diagnostic.

## 6. Dépendances
`NOTIF`, `STAY`, `EVENT`.

## 7. Cas nominaux
Séjour du 18 septembre → rappel envoyé le 16 · anniversaire du 12 → rappel le 10 aux inscrits.

## 8. Cas limites
Séjour annulé la veille du rappel · tâche non exécutée pendant 3 jours · tâche exécutée deux fois · événement déplacé après l'envoi du rappel · fuseau horaire · aucun objet à rappeler.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Rappel pour un séjour annulé — perte de confiance immédiate | HIGH | `REMIND-004` |
| Double exécution produisant des rappels en double | MEDIUM | `REMIND-007` |
| Tâche silencieusement arrêtée, plus aucun rappel | MEDIUM | `REMIND-010` — supervision et alerte |

## 10. Critères d'acceptation
Les 10 tests passent · idempotence prouvée · aucun rappel pour un objet annulé ou passé · une exécution manquée est détectée.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| REMIND-001 | Rappel avant séjour | Séjour dans 2 jours | Exécution de la tâche | Rappel envoyé au séjournant | MEDIUM | Integration |
| REMIND-002 | Rappel avant événement | Événement dans 2 jours, 6 inscrits | Exécution | 6 rappels | MEDIUM | Integration |
| REMIND-003 | Rappel de RSVP sans réponse | Événement dans 3 jours, 3 sans réponse | Exécution | 3 relances | LOW | Integration |
| REMIND-004 | Aucun rappel pour un objet annulé | Séjour annulé hier | Exécution | Aucun envoi | HIGH | Integration |
| REMIND-005 | Aucun rappel rétroactif | Séjour passé | Exécution | Aucun envoi | MEDIUM | Integration |
| REMIND-006 | Anti-doublon | Rappel déjà envoyé | Nouvelle exécution le lendemain | Aucun second envoi | MEDIUM | Integration |
| REMIND-007 | Double exécution | Tâche lancée deux fois en parallèle | Exécution | **Idempotent** : un seul rappel par objet | HIGH | Concurrency |
| REMIND-008 | Exécution manquée | Tâche non exécutée pendant 3 jours | Reprise | Rattrapage des rappels encore pertinents, aucune rafale de rappels périmés | MEDIUM | Integration |
| REMIND-009 | Événement déplacé | Rappel envoyé, événement déplacé ensuite | Exécution suivante | Nouveau rappel avec les bonnes dates | MEDIUM | Integration |
| REMIND-010 | Supervision | Tâche non exécutée depuis 48 h | Vérification | Alerte à Solenne, situation visible et non silencieuse | MEDIUM | Integration |
