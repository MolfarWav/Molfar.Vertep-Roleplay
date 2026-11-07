<!-- source: a93fd36e3690 -->
# Charaktere, Personas und Gruppen

Alles, womit du spielst, lebt in vier Bereichen: Characters, Groups, Personas und Marketplace. Diese Seite sagt, wofür jeder gedacht ist; die Hilfeartikel *Your characters*, *The card editor tabs* und *Groups of characters* enthalten die Einzelheiten.

## Karten

Eine Karte ist ein Charakter: Beschreibung, Persönlichkeit, Szenario und eine erste Nachricht. Ein Tag `group: Guild of Ravens` oder `faction: Guild of Ravens` setzt außerdem den Charakter der Karte in diese Gruppe, sodass ein Gedächtnisfakt, der der Gruppe erzählt wird, ihnen bekannt ist ([[litopys]]). Der Bereich Characters zeigt deine Karten als Raster oder Liste, mit Suche, Tags, Ordnern, Favoriten (ein Stern) und mehreren Sortierungen. Öffne eine Karte, um sie zu bearbeiten. Änderungen bleiben in einem Entwurf, bis du „Save changes“ drückst; beim Verlassen mit ungespeicherten Änderungen wird zuerst gefragt.

Der Editor hat sechs Tabs:

- **Core**: der Kartentext, Dialog und Begrüßung.
- **Profile**: dieselbe Beschreibung, aufgeteilt in strukturierte Felder (Identität, Aussehen, Ziele). Jedes Speichern schreibt sie zurück in den Kartentext. Eine Erzählerkarte kann hier eine ganze Besetzung beschreiben.
- **Soul**: wie der Charakter auf dich reagiert, plus Gewohnheiten. Siehe [[soul]].
- **Memory**: abgeschlossene Chats, an die sich der Charakter erinnert. Siehe [[memory]].
- **Lorebook**: Bücher, die mit dieser Karte verknüpft sind.
- **More**: Farben und Stimmen, Sprites, Galerie, Regex, erweiterte Einstellungen.

Eine Karte kann mehrere Charaktere gleichzeitig spielen (ein Erzähler oder Spielleiter). Unter Colors gibt „Voices“ jedem Sprecher eine eigene Farbe. Wenn du keine Stimmen angibst, übernimmt das der Chat: Eine Karte, die mehrere Charaktere enthält (Abschnitte, die nach jedem benannt sind), färbt die Zeilen jedes Charakters selbst, jeweils in einer anderen Farbe, und das bleibt beim Chat gespeichert. In jedem anderen Chat öffnest du das Chat-Menü, „Voice colors“, und schaltest den Schalter ein; „Spread colors“ gibt allen, die du nicht gewählt hast, eine andere Farbe. Dafür wird das Relationship-Dashboard gebraucht, das die Liste der Charaktere liefert.

## Briefe von Karten

Eine Karte, die du eine Weile nicht gespielt hast, kann dir in ihrer eigenen Stimme eine kurze Nachricht schreiben. Die Nachricht landet in der Inbox (Homes „Waiting on you“, der Inbox-Button in der Rail) als grüner Brief; wenn du ihn öffnest, gehst du zum alten Chat, oder es startet ein Chat für eine Karte, die du nie gespielt hast. Ein Brief schreibt nie in einen Chat und erfindet nie Ereignisse.

Er ist **aus, bis du ihn einschaltest**. Solange er aus ist, steht oben im Bereich Characters und in Homes „Waiting on you“ eine grüne Karte „Let your characters write to you“: **Turn on** schaltet ihn sofort ein, **Not now** blendet die Karte endgültig aus. Die Zahlen (Leerlauftage, Briefe pro Tag, Tage zwischen Briefen einer Karte, das schreibende Modell) und die Karten, die du beendet hast, stehen in Characters, More, „Letters from cards“. Briefe werden alle paar Stunden geprüft, solange die App offen ist: ein Chat, der 14 Tage ruht, eine Karte, die du 14 Tage nicht gespielt hast, und eine gespielte Karte ohne Soul (einmal).

## Personas

Eine Persona bist du: Name, Pronomen, Beschreibung, Avatar. Das Modell sieht sie überall, wo der Prompt vom Benutzer spricht. „Use this persona“ macht sie zu deiner Standard-Persona und stellt den offenen Chat auf sie um. Eine Persona kann eigene Lorebooks tragen und lässt sich auf gewählte Charaktere festlegen, sodass neue Chats mit ihnen mit ihr starten.

## Gruppen

Eine Gruppe bringt mehrere Charaktere in einen Chat. „New group“ lässt dich Mitglieder wählen. Der Editor hat Overview, Members, Scene, Turns, Lore und Chats. Der Turns-Tab entscheidet, wer antwortet: Narrator (eine Antwort lässt alle sprechen) oder Each in turn. Eine neue Gruppe startet als Narrator. Eine Gruppe ist keine Karte: Das Löschen einer Gruppe löscht ihre Chats, niemals ihre Mitglieder. Mitglieder ohne eigene Farbe bekommen automatisch verschiedene Farben.

## Karten bekommen

- „Import card“ akzeptiert PNG- oder JSON-Dateien, eine oder viele, und verlinkt auf Chub, RisuRealm, CharaVault, Botbooru oder eine direkte Datei.
- Der Marketplace durchsucht mehrere Quellen gleichzeitig; öffne ein Ergebnis, um die vollständige Karte vor dem Import zu lesen. Jede Quelle hat ihre eigene Sortierreihenfolge und ihren eigenen Erwachsenenfilter, und manche erfordern einen manuellen Download.
- Export schreibt eine PNG mit der Karte darin.
- „With Molfar“ auf Home (und in Lorebooks) bittet Molfar, mit dir eine Karte oder ein Lorebook zu entwerfen. Siehe [[vertep:molfar]].

## Porträts für Karten ohne Bild

Eine Karte ohne eigenes Bild (keins oder der Standard-Avatar) kann gezeichnet werden. **Eine Karte:** Im Karteneditor öffnet „Draw“ unter dem Porträt einen Dialog: Wähle das Bildmodell; ein Textmodell (das Modell „Card tasks“) schreibt eine Beschreibung der Karte, die du bearbeiten kannst, und das Bildmodell zeichnet sie. Das Bild geht sofort in die Galerie der Karte, und „Use as portrait“ macht es zum Avatar. **Viele Karten:** In Characters, More, öffnet „Draw missing portraits (N)“ die Abfrage des Modells, danach werden sie nacheinander über die Fortschrittskarte gezeichnet; Cancel hält zwischen zwei Karten an, und eine Karte, die scheitert, wird mit dem Grund aufgelistet.

„Draw with“ listet die Bildmodelle aus Settings > Images: ein lokales ComfyUI oder Forge neben API-Modellen. Die erste Wahl ist das eigene Bildmodell der App (Extensions > Image generation); eine Wahl hier wird nur für Porträts gemerkt. Ein mit Tags trainiertes Modell bekommt eine Zeile Tags, ein API-Modell einen Absatz. Eine Karte mit nur einem Namen hat nichts, was man beschreiben könnte, und der Dialog sagt das. Bilderzeugung muss eingeschaltet sein (Extensions); die Dialoge sagen es und öffnen sie für dich.

## Was eine Karte nicht enthält

Der Dashboard-Zustand, Kapitel und Fakten gehören zu jedem Chat, nicht zur Karte. Auch das Kartengedächtnis ist kein Teil der Karte und erscheint nie in einem Export. Die Soul dagegen wird in der Karte gespeichert.

Weiter: [[first-story]] für den ersten Chat oder [[soul]] für das Reaktionsprofil.
