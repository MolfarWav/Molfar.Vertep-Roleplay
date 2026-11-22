<!-- source: ae865b32181c -->
# Direzione: chi è nella scena

La Direzione è per le chat di gruppo. Dopo ogni risposta, un piccolo ed economico modello "direttore" legge la scena e dice che tipo di scena è (una lezione, una pausa, un momento da soli, un appuntamento) e quali membri sono presenti. I membri che non sono lì smettono di rispondere e vengono esclusi dal prompt finché la storia non li riporta.

## La barra

In una chat di gruppo c'è una barra sottile sotto la barra dei membri, contrassegnata "Direction" (su telefono solo l'icona). Da sinistra a destra:

- **Il chip della scena**: il tipo di scena e chi è qui ("Alone moment, with Yuzu" o "Lesson, 4 here"). Toccalo per vedere chi è qui e chi non è nella scena, quando è stato fatto l'ultimo rapporto, e un pulsante **Report now** che chiede di nuovo al direttore. Mentre il direttore legge, il chip dice "Reading the scene…".
- **Il chip del modello**: il modello del direttore. Se non ne è selezionato nessuno, mostra **Pick a model**. Toccalo per avere la stessa lista di modelli che ha la barra superiore della chat: modelli preferiti, poi tutti i modelli per connessione, con una casella di ricerca.
- **L'interruttore**: Direzione attivata o disattivata per questa chat. Finché non viene scelto un modello, è disattivato e dice "Pick a model first".
- **Next**: un chip che compare mentre una regola di genere ha una nota in attesa della risposta successiva ("Next: Yuzu"). La x la salta.
- **Rules**: apre il foglio Direction con due schede, **Rules** e **Log**. Sta accanto all'interruttore, così resta visibile su un telefono (lì è solo un'icona, con un puntino mentre le regole sono attive).

Con l'interruttore spento, la barra si ripiega in "Direction: off" e la chat funziona come prima.

## Regole di genere

Un genere è un insieme di piccole regole che portano le persone nella scena per caso, così una storia di quel genere non si blocca. Apri **Rules** e scegli un genere. Per ora ce n'è uno, **School rom-com**, con tre regole:

- **Interrupted moment**: sei rimasto solo con un membro per tre risposte, e qualcuno entra e vi trova insieme.
- **Someone comes by**: per tre risposte non c'è stato nessuno in giro (non a casa), e un membro passa a trovarti.
- **Friends join the break**: durante una pausa, il pranzo o il club con una o due persone presenti, si unisce un amico.

Una chat parte senza genere e con le regole spente, quindi nulla cambia finché non ne scegli uno. Scegliere un genere accende le regole; **Rules in this chat** le spegne di nuovo e mantiene il genere. Le regole hanno bisogno che il direttore sia attivo: leggono i suoi rapporti.

Dopo ogni risposta, il codice (non un modello) controlla le regole in ordine. Una regola può scattare quando le sue condizioni sono vere, non è in pausa e un lancio di due dadi raggiunge il suo numero. Se scatta, la risposta successiva riceve una breve nota di scena ("Yuzu walks in on you and Hana and interrupts the moment") e la persona conta come presente, così la sua scheda viene inviata intera. Al massimo una nota per risposta. Il blocco, un ritorno dopo il blocco, e un evento o una persona che torna da World passano prima; la regola attende allora un altro turno.

Ogni scheda di regola mostra il suo stato: **Ready**, **Cooling down** (risposte rimaste) oppure **Quiet for the payoff**, e quante volte è scattata verso il finale. **Numbers** apre le sue impostazioni:

- **2d6 needed**: il lancio deve raggiungere questo numero; il testo accanto dà la percentuale di lanci ("about 42%"). 2 scatta sempre, 13 mai.
- **Cooldown**: risposte per cui la regola resta in silenzio dopo essere scattata.
- **Payoff every** e **Then quiet**: ogni K-esima volta che scatta, la regola riposa per altre M risposte ("finally alone"). 0 disattiva il finale.

**Fire now** mette la nota della regola sulla risposta successiva senza lancio, senza cooldown e senza contare verso il finale; serve che qualcuno sia assente. **Skip** scarta una nota in attesa. Una nota saltata o una risposta eliminata vengono dimenticate, insieme al loro cooldown; far scorrere la risposta che portava una nota dà al nuovo tentativo la stessa nota.

Sotto la risposta che portava una nota, una piccola riga dice cosa è successo: "Direction: Mei joins (Friends join the break, 2d6 = 10, needed 9) · came". L'ultima parola è il rapporto successivo del direttore: **came** (sono nella scena), **only mentioned** (solo menzionata) oppure **did not come** (non è venuta). La scheda **Log** elenca la stessa cosa con il lancio e il motivo, e anche le regole che hanno lanciato e mancato.

Un gruppo può impostare un **default genre** nella sua scheda **Direction**; le sue nuove chat partono con quel genere attivo. I numeri sono prime stime: cambiali in una chat se una regola scatta troppo spesso o troppo raramente.

## Scegliere il modello

C'è un solo modello direttore per tutte le chat e tutti i gruppi. Sceglilo da una qualsiasi barra, o dalla scheda **Direction** del gruppo. Non c'è un predefinito: scegli tu. Un modello piccolo e veloce basta: costa una breve chiamata dopo ogni risposta.

Una nuova chat di gruppo parte con la Direzione attiva non appena viene scelto un modello. Le chat che avevi già non vengono toccate. Ogni chat ha il proprio interruttore.

## Chi è assente

Un chip di un membro cambia quando qualcuno è fuori dalla scena: l'immagine si attenua e porta un piccolo segno di porta. Un segno di lucchetto indica che il blocco (sotto) lo ha lasciato fuori. Tocca un chip: il suo popover dice "Here" o "Not in the scene".

Un membro assente non prende turni da solo e la sua scheda non viene inviata al modello: solo una riga dice che non è nella scena. Nominarlo nel tuo messaggio lo richiama comunque. Quando il direttore lo vede tornare, la sua scheda completa ritorna.

## Il blocco e il ritorno

Per tenere una scena con una persona sola, tocca il chip di un membro e scegli **Only <name> in the scene**. Un chip "Only Yuzu" compare prima del chip della scena, e gli altri restano fuori qualunque cosa dica il direttore. Tocca la x su quel chip, o **Release the lock** nel popover di un membro, per rilasciarlo. Alla risposta successiva, agli altri viene detto che possono tornare e alla storia viene chiesto di dare loro un modo per rientrare.

## Se il direttore fallisce

Se la risposta del direttore non può essere letta, o la chiamata fallisce, il chip della scena dice **No report**; aprilo per vedere perché. La chat usa allora l'idea che il Dashboard ha su chi è qui, oppure lascia rispondere tutti come prima. Nulla della tua storia va perso.

## Nuovi gruppi

**New group** apre una finestra ampia (a schermo intero su telefono). Dai un nome al gruppo, o lascia il nome vuoto per usare i primi tre membri. Cerca, restringi con **All**, **Favourites** e **Recent**, usa i chip dei tag e un ordinamento (Name, Recently used, Most chats), e tocca i ritratti per scegliere. I membri scelti stanno in una riga in alto in ordine di parola; le frecce spostano uno prima o dopo, la x rimuove. **Next** richiede due caratteri.

Dopo **Next** il gruppo viene creato e il suo editor si apre con una nota: controlla come funziona, poi avvia la prima chat. **Start chat** è il pulsante principale. La scheda **Direction** imposta se le nuove chat di questo gruppo partono con la Direzione attiva, e mostra il modello del direttore. Un gruppo nella pagina dei gruppi apre lo stesso editor, e così fa il nome del gruppo in cima alla sua chat.

Quando avvii una chat successiva di un gruppo, il breve passaggio prima della chat ha un interruttore **Direction**: attivo quando l'impostazione predefinita del gruppo è attiva e un modello è stato scelto.

Vedi anche [[characters]] e [[dashboard]].
