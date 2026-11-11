<!-- source: 67addd68fb05 -->
# Długie czaty i koszt tokenów

Czat, który trwa tygodniami, rośnie, a każda odpowiedź wysyła do modelu coraz więcej z niego. Ta strona jest dla każdego, czyje odpowiedzi stają się wolne lub drogie albo czyj model zapomina początek historii.

## Przycisk "Request size"

Domyślnie cały czat jest wysyłany, dopóki okno ma miejsce. Przy dużym oknie koszt stale rośnie, więc nagłówek czatu ma przycisk **Request size** obok narzędzi historii (na telefonie: w Menu). Pokazuje, ile tokenów wysłało ostatnie żądanie, cały prompt tak, jak policzył go dostawca, i który model go dostał. Naciśnij go, aby zobaczyć model, jego okno i twój limit. Jest turkusowy poniżej trzech czwartych limitu, od tego miejsca bursztynowy, a po przekroczeniu czerwony ze znakiem ostrzeżenia. Tablica Canvas Prompt wymienia każdą część żądania ([[canvas]]).

Gdy odpowiedź wypchnie żądanie poza limit, otwiera się wyskakujące okno:

- **Yes, continue in a new chat** tworzy od razu następny czat i otwiera go.
- **Not now** ukrywa okno dla tego czatu, dopóki żądanie nie wzrośnie o połowę. Zamknięcie go liczy się jako Not now.
- **Send finished scenes as chapters instead** pojawia się, gdy Litopys jest włączony (następna sekcja).

Limit jest na dole wyskakującego okna oraz w Library, zębatka "Litopys settings", blok "In the prompt", "Warn me when a request gets big": 60% okna modelu (domyślnie), rozmiar, który wpiszesz (100k) lub wybierzesz (od 16k do 500k), albo nigdy. Czat, który już przekroczył limit, pokazuje czerwony przycisk i żadnego okna, dopóki nowa odpowiedź go nie zwiększy.

Zapis ma własny rozmiar. W tym samym bloku "Memory size" jest domyślnie Auto: 15% okna modelu, między 800 a 16000 tokenów. "Compact" utrzymuje go na 800.

## Przełączniki, które obniżają koszt

W tym samym bloku "Older messages leave the prompt" ma dwa wybory:

- **Only when the window is full** (domyślnie): każda wiadomość jest wysyłana, dopóki się mieści.
- **By scenes**: gdy tylko rozdział zawiera scenę, scena jest zastępowana rozdziałem. Tylko ostatnie wiadomości zostają słowo w słowo ("Direct messages after the scenes", 2 lub więcej). Najnowsza scena nie ma jeszcze rozdziału, więc jest wysyłana w całości.

"By scenes" kosztuje trochę szczegółów: rozdział to opowiedzenie na nowo, więc słaby model może zgubić drobiazg. Przypnij fakt, który nigdy nie może zginąć ([[litopys]]). Inne cięcia:

- Library, Litopys settings, **Direct messages, by size**: zachowaj najnowsze wiadomości, które mieszczą się w danej liczbie tokenów (co najmniej 2 wiadomości), zamiast stałej liczby. 0 liczy wiadomości ([[litopys]]).
- Library, Litopys settings, **Leave out what a speaker was not present for** (domyślnie "Groups only"): odpowiedź wypowiedziana przez jedną postać nie dostaje ostatnich wiadomości ze scen, w których ta postać nie była ([[litopys]]).
- Canvas Prompt board, karta history, Details: wysyłaj tylko ostatnie N wiadomości (desktop, tylko ten czat).
- Obniż "Memory size" do Compact albo wyłącz "Chapters and facts".

## Zacznij świeży czat i zachowaj historię

W naturalnym momencie przerwy nowy czat, który kontynuuje stary, zaczyna od małego promptu i nadal wie, co się stało.

1. W czacie otwórz "More" i wybierz **Continue in a new chat** albo naciśnij Yes w wyskakującym oknie.
2. Nowy czat jest tworzony od razu i otwiera się. Zachowuje preset i jego wybory, personę, model, zestaw agentów, kolejność tur w grupie i świat World DM.
3. Dostaje starą historię jako backstory, w granicach "Backstory budget". Trzy najbliższe wcześniejsze czaty są czytane w całości: rozdziały, fakty i punkty zwrotne. Starsze czaty długiego łańcucha nie są odrzucane: jadą w jednej skondensowanej części (patrz niżej). Stare wiadomości nie są wysyłane.

Wcześniejszy czat przenosi się potem sam do Archive (następna sekcja). Link to ten, który rysuje Canvas, a Canvas może go później zmienić: patrz [[canvas]]. Aby wybrać inny wcześniejszy czat, zacznij czat od postaci i użyj menu **Continues** w kroku "New chat with".

Nowy czat otwiera się pierwszym powitaniem karty; "Edit the first message" pozwala ci kontynuować od miejsca, w którym historia się zatrzymała.

## Historia z wielu czatów

Historia może ciągnąć się przez wiele czatów. Trzy najbliższe wcześniejsze czaty dają swoje rozdziały, łuki i fakty jak wcześniej. Każdy starszy czat trafia do jednej **far** części, umieszczonej na początku: jego punkty zwrotne, przypięte i kluczowe fakty oraz jedna linia na każdy łuk. Część jest budowana z tego, co Litopys już napisał, bez dodatkowego wywołania modelu, i domyślnie zajmuje 18% Backstory budget (Library, Litopys settings, "In the prompt", **Share for the far chats**, od 5 do 40). **Turning points shown** w tym samym bloku ustawia, ile z nich jedzie w odpowiedzi przez całą historię (domyślnie 12). Jeśli budżet jest za mały, najstarsze czaty tracą swoje linie pierwsze, a punkty zwrotne ostatnie. W **What this chat carries** to osobny wiersz, "Far backstory, chats 1-2", więc widzisz, że pierwsze czaty zostały zachowane, a nie zgubione. Krótki łańcuch nie ma far części. Zwiększ Backstory budget, jeśli długa historia wydaje się uboga.

Skondensowana część gubi drobne szczegóły (kolor płaszcza); wspomnienia słowo w słowo poniżej przywracają je.

## Zarchiwizuj skończoną historię

Historię, którą skończyłeś, można wysłać do **Archive**. To status czatu, nie przeniesienie: czat zostaje tam, gdzie jest, więc jego pamięć, jego linki na Canvas i każda książka z niego zrobiona działają dalej.

- W Chats wybierz czat i naciśnij **Archive** (bursztynowy przycisk w jego panelu) albo zaznacz kilka przez Select. W czacie jest w menu pod "Manage chat".
- Zarchiwizowany czat znika z listy i z Home. Bursztynowy wiersz **Archive** pod filtrami otwiera je; **Back to chats** wraca.
- Otwiera się tylko do czytania: możesz czytać, kopiować, odgałęziać się od wiadomości, eksportować i zaglądać do jego Dashboard i Library, ale nie wysyłać, przesuwać, edytować ani usuwać. Jego miejsce na dole oferuje **Continue in a new chat**. **Unarchive** (w jego panelu lub banerze) przywraca go do normy.
- Potwierdzenie oferuje **Archive and continue**, gdy żaden czat jeszcze tego nie kontynuuje.
- **Dzieje się to samo** gdy czat staje się wcześniejszym czatem innego: link na Canvas, Continue in a new chat, wyskakujące okno powyżej albo wybór w "Continues". Powiadomienie z Undo to mówi. Odgałęzienia nie są kontynuacjami i zostają jak są. Wyłącz to w Library, zębatka "Litopys settings", "Archive the earlier chat when it is continued".
- Czat o 100 wiadomościach lub więcej, który milczy od tygodnia, dostaje w liście mały znacznik "Long chat · archive?" i podpowiedź w swoim panelu. Nic nie jest archiwizowane za ciebie.

Po co to robić: wcześniejszy czat już się nie zmienia, więc jego pamięć pozostaje stabilna, a nowy czat, który go kontynuuje, czyta go jako skończoną historię ([[litopys]]).

## Szczegóły, które zgubiły rozdziały

Rozdział to opowiedzenie na nowo, więc drobny szczegół z wcześniejszego czatu może z niego zniknąć. W Library, Litopys settings, "In the prompt", przełącznik **Word-for-word memories of earlier chats** (domyślnie włączony) pozwala czatowi, który kontynuuje inne, przywrócić jeden lub dwa fragmenty oryginalnych wiadomości, gdy to, co jest mówione, dzieli rzadkie słowa z nimi ([[litopys]]). Wcześniejszy czat jest indeksowany, gdy trafia do Archive. Dopasowuje słowa, więc szczegół opowiedziany innymi słowami nie zostanie znaleziony; eksperymentalny przełącznik **Also find old chapters by meaning** (wyłączony) trochę tę lukę zmniejsza, gdy używasz embeddings: znajduje rozdział po znaczeniu, ale fragment nadal potrzebuje jednego własnego rzadkiego słowa.

## Zapisz historię jako książkę

W Library, Litopys, "Save as a book" kopiuje rozdziały, łuki i fakty czatu na półkę Data Bank dla wybranych czatów: patrz [[memory]].

## Sprawdź, co dostał model

Jeśli postać o czymś zapomina, otwórz Canvas > Prompt i przełącz z "Parts" na "Memory": pokazuje, które fakty weszły, a które zostały pominięte i dlaczego. Przycisk **Fired** w nagłówku czatu pokazuje to dla ostatniej odpowiedzi i całego czatu.
