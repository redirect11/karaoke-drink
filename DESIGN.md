# DESIGN.md — Tana Drink, gestionale

Come deve apparire e comportarsi l'interfaccia. Chi tocca la UI — persona
o agente — segue questo file; i valori operativi vivono in
`src/lib/themes.js` e `src/index.css`, e questo documento non deve mai
contraddirli: se cambiano i token, si aggiorna anche qui, nello stesso
commit.

## Tema e atmosfera

Strumento di lavoro, non vetrina: l'app si usa di sera, di fretta, con il
locale pieno. Il gestionale è **sobrio, scuro e ad alta leggibilità**, con
un calore misurato: la personalità sta negli accenti e nei dettagli, mai
al costo della velocità di lettura. La vetrina cliente (menù, landing)
mantiene il registro speakeasy; questo documento riguarda soprattutto il
lato di chi lavora.

Il preset di riferimento per il gestionale è **Catppuccin** — palette
ufficiale — sopra la struttura a tre livelli di profondità che l'app già
usa: **Mocha** per lo scuro, **Latte** per il chiaro, stessi ruoli e
stessa gerarchia. Il preset storico `tana-scuro` resta disponibile e
predefinito finché il locale non sceglie diversamente dalle impostazioni.

## Palette (ruoli semantici)

I temi agiscono su 7 variabili CSS (`:root`), risolte da
`src/lib/themes.js`. Ruoli, non colori a caso:

| Variabile | Ruolo | Mocha (scuro) | Latte (chiaro) | Tana scuro |
|---|---|---|---|---|
| `--bg` | fondale pagina (il livello di base) | `#11111b` crust | `#dce0e8` crust | `#0e0e15` |
| `--bg-2` | fondale secondario, topbar | `#181825` mantle | `#e6e9ef` mantle | `#15151f` |
| `--card` | superfici: card, drawer, dialoghi | `#1e1e2e` base | `#eff1f5` base | `#1a1a26` |
| `--accent` | identità e stati attivi (chip, evidenze) | `#cba6f7` mauve | `#8839ef` mauve | `#e52e71` |
| `--accent-2` | azione: bottoni primari, link, gradienti | `#fab387` peach | `#fe640b` peach | `#f5b94a` |
| `--text` | testo primario | `#cdd6f4` text | `#4c4f69` text | `#f5f5f7` |
| `--muted` | testo secondario, mai per info critiche | `#a6adc8` subtext0 | `#6c6f85` subtext0 | `#9b9ba8` |

Nota sulla coppia Mocha/Latte: i ruoli non cambiano, cambia la forza —
sul chiaro gli accenti sono più profondi perché il contrasto va
conquistato, non regalato.

C'è un ottavo token derivato, `--btn`: il **colore-azione dei bottoni
primari**. Di default segue `--accent-2`; i preset chiari lo dichiarano a
parte, perché lì l'accento-2 è scuro per reggere i link sul fondo chiaro
e come fondo di un bottone diventerebbe una macchia (visto succedere: il
«+» e «Pagamento» color senape). Regola: il fondo di un bottone primario
è sempre un tono chiaro col testo scuro `#1c1305`.

### Il gradiente dell'azione: due token, un colore solo

Il fondo dei bottoni primari è un gradiente fra **`--btn-1`** e
**`--btn-2`**. Di partenza sono l'oro di casa — `#f7c45e → #e8a32e`,
lo stesso che è in produzione — e sono i due token che usa **anche il tab
acceso** (`.chip.active`). Classi diverse, colore uno solo: erano due
gradienti scritti in due posti, e toccandone uno il «+» della coda e
«Pagamento» restavano indietro rispetto a «In corso», con la differenza
bene in vista.

Regole:

- **I temi di casa non toccano quei due token.** `chiaro` e `crema` sono
  la stessa Tana con un altro contorno: i tasti restano l'oro di sempre.
  Un tasto che cambia colore col tema di contorno si riconosce meno, e il
  «+» è quello che si prende di corsa con le mani occupate.
- **Un tema di un'altra famiglia** (Catppuccin, Pico) dichiara `--btn` e
  i due estremi si ricalcolano da lì: schiarito da una parte, scaldato
  dall'altra. Tornando a un tema di casa il ricalcolo **si toglie**, se no
  i bottoni si tengono il colore del preset precedente.
- **Non si derivano i due estremi dall'accento con mescole "a occhio".**
  Provato: il risultato era più smorto dell'originale (`#e8a32e` →
  `#d5a03f`) e al banco si vedeva. Se un tema vuole bottoni suoi, li
  dichiara.

### Un tema porta anche le forme

Un tema non è una tavolozza. Pico e Catppuccin hanno un **modo di fare le
cose** — quanto sono tondi gli angoli, se un bottone è una campitura piatta
o un gradiente, se le superfici hanno un'ombra — e prendendone solo i
colori restava tutto con la faccia della Tana ridipinta: si sceglieva
«Pico» e si trovavano i nostri tasti dorati con gli angoli morbidi.

Le forme stanno in `FORME` (`src/lib/themes.js`), tre famiglie, e ogni
preset dichiara la sua con `forme:`. Sono i token che si vedono
da lontano: `--raggio-card`, `--raggio-btn`, `--raggio-pill`,
`--raggio-campo`, `--btn-bg`, `--ombra-btn`, `--ombra-card`,
`--forma-titoli`, `--segno-prodotto`.

| Famiglia | Angoli | Tasti | Ombre | Titoli |
|---|---|---|---|---|
| `tana` | 16/12px, pillole tonde | gradiente | alone sotto il tasto | serif Playfair |
| `catppuccin` | 10/8px | campitura piatta | ombra tenue | come il testo |
| `pico` | 4px ovunque | campitura piatta | nessuna | come il testo |

Il segno del colore sulle card (`--segno-prodotto`) è `nastro` per `tana`,
`pastiglia` per `catppuccin`, `pallino` per `pico`. `applyTheme` lo scrive anche come
`data-segno` sul documento, perché una variabile CSS non basta a scegliere
fra due geometrie: serve un aggancio nel selettore.

Regole:

- **Ogni famiglia dichiara TUTTI i token.** `applyTheme` scrive
  sullo stile di `:root`, e un token lasciato indietro resterebbe
  appiccicato al tema successivo — è già successo coi bottoni, che
  restavano dorati cambiando preset.
- **La personalizzazione tocca solo i colori.** I campi in Impostazioni
  sono i sette di `THEME_FIELDS`: le forme vengono dal preset, non si
  regolano a mano.
- **Il testo sui tasti è `--btn-ink`**, deciso dalla luminanza del colore
  d'azione: scuro sui tasti chiari, bianco su quelli scuri. Era cablato
  `#1c1305` — nato per l'oro — e su un tema con l'azione scura sarebbe
  stato nero su nero.
- **Il dorato non si riscrive a mano nel foglio di stile.** C'era in una
  dozzina di posti (il tab acceso, il «+», i tasti dei pannelli) e quelli
  ignoravano il tema: c'è un test in `tests/unit/css.test.js` che boccia
  `#f7c45e`, `#e8a32e` e `#1c1305` fuori dalla dichiarazione dei token.

Oltre alla coppia Catppuccin esiste la coppia **Pico** (`pico-scuro` /
`pico-chiaro`): la palette di Pico CSS v2 — ardesia blu, azzurro tecnico
`#01aaff`/`#0172ad`, look "documento" sul chiaro — adottata dentro i
nostri token. Dei design system esterni si importano i **colori nei
preset**, mai i fogli di stile: un CSS estraneo si sovrapporrebbe al
nostro e i guardrail smetterebbero di valere.

Colori di stato (fissi, fuori tema): `--ok #2ecc71`, `--warn #f39c12`;
gli stati degli ordini hanno le loro pill (ricevuto/in preparazione/
pronto/ritirato/pagato/annullato) e i loro colori non si riciclano per
altro. Il rosso è solo per annullare/errore.

Regole:
- La profondità si esprime con i tre livelli `--bg → --bg-2 → --card`,
  non con ombre pesanti.
- `--accent-2` è "si può agire qui"; `--accent` è "questo è
  attivo/selezionato". Non invertirli.
- Testo su `--accent-2` (bottoni): scuro `#1c1305`, mai bianco — gli
  accenti-2 dei preset sono caldi e chiari.

## Tipografia

- Corpo: `system-ui` stack — il testo operativo non ha font di fantasia.
- Titoli (`h1–h3`): serif `Playfair Display` — è la firma del prodotto,
  usata con parsimonia; nel gestionale i titoli sono pochi per scelta
  (il titolo di sezione sta nella topbar, non in pagina).
- Numeri che contano (numero ordine, totali): grandi e in evidenza
  (`.bignum`, `.price`); un bartender legge il numero a un metro.
- Niente maiuscolo urlato, niente corsivi decorativi nel gestionale.
- **Il titolo di una sezione è un titolo**: `.settings-section h3` sta a
  `1.15rem`, peso 700, colore `--text` — col serif di casa che gli h1–h3
  hanno già. Era `0.75rem` in maiuscoletto grigio `--muted`: dodici pixel,
  e dentro una schermata piena di interruttori chi cercava «Stampante» o
  «Coperto» andava a tentativi. Il maiuscoletto slavato è per le etichette
  di servizio, non per il nome di quello che si sta guardando.
- **Il sottotitolo dentro la sezione** (`.settings-section h4`) sta un
  gradino sotto: `0.98rem`, peso 600, carattere di sistema. Due misure
  diverse non bastavano a far vedere la gerarchia quando erano lo stesso
  carattere; ora l'h3 è serif e l'h4 no. Ha la sua regola nel foglio: era
  uno `style` inline (`margin: 16px 0 4px`) ripetuto in mezza SettingsTab.

## Componenti

- **Bottoni** (`.btn`): gradiente derivato da `--accent-2` (135°, dal
  tono chiaro al tono scuro), testo scuro, raggio 12px, `min-height`
  generoso. Varianti: `secondary` (velo chiaro su card) e `ghost`
  (bordo, trasparente) per azioni non primarie. Un'azione primaria per
  schermata, non tre.
- **Card ordine**: bordo colorato per stato, contenuto essenziale
  (numero, cliente/tavolo, righe, totale). Le note (📝 conto, ↳ riga)
  si mostrano sempre dove si prepara o si serve.
- **Le corsie di stato** (una vista della coda): colonne uguali, in testa il
  nome dello stato col conteggio e il totale, sotto un filo di 2px del colore
  dello stato — gli stessi tre della striscia sulle card (`#f39c12`,
  `#3498db`, `#2ecc71`) più `--accent-2` per l'incasso. La card è una `card
  order-card` compatta con **un** tasto (`btn small block`, mai sotto i 44px):
  toccando il tasto si avanza, toccando la card si apre il conto. Le colonne
  ci sono tutte anche vuote: la loro posizione si impara a memoria.
  **Sul telefono si impilano**: una sotto l'altra, ognuna con la sua testata,
  e si scorre in verticale. A dirlo è la larghezza della **lavagna**
  (`container: corsie / inline-size` su `.queue-board.corsie-board`): una
  colonna sola fino a 560px, due fino a 900px, tutte oltre. Non la finestra —
  col menu agganciato la lavagna ha 200-250px in meno — e non il numero di
  corsie accese.
- **Una comanda in mano, e le colonne che rispondono.** Nella lavagna del
  banco una card si prende con una pressione lunga e si lascia in un'altra
  colonna (REQ-CODA-007). Mentre è in mano: la card di partenza resta al suo
  posto smorzata (`opacity: .35`), quella che segue il dito è un'altra
  (`.corsia-in-volo`, ombra e un grado di rotazione) e galleggia sopra tutto
  — dentro la colonna sarebbe ritagliata. Le colonne dicono PRIMA se
  accettano: chi accoglie prende un tratteggio `--accent-2` («si può agire
  qui», il suo ruolo), che diventa pieno sotto il dito; chi rifiuta sbiadisce
  e sotto il dito prende un contorno `--accent`. Il rosso resta per
  l'errore vero, e qui non c'è nessun errore: c'è un posto dove non si
  lascia.
- **Uno stato spento ha comunque la sua striscia.** Servito, chiuso,
  annullato, in invio: la striscia a sinistra usa `--strip-spenta` (che
  segue `--muted`, quindi il tema), non un bianco o un nero trasparente.
  Un rgba bianco nasce per il fondo scuro e sul tema chiaro sparisce — e
  una striscia invisibile è una card senza stato, proprio quando se ne
  stanno scorrendo trenta uguali. Più sobria degli stati vivi (quelli sono
  il lavoro di adesso e restano i più forti), ma **presente**.
- **La voce di un conto da riscuotere è un tasto** (`.payscreen-voce`, nel
  pagamento): niente cornice — resta una riga di conto — ma `min-height:
  44px`, testo a sinistra e `aria-pressed` che dice se è dentro la
  riscossione. Al banco si punta il prodotto, non il piccolo «+» accanto.
  Fuori dalla riscossione va **smorta** (`.spenta`: `--muted` più un filo
  di opacità), mai un grigio da tasto spento: quella riga si tocca ancora,
  ed è così che ci si rientra. Il colore non è l'unico segno — accanto
  resta scritto «0/2», perché una cosa che conta non si affida al colore
  (guardrail 1).
- **Un comando spento che ha un motivo si tocca lo stesso** e al tocco
  dice perché: `aria-disabled` e la classe `.spento` (opacità 0,4), **mai**
  l'attributo `disabled` — che non fa nemmeno partire l'evento, e chi preme
  resta a premere un tasto morto senza sapere cosa ha sbagliato. La
  spiegazione arriva come toast, in una frase piana. Vale per i tasti (i
  metodi di pagamento non disponibili, «Acconto» quando l'incasso
  salderebbe il conto) e per gli interruttori (`ToggleRow`, prop `motivo`:
  le funzioni premium nelle impostazioni). `disabled` resta solo dove non
  c'è niente da spiegare, perché il motivo è già in pagina.
- **I comandi di una lista stanno sopra la lista, in una riga sola**
  (`.payscreen-comandi`, nel pagamento): come si guardano le righe
  («Separa/Unisci uguali») e come si porta la selezione ai due estremi
  («Deseleziona tutti» / «Seleziona tutti»). Stessa famiglia (`btn ghost
  small`), `flex` con `gap`, `white-space: nowrap` e `flex: 0 0 auto`: non
  si stringono a vicenda, e su uno schermo davvero stretto vanno a capo
  invece di diventare illeggibili. La misura da rispettare è **360px**, e
  ci si sta togliendo le icone alle scritte lunghe, non accorciando le
  parole: «Deseleziona tutti» è la parola che si usa al banco.
- **Quando il contenuto va su due colonne lo decide il contenitore**, non
  la finestra: `container-type: inline-size` sul blocco e soglia in
  `@container`. Con sei corsie accese la finestra è larga e la card è una
  striscia: una media query sulla finestra spezzava i nomi e mandava i
  prezzi fuori dal riquadro. Il conteggio delle righe può dire se
  *conviene*, mai se *ci sta*. **Nemmeno il numero di colonne accese lo
  dice**: la card è un contenitore suo (`card-corsia`) e i tasti del piede
  si impilano su quella misura — il tasto grande scende sotto a tutta
  larghezza a 300px, e sotto i 200px vanno in colonna tutti e tre. Il
  bersaglio più premuto **cresce** quando lo spazio manca, non si stringe.
- **Le card di una griglia hanno tutte lo stesso vestito** — magazzino,
  menù e griglia del conto. Due segni, sempre gli stessi due: la **striscia
  a sinistra** (4px) dice come sta la cosa; il **colore** (lo stato delle
  scorte in magazzino, il colore che il prodotto ha al banco nel menù e nel
  POS) sta nell'angolo in alto. Nel menù e nel POS quel segno è anche il
  tasto che apre la tavolozza.
  **Che forma abbia quel segno lo decide il tema** (`--segno-prodotto`),
  e ogni famiglia ha il suo: **nastro** d'angolo per la Tana, largo e
  squillante — è un locale, non un foglio di calcolo; **pastiglia**
  (quadratino stondato) per Catppuccin, che è il suo modo di fare gli
  angoli; **pallino** per Pico, il look documento. Gli ultimi due stanno
  nell'angolo in alto: a destra sulle card del menù, come lo stato delle
  scorte in magazzino, e **a sinistra sulle tile del conto**, dove a destra
  c'è la stella dei preferiti — un tasto, che non si copre.
  In magazzino è sempre un pallino: lì il segno è uno STATO, non un colore
  scelto a mano.
- **Le liste lunghe hanno tutte lo stesso vestito** — magazzino, chiusure
  di cassa, statistiche. È una sola famiglia di classi (`.inv-list`,
  `.inv-row`, `.inv-row-main` e parenti): riquadro unico con gli angoli
  stondati, righe separate da una linea, **striscia a sinistra** di 4px
  quando c'è qualcosa da dire sulla riga, il **numero che si cerca** in
  fondo a destra, e il dettaglio che si apre **sotto** la riga invece che
  altrove. Tre schermate, un modo solo di leggere un elenco.
  **L'altezza è una sola e sta in un gettone**, `--riga-lista`: sono la
  stessa lista vista in tre pagine, e tre numeri scritti a mano in tre
  punti del foglio diventano tre numeri diversi. Vale il guardrail 2 —
  queste righe si toccano in piedi, col vassoio in mano.
  **E una lista non si svuota per farci trovare una riga.** Dove si cerca
  dentro un elenco (le chiusure di cassa per data, REQ-CASSA-013) la lista
  resta intera e si scorre fino alla riga, che si accende: `.inv-row.trovata`
  — velo e cornice interna dell'accento, che non toccano la striscia a
  sinistra perché quella dice un'altra cosa. Filtrando resterebbe una riga
  sola, e un elenco serve anche a confrontare le sue righe fra loro. E il
  colore non è l'unico segno: sopra l'elenco una frase dice cosa è stato
  trovato, o che per quella data non c'è nessuna chiusura.
  **La striscia dice una cosa sola per elenco, e cambia da elenco a
  elenco.** Nel magazzino dice l'assortimento (`.inv-row.ass-*`); negli
  **ordini fornitore** dice DI CHI È la riga — il colore del fornitore,
  scritto in linea perché è un dato e non un tema (`coloreFornitore` in
  `lib/listini.js`, tavolozza `CATEGORY_PALETTE`). Lì lo stesso prodotto
  compare una volta per fornitore, e senza il colore due righe con lo
  stesso nome si leggono soltanto arrivando in fondo alla riga.

- **La tavolozza del conto sta in una modale, non nel menu.** Dal «⋯
  Azioni» di una card — del conto e della comanda — il colore si dà da un
  **tasto solo**, che porta accanto al testo il **pallino del colore di
  adesso**: senza, per rispondere a «di che colore è questo?» bisognerebbe
  aprire la modale ogni volta. Toccandolo si apre un dialogo normale
  (`overlay confirm-overlay` + `confirm-box`, come il colore del prodotto
  nel POS: Esc, tocco fuori, ✕) con i gettoni a **48px** — fuori dal menu
  lo spazio c'è, e sotto i 44 un colore si prende male. Scegliere **applica
  e chiude**, modale e menu sotto: il gesto è finito. Dentro il menu erano
  dodici quadratini da 26px in due file, tre righe che coprivano le azioni
  vere («i colori del conto e della comanda andrebbero messi in una modale
  che si apre con un bottone», l'utente, 20/08/2026).
- **Il colore del conto prende il fondo della card.** Un conto può avere un
  colore suo (campo `colore` sul documento, tavolozza delle categorie):
  serve a riconoscere che tre comande finite in tre colonne diverse sono lo
  stesso tavolo. Non è un pallino — quel segno risponde da **lontano**, e
  dieci pixel da lontano non ci sono: è una **sfumatura in diagonale**
  dall'angolo in alto a sinistra, **32%** all'angolo, **12%** a metà,
  finita a 88% (`.order-card.conto-colorato`). In diagonale perché da
  sinistra c'è già l'alone del passo di lavoro, e due sfumature dallo
  stesso lato si impastano.
  **I due numeri non hanno lo stesso peso, e sono misurati** (dodici tinte
  per otto temi). All'angolo c'è il numero del conto in `--text`: al 32% il
  peggiore è **4,4:1**, e il 32% è il **tetto** — a 38% scende a 3,9. A
  metà cade il testo minore in `--muted`, e lì si paga: il peggiore passa
  da 4,1 a **3,5** (Pico scuro e Catppuccin chiaro, i due temi che
  partivano stretti già sul fondo nudo). **Il 12% è la soglia**: chi la
  alza rifà quei conti prima. La tinta si mescola con `--card`, non con la
  trasparenza: ogni fermata è un colore **opaco**, e il contrasto misurato
  è quello che si vede davvero.
- **Cosa dice la striscia a sinistra lo sceglie il locale.** Di suo dice lo
  **stato** — a che punto sta il lavoro, com'è messo il pagamento — ed è il
  default: chi non tocca niente vede la coda di ieri sera. Accendendo
  *Impostazioni ▸ Aspetto ▸ Le card della coda ▸ «🎨 Il colore del conto»*
  (`bordo_colore_conto`) porta invece il **colore del conto**, in tutte le
  viste della coda: dove i conti si spezzano in tante comande sparse,
  riconoscere il tavolo vale più del passo di lavoro. Due eccezioni, e
  stanno nella funzione che decide, non nel CSS: un conto **senza colore**
  e un conto **annullato** tengono la striscia dello stato.
  **La cascata è parte della regola**: sulla striscia scrivono più famiglie
  con lo stesso peso, e vince l'ultima letta — `pay-*`, poi
  `pagato-da-servire` (che scritta prima non compariva mai: BUG-064), poi
  `.order-card.bordo-conto`, ultima di tutte. La sorveglia
  `tests/unit/css.test.js`.
  Il colore non informa mai da solo: il numero del conto è sulla stessa
  card. Le regole in `src/lib/coloriConto.js`.
- **Il riquadro di una sezione** (`.card`, e in impostazioni e menù
  `card settings-section`) non dà per scontato il tema scuro: bordo
  `--line` e rilievo `--velo-superficie`. Sullo scuro quel velo è la luce
  che scende dal bordo alto e dà spessore; sul chiaro **si toglie**
  (`none`), perché la superficie è già il tono più chiaro della pagina e
  insistere col bianco dava un rettangolo bianco su fondo chiaro col bordo
  invisibile — i «box bianchi» segnalati al banco. Sul chiaro lo stacco lo
  fanno il bordo e l'ombra della famiglia di forme (`--ombra-card`).
  Stessa regola per le superfici minori delle stesse schermate
  (`.toggle-row`, `.cat-chip`, `.group-tile`, `.chip`, `.mode-option`):
  fondo `--tile-bg`, bordo `--line`, mai un `rgba(255,255,255,…)` fisso.
- **I passi di una comanda** (`.step`, nel dettaglio comanda e nella
  pagina di stato del cliente): quattro riquadri in fila — da fare, in
  preparazione, pronto, servito — col loro **orario sotto**. Tre vestiti:
  spento è `--tile-bg`, **fatto** è `--ok` mescolato con `--card` al 25%,
  **in corso** è il fondo dell'azione (`--btn-bg`). L'inchiostro viene dal
  gettone che gli corrisponde — `--text` sui primi due, `--btn-ink` sul
  terzo — e **dentro un passo non c'è testo di servizio**: l'ora eredita
  il colore del suo riquadro, perché quei minuti dicono se il ticket è
  fermo, e la gerarchia col nome la fa già la misura del carattere. Il
  fatto aveva l'inchiostro cablato (`#c8f7da`, verde-menta) e sui temi
  chiari era 1,03:1 — «il colore verde del testo non si legge bene sullo
  sfondo verde qui» (l'utente, 22/08/2026).
- **Chip e filtri**: pillole compatte, stato attivo con `--accent`;
  i filtri della coda stanno su una riga sola. Un chip **acceso** ha il
  fondo dell'azione, e lì dentro scrive tutto con `--btn-ink`, **numero
  compreso**: nei riassunti dell'inventario («scarsi 7») il numero teneva
  la sua tinta d'allarme sul dorato, 1,2:1 su tutti e otto i temi.
- **Toast e banner**: brevi, in linguaggio comune, mai colpevolizzanti.

## Layout e spaziatura

- Il gestionale usa **tutta la larghezza** (niente colonna centrale);
  solo testo lungo e moduli si stringono a ~900px.
- Raggio superfici 16px (`--raggio-card`), bottoni 12px
  (`--raggio-btn`) — sui temi Pico e Catppuccin li decide la famiglia di
  forme, vedi sopra.
- Aria tra i blocchi funzionali (i chip non devono sembrare la prima
  riga delle card); dentro le card la densità è alta: è un POS, i dati
  contano più del bianco.
- **Le pastiglie** (`.chip`: filtri della coda, periodi, sezioni) misurano
  `font-size: 0.95rem`, `padding: 8px 14px`, `min-height: 40px`. Sono
  numeri tarati **a zoom 100**: prima erano stati guardati col browser al
  110 e alla dimensione vera risultavano piccoli, testo e bersaglio.
  L'altezza minima è esplicita e non lasciata all'imbottitura, o balla da
  una pastiglia all'altra a seconda di quanto è lungo il testo.
- **Le pastiglie della fila dei filtri della coda** (`.chips-filtri .chip`)
  stanno un filo sotto: `min-height: var(--tastino-alto)` (34px),
  `padding: 5px 11px`, `font-size: 0.86rem`. L'ha chiesto l'utente — «e i
  tasti dei filtri, tutti, devono essere leggermente più piccoli»
  (20/08/2026) — e in griglia sono sei o sette: alla misura piena si
  mangiavano la riga, e dev'esserne **una sola**. Alla stessa altezza
  stanno i due tasti che governano la fila (`.coda-tastino`: «▾ Filtri» e
  il verso della coda), che sono bottoni bordati ma bassi — sono la stessa
  specie di comando e in riga si devono somigliare. `--tastino-alto` è la
  misura sola da cui scendono tutti.
- **I tasti di una card della coda respirano di `--gap-tasti-card`**
  (6px): il piede («⋯ Azioni» e il tasto grande, affiancati o impilati
  quando la card è stretta) e il menu che si apre sotto. Erano due numeri
  battuti a mano — 8px nel menu, 6px nel piede — e gli stessi tasti a un
  dito di distanza avevano due arie diverse; «avvicinali in verticale 1/2
  pixel, comunque di pochissimo» (l'utente, 20/08/2026). Si stringe lo
  **spazio**, non i tasti. Lo **stacco dal contenuto sopra**
  (`.corsia-azioni-aperte`: `margin-top: 14px`, `padding-top: 12px` e il
  filo) **non è quel gap e non si tocca**: sta lì perché il primo tasto del
  menu non sembri la seconda riga di quello del piede, e lì sotto ce n'è
  uno che rimanda indietro una comanda.
- **Le pastiglie in gruppo** (`.chip-gruppo`) si toccano: bordo condiviso
  (`margin-left: -1px`), angoli tondi solo agli estremi. Vuol dire «questi
  sono una cosa sola» e si usa **solo** dove è vero. Due posti, tutti e due
  in coda:
  - la colonna del servizio col suo tastino ✂️/🔗, che la apre in «Da
    servire» e «Da ritirare» e la richiude;
  - **il tasto dei chiusi, a tre porzioni**: `[💶 Chiusi]`, e — solo quando
    è acceso — `[Da servire/Ritirare][Serviti/Ritirati]`. Le due porzioni
    non sono filtri fratelli di «Chiusi»: sono una domanda **dentro** i
    chiusi, e in fila come pastiglie sciolte si leggevano come tre stati
    dello stesso rango. Un gruppo che **cresce** quando lo si accende
    invece di far comparire chip a metà riga.

  Restano **bottoni distinti** (ognuno il suo, ognuno il suo nome per lo
  screen reader): il gruppo unisce gli occhi, non i mestieri. Il tastino di
  un gruppo (`.chip-taglio`) è un segno solo e sta stretto: attorno a un
  carattere una pastiglia larga come le altre è tutta aria, e in una fila
  di sei o sette chip quell'aria è una riga in più.
- **La pastiglia minuta** (`.chip.mini`: le unità dentro una riga di testo,
  come «Al pz · pz · cl · ml» nella scheda di un prodotto) resta a
  `min-height: 22px` e `0.68rem`. Non è un bersaglio da barra: sta dentro
  una riga, e con la misura piena mandava a capo l'ultima unità, che
  restava appesa da sola sotto il resto.
- La topbar è sticky, traslucida sul tema (`color-mix` su `--bg-2`),
  e rispetta le safe-area dei tablet.

## Profondità

Ombre morbide e rare (bottoni primari, drawer); il resto della gerarchia
la fanno i tre livelli di fondo. Su temi chiari le ombre si attenuano da
sole per contrasto: non aggiungerne di dedicate.

I colori "strutturali" — la linea che separa, il velo di una superficie,
il fondo di una tessera — non si scrivono a mano: sono gettoni dichiarati
una volta sola, con la variante chiara accanto, e `applyTheme` la accende
scrivendo `data-luma` sul documento. Oggi sono `--line`, `--tile-bg`,
`--velo-superficie`, `--strip-spenta` e i tre inchiostri di stato
`--testo-rosso`, `--testo-ambra` e `--testo-verde`. Un `rgba(255, 255, 255, …)` usato
come fondo o come bordo nasce per il tema scuro e sul chiaro sparisce: è
sempre lo stesso difetto, e `tests/unit/css.test.js` lo boccia sulle
superfici delle sezioni.

## Il contrasto: i numeri, e la regola dell'inchiostro

**La soglia è WCAG AA**, e adesso è scritta invece che sottintesa:

| Testo | Rapporto minimo col fondo |
|---|---|
| normale (< 24px, o < 19px se in grassetto) | **4,5:1** |
| grande (≥ 24px, o ≥ 19px in grassetto) | **3:1** |
| `--muted`, che è testo **secondario** | **3:1**, e mai da solo su un'informazione che conta |

**Un inchiostro chiaro cablato non sta su un fondo tinto.** Un pastello —
`#c8f7da`, `#9ff5c0`, `#ffd54f` — nasce per il fondo scuro, dove si stacca
da una velatura; sul tema chiaro finisce su un fondo altrettanto chiaro e
sparisce. È lo stesso difetto dei bianchi trasparenti (BUG-065) un piano
più in su: lì era la superficie, qui è quello che ci si scrive sopra.
Le due vie ammesse:

- **un gettone** — `--text`, `--muted`, `--btn-ink`, e i due nati qui:
  **`--testo-rosso`** (un numero in perdita, una scorta finita),
  **`--testo-ambra`** (una scorta agli sgoccioli, un conto pagato) e
  **`--testo-verde`** (soldi che tornano indietro: l'importo di una nota
  di credito nello scadenzario). La tinta non cambia col tema — è memoria
  del banco, guardrail 5 — cambia la forza, con la variante
  `[data-luma='light']` accanto. E il colore non porta mai da solo il
  significato: la nota di credito ha anche il meno davanti alla cifra;
- **la regola gemella `:root[data-luma='light'] …`**, che è come il foglio
  tratta le pill degli stati da sempre. Se il selettore è un elenco, di
  sotto vanno elencati **tutti**: è accodandone uno a un elenco già
  coperto che si dimentica la variante.

Un fondo **opaco** — il blu pieno del tasto «Riscuotere», la campitura del
riquadro Ceres — non c'entra: lì il tema non traspare e un bianco fisso è
giusto. La regola la sorveglia `tests/unit/css.test.js`, che legge il
foglio regola per regola.

**Si misura, non si guarda a occhio.** Il metodo che ha trovato questi
casi: la pagina renderizzata in Chrome headless con il foglio vero, ogni
preset di `themes.js` applicato con la `applyTheme` del prodotto, uno
screenshot e i **pixel campionati** ai due estremi di ogni fondo — perché
il fondo che conta è quello *dipinto*, non quello dichiarato (velature su
velature, gradienti), e il colore del testo viene da `getComputedStyle`.
Otto temi per riga, si tiene il peggiore.

## Guardrail (non negoziabili, per qualsiasi tema)

1. **Si legge al buio e di fretta**: 4,5:1 per il testo normale, 3:1 per
   quello grande e per `--muted` — i numeri e la regola dell'inchiostro
   stanno qui sopra. Le informazioni critiche mai affidate solo a
   `--muted` o solo al colore.
2. **Si tocca col pollice**: bersagli ≥ 44px, azioni distruttive lontane
   da quelle frequenti. Le deroghe scritte sono due, e sono nello stesso
   posto: le **pastiglie** dei filtri stanno a 40px — sono secondarie e
   vivono in una riga che scorre, e a 44 quella riga diventa una fascia —
   e **dentro la fila dei filtri della coda** scendono a 34px, coi due
   tasti che la governano, perché l'ha chiesto l'utente e perché quella
   fila si tocca **quando si decide cosa guardare**, non con l'ordine in
   mano. Tutto il resto (tasti del conto, della card, della testata) resta
   ≥ 44px.

   **I 44px sono una misura fisica, non un numero nel foglio.** Contano
   quanto è grande il tasto *sotto il dito*. Lo zoom dell'app scala
   `#root`, quindi dove lo spazio è contato ci va
   `calc(44px / var(--zoom, 1))`: a zoom 1 non cambia niente, e ingrandendo
   il tasto resta grande **quanto prima in centimetri veri** invece di
   gonfiarsi — 44px CSS al 120% sarebbero 52,8px veri, cioè una garanzia già
   superata che intanto fa sbordare quello che ha attorno. È il caso del
   tastierino del pagamento (`.paypad-key`, BUG-075), dove il minimo secco
   spingeva l'ultima riga di tasti sotto «Riscuotere». Chi trova quel
   `calc` non lo «corregga» in `44px`: la regola non è ammorbidita, è
   misurata dove va misurata.
   Ed è il caso delle **righe delle liste** (`--riga-lista`, BUG-082): il
   magazzino si tocca in piedi, e una lista è fatta solo di bersagli — se
   lo zoom li gonfia, la schermata ne mostra un quinto in meno per niente.
3. **Le parole sono da vassoio, non da bar**: comuni, brevi, in italiano;
   nessun gergo tecnico; nessun messaggio che scarichi la colpa su chi
   legge. Ma il registro e' PROFESSIONALE: una didascalia dice cosa fa una
   cosa e a cosa serve, in una frase piana — niente battute, niente pacche
   sulla spalla, niente aneddoti. «Comune» vuol dire comprensibile, non
   confidenziale: chi legge sta lavorando e maneggia i soldi del locale.
   Il colore, il perche' e i casi visti al banco vivono nei commenti del
   codice e nel registro, non a schermo (l'utente, 22/08/2026: «per le
   didascalie e le spiegazioni dovresti usare un linguaggio meno
   informale»).
4. **Niente aspetta la rete**: ogni interazione risponde subito; spinner
   e attese lunghe sono un difetto, non uno stato normale.
5. **Gli stati degli ordini non cambiano colore** tra un tema e l'altro:
   la memoria cromatica del banco vale più dell'estetica.
6. **Niente animazioni oltre i 200ms** nel gestionale; le transizioni
   sono feedback, non spettacolo.
7. **Ogni tema nuovo è un preset in `themes.js`**, mai colori sparsi nei
   componenti: se un colore non passa dalle 7 variabili (o dagli stati),
   è nel posto sbagliato.

## Breakpoint

Mobile-first; il gestionale vive soprattutto su tablet e telefono al
banco. La coda a griglia si riorganizza da sola; la barra mobile compare
sotto i ~720px; nessuna schermata richiede scroll orizzontale.

## Guida per gli agenti

Quando lavori sulla UI: usa le variabili, mai esadecimali nei componenti;
rispetta i ruoli di `--accent`/`--accent-2`; testa mentalmente ogni
schermata sul preset più chiaro e sul più scuro; se aggiungi un
componente, descrivilo qui. In dubbio tra bello e leggibile, vince
leggibile.
