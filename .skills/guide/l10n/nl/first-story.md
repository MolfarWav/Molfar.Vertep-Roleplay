<!-- source: 45efabb467af -->
# Je eerste verhaal

Dit is de kortste weg van een lege Roleplay naar een lopend verhaal, en een lijst van wat vanzelf gebeurt zodat niets je verrast. Je hebt eerst een modelverbinding nodig: zie [[vertep:models]].

## Stappen

1. **Haal een kaart.** Druk op Home op "New character" en schrijf er een, of op "Import card" om een PNG- of JSON-kaart uit een bestand binnen te halen. Je kunt ook de sectie Marktplaats doorzoeken, of op "With Molfar" drukken om Molfar een kaart te laten opstellen op basis van jouw idee. Zie [[characters]].
2. **Sla hem op.** De kaarteditor bewaart wijzigingen in een concept totdat je op "Save changes" drukt.
3. **Kies een persona** (wie je speelt) in de sectie Persona's, of behoud de standaard. "Use this persona" maakt hem je standaard.
4. **Start een chat.** Druk op "New chat" op de kaart. De chat opent met het eerste bericht van de kaart.
5. **Controleer het model.** De pil in de chatkop heeft een tabblad Model; daar een model kiezen wijzigt alleen deze chat.
6. **Schrijf.** Onder elk antwoord kun je door andere versies bladeren (swipes); de pijl naar rechts op de laatste versie vraagt om een nieuwe. Om een antwoord met een richting opnieuw te doen, gebruik je "Regenerate with a hint" in het "+"-menu. Om het antwoord naar het bericht dat je schrijft te sturen, zet je de instructie tussen dubbele haakjes erin, bijvoorbeeld `Ik loop binnen. [[Aria verbergt een geheim.]]`: het model leest dat als een regieaanwijzing, niet als iets wat jij hebt gezegd (in het "+"-menu staat "Stage direction" dat de haakjes voor je typt). De knop "More" op een bericht biedt bewerken, vertakken, een promptblik en meer.

## Wat vanzelf draait

Zodra de chat antwoorden heeft, werken er achtergrondhelpers, elk met eigen modelaanroepen:

- Het Dashboard leest na elk antwoord de scène ([[dashboard]]).
- Litopys schrijft een hoofdstuk wanneer een scène sluit ([[litopys]]).
- De World DM, op zijn laagste actieve niveau (Chronicler), legt mensen en plaatsen vast in een boek voor deze chat ([[world-dm]]).
- Een kaart zonder soul krijgt er automatisch een voorgesteld ([[soul]]).

Mislukkingen van deze taken worden in de Inbox getoond.

## Als het model klein, traag of per aanroep betaald is

De goedkoopste besparingen, in volgorde:

1. Zet in de "Settings" van het Dashboard de modus op "Manual" (het werkt dan alleen bij wanneer je op Refresh drukt), of kies een klein model als "Sensor model".
2. Verlaag in de "Litopys settings" van de Library de "Memory size", of zet "Chapters and facts" uit.
3. Kies in het World-blad het niveau "Off" (het doet nog steeds een kleine aanroep wanneer de scène een nieuwe plaats noemt), of kies een goedkoop "DM model (all chats)".
4. Zet in de Dashboard-instellingen "Rate characters automatically" uit.
5. Op het Canvas toont het Prompt-bord elk deel van de volgende aanvraag met zijn tokens, en laat je delen voor één chat uitzetten.

Een verhaal dat lang is geworden heeft eigen maatregelen nodig: zie [[long-chats]].

Gratis modellen met kleine contextvensters doen het het best met een Manual-dashboard en een Compact-geheugen.

## Volgende

[[memory]] legt de soorten geheugen uit; [[settings]] zegt waar alles is ingesteld.
