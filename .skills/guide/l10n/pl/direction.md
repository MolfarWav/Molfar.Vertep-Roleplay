<!-- source: ae865b32181c -->
# Kierunek: kto jest w scenie

Kierunek działa w czatach grupowych. Po każdej odpowiedzi mały, tani model "reżysera" odczytuje scenę i określa, co to za scena (lekcja, przerwa, samotny moment, randka) oraz którzy członkowie w niej uczestniczą. Członkowie, którzy nie są obecni, przestają odpowiadać i są pomijani w promptach, dopóki historia nie sprowadzi ich z powrotem.

## Pasek

W czacie grupowym pod paskiem członków znajduje się wąski pasek oznaczony "Direction" (na telefonie tylko ikona). Od lewej do prawej:

- **Chip sceny**: rodzaj sceny i kto jest obecny ("Alone moment, with Yuzu" lub "Lesson, 4 here"). Kliknij go, aby zobaczyć, kto jest w scenie, a kto nie, kiedy sporządzono ostatni raport, oraz przycisk **Report now**, który ponownie pyta reżysera. Gdy reżyser czyta, chip pokazuje "Reading the scene…".
- **Chip modelu**: model reżysera. Jeśli żaden nie jest wybrany, pokazuje **Pick a model**. Kliknij go, aby zobaczyć tę samą listę modeli, co na górnym pasku czatu: modele oznaczone gwiazdką, a potem wszystkie modele według połączenia, z polem wyszukiwania.
- **Przełącznik**: Kierunek włączony lub wyłączony dla tego czatu. Dopóki nie wybierzesz modelu, jest wyszarzony i pokazuje "Pick a model first".
- **Next**: chip, który pojawia się, gdy reguła gatunku ma notatkę czekającą na następną odpowiedź ("Next: Yuzu"). Znak x ją pomija.
- **Rules**: otwiera arkusz Kierunku z dwiema zakładkami, **Rules** i **Log**. Obok przełącznika, więc pozostaje widoczny na telefonie (tam to tylko ikona, z kropką, gdy reguły są włączone).

Gdy przełącznik jest wyłączony, pasek zwija się do "Direction: off", a czat działa jak wcześniej.

## Reguły gatunku

Gatunek to zestaw drobnych reguł, które przypadkiem wciągają ludzi do sceny, dzięki czemu historia danego gatunku nie staje w miejscu. Otwórz **Rules** i wybierz gatunek. Na razie jest jeden, **School rom-com**, z trzema regułami:

- **Interrupted moment**: przez trzy odpowiedzi byłeś sam na sam z jednym członkiem, a ktoś wchodzi i wam przeszkadza.
- **Someone comes by**: przez trzy odpowiedzi nikogo nie było w pobliżu (nie w domu), i przychodzi członek.
- **Friends join the break**: podczas przerwy, lunchu lub zajęć klubowych, gdy obecne są jedna lub dwie osoby, dołącza przyjaciel.

Czat zaczyna się bez gatunku i z wyłączonymi regułami, więc nic się nie zmienia, dopóki nie wybierzesz gatunku. Wybranie gatunku włącza reguły; **Rules in this chat** wyłącza je ponownie i zachowuje gatunek. Reguły wymagają włączonego Kierunku: odczytują jego raporty.

Po każdej odpowiedzi kod (a nie model) sprawdza reguły po kolei. Reguła może zadziałać, gdy spełnione są jej warunki, nie odpoczywa i rzut dwiema kostkami osiąga jej liczbę. Jeśli zadziała, następna odpowiedź dostaje krótką notatkę o scenie ("Yuzu walks in on you and Hana and interrupts the moment"), a dana osoba jest traktowana jako obecna w scenie, więc jej karta zostaje wysłana w całości. Najwyżej jedna notatka na odpowiedź. Blokada, powrót po blokadzie oraz wydarzenie lub powracająca postać ze Świata mają pierwszeństwo; reguła czeka wtedy na kolejną turę.

Każda karta reguły pokazuje swój stan: **Ready**, **Cooling down** (pozostałe odpowiedzi) lub **Quiet for the payoff**, oraz ile razy zadziałała w stronę nagrody. **Numbers** otwiera jej ustawienia:

- **2d6 needed**: rzut musi osiągnąć tę liczbę; tekst obok podaje procent rzutów ("about 42%"). 2 zawsze zadziała, 13 nigdy.
- **Cooldown**: liczba odpowiedzi, przez które reguła milczy po zadziałaniu.
- **Payoff every** i **Then quiet**: za każdym K-tym zadziałaniem reguła odpoczywa jeszcze M odpowiedzi ("finally alone"). 0 wyłącza nagrodę.

**Fire now** umieszcza notatkę reguły w następnej odpowiedzi bez rzutu, bez cooldownu i bez liczenia do nagrody; wymaga, by ktoś był nieobecny. **Skip** usuwa czekającą notatkę. Notatka, którą pominąłeś, lub odpowiedź, którą usunąłeś, jest zapominana razem z cooldownem; przesunięcie odpowiedzi z notatką daje nowej próbie tę samą notatkę.

Pod odpowiedzią, która niosła notatkę, mała linijka mówi, co się stało: "Direction: Mei joins (Friends join the break, 2d6 = 10, needed 9) · came". Ostatnie słowo to późniejszy raport reżysera: **came** (są w scenie), **only mentioned** (tylko wspomniani) lub **did not come** (nie przyszli). Zakładka **Log** pokazuje to samo, z rzutem i powodem, a także reguły, które rzucały i chybiły.

Grupa może ustawić **default genre** na swojej zakładce **Direction**; nowe czaty tej grupy zaczynają się z tym gatunkiem włączonym. Liczby to pierwsze przybliżenia: zmień je w czacie, jeśli reguła zadziała zbyt często lub zbyt rzadko.

## Wybór modelu

Jest jeden model reżysera dla wszystkich czatów i wszystkich grup. Wybierz go z dowolnego paska lub z zakładki **Direction** grupy. Nie ma domyślnego: wybierasz sam. Mały, szybki model wystarczy: kosztuje jedno krótkie wywołanie po każdej odpowiedzi.

Nowy czat grupowy zaczyna się z włączonym Kierunkiem, gdy tylko wybierzesz model. Czaty, które już miałeś, nie są zmieniane. Każdy czat ma własny przełącznik.

## Kto jest nieobecny

Chip członka zmienia się, gdy ktoś jest poza sceną: obraz jest przyciemniony i ma małą ikonę drzwi. Ikona kłódki oznacza, że członka wykluczyła blokada (poniżej). Kliknij chip: wyskakujące okno napisze "Here" lub "Not in the scene".

Nieobecny członek nie wykonuje tur sam, a jego karta nie jest wysyłana do modelu: tylko jedna linijka mówi, że nie ma go w scenie. Wymienienie go w wiadomości nadal go wzywa. Gdy reżyser znów go zobaczy, wraca cała jego karta.

## Blokada i powrót

Aby utrzymać scenę z jedną osobą, kliknij chip członka i wybierz **Only <name> in the scene**. Przed chipem sceny pojawi się chip "Only Yuzu", a pozostali zostaną poza sceną, cokolwiek powie reżyser. Kliknij x na tym chipie lub **Release the lock** w wyskakującym oknie członka, aby zwolnić. Przy następnej odpowiedzi pozostałym powiedziane zostanie, że mogą wrócić, a historia dostaje polecenie znalezienia im drogi wejścia.

## Gdy reżyser zawiedzie

Jeśli odpowiedzi reżysera nie da się odczytać lub wywołanie się nie uda, chip sceny pokazuje **No report**; otwórz go, aby zobaczyć przyczynę. Czat korzysta wtedy z pomysłu Dashboardu na to, kto jest obecny, albo pozwala wszystkim odpowiadać jak dotąd. Nic z twojej historii nie przepada.

## Nowe grupy

**New group** otwiera szerokie okno (pełny ekran na telefonie). Nazwij grupę lub zostaw nazwę pustą, aby użyć pierwszych trzech członków. Szukaj, zawężaj za pomocą **All**, **Favourites** i **Recent**, używaj chipów tagów i sortowania (Name, Recently used, Most chats), a wybieraj, klikając portrety. Wybrani członkowie stoją w rzędzie na górze w kolejności wypowiedzi; strzałki przesuwają o jedno miejsce wcześniej lub później, x usuwa. **Next** wymaga dwóch postaci.

Po **Next** grupa zostaje utworzona, a jej edytor otwiera się z notatką: sprawdź, jak się gra, a potem rozpocznij pierwszy czat. **Start chat** to główny przycisk. Zakładka **Direction** ustala, czy nowe czaty tej grupy zaczynają się z włączonym Kierunkiem, i pokazuje model reżysera. Grupa na stronie Groups otwiera ten sam edytor, tak samo jak nazwa grupy u góry jej czatu.

Gdy rozpoczynasz późniejszy czat grupy, krótki krok przed czatem ma przełącznik **Direction**: włączony, gdy domyślne ustawienie grupy jest włączone i wybrany jest model.

Zobacz także [[characters]] i [[dashboard]].
