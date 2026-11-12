<!-- source: 3036f6063dc6 -->
# Gli agenti e la fucina degli agenti

Un agente è un piccolo aiutante che costruisci con schede e collegamenti. Legge parte della chat (prima o dopo una risposta, come scegli), può porre a un modello una o più brevi domande, tiene appunti propri e mostra qualcosa: una nota sotto la risposta, pulsanti da toccare, un indicatore, una mappa o un suggerimento per la risposta successiva. Esempi: tre possibili prossime mosse, un indicatore di tensione, una mappa dei luoghi visitati. Questa pagina è per chi desidera questi extra. La Guida ha tre articoli sull'editor: "Agent editor: how an agent works", "Agent editor: the cards" e "Agent editor: three ready agents".

## Di cosa è fatto un agente

Un agente è dato, non codice. Nell'editor è una tavola di **schede** collegate da **fili**:

- una scheda **Input** indica cosa l'agente può leggere (l'ultima risposta, la cronologia della chat, la scheda del personaggio, la persona, la nota dell'autore, i fatti di Litopys, le voci del lorebook);
- le schede **Ask the model** pongono una domanda a un modello e prendono la risposta come testo libero, sì o no, oppure alcuni campi con nome;
- schede logiche (una scheda If può scattare solo quando la sua risposta passa a Yes, solo una volta, oppure con una pausa dopo lo scatto, e le sue regole possono chiedere se un valore è cambiato dall'ultima esecuzione; il log delle esecuzioni dice perché ha risposto) e schede che lavorano in codice senza modello: dadi, scelta di una riga, taglio o estrazione di testo;
- una scheda **Script**: poche righe di JavaScript che scrivi, con `(input, seed)` in entrata e un oggetto semplice in uscita, con ingressi e uscite tipizzati. Gira in una sandbox del motore (senza orologio, senza internet, senza file, circa mezzo secondo e 16 MB) e richiede un motore dalla 1.10.1; un motore più vecchio fa fallire l'agente con un messaggio semplice;
- schede per la **memoria** propria dell'agente (numeri, testo, sì/no, elenchi), conservata per ogni chat e separata dalla Dashboard;
- una scheda **Output** che mostra un risultato: "A note under the reply", "Buttons to tap", un valore di stato oppure un suggerimento inserito nel prossimo prompt.

**Pannelli** (indicatori, contatori, tabelle, una tavola di tessere) mostrano ciò che l'agente conserva; nulla in un pannello viene eseguito, e i suoi pulsanti si limitano a inserire testo nella casella del messaggio.

Quando viene eseguito è una corsia. Il file dell'agente indica la corsia in cui parte, e ogni chat può spostare l'agente in un'altra (la scheda Agenti della chat, oppure la bacheca "Agent sets" del Canvas). Le quattro corsie:

- **Before the reply**: la risposta attende l'agente, e un suggerimento che lascia finisce in quella stessa risposta. Tienilo a una o due domande rapide, perché l'attesa si aggiunge a ogni risposta. L'interruttore Wait della riga dell'agente spegne l'attesa; l'agente gira allora accanto alla risposta.
- **Beside the reply**: gira nello stesso momento, non aggiunge attesa e non può inserire un suggerimento nella risposta accanto alla quale gira (appunti, pulsanti e pannelli funzionano).
- **After the reply**: la corsia abituale per appunti, tracker e indicatori.
- **By hand**: gira solo quando premi il pulsante di esecuzione della sua riga.

Sopra la corsia, un agente può girare a ogni N-esima risposta oppure solo quando compaiono parole scelte.

## Agenti pronti

Premi "New agent" nella bacheca Agents del **Canvas** (la voce **Agents** della barra laterale la apre). "Empty agent" fornisce un Input e una nota. "Start from a ready agent" ne offre sei funzionanti: Prossime mosse, Spinta al ritmo, Mappa della storia, Riepilogo scena, Tavola del territorio e Indicatore di tensione. Sotto "Drafts" ci sono gli agenti che Molfar ha scritto nel tuo spazio di lavoro ("Drafts from Molfar").

## L'editor

Le modifiche vengono salvate come bozza un attimo dopo che ti fermi. Tre schede: Scheda (la scheda selezionata), Agente (nome, quando viene eseguito, la sua memoria, i pannelli) e Prova. Un controllo mostra "Passes the check", il numero di problemi e avvisi e "N model calls per run". Non puoi installare finché restano problemi. "Export as a file" salva un unico file che puoi condividere. Il pannello "Install and manage agents..." della chat ha "Install an agent file" per importarne uno.

### Le opzioni della scheda If

Una scheda If risponde Yes, No o Unknown secondo le sue regole e, da sola, dice Yes a ogni esecuzione finché le regole valgono. Sotto le regole, **When it answers Yes** cambia questo: "Every time" (predefinita), "Only when it turns Yes" (scatta al passaggio da non Yes a Yes, e di nuovo solo dopo che la risposta è tornata indietro), oppure "Only once in this chat". **Pause after it fires (runs)** salta quel numero di esecuzioni dell'agente dopo uno Yes, da 0 a 50. Un'esecuzione è un turno dell'agente, quindi con un agente che gira ogni terza risposta una pausa di 2 dura sei risposte. Una regola può anche usare "changed since the last run": Yes quando il valore è diverso da quello dell'ultima esecuzione. Nel modulo, ogni regola sceglie **What the rule reads**: un valore che colleghi, un valore della Dashboard, la chat (numero di messaggi, chi ha parlato per ultimo) oppure un dado del World DM (Fate, Life o Pacing: ha messo una nota in questa risposta, e quale è stato l'esito). Leggere un dado richiede il permesso "Read what the World DM’s dice said for the last reply", e funziona solo per un agente che gira dopo la risposta. Viene trattenuto solo uno Yes; No e Unknown escono comunque. L'agente ricorda questo per chat, e "start over" sull'agente lo dimentica. La scheda Try mostra perché una scheda ha risposto (la regola, il valore letto, il risultato) e, quando ha trattenuto uno Yes, quale opzione lo ha trattenuto; il log dell'agente sotto una risposta riporta le stesse righe.

## Prova

La scheda Prova esegue un turno inventato senza toccare nulla. Cambi gli input e i fili sulla tavola mostrano cosa si muove; senza modello, ogni scheda "Ask the model" usa una risposta di esempio che puoi modificare. Sotto "A real chat" scegli una chat e "Fill from this chat" per caricare ciò che l'agente riceverebbe davvero. "Run with the model" pone poi al modello reale la domanda reale: fino a N chiamate, token reali e nulla viene salvato nella chat o nell'agente.

Un agente con una scheda Script che esaurisce il tempo tre esecuzioni di fila in una chat viene lasciato in pace lì: la scheda Agenti dice che è in pausa (ogni esecuzione simile costerebbe i 2,5 secondi dello script). Sistema lo script, poi premi **Run again**; un'esecuzione che funziona mette fine alla pausa. Le tessere della tavola del territorio sono pulsanti: toccane una e il suo luogo finisce nella casella del messaggio (non viene inviato nulla). Una scheda elenco può anche essere impostata su "Change an entry, or add it if there is none", così qualcosa detto due volte non riempie l'elenco.

## Installa, consenti, attiva in una chat

1. Premi "Install" ("Update" per una copia modificata di un agente installato; usa "Edit a copy" per cambiarne uno).
2. Consenti una volta: "Review permissions", poi "Allow all" o riga per riga. Viene eseguito quando ogni riga è attiva. Un aggiornamento che chiede di più attende un nuovo consenso. Una scheda Script chiede "Run its own small program"; l'elenco dei permessi mostra il suo codice ("Read the code") prima che tu consenta, e se un aggiornamento cambia il codice, il permesso viene chiesto di nuovo.
3. Aggiungilo a una chat. Nella pillola dell'intestazione della chat apri la scheda **Agents**: "In this chat" elenca gli agenti attivi, "Installed" elenca gli altri (scegline uno per aggiungerlo). Una riga può essere eseguita di nuovo adesso, essere rimossa oppure smettere di far attendere la risposta. Una nuova chat non ha agenti finché non ne aggiungi alcuni o non scegli un insieme.

Un **insieme** è un elenco di agenti con nome ("Save this chat's list as a set"; "Make default" lo assegna alle nuove chat). La bacheca "Agent sets" del Canvas mostra il costo in tempo e in chiamate di ogni insieme e contiene l'interruttore "Agents' notes in chats", che nasconde le note di tutti gli agenti. Il posto del risultato di ogni agente può essere cambiato nella scheda Agenti della chat, tra i posti adatti.

Ogni scheda "Ask the model" è una chiamata per esecuzione; l'editor ne mostra il numero. "Every Nth reply" divide il costo.
