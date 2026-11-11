<!-- source: f156e3f1ac93 -->
# World DM

Le World DM est un maître de jeu pour le monde d'une discussion. Après les réponses, il lit l'histoire et garde les personnes, lieux et choses qu'il rencontre dans le livre de connaissances propre à la discussion, appelé livre du monde. Aux niveaux plus élevés, il fait aussi bouger le monde et envoie des événements dans la scène. Utilisez-le quand vous voulez que le monde semble vivant et cohérent.

## Niveaux

Ouvrez-le depuis l'en-tête de discussion « World » (sur un téléphone, Menu, puis World), ou depuis la section **World** du rail. Choisissez ce que fait le DM :

- **Off** : aucun événement ni dé. Le livre du monde se remplit quand même depuis l'histoire : quand la scène nomme un nouveau lieu ou une nouvelle chose, un petit appel demande au modèle DM s'il faut le consigner.
- **Chronicler** : ne fait que consigner, et n'ajoute aucun événement de son cru.
- **Living world** : factions et menaces bougent hors champ. Des nouvelles peuvent atteindre les personnages comme une rumeur ; rien n'est forcé.
- **Director** : amène des accroches, complications et visiteurs dans la scène, et la réponse suivante doit les utiliser.
- **Antagonist** : conséquences et pression dirigées vers ce qui importe aux personnages.
- **Total chaos** : tout peut arriver, quel que soit le genre. Il ne réécrit jamais l'histoire et attend la fin des scènes explicites.

Par défaut, le DM est déjà actif au niveau Chronicler dans une discussion d'histoire, dès sa première réponse (pas pour une discussion dont toutes les cartes sont des assistants). Désactivez-le dans l'onglet Overview de la feuille Monde si vous n'en voulez pas.

## Ce qu'il fait à chaque tour

Il s'exécute après les réponses, toutes les N réponses (« Run after every N replies »), ou tout de suite avec « World turn ». Il lit les nouveaux messages et écrit ou retire des entrées dans le livre du monde : personnes, lieux, choses et qui les détient. Vous pouvez donner à un enregistrement de type Group ou Place des **Members** (les personnes qui en font partie) dans l'onglet World book ; un fait raconté à ce groupe dans Litopys est alors connu de chacun d'eux ([[litopys]]). Le DM ne remplit pas Members lui-même. À partir de Living world, il fait aussi avancer les fronts et les horloges, et peut préparer un événement ajouté à la réponse suivante. Avec **Code** qui fait avancer les horloges (World > Profiles > Options), toutes les N réponses le code lance un d6 pour chaque front : 1-2 rien, 3-4 un pas, 5-6 un pas, et le DM est informé que des nouvelles de ce front peuvent atteindre l'histoire. Dés optionnels (feuille Monde, Dice, à partir de Living world, désactivés par défaut) : avant une réponse, le code lance 2d6 et dit au modèle comment une action incertaine se termine, comme Hint ou Binding. L'option **Pacing check, %** (Dice details, désactivée par défaut) ajoute un second jet caché pour les moments où le personnage de l'utilisateur fait un pas vers la proximité : le résultat dépend du confort, de la confiance et de l'affection du personnage, visibles dans le Dashboard, et le modèle le joue comme pas prêt, hésitant, accepté avec nervosité, ou accueillant. Il ne bloque jamais une réponse et ne nomme jamais les dés.

Il coûte un appel de modèle supplémentaire à chaque échéance, sur le « DM model (all chats) » ; un petit modèle bon marché suffit. Un échec est montré dans la feuille et dans la Inbox, et le DM relit les mêmes messages la fois suivante.

Un profil qui joue à partir d'une pioche d'événements affiche « New deck » quand la pioche est épuisée. On demande au modèle de 8 à 12 événements ; s'il en revient moins, la pioche est conservée telle qu'elle est arrivée et un avertissement indique qu'elle est revenue trop courte, pour que vous puissiez la reconstruire.

## Suppression ou balayage d'une réponse

Supprimez une réponse, ou balayez vers une autre, et le DM reprend ce qu'il avait appris de l'ancienne : enregistrements, horloges et événement en attente reviennent à leur état antérieur, le livre du monde est réécrit, et le DM relit l'histoire à partir de là.

Les enregistrements que vous avez modifiés à la main restent, sauf si le DM a changé le même enregistrement ensuite. Un enregistrement que vous avez supprimé reste supprimé. Supprimer d'anciens messages en tête, lire d'autres balayages d'une ancienne réponse et modifier le texte d'une réponse ne reprennent rien.

## Onglets de la section Monde

L'engrenage à côté du titre de la liste World ouvre **World settings**, en blocs repliables comme les Litopys settings : le modèle de jeu (avec un interrupteur pour le remplacer pour ce Monde, la limite de réponses et un bouton de test), le modèle de construction, le modèle d'image, l'interrupteur des arrière-plans et si vous êtes prévenu des échecs. Un bloc replié affiche en une ligne ce qui y est réglé.

Sur la discussion choisie : Overview (les mêmes commandes que la feuille), Places (un arbre des lieux, avec une image d'arrière-plan par lieu), World book (lire, écrire, retirer ou supprimer des entrées à la main), Runs (historique, jetons, erreurs), Start (ébauche d'entrées depuis les cartes ou un court entretien), Backgrounds (planifier et dessiner un ensemble d'images ; avec « Change the background by scene » activé, le Dashboard choisit celle qui convient ; avec « Draw places that have no picture » aussi activé (il est toujours listé là, grisé tant que le changement de scène et la génération d'images ne sont pas activés), un lieu vers lequel l'histoire se déplace et qui n'a pas d'image est dessiné sur-le-champ par le modèle d'image du Monde et rangé dans le dossier ; « Look of the pictures » y prend quelques mots en anglais (par exemple `medieval fantasy, candlelight`), ajoutés à chaque arrière-plan dessiné pour la discussion, lieu dessiné sur-le-champ ou ensemble ; la feuille Display de la discussion y mène par un lien). Aussi **Profiles** et **Worlds**.

## Profils de monde

Chaque niveau est un profil intégré : les cinq contiennent les requêtes du DM, et vous pouvez en ouvrir un, changer un bloc de requête et le remettre au défaut. Vous pouvez aussi créer vos propres profils par-dessus un niveau. Une discussion choisit son profil dans la feuille DM. « Saved worlds » contient les mondes que vous avez construits et dans lesquels vous commencez de nouvelles discussions ; « New world » en construit un avant toute discussion, depuis des cartes ou un court entretien.

Liés : [[memory]], [[dashboard]]. Les articles d'aide *World profiles* et *Starting a world* présentent les écrans.
