// ── I PRODOTTI DI UNA FATTURA FORNITORE ──────────────────────────────
//
// Nasce da Flavio, che ha guardato lo scadenzario (26/08/2026): «sotto mi
// deve apparire un tasto che fa il carico. Dobbiamo usare un'altra dicitura
// sicuramente, tipo AGGIUNGI PRODOTTI magari, e ci mettiamo anche i
// prodotti, in modo tale che li va già a caricare all'interno dei prodotti
// di magazzino» (REQ-MAG-030).
//
// IL DATO CHE VINCOLA TUTTO: una fattura in `supplier_invoices` era SOLO
// UNA TESTATA — fornitore, data, importo, pagato, note. Non aveva righe.
// Quindi il tasto non «elenca i prodotti della fattura»: è lui a metterli,
// ed è esattamente quello che Flavio chiede con «ci mettiamo anche i
// prodotti».
//
// Qui dentro non c'è Firebase apposta: sono i conti che decidono cosa entra
// in magazzino e a che prezzo, e vanno provati senza database.

import { purchaseOrderTotals } from './warehouse.js'
import { righeDiProdotto, livelloDi, fetteFornitore } from './listini.js'
import { eBozza } from './statiOrdine.js'
import { formatPrice } from './orderStatus.js'

// ── I TIPI DI DOCUMENTO ──────────────────────────────────────────────
//
// «NESSUN DOCUMENTO» è il valore chiesto dall'utente il 27/08/2026: «il caso
// di pagare un fornitore senza fattura non c'è. Anche se può capitare, io
// creerò SEMPRE un item nello scadenzario che paga un ordine anche senza
// fattura/scontrino/proforma allegato. Possiamo semplicemente indicare nella
// fattura NESSUN DOCUMENTO, ma farlo risultare lo stesso pagato».
//
// Non è un caso speciale: è un tipo di documento come gli altri, e proprio
// per questo il contante al piccolo fornitore e il contrassegno alla
// consegna finiscono nel totale del mese come tutte le altre uscite. Se
// esistesse una seconda strada per segnare pagato un ordine, sarebbero gli
// unici soldi a non comparirci.
export const DOC_NESSUNO = 'Nessun documento'

// ── LA NOTA DI CREDITO (BUG-100) ─────────────────────────────────────
//
// Si chiamava «Reso», e Flavio ha chiesto di cambiarle nome il 03/09/2026:
// «reso dovrebbe diventare nota di credito, perché questa è la dicitura
// giusta. Non è importante che io renda: magari è sbagliato solamente un
// prezzo, quindi io non rendo niente, mi devono modificare il prezzo di una
// fattura magari già pagata, mi fanno la nota di credito».
//
// La ragione è sostanziale e non estetica: «reso» dice che è tornata della
// merce, e quasi sempre non è vero. Il documento è una correzione di conto.
export const DOC_NOTA_CREDITO = 'Nota di credito'

// IL NOME VECCHIO RESTA VALIDO IN LETTURA, e non si migra niente. In archivio
// ci sono documenti scritti `doc_type: 'Reso'`: uno script che li riscrive
// tutti è il modo più caro di non guadagnare niente, e il giorno che sbaglia
// sbaglia su dei soldi. Chi legge riconosce le due parole come la stessa
// cosa, ed è `eNotaDiCredito` a saperlo — una volta sola, per tutti.
const DOC_RESO = 'Reso'

export const TIPI_DOCUMENTO = ['Proforma', 'Fattura', DOC_NOTA_CREDITO, DOC_NESSUNO, 'Altro']

// «Questo documento è una nota di credito?». È l'unica funzione che conosce
// il nome vecchio: chi confronta `doc_type` a mano si porta dietro un
// documento di ieri che smette di valere.
export const eNotaDiCredito = (fattura) =>
  fattura?.doc_type === DOC_NOTA_CREDITO || fattura?.doc_type === DOC_RESO

// ── L'IMPORTO COL SEGNO CON CUI PESA SUI CONTI ───────────────────────
//
// PERCHÉ UNA NOTA DI CREDITO SOTTRAE, e questa è la riga che qualcuno prima
// o poi «sistemerà» rimettendoci un valore assoluto: una nota di credito non
// è una spesa, è la spesa TOLTA. Il fornitore riconosce di aver chiesto
// troppo — «mi stanno scalando dei soldi» (Flavio) — quindi quei soldi dal
// mese escono, dal debito verso quel fornitore escono, e dal riepilogo delle
// uscite pure. Sommarla, com'era prima, gonfiava il totale del doppio della
// correzione: 1.000 di fattura e 120 di nota facevano 1.120 invece di 880.
//
// L'IMPORTO SI SCRIVE POSITIVO E SI CONTA NEGATIVO. Chi batte il documento ha
// in mano un foglio con scritto 120, non −120, e il campo dell'importo chiede
// da sempre un numero senza segno. Il segno è una conseguenza del TIPO, e
// vive solo qui. `Math.abs` non è una precauzione oziosa: se qualcuno scrive
// −120 intendendo una detrazione, senza di lui il segno si girerebbe due
// volte e la nota tornerebbe a sommare.
export function importoContabile(fattura) {
  const importo = Number(fattura?.amount) || 0
  return eNotaDiCredito(fattura) ? -Math.abs(importo) : importo
}

// L'importo come si legge sulla riga. Una nota di credito si scrive col meno
// davanti: colorarla e basta la lascerebbe leggere come un numero qualunque,
// e chi somma a mente sommerebbe.
export function importoLeggibile(fattura) {
  const importo = importoContabile(fattura)
  return importo < 0 ? `− ${formatPrice(-importo)}` : formatPrice(importo)
}

// ── I TOTALI DELLO SCADENZARIO ───────────────────────────────────────
//
// Stava in `warehouse.js`, ed è venuto qui con BUG-100 per una ragione sola:
// adesso deve sapere che una nota di credito sottrae, e quella regola vive in
// questo file. Lasciandolo là warehouse e fatture si sarebbero importati a
// vicenda — un anello che regge finché nessuno lo tocca.
//
// «Da pagare» conta i documenti ancora aperti: le fatture in più, le note di
// credito in meno. È il netto verso quel fornitore, che è la cifra da cui si
// parte quando si fa un bonifico.
export function invoiceTotals(invoices) {
  const bySupplier = new Map()
  let unpaid = 0
  let paid = 0
  for (const inv of invoices || []) {
    const amount = importoContabile(inv)
    if (inv.paid) {
      paid += amount
    } else {
      unpaid += amount
      const key = inv.supplier_id || 'sconosciuto'
      const cur = bySupplier.get(key) || { supplier_id: key, supplier_name: inv.supplier_name || '', unpaid: 0, count: 0 }
      cur.unpaid += amount
      cur.count += 1
      bySupplier.set(key, cur)
    }
  }
  return { unpaid, paid, bySupplier: [...bySupplier.values()].sort((a, b) => b.unpaid - a.unpaid) }
}

// UNA FATTURA GENERATA DA NOI NON È UNA FATTURA DEL FORNITORE (REQ-MAG-038),
// e le due non vanno confuse: la prima dice quanto ci si ASPETTA di pagare
// coi prezzi dell'ordine, la seconda è quello che il fornitore CHIEDE. Il
// documento vero si allega (REQ-MAG-033), e finché non arriva quella cifra
// resta un'aspettativa.
export const fatturaGenerata = (fattura) => !!fattura?.generata

// Le righe di una fattura, sempre un array: una fattura scritta prima di
// questa voce non ha il campo, e non è un errore — è la normalità di tutte
// quelle già in archivio.
export function righeFattura(fattura) {
  return Array.isArray(fattura?.lines) ? fattura.lines : []
}

// I totali di un gruppo di righe. Sono gli stessi dell'ordine fornitore
// (netto, lordo, pezzi) e li fa la stessa funzione: una riga di fattura ha
// la forma di una riga d'ordine apposta, così stampe e conti non hanno
// bisogno di una seconda versione.
export const totaliRigheFattura = (righe) => purchaseOrderTotals(righe)

// ── IL PREZZO CHE STA IN ARCHIVIO ────────────────────────────────────
//
// È quello del listino DI QUEL FORNITORE (REQ-MAG-029); dove il listino non
// c'è si ricade sul costo del prodotto, che è l'ultimo pagato a chiunque.
// Serve a rispondere alla domanda di Flavio — «se voglio aggiornare il
// prezzo oppure lasciarlo invariato» — mostrando vecchio e nuovo affiancati.
export function prezzoInArchivio(item, listini, supplierId) {
  if (!item) return null
  const riga = righeDiProdotto(item, listini).find((r) => r.supplier_id === supplierId)
  if (riga?.price != null) return Number(riga.price)
  return item.cost == null ? null : Number(item.cost)
}

// Due prezzi si considerano uguali fino al centesimo: sotto quella soglia
// non c'è nessuna domanda da fare, e chiederla comunque insegnerebbe a
// rispondere senza leggere.
export function prezzoDiverso(vecchio, nuovo) {
  if (vecchio == null || nuovo == null || nuovo === '') return false
  const a = Number(vecchio)
  const b = Number(nuovo)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) >= 0.005
}

// Una riga di fattura nuova, partendo dal prodotto scelto nel catalogo. Il
// prezzo proposto è quello in archivio: chi compila corregge solo dove il
// documento dice un numero diverso, e solo lì compare la domanda.
export function rigaDaProdotto(item, { listini = [], supplierId = null, qty = 1 } = {}) {
  const prezzo = prezzoInArchivio(item, listini, supplierId)
  return {
    item_id: item.id,
    name: item.name ?? '',
    unit: item.unit ?? 'pz',
    package_size: item.package_size ?? null,
    qty_packages: Number(qty) || 0,
    unit_cost: prezzo == null ? 0 : prezzo,
    vat: item.vat ?? 22,
  }
}

// ── RIPRENDERE LE RIGHE DA UN ORDINE ─────────────────────────────────
//
// Quali ordini si possano riprendere non si decide più qui: sono le fette
// collegabili (REQ-MAG-031), perché riprendere le righe e agganciare la
// fattura sono lo stesso gesto — si ricopia il documento dall'ordine che
// l'ha generato. `ordiniRiprendibili` chiedeva in più che ci fosse già una
// consegna, e quella condizione è caduta: una proforma arriva anche prima
// della merce, e allora quelle righe sono proprio ciò che si vuole copiare.

// Le righe di quel fornitore dentro un ordine. Sugli ordini scritti prima
// di REQ-MAG-029 il fornitore stava sull'ORDINE e non sulla riga: si
// eredita, se no un ordine di ieri non si riprenderebbe mai.
function righeDelFornitore(ordine, supplierId) {
  return (ordine?.lines || []).filter(
    (l) => (l.supplier_id ?? ordine?.supplier_id ?? null) === supplierId
  )
}

// Le righe di un ordine nella forma di righe di fattura. `gia_caricata` dice
// che quella merce è già entrata in magazzino alla consegna: è quello che
// spegne da solo il carico, perché caricare due volte la stessa merce è
// l'errore da impedire.
export function righeDaOrdine(ordine, supplierId) {
  return righeDelFornitore(ordine, supplierId).map((l) => ({
    item_id: l.item_id,
    name: l.name ?? '',
    unit: l.unit ?? 'pz',
    package_size: l.package_size ?? null,
    qty_packages: Number(l.qty_packages) || 0,
    unit_cost: Number(l.unit_cost) || 0,
    vat: l.vat ?? 22,
    gia_caricata: livelloDi(l) !== 'richiesto',
  }))
}

// ── IL LEGAME CON LA FETTA DI FORNITORE (REQ-MAG-031) ────────────────
//
// L'utente, 20/08: «la vista degli ordini contiene più fornitori, ma la
// fattura è collegata all'ordine PER IL FORNITORE, perché è il fornitore che
// rilascia la fattura». Quindi il legame non è fattura-ORDINE ma
// fattura-FETTA: la parte di quel fornitore dentro l'ordine, la stessa che
// il filtro mostra. Un ordine con tre fornitori ha fino a tre fatture.
//
// DOVE VIVE IL DATO: `order_id` sulla FATTURA, e basta quello. Il fornitore
// la fattura ce l'ha già (`supplier_id`), e la coppia dei due È la fetta —
// la stessa chiave con cui `fetteFornitore` la ritaglia. Così «una fattura
// sta su al massimo una fetta» è vero per costruzione: non c'è nessun posto
// dove scriverne una seconda. Il verso opposto — «una fetta ha al massimo
// una fattura» — nessun campo lo garantisce da solo, e lo tiene
// `aggancioAmmesso`: è la stessa guardia che filtra gli elenchi delle
// candidate, così le due cose non possono divergere.
//
// NON SI SCRIVE NIENTE SULL'ORDINE, ed è deliberato: l'ordine lo scrivono
// la consegna e il pagamento, gesti che partono dal banco. Un secondo
// scrittore su quel documento vorrebbe dire due terminali che si
// sovrascrivono le righe per aggiungere un riferimento che sta comodo
// dall'altra parte.

// La fattura agganciata a una fetta, se c'è.
export function fatturaDellaFetta(fatture, fetta) {
  if (!fetta?.order_id || !fetta?.supplier_id) return null
  return (
    (fatture || []).find(
      (f) => f?.order_id === fetta.order_id && f?.supplier_id === fetta.supplier_id
    ) ?? null
  )
}

// La fetta a cui una fattura è agganciata. Gli ordini in mano sono gli
// ultimi venticinque: di uno più vecchio si sa che il legame c'è, non quali
// righe contenga — e dirlo è meglio che far sparire il legame.
export function fettaDellaFattura(fattura, ordini, { suppliers = [] } = {}) {
  if (!fattura?.order_id) return null
  const ordine = (ordini || []).find((o) => o?.id === fattura.order_id)
  if (!ordine) return null
  return (
    fetteFornitore(ordine, { suppliers }).find((f) => f.supplier_id === fattura.supplier_id) ?? null
  )
}

// IL FORNITORE FA DA GUARDIA. Agganciare la fattura di Nova alla fetta di
// Enofel non è un errore di battitura: è merce pagata a chi non l'ha
// venduta, e a fine mese è un conto che non torna.
//
// Torna il motivo del rifiuto — una frase da mostrare — oppure `null`
// quando l'aggancio si può fare. Le due parti dell'app la chiamano tutte e
// due: quella che propone le candidate e quella che scrive.
export function aggancioAmmesso(fattura, fetta, { fatture = [] } = {}) {
  if (!fattura?.id || !fetta?.order_id) return 'Manca il documento o la parte di ordine.'
  if (!fetta.supplier_id || fetta.supplier_id !== fattura.supplier_id) {
    return `Questa parte dell’ordine è di ${fetta.supplier_name || 'un altro fornitore'}: il documento è di ${fattura.supplier_name || '—'}.`
  }
  const altra = fatturaDellaFetta(fatture, fetta)
  if (altra && altra.id !== fattura.id) return 'Quella parte dell’ordine ha già un documento collegato.'
  // Uno-a-uno anche dall'altro verso: si stacca prima, e staccare è un gesto
  // che si vede. Lasciar riscrivere il campo staccherebbe in silenzio la
  // fetta di prima, che tornerebbe scoperta senza che nessuno l'abbia
  // deciso.
  if (fattura.order_id && fattura.order_id !== fetta.order_id) {
    return 'Questo documento è già collegato a un altro ordine.'
  }
  return null
}

// Le fette a cui QUESTA fattura si può agganciare: quelle del suo fornitore
// e ancora libere. Non si chiede che siano già consegnate — una proforma
// arriva anche prima della merce — e l'ordine più recente viene per primo,
// perché è quello con cui il documento in mano ha a che fare.
export function fetteCollegabili(fattura, ordini, { suppliers = [], fatture = [] } = {}) {
  if (!fattura?.supplier_id) return []
  return (ordini || [])
    .flatMap((o) => fetteFornitore(o, { suppliers }))
    .filter((f) => aggancioAmmesso(fattura, f, { fatture }) === null)
}

// L'elenco speculare, per chi guarda l'ordine: i documenti di quel fornitore
// che si possono agganciare a questa fetta.
export function fattureCollegabili(fatture, fetta) {
  if (!fetta?.supplier_id) return []
  return (fatture || []).filter((f) => aggancioAmmesso(f, fetta, { fatture }) === null)
}

// ── I DUE BUCHI ──────────────────────────────────────────────────────
//
// «Sono le due cose che a fine mese fanno tornare o non tornare i conti con
// il commercialista» (l'utente). Non sono errori dell'app: sono lavoro che
// manca, e vanno visti prima che il mese finisca.

// La merce è arrivata, il documento no. Una fetta ancora «richiesta» non
// conta: lì non è arrivato niente, e segnalarla insegnerebbe a ignorare il
// segnale.
// LE BOZZE NON CONTANO (REQ-MAG-038): una bozza non è stata mandata a
// nessuno, quindi non c'è nessun documento che debba arrivare — e i suoi
// numeri non devono comparire fra i soldi che escono.
export function fetteSenzaFattura(ordini, fatture, { suppliers = [] } = {}) {
  return (ordini || [])
    .filter((o) => !eBozza(o))
    .flatMap((o) => fetteFornitore(o, { suppliers }))
    .filter((f) => f.supplier_id && f.stato !== 'richiesto' && !fatturaDellaFetta(fatture, f))
}

// Il documento c'è, l'ordine no: o l'ordine non è mai stato scritto nell'app
// (si è telefonato al fornitore), o il legame non l'ha ancora messo nessuno.
export function fattureSenzaFetta(fatture) {
  return (fatture || []).filter((f) => !f?.order_id)
}

// ── LA CORREZIONE DI UN DOCUMENTO (REQ-MAG-041) ──────────────────────
//
// «In Scadenzario i documenti creati devono essere modificabili nel caso di
// variazione o errore» (Flavio, 03/09/2026). Prima si poteva solo segnare
// pagato: chi sbagliava a battere una cifra doveva cancellare e rifare, e
// con la cancellazione se ne andavano righe, allegato e legame con l'ordine.
//
// SI CORREGGE LA TESTATA, NON IL CONTENUTO. Modificabili sono i sei campi
// che una persona batte a mano guardando la carta; righe (REQ-MAG-030),
// allegato (REQ-MAG-033) e `order_id` (REQ-MAG-031) NON stanno qui, e non è
// una dimenticanza: ognuno ha già il suo gesto, che sa fare anche le cose
// attorno — il carico a magazzino, il file su Storage da cancellare, la
// guardia sulla fetta già coperta. Passarli da qui vorrebbe dire una seconda
// strada che quelle cose non le fa.
export const CAMPI_MODIFICABILI = [
  'supplier_id',
  'supplier_name',
  'number',
  'doc_type',
  'date',
  'amount',
  'notes',
]

// Come si chiamano a schermo, e sono anche i campi di cui si racconta il
// cambiamento. `supplier_id` non c'è: è il fornitore, e di un fornitore si
// legge il nome.
const ETICHETTA_CAMPO = {
  supplier_name: 'Fornitore',
  number: 'Numero',
  doc_type: 'Tipo',
  date: 'Data',
  amount: 'Importo',
  notes: 'Note',
}

const scritto = (v) => (v == null || v === '' ? '—' : String(v))

// Due importi si considerano uguali fino al centesimo, come i prezzi: sotto
// quella soglia non c'è nessuna correzione da raccontare.
//
// SI CONFRONTA L'IMPORTO COL SEGNO, non la cifra battuta, ed è il caso che
// conta: una fattura da 120 diventata nota di credito porta ancora scritto
// 120, ma sui conti quei soldi si sono spostati di 240. La storia serve a
// spiegare perché i numeri sono cambiati, quindi deve accorgersene.
function campoCambiato(campo, prima, dopo) {
  if (campo === 'amount') {
    return Math.abs(importoContabile(prima) - importoContabile(dopo)) >= 0.005
  }
  if (campo === 'supplier_name') {
    return (prima?.supplier_id ?? null) !== (dopo?.supplier_id ?? null)
  }
  return (prima?.[campo] ?? '') !== (dopo?.[campo] ?? '')
}

// COSA È CAMBIATO, GIÀ IN ITALIANO. Le frasi si compongono qui e non in
// `descriviMovimento` per una ragione pratica: la storia si legge mesi dopo,
// e un importo formattato allora col codice di allora resta leggibile anche
// se il formato cambia. In più tiene `statiOrdine.js` fuori dai tipi di
// documento, che è l'anello di import che non vogliamo.
export function cambiFattura(prima, dopo) {
  const cambi = []
  for (const campo of Object.keys(ETICHETTA_CAMPO)) {
    if (!campoCambiato(campo, prima, dopo)) continue
    cambi.push({
      campo: ETICHETTA_CAMPO[campo],
      da: campo === 'amount' ? importoLeggibile(prima) : scritto(prima?.[campo]),
      a: campo === 'amount' ? importoLeggibile(dopo) : scritto(dopo?.[campo]),
    })
  }
  return cambi
}

// IL FORNITORE DI UN DOCUMENTO AGGANCIATO NON SI CAMBIA, e la guardia sta
// qui perché è la stessa regola di `aggancioAmmesso`: il legame con l'ordine
// È la coppia ordine + fornitore (REQ-MAG-031). Cambiando fornitore sotto un
// documento già agganciato, quella fetta resterebbe legata alla fattura di
// qualcun altro — merce pagata a chi non l'ha venduta, che a fine mese è un
// conto che non torna. Si stacca prima, e staccare è un gesto che si vede.
//
// Torna il motivo del rifiuto — una frase da mostrare — oppure `null`.
export function modificaAmmessa(prima, dopo) {
  if (!prima?.id) return 'Documento non trovato.'
  if (!dopo?.supplier_id) return 'Il documento lo emette qualcuno: scegli il fornitore.'
  if (prima.order_id && dopo.supplier_id !== prima.supplier_id) {
    return 'Questo documento è collegato a un ordine: per cambiare fornitore scollegalo prima.'
  }
  return null
}

// ── «PAGATA» NON VUOL DIRE NIENTE SU UNA NOTA DI CREDITO ─────────────
//
// Il gesto resta uno solo — lo stesso campo `paid`, lo stesso tasto, gli
// stessi totali — perché due modi di chiudere un documento vorrebbero dire
// due stati da tenere allineati, e il giorno che divergono il «Da pagare»
// smette di valere qualcosa (è la stessa ragione per cui «pagato» sta sulla
// fattura e non sull'ordine, REQ-MAG-038).
//
// A CAMBIARE È LA PAROLA. Una nota di credito non si paga: o la si incassa,
// o — molto più spesso — la si scala da quello che si deve. «Scalare» è il
// verbo di Flavio («mi stanno scalando dei soldi») e copre tutti e due i
// casi, che è quello che serve: il documento è chiuso quando quei soldi sono
// tornati indietro, comunque siano tornati.
export function etichettaSaldo(fattura) {
  if (eNotaDiCredito(fattura)) return fattura?.paid ? '✅ scalata' : '⏳ da scalare'
  return fattura?.paid ? '✅ pagato' : '⏳ da pagare'
}
