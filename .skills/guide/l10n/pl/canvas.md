<!-- source: 045cbad8d708 -->
# Canvas: połączenia czatów, prompt i agenci

Canvas to techniczny warsztat Roleplay: jeden ekran z planszami, na którym widzisz i zmieniasz, jak połączone są czaty i co każdy czat wysyła do modelu. Do grania nie jest potrzebny. Otwórz go, gdy historia potrzebuje kontynuacji, gdy odpowiedź cię zaskoczyła albo gdy budujesz agentów.

Wybierz planszę przełącznikiem **Board** u góry: **Chat links**, **Prompt**, **Agents** i **Agent sets**. Pozycja Agents na pasku otwiera ten sam Canvas na jego planszy Agents. Ostatnio używana plansza jest pamiętana.

## Chat links

Mapa twoich czatów. Każdy czat to karta. Linia od jednego czatu do drugiego znaczy „ten czat kontynuuje tamten”: historia wcześniejszego czatu jedzie jako tło w odpowiedziach późniejszego, w ramach budżetu tła ustawionego w Library. Najbliższe trzy wcześniejsze czaty są czytane w całości, a starsze są skondensowane ([[long-chats]]). Linia ciągła to kontynuacja. Linia przerywana to gałąź rozwidlona z wiadomości.

- Czaty, których nie położyłeś na planszy, czekają na liście po lewej (**Chats**). Przeciągnij jeden na planszę albo użyj **Put on the board** (z **its linked chats**, aby przenieść cały łańcuch). Przeciągnij kartę z powrotem na listę albo użyj **Remove**, aby zdjąć ją z planszy. Sam czat zostaje w Library.
- Włącz przełącznik **Edit**, aby łączyć lub rozłączać karty. Połączenie, które zrobiłoby pętlę, łączyłoby czat sam ze sobą albo powtarzało istniejące, jest odrzucane, a plansza mówi dlaczego. Są **Undo** i **Redo**. **Fit** dopasowuje widok do całego grafu.
- Na telefonie plansza otwiera się w trybie **View** z listą **List** połączeń. Budowanie grafu jest wygodniejsze na dużym ekranie, ale połączenia nadal można edytować na liście.

Mapa czatu w Library pokazuje ten sam łańcuch, ale tylko do oglądania. Jej przycisk **Edit on canvas** przenosi cię tutaj.

## Prompt

Wybierz czat, aby zobaczyć zapytanie, które wysyła do modelu. Plansza ma dwa widoki: **Parts** i **Memory**.

- **Parts** wypisuje każdą część zapytania: główny prompt, kartę postaci, personę, wpisy księgi wiedzy, przykładowy dialog, sekcje presetu i historię, każdą z liczbą tokenów i stanem. Część może być wyłączona w presecie, wyłączona dla tego czatu, pusta albo niepotrzebna w tym rodzaju odpowiedzi. Część możesz wyłączyć dla tego jednego czatu, nie dotykając presetu. **Only what is sent** ukrywa resztę, a suma pokazuje, co dostaje model.
- **Memory** wyjaśnia, dlaczego pamięć wniosła to, co wniosła do ostatniej odpowiedzi: pełny opis jest w [[memory]].

Żeby szybciej zobaczyć tylko to, co zadziałało w ostatniej odpowiedzi, użyj przycisku **Fired** w nagłówku czatu. Widok Memory i **Fired** czytają ten sam zapis; Fired liczy też dla całego czatu.

## Agents and Agent sets

Kuźnia agentów: zbuduj agenta, wypróbuj go i grupuj agentów w zestawy. Zobacz [[agents]].

## Co zostaje bez zmian

Wyłączenie części na planszy Prompt dotyczy tylko tego jednego czatu. Preset i karty nie są zmieniane.
