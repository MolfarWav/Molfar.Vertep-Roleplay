<!-- source: 67addd68fb05 -->
# Lange Chats und Token-Kosten

Ein Chat, der über Wochen läuft, wächst, und jede Antwort schickt mehr davon an das Modell. Diese Seite ist für alle, deren Antworten langsam oder teuer werden, oder deren Modell den Anfang der Geschichte vergisst.

## Die Schaltfläche "Request size"

Standardmäßig wird der ganze Chat gesendet, solange das Fenster Platz hat. Bei einem großen Fenster wachsen die Kosten immer weiter, deshalb hat der Chat-Kopf neben den Story-Werkzeugen eine Schaltfläche **Request size** (auf dem Handy: im Menü). Sie zeigt, wie viele Tokens die letzte Anfrage gesendet hat, den ganzen Prompt so, wie der Anbieter ihn gezählt hat, und welches Modell ihn bekommen hat. Tippe darauf für das Modell, sein Fenster und dein Limit. Sie ist türkis unter drei Vierteln des Limits, ab dort bernsteinfarben und rot mit einem Warnzeichen darüber. Das Canvas Prompt-Board listet jeden Teil einer Anfrage auf ([[canvas]]).

Wenn eine Antwort die Anfrage über das Limit treibt, öffnet sich ein Popup:

- **Yes, continue in a new chat** erstellt sofort den nächsten Chat und öffnet ihn.
- **Not now** blendet das Popup für diesen Chat aus, bis die Anfrage um die Hälfte gewachsen ist. Es zu schließen zählt als Not now.
- **Send finished scenes as chapters instead** erscheint, wenn Litopys an ist (nächster Abschnitt).

Das Limit steht unten im Popup und in der Library, Zahnrad "Litopys settings", Block "In the prompt", "Warn me when a request gets big": 60 % des Modellfensters (Standard), eine Größe, die du eintippst (100k) oder auswählst (16k bis 500k), oder nie. Ein Chat, der das Limit schon überschritten hat, zeigt die rote Schaltfläche und kein Popup, bis eine neue Antwort ihn wachsen lässt.

Der Datensatz hat seine eigene Größe. Im selben Block ist "Memory size" standardmäßig Auto: 15 % des Modellfensters, zwischen 800 und 16000 Tokens. "Compact" hält ihn bei 800.

## Die Schalter, die Kosten senken

Im selben Block hat "Older messages leave the prompt" zwei Möglichkeiten:

- **Only when the window is full** (Standard): jede Nachricht wird gesendet, solange sie hineinpasst.
- **By scenes**: Sobald ein Kapitel eine Szene enthält, wird die Szene durch das Kapitel ersetzt. Nur die letzten Nachrichten bleiben wortwörtlich ("Direct messages after the scenes", 2 oder mehr). Die neueste Szene hat noch kein Kapitel, also wird sie vollständig gesendet.

"By scenes" kostet etwas Detail: Ein Kapitel ist eine Nacherzählung, deshalb kann ein schwaches Modell eine Kleinigkeit verlieren. Pinne eine Tatsache fest, die nie verloren gehen darf ([[litopys]]). Weitere Einsparungen:

- Library, Litopys settings, **Direct messages, by size**: Behalte die neuesten Nachrichten, die in eine Anzahl von Tokens passen (mindestens 2 Nachrichten), statt einer festen Anzahl. 0 zählt Nachrichten ([[litopys]]).
- Library, Litopys settings, **Leave out what a speaker was not present for** (standardmäßig "Groups only"): Eine Antwort, die von einer Figur gesprochen wird, bekommt nicht die neuesten Nachrichten aus Szenen, in denen diese Figur nicht war ([[litopys]]).
- Canvas Prompt-Board, Verlaufskarte, Details: Sende nur die letzten N Nachrichten (Desktop, nur dieser Chat).
- Setze "Memory size" auf Compact herunter oder schalte "Chapters and facts" aus.

## Starte einen frischen Chat und behalte die Geschichte

An einem natürlichen Bruch startet ein neuer Chat, der den alten fortsetzt, mit einem kleinen Prompt und weiß trotzdem, was passiert ist.

1. Öffne im Chat "More" und wähle **Continue in a new chat**, oder drücke Yes im Popup.
2. Der neue Chat wird sofort erstellt und öffnet sich. Er behält das Preset und seine Auswahlen, die Persona, das Modell, das Agenten-Set, die Zugreihenfolge einer Gruppe und die World-DM-Welt.
3. Er bekommt die alte Geschichte als Vorgeschichte, innerhalb des "Backstory budget". Die drei nächstgelegenen früheren Chats werden vollständig gelesen: Kapitel, Fakten und Wendepunkte. Ältere Chats einer langen Kette werden nicht fallen gelassen: Sie reiten in einem verdichteten Teil mit (siehe unten). Die alten Nachrichten werden nicht gesendet.

Der frühere Chat wandert dann von selbst ins Archive (nächster Abschnitt). Die Verknüpfung ist die, die das Canvas zeichnet, und das Canvas kann sie später ändern: siehe [[canvas]]. Um einen anderen früheren Chat auszuwählen, starte einen Chat von der Figur aus und nutze das Menü **Continues** im Schritt "New chat with".

Der neue Chat öffnet sich mit der ersten Begrüßung der Karte; "Edit the first message" lässt dich dort weitermachen, wo die Geschichte aufgehört hat.

## Eine Geschichte aus vielen Chats

Eine Geschichte kann über viele Chats weitergehen. Die drei nächstgelegenen früheren Chats geben ihre Kapitel, Bögen und Fakten wie zuvor. Jeder ältere Chat kommt in einen **fernen** Teil, der zuerst platziert wird: seine Wendepunkte, die angepinnten und wichtigen Fakten und eine Zeile für jeden Bogen. Der Teil wird aus dem gebaut, was Litopys bereits geschrieben hat, ohne zusätzlichen Modellaufruf, und nimmt standardmäßig 18 % des Backstory-Budgets ein (Library, Litopys settings, "In the prompt", **Share for the far chats**, 5 bis 40). **Turning points shown** im selben Block legt fest, wie viele in einer Antwort über die ganze Geschichte hinweg mitreiten (standardmäßig 12). Wenn das Budget knapp ist, verlieren die ältesten Chats zuerst ihre Zeilen und die Wendepunkte zuletzt. In **What this chat carries** hat er seine eigene Zeile, "Far backstory, chats 1-2", damit du siehst, dass die ersten Chats behalten und nicht verloren wurden. Eine kurze Kette hat keinen fernen Teil. Erhöhe das Backstory-Budget, wenn sich eine lange Geschichte dünn anfühlt.

Ein verdichteter Teil lässt kleine Details fallen (die Farbe eines Umhangs); die wortwörtlichen Erinnerungen weiter unten bringen sie zurück.

## Archive eine fertige Geschichte

Eine Geschichte, mit der du fertig bist, kann ins **Archive** gehen. Es ist ein Status des Chats, keine Verschiebung: Der Chat bleibt, wo er ist, also funktionieren sein Gedächtnis, seine Verknüpfungen auf dem Canvas und jedes daraus gemachte Buch weiter.

- Wähle in Chats einen Chat und drücke **Archive** (die bernsteinfarbene Schaltfläche in seinem Panel), oder markiere mehrere mit Select. In einem Chat findest du es im Menü unter "Manage chat".
- Ein archivierter Chat verlässt die Liste und Home. Die bernsteinfarbene Zeile **Archive** unter den Filtern öffnet sie; **Back to chats** bringt dich zurück.
- Er öffnet sich schreibgeschützt: Du kannst lesen, kopieren, von einer Nachricht abzweigen, exportieren und sein Dashboard und seine Library ansehen, aber nicht senden, wischen, bearbeiten oder löschen. Sein Platz unten bietet **Continue in a new chat**. **Unarchive** (in seinem Panel oder im Banner) macht ihn wieder normal.
- Die Bestätigung bietet **Archive and continue**, wenn noch kein Chat diesen fortsetzt.
- **Es passiert von selbst**, wenn ein Chat der frühere Chat eines anderen wird: eine Verknüpfung auf dem Canvas, Continue in a new chat, das Popup oben oder eine Auswahl in "Continues". Ein Toast mit Undo sagt es dir. Abzweigungen sind keine Fortsetzungen und bleiben, wie sie sind. Schalte es in der Library aus, Zahnrad "Litopys settings", "Archive the earlier chat when it is continued".
- Ein Chat mit 100 Nachrichten oder mehr, der eine Woche still war, bekommt ein kleines Tag "Long chat · archive?" in der Liste und einen Hinweis in seinem Panel. Nichts wird für dich archiviert.

Warum der Aufwand: Der frühere Chat ändert sich nicht mehr, also bleibt sein Gedächtnis stabil, und ein neuer Chat, der ihn fortsetzt, liest ihn als fertige Geschichte ([[litopys]]).

## Details, die die Kapitel fallen gelassen haben

Ein Kapitel ist eine Nacherzählung, deshalb kann ein kleines Detail eines früheren Chats daraus verschwunden sein. In der Library, Litopys settings, "In the prompt", lässt der Schalter **Word-for-word memories of earlier chats** (standardmäßig an) einen Chat, der andere fortsetzt, ein oder zwei Passagen der Originalnachrichten zurückholen, wenn das Gesagte seltene Wörter mit ihnen teilt ([[litopys]]). Der frühere Chat wird indexiert, wenn er ins Archive geht. Er gleicht Wörter ab, deshalb wird ein Detail, das mit anderen Worten erzählt wurde, nicht gefunden; der experimentelle Schalter **Also find old chapters by meaning** (aus) verkleinert diese Lücke ein wenig, wenn du Embeddings verwendest: Er findet das Kapitel nach der Bedeutung, aber eine Passage braucht trotzdem ein eigenes seltenes Wort.

## Speichere eine Geschichte als Buch

In der Library, Litopys, kopiert "Save as a book" die Kapitel, Bögen und Fakten eines Chats auf das Data-Bank-Regal für Chats, die du auswählst: siehe [[memory]].

## Prüfe, was das Modell bekommen hat

Wenn eine Figur etwas vergisst, öffne Canvas > Prompt und wechsle von "Parts" zu "Memory": Es zeigt, welche Fakten hineingegangen sind und welche ausgelassen wurden, und warum. Die Schaltfläche **Fired** im Chat-Kopf zeigt es für die letzte Antwort und den ganzen Chat.
