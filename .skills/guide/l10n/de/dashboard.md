<!-- source: 6095bc511c69 -->
# Das Szenen-Dashboard

Das Dashboard ist ein Panel neben dem Chat, das die Szene verfolgt: wer anwesend ist, wie jeder Charakter zu dir steht, was sie tragen und wissen, die offenen Erzählfäden. Es ist für alle, die möchten, dass die Geschichte Beziehungen und Details zwischen den Antworten behält. Der Hilfeartikel *Scene dashboard* listet seine Felder.

## Was es verfolgt

Öffne es, indem du im Chat ein Porträt anklickst und Dashboard wählst. Das Seitenpanel hat vier Tabs: **Person** (Haltung, Stimmung und Zustand, Kleidung und Dinge), **Here** (Ort, Wetter, wer anwesend ist), **Quests** (die offenen Fäden: main, side, everyday) und **Notes** (das Notizbuch: was ein Charakter weiß, und ob er es gesehen, gehört oder erraten hat). Die „Constellation“ benennt, wie ein Charakter zu dir steht, zum Beispiel Friendship oder Romance. Eine Zahl auf einem Tab zählt Änderungen seit deiner letzten Antwort (rot, wenn etwas gefallen ist). Die breite Ansicht hat außerdem ein Journal mit einem Gedanken und Erinnerungen des Charakters. Auf einem Telefon öffnet sich derselbe Inhalt als Sheet.

Die Zahlen (trust, comfort, attraction, respect, affection und mehr) werden per Code aus Ereignissen errechnet, die ein Modell meldet, und durch die [[soul]] jedes Charakters geneigt. Der Zustand wird pro Nachricht geführt, sodass ein Swipe oder eine gelöschte Nachricht niemals veraltete Zahlen hinterlässt.

Der Schalter „Story, move“ neben Senden aktiviert einen einmaligen Anstoß für die nächste Antwort; sein Pfeil wählt einen offenen Quest oder eine Wendung.

## Wann es aktualisiert

Der Button „Settings“ im Dashboard öffnet seine Einstellungen; der Sensor-Tab hat den Modus:

- **Sensor** (Standard): Nach jeder Antwort liest ein Modell die neuen Nachrichten und meldet, was passiert ist.
- **Fast: inside the story reply**: für starke Modelle. Das Story-Modell schreibt den Bericht selbst am Ende seiner Antwort, ohne separaten Aufruf, und fügt jeder Antwort einige Tokens hinzu. Lässt es den Bericht weg, läuft der übliche Sensor.
- **Manual**: Es aktualisiert nur, wenn du „Refresh“ drückst.

## Was es kostet

Im Sensor-Modus ein zusätzlicher Modellaufruf pro Antwort, auf dem „Sensor model“ (das Chat-Modell, wenn du es leer lässt). Ein günstiges, kleines Modell genügt. Das Dashboard fügt außerdem einen kurzen „Prompt insert“ zu dem hinzu, was das Story-Modell liest, damit Charaktere wissen, wo sie stehen: Du kannst ihn ausschalten und „Tokens per character“ festlegen. „What the model sees“ in den Einstellungen zeigt den Einschub.

## Wie man es ausschaltet

In den hier genannten Bildschirmen gibt es keinen separaten Aus-Schalter. Setze den Modus auf „Manual“, dann ruft es nie selbst ein Modell auf. Um es vollständig zu entfernen, deaktiviere das Dashboard-Plugin im Plugins-Button von Molfar Vertep; Tools > Plugins in Roleplay listet nur, was läuft. Schalte „Prompt insert“ aus, wenn du möchtest, dass es aus der Anfrage draußen bleibt.

## Verwandtes

[[soul]] füttert es; [[litopys]] nutzt seine Notizen; [[memory]] vergleicht es mit den anderen Arten von Gedächtnis.
