<!-- source: fb9a5c566739 -->
# Panel sceny

Panel to panel obok czatu, który śledzi scenę: kto jest obecny, co każda postać o tobie myśli, co noszą i co wiedzą, jakie wątki fabularne są otwarte. Jest dla każdego, kto chce, aby historia pamiętała relacje i szczegóły między odpowiedziami. Artykuł pomocy *Panel sceny* wymienia jego pola.

## Co śledzi

Otwórz go, klikając portret na czacie i wybierając Panel. Panel boczny ma cztery zakładki: **Person** (nastawienie, nastrój i stan, strój i rzeczy: co noszą, trzymają i mają przy sobie oraz co leży w pobliżu), **Here** (miejsce, pogoda, kto jest obecny), **Quests** (otwarte wątki: główne, poboczne, codzienne; quest zamyka się sam w turze, w której historia go kończy, każe mu się nie powieść albo go mija, a quest powiązany ze sceną kończy się wraz z tą sceną) i **Notes** (notatnik: co postać wie i czy to widziała, usłyszała czy zgadła). „Constellation" nazywa, jak postać stoi wobec ciebie, na przykład Friendship albo Romance. Liczba na zakładce zlicza zmiany od twojej ostatniej odpowiedzi (na czerwono, gdy coś spadło). Widok szeroki ma też Dziennik z myślą i wspomnieniami postaci. Na telefonie ta sama treść otwiera się jako arkusz.

**Jedna osoba wymieniona dwa razy.** Jeśli Panel pokazuje tę samą osobę pod dwoma imionami (powiedzmy „Sina" i „Sina Rose"), otwórz jedno z nich i użyj małego przycisku osób w nagłówku Person, potem „Same person as..." i wybierz drugie. Najpierw jesteś pytany: notatki, historia i rzeczy przechodzą do osoby, którą wybrałeś, jej liczby relacji zostają, imię staje się jej kolejnym imieniem i nie można tego cofnąć. Panel sam też sugeruje prawdopodobne duplikaty: ramka na górze zakładki Person (oraz chip „Possible duplicate" w „Since your last reply") mówi „X może być tą samą osobą co Y" wraz z powodem. „Merge into Y" robi to samo co menu; „Different people" rozdziela je i Panel przestaje sugerować tę parę. To samo menu ma „Not in the scene" dla kogoś, kogo historia tylko wspomina, ale kogo model wstawił do sceny: osoba znika z listy „obecni", pozostaje znana wraz ze swoimi notatkami, a Panel nie przywraca jej, chyba że się odezwie (powiadomienie ma „Undo", a potem menu proponuje „Put back in the scene"). „Remove from the Dashboard" jest dla imienia, które jest po prostu błędne: usuwa osobę ze wszystkich zapisanych stanów.

Postać, która kontaktuje się z innego miejsca (wiadomość tekstowa, list, rozmowa, wideo), jest tak oznaczona w linii sceny, z jednym krótkim zdaniem o tym, co do niej dociera: przez wiadomość lub list tylko wysłane słowa; przez rozmowę tylko głos i dźwięki w pobliżu telefonu; przez wideo tylko to, co jest w kamerze i co słychać w pobliżu. Cicha czynność, taka jak nastawienie czajnika, nie jest im znana.

Liczby (zaufanie, komfort, pociąg, szacunek, czułość i inne) są wyliczane przez kod ze zdarzeń, które zgłasza model, i przechylane przez [[soul]] każdej postaci. Stan jest przechowywany dla każdej wiadomości, więc przesunięcie palcem ani usunięta wiadomość nigdy nie zostawiają nieaktualnych liczb.

Czyje to uczucie: każda liczba pokazuje, jak dana postać odnosi się do *twojej* postaci, nigdy odwrotnie. Zdarzenia za nimi to to, co robi twoja postać: pocałunek w czoło albo uścisk ogrzewa comfort i affection, tylko romantyczny pocałunek podnosi arousal. Gdy postać krzywdzi twoją postać (zdradza, kłamie, odchodzi), to czyn tej postaci: nie zapisuje się na konto twojej postaci, a sensorowi mówi się, żeby nie obniżał za to zaufania tej postaci do ciebie. Jeśli liczba nadal zmienia się błędnie, zgłoś to jako issue: model sensora to model, a mały może źle odczytać scenę.

Przycisk „Story, move" obok Send uzbraja jednorazowe popchnięcie dla następnej odpowiedzi; jego strzałka wybiera otwarty wątek albo zwrot akcji.

## Co się zmieniło, na czacie

Pod najnowszą odpowiedzią wyciszona linia mówi, co Panel dla niej zarejestrował: „Changed: Ada · trust fell, mood calm → tense, +2". Dotknij jej, aby rozwinąć te same chipy co rząd „Since your last reply" w Panelu; chip otwiera pasującą zakładkę Panelu (na telefonie jego dolny arkusz). Starsze odpowiedzi nie pokazują nic, a linia czeka, gdy odpowiedź jest pisana albo Panel wciąż się aktualizuje. Aby ją ukryć, wyłącz „Show what changed under the newest reply" w Settings > Chat Behavior.

## Więzi między postaciami

Sensor odnotowuje, jak dwoje postaci, które nie są tobą, stoi wobec siebie, jako jednosłowną rolę i jednosłowne ciepło („rival, cold"). Podpowiedź odpowiedzi niesie do czterech takich więzi jako jedną krótką linię, tylko dla osób obecnych w scenie. Własna odpowiedź postaci dostaje tylko te więzi, których ta postać jest częścią; narrator dostaje najpierw więzi osób, których dotyczy tura.

## Co postać powiedziała, i kłamstwa

Pod notatnikiem osoby lista **Said** przechowuje mocne rzeczy, które powiedzieli i które ich wiążą: przysięgę, groźbę, wyznanie, rozkaz. Kłamstwo też jest tam trzymane, zakryte, dopóki nie wybierzesz „Show hidden".

Gdy postać kłamie przed innymi, inni biorą to za prawdę. Ich następne odpowiedzi traktują to jako coś, co im powiedziano i w co nie mają powodu wątpić, dopóki historia nie pokaże inaczej. Tylko osoby obecne w scenie dają się oszukać i tylko we własnych odpowiedziach: ktoś inny mówiąc, nie powtarza kłamstwa.

Otwórz kłamstwo i zobaczysz **Believe it:** z przyciskiem dla każdej osoby, która wciąż w nie wierzy. Naciśnij imię, gdy ta osoba się dowiedziała. Menu tego rzędu ma też **This was a lie** dla stwierdzenia, którego sensor nie nazwał kłamstwem (osoby w scenie wtedy w nie wierzą) oraz **Not a lie**, gdy sensor się pomylił. Sensor sam kończy wiarę, gdy odpowiedź pokazuje, że prawda wychodzi na jaw. Usunięcie kłamstwa z listy usuwa wraz z nim każdą wiarę.

> Narrator wypowiada wszystkich w jednej odpowiedzi, więc zawsze zna prawdę. To tylko powstrzymuje jedną postać przed działaniem na tym, co wie inna postać.

## Kiedy się aktualizuje

Przycisk „Settings" wewnątrz Panelu otwiera jego ustawienia; zakładka Sensor ma tryb:

- **Sensor** (domyślnie): po każdej odpowiedzi model czyta nowe wiadomości i zgłasza, co się stało.
- **Fast: inside the story reply**: dla mocnych modeli. Model opowieści sam pisze raport na końcu swojej odpowiedzi, bez osobnego wywołania, dodając trochę tokenów do każdej odpowiedzi. Jeśli pominie raport, uruchamia się zwykły sensor.
- **Manual**: aktualizuje się tylko, gdy naciśniesz „Refresh".

## Ile to kosztuje

W trybie Sensor jedno dodatkowe wywołanie modelu na odpowiedź, na „Sensor model" (model czatu, jeśli zostawisz puste). Tani, mały model wystarczy. Czyta nowe wiadomości w całości (razem do około 12000 znaków; dłuższa odpowiedź traci tylko środek), a kod najpierw oznacza zdania, które wyglądają na ubranie, ubieranie się lub pocałunek, i wskazuje je modelowi, więc spódnica nazwana raz w środku długiej odpowiedzi i tak trafia do stroju. Jeśli karta postaci ma linię „Attire:", sensorowi pokazuje się ją też jako odniesienie dla dokładnego brzmienia sztuki ubrania, o której wspomina tekst (nigdy nie dodaje ubrania, którego tekst nie pokazuje). To, co postać nosi i trzyma, jest przechowywane jako lista przedmiotów; ubranie, które się podrze lub zabrudzi, zostaje jednym przedmiotem. Każda rzecz zachowuje jedną tożsamość, gdziekolwiek trafi: noszona, zdjęta przy drzwiach, podana komuś innemu. Rzeczy zostawione w miejscu tam zostają: gdy historia wraca do kawiarni, kubek wciąż jest na stole. Gdy historia nie pokazała przez około sześć tur, co ktoś nosi, model piszący jest proszony, by wspomnieć o tym krótko. Aby dodać słowa dla języka, którego skan nie zna, wypisz je w `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` wyłącza skan. Panel dodaje też krótki „Prompt insert" do tego, co czyta model opowieści, aby postacie wiedziały, na czym stoją: możesz to wyłączyć i ustawić „Tokens per character". „What the model sees" w ustawieniach pokazuje ten wstawiony tekst.

## Jak to wyłączyć

Nie ma osobnego wyłącznika na wymienionych tu ekranach. Ustaw tryb na „Manual", a nigdy sam nie wywoła modelu. Aby usunąć go całkowicie, wyłącz wtyczkę Dashboard w przycisku Plugins w Molfar Vertep; Tools > Plugins w Roleplay wymienia tylko to, co działa. Wyłącz „Prompt insert", jeśli chcesz, aby nie trafiał do żądania.

## Powiązane

[[soul]] go zasila; [[litopys]] korzysta z jego notatek; [[memory]] porównuje go z innymi rodzajami pamięci.
