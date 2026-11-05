<!-- source: 4243150676b0 -->
# Canvas : liens entre discussions, requête et agents

Canvas est l'atelier technique de Roleplay : un seul écran avec des planches, où vous voyez et modifiez la façon dont les discussions se relient et ce que chaque discussion envoie au modèle. Vous n'en avez pas besoin pour jouer. Ouvrez-le quand une histoire a besoin d'une suite, quand une réponse vous a surpris, ou quand vous construisez des agents.

Choisissez une planche avec l'interrupteur **Board** en haut : **Chat links**, **Prompt**, **Agents** et **Agent sets**. L'élément Agents du rail ouvre le même Canvas sur sa planche Agents. La planche utilisée en dernier est mémorisée.

## Chat links

Une carte de vos discussions. Chaque discussion est une carte. Une ligne d'une discussion à une autre signifie « cette discussion continue celle-là » : l'histoire de la discussion précédente voyage comme contexte dans les réponses de la discussion suivante, dans la limite du budget de contexte défini dans la Library. Une ligne pleine est une continuation. Une ligne en pointillés est une branche issue d'un message.

- Les discussions que vous n'avez pas posées sur la planche attendent dans la liste à gauche (**Chats**). Glissez-en une sur la planche, ou utilisez **Put on the board** (avec **its linked chats** pour amener toute la chaîne). Glissez une carte vers la liste, ou utilisez **Remove**, pour la retirer de la planche. La discussion elle-même reste dans la Library.
- Activez **Edit** pour relier ou délier des cartes. Un lien qui créerait une boucle, relierait une discussion à elle-même ou répéterait un lien existant est refusé, et la planche indique pourquoi. **Undo** et **Redo** sont disponibles. **Fit** cadre tout le graphe.
- Sur un téléphone, la planche s'ouvre en **View** avec une **List** des liens. Construire un graphe est plus facile sur un grand écran, mais vous pouvez encore modifier les liens dans la liste.

La carte des liens d'une discussion dans la Library montre la même chaîne, en lecture seule. Son bouton **Edit on canvas** vous amène ici.

## Prompt

Choisissez une discussion pour voir la requête qu'elle envoie au modèle. La planche a deux vues : **Parts** et **Memory**.

- **Parts** liste chaque partie de la requête : le prompt principal, la carte du personnage, le persona, les entrées de lorebook, le dialogue d'exemple, les sections du préréglage et l'historique, chacune avec son nombre de jetons et son état. Une partie peut être désactivée dans le préréglage, désactivée pour cette discussion, vide, ou non prévue pour ce type de réponse. Vous pouvez désactiver une partie pour cette seule discussion sans toucher au préréglage. **Only what is sent** masque le reste, et le total montre ce que reçoit le modèle.
- **Memory** explique pourquoi la mémoire a mis ce qu'elle a mis dans la dernière réponse : [[memory]] en donne la description complète.

Pour un aperçu plus rapide de ce qui s'est déclenché seulement dans la dernière réponse, utilisez le bouton **Fired** dans l'en-tête de la discussion. La vue Memory et **Fired** lisent le même registre ; Fired compte aussi sur toute la discussion.

## Agents et Agent sets

La forge d'agents : construisez un agent, essayez-le, et regroupez les agents en ensembles. Voir [[agents]].

## Ce qui reste inchangé

Désactiver une partie sur la planche Prompt s'applique à cette seule discussion. Le préréglage et les cartes ne sont pas modifiés.
