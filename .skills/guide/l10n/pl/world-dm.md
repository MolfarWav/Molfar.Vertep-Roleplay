<!-- source: 7f22fb579576 -->
# World DM

World DM to mistrz gry dla świata jednego czatu. Po odpowiedziach czyta historię i trzyma napotkane osoby, miejsca i rzeczy we własnej księdze wiedzy czatu, zwanej księgą świata. Na wyższych poziomach porusza też światem i wysyła zdarzenia do sceny. Używaj go, gdy chcesz, aby świat wydawał się żywy i spójny.

## Poziomy

Otwórz go z nagłówka czatu „World” (na telefonie Menu, potem World) albo z sekcji **World** na pasku. Wybierz, co robi DM:

- **Off**: brak zdarzeń i kości. Księga świata wciąż zapełnia się z historii: gdy scena nazwie nowe miejsce lub rzecz, jedno małe wywołanie pyta model DM, czy je zapisać.
- **Chronicler**: tylko zapisuje i nie dodaje własnych zdarzeń.
- **Living world**: frakcje i zagrożenia poruszają się poza ekranem. Wieści mogą docierać do postaci jako plotka; nic nie jest wymuszane.
- **Director**: wprowadza do sceny zaczepki, komplikacje i gości, a następna odpowiedź musi ich użyć.
- **Antagonist**: konsekwencje i presja wymierzone w to, na czym zależy postaciom.
- **Total chaos**: wszystko może się zdarzyć, niezależnie od gatunku. Nigdy nie przepisuje historii i czeka poza jawnymi scenami.

Domyślnie DM jest już włączony na poziomie Chronicler w czacie fabularnym, od pierwszej odpowiedzi (nie dla czatu, którego wszystkie karty są asystentami). Wyłącz go w Overview arkusza World, jeśli go nie chcesz.

## Co robi w każdej turze

Działa po odpowiedziach, co N-tą odpowiedź („Run after every N replies”) albo od razu przez „World turn”. Czyta nowe wiadomości i zapisuje lub wycofuje rekordy w księdze świata: osoby, miejsca, rzeczy i to, kto je trzyma. Rekordom typu Group lub Place możesz nadać **Members** (osoby, które do nich należą) w zakładce księgi świata; fakt przekazany tej grupie w Litopys jest wtedy znany każdemu z nich ([[litopys]]). DM sam nie wypełnia Members. Od Living world w górę porusza też fronty i zegary oraz może przygotować zdarzenie dodawane do następnej odpowiedzi. Gdy **Code** porusza zegarami (World > Profiles > Options), kod co N odpowiedzi rzuca k6 dla każdego frontu: 1-2 nic, 3-4 jeden krok, 5-6 jeden krok, a DM dostaje informację, że wieści o tym froncie mogą dotrzeć do historii. Opcjonalne kości (arkusz World, Dice, od Living world w górę, domyślnie wyłączone): przed odpowiedzią kod rzuca 2k6 i mówi modelowi, jak kończy się niepewna akcja, jako Hint lub Binding. Opcja **Pacing check, %** (Dice details, domyślnie wyłączona) dodaje drugi, ukryty rzut dla chwil, w których postać użytkownika robi krok w stronę zbliżenia: to, jak wypada ten krok, zależy od komfortu, zaufania i sympatii postaci z Pulpitu, a model odgrywa to jako brak gotowości, wahanie, przyjęcie z nerwami albo powitanie. Nigdy nie blokuje odpowiedzi i nigdy nie wymienia kości.

Kosztuje jedno dodatkowe wywołanie modelu, gdy wypada jego kolej, na „DM model (all chats)”; wystarczy mały, tani model. Nieudany przebieg jest pokazany w arkuszu i w Skrzynce odbiorczej, a DM czyta te same wiadomości następnym razem.

DM widzi każdy rekord z nazwy, ale w całości tylko te, których dotyczą nowe wiadomości: te, które nazywają, miejsce sceny i to, co tam leży, osoby w scenie, przypięte rekordy i osoby, które za chwilę wrócą. Dzięki temu księga z wieloma rekordami pozostaje tania. DM nadal może zmienić lub wycofać każdy rekord.

Profil, który gra z talii zdarzeń, pokazuje „New deck”, gdy talia się wyczerpie. Model jest proszony o 8 do 12 zdarzeń; jeśli wróci ich mniej, talia zostaje taka, jaka przyszła, a ostrzeżenie mówi, że wróciła za krótka, żeby można było zbudować ją ponownie.

## Ludzie, którzy wracają

Przyjaciel lub krewny z lorebooka karty może nie pojawiać się w opowieści przez sto wiadomości, bo wpis pojawia się tylko wtedy, gdy ktoś wypowie imię. DM sprowadza takie osoby z powrotem. Liczy odpowiedzi od chwili, gdy dana osoba ostatnio była w scenie (przy włączonym Pulpicie samo imię w tekście to tylko wzmianka i nie resetuje licznika; daleki przyjaciel, który pisze lub dzwoni, liczy się jako obecny w scenie), a gdy cisza trwa długo (około 15, 30 lub 60 odpowiedzi, według **People coming back > How often**; Normal to domyślne ustawienie w nowych czatach), stanowczo mówi modelowi piszącemu, że ta osoba ma pojawić się w tej odpowiedzi. Ukryty rzut 2d6 oraz długość ciszy i to, jak dużą wagę ma dana osoba, decydują o skali powrotu: wiadomość, telefon z prośbą albo ktoś, kto przybywa z nowinami. Model wybiera formę; DM sprawdza, czy osoba się pojawiła, a jeśli nie, prosi o to jeszcze raz. Jeśli pisarz tylko wspomina osobę, dziennik mówi "only mentioned, not on stage" (tylko wspomniana, nie na scenie) i nie ma drugiej próby; po takim średnim lub dużym powrocie następny przychodzi po połowie zwykłej przerwy i jest co najmniej średni. Osoby z lorebooków kart dołączają do ławki przez **Take people from the cards' lorebooks** lub przełącznik Start „People from the lorebooks”. Na karcie osoby lub frakcji możesz ustawić Relation, Weight i „Bring back automatically”. Aby zobaczyć, jak to działa, włącz **Show under the reply**: mały znacznik informuje, kto wrócił, dlaczego i jak padły kości; karta pokazuje też ławkę z ciszą każdej osoby i dziennikiem powrotów.

## Nowe osoby z talii obsady

Ławka przywraca osoby, które historia już zna. **Talia obsady** wprowadza osoby, których jeszcze nie poznała. Talia to stos kart: imię, frakcja (grupa albo front świata), jedna osoba, która już istnieje i z którą nowa osoba jest związana (kuzyn, dłużnik, rywal), czego ta osoba chce oraz pięć do dziesięciu zdań o niej. DM nigdy nie widzi kart. Gdy nikt z ławki nie jest w kolejce, a historia milczy tyle samo co przy powrocie, DM wybiera kartę: najpierw taką, której więź jest w scenie, potem taką, której front frakcji się porusza, a dalej taką, której frakcja należy do tego miejsca. Następnie stanowczo mówi modelowi piszącemu, że ta nowa osoba wchodzi do odpowiedzi przez tę więź. Kiedy się pojawi, karta staje się osobą w księdze, członkiem swojej frakcji. Jeśli się nie pojawi, karta czeka.

Start może napisać talię (przełącznik **New people for later**, z liczbą frakcji, liczbą osób w każdej z nich i długością karty), a talia uzupełnia się sama, gdy zostaje mniej niż 3 karty. W panelu World czatu karta **Cast deck** ma przełącznik, liczbę pozostałych kart, **Add new people now** oraz dziennik każdego losowania i uzupełnienia. Księga ma znacznik **Cast deck**: karty są za **Show the cards**, bo zdradzają, co nadchodzi. Kartę można edytować lub usunąć, a kartę bez więzi oznaczono.

## Księga świata i jej porządkowanie

Panel World czatu ma kafelki dla tego, co DM przechowuje: **People**, **Places**, **Factions** i **Things**, potem **Archive** oraz **Fronts** i **Runs**. Naciśnij kafelek, aby otworzyć księgę świata na tym typie (świat zbudowany przez Start przed opowieścią pyta jeszcze raz o pytanie o spoilery; grany czat otwiera się od razu). Księga to lista z wyszukiwaniem po nazwach, kluczach i tekście, kolorowe znaczniki typów i karty, które zwijają tekst; **Edit**, **Retire**, **Pin** i **Delete** działają jak dawniej. Rzecz może mieć **reason** (wskazówkę, ukrytą rzecz, obietnicę, prezent, broń, coś, o co ludzie walczą); DM podaje go, gdy zapisuje rekord, a ty możesz go zmienić w formularzu.

Fakty nie są już rekordami. Zwyczaj, prawo czy kawałek historii należy do tekstu miejsca lub frakcji, którą opisuje, a to, co ludzie wiedzą lub ukrywają, należy do Litopys. Księga ze starymi notatkami pokazuje baner i kafelek **Old notes**; przy każdej notatce wybierz **Fold into…** miejsce lub frakcję (jej tekst rośnie o notatkę) albo **To the Litopys** (fakt znany wszystkim, do 300 znaków).

Księga też sama się porządkuje. Co 10 odpowiedzi rzecz, którą w ostatnich 10 odpowiedziach wymieniono mniej niż 3 razy, która nikomu nie należy (nie trzyma jej twoja postać, postać z karty ani osoba w księdze, ani nie jest w rękach postaci na Pulpicie), nie jest przypięta i nie jest wskazówką, ukrytą rzeczą ani obietnicą, trafia do **Archive**, poza zasięg modelu historii. Wraca, gdy historia wymieni jej nazwę dwa razy albo gdy DM wymieni ją ponownie; możesz też nacisnąć **Wake**. Karta **Tidying the book** ma przełącznik, **Tidy now** (przebieg od razu; pierwszy przebieg czatu tylko pobiera listę rzeczy) oraz dziennik każdego przeniesienia i każdego wybudzenia z liczbą, która o tym zdecydowała. Osoby, miejsca i frakcje nigdy nie są usuwane przez porządkowanie. Rekord, który usuniesz, nie jest zapisywany ponownie przez DM, a DM dostaje informację, jakie nazwy usunąłeś.

## Usuwanie lub przełączanie odpowiedzi

Usuń odpowiedź albo przełącz się na inną, a DM cofa to, czego nauczył się ze starej: rekordy, zegary i czekające zdarzenie wracają do stanu sprzed niej, księga świata jest zapisywana od nowa, a DM czyta historię ponownie od tego miejsca.

Zdarzenie jest jednorazowe. DM sprawdza, czy historia je pokazała, patrząc na wszystko po odpowiedzi, która je niosła, także na część, którą już przeczytał. Jeśli nie, zdarzenie jest wysyłane jeszcze raz z następną odpowiedzią, chyba że historia przeniosła się już w inne miejsce (przeskok w czasie, nowa scena): wtedy zostaje puszczone, żeby stare zdarzenie nie ciągnęło historii z powrotem.

Rekordy, które zmieniłeś ręcznie, zostają, chyba że DM zmienił ten sam rekord później. Rekord, który usunąłeś, pozostaje usunięty. Usuwanie starych wiadomości od góry, czytanie innych swipe'ów starszej odpowiedzi i edycja tekstu odpowiedzi niczego nie cofają.

## Karty sekcji World

Zębatka obok nagłówka listy World otwiera **World settings**, w składanych blokach jak Litopys settings: model gry (z przełącznikiem, który pozwala nadpisać go dla tego World, limit odpowiedzi i przycisk testu), model budowania, model obrazów, przełącznik teł i to, czy dostajesz informację o błędach. Złożony blok pokazuje w jednej linijce, co jest ustawione.

Na wybranym czacie: Overview (te same ustawienia co arkusz), Places (drzewo miejsc, z obrazem tła dla każdego miejsca), World book (czytaj, zapisuj, wycofuj lub usuwaj rekordy ręcznie), Runs (historia, tokeny, błędy), Start (szkic rekordów z kart lub krótkiego wywiadu), Backgrounds (zaplanuj i narysuj zestaw obrazów; przy włączonym „Change the background by scene” Pulpit wybiera pasujący; przy włączonym także „Draw places that have no picture” (zawsze tam widoczne, wyszarzone, dopóki nie włączysz zmiany sceny i generowania obrazów) miejsce, do którego przenosi się historia i które nie ma obrazu, jest rysowane od razu przez model obrazów Świata i zapisywane w folderze; „Look of the pictures” w tym miejscu przyjmuje kilka angielskich słów (na przykład `medieval fantasy, candlelight`), które są dodawane do każdego tła narysowanego dla czatu, miejsca narysowanego od razu lub zestawu; arkusz Display czatu ma tu link). Także **Profiles** i **Worlds**.

## Profile światów

Każdy poziom to wbudowany profil: tych pięć trzyma prompty DM, a ty możesz otworzyć jeden, zmienić blok promptu i przywrócić go do domyślnego. Możesz też tworzyć własne profile na bazie poziomu. Czat wybiera swój profil w arkuszu DM. Nowe czaty zaczynają się z Chronicler, chyba że naciśniesz **Make default** na innym profilu (zakładka Profiles, w nagłówku profilu): dostaje on tag *Default* i każdy nowy czat zaczyna się z jego poziomem, liczbami i promptami; czaty, które już masz, zachowują swoje własne, a DM „off” jest wybierany dla każdego czatu i nie może być domyślnym. „Saved worlds” trzyma światy, które zbudowałeś i w których zaczynasz nowe czaty; „New world” buduje jeden przed jakimkolwiek czatem, z kart lub krótkiego wywiadu.

Powiązane: [[memory]], [[dashboard]]. Artykuły Pomocy *World profiles* i *Starting a world* pokazują ekrany.
