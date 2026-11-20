<!-- source: 4799ca6e92d8 -->
# Mehrere Karten und eine Karte zeichnen

Ein Chat kann mehr als eine Karte auf der Ortskarte haben (ein Land, eine Stadt, ein Dungeon), und jede Karte kann ein Bild bekommen, das vom Bildmodell gemalt wird. Diese Seite ist für alle, die in einer Welt mit mehr als einem Maßstab spielen. Die Grundlagen der Karte stehen auf [[places-map]].

## Mehrere Karten

Ein Chat kann mehr als eine Karte haben: ein Land, einen Stadtplan, ein Dungeon. Jede hat ihr eigenes Bild, ihre Orte, Straßen und ihren Maßstab. Öffne das Zahnradmenü und wähle **Karten dieses Chats**: die erste Karte wird aufgelistet, **Eine Karte hinzufügen** erstellt eine weitere. Für jede Karte legst du fest:

- **Name.**
- **Maßstab:** Stadt (ein Weg dauert Minuten: Straßen, ein Gebäude, eine Dungeon-Ebene), Region (Stunden: Dörfer, Wälder und Straßen dazwischen) oder Welt (Tage: Städte und Länder weit auseinander). Der Maßstab bestimmt, wie lange ein Weg auf dieser Karte dauert und welche Reiseweisen angeboten werden: zu Fuß, reitend und die Straße überspringen überall, ein Taxi auf Stadt- und Regionskarten, die U-Bahn auf Stadtkarten.
- **Plan von:** der Ort, dessen Plan diese Karte ist (die Karte einer Stadt ist der Plan dieser Stadt), oder keiner.

Sobald es mehrere Karten gibt, zeigt eine Zeile unter der Kopfzeile die Karte, die du gerade ansiehst, mit einem Pfeil: drücke ihn, um zu wechseln oder die Liste erneut zu öffnen. Die Karte, die du ansiehst, wird pro Chat in diesem Browser gemerkt. Eine Karte, die der Plan eines Ortes ist, zeigt einen Zurück-Pfeil zur Karte, die diesen Ort enthält.

**Ein Ort steht nur auf den Karten, auf die du ihn setzt.** **Orte auf dieser Karte** (Zahnradmenü) listet jeden Ort mit einem Häkchen auf: setze ein Häkchen, um einen Ort auf dieser Karte anzuzeigen, entferne es, um ihn nur von dieser Karte zu nehmen (seine Räume gehen mit; ein Ort auf keiner Karte geht zurück auf die Karte, auf der die Geschichte spielt). Ein neuer Ort, den der DM hinzufügt, geht auf die Karte, auf der die Geschichte spielt; eine neue Stadt, ein Dorf oder Schloss geht auch auf die Regions- und Weltkarten. Eine neue Regions- oder Weltkarte beginnt mit den Städten, Dörfern und Schlössern, die du bereits hast. Eine neue Stadtkarte beginnt leer und sagt das auch, mit einer Schaltfläche für dieselbe Liste.

**Ein Ort, der eine eigene Karte hat**, bekommt eine Schaltfläche **Die Karte dieses Ortes öffnen** auf seiner Karte; **Eine Karte dieses Ortes erstellen** in seinem Drei-Punkte-Menü erstellt eine leere Karte, die sein Plan ist, und öffnet sie. Ein Ort, den du von der Karte des Landes aus öffnest, ist derselbe Ort wie auf der Karte der Stadt; der Ort der Geschichte auf der Landkarte ist die Stadt, deren Plan ihn enthält (während die Geschichte in der Taverne der Stadt spielt, markiert die Landkarte die Stadt).

Eine Straße wird auf der Karte geführt, die beide ihre Orte hat. Reisen findet innerhalb einer Karte statt: auf der Weltkarte gehst du von Stadt zu Stadt und die Geschichte kommt in der Stadt selbst an; um in eine Taverne darin zu gehen, öffne die Karte der Stadt (der Zurück-Pfeil und die Öffnen-Schaltfläche wechseln zwischen ihnen) und gehe von dort aus.

Das Bild einer Karte wird wie jedes andere gewählt (eine fertige Karte, deine eigene, keines oder gezeichnet): eine Regions- oder Weltkarte beginnt mit einem Regionsplan, egal welche Orte es sind, eine Stadtkarte mit dem Plan, der zu ihren Orten passt.

## Eine Karte zeichnen

**Eine Karte mit dem Bildmodell zeichnen** (Zahnradmenü) malt ein Bild für die Karte, die du gerade ansiehst, mit dem Bildmodell, das du in Einstellungen > Bilder gewählt hast. Das Fenster enthält:

- **Was für eine Karte:** Region, Kontinent, ummauerte Stadt, Hafenstadt, Dorf, Wildnis, Küste, Hausplan, Dungeon, Höhlen und die Arten der modernen Stadt (Innenstadt, Metropole, Vorort, Industriegebiet, Campus, Uferpromenade, Flughafen, Kleinstadt). Eine Regionskarte beginnt bei Region, eine Weltkarte bei Kontinent.
- **Was gezeichnet werden soll:** ein Prompt, der aus der Art und den Namen der Orte auf der Karte gefüllt wird. Er fragt nur nach dem Untergrund (Land, Wasser, Straßen, leere Grundstücke), weil deine Orte Symbole sind, die darüber gelegt werden. Ändere ihn, wie du möchtest; wählst du eine andere Art, wird er neu geschrieben, bis du ihn bearbeitet hast.
- Eine Zeile mit dem Bildmodell und einem Hinweis, dass jedes Bild ein Aufruf ist, der Geld kosten kann.

**Die Karte zeichnen** macht einen Aufruf und zeigt das Ergebnis im Fenster; noch hat sich nichts geändert. **Diese Karte verwenden** macht sie zum Bild dieser Karte (die anderen Karten behalten ihre), **Erneut zeichnen** geht zurück zum Prompt. Wenn kein Bildmodell eingerichtet ist, sagt der Aufruf das; füge eines in Einstellungen > Bilder hinzu.
