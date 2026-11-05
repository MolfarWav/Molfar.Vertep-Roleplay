<!-- source: c68da6730f1a -->
# Litopys: zapis historii

Litopys (kronika) to długa pamięć jednego czatu. Czyta historię w tle i pisze rozdział dla każdej zakończonej sceny oraz fakty, które historia ustaliła. Gdy czat robi się za długi na okno modelu, zapis niesie historię dalej. Używaj go do długich historii; nie musisz go włączać.

## Rozdziały i fakty

- **Rozdział** mówi, co zmieniło się w scenie, a nie opowiada jej na nowo. Powstaje, gdy zaczyna się następna scena, więc najnowsza scena może jeszcze go nie mieć. Nowe miejsce albo skok w czasie zamyka scenę; możesz też sam oznaczyć ciąg wiadomości jako scenę z menu „More” wiadomości, w części Story.
- **Fakt** to jedno krótkie zdanie, które pozostaje prawdziwe: „Medli ukrywa swoje skrzydła na targu.” Fakty mają typ, wagę (Everyday, Important, Key) i to, kto je zna. Fakty możesz dodawać, edytować, przypinać lub wycofywać ręcznie.
- **Proposals** to sugestie Litopysa: połączenie dwóch faktów, wycofanie jednego, przeredagowanie, przypięcie. Każdą przyjmujesz albo odrzucasz.
- **Habits**, które postać wyraźnie pokazuje, też mogą się pojawić i stać się nawykiem po powtórzeniu w kilku scenach.

## Gdzie szukać

Naciśnij **Record** w nagłówku czatu (na telefonie w Menu), aby zobaczyć zapis tego czatu w panelu bocznym. Sekcja **Library** na pasku pokazuje zapis każdego czatu. Ma dwa widoki: Overview (oś czasu, karta na postać, oczekujące propozycje) oraz Details z zakładkami Chapters, Facts, Proposals, Habits i Activity. Zakładka Activity zapisuje, co zrobił Litopys, z przyciskiem Undo, gdzie to możliwe. Zębatka („Litopys settings”) ustawia, jak pisany jest zapis.

## Co trafia do promptu

Domyślnie zapis jest wstawiany automatycznie. „Memory size” mówi, ile tokenów może zająć: domyślnie Auto (15% okna modelu, co najmniej 800 i najwyżej 16000), Compact (800 tokenów) lub Custom od 200 do 16000. Auto pozwala dużemu oknu nieść więcej historii; na małym modelu zostaje w pobliżu 800. Rozmiar, który sam zapisałeś wcześniej, zostaje bez zmian. Gdy wszystko się mieści, wysyłane jest całe; w przeciwnym razie części najważniejsze dla sceny. Mały model potrzebuje małego rozmiaru. Wyłączone „Chapters and facts” oznacza brak nowych rozdziałów i faktów oraz nic dodanego do promptu.

Starsze wiadomości mogą opuścić prompt tylko wtedy, gdy okno jest pełne, albo scena po scenie, gdy rozdział je obejmuje; wybiera to ustawienie „Older messages leave the prompt”.

## Dopasowanie po znaczeniu

Pamięć znajduje fakty i rozdziały po słowach. Z modelem embeddings znajduje je też po znaczeniu: pytanie sformułowane inaczej nadal trafia do faktu. Karta **Matching by meaning** (na górze zapisu czatu i w Canvas > Prompt > Memory) pokazuje, na jakim jest etapie: off, failing, no vectors yet, partly done, done albo made by another model. Ustaw model raz w Settings > Memory: domyślnie aplikacja używa najpierw modelu na twoim komputerze (LM Studio albo Ollama), potem połączenia API z kluczem, a na końcu OpenRouter. Gdy jedno wywołanie modelu embeddings się powiedzie (naciśnięcie przycisku na karcie albo odpowiedź), silnik sam uzupełnia brakujące wektory każdego czatu i pliku Data Bank, zaglądając co kilka minut. Wszystko powyżej 300 000 tokenów czeka na przycisk, a przełącznik **Make vectors by itself** w Settings > Memory to wyłącza. Przycisk **Embed N items** najpierw mówi, ile jest elementów i mniej więcej ile tokenów to zajmie, a potem wykonuje to od razu. Nowe sceny osadzają swoje nowe elementy w każdym przypadku. Jeśli zmienisz model embeddings, stare wektory nie są używane, dopóki nie naciśniesz **Embed again**. Data Bank ma własną kartę, **Data Bank by meaning**, na górze Settings > Data Bank: działa tak samo dla fragmentów twoich plików i książek-migawek, a plik tylko częściowo objęty pokazuje „7 of 12 by meaning”.

## Sugestie i porządki

„Suggestions” to domyślnie „Ask me first”: każde przypięcie i przeredagowanie czeka na twoje tak. Tryb cichy stosuje przypięcia i przeredagowania od razu i zapisuje je w Activity. Wycofywanie i łączenie zawsze czeka na ciebie. „Tidy facts automatically” szuka duplikatów i sprzeczności po 30 nowych faktach, przy jednym dodatkowym wywołaniu modelu na 60 faktów.

## Przebudowa

„Rebuild from scratch” przepisuje rozdziały i fakty z wiadomości w tle, mniej więcej jedno wywołanie modelu co 30 sekund. Twoje własne, edytowane i przypięte fakty oraz edytowane rozdziały zostają, a bieżący zapis jest używany, dopóki nowy nie będzie gotowy. Nie uruchamia się, jeśli żadna scena jeszcze się nie zamknęła.

Jeśli edytujesz wiadomości po napisaniu rozdziału, ten rozdział jest oznaczany jako nieaktualny i przepisywany.

## Powiązane

Karta postaci może też zachowywać pamięć zakończonych czatów: zobacz [[memory]]. Artykuły Help *Litopys: chapters and proposals*, *Facts and proposals* i *Overview vs Details* opisują ekrany.
