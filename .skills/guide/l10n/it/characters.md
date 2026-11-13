<!-- source: 9bbf7efc4d3f -->
# Personaggi, persone e gruppi

Tutto ciò con cui giochi vive in quattro sezioni: Personaggi, Gruppi, Persone e Marketplace. Questa pagina spiega a cosa serve ciascuna; gli articoli della Guida *Your characters*, *The card editor tabs* e *Groups of characters* hanno i dettagli.

## Schede

Una scheda è un personaggio: descrizione, personalità, scenario e un primo messaggio. Un'etichetta scritta `group: Guild of Ravens` oppure `faction: Guild of Ravens` mette anche il personaggio della scheda in quel gruppo, così un fatto di memoria raccontato al gruppo è noto a loro ([[litopys]]). La sezione Personaggi mostra le tue schede come griglia o elenco, con ricerca, etichette, cartelle, preferiti (una stella) e vari ordinamenti. Apri una scheda per modificarla. Le modifiche restano in una bozza finché non premi "Save changes"; uscendo con modifiche non salvate viene chiesto prima.

L'editor ha sei schede:

- **Core**: il testo della scheda, il dialogo e il saluto.
- **Profile**: la stessa descrizione divisa in campi strutturati (identità, aspetto, obiettivi). Ogni salvataggio li riscrive nel testo della scheda. Una scheda narratore può descrivere qui un intero cast.
- **Soul**: come il personaggio reagisce a te, più le abitudini. Vedi [[soul]].
- **Memory**: le chat concluse che il personaggio ricorda. Vedi [[memory]].
- **Lorebook**: i libri collegati a questa scheda.
- **More**: colori e voci, sprite, galleria, regex, impostazioni avanzate.

Una scheda può interpretare più personaggi contemporaneamente (un narratore o game master). Sotto Colors, "Voices" dà a ciascun parlante il proprio colore. Se non elenchi nessuna voce, la chat lo fa per te: una scheda che contiene più personaggi (sezioni con il nome di ciascuno) colora da sola le battute di ogni personaggio, ognuno con un colore diverso, e il colore resta salvato con la chat. In qualsiasi altra chat, apri il menu della chat, "Voice colors", e attiva l'interruttore; "Spread colors" dà un colore diverso a tutti quelli che non hai scelto. Serve il Dashboard Relationship, che fornisce l'elenco dei personaggi.

## Persone

Una persona sei tu: nome, pronomi, descrizione, avatar. Il modello la vede ovunque il prompt parli dell'utente. "Use this persona" la rende predefinita e porta la chat aperta a usarla. Una persona può portare i propri lorebook e può essere bloccata su personaggi scelti, così le nuove chat con loro iniziano con essa.

## Gruppi

Un gruppo mette più personaggi in una chat. "New group" ti consente di scegliere i membri. L'editor ha Overview, Members, Scene, Turns, Lore e Chats. La scheda Turns decide chi risponde: Narrator (una risposta dà voce a tutti) o Each in turn. Un nuovo gruppo inizia come Narrator.

La scheda Turns ha anche **How they talk**: **Interruzioni** (Interruptions): i membri si intromettono, parlano sopra gli altri o ignorano una domanda quando si adatta al loro personaggio. **Autogol** (Own goals): i membri obiettano, trattano o rifiutano quando un piano va contro ciò che sono, anche se crea tensione con te. **Coinvolgere i membri silenziosi** (Draw in quiet members): chi è stato zitto per un po' ha più occasioni di rispondere, e a una scena narrata viene chiesto di includerlo. Le prime due opzioni sono Off, Can o Should: Can lo permette quando si adatta alla scena, Should lo prevede, e se ogni risposta diventa una discussione, torna a Can. I nuovi gruppi partono con Can e con il coinvolgimento dei silenziosi attivo; i gruppi più vecchi tengono tutto disattivato finché non lo accendi. Il pulsante Turns della chat può cambiarli solo per quella chat. Nella scheda Members, apri la sezione "In this group" di un membro per dargli una **voce** che usa solo questo gruppo: fino a due abitudini di parlato (parla a frammenti, non fa mai domande) e fino a cinque frasi di esempio. Poche frasi insegnano il ritmo meglio degli aggettivi, e personaggi diversi dovrebbero reagire in modo diverso alla stessa notizia.

Un gruppo non è una scheda: eliminare un gruppo elimina le sue chat, mai i suoi membri. I membri senza un colore proprio ricevono automaticamente colori diversi.

## Ottenere schede

- "Import card" accetta file PNG o JSON, uno o molti, e collegamenti a Chub, RisuRealm, CharaVault, Botbooru o un file diretto.
- Il Marketplace cerca più fonti contemporaneamente; apri un risultato per leggere la scheda completa prima di importarla. Ogni fonte ha il proprio ordinamento e filtro per adulti, e alcune richiedono un download manuale.
- Export scrive un PNG con la scheda dentro.
- "With Molfar" nella Home (e nei Lorebook) chiede a Molfar di preparare con te una scheda o un lorebook. Vedi [[vertep:molfar]].

## Lettere dalle schede

Una scheda che non giochi da un po' può scriverti una breve nota con la propria voce. La nota arriva nella posta (la sezione "Waiting on you" della Home e il pulsante della posta nella barra laterale) come Lettera verde; aprirla ti porta alla vecchia chat, oppure avvia una chat per una scheda che non hai mai giocato. Una lettera non scrive mai dentro una chat e non inventa eventi.

È **disattivata finché non la accendi**. Finché è spenta, una scheda verde "Let your characters write to you" sta in cima alla sezione Personaggi e in "Waiting on you" della Home: **Turn on** la accende subito, **Not now** nasconde la scheda per sempre. I numeri (giorni di inattività, lettere al giorno, giorni tra due lettere della stessa scheda, il modello che scrive) e le schede che hai fermato si trovano in Personaggi, More, "Letters from cards". Le lettere vengono controllate ogni poche ore mentre l'app è aperta: una chat inattiva da 14 giorni, una scheda che non hai mai giocato da 14 giorni, e una scheda giocata senza Anima (una sola volta). Se il modello di scrittura fallisce tre controlli di fila (o non ne è impostato nessuno), la posta mostra un errore rosso "Letters" con il motivo, e **Open** ti porta alle impostazioni delle Lettere; una lettera che arriva, un altro modello o lo spegnimento delle lettere lo cancella.

## Ritratti per le schede senza

Una scheda senza immagine propria (nessuna, o l'avatar predefinito) può essere disegnata. **Una scheda:** nell'editor della scheda, "Draw" sotto il ritratto apre una finestra: scegli il modello di immagini, un modello di testo (il modello Card tasks) scrive una descrizione della scheda, che puoi modificare, e il modello di immagini la disegna. L'immagine va subito nella Galleria della scheda e "Use as portrait" la rende l'avatar. **Molte schede:** Personaggi, More, "Draw missing portraits (N)" chiede quale modello usare e poi le disegna una dopo l'altra nella scheda di avanzamento; Cancel si ferma tra una scheda e l'altra, e una scheda che fallisce compare con il motivo.

"Draw with" elenca i modelli di immagini di Settings > Images: un ComfyUI o Forge locale accanto ai modelli via API. La prima scelta è il modello di immagini dell'app (Extensions > Image generation); una scelta fatta qui viene ricordata solo per i ritratti. Un modello addestrato con tag riceve una riga di tag, un modello via API un paragrafo. Una scheda con solo un nome non ha nulla da descrivere, e la finestra lo dice. La generazione di immagini deve essere attiva (Extensions); le finestre lo segnalano e la aprono per te.

## Cosa una scheda non contiene

Lo stato della Dashboard, i capitoli e i fatti appartengono a ogni chat, non alla scheda. Anche la memoria della scheda non fa parte della scheda e non compare mai in un'esportazione. L'Anima, al contrario, viene salvata nella scheda.

Prossimo: [[first-story]] per la prima chat, oppure [[soul]] per il profilo di reazione.
