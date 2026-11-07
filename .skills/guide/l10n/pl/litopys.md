<!-- source: 22d2bcc1795f -->
# Litopys: zapis historii

Litopys (kronika) to długa pamięć jednego czatu. Czyta historię w tle i pisze rozdział dla każdej zakończonej sceny oraz fakty, które historia ustaliła. Gdy czat robi się za długi na okno modelu, zapis niesie historię dalej. Używaj go do długich historii; nie musisz go włączać.

## Rozdziały i fakty

- **Rozdział** mówi, co zmieniło się w scenie, a nie opowiada jej na nowo. Powstaje, gdy zaczyna się następna scena, więc najnowsza scena może jeszcze go nie mieć. Nowe miejsce albo skok w czasie zamyka scenę; możesz też sam oznaczyć ciąg wiadomości jako scenę z menu „More” wiadomości, w części Story.
- **Fakt** to jedno krótkie zdanie, które pozostaje prawdziwe: „Medli ukrywa swoje skrzydła na targu.” Fakty mają typ, wagę (Everyday, Important, Key) i to, kto je zna. Fakty możesz dodawać, edytować, przypinać lub wycofywać ręcznie.

**Fakt może być znany całej grupie**, na przykład gildii: w polu "Known to" wpisz `group: Guild of Ravens`, a każdy członek, który jest w scenie, zna go; reszta nie. Grupa istnieje, gdy karta ma tag `group: Guild of Ravens` lub `faction: Guild of Ravens` (inne tagi nie tworzą grup), albo gdy rekord World DM rodzaju Group lub Place wymienia Members ([[world-dm]]). Gdy członek jest w scenie, model piszący rozdziały dostaje informację o grupie i może jej użyć dla wieści, których cała grupa się dowiedziała. Książka-migawka kopiuje imiona członków w chwili zapisu.
- **Wiara** (belief) to fakt typu Belief: coś, co postaci powiedziano w kłamstwie, a ona wciąż bierze za prawdę. Pojawia się, gdy kłamstwo jakiś czas figuruje na liście Said w Dashboardzie, należy do tego, kto w nie wierzy, i trafia tylko do odpowiedzi tej postaci. Kończy się, gdy postać pozna prawdę albo usuniesz kłamstwo; możesz też zakończyć ją ręcznie przyciskiem **Knows the truth now**, który dodatkowo informuje Dashboard. Widok Memory oznacza wiarę, gdy weszła do odpowiedzi. Zobacz [[dashboard]].
- **Proposals** to sugestie Litopysa: połączenie dwóch faktów, wycofanie jednego, przeredagowanie, przypięcie. Każdą przyjmujesz albo odrzucasz.
- **Habits**, które postać wyraźnie pokazuje, też mogą się pojawić i stać się nawykiem po powtórzeniu w kilku scenach.

## Gdzie szukać

Naciśnij **Record** w nagłówku czatu (na telefonie w Menu), aby zobaczyć zapis tego czatu w panelu bocznym. Sekcja **Library** na pasku pokazuje zapis każdego czatu. Ma dwa widoki: Overview (oś czasu, karta na postać, oczekujące propozycje) oraz Details z zakładkami Chapters, Facts, Proposals, Habits, Activity i Settings. Zakładka Activity zapisuje, co zrobił Litopys, z przyciskiem Undo, gdzie to możliwe. Zębatka („Litopys settings”) ustawia, jak pisany jest zapis.

## Dosłowne wspomnienia wcześniejszych czatów

Rozdział to opowieść na nowo, więc drobny szczegół (kolor płaszcza, dokładna obietnica) może w nim zaginąć. Gdy ten czat kontynuuje wcześniejsze ([[long-chats]]), włącz **Word-for-word memories of earlier chats** w Library, Litopys settings, blok „In the prompt”. Wtedy, gdy to, co się mówi, dzieli kilka rzadkich słów z wcześniejszym fragmentem, do promptu trafiają jeden lub dwa fragmenty ORYGINALNYCH wiadomości, opisane jako starsze niż fakty. Silnik czyta cały łańcuch, a nie tylko trzy najbliższe czaty, a postać dostaje fragment tylko ze sceny, w której była. Nie ma wywołania modelu; funkcja jest domyślnie wyłączona i zajmuje co najwyżej „Word-for-word budget” tokenów (domyślnie 400). Jeśli nic nie dzieli wystarczająco wielu rzadkich słów, nic nie jest dodawane. Widok Memory i panel Fired wymieniają, co dodano do ostatniej odpowiedzi; plansza Prompt w Canvas ma własny przełącznik dla czatu.

## Co trafia do promptu

Domyślnie zapis jest wstawiany automatycznie. „Memory size” mówi, ile tokenów może zająć: domyślnie Auto (15% okna modelu, co najmniej 800 i najwyżej 16000), Compact (800 tokenów) lub Custom od 200 do 16000. Auto pozwala dużemu oknu nieść więcej historii; na małym modelu zostaje w pobliżu 800. Rozmiar, który sam zapisałeś wcześniej, zostaje bez zmian. Gdy wszystko się mieści, wysyłane jest całe; w przeciwnym razie części najważniejsze dla sceny. Mały model potrzebuje małego rozmiaru. Wyłączone „Chapters and facts” oznacza brak nowych rozdziałów i faktów oraz nic dodanego do promptu.

Starsze wiadomości mogą opuścić prompt tylko wtedy, gdy okno jest pełne, albo scena po scenie, gdy rozdział je obejmuje; wybiera to ustawienie „Older messages leave the prompt”: „Only when the window is full” (domyślnie) albo „By scenes”. [[long-chats]] mówi, które wybrać.

## Dopasowanie po znaczeniu

Pamięć znajduje fakty i rozdziały po słowach. Z modelem embeddings znajduje je też po znaczeniu: pytanie sformułowane inaczej nadal trafia do faktu. Karta **Matching by meaning** (na górze zapisu czatu i w Canvas > Prompt > Memory) pokazuje, na jakim jest etapie: off, failing, no vectors yet, partly done, done albo made by another model. Ustaw model raz w Settings > Memory: domyślnie aplikacja używa najpierw modelu na twoim komputerze (LM Studio albo Ollama), potem połączenia API z kluczem, a na końcu OpenRouter. Gdy jedno wywołanie modelu embeddings się powiedzie (naciśnięcie przycisku na karcie albo odpowiedź), silnik sam uzupełnia brakujące wektory każdego czatu i pliku Data Bank, zaglądając co kilka minut. Wszystko powyżej 300 000 tokenów czeka na przycisk, a przełącznik **Make vectors by itself** w Settings > Memory to wyłącza. Przycisk **Embed N items** najpierw mówi, ile jest elementów i mniej więcej ile tokenów to zajmie, a potem wykonuje to od razu. Nowe sceny osadzają swoje nowe elementy w każdym przypadku. Jeśli zmienisz model embeddings, stare wektory nie są używane, dopóki nie naciśniesz **Embed again**. Data Bank ma własną kartę, **Data Bank by meaning**, na górze Settings > Data Bank: działa tak samo dla fragmentów twoich plików i książek-migawek, a plik tylko częściowo objęty pokazuje „7 of 12 by meaning”.

## Ustawienia dla jednego czatu

Zakładka **Settings** zapisu czatu (w panelu bocznym Record i w Library, obok Activity) ustawia Litopys tylko dla tego czatu: najkrótszą i najdłuższą scenę, ile ostatnich wiadomości zostaje słowo w słowo (albo ile bezpośrednich wiadomości zostaje po scenach, gdy starsze wiadomości opuszczają prompt „By scenes”), sposób, w jaki starsze wiadomości opuszczają prompt, oraz ile faktów jedna postać może mieć przypiętych. Pole zostawione puste idzie za „Litopys settings” z zębatki i pokazuje tę wartość jako „Library: N”. Wartość zapisuje się, gdy opuścisz pole. „Use the Library settings” czyści je wszystkie. Czat z częstą zmianą scen dobrze znosi niską najkrótszą scenę, powiedzmy 3: krótka scena dostaje wtedy własny rozdział. Rozdziały już napisane zostają takie, jakie są; użyj Rebuild, aby przepisać je z nowymi długościami.

## Sugestie i porządki

„Suggestions” ma trzy wybory. „Ask me first”: każda sugestia czeka na twoje tak. „Only risky ones” (domyślne dla nowej instalacji): rutynowe sugestie są stosowane od razu, zapisywane w Activity z Undo, a czekają tylko ryzykowne, każda z powodem: scalenie, które powiedziałoby więcej osobom fakt znany tylko niektórym, zmiana faktu, który przypiąłeś, napisałeś, edytowałeś lub oznaczyłeś jako key, trwała zmiana albo wiara, oraz nowy fakt, który może przeczyć przypiętemu. Ten sam powód pokazuje się w Skrzynce odbiorczej. „Apply pins and rewrites quietly”: przechodzą tylko przypięcia i przeredagowania; wycofywanie i scalanie czekają na ciebie. „Tidy facts automatically” szuka duplikatów i sprzeczności po 30 nowych faktach, przy jednym dodatkowym wywołaniu modelu na 60 faktów.

## Przebudowa

„Rebuild from scratch” przepisuje rozdziały i fakty z wiadomości w tle, mniej więcej jedno wywołanie modelu co 30 sekund. Twoje własne, edytowane i przypięte fakty oraz edytowane rozdziały zostają, a bieżący zapis jest używany, dopóki nowy nie będzie gotowy. Nie uruchamia się, jeśli żadna scena jeszcze się nie zamknęła.

Jeśli edytujesz wiadomości po napisaniu rozdziału, ten rozdział jest oznaczany jako nieaktualny i przepisywany.

## Powiązane

Karta postaci może też zachowywać pamięć zakończonych czatów: zobacz [[memory]]. Artykuły Help *Litopys: chapters and proposals*, *Facts and proposals* i *Overview vs Details* opisują ekrany.
