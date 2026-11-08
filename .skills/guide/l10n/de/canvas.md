<!-- source: 045cbad8d708 -->
# Canvas: Chat-Verknüpfungen, Prompt und Agents

Canvas ist die technische Werkbank von Roleplay: ein Bildschirm mit Brettern, auf dem du siehst und änderst, wie Chats miteinander verbunden sind und was jeder Chat an das Modell schickt. Zum Spielen brauchst du es nicht. Öffne es, wenn eine Geschichte eine Fortsetzung braucht, wenn dich eine Antwort überrascht hat oder wenn du Agents baust.

Wähle ein Brett mit dem Schalter **Board** oben: **Chat links**, **Prompt**, **Agents** und **Agent sets**. Der Punkt **Agents** in der Rail öffnet dasselbe Canvas auf seinem Agents-Brett. Das zuletzt benutzte Brett wird gemerkt.

## Chat-Verknüpfungen

Eine Karte deiner Chats. Jeder Chat ist eine Karte. Eine Linie von einem Chat zum anderen bedeutet: „dieser Chat setzt jenen fort“. Die Geschichte des früheren Chats reist dann als Hintergrund in den Antworten des späteren Chats mit, innerhalb des Hintergrund-Budgets, das in der Library eingestellt ist. Die drei nächsten früheren Chats werden vollständig gelesen, ältere verdichtet ([[long-chats]]). Eine durchgezogene Linie ist eine Fortsetzung. Eine gestrichelte Linie ist ein Zweig, der von einer Nachricht abgezweigt wurde.

- Chats, die du nicht aufs Brett gelegt hast, warten links in der Liste (**Chats**). Zieh einen auf das Brett oder nutze **Put on the board** (mit **its linked chats**, um die ganze Kette zu holen). Zieh eine Karte zurück in die Liste oder nutze **Remove**, um sie vom Brett zu nehmen. Der Chat selbst bleibt in der Library.
- Schalte **Edit** ein, um Karten zu verbinden oder zu trennen. Eine Verknüpfung, die eine Schleife bilden würde, einen Chat mit sich selbst verbinden oder eine bestehende wiederholen würde, wird abgelehnt, und das Brett sagt, warum. **Undo** und **Redo** sind da. **Fit** rahmt den ganzen Graphen ein.
- Auf dem Telefon öffnet sich das Brett in **View** mit einer **List** der Verknüpfungen. Einen Graphen zu bauen geht auf einem großen Bildschirm leichter, aber Verknüpfungen kannst du auch in der Liste bearbeiten.

Die Karte eines Chats in der Library zeigt dieselbe Kette, aber nur zum Ansehen. Ihr Button **Edit on canvas** bringt dich hierher.

## Prompt

Wähle einen Chat, um die Anfrage zu sehen, die er an das Modell schickt. Das Brett hat zwei Ansichten: **Parts** und **Memory**.

- **Parts** listet jeden Teil der Anfrage auf: den Hauptprompt, die Charakterkarte, die Persona, Lorebook-Einträge, Beispieldialoge, Preset-Abschnitte und den Verlauf, jeweils mit Tokenzahl und Zustand. Ein Teil kann im Preset aus sein, für diesen Chat aus sein, leer sein oder bei dieser Art von Antwort nicht gelten. Du kannst einen Teil nur für diesen einen Chat ausschalten, ohne das Preset anzufassen. **Only what is sent** blendet den Rest aus, und die Summe zeigt, was das Modell bekommt.
- **Memory** erklärt, warum das Gedächtnis bei der letzten Antwort das eingefügt hat, was es eingefügt hat: [[memory]] enthält die volle Beschreibung.

Für einen schnelleren Blick nur darauf, was bei der letzten Antwort gegriffen hat, nutze den Button **Fired** in der Chat-Kopfzeile. Die Memory-Ansicht und **Fired** lesen dieselbe Aufzeichnung; Fired zählt zusätzlich über den ganzen Chat.

## Agents und Agent sets

Die Agent-Schmiede: einen Agent bauen, ihn ausprobieren und Agents zu Sets gruppieren. Siehe [[agents]].

## Was unverändert bleibt

Ein Teil auf dem Prompt-Brett auszuschalten, gilt nur für diesen einen Chat. Das Preset und die Karten werden nicht verändert.
