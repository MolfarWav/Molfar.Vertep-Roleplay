<!-- source: 49838714a096 -->
# Długie czaty i koszt tokenów

Czat, który trwa tygodniami, rośnie, a każda odpowiedź wysyła modelowi coraz więcej. Ta strona jest dla każdego, czyje odpowiedzi zwalniają lub drożeją, albo czyj model zapomina początek historii.

## Przycisk Request size

Domyślnie cały czat jest wysyłany, dopóki okno ma miejsce. Na dużym oknie koszt stale rośnie, więc nagłówek czatu ma przycisk **Request size** obok narzędzi historii (na telefonie: w Menu). Pokazuje, ile tokenów wysłało ostatnie zapytanie, cały prompt tak, jak go policzył dostawca, i który model je otrzymał. Naciśnij go, aby zobaczyć model, jego okno i twój limit. Jest turkusowy poniżej trzech czwartych limitu, od tego miejsca bursztynowy, a powyżej — czerwony z znakiem ostrzegawczym. Plansza Prompt w Canvas wypisuje każdą część zapytania ([[canvas]]).

Gdy odpowiedź przesuwa zapytanie ponad limit, otwiera się wyskakujące okno:

- **Yes, continue in a new chat** tworzy od razu następny czat i go otwiera.
- **Not now** chowa okno dla tego czatu, dopóki zapytanie nie urośnie o połowę. Zamknięcie okna liczy się jako Not now.
- **Send finished scenes as chapters instead** pojawia się, gdy Litopys jest włączony (następna sekcja).

Limit jest na dole okna i w Library, zębatka „Litopys settings”, blok „In the prompt”, „Warn me when a request gets big”: 60% okna modelu (domyślnie), rozmiar, który wpiszesz (100k), lub wybierzesz (od 16k do 500k), albo nigdy. Czat już ponad limitem pokazuje czerwony przycisk i nie pokazuje okna, dopóki nowa odpowiedź go nie powiększy.

Zapis ma własny rozmiar. W tym samym bloku „Memory size” jest domyślnie Auto: 15% okna modelu, między 800 a 16000 tokenów. „Compact” trzyma go na 800.

## Przełączniki, które tną koszt

W tym samym bloku „Older messages leave the prompt” ma dwa wybory:

- **Only when the window is full** (domyślnie): każda wiadomość jest wysyłana, dopóki się mieści.
- **By scenes**: gdy rozdział obejmuje scenę, scena zostaje zastąpiona rozdziałem. Zostają tylko ostatnie wiadomości słowo w słowo („Direct messages after the scenes”, 2 lub więcej). Najnowsza scena nie ma jeszcze rozdziału, więc jest wysyłana w całości.

„By scenes” kosztuje trochę szczegółów: rozdział to opowieść na nowo, więc słabszy model może zgubić drobiazg. Przypnij fakt, który nigdy nie może zaginąć ([[litopys]]). Inne cięcia:

- Plansza Prompt w Canvas, karta historii, Details: wysyłaj tylko ostatnie N wiadomości (na komputerze, tylko ten czat).
- Zmniejsz „Memory size” do Compact albo wyłącz „Chapters and facts”.

## Zacznij świeży czat i zachowaj historię

W naturalnej przerwie nowy czat, który kontynuuje stary, zaczyna się małym promptem i nadal wie, co się wydarzyło.

1. W czacie otwórz „More” i wybierz **Continue in a new chat**, albo naciśnij Yes w oknie.
2. Nowy czat powstaje od razu i się otwiera. Zachowuje preset i jego wybory, personę, model, zestaw agentów, kolejność tur grupy i świat World DM.
3. Dostaje starą historię jako tło, w ramach „Backstory budget”. Trzy najbliższe wcześniejsze czaty są czytane w całości: rozdziały, fakty i punkty zwrotne. Starsze czaty długiego łańcucha nie znikają: jadą w jednej skondensowanej części (zobacz niżej). Stare wiadomości nie są wysyłane.

Poprzedni czat przechodzi potem sam do **Archive** (następna sekcja). Połączenie to to, które rysuje Canvas, a Canvas może je później zmienić: zobacz [[canvas]]. Aby wybrać inny wcześniejszy czat, zacznij czat z postaci i użyj menu **Continues** w kroku „New chat with”.

Nowy czat otwiera się z powitaniem z karty; „Edit the first message” pozwala ruszyć dalej tam, gdzie historia się zatrzymała.

## Historia z wielu czatów

Historia może trwać w wielu czatach. Trzy najbliższe wcześniejsze czaty dają, jak dotąd, swoje rozdziały, łuki i fakty. Każdy starszy czat trafia do jednej części **far**, umieszczonej na początku: jego punkty zwrotne, przypięte i kluczowe fakty oraz jedna linijka na każdy łuk. Część jest budowana z tego, co Litopys już zapisał, bez dodatkowego wywołania modelu, i domyślnie zajmuje 18% „Backstory budget” (Library, Litopys settings, „In the prompt”, **Share for the far chats**, od 5 do 40). **Turning points shown** w tym samym bloku ustawia, ile punktów zwrotnych jedzie w odpowiedzi przez całą historię (domyślnie 12). Gdy budżet jest za mały, najstarsze czaty tracą swoje linijki jako pierwsze, a punkty zwrotne na końcu. W **What this chat carries** jest na to osobny wiersz, „Far backstory, chats 1-2”, dzięki czemu widać, że pierwsze czaty zostały zachowane, a nie zgubione. Krótki łańcuch nie ma części far. Jeśli długa historia wydaje się uboga, podnieś Backstory budget.

Skondensowana część gubi drobne szczegóły (kolor płaszcza); wspomnienia słowo w słowo, opisane poniżej, je przywracają.

## Archiwizuj skończoną historię

Historia, którą masz za sobą, może trafić do **Archive**. To status czatu, a nie przeniesienie: czat zostaje tam, gdzie był, więc jego pamięć, jego połączenia na Canvas i każda książka z niego zrobiona dalej działają.

- W Chats wybierz czat i naciśnij **Archive** (bursztynowy przycisk w jego panelu) albo zaznacz kilka przez Select. W czacie jest w menu pod „Manage chat”.
- Zarchiwizowany czat znika z listy i z Home. Bursztynowy wiersz **Archive** pod filtrami je otwiera; **Back to chats** wraca.
- Otwiera się tylko do odczytu: możesz czytać, kopiować, rozgałęziać od wiadomości, eksportować i oglądać jego Dashboard i Library, ale nie wysyłać, nie przełączać swipe'ów, nie edytować i nie usuwać. Jego miejsce na dole oferuje **Continue in a new chat**. **Unarchive** (w jego panelu lub banerze) przywraca go do zwykłego stanu.
- Potwierdzenie oferuje **Archive and continue**, gdy żaden czat jeszcze tego nie kontynuuje.
- **Dzieje się samo**, gdy czat staje się wcześniejszym czatem innego: połączenie na Canvas, Continue in a new chat, okno powyżej albo wybór w „Continues”. Toast z Undo o tym mówi. Gałęzie nie są kontynuacjami i zostają, jak są. Wyłącz to w Library, zębatka „Litopys settings”, „Archive the earlier chat when it is continued”.
- Czat ze 100 wiadomościami lub więcej, który był cichy przez tydzień, dostaje na liście mały znacznik „Long chat · archive?” i podpowiedź w panelu. Nic nie jest archiwizowane za ciebie.

Po co to: wcześniejszy czat już się nie zmienia, więc jego pamięć jest stabilna, a nowy czat, który go kontynuuje, czyta go jako skończoną historię ([[litopys]]).

## Szczegóły, które odrzuciły rozdziały

Rozdział to opowieść na nowo, więc drobny szczegół wcześniejszego czatu może z niego zniknąć. W Library, Litopys settings, „In the prompt” przełącznik **Word-for-word memories of earlier chats** (domyślnie włączony) pozwala czatowi, który kontynuuje inne, przywrócić jeden lub dwa fragmenty oryginalnych wiadomości, gdy to, co się mówi, dzieli z nimi rzadkie słowa ([[litopys]]). Wcześniejszy czat jest indeksowany, gdy przechodzi do Archive. Przeszukiwanie idzie po słowach, więc szczegół powiedziany innymi słowami nie zostanie znaleziony; eksperymentalny przełącznik **Also find old chapters by meaning** (wyłączony) nieco zmniejsza tę lukę, gdy używasz embeddings: znajduje rozdział po znaczeniu, ale fragment i tak potrzebuje jednego własnego rzadkiego słowa.

## Zapisz historię jako książkę

W Library, Litopys, „Save as a book” kopiuje rozdziały, łuki i fakty czatu na półkę Data Bank dla wybranych czatów: zobacz [[memory]].

## Sprawdź, co dostał model

Jeśli postać o czymś zapomina, otwórz Canvas > Prompt i przełącz z „Parts” na „Memory”: pokazuje, które fakty weszły, a które zostały pominięte i dlaczego. Przycisk **Fired** w nagłówku czatu pokazuje to dla ostatniej odpowiedzi i całego czatu.
