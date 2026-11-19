<!-- source: 4bee02775a17 -->
# Sprite'y i okna sprite'ów

Sprite'y to małe obrazki postaci, po jednym na każdą emocję, które pojawiają się nad czatem i zmieniają się wraz z biegiem historii. Ta strona jest dla tych, którzy chcą widzieć kilka postaci naraz, w grupie lub z kartą narratora, albo zbudować wygląd jak z visual novel.

## Czym jest okno sprite'a

Okno sprite'a unosi się nad czatem i pokazuje **jedną postać**. Wybiera obrazek na podstawie ostatnich kwestii tej postaci (według tych samych reguł słów kluczowych co dotąd; żaden model nie jest wywoływany), a obrazek zostaje, dopóki postać znów się nie odezwie. Karta narratora, która zapisuje swoje postacie jako kwestie ("Aria: ..."), daje każdej z nich własne kwestie; ta, która pisze prozą ("Aria śmieje się z radości"), daje każdej z nich zdania, które je nazywają, a gdy nie pokazują one emocji, decyduje cała wiadomość. Przeciągnij okno, gdzie chcesz, przeciągnij jego dolny róg, aby zmienić rozmiar (dwukrotne kliknięcie rogu przywraca rozmiar domyślny), i naciśnij **×**, aby zwinąć je do małej okrągłej pastylki; naciśnij pastylkę, aby je przywrócić.

Sprite'y dodajesz do karty w edytorze, w zakładce **More**, **Sprites**. W ustawieniach jest jeden przełącznik, "Expression Sprites", który wyłącza wszystkie okna.

## Jedno okno czy kilka

Nowy czat ma jedno okno, które, jak zawsze, podąża za **tym, kto mówi**. Naciśnij zębatkę na oknie, aby otworzyć **Sprite windows**:

- **Add window** (do 8). Nowe okno pokazuje "Next in the scene".
- **Shows**, osobno dla każdego okna: "Whoever speaks", "Next in the scene" albo jedną wskazaną postać (członka grupy lub jeden głos karty narratora).
- **Transparent background**, osobno dla każdego okna: bez ramki i bez tła, tylko obrazek. Kliknięcia przechodzą przez niego do tekstu czatu, więc takie okno przesuwa się małym uchwytem w lewym górnym rogu.
- **Visible part**: suwak od 35% do 100% (domyślnie 100%). Mniej niż 100% pokazuje tylko górną część każdego obrazka, więc nogi są ucięte (od pasa w górę, albo popiersie przy 40%); wysokość okna to wtedy widoczna część, a obrazek jest w tym celu rysowany większy. Razem z pasem pod tekstem daje to wygląd visual novel i zostawia czatowi prawie całą jego wysokość.
- **Windows are**: "In front of the text" (domyślnie), "Behind the text" (tekst czatu jest rysowany nad obrazkami, które zostają pod nim; każda wiadomość dostaje podkład w kolorze strony, żeby pozostała czytelna, a suwak **Text backing** ustawia jego siłę od 0% do 100%, domyślnie 55%; przyciski okna stają się blade, a okno przesuwa się jego uchwytem) albo "In a strip under the text" (czat zachowuje pod tekstem pas na okna, więc żaden tekst nie leży pod obrazkiem; okna zostają wtedy na dole i przesuwają się tylko na boki, a pas ma wysokość najwyższego okna). Te opcje są dla tabletów i komputerów; telefon trzyma okna z przodu.
- **Arrange**: "Row at the bottom" (wygląd visual novel) albo "Grid". Tylko rozmieszczają okna; potem przeciągasz je sam.
- **Hide empty windows**.
- **Back to one window**.

Układ jest zapisywany **dla każdego czatu, w tej przeglądarce**. Nie przechodzi na inne urządzenie.

## Kto jest "w scenie"

Okna "Next in the scene" pokazują osoby ze sceny inne niż mówiąca, a postać **zachowuje swoje okno**, dopóki zostaje: nikt nie przeskakuje do innego okna, gdy odzywa się ktoś inny. Gdy postać opuszcza scenę, jej okno robi się puste ("Nobody here") albo znika, jeśli "Hide empty windows" jest włączone, a następny przybysz zajmuje wolne okno.

Sceną jest lista "Present" w Panelu, gdy Panel przeczytał historię (zob. [[dashboard]]). Bez niego scenę tworzą ci, którzy mówili w ostatnich sześciu wiadomościach.

## Stroje

Postać z więcej niż jednym strojem dostaje na oknie mały przełącznik stroju. Wybór jest zapamiętywany dla czatu i jest osobny dla każdego członka grupy.

## Na telefonie

Telefon pokazuje **jedno okno**, a wszystko zostaje nad polem wiadomości, gdziekolwiek rośnie:

- **Obrazek przepuszcza dotknięcia.** Przesunięcie po nim przewija czat. Okno przesuwa się uchwytem w lewym górnym rogu, a zębatka (ustawienia), **×** (zwinięcie) i róg (zmiana rozmiaru) są zawsze widoczne. Okno zostaje w całości na ekranie i nad polem wiadomości; jeśli się nie mieści, schodzi niżej.
- **Rząd nad polem wiadomości** ma **Auto** i wszystkich w scenie jako małe okrągłe obrazki. Postać w oknie ma obwódkę. Dotknij innej, aby pokazać ją tam: pinezka na jej obrazku oznacza, że okno zostaje na niej. Dotknij przypiętej albo **Auto**, a okno znów podąża za tym, kto mówi.
- **Gdy piszesz**, okno i rząd ustępują, i wracają, gdy pole wiadomości jest puste albo je opuścisz.
- Zwiniete okno to mała okrągła pastylka: dotknij jej, a okno otworzy się tam, gdzie jest pastylka, dociągnięte z powrotem na ekran.

Przezroczyste okna, rozmieszczanie i dodatkowe okna są dla tabletów i komputerów.

## Czego nie robi

Niczego nie rysuje i nie czyta historii modelem: postać bez sprite'ów nie ma okna, a postać, która nigdy się nie odezwała, pokazuje swój obrazek domyślny. Członek grupy bez sprite'ów jest pomijany.
