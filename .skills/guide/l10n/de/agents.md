<!-- source: a06a17fd0667 -->
# Agents und die Agenten-Schmiede

Ein Agent ist ein kleiner Helfer, den du aus Karten und Verbindungen baust. Nach einer Antwort liest er einen Teil des Chats, kann einem Modell eine oder mehrere kurze Fragen stellen, führt eigene Notizen und zeigt etwas: eine Notiz unter der Antwort, antippbare Schaltflächen, eine Anzeige, eine Karte oder einen Hinweis für die nächste Antwort. Beispiele: drei vorgeschlagene nächste Züge, eine Spannungsanzeige, eine Karte der besuchten Orte. Diese Seite ist für die, die solche Extras wollen. Die Hilfe hat drei Artikel zum Editor: „Agent editor: how an agent works“, „Agent editor: the cards“ und „Agent editor: three ready agents“.

## Woraus ein Agent besteht

Ein Agent sind Daten, kein Code. Im Editor ist er ein Brett aus **Karten**, die durch **Verbindungen** verbunden sind:

- eine **Input**-Karte legt fest, was der Agent lesen darf (die letzte Antwort, den Chatverlauf, die Charakterkarte, die Persona, die Autorennotiz, Litopys-Fakten, Lorebook-Einträge);
- **Ask the model**-Karten stellen einem Modell eine Frage und nehmen die Antwort als freien Text, Ja oder Nein, oder ein paar benannte Felder;
- Logik-Karten und Karten, die ohne Modell im Code arbeiten: Würfel, das Auswählen einer Zeile, das Schneiden oder Herausziehen von Text;
- Karten für den eigenen **Speicher** des Agenten (Zahlen, Text, Ja/Nein, Listen), pro Chat getrennt vom Dashboard geführt;
- eine **Output**-Karte, die ein Ergebnis zeigt: „A note under the reply“, „Buttons to tap“, einen Zustandswert oder einen Hinweis, der in den nächsten Prompt gelegt wird.

**Panels** (Anzeigen, Zähler, Tabellen, ein Brett aus Kacheln) zeigen an, was der Agent behält; in einem Panel läuft nichts, und seine Schaltflächen fügen nur Text in das Nachrichtenfeld ein.

Wann er läuft, wird pro Agent festgelegt: nach jeder Antwort (der einzige Zeitpunkt, den diese Version ausführt); bei jeder N-ten Antwort; oder nur, wenn bestimmte Wörter auftauchen.

## Fertige Agents

Drücke „New agent“ im Agents-Brett des **Canvas** (der Rail-Punkt **Agents** öffnet es). „Empty agent“ ergibt eine Input- und eine Notiz-Karte. „Start from a ready agent“ bietet sechs funktionierende an: Next moves, Pacing nudge, Story map, Scene recap, Territory board und Tension meter. Unter „Drafts“ stehen Agents, die Molfar in deinen Workspace geschrieben hat („Drafts from Molfar“).

## Der Editor

Bearbeitungen werden einen Moment nach dem Aufhören als Entwurf gespeichert. Drei Tabs: Card (die gewählte Karte), Agent (Name, wann er läuft, sein Speicher, Panels) und Try. Eine Prüfung zeigt „Passes the check“, die Zahl der Probleme und Warnungen und „N model calls per run“. Mit offenen Problemen kannst du nicht installieren. „Export as a file“ speichert eine Datei, die du teilen kannst. Das Blatt „Install and manage agents...“ im Chat hat „Install an agent file“, um eine einzubringen.

## Probelauf

Der Try-Tab führt einen erfundenen Durchlauf aus, ohne irgendetwas anzufassen. Du änderst die Eingaben, und die Verbindungen auf dem Brett zeigen, was sich bewegt; ohne Modell nutzt jede „Ask the model“-Karte eine Beispielantwort, die du bearbeiten kannst. Unter „A real chat“ wählst du einen Chat und „Fill from this chat“, um zu laden, was der Agent wirklich bekäme. „Run with the model“ fragt dann das echte Modell mit der echten Frage: bis zu N Aufrufe, echte Tokens, und nichts wird im Chat oder im Agent gespeichert.

## Installieren, erlauben, in einem Chat einschalten

1. Drücke „Install“ („Update“ bei einer geänderten Kopie eines installierten Agents; nutze „Edit a copy“, um einen zu ändern).
2. Erlaube ihn einmal: „Review permissions“, dann „Allow all“ oder Zeile für Zeile. Er läuft, wenn jede Zeile an ist. Ein Update, das mehr verlangt, wartet auf ein neues Allow.
3. Füge ihn einem Chat hinzu. Öffne in der Chat-Kopfzeilen-Pille den **Agents**-Tab: „In this chat“ listet aktive Agents, „Installed“ listet die übrigen (wähle einen, um ihn hinzuzufügen). Eine Zeile kann jetzt erneut laufen, entfernt werden oder das Warten der Antwort auf ihn beenden. Ein neuer Chat hat keine Agents, bis du welche hinzufügst oder ein Set wählst.

Ein **Set** ist eine benannte Liste von Agents („Save this chat's list as a set“; „Make default“ gibt sie neuen Chats). Das Brett „Agent sets“ im Canvas zeigt die Kosten jedes Sets in Zeit und Aufrufen und enthält den Schalter „Agents' notes in chats“, der alle Notizen der Agents ausblendet. Der Ergebnisplatz jedes Agents lässt sich im Agents-Tab des Chats ändern, unter den Plätzen, die zu ihm passen.

Jede „Ask the model“-Karte ist ein Aufruf pro Lauf; der Editor zeigt die Zahl. „Every Nth reply“ teilt die Kosten.
