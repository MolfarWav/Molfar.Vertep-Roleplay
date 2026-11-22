<!-- source: 3b04df871946 -->
# Direction: wer in der Szene ist

Direction ist für Gruppen-Chats. Nach jeder Antwort liest ein kleines, günstiges „Director“-Modell die Szene und sagt, um welche Art von Szene es sich handelt (eine Lektion, eine Pause, ein Alleinmoment, ein Date) und welche Mitglieder darin sind. Mitglieder, die nicht da sind, antworten nicht mehr und werden aus dem Prompt ausgeschlossen, bis die Geschichte sie zurückbringt.

## Die Leiste

In einem Gruppen-Chat gibt es eine dünne Leiste unter der Mitgliederleiste, die mit „Direction“ beschriftet ist (auf einem Telefon nur das Symbol). Von links nach rechts:

- **Der Scene-Chip**: die Art der Szene und wer hier ist („Alone moment, with Yuzu“ oder „Lesson, 4 here“). Tippe darauf, um zu sehen, wer hier ist und wer nicht in der Szene ist, wann der letzte Bericht erstellt wurde, und einen **Report now**-Button, der den Director erneut befragt. Während der Director liest, zeigt der Chip „Reading the scene…“.
- **Der Model-Chip**: das Modell des Directors. Wenn keins ausgewählt ist, wird **Pick a model** angezeigt. Tippe darauf, um dieselbe Modellliste wie in der oberen Leiste des Chats zu sehen: markierte Modelle, dann jedes Modell nach Verbindung, mit einem Suchfeld.
- **Der Switch**: Direction ein- oder ausgeschaltet für diesen Chat. Bis ein Modell ausgewählt ist, ist er ausgegraut und zeigt „Pick a model first“.
- **Log**: die letzten Berichte (die Art der Szene, wer hier war, wie lange es dauerte, wie viele Tokens) und jeder Switch, Lock, Release und Fehler, neueste zuerst.

Wenn der Switch ausgeschaltet ist, klappt die Leiste zu „Direction: off“ zusammen und der Chat funktioniert wie zuvor.

## Das Modell auswählen

Es gibt ein Director-Modell für alle Chats und alle Gruppen. Wähle es aus einer beliebigen Leiste oder auf dem **Direction**-Tab der Gruppe. Es gibt kein Standardmodell: du wählst. Ein kleines, schnelles Modell reicht aus: es kostet einen kurzen Aufruf nach jeder Antwort.

Ein neuer Gruppen-Chat startet mit eingeschalteter Direction, sobald ein Modell ausgewählt ist. Chats, die du bereits hattest, werden nicht berührt. Jeder Chat hat seinen eigenen Switch.

## Wer abwesend ist

Ein Mitglieder-Chip ändert sich, wenn jemand nicht in der Szene ist: Das Bild ist abgedunkelt und trägt ein kleines Türsymbol. Ein Schloss-Symbol bedeutet, dass das Schloss (unten) sie ausgeschlossen hat. Tippe auf einen Chip: Sein Popover sagt „Here“ oder „Not in the scene“.

Ein abwesendes Mitglied macht nicht von selbst Züge, und seine Karte wird nicht an das Modell gesendet: nur eine Zeile sagt, dass es nicht in der Szene ist. Wenn du es in deiner Nachricht nennst, wird es trotzdem hereingerufen. Wenn der Director es zurückkommen sieht, kehrt seine gesamte Karte zurück.

## Das Schloss und die Rückkehr

Um eine Szene mit einer Person beizubehalten, tippe auf einen Mitglieder-Chip und wähle **Only <name> in the scene**. Ein Chip „Only Yuzu“ erscheint vor dem Scene-Chip, und die anderen bleiben draußen, egal was der Director sagt. Tippe auf das x auf diesem Chip oder auf **Release the lock** im Popover eines Mitglieds, um loszulassen. Bei der nächsten Antwort wird den anderen mitgeteilt, dass sie zurückkommen dürfen, und die Geschichte wird gebeten, ihnen einen Weg hinein zu geben.

## Wenn der Director fehlschlägt

Wenn die Antwort des Directors nicht gelesen werden kann oder der Aufruf fehlschlägt, zeigt der Scene-Chip **No report**; öffne ihn, um den Grund zu sehen. Der Chat verwendet dann die Vorstellung des Dashboards, wer hier ist, oder lässt alle wie zuvor antworten. Nichts in deiner Geschichte geht verloren.

## Neue Gruppen

**New group** öffnet ein breites Fenster (auf einem Telefon Vollbild). Gib der Gruppe einen Namen oder lasse den Namen leer, um die ersten drei Mitglieder zu verwenden. Suche, schränke mit **All**, **Favourites** und **Recent** ein, Tag-Chips und eine Sortierung (Name, Recently used, Most chats), und tippe auf Porträts, um auszuwählen. Die ausgewählten Mitglieder sitzen in einer Reihe oben in Sprechreihenfolge; die Pfeile verschieben einen früher oder später, das x entfernt. **Next** benötigt zwei Charaktere.

Nach **Next** wird die Gruppe erstellt und ihr Editor öffnet sich mit einem Hinweis: Überprüfe, wie sie spielt, dann starte den ersten Chat. **Start chat** ist der Hauptbutton. Der **Direction**-Tab legt fest, ob neue Chats dieser Gruppe mit eingeschalteter Direction starten, und zeigt das Modell des Directors. Eine Gruppe auf der Gruppen-Seite öffnet denselben Editor, ebenso wie der Name der Gruppe oben in ihrem Chat.

Wenn du einen späteren Chat einer Gruppe startest, hat der kurze Schritt vor dem Chat einen **Direction**-Switch: eingeschaltet, wenn der Standard der Gruppe eingeschaltet ist und ein Modell ausgewählt wurde.

Siehe auch [[characters]] und [[dashboard]].