<!-- source: 3b04df871946 -->
# Direction : qui est dans la scène

Direction est conçue pour les discussions de groupe. Après chaque réponse, un petit modèle « directeur » peu coûteux lit la scène et indique de quel type de scène il s'agit (une leçon, une pause, un moment seul, un rendez-vous) et quels membres y participent. Les membres qui ne sont pas présents cessent de répondre et sont exclus du prompt jusqu'à ce que l'histoire les ramène.

## La barre

Dans une discussion de groupe, une fine barre se trouve sous la barre des membres, marquée « Direction » (sur un téléphone, seule l'icône apparaît). De gauche à droite :

- **Le chip de scène** : le type de scène et qui est présent (« Moment seul, avec Yuzu » ou « Leçon, 4 ici »). Tapez dessus pour voir qui est présent et qui ne l'est pas dans la scène, la date du dernier rapport, et un bouton **Report now** qui interroge à nouveau le directeur. Pendant que le directeur lit, le chip affiche « Lecture de la scène… ».
- **Le chip de modèle** : le modèle du directeur. Si aucun n'est sélectionné, il affiche **Pick a model**. Tapez dessus pour obtenir la même liste de modèles que la barre supérieure de la discussion : modèles favoris, puis tous les modèles par connexion, avec une zone de recherche.
- **L'interrupteur** : Direction activée ou désactivée pour cette discussion. Tant qu'aucun modèle n'est sélectionné, il est grisé et indique « Choisissez d'abord un modèle ».
- **Log** : les derniers rapports (type de scène, qui était présent, durée, nombre de tokens), ainsi que chaque activation, verrouillage, libération et erreur, du plus récent au plus ancien.

Avec l'interrupteur désactivé, la barre se réduit à « Direction : désactivée » et la discussion fonctionne comme avant.

## Choisir le modèle

Il y a un seul modèle directeur pour toutes les discussions et tous les groupes. Choisissez-le depuis n'importe quelle barre, ou depuis l'onglet **Direction** du groupe. Il n'y a pas de valeur par défaut : c'est vous qui choisissez. Un petit modèle rapide suffit : il coûte un court appel après chaque réponse.

Une nouvelle discussion de groupe démarre avec Direction activée dès qu'un modèle est sélectionné. Les discussions que vous aviez déjà ne sont pas modifiées. Chaque discussion a son propre interrupteur.

## Qui est absent

Le chip d'un membre change lorsque quelqu'un est hors de la scène : l'image est atténuée et porte une petite marque de porte. Une marque de verrou signifie que le verrou (ci-dessous) l'a exclu. Tapez sur un chip : sa popover indique « Présent » ou « Pas dans la scène ».

Un membre absent ne prend pas son tour tout seul, et sa fiche n'est pas envoyée au modèle : une seule ligne indique qu'il n'est pas dans la scène. Le nommer dans votre message le rappelle tout de même. Lorsque le directeur le voit revenir, sa fiche complète réapparaît.

## Le verrou et le retour

Pour garder une scène avec une seule personne, tapez sur un chip de membre et choisissez **Only <name> in the scene**. Un chip « Seulement Yuzu » apparaît avant le chip de scène, et les autres restent exclus quoi que dise le directeur. Tapez sur le x de ce chip, ou sur **Release the lock** dans la popover d'un membre, pour libérer. À la prochaine réponse, les autres sont informés qu'ils peuvent revenir et l'histoire est invitée à leur donner un moyen d'entrer.

## Si le directeur échoue

Si la réponse du directeur ne peut pas être lue, ou si l'appel échoue, le chip de scène indique **No report** ; ouvrez-le pour voir pourquoi. La discussion utilise alors l'idée du tableau de bord sur qui est présent, ou laisse tout le monde répondre comme avant. Rien dans votre histoire n'est perdu.

## Nouveaux groupes

**New group** ouvre une large fenêtre (plein écran sur un téléphone). Nommez le groupe, ou laissez le nom vide pour utiliser les trois premiers membres. Recherchez, filtrez avec **All**, **Favourites** et **Recent**, des chips de tags et un tri (Nom, Récemment utilisé, Plus de discussions), et tapez sur les portraits pour choisir. Les membres choisis s'alignent en haut dans l'ordre de parole ; les flèches déplacent un membre plus tôt ou plus tard, le x le supprime. **Next** nécessite deux personnages.

Après **Next**, le groupe est créé et son éditeur s'ouvre avec une note : vérifiez comment il fonctionne, puis démarrez la première discussion. **Start chat** est le bouton principal. L'onglet **Direction** détermine si les nouvelles discussions de ce groupe démarrent avec Direction activée, et affiche le modèle du directeur. Un groupe sur la page Groupes ouvre le même éditeur, tout comme le nom du groupe en haut de sa discussion.

Lorsque vous démarrez une discussion ultérieure d'un groupe, l'étape courte avant la discussion comporte un interrupteur **Direction** : activé lorsque la valeur par défaut du groupe est activée et qu'un modèle est sélectionné.

Voir aussi [[characters]] et [[dashboard]].