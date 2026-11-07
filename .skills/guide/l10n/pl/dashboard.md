<!-- source: 36f23a51ff05 -->
# Pulpit sceny

Pulpit to panel obok czatu, który śledzi scenę: kto jest obecny, co każda postać do ciebie czuje, co nosi i co wie, otwarte wątki historii. Jest dla tych, którzy chcą, aby historia pamiętała relacje i szczegóły między odpowiedziami. Artykuł Pomocy *Scene dashboard* opisuje jego pola.

## Co śledzi

Otwórz go, klikając portret w czacie i wybierając Dashboard. Panel boczny ma cztery karty: **Person** (nastawienie, nastrój i stan, strój i rzeczy), **Here** (miejsce, pogoda, kto jest obecny), **Quests** (otwarte wątki: główny, poboczny, codzienny) i **Notes** (notatnik: co postać wie oraz czy to widziała, słyszała czy zgadła). „Constellation” nazywa, jak postać odnosi się do ciebie, na przykład Friendship lub Romance. Liczba na karcie zlicza zmiany od twojej ostatniej odpowiedzi (czerwona, gdy coś spadło). Szeroki widok ma też Dziennik z myślą postaci i wspomnieniami. Na telefonie ta sama treść otwiera się jako arkusz.

**Jedna osoba wymieniona dwa razy.** Jeśli Pulpit pokazuje tę samą osobę pod dwoma imionami (powiedzmy „Sina” i „Sina Rose”), otwórz jedno z nich i użyj małego przycisku z ludzikiem w nagłówku Person, a następnie „Same person as...” i wybierz drugie. Najpierw zostaniesz zapytany: notatki, historia i rzeczy przechodzą do osoby, którą wybrałeś, jej liczby relacji zostają, imię staje się kolejnym jej imieniem i nie można tego cofnąć. Pulpit sam też podpowiada prawdopodobne duplikaty: ramka u góry karty Person (oraz chip „Possible duplicate” w „Since your last reply”) mówi „X may be the same person as Y” z powodem. „Merge into Y” robi to samo co menu; „Different people” rozdziela ich i Pulpit przestaje podpowiadać tę parę. To samo menu ma „Remove from the Dashboard” dla imienia, które jest po prostu błędne.

Liczby (zaufanie, komfort, pociąg, szacunek, sympatia i więcej) są wyliczane przez kod ze zdarzeń, które zgłasza model, i nachylane przez [[soul]] każdej postaci. Stan jest trzymany dla każdej wiadomości, więc przeciągnięcie lub usunięta wiadomość nigdy nie zostawia nieaktualnych liczb.

Przycisk „Story, move” obok Wyślij uzbraja jednorazową podpowiedź do następnej odpowiedzi; jego strzałka wybiera otwarty wątek lub zwrot akcji.

## Co się zmieniło w czacie

Pod najnowszą odpowiedzią stonowany wiersz mówi, co Pulpit zapisał przy niej: „Changed: Ada · trust fell, mood calm → tense, +2”. Dotknij go, aby rozwinąć te same chipy, co wiersz „Since your last reply” Pulpitu; chip otwiera pasującą kartę Pulpitu (na telefonie jej dolny arkusz). Starsze odpowiedzi nic nie pokazują, a wiersz czeka, gdy odpowiedź jest pisana albo Pulpit wciąż się aktualizuje. Aby go ukryć, wyłącz „Show what changed under the newest reply” w Settings > Chat Behavior.

## Powiązania między postaciami

Sensor zapisuje, jak względem siebie stoją dwie postacie, które nie są tobą: jako jedną rolę i jedno słowo o cieple („rival, cold”). Prompt odpowiedzi niesie do czterech takich wpisów jako jedną krótką linię, tylko dla osób w scenie. Odpowiedź postaci dostaje tylko te powiązania, w których ta postać uczestniczy; narrator najpierw dostaje powiązania osób, których dotyczy tura.

## Co powiedziała postać i kłamstwa

Pod notatnikiem osoby lista **Said** przechowuje mocne rzeczy, które powiedziała i których się trzyma: przysięgę, groźbę, wyznanie, rozkaz. Kłamstwo jest tam także przechowywane, zakryte, dopóki nie wybierzesz „Show hidden”.

Gdy postać kłamie przy innych, inni biorą to za prawdę. Ich kolejne odpowiedzi traktują to jako coś, co im powiedziano, i nie mają powodu w to wątpić, dopóki historia nie pokaże inaczej. Oszukani są tylko ci, którzy byli w scenie, i tylko w swoich własnych odpowiedziach: ktoś inny, mówiąc, nie powtarza kłamstwa.

Otwórz kłamstwo, a zobaczysz **Believe it:** z przyciskiem dla każdej osoby, która wciąż w nie wierzy. Naciśnij imię, gdy ta osoba się dowiedziała. Menu wiersza ma też **This was a lie** dla stwierdzenia, którego sensor nie uznał za kłamstwo (wtedy wierzą w nie osoby w scenie), oraz **Not a lie**, gdy sensor się pomylił. Sensor sam kończy wiarę, gdy odpowiedź pokazuje wychodzącą na jaw prawdę. Usunięcie kłamstwa z listy usuwa wraz z nim każdą wiarę.

> Narrator wypowiada wszystkich w jednej odpowiedzi, więc zawsze zna prawdę. To tylko powstrzymuje jedną postać przed działaniem na podstawie tego, co wie inna postać.

## Kiedy się aktualizuje

Przycisk „Settings” w Pulpicie otwiera jego ustawienia; karta Sensor ma tryb:

- **Sensor** (domyślny): po każdej odpowiedzi model czyta nowe wiadomości i zgłasza, co się stało.
- **Fast: inside the story reply**: dla silnych modeli. Model historii sam pisze raport na końcu swojej odpowiedzi, bez osobnego wywołania, dodając trochę tokenów do każdej odpowiedzi. Jeśli pominie raport, działa zwykły sensor.
- **Manual**: aktualizuje się tylko po naciśnięciu „Refresh”.

## Ile to kosztuje

W trybie Sensor jedno dodatkowe wywołanie modelu na odpowiedź, na „Sensor model” (model czatu, jeśli zostawisz puste). Wystarczy tani, mały model. Czyta nowe wiadomości w całości (łącznie do około 12000 znaków; dłuższa odpowiedź traci tylko środek), a kod najpierw zaznacza zdania, które wyglądają na ubranie, ubieranie lub pocałunek, i wskazuje je modelowi, więc spódnica nazwana raz w środku długiej odpowiedzi i tak trafia do stroju. Jeśli karta postaci ma wiersz „Attire:”, sensor dostaje go też jako punkt odniesienia dla dokładnego brzmienia ubioru, o którym mówi tekst (nigdy nie dodaje ubioru, którego tekst nie pokazuje). To, co postać nosi i trzyma, jest trzymane jako lista rzeczy; ubranie, które się podrze lub ubrudzi, zostaje jedną rzeczą. Każda rzecz zachowuje jedną tożsamość, gdziekolwiek trafi: noszona, zdjęta przy drzwiach, podana komuś innemu. Rzeczy zostawione w jakimś miejscu tam zostają: gdy historia wraca do kawiarni, filiżanka wciąż stoi na stole. Gdy historia przez około sześć tur nie pokazuje, co ktoś nosi, model piszący jest proszony, aby krótko o tym wspomniał. Aby dodać słowa dla języka, którego skan nie zna, wypisz je w `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` wyłącza skan. Pulpit dodaje też krótki „Prompt insert” do tego, co czyta model historii, aby postacie wiedziały, na czym stoją: możesz go wyłączyć i ustawić „Tokens per character”. „What the model sees” w ustawieniach pokazuje wstawkę.

## Jak to wyłączyć

W ekranach opisanych tutaj nie ma osobnego wyłącznika. Ustaw tryb na „Manual”, a nigdy sam nie wywoła modelu. Aby usunąć go całkowicie, wyłącz wtyczkę Dashboard w przycisku Plugins w Molfar Vertep; Tools > Plugins w Roleplay tylko pokazuje, co działa. Wyłącz „Prompt insert”, jeśli ma nie trafiać do zapytania.

## Powiązane

[[soul]] go zasila; [[litopys]] korzysta z jego notatek; [[memory]] porównuje go z innymi rodzajami pamięci.
