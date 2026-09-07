# Cosa è cambiato

## 1.5.7-beta

### Per chi sta al banco

- **Quando la stampante smette di rispondere, l'app se ne accorge e lo dice.**
  Il 5 settembre la stampante ha smesso di stampare tutto — comande,
  scontrini, perfino le ristampe di chiusure vecchie — e il pallino in alto è
  rimasto verde tutta la sera. Il motivo: l'app chiedeva al programma della
  stampante se il collegamento era vivo, e quello rispondeva di sì anche
  mentre stava solo provando a riconnettersi. Adesso è la stampante a essere
  interrogata direttamente, ogni dieci secondi: se smette di rispondere il
  collegamento viene buttato — così la stampa dopo lo rifà da capo invece di
  parlare a vuoto — e arriva un avviso. Carta finita, coperchio aperto e
  stampante fuori linea si vedono allo stesso modo, senza aspettare che sia
  una stampa a scoprirlo.

- **Prima di stampare si controlla il collegamento, e se non va si rifà.**
  È il caso della chiusura di cassa: fra l'ultimo scontrino e la chiusura
  passano ore, ed è nelle pause che il collegamento con la stampante muore
  senza che nessuno lo sappia. Adesso, prima di ogni stampa, l'app guarda
  cosa ha risposto la stampante all'ultimo controllo: se ha smesso di
  rispondere — o se dall'ultima risposta sono passati più di due minuti — il
  collegamento viene rifatto da zero prima di partire, la stessa cosa che fa
  il tasto «Test stampa». Durante il servizio, con le comande una dietro
  l'altra, non cambia niente.

- **Il pallino della stampante adesso vuol dire qualcosa.** Prima era verde
  perché il collegamento era riuscito una volta, all'inizio della serata.
  Adesso è verde perché la stampante ha risposto, e diventa rosso col motivo
  quando c'è un guaio.

- **Il magazzino va sotto zero, invece di fermarsi a zero.** Prima, quando un
  prodotto arrivava a zero, quello che continuava a uscire non veniva più
  scalato: la giacenza restava a zero come un prodotto finito per bene, e non
  c'era modo di accorgersi che si stava versando da bottiglie mai caricate.
  Adesso la giacenza scende in negativo e il meno si legge sulla card. Quel
  numero dice quanto è uscito senza risultare, e da lì si va a cercare la
  consegna che nessuno ha registrato o l'inventario da rifare. Caricando la
  merce il conto riparte da zero: sei bottiglie consegnate restano sei, il
  meno di prima non se ne mangia una.

- **Togliendo un drink da una comanda già preparata, gli ingredienti tornano
  in magazzino.** Prima il movimento diceva «carico» ma la giacenza non si
  muoveva, e il magazzino restava indietro di un drink.

- **Nella ricerca dei prodotti c'è il tasto per cancellare.** Si svuota il
  campo con un tocco, senza tenere premuta la cancellazione, e la scrittura
  resta pronta per cercare un altro prodotto.

- **I prodotti fuori menù si riconoscono da lontano.** Prima la card cambiava
  solo di trasparenza, e di sera in una griglia piena si distingueva a fatica:
  adesso ha il fondo scuro e la scritta bianca. Vale nella gestione del menù,
  dove serve capire a colpo d'occhio cosa c'è e cosa no.

- **Nello scadenzario il «reso» si chiama nota di credito, e scala.**
  È la dicitura giusta, e dice la cosa giusta: una nota di credito non vuol
  dire che è tornata della merce — spesso è solo un prezzo sbagliato su una
  fattura, magari già pagata. Adesso il suo importo **si sottrae** dai
  totali invece di sommarsi: dal «Da pagare» in testa, dal totale di quel
  fornitore e dal Riepilogo dei soldi che escono. Sulla riga si legge in
  verde e col meno davanti — `− 120,00 €` — e il tasto dice «da scalare»
  invece di «da pagare», perché una nota di credito non si paga: la si
  scala da quello che si deve. I documenti registrati prima, quelli scritti
  «Reso», continuano a valere e scalano allo stesso modo: non c'è niente da
  ribattere.

- **I documenti dello scadenzario si possono correggere.** Prima, per
  cambiare una cifra sbagliata, bisognava cancellare il documento e
  rifarlo — e con la cancellazione se ne andavano i prodotti, l'allegato e
  l'ordine collegato. Adesso c'è la matita sulla riga: si correggono
  fornitore, numero, data, tipo, importo e note, e tutto il resto resta
  dov'è. Anche su un documento già pagato, che è il caso in cui serve di
  più. Ogni correzione resta scritta sotto il documento — cosa è cambiato,
  da quanto a quanto, e se era già pagato — così a fine mese si sa perché
  una cifra non è più quella. Il fornitore di un documento collegato a un
  ordine si cambia solo dopo averlo scollegato.

- **Il conto appena incassato non si vede più sparire dalla coda.**
  Chiudendo un conto si tornava alla coda ordini e per un attimo il conto era
  ancora lì, poi spariva da solo: abbastanza per chiedersi se l'incasso
  fosse andato. Adesso quando si torna alla coda il conto è già andato via,
  anche senza rete. Vale allo stesso modo per l'annullo, per il ripristino di
  un conto chiuso o annullato e per l'incasso di un tavolo intero, dove i
  conti del gruppo escono dalla coda tutti insieme.

- **Quando una stampa non esce, adesso lo dice.** Prima l'app dava per
  fatto il foglio appena lo mandava alla stampante: se poi la carta non
  usciva — rotolo finito, coperchio aperto, stampante fuori linea — non lo
  sapeva nessuno. Adesso l'apparecchio risponde, e quella risposta diventa
  un avviso che resta anche nella campanella: dice **cosa** non è uscito e
  **perché**. Le stampe riuscite non dicono niente, e se lo stesso guasto si
  ripete non arriva una raffica di avvisi uguali.

- **Stampare resta immediato.** L'avviso arriva dopo, per conto suo:
  chiudere cassa, mandare una comanda o battere uno scontrino non aspetta la
  stampante nemmeno un istante, con o senza rete. E non parte nessun secondo
  foglio da solo — a ristampare, quando serve, si va col tasto della
  ristampa.

- **C'è il registro delle stampe.** In **Impostazioni → Stampante** ci sono
  le ultime stampe di questo dispositivo: cosa era, a che ora, se è uscita e,
  quando non è uscita, **perché**. Ogni stampa compare subito come mandata e
  la riga si aggiorna quando la stampante risponde; se quella non risponde
  mai, la riga resta «in attesa di risposta» invece di inventarsi un esito.
  Sotto c'è anche la coda — cosa sta uscendo adesso e quanto c'è in attesa.
  Serve la mattina dopo, quando ci si chiede se la chiusura di ieri sera è
  uscita davvero: prima l'unica traccia era un avviso che spariva dopo otto
  secondi.

## 1.5.6-beta

### Per chi sta al banco

- **La striscia colorata delle tile non si spegne più da sola.** Il bordo
  sinistro della card di un prodotto — quello che dice colore, categoria o
  scorte — poteva tornare grigio quando la griglia si ridisegnava, e restare
  così finché non si cambiava categoria. Adesso il colore lo tiene.

- **La maniglia per spostare le card prende sempre.** Entrando e uscendo da
  «organizza» — sia nella griglia dei prodotti sia nella lista del conto — il
  trascinamento poteva smettere di rispondere finché non si riapriva la
  schermata.

- **Il giro che si fa sempre si salva come modello.** Sopra la tabella del
  nuovo ordine c'è la riga dei **modelli d'ordine**: mentre si compone si
  tocca **«Salva le N righe come modello»**, gli si dà un nome, e da lì in poi
  con **«Usa il modello»** si ritrovano gli stessi prodotti, dagli stessi
  fornitori, con le stesse quantità. Un modello si può **rinominare** e
  **eliminare**, e salvarne uno con un nome già usato aggiorna quello che
  c'era.

- **Il modello non si porta dietro i prezzi.** Conserva cosa ordinare, a chi e
  quanto: il prezzo è sempre quello del **listino di quel fornitore**, com'è
  in questo momento. Così un modello di due mesi fa non fa partire un ordine a
  cifre vecchie.

- **Modello e precompilazione lavorano insieme.** La precompilazione spunta
  quello che **sta finendo adesso**; il modello aggiunge il **giro che si fa
  sempre**. Applicandone uno non si perde niente di quello che era già
  spuntato.

- **E se qualcosa non c'è più, si legge.** Applicando un modello compare
  l'elenco di **cosa non è stato ripreso e perché**: un prodotto tolto dal
  magazzino non si riprende, uno uscito dal listino di quel fornitore si
  riprende ma senza il suo prezzo, un fornitore cancellato lascia la riga da
  riassegnare.

- **Un ordine già fatto si può conservare com'è.** Nella Lista ordini, aprendo
  un ordine, in fondo c'è **«Salva come modello»**: riprende prodotti,
  fornitore e quantità ordinate.

- **Gli ordini adesso sono due schermate: «Nuovo ordine» e «Lista ordini».**
  La prima è quella di sempre, dove si compone. La seconda è **lo storico di
  tutti gli ordini fatti**, con in alto i **filtri per stato** — bozze,
  richiesti, consegnati, da pagare, pagati, chiusi — e il numero su ogni
  filtro. Prima lo storico stava in fondo alla schermata di composizione: per
  guardare un ordine di ieri bisognava scorrere sotto tutto il catalogo.

- **Un ordine si può salvare in bozza.** Nel riepilogo, accanto a «Crea
  l'ordine», c'è **«Salva in bozza»**: l'ordine resta lì, si riprende dalla
  Lista ordini e **non tocca niente** — i prodotti non passano in
  assortimento e la cifra non entra nei soldi che escono del mese. Serve
  perché comporre venti righe è un lavoro che si interrompe, e prima le
  alternative erano ricominciare da capo o confermare un ordine solo per non
  perderlo. Quando serve, dalla Lista ordini si tocca **«Manda l'ordine»** e
  da lì in poi vale come tutti gli altri.

- **Quando la merce arriva si scrive quanto è arrivato davvero.** Nella
  finestra della consegna, accanto al prezzo, c'è il campo dei **pezzi
  ricevuti**: parte con quelli che erano stati chiesti, e **in magazzino
  entra quello che si scrive lì**. Se di sei casse ne arrivano quattro, si
  caricano quattro — e **l'ordine continua a ricordare che ne erano state
  chieste sei**, che è quello che serve per non pagarne sei in fattura.

- **Ordinato, ricevuto e fatturato, uno accanto all'altro.** Aprendo un
  ordine si vede una tabella con le **tre colonne** e la **differenza di
  prezzo** fra quanto costava quando l'ordine è partito e quanto costa sul
  documento, col segno. Sotto ogni riga che non torna c'è scritto **cosa non
  torna**: arrivato meno del richiesto, non è sul documento, prezzo diverso.

- **E il prezzo del documento si porta sul listino in un gesto.** Dove c'è
  uno scarto compare **«Allinea il listino al documento»**: da lì in poi
  quello è il prezzo di quel fornitore, e la variazione resta nello **storico
  dei prezzi**. Senza, lo stesso scarto ricomparirebbe al prossimo ordine.

- **Il documento di un ordine: si associa, si genera, oppure non c'è.**
  Dentro l'ordine si può **collegare un documento** già scritto nello
  Scadenzario, oppure **generarlo dall'ordine** coi prezzi dell'ordine — e in
  quel caso porta il segno **«Generata dall'ordine»**, così non si confonde
  con la fattura vera del fornitore, che si allega quando arriva. Quando non
  c'è nessuna carta — il contante al piccolo fornitore, il contrassegno alla
  consegna — c'è **«Pagato senza documento»**: crea comunque la riga nello
  Scadenzario, tipo **«Nessun documento»**, e la segna pagata. Così quei
  soldi compaiono nel totale del mese come tutti gli altri.

- **«Pagato» si scrive sul documento, non sull'ordine.** Il tasto «Pagato»
  che stava sull'ordine non c'è più: sulla riga dell'ordine si vede il chip
  **«da pagare» / «pagato»** del suo documento, e toccarlo scrive lì — nello
  stesso posto da cui lo Scadenzario fa il totale «Da pagare». Prima erano
  due segni diversi per la stessa cosa, e a fine mese potevano non tornare.
  Un ordine consegnato senza documento lo dice a chiare lettere.

- **«Chiudi» c'è, ma solo quando i conti tornano.** Un ordine si può chiudere
  quando **ordinato, ricevuto e fatturato tornano**: finché non tornano il
  tasto è spento e dice perché. Chiuso **non vuol dire pagato** — si può aver
  pagato in anticipo, e si può aver ricevuto tutto senza aver ancora pagato.

- **Ogni ordine tiene il suo diario.** In fondo al dettaglio c'è **«Cosa è
  successo»**: quando è stato creato e mandato, cosa è stato tolto, quali
  quantità e quali prezzi sono cambiati all'arrivo, quando è stato collegato
  un documento. Un ordine che cambia dopo essere partito, senza diario,
  diventa un foglio che non corrisponde più a niente.

- **Chi vende a cartoni adesso si ordina a cartoni.** Sul listino di un
  fornitore c'è **«Pezzi per collo»**: si compila solo dove quel fornitore
  vende a casse o a cartoni — le Bjorne da FONT vanno a 24 — e da lì in poi il
  prezzo che si scrive è quello del **collo intero**, cioè la cifra che
  compare sulla sua fattura. Il **prezzo del singolo pezzo si calcola da sé**
  e si legge accanto: è l'unico modo di confrontare due fornitori che vendono
  in confezioni diverse, e dice per esempio che la Bjorne a cassa costa meno
  che a bottiglia. Nel nuovo ordine la riga chiede **colli** invece di pezzi e
  mostra quante bottiglie ne arrivano; in magazzino entrano sempre **pezzi**.
  Prima l'app moltiplicava i pezzi voluti per il prezzo del cartone: otto
  Bjorne risultavano **200 euro** invece di **8,35**. Per i prodotti che si
  comprano a pezzo — quasi tutti — **non cambia niente**: stessa riga, stesso
  prezzo, e la parola «collo» non compare.

- **E si può scrivere il listino come lo scrive il fornitore.** Accanto al
  prezzo c'è **«Prezzo espresso per»**: il **collo** (la cifra che fattura, ed
  è il caso normale), il **pezzo** quando vende a cartoni ma quota la
  bottiglia, oppure **litri, centilitri, chili o grammi** quando prezza il
  contenuto — un vino a 9 €/litro in bottiglie da 75 cl fa 6,75 a bottiglia, e
  il cartone da 6 costa 40,50. **Il prezzo della bottiglia si vede sempre
  accanto**, mentre si scrive: è il numero che si riconosce a colpo d'occhio,
  e un gin che risulta costare 0,80 € si nota subito. Se il prodotto non dice
  quanto contiene, l'app **non inventa un prezzo**: scrive che cosa manca
  nella sua scheda.

- **Nel nuovo ordine basta toccare la riga.** Toccando una riga della tabella
  il prodotto **entra** nell'ordine; toccandola di nuovo **esce**. Vale tutta
  la riga, non solo la casella: componendo un ordine si passano in rassegna
  decine di prodotti, e centrare un quadratino ogni volta è una fatica
  inutile. I campi che si scrivono — pezzi, totale, tendina del fornitore — e
  il tasto che apre la scheda restano esclusi, così scriverci dentro non
  toglie quello che si è appena aggiunto. Le righe già nell'ordine si
  riconoscono dal fondo colorato.

- **L'ordine si conferma un fornitore per volta, e ognuno diventa un ordine
  suo.** Finita la composizione, **«Rivedi e conferma»** porta a una schermata
  di **riepilogo**: una riga per ogni fornitore da cui si sta ordinando, e
  toccando il nome si apre **la tabella dei suoi prodotti** — pezzi, prezzo
  del pezzo e totale — da rivedere prima di mandare. Da lì si può ancora
  **togliere** quello che non serve più. Ogni fornitore ha il suo tasto
  **«Crea l'ordine»**: confermato, sulla sua riga compare **«Ordinato»** e le
  sue righe escono dalla composizione, così non si ordina due volte. Gli altri
  fornitori restano lì, da confermare quando si vuole. Il gesto **non aspetta
  la rete**: l'ordine compare subito anche con la cassa offline.

- **«In assortimento» adesso vuol dire «ordinato, in attesa che arrivi».**
  Confermato un ordine, i suoi prodotti passano **in assortimento** in
  magazzino: è il modo per vedere a colpo d'occhio cosa sta arrivando. Il
  prodotto **si ricorda com'era prima** — in linea o premium — e ci torna
  quando la merce arriva, anche se le scorte sono ancora basse: che siano
  basse lo dice già la scorta. **Il carico a mano non lo cambia**: se una
  bottiglia si compra di corsa al supermercato mentre l'ordine è in ritardo,
  le scorte salgono ma il prodotto resta in assortimento, perché dal fornitore
  ne sta arrivando dell'altra. Ci passano solo i prodotti **in linea o
  premium**: un fuori linea no.

- **Un prodotto si può togliere da un ordine già mandato.** Nello storico ogni
  riga dell'ordine ha adesso il suo **✕**: si toglie quello che non arriverà
  o non serve più, e il prodotto **torna allo stato che aveva prima**. Quello
  che è già stato consegnato non si tocca — la merce è in magazzino, e si
  corregge da lì.

- **Cambiando a mano lo stato di un prodotto che sta in un ordine aperto, l'app
  lo dice.** Compare una domanda che avvisa: cambiando lo stato, il prodotto
  **viene tolto da quell'ordine**. È per non ritrovarsi merce ordinata di cui
  nessuno sa più niente. Il resto del magazzino non cambia: stessi comandi,
  stesse colonne, stessi filtri.

- **«Nuovo ordine» è una tabella sola, e l'ordine si compone di fianco.** In
  **Fornitori → Ordini** i prodotti stanno in un elenco unico: su ogni riga il
  nome, **com'è messa la scorta** (in scorta, in esaurimento, esaurito), il
  **fornitore** in una tendina, il **prezzo di un pezzo** preso dal suo listino,
  i **pezzi** e il **totale**, che si può correggere lì dove si scrive — se il
  fornitore ha fatto un altro prezzo per quel lotto, comanda la cifra scritta a
  mano. Accanto alla tabella, e non più in fondo alla pagina, c'è **l'ordine che
  si sta componendo, già diviso per fornitore**: si vede mentre si sceglie cosa
  ordinare, senza scorrere avanti e indietro. **All'apertura è già spuntato
  quello che manca** — esaurito o sotto la soglia di riordino — così il giro del
  magazzino è già fatto; **quello che è fuori linea non si propone da solo**, ma
  resta in elenco e si può ordinare a mano, che è il modo in cui rientra.
  Scrivere una quantità **seleziona la riga**: non serve anche la spunta. Le
  **intestazioni ordinano** l'elenco per nome, disponibilità, prezzo di listino
  e fornitore, e **restano in alto** mentre si scorre; le righe **si caricano
  scorrendo**, a blocchi, perché il magazzino è di quasi quattrocento prodotti e
  lo stesso prodotto compare **una volta per fornitore** che lo vende — il
  doppione non è un errore, serve a confrontare due prezzi. Toccando **▸** la
  riga **si apre** e dice com'è messo quel prodotto — in linea, premium, in
  assortimento, fuori linea — quante scorte restano, su quanti listini sta, chi
  è stato l'ultimo fornitore e chi fa il prezzo più basso, con gli stessi campi
  da compilare.

- **Il listino di un fornitore si compila dalla sua scheda.** In **Fornitori →
  Gestione fornitori** ogni fornitore ha il tasto **«📋 Listino»**: si cerca un
  prodotto del magazzino, lo si associa a quel fornitore e gli si scrive il
  **prezzo di un pezzo**. È il prezzo che comparirà quando si compila un
  ordine. Un fornitore appena creato apre il suo listino da solo, che è il
  lavoro che viene subito dopo. **Se il prodotto in magazzino non c'è, si crea
  da lì**: entra col nome e il prezzo, come quelli che arrivano con una
  consegna, e resta segnato come **scheda da completare** — categoria,
  contenuto di un pezzo e soglia di riordino si mettono dal magazzino. Sulla
  riga si scrivono anche il **codice del fornitore** e la **confezione**, che
  servono a chi riceve l'ordine dall'altra parte. **Il magazzino non cambia**:
  la scheda del prodotto resta com'era, tendina del fornitore compresa.

- **I prezzi che cambiano restano scritti.** Il listino teneva un prezzo solo,
  e ogni aggiornamento cancellava quello di prima. Adesso ogni variazione
  resta registrata con la sua data e con **da dove viene** — compilato a mano,
  corretto alla consegna, allineato da una fattura — e si legge aprendo la
  riga del prodotto nel listino. Serve a rispondere a «quanto è aumentato il
  Campari da gennaio»: un prezzo battuto a mano e uno preso da una fattura non
  pesano uguale, e restano distinti.

- **Le spese che non sono merce hanno un posto: Fornitori → «Altre spese».**
  Tavoli, sgabelli, una tenda, i bicchieri di plastica: quello che esce dal
  conto e non entra in magazzino si scrive lì, con le colonne che si usano già
  sul foglio — articolo, quantità, prezzo, dove si compra e note. **Ogni voce
  dice se è già stata comprata**: quelle comprate pesano sul mese, le altre
  restano un promemoria, così una cosa che si vorrebbe comprare non fa
  scendere l'utile. Una voce si riapre e si corregge — spesso il prezzo si sa
  solo il giorno che si compra — e se è segnata comprata senza prezzo porta
  scritto **«senza prezzo»**, col filtro in testa che tiene solo quelle.

- **Il «Riepilogo» dice quanto è uscito, mese per mese.** Quarta voce di
  Fornitori: per ogni mese la **merce** (dalle fatture dei fornitori), le
  **altre spese** e il totale. Sotto, quello che resta aperto: quanto di quel
  mese è **ancora da pagare** e quanta merce è arrivata **senza fattura**.
  Queste due righe non entrano nel totale, e c'è scritto perché: il da pagare
  è già contato nella merce, e la merce senza documento entrerà nel mese
  quando la fattura arriva. **Il totale è più basso di quello del foglio
  mensile** — lì la riga «spese» comprende anche la merce, qui la merce si
  conta una volta sola — e anche questo sta scritto in schermata, per non
  doverselo chiedere al primo confronto.

- **La fattura si porta dietro il documento vero.** Nello **Scadenzario**,
  sotto ogni documento, c'è **«Allega foto o PDF»**: si fotografa la fattura
  col telefono, o si sceglie il PDF scaricato dal fornitore, e resta lì. Da
  quella riga si **apre**, si **sostituisce** e si **toglie**. Le foto
  vengono **ridotte prima di partire** — una fattura si deve leggere, non
  stampare — così il caricamento regge anche con la connessione del
  magazzino. Vanno bene JPG, PNG, WebP e PDF **fino a 8 MB**, e il limite sta
  scritto sul tasto: se un file non va, l'app lo dice subito e spiega cosa
  fare, senza toccare il documento. **Quali fatture hanno la carta e quali no
  si vede senza cercarlo**: chi non ce l'ha porta scritto «senza allegato», e
  il filtro **«Senza allegato»** in testa alla pagina tiene solo quelli, come
  già fa «Senza ordine». Eliminando una fattura se ne va anche il suo file.

- **Un prodotto che arriva e in magazzino non c'era adesso viene creato.**
  Prima quella riga passava a «consegnato» e basta: la merce non entrava in
  magazzino e non risultava da nessuna parte, mentre la consegna sembrava
  andata a buon fine. Adesso il prodotto **nasce con la merce dentro**, col
  nome e il prezzo dell'ordine, e resta segnato come **scheda da
  completare**: nella lista porta una matita accanto al nome, e aperto dice
  cosa manca — la categoria, quanto contiene un pezzo, la soglia di
  riordino. L'elenco di questi prodotti sta in **Magazzino →
  Macro-categorie**, accanto alle categorie senza macro: finché manca la
  categoria, quello che si spende per quel prodotto resta fuori dai conti
  degli acquisti. Il segno sparisce quando gli si dà una categoria.

- **La consegna si può caricare in parte, o tutta in un colpo.** Nella
  finestra «Merce arrivata» ogni riga ha la sua spunta: si toglie a quello
  che il fornitore non ha portato, e quella riga resta in attesa fino alla
  prossima consegna. Si parte con **tutto spuntato**, e il tasto dice sempre
  quante righe sta per caricare — **«Carica tutti»** oppure «Carica i
  selezionati». Le righe già consegnate non tornano più in quella finestra.

- **L'assortimento si può preparare mentre la merce viaggia.** Quando si
  compone l'ordine, sui prodotti che non sono in assortimento c'è la casella
  **«In assortimento quando arriva»**: il cambio si applica al carico, cioè
  quando la merce è davvero arrivata.

- **Ogni fornitore ha la sua fattura, dentro lo stesso ordine.** Un ordine
  può contenere più fornitori, e ognuno rilascia il suo documento: adesso la
  fattura si collega **alla parte dell'ordine di quel fornitore**, non
  all'ordine intero. Si fa dai due lati — negli **Ordini**, sulla riga del
  fornitore, e nello **Scadenzario**, sotto il documento — e da tutti e due
  si vede a cosa è collegata l'altra. Si può collegare **solo un documento
  dello stesso fornitore**, e gli altri non compaiono nemmeno in elenco.
  Una parte d'ordine ha al massimo una fattura, e una fattura sta su una
  parte d'ordine sola: per cambiarla si stacca prima.
  **Le due cose che a fine mese fanno tornare i conti si vedono senza
  cercarle**: negli Ordini una consegna arrivata senza documento porta
  scritto «manca la fattura», e in testa allo storico c'è quante sono; nello
  Scadenzario un documento senza ordine porta «senza ordine», e il filtro
  **«Senza ordine»** tiene solo quelli.
  Riprendere le righe da un ordine, nello Scadenzario, adesso **collega
  anche il documento**: è lo stesso gesto.

- **Dalla fattura al magazzino: «Aggiungi prodotti».** Nello **Scadenzario**,
  sotto ogni documento, c'è un tasto che apre l'elenco dei prodotti: si cerca
  per nome, si scrive quanti pezzi e a che prezzo, e le righe restano sulla
  fattura. **Il carico a magazzino è una scelta a parte**, che si può anche
  non fare — la merce può essere già stata caricata in altro modo — e il
  tasto dice sempre quale delle due si sta facendo. Dove il prezzo scritto è
  **diverso da quello in archivio** compare la domanda, col vecchio e il
  nuovo affiancati: se non si risponde **non cambia niente**. Il prezzo di
  vendita del menù non si tocca mai. Se di quel fornitore c'è un ordine già
  consegnato, le sue righe si possono **riprendere** invece di ribatterle, e
  in quel caso il carico parte spento: quella merce è già entrata.

- **Lo stesso prodotto si può comprare da più fornitori.** Negli **Ordini**
  c'è un **campo di ricerca**: si cerca il prodotto e lo si aggiunge senza
  dover scegliere prima il fornitore. Nell'elenco ogni prodotto compare una
  volta per fornitore che lo vende, con **il prezzo di quel fornitore**, una
  **striscia del suo colore** e le scritte «ultimo acquisto» e «più
  economico» per confrontare a colpo d'occhio. Scegliendo un fornitore in
  alto si vede solo il suo catalogo. **Il magazzino non cambia**: il Campari
  resta un prodotto solo, con una giacenza sola.

- **Un ordine può contenere prodotti di più fornitori.** Il fornitore si
  sceglie sulla riga dell'ordine, e quello già usato per lo stesso prodotto
  non si può riscegliere. Nello **storico**, l'ordine si legge diviso per
  fornitore: email, stampa e copia riguardano **solo le righe di quel
  fornitore**.

- **Richiesto, consegnato, pagato.** Ogni fornitore dell'ordine ha il suo
  passo. **La merce entra in magazzino quando si segna «Consegnato»**, non
  prima: alla consegna si controllano i prezzi come sono sul documento, e
  quello che si scrive lì diventa il prezzo di quel fornitore e il costo del
  prodotto. Il fornitore invece non si cambia più: da lui la merce è stata
  comprata. «Pagato» si può mettere solo su una consegna già arrivata.

- **Ogni fornitore ha un colore.** Si sceglie quando lo si crea — ne viene
  proposto uno — e si cambia dall'anagrafica toccando il pallino accanto al
  nome. È il colore che distingue i doppioni nella lista degli ordini.

- **Il fornitore si scrive dalla scheda del prodotto, come prima**, ma
  adesso finisce nel listino di quel fornitore col prezzo indicato: gli
  altri fornitori dello stesso prodotto restano dove sono. **Niente si
  perde**: i prodotti che avevano già un fornitore continuano a mostrarlo.

- **Via il collegamento col registratore di cassa SumUp Cassa Pro.** Doveva
  ricopiare ogni vendita dentro il registratore di SumUp, ma non è mai stato
  acceso: nessuno l'ha mai visto funzionare e al banco non cambia niente.
  **Il POS SumUp con cui si incassa non c'entra ed è rimasto dov'era.**
  Sparisce anche il riquadro «Sync catalogo» dal gestionale, che serviva solo
  a quello. In questa stessa versione, mai pubblicata, c'erano due voci che
  irrobustivano quel collegamento: sono state tolte da qui perché parlavano di
  codice che adesso non esiste più.

- **Un conto non può più nascere firmato da qualcun altro.** Chi apre un
  conto dal telefono senza essere entrato nel gestionale adesso può scrivere
  soltanto quello che serve a ordinare: niente firma col nome di chi sta al
  banco, niente conto che nasce già pagato, già scontato o già servito.
  Ordinare dal menù funziona esattamente come prima.
  **Ha effetto quando le regole Firestore vengono pubblicate**, cioè col
  rilascio.

- **E non si scarica più l'elenco dei conti dal di fuori.** Un conto si legge
  solo conoscendone l'id — che è quello che fa il link del proprio ordine —
  mentre a chiederne tanti insieme sono soltanto il gestionale, il cliente
  registrato sui conti del suo account e il tabellone del menù. Prima quella
  richiesta era aperta a chiunque, e da lì passavano nomi, note e importi dei
  clienti. **Al banco non cambia niente**: coda, storico, statistiche e cassa
  leggono come prima, e anche «I miei ordini» sul telefono del cliente
  continua a mostrare gli stessi conti.
  **Ha effetto quando le regole Firestore vengono pubblicate**, cioè col
  rilascio.

- **I numeri dei conti sono chiusi a chiave.** Il contatore da cui esce il
  «#» di ogni conto adesso può solo salire, di uno per volta, e a spostarlo
  o correggerlo è soltanto chi ha fatto il login al gestionale. Al banco non
  cambia niente: il numero compare nell'istante in cui si tocca «Conferma»,
  come prima, e anche l'ordine che arriva dal telefono del cliente continua
  a prendere il suo. Serviva perché un contatore che qualcuno può riportare
  indietro vuol dire due conti con lo stesso numero nella stessa serata —
  uno stampato e in mano al cliente, l'altro a schermo.
  **Ha effetto quando le regole Firestore vengono pubblicate**, cioè col
  rilascio: le pubblica la pipeline insieme all'app, non serve nessun passo
  a mano.

- **Le fatture ai clienti diventano una funzione premium.** La sezione
  **«📄 Fatture»** non è più nel menu, e nella schermata di pagamento non
  c'è più il tasto **«📧 Invia fattura»**: la fattura di cortesia non fa
  parte di questa installazione. Restano al loro posto «🎟 Codice Lotteria»
  e «🖨 Preconto». **Le fatture già emesse non si perdono**: il numero resta
  scritto sul conto e il documento resta salvato — tornano a vedersi se la
  funzione viene attivata.

- **I fornitori hanno una sezione loro.** Nel menu compare **«🏭
  Fornitori»**, e dentro ci sono le tre cose che prima stavano sparse nel
  magazzino: **Gestione fornitori** (l'anagrafica), **Ordini** e
  **Scadenzario**. Il magazzino resta con quello che dice cosa c'è sullo
  scaffale — Prodotti, Categorie, Macro-categorie e Movimenti. La sezione
  nuova **la vede l'admin**: ordini e fatture ai fornitori sono i soldi che
  escono dal locale. Chi lavora al banco continua ad aggiungere un fornitore
  nuovo dalla scheda del prodotto, come ha sempre fatto.

- **La conta di magazzino e le fatture ai fornitori diventano funzioni
  premium.** Nelle impostazioni compare un gruppo nuovo, **«🔒 Funzioni
  premium»**, che dice cosa fa parte di questa installazione e cosa no.
  · Le **fatture ai fornitori** («Scadenzario» nel magazzino) sono
    **incluse**: funzionano come sempre, e adesso c'è un interruttore per
    spegnerle e riaccenderle quando serve.
  · La **conta di magazzino** non è inclusa: la sua sezione non compare più
    nel magazzino, e l'interruttore resta spento. Toccandolo, l'app dice
    perché invece di non fare niente.
  **Niente è andato perso**: le conte già fatte restano dove sono e
  ricompaiono se la funzione viene attivata.

- **Nel conto i tasti in fondo non spariscono più.** Con lo zoom dell'app
  alto, o su una finestra bassa, la pila di tasti sotto il totale usciva dal
  riquadro: se ne andava prima «Annulla ordine», poi «Stato servizio», poi
  anche «Invia comanda» e «Pagamento» — e non c'era niente da scorrere per
  andarli a prendere. Adesso **«Invia comanda» e «Pagamento» restano sempre
  lì**, alla stessa altezza, con qualunque finestra e qualunque zoom; quello
  che sta sopra — la testata della colonna, i totali, gli altri due tasti —
  si stringe fino a una riga comoda per il dito e da lì in poi **scorre**,
  invece di sparire. Sul telefono e sul tablet stretto il pannello del conto
  è alto davvero quanto dice la maniglia anche a zoom alto, e i tre tasti in
  fondo restano interi.

- **Le finestrelle di conferma non escono più dallo schermo.** Con lo zoom
  dell'app alto, o su una finestra bassa, una finestrella come quella dello
  sconto veniva tagliata sopra e sotto: sparivano il titolo e il tasto che
  conferma, e non c'era modo di arrivarci. Adesso la finestrella **non è mai
  più alta dello schermo** e, quando serve, scorre dentro di sé. Vale per
  tutte le finestrelle dell'app — sconto, buono, ripristino conto, apertura
  e chiusura cassa, prodotto libero.

- **La comanda dice quale comanda è.** La fascia nera in cima diceva
  **«DIRETTO»** su ogni ticket — anche sul secondo e sul terzo invio dello
  stesso tavolo, che «diretto» non erano affatto: era una parola presa dal
  registratore di cassa da cui questa stampa è stata copiata, dove indica
  la prima infornata di un ordine mandato in cucina a portate. Adesso c'è
  scritto **«COMANDA 2 - ORDINE 28»**: quale comanda è e di quale conto,
  con gli stessi numeri che si leggono a schermo. L'ora è scesa sotto, nel
  nero, perché accanto non ci stava. La fascia si può ancora spegnere; la
  casella per scriverci dentro non serve più, e chi ci aveva messo una sua
  parola non trova niente di rotto.

- **Lo scontrino dice chi lo stampa, e non ripete il numero.** Sotto al
  numero uscivano tre righe che non dicevano il vero: **«Utente A»** —
  scritto a mano, uguale su ogni scontrino di ogni terminale — il numero
  del conto ripetuto come **«Vendita - Comanda #28»** (28 è il numero del
  conto: le sue comande sono la 1 e la 2), e **«2 clientei»** quando i
  coperti erano più di uno. Adesso la prima riga porta il **nome di chi sta
  stampando**, cioè di chi è collegato a quel terminale — se lo scontrino
  si ristampa, porta il nome di chi lo ristampa — e se non si sa chi è, la
  riga non esce affatto. La seconda dice **il tavolo, o il nome del
  cliente**, e quando non c'è né l'uno né l'altro sparisce: il numero è già
  in cima. E i coperti sono **«2 clienti»**. Vale anche per la ricevuta
  d'acconto. Le tre righe si accendono e si spengono come prima, in
  Impostazioni → Stampante.

- **L'app si apre più in fretta, e la stampa non aspetta più il logo.** Il
  logo pesava mezzo megabyte ed era la prima cosa che ogni scontrino doveva
  caricare prima di uscire; adesso ne pesa otto, con la stessa resa sulla
  carta e a schermo. Tolto anche un secondo file da tre quarti di megabyte
  che non usava nessuno: in tutto un megabyte e un quarto in meno da
  scaricare sui tablet del locale.

- **Una stampa che si blocca non si tiene più il conto.** La sera del 24
  agosto, sulla versione di allora, riscuotendo non usciva lo scontrino e
  «buona parte delle stampe non sono uscite»: la stampa restava in attesa
  del logo, non finiva mai, e da lì in poi **quel conto non stampava più**
  — nemmeno riaprendolo, nemmeno dalla coda — senza che comparisse un
  errore. Dietro a quella stampa ferma restavano in fila anche le comande.
  La causa era già stata chiusa con la 1.5.5. Adesso c'è anche la
  protezione generale: **se una stampa non si conclude entro quindici
  secondi si ferma da sola**, a schermo compare che lo scontrino non è
  uscito, e il conto **torna stampabile** — dal tasto del conto, dalla coda
  o riscuotendo di nuovo. La stampante ricomincia a lavorare subito, e se
  la stampa lenta arriva in ritardo **non esce una seconda copia**.

- **Il logo non si aspetta più dalla rete.** Era l'unica immagine che l'app
  andava a riprendere ogni volta, ed è quella che sta in cima a scontrino e
  preconto, negli avvisi e nelle notifiche: adesso **è tenuta da parte come
  il resto dell'app**, quindi la stampa non dipende più da come va la
  connessione in quel momento. Il logo cambiato dalle impostazioni continua
  a cambiare come prima.

- **Una riga con i dati incompleti non blocca più il ticket.** Se su un
  conto vecchio o su una riga arrivata a metà manca il nome del prodotto,
  la comanda esce lo stesso, con scritto **«(SENZA NOME)»** al posto del
  prodotto; se manca il prezzo, sullo scontrino si legge **0.00€**. Prima
  quel ticket non usciva affatto e l'app continuava a riprovarci in
  silenzio — al banco era un giro di lavoro che non arrivava mai. Sullo
  scontrino del cliente non compaiono più le scritte «undefined» e «NaN€».

## 1.5.5 — 25 agosto 2026

In produzione questa versione porta tutto quello che è passato dalle prove
delle beta 1.5.2, 1.5.3 e 1.5.4, elencate qui sotto: dall'ultima versione
uscita — la 1.5.1 del 19 agosto — è cambiato tutto quello che si legge fino
alla sezione «1.5.1».


### Per chi gestisce

- **Il tasto «▾ Filtri» non porta più nessun numero.** «Sì ma infatti
  togliamo quel numero. Non serve» (22/08/2026). Accanto alla parola
  «Filtri» c'era una cifra con quanti filtri erano accesi: è stata
  calcolata in quattro modi diversi in due giorni e nessuno diceva quello
  che chi guardava si aspettava — «non mi è chiaro come conta i filtri»,
  «funziona al contrario», «ne ho tre e lui dice zero». Adesso il tasto
  dice «▾ Filtri» e basta, in tutte le viste della coda, e non si colora
  più. **Cosa fanno i filtri non cambia**: quali sono accesi si vede
  aprendo la fila, dove i gettoni accesi si distinguono da soli.

- **Le chiusure di cassa si guardano per serata, per settimana o per
  mese.** «Aggiungi dei filtri alla lista delle chiusure cassa per mostrare
  quelle settimanali o mensili oltre che per data» (22/08/2026). Sopra la
  lista, nella riga della ricerca per data, ci sono tre gettoni: **Serata**
  (com'era), **Settimana**, **Mese**. Una riga di settimana o di mese dice
  il periodo, **quante serate** contiene, la **media a serata** e **quanto
  ha incassato in tutto** — la media perché è quella che rende confrontabili
  due settimane di lunghezza diversa: cinque aperture e tre aperture fanno
  totali diversi per un motivo che non c'entra con com'è andata la sera.
  **Toccando una riga si apre sulle sue serate**, che sono le righe di
  sempre: da lì il riepilogo di cassa e il rendiconto si aprono come prima.
  La **settimana comincia di lunedì**, così venerdì, sabato e domenica
  stanno nella stessa riga; e una serata chiusa all'una di notte resta nella
  settimana del giorno in cui è cominciata. Le settimane e i mesi senza
  chiusure non compaiono. La scelta si ricorda sul tablet che si sta usando.

- **Cercare una data non fa più perdere la vista scelta.** Guardando per
  settimana o per mese, scegliere un giorno **apre il periodo che contiene
  quella serata** e accende la riga della serata lì dentro, invece di
  riportare all'elenco piatto. La frase sopra la lista dice dove guardare:
  «evidenziata nella settimana 17–23 ago».

- **L'aliquota IVA è una sola, quella del locale.** Ce n'erano due senza
  che nessuno lo sapesse: una nelle impostazioni della stampante, salvata
  **nel browser di ogni tablet**, che finiva sullo scontrino; e una nelle
  impostazioni del bar, condivisa, usata da margini e statistiche. Due
  tablet potevano quindi stampare scontrini con aliquote diverse, e l'IVA
  sulla carta poteva non tornare con quella dei conti. Adesso la stampa
  legge **l'aliquota del locale** — quella in *Impostazioni → Prezzi e
  supplementi*, la stessa dei margini — e anche la fattura di cortesia. Il
  campo nel pannello della stampante è sparito, con scritto dove si
  imposta. Se su un tablet era rimasto un valore diverso, **viene
  ignorato**: quel numero non lo legge più nessuno e da lì esce la stessa
  carta di tutti gli altri. Con le due aliquote uguali, lo scontrino è
  identico a prima.

- **Le impostazioni di stampa automatica sono passate in «Cassa e
  giornata».** Stavano sparse: due nel pannello della stampante, una fra i
  pagamenti — «le impostazioni di stampa automatica riguardano la cassa»
  (22/08/2026). Adesso stanno tutte in un riquadro solo, **🖨️ Stampa
  automatica**, subito sotto Pagamenti: quando esce la comanda, quando esce
  lo scontrino, chi stampa le comande prese in sala e la ricevuta d'acconto
  automatica. Il riquadro dice anche **quali valgono solo per il tablet che
  si ha in mano** e quali per tutto il locale. Nella sezione «Stampante»
  restano le cose della macchina — indirizzo, prova di stampa, i dati che
  finiscono sulla carta — con scritto dove sono andate le altre. Niente si
  è spento: gli interruttori sono quelli di prima, cambiati di posto.

- **Le statistiche si aprono sull'elenco delle serate.** «Statistiche»
  adesso ha due voci nel menu: **Per serata** — quella che si apre di suo —
  e **Per periodo**, quella di prima. La prima è la lista delle chiusure di
  cassa, la più recente in cima, con per ogni serata **giorno, orari e
  durata** e tre numeri incolonnati: **incasso, conti, scontrino medio**.
  Così due sabati si confrontano guardandoli, senza aprire niente — e
  toccando una riga si aprono tutte le statistiche di quella serata,
  identiche a prima, con «← Chiusure» in alto per tornare all'elenco. **La
  cassa ancora aperta è la prima riga**, con l'orario che dice «in corso» e
  i numeri di adesso. Prima la serata era una pastiglia con una tendina:
  per confrontare due sere bisognava aprirla, sceglierne una, leggere,
  riaprirla e ricominciare. In «Per periodo» restano le giornate
  (7/10/20/30/60 e Personalizzato); la pastiglia «Ultima chiusura» e la
  tendina delle serate non ci sono più, perché quella è diventata una
  sezione sua.

- **Le chiusure di cassa sono una lista, la stessa del magazzino.** «Anche
  qui nei rendiconti delle chiusure di cassa serve una lista fatta meglio,
  stile quella del magazzino ma con righe più alte» (22/08/2026). Prima
  ogni serata era un riquadro a sé; adesso è un elenco solo, con le righe
  alte come quelle del magazzino e il dettaglio che si apre sotto la riga
  toccata. La riga dice le stesse cose — data, apertura → chiusura, durata,
  incasso — ma **l'incasso si legge da lontano**: è il numero che si cerca
  quando ci si chiede com'è andata ieri sera.
  **La serata in corso si riconosce a colpo d'occhio**, con due segni e non
  uno: la pastiglia verde «in corso» al posto dell'ora di chiusura e la
  striscia accesa a sinistra. E non dichiara più **0,00 €**: l'incasso di
  una serata aperta si sa solo aprendo la riga, e uno zero in una lista di
  soldi si legge come «stasera non è entrato niente». Finché il dato non
  c'è, c'è un trattino.

- **Le chiusure di cassa si cercano per data, e il riquadro è sparito.**
  «Togli il box, lascia solo la lista, e aggiungi un selettore di data per
  cercare una chiusura cassa» (22/08/2026). L'elenco non sta più dentro un
  riquadro: occupa tutta la larghezza, come quello delle statistiche. Il
  titolo «Chiusure di cassa» e la riga di spiegazione sotto non ci sono
  più — il titolo è già nella barra in alto e la spiegazione ripeteva
  quello che ogni riga dice da sé.
  Sopra l'elenco c'è un **campo data**: scegliendo un giorno, la pagina
  scorre fino a quella serata e la riga si accende. **L'elenco non si
  filtra**, quindi le altre serate restano lì da confrontare e non serve
  annullare niente per tornare a vederle tutte. Vale la serata, non il
  giorno sul calendario: una serata aperta il 15 e chiusa all'una e otto si
  cerca al **15**. Nel campo non si possono scegliere date future né
  precedenti alla prima chiusura registrata, e se in quel giorno la cassa
  non ha aperto lo dice: «Nessuna chiusura di cassa registrata per lunedì
  18 agosto».

- **Le righe del magazzino si toccano col dito.** Erano alte quanto la
  scritta che ci sta dentro, e in piedi al banco — con 388 articoli in
  elenco — si finiva per aprire la riga di fianco: «aumenta l'altezza
  anche delle righe della tabella dell'inventario per un touch migliore»
  (22/08/2026). Adesso sono alte quanto un bersaglio pieno, la misura di
  tutti i tasti che si premono di corsa. La riga è più alta, non diversa:
  striscia dell'assortimento, pallino delle scorte, legenda e dettaglio
  che si apre sotto restano dov'erano. **Ed è una misura sola** per tutte
  le liste dell'app — magazzino, chiusure di cassa, statistiche — così le
  tre schermate non prendono strade diverse. Con lo zoom dell'app alzato
  le righe non si gonfiano: restano grandi sotto il dito quanto a zoom
  normale, e se ne vedono altrettante.
- **Sulla comanda le voci sono sempre unite.** Se sul conto le righe erano
  separate — perché si stava dividendo chi paga cosa — al banco uscivano
  quattro righe «1 JEFFERSON» una sotto l'altra invece di una
  «4 JEFFERSON»: «devono essere sempre unite sulla comanda»
  (22/08/2026). Adesso la comanda si conta a colpo d'occhio, e il conto
  resta come lo si è lasciato: separare le righe serve a dividere il conto,
  e su scontrino e schermata di pagamento non cambia niente. **Le note
  restano righe a sé**: «poco ghiaccio» su due dei quattro è lavoro
  diverso, e non si mescola con gli altri due. Il numero dei pezzi in cima
  al ticket è sempre quello giusto. Ne guadagna anche la **ricevuta unica**
  di più comande, che prima poteva perdere per strada una delle due note.

- **«📅 Solo oggi» adesso si vede anche fuori dalla griglia.** Accendendolo
  fra i conti e passando alle comande, la coda restava tagliata dei giorni
  scorsi senza niente a schermo che lo dicesse e senza un tasto per
  rimetterla a posto. Ora il tasto lo si ritrova acceso dov'è acceso, e il
  numero sui filtri lo conta in tutte le viste.

- **Sui temi chiari il testo non sparisce più dentro i riquadri colorati.**
  Nel dettaglio di una comanda i passi già fatti sono verdi, e la scritta
  dentro era verde pallido: «il colore verde del testo non si legge bene
  sullo sfondo verde qui». Adesso il nome del passo e **l'ora sotto**
  prendono il colore del testo normale, su tutti i temi — e l'ora si legge
  anche sul passo in corso, dove il riquadro è dorato e prima era quasi
  invisibile su ogni tema, scuri compresi.
  Cercando lo stesso difetto altrove sono venuti fuori: il **numero dentro
  un riquadro acceso** dell'inventario («scarsi 7», «finiti 3»), che non si
  leggeva su nessun tema; le pastiglie **«in corso»** del registro ore e
  **«chiuso»** dei gruppi, che sparivano sui temi chiari; i **numeri in
  perdita**, rosso pallido su bianco; e la pastiglia **«pagato»**, che
  cambiava colore col tema — su Pico era azzurra come «in preparazione», e
  adesso è ambra ovunque, come lo stato vuole.
  Sui temi scuri, quelli che si usano al banco, non è cambiato in peggio
  niente: ogni riga è stata rimisurata in un browser vero, tema per tema.

- **Nel conto, la maniglia del piede sta più vicina al totale.** Fra la
  maniglia e la riga del Totale c'era più vuoto della riga stessa, e tirando
  su la maniglia per ingrandire i tasti quel vuoto cresceva insieme a loro.
  La presa sotto il dito è rimasta identica: si è stretto solo lo spazio.

- **Dal pannello delle comande non si stampa più lo scontrino del conto.**
  C'era un tasto che, da dentro la finestra delle comande, mandava in stampa
  il riepilogo del cliente: due carte diverse dietro lo stesso vetro, e
  quella sbagliata era la più lunga. Lì si stampano le comande; lo scontrino
  esce riscuotendo, e il riepilogo da mostrare prima di pagare è il
  «Preconto».

- **Lo stato del servizio è passato nella barra in alto del conto**, in
  fondo a destra: «🍹 In preparazione», «🔔 Pronto», «🧾 Da fare». Stava
  nella testata della colonna del conto, schiacciato fra il numero e i
  tastini delle righe; adesso la riga in cima si legge in due metà — a
  sinistra il conto e i soldi (numero, ora, «🟢 Conto aperto» o «💳
  Pagato», chi l'ha aperto), a destra **a che punto è il lavoro**. Le due
  pastiglie non si confondono: fermandocisi sopra ognuna dice di cosa
  parla. **Quando compare e cosa dice non cambiano**: si vede solo sui
  conti in corso, dove il locale segue il servizio, e porta sempre il
  passo **più indietro** fra le comande ancora aperte — quello che manca,
  non quello che è già uscito.
  **Sul telefono**, dove quella riga è stretta, per far posto cedono
  l'**ora di apertura** (si rilegge nella storia del conto, dal ⋯) e la
  **parola** dello stato del conto, che resta il suo segno (🟢 / 💳 / 🟡)
  col nome per esteso tenendoci premuto sopra. In cambio i tasti dello
  **zoom** non finiscono più fuori dallo schermo.
  **Con l'app ingrandita** vale la stessa regola: la riga si guarda per
  quanto è larga davvero, non per quanto è larga la finestra, e man mano
  che lo spazio manca lascia andare prima l'**id interno**, poi **chi ha
  aperto il conto**, poi l'**ora**. Su una riga sola, sempre — provato dal
  telefono al monitor e da 100% a 160%.

- **Le tre colonne della schermata di pagamento si allargano e si
  stringono**, come già quelle del dettaglio ordine: si prende il bordo fra
  una colonna e l'altra e lo si trascina (col dito, tenendo premuto un
  istante). Chi batte gli importi a mano si fa il **tastierino grande**;
  chi divide un conto lungo si allarga la **lista delle voci**. La misura
  **resta su quel tablet** — il banco e la sala possono tenerla diversa — e
  non si può stringere niente fino a farlo sparire: i tasti con cui si
  sceglie come incassare restano sempre lì, e al tastierino resta sempre
  almeno un terzo dello schermo, a qualunque zoom. Sul telefono, dove le
  colonne sono già una sotto l'altra, non cambia nulla.

- **Via l'avviso «Comande non ancora servite» dalla schermata di
  pagamento.** Era una riga fissa sotto l'importo, e quando si ingrandisce
  l'app quella riga è spazio tolto al **tastierino**. Quello che diceva non
  si perde: lo dice il tasto **«Riscuoti e servi · chiude il conto»** — se
  quello chiude, l'altro no — e chi passa col mouse su **«Riscuotere»** se
  lo trova scritto per esteso. Non cambia niente di come si incassa.

- **Con lo zoom su, il tastierino del pagamento non finisce più dietro
  «Riscuotere».** Ingrandendo l'app al 120% l'ultima riga di tasti — lo
  **0**, il **00**, l'**=** e il tasto per **cancellare una cifra** —
  spariva sotto il tasto blu dell'incasso: chi batteva un importo a mano
  non trovava più né lo zero né il modo di correggersi. Adesso i tasti
  restano grandi **quanto prima davvero sotto il dito** e il tastierino ci
  sta per intero; su una finestra molto bassa tenuta a zoom alto scorre da
  sé, e i tasti che incassano restano dove sono. Provato a ogni livello di
  zoom, dal 100% al 160%.

## 1.5.4-beta

### Per chi gestisce

- **Non nascono più due conti con lo stesso numero dopo un ricaricamento.**
  Ricaricando la pagina l'app per un attimo non sapeva ancora quale cassa
  fosse aperta, e un conto battuto proprio in quell'istante prendeva il
  numero da un'altra serie: usciva un **secondo #5** nella stessa sera — e
  quel conto per giunta non finiva nella chiusura di cassa. Adesso l'app
  **si ricorda la cassa della serata** e non se la dimentica al ricarico.
  Come sempre, non aspetta niente e nessuno: il conto compare nell'istante
  in cui lo confermi.

- **Un conto annullato e poi rimesso in piedi avvisa una volta sola, e dice
  che è tornato.** Prima ne arrivavano due, una dietro l'altra e con parole
  diverse: «🆕 Nuovo ordine — Ordine #5 ricevuto.» e «Ordine ricevuto —
  Ordine #5». Chi legge si chiede se siano due cose, e va a cercare un
  ordine che non è mai arrivato. Adesso l'avviso è uno e dice **«↩️ Conto
  ripristinato»** — quello che è successo davvero. Un conto che il banco ha
  già visto non torna a essere «nuovo» nemmeno se nel frattempo era sparito
  dalla coda, e **chi preme «Ripristina» non se lo sente ripetere**, come
  già succede per chi annulla.

- **Annullando un conto appena battuto, la comanda non esce più.** Si
  batteva un ordine alla cassa, si cambiava idea, si annullava — e il
  ticket usciva lo stesso: carta buttata, e al banco si cominciava a
  preparare roba che nessuno doveva fare. Adesso l'annullo ferma anche la
  stampa. E il tasto **«Comanda»** su un conto annullato non stampa più
  niente: prima faceva uscire un ticket con dentro *tutte* le righe del
  conto.

- **Chi versa un acconto adesso può portarsi via la sua ricevuta.** Se
  riscuotevi solo una parte del conto non usciva niente: la stampa era
  attaccata alla chiusura, e un acconto non chiude. Adesso c'è un
  **documento suo** — in cima c'è scritto **ACCONTO** in nero, e in fondo
  che **il conto resta aperto**, così non si può scambiare per lo
  scontrino finale — con **cosa ha pagato** (le righe di quella
  riscossione, quando ce ne sono), **quanto**, **con che metodo** e
  **quanto resta da incassare**.
  Si accende da **Impostazioni → Pagamenti**, e ci sono due modi:
  **«Un tasto per l'acconto con lo scontrino»** aggiunge il tasto
  *«Acconto con scontrino»* accanto agli altri due, da premere quando
  serve; **«Lo scontrino d'acconto a ogni riscossione»** lo fa uscire da
  solo ogni volta che incassi una parte, senza premere niente. Acceso il
  secondo, il primo si spegne da sé (dice anche perché): la carta esce
  già, e il tasto non servirebbe più. Se l'incasso salda tutto il tasto
  resta lì spento — lì quello che esce è lo scontrino, non un acconto — e
  toccandolo te lo dice.
  Cosa c'è scritto sulla carta lo scegli tu in **Impostazioni →
  Stampante → Campi dell'acconto**, come per lo scontrino e la comanda.
  Di suo non cambia niente per nessuno: nasce spento.

- **Il preconto adesso dice anche quanto manca.** Su un conto con degli
  acconti già presi elencava gli incassi ma non il resto: il totale
  sopra, i versamenti sotto, e la sottrazione la facevi a mente col
  cliente davanti. Adesso c'è la riga **«Resta da pagare»**. Su uno
  scontrino di conto chiuso non compare: lì non resta niente.

- **I due tasti in più del pagamento stanno affiancati, e si accendono
  tutti e due da «Pagamenti».** Sotto il tastierino c'erano tre tasti uno
  sopra l'altro: il grande «Riscuotere» e, in fila sotto di lui, «Riscuoti
  (senza stampa)» e «Riscuoti e servi». Adesso **«Riscuotere» resta da
  solo, largo quanto la schermata** — è il gesto di sempre — e le altre due
  vie stanno **una accanto all'altra su una riga sola**, metà e metà. Se ne
  hai accesa una sola, quella si allarga e prende tutta la riga. Sul
  telefono, dove due tasti così sarebbero troppo stretti, tornano uno sotto
  l'altro invece di stringersi.
  E l'interruttore di **«Un tasto per incassare e servire insieme»** si è
  spostato in **Impostazioni → Pagamenti**, accanto a quello di «incassare
  senza stampare»: era in «Gestione preparazione» e non lo trovava
  nessuno. Fa esattamente quello che faceva prima, ma adesso sta dove uno
  lo cerca. Come prima, si vede solo se segui la preparazione degli
  ordini: senza quei passi «servire» non esiste.

- **I tasti per incassare non si toccano più.** «Riscuoti e servi» stava
  appiccicato a «Riscuotere» e sembrava la sua seconda riga: due gesti
  diversi — uno incassa, l'altro incassa e dà per servito tutto — a un
  millimetro l'uno dall'altro. Ora sono staccati, e lo stesso vale per
  «Riscuoti (senza stampa)».

## 1.5.3-beta

### Per chi gestisce

- **Nel pagamento c'è «Deseleziona tutti»: un tasto e il conto va a
  zero.** Sta **in cima alla lista delle voci**, accanto a «Separa
  uguali»/«Unisci uguali». Quando il cliente comincia a dirti cosa ha
  preso, lo premi una volta: **tutte le voci si spengono insieme** e da lì
  aggiungi solo quelle che ti sta pagando, una per una. Su un conto da
  venti prodotti dove ne paga uno, prima toccava togliere la spunta a
  diciannove voci; adesso è un tasto e un tocco. Quando la lista è tutta
  spenta lo stesso tasto diventa **«Seleziona tutti»** e rimette dentro
  tutto. Il vecchio **«Rimetti tutto in pagamento»**, che stava in fondo
  alla lista, non c'è più: fa lo stesso lavoro questo, dove lo vedi.
  Con **niente selezionato** l'importo è 0,00 € e sopra c'è scritto
  «nessuna riga scelta»: «Riscuotere» resta spento finché non scegli una
  voce — così non parte un incasso vuoto — ma il **tastierino** funziona
  come sempre, se vuoi battere una cifra a mano. E uno **sconto già
  preparato non si perde**: resta lì, e appena tocchi la prima voce torna
  a seguire quello che stai riscuotendo.

- **Il tasto del menu non copre più i conteggi della coda, e sopra le card
  c'è una riga in meno.** A tutto schermo, con la barra in alto nascosta,
  il ☰ era appeso sull'angolo dello schermo: appena scorrevi la coda ci
  finiva sotto l'inizio delle scritte — «4 aperti · 16 chiusi · 583,00 €»
  si leggeva «…erti · 16 chiusi», e il nome del terminale «…o Bar · sei
  tu». Adesso il ☰ **sta dentro la testata**, primo tasto in alto a
  sinistra, e scorre insieme a lei: non copre più niente, né in cima né
  scorrendo. Quando la testata è scorsa via il menu si riapre dalla
  linguetta, come tutto il resto.
  E la testata sul **telefono** è passata da **quattro righe a tre**: «▾
  Filtri» e «↓» non hanno più una riga tutta loro — stanno in fondo alla
  riga della ricerca, che è dove la lista e le schede li tengono già — e
  «In servizio» non si spezza più in due. Non si è perso niente:
  conteggi, incasso, chi sei e su che terminale, ricerca, filtri,
  ordinamento, cambio vista, stampante e il ＋ sono tutti dove erano. Sulla
  lavagna sono una ventina di pixel restituiti alle card.

- **Nel pagamento, il primo tocco sceglie: «di tutto il conto, mi paghi
  questo».** La schermata si apre con tutto acceso, come sempre. Ma
  adesso, **appena tocchi una voce — il nome del prodotto, o il suo «+» —
  tutte le altre si spengono** e resta in riscossione solo quella. Da lì
  in poi ogni tocco **aggiunge**: tocchi un'altra voce e si accende
  anche lei. Le voci fuori restano lì, **smorte** ma leggibili: si
  rimettono dentro toccandole. Prima, per incassare una birra su un conto
  da dieci righe, dovevi spegnerne nove a una a una. Il **«−»** funziona
  come ha sempre funzionato, e con **«Seleziona tutti»** in cima
  torni ad avere tutto acceso. Su un prodotto con più pezzi: toccare il
  nome prende **tutta la riga**, il «+» e il «−» muovono **un pezzo per
  volta** — e visto che il conto si apre già a pezzi separati, di solito
  è un tocco solo.

- **Lo sconto si fa sui prodotti che stai riscuotendo, e se ne può fare
  più d'uno.** Prima lo sconto era uno solo e stava sul conto intero:
  se poi si toglievano prodotti dalla schermata di pagamento, chi pagava
  la sua parte si portava via *una fetta* di quello sconto, e il conto
  non tornava con niente di quello che aveva sul tavolo. Adesso lo sconto
  cade **sulle righe che sono accese in quel momento**: togline una e
  l'importo si rifà su quelle rimaste. Quando riscuoti, quello sconto se
  ne va **dentro quell'incasso** e il conto riparte pulito — così chi
  resta al tavolo può farsi scontare le sue, e **sono due sconti**, non
  uno diviso in due. Sullo scontrino li trovi elencati uno per uno, con
  scritto su cosa cadevano («Sconto 10% su 3 prodotti −6,00 €»). Se fai
  **un solo sconto su tutto il conto** — che è quello che si fa quasi
  sempre — non cambia niente: la riga è «Sconto», come è sempre stata.
  Vale anche per il **buono**: copre le righe che stai riscuotendo, e mai
  più di quanto valgono. I conti già aperti stasera restano com'erano e
  si chiudono come prima.

- **Il colore del conto si sceglie da una finestrella.** Nel «⋯ Azioni»
  di una card — del conto come della comanda — c'era la fila dei dodici
  colori: tre righe di quadratini che coprivano le azioni vere. Adesso c'è
  **un tasto solo**, «Colore del conto», con accanto **il pallino del
  colore che il conto ha adesso** — si legge senza aprire niente. A
  toccarlo si apre la tavolozza con i **gettoni grossi**, comodi da
  prendere col pollice: scelto il colore, si applica e si richiude tutto,
  finestrella e menu.

- **I tasti delle card della coda stanno un filo più vicini.** Un paio di
  pixel in meno fra l'uno e l'altro, dappertutto la stessa misura. I tasti
  restano grandi come prima, e lo stacco dal contenuto sopra pure: serve a
  non premere quello sbagliato di corsa.

- **La striscia colorata delle card può dire il colore del conto.** In
  *Impostazioni ▸ 🎨 Aspetto ▸ Le card della coda* si sceglie cosa dice
  quella riga a sinistra: **«💳 Com'è messo il conto»** — da incassare,
  acconto, pagato, annullato, com'è sempre stato — oppure **«🎨 Il colore
  del conto»**, quello scelto dal «⋯ Azioni» della card o assegnato da solo
  ai conti nuovi. Vale in tutte le viste della coda, comprese le corsie del
  banco. Chi non tocca niente non vede cambiare niente. Un conto **senza
  colore**, e un conto **annullato**, tengono sempre la striscia dello
  stato.

- **Il colore del conto si vede molto di più.** Era un velo così tenue da
  non riconoscersi da due passi: adesso la card è tinta il doppio, e da
  lontano si vede al volo che tre comande sparse in tre colonne sono lo
  stesso tavolo. Il testo resta leggibile su tutti i temi, chiaro e scuro.

- **Nella griglia il conto pagato-ma-da-servire torna ambra.** Era verde
  come uno concluso: la striscia ambra — «i soldi li hai già presi, il
  drink lo devi ancora fare» — c'era ma non si vedeva mai. Nelle corsie il
  difetto non c'era.

- **Le card del banco non si sfasciano più con tante colonne accese.**
  Quando la card diventa stretta — sette colonne su un tablet, ma succede
  già a quattro — i tasti **si impilano invece di schiacciarsi**: prima
  scende sotto, **a tutta larghezza**, quello che porta avanti il lavoro
  («Pronto», «Servito», «Incassa»), che è quello che si preme di corsa;
  più stretta ancora, vanno in colonna tutti e tre. A decidere è la
  **larghezza vera della card**, non quante colonne sono accese: la stessa
  card è stretta con sette corsie e larga con tre, sullo stesso schermo. E
  il tempo — «5 min» — **non va più a capo una lettera per riga**.

- **Sopra i conti ci sono tre filtri, e se ne guarda uno per volta.**
  **Aperti** (si chiamava «In corso»), **💶 Chiusi**, **✖️ Annullati**:
  toccandone uno gli altri si spengono, e ce n'è sempre uno acceso — la
  coda si apre sugli **Aperti**, che è il lavoro da fare. La scheda
  **«Tutti» non c'è più**: mescolava gli incassi con gli annullati, e non
  rispondeva a nessuna domanda vera.

- **«💶 Chiusi» è un tasto solo, con tre porzioni.** Accendendolo, dentro
  lo stesso tasto compaiono **«Da servire/Ritirare»** e
  **«Serviti/Ritirati»**: senza toccarle si vedono **tutti i conti
  chiusi**, accendendone una si vede solo quella — quali hanno ancora
  qualcosa da portare, o quali sono usciti per intero. Ritoccandola si
  torna a vederli tutti. Le due porzioni ci sono solo dove si segue la
  **preparazione**; e dove al banco **non si ritira** si chiamano
  semplicemente «Da servire» e «Serviti».

- **«✍️ Miei» è diventato la tendina «Staff».** Dentro c'è **chi ha
  aperto almeno un conto** stasera — più una voce **Clienti** per gli ordini
  arrivati dall'app — e sono **tutti selezionati**: si vede tutto. Da lì si
  spegne chi non interessa e restano **i conti di chi si vuole**: i propri,
  come prima, oppure quelli di un collega. Da chiusa la pastiglia lo dice
  senza aprirla — «✍️ Staff», «✍️ Marta», «✍️ 2 di 5» — e si
  incrocia con gli stati: **i chiusi di una persona sola** si chiedono in due
  tocchi. Anche qui non si resta mai senza nessuno: spegnendo l'ultimo
  tornano tutti.

- **Le colonne del banco si chiamano col lavoro che c'è dentro.** Dove
  c'era **«Pronto»** adesso c'è **«Da servire/Ritirare»**, e dove c'era
  «Ritirato/Servito» c'è **«Serviti/Ritirati»**: una colonna non dice a che
  punto sta il drink, dice cosa c'è da farci. Dove al banco **non si
  ritira** restano «Da servire» e «Serviti». Sono le stesse parole delle
  porzioni del tasto dei chiusi, così la colonna e il filtro che parlano
  della stessa cosa si chiamano allo stesso modo.

- **Il pronto si divide dal suo stesso tasto.** Al banco quella colonna
  può aprirsi in due — **«Da servire»** e **«Da ritirare»** — e
  fino a ieri lo chiedeva un tasto in fondo alla fila dei filtri che diceva
  «✂️ Dividi il pronto»: lungo, e lontano dalla colonna di cui parlava.
  Adesso il segno **✂️ sta attaccato al chip della colonna**, e premendolo
  **nello stesso punto** compaiono i due chip «Da servire» e «Da ritirare»,
  con un **🔗** per rimetterli insieme. Si vede a colpo d'occhio a cosa
  serve, perché sta dove agisce. Come sempre è una scelta **di quel
  tablet**, e **compare solo se al banco si ritira**: col solo servizio ai
  tavoli non c'è niente da separare e il segno non c'è.

- **Il tasto dei filtri sta a destra, e i filtri escono sotto in UNA riga
  sola.** È un **«▾ Filtri»** in **fondo a destra**, accanto alla freccia
  dell'ordinamento, **sulla riga dei conteggi che c'era già**: a filtri
  chiusi la coda **non perde nemmeno una riga**. Toccandolo compaiono i
  chip, **tutti sulla stessa riga**: al banco ci sono anche **le colonne**,
  una pastiglia per colonna, in fila con gli altri — non più dietro un
  «▦ Colonne» da toccare, e non più in una seconda riga sotto. Un tasto
  solo apre e chiude tutto. Richiudendo la fila **sparisce del tutto**.
  Le due porzioni dei chiusi stanno **dentro il tasto «💶 Chiusi»**, non
  più in una riga «Dei chiusi:» tutta loro.

- **Filtri e ordinamento sono due bottoni bassi, gemelli.** Si vede che sono
  tasti — hanno il loro riquadro — ma sono **più bassi** di quelli che si
  premono di corsa: in mezzo a una riga di testo un tasto alto è uno
  scalino, e la riga dei conteggi **non è cresciuta di un pixel**. Il tasto
  dei filtri tiene la freccetta e la scritta; l'ordinamento è un quadratino
  con la sua freccia, della stessa misura. E **tutti i tasti dei filtri sono
  un filo più piccoli**, così in una riga sola ce ne sta di più.

- **Il numerino sul tasto dei filtri conta solo quello che hai cambiato.**
  Prima segnava sempre almeno uno, e non distingueva niente: adesso compare
  **solo se la coda è filtrata diversamente da come si apre**, e **solo a
  filtri chiusi** — aperti, i chip accesi si vedono da soli.

- **I filtri della coda stanno a scomparsa.** Sopra i conti c'era una fila
  di pastiglie che si mangiava tutta la riga: adesso stanno dietro il tasto
  qui sopra, e si aprono quando servono. Vale allo stesso modo per gli
  **ordini** e per le **comande** — dove dentro ci sono anche le colonne da
  accendere e spegnere — e **ogni tablet se lo ricorda a modo suo**: chi la
  tiene aperta la ritrova aperta.

- **Il tasto dell'ordinamento dice com'è messa la coda adesso**, in tre
  parole: **«Prima i più recenti»** oppure **«Prima i più vecchi»**. Prima
  c'era una frase lunga che metteva insieme com'era messa e cosa sarebbe
  successo a premere, e non se ne leggeva nessuna delle due. Anche l'icona
  lo dice: una **freccia sola** — **↓** quando si parte dai più recenti,
  **↑** quando si parte dai più vecchi — dove il «↕» era uguale nei due
  casi. Sta **in riga col tasto dei filtri**, sotto la testata, sul tablet
  come sul telefono, e **non si nasconde mai**: non è un filtro, è il verso
  in cui si legge la coda.

- **Il tasto per passare da ordini a comande è salito in alto**, ed è
  diventato un'icona piccola accanto agli altri: **🧾** quando porta ai
  conti, **🍸** quando porta alle comande. Continua a dire dove porta, non
  dove sei, e resta a un tocco anche col telefono in mano — è l'unico dei
  tre rimasto lassù.

- **«Chiudi cassa» non occupa più mezza testata, e torna a dire perché è
  spento.** Era largo quanto la frase che aveva sotto; adesso il tasto resta
  della sua misura e **la riga sotto è tornata, più corta**: «Chiudi 3 conti
  e 2 comande». Provando a chiuderla lo dice comunque, per chi preme di
  corsa.

- **Il magazzino spiega i suoi segni**: sopra la lista c'è la legenda dei
  pallini (quanta roba c'è) e delle strisce colorate (in linea, premium,
  fuori assortimento). Era la domanda di Flavio: «che significa la
  bacchettina davanti?» — ora lo dice da solo.

- **Lo scontrino e la comanda si scelgono campo per campo.** In
  *Impostazioni → Stampante* ci sono due riquadri nuovi, «Cosa c'è sullo
  scontrino» e «Cosa c'è sulla comanda»: un interruttore per ogni riga che
  la stampa può avere — il numero del conto, chi l'ha battuto, quante
  persone, l'IVA, il codice lotteria, la fascia nera della comanda, le note
  dei prodotti — e dove la riga è solo testo si cambiano anche le parole
  («DIRETTO» sulla fascia, «Il tuo menu» sotto al nome). Si può aggiungere
  una **riga di saluto** in fondo allo scontrino. **La lista dei prodotti
  non si tocca** — e sullo scontrino nemmeno il totale: sono la carta, non
  un di più. Ogni riquadro ha una **prova di stampa** che fa uscire un
  conto finto coi campi scelti, così si vede prima di stampare quello vero.
  **Se non si cambia niente, non cambia niente**: le stampe restano
  identiche a prima, riga per riga.

- **Il logo si carica dall'app, e si sceglie su quali stampe esce.** Prima
  usciva in cima allo scontrino e basta, e per cambiarlo bisognava toccare
  il codice. Adesso in *Impostazioni → Stampante → Logo sulle stampe* si
  decide stampa per stampa — scontrino, preconto, comanda, chiusura di
  cassa — e si **carica l'immagine** (la cambia solo l'amministratore).
  L'immagine viene ridotta alla misura che la stampante vuole, e se non va
  bene **lo si sa subito**: una foto scura, che sulla carta uscirebbe come
  un rettangolo nero, viene rifiutata spiegando perché, e il logo resta
  quello di prima. Di suo tutto come sempre: logo su scontrino e preconto,
  non sulla comanda — al banco è solo carta consumata.

- **Le comande si spostano anche col dito.** Nella lavagna del banco si
  tiene premuto su una comanda, la card si stacca e si lascia nella colonna
  che si vuole: lo stato diventa quello della colonna, avanti o indietro che
  sia. **I tasti non cambiano di niente** — questa è solo una seconda
  strada per lo stesso gesto. Le colonne che non accettano una comanda
  («Chiuse» e «Annullate») lo dicono mentre la card è ancora in mano, e
  restano com'erano.

- **La comanda la stampa il terminale che ha battuto l'ordine, e solo
  lui.** Prima la faceva uscire il primo tablet che vedeva l'ordine fra
  quelli con la stampa automatica accesa: si batteva un conto al banco e la
  carta poteva uscire dal terminale in fondo alla sala. Adesso stampa chi
  l'ha inserito. Gli ordini presi **dai clienti col telefono** non hanno un
  terminale che li ha battuti e restano come prima — li stampa chi ha
  l'interruttore acceso, cioè il banco. E se il locale ha scelto **«la
  stampa il banco»** per le comande della sala, non cambia niente: quella
  scelta vince.

- **I filtri della coda stanno nello stesso punto in tutte e due le viste.**
  Nella vista a griglia degli ordini occupavano una riga tutta loro, nelle
  corsie no: passando dall'una all'altra bisognava ricercarli. Adesso stanno
  **sulla riga dei conteggi** anche in griglia — dove non ci stanno tutti la
  riga **scorre di lato**, non va a capo — e si è guadagnata una riga di
  altezza per i conti.

- **Niente più «Invalid Date» sopra un gruppo di conti.** Un conto di cui
  non si riusciva a leggere la data finiva sotto un'intestazione che diceva
  proprio così. Adesso la data si cerca in **tutte** le date che il conto si
  porta dietro — quella scritta alla nascita, l'ora del server, l'apertura
  segnata dal tablet — e il conto finisce sotto **il suo giorno**. Se
  davvero non ce n'è nessuna, il conto sta **sotto oggi**, dove chi lavora
  lo vede: nessuna etichetta inventata.

- **Fra i conti chiusi non c'è più scritto «Da chiudere».** La riga che
  separa i giorni scorsi diceva **«⏳ Da chiudere · ieri»** in ogni scheda,
  anche sopra conti pagati e chiusi — e si andava a cercare cosa mancasse su
  conti a posto. Adesso l'etichetta dice quello che quei conti sono davvero:
  **«💶 Chiusi · ieri»**, **«✖️ Annullati · ieri»**, e nella scheda «Tutti»,
  dove sono mescolati, la sola data.

- **Le colonne spente al banco si vedono anche a filtri chiusi.** C'era un
  tasto «▦ Colonne» arancione **sempre**, anche su un tablet appena aperto:
  «Chiuse» e «Annullate» nascono spente apposta, quindi l'arancione c'era
  comunque e non distingueva niente. Adesso quel tasto non c'è più — le
  colonne sono pastiglie in fila coi filtri, e da aperta si vede da sé
  quali sono spente — e a filtri **chiusi** lo dice il numerino sul tasto
  «▾ Filtri», che ci passa sopra e si legge quante e quali. E le colonne
  **che non esistono più** (gli id sono cambiati negli anni) non restano
  più appese nella memoria del terminale a tenerlo acceso senza che si
  potesse spegnerlo.

- **Un ordine appena battuto è UNA comanda sola, e il ticket esce quando si
  esce.** Battendo un conto nuovo poteva uscire **più di una comanda** — e
  con l'auto-stampa accesa più di un foglio, uno col primo prodotto da solo.
  Adesso, finché non si torna agli ordini, il conto **si sta ancora
  battendo**: tutto quello che si aggiunge entra nella stessa comanda, e la
  stampante aspetta. Andare in pagamento e tornare indietro **non** chiude
  la battuta. Quando si esce, esce **un ticket solo, completo**.
- **Una comanda si allunga finché nessuno l'ha presa in mano.** Non conta
  più in che passo si trova, ma se qualcuno l'ha **presa in carico**
  davvero: se il locale fa nascere le comande già «in preparazione», quelle
  non le ha ancora prese in mano nessuno e le righe nuove ci entrano. Da
  quando qualcuno segna «la preparo io», le aggiunte fanno un **ticket
  nuovo**. E se la comanda era **già stampata** e si allunga, **il ticket si
  ristampa completo**: il foglio vecchio si butta, quello nuovo ha tutto.
- **Con gli stati del servizio spenti, sceglie chi sta al banco.** Aprendo
  un conto già creato e aggiungendo righe, sotto il totale compaiono due
  tasti — **«Nella comanda»** e **«Comanda nuova»** — perché lì l'app non ha
  modo di saperlo da sola. Finché non si sceglie, le righe restano a
  schermo; uscendo senza scegliere vanno nella comanda.

- **Battendo in fretta non si perde più niente.** Aggiungendo prodotti uno
  dietro l'altro su uno stesso conto poteva restare **solo il primo**: due
  modifiche partite nello stesso istante scrivevano tutte e due l'elenco
  delle comande, e l'ultima cancellava l'altra. Adesso le modifiche di uno
  stesso conto si mettono **in fila**, e ognuna parte da quello che ha
  fatto quella prima. Non si aspetta niente in più: il conto a schermo si
  aggiorna al tocco come sempre, e **conti diversi non si fanno la coda a
  vicenda**.

- **Sul sito di test si può provare la stampa senza stampante**: nella
  sezione Dev c'è «Stampante simulata» — le stampe escono come facsimile a
  schermo, solo su quel dispositivo.

- **Tornando in coda ordini non escono più gli scontrini.** Rientrando
  nella coda — la prima volta della serata, o dopo aver svuotato la memoria
  del browser — la stampante sfornava lo **scontrino di ogni conto pagato**
  che vedeva, uno dietro l'altro. Adesso la coda stampa **solo comande**: lo
  scontrino esce **quando si incassa**, dal pannello dei pagamenti o dai
  tasti rapidi 💶 Contanti / 💳 Carta, che è il momento in cui serve.
  E il segno «già stampato» sta **sul conto**, non nella memoria del
  singolo tablet: due terminali accesi non fanno due copie, e un tablet
  nuovo non ristampa niente di vecchio. Riaprendo un conto il segno si
  azzera: riscuotendo di nuovo, la carta esce di nuovo.

- **Sul tema chiaro i tasti delle impostazioni hanno di nuovo il contorno.**
  Le scelte a pulsanti e i filtri non selezionati erano senza bordo — bianco
  su bianco — e sembravano scritte, non tasti.

- **Nella lavagna delle comande ci sta una comanda in più.** I filtri
  («✍️ Miei», le colonne, e il tasto che passa agli ordini) non hanno più
  una riga tutta loro fra i conteggi e le colonne: stanno **sulla riga dei
  conteggi**, a destra. Sono **44px guadagnati** e un livello in meno prima
  di vedere la prima comanda — quella lavagna si guarda da lontano mentre
  si versa, e ogni riga sprecata sopra è una comanda in meno sotto. I
  filtri fanno esattamente quello che facevano: è cambiato solo dove
  stanno. Sul **telefono** restano com'erano, sotto e scorrevoli.

- **Al cliente si promette solo quello che succede davvero.** Il tasto
  **«🔔 Avvisami quando è pronto»** compare soltanto sui conti da **ritiro
  al banco**: è l'unico caso in cui, quando il drink è pronto, deve alzarsi
  lui. Chi è servito al tavolo legge invece che non deve fare niente, e chi
  non ha dato il permesso alle notifiche legge che **la pagina si aggiorna
  da sola** — è la strada che funziona sempre. Con **gli stati del servizio
  spenti** non si promette nessun avviso: si dice di ritirare al banco
  quando il drink è pronto. E l'avviso parte **una volta sola per comanda**:
  se qualcuno riporta indietro lo stato e lo rimette «pronto», niente
  secondo squillo.
  ⚠️ **Quest'ultimo pezzo gira sul server e resta senza effetto finché non
  si autorizza il deploy delle Cloud Functions** — come per le notifiche di
  ritiro e servizio allo staff, corrette giorni fa e ancora ferme per lo
  stesso motivo.

- **Ogni conto può avere il suo colore, e le sue comande se lo portano
  dietro.** La card si tinge — un velo di colore sfumato dall'angolo, sulla
  card del conto e su tutte le card delle sue comande: un conto battuto in
  tre volte finisce in tre colonne diverse della lavagna, e da lontano quel
  colore è l'unica cosa che dice che sono lo stesso tavolo. In **Impostazioni → Coda ordini → «Il
  colore del conto»** si accende «ogni conto nuovo nasce col suo colore»;
  acceso o spento che sia, il colore si sceglie e si toglie a mano dal
  **«⋯ Azioni»** della card — anche sui conti già aperti. La striscia a
  sinistra non cambia: quella continua a dire a che punto sta il lavoro.

- **Nella conta di magazzino si legge quanto se ne va a settimana**, accanto
  al consumo del periodo — ed è diviso per le settimane **vere**, contate
  dalle date della conta, non per un numero fisso da tenere aggiornato a
  mano. È il numero su cui si decide quanto ordinare. Finché la conta è
  troppo fresca per dire qualcosa non compare: meglio niente che un numero
  inventato, che manda a comprare merce che non serve.

- **L'IVA di vendita si cambia sulla singola voce di menù**: nella scheda
  del prodotto, accanto al prezzo. Lasciala vuota e vale quella del locale —
  si compila solo dove fa eccezione. Serve perché una bottiglia intera non
  si rivende come un drink servito al banco: mettere tutto al 10% gonfia il
  netto, e dal netto scendono margine e conto di fine mese.

- **Nell'elenco delle categorie si vede a quale gruppo appartengono** — in
  magazzino e nel menù. Accanto al nome c'è la macro, e dove non ce n'è si
  legge «senza macro». Non è un rimprovero: ALTRO e BOTTIGLIE stanno fuori
  apposta. Serve a distinguerle da quelle che ci sono finite per
  dimenticanza, che prima si somigliavano troppo.

- **Il «Mensile per macro» è diventato «Venduto × Incassato», e sta nel
  Bilancio**: quanto ha reso ogni gruppo del menù è una domanda di fine
  mese, non di serata — le Statistiche restano com'erano andate ieri sera,
  ed è quello che si guarda al banco. La tabella non è cambiata di un
  centesimo; ha due righe in più. **Incidenza**: quanto pesa un gruppo sul
  margine del mese, se i gruppi insieme fanno cento. **Incidenza
  sull'anno**: quanto pesa un mese sull'incassato dell'anno. E sotto c'è
  scritto cosa vuol dire ogni riga — e perché, se lo confronti col foglio,
  non tornerà mai: qui si guarda la merce **venduta**, il foglio quella
  **entrata dalla porta**.

- **«Bilancio»: i conti del locale hanno una pagina loro** — nel menu, e la
  vede solo l'admin. Dentro ci sono le tre tabelle di fine mese: «Mesi»
  (quanto doveva fare e quanto ha fatto, giorno per giorno), «Acquisti ×
  Fatturato» e «Venduto × Incassato». I numeri arrivano una tabella per
  volta; il posto e le parole per leggerli ci sono già — sotto ognuna c'è
  scritto che numero è e da dove viene. Le Statistiche restano dove sono e
  le guarda chi lavora: com'è andata ieri sera è un'altra domanda da com'è
  andato il mese.

- **Basta box bianchi nelle impostazioni e nel menù, e i titoli delle
  sezioni si leggono.** Sui temi chiari i riquadri che dividono una
  schermata erano bianchi su fondo quasi bianco, **senza contorno**:
  adesso hanno un bordo che si vede e si staccano dal fondo, su ogni tema.
  Stessa cura per le righe fra un'impostazione e l'altra, per le categorie
  del menù e per le tessere dei gruppi. E il **nome della sezione è
  diventato un titolo** — grande, ben leggibile, col carattere di casa — invece
  dell'etichettina grigia in maiuscoletto da dodici pixel: chi cerca
  «Stampante» o «Coperto» adesso la trova scorrendo, senza andare a
  tentativi.

### Al banco

- **Le colonne spente accendono il numerino dei filtri solo se hai cambiato
  qualcosa**: prima era sempre arancione, perché due colonne nascono
  nascoste di serie. Le
  ombre delle card hanno il loro spazio pieno (non più tagliate sul
  fianco), e l'interruttore «incassare senza stampare» ora sta dove uno lo
  cerca: **Impostazioni → Pagamenti**.

- **Contanti e Carta dalla card stampano lo scontrino come il pannello dei
  pagamenti**: al tocco, col metodo scelto scritto sopra. E per chi lo
  scontrino non lo vuole c'è il nuovo **«Riscuoti (senza stampa)»** nella
  schermata di pagamento — si accende dalle impostazioni, e vale solo per
  quel gesto: alla prossima riscossione normale la stampa torna.

- **Un logo che non si carica non tiene più ferma la stampante**: dopo tre
  secondi lo scontrino esce senza logo, e non si riprova a ogni stampa.

- **Una comanda presa in carico non si allunga più sotto le mani.** Quando
  una comanda passa da **«da fare»** a **«in preparazione»**, i prodotti
  aggiunti dopo al conto fanno una **comanda nuova** — prima ci finivano
  dentro, e chi stava già versando si vedeva comparire righe su un ticket
  che aveva in mano da un pezzo (succedeva nei locali che hanno acceso «le
  comande nascono già in preparazione»). Stessa cosa per una comanda già
  **uscita dalla stampante**: la carta è al banco, e una riga aggiunta dopo
  lì non ci sarebbe mai comparsa. La comanda nuova **stampa da sola**, come
  le altre.

- **Mai più due conti sulla stessa comanda.** Capitava che uscisse un
  ticket solo con dentro le comande di **ordini diversi** — due
  intestazioni, due numeri di conto, le righe di tutti e due — e al banco è
  un pezzo di carta da buttare, o peggio un drink portato al tavolo
  sbagliato. La stampante ha **una coda sola**: adesso ogni stampa aspetta
  quella prima, parte da un foglio pulito e non lascia niente in giro
  nemmeno quando non riesce. Una stampa fallita **non blocca** quelle dopo.

- **Il tasto «Comanda» stampa UNA comanda, non il conto intero.** Su un
  conto con più comande, quando non ce n'era più nessuna in lavorazione —
  tutto servito, oppure il conto già incassato — quel tasto faceva uscire
  un ticket solo con dentro le righe di **tutte** le comande, sommate:
  sembrava una comanda e ne conteneva due. Adesso, se non si dice quale,
  esce **l'ultima**. Per averle tutte c'è il tasto apposta (qui sotto).

- **Le comande di un conto si stampano insieme, in due modi.** Un conto
  battuto in tre riprese ha tre ticket: in **«Comande»**, sopra l'elenco,
  ci sono due tasti — compaiono solo quando le comande sono più d'una.
  **«Una per comanda (3)»** fa uscire i ticket separati, identici a come
  uscirebbero da soli: al banco un ticket è un giro di lavoro.
  **«Tutto su una»** fa uscire **un foglio solo** con tutti i prodotti del
  conto, le quantità dello stesso drink sommate. Sempre e solo **di quel
  conto**: due conti sulla stessa carta non succede più. Le comande
  **annullate** restano fuori da tutte e due.

- **Il conto con lo sconto si chiude davvero, e lo scontrino esce** (i due
  vocali del 19 agosto). Chiudendo un tavolo scontato il conto risultava
  pagato «a metà» — restava in coda e bloccava la chiusura di cassa — e lo
  scontrino non usciva; e se una stampa falliva, quel conto restava muto
  per sempre. Adesso il conto scontato si chiude, la stampa fallita si
  ritenta alla chiusura successiva, e **riscuotere di nuovo un conto
  riaperto ristampa lo scontrino** — quello nuovo, con le cifre corrette.
  L'interruttore in Impostazioni → Stampante ora dice il vero: la stampa
  parte **alla riscossione**, non «quando l'ordine è pronto».

- **Le card della lavagna hanno di nuovo la loro ombra.** Nelle colonne
  erano tagliate ai bordi, e dopo il pagamento sparivano del tutto
  lasciando un bordino più spesso al loro posto.

- **Senza connessione l'app mostra subito quello che hai fatto.** Aggiungere
  righe a un conto, annullarlo, riaprirlo: il totale e le voci si vedono
  aggiornati nell'istante del gesto, non «quando sincronizza». Prima, con la
  rete lenta o assente, la card restava indietro e il conto sembrava
  sbagliato.

- **Le card del banco si leggono da lontano.** Numero del conto e nome del
  tavolo ora stanno sulla stessa riga e sono grandi uguali — «il ventidue,
  quello di Peppe» si legge in un colpo invece di cercare il nome in
  piccolo sotto. È sparita la pastiglia «Ritiro / Servizio», che diceva una
  cosa già scritta nel nome, e le righe dei drink a vista sono **quattro**
  invece di sei: così in colonna ci stanno più comande, e chi ne ha di più
  tocca «altre N».

- **Nella legenda della coda c'è anche chi è collegato adesso**, non solo
  chi ha già battuto un conto: chi apre l'app trova subito la sua iniziale —
  con scritto «sei tu» — e sa come si riconoscerà sulle card. La riga di chi
  è online è più chiara, con un pallino verde davanti. **La vedono solo
  l'admin e il banco**: chi è in sala continua a vedere le lettere dei conti
  battuti, e i clienti non vedono niente. Chi chiude l'app sparisce da solo
  dopo qualche minuto.

- **Lo scontrino non aspetta più un logo che non c'è**: se `logo.png` manca
  o non è nella memoria dell'app, ogni stampa rifaceva il caricamento e
  aspettava l'errore prima di far uscire la carta. Adesso ci prova una volta
  sola: dalla seconda in poi lo scontrino esce subito.

- **Aprendo un conto annullato da un collega non arriva più l'avviso del
  cliente**: «⚠️ Problema con il tuo ordine — prego recarsi al bancone»
  spuntava addosso a chi sta *dietro* al bancone. Adesso a chi lavora non
  arriva niente che interrompa: l'annullamento finisce nella lista della
  campanella, dove lo si trova entrando nell'app. Il cliente riceve il suo
  avviso come sempre.

- **Il magazzino si scala quando il drink è pronto, non quando arriva al
  tavolo**: è lì che il fatto succede — fra «pronto» e «servito» il gin è già
  nel bicchiere — e a segnarlo è chi l'ha fatto. Prima si aspettava la
  consegna, e da quando «servito» lo segna la sala quello scarico non
  arrivava proprio: la sala sul magazzino non scrive, l'errore spariva in
  silenzio e la giacenza restava ferma. Un drink pronto sul banco adesso è
  merce consumata, non più «impegnata». Quello che ti ritrovi a fine serata
  non cambia di un millilitro: cambia solo *quando* il conto passa da una
  colonna all'altra. Dove gli stati del servizio sono spenti non cambia
  niente: si scala alla riscossione, come sempre.

- **Col servizio spento non si vedono più i passi**: il bollo «In
  preparazione» spuntava nel riquadro delle comande e nella vista di un
  gruppo anche dove la preparazione non si segue.
- **Lo «Storico ordini» è una pagina, non un riquadro** — e si chiama così
  anche nel menu, dove prima era «Lista ordini».
- **Il rendiconto si chiama «Rendiconto chiusura cassa»**, che è quello che
  è: il conto di una cassa aperta e chiusa, non di una serata.
- **Nel flusso di cassa le tessere stanno in fila**: «ancora da incassare»
  finiva da sola su una riga sua, larga un quarto e circondata di vuoto.

- **Un drink pronto fa squillare i telefoni degli altri**: l’avviso «pronto
  da servire» non arrivava a nessuno, e per i drink da ritirare al banco non
  partiva proprio. Adesso parte per tutti e due — «da servire» al tavolo,
  «da consegnare» al banco — e va a **tutti i terminali accesi tranne quello
  che ha appena premuto il tasto**, che sa già. Prima si smistava per ruolo,
  e il ruolo scritto sul telefono non diceva chi fosse la persona: diceva da
  quale schermata si era registrato. Un drink pronto che nessuno viene a
  prendere è il modo più veloce per far aspettare un tavolo.

- **L’avviso non sparisce più col telefono in tasca**: se il gestionale era
  rimasto aperto, la notifica dei drink pronti veniva saltata anche a
  schermo spento — cioè proprio quando serviva. Adesso si tace solo se la
  coda è davvero sotto gli occhi.

- **Sul telefono le corsie si impilano invece di stringersi**: cinque o sei
  colonne su uno schermo di telefono diventavano strisce dove non entrava
  nemmeno il nome di un drink. Adesso, quando lo spazio manca, ogni corsia
  diventa una sezione — col suo titolo e il suo totale — e si scorre in
  verticale. A dire quando c'è spazio è la larghezza vera della lavagna, non
  quella della finestra: col menu agganciato alla pagina la lavagna ha
  200-250px in meno, e prima nessuno se ne accorgeva.

- **La chiamata dal bancone si presenta dovunque sei**: chi veniva chiamato
  sentiva il telefono, riapriva l'app e non trovava niente — la chiamata
  compariva solo andando a mano su «Da servire». Adesso il riquadro salta
  fuori su qualunque schermata, coda o conto o cassa, ed è già lì quando
  riapri l'app: si risponde e si torna al lavoro.

- **La sala serve, non prepara**: chi porta i vassoi vede a che punto sono le
  comande — gli serve per sapere cosa portare — ma l'unico passo che segna è
  «servito». Prendere in carico, segnare pronto, tornare indietro, dividere
  una comanda e annullare un conto restano di chi versa, e quei tasti alla
  sala non compaiono più. Sul conto invece lavora come prima: quello che
  aggiunge — anche col «+» su una riga già mandata — arriva al banco come una
  **comanda nuova**, invece di infilarsi in una che qualcuno sta già
  preparando. La regola vale anche sul database, non solo a schermo.

- **Chi lavora entra nel conto, non nella pagina del cliente**: toccando un
  ordine — dal banco o dalla sala, con o senza gli stati del servizio — si
  apre la schermata del conto, quella con la griglia dei prodotti. Prima la
  sala si ritrovava il riquadro «Il tuo numero», scritto per chi ordina, e
  per aggiungere una birra doveva cercare un tasto in fondo alla pagina. La
  schermata da girare al cliente resta: si apre dal ⋯ del conto, «Mostra al
  cliente», e ha il QR per seguire l'ordine e un «✏️ Modifica» per tornare
  al lavoro.

- **«Mensile per macro» dice quanto rende davvero ogni gruppo del menù**: le
  righe sono le macro-categorie del **menù**, e ogni drink venduto ci conta
  intero — incasso e costo di tutti i suoi ingredienti insieme. La Schweppes
  finita in un Gin Tonic conta sui distillati, perché lì l'hai venduta; in
  «birre e bibite» resta solo quello venduto come bibita. Al posto di
  «Acquisti / Fatturato / Utile» ci sono ora **Incassato / Costo del venduto /
  Margine**: così il margine di una macro non si porta dentro merce comprata e
  non ancora venduta. «Quanto ho speso in bibite» è un'altra domanda, e la si
  chiederà alle fatture.

- **Nel pagamento i drink sono già separati**: la schermata di incasso si apre
  con «2× Mojito» diviso in due righe da una, perché al banco si paga quasi
  sempre a pezzi — uno paga il suo, un altro offre due birre — e ogni volta
  serviva un tocco in più con la fila alla cassa. Chi incassa tutto preme
  «Riscuotere» come prima, senza toccare niente; chi ha un conto lungo e
  illeggibile lo rimette in gruppo con «Unisci uguali».

- **Le note dei singoli drink si leggono anche a schermo**: «senza ghiaccio»,
  «per Anna» comparivano solo dentro il conto e sulla comanda stampata. Ora
  stanno sotto il loro prodotto anche sulle card della coda del gestionale e
  di quella di sala: chi prepara o chi porta il vassoio le vede senza aprire
  niente.

- **Nel pagamento si vede subito di chi è il conto**: tavolo e nome stanno in
  testata accanto al numero, non più in mezzo alle righe dei drink dove
  sembravano una voce del conto.

- **Il facsimile dello scontrino è largo quanto la carta**: le righe andavano
  a capo dove la stampante vera non le manda, e si leggeva «La Tana del
  Conigli / o». Adesso quello che si vede è quello che esce.

- **Nel menu a lato le icone si vedono, e il numero delle categorie è quello
  vero**: «Categorie» e «Macro-categorie» avevano due icone che su Windows
  uscivano come rettangolini storti, come un’immagine che non si carica. Ora
  si vedono a colori, come tutte le altre della fila. E la scritta «Categorie (7)»
  contava le categorie di quando avevi aperto la pagina: una aggiunta
  dall’altro terminale si vedeva solo entrando nella sezione. Adesso il
  numero si aggiorna da solo.

- **«In attesa del pagamento: non si prepara» funziona anche col salto
  acceso**: dove il pagamento è obbligatorio il blocco valeva solo per i conti
  fermi a «da fare», e in un locale che fa nascere le comande già in
  preparazione non scattava mai. Adesso guarda il passo in cui il lavoro
  nasce, comunque sia messo il locale.

## 1.5.1 — 19 agosto 2026

Correzione urgente su una cosa sola: **chiudere un conto con lo sconto**.

- **Riscuotere di nuovo un conto riaperto ristampa lo scontrino** — quello
  nuovo, con le cifre corrette — da qualunque terminale, anche se la coda
  non ha visto la riapertura. E l'interruttore in Impostazioni → Stampante
  ora dice il vero: la stampa parte **alla riscossione**, non «quando
  l'ordine è pronto».

- **Il conto scontato si chiude davvero, e lo scontrino esce.** Lo sconto si
  applica un attimo prima di riscuotere, e la sua scrittura parte in
  sottofondo: l'app rileggeva il conto per decidere se l'incasso lo saldava e
  ci trovava la versione di prima, quella senza sconto. Il conto restava
  aperto a metà — chiuso a schermo, «parziale» sul database — e lo scontrino
  automatico, che guarda proprio quello, non usciva mai. Adesso quanto resta
  da incassare lo dice la schermata, che ha davanti il conto com'è adesso.

- **Uno scontrino che non è uscito si può ristampare.** Ogni conto veniva
  segnato come «già stampato» PRIMA di mandarlo alla stampante, e non veniva
  più liberato: se la carta non usciva, quel conto non stampava più lo
  scontrino automatico — nemmeno riaperto e richiuso. Ora la prenotazione
  torna libera quando la stampa fallisce e quando il conto viene riaperto. La
  guardia contro la doppia copia resta.

- **La comanda automatica esce sempre: anche per l'ordine battuto da questo
  terminale, anche per la seconda comanda di un conto già aperto.** Prima la
  stampa seguiva le regole degli avvisi — e «non avvisare chi l'ha battuto»
  lasciava il banco senza carta proprio sui suoi ordini. Una copia sola per
  comanda **in tutto il locale**: il segno «stampata» sta sul conto, quindi
  tornare agli ordini non ristampa e un secondo tablet non fa il doppione.

## 1.5.0 — 18 agosto 2026

Questa versione porta al banco una coda tutta sua. Chi prepara non lavora un
conto per volta, lavora un ticket per volta: le comande diventano le card,
si dividono quando si prepara mezza ordinazione, hanno una schermata loro e
si portano avanti con un tocco. Il magazzino cambia modello — si conta
sempre a pezzi — e i prodotti di prima si aggiornano quando lo decidi tu,
con una prova a vuoto che dice cosa cambierebbe prima di toccare niente.


### Per chi gestisce

- **Il drink pronto si chiama «Pronto», e basta.** Lo stesso passo si leggeva
  in quattro modi a seconda di dove guardavi: «Pronto» nel conto, «Pronto al
  servizio» sulla pastiglia, «Ritiro/Servizio» in testa alla colonna, «È
  pronto» sul tasto. Quattro parole per una cosa sola fanno chiedere se siano
  quattro cose. Adesso al banco è una: sul tasto, sulla colonna, sulla
  pastiglia e nel conto. Al cliente continua a dire «Pronto al servizio», che
  a lui serve a capire se deve alzarsi.

- **Finché il magazzino non è aggiornato, non lo scrive più nessuno.** Il
  blocco c'era, ma solo in due strade su sette: da **Acquisti → «Ricevuto»**
  si caricava la merce su giacenze ancora scritte alla vecchia maniera, e i
  numeri uscivano storti senza che niente lo dicesse. Adesso tutte le strade
  che caricano o correggono una giacenza si fermano allo stesso modo, e
  Acquisti lo dice prima: gli ordini si preparano e si mandano lo stesso — è
  carta — ma la merce si carica dopo l'aggiornamento. Battere comande e
  scaricare le scorte continua a funzionare: quella è la serata, e non
  aspetta noi.

- **La comanda si apre subito, anche con la rete che fa i capricci.** Toccando
  una card al banco la schermata restava su «Apro la comanda…» finché non
  rispondevano il server e il controllo di chi sei — e con il wifi del locale
  collegato ma muto quella risposta non arriva. Adesso l'app parte da quello
  che sa già: chi sei l'ha letto poco fa, e il conto ce l'aveva in mano la
  coda un istante prima. È un tocco che si fa trecento volte a sera.

- **Girando fra «Comande» e «Ordini» non si torna indietro nel tempo.**
  Avanzavi un ticket al banco, giravi la pastiglia, e il conto era ancora
  dov'era — finché non arrivava la risposta del server, che offline non
  arriva mai. Adesso le due viste raccontano sempre la stessa cosa: il gesto
  si vede da tutte e due le parti nell'istante in cui lo fai. E un conto con
  due comande in due passi diversi si legge dal passo più indietro — se una
  comanda è ancora da fare, il conto è ancora da fare.

### Sotto il cofano

- **Le due lavagne a colonne hanno smesso di essere scritte due volte.** La
  coda dei conti e quella del banco sono viste diverse — una dice come sta
  andando la serata, l'altra cosa c'è da fare adesso — ma il contorno era lo
  stesso, copiato: la testata col conteggio e il totale, la card di un conto
  appena battuto e ancora in volo, il bollo dell'acconto, il piede col ⋯ e il
  tasto grande. Una novantina di righe in doppio, e una correzione da fare in
  due posti. Adesso il contorno è uno; le due viste restano due, che un conto
  e una comanda non sono la stessa cosa.

- **La coda prepara la vista che stai guardando, non tutte e quattro.**
  Griglia, corsie, lista e schede venivano rifatte a ogni ridisegno e se ne
  mostrava una: con centoventi conti erano una diciottina di passate sulla
  lista e quattro ordinamenti buttati, ogni volta che si premeva un tasto
  nella ricerca, si apriva una card o arrivava qualcosa dal server. In una
  serata piena sono centinaia. Adesso si calcola quella in pagina, e le tre
  linguette in corso/chiusi/annullati si contano in un giro solo invece che
  in sei.

- **Via una vista che non esisteva.** Nel codice della coda c'erano ancora le
  quattro colonne del servizio sui CONTI — con tanto di «Da incassare» — e
  non le accendeva più niente: a tenerle in piedi erano soltanto i loro test,
  che le raccontavano come se ci fossero. I passi del servizio si guardano
  dalla vista del banco, che è fatta per quello. E il tasto sulla card di un
  conto adesso dipende da com'è messo il conto, non da come si chiama la
  colonna: è la lezione della colonna del pronto divisa in due, dove un nome
  nuovo aveva fatto sparire il tasto.

- **Il totale di un conto si rifà in un posto solo.** Modificare le righe dal
  telefono del cliente, aggiungere al conto, dividere una comanda e
  correggerla dal banco rifacevano tutti e quattro lo stesso conto — righe,
  coperto, costo di servizio, mancia, sconto — ognuno con la sua copia delle
  stesse righe di codice. Adesso è una sola: se un giorno cambia una regola
  sui soldi, cambia per tutti e quattro insieme, e non c'è il gesto rimasto
  indietro che fa pagare una cifra diversa.

- **Toccare una card costa la metà**: avanzare una comanda, dividerla o
  cambiare il modo di consegna si rileggevano il conto dal server subito dopo
  averlo scritto, per restituire un valore che nessuna schermata guardava. Con
  centocinquanta comande a sera erano centinaia di letture buttate, tutte
  dentro il momento in cui si preme il tasto. Sulla linea del locale che va e
  viene, è il momento in cui si nota.

- **Le ripetizioni segnate al giro di rilettura sono state tolte**, tutte
  insieme: le preferenze di questo terminale hanno un solo posto in cui
  leggere e scrivere, le pastiglie «sceglie un modo» delle Impostazioni sono
  un pezzo solo invece di quattordici copie, il riquadro dell'aggiornamento
  magazzino è uno invece di tre, e il numero «a fine serata» lo calcola una
  funzione sola per la tabella e per le card. Non cambia niente di quello che
  si vede al banco: cambia che d'ora in poi si corregge in un posto.

- **Il carico a colli non può più restare indietro**: la quantità è sempre
  cartoni × pezzi per collo, calcolata sul momento. Prima era un numero
  tenuto a parte, da rifare a ogni campo toccato — e chi cambiava i pezzi per
  collo dopo aver scritto i cartoni caricava quello di prima.

- **Un giro di rilettura sul lavoro di questa versione** (riuso,
  semplificazione, efficienza, profondità): la stessa regola adesso sta in un
  posto solo dove prima era scritta due o tre volte, e sono spariti due pezzi
  di codice nati qui e mai usati. Il travaso del magazzino non rilegge più
  tutti i prodotti a ogni lotto — con quattrocento articoli erano sedici
  letture complete, in fila, mentre chi sta al banco guarda la barra — e la
  coda fa meno lavoro a vuoto a ogni disegno. Quello che è emerso e non si
  poteva sistemare senza cambiare comportamento è finito nel registro come
  lavoro da fare, con scritto cosa costa non farlo.

- **Il database di prova nasce completo**: ogni articolo ha costo e IVA
  d'acquisto (così margini e prezzo consigliato hanno da lavorare) e ci sono
  quattro utenze, una per ruolo — admin, bartender, sala, cliente — con
  password `collaudo123`.

### Al banco

- **Senza gli stati del servizio, il conto non parla di passi**: le righe si
  intestavano «In preparazione» anche in un locale che non segue la
  preparazione. La divisione dei pagati invece resta sempre — quella parla di
  soldi, non di lavoro — con le righe da pagare prima e i pagati in fondo.

- **Il ⋯ sulla card di una comanda**: da lì si rimanda indietro un ticket
  segnato per sbaglio, si apre la preparazione parziale e si ristampa —
  senza aprire il ticket. Il tasto grande resta uno solo, quello che si
  preme di corsa.
- **Il dettaglio di una comanda si allarga sul tablet**: da uno schermo
  largo in su le righe stanno a sinistra e le azioni a destra, ferme in
  alto, invece di far scorrere fino in fondo per trovare il tasto. Sul
  telefono non cambia niente.

- **Servizio o ritiro si sceglie anche dal ticket**: nel dettaglio di una
  comanda ancora da fare o in preparazione ci sono «🍸 Servizio» e «🚶
  Ritiro», con scritto accanto che valgono per tutto il conto — perché il
  modo è del conto, e da un ticket non sarebbe ovvio. Da «pronto» in poi
  non si cambia più: il drink è già uscito.
- **Con le colonne del pronto divise, «Da ritirare» aveva perso il suo
  tasto**: la card mostrava solo «Conto» e la comanda non si poteva far
  avanzare. Adesso il tasto dipende dallo stato della comanda e non dalla
  colonna, quindi è lo stesso comunque si guardi la coda.

- **In un locale a solo servizio non si propone più «Prego recarsi al
  bancone»** quando si annulla un ordine: manderebbe il cliente dove nessuno
  lo aspetta. In Impostazioni la voce resta visibile ma spenta, col perché e
  il rimando; nel dialogo di annullo non compare, e la frase proposta è
  quella dello staff.
- **La comanda si divide anche mentre la stai preparando.** «✂️ Preparazione
  parziale» era sparita del tutto nei locali che fanno nascere le comande già
  in preparazione, e comunque non si poteva dividere un giro già al banco —
  che è proprio il caso vero: sto facendo cinque gin tonic, ne mando fuori tre
  adesso e due dopo. Adesso si divide finché il drink non è uscito dal banco, e
  le due parti restano tutte e due in preparazione. Da «pronto» in poi il tasto
  non c'è: quella è roba sul vassoio.
- **Col salto «nascono già in preparazione», il passo «da fare» sparisce dove
  non serve**: niente pastiglia «↩︎ Da fare» per rimandarci una comanda — in
  quel locale nessuno guarda quella colonna — e niente voce nel filtro
  «▦ Colonne», che accenderebbe una colonna sempre vuota. Se però una comanda
  ci si trova lo stesso, la colonna compare da sé: il lavoro non si nasconde
  mai.
- **Al banco il passo si chiama «Da fare» ovunque**, come la colonna. Le
  pastiglie dicevano «Ordine ricevuto» accanto a una colonna intitolata «Da
  fare», e sembravano due cose diverse. Al cliente resta «Ordine ricevuto»,
  che è quello che serve a lui.
- **Le righe aggiunte a un conto nascono «da fare»**, non «in preparazione».
  Aggiungendo un giro a un conto che aveva già qualcosa al banco, quelle righe
  risultavano già prese in carico da qualcuno: sparivano dalla colonna «Da
  fare» e non le cominciava nessuno. Se una comanda «da fare» c'è già ci
  confluiscono — è lo stesso giro — se no ne nasce una. Con
  «Le comande nascono già in preparazione» acceso, tutto come prima.
- **Lo stato del conto è in testata**, accanto al numero, invece che in fondo
  sopra il Totale: è la domanda con cui si apre un conto, e ora si legge dove
  la si fa — nello stesso posto dei bolli sulle card della coda.
- **Incassare non fa più sparire i drink ancora da fare.** Si prendeva i soldi
  di un conto con dei giri ancora al banco e quelli si volatilizzavano dalla
  coda — tornavano solo ricaricando la pagina. I soldi erano già presi e i
  drink ancora da versare: adesso restano nella loro colonna, col bollo
  «Pagato».
- **Servizio o ritiro si decide sul conto**, non più una volta per tutte nelle
  impostazioni. Un tavolo che viene a ritirare al banco succede tutte le sere:
  adesso si cambia da «Dati conto» in un tocco. Occhio che tocca i soldi — il
  ritiro azzera coperto e costo di servizio — e la schermata lo dice prima che
  si prema. Su un conto con un acconto il modo si cambia ma i supplementi
  restano quelli su cui si è incassato; su un conto chiuso serve prima
  «Riapri conto».
- **L'impostazione del locale adesso dice come NASCONO i conti**, e si sceglie
  fra due mondi: «Solo servizio» oppure «Ritiro e servizio». Dentro il
  secondo si dice con che modo nascono e se lo può scegliere il cliente
  ordinando dal telefono — voce spenta, col motivo, se i clienti non ordinano.
- **La colonna del pronto si può dividere in due**: «Da servire» e «Da
  ritirare», da «▦ Colonne». Di suo resta una sola, col badge sulla card che
  dice come va consegnato. È una scelta di quel terminale: il tablet della
  sala e quello del banco non guardano lo stesso lavoro.
- **In magazzino si conta sempre a pezzi.** La scheda di un prodotto non
  chiede più che tipo è né in che unità si compra: l'unità è il pezzo — un
  cubetto, un limone, una bottiglia — e la sola domanda che resta è «a quanto
  corrisponde un pezzo», che si può anche lasciare vuota (allora in ricetta si
  dosa solo a pezzi). Lo stesso prodotto si vende in più modi — il
  Jägermeister va nel Jägerbombo e si serve a cicchetto — e dichiararlo una
  volta per tutte non funzionava.
- **I prodotti che c'erano già si aggiornano quando lo dici tu.** Entrando in
  Magazzino, se ci sono ancora schede scritte con le unità di ieri — litri,
  chili, «U» — un avviso lo dice e resta lì finché non è fatto. «Guarda cosa
  cambia» mostra prima, senza toccare niente, quanti prodotti si aggiornano e
  con che giacenza; se qualcuno non si può aggiornare da solo lo elenca per
  nome, con scritto cosa gli manca (i limoni comprati al chilo e spremuti in
  centilitri, o un contenuto scritto «330» senza dire se sono cl o grammi).
  Solo quando sono tutti a posto compare il tasto per aggiornare, e da lì si
  scrive un pezzo per volta, con l'avanzamento a vista: se si interrompe si
  ricomincia e riprende da dov'era.
  Nel frattempo i numeri si leggono già giusti — giacenze, costi e ricette
  dicono quello che dicevano prima — ma non si può caricare, contare né
  aggiungere prodotti: si possono aprire solo quelli da sistemare, che è
  l'unico modo di sbloccare. E se i dati arrivano già a posto, di tutta
  questa faccenda non si vede niente.
  L'elenco dice sempre come stanno le cose adesso, non dieci minuti fa: lo
  rilegge ogni volta che lo apri, e a fine aggiornamento il cartello sparisce
  da solo. Se qualcuno cancella un prodotto da un altro terminale mentre
  l'aggiornamento gira, quel prodotto si salta e te lo dice («2 prodotti non
  ci sono più: sono stati saltati»); se ne nasce uno nuovo, se lo prende. E
  se proprio si ferma, dice quanti ne ha aggiornati e che si può riprovare
  senza fare danni — invece del messaggio del database.
- **Nel filtro del magazzino c'è «In scorta»**, cioè quello che sullo scaffale
  c'è davvero. Prima si poteva chiedere solo cosa sta finendo e cosa è finito:
  per vedere il resto bisognava guardare «Tutti» e saltare a occhio due terzi
  di righe esaurite. Sta per prima delle tre e ha il suo conteggio, e dentro ci
  sono anche gli articoli in esaurimento — sono in magazzino, solo pochi, e
  l'ultima bottiglia di gin è proprio quella che serve sapere. Così il conto
  torna: in scorta più esauriti fa il totale.
- **Il fornitore che manca si aggiunge dalla scheda del prodotto.** In fondo
  alla tendina Fornitore c'è «➕ Nuovo fornitore…»: basta il nome, e resta
  già selezionato sul prodotto che si stava compilando. Prima bisognava
  uscire, andare in Fornitori, crearlo e ricominciare la scheda da capo —
  proprio nel momento in cui ci si accorgeva che mancava. Gli altri dati
  (indirizzo, contatti, email per gli ordini) si mettono dopo, con calma.
- **«pz» al posto di «bottiglie», dappertutto.** Qui dentro ci sono cubetti,
  limoni, barattoli e ore di lavoro: la parola che vale per tutti è il pezzo.
  Il costo di un prodotto si legge «€/pz» e non più «€/conf.», il segno dei
  prodotti buoni non parla più di bottiglie, e nel generatore ordini la riga
  che diceva «1 conf. = 700 pz» — il contenuto letto nell'unità sbagliata —
  adesso dice «1 pz = 70 cl». Restano le «piene, aperta, finite» del
  dettaglio: quelle raccontano cosa c'è sullo scaffale, non come si misura.
- **Carico e conta si scrivono nell'unità che si ha in mano.** Accanto alla
  quantità c'è la scelta fra pezzi e contenuto: la cassetta di limoni si
  carica a chili, i centilitri rimasti in una bottiglia si contano in
  centilitri, e i pezzi li ricava il contenuto. Sotto la quantità si legge
  quanto entra davvero in magazzino, prima di confermare — e per la merce
  comprata a peso c'è scritto che il conteggio in pezzi è una stima: un limone
  non pesa sempre uguale.

- **Le comande possono nascere già in preparazione** (Impostazioni → Gestione
  preparazione). Di suo una comanda nuova sta in «Da fare» finché qualcuno non
  tocca «Lo preparo io» — che dice anche chi — ma dove si versa nell'istante
  in cui si batte quel passo è un tocco in più a ogni comanda, tutta la sera.
  Vale allo stesso modo per il primo giro di un conto nuovo e per le aggiunte a
  metà serata: prima erano due regole diverse, e la card in coda cambiava
  colonna da sola appena arrivava dal server.
- **Il tasto per guardare il lavoro dice dove porta**: «🍸 Comande» guardando
  i conti, «🧾 Ordini» guardando le comande. Prima era un interruttore che si
  accendeva quando le comande le stavi già guardando, e per capirlo bisognava
  guardare le colonne. Sta nella riga dei filtri, in fondo a destra e staccato
  dagli altri: quelli restringono la lista, questo cambia vista.
- **«Ritirato/Servito» si preme una volta sola.** La card tornava indietro da
  sé e bisognava ripremere: lo scarico del magazzino, che lavora in
  sottofondo, riscriveva le comande com'erano prima di partire e si portava
  via l'avanzamento appena fatto.
- **Quello che si tocca si vede subito, dappertutto allo stesso modo.** La
  coda, il conto e il dettaglio della comanda tenevano ognuno una copia sua
  di «questo l'ho appena fatto io», e si comportavano già in modo diverso:
  adesso è una sola. Una comanda aggiunta a metà serata compare col numero e
  nel passo che avrà davvero, invece di cambiare tutti e due un istante dopo.
- **La cassa non si chiude con dei drink ancora da fare.** Prima bastava non
  avere conti aperti — ma un conto si paga in anticipo e resta con le sue
  comande al banco: si poteva chiudere la serata con tre drink pagati e mai
  usciti. Adesso il tasto resta spento e dice cosa manca, in una riga:
  «Prima servi 3 comande», o «Prima chiudi 2 conti e servi 3 comande».
- **La striscia di stato si vede anche sui temi chiari.** Nelle colonne
  «Ritirato/Servito», «Chiuse» e «Annullate» il bordo a sinistra delle card
  era bianco trasparente: sul fondo chiaro spariva, e una card senza
  striscia è una card senza stato.
- **La card non si spacca più con tante colonne aperte.** Con sei corsie
  accese le righe andavano su due colonne di testo anche dove non ci
  stavano, spezzando i nomi e mandando i prezzi fuori dal riquadro: adesso
  è la card a sapere quanto spazio ha, e si adatta da sé al numero di
  corsie, alla larghezza dello schermo e allo zoom.
- **Un conto incassato è un conto chiuso.** Prima, con gli stati del servizio,
  restava fra quelli «in corso» finché qualcuno non lo serviva: si prendevano
  i soldi e il conto non si trovava fra i chiusi. Adesso ci va subito — in
  griglia, in lista, a schede, nei conteggi e nelle corsie — e dentro
  «💶 Chiusi» c'è un filtro in più: **tutti · ✅ Serviti · ⏳ Da servire**,
  per sapere quali hanno ancora qualcosa da portare al tavolo. Le comande
  annullate non contano: un drink annullato non deve tenere un conto «da
  servire» per sempre.
- **Via «Nascondi pagati»**: serviva a togliersi dagli occhi i conti già
  incassati quando restavano in mezzo a quelli in corso. Adesso non ci sono
  più in mezzo ai piedi, e un tasto per nascondere una cosa che non c'è è
  solo un tasto in più.
- **Incassare non vuol dire aver servito.** Si segnava pagato un ordine e
  alcune comande ancora in preparazione risultavano servite: quei drink
  sparivano dagli occhi di chi doveva farli, e il magazzino veniva scaricato
  per roba mai uscita. Succedeva soprattutto pagando un tavolo intero. Adesso
  il pagamento non tocca il servizio: il conto resta aperto finché non è
  uscito tutto, e a chiudere è solo chi lo dice — «Riscuoti e servi», o gli
  stati del servizio spenti.
- **Dal ticket si divide.** «✂️ Preparazione parziale» adesso c'è anche nel
  dettaglio della comanda: preparare tre gin tonic su cinque si decide
  guardando il ticket, ed è lì che sta chi lo guarda. Dopo la divisione la
  schermata porta da sé sul pezzo che si è detto di preparare adesso, che è
  quello che si ha in mano.
- **Le comande annullate si ritrovano.** Se ne separava una e quella di
  partenza si volatilizzava: adesso la colonna «Annullate» le raccoglie
  tutte — tolte a mano, divise in due, o cadute con un conto annullato — e
  sulla card c'è scritto quale delle tre è stata, perché una divisione non è
  un drink saltato.
- **Una colonna in meno al banco.** «Da incassare» conteneva gli stessi drink
  di «Ritirato/Servito», solo raggruppati per conto invece che per ticket:
  due colonne per la stessa cosa. Resta «Ritirato/Servito», con le comande
  come le altre; se il conto è ancora da pagare lo dice il bollo sulla card,
  e il tasto porta in cassa.
- **«🍸 Comande» si trova anche in griglia.** Chi tiene la cassa lavora in
  griglia perché è quella che gli serve per i conti: adesso può dare
  un'occhiata a com'è messa la preparazione senza passare dalle Impostazioni
  a cambiare vista e poi tornare a rimetterla com'era.
- **La comanda ha una schermata sua.** Toccando una card nella coda del banco
  si apre il ticket: le sue righe per intero con prezzi e note, i quattro
  passi del servizio con l’ORA in cui sono stati toccati — così si vede se
  siamo indietro o se quella comanda è stata dimenticata — il tavolo, il
  nome, e il tasto grande per portarla avanti (o le pastiglie per riportarla
  indietro, anche di più di un passo). Prima toccando la card si apriva il
  conto: dal banco quella è la seconda domanda, non la prima.
- **Al conto si risale sempre**: c’è un tasto in cima alla comanda («Apri il
  conto #41») e uno piccolo sulla card in coda («🧾 Conto»), accanto a quello
  dell’avanzamento e non al suo posto — quello si preme di corsa. Incassare,
  aggiungere righe e dividere restano cose del conto.
- **Chi ha il ruolo bartender ha una coda sua: quella del LAVORO.** Chi prepara
  non lavora un conto per volta, lavora un ticket per volta — e adesso ogni
  card è una comanda, col numero del conto e (solo se il conto ne ha più d'una)
  il numero della comanda, e il tasto fa avanzare quella lì, non tutto il
  conto. Si apre da sé: ad accenderla sono **gli stati del servizio** — se
  sono spenti quella coda non esiste, perché non ci sarebbe niente da mostrare,
  e al banco si vede la coda come la vedono tutti. Come disegnarla si sceglie in
  Impostazioni → Coda ordini → «La vista del banco», accanto alla vista della
  coda: per ora c'è «🚦 Corsie di stato», e da lì passeranno le prossime.
- **La coda di chi guarda la serata non cambia**: con «corsie di stato» l'admin
  vede sempre i conti in corso, chiusi e annullati. Se vuole sapere a che punto
  è la preparazione c'è la pastiglia «🍸 Comande», che porta a guardare il
  lavoro come il bartender — a mano, e solo su quel terminale.
- **Al banco le colonne si scelgono**: «▦ Colonne» spegne quelle che in quel
  momento non servono — «Da incassare» compresa, che chi sta allo shaker non
  incassa — e ne accende due per guardare indietro, «Chiuse» e «Annullate».
  È una scelta di quel terminale: al banco e alla cassa non si guardano le
  stesse cose, e si ritrova al ricarico.
- **Le colonne si chiamano come gli stati**: «In preparazione» al posto di «Al
  banco», «Ritiro/Servizio» al posto di «Al ritiro», e il tasto che ci porta
  dice la stessa parola — «In preparazione», non «Lo preparo io». Al banco c'è
  in più la colonna **«Ritirato/Servito»**: il lavoro finito si deve vedere
  finito, anche quando il conto è ancora da incassare.
- **Un conto appena incassato passa fra i chiusi**, anche se al banco c'è
  ancora da servire: prima restava «in corso» e chi aveva appena preso i
  soldi lo cercava fra i chiusi senza trovarlo. Quelle corsie parlano del
  conto; il lavoro rimasto si guarda nelle corsie delle comande, dove la
  comanda pagata e non ancora fatta resta al suo posto col bollo «Pagato».
- **Un acconto si vede dalla card**: il bollo «💳 Acconto» e la striscia
  arancione, come nella griglia. Senza, chi porta il conto al tavolo chiede
  l'intero — ed è già successo.
- **Un conto pagato in anticipo non sparisce dal banco**: la sua comanda resta
  nella colonna del suo passo, col bollo «Pagato» e la card accesa, perché i
  soldi ci sono ma il drink è ancora da fare. Una comanda risulta chiusa solo
  dopo essere stata servita.
- **Si può preparare mezza comanda.** Capita di vedere tre gin tonic in una
  comanda e due in un'altra e prepararli insieme, per farli uscire in una
  volta: nel conto → Comande, su una comanda ancora «da fare», c'è
  «✂️ Preparazione parziale». Si sceglie quanti se ne fanno adesso: quelli
  vanno al banco in una comanda nuova, il resto resta da fare, e la comanda di
  prima resta nella storia del conto, segnata «divisa» — così la copia già
  stampata ha ancora un riscontro e non si perde per strada un drink. Fra gli
  annullati non compare: quei drink non sono saltati, sono le due comande
  nate al loro posto.
- **Aprendo il conto si vede cosa è al banco e cosa è già uscito**: le righe si
  raggruppano sotto «In preparazione», «Pronto», «Servito», come già accade
  per quelle pagate. Con una comanda sola — il caso normale — non cambia
  niente: nessun titolo per dire una cosa sola.
- **I tasti sopra la lista si possono ridurre**: «Unisci», «Dati conto» e
  «Prodotto libero» sono tre righe di schermo prese alla lista dei drink, e col
  «▴» accanto ai ⋯ si tolgono di mezzo — restano tutti nel ⋯, e «Comande» resta
  comunque a vista. La scelta è di quel terminale e si ritrova al ritorno. Nel
  ⋯ sono finite anche la storia del conto e «Svuota», che stavano fra i tasti
  che si premono di corsa: svuotare un conto è la cosa più irreversibile della
  schermata.
- **Il lucchetto della cassa adesso ha un nome.** Sugli schermi larghi era
  un'icona grigia in fondo alla barra e nessuno sapeva cosa fosse: adesso c'è
  scritto «🔒 Chiudi cassa» (o «🟢 Apri cassa»), e quando non si può chiudere
  il perché sta sotto quel tasto: «Prima chiudi 2 conti».
- **La coda ordini si può guardare a «Corsie di stato»** (Impostazioni → Coda
  ordini): quattro colonne — da fare, in preparazione, ritiro/servizio, da
  incassare — con in testa quanti conti ci sono e quanto fanno, e ognuna che
  scorre per conto suo. Su ogni card un tasto solo, quello del passo dopo: «In
  preparazione», «È pronto», «Ritirato/Servito», «Incassa». Il conto già pagato ma non ancora
  consegnato resta al ritiro col bollo «Pagato» — non sparisce prima di essere
  servito — e quelli da incassare mostrano la cifra in grande. Toccando la card
  si apre il conto, come sempre. Con gli stati di servizio spenti le corsie
  diventano le tre di sempre: in corso, chiusi, annullati.
- **Il flusso di cassa si allarga sugli schermi grandi**: le tessere si
  affiancano invece di incolonnarsi in una striscia da scorrere, e restano
  larghe solo l'andamento per ora e la chiusura. Sul telefono niente cambia.
- **Le ore della serata sono in ordine di serata**: le 8 del mattino dopo
  venivano prima delle 23 della sera, perché contava l'orologio e non la
  nottata. Quando una serata tocca due giorni, ogni colonna porta la data.
- **Un conto nuovo nasce «da fare»**, non già «in preparazione»: si battono
  tre conti di fila e poi si comincia a versare. È il tasto «In preparazione»
  a dire quando si comincia.
- **Un ordine può tornare indietro**: nelle azioni della card e nel dettaglio
  ci sono le pastiglie «↩︎ Torna a…» con tutti gli stati già passati — non
  solo il precedente. Prima, se si segnava «pronto» il conto sbagliato,
  restava solo annullarlo e ribatterlo.
- **Niente più doppione «Consegnato» / «Segna come Ritirato-Servito»** nelle
  corsie: erano lo stesso gesto a un dito di distanza.
- **Sulla stampa il lettore si chiama «SumUp»** e la carta «Carta di
  Credito»: chi confronta la chiusura con l'estratto conto cerca quel nome.
- **I conti lunghi si leggono su due colonne** (da dieci righe in su, dove lo
  schermo lo regge): stessa roba in metà altezza.
- **Le card delle corsie non crescono più a dismisura**: si vedono sei
  righe, le altre sfumano e un piccolo «▾ altre 12» le apre. Ogni riga porta
  il suo prezzo e la sua nota, e la nota del conto respira.
- **Sulle card «⋯ Azioni» e il tasto della corsia stanno sulla stessa riga**,
  invece di occupare due fasce larghe tutta la card.
- **Le note del conto si scrivono in un riquadro grande**: in una casella da
  una riga una frase si scriveva alla cieca.
- **Nella coda, su tablet e computer i tasti stanno fuori dal ⋯**: pannelli,
  verso della lista e cassa sono icone accanto alla ricerca, e si vede quando
  i pannelli sono accesi. Sul telefono restano nel menu, che lì lo spazio non
  c'è.
- **Su un conto chiuso o annullato ci sono due sole azioni**: ristampare lo
  scontrino e riaprire il conto. Prima c'erano anche «Contanti» e «Carta»
  spenti, che sono solo rumore addosso a chi cerca l'unica cosa che serve.
- **Nelle corsie il tasto «↕» inverte davvero l'ordine**, in tutte le
  colonne insieme: prima girava solo la griglia e lì non faceva niente.
- **Nel riquadro di riapertura i tasti dicono «Annulla» e «Riapri»**, due
  parole invece di due frasi che andavano a capo.
- **Nelle corsie di stato le card hanno «⋯ Azioni»**: incassare, stampare
  comanda o scontrino, annullare — le stesse azioni della coda, senza
  cambiare vista.
- **Le corsie prendono tutta la larghezza**: con gli stati di servizio
  spenti sono tre, e restavano schiacciate a sinistra.
- **L'andamento per ora è un grafico nel tempo**: una colonna per ora, da
  sinistra a destra, così si vede la forma della serata — il picco, la coda.
  Era una riga per ora, una sotto l'altra.
- **I metodi di pagamento stanno dentro «Incassato serata»**, non più in un
  riquadro a sé che non si capiva a quale numero appartenesse.
- **Da sloggati la campanella non c'è**: chi non è entrato è un cliente
  qualunque sulla parte pubblica, e gli avvisi parlano di ordini che non ha
  fatto. Spariscono anche «registra questo terminale» e lo storico, che sono
  cose del gestionale.
- **In coda le card non hanno più «Storia» e «Ripristina»**: una riga intera
  su ogni conto, tutta la sera, per due cose che si fanno ogni tanto. Si
  trovano dentro il conto, in «⋯ Azioni».
- **Unisci e separa sono una voce sola** anche nel menu ⋯, come il tasto in
  barra: mostra quella che si può fare adesso.
- **Sul telefono «svuota il conto» sta nel ⋯**, dove c'è posto per dirlo a
  parole invece che con la sola icona.
- **Uscendo, gli avvisi si cancellano**: erano di chi li ha ricevuti, e il
  telefono passato a un altro mostrava la serata di prima.

## 1.4.8 — in collaudo

### Sotto il cofano

- **Le issue nascono anche dai rami di rilascio**: un push che tocca i
  registri (requisiti e bug) apre quelle che mancano, senza duplicarle e
  senza chiuderne nessuna. Prima bisognava aspettare `main`.

### Al banco

- **La scheda prodotto parte da una domanda: che tipo è?** Quattro card —
  «Lo vendo intero», «Lo verso nei drink», «Sfuso, a peso o volume»,
  «Lavoro o servizio» — e ognuna mostra solo i suoi campi: spariscono la
  tendina delle unità a famiglie e la casella «è una scorta», che adesso
  le decide il tipo. Per chi versa, «una bottiglia fa…» va scritto per
  forza: senza, non si sa il costo al cl e il magazzino non scala quello
  che si versa — e la scheda si ferma spiegandolo. Le schede già salvate
  si riaprono da sole nel tipo giusto.
- **Un drink si duplica**: nelle azioni della card del menù c'è «📋
  Duplica». Si apre la scheda già piena, col nome marcato «(copia)»: la
  ricetta non si riscrive ingrediente per ingrediente. Si salva quando è
  pronta, e l'originale non si tocca.
- **Niente più cartello «I gruppi sono spenti»** in coda per chi i gruppi
  non li usa: resta solo a chi li ha accesi ma tenuti fuori dalla coda.
- **Uscendo, il telefono smette davvero di suonare**: si spegne il token
  degli avvisi di quel browser, non solo la riga nell'elenco dello staff.
  Prima continuavano ad arrivare le notifiche degli ordini del cliente.
  Rientrando si riaccende da sé.
- **«Esci» non resta più appeso** quando la rete non c'è.
- **I temi cambiano davvero tutta la schermata**: l'oro di casa era scritto
  a mano in una dozzina di posti — il tab acceso, il «+», i tasti dei
  pannelli, gli aloni del fondo — e quelli restavano dorati con qualunque
  tema.
- **Con gli stati di servizio spenti, la vista a schede ha tre schede**: In
  corso, Chiusi e Annullati — le stesse della griglia, con le stesse regole.
  Prima mostrava i cinque passi del lavoro, quasi tutti vuoti, e i conti
  stavano tutti sotto «Ordine ricevuto». Ricerca e «Miei» filtrano dentro la
  scheda in cui si sta.
- **Il database di prova si apre sulla griglia**, che è la vista di casa: il
  seed imponeva la vista a schede.
- **Una ricetta cambiata al volo non si dimentica più**: il gin buono messo
  a mano su una riga tornava quello di listino, col suo costo, se si usciva
  subito.
- **Battendo in fretta e uscendo subito non si perde più niente** (BUG-016):
  tre tap sullo stesso drink e via verso la coda ne lasciavano uno. Adesso
  quello che si è battuto parte nell'istante in cui si esce.
- **Il pagamento vede sempre tutto il conto, anche mentre il conto nasce**
  (BUG-017): battendo di corsa e aprendo subito il pagamento — o
  chiudendolo, battendo ancora e riaprendolo prima che il server
  rispondesse — si vedeva solo il primo giro di righe, e chiudendo il
  pagamento il conto restava vuoto a schermo. Adesso il pagamento legge il
  conto com'è a schermo, le righe battute mentre l'ordine nasceva lo
  raggiungono da sole, e un prezzo o una ricetta ritoccati in quell'attimo
  non tornano più di listino.
- **Aprendo un prodotto si legge quanto ce n'è, per primo**: dove si conta a
  pezzi lo dice la riga «Pezzi» (quante piene, quella aperta, quanto fa una),
  altrove la giacenza. Prima c'erano soglia, costo e prezzo consigliato, ma
  non il numero per cui lo si apre.
- **«A quanto corrisponde un pezzo» adesso si spiega**: è quanto CONTIENE un
  pezzo, non quanto ne va in un drink — quello lo decide la ricetta. Si può
  lasciare vuoto (e in ricetta si dosa a pezzi, come la birra), e accanto
  c'è un «?» che racconta i due casi.
- **Il chilo fra le unità d'acquisto**: i limoni si comprano al chilo, e
  prima c'era solo il grammo.
- **La resa si scrive come si dice**: «5 kg rendono 1,5 l», con la quantità
  su tutti e due i lati, e l'unità d'uso si sceglie fra tutte — l'Aperol si
  compra a bottiglia e si versa in cl. Lo scarico fa la proporzione.
- **Anche pezzi e unità generiche hanno «Lo uso come lo compro»**: una birra
  si compra e si serve a bottiglia, e non le si chiede altro.
- **In creazione si scrive quanto se ne ha, nell'unità in cui si compra**,
  invece di «quante confezioni piene».
- **Il tasto indietro chiude la scheda prodotto** e riporta al magazzino,
  invece di uscire dalla pagina buttando via quello che si stava scrivendo.
- **La scheda prodotto chiede meno**: sparisce la domanda su quanto contiene
  una confezione (comprando a chili, una confezione è un chilo), e il
  contenuto di un pezzo — o la resa — resta a vista, da compilare solo se
  serve.
- **La soglia di avviso è sempre nell'unità in cui si compra** — è il
  prodotto comprato che sta finendo — e l'etichetta lo dice.
- **Il prezzo si scrive nell'unità in cui si compra**: «€/kg» per i limoni,
  «€/pz» per le bottiglie, «€/U» per il tempo di lavorazione. L'etichetta
  diceva sempre «€/pz» anche per un prodotto comprato a chili, e chi
  scriveva il numero non sapeva a cosa si riferisse.
- **Cambiando il modo di gestire un prodotto, l'avviso dice su cosa fa il
  conto** (il contenuto di una confezione) e avverte se la resa dichiarata
  non serve più.
- **Un prodotto contato a unità può essere una scorta**: il ghiaccio si
  conta a unità come il tempo di lavorazione, ma finisce — e ora si scarica.
  Nella scheda c'è la casella «È una scorta: si scarica quando si usa»,
  spenta di suo, così la manodopera resta com'era.
- **La scheda prodotto fa tre domande, sempre le stesse**: come lo compri,
  come lo usi in ricetta, e — solo se sono diverse — **quanto rende**. Così i
  limoni si comprano al chilo e si spremono in cl («1 kg rende 50 cl» —
  dietro un interruttore, perché quasi tutti i prodotti si usano come si
  comprano), il
  ghiaccio a sacchi e si usa a grammi, il gin a bottiglia e si versa a cl. In
  alto c'è un **«?»** che spiega le tre domande con gli esempi. I prodotti già
  in magazzino non cambiano di una virgola.
- **Le domande sulle unità del magazzino sono scritte come si parla**:
  «Quanto contiene una confezione che compri?» e «A quanto corrisponde un
  pezzo?», con scritto sotto che non toccano la giacenza. E un pezzo può
  contenere **unità** (1 pz = 10 U), che in ricetta si dosano a unità.
- **Il carico a colli sta dietro un interruttore**, e quando è acceso il
  riquadro del cartone viene prima: si scrive quanti pezzi ha e quanti ne
  arrivano, e la quantità si conta da sé — non si corregge a mano.
- **Le righe appena aggiunte non spariscono più**, nemmeno quando devono
  aprire una comanda nuova: restano a schermo mentre volano al server, e se
  la scrittura non passa tornano in bozza.
- **Il pagamento vede le righe appena battute** (BUG-015): battendo di corsa
  e aprendo subito il pagamento, le ultime righe restavano fuori — nel conto
  27 €, nel pagamento 21 € — perché la schermata guardava il conto come lo
  sapeva il server.
- **Su un conto chiuso «Rimetti in corso» c'è una volta sola**: stava sia in
  cima al pannello sia in fondo, al posto di «Pagamento».
- **Le macro-categorie sono due elenchi**: quelle del magazzino (quello che
  si compra) e quelle del menù (quello che si vende, nella nuova
  sottosezione «Macro-categorie» del menù). Su ogni macro di spesa si sceglie
  a quale macro di vendita corrisponde: è l'aggancio che servirà a confrontare
  speso e incassato.
- **Le griglie hanno tutte lo stesso vestito**: magazzino, modifica menù e
  griglia del conto, con la stessa striscia a sinistra. E il colore del
  prodotto prende la forma del tema: il nastro d'angolo di casa, la
  pastiglia stondata di Catppuccin, il pallino di Pico — questi ultimi in
  alto a destra, dov'è quello delle scorte in magazzino.
- **E un tema porta anche le forme**, non solo i colori: Pico è squadrato e
  piatto, Catppuccin tondo e senza aloni, la Tana resta la Tana.

## 1.4.7 — 17 agosto 2026

### Sotto il cofano

- **In locale, da un altro dispositivo della rete, i dati adesso
  arrivano**: col Firestore emulato si parla in long-polling. Prima la
  pagina si caricava, le connessioni c'erano, ma non consegnavano niente —
  e a schermo restava «il wifi risulta collegato ma non sta passando
  niente».

### Al banco

- **«Annulla» funziona mentre si batte un conto nuovo**: il tasto della barra
  azioni era spento per tutta la creazione, anche a righe già battute, e chi
  aveva aperto il conto per sbaglio non aveva un modo evidente di uscire.
  Adesso i due tasti «annulla» seguono la stessa regola; a conto ancora vuoto
  non chiede nemmeno conferma, torna in coda.

- **Nella vista menù, chi lavora non vede più i propri ordini in cima**:
  lì si prende un ordine, gli ordini stanno in coda.
- **In «Da servire» il tasto è «Aggiungi ordine»** e porta alla schermata
  del conto, la stessa del «+» in coda: prima mandava al menù del cliente.

- **Dal dettaglio di un ordine si aggiunge e si incassa.** «Modifica
  ordine» apre la schermata del conto con la griglia dei prodotti,
  «Pagamento» la apre già sul pagamento: prima si potevano solo cambiare le
  quantità di quello che c'era, e per una birra in più — o per incassare al
  tavolo — si tornava in coda a riaprire il conto dal banco.
- **Nel magazzino i titoletti del dettaglio sono in grassetto**: a fine
  serata, pezzi, soglia, costo e prezzo al cl si distinguono dai numeri.

- **Le card del magazzino sono un po' più larghe**: aperto il dettaglio,
  costo, IVA e prezzo consigliato non si spezzano più su tre righe.

- **«Salva modifiche» dice che ha salvato** e riporta alla coda: prima il
  tasto tornava com'era e non si capiva se fosse andata.

- **Gli avvisi si possono spostare nella campanella.** Nel profilo, accanto
  a quali avvisi ricevere, si sceglie: la strisciolina in alto su ogni schermata (come
  adesso), oppure un fumetto che esce dalla campanella e compare **solo
  nella coda ordini** — toccandolo si aprono gli avvisi. Chi sta in cassa o
  in magazzino non viene più interrotto.

- **La ⓘ si può spegnere** (Impostazioni → Vista ordine), per chi il
  listino lo sa a memoria e vuole le card pulite.
- **La riga «💳 Pagati» torna sulla sua riga**: finiva accanto al primo
  item pagato.
- **La ⓘ su ogni card dice come si fa il drink**: ingredienti con le
  quantità e la preparazione a parole. Nella scheda del prodotto c'è un
  campo nuovo, «Come si prepara» — shakerato o mescolato, il ghiaccio, il
  bicchiere — perché la ricetta dice cosa ci va, non il gesto. I drink di
  esempio ce l'hanno già tutti.

- **Il «+» sulla riga del conto aumenta e basta**: apriva anche la scheda
  dell'item, ogni volta.

- **Separando le righe uguali, ognuna ha la sua quantità.** Prima il «−»
  sulla prima di tre le spegneva tutte e tre: chi divideva il conto si
  ritrovava da capo, e se non se ne accorgeva il cliente pagava meno di
  quello che aveva preso. Ora si spegne quella che tocchi.

- **Il numero sulla card e le righe del conto dicono la stessa cosa** anche
  quando il conto porta l'id di un prodotto che non c'è più (cancellato e
  rifatto, o catalogo reimportato): si riconosce dal nome, invece di
  lasciare la card senza contatore con le righe lì sotto a vista.

- **Le modifiche che non passeranno mai ora si capiscono e si scartano.**
  Se una scheda del magazzino (o un conto) non esiste più, riprovare non
  serve: la campanella lo dice a parole e offre di toglierle, invece di
  restare rossa per sempre con un errore in inglese.

- **Le timbrature hanno la loro voce in Staff**: erano in cima al
  calendario, e per battere l'ingresso di chi arriva bisognava passare
  dalla schermata dei turni.

- **Le righe del conto si riordinano davvero**: tasto «organizza», maniglie,
  e la riga che segue il dito mentre le altre si scansano — la stessa cosa
  della griglia dei prodotti. Fuori da «organizza», toccare una riga la apre.
- **Aprendo le azioni di una card in coda cresce solo quella**, e le card
  sotto scendono: prima si allungavano tutte quelle della riga.

- **Aprire e chiudere la cassa è del banco**: alla sala quelle voci non
  compaiono più, né nel menu ⋯ né come tasto sul banner della cassa
  chiusa — dove ora legge che la deve aprire il banco.
- **«Mostra QR al cliente» compare solo con gli stati del servizio
  attivi**: senza, non ci sarebbe niente da seguire.

- **La password si può guardare**: l'occhio accanto al campo, all'accesso e
  nel profilo. Parte sempre coperta.

- **La schermata del conto nuovo si apre pulita, sempre.** Uscendo da
  qualunque parte, quello che è stato battuto diventa un conto e la bozza
  si chiude: non ci si ritrova più dentro le righe di quello prima.
- **Un tasto 🧹 per svuotare il conto**, invece di togliere venti righe una
  per una col «−». Chiede conferma.
- **Annullare un conto appena battuto lascia un conto annullato**, anche se
  l'ordine non era ancora nato: il numero era già stato preso e di quello
  che si è battuto resta traccia.
- **Nella storia del conto la stessa persona si chiama sempre allo stesso
  modo**: il nome, con il ruolo fra parentesi. Prima compariva tre volte
  con tre etichette diverse — l'email all'apertura, il ruolo all'annullo,
  il nome alla riapertura.
- **La storia del conto non perde più pezzi**: «Conto aperto» compare anche
  prima che il server risponda, e restano tutte le chiusure, non solo
  l'ultima.
- **Le impostazioni del menù sono tre voci distinte**: «Menù clienti» (con
  anche i suoi colori), «Gestione menù» e «Catalogo prodotti». Davanti a un
  interruttore non si capiva a quale delle tre appartenesse.

- **Quello che non è riuscito a partire riparte da solo** quando la rete
  torna: prima restava lì finché qualcuno non apriva la campanella e
  premeva «riprova» — e al banco non lo fa nessuno. Dopo tre tentativi si
  ferma e lo segnala, perché a quel punto serve una persona.

- **Il conto nuovo non eredita più le righe di quello prima.** La bozza
  aspettava la sincronizzazione per svuotarsi: uscendo prima, il conto
  dopo si apriva con dentro la roba già battuta.
- **«Invia comanda» e «Annulla ordine» funzionano subito**, anche su un
  conto appena battuto: prima erano spenti finché il server non
  rispondeva. Annullare un conto non ancora aperto butta la bozza e
  riporta alla coda.
- **Nella schermata di pagamento si capisce da dove viene il numero**:
  «RIGHE SCELTE» quando lo componi toccando le righe, «IMPORTO A MANO»
  quando lo batti — e in quel caso è un acconto, scritto lì sotto.

- **Si capisce che cosa è stato pagato.** Al posto di «Sconto e acconti già
  incassati −15,00 €» ci sono righe distinte: lo sconto, e ogni incasso col
  metodo e l'ora. Un importo battuto a mano si chiama **acconto** e non
  finge di coprire delle righe; chi paga scegliendo le righe le vede
  elencate sotto l'incasso.
- **Niente più attese del server quando si tocca un conto**: incassare,
  annullare, avanzare o aggiungere righe si vede all'istante, e il
  riepilogo in cima alla coda si muove con te.

- **Le attese ora si vedono**: entrando, aprendo la cassa o cercando nello
  storico, tre bollicine dicono che l'app sta lavorando — e dicono anche
  cosa sta aspettando, invece di una scritta ferma che sembra un blocco.

- **Il conto nasce all'istante e non si sdoppia.** Prima di scrivere un
  ordine l'app faceva tre domande al server: da lì l'attesa fra
  «Conferma» e il conto a schermo, e due conti battuti di fila potevano
  prendere lo stesso numero (i due #15 della stessa serata). Ora i numeri
  sono già in casa e ci si ricorda quelli dati.
- **Due terminali che battono insieme non litigano più sul numero**: se il
  telefono della sala e il tablet del banco prendono lo stesso #15, il
  server decide — tiene il numero chi è arrivato prima, l'altro passa al
  primo libero da solo, e sul conto resta scritto da quale numero veniva
  (la comanda può essere già uscita dalla stampante).
- **Tornare agli ordini non aspetta più il server**: il box del nome
  compare subito e il conto si scrive per conto suo.
- **Il «+» apre sempre un conto nuovo**: capitava che riaprisse quello
  appena battuto.

- **La cassa si apre e si chiude dalla coda**: nel menu ⋯ c'è «Apri cassa»
  se è chiusa e «Chiudi cassa» se è aperta — spento, con il perché
  scritto, finché ci sono conti aperti. «Apri cassa» chiede il fondo
  (facoltativo) in un box con Apri e Annulla, anche dal banner in alto.

- **Staff e Utenti hanno tre sezioni nel menu laterale**: calendario,
  nuovo turno, paghe orarie; utenze registrate, nuovo account, buoni VIP.
  Erano pannelli che aprendosi spingevano giù quello che si era venuti a
  guardare.
- **La maniglia del menu si prende davvero**: sta fra il menu e la pagina,
  non più sotto la barra di scorrimento. E nel menu non si scorre più in
  orizzontale: allargandolo, i nomi ci stanno.

- **Stringendo le categorie a lato non restano più le pastiglie grigie.**
  Dove le voci non hanno un'icona non c'era modo di capire quale fosse
  quale: ora si tolgono di mezzo e resta il tasto per rimetterle.

- **Il menu laterale si allarga tirando il bordo**, e cresce tutto
  insieme — testo e icone. Doppio clic sulla maniglia per tornare alla
  misura di partenza; la larghezza scelta resta anche domani.

- **Nel magazzino i numeri si scrivono come li si pensa**: il contenuto
  per confezione in litri o cl («0,7 l», com'è sull'etichetta) e la soglia
  di avviso **in pezzi** — «avvisami quando resta una bottiglia» — invece
  che in millilitri.

- **Uscendo, gli avvisi di quel dispositivo si spengono** — chi si era
  scollegato sentiva ancora suonare gli ordini del locale sul telefono di
  casa — e rientrando si riaccendono da soli.
- **Se gli avvisi sono spenti, ora si vede.** Una riga in cima lo dice e
  offre il tasto per attivarli; se si rifiuta per sbaglio ricompare,
  perché è proprio quello il caso da coprire.

- **Il flusso cassa parla durante la serata, non solo alla chiusura**:
  quanto deve esserci in cassa adesso (fondo + contanti), il conto medio
  con i coperti e quanto lascia una persona, chi ha incassato e quanto —
  se alla cassa si sono alternati in più d'uno — e com'è andata l'ultima
  ora, non solo la curva.

- **Nella lista ordini si cercano anche le serate passate.** C'è un
  calendario come quelli degli alberghi: tocchi un giorno per vedere
  quella serata, ne tocchi un altro per arrivare fin lì. Sopra, le
  scorciatoie: oggi, ieri, ultimi 7 e 30 giorni.
- **E si può guardare solo quello che arriva dai clienti**, o solo quello
  battuto al banco e in sala. Il filtro compare solo se di ordini dai
  clienti ce n'è.
- **Le scorte si scalano quando il drink è servito**, non quando lo si
  prende in carico: un drink iniziato e poi non fatto — riga tolta,
  cliente che cambia idea — portava via gli ingredienti lo stesso. Fino a
  lì restano *impegnati* e si leggono nella colonna «a fine serata».
  Senza gli stati del servizio non cambia niente: si scala alla riscossione.
- **«Riscuoti e servi», se lo volete.** Con gli stati del servizio
  incassare non chiude il conto (si paga anche in anticipo). Ma al banco
  spesso si consegna e si incassa nello stesso gesto: da Impostazioni →
  Gestione preparazione si accende un secondo tasto che fa le due cose
  insieme.
- **Nel riepilogo in cima alla coda ci sono anche gli annullati**, accanto
  ad aperti e chiusi. Fuori dal totale, che sono i soldi veri.
- **«A fine serata» contava anche i conti già chiusi**, e con un tavolo
  solo segnava mezzo listino in esaurimento. Ora guarda solo i conti
  ancora aperti — quelli incassati e serviti il magazzino l'hanno già
  scalato. E il riepilogo in cima alla coda conta esattamente i conti che
  si vedono sotto, qualunque tab sia aperta.
- **Il magazzino dice quello che ti ritrovi a fine serata.** Accanto alle
  scorte c'è una colonna con quello che resterà se tutti i conti aperti
  vengono incassati così come sono: i drink già fatti sui tavoli hanno
  promesso quegli ingredienti, e la domanda a metà servizio è «mando
  qualcuno a prendere una bottiglia?». Il numero cambia appena l'item
  entra nel conto; a cassa chiusa la colonna non c'è.
- **I numeri in cima alla coda sono di questa apertura di cassa.** Dopo
  una chiusura e una riapertura si leggeva ancora l'incasso della serata
  prima: contavano la giornata, non l'apertura. A cassa chiusa sono zeri.
- **I numeri in cima alla coda non cambiano più cambiando tab**: sono
  cumulativi — aperti, chiusi e annullati di questa apertura di cassa.
- **Un conto annullato adesso resta nella sua tab**, anche se era aperto
  giorni prima: spariva dallo schermo nell'istante in cui lo si annullava,
  e non si capiva se l'operazione fosse andata a buon fine. Stessa cosa
  per la cassa: un tavolo aperto ieri e incassato stasera è incasso di
  stasera.
- **Nella coda ci sono solo i conti di questa apertura di cassa.** Chiusi
  e annullati di prima dell'ultima chiusura non compaiono in nessuna tab:
  sono già stati contati e rendicontati, e stanno in Cassa → lista ordini.
  I conti *aperti* restano sempre, anche a cassa chiusa: quelli sono da
  chiudere.
- **Le impostazioni della stampante sono di chi è collegato**, oltre che
  del dispositivo: sullo stesso tablet ognuno ha il suo indirizzo e la sua
  stampa automatica. La prima volta si parte da quelle che il dispositivo
  aveva già, così nessuno resta senza stampante a servizio iniziato.
- **Le schede della griglia hanno il rilievo delle card della coda**:
  ombra e una sfumatura appena accennata. Erano riquadri piatti su fondo
  piatto, e con le colonne strette si leggevano come un blocco solo.
- **Le timbrature dello staff sono passate in Staff**, in cima alle ore:
  stavano in fondo alla cassa, e per battere l'ingresso di chi arriva
  bisognava passare dal flusso di cassa.
- **«Flusso cassa» si chiama Cassa e ha tre sezioni**: flusso, lista
  ordini, chiusure. Erano tre posti per la stessa domanda, e due si
  raggiungevano da tasti in fondo alla pagina — che si trovano solo
  scorrendo fino in fondo.
- **Il Menù ha tre sezioni nel menu laterale**: modifica menù, categorie,
  marginalità del listino. Erano due pannelli a scomparsa in cima al
  catalogo, e aprirli spingeva giù tutta la griglia.
- **Le schermate si aprono già com'erano.** Aprendo un conto le strisce
  comparivano colorate per un istante e poi sparivano, in un locale che le
  aveva spente: le impostazioni arrivano dal server e per quel momento non
  c'erano. Ora si riparte dall'ultima volta.
- **La striscia a sinistra delle card si sceglie.** Quattro modi:
  **spenta**, **colore del prodotto**, **colore della categoria** (quello
  del singolo prodotto resta nella linguetta) e **scorte** — rosso
  ingrediente esaurito, arancione in esaurimento, e «ce n'è abbastanza»
  grigio o verde, come preferisci. La griglia del conto si imposta in
  *Vista ordine*, le schede del catalogo in *Menù e catalogo*: dipende da
  come si lavora, e non c'era motivo che lo decidessimo noi. La
  **linguetta** nell'angolo continua a mostrare il colore del prodotto,
  qualunque cosa dica la striscia. Anche il verde/grigio del «ce n'è
  abbastanza» si sceglie separatamente per le due schermate: nel conto si
  batte di corsa e una griglia tutta verde è rumore, nel catalogo il verde
  dice che si può fare.
- **Le statistiche si aprono sull'ultima chiusura di cassa**, e quel
  periodo è il primo della riga: la domanda del mattino dopo è «com'è
  andata ieri sera», non «com'è andata la settimana». Chi sceglie un altro
  periodo se lo tiene.
- **Giornaliero e Mensile per macro sono passati nel menu**, come le
  sezioni di Magazzino e Impostazioni: una riga di chip in meno sopra una
  schermata già fatta di tabelle.
- **Il conto annullato mostra cosa c'era dentro.** Si apriva vuoto, a zero
  euro e senza una riga: non si capiva né cosa contenesse né se valesse la
  pena riaprirlo. Ora le righe si vedono, barrate — non fanno somma,
  perché quel conto non lo paga nessuno.
- **«Chiamate staff e gruppi» non è più un tasto che non fa niente.** Con
  un solo account non c'è nessuno da chiamare e il pannello spariva da sé:
  ora lo dice, e dice dove si creano gli account.
- **In «Organizza» la card non scappa più fuori dalla griglia.**
  Portandola oltre il bordo destro partiva uno scorrimento senza fine, e
  per rivedere le altre card bisognava riportare indietro la barra a mano.
- **Nella coda c'è la tab «✖️ Annullati».** Stavano fra i «Chiusi», che
  sono i soldi della serata: facevano numero senza essere incassi, e per
  ritrovarne uno da riaprire si cercava in mezzo a quelli buoni.
- **Il «+» della coda e il tasto del pagamento hanno lo stesso oro del tab
  acceso.** Sui temi chiari restavano più smorti: il colore dei tasti
  seguiva il tema di contorno, quello del tab no. Ora è lo stesso, e i
  temi di casa (Chiaro, Crema) non lo cambiano più — restano temi della
  Tana, non di un altro locale.

---

## 1.4.5 — 16 agosto 2026

### Al banco

- **Nelle pagine col menu aperto, menu e contenuto scorrono ognuno per
  conto suo.** Scorrendo il contenuto se ne andava via anche il menu, che
  di suo non ha niente da scorrere. E chiudendolo non passa più, per un
  istante, il pannellone a scomparsa che scivola via da sinistra.
- **Chi annulla un conto non riceve l'avviso del proprio annullamento.**
  Arrivava anche a lui: lo sa già, e in mezzo al servizio è rumore. Agli
  altri terminali arriva come prima.
- **I tasti tornano dell'oro di sempre.** Facendoli seguire il tema erano
  venuti più smorti — l'estremo scuro del gradiente non era più lo stesso
  — e il «+» della coda si riconosceva meno. Sul tema di casa il colore è
  identico a quello in produzione; sui temi che cambiano i bottoni resta
  il loro.

---

## 1.4.4 — 16 agosto 2026

### Per chi gestisce

- **Il menu torna a restare aperto** in Impostazioni e Inventario: non si
  apriva più e il tasto non rispondeva. Una parentesi graffa mancante nel
  foglio di stile — arrivata sciogliendo un conflitto — faceva ignorare al
  browser trecento righe, quelle del menu agganciato comprese.
- **In fondo al menu si legge di nuovo il ramo**: c'era la versione due
  volte (`v1.4.3 · v1.4.3 · …`). Da quando si pubblica taggando, al posto
  del ramo arrivava il nome del tag.

---

## 1.4.3 — 16 agosto 2026

### In sala

- **Chi prende l'ordine al tavolo stampa la sua comanda**, dal proprio
  telefono. Prima non usciva niente: la comanda arrivava al banco solo se
  lì qualcuno teneva aperta la coda ordini con la stampa automatica accesa
  — che era spenta. L'indirizzo della stampante i telefoni ce l'avevano
  già: mancava l'ordine di stamparla.
- **Un pallino nella coda dice se la comanda uscirà**, prima di averne
  bisogno: verde la stampante risponde, rosso adesso non uscirebbe — e
  toccandolo si legge perché e come rimetterla a posto — bianco qui non
  c'è nessuna stampante impostata. Non è una stampa di prova: è la stessa
  chiamata che farebbe la comanda, senza carta. Si ricontrolla da sé, e
  appena si torna sull'app: è lì che si scopre che il permesso di
  sicurezza della stampante è scaduto, invece che a metà servizio.
- **La sala lavora sulla stessa coda del banco.** «I miei ordini» non è
  più una pagina a parte: è il filtro «Miei» dentro la coda. Dal menu
  laterale si apre «Nuovo ordine dal menù» — lo stesso menù che si mostra
  al tavolo, che ora per chi lavora ha anche la ricerca per nome o
  ingrediente.

### Per chi gestisce

- **I tasti dello zoom stanno solo dove servono**: coda ordini, il conto
  (mentre lo batti, riaprendolo, all'incasso) e flusso cassa. Nelle altre
  schermate erano due tasti nell'angolo che coprivano il contenuto per una
  cosa che lì nessuno usa. Il livello scelto resta: si smette solo di
  poterlo cambiare da lì.
- **Nel menu le ultime voci non si accavallano più**: quando lo spazio
  finiva, «Capo Bar / Admin» e «Esci» si stringevano uno sopra l'altro.

- **Nelle pagine con più sezioni il menu resta aperto**, dal tablet in
  verticale in su:
  in Impostazioni e in Inventario non copre più il contenuto, è una colonna
  della pagina e il resto si stringe per fargli posto. Dentro l'inventario
  si salta fra Prodotti e Conta venti volte di seguito, e ogni volta
  bisognava aprire il menu, cercare, scegliere — e intanto non si vedeva
  più dove si era. È **incastrato nella pagina**, attaccato alla barra in
  alto e a filo del bordo — non una scheda arrotondata appoggiata sopra —
  e occupa poco: le voci sono parole corte, e prima mezza colonna restava
  vuota. Le sezioni della pagina aperta stanno **dentro** la loro voce,
  non in un blocco a parte. Si apre e si chiude **col ☰ di sempre**, e la
  scelta resta anche il giorno dopo. Sulla coda ordini resta a scomparsa, che lì
  sarebbe una colonna in meno di conti.

### Al banco

- **La card che stai spostando non è più trasparente**: alzandola si
  vedevano le altre attraverso, e non si capiva quale si stava spostando.
- **«Organizza» non cambia più la disposizione della griglia** — né
  quante card per riga, né la loro altezza. La maniglia
  stava a fianco della card e allargava ogni riquadro; e la card, dentro
  «organizza», non si allungava più fino a riempire la sua casella. Si
  finiva per sistemare una disposizione diversa da quella che si usa
  davvero. Ora la maniglia sta sopra la card, sul suo bordo, e la card
  riempie la casella come fuori; e le card non rimpiccioliscono più, né
  lampeggiano cambiando modo — entrando in organizza la griglia veniva
  rifatta da capo e per un attimo si vedevano le card della misura
  sbagliata. E **restringendo la griglia con la maniglia** non si vedono
  più due colonne a metà trascinamento: il minimo lo calcola il browser
  insieme al ridimensionamento, invece di una misura che arrivava dopo. La griglia non si riassesta nemmeno più
  da sola quando compare la barra di scorrimento.

- **Nella coda, «In servizio» torna vicino al ☰** e, sul telefono, sulla
  sua stessa linea: il rientro era scritto a mano e lasciava un buco, e la
  scritta si appoggiava all'altezza dei tasti scivolando sotto il ☰.
- **Il pallino della stampante si legge come un tasto** anche mentre
  controlla: prima, col pallino grigio, restava un'icona sospesa senza
  cornice.
- **Nel conto la riga dice quanto fa, non quanto costa uno.** Con tre
  birre uguali si leggeva «4,00 €»: il totale della riga non c'era
  proprio, e per sapere quanto faceva bisognava moltiplicare a mente col
  cliente davanti. Ora, come su uno scontrino: «3 × 4,00 €» accanto al
  nome e **12,00 €** a destra, vicino ai tasti.
- **Si sceglie chi stampa le comande prese in sala** (Impostazioni →
  Stampante): il telefono di chi prende l'ordine, oppure il banco. Se si
  sceglie il banco e la stampa automatica è spenta, l'impostazione lo dice
  subito — altrimenti non stamperebbe nessuno.
- Nel pagamento, **«Separa uguali» mostra le unità come tutte le altre
  righe**: nome, prezzo e il contatore − 1/1 +. Prima erano caselline da
  spuntare, e nella stessa colonna convivevano due modi diversi di dire la
  stessa cosa.
## 1.4.2 — 16 agosto 2026

Porta nella linea di sviluppo tutto quello che è uscito con la **1.3.2**
(qui sotto): il conto che si riapre dal tasto del pagamento e torna un
conto normale — incassi tolti anche dal flusso di cassa, righe di prima
modificabili, buoni rimessi a posto — e gli avvisi che arrivano davvero a
tutti i terminali tranne quello che ha battuto l'ordine.

Chi lavora sulla versione di prova trova in più, rispetto alla 1.3.2, le
cose che erano già in 1.4.0 e 1.4.1.

---

## 1.4.1 — 14 agosto 2026

### Al banco

- **Le Impostazioni entrano tutte nella finestra**, senza scorrere la
  pagina: la testata in alto, il piè di pagina in fondo, e in mezzo
  l'elenco delle sezioni e il contenuto, che **scorrono ognuno per conto
  suo** — l'elenco resta lì mentre si legge la sezione, invece di
  trascinarsi via insieme alla pagina.
- **Sulle card del menù i due segni dicono cose diverse, dove uno se le
  aspetta.** La **striscia a sinistra** dice come sta il prodotto — verde
  si può fare, arancione un ingrediente sta finendo, rosso non si può
  fare — come sulle card della coda dice com'è messo il conto. Il colore
  al banco è diventato una **linguetta nell'angolo**, disegnata come sulle
  tile del POS: si tocca per cambiarlo. Prima erano un quadratino che
  sembrava un'etichetta (ed era un tasto) e un pallino il cui rosso
  diceva due cose opposte.
- **Anche le tile del POS hanno la striscia a sinistra**, come le card
  della coda e del menù: lo stesso oggetto si riconosce allo stesso modo
  in ogni schermata.
- **«Ultimi movimenti» non è più un tastone in fondo alla lista**: è una
  sezione del menu del magazzino, con gli ultimi cento invece di trenta.
- **«Separa» ora separa davvero tutte le righe.** Si univa tutto, si
  premeva Separa e tornavano su solo le ultime voci: le altre mostravano
  quantità 1 e le righe in più non comparivano. Nascevano tutte con lo
  stesso identificativo, e a schermo le righe si distinguono per quello.
- **Nel magazzino i due segni dicono due cose.** Il **pallino** dice
  quanta roba c'è (verde/arancione/rosso), la **striscia** che assortimento
  è: grigia in assortimento, blu in linea, oro premium, rossa fuori
  assortimento. Prima dicevano tutti e due la stessa cosa.
- **Nel menù la striscia dice com'è messo il prodotto**: grigia non è in
  menu, verde le scorte ci sono, arancione un ingrediente sta finendo,
  rossa un ingrediente è finito. Il rosso prima diceva due cose opposte —
  «l'ho tolto io» e «è finito il rum» — che chiedono azioni diverse.
- **L'intestazione della tabella del magazzino non scorre più via**:
  scorrendo trecento prodotti si perdevano i nomi delle colonne, e «6,20 €»
  senza sapere se è con o senza IVA non vuol dire niente.
- **In «Organizza» il trascinamento funziona come ci si aspetta**: la card
  segue il dito, le altre si spostano per farle posto, e lasciandola resta
  dove l'hai messa. Si può riordinare anche **da tastiera**. La maniglia è
  attaccata alla card — erano due oggetti con una fessura in mezzo — e ha
  il colore di casa al posto della macchia senape.
- **Le sezioni di una pagina stanno nel menu a scomparsa**, rientrate sotto
  la pagina aperta: un posto solo per navigare, uguale sul telefono e sul
  computer. In pagina costavano una colonna o una riga tutto il giorno;
  nella barra reggevano cinque voci, non ventidue.
- Nel conto, **la storia è un'icona in alto** accanto al numero: da tasto
  largo si prendeva una riga intera accanto a Unisci, Separa e Comande.
- **Sul telefono la barra in alto respira.** C'erano otto cose in una riga
  e il nome del locale finiva in «La …»: ora sotto i 700px restano il
  logo, il menu, dove sei e le azioni. L'«indietro» sparisce perché il
  menu fa quello che fa lui e in più — dalla coda alle impostazioni in un
  tocco solo. I tasti restano grandi: si toglie, non si rimpicciolisce.
- **Le sezioni di una pagina si scelgono dalla barra in alto.** Nel
  magazzino (Prodotti, Conta, Ordini, Scadenzario, Categorie,
  Macro-categorie, Fornitori, Movimenti) e nelle Impostazioni: il **titolo
  della pagina è il comando**, con la freccia. Prima erano file di tasti o
  una colonna a sinistra — spazio occupato tutto il giorno per una scelta
  che si fa ogni tanto. **Sul telefono** si apre il foglio dal basso, lo
  stesso gesto di «⋯ Azioni».
- **I filtri del magazzino stanno su una riga sola**, e ora c'è scritto
  che sono filtri: sembravano un riepilogo, e nessuno pensava di toccarli.
  Il valore di magazzino resta lì accanto, ma non si tocca: è un numero da
  leggere.
- **Nel magazzino scorre solo la lista**: filtri, ricerca e categorie
  restano fermi. Prima si risaliva da capo per tornare alla ricerca.
- **Il titolo della pagina è passato nella barra in alto**, accanto al
  nome del locale: dentro la pagina si prendeva una riga in cima al
  contenuto, e su un tablet al banco quella riga si vede.

---

## 1.4.0 — 13 agosto 2026

### Al banco

- **La versione mostrata dall'app è quella giusta.** Sull'ambiente di
  test diceva 1.2.0 mentre ci girava sopra la 1.3.0.
- **Sullo scontrino c'è scritto «Carta di credito», non «Carta».** A fine
  serata la striscia si divide per metodo a colpo d'occhio: «Carta» e
  «Contante» si somigliano troppo. Stesse parole anche sulla chiusura di
  cassa, così i due fogli si confrontano senza tradurre a mente.
- **Dopo un aggiornamento l'app dice cosa è cambiato.** Il riquadro con le
  note esce ogni volta che arriva una versione nuova — che tu abbia toccato
  «Nuova versione disponibile», riaperto l'app da un tablet rimasto
  indietro o ricaricato la pagina. Una volta sola, e ne resta traccia
  nella campanella.
- **Le notifiche si dividono in da leggere e lette.** Una letta sparisce
  dall'elenco e finisce nello **storico**, che si apre dalla campanella:
  in mezz'ora di servizio un elenco che non si svuota mai diventa un muro
  di righe vecchie, e non ci si guarda più. Aprire la campanella non basta
  a segnarle lette: si toccano, oppure c'è «segna tutte lette».
- **Ogni avviso si può spegnere**, uno per uno: nuovo ordine, i singoli
  passaggi della preparazione, le scorte e la nuova versione. La scelta
  vale **su quel dispositivo e per chi è collegato** — al banco serve
  «nuovo ordine», in sala «pronto», sul portatile nel retro niente — e sta
  in Impostazioni → 🔔 Notifiche.
- **Un ordine battuto su un altro terminale ora si vede.** Prima, se lo
  mandava un bartender, gli altri dispositivi non ricevevano nulla: chi
  stava in sala col telefono non sapeva che al banco era entrato un
  ordine. Adesso avvisa tutti tranne chi l'ha appena mandato.
- **Un conto chiuso o annullato si può rimettere in corso.** Chiuso sul
  tavolo sbagliato, annullato per un malinteso, o il cliente che torna:
  dai ⋯ del conto si riapre, scrivendo — se si vuole — il perché. Gli
  incassi già presi restano dove sono e il dovuto si ricalcola da sé; le
  comande già servite restano servite, tornano da fare solo quelle
  annullate col conto. Se il conto annullato era pagato con un **buono
  VIP**, riaprendolo il saldo si ri-addebita: lo sconto deve restare
  pagato da qualcuno.
- **Ogni conto ha la sua storia**, dietro i ⋯: aperto, chiuso, annullato,
  riaperto — con l'ora, chi l'ha fatto e il motivo della riapertura. E il
  motivo si legge anche dentro il conto riaperto, senza cercarlo: un conto
  in corso con dentro un incasso, senza una spiegazione, è solo un
  mistero.
- **L'app si chiama «La Tana del Coniglio»**, non più con la sigla del
  progetto — e a chi lavora l'icona dice di chi è: col suffisso del ruolo
  (« - admin», « - bartender», « - staff»). Il cliente vede il nome nudo.
  Il telefono fissa quel nome quando si installa l'app: per averlo giusto,
  installala da collegato col ruolo che ti serve.
- **Le Impostazioni stanno tutte in uno schermo**: l'elenco delle sezioni
  scorre per conto suo invece di trascinarsi dietro tutta la pagina — e la
  testata non scivola più via proprio mentre si cerca una voce.
- **L'«indietro» è passato nella barra in alto**, fra il menu e il nome:
  dentro la pagina si mangiava la prima riga di ogni sezione.
- **Lo zoom non galleggia più sopra i pannelli aperti** (i ⋯, le conferme):
  stando in basso a sinistra finiva sopra le ultime voci e si toccava lui
  al posto della voce.
- Nella coda, da tablet in su, **«In servizio» è staccata dal tasto menu**:
  prima gli stava addosso.

---

## Non ancora rilasciata — 1.3.4

### Al banco

- **Il magazzino non scende più sotto zero.** Battendo un prodotto finito la
  giacenza andava in negativo (il Jagermeister a −0,04 pz, con «valore
  −0,67 €»), e il guaio si vedeva dopo: caricando la bottiglia comprata il
  conto ripartiva dal buco e ne risultava meno di una, mentre sullo scaffale
  c'era tutta. Adesso si scarica al massimo quello che c'è, un carico riparte
  sempre da zero e il valore in euro non va mai in negativo. Al banco non
  cambia niente: il conto si batte come prima, anche se la scorta è finita.
- **Sulle card del magazzino i numeri si scrivono come si leggono.** Sotto al
  Campari si leggeva «7.49000000001 pz», col punto e la coda di decimali del
  calcolo: adesso sono due decimali e la virgola, in tutto il magazzino. E
  sotto al numero grande dei pezzi ci va il **contenuto** — «749 cl» — invece
  di ripetere gli stessi pezzi: è il dato che serve a chi sta versando.
- **Il dettaglio di un prodotto resta dentro la card.** Aprendo un prodotto
  nella vista a Card il pannello sbordava e il testo si spezzava a
  fisarmonica, con costo, IVA e prezzo consigliato uno sopra l'altro. Adesso
  ogni voce è incolonnata — etichetta sopra, valore sotto — e si legge tutta.
  Anche la fila dei tasti **Modifica · Duplica · Elimina** sta nel riquadro:
  quando la card è stretta i tasti vanno a capo e si leggono per intero, invece
  di sfondare i bordi a destra e a sinistra. Nella vista a Lista, dove lo
  spazio c'è, non cambia niente.
- **La manodopera si mette a listino, in unità generiche.** Un prodotto del
  magazzino si può misurare in **U** — «Unità generiche», nel menu delle unità
  di misura — per quello che non si versa e non si pesa: il **tempo di
  lavorazione**. Si mette nella ricetta dei drink che richiedono preparazione,
  col suo costo per unità, e così il lavoro entra nel costo del drink e quindi
  nel prezzo consigliato. Prima si potevano scegliere solo litri, centilitri,
  grammi o pezzi, e nel Daiquiri si leggeva «Tempo di Lavorazione 1 g». Tre
  cose che contano: **non è una scorta** — non si scala quando il drink si fa e
  non risulta mai esaurito, quindi il drink non sparisce dalla carta e il tempo
  non finisce negli ordini al fornitore — **non entra nel valore del
  magazzino**, e **in carta al cliente non si vede**.

---

## 1.3.3 — 16 agosto 2026

### Al banco

- **Le scorte si contano in pezzi, con la virgola.** Una bottiglia da
  100 cl con dentro 50 cl è **0,5 pz**; due piene da mezzo litro e una a
  cui mancano 10 cl fanno **2,8 pz**. Prima si leggeva «3 bott.», che dice
  quante bottiglie si toccano e non quanto prodotto c'è: tre bottiglie di
  cui una quasi vuota contavano come tre, e per sapere se bastavano per la
  serata bisognava aprire il dettaglio. Sparisce anche il «piena / aperta
  46 cl / esaurito» di fianco: col conteggio a pezzi è già nel numero —
  «0,5 pz» dice da sé che è mezza, «0 pz» che è finita. Le bottiglie —
  piene, aperta, finite — restano nel dettaglio, per chi va a contarle
  sullo scaffale.
- **Le unità restano coerenti**: il pezzo è la bottiglia, il contenuto si
  legge sempre in cl (o in grammi). Nel dettaglio si leggeva «1 aperta
  (40 pz) · 1 conf. = 200 pz», che a chi sta versando non dice niente.
- **Caricando si può contare a cartoni**: dicendo quanti pezzi ha un
  cartone, i pezzi si riempiono da sé (2 × 24 = 48). Chi carica bottiglie
  sfuse lascia il cartone da parte e scrive i pezzi, come sempre.
- **«Inventario» si chiama Magazzino**, come lo chiama chi ci lavora.
- **Un prodotto si può duplicare**, fra Modifica ed Elimina: il magazzino
  è pieno di quasi-uguali — stessa bottiglia in due formati, lo stesso
  amaro di un altro fornitore — e rifarli da zero vuol dire ribattere
  costo, confezione, categoria, soglia e IVA. La copia parte **a zero** e
  si apre subito, perché il nome va cambiato.

---

## 1.3.2 — 15 agosto 2026

### Al banco

- **Un conto chiuso o annullato si può riaprire.** Chiuso sul tavolo
  sbagliato, annullato per un malinteso, o il cliente che torna e vuole
  ordinare ancora su quello: si riapre **dal tasto del pagamento**, che su
  un conto chiuso era lì spento a non fare niente, scrivendo — se si vuole
  — il perché.
  Torna un conto **normale, come se non fosse mai stato pagato**: le righe
  si modificano tutte e quello che era stato incassato **esce dagli
  incassi della serata**, perché quel conto è di nuovo da incassare. Resta
  scritto nella storia del conto quanto è stato tolto, e le comande già
  servite restano servite. **Se era stato pagato con un buono, il saldo
  torna al cliente**: se no lo pagherebbe due volte, una col buono e una
  quando ripaga il conto.
- **Nel conto riaperto si modificano anche le righe di prima.** Erano
  bloccate perché quelle comande risultavano servite: ma riaprire serve
  proprio a togliere il giro battuto sul tavolo sbagliato. Le scorte si
  riallineano da sé.
- **Chiudere, annullare e riaprire un conto non aspettano più la rete.**
  Prima di scrivere, l'app rileggeva il conto dal server: con una rete
  lenta la coda restava indietro e il conto chiuso compariva sotto
  «Chiusi» solo dopo. Ora legge la copia locale, che è quella che la coda
  sta già guardando.
- **Annullando un conto pagato con un buono, il credito torna al
  cliente.** Prima restava scalato: il conto non veniva incassato e il
  buono era speso lo stesso.
- **Ogni conto ha la sua storia**, dietro i ⋯: aperto, chiuso, annullato,
  riaperto — con l'ora, chi l'ha fatto e il motivo della riapertura. E il
  motivo si legge anche dentro il conto riaperto, senza cercarlo: un conto
  in corso con dentro un incasso, senza una spiegazione, è solo un
  mistero.
- **Riaprendo un conto annullato, il buono VIP torna a pagare lo sconto.**
  Annullando, il saldo tornava al beneficiario; riaprendo, lo sconto
  restava sul conto senza che lo pagasse più nessuno — credito regalato e
  conti che non tornano. Se nel frattempo il buono è stato speso altrove,
  si prende quel che c'è e lo sconto si riduce di conseguenza.
- **Nella coda, un conto chiuso compare subito sotto «Chiusi»**, e uno
  riaperto torna subito fra quelli in corso: sparivano da tutte e tre le
  liste fino a ricaricare la pagina. Sparire subito serve a «In corso» —
  il conto chiuso non deve restare lì a far dubitare — ma non allo
  storico, dove uno lo va a cercare apposta.
- **Sul telefono, a barra nascosta, la coda non finisce più sotto
  l'orologio.** Il ➕ spariva a metà sotto la barra di sistema, il ☰ si
  sovrapponeva ai conteggi e «In servizio» restava dietro la striscia: la
  coda si prendeva lo spazio dell'ora e della batteria invece di
  scansarlo.
- **La storia del conto è tornata un'icona in alto**, accanto al numero:
  da tasto largo si prendeva una riga intera accanto a Unisci, Separa e
  Comande, per una cosa che si guarda ogni tanto.
- **La notifica di un ordine nuovo arriva anche col gestionale aperto.**
  Prima veniva saltata apposta quando la coda era in primo piano — «là
  suona l'app» — ma il tablet del banco sta sulla coda tutta la sera, e
  l'avviso in pagina scartava proprio gli ordini battuti dagli altri
  terminali: in mezzo alle due regole restava il silenzio. Ora esce
  sempre, e le due notifiche si fondono in una invece di raddoppiarsi.
- **Gli ordini battuti alla cassa avvisano gli altri terminali.** Nascono
  già «in preparazione» — chi li batte sta facendo il drink — e per
  l'avviso non contavano come lavoro nuovo: chi batteva dal telefono non
  faceva squillare il tablet al banco.
- **Gli avvisi arrivano a tutti i terminali, non solo all'ultimo.** Erano
  registrati per persona: lo stesso account sul tablet e sul telefono si
  sovrascriveva, e squillava solo l'ultimo che aveva aperto il gestionale.
  Ora ogni dispositivo ha la sua registrazione.
- **La campanella dice se su questo schermo gli avvisi arrivano**, e se
  sono spenti — o se il terminale non risulta fra quelli avvisati — offre
  di sistemarlo lì. Su iPhone e iPad lo dice chiaro: la
  notifica di sistema esiste solo con l'app installata sulla schermata
  Home.
- **Gli avvisi seguono il terminale, non il ruolo.** Chi prende ordini col
  telefono con un account da gestore non li faceva più arrivare a nessuno:
  al banco non squillava niente. Ora l'unico a non essere avvisato è il
  dispositivo che ha battuto l'ordine — sa già di averlo mandato.

---

## 1.3.1 — 14 agosto 2026

### Al banco

- **Nel pagamento, due righe uguali si muovono una per volta.** Con
  «Negroni, Coca Cola, Negroni», premendo + o − su un Negroni si muoveva
  anche l'altro: la selezione andava per prodotto e le due righe
  condividevano il contatore. Peggio, togliendone una l'importo non
  cambiava — il conto risultava coperto per intero — e si incassava tutto.

---

## 1.3.0 — 12 agosto 2026

### Al banco

- **Gli item battuti mentre l'ordine sta nascendo non si perdono più.** Si
  aggiungeva un'acqua, un secondo dopo dell'altro, e quando il conto
  finiva di crearsi restava solo l'acqua.
- **Il pagamento non si chiude più da solo.** Battendo due drink di corsa
  e premendo subito Pagamento, un istante dopo ci si ritrovava sulla
  schermata dell'ordine e bisognava ripremere: la schermata spariva nel
  momento in cui il conto finiva di nascere. Dipendeva da quanto si era
  veloci, ed era peggio col cliente davanti.
- **Il totale da incassare resta scritto sul tasto Pagamento**, al netto
  di sconti e acconti già presi. Prima spariva un istante dopo il primo
  prodotto.
- **Chiudendo o annullando un conto, sparisce subito dalla coda**: non lo
  si vede più lì per un attimo, a chiedersi se l'operazione sia andata.
- **Annullando si torna alla lista ordini.**
- Il "tira per aggiornare" non parte più nelle schermate di lavoro, e se
  la pagina si ricarica lo stesso **il conto in corso viene ripreso**.

### Sul telefono

- Nel conto restano in pagina le righe, il totale e i tre gesti della
  serata — **Invia, Paga, Annulla** —; il resto sta dietro i ⋯. Ai tasti
  ingranditi al massimo restano le sole icone.
- **Il pannello del conto si alza e si abbassa** da una maniglia, da un
  quarto a tre quarti di schermo, e si apre mostrando l'ultima riga
  battuta. Le maniglie, col dito, si prendono tenendo premuto: sfiorarle
  scorrendo non cambia più niente.
- Barra in alto rifatta secondo le linee guida: tasto, titolo e due
  azioni, il resto in un menu. Niente più tasti che finiscono fuori
  schermo.
- La coda: conteggi su una riga loro, ricerca a tutta larghezza, e un ⋯
  con i pannelli e **il verso della lista** (dal primo della serata o
  dall'ultimo battuto).

### Ovunque

- **La barra in alto è la stessa su tutte le schermate** — menu, logo col
  nome, e a destra chi è collegato — e **il menu laterale si apre da
  ovunque**, anche per il cliente, col suo (menù, i propri ordini,
  accesso e profilo). Restano senza menu le due schermate in cui si
  compone un conto: da lì si esce con «← Ordini». Prima la barra cambiava
  forma a ogni pagina e il menu spariva.
- **Chi lavora non passa più dalla vetrina**: aprendo l'app, a bartender,
  staff e gestore si apre subito la lista ordini. Il QR del tavolo porta
  al menù come sempre, anche se a inquadrarlo è chi sta al banco.
- **All'accesso non ci si ritrova mai dentro il POS.** Se l'app era
  rimasta aperta su un ordine, riaprendola si tornava lì dentro — e la
  schermata riprende da sé il conto lasciato aperto: si finiva a battere
  righe in un conto che non si era scelto. Ora si parte sempre dalla
  lista ordini; al POS ci si va col ➕, come sempre.
- **I colori seguono chi guarda, non la pagina.** Chi lavora vede il tema
  del gestionale dappertutto — profilo, lista ordini, accesso compresi —;
  chi ordina vede il suo. Prima bastava un indirizzo dimenticato e in
  mezzo alla serata arrivavano i colori del cliente.
- Nelle impostazioni si cambia **il tema del gestionale e quello della
  vista cliente**, e adesso c'è scritto quale si sta toccando.
- Nella coda, **da tablet in su, titolo, ricerca e ⋯ stanno sulla stessa
  linea**, alti quanto il tasto menu; conteggi e legenda vanno sulla riga
  sotto. Prima non era allineato niente. Il ➕ resta grande com'era e
  sporge dalla riga: è il tasto che si prende di corsa. Anche il ☰ scende
  al centro della riga, a filo con «In servizio». Sul telefono i conteggi
  («3 aperti · 0 chiusi · …») partono dal bordo, allineati alla barra di
  ricerca, invece di restare sospesi a metà.
- **Impostazioni a schede**: ventuno riquadri diventano voci di una barra
  laterale, una alla volta.
- **Backup e ripristino di tutto il database**, dall'app e da riga di
  comando.
- **Buoni VIP** dentro Utenti e ruoli; **stampante** dentro Impostazioni.
- La pagina riempie lo schermo invece di stare in una colonna da 760px.
- **L'app si installa anche su iPhone** come si deve (icona, invito, e
  senza l'app installata niente schermo intero né notifiche: ora lo dice).
- **Da schermo intero si esce dallo stesso tasto** con cui si entra, che
  ora cambia icona e parole. Prima, entrati, il tasto spariva e restava
  solo F11 — che su un tablet montato al banco non c'è.
- **La ricerca dei prodotti nel POS può accendere invece di filtrare**:
  si sceglie in Impostazioni → Vista ordine. La griglia resta com'è —
  nessuna card sparisce sotto le dita — e la prima che risponde si
  illumina, con la griglia che ci scorre sopra; toccandone una la ricerca
  si azzera da sé.
- **Il menù è uno solo, quello che vede il cliente.** Aprendolo da
  bartender non si trova più un catalogo a due colonne diverso da quello
  che si sta mostrando al tavolo: gli ordini a mano si battono al POS.
  Ordinare dal menù si può lo stesso, quando le impostazioni lo
  consentono.
- **Le categorie non si nascondono più.** Il tasto che faceva sparire la
  barra a sinistra (menù, magazzino, impostazioni, rendiconto) non c'è
  più: sul telefono, dove le categorie sono già una riga che scorre, non
  serviva a niente e in cambio si perdeva l'unico modo di girare fra
  loro.
- In Impostazioni, **la giornata di lavoro è spiegata in italiano**: si
  dice a che ora finisce una giornata e ne comincia un'altra — da lì gli
  ordini ripartono dal numero 1 e le statistiche contano il giorno nuovo
  — invece di «far girare la giornata», che non voleva dire niente.
- **La ricerca nella coda può accendere invece di filtrare**: si sceglie in
  Impostazioni → Coda ordini. Lasciando la coda intera, scorre fino al
  primo conto che risponde e lo illumina — così si vede dov'è rispetto
  agli altri — e appena si tocca un conto la ricerca si azzera da sé.
- In fondo al menu c'è **la versione** che si sta guardando.
- Nel pagamento, **SumUp non porta più il sottotitolo** sotto al tasto: è
  spento e basta, e toccandolo dice che il lettore si configura in
  Impostazioni → Pagamenti (o che senza rete non può autorizzare).
- La lista degli articoli, aprendo il pagamento, **parte dal fondo**: si
  vede subito l'ultima riga battuta, non quelle di mezz'ora prima.
- Con la **gestione preparazione spenta**, nel pagamento non esce più
  l'avviso «comande non ancora servite»: senza preparazione non ci sono
  comande da servire, e usciva a ogni incasso.
- **Il tastierino dello sconto ha di nuovo le cifre in ordine** (7 8 9 /
  4 5 6 / 1 2 3): riusava la griglia del pagamento, larga quattro colonne
  per gli operatori, e i numeri finivano sparsi a caso.

### Sotto il cofano

- La pipeline fa **prima lint e test, poi il deploy**: se qualcosa è rosso
  non si pubblica niente.
- Si lavora su un ramo di rilascio, e i branch di lavorazione vanno da
  soli sull'ambiente di test.
- **96 requisiti** scritti in `requirements/requirements.yaml`, legati ai
  test da una prova che fallisce se qualcuno li lascia indietro.

---

## 1.2.0 — 11 agosto 2026

- **Ruolo admin** accanto a bartender e staff, con la pagina **Utenti e
  ruoli**: i clienti registrati dal sito si promuovono da lì, e l'ultimo
  admin non si può togliere di mezzo.
- Il ruolo si aggiorna da solo senza aspettare la scadenza del token: chi
  veniva promosso mentre era collegato si trovava permessi negati sparsi
  in giro.
- Menu laterale riorganizzato: gruppi a scomparsa, chi è collegato in
  fondo, una convenzione sola per le sottosezioni di ogni pagina.
- Vista cliente: niente tasto schermo intero, larghezza del dispositivo.
- Ambiente di sviluppo locale "come il server", e `npm test` che funziona
  anche su Windows.

## 1.1.0 — 11 agosto 2026

- Primo numero di versione da quando si lavora in GitFlow.
- Ramo e commit visibili in fondo al menu: sull'unico ambiente di test
  passano a turno più versioni, e senza saperlo "l'ho provato e non
  andava" non vuol dire niente.
- I branch di lavorazione vengono pubblicati da soli sull'ambiente di
  test.
