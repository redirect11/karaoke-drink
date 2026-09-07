// ── IL LISTINO FORNITORI: un prodotto, più fornitori ──────────────────
//
// Nasce da Flavio, che ha provato la sezione Ordini (26/08/2026): «quel
// prodotto — ad esempio il Campari — deve essere associato a quel
// fornitore, e io questo non lo posso fare CATEGORICAMENTE: è quasi sicuro
// che il Campari lo prendo anche da fornitori differenti» (REQ-MAG-029).
//
// IL MAGAZZINO NON CAMBIA. Il prodotto Campari resta UNO con UNA giacenza:
// a duplicarsi è la RIGA DELLA TABELLA, una per coppia prodotto-fornitore.
// Senza filtro si vedono i doppioni, distinti dal colore e dal nome del
// fornitore; col filtro si vede il catalogo di quel fornitore.
//
// Qui dentro non c'è Firebase apposta: sono i conti che decidono cosa si
// ordina e da chi, e vanno provati senza database.

import { categoryColor, CATEGORY_PALETTE } from './categoryColors.js'
// Il contenuto di un pezzo e il perché non si può ricavare stanno in
// `inventory.js` e si LEGGONO da lì: sono fatti del prodotto, non del
// listino, e riscriverli qui vorrebbe dire due verità da tenere allineate.
import { contentBase, formatQty, fromBaseQty, motivoNonMigrabile } from './inventory.js'

// ── I TRE LIVELLI DELLA RIGA D'ORDINE ────────────────────────────────
//
// Parole di Flavio: «ci devono stare i livelli di RICHIESTO, CONSEGNATO,
// PAGATO. Io mi creo l'ordine che devo mandare al fornitore e in quel
// momento lui non mi carica ancora i prodotti; una volta che me li ha
// portati io faccio consegnato, e dopo mi fa il carico».
//
// IL CARICO A MAGAZZINO AVVIENE AL PASSAGGIO A CONSEGNATO, non prima: è
// questo che risolve «ordinato ma non ancora ricevuto» senza inventare uno
// stato nuovo sul prodotto («in assortimento», REQ-MAG-007, resta politica
// commerciale e non c'entra).
export const LIVELLI = ['richiesto', 'consegnato', 'pagato']

export const ETICHETTA_LIVELLO = {
  richiesto: 'Richiesto',
  consegnato: 'Consegnato',
  pagato: 'Pagato',
}

// Un livello sconosciuto (o mancante, come sugli ordini scritti prima di
// questa voce) vale «richiesto»: il codice nuovo legge sempre i dati
// vecchi, e un ordine di ieri non è né consegnato né pagato per il fatto
// di non avere il campo.
export const livelloDi = (riga) =>
  LIVELLI.includes(riga?.stato) ? riga.stato : 'richiesto'

// Il livello di un gruppo di righe è il PIÙ INDIETRO che contiene: una
// fetta con nove righe pagate e una ancora da consegnare non è pagata.
export function livelloDelGruppo(righe) {
  const lista = righe || []
  if (lista.length === 0) return 'richiesto'
  return LIVELLI[Math.min(...lista.map((r) => LIVELLI.indexOf(livelloDi(r))))]
}

// ── IL COLORE DEL FORNITORE ──────────────────────────────────────────
//
// Si sceglie alla creazione (a caso, oppure a mano) e si vede come le
// strisce laterali della lista del magazzino (REQ-MAG-027). Chi non ce
// l'ha — tutti quelli creati prima — ne riceve uno STABILE calcolato dal
// suo id: un colore che cambia a ogni ricarica non identifica niente.
export function coloreFornitore(fornitore) {
  if (!fornitore) return null
  return fornitore.color || categoryColor(fornitore.id ?? fornitore.name)
}

// La tavolozza è quella delle categorie: i colori che questa app usa già
// per distinguere le cose a colpo d'occhio, provati su tutti i temi.
export const COLORI_FORNITORE = CATEGORY_PALETTE

// A caso, e non «il prossimo libero»: i fornitori si creano anche dalla
// scheda prodotto, di corsa, e chiedere lì una scelta cromatica sarebbe un
// passo in più mentre si sta inventariando una bottiglia. Chi lo vuole
// diverso lo cambia dall'anagrafica.
export function coloreACaso() {
  return COLORI_FORNITORE[Math.floor(Math.random() * COLORI_FORNITORE.length)]
}

// ── COLLI E PEZZI: UNA SCALA SOLA (REQ-MAG-040) ──────────────────────
//
// La stessa Bjorne si compra A BOTTIGLIA da MAR e A CARTONE DA 24 da FONT,
// e il prezzo che FONT fattura è quello del cartone. Il numero di pezzi che
// c'è dentro è quindi DEL FORNITORE, non del prodotto: sul prodotto sarebbe
// uno solo per tutti i fornitori, e per MAR sarebbe falso. Vive qui, sulla
// riga di listino.
//
// LA SCALA È UNA E VALE SEMPRE, e sono tre moltiplicazioni:
//
//     COLLO → PEZZI → UNITÀ DI CONTENUTO
//
//     prezzo per unità di contenuto × contenuto di un pezzo
//       × pezzi per collo = PREZZO DEL COLLO
//
// Vino a 9 €/litro in bottiglie da 75 cl: 9 × 0,75 = 6,75 a bottiglia;
// cartone da 6 → il collo costa 40,50. Nessun ramo speciale in mezzo.
//
// Parole dell'utente: «le cose da un pezzo, banalmente possiamo dire che in
// un collo c'è un pezzo». Chi si compra a bottiglia è quindi il caso
// degenere di un collo da 1, non un ramo a parte: moltiplicare per uno non
// cambia niente, e una strada sola non si può prendere storta. Il codice non
// ha un «se è a colli»: ha un numero che a volte vale 1.
//
// PERCHÉ NON `package_label`: quella è la scritta che serve a chi riceve
// l'ordine dall'altra parte («cartone da 6»), e su una scritta non ci si
// moltiplica. Il conto vuole un numero.
//
// PERCHÉ SI CHIAMA «COLLO» E NON «CONFEZIONE»: in questo codice
// «confezione» vuol già dire IL PEZZO — `caricoDaConfezioni`, `qty_packages`
// e `package_size` contano bottiglie, non cartoni. Usare la stessa parola
// per due cose dentro lo stesso conto è precisamente l'errore da cui nasce
// questa voce (8 pezzi × il prezzo del cartone = 200 euro invece di 8,35).
// «Collo» è anche la parola che l'app già usa dove il meccanismo esisteva a
// metà: il carico a magazzino («Carico a colli — un cartone, una cassa»,
// REQ-MAG-018), dove però quel numero serviva solo al calcolo del momento e
// non veniva salvato da nessuna parte. Questo è ricordarselo, per fornitore.
//
// LA RIGA DI LISTINO PORTA DUE NUMERI E UNA PAROLA — il prezzo, l'unità in
// cui è espresso, i pezzi per collo — e tutto il resto si ricava.
//
// IL CONTENUTO DEL PEZZO NON STA QUI, e non è un dettaglio: sta sul PRODOTTO
// (`content_unit` + `package_size`, e `resa`/`resa_unit` per chi compra a
// peso e dosa a volume). Quanto contiene una bottiglia è un fatto della
// bottiglia, non del fornitore: duplicarlo vorrebbe dire due numeri che
// prima o poi non sono d'accordo, e quel giorno nessuno saprebbe quale dei
// due crede l'ordine.
//
// SE IL CONTENUTO NON È DICHIARATO IL CONTO NON SI FA. Un fornitore che
// prezza al centilitro un prodotto di cui non si sa quanto contiene un pezzo
// non deve produrre un numero inventato: produce un RIFIUTO LEGGIBILE, e si
// appoggia al controllo che l'app ha già (`motivoNonMigrabile`) invece di
// scriverne un secondo che dica la stessa cosa con altre parole.
//
// E NON SI INVENTANO CONVERSIONI FRA PESO E VOLUME: in questo progetto non
// esistono. Da un chilo di limoni esce mezzo litro di succo perché lo dice
// chi compra — è la RESA (`resaUso`), non una legge di natura.

// Un collo vuoto vale UNO. È la difesa che conta: le 367 righe di listino
// già in archivio quel campo non ce l'hanno, e un `undefined` che finisce in
// una moltiplicazione dà un ordine da zero pezzi, in una divisione dà
// Infinity. Si legge SOLO da qui — non ricordandosene nei punti d'uso, che è
// il modo in cui questi difetti tornano.
export const PEZZI_PER_COLLO_PREDEFINITO = 1

export function pezziPerCollo(riga) {
  const n = Number(riga?.pezzi_per_collo)
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : PEZZI_PER_COLLO_PREDEFINITO
}

// Se un collo c'è DAVVERO. Serve solo alle PAROLE: i conti sono uniformi,
// ma a schermo «1 collo di Tanqueray» non lo dice nessuno — chi ordina al
// banco pensa a bottiglie. «Collo» compare dove un collo esiste.
export const aCollo = (riga) => pezziPerCollo(riga) > 1

// ── L'UNITÀ IN CUI IL FORNITORE PREZZA ───────────────────────────────
//
// «Collo» è il caso normale e il valore di partenza: il prezzo è quello che
// il fornitore fattura per un collo, che con un collo da uno è la bottiglia.
// Gli altri sono i modi in cui un listino può essere scritto: al pezzo
// (quando vende a cartoni ma quota la bottiglia) e all'unità di contenuto
// (il vino al litro, la frutta al chilo).
export const UNITA_PREZZO_PREDEFINITA = 'collo'
export const UNITA_PREZZO = ['collo', 'pz', 'l', 'cl', 'ml', 'kg', 'g']

// A quale famiglia appartiene un'unità di prezzo di contenuto. Le due
// famiglie non si mescolano: un prezzo al chilo su una cosa che si misura in
// millilitri non è una conversione da fare, è una riga scritta male.
const FAMIGLIA_UNITA_PREZZO = { l: 'ml', cl: 'ml', ml: 'ml', kg: 'g', g: 'g' }

export function unitaPrezzo(riga) {
  const u = String(riga?.unita_prezzo || '').toLowerCase()
  return UNITA_PREZZO.includes(u) ? u : UNITA_PREZZO_PREDEFINITA
}

export const ETICHETTA_UNITA_PREZZO = {
  collo: 'collo',
  pz: 'pz',
  l: 'L',
  cl: 'cl',
  ml: 'ml',
  kg: 'kg',
  g: 'g',
}

// ── LA SCALA, IN UN POSTO SOLO ───────────────────────────────────────
//
// Da una riga di listino e dal suo prodotto escono i due prezzi che servono:
// quello del COLLO, che è ciò che il fornitore fattura e la cifra scritta
// sulla sua bolla, e quello del PEZZO, che è l'unico con cui si confrontano
// due fornitori e si valorizza il magazzino.
//
// IL PREZZO AL PEZZO NON SI SALVA MAI. 25,05 / 24 fa 1,04375: congelato
// arrotondato e rimoltiplicato per 24 dà 24,96, e il totale dell'ordine non
// coinciderebbe più con la fattura. Si ricava ogni volta che serve, e la
// cifra buona resta una sola.
//
// Quando il conto non si può fare, `problema` dice perché con parole che si
// leggono: meglio un rifiuto in chiaro che un prezzo inventato, perché un
// prezzo inventato diventa un ordine e poi una fattura che non torna.
export function scalaListino(riga, item = null) {
  const perCollo = pezziPerCollo(riga)
  const unita = unitaPrezzo(riga)
  const grezzo = riga?.price == null || riga.price === '' ? null : Number(riga.price)
  const base = {
    perCollo,
    aCollo: perCollo > 1,
    unita,
    prezzo: grezzo,
    contenuto: null,
    prezzoCollo: null,
    prezzoPezzo: null,
    problema: null,
  }
  if (grezzo == null || !Number.isFinite(grezzo)) return base
  if (unita === 'collo') return { ...base, prezzoCollo: grezzo, prezzoPezzo: grezzo / perCollo }
  if (unita === 'pz') return { ...base, prezzoCollo: grezzo * perCollo, prezzoPezzo: grezzo }
  // A unità di contenuto servono i centilitri (o i grammi) che stanno dentro
  // un pezzo, e quelli li sa il PRODOTTO.
  const famiglia = FAMIGLIA_UNITA_PREZZO[unita]
  const c = contentBase(item)
  if (!c || c.base !== famiglia) return { ...base, problema: perchePrezzoNonSiRicava(item, unita, c) }
  // `contentBase` risponde in unità base (700 ml): si riporta all'unità in
  // cui il fornitore ha scritto il prezzo (0,7 L).
  const contenuto = fromBaseQty(c.size, unita)
  const prezzoPezzo = grezzo * contenuto
  return { ...base, contenuto, prezzoPezzo, prezzoCollo: prezzoPezzo * perCollo }
}

// Il rifiuto, detto a chi deve sistemarlo. Prima si prova con il controllo
// che l'app ha già — è la stessa mancanza, e ripeterla con altre parole
// vorrebbe dire due messaggi da tenere allineati per sempre.
function perchePrezzoNonSiRicava(item, unita, contenuto) {
  const eti = ETICHETTA_UNITA_PREZZO[unita] || unita
  const suo = motivoNonMigrabile(item)
  if (suo) return suo
  if (contenuto) {
    return `il prezzo è a ${eti}, ma un pezzo contiene ${formatQty(contenuto.size, contenuto.base)}: sono due misure diverse`
  }
  return `il prezzo è a ${eti} e non si sa quanto contiene un pezzo: va detto nella scheda del prodotto`
}

// Il prezzo di UN PEZZO, ricavato lungo la scala. È la porta da cui passa
// chiunque debba confrontare due fornitori o valorizzare il magazzino.
export function prezzoAlPezzo(riga, item = null) {
  return scalaListino(riga, item).prezzoPezzo
}

// ── LE RIGHE DI LISTINO ──────────────────────────────────────────────

// L'id di una riga è DETERMINISTICO: così l'unicità della coppia
// prodotto-fornitore è un fatto strutturale del database, non un controllo
// applicativo che qualcuno dimentica di fare da un secondo terminale.
export function idRigaListino(supplierId, itemId) {
  if (!supplierId || !itemId) return null
  return `${supplierId}__${itemId}`
}

// LA COMPATIBILITÀ STA TUTTA QUI, e non migra niente (REQ-MAG-029). Un
// prodotto senza righe di listino ma col vecchio campo `supplier_id`
// scritto produce una riga VIRTUALE con quel fornitore e quel costo: i
// dieci prodotti agganciati si comportano come prima, senza che nessuno
// lanci uno script contro il database.
export function rigaVirtuale(item) {
  if (!item?.supplier_id) return null
  return {
    id: idRigaListino(item.supplier_id, item.id),
    supplier_id: item.supplier_id,
    item_id: item.id,
    price: item.cost ?? null,
    // Il vecchio campo `supplier_id` sul prodotto porta un costo AL PEZZO,
    // cioè un collo da uno prezzato al collo: il caso degenere della scala,
    // non un'eccezione.
    pezzi_per_collo: PEZZI_PER_COLLO_PREDEFINITO,
    unita_prezzo: UNITA_PREZZO_PREDEFINITA,
    package_label: null,
    code: null,
    last_price: null,
    last_price_at: null,
    virtuale: true,
  }
}

// Le righe di listino di un prodotto, col ramo di compatibilità già dentro.
export function righeDiProdotto(item, listini) {
  const proprie = (listini || []).filter((r) => r?.item_id === item?.id && r?.supplier_id)
  if (proprie.length > 0) return proprie
  const virtuale = rigaVirtuale(item)
  return virtuale ? [virtuale] : []
}

// ── IL CATALOGO ORDINABILE ───────────────────────────────────────────
//
// Una riga per coppia prodotto-fornitore. Un prodotto che non sta sul
// listino di nessuno resta comunque ORDINABILE, con la casella del
// fornitore vuota: oggi in magazzino ce ne sono 378 su 388 così, e una
// schermata che li nascondesse sarebbe vuota. È anche quello che Flavio ha
// chiesto: «posso mettere il prodotto INDIPENDENTEMENTE da quale fornitore
// resta associato».
export function catalogoOrdinabile({ items = [], listini = [], suppliers = [] } = {}) {
  const perId = new Map((suppliers || []).map((s) => [s.id, s]))
  const righe = []
  for (const it of items || []) {
    const mie = righeDiProdotto(it, listini)
    if (mie.length === 0) {
      righe.push(componiRiga(it, null, null))
      continue
    }
    for (const r of mie) righe.push(componiRiga(it, r, perId.get(r.supplier_id)))
  }
  // Prodotto, poi fornitore: i doppioni finiscono uno sotto l'altro, che è
  // il modo in cui si confrontano due prezzi dello stesso Campari.
  righe.sort(
    (a, b) =>
      (a.item_name || '').localeCompare(b.item_name || '') ||
      (a.supplier_name || '').localeCompare(b.supplier_name || '')
  )
  return righe
}

function componiRiga(item, riga, fornitore) {
  // La riga da cui si fanno i conti: quella di listino, o — se il prodotto
  // non sta sul listino di nessuno — una fatta col costo del prodotto. Una
  // sola forma, così i prezzi si ricavano sempre nello stesso modo invece di
  // avere un ramo per il caso normale e uno per gli altri 378 prodotti.
  const effettiva = riga?.price != null ? riga : { price: item.cost ?? null }
  const scala = scalaListino(effettiva, item)
  return {
    // La chiave della riga a schermo: prodotto + fornitore, come l'id di
    // listino. Senza fornitore resta il solo prodotto.
    key: riga?.supplier_id ? `${item.id}|${riga.supplier_id}` : `${item.id}|`,
    item_id: item.id,
    item_name: item.name ?? '',
    item,
    supplier_id: riga?.supplier_id ?? null,
    supplier_name: fornitore?.name ?? null,
    colore: coloreFornitore(fornitore),
    // `price` È IL PREZZO DEL COLLO, sempre (REQ-MAG-040): cioè quello che
    // il fornitore fattura. Dove il collo è da uno — quasi ovunque — è anche
    // il prezzo del pezzo, e non cambia niente rispetto a prima. Il prezzo
    // del singolo pezzo si ricava ed è `prezzo_pezzo`, qui accanto:
    // scambiarli è il difetto da cui questa voce è nata.
    // Senza riga di listino si ricade sul costo del prodotto, che è l'ultimo
    // pagato a chiunque — un prezzo al pezzo, cioè un collo da uno.
    price: scala.prezzo,
    pezzi_per_collo: scala.perCollo,
    unita_prezzo: scala.unita,
    // I due che si usano: il collo è quello che il fornitore fattura, il
    // pezzo è quello che si confronta e si mostra. `problema` c'è quando il
    // conto non si può fare, e allora si dice invece di inventare.
    prezzo_collo: scala.prezzoCollo,
    prezzo_pezzo: scala.prezzoPezzo,
    problema: scala.problema,
    package_label: riga?.package_label ?? null,
    code: riga?.code ?? null,
    last_price: riga?.last_price ?? null,
    last_price_at: riga?.last_price_at ?? null,
    virtuale: !!riga?.virtuale,
  }
}

// Chi vende cosa: item_id -> [supplier_id]. Serve al magazzino, che filtra
// per fornitore e non può più guardare il campo sul prodotto — da quando il
// legame vive nel listino, un prodotto ha zero, uno o cinque fornitori.
export function fornitoriPerArticolo(items, listini) {
  const mappa = new Map()
  for (const it of items || []) {
    const righe = righeDiProdotto(it, listini)
    mappa.set(
      it.id,
      righe.map((r) => r.supplier_id).filter(Boolean)
    )
  }
  return mappa
}

// LA RICERCA VIENE PRIMA DEL FORNITORE, ed è il cuore della richiesta: la
// schermata di oggi parte dal fornitore ed è proprio ciò di cui Flavio si
// lamenta. Il filtro fornitore resta, ma è una VISTA sul catalogo, non la
// porta d'ingresso.
export function filtraCatalogo(righe, { query = '', supplierId = 'all' } = {}) {
  const q = String(query || '').trim().toLowerCase()
  return (righe || []).filter((r) => {
    if (q && !(r.item_name || '').toLowerCase().includes(q)) return false
    if (supplierId === 'none') return !r.supplier_id
    if (supplierId !== 'all' && r.supplier_id !== supplierId) return false
    return true
  })
}

// ── CHI PROPORRE, E CHI MOSTRARE ACCANTO ─────────────────────────────

// IL FORNITORE PROPOSTO È QUELLO DELL'ULTIMO ACQUISTO, non il più
// economico. Il prezzo più basso in archivio è quasi sempre il più
// vecchio, perché nessuno aggiorna al rialzo il listino di un fornitore da
// cui non compra più: proporlo vorrebbe dire mandare l'ordine a chi quel
// prezzo non lo fa più da due anni.
export function fornitoreProposto(righe, { esclusi = [] } = {}) {
  const fuori = new Set(esclusi || [])
  const candidate = (righe || []).filter((r) => r.supplier_id && !fuori.has(r.supplier_id))
  if (candidate.length === 0) return null
  return candidate.reduce((migliore, r) =>
    String(r.last_price_at || '') > String(migliore.last_price_at || '') ? r : migliore
  )
}

// IL PIÙ ECONOMICO SI MOSTRA, NON SI SCEGLIE: serve a confrontare prima di
// ordinare, ed è chi ordina a decidere se quel prezzo è ancora vero.
//
// SI CONFRONTA AL PEZZO, SEMPRE (REQ-MAG-040): la Bjorne da MAR costa 1,23 a
// bottiglia e da FONT 25,05 al cartone da 24, cioè 1,04. Confrontando i due
// prezzi così come sono scritti, il cartone sembrerebbe venti volte più caro
// del pezzo — ed è il fornitore più conveniente.
export function piuEconomica(righe, { esclusi = [], item = null } = {}) {
  const fuori = new Set(esclusi || [])
  const al = (r) => prezzoAlPezzo(r, item)
  const candidate = (righe || []).filter(
    (r) => r.supplier_id && !fuori.has(r.supplier_id) && Number(al(r)) > 0
  )
  if (candidate.length === 0) return null
  return candidate.reduce((min, r) => (al(r) < al(min) ? r : min))
}

// I fornitori da cui QUEL prodotto è già stato messo in QUESTO ordine.
// «Va anche bene che è disabilitato il fornitore in quanto già l'ho
// ordinato a quel fornitore» (Flavio): due righe dello stesso prodotto
// allo stesso fornitore nello stesso ordine sono un doppione, non una
// scelta.
export function fornitoriGiaUsati(righeOrdine, itemId) {
  return new Set(
    (righeOrdine || [])
      .filter((l) => l.item_id === itemId && l.supplier_id)
      .map((l) => l.supplier_id)
  )
}

// ── LE FETTE DI FORNITORE ────────────────────────────────────────────
//
// L'ORDINE RESTA UNO, coi fornitori dentro, e il per-fornitore è una VISTA
// (decisione del 20/08, REQ-MAG-025). Ma email, stampa e gancio con la
// fattura vanno per FETTA: mandare a Nova anche le righe di Enofel è un
// errore verso il fornitore, non un dettaglio grafico.
//
// La fetta esce con la stessa FORMA di un ordine (supplier_name,
// created_at, lines, totali): così stampa, testo e copia negli appunti la
// trattano come sempre, senza una seconda versione di quelle funzioni.
export function fetteFornitore(order, { suppliers = [] } = {}) {
  const perId = new Map((suppliers || []).map((s) => [s.id, s]))
  const fette = new Map()
  const righe = order?.lines || []
  for (let i = 0; i < righe.length; i++) {
    const l = righe[i]
    // Sugli ordini scritti prima di questa voce il fornitore stava
    // sull'ORDINE e non sulla riga: si eredita, se no un ordine di ieri
    // finirebbe tutto nella fetta «senza fornitore».
    const supplierId = l.supplier_id ?? order?.supplier_id ?? null
    const chiave = supplierId || ''
    if (!fette.has(chiave)) {
      const sup = supplierId ? perId.get(supplierId) : null
      fette.set(chiave, {
        supplier_id: supplierId,
        supplier_name:
          sup?.name ?? l.supplier_name ?? (supplierId ? order?.supplier_name ?? '' : null),
        email: sup?.email ?? null,
        colore: coloreFornitore(sup),
        created_at: order?.created_at ?? null,
        order_id: order?.id ?? null,
        indici: [],
        lines: [],
      })
    }
    const fetta = fette.get(chiave)
    fetta.indici.push(i)
    fetta.lines.push(l)
  }
  return [...fette.values()]
    .map((f) => ({ ...f, stato: livelloDelGruppo(f.lines), ...totaliRighe(f.lines) }))
    .sort((a, b) => (a.supplier_name || '￿').localeCompare(b.supplier_name || '￿'))
}

// Totali di un gruppo di righe, con i nomi che l'ordine usa già
// (total_net / total_gross): la fetta si stampa come un ordine.
function totaliRighe(righe) {
  let net = 0
  let gross = 0
  for (const l of righe || []) {
    const qty = Number(l.qty_packages) || 0
    const costo = Number(l.unit_cost) || 0
    net += qty * costo
    gross += qty * costo * (1 + (Number(l.vat) || 0) / 100)
  }
  return { total_net: net, total_gross: gross }
}

// Lo stato dell'ORDINE INTERO, nel vocabolario che il resto dell'app usa
// già («inviato» / «ricevuto»): un ordine è ricevuto quando non gli resta
// niente da consegnare. Serve a non rinominare un campo che sta scritto su
// documenti veri.
export function statoOrdine(order) {
  // UNA BOZZA RESTA UNA BOZZA anche quando le si toccano le righe
  // (REQ-MAG-038): le righe di una bozza sono tutte «richieste» per
  // definizione, e ricavare lo stato solo da lì la farebbe partire da sola
  // verso il fornitore alla prima modifica.
  if (order?.status === 'bozza') return 'bozza'
  const livello = livelloDelGruppo(order?.lines || [])
  return livello === 'richiesto' ? 'inviato' : 'ricevuto'
}
