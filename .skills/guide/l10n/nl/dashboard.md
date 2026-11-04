<!-- source: 36ebfb6daad6 -->
# Het scène-Dashboard

Het Dashboard is een paneel naast de chat dat de scène bijhoudt: wie er is, hoe elk personage over jou denkt, wat ze dragen en weten, de open verhaaldraden. Het is voor wie wil dat het verhaal relaties en details tussen antwoorden onthoudt. Het Help-artikel *Scène-dashboard* somt de velden op.

## Wat het bijhoudt

Open het door op een portret in de chat te klikken en Dashboard te kiezen. Het zijpaneel heeft vier tabbladen: **Persoon** (houding, stemming en toestand, kleding en spullen), **Hier** (plaats, weer, wie er is), **Opdrachten** (de open draden: hoofd-, zij-, alledaags) en **Notities** (het notitieboek: wat een personage weet, en of ze het zagen, hoorden of raadden). Het "Sterrenbeeld" benoemt hoe een personage tegenover jou staat, bijvoorbeeld Vriendschap of Romantiek. Een getal op een tabblad telt wijzigingen sinds je laatste antwoord (rood wanneer iets is gedaald). De brede weergave heeft ook een Journaal met de gedachte en herinneringen van een personage. Op een telefoon opent dezelfde inhoud als een blad.

**Eén persoon dubbel vermeld.** Als het Dashboard dezelfde persoon onder twee namen toont (zeg "Sina" en "Sina Rose"), open er dan één en gebruik de kleine personenknop in de Persoon-kop, dan "Zelfde persoon als..." en kies de andere. Je wordt eerst gevraagd: de notities, geschiedenis en spullen verhuizen naar de persoon die je koos, hun relatienummers blijven, de naam wordt een andere naam van hen, en het kan niet ongedaan worden gemaakt. Het Dashboard stelt zelf ook waarschijnlijke dubbelen voor: een vak bovenaan het tabblad Persoon (en een chip "Mogelijke dubbel" in "Sinds je laatste antwoord") zegt "X is mogelijk dezelfde persoon als Y" met de reden. "Samenvoegen met Y" doet hetzelfde als het menu; "Verschillende personen" houdt ze apart en het Dashboard stopt met het voorstellen van dat paar. Hetzelfde menu heeft "Verwijder van het Dashboard" voor een naam die simpelweg verkeerd is.

De getallen (vertrouwen, comfort, aantrekking, respect, genegenheid en meer) worden door code berekend uit gebeurtenissen die een model rapporteert, en gekanteld door de [[soul]] van elk personage. De toestand wordt per bericht bewaard, dus een swipe of een verwijderd bericht laat nooit verouderde getallen achter.

De knop "Verhaal, zet" naast Verzenden schakelt een eenmalig duwtje voor het volgende antwoord in; de pijl kiest een open opdracht of een wending.

## Wanneer hij bijwerkt

De knop "Instellingen" in het Dashboard opent zijn instellingen; het tabblad Sensor heeft de modus:

- **Sensor** (standaard): na elk antwoord leest een model de nieuwe berichten en rapporteert wat er is gebeurd.
- **Snel: binnen het verhaalantwoord**: voor sterke modellen. Het verhaalmodel schrijft het rapport zelf aan het einde van zijn antwoord, zonder aparte aanroep, en voegt aan elk antwoord wat tokens toe. Als het rapport ontbreekt, draait de gewone sensor.
- **Handmatig**: het werkt alleen bij wanneer je op "Vernieuwen" drukt.

## Wat het kost

In Sensormodus één extra modelaanroep per antwoord, op het "Sensormodel" (het chatmodel als je het leeg laat). Een goedkoop, klein model is genoeg. Het leest de nieuwe berichten in hun geheel (samen tot ongeveer 12000 tekens; een langer antwoord verliest alleen het midden), en code markeert eerst de zinnen die op kleding, aankleden of een kus lijken en wijst het model erop, zodat een rok die één keer midden in een lang antwoord wordt genoemd toch bij de kleding terechtkomt. Als een personagekaart een "Kleding:"-regel heeft, krijgt de sensor die ook te zien als referentie voor de exacte bewoording van een kledingstuk dat de tekst noemt (hij voegt nooit een kledingstuk toe dat de tekst niet toont). Wat een personage draagt en vasthoudt wordt als een lijst voorwerpen bewaard; een kledingstuk dat scheurt of vies wordt blijft één voorwerp. Elk ding behoudt één identiteit waar het ook heen gaat: gedragen, bij de deur uitgedaan, aan iemand anders gegeven. Dingen die op een plek worden achtergelaten blijven daar: wanneer het verhaal terugkomt naar het café, staat het kopje nog op tafel. Wanneer het verhaal ongeveer zes beurten niet heeft getoond wat iemand draagt, wordt het schrijfmodel gevraagd het kort te noemen. Om woorden toe te voegen voor een taal die de scan niet kent, zet je ze in `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` zet de scan uit. Het Dashboard voegt ook een korte "Prompt-invoeging" toe aan wat het verhaalmodel leest, zodat personages weten hoe ze ervoor staan: je kunt die uitschakelen en "Tokens per personage" instellen. "Wat het model ziet" in de instellingen toont de invoeging.

## Hoe je het uitschakelt

Er is geen aparte uitknop in de hier genoemde schermen. Zet de modus op "Handmatig" en het roept nooit zelf een model aan. Om het volledig te verwijderen, schakel je de Dashboard-plugin uit in de Plugins-knop van Molfar Vertep; Extra > Plugins in Roleplay toont alleen wat draait. Zet "Prompt-invoeging" uit als je het uit de aanvraag wilt houden.

## Gerelateerd

[[soul]] voedt het; [[litopys]] gebruikt zijn notities; [[memory]] vergelijkt het met de andere soorten geheugen.
