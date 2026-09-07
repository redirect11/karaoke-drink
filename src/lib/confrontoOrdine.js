// ── I TRE ELENCHI, E I DUE CONFRONTI CHE CONTANO (REQ-MAG-038) ───────
//
// «Quando l'ordine arriva deve poter MODIFICARE L'ORDINE in base a quello
// che ha effettivamente ricevuto», e «quando associerà la fattura potrà
// verificare se ci sono gli stessi articoli e i prezzi rispetto a quanto
// indicato nell'ordine effettuato e nell'ordine ricevuto» (utente, 27/08).
//
// Da lì escono TRE elenchi che vanno tenuti distinti, e il motivo per cui
// vanno tenuti distinti è che quasi mai coincidono:
//
//   ORDINATO   quello che si è chiesto al fornitore
//   RICEVUTO   quello che ha portato davvero (si conta all'arrivo)
//   FATTURATO  quello che c'è sul suo documento
//
// Confondere i primi due è l'errore che costa: se la quantità ricevuta
// sovrascrive quella ordinata, la cassa mancante non l'ha vista nessuno e
// la si paga in fattura. Per questo `qty_packages` sulla riga resta SEMPRE
// quello ordinato e il ricevuto vive in un campo suo.
//
// I DUE CONFRONTI sono due letture dello stesso prospetto:
//   · i PREZZI  — quanto costava all'ordine, quanto costa in fattura;
//   · la MERCE  — chiesto, arrivato, fatturato, e cosa non torna.
//
// Firebase non c'è apposta: sono conti, e vanno provati senza database.

import { livelloDi } from './listini.js'
import { prezzoDiverso, righeFattura } from './fatture.js'
import { statoOrdineDi } from './statiOrdine.js'

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

// ── L'ORDINATO ───────────────────────────────────────────────────────
//
// Il prezzo dell'ordine è quello del listino nel momento in cui l'ordine è
// partito. Alla consegna `unit_cost` viene riscritto col prezzo della bolla
// — è il prezzo vero, ed è giusto che il totale lo segua — quindi quello
// ordinato si conserva a parte, in `unit_cost_ordinato`. Sulle righe scritte
// prima di questa voce quel campo non c'è: si ricade su `unit_cost`, che
// finché la merce non è arrivata È il prezzo dell'ordine.
export function righeOrdinate(order) {
  return (order?.lines || []).map((l) => ({
    item_id: l.item_id ?? null,
    name: l.name ?? '',
    qty: num(l.qty_packages),
    prezzo: l.unit_cost_ordinato == null ? num(l.unit_cost) : num(l.unit_cost_ordinato),
  }))
}

// ── IL RICEVUTO ──────────────────────────────────────────────────────
//
// Solo le righe già arrivate: una riga ancora «richiesta» non è arrivata in
// quantità zero, è merce che deve ancora venire, e metterla a zero qui
// direbbe che il fornitore ha mancato una consegna che non ha ancora fatto.
//
// Senza `qty_received` vale la quantità ordinata: è il caso normale — è
// arrivato quello che si è chiesto — ed è anche come si leggono le consegne
// registrate prima di questa voce.
export function righeRicevute(order) {
  return (order?.lines || [])
    .filter((l) => livelloDi(l) !== 'richiesto')
    .map((l) => ({
      item_id: l.item_id ?? null,
      name: l.name ?? '',
      qty: l.qty_received == null ? num(l.qty_packages) : num(l.qty_received),
      prezzo: num(l.unit_cost),
    }))
}

// ── IL FATTURATO ─────────────────────────────────────────────────────
//
// Una fattura può non avere righe: per anni è stata solo una testata, e lo
// è ancora ogni volta che nessuno ci mette dentro i prodotti (REQ-MAG-030).
// Allora il confronto sulla merce non si può fare, e va detto invece che
// mostrare un elenco di prodotti «mancanti in fattura» che non manca
// nessuno.
export function righeFatturate(fattura) {
  return righeFattura(fattura).map((l) => ({
    item_id: l.item_id ?? null,
    name: l.name ?? '',
    qty: num(l.qty_packages),
    prezzo: num(l.unit_cost),
  }))
}

export const fatturaConRighe = (fattura) => righeFattura(fattura).length > 0

const somma = (righe) => righe.reduce((t, r) => t + r.qty * r.prezzo, 0)

// ── IL PROSPETTO: UNA RIGA PER PRODOTTO, TRE COLONNE ─────────────────
//
// Le tre liste si allineano sull'`item_id`, che è la sola cosa che le tiene
// insieme: i nomi si scrivono a mano sui documenti e non tornano mai. Una
// riga di fattura senza `item_id` — battuta a mano su un prodotto che non
// sta in archivio — resta fuori dall'incrocio e si conta a parte, perché
// appiccicarla a un prodotto per somiglianza di nome è il modo di far
// sparire un errore vero.
export function prospettoOrdine(order, fattura = null) {
  const per = new Map()
  const riga = (item_id, name) => {
    const chiave = item_id || `nome:${name}`
    if (!per.has(chiave))
      per.set(chiave, {
        item_id: item_id ?? null,
        name,
        ordinato: null,
        ricevuto: null,
        fatturato: null,
        prezzo_ordine: null,
        prezzo_ricevuto: null,
        prezzo_fattura: null,
      })
    const r = per.get(chiave)
    if (!r.name && name) r.name = name
    return r
  }

  for (const l of righeOrdinate(order)) {
    const r = riga(l.item_id, l.name)
    r.ordinato = num(r.ordinato) + l.qty
    r.prezzo_ordine = l.prezzo
  }
  for (const l of righeRicevute(order)) {
    const r = riga(l.item_id, l.name)
    r.ricevuto = num(r.ricevuto) + l.qty
    r.prezzo_ricevuto = l.prezzo
  }
  const conRighe = fatturaConRighe(fattura)
  if (conRighe) {
    for (const l of righeFatturate(fattura)) {
      const r = riga(l.item_id, l.name)
      r.fatturato = num(r.fatturato) + l.qty
      r.prezzo_fattura = l.prezzo
    }
  }

  return [...per.values()].map((r) => {
    // LA DIFFERENZA DI PREZZO è quella che l'utente ha chiesto: dal prezzo
    // di quando l'ordine è partito a quello scritto sul documento. `null`
    // dove uno dei due non c'è — «non si sa» e «non è cambiato» sono due
    // risposte diverse e non vanno scritte allo stesso modo.
    const differenza =
      r.prezzo_fattura == null || r.prezzo_ordine == null
        ? null
        : r.prezzo_fattura - r.prezzo_ordine
    // La differenza si calcola PRIMA dei problemi, e la riga completa è
    // quella che si passa: uno di quei problemi è proprio «il prezzo è
    // cambiato», e chiederlo a una riga senza differenza vorrebbe dire non
    // trovarlo mai.
    const completa = { ...r, differenza }
    return { ...completa, problemi: problemiDellaRiga(completa, conRighe) }
  })
}

// COSA NON TORNA, su una riga. Sono i fatti, non i giudizi: l'app dice cosa
// vede e chi legge decide se è un problema — una cassa in meno può essere
// un ritardo concordato al telefono.
function problemiDellaRiga(r, fatturaConRighe) {
  const p = []
  if (r.ricevuto != null && r.ordinato != null && r.ricevuto < r.ordinato) p.push('meno_merce')
  if (r.ricevuto != null && r.ordinato == null) p.push('non_ordinato')
  if (r.ricevuto != null && r.ordinato != null && r.ricevuto > r.ordinato) p.push('piu_merce')
  if (fatturaConRighe) {
    const arrivato = r.ricevuto == null ? r.ordinato : r.ricevuto
    if (r.fatturato == null) p.push('non_fatturato')
    else if (arrivato == null) p.push('solo_in_fattura')
    else if (r.fatturato !== arrivato) p.push('quantita_diversa')
  }
  if (r.differenza != null && prezzoDiverso(r.prezzo_ordine, r.prezzo_fattura))
    p.push('prezzo_diverso')
  return p
}

export const ETICHETTA_PROBLEMA = {
  meno_merce: 'arrivato meno del richiesto',
  piu_merce: 'arrivato più del richiesto',
  non_ordinato: 'non era nell’ordine',
  non_fatturato: 'non è sul documento',
  solo_in_fattura: 'sul documento ma non arrivato',
  quantita_diversa: 'sul documento una quantità diversa',
  prezzo_diverso: 'prezzo diverso da quello dell’ordine',
}

// I totali dei tre elenchi, al netto. Servono anche quando la fattura non ha
// righe: lì l'unico confronto possibile è quello fra il netto dell'ordine e
// l'importo del documento, ed è già qualcosa.
export function totaliProspetto(order, fattura = null) {
  return {
    ordinato: somma(righeOrdinate(order)),
    ricevuto: somma(righeRicevute(order)),
    fatturato: fatturaConRighe(fattura) ? somma(righeFatturate(fattura)) : null,
    documento: fattura ? num(fattura.amount) : null,
  }
}

// Le sole righe su cui il prezzo è cambiato: è il primo confronto, e da solo
// è quello che Flavio guarda per primo.
export const scartiDiPrezzo = (prospetto) =>
  (prospetto || []).filter((r) => r.problemi.includes('prezzo_diverso'))

// Le righe su cui la merce non torna: è il secondo confronto.
export const scartiDiMerce = (prospetto) =>
  (prospetto || []).filter((r) =>
    r.problemi.some((p) => p !== 'prezzo_diverso')
  )

// ── LA RICONCILIAZIONE ───────────────────────────────────────────────
//
// «È il gesto che dichiara che i tre elenchi tornano. Solo dopo l'ordine si
// può mettere a CHIUSO». Quindi non è una spunta che si mette a occhio: o
// il prospetto non ha scarti, o non torna niente.
//
// SENZA FATTURA NON SI RICONCILIA NIENTE: gli elenchi da far tornare sono
// tre, e con due non si sa se il fornitore ha fatturato quello che ha
// portato. Senza righe sul documento la merce non è confrontabile, ma i
// soldi sì — netto ricevuto contro importo del documento — e quello basta a
// dichiarare che torna: è il caso normale delle fatture registrate a mano.
export function riconciliato(order, fattura) {
  if (!fattura) return false
  const prospetto = prospettoOrdine(order, fattura)
  if (prospetto.some((r) => r.problemi.length > 0)) return false
  const t = totaliProspetto(order, fattura)
  if (t.ricevuto <= 0) return false
  if (fatturaConRighe(fattura)) return true
  // Senza righe si confrontano i soldi. L'importo del documento è LORDO e il
  // netto dell'ordine no: si accetta la fattura che sta fra il netto e il
  // netto più l'IVA, che è la forbice dentro cui deve cadere per forza. Più
  // stretto di così si direbbe «non torna» a un documento che torna, e chi
  // legge imparerebbe a ignorare l'avviso.
  const lordo = righeRicevute(order).reduce(
    (t2, r) => t2 + r.qty * r.prezzo * 1.22,
    0
  )
  return t.documento >= t.ricevuto - 0.01 && t.documento <= lordo + 0.01
}

// CHIUDERE SI PUÒ SOLO A FATTURA RICONCILIATA, e non è un sinonimo di
// pagato: si può essere pagati e non riconciliati (si paga per non far
// aspettare il fornitore) e riconciliati e non pagati.
//
// Torna il motivo per cui non si può — una frase da mostrare — oppure `null`
// quando il gesto è ammesso. Come `aggancioAmmesso`: la stessa risposta
// serve a spegnere il tasto e a spiegarlo, così le due cose non divergono.
export function percheNonSiChiude(order, fattura) {
  if (statoOrdineDi(order) !== 'consegnato') return 'La merce non è ancora arrivata tutta.'
  if (!fattura) return 'Manca il documento: senza, non c’è niente da riconciliare.'
  if (!riconciliato(order, fattura))
    return 'Ordinato, ricevuto e fatturato non tornano ancora.'
  return null
}

// ── I PREZZI DA PORTARE SUL LISTINO (REQ-MAG-035) ────────────────────
//
// «Il confronto non finisce in un avviso»: il prezzo della fattura ALLINEA
// il listino di quel fornitore, e la variazione finisce nello storico dei
// prezzi. Mostrare la differenza e lasciare il listino fermo vorrebbe dire
// far ricomparire lo stesso scarto al giro dopo, e a quel punto l'avviso
// diventa rumore che si impara a ignorare.
//
// Si allineano solo le righe che hanno un prodotto vero e un prezzo: una
// riga battuta a mano su niente non ha un listino da aggiornare.
export function prezziDaAllineare(order, fattura) {
  return scartiDiPrezzo(prospettoOrdine(order, fattura))
    .filter((r) => r.item_id && r.prezzo_fattura > 0)
    .map((r) => ({
      item_id: r.item_id,
      name: r.name,
      prezzo: r.prezzo_fattura,
      prezzo_prima: r.prezzo_ordine,
    }))
}
