<!-- source: 67addd68fb05 -->
# Lange chats en tokenkosten

Een chat die weken meegaat groeit, en elk antwoord stuurt er meer van naar het model. Deze pagina is voor iedereen wiens antwoorden traag of duur worden, of wiens model het begin van het verhaal vergeet.

## De knop "Request size"

Standaard wordt de hele chat verstuurd zolang het venster ruimte heeft. Bij een groot venster blijft de kosten stijgen, dus de chatkop heeft een knop **Request size** naast de verhaalgereedschappen (op een telefoon: in het Menu). Hij toont hoeveel tokens het laatste verzoek verstuurde, de hele prompt zoals de provider die telde, en welk model hem kreeg. Druk erop voor het model, zijn venster en jouw limiet. Hij is blauwgroen onder driekwart van de limiet, amberkleurig vanaf daar, en rood met een waarschuwingsbord erboven. Het bord Canvas Prompt somt elk deel van een verzoek op ([[canvas]]).

Wanneer een antwoord het verzoek over de limiet duwt, opent een popup:

- **Yes, continue in a new chat** maakt meteen de volgende chat aan en opent die.
- **Not now** verbergt de popup voor deze chat tot het verzoek met de helft is gegroeid. Hem sluiten telt als Not now.
- **Send finished scenes as chapters instead** verschijnt wanneer Litopys aan staat (volgende sectie).

De limiet staat onderaan de popup, en in de Library, tandwiel "Litopys settings", blok "In the prompt", "Warn me when a request gets big": 60% van het venster van het model (standaard), een grootte die je typt (100k) of kiest (16k tot 500k), of nooit. Een chat die al over de limiet is toont de rode knop en geen popup tot een nieuw antwoord hem laat groeien.

Het record heeft zijn eigen grootte. In hetzelfde blok is "Memory size" standaard Auto: 15% van het venster van het model, tussen 800 en 16000 tokens. "Compact" houdt het op 800.

## De schakelaars die kosten drukken

In hetzelfde blok heeft "Older messages leave the prompt" twee keuzes:

- **Only when the window is full** (standaard): elk bericht wordt verstuurd zolang het past.
- **By scenes**: zodra een hoofdstuk een scène bevat, wordt de scène vervangen door het hoofdstuk. Alleen de laatste berichten blijven woord voor woord ("Direct messages after the scenes", 2 of meer). De nieuwste scène heeft nog geen hoofdstuk, dus die wordt volledig verstuurd.

"By scenes" kost wat detail: een hoofdstuk is een navertelling, dus een zwak model kan iets kleins verliezen. Pin een feit vast dat nooit verloren mag gaan ([[litopys]]). Andere bezuinigingen:

- Library, Litopys settings, **Direct messages, by size**: houd de nieuwste berichten die binnen een aantal tokens passen (minstens 2 berichten) in plaats van een vast aantal. 0 telt berichten ([[litopys]]).
- Library, Litopys settings, **Leave out what a speaker was not present for** (standaard "Groups only"): een antwoord dat door één personage wordt gesproken krijgt niet de recente berichten uit scènes waarin dat personage niet zat ([[litopys]]).
- Bord Canvas Prompt, kaart history, Details: stuur alleen de laatste N berichten (desktop, alleen die chat).
- Verlaag "Memory size" naar Compact, of zet "Chapters and facts" uit.

## Begin een verse chat en behoud het verhaal

Op een natuurlijk breekpunt begint een nieuwe chat die de oude voortzet met een kleine prompt en weet toch wat er is gebeurd.

1. Open in de chat "More" en kies **Continue in a new chat**, of druk op Yes in de popup.
2. De nieuwe chat wordt meteen aangemaakt en opent. Hij behoudt de preset en zijn keuzes, persona, model, agent set, de beurtvolgorde van een groep en de wereld van de World DM.
3. Hij krijgt het oude verhaal als backstory, binnen het "Backstory budget". De drie dichtstbijzijnde eerdere chats worden volledig gelezen: hoofdstukken, feiten en keerpunten. Oudere chats van een lange keten worden niet weggelaten: ze rijden mee in één samengevat deel (zie hieronder). De oude berichten worden niet verstuurd.

De eerdere chat verhuist dan vanzelf naar het Archief (volgende sectie). De link is degene die het Canvas tekent, en het Canvas kan hem later wijzigen: zie [[canvas]]. Om een andere eerdere chat te kiezen, start je een chat vanuit het personage en gebruik je het menu **Continues** in de stap "New chat with".

De nieuwe chat opent met de eerste begroeting van de kaart; "Edit the first message" laat je verdergaan waar het verhaal stopte.

## Een verhaal van vele chats

Een verhaal kan vele chats doorgaan. De drie dichtstbijzijnde eerdere chats geven hun hoofdstukken, arcs en feiten zoals voorheen. Elke oudere chat gaat in één **ver** deel, vooraan geplaatst: zijn keerpunten, de vastgepinde en belangrijke feiten, en één regel voor elke arc. Het deel wordt gebouwd uit wat Litopys al schreef, zonder extra modelaanroep, en neemt standaard 18% van het Backstory budget (Library, Litopys settings, "In the prompt", **Share for the far chats**, 5 tot 40). **Turning points shown** in hetzelfde blok bepaalt hoeveel keerpunten meereizen in een antwoord over het hele verhaal (standaard 12). Als het budget krap is, verliezen de oudste chats eerst hun regels en als laatste de keerpunten. In **What this chat carries** is het een eigen rij, "Far backstory, chats 1-2", zodat je kunt zien dat de eerste chats zijn behouden, niet verloren. Een korte keten heeft geen ver deel. Verhoog het Backstory budget als een lang verhaal dun aanvoelt.

Een samengevat deel laat kleine details vallen (de kleur van een mantel); de woord-voor-woord herinneringen hieronder halen die terug.

## Archiveer een afgerond verhaal

Een verhaal dat je af hebt kun je naar het **Archief** sturen. Het is een status op de chat, geen verplaatsing: de chat blijft waar hij is, dus zijn geheugen, zijn links op het Canvas en elk boek dat ervan is gemaakt blijven werken.

- Kies in Chats een chat en druk op **Archive** (de amberkleurige knop in zijn paneel), of vink er meerdere aan met Select. In een chat zit het in het menu onder "Manage chat".
- Een gearchiveerde chat verlaat de lijst en Home. De amberkleurige rij **Archive** onder de filters opent ze; **Back to chats** keert terug.
- Hij opent alleen-lezen: je kunt lezen, kopiëren, vertakken vanaf een bericht, exporteren en zijn Dashboard en Library bekijken, maar niet versturen, swipen, bewerken of verwijderen. Zijn plek onderaan biedt **Continue in a new chat**. **Unarchive** (in zijn paneel of de banner) maakt hem weer normaal.
- De bevestiging biedt **Archive and continue** wanneer nog geen chat deze voortzet.
- **Het gebeurt vanzelf** wanneer een chat de eerdere chat van een andere wordt: een link op het Canvas, Continue in a new chat, de popup hierboven, of een keuze in "Continues". Een toast met Undo zegt het. Vertakkingen zijn geen voortzettingen en blijven zoals ze zijn. Zet het uit in de Library, tandwiel "Litopys settings", "Archive the earlier chat when it is continued".
- Een chat van 100 berichten of meer die een week stil is geweest krijgt een klein label "Long chat · archive?" in de lijst en een hint in zijn paneel. Er wordt niets voor je gearchiveerd.

Waarom zou je: de eerdere chat verandert niet meer, dus het geheugen ervan blijft stabiel en een nieuwe chat die hem voortzet leest hem als een afgerond verhaal ([[litopys]]).

## Details die de hoofdstukken lieten vallen

Een hoofdstuk is een navertelling, dus een klein detail van een eerdere chat kan eruit verdwenen zijn. In de Library, Litopys settings, "In the prompt", laat de schakelaar **Word-for-word memories of earlier chats** (standaard aan) een chat die andere voortzet een of twee passages van de originele berichten terugbrengen wanneer wat gezegd wordt zeldzame woorden deelt met die passages ([[litopys]]). De eerdere chat wordt geïndexeerd wanneer hij naar het Archief gaat. Hij vergelijkt woorden, dus een detail dat in andere woorden wordt verteld wordt niet gevonden; de experimentele schakelaar **Also find old chapters by meaning** (uit) dicht dat gat een beetje wanneer je embeddings gebruikt: hij vindt het hoofdstuk op betekenis, maar een passage heeft nog steeds één eigen zeldzaam woord nodig.

## Bewaar een verhaal als boek

In de Library, Litopys, kopieert "Save as a book" de hoofdstukken, arcs en feiten van een chat naar de plank Data Bank voor chats die je kiest: zie [[memory]].

## Controleer wat het model kreeg

Als een personage iets vergeet, open Canvas > Prompt en schakel van "Parts" naar "Memory": het toont welke feiten erin gingen en welke werden weggelaten, en waarom. De knop **Fired** in de chatkop toont het voor het laatste antwoord en de hele chat.
