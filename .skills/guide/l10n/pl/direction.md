<!-- source: 3fac4b007f13 -->
# Kierunek: kto jest w scenie

Kierunek działa w czatach grupowych. Po każdej odpowiedzi mały, tani model "reżysera" odczytuje scenę i określa, co to za scena (lekcja, przerwa, chwila sam na sam, randka) oraz którzy członkowie w niej uczestniczą. Członkowie, których nie ma w scenie, przestają odpowiadać i są pomijani w prompcie, dopóki historia ich nie sprowadzi z powrotem.

## Pasek

W czacie grupowym, pod paskiem członków, jest cienki pasek oznaczony "Direction" (na telefonie tylko ikona). Od lewej do prawej:

- **Chip sceny**: rodzaj sceny i kto jest obecny ("Alone moment, with Yuzu" lub "Lesson, 4 here"). Kliknij, aby zobaczyć, kto jest w scenie, a kto nie, kiedy powstał ostatni raport oraz przycisk **Report now**, który ponownie pyta reżysera. Gdy reżyser czyta scenę, chip pokazuje "Reading the scene…".
- **Chip modelu**: model reżysera. Jeśli żaden nie został wybrany, pokazuje **Pick a model**. Kliknij, aby zobaczyć tę samą listę modeli, co na górnym pasku czatu: modele oznaczone gwiazdką, a potem wszystkie modele według połączeń, z polem wyszukiwania.
- **Przełącznik**: Kierunek włączony lub wyłączony dla tego czatu. Dopóki nie wybierzesz modelu, jest wyszarzony i pokazuje "Pick a model first".
- **Next**: chip, który pojawia się, gdy reguła gatunku albo beat z twojego planu ma notatkę czekającą na następną odpowiedź ("Next: Yuzu"). Znak x ją pomija.
- **Rules**: otwiera arkusz Kierunku z trzema zakładkami: **Rules**, **Plan** i **Log**. Stoi obok przełącznika, więc na telefonie pozostaje widoczny (tam to tylko ikona, z kropką, gdy reguły są włączone).

Gdy przełącznik jest wyłączony, pasek zwija się do "Direction: off" i czat działa jak wcześniej.

## Reguły gatunku

Gatunek to zestaw drobnych reguł, które przypadkiem wciągają ludzi do sceny, dzięki czemu historia danego gatunku nie stoi w miejscu. Otwórz **Rules** i wybierz gatunek. Na razie jest jeden, **School rom-com**, z trzema regułami:

- **Interrupted moment**: przez trzy odpowiedzi byłeś sam na sam z jednym członkiem, a ktoś wchodzi i wam przeszkadza.
- **Someone comes by**: przez trzy odpowiedzi nikogo nie było w pobliżu (nie w domu), i przychodzi członek.
- **Friends join the break**: podczas przerwy, lunchu lub zajęć w klubie, gdy obecne są jedna lub dwie osoby, dołącza przyjaciel.

Czat zaczyna się bez gatunku i z wyłączonymi regułami, więc nic się nie zmienia, dopóki nie wybierzesz gatunku. Wybór gatunku włącza reguły. **Rules in this chat** wyłącza je ponownie i zachowuje gatunek. Reguły wymagają włączonego Kierunku, bo czytają jego raporty.

Po każdej odpowiedzi kod (a nie model) sprawdza reguły po kolei. Reguła może zadziałać, gdy spełnione są jej warunki, nie odpoczywa, a rzut dwiema kostkami osiąga jej liczbę. Jeśli zadziała, następna odpowiedź dostaje krótką notatkę o scenie ("Yuzu walks in on you and Hana and interrupts the moment"), a ta osoba liczy się jako obecna w scenie, więc jej karta zostaje wysłana w całości. Najwyżej jedna notatka na odpowiedź. Blokada, powrót po blokadzie oraz wydarzenie lub powracająca postać ze Świata mają pierwszeństwo. Reguła czeka wtedy na kolejną turę.

Każda karta reguły pokazuje swój stan: **Ready**, **Cooling down** (pozostałe odpowiedzi) lub **Quiet for the payoff**, oraz ile razy zadziałała w stronę nagrody. **Numbers** otwiera jej ustawienia:

- **2d6 needed**: rzut musi osiągnąć tę liczbę. Tekst obok podaje procent rzutów ("about 42%"). 2 zawsze zadziała, 13 nigdy.
- **Cooldown**: liczba odpowiedzi, przez które reguła milczy po zadziałaniu.
- **Payoff every** i **Then quiet**: za każdym K-tym zadziałaniem reguła odpoczywa jeszcze M odpowiedzi ("finally alone"). 0 wyłącza nagrodę.

**Fire now** umieszcza notatkę reguły w następnej odpowiedzi bez rzutu, bez cooldownu i bez liczenia do nagrody. Wymaga, by ktoś był poza sceną. **Skip** usuwa czekającą notatkę. Notatka, którą pominąłeś, albo odpowiedź, którą usunąłeś, zostaje zapomniana razem z cooldownem. Przesunięcie odpowiedzi, która niosła notatkę, daje nowej próbie tę samą notatkę.

Pod odpowiedzią, która niosła notatkę, mała linijka mówi, co się stało: "Direction: Mei joins (Friends join the break, 2d6 = 10, needed 9) · came". Ostatnie słowo to późniejszy raport reżysera: **came** (są w scenie), **only mentioned** (tylko wspomniani) lub **did not come** (nie przyszli). Zakładka **Log** pokazuje to samo, z rzutem i powodem, a także reguły, które rzucały i chybiły.

Grupa może ustawić **default genre** na swojej zakładce **Direction**. Nowe czaty tej grupy zaczynają się z włączonym tym gatunkiem. Liczby to pierwsze przybliżenia: zmień je w czacie, jeśli reguła zadziałała zbyt często lub zbyt rzadko.

## Plan

**Beat** to coś, co chcesz, żeby się wydarzyło: "The bell rings and the class empties into the hall", "Mei brings a cake". Otwórz **Plan** i kliknij **Add beat**. Beat ma:

- **What happens**: zdanie lub dwa, jako didaskalia.
- **Who takes part** (opcjonalnie): członkowie, którzy są poza sceną, wchodzą do niej dla tego beatu.
- **When**: **After some replies** (liczone od chwili, gdy beat staje się następny; 0 oznacza od razu), **Scene** (gdy reżyser odczyta ten rodzaj sceny: lekcja, przerwa, randka...), **Place** (gdy miejsce z Dashboardu zawiera twoje słowa, na przykład "roof"; ignoruje wielkie litery) albo **By hand** (tylko gdy naciśniesz **Fire now**).
- **Wait for a new scene**: domyślnie włączone. Beat, który przyszedł na swoją kolej, nie wchodzi w środek chwili: czeka do sześciu odpowiedzi, aż historia zmieni miejsce albo przeskoczy w czasie, a potem idzie mimo wszystko. Beat miejsca idzie w chwili, gdy historia tam dotrze, a beat ręczny tylko wtedy, gdy go wystrzelisz.

Plan idzie **po kolei**: sprawdzany jest tylko pierwszy beat, który nie jest zakończony. Pozostałe mówią "After the beats before it". Beat jest zakończony, gdy wszedł do historii, gdy został porzucony (reżyser dwa razy zauważył, że go pominięto) albo gdy go **Skip**niesz. Następny beat liczy odpowiedzi od chwili, gdy zakończył się poprzedni. Każda karta pokazuje, gdzie stoi jej beat: **Waiting** (pozostałe odpowiedzi), **Due, waiting for a new scene** (pozostałe odpowiedzi), **Goes with the next reply**, **Delivered** (przyszedł, tylko wspomniany albo wszedł, gdy nikt nie był nazwany), **Did not land**, **Skipped**. Jeśli coś wstrzymuje beat, karta mówi, co: Kierunek jest wyłączony, scena jest zablokowana albo scena jest jawna (beat nigdy nie wchodzi w jawnej scenie; idzie, gdy scena ją opuści). **Edit**, **Move up**, **Move down** i **Delete** zmieniają listę. **Fire now** wstawia beat do następnej odpowiedzi od razu, czego by nie czekał.

Beat korzysta z tego samego mechanizmu co reguła gatunku. Po każdej odpowiedzi kod sprawdza plan przed regułami, notatka jedzie z następną odpowiedzią (jedna notatka na odpowiedź; blokada, powrót po blokadzie oraz wydarzenie lub powracająca postać ze Świata mają pierwszeństwo, a beat idzie dalej przy kolejnej odpowiedzi), a późniejszy raport reżysera mówi, czy osoby **came**, były **only mentioned**, czy beat **did not land**. Beat, który nie wylądował, próbuje się jeszcze raz z ostrzejszą notatką, a potem zostaje porzucony. Odpowiedź, którą przesuniesz, daje nowej próbie tę samą notatkę. Odpowiedź, którą usuniesz, zwraca swój beat do planu.

## Wybór modelu

Jest jeden model reżysera dla wszystkich czatów i wszystkich grup. Wybierz go z dowolnego paska albo z zakładki **Direction** grupy. Nie ma wartości domyślnej: wybierasz sam. Wystarczy mały, szybki model, bo po każdej odpowiedzi wykonuje jedno krótkie wywołanie.

Nowy czat grupowy zaczyna się z włączonym Kierunkiem, gdy tylko wybierzesz model. Czaty, które już masz, nie są zmieniane. Każdy czat ma własny przełącznik.

## Kto jest nieobecny

Chip członka zmienia się, gdy ktoś jest poza sceną: obraz jest przyciemniony i pojawia się mała ikona drzwi. Ikona kłódki oznacza, że członka wykluczyła blokada (poniżej). Kliknij chip: wyskakujące okno napisze "Here" lub "Not in the scene".

Nieobecny członek nie wykonuje tur sam, a jego karta nie jest wysyłana do modelu. Jedna linijka mówi tylko, że nie ma go w scenie. Wymienienie go w wiadomości nadal go wzywa. Gdy reżyser znów go zobaczy, wraca cała jego karta.

## Blokada i powrót

Aby utrzymać scenę z jedną osobą, kliknij chip członka i wybierz **Only <name> in the scene**. Przed chipem sceny pojawi się chip "Only Yuzu", a pozostali zostaną poza sceną, cokolwiek powie reżyser. Kliknij x na tym chipie albo **Release the lock** w wyskakującym oknie członka, aby zwolnić. Przy następnej odpowiedzi pozostałym powie się, że mogą wrócić, a historia dostaje polecenie znalezienia im drogi wejścia.

## Gdy reżyser zawiedzie

Jeśli odpowiedzi reżysera nie da się odczytać albo wywołanie się nie uda, chip sceny pokazuje **No report**. Otwórz go, aby zobaczyć przyczynę. Czat korzysta wtedy z pomysłu Dashboardu na to, kto jest obecny, albo pozwala wszystkim odpowiadać jak dotąd. Nic z twojej historii nie przepada.

## Nowe grupy

**New group** otwiera szerokie okno (na telefonie pełny ekran). Nazwij grupę albo zostaw nazwę pustą, aby użyć pierwszych trzech członków. Szukaj, zawężaj za pomocą **All**, **Favourites** i **Recent**, używaj chipów tagów i sortowania (Name, Recently used, Most chats), a wybieraj, klikając portrety. Wybrani członkowie stoją w rzędzie na górze, w kolejności wypowiedzi. Strzałki przesuwają o jedno miejsce wcześniej lub później, x usuwa. **Next** wymaga dwóch postaci.

Po **Next** grupa zostaje utworzona, a jej edytor otwiera się z notatką: sprawdź, jak się gra, i rozpocznij pierwszy czat. **Start chat** to główny przycisk. Zakładka **Direction** ustala, czy nowe czaty tej grupy zaczynają się z włączonym Kierunkiem, i pokazuje model reżysera. Grupa na stronie Groups otwiera ten sam edytor, tak samo jak nazwa grupy na górze jej czatu.

Gdy zaczynasz kolejny czat grupy, krótki krok przed czatem ma przełącznik **Direction**: włączony, gdy domyślne ustawienie grupy jest włączone i wybrany jest model.

Zobacz także [[characters]] i [[dashboard]].
