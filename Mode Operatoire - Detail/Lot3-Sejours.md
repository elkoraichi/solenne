# Lot 3 — Séjours ★ · Fiches détaillées

`OCCUP` · `AVAIL` · `POLICY` · `STAYREQ` · `STAYDEC` · `STAY` — 6 modules, 124 cas de test.
Rattaché à `Mode Operatoire.md` v1.0. **Lot le plus critique du projet.**

---

# MODULE `OCCUP` — Calcul de l'occupation ★

> Module créé en v1.0 par éclatement d'`AVAIL`. Il porte la parade au seul risque de régression rétrograde du projet (voir `Mode Operatoire.md` §6).

## 1. Objectif
Fournir **l'unique réponse** à la question « combien de personnes sont présentes dans la maison tel jour ? », de façon extensible, pour que l'ajout d'une nouvelle source d'occupation ne modifie jamais la formule.

## 2. Fonctionnalités
Fonction pure `occupationSur(période) → { total, détail par source }` · **registre de contributeurs** déclarés une fois pour toutes :

| Contributeur | Activé au | État au lot 3 |
|---|---|---|
| `SÉJOUR_CONFIRMÉ` | Lot 3 | **Actif** |
| `DORMEUR_ÉVÉNEMENT` | Lot 4 (`SLEEP`) | **Déclaré, renvoie 0** |
| `AFFECTATION_CHAMBRE` | Post-MVP | Déclaré, renvoie 0 |

Le lot 4 **active** un contributeur existant ; il ne réécrit aucune formule.

## 3. Données manipulées
En lecture seule : `stays` (confirmés), `event_participants` (dormeurs, à partir du lot 4). Aucune écriture. Aucune dépendance à l'interface.

## 4. Règles métier
| # | Règle |
|---|---|
| OCC-R1 | Occupation d'un jour J = somme des contributeurs **actifs** couvrant J |
| OCC-R2 | Un contributeur inactif renvoie 0 sans erreur |
| OCC-R3 | Un séjour compte adultes + enfants + invités nommés |
| OCC-R4 | Un dormeur d'événement compte le participant + ses accompagnants adultes et enfants |
| OCC-R5 | Convention `[arrivée, départ[` : le jour du départ n'est pas occupé |
| OCC-R6 | Les séjours annulés, refusés ou en attente ne comptent jamais |
| OCC-R7 | Un séjour `HIDDEN` compte quand même — la confidentialité n'affecte pas le calcul |
| OCC-R8 | Le total est toujours ≥ 0 et le détail par source somme exactement au total |

## 5. Permissions
Aucune surface exposée. `OCCUP` est appelé exclusivement par `AVAIL` et par les écrans de décision, jamais directement par un client.

## 6. Dépendances
`HOUSE` (capacité, pour la comparaison — le calcul lui-même n'en dépend pas). **Aucune dépendance à l'interface ni aux Server Actions.**

## 7. Cas nominaux
Aucun séjour → 0 · un séjour de 4 → 4 · deux séjours simultanés de 4 et 3 → 7 · un séjour de 4 et 6 dormeurs d'événement (lot 4) → 10.

## 8. Cas limites
Période sans occupation · jour de départ · jour d'arrivée · séjour d'une seule nuit · séjour à cheval sur la période interrogée · séjour annulé · séjour caché · période inversée · période de durée nulle · contributeur inactif.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| **Une source d'occupation oubliée au total** — le risque principal du projet | CRITICAL | `OCCUP-024` énumère le registre dynamiquement et compare à la somme |
| Modification du contrat au lot 4 | CRITICAL | Tests de contrat `OCCUP-CT-01→08`, rejoués à chaque ajout |
| Double comptage d'une personne à la fois en séjour et dormeur d'événement | HIGH | `OCCUP-018` |
| Erreur de borne au jour de départ | HIGH | `OCCUP-005`, `OCCUP-006` |

## 10. Critères d'acceptation
Les 26 tests passent · **couverture 100 %** · le contributeur `DORMEUR_ÉVÉNEMENT` existe et est testé dès le lot 3 · `OCCUP-024` échoue si l'on ajoute un contributeur sans l'inclure au total.

## 11. Cas de test

### Tests de contrat — figés, rejoués à chaque ajout de contributeur

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| OCCUP-CT-01 | Signature stable | — | Appel `occupationSur(début, fin)` | Retourne `{ total: number, parSource: Record }` | CRITICAL | Unit |
| OCCUP-CT-02 | Fonction pure | Même entrée deux fois | Deux appels | Résultats identiques, aucun effet de bord | CRITICAL | Unit |
| OCCUP-CT-03 | Somme cohérente | Plusieurs sources actives | Appel | `total === Σ parSource` | CRITICAL | Unit |
| OCCUP-CT-04 | Total jamais négatif | Toutes configurations | Appel | `total ≥ 0` | HIGH | Unit |
| OCCUP-CT-05 | Contributeur inactif toléré | Contributeur dormant | Appel | Renvoie 0, aucune exception | CRITICAL | Unit |
| OCCUP-CT-06 | Registre énumérable | Registre | Lecture | Les 3 contributeurs sont listés avec leur état | HIGH | Unit |
| OCCUP-CT-07 | Indépendance à l'interface | — | Analyse des imports | Aucun import React, Next.js ou Prisma dans le calcul | HIGH | Unit |
| OCCUP-CT-08 | Convention de bornes | Période 10→12 | Appel | Les 10 et 11 sont évalués, pas le 12 | CRITICAL | Unit |

### Tests fonctionnels

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| OCCUP-001 | Maison vide | Aucun séjour | Occupation du 10/09 | 0 | HIGH | Unit |
| OCCUP-002 | Un séjour | Séjour 4 pers. 10→12 | Occupation du 10/09 | 4 | CRITICAL | Unit |
| OCCUP-003 | Deux séjours simultanés | 4 pers. + 3 pers. sur 10→12 | Occupation du 10/09 | 7 | CRITICAL | Unit |
| OCCUP-004 | Chevauchement partiel | A 4 pers. 08→11, B 3 pers. 10→13 | Occupation des 09, 10, 11 | 4, 7, 3 | CRITICAL | Unit |
| OCCUP-005 | Jour d'arrivée compté | Séjour 10→12 | Occupation du 10 | 4 | CRITICAL | Unit |
| OCCUP-006 | Jour de départ non compté | Séjour 10→12 | Occupation du 12 | 0 | CRITICAL | Unit |
| OCCUP-007 | Séjour d'une nuit | 10→11, 2 pers. | Occupation du 10 puis du 11 | 2 puis 0 | HIGH | Unit |
| OCCUP-008 | Adultes + enfants | 2 adultes, 3 enfants | Occupation | 5 | CRITICAL | Unit |
| OCCUP-009 | Invités nommés | 2 adultes + 2 invités nommés | Occupation | 4, sans double comptage | HIGH | Unit |
| OCCUP-010 | Séjour annulé ignoré | Séjour annulé 10→12 | Occupation du 10 | 0 | CRITICAL | Unit |
| OCCUP-011 | Demande en attente ignorée | Demande non validée | Occupation | 0 | CRITICAL | Unit |
| OCCUP-012 | Séjour refusé ignoré | Demande refusée | Occupation | 0 | HIGH | Unit |
| OCCUP-013 | Séjour caché compté | Séjour `HIDDEN` de 8 | Occupation | 8 — la confidentialité n'affecte pas le calcul | CRITICAL | Unit |
| OCCUP-014 | Séjour de Solenne compté | Séjour personnel de 2 | Occupation | 2 | HIGH | Unit |
| OCCUP-015 | Période interrogée large | Séjours épars sur 3 mois | Occupation sur 01/09→30/11 | Détail jour par jour correct | MEDIUM | Unit |
| OCCUP-016 | Période inversée | fin < début | Appel | Erreur explicite `INVALID_DATES`, pas de plantage | MEDIUM | Unit |
| OCCUP-017 | Période de durée nulle | début = fin | Appel | 0, aucune erreur | LOW | Unit |
| OCCUP-018 | Personne en séjour **et** dormeuse d'un événement | Marc en séjour 10→12 et inscrit dormeur le 11 | Occupation du 11 | Marc compté **une seule fois** | HIGH | Unit |
| OCCUP-019 | Contributeur dormant | `DORMEUR_ÉVÉNEMENT` inactif, 6 dormeurs en base | Occupation | Les dormeurs ne comptent pas ; total = séjours seuls | CRITICAL | Unit |
| OCCUP-020 | Détail par source | 1 séjour de 4 | Appel | `parSource.SÉJOUR_CONFIRMÉ = 4`, autres à 0 | HIGH | Unit |
| OCCUP-021 | Occupation maximale sur une période | Séjours variables du 10 au 20 | Appel `pic()` | Renvoie le maximum journalier et sa date | HIGH | Unit |
| OCCUP-022 | Grand volume | 200 séjours sur 2 ans | Occupation sur un mois | Réponse < 100 ms | MEDIUM | Unit |
| OCCUP-023 | Exclusion d'un séjour | Recalcul en excluant le séjour en cours de modification | Appel avec `exclureSéjourId` | Le séjour exclu n'est pas compté | HIGH | Unit |
| OCCUP-024 | **Sentinelle — aucune source oubliée** | Registre des contributeurs | Énumération dynamique + somme | `total === Σ contributeurs actifs`. **Ajouter un contributeur sans l'inclure fait échouer ce test automatiquement** | CRITICAL | Regression |
| OCCUP-025 | Cohérence après annulation | Séjour de 4 annulé | Occupation avant / après | 4 puis 0 | HIGH | Unit |
| OCCUP-026 | Cohérence après modification | Séjour passé de 4 à 6 personnes | Occupation | 6 | HIGH | Unit |

---

# MODULE `AVAIL` — Moteur de compatibilité ★

## 1. Objectif
Répondre, pour une demande donnée, à la question « est-ce compatible ? », et si non, pourquoi — avec un code stable et un message français.

## 2. Fonctionnalités
Fonction pure `verifierDisponibilite(demande) → { compatible, conflits[] }` · application des 8 règles R1→R8 · **`AVAIL` ne compte jamais lui-même** : il consomme `OCCUP` (garde-fou G1) · production de messages français paramétrés.

## 3. Données manipulées
En lecture : occupation via `OCCUP`, `blocked_periods`, `events`, `booking_settings` via `POLICY`. Aucune écriture.

## 4. Règles métier — les 8 règles

| # | Règle | Verdict |
|---|---|---|
| R1 | Chevauchement avec une période bloquée | ❌ `BLOCKED_PERIOD` |
| R2 | Chevauchement avec un séjour exclusif existant | ❌ `EXCLUSIVE_CONFLICT` |
| R3 | Demande exclusive alors qu'un séjour existe déjà | ❌ `EXCLUSIVE_REQUEST_CONFLICT` |
| R4 | `occupation + demande > capacité` (D1, 1→25) | ❌ `CAPACITY_EXCEEDED` |
| R5 | Chevauchement avec un séjour non exclusif, capacité suffisante | ✅ **Autorisé** — cohabitation |
| R6 | Deux événements qui se chevauchent | ❌ `EVENT_OVERLAP` |
| R7 | Séjours pendant un événement | ✅ **Cas nominal** (D3) — seule R4 arbitre |
| R8 | Règles paramétrables déléguées à `POLICY` | ❌ code renvoyé par `POLICY` |

Règle transverse : **plusieurs conflits sont renvoyés ensemble**, pas seulement le premier — pour que Solenne voie tout d'un coup.

## 5. Permissions
Aucune surface exposée. Appelé par `STAYREQ`, `STAYDEC`, `CAL` et `EVENT`.

## 6. Dépendances
`OCCUP`, `BLOCK`, `POLICY`, `HOUSE`.

## 7. Cas nominaux
Demande sur période libre → compatible · demande dépassant la capacité → refus motivé · demande cohabitant avec un séjour existant → compatible.

## 8. Cas limites
Voir la table ci-dessous : bornes exactes de capacité, chevauchements partiels et inclus, arrivée le jour d'un départ, demande d'une nuit, exclusivité dans les deux sens, conflits multiples.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Une règle appliquée dans le mauvais ordre masquant un conflit plus grave | HIGH | `AVAIL-032`, `AVAIL-033` |
| Combinaison de règles non testée | CRITICAL | `AVAIL-027` à `AVAIL-034` — table de décision |
| `AVAIL` recomptant l'occupation lui-même | CRITICAL | `AVAIL-CT-01` (garde-fou G1) |

## 10. Critères d'acceptation
Les 34 tests passent · **couverture 100 %** · chaque règle est testée isolément **et** en combinaison · aucun appel de comptage direct dans le code d'`AVAIL`.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| AVAIL-CT-01 | `AVAIL` ne compte pas | Code du module | Analyse statique | Aucun accès direct aux séjours ; passe exclusivement par `OCCUP` | CRITICAL | Unit |
| AVAIL-001 | Période libre | Capacité 10, rien de réservé | Demande 4 pers. 10→12/09 | ✅ Compatible | CRITICAL | Unit |
| AVAIL-002 | R1 — période bloquée | Blocage 08→15 | Demande 10→12 | ❌ `BLOCKED_PERIOD` | CRITICAL | Unit |
| AVAIL-003 | R1 — chevauchement partiel | Blocage 11→20 | Demande 10→12 | ❌ `BLOCKED_PERIOD` | CRITICAL | Unit |
| AVAIL-004 | R1 — blocage adjacent | Blocage 12→15 | Demande 10→12 | ✅ Compatible — le 12 n'est pas occupé | HIGH | Unit |
| AVAIL-005 | R2 — séjour exclusif existant | Séjour exclusif 10→12 | Demande 11→13, 2 pers. | ❌ `EXCLUSIVE_CONFLICT` | CRITICAL | Unit |
| AVAIL-006 | R2 — même si capacité largement suffisante | Exclusif de 2, capacité 25 | Demande 2 pers. | ❌ `EXCLUSIVE_CONFLICT` | CRITICAL | Unit |
| AVAIL-007 | R3 — demande exclusive sur période occupée | Séjour de 3 confirmé | Demande exclusive | ❌ `EXCLUSIVE_REQUEST_CONFLICT` | CRITICAL | Unit |
| AVAIL-008 | R3 — demande exclusive sur période libre | Rien de réservé | Demande exclusive | ✅ Compatible | HIGH | Unit |
| AVAIL-009 | R4 — capacité dépassée | Capacité 10, 8 occupés | Demande 4 pers. | ❌ `CAPACITY_EXCEEDED`, message « 12 personnes pour 10 places » | CRITICAL | Unit |
| AVAIL-010 | R4 — capacité exactement atteinte | Capacité 10, 6 occupés | Demande 4 pers. | ✅ Compatible — 10/10 | CRITICAL | Unit |
| AVAIL-011 | R4 — dépassement de 1 | Capacité 10, 7 occupés | Demande 4 pers. | ❌ `CAPACITY_EXCEEDED` | CRITICAL | Unit |
| AVAIL-012 | R4 — borne minimale | Capacité 1, maison vide | Demande 1 pers. | ✅ Compatible | HIGH | Unit |
| AVAIL-013 | R4 — borne maximale | Capacité 25, maison vide | Demande 25 pers. | ✅ Compatible | HIGH | Unit |
| AVAIL-014 | R5 — cohabitation | Capacité 10, séjour de 4 confirmé | Demande 3 pers. mêmes dates | ✅ Compatible, occupation 7/10 | CRITICAL | Unit |
| AVAIL-015 | R5 — trois séjours simultanés | Capacité 12, séjours de 4 et 3 | Demande 4 pers. | ✅ Compatible, 11/12 | HIGH | Unit |
| AVAIL-016 | R5 — cohabitation partielle | Séjour 08→11 de 6, capacité 10 | Demande 10→14 de 5 | ❌ le 10 seul dépasse (11/10) | CRITICAL | Unit |
| AVAIL-017 | R5 — cohabitation sans recouvrement | Séjour 08→10 | Demande 10→12 | ✅ Compatible, aucun chevauchement | HIGH | Unit |
| AVAIL-018 | R6 — événements qui se chevauchent | Événement 12/09 14h→22h | Nouvel événement 12/09 18h→23h | ❌ `EVENT_OVERLAP` | CRITICAL | Unit |
| AVAIL-019 | R6 — événements contigus | Événement 12/09 14h→18h | Nouvel événement 12/09 18h→22h | ✅ Compatible | MEDIUM | Unit |
| AVAIL-020 | R6 — événements sur deux jours distincts | Événement le 12 | Événement le 13 | ✅ Compatible | LOW | Unit |
| AVAIL-021 | R7 — séjour pendant un événement | Anniversaire le 12/09, capacité 15 | Demande 4 pers. 11→13 | ✅ **Compatible** — cas nominal D3 | CRITICAL | Unit |
| AVAIL-022 | R7 — séjour pendant un événement, capacité saturée | Événement avec 12 dormeurs, capacité 15 | Demande 5 pers. | ❌ `CAPACITY_EXCEEDED` — c'est R4 qui tranche, pas R7 | CRITICAL | Unit |
| AVAIL-023 | R7 — plusieurs séjours pendant un événement | Événement, séjours de 3 et 4, capacité 20 | Demande 5 pers. | ✅ Compatible | HIGH | Unit |
| AVAIL-024 | R8 — délégation à `POLICY` | Délai minimum 48 h | Demande pour demain | ❌ `MIN_LEAD_TIME` | HIGH | Unit |
| AVAIL-025 | R8 — plusieurs règles de politique | Durée max 7 nuits, horizon 180 j | Demande de 10 nuits dans 300 jours | ❌ `MAX_DURATION` **et** `MAX_ADVANCE` | HIGH | Unit |
| AVAIL-026 | Dates invalides | Départ avant arrivée | Demande | ❌ `INVALID_DATES` | HIGH | Unit |
| AVAIL-027 | **Combinaison** R1 + R4 | Blocage 11→13 et capacité saturée | Demande 10→12 | ❌ **Deux conflits renvoyés**, pas seulement le premier | CRITICAL | Unit |
| AVAIL-028 | **Combinaison** R2 + R4 | Séjour exclusif et capacité saturée | Demande | ❌ Les deux codes renvoyés | HIGH | Unit |
| AVAIL-029 | **Combinaison** R4 + R7 + dormeurs | Séjour de 4, événement avec 6 dormeurs, capacité 12 | Demande 3 pers. | ❌ `CAPACITY_EXCEEDED` — 13/12 | CRITICAL | Unit |
| AVAIL-030 | **Combinaison** R5 + R7 | Séjour de 4, événement sans dormeur, capacité 12 | Demande 4 pers. | ✅ Compatible, 8/12 | HIGH | Unit |
| AVAIL-031 | **Combinaison** R3 + R7 | Événement prévu le 12 | Demande exclusive 11→13 | ❌ `EXCLUSIVE_REQUEST_CONFLICT` — on ne privatise pas pendant un événement | HIGH | Unit |
| AVAIL-032 | Ordre d'évaluation | Blocage + exclusivité + capacité simultanés | Demande | Les trois conflits listés, le plus grave en tête | HIGH | Unit |
| AVAIL-033 | Aucun conflit masqué | Configuration à 4 conflits | Demande | Les 4 sont renvoyés | HIGH | Unit |
| AVAIL-034 | Table de décision exhaustive | Matrice des combinaisons R1–R8 deux à deux | Exécution | Chaque case produit le verdict attendu | CRITICAL | Unit |

---

# MODULE `POLICY` — Règles de réservation

## 1. Objectif
Regrouper les règles configurables par Solenne, qui changent souvent et ne doivent pas obliger à retoucher le moteur.

## 2. Fonctionnalités
Durée maximale d'un séjour · délai minimum avant l'arrivée · horizon maximum de réservation · jours d'arrivée interdits · nombre maximum de personnes par demande · autorisation ou non de la cohabitation · niveau de confidentialité par défaut · règles applicables aux amis mais **jamais à Solenne**.

## 3. Données manipulées
`booking_settings`.

## 4. Règles métier
| # | Règle |
|---|---|
| POL-R1 | Les règles s'appliquent aux amis ; **Solenne n'y est jamais soumise** |
| POL-R2 | Une règle désactivée n'est pas évaluée |
| POL-R3 | Un changement de règle n'invalide pas les séjours déjà confirmés |
| POL-R4 | Un changement de règle **signale** les demandes en attente devenues incompatibles |
| POL-R5 | Le nombre maximum par demande ne peut pas dépasser la capacité de la maison |
| POL-R6 | Désactiver la cohabitation rend toutes les demandes implicitement exclusives |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Voir les règles applicables | ❌ | ✅ *(formulation simple)* | ✅ |
| Modifier les règles | ❌ | ❌ | ✅ |

## 6. Dépendances
`HOUSE`.

## 7. Cas nominaux
Solenne fixe 7 nuits maximum et 48 h de délai · un ami voit ces limites dans le formulaire avant de saisir.

## 8. Cas limites
Toutes les règles désactivées · valeurs à zéro · délai supérieur à l'horizon · maximum par demande supérieur à la capacité · règle modifiée avec des demandes en attente · Solenne demandant hors règles.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Réglages contradictoires rendant toute demande impossible | HIGH | `POLICY-009`, `POLICY-010` |
| Solenne bloquée par ses propres règles | MEDIUM | `POLICY-012` |
| Changement invalidant des séjours confirmés | HIGH | `POLICY-013` |

## 10. Critères d'acceptation
Les 16 tests passent · aucune combinaison de réglages ne peut rendre l'application inutilisable sans avertissement explicite.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| POLICY-001 | Durée maximale | Max 7 nuits | Demande de 10 nuits | ❌ `MAX_DURATION`, « Un séjour ne peut pas dépasser 7 nuits » | HIGH | Unit |
| POLICY-002 | Durée exactement au maximum | Max 7 nuits | Demande de 7 nuits | ✅ Compatible | HIGH | Unit |
| POLICY-003 | Délai minimum | 48 h | Demande pour dans 24 h | ❌ `MIN_LEAD_TIME` | HIGH | Unit |
| POLICY-004 | Délai exactement atteint | 48 h | Demande pour dans 48 h et 1 min | ✅ Compatible | MEDIUM | Unit |
| POLICY-005 | Horizon maximum | 180 jours | Demande dans 200 jours | ❌ `MAX_ADVANCE` | MEDIUM | Unit |
| POLICY-006 | Jour d'arrivée interdit | Arrivées interdites le lundi | Demande arrivant un lundi | ❌ `FORBIDDEN_WEEKDAY` | MEDIUM | Unit |
| POLICY-007 | Maximum par demande | Max 6 personnes | Demande de 8 | ❌ Refus, message explicite | HIGH | Unit |
| POLICY-008 | Règle désactivée | Durée maximale désactivée | Demande de 30 nuits | ✅ Compatible | MEDIUM | Unit |
| POLICY-009 | Réglages contradictoires | Délai min 200 j, horizon 180 j | Enregistrement | Refus, « Aucune demande ne serait possible » | HIGH | Integration |
| POLICY-010 | Toutes règles désactivées | Aucune règle active | Demande extrême | Seules R1→R7 s'appliquent | MEDIUM | Unit |
| POLICY-011 | Maximum supérieur à la capacité | Capacité 10, max par demande 15 | Enregistrement | Refus ou ramené à 10 avec message | MEDIUM | Integration |
| POLICY-012 | Solenne hors règles | Délai min 48 h | Séjour personnel pour demain | ✅ Autorisé — POL-R1 | MEDIUM | Integration |
| POLICY-013 | Séjours confirmés préservés | Séjour de 10 nuits confirmé | Passer le maximum à 7 | Le séjour reste valide | HIGH | Integration |
| POLICY-014 | Demandes en attente signalées | 3 demandes en attente | Durcissement d'une règle | Les demandes devenues incompatibles sont signalées à Solenne | HIGH | Integration |
| POLICY-015 | Cohabitation désactivée | `allowCoOccupancy = false` | Demande sur période occupée | ❌ `EXCLUSIVE_CONFLICT` — POL-R6 | HIGH | Unit |
| POLICY-S02 | Ami modifiant les règles | Session ami | Appel | Refus + audit | CRITICAL | Security |

---

# MODULE `STAYREQ` — Demande de séjour

## 1. Objectif
Permettre à un ami de demander la maison en trois étapes, en sachant immédiatement si ses dates sont possibles, et en comprenant que rien n'est acquis avant l'accord de Solenne.

## 2. Fonctionnalités
Assistant en 3 étapes (dates → participants → informations) · vérification de disponibilité en direct · **case « je souhaite privatiser la maison »** (D2) · acceptation des règles obligatoires · récapitulatif avec la mention « soumis à l'accord de Solenne » · consultation, modification et annulation de sa demande.

## 3. Données manipulées
`stay_requests`, `stay_guests`, `house_rules` (acceptation), en lecture `AVAIL`.

## 4. Règles métier
| # | Règle |
|---|---|
| SREQ-R1 | Une demande est créée en statut `PENDING` — **jamais confirmée automatiquement** |
| SREQ-R2 | Le demandeur est toujours l'utilisateur connecté ; il ne peut pas demander au nom d'un autre |
| SREQ-R3 | Les règles obligatoires doivent être acceptées avant l'envoi, avec horodatage |
| SREQ-R4 | Une demande incompatible peut être **envoyée quand même**, mais l'incompatibilité est affichée et transmise à Solenne |
| SREQ-R5 | Le demandeur peut modifier ou annuler sa demande tant qu'elle est `PENDING` |
| SREQ-R6 | Une demande traitée n'est plus modifiable |
| SREQ-R7 | Le nombre de personnes est ≥ 1 et cohérent avec les invités nommés |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Créer une demande | ❌ | ✅ | ✅ |
| Voir **sa** demande | ❌ | ✅ | ✅ |
| Voir la demande d'un autre | ❌ | ❌ | ✅ |
| Modifier ou annuler **sa** demande en attente | ❌ | ✅ | ✅ |
| Modifier la demande d'un autre | ❌ | ❌ | ❌ *(Solenne décide, elle ne réécrit pas)* |

**Interdit absolu :** créer une demande au nom d'un autre utilisateur.

## 6. Dépendances
`AVAIL`, `HOUSE` (règles), `PROFILE`.

## 7. Cas nominaux
Marc demande 4 personnes du 18 au 20 septembre, accepte les règles, envoie · il voit sa demande « En attente » sur son tableau de bord.

## 8. Cas limites
Dates passées · départ avant arrivée · séjour de 0 nuit · 0 personne · plus de personnes que la capacité · règles non acceptées · demande incompatible envoyée volontairement · double soumission · modification après décision.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Demande créée au nom d'un autre | CRITICAL | `STAYREQ-S04` |
| Double soumission créant deux demandes | HIGH | `STAYREQ-C06` |
| Ami croyant son séjour confirmé | HIGH | `STAYREQ-013` — mention obligatoire et testée |

## 10. Critères d'acceptation
Les 20 tests passent · aucune demande ne peut être auto-confirmée · la mention « soumis à l'accord de Solenne » est présente avant chaque envoi.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| STAYREQ-001 | Demande nominale | Session ami, dates libres | 4 pers., 18→20/09, règles acceptées | Demande créée en `PENDING`, notification à Solenne | CRITICAL | Integration |
| STAYREQ-002 | Statut initial | Demande créée | Lecture | `PENDING` — jamais `ACCEPTED` | CRITICAL | Integration |
| STAYREQ-003 | Dates passées | 10/01/2026 | Envoi | ❌ `PAST_DATES` | HIGH | Unit |
| STAYREQ-004 | Dates inversées | Départ avant arrivée | Envoi | ❌ `INVALID_DATES` | HIGH | Unit |
| STAYREQ-005 | Séjour de 0 nuit | Arrivée = départ | Envoi | ❌ message explicite | MEDIUM | Unit |
| STAYREQ-006 | Zéro personne | 0 adulte, 0 enfant | Envoi | ❌ « Au moins une personne » | MEDIUM | Unit |
| STAYREQ-007 | Cohérence des invités | 2 adultes déclarés, 4 noms saisis | Envoi | ❌ incohérence signalée | LOW | Unit |
| STAYREQ-008 | Règles non acceptées | Règles obligatoires non cochées | Envoi | ❌ Refus, case mise en évidence | HIGH | Integration |
| STAYREQ-009 | Acceptation horodatée | Règles cochées | Envoi | `rulesAcceptedAt` enregistré avec la version des règles | MEDIUM | Integration |
| STAYREQ-010 | Disponibilité en direct | Capacité 10, 8 occupés | Saisie de 4 personnes | Avertissement affiché avant l'envoi | HIGH | E2E |
| STAYREQ-011 | Envoi malgré incompatibilité | Demande incompatible | Envoi forcé | Acceptée en `PENDING`, marquée « incompatible » pour Solenne | MEDIUM | Integration |
| STAYREQ-012 | Demande exclusive | Case privatisation cochée | Envoi | `exclusive = true` enregistré et visible de Solenne | HIGH | Integration |
| STAYREQ-013 | Mention obligatoire | Écran de récapitulatif | Affichage | « Votre demande sera envoyée à Solenne et ne sera confirmée qu'après son accord. » | HIGH | E2E |
| STAYREQ-014 | Modification en attente | Demande `PENDING` | Passer de 4 à 5 personnes | Modifiée, Solenne notifiée | MEDIUM | Integration |
| STAYREQ-015 | Annulation par le demandeur | Demande `PENDING` | Annulation | Statut `CANCELLED`, Solenne notifiée | HIGH | Integration |
| STAYREQ-016 | Modification après décision | Demande `ACCEPTED` | Tentative de modification | ❌ Refus, message explicatif | HIGH | Integration |
| STAYREQ-017 | Consultation de ses demandes | 3 demandes de statuts différents | Consultation | Toutes visibles avec leur statut | MEDIUM | Integration |
| STAYREQ-018 | Affichage mobile de l'assistant | Session ami | Parcours en 320 px | Les 3 étapes utilisables au pouce | HIGH | Responsive |
| STAYREQ-C06 | Double soumission | Double clic sur « Envoyer » | Envoi | **Une seule demande créée** | HIGH | Concurrency |
| STAYREQ-S04 | Demande au nom d'un autre | `requesterId` d'un autre injecté | Envoi | Ignoré, demande créée au nom de l'appelant | CRITICAL | Security |

---

# MODULE `STAYDEC` — Décision ⚠️

## 1. Objectif
Donner à Solenne tous les éléments pour trancher, et garantir qu'aucune acceptation ne peut produire une situation impossible — même si deux décisions sont prises à la même seconde.

## 2. Fonctionnalités
File d'attente des demandes · écran de décision affichant **le verdict du moteur en clair** · acceptation avec message optionnel · refus avec motif · contre-proposition de dates · **revalidation systématique au moment de la décision** · transaction sérialisable · contrainte d'exclusion en base.

## 3. Données manipulées
`stay_requests`, `stays`, `notifications`, `audit_logs`.

## 4. Règles métier
| # | Règle |
|---|---|
| SDEC-R1 | Seule Solenne décide |
| SDEC-R2 | **Le moteur est rejoué au moment de la décision**, jamais au moment de la demande |
| SDEC-R3 | Une acceptation crée un `stay` confirmé dans la **même transaction** que le changement de statut |
| SDEC-R4 | Une demande devenue incompatible ne peut être acceptée qu'avec confirmation explicite et motivée |
| SDEC-R5 | Un refus exige un motif |
| SDEC-R6 | Une demande déjà traitée ne peut pas l'être une seconde fois |
| SDEC-R7 | Toute décision est journalisée et notifiée au demandeur |
| SDEC-R8 | Une contre-proposition remet la demande dans le camp du demandeur, sans la confirmer |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Voir la file d'attente | ❌ | ❌ | ✅ |
| Accepter, refuser, contre-proposer | ❌ | ❌ | ✅ |
| Accepter sa propre demande | — | ❌ | ✅ *(elle est l'arbitre)* |

**Interdit absolu :** un ami ne doit jamais pouvoir accepter une demande — cela lui donnerait un accès physique à la maison.

## 6. Dépendances
`STAYREQ`, `AVAIL`, `PERM`.

## 7. Cas nominaux
Solenne ouvre la demande de Marc, lit « ✅ Compatible — 4 personnes déjà prévues sur 12 », accepte avec un mot d'accueil · le séjour apparaît à l'agenda, Marc est notifié.

## 8. Cas limites
Demande devenue incompatible depuis sa création · deux acceptations simultanées · acceptation après un blocage posé entre-temps · refus sans motif · décision sur une demande déjà traitée · décision sur une demande annulée par le demandeur.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| **Deux acceptations simultanées créant une surcapacité** | CRITICAL | `STAYDEC-C01` — transaction + contrainte d'exclusion PostgreSQL |
| Acceptation d'une demande devenue impossible | CRITICAL | `STAYDEC-005`, `STAYDEC-006` |
| Un ami acceptant une demande | CRITICAL | `STAYDEC-S02`, `STAYDEC-S06` |

## 10. Critères d'acceptation
Les 18 tests passent · **grille C1→C6 au vert** · aucune surcapacité possible, y compris sous accès concurrent · chaque décision produit une notification et une entrée d'audit.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| STAYDEC-001 | Acceptation nominale | Demande compatible | Acceptation | Statut `ACCEPTED`, `stay` créé, agenda à jour, demandeur notifié, audit écrit | CRITICAL | Integration |
| STAYDEC-002 | Verdict affiché | Demande de 4 pers., 4 déjà prévues, capacité 12 | Ouverture de l'écran | « ✅ Compatible — 8 personnes sur 12 » | HIGH | Integration |
| STAYDEC-003 | Verdict d'incompatibilité | Demande dépassant la capacité | Ouverture | « ⚠️ Capacité dépassée : 14 pour 12 places », détail des séjours en cause | HIGH | Integration |
| STAYDEC-004 | Refus motivé | Demande en attente | Refus + motif | Statut `REJECTED`, motif transmis, audit écrit | HIGH | Integration |
| STAYDEC-005 | Demande devenue incompatible | Demande compatible à sa création, blocage posé depuis | Ouverture puis acceptation | Incompatibilité signalée ; acceptation exige une confirmation explicite | CRITICAL | Integration |
| STAYDEC-006 | Revalidation au moment de la décision | Demande de 3 semaines, capacité réduite depuis | Acceptation | Le moteur est rejoué avec les valeurs **actuelles** | CRITICAL | Integration |
| STAYDEC-007 | Refus sans motif | Demande en attente | Refus, champ vide | ❌ Refus, motif obligatoire | MEDIUM | Unit |
| STAYDEC-008 | Contre-proposition | Demande 18→20 | Proposer 19→21 | Demande en `PENDING` côté demandeur, notifié, non confirmée | MEDIUM | Integration |
| STAYDEC-009 | Demande déjà traitée | Demande `ACCEPTED` | Nouvelle acceptation | ❌ « Cette demande a déjà été traitée » | HIGH | Integration |
| STAYDEC-010 | Demande annulée par le demandeur | Demande `CANCELLED` | Acceptation | ❌ Refus, message explicatif | HIGH | Integration |
| STAYDEC-011 | Transaction atomique | Erreur simulée après création du `stay` | Acceptation | Aucun état partiel : ni séjour orphelin, ni statut incohérent | CRITICAL | Integration |
| STAYDEC-012 | Notification au demandeur | Acceptation | Vérification | Notification interne + email, sans donnée d'autrui | HIGH | Integration |
| STAYDEC-013 | File d'attente ordonnée | 5 demandes | Consultation | Les plus anciennes et les plus urgentes en tête | LOW | Integration |
| STAYDEC-014 | Séjour exclusif accepté | Demande exclusive compatible | Acceptation | `stay` exclusif créé ; toute demande ultérieure sur ces dates est refusée | CRITICAL | Integration |
| STAYDEC-C01 | **Deux acceptations simultanées** | Deux demandes de 6 pers., capacité 10, mêmes dates | Acceptation en parallèle | **Une seule réussit** ; l'autre reçoit `CAPACITY_EXCEEDED`. Occupation finale ≤ 10 | CRITICAL | Concurrency |
| STAYDEC-C05 | Blocage concurrent | Acceptation en cours, blocage posé simultanément | Exécution parallèle | Ordre déterministe, aucun état incohérent | HIGH | Concurrency |
| STAYDEC-S02 | Ami acceptant une demande | Session ami | Appel | Refus + audit | CRITICAL | Security |
| STAYDEC-S06 | Appel direct de l'acceptation | Requête forgée par un ami | Appel | Garde déclenchée, aucun séjour créé | CRITICAL | Security |

---

# MODULE `STAY` — Séjours confirmés

## 1. Objectif
Gérer la vie d'un séjour une fois accepté : sa présence à l'agenda, son annulation éventuelle, sa clôture.

## 2. Fonctionnalités
Consultation d'un séjour · séjours personnels de Solenne créés directement, sans demande · annulation par le demandeur · annulation par Solenne avec motif · libération de la capacité · passage automatique en `COMPLETED` après la date de départ.

## 3. Données manipulées
`stays`, `stay_guests`, `notifications`.

## 4. Règles métier
| # | Règle |
|---|---|
| STAY-R1 | Un séjour de Solenne se crée sans demande (`requestId = null`, `isOwnerStay = true`) |
| STAY-R2 | Une annulation libère immédiatement la capacité |
| STAY-R3 | Une annulation par Solenne exige un motif et notifie l'intéressé |
| STAY-R4 | Un séjour annulé reste dans l'historique |
| STAY-R5 | Le passage en `COMPLETED` est automatique après la date de départ |
| STAY-R6 | Un séjour passé n'est plus annulable |

## 5. Permissions
| | Visiteur | Ami | Solenne |
|---|---|---|---|
| Voir **son** séjour | ❌ | ✅ | ✅ |
| Voir le séjour d'un autre | ❌ | ❌ *(« Maison occupée »)* | ✅ |
| Annuler **son** séjour | ❌ | ✅ | ✅ |
| Annuler le séjour d'un autre | ❌ | ❌ | ✅ *(avec motif)* |
| Créer un séjour directement | ❌ | ❌ | ✅ |

## 6. Dépendances
`STAYDEC`, `CAL`.

## 7. Cas nominaux
Le séjour de Marc apparaît à l'agenda · Marc annule, la capacité se libère · un séjour passé bascule en terminé.

## 8. Cas limites
Annulation la veille · annulation d'un séjour en cours · annulation d'un séjour passé · séjour de Solenne chevauchant un séjour d'ami · annulation libérant des dates pour une demande précédemment refusée.

## 9. Risques
| Risque | Gravité | Parade |
|---|---|---|
| Capacité non libérée après annulation | HIGH | `STAY-004`, `OCCUP-025` |
| Annulation silencieuse par Solenne | MEDIUM | `STAY-006` |

## 10. Critères d'acceptation
Les 10 tests passent · toute annulation libère la capacité dans la même transaction · aucun séjour annulé ne compte dans l'occupation.

## 11. Cas de test

| ID | Objectif | Préconditions & entrées | Étapes | Résultat attendu | C | T |
|---|---|---|---|---|---|---|
| STAY-001 | Séjour à l'agenda | Séjour confirmé 18→20/09 | Consultation | Présent aux bonnes dates, bonne couleur | CRITICAL | Integration |
| STAY-002 | Séjour personnel de Solenne | Session admin | Création directe 05→07/10 | Créé sans demande, `isOwnerStay = true` | HIGH | Integration |
| STAY-003 | Annulation par le demandeur | Séjour confirmé à venir | Annulation | Statut `CANCELLED`, Solenne notifiée | HIGH | Integration |
| STAY-004 | Capacité libérée | Capacité 10, séjour de 8 annulé | Occupation après annulation | 0 ; une demande de 8 redevient compatible | CRITICAL | Integration |
| STAY-005 | Annulation par Solenne | Séjour d'un ami | Annulation + motif | Statut `CANCELLED`, motif transmis, ami notifié, audit écrit | HIGH | Integration |
| STAY-006 | Motif obligatoire | Annulation par Solenne | Motif vide | ❌ Refus | MEDIUM | Unit |
| STAY-007 | Séjour passé non annulable | Séjour terminé | Annulation | ❌ Refus, message explicatif | MEDIUM | Integration |
| STAY-008 | Clôture automatique | Séjour dont le départ est hier | Traitement quotidien | Statut `COMPLETED` | MEDIUM | Integration |
| STAY-009 | Historique conservé | Séjour annulé | Consultation de l'historique | Visible avec son statut et son motif | MEDIUM | Integration |
| STAY-010 | Suggestion après libération | Demande refusée pour capacité, séjour annulé depuis | Tableau de bord de Solenne | Suggestion « Ces dates se libèrent, prévenir Jean ? » | LOW | Integration |
