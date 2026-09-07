// @vitest-environment happy-dom
'use strict'

// ── UNA COMANDA ANNULLATA NON ESCE DALLA STAMPANTE (BUG-071) ─────────
//
// «Se alla creazione di un ordine lo annullo anche, la comanda non deve
// uscire se è abilitata la stampa automatica» (l'utente, 21/08/2026).
//
// Al banco: si batte un conto al POS, si cambia idea e lo si annulla
// subito — e il ticket esce lo stesso. Le guardie sembravano esserci
// tutte (`comandeDaStampare` scarta i conti annullati e le comande
// annullate), e infatti il buco era altrove, in due posti:
//
//   1. IL CANCELLO SI APRIVA PRIMA CHE L'ANNULLO ARRIVASSE. Annullando in
//      creazione si torna alla coda, e l'uscita toglie `in_creazione` —
//      che è il cancello della stampa — mentre l'annullo deve ancora
//      leggersi il conto. In quel buco la coda vede un conto composto,
//      aperto e da stampare. Adesso il cancello lo chiude l'annullo
//      stesso, insieme allo stato, in una scrittura sola.
//   2. IL TASTO «COMANDA» A MANO su un conto annullato stampava ancora, e
//      stampava il peggio: `comandaDelTicket` scarta le annullate, non ne
//      trova nessuna, e `printComanda` ripiegava sull'AGGREGATO del conto
//      — tutte le righe di un conto che non si deve fare.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Il database finto: si scrive dentro un oggetto, e la rilettura vede
// l'ultima verità, come farebbe la cache di Firestore.
const stato = { ordine: null, scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: null },
  functions: {},
  storage: {},
}))
vi.mock('firebase/firestore', () => ({
  collection: (_db, nome) => ({ __col: nome }),
  doc: (...args) => {
    if (args.length >= 3) return { col: args[1], id: args[2] }
    if (args.length === 2) return { col: args[0]?.__col || 'orders', id: args[1] }
    return { col: args[0]?.__col || 'payments', id: 'nuovo' }
  },
  getDoc: vi.fn(async (ref) => {
    if (ref?.col && ref.col !== 'orders') return { exists: () => false, data: () => ({}) }
    return { exists: () => !!stato.ordine, id: ref?.id || 'ord-1', data: () => stato.ordine }
  }),
  getDocFromCache: vi.fn(async () => {
    throw new Error('niente cache')
  }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(async () => ({ id: 'x' })),
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async (ref, patch) => {
    stato.scritture.push({ id: ref?.id, patch })
    if (ref?.col === 'orders' || ref?.id === 'ord-1') {
      stato.ordine = { ...stato.ordine, ...patch }
    }
  }),
  deleteDoc: vi.fn(async () => {}),
  query: () => ({}),
  where: () => ({}),
  documentId: () => 'id',
  orderBy: () => ({}),
  limit: () => ({}),
  onSnapshot: () => () => {},
  serverTimestamp: () => null,
  increment: (n) => n,
  writeBatch: () => ({ update: vi.fn(), set: vi.fn(), commit: async () => {} }),
  Timestamp: class Timestamp {
    static fromDate(d) {
      return d
    }
    static fromMillis(m) {
      return m
    }
  },
}))

const { cancelOrder } = await import('../../src/lib/api.js')
const { comandeDaStampare, printComanda, printComandaUnita, lavoroAnnullato } = await import(
  '../../src/lib/printer.js'
)
const { _azzeraMutazioni } = await import('../../src/lib/mutazioniOrdine.js')

const respira = () => new Promise((r) => setTimeout(r, 0))

// Il conto appena battuto al POS: una comanda al banco, e il segno della
// composizione ancora addosso.
const contoAppenaBattuto = () => ({
  status: 'aperto',
  payment_status: 'non_richiesto',
  daily_number: 7,
  total: 15,
  in_creazione: true,
  order_items: [{ drink_id: 'gin', name: 'Gin Tonic', qty: 1, unit_price: 8 }],
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: 'ricevuto',
      status_times: {},
      inventory_applied: false,
      items: [{ drink_id: 'gin', name: 'Gin Tonic', qty: 1, unit_price: 8 }],
    },
  ],
})

// Il conto come lo vede la coda: `status` dal documento, e basta — è
// quello che arriva a `comandeDaStampare`.
const comeLoVedeLaCoda = () => ({ id: 'ord-1', ...stato.ordine })

// ── LA CARTA FINTA: ogni lavoro apre la sua finestra col facsimile.
// Contarle è l'unico modo di dire «non è uscito niente».
let finestre

beforeEach(() => {
  // LA MEMORIA DEL TERMINALE SI AZZERA FRA UNA PROVA E L'ALTRA: un conto
  // annullato resta annullato in locale finché la cache non conferma
  // (lib/mutazioniOrdine.js), e qui la cache non conferma mai — senza
  // questo, la seconda prova troverebbe il conto della prima già chiuso e
  // non scriverebbe niente.
  _azzeraMutazioni()
  stato.ordine = contoAppenaBattuto()
  stato.scritture = []
  localStorage.clear()
  finestre = []
  window.open = vi.fn(() => {
    finestre.push([])
    return { document: { write: () => {}, close: () => {} }, focus: () => {} }
  })
})

describe('annullando in creazione la comanda non esce', () => {
  // IL CANCELLO E LO STATO NELLA STESSA SCRITTURA. Finché sono due, fra
  // l'una e l'altra c'è un conto composto, aperto e da stampare — e la
  // stampa automatica non aspetta nessuno.
  it('l’annullo chiude anche la composizione, in un colpo solo', async () => {
    await cancelOrder('ord-1', { by: 'bartender' })
    await respira()
    const annullo = stato.scritture.find((w) => w.patch.status === 'annullato')
    expect(annullo, 'l’annullo non è stato scritto').toBeTruthy()
    expect(annullo.patch.in_creazione).toBe(false)
  })

  // La prova che conta: in NESSUN momento della sequenza la coda trova
  // qualcosa da stampare. Prima si guarda il conto com'è adesso (in
  // creazione: cancello chiuso), poi dopo l'annullo.
  it('in nessun momento la coda trova qualcosa da stampare', async () => {
    expect(comandeDaStampare(comeLoVedeLaCoda())).toHaveLength(0)
    await cancelOrder('ord-1', { by: 'bartender' })
    await respira()
    expect(comandeDaStampare(comeLoVedeLaCoda())).toHaveLength(0)
    // E la comanda è annullata anche lei: non è solo il conto a dirlo.
    expect(stato.ordine.comande[0].status).toBe('annullato')
  })

  // Il contrario, per non provare il nulla: senza annullo, uscendo dalla
  // creazione la comanda esce eccome. Se un giorno questa diventa rossa la
  // stampa automatica si è spenta, e l'altra prova non direbbe niente.
  it('senza annullo invece la comanda esce', () => {
    expect(comandeDaStampare({ ...comeLoVedeLaCoda(), in_creazione: false })).toHaveLength(1)
  })
})

describe('un conto annullato non stampa, da nessuna strada', () => {
  const annullato = () => ({
    id: 'ord-1',
    status: 'annullato',
    daily_number: 7,
    order_items: [{ drink_id: 'gin', name: 'Gin Tonic', qty: 1, unit_price: 8 }],
    comande: [
      { id: 'c1', status: 'annullato', items: [{ name: 'Gin Tonic', qty: 1, unit_price: 8 }] },
    ],
  })

  // IL DIFETTO PRECISO: il tasto «Comanda» della coda su un conto
  // annullato faceva uscire l'AGGREGATO del conto — tutte le righe di un
  // lavoro che non si deve fare.
  it('il tasto «Comanda» a mano non fa uscire niente', async () => {
    await printComanda(annullato())
    expect(finestre).toHaveLength(0)
  })

  it('nemmeno «tutto su una ricevuta sola»', async () => {
    await printComandaUnita(annullato())
    expect(finestre).toHaveLength(0)
  })

  // Chi guarda il conto da una vista della coda ha `workflow_status` al
  // posto di `status`: annullato è annullato da qualunque parte lo si
  // guardi, e la guardia non deve dipendere da chi l'ha chiamata.
  it('anche quando l’annullo si legge da workflow_status', async () => {
    const daCorsia = { ...annullato(), status: 'aperto', workflow_status: 'annullato' }
    expect(lavoroAnnullato(daCorsia)).toBe(true)
    expect(comandeDaStampare(daCorsia)).toHaveLength(0)
    await printComanda(daCorsia)
    expect(finestre).toHaveLength(0)
  })

  // La singola comanda annullata dentro un conto ancora aperto: quella
  // riga di lavoro non si fa più, le altre sì.
  it('la comanda annullata di un conto aperto resta fuori, le altre no', async () => {
    const conto = {
      id: 'ord-1',
      status: 'aperto',
      daily_number: 7,
      comande: [
        { id: 'c1', status: 'annullato', items: [{ name: 'Gin Tonic', qty: 1, unit_price: 8 }] },
        { id: 'c2', status: 'ricevuto', items: [{ name: 'Mojito', qty: 1, unit_price: 7 }] },
      ],
    }
    expect(comandeDaStampare(conto).map((c) => c.id)).toEqual(['c2'])
    await printComanda(conto, conto.comande[0])
    expect(finestre).toHaveLength(0)
    await printComanda(conto, conto.comande[1])
    expect(finestre).toHaveLength(1)
  })
})
