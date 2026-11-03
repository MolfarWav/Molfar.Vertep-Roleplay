<!-- source: 9004c118e307 -->
# Litopys: zapis historii

Litopys (kronika) to długa pamięć jednego czatu. Czyta historię w tle i pisze rozdział dla każdej zakończonej sceny oraz fakty, które historia ustaliła. Gdy czat robi się za długi na okno modelu, zapis niesie historię dalej. Używaj do długich historii; nie musisz go uruchamiać.

## Rozdziały i fakty

- **Rozdział** mówi, co zmieniło się w scenie, a nie opowiada jej na nowo. Jest pisany, gdy zaczyna się następna scena, więc najnowsza scena może go jeszcze nie mieć. Nowe miejsce lub skok w czasie zamyka scenę; możesz też sam oznaczyć ciąg wiadomości jako scenę, z menu „More” wiadomości pod Story.
- **Fakt** to jedno krótkie zdanie, które pozostaje prawdą: „Medli hides her wings at the market.” Fakty mają typ, wagę (Everyday, Important, Key) i to, kto je zna. Możesz dodawać, edytować, przypinać lub wycofywać fakty ręcznie.
- **Propozycje** to sugestie Litopysa: połącz dwa fakty, wycofaj jeden, przeredaguj, przypnij. Każdą przyjmujesz lub odrzucasz.
- **Nawyki**, które postać wyraźnie pokazuje, też mogą się pojawić i stać się nawykiem po powtórzeniu w kilku scenach.

## Gdzie patrzeć

Naciśnij **Record** w nagłówku czatu (na telefonie w Menu), aby zobaczyć zapis tego czatu w panelu bocznym. Sekcja **Library** na pasku pokazuje zapis każdego czatu. Ma dwa widoki: Overview (oś czasu, karta na postać, oczekujące propozycje) i Details z kartami Chapters, Facts, Proposals, Habits i Activity. Karta Activity rejestruje, co zrobił Litopys, z opcją Undo tam, gdzie to możliwe. Zębatka („Litopys settings”) ustawia, jak zapis jest pisany.

## Co wchodzi do promptu

Domyślnie zapis jest wstawiany automatycznie. „Memory size” mówi, ile tokenów może zająć: domyślnie Compact (800 tokenów), Auto (15% okna modelu, co najmniej 800) lub Custom od 200 do 16000. Gdy wszystko się mieści, wysyłane jest całe; w przeciwnym razie części najważniejsze dla sceny. Mały model chce małego rozmiaru. Wyłączone „Chapters and facts” oznacza brak nowych rozdziałów i faktów oraz nic dodawanego do promptu.

Starsze wiadomości mogą opuścić prompt tylko wtedy, gdy okno jest pełne, albo scena po scenie, gdy rozdział je obejmuje; wybiera to ustawienie „Older messages leave the prompt”.

## Sugestie i porządki

„Suggestions” jest domyślnie „Ask me first”: każde przypięcie i przeredagowanie czeka na twoją zgodę. Cicha opcja stosuje przypięcia i przeredagowania od razu i zapisuje je w Activity. Wycofywanie i łączenie zawsze czeka na ciebie. „Tidy facts automatically” szuka duplikatów i sprzeczności po 30 nowych faktach, przy jednym dodatkowym wywołaniu modelu na 60 faktów.

## Przebudowa

„Rebuild from scratch” przepisuje rozdziały i fakty z wiadomości w tle, około jedno wywołanie modelu co 30 sekund. Twoje własne, edytowane i przypięte fakty oraz edytowane rozdziały zostają, a bieżący zapis jest używany, dopóki nowy nie będzie gotowy. Odmawia startu, jeśli żadna scena się nie zamknęła.

Jeśli edytujesz wiadomości po napisaniu rozdziału, ten rozdział jest oznaczany jako nieaktualny i przepisywany.

## Powiązane

Karta postaci też może trzymać pamięć zakończonych czatów: zobacz [[memory]]. Artykuły Pomocy *Litopys: chapters and proposals*, *Facts and proposals* i *Overview vs Details* opisują ekrany.
