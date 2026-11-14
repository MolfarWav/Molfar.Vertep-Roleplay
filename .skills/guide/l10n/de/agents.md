<!-- source: c7ff99fc9c56 -->
# Agents und die Agenten-Schmiede

Ein Agent ist ein kleiner Helfer, den du aus Karten und Verbindungen baust. Er liest einen Teil des Chats (vor oder nach einer Antwort, wie du wählst), kann einem Modell eine oder mehrere kurze Fragen stellen, führt eigene Notizen und zeigt etwas: eine Notiz unter der Antwort, antippbare Schaltflächen, eine Anzeige, eine Karte oder einen Hinweis für die nächste Antwort. Beispiele: drei vorgeschlagene nächste Züge, eine Spannungsanzeige, eine Karte der besuchten Orte. Diese Seite ist für die, die solche Extras wollen. Die Hilfe hat drei Artikel zum Editor: „Agent editor: how an agent works“, „Agent editor: the cards“ und „Agent editor: three ready agents“.

## Woraus ein Agent besteht

Ein Agent sind Daten, kein Code. Im Editor ist er ein Brett aus **Karten**, die durch **Verbindungen** verbunden sind:

- eine **Input**-Karte legt fest, was der Agent lesen darf (die letzte Antwort, den Chatverlauf, die Charakterkarte, die Persona, die Autorennotiz, Litopys-Fakten, Lorebook-Einträge);
- **Ask the model**-Karten stellen einem Modell eine Frage und nehmen die Antwort als freien Text, Ja oder Nein, oder ein paar benannte Felder;
- Logik-Karten (eine If-Karte kann nur auslösen, wenn ihre Antwort auf Ja umspringt, nur einmal oder mit einer Pause nach dem Auslösen, und ihre Regeln können fragen, ob sich ein Wert seit dem letzten Lauf geändert hat; das Lauf-Protokoll sagt, warum sie geantwortet hat) und Karten, die ohne Modell im Code arbeiten: Würfel, das Auswählen einer Zeile, das Schneiden oder Herausziehen von Text;
- eine **Script**-Karte: ein paar Zeilen JavaScript, die du schreibst, `(input, seed)` hinein und ein einfaches Objekt heraus, mit typisierten Ein- und Ausgaben. Sie läuft in einer Sandbox der Engine (ohne Uhr, ohne Internet, ohne Dateien, etwa eine halbe Sekunde und 16 MB) und braucht eine Engine ab 1.10.1; eine ältere Engine lässt den Agenten mit einer einfachen Meldung scheitern;
- Karten für den eigenen **Speicher** des Agenten (Zahlen, Text, Ja/Nein, Listen), pro Chat gehalten und getrennt vom Dashboard;
- eine **Output**-Karte, die ein Ergebnis zeigt: „A note under the reply“, „Buttons to tap“, einen Zustandswert oder einen Hinweis, der in den nächsten Prompt gelegt wird.

**Panels** (Anzeigen, Zähler, Tabellen, ein Brett aus Kacheln) zeigen an, was der Agent behält; in einem Panel läuft nichts, und seine Schaltflächen fügen nur Text in das Nachrichtenfeld ein.

Wann er läuft, ist eine Spur (lane). Die Datei des Agenten legt fest, in welcher Spur er startet, und jeder Chat kann ihn in eine andere verschieben (der Tab Agents des Chats oder das Brett „Agent sets“ im Canvas). Die vier Spuren:

- **Before the reply**: die Antwort wartet auf den Agenten, und ein Hinweis, den er hinterlässt, geht in genau diese Antwort. Halte es bei ein oder zwei schnellen Fragen, denn die Wartezeit kommt zu jeder Antwort hinzu. Der Schalter Wait in der Zeile des Agenten schaltet das Warten aus; der Agent läuft dann neben der Antwort.
- **Beside the reply**: läuft gleichzeitig, fügt keine Wartezeit hinzu und kann keinen Hinweis in die Antwort legen, neben der er läuft (Notizen, Schaltflächen und Panels funktionieren).
- **After the reply**: die übliche Spur für Notizen, Tracker und Anzeigen.
- **By hand**: läuft nur, wenn du den Lauf-Button seiner Zeile drückst.

Zusätzlich kann ein Agent bei jeder N-ten Antwort laufen oder nur, wenn bestimmte Wörter auftauchen. Die Wörter werden in den letzten zwei Nachrichten gesucht, außer der Agent sagt etwas anderes: Im Tab Agent gibt es „Look back this many messages“ (1 bis 50), sobald Wörter gesetzt sind.

## Fertige Agents

Drücke „New agent“ im Agents-Brett des **Canvas** (der Rail-Punkt **Agents** öffnet es). „Empty agent“ ergibt eine Input- und eine Notiz-Karte. „Start from a ready agent“ bietet zehn funktionierende an: Next moves, Pacing nudge, Story map, Scene recap, Territory board, Tension meter, Character growth (er schlägt vor, wie sich die Figur verändert hat, für den Tab Memory der Karte; siehe die Seite zum Speicher), Repetition guard, Canon guard und Ledger (unten beschrieben). Unter „Drafts“ stehen Agents, die Molfar in deinen Workspace geschrieben hat („Drafts from Molfar“).

### Repetition guard, Canon guard und Ledger

Drei fertige Agents für Probleme, auf die lange Geschichten stoßen. Schalte jeden pro Chat ein, wie jeden Agent, und lies seine Berechtigungen, bevor du ihn erlaubst.

- **Repetition guard** hält ein Modell davon ab, seine eigenen Wörter wiederzuverwenden. Nach jeder Antwort liest ein Skript (kein Modellaufruf, kostet also auf einem kostenlosen Modell nichts) die letzten sechs Antworten der Figur und findet Wendungen aus drei bis fünf Wörtern, die zwei Antworten gemeinsam haben, sowie Satzanfänge, die dreimal vorkommen. Es setzt höchstens fünf Wendungen in den nächsten Prompt: „Do not reuse these phrases from earlier replies: ...“ (etwa 40 bis 80 Token). Es funktioniert mit Kyrillisch wie mit Lateinisch. Ein Chat ohne Wiederholungen bekommt keinen Hinweis. Es liest den Chatverlauf und führt Code aus.
- **Canon guard** fängt eine Antwort ab, die der Figurenkarte oder den von Litopys festgehaltenen Fakten widerspricht (Aussehen, Namen, Orte, Besitztümer). Bei jeder dritten Antwort liest es die letzten drei Antworten, die Karte und bis zu 30 Fakten und fragt das Modell einmal. Findet es einen Widerspruch, hinterlässt es unter der Antwort eine Notiz, die mit der Erinnerung endet, den Fakt in Litopys zu aktualisieren, falls sich die Geschichte wirklich geändert hat, und eine Schaltfläche über dem Eingabefeld, die „(OOC: ...)“ mit der Korrektur schreibt; du entscheidest, ob du sie sendest. Es schreibt nie eine Antwort um, ändert nie eine Karte oder einen Fakt und zeigt jedes Problem nur einmal. Es braucht einen Chat mit einer Figur und Litopys-Fakten; fehlt eines von beiden, tut es stillschweigend nichts.
- **Ledger** führt die Zahlen, von denen ein Ressourcenspiel lebt: Geld, Vorräte, eine Schatzkammer mit Einkommen pro Tag, Countdowns („Ankunft in 4 Tagen“). Das Modell meldet nur, was sich geändert hat; ein Skript macht jede Rechnung und rückt die Tage vor. Eine Tabelle steht in einem schwebenden Fenster, und der nächsten Antwort werden die wahren Zahlen mitgeteilt, damit sie keine erfindet. Nur Zahlen, nie Gegenstände. Korrigiere eine Zahl selbst, indem du (ledger: gold = 500) oder (ledger: remove gold) in deine Nachricht schreibst; (ledger: timer Castle = 4) und (ledger: gold per day = 50) funktionieren ebenfalls. Es fragt das Modell einmal pro Antwort, aber nur, wenn die Antwort oder deine Nachricht eine Ziffer, ein Zahlwort oder eine Zeitangabe enthält (Tag, Woche, Nacht, Morgen, auf Englisch, Ukrainisch und Russisch); eine Antwort ohne diese kostet nichts, und die Zahlen gehen trotzdem in den Prompt. Bis zu 12 Zeilen.

## Der Editor

Bearbeitungen werden einen Moment nach dem Aufhören als Entwurf gespeichert. Drei Tabs: Card (die gewählte Karte), Agent (Name, wann er läuft, sein Speicher, Panels) und Try. Eine Prüfung zeigt „Passes the check“, die Zahl der Probleme und Warnungen und „N model calls per run“. Mit offenen Problemen kannst du nicht installieren. „Export as a file“ speichert eine Datei, die du teilen kannst. Das Blatt „Install and manage agents...“ im Chat hat „Install an agent file“, um eine einzubringen.

### Die Optionen der If-Karte

Eine If-Karte antwortet mit Ja, Nein oder Unbekannt nach ihren Regeln. Allein gesehen sagt sie bei jedem Lauf Ja, solange die Regeln zutreffen. Unter den Regeln ändert **When it answers Yes** das: „Every time“ (der Standard), „Only when it turns Yes“ (sie löst beim Schritt von nicht Ja zu Ja aus und erst wieder, nachdem die Antwort zurückgegangen ist) oder „Only once in this chat“. **Pause after it fires (runs)** überspringt nach einem Ja so viele Läufe des Agenten, 0 bis 50. Ein Lauf ist ein Zug des Agenten. Ein Agent, der jede dritte Antwort läuft, hält mit einer Pause von 2 also sechs Antworten lang still. Eine Regel kann auch „changed since the last run“ nutzen: Ja, wenn sich der Wert vom letzten Lauf unterscheidet. Im Formular wählt jede Regel unter **What the rule reads** aus: einen Wert, den du verbindest, einen Dashboard-Wert, den Chat (Anzahl der Nachrichten, wer zuletzt gesprochen hat) oder einen Würfel der World DM (Fate, Life oder Pacing: ob er in diese Antwort eine Notiz gelegt hat und welches Ergebnis es war). Einen Würfel zu lesen braucht die Berechtigung „Read what the World DM’s dice said for the last reply“, und das funktioniert nur bei einem Agenten, der nach der Antwort läuft. Nur ein Ja wird zurückgehalten; Nein und Unbekannt kommen trotzdem heraus. Der Agent merkt sich das pro Chat, und „start over“ am Agenten vergisst es. Der Try-Tab zeigt, warum eine Karte geantwortet hat (die Regel, den gelesenen Wert, das Ergebnis) und, wenn sie ein Ja zurückgehalten hat, welche Option es hielt; das Agent-Log unter einer Antwort zeigt dieselben Zeilen.

## Probelauf

Der Try-Tab führt einen erfundenen Durchlauf aus, ohne irgendetwas anzufassen. Du änderst die Eingaben, und die Verbindungen auf dem Brett zeigen, was sich bewegt; ohne Modell nutzt jede „Ask the model“-Karte eine Beispielantwort, die du bearbeiten kannst. Unter „A real chat“ wählst du einen Chat und „Fill from this chat“, um zu laden, was der Agent wirklich bekäme. „Run with the model“ fragt dann das echte Modell mit der echten Frage: bis zu N Aufrufe, echte Tokens, und nichts wird im Chat oder im Agent gespeichert.

Ein Agent mit einer Script-Karte, die in einem Chat dreimal hintereinander aus Zeitgründen abbricht, wird dort in Ruhe gelassen: der Agents-Tab sagt, dass er pausiert ist (jeder solche Lauf würde die 2,5 Sekunden des Skripts kosten). Repariere das Skript und drücke dann **Run again**; ein Lauf, der funktioniert, beendet die Pause. Die Kacheln des Territory board sind Schaltflächen: tippe eine an, und ihr Ort geht in das Nachrichtenfeld (nichts wird gesendet). Eine Listen-Karte kann auch auf „Change an entry, or add it if there is none“ gestellt werden, damit etwas zweimal Gesagtes die Liste nicht füllt.

## Installieren, erlauben, in einem Chat einschalten

1. Drücke „Install“ („Update“ bei einer geänderten Kopie eines installierten Agents; nutze „Edit a copy“, um einen zu ändern).
2. Erlaube ihn einmal: „Review permissions“, dann „Allow all“ oder Zeile für Zeile. Er läuft, wenn jede Zeile an ist. Ein Update, das mehr verlangt, wartet auf ein neues Allow. Eine Script-Karte verlangt „Run its own small program“; die Berechtigungsliste zeigt ihren Code („Read the code“), bevor du erlaubst, und ändert ein Update den Code, wird die Berechtigung erneut abgefragt.
3. Füge ihn einem Chat hinzu. Öffne in der Chat-Kopfzeilen-Pille den **Agents**-Tab: „In this chat“ listet aktive Agents, „Installed“ listet die übrigen (wähle einen, um ihn hinzuzufügen). Eine Zeile kann jetzt erneut laufen, entfernt werden oder das Warten der Antwort auf ihn beenden. Ein neuer Chat hat keine Agents, bis du welche hinzufügst oder ein Set wählst. Ein Agent, der noch nicht erlaubt ist, zeigt **Allow…** in seiner Zeile: Es öffnet sofort seinen Berechtigungsdialog. Eine Zeile kann jetzt erneut laufen, entfernt werden oder die wartende Antwort stoppen.

Ein **Set** ist eine benannte Liste von Agents („Save this chat's list as a set“; „Make default“ gibt sie neuen Chats). Das Brett „Agent sets“ im Canvas zeigt die Kosten jedes Sets in Zeit und Aufrufen und enthält den Schalter „Agents' notes in chats“, der alle Notizen der Agents ausblendet. Der Ergebnisplatz jedes Agents lässt sich im Agents-Tab des Chats ändern, unter den Plätzen, die zu ihm passen.

Jede „Ask the model“-Karte ist ein Aufruf pro Lauf; der Editor zeigt die Zahl. „Every Nth reply“ teilt die Kosten.

**Was es kostet, bevor du es einschaltest.** Die Seite zu den Berechtigungen und die Karte des Agenten im Blatt Agents zeigen eine Schätzung für einen Lauf: die Aufrufe und ungefähr wie viele Tokens hinein- und höchstens herausgehen. Der Tab Agents fügt eine Zeile mit der Summe pro Antwort für die Agenten hinzu, die im Chat eingeschaltet sind, mit „Every Nth reply“ schon verteilt. Sie wird aus den Dateien der Agenten berechnet (Länge ihrer Fragen, was sie lesen, ihre Antwortgrenzen), nicht aus deinem Chat, deshalb steht „etwa“ dabei: die echten Zahlen hängen vom Chat und vom Modell ab. Ein Agent, der kein Modell fragt, sagt das.

**Wo ein Hinweis hingeht.** Eine Output-Karte vom Typ Hinweis („prompt-insert“) hat „Position in the prompt“: nach dem Verlauf (der Standard, das Ende der letzten Spielernachricht), am Anfang des System-Prompts oder an dessen Ende. Ein Hinweis im System-Prompt wiegt beim Modell schwerer, also halte ihn kurz. Es ist dieselbe Berechtigung wie bei jedem Hinweis.
