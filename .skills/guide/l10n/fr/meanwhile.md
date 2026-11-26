<!-- source: b6e3ca620392 -->
# Meanwhile : la vie hors écran

Meanwhile permet aux personnes qui ne sont pas dans la scène de faire des choses pendant que l'histoire continue : Bram vend un cheval au port, Ada cache le grand livre, un front se rapproche d'un pas de son objectif. C'est une version de test, désactivée par défaut.

## L'activer

Ouvrez la fiche **World** du chat et trouvez la carte **Meanwhile**. Activez "Let people off screen act". L'interrupteur vaut pour tous les chats. Il a besoin que le **Dashboard** soit activé, car Meanwhile lit les scènes depuis celui-ci, et il a besoin de quelqu'un pour agir : une fiche de personnage qui n'est pas dans la scène, ou une personne du carnet du World DM.

## Quand cela se déclenche

Une passe se lance après une réponse quand au moins deux nouvelles réponses sont arrivées et qu'une nouvelle scène a commencé ou que l'horloge de l'histoire a avancé de six heures. Une passe, c'est un appel au modèle. Elle utilise son propre modèle si vous en avez défini un, sinon celui du World DM, du capteur du Dashboard, de la Library, du chat, de l'application. La carte indique lequel. "Run a pass now" en lance une immédiatement.

Une passe demande jusqu'à trois petits événements. Elle lit la scène qui vient de se clore, les fils ouverts du Dashboard, les fronts et, pour chaque personne, l'endroit où le World DM l'a laissée, pour qu'un événement la fasse avancer au lieu de rejouer le moment où elle est restée. L'application vérifie chacun d'eux : les personnes doivent être connues du chat, jamais votre personnage et jamais quelqu'un qui est dans la scène, et les effets doivent venir d'une liste courte. Un événement qui échoue à une vérification est écarté en entier, et le journal explique pourquoi. Un événement qui redit ce qu'un événement antérieur sur la même personne a déjà dit est lui aussi écarté (« repeats an earlier event »). Si un modèle ne répond rien, la passe réessaie une fois avec plus de marge ; une passe qui échoue attend dix minutes.

## Ce que montre la carte

- **What this card shows** : Nothing (seulement que quelque chose s'est passé), Hints (qui et où) ou Everything. La valeur par défaut est Hints, pour ne pas vous gâcher l'histoire.
- **Off screen so far** : les événements, selon ce que ce réglage autorise.
- **Log** : chaque passe : pourquoi elle s'est lancée (scène close, temps écoulé, à la main), combien d'événements le modèle a proposés et combien ont été gardés, pourquoi les autres ont été écartés, et l'erreur en cas d'échec.

## Ce que les événements font à l'histoire

Chaque événement gardé devient un souvenir pour les personnes à qui il est arrivé et pour celles qui l'ont vu, et pour personne d'autre : jamais votre personnage. Il atteint une réponse selon les règles habituelles du registre de l'histoire ([[litopys]]) : quand l'une de ces personnes parle, ou que l'une d'elles est dans la scène pour une réponse du narrateur ou d'un groupe. Quelqu'un qui sait peut alors l'évoquer, y faire allusion ou agir en conséquence ; les autres non. Un événement secret est aussi marqué "kept secret", afin qu'une réponse de groupe sache qui le garde. Les événements ne sont pas copiés dans les Facts de la Library : ils sont lus depuis le fichier Meanwhile à chaque réponse, donc ils ne coûtent rien à conserver et disparaissent avec le swipe. Le panneau "What fired" du prompt les liste comme n'importe quel fait.

Si vous désactivez Meanwhile, les événements cessent immédiatement d'atteindre les réponses.

## Dans le journal du Dashboard

Dans le Dashboard en grand, le **Journal** d'un personnage a une section **Off screen (Meanwhile)** avec les événements arrivés à ce personnage, du plus récent au plus ancien, dans la mesure où le réglage de la carte les laisse apparaître : seulement où et quand sous Hints, le texte sous Everything, et rien sous Nothing. Il ne lit que le fichier Meanwhile ; il n'écrit rien dans le Dashboard, donc il part avec un swipe et ne demande aucun réglage supplémentaire. Sur téléphone, le Journal n'est pas affiché.

## Swipes et suppressions

Un événement appartient à la réponse après laquelle il s'est produit. Si vous régénérez cette réponse, la nouvelle version est écrite sans l'événement ; si vous swipez ou supprimez cette réponse, les événements de cette passe partent aussi, de l'histoire également, et la passe suivante relit l'histoire depuis la dernière réponse encore présente.

Lié : [[world-dm]], [[dashboard]], [[litopys]]. Voir [[litopys]] "Who knows" pour la façon dont les secrets sont montrés.
