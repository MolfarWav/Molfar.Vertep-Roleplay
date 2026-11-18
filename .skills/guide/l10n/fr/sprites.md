<!-- source: f7cfe4722702 -->
# Sprites et fenêtres de sprites

Les sprites sont de petites images d'un personnage, une par émotion, qui apparaissent par-dessus le chat et changent au fil de l'histoire. Cette page s'adresse à ceux qui veulent voir plusieurs personnages à la fois, dans un groupe ou avec une carte de narrateur, ou qui veulent obtenir un rendu de visual novel.

## Ce qu'est une fenêtre de sprite

Une fenêtre de sprite flotte au-dessus du chat et montre **un personnage**. Elle choisit l'image d'après les dernières répliques de ce personnage (avec les mêmes règles de mots-clés qu'avant ; aucun modèle n'est appelé), et l'image reste jusqu'à ce que le personnage reparle. Faites glisser une fenêtre où vous voulez, faites glisser son coin inférieur pour la redimensionner (double-clic sur le coin pour revenir à la taille par défaut) et appuyez sur **×** pour la replier en une petite pastille ronde ; appuyez sur la pastille pour la rouvrir.

Les sprites s'ajoutent à une carte dans l'éditeur, onglet **Plus**, **Sprites**. Les paramètres ont un interrupteur, « Expression Sprites », qui désactive toutes les fenêtres.

## Une fenêtre ou plusieurs

Un nouveau chat a une fenêtre qui suit **celui qui parle**, comme toujours. Appuyez sur l'engrenage d'une fenêtre pour ouvrir **Sprite windows** :

- **Add window** (jusqu'à 8). Une nouvelle fenêtre affiche « Next in the scene ».
- **Shows**, par fenêtre : « Whoever speaks », « Next in the scene » ou un personnage précis (un membre du groupe ou une voix d'une carte de narrateur).
- **Transparent background**, par fenêtre : ni cadre ni fond, seulement l'image. Les clics la traversent jusqu'au texte du chat, donc une telle fenêtre se déplace avec la petite poignée en haut à gauche.
- **Visible part** : un curseur de 35 % à 100 % (100 % par défaut). Moins de 100 % n'affiche que le haut de chaque image, les jambes sont donc coupées (en buste jusqu'à la taille, ou un buste à 40 %) ; la hauteur de la fenêtre correspond alors à la partie visible, et l'image est dessinée plus grande en conséquence. Avec la bande sous le texte, cela donne le rendu visual novel et laisse au chat presque toute sa hauteur.
- **Windows are** : « In front of the text » (par défaut), « Behind the text » (le texte du chat est dessiné par-dessus les images, qui restent dessous ; chaque message reçoit un fond de la couleur de la page pour rester lisible, et le curseur **Text backing** règle son intensité de 0 % à 100 %, 55 % par défaut ; les boutons d'une fenêtre deviennent pâles et la fenêtre se déplace par sa poignée) ou « In a strip under the text » (le chat garde sous son texte une bande pour les fenêtres, si bien qu'aucun texte ne passe sous une image ; les fenêtres restent alors en bas et ne se déplacent que latéralement, et la bande a la hauteur de la plus haute fenêtre). Ces options sont pour les tablettes et les ordinateurs ; un téléphone les garde au premier plan.
- **Arrange** : « Row at the bottom » (le rendu visual novel) ou « Grid ». Elles ne font que placer les fenêtres ; vous les faites glisser ensuite.
- **Hide empty windows**.
- **Back to one window**.

La disposition est enregistrée **par chat, dans ce navigateur**. Elle ne suit pas sur un autre appareil.

## Qui est « dans la scène »

Les fenêtres « Next in the scene » montrent les personnes de la scène autres que celui qui parle, et un personnage **garde sa fenêtre** tant qu'il reste : personne ne saute dans une autre fenêtre quand quelqu'un d'autre parle. Quand un personnage quitte la scène, sa fenêtre devient vide (« Nobody here ») ou disparaît si « Hide empty windows » est activé, et le prochain arrivant prend une fenêtre libre.

La scène est la liste « Present » du Dashboard quand le Dashboard a lu l'histoire (voir [[dashboard]]). Sans lui, la scène est formée de ceux qui ont parlé dans les six derniers messages.

## Tenues

Un personnage qui a plus d'une tenue reçoit un petit sélecteur de tenue sur la fenêtre. Le choix est conservé pour le chat et est distinct pour chaque membre d'un groupe.

## Sur un téléphone

Un téléphone affiche **une seule fenêtre** ; les autres personnes de la scène sont de petites images rondes en bas à gauche. Touchez-en une pour montrer ce personnage dans la fenêtre, touchez-la de nouveau pour revenir au suivi de celui qui parle. Les fenêtres transparentes, la disposition et les fenêtres supplémentaires sont réservées aux tablettes et aux ordinateurs.

## Ce que cela ne fait pas

Cela ne dessine rien et ne lit pas l'histoire avec un modèle : un personnage sans sprites n'a pas de fenêtre, et un personnage qui n'a jamais parlé montre son image par défaut. Un membre de groupe sans sprites est ignoré.
