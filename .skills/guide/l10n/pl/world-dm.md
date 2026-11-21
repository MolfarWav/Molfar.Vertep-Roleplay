<!-- source: d9b96976e29b -->
# Mistrz Świata

Mistrz Świata (World DM) to mistrz gry dla świata jednego czatu. Po odpowiedziach czyta historię i zapisuje osoby, miejsca i rzeczy, które spotyka, w lorebooku czatu, zwanym księgą świata. Na wyższych poziomach porusza też światem i wysyła wydarzenia do sceny. Użyj go, gdy chcesz, by świat wydawał się żywy i spójny.

## Poziomy

Otwórz go z nagłówka czatu "World" (na telefonie Menu, potem World) albo z sekcji **World** na pasku. Element **DM** tuż pod World na pasku (na telefonie kafelek w sekcji All) otwiera sekcję World od razu na jej zakładce DM, z poziomami, własnymi profilami i Memory. Wybierz, co robi mistrz:

- **Off**: bez wydarzeń i bez kości. Księga świata wciąż zapełnia się z historii: gdy scena wymienia nowe miejsce lub rzecz, jedno małe wywołanie pyta model mistrza, czy to zapisać.
- **Chronicler**: tylko zapisuje i nie dodaje własnych wydarzeń.
- **Living world**: frakcje i zagrożenia działają poza sceną. Wieści mogą dotrzeć do postaci jako plotka; nic nie jest wymuszane.
- **Director**: wnosi do sceny zaczepki, komplikacje i gości, a następna odpowiedź musi ich użyć.
- **Antagonist**: konsekwencje i nacisk wymierzone w to, na czym postaciom zależy.
- **Total chaos**: może się zdarzyć wszystko, niezależnie od gatunku. Nigdy nie przepisuje historii i odczekuje sceny wprost.

Domyślnie mistrz jest już włączony na poziomie Chronicler w czacie historii, od pierwszej odpowiedzi (nie w czacie, którego wszystkie karty to asystenci). Wyłącz go w arkuszu World, w sekcji Overview, jeśli go nie chcesz.

## Co robi w każdej turze

Działa po odpowiedziach, co N-tą odpowiedź ("Run after every N replies") albo od razu przez "World turn". Czyta nowe wiadomości i zapisuje lub wycofuje wpisy w księdze świata: osoby, miejsca, rzeczy i kto je trzyma. Rekordowi Grupy lub Miejsca możesz nadać **Members** (osoby, które do niego należą) w zakładce World book; fakt powiedziany tej grupie w Litopys jest wtedy znany każdej z nich ([[litopys]]). Mistrz sam nie wypełnia Members. Od Living world wzwyż porusza też frontami i zegarami i może przygotować wydarzenie, które zostanie dodane do następnej odpowiedzi. Gdy zegary porusza **Code** (World > Profiles > Options), co N odpowiedzi kod rzuca k6 za każdy front: 1-2 nic, 3-4 jeden krok, 5-6 jeden krok i mistrz dowiaduje się, że wieści z tego frontu mogą dotrzeć do historii. Opcjonalne kości (arkusz World, Dice, od Living world wzwyż, domyślnie wyłączone): przed odpowiedzią kod rzuca 2k6 i mówi modelowi, jak kończy się niepewna akcja, jako Hint lub Binding. Opcja **Pacing check, %** (szczegóły Dice, domyślnie wyłączona) dodaje drugi ukryty rzut na momenty, gdy postać użytkownika robi krok ku bliskości: jak dobrze to wypadnie, zależy od komfortu, zaufania i czułości postaci z Dashboardu, a model rozgrywa to jako niegotowość, wahanie, przyjęcie z nerwami lub powitanie. Nigdy nie blokuje odpowiedzi i nigdy nie wymienia kości.

Kosztuje jedno dodatkowe wywołanie modelu, ilekroć wypada, na "DM model (all chats)"; mały, tani model wystarczy. Nieudane uruchomienie widać w arkuszu i w Inbox, a mistrz przy następnym razie czyta te same wiadomości jeszcze raz.

Mistrz widzi każdy rekord z nazwy, ale w całości tylko te, których dotyczą nowe wiadomości: te, które wymieniają, miejsce sceny i to, co w nim jest, osoby w scenie, przypięte rekordy i osoby, które wkrótce wrócą. Dzięki temu księga z wieloma rekordami jest tania. Mistrz nadal może zmienić lub wycofać dowolny rekord.

Profil, który gra z talii wydarzeń, pokazuje "New deck", gdy talia się skończy. Model jest proszony o 8 do 12 wydarzeń; jeśli wróci ich mniej, talia zostaje taka, jaka przyszła, i ostrzeżenie mówi, że przyszła za krótka, żebyś mógł zbudować ją od nowa.

## Osoby, które wracają

Przyjaciel lub krewny z lorebooka karty może nie pojawiać się w historii przez sto wiadomości, bo wpis wychodzi tylko wtedy, gdy ktoś wymieni imię. Mistrz przywraca takie osoby. Liczy odpowiedzi od ostatniej obecności osoby w scenie (z włączonym Dashboardem samo imię w tekście to tylko wzmianka i nie zeruje licznika; daleki przyjaciel, który pisze lub dzwoni, liczy się jako obecny w scenie), a gdy cisza jest długa (około 15, 30 lub 60 odpowiedzi, według **People coming back > How often**; Normal to domyślne dla nowych czatów), mówi modelowi piszącemu, stanowczo, że osoba wchodzi do tej odpowiedzi. Ukryty rzut 2k6, plus długość ciszy i waga osoby, decyduje, jak duży jest powrót: wiadomość, telefon z prośbą albo ktoś przybywający z wieściami. Formę wybiera model; mistrz sprawdza, czy osoba się pojawiła, i pyta jeszcze raz, jeśli nie. Jeśli pisarz tylko wspomina osobę, log mówi "only mentioned, not on stage" i nie ma drugiej próby; po takim średnim lub dużym powrocie następny przychodzi po połowie zwykłej przerwy i jest co najmniej średni. Osoby z lorebooków kart dołączają do ławy przez **Take people from the cards' lorebooks** albo przełącznikiem Start "People from the lorebooks". Na rekordzie osoby lub frakcji możesz ustawić Relation, Weight i "Bring back automatically". Aby zobaczyć, jak to działa, włącz **Show under the reply**: mały znacznik mówi, kto przyszedł, dlaczego i jak wypadły kości; karta pokazuje też ławę z ciszą każdej osoby i log powrotów.

## Nowe osoby z talii obsady

Ława przywraca osoby, które historia już ma. **Talia obsady** wnosi osoby, których jeszcze nie spotkała. Talia to stos kart: imię, frakcja (grupa lub front świata), jedna osoba, która już istnieje, z którą nowa osoba jest związana (kuzyn, dłużnik, rywal), czego chce i pięć do dziesięciu zdań o niej. Mistrz nigdy nie widzi kart; gdy nikomu z ławy nie wypada wrócić, a historia milczy mniej więcej tyle, ile przy powrocie, mistrz wybiera kartę, preferując tę, której więź jest w scenie, potem tę, której frakcji front jest poruszony, potem tę, której frakcja należy do tego miejsca, i mówi modelowi piszącemu, stanowczo, że ta nowa osoba wchodzi do odpowiedzi przez tę więź. Gdy się pojawią, karta staje się osobą w księdze, członkiem swojej frakcji. Jeśli nie, karta czeka.

Start może napisać talię (przełącznik **New people for later**, z liczbą frakcji, osób w każdej i długością karty), a talia uzupełnia się sama, gdy zostają mniej niż 3 karty. W panelu World czatu karta **Cast deck** ma przełącznik, ile kart zostało, **Add new people now** i log każdego doboru i uzupełnienia. Księga ma chip **Cast deck**: karty są za **Show the cards**, bo zdradzają, co nadchodzi; możesz edytować lub usunąć kartę, a karta bez więzi jest oznaczona.

## Księga świata i jej porządki

Panel World czatu ma kafle tego, co mistrz prowadzi: **People**, **Places**, **Factions** i **Things**, potem **Archive** oraz **Fronts** i **Runs**. Naciśnij kafel, aby otworzyć księgę świata na tym typie (świat zbudowany przez Start przed historią wciąż raz pyta o spoilery; rozegrany czat otwiera się od razu). Księga to lista z wyszukiwaniem po nazwach, kluczach i tekście, kolorowymi chipami dla typu i kartami, które zwijają swój tekst; Edit, Retire, Pin i Delete działają jak dotąd. Rzecz może mieć **powód** (wskazówka, ukryta rzecz, obietnica, prezent, broń, coś, o co ludzie walczą); mistrz podaje go, gdy ją zapisuje, a ty możesz go zmienić w formularzu.

Fakty nie są już rekordami. Zwyczaj, prawo lub kawałek historii należy do tekstu miejsca lub frakcji, którą opisuje, a to, co ludzie wiedzą lub ukrywają, należy do Litopys. Księga, która wciąż ma stare notatki, pokazuje baner i kafel **Old notes**; przy każdej notatce wybierz **Fold into…** miejsce lub frakcję (jej tekst rośnie o notatkę) albo **To the Litopys** (fakt znany wszystkim, do 300 znaków).

Księga także robi sobie porządki. Co 10 odpowiedzi rzecz, którą nazwało mniej niż 3 z ostatnich 10 odpowiedzi, która do nikogo nie należy (nie trzyma jej twoja postać, postać z karty ani osoba w księdze, i nie jest w rękach postaci w Dashboardzie), nie jest przypięta i nie jest wskazówką, ukrytą rzeczą ani obietnicą, trafia do **Archive**, poza wzrok modelu piszącego historię. Wraca, gdy historia nazwie ją dwa razy albo gdy mistrz znów ją wymieni; możesz też nacisnąć **Wake**. Karta **Tidying the book** ma przełącznik, **Tidy now** (przebieg od razu; pierwszy przebieg czatu bierze tylko listę rzeczy) i log każdego zarchiwizowania i każdego wybudzenia z liczbą, która o tym zdecydowała. Osoby, miejsca i frakcje nigdy nie są porządkowane. Rekord, który usuniesz, nie zostanie znów zapisany przez mistrza, a mistrz jest informowany, które nazwy usunąłeś.

## Usuwanie lub przesuwanie odpowiedzi

Usuń odpowiedź albo przesuń na inną, a mistrz cofa to, czego dowiedział się ze starej: rekordy, zegary i czekające wydarzenie wracają do poprzedniego stanu, księga świata jest zapisywana od nowa, a mistrz czyta historię od tego miejsca jeszcze raz.

Wydarzenie jest jednorazowe. Mistrz sprawdza, czy historia je pokazała, patrząc na wszystko po odpowiedzi, która je niosła, także na część, którą już przeczytał. Jeśli nie, wydarzenie jest wysyłane jeszcze raz z następną odpowiedzią, chyba że historia przeniosła się już w inne miejsce (przeskok czasu, nowa scena): wtedy jest puszczane, żeby stare wydarzenie nie ciągnęło historii wstecz.

Rekordy zmienione ręcznie zostają, chyba że mistrz zmienił ten sam rekord później. Rekord, który usunąłeś, zostaje usunięty. Usuwanie starych wiadomości z góry, czytanie innych przesunięć starszej odpowiedzi i edycja tekstu odpowiedzi nic nie cofają.

Przesunięcie odpowiedzi, która niosła wydarzenie mistrza, wysyła wydarzenie jeszcze raz z nową odpowiedzią. Przesuń i tę, a wydarzenie jest porzucane: mistrz bierze to tak, że go nie chcesz, a Memory się z tego uczy (patrz niżej). Usunięta lub nieudana odpowiedź się nie liczy.

## Gdy kogoś nie ma już na dobre

Gdy osoba umiera, odchodzi z historii na dobre albo miejsce lub grupa zostaje zniszczona, mistrz **wycofuje** rekord; możesz to zrobić sam przez **Retire** na rekordzie (albo **Delete** go, a mistrz nie zapisze go ponownie). Wycofany rekord zostaje w księdze świata jako krótka notatka, że zniknął z historii, żeby historia pamiętała, jak się skończyło, i nigdy nie wraca sam z siebie. Wycofanie zabiera też to, co na nim wisiało: karty talii wydarzeń, które go wymieniają, karty talii obsady związane z osobą (lub należące do zniszczonej grupy) i miejsce osoby w **Members** grupy. Jeśli osoba pochodziła z lorebooka karty, ten wpis karty jest wyciszany w tym czacie, żeby jego tekst o żywej osobie nie mówił ponad notatką. Karta rekordu w księdze to wszystko wymienia. **Bring back** przywraca osobę do tych grup i odcisza wpis karty; porzucone karty zostają porzucone. Pokonany wróg, który wciąż żyje, nie jest wycofywany: wyłącz "bring back automatically" na rekordzie, jeśli nie chcesz, by wracał.

## Zakładki sekcji World

Zębatka obok nagłówka listy World otwiera **World settings**, w zwijanych blokach jak ustawienia Litopys: model gry (z przełącznikiem nadpisania go dla tego World, limitem odpowiedzi i przyciskiem testu), model budowania, model obrazów, przełącznik teł i czy informować cię o niepowodzeniach. Zwiń blok, a pokaże w jednej linii, co jest ustawione.

Na wybranym czacie: Overview (te same kontrolki co w arkuszu), Places (drzewo miejsc, z obrazem tła dla każdego miejsca; te same miejsca są też pływającą mapą nad czatem, patrz [[places-map]]), World book (czytaj, pisz, wycofuj lub usuwaj rekordy ręcznie), Runs (historia, tokeny, błędy), Start (szkicuj rekordy z kart lub krótkiego wywiadu), Backgrounds (planuj i rysuj zestaw obrazów; z włączonym "Change the background by scene" Dashboard wybiera pasujący; z także włączonym "Draw places that have no picture" (zawsze tam wymienione, wyszarzone, dopóki przełącznik sceny i generowanie obrazów nie są włączone), miejsce, do którego przenosi się historia, a które nie ma obrazu, jest rysowane na miejscu przez model obrazów World, zapisywane w folderze i ustawiane jako obraz tego miejsca w Places (gdy świat ma jego rekord); to samo miejsce ujęte innymi słowami później ("the hall at night" zamiast "The Hall") używa obrazu ponownie, zamiast rysować go od nowa; "Look of the pictures" tam przyjmuje kilka angielskich słów (na przykład `medieval fantasy, candlelight`), które są dodawane do każdego tła rysowanego dla czatu, miejsca rysowanego na miejscu lub zestawu; arkusz Display czatu ma tu link). Także **Profiles** i **Worlds**.

## Profile World

Każdy poziom to wbudowany profil: tych pięć trzyma prompty mistrza, a możesz otworzyć jeden, zmienić blok promptu i przywrócić go do domyślnego. Możesz też tworzyć własne profile na bazie poziomu. Czat wybiera swój profil w arkuszu DM. Nowe czaty zaczynają z Chronicler, chyba że naciśniesz **Make default** na innym profilu (zakładka **DM**, w nagłówku profilu): dostaje on tag *Default* i każdy nowy czat zaczyna z jego poziomem, liczbami i promptami; czaty, które już masz, zachowują swoje, a mistrz "off" jest wybierany dla czatu i nie może być domyślny. "Saved worlds" trzyma światy, które zbudowałeś i w których zaczynasz nowe czaty; "New world" buduje jeden przed jakimkolwiek czatem, z kart lub krótkiego wywiadu.

## Czego uczy się mistrz

Zakładka **DM** (Chats | Worlds | DM) zaczyna się wierszem **Memory**; kropka na zakładce i na wierszu oznacza, że czeka na ciebie propozycja, a pozycja **DM** na pasku pokazuje, ile czeka propozycji. Mistrz zauważa, co usuwasz i przepisujesz w księdze świata, i sam nigdy tego nie zmienia: gdy wzorzec jest jasny, **Memory** pokazuje propozycję z dowodami (co usunąłeś, ile to rekordów samego mistrza, próg) i trzy odpowiedzi: **This chat**, **All chats** lub **No**. Nie jest wołany żaden model. Odpowiedź zmienia jedno dokładne ustawienie: nowe ustawienie **Things in the book** (wszystkie, tylko z powodem lub żadne), długość tekstu rekordu albo to, jak często osoby wracają. "Nie" nie jest pytane ponownie, dopóki nowe edycje się nie zbiorą.

Osoby, miejsca i grupy nie mają ustawienia do przełączenia. Gdy usuniesz wiele tych, które napisał mistrz, Memory pokazuje zamiast tego **regułę słowną**: otwarcie Memory robi jedno małe wywołanie modelu budowania, który pisze regułę (jedna linia) z tego, co usunąłeś i co zachowałeś, albo nie znajduje wzorca. **Suggest a rule from my edits** prosi o nią ręcznie. Odpowiadasz tak samo; reguła dla wszystkich czatów pyta jeszcze raz w oknie dialogowym, które ją pokazuje. Mistrz czyta twoje reguły jako krótki blok, *what this player prefers* (tego czatu i wszystkich czatów razem, od najnowszej, najwyżej 10 reguł i 600 znaków; starsze, które się nie mieszczą, zostają w Memory z tagiem), a **Add a rule** też przyjmuje regułę słowną.

Wydarzenia też się liczą. Gdy przesunąłeś trzy lub więcej wydarzeń mistrza (każde dwa razy, więc zostało porzucone) i to jest trzecia część lub więcej wydarzeń, które wysłał, Memory proponuje regułę **o historii** (na przykład "Do not interrupt quiet scenes with sudden attacks"). Reguła historii ma własny tag; mistrz się jej trzyma, gdy wybiera wydarzenia, a dopóki **Tell the reply model too** jest włączone (karta **What the DM learns**), trzy najnowsze reguły historii idą też do żądania, które pisze odpowiedź, jako jedna krótka linia. Gdy dodajesz regułę słowną ręcznie, **About** wybiera księgę (co mistrz zapisuje) albo historię.

Memory pokazuje też **Kept on purpose**: rekordy, które przypiąłeś, napisałeś lub przywróciłeś ręcznie. Mistrz widzi ich nazwy jako przykłady tego, czego chcesz w księdze, a wywołanie, które pisze regułę, też je widzi.

W Memory możesz też czytać reguły w mocy (tag mówi, czy reguła dotyczy tego czatu, czy wszystkich czatów), zmienić lub usunąć jedną, dodać regułę ręcznie, zobaczyć **Remembered exactly** (nazwy, które usunąłeś, których mistrz ma nie pisać ponownie) i je wyczyścić, albo **Reset all**. Reguła dla wszystkich czatów dociera do każdego czatu przy następnym otwarciu i do nowych czatów; wartość ustawiona ręcznie w czacie później zostaje. Reguły nie podróżują z zapisanym światem. Edytor profilu kończy się kartą tylko do czytania, **Learned memory**, pokazującą, co jest dodawane do wejścia mistrza. W arkuszu World DM czatu karta **What the DM learns** ma przełącznik ("Propose from my edits"), przełącznik **Tell the reply model too**, ustawienie rzeczy, ile wyuczonych reguł jest w mocy i log każdej propozycji i odpowiedzi.

Powiązane: [[memory]], [[dashboard]], [[meanwhile]]. Artykuły Pomocy *World profiles* i *Starting a world* mają zrzuty ekranu.
