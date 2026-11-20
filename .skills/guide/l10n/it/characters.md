<!-- source: 1057467e9411 -->
# Personaggi, persone e gruppi

Tutto ciò con cui giochi vive in quattro sezioni: Characters, Groups, Personas e Marketplace. Questa pagina spiega a cosa serve ciascuna; gli articoli della Guida *Your characters*, *The card editor tabs* e *Groups of characters* contengono i dettagli.

## Schede

Una scheda è un personaggio: descrizione, personalità, scenario e un primo messaggio. Un tag scritto `group: Guild of Ravens` o `faction: Guild of Ravens` inserisce anche il personaggio della scheda in quel gruppo, così un fatto di memoria raccontato al gruppo è noto a loro ([[litopys]]). La sezione Characters mostra le tue schede come griglia o elenco, con ricerca, tag, cartelle, preferiti (una stella) e diversi ordinamenti. Apri una scheda per modificarla. Le modifiche restano in una bozza fino a "Save changes"; uscendo con modifiche non salvate viene chiesto prima.

L'editor ha sei schede:

- **Core**: il testo della scheda, il dialogo e il saluto.
- **Profile**: la stessa descrizione suddivisa in campi strutturati (identità, aspetto, obiettivi). Ogni salvataggio li riscrive nel testo della scheda. Una scheda narratore può descrivere qui un intero cast.
- **Soul**: come il personaggio reagisce a te, più le abitudini. Vedi [[soul]].
- **Memory**: le chat concluse che il personaggio ricorda. Vedi [[memory]].
- **Lorebook**: i libri collegati a questa scheda.
- **More**: colori e voci, sprite (vedi [[sprites]]), galleria, regex, impostazioni avanzate.

Una scheda può interpretare più personaggi contemporaneamente (un narratore o game master). In Colors, "Voices" assegna a ogni interlocutore il proprio colore. Se non elenchi voci, ci pensa la chat: una scheda che contiene più personaggi (sezioni intitolate a ciascuno) colora da sola le battute di ogni personaggio, ognuno con un colore diverso, mantenuto con la chat. In qualsiasi altra chat, apri il menu della chat, "Voice colors", e attiva l'interruttore; "Spread colors" assegna un colore diverso a chiunque tu non abbia scelto. Questo richiede la dashboard Relationship, che fornisce l'elenco dei personaggi. Quando le voci sono colorate, una battuta prende il colore di chi la pronuncia: il nome con cui si apre ("Rhea:"), un nome accanto a un verbo di parlato ("— No, — dice Esh"), oppure un lei o lui che indica l'unico personaggio di quel genere nominato prima nella stessa risposta ("— Va bene, — dice lei"). Un parlante che non è nell'elenco (un passante nominato solo nella storia) riceve un colore proprio, sempre lo stesso, lontano dai colori già usati. Una battuta che non nomina nessuno mantiene il colore del parlante precedente; prima che qualcuno venga nominato, resta il colore del tema. Se la storia chiama un personaggio con un nome diverso da quello della scheda (la scheda dice "Afrodite", la storia dice "Ada"), la chat può elencare due persone e colorarle separatamente. Due modi per renderle una sola: nella dashboard Relationship apri il menu del personaggio e scegli "Same person as...", oppure aggiungi alla scheda una riga come "Also called: Ada", così il nome è noto dalla prima risposta. Una parola breve tra virgolette nel mezzo di una frase ("lo chiamò «tradimento» e se ne andò") è letta come termine, non come parlato, e non viene colorata. Per capire perché una battuta ha quel colore, apri il menu della chat, "Voice colors", e attiva "Show who speaks and why": un piccolo segno dopo ogni citazione indica il parlante e la regola.

## Persone

Una persona sei tu: nome, pronomi, descrizione, avatar. Il modello la vede ovunque il prompt parli dell'utente. "Use this persona" la rende la tua predefinita e passa la chat aperta a quella. Una persona può portare i propri lorebook e può essere bloccata su personaggi scelti, così le nuove chat con loro iniziano con essa. La scheda Lorebooks di una persona elenca i libri che porta (aprine uno, scollegalo, aggiungine altri da un elenco in cui puoi cercare, o iniziane uno nuovo). Una persona può avere un libro proprio ("New book" su una scheda vuota lo crea, "Replace" lo sostituisce): viaggia dentro il file della persona, così Export e Backup lo portano con sé e importare il file su un altro dispositivo lo riporta indietro, collegato. I libri che si limitano a collegare restano nella libreria di quel dispositivo; un collegamento il cui libro manca appare come riga "Not in your library" che puoi rimuovere. Import nella schermata Personas accetta una persona da un'altra app (un nome e una descrizione), un backup di più persone, o un elenco `{ name: description }`; una persona che nomina libri che non hai ancora importato viene importata comunque, con una nota su quali mancano.

## Gruppi

Un gruppo mette più personaggi in un'unica chat. "New group" ti permette di scegliere i membri. L'editor ha Overview, Members, Scene, Turns, Lore e Chats. La scheda Turns decide chi risponde: Narrator (una sola risposta dà voce a tutti) o Each in turn. Un nuovo gruppo inizia come Narrator.

La scheda Turns ha anche **How they talk**: **Interruptions** (i membri si inseriscono, parlano sopra gli altri o ignorano una domanda quando si addice al loro carattere), **Own goals** (i membri obiettano, contrattano o rifiutano quando un piano va contro chi sono, anche se crea tensione con te) e **Draw in quiet members** (chi è stato in silenzio per un po' ha più occasioni di rispondere, e a una scena narrata viene chiesto di coinvolgerlo). I primi due sono Off, Can o Should: Can lo consente quando si addice alla scena, Should se lo aspetta, e se ogni risposta diventa un litigio, torna a Can. I nuovi gruppi iniziano con Can e Draw in attivi; i gruppi più vecchi tengono tutto disattivato finché non lo attivi. Il pulsante Turns della chat può cambiarli solo per una chat. Nella scheda Members, apri la sezione "In this group" di un membro per dargli una **voice** che usa solo questo gruppo: fino a due abitudini di parlato (parla a frammenti, non fa mai domande) e fino a cinque battute di esempio. Poche righe insegnano il ritmo meglio degli aggettivi, e personaggi diversi dovrebbero rispondere alla stessa notizia in modo diverso.

Un gruppo non è una scheda: eliminare un gruppo elimina le sue chat, mai i suoi membri. I membri senza un colore proprio ricevono automaticamente colori diversi.

## Ottenere schede

- "Import card" accetta file PNG o JSON, uno o molti, e link a Chub, RisuRealm, CharaVault, Botbooru o a un file diretto.
- Il Marketplace cerca in più fonti contemporaneamente; apri un risultato per leggere la scheda completa prima di importarla. Ogni fonte ha il proprio ordinamento e filtro per adulti, e alcune richiedono un download manuale.
- Export scrive un PNG con la scheda dentro.
- "With Molfar" su Home (e in Lorebooks) chiede a Molfar di abbozzare con te una scheda o un lorebook. Vedi [[vertep:molfar]].

## Lettere dalle schede

Una scheda che non giochi da un po' può scriverti una breve nota con la propria voce. La nota arriva nella inbox ("Waiting on you" di Home, il pulsante inbox nella barra laterale) come Lettera verde; aprirla ti porta alla vecchia chat, o avvia una chat per una scheda che non hai mai giocato. Una lettera non scrive mai in una chat e non inventa eventi.

È **disattivata finché non la attivi**. Mentre è disattivata, una scheda verde "Let your characters write to you" sta in cima alla sezione Characters e in "Waiting on you" di Home: **Turn on** la attiva subito, **Not now** nasconde la scheda per sempre. I numeri (giorni di inattività, lettere al giorno, giorni tra lettere di una stessa scheda, il modello di scrittura) e le schede che hai fermato sono in Characters, More, Letters from cards. Le lettere vengono controllate ogni poche ore mentre l'app è aperta: una chat inattiva da 14 giorni, una scheda mai giocata per 14 giorni, e una scheda giocata senza Soul (una volta). Se il modello di scrittura fallisce tre controlli di fila (o nessuno è impostato), la inbox mostra un errore rosso "Letters" con il motivo, e Open ti porta alle impostazioni delle Letters; una lettera che arriva, un modello diverso o disattivare le lettere lo cancella.

## Ritratti per schede che non ne hanno

Una scheda senza un'immagine propria (niente, o l'avatar predefinito) può essere disegnata. **Una scheda:** nell'editor della scheda, "Draw" sotto il ritratto apre una finestra: scegli il modello di immagini, un modello di testo (il modello Card tasks) scrive una descrizione della scheda, che puoi modificare, e il modello di immagini la disegna. L'immagine va subito nella Gallery della scheda e "Use as portrait" la rende l'avatar. **Molte schede:** Characters, More, "Draw missing portraits (N)" chiede quale modello e poi le disegna una dopo l'altra tramite la scheda di avanzamento; Cancel si ferma tra una scheda e l'altra e una scheda che fallisce è elencata con il motivo.

"Draw with" elenca i modelli di immagini di Settings > Images: un ComfyUI o Forge locale accanto ai modelli API. La prima scelta è il modello di immagini dell'app (Extensions > Image generation); una scelta qui viene ricordata solo per i ritratti. Un modello addestrato sui tag riceve una riga di tag, un modello API un paragrafo. Una scheda con solo un nome non ha nulla da descrivere, e la finestra lo dice. La generazione di immagini deve essere attiva (Extensions); le finestre lo dicono e la aprono per te.

## Cosa non contiene una scheda

Lo stato della Dashboard, i capitoli e i fatti appartengono a ogni chat, non alla scheda. Anche la memoria della scheda non fa parte della scheda e non appare mai in un export. Il Soul, invece, è salvato nella scheda.

Poi: [[first-story]] per la prima chat, o [[soul]] per il profilo di reazione.
