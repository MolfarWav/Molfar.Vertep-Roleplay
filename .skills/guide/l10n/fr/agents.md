<!-- source: ec7d17369d16 -->
# Agents et la forge d'agents

Un agent est un petit assistant que vous assemblez à partir de cartes et de fils. Avant ou après une réponse (au choix), il lit une partie de la discussion, peut poser au modèle une ou plusieurs questions courtes, garde ses propres notes, et montre quelque chose : une note sous la réponse, des boutons à toucher, un compteur, une carte, ou un indice pour la réponse suivante. Exemples : trois mouvements suggérés pour la suite, un compteur de tension, une carte des lieux visités. Cette page s'adresse à ceux qui veulent de tels suppléments. L'aide compte trois articles sur l'éditeur : « Agent editor: how an agent works », « Agent editor: the cards » et « Agent editor: three ready agents ».

## De quoi un agent est-il fait

Un agent est une donnée, pas du code. Dans l'éditeur, c'est un tableau de **cartes** reliées par des **fils** :

- une carte **Input** indique ce que l'agent peut lire (la dernière réponse, l'historique de la discussion, la carte du personnage, le persona, la note de l'auteur, les faits de Litopys, les entrées du livre de connaissances) ;
- les cartes **Ask the model** posent une question au modèle et prennent la réponse en texte libre, en oui ou non, ou en quelques champs nommés ;
- des cartes de logique et des cartes qui travaillent dans le code sans modèle : dés, choix d'une ligne, découpe ou extraction de texte ;
- une carte **Script** : quelques lignes de JavaScript que vous écrivez, `(input, seed)` en entrée et un objet simple en sortie, avec des entrées et sorties typées. Elle s'exécute dans un bac à sable du moteur (ni horloge, ni internet, ni fichiers, environ une demi-seconde et 16 Mo) et demande un moteur à partir de la version 1.10.1 ; un moteur plus ancien fait échouer l'agent avec un message simple ;
- des cartes pour la **mémoire** propre de l'agent (nombres, texte, oui/non, listes), conservées pour chaque discussion et à l'écart du Dashboard ;
- une carte **Output** qui montre un résultat : « A note under the reply », « Buttons to tap », une valeur d'état, ou un indice placé dans la prochaine requête.

**Panels** (compteurs, jauges, tables, plateau de tuiles) affichent ce que l'agent garde ; rien dans un panneau ne s'exécute, et ses boutons ne font que mettre du texte dans la zone de message.

Le moment d'exécution est une voie. Le fichier de l'agent indique la voie de départ, et chaque discussion peut faire passer l'agent sur une autre voie (l'onglet Agents de la discussion, ou le tableau « Agent sets » du Canvas). Les quatre voies :

- **Before the reply** : la réponse attend l'agent, et l'indice qu'il laisse entre dans cette réponse même. Ne gardez qu'une ou deux questions rapides, car l'attente s'ajoute à chaque réponse. L'interrupteur Attente de la ligne de l'agent la désactive ; l'agent tourne alors à côté de la réponse.
- **Beside the reply** : s'exécute en même temps, n'ajoute aucune attente, et ne peut pas placer d'indice dans la réponse à côté de laquelle il tourne (notes, boutons et panneaux fonctionnent).
- **After the reply** : la voie habituelle pour les notes, les suivis et les compteurs.
- **By hand** : ne s'exécute que lorsque vous appuyez sur le bouton d'exécution de sa ligne.

En plus de la voie, un agent peut tourner à chaque N-ième réponse ou seulement lorsque certains mots choisis apparaissent.

## Agents prêts à l'emploi

Appuyez sur « New agent » dans le tableau Agents du **Canvas** (l'élément **Agents** du rail l'ouvre). « Empty agent » donne une Entrée et une note. « Start from a ready agent » en propose six qui fonctionnent : Prochains mouvements, Coup de pouce de rythme, Carte de l'histoire, Récapitulatif de scène, Plateau de territoire et Jauge de tension. Sous « Drafts » se trouvent les agents que Molfar a écrits dans votre espace de travail (« Drafts from Molfar »).

## L'éditeur

Les modifications sont enregistrées comme brouillon un instant après que vous vous arrêtez. Trois onglets : Carte (la carte sélectionnée), Agent (nom, quand il s'exécute, sa mémoire, ses panneaux) et Essayer. Une vérification indique « Passes the check », le nombre de problèmes et d'avertissements, et « N model calls per run ». Vous ne pouvez pas installer tant qu'il reste des problèmes. « Export as a file » enregistre un seul fichier que vous pouvez partager. La feuille « Install and manage agents... » de la discussion propose « Install an agent file » pour en importer un.

### Les options de la carte If

Une carte If répond Oui, Non ou Inconnu selon ses règles, et seule elle dit Oui à chaque exécution tant que les règles tiennent. Sous les règles, **When it answers Yes** modifie cela : « Every time » (par défaut), « Only when it turns Yes » (elle se déclenche au passage de non-Oui à Oui, et ne se redéclenche qu'une fois la réponse retombée), ou « Only once in this chat ». **Pause after it fires (runs)** saute ce nombre d'exécutions de l'agent après un Oui, de 0 à 50. Une exécution est un tour de l'agent, donc un agent qui tourne à chaque troisième réponse fait une pause de 2 qui dure six réponses. Une règle peut aussi utiliser « changed since the last run » : Oui lorsque la valeur diffère de celle de la dernière exécution. Dans le formulaire, chaque règle choisit **What the rule reads** : une valeur que vous reliez par un fil, une valeur du Dashboard, le chat (nombre de messages, qui a parlé en dernier) ou un dé du World DM (Fate, Life ou Pacing : a-t-il ajouté une note à cette réponse, et quel en était le résultat). La lecture d'un dé demande l'autorisation « Read what the World DM’s dice said for the last reply », et elle ne fonctionne que pour un agent qui s'exécute après la réponse. Seul un Oui est retenu ; Non et Inconnu sortent quand même. L'agent garde cela par discussion, et « start over » sur l'agent l'oublie. L'onglet Essayer montre pourquoi une carte a répondu (la règle, la valeur lue, le résultat) et, lorsqu'elle a retenu un Oui, quelle option l'a retenu ; le journal de l'agent sous une réponse garde les mêmes lignes.

## Essai

L'onglet Essayer exécute un tour inventé sans rien toucher. Vous modifiez les entrées, et les fils du tableau montrent ce qui circule ; sans modèle, chaque carte « Ask the model » utilise une réponse d'exemple que vous pouvez modifier. Sous « A real chat », choisissez une discussion et « Fill from this chat » pour charger ce que l'agent recevrait réellement. « Run with the model » pose alors la vraie question au vrai modèle : jusqu'à N appels, de vrais jetons, et rien n'est enregistré dans la discussion ni dans l'agent.

## Installer, autoriser, activer dans une discussion

1. Appuyez sur « Install » (« Update » pour une copie modifiée d'un agent installé ; utilisez « Edit a copy » pour en changer un).
2. Autorisez-le une fois : « Review permissions », puis « Allow all » ou ligne par ligne. Il s'exécute lorsque chaque ligne est activée. Une mise à jour demandant plus attend une nouvelle autorisation. Une carte Script demande « Run its own small program » ; la liste des autorisations montre son code (« Read the code ») avant que vous l'autorisiez, et si une mise à jour change le code, l'autorisation est redemandée.
3. Ajoutez-le à une discussion. Dans la pastille d'en-tête de la discussion, ouvrez l'onglet **Agents** : « In this chat » liste les agents actifs, « Installed » liste le reste (choisissez-en un pour l'ajouter). Une ligne peut s'exécuter à nouveau maintenant, être retirée, ou empêcher la réponse de l'attendre. Une nouvelle discussion n'a aucun agent jusqu'à ce que vous en ajoutiez ou choisissiez un ensemble.

Un **ensemble** est une liste nommée d'agents (« Save this chat's list as a set » ; « Make default » la donne aux nouvelles discussions). Le tableau « Agent sets » du Canvas montre le coût de chaque ensemble en temps et en appels, et contient l'interrupteur « Agents' notes in chats » qui masque toutes les notes des agents. La place du résultat de chaque agent peut être changée dans l'onglet Agents de la discussion, parmi les places qui lui conviennent.

Chaque carte « Ask the model » représente un appel par exécution ; l'éditeur en montre le nombre. « Every Nth reply » divise le coût.
