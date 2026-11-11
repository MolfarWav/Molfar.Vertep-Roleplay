<!-- source: 45efabb467af -->
# La tua prima storia

Questo è il percorso più breve da un Roleplay vuoto a una storia in corso, e un elenco di ciò che avviene da solo affinché nulla ti sorprenda. Prima ti serve una connessione a un modello: vedi [[vertep:models]].

## Passi

1. **Ottieni una scheda.** Nella Home premi "New character" e scrivine una, oppure "Import card" per portare una scheda PNG o JSON da un file. Puoi anche cercare nella sezione Marketplace, o premere "With Molfar" per far preparare a Molfar una scheda dalla tua idea. Vedi [[characters]].
2. **Salvala.** L'editor della scheda conserva le modifiche in una bozza finché non premi "Save changes".
3. **Scegli una persona** (chi interpreti) nella sezione Persone, oppure mantieni quella predefinita. "Use this persona" la rende predefinita.
4. **Avvia una chat.** Premi "New chat" sulla scheda. La chat si apre con il primo messaggio della scheda.
5. **Controlla il modello.** La pillola nell'intestazione della chat ha una scheda Model; scegliere lì un modello cambia solo questa chat.
6. **Scrivi.** Sotto ogni risposta puoi scorrere altre versioni (swipe); la freccia destra sull'ultima versione ne chiede una nuova. Per rifare una risposta con una direzione, usa "Regenerate with a hint" nel menu "+". Per indirizzare la risposta verso il messaggio che stai scrivendo, metti l'istruzione tra doppie parentesi al suo interno, per esempio `I walk in. [[Aria is hiding a secret.]]`: il modello la legge come indicazione di scena, non come qualcosa che hai detto (il menu "+" ha "Stage direction" per scrivere le parentesi al posto tuo). Il pulsante "More" su un messaggio offre modifica, diramazione, anteprima del prompt e altro.

## Cosa gira da solo

Una volta che la chat ha risposte, gli aiutanti in background lavorano, ciascuno con le proprie chiamate al modello:

- La Dashboard legge la scena dopo ogni risposta ([[dashboard]]).
- Litopys scrive un capitolo quando una scena si chiude ([[litopys]]).
- Il World DM, al suo livello attivo più basso (Cronista), registra persone e luoghi in un libro per questa chat ([[world-dm]]).
- Una scheda senza anima ne riceve una proposta automaticamente ([[soul]]).

I fallimenti di questi lavori sono elencati nella Posta in arrivo (Inbox).

## Se il modello è piccolo, lento o pagato a chiamata

I risparmi più economici, in ordine:

1. Nelle "Settings" della Dashboard, imposta la modalità su "Manual" (poi si aggiorna solo quando premi "Refresh"), oppure scegli un modello piccolo come "Sensor model".
2. Nelle "Litopys settings" della Library, abbassa "Memory size" o disattiva "Chapters and facts".
3. Nel foglio World, scegli il livello "Off" (fa comunque una piccola chiamata quando la scena nomina un nuovo luogo) oppure scegli un "DM model (all chats)" economico.
4. Nelle impostazioni della Dashboard, disattiva "Rate characters automatically".
5. Nel Canvas, la bacheca Prompt mostra ogni parte della prossima richiesta con i suoi token e ti consente di disattivare parti per una chat.

Una storia che si è allungata ha bisogno di misure proprie: vedi [[long-chats]].

I modelli gratuiti con finestre di contesto piccole funzionano meglio con una Dashboard manuale e una memoria Compatta.

## Prossimo

[[memory]] spiega i tipi di memoria; [[settings]] dice dove si imposta ogni cosa.
