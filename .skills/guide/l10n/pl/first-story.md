<!-- source: 45efabb467af -->
# Twoja pierwsza historia

To najkrótsza droga od pustego Roleplay do działającej historii oraz lista tego, co dzieje się samo, aby nic cię nie zaskoczyło. Najpierw potrzebujesz połączenia z modelem: zobacz [[vertep:models]].

## Kroki

1. **Zdobądź kartę.** Na Home naciśnij „New character” i napisz ją albo „Import card”, aby wczytać kartę PNG lub JSON z pliku. Możesz też przeszukać sekcję Marketplace lub nacisnąć „With Molfar”, aby Molfar naszkicował kartę z twojego pomysłu. Zobacz [[characters]].
2. **Zapisz ją.** Edytor kart trzyma zmiany w szkicu, dopóki nie naciśniesz „Save changes”.
3. **Wybierz personę** (kim grasz) w sekcji Personas albo zostaw domyślną. „Use this persona” czyni ją twoją domyślną.
4. **Zacznij czat.** Naciśnij „New chat” na karcie. Czat otwiera się z pierwszą wiadomością karty.
5. **Sprawdź model.** Pigułka w nagłówku czatu ma kartę Model; wybór modelu tam zmienia tylko ten czat.
6. **Pisz.** Pod każdą odpowiedzią możesz przeglądać inne wersje (swipe'y); prawa strzałka na ostatniej wersji prosi o nową. Aby powtórzyć odpowiedź z kierunkiem, użyj „Regenerate with a hint” w menu „+”. Aby ukierunkować odpowiedź na wiadomość, którą piszesz, wpisz instrukcję w podwójnych nawiasach, na przykład `I walk in. [[Aria is hiding a secret.]]`: model czyta ją jako didaskalię, a nie jako coś, co powiedziałeś (menu „+” ma „Stage direction”, które wpisze nawiasy za ciebie). Przycisk „More” na wiadomości oferuje edycję, rozwidlenie, podgląd promptu i więcej.

## Co działa samo

Gdy czat ma już odpowiedzi, działają pomocnicy w tle, każdy z własnymi wywołaniami modelu:

- Pulpit czyta scenę po każdej odpowiedzi ([[dashboard]]).
- Litopys pisze rozdział, gdy scena się zamyka ([[litopys]]).
- World DM, na najniższym aktywnym poziomie (Chronicler), zapisuje osoby i miejsca do księgi tego czatu ([[world-dm]]).
- Karta bez duszy dostaje automatycznie propozycję duszy ([[soul]]).

Niepowodzenia tych zadań są wymienione w Skrzynce odbiorczej.

## Jeśli model jest mały, wolny lub płatny za wywołanie

Najtańsze oszczędności, po kolei:

1. W „Settings” Pulpitu ustaw tryb na „Manual” (wtedy aktualizuje się tylko po naciśnięciu Refresh) albo wybierz mały model jako „Sensor model”.
2. W „Litopys settings” Biblioteki zmniejsz „Memory size” lub wyłącz „Chapters and facts”.
3. W arkuszu World wybierz poziom „Off” (wciąż robi małe wywołanie, gdy scena nazwie nowe miejsce) albo wybierz tani „DM model (all chats)”.
4. W ustawieniach Pulpitu wyłącz „Rate characters automatically”.
5. W Canvas plansza Prompt pokazuje każdą część następnego zapytania z jej tokenami i pozwala wyłączać części dla jednego czatu.

Długa historia wymaga własnych środków: zobacz [[long-chats]].

Darmowe modele z małym oknem kontekstu najlepiej radzą sobie z pulpitem Manual i pamięcią Compact.

## Dalej

[[memory]] wyjaśnia rodzaje pamięci; [[settings]] mówi, gdzie wszystko się ustawia.
