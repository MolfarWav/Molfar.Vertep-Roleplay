<!-- source: 49838714a096 -->
# Chat lunghe e costo dei token

Una chat che va avanti per settimane cresce, e ogni risposta invia al modello una parte sempre maggiore di essa. Questa pagina è per chi si ritrova con risposte lente o costose, oppure con un modello che dimentica l'inizio della storia.

## Il pulsante Request size

Per impostazione predefinita l'intera chat viene inviata finché la finestra ha spazio. Su una finestra grande il costo continua a crescere, quindi l'intestazione della chat ha un pulsante **Request size** accanto agli strumenti della storia (su un telefono: nel Menu). Mostra quanti token ha inviato l'ultima richiesta, l'intero prompt come lo ha contato il provider, e quale modello l'ha ricevuto. Premilo per vedere il modello, la sua finestra e il tuo limite. È verde acqua sotto i tre quarti del limite, ambra da lì in su, e rosso con un segnale di avviso oltre il limite. La bacheca Prompt del Canvas elenca ogni parte di una richiesta ([[canvas]]).

Quando una risposta spinge la richiesta oltre il limite, si apre un popup:

- **Yes, continue in a new chat** crea subito la chat successiva e la apre.
- **Not now** nasconde il popup per questa chat finché la richiesta non è cresciuta della metà. Chiuderlo conta come Not now.
- **Send finished scenes as chapters instead** compare quando Litopys è attivo (sezione successiva).

Il limite è in fondo al popup, e nella Library, ingranaggio "Litopys settings", blocco "In the prompt", "Warn me when a request gets big": il 60% della finestra del modello (predefinito), una dimensione che digiti (100k) o scegli (da 16k a 500k), oppure mai. Una chat già oltre il limite mostra il pulsante rosso e nessun popup, finché una nuova risposta non la fa crescere.

Il registro ha una dimensione propria. Nello stesso blocco, "Memory size" è Auto per impostazione predefinita: il 15% della finestra del modello, tra 800 e 16000 token. "Compact" la tiene a 800.

## Gli interruttori che tagliano il costo

Nello stesso blocco, "Older messages leave the prompt" ha due scelte:

- **Only when the window is full** (predefinita): ogni messaggio viene inviato finché ci sta.
- **By scenes**: appena un capitolo copre una scena, la scena viene sostituita dal capitolo. Restano parola per parola solo gli ultimi messaggi ("Direct messages after the scenes", 2 o più). La scena più recente non ha ancora un capitolo, quindi viene inviata per intero.

"By scenes" costa qualche dettaglio: un capitolo è una riscrittura, quindi un modello debole può perdere una piccola cosa. Fissa un fatto che non deve andare perso ([[litopys]]). Altri tagli:

- Bacheca Prompt del Canvas, scheda history, Details: invia solo gli ultimi N messaggi (su computer, solo quella chat).
- Abbassa "Memory size" a Compact, oppure disattiva "Chapters and facts".

## Avviare una chat nuova e tenere la storia

In un punto naturale di pausa, una chat nuova che continua quella vecchia parte con un prompt piccolo e sa comunque cosa è successo.

1. Nella chat, apri "More" e scegli **Continue in a new chat**, oppure premi Yes nel popup.
2. La chat nuova viene creata subito e si apre. Mantiene il preset e le sue scelte, la persona, il modello, l'insieme di agenti, l'ordine dei turni di un gruppo e il mondo del World DM.
3. Riceve la vecchia storia come retroscena, entro il "Backstory budget". Le tre chat precedenti più vicine vengono lette per intero: capitoli, fatti e punti di svolta. Le chat più vecchie di una catena lunga non vengono scartate: entrano in un'unica parte condensata (vedi sotto). I vecchi messaggi non vengono inviati.

La chat precedente passa poi da sola all'Archivio (sezione successiva). Il collegamento è quello che disegna il Canvas, e il Canvas può cambiarlo in seguito: vedi [[canvas]]. Per scegliere un'altra chat precedente, avvia una chat dal personaggio e usa il menu **Continues** nel passo "New chat with".

La chat nuova si apre con il primo saluto della scheda; "Edit the first message" ti permette di proseguire da dove la storia si era fermata.

## Una storia di molte chat

Una storia può andare avanti per molte chat. Le tre chat precedenti più vicine danno i loro capitoli, archi e fatti come prima. Ogni chat più vecchia finisce in un'unica parte **far**, collocata per prima: i suoi punti di svolta, i fatti fissati e quelli chiave, e una riga per ogni arco. La parte viene costruita da ciò che Litopys ha già scritto, senza chiamate extra al modello, e per impostazione predefinita occupa il 18% del Backstory budget (Library, Litopys settings, "In the prompt", **Share for the far chats**, da 5 a 40). **Turning points shown** nello stesso blocco stabilisce quanti ne entrano in una risposta lungo tutta la storia (12 per impostazione predefinita). Se il budget è corto, le chat più vecchie perdono per prime le loro righe, e i punti di svolta per ultimi. In **What this chat carries** ha una riga a sé, "Far backstory, chats 1-2", così vedi che le prime chat sono state conservate, non perse. Una catena corta non ha una parte far. Alza il Backstory budget se una storia lunga sembra povera.

Una parte condensata lascia fuori i dettagli minuti (il colore di un mantello); i ricordi parola per parola qui sotto li riportano.

## Archiviare una storia finita

Una storia che hai concluso può andare nell'**Archive**. È uno stato della chat, non uno spostamento: la chat resta dov'è, quindi la sua memoria, i suoi collegamenti sul Canvas e ogni libro ricavato da essa continuano a funzionare.

- In Chats, scegli una chat e premi **Archive** (il pulsante ambra nel suo pannello), oppure spuntane più d'una con Select. Dentro una chat la voce è nel menu sotto "Manage chat".
- Una chat archiviata esce dalla lista e dalla Home. La riga ambra **Archive** sotto i filtri le apre; **Back to chats** torna indietro.
- Si apre in sola lettura: puoi leggere, copiare, diramare da un messaggio, esportare e guardare la sua Dashboard e la Library, ma non inviare, fare swipe, modificare o eliminare. Il suo posto in fondo offre **Continue in a new chat**. **Unarchive** (nel suo pannello o nel banner) la riporta normale.
- La conferma offre **Archive and continue** quando nessuna chat continua ancora questa.
- **Succede da solo** quando una chat diventa la chat precedente di un'altra: un collegamento sul Canvas, Continue in a new chat, il popup qui sopra, o una scelta in "Continues". Un avviso con Undo lo dice. I rami non sono continuazioni e restano come sono. Puoi disattivarlo nella Library, ingranaggio "Litopys settings", "Archive the earlier chat when it is continued".
- Una chat di 100 messaggi o più, ferma da una settimana, riceve una piccola etichetta "Long chat · archive?" nell'elenco e un suggerimento nel suo pannello. Non viene archiviato nulla al posto tuo.

Perché conviene: la chat precedente non cambia più, quindi la sua memoria resta stabile e una chat nuova che la continua la legge come una storia finita ([[litopys]]).

## Dettagli che i capitoli hanno lasciato fuori

Un capitolo è una riscrittura, quindi un piccolo dettaglio di una chat precedente può esserne sparito. Nella Library, Litopys settings, "In the prompt", l'interruttore **Word-for-word memories of earlier chats** (attivo per impostazione predefinita) permette a una chat che ne continua altre di riportare uno o due passaggi dei messaggi originali, quando ciò che si dice condivide parole rare con essi ([[litopys]]). La chat precedente viene indicizzata quando passa all'Archivio. Lavora sulle parole, quindi un dettaglio raccontato con altre parole non viene trovato; l'interruttore sperimentale **Also find old chapters by meaning** (disattivato) riduce un po' questo divario quando usi gli embeddings: trova il capitolo per significato, ma un passaggio ha comunque bisogno di una parola rara tutta sua.

## Salvare una storia come libro

Nella Library, Litopys, "Save as a book" copia capitoli, archi e fatti di una chat sullo scaffale della Data Bank, per le chat che scegli: vedi [[memory]].

## Controllare cosa ha ricevuto il modello

Se un personaggio dimentica qualcosa, apri Canvas > Prompt e passa da "Parts" a "Memory": mostra quali fatti sono entrati e quali sono stati lasciati fuori, e perché. Il pulsante **Fired** nell'intestazione della chat lo mostra per l'ultima risposta e per l'intera chat.
