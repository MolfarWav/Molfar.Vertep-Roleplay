<!-- source: ec7d17369d16 -->
# Agents en de agentensmederij

Een agent is een kleine helper die je bouwt uit kaarten en draden. Hij leest een deel van de chat (vóór of na een antwoord, naar keuze), mag een model een of meer korte vragen stellen, houdt eigen aantekeningen bij en laat iets zien: een notitie onder het antwoord, knoppen om op te tikken, een meter, een kaart of een hint voor het volgende antwoord. Voorbeelden: drie voorgestelde volgende zetten, een spanningsmeter, een kaart van de bezochte plaatsen. Deze pagina is voor wie zulke extra's wil. De Help heeft drie artikelen over de editor: "Agent editor: how an agent works", "Agent editor: the cards" en "Agent editor: three ready agents".

## Waar een agent van is gemaakt

Een agent is data, geen code. In de editor is het een bord met **kaarten** verbonden door **draden**:

- een **Input**-kaart zegt wat de agent mag lezen (het laatste antwoord, de chatgeschiedenis, de personagekaart, de persona, de auteursnotitie, Litopys-feiten, lorebook-vermeldingen);
- **Ask the model**-kaarten stellen één vraag aan een model en nemen het antwoord als vrije tekst, ja of nee, of een paar benoemde velden;
- logische kaarten (een If-kaart kan alleen afgaan wanneer zijn antwoord Yes wordt, alleen één keer, of met een pauze nadat hij afgaat, en zijn regels kunnen vragen of een waarde is veranderd sinds de vorige run; het runlog zegt waarom hij antwoordde), en kaarten die in code werken zonder model: dobbelstenen, een regel kiezen, tekst knippen of uitpakken;
- een **Script**-kaart: een paar regels JavaScript die je zelf schrijft, `(input, seed)` erin en een gewoon object eruit, met getypte invoer en uitvoer. Hij draait in een zandbak van de engine (geen klok, geen internet, geen bestanden, ongeveer een halve seconde en 16 MB) en heeft een engine vanaf 1.10.1 nodig; een oudere engine laat de agent mislukken met een gewone melding;
- kaarten voor het eigen **geheugen** van de agent (getallen, tekst, ja/nee, lijsten), per chat bewaard en apart van het Dashboard;
- een **Output**-kaart die een resultaat toont: "A note under the reply", "Buttons to tap", een toestandswaarde, of een hint die in de volgende prompt wordt gezet.

**Panelen** (meters, tellers, tabellen, een bord met tegels) tonen wat de agent bewaart; niets in een paneel draait, en de knoppen zetten alleen tekst in het berichtvak.

Wanneer hij draait, bepaalt zijn **lane**. Het agentbestand noemt de lane waarin hij start, en elke chat kan de agent naar een andere lane verplaatsen (het tabblad Agents van de chat, of het bord "Agent sets" van het Canvas). De vier lanes:

- **Before the reply**: het antwoord wacht op de agent, en een hint die hij achterlaat gaat in datzelfde antwoord. Houd het bij een of twee snelle vragen, want de wachttijd komt bij elk antwoord. De schakelaar Wait in de rij van de agent zet het wachten uit; de agent draait dan naast het antwoord.
- **Beside the reply**: draait tegelijk, voegt geen wachttijd toe en kan geen hint in het antwoord zetten waarnaast hij draait (notities, knoppen en panelen werken wel).
- **After the reply**: de gewone lane voor notities, trackers en meters.
- **By hand**: draait alleen wanneer je op de run-knop van zijn rij drukt.

Bovenop de lane kan een agent draaien op elk N-de antwoord, of alleen wanneer gekozen woorden verschijnen.

## Kant-en-klare agents

Druk op "New agent" in het Agents-bord van het **Canvas** (het **Agents**-item van de rail opent het). "Empty agent" geeft een Input en een notitie. "Start from a ready agent" biedt zes werkende aan: Next moves, Pacing nudge, Story map, Scene recap, Territory board en Tension meter. Onder "Drafts" staan agents die Molfar in je werkruimte heeft geschreven ("Drafts from Molfar").

## De editor

Bewerkingen worden kort nadat je stopt als concept opgeslagen. Drie tabbladen: Card (de geselecteerde kaart), Agent (naam, wanneer hij draait, zijn geheugen, panelen) en Try. Een controle toont "Passes the check", het aantal problemen en waarschuwingen, en "N model calls per run". Je kunt niet installeren zolang er problemen overblijven. "Export as a file" slaat één bestand op dat je kunt delen. De sheet "Install and manage agents..." van de chat heeft "Install an agent file" om er een binnen te halen.

### De opties van de If-kaart

Een If-kaart antwoordt Yes, No of Unknown volgens zijn regels, en op zichzelf zegt hij Yes bij elke run zolang de regels gelden. Onder de regels verandert **When it answers Yes** dat: "Every time" (de standaard), "Only when it turns Yes" (hij gaat af bij de stap van niet-Yes naar Yes, en pas weer nadat het antwoord is teruggegaan), of "Only once in this chat". **Pause after it fires (runs)** slaat zoveel runs van de agent over na een Yes, 0 tot 50. Een run is één beurt van de agent, dus een agent die elke derde antwoord draait maakt een pauze van 2 die zes antwoorden duurt. Een regel kan ook "changed since the last run" gebruiken: Yes wanneer de waarde verschilt van de vorige run. In het formulier kiest elke regel **What the rule reads**: een waarde die je erin bedraadt, een Dashboard-waarde, de chat (aantal berichten, wie er als laatste sprak) of een World DM-dobbelsteen (Fate, Life of Pacing: heeft die een notitie in dit antwoord gezet, en wat was de uitkomst). Het lezen van een dobbelsteen vraagt de toestemming "Read what the World DM’s dice said for the last reply", en het werkt alleen voor een agent die na het antwoord draait. Alleen een Yes wordt tegengehouden; No en Unknown komen nog steeds door. De agent onthoudt dit per chat, en "start over" op de agent vergeet het. Het tabblad Try toont waarom een kaart antwoordde (de regel, de waarde die hij las, het resultaat) en, wanneer hij een Yes tegenhield, welke optie dat deed; het agentlogboek onder een antwoord houdt dezelfde regels bij.

## Proefrun

Het tabblad Try draait één verzonnen beurt zonder iets aan te raken. Je past de invoer aan, en de draden op het bord laten zien wat er beweegt; zonder model gebruikt elke "Ask the model"-kaart een voorbeeldantwoord dat je kunt bewerken. Kies onder "A real chat" een chat en "Fill from this chat" laadt wat de agent echt zou krijgen. "Run with the model" stelt dan de echte vraag aan het echte model: hoogstens N aanroepen, echte tokens, en niets wordt opgeslagen in de chat of in de agent.

## Installeren, toestaan, inschakelen in een chat

1. Druk op "Install" ("Update" voor een gewijzigde kopie van een geïnstalleerde agent; gebruik "Edit a copy" om er een te wijzigen).
2. Sta hem één keer toe: "Review permissions", dan "Allow all" of regel voor regel. Hij draait wanneer elke regel aan staat. Een update die meer vraagt, wacht op een nieuwe Allow. Een Script-kaart vraagt om "Run its own small program"; de lijst met rechten toont de code ("Read the code") voordat je toestaat, en als een update de code wijzigt, wordt de toestemming opnieuw gevraagd.
3. Voeg hem toe aan een chat. Open in de pil van de chatkop het tabblad **Agents**: "In this chat" toont actieve agents, "Installed" toont de rest (kies er een om hem toe te voegen). Een rij kan nu opnieuw draaien, verwijderd worden, of het antwoord laten stoppen met wachten op hem. Een nieuwe chat heeft geen agents totdat je er een paar toevoegt of een set kiest.

Een **set** is een benoemde lijst agents ("Save this chat's list as a set"; "Make default" geeft hem aan nieuwe chats). Het bord "Agent sets" van het Canvas toont de kosten per set in tijd en aanroepen, en bevat de schakelaar "Agents' notes in chats" die alle notities van agents verbergt. De resultaatplek van elke agent kan in het tabblad Agents van de chat worden gewijzigd, uit de plekken die bij hem passen.

Elke "Ask the model"-kaart is één aanroep per run; de editor toont het aantal. "Every Nth reply" verdeelt de kosten.
