<!-- source: 045cbad8d708 -->
# Canvas: collegamenti tra chat, prompt e agenti

Canvas è il banco di lavoro tecnico di Roleplay: una sola schermata con delle bacheche, dove vedi e modifichi come sono collegate le chat e cosa ogni chat invia al modello. Per giocare non ne hai bisogno. Aprilo quando una storia ha bisogno di un seguito, quando una risposta ti ha sorpreso, o quando costruisci agenti.

Scegli una bacheca con il selettore **Board** in alto: **Chat links**, **Prompt**, **Agents** e **Agent sets**. La voce Agents della barra laterale apre lo stesso Canvas sulla sua bacheca Agents. Viene ricordata la bacheca che hai usato per ultima.

## Chat links

Una mappa delle tue chat. Ogni chat è una scheda. Una linea da una chat a un'altra significa "questa chat continua quella": la storia della chat precedente viaggia come retroscena nelle risposte della chat successiva, entro il budget del retroscena impostato nella Library. Le tre chat precedenti più vicine vengono lette per intero e quelle più vecchie vengono condensate ([[long-chats]]). Una linea continua è una continuazione. Una linea tratteggiata è un ramo biforcato da un messaggio.

- Le chat che non hai ancora messo sulla bacheca aspettano nell'elenco a sinistra (**Chats**). Trascinane una sulla bacheca, oppure usa **Put on the board** (con **its linked chats** per portare l'intera catena). Trascina una scheda indietro nell'elenco, oppure usa **Remove**, per toglierla dalla bacheca. La chat resta nella Library.
- Attiva **Edit** per collegare o scollegare le schede. Un collegamento che creerebbe un ciclo, unirebbe una chat a se stessa o ripeterebbe un collegamento esistente viene rifiutato, e la bacheca dice perché. Ci sono **Undo** e **Redo**. **Fit** inquadra l'intero grafo.
- Su un telefono la bacheca si apre in **View** con un elenco **List** dei collegamenti. Costruire un grafo è più comodo su uno schermo grande, ma puoi comunque modificare i collegamenti nell'elenco.

La mappa di una chat nella Library mostra la stessa catena ma è solo in visualizzazione. Il suo pulsante **Edit on canvas** ti porta qui.

## Prompt

Scegli una chat per vedere la richiesta che invia al modello. La bacheca ha due viste: **Parts** e **Memory**.

- **Parts** elenca ogni parte della richiesta: il prompt principale, la scheda del personaggio, la persona, le voci del lorebook, il dialogo di esempio, le sezioni del preset e la cronologia, ciascuna con il suo conteggio di token e il suo stato. Una parte può essere disattivata nel preset, disattivata per questa chat, vuota, oppure non prevista per questo tipo di risposta. Puoi disattivare una parte per la sola chat, senza toccare il preset. **Only what is sent** nasconde il resto, e il totale mostra ciò che riceve il modello.
- **Memory** spiega perché la memoria ha inserito ciò che ha inserito nell'ultima risposta: [[memory]] contiene la descrizione completa.

Per un'occhiata più rapida a ciò che si è attivato solo nell'ultima risposta, usa il pulsante **Fired** nell'intestazione della chat. La vista Memory e **Fired** leggono lo stesso registro; Fired conta anche su tutta la chat.

## Agenti e set di agenti

La forgia degli agenti: costruisci un agente, provalo e raggruppa gli agenti in set. Vedi [[agents]].

## Cosa resta com'è

Disattivare una parte nella bacheca Prompt vale solo per quella chat. Il preset e le schede non vengono modificati.
