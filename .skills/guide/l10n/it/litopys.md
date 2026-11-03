<!-- source: 9004c118e307 -->
# Litopys: il registro della storia

Litopys (la cronaca) è la memoria lunga di una chat. Legge la storia in background e scrive un capitolo per ogni scena conclusa, più i fatti che la storia ha stabilito. Quando una chat diventa troppo lunga per la finestra del modello, il registro porta avanti la storia. Usalo per le storie lunghe; non devi avviarlo.

## Capitoli e fatti

- Un **capitolo** dice cosa è cambiato in una scena, non è una rilettura. Viene scritto quando inizia la scena successiva, quindi l'ultima scena potrebbe non averne ancora uno. Un nuovo luogo o un salto nel tempo chiude una scena; puoi anche marcare tu stesso una serie di messaggi come scena, dal menu "Altro" di un messaggio sotto Storia.
- Un **fatto** è una breve frase che resta vera: "Medli nasconde le ali al mercato." I fatti hanno un tipo, un peso (Quotidiano, Importante, Chiave) e chi li conosce. Puoi aggiungere, modificare, fissare o ritirare i fatti a mano.
- Le **proposte** sono i suggerimenti di Litopys: unire due fatti, ritirarne uno, riformulare, fissare. Accetti o rifiuti ciascuna.
- Le **abitudini** che un personaggio mostra chiaramente possono apparire anch'esse e diventare un'abitudine dopo essersi ripetute in più scene.

## Dove guardare

Premi **Registro** nell'intestazione della chat (su un telefono, nel Menu) per il registro di questa chat in un pannello laterale. La sezione **Libreria** della barra laterale mostra il registro di ogni chat. Ha due viste: Panoramica (una linea del tempo, una scheda per personaggio, le proposte in attesa) e Dettagli con le schede Capitoli, Fatti, Proposte, Abitudini e Attività. La scheda Attività registra cosa ha fatto Litopys, con Annulla dove possibile. L'ingranaggio ("Impostazioni di Litopys") imposta come viene scritto il registro.

## Cosa entra nel prompt

Per impostazione predefinita il registro viene inserito automaticamente. "Dimensione memoria" dice quanti token può occupare: Compatta (800 token) per impostazione predefinita, Auto (15% della finestra del modello, almeno 800) o Personalizzata da 200 fino a 16000. Quando tutto sta dentro, viene inviato per intero; altrimenti le parti che contano di più per la scena. Un modello piccolo vuole una dimensione piccola. "Capitoli e fatti" disattivato significa niente nuovi capitoli o fatti e niente aggiunte al prompt.

I messaggi più vecchi possono lasciare il prompt solo quando la finestra è piena, o scena per scena una volta che un capitolo li copre; l'impostazione "I messaggi più vecchi lasciano il prompt" sceglie.

## Suggerimenti e pulizia

"Suggerimenti" è "Chiedimi prima" per impostazione predefinita: ogni fissaggio e riscrittura attende il tuo sì. L'opzione silenziosa applica subito fissaggi e riscritture e li registra in Attività. Ritiri e unioni aspettano sempre te. "Riordina i fatti automaticamente" cerca duplicati e contraddizioni dopo 30 nuovi fatti, con una chiamata al modello in più ogni 60 fatti.

## Ricostruisci

"Ricostruisci da zero" riscrive capitoli e fatti dai messaggi in background, circa una chiamata al modello ogni 30 secondi. I fatti tuoi, modificati e fissati, e i capitoli modificati restano, e il registro attuale viene usato finché quello nuovo non è pronto. Si rifiuta di iniziare se nessuna scena si è chiusa.

Se modifichi i messaggi dopo che un capitolo è stato scritto, quel capitolo viene segnato come vecchio e riscritto.

## Correlati

Anche la scheda di un personaggio può conservare la memoria delle chat concluse: vedi [[memory]]. Gli articoli della Guida *Litopys: chapters and proposals*, *Facts and proposals* e *Overview vs Details* coprono le schermate.
