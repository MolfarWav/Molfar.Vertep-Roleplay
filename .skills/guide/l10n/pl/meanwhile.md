<!-- source: 0348c269773a -->
# Tymczasem: życie poza ekranem

Tymczasem pozwala osobom, które nie są w scenie, robić rzeczy, gdy historia toczy się dalej: Bram sprzedaje konia w porcie, Ada ukrywa księgę, front zbliża się o krok do celu. To wersja testowa, domyślnie wyłączona.

## Jak to włączyć

Otwórz arkusz **World** czatu i znajdź kartę **Meanwhile**. Włącz "Let people off screen act". Przełącznik działa dla wszystkich czatów. Wymaga włączonego **Dashboard**, bo Meanwhile czyta z niego sceny, i wymaga kogoś, kto może działać: karty postaci, której nie ma w scenie, albo osoby z księgi World DM.

## Kiedy to działa

Przebieg uruchamia się po odpowiedzi, gdy pojawiły się co najmniej dwie nowe odpowiedzi i albo zaczęła się nowa scena, albo zegar historii przesunął się o sześć godzin. Jeden przebieg to jedno wywołanie modelu. Używa własnego modelu, jeśli go ustawisz, a jeśli nie — modelu World DM, czujnika Dashboard, Library, czatu, aplikacji. Karta mówi którego. "Run a pass now" uruchamia jeden od razu.

Przebieg prosi o maksymalnie trzy małe zdarzenia. Aplikacja sprawdza każde z nich: osoby muszą być znane czatowi, nigdy twoja postać i nigdy nikt, kto jest w scenie, a skutki muszą pochodzić z krótkiej listy. Zdarzenie, które nie przejdzie sprawdzenia, jest odrzucane w całości, a dziennik mówi dlaczego. Jeśli model nic nie odpowie, przebieg próbuje jeszcze raz z większym marginesem; przebieg, który się nie powiedzie, czeka dziesięć minut.

## Co pokazuje karta

- **What this card shows**: Nothing (tylko że coś się stało), Hints (kto i gdzie) albo Everything. Domyślnie Hints, żeby historia nie była ci zdradzana.
- **Off screen so far**: zdarzenia, tak jak pozwala to ustawienie.
- **Log**: każdy przebieg: dlaczego się uruchomił (scena zamknięta, czas minął, ręcznie), ile zdarzeń zaproponował model i ile zostało zachowanych, dlaczego resztę odrzucono, oraz błąd, gdy się nie powiodło.

## Co zdarzenia robią z historią

Każde zachowane zdarzenie staje się wspomnieniem osób, którym się przydarzyło, i tych, które je widziały, i nikogo więcej: nigdy twojej postaci. Dociera do odpowiedzi według zwykłych zasad zapisu historii ([[litopys]]): gdy jedna z tych osób mówi albo jedna z nich jest w scenie przy odpowiedzi narratora lub grupy. Ktoś, kto wie, może to potem poruszyć, napomknąć o tym albo zadziałać na tej podstawie; inni nie mogą. Zdarzenie tajne jest też oznaczone jako "kept secret", więc odpowiedź grupowa wie, kto je zachowuje. Zdarzenia nie są kopiowane do Facts w Library: są czytane z pliku Meanwhile przy każdej odpowiedzi, więc nic nie kosztuje ich trzymanie i odchodzą ze swipe'em. Panel "What fired" w prompcie wymienia je jak każdy fakt.

Jeśli wyłączysz Meanwhile, zdarzenia natychmiast przestają docierać do odpowiedzi.

## W dzienniku Dashboard

W szerokim Dashboard **Journal** postaci ma sekcję **Off screen (Meanwhile)** ze zdarzeniami, które przydarzyły się tej postaci, od najnowszych, tak jak pozwala na to ustawienie karty: tylko gdzie i kiedy przy Hints, tekst przy Everything, a nic przy Nothing. Czyta tylko plik Meanwhile; nic nie zapisuje do Dashboard, więc odchodzi ze swipe'em i nie wymaga dodatkowego ustawienia. Na telefonie Journal nie jest pokazywany.

## Swipe'y i usuwanie

Zdarzenie należy do odpowiedzi, po której się stało. Jeśli wygenerujesz tę odpowiedź ponownie, nowa wersja jest zapisywana bez zdarzenia; jeśli zrobisz swipe lub usuniesz tę odpowiedź, zdarzenia tego przebiegu też odchodzą, również z historii, a następny przebieg czyta historię od nowa od ostatniej odpowiedzi, która wciąż tam jest.

Powiązane: [[world-dm]], [[dashboard]], [[litopys]]. Jak pokazywane są sekrety, zobacz [[litopys]] "Who knows".
