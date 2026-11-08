<!-- source: 49838714a096 -->
# Longues discussions et coût en jetons

Une discussion qui dure des semaines grossit, et chaque réponse envoie davantage au modèle. Cette page s'adresse à quiconque voit ses réponses ralentir ou coûter cher, ou dont le modèle oublie le début de l'histoire.

## Le bouton Request size

Par défaut, toute la discussion est envoyée tant que la fenêtre a de la place. Sur une grande fenêtre le coût ne cesse de croître ; l'en-tête de la discussion a donc un bouton **Request size** à côté des outils d'histoire (sur un téléphone : dans le Menu). Il indique combien de jetons la dernière requête a envoyés, la requête complète telle que le fournisseur l'a comptée, et quel modèle l'a reçue. Appuyez dessus pour voir le modèle, sa fenêtre et votre limite. Il est turquoise sous les trois quarts de la limite, ambre au-delà, et rouge avec un signe d'avertissement au-dessus. Le tableau Prompt du Canvas liste chaque partie d'une requête ([[canvas]]).

Quand une réponse fait dépasser la limite à la requête, une fenêtre s'ouvre :

- **Yes, continue in a new chat** crée tout de suite la discussion suivante et l'ouvre.
- **Not now** masque la fenêtre pour cette discussion jusqu'à ce que la requête ait grossi de moitié. La fermer compte comme Not now.
- **Send finished scenes as chapters instead** apparaît quand Litopys est activé (section suivante).

La limite se trouve en bas de la fenêtre, et dans la Library, engrenage « Litopys settings », bloc « In the prompt », « Warn me when a request gets big » : 60 % de la fenêtre du modèle (par défaut), une taille que vous saisissez (100k) ou choisissez (16k à 500k), ou jamais. Une discussion déjà au-delà de la limite affiche le bouton rouge et aucune fenêtre tant qu'une nouvelle réponse ne la fait pas grossir.

Le registre a sa propre taille. Dans le même bloc, « Memory size » est Auto par défaut : 15 % de la fenêtre du modèle, entre 800 et 16000 jetons. « Compact » la fixe à 800.

## Les interrupteurs qui réduisent le coût

Dans le même bloc, « Older messages leave the prompt » propose deux choix :

- **Only when the window is full** (par défaut) : chaque message est envoyé tant qu'il tient.
- **By scenes** : dès qu'un chapitre couvre une scène, la scène est remplacée par le chapitre. Seuls les derniers messages restent mot pour mot (« Direct messages after the scenes », 2 ou plus). La scène la plus récente n'a pas encore de chapitre, elle est donc envoyée en entier.

« By scenes » coûte un peu de détail : un chapitre est un récit, un modèle faible peut donc perdre une petite chose. Épinglez un fait qui ne doit jamais se perdre ([[litopys]]). Autres réductions :

- Tableau Prompt du Canvas, carte d'historique, Details : n'envoyer que les N derniers messages (ordinateur, cette discussion seule).
- Réduisez « Memory size » à Compact, ou désactivez « Chapters and facts ».

## Commencer une nouvelle discussion et garder l'histoire

À une pause naturelle, une nouvelle discussion qui poursuit l'ancienne démarre avec une petite requête et connaît quand même ce qui s'est passé.

1. Dans la discussion, ouvrez « More » et choisissez **Continue in a new chat**, ou appuyez sur Yes dans la fenêtre.
2. La nouvelle discussion est créée tout de suite et s'ouvre. Elle garde le preset et ses choix, le persona, le modèle, l'ensemble d'agents, l'ordre des tours d'un groupe et le monde du World DM.
3. Elle reçoit l'ancienne histoire comme contexte, dans le « Backstory budget ». Les trois discussions antérieures les plus proches sont lues en entier : chapitres, faits et tournants. Les discussions plus anciennes d'une longue chaîne ne sont pas écartées : elles entrent dans une seule partie condensée (voir plus bas). Les anciens messages ne sont pas envoyés.

L'ancienne discussion passe ensuite toute seule dans l'Archive (section suivante). Le lien est celui que trace le Canvas, et le Canvas peut le modifier plus tard : voir [[canvas]]. Pour choisir une autre discussion antérieure, démarrez une discussion à partir du personnage et utilisez le menu **Continues** à l'étape « New chat with ».

La nouvelle discussion s'ouvre avec la salutation de la carte ; « Edit the first message » vous permet de reprendre là où l'histoire s'est arrêtée.

## Une histoire faite de nombreuses discussions

Une histoire peut se poursuivre sur beaucoup de discussions. Les trois discussions antérieures les plus proches donnent leurs chapitres, arcs et faits comme avant. Chaque discussion plus ancienne entre dans une seule partie **far**, placée en premier : ses tournants, les faits épinglés et clés, et une ligne pour chaque arc. Cette partie est construite à partir de ce que Litopys a déjà écrit, sans appel de modèle supplémentaire, et prend par défaut 18 % du Backstory budget (Library, Litopys settings, « In the prompt », **Share for the far chats**, de 5 à 40). **Turning points shown** dans le même bloc règle combien en entrent dans une réponse sur toute l'histoire (12 par défaut). Si le budget est court, les plus anciennes discussions perdent leurs lignes en premier, et les tournants en dernier. Dans **What this chat carries**, elle a sa propre ligne, « Far backstory, chats 1-2 », pour que vous voyiez que les premières discussions ont été gardées, et non perdues. Une chaîne courte n'a pas de partie far. Augmentez le Backstory budget si une longue histoire paraît maigre.

Une partie condensée perd de petits détails (la couleur d'une cape) ; les souvenirs mot pour mot ci-dessous les rapportent.

## Archiver une histoire terminée

Une histoire terminée peut passer dans les **Archive**. C'est un statut de la discussion, pas un déplacement : la discussion reste où elle est, donc sa mémoire, ses liens sur le Canvas et tout livre qui en est tiré continuent de fonctionner.

- Dans Chats, choisissez une discussion et appuyez sur **Archive** (le bouton ambre de son panneau), ou cochez-en plusieurs avec Select. Dans une discussion, c'est dans le menu, sous « Manage chat ».
- Une discussion archivée quitte la liste et Home. La ligne **Archive** ambre sous les filtres les ouvre ; **Back to chats** revient.
- Elle s'ouvre en lecture seule : vous pouvez lire, copier, bifurquer depuis un message, exporter et consulter son Dashboard et sa Library, mais ni envoyer, ni balayer, ni modifier, ni supprimer. Sa place en bas propose **Continue in a new chat**. **Unarchive** (dans son panneau ou la bannière) la rend à nouveau normale.
- La confirmation propose **Archive and continue** quand aucune discussion ne prolonge encore celle-ci.
- **Cela se fait tout seul** quand une discussion devient l'ancienne discussion d'une autre : un lien sur le Canvas, Continue in a new chat, la fenêtre ci-dessus, ou un choix dans « Continues ». Un message éphémère avec Undo le signale. Les bifurcations ne sont pas des suites et restent telles quelles. Désactivez-le dans la Library, engrenage « Litopys settings », « Archive the earlier chat when it is continued ».
- Une discussion de 100 messages ou plus, calme depuis une semaine, reçoit une petite étiquette « Long chat · archive? » dans la liste et une indication dans son panneau. Rien n'est archivé à votre place.

Pourquoi s'en soucier : l'ancienne discussion ne change plus, donc sa mémoire reste stable, et une nouvelle discussion qui la poursuit la lit comme une histoire terminée ([[litopys]]).

## Détails que les chapitres ont laissés de côté

Un chapitre est un récit, donc un petit détail d'une ancienne discussion peut en disparaître. Dans la Library, Litopys settings, « In the prompt », l'interrupteur **Word-for-word memories of earlier chats** (activé par défaut) permet à une discussion qui en poursuit d'autres de faire revenir un ou deux passages des messages originaux quand ce qui est dit partage des mots rares avec eux ([[litopys]]). L'ancienne discussion est indexée quand elle passe dans l'Archive. Cela ne fait que comparer des mots : un détail raconté autrement n'est pas trouvé ; l'interrupteur expérimental **Also find old chapters by meaning** (désactivé) réduit un peu cet écart quand vous utilisez des embeddings : il trouve le chapitre par le sens, mais un passage a toujours besoin d'un mot rare qui lui est propre.

## Enregistrer une histoire comme livre

Dans la Library, Litopys, « Save as a book » copie les chapitres, arcs et faits d'une discussion sur l'étagère de la Data Bank, pour les discussions que vous choisissez : voir [[memory]].

## Vérifier ce que le modèle a reçu

Si un personnage oublie quelque chose, ouvrez Canvas > Prompt et passez de « Parts » à « Memory » : cela montre quels faits sont entrés et lesquels ont été laissés de côté, et pourquoi. Le bouton **Fired** de l'en-tête de la discussion l'affiche pour la dernière réponse et pour toute la discussion.
