<!-- source: 6095bc511c69 -->
# Pulpit sceny

Pulpit to panel obok czatu, który śledzi scenę: kto jest obecny, co każda postać do ciebie czuje, co nosi i co wie, otwarte wątki historii. Jest dla tych, którzy chcą, aby historia pamiętała relacje i szczegóły między odpowiedziami. Artykuł Pomocy *Scene dashboard* opisuje jego pola.

## Co śledzi

Otwórz go, klikając portret w czacie i wybierając Dashboard. Panel boczny ma cztery karty: **Person** (nastawienie, nastrój i stan, strój i rzeczy), **Here** (miejsce, pogoda, kto jest obecny), **Quests** (otwarte wątki: główny, poboczny, codzienny) i **Notes** (notatnik: co postać wie oraz czy to widziała, słyszała czy zgadła). „Constellation” nazywa, jak postać odnosi się do ciebie, na przykład Friendship lub Romance. Liczba na karcie zlicza zmiany od twojej ostatniej odpowiedzi (czerwona, gdy coś spadło). Szeroki widok ma też Dziennik z myślą postaci i wspomnieniami. Na telefonie ta sama treść otwiera się jako arkusz.

Liczby (zaufanie, komfort, pociąg, szacunek, sympatia i więcej) są wyliczane przez kod ze zdarzeń, które zgłasza model, i nachylane przez [[soul]] każdej postaci. Stan jest trzymany dla każdej wiadomości, więc przeciągnięcie lub usunięta wiadomość nigdy nie zostawia nieaktualnych liczb.

Przycisk „Story, move” obok Wyślij uzbraja jednorazową podpowiedź do następnej odpowiedzi; jego strzałka wybiera otwarty wątek lub zwrot akcji.

## Kiedy się aktualizuje

Przycisk „Settings” w Pulpicie otwiera jego ustawienia; karta Sensor ma tryb:

- **Sensor** (domyślny): po każdej odpowiedzi model czyta nowe wiadomości i zgłasza, co się stało.
- **Fast: inside the story reply**: dla silnych modeli. Model historii sam pisze raport na końcu swojej odpowiedzi, bez osobnego wywołania, dodając trochę tokenów do każdej odpowiedzi. Jeśli pominie raport, działa zwykły sensor.
- **Manual**: aktualizuje się tylko po naciśnięciu „Refresh”.

## Ile to kosztuje

W trybie Sensor jedno dodatkowe wywołanie modelu na odpowiedź, na „Sensor model” (model czatu, jeśli zostawisz puste). Wystarczy tani, mały model. Pulpit dodaje też krótki „Prompt insert” do tego, co czyta model historii, aby postacie wiedziały, na czym stoją: możesz go wyłączyć i ustawić „Tokens per character”. „What the model sees” w ustawieniach pokazuje wstawkę.

## Jak to wyłączyć

W ekranach opisanych tutaj nie ma osobnego wyłącznika. Ustaw tryb na „Manual”, a nigdy sam nie wywoła modelu. Aby usunąć go całkowicie, wyłącz wtyczkę Dashboard w przycisku Plugins w Molfar Vertep; Tools > Plugins w Roleplay tylko pokazuje, co działa. Wyłącz „Prompt insert”, jeśli ma nie trafiać do zapytania.

## Powiązane

[[soul]] go zasila; [[litopys]] korzysta z jego notatek; [[memory]] porównuje go z innymi rodzajami pamięci.
