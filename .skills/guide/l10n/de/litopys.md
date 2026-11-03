<!-- source: 9004c118e307 -->
# Litopys: die Aufzeichnung der Geschichte

Litopys (die Chronik) ist das lange Gedächtnis eines Chats. Sie liest die Geschichte im Hintergrund und schreibt für jede abgeschlossene Szene ein Kapitel, plus die Fakten, die die Geschichte etabliert hat. Wenn ein Chat zu lang für das Modellfenster wird, trägt die Aufzeichnung die Geschichte weiter. Nutze sie für lange Geschichten; du musst sie nicht starten.

## Kapitel und Fakten

- Ein **Kapitel** sagt, was sich in einer Szene verändert hat, keine Nacherzählung. Es wird geschrieben, sobald die nächste Szene beginnt, daher hat die letzte Szene vielleicht noch keins. Ein neuer Ort oder ein Zeitsprung schließt eine Szene; du kannst auch selbst eine Folge von Nachrichten als Szene markieren, im „More“-Menü einer Nachricht unter Story.
- Ein **Fakt** ist ein kurzer Satz, der wahr bleibt: „Medli verbirgt ihre Flügel auf dem Markt.“ Fakten haben einen Typ, ein Gewicht (Everyday, Important, Key) und Wissende. Du kannst Fakten von Hand hinzufügen, bearbeiten, anheften oder zurückziehen.
- **Proposals** sind Litopys' Vorschläge: zwei Fakten zusammenführen, einen zurückziehen, umformulieren, anheften. Du nimmst jeden an oder lehnst ihn ab.
- **Habits**, die ein Charakter deutlich zeigt, können ebenfalls erscheinen und werden nach Wiederholung in mehreren Szenen zu einer Gewohnheit.

## Wo man nachsieht

Drücke **Record** in der Chat-Kopfzeile (auf einem Telefon im Menü) für die Aufzeichnung dieses Chats in einem Seitenpanel. Der Bereich **Library** in der Rail zeigt die Aufzeichnung jedes Chats. Er hat zwei Ansichten: Overview (eine Zeitleiste, eine Karte pro Charakter, wartende Vorschläge) und Details mit den Tabs Chapters, Facts, Proposals, Habits und Activity. Der Activity-Tab protokolliert, was Litopys getan hat, mit Undo, wo möglich. Das Zahnrad („Litopys settings“) legt fest, wie die Aufzeichnung geschrieben wird.

## Was in den Prompt kommt

Standardmäßig wird die Aufzeichnung automatisch eingefügt. „Memory size“ sagt, wie viele Tokens sie einnehmen darf: Standard Compact (800 Tokens), Auto (15 % des Modellfensters, mindestens 800) oder Custom von 200 bis 16000. Wenn alles passt, wird alles gesendet; sonst die Teile, die für die Szene am wichtigsten sind. Ein kleines Modell will eine kleine Größe. „Chapters and facts“ aus bedeutet keine neuen Kapitel und Fakten und nichts wird in den Prompt eingefügt.

Ältere Nachrichten können den Prompt nur verlassen, wenn das Fenster voll ist, oder Szene für Szene, sobald ein Kapitel sie abdeckt; die Einstellung „Older messages leave the prompt“ wählt das.

## Vorschläge und Aufräumen

„Suggestions“ steht standardmäßig auf „Ask me first“: Jedes Anheften und Umschreiben wartet auf dein Ja. Die stille Option wendet Anheften und Umschreiben sofort an und protokolliert sie in Activity. Zurückziehen und Zusammenführen warten immer auf dich. „Tidy facts automatically“ sucht nach 30 neuen Fakten nach Duplikaten und Widersprüchen, mit einem zusätzlichen Modellaufruf pro 60 Fakten.

## Neuaufbau

„Rebuild from scratch“ schreibt die Kapitel und Fakten aus den Nachrichten im Hintergrund neu, etwa ein Modellaufruf alle 30 Sekunden. Deine eigenen, bearbeiteten und angehefteten Fakten und bearbeiteten Kapitel bleiben, und die aktuelle Aufzeichnung wird verwendet, bis die neue fertig ist. Es verweigert den Start, wenn keine Szene abgeschlossen wurde.

Bearbeitest du Nachrichten, nachdem ein Kapitel geschrieben wurde, wird dieses Kapitel als veraltet markiert und neu geschrieben.

## Verwandtes

Die Karte eines Charakters kann auch Erinnerungen an abgeschlossene Chats behalten: siehe [[memory]]. Die Hilfeartikel *Litopys: chapters and proposals*, *Facts and proposals* und *Overview vs Details* decken die Bildschirme ab.
