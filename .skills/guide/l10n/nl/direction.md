<!-- source: ae865b32181c -->
# Richting: wie is er in de scène

Richting is voor groepschats. Na elke reactie leest een klein, goedkoop "director"-model de scène en zegt wat voor soort scène het is (een les, een pauze, een alleen-moment, een date) en welke leden erin zitten. Leden die er niet zijn, stoppen met antwoorden en worden weggelaten uit de prompt tot het verhaal ze terugbrengt.

## De balk

In een groepschat zit er een dunne balk onder de ledenbalk, gemarkeerd met "Direction" (op een telefoon alleen het pictogram). Van links naar rechts:

- **De scene chip**: het soort scène en wie er is ("Alleen-moment, met Yuzu" of "Les, 4 hier"). Tik erop om te zien wie er is en wie niet in de scène zit, wanneer het laatste rapport is gemaakt, en een **Report now**-knop die de director opnieuw vraagt. Terwijl de director leest, staat er "De scène lezen…" in de chip.
- **De model chip**: het model van de director. Als er geen is gekozen, staat er **Pick a model**. Tik erop voor dezelfde modellenlijst als in de bovenbalk van de chat: favoriete modellen, dan elk model per verbinding, met een zoekvak.
- **De schakelaar**: Richting aan of uit voor deze chat. Totdat een model is gekozen, is hij grijs en staat er "Pick a model first".
- **Next**: een chip die verschijnt terwijl een genre-regel een notitie heeft die op de volgende reactie wacht ("Next: Yuzu"). De x slaat hem over.
- **Rules**: opent het Richting-venster met twee tabbladen, **Rules** en **Log**. Naast de schakelaar, zodat het op een telefoon in beeld blijft (daar is het alleen een pictogram, met een stip als de regels aanstaan).

Met de schakelaar uit klapt de balk in tot "Direction: off" en werkt de chat zoals voorheen.

## Genre-regels

Een genre is een set kleine regels die mensen op toeval in de scène brengen, zodat een verhaal van dat genre niet vastloopt. Open **Rules** en kies een genre. Voorlopig is er één, **School rom-com**, met drie regels:

- **Interrupted moment**: je bent drie reacties lang alleen geweest met één lid, en iemand komt binnen en onderbreekt jullie.
- **Someone comes by**: niemand is drie reacties lang in de buurt geweest (niet thuis), en een lid komt langs.
- **Friends join the break**: in een pauze, lunch of club waar één of twee aanwezig zijn, sluit een vriend aan.

Een chat begint zonder genre en met de regels uit, dus er verandert niets tot je een genre kiest. Een genre kiezen zet de regels aan; **Rules in this chat** zet ze weer uit en houdt het genre. De regels hebben de director nodig: ze lezen zijn rapporten.

Na elke reactie controleert de code (niet een model) de regels in volgorde. Een regel kan afgaan wanneer de voorwaarden gelden, hij niet rust, en een worp met twee dobbelstenen zijn getal bereikt. Als hij afgaat, krijgt de volgende reactie een korte fase-notitie ("Yuzu walks in on you and Hana and interrupts the moment") en telt de persoon als aanwezig in de scène, zodat hun kaart volledig wordt meegestuurd. Hoogstens één notitie per reactie. De lock, een terugkeer na de lock, en een gebeurtenis of een terugkerend persoon uit de Wereld gaan voor; de regel wacht dan op een volgende beurt.

Elke regelkaart toont zijn status: **Ready**, **Cooling down** (resterende reacties) of **Quiet for the payoff**, en hoe vaak hij richting de payoff is afgegaan. **Numbers** opent de instellingen:

- **2d6 needed**: de worp moet dit getal halen; de tekst ernaast geeft het percentage worpen ("about 42%"). 2 gaat altijd af, 13 nooit.
- **Cooldown**: het aantal reacties dat de regel stil blijft nadat hij is afgegaan.
- **Payoff every** en **Then quiet**: elke K-de keer dat hij afgaat, rust de regel nog M reacties ("finally alone"). 0 zet de payoff uit.

**Fire now** zet de notitie van de regel op de volgende reactie zonder worp, zonder cooldown en zonder mee te tellen voor de payoff; dit vereist dat iemand weg is. **Skip** laat een wachtende notitie vallen. Een notitie die je overslaat of een reactie die je verwijdert, wordt vergeten, met zijn cooldown; wie de reactie met een notitie wegveegt, geeft de nieuwe poging dezelfde notitie.

Onder de reactie die een notitie droeg, staat een kleine regel met wat er gebeurde: "Direction: Mei joins (Friends join the break, 2d6 = 10, needed 9) · came". Het laatste woord is het latere rapport van de director: **came** (ze zijn in de scène), **only mentioned** of **did not come**. Het **Log**-tabblad toont hetzelfde, met de worp en de reden, ook regels die wierpen en misten.

Een groep kan op het tabblad **Direction** een **default genre** instellen; nieuwe chats van die groep starten met dat genre aan. Getallen zijn eerste schattingen: pas ze in een chat aan als een regel te vaak of te zelden afgaat.

## Het model kiezen

Er is één director-model voor alle chats en alle groepen. Kies het vanuit elke balk, of op het tabblad **Direction** van de groep. Er is geen standaard: jij kiest. Een klein, snel model is genoeg: het kost één korte aanroep na elke reactie.

Een nieuwe groepschat start met Richting aan zodra een model is gekozen. Chats die je al had, worden niet aangeraakt. Elke chat heeft zijn eigen schakelaar.

## Wie is weg

Een ledenchip verandert wanneer iemand buiten de scène is: de afbeelding is gedimd en heeft een klein deurteken. Een slotteken betekent dat de lock (hieronder) hen heeft weggelaten. Tik op een chip: de popover zegt "Here" of "Not in the scene".

Een afwezig lid neemt niet zelfstandig beurten, en hun kaart wordt niet naar het model gestuurd: alleen één regel zegt dat ze niet in de scène zijn. Als je ze in je bericht noemt, worden ze nog steeds opgeroepen. Wanneer de director ze weer ziet, keert hun volledige kaart terug.

## De lock en de terugkeer

Om een scène met één persoon vast te houden, tik je op een ledenchip en kies je **Only <name> in the scene**. Een chip "Only Yuzu" verschijnt voor de scene chip, en de anderen blijven buiten, wat de director ook zegt. Tik op de x van die chip, of op **Release the lock** in de popover van een lid, om los te laten. Bij de volgende reactie krijgen de anderen te horen dat ze terug mogen, en wordt het verhaal gevraagd hen een manier naar binnen te geven.

## Als de director faalt

Als het antwoord van de director niet te lezen is, of de aanroep mislukt, toont de scene chip **No report**; open hem om te zien waarom. De chat gebruikt dan het Dashboard-idee van wie er is, of laat iedereen antwoorden zoals eerder. Niets in je verhaal gaat verloren.

## Nieuwe groepen

**New group** opent een breed venster (volledig scherm op een telefoon). Geef de groep een naam, of laat de naam leeg om de eerste drie leden te gebruiken. Zoek, verfijn met **All**, **Favourites** en **Recent**, tag-chips en een sortering (Name, Recently used, Most chats), en tik op portretten om te kiezen. De gekozen leden staan bovenaan in een rij, in spreekvolgorde; de pijlen verplaatsen één plek eerder of later, de x verwijdert. **Next** vraagt om twee personages.

Na **Next** wordt de groep gemaakt en opent de editor met een notitie: controleer hoe hij speelt, en start dan de eerste chat. **Start chat** is de hoofdknop. Het tabblad **Direction** bepaalt of nieuwe chats van deze groep starten met Richting aan, en toont het model van de director. Een groep op de Groups-pagina opent dezelfde editor, net als de groepsnaam bovenaan de chat.

Wanneer je een latere chat van een groep start, heeft de korte stap vóór de chat een **Direction**-schakelaar: aan wanneer de standaard van de groep aan staat en een model is gekozen.

Zie ook [[characters]] en [[dashboard]].
