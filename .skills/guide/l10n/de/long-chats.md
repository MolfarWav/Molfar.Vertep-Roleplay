<!-- source: 9efd9a7576a4 -->
# Lange Chats und Token-Kosten

Ein Chat, der wochenlang läuft, wird größer, und jede Antwort schickt mehr davon an das Modell. Diese Seite ist für alle, deren Antworten langsam oder teuer werden oder deren Modell den Anfang der Geschichte vergisst.

## Der Button Request size

Standardmäßig wird der ganze Chat gesendet, solange das Fenster Platz hat. Bei einem großen Fenster wachsen die Kosten weiter, deshalb hat die Chat-Kopfzeile neben den Story-Werkzeugen einen Button **Request size** (auf einem Telefon: im Menü). Er zeigt, wie viele Tokens die letzte Anfrage gesendet hat, den ganzen Prompt so, wie der Anbieter ihn gezählt hat, und welches Modell ihn bekam. Drücke ihn für das Modell, sein Fenster und dein Limit. Er ist türkis unter drei Vierteln des Limits, ab dort bernsteinfarben, und darüber rot mit einem Warnzeichen. Das Prompt-Brett des Canvas listet jeden Teil einer Anfrage auf ([[canvas]]).

Drückt eine Antwort die Anfrage über das Limit, öffnet sich ein Popup:

- **Yes, continue in a new chat** erstellt sofort den nächsten Chat und öffnet ihn.
- **Not now** blendet das Popup für diesen Chat aus, bis die Anfrage um die Hälfte gewachsen ist. Schließen zählt als Not now.
- **Send finished scenes as chapters instead** erscheint, wenn Litopys an ist (nächster Abschnitt).

Das Limit steht unten im Popup und in der Library, Zahnrad „Litopys settings“, Block „In the prompt“, „Warn me when a request gets big“: 60 % des Modellfensters (Standard), eine Größe, die du eintippst (100k), oder wählst (16k bis 500k), oder nie. Ein Chat, der schon über dem Limit ist, zeigt den roten Button und kein Popup, bis eine neue Antwort ihn weiter wachsen lässt.

Die Aufzeichnung hat ihre eigene Größe. Im selben Block ist „Memory size“ standardmäßig Auto: 15 % des Modellfensters, zwischen 800 und 16000 Tokens. „Compact“ hält sie bei 800.

## Die Schalter, die Kosten senken

Im selben Block hat „Older messages leave the prompt“ zwei Wahlen:

- **Only when the window is full** (Standard): Jede Nachricht wird gesendet, solange sie passt.
- **By scenes**: Sobald ein Kapitel eine Szene umfasst, wird die Szene durch das Kapitel ersetzt. Nur die letzten Nachrichten bleiben wortgetreu („Direct messages after the scenes“, 2 oder mehr). Die neueste Szene hat noch kein Kapitel, also wird sie vollständig gesendet.

„By scenes“ kostet etwas Detail: Ein Kapitel ist eine Nacherzählung, daher kann ein schwaches Modell eine kleine Sache verlieren. Hefte einen Fakt an, der niemals verloren gehen darf ([[litopys]]). Weitere Kürzungen:

- Prompt-Brett im Canvas, Karte History, Details: nur die letzten N Nachrichten senden (am Computer, nur dieser Chat).
- „Memory size“ auf Compact senken oder „Chapters and facts“ ausschalten.

## Einen neuen Chat beginnen und die Geschichte behalten

An einer natürlichen Pause startet ein neuer Chat, der den alten fortsetzt, mit einem kleinen Prompt und weiß trotzdem, was passiert ist.

1. Im Chat „More“ öffnen und **Continue in a new chat** wählen oder im Popup Yes drücken.
2. Der neue Chat wird sofort erstellt und öffnet sich. Er behält das Preset und seine Auswahl, die Persona, das Modell, das Agent-Set, die Zugreihenfolge einer Gruppe und die Welt des World DM.
3. Er bekommt die alte Geschichte als Hintergrund: Kapitel und Fakten, bis zu drei Chats zurück, innerhalb des „Backstory budget“. Die alten Nachrichten werden nicht gesendet.

Der frühere Chat wandert danach selbst ins Archiv (nächster Abschnitt). Die Verknüpfung ist die, die das Canvas zeichnet, und das Canvas kann sie später ändern: siehe [[canvas]]. Um einen anderen früheren Chat zu wählen, starte einen Chat vom Charakter aus und nutze das Menü **Continues** im Schritt „New chat with“.

Der neue Chat öffnet mit der ersten Begrüßung der Karte; „Edit the first message“ lässt dich dort weitermachen, wo die Geschichte aufhörte.

## Eine fertige Geschichte archivieren

Eine Geschichte, die du beendet hast, kann ins **Archive**. Das ist ein Status des Chats, kein Verschieben: Der Chat bleibt, wo er ist, damit seine Erinnerung, seine Verknüpfungen auf dem Canvas und jedes daraus gemachte Buch weiter funktionieren.

- Wähle in Chats einen Chat und drücke **Archive** (der bernsteinfarbene Button in seinem Panel), oder markiere mehrere mit Select. In einem Chat steht es im Menü unter „Manage chat“.
- Ein archivierter Chat verschwindet aus der Liste und aus Home. Die bernsteinfarbene Zeile **Archive** unter den Filtern öffnet sie; **Back to chats** kehrt zurück.
- Er öffnet sich nur lesend: Du kannst lesen, kopieren, von einer Nachricht aus verzweigen, exportieren und sein Dashboard und seine Library ansehen, aber nicht senden, swipen, bearbeiten oder löschen. Sein Platz unten bietet **Continue in a new chat** an. **Unarchive** (im Panel oder im Banner) macht ihn wieder normal.
- Die Bestätigung bietet **Archive and continue** an, wenn noch kein Chat diesen fortsetzt.
- **Es geschieht von selbst**, wenn ein Chat der frühere Chat eines anderen wird: eine Verknüpfung auf dem Canvas, Continue in a new chat, das Popup oben oder eine Wahl unter „Continues“. Ein Toast mit Undo sagt es. Zweige (Branches) sind keine Fortsetzungen und bleiben, wie sie sind. Ausschalten in der Library, Zahnrad „Litopys settings“, „Archive the earlier chat when it is continued“.
- Ein Chat mit 100 oder mehr Nachrichten, der eine Woche still war, bekommt in der Liste ein kleines Etikett „Long chat · archive?“ und einen Hinweis in seinem Panel. Es wird nichts für dich archiviert.

Warum: Der frühere Chat ändert sich nicht mehr, damit seine Erinnerung stabil bleibt, und ein neuer Chat, der ihn fortsetzt, liest ihn als abgeschlossene Geschichte ([[litopys]]).

## Details, die die Kapitel verloren haben

Ein Kapitel ist eine Nacherzählung, daher kann ein kleines Detail eines früheren Chats daraus verschwunden sein. In der Library, Litopys settings, „In the prompt“, bringt der Schalter **Word-for-word memories of earlier chats** in einem Chat, der andere fortsetzt, eine oder zwei Passagen der ursprünglichen Nachrichten zurück, wenn das Gesagte seltene Wörter mit ihnen teilt ([[litopys]]). Standardmäßig aus.

## Eine Geschichte als Buch speichern

In der Library, Litopys, kopiert „Save as a book“ die Kapitel, Bögen und Fakten eines Chats auf das Regal der Data Bank für die Chats, die du auswählst: siehe [[memory]].

## Prüfen, was das Modell bekam

Vergisst ein Charakter etwas, öffne Canvas > Prompt und wechsle von „Parts“ auf „Memory“: Dort siehst du, welche Fakten hineingekommen und welche weggelassen wurden und warum. Der Button **Fired** in der Chat-Kopfzeile zeigt das für die letzte Antwort und den ganzen Chat.
