<!-- source: 637184c0cc50 -->
# Postacie, persony i grupy

Wszystko, czym grasz, znajduje się w czterech sekcjach: Characters, Groups, Personas i Marketplace. Ta strona mówi, do czego służy każda z nich; szczegóły znajdziesz w artykułach pomocy *Your characters*, *The card editor tabs* i *Groups of characters*.

## Karty

Karta to postać: opis, osobowość, scena i pierwsza wiadomość. Tag zapisany jako `group: Guild of Ravens` lub `faction: Guild of Ravens` umieszcza postać z karty w tej grupie, więc fakt pamięci przekazany grupie jest im znany ([[litopys]]). Sekcja Characters pokazuje twoje karty jako siatkę lub listę, z wyszukiwaniem, tagami, folderami, ulubionymi (gwiazdka) i kilkoma sortowaniami. Otwórz kartę, aby ją edytować. Zmiany pozostają w wersji roboczej do momentu „Save changes"; wyjście z niezapisanymi zmianami najpierw pyta o potwierdzenie.

Edytor ma sześć zakładek:

- **Core**: tekst karty, dialog i powitanie.
- **Profile**: ten sam opis podzielony na ustrukturyzowane pola (tożsamość, wygląd, cele). Każdy zapis wpisuje je z powrotem do tekstu karty. Karta narratora może tu opisać całą obsadę.
- **Soul**: jak postać reaguje na ciebie, plus nawyki. Zobacz [[soul]].
- **Memory**: zakończone czaty, które postać pamięta. Zobacz [[memory]].
- **Lorebook**: księgi powiązane z tą kartą.
- **More**: kolory i głosy, sprites (zobacz [[sprites]]), galeria, regex, ustawienia zaawansowane.

Karta może odgrywać kilka postaci naraz (narrator lub mistrz gry). W sekcji Colors opcja „Voices" daje każdemu mówcy własny kolor. Jeśli nie wymienisz żadnych głosów, czat zrobi to za ciebie: karta zawierająca kilka postaci (sekcje nazwane po każdej z nich) sama koloruje kwestie każdej postaci, każdą innym kolorem, zachowanym wraz z czatem. W każdym innym czacie otwórz menu czatu, „Voice colors", i włącz przełącznik; „Spread colors" daje każdemu, kogo nie wybrałeś, inny kolor. Wymaga to Dashboardu Relationship, który dostarcza listę postaci. Gdy głosy są pokolorowane, linia dostaje kolor tego, kto ją mówi: imię, którym się zaczyna („Rhea:"), imię obok czasownika mowy („— Nie, — mówi Esh"), albo ona lub on wskazujący na jedyną postać tej płci wymienioną wcześniej w tej samej odpowiedzi („— Dobrze, — mówi ona"). Mówca, którego nie ma na liście (przechodzień wspomniany tylko w historii), dostaje własny kolor, za każdym razem ten sam, z dala od kolorów już użytych. Linia, która nikogo nie nazywa, zachowuje kolor poprzedniego mówcy; zanim ktokolwiek zostanie wymieniony, zostaje kolor motywu. Jeśli historia nazywa postać inaczej niż karta (karta: „Afrodyta", historia: „Ada"), czat może wypisać dwie osoby i pokolorować je osobno. Dwa sposoby, by uczynić je jedną: w Dashboardzie Relationship otwórz menu postaci i wybierz „Same person as...", albo dodaj do karty linijkę w rodzaju „Also called: Ada", aby imię było znane od pierwszej odpowiedzi. Krótkie słowo w cudzysłowie w środku zdania („nazwał to «zdradą» i odszedł") jest czytane jako termin, nie jako mowa, i nie dostaje koloru. Aby zobaczyć, dlaczego linia dostała kolor, otwórz menu czatu, „Voice colors", i włącz „Show who speaks and why": mały znak za każdym cytatem wskazuje mówcę i regułę.

## Persony

Persona to ty: imię, zaimki, opis, awatar. Model widzi ją wszędzie, gdzie prompt mówi o użytkowniku. „Use this persona" czyni ją twoją domyślną i przełącza na nią otwarty czat. Persona może mieć własne lorebooki i może być przypisana do wybranych postaci, więc nowe czaty z nimi zaczynają się z nią. Zakładka Lorebooks persony wyświetla księgi, które nosi (otwórz jedną, odłącz ją, dodaj więcej z listy, którą możesz przeszukiwać, lub zacznij nową). Persona może mieć własną księgę („New book" na pustej zakładce ją tworzy, „Replace" ją podmienia): podróżuje wewnątrz pliku persony, więc Export i Backup ją przenoszą, a import pliku na innym urządzeniu przywraca ją, powiązaną. Księgi, które tylko linkuje, pozostają w bibliotece tego urządzenia; link, którego księgi brakuje, pokazuje się jako wiersz „Not in your library", który możesz usunąć. Import na ekranie Personas przyjmuje jedną personę z innej aplikacji (imię i opis), kopię zapasową kilku lub listę `{ name: description }`; persona, która wymienia niezaimportowane jeszcze księgi, i tak zostaje zaimportowana, z notatką, których brakuje.

## Grupy

Grupa umieszcza kilka postaci w jednym czacie. „New group" pozwala wybrać członków. Edytor ma Overview, Members, Scene, Turns, Lore i Chats. Zakładka Turns decyduje, kto odpowiada: Narrator (jedna odpowiedź wyraża wszystkich) lub Each in turn. Nowa grupa zaczyna jako Narrator.

Zakładka Turns ma też **How they talk**: **Interruptions** (członkowie wtrącają się, mówią jeden przez drugiego lub ignorują pytanie, gdy pasuje to do ich charakteru), **Own goals** (członkowie sprzeciwiają się, targują lub odmawiają, gdy plan jest sprzeczny z tym, kim są, nawet jeśli tworzy to napięcie z tobą) i **Draw in quiet members** (ktoś, kto od dawna milczał, dostaje więcej szans na odpowiedź, a narratowana scena jest proszona o wciągnięcie go). Pierwsze dwie opcje to Off, Can lub Should: Can pozwala, gdy pasuje to do sceny, Should tego oczekuje, a jeśli każda odpowiedź zamienia się w kłótnię, wróć do Can. Nowe grupy zaczynają z Can i Draw in włączonymi; starsze grupy pozostają z wszystkim wyłączonym, dopóki tego nie włączysz. Przycisk Turns w czacie może je zmienić tylko dla jednego czatu. Na zakładce Members otwórz sekcję „In this group" członka, aby dać mu **voice**, którego używa tylko ta grupa: do dwóch nawyków mowy (mówi fragmentami, nigdy nie zadaje pytań) i do pięciu przykładowych kwestii. Kilka kwestii uczy rytmu lepiej niż przymiotniki, a różne postacie powinny odpowiadać na tę samą wiadomość inaczej.

Grupa to nie karta: usunięcie grupy usuwa jej czaty, nigdy jej członków. Członkowie bez własnego koloru dostają automatycznie różne kolory.

## Zdobywanie kart

- „Import card" przyjmuje pliki PNG lub JSON, jeden lub wiele, oraz linki do Chub, RisuRealm, CharaVault, Botbooru lub bezpośredniego pliku.
- Marketplace przeszukuje kilka źródeł naraz; otwórz wynik, aby przeczytać całą kartę przed importem. Każde źródło ma własną kolejność sortowania i filtr treści dla dorosłych, a niektóre wymagają ręcznego pobrania.
- Export zapisuje PNG z kartą w środku.
- „With Molfar" na Home (oraz w Lorebooks) prosi Molfara o wspólne napisanie karty lub lorebooka. Zobacz [[vertep:molfar]].

## Listy od kart

Karta, w którą dawno nie grałeś, może napisać do ciebie krótką notatkę własnym głosem. Notatka trafia do skrzynki odbiorczej („Waiting on you" na Home, przycisk skrzynki na pasku) jako zielony Letter; otwarcie go przenosi cię do starego czatu lub zaczyna czat dla karty, w którą nigdy nie grałeś. List nigdy nie pisze do czatu i nigdy nie wymyśla wydarzeń.

Jest **wyłączony, dopóki go nie włączysz**. Gdy jest wyłączony, na górze sekcji Characters i w „Waiting on you" na Home widnieje zielona karta „Let your characters write to you": **Turn on** włącza go od razu, **Not now** ukrywa kartę na dobre. Liczby (dni bezczynności, listy dziennie, dni między listami od jednej karty, model piszący) i karty, które zatrzymałeś, są w Characters, More, Letters from cards. Listy są sprawdzane co kilka godzin, gdy aplikacja jest otwarta: czat bezczynny przez 14 dni, karta, w którą nigdy nie grałeś, przez 14 dni, oraz rozegrana karta bez Soul (raz). Jeśli model piszący zawiedzie trzy kontrole z rzędu (lub żaden nie jest ustawiony), skrzynka pokazuje czerwony błąd „Letters" z powodem, a Open przenosi cię do ustawień Letters; nadchodzący list, inny model lub wyłączenie listów go czyści.

## Portrety dla kart, które go nie mają

Karta bez własnego obrazu (nic lub domyślny awatar) może zostać narysowana. **Jedna karta:** w edytorze karty „Draw" pod portretem otwiera okno dialogowe: wybierz model obrazu, model tekstowy (model Card tasks) pisze opis karty, który możesz edytować, a model obrazu go rysuje. Obraz trafia od razu do galerii karty, a „Use as portrait" czyni go awatarem. **Wiele kart:** Characters, More, „Draw missing portraits (N)" pyta o model, a następnie rysuje je jedną po drugiej przez kartę postępu; Cancel zatrzymuje to między kartami, a karta, która zawiedzie, jest wymieniona z powodem.

„Draw with" wyświetla modele obrazów z Settings > Images: lokalny ComfyUI lub Forge obok modeli API. Pierwszy wybór to własny model obrazu aplikacji (Extensions > Image generation); wybór tutaj jest zapamiętywany tylko dla portretów. Model wytrenowany na tagach dostaje wiersz tagów, model API akapit. Karta z samym imieniem nie ma czego opisywać i okno dialogowe to mówi. Generowanie obrazów musi być włączone (Extensions); okna dialogowe to mówią i otwierają je za ciebie.

## Czego karta nie przechowuje

Stan Dashboard, rozdziały i fakty należą do każdego czatu, a nie do karty. Zakładka Memory karty (zachowane nawyki, "How they changed") również nie jest częścią karty i nigdy nie pojawia się w eksporcie. Natomiast Soul jest zapisywany w karcie.

Dalej: [[first-story]] o pierwszym czacie lub [[soul]] o profilu reakcji.
