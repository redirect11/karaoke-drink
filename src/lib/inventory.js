// Logica pura dell'inventario (niente Firebase): unità, formattazione,
// stato scorte e calcolo del consumo. Interamente testabile a unità.

// ── L'UNITÀ GENERICA «U» ───────────────────────────────────────────────
//
// C'è roba a listino che non si versa, non si pesa e non è una bottiglia: il
// «Tempo di Lavorazione» è una voce di magazzino creata di proposito per
// mettere il LAVORO nel costo del drink. Si aggancia come ingrediente ai drink
// che richiedono lavorazione, ha un costo per unità, e da lì entra nel costo
// della ricetta e nel prezzo consigliato. Fino a ieri l'unica scelta possibile
// era il grammo, e nella ricetta del Daiquiri si leggeva «1 g».
//
// Una U non si converte in niente e NON È UNA SCORTA: non si scarica quando il
// drink si fa, non è mai esaurita e non vale niente in magazzino — il lavoro
// non sta sullo scaffale. Senza questo, al primo Daiquiri la manodopera
// sarebbe andata a zero, il menù avrebbe detto «Ingrediente esaurito» e il
// drink sarebbe sparito dalla carta, per non tornare più.
export const UNITA_GENERICA = 'U'
export function unitaGenerica(unit) {
  return String(unit || '').toUpperCase() === UNITA_GENERICA
}

// Unità base in cui è salvato lo stock: volumi in ml, pesi in g, conteggi in
// pz, e la U di quello che si conta a unità generiche.
export const BASE_UNITS = ['ml', 'g', 'pz', UNITA_GENERICA]

// Unità selezionabili in fase di inserimento ricetta, per unità base dell'item.
// Sono le unità "piccole" con cui si dosa un drink (mai L/kg in una ricetta):
// liquidi in cl/ml, solidi in g/mg. Devono restare un sottoinsieme di quelle
// gestite da costPerUnit, altrimenti il costo dell'ingrediente andrebbe perso.
export const ENTRY_UNITS = {
  ml: ['cl', 'ml'],
  g: ['g', 'mg'],
  pz: ['pz'],
  // Il generico non ha sottomultipli: si dosa a unità.
  [UNITA_GENERICA]: [UNITA_GENERICA],
}

// ── COME LO COMPRI, COME LO USI, E QUANTO RENDE ──────────────────────
//
// Un prodotto si compra in un modo e si usa in un altro: il gin si compra a
// bottiglia e si versa a cl, i limoni si comprano al CHILO e si spremono in
// CL. Le due misure non appartengono nemmeno alla stessa famiglia, e infatti
// non esiste una conversione universale fra peso e volume — ma questa non è
// una conversione: è la RESA, e la dichiara chi compra («da un chilo di
// limoni esce mezzo litro di succo», Flavio, 17/08).
//
// La giacenza si conta sempre in QUELLO CHE SI COMPRA — i chili, i sacchi,
// le bottiglie — perché l'inventario si fa contando quello che sta sullo
// scaffale, non il succo che ne uscirà.
//
// `resaUso` risponde a: «una unità BASE d'acquisto quante unità base d'uso
// rende?». Null se non c'è niente da convertire.
//
//   bottiglia da 70 cl → { base: 'ml', per: 700 }   (1 pz = 700 ml)
//   limoni al chilo    → { base: 'ml', per: 0.5 }   (1 g  = 0,5 ml di succo)
//
// I due campi nuovi (`resa_unit`, `resa`) valgono per qualunque articolo. Per
// i pezzi resta valido quello che c'era prima — `content_unit` +
// `package_size` — così i prodotti già in magazzino non si toccano.
export function resaUso(item) {
  const perDichiarata = Number(item?.resa) || 0
  const baseDichiarata = item?.resa_unit ? baseUnit(item.resa_unit) : null
  if (perDichiarata > 0 && baseDichiarata) return { base: baseDichiarata, per: perDichiarata }
  const c = contentBase(item)
  if (c && (item?.unit || 'pz') === 'pz') return { base: c.base, per: c.size }
  return null
}

// Unità con cui si dosa QUESTO ingrediente in una ricetta.
//
// La giacenza si conta a bottiglie (si carica la merce a pezzi), ma un
// cocktail si dosa in CL: sono due misure diverse dello stesso prodotto, e
// servono entrambe. Finché le unità dipendevano solo da `unit`, un articolo a
// pezzo offriva soltanto "pz" e per 4 cl di gin bisognava scrivere 0,057
// pezzi — un numero che non vuol dire niente per chi prepara.
//
// Il cl viene per primo: nelle ricette è il caso normale. Il pezzo resta,
// perché una Coca in un drink si mette intera.
export function entryUnits(item) {
  const unit = item?.unit || 'pz'
  const proprie = unit !== 'pz' ? (ENTRY_UNITS[unit] ?? [unit]) : ['pz']
  const r = resaUso(item)
  if (!r || r.base === unit) return proprie
  // Le unità d'uso vengono PRIMA: nelle ricette sono il caso normale (si
  // dosano 4 cl di gin, non 0,057 bottiglie). Quella d'acquisto resta, che
  // una Coca in un drink si mette intera.
  const uso = ENTRY_UNITS[r.base] ?? [r.base]
  return [...uso, ...proprie.filter((u) => !uso.includes(u))]
}

// Converte una quantità dall'unità inserita all'unità base dell'item.
//   cl→ml (×10), L→ml (×1000), kg→g (×1000); ml/g/pz/U invariati.
// La U passa dal default, ed è esattamente quello che deve fare: non c'è
// niente in cui convertirla.
export function toBaseQty(qty, unit) {
  const n = Number(qty) || 0
  switch ((unit || '').toLowerCase()) {
    case 'cl':
      return n * 10
    case 'l':
      return n * 1000
    case 'kg':
      return n * 1000
    case 'mg':
      return n * 0.001
    default:
      return n
  }
}

// Unità base (in cui è salvato lo stock) a partire dall'unità scelta
// dall'utente: liquidi → ml, pesi → g, generico → U, pezzi → pz.
export function baseUnit(u) {
  const x = String(u || '').toLowerCase()
  if (['l', 'cl', 'ml'].includes(x)) return 'ml'
  if (['kg', 'g', 'mg'].includes(x)) return 'g'
  if (unitaGenerica(x)) return UNITA_GENERICA
  return 'pz'
}

// Inverso di toBaseQty: da unità base al numero nell'unità scelta (la U, che
// non converte niente, passa dal default).
export function fromBaseQty(base, unit) {
  const n = Number(base) || 0
  switch (String(unit || '').toLowerCase()) {
    case 'l':
    case 'kg':
      return n / 1000
    case 'cl':
      return n / 10
    case 'mg':
      return n * 1000
    default:
      return n
  }
}

// IL NUMERO, COME SI SCRIVE QUI: due decimali al massimo e la virgola.
//
// Il numero grezzo finiva a schermo così com'era uscito dal calcolo — sulla
// card del Campari si leggeva «7.49000000001 pz», col punto al posto della
// virgola e la coda di decimali che si porta dietro qualunque
// moltiplicazione di ricetta.
//
// `useGrouping: 'always'`: senza, il punto delle migliaia dipende da quanto
// è aggiornata la tabella delle lingue del dispositivo — le versioni
// recenti non raggruppano i numeri di quattro cifre in italiano, quelle
// vecchie sì. Lo stesso magazzino si leggeva "2.000 mg" sul portatile e
// "2000 mg" sull'iPad. Qui si sceglie una forma sola, uguale ovunque.
const numero = (n) =>
  (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('it-IT', {
    maximumFractionDigits: 2,
    useGrouping: 'always',
  })

// Formatta una quantità BASE nell'unità ESATTA scelta (niente auto-scaling:
// se l'utente lavora in cl, vede cl). Etichette: L, cl, ml, kg, g, mg, pz, U.
export const UNIT_LABEL = { l: 'L', cl: 'cl', ml: 'ml', kg: 'kg', g: 'g', mg: 'mg', pz: 'pz', u: 'U' }
export function formatIn(base, unit) {
  return `${numero(fromBaseQty(base, unit))} ${UNIT_LABEL[String(unit || '').toLowerCase()] || unit}`
}

// Formatta la giacenza di un ITEM: nell'unità scelta se impostata, altrimenti
// auto (retrocompatibile con gli item senza unità di visualizzazione).
export function fmtItem(base, item) {
  return item?.display_unit ? formatIn(base, item.display_unit) : formatQty(base, item?.unit)
}

// Formatta una quantità (in unità base) in modo leggibile.
export function formatQty(qty, unit) {
  const n = Number(qty) || 0
  if (unit === 'ml') {
    if (n >= 1000) return `${numero(n / 1000)} L`
    if (n >= 100 && n % 10 === 0) return `${numero(n / 10)} cl`
    return `${numero(n)} ml`
  }
  if (unit === 'g') {
    if (n >= 1000) return `${numero(n / 1000)} kg`
    return `${numero(n)} g`
  }
  // Il generico non ha multipli né sottomultipli, e non è un pezzo: senza
  // questo ramo la manodopera si leggeva «3 pz».
  if (unitaGenerica(unit)) return `${numero(n)} ${UNITA_GENERICA}`
  return `${numero(n)} pz`
}

// Scompone la giacenza (in unità base) nelle bottiglie/confezioni:
//   - full:      bottiglie piene sigillate
//   - openRemaining: contenuto della bottiglia attualmente in uso (0 se nessuna)
//   - finished:  bottiglie ormai vuote (di quelle totali caricate)
// Esempio: bottiglia 1 L, 4 totali, stock 2,5 L → full 2, openRemaining 0,5 L, finished 1.
// Ritorna null per i prodotti a pezzi o senza confezione.
export function bottleBreakdown(item) {
  const c = contentBase(item)
  if (!c) return null
  // QUI SI RESTA DA ZERO IN SU, e non è una svista. Questa funzione conta
  // BOTTIGLIE: quante piene, quanta ce n'è nell'aperta. Sono oggetti sullo
  // scaffale, e sotto zero non ce ne stanno — scomponendo un −0,25 usciva
  // «−1 bottiglia, più 750 ml in quella aperta», che al banco non vuol dire
  // niente. Il meno lo porta `pezziInGiacenza`, che conta quantità e non
  // oggetti.
  const stock = giacenzaPerCarico(item?.stock)
  const total = Number(item?.bottles_total) || 0
  // Con la giacenza contata a PEZZI, "0,8" è una bottiglia aperta all'80%:
  // la parte intera sono le bottiglie piene, il resto è quanto c'è nella
  // aperta. Con la giacenza a volume vale lo stesso ragionamento diviso
  // per il contenuto. In entrambi i casi il residuo si esprime in ml/g,
  // che è come lo si legge al banco.
  const aPezzo = (item?.unit || 'pz') === 'pz'
  const full = aPezzo ? Math.floor(stock) : Math.floor(stock / c.size)
  const openRemaining = aPezzo ? (stock - full) * c.size : stock - full * c.size
  const hasOpen = openRemaining > 1e-9
  const withContent = full + (hasOpen ? 1 : 0)
  const finished = Math.max(0, total - withContent)
  return { full, openRemaining, hasOpen, finished, total }
}

// QUANTI PEZZI CI SONO, CON LA VIRGOLA.
//
// «3 bott.» diceva quante bottiglie si toccano, non quanto prodotto c'è
// dentro: tre bottiglie di cui una quasi vuota contavano come tre, e per
// sapere se bastavano per la serata bisognava aprire il dettaglio. Il
// pezzo invece è frazionabile: una bottiglia da 100 cl con dentro 50 cl è
// mezzo pezzo. Due piene e una a cui mancano 10 cl su 50 fanno 2,8.
//
// Il numero è comodo anche per il valore di magazzino: pezzi × costo.
export function pezziInGiacenza(item) {
  const c = contentBase(item)
  if (!c) return null
  // IL MENO ARRIVA FIN QUI, ed è il numero che lo mostra a chi guarda il
  // magazzino: un prodotto sceso sotto zero ha continuato a uscire dopo
  // essere finito, cioè è arrivato senza che nessuno lo caricasse (BUG-101).
  // Si divide la giacenza invece di rimettere insieme le bottiglie piene e
  // il fondo di quella aperta: quelle non vanno sotto zero, e il conto
  // tornerebbe a dire «0» proprio nel caso che interessa.
  const stock = Number(item?.stock) || 0
  // Giacenza già contata a pezzi (le bibite in bottiglia): il numero c'è
  // di suo, decimali compresi — «17» sono diciassette bottiglie, «2,8»
  // due e otto decimi di quella aperta.
  if ((item?.unit || 'pz') === 'pz') return stock
  if (!(c.size > 0)) return null
  return stock / c.size
}

// Il numero come si scrive: due decimali al massimo, senza zeri inutili in
// coda («3 pz», non «3,00 pz») e con la virgola, che è come si legge qui.
export function formatPezzi(n) {
  // Scrive anche il meno. Un numero negativo qui non è un errore da
  // nascondere: è un prodotto uscito più volte di quanto risultasse, e chi
  // guarda il magazzino deve vederlo per andare a cercare la consegna che
  // nessuno ha caricato.
  const v = Number(n) || 0
  const arrotondato = Math.round(v * 100) / 100
  return arrotondato.toLocaleString('it-IT', { maximumFractionDigits: 2 })
}

// Giacenza di un item da DRINK (bottiglie/confezioni frazionabili), coi
// tre dati che servono al banco, ognuno nella SUA unità:
//   - pezzi:   quanto prodotto c'è, in pezzi frazionati (2,8)
//   - bottles: quante bottiglie si toccano (piene + quella aperta)
//   - total:   contenuto totale nell'unità dell'item (cl/ml/g)
//   - open:    residuo della bottiglia aperta, stessa unità (null se nessuna)
// Il conteggio bottiglie è un numero di pezzi; il CONTENUTO non si misura
// mai in pezzi. Null per gli articoli a pezzo, che non si frazionano.
export function bottleSummary(item) {
  const bd = bottleBreakdown(item)
  if (!bd) return null
  const c = contentBase(item)
  // Il TOTALE è il contenuto, non un altro modo di scrivere i pezzi: sulla
  // card si leggeva «7,49 pz» col numero grande e «7.49000000001 pz» sotto,
  // cioè lo stesso dato due volte. Con la giacenza contata a pezzi il
  // contenuto sono i pezzi × la capienza della confezione; contata a volume
  // (o a peso) la giacenza È già il contenuto.
  const stock = Number(item?.stock) || 0
  const aPezzo = (item?.unit || 'pz') === 'pz'
  return {
    pezzi: pezziInGiacenza(item),
    bottles: bd.full + (bd.hasOpen ? 1 : 0),
    total: fmtContenuto(aPezzo ? stock * c.size : stock, item),
    // Il residuo della bottiglia aperta si legge SEMPRE in cl (o in g): anche
    // quando la giacenza è contata a pezzi, "aperta 0,8 pz" non dice niente a
    // chi sta versando.
    open: bd.hasOpen ? fmtContenuto(Math.round(bd.openRemaining), item) : null,
  }
}

// ── SI SCARICA DAL MAGAZZINO? ────────────────────────────────────────
//
// Lo decide IL PRODOTTO, non la sua unità di misura. La regola stava
// sull'unità — «quello che si conta a unità generiche non si scarica» — ed è
// giusta per la manodopera, che non sta su nessuno scaffale, ma non per il
// GHIACCIO: si conta a unità e finisce eccome, e chi lo finisce a mezzanotte
// vorrebbe averlo visto scendere.
//
// Il valore di partenza resta quello di prima, così i prodotti già in
// magazzino non cambiano comportamento: le unità generiche non sono una
// scorta finché qualcuno non dice il contrario, tutto il resto sì.
export function eScorta(item) {
  if (typeof item?.scorta === 'boolean') return item.scorta
  return !unitaGenerica(item?.unit)
}

// ── LEGGERE UN ARTICOLO SCRITTO COL MODELLO VECCHIO ──────────────────
//
// I 388 prodotti in magazzino sono stati scritti con i modelli di ieri:
// liquidi in cl, solidi in grammi, sacchi e manodopera in «U», qualcuno con
// la resa fra unità d'acquisto e unità d'uso. Il modello di oggi li vuole
// tutti a PEZZO con una corrispondenza sola (REQ-MAG-016).
//
// NON si travasano con uno script lanciato contro il database: «il travaso
// deve avvenire in fase di aggiornamento — quando si aggiorna il bundle si
// aggiornano i prodotti» (18/08). Si fa come con gli ordini vecchi, che
// nessuno ha mai migrato: `normalizeOrderDoc` li rimette in riga alla
// lettura (REQ-ORD-002), e da lì in poi il resto del codice non sa nemmeno
// che esistono due forme. Qui vale lo stesso: si legge tollerante, e
// l'articolo si riscrive nella forma nuova la prima volta che qualcuno lo
// tocca per un motivo suo — una modifica, un carico, una conta.
//
// LE REGOLE, e il perché di ognuna:
//   IL PEZZO È LA CONFEZIONE CHE SI COMPRAVA. Una bottiglia da 70 cl era già
//   «una confezione da 700 ml»: diventa un pezzo, e la giacenza in ml
//   diventa pezzi frazionati — senza stime, senza inventare niente. Per la
//   «U» il pezzo è l'unità: un sacco di ghiaccio era uno, resta uno.
//   LA RESA DIVENTA IL CONTENUTO, ma solo quando le due misure sono della
//   stessa famiglia (il fusto comprato a litri e versato a cl). Chi si
//   comprava a chili e si dosava in cl di succo — i limoni — nel modello
//   nuovo può corrispondere a una cosa sola, e sceglierla al posto di chi
//   lavora vuol dire buttare via l'altra: se una ricetta dosava nella misura
//   buttata, da quel momento scarica un chilo dove voleva un grammo. Quelli
//   restano come sono, e li si sistema a mano.
//   `scorta` VA SCRITTA. «Si scarica dal magazzino?» aveva un valore di
//   partenza legato all'unità: quello che si contava a «U» non era una
//   scorta. Portando tutto a pezzi quel valore cambierebbe risposta da solo,
//   e il «Tempo di Lavorazione» diventerebbe merce: andrebbe a zero al primo
//   drink e il menù farebbe sparire dalla carta i drink che lo usano.
//
// NIENTE ALTRO SI TOCCA: prezzi, ricette e voci di menù restano dove sono —
// in produzione sono stati sistemati a mano, uno per uno.

// Cosa andrebbe riscritto per portare l'articolo alla forma nuova, o null se
// è già a posto (o se non si può convertire senza inventare). Serve sia alla
// lettura tollerante sia a chi lo riscrive davvero.
export function patchNormalizza(item) {
  if (!item) return null
  const unit = String(item.unit || 'pz').toLowerCase()
  const stock = Number(item.stock) || 0
  const soglia = Number(item.low_threshold) || 0
  const pack = Number(item.package_size) || 0
  const resa = Number(item.resa) || 0
  const resaBase = item.resa_unit ? baseUnit(item.resa_unit) : null
  const resaValida = resa > 0 && !!resaBase

  if (unit === 'pz') {
    // Già a pezzi: resta solo la resa da riassorbire nel contenuto, che dice
    // la stessa cosa (resaUso preferisce la resa, quindi i numeri non si
    // muovono).
    if (!resaValida) return null
    return { package_size: resa, content_unit: resaBase, resa: null, resa_unit: null }
  }

  // Quante unità base d'acquisto fa un pezzo: la confezione. Per la «U»,
  // quando non c'è confezione, il pezzo è la unità stessa.
  const basePerPezzo = unitaGenerica(unit) ? pack || 1 : pack
  if (!(basePerPezzo > 0)) return null // non si sa cosa sia un pezzo: si lascia stare
  if (resaValida && resaBase !== unit) return null // due famiglie: decide una persona

  return {
    unit: 'pz',
    display_unit: 'pz',
    stock: arrotondaPezzi(stock / basePerPezzo),
    low_threshold: arrotondaPezzi(soglia / basePerPezzo),
    package_size: resaValida ? resa * basePerPezzo : basePerPezzo,
    content_unit: resaValida ? resaBase : unitaGenerica(unit) ? UNITA_GENERICA : unit,
    resa: null,
    resa_unit: null,
    scorta: eScorta(item),
  }
}

// I pezzi si scrivono con qualche decimale e basta: 2,0200000000000005 è la
// coda della divisione, e se la porterebbe dietro ogni conto successivo.
const arrotondaPezzi = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6

// L'articolo come lo vede il resto dell'app: sempre nella forma nuova. Chi è
// già a posto torna com'è — stessa identità, che questa funzione sta sulla
// strada di ogni lettura.
// `formaVecchia` resta attaccato a quelli convertiti al volo: serve alla
// scheda per dire che quella giacenza si sta leggendo tradotta, e non si
// salva da nessuna parte.
export function articoloNormalizzato(item) {
  const patch = patchNormalizza(item)
  if (!patch) return item
  return {
    ...item,
    ...patch,
    formaVecchia: { unit: item.unit || 'pz', stock: Number(item.stock) || 0 },
  }
}

// ── IL TRAVASO LO FA L'UTENTE, CON UN GESTO ──────────────────────────
//
// La lettura tollerante qui sopra serve a far funzionare il magazzino su un
// database non ancora aggiornato: senza, i numeri non si potrebbero nemmeno
// mostrare. Ma il DATABASE non lo cambia da sola, e nemmeno lo cambia di
// nascosto quando qualcuno tocca un articolo per un motivo suo: «il travaso
// dovrebbe farlo l'utente. Quando entra in magazzino un banner gli dice che
// deve iniziare la migrazione» (18/08).
//
// Lo stato non è un flag scritto da qualche parte — un cartello acceso su un
// database già a posto è peggio di nessun cartello: si guarda se esistono
// ancora articoli nella forma vecchia. Così resta vero anche se i dati
// arrivano sistemati da un'altra strada.

// Perché questo articolo non si può portare a pezzi da solo, detto a chi
// deve sistemarlo. Null se invece si può.
export function motivoNonMigrabile(item) {
  const unit = String(item?.unit || 'pz').toLowerCase()
  const eti = (u) => UNIT_LABEL[String(u).toLowerCase()] || u
  if (unit === 'pz') {
    // UN CONTENUTO SENZA MISURA NON È UN CONTENUTO. Sulla «Birra Pils
    // (spina)» c'è scritto 330 e basta: cl? ml? grammi? Nessuno lo sa, e
    // indovinare vuol dire sbagliare il costo di un drink di dieci volte.
    // Contando a pezzi la giacenza regge lo stesso, ma il costo al cl e lo
    // scarico frazionato non esistono finché non lo dice una persona.
    const size = Number(item?.package_size) || 0
    if (size > 0 && !contentBase(item)) {
      return `c'è scritto che un pezzo contiene ${size}, ma non di che misura: va detto se sono cl, grammi o U`
    }
    return null
  }
  const resa = Number(item?.resa) || 0
  const resaBase = item?.resa_unit ? baseUnit(item.resa_unit) : null
  if (resa > 0 && resaBase && resaBase !== unit) {
    return `si compra a ${eti(unit)} e si usa in ${eti(resaBase)}: va detto a quanto corrisponde un pezzo`
  }
  // Una «U» era già una cosa che si conta — il sacco, la confezione — quindi
  // un pezzo è una U e non serve nessuna confezione dichiarata. Per volumi e
  // pesi invece la confezione È il pezzo: senza, non si sa quanti pezzi
  // siano quei millilitri.
  if (!unitaGenerica(unit) && !(Number(item?.package_size) > 0)) {
    return `si conta a ${eti(unit)} e non si sa quanto contiene una confezione: va detto a quanto corrisponde un pezzo`
  }
  return null
}

// A che punto sta il travaso, guardando gli articoli COSÌ COME LI LEGGE
// L'APP (quindi già passati da articoloNormalizzato):
//   daMigrare   → si leggono già a pezzi ma sul database sono ancora scritti
//                 alla vecchia maniera: basta salvarli
//   daSistemare → nemmeno la lettura li sa portare a pezzi, e prima che il
//                 travaso parta li deve aprire una persona
//   fatto       → non c'è niente da fare, e la schermata non ne parla
// IL MAGAZZINO È IN SOLA LETTURA finché il travaso non è fatto: si può
// toccare soltanto quello che serve a farlo partire. Non è una regola della
// SCHERMATA del magazzino — vale per chiunque scriva — e Acquisti → «ricevi
// ordine» ne era fuori solo perché il blocco viveva dentro InventoryManager.
export const magazzinoBloccato = (items) => !statoTravaso(items).fatto

export function statoTravaso(items) {
  const daMigrare = []
  const daSistemare = []
  for (const it of items || []) {
    if (motivoNonMigrabile(it)) daSistemare.push(it)
    else if (it?.formaVecchia) daMigrare.push(it)
  }
  return {
    daMigrare,
    daSistemare,
    totale: (items || []).length,
    fatto: daMigrare.length === 0 && daSistemare.length === 0,
  }
}

// Stato scorta di un item: 'empty' (≤0), 'low' (≤ soglia), 'ok'.
export function stockStatus(item) {
  // Quello che non è una scorta non finisce mai: la manodopera non sta su
  // nessuno scaffale. Se rispondesse 'empty' — e a giacenza zero
  // risponderebbe sempre — il menù direbbe «Ingrediente esaurito» e il drink
  // che la usa sparirebbe dalla carta, oltre a finire nelle proposte
  // d'ordine al fornitore. Il ghiaccio, che invece è una scorta anche se si
  // conta a unità, passa di qui come tutti gli altri.
  if (!eScorta(item)) return 'ok'
  const stock = Number(item?.stock) || 0
  if (stock <= 0) return 'empty'
  if (stock <= (Number(item?.low_threshold) || 0)) return 'low'
  return 'ok'
}

// I TRE STATI DELLA DISPONIBILITÀ, scritti in italiano una volta sola.
// Servono alla tabella del nuovo ordine (REQ-MAG-036), dove la
// disponibilità è una colonna che si legge e si ordina: chiedendola qui,
// accanto alla funzione che la calcola, non si finisce con due elenchi di
// parole per gli stessi tre stati.
export const ETICHETTA_SCORTA = {
  ok: 'In scorta',
  low: 'In esaurimento',
  empty: 'Esaurito',
}

// ── C'È O NON C'È ────────────────────────────────────────────────────
//
// La domanda più ovvia di tutte — cosa c'è davvero sullo scaffale — nel
// filtro non c'era: si poteva chiedere solo cosa sta finendo e cosa è
// finito, e per vedere il resto bisognava guardare «Tutti» e saltare a
// occhio due terzi di righe esaurite (232 su 388, al banco, il 18/08).
//
// GLI «IN ESAURIMENTO» CI STANNO DENTRO: sono in magazzino, solo pochi.
// «In esaurimento» è una lente più stretta dentro la stessa famiglia, non
// un'altra famiglia — e chi guarda cosa c'è vuole vedere anche l'ultima
// bottiglia di gin, che è proprio quella che gli serve sapere.
//
// Quello che NON È UNA SCORTA — il tempo di lavorazione, il lavoro a
// servizio — non sta né di qua né di là: non ha giacenza, non è né
// disponibile né esaurito. Metterlo fra i disponibili vorrebbe dire dire
// che c'è sullo scaffale una cosa che sullo scaffale non ci va.
export function haGiacenza(item) {
  return eScorta(item) && (Number(item?.stock) || 0) > 0
}

// Conteggi per i chip di riepilogo: totale prodotti, in scorta, in
// esaurimento, esauriti. In scorta ed esauriti si dividono tutte le scorte,
// e in esaurimento è un sottoinsieme del primo.
export function inventorySummary(items) {
  let total = 0
  let inScorta = 0
  let low = 0
  let empty = 0
  for (const it of items || []) {
    total += 1
    if (haGiacenza(it)) inScorta += 1
    const st = stockStatus(it)
    if (st === 'low') low += 1
    else if (st === 'empty') empty += 1
  }
  return { total, inScorta, low, empty }
}

// Filtra/ordina la lista inventario per ricerca (nome), categoria, fornitore e stato.
//   filters: { query?, categoryId? ('all'|id|'none'), supplierId? ('all'|id|'none'),
//              status? ('all'|'ok'|'low'|'empty') }
// ASSORTIMENTO. Quattro stati, in ordine di attenzione richiesta:
//
//   'assortimento' → si tiene, senza niente di speciale. È il DEFAULT: un
//                    prodotto nuovo nasce così, e la stragrande maggioranza
//                    resta così.
//   'linea'        → i cavalli di battaglia: non devono mancare mai, sono i
//                    primi da controllare prima di una serata.
//   'premium'      → le bottiglie buone.
//   'out'          → fuori assortimento: non si ricompra.
//
// Il filtro accetta PIÙ valori insieme, perché la domanda vera è quasi sempre
// combinata: "linea e premium, senza gli out" oppure "linea e out, per
// decidere cosa far rientrare".
export const ASSORTIMENTI = ['assortimento', 'linea', 'premium', 'out']
export const assortimentoDi = (item) =>
  ASSORTIMENTI.includes(item?.status) ? item.status : 'assortimento'

// Come si legge un assortimento a parole. Sta qui e non in una schermata
// perché a chiederlo sono in due — la lista del magazzino e la tabella del
// nuovo ordine (REQ-MAG-036) — e due elenchi di parole per gli stessi
// quattro stati diventano due vocabolari appena qualcuno ne cambia uno.
export const ETICHETTA_ASSORTIMENTO = {
  assortimento: 'In assortimento',
  linea: 'In linea: non deve mancare',
  premium: 'Premium',
  out: 'Fuori assortimento: non si ricompra',
}

// `fornitoriPerArticolo` (item_id -> [supplier_id]) arriva dal LISTINO
// (REQ-MAG-029): da quando il legame prodotto-fornitore vive lì, un
// prodotto può averne più d'uno e il campo sul prodotto non basta più.
// Quando non c'è si guarda il vecchio campo, ed è il caso di chi chiama
// questa funzione senza saperne niente.
export function filterItems(
  items,
  {
    query = '',
    categoryId = 'all',
    supplierId = 'all',
    status = 'all',
    assortimenti = null,
    fornitoriPerArticolo = null,
  } = {}
) {
  const fornitoriDi = (it) =>
    fornitoriPerArticolo?.get(it.id) ?? (it.supplier_id ? [it.supplier_id] : [])
  const q = query.trim().toLowerCase()
  const out = (items || []).filter((it) => {
    if (q && !(it.name || '').toLowerCase().includes(q)) return false
    if (categoryId === 'none') {
      if (it.category_id) return false
    } else if (categoryId !== 'all') {
      if (it.category_id !== categoryId) return false
    }
    if (supplierId === 'none') {
      if (fornitoriDi(it).length > 0) return false
    } else if (supplierId !== 'all') {
      if (!fornitoriDi(it).includes(supplierId)) return false
    }
    // «In scorta» non è uno stato di stockStatus: è la domanda «c'è?», e
    // comprende anche quello che sta finendo (vedi haGiacenza).
    if (status === 'in_scorta') {
      if (!haGiacenza(it)) return false
    } else if (status !== 'all' && stockStatus(it) !== status) return false
    // null o lista vuota = nessun filtro: si vede tutto (non "niente", che
    // farebbe sparire l'inventario a chi deseleziona per sbaglio).
    if (Array.isArray(assortimenti) && assortimenti.length > 0) {
      if (!assortimenti.includes(assortimentoDi(it))) return false
    }
    return true
  })
  out.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  return out
}

// ── Costi e valorizzazione ─────────────────────────────────────────────

// Prezzo con IVA a partire dal netto e dall'aliquota (%).
export function costWithVat(cost, vat = 22) {
  return (Number(cost) || 0) * (1 + (Number(vat) || 0) / 100)
}

// Numero di confezioni/bottiglie equivalenti in giacenza.
// La giacenza si legge SEMPRE da zero in su: con un −0,04 pz rimasto in
// magazzino si leggeva «valore −0,67 €», cioè un magazzino che vale meno di
// niente. Quello che manca è un errore da correggere, non un credito.
export function unitsInStock(item) {
  // Il lavoro non sta sullo scaffale: quello che non è una scorta non è
  // giacenza e non entra nel valore del magazzino.
  if (!eScorta(item)) return 0
  const stock = giacenzaPerCarico(item?.stock)
  // Il pezzo conta se stesso — e così l'unità, quando è una scorta: un
  // sacchetto di ghiaccio è uno, non una frazione di confezione.
  if (item?.unit === 'pz' || unitaGenerica(item?.unit)) return stock
  const size = Number(item?.package_size) || 0
  return size > 0 ? stock / size : 0
}

// Valore della giacenza di un item (default con IVA).
export function stockValue(item, { gross = true } = {}) {
  const unit = gross ? costWithVat(item?.cost, item?.vat) : (Number(item?.cost) || 0)
  return unitsInStock(item) * unit
}

// Costo per cl (volumi): costo confezione / cl per confezione. null se non applicabile.
export function costPerCl(item, { gross = true } = {}) {
  if (item?.unit !== 'ml') return null
  const size = Number(item?.package_size) || 0
  if (size <= 0) return null
  const unit = gross ? costWithVat(item?.cost, item?.vat) : (Number(item?.cost) || 0)
  return unit / (size / 10)
}

// CONTENUTO DI UNA CONFEZIONE, con la famiglia a cui appartiene.
// Per gli articoli a volume o a peso il contenuto è già nell'unità base
// dell'articolo. Per quelli contati a PEZZO (una Ceres o una Coca: o c'è o
// non c'è) la giacenza è in pezzi, ma la bottiglia un contenuto ce l'ha
// lo stesso — 33 cl — e senza saperlo non si può dire quanto costa al cl.
// `content_unit` dice di che famiglia è quel numero.
// Un articolo in unità generiche non ha contenuto: dentro una unità di lavoro
// non c'è niente da misurare, e resta null.
export function contentBase(item) {
  const size = Number(item?.package_size) || 0
  if (!(size > 0)) return null
  const base = (item?.unit || 'pz') === 'pz' ? item?.content_unit || null : item.unit
  // UN PEZZO PUÒ CONTENERE UNITÀ. «Il tempo di lavoro in pezzi e dopo unità»
  // (Flavio, 17/08): una confezione da 10 U, che in ricetta si dosa a U. Le
  // unità restano quello che sono — non si convertono in niente e non si
  // scaricano dal magazzino, vedi computeConsumption.
  if (unitaGenerica(base)) return { size, base: UNITA_GENERICA }
  if (base !== 'ml' && base !== 'g') return null
  return { size, base }
}

// Unità di misura "piccole" adatte a mostrare il prezzo unitario:
// liquidi (base ml) → cl o ml; solidi (base g) → g o mg; pezzi → pz.
// Un articolo a pezzo di cui si conosce il contenuto le offre entrambe: si
// vende a bottiglia, ma sapere quanto costa al cl serve lo stesso.
export function smallUnits(item) {
  if (item?.unit === 'ml') return ['cl', 'ml']
  if (item?.unit === 'g') return ['g', 'mg']
  if (unitaGenerica(item?.unit)) return [UNITA_GENERICA]
  const c = contentBase(item)
  if (c?.base === 'ml') return ['pz', 'cl', 'ml']
  if (c?.base === 'g') return ['pz', 'g', 'mg']
  if (c && unitaGenerica(c.base)) return ['pz', UNITA_GENERICA]
  return ['pz']
}

// Quante unità base (ml/g) vale 1 unità di misura. Copre TUTTE le unità
// gestite (comprese L/kg), non solo le "piccole": così un costo non va mai
// perso in silenzio per un'unità non prevista. Deve restare coerente con
// toBaseQty (stessi fattori di conversione).
const BASE_PER_UNIT = { l: 1000, cl: 10, ml: 1, kg: 1000, g: 1, mg: 0.001, pz: 1, u: 1 }

// Costo di una singola unità (L/cl/ml/kg/g/mg/pz/U) partendo dal costo per
// confezione: cost / (package_size / base-per-unità). Null se non calcolabile.
// L'unità richiesta deve appartenere alla stessa famiglia dell'item
// (liquido↔ml, solido↔g): chiedere il costo al ml di un solido non ha senso.
export function costPerUnit(item, unit, { gross = true } = {}) {
  const packCost = gross ? costWithVat(item?.cost, item?.vat) : Number(item?.cost) || 0
  if (!(packCost > 0)) return null
  const per = BASE_PER_UNIT[String(unit || '').toLowerCase()]
  // ARTICOLO IN UNITÀ GENERICHE: il costo è per unità e non c'è nessuna
  // confezione da dividere — una unità di lavoro costa quello che costa. E non
  // si mescola con volumi e pesi: quanto costa al cl un'ora di lavoro non
  // vuol dire niente, quindi null («non lo so», non «zero»).
  if (unitaGenerica(item?.unit)) {
    if (unitaGenerica(unit)) return packCost
    // Una unità può rendere qualcosa che si dosa: un sacchetto di ghiaccio
    // (1 U) fa 5000 g. Allora il grammo costa quello che costa il sacchetto
    // diviso quanto ne fa. Senza resa, «non lo so».
    const r = resaUso(item)
    const per = BASE_PER_UNIT[String(unit || '').toLowerCase()]
    if (!r || !per || baseUnit(unit) !== r.base || !(r.per > 0)) return null
    return (packCost / r.per) * per
  }
  if (unitaGenerica(unit)) {
    // Pezzo che CONTIENE unità (1 pz = 10 U): la singola unità costa la
    // confezione diviso quante ne fa. Fuori da questo caso il generico non
    // si mescola con volumi e pesi: quanto costa al cl un'ora di lavoro non
    // vuol dire niente.
    const c = contentBase(item)
    if ((item?.unit || 'pz') === 'pz' && c && unitaGenerica(c.base) && c.size > 0) {
      return packCost / c.size
    }
    return null
  }
  const acquisto = item?.unit || 'pz'
  // Quanto costa UNA unità base d'acquisto: un pezzo costa quello che costa,
  // il resto è il costo della confezione diviso quanto contiene.
  const costoBaseAcquisto = (() => {
    if (acquisto === 'pz') return packCost
    const size = Number(item?.package_size) || 0
    return size > 0 ? packCost / size : null
  })()
  if (costoBaseAcquisto == null) return null
  if (baseUnit(unit) === acquisto) {
    if (!per) return null
    return costoBaseAcquisto * per
  }
  // UNITÀ D'USO: ci si arriva con la resa. Un cl di succo di limone costa
  // quanto costano i grammi di limoni che ci vogliono per farlo. Senza resa
  // null, che vuol dire «non lo so» e non «zero».
  const r = resaUso(item)
  if (!r || !per || baseUnit(unit) !== r.base || !(r.per > 0)) return null
  return (costoBaseAcquisto / r.per) * per
}

// Valore totale del magazzino.
export function inventoryTotalValue(items, opts) {
  return (items || []).reduce((s, it) => s + stockValue(it, opts), 0)
}

// ── SOTTO ZERO NON SI SCENDE ──────────────────────────────────────────
// Il 17 agosto il Jagermeister era a −0,04 pz, con «valore −0,67 €» e la
// conta che si apriva già in rosso: si continua a battere un prodotto finito
// e lo scarico toglie comunque, perché `increment(-qty)` non guarda quanto
// c'è. L'increment resta — è commutativo e si accoda offline, e al banco
// niente aspetta la rete: quello che si decide prima di chiederlo è QUANTO
// togliere.

// IL FRENO DELLO SCARICO A MANO: mai più di quello che risulta in giacenza,
// e da una giacenza già a zero (o negativa) niente.
//
// Non vale per la vendita, che sotto zero ci va e deve andarci (BUG-101):
// lì il meno misura quanto è uscito senza essere stato caricato. Qui invece
// c'è una persona che dichiara quanto ha tolto dallo scaffale — e da uno
// scaffale vuoto non si toglie niente, quindi un meno sarebbe solo un numero
// sbagliato in più.
export function scaricoPossibile(stock, qty) {
  const richiesta = Number(qty) || 0
  if (!(richiesta > 0)) return 0
  const giacenza = Number(stock) || 0
  if (!(giacenza > 0)) return 0
  return Math.min(richiesta, giacenza)
}

// La giacenza da cui parte un CARICO, che non è mai negativa: comprando una
// bottiglia e caricandola su −0,04 se ne deve contare UNA. Partendo dal
// negativo il carico ne conta meno di una, sullo scaffale però c'è tutta, e
// da quel momento il magazzino mente su quanto prodotto c'è davvero.
export function giacenzaPerCarico(stock) {
  return Math.max(0, Number(stock) || 0)
}

// QUANTO TOGLIERE DALLA GIACENZA per una riga di ricetta.
//
// Le ricette si scrivono come si versa — 40 ml di gin, 1 pz di Coca — mentre
// la giacenza può essere contata in un'altra unità. Un articolo a PEZZO con
// il contenuto noto consuma FRAZIONI di bottiglia: 40 ml da una da 700 sono
// 0,057 pezzi. Senza questa conversione lo scarico sottrae il numero della
// ricetta così com'è, cioè 40 BOTTIGLIE per un cocktail da 40 ml.
//
// Se la conversione non è possibile (unità di famiglie diverse, contenuto
// ignoto) si restituisce la quantità com'è: meglio un consumo impreciso che
// un numero inventato con una moltiplicazione a caso.
export function qtyInStockUnit(qty, unit, item) {
  const q = Number(qty) || 0
  if (q === 0) return 0
  // IL SEGNO SI CONSERVA. Qui si converte e basta — quanto vale in giacenza
  // una quantità scritta in un'altra unità — e una conversione che sputa
  // zero davanti a un numero negativo non è prudente, è sbagliata: era lei
  // a mangiarsi la merce che TORNA sullo scaffale quando una comanda già
  // scalata viene ridotta (BUG-101).
  if (q < 0) return -qtyInStockUnit(-q, unit, item)
  const u = String(unit || 'pz').toLowerCase()
  const stockUnit = item?.unit || 'pz'
  if (u === stockUnit) return q
  // "1 pz" di un articolo contato a volume = una confezione intera.
  if (u === 'pz') {
    const size = Number(item?.package_size) || 0
    return size > 0 ? q * size : q
  }
  const base = toBaseQty(q, u)
  if (baseUnit(u) === stockUnit) return base
  // Unità d'uso: si torna a quella d'acquisto con la resa. Vale per la
  // bottiglia (40 ml da una da 700 sono 0,057 pezzi) e per il chilo di
  // limoni (4 cl di succo sono 80 g di limoni).
  const r = resaUso(item)
  if (!r || baseUnit(u) !== r.base || !(r.per > 0)) return q
  return base / r.per
}

// ── OGNI MOVIMENTO CHIEDE IN CHE UNITÀ ───────────────────────────────
//
// «Se facciamo un carico, uno scarico, qualsiasi cosa esso sia di
// movimentazione» si sceglie se muovere a PEZZI o nell'unità che compone il
// pezzo (Flavio, 18/08). I limoni si comprano a chili e si contano a pezzi:
// chi carica una cassetta scrive 5 kg, non «47 limoni» contati a uno a uno.
//
// Il primo della lista è come si conta la giacenza — i pezzi — perché è la
// risposta giusta quasi sempre; il secondo è il contenuto, quando c'è.
const UNITA_PARLATA = { ml: 'cl', g: 'g', pz: 'pz', [UNITA_GENERICA]: UNITA_GENERICA }
export function unitaMovimento(item) {
  const stockUnit = item?.unit || 'pz'
  const c = contentBase(item)
  if (stockUnit === 'pz') {
    if (!c || !(c.size > 0)) return ['pz']
    const seconda = UNITA_PARLATA[c.base] || c.base
    return seconda === 'pz' ? ['pz'] : ['pz', seconda]
  }
  // Schede storiche a volume, peso o unità, finché non passano dal travaso
  // (REQ-MAG-018): si muovono nella loro unità, più la confezione quando ce
  // n'è una — sono le «confezioni piene» di sempre.
  const propria = UNITA_PARLATA[stockUnit] || stockUnit
  return Number(item?.package_size) > 0 ? ['pz', propria] : [propria]
}

// L'INVERSO di qtyInStockUnit: da quello che c'è in giacenza al numero
// nell'unità scelta. Serve a scrivere nel campo la quantità che c'è già
// (la rettifica parte da lì) e a cambiare unità senza cambiare la quantità.
export function fromStockUnit(stockQty, unit, item) {
  const q = Number(stockQty) || 0
  if (!(q > 0)) return 0
  const u = String(unit || 'pz').toLowerCase()
  const stockUnit = item?.unit || 'pz'
  if (u === stockUnit) return q
  if (u === 'pz') {
    const size = Number(item?.package_size) || 0
    return size > 0 ? q / size : q
  }
  if (baseUnit(u) === stockUnit) return fromBaseQty(q, u)
  const r = resaUso(item)
  if (!r || baseUnit(u) !== r.base || !(r.per > 0)) return q
  return fromBaseQty(q * r.per, u)
}

// Calcola il consumo totale per ingrediente da una lista di order_items.
//   orderItems: [{ drink_id, qty, recipe_items? }]
//   drinksById: { [drinkId]: { recipe_items: [{ inventory_item_id, name, unit, qty }] } }
// Gli item "custom" (drink composti al volo dal bartender) portano la ricetta
// incorporata in `recipe_items`: ha la precedenza sulla ricetta del catalogo.
// Ritorna: [{ inventory_item_id, name, unit, qty }] con qty in unità base.
export function computeConsumption(orderItems, drinksById) {
  const acc = new Map()
  for (const oi of orderItems || []) {
    const recipe = Array.isArray(oi.recipe_items)
      ? oi.recipe_items
      : drinksById?.[oi.drink_id]?.recipe_items
    if (!Array.isArray(recipe)) continue
    const mult = Number(oi.qty) || 0
    for (const ri of recipe) {
      if (!ri.inventory_item_id) continue
      // QUI SI CONTA TUTTO QUELLO CHE LA RICETTA CHIEDE, manodopera compresa:
      // cosa poi vada tolto dalla giacenza lo decide il PRODOTTO (eScorta),
      // e lo decide chi scrive la giacenza, che l'articolo ce l'ha in mano.
      // Filtrare qui sull'unità significava che il ghiaccio — contato a
      // unità ma scorta vera — non si scaricava mai.
      const add = (Number(ri.qty) || 0) * mult
      if (add <= 0) continue
      // Si somma per ARTICOLO **E UNITÀ**: la stessa bottiglia può comparire
      // in una ricetta a cl (40 ml di gin in un cocktail) e in un'altra a
      // pezzo (una Coca servita intera). Sommandole insieme si otterrebbe
      // "41" senza sapere di cosa, e lo scarico toglierebbe un numero senza
      // senso. Restano due voci, ognuna con la sua unità.
      const unit = ri.unit ?? 'pz'
      const chiave = `${ri.inventory_item_id}|${unit}`
      const ex = acc.get(chiave)
      if (ex) ex.qty += add
      else acc.set(chiave, {
        inventory_item_id: ri.inventory_item_id,
        name: ri.name ?? null,
        unit,
        qty: add,
      })
    }
  }
  return [...acc.values()]
}

// IL CONTENUTO NON SI MISURA MAI IN PEZZI.
//
// Un pezzo è la bottiglia; dentro ci sono cl (o grammi). Sugli articoli
// contati a pezzo la giacenza è in pezzi ma il contenuto — quello della
// bottiglia aperta, la capienza della confezione — resta in unità di
// volume o di peso: si leggeva «1 aperta (40 pz) · 1 conf. = 200 pz», che
// non vuol dire niente per chi sta versando.
export function fmtContenuto(qty, item) {
  const c = contentBase(item)
  if (!c) return fmtItem(qty, item)
  if ((item?.unit || 'pz') !== 'pz') return fmtItem(qty, item)
  if (unitaGenerica(c.base)) return formatQty(qty, UNITA_GENERICA)
  return formatIn(qty, c.base === 'g' ? 'g' : 'cl')
}

// QUANTO CONTIENE UN PEZZO, nell'unità in cui quel numero si legge.
//
// Un fusto da venti litri si leggeva «2000 cl», e chi lo guarda si chiede se
// qualcuno se lo sia inventato. Normalizzare sempre in centilitri va bene
// per le bottiglie e male per tutto il resto: qui l'unità la sceglie il
// numero — 20 L, 70 cl, 33 cl, 8 g, 1 kg — mentre il residuo della
// confezione aperta resta in cl, che è come si conta quello che è rimasto
// dentro (vedi fmtContenuto).
// Null quando il contenuto non c'è, o c'è ma senza dire di che misura.
export function contenutoDelPezzo(item) {
  const c = contentBase(item)
  if (!c || !(c.size > 0)) return null
  return formatQty(c.size, c.base)
}

// ── QUANTO ENTRA IN GIACENZA COMPRANDO N CONFEZIONI ──────────────────
//
// LE QUANTITÀ IN MAGAZZINO SONO IN UNITÀ BASE: sei cartoni da 70 cl non
// sono «sei», sono quattromiladuecento millilitri. Il conto stava dentro il
// carico degli ordini; da REQ-MAG-030 lo fa anche la fattura, e due copie
// della stessa moltiplicazione sono due occasioni di scriverla diversa.
//
// `bottles_total` conta i PEZZI passati per il magazzino, aperti e chiusi:
// serve al costo medio e alla conta. Si ricalcola da quello che c'è in
// giacenza (i pezzi interi, più quello aperto se avanza un fondo) più
// quelli appena arrivati; per chi si conta a pezzi non esiste, perché il
// pezzo È l'unità.
export function caricoDaConfezioni(item, qtyPackages) {
  const qty = Number(qtyPackages) || 0
  const size = Number(item?.package_size) || 0
  if (item?.unit === 'pz' || !size) return { addQty: qty, bottles_total: null }
  const stock = Number(item?.stock) || 0
  const interi = Math.floor(stock / size)
  // Un fondo di bottiglia è una bottiglia aperta, non zero: il margine
  // toglie di mezzo gli spiccioli della virgola mobile.
  const aperta = stock - interi * size > 1e-9
  return { addQty: qty * size, bottles_total: interi + (aperta ? 1 : 0) + qty }
}

// ── IL PRODOTTO CHE NASCE DA UN ORDINE (REQ-MAG-032) ─────────────────
//
// Prima, davanti a una riga d'ordine il cui articolo non esiste in
// anagrafica, non succedeva niente: la riga passava a «consegnato», la
// giacenza non si muoveva e nessuno se ne accorgeva. Se il fornitore
// mandava una referenza nuova, quella merce spariva — non entrava in
// magazzino, non risultava da nessuna parte, e a schermo la consegna
// sembrava andata a buon fine. Una merce contata male si vede; una merce
// che sparisce in silenzio no, e quella è la peggiore delle due.
//
// IL NOME NON È QUELLO DEL TRAVASO, ed è una scelta. In magazzino c'è già
// una lista «da sistemare»: sono i prodotti che il passaggio alla gestione
// a pezzi (REQ-MAG-018) non sa convertire da solo, e finché ce n'è uno il
// magazzino intero resta in sola lettura. Qui non c'è niente di bloccato e
// niente da convertire: c'è una scheda nata a metà, che si compila con
// calma mentre il locale lavora. Due liste con lo stesso nome sulla stessa
// schermata sono due significati per una parola sola, e si pagano il giorno
// in cui qualcuno legge «da sistemare» e ferma un turno per niente. Questa
// si chiama SCHEDA DA COMPLETARE, e non blocca nessuno.
//
// LA CONFEZIONE NON SI SCRIVE, ed è la trappola da non calpestare. La riga
// d'ordine porta un `package_size` ma non dice di che misura sia quel
// contenuto: scriverlo senza `content_unit` farebbe rispondere
// `motivoNonMigrabile` — «c'è scritto che un pezzo contiene 700, ma non di
// che misura» — e da quel momento il magazzino INTERO andrebbe in sola
// lettura per colpa di un prodotto appena nato. Il prodotto nasce quindi
// contato a pezzi e basta, che è esattamente quello che l'ordine sa: sei
// confezioni sono sei pezzi. Quanto contiene un pezzo è una delle cose da
// completare a mano.
export function prodottoDaRigaOrdine(riga) {
  const costo = Number(riga?.unit_cost)
  return {
    name: riga?.name || 'Prodotto senza nome',
    unit: 'pz',
    display_unit: 'pz',
    package_size: null,
    content_unit: null,
    stock: 0,
    bottles_total: 0,
    // La soglia di riordino è una delle tre cose che l'ordine non sa: a zero
    // il prodotto non entrerà mai nei «sotto scorta», ed è meglio così —
    // proporre un riordino su una soglia inventata è peggio che non
    // proporlo.
    low_threshold: 0,
    category_id: null,
    cost: Number.isFinite(costo) ? costo : 0,
    // L'IVA D'ACQUISTO EREDITA IL DEFAULT (REQ-MAG-025 punto 3): l'ordine
    // porta il prezzo, non l'aliquota, e chi la sa la corregge.
    vat: riga?.vat != null ? Number(riga.vat) : 22,
    // Il fornitore NON si scrive sul prodotto (REQ-MAG-029): la merce
    // arrivata scrive la sua riga di listino, che è il posto dove quel
    // legame vive da quando un prodotto può averne più d'uno.
    status: 'assortimento',
    scheda_da_completare: true,
  }
}

// Cosa manca a una scheda nata da un ordine, detto a chi deve compilarla.
// Sono le tre cose che l'ordine non poteva sapere, e la prima è quella che
// fa danno: senza categoria non c'è macro d'acquisto, e la spesa di quel
// prodotto SPARISCE da «Bilancio → Acquisti × Fatturato» invece di
// risultare sbagliata (REQ-MAG-022). È lo stesso buco delle categorie senza
// macro (REQ-UI-022), visto dall'altro lato.
export function mancaNellaScheda(item) {
  const manca = []
  if (!item?.category_id) manca.push('la categoria')
  if (!(Number(item?.package_size) > 0)) manca.push('quanto contiene un pezzo')
  if (!(Number(item?.low_threshold) > 0)) manca.push('la soglia di riordino')
  return manca
}

export const prodottiDaCompletare = (items) =>
  (items || []).filter((it) => it?.scheda_da_completare)

// LA SCHEDA SI CHIUDE CON LA CATEGORIA, non col semplice fatto di averla
// aperta. Bastasse un salvataggio qualunque, il segno sparirebbe dal
// prodotto che qualcuno ha guardato per un secondo, e la spesa continuerebbe
// a non comparire nei conti senza più niente che lo dica. Le altre due cose
// che mancano si leggono nella scheda e non tolgono soldi a nessun totale.
export function schedaCompletata(prima, patch) {
  if (!prima?.scheda_da_completare) return false
  return !!(patch && 'category_id' in patch ? patch.category_id : prima.category_id)
}

// ── DUPLICARE UN PRODOTTO ────────────────────────────────────────────
// Cosa si porta dietro la copia, e cosa no. Sta qui e non nella
// schermata perché è una regola sui dati: la giacenza NON si copia — la
// copia è un prodotto che in magazzino non è mai entrato, e portarsi
// dietro le bottiglie vorrebbe dire inventarsele. Nemmeno l'identità
// (id, data di creazione) e nemmeno il conteggio delle bottiglie
// caricate, che appartiene alla storia dell'originale.
export function copiaProdotto(item) {
  if (!item) return null
  const { id, created_at, stock, bottles_total, ...resto } = item // eslint-disable-line no-unused-vars
  return {
    ...resto,
    name: `${item.name || 'Prodotto'} (copia)`,
    stock: 0,
    bottles_total: 0,
  }
}
