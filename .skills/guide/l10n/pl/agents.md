<!-- source: a06a17fd0667 -->
# Agenci i kuźnia agentów

Agent to mały pomocnik, który budujesz z kart i połączeń. Po odpowiedzi odczytuje część czatu, może zadać modelowi jedno lub kilka krótkich pytań, prowadzi własne notatki i coś pokazuje: notkę pod odpowiedzią, przyciski do naciśnięcia, wskaźnik, mapę lub podpowiedź do następnej odpowiedzi. Przykłady: trzy proponowane następne ruchy, wskaźnik napięcia, mapa odwiedzonych miejsc. Ta strona jest dla tych, którzy chcą takich dodatków. Pomoc ma trzy artykuły o edytorze: „Agent editor: how an agent works”, „Agent editor: the cards” i „Agent editor: three ready agents”.

## Z czego składa się agent

Agent to dane, nie kod. W edytorze to plansza z **kart** połączonych **przewodami**:

- karta **Wejście** mówi, co agent może czytać (ostatnią odpowiedź, historię czatu, kartę postaci, personę, notatkę autora, fakty z Litopysa, wpisy z ksiąg wiedzy);
- karty **Zapytaj model** zadają modelowi jedno pytanie i biorą odpowiedź jako dowolny tekst, tak/nie lub kilka nazwanych pól;
- karty logiczne oraz karty działające w kodzie bez modelu: kości, wybór linii, wycinanie lub wyciąganie tekstu;
- karty **pamięci** agenta (liczby, tekst, tak/nie, listy), przechowywane dla każdego czatu osobno i poza Pulpitem;
- karta **Wyjście**, która pokazuje wynik: „Notka pod odpowiedzią”, „Przyciski do naciśnięcia”, wartość stanu lub podpowiedź wstawiana do następnego promptu.

**Panele** (wskaźniki, liczniki, tabele, plansza kafelków) pokazują to, co przechowuje agent; nic w panelu nie działa, a jego przyciski tylko wstawiają tekst do pola wiadomości.

Kiedy agent działa, ustawia się dla każdego z osobna: po każdej odpowiedzi (jedyny moment, w którym ta wersja go uruchamia); co N-tą odpowiedź; lub tylko wtedy, gdy pojawią się wybrane słowa.

## Gotowi agenci

Naciśnij „New agent” na planszy Agenci w **Canvas** (otwiera ją pozycja **Agents** na pasku bocznym). „Empty agent” daje Wejście i notkę. „Start from a ready agent” oferuje sześć działających: Next moves, Pacing nudge, Story map, Scene recap, Territory board i Tension meter. Pod „Drafts” są agenci, których Molfar zapisał w twoim obszarze roboczym („Drafts from Molfar”).

## Edytor

Zmiany zapisują się jako szkic chwilę po tym, jak przestaniesz. Trzy karty: Card (wybrana karta), Agent (nazwa, kiedy działa, jego pamięć, panele) i Try. Znacznik pokazuje „Passes the check”, liczbę problemów i ostrzeżeń oraz „N model calls per run”. Nie możesz zainstalować, gdy zostały problemy. „Export as a file” zapisuje jeden plik, którym możesz się podzielić. Arkusz czatu „Install and manage agents...” ma opcję „Install an agent file”, aby go wczytać.

## Próba

Karta Try wykonuje jedną wymyśloną rundę, niczego nie zmieniając. Zmieniasz wejścia, a przewody na planszy pokazują, co się dzieje; bez modelu każda karta „Zapytaj model” używa przykładowej odpowiedzi, którą możesz edytować. Pod „A real chat” wybierz czat i „Fill from this chat”, aby wczytać to, co agent naprawdę by dostał. „Run with the model” pyta wtedy prawdziwy model prawdziwym pytaniem: do N wywołań, prawdziwe tokeny i nic nie zapisuje się do czatu ani do agenta.

## Instalacja, zgoda, włączanie w czacie

1. Naciśnij „Install” („Update” dla zmienionej kopii zainstalowanego agenta; aby coś zmienić, użyj „Edit a copy”).
2. Zgódź się raz: „Review permissions”, potem „Allow all” lub pozycja po pozycji. Agent działa, gdy każda linia jest włączona. Aktualizacja prosząca o więcej czeka na nową zgodę.
3. Dodaj go do czatu. W pigułce nagłówka czatu otwórz kartę **Agents**: „In this chat” pokazuje aktywnych agentów, „Installed” pokazuje pozostałych (wybierz jednego, aby go dodać). Wiersz może uruchomić się ponownie teraz, zostać usunięty lub zatrzymać czekającą na niego odpowiedź. Nowy czat nie ma agentów, dopóki ich nie dodasz lub nie wybierzesz zestawu.

**Zestaw** to nazwana lista agentów („Save this chat's list as a set”; „Make default” daje go nowym czatom). Plansza „Agent sets” w Canvas pokazuje koszt każdego zestawu w czasie i wywołaniach, a także przełącznik „Agents' notes in chats”, który ukrywa notatki wszystkich agentów. Miejsce wyniku każdego agenta można zmienić na karcie Agents czatu, spośród miejsc, które mu pasują.

Każda karta „Zapytaj model” to jedno wywołanie na przebieg; edytor pokazuje ich liczbę. „Every Nth reply” dzieli koszt.
