<!-- source: 36f23a51ff05 -->
# Le Dashboard de scène

Le Dashboard est un panneau à côté de la discussion qui suit la scène : qui est présent, ce que chaque personnage ressent pour vous, ce qu'ils portent et savent, les fils d'histoire ouverts. Il est pour ceux qui veulent que l'histoire se souvienne des relations et des détails entre les réponses. L'article d'aide *Scene dashboard* liste ses champs.

## Ce qu'il suit

Ouvrez-le en cliquant sur un portrait dans la discussion et en choisissant Dashboard. Le panneau latéral a quatre onglets : **Personne** (attitude, humeur et état, tenue et objets), **Ici** (lieu, météo, qui est présent), **Quêtes** (les fils ouverts : principaux, secondaires, quotidiens) et **Notes** (le carnet : ce qu'un personnage sait, et s'il l'a vu, entendu ou deviné). La « Constellation » nomme la position d'un personnage envers vous, par exemple Amitié ou Romance. Un nombre sur un onglet compte les changements depuis votre dernière réponse (rouge quand quelque chose a chuté). La vue large a aussi un Journal avec la pensée et les souvenirs d'un personnage. Sur un téléphone, le même contenu s'ouvre en feuille.

**Une même personne listée deux fois.** Si le Dashboard montre la même personne sous deux noms (disons « Sina » et « Sina Rose »), ouvrez l'un d'eux et utilisez le petit bouton personnes dans l'en-tête Personne, puis « Same person as... » et choisissez l'autre. On vous demande d'abord : les notes, l'historique et les objets vont vers la personne que vous avez choisie, leurs nombres de relation restent, le nom devient un autre de ses noms, et cela ne peut pas être annulé. Le Dashboard suggère aussi lui-même les doublons probables : un encadré en haut de l'onglet Personne (et une puce « Possible duplicate » dans « Since your last reply ») dit « X may be the same person as Y » avec la raison. « Merge into Y » fait la même chose que le menu ; « Different people » les garde séparées et le Dashboard cesse de suggérer cette paire. Le même menu a « Remove from the Dashboard » pour un nom qui est simplement faux.

Les nombres (confiance, confort, attirance, respect, affection, et plus) sont calculés par le code à partir d'événements qu'un modèle signale, et infléchis par l'[[soul]] de chaque personnage. L'état est conservé par message : un balayage ou un message supprimé ne laisse jamais de nombres périmés.

Le bouton « Story, move » à côté d'Envoyer arme une impulsion unique pour la réponse suivante ; sa flèche choisit une quête ouverte ou un rebondissement.

## Ce qui a changé, dans la discussion

Sous la réponse la plus récente, une ligne discrète dit ce que le Dashboard y a enregistré : « Changed: Ada · trust fell, mood calm → tense, +2 ». Touchez-la pour déplier les mêmes puces que la ligne « Since your last reply » du Dashboard ; une puce ouvre l'onglet correspondant du Dashboard (sur un téléphone, sa feuille du bas). Les réponses plus anciennes n'affichent rien, et la ligne attend pendant qu'une réponse s'écrit ou que le Dashboard se met encore à jour. Pour la masquer, désactivez « Show what changed under the newest reply » dans Settings > Chat Behavior.

## Liens entre personnages

Le capteur note comment deux personnages qui ne sont pas vous se tiennent l'un envers l'autre, sous forme d'un rôle en un mot et d'une chaleur en un mot (« rival, cold »). La requête de la réponse en porte jusqu'à quatre, en une seule courte ligne, seulement pour les personnes présentes dans la scène. La réponse d'un personnage ne reçoit que les liens dont il fait partie ; un narrateur reçoit d'abord les liens des personnes que le tour concerne.

## Ce qu'un personnage a dit, et les mensonges

Sous le carnet d'une personne, la liste **Said** garde les choses fortes qu'elle a dites et auxquelles elle est tenue : un serment, une menace, un aveu, un ordre. Un mensonge y est aussi gardé, masqué jusqu'à ce que vous choisissiez « Show hidden ».

Quand un personnage ment devant d'autres, les autres le prennent pour vrai. Leurs réponses suivantes le traitent comme une chose qu'on leur a dite, sans raison d'en douter, jusqu'à ce que l'histoire montre le contraire. Seules les personnes présentes dans la scène sont trompées, et seulement dans leurs propres réponses : quelqu'un d'autre qui parle ne répète pas le mensonge.

Ouvrez un mensonge et vous voyez **Believe it:** avec un bouton pour chaque personne qui y croit encore. Appuyez sur un nom quand cette personne a découvert la vérité. Le menu de la ligne a aussi **This was a lie** pour une affirmation que le capteur n'a pas qualifiée de mensonge (les personnes de la scène y croient alors), et **Not a lie** quand le capteur s'est trompé. Le capteur met fin à la croyance tout seul quand une réponse montre la vérité qui sort. Retirer le mensonge de la liste retire avec lui chaque croyance.

> Le narrateur fait parler tout le monde dans une seule réponse, donc il connaît toujours la vérité. Cela empêche seulement qu'un personnage agisse sur ce qu'un autre personnage sait.

## Quand il se met à jour

Le bouton « Settings » à l'intérieur du Dashboard ouvre ses réglages ; l'onglet Sensor contient le mode :

- **Sensor** (par défaut) : après chaque réponse, un modèle lit les nouveaux messages et signale ce qui s'est passé.
- **Fast: inside the story reply** : pour les modèles puissants. Le modèle d'histoire écrit lui-même le rapport à la fin de sa réponse, sans appel séparé, en ajoutant quelques jetons à chaque réponse. S'il omet le rapport, le capteur habituel s'exécute.
- **Manual** : il ne se met à jour que lorsque vous appuyez sur « Refresh ».

## Ce qu'il coûte

En mode Sensor, un appel de modèle supplémentaire par réponse, sur le « Sensor model » (le modèle de la discussion si vous le laissez vide). Un modèle petit et bon marché suffit. Il lit les nouveaux messages en entier (jusqu'à environ 12 000 caractères ensemble ; une réponse plus longue perd seulement le milieu), et le code marque d'abord les phrases qui ressemblent à des vêtements, à un habillage ou à un baiser et les indique au modèle, de sorte qu'une jupe nommée une fois au milieu d'une longue réponse atteint quand même la tenue. Si une carte de personnage a une ligne « Attire: », le capteur la reçoit aussi comme référence pour la formulation exacte d'un vêtement que le texte mentionne (il n'ajoute jamais un vêtement que le texte ne montre pas). Ce qu'un personnage porte et tient est conservé comme une liste d'objets ; un vêtement qui se déchire ou se salit reste un seul objet. Chaque objet garde une seule identité partout où il va : porté, enlevé près de la porte, tendu à quelqu'un d'autre. Les objets laissés dans un lieu y restent : quand l'histoire revient au café, la tasse est encore sur la table. Quand l'histoire n'a pas montré ce que quelqu'un porte pendant environ six tours, on demande au modèle d'écriture de le mentionner, brièvement. Pour ajouter des mots d'une langue que l'analyse ne connaît pas, listez-les dans `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`) ; `{"off": true}` désactive l'analyse. Le Dashboard ajoute aussi un court « Prompt insert » à ce que lit le modèle d'histoire, pour que les personnages sachent où ils en sont : vous pouvez le désactiver et régler « Tokens per character ». « What the model sees » dans les réglages montre l'insert.

## Comment le désactiver

Il n'y a pas d'interrupteur d'arrêt séparé dans les écrans listés ici. Mettez le mode sur « Manual » et il n'appelle jamais de modèle de lui-même. Pour le retirer complètement, désactivez le plugin Dashboard dans le bouton Plugins de Molfar Vertep ; Tools > Plugins dans Roleplay ne fait que lister ce qui s'exécute. Désactivez « Prompt insert » si vous voulez qu'il reste hors de la requête.

## Liés

[[soul]] l'alimente ; [[litopys]] utilise ses notes ; [[memory]] le compare aux autres sortes de mémoire.
