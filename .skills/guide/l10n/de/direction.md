<!-- source: 3fac4b007f13 -->
# Direction: wer in der Szene ist

Direction ist für Gruppen-Chats. Nach jeder Antwort liest ein kleines, günstiges „Director“-Modell die Szene und sagt, um welche Art von Szene es sich handelt (eine Lektion, eine Pause, ein Alleinmoment, ein Date) und welche Mitglieder darin sind. Mitglieder, die nicht da sind, antworten nicht mehr und werden aus dem Prompt ausgeschlossen, bis die Geschichte sie zurückbringt.

## Die Leiste

In einem Gruppen-Chat gibt es eine dünne Leiste unter der Mitgliederleiste, die mit „Direction“ beschriftet ist (auf einem Telefon nur das Symbol). Von links nach rechts:

- **Der Scene-Chip**: die Art der Szene und wer hier ist („Alone moment, with Yuzu“ oder „Lesson, 4 here“). Tippe darauf, um zu sehen, wer hier ist und wer nicht in der Szene ist, wann der letzte Bericht erstellt wurde, und einen **Report now**-Button, der den Director erneut befragt. Während der Director liest, zeigt der Chip „Reading the scene…“.
- **Der Model-Chip**: das Modell des Directors. Wenn keins ausgewählt ist, wird **Pick a model** angezeigt. Tippe darauf, um dieselbe Modellliste wie in der oberen Leiste des Chats zu sehen: markierte Modelle, dann jedes Modell nach Verbindung, mit einem Suchfeld.
- **Der Switch**: Direction ein- oder ausgeschaltet für diesen Chat. Bis ein Modell ausgewählt ist, ist er ausgegraut und zeigt „Pick a model first“.
- **Next**: ein Chip, der erscheint, während eine Genre-Regel oder ein Beat deines Plans eine Notiz für die nächste Antwort bereithält („Next: Yuzu“). Das x überspringt sie.
- **Rules**: öffnet das Direction-Fenster mit drei Tabs, **Rules**, **Plan** und **Log**. Er steht neben dem Switch, damit er auf einem Telefon sichtbar bleibt (dort nur ein Symbol, mit einem Punkt, solange die Regeln an sind).

Wenn der Switch ausgeschaltet ist, klappt die Leiste zu „Direction: off“ zusammen und der Chat funktioniert wie zuvor.

## Genre-Regeln

Ein Genre ist eine Reihe kleiner Regeln, die Menschen per Zufall in die Szene bringen, damit eine Geschichte dieses Genres nicht stockt. Öffne **Rules** und wähle ein Genre. Derzeit gibt es eins, **School rom-com**, mit drei Regeln:

- **Interrupted moment**: du warst drei Antworten lang allein mit einem Mitglied, und jemand platzt herein.
- **Someone comes by**: drei Antworten lang war niemand da (nicht zu Hause), und ein Mitglied schaut vorbei.
- **Friends join the break**: in einer Pause, beim Mittagessen oder im Club, wenn ein oder zwei Personen anwesend sind, kommt ein Freund dazu.

Ein Chat startet ohne Genre und mit ausgeschalteten Regeln, daher ändert sich nichts, bis du ein Genre wählst. Ein Genre zu wählen schaltet die Regeln ein; **Rules in this chat** schaltet sie wieder aus und behält das Genre. Die Regeln brauchen den Director, denn sie lesen seine Berichte.

Nach jeder Antwort prüft der Code (kein Modell) die Regeln der Reihe nach. Eine Regel kann auslösen, wenn ihre Bedingungen erfüllt sind, sie nicht ruht und ein Wurf mit zwei Würfeln ihre Zahl erreicht. Wenn sie auslöst, bekommt die nächste Antwort eine kurze Bühnennotiz („Yuzu walks in on you and Hana and interrupts the moment“), und die Person gilt als in der Szene, sodass ihre Karte vollständig gesendet wird. Höchstens eine Notiz pro Antwort. Die Sperre, eine Rückkehr nach der Sperre sowie ein Ereignis oder eine zurückkehrende Person aus World kommen zuerst; die Regel wartet dann auf einen anderen Zug.

Jede Regelkarte zeigt ihren Zustand: **Ready**, **Cooling down** (Antworten übrig) oder **Quiet for the payoff**, und wie oft sie bereits auf den Höhepunkt hin ausgelöst hat. **Numbers** öffnet ihre Einstellungen:

- **2d6 needed**: der Wurf muss diese Zahl erreichen; der Text daneben nennt den Prozentsatz der Würfe („about 42%“). 2 löst immer aus, 13 nie.
- **Cooldown**: Antworten, in denen die Regel nach dem Auslösen ruhig bleibt.
- **Payoff every** und **Then quiet**: bei jedem K-ten Auslösen ruht die Regel noch M Antworten lang („finally alone“). 0 schaltet den Höhepunkt ab.

**Fire now** legt die Notiz der Regel ohne Wurf, ohne Cooldown und ohne Zählung auf den Höhepunkt auf die nächste Antwort; dafür muss jemand abwesend sein. **Skip** verwirft eine wartende Notiz. Eine übersprungene Notiz oder eine gelöschte Antwort wird vergessen, samt Cooldown; wenn du die Antwort mit einer Notiz wischst, bekommt der neue Versuch dieselbe Notiz.

Unter der Antwort mit einer Notiz steht eine kleine Zeile, was passiert ist: „Direction: Mei joins (Friends join the break, 2d6 = 10, needed 9) · came“. Das letzte Wort ist der spätere Bericht des Directors: **came** (sie sind in der Szene), **only mentioned** (nur erwähnt) oder **did not come**. Der Tab **Log** listet dasselbe mit Wurf und Grund auf, dazu Regeln, die gewürfelt und verfehlt haben.

Eine Gruppe kann auf ihrem Tab **Direction** ein **default genre** festlegen; ihre neuen Chats starten dann mit diesem Genre. Die Zahlen sind erste Schätzungen: ändere sie in einem Chat, wenn eine Regel zu oft oder zu selten auslöst.

## Der Plan

Ein **Beat** ist etwas, das du geschehen lassen willst: „Die Glocke läutet, und die Klasse strömt in die Halle“, „Mei bringt einen Kuchen“. Öffne **Plan** und tippe auf **Add beat**. Ein Beat hat:

- **What happens**: ein bis zwei Sätze als Regieanweisung.
- **Who takes part** (optional): Mitglieder, die abwesend sind, kommen für ihn in die Szene.
- **When**: **After some replies** (von dem Moment an gezählt, in dem der Beat der nächste wird; 0 heißt sofort), **Scene** (wenn der Director diese Art von Szene liest: eine Lektion, eine Pause, ein Date ...), **Place** (wenn der Ort im Dashboard deine Worte enthält, etwa „roof“; Groß- und Kleinschreibung wird ignoriert) oder **By hand** (nur wenn du **Fire now** drückst).
- **Wait for a new scene**: standardmäßig an. Ein fälliger Beat schneidet nicht mitten in einen Moment hinein: er wartet bis zu 6 Antworten darauf, dass die Geschichte den Ort oder den Zeitpunkt wechselt, und kommt dann ohnehin. Ein Ortsbeat kommt in dem Moment, in dem die Geschichte dort ankommt, und ein Beat „By hand“ nur, wenn du ihn auslöst.

Der Plan läuft **in der Reihenfolge**: nur der erste Beat, der noch nicht erledigt ist, wird betrachtet; die dahinter stehenden sagen „After the beats before it“. Ein Beat ist erledigt, wenn er eingetroffen ist, wenn er aufgegeben wurde (der Director hat ihn zweimal ausgelassen gesehen) oder wenn du ihn **Skip**st. Der nächste Beat zählt seine Antworten ab dem Moment, in dem der vorige endete. Jede Karte zeigt, wo ihr Beat steht: **Waiting** (Antworten übrig), **Due, waiting for a new scene** (Antworten übrig), **Goes with the next reply**, **Delivered** (came, only mentioned oder hineingegangen, ohne dass jemand genannt wurde), **Did not land**, **Skipped**. Wenn etwas einen Beat zurückhält, sagt die Karte warum: Direction ist aus, die Szene ist gesperrt, oder die Szene ist explizit (ein Beat wird dort nie ausgelöst; er kommt, sobald die Szene sie verlässt). **Edit**, **Move up**, **Move down** und **Delete** ändern die Liste; **Fire now** legt den Beat sofort auf die nächste Antwort, egal worauf er wartet.

Ein Beat nutzt dieselbe Technik wie eine Genre-Regel: nach jeder Antwort prüft der Code den Plan vor den Regeln, die Notiz reitet auf der nächsten Antwort (eine Notiz pro Antwort; die Sperre, eine Rückkehr nach der Sperre sowie ein Ereignis oder eine zurückkehrende Person aus World kommen zuerst, und der Beat wird dann bei der nächsten Antwort erneut versucht), und der spätere Bericht des Directors sagt, ob sie **came**, **only mentioned** waren oder er **did not land**. Ein Beat, der nicht landete, wird noch einmal mit einer strengeren Notiz versucht und dann aufgegeben. Eine Antwort, die du wischst, gibt dem neuen Versuch dieselbe Notiz; eine Antwort, die du löschst, nimmt ihren Beat zurück.

## Das Modell auswählen

Es gibt ein Director-Modell für alle Chats und alle Gruppen. Wähle es aus einer beliebigen Leiste oder auf dem Tab **Direction** der Gruppe. Es gibt kein Standardmodell: du wählst. Ein kleines, schnelles Modell reicht aus: es kostet einen kurzen Aufruf nach jeder Antwort.

Ein neuer Gruppen-Chat startet mit eingeschalteter Direction, sobald ein Modell ausgewählt ist. Chats, die du bereits hattest, werden nicht berührt. Jeder Chat hat seinen eigenen Switch.

## Wer abwesend ist

Ein Mitglieder-Chip ändert sich, wenn jemand nicht in der Szene ist: Das Bild ist abgedunkelt und trägt ein kleines Türsymbol. Ein Schloss-Symbol bedeutet, dass das Schloss (unten) sie ausgeschlossen hat. Tippe auf einen Chip: Sein Popover sagt „Here“ oder „Not in the scene“.

Ein abwesendes Mitglied übernimmt nicht von selbst Züge, und seine Karte wird nicht an das Modell gesendet: nur eine Zeile sagt, dass es nicht in der Szene ist. Wenn du es in deiner Nachricht nennst, wird es trotzdem hereingerufen. Wenn der Director es zurückkommen sieht, kehrt seine gesamte Karte zurück.

## Das Schloss und die Rückkehr

Um eine Szene mit einer Person beizubehalten, tippe auf einen Mitglieder-Chip und wähle **Only <name> in the scene**. Ein Chip „Only Yuzu“ erscheint vor dem Scene-Chip, und die anderen bleiben draußen, egal was der Director sagt. Tippe auf das x auf diesem Chip oder auf **Release the lock** im Popover eines Mitglieds, um loszulassen. Bei der nächsten Antwort wird den anderen mitgeteilt, dass sie zurückkommen dürfen, und die Geschichte wird gebeten, ihnen einen Weg hinein zu geben.

## Wenn der Director fehlschlägt

Wenn die Antwort des Directors nicht gelesen werden kann oder der Aufruf fehlschlägt, zeigt der Scene-Chip **No report**; öffne ihn, um den Grund zu sehen. Der Chat verwendet dann die Vorstellung des Dashboards, wer hier ist, oder lässt alle wie zuvor antworten. Nichts in deiner Geschichte geht verloren.

## Neue Gruppen

**New group** öffnet ein breites Fenster (auf einem Telefon Vollbild). Gib der Gruppe einen Namen, oder lasse den Namen leer, um die ersten drei Mitglieder zu verwenden. Suche, schränke mit **All**, **Favourites** und **Recent** ein, nutze Tag-Chips und eine Sortierung (Name, Recently used, Most chats), und tippe auf Porträts, um auszuwählen. Die gewählten Mitglieder stehen oben in einer Reihe in Sprechreihenfolge; die Pfeile verschieben einen früher oder später, das x entfernt ihn. **Next** braucht zwei Zeichen.

Nach **Next** wird die Gruppe erstellt und ihr Editor öffnet sich mit einem Hinweis: Prüfe, wie sie spielt, dann starte den ersten Chat. **Start chat** ist der Hauptbutton. Der Tab **Direction** legt fest, ob neue Chats dieser Gruppe mit eingeschalteter Direction starten, und zeigt das Modell des Directors. Eine Gruppe auf der Gruppen-Seite öffnet denselben Editor, ebenso wie der Name der Gruppe oben in ihrem Chat.

Wenn du einen späteren Chat einer Gruppe startest, hat der kurze Schritt vor dem Chat einen **Direction**-Switch: eingeschaltet, wenn der Standard der Gruppe eingeschaltet ist und ein Modell ausgewählt wurde.

Siehe auch [[characters]] und [[dashboard]].
