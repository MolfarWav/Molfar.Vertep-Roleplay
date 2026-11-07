<!-- source: 36f23a51ff05 -->
# La Dashboard della scena

La Dashboard è un pannello accanto alla chat che segue la scena: chi è presente, cosa prova ogni personaggio verso di te, cosa indossa e cosa sa, le trame aperte della storia. È per chi vuole che la storia ricordi relazioni e dettagli tra una risposta e l'altra. L'articolo della Guida *Scene dashboard* elenca i suoi campi.

## Cosa segue

Aprila cliccando un ritratto nella chat e scegliendo Dashboard. Il pannello laterale ha quattro schede: **Person** (atteggiamento, umore e stato, abbigliamento e oggetti), **Here** (luogo, tempo, chi è presente), **Quests** (le trame aperte: principale, secondaria, quotidiana) e **Notes** (il taccuino: cosa sa un personaggio e se l'ha visto, sentito o intuito). La "Constellation" indica come un personaggio si pone verso di te, per esempio Amicizia o Romanzo. Un numero su una scheda conta i cambiamenti dalla tua ultima risposta (rosso quando qualcosa è caduto). La vista ampia ha anche un Diario con il pensiero e i ricordi di un personaggio. Su un telefono lo stesso contenuto si apre come foglio.

**Una persona elencata due volte.** Se la Dashboard mostra la stessa persona con due nomi (per esempio "Sina" e "Sina Rose"), aprine una e usa il piccolo pulsante persone nell'intestazione di **Person**, poi "Same person as..." e scegli l'altra. Prima ti viene chiesto: le note, la storia e gli oggetti passano alla persona scelta, i suoi numeri di relazione restano, il nome diventa un altro suo nome, e non si può annullare. La Dashboard suggerisce da sé anche i probabili duplicati: un riquadro in cima alla scheda **Person** (e un chip "Possible duplicate" in "Since your last reply") dice "X may be the same person as Y" con il motivo. "Merge into Y" fa lo stesso del menu; "Different people" li tiene separati e la Dashboard smette di suggerire quella coppia. Lo stesso menu ha "Remove from the Dashboard" per un nome semplicemente sbagliato.

I numeri (fiducia, comfort, attrazione, rispetto, affetto e altro) sono calcolati dal codice a partire dagli eventi segnalati da un modello e inclinati dall'[[soul]] di ogni personaggio. Lo stato è conservato per messaggio, così uno swipe o un messaggio eliminato non lascia mai numeri vecchi.

Il pulsante "Story, move" accanto a Send arma una spinta una tantum per la risposta successiva; la sua freccia sceglie una missione aperta o un colpo di scena.

## Cosa è cambiato, in chat

Sotto la risposta più recente, una riga discreta dice cosa la Dashboard ha registrato per quella risposta: "Changed: Ada · trust fell, mood calm → tense, +2". Toccala per aprire le stesse chip della riga "Since your last reply" della Dashboard; una chip apre la scheda corrispondente della Dashboard (su un telefono, il suo foglio in basso). Le risposte più vecchie non mostrano nulla, e la riga aspetta mentre una risposta viene scritta o la Dashboard si sta ancora aggiornando. Per nasconderla, disattiva "Show what changed under the newest reply" in Settings > Chat Behavior.

## Legami tra personaggi

Il sensore annota come due personaggi che non sono tu si pongono l'uno verso l'altro, con un ruolo di una parola e un calore di una parola ("rival, cold"). Il prompt della risposta porta fino a quattro di questi come una sola riga breve, solo per le persone nella scena. La risposta di un personaggio riceve solo i legami di cui fa parte; un narratore riceve prima i legami delle persone di cui parla il turno.

## Cosa ha detto un personaggio, e le bugie

Sotto il taccuino di una persona, la lista **Said** conserva le cose forti che ha detto e a cui si attiene: un voto, una minaccia, una confessione, un ordine. Anche una bugia finisce lì, coperta finché non scegli "Show hidden".

Quando un personaggio mente davanti ad altri, gli altri la prendono per vera. Le loro risposte successive la trattano come qualcosa che è stato loro detto e non hanno motivo di dubitare, finché la storia non mostra il contrario. Ingannate sono solo le persone presenti alla scena, e solo nelle proprie risposte: se qualcun altro parla, non ripete la bugia.

Apri una bugia e vedi **Believe it:** con un pulsante per ogni persona che ci crede ancora. Premi un nome quando quella persona lo ha scoperto. Il menu della riga ha anche "This was a lie" per un'affermazione che il sensore non ha chiamato bugia (le persone della scena allora ci credono), e "Not a lie" quando il sensore ha sbagliato. Il sensore chiude da solo la credenza quando una risposta mostra la verità che viene a galla. Rimuovere la bugia dalla lista rimuove con essa ogni credenza.

> Il narratore dà voce a tutti in una sola risposta, quindi conosce sempre la verità. Questo serve solo a impedire che un personaggio agisca su ciò che sa un altro personaggio.

## Quando si aggiorna

Il pulsante "Settings" dentro la Dashboard apre le sue impostazioni; la scheda Sensor ha la modalità:

- **Sensor** (predefinita): dopo ogni risposta un modello legge i nuovi messaggi e riferisce cosa è successo.
- **Fast: inside the story reply**: per modelli forti. Il modello della storia scrive da sé il rapporto alla fine della sua risposta, senza chiamate separate, aggiungendo qualche token a ogni risposta. Se omette il rapporto, viene eseguito il solito sensore.
- **Manual**: si aggiorna solo quando premi "Refresh".

## Quanto costa

In modalità **Sensor**, una chiamata al modello in più per risposta, sul "Sensor model" (il modello della chat se lo lasci vuoto). Basta un modello economico e piccolo. Legge i nuovi messaggi per intero (fino a circa 12000 caratteri in totale; una risposta più lunga perde solo la parte centrale), e il codice prima segna le frasi che sembrano abbigliamento, vestizione o un bacio e le indica al modello, così una gonna nominata una volta nel mezzo di una risposta lunga arriva comunque all'outfit. Se la scheda di un personaggio ha una riga "Attire:", anche quella viene mostrata al sensore come riferimento per la formulazione esatta di un capo citato nel testo (non aggiunge mai un capo che il testo non mostra). Ciò che un personaggio indossa e tiene in mano è conservato come lista di oggetti; un capo che si strappa o si sporca resta un unico oggetto. Ogni oggetto mantiene una sola identità ovunque vada: indossato, tolto accanto alla porta, passato a qualcun altro. Gli oggetti lasciati in un luogo restano lì: quando la storia torna al caffè, la tazza è ancora sul tavolo. Quando la storia non ha mostrato cosa indossa qualcuno per circa sei turni, al modello di scrittura viene chiesto di accennarlo, brevemente. Per aggiungere parole per una lingua che la scansione non conosce, elencale in `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` disattiva la scansione. La Dashboard aggiunge anche un breve "Prompt insert" a ciò che il modello della storia legge, così i personaggi sanno a che punto sono: puoi disattivarlo e impostare "Tokens per character". "What the model sees" nelle impostazioni mostra l'insert.

## Come disattivarla

Non c'è un interruttore separato nelle schermate elencate qui. Imposta la modalità su "Manual" e non chiamerà mai un modello da sola. Per rimuoverla del tutto, disattiva il plugin Dashboard nel pulsante Plugins di Molfar Vertep; Tools > Plugins in Roleplay elenca solo ciò che gira. Disattiva "Prompt insert" se vuoi che resti fuori dalla richiesta.

## Correlati

[[soul]] la alimenta; [[litopys]] usa le sue note; [[memory]] la confronta con gli altri tipi di memoria.
