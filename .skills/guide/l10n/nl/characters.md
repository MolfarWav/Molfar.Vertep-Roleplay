<!-- source: a93fd36e3690 -->
# Personages, persona's en groepen

Alles waarmee je speelt, staat in vier secties: Personages, Groepen, Persona's en Marktplaats. Deze pagina zegt waarvoor elk dient; de Help-artikelen *Je personages*, *De tabbladen van de kaarteditor* en *Groepen personages* hebben de details.

## Kaarten

Een kaart is een personage: beschrijving, persoonlijkheid, scenario en een eerste bericht. Een tag die `group: Guild of Ravens` of `faction: Guild of Ravens` luidt, zet het personage van de kaart ook in die groep, zodat een geheugenfeit dat aan de groep wordt verteld ook hun bekend is ([[litopys]]). De sectie Personages toont je kaarten als raster of lijst, met zoeken, tags, mappen, favorieten (een ster) en meerdere sorteervolgordes. Open een kaart om hem te bewerken. Wijzigingen blijven in een concept tot "Save changes"; weggaan met niet-opgeslagen wijzigingen vraagt eerst om bevestiging.

De editor heeft zes tabbladen:

- **Core**: de kaarttekst, dialoog en begroeting.
- **Profile**: dezelfde beschrijving opgesplitst in gestructureerde velden (identiteit, uiterlijk, doelen). Elke opslag schrijft ze terug in de kaarttekst. Een vertellerkaart kan hier een hele cast beschrijven.
- **Soul**: hoe het personage op jou reageert, plus gewoonten. Zie [[soul]].
- **Memory**: afgeronde chats die het personage onthoudt. Zie [[memory]].
- **Lorebook**: boeken die aan deze kaart zijn gekoppeld.
- **More**: kleuren en stemmen, sprites, galerij, regex, geavanceerde instellingen.

Een kaart kan meerdere personages tegelijk spelen (een verteller of spelleider). Onder Colors geeft "Voices" elke spreker een eigen kleur. Als je geen stemmen opgeeft, doet de chat het voor je: een kaart die meerdere personages bevat (secties genoemd naar elk van hen) kleurt de regels van elk personage zelf, elk in een andere kleur, en dit blijft bij de chat bewaard. In elke andere chat open je het chatmenu, "Voice colors", en zet je de schakelaar aan; "Spread colors" geeft iedereen die je niet hebt gekozen een andere kleur. Dit heeft het Relationship-dashboard nodig, dat de lijst met personages levert.

## Persona's

Een persona ben jij: naam, voornaamwoorden, beschrijving, avatar. Het model ziet hem overal waar de prompt over de gebruiker spreekt. "Use this persona" maakt hem je standaard en schakelt de open chat ernaar over. Een persona kan eigen lorebooks dragen en kan aan gekozen personages worden vastgemaakt, zodat nieuwe chats met hen ermee beginnen.

## Groepen

Een groep zet meerdere personages in één chat. "New group" laat je leden kiezen. De editor heeft Overview, Members, Scene, Turns, Lore en Chats. Het tabblad Turns bepaalt wie antwoordt: Narrator (één antwoord vertolkt iedereen) of Each in turn. Een nieuwe groep begint als Narrator. Een groep is geen kaart: een groep verwijderen verwijdert zijn chats, nooit zijn leden. Leden zonder eigen kleur krijgen automatisch verschillende kleuren.

## Kaarten verkrijgen

- "Import card" accepteert PNG- of JSON-bestanden, één of meer, en linkt naar Chub, RisuRealm, CharaVault, Botbooru of een direct bestand.
- De Marktplaats doorzoekt meerdere bronnen tegelijk; open een resultaat om de volledige kaart te lezen voordat je importeert. Elke bron heeft zijn eigen sorteervolgorde en volwassenenfilter, en sommige vereisen een handmatige download.
- Exporteren schrijft een PNG met de kaart erin.
- "With Molfar" op Home (en in Lorebooks) vraagt Molfar om samen met jou een kaart of een lorebook op te stellen. Zie [[vertep:molfar]].

## Brieven van kaarten

Een kaart die je een tijdje niet hebt gespeeld, kan je een korte brief in zijn eigen stem schrijven. De brief komt in de inbox terecht ("Waiting on you" op Home, de inbox-knop in de rail) als een groene Letter; als je hem opent, ga je naar de oude chat, of start je een chat voor een kaart die je nooit hebt gespeeld. Een brief schrijft nooit in een chat en verzint nooit gebeurtenissen.

Hij staat **uit tot je hem aanzet**. Zolang hij uit staat, staat er bovenaan de sectie Personages en in "Waiting on you" op Home een groene kaart "Let your characters write to you": **Turn on** zet hem meteen aan, **Not now** verbergt de kaart voorgoed. De getallen (dagen van inactiviteit, brieven per dag, dagen tussen brieven van één kaart, het schrijfmodel) en de kaarten die je hebt gestopt staan in Personages, More, Letters from cards. Brieven worden om de paar uur gecontroleerd terwijl de app open is: een chat die 14 dagen stilligt, een kaart die je 14 dagen nooit hebt gespeeld, en een gespeelde kaart zonder Soul (één keer).

## Portretten voor kaarten zonder portret

Een kaart zonder eigen afbeelding (niets, of de standaardavatar) kan worden getekend. **Eén kaart:** in de kaarteditor opent "Draw" onder het portret een dialoog: kies het beeldmodel; een tekstmodel (het model van Card tasks) schrijft een beschrijving van de kaart, die je kunt bewerken, en het beeldmodel tekent hem. De afbeelding gaat meteen naar de Gallery van de kaart en "Use as portrait" maakt hem de avatar. **Veel kaarten:** in Personages, More, vraagt "Draw missing portraits (N)" welk model je wilt, waarna ze één voor één worden getekend via de voortgangskaart; Cancel stopt het tussen twee kaarten, en een kaart die mislukt staat in de lijst met de reden.

"Draw with" toont de beeldmodellen van Settings > Images: een lokale ComfyUI of Forge naast API-modellen. De eerste keuze is het eigen beeldmodel van de app (Extensions > Image generation); een keuze hier wordt alleen voor portretten onthouden. Een model dat op tags is getraind krijgt een regel tags, een API-model een alinea. Een kaart met alleen een naam heeft niets om te beschrijven, en de dialoog zegt dat. Beeldgeneratie moet aan staan (Extensions); de dialogen zeggen dat en openen het voor je.

## Wat een kaart niet bevat

De toestand van het Dashboard, hoofdstukken en feiten horen bij elke chat, niet bij de kaart. Kaartgeheugen hoort ook niet bij de kaart en verschijnt nooit in een export. De Soul daarentegen wordt in de kaart opgeslagen.

Volgende: [[first-story]] voor de eerste chat, of [[soul]] voor het reactieprofiel.
