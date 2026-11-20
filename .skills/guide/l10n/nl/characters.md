<!-- source: 1057467e9411 -->
# Personages, persona's en groepen

Alles waarmee je speelt, staat in vier secties: Personages, Groepen, Persona's en Marktplaats. Deze pagina legt uit waarvoor elk dient; de Help-artikelen *Je personages*, *De tabbladen van de kaarteditor* en *Groepen personages* bevatten de details.

## Kaarten

Een kaart is een personage: beschrijving, persoonlijkheid, scenario en een eerste bericht. Een tag `group: Guild of Ravens` of `faction: Guild of Ravens` plaatst het personage van de kaart ook in die groep, zodat een geheugenfeit dat aan de groep wordt verteld, bij hen bekend is ([[litopys]]). De sectie Personages toont je kaarten als een raster of lijst, met zoeken, tags, mappen, favorieten (een ster) en verschillende sorteermogelijkheden. Open een kaart om hem te bewerken. Bewerkingen blijven in een concept tot "Save changes"; weggaan met niet-opgeslagen bewerkingen vraagt eerst om bevestiging.

De editor heeft zes tabbladen:

- **Core**: de kaarttekst, dialoog en begroeting.
- **Profile**: dezelfde beschrijving opgesplitst in gestructureerde velden (identiteit, uiterlijk, doelen). Elke opslag schrijft ze terug naar de kaarttekst. Een vertellerskaart kan hier een hele cast beschrijven.
- **Soul**: hoe het personage op je reageert, plus gewoonten. Zie [[soul]].
- **Memory**: afgeronde chats die het personage zich herinnert. Zie [[memory]].
- **Lorebook**: boeken die aan deze kaart zijn gekoppeld.
- **More**: kleuren en stemmen, sprites (zie [[sprites]]), galerij, regex, geavanceerde instellingen.

Een kaart kan meerdere personages tegelijk spelen (een verteller of spelleider). Onder Colors geeft "Voices" elke spreker zijn eigen kleur. Als je geen stemmen opgeeft, doet de chat het voor je: een kaart met meerdere personages (secties vernoemd naar elk) kleurt de regels van elk personage vanzelf, elk met een andere kleur, bewaard bij de chat. In elke andere chat open je het chatmenu, "Voice colors", en zet je de schakelaar aan; "Spread colors" geeft iedereen die je niet hebt gekozen een andere kleur. Dit vereist het Relationship-dashboard, dat de lijst met personages levert. Als stemmen zijn ingekleurd, krijgt een regel de kleur van wie hem uitspreekt: de naam waarmee hij opent ("Rhea:"), een naam naast een spreekwerkwoord ("— Nee, — zegt Esh"), of een zij of hij die wijst naar het ene personage van dat geslacht dat eerder in hetzelfde antwoord is genoemd ("— Goed, — zegt ze"). Een spreker die helemaal niet op de lijst staat (een voorbijganger die alleen in het verhaal wordt genoemd) krijgt een eigen kleur, telkens dezelfde, los van de kleuren die al gebruikt worden. Een regel die niemand noemt, houdt de kleur van de vorige spreker; voordat iemand is genoemd, blijft de themakleur. Als het verhaal een personage met een andere naam noemt dan de kaart (de kaart heet "Aphrodite", het verhaal zegt "Ada"), kan de chat twee personen tonen en ze apart kleuren. Twee manieren om ze één te maken: open in het Relationship-dashboard het menu van het personage en kies "Same person as...", of voeg aan de kaart een regel toe zoals "Also called: Ada", zodat de naam vanaf het eerste antwoord bekend is. Een kort woord tussen aanhalingstekens midden in een zin ("noemde het «verraad» en vertrok") wordt als term gelezen, niet als spraak, en krijgt geen kleur. Om te zien waarom een regel zijn kleur kreeg, open je het chatmenu, "Voice colors", en zet je "Show who speaks and why" aan: een klein teken na elk citaat noemt de spreker en de regel.

## Persona's

Een persona ben jij: naam, voornaamwoorden, beschrijving, avatar. Het model ziet die overal waar de prompt over de gebruiker spreekt. "Use this persona" maakt het je standaard en schakelt de open chat erop over. Een persona kan eigen lorebooks meedragen en kan aan gekozen personages worden gekoppeld, zodat nieuwe chats met hen ermee beginnen. Het tabblad Lorebooks van een persona toont de boeken die het meedraagt (open er een, ontkoppel het, voeg meer toe uit een doorzoekbare lijst, of begin een nieuw boek). Een persona kan een eigen boek hebben ("New book" op een leeg tabblad maakt het, "Replace" wisselt het): het reist mee in het bestand van de persona, dus Export en Backup dragen het mee en het importeren van het bestand op een ander apparaat brengt het terug, gekoppeld. Boeken die het alleen koppelt, blijven in de bibliotheek van dat apparaat; een koppeling waarvan het boek ontbreekt, verschijnt als een rij "Not in your library" die je kunt verwijderen. Importeren op het scherm Persona's neemt één persona over uit een andere app (een naam en een beschrijving), een back-up van meerdere, of een lijst `{ name: description }`; een persona die boeken noemt die je nog niet hebt geïmporteerd, wordt toch geïmporteerd, met een melding welke ontbreken.

## Groepen

Een groep zet meerdere personages in één chat. Met "New group" kies je leden. De editor heeft Overview, Members, Scene, Turns, Lore en Chats. Het tabblad Turns bepaalt wie antwoordt: Narrator (één antwoord verwoordt iedereen) of Each in turn. Een nieuwe groep begint als Narrator.

Het tabblad Turns heeft ook **How they talk**: **Interruptions** (leden vallen in, praten door elkaar heen of negeren een vraag wanneer dat bij hun personage past), **Own goals** (leden maken bezwaar, onderhandelen of weigeren wanneer een plan ingaat tegen wie ze zijn, zelfs als dat spanning met jou oplevert) en **Draw in quiet members** (iemand die een tijdje stil is geweest, krijgt meer kansen om te antwoorden, en een vertelde scène wordt gevraagd hen erbij te betrekken). De eerste twee zijn Off, Can of Should: Can staat het toe wanneer het bij de scène past, Should verwacht het, en als elk antwoord in een ruzie verandert, ga je terug naar Can. Nieuwe groepen beginnen met Can en Draw in aan; oudere groepen houden alles uit tot je het aanzet. De Turns-knop van de chat zelf kan ze voor één chat alleen wijzigen. Open op het tabblad Members de sectie "In this group" van een lid om hen een **voice** te geven die alleen deze groep gebruikt: maximaal twee spraakgewoonten (spreekt in fragmenten, stelt nooit vragen) en maximaal vijf voorbeeldregels. Een paar regels leren het ritme beter dan bijvoeglijke naamwoorden, en verschillende personages zouden op hetzelfde nieuws verschillend moeten reageren.

Een groep is geen kaart: een groep verwijderen verwijdert zijn chats, nooit zijn leden. Leden zonder eigen kleur krijgen automatisch verschillende kleuren.

## Kaarten verkrijgen

- "Import card" accepteert PNG- of JSON-bestanden, één of vele, en links naar Chub, RisuRealm, CharaVault, Botbooru of een direct bestand.
- De Marktplaats doorzoekt meerdere bronnen tegelijk; open een resultaat om de volledige kaart te lezen voordat je importeert. Elke bron heeft zijn eigen sorteervolgorde en adult-filter, en sommige vereisen een handmatige download.
- Export schrijft een PNG met de kaart erin.
- "With Molfar" op Home (en in Lorebooks) vraagt Molfar om samen met jou een kaart of een lorebook op te stellen. Zie [[vertep:molfar]].

## Brieven van kaarten

Een kaart die je een tijdje niet hebt gespeeld, kan je een kort briefje in zijn eigen stem schrijven. Het briefje komt in de inbox (Home's "Waiting on you", de inbox-knop in de zijbalk) als een groene Letter; door hem te openen ga je naar de oude chat, of begin je een chat voor een kaart die je nooit hebt gespeeld. Een brief schrijft nooit in een chat en verzint nooit gebeurtenissen.

Het is **uit tot je het aanzet**. Zolang het uit is, staat er een groene kaart "Let your characters write to you" bovenaan de sectie Personages en in Home's "Waiting on you": **Turn on** zet het meteen aan, **Not now** verbergt de kaart voorgoed. De getallen (dagen inactief, brieven per dag, dagen tussen brieven van één kaart, het schrijfmodel) en de kaarten die je hebt stopgezet, staan in Personages, More, Letters from cards. Brieven worden elke paar uur gecontroleerd terwijl de app open is: een chat die 14 dagen inactief is, een kaart die je 14 dagen niet hebt gespeeld, en een gespeelde kaart zonder Soul (eenmalig). Als het schrijfmodel drie controles op rij faalt (of er is geen ingesteld), toont de inbox een rode "Letters"-fout met de reden, en Open brengt je naar de Letters-instellingen; een brief die aankomt, een ander model of brieven uitzetten wist het. 

## Portretten voor kaarten zonder

Een kaart zonder eigen afbeelding (niets, of de standaardavatar) kan worden getekend. **Eén kaart:** in de kaarteditor opent "Draw" onder het portret een dialoog: kies het beeldmodel, een tekstmodel (het Card tasks-model) schrijft een beschrijving van de kaart, die je kunt bewerken, en het beeldmodel tekent die. De afbeelding gaat meteen naar de Gallery van de kaart en "Use as portrait" maakt er de avatar van. **Veel kaarten:** Personages, More, "Draw missing portraits (N)" vraagt welk model en tekent ze dan één voor één via de voortgangskaart; Cancel stopt tussen kaarten en een kaart die faalt, wordt met de reden vermeld.

"Draw with" toont de beeldmodellen van Settings > Images: een lokale ComfyUI of Forge naast API-modellen. De eerste keuze is het eigen beeldmodel van de app (Extensions > Image generation); een keuze hier wordt alleen voor portretten onthouden. Een op tags getraind model krijgt een regel tags, een API-model een paragraaf. Een kaart met alleen een naam heeft niets te beschrijven, en de dialoog zegt dat. Beeldgeneratie moet aan staan (Extensions); de dialogen zeggen dat en openen het voor je.

## Wat een kaart niet bevat

De Dashboard-status, hoofdstukken en feiten horen bij elke chat, niet bij de kaart. Kaartgeheugen maakt ook geen deel uit van de kaart en verschijnt nooit in een export. De Soul daarentegen wordt in de kaart opgeslagen.

Volgende: [[first-story]] voor de eerste chat, of [[soul]] voor het reactieprofiel.
