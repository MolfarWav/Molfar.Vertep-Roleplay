<!-- source: 3b04df871946 -->
# Kierunek: kto jest w scenie

Kierunek działa w czatach grupowych. Po każdej odpowiedzi mały, tani model "reżysera" odczytuje scenę i określa, co to za scena (lekcja, przerwa, samotny moment, randka) oraz którzy członkowie w niej uczestniczą. Członkowie, którzy nie są obecni, przestają odpowiadać i są pomijani w promptach, dopóki historia nie sprowadzi ich z powrotem.

## Pasek

W czacie grupowym pod paskiem członków znajduje się wąski pasek oznaczony "Direction" (na telefonie tylko ikona). Od lewej do prawej:

- **The scene chip**: rodzaj sceny i kto jest obecny ("Alone moment, with Yuzu" lub "Lesson, 4 here"). Kliknij go, aby zobaczyć, kto jest w scenie, a kto nie, kiedy sporządzono ostatni raport oraz przycisk **Report now**, który ponownie uruchamia reżysera. Gdy reżyser odczytuje, chip pokazuje "Reading the scene…".
- **The model chip**: model reżysera. Jeśli żaden nie jest wybrany, pokazuje **Pick a model**. Kliknij go, aby zobaczyć tę samą listę modeli co na górnym pasku czatu: oznaczone gwiazdką modele, a następnie wszystkie modele według połączenia, z polem wyszukiwania.
- **The switch**: włącznik Kierunku dla tego czatu. Dopóki nie wybierzesz modelu, jest wyszarzony i pokazuje "Pick a model first".
- **Log**: ostatnie raporty (rodzaj sceny, kto był obecny, ile czasu to zajęło, ile tokenów) oraz każdy włącznik, blokada, zwolnienie i błąd, od najnowszych.

Gdy przełącznik jest wyłączony, pasek zwija się do "Direction: off", a czat działa jak wcześniej.

## Wybór modelu

Jest jeden model reżysera dla wszystkich czatów i grup. Wybierz go z dowolnego paska lub z zakładki **Direction** w grupie. Nie ma domyślnego: wybierasz sam. Mały, szybki model wystarczy: kosztuje jedno krótkie wywołanie po każdej odpowiedzi.

Nowy czat grupowy uruchamia Kierunek od razu po wybraniu modelu. Istniejące czaty nie są zmieniane. Każdy czat ma swój własny przełącznik.

## Kto jest nieobecny

Chip członka zmienia się, gdy ktoś jest poza sceną: zdjęcie jest przyciemnione i ma mały znacznik drzwi. Znacznik kłódki oznacza, że blokada (poniżej) wykluczyła tę osobę. Kliknij chip: w wyskakującym okienku pojawi się "Here" lub "Not in the scene".

Nieobecny członek nie wykonuje swoich tur, a jego karta nie jest wysyłana do modelu: tylko jedna linijka informuje, że nie ma go w scenie. Wymienienie go w swojej wiadomości nadal go przywołuje. Gdy reżyser zobaczy go z powrotem, cała jego karta wraca.

## Blokada i powrót

Aby utrzymać scenę z jedną osobą, kliknij chip członka i wybierz **Only <name> in the scene**. Chip "Only Yuzu" pojawia się przed chipem sceny, a pozostali pozostają poza nią niezależnie od tego, co mówi reżyser. Kliknij x na tym chipie lub **Release the lock** w wyskakującym okienku członka, aby zwolnić. Przy następnej odpowiedzi pozostali są informowani, że mogą wrócić, a historia jest proszona o umożliwienie im wejścia.

## Jeśli reżyser zawiedzie

Jeśli odpowiedź reżysera nie może zostać odczytana lub wywołanie się nie powiedzie, chip sceny pokazuje **No report**; otwórz go, aby zobaczyć przyczynę. Czat używa wtedy koncepcji Dashboardu, kto jest obecny, lub pozwala wszystkim odpowiadać jak wcześniej. Nic w twojej historii nie zostaje utracone.

## Nowe grupy

**New group** otwiera szerokie okno (pełny ekran na telefonie). Nazwij grupę lub pozostaw nazwę pustą, aby użyć pierwszych trzech członków. Szukaj, zawężaj za pomocą **All**, **Favourites** i **Recent**, tag chips i sortowanie (Name, Recently used, Most chats), a następnie kliknij portrety, aby wybrać. Wybrani członkowie siedzą w rzędzie na górze w kolejności mówienia; strzałki przesuwają jednego wcześniej lub później, x usuwa. **Next** wymaga dwóch postaci.

Po **Next** grupa jest tworzona, a jej edytor otwiera się z notatką: sprawdź, jak działa, a następnie rozpocznij pierwszy czat. **Start chat** jest głównym przyciskiem. Zakładka **Direction** ustawia, czy nowe czaty tej grupy zaczynają się z włączonym Kierunkiem, i pokazuje model reżysera. Grupa na stronie Groups otwiera ten sam edytor, podobnie jak nazwa grupy na górze jej czatu.

Gdy rozpoczynasz późniejszy czat grupy, krótki krok przed czatem ma przełącznik **Direction**: włączony, gdy domyślny stan grupy jest włączony i wybrano model.

Zobacz także [[characters]] i [[dashboard]].