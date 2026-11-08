<!-- source: 0b3281e4764e -->
# World DM

Der World DM ist ein Spielleiter für die Welt eines Chats. Nach Antworten liest er die Geschichte und hält die Personen, Orte und Dinge, die er trifft, im eigenen Lorebook des Chats fest, dem Weltbuch. Auf höheren Stufen bewegt er auch die Welt und sendet Ereignisse in die Szene. Nutze ihn, wenn die Welt lebendig und stimmig wirken soll.

## Stufen

Öffne ihn über die Chat-Kopfzeile „World“ (auf einem Telefon Menü, dann World) oder über den Bereich **World** in der Rail. Wähle, was der DM tut:

- **Off**: keine Ereignisse und keine Würfel. Das Weltbuch füllt sich weiter aus der Geschichte: Wenn die Szene einen neuen Ort oder ein neues Ding nennt, fragt ein kleiner Aufruf das DM-Modell, ob es ihn aufzeichnen soll.
- **Chronicler**: zeichnet nur auf und fügt keine eigenen Ereignisse hinzu.
- **Living world**: Fraktionen und Bedrohungen bewegen sich außerhalb des Bildschirms. Neuigkeiten können Charaktere als Gerücht erreichen; nichts wird erzwungen.
- **Director**: bringt Haken, Komplikationen und Besucher in die Szene, und die nächste Antwort muss sie nutzen.
- **Antagonist**: Konsequenzen und Druck, gerichtet auf das, was den Charakteren wichtig ist.
- **Total chaos**: alles kann passieren, egal welches Genre. Er schreibt die Geschichte nie um und wartet explizite Szenen ab.

Standardmäßig ist der DM in einem Story-Chat bereits ab der ersten Antwort auf der Stufe Chronicler an (nicht bei einem Chat, dessen Karten alle Assistenten sind). Schalte ihn im Overview des World-Sheets aus, wenn du ihn nicht willst.

## Was er pro Zug tut

Er läuft nach Antworten, bei jeder N-ten Antwort („Run after every N replies“) oder sofort mit „World turn“. Er liest die neuen Nachrichten und schreibt oder zieht Einträge im Weltbuch zurück: Personen, Orte, Dinge und wer sie hält. Du kannst einem Group- oder Place-Eintrag im Tab World book **Members** geben (die Personen, die dazugehören); ein Fakt, der dieser Gruppe in Litopys erzählt wird, ist dann jedem Mitglied bekannt ([[litopys]]). Der DM füllt Members nicht selbst aus. Ab Living world bewegt er außerdem Fronten und Uhren und kann ein Ereignis vorbereiten, das der nächsten Antwort hinzugefügt wird. Optionale Würfel (World-Sheet, Dice, ab Living world, standardmäßig aus): Vor einer Antwort würfelt Code 2W6 und sagt dem Modell, wie eine unsichere Handlung ausgeht, als Hint oder Binding.

Er kostet einen zusätzlichen Modellaufruf, wann immer er fällig ist, auf dem „DM model (all chats)“; ein kleines, günstiges Modell genügt. Ein fehlgeschlagener Lauf wird im Sheet und in der Inbox gezeigt, und der DM liest dieselben Nachrichten beim nächsten Mal erneut.

## Eine Antwort löschen oder swipen

Lösche eine Antwort oder swipe zu einer anderen, und der DM nimmt zurück, was er aus der alten gelernt hat: Einträge, Uhren und ein wartendes Ereignis kehren in ihren früheren Zustand zurück, das Weltbuch wird neu geschrieben, und der DM liest die Geschichte von dort an erneut.

Von dir geänderte Einträge bleiben, außer der DM hat denselben Eintrag danach geändert. Ein von dir gelöschter Eintrag bleibt gelöscht. Das Löschen alter Nachrichten von oben, das Lesen anderer Swipes einer älteren Antwort und das Bearbeiten des Antworttexts nehmen nichts zurück.

## Tabs des World-Bereichs

Das Zahnrad neben der Überschrift der World-Liste öffnet die **World settings**, in klappbaren Blöcken wie die Litopys settings: das Spielmodell (mit einem Schalter, um es für diese World zu überschreiben, das Antwortlimit und einen Testbutton), das Build-Modell, das Bildmodell, den Schalter für die Hintergründe und ob du über Fehler informiert wirst. Ein zugeklappter Block zeigt in einer Zeile, was eingestellt ist.

Beim gewählten Chat: Overview (dieselben Steuerungen wie das Sheet), Places (ein Baum von Orten, mit einem Hintergrundbild pro Ort), World book (Einträge von Hand lesen, schreiben, zurückziehen oder löschen), Runs (Verlauf, Tokens, Fehler), Start (Einträge aus Karten oder einem kurzen Interview entwerfen), Backgrounds (eine Reihe von Bildern planen und zeichnen; mit „Change the background by scene“ an wählt das Dashboard das passende; mit zusätzlich eingeschaltetem „Draw places that have no picture“ (es steht dort immer, ausgegraut, bis Szenenwechsel und Bilderzeugung an sind) wird ein Ort, zu dem die Geschichte wechselt und der kein Bild hat, sofort vom Bildmodell der Welt gezeichnet und im Ordner abgelegt; „Look of the pictures“ dort nimmt ein paar englische Wörter (zum Beispiel `medieval fantasy, candlelight`), die jedem Hintergrund hinzugefügt werden, der für den Chat gezeichnet wird, einem sofort gezeichneten Ort oder einem Set; das Display-Blatt des Chats hat dort einen Link). Außerdem **Profiles** und **Worlds**.

## Weltprofile

Jede Stufe ist ein eingebautes Profil: Die fünf enthalten die Prompts des DM, und du kannst eines öffnen, einen Promptblock ändern und auf den Standard zurücksetzen. Du kannst auch eigene Profile auf einer Stufe erstellen. Ein Chat wählt sein Profil im DM-Sheet. „Saved worlds“ enthält Welten, die du gebaut hast und in denen du neue Chats startest; „New world“ baut eine Welt vor jedem Chat, aus Karten oder einem kurzen Interview.

Verwandtes: [[memory]], [[dashboard]]. Die Hilfeartikel *World profiles* und *Starting a world* zeigen die Bildschirme.
