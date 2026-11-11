<!-- source: 67addd68fb05 -->
# Conversations longues et coût en tokens

Une conversation qui dure des semaines grandit, et chaque réponse en envoie davantage au modèle. Cette page s'adresse à ceux dont les réponses deviennent lentes ou coûteuses, ou dont le modèle oublie le début de l'histoire.

## Le bouton "Request size"

Par défaut, toute la conversation est envoyée tant que la fenêtre a de la place. Sur une grande fenêtre, le coût ne cesse de grimper, c'est pourquoi l'en-tête de la conversation a un bouton **Request size** à côté des outils d'histoire (sur téléphone : dans le Menu). Il indique combien de tokens la dernière requête a envoyés, l'intégralité du prompt tel que le fournisseur l'a compté, et quel modèle l'a reçu. Appuyez dessus pour voir le modèle, sa fenêtre et votre limite. Il est bleu-vert en dessous des trois quarts de la limite, ambre à partir de là, et rouge avec un signe d'avertissement au-delà. Le tableau Canvas Prompt liste chaque partie d'une requête ([[canvas]]).

Quand une réponse fait dépasser la limite à la requête, une fenêtre s'ouvre :

- **Yes, continue in a new chat** crée la conversation suivante immédiatement et l'ouvre.
- **Not now** masque la fenêtre pour cette conversation jusqu'à ce que la requête ait grandi de moitié. La fermer compte comme Not now.
- **Send finished scenes as chapters instead** apparaît quand Litopys est activé (section suivante).

La limite se trouve en bas de la fenêtre, et dans la Bibliothèque, rouage "Litopys settings", bloc "In the prompt", "Warn me when a request gets big" : 60 % de la fenêtre du modèle (par défaut), une taille que vous tapez (100k) ou choisissez (16k à 500k), ou jamais. Une conversation déjà au-delà de la limite affiche le bouton rouge et aucune fenêtre tant qu'une nouvelle réponse ne la fait pas grandir.

Le record a sa propre taille. Dans le même bloc, "Memory size" est sur Auto par défaut : 15 % de la fenêtre du modèle, entre 800 et 16000 tokens. "Compact" le maintient à 800.

## Les interrupteurs qui réduisent le coût

Dans le même bloc, "Older messages leave the prompt" propose deux choix :

- **Only when the window is full** (par défaut) : chaque message est envoyé tant qu'il tient.
- **By scenes** : dès qu'un chapitre contient une scène, la scène est remplacée par le chapitre. Seuls les derniers messages restent mot pour mot ("Direct messages after the scenes", 2 ou plus). La scène la plus récente n'a pas encore de chapitre, elle est donc envoyée en entier.

"By scenes" coûte un peu de détail : un chapitre est un récit reformulé, donc un modèle faible peut perdre une petite chose. Épinglez un fait qui ne doit jamais être perdu ([[litopys]]). Autres réductions :

- Bibliothèque, Litopys settings, **Direct messages, by size** : garder les messages les plus récents qui tiennent dans un nombre de tokens (au moins 2 messages) au lieu d'un nombre fixe. 0 compte les messages ([[litopys]]).
- Bibliothèque, Litopys settings, **Leave out what a speaker was not present for** ("Groups only" par défaut) : une réponse prononcée par un personnage ne reçoit pas les messages récents des scènes où ce personnage n'était pas ([[litopys]]).
- Tableau Canvas Prompt, carte history, Details : n'envoyer que les N derniers messages (bureau, cette conversation uniquement).
- Réduisez "Memory size" à Compact, ou désactivez "Chapters and facts".

## Démarrer une nouvelle conversation et garder l'histoire

À une pause naturelle, une nouvelle conversation qui continue l'ancienne démarre avec un petit prompt et sait quand même ce qui s'est passé.

1. Dans la conversation, ouvrez "More" et choisissez **Continue in a new chat**, ou appuyez sur Yes dans la fenêtre.
2. La nouvelle conversation est créée immédiatement et s'ouvre. Elle conserve le preset et ses choix, le persona, le modèle, l'ensemble d'agents, l'ordre de passage d'un groupe et le monde du World DM.
3. Elle reçoit l'ancienne histoire comme backstory, dans la limite du "Backstory budget". Les trois conversations précédentes les plus proches sont lues en entier : chapitres, faits et turning points. Les conversations plus anciennes d'une longue chaîne ne sont pas abandonnées : elles voyagent dans une partie condensée (voir ci-dessous). Les anciens messages ne sont pas envoyés.

L'ancienne conversation passe ensuite d'elle-même dans l'Archive (section suivante). Le lien est celui que dessine le Canvas, et le Canvas peut le modifier plus tard : voir [[canvas]]. Pour choisir une autre conversation précédente, démarrez une conversation depuis le personnage et utilisez le menu **Continues** à l'étape "New chat with".

La nouvelle conversation s'ouvre avec le premier message d'accueil de la carte ; "Edit the first message" vous permet de reprendre là où l'histoire s'est arrêtée.

## Une histoire en plusieurs conversations

Une histoire peut se poursuivre sur de nombreuses conversations. Les trois conversations précédentes les plus proches donnent leurs chapitres, arcs et faits comme avant. Chaque conversation plus ancienne entre dans une partie **far**, placée en premier : ses turning points, les faits épinglés et clés, et une ligne pour chaque arc. La partie est construite à partir de ce que Litopys a déjà écrit, sans appel supplémentaire au modèle, et prend 18 % du Backstory budget par défaut (Bibliothèque, Litopys settings, "In the prompt", **Share for the far chats**, 5 à 40). **Turning points shown** dans le même bloc définit combien voyagent dans une réponse sur l'ensemble de l'histoire (12 par défaut). Si le budget est court, les conversations les plus anciennes perdent leurs lignes en premier et les turning points en dernier. Dans **What this chat carries**, c'est sa propre ligne, "Far backstory, chats 1-2", pour que vous voyiez que les premières conversations ont été conservées, pas perdues. Une chaîne courte n'a pas de partie far. Augmentez le Backstory budget si une longue histoire paraît maigre.

Une partie condensée abandonne les petits détails (la couleur d'une cape) ; les souvenirs mot pour mot ci-dessous les font revenir.

## Archiver une histoire terminée

Une histoire que vous avez terminée peut aller dans l'**Archive**. C'est un statut sur la conversation, pas un déplacement : la conversation reste où elle est, donc sa mémoire, ses liens sur le Canvas et tout livre qui en est tiré continuent de fonctionner.

- Dans Chats, choisissez une conversation et appuyez sur **Archive** (le bouton ambre dans son panneau), ou cochez-en plusieurs avec Select. Dans une conversation, c'est dans le menu sous "Manage chat".
- Une conversation archivée quitte la liste et Home. La ligne ambre **Archive** sous les filtres les ouvre ; **Back to chats** revient.
- Elle s'ouvre en lecture seule : vous pouvez lire, copier, créer une branche depuis un message, exporter et consulter son Dashboard et sa Library, mais pas envoyer, swiper, modifier ni supprimer. Sa place en bas propose **Continue in a new chat**. **Unarchive** (dans son panneau ou la bannière) la rend normale à nouveau.
- La confirmation propose **Archive and continue** quand aucune conversation ne continue encore celle-ci.
- **Cela se fait tout seul** quand une conversation devient la conversation précédente d'une autre : un lien sur le Canvas, Continue in a new chat, la fenêtre ci-dessus, ou un choix dans "Continues". Un toast avec Undo le signale. Les branches ne sont pas des continuations et restent telles quelles. Désactivez-le dans la Bibliothèque, rouage "Litopys settings", "Archive the earlier chat when it is continued".
- Une conversation de 100 messages ou plus restée silencieuse pendant une semaine reçoit une petite étiquette "Long chat · archive?" dans la liste et un indice dans son panneau. Rien n'est archivé à votre place.

Pourquoi s'en soucier : la conversation précédente ne change plus, donc sa mémoire reste stable et une nouvelle conversation qui la continue la lit comme une histoire terminée ([[litopys]]).

## Les détails que les chapitres ont abandonnés

Un chapitre est un récit reformulé, donc un petit détail d'une conversation précédente peut en avoir disparu. Dans la Bibliothèque, Litopys settings, "In the prompt", l'interrupteur **Word-for-word memories of earlier chats** (activé par défaut) permet à une conversation qui en continue d'autres de faire revenir un ou deux passages des messages originaux lorsque ce qui est dit partage des mots rares avec eux ([[litopys]]). La conversation précédente est indexée quand elle part dans l'Archive. Il fait correspondre les mots, donc un détail raconté avec d'autres mots n'est pas trouvé ; l'interrupteur expérimental **Also find old chapters by meaning** (désactivé) réduit un peu cet écart quand vous utilisez des embeddings : il trouve le chapitre par le sens, mais un passage a toujours besoin d'un mot rare qui lui est propre.

## Enregistrer une histoire comme livre

Dans la Bibliothèque, Litopys, "Save as a book" copie les chapitres, arcs et faits d'une conversation sur l'étagère Data Bank pour les conversations que vous choisissez : voir [[memory]].

## Vérifier ce que le modèle a reçu

Si un personnage oublie quelque chose, ouvrez Canvas > Prompt et passez de "Parts" à "Memory" : cela montre quels faits sont entrés et lesquels ont été laissés de côté, et pourquoi. Le bouton **Fired** dans l'en-tête de la conversation le montre pour la dernière réponse et toute la conversation.
