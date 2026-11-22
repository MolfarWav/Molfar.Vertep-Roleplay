<!-- source: 3b04df871946 -->
# Direzione: chi è nella scena

La Direzione è per le chat di gruppo. Dopo ogni risposta, un piccolo ed economico modello "direttore" legge la scena e dice che tipo di scena è (una lezione, una pausa, un momento da soli, un appuntamento) e quali membri sono presenti. I membri che non sono lì smettono di rispondere e vengono esclusi dal prompt finché la storia non li riporta.

## La barra

In una chat di gruppo c'è una barra sottile sotto la barra dei membri, contrassegnata "Direction" (su telefono solo l'icona). Da sinistra a destra:

- **Il chip della scena**: il tipo di scena e chi è qui ("Alone moment, with Yuzu" o "Lesson, 4 here"). Toccalo per vedere chi è qui e chi non è nella scena, quando è stato fatto l'ultimo rapporto, e un pulsante **Report now** che chiede di nuovo al direttore. Mentre il direttore legge, il chip dice "Reading the scene…".
- **Il chip del modello**: il modello del direttore. Se non ne è selezionato nessuno, mostra **Pick a model**. Toccalo per la stessa lista di modelli che ha la barra superiore della chat: modelli preferiti, poi tutti i modelli per connessione, con una casella di ricerca.
- **L'interruttore**: Direzione attivata o disattivata per questa chat. Finché non viene scelto un modello, è disattivato e dice "Pick a model first".
- **Log**: gli ultimi rapporti (il tipo di scena, chi era qui, quanto tempo ci è voluto, quanti token), e ogni interruttore, blocco, rilascio ed errore, dal più recente.

Con l'interruttore spento, la barra si comprime in "Direction: off" e la chat funziona come prima.

## Scegliere il modello

C'è un modello direttore per tutte le chat e tutti i gruppi. Sceglilo da qualsiasi barra, o dalla scheda **Direction** del gruppo. Non c'è un predefinito: scegli tu. Un modello piccolo e veloce è sufficiente: costa una breve chiamata dopo ogni risposta.

Una nuova chat di gruppo inizia con la Direzione attivata non appena viene scelto un modello. Le chat che avevi già non vengono toccate. Ogni chat ha il proprio interruttore.

## Chi è assente

Un chip di un membro cambia quando qualcuno è fuori dalla scena: l'immagine è attenuata e porta un piccolo segno di porta. Un segno di lucchetto significa che il blocco (sotto) li ha esclusi. Tocca un chip: il suo popover dice "Here" o "Not in the scene".

Un membro assente non prende turni da solo e la sua scheda non viene inviata al modello: solo una riga dice che non è nella scena. Nominarlo nel tuo messaggio lo richiama comunque. Quando il direttore lo vede tornare, la sua intera scheda ritorna.

## Il blocco e il ritorno

Per mantenere una scena con una persona, tocca un chip di un membro e scegli **Only <name> in the scene**. Un chip "Only Yuzu" appare prima del chip della scena, e gli altri restano fuori qualunque cosa dica il direttore. Tocca la x su quel chip, o **Release the lock** nel popover di un membro, per rilasciare. Alla prossima risposta, agli altri viene detto che possono tornare e alla storia viene chiesto di dare loro un modo per entrare.

## Se il direttore fallisce

Se la risposta del direttore non può essere letta, o la chiamata fallisce, il chip della scena dice **No report**; aprilo per vedere perché. La chat usa quindi l'idea del Dashboard su chi è qui, o lascia rispondere tutti come prima. Niente nella tua storia viene perso.

## Nuovi gruppi

**New group** apre una finestra ampia (a schermo intero su telefono). Dai un nome al gruppo, o lascia il nome vuoto per usare i primi tre membri. Cerca, restringi con **All**, **Favourites** e **Recent**, chip di tag e un ordinamento (Name, Recently used, Most chats), e tocca i ritratti per scegliere. I membri scelti siedono in una riga in alto in ordine di parola; le frecce spostano uno prima o dopo, la x rimuove. **Next** richiede due personaggi.

Dopo **Next** il gruppo viene creato e il suo editor si apre con una nota: controlla come funziona, poi avvia la prima chat. **Start chat** è il pulsante principale. La scheda **Direction** imposta se le nuove chat di questo gruppo iniziano con la Direzione attivata, e mostra il modello del direttore. Un gruppo nella pagina Groups apre lo stesso editor, e così fa il nome del gruppo in cima alla sua chat.

Quando avvii una chat successiva di un gruppo, il breve passaggio prima della chat ha un interruttore **Direction**: attivo quando l'impostazione predefinita del gruppo è attiva e un modello è stato scelto.

Vedi anche [[characters]] e [[dashboard]].