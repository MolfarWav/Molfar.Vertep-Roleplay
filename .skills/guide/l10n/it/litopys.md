<!-- source: c68da6730f1a -->
# Litopys: il registro della storia

Litopys (la cronaca) è la memoria lunga di una chat. Legge la storia in background e scrive un capitolo per ogni scena conclusa, più i fatti che la storia ha stabilito. Quando una chat diventa troppo lunga per la finestra del modello, il registro porta avanti la storia. Usalo per le storie lunghe; non devi avviarlo.

## Capitoli e fatti

- Un **capitolo** dice cosa è cambiato in una scena, non è una riscrittura. Viene scritto quando inizia la scena successiva, quindi l'ultima scena potrebbe non averne ancora uno. Un nuovo luogo o un salto nel tempo chiude una scena; puoi anche segnare tu una serie di messaggi come scena, dal menu "More" di un messaggio, sotto Story.
- Un **fatto** è una breve frase che resta vera: "Medli nasconde le ali al mercato." I fatti hanno un tipo, un peso (Quotidiano, Importante, Chiave) e chi li conosce. Puoi aggiungere, modificare, fissare o ritirare i fatti a mano.
- Le **proposte** sono i suggerimenti di Litopys: unire due fatti, ritirarne uno, riformulare, fissare. Accetti o rifiuti ciascuna.
- Anche le **abitudini** che un personaggio mostra chiaramente possono comparire, e diventare un'abitudine dopo essersi ripetute in più scene.

## Dove guardare

Premi **Record** nell'intestazione della chat (su un telefono, nel Menu) per vedere il registro di questa chat in un pannello laterale. La sezione **Library** della barra laterale mostra il registro di ogni chat. Ha due viste: Panoramica (una linea del tempo, una scheda per personaggio, le proposte in attesa) e Dettagli, con le schede Capitoli, Fatti, Proposte, Abitudini e Attività. La scheda Attività registra ciò che Litopys ha fatto, con Annulla dove possibile. L'ingranaggio ("Litopys settings") imposta come viene scritto il registro.

## Cosa entra nel prompt

Per impostazione predefinita il registro viene inserito automaticamente. "Memory size" indica quanti token può occupare: Auto per impostazione predefinita (15% della finestra del modello, almeno 800 e al massimo 16000), Compatta (800 token) oppure Personalizzata da 200 fino a 16000. Auto lascia che una finestra grande porti più storia; su un modello piccolo resta vicino a 800. Una dimensione che hai salvato tu in precedenza resta com'è. Quando tutto ci sta, viene inviato per intero; altrimenti vengono inviate le parti più importanti per la scena. Un modello piccolo vuole una dimensione piccola. Con "Chapters and facts" disattivato non ci sono nuovi capitoli o fatti e nulla viene aggiunto al prompt.

I messaggi più vecchi possono uscire dal prompt solo quando la finestra è piena, oppure scena per scena una volta che un capitolo li copre; l'impostazione "Older messages leave the prompt" decide quale.

## Corrispondenza per significato

La memoria trova fatti e capitoli per parole. Con un modello di embeddings li trova anche per significato: una domanda con parole diverse raggiunge comunque il fatto. La scheda **Matching by meaning** (in cima al registro di una chat, e in Canvas > Prompt > Memory) mostra a che punto si è: disattivata, in errore, nessun vettore ancora, parzialmente fatta, completata, oppure fatta con un altro modello. Configura il modello una sola volta in Settings > Memory: di default l'app usa prima un modello sul tuo computer (LM Studio o Ollama), poi una connessione API con una chiave, poi OpenRouter. Appena una chiamata al modello di embeddings ha funzionato (premendo il pulsante della scheda, o con una risposta), il motore riempie da solo i vettori mancanti di ogni chat e di ogni file della Data Bank, controllando ogni pochi minuti; tutto ciò che supera i 300.000 token attende il pulsante, e l'interruttore **Make vectors by itself** in Settings > Memory lo disattiva. Il pulsante **Embed N items** dice prima quanti elementi sono e circa quanti token servono, e lo esegue subito. Le nuove scene incorporano comunque i loro nuovi elementi. Se cambi il modello di embeddings, i vecchi vettori non vengono usati finché non premi **Embed again**. La Data Bank ha una scheda propria, **Data Bank by meaning**, in cima a Settings > Data Bank: funziona allo stesso modo per i passaggi dei tuoi file e dei libri ricavati da storie, e un file coperto solo in parte dice "7 of 12 by meaning".

## Suggerimenti e pulizia

"Suggestions" è "Ask me first" per impostazione predefinita: ogni fissaggio e ogni riscrittura attende il tuo sì. L'opzione silenziosa applica subito fissaggi e riscritture e li registra nell'Attività. Ritiri e unioni aspettano sempre te. "Tidy facts automatically" cerca duplicati e contraddizioni dopo 30 nuovi fatti, con una chiamata al modello in più ogni 60 fatti.

## Ricostruisci

"Rebuild from scratch" riscrive capitoli e fatti dai messaggi in background, circa una chiamata al modello ogni 30 secondi. I tuoi fatti, quelli modificati e fissati e i capitoli modificati restano, e il registro attuale viene usato finché quello nuovo non è pronto. Il comando non parte se nessuna scena si è ancora conclusa.

Se modifichi i messaggi dopo che un capitolo è stato scritto, quel capitolo viene segnato come superato e riscritto.

## Correlati

Anche la scheda di un personaggio può conservare la memoria delle chat concluse: vedi [[memory]]. Gli articoli della Help *Litopys: chapters and proposals*, *Facts and proposals* e *Overview vs Details* descrivono le schermate.
