<!-- source: 0383923e835d -->
# Das Szenen-Dashboard

Das Dashboard ist ein Panel neben dem Chat, das die Szene verfolgt: wer anwesend ist, wie jeder Charakter zu dir steht, was sie tragen und wissen, die offenen Erzählfäden. Es ist für alle, die möchten, dass die Geschichte Beziehungen und Details zwischen den Antworten behält. Der Hilfeartikel *Scene dashboard* listet seine Felder.

## Was es verfolgt

Öffne es, indem du im Chat ein Porträt anklickst und Dashboard wählst. Das Seitenpanel hat vier Tabs: **Person** (Haltung, Stimmung und Zustand, Kleidung und Dinge: was sie tragen, halten und bei sich haben und was in der Nähe liegt), **Here** (Ort, Wetter, wer anwesend ist), **Quests** (die offenen Fäden: main, side, everyday) und **Notes** (das Notizbuch: was ein Charakter weiß, und ob er es gesehen, gehört oder erraten hat). Die „Constellation“ benennt, wie ein Charakter zu dir steht, zum Beispiel Friendship oder Romance. Eine Zahl auf einem Tab zählt Änderungen seit deiner letzten Antwort (rot, wenn etwas gefallen ist). Die breite Ansicht hat außerdem ein Journal mit einem Gedanken und Erinnerungen des Charakters. Auf einem Telefon öffnet sich derselbe Inhalt als Sheet.

**Eine Person doppelt aufgeführt.** Wenn das Dashboard dieselbe Person unter zwei Namen zeigt (etwa „Sina“ und „Sina Rose“), öffne eine davon und nutze den kleinen Personen-Button im Person-Header, dann „Same person as...“ und wähle die andere. Du wirst zuerst gefragt: Die Notizen, der Verlauf und die Dinge wandern zu der Person, die du gewählt hast, ihre Beziehungswerte bleiben, der Name wird ein weiterer Name von ihr, und es lässt sich nicht rückgängig machen. Das Dashboard schlägt wahrscheinliche Duplikate auch selbst vor: Ein Kasten oben im Person-Tab (und ein Chip „Possible duplicate“ in „Since your last reply“) sagt „X may be the same person as Y“ mit dem Grund. „Merge into Y“ macht dasselbe wie das Menü; „Different people“ hält sie auseinander, und das Dashboard hört auf, dieses Paar vorzuschlagen. Dasselbe Menü hat „Remove from the Dashboard“ für einen Namen, der schlicht falsch ist.

Die Zahlen (trust, comfort, attraction, respect, affection und mehr) werden per Code aus Ereignissen errechnet, die ein Modell meldet, und durch die [[soul]] jedes Charakters geneigt. Der Zustand wird pro Nachricht geführt, sodass ein Swipe oder eine gelöschte Nachricht niemals veraltete Zahlen hinterlässt.

Der Schalter „Story, move“ neben Senden aktiviert einen einmaligen Anstoß für die nächste Antwort; sein Pfeil wählt einen offenen Quest oder eine Wendung.

## Was sich im Chat geändert hat

Unter der neuesten Antwort zeigt eine gedämpfte Zeile, was das Dashboard dazu festgehalten hat: „Changed: Ada · trust fell, mood calm → tense, +2“. Tippe darauf, um dieselben Chips aufzuklappen wie in der Zeile „Since your last reply“ des Dashboards; ein Chip öffnet den passenden Dashboard-Tab (auf einem Telefon dessen Bottom Sheet). Ältere Antworten zeigen nichts, und die Zeile wartet, während eine Antwort geschrieben wird oder das Dashboard noch aktualisiert. Zum Ausblenden schalte „Show what changed under the newest reply“ in Settings > Chat Behavior aus.

## Beziehungen zwischen Charakteren

Der Sensor notiert, wie zwei Charaktere, die nicht du sind, zueinander stehen, als eine Rolle in einem Wort und eine Wärme in einem Wort („rival, cold“). Der Prompt der Antwort trägt bis zu vier davon als eine kurze Zeile, nur für Personen in der Szene. Die eigene Antwort eines Charakters bekommt nur die Beziehungen, an denen dieser Charakter beteiligt ist; ein Erzähler bekommt zuerst die Beziehungen der Personen, um die es im Zug geht.

## Was ein Charakter gesagt hat, und Lügen

Unter dem Notizbuch einer Person hält die Liste **Said** die starken Aussagen fest, an denen sie sich messen lassen muss: ein Schwur, eine Drohung, ein Geständnis, ein Befehl. Eine Lüge wird dort ebenfalls gehalten, verdeckt, bis du „Show hidden“ wählst.

Lügt ein Charakter vor anderen, halten die anderen es für wahr. Ihre nächsten Antworten behandeln es als etwas, das ihnen gesagt wurde, und haben keinen Grund zu zweifeln, bis die Geschichte es anders zeigt. Nur die Personen, die in der Szene waren, werden getäuscht, und nur in ihren eigenen Antworten: Spricht jemand anderes, wiederholt er die Lüge nicht.

Öffne eine Lüge, und du siehst **Believe it:** mit einem Button für jede Person, die ihr noch glaubt. Drücke einen Namen, wenn diese Person es herausgefunden hat. Das Menü der Zeile hat außerdem **This was a lie** für eine Aussage, die der Sensor nicht als Lüge eingestuft hat (die Personen in der Szene glauben sie dann), und **Not a lie**, wenn der Sensor sich geirrt hat. Der Sensor beendet den Glauben von selbst, wenn eine Antwort zeigt, dass die Wahrheit ans Licht kommt. Entfernst du die Lüge aus der Liste, verschwinden alle Glaubensinhalte mit ihr.

> Der Erzähler spricht alle in einer Antwort, also kennt er immer die Wahrheit. Das verhindert nur, dass ein Charakter aufgrund dessen handelt, was ein anderer Charakter weiß.

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
