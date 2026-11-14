<!-- source: b6c59373d069 -->
# Het scherm Dashboard

Het Dashboard is een paneel naast de chat dat de scène bijhoudt: wie er aanwezig is, hoe elk personage jou vindt, wat ze dragen en weten, de open verhaallijnen. Het is voor iedereen die wil dat het verhaal relaties en details tussen antwoorden onthoudt. Het Help-artikel *Scene dashboard* somt de velden ervan op.

## Wat het bijhoudt

Open het door in de chat op een portret te klikken en Dashboard te kiezen. Het zijpaneel heeft vier tabbladen: **Person** (houding, stemming en toestand, outfit en spullen: wat ze dragen, vasthouden en bij zich hebben, en wat er in de buurt ligt), **Here** (plek, weer, wie er aanwezig is), **Quests** (de open verhaallijnen: hoofd, zij, alledaags; een quest sluit zichzelf in de beurt waarin het verhaal hem afrondt, laat mislukken of voorbijgaat, en een quest die aan een scène gebonden is eindigt met die scène) en **Notes** (het notitieboek: wat een personage weet, en of het dat zag, hoorde of gokte). De "Constellation" benoemt hoe een personage tegenover je staat, bijvoorbeeld Friendship of Romance. Een getal op een tabblad telt de veranderingen sinds je laatste antwoord (rood als iets daalde). De brede weergave heeft ook een Journal met de gedachten en herinneringen van een personage. Op een telefoon opent dezelfde inhoud als een sheet.

**Eén persoon die twee keer in de lijst staat.** Als het Dashboard dezelfde persoon onder twee namen toont (bijvoorbeeld "Sina" en "Sina Rose"), open dan een van de twee en gebruik het kleine personenknopje in de Person-kop, dan "Same person as..." en kies de andere. Je wordt eerst gevraagd: de notities, geschiedenis en spullen gaan naar de persoon die je koos, de relatienummers blijven, de naam wordt een andere naam van die persoon, en het kan niet ongedaan worden gemaakt. Het Dashboard stelt zelf ook waarschijnlijke dubbelen voor: een vak boven aan het tabblad Person (en een chip "Possible duplicate" in "Since your last reply") zegt "X may be the same person as Y" met de reden. "Merge into Y" doet hetzelfde als het menu; "Different people" houdt ze apart en het Dashboard stopt met dat paar voorstellen. Hetzelfde menu heeft "Not in the scene" voor iemand die het verhaal alleen noemt maar die een model in de scène heeft gezet: die persoon verdwijnt uit de lijst "aanwezig", blijft bekend met zijn of haar notities, en het Dashboard zet de persoon niet terug tenzij die spreekt (de toast heeft "Undo", en daarna biedt het menu "Put back in the scene"). "Remove from the Dashboard" is voor een naam die gewoon fout is: het haalt de persoon uit elke opgeslagen staat.

Een personage dat van elders contact heeft (een bericht, een brief, een telefoontje, een video) is zo gemarkeerd in de scèneregel, met nog een korte zin over wat hen bereikt: via bericht of brief alleen de woorden die gestuurd zijn; via telefoontje alleen de stem en de geluiden bij de telefoon; via video alleen wat in de camera is en wat er in de buurt te horen is. Een stille handeling, zoals de ketel opzetten, is voor hen niet bekend.

De getallen (vertrouwen, comfort, aantrekking, respect, genegenheid, en meer) worden door code berekend uit gebeurtenissen die een model meldt, en bijgesteld door de [[soul]] van elk personage. De toestand wordt per bericht bewaard, zodat een swipe of een verwijderd bericht nooit verouderde getallen achterlaat.

Wiens gevoel het is: elk getal is hoe dat personage over *jouw* personage denkt, nooit andersom. De gebeurtenissen erachter zijn wat jouw personage doet: een kus op het voorhoofd of een knuffel verwarmt comfort en affection, alleen een romantische kus verhoogt arousal. Wanneer een personage jouw personage iets aandoet (vreemdgaat, liegt, weggaat), is dat de daad van het personage: het wordt niet op de rekening van jouw personage geboekt, en de sensor krijgt de opdracht om het vertrouwen van het personage in jou er niet om te verlagen. Als een getal nog steeds verkeerd beweegt, meld het als issue: het sensormodel is een model, en een klein model kan een scène verkeerd lezen.

**De datum en een eigen kalender.** De klok toont een datum onder de tijd. Tik op het potlood ernaast om de datum in te stellen, te verbergen of terug te gaan naar automatisch. Kies voor een fantasy- of isekaiwereld waarvan de maanden en jaren niet de onze zijn **A world with its own calendar…** in dat popover: noem de maanden en geef elke maand zijn dagen (12 maanden van 30 dagen is één tik), voeg namen van weekdagen en een era toe ("AR", "of the Third Age") als je wilt, en zeg de datum van de huidige dag van het verhaal, in welk jaar dan ook, ook voor nul. Daarna volgt de datum de Day-teller ("3 Frostmoon 1204 AR"), verschijnt op de klok en in de scèneregels die het model leest, en de verhaaltekst verzet hem nooit. **Use the real calendar** in hetzelfde venster zet het terug.

**Hoe de klok het verhaal volgt.** Schrijf tijd zoals je het zou vertellen: "half an hour later", "через годину", "the next day, 9:30", "three days later". De klok leest deze zinnen in jouw regels en in het verhaal (buiten spraak: een belofte tussen aanhalingstekens, "come in an hour", is geen verstreken tijd), en het volgende antwoord ziet al de nieuwe tijd. De tijd die het verhaal noemt, is waar de klok staat. Wanneer alleen een deel van de dag wordt genoemd ("the next morning"), toont de klok ongeveer 09:00. De kleine grijze tijd boven de grote is de klok daarvoor ("12:51 →" boven "12:56"), en het model krijgt hetzelfde te horen, met hoeveel het is verschoven ("5 min after 12:51"). Een dag gaat niet over totdat het verhaal middernacht passeert of zegt dat dat is gebeurd. Voor een sprong die je liever niet uitschrijft, verstuurt **Skip time...** in het "+"-menu hem voor jou.

De knop "Story, move" naast Send zet een eenmalig duwtje klaar voor het volgende antwoord; de pijl kiest een open quest of een twist.

## Wat er veranderd is, in de chat

Onder het nieuwste antwoord staat een gedempte regel die zegt wat het Dashboard daarvoor heeft vastgelegd: "Changed: Ada · trust fell, mood calm → tense, +2". Tik erop om dezelfde chips uit te klappen als de rij "Since your last reply" van het Dashboard; een chip opent het bijbehorende Dashboard-tabblad (op een telefoon de bottom sheet). Oudere antwoorden tonen niets, en de regel wacht terwijl een antwoord wordt geschreven of het Dashboard nog bijwerkt. Om het te verbergen schakel je "Show what changed under the newest reply" uit in Settings > Chat Behavior.

## Banden tussen personages

De sensor merkt op hoe twee personages die niet jij zijn tegenover elkaar staan, als een rol in één woord en een warmte in één woord ("rival, cold"). De prompt van het antwoord bevat er maximaal vier als één korte regel, alleen voor mensen in de scène. Een personage krijgt in zijn eigen antwoord alleen de banden waar dat personage deel van uitmaakt; een verteller krijgt eerst de banden van de mensen waar de beurt over gaat.

## Wat een personage zei, en leugens

Onder het notitieboek van een persoon houdt de lijst **Said** de sterke dingen bij die ze zeiden en waar ze aan gehouden worden: een gelofte, een dreiging, een bekentenis, een bevel. Een leugen wordt daar ook bewaard, afgedekt tot je "Show hidden" kiest.

Wanneer een personage liegt waar anderen bij zijn, nemen de anderen het als waar aan. Hun volgende antwoorden behandelen het als iets wat hun verteld is en waar ze geen reden hebben om aan te twijfelen, tot het verhaal anders laat zien. Alleen de mensen die in de scène waren worden misleid, en alleen in hun eigen antwoorden: iemand anders die spreekt herhaalt de leugen niet.

Open een leugen en je ziet **Believe it:** met een knop voor elke persoon die het nog gelooft. Druk op een naam wanneer die persoon erachter is gekomen. Het menu van de rij heeft ook **This was a lie** voor een uitspraak die de sensor er niet een noemde (de mensen in de scène geloven het dan), en **Not a lie** wanneer de sensor het mis had. De sensor beëindigt het geloof vanzelf wanneer een antwoord laat zien dat de waarheid uitkomt. De leugen uit de lijst verwijderen verwijdert elk geloof ermee.

> De verteller verwoordt iedereen in één antwoord, dus die weet altijd de waarheid. Dit houdt alleen het ene personage tegen om te handelen naar wat een ander personage weet.

## Wanneer het bijwerkt

De knop "Settings" in het Dashboard opent de instellingen; het tabblad Sensor heeft de modus:

- **Sensor** (standaard): na elk antwoord leest een model de nieuwe berichten en meldt wat er gebeurde.
- **Fast: inside the story reply**: voor sterke modellen. Het verhaalmodel schrijft het verslag zelf aan het eind van zijn antwoord, zonder aparte aanroep, wat tokens aan elk antwoord toevoegt. Als het het verslag weglaat, draait de gewone sensor.
- **Manual**: het werkt alleen bij wanneer je op "Refresh" drukt.

## Wat het kost

In de modus Sensor één extra modelaanroep per antwoord, op het "Sensor model" (het model van de chat als je het leeg laat). Een goedkoop, klein model is genoeg. Het leest de nieuwe berichten in hun geheel (samen tot ongeveer 12000 tekens; een langer antwoord verliest alleen het midden), en code markeert eerst de zinnen die op kleding, aankleden of een kus lijken en wijst het model daarop, zodat een rok die één keer in het midden van een lang antwoord genoemd wordt alsnog in de outfit belandt. Als een personagekaart een "Attire:"-regel heeft, wordt die de sensor ook getoond als referentie voor de exacte bewoording van een kledingstuk dat de tekst noemt (het voegt nooit een kledingstuk toe dat de tekst niet toont). Wat een personage draagt en vasthoudt wordt bijgehouden als een lijst van items; een kledingstuk dat scheurt of vies wordt blijft één item. Elk ding houdt één identiteit waar het ook gaat: gedragen, bij de deur uitgedaan, aan iemand anders gegeven. Spullen die op een plek achterblijven blijven daar: wanneer het verhaal terugkomt bij het café, staat de kop nog op tafel. Wanneer het verhaal ongeveer zes beurten niet heeft laten zien wat iemand draagt, wordt het schrijfmodel gevraagd het kort te noemen. Om woorden toe te voegen voor een taal die de scan niet kent, zet je ze in `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` zet de scan uit. Het Dashboard voegt ook een korte "Prompt insert" toe aan wat het verhaalmodel leest, zodat personages weten waar ze staan: je kunt die uitzetten en "Tokens per character" instellen. "What the model sees" in de instellingen toont de insert.

## Hoe je het uitzet

Er is geen aparte uit-schakelaar in de hier genoemde schermen. Zet de modus op "Manual" en het roept nooit uit zichzelf een model aan. Om het helemaal te verwijderen, schakel de Dashboard-plugin uit via de knop Plugins van Molfar Vertep; Tools > Plugins in Roleplay laat alleen zien wat draait. Zet "Prompt insert" uit als je wilt dat het buiten het verzoek blijft.

## Gerelateerd

[[soul]] voedt het; [[litopys]] gebruikt de notities; [[memory]] vergelijkt het met de andere soorten geheugen.
