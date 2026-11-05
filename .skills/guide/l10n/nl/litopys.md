<!-- source: c68da6730f1a -->
# Litopys: het verhaalarchief

Litopys (de kroniek) is het lange geheugen van één chat. Het leest het verhaal op de achtergrond en schrijft een hoofdstuk voor elke afgeronde scène, plus de feiten die het verhaal heeft vastgesteld. Wanneer een chat te lang wordt voor het venster van het model, draagt het archief het verhaal verder. Gebruik het voor lange verhalen; je hoeft het niet te starten.

## Hoofdstukken en feiten

- Een **hoofdstuk** zegt wat er in een scène is veranderd, geen navertelling. Het wordt geschreven zodra de volgende scène begint, dus de laatste scène heeft er misschien nog geen. Een nieuwe plaats of een sprong in de tijd sluit een scène; je kunt ook zelf een reeks berichten als scène markeren, vanuit het "More"-menu van een bericht onder Story.
- Een **feit** is één korte zin die waar blijft: "Medli verbergt haar vleugels op de markt." Feiten hebben een type, een gewicht (Alledaags, Belangrijk, Sleutel) en wie ze kent. Je kunt feiten met de hand toevoegen, bewerken, vastzetten of buiten gebruik stellen.
- **Voorstellen** zijn de suggesties van Litopys: twee feiten samenvoegen, één buiten gebruik stellen, herformuleren, vastzetten. Je accepteert of weigert elk.
- **Gewoonten** die een personage duidelijk toont, kunnen ook verschijnen, en worden een gewoonte na herhaling in meerdere scènes.

## Waar te kijken

Druk op **Record** in de chatkop (op een telefoon, in het Menu) voor het archief van deze chat in een zijpaneel. De **Library**-sectie van de rail toont het archief van elke chat. Die heeft twee weergaven: Overzicht (een tijdlijn, een kaart per personage, wachtende voorstellen) en Details met de tabbladen Hoofdstukken, Feiten, Voorstellen, Gewoonten en Activiteit. Het tabblad Activiteit logt wat Litopys deed, met Ongedaan maken waar dat kan. Het tandwiel ("Litopys-instellingen") bepaalt hoe het archief wordt geschreven.

## Wat er in de prompt gaat

Standaard wordt het archief automatisch ingevoegd. "Memory size" zegt hoeveel tokens het mag innemen: Auto standaard (15% van het modelvenster, minstens 800 en hoogstens 16000), Compact (800 tokens) of Aangepast van 200 tot 16000. Auto laat een groot venster meer van het verhaal dragen; op een klein model blijft het rond 800. Een omvang die je eerder zelf hebt opgeslagen, blijft zoals hij was. Wanneer alles past, wordt alles verstuurd; anders de delen die voor de scène het meest tellen. Een klein model wil een kleine omvang. "Chapters and facts" uit betekent geen nieuwe hoofdstukken of feiten en niets toegevoegd aan de prompt.

Oudere berichten kunnen de prompt alleen verlaten wanneer het venster vol is, of scène voor scène zodra een hoofdstuk ze dekt; de instelling "Older messages leave the prompt" kiest dat.

## Zoeken op betekenis

Het geheugen vindt feiten en hoofdstukken op woorden. Met een embeddings-model vindt het ze ook op betekenis: een vraag in andere woorden bereikt het feit alsnog. De kaart **Matching by meaning** (bovenaan het archief van een chat, en in Canvas > Prompt > Memory) toont waar het staat: uit, mislukt, nog geen vectoren, deels klaar, klaar, of gemaakt door een ander model. Stel het model één keer in via Settings > Memory: standaard gebruikt de app eerst een model op je eigen computer (LM Studio of Ollama), dan een API-verbinding met een sleutel, en dan OpenRouter. Zodra één aanroep van het embeddings-model is gelukt (een druk op de knop van de kaart, of een antwoord), vult de engine de ontbrekende vectoren van elke chat en elk Data Bank-bestand vanzelf aan, met elke paar minuten een blik; alles boven 300.000 tokens wacht op de knop, en een schakelaar **Make vectors by itself** in Settings > Memory zet dat uit. De knop **Embed N items** zegt eerst hoeveel items het zijn en ongeveer hoeveel tokens dat kost, en doet het dan meteen. Nieuwe scènes embedden hun nieuwe items sowieso. Als je het embeddings-model wijzigt, worden de oude vectoren niet gebruikt tot je **Embed again** indrukt. De Data Bank heeft een eigen kaart, **Data Bank by meaning**, bovenaan Settings > Data Bank: die werkt op dezelfde manier voor de passages van je bestanden en snapshot-boeken, en een bestand dat maar deels is gedekt, zegt "7 of 12 by meaning".

## Suggesties en opruimen

"Suggestions" staat standaard op "Ask me first": elke vastzetting en herschrijving wacht op jouw ja. De stille optie past vastzettingen en herschrijvingen meteen toe en logt ze in Activiteit. Buiten gebruik stellen en samenvoegen wachten altijd op jou. "Tidy facts automatically" zoekt na 30 nieuwe feiten naar duplicaten en tegenstrijdigheden, met één extra modelaanroep per 60 feiten.

## Opnieuw opbouwen

"Rebuild from scratch" herschrijft de hoofdstukken en feiten op de achtergrond vanuit de berichten, ongeveer één modelaanroep per 30 seconden. Je eigen, bewerkte en vastgezette feiten en bewerkte hoofdstukken blijven, en het huidige archief wordt gebruikt tot het nieuwe klaar is. Het weigert te starten als geen scène is afgesloten.

Als je berichten bewerkt nadat een hoofdstuk is geschreven, wordt dat hoofdstuk als verouderd gemarkeerd en opnieuw geschreven.

## Gerelateerd

De kaart van een personage kan ook geheugen van afgeronde chats bewaren: zie [[memory]]. De Help-artikelen *Litopys: chapters and proposals*, *Facts and proposals* en *Overview vs Details* behandelen de schermen.
