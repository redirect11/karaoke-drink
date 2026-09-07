# Architettura — com'è fatta l'app, e perché

Il contesto decide tutto: questa è un'app di cassa che si usa la sera, col
locale pieno e la rete che va e viene. Ogni scelta qui sotto discende da
un vincolo solo: **un gesto al banco deve avere effetto immediato**, rete
o non rete. Chi tocca il codice deve conoscere questi meccanismi, perché
violarli non rompe un test — rompe una serata.

## La forma generale

- **PWA React + Vite**, una sola pagina, installabile; il gestionale e la
  vista cliente sono la stessa app, l'interfaccia segue **chi guarda**
  (il ruolo), non l'indirizzo.
- **Firestore è l'unico database**; le **Cloud Functions** (Gen2,
  `europe-west1`) fanno solo ciò che il client non può fare in sicurezza:
  credenziali SumUp, push, gestione utenze. Dettaglio in
  [docs/functions.md](functions.md).
- **Un progetto Firebase = un locale**: `tana-drink` (produzione),
  `tana-drink-test` (test), `demo-tana-drink` (emulatori). Il modello dati
  è a radice piatta, senza tenant: la federazione futura replica il
  progetto, non condivide il database
  ([docs/piano-sbrandizzazione.md](piano-sbrandizzazione.md)).

## Local-first: i cinque attrezzi

Il principio sta nel CLAUDE.md («niente aspetta la rete»); questi sono i
pezzi che lo realizzano. Prima di toccare coda, conto o pagamento, vanno
conosciuti tutti e cinque.

1. **La cache di Firestore** (`src/lib/firebaseClient.js`): persistenza
   offline multi-tab. Le schermate leggono da lì e si aggiornano via
   `onSnapshot`; la rete è un dettaglio che arriva dopo.
2. **Scritture in sottofondo** (`src/lib/sync.js`): nessun `await` su una
   scrittura prima di mostrare l'esito — la Promise di Firestore si
   risolve solo all'ACK del server, e offline non torna mai. Le scritture
   partono e basta; `sync.js` le conta (idle / in corso / sincronizzato /
   errore), alimenta l'indicatore in alto e permette di **ripetere**
   quelle fallite. Un rifiuto vero (permessi, dati) arriva come errore e
   si vede.
3. **Ottimismo con placeholder** (`src/lib/pendingOrders.js`): il POS
   invia e naviga subito; in coda appare una card grigia «in caricamento»
   finché la sottoscrizione non porta l'ordine vero (aggancio via
   `client_temp_id`, deterministico anche se lo snapshot arriva prima
   della conferma). Stessa filosofia per gli avanzamenti di stato dalla
   coda: cambiano al tocco, il server segue, in errore si torna indietro.
4. **Numeri precalcolati** (`src/lib/progressivi.js`): il numero di conto
   non si chiede al server al momento del bisogno — tre ascolti tengono i
   contatori in memoria, e il prossimo numero è `max(server, ultimo
   assegnato qui) + 1`. Limite accettato e documentato nel modulo: due
   dispositivi nello stesso istante possono ancora collidere; la
   transazione che lo escluderebbe significherebbe aspettare il server a
   ogni ordine.
5. **La bozza sincrona** (`src/lib/useDraft.js`): le righe non confermate
   sopravvivono a tutto (chiave `new` in creazione, id ordine in
   modifica) e si salvano **fuori** dagli updater React — dentro un
   updater, allo smontaggio del componente React lo scarta e la
   cancellazione non avviene (successo davvero).

### Quello che ho appena fatto io

Il terzo attrezzo ha un posto solo, ed è `src/lib/comandeLocali.js`:
l'array `comande` come lo vede QUESTO terminale, per conto, che se ne va
da sé quando il server racconta la stessa cosa. Lo usano la coda, il
conto e il dettaglio della comanda — prima erano tre copie della stessa
idea e si comportavano già in modo diverso.

Due regole che sembrano dettagli e non lo sono:

- **La pulizia si fa per FIRMA** (`firmaLavoro` in `comande.js`): i passi
  e le quantità, **senza gli id**. Una comanda appena creata qui non ha
  ancora il nome che le darà il server, e confrontando gli id la copia
  locale di una divisione non se ne sarebbe andata mai più. E si toglie
  solo quando il server combacia, **mai** subito dopo la scrittura:
  quella risponde PRIMA dello snapshot, e toglierla lì fa riapparire per
  un battito lo stato di prima (il tasto «rimbalza»).
- **Una scrittura in sottofondo tocca solo i campi che le competono.**
  `comande` è un array, e Firestore un array lo riscrive intero: non
  esiste un percorso tipo `comande.2.inventory_applied`. Chi scrive si
  rilegge quindi il documento — ma **nell'istante prima di scrivere**,
  non all'inizio del lavoro. Lo scarico del magazzino leggeva l'array,
  poi andava in rete a prendere ricette e articoli, e alla fine
  riscriveva quell'array vecchio: gli avanzamenti fatti nel frattempo ci
  finivano sotto, e «Ritirato/Servito» andava premuto due volte
  (BUG-022). Vedi `scriviCampiComanda` in `api.js`.

Al contorno, stessa logica: i conti chiusi spariscono dalla coda
all'istante (`ordiniNascosti.js`, memoria locale in attesa dello
snapshot), le notifiche in-app vivono in un registro locale
(`notifyStore.js` + `dispositivo.js`), l'avviso di nuova versione è un
banner non bloccante (`appVersion.js`).

## Il modello dei dati

Collections di primo livello (un database = un locale); la mappa completa
si legge in `firestore.rules` e `src/lib/api.js`.

| Collection | Cosa contiene |
|---|---|
| `orders` | il CONTO: `order_items` aggregati, più le `comande[]` (invii in preparazione, ognuno col suo stato) e i `payments[]` (le riscossioni, ognuna con le sue righe e il suo sconto) |
| `drinks`, `categories` | il listino e le sue categorie |
| `inventory_*`, `suppliers`, `supplier_prices`, `supplier_price_history`, `stock_*`, `purchase_orders`, `supplier_invoices` | magazzino, fornitori, acquisti. `supplier_prices` è il LISTINO: una riga per coppia prodotto-fornitore, con id `<fornitore>__<prodotto>` — l'unicità della coppia è così strutturale, non un controllo applicativo (REQ-MAG-029). `supplier_price_history` è lo STORICO di quei prezzi: una riga per variazione (prezzo, prezzo di prima, data e provenienza — a mano, alla consegna, da una fattura), id `<fornitore>__<prodotto>__<istante>` perché una scrittura ripetuta non lasci un doppione. La riga di listino tiene un prezzo solo: senza lo storico ogni aggiornamento cancella quello di prima, e uno storico non si ricostruisce all'indietro (REQ-MAG-035) |
| `counters` | progressivi: `serial` (assoluto), per giornata, `fatture-<anno>`, `_active_cash` (la cassa aperta) |
| `settings` | doc `bar` (tutte le impostazioni del locale) e `printer` (stampante condivisa) |
| `cash_sessions`, `payments`, `invoices`, `vouchers` | cassa, incassi, fatture di cortesia, buoni VIP |
| `staff_tokens`, `staff_hours`, `staff_rates`, `staff_shifts`, `staff_calls` | dispositivi push e ore/paghe/chiamate dello staff |
| `groups` | contenitori di conti (tavolate, clienti abituali), anche annidati |
| `service_stats/global`, `pos_prefs/global` | medie dei tempi, preferenze POS condivise |

Regole di sopravvivenza del modello:

- **Il codice nuovo legge sempre i dati vecchi.** Il database attraversa
  le versioni: gli ordini vecchi si normalizzano al volo (REQ-ORD-002),
  le migrazioni sono additive e idempotenti, mai un'app che presuppone la
  migrazione già fatta.
- **Il magazzino si scala con lo snapshot** della ricetta al momento in cui
  la comanda è **pronta** (la ricetta cambia, il drink già fatto no); le
  modifiche riallineano per differenza, l'annullo reintegra. Il momento è
  uno solo e sta in `comandaDaScaricare`: a «pronto» il drink è fatto, e a
  segnarlo è chi l'ha fatto — mentre «servito» lo segna la sala, che sul
  magazzino non scrive.
- **Lo sconto appartiene alla riscossione, non al conto.** Cade sulle
  righe che si stanno incassando, e all'incasso viene consumato dentro quel
  pagamento (`payments[].sconto`): due riscossioni scontate sono due sconti,
  e il residuo è totale − sconti consumati − sconto in preparazione − pagato.
  Sul documento resta solo quello **in preparazione** (`discount`,
  `discount_amount`, `discount_items`), perché la selezione vive dentro la
  schermata e senza le righe scritte un altro terminale leggerebbe un importo
  senza sapere di che cosa. Chi somma gli sconti passa da `scontoTotale()`
  (`pagamento.js`), mai da `discount_amount`: su un conto vecchio i due numeri
  coincidono, su uno di stasera no. Regola completa in REQ-PAG-013.
- **La giornata è commerciale, non solare** (`businessDay.js`): taglio
  alle 5 del mattino (configurabile), fuso `Europe/Rome` cablato.

## Sicurezza

- Il ruolo vive nei **custom claims** (`admin` / `bartender` / `staff`;
  senza claim = cliente) e si confronta SOLO con `src/lib/ruoli.js` — un
  test boccia i confronti diretti. Le regole Firestore guardano il claim.
- `orders` è leggibile anche senza login: il cliente anonimo segue il suo
  ordine e **l'id fa da capability token**. Le scritture invece passano
  dai ruoli.
- I claim si assegnano solo dalla callable `staffAdmin` (o
  `scripts/set-role.js`); il token dura un'ora, e la UI ne forza il
  rinnovo in sottofondo per non lavorare con un ruolo vecchio.
- **App Check** (reCAPTCHA v3) è attivo in produzione: quando il gettone
  non arriva, Firestore risponde «Missing or insufficient permissions» a
  TUTTO, anche alle collection pubbliche — incidente vero, documentato in
  `scripts/appcheck.js` e `scripts/recaptcha-domini.js`.

## Il flusso di un conto, in breve

bozza (locale) → conferma = **comanda** con progressivo → stati di
lavorazione (`ricevuto → in preparazione → pronto → ritirato/servito`,
con `pagato` e `annullato` a parte) → magazzino scalato a **«pronto»**,
dove il drink è fatto (senza stati di servizio, alla riscossione) →
pagamento (contanti/carta a mano, SumUp via Functions,
acconti, gruppi anche alla romana) → chiusura, e il conto sparisce
subito dalla coda. Aumenti su un conto in corso confluiscono nella
comanda giusta senza riaprire quelle servite.

## Cosa non fare (il riassunto dei divieti architetturali)

1. `await` su una scrittura Firestore prima di mostrare l'esito.
2. Letture al server nel percorso di un gesto (si precarica, si ascolta).
3. Ricalcolare una ricetta su un drink già fatto.
4. Confronti di ruolo fuori da `ruoli.js`.
5. Quantità che non siano in unità base (ml, g, pz).
6. Colori fuori dai token del tema (vedi [DESIGN.md](../DESIGN.md)).
7. Stato che deve sopravvivere dentro un updater React.
8. Toccare la produzione senza via libera esplicito.
