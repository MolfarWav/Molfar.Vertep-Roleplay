<!-- source: 6095bc511c69 -->
# La Dashboard della scena

La Dashboard è un pannello accanto alla chat che segue la scena: chi è presente, cosa prova ogni personaggio verso di te, cosa indossa e cosa sa, le trame aperte della storia. È per chi vuole che la storia ricordi relazioni e dettagli tra una risposta e l'altra. L'articolo della Guida *Scene dashboard* elenca i suoi campi.

## Cosa segue

Aprila cliccando un ritratto nella chat e scegliendo Dashboard. Il pannello laterale ha quattro schede: **Persona** (atteggiamento, umore e stato, abbigliamento e oggetti), **Qui** (luogo, tempo, chi è presente), **Missioni** (le trame aperte: principale, secondaria, quotidiana) e **Note** (il taccuino: cosa sa un personaggio e se l'ha visto, sentito o intuito). La "Costellazione" indica come un personaggio si pone verso di te, per esempio Amicizia o Romanzo. Un numero su una scheda conta i cambiamenti dalla tua ultima risposta (rosso quando qualcosa è peggiorato). La vista ampia ha anche un Diario con il pensiero e i ricordi di un personaggio. Su un telefono lo stesso contenuto si apre come foglio.

I numeri (fiducia, comfort, attrazione, rispetto, affetto e altro) sono calcolati dal codice a partire dagli eventi segnalati da un modello e inclinati dall'[[soul]] di ogni personaggio. Lo stato è conservato per messaggio, così uno swipe o un messaggio eliminato non lascia mai numeri vecchi.

Il pulsante "Storia, mossa" accanto a Invia arma una spinta una tantum per la risposta successiva; la sua freccia sceglie una missione aperta o un colpo di scena.

## Quando si aggiorna

Il pulsante "Impostazioni" dentro la Dashboard apre le sue impostazioni; la scheda Sensore ha la modalità:

- **Sensore** (predefinita): dopo ogni risposta un modello legge i nuovi messaggi e riferisce cosa è successo.
- **Veloce: dentro la risposta della storia**: per modelli forti. Il modello della storia scrive da sé il rapporto alla fine della sua risposta, senza chiamate separate, aggiungendo qualche token a ogni risposta. Se omette il rapporto, viene eseguito il solito sensore.
- **Manuale**: si aggiorna solo quando premi "Aggiorna".

## Quanto costa

In modalità Sensore, una chiamata al modello in più per risposta, sul "Modello sensore" (il modello della chat se lo lasci vuoto). Basta un modello economico e piccolo. La Dashboard aggiunge anche un breve "Insert del prompt" a ciò che il modello della storia legge, così i personaggi sanno a che punto sono: puoi disattivarlo e impostare "Token per personaggio". "Cosa vede il modello" nelle impostazioni mostra l'insert.

## Come disattivarla

Non c'è un interruttore separato nelle schermate elencate qui. Imposta la modalità su "Manuale" e non chiamerà mai un modello da sola. Per rimuoverla del tutto, disattiva il plugin Dashboard nel pulsante Plugin di Molfar Vertep; Strumenti > Plugin in Roleplay elenca solo ciò che è in esecuzione. Disattiva "Insert del prompt" se vuoi che resti fuori dalla richiesta.

## Correlati

[[soul]] la alimenta; [[litopys]] usa le sue note; [[memory]] la confronta con gli altri tipi di memoria.
