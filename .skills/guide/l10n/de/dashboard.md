<!-- source: 3c2de24f3ae0 -->
# Das Szenen-Dashboard

Das Dashboard ist ein Panel neben dem Chat, das die Szene verfolgt: wer anwesend ist, wie jede Figur zu dir steht, was sie trägt und weiß, welche Handlungsfäden offen sind. Es ist für alle, die möchten, dass die Geschichte Beziehungen und Details zwischen den Antworten behält. Der Hilfe-Artikel *Scene dashboard* listet seine Felder auf.

## Was es verfolgt

Öffne es, indem du im Chat auf ein Porträt klickst und Dashboard wählst. Das Seitenpanel hat vier Tabs: **Person** (Haltung, Stimmung und Zustand, Outfit und Dinge: was getragen, gehalten und mitgeführt wird und was in der Nähe liegt), **Here** (Ort, Wetter, wer anwesend ist), **Quests** (die offenen Fäden: main, side, everyday) und **Notes** (das Notizbuch: was eine Figur weiß und ob sie es gesehen, gehört oder vermutet hat). Die "Constellation" benennt, wie eine Figur zu dir steht, zum Beispiel Friendship oder Romance. Eine Zahl auf einem Tab zählt die Änderungen seit deiner letzten Antwort (rot, wenn etwas gefallen ist). Die breite Ansicht hat außerdem ein Journal mit den Gedanken und Erinnerungen einer Figur. Auf dem Handy öffnet sich derselbe Inhalt als Sheet.

**Eine Person doppelt aufgeführt.** Wenn das Dashboard dieselbe Person unter zwei Namen zeigt (etwa "Sina" und "Sina Rose"), öffne einen davon und nutze den kleinen Personen-Button in der Kopfzeile von Person, dann "Same person as..." und wähle die andere. Du wirst vorher gefragt: Die Notizen, die Historie und die Dinge wandern zu der Person, die du gewählt hast, ihre Beziehungswerte bleiben, der Name wird ein weiterer Name von ihr, und es lässt sich nicht rückgängig machen. Das Dashboard schlägt wahrscheinliche Duplikate auch selbst vor: Eine Box oben im Tab Person (und ein Chip "Possible duplicate" in "Since your last reply") sagt "X may be the same person as Y" mit dem Grund. "Merge into Y" tut dasselbe wie das Menü; "Different people" hält sie auseinander, und das Dashboard schlägt dieses Paar nicht mehr vor. Dasselbe Menü hat "Not in the scene" für jemanden, den die Geschichte nur erwähnt, den ein Modell aber in die Szene gesetzt hat: Die Person verlässt die Liste "anwesend", bleibt mit ihren Notizen bekannt, und das Dashboard setzt sie nicht zurück, solange sie nicht spricht (der Toast hat "Undo", und das Menü bietet danach "Put back in the scene" an). "Remove from the Dashboard" ist für einen Namen, der schlicht falsch ist: Es nimmt die Person aus jedem gespeicherten Zustand heraus.

Eine Figur, die von woanders aus in Kontakt ist (eine Nachricht, ein Brief, ein Anruf, ein Video), wird in der Szenenzeile so markiert, mit einem kurzen Satz dazu, was sie erreicht: per Nachricht oder Brief nur die gesendeten Worte; per Anruf nur die Stimme und die Geräusche nahe dem Telefon; per Video nur, was in der Kamera ist und was in der Nähe zu hören ist. Eine stille Handlung, etwa den Kessel aufsetzen, ist ihr nicht bekannt.

Die Zahlen (trust, comfort, attraction, respect, affection und mehr) werden von Code aus Ereignissen berechnet, die ein Modell meldet, und von der [[soul]] jeder Figur geprägt. Der Zustand wird pro Nachricht gehalten, sodass ein Swipe oder eine gelöschte Nachricht nie veraltete Zahlen hinterlässt.

Wessen Gefühl es ist: Jede Zahl zeigt, wie sich diese Figur über *deine* Figur fühlt, nie umgekehrt. Die Ereignisse dahinter sind das, was deine Figur tut: ein Kuss auf die Stirn oder eine Umarmung wärmt Comfort und Affection, nur ein romantischer Kuss hebt Arousal. Wenn eine Figur deiner Figur Unrecht tut (betrügt, lügt, geht), ist das die Tat der Figur: Sie wird nicht deiner Figur zugeschrieben, und der Sensor wird angewiesen, dafür nicht das Vertrauen der Figur in dich zu senken. Bewegt sich eine Zahl trotzdem falsch, melde es als Issue: Das Sensor-Modell ist ein Modell, und ein kleines kann eine Szene falsch lesen.

Der Button "Story, move" neben Send armiert einen einmaligen Anstoß für die nächste Antwort; sein Pfeil wählt eine offene Quest oder eine Wendung.

## Was sich geändert hat, im Chat

Unter der neuesten Antwort sagt eine gedämpfte Zeile, was das Dashboard dafür festgehalten hat: "Changed: Ada · trust fell, mood calm → tense, +2". Tippe darauf, um dieselben Chips wie in der Zeile "Since your last reply" des Dashboards aufzuklappen; ein Chip öffnet den passenden Dashboard-Tab (auf dem Handy dessen Bottom Sheet). Ältere Antworten zeigen nichts, und die Zeile wartet, während eine Antwort geschrieben wird oder das Dashboard noch aktualisiert. Um sie auszublenden, schalte "Show what changed under the newest reply" in Settings > Chat Behavior aus.

## Verbindungen zwischen Figuren

Der Sensor vermerkt, wie zwei Figuren, die nicht du sind, zueinander stehen, als Ein-Wort-Rolle und Ein-Wort-Wärme ("rival, cold"). Der Prompt der Antwort trägt bis zu vier davon als eine kurze Zeile, nur für Personen in der Szene. Eine Figur bekommt in ihrer eigenen Antwort nur die Verbindungen, an denen sie beteiligt ist; ein Erzähler bekommt zuerst die Verbindungen der Personen, um die es in diesem Zug geht.

## Was eine Figur gesagt hat, und Lügen

Unter dem Notizbuch einer Person hält die Liste **Said** die starken Dinge fest, die sie gesagt hat und an die sie sich halten lassen muss: ein Gelübde, eine Drohung, ein Geständnis, ein Befehl. Eine Lüge wird dort ebenfalls festgehalten, verdeckt, bis du "Show hidden" wählst.

Wenn eine Figur vor anderen lügt, nehmen die anderen sie als wahr. Ihre nächsten Antworten behandeln sie als etwas, das ihnen gesagt wurde und woran sie keinen Grund zu zweifeln haben, bis die Geschichte das Gegenteil zeigt. Nur die Personen, die in der Szene waren, werden getäuscht, und nur in ihren eigenen Antworten: Wenn jemand anderes spricht, wird die Lüge nicht wiederholt.

Öffne eine Lüge, und du siehst **Believe it:** mit einem Button für jede Person, die sie noch glaubt. Drücke einen Namen, wenn diese Person es herausgefunden hat. Das Menü der Zeile hat außerdem **This was a lie** für eine Aussage, die der Sensor nicht als Lüge eingestuft hat (die Personen in der Szene glauben sie dann), und **Not a lie**, wenn der Sensor sich geirrt hat. Der Sensor beendet den Glauben von selbst, wenn eine Antwort zeigt, dass die Wahrheit herauskommt. Entfernst du die Lüge aus der Liste, verschwindet jeder Glaube mit ihr.

> Der Erzähler spricht alle in einer Antwort, also kennt er immer die Wahrheit. Dies hier hält nur eine Figur davon ab, nach dem zu handeln, was eine andere Figur weiß.

## Wann es aktualisiert wird

Der Button "Settings" im Dashboard öffnet seine Einstellungen; der Tab Sensor hat den Modus:

- **Sensor** (Standard): Nach jeder Antwort liest ein Modell die neuen Nachrichten und meldet, was passiert ist.
- **Fast: inside the story reply**: für starke Modelle. Das Story-Modell schreibt den Bericht selbst am Ende seiner Antwort, ohne separaten Aufruf, was jeder Antwort einige Tokens hinzufügt. Lässt es den Bericht weg, läuft der übliche Sensor.
- **Manual**: Es aktualisiert nur, wenn du "Refresh" drückst.

## Was es kostet

Im Modus Sensor ein zusätzlicher Modellaufruf pro Antwort, auf dem "Sensor model" (das Modell des Chats, wenn du es leer lässt). Ein günstiges, kleines Modell reicht. Es liest die neuen Nachrichten vollständig (zusammen bis etwa 12000 Zeichen; bei einer längeren Antwort geht nur die Mitte verloren), und Code markiert zuerst die Sätze, die nach Kleidung, Anziehen oder einem Kuss aussehen, und weist das Modell darauf hin, sodass ein einmal in der Mitte einer langen Antwort erwähnter Rock trotzdem im Outfit landet. Hat eine Figurenkarte eine Zeile "Attire:", wird sie dem Sensor auch als Referenz für die genaue Wortwahl eines Kleidungsstücks gezeigt, das der Text erwähnt (es fügt nie ein Kleidungsstück hinzu, das der Text nicht zeigt). Was eine Figur trägt und hält, wird als Liste von Gegenständen geführt; ein Kleidungsstück, das zerrissen oder schmutzig wird, bleibt ein Gegenstand. Jedes Ding behält eine Identität, wohin es auch geht: getragen, an der Tür ausgezogen, jemand anderem gereicht. Dinge, die an einem Ort bleiben, bleiben dort: Wenn die Geschichte zum Café zurückkehrt, steht die Tasse noch auf dem Tisch. Wenn die Geschichte etwa sechs Züge lang nicht gezeigt hat, was jemand trägt, wird das Schreibmodell gebeten, es kurz zu erwähnen. Um Wörter für eine Sprache hinzuzufügen, die der Scan nicht kennt, liste sie in `data/dashboard/lexicon.json` auf (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` schaltet den Scan aus. Das Dashboard fügt außerdem einen kurzen "Prompt insert" zu dem hinzu, was das Story-Modell liest, damit Figuren wissen, wo sie stehen: Du kannst ihn ausschalten und "Tokens per character" festlegen. "What the model sees" in den Einstellungen zeigt den Insert.

## Wie man es ausschaltet

In den hier aufgeführten Bildschirmen gibt es keinen eigenen Ausschalter. Stelle den Modus auf "Manual", und es ruft nie von selbst ein Modell auf. Um es ganz zu entfernen, deaktiviere das Dashboard-Plugin im Plugins-Button von Molfar Vertep; Tools > Plugins in Roleplay listet nur auf, was läuft. Schalte "Prompt insert" aus, wenn es aus der Anfrage herausbleiben soll.

## Verwandtes

[[soul]] speist es; [[litopys]] nutzt seine Notizen; [[memory]] vergleicht es mit den anderen Arten von Gedächtnis.
