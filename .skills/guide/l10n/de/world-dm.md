<!-- source: 49357def2936 -->
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

Er läuft nach Antworten, bei jeder N-ten Antwort („Run after every N replies“) oder sofort mit „World turn“. Er liest die neuen Nachrichten und schreibt oder zieht Einträge im Weltbuch zurück: Personen, Orte, Dinge und wer sie hält. Du kannst einem Group- oder Place-Eintrag im Tab World book **Members** geben (die Personen, die dazugehören); ein Fakt, der dieser Gruppe in Litopys erzählt wird, ist dann jedem Mitglied bekannt ([[litopys]]). Der DM füllt Members nicht selbst aus. Ab Living world bewegt er außerdem Fronten und Uhren und kann ein Ereignis vorbereiten, das der nächsten Antwort hinzugefügt wird. Mit **Code**, das die Uhren bewegt (World > Profiles > Options), würfelt Code alle N Antworten für jede Front einen W6: 1-2 nichts, 3-4 ein Schritt, 5-6 ein Schritt, und der DM erfährt, dass Neuigkeiten dieser Front die Geschichte erreichen können. Optionale Würfel (World-Sheet, Dice, ab Living world, standardmäßig aus): Vor einer Antwort würfelt Code 2W6 und sagt dem Modell, wie eine unsichere Handlung ausgeht, als Hint oder Binding. Die Option **Pacing check, %** (Dice details, standardmäßig aus) fügt einen zweiten, verdeckten Wurf für die Momente hinzu, in denen der Charakter des Nutzers einen Schritt auf Nähe zu macht: Wie gut dieser ankommt, hängt von Komfort, Vertrauen und Zuneigung des Charakters aus dem Dashboard ab, und das Modell spielt es als noch nicht bereit, zögerlich, akzeptierend mit Nervosität oder willkommen. Er blockiert nie eine Antwort und nennt nie die Würfel.

Er kostet einen zusätzlichen Modellaufruf, wann immer er fällig ist, auf dem „DM model (all chats)“; ein kleines, günstiges Modell genügt. Ein fehlgeschlagener Lauf wird im Sheet und in der Inbox gezeigt, und der DM liest dieselben Nachrichten beim nächsten Mal erneut.

Der DM sieht jeden Eintrag mit seinem Namen, aber nur die Einträge, die die neuen Nachrichten berühren, vollständig: die, die sie nennen, den Ort der Szene und was dort liegt, die Personen in der Szene, angeheftete Einträge und Personen, die gleich zurückkehren. So bleibt ein Buch mit vielen Einträgen günstig. Der DM kann trotzdem jeden Eintrag ändern oder zurückziehen.

Ein Profil, das aus einem Ereignisstapel spielt, zeigt „New deck“, wenn der Stapel aufgebraucht ist. Das Modell wird um 8 bis 12 Ereignisse gebeten; kommen weniger zurück, bleibt der Stapel, wie er kam, und eine Warnung sagt, dass er zu kurz ausgefallen ist, damit du ihn erneut erstellen kannst.

## Menschen, die zurückkommen

Ein Freund oder Verwandter aus dem Lorebook einer Karte kann hundert Nachrichten lang aus der Geschichte fernbleiben, weil ein Eintrag nur auftaucht, wenn jemand den Namen sagt. Der DM bringt solche Personen zurück. Er zählt die Antworten, seit eine Person zuletzt in der Szene war (mit eingeschaltetem Dashboard ist ein Name im Text allein nur eine Erwähnung und setzt die Zählung nicht zurück; ein entfernter Freund, der schreibt oder anruft, zählt als in der Szene), und wenn das Schweigen lang ist (etwa 15, 30 oder 60 Antworten, je nach **People coming back > How often**; Normal ist der Standard für neue Chats), weist er das Schreibmodell nachdrücklich an, dass die Person in dieser Antwort auftritt. Ein verdeckter Wurf von 2d6 sowie die Länge des Schweigens und das Gewicht der Person entscheiden, wie groß die Rückkehr ausfällt: eine Nachricht, ein Anruf mit einer Bitte oder jemand, der mit Neuigkeiten eintrifft. Das Modell wählt die Form; der DM prüft, ob die Person erschienen ist, und fordert es notfalls erneut ein. Wenn das Schreibmodell die Person nur erwähnt, steht im Log „only mentioned, not on stage“, und es folgt kein zweiter Versuch; nach einer solchen mittleren oder großen Rückkehr kommt die nächste nach der halben üblichen Pause und ist mindestens mittel. Personen aus den Lorebooks von Karten kommen mit **Take people from the cards' lorebooks** auf die Bank oder über den Start-Schalter „People from the lorebooks“. Bei einem Personen- oder Fraktionseintrag können Sie Relation, Weight und „Bring back automatically“ festlegen. Um es in Aktion zu sehen, aktivieren Sie **Show under the reply**: Eine kleine Markierung zeigt, wer kam, warum und wie die Würfel fielen; die Karte führt außerdem die Bank mit dem jeweiligen Schweigen jeder Person und einem Verlauf der Rückkehren auf.

## Das Weltbuch und sein Aufräumen

Das World-Panel des Chats hat Kacheln für das, was der DM behält: **People**, **Places**, **Factions** und **Things**, dann das **Archive** sowie die **Fronts** und **Runs**. Drücke eine Kachel, um das Weltbuch bei diesem Typ zu öffnen (eine von Start vor der Geschichte gebaute Welt stellt die Spoiler-Frage noch einmal; ein gespielter Chat öffnet sofort). Das Buch ist eine Liste mit Suche über Namen, Schlüssel und Text, farbigen Chips pro Typ und Karten, deren Text sich einklappen lässt; Edit, Retire, Pin und Delete funktionieren wie vorher. Ein Ding kann einen **reason** haben (ein Hinweis, ein verborgenes Ding, ein Versprechen, ein Geschenk, eine Waffe, etwas, worum Leute streiten); der DM nennt ihn, wenn er das Ding einträgt, und du kannst ihn im Formular ändern.

Fakten sind keine Einträge mehr. Ein Brauch, ein Gesetz oder ein Stück Geschichte gehört in den Text des Ortes oder der Fraktion, die es beschreibt, und was die Leute wissen oder verbergen, gehört in die Litopys. Ein Buch mit noch alten Notizen zeigt ein Banner und eine Kachel **Old notes**; bei jeder Notiz wähle **Fold into…** einen Ort oder eine Fraktion (deren Text wächst um die Notiz) oder **To the Litopys** (ein Fakt, den alle kennen, bis zu 300 Zeichen).

Das Buch räumt sich auch selbst auf. Alle 10 Antworten wird ein Ding, das weniger als 3 der letzten 10 Antworten genannt haben, das niemandem gehört (nicht von deinem Charakter gehalten, nicht von einem Karten-Charakter oder einer Person im Buch, und nicht in der Hand eines Charakters im Dashboard), nicht gepinnt ist und kein Hinweis, kein verborgenes Ding und kein Versprechen ist, ins **Archive** verschoben, außerhalb der Sicht des Story-Modells. Es kommt zurück, wenn die Geschichte es zweimal nennt oder der DM es erneut nennt; du kannst auch **Wake** drücken. Die Karte **Tidying the book** hat den Schalter, **Tidy now** (ein Durchlauf sofort; der erste Durchlauf eines Chats übernimmt nur die Liste der Dinge) und einen Verlauf jeder Archivierung und jedes Weckens mit der Zahl, die den Ausschlag gab. Personen, Orte und Fraktionen werden nie weggeräumt. Ein Eintrag, den du löschst, schreibt der DM nicht erneut, und der DM erfährt, welche Namen du entfernt hast.

## Eine Antwort löschen oder swipen

Lösche eine Antwort oder swipe zu einer anderen, und der DM nimmt zurück, was er aus der alten gelernt hat: Einträge, Uhren und ein wartendes Ereignis kehren in ihren früheren Zustand zurück, das Weltbuch wird neu geschrieben, und der DM liest die Geschichte von dort an erneut.

Ein Ereignis ist einmalig. Der DM prüft, ob die Geschichte es gezeigt hat, und schaut sich alles nach der Antwort an, die es getragen hat, auch den Teil, den er schon gelesen hat. Wenn nicht, wird das Ereignis mit der nächsten Antwort noch einmal gesendet, es sei denn, die Geschichte ist inzwischen an einen anderen Ort gezogen (ein Zeitsprung, eine neue Szene): dann wird es losgelassen, damit ein altes Ereignis die Geschichte nicht zurückzieht.

Von dir geänderte Einträge bleiben, außer der DM hat denselben Eintrag danach geändert. Ein von dir gelöschter Eintrag bleibt gelöscht. Das Löschen alter Nachrichten von oben, das Lesen anderer Swipes einer älteren Antwort und das Bearbeiten des Antworttexts nehmen nichts zurück.

## Tabs des World-Bereichs

Das Zahnrad neben der Überschrift der World-Liste öffnet die **World settings**, in klappbaren Blöcken wie die Litopys settings: das Spielmodell (mit einem Schalter, um es für diese World zu überschreiben, das Antwortlimit und einen Testbutton), das Build-Modell, das Bildmodell, den Schalter für die Hintergründe und ob du über Fehler informiert wirst. Ein zugeklappter Block zeigt in einer Zeile, was eingestellt ist.

Beim gewählten Chat: Overview (dieselben Steuerungen wie das Sheet), Places (ein Baum von Orten, mit einem Hintergrundbild pro Ort), World book (Einträge von Hand lesen, schreiben, zurückziehen oder löschen), Runs (Verlauf, Tokens, Fehler), Start (Einträge aus Karten oder einem kurzen Interview entwerfen), Backgrounds (eine Reihe von Bildern planen und zeichnen; mit „Change the background by scene“ an wählt das Dashboard das passende; mit zusätzlich eingeschaltetem „Draw places that have no picture“ (es steht dort immer, ausgegraut, bis Szenenwechsel und Bilderzeugung an sind) wird ein Ort, zu dem die Geschichte wechselt und der kein Bild hat, sofort vom Bildmodell der Welt gezeichnet und im Ordner abgelegt; „Look of the pictures“ dort nimmt ein paar englische Wörter (zum Beispiel `medieval fantasy, candlelight`), die jedem Hintergrund hinzugefügt werden, der für den Chat gezeichnet wird, einem sofort gezeichneten Ort oder einem Set; das Display-Blatt des Chats hat dort einen Link). Außerdem **Profiles** und **Worlds**.

## Weltprofile

Jede Stufe ist ein eingebautes Profil: Die fünf enthalten die Prompts des DM, und du kannst eines öffnen, einen Promptblock ändern und auf den Standard zurücksetzen. Du kannst auch eigene Profile auf einer Stufe erstellen. Ein Chat wählt sein Profil im DM-Sheet. Neue Chats starten mit dem Chronicler, es sei denn, du drückst **Make default** bei einem anderen Profil (der Tab Profiles, in der Kopfzeile des Profils): Es bekommt ein *Default*-Tag und jeder neue Chat startet mit seiner Stufe, seinen Zahlen und Prompts; Chats, die du bereits hast, behalten ihre eigenen, und das DM-„off“ wird pro Chat gewählt und kann nicht der Standard sein. „Saved worlds“ enthält Welten, die du gebaut hast und in denen du neue Chats startest; „New world“ baut eine Welt vor jedem Chat, aus Karten oder einem kurzen Interview.

Verwandtes: [[memory]], [[dashboard]]. Die Hilfeartikel *World profiles* und *Starting a world* zeigen die Bildschirme.
