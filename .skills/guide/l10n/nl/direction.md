<!-- source: 2128e30a104f -->
# Richting: wie is er in de scène

Richting is voor groepschats. Na elke reactie leest een klein, goedkoop "director"-model de scène en zegt wat voor soort scène het is (een les, een pauze, een moment alleen, een date) en welke leden erin zitten. Leden die er niet zijn, stoppen met antwoorden en worden uit de prompt weggelaten totdat het verhaal ze terugbrengt.

## De balk

In een groepschat zit onder de ledenbalk een dunne balk, gemarkeerd met "Direction" (op een telefoon alleen het pictogram). Van links naar rechts:

- **De scènechip**: het soort scène en wie er zijn ("Moment alleen, met Yuzu" of "Les, 4 hier"). De portretten van het Dashboard vervagen voor de leden waarvan hij zegt dat ze niet in de scène zitten. Tik erop om te zien wie er in de scène zitten en wie niet, wanneer het laatste rapport is gemaakt, en een **Report now**-knop die de director opnieuw vraagt. Terwijl de director leest, staat er "Reading the scene…" op de chip.
- **De modelchip**: het model van de director. Als er nog geen is gekozen, staat er **Pick a model**. Tik erop voor dezelfde modellenlijst die de bovenbalk van de chat heeft: favoriete modellen, dan alle modellen per verbinding, met een zoekvak.
- **De schakelaar**: Richting aan of uit voor deze chat. Tot er een model is gekozen, is hij grijs en staat er "Pick a model first".
- **Next**: een chip die verschijnt zolang een genre-regel of een beat uit je plan een notitie heeft klaarstaan voor het volgende antwoord ("Next: Yuzu"). Met de x sla je hem over.
- **Rules**: opent het Richting-venster met drie tabbladen, **Rules**, **Plan** en **Log**. Naast de schakelaar, zodat het op een telefoon zichtbaar blijft (daar is het alleen een pictogram, met een stip zolang de regels aan staan).

Met de schakelaar uit klapt de balk in tot "Direction: off" en werkt de chat zoals voorheen.

## Genre-regels

Een genre is een set kleine regels die mensen op toeval in de scène brengen, zodat een verhaal van dat genre niet vastloopt. Open **Rules** en kies een genre uit de lijst. Er zijn er negen: **School rom-com**, **Harem**, **Slice of life**, **Drama**, **Thriller**, **Detective**, **Steamy romance**, **Adventure** en **Horror**. Elk heeft drie regels, opgebouwd uit dezelfde paar soorten voorwaarden (alleen met één lid voor enkele antwoorden, niemand in de buurt voor enkele antwoorden, de scène is van een soort, slechts enkele aanwezig) en dezelfde drie acties (iemand komt het moment binnenlopen, iemand voegt zich erbij, iemand komt terug). De kaart van een regel zegt in één zin wat hij doet. School rom-com heeft bijvoorbeeld:

- **Interrupted moment**: drie antwoorden lang ben je alleen geweest met één lid, en iemand komt binnen en onderbreekt het moment.
- **Someone comes by**: drie antwoorden lang is niemand in de buurt geweest (niet thuis), en een lid komt langs.
- **Friends join the break**: in een pauze, lunch of club met één of twee aanwezigen, sluit een vriend aan.

Een genre vertelt de director ook welke soorten scènes hij moet zoeken. Iedereen krijgt de gebruikelijke (les, pauze, lunch, club, onderweg, uitje, date, moment alleen, thuis, evenement); een genre voegt er een paar eigen aan toe, zoals gevaar, onderzoek, ruzie, geheim, nacht, reis, werk, maaltijd of rustig moment. Een chat zonder genre, of met School rom-com, ziet alleen de gebruikelijke soorten, dus voor die chat verandert er niets. Zoals overal in Richting vuurt geen enkele regel af in een expliciete scène. De getallen van elk genre zijn eerste schattingen.

Een chat begint zonder genre en met de regels uit, dus er verandert niets totdat je een genre kiest. Een genre kiezen zet de regels aan. **Rules in this chat** zet ze weer uit en houdt het genre. De regels hebben de director aan nodig: ze lezen zijn rapporten.

Na elke reactie controleert de code (niet een model) de regels in volgorde. Een regel kan afgaan wanneer de voorwaarden kloppen, hij niet aan het rusten is, en een worp met twee dobbelstenen zijn getal haalt. Als hij afgaat, krijgt het volgende antwoord een korte notitie over de fase ("Yuzu walks in on you and Hana and interrupts the moment"), en telt de persoon als aanwezig in de scène, zodat zijn of haar kaart volledig wordt meegestuurd. Hooguit één notitie per antwoord. De lock, een terugkeer na de lock, en een gebeurtenis of een terugkerend persoon uit de Wereld gaan voor; de regel wacht dan op een volgende beurt.

Elke regelkaart toont zijn status: **Ready**, **Cooling down** (aantal resterende antwoorden) of **Quiet for the payoff**, en hoe vaak hij richting de beloning is afgegaan. **Numbers** opent de instellingen:

- **2d6 needed**: de worp moet dit getal halen; de tekst ernaast geeft het percentage worpen ("about 42%"). 2 gaat altijd af, 13 nooit.
- **Cooldown**: het aantal antwoorden dat de regel stil blijft nadat hij is afgegaan.
- **Payoff every** en **Then quiet**: elke K-de keer dat hij afgaat, rust de regel nog M antwoorden ("finally alone"). 0 zet de beloning uit.

**Fire now** zet de notitie van de regel op het volgende antwoord, zonder worp, zonder cooldown en zonder mee te tellen voor de beloning. Er moet dan wel iemand weg zijn. **Skip** laat een wachtende notitie vallen. Een notitie die je overslaat of een antwoord dat je verwijdert, wordt vergeten, samen met zijn cooldown. Als je het antwoord met een notitie wegveegt, krijgt de nieuwe poging dezelfde notitie.

Onder het antwoord dat een notitie droeg, staat een kleine regel die zegt wat er gebeurde: "Direction: Mei joins (Friends join the break, 2d6 = 10, needed 9) · came". Het laatste woord is het latere rapport van de director: **came** (ze zijn in de scène), **only mentioned** (alleen genoemd) of **did not come** (kwam niet). Het **Log**-tabblad toont hetzelfde, met de worp en de reden, ook regels die wierpen en misten.

Een groep kan op het tabblad **Direction** een **default genre** instellen. Nieuwe chats van die groep beginnen dan met dat genre aan. De getallen zijn eerste schattingen: verander ze in een chat als een regel te vaak of te zelden afgaat.

**Who comes.** Elke regelkaart heeft een keuze **Who comes**: **Members** (de standaard: iemand uit de groep, degene die het langst weg is), **World people** (één persoon uit de Wereld van deze chat, zoals een leraar of een buurman die het verhaal al heeft) of **Either** (een munt beslist als beide bestaan). De World people komen uit het World-boek van de chat; mensen die met pensioen zijn, die op zichzelf niet terugkomen, of die al in de scène zitten, vallen af. Zonder mensen in de World staan de twee andere opties grijs en zeggen ze waarom. De notitie bij het volgende antwoord zegt wie die persoon is, in één zin uit zijn of haar record, en dat die niet een van de groep is; niemand hier heeft hun kaart, dus het schrijvende model speelt ze uit die zin. Iemand die alleen op de bank zit en niet in je groep is, kan op deze manier onderbreken, meedoen of langskomen.

## Het plan

Een **beat** is iets wat je wilt dat gebeurt: "The bell rings and the class empties into the hall", "Mei brings a cake". Open **Plan** en tik op **Add beat**. Een beat heeft:

- **What happens**: een of twee zinnen, als regieaanwijzing.
- **Who takes part** (optioneel): leden die weg zijn, komen de scène in voor deze beat. Onder **People from the World** kun je ook mensen kiezen die het verhaal al heeft (een leraar, een rivaal); de notitie vertelt het schrijvende model wie ze zijn. Mensen worden gekozen uit het World-boek van de chat, dus er zijn er niet om te kiezen totdat het er een paar heeft.
- **When**: **After some replies** (geteld vanaf het moment dat de beat de volgende wordt; 0 betekent meteen), **Scene** (wanneer de director dat soort scène leest: een les, een pauze, een date...), **Place** (wanneer de plaats van het Dashboard je woorden bevat, zoals "roof"; hoofdletters worden genegeerd) of **By hand** (alleen wanneer je op **Fire now** drukt).
- **Wait for a new scene**: standaard aan. Een beat die aan de beurt is, snijdt niet door het midden van een moment: hij wacht tot zes antwoorden lang tot het verhaal van plaats wisselt of in de tijd springt, en gaat dan hoe dan ook. Een plaatsbeat gaat op het moment dat het verhaal daar aankomt, en een beat op de hand alleen wanneer je hem afvuurt.

Je hoeft niet elke beat vanaf niets te schrijven. **From the genre** (naast **Add beat**) toont kant-en-klare beats van het genre van de chat ("A rumour about the two of them starts going around the school"); als je er een kiest, opent de editor al ingevuld, dus voeg je toe wie meedoet en sla je op. Daarvoor moet er een genre gekozen zijn in **Rules**. **Draft from the cards** vraagt het model van de director één keer om de kaarten van de leden te lezen (en het genre, als er een is) en vijf tot acht beats in volgorde voor te stellen, gebaseerd op wie deze personages zijn. Dat duurt een paar seconden tot een minuut. De voorstellen openen in een **Draft**-kaart met een vinkje bij elk: vink uit wat je niet wilt en druk op **Add** om de rest aan het eind van het plan toe te voegen. Er wordt niets opgeslagen tot je toevoegt; het sluiten van het venster gooit het concept weg, en een beat die al in je plan staat, wordt niet opnieuw voorgesteld. Het concept is maar zo goed als het model van de director; bewerk de beats daarna als alle andere.

Het plan gaat **in volgorde**: alleen de eerste beat die nog niet af is, wordt bekeken. De latere beats staan op "After the beats before it". Een beat is klaar wanneer hij is binnengekomen, wanneer hij is opgegeven (de director heeft hem twee keer zien ontbreken) of wanneer je hem **Skip**. De volgende beat telt zijn antwoorden vanaf het moment dat de vorige eindigde. Elke kaart laat zien waar zijn beat staat: **Waiting** (aantal resterende antwoorden), **Due, waiting for a new scene** (aantal resterende antwoorden), **Goes with the next reply**, **Delivered** (gekomen, alleen genoemd, of binnengegaan toen niemand werd genoemd), **Did not land**, **Skipped**. Als iets een beat tegenhoudt, zegt de kaart waarom: Richting staat uit, de scène is op slot, of de scène is expliciet (een beat gaat er nooit in; hij gaat wanneer de scène eruit stapt). **Edit**, **Move up**, **Move down** en **Delete** wijzigen de lijst. **Fire now** zet de beat meteen op het volgende antwoord, wat hij ook wacht.

Een beat gebruikt dezelfde machinerie als een genre-regel. Na elk antwoord controleert de code het plan vóór de regels, en de notitie rijdt mee op het volgende antwoord (één notitie per antwoord; de lock, een terugkeer na de lock, en een gebeurtenis of een terugkerend persoon uit de Wereld gaan voor, en de beat gaat dan bij het volgende antwoord opnieuw). Het latere rapport van de director zegt of ze **came** zijn, **only mentioned** zijn, of dat het **did not land**. De director kent alleen de leden van de groep, dus voor het ene antwoord dat een notitie met World-mensen draagt, wordt ook gevraagd of die mensen in de scène zijn; elk ander antwoord wordt zoals voorheen gelezen. Een beat die niet is aangekomen, wordt nog één keer geprobeerd met een strengere notitie, en dan opgegeven. Een antwoord dat je wegveegt, geeft de nieuwe poging dezelfde notitie. Een antwoord dat je verwijdert, zet zijn beat terug in het plan.

## Het model kiezen

Er is één director-model voor alle chats en alle groepen. Kies het vanuit elke balk, of op het tabblad **Direction** van de groep. Er is geen standaard: jij kiest. Een klein, snel model is genoeg: het kost één korte aanroep na elk antwoord.

Een nieuwe groepschat start met Richting aan zodra er een model is gekozen. Chats die je al had, worden niet aangeraakt. Elke chat heeft zijn eigen schakelaar.

## Wie er niet zijn

Een ledenchip verandert wanneer iemand buiten de scène is: de foto wordt gedimd en krijgt een klein deurteken. Een slotteken betekent dat de lock (hieronder) hem of haar heeft weggelaten. Tik op een chip: de popover zegt "Here" of "Not in the scene".

Een afwezig lid neemt niet zelfstandig beurten, en zijn of haar kaart wordt niet naar het model gestuurd: één regel zegt alleen dat die persoon niet in de scène is. Als je de naam in je bericht noemt, wordt hij of zij nog steeds opgeroepen. Wanneer de director ziet dat ze terug zijn, keert de volledige kaart terug.

## De lock en de terugkeer

Om een scène met één persoon vast te houden, tik je op een ledenchip en kies je **Only <name> in the scene**. Vóór de scènechip verschijnt een chip "Only Yuzu", en de anderen blijven buiten, wat de director ook zegt. Tik op de x van die chip, of op **Release the lock** in de popover van een lid, om los te laten. Bij het volgende antwoord krijgen de anderen te horen dat ze terug mogen, en het verhaal wordt gevraagd hen een manier naar binnen te geven.

## Als de director faalt

Als het antwoord van de director niet te lezen is, of de aanroep mislukt, toont de scènechip **No report**. Open hem om te zien waarom. De chat gebruikt dan het idee van het Dashboard over wie er zijn, of laat iedereen antwoorden zoals eerder. Niets van je verhaal gaat verloren.

## Nieuwe groepen

**New group** opent een breed venster (op een telefoon het hele scherm). Geef de groep een naam, of laat de naam leeg om de eerste drie leden te gebruiken. Zoek, verfijn met **All**, **Favourites** en **Recent**, tagchips en een sortering (Name, Recently used, Most chats), en tik op portretten om te kiezen. De gekozen leden staan bovenaan op een rij, in spreekvolgorde. De pijltjes verplaatsen één plek eerder of later, de x verwijdert. **Next** heeft minstens twee personages nodig.

Na **Next** wordt de groep gemaakt en opent de editor met een notitie: controleer hoe het speelt, en start dan de eerste chat. **Start chat** is de hoofdknop. Het tabblad **Direction** bepaalt of nieuwe chats van deze groep starten met Richting aan, en toont het model van de director. Een groep op de Groups-pagina opent dezelfde editor, net als de groepsnaam bovenaan de chat.

Wanneer je een latere chat van een groep start, heeft de korte stap vóór de chat een **Direction**-schakelaar: aan wanneer de standaard van de groep aan staat en er een model is gekozen.

Zie ook [[characters]] en [[dashboard]].
