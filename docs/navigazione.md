# Come si naviga qui

Regole di navigazione, scritte una volta per non ridiscuterle a ogni
schermata. Nascono da una barra in alto che sul telefono si era affollata:
☰, ←, logo, nome del locale, titolo, sezione, campanella, ⋮ — otto cose in
una riga, e il nome del locale ridotto a «La …».

## La barra in alto: tre zone, sempre le stesse

| Zona | Cosa ci sta | Domanda a cui risponde |
|---|---|---|
| Sinistra | ☰ oppure ← | «Come esco da qui?» |
| Centro | marchio · titolo della pagina e della sezione | «Dove sono?» |
| Destra | campanella, ⋮ / chi sono | «Cosa posso fare adesso?» |

L'ordine non cambia mai. Chi cerca il menu guarda a sinistra anche in una
schermata che non ha mai visto.

### Dove la barra non c'è

Le schermate a tutto schermo — la lavagna della coda, il conto — la barra
in alto la nascondono, e si richiama dalla linguetta in cima. Il ☰ però
resta dov'è sempre stato: **in alto a sinistra, e dentro la testata della
pagina**, non appeso sopra di lei. Un tasto fisso sull'angolo dello schermo
sembra gratis finché la pagina non scorre: da lì in poi ci passa sotto
quello che scorre, e si legge «…erti · 6 chiusi» dove c'era scritto «4
aperti · 6 chiusi» (l'utente, 21/08/2026). Nel flusso il posto non si
tiene: si occupa.

Vale anche al contrario: **una schermata sola, un ☰ solo**. Dove la testata
se lo mette da sé, il tasto flottante si spegne (`StaffDrawer`, proprietà
`flottante`).

## Cosa si sacrifica per primo, quando lo spazio manca

Non si rimpiccioliscono i tasti: al banco si tocca con le dita bagnate, e
sotto i 44px si sbaglia. Si **toglie**, in quest'ordine:

> I 44px si contano **sotto il dito**, non nel foglio: dove lo spazio è
> contato e lo zoom dell'app è in mezzo, il minimo si scrive
> `calc(44px / var(--zoom, 1))` — a zoom 1 è identico, ingrandendo il tasto
> resta grande **quanto prima davvero** invece di far sbordare i vicini
> (DESIGN.md, punto 2).

1. **il nome del locale** (sotto i 700px resta il logo): chi lavora sa in che
   app è — è a tutto schermo;
2. **l'«indietro»**: sul telefono il ☰ fa quello che fa lui **e in più** —
   dalla coda alle impostazioni in un tocco solo, invece di uscire e poi
   scegliere. Due tasti per la stessa domanda sono uno di troppo;
3. **il logo** (sotto i 400px);
4. il **titolo della sezione** si accorcia con i puntini, ma non sparisce mai:
   è l'unica cosa che dice dove sei;
5. non cadono mai: **☰, campanella, ⋮**.

## Le gerarchie: una per volta, e ognuna al suo posto

- **Le pagine** stanno nel menu laterale (☰). Punto.
- **Una pagina che non è di tutti si TOGLIE dal menu**, non si apre per dire
  «non puoi»: una schermata che si è già fatta vedere ha già risposto alla
  domanda. Chi vede quale voce sta accanto alla voce stessa
  (`src/lib/sezioni.js`), con la funzione di `src/lib/ruoli.js` che lo
  decide — `isAdmin` per «Bilancio». Lo stesso filtro vale per l'indirizzo
  battuto a mano (`?tab=…`): togliere la voce dal menu non basta.
- **Le sottosezioni di una pagina** (Inventario: Prodotti, Conta, Ordini…;
  Impostazioni: Aspetto, Pagamenti…) stanno **nel menu a scomparsa**,
  rientrate sotto la pagina aperta. Un posto solo per navigare, uguale sul
  telefono e sul computer.

  Le altre strade le abbiamo provate tutte, e non reggono: una **riga di
  schede** in pagina costa altezza e sul telefono non ci sta; le **schede
  nella barra** reggono cinque voci, non ventidue; una **tendina** costringe
  ad aprirla per sapere cosa c'è dentro. Il menu invece scorre, ed è già il
  posto dove si va per cambiare pagina.

  Nel menu compaiono le sezioni della **pagina aperta**: sono le uniche che
  si conoscono senza esserci passati.
- **Quando un gruppo di sottosezioni diventa una pagina sua** (regola
  aggiunta il 26/08/2026, lavorando su «Fornitori»): quando risponde a una
  DOMANDA DIVERSA da quella della pagina che lo ospita. Non conta quante
  sono né quanto sono grosse — conta che chi le cerca le cerchi per un altro
  motivo.

  Il caso: Magazzino risponde a «cosa ho sullo scaffale», e ci teneva dentro
  Ordini, Scadenzario e Fornitori, che rispondono a «con chi lavoro e quanto
  gli devo». Stavano lì per contiguità (parlano tutti di prodotti), e chi
  cercava una fattura passava da una schermata di giacenze. Adesso sono la
  pagina «🏭 Fornitori», con le sue tre sottosezioni.

  Il segnale che il gruppo è maturo, in pratica: **le sue voci non
  compaiono mai nella stessa frase** delle altre («guarda quanto gin è
  rimasto» / «guarda se abbiamo pagato Nova»), e spesso **le vede un ruolo
  diverso** — che è quello che è successo qui, dove il trasloco ha portato
  con sé il vincolo `isAdmin` che il magazzino non aveva.

  Traslocare costa poco se il meccanismo è quello di sempre: una voce in
  `NAV_GESTIONALE` (`src/lib/sezioni.js`), un componente contenitore fatto
  come `CassaTab.jsx` — elenco `SEZIONI` più un ramo per voce — e i pannelli
  che si spostano interi. Chi trasloca guarda anche i **vecchi indirizzi**
  (`VECCHI_INDIRIZZI` in `sezioni.js`): una pagina che sparisce ne lascia in
  giro, una sottosezione no, perché le sottosezioni non stanno nell'URL.
- **Dentro una sottosezione, lista e dettaglio non sono un terzo livello di
  menu.** Una sottosezione può essere fatta di una lista che si apre su un
  dettaglio — le chiusure di cassa in Statistiche → Per serata: si tocca una
  serata e si vedono i suoi numeri. Quel dettaglio **non entra nel menu**:
  nel menu ci sono i posti dove si va, e qui il posto è la lista; il
  dettaglio è una cosa che si guarda e si richiude, e la sottosezione resta
  accesa mentre lo si guarda.
  **La via d'uscita è una sola e sta in cima al dettaglio, a sinistra**, e
  **dice dove riporta** — «← Chiusure», non «← Indietro»: il nome del posto
  si legge senza doversi ricordare da dove si è arrivati.
  **E uscendo si dimentica.** Tornando alla sottosezione si riparte dalla
  lista: il dettaglio era stato chiuso apposta, e ritrovarcisi dentro vuol
  dire non sapere più cosa fa la freccia in cima — se chiude quello che si è
  appena aperto o riporta indietro di due passi.
- **Dove la pagina ha sezioni sue, il menu resta agganciato**: da 768px in
  su non copre il contenuto, è una colonna della pagina e il contenuto si
  stringe per fargli posto. Lì dentro si salta da una sezione all'altra
  venti volte di seguito, e un menu che copre significa aprire, cercare,
  scegliere — e intanto non vedere più dove si era.

  **Si apre e si chiude col ☰**, come ovunque: niente secondo tasto per
  «agganciarlo». A chi lavora interessa che il menu ci sia o non ci sia —
  che resti dentro la pagina invece di coprirla è come si presenta, non
  un'altra funzione. La scelta resta anche il giorno dopo
  (`tana:drawer-agganciato`). Sulla coda
  ordini non si aggancia — lì non ci sono sezioni e sarebbe una colonna in
  meno di conti.

  **Da dove in su** è un conto sulla larghezza che resta: sul telefono
  (360–430px) 250px sono più di metà schermo e il contenuto diventa
  inutilizzabile, quindi lì il menu resta a scomparsa; da 768px — l'iPad in
  verticale, il tablet del banco — restano 500px e la scelta ha senso. Fino
  ai 900px la colonna si stringe a 200px.

- **Come si guarda una pagina non è navigazione**: le quattro viste della coda
  (griglia, corsie di stato, schede, lista) si scelgono in Impostazioni → Coda
  ordini e restano. Niente riga di schede sopra la coda per cambiarle: si
  decide una volta e si lavora, e quella riga sarebbe altezza tolta ai conti
  per una cosa che si tocca due volte l'anno.
- **Il banco ha una coda sua, e si apre da sé.** Ad accenderla sono gli
  stati del servizio; come disegnarla si sceglie in Impostazioni → Coda
  ordini → «La vista del banco», accanto alla vista della coda — stessa
  regola di sempre: come si guarda una pagina non è navigazione, si decide
  una volta e si lavora. La coda di chi guarda la serata non cambia.
- **Una card che apre qualcosa apre la cosa che rappresenta.** Nella coda del
  banco le card sono comande, e toccarle apre il dettaglio della comanda
  (`/ordine/:id/comanda/:comandaId`); nelle corsie dei conti sono conti, e
  aprono il conto. Quello che sta un livello sopra — il conto, per una
  comanda — si raggiunge con un tasto scritto, mai rubando il gesto
  principale: il tasto grande della card resta quello che porta avanti il
  lavoro.
- **Un tocco apre, una pressione lunga sposta.** Sulle card della coda del
  banco il tocco resta quello di sempre (apre la comanda); tenendo premuto
  la card si stacca e si lascia in un'altra colonna, e lo stato della
  comanda diventa quello della colonna. È una strada ALTERNATIVA, non la
  strada: i tasti restano tutti dov'erano, e chi non proverà mai a
  trascinare non si accorge che si può. Le colonne che non accettano il
  rilascio lo dicono mentre la card è ancora in mano, non dopo.
- **Quello che si cambia nel mezzo del servizio sta sopra la lista**, e vale
  per QUESTO terminale: le colonne (un chip per corsia, che spegne quelle
  che in quel momento non servono) fra i filtri, e in testata il tasto con
  cui chi non è al banco va a guardare il lavoro. Non stanno in Impostazioni perché si
  toccano con l'ordine in mano, e non su `settings/bar` perché al banco e
  alla cassa non si guardano le stesse cose.
- **Il cambio vista NON sta nella riga dei filtri: sta in testata, coi
  tastini delle azioni.** Ci stava, a destra e staccato — «a sinistra chi
  restringe, a destra chi cambia vista» — e la regola era buona finché
  quella riga era una riga di sole pastiglie. Adesso è la riga dei DUE
  TASTINI (filtri e ordinamento) più i chip che aprono: un terzo tasto che
  con i filtri non c'entra la rifarebbe la riga-di-tutto che era. In
  testata è già la zona del «cosa posso fare adesso», resta a un tocco solo
  — si cambia vista venti volte a serata — e non costa altezza a nessuno.
  **Solo icona** — 🧾 / 🍸, col nome
  per esteso nel titolo — perché lì la larghezza è della barra di ricerca.
  Sotto il «+» era stato provato e non va: rettangolare sotto un tondo,
  appeso nel vuoto e disallineato da tutto.
- **Sulla lavagna la riga dei filtri È la riga dei conteggi.** Una riga
  tutta per loro valeva 64px — un terzo livello fra i conteggi e la prima
  comanda, su una lavagna che si guarda da lontano mentre si versa. La
  riga dei conteggi è corta e ha spazio a destra: i due tastini e i chip ci
  stanno accanto. Vale per tutte e due le lavagne, corsie e griglia: sono
  due modi di guardare la STESSA coda, e chi passa dall'una all'altra deve
  ritrovare i filtri dov'erano.
  **Sul telefono no**: lì quella riga è già piena — conti, avviso della
  ricerca, legenda degli autori — e i filtri tornano sotto, a filo a
  sinistra, e scorrono in orizzontale. A dire da dove in su è la
  **lavagna** (container query `corsie`, la stessa soglia delle due
  colonne), non la finestra: col menu agganciato ha 200-250px in meno.
- **Un tasto dice DOVE PORTA, non dove si è.** «🍸 Comande» guardando i
  conti, «🧾 Ordini» guardando le comande. Un interruttore che si accende
  quando sei già di là si legge solo sapendo com'è messo adesso — e per
  saperlo bisogna guardare la lista sotto.
  **L'eccezione è l'ordinamento della coda**, e la ragione è la stessa
  regola letta al contrario: com'è messa la coda si vede dalla coda, non
  serve un tasto che lo dica. Quello che manca è il NOME di com'è messa, e
  quello ci si scrive: «Prima i più recenti» / «Prima i più vecchi», secco,
  senza «adesso» e senza «tocca per…» — «questo testo è completamente
  insensato: basta scrivere Prima i più recenti/vecchi in base
  all'ordinamento attuale» (l'utente, 20/08/2026). L'icona è **una freccia
  sola che segue il verso** — ↓ si parte dai recenti e si scende verso i
  vecchi, ↑ il contrario — non il «↕» di prima, uguale nei due stati.
- **Il tasto dei filtri sta a DESTRA, e i filtri escono SOTTO.**
  Accanto a lui la freccia dell'ordinamento: sono i due tasti che governano
  COME si guarda la pagina, stanno insieme in fondo a destra, e si
  appoggiano a **una riga che esiste comunque** — i conteggi sulle lavagne,
  la ricerca in lista e schede. Così a filtri chiusi **non costano una riga
  a nessuno**, in tutte le viste e anche sul telefono: «devi rivedere la UX
  e migliorarla sempre tenendo presente il fatto che ci serve spazio
  verticale» (l'utente, 20/08/2026).
  Sono **due bottoni gemelli**: riquadro sì — senza, non si vedeva che
  erano tasti — ma **bassi**, non i 44px della famiglia che fa qualcosa
  alla serata. «Aggiungi un bordo e rendilo un bottone ma lascia la
  freccetta e la scritta filtri. Il tasto non farlo troppo alto come gli
  altri, stessa cosa per la freccetta dell'ordinamento. Stessa dimensione
  dei filtri» (20/08/2026). Il tasto dei filtri è scritto «▾ Filtri»;
  l'ordinamento è la sola freccia, quindi il riquadro si fa quadrato.
  L'altezza è una sola (`--tastino-alto`) ed è quella dei chip della fila:
  sono la stessa specie di comando e in riga si devono somigliare. In mezzo
  a una riga di testo un tasto alto è uno scalino, e **la riga dei conteggi
  non deve crescere** — i due tasti sporgono dentro il `gap` della testata
  invece di alzarla.
  **La regola dei 44px vale, ma non qui**: è dei tasti che si premono di
  corsa con le dita bagnate (Avanti, Incassa). Dentro la fila dei filtri
  — che si tocca quando si decide cosa guardare, non con l'ordine in mano
  — c'è una **deroga chiesta e circoscritta**: «e i tasti dei filtri,
  tutti, devono essere leggermente più piccoli» (20/08/2026). Leggermente:
  il bersaglio resta comodo.
  **L'ORDINAMENTO NON SI NASCONDE MAI**, e non condivide il destino dei
  filtri: «non ti avevo chiesto di farlo per il tasto dell'ordinamento. Il
  tasto dell'ordinamento deve essere come gli altri solo i filtri si
  nascondono in quel modo» (20/08/2026). Non è un filtro — non restringe
  niente, gira la lista — e resta a schermo sempre.
  **Prima stavano DENTRO la fila dei chip**, a sinistra, e la fila doveva
  quindi esistere sempre per contenerli. Adesso la riga dei chip esiste
  **solo da aperta**: richiudendo se ne va del tutto, margini compresi.
  **Da chiuso il tastino non nasconde lo stato**: si accende e porta il
  numero di **quanto la coda è filtrata diversamente da come si apre** —
  non dei filtri accesi, che con gli stati combinabili è sempre almeno uno
  e non distinguerebbe niente. Le conta **una per una**, non per genere:
  tre colonne diverse dal solito fanno tre, e con lo staff filtrato
  quattro. Contarle per genere dava «tre colonne in meno e un uno» —
  «non mi è chiaro come conta i filtri» (l'utente, 22/08/2026) — e chi non
  ritrova a occhio il numero che vede smette di guardarlo. Quali siano lo dice il titolo, dopo il nome
  del tasto — che è **«Mostra filtri»** e **«Nascondi filtri»**, cioè
  quello che il tasto fa. A fila **aperta** il numero sparisce: i chip
  accesi si vedono da sé.
  Aperta, i chip stanno IN RIGA e non in una tendina: si toccano a raffica
  mentre si lavora, e un pannello coprirebbe proprio quello che si sta
  guardando per decidere che filtro serve. **L'unica deroga sono gli
  autori** (chi ha aperto il conto): sono quanti sono i turni — sei, otto,
  dieci nomi — e in riga sarebbero dieci pastiglie che scorrono, cioè la
  riga che si sta togliendo. L'ha chiesta l'utente («il filtro miei
  dovrebbe diventare un menu a tendina», 20/08/2026), si riusa `Tendina` —
  chiude al tocco fuori e con Esc — e la pastiglia dice comunque cosa è
  scelto senza aprirla (REQ-CODA-009).
  La scelta aperta/chiusa vale per QUESTO terminale
  (`tana:coda:filtri-aperti`). Dentro ci va tutto quello che restringe la
  lista — le colonne del banco comprese, e i sottofiltri dei chiusi; fuori
  il cambio vista, che non filtra, e il «＋», che crea. Un meccanismo solo
  per tutte le viste della coda.
  **E LA FILA È UNA SOLA, MAI DUE ANNIDATE — E NEMMENO UN CHIP CHE APRE
  CHIP.** Le colonne del banco hanno provato tutte e due le strade
  sbagliate: prima una seconda riga sotto, poi un «▦ Colonne» che le apriva
  dentro la stessa riga. Adesso stanno in fila coi fratelli, una per chip:
  il tastino «▾ Filtri» è **l'unico livello di nascondimento**, e un
  secondo dentro il primo sono due tocchi per una riga che a fila chiusa
  non esisteva comunque — «togli il testo colonne e metti tutti i tasti che
  si aprono cliccando colonne al posto di colonne. Non c'è più bisogno
  visto che nascondiamo tutto con filtri» (l'utente, 20/08/2026). Che la
  riga vada a capo da sé quando non ci sta va benissimo: quello è il capo
  naturale del flusso, non un livello in più. Il conto è sempre lo stesso:
  fila chiusa **zero righe**, fila aperta **una**.
  L'ECCEZIONE, che è un'altra cosa: un filtro che ne IMPLICA altri li fa
  comparire quando si accende — «Serviti / Da servire» escono con «Chiusi»,
  perché fuori di lì non vogliono dire niente. Lì i chip in più li chiede
  la domanda, non un tasto che fa da coperchio.
- **Nel ⋯ del telefono ci va quello che si fa OGNI TANTO**, non quello che
  si fa durante il servizio. Pannelli e cassa stanno lì dentro; il cambio
  vista resta fuori, accanto al ⋯, perché nel menu sarebbero due tocchi
  decine di volte a serata. Filtri e ordinamento non ci sono più nemmeno
  loro: stanno giù, in fondo alla riga dei conteggi, sul telefono come
  ovunque — in due posti sarebbero due stati da tenere allineati a mano.
- **Una lista che si può leggere in più modi lo sceglie SOPRA DI SÉ, in una
  riga che c'è già.** Le chiusure di cassa si guardano per serata, per
  settimana o per mese, e i tre gettoni stanno in fondo alla riga della
  ricerca per data (`.chip-gruppo`, gli stessi dei filtri della coda):
  attaccati, perché sono una domanda sola con tre risposte, e appoggiati a
  una riga che esiste comunque, perché la pagina esiste per la lista.
  Non una tendina — con tre voci bisognerebbe aprirla per sapere cosa c'è
  dentro. Non in Impostazioni: là ci vanno le viste della coda, che si
  scelgono una volta e non si toccano più; questa si cambia MENTRE si
  guarda («com'è andato agosto? e questa settimana?»), come i filtri.
  **E una riga aggregata si apre su quello che contiene**, non porta a un
  dettaglio nuovo: la settimana si spiega con le sue sere, che sono le righe
  che si conoscono già.
- **Il contenuto non porta navigazione**: niente tasti «vai a…» in mezzo a una
  lista, che si trovano solo scorrendo.

## Due cose che non si fanno

- **Una seconda riga sotto la barra.** Costa altezza sempre, per
  un'informazione che serve una volta. Se qualcosa non ci sta, si toglie
  seguendo l'ordine qui sopra.
- **Due modi di tornare indietro nella stessa schermata.** Uno solo, e sempre
  nello stesso posto.

## Dove sta scritto nel codice

- barra e titolo: `src/App.jsx`
- nome della pagina per indirizzo: `src/lib/sezioni.js`
- sottosezioni dichiarate dalle pagine: `src/lib/sottosezioni.js`
- la schermata che sta tutta nella finestra: `src/lib/paginaPiena.js`
- tendine: `src/components/Tendina.jsx`
