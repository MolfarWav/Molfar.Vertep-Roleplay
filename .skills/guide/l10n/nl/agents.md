<!-- source: a06a17fd0667 -->
# Agents en de agentensmederij

Een agent is een kleine helper die je bouwt uit kaarten en draden. Na een antwoord leest hij een deel van de chat, stelt een model misschien een of meer korte vragen, houdt eigen aantekeningen bij en laat iets zien: een notitie onder het antwoord, knoppen om op te tikken, een meter, een kaart of een hint voor het volgende antwoord. Voorbeelden: drie voorgestelde volgende zetten, een spanningsmeter, een kaart van de bezochte plaatsen. Deze pagina is voor wie zulke extra's wil. De Help heeft drie artikelen over de editor: "Agent editor: how an agent works", "Agent editor: the cards" en "Agent editor: three ready agents".

## Waar een agent van is gemaakt

Een agent is data, geen code. In de editor is het een bord met **kaarten** verbonden door **draden**:

- een **Input**-kaart zegt wat de agent mag lezen (het laatste antwoord, de chatgeschiedenis, de personagekaart, de persona, de auteursnotitie, Litopys-feiten, lorebook-vermeldingen);
- **Vraag het model**-kaarten stellen één vraag aan een model en nemen het antwoord als vrije tekst, ja of nee, of een paar benoemde velden;
- logische kaarten, en kaarten die in code werken zonder model: dobbelstenen, een regel kiezen, tekst knippen of uitpakken;
- kaarten voor het eigen **geheugen** van de agent (getallen, tekst, ja/nee, lijsten), bijgehouden per chat en apart van het Dashboard;
- een **Output**-kaart die een resultaat laat zien: "Een notitie onder het antwoord", "Knoppen om op te tikken", een toestandswaarde, of een hint die in de volgende prompt wordt gezet.

**Panelen** (meters, tellers, tabellen, een bord met tegels) tonen wat de agent bewaart; niets in een paneel draait, en de knoppen zetten alleen tekst in het berichtvak.

Wanneer hij draait, stel je per agent in: na elk antwoord (het enige moment dat deze versie uitvoert); elke N-de antwoord; of alleen wanneer gekozen woorden verschijnen.

## Kant-en-klare agents

Druk op "Nieuwe agent" in het Agents-bord van het **Canvas** (het **Agents**-item van de rail opent het). "Lege agent" geeft een Input en een notitie. "Begin vanaf een kant-en-klare agent" biedt zes werkende aan: Volgende zetten, Pacing-duwtje, Verhaalplattegrond, Scènesamenvatting, Gebiedsbord en Spanningsmeter. Onder "Concepten" staan agents die Molfar in je werkruimte heeft geschreven ("Concepten van Molfar").

## De editor

Bewerkingen worden kort nadat je stopt als concept opgeslagen. Drie tabbladen: Kaart (de geselecteerde kaart), Agent (naam, wanneer hij draait, zijn geheugen, panelen) en Probeer. Een controle toont "Doorstaat de controle", het aantal problemen en waarschuwingen, en "N modelaanroepen per run". Je kunt niet installeren met overgebleven problemen. "Exporteer als bestand" slaat één deelbaar bestand op. Het venster "Agents installeren en beheren..." van de chat heeft "Installeer een agentbestand" om er een binnen te halen.

## Proefrun

Het tabblad Probeer draait één verzonnen beurt zonder iets aan te raken. Je wijzigt de invoer, en de draden op het bord tonen wat er beweegt; zonder model gebruikt elke "Vraag het model"-kaart een voorbeeldantwoord dat je kunt bewerken. Kies onder "Een echte chat" een chat en "Vul vanuit deze chat" om te laden wat de agent echt zou krijgen. "Draai met het model" stelt dan de echte vraag aan het echte model: maximaal N aanroepen, echte tokens, en niets wordt opgeslagen in de chat of de agent.

## Installeren, toestaan, inschakelen in een chat

1. Druk op "Installeren" ("Bijwerken" voor een gewijzigde kopie van een geïnstalleerde agent; gebruik "Bewerk een kopie" om er een te wijzigen).
2. Sta hem één keer toe: "Rechten bekijken", dan "Alles toestaan" of regel voor regel. Hij draait wanneer elke regel aan staat. Een update die meer vraagt, wacht op een nieuwe toestemming.
3. Voeg hem toe aan een chat. Open in de pil van de chatkop het tabblad **Agents**: "In deze chat" toont actieve agents, "Geïnstalleerd" toont de rest (kies er een om hem toe te voegen). Een rij kan nu opnieuw draaien, verwijderd worden, of het antwoord dat op hem wacht stoppen. Een nieuwe chat heeft geen agents totdat je er enkele toevoegt of een set kiest.

Een **set** is een benoemde lijst agents ("Sla de lijst van deze chat op als set"; "Maak standaard" geeft hem aan nieuwe chats). Het bord "Agentsets" van het Canvas toont per set de kosten in tijd en aanroepen, en bevat de schakelaar "Agents-notities in chats" die alle notities van agents verbergt. De resultaatplek van elke agent kan in het Agents-tabblad van de chat worden gewijzigd, tussen de plekken die bij hem passen.

Elke "Vraag het model"-kaart is één aanroep per run; de editor toont het aantal. "Elke N-de antwoord" deelt de kosten.
