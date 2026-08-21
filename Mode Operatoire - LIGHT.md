# Mode Opératoire — version lisible

**La Maison de Solenne** · 21 août 2026 · à valider avant le démarrage

> Ce document dit **comment** l'application va être construite, testée et validée.
> Il est écrit sans vocabulaire technique. La version complète (`Mode Operatoire.md` et le dossier `Mode Operatoire - Detail/`) contient les 32 fiches et les 567 tests détaillés — vous n'avez pas besoin de la lire pour valider.

---

## 1. Le principe de départ

Vous n'êtes pas développeur, et vous ne devez jamais avoir à l'être.

**Ce que je prends en charge, sans jamais vous solliciter :** tout ce qui est technique. Les erreurs, les tests qui échouent, les corrections, la sécurité, la base de données, la mise en ligne. Si quelque chose casse, je cherche pourquoi, je répare, je relance les vérifications. Vous ne verrez jamais un message du type « peux-tu corriger cette erreur ? ».

**Ce qui reste chez vous — trois choses, aucune technique :**

| | Quoi | Quand |
|---|---|---|
| 1 | Acheter `chezsolenne.fr` et créer les comptes d'hébergement (il faut vos identifiants et votre carte) | ~1 h, avant la mise en ligne |
| 2 | **Dire si c'est beau.** Je peux vérifier que tout s'affiche bien sur téléphone ; je ne peux pas juger à votre place si ça donne envie d'aller chez Solenne — et c'est votre critère n°1 | à chaque fin d'étape |
| 3 | Fournir les photos de la maison, la description des chambres et bureaux, les règles rédigées par Solenne | pendant les deux premières étapes |

**Quand je vous poserai une question :** uniquement pour une décision qui vous appartient. Par exemple : « un ami peut-il annuler son séjour la veille, ou faut-il l'accord de Solenne ? ». Jamais pour un problème technique.

---

## 2. Le projet découpé en 32 morceaux

Le travail est découpé en **32 modules**, regroupés en 8 étapes. Chaque module est une brique autonome qu'on peut vérifier seule, avant de passer à la suivante.

| Étape | Ce qu'on construit | Modules |
|---|---|---|
| **0. Fondations** | Le squelette technique, les couleurs, la navigation | 3 |
| **1. Identité** | Invitations, création de compte, connexion, profils, permissions | 6 |
| **2. Maison & Agenda** | La maison, les chambres, les règles, le calendrier, la confidentialité | 5 |
| **3. Séjours ★** | Le cœur : demander, valider, calculer qui peut venir | 6 |
| **4. Événements** | Créer un événement, répondre, dormir sur place | 3 |
| **5. Vie de l'événement** | Qui apporte quoi, fil de discussion | 2 |
| **6. Notifications** | Alertes dans l'application, emails, rappels | 3 |
| **7. Finition** | Accueil, historique, expérience mobile, mise en ligne | 4 |

**À la fin de l'étape 3, l'application est déjà utilisable pour de vrai** : Solenne invite ses amis, publie son calendrier, reçoit et valide de vraies demandes de séjour.

---

## 3. Vous m'avez demandé d'être mon propre critique — voici ce que j'ai changé

Mon premier découpage comptait 33 modules. Après relecture critique, il était **mal équilibré**. Le nombre final change à peine (32), mais la forme change beaucoup.

**Cinq morceaux ne méritaient pas d'exister seuls** et ont été absorbés : les données de démonstration, les règles de la maison, le programme des activités, les préférences de notification, et le journal de traçabilité.

**Le plus grave était le journal de traçabilité.** Je l'avais placé à l'étape 7, tout à la fin. C'était une erreur : on n'ajoute pas la traçabilité après coup sur trente modules déjà écrits — on obtient un journal troué. Il descend à l'étape 1, où il devient une obligation dès la première ligne.

**Quatre morceaux en cachaient plusieurs** et ont été éclatés. Le plus important : le moteur de disponibilité mélangeait trois choses différentes — *combien de personnes sont là*, *est-ce que c'est compatible*, et *qu'est-ce que Solenne autorise*. Trois choses qui ne changent pas au même rythme. Les garder ensemble était précisément ce qui rendait dangereuse la fonctionnalité « je dors sur place ».

---

## 4. Le problème que j'avais signalé, et comment je le règle

**Le problème.** « Je dors sur place » arrive à l'étape 4. Or cette fonctionnalité change la façon de compter les gens présents dans la maison — un calcul écrit et validé à l'étape 3. C'est le scénario classique de la panne invisible : toutes les vérifications de l'étape 3 continuent de passer, parce qu'elles testent l'ancienne façon de compter. Et un samedi soir, la maison se retrouve avec plus de monde qu'elle ne peut en accueillir.

**La solution : je supprime le changement au lieu de le surveiller.**

Le comptage des personnes devient une brique à part, avec un **registre des sources d'occupation** :

| Source | Prévue dès l'étape 3 ? | Active |
|---|---|---|
| Les séjours confirmés | oui | **dès l'étape 3** |
| Les gens qui dorment lors d'un événement | **oui, prévue et testée** | activée à l'étape 4 |
| L'attribution des chambres (plus tard) | oui | plus tard |

Les trois sources sont **déclarées dès l'étape 3**. Celle des dormeurs existe, elle est testée, et elle renvoie zéro tant que l'étape 4 n'existe pas.

**Résultat : l'étape 4 n'écrit aucun nouveau calcul.** Elle allume un interrupteur déjà en place. Le comptage n'est jamais réécrit.

Quatre garde-fous complètent le dispositif. Le plus utile est un test que j'appelle la **sentinelle** : il compare automatiquement le total au registre des sources. Si quelqu'un ajoute un jour une nouvelle source d'occupation en oubliant de la compter, ce test échoue tout seul — sans qu'on ait eu besoin d'y penser.

Le coût : un peu plus de structure à l'étape 3. Le gain : l'étape 4 devient banale au lieu d'être une opération à cœur ouvert.

---

## 5. Comment chaque morceau est vérifié

Pour chaque module, dans cet ordre :

```
1. J'écris ce que le module doit faire, ses règles, ses cas particuliers, ses dangers
2. J'écris la liste des tests           ← AVANT d'écrire le code
3. Je lance les tests : ils échouent (normal, le code n'existe pas)
4. J'écris le code jusqu'à ce que tout passe au vert
5. J'attaque le module (12 tentatives d'intrusion systématiques)
6. Je relance TOUS les tests des modules précédents
7. Je vérifie sur téléphone, tablette et ordinateur
8. Je vous remets un rapport
```

**Sur le point 2 — un écart que je veux vous signaler franchement.** Vous demandiez les tests avant le code partout. Je l'applique strictement pour tout ce qui porte un risque : les règles métier, les permissions, le calcul des places, la sécurité. Pour les écrans, vous aurez les cas de test et les critères avant le code, mais leur version automatisée est finalisée juste après l'écran — un test écrit contre un écran qui n'existe pas encore est réécrit trois fois et finit par tester ses propres suppositions. **Vous avez validé ce point le 21 août.**

---

## 6. La sécurité : 12 attaques sur chaque fonctionnalité sensible

Le principe : *une fonctionnalité n'est pas sécurisée parce qu'elle marche ; elle l'est quand on l'a attaquée et qu'elle a tenu*.

Douze tentatives d'intrusion sont menées systématiquement, partout :

1. Accéder sans être connecté
2. Accéder avec un compte ami à une fonction réservée à Solenne
3. Lire une donnée qui appartient à quelqu'un d'autre
4. Modifier une donnée qui appartient à quelqu'un d'autre
5. Forcer un bouton masqué
6. Contourner l'interface et attaquer le serveur directement
7. Trafiquer les valeurs envoyées (son rôle, son statut, des dates)
8. Deviner une adresse de page privée
9. **Vérifier que le serveur n'envoie pas la donnée privée au téléphone** — même masquée à l'écran
10. Utiliser une session expirée ou un compte désactivé
11. Utiliser un lien d'invitation expiré, déjà utilisé ou falsifié
12. Bombarder la connexion pour deviner un mot de passe

**Le point 9 mérite une explication.** Beaucoup d'applications masquent l'information à l'écran mais l'envoient quand même au téléphone — n'importe qui sachant regarder peut la lire. Ici, je vérifie ce que le serveur envoie réellement, pas ce qui s'affiche. C'est ce qui fait la différence entre une vraie confidentialité et une façade.

Les cibles prioritaires, dans l'ordre : les permissions, la confidentialité (« Maison occupée »), les invitations et la connexion, la validation des séjours (accepter une demande, c'est donner un accès physique à la maison), et la gestion des utilisateurs.

**Une limite honnête :** cette démarche couvre les failles de l'application. Elle ne remplace pas un test d'intrusion professionnel. Pour une application privée d'une trentaine de personnes sans paiement, c'est proportionné — mais je préfère l'écrire.

---

## 7. Une deuxième grille : ce qui arrive quand deux personnes cliquent en même temps

J'ai ajouté une grille que je n'avais pas prévue. Six situations où deux personnes agissent à la même seconde :

1. Solenne accepte deux demandes incompatibles en même temps
2. Deux amis cliquent sur le **dernier créneau** de « je m'en charge »
3. Deux amis prennent la **dernière place** d'un événement
4. Un lien d'invitation est activé deux fois
5. Une date est bloquée pendant qu'une acceptation est en cours
6. Quelqu'un double-clique sur « Envoyer »

Dans les six cas, une seule action passe, l'autre reçoit un message clair. Trois protections superposées, dont une posée dans la base de données elle-même : **elle refuse physiquement** deux séjours exclusifs sur les mêmes dates, même si tout le reste échouait.

---

## 8. Rien ne doit jamais casser ce qui marchait

Règle absolue : **à la fin de chaque module, tous les tests de tous les modules précédents sont relancés.** Un module n'est jamais déclaré terminé si quelque chose d'antérieur est passé au rouge.

Six situations sont identifiées à l'avance comme dangereuses, avec la liste de ce qu'il faut re-vérifier à chaque fois. La première est justement « je dors sur place ».

Si quelque chose casse : j'arrête tout, je cherche la cause, je répare, **j'ajoute un test qui reproduit exactement la panne** pour qu'elle ne puisse pas revenir, et je relance tout.

---

## 9. Les 23 parcours vérifiés de bout en bout

Vos 18 parcours sont repris tels quels et automatisés sur un vrai navigateur, **en version ordinateur et en version téléphone**.

**Les 5 que j'ai proposé d'ajouter, et que vous avez validés :**

| | Parcours | Pourquoi il manquait |
|---|---|---|
| 19 | Un séjour **privatisé** est accepté, puis une autre demande est refusée | La privatisation n'était couverte par aucun de vos 18 parcours |
| 20 | Un ami consulte l'agenda et ne voit que **« Maison occupée »** — vérifié sur ce que le serveur envoie | C'est la promesse centrale du produit |
| 21 | Deux amis cliquent sur le **dernier créneau** en même temps | Le cas de simultanéité côté événement |
| 22 | **Parcours complet au pouce sur téléphone**, de la connexion à la demande de séjour | L'usage réel sera à 90 % sur téléphone |
| 23 | Mot de passe oublié → réinitialisation → reconnexion | Parcours de secours vital, jamais testé |

---

## 10. Quand est-ce qu'un morceau est « terminé » ?

**« Le code marche » ne suffit jamais.** Un module n'est validé que si les 10 conditions sont réunies :

1. Toutes les fonctionnalités prévues sont là
2. Les règles sont respectées
3. 100 % de ses tests passent
4. Ses cas particuliers sont testés
5. Ses permissions sont testées, avec les 12 attaques
6. Tous les tests précédents sont toujours au vert
7. Le comportement sur téléphone est vérifié
8. Aucune erreur grave connue
9. Les messages d'erreur sont en français clair
10. Vous avez reçu le rapport

Si une seule condition manque, le module est **non validé**, avec la raison écrite noir sur blanc.

**Le rapport que vous recevrez à chaque fois :**

```
MODULE : Nom
Statut : ✅ VALIDÉ ou ❌ NON VALIDÉ
Ce qui a été fait
Tests prévus / réussis / échoués / corrigés / restants
Problèmes rencontrés · Corrections faites
Impact sur les autres modules
Décisions que je vous demande de confirmer
```

Et un **tableau de bord** en tête du document principal vous dit à tout moment où on en est, sans avoir à lire une ligne de code.

---

## 11. Avant la mise en ligne : 15 vérifications obligatoires

Tests unitaires · tests d'intégration · 23 parcours complets · tests de sécurité · tests de simultanéité · tests de non-régression · affichage sur 3 tailles d'écran · construction de la version finale · migrations de base vérifiées · configuration complète · aucune erreur grave · journaux propres · **sauvegarde configurée ET restauration réellement testée** · documentation à jour · **votre validation visuelle**.

Sur la sauvegarde : je ne me contenterai pas de la configurer. Je restaurerai réellement une sauvegarde au moins une fois pour vérifier qu'elle fonctionne. Une sauvegarde jamais testée n'est pas une sauvegarde.

**Le critère de mise en ligne :** aucune erreur grave connue et non corrigée. S'il reste un problème mineur, il sera **listé explicitement**, avec la raison pour laquelle il n'est pas corrigé et quand il le sera. Je ne masquerai jamais un problème connu pour tenir une date.

---

## 12. Ce que je vous demande maintenant

Votre feu vert sur cette méthode.

Trois points, si vous voulez y regarder de près :

1. **Le découpage en 32 modules** — j'ai fait l'avocat du diable comme demandé, et j'ai listé au §3.3 du document complet les quatre découpages que j'ai remis en question **sans les changer**, avec mes raisons. Si l'un d'eux vous semble mal tranché, dites-le.
2. **Le traitement du problème « je dors sur place »** (§4 ci-dessus) — c'est la décision d'architecture la plus importante de ce document.
3. **Les 5 parcours ajoutés** — déjà validés, ils sont intégrés.

Dès votre accord, je démarre l'**étape 0 (Fondations)** puis l'**étape 1 (Identité)**, en local, sans avoir besoin d'aucun compte de votre part. Vous pourrez voir l'application tourner et juger le rendu visuel avant qu'on achète quoi que ce soit.

En parallèle, deux choses de votre côté feraient gagner le plus de temps : **acheter `chezsolenne.fr`** (la validation de l'envoi d'emails est le seul délai vraiment incompressible) et **rassembler les photos de la maison**.

---

*Documents du projet : `01_DemandeInitiale.txt` (le besoin) · `02_Analyse_Architecture.md` (l'architecture) · `03_Instructions avant les développements.txt` (vos exigences de méthode) · `Mode Operatoire.md` (la référence complète) · `Mode Operatoire - Detail/` (les 32 fiches et 567 tests) · **ce document** (la version lisible).*
