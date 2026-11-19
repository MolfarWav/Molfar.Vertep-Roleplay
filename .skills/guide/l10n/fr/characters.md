<!-- source: 63580e32deab -->
# Personnages, personas et groupes

Tout ce avec quoi vous jouez se trouve dans quatre sections : Characters, Groups, Personas et Marketplace. Cette page explique à quoi sert chacune ; les articles d'aide *Your characters*, *The card editor tabs* et *Groups of characters* donnent les détails.

## Cartes

Une carte est un personnage : description, personnalité, scénario et un premier message. Un tag écrit `group: Guild of Ravens` ou `faction: Guild of Ravens` place aussi le personnage de la carte dans ce groupe, ainsi un fait de mémoire confié au groupe lui est connu ([[litopys]]). La section Characters affiche vos cartes en grille ou en liste, avec recherche, tags, dossiers, favoris (une étoile) et plusieurs tris. Ouvrez une carte pour la modifier. Les modifications restent en brouillon jusqu'à "Save changes" ; quitter avec des modifications non enregistrées demande d'abord confirmation.

L'éditeur a six onglets :

- **Core** : le texte de la carte, le dialogue et le message d'accueil.
- **Profile** : la même description répartie en champs structurés (identité, apparence, objectifs). Chaque enregistrement les réécrit dans le texte de la carte. Une carte narrateur peut y décrire toute une distribution.
- **Soul** : comment le personnage réagit à vous, plus ses habitudes. Voir [[soul]].
- **Memory** : les conversations terminées dont le personnage se souvient. Voir [[memory]].
- **Lorebook** : les livres liés à cette carte.
- **More** : couleurs et voix, sprites (voir [[sprites]]), galerie, regex, réglages avancés.

Une carte peut jouer plusieurs personnages à la fois (un narrateur ou un maître de jeu). Sous Colors, "Voices" donne à chaque interlocuteur sa propre couleur. Si vous ne listez aucune voix, la conversation s'en charge : une carte qui contient plusieurs personnages (des sections nommées d'après chacun) colore elle-même les répliques de chaque personnage, chacune d'une couleur différente, conservée avec la conversation. Dans toute autre conversation, ouvrez le menu de la conversation, "Voice colors", et activez l'interrupteur ; "Spread colors" donne à chacun de ceux que vous n'avez pas choisis une couleur différente. Cela nécessite le tableau de bord Relationship, qui fournit la liste des personnages.

## Personas

Une persona, c'est vous : nom, pronoms, description, avatar. Le modèle la voit partout où le prompt parle de l'utilisateur. "Use this persona" en fait votre persona par défaut et bascule la conversation ouverte dessus. Une persona peut porter ses propres lorebooks et être verrouillée sur des personnages choisis, pour que les nouvelles conversations avec eux démarrent avec elle. L'onglet Lorebooks d'une persona liste les livres qu'elle porte (ouvrez-en un, dissociez-le, ajoutez-en d'autres depuis une liste que vous pouvez rechercher, ou créez-en un nouveau). Une persona peut avoir son propre livre ("New book" sur un onglet vide le crée, "Replace" le remplace) : il voyage dans le fichier de la persona, donc Export et Backup l'emportent et l'importation du fichier sur un autre appareil le restaure, lié. Les livres qu'elle ne fait que lier restent dans la bibliothèque de cet appareil ; un lien dont le livre manque s'affiche comme une ligne "Not in your library" que vous pouvez supprimer. L'importation sur l'écran Personas accepte une persona d'une autre application (un nom et une description), une sauvegarde de plusieurs, ou une liste `{ name: description }` ; une persona qui nomme des livres que vous n'avez pas encore importés est importée quand même, avec une note indiquant lesquels manquent.

## Groupes

Un groupe réunit plusieurs personnages dans une seule conversation. "New group" vous laisse choisir les membres. L'éditeur comporte Overview, Members, Scene, Turns, Lore et Chats. L'onglet Turns décide qui répond : Narrator (une seule réponse fait parler tout le monde) ou Each in turn. Un nouveau groupe démarre en Narrator.

L'onglet Turns contient aussi **How they talk** : **Interruptions** (les membres coupent la parole, parlent par-dessus les autres ou ignorent une question quand cela convient à leur personnage), **Own goals** (les membres objectent, négocient ou refusent quand un plan va à l'encontre de ce qu'ils sont, même si cela crée des tensions avec vous) et **Draw in quiet members** (quelqu'un qui est resté silencieux un moment a plus de chances de répondre, et une scène narrée est invitée à l'intégrer). Les deux premiers sont Off, Can ou Should : Can l'autorise quand cela convient à la scène, Should l'attend, et si chaque réponse tourne à la dispute, revenez à Can. Les nouveaux groupes démarrent avec Can et Draw in activés ; les groupes plus anciens gardent tout désactivé jusqu'à ce que vous l'activiez. Le bouton Turns propre à la conversation peut les modifier pour une seule conversation. Dans l'onglet Members, ouvrez la section "In this group" d'un membre pour lui donner une **voice** que seul ce groupe utilise : jusqu'à deux habitudes de parole (parle par fragments, ne pose jamais de questions) et jusqu'à cinq répliques d'exemple. Quelques lignes enseignent mieux le rythme que des adjectifs, et différents personnages devraient réagir différemment à la même nouvelle.

Un groupe n'est pas une carte : supprimer un groupe supprime ses conversations, jamais ses membres. Les membres sans couleur propre reçoivent automatiquement des couleurs différentes.

## Obtenir des cartes

- "Import card" accepte les fichiers PNG ou JSON, un ou plusieurs, ainsi que des liens vers Chub, RisuRealm, CharaVault, Botbooru ou un fichier direct.
- Le Marketplace recherche dans plusieurs sources à la fois ; ouvrez un résultat pour lire la carte complète avant de l'importer. Chaque source a son propre ordre de tri et son filtre adulte, et certaines nécessitent un téléchargement manuel.
- Export écrit un PNG avec la carte à l'intérieur.
- "With Molfar" sur Home (et dans Lorebooks) demande à Molfar de rédiger une carte ou un lorebook avec vous. Voir [[vertep:molfar]].

## Lettres des cartes

Une carte à laquelle vous n'avez pas joué depuis un moment peut vous écrire un court mot de sa propre voix. Le mot arrive dans la boîte de réception ("Waiting on you" de Home, le bouton de boîte de réception dans la barre latérale) sous forme de Letter verte ; l'ouvrir vous mène à l'ancienne conversation, ou démarre une conversation pour une carte à laquelle vous n'avez jamais joué. Une lettre n'écrit jamais dans une conversation et n'invente jamais d'événements.

C'est **désactivé tant que vous ne l'activez pas**. Tant que c'est désactivé, une carte verte "Let your characters write to you" figure en haut de la section Characters et dans "Waiting on you" de Home : **Turn on** l'active aussitôt, **Not now** masque la carte définitivement. Les nombres (jours d'inactivité, lettres par jour, jours entre les lettres d'une même carte, le modèle de rédaction) et les cartes que vous avez arrêtées se trouvent dans Characters, More, Letters from cards. Les lettres sont vérifiées toutes les quelques heures tant que l'application est ouverte : une conversation inactive depuis 14 jours, une carte à laquelle vous n'avez jamais joué depuis 14 jours, et une carte jouée sans Soul (une fois). Si le modèle de rédaction échoue trois vérifications d'affilée (ou si aucun n'est défini), la boîte de réception affiche un échec "Letters" en rouge avec la raison, et Open vous mène aux réglages Letters ; une lettre qui arrive, un autre modèle ou la désactivation des lettres efface cet échec.

## Portraits pour les cartes qui n'en ont pas

Une carte sans image propre (rien, ou l'avatar par défaut) peut être dessinée. **Une carte :** dans l'éditeur de carte, "Draw" sous le portrait ouvre une boîte de dialogue : choisissez le modèle d'image, un modèle de texte (le modèle Card tasks) rédige une description de la carte, que vous pouvez modifier, et le modèle d'image la dessine. L'image va aussitôt dans la Gallery de la carte et "Use as portrait" en fait l'avatar. **Plusieurs cartes :** Characters, More, "Draw missing portraits (N)" demande quel modèle puis les dessine l'une après l'autre via la carte de progression ; Cancel arrête entre deux cartes et une carte qui échoue est listée avec la raison.

"Draw with" liste les modèles d'image de Settings > Images : un ComfyUI ou Forge local à côté des modèles API. Le premier choix est le modèle d'image propre à l'application (Extensions > Image generation) ; un choix fait ici n'est mémorisé que pour les portraits. Un modèle entraîné sur des tags reçoit une ligne de tags, un modèle API un paragraphe. Une carte qui n'a qu'un nom n'a rien à décrire, et la boîte de dialogue le dit. La génération d'images doit être activée (Extensions) ; les boîtes de dialogue le disent et l'ouvrent pour vous.

## Ce qu'une carte ne contient pas

L'état du Dashboard, les chapitres et les faits appartiennent à chaque conversation, pas à la carte. La mémoire de carte ne fait pas non plus partie de la carte et n'apparaît jamais dans un export. Le Soul, en revanche, est enregistré dans la carte.

Ensuite : [[first-story]] pour la première conversation, ou [[soul]] pour le profil de réaction.
