<!-- source: c4250477e1b5 -->
# Direction : qui est dans la scène

Direction est conçue pour les discussions de groupe. Après chaque réponse, un petit modèle « directeur » peu coûteux lit la scène et indique de quel type de scène il s'agit (une leçon, une pause, un moment seul, un rendez-vous) et quels membres y participent. Les membres qui ne sont pas présents cessent de répondre et sont exclus du prompt jusqu'à ce que l'histoire les ramène.

## La barre

Dans une discussion de groupe, une fine barre se trouve sous la barre des membres, marquée « Direction » (sur un téléphone, seule l'icône apparaît). De gauche à droite :

- **Le chip de scène** : le type de scène et qui est présent (« Moment seul, avec Yuzu » ou « Leçon, 4 ici »). Touchez-le pour voir qui est présent et qui n'est pas dans la scène, la date du dernier rapport, et un bouton **Report now** qui interroge à nouveau le directeur. Pendant que le directeur lit, le chip affiche « Lecture de la scène… ».
- **Le chip de modèle** : le modèle du directeur. Si aucun n'est choisi, il affiche **Pick a model**. Touchez-le pour obtenir la même liste de modèles que la barre supérieure de la discussion : modèles favoris, puis tous les modèles par connexion, avec une zone de recherche.
- **L'interrupteur** : Direction activée ou désactivée pour cette discussion. Tant qu'aucun modèle n'est choisi, il est grisé et indique « Choisissez d'abord un modèle ».
- **Next** : un chip qui apparaît lorsqu'une règle de genre ou un beat de votre plan a une note en attente pour la prochaine réponse (« Next : Yuzu »). La croix l'ignore.
- **Rules** : ouvre la feuille Direction avec trois onglets, **Rules**, **Plan** et **Log**. Il se trouve à côté de l'interrupteur, donc toujours visible sur un téléphone (là, ce n'est qu'une icône, avec un point tant que les règles sont actives).

Avec l'interrupteur désactivé, la barre se replie en « Direction : off » et la discussion fonctionne comme avant.

## Règles de genre

Un genre est un ensemble de petites règles qui font entrer des personnages dans la scène au hasard, afin qu'une histoire de ce genre ne s'enlise pas. Ouvrez **Rules** et choisissez un genre dans la liste. Il y en a neuf : **School rom-com**, **Harem**, **Slice of life**, **Drama**, **Thriller**, **Detective**, **Steamy romance**, **Adventure** et **Horror**. Chacun comporte trois règles, construites à partir des mêmes quelques types de condition (seul avec un membre pendant certaines réponses, personne dans les parages pendant certaines réponses, la scène est d'un certain type, peu de personnes présentes) et des mêmes trois actions (quelqu'un surprend le moment, quelqu'un rejoint, quelqu'un revient). La fiche d'une règle dit en une phrase ce qu'elle fait. Par exemple, School rom-com comporte :

- **Interrupted moment** : vous êtes resté seul avec un membre pendant trois réponses, et quelqu'un entre et vous interrompt.
- **Someone comes by** : personne n'a été là pendant trois réponses (pas à la maison), et un membre passe.
- **Friends join the break** : pendant une pause, un déjeuner ou un club avec une ou deux personnes présentes, un ami se joint à eux.

Un genre indique aussi au directeur quels types de scènes rechercher. Tout le monde reçoit les habituels (leçon, pause, déjeuner, club, en chemin, sortie, rendez-vous, moment seul, à la maison, événement) ; un genre y ajoute quelques-uns des siens, comme danger, enquête, dispute, secret, nuit, voyage, travail, repas ou temps libre. Une discussion sans genre, ou avec School rom-com, ne voit que les habituels, donc rien ne change pour elle. Comme partout dans Direction, aucune règle ne se déclenche dans une scène explicite. Les chiffres de chaque genre sont des premières estimations.

Une discussion démarre sans genre et avec les règles désactivées : rien ne change tant que vous n'en choisissez pas un. Choisir un genre active les règles ; **Rules in this chat** les désactive à nouveau et conserve le genre. Les règles ont besoin que le directeur soit activé : elles lisent ses rapports.

Après chaque réponse, le code (et non un modèle) vérifie les règles dans l'ordre. Une règle peut se déclencher lorsque ses conditions sont remplies, qu'elle ne se repose pas, et qu'un jet de deux dés atteint son chiffre. Si elle se déclenche, la réponse suivante reçoit une courte note de scène (« Yuzu walks in on you and Hana and interrupts the moment ») et la personne compte comme présente, si bien que sa fiche est envoyée en entier. Une note au maximum par réponse. Le verrou, un retour après le verrou, ainsi qu'un événement ou une personne qui revient depuis World passent en premier ; la règle attend alors un autre tour.

Chaque fiche de règle affiche son état : **Ready**, **Cooling down** (réponses restantes) ou **Quiet for the payoff**, ainsi que le nombre de déclenchements vers le dénouement. **Numbers** ouvre ses réglages :

- **2d6 needed** : le jet doit atteindre ce nombre ; le texte à côté donne le pourcentage de jets (« about 42% »). 2 se déclenche toujours, 13 jamais.
- **Cooldown** : nombre de réponses pendant lesquelles la règle reste silencieuse après s'être déclenchée.
- **Payoff every** et **Then quiet** : à chaque K-ième déclenchement, la règle se repose M réponses de plus (« finally alone »). 0 désactive le dénouement.

**Fire now** place la note de la règle sur la prochaine réponse sans jet, sans délai de recharge et sans compter vers le dénouement ; il faut qu'une personne soit absente. **Skip** supprime une note en attente. Une note ignorée ou une réponse supprimée est oubliée, avec son délai de recharge ; balayer la réponse qui portait une note donne au nouvel essai la même note.

Sous la réponse qui portait une note, une petite ligne indique ce qui s'est passé : « Direction : Mei joins (Friends join the break, 2d6 = 10, needed 9) · came ». Le dernier mot est le rapport ultérieur du directeur : **came** (elle est dans la scène), **only mentioned** (seulement mentionnée) ou **did not come** (elle n'est pas venue). L'onglet **Log** liste la même chose avec le jet et la raison, ainsi que les règles qui ont tiré et raté.

Un groupe peut définir un **default genre** dans son onglet **Direction** ; ses nouvelles discussions démarrent alors avec ce genre activé. Les chiffres ne sont que des premières estimations : modifiez-les dans une discussion si une règle se déclenche trop souvent ou trop rarement.

**Who comes.** Chaque fiche de règle propose un choix **Who comes** : **Members** (par défaut : quelqu'un du groupe, celui qui est absent depuis le plus longtemps), **World people** (une personne du World de cette discussion, comme un professeur ou un voisin que l'histoire connaît déjà) ou **Either** (une pièce décide lorsque les deux existent). Les personnes du World viennent du livre World de la discussion ; celles qui sont retirées, celles qui sont réglées pour ne pas revenir d'elles-mêmes, et celles qui sont déjà dans la scène sont exclues. Sans personnes dans le World, les deux autres options sont grisées et indiquent pourquoi. La note de la réponse suivante dit en une phrase, tirée de sa fiche, qui est cette personne et qu'elle ne fait pas partie du groupe ; personne ici n'a sa fiche, donc le modèle qui écrit la joue à partir de cette phrase. Une personne qui n'est que sur le banc et pas dans votre groupe peut interrompre, rejoindre ou passer de cette façon.

## Le plan

Un **beat** est quelque chose que vous voulez voir arriver : « La cloche sonne et la classe se vide dans le hall », « Mei apporte un gâteau ». Ouvrez **Plan** et touchez **Add beat**. Un beat comporte :

- **What happens** : une ou deux phrases, comme une indication de mise en scène.
- **Who takes part** (facultatif) : les membres absents entrent dans la scène pour lui. Sous **People from the World**, vous pouvez aussi choisir des personnes que l'histoire connaît déjà (un professeur, un rival) ; la note indique au modèle qui elles sont. Les personnes sont choisies dans le livre World de la discussion : il n'y en a aucune à choisir tant qu'il n'en contient pas.
- **When** : **After some replies** (comptées à partir du moment où le beat devient le suivant ; 0 signifie tout de suite), **Scene** (lorsque le directeur lit ce type de scène : une leçon, une pause, un rendez-vous...), **Place** (lorsque le lieu du Dashboard contient vos mots, comme « roof » ; sans tenir compte des majuscules) ou **By hand** (seulement lorsque vous appuyez sur **Fire now**).
- **Wait for a new scene** : activé par défaut. Un beat échu ne coupe pas au milieu d'un moment : il attend jusqu'à 6 réponses que l'histoire change de lieu ou fasse un saut dans le temps, puis part de toute façon. Un beat de lieu part dès que l'histoire y arrive, et un beat **By hand** seulement lorsque vous le déclenchez.

Vous n'avez pas à écrire chaque beat à partir de rien. **From the genre** (à côté de **Add beat**) liste des beats prêts à l'emploi du genre de la discussion (« A rumour about the two of them starts going around the school ») ; choisir l'un ouvre l'éditeur rempli, vous indiquez qui participe, puis vous enregistrez. Il faut qu'un genre soit choisi dans **Rules**. **Draft from the cards** demande une seule fois au modèle du directeur de lire les fiches des membres (et le genre, s'il y en a un) et de proposer cinq à huit beats dans l'ordre, construits à partir de qui sont ces personnages. Cela prend de quelques secondes à une minute. Les suggestions s'ouvrent dans une fiche **Draft** avec une coche sur chacune : décochez celles que vous ne voulez pas et appuyez sur **Add** pour mettre les autres à la fin du plan. Rien n'est enregistré avant que vous ajoutiez ; fermer la feuille abandonne le brouillon, et un beat déjà présent dans votre plan n'est pas suggéré à nouveau. Le brouillon ne vaut que ce que vaut le modèle du directeur ; modifiez ensuite les beats comme n'importe lesquels.

Le plan se déroule **dans l'ordre** : seul le premier beat non terminé est pris en compte ; ceux qui suivent disent « After the beats before it ». Un beat est terminé lorsqu'il est arrivé, lorsqu'il a été abandonné (le directeur l'a vu laissé de côté deux fois) ou lorsque vous le **Skip**. Le beat suivant compte ses réponses à partir de la fin du précédent. Chaque carte indique où en est son beat : **Waiting** (réponses restantes), **Due, waiting for a new scene** (réponses restantes), **Goes with the next reply**, **Delivered** (came, only mentioned, ou entré alors que personne n'était nommé), **Did not land**, **Skipped**. Si quelque chose retient un beat, la carte en donne la raison : Direction est désactivée, la scène est verrouillée, ou la scène est explicite (un beat ne se déclenche jamais dans une telle scène ; il part lorsque la scène la quitte). **Edit**, **Move up**, **Move down** et **Delete** modifient la liste ; **Fire now** place le beat sur la prochaine réponse tout de suite, quoi qu'il attende.

Un beat utilise la même mécanique qu'une règle de genre : après chaque réponse, le code examine le plan avant les règles ; la note voyage avec la réponse suivante (une note par réponse ; le verrou, un retour après le verrou, ainsi qu'un événement ou une personne qui revient depuis World passent en premier, et le beat repart à la réponse suivante), et le rapport ultérieur du directeur indique s'ils sont **came**, s'ils sont **only mentioned**, ou si le beat **did not land**. Comme le directeur ne connaît que les membres du groupe, pour la seule réponse qui porte une note nommant des personnes du World, on lui demande aussi si ces personnes sont dans la scène ; chaque autre réponse est lue comme auparavant. Un beat qui n'a pas abouti est retenté une fois avec une note plus stricte, puis abandonné. Une réponse que vous balayez donne au nouvel essai la même note ; une réponse que vous supprimez rend son beat.

## Choisir le modèle

Il existe un seul modèle directeur pour toutes les discussions et tous les groupes. Choisissez-le depuis n'importe quelle barre, ou depuis l'onglet **Direction** du groupe. Il n'y a pas de valeur par défaut : c'est vous qui choisissez. Un petit modèle rapide suffit : il coûte un court appel après chaque réponse.

Une nouvelle discussion de groupe démarre avec Direction activée dès qu'un modèle est choisi. Les discussions que vous aviez déjà ne sont pas modifiées. Chaque discussion a son propre interrupteur.

## Qui est absent

Le chip d'un membre change lorsque quelqu'un est hors de la scène : l'image est atténuée et porte une petite marque de porte. Une marque de verrou signifie que le verrou (ci-dessous) l'a laissé de côté. Touchez un chip : sa fenêtre indique « Here » ou « Not in the scene ».

Un membre absent ne prend pas son tour de lui-même, et sa fiche n'est pas envoyée au modèle : une seule ligne indique qu'il n'est pas dans la scène. Le nommer dans votre message le fait tout de même entrer. Lorsque le directeur le voit revenir, sa fiche complète réapparaît.

## Le verrou et le retour

Pour garder une scène avec une seule personne, touchez le chip d'un membre et choisissez **Only <name> in the scene**. Un chip « Only Yuzu » apparaît avant le chip de scène, et les autres restent dehors quoi que dise le directeur. Touchez la croix de ce chip, ou **Release the lock** dans la fenêtre d'un membre, pour le lever. À la réponse suivante, les autres apprennent qu'ils peuvent revenir et l'histoire est invitée à leur ouvrir un chemin.

## Si le directeur échoue

Si la réponse du directeur ne peut pas être lue, ou si l'appel échoue, le chip de scène affiche **No report** ; ouvrez-le pour voir pourquoi. La discussion utilise alors l'idée que le Dashboard se fait de qui est présent, ou laisse tout le monde répondre comme avant. Rien de votre histoire n'est perdu.

## Nouveaux groupes

**New group** ouvre une large fenêtre (plein écran sur un téléphone). Nommez le groupe, ou laissez le nom vide pour utiliser les trois premiers membres. Recherchez, filtrez avec **All**, **Favourites** et **Recent**, utilisez des chips de tags et un tri (Name, Recently used, Most chats), et touchez les portraits pour choisir. Les membres choisis s'alignent en haut, dans l'ordre de parole ; les flèches déplacent un membre plus tôt ou plus tard, la croix le retire. **Next** demande deux caractères.

Après **Next**, le groupe est créé et son éditeur s'ouvre avec une note : vérifiez comment il se joue, puis démarrez la première discussion. **Start chat** est le bouton principal. L'onglet **Direction** détermine si les nouvelles discussions de ce groupe démarrent avec Direction activée, et affiche le modèle du directeur. Un groupe sur la page des groupes ouvre le même éditeur, tout comme le nom du groupe en haut de sa discussion.

Lorsque vous démarrez une discussion ultérieure d'un groupe, l'étape courte qui précède la discussion comporte un interrupteur **Direction** : activé lorsque la valeur par défaut du groupe est activée et qu'un modèle est choisi.

Voir aussi [[characters]] et [[dashboard]].
