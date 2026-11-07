<!-- source: 22d2bcc1795f -->
# Litopys : le registre de l'histoire

Litopys (la chronique) est la mémoire longue d'une discussion. Il lit l'histoire en arrière-plan et écrit un chapitre pour chaque scène terminée, plus les faits que l'histoire a établis. Quand une discussion devient trop longue pour la fenêtre du modèle, le registre fait avancer l'histoire. Utilisez-le pour les longues histoires ; vous n'avez pas besoin de le démarrer.

## Chapitres et faits

- Un **chapitre** dit ce qui a changé dans une scène, pas un récit. Il est écrit une fois que la scène suivante commence, donc la dernière scène peut ne pas encore en avoir. Un nouveau lieu ou un saut dans le temps ferme une scène ; vous pouvez aussi marquer vous-même une suite de messages comme scène, depuis le menu « More » d'un message, sous Story.
- Un **fait** est une courte phrase qui reste vraie : « Medli cache ses ailes au marché. » Les faits ont un type, un poids (Everyday, Important, Key) et qui les connaît. Vous pouvez ajouter, modifier, épingler ou retirer des faits à la main.

**Un fait peut être connu de tout un groupe**, par exemple une guilde : dans « Known to », tapez `group: Guild of Ravens`, et chaque membre présent dans la scène connaît le fait ; les autres non. Un groupe existe lorsqu'une carte a une étiquette écrite `group: Guild of Ravens` ou `faction: Guild of Ravens` (les autres étiquettes ne sont pas des groupes), ou lorsqu'un enregistrement du World DM de type Group ou Place liste des Members ([[world-dm]]). Quand un membre est dans la scène, le modèle qui écrit les chapitres est informé du groupe et peut l'utiliser pour les nouvelles apprises par tout le groupe. Un livre d'instantané copie les noms des membres au moment où vous l'enregistrez.
- Une **croyance** est un fait de type Belief : quelque chose qu'un personnage a entendu dans un mensonge et tient encore pour vrai. Elle apparaît après qu'un mensonge est resté quelque temps dans la liste Said du Dashboard, appartient à celui qui y croit, et n'entre que dans les réponses de ce personnage. Elle prend fin quand ce personnage apprend la vérité ou quand vous retirez le mensonge ; vous pouvez aussi la terminer à la main avec **Knows the truth now**, ce qui le signale également au Dashboard. La vue Memory marque une croyance lorsqu'elle est entrée dans une réponse. Voir [[dashboard]].
- Les **propositions** sont les suggestions de Litopys : fusionner deux faits, en retirer un, reformuler, épingler. Vous acceptez ou rejetez chacune.
- Des **habitudes** qu'un personnage montre clairement peuvent aussi apparaître, et devenir une habitude après s'être répétées dans plusieurs scènes.

## Où regarder

Appuyez sur **Record** dans l'en-tête de la discussion (sur un téléphone, dans le Menu) pour le registre de cette discussion dans un panneau latéral. La section **Library** du rail montre le registre de chaque discussion. Elle a deux vues : Overview (une chronologie, une carte par personnage, les propositions en attente) et Details avec les onglets Chapters, Facts, Proposals, Habits, Activity et Settings. L'onglet Activity journalise ce que Litopys a fait, avec **Undo** quand c'est possible. L'engrenage (« Litopys settings ») règle la façon dont le registre est écrit.

## Souvenirs mot pour mot des discussions précédentes

Un chapitre est un récit, donc un petit détail (la couleur d'une cape, une promesse exacte) peut en manquer. Quand cette discussion poursuit des discussions antérieures ([[long-chats]]), activez **Word-for-word memories of earlier chats** dans la Library, Litopys settings, bloc « In the prompt ». Alors, quand ce qui est dit partage plusieurs mots rares avec un passage antérieur, un ou deux passages des messages ORIGINAUX entrent dans la requête, étiquetés comme plus anciens que les faits. Il lit toute la chaîne, pas seulement les trois discussions les plus proches, et un personnage n'obtient un passage que d'une scène où il était présent. Aucun appel de modèle ; c'est désactivé par défaut et prend au plus « Word-for-word budget » jetons (400 par défaut). Si rien ne partage assez de mots rares, rien n'est ajouté. La vue Memory et le panneau Fired listent ce qui a été ajouté pour la dernière réponse ; le tableau Prompt du Canvas a son propre interrupteur pour la discussion.

## Ce qui entre dans la requête

Par défaut, le registre est inséré automatiquement. « Memory size » dit combien de jetons il peut prendre : Auto par défaut (15 % de la fenêtre du modèle, au moins 800 et au plus 16000), Compact (800 jetons) ou Custom de 200 à 16000. Auto laisse une grande fenêtre porter plus d'histoire ; sur un petit modèle, il reste près de 800. Une taille que vous avez enregistrée vous-même auparavant reste telle quelle. Quand tout tient, tout est envoyé ; sinon, les parties qui comptent le plus pour la scène. Un petit modèle veut une petite taille. « Chapters and facts » désactivé signifie : pas de nouveaux chapitres ni faits, et rien d'ajouté à la requête.

Les anciens messages ne peuvent quitter la requête que lorsque la fenêtre est pleine, ou scène par scène une fois qu'un chapitre les couvre ; le réglage « Older messages leave the prompt » choisit : « Only when the window is full » (par défaut) ou « By scenes ». [[long-chats]] dit lequel choisir.

## Matching by meaning

La mémoire trouve les faits et chapitres par les mots. Avec un modèle d'embeddings, elle les trouve aussi par le sens : une question formulée autrement atteint quand même le fait. La carte **Matching by meaning** (en haut du registre d'une discussion, et dans Canvas > Prompt > Memory) montre où en est la chose : off, failing, no vectors yet, partly done, done, ou made by another model. Configurez le modèle une fois dans Settings > Memory : par défaut, l'application utilise d'abord un modèle sur votre ordinateur (LM Studio ou Ollama), puis une connexion API avec une clé, puis OpenRouter. Dès qu'un appel au modèle d'embeddings a réussi (une pression sur le bouton de la carte, ou une réponse), le moteur remplit tout seul les vecteurs manquants de chaque discussion et de chaque fichier de la Data Bank, en vérifiant toutes les quelques minutes ; ce qui dépasse 300 000 jetons attend le bouton, et l'interrupteur **Make vectors by itself** dans Settings > Memory le désactive. Le bouton **Embed N items** indique d'abord combien d'éléments et environ combien de jetons cela prend, puis le fait tout de suite. Les nouvelles scènes intègrent leurs nouveaux éléments dans tous les cas. Si vous changez de modèle d'embeddings, les anciens vecteurs ne sont pas utilisés tant que vous n'avez pas appuyé sur **Embed again**. La Data Bank a sa propre carte, **Data Bank by meaning**, en haut de Settings > Data Bank : elle fonctionne de la même façon pour les passages de vos fichiers et des livres d'instantanés, et un fichier couvert en partie affiche « 7 of 12 by meaning ».

## Réglages d'une seule discussion

L'onglet **Settings** du registre d'une discussion (dans le panneau latéral Record et dans la Library, à côté d'Activity) règle Litopys pour cette discussion seule : la scène la plus courte et la plus longue, combien de messages récents restent mot pour mot (ou combien de messages directs restent après les scènes, quand les anciens messages quittent « By scenes »), la façon dont les anciens messages quittent la requête, et combien de faits un personnage peut avoir épinglés. Un champ laissé vide suit l'engrenage « Litopys settings » et affiche cette valeur sous la forme « Library: N ». Une valeur est enregistrée quand vous quittez le champ. « Use the Library settings » les efface toutes. Une discussion aux changements de scène fréquents s'en sort bien avec une scène la plus courte basse, disons 3 : une scène courte obtient alors son propre chapitre. Les chapitres déjà écrits restent tels quels ; utilisez Rebuild pour les réécrire avec les nouvelles longueurs.

## Suggestions et rangement

« Suggestions » a trois choix. « Ask me first » : chaque suggestion attend votre oui. « Only risky ones » (le réglage par défaut d'une nouvelle installation) : les suggestions courantes sont appliquées tout de suite, journalisées dans Activity avec un Undo, et seules les risquées attendent, chacune avec sa raison : une fusion qui dirait à plus de personnes un fait que seules certaines connaissaient, une modification d'un fait que vous avez épinglé, écrit, modifié ou marqué key, un changement durable ou une croyance, et un nouveau fait qui peut contredire un fait épinglé par vous. La même raison s'affiche dans la Inbox. « Apply pins and rewrites quietly » : seuls les épinglages et réécritures passent ; retirer et fusionner attendent votre accord. « Tidy facts automatically » cherche les doublons et contradictions après 30 nouveaux faits, à raison d'un appel de modèle supplémentaire par 60 faits.

## Reconstruire

« Rebuild from scratch » réécrit les chapitres et faits à partir des messages en arrière-plan, environ un appel de modèle toutes les 30 secondes. Vos propres faits modifiés et épinglés et vos chapitres modifiés restent, et le registre actuel est utilisé jusqu'à ce que le nouveau soit prêt. Il refuse de démarrer si aucune scène ne s'est fermée.

Si vous modifiez des messages après l'écriture d'un chapitre, ce chapitre est marqué comme périmé et réécrit.

## Liés

La carte d'un personnage peut aussi garder la mémoire des discussions terminées : voir [[memory]]. Les articles d'aide *Litopys: chapters and proposals*, *Facts and proposals* et *Overview vs Details* couvrent les écrans.
