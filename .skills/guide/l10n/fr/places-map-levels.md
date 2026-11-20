<!-- source: 4799ca6e92d8 -->
# Plusieurs cartes et dessiner une carte

Un chat peut avoir plus d'une carte sur la carte des lieux (un pays, une ville, un donjon), et n'importe quelle carte peut recevoir une image peinte par le modèle d'image. Cette page est pour quiconque joue dans un monde à plus d'une échelle. Les bases de la carte se trouvent sur [[places-map]].

## Plusieurs cartes

Un chat peut avoir plus d'une carte : un pays, le plan d'une ville, un donjon. Chacune a sa propre image, ses lieux, ses routes et son échelle. Ouvrez le menu engrenage et choisissez **Cartes de ce chat** : la première carte est listée, **Ajouter une carte** en crée une autre. Pour chaque carte, vous définissez :

- **Nom.**
- **Échelle :** Ville (un trajet prend quelques minutes : rues, un bâtiment, un niveau de donjon), Région (des heures : villages, bois et routes entre eux) ou Monde (des jours : cités et contrées éloignées). L'échelle détermine la durée d'un trajet sur cette carte, et les moyens de déplacement proposés : à pied, à cheval et sauter la route partout, un taxi sur les cartes de ville et de région, le métro sur les cartes de ville.
- **Plan de :** le lieu dont cette carte est le plan (la carte d'une ville est le plan de cette ville), ou aucun.

Une fois qu'il y a plusieurs cartes, une ligne sous l'en-tête montre la carte que vous regardez avec un chevron : appuyez dessus pour changer, ou pour rouvrir la liste. La carte que vous regardez est mémorisée par chat dans ce navigateur. Une carte qui est le plan d'un lieu affiche une flèche de retour vers la carte qui contient ce lieu.

**Un lieu n'existe que sur les cartes où vous le placez.** **Lieux sur cette carte** (menu engrenage) liste chaque lieu avec une case à cocher : cochez un lieu pour l'afficher sur cette carte, décochez pour le retirer de cette carte uniquement (ses salles suivent ; un lieu sur aucune carte retourne sur la carte où se déroule l'histoire). Un nouveau lieu ajouté par le DM va sur la carte où se déroule l'histoire ; une nouvelle cité, un nouveau village ou un nouveau château va aussi sur les cartes de région et de monde. Une nouvelle carte de région ou de monde commence avec les cités, villages et châteaux que vous avez déjà. Une nouvelle carte de ville commence vide et le dit, avec un bouton pour la même liste.

**Un lieu qui a sa propre carte** reçoit un bouton **Ouvrir la carte de ce lieu** sur sa fiche ; **Créer une carte de ce lieu** dans son menu à trois points crée une carte vide qui est son plan et l'ouvre. Un lieu que vous ouvrez depuis la carte du pays est le même lieu que sur la carte de la ville ; le lieu de l'histoire sur la carte du pays est la ville dont le plan le contient (tant que l'histoire se déroule dans la taverne de la ville, la carte du pays marque la ville).

Une route est conservée sur la carte qui contient ses deux lieux. Le voyage se fait à l'intérieur d'une seule carte : sur la carte du monde, vous allez de ville en ville et l'histoire arrive à la ville elle-même ; pour aller dans une taverne de celle-ci, ouvrez la carte de la ville (la flèche de retour et le bouton Ouvrir permettent de passer de l'une à l'autre) et partez de là.

L'image d'une carte se choisit comme n'importe quelle autre (une carte prête, la vôtre, aucune, ou dessinée) : une carte de Région ou de Monde part d'un plan de région quels que soient les lieux, une carte de Ville part du plan qui convient à ses lieux.

## Dessiner une carte

**Dessiner une carte avec le modèle d'image** (menu engrenage) peint une image pour la carte affichée avec le modèle d'image que vous avez choisi dans Settings > Images. La fenêtre contient :

- **Quel type de carte :** région, continent, ville fortifiée, ville portuaire, village, nature sauvage, côte, plan de maison, donjon, grottes, et les types de la ville moderne (centre-ville, métropole, banlieue, quartier industriel, campus, front de mer, aéroport, petite ville). Une carte de Région démarre sur Région, une carte de Monde sur Continent.
- **Quoi dessiner :** un prompt rempli à partir du type et des noms des lieux sur la carte. Il ne demande que le terrain (terre, eau, routes, parcelles vides) car vos lieux sont des icônes posées par-dessus. Modifiez-le comme vous voulez ; choisir un autre type le réécrit tant que vous ne l'avez pas modifié.
- Une ligne avec le modèle d'image et un rappel que chaque image est un appel qui peut coûter de l'argent.

**Dessiner la carte** fait un appel et montre le résultat dans la fenêtre ; rien n'a encore changé. **Utiliser cette carte** en fait l'image de cette carte (les autres cartes gardent la leur), **Redessiner** revient au prompt. Si aucun modèle d'image n'est configuré, l'appel le signale ; ajoutez-en un dans Settings > Images.
