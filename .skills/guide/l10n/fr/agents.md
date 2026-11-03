<!-- source: f1a3e4ba962c -->
# Agents et la forge d'agents

Un agent est un petit assistant que vous assemblez à partir de cartes et de fils. Après une réponse, il lit une partie de la discussion, peut poser au modèle une ou plusieurs questions courtes, garde ses propres notes, et montre quelque chose : une note sous la réponse, des boutons à toucher, un compteur, une carte, ou un indice pour la réponse suivante. Exemples : trois mouvements suggérés pour la suite, un compteur de tension, une carte des lieux visités. Cette page s'adresse à ceux qui veulent de tels suppléments. Il n'existe pas encore d'article d'aide pour les agents.

## De quoi un agent est-il fait

Un agent est une donnée, pas du code. Dans l'éditeur, c'est un tableau de **cartes** reliées par des **fils** :

- une carte **Entrée** indique ce que l'agent peut lire (la dernière réponse, l'historique de la discussion, la carte du personnage, le persona, la note de l'auteur, les faits de Litopys, les entrées du livre de connaissances) ;
- les cartes **Demander au modèle** posent une question au modèle et prennent la réponse en texte libre, en oui ou non, ou en quelques champs nommés ;
- des cartes de logique et des cartes qui travaillent dans le code sans modèle : dés, choix d'une ligne, découpe ou extraction de texte ;
- des cartes pour la **mémoire** propre de l'agent (nombres, texte, oui/non, listes), conservées pour chaque discussion et à l'écart du Tableau de bord ;
- une carte **Sortie** qui montre un résultat : « Une note sous la réponse », « Des boutons à toucher », une valeur d'état, ou un indice placé dans la prochaine requête.

Les **panneaux** (compteurs, jauges, tables, plateau de tuiles) affichent ce que l'agent garde ; rien dans un panneau ne s'exécute, et ses boutons ne font que mettre du texte dans la zone de message.

Quand il s'exécute est défini pour chaque agent : avant la réponse, avec elle, après elle, ou à la main ; toutes les N réponses ; ou seulement lorsque des mots choisis apparaissent.

## Agents prêts à l'emploi

Appuyez sur « Nouvel agent » dans le tableau Agents du **Canevas** (l'élément **Agents** du rail l'ouvre). « Agent vide » donne une Entrée et une note. « Partir d'un agent prêt » en propose six qui fonctionnent : Prochains mouvements, Coup de pouce de rythme, Carte de l'histoire, Récapitulatif de scène, Plateau de territoire et Jauge de tension. Sous « Brouillons » se trouvent les agents que Molfar a écrits dans votre espace de travail (« Brouillons de Molfar »).

## L'éditeur

Les modifications sont enregistrées comme brouillon un instant après que vous vous arrêtez. Trois onglets : Carte (la carte sélectionnée), Agent (nom, quand il s'exécute, sa mémoire, ses panneaux) et Essayer. Une vérification indique « Passe la vérification », le nombre de problèmes et d'avertissements, et « N appels au modèle par exécution ». Vous ne pouvez pas installer tant qu'il reste des problèmes. « Exporter en fichier » enregistre un seul fichier que vous pouvez partager. La feuille « Installer et gérer des agents… » de la discussion propose « Installer un fichier d'agent » pour en importer un.

## Essai

L'onglet Essayer exécute un tour inventé sans rien toucher. Vous modifiez les entrées, et les fils du tableau montrent ce qui circule ; sans modèle, chaque carte « Demander au modèle » utilise une réponse d'exemple que vous pouvez modifier. Sous « Une vraie discussion », choisissez une discussion et « Remplir depuis cette discussion » pour charger ce que l'agent recevrait réellement. « Exécuter avec le modèle » pose alors la vraie question au vrai modèle : jusqu'à N appels, de vrais jetons, et rien n'est enregistré dans la discussion ni dans l'agent.

## Installer, autoriser, activer dans une discussion

1. Appuyez sur « Installer » (« Mettre à jour » pour une copie modifiée d'un agent installé ; utilisez « Modifier une copie » pour en changer un).
2. Autorisez-le une fois : « Examiner les autorisations », puis « Tout autoriser » ou ligne par ligne. Il s'exécute lorsque chaque ligne est activée. Une mise à jour demandant plus attend une nouvelle autorisation.
3. Ajoutez-le à une discussion. Dans la pastille d'en-tête de la discussion, ouvrez l'onglet **Agents** : « Dans cette discussion » liste les agents actifs, « Installés » liste le reste (choisissez-en un pour l'ajouter). Une ligne peut s'exécuter à nouveau maintenant, être retirée, ou empêcher la réponse de l'attendre. Une nouvelle discussion n'a aucun agent jusqu'à ce que vous en ajoutiez ou choisissiez un ensemble.

Un **ensemble** est une liste nommée d'agents (« Enregistrer la liste de cette discussion comme ensemble » ; « Rendre par défaut » la donne aux nouvelles discussions). Le tableau « Ensembles d'agents » du Canevas montre le coût de chaque ensemble en temps et en appels, et contient l'interrupteur « Notes des agents dans les discussions » qui masque toutes les notes des agents. La place du résultat de chaque agent peut être changée dans l'onglet Agents de la discussion, parmi les places qui lui conviennent.

Chaque carte « Demander au modèle » représente un appel par exécution ; l'éditeur en montre le nombre. « Toutes les N réponses » divise le coût.
