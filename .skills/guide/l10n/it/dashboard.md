<!-- source: b6c59373d069 -->
# La Dashboard della scena

La Dashboard è un pannello accanto alla chat che tiene traccia della scena: chi è presente, come ogni personaggio si sente nei tuoi confronti, cosa indossa e cosa sa, i fili narrativi aperti. È per chiunque voglia che la storia ricordi relazioni e dettagli tra una risposta e l'altra. L'articolo di aiuto *Scene dashboard* elenca i suoi campi.

## Cosa tiene traccia

Aprila cliccando su un ritratto nella chat e scegliendo Dashboard. Il pannello laterale ha quattro schede: **Person** (atteggiamento, umore e stato, outfit e oggetti: cosa indossano, tengono e portano con sé, e cosa si trova nelle vicinanze), **Here** (luogo, meteo, chi è presente), **Quests** (i fili aperti: principale, secondario, quotidiano; una quest si chiude da sola nel turno in cui la storia la porta a termine, la fa fallire o la supera, e una legata a una scena finisce con quella scena) e **Notes** (il taccuino: cosa sa un personaggio, e se l'ha visto, sentito o intuito). La "Constellation" indica come un personaggio si pone nei tuoi confronti, per esempio Friendship o Romance. Un numero su una scheda conta i cambiamenti dalla tua ultima risposta (rosso quando qualcosa è calato). La vista ampia ha anche un Journal con il pensiero e i ricordi di un personaggio. Sul telefono lo stesso contenuto si apre come un foglio.

**Una persona elencata due volte.** Se la Dashboard mostra la stessa persona sotto due nomi (per esempio "Sina" e "Sina Rose"), aprine uno e usa il piccolo pulsante delle persone nell'intestazione di Person, poi "Same person as..." e scegli l'altro. Ti viene chiesto prima: le note, la cronologia e gli oggetti passano alla persona che hai scelto, i suoi numeri di relazione restano, il nome diventa un altro suo nome, e non si può annullare. La Dashboard suggerisce anche da sola i probabili duplicati: un riquadro in cima alla scheda Person (e un chip "Possible duplicate" in "Since your last reply") dice "X may be the same person as Y" con il motivo. "Merge into Y" fa lo stesso del menu; "Different people" li tiene separati e la Dashboard smette di suggerire quella coppia. Lo stesso menu ha "Not in the scene" per qualcuno che la storia si limita a menzionare ma che un modello ha messo nella scena: esce dall'elenco dei "presenti", resta conosciuto con le sue note, e la Dashboard non lo rimette a meno che non parli (il toast ha "Undo", e poi il menu offre "Put back in the scene"). "Remove from the Dashboard" serve per un nome che è semplicemente sbagliato: toglie la persona da ogni stato salvato.

Un personaggio che è in contatto da altrove (un messaggio, una lettera, una chiamata, un video) è segnalato così nella riga della scena, con una breve frase in più su cosa gli arriva: per messaggio o lettera solo le parole inviate; per chiamata solo la voce e i suoni vicino al telefono; per video solo ciò che è nella telecamera e ciò che si sente lì vicino. Un'azione silenziosa, come mettere su il bollitore, non è nota a loro.

I numeri (fiducia, comfort, attrazione, rispetto, affetto e altri) sono calcolati dal codice a partire dagli eventi che un modello segnala, e inclinati dal [[soul]] di ogni personaggio. Lo stato è mantenuto per messaggio, quindi uno swipe o un messaggio eliminato non lascia mai numeri obsoleti.

Di chi è il sentimento: ogni numero è come quel personaggio sente nei confronti del *tuo* personaggio, mai il contrario. Gli eventi dietro di essi sono ciò che fa il tuo personaggio: un bacio sulla fronte o un abbraccio scaldano comfort e affection, solo un bacio romantico alza arousal. Quando un personaggio fa un torto al tuo (tradisce, mente, se ne va), è un'azione del personaggio: non viene registrata come del tuo personaggio, e al sensore viene detto di non abbassare per questo la fiducia del personaggio in te. Se un numero si muove ancora in modo sbagliato, segnalalo come issue: il modello del sensore è un modello, e uno piccolo può fraintendere una scena.

**La data e un calendario tutto tuo.** L'orologio mostra una data sotto l'ora. Tocca la matita accanto per impostare la data, nasconderla o tornare a quella automatica. Per un mondo fantasy o isekai i cui mesi e anni non sono i nostri, scegli **A world with its own calendar…** in quel popover: dai un nome ai mesi e assegna a ciascuno i suoi giorni (12 mesi da 30 giorni è un tocco), aggiungi i nomi dei giorni della settimana e un'era ("AR", "of the Third Age") se vuoi, e indica la data del giorno presente della storia, in qualsiasi anno, anche prima dello zero. Da quel momento la data segue il contatore Day ("3 Frostmoon 1204 AR"), compare sull'orologio e nelle righe della scena che il modello legge, e il testo della storia non la sposta mai. **Use the real calendar** nella stessa finestra la riporta indietro.

**Come l'orologio segue la storia.** Scrivi l'ora come la racconteresti: "half an hour later", "через годину", "the next day, 9:30", "three days later". L'orologio legge queste frasi nelle tue battute e nella storia (fuori dal discorso: una promessa tra virgolette, "come in an hour", non è tempo trascorso), e la risposta successiva vede già la nuova ora. L'ora che la storia nomina è il punto in cui si trova l'orologio. Quando viene indicata solo una parte del giorno ("the next morning"), l'orologio mostra circa le 09:00. La piccola ora grigia sopra quella grande è l'orologio precedente ("12:51 →" sopra "12:56"), e al modello viene detto lo stesso, con quanto si è spostato ("5 min after 12:51"). Un giorno non cambia finché la storia non supera la mezzanotte o non dice che è successo. Per un salto che preferisci non scrivere, **Skip time...** nel menu "+" lo invia per te.

Il pulsante "Story, move" accanto a Send prepara una spinta una tantum per la prossima risposta; la sua freccia sceglie una quest aperta o un colpo di scena.

## Cosa è cambiato, nella chat

Sotto la risposta più recente, una riga attenuata dice cosa ha registrato la Dashboard per essa: "Changed: Ada · trust fell, mood calm → tense, +2". Toccarla per aprire gli stessi chip della riga "Since your last reply" della Dashboard; un chip apre la scheda corrispondente della Dashboard (sul telefono, il suo foglio in basso). Le risposte più vecchie non mostrano nulla, e la riga attende mentre una risposta viene scritta o la Dashboard si sta ancora aggiornando. Per nasconderla, disattiva "Show what changed under the newest reply" in Settings > Chat Behavior.

## Legami tra i personaggi

Il sensore rileva come due personaggi che non sei tu si pongono l'uno verso l'altro, come un ruolo di una parola e un calore di una parola ("rival, cold"). Il prompt della risposta porta fino a quattro di questi come una riga breve, solo per le persone nella scena. La risposta di un personaggio riceve solo i legami di cui quel personaggio fa parte; un narratore riceve prima i legami delle persone di cui tratta il turno.

## Cosa ha detto un personaggio, e le bugie

Sotto il taccuino di una persona, la lista **Said** conserva le cose forti che ha detto e a cui è tenuto: un voto, una minaccia, una confessione, un ordine. Anche una bugia è conservata lì, coperta finché non scegli "Show hidden".

Quando un personaggio mente davanti agli altri, gli altri la prendono per vera. Le loro risposte successive la trattano come qualcosa che è stato detto loro e che non hanno motivo di dubitare, finché la storia non mostra il contrario. Solo le persone che erano nella scena vengono ingannate, e solo nelle loro risposte: qualcun altro che parla non ripete la bugia.

Apri una bugia e vedi **Believe it:** con un pulsante per ogni persona che ci crede ancora. Premi un nome quando quella persona l'ha scoperto. Il menu della riga ha anche **This was a lie** per un'affermazione che il sensore non ha segnato come tale (le persone nella scena allora ci credono), e **Not a lie** quando il sensore ha sbagliato. Il sensore termina da solo la convinzione quando una risposta mostra che la verità viene a galla. Rimuovere la bugia dalla lista rimuove con essa ogni convinzione.

> Il narratore dà voce a tutti in un'unica risposta, quindi conosce sempre la verità. Questo serve solo a impedire che un personaggio agisca in base a ciò che sa un altro personaggio.

## Quando si aggiorna

Il pulsante "Settings" dentro la Dashboard apre le sue impostazioni; la scheda Sensor ha la modalità:

- **Sensor** (predefinita): dopo ogni risposta un modello legge i nuovi messaggi e segnala cosa è successo.
- **Fast: inside the story reply**: per modelli forti. Il modello della storia scrive da sé il resoconto alla fine della sua risposta, senza una chiamata separata, aggiungendo qualche token a ogni risposta. Se omette il resoconto, parte il sensore abituale.
- **Manual**: si aggiorna solo quando premi "Refresh".

## Quanto costa

In modalità Sensor, una chiamata extra al modello per ogni risposta, sul "Sensor model" (il modello della chat se lo lasci vuoto). Un modello economico e piccolo basta. Legge i nuovi messaggi per intero (fino a circa 12000 caratteri in totale; una risposta più lunga perde solo la parte centrale), e il codice prima segna le frasi che sembrano riguardare vestiti, il vestirsi o un bacio e vi indirizza il modello, così una gonna nominata una volta a metà di una risposta lunga arriva comunque all'outfit. Se la card di un personaggio ha una riga "Attire:", al sensore viene mostrata anche quella come riferimento per la dicitura esatta di un capo che il testo menziona (non aggiunge mai un capo che il testo non mostra). Ciò che un personaggio indossa e tiene è conservato come una lista di oggetti; un capo che si strappa o si sporca resta un solo oggetto. Ogni cosa mantiene una sola identità ovunque vada: indossata, tolta vicino alla porta, passata a qualcun altro. Le cose lasciate in un luogo restano lì: quando la storia torna al café, la tazza è ancora sul tavolo. Quando la storia non mostra cosa indossa qualcuno da circa sei turni, al modello di scrittura viene chiesto di menzionarlo, brevemente. Per aggiungere parole di una lingua che la scansione non conosce, elencale in `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` disattiva la scansione. La Dashboard aggiunge anche un breve "Prompt insert" a ciò che legge il modello della storia, così i personaggi sanno come sono messi: puoi disattivarlo e impostare "Tokens per character". "What the model sees" nelle impostazioni mostra l'insert.

## Come disattivarla

Non c'è un interruttore separato per spegnerla nelle schermate qui elencate. Imposta la modalità su "Manual" e non chiamerà mai un modello da sola. Per rimuoverla del tutto, disabilita il plugin Dashboard nel pulsante Plugins di Molfar Vertep; Tools > Plugins in Roleplay elenca solo ciò che è in esecuzione. Disattiva "Prompt insert" se vuoi che resti fuori dalla richiesta.

## Correlati

[[soul]] la alimenta; [[litopys]] usa le sue note; [[memory]] la confronta con gli altri tipi di memoria.
