// ── I MODELLI D'ORDINE (REQ-MAG-039) ─────────────────────────────────
//
// «Flavio potrebbe voler salvare un ordine come TEMPLATE, e nella creazione
// dell'ordine, oltre alla precompilazione, deve poter usare un template
// salvato — con quantità già impostate e prodotti per fornitore già
// selezionati — in modo da poter partire da una situazione che lui conosce»
// (l'utente, 27/08/2026).
//
// È UNA COSA DIVERSA DALLA PRECOMPILAZIONE, e le due convivono: la
// precompilazione (REQ-MAG-036) guarda le SCORTE — cosa sta finendo adesso —
// il modello guarda l'ABITUDINE — il giro che si fa sempre. Applicare un
// modello quindi non azzera niente: SI SOMMA a quello che è già spuntato, e
// per le sue righe la quantità del modello vince. Così si può partire dalle
// scorte e aggiungere il modello, o partire dal modello e lasciare che la
// preselezione abbia già messo quello che manca oggi.
//
// IL MODELLO NON MEMORIZZA IL PREZZO, ed è la regola che tiene in piedi
// tutto il resto: «quando lo carico il prezzo sulla creazione/modifica
// ordine è sempre quello del listino del fornitore, aggiornato all'ultima
// fattura». La catena è fattura → listino → ordine, e il modello non ci si
// mette in mezzo. Un modello coi prezzi dentro farebbe partire un ordine a
// cifre di due mesi fa — che è esattamente la cosa che il confronto
// ordine-fattura (REQ-MAG-038) serve a scoprire.
// Nel codice questo si vede in un punto solo, ed è `applicaModello`: la
// selezione che compone NON porta `totale`, che è il campo della correzione
// a mano. Senza quel campo il prezzo lo rifà il listino, ogni volta.
//
// Qui dentro non c'è Firebase apposta: comporre un modello e applicarlo sono
// conti, e vanno provati senza database.

import { assortimentoDi } from './inventory.js'

// I motivi per cui una riga del modello non arriva intera nell'ordine. Sono
// pochi e chiusi perché a ognuno corrisponde una frase a schermo: chi applica
// un modello «deve vedere cosa non è stato ripreso e perché, invece di
// trovarsi un ordine più corto senza spiegazione».
export const MOTIVI = {
  // Il prodotto non è più in magazzino: non c'è niente da ordinare.
  prodotto_sparito: 'prodotto_sparito',
  // Il fornitore non esiste più in anagrafica: il prodotto si riprende, la
  // scelta di chi lo vende no.
  fornitore_sparito: 'fornitore_sparito',
  // Il fornitore c'è ancora ma quel prodotto è uscito dal suo listino: si
  // riprende lo stesso — si può ordinare a chiunque — ma il prezzo non viene
  // più da lì.
  fuori_listino: 'fuori_listino',
  // Il prodotto è stato messo fuori linea dopo che il modello era stato
  // salvato. Si riprende (ordinarlo è il gesto con cui rientra, REQ-MAG-036)
  // ma va detto, perché è una decisione commerciale presa nel frattempo.
  fuori_linea: 'fuori_linea',
  // Due righe del modello finirebbero sulla stessa riga della tabella: la
  // seconda non si riprende, se no cancellerebbe la prima in silenzio.
  doppione: 'doppione',
}

// ── COMPORRE UN MODELLO ──────────────────────────────────────────────
//
// «Il template si può salvare in fase di creazione»: è lì che Flavio ha
// davanti quello che vuole conservare. Si salva quello che si sta ordinando,
// cioè le righe scelte (`righeScelte` in composizioneOrdine.js).
//
// COSA CI FINISCE: il prodotto, il fornitore scelto per quel prodotto e la
// quantità. Nient'altro — niente prezzi, niente totali, niente stato.
//
// LA QUANTITÀ È QUELLA CHE SI È SCRITTA, cioè nell'unità in cui quel
// fornitore vende: colli da chi vende a colli, pezzi da tutti gli altri
// (REQ-MAG-040). È la stessa scelta del prezzo, presa dall'altro capo: il
// modello dice «due cartoni», e quanto sia un cartone lo dice il listino nel
// momento in cui si compone l'ordine. Congelare qui i pezzi per collo
// sarebbe memorizzare un pezzo di listino, con lo stesso difetto del prezzo.
//
// IL NOME DEL PRODOTTO SI SALVA ACCANTO ALL'ID, e non è una duplicazione per
// comodità: è l'unico modo di dire QUALE prodotto non è stato ripreso il
// giorno che quel prodotto non esiste più. Per tutte le righe che si
// riprendono vale il nome vivo del magazzino, non questo.
export function righeModello(scelte) {
  const righe = []
  for (const s of scelte || []) {
    const qty = Number(s?.qty) || 0
    if (!s?.item_id || qty <= 0) continue
    righe.push({
      item_id: s.item_id,
      item_name: s.item_name ?? null,
      supplier_id: s.supplier_id ?? null,
      qty,
    })
  }
  return righe
}

// LO STESSO MODELLO, RICAVATO DA UN ORDINE GIÀ FATTO. Un ordine è di un
// fornitore solo (REQ-MAG-037), quindi da qui esce un modello di un
// fornitore solo — e va bene, perché i modelli si SOMMANO: il giro di quattro
// fornitori si rifà applicandone quattro, uno dopo l'altro.
//
// La quantità è quella ORDINATA e in COLLI, che è quella che si è chiesta al
// fornitore: `qty_packages` sono i pezzi che entrano in magazzino, e
// riprenderli come colli su un cartone da 24 vorrebbe dire ordinarne 24
// volte tanti. Le righe scritte prima di REQ-MAG-040 non hanno `colli`, e
// per loro un collo è un pezzo: è il caso degenere della scala, non
// un'eccezione.
export function righeModelloDaOrdine(ordine) {
  const righe = []
  for (const l of ordine?.lines || []) {
    if (!l?.item_id) continue
    const qty = Number(l.colli) > 0 ? Number(l.colli) : Number(l.qty_packages) || 0
    if (qty <= 0) continue
    righe.push({
      item_id: l.item_id,
      item_name: l.name ?? null,
      supplier_id: l.supplier_id ?? ordine?.supplier_id ?? null,
      qty,
    })
  }
  return righe
}

// Il nome di un modello: si scrive a mano, quindi si ripulisce. Un modello
// senza nome non si salva — con più modelli in tendina, «senza nome» non
// distingue niente.
export const nomeModello = (v) => String(v ?? '').trim()

// Il modello che porta già quel nome, se c'è. Salvare con lo stesso nome
// AGGIORNA quello che c'era invece di lasciare due voci identiche in tendina,
// che è il modo più rapido per applicare quello sbagliato.
export function modelloConNome(modelli, nome) {
  const cercato = nomeModello(nome).toLocaleLowerCase('it-IT')
  if (!cercato) return null
  return (
    (modelli || []).find(
      (m) => nomeModello(m?.nome).toLocaleLowerCase('it-IT') === cercato
    ) || null
  )
}

// ── APPLICARE UN MODELLO ─────────────────────────────────────────────
//
// Torna le selezioni della composizione (chiave della riga → { qty,
// supplier_id }) con dentro anche quelle di prima, più il conto di cosa è
// stato ripreso e cosa no.
//
// COME SI RITROVA LA RIGA. La tabella ha una riga per COPPIA
// prodotto-fornitore, e la sua chiave è `prodotto|fornitore`. Se quella
// coppia c'è ancora, il modello ci si posa sopra e non è successo niente. Se
// non c'è — il fornitore ha tolto il prodotto dal listino, o non esiste più —
// il prodotto si riprende lo stesso su una riga sua: si può ordinare a
// chiunque, e 378 prodotti su 388 non stanno sul listino di nessuno. Quello
// che si perde è il PREZZO DI LISTINO, e proprio per questo va detto.
export function applicaModello(modello, { catalogo = [], suppliers = [], selezioni = {} } = {}) {
  const perChiave = new Map((catalogo || []).map((r) => [r.key, r]))
  const perProdotto = new Map()
  for (const r of catalogo || []) {
    if (!perProdotto.has(r.item_id)) perProdotto.set(r.item_id, [])
    perProdotto.get(r.item_id).push(r)
  }
  const fornitori = new Map((suppliers || []).map((s) => [s.id, s]))

  const next = { ...(selezioni || {}) }
  const avvisi = []
  const usate = new Set()
  let riprese = 0

  for (const riga of modello?.righe || []) {
    const qty = Number(riga?.qty) || 0
    const righeProdotto = perProdotto.get(riga?.item_id) || []
    const item = righeProdotto[0]?.item
    const nome = item?.name || riga?.item_name || 'Prodotto'
    const fornitore = riga?.supplier_id ? fornitori.get(riga.supplier_id) : null

    if (!item || qty <= 0) {
      avvisi.push({
        item_id: riga?.item_id ?? null,
        nome: riga?.item_name || 'Prodotto',
        fornitore: fornitore?.name ?? null,
        motivo: MOTIVI.prodotto_sparito,
        ripresa: false,
      })
      continue
    }

    // Il fornitore che il modello aveva scelto, se c'è ancora. Un id che non
    // corrisponde più a nessuno non si riscrive sulla riga: sarebbe un ordine
    // intestato al vuoto.
    const supplierId = riga.supplier_id && fornitori.has(riga.supplier_id) ? riga.supplier_id : null
    const esatta = riga.supplier_id ? `${riga.item_id}|${riga.supplier_id}` : null
    let key = esatta && perChiave.has(esatta) ? esatta : righeProdotto[0].key
    let motivo = null
    if (esatta && !perChiave.has(esatta)) {
      motivo = supplierId ? MOTIVI.fuori_listino : MOTIVI.fornitore_sparito
    } else if (assortimentoDi(item) === 'out') {
      motivo = MOTIVI.fuori_linea
    }

    // Due righe del modello sulla stessa riga di tabella: la seconda si
    // fermerebbe sopra la prima e ne cancellerebbe la quantità senza che
    // nessuno se ne accorga. Meglio non riprenderla e dirlo.
    if (usate.has(key)) {
      avvisi.push({
        item_id: riga.item_id,
        nome,
        fornitore: fornitore?.name ?? null,
        motivo: MOTIVI.doppione,
        ripresa: false,
      })
      continue
    }

    usate.add(key)
    riprese += 1
    // NIENTE `totale`: è il campo della correzione a mano, e il modello non
    // porta prezzi. Senza, il prezzo lo rifà il listino del fornitore ogni
    // volta che si applica.
    next[key] = { qty: String(qty), supplier_id: supplierId }
    if (motivo) {
      avvisi.push({
        item_id: riga.item_id,
        nome,
        fornitore: fornitore?.name ?? riga.supplier_id ?? null,
        motivo,
        ripresa: true,
      })
    }
  }

  return { selezioni: next, riprese, totali: (modello?.righe || []).length, avvisi }
}

// Come si legge un avviso a schermo. Sta qui e non nel componente perché è la
// stessa frase che i test controllano: una riga non ripresa deve dire cosa
// non c'è più, non «qualcosa è andato storto».
export function testoAvviso({ nome, fornitore, motivo } = {}) {
  const chi = nome || 'Prodotto'
  switch (motivo) {
    case MOTIVI.prodotto_sparito:
      return `${chi}: non è più in magazzino. Non ripreso.`
    case MOTIVI.fornitore_sparito:
      return `${chi}: il fornitore del modello non c'è più. Ripreso senza fornitore.`
    case MOTIVI.fuori_listino:
      return `${chi}: ${fornitore || 'il fornitore'} non lo ha più a listino. Ripreso, ma il prezzo non viene da lì.`
    case MOTIVI.fuori_linea:
      return `${chi}: adesso è fuori linea. Ripreso lo stesso.`
    case MOTIVI.doppione:
      return `${chi}: nel modello compare due volte. Ripresa una riga sola.`
    default:
      return chi
  }
}
