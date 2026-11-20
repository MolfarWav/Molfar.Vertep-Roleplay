<!-- source: 4799ca6e92d8 -->
# Kilka map i rysowanie mapy

Czat może mieć więcej niż jedną mapę na mapie miejsc (kraj, miasto, loch), a każda mapa może otrzymać obraz namalowany przez model obrazu. Ta strona jest dla każdego, kto gra w świecie o więcej niż jednej skali. Podstawy mapy są na [[places-map]].

## Kilka map

Jeden czat może mieć więcej niż jedną mapę: kraj, plan miasta, loch. Każda ma własny obraz, miejsca, drogi i skalę. Otwórz menu zębatki i wybierz **Mapy tego czatu**: pierwsza mapa jest na liście, **Dodaj mapę** tworzy kolejną. Dla każdej mapy ustawiasz:

- **Nazwę.**
- **Skalę:** Miasteczko (podróż zajmuje minuty: ulice, budynek, poziom lochu), Region (godziny: wioski, lasy i drogi między nimi) lub Świat (dni: miasta i krainy daleko od siebie). Skala ustala, ile trwa podróż na tej mapie i jakie sposoby podróżowania są oferowane: pieszo, konno i pominięcie drogi wszędzie, taksówka na mapach miasteczka i regionu, metro na mapach miasteczka.
- **Plan:** miejsce, którego planem jest ta mapa (mapa miasta jest planem tego miasta) lub brak.

Gdy jest już kilka map, wiersz pod nagłówkiem pokazuje mapę, na którą patrzysz, ze strzałką: naciśnij ją, aby przełączyć, albo otworzyć listę ponownie. Mapa, na którą patrzysz, jest zapamiętywana dla każdego czatu w tej przeglądarce. Mapa będąca planem miejsca pokazuje strzałkę powrotu do mapy, która zawiera to miejsce.

**Miejsce istnieje tylko na mapach, na które je umieścisz.** **Miejsca na tej mapie** (menu zębatki) wyświetla każde miejsce z polem wyboru: zaznacz miejsce, aby pokazać je na tej mapie, odznacz, aby usunąć je tylko z tej mapy (jego pomieszczenia idą z nim; miejsce na żadnej mapie wraca na mapę, na której toczy się historia). Nowe miejsce dodane przez World DM trafia na mapę, na której toczy się historia; nowe miasto, wioska lub zamek trafia też na mapę regionu i świata. Nowa mapa regionu lub świata zaczyna z miastami, wioskami i zamkami, które już masz. Nowa mapa miasteczka zaczyna pusta i mówi o tym, z przyciskiem do tej samej listy.

**Miejsce, które ma własną mapę**, otrzymuje na swojej karcie przycisk **Otwórz mapę tego miejsca**; **Zrób mapę tego miejsca** w jego menu z trzema kropkami tworzy pustą mapę będącą jego planem i otwiera ją. Miejsce otwarte z mapy kraju to to samo miejsce co na mapie miasta; miejsce historii na mapie kraju to miasto, którego plan je zawiera (gdy historia toczy się w tawernie w mieście, mapa kraju zaznacza miasto).

Droga jest przechowywana na mapie, która ma oba jej miejsca. Podróż odbywa się w obrębie jednej mapy: na mapie świata idziesz z miasta do miasta i historia dociera do samego miasta; aby przejść do tawerny w nim, otwórz mapę miasta (strzałka powrotu i przycisk Otwórz przenoszą między nimi) i ruszaj stamtąd.

Obraz mapy wybiera się jak każdy inny (gotowa mapa, własny, brak lub narysowany): mapa regionu lub świata zaczyna od planu regionu niezależnie od miejsc, mapa miasteczka od planu pasującego do jego miejsc.

## Narysuj mapę

**Narysuj mapę modelem obrazu** (menu zębatki) maluje obraz dla widocznej mapy modelem obrazu wybranym w Settings > Images. Okno zawiera:

- **Jaki to rodzaj mapy:** region, kontynent, miasto otoczone murami, miasto portowe, wioska, dzicz, wybrzeże, plan domu, loch, jaskinie oraz rodzaje nowoczesnego miasta (centrum, metropolia, przedmieście, dzielnica przemysłowa, kampus, nabrzeże, lotnisko, małe miasteczko). Mapa regionu zaczyna od Regionu, mapa świata od Kontynentu.
- **Co narysować:** prompt wypełniony na podstawie rodzaju i nazw miejsc na mapie. Prosi tylko o podłoże (ląd, wodę, drogi, puste działki), bo twoje miejsca to ikony nakładane na wierzch. Zmieniaj go, jak chcesz; wybranie innego rodzaju przepisuje go, dopóki go nie edytowałeś.
- Wiersz z modelem obrazu i przypomnieniem, że każdy obraz to jedno wywołanie, które może kosztować pieniądze.

**Narysuj mapę** wykonuje jedno wywołanie i pokazuje wynik w oknie; nic jeszcze się nie zmieniło. **Użyj tej mapy** czyni ją obrazem tej mapy (pozostałe mapy zachowują swoje), **Narysuj ponownie** wraca do promptu. Jeśli nie skonfigurowano modelu obrazu, wywołanie to zgłasza; dodaj go w Settings > Images.
