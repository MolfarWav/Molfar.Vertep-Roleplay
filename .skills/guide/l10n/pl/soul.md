<!-- source: e0c72ba92f2d -->
# Dusza postaci

Dusza to temperament postaci wobec ciebie: jak cię traktuje, gdy historia się zaczyna, jak szybko rośnie każde uczucie i co ją bardziej rani albo cieszy. To wejście liczb relacji Pulpitu ([[dashboard]]). Ta strona jest ci potrzebna, jeśli chcesz, żeby postać reagowała po swojemu, albo jeśli zastanawiasz się, skąd wzięła się propozycja.

## Co zawiera dusza

Klasę (romantic, ally, neutral lub hostile), zaimki, wartości początkowe zaufania, komfortu, pociągu, szacunku i sympatii (od -20 do +20; 0 to obcy), cechy (dominacja, pewność siebie, nieśmiałość, cierpliwość, ciekawość), widma, które nachylają tempo wzrostu uczucia, wyzwalacze i wartości (rzeczy, które uderzają mocniej lub cieszą bardziej), linię o radzeniu sobie pod presją oraz inne imiona, pod którymi postać występuje. Artykuł Pomocy *Soul of a character* wyjaśnia każde pole.

Dusza nie przechowuje tego, co dzieje się w historii. Nigdy nie zmienia się podczas gry; Pulpit trzyma zmienne liczby dla każdego czatu. Postać bez duszy po prostu gra neutralnie, z każdym mnożnikiem równym 1 i wartościami początkowymi 0.

## Gdzie się ją edytuje

Otwórz kartę, potem zakładkę **Soul**. Każda postać to chip na górze: karta z jedną postacią ma jeden chip, karta narratora ma jeden na każdą powracającą postać. Wybierz chip i edytuj pola, potem naciśnij „Save soul”. Zapisane cechy i widma są stałe; „Edit” je odblokowuje, a zakładka ostrzega, że zmiana dotyka kolejnych tur każdego czatu z tą kartą. „Delete soul” jest w menu „More actions”. „Add” lub „Add by hand” tworzy duszę dla imienia samodzielnie.

Tylko główne postacie dostają duszę. Przechodnie, których wymyśla historia, celowo zostają bez duszy.

## Automatyczne ocenianie i propozycje

Domyślnie aplikacja proponuje duszę dla karty, która jej nie ma: zaraz po imporcie i przy pierwszej aktualizacji Pulpitu czatu. Model czyta kartę, księgi wiedzy i ostatnie wiadomości. Propozycja nie jest zapisywana do karty. Baner pokazuje „Proposal (automatic)” z „Review”, „Accept all” i „Dismiss”; albo „Save soul” przy pojedynczej postaci. Dopóki nie zdecydujesz, propozycja już działa w grze jako dusza tymczasowa. „Dismiss” zatrzymuje automatyczne ocenianie dla tej karty. Jeśli ocenianie się nie powiedzie, baner pokazuje „Retry” i „Choose another model”. Oczekujące propozycje pojawiają się też w Skrzynce odbiorczej.

## Czy mogę ocenić ponownie z ekranu?

Tak, tym samym przyciskiem. Jedyny przycisk oceniania na karcie Soul zmienia etykietę w zależności od wyboru:

- Gdy nie wybrano postaci lub wybrana nie ma jeszcze zapisanej duszy: „Rate now”. Ocenia tylko postacie bez duszy; jeśli żadnych nie ma, mówi tylko, że nie ma nic nowego. Ocenianie postaci bez duszy można też wykonać przez „Rate this character”.
- Gdy wybrano postać, która już ma zapisaną duszę: „Rate again”. Prosi model o świeżą duszę dla tej jednej postaci i pokazuje ją jako aktualizację do przejrzenia obok zapisanej. Jeśli masz niezapisane zmiany, najpierw pyta „Rate again?”, bo zostałyby zastąpione. Jeśli nowa ocena jest równa zapisanej duszy, dostajesz informację, że nie ma nic do zmiany.

Nic nie jest nadpisywane, dopóki nie naciśniesz „Save soul”. Używany model to „Sensor model” Pulpitu (model czatu, jeśli pusty); przełącznik „Rate characters automatically” w ustawieniach Pulpitu steruje tylko automatycznym pierwszym ocenianiem, nie tym przyciskiem.

Możesz też poprosić Molfara w jego własnym czacie o ocenienie lub poprawienie duszy; pisze ten sam rodzaj propozycji ([[vertep:molfar]]).
