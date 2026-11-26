<!-- source: b6e3ca620392 -->
# Meanwhile: leven buiten het scherm

Meanwhile laat de mensen die niet in de scène zijn dingen doen terwijl het verhaal doorgaat: Bram verkoopt een paard in de haven, Ada verstopt het grootboek, een front komt een stap dichter bij zijn doel. Het is een testversie, standaard uit.

## Het aanzetten

Open het **World**-blad van de chat en zoek de kaart **Meanwhile**. Zet "Let people off screen act" aan. De schakelaar geldt voor alle chats. Hij heeft het **Dashboard** nodig om aan te staan, omdat Meanwhile de scènes daaruit leest, en hij heeft iemand nodig om te handelen: een personagekaart die niet in de scène is, of een persoon in het boek van de World DM.

## Wanneer het draait

Een pass draait na een antwoord wanneer er minstens twee nieuwe antwoorden zijn gekomen en er ofwel een nieuwe scène begon ofwel de verhaalstijd zes uur verschoof. Eén pass is één modelaanroep. Hij gebruikt zijn eigen model als je er een instelt, anders dat van de World DM, de Dashboard-sensor, de Library, de chat, de app. De kaart zegt welke. "Run a pass now" draait er meteen een.

Een pass vraagt om maximaal drie kleine gebeurtenissen. Hij leest de scène die net is afgesloten, de open draden van het Dashboard, de fronts en voor elke persoon waar de World DM die het laatst achterliet, zodat een gebeurtenis die persoon verder brengt in plaats van het moment waarin die achterbleef te herhalen. De app controleert elk ervan: de mensen moeten mensen zijn die de chat kent, nooit jouw personage en nooit iemand die in de scène is, en de effecten moeten uit een korte lijst komen. Een gebeurtenis die een controle niet doorstaat, wordt in zijn geheel geschrapt, en het log zegt waarom. Een gebeurtenis die opnieuw zegt wat een eerdere gebeurtenis over dezelfde persoon al zei, wordt ook geschrapt ("repeats an earlier event"). Als een model niets antwoordt, probeert de pass het nog eens met meer ruimte; een pass die mislukt, wacht tien minuten.

## Wat de kaart toont

- **What this card shows**: Nothing (alleen dat er iets gebeurde), Hints (wie en waar) of Everything. De standaard is Hints, zodat het verhaal voor jou niet bedorven wordt.
- **Off screen so far**: de gebeurtenissen, voor zover die instelling het toelaat.
- **Log**: elke pass: waarom hij draaide (scène gesloten, tijd verstreken, met de hand), hoeveel gebeurtenissen het model aanbood en hoeveel er behouden bleven, waarom de rest werd geschrapt, en de fout toen hij mislukte.

## Wat de gebeurtenissen met het verhaal doen

Elke behouden gebeurtenis wordt een herinnering van de mensen die het overkwam en van wie het zag, en van niemand anders: nooit van jouw personage. Hij bereikt een antwoord volgens de gebruikelijke regels van het verhaalrecord ([[litopys]]): wanneer een van die mensen spreekt, of een van hen in de scène is voor een antwoord van een verteller of een groep. Iemand die het weet, kan het dan ter sprake brengen, erop zinspelen of ernaar handelen; de anderen niet. Een geheime gebeurtenis is ook gemarkeerd als "kept secret", zodat een groepsantwoord te horen krijgt wie het geheim houdt. De gebeurtenissen worden niet naar de Facts van de Library gekopieerd: ze worden voor elk antwoord uit het Meanwhile-bestand gelezen, dus ze kosten niets om te bewaren en verdwijnen met de swipe. Het paneel "What fired" van de prompt vermeldt ze als elk ander feit.

Als je Meanwhile uitzet, bereiken de gebeurtenissen de antwoorden meteen niet meer.

## In het journaal van het Dashboard

In het brede Dashboard heeft het **Journal** van een personage een sectie **Off screen (Meanwhile)** met de gebeurtenissen die dat personage overkwamen, nieuwste eerst, voor zover de instelling van de kaart ze laat zien: alleen waar en wanneer onder Hints, de tekst onder Everything, en niets onder Nothing. Het leest alleen het Meanwhile-bestand; het schrijft niets in het Dashboard, dus het verdwijnt met een swipe en heeft geen extra instelling nodig. Op een telefoon wordt het Journal niet getoond.

## Swipes en verwijderingen

Een gebeurtenis hoort bij het antwoord waarna hij gebeurde. Als je dat antwoord opnieuw genereert, wordt de nieuwe versie zonder de gebeurtenis geschreven; als je dat antwoord swipet of verwijdert, verdwijnen de gebeurtenissen van die pass ook, uit het verhaal zelf, en de volgende pass leest het verhaal opnieuw vanaf het laatste antwoord dat er nog is.

Gerelateerd: [[world-dm]], [[dashboard]], [[litopys]]. Zie [[litopys]] "Who knows" voor hoe geheimen worden getoond.
