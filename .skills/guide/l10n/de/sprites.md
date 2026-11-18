<!-- source: f7cfe4722702 -->
# Sprites und Sprite-Fenster

Sprites sind kleine Bilder einer Figur, eines pro Emotion, die über dem Chat erscheinen und sich mit dem Verlauf der Geschichte ändern. Diese Seite ist für alle, die mehrere Figuren gleichzeitig sehen möchten, in einer Gruppe oder mit einer Erzählerkarte, oder die einen Visual-Novel-Look aufbauen wollen.

## Was ein Sprite-Fenster ist

Ein Sprite-Fenster schwebt über dem Chat und zeigt **eine Figur**. Das Bild wird anhand der letzten eigenen Zeilen dieser Figur gewählt (mit denselben Stichwortregeln wie bisher; es wird kein Modell aufgerufen), und es bleibt, bis die Figur wieder spricht. Ziehe ein Fenster an eine beliebige Stelle, ziehe seine untere Ecke, um die Größe zu ändern (Doppelklick auf die Ecke stellt die Standardgröße wieder her), und drücke **×**, um es zu einem kleinen runden Chip zusammenzuklappen; drücke auf den Chip, um es zurückzuholen.

Sprites fügst du einer Karte im Editor hinzu, im Tab **More**, unter **Sprites**. In den Einstellungen gibt es einen Schalter, "Expression Sprites", der alle Fenster ausschaltet.

## Ein Fenster oder mehrere

Ein neuer Chat hat ein Fenster, das wie immer **dem folgt, der gerade spricht**. Drücke das Zahnrad an einem Fenster, um **Sprite windows** zu öffnen:

- **Add window** (bis zu 8). Ein neues Fenster zeigt "Next in the scene".
- **Shows**, pro Fenster: "Whoever speaks", "Next in the scene" oder eine bestimmte Figur (ein Mitglied der Gruppe oder eine Stimme einer Erzählerkarte).
- **Transparent background**, pro Fenster: kein Rahmen und kein Hintergrund, nur das Bild. Klicks gehen durch das Fenster hindurch zum Chattext, deshalb wird ein solches Fenster am kleinen Griff in seiner oberen linken Ecke verschoben.
- **Visible part**: ein Regler von 35 % bis 100 % (standardmäßig 100 %). Weniger als 100 % zeigt nur den oberen Teil jedes Bildes, die Beine werden also abgeschnitten (Halbfigur, bei 40 % nur Büste); die Höhe eines Fensters ist dann der sichtbare Teil, und das Bild wird dafür größer gezeichnet. Zusammen mit dem Streifen unter dem Text ergibt das den Visual-Novel-Look und lässt dem Chat den größten Teil seiner Höhe.
- **Windows are**: "In front of the text" (Standard), "Behind the text" (der Chattext wird über den Bildern gezeichnet, die darunter bleiben; jede Nachricht bekommt einen Hintergrund in der Seitenfarbe, damit sie lesbar bleibt, und der Regler **Text backing** stellt dessen Stärke von 0 % bis 100 % ein, standardmäßig 55 %; die Schaltflächen eines Fensters werden blass und das Fenster wird an seinem Griff verschoben) oder "In a strip under the text" (der Chat behält unter seinem Text einen Streifen für die Fenster, sodass nie Text unter einem Bild liegt; die Fenster bleiben dann unten und lassen sich nur seitwärts verschieben, und der Streifen ist so hoch wie das höchste Fenster). Das gilt für Tablets und Computer; ein Smartphone hält sie im Vordergrund.
- **Arrange**: "Row at the bottom" (der Visual-Novel-Look) oder "Grid". Sie ordnen die Fenster nur an; von dort aus ziehst du sie selbst.
- **Hide empty windows**.
- **Back to one window**.

Das Layout wird **pro Chat in diesem Browser** gespeichert. Es wandert nicht auf ein anderes Gerät.

## Wer "in der Szene" ist

Fenster mit "Next in the scene" zeigen die Personen der Szene außer der sprechenden, und eine Figur **behält ihr Fenster**, solange sie bleibt: Niemand springt in ein anderes Fenster, wenn jemand anderes spricht. Verlässt eine Figur die Szene, wird ihr Fenster leer ("Nobody here") oder verschwindet, wenn "Hide empty windows" an ist, und der nächste Neuankömmling nimmt ein freies Fenster.

Die Szene ist die Liste "Present" im Dashboard, wenn das Dashboard die Geschichte gelesen hat (siehe [[dashboard]]). Ohne es besteht die Szene aus allen, die in den letzten sechs Nachrichten gesprochen haben.

## Outfits

Eine Figur mit mehr als einem Outfit bekommt am Fenster einen kleinen Outfit-Schalter. Die Wahl wird für den Chat gemerkt und gilt für jedes Gruppenmitglied getrennt.

## Auf dem Smartphone

Ein Smartphone zeigt **ein Fenster**; die anderen Personen der Szene sind kleine runde Bilder unten links. Tippe auf eines, um diese Figur im Fenster zu zeigen, tippe erneut, um wieder dem Sprechenden zu folgen. Transparente Fenster, Anordnen und zusätzliche Fenster gibt es nur auf Tablets und Computern.

## Was es nicht tut

Es zeichnet nichts und liest die Geschichte nicht mit einem Modell: Eine Figur ohne Sprites hat kein Fenster, und eine Figur, die nie gesprochen hat, zeigt ihr Standardbild. Ein Gruppenmitglied ohne Sprites wird übersprungen.
