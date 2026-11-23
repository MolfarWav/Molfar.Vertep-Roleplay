<!-- source: 2128e30a104f -->
# Direction: wer in der Szene ist

Direction ist für Gruppen-Chats. Nach jeder Antwort liest ein kleines, günstiges „Director“-Modell die Szene und sagt, um welche Art von Szene es sich handelt (eine Lektion, eine Pause, ein Moment allein, ein Date) und welche Mitglieder darin sind. Mitglieder, die nicht da sind, antworten nicht mehr und werden aus dem Prompt ausgeschlossen, bis die Geschichte sie zurückbringt.

## Die Leiste

In einem Gruppen-Chat gibt es eine dünne Leiste unter der Mitgliederleiste, die mit „Direction“ beschriftet ist (auf dem Telefon nur das Symbol). Von links nach rechts:

- **Der Szenen-Chip**: die Art der Szene und wer hier ist („Alone moment, with Yuzu“ oder „Lesson, 4 here“). Die Porträts im Dashboard verblassen für die Mitglieder, von denen er sagt, dass sie nicht in der Szene sind. Tippe darauf, um zu sehen, wer in der Szene ist und wer nicht, wann der letzte Bericht erstellt wurde, und einen Button **Report now**, der den Director erneut fragt. Während der Director liest, zeigt der Chip „Reading the scene…“.
- **Der Modell-Chip**: das Modell des Directors. Ist noch keins gewählt, steht dort **Pick a model**. Tippe darauf, um dieselbe Modellliste zu sehen wie in der oberen Leiste des Chats: markierte Modelle, dann alle Modelle nach Verbindung, mit Suchfeld.
- **Der Schalter**: Direction an oder aus für diesen Chat. Solange noch kein Modell gewählt ist, ist er ausgegraut und sagt „Pick a model first“.
- **Next**: ein Chip, der erscheint, während eine Genre-Regel oder ein Beat deines Plans eine Notiz für die nächste Antwort bereithält („Next: Yuzu“). Das x überspringt sie.
- **Rules**: öffnet das Direction-Blatt mit drei Reitern, **Rules**, **Plan** und **Log**. Es liegt neben dem Schalter, damit es auf dem Telefon sichtbar bleibt (dort nur als Symbol, mit einem Punkt, solange die Regeln aktiv sind).

Bei ausgeschaltetem Schalter klappt die Leiste zu „Direction: off“ zusammen, und der Chat funktioniert wie zuvor.

## Genre-Regeln

Ein Genre ist eine Gruppe kleiner Regeln, die Figuren zufällig in die Szene bringen, damit eine Geschichte dieses Genres nicht stockt. Öffne **Rules** und wähle ein Genre aus der Liste. Es gibt neun: **School rom-com**, **Harem**, **Slice of life**, **Drama**, **Thriller**, **Detective**, **Steamy romance**, **Adventure** und **Horror**. Jedes hat drei Regeln, aufgebaut aus denselben wenigen Arten von Bedingung (eine Zeit lang allein mit einem Mitglied, eine Zeit lang niemand in der Nähe, die Szene ist von einer bestimmten Art, nur wenige sind anwesend) und denselben drei Aktionen (jemand platzt in den Moment, jemand schließt sich an, jemand kommt zurück). Die Karte einer Regel sagt in einem Satz, was sie tut. Zum Beispiel hat School rom-com:

- **Interrupted moment**: du warst drei Antworten lang allein mit einem Mitglied, und jemand platzt herein.
- **Someone comes by**: drei Antworten lang war niemand da (nicht zu Hause), und ein Mitglied schaut vorbei.
- **Friends join the break**: in einer Pause, beim Mittagessen oder im Club, mit ein oder zwei anwesenden Personen, kommt ein Freund dazu.

Ein Genre sagt dem Director außerdem, welche Arten von Szene er suchen soll. Alle bekommen die üblichen (Lektion, Pause, Mittagessen, Club, unterwegs, Ausflug, Date, Moment allein, zu Hause, Ereignis); ein Genre fügt einige eigene hinzu, etwa Gefahr, Ermittlung, Streit, Geheimnis, Nacht, Reise, Arbeit, Mahlzeit oder Auszeit. Ein Chat ohne Genre oder mit School rom-com sieht nur die üblichen, daher ändert sich für ihn nichts. Wie überall bei Direction feuert keine Regel in einer expliziten Szene. Die Zahlen jedes Genres sind erste Schätzungen.

Ein Chat startet ohne Genre und mit ausgeschalteten Regeln, daher ändert sich nichts, bis du eines wählst. Ein Genre zu wählen schaltet die Regeln ein; **Rules in this chat** schaltet sie wieder aus und behält das Genre. Die Regeln brauchen den Director, denn sie lesen seine Berichte.

Nach jeder Antwort prüft der Code (kein Modell) die Regeln der Reihe nach. Eine Regel darf auslösen, wenn ihre Bedingungen erfüllt sind, sie nicht ruht und ein Wurf mit zwei Würfeln ihre Zahl erreicht. Wenn sie auslöst, bekommt die nächste Antwort eine kurze Szenennotiz („Yuzu walks in on you and Hana and interrupts the moment“), und die Person zählt als in der Szene, sodass ihre Karte vollständig gesendet wird. Höchstens eine Notiz pro Antwort. Die Sperre, eine Rückkehr nach der Sperre sowie ein Ereignis oder eine zurückkehrende Person aus World kommen zuerst; die Regel wartet dann auf einen anderen Zug.

Jede Regelkarte zeigt ihren Zustand: **Ready**, **Cooling down** (verbleibende Antworten) oder **Quiet for the payoff**, und wie oft sie schon auf die Auflösung hin ausgelöst hat. **Numbers** öffnet ihre Einstellungen:

- **2d6 needed**: der Wurf muss diese Zahl erreichen; der Text daneben nennt den Anteil der Würfe („about 42%“). 2 löst immer aus, 13 nie.
- **Cooldown**: Antworten, in denen die Regel nach einem Auslösen ruhig bleibt.
- **Payoff every** und **Then quiet**: bei jedem K-ten Auslösen ruht die Regel noch M Antworten lang („finally alone“). 0 schaltet die Auflösung ab.

**Fire now** legt die Notiz der Regel ohne Wurf, ohne Cooldown und ohne Zählung zur Auflösung auf die nächste Antwort; dafür muss jemand weg sein. **Skip** verwirft eine wartende Notiz. Eine übersprungene Notiz oder eine gelöschte Antwort wird samt Cooldown vergessen; wenn du die Antwort mit einer Notiz wegwischst, bekommt der neue Versuch dieselbe Notiz.

Unter der Antwort, die eine Notiz trug, zeigt eine kleine Zeile, was passiert ist: „Direction: Mei joins (Friends join the break, 2d6 = 10, needed 9) · came“. Das letzte Wort ist der spätere Bericht des Directors: **came** (sie sind in der Szene), **only mentioned** (nur erwähnt) oder **did not come** (nicht gekommen). Der Reiter **Log** listet dasselbe mit Wurf und Grund auf, dazu Regeln, die gewürfelt und verfehlt haben.

Eine Gruppe kann auf ihrem Reiter **Direction** ein **default genre** festlegen; ihre neuen Chats starten dann mit diesem Genre. Die Zahlen sind erste Schätzungen: ändere sie in einem Chat, wenn eine Regel zu oft oder zu selten auslöst.

**Who comes.** Jede Regelkarte hat eine Auswahl **Who comes**: **Members** (der Standard: jemand aus der Gruppe, der am längsten weg war), **World people** (eine Person aus der World dieses Chats, etwa ein Lehrer oder ein Nachbar, den die Geschichte schon hat) oder **Either** (eine Münze entscheidet, wenn beide vorhanden sind). Die World-Personen kommen aus dem World-Buch des Chats; ausgeschiedene Personen, solche, die nicht von allein zurückkehren sollen, und Personen, die schon in der Szene sind, werden ausgelassen. Ohne Personen in der World sind die beiden anderen Optionen ausgegraut und sagen, warum. Die Notiz der nächsten Antwort sagt in einem Satz aus dem Eintrag der Person, wer sie ist und dass sie nicht zu deiner Gruppe gehört; niemand hier hat ihre Karte, deshalb spielt das schreibende Modell sie anhand dieses Satzes. Eine Person, die nur auf der Ersatzbank sitzt und nicht in deiner Gruppe ist, kann auf diesem Weg unterbrechen, sich anschließen oder vorbeikommen.

## Der Plan

Ein **Beat** ist etwas, das du geschehen lassen willst: „Die Glocke läutet, und die Klasse strömt in die Halle“, „Mei bringt einen Kuchen“. Öffne **Plan** und tippe auf **Add beat**. Ein Beat hat:

- **What happens**: ein oder zwei Sätze als Regieanweisung.
- **Who takes part** (optional): abwesende Mitglieder kommen für ihn in die Szene. Unter **People from the World** kannst du auch Personen wählen, die die Geschichte bereits hat (einen Lehrer, eine Rivalin); die Notiz sagt dem schreibenden Modell, wer sie sind. Personen werden aus dem World-Buch des Chats gewählt, es gibt also nichts zu wählen, bis es dort welche gibt.
- **When**: **After some replies** (gezählt ab dem Moment, in dem der Beat der nächste wird; 0 heißt sofort), **Scene** (wenn der Director diese Art von Szene liest: eine Lektion, eine Pause, ein Date ...), **Place** (wenn der Ort im Dashboard deine Worte enthält, etwa „roof“; Groß- und Kleinschreibung wird ignoriert) oder **By hand** (nur wenn du **Fire now** drückst).
- **Wait for a new scene**: standardmäßig an. Ein fälliger Beat schneidet nicht mitten in einen Moment hinein: er wartet bis zu 6 Antworten darauf, dass die Geschichte Ort oder Zeit wechselt, und kommt dann trotzdem. Ein Ort-Beat kommt in dem Moment, in dem die Geschichte dort ankommt, und ein **By hand**-Beat nur, wenn du ihn auslöst.

Du musst nicht jeden Beat von Null schreiben. **From the genre** (neben **Add beat**) listet fertige Beats des Genres des Chats auf („A rumour about the two of them starts going around the school“); wählst du einen, öffnet sich der Editor ausgefüllt, du trägst ein, wer mitwirkt, und speicherst. Dafür muss in **Rules** ein Genre gewählt sein. **Draft from the cards** bittet das Modell des Directors einmal, die Karten der Mitglieder (und das Genre, falls vorhanden) zu lesen und fünf bis acht Beats in Reihenfolge vorzuschlagen, die auf den Figuren aufbauen. Das dauert einige Sekunden bis eine Minute. Die Vorschläge öffnen sich in einer **Draft**-Karte mit einem Häkchen bei jedem: entferne die Haken bei denen, die du nicht willst, und drücke **Add**, um den Rest ans Ende des Plans zu setzen. Nichts wird gespeichert, bevor du hinzufügst; wird das Blatt geschlossen, verfällt der Entwurf, und ein Beat, der schon im Plan steht, wird nicht erneut vorgeschlagen. Der Entwurf ist nur so gut wie das Modell des Directors; bearbeite die Beats danach wie jeden anderen.

Der Plan läuft **in Reihenfolge**: nur der erste Beat, der nicht erledigt ist, wird angesehen; die dahinter stehenden sagen „After the beats before it“. Ein Beat ist erledigt, wenn er eingetreten ist, wenn er aufgegeben wurde (der Director hat ihn zweimal ausgelassen gesehen) oder wenn du ihn **Skip**st. Der nächste Beat zählt seine Antworten ab dem Ende des vorherigen. Jede Karte zeigt, wo ihr Beat steht: **Waiting** (verbleibende Antworten), **Due, waiting for a new scene** (verbleibende Antworten), **Goes with the next reply**, **Delivered** (came, only mentioned oder hineingegangen, obwohl niemand genannt wurde), **Did not land**, **Skipped**. Hält etwas einen Beat zurück, sagt die Karte warum: Direction ist aus, die Szene ist gesperrt, oder die Szene ist explizit (ein Beat wird dort nie ausgelöst; er kommt, sobald die Szene sie verlässt). **Edit**, **Move up**, **Move down** und **Delete** ändern die Liste; **Fire now** legt den Beat sofort auf die nächste Antwort, worauf er auch immer wartet.

Ein Beat nutzt dieselbe Mechanik wie eine Genre-Regel: nach jeder Antwort prüft der Code den Plan vor den Regeln, die Notiz reist mit der nächsten Antwort (eine Notiz pro Antwort; die Sperre, eine Rückkehr nach der Sperre sowie ein Ereignis oder eine zurückkehrende Person aus World kommen zuerst, und der Beat wird bei der nächsten Antwort erneut versucht), und der spätere Bericht des Directors sagt, ob sie **came** oder **only mentioned** waren oder ob der Beat **did not land**. Der Director kennt nur die Mitglieder der Gruppe; deshalb wird er bei der einen Antwort, die eine Notiz mit World-Personen trägt, zusätzlich gefragt, ob diese Personen in der Szene sind. Jede andere Antwort wird wie bisher gelesen. Ein Beat, der nicht gelandet ist, wird noch einmal mit einer strengeren Notiz versucht und dann aufgegeben. Eine Antwort, die du wegwischst, gibt dem neuen Versuch dieselbe Notiz; eine Antwort, die du löschst, nimmt ihren Beat zurück.

## Das Modell wählen

Es gibt ein Director-Modell für alle Chats und alle Gruppen. Wähle es aus einer beliebigen Leiste oder auf dem Reiter **Direction** der Gruppe. Es gibt keinen Standard: du wählst. Ein kleines, schnelles Modell reicht: es kostet einen kurzen Aufruf nach jeder Antwort.

Ein neuer Gruppen-Chat startet mit eingeschalteter Direction, sobald ein Modell gewählt ist. Bestehende Chats bleiben unverändert. Jeder Chat hat seinen eigenen Schalter.

## Wer abwesend ist

Ein Mitglieder-Chip ändert sich, wenn jemand nicht in der Szene ist: das Bild wird abgedunkelt und trägt ein kleines Türsymbol. Ein Schlosssymbol bedeutet, dass das Schloss (unten) die Person ausgeschlossen hat. Tippe auf einen Chip: sein Popover sagt „Here“ oder „Not in the scene“.

Ein abwesendes Mitglied übernimmt keine Züge von selbst, und seine Karte wird nicht an das Modell gesendet: nur eine Zeile sagt, dass es nicht in der Szene ist. Wenn du es in deiner Nachricht nennst, wird es trotzdem hereingerufen. Sieht der Director es wieder, kehrt seine ganze Karte zurück.

## Das Schloss und die Rückkehr

Um eine Szene mit einer Person zu halten, tippe auf einen Mitglieder-Chip und wähle **Only <name> in the scene**. Ein Chip „Only Yuzu“ erscheint vor dem Szenen-Chip, und die anderen bleiben draußen, was der Director auch sagt. Tippe auf das x dieses Chips oder auf **Release the lock** im Popover eines Mitglieds, um es zu lösen. Bei der nächsten Antwort erfahren die anderen, dass sie zurückkommen dürfen, und die Geschichte wird gebeten, ihnen einen Weg hinein zu geben.

## Wenn der Director versagt

Ist die Antwort des Directors nicht lesbar oder schlägt der Aufruf fehl, zeigt der Szenen-Chip **No report**; öffne ihn, um den Grund zu sehen. Der Chat nutzt dann die Vorstellung des Dashboards davon, wer hier ist, oder lässt alle wie bisher antworten. Nichts in deiner Geschichte geht verloren.

## Neue Gruppen

**New group** öffnet ein breites Fenster (auf dem Telefon Vollbild). Gib der Gruppe einen Namen oder lass das Feld leer, dann werden die ersten drei Mitglieder verwendet. Suche, grenze mit **All**, **Favourites** und **Recent** ein, nutze Tag-Chips und eine Sortierung (Name, Recently used, Most chats) und tippe auf Porträts, um auszuwählen. Die gewählten Mitglieder stehen oben in einer Reihe in Sprechreihenfolge; die Pfeile verschieben einen früher oder später, das x entfernt ihn. **Next** braucht zwei Zeichen.

Nach **Next** wird die Gruppe angelegt, und ihr Editor öffnet sich mit einem Hinweis: Prüfe, wie sie spielt, und starte dann den ersten Chat. **Start chat** ist der Hauptbutton. Der Reiter **Direction** legt fest, ob neue Chats dieser Gruppe mit eingeschalteter Direction starten, und zeigt das Modell des Directors. Eine Gruppe auf der Gruppenseite öffnet denselben Editor, ebenso wie der Gruppenname oben in ihrem Chat.

Wenn du einen späteren Chat einer Gruppe startest, hat der kurze Schritt vor dem Chat einen **Direction**-Schalter: an, wenn der Standard der Gruppe an ist und ein Modell gewählt wurde.

Siehe auch [[characters]] und [[dashboard]].
