<!-- source: f7cfe4722702 -->
# Sprites en spritevensters

Sprites zijn kleine plaatjes van een personage, één per emotie, die boven de chat verschijnen en veranderen naarmate het verhaal vordert. Deze pagina is voor wie meerdere personages tegelijk wil zien, in een groep of met een vertellerkaart, of een visual-novel-look wil opbouwen.

## Wat een spritevenster is

Een spritevenster zweeft boven de chat en toont **één personage**. Het kiest het plaatje op basis van de laatste regels van dat personage zelf (met dezelfde trefwoordregels als voorheen; er wordt geen model aangeroepen), en het plaatje blijft staan tot het personage weer spreekt. Sleep een venster waar je maar wilt, sleep de onderste hoek om het formaat te wijzigen (dubbelklik op de hoek om terug te gaan naar het standaardformaat) en druk op **×** om het op te vouwen tot een klein rond bolletje; druk op het bolletje om het terug te halen.

Sprites voeg je aan een kaart toe in de editor, tabblad **More**, **Sprites**. Instellingen heeft één schakelaar, "Expression Sprites", die alle vensters uitzet.

## Eén venster of meerdere

Een nieuwe chat heeft één venster dat, zoals altijd, **degene die spreekt** volgt. Druk op het tandwiel van een venster om **Sprite windows** te openen:

- **Add window** (maximaal 8). Een nieuw venster toont "Next in the scene".
- **Shows**, per venster: "Whoever speaks", "Next in the scene" of één bij naam gekozen personage (een lid van de groep of één stem van een vertellerkaart).
- **Transparent background**, per venster: geen kader en geen achtergrond, alleen het plaatje. Klikken gaan erdoorheen naar de chattekst, dus zo'n venster verplaats je met het kleine grijpvlak linksboven.
- **Visible part**: een schuifregelaar van 35% tot 100% (standaard 100%). Minder dan 100% toont alleen de bovenkant van elk plaatje, zodat de benen worden afgesneden (van de taille omhoog, of een buste bij 40%); de hoogte van een venster is dan het deel dat zichtbaar is, en het plaatje wordt daarvoor groter getekend. Samen met de strook onder de tekst geeft dit de visual-novel-look en houdt het de chat bijna zijn hele hoogte.
- **Windows are**: "In front of the text" (standaard), "Behind the text" (de chattekst wordt over de plaatjes heen getekend, die eronder blijven; elk bericht krijgt een achtergrond in de paginakleur zodat het leesbaar blijft, en de schuifregelaar **Text backing** bepaalt de sterkte ervan van 0% tot 100%, standaard 55%; de knoppen van een venster worden vaag en het venster verplaats je met zijn grijpvlak) of "In a strip under the text" (de chat houdt onder zijn tekst een strook vrij voor de vensters, zodat er nooit tekst onder een plaatje ligt; de vensters blijven dan onderaan en schuiven alleen opzij, en de strook is zo hoog als het hoogste venster). Deze opties zijn voor tablets en computers; een telefoon houdt ze op de voorgrond.
- **Arrange**: "Row at the bottom" (de visual-novel-look) of "Grid". Ze plaatsen de vensters alleen; vanaf daar sleep je ze zelf.
- **Hide empty windows**.
- **Back to one window**.

De indeling wordt opgeslagen **per chat, in deze browser**. Ze gaat niet mee naar een ander apparaat.

## Wie er "in de scène" is

Vensters met "Next in the scene" tonen de mensen van de scène behalve degene die spreekt, en een personage **houdt zijn venster** zolang het blijft: niemand springt naar een ander venster als iemand anders spreekt. Wanneer een personage de scène verlaat, wordt zijn venster leeg ("Nobody here"), of verdwijnt het als "Hide empty windows" aan staat, en de volgende nieuwkomer neemt een vrij venster.

De scène is de lijst "Present" van het Dashboard als het Dashboard het verhaal heeft gelezen (zie [[dashboard]]). Zonder Dashboard bestaat de scène uit wie er in de laatste zes berichten sprak.

## Outfits

Een personage met meer dan één outfit krijgt een kleine outfitschakelaar op het venster. De keuze wordt voor de chat bewaard en is apart voor elk lid van een groep.

## Op een telefoon

Een telefoon toont **één venster**; de andere mensen van de scène zijn kleine ronde plaatjes linksonder. Tik op een plaatje om dat personage in het venster te tonen, tik er nogmaals op om weer degene die spreekt te volgen. Transparante vensters, indelen en extra vensters zijn voor tablets en computers.

## Wat het niet doet

Het tekent niets en leest het verhaal niet met een model: een personage zonder sprites heeft geen venster, en een personage dat nooit gesproken heeft toont zijn standaardplaatje. Een groepslid zonder sprites wordt overgeslagen.
