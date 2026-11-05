<!-- source: e65c6432f795 -->
# Welk geheugen waarvoor

Roleplay heeft meerdere dingen die "onthouden". Ze verschillen in wie ze bewaart, wat ze bevatten en hoe lang ze meegaan. Als een personage iets vergeet, vertelt deze pagina je welke je moet pakken.

## De soorten

**Chatgeschiedenis.** De berichten zelf. Het model ziet zoveel recente als zijn venster toelaat.

**Dashboard** ([[dashboard]]). Per chat de *huidige* toestand van de scène: wie er aanwezig zijn, gevoelens, kleding, open opdrachten en wat elk personage weet. Het verandert met elk antwoord.

**Litopys** ([[litopys]]). Per chat het *verleden* van het verhaal: een hoofdstuk per afgeronde scène en een lijst met feiten. Dit is waar een lange chat op leunt zodra oudere berichten de prompt verlaten.

**Kaartgeheugen.** Per personage, over chats heen: wat het personage onthoudt uit afgeronde verhalen, hun feiten, notities, gezegde zinnen en verdiende gewoonten. Het staat in het tabblad "Memory" van de kaarteditor. Je importeert een afgeronde chat, ziet wat er bewaard zou worden, vinkt aan wat je wilt bewaren, en een schakelaar zet één verhaal uit voor nieuwe chats. Het heeft een eigen omvang (Compact, 800 tokens standaard). Het maakt geen deel uit van de kaarttekst en verschijnt nooit in een geëxporteerde kaart.

**Lorebooks.** Naslagitems die in de prompt komen wanneer hun trefwoorden voorkomen, of voor enkele altijd. Ze bevatten de regels, plaatsen en mensen van de wereld. Koppel een boek aan een kaart of groep, of markeer het als Globaal om elke chat te bereiken. Een chat krijgt ook een eigen wereldboek, geschreven door de World DM ([[world-dm]]). Een item dat op **By meaning** staat, wordt geactiveerd wanneer de betekenis dicht bij de recente berichten ligt, ook zonder trefwoord. Met een lokaal embeddings-model vergelijkt de engine de items van een boek met elkaar: een item wordt geactiveerd wanneer het voor dit bericht boven de rest uitsteekt, tot 10 items per boek. Een boek met minder dan 4 zulke items gebruikt een vaste nabijheid. Een item met secundaire trefwoorden heeft die nog steeds nodig. Als je het embeddings-model wijzigt, worden de items bij het volgende antwoord of de twee volgende vanzelf opnieuw gemaakt.

**Data Bank** (Tools). Tekstdocumenten die je uploadt (alleen tekstformaten, tot 2 MB per stuk). Bij elk bericht worden de meest relevante passages toegevoegd: eerst gevonden op woorden, en met een embeddings-model ingesteld ook gesorteerd op betekenis (de kaart **Data Bank by meaning** op hetzelfde scherm: één druk, of de engine doet het zelf zodra embedden werkt). Gebruik het voor lang naslagmateriaal, niet voor het verhaal zelf. Een **boek** is een Data Bank-bestand dat van een verhaal is gemaakt: in Library > Litopys kopieert **Save as a book** de hoofdstukken, bogen en feiten van een chat naar een bestand in een boekenkast dat andere chats kunnen lezen. Kies de chats die het mogen lezen (de chats die op deze doorgaan, worden voor je gekozen). Het is een kopie, geen koppeling: latere wijzigingen in de chat bereiken het niet, en **Save a new version** bewaart de oude. Een personage krijgt alleen passages die het zou kunnen weten: een feit behoudt zijn lijst "known by", een hoofdstuk zijn cast. In het tabblad Data Bank laat **passages** je een passage repareren of verwijderen en de lezers wijzigen; de Memory-weergave telt de passages die buiten de deur zijn gehouden.

**Auteursnotitie** (chatkop, "Note"). Tekst die je alleen voor deze chat schrijft, geplaatst op een diepte en rol die je kiest. Gebruik hem om bij te sturen: een stijlhint, een plotduw.

**Ziel** ([[soul]]). Geen geheugen van gebeurtenissen maar hoe een personage reageert; die verandert nooit tijdens het spel.

## Welke te gebruiken

- "Ze zou het gevecht van gisteravond moeten onthouden": het Dashboard regelt het kortetermijn; Litopys bewaart het langetermijn. Voeg een vastgezet feit toe als het nooit verloren mag gaan.
- "Ze zou het vorige verhaal in een nieuwe chat moeten onthouden": kaartgeheugen, of koppel de chats op het Canvas zodat de eerdere chat zijn verhaal als achtergrond meebrengt.
- "De wereld heeft een regel of een plaats": een lorebook.
- "Ik wil dat de volgende antwoorden deze kant op gaan": auteursnotitie, of de knop "Story, move".
- "Ik heb een lang document": Data Bank.

## Waarom wist ze dat?

Open **Canvas > Prompt** ([[canvas]]) en zet het bord van **Parts** op **Memory**. Het toont wat het geheugen in het laatste antwoord heeft gezet, en wat het heeft weggelaten en waarom: de feiten die erin gingen (met hun rang en wie ze kent), de feiten die zijn weggehouden omdat de spreker ze niet kent, de feiten die niet pasten in de geheugenomvang, de hoofdstukken, wat de Data Bank vond, en alles wat de controles na het antwoord hebben gemarkeerd. Mensen verschijnen met hun id uit de lijst van personen van de chat, zodat "Sina" en "Sina Rose" uit elkaar worden gehouden. **Copy report** zet hetzelfde als platte tekst op je klembord: plak het bij wie je helpt het geheugen te debuggen. De rij knoppen bovenaan gaat terug door de laatste vijf antwoorden (de Data Bank-treffers gaan mee); de controles na het antwoord worden alleen voor het nieuwste bewaard. Een vouw met de naam **Worker: left out of the last scene** somt de feiten op die de hoofdstukworker niet heeft bewaard en waarom: een bijna kopie van een feit dat hij al had, alleen wat op de kaart staat, meer dan acht in één scène, een feit dat al weg is, of hetzelfde voorstel dat al wacht. De vouw **Checked after the reply** noemt de feiten die de Dashboard-sensor niet kon bewaren (over je eigen personage, over iemand die niet in de scène is, een belangrijke gebeurtenis zonder citaat), niet alleen hoeveel er waren. De samenvatting zegt ook **Ranked by meaning: yes** met hoeveel kandidaten een vector hadden, of **no** met de reden (de chat heeft nog geen vectoren, de laatste aanroep van het embeddings-model is mislukt, of dit antwoord is niet ingebed). Zo onderscheid je "het antwoord stond nooit in het geheugen" van "het zoeken op betekenis ging mis". In de chat heeft het paneel "What this chat carries" een knop **Why?** op de Litopys-rij, die het paneel **Fired** opent op het Litopys-tabblad.

## Wat in deze chat is geactiveerd

De knop **Fired** (bliksemschicht) in de chatkop opent één paneel voor het laatste antwoord, met tabbladen per bron: **Lorebooks** (blauw), **Litopys** (paars), **Data Bank** (blauwgroen) en **Vectors** (groen). De schakelaar bovenaan kiest **Last reply** of **Whole chat**. Voor het laatste antwoord groepeert Lorebooks de items op de manier waarop ze erin kwamen: op betekenis (met een nabijheidsbalk, de dichtstbijzijnde eerst), op trefwoord (welk trefwoord raakte), overgehouden van eerder (sticky), altijd aan (niet meegeteld, die gaan in elk antwoord), dan **Held back** (een vertraging, een afkoeling, een kans, een groep, of secundaire trefwoorden die faalden, ook voor een item dat qua betekenis dichtbij was) en **Over the budget**. Voor de hele chat toont elk lorebook-item, Litopys-feit of hoofdstuk en Data Bank-passage "N of M replies", hoe het erin kwam en wanneer het voor het laatst erin ging. Het aantal is benaderend: een item dat in het scanvenster blijft, telt mee in elk antwoord dat het droeg; een swipe vervangt het antwoord ervoor; een preview telt niet mee; niets wordt geteld van vóór de update. Het tabblad Vectors toont welk geheugen vectoren heeft en welke bron ze in het laatste antwoord gebruikte. **Copy report** geeft hetzelfde als platte tekst. De Lorebooks-pagina, sectie Actief, controleert nog steeds wat voor het volgende bericht *zou* afgaan, maar alleen op trefwoorden.

## Kosten

Al deze nemen ruimte in de prompt. Het Prompt-bord van het Canvas toont elk deel met zijn tokenaantal en laat je delen voor één chat uitschakelen. Op een klein model verlaag je de "Memory size" van Litopys, houd je kaartgeheugen Compact, en kies je liever enkele korte lorebook-items.
