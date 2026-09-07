// ── LA TABELLA DEL NUOVO ORDINE (REQ-MAG-036) ────────────────────────
//
// La schermata di prima l'utente l'ha bocciata il 27/08/2026: «non mi piace
// LA DOPPIA LISTA e quei box sono POSTICCI. Serve una UX e UI più moderna e
// semplice. Deve esserci UNA SOLA TABELLA dove su ogni riga vedrò il nome
// del prodotto e i vari campi per compilare l'ordine».
//
// Qui stanno i conti che governano quella tabella — ordinamento,
// preselezione, finestra di righe, righe scelte e loro raggruppamento per
// fornitore — e ci stanno SENZA Firebase: con 388 prodotti e 367 righe di
// listino sono conti che vanno provati coi numeri veri, non con un database
// acceso.
//
// La riga della tabella è quella del catalogo (`catalogoOrdinabile` in
// listini.js): una per COPPIA prodotto-fornitore, col suo prezzo di listino.

import { assortimentoDi, stockStatus } from './inventory.js'
import { inAssortimentoAMano } from './statoAssortimento.js'
import { purchaseOrderTotals, suggestedPackages } from './warehouse.js'
import {
  righeDiProdotto,
  fornitoreProposto,
  coloreFornitore,
  pezziPerCollo,
  scalaListino,
  ETICHETTA_UNITA_PREZZO,
} from './listini.js'

// Quante righe si aggiungono a ogni caricata dello scorrimento continuo.
// Quaranta è una schermata abbondante: chi scorre non arriva mai al fondo
// vuoto, e chi apre la pagina non paga il disegno di settecento righe.
export const PASSO_RIGHE = 40

// Le quattro colonne che ordinano, chieste una per una: «per NOME, per
// DISPONIBILITÀ IN INVENTARIO, per PREZZO DI LISTINO e per FORNITORE».
export const COLONNE_ORDINABILI = ['nome', 'scorta', 'prezzo', 'fornitore']

// L'ordine delle tre disponibilità è quello dell'URGENZA, non l'alfabetico:
// chi ordina per disponibilità vuole vedere per primo quello che è finito.
// I tre stati sono quelli di `stockStatus` — non se ne calcolano altri.
const URGENZA = { empty: 0, low: 1, ok: 2 }

const testo = (v) => String(v ?? '')

// Un confronto che manda in fondo quello che NON HA il dato, in tutti e due
// i versi: una riga senza prezzo di listino non è «la più economica», e una
// senza fornitore non è «il primo fornitore in ordine alfabetico».
function conVuotiInFondo(a, b, dir) {
  const vuotoA = a == null
  const vuotoB = b == null
  if (vuotoA && vuotoB) return 0
  if (vuotoA) return 1
  if (vuotoB) return -1
  const segno = a < b ? -1 : a > b ? 1 : 0
  return dir === 'desc' ? -segno : segno
}

// Ordina le righe del catalogo. A parità si ricade sempre su nome +
// fornitore: senza, due righe uguali ballerebbero di posto a ogni disegno e
// la spunta appena data sembrerebbe essersi spostata da sola.
export function ordinaCatalogo(righe, { col = 'nome', dir = 'asc' } = {}) {
  const lista = [...(righe || [])]
  const verso = dir === 'desc' ? -1 : 1
  const finale = (a, b) =>
    testo(a.item_name).localeCompare(testo(b.item_name)) ||
    testo(a.supplier_name).localeCompare(testo(b.supplier_name))
  lista.sort((a, b) => {
    let primo = 0
    if (col === 'scorta') {
      primo = verso * (URGENZA[stockStatus(a.item)] - URGENZA[stockStatus(b.item)])
    } else if (col === 'prezzo') {
      // AL PEZZO, sempre (REQ-MAG-040): ordinando per `price` un cartone da
      // 24 finirebbe in fondo alla lista dei cari, ed è il più conveniente.
      primo = conVuotiInFondo(
        a.prezzo_pezzo != null ? Number(a.prezzo_pezzo) : null,
        b.prezzo_pezzo != null ? Number(b.prezzo_pezzo) : null,
        dir
      )
    } else if (col === 'fornitore') {
      primo = conVuotiInFondo(
        a.supplier_name ? a.supplier_name.toLowerCase() : null,
        b.supplier_name ? b.supplier_name.toLowerCase() : null,
        dir
      )
    } else {
      primo = verso * testo(a.item_name).localeCompare(testo(b.item_name))
    }
    return primo || finale(a, b)
  })
  return lista
}

// ── LA PRESELEZIONE ──────────────────────────────────────────────────
//
// È il motivo per cui questa schermata esiste: «sono spuntati di partenza i
// prodotti FINITI o SOTTO LA SOGLIA di riordino». Chi apre la schermata
// trova già fatto il lavoro di girare il magazzino.
//
// CHI È FUORI LINEA NON SI PRECOMPILA: «se è fuori linea non viene
// considerato nella precompilazione dell'ordine» (utente, 27/08). Un `out`
// resta in tabella e si può sempre aggiungere a mano — è così che rientra —
// ma non si propone da solo.
//
// UNA RIGA SOLA PER PRODOTTO, ed è la ragione per cui questa funzione non è
// un `filter`: lo stesso Campari sta sul listino di due fornitori e ha due
// righe. Spuntarle tutte e due vorrebbe dire comprarlo due volte. Si sceglie
// il fornitore dell'ULTIMO ACQUISTO (`fornitoreProposto`), che è la stessa
// regola con cui si propone un fornitore ovunque.
// LA PRESELEZIONE SI AGGIUNGE A QUELLO CHE C'È GIÀ, e chi ha scritto vince.
// Sembra una sottigliezza e non lo è: la preselezione arriva DOPO il primo
// disegno delle righe, quindi sostituire lo stato butta via quello che
// qualcuno ha appena scritto — senza un errore e senza un segno. L'ha trovato
// la CI, dove la macchina è più lenta: due colli scritti tornavano a uno.
export function uniscePreselezione(iniziali, gia) {
  return { ...(iniziali || {}), ...(gia || {}) }
}

export function preselezioneIniziale(righe) {
  const perProdotto = new Map()
  for (const r of righe || []) {
    if (!perProdotto.has(r.item_id)) perProdotto.set(r.item_id, [])
    perProdotto.get(r.item_id).push(r)
  }
  const scelte = new Map()
  for (const gruppo of perProdotto.values()) {
    const item = gruppo[0]?.item
    if (!item) continue
    if (assortimentoDi(item) === 'out') continue
    const stato = stockStatus(item)
    // IN ASSORTIMENTO SENZA ORDINE SI PROPONE LO STESSO (REQ-MAG-037):
    // «anche in quel caso verrà preso in considerazione come un prodotto
    // sotto soglia o esaurito nella precompilazione dell'ordine». È lo stato
    // che Flavio mette a mano quando quel prodotto gli serve, e l'ordine è
    // esattamente la cosa che gli manca.
    if (stato !== 'empty' && stato !== 'low' && !inAssortimentoAMano(item)) continue
    const proposto = fornitoreProposto(gruppo)
    const riga = (proposto && gruppo.find((r) => r.supplier_id === proposto.supplier_id)) || gruppo[0]
    // Almeno un pezzo: `suggestedPackages` risponde 0 quando il prodotto non
    // ha soglia o non si conta a confezioni, e una riga proposta con zero
    // pezzi sarebbe una spunta che non ordina niente.
    const pezzi = Math.max(1, suggestedPackages(item))
    // LA PROPOSTA SI DICE IN COLLI (REQ-MAG-040). La soglia di riordino è in
    // pezzi — mancano otto Bjorne — ma da FONT si comprano cartoni da 24:
    // proporre «8» vorrebbe dire otto cartoni, cioè 192 bottiglie. Si divide
    // e si arrotonda PER ECCESSO, perché mezzo cartone non lo vende nessuno.
    // Con un collo da uno la divisione non fa niente, ed è il caso normale.
    const perCollo = pezziPerCollo(riga)
    scelte.set(riga.key, Math.max(1, Math.ceil(pezzi / perCollo)))
  }
  return scelte
}

// ── I PREZZI, SULLA SCALA COLLO → PEZZI (REQ-MAG-040) ────────────────
//
// «Bjorne 8 pz, ma il prezzo unitario del fornitore è AL COLLO, che è 25
// euro, e viene fuori 200 euro per 8 pezzi» (utente, 27/08). Da qui in giù
// ci sono DUE prezzi e DUE quantità, e non vanno mai confusi:
//
//   prezzoCollo  = quello che il fornitore FATTURA, ed è quello salvato
//   prezzoPezzo  = quello RICAVATO, con cui si confrontano due fornitori
//   qty          = quanti COLLI se ne ordinano
//   pezzi        = qty × pezzi per collo, ed è quello che entra in magazzino
//
// La scala vale SEMPRE: chi si compra a bottiglia ha un collo da 1, e per lui
// le due colonne coincidono e non cambia niente. Nessun ramo, nessun «se».
// Il magazzino non impara un'unità nuova: le sue quantità restano PEZZI,
// come `caricoDaConfezioni` e `qty_packages` hanno sempre inteso.

// Che cosa vende quel fornitore, a quanto, e quanti pezzi ci sono nel collo.
// Senza riga di listino si ricade sul costo del prodotto — l'ultimo pagato a
// chiunque — che è un prezzo al pezzo, cioè un collo da uno.
export function listinoDelFornitore(item, listini, supplierId) {
  const trovata = supplierId
    ? righeDiProdotto(item, listini).find((r) => r.supplier_id === supplierId)
    : null
  // Senza riga di listino vale il costo del prodotto: un prezzo al pezzo,
  // cioè un collo da uno prezzato al collo. Stessa forma, stessa scala.
  const riga = trovata?.price != null ? trovata : { price: item?.cost ?? null }
  return scalaListino(riga, item)
}

// Il prezzo di UN PEZZO presso quel fornitore (REQ-MAG-035). Resta la porta
// da cui passa chi deve confrontare o valorizzare: dove il collo è da 24 è
// il prezzo del cartone diviso 24, non la cifra del cartone.
export function prezzoDiListino(item, listini, supplierId) {
  return listinoDelFornitore(item, listini, supplierId).prezzoPezzo
}

// Quanti PEZZI entrano in magazzino ordinando `qty` colli. Con un collo da
// uno sono gli stessi: è la moltiplicazione per uno che rende inutile
// scrivere due strade.
export const pezziOrdinati = (qty, perCollo) =>
  (Number(qty) || 0) * pezziPerCollo({ pezzi_per_collo: perCollo })

export const totaleRiga = (qty, prezzo) => (Number(qty) || 0) * (Number(prezzo) || 0)

// DA DOVE VIENE IL PREZZO DEL PEZZO, detto sotto la colonna che lo mostra.
// La difesa vera contro una moltiplicazione sbagliata è che il risultato
// stia sotto gli occhi di chi sa quanto costa quella bottiglia — se un gin
// risulta 0,80 € l'errore si vede subito — ma per correggerlo bisogna anche
// sapere da che numero è uscito. Qui c'è quel numero: il prezzo come il
// fornitore l'ha scritto, e il collo dove un collo c'è.
//
// Torna null quando non c'è niente da spiegare — prezzo al collo e collo da
// uno, cioè la stragrande maggioranza delle righe — e in quel caso la
// schermata resta identica a com'era.
export function didascaliaListino({ unita, perCollo, prezzo, prezzoCollo } = {}) {
  const pezzi = []
  if (unita && unita !== 'collo' && prezzo != null) {
    pezzi.push(`${arrotonda(prezzo)} €/${ETICHETTA_UNITA_PREZZO[unita] || unita}`)
  }
  if (perCollo > 1 && prezzoCollo != null) {
    pezzi.push(`collo da ${perCollo}: ${arrotonda(prezzoCollo)} €`)
  }
  return pezzi.length > 0 ? pezzi.join(' · ') : null
}

// Le cifre della didascalia si leggono in centesimi tondi, con la virgola
// italiana: sopra ci sono divisioni, e «6.749999999 €/L» non è un prezzo.
const arrotonda = (n) =>
  (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

// Come si legge una quantità a schermo, ed è il posto in cui l'uniformità
// dei conti NON si trasferisce alle parole: dove il collo è da uno si dicono
// pezzi e «collo» non compare, perché chi ordina al banco pensa a bottiglie.
// Dove un collo c'è si dicono ENTRAMBE le cose — i colli, che sono quelli
// che si chiedono al fornitore, e i pezzi, che sono quelli che arrivano in
// magazzino — se no qualcuno resta a fare la moltiplicazione a mente.
export function etichettaQuantita({ qty = 0, perCollo = 1, pezzi = null } = {}) {
  const n = Number(qty) || 0
  const dentro = pezziPerCollo({ pezzi_per_collo: perCollo })
  if (dentro <= 1) return `${n} pz`
  return `${n} ${n === 1 ? 'collo' : 'colli'} · ${pezzi ?? n * dentro} pz`
}

// IL TOTALE SI CORREGGE SULLA RIGA, e da lì torna indietro al prezzo del
// pezzo: «prezzo totale rispetto ai pezzi voluti, modificabile sulla riga
// stessa» (utente, 27/08). Il listino dice quanto ci si aspetta di pagare;
// se il fornitore ha fatto un altro prezzo per quel lotto, quello che conta
// è la cifra dell'ordine — e il €/pz della colonna resta il listino, che è
// l'altro dato e non deve mettersi a ballare mentre si scrive.
//
// Si divide per i PEZZI, non per i colli (REQ-MAG-040): il prezzo che
// finisce sull'ordine è al pezzo, perché al pezzo sono le sue quantità.
export const prezzoDaTotale = (totale, pezzi) =>
  (Number(pezzi) || 0) > 0 ? (Number(totale) || 0) / Number(pezzi) : 0

// ── LE RIGHE SCELTE ──────────────────────────────────────────────────
//
// `selezioni` è { chiave della riga → { qty, supplier_id, totale? } }: la
// chiave è quella della coppia prodotto-fornitore, il fornitore dentro è
// quello scelto dalla tendina — che può essere un ALTRO, perché 378 prodotti
// su 388 non stanno sul listino di nessuno e il fornitore si dà qui.
//
// `qty` È NELL'UNITÀ DEL FORNITORE (REQ-MAG-040): cartoni da chi vende a
// cartoni, pezzi da tutti gli altri. I `pezzi` — che sono ciò che entra in
// magazzino — escono da lì, e sono l'unico numero che il resto dell'app vede.
export function righeScelte(selezioni, { perChiave, listini = [], suppliers = [] } = {}) {
  const supsById = new Map((suppliers || []).map((s) => [s.id, s]))
  const scelte = []
  for (const [key, sel] of Object.entries(selezioni || {})) {
    const riga = perChiave?.get(key)
    if (!riga) continue
    const supplier_id = sel?.supplier_id ?? riga.supplier_id ?? null
    const sup = supplier_id ? supsById.get(supplier_id) : null
    const qty = Number(sel?.qty) || 0
    const { perCollo, aCollo, unita, prezzoCollo, prezzoPezzo, problema } =
      listinoDelFornitore(riga.item, listini, supplier_id)
    const pezzi = pezziOrdinati(qty, perCollo)
    const corretto = sel?.totale !== undefined && sel?.totale !== null && sel?.totale !== ''
    // Il totale si fa su quello che il fornitore fattura: colli × prezzo del
    // collo. È la cifra scritta sul suo documento, quella che si controlla
    // contro la fattura, e l'unica che non porta dentro l'arrotondamento di
    // una divisione.
    const totale = corretto ? Number(sel.totale) || 0 : totaleRiga(qty, prezzoCollo ?? 0)
    scelte.push({
      key,
      item: riga.item,
      item_id: riga.item_id,
      item_name: riga.item_name,
      supplier_id,
      supplier_name: sup?.name ?? riga.supplier_name ?? null,
      colore: sup ? coloreFornitore(sup) : riga.colore,
      qty,
      perCollo,
      aCollo,
      unita,
      // Quando il prezzo non si ricava — un listino al centilitro su un
      // prodotto che non dice quanto contiene — la riga porta il perché
      // invece di un numero inventato.
      problema,
      pezzi,
      // `prezzo` è quello del collo, cioè quello che il fornitore fattura.
      // Con un collo da uno è anche il prezzo del pezzo, e le due colonne
      // dicono la stessa cifra.
      prezzo: prezzoCollo ?? 0,
      prezzoPezzo: prezzoPezzo ?? 0,
      totale,
      // Il prezzo che finisce sull'ordine è AL PEZZO, perché al pezzo sono le
      // sue quantità: si RICAVA qui e non si congela da nessuna parte, se no
      // 25,05 / 24 rimoltiplicato per 24 non torna più a 25,05 e il totale
      // dell'ordine non coincide con la fattura.
      unit_cost: corretto ? prezzoDaTotale(totale, pezzi) : (prezzoPezzo ?? 0),
    })
  }
  return scelte
}

// L'ORDINE IN COMPOSIZIONE STA DI FIANCO, GIÀ DIVISO PER FORNITORE.
// «È SCOMODISSIMO l'ordine in basso. Dobbiamo metterlo affianco, e già lì
// separare i prodotti di un fornitore rispetto a un altro» (utente, 27/08).
// Chi non ha fornitore va in fondo: è la parte da sistemare prima di
// mandare, non una famiglia come le altre.
export function raggruppaPerFornitore(scelte) {
  const gruppi = new Map()
  for (const s of scelte || []) {
    const chiave = s.supplier_id || ''
    if (!gruppi.has(chiave)) {
      gruppi.set(chiave, {
        supplier_id: s.supplier_id || null,
        supplier_name: s.supplier_name || null,
        colore: s.colore || null,
        righe: [],
        pezzi: 0,
        totale: 0,
      })
    }
    const g = gruppi.get(chiave)
    g.righe.push(s)
    // I pezzi, non i colli: due cartoni da 24 sono quarantotto bottiglie, ed
    // è con le bottiglie che si confronta una giacenza (REQ-MAG-040).
    g.pezzi += s.pezzi ?? s.qty
    g.totale += s.totale
  }
  return [...gruppi.values()]
    .map((g) => ({ ...g, righe: [...g.righe].sort((a, b) => testo(a.item_name).localeCompare(testo(b.item_name))) }))
    .sort((a, b) => testo(a.supplier_name || '￿').localeCompare(testo(b.supplier_name || '￿')))
}

// Le righe come vengono salvate. Le quantità a zero non ci vanno: una riga
// spuntata e lasciata vuota è un ripensamento, non un ordine di niente.
//
// QUELLO CHE ENTRA IN MAGAZZINO SONO SEMPRE PEZZI (REQ-MAG-040):
// `qty_packages` resta il numero di pezzi — è quello che `caricoDaConfezioni`
// e `registraAcquisto` hanno sempre inteso — e `unit_cost` il prezzo di un
// pezzo, così i totali e il carico restano quelli di prima senza toccarli.
// I COLLI SI SCRIVONO ACCANTO, col loro prezzo: sono quello che il fornitore
// fattura, ed è la cifra con cui si controlla la bolla. Tenerla scritta
// intera evita di doverla ricostruire da pezzi × prezzo del pezzo, che è la
// moltiplicazione in cui l'arrotondamento si vede.
export function righeOrdine(scelte, { listini = [] } = {}) {
  return (scelte || [])
    .filter((s) => s.qty > 0 && s.item)
    .map((s) => {
      const riga = s.supplier_id
        ? righeDiProdotto(s.item, listini).find((r) => r.supplier_id === s.supplier_id)
        : null
      return {
        item_id: s.item_id,
        name: s.item_name,
        unit: s.item.unit,
        package_size: s.item.package_size ?? null,
        unit_cost: s.unit_cost,
        vat: s.item.vat ?? 22,
        qty_packages: s.pezzi ?? s.qty,
        colli: s.qty,
        pezzi_per_collo: s.perCollo ?? 1,
        prezzo_collo: s.qty > 0 ? s.totale / s.qty : (s.prezzo ?? 0),
        supplier_id: s.supplier_id,
        supplier_name: s.supplier_name,
        code: riga?.code ?? null,
        stato: 'richiesto',
      }
    })
}

// ── I FORNITORI DEL RIEPILOGO, UNO PER ORDINE (REQ-MAG-037) ──────────
//
// UN ORDINE PER FORNITORE: alla conferma nascono N ordini distinti, uno per
// fornitore, ognuno col suo stato e la sua fattura. Il «giro» torna a essere
// la SESSIONE di composizione — questa schermata — e non un documento.
// Sostituisce il modello a fette del 20/08, di cui una fetta resta il caso
// degenere (un ordine con un fornitore solo): è il motivo per cui lo storico
// già scritto continua a leggersi senza rifarlo.
//
// Ogni voce porta DUE forme della stessa cosa: le `righe` scelte, che sono
// quelle da rivedere a schermo (hanno la chiave, il nome, i pezzi), e le
// `lines`, che sono quelle da salvare sull'ordine. Tenerle insieme evita che
// il riepilogo mostri una riga e ne salvi un'altra.
//
// Chi non ha fornitore resta in fondo e si può mandare lo stesso: 378
// prodotti su 388 non stanno sul listino di nessuno, e rifiutare quel gruppo
// vorrebbe dire perdere per strada quello che si è appena scelto.
export function ordiniDaCreare(scelte, { listini = [] } = {}) {
  const fette = []
  for (const g of raggruppaPerFornitore(scelte)) {
    const lines = righeOrdine(g.righe, { listini })
    // Un fornitore le cui righe sono tutte a zero pezzi non è un ordine da
    // mandare a nessuno: è un ripensamento.
    if (lines.length === 0) continue
    const dentro = new Set(lines.map((l) => l.item_id))
    fette.push({
      ...g,
      chiave: g.supplier_id || 'senza',
      righe: g.righe.filter((r) => dentro.has(r.item_id) && r.qty > 0),
      lines,
      totali: purchaseOrderTotals(lines),
    })
  }
  return fette
}

// ── LO SCORRIMENTO CONTINUO ──────────────────────────────────────────
//
// «Dobbiamo paginare […] oppure implementiamo un endless scroll che carica i
// successivi dopo un tot», e delle due l'utente preferisce la seconda: si
// compone un ordine SCORRENDO, e una paginazione costringerebbe a ricordarsi
// cosa si è spuntato a pagina 2 mentre si guarda la 3.
//
// La finestra cresce, non si sposta: le righe già viste restano dove sono,
// con le loro spunte e le loro quantità.
export const prossimaFinestra = (mostrate, totale, passo = PASSO_RIGHE) =>
  Math.min(Number(totale) || 0, (Number(mostrate) || 0) + passo)

// Si carica PRIMA di toccare il fondo: arrivare a un elenco che finisce e
// aspettare che si allunghi è la stessa attesa che il local-first vieta
// altrove. La soglia è poco più di due righe.
export const vicinoAlFondo = ({ scrollTop = 0, clientHeight = 0, scrollHeight = 0 } = {}, soglia = 120) =>
  scrollTop + clientHeight >= scrollHeight - soglia
