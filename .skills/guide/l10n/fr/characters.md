<!-- source: a93fd36e3690 -->
# Personnages, personas et groupes

Tout ce avec quoi vous jouez vit dans quatre sections : Personnages, Groupes, Personas et Marché. Cette page dit à quoi sert chacune ; les articles d'aide *Vos personnages*, *Les onglets de l'éditeur de carte* et *Groupes de personnages* donnent les détails.

## Cartes

Une carte est un personnage : description, personnalité, scénario et un premier message. Une étiquette écrite `group: Guild of Ravens` ou `faction: Guild of Ravens` place aussi le personnage de la carte dans ce groupe, afin qu'un fait de mémoire raconté au groupe soit connu de ses membres ([[litopys]]). La section Personnages montre vos cartes en grille ou en liste, avec recherche, étiquettes, dossiers, favoris (une étoile) et plusieurs tris. Ouvrez une carte pour la modifier. Les modifications restent dans un brouillon jusqu'à « Save changes » ; partir avec des modifications non enregistrées demande d'abord confirmation.

L'éditeur a six onglets :

- **Cœur** : le texte de la carte, le dialogue et la salutation.
- **Profil** : la même description découpée en champs structurés (identité, apparence, objectifs). Chaque enregistrement les réécrit dans le texte de la carte. Une carte narrateur peut décrire ici toute une distribution.
- **Âme** : comment le personnage réagit à vous, plus les habitudes. Voir [[soul]].
- **Mémoire** : les discussions terminées dont le personnage se souvient. Voir [[memory]].
- **Livre de connaissances** : livres liés à cette carte.
- **Plus** : couleurs et voix, sprites, galerie, regex, paramètres avancés.

Une carte peut jouer plusieurs personnages à la fois (un narrateur ou maître de jeu). Sous Couleurs, « Voices » donne à chaque locuteur sa propre couleur. Si vous n'indiquez aucune voix, la discussion le fait pour vous : une carte qui contient plusieurs personnages (des sections nommées d'après chacun) colore d'elle-même les répliques de chaque personnage, chacun d'une couleur différente, conservée avec la discussion. Dans toute autre discussion, ouvrez le menu de la discussion, « Voice colors », et activez l'interrupteur ; « Spread colors » donne une couleur différente à tous ceux que vous n'avez pas choisis. Cela demande le tableau de bord Relationship, qui fournit la liste des personnages.

## Personas

Un persona, c'est vous : nom, pronoms, description, avatar. Le modèle le voit partout où la requête parle de l'utilisateur. « Use this persona » en fait votre persona par défaut et bascule la discussion ouverte dessus. Un persona peut porter ses propres livres de connaissances et peut être verrouillé sur des personnages choisis, afin que les nouvelles discussions avec eux commencent avec lui.

## Groupes

Un groupe réunit plusieurs personnages dans une seule discussion. « New group » permet de choisir les membres. L'éditeur a les onglets Vue d'ensemble, Membres, Scène, Tours, Connaissances et Discussions. L'onglet Tours décide qui répond : Narrateur (une seule réponse fait parler tout le monde) ou Chacun à son tour. Un nouveau groupe commence en mode Narrateur. Un groupe n'est pas une carte : supprimer un groupe supprime ses discussions, jamais ses membres. Les membres sans couleur propre reçoivent automatiquement des couleurs différentes.

## Obtenir des cartes

- « Import card » accepte les fichiers PNG ou JSON, un ou plusieurs, et propose des liens vers Chub, RisuRealm, CharaVault, Botbooru ou un fichier direct.
- Le Marché cherche dans plusieurs sources à la fois ; ouvrez un résultat pour lire la carte complète avant de l'importer. Chaque source a son propre ordre de tri et son filtre adulte, et certaines demandent un téléchargement manuel.
- Exporter écrit un PNG contenant la carte.
- « With Molfar » sur Home (et dans les Livres de connaissances) demande à Molfar de rédiger une carte ou un livre de connaissances avec vous. Voir [[vertep:molfar]].

## Lettres des cartes

Une carte que vous n'avez pas jouée depuis un moment peut vous écrire un court message dans sa propre voix. La lettre arrive dans la boîte de réception (« Waiting on you » de Home, le bouton de boîte dans le rail) sous forme de Lettre verte ; l'ouvrir vous mène à l'ancienne discussion, ou démarre une discussion pour une carte que vous n'avez jamais jouée. Une lettre n'écrit jamais dans une discussion et n'invente jamais d'événements.

Elle est **désactivée tant que vous ne l'activez pas**. Tant qu'elle est désactivée, une carte verte « Let your characters write to you » se trouve en haut de la section Personnages et dans « Waiting on you » de Home : **Turn on** l'active immédiatement, **Not now** masque la carte pour de bon. Les réglages (jours d'inactivité, lettres par jour, jours entre deux lettres d'une même carte, le modèle d'écriture) et les cartes que vous avez arrêtées se trouvent dans Personnages, Plus, Lettres des cartes. Les lettres sont vérifiées toutes les quelques heures tant que l'application est ouverte : une discussion inactive depuis 14 jours, une carte jamais jouée depuis 14 jours, et une carte jouée sans Âme (une seule fois).

## Portraits pour les cartes sans image

Une carte sans image propre (aucune, ou l'avatar par défaut) peut être dessinée. **Une carte :** dans l'éditeur de carte, « Draw » sous le portrait ouvre une boîte de dialogue : choisissez le modèle d'image, un modèle de texte (le modèle des tâches de carte) rédige une description de la carte, que vous pouvez modifier, et le modèle d'image la dessine. L'image va tout de suite dans la Galerie de la carte, et « Use as portrait » en fait l'avatar. **Plusieurs cartes :** Personnages, Plus, « Draw missing portraits (N) » demande quel modèle, puis les dessine une à une via la carte de progression ; Cancel arrête entre deux cartes, et une carte en échec est listée avec la raison.

« Draw with » liste les modèles d'image des Paramètres > Images : un ComfyUI ou Forge local à côté des modèles API. Le premier choix est le modèle d'image de l'application (Extensions > Image generation) ; un choix fait ici n'est retenu que pour les portraits. Un modèle entraîné aux étiquettes reçoit une ligne de balises, un modèle API un paragraphe. Une carte avec seulement un nom n'a rien à décrire, et la boîte de dialogue le dit. La génération d'images doit être activée (Extensions) ; les boîtes de dialogue le signalent et l'ouvrent pour vous.

## Ce qu'une carte ne contient pas

L'état du Dashboard, les chapitres et les faits appartiennent à chaque discussion, pas à la carte. La mémoire de carte ne fait pas non plus partie de la carte et n'apparaît jamais dans un export. L'Âme, en revanche, est enregistrée dans la carte.

Ensuite : [[first-story]] pour la première discussion, ou [[soul]] pour le profil de réaction.
