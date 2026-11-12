<!-- source: 3036f6063dc6 -->
# Agenci i kuźnia agentów

Agent to mały pomocnik, który budujesz z kart i połączeń. Odczytuje część czatu (przed odpowiedzią lub po niej, jak wybierzesz), może zadać modelowi jedno lub kilka krótkich pytań, prowadzi własne notatki i coś pokazuje: notkę pod odpowiedzią, przyciski do naciśnięcia, wskaźnik, mapę lub podpowiedź do następnej odpowiedzi. Przykłady: trzy proponowane następne ruchy, wskaźnik napięcia, mapa odwiedzonych miejsc. Ta strona jest dla tych, którzy chcą takich dodatków. Pomoc ma trzy artykuły o edytorze: „Agent editor: how an agent works”, „Agent editor: the cards” i „Agent editor: three ready agents”.

## Z czego składa się agent

Agent to dane, nie kod. W edytorze to plansza z **kart** połączonych **przewodami**:

- karta **Input** mówi, co agent może czytać (ostatnią odpowiedź, historię czatu, kartę postaci, personę, notatkę autora, fakty z Litopysa, wpisy z ksiąg wiedzy);
- karty **Ask the model** zadają modelowi jedno pytanie i biorą odpowiedź jako dowolny tekst, tak/nie lub kilka nazwanych pól;
- karty logiczne (karta If może zadziałać tylko wtedy, gdy jej odpowiedź zmieni się na Yes, tylko raz albo z pauzą po zadziałaniu, a jej reguły mogą zapytać, czy wartość zmieniła się od ostatniego przebiegu; dziennik przebiegów mówi, dlaczego odpowiedziała Yes), oraz karty działające w kodzie bez modelu: kości, wybór linii, wycinanie lub wyciąganie tekstu;
- karta **Script**: kilka linii JavaScriptu, który piszesz, `(input, seed)` na wejściu i zwykły obiekt na wyjściu, z typowanymi wejściami i wyjściami. Działa w piaskownicy silnika (bez zegara, bez internetu, bez plików, około pół sekundy i 16 MB) i wymaga silnika od wersji 1.10.1; starszy silnik kończy agenta prostym komunikatem;
- karty **pamięci** agenta (liczby, tekst, tak/nie, listy), przechowywane dla każdego czatu osobno i poza Pulpitem;
- karta **Output**, która pokazuje wynik: „A note under the reply”, „Buttons to tap”, wartość stanu lub podpowiedź wstawianą do następnego promptu.

**Panels** (wskaźniki, liczniki, tabele, plansza kafelków) pokazują to, co przechowuje agent; nic w panelu nie działa, a jego przyciski tylko wstawiają tekst do pola wiadomości.

Kiedy agent działa, to jego **pas** (lane). Plik agenta nazywa pas, w którym startuje, a każdy czat może przenieść agenta na inny pas (zakładka Agents czatu albo plansza „Agent sets” w Canvas). Cztery pasy:

- **Before the reply**: odpowiedź czeka na agenta, a podpowiedź, którą zostawi, trafia do tej właśnie odpowiedzi. Trzymaj ją na jedno lub dwa szybkie pytania, bo czekanie dolicza się do każdej odpowiedzi. Przełącznik Wait w wierszu agenta wyłącza czekanie; agent działa wtedy obok odpowiedzi.
- **Beside the reply**: działa równocześnie, nie dodaje czekania i nie może wstawić podpowiedzi do odpowiedzi, obok której działa (notki, przyciski i panele działają).
- **After the reply**: zwykły pas dla notek, trackerów i wskaźników.
- **By hand**: działa tylko po naciśnięciu przycisku uruchomienia w jego wierszu.

Ponad pasem agent może działać przy każdej N-tej odpowiedzi albo tylko wtedy, gdy pojawią się wybrane słowa.

## Gotowi agenci

Naciśnij „New agent” na planszy Agenci w **Canvas** (otwiera ją pozycja **Agents** na pasku bocznym). „Empty agent” daje kartę Input i notkę. „Start from a ready agent” oferuje sześć działających: Next moves, Pacing nudge, Story map, Scene recap, Territory board i Tension meter. Pod „Drafts” są agenci, których Molfar zapisał w twoim obszarze roboczym („Drafts from Molfar”).

## Edytor

Zmiany zapisują się jako szkic chwilę po tym, jak przestaniesz. Trzy karty: Card (wybrana karta), Agent (nazwa, kiedy działa, jego pamięć, panele) i Try. Znacznik pokazuje „Passes the check”, liczbę problemów i ostrzeżeń oraz „N model calls per run”. Nie możesz zainstalować, gdy zostały problemy. „Export as a file” zapisuje jeden plik, którym możesz się podzielić. Arkusz czatu „Install and manage agents...” ma opcję „Install an agent file”, aby go wczytać.

### Opcje karty If

Karta If odpowiada Yes, No albo Unknown według swoich reguł i sama z siebie mówi Yes przy każdym przebiegu, dopóki reguły są spełnione. Pod regułami **When it answers Yes** to zmienia: "Every time" (domyślnie), "Only when it turns Yes" (zadziała przy przejściu z innej odpowiedzi na Yes, a potem dopiero po powrocie do innej odpowiedzi) albo "Only once in this chat". **Pause after it fires (runs)** pomija tyle przebiegów agenta po Yes, ile wpiszesz: od 0 do 50. Przebieg to jedna tura agenta, więc pauza 2 przy agencie działającym co trzecią odpowiedź trwa sześć odpowiedzi. Reguła może też użyć "changed since the last run": Yes, gdy wartość różni się od tej z ostatniego przebiegu. W formularzu każda reguła wybiera **What the rule reads**: wartość podłączoną przewodem, wartość z Pulpitu, czat (liczbę wiadomości, kto mówił ostatni) albo kość World DM (Fate, Life lub Pacing: czy wstawiła notkę do tej odpowiedzi i jaki był wynik). Odczytanie kości wymaga zgody "Read what the World DM’s dice said for the last reply" i działa tylko przy agencie, który uruchamia się po odpowiedzi. Wstrzymywane jest tylko Yes; No i Unknown wychodzą dalej. Agent pamięta to osobno dla każdego czatu, a "start over" na agencie to zapomina. Karta Try pokazuje, dlaczego karta odpowiedziała (regułę, odczytaną wartość i wynik) oraz, gdy wstrzymała Yes, która opcja to zrobiła; dziennik agenta pod odpowiedzią zawiera te same wiersze.

## Próba

Karta Try wykonuje jedną wymyśloną rundę, niczego nie zmieniając. Zmieniasz wejścia, a przewody na planszy pokazują, co się dzieje; bez modelu każda karta „Ask the model” używa przykładowej odpowiedzi, którą możesz edytować. Pod „A real chat” wybierz czat i „Fill from this chat”, aby wczytać to, co agent naprawdę by dostał. „Run with the model” pyta wtedy prawdziwy model prawdziwym pytaniem: do N wywołań, prawdziwe tokeny i nic nie zapisuje się do czatu ani do agenta.

Agent z kartą Script, któremu w czacie trzy przebiegi z rzędu skończą się przekroczeniem czasu, jest tam zostawiany w spokoju: zakładka Agents mówi, że jest wstrzymany (każdy taki przebieg kosztowałby 2,5 sekundy skryptu). Napraw skrypt i naciśnij **Run again**; jeden udany przebieg kończy pauzę. Kafelki planszy terytorium to przyciski: naciśnij jeden, a jego miejsce trafi do pola wiadomości (nic nie zostaje wysłane). Kartę listy można też ustawić na "Change an entry, or add it if there is none", żeby coś powiedziane dwa razy nie zapełniało listy.

## Instalacja, zgoda, włączanie w czacie

1. Naciśnij „Install” („Update” dla zmienionej kopii zainstalowanego agenta; aby coś zmienić, użyj „Edit a copy”).
2. Zgódź się raz: „Review permissions”, potem „Allow all” lub pozycja po pozycji. Agent działa, gdy każda linia jest włączona. Aktualizacja prosząca o więcej czeka na nową zgodę. Karta Script prosi o „Run its own small program”; lista zgód pokazuje jej kod („Read the code”), zanim na nią pozwolisz, a jeśli aktualizacja zmienia kod, zgoda jest pytana ponownie.
3. Dodaj go do czatu. W pigułce nagłówka czatu otwórz kartę **Agents**: „In this chat” pokazuje aktywnych agentów, „Installed” pokazuje pozostałych (wybierz jednego, aby go dodać). Wiersz może uruchomić się ponownie teraz, zostać usunięty lub zatrzymać czekającą na niego odpowiedź. Nowy czat nie ma agentów, dopóki ich nie dodasz lub nie wybierzesz zestawu.

**Zestaw** to nazwana lista agentów („Save this chat's list as a set”; „Make default” daje go nowym czatom). Plansza „Agent sets” w Canvas pokazuje koszt każdego zestawu w czasie i wywołaniach, a także przełącznik „Agents' notes in chats”, który ukrywa notatki wszystkich agentów. Miejsce wyniku każdego agenta można zmienić na karcie Agents czatu, spośród miejsc, które mu pasują.

Każda karta „Ask the model” to jedno wywołanie na przebieg; edytor pokazuje ich liczbę. „Every Nth reply” dzieli koszt.
