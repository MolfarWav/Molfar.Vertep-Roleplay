<!-- source: 36ebfb6daad6 -->
# Le Tableau de bord de scène

Le Tableau de bord est un panneau à côté de la discussion qui suit la scène : qui est présent, ce que chaque personnage ressent pour vous, ce qu'ils portent et savent, les fils d'histoire ouverts. Il est pour ceux qui veulent que l'histoire se souvienne des relations et des détails entre les réponses. L'article d'aide *Tableau de bord de scène* liste ses champs.

## Ce qu'il suit

Ouvrez-le en cliquant sur un portrait dans la discussion et en choisissant Tableau de bord. Le panneau latéral a quatre onglets : **Personne** (attitude, humeur et état, tenue et objets), **Ici** (lieu, météo, qui est présent), **Quêtes** (les fils ouverts : principaux, secondaires, quotidiens) et **Notes** (le carnet : ce qu'un personnage sait, et s'il l'a vu, entendu ou deviné). La « Constellation » nomme la position d'un personnage envers vous, par exemple Amitié ou Romance. Un nombre sur un onglet compte les changements depuis votre dernière réponse (rouge quand quelque chose a chuté). La vue large a aussi un Journal avec la pensée et les souvenirs d'un personnage. Sur un téléphone, le même contenu s'ouvre en feuille.

**Une même personne listée deux fois.** Si le Tableau de bord montre la même personne sous deux noms (disons « Sina » et « Sina Rose »), ouvrez l'un d'eux et utilisez le petit bouton personnes dans l'en-tête Personne, puis « Même personne que... » et choisissez l'autre. On vous demande d'abord : les notes, l'historique et les objets vont vers la personne que vous avez choisie, leurs nombres de relation restent, le nom devient un autre de ses noms, et cela ne peut pas être annulé. Le Tableau de bord suggère aussi lui-même les doublons probables : un encadré en haut de l'onglet Personne (et une puce « Doublon possible » dans « Depuis votre dernière réponse ») dit « X est peut-être la même personne que Y » avec la raison. « Fusionner vers Y » fait la même chose que le menu ; « Personnes différentes » les garde séparées et le Tableau de bord cesse de suggérer cette paire. Le même menu a « Retirer du Tableau de bord » pour un nom qui est simplement faux.

Les nombres (confiance, confort, attirance, respect, affection, et plus) sont calculés par le code à partir d'événements qu'un modèle signale, et infléchis par l'[[soul]] de chaque personnage. L'état est conservé par message : un balayage ou un message supprimé ne laisse jamais de nombres périmés.

Le bouton « Histoire, mouvement » à côté d'Envoyer arme une impulsion unique pour la réponse suivante ; sa flèche choisit une quête ouverte ou un rebondissement.

## Quand il se met à jour

Le bouton « Réglages » à l'intérieur du Tableau de bord ouvre ses réglages ; l'onglet Capteur contient le mode :

- **Capteur** (par défaut) : après chaque réponse, un modèle lit les nouveaux messages et signale ce qui s'est passé.
- **Rapide : dans la réponse de l'histoire** : pour les modèles puissants. Le modèle d'histoire écrit lui-même le rapport à la fin de sa réponse, sans appel séparé, en ajoutant quelques jetons à chaque réponse. S'il omet le rapport, le capteur habituel s'exécute.
- **Manuel** : il ne se met à jour que lorsque vous appuyez sur « Actualiser ».

## Ce qu'il coûte

En mode Capteur, un appel de modèle supplémentaire par réponse, sur le « Modèle capteur » (le modèle de la discussion si vous le laissez vide). Un modèle petit et bon marché suffit. Il lit les nouveaux messages en entier (jusqu'à environ 12 000 caractères ensemble ; une réponse plus longue perd seulement le milieu), et le code marque d'abord les phrases qui ressemblent à des vêtements, à un habillage ou à un baiser et les indique au modèle, de sorte qu'une jupe nommée une fois au milieu d'une longue réponse atteint quand même la tenue. Si une carte de personnage a une ligne « Tenue : », le capteur la reçoit aussi comme référence pour la formulation exacte d'un vêtement que le texte mentionne (il n'ajoute jamais un vêtement que le texte ne montre pas). Ce qu'un personnage porte et tient est conservé comme une liste d'objets ; un vêtement qui se déchire ou se salit reste un seul objet. Chaque objet garde une seule identité partout où il va : porté, enlevé près de la porte, tendu à quelqu'un d'autre. Les objets laissés dans un lieu y restent : quand l'histoire revient au café, la tasse est encore sur la table. Quand l'histoire n'a pas montré ce que quelqu'un porte pendant environ six tours, on demande au modèle d'écriture de le mentionner, brièvement. Pour ajouter des mots d'une langue que l'analyse ne connaît pas, listez-les dans `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`) ; `{"off": true}` désactive l'analyse. Le Tableau de bord ajoute aussi un court « Insert de requête » à ce que lit le modèle d'histoire, pour que les personnages sachent où ils en sont : vous pouvez le désactiver et régler « Jetons par personnage ». « Ce que voit le modèle » dans les réglages montre l'insert.

## Comment le désactiver

Il n'y a pas d'interrupteur d'arrêt séparé dans les écrans listés ici. Mettez le mode sur « Manuel » et il n'appelle jamais de modèle de lui-même. Pour le retirer complètement, désactivez le plugin Tableau de bord dans le bouton Plugins de Molfar Vertep ; Outils > Plugins dans Roleplay ne fait que lister ce qui s'exécute. Désactivez « Insert de requête » si vous voulez qu'il reste hors de la requête.

## Liés

[[soul]] l'alimente ; [[litopys]] utilise ses notes ; [[memory]] le compare aux autres sortes de mémoire.
