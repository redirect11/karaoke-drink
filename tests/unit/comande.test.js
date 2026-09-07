'use strict'

// Unit test del modello Ordine (conto) / Comande (ticket) — src/lib/comande.js

import { describe, it, expect } from 'vitest'
import {
  numeroComanda,
  ORDER_OPEN,
  nextComandaStatus,
  statoComandaNuova,
  comandaPerLeAggiunte,
  presaInCarico,
  ultimaComandaViva,
  statiPrimaComanda,
  statiDopoLaDivisione,
  activeComanda,
  serveAllComande,
  comandeSummary,
  allServed,
  aggregateItems,
  itemsTotal,
  comandeStatuses,
  normalizeOrderDoc,
  orderHasContent,
  initialDetailView,
  orderIsClosed,
  comandaEditable,
  lockedQtyByItem,
  planDecrement,
  comandaDaScaricare,
  contoChiuso,
} from '../../src/lib/comande.js'

const c = (seq, status, items = []) => ({ id: `c${seq}`, seq, status, items })

// ── IN CHE PASSO NASCE UNA COMANDA ──────────────────────────
//
// Di suo «da fare»: si battono tre conti di fila e poi si comincia a
// versare, ed è «Lo preparo io» a dire quando si comincia — e chi. Dove
// invece si prepara nell'istante in cui si batte, quel passo è un tocco in
// più per ogni comanda, tutta la sera: lo decide il locale.
//
// È UNA FUNZIONE E NON UNA COSTANTE apposta: con un valore da copiare
// bastava che una strada scrivesse un «ricevuto» a mano per non seguire
// l'impostazione, e non se ne sarebbe accorto nessuno. Era già successo
// tre volte — il conto nuovo, le aggiunte, il placeholder in coda — e le
// tre risposte non combaciavano.
// ── FIN DOVE SI PUÒ TORNARE INDIETRO ─────────────────────────
//
// Col locale che fa nascere le comande già in preparazione, «da fare» non
// esiste: nessuna comanda ci nasce, nessuno guarda quella colonna, e
// rimandarci una comanda a mano vuol dire nasconderla dove non la cerca
// più nessuno.
describe('fin dove si torna indietro', () => {
  it('di suo si torna a tutti i passi già fatti', () => {
    expect(statiPrimaComanda('pronto', 'ricevuto')).toEqual(['ricevuto', 'in_preparazione'])
    expect(statiPrimaComanda('in_preparazione', 'ricevuto')).toEqual(['ricevuto'])
    expect(statiPrimaComanda('ricevuto', 'ricevuto')).toEqual([])
  })

  it('COL SALTO ACCESO «da fare» non si propone più', () => {
    expect(statiPrimaComanda('pronto', 'in_preparazione')).toEqual(['in_preparazione'])
    expect(statiPrimaComanda('in_preparazione', 'in_preparazione')).toEqual([])
  })

  it('ma una comanda già ferma a «da fare» non si tocca', () => {
    // Non si rimanda indietro nessuno: si toglie solo la strada per
    // andarci. Da «da fare» si va avanti come sempre.
    expect(statiPrimaComanda('ricevuto', 'in_preparazione')).toEqual([])
    expect(nextComandaStatus('ricevuto')).toBe('in_preparazione')
  })

  it('da una comanda servita si torna comunque solo fin dove si può', () => {
    expect(statiPrimaComanda('ritirato', 'in_preparazione')).toEqual([
      'in_preparazione',
      'pronto',
    ])
  })
})

// ── DOVE FINISCONO LE RIGHE AGGIUNTE A UN CONTO APERTO ────────────
//
// SOLO IN UNA COMANDA ANCORA «DA FARE».
//
// «Se una comanda passa da "da fare" a "in preparazione", i prodotti
// successivi che aggiungo all'ordine dovranno creare una NUOVA comanda. Al
// momento succede solo se da in preparazione passano a da servire. Se sono
// in preparazione significa che la vecchia comanda è stata già presa in
// carico» (l'utente, 20/08).
//
// I due test qui sotto dicevano il contrario, e non per sbaglio: la regola
// di prima era «nel passo dove NASCE il lavoro», e col locale che fa
// nascere le comande già in preparazione quel passo era «in preparazione»
// — cioè le aggiunte finivano dentro una comanda presa in carico. Prima
// ancora era `comandaEditable`, che vuol dire «si può ancora toccare» e
// includeva anche lei «in preparazione» (BUG-024). La domanda giusta non è
// dove nasce il lavoro: è se quel ticket l'ha già preso in mano qualcuno.
describe('dove finiscono le righe aggiunte', () => {
  const c = (id, status, over = {}) => ({ id, status, items: [], ...over })

  it('nella comanda ancora «da fare», non in quella al banco', () => {
    const comande = [c('c1', 'in_preparazione'), c('c2', 'ricevuto')]
    // è lo stesso giro da fare, non due ticket per la stessa cosa
    expect(comandaPerLeAggiunte(comande).id).toBe('c2')
  })

  it('una comanda PRESA IN CARICO non accoglie più niente', () => {
    // Chi sta già shakerando non deve vedersi allungare il ticket sotto le
    // mani: ne nasce una nuova (qui: nessun bersaglio).
    expect(comandaPerLeAggiunte([c('c1', 'in_preparazione', { presa_in_carico: true })])).toBe(null)
  })

  // LA CORREZIONE DEL 20/08, DOPO AVER VISTO IL DANNO. «Devi aggiungere
  // prodotti a una NUOVA comanda solo se lo stato viene PASSATO in
  // preparazione (comanda presa in carico)»: una comanda NATA in
  // preparazione perché il locale ha acceso quell'impostazione non l'ha
  // presa in mano nessuno, e le aggiunte ci vanno dentro. Il test di prima
  // diceva il contrario, e faceva nascere un ticket per ogni riga.
  it('ma una NATA in preparazione (impostazione del locale) sì', () => {
    const nata = c('c1', 'in_preparazione', { presa_in_carico: false })
    expect(comandaPerLeAggiunte([nata]).id).toBe('c1')
    expect(presaInCarico(nata)).toBe(false)
  })

  it('i documenti vecchi, senza il segno, si danno per presi in carico', () => {
    // Nessun campo `presa_in_carico`: non si sa, e la risposta prudente è
    // quella che non allunga un ticket che forse è già al banco.
    expect(presaInCarico(c('c1', 'in_preparazione'))).toBe(true)
    expect(comandaPerLeAggiunte([c('c1', 'in_preparazione')])).toBe(null)
  })

  // LA SESSIONE DI CREAZIONE. «Se non sono ancora uscito dalla creazione
  // ordine quella è sempre una sola comanda (anche se da creazione ordine
  // vado in pagamento)» (l'utente, 20/08). Qualunque stato, qualunque
  // impostazione del locale, stampata o no.
  it('finché il conto si sta creando è UNA comanda sola', () => {
    const comande = [c('c1', 'in_preparazione', { presa_in_carico: true })]
    expect(comandaPerLeAggiunte(comande, { inCreazione: true }).id).toBe('c1')
    expect(
      comandaPerLeAggiunte([c('c1', 'ricevuto', { auto_print_at: '2026-08-20T21:00:00Z' })], {
        inCreazione: true,
      }).id
    ).toBe('c1')
    // Una comanda annullata non è un bersaglio nemmeno in creazione.
    expect(comandaPerLeAggiunte([c('c1', 'annullato')], { inCreazione: true })).toBe(null)
  })

  it('una comanda PRONTA, SERVITA o ANNULLATA non accoglie mai niente', () => {
    for (const stato of ['pronto', 'ritirato', 'annullato']) {
      expect(comandaPerLeAggiunte([c('c1', stato)])).toBe(null)
    }
  })

  // IERI QUESTA ERA UN'ESCLUSIONE, OGGI NO. «Già uscita dalla stampante»
  // non c'entra con «l'ha presa in mano qualcuno», e tenerla contraddiceva
  // la regola nuova: un conto battuto in fretta faceva un ticket per riga.
  // La ragione per cui era nata resta vera — se una comanda già stampata si
  // gonfia, la carta al banco è vecchia — e la cura è un'altra: le aggiunte
  // ci entrano e il ticket si RISTAMPA completo (api.js azzera
  // `auto_print_at`). Il banco butta il foglio vecchio e ha quello giusto.
  it('una «da fare» GIÀ STAMPATA accoglie lo stesso: il ticket si rifà', () => {
    expect(
      comandaPerLeAggiunte([c('c1', 'ricevuto', { auto_print_at: '2026-08-20T21:00:00Z' })]).id
    ).toBe('c1')
  })

  it('l’ultima comanda viva è quella che «Nella comanda» allunga', () => {
    // Col servizio spento la scelta è di chi sta al banco, e «la comanda» è
    // quella che ha davanti: l'ultima battuta, non la prima.
    expect(ultimaComandaViva([c('c1', 'ricevuto'), c('c2', 'ricevuto')]).id).toBe('c2')
    expect(ultimaComandaViva([c('c1', 'ricevuto'), c('c2', 'annullato')]).id).toBe('c1')
    expect(ultimaComandaViva([])).toBe(null)
  })

  it('conto vuoto: non c’è niente da accogliere', () => {
    expect(comandaPerLeAggiunte([])).toBe(null)
    expect(comandaPerLeAggiunte(undefined)).toBe(null)
  })
})

describe('in che passo nasce una comanda', () => {
  it('di suo nasce DA FARE', () => {
    expect(statoComandaNuova({})).toBe('ricevuto')
    expect(statoComandaNuova()).toBe('ricevuto')
    expect(statoComandaNuova({ comande_in_preparazione: false })).toBe('ricevuto')
  })

  it('col locale che lo chiede, nasce già in preparazione', () => {
    expect(statoComandaNuova({ comande_in_preparazione: true })).toBe('in_preparazione')
  })

  it('solo il vero acceso conta', () => {
    // Un valore storto letto da Firestore non deve far nascere le comande
    // in un posto a caso.
    for (const v of ['si', 1, 'true', null, undefined]) {
      expect(statoComandaNuova({ comande_in_preparazione: v })).toBe('ricevuto')
    }
  })
})

describe('nextComandaStatus', () => {
  it('flusso ricevuto→in_preparazione→pronto→ritirato→null', () => {
    expect(nextComandaStatus('ricevuto')).toBe('in_preparazione')
    expect(nextComandaStatus('in_preparazione')).toBe('pronto')
    expect(nextComandaStatus('pronto')).toBe('ritirato')
    expect(nextComandaStatus('ritirato')).toBeNull()
    expect(nextComandaStatus('annullato')).toBeNull()
  })
})

describe('activeComanda / comandeSummary / allServed', () => {
  const order = {
    status: ORDER_OPEN,
    comande: [c(1, 'ritirato'), c(2, 'pronto'), c(3, 'ricevuto'), c(4, 'annullato')],
  }
  it('attiva = quella al passo più indietro (dà lo stato dell\'ordine)', () => {
    expect(activeComanda(order).seq).toBe(3)
  })

  it('aggiunta su conto con comanda pronta: l\'ordine TORNA in preparazione', () => {
    // C1 è pronta al servizio; l'aggiunta C2 nasce in preparazione → è lei
    // l'attiva: in coda l'ordine risulta di nuovo "in preparazione".
    const o = { comande: [c(1, 'pronto'), c(2, 'in_preparazione')] }
    expect(activeComanda(o).seq).toBe(2)
    expect(activeComanda(o).status).toBe('in_preparazione')
  })

  it('a parità di passo vince la più vecchia', () => {
    expect(activeComanda({ comande: [c(1, 'in_preparazione'), c(2, 'in_preparazione')] }).seq).toBe(1)
  })

  it('conto pagato: serveAllComande marca tutto servito (annullate escluse)', () => {
    const servite = serveAllComande(
      [c(1, 'ritirato'), c(2, 'in_preparazione'), c(3, 'annullato'), c(4, 'pronto')],
      'T1'
    )
    expect(servite.map((x) => x.status)).toEqual(['ritirato', 'ritirato', 'annullato', 'ritirato'])
    // orario di servizio stampigliato solo su quelle chiuse adesso
    expect(servite[1].status_times.ritirato).toBe('T1')
    expect(servite[3].status_times.ritirato).toBe('T1')
    expect(allServed({ comande: servite })).toBe(true)
  })
  it('summary conta attive/pronte/servite (esclude annullate)', () => {
    expect(comandeSummary(order)).toEqual({ attive: 2, pronte: 1, servite: 1, totale: 3 })
  })
  it('allServed solo quando tutte ritirate (annullate ignorate)', () => {
    expect(allServed(order)).toBe(false)
    expect(allServed({ comande: [c(1, 'ritirato'), c(2, 'annullato')] })).toBe(true)
    expect(allServed({ comande: [c(1, 'annullato')] })).toBe(false)
  })
})

describe('aggregateItems / itemsTotal', () => {
  it('somma lo stesso drink su comande diverse, custom separati, annullate escluse', () => {
    const comande = [
      c(1, 'ritirato', [
        { drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 },
        { drink_id: 'custom-1', custom: true, name: 'Special', unit_price: 9, qty: 1 },
      ]),
      c(2, 'ricevuto', [
        { drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 },
        { drink_id: 'custom-2', custom: true, name: 'Special', unit_price: 9, qty: 1 },
      ]),
      c(3, 'annullato', [{ drink_id: 'gin', name: 'Gin', unit_price: 8, qty: 5 }]),
    ]
    const agg = aggregateItems(comande)
    expect(agg.find((i) => i.drink_id === 'mojito').qty).toBe(3)
    expect(agg.filter((i) => i.custom)).toHaveLength(2)
    expect(agg.find((i) => i.drink_id === 'gin')).toBeUndefined()
    expect(itemsTotal(agg)).toBe(3 * 7 + 9 + 9)
  })
})

describe('comandeStatuses', () => {
  it('stati unici presenti', () => {
    expect(comandeStatuses([c(1, 'ritirato'), c(2, 'ricevuto'), c(3, 'ricevuto')]).sort()).toEqual([
      'ricevuto',
      'ritirato',
    ])
  })
})

describe('dettaglio POS: il contenuto del conto è visibile', () => {
  const withContent = {
    status: ORDER_OPEN,
    comande: [c(1, 'ritirato', [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }])],
  }
  const empty = { status: ORDER_OPEN, comande: [] }
  const onlyCancelled = {
    status: ORDER_OPEN,
    comande: [c(1, 'annullato', [{ drink_id: 'x', name: 'X', unit_price: 1, qty: 1 }])],
  }

  it('orderHasContent: vero con item in comande non annullate', () => {
    expect(orderHasContent(withContent)).toBe(true)
    expect(orderHasContent(empty)).toBe(false)
    expect(orderHasContent(onlyCancelled)).toBe(false)
  })

  it('il dettaglio di un ordine con contenuto si apre sulle Comande', () => {
    expect(initialDetailView(withContent)).toBe('comande')
    expect(initialDetailView(empty)).toBe('menu')
  })

  it('anche un ordine legacy (solo items) mostra il contenuto', () => {
    const legacy = normalizeOrderDoc({
      status: 'in_preparazione',
      items: [{ drink_id: 'gin', name: 'Gin', unit_price: 8, qty: 1 }],
    })
    expect(orderHasContent(legacy)).toBe(true)
    expect(initialDetailView(legacy)).toBe('comande')
  })

  it('flusso aggiunta: dopo una nuova comanda l’aggregato contiene tutto', () => {
    const comande = [
      ...withContent.comande,
      c(2, 'ricevuto', [{ drink_id: 'gin', name: 'Gin', unit_price: 8, qty: 1 }]),
    ]
    const agg = aggregateItems(comande)
    expect(agg.map((i) => i.drink_id).sort()).toEqual(['gin', 'mojito'])
    expect(itemsTotal(agg)).toBe(2 * 7 + 8)
  })

  it('orderIsClosed solo per pagato/annullato', () => {
    expect(orderIsClosed({ status: 'pagato' })).toBe(true)
    expect(orderIsClosed({ status: 'annullato' })).toBe(true)
    expect(orderIsClosed(withContent)).toBe(false)
  })
})

describe('normalizeOrderDoc (retrocompatibilità)', () => {
  it('doc nuovo modello: passa attraverso', () => {
    const n = normalizeOrderDoc({ status: ORDER_OPEN, comande: [c(1, 'pronto')] })
    expect(n.status).toBe(ORDER_OPEN)
    expect(n.comande).toHaveLength(1)
  })
  it('legacy in lavorazione → ordine aperto + comanda sintetica con lo stato', () => {
    const n = normalizeOrderDoc({
      status: 'in_preparazione',
      items: [{ drink_id: 'x', qty: 1 }],
      status_times: { in_preparazione: 't1' },
      inventory_applied: true,
      inventory_consumption: [{ inventory_item_id: 'rum', qty: 40 }],
    })
    expect(n.status).toBe(ORDER_OPEN)
    expect(n.comande[0]).toMatchObject({
      seq: 1,
      status: 'in_preparazione',
      inventory_applied: true,
    })
    expect(n.comande[0].items).toHaveLength(1)
  })
  it('legacy pagato → ordine pagato, comanda ritirata; annullato → annullato', () => {
    expect(normalizeOrderDoc({ status: 'pagato', items: [] }).status).toBe('pagato')
    expect(normalizeOrderDoc({ status: 'pagato', items: [] }).comande[0].status).toBe('ritirato')
    expect(normalizeOrderDoc({ status: 'annullato', items: [] }).comande[0].status).toBe('annullato')
  })
})

describe('vista aggregata: aumenti/diminuzioni gestite internamente', () => {
  const comande = [
    { id: 'c1', seq: 1, status: 'ritirato', items: [{ drink_id: 'mojito', qty: 2 }] },
    { id: 'c2', seq: 2, status: 'in_preparazione', items: [{ drink_id: 'mojito', qty: 1 }, { drink_id: 'gin', qty: 1 }] },
    { id: 'c3', seq: 3, status: 'pronto', items: [{ drink_id: 'gin', qty: 2 }] },
  ]

  it('comandaEditable: solo ricevuto/in_preparazione', () => {
    expect(comandaEditable({ status: 'ricevuto' })).toBe(true)
    expect(comandaEditable({ status: 'in_preparazione' })).toBe(true)
    expect(comandaEditable({ status: 'pronto' })).toBe(false)
    expect(comandaEditable({ status: 'ritirato' })).toBe(false)
  })

  it('lockedQtyByItem: somma le quantità di pronte/servite', () => {
    expect(lockedQtyByItem(comande)).toEqual({ mojito: 2, gin: 2 })
  })

  it('planDecrement: scala dalla comanda modificabile più recente', () => {
    const plan = planDecrement(comande, 'mojito')
    expect(plan.comandaId).toBe('c2')
    expect(plan.items).toEqual([{ drink_id: 'gin', qty: 1 }]) // mojito rimosso (era 1)
  })

  it('planDecrement: null se l’item vive solo in comande bloccate', () => {
    expect(planDecrement(comande, 'birra')).toBeNull()
    const soloServite = [{ id: 'c1', status: 'ritirato', items: [{ drink_id: 'x', qty: 3 }] }]
    expect(planDecrement(soloServite, 'x')).toBeNull()
  })
})

// IL MAGAZZINO SI SCALA A «PRONTO». È il momento in cui il fatto succede:
// lì il drink è fatto — il gin è già nel bicchiere — e a segnarlo è chi
// l'ha fatto, il banco. «Servito» è il drink arrivato al tavolo, e fra i
// due passi in magazzino non si muove più niente.
// Prima si scaricava al servito, e lì il tasto ormai lo preme la SALA, che
// sul magazzino non scrive: lo scarico falliva in silenzio (BUG-040). E non
// si scala prima, alla presa in carico: un drink iniziato e poi non fatto
// avrebbe già portato via gli ingredienti.
describe('quando si scala il magazzino', () => {
  it('quando la comanda è pronta: lì il drink è fatto', () => {
    expect(comandaDaScaricare({ inventory_applied: false }, 'pronto')).toBe(true)
  })

  it('non quando la si prende in carico', () => {
    expect(comandaDaScaricare({ inventory_applied: false }, 'in_preparazione')).toBe(false)
  })

  it('e non di nuovo quando esce dal banco: è già stato fatto', () => {
    expect(comandaDaScaricare({ inventory_applied: true }, 'ritirato')).toBe(false)
    // Anche la comanda vecchia, di prima che lo scarico si spostasse, non
    // si scala al servito: a raccoglierla è la rete della riscossione
    // (unappliedEntries in api.js), che guarda proprio quelle.
    expect(comandaDaScaricare({ inventory_applied: false }, 'ritirato')).toBe(false)
  })

  it('una volta sola', () => {
    expect(comandaDaScaricare({ inventory_applied: true }, 'pronto')).toBe(false)
  })

  // AVANTI E INDIETRO NON SCALA DUE VOLTE. Si segna «pronto» il ticket
  // sbagliato e lo si rimette «in preparazione»: quando ripassa a pronto lo
  // scarico è già stato applicato, e non si ripete. È la guardia su cui sta
  // in piedi tutto il resto — un magazzino che si scala due volte se ne
  // accorge qualcuno tre giorni dopo, guardando una giacenza che non torna.
  it('pronto → indietro → pronto: lo stesso drink si scala una volta sola', () => {
    const c = { inventory_applied: false }
    expect(comandaDaScaricare(c, 'pronto')).toBe(true)
    // Lo scarico è andato: da qui in poi la comanda se lo porta scritto.
    c.inventory_applied = true
    expect(comandaDaScaricare(c, 'in_preparazione')).toBe(false)
    expect(comandaDaScaricare(c, 'pronto')).toBe(false)
    expect(comandaDaScaricare(c, 'ritirato')).toBe(false)
  })
})

// QUANDO UN CONTO È CHIUSO. La regola sta in un posto solo perché la usano
// in tre — coda, riepilogo di testata e magazzino — e quando stava scritta
// in tre posti il magazzino contava fra gli aperti conti già incassati:
// con un tavolo solo segnava mezzo listino in esaurimento.
describe('conto chiuso: non c’è più niente da fare', () => {
  const servito = (over = {}) => ({
    comande: [{ id: 'c1', status: 'ritirato', items: [{ drink_id: 'x', qty: 1 }] }],
    ...over,
  })

  it('con gli stati del servizio servono incasso E consegna', () => {
    expect(contoChiuso(servito({ payment_status: 'pagato' }), { workflowOn: true })).toBe(true)
    // Pagato in anticipo, drink ancora da fare: lavoro da fare, non chiuso.
    const daServire = {
      payment_status: 'pagato',
      comande: [{ id: 'c1', status: 'in_preparazione', items: [{ drink_id: 'x', qty: 1 }] }],
    }
    expect(contoChiuso(daServire, { workflowOn: true })).toBe(false)
  })

  it('senza gli stati del servizio il pagamento chiude e basta', () => {
    const daServire = {
      payment_status: 'pagato',
      comande: [{ id: 'c1', status: 'in_preparazione', items: [{ drink_id: 'x', qty: 1 }] }],
    }
    expect(contoChiuso(daServire, { workflowOn: false })).toBe(true)
  })

  it('l’annullato è chiuso in ogni caso', () => {
    expect(contoChiuso({ status: 'annullato' }, { workflowOn: true })).toBe(true)
    expect(contoChiuso({ workflow_status: 'annullato' }, { workflowOn: false })).toBe(true)
  })

  it('un conto servito ma non incassato resta aperto: mancano i soldi', () => {
    expect(contoChiuso(servito(), { workflowOn: true })).toBe(false)
  })
})

// ── LA PREPARAZIONE PARZIALE ─────────────────────────────────────────
//
// Al banco capita di vedere tre gin tonic in una comanda e due in un'altra
// e prepararli insieme, per farli uscire in una volta sola. Non andrebbe
// fatto — un ticket si lavora intero — ma si fa: l'app non lo impedisce,
// lo registra, e queste sono le regole con cui lo registra.
//
// IL CONTROLLO CHE CONTA È L'ULTIMO: la somma delle unità prima e dopo la
// divisione deve essere identica. Se una divisione fa sparire un drink, al
// banco non se ne accorge nessuno finché non lo reclama il cliente.
import {
  dividiComanda,
  comandaDivisibile,
  firmaLavoro,
  annullataPerDivisione,
} from '../../src/lib/comande.js'

describe('dividere una comanda', () => {
  const riga = (name, qty) => ({ drink_id: name, name, qty, unit_price: 8 })
  const comanda = { id: 'c1', seq: 1, status: 'ricevuto', items: [riga('Gin tonic', 5)] }
  const unità = (righe) => (righe || []).reduce((s, i) => s + i.qty, 0)

  it('due di cinque: due partono, tre restano da fare', () => {
    const { tutta, nuova, resta } = dividiComanda(comanda, [2])
    expect(tutta).toBe(false)
    expect(nuova).toEqual([{ ...riga('Gin tonic', 2), unit_price: 8 }])
    expect(resta).toEqual([{ ...riga('Gin tonic', 3), unit_price: 8 }])
  })

  it('righe intere: quella scelta se ne va tutta, le altre restano', () => {
    const c = { ...comanda, items: [riga('Gin tonic', 3), riga('Negroni', 2)] }
    const { nuova, resta } = dividiComanda(c, [3, 0])
    expect(nuova.map((i) => [i.name, i.qty])).toEqual([['Gin tonic', 3]])
    expect(resta.map((i) => [i.name, i.qty])).toEqual([['Negroni', 2]])
  })

  it('prese TUTTE le righe non si divide niente: la comanda avanza e basta', () => {
    // Annullarla per rifarla identica lascerebbe in giro una comanda
    // annullata che non racconta niente a nessuno.
    const c = { ...comanda, items: [riga('Gin tonic', 3), riga('Negroni', 2)] }
    const esito = dividiComanda(c, [3, 2])
    expect(esito.tutta).toBe(true)
    expect(esito.resta).toEqual([])
    expect(unità(esito.nuova)).toBe(5)
  })

  it('non si è scelto niente: non succede niente', () => {
    expect(dividiComanda(comanda, [0])).toBe(null)
    expect(dividiComanda(comanda, [])).toBe(null)
    expect(dividiComanda(comanda, undefined)).toBe(null)
  })

  it('quantità impossibili non fanno danni', () => {
    // Un −1 o un «boh» arrivati da un tocco storto valgono zero; chiederne
    // più di quante ce ne sono vale tutte quelle che ci sono.
    expect(dividiComanda(comanda, [-3])).toBe(null)
    expect(dividiComanda(comanda, ['boh'])).toBe(null)
    const troppe = dividiComanda(comanda, [99])
    expect(troppe.tutta).toBe(true)
    expect(unità(troppe.nuova)).toBe(5)
  })

  it('IL TOTALE DELLE UNITÀ SI CONSERVA SEMPRE', () => {
    const c = {
      ...comanda,
      items: [riga('Gin tonic', 5), riga('Negroni', 2), riga('Spritz', 3)],
    }
    const prima = unità(c.items)
    for (const scelte of [[1, 0, 0], [5, 2, 3], [2, 1, 1], [0, 2, 0], [4, 9, 1]]) {
      const esito = dividiComanda(c, scelte)
      expect(unità(esito.nuova) + unità(esito.resta)).toBe(prima)
    }
  })
})

// I DUE ANNULLAMENTI. Uno è un fatto della serata (il conto è saltato),
// l'altro è contabilità interna (la comanda è stata divisa). Nel dato sono
// tutti e due «annullato»: a distinguerli è il motivo scritto sulla comanda,
// ed è su quello che si filtra — non sullo stato.
describe('annullata davvero o annullata perché divisa', () => {
  it('solo la divisione porta il suo motivo', () => {
    expect(annullataPerDivisione({ status: 'annullato', annullata_per: 'divisione' })).toBe(true)
    expect(annullataPerDivisione({ status: 'annullato' })).toBe(false)
    expect(annullataPerDivisione({ status: 'ricevuto', annullata_per: 'divisione' })).toBe(false)
    expect(annullataPerDivisione(null)).toBe(false)
  })
})

describe('su quali comande si propone la preparazione parziale', () => {
  const riga = (qty) => ({ drink_id: 'gin', name: 'Gin tonic', qty, unit_price: 8 })
  const con = (status, qty = 2) => ({ status, items: [riga(qty)] })

  it('FINCHÉ IL DRINK NON È USCITO DAL BANCO', () => {
    // Dividere una comanda già al banco è il caso vero: sto preparando
    // cinque gin tonic, ne faccio uscire tre adesso e due dopo.
    expect(comandaDivisibile(con('ricevuto'))).toBe(true)
    expect(comandaDivisibile(con('in_preparazione'))).toBe(true)
  })

  it('da «pronto» in poi no: è roba sul vassoio', () => {
    for (const st of ['pronto', 'ritirato', 'annullato']) {
      expect(comandaDivisibile(con(st))).toBe(false)
    }
    expect(comandaDivisibile(null)).toBe(false)
  })

  it('e solo se c’è più di un drink: su uno solo la scelta è tutto o niente', () => {
    expect(comandaDivisibile(con('ricevuto', 1))).toBe(false)
    expect(comandaDivisibile(con('in_preparazione', 1))).toBe(false)
    expect(comandaDivisibile({ status: 'ricevuto', items: [] })).toBe(false)
    expect(comandaDivisibile({ status: 'ricevuto', items: [riga(1), riga(1)] })).toBe(true)
  })
})

// ── IN CHE PASSO NASCONO LE DUE PARTI ──────────────────────────
//
// Lo dice quella di partenza, e non è fisso.
describe('gli stati dopo una divisione', () => {
  it('da «da fare»: la parte scelta parte, il resto resta da fare', () => {
    expect(statiDopoLaDivisione('ricevuto')).toEqual({
      nuova: 'in_preparazione',
      resta: 'ricevuto',
    })
  })

  it('da «in preparazione»: TUTTE E DUE in preparazione', () => {
    // Il lavoro è cominciato su entrambe: mandarne indietro una a «da
    // fare» direbbe che quei drink non li ha ancora presi in mano nessuno.
    expect(statiDopoLaDivisione('in_preparazione')).toEqual({
      nuova: 'in_preparazione',
      resta: 'in_preparazione',
    })
  })
})

// LA FIRMA DEL LAVORO dice se il server ha ormai recepito il gesto fatto
// qui: serve a buttare via la copia locale senza far «rimbalzare» la card
// allo stato di prima.
describe('la firma del lavoro di un conto', () => {
  const c = (id, status, qty) => ({ id, status, items: [{ drink_id: 'x', qty }] })

  it('cambia quando cambia il passo o quante unità ci sono', () => {
    expect(firmaLavoro([c('c1', 'ricevuto', 2)])).not.toBe(
      firmaLavoro([c('c1', 'in_preparazione', 2)])
    )
    expect(firmaLavoro([c('c1', 'ricevuto', 2)])).not.toBe(firmaLavoro([c('c1', 'ricevuto', 3)]))
  })

  it('non cambia per i campi che non si vedono', () => {
    // Dal server le comande tornano con orari e snapshot del magazzino in
    // più: confrontando gli oggetti interi la copia locale non se ne
    // andrebbe mai.
    const dalServer = {
      ...c('c1', 'ricevuto', 2),
      status_times: { ricevuto: '2026-08-16T21:00:00.000Z' },
      inventory_consumption: [{ id: 'gin', qty: 40 }],
    }
    expect(firmaLavoro([dalServer])).toBe(firmaLavoro([c('c1', 'ricevuto', 2)]))
  })

  it('NON GUARDA GLI ID, ed è il punto', () => {
    // Una comanda appena creata qui non ha ancora il nome che le darà il
    // server: confrontando gli id, la copia locale di una divisione non se
    // ne sarebbe andata mai più. Quello che conta è se a schermo cambia
    // qualcosa.
    expect(firmaLavoro([c('__volo-1', 'in_preparazione', 2)])).toBe(
      firmaLavoro([c('c3', 'in_preparazione', 2)])
    )
  })

  it('non guarda nemmeno l’ordine in cui stanno', () => {
    // Il server appende le comande nate da una divisione nell'ordine suo.
    expect(firmaLavoro([c('c1', 'ricevuto', 3), c('c2', 'in_preparazione', 2)])).toBe(
      firmaLavoro([c('c2', 'in_preparazione', 2), c('c1', 'ricevuto', 3)])
    )
  })

  it('una divisione: la firma combacia quando arrivano le comande vere', () => {
    // Locale: la vecchia annullata più due provvisorie. Server: la stessa
    // cosa, con gli id veri e i campi in più.
    const locale = [
      c('c1', 'annullato', 5),
      c('__volo-1', 'in_preparazione', 2),
      c('__volo-2', 'ricevuto', 3),
    ]
    const server = [
      { ...c('c1', 'annullato', 5), annullata_per: 'divisione', divisa_in: ['c2', 'c3'] },
      { ...c('c2', 'in_preparazione', 2), divisa_da: 'c1' },
      { ...c('c3', 'ricevuto', 3), divisa_da: 'c1' },
    ]
    expect(firmaLavoro(locale)).toBe(firmaLavoro(server))
  })
})


// ── I GRUPPI DELLE RIGHE DENTRO IL CONTO ───────────────────────
//
// Gli stati del servizio stanno sulle COMANDE, non sul conto: con una
// comanda sola tutti i drink sono nello stesso passo e non c'è niente da
// intestare. Appena il banco ne divide una, aprendo il conto si deve
// vedere cosa è al banco e cosa è già uscito.
import { gruppoDiRiga, gruppiDelConto, titoloGruppo } from '../../src/lib/comande.js'

describe('a che punto sta ogni riga del conto', () => {
  const daComanda = (status) => ({ source: 'comanda', status })
  const bozza = { source: 'draft' }

  it('una riga sta nel passo della sua comanda; quella pagata sta fra i pagati', () => {
    expect(gruppoDiRiga(daComanda('in_preparazione'))).toBe('in_preparazione')
    expect(gruppoDiRiga({ ...daComanda('pronto'), paid: true })).toBe('pagati')
    // le righe della bozza non sono ancora lavoro di nessuno
    expect(gruppoDiRiga(bozza)).toBe(null)
  })

  it('con una comanda sola c’è UN gruppo: niente titoli', () => {
    // Di base la comanda esce tutta per l'intero ordine, e un titolo per
    // dire una cosa sola è rumore.
    const righe = [daComanda('ricevuto'), daComanda('ricevuto'), bozza]
    expect(gruppiDelConto(righe)).toEqual(['ricevuto'])
  })

  it('divisa la comanda i gruppi sono in ordine di lavorazione, coi pagati in fondo', () => {
    const righe = [
      { ...daComanda('pronto'), paid: true },
      daComanda('pronto'),
      daComanda('ricevuto'),
      daComanda('in_preparazione'),
    ]
    expect(gruppiDelConto(righe)).toEqual([
      'ricevuto',
      'in_preparazione',
      'pronto',
      'pagati',
    ])
  })

  it('PAGATO IN CASSA E IN PREPARAZIONE AL BANCO: due titoli, nessuna contraddizione', () => {
    // Un conto si incassa in qualunque stato di servizio. Se il gruppo
    // «Pagati» scacciasse quello del servizio, aprendo il conto si
    // leggerebbe che è tutto sistemato mentre un drink è ancora da fare.
    const righe = [daComanda('in_preparazione'), { ...daComanda('ritirato'), paid: true }]
    expect(gruppiDelConto(righe)).toEqual(['in_preparazione', 'pagati'])
    expect(titoloGruppo('in_preparazione')).toBe('🍹 In preparazione')
    expect(titoloGruppo('pagati')).toBe('💳 Pagati')
  })

  it('un gruppo che non esiste non ha titolo', () => {
    expect(titoloGruppo(null)).toBe(null)
    expect(titoloGruppo('boh')).toBe(null)
  })
})


// ── I PASSI DI UNA COMANDA, CON L'ORA ────────────────────────
//
// Sulla card basta «da quanto sta lì»; aperta la comanda le domande
// diventano altre — quando è entrata, quando qualcuno l'ha presa in
// carico, quanto è rimasta pronta prima di partire. Al banco quei minuti
// sono la differenza fra «siamo indietro» e «questo ticket è stato
// dimenticato».
import { tappeComanda } from '../../src/lib/comande.js'

describe('i passi di una comanda', () => {
  const ORA = '2026-08-18T21:00:00.000Z'
  const POI = '2026-08-18T21:04:00.000Z'

  it('quelli già toccati portano l’ora, quelli davanti no', () => {
    const tappe = tappeComanda({
      status: 'in_preparazione',
      status_times: { ricevuto: ORA, in_preparazione: POI },
    })
    expect(tappe.map((t) => [t.stato, t.fatta, t.adesso, t.quando])).toEqual([
      ['ricevuto', true, false, ORA],
      ['in_preparazione', true, true, POI],
      ['pronto', false, false, null],
      ['ritirato', false, false, null],
    ])
  })

  it('appena entrata: un passo solo alle spalle', () => {
    const tappe = tappeComanda({ status: 'ricevuto', status_times: { ricevuto: ORA } })
    expect(tappe.filter((t) => t.fatta).map((t) => t.stato)).toEqual(['ricevuto'])
    expect(tappe.find((t) => t.adesso).stato).toBe('ricevuto')
  })

  it('servita: sono tutti fatti, e nessuno resta davanti', () => {
    const tappe = tappeComanda({ status: 'ritirato', status_times: { ritirato: POI } })
    expect(tappe.every((t) => t.fatta)).toBe(true)
    expect(tappe.at(-1).adesso).toBe(true)
  })

  it('ANNULLATA: tiene gli orari che aveva e si porta in fondo il passo che l’ha chiusa', () => {
    // Fuori dal flusso l'unica prova di essere passati di lì è l'orario
    // segnato: contando i passi, una comanda che al banco c'era stata
    // davvero risulterebbe «mai arrivata».
    const tappe = tappeComanda({
      status: 'annullato',
      status_times: { ricevuto: ORA, in_preparazione: POI, annullato: POI },
    })
    expect(tappe.map((t) => t.stato)).toEqual([
      'ricevuto',
      'in_preparazione',
      'pronto',
      'ritirato',
      'annullato',
    ])
    expect(tappe.filter((t) => t.fatta).map((t) => t.stato)).toEqual([
      'ricevuto',
      'in_preparazione',
      'annullato',
    ])
    expect(tappe.at(-1).adesso).toBe(true)
  })

  it('senza orari non si inventa niente', () => {
    const tappe = tappeComanda({ status: 'ricevuto' })
    expect(tappe.every((t) => t.quando === null)).toBe(true)
    expect(tappeComanda(null).length).toBe(4)
  })
})

// ── CHE NUMERO HA QUESTA COMANDA (BUG-089) ───────────────────────────
//
// Dal 25/08/2026 il numero finisce sulla fascia nera del ticket
// («COMANDA 2 - ORDINE 28»), quindi sbagliarlo si vede al banco.
describe('numeroComanda', () => {
  const conto = {
    daily_number: 28,
    comande: [
      { id: 'c1', seq: 1 },
      { id: 'c2', seq: 2 },
    ],
  }

  it('è il seq della comanda', () => {
    expect(numeroComanda(conto, conto.comande[1])).toBe(2)
  })

  // I documenti vecchi il seq non ce l'hanno: vale la posizione
  // nell'elenco, che è l'ordine in cui sono state battute.
  it('senza seq vale il posto nell’elenco', () => {
    const vecchio = { comande: [{ id: 'a' }, { id: 'b' }] }
    expect(numeroComanda(vecchio, vecchio.comande[1])).toBe(2)
  })

  // IL TICKET UNITO non è nessuna comanda: le contiene tutte. Meglio
  // niente numero che un numero inventato — chi stampa scrive solo il
  // conto.
  it('torna null per una comanda che nel conto non c’è', () => {
    expect(numeroComanda(conto, { id: 'unita' })).toBe(null)
    expect(numeroComanda(conto, null)).toBe(null)
    expect(numeroComanda(null, { id: 'c1' })).toBe(null)
  })
})
