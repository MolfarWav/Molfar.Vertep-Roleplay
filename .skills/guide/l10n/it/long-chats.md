<!-- source: 67addd68fb05 -->
# Chat lunghe e costo in token

Una chat che va avanti per settimane cresce, e ogni risposta ne manda sempre di più al modello. Questa pagina è per chi ha risposte che diventano lente o costose, o per chi ha un modello che dimentica l'inizio della storia.

## Il pulsante "Request size"

Per impostazione predefinita viene inviata tutta la chat finché la finestra ha spazio. Su una finestra grande il costo continua a crescere, quindi l'intestazione della chat ha un pulsante **Request size** accanto agli strumenti della storia (sul telefono: nel Menu). Mostra quanti token ha inviato l'ultima richiesta, l'intero prompt come lo ha contato il provider, e quale modello lo ha ricevuto. Premilo per vedere il modello, la sua finestra e il tuo limite. È color ottanio sotto i tre quarti del limite, ambra da lì in poi, e rosso con un segno di avvertimento oltre. La board Canvas Prompt elenca ogni parte di una richiesta ([[canvas]]).

Quando una risposta porta la richiesta oltre il limite, si apre un popup:

- **Yes, continue in a new chat** crea subito la chat successiva e la apre.
- **Not now** nasconde il popup per questa chat finché la richiesta non è cresciuta della metà. Chiuderlo equivale a Not now.
- **Send finished scenes as chapters instead** compare quando Litopys è attivo (sezione successiva).

Il limite è in fondo al popup, e nella Library, ingranaggio "Litopys settings", blocco "In the prompt", "Warn me when a request gets big": 60% della finestra del modello (predefinito), una dimensione che digiti (100k) o scegli (da 16k a 500k), oppure mai. Una chat già oltre il limite mostra il pulsante rosso e nessun popup finché una nuova risposta non la fa crescere.

Anche il record ha la sua dimensione. Nello stesso blocco, "Memory size" è Auto per impostazione predefinita: 15% della finestra del modello, tra 800 e 16000 token. "Compact" lo mantiene a 800.

## Gli interruttori che riducono il costo

Nello stesso blocco, "Older messages leave the prompt" ha due scelte:

- **Only when the window is full** (predefinito): ogni messaggio viene inviato finché ci sta.
- **By scenes**: appena un capitolo contiene una scena, la scena viene sostituita dal capitolo. Solo gli ultimi messaggi restano parola per parola ("Direct messages after the scenes", 2 o più). La scena più recente non ha ancora un capitolo, quindi viene inviata per intero.

"By scenes" costa un po' di dettaglio: un capitolo è un racconto, quindi un modello debole può perdere una piccola cosa. Fissa un fatto che non deve mai andare perso ([[litopys]]). Altri tagli:

- Library, Litopys settings, **Direct messages, by size**: mantieni i messaggi più recenti che stanno in un numero di token (almeno 2 messaggi) invece di un numero fisso. 0 conta i messaggi ([[litopys]]).
- Library, Litopys settings, **Leave out what a speaker was not present for** ("Groups only" per impostazione predefinita): una risposta pronunciata da un personaggio non riceve i messaggi recenti delle scene in cui quel personaggio non c'era ([[litopys]]).
- Canvas Prompt board, scheda history, Details: invia solo gli ultimi N messaggi (desktop, solo quella chat).
- Abbassa "Memory size" a Compact, oppure disattiva "Chapters and facts".

## Inizia una chat nuova e conserva la storia

A una pausa naturale, una nuova chat che continua quella vecchia parte con un piccolo prompt e sa comunque cosa è successo.

1. Nella chat, apri "More" e scegli **Continue in a new chat**, oppure premi Yes nel popup.
2. La nuova chat viene creata subito e si apre. Mantiene il preset e le sue scelte, la persona, il modello, l'insieme di agent, l'ordine di turno di un gruppo e il mondo del World DM.
3. Riceve la vecchia storia come backstory, entro il "Backstory budget". Le tre chat precedenti più vicine vengono lette per intero: capitoli, fatti e punti di svolta. Le chat più vecchie di una lunga catena non vengono scartate: viaggiano in un'unica parte condensata (vedi sotto). I vecchi messaggi non vengono inviati.

La chat precedente poi passa da sola nell'Archive (sezione successiva). Il collegamento è quello che disegna il Canvas, e il Canvas può cambiarlo in seguito: vedi [[canvas]]. Per scegliere un'altra chat precedente, avvia una chat dal personaggio e usa il menu **Continues** nel passaggio "New chat with".

La nuova chat si apre con il primo saluto della scheda; "Edit the first message" ti permette di riprendere da dove si era fermata la storia.

## Una storia fatta di molte chat

Una storia può proseguire per molte chat. Le tre chat precedenti più vicine danno i loro capitoli, archi e fatti come prima. Ogni chat più vecchia confluisce in un'unica parte **far**, messa per prima: i suoi punti di svolta, i fatti fissati e chiave, e una riga per ogni arco. La parte è costruita da ciò che Litopys ha già scritto, senza una chiamata extra al modello, e occupa il 18% del Backstory budget per impostazione predefinita (Library, Litopys settings, "In the prompt", **Share for the far chats**, da 5 a 40). **Turning points shown** nello stesso blocco imposta quanti viaggiano in una risposta lungo tutta la storia (12 per impostazione predefinita). Se il budget è scarso, le chat più vecchie perdono prima le loro righe e per ultimi i punti di svolta. In **What this chat carries** è una riga a sé, "Far backstory, chats 1-2", così puoi vedere che le prime chat sono state conservate, non perse. Una catena breve non ha una parte far. Alza il Backstory budget se una storia lunga ti sembra scarna.

Una parte condensata perde piccoli dettagli (il colore di un mantello); i ricordi parola per parola qui sotto li riportano indietro.

## Archivia una storia conclusa

Una storia che hai finito può andare nell'**Archive**. È uno stato della chat, non uno spostamento: la chat resta dove è, quindi la sua memoria, i suoi collegamenti sul Canvas e qualsiasi libro fatto da essa continuano a funzionare.

- In Chats, scegli una chat e premi **Archive** (il pulsante ambra nel suo pannello), oppure selezionane diverse con Select. In una chat è nel menu sotto "Manage chat".
- Una chat archiviata esce dalla lista e da Home. La riga ambra **Archive** sotto i filtri le apre; **Back to chats** torna indietro.
- Si apre in sola lettura: puoi leggere, copiare, creare un ramo da un messaggio, esportare e guardare la sua Dashboard e Library, ma non inviare, swipare, modificare o eliminare. Il suo posto in fondo offre **Continue in a new chat**. **Unarchive** (nel suo pannello o nel banner) la rende di nuovo normale.
- La conferma offre **Archive and continue** quando nessuna chat continua ancora questa.
- **Succede da solo** quando una chat diventa la chat precedente di un'altra: un collegamento sul Canvas, Continue in a new chat, il popup qui sopra, o una scelta in "Continues". Un toast con Undo lo segnala. I rami non sono continuazioni e restano come sono. Disattivalo nella Library, ingranaggio "Litopys settings", "Archive the earlier chat when it is continued".
- Una chat di 100 messaggi o più rimasta ferma per una settimana riceve una piccola etichetta "Long chat · archive?" nella lista e un suggerimento nel suo pannello. Niente viene archiviato al posto tuo.

Perché farlo: la chat precedente non cambia più, quindi la sua memoria resta stabile e una nuova chat che la continua la legge come una storia conclusa ([[litopys]]).

## Dettagli che i capitoli hanno perso

Un capitolo è un racconto, quindi un piccolo dettaglio di una chat precedente può esserne sparito. Nella Library, Litopys settings, "In the prompt", l'interruttore **Word-for-word memories of earlier chats** (attivo per impostazione predefinita) permette a una chat che ne continua altre di riportare indietro uno o due passaggi dei messaggi originali quando ciò che viene detto condivide parole rare con essi ([[litopys]]). La chat precedente viene indicizzata quando va nell'Archive. Confronta parole, quindi un dettaglio raccontato con altre parole non viene trovato; l'interruttore sperimentale **Also find old chapters by meaning** (disattivo) restringe un po' quel divario quando usi gli embedding: trova il capitolo per significato, ma un passaggio ha comunque bisogno di una sua parola rara.

## Salva una storia come libro

Nella Library, Litopys, "Save as a book" copia i capitoli, gli archi e i fatti di una chat sullo scaffale del Data Bank per le chat che scegli: vedi [[memory]].

## Controlla cosa ha ricevuto il modello

Se un personaggio dimentica qualcosa, apri Canvas > Prompt e passa da "Parts" a "Memory": mostra quali fatti sono entrati e quali sono stati lasciati fuori, e perché. Il pulsante **Fired** nell'intestazione della chat lo mostra per l'ultima risposta e per l'intera chat.
