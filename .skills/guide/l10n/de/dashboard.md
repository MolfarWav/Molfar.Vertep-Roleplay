<!-- source: 36ebfb6daad6 -->
# Das Szenen-Dashboard

Das Dashboard ist ein Panel neben dem Chat, das die Szene verfolgt: wer anwesend ist, wie jeder Charakter zu dir steht, was sie tragen und wissen, die offenen Erzählfäden. Es ist für alle, die möchten, dass die Geschichte Beziehungen und Details zwischen den Antworten behält. Der Hilfeartikel *Scene dashboard* listet seine Felder.

## Was es verfolgt

Öffne es, indem du im Chat ein Porträt anklickst und Dashboard wählst. Das Seitenpanel hat vier Tabs: **Person** (Haltung, Stimmung und Zustand, Kleidung und Dinge), **Here** (Ort, Wetter, wer anwesend ist), **Quests** (die offenen Fäden: main, side, everyday) und **Notes** (das Notizbuch: was ein Charakter weiß, und ob er es gesehen, gehört oder erraten hat). Die „Constellation“ benennt, wie ein Charakter zu dir steht, zum Beispiel Friendship oder Romance. Eine Zahl auf einem Tab zählt Änderungen seit deiner letzten Antwort (rot, wenn etwas gefallen ist). Die breite Ansicht hat außerdem ein Journal mit einem Gedanken und Erinnerungen des Charakters. Auf einem Telefon öffnet sich derselbe Inhalt als Sheet.

**Eine Person doppelt aufgeführt.** Wenn das Dashboard dieselbe Person unter zwei Namen zeigt (etwa „Sina“ und „Sina Rose“), öffne eine davon und nutze den kleinen Personen-Button im Person-Header, dann „Same person as...“ und wähle die andere. Du wirst zuerst gefragt: Die Notizen, der Verlauf und die Dinge wandern zu der Person, die du gewählt hast, ihre Beziehungswerte bleiben, der Name wird ein weiterer Name von ihr, und es lässt sich nicht rückgängig machen. Das Dashboard schlägt wahrscheinliche Duplikate auch selbst vor: Ein Kasten oben im Person-Tab (und ein Chip „Possible duplicate“ in „Since your last reply“) sagt „X may be the same person as Y“ mit dem Grund. „Merge into Y“ macht dasselbe wie das Menü; „Different people“ hält sie auseinander, und das Dashboard hört auf, dieses Paar vorzuschlagen. Dasselbe Menü hat „Remove from the Dashboard“ für einen Namen, der schlicht falsch ist.

Die Zahlen (trust, comfort, attraction, respect, affection und mehr) werden per Code aus Ereignissen errechnet, die ein Modell meldet, und durch die [[soul]] jedes Charakters geneigt. Der Zustand wird pro Nachricht geführt, sodass ein Swipe oder eine gelöschte Nachricht niemals veraltete Zahlen hinterlässt.

Der Schalter „Story, move“ neben Senden aktiviert einen einmaligen Anstoß für die nächste Antwort; sein Pfeil wählt einen offenen Quest oder eine Wendung.

## Wann es aktualisiert

Der Button „Settings“ im Dashboard öffnet seine Einstellungen; der Sensor-Tab hat den Modus:

- **Sensor** (Standard): Nach jeder Antwort liest ein Modell die neuen Nachrichten und meldet, was passiert ist.
- **Fast: inside the story reply**: für starke Modelle. Das Story-Modell schreibt den Bericht selbst am Ende seiner Antwort, ohne separaten Aufruf, und fügt jeder Antwort einige Tokens hinzu. Lässt es den Bericht weg, läuft der übliche Sensor.
- **Manual**: Es aktualisiert nur, wenn du „Refresh“ drückst.

## Was es kostet

Im Sensor-Modus ein zusätzlicher Modellaufruf pro Antwort, auf dem „Sensor model“ (das Chat-Modell, wenn du es leer lässt). Ein günstiges, kleines Modell genügt. Es liest die neuen Nachrichten vollständig (zusammen bis etwa 12000 Zeichen; eine längere Antwort verliert nur die Mitte), und Code markiert zuerst die Sätze, die nach Kleidung, Anziehen oder einem Kuss aussehen, und lenkt das Modell darauf, sodass ein Rock, der einmal mitten in einer langen Antwort genannt wird, trotzdem ins Outfit gelangt. Hat eine Charakterkarte eine „Attire:“-Zeile, wird sie dem Sensor außerdem als Referenz für den genauen Wortlaut eines Kleidungsstücks gezeigt, das der Text erwähnt (er fügt niemals ein Kleidungsstück hinzu, das der Text nicht zeigt). Was ein Charakter trägt und hält, wird als Liste von Gegenständen geführt; ein Kleidungsstück, das reißt oder schmutzig wird, bleibt ein Gegenstand. Jedes Ding behält eine Identität, wohin es auch geht: getragen, an der Tür abgelegt, jemand anderem gereicht. Dinge, die an einem Ort zurückbleiben, bleiben dort: Wenn die Geschichte ins Café zurückkommt, steht die Tasse noch auf dem Tisch. Wenn die Geschichte etwa sechs Züge lang nicht gezeigt hat, was jemand trägt, wird das Schreibmodell gebeten, es kurz zu erwähnen. Um Wörter für eine Sprache hinzuzufügen, die der Scan nicht kennt, liste sie in `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` schaltet den Scan aus. Das Dashboard fügt außerdem einen kurzen „Prompt insert“ zu dem hinzu, was das Story-Modell liest, damit Charaktere wissen, wo sie stehen: Du kannst ihn ausschalten und „Tokens per character“ festlegen. „What the model sees“ in den Einstellungen zeigt den Einschub.

## Wie man es ausschaltet

In den hier genannten Bildschirmen gibt es keinen separaten Aus-Schalter. Setze den Modus auf „Manual“, dann ruft es nie selbst ein Modell auf. Um es vollständig zu entfernen, deaktiviere das Dashboard-Plugin im Plugins-Button von Molfar Vertep; Tools > Plugins in Roleplay listet nur, was läuft. Schalte „Prompt insert“ aus, wenn du möchtest, dass es aus der Anfrage draußen bleibt.

## Verwandtes

[[soul]] füttert es; [[litopys]] nutzt seine Notizen; [[memory]] vergleicht es mit den anderen Arten von Gedächtnis.
