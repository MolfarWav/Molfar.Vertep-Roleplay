<!-- source: 4bee02775a17 -->
# Sprite e finestre degli sprite

Gli sprite sono piccole immagini di un personaggio, una per emozione, che compaiono sopra la chat e cambiano man mano che la storia procede. Questa pagina è per chi vuole vedere più personaggi insieme, in un gruppo o con una scheda narratore, o creare un aspetto da visual novel.

## Cos'è una finestra degli sprite

Una finestra degli sprite fluttua sopra la chat e mostra **un personaggio**. Sceglie l'immagine dalle ultime battute di quel personaggio (con le stesse regole di parole chiave di prima; non viene chiamato nessun modello), e l'immagine resta finché il personaggio non parla di nuovo. Una scheda narratore che scrive i suoi personaggi come battute ("Aria: ...") dà a ciascuno le proprie battute; una che scrive in prosa ("Aria ride di gioia") dà a ciascuno le frasi che li nominano, e quando queste non mostrano emozioni, decide l'intero messaggio. Trascina una finestra dove vuoi, trascina il suo angolo inferiore per ridimensionarla (doppio clic sull'angolo per tornare alla dimensione predefinita) e premi **×** per ripiegarla in una piccola pastiglia rotonda; premi la pastiglia per riportarla.

Gli sprite si aggiungono a una scheda nell'editor, scheda **More**, **Sprites**. Le Impostazioni hanno un interruttore, "Expression Sprites", che spegne tutte le finestre.

## Una finestra o più

Una nuova chat ha una finestra che segue **chi parla**, come sempre. Premi l'ingranaggio su una finestra per aprire **Sprite windows**:

- **Add window** (fino a 8). Una nuova finestra mostra "Next in the scene".
- **Shows**, per finestra: "Whoever speaks", "Next in the scene" o un personaggio specifico (un membro del gruppo o una voce di una scheda narratore).
- **Transparent background**, per finestra: niente cornice e niente fondo, solo l'immagine. I clic la attraversano fino al testo della chat, quindi una finestra così si sposta con la piccola maniglia nell'angolo in alto a sinistra.
- **Visible part**: un cursore dal 35% al 100% (100% per impostazione predefinita). Meno del 100% mostra solo la parte alta di ogni immagine, quindi le gambe sono tagliate (dalla vita in su, o un busto al 40%); l'altezza della finestra è allora la parte visibile, e l'immagine viene disegnata più grande di conseguenza. Insieme alla fascia sotto il testo, questo dà l'aspetto da visual novel e lascia alla chat quasi tutta la sua altezza.
- **Windows are**: "In front of the text" (predefinito), "Behind the text" (il testo della chat è disegnato sopra le immagini, che restano sotto; ogni messaggio riceve uno sfondo del colore della pagina per restare leggibile, e il cursore **Text backing** ne regola l'intensità da 0% a 100%, 55% per impostazione predefinita; i pulsanti di una finestra diventano tenui e la finestra si sposta con la sua maniglia) oppure "In a strip under the text" (la chat tiene sotto il suo testo una fascia per le finestre, quindi nessun testo finisce sotto un'immagine; le finestre restano allora in basso e si spostano solo di lato, e la fascia è alta quanto la finestra più alta). Queste opzioni sono per tablet e computer; un telefono le tiene davanti.
- **Arrange**: "Row at the bottom" (l'aspetto da visual novel) o "Grid". Si limitano a disporre le finestre; da lì le trascini tu.
- **Hide empty windows**.
- **Back to one window**.

La disposizione viene salvata **per chat, in questo browser**. Non passa a un altro dispositivo.

## Chi è "nella scena"

Le finestre "Next in the scene" mostrano le persone della scena diverse da chi parla, e un personaggio **mantiene la sua finestra** finché resta: nessuno salta in un'altra finestra quando parla qualcun altro. Quando un personaggio lascia la scena, la sua finestra diventa vuota ("Nobody here") o scompare se "Hide empty windows" è attivo, e il prossimo arrivato occupa una finestra libera.

La scena è l'elenco "Present" della Dashboard quando la Dashboard ha letto la storia (vedi [[dashboard]]). Senza, la scena è formata da chi ha parlato negli ultimi sei messaggi.

## Outfit

Un personaggio con più di un outfit ottiene sulla finestra un piccolo selettore di outfit. La scelta viene ricordata per la chat ed è separata per ogni membro di un gruppo.

## Su un telefono

Un telefono mostra **una finestra**, e tutto resta sopra la casella dei messaggi, ovunque essa arrivi:

- **L'immagine lascia passare i tocchi.** Un swipe sopra di essa scorre la chat. La finestra si sposta con la maniglia nell'angolo in alto a sinistra, e l'ingranaggio (impostazioni), **×** (ripiega) e l'angolo (ridimensiona) sono sempre visibili. La finestra resta interamente sullo schermo e sopra la casella dei messaggi; se non ci sta, scende più in basso.
- **La riga sopra la casella dei messaggi** ha **Auto** e tutti quelli nella scena come piccole immagini rotonde. Il personaggio nella finestra ha un anello. Toccane un altro per mostrarlo lì: uno spillo sulla sua immagine significa che la finestra resta su di lui. Tocca quello con lo spillo, o **Auto**, e la finestra torna a seguire chi parla.
- **Mentre scrivi**, la finestra e la riga si fanno da parte, e tornano quando la casella dei messaggi è vuota o la lasci.
- Una finestra ripiegata è una piccola pastiglia rotonda: toccala e la finestra si apre dove si trova la pastiglia, riportata sullo schermo.

Finestre trasparenti, disposizione e finestre aggiuntive sono per tablet e computer.

## Cosa non fa

Non disegna nulla e non legge la storia con un modello: un personaggio senza sprite non ha finestra, e un personaggio che non ha mai parlato mostra la sua immagine predefinita. Un membro del gruppo senza sprite viene saltato.
