<!-- source: f7c0805c5597 -->
# Votre première histoire

Voici le chemin le plus court d'un Roleplay vide à une histoire qui tourne, et une liste de ce qui se passe tout seul pour que rien ne vous surprenne. Il vous faut d'abord une connexion à un modèle : voir [[vertep:models]].

## Étapes

1. **Obtenez une carte.** Sur Home, appuyez sur « New character » et écrivez-en un, ou « Import card » pour importer un fichier PNG ou JSON depuis un fichier. Vous pouvez aussi chercher dans la section Marché, ou appuyer sur « With Molfar » pour que Molfar rédige une carte à partir de votre idée. Voir [[characters]].
2. **Enregistrez-la.** L'éditeur de carte garde les modifications dans un brouillon jusqu'à ce que vous appuyiez sur « Save changes ».
3. **Choisissez un persona** (qui vous jouez) dans la section Personas, ou gardez celui par défaut. « Use this persona » en fait votre persona par défaut.
4. **Commencez une discussion.** Appuyez sur « New chat » sur la carte. La discussion s'ouvre avec le premier message de la carte.
5. **Vérifiez le modèle.** La pastille dans l'en-tête de la discussion a un onglet Model ; y choisir un modèle ne change que cette discussion.
6. **Écrivez.** Sous chaque réponse, vous pouvez feuilleter d'autres versions (balayages) ; la flèche droite sur la dernière version en demande une nouvelle. Pour refaire une réponse avec une direction, utilisez « Regenerate with a hint » dans le menu « + ». Le bouton « More » d'un message propose modifier, bifurquer, aperçu de requête et plus.

## Ce qui s'exécute tout seul

Une fois que la discussion a des réponses, des assistants en arrière-plan travaillent, chacun avec ses propres appels de modèle :

- Le Dashboard lit la scène après chaque réponse ([[dashboard]]).
- Litopys écrit un chapitre quand une scène se ferme ([[litopys]]).
- Le World DM, à son niveau actif le plus bas (Chroniqueur), consigne les personnes et les lieux dans un livre pour cette discussion ([[world-dm]]).
- Une carte sans âme en reçoit une proposée automatiquement ([[soul]]).

Les échecs de ces tâches sont listés dans la Inbox.

## Si le modèle est petit, lent ou payé à l'appel

Les économies les plus rentables, dans l'ordre :

1. Dans les « Settings » du Dashboard, mettez le mode sur « Manual » (il ne se met alors à jour que lorsque vous appuyez sur « Refresh »), ou choisissez un petit modèle comme « Sensor model ».
2. Dans les « Litopys settings » de la Library, réduisez « Memory size » ou désactivez « Chapters and facts ».
3. Dans la feuille Monde, choisissez le niveau « Off » (il fait encore un petit appel quand la scène nomme un nouveau lieu) ou choisissez un « DM model (all chats) » bon marché.
4. Dans les réglages du Dashboard, désactivez « Rate characters automatically ».
5. Sur le Canvas, le tableau Prompt montre chaque partie de la prochaine requête avec ses jetons, et permet de désactiver des parties pour une discussion.

Une histoire qui s'est allongée demande ses propres mesures : voir [[long-chats]].

Les modèles gratuits à petite fenêtre de contexte s'en sortent mieux avec un Dashboard manuel et une « Compact memory ».

## Ensuite

[[memory]] explique les sortes de mémoire ; [[settings]] dit où tout se règle.
