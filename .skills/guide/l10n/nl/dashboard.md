<!-- source: 0383923e835d -->
# Het scène-Dashboard

Het Dashboard is een paneel naast de chat dat de scène bijhoudt: wie er aanwezig is, hoe elk personage over jou denkt, wat ze dragen en weten, de open verhaaldraden. Het is voor wie wil dat het verhaal relaties en details tussen antwoorden onthoudt. Het Help-artikel *Scène-dashboard* somt de velden op.

## Wat het bijhoudt

Open het door op een portret in de chat te klikken en Dashboard te kiezen. Het zijpaneel heeft vier tabbladen: **Person** (houding, stemming en toestand, kleding en spullen: wat ze dragen, vasthouden en bij zich hebben, en wat er in de buurt ligt), **Here** (plaats, weer, wie er aanwezig is), **Quests** (de open draden: main, side, everyday) en **Notes** (het notitieboek: wat een personage weet, en of het dit zag, hoorde of raadde). De "Constellation" benoemt hoe een personage tegenover jou staat, bijvoorbeeld Friendship of Romance. Een getal op een tabblad telt de wijzigingen sinds je laatste antwoord (rood wanneer iets is gedaald). De brede weergave heeft ook een Journal met de gedachte en herinneringen van een personage. Op een telefoon opent dezelfde inhoud als een blad.

**Eén persoon dubbel vermeld.** Als het Dashboard dezelfde persoon onder twee namen toont (zeg "Sina" en "Sina Rose"), open er dan één en gebruik de kleine personenknop in de Person-kop, daarna "Same person as..." en kies de andere. Je wordt eerst gevraagd: de notities, geschiedenis en spullen verhuizen naar de persoon die je koos, hun relatiegetallen blijven, de naam wordt een andere naam van hen, en het kan niet ongedaan worden gemaakt. Het Dashboard stelt zelf ook waarschijnlijke dubbelen voor: een vak bovenaan het tabblad Person (en een chip "Possible duplicate" in "Since your last reply") zegt "X may be the same person as Y" met de reden. "Merge into Y" doet hetzelfde als het menu; "Different people" houdt ze apart en het Dashboard stopt met het voorstellen van dat paar. Hetzelfde menu heeft "Remove from the Dashboard" voor een naam die simpelweg verkeerd is.

De getallen (vertrouwen, comfort, aantrekking, respect, genegenheid en meer) worden door code berekend uit gebeurtenissen die een model rapporteert, en bijgesteld door de [[soul]] van elk personage. De toestand wordt per bericht bewaard, dus een swipe of een verwijderd bericht laat nooit verouderde getallen achter.

De knop "Story, move" naast Verzenden schakelt een eenmalig duwtje in voor het volgende antwoord; de pijl ernaast kiest een open opdracht of een wending.

## Wat er veranderde, in de chat

Onder het nieuwste antwoord toont een gedempte regel wat het Dashboard ervoor heeft vastgelegd: "Changed: Ada · trust fell, mood calm → tense, +2". Tik erop om dezelfde chips uit te klappen als de rij "Since your last reply" van het Dashboard; een chip opent het bijbehorende tabblad van het Dashboard (op een telefoon: het onderste blad). Oudere antwoorden tonen niets, en de regel wacht terwijl een antwoord wordt geschreven of het Dashboard nog bijwerkt. Om hem te verbergen, zet je "Show what changed under the newest reply" uit in Settings > Chat Behavior.

## Verbanden tussen personages

De sensor noteert hoe twee personages die niet jij zijn tegenover elkaar staan, als een woord voor de rol en een woord voor de warmte ("rival, cold"). Het prompt van het antwoord draagt er hoogstens vier als één korte regel, alleen voor mensen in de scène. Het eigen antwoord van een personage krijgt alleen de verbanden waar dat personage bij hoort; een verteller krijgt eerst de verbanden van de mensen waar de beurt over gaat.

## Wat een personage zei, en leugens

Onder het notitieboek van een persoon bewaart de lijst **Said** de sterke dingen die ze zeiden en waaraan ze zich houden: een gelofte, een dreiging, een bekentenis, een bevel. Een leugen wordt daar ook bewaard, verborgen tot je "Show hidden" kiest.

Wanneer een personage voor anderen liegt, nemen de anderen het als waar aan. Hun volgende antwoorden behandelen het als iets dat hun is verteld, en ze hebben geen reden om eraan te twijfelen, tot het verhaal anders blijkt. Alleen de mensen die in de scène waren worden voor de gek gehouden, en alleen in hun eigen antwoorden: als iemand anders spreekt, herhaalt die de leugen niet.

Open een leugen en je ziet **Believe it:** met een knop voor elke persoon die het nog gelooft. Druk op een naam wanneer die persoon het heeft ontdekt. Het menu van de rij heeft ook **This was a lie** voor een uitspraak die de sensor geen leugen noemde (de mensen in de scène geloven het dan), en **Not a lie** wanneer de sensor het mis had. De sensor beëindigt het geloof zelf wanneer een antwoord laat zien dat de waarheid naar buiten komt. De leugen uit de lijst verwijderen haalt elk geloof ervan mee weg.

> De verteller spreekt in één antwoord iedereen uit, dus hij kent altijd de waarheid. Dit zorgt er alleen voor dat één personage niet handelt op wat een ander personage weet.

## Wanneer hij bijwerkt

De knop "Settings" in het Dashboard opent de instellingen; het tabblad Sensor heeft de modus:

- **Sensor** (standaard): na elk antwoord leest een model de nieuwe berichten en meldt wat er is gebeurd.
- **Fast: inside the story reply**: voor sterke modellen. Het verhaalmodel schrijft het rapport zelf aan het eind van zijn antwoord, zonder aparte aanroep, en voegt aan elk antwoord wat tokens toe. Als het rapport ontbreekt, draait de gewone sensor.
- **Manual**: werkt alleen bij wanneer je op "Refresh" drukt.

## Wat het kost

In de modus Sensor één extra modelaanroep per antwoord, op het "Sensor model" (het chatmodel als je het leeg laat). Een goedkoop, klein model is genoeg. Het leest de nieuwe berichten in hun geheel (samen tot ongeveer 12000 tekens; een langer antwoord verliest alleen het midden), en code markeert eerst de zinnen die op kleding, aankleden of een kus lijken en wijst het model erop, zodat een rok die één keer midden in een lang antwoord wordt genoemd toch bij de kleding terechtkomt. Als een personagekaart een regel "Attire:" heeft, krijgt de sensor die ook te zien als referentie voor de exacte bewoording van een kledingstuk dat de tekst noemt (hij voegt nooit een kledingstuk toe dat de tekst niet toont). Wat een personage draagt en vasthoudt wordt bewaard als een lijst voorwerpen; een kledingstuk dat scheurt of vies wordt blijft één voorwerp. Elk ding behoudt één identiteit waar het ook heen gaat: gedragen, bij de deur uitgedaan, aan iemand anders gegeven. Dingen die op een plek worden achtergelaten blijven daar: wanneer het verhaal terugkomt naar het café, staat het kopje nog op tafel. Wanneer het verhaal ongeveer zes beurten niet heeft getoond wat iemand draagt, wordt het schrijfmodel gevraagd het kort te noemen. Om woorden toe te voegen voor een taal die de scan niet kent, zet je ze in `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` zet de scan uit. Het Dashboard voegt ook een korte "Prompt insert" toe aan wat het verhaalmodel leest, zodat personages weten waar ze staan: je kunt die uitzetten en "Tokens per character" instellen. "What the model sees" in de instellingen toont de invoeging.

## Hoe je het uitschakelt

Er is geen aparte uitknop in de hier genoemde schermen. Zet de modus op "Manual" en het roept nooit zelf een model aan. Om het volledig te verwijderen, schakel je de Dashboard-plugin uit met de Plugins-knop van Molfar Vertep; Tools > Plugins in Roleplay toont alleen wat draait. Zet "Prompt insert" uit als je wilt dat die buiten de aanvraag blijft.

## Gerelateerd

[[soul]] voedt het; [[litopys]] gebruikt zijn notities; [[memory]] vergelijkt het met de andere soorten geheugen.
