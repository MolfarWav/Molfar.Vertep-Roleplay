<!-- source: 63580e32deab -->
# Charaktere, Personas und Gruppen

Alles, womit du spielst, lebt in vier Bereichen: Characters, Groups, Personas und Marketplace. Diese Seite erklärt, wofür jeder da ist; die Hilfeartikel *Your characters*, *The card editor tabs* und *Groups of characters* enthalten die Details.

## Karten

Eine Karte ist ein Charakter: Beschreibung, Persönlichkeit, Szenario und eine erste Nachricht. Ein Tag wie `group: Guild of Ravens` oder `faction: Guild of Ravens` ordnet den Charakter der Karte auch dieser Gruppe zu, sodass ein der Gruppe mitgeteiltes Erinnerungsfaktum ihnen bekannt ist ([[litopys]]). Der Bereich Characters zeigt deine Karten als Raster oder Liste, mit Suche, Tags, Ordnern, Favoriten (ein Stern) und mehreren Sortierungen. Öffne eine Karte, um sie zu bearbeiten. Änderungen bleiben in einem Entwurf, bis du auf "Save changes" klickst; beim Verlassen mit ungespeicherten Änderungen wirst du zuerst gefragt.

Der Editor hat sechs Tabs:

- **Core**: der Kartentext, Dialog und Begrüßung.
- **Profile**: dieselbe Beschreibung, aufgeteilt in strukturierte Felder (Identität, Aussehen, Ziele). Jedes Speichern schreibt sie zurück in den Kartentext. Eine Erzählerkarte kann hier eine ganze Besetzung beschreiben.
- **Soul**: wie der Charakter auf dich reagiert, plus Gewohnheiten. Siehe [[soul]].
- **Memory**: abgeschlossene Chats, an die sich der Charakter erinnert. Siehe [[memory]].
- **Lorebook**: Bücher, die mit dieser Karte verknüpft sind.
- **More**: Farben und Stimmen, Sprites (siehe [[sprites]]), Galerie, Regex, erweiterte Einstellungen.

Eine Karte kann mehrere Charaktere gleichzeitig spielen (ein Erzähler oder Spielleiter). Unter Colors gibt "Voices" jedem Sprecher seine eigene Farbe. Wenn du keine Voices auflistest, erledigt der Chat das für dich: Eine Karte, die mehrere Charaktere enthält (Abschnitte nach jedem benannt), färbt die Zeilen jedes Charakters von selbst ein, jeweils mit einer anderen Farbe, die beim Chat gespeichert bleibt. In jedem anderen Chat öffne das Chat-Menü, "Voice colors", und schalte den Schalter ein; "Spread colors" gibt jedem, den du nicht ausgewählt hast, eine andere Farbe. Dafür braucht es das Relationship-Dashboard, das die Liste der Charaktere liefert.

## Personas

Eine Persona bist du: Name, Pronomen, Beschreibung, Avatar. Das Modell sieht sie überall, wo der Prompt vom Benutzer spricht. "Use this persona" macht sie zu deiner Standardpersona und wechselt den offenen Chat auf sie. Eine Persona kann eigene Lorebooks mitführen und an ausgewählte Charaktere gebunden werden, sodass neue Chats mit ihnen mit ihr beginnen. Der Tab Lorebooks einer Persona listet die Bücher auf, die sie mitführt (öffne eines, hebe die Verknüpfung auf, füge weitere aus einer durchsuchbaren Liste hinzu oder beginne ein neues). Eine Persona kann ein eigenes Buch haben ("New book" auf einem leeren Tab erstellt es, "Replace" tauscht es aus): Es reist in der Datei der Persona mit, sodass Export und Backup es mitführen und das Importieren der Datei auf einem anderen Gerät es verknüpft zurückbringt. Bücher, die sie nur verknüpft, bleiben in der Bibliothek jenes Geräts; eine Verknüpfung, deren Buch fehlt, erscheint als Zeile "Not in your library", die du entfernen kannst. Der Import auf dem Bildschirm Personas übernimmt eine Persona aus einer anderen App (ein Name und eine Beschreibung), ein Backup mehrerer oder eine Liste `{ name: description }`; eine Persona, die Bücher nennt, die du noch nicht importiert hast, wird trotzdem importiert, mit einem Hinweis, welche fehlen.

## Gruppen

Eine Gruppe bringt mehrere Charaktere in einen Chat. Mit "New group" wählst du Mitglieder aus. Der Editor hat Overview, Members, Scene, Turns, Lore und Chats. Der Tab Turns entscheidet, wer antwortet: Narrator (eine Antwort spricht für alle) oder Each in turn. Eine neue Gruppe startet als Narrator.

Der Tab Turns hat außerdem **How they talk**: **Interruptions** (Mitglieder fallen ins Wort, reden durcheinander oder ignorieren eine Frage, wenn es zu ihrem Charakter passt), **Own goals** (Mitglieder widersprechen, verhandeln oder lehnen ab, wenn ein Plan gegen ihre Persönlichkeit geht, selbst wenn das Spannung mit dir erzeugt) und **Draw in quiet members** (wer eine Weile still war, bekommt mehr Gelegenheiten zu antworten, und eine erzählte Szene wird gebeten, ihn einzubeziehen). Die ersten beiden sind Off, Can oder Should: Can erlaubt es, wenn es zur Szene passt, Should erwartet es, und wenn jede Antwort zu einem Streit wird, geh zurück zu Can. Neue Gruppen starten mit Can und Draw in an; ältere Gruppen lassen alles aus, bis du es einschaltest. Der Turns-Button des Chats kann sie für einen einzelnen Chat ändern. Öffne im Tab Members den Abschnitt "In this group" eines Mitglieds, um ihm eine **voice** zu geben, die nur diese Gruppe verwendet: bis zu zwei Sprachgewohnheiten (spricht in Fragmenten, stellt nie Fragen) und bis zu fünf Beispielzeilen. Ein paar Zeilen lehren den Rhythmus besser als Adjektive, und verschiedene Charaktere sollten auf dieselbe Nachricht unterschiedlich antworten.

Eine Gruppe ist keine Karte: Das Löschen einer Gruppe löscht ihre Chats, nie ihre Mitglieder. Mitglieder ohne eigene Farbe bekommen automatisch verschiedene Farben.

## Karten bekommen

- "Import card" akzeptiert PNG- oder JSON-Dateien, eine oder viele, und Links zu Chub, RisuRealm, CharaVault, Botbooru oder einer direkten Datei.
- Der Marketplace durchsucht mehrere Quellen auf einmal; öffne ein Ergebnis, um die vollständige Karte zu lesen, bevor du importierst. Jede Quelle hat ihre eigene Sortierreihenfolge und ihren eigenen Adult-Filter, und manche erfordern einen manuellen Download.
- Export schreibt eine PNG mit der Karte darin.
- "With Molfar" auf Home (und in Lorebooks) bittet Molfar, mit dir eine Karte oder ein Lorebook zu entwerfen. Siehe [[vertep:molfar]].

## Briefe von Karten

Eine Karte, die du eine Weile nicht gespielt hast, kann dir eine kurze Nachricht in ihrer eigenen Stimme schreiben. Die Nachricht landet im Posteingang (Homes "Waiting on you", der Posteingangs-Button in der Leiste) als grüner Letter; ihn zu öffnen bringt dich zum alten Chat oder startet einen Chat für eine Karte, die du nie gespielt hast. Ein Brief schreibt nie in einen Chat und erfindet nie Ereignisse.

Er ist **aus, bis du ihn einschaltest**. Solange er aus ist, steht oben im Bereich Characters und in Homes "Waiting on you" eine grüne Karte "Let your characters write to you": **Turn on** schaltet ihn sofort ein, **Not now** blendet die Karte endgültig aus. Die Zahlen (Tage der Untätigkeit, Briefe pro Tag, Tage zwischen Briefen einer Karte, das Schreibmodell) und die Karten, die du gestoppt hast, findest du unter Characters, More, Letters from cards. Briefe werden alle paar Stunden geprüft, während die App geöffnet ist: ein Chat, der 14 Tage untätig ist, eine Karte, die du 14 Tage nie gespielt hast, und eine gespielte Karte ohne Soul (einmal). Wenn das Schreibmodell dreimal hintereinander fehlschlägt (oder keines eingestellt ist), zeigt der Posteingang einen roten "Letters"-Fehler mit dem Grund, und Open bringt dich zu den Letters-Einstellungen; ein eintreffender Brief, ein anderes Modell oder das Ausschalten der Briefe behebt ihn.

## Porträts für Karten ohne eines

Eine Karte ohne eigenes Bild (nichts oder der Standard-Avatar) kann gezeichnet werden. **Eine Karte:** Im Karten-Editor öffnet "Draw" unter dem Porträt einen Dialog: Wähle das Bildmodell, ein Textmodell (das Card-tasks-Modell) schreibt eine Beschreibung der Karte, die du bearbeiten kannst, und das Bildmodell zeichnet sie. Das Bild geht sofort in die Galerie der Karte und "Use as portrait" macht es zum Avatar. **Viele Karten:** Characters, More, "Draw missing portraits (N)" fragt nach dem Modell und zeichnet sie dann nacheinander über die Fortschrittskarte; Cancel stoppt zwischen den Karten, und eine fehlgeschlagene Karte wird mit dem Grund aufgeführt.

"Draw with" listet die Bildmodelle von Settings > Images auf: ein lokales ComfyUI oder Forge neben API-Modellen. Die erste Wahl ist das eigene Bildmodell der App (Extensions > Image generation); eine Auswahl hier wird nur für Porträts gemerkt. Ein tag-trainiertes Modell bekommt eine Zeile Tags, ein API-Modell einen Absatz. Eine Karte mit nur einem Namen hat nichts zu beschreiben, und der Dialog sagt das. Die Bildgenerierung muss an sein (Extensions); die Dialoge sagen das und öffnen sie für dich.

## Was eine Karte nicht enthält

Der Dashboard-Zustand, Kapitel und Fakten gehören zu jedem Chat, nicht zur Karte. Auch das Karten-Gedächtnis ist nicht Teil der Karte und erscheint nie in einem Export. Die Soul hingegen wird in der Karte gespeichert.

Weiter: [[first-story]] für den ersten Chat oder [[soul]] für das Reaktionsprofil.
