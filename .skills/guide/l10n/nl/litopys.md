<!-- source: 9004c118e307 -->
# Litopys: het verhaalarchief

Litopys (de kroniek) is het lange geheugen van één chat. Het leest het verhaal op de achtergrond en schrijft een hoofdstuk voor elke afgeronde scène, plus de feiten die het verhaal heeft vastgesteld. Wanneer een chat te lang wordt voor het venster van het model, draagt het archief het verhaal verder. Gebruik het voor lange verhalen; je hoeft het niet te starten.

## Hoofdstukken en feiten

- Een **hoofdstuk** zegt wat er in een scène is veranderd, geen navertelling. Het wordt geschreven zodra de volgende scène begint, dus de laatste scène heeft er misschien nog geen. Een nieuwe plaats of een sprong in de tijd sluit een scène; je kunt ook zelf een reeks berichten als scène markeren, vanuit het "Meer"-menu van een bericht onder Verhaal.
- Een **feit** is één korte zin die waar blijft: "Medli verbergt haar vleugels op de markt." Feiten hebben een type, een gewicht (Alledaags, Belangrijk, Sleutel) en wie ze kent. Je kunt feiten met de hand toevoegen, bewerken, vastzetten of buiten gebruik stellen.
- **Voorstellen** zijn Litopys' suggesties: twee feiten samenvoegen, een buiten gebruik stellen, herformuleren, vastzetten. Je accepteert of weigert elk.
- **Gewoonten** die een personage duidelijk toont kunnen ook verschijnen, en worden een gewoonte na herhaling in meerdere scènes.

## Waar te kijken

Druk op **Archief** in de chatkop (op een telefoon, in het Menu) voor het archief van deze chat in een zijpaneel. De **Bibliotheek**-sectie van de rail toont het archief van elke chat. Die heeft twee weergaven: Overzicht (een tijdlijn, een kaart per personage, wachtende voorstellen) en Details met de tabbladen Hoofdstukken, Feiten, Voorstellen, Gewoonten en Activiteit. Het tabblad Activiteit logt wat Litopys deed, met Ongedaan maken waar mogelijk. Het tandwiel ("Litopys-instellingen") bepaalt hoe het archief wordt geschreven.

## Wat er in de prompt gaat

Standaard wordt het archief automatisch ingevoegd. "Geheugenomvang" zegt hoeveel tokens het mag innemen: Compact (800 tokens) standaard, Auto (15% van het modelvenster, minstens 800) of Aangepast van 200 tot 16000. Wanneer alles past, wordt alles verzonden; anders de delen die voor de scène het meest tellen. Een klein model wil een kleine omvang. "Hoofdstukken en feiten" uit betekent geen nieuwe hoofdstukken of feiten en niets toegevoegd aan de prompt.

Oudere berichten kunnen de prompt alleen verlaten wanneer het venster vol is, of scène voor scène zodra een hoofdstuk ze dekt; de instelling "Oudere berichten verlaten de prompt" kiest.

## Suggesties en opruimen

"Suggesties" staat standaard op "Vraag het mij eerst": elke vastzetting en herschrijving wacht op jouw ja. De stille optie past vastzettingen en herschrijvingen meteen toe en logt ze in Activiteit. Buiten gebruik stellen en samenvoegen wachten altijd op jou. "Feiten automatisch opruimen" zoekt na 30 nieuwe feiten naar duplicaten en tegenstrijdigheden, met één extra modelaanroep per 60 feiten.

## Opnieuw opbouwen

"Opnieuw opbouwen vanaf nul" herschrijft de hoofdstukken en feiten uit de berichten op de achtergrond, ongeveer één modelaanroep per 30 seconden. Je eigen, bewerkte en vastgezette feiten en bewerkte hoofdstukken blijven, en het huidige archief wordt gebruikt tot het nieuwe klaar is. Het weigert te starten als geen scène is gesloten.

Als je berichten bewerkt nadat een hoofdstuk is geschreven, wordt dat hoofdstuk als verouderd gemarkeerd en herschreven.

## Gerelateerd

De kaart van een personage kan ook geheugen van afgeronde chats bewaren: zie [[memory]]. De Help-artikelen *Litopys: hoofdstukken en voorstellen*, *Feiten en voorstellen* en *Overzicht versus Details* behandelen de schermen.
