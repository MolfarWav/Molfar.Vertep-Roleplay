<!-- source: f156e3f1ac93 -->
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

Profil, który gra z talii zdarzeń, pokazuje „New deck”, gdy talia się wyczerpie. Model jest proszony o 8 do 12 zdarzeń; jeśli wróci ich mniej, talia zostaje taka, jaka przyszła, a ostrzeżenie mówi, że wróciła za krótka, żeby można było zbudować ją ponownie.

## Usuwanie lub przełączanie odpowiedzi

Usuń odpowiedź albo przełącz się na inną, a DM cofa to, czego nauczył się ze starej: rekordy, zegary i czekające zdarzenie wracają do stanu sprzed niej, księga świata jest zapisywana od nowa, a DM czyta historię ponownie od tego miejsca.

Rekordy, które zmieniłeś ręcznie, zostają, chyba że DM zmienił ten sam rekord później. Rekord, który usunąłeś, pozostaje usunięty. Usuwanie starych wiadomości od góry, czytanie innych swipe'ów starszej odpowiedzi i edycja tekstu odpowiedzi niczego nie cofają.

## Karty sekcji World

Zębatka obok nagłówka listy World otwiera **World settings**, w składanych blokach jak Litopys settings: model gry (z przełącznikiem, który pozwala nadpisać go dla tego World), limit odpowiedzi i przycisk testu, model budowania, model obrazów, przełącznik teł i to, czy dostajesz informację o błędach. Złożony blok pokazuje w jednej linijce, co jest ustawione.

Na wybranym czacie: Overview (te same ustawienia co arkusz), Places (drzewo miejsc, z obrazem tła dla każdego miejsca), World book (czytaj, zapisuj, wycofuj lub usuwaj rekordy ręcznie), Runs (historia, tokeny, błędy), Start (szkic rekordów z kart lub krótkiego wywiadu), Backgrounds (zaplanuj i narysuj zestaw obrazów; przy włączonym „Change the background by scene” Pulpit wybiera pasujący; przy włączonym także „Draw places that have no picture” (zawsze tam widoczne, wyszarzone, dopóki nie włączysz zmiany sceny i generowania obrazów) miejsce, do którego przenosi się historia i które nie ma obrazu, jest rysowane od razu przez model obrazów Świata i zapisywane w folderze; „Look of the pictures” w tym miejscu przyjmuje kilka angielskich słów (na przykład `medieval fantasy, candlelight`), które są dodawane do każdego tła narysowanego dla czatu, miejsca narysowanego od razu lub zestawu; arkusz Display czatu ma tu link). Także **Profiles** i **Worlds**.

## Profile światów

Każdy poziom to wbudowany profil: tych pięć trzyma prompty DM, a ty możesz otworzyć jeden, zmienić blok promptu i przywrócić go do domyślnego. Możesz też tworzyć własne profile na bazie poziomu. Czat wybiera swój profil w arkuszu DM. „Saved worlds” trzyma światy, które zbudowałeś i w których zaczynasz nowe czaty; „New world” buduje jeden przed jakimkolwiek czatem, z kart lub krótkiego wywiadu.

Powiązane: [[memory]], [[dashboard]]. Artykuły Pomocy *World profiles* i *Starting a world* pokazują ekrany.
