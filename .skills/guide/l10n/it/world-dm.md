<!-- source: 48bbc9815581 -->
# World DM

Il World DM è un game master per il mondo di una chat. Dopo le risposte legge la storia e conserva le persone, i luoghi e le cose che incontra nel lorebook della chat, chiamato libro del mondo. Ai livelli più alti muove anche il mondo e manda eventi nella scena. Usalo quando vuoi che il mondo sembri vivo e coerente.

## Livelli

Apritelo dall'intestazione della chat "World" (su un telefono, Menu, poi World), oppure dalla sezione **World** della barra laterale. Scegli cosa fa il DM:

- **Off**: nessun evento e nessun dado. Il libro del mondo si riempie comunque dalla storia: quando la scena nomina un nuovo luogo o una cosa, una piccola chiamata chiede al modello DM se registrarla.
- **Chronicler**: solo registrazioni, e non aggiunge eventi propri.
- **Living world**: fazioni e minacce si muovono fuori scena. Le notizie possono raggiungere i personaggi come voci; nulla viene imposto.
- **Director**: porta agganci, complicazioni e visitatori nella scena, e la risposta successiva deve usarli.
- **Antagonist**: conseguenze e pressione mirate a ciò a cui i personaggi tengono.
- **Total chaos**: può accadere qualsiasi cosa, qualunque sia il genere. Non riscrive mai la storia e resta in attesa durante le scene esplicite.

Per impostazione predefinita il DM è già attivo al livello Chronicler in una chat di storia, dalla sua prima risposta (non per una chat le cui schede sono tutte assistenti). Disattivalo nella Overview del foglio World se non lo vuoi.

## Cosa fa a ogni turno

Viene eseguito dopo le risposte, ogni N risposte ("Run after every N replies"), oppure subito con "World turn". Legge i nuovi messaggi e scrive o ritira voci nel libro del mondo: persone, luoghi, cose e chi le detiene. Puoi dare a un record di tipo Group o Place i **Members** (le persone che ne fanno parte) nella scheda World book; un fatto raccontato a quel gruppo in Litopys viene allora conosciuto da ciascuno di loro ([[litopys]]). Il DM non compila da sé Members. Da Living world in su muove anche fronti e orologi, e può preparare un evento che viene aggiunto alla risposta successiva. Con **Code** che muove gli orologi (World > Profiles > Options), ogni N risposte il codice tira un d6 per ogni fronte: 1-2 niente, 3-4 un passo, 5-6 un passo e al DM viene detto che notizie di quel fronte possono raggiungere la storia. Dadi opzionali (foglio World, Dice, da Living world in su, disattivati per impostazione predefinita): prima di una risposta, il codice tira 2d6 e dice al modello come si risolve un'azione incerta, come Hint o Binding. L'opzione **Pacing check, %** (Dice details, disattivata per impostazione predefinita) aggiunge un secondo tiro nascosto nei momenti in cui il personaggio dell'utente fa un passo verso la vicinanza: quanto bene riesce dipende da comfort, fiducia e affetto del personaggio, dalla Dashboard, e il modello lo interpreta come non pronto, esitante, accettante ma teso, oppure accogliente. Non blocca mai una risposta e non nomina mai i dadi.

Costa una chiamata al modello in più ogni volta che è dovuta, sul "DM model (all chats)"; basta un modello piccolo ed economico. Un'esecuzione fallita viene mostrata nel foglio e nella Inbox, e il DM legge di nuovo gli stessi messaggi la volta successiva.

Un profilo che gioca da un mazzo di eventi mostra "New deck" quando il mazzo è esaurito. Al modello si chiedono da 8 a 12 eventi; se ne tornano meno, il mazzo viene tenuto così com'è arrivato e un avviso dice che è tornato corto, così puoi ricostruirlo.

## Eliminare o fare swipe di una risposta

Elimina una risposta, oppure fai swipe verso un'altra, e il DM ritira ciò che aveva imparato da quella vecchia: record, orologi e un evento in attesa tornano com'erano, il libro del mondo viene riscritto e il DM rilegge la storia da quel punto.

Un evento è un colpo solo. Il DM controlla se la storia lo ha mostrato, guardando tutto ciò che viene dopo la risposta che lo portava, anche la parte che aveva già letto. Se no, l'evento viene mandato ancora una volta con la risposta successiva, a meno che nel frattempo la storia non si sia spostata altrove (un salto temporale, una nuova scena): allora viene lasciato andare, così un vecchio evento non riporta indietro la storia.

I record che hai cambiato a mano restano, a meno che il DM non abbia cambiato in seguito lo stesso record. Un record che hai eliminato resta eliminato. Eliminare messaggi vecchi dall'inizio, leggere altri swipe di una risposta più vecchia e modificare il testo di una risposta non ritirano nulla.

## Schede della sezione World

L'ingranaggio accanto al titolo dell'elenco World apre **World settings**, in blocchi ripiegabili come le Litopys settings: il modello di gioco (con un interruttore per sostituirlo per questo World, il limite di risposta e un pulsante di prova), il modello di costruzione, il modello di immagini, l'interruttore degli sfondi e se ti vengono segnalati gli errori. Un blocco ripiegato mostra in una riga ciò che è impostato.

Sulla chat scelta: Overview (gli stessi controlli del foglio), Places (un albero di luoghi, con un'immagine di sfondo per luogo), World book (leggi, scrivi, ritira o elimina voci a mano), Runs (cronologia, token, errori), Start (prepara voci dalle schede o da una breve intervista), Backgrounds (pianifica e disegna un insieme di immagini; con "Change the background by scene" attivo, la Dashboard sceglie quella adatta; con anche "Draw places that have no picture" attivo (è sempre elencato lì, grigio finché non sono accesi il cambio di scena e la generazione di immagini), un luogo in cui la storia si sposta e che non ha un'immagine viene disegnato sul momento dal modello di immagini del World e archiviato nella cartella; "Look of the pictures" accetta qualche parola in inglese (per esempio `medieval fantasy, candlelight`) che viene aggiunta a ogni sfondo disegnato per la chat, a un luogo disegnato sul momento o a un insieme; il foglio Display della chat ha un collegamento qui). Inoltre **Profiles** e **Worlds**.

## Profili world

Ogni livello è un profilo integrato: i cinque contengono i prompt del DM, e puoi aprirne uno, modificare un blocco di prompt e riportarlo al valore predefinito. Puoi anche creare profili tuoi sopra un livello. Una chat sceglie il suo profilo nel foglio DM. "Saved worlds" contiene i mondi che hai costruito e in cui avvii nuove chat; "New world" ne costruisce uno prima di qualsiasi chat, dalle schede o da una breve intervista.

Correlati: [[memory]], [[dashboard]]. Gli articoli della Guida *World profiles* e *Starting a world* hanno le schermate.
