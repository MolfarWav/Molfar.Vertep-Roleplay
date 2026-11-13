<!-- source: 9bbf7efc4d3f -->
# Postacie, persony i grupy

Wszystko, czym grasz, żyje w czterech sekcjach: Characters, Groups, Personas i Marketplace. Ta strona mówi, do czego każda służy; szczegóły są w artykułach Pomocy *Your characters*, *The card editor tabs* i *Groups of characters*.

## Karty

Karta to postać: opis, osobowość, scenariusz i pierwsza wiadomość. Tag zapisany jako `group: Guild of Ravens` lub `faction: Guild of Ravens` wkłada też postać karty do tej grupy, więc fakt z pamięci powiedziany grupie jest jej znany ([[litopys]]). Sekcja Characters pokazuje twoje karty jako siatkę lub listę, z wyszukiwaniem, tagami, folderami, ulubionymi (gwiazdka) i kilkoma sortowaniami. Otwórz kartę, aby ją edytować. Zmiany zostają w szkicu do czasu „Save changes”; wyjście z niezapisanymi zmianami najpierw pyta.

Edytor ma sześć zakładek:

- **Core**: tekst karty, dialog i powitanie.
- **Profile**: ten sam opis podzielony na ustrukturyzowane pola (tożsamość, wygląd, cele). Każdy zapis wpisuje je z powrotem do tekstu karty. Karta narratora może tu opisać całą obsadę.
- **Soul**: jak postać reaguje na ciebie, plus nawyki. Zobacz [[soul]].
- **Memory**: zakończone czaty, które postać pamięta. Zobacz [[memory]].
- **Lorebook**: księgi powiązane z tą kartą.
- **More**: kolory i głosy, sprite'y, galeria, regex, ustawienia zaawansowane.

Karta może grać kilka postaci naraz (narrator lub mistrz gry). W Colors opcja „Voices” daje każdemu mówcy własny kolor. Jeśli nie wymienisz żadnych głosów, czat zrobi to za ciebie: karta zawierająca kilka postaci (sekcje nazwane od każdej z nich) sama koloruje kwestie każdej postaci, każdą innym kolorem, a kolory są zapisywane razem z czatem. W każdym innym czacie otwórz menu czatu, „Voice colors”, i włącz przełącznik; „Spread colors” daje każdemu, kogo nie wybrałeś, inny kolor. Wymaga to pulpitu Relationship, który dostarcza listę postaci.

## Listy od kart

Karta, której od jakiegoś czasu nie grałeś, może napisać do ciebie krótki list we własnym głosie. List trafia do skrzynki (Home, „Waiting on you”, oraz przycisk skrzynki na pasku) jako zielony Letter; otwarcie go przenosi cię do starego czatu albo zaczyna czat z kartą, z którą nigdy nie grałeś. List nigdy nie pisze do czatu i nigdy nie wymyśla zdarzeń.

Jest **wyłączone, dopóki go nie włączysz**. Dopóki jest wyłączone, na górze sekcji Characters i w „Waiting on you” na Home wisi zielona karta „Let your characters write to you”: **Turn on** włącza go od razu, **Not now** chowa kartę na dobre. Liczby (dni bezczynności, listy dziennie, dni między listami z jednej karty, model piszący) oraz karty, które wyłączyłeś, są w Characters, More, Letters from cards. Listy są sprawdzane co kilka godzin, gdy aplikacja jest otwarta: czat bezczynny przez 14 dni, karta, której nigdy nie grałeś, przez 14 dni, oraz zagrana karta bez Soul (raz). Jeśli model piszący zawiedzie w trzech kolejnych sprawdzeniach (albo żaden nie jest ustawiony), skrzynka pokazuje czerwony błąd „Letters” z powodem, a **Open** prowadzi do ustawień listów; błąd znika, gdy przyjdzie list, gdy wybierzesz inny model albo wyłączysz listy.

## Persony

Persona to ty: imię, zaimki, opis, awatar. Model widzi ją tam, gdzie prompt mówi o użytkowniku. „Use this persona” czyni ją twoją domyślną i przełącza otwarty czat na nią. Persona może mieć własne księgi wiedzy i może być przypięta do wybranych postaci, aby nowe czaty z nimi zaczynały się od niej.

## Grupy

Grupa umieszcza kilka postaci w jednym czacie. „New group” pozwala wybrać członków. Edytor ma karty Overview, Members, Scene, Turns, Lore i Chats. Karta Turns decyduje, kto odpowiada: Narrator (jedna odpowiedź wypowiada wszystkich) lub Each in turn. Nowa grupa zaczyna jako Narrator.

Karta Turns ma także **How they talk**: **Wtrącanie się** (Interruptions): członkowie wchodzą sobie w słowo, mówią jednocześnie albo ignorują pytanie, gdy pasuje to do ich postaci. **Samobóje** (Own goals): członkowie sprzeciwiają się, targują albo odmawiają, gdy plan kłóci się z tym, kim są, nawet jeśli wywołuje to napięcie z tobą. **Wciąganie cichych członków** (Draw in quiet members): ktoś, kto od pewnego czasu milczy, ma większe szanse na odpowiedź, a opisywana scena jest proszona, by go włączyć. Dwa pierwsze ustawienia to Off, Can albo Should: Can dopuszcza to, gdy pasuje do sceny, Should tego oczekuje, a jeśli każda odpowiedź zamienia się w kłótnię, wróć do Can. Nowe grupy startują z Can i włączonym wciąganiem cichych; starsze grupy mają wszystko wyłączone, dopóki tego nie włączysz. Przycisk Turns w samym czacie może je zmienić tylko dla jednego czatu. Na karcie Members otwórz sekcję „In this group” członka, aby nadać mu **głos** używany tylko w tej grupie: do dwóch nawyków mowy (mówi urywkami, nigdy nie zadaje pytań) i do pięciu przykładowych kwestii. Kilka kwestii uczy rytmu lepiej niż przymiotniki, a różne postacie powinny inaczej reagować na tę samą wiadomość.

Grupa nie jest kartą: usunięcie grupy usuwa jej czaty, nigdy jej członków. Członkowie bez własnego koloru dostają automatycznie różne kolory.

## Zdobywanie kart

- „Import card” przyjmuje pliki PNG lub JSON, jeden lub wiele, i linkuje do Chub, RisuRealm, CharaVault, Botbooru lub bezpośredniego pliku.
- Marketplace przeszukuje kilka źródeł naraz; otwórz wynik, aby przeczytać całą kartę przed importem. Każde źródło ma własny porządek sortowania i filtr dla dorosłych, a niektóre wymagają ręcznego pobrania.
- Eksport zapisuje PNG z kartą w środku.
- „With Molfar” na Home (oraz w Lorebooks) prosi Molfara o naszkicowanie z tobą karty lub księgi wiedzy. Zobacz [[vertep:molfar]].

## Portrety kart bez obrazka

Karta bez własnego obrazka (nic albo domyślny awatar) może zostać narysowana. **Jedna karta:** w edytorze karty „Draw” pod portretem otwiera okno: wybierz model obrazu, model tekstowy (model zadań kart) napisze opis karty, który możesz edytować, a model obrazu go narysuje. Obrazek trafia od razu do Galerii karty, a „Use as portrait” ustawia go jako awatar. **Wiele kart:** w Characters, More, „Draw missing portraits (N)” wybierasz model, a potem karty są rysowane jedna po drugiej w karcie postępu; Cancel zatrzymuje się między kartami, a karta, która się nie udała, jest wymieniona z powodem.

„Draw with” wymienia modele obrazów z Settings > Images: lokalne ComfyUI lub Forge obok modeli API. Pierwszym wyborem jest własny model obrazów aplikacji (Extensions > Image generation); wybór tutaj jest zapamiętany tylko dla portretów. Model wytrenowany na tagach dostaje linijkę tagów, model API akapit. Karta z samym imieniem nie ma czego opisać, a okno to mówi. Generowanie obrazów musi być włączone (Extensions); okna o tym mówią i same je dla ciebie otwierają.

## Czego karta nie zawiera

Stan Pulpitu, rozdziały i fakty należą do każdego czatu, nie do karty. Pamięć karty również nie jest częścią karty i nigdy nie pojawia się w eksporcie. Dusza natomiast jest zapisana w karcie.

Dalej: [[first-story]] po pierwszy czat lub [[soul]] po profil reakcji.
