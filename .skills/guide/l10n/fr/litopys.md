<!-- source: c68da6730f1a -->
# Litopys : le registre de l'histoire

Litopys (la chronique) est la mémoire longue d'une discussion. Il lit l'histoire en arrière-plan et écrit un chapitre pour chaque scène terminée, plus les faits que l'histoire a établis. Quand une discussion devient trop longue pour la fenêtre du modèle, le registre fait avancer l'histoire. Utilisez-le pour les longues histoires ; vous n'avez pas besoin de le démarrer.

## Chapitres et faits

- Un **chapitre** dit ce qui a changé dans une scène, ce n'est pas un récit. Il est écrit une fois que la scène suivante commence ; la dernière scène peut donc ne pas encore en avoir. Un nouveau lieu ou un saut dans le temps ferme une scène ; vous pouvez aussi marquer vous-même une suite de messages comme scène, depuis le menu « More » d'un message sous Story.
- Un **fait** est une courte phrase qui reste vraie : « Medli cache ses ailes au marché. » Les faits ont un type, un poids (Everyday, Important, Key) et qui les connaît. Vous pouvez ajouter, modifier, épingler ou retirer des faits à la main.
- Les **propositions** sont les suggestions de Litopys : fusionner deux faits, en retirer un, reformuler, épingler. Vous acceptez ou rejetez chacune.
- Des **habitudes** qu'un personnage montre clairement peuvent aussi apparaître, et devenir une habitude après s'être répétées dans plusieurs scènes.

## Où regarder

Appuyez sur **Record** dans l'en-tête de la discussion (sur un téléphone, dans le Menu) pour le registre de cette discussion dans un panneau latéral. La section **Library** du rail montre le registre de chaque discussion. Elle a deux vues : Overview (une chronologie, une carte par personnage, les propositions en attente) et Details avec les onglets Chapters, Facts, Proposals, Habits et Activity. L'onglet Activity journalise ce que Litopys a fait, avec **Undo** quand c'est possible. L'engrenage (« Litopys settings ») règle la façon dont le registre est écrit.

## Ce qui entre dans la requête

Par défaut, le registre est inséré automatiquement. « Memory size » dit combien de jetons il peut prendre : Auto par défaut (15 % de la fenêtre du modèle, au moins 800 et au plus 16000), Compact (800 jetons) ou Custom de 200 à 16000. Auto laisse une grande fenêtre porter plus d'histoire ; sur un petit modèle, il reste près de 800. Une taille que vous avez enregistrée vous-même auparavant reste telle quelle. Quand tout tient, tout est envoyé ; sinon, les parties qui comptent le plus pour la scène. Un petit modèle veut une petite taille. « Chapters and facts » désactivé signifie pas de nouveaux chapitres ni faits et rien d'ajouté à la requête.

Les anciens messages ne peuvent quitter la requête que lorsque la fenêtre est pleine, ou scène par scène une fois qu'un chapitre les couvre ; le réglage « Older messages leave the prompt » choisit.

## Matching by meaning

La mémoire trouve les faits et chapitres par les mots. Avec un modèle d'embeddings, elle les trouve aussi par le sens : une question formulée autrement atteint quand même le fait. La carte **Matching by meaning** (en haut du registre d'une discussion, et dans Canvas > Prompt > Memory) montre où en est la chose : off, failing, no vectors yet, partly done, done, ou made by another model. Configurez le modèle une fois dans Settings > Memory : par défaut, l'application utilise d'abord un modèle sur votre ordinateur (LM Studio ou Ollama), puis une connexion API avec une clé, puis OpenRouter. Dès qu'un appel au modèle d'embeddings a réussi (une pression sur le bouton de la carte, ou une réponse), le moteur remplit tout seul les vecteurs manquants de chaque discussion et de chaque fichier de la Data Bank, en vérifiant toutes les quelques minutes ; ce qui dépasse 300 000 jetons attend le bouton, et l'interrupteur **Make vectors by itself** dans Settings > Memory le désactive. Le bouton **Embed N items** indique d'abord combien d'éléments et environ combien de jetons cela prend, puis le fait tout de suite. Les nouvelles scènes intègrent leurs nouveaux éléments dans tous les cas. Si vous changez de modèle d'embeddings, les anciens vecteurs ne sont pas utilisés tant que vous n'avez pas appuyé sur **Embed again**. La Data Bank a sa propre carte, **Data Bank by meaning**, en haut de Settings > Data Bank : elle fonctionne de la même façon pour les passages de vos fichiers et des livres d'instantanés, et un fichier couvert en partie affiche « 7 of 12 by meaning ».

## Suggestions et rangement

« Suggestions » est sur « Ask me first » par défaut : chaque épinglage et réécriture attend votre oui. L'option discrète applique tout de suite les épinglages et réécritures et les journalise dans Activity. Retirer et fusionner attendent toujours votre accord. « Tidy facts automatically » cherche les doublons et contradictions après 30 nouveaux faits, à raison d'un appel de modèle supplémentaire par 60 faits.

## Reconstruire

« Rebuild from scratch » réécrit les chapitres et faits à partir des messages en arrière-plan, environ un appel de modèle toutes les 30 secondes. Vos propres faits modifiés et épinglés et vos chapitres modifiés restent, et le registre actuel est utilisé jusqu'à ce que le nouveau soit prêt. Il refuse de démarrer si aucune scène ne s'est fermée.

Si vous modifiez des messages après l'écriture d'un chapitre, ce chapitre est marqué comme périmé et réécrit.

## Liés

La carte d'un personnage peut aussi garder la mémoire des discussions terminées : voir [[memory]]. Les articles d'aide *Litopys: chapters and proposals*, *Facts and proposals* et *Overview vs Details* couvrent les écrans.
