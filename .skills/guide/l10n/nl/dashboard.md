<!-- source: 6095bc511c69 -->
# Het scène-Dashboard

Het Dashboard is een paneel naast de chat dat de scène bijhoudt: wie er is, hoe elk personage over jou denkt, wat ze dragen en weten, de open verhaaldraden. Het is voor wie wil dat het verhaal relaties en details tussen antwoorden onthoudt. Het Help-artikel *Scène-dashboard* somt de velden op.

## Wat het bijhoudt

Open het door op een portret in de chat te klikken en Dashboard te kiezen. Het zijpaneel heeft vier tabbladen: **Persoon** (houding, stemming en toestand, kleding en spullen), **Hier** (plaats, weer, wie er is), **Opdrachten** (de open draden: hoofd-, zij-, alledaags) en **Notities** (het notitieboek: wat een personage weet, en of ze het zagen, hoorden of raadden). Het "Sterrenbeeld" benoemt hoe een personage tegenover jou staat, bijvoorbeeld Vriendschap of Romantiek. Een getal op een tabblad telt wijzigingen sinds je laatste antwoord (rood wanneer iets is gedaald). De brede weergave heeft ook een Journaal met de gedachte en herinneringen van een personage. Op een telefoon opent dezelfde inhoud als een blad.

De getallen (vertrouwen, comfort, aantrekking, respect, genegenheid en meer) worden door code berekend uit gebeurtenissen die een model rapporteert, en gekanteld door de [[soul]] van elk personage. De toestand wordt per bericht bewaard, dus een swipe of een verwijderd bericht laat nooit verouderde getallen achter.

De knop "Verhaal, zet" naast Verzenden schakelt een eenmalig duwtje voor het volgende antwoord in; de pijl kiest een open opdracht of een wending.

## Wanneer hij bijwerkt

De knop "Instellingen" in het Dashboard opent zijn instellingen; het tabblad Sensor heeft de modus:

- **Sensor** (standaard): na elk antwoord leest een model de nieuwe berichten en rapporteert wat er is gebeurd.
- **Snel: binnen het verhaalantwoord**: voor sterke modellen. Het verhaalmodel schrijft het rapport zelf aan het einde van zijn antwoord, zonder aparte aanroep, en voegt aan elk antwoord wat tokens toe. Als het rapport ontbreekt, draait de gewone sensor.
- **Handmatig**: het werkt alleen bij wanneer je op "Vernieuwen" drukt.

## Wat het kost

In Sensormodus één extra modelaanroep per antwoord, op het "Sensormodel" (het chatmodel als je het leeg laat). Een goedkoop, klein model is genoeg. Het Dashboard voegt ook een korte "Prompt-invoeging" toe aan wat het verhaalmodel leest, zodat personages weten hoe ze ervoor staan: je kunt die uitschakelen en "Tokens per personage" instellen. "Wat het model ziet" in de instellingen toont de invoeging.

## Hoe je het uitschakelt

Er is geen aparte uitknop in de hier genoemde schermen. Zet de modus op "Handmatig" en het roept nooit zelf een model aan. Om het volledig te verwijderen, schakel je de Dashboard-plugin uit in de Plugins-knop van Molfar Vertep; Extra > Plugins in Roleplay toont alleen wat draait. Zet "Prompt-invoeging" uit als je het uit de aanvraag wilt houden.

## Gerelateerd

[[soul]] voedt het; [[litopys]] gebruikt zijn notities; [[memory]] vergelijkt het met de andere soorten geheugen.
