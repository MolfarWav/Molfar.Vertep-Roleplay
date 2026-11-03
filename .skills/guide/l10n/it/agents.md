<!-- source: a06a17fd0667 -->
# Gli agenti e la fucina degli agenti

Un agente è un piccolo aiutante che costruisci con schede e collegamenti. Dopo una risposta legge parte della chat, può porre a un modello una o più brevi domande, tiene appunti propri e mostra qualcosa: una nota sotto la risposta, pulsanti da toccare, un indicatore, una mappa o un suggerimento per la risposta successiva. Esempi: tre possibili prossime mosse, un indicatore di tensione, una mappa dei luoghi visitati. Questa pagina è per chi desidera questi extra. La Guida ha tre articoli sull'editor: "Agent editor: how an agent works", "Agent editor: the cards" e "Agent editor: three ready agents".

## Di cosa è fatto un agente

Un agente è dato, non codice. Nell'editor è una tavola di **schede** collegate da **fili**:

- una scheda **Input** indica cosa l'agente può leggere (l'ultima risposta, la cronologia della chat, la scheda del personaggio, la persona, la nota dell'autore, i fatti di Litopys, le voci del lorebook);
- le schede **Chiedi al modello** pongono una domanda a un modello e prendono la risposta come testo libero, sì o no, oppure alcuni campi con nome;
- schede logiche e schede che lavorano in codice senza modello: dadi, scelta di una riga, taglio o estrazione di testo;
- schede per la **memoria** propria dell'agente (numeri, testo, sì/no, elenchi), conservate per ogni chat e separate dalla Dashboard;
- una scheda **Output** che mostra un risultato: "Una nota sotto la risposta", "Pulsanti da toccare", un valore di stato oppure un suggerimento inserito nel prossimo prompt.

I **pannelli** (indicatori, contatori, tabelle, una tavola di tessere) mostrano ciò che l'agente conserva; in un pannello non viene eseguito nulla, e i suoi pulsanti si limitano a inserire testo nella casella del messaggio.

Quando viene eseguito si imposta per ogni agente: dopo ogni risposta (l'unico momento che questa versione esegue); ogni N risposte; oppure solo quando compaiono parole scelte.

## Agenti pronti

Premi "Nuovo agente" nella bacheca Agenti del **Canvas** (la voce **Agenti** della barra laterale la apre). "Agente vuoto" fornisce un Input e una nota. "Parti da un agente pronto" ne offre sei funzionanti: Prossime mosse, Spinta al ritmo, Mappa della storia, Riepilogo scena, Tavola del territorio e Indicatore di tensione. Sotto "Bozze" ci sono gli agenti che Molfar ha scritto nel tuo spazio di lavoro ("Bozze da Molfar").

## L'editor

Le modifiche vengono salvate come bozza un attimo dopo che ti fermi. Tre schede: Scheda (la scheda selezionata), Agente (nome, quando viene eseguito, la sua memoria, i pannelli) e Prova. Un controllo mostra "Supera il controllo", il numero di problemi e avvisi e "N chiamate al modello per esecuzione". Non puoi installare se restano problemi. "Esporta come file" salva un file che puoi condividere. Il pannello "Installa e gestisci agenti..." della chat ha "Installa un file agente" per importarne uno.

## Prova

La scheda Prova esegue un turno inventato senza toccare nulla. Cambi gli input e i fili sulla tavola mostrano cosa si muove; senza modello, ogni scheda "Chiedi al modello" usa una risposta di esempio che puoi modificare. Sotto "Una chat reale" scegli una chat e "Riempi da questa chat" per caricare ciò che l'agente riceverebbe davvero. "Esegui con il modello" pone poi al modello reale la domanda reale: fino a N chiamate, token reali e nulla viene salvato nella chat o nell'agente.

## Installa, consenti, attiva in una chat

1. Premi "Installa" ("Aggiorna" per una copia modificata di un agente installato; usa "Modifica una copia" per cambiarne uno).
2. Consenti una volta: "Esamina permessi", poi "Consenti tutto" o riga per riga. Viene eseguito quando ogni riga è attiva. Un aggiornamento che chiede di più attende un nuovo Consenti.
3. Aggiungilo a una chat. Nella pillola dell'intestazione della chat apri la scheda **Agenti**: "In questa chat" elenca gli agenti attivi, "Installati" elenca gli altri (scegline uno per aggiungerlo). Una riga può essere eseguita di nuovo adesso, essere rimossa oppure interrompere la risposta in attesa. Una nuova chat non ha agenti finché non ne aggiungi alcuni o scegli un insieme.

Un **insieme** è un elenco di agenti con nome ("Salva l'elenco di questa chat come insieme"; "Rendi predefinito" lo assegna alle nuove chat). La bacheca "Insiemi di agenti" del Canvas mostra il costo in tempo e chiamate di ogni insieme e contiene l'interruttore "Note degli agenti nelle chat" che nasconde le note di ogni agente. Il posto del risultato di ogni agente può essere cambiato nella scheda Agenti della chat, tra i posti adatti.

Ogni scheda "Chiedi al modello" è una chiamata per esecuzione; l'editor mostra il numero. "Ogni N risposte" divide il costo.
