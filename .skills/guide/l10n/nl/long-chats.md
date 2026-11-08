<!-- source: 49838714a096 -->
# Lange chats en tokenkosten

Een chat die weken doorloopt groeit, en bij elk antwoord gaat meer ervan naar het model. Deze pagina is voor wie merkt dat de antwoorden traag of duur worden, of dat het model het begin van het verhaal vergeet.

## De knop Request size

Standaard wordt de hele chat verstuurd zolang het venster ruimte heeft. Bij een groot venster blijven de kosten stijgen, dus de chatkop heeft naast de verhaaltools een knop **Request size** (op een telefoon: in het Menu). Die toont hoeveel tokens het laatste verzoek verstuurde, de hele prompt zoals de provider die telde, en welk model het kreeg. Druk erop voor het model, zijn venster en je limiet. Hij is groenblauw onder driekwart van de limiet, daarna oranje, en rood met een waarschuwingsteken daarboven. Het Prompt-bord van het Canvas somt elk deel van een verzoek op ([[canvas]]).

Wanneer een antwoord het verzoek boven de limiet duwt, opent zich een pop-up:

- **Yes, continue in a new chat** maakt de volgende chat meteen aan en opent hem.
- **Not now** verbergt de pop-up voor deze chat totdat het verzoek met de helft is gegroeid. Sluiten telt als Not now.
- **Send finished scenes as chapters instead** verschijnt wanneer Litopys aan staat (volgende sectie).

De limiet staat onderaan de pop-up, en in de Library, tandwiel "Litopys settings", blok "In the prompt", "Warn me when a request gets big": 60% van het venster van het model (standaard), een omvang die je typt (100k) of kiest (16k tot 500k), of nooit. Een chat die al boven de limiet zit, toont de rode knop en geen pop-up totdat een nieuw antwoord hem doet groeien.

Het archief heeft een eigen omvang. In hetzelfde blok staat "Memory size" op Auto als standaard: 15% van het venster van het model, tussen 800 en 16000 tokens. "Compact" houdt het op 800.

## De schakelaars die kosten verlagen

In hetzelfde blok kiest "Older messages leave the prompt" uit twee opties:

- **Only when the window is full** (standaard): elk bericht wordt verstuurd zolang het past.
- **By scenes**: zodra een hoofdstuk een scène bevat, wordt de scène vervangen door het hoofdstuk. Alleen de laatste berichten blijven woord voor woord ("Direct messages after the scenes", 2 of meer). De nieuwste scène heeft nog geen hoofdstuk, dus die wordt volledig verstuurd.

"By scenes" kost wat detail: een hoofdstuk is een navertelling, dus een zwak model kan een klein ding kwijtraken. Zet een feit dat nooit verloren mag gaan vast ([[litopys]]). Andere besparingen:

- Het Prompt-bord van het Canvas, kaart history, Details: stuur alleen de laatste N berichten (op de desktop, alleen die chat).
- Zet "Memory size" lager op Compact, of zet "Chapters and facts" uit.

## Een nieuwe chat starten en het verhaal bewaren

Bij een natuurlijk moment begint een nieuwe chat die de oude voortzet met een kleine prompt en weet toch wat er gebeurd is.

1. Open in de chat "More" en kies **Continue in a new chat**, of druk op Yes in de pop-up.
2. De nieuwe chat wordt meteen aangemaakt en opent. Hij behoudt de preset en zijn keuzes, persona, model, agentset, de beurtvolgorde van een groep en de wereld van de World DM.
3. Hij krijgt het oude verhaal als achtergrond, binnen het "Backstory budget". De drie dichtstbijzijnde eerdere chats worden volledig gelezen: hoofdstukken, feiten en wendepunten. Oudere chats van een lange keten vallen niet weg: ze reizen mee in één samengevat deel (zie hieronder). De oude berichten worden niet verstuurd.

De eerdere chat verhuist daarna vanzelf naar het Archief (volgende sectie). De koppeling is die van het Canvas, en het Canvas kan haar later wijzigen: zie [[canvas]]. Wil je een andere eerdere chat kiezen, start dan een chat vanaf het personage en gebruik het menu **Continues** in de stap "New chat with".

De nieuwe chat opent met de eerste begroeting van de kaart; "Edit the first message" laat je verdergaan waar het verhaal stopte.

## Een verhaal van veel chats

Een verhaal kan over vele chats doorlopen. De drie dichtstbijzijnde eerdere chats leveren hun hoofdstukken, bogen en feiten zoals eerder. Elke oudere chat gaat in één **far**-deel, dat eerst komt: zijn wendepunten, de vastgezette en key-feiten, en één regel per boog. Het deel wordt gebouwd uit wat Litopys al heeft geschreven, zonder extra modelaanroep, en neemt standaard 18% van het Backstory budget (Library, Litopys settings, "In the prompt", **Share for the far chats**, 5 tot 40). **Turning points shown** in hetzelfde blok bepaalt hoeveel er in elk antwoord meegaan, over het hele verhaal (standaard 12). Is het budget krap, dan verliezen de oudste chats eerst hun regels en de wendepunten het laatst. In **What this chat carries** heeft het een eigen rij, "Far backstory, chats 1-2", zodat je kunt zien dat de eerste chats bewaard zijn en niet verloren. Een korte keten heeft geen far-deel. Verhoog het Backstory budget als een lang verhaal dun aanvoelt.

Een samengevat deel laat kleine details weg (de kleur van een mantel); de woord-voor-woord herinneringen hieronder brengen die terug.

## Een afgerond verhaal archiveren

Een verhaal waarmee je klaar bent kan naar het **Archief**. Het is een status van de chat, geen verhuizing: de chat blijft waar hij is, dus zijn geheugen, zijn koppelingen op het Canvas en elk boek dat ervan is gemaakt blijven werken.

- In Chats kies je een chat en druk je op **Archive** (de oranje knop in zijn paneel), of vink je er meerdere aan met Select. In een chat staat het in het menu onder "Manage chat".
- Een gearchiveerde chat verdwijnt uit de lijst en van Home. De oranje rij **Archive** onder de filters opent ze; **Back to chats** keert terug.
- Hij opent alleen-lezen: je kunt lezen, kopiëren, vertakken vanuit een bericht, exporteren en zijn Dashboard en Library bekijken, maar niet versturen, swipen, bewerken of verwijderen. Onderaan staat **Continue in a new chat**. **Unarchive** (in zijn paneel of in de banner) maakt hem weer gewoon.
- De bevestiging biedt **Archive and continue** aan wanneer nog geen chat deze voortzet.
- **Het gebeurt vanzelf** wanneer een chat de eerdere chat van een andere wordt: een koppeling op het Canvas, Continue in a new chat, de pop-up hierboven, of een keuze in "Continues". Een melding met Undo zegt dat. Vertakkingen zijn geen vervolgen en blijven zoals ze zijn. Schakel het uit in de Library, tandwiel "Litopys settings", "Archive the earlier chat when it is continued".
- Een chat van 100 berichten of meer die een week stil is geweest, krijgt in de lijst een klein label "Long chat · archive?" en een hint in zijn paneel. Niets wordt voor je gearchiveerd.

Waarom het de moeite waard is: de eerdere chat verandert niet meer, dus het geheugen ervan blijft stabiel, en een nieuwe chat die erop voortbouwt leest hem als een afgerond verhaal ([[litopys]]).

## Details die de hoofdstukken hebben weggelaten

Een hoofdstuk is een navertelling, dus een klein detail van een eerdere chat kan eruit verdwenen zijn. In de Library, Litopys settings, "In the prompt", laat de schakelaar **Word-for-word memories of earlier chats** (standaard aan) een chat die andere voortzet één of twee passages van de oorspronkelijke berichten terughalen wanneer wat er gezegd wordt zeldzame woorden met hen deelt ([[litopys]]). De eerdere chat wordt geïndexeerd wanneer hij naar het Archief gaat. Het zoekt op woorden, dus een detail dat met andere woorden is verteld wordt niet gevonden; de experimentele schakelaar **Also find old chapters by meaning** (uit) verkleint die kloof een beetje wanneer je embeddings gebruikt: hij vindt het hoofdstuk op betekenis, maar een passage heeft nog steeds één eigen zeldzaam woord nodig.

## Een verhaal als boek bewaren

In de Library, Litopys, kopieert "Save as a book" de hoofdstukken, bogen en feiten van een chat naar de Data Bank-plank voor chats die je kiest: zie [[memory]].

## Controleer wat het model kreeg

Als een personage iets vergeet, open dan Canvas > Prompt en zet het van "Parts" op "Memory": het toont welke feiten erin gingen en welke zijn weggelaten, en waarom. De knop **Fired** in de chatkop toont dat voor het laatste antwoord en de hele chat.
