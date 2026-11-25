<!-- source: bea962ecf922 -->
# Währenddessen: Das Leben abseits des Bildschirms

Währenddessen lässt die Menschen, die nicht in der Szene sind, Dinge tun, während die Geschichte weitergeht: Bram verkauft am Hafen ein Pferd, Ada versteckt das Hauptbuch, eine Front rückt ihrem Ziel einen Schritt näher. Es ist eine Testversion, standardmäßig aus.

## Einschalten

Öffne das **World**-Blatt des Chats und finde die Karte **Meanwhile**. Schalte "Let people off screen act" ein. Der Schalter gilt für alle Chats. Er braucht das **Dashboard**, weil Währenddessen die Szenen daraus liest, und er braucht jemanden, der handelt: eine Charakterkarte, die nicht in der Szene ist, oder eine Person im Buch des World DM.

## Wann es läuft

Ein Durchlauf startet nach einer Antwort, wenn mindestens zwei neue Antworten eingegangen sind und entweder eine neue Szene begonnen hat oder die Story-Uhr um sechs Stunden weitergelaufen ist. Ein Durchlauf ist ein Modellaufruf. Er nutzt sein eigenes Modell, wenn du eines einstellst, sonst das des World DM, des Dashboard-Sensors, der Library, des Chats, der App. Die Karte sagt, welches. "Run a pass now" führt sofort einen aus.

Ein Durchlauf fragt nach bis zu drei kleinen Ereignissen. Die App prüft jedes einzelne: Die Personen müssen welche sein, die der Chat kennt, niemals dein Charakter und niemals jemand, der in der Szene ist, und die Wirkungen müssen aus einer kurzen Liste stammen. Ein Ereignis, das eine Prüfung nicht besteht, wird komplett verworfen, und das Log sagt, warum. Ein Ereignis, das noch einmal sagt, was ein früheres Ereignis über dieselbe Person schon gesagt hat, wird ebenfalls verworfen („repeats an earlier event“). Wenn ein Modell nichts antwortet, versucht der Durchlauf es einmal mehr mit mehr Spielraum; ein Durchlauf, der scheitert, wartet zehn Minuten.

## Was die Karte zeigt

- **What this card shows**: Nothing (nur dass etwas passiert ist), Hints (wer und wo) oder Everything. Standard ist Hints, damit die Geschichte für dich nicht verdorben wird.
- **Off screen so far**: die Ereignisse, soweit diese Einstellung es zulässt.
- **Log**: jeder Durchlauf: warum er lief (Szene geschlossen, Zeit vergangen, von Hand), wie viele Ereignisse das Modell angeboten hat und wie viele behalten wurden, warum der Rest verworfen wurde, und der Fehler, wenn er gescheitert ist.

## Was die Ereignisse mit der Geschichte machen

Jedes behaltene Ereignis wird zu einer Erinnerung der Menschen, denen es widerfahren ist, und derer, die es gesehen haben, und von niemandem sonst: niemals deines Charakters. Es erreicht eine Antwort nach den üblichen Regeln des Story-Records ([[litopys]]): wenn einer dieser Menschen spricht, oder einer von ihnen für eine Erzähler- oder Gruppenantwort in der Szene ist. Wer davon weiß, kann es dann zur Sprache bringen, darauf anspielen oder danach handeln; die anderen dürfen nicht. Ein geheimes Ereignis wird außerdem mit "kept secret" markiert, damit einer Gruppenantwort gesagt wird, wer es geheim hält. Die Ereignisse werden nicht in die Facts der Library kopiert: Sie werden für jede Antwort aus der Währenddessen-Datei gelesen, kosten also nichts zum Behalten und verschwinden mit dem Swipe. Das "What fired"-Panel des Prompts listet sie wie jeden Fact.

Wenn du Währenddessen ausschaltest, erreichen die Ereignisse die Antworten sofort nicht mehr.

## Im Journal des Dashboards

Im breiten Dashboard hat das **Journal** eines Charakters einen Abschnitt **Off screen (Meanwhile)** mit den Ereignissen, die diesem Charakter widerfahren sind, neueste zuerst, soweit die Einstellung der Karte sie zeigen lässt: unter Hints nur wo und wann, unter Everything den Text, und unter Nothing nichts. Es liest nur die Währenddessen-Datei; es schreibt nichts ins Dashboard, geht also mit einem Swipe und braucht keine zusätzliche Einstellung. Auf einem Handy wird das Journal nicht angezeigt.

## Swipes und Löschungen

Ein Ereignis gehört zu der Antwort, nach der es passiert ist. Wenn du diese Antwort neu generierst, wird die neue Version ohne das Ereignis geschrieben; wenn du diese Antwort swipest oder löschst, gehen die Ereignisse dieses Durchlaufs mit, auch aus der Geschichte, und der nächste Durchlauf liest die Geschichte wieder ab der letzten Antwort, die noch da ist.

Verwandt: [[world-dm]], [[dashboard]], [[litopys]]. Siehe [[litopys]] "Who knows", um zu erfahren, wie Geheimnisse gezeigt werden.
