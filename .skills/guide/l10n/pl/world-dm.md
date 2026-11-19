<!-- source: d251e318a72f -->
# World DM

World DM to mistrz gry dla świata jednego czatu. Po odpowiedziach czyta historię i zapisuje osoby, miejsca i rzeczy, które napotyka, w księdze wiedzy tego czatu, zwanej księgą świata. Na wyższych poziomach porusza także światem i wysyła wydarzenia do sceny. Używaj go, gdy chcesz, aby świat wydawał się żywy i spójny.

## Poziomy

Otwórz go z nagłówka czatu "World" (na telefonie Menu, potem World) lub z sekcji **World** na pasku. Wybierz, co robi DM:

- **Off**: brak wydarzeń i brak kości. Księga świata nadal wypełnia się z historii: gdy scena wymienia nowe miejsce lub rzecz, jedno małe wywołanie pyta model DM, czy to zapisać.
- **Chronicler**: tylko zapisuje i nie dodaje własnych wydarzeń.
- **Living world**: frakcje i zagrożenia poruszają się poza ekranem. Wieści mogą dotrzeć do postaci jako pogłoska; nic nie jest wymuszane.
- **Director**: wnosi haczyki, komplikacje i gości do sceny, a następna odpowiedź musi ich użyć.
- **Antagonist**: konsekwencje i presja wymierzone w to, na czym postaciom zależy.
- **Total chaos**: może się zdarzyć wszystko, niezależnie od gatunku. Nigdy nie przepisuje historii i czeka, aż sceny jawne się skończą.

Domyślnie DM jest już włączony na poziomie Chronicler w czacie fabularnym, od swojej pierwszej odpowiedzi (nie dotyczy czatu, którego wszystkie karty to asystenci). Wyłącz go w zakładce Overview arkusza World, jeśli go nie chcesz.

## Co robi w każdej turze

Uruchamia się po odpowiedziach, co N-tą odpowiedź ("Run after every N replies") lub od razu przez "World turn". Czyta nowe wiadomości i zapisuje lub wycofuje wpisy w księdze świata: osoby, miejsca, rzeczy i kto je posiada. Możesz przypisać wpisowi Grupy lub Miejsca **Members** (osoby, które do niego należą) w zakładce World book; fakt powiedziany tej grupie w Litopys jest wtedy znany każdej z nich ([[litopys]]). DM sam nie wypełnia Members. Od Living world wzwyż porusza także frontami i zegarami i może przygotować wydarzenie, które zostanie dodane do następnej odpowiedzi. Gdy **Code** porusza zegarami (World > Profiles > Options), co N odpowiedzi kod rzuca k6 za każdy front: 1-2 nic, 3-4 jeden krok, 5-6 jeden krok, a DM zostaje poinformowany, że wieści o tym froncie mogą dotrzeć do historii. Opcjonalne kości (arkusz World, Dice, od Living world wzwyż, domyślnie wyłączone): przed odpowiedzią kod rzuca 2k6 i mówi modelowi, jak kończy się niepewna akcja, jako Hint lub Binding. Opcja **Pacing check, %** (szczegóły Dice, domyślnie wyłączona) dodaje drugi ukryty rzut na momenty, gdy postać użytkownika robi krok ku bliskości: jak dobrze wypadnie, zależy od komfortu, zaufania i uczucia postaci z Dashboard, a model odgrywa to jako niegotowość, wahanie, akceptację z nerwami lub otwartość. Nigdy nie blokuje odpowiedzi i nigdy nie wymienia kości.

Kosztuje jedno dodatkowe wywołanie modelu, ilekroć jest należne, na "DM model (all chats)"; wystarczy mały, tani model. Nieudane uruchomienie jest pokazane w arkuszu i w Inbox, a DM czyta te same wiadomości ponownie następnym razem.

DM widzi każdy wpis z nazwy, ale tylko te, których dotyczą nowe wiadomości, w całości: te, które wymieniają, miejsce sceny i to, co się tam znajduje, osoby w scenie, przypięte wpisy i osoby, które wkrótce wrócą. To utrzymuje księgę z wieloma wpisami tanią. DM nadal może zmienić lub wycofać dowolny wpis.

Profil, który gra z talii wydarzeń, pokazuje "New deck", gdy talia się wyczerpie. Model jest proszony o 8 do 12 wydarzeń; jeśli wróci ich mniej, talia zostaje taka, jaka przyszła, a ostrzeżenie mówi, że wróciła za krótka, więc możesz zbudować ją ponownie.

## Osoby, które wracają

Przyjaciel lub krewny z księgi wiedzy karty może pozostać poza historią przez sto wiadomości, bo wpis pojawia się tylko wtedy, gdy ktoś wymieni imię. DM przywraca takie osoby. Liczy odpowiedzi od ostatniej obecności osoby w scenie (z włączonym Dashboard samo imię w tekście to tylko wzmianka i nie resetuje licznika; daleki przyjaciel, który pisze lub dzwoni, liczy się jako obecny w scenie), a gdy cisza jest długa (około 15, 30 lub 60 odpowiedzi, według **People coming back > How often**; Normal to domyślne dla nowych czatów), mówi modelowi piszącemu, stanowczo, że osoba wchodzi do tej odpowiedzi. Ukryty rzut 2k6 plus długość ciszy i waga osoby decydują, jak duży jest powrót: wiadomość, telefon z prośbą lub ktoś przybywający z wieściami. Model wybiera formę; DM sprawdza, czy osoba się pojawiła, i pyta jeszcze raz, jeśli nie. Jeśli pisarz tylko wspomina osobę, log mówi "only mentioned, not on stage" i nie ma drugiej próby; po takim średnim lub dużym powrocie następny przychodzi po połowie zwykłej pauzy i jest co najmniej średni. Osoby z ksiąg wiedzy kart dołączają do ławki przez **Take people from the cards' lorebooks** lub przez przełącznik Start "People from the lorebooks". Na wpisie osoby lub frakcji możesz ustawić Relation, Weight i "Bring back automatically". Aby zobaczyć, jak to działa, włącz **Show under the reply**: mały znacznik mówi, kto przyszedł, dlaczego i jak wypadły kości; karta pokazuje też ławkę z ciszą każdej osoby i log powrotów.

## Nowe osoby z talii obsady

Ławka przywraca osoby, które historia już ma. **Talia obsady** wprowadza osoby, których jeszcze nie spotkała. Talia to stos kart: imię, frakcja (grupa lub front świata), jedna istniejąca już osoba, z którą nowa jest związana (kuzyn, dłużnik, rywal), czego chce i od pięciu do dziesięciu zdań o niej. DM nigdy nie widzi kart; gdy żadna osoba z ławki nie jest należna, a historia milczy mniej więcej tak długo jak przy powrocie, DM wybiera kartę, preferując tę, której więź jest w scenie, potem tę, której frakcji front jest poruszony, potem tę, której frakcja należy do tego miejsca, i mówi modelowi piszącemu, stanowczo, że ta nowa osoba wchodzi do odpowiedzi przez tę więź. Gdy się pojawi, karta staje się osobą w księdze, członkiem swojej frakcji. Jeśli nie, karta czeka.

Start może napisać talię (przełącznik **New people for later**, z liczbą frakcji, osób w każdej i długością karty), a talia uzupełnia się sama, gdy zostanie mniej niż 3 karty. W panelu World czatu karta **Cast deck** ma przełącznik, ile kart zostało, **Add new people now** i log każdego doboru i uzupełnienia. Księga ma chip **Cast deck**: karty są za **Show the cards**, bo zdradzają, co nadchodzi; możesz edytować lub usunąć kartę, a karta bez więzi jest oznaczona.

## Księga świata i jej porządkowanie

Panel World czatu ma kafle tego, co DM przechowuje: **People**, **Places**, **Factions** i **Things**, potem **Archive** oraz **Fronts** i **Runs**. Naciśnij kafelek, aby otworzyć księgę świata na tym typie (świat zbudowany przez Start przed historią nadal pyta raz o spojler; rozegrany czat otwiera się od razu). Księga to lista z wyszukiwaniem po nazwach, kluczach i tekście, kolorowymi chipami dla każdego typu i kartami, które składają swój tekst; Edit, Retire, Pin i Delete działają jak wcześniej. Rzecz może mieć **reason** (wskazówkę, ukrytą rzecz, obietnicę, prezent, broń, coś, o co ludzie walczą); DM podaje ją, gdy ją zapisuje, a ty możesz ją zmienić w formularzu.

Fakty nie są już wpisami. Zwyczaj, prawo lub kawałek historii należy do tekstu miejsca lub frakcji, którą opisuje, a to, co ludzie wiedzą lub ukrywają, należy do Litopys. Księga, która wciąż ma stare notatki, pokazuje baner i kafelek **Old notes**; na każdej notatce wybierz **Fold into…** miejsce lub frakcję (jej tekst rośnie o notatkę) albo **To the Litopys** (fakt, który znają wszyscy, do 300 znaków).

Księga także sama się porządkuje. Co 10 odpowiedzi rzecz, którą nazwało mniej niż 3 z ostatnich 10 odpowiedzi, która do nikogo nie należy (nie jest trzymana przez twoją postać, postać z karty lub osobę w księdze i nie jest w rękach postaci w Dashboard), nie jest przypięta i nie jest wskazówką, ukrytą rzeczą ani obietnicą, trafia do **Archive**, poza zasięg wzroku modelu historii. Wraca, gdy historia nazwie ją dwa razy lub gdy DM nazwie ją ponownie; możesz też nacisnąć **Wake**. Karta **Tidying the book** ma przełącznik, **Tidy now** (przebieg od razu; pierwszy przebieg czatu bierze tylko listę rzeczy) i log każdego archiwizowania i każdego wybudzenia z liczbą, która zdecydowała. Osoby, miejsca i frakcje nigdy nie są porządkowane. Wpis, który usuniesz, nie jest ponownie zapisywany przez DM, a DM jest informowany, które nazwy usunąłeś.

## Usuwanie lub przesuwanie odpowiedzi

Usuń odpowiedź lub przesuń na inną, a DM cofa to, czego się z niej nauczył: wpisy, zegary i czekające wydarzenie wracają do poprzedniego stanu, księga świata jest zapisywana ponownie, a DM czyta historię od nowa od tego miejsca.

Wydarzenie jest jednorazowe. DM sprawdza, czy historia je pokazała, patrząc na wszystko po odpowiedzi, która je niosła, także na część, którą już przeczytał. Jeśli nie, wydarzenie jest wysyłane jeszcze raz z następną odpowiedzią, chyba że historia przeniosła się już w inne miejsce (przeskok w czasie, nowa scena): wtedy jest puszczane, aby stare wydarzenie nie ciągnęło historii wstecz.

Wpisy zmienione ręcznie zostają, chyba że DM zmienił ten sam wpis później. Wpis, który usunąłeś, pozostaje usunięty. Usuwanie starych wiadomości od góry, czytanie innych przesunięć starszej odpowiedzi i edytowanie tekstu odpowiedzi niczego nie cofają.

Przesunięcie odpowiedzi, która niosła wydarzenie DM, wysyła wydarzenie ponownie z nową odpowiedzią. Przesuń i tę, a wydarzenie jest porzucane: DM przyjmuje, że go nie chcesz, a Memory się z tego uczy (patrz niżej). Usunięta lub nieudana odpowiedź nie jest liczona.

## Gdy kogoś nie ma na dobre

Gdy osoba umiera, odchodzi z historii na dobre lub miejsce bądź grupa zostaje zniszczona, DM **wycofuje** wpis; możesz to zrobić sam przez **Retire** na wpisie (lub **Delete** go, a DM nie zapisze go ponownie). Wycofany wpis zostaje w księdze świata jako krótka notatka mówiąca, że zniknął z historii, więc historia pamięta, jak się skończył, i nigdy nie wraca sam z siebie. Wycofanie zabiera też to, co na nim wisiało: karty talii wydarzeń, które go wymieniają, karty talii obsady związane z osobą (lub należące do zniszczonej grupy) oraz miejsce osoby w **Members** grupy. Jeśli osoba pochodziła z księgi wiedzy karty, ten wpis karty jest wyciszony w tym czacie, aby jego tekst o żywej osobie nie mówił głośniej niż notatka. Karta wpisu w księdze wymienia to wszystko. **Bring back** przywraca osobę do tych grup i odcisza wpis karty; porzucone karty pozostają porzucone. Pokonany wróg, który wciąż żyje, nie jest wycofywany: wyłącz "bring back automatically" na wpisie, jeśli nie chcesz, aby wracał.

## Zakładki sekcji World

Zębatka obok nagłówka listy World otwiera **World settings**, w zwijanych blokach jak ustawienia Litopys: model gry (z przełącznikiem nadpisania go dla tego World, limitem odpowiedzi i przyciskiem testu), model budowania, model obrazów, przełącznik teł i czy informować cię o niepowodzeniach. Zwiń blok, a pokaże w jednej linii, co jest ustawione.

Na wybranym czacie: Overview (te same kontrolki co w arkuszu), Places (drzewo miejsc, z obrazem tła dla każdego miejsca; te same miejsca są też pływającą mapą nad czatem, patrz [[places-map]]), World book (czytaj, pisz, wycofuj lub usuwaj wpisy ręcznie), Runs (historia, tokeny, błędy), Start (szkicuj wpisy z kart lub krótkiego wywiadu), Backgrounds (planuj i rysuj zestaw obrazów; przy włączonym "Change the background by scene" Dashboard wybiera pasujący; przy także włączonym "Draw places that have no picture" (zawsze tam wymienionym, wyszarzonym, dopóki przełącznik sceny i generowanie obrazów nie są włączone) miejsce, do którego przenosi się historia, a które nie ma obrazu, jest rysowane na miejscu przez model obrazów World, zapisywane w folderze i ustawiane jako obraz tego miejsca w Places (gdy świat ma jego wpis); to samo miejsce ujęte inaczej później ("the hall at night" dla "The Hall") używa obrazu ponownie zamiast rysować go od nowa; "Look of the pictures" przyjmuje tam kilka angielskich słów (na przykład `medieval fantasy, candlelight`), które są dodawane do każdego tła rysowanego dla czatu, miejsca rysowanego na miejscu lub zestawu; arkusz Display czatu ma tu link). Także **Profiles** i **Worlds**.

## Profile World

Każdy poziom to wbudowany profil: tych pięć przechowuje prompty DM, a ty możesz otworzyć jeden, zmienić blok promptu i przywrócić go do domyślnego. Możesz też tworzyć własne profile na bazie poziomu. Czat wybiera swój profil w arkuszu DM. Nowe czaty zaczynają z Chronicler, chyba że naciśniesz **Make default** na innym profilu (zakładka **DM**, w nagłówku profilu): dostaje tag *Default* i każdy nowy czat zaczyna z jego poziomem, liczbami i promptami; czaty, które już masz, zachowują swoje, a DM "off" jest wybierany per czat i nie może być domyślny. "Saved worlds" przechowuje światy, które zbudowałeś i w których zaczynasz nowe czaty; "New world" buduje jeden przed jakimkolwiek czatem, z kart lub krótkiego wywiadu.

## Czego uczy się DM

Zakładka **DM** (Chats | Worlds | DM) zaczyna się od wiersza **Memory**; kropka na zakładce i na wierszu oznacza, że czeka na ciebie propozycja. DM zauważa, co usuwasz i przepisujesz w księdze świata, i sam nigdy tego nie zmienia: gdy wzorzec jest jasny, **Memory** pokazuje propozycję z dowodami (co usunąłeś, ile to jest z własnych wpisów DM, próg) i trzy odpowiedzi: **This chat**, **All chats** lub **No**. Żaden model nie jest do tego wywoływany. Odpowiedź zmienia jedno konkretne ustawienie: nowe ustawienie **Things in the book** (wszystkie, tylko z reason lub żadne), długość tekstu wpisu lub to, jak często osoby wracają. "Nie" nie jest pytane ponownie, dopóki nie zbiorą się świeże edycje.

Osoby, miejsca i grupy nie mają ustawienia do przełączenia. Gdy usuniesz wiele z tych, które napisał DM, Memory pokazuje zamiast tego **regułę słowną**: otwarcie Memory robi jedno małe wywołanie modelu budowania, który pisze regułę (jedna linia) z tego, co usunąłeś i co zachowałeś, albo nie znajduje wzorca. **Suggest a rule from my edits** prosi o nią ręcznie. Odpowiadasz tak samo; reguła dla wszystkich czatów pyta jeszcze raz w oknie dialogowym, które ją pokazuje. DM czyta twoje reguły jako krótki blok, *what this player prefers* (reguły tego czatu i wszystkich czatów razem, najnowsze pierwsze, co najwyżej 10 reguł i 600 znaków; starsze, które się nie mieszczą, zostają w Memory z tagiem), a **Add a rule** przyjmuje też regułę słowną.

Wydarzenia też się liczą. Gdy przesunąłeś trzy lub więcej wydarzeń DM (każde dwa razy, więc zostało porzucone), a to trzecia część lub więcej wysłanych wydarzeń, Memory proponuje regułę **o historii** (na przykład "Do not interrupt quiet scenes with sudden attacks"). Reguła historii ma własny tag; DM się jej trzyma, gdy wybiera wydarzenia, a dopóki **Tell the reply model too** jest włączone (karta **What the DM learns**), trzy najnowsze reguły historii trafiają też do żądania, które pisze odpowiedź, jako jedna krótka linia. Gdy dodajesz regułę słowną ręcznie, **About** wybiera księgę (co DM zapisuje) lub historię.

Memory pokazuje też **Kept on purpose**: wpisy, które przypiąłeś, napisałeś lub przywróciłeś ręcznie. DM widzi ich nazwy jako przykłady tego, czego chcesz w księdze, a wywołanie, które pisze regułę, też je widzi.

W Memory możesz też czytać reguły w mocy (tag mówi, czy reguła jest dla tego czatu, czy dla wszystkich czatów), zmienić lub usunąć jedną, dodać regułę ręcznie, zobaczyć **Remembered exactly** (nazwy, które usunąłeś, których DM ma nie zapisywać ponownie) i je wyczyścić, albo **Reset all**. Reguła dla wszystkich czatów dociera do każdego czatu przy następnym otwarciu i do nowych czatów; wartość ustawiona ręcznie w czacie później zostaje. Reguły nie podróżują z zapisanym światem. Edytor profilu kończy się kartą tylko do odczytu, **Learned memory**, pokazującą, co jest dodawane do wejścia DM. W arkuszu World DM czatu karta **What the DM learns** ma przełącznik ("Propose from my edits"), przełącznik **Tell the reply model too**, ustawienie rzeczy, ile wyuczonych reguł jest w mocy i log każdej propozycji i odpowiedzi.

Powiązane: [[memory]], [[dashboard]]. Artykuły pomocy *World profiles* i *Starting a world* mają zrzuty ekranu.
