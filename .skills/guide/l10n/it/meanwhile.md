<!-- source: b6e3ca620392 -->
# Nel frattempo: la vita fuori scena

Nel frattempo permette a chi non è nella scena di fare cose mentre la storia va avanti: Bram vende un cavallo al porto, Ada nasconde il registro, un fronte si avvicina di un passo al suo obiettivo. È una versione di prova, disattivata per impostazione predefinita.

## Come attivarlo

Apri il pannello **World** della chat e trova la scheda **Meanwhile**. Attiva "Let people off screen act". L'interruttore vale per tutte le chat. Serve che il **Dashboard** sia attivo, perché Nel frattempo legge le scene da lì, e serve qualcuno che agisca: una scheda personaggio che non è nella scena, o una persona nel libro del World DM.

## Quando viene eseguito

Un passaggio viene eseguito dopo una risposta quando sono arrivate almeno due nuove risposte e o è iniziata una nuova scena o l'orologio della storia si è spostato di sei ore. Un passaggio è una chiamata al modello. Usa un modello suo se ne hai impostato uno, altrimenti quello del World DM, del sensore del Dashboard, della Library, della chat, dell'app. La scheda dice quale. "Run a pass now" ne esegue uno subito.

Un passaggio chiede fino a tre piccoli eventi. Legge la scena appena chiusa, i fili aperti del Dashboard, i fronti e, per ogni persona, il punto in cui il World DM l'ha lasciata, così che un evento la porti avanti invece di ripetere il momento in cui è rimasta. L'app controlla ciascuno: le persone devono essere quelle che la chat conosce, mai il tuo personaggio e mai qualcuno che è nella scena, e gli effetti devono venire da una lista breve. Un evento che non supera un controllo viene scartato del tutto, e il registro dice perché. Viene scartato anche un evento che ripete ciò che un evento precedente sulla stessa persona aveva già detto («repeats an earlier event»). Se un modello non risponde nulla, il passaggio riprova una volta con più spazio; un passaggio che fallisce aspetta dieci minuti.

## Cosa mostra la scheda

- **What this card shows**: Nothing (solo che è successo qualcosa), Hints (chi e dove) o Everything. Il valore predefinito è Hints, così la storia non ti viene rovinata.
- **Off screen so far**: gli eventi, come li lascia vedere quell'impostazione.
- **Log**: ogni passaggio: perché è stato eseguito (scena chiusa, tempo passato, a mano), quanti eventi ha offerto il modello e quanti sono stati tenuti, perché gli altri sono stati scartati, e l'errore quando ha fallito.

## Cosa fanno gli eventi alla storia

Ogni evento tenuto diventa un ricordo delle persone a cui è capitato e di quelle che l'hanno visto, e di nessun altro: mai il tuo personaggio. Arriva a una risposta con le solite regole del registro della storia ([[litopys]]): quando una di quelle persone parla, o una di loro è nella scena per una risposta di un narratore o di un gruppo. Chi lo sa può poi tirarlo in ballo, accennarvi o agire di conseguenza; gli altri no. Un evento segreto è anche marcato "kept secret", così a una risposta di gruppo viene detto chi lo custodisce. Gli eventi non vengono copiati nei Facts della Library: vengono letti dal file di Nel frattempo per ogni risposta, quindi non costano nulla da tenere e se ne vanno con lo swipe. Il pannello "What fired" del prompt li elenca come qualsiasi fatto.

Se disattivi Nel frattempo, gli eventi smettono subito di arrivare alle risposte.

## Nel diario del Dashboard

Nel Dashboard largo, il **Journal** di un personaggio ha una sezione **Off screen (Meanwhile)** con gli eventi capitati a quel personaggio, dal più recente, per quanto l'impostazione della scheda lascia loro mostrare: solo dove e quando sotto Hints, il testo sotto Everything, e nulla sotto Nothing. Legge solo il file di Nel frattempo; non scrive nulla nel Dashboard, quindi se ne va con uno swipe e non richiede impostazioni extra. Sul telefono il Journal non viene mostrato.

## Swipe ed eliminazioni

Un evento appartiene alla risposta dopo la quale è successo. Se rigeneri quella risposta, la nuova versione viene scritta senza l'evento; se fai swipe o elimini quella risposta, se ne vanno anche gli eventi di quel passaggio, dalla storia pure, e il passaggio successivo rilegge la storia dall'ultima risposta che c'è ancora.

Correlati: [[world-dm]], [[dashboard]], [[litopys]]. Vedi [[litopys]] "Who knows" per come vengono mostrati i segreti.
