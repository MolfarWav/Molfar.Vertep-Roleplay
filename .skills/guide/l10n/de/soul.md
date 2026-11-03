<!-- source: e0c72ba92f2d -->
# Soul eines Charakters

Eine Soul ist das Temperament eines Charakters dir gegenüber: wie er dich behandelt, wenn die Geschichte beginnt, wie schnell jedes Gefühl wächst und was ihn mehr verletzt oder erfreut. Sie ist die Eingabe der Beziehungszahlen des Dashboards ([[dashboard]]). Du brauchst diese Seite, wenn ein Charakter auf seine eigene Weise reagieren soll oder wenn du dich fragst, warum ein Vorschlag erschien.

## Was eine Soul enthält

Klasse (romantic, ally, neutral oder hostile), Pronomen, Startwerte für trust, comfort, attraction, respect und affection (von -20 bis +20; 0 ist ein Fremder), Merkmale (dominance, confidence, shyness, patience, curiosity), Spektren, die neigen, wie schnell ein Gefühl wächst, Trigger und Werte (Dinge, die härter treffen oder mehr erfreuen), eine Zeile über den Umgang mit Belastung und andere Namen, unter denen der Charakter bekannt ist. Der Hilfeartikel *Soul of a character* erklärt jedes Feld.

Die Soul speichert nicht, was in einer Geschichte passiert. Sie verändert sich während des Spiels nie; das Dashboard hält die sich ändernden Zahlen für jeden Chat. Ein Charakter ohne Soul spielt einfach neutral, mit jedem Multiplikator auf 1 und Startwerten von 0.

## Wo sie bearbeitet wird

Öffne eine Karte, dann den **Soul**-Tab. Jeder Charakter ist ein Chip oben: Eine Karte mit einem Charakter hat einen Chip, eine Erzählerkarte hat einen pro wiederkehrendem Charakter. Wähle einen Chip und bearbeite seine Felder, dann drücke „Save soul“. Gespeicherte Merkmale und Spektren sind fixiert; „Edit“ entsperrt sie, und der Tab warnt, dass eine Änderung die nächsten Züge jedes Chats mit dieser Karte berührt. „Delete soul“ ist im Menü „More actions“. „Add“ oder „Add by hand“ erstellt selbst eine Soul für einen Namen.

Nur Hauptcharaktere bekommen eine Soul. Vorübergehende Personen, die die Geschichte erfindet, bleiben absichtlich ohne.

## Automatische Bewertung und Vorschläge

Standardmäßig schlägt die App eine Soul für eine Karte ohne Soul vor: direkt nach dem Import und bei der ersten Dashboard-Aktualisierung eines Chats. Ein Modell liest die Karte, die Lorebooks und jüngste Nachrichten. Ein Vorschlag wird nicht in die Karte gespeichert. Ein Banner zeigt „Proposal (automatic)“ mit „Review“, „Accept all“ und „Dismiss“; oder „Save soul“ bei einem einzelnen Charakter. Bis du entscheidest, wirkt der Vorschlag im Spiel bereits als vorläufige Soul. „Dismiss“ stoppt die automatische Bewertung für diese Karte. Schlägt eine Bewertung fehl, zeigt das Banner „Retry“ und „Choose another model“. Wartende Vorschläge erscheinen auch in der Inbox.

## Kann ich vom Bildschirm aus erneut bewerten?

Ja, mit demselben Button. Der eine Bewertungsbutton im Soul-Tab ändert seine Beschriftung mit der Auswahl:

- Ohne ausgewählten Charakter oder mit einem, der noch keine gespeicherte Soul hat: „Rate now“. Er bewertet nur die Charaktere, die keine Soul haben; sind keine übrig, sagt er nur, dass es nichts Neues gibt. Einen Charakter ohne Soul zu bewerten geht auch mit „Rate this character“.
- Mit einem Charakter, der bereits eine gespeicherte Soul hat: „Rate again“. Er bittet ein Modell um eine frische Soul für diesen einen Charakter und zeigt sie als zu prüfendes Update neben der gespeicherten. Hast du ungespeicherte Änderungen, fragt er zuerst „Rate again?“, weil sie ersetzt würden. Entspricht die neue Bewertung der gespeicherten Soul, wird dir gesagt, dass es nichts zu ändern gibt.

Nichts wird überschrieben, bis du „Save soul“ drückst. Das verwendete Modell ist das „Sensor model“ des Dashboards (das Chat-Modell, wenn leer); der Schalter „Rate characters automatically“ in den Dashboard-Einstellungen steuert nur die automatische Erstbewertung, nicht diesen Button.

Du kannst Molfar auch in seinem eigenen Chat bitten, eine Soul zu bewerten oder anzupassen; es schreibt dieselbe Art von Vorschlag ([[vertep:molfar]]).
