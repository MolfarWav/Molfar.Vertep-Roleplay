<!-- source: b1f6a72c1291 -->
# Die Orte-Karte

Die Orte-Karte ist eine kleine schwebende Karte über dem Chat. Sie zeigt jeden Ort, den die Geschichte genannt hat, die Wege, die die Geschichte zwischen ihnen gegangen ist, und wo du dich gerade befindest. Sie ist für alle, die mit dem World DM spielen und die Welt sehen möchten, in der sie sich befinden. Sie kostet keine Modellaufrufe.

## Wo sie ist

Ein Chat zeigt einen runden Karten-Button unten links in der Chat-Spalte, wenn das Weltbuch des Chats mindestens einen Ort enthält (siehe [[world-dm]]). Drücke ihn, um die Karte zu öffnen; drücke **×** auf der Karte, um sie wieder zum Button einzuklappen. Du kannst den Button und das Fenster überallhin ziehen und die untere Ecke ziehen, um das Fenster zu vergrößern (Doppelklick auf die Ecke für die Standardgröße). Das Fenster bleibt, wo du es gelassen hast, pro Chat, in diesem Browser. In den Einstellungen gibt es einen Schalter, "Places Map", der den Button überall ausblendet.

Eine Welt, die vor der Geschichte erbaut wurde (aus Karten, einem Rezept oder der Bibliothek), kann Orte enthalten, die die Geschichte dir noch nicht gezeigt hat, daher stellt die Karte dieselbe Frage wie der World-Abschnitt, bevor sie sie zeigt.

Auf einem Telefon ist die geöffnete Karte ein Panel, das auf dem Nachrichtenfeld steht. Solange es offen ist, treten das Sprite-Fenster und die Zeile der Charaktere beiseite; während du tippst, tritt auch die Karte beiseite und kommt zurück, wenn das Feld leer ist.

## Was darauf ist

- **Ein gepunktetes Brett.** Ziehe das leere Brett, um zu schwenken, pinch oder nutze das Mausrad zum Zoomen, **+**, **−** und den Ecken-Button (Show all places) in der Kopfzeile. Orte behalten ihre Größe auf dem Bildschirm; weit draußen schrumpfen sie und verlieren ihre Namen, außer dem, in dem du dich befindest, und dem, den du ausgewählt hast.
- **Ein Ort** ist ein kleines gemaltes Bild mit seinem Namen darunter. Die drei Punkte auf seiner Karte ("More for this place") öffnen ein Menü mit "Change the icon of this place", das es von Hand ändert: Der Dialog bietet "Automatic" (das, was der Name sagt) und jede Art des Icon-Sets mit all seinen Bildern; wähle eines und es bleibt auf diesem Ort. Automatic nimmt die Auswahl wieder weg. Die Auswahlen gehören zum Chat. Das Bild kommt vom Namen des Ortes (eine Taverne, eine Schmiede, ein Wald, eine Küche...); ein Ort, dessen Name nichts sagt, bekommt eine Messingnadel. Jede Art hat mehrere Bilder (meist vier) und ein Ort behält das, das er bekommen hat, sodass zwei Tavernen unterschiedlich aussehen können. Es gibt Fantasy-Arten (eine Taverne, eine Schmiede, eine Burg, eine Höhle...) und die der modernen Stadt (ein Krankenhaus, eine Polizeistation, ein Café, ein Wolkenkratzer, ein Metro-Eingang, eine Tankstelle, ein Postamt, ein Kino, eine Karaoke-Bar, eine Spielhalle und mehr). Wenn die Engine älter ist und keine Bilder hat, steht ein rundes Emoji an ihrer Stelle. Der Ort, in dem die Geschichte gerade ist, hat einen Ring und einen Punkt. Ein Ort, den die Geschichte nie besucht hat, ist etwas dunkler.
- **Räume und Ecken** eines Ortes (die "spots" des World DM) sind kleiner und stehen um den Ort herum, in dem sie sich befinden, mit einer dünnen Linie zu ihm. Ziehe einen Ort und seine Räume gehen mit; ziehe einen Raum und nur der Raum bewegt sich.
- **Wege** sind gestrichelte Linien zwischen zwei Orten, zwischen denen die Geschichte sich bewegt hat. Ein Weg erscheint von selbst, wenn die Geschichte zum ersten Mal von einem Ort zum anderen geht; die Bewegung zwischen Räumen eines Ortes ist keine Reise. Wege des Ortes, den du auswählst, werden stärker gezeichnet.
  Die Karte erfährt, wo die Geschichte ist, aus der Ortszeile des Dashboard, abgeglichen nach Namen mit einem Ort des Weltbuchs. Wenn diese Zeile einen Ort nennt, der nicht im Buch ist, sagt eine Zeile unter der Kopfzeile es ("The story is at ... which is not one of the places"), kein Ort wird als deiner markiert und kein Weg wird gezeichnet, bis die Geschichte einen Ort erreicht, den das Buch hat. Füge den Ort im World-Abschnitt hinzu (oder gib einem bestehenden den Namen, den die Geschichte dort verwendet). Ein Weg wird nur für Bewegungen gezeichnet, die die Karte gesehen hat: Sie liest die Vergangenheit der Geschichte nicht nach.
  **Zeichne einen Weg von Hand:** Wähle einen Ort, wähle "Draw a road from this place" im Drei-Punkte-Menü seiner Karte, dann tippe einen anderen Ort an: Ein Weg verbindet sie. Tippe einen Ort an, zu dem bereits ein Weg führt, und der Weg wird entfernt. Das Antippen eines Raums oder einer leeren Stelle bricht nur ab. Nur ganze Orte können verbunden werden, keine Räume. Von Hand gezeichnete Wege werden wie die von der Geschichte gezeichneten behalten.
- **Tippe einen Ort an**, um seine Karte unten zu sehen: den vollen Namen (der Name unter dem Icon ist abgeschnitten, die Karte nicht, und das Halten des Zeigers über einem Namen zeigt ihn ganz), "You are here", was sich darin befindet, wie oft die Geschichte ihn besucht hat, und das Bild, das im World-Abschnitt an ihn gebunden ist, wenn es eines gibt.
- **Benenne einen Ort auf der Karte um** über das Drei-Punkte-Menü der Karte. Es ändert nur, was die Karte zeigt: Das Weltbuch, das Dashboard und die Geschichte behalten den eigenen Namen des Ortes, sodass nichts, was nach dem Ort geht (seine Räume, seine Wege, späteres Reisen per Tipp), betroffen ist. Die Karte sagt dann auch "In the book: ...". Speichere einen leeren Namen, um den Namen des Buchs zurückzusetzen. Die Art des Icons wird aus beiden Namen gelesen.

## Wo die Orte stehen

Neue Orte werden von der App platziert, nicht von einem Modell: der erste in der Mitte, die nächsten neben dem Ort, von dem die Geschichte kam, Räume um ihren Ort herum. Ziehe jeden Ort dorthin, wo du ihn haben willst; die App bewegt einen von dir platzierten Ort nie. Die Positionen, die Wege und das Kartenbild gehören zum Chat, nicht zum Browser.

- **Das Schloss** (das Vorhängeschloss in der Kopfzeile) hält die Orte dort, wo sie sind: Ein Ziehen, das auf einem Ort beginnt, bewegt stattdessen die Karte, ein Tipp wählt den Ort weiterhin aus. Es ist für ein Telefon gedacht, wo ein Finger, der die Karte schwenkt, ständig Icons verschiebt. Es wird pro Chat in diesem Browser behalten, sodass ein Telefon gesperrt sein kann, während der Desktop es nicht ist.

Das Zahnrad in der Kopfzeile öffnet:

- **Das Bild unter den Orten** (siehe "Fertige Karten" unten): Lade dein eigenes hoch, wähle eine fertige Karte oder wechsle zum gepunkteten Raster. Eine Änderung behält, wo die Orte stehen; ziehe dann die Orte darauf.
- **Arrange the places again** setzt jeden Ort auf das automatische Layout zurück (es fragt zuerst). Die Wege bleiben.

## Reisen per Tipp

Wähle einen Ort, in dem die Geschichte nicht ist, und drücke den Pfeil auf seiner Karte (neben den drei Punkten) ("Go to this place"). Ein kleines Fenster öffnet sich:

- **How:** zu Fuß, reitend oder die Straße überspringen. Reiten dauert 0,4 der Gehzeit; das Überspringen der Straße bittet die Antwort um höchstens eine Zeile.
- **Minutes:** berechnet aus der Entfernung zwischen den beiden Orten auf dem Brett (10 Brett-Einheiten pro Minute, auf 5 gerundet), und deine zum Ändern. Sie werden auf dem Weg behalten, sodass die nächste Reise zwischen denselben zwei Orten von ihnen ausgeht. **Ask the model** (neben den Minuten) macht einen Aufruf auf dem Modell des World DM: Es liest, was das Buch über die beiden Orte und die Entfernung sagt, und gibt die Gehzeit, die das Feld füllt. Es kostet einen kleinen Aufruf, nur wenn du ihn drückst, und es ist aus, während der World DM aus ist.
- **Road name:** optional. Wird auf dem Weg behalten; die nächste Reise sagt der Antwort, sich an diesen Weg zu halten, sodass dieselbe Straße wieder gegangen wird. Leer gelassen erfindet die Antwort einen kurzen Namen. Wenn der Weg keinen hat und der World DM an ist, liest ein kleiner Aufruf auf seinem Modell die Antwort nach der Reise und eine Zeile erscheint unter der Kopfzeile: "The reply called this road ..." mit **Keep**. Keep setzt den Namen auf den Weg; ignoriere es und nichts ändert sich. Nichts wird gelesen, wenn du den Weg bereits benannt hast.
- **Road event** (aus, bis du es einschaltest, pro Chat in diesem Browser gemerkt): Wenn der DM bereits ein Ereignis hält, spielt dieses auf der Straße. Andernfalls wird ein gesäter Würfel gegen die von dir eingestellte Chance geworfen (25 % zum Start): Das Fenster zeigt den Wurf, bevor du sendest, und bei einem Treffer nennt es eine kleine Art von Ereignis (ein Fremder, ein Hindernis, das Wetter, ein Fund, ein Gefühl, beobachtet zu werden, ein Reisender in Not, ein Gerücht, ein Warnschild), das die Antwort ausfüllt. Derselbe Wurf zeigt sich, wenn du das Fenster erneut öffnest, und er ist im Instruktions-Chip auf deiner Nachricht.
- **Your move:** die Zeile, die in den Chat geht, standardmäßig "I head to ...", deine zum Umschreiben.

**Go** sendet deine Bewegung mit einer versteckten Instruktion für genau diese eine Antwort: woher, wohin, wie, ungefähr wie lange, den Weg in ein paar Zeilen zu erzählen und dann die Ankunft, und die neue Tageszeit zu zeigen. Es kostet die Antwort und nichts mehr. Die Uhr des Dashboard wird von der Karte nicht bewegt: Sie folgt der Antwort, wie nach Skip time, sodass eine verworfene Antwort die Zeit mit sich zurücknimmt. Die Instruktion zeigt sich als Chip auf deiner Nachricht. Auf einem Telefon klappt die Karte nach Go ein, damit du die Antwort lesen kannst.

Wenn die Karte nicht weiß, wo die Geschichte ist (die Zeile unter der Kopfzeile sagt es), hat die Reise keinen Weg und keine Zeit: nur die Bewegung und die Ankunft. Ein Raum des Ortes, in dem die Geschichte ist, ist eine Bewegung innerhalb von ihm, ebenfalls ohne Zeit.

## Fertige Karten und das Bild unter den Orten

Eine Karte ohne Auswahl ist nicht kahl: Die App zeigt einen fertigen, gemalten Plan, der zu den Orten passt (ein Hausplan für Räume, Höhlen für Keller und Verliese, eine Küste für das Meer, eine ummauerte Stadt oder ein Dorf für Straßen und Läden, die Wildnis für Wälder und Flüsse, sonst eine Region; ein moderner Plan, wie ein Stadtzentrum, ein Vorort, ein Industrieviertel, ein Flughafen oder ein Campus, wenn die Orte einer modernen Stadt gehören: ein Krankenhaus, eine Polizeistation, ein Kino, eine Bank...). Der Plan wird per Code aus den Namen gewählt, immer derselbe für einen Chat, und kostet nichts.

Das Zahnrad-Menü hat den Rest:
- **Choose a ready map** öffnet die Galerie der Packs der Engine nach Art (Region, Wilderness, Coast, Walled town, Village, Harbour town, House plan, Caves; Downtown, Suburb, Industrial district, Campus, Waterfront, Old town, Airport, Metropolis, City park, Small town), je vier Karten. Wähle eine und sie bleibt auf diesem Chat.
- **Upload a map picture** legt dein eigenes unter die Orte, in das Brett eingepasst mit beibehaltenem Seitenverhältnis.
- **No picture (the dotted grid)** nimmt das Bild weg; das Menü bietet dann **Use the automatic map again**.

Die Orte zu bewegen oder das Bild zu ändern bewegt nie eines in das andere: Die Orte behalten, wo du sie hingesetzt hast.

## Was sie nicht tut

Sie zeichnet die Welt nicht und erfindet keine Orte (das tut der World DM, siehe [[world-dm]]). Orte, die der DM zurückgezogen hat, verlassen die Karte.
