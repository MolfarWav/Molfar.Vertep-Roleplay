<!-- source: c68da6730f1a -->
# Litopys: die Aufzeichnung der Geschichte

Litopys (die Chronik) ist das lange Gedächtnis eines Chats. Sie liest die Geschichte im Hintergrund und schreibt für jede abgeschlossene Szene ein Kapitel, dazu die Fakten, die die Geschichte festgelegt hat. Wenn ein Chat für das Fenster des Modells zu lang wird, trägt die Aufzeichnung die Geschichte weiter. Nutze sie für lange Geschichten; du musst sie nicht starten.

## Kapitel und Fakten

- Ein **Kapitel** sagt, was sich in einer Szene verändert hat, keine Nacherzählung. Es wird geschrieben, sobald die nächste Szene beginnt, daher hat die letzte Szene vielleicht noch keins. Ein neuer Ort oder ein Zeitsprung schließt eine Szene; du kannst außerdem eine Folge von Nachrichten selbst als Szene markieren, über das „More“-Menü einer Nachricht unter Story.
- Ein **Fakt** ist ein kurzer Satz, der wahr bleibt: „Medli verbirgt ihre Flügel auf dem Markt.“ Fakten haben einen Typ, ein Gewicht (Everyday, Important, Key) und einen Kreis von Wissenden: wer sie kennt. Du kannst Fakten von Hand hinzufügen, bearbeiten, anheften oder zurückziehen.
- **Proposals** sind Litopys' Vorschläge: zwei Fakten zusammenführen, einen zurückziehen, umformulieren, anheften. Du nimmst jeden an oder lehnst ihn ab.
- **Habits**, die ein Charakter deutlich zeigt, können ebenfalls erscheinen und werden zu einer Gewohnheit, wenn sie sich in mehreren Szenen wiederholen.

## Wo man nachsieht

Drücke **Record** in der Chat-Kopfzeile (auf einem Telefon im Menü) für die Aufzeichnung dieses Chats in einem Seitenpanel. Der Bereich **Library** in der Rail zeigt die Aufzeichnung jedes Chats. Er hat zwei Ansichten: Overview (eine Zeitleiste, eine Karte pro Charakter, wartende Vorschläge) und Details mit den Tabs Chapters, Facts, Proposals, Habits und Activity. Der Tab Activity protokolliert, was Litopys getan hat, mit Undo, wo möglich. Das Zahnrad („Litopys settings“) legt fest, wie die Aufzeichnung geschrieben wird.

## Was in den Prompt kommt

Standardmäßig wird die Aufzeichnung automatisch eingefügt. „Memory size“ legt fest, wie viele Tokens sie einnehmen darf: Auto (standardmäßig 15 % des Modellfensters, mindestens 800 und höchstens 16000), Compact (800 Tokens) oder Custom von 200 bis 16000. Auto lässt ein großes Fenster mehr von der Geschichte tragen; bei einem kleinen Modell bleibt es nahe bei 800. Eine Größe, die du früher selbst gespeichert hast, bleibt, wie sie war. Passt alles hinein, wird alles gesendet; sonst die Teile, die für die Szene am wichtigsten sind. Ein kleines Modell braucht eine kleine Größe. „Chapters and facts“ aus bedeutet: keine neuen Kapitel und Fakten, und nichts wird in den Prompt eingefügt.

Ältere Nachrichten können den Prompt nur verlassen, wenn das Fenster voll ist, oder Szene für Szene, sobald ein Kapitel sie abdeckt; die Einstellung „Older messages leave the prompt“ bestimmt das.

## Abgleich nach Bedeutung

Memory findet Fakten und Kapitel über Wörter. Mit einem Embeddings-Modell findet sie sie auch über die Bedeutung: eine Frage mit anderen Worten erreicht trotzdem den Fakt. Die Karte **Matching by meaning** (oben in der Aufzeichnung eines Chats und in Canvas > Prompt > Memory) zeigt, wo es steht: off, failing, no vectors yet, partly done, done oder made by another model. Richte das Modell einmal ein unter Settings > Memory: standardmäßig nutzt die App zuerst ein Modell auf deinem eigenen Computer (LM Studio oder Ollama), dann eine API-Verbindung mit Schlüssel, dann OpenRouter. Sobald ein Aufruf des Embeddings-Modells funktioniert hat (ein Druck auf den Button der Karte oder eine Antwort), füllt die Engine die fehlenden Vektoren jedes Chats und jeder Data-Bank-Datei von selbst nach; sie schaut dafür etwa alle paar Minuten nach. Alles über 300.000 Tokens wartet auf den Button, und ein Schalter **Make vectors by itself** in Settings > Memory schaltet das ab. Der Button **Embed N items** sagt zuerst, wie viele Einträge es sind und ungefähr wie viele Tokens das kostet, und erledigt es sofort. Neue Szenen betten ihre neuen Einträge in jedem Fall ein. Wenn du das Embeddings-Modell wechselst, werden die alten Vektoren nicht verwendet, bis du **Embed again** drückst. Die Data Bank hat eine eigene Karte, **Data Bank by meaning**, oben in Settings > Data Bank: sie funktioniert genauso für die Passagen deiner Dateien und Snapshot-Bücher, und eine Datei, die nur teilweise abgedeckt ist, zeigt „7 of 12 by meaning“.

## Vorschläge und Aufräumen

„Suggestions“ steht standardmäßig auf „Ask me first“: jedes Anheften und Umschreiben wartet auf dein Ja. Die stille Option wendet Anheften und Umschreiben sofort an und protokolliert sie in Activity. Zurückziehen und Zusammenführen warten immer auf dich. „Tidy facts automatically“ sucht nach 30 neuen Fakten nach Duplikaten und Widersprüchen, mit einem zusätzlichen Modellaufruf pro 60 Fakten.

## Neuaufbau

„Rebuild from scratch“ schreibt die Kapitel und Fakten aus den Nachrichten im Hintergrund neu, etwa ein Modellaufruf alle 30 Sekunden. Deine eigenen, bearbeiteten und angehefteten Fakten sowie bearbeitete Kapitel bleiben, und bis die neue Aufzeichnung fertig ist, wird die aktuelle verwendet. Der Start wird verweigert, wenn noch keine Szene abgeschlossen ist.

Bearbeitest du Nachrichten, nachdem ein Kapitel geschrieben wurde, wird dieses Kapitel als veraltet markiert und neu geschrieben.

## Verwandtes

Auch die Karte eines Charakters kann eine Erinnerung an abgeschlossene Chats behalten: siehe [[memory]]. Die Hilfeartikel *Litopys: chapters and proposals*, *Facts and proposals* und *Overview vs Details* beschreiben die Bildschirme.
