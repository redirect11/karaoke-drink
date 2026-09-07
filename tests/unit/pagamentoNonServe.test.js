// @vitest-environment happy-dom
'use strict'

// INCASSARE NON VUOL DIRE AVER SERVITO.
//
// Difetto visto al banco: si segnava pagato un ordine e alcune comande
// ancora IN PREPARAZIONE risultavano servite. Due danni, tutti e due
// silenziosi: quei drink sparivano dagli occhi di chi doveva prepararli, e
// il magazzino veniva scaricato per roba mai uscita.
//
// Con gli stati del servizio ACCESI il pagamento non può portare avanti nel
// flusso una comanda che sta a «da fare», «in preparazione» o «pronto»:
// quei drink vanno fatti lo stesso. Pagare in anticipo è normale — il conto
// resta aperto finché non esce tutto.
//
// Senza gli stati del servizio non cambia niente: lì i passi non esistono e
// il pagamento chiude, come ha sempre fatto.
//
// Qui si prova la STRADA, non solo la regola: si guarda cosa viene scritto
// davvero sul documento dell'ordine, comanda per comanda.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const stato = { ordine: null, scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: null },
  functions: {},
  storage: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db, nome) => ({ __col: nome }),
  // `doc` si chiama in due modi: con la collezione per nome (db, 'orders',
  // id) e con l'oggetto collezione già in mano (ordersCol, id). Il secondo
  // è quello del pagamento di gruppo, ed è proprio la strada in prova qui.
  doc: (...args) => {
    if (args.length >= 3) return { col: args[1], id: args[2] }
    if (args.length === 2) return { col: args[0]?.__col || 'orders', id: args[1] }
    return { col: args[0]?.__col || 'payments', id: 'nuovo' }
  },
  getDoc: vi.fn(async (ref) => {
    if (ref?.col && ref.col !== 'orders') {
      return { exists: () => false, data: () => ({}) }
    }
    return { exists: () => !!stato.ordine, id: ref?.id || 'ord-1', data: () => stato.ordine }
  }),
  getDocFromCache: vi.fn(async () => {
    throw new Error('niente cache')
  }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(async () => ({ id: 'p1' })),
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async (ref, patch) => {
    stato.scritture.push({ id: ref?.id || 'ord-1', patch })
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

const { registerPayment, markOrderPaid, payGroupCash } = await import('../../src/lib/api.js')
const { _azzeraMutazioni } = await import('../../src/lib/mutazioniOrdine.js')

// Un conto con dentro tutto quello che può capitare: una comanda servita e
// tre ancora da fare, ognuna a un passo diverso.
const contoMisto = (extra = {}) => ({
  status: 'aperto',
  payment_status: 'non_richiesto',
  daily_number: 7,
  total: 40,
  discount_amount: 0,
  payments: [],
  created_at: '2026-08-18T20:00:00.000Z',
  items: [],
  comande: [
    { id: 'c1', seq: 1, status: 'ritirato', items: [], inventory_applied: true },
    { id: 'c2', seq: 2, status: 'ricevuto', items: [] },
    { id: 'c3', seq: 3, status: 'in_preparazione', items: [] },
    { id: 'c4', seq: 4, status: 'pronto', items: [] },
  ],
  ...extra,
})

// Le comande come sono state scritte sul documento, dopo il pagamento.
const scritte = (id = 'ord-1') => {
  const patch = stato.scritture.filter((s) => s.id === id && s.patch.comande).at(-1)
  return patch ? Object.fromEntries(patch.patch.comande.map((c) => [c.id, c.status])) : null
}

// Un tick perché le scritture in sottofondo (bgWrite) partano.
const respira = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  // LA MEMORIA DEL TERMINALE SI AZZERA FRA UNA PROVA E L'ALTRA. Le mutazioni
  // di un conto si ricordano quello che hanno appena composto, finché la
  // cache non lo conferma (lib/mutazioniOrdine.js) — e qui la cache non
  // conferma MAI, apposta: senza questo, la prova dopo comporrebbe sul conto
  // della prova prima.
  _azzeraMutazioni()
  stato.ordine = contoMisto()
  stato.scritture = []
})

describe('il pagamento non chiude le comande che nessuno ha servito', () => {
  it('conto singolo: chi era in preparazione ci resta, e il conto NON si chiude', async () => {
    await markOrderPaid('ord-1', 'banco', { autoServe: false })
    await respira()
    const patch = stato.scritture.at(-1).patch
    expect(patch.payment_status).toBe('pagato')
    // il conto resta APERTO: c'è ancora roba da consegnare
    expect(patch.status).toBeUndefined()
    expect(patch.comande).toBeUndefined()
  })

  it('IL DIFETTO: la spunta non l’ha toccata nessuno, ma le comande risultavano servite', async () => {
    // Il colpevole era il valore di partenza: chi chiamava senza dire
    // niente otteneva «servi tutto». Adesso, non dicendo niente, il
    // pagamento non tocca il servizio — sbagliare in questo verso lascia un
    // conto aperto (si chiude), sbagliare nell'altro serve drink mai
    // usciti e scarica il magazzino (non si torna indietro).
    await markOrderPaid('ord-1', 'banco')
    await respira()
    expect(scritte()).toBe(null)
  })

  it('SERVIRE È UN GESTO ESPLICITO: «Riscuoti e servi» chiude tutto, e solo lui', async () => {
    await markOrderPaid('ord-1', 'banco', { autoServe: true })
    await respira()
    expect(scritte()).toEqual({
      c1: 'ritirato',
      c2: 'ritirato',
      c3: 'ritirato',
      c4: 'ritirato',
    })
  })

  it('acconto e saldo: nemmeno l’ultimo pagamento serve le comande', async () => {
    await registerPayment('ord-1', { amount: 40, method: 'banco', autoServe: false })
    await respira()
    const patch = stato.scritture.at(-1).patch
    expect(patch.payment_status).toBe('pagato')
    expect(patch.comande).toBeUndefined()
  })

  it('PAGAMENTO DI GRUPPO: era la strada aperta, e serviva tutto senza chiedere niente', async () => {
    // Un tavolo di sei che paga insieme mentre due giri sono ancora al
    // banco: quelli sparivano dalla coda già «serviti».
    await payGroupCash({ orderIds: ['ord-1'], method: 'banco' })
    await respira()
    const patch = stato.scritture.find((s) => s.patch.payment_status === 'pagato')?.patch
    expect(patch.payment_status).toBe('pagato')
    // il conto non si chiude e le comande restano dove sono
    expect(patch.status).toBeUndefined()
    expect(patch.comande).toBeUndefined()
  })

  it('gruppo con tutto già servito: si chiude, che non c’è più niente da fare', async () => {
    stato.ordine = contoMisto({
      comande: [{ id: 'c1', seq: 1, status: 'ritirato', items: [], inventory_applied: true }],
    })
    await payGroupCash({ orderIds: ['ord-1'], method: 'banco' })
    await respira()
    const patch = stato.scritture.find((s) => s.patch.payment_status === 'pagato')?.patch
    expect(patch.status).toBe('pagato')
  })

  it('SENZA STATI DI SERVIZIO non cambia niente: il pagamento chiude', async () => {
    // Lì i passi non esistono, le comande nascono e restano dove sono, e
    // «pagato» è l'unica cosa che vuol dire «finito».
    await markOrderPaid('ord-1', 'banco', { autoServe: true })
    await respira()
    const patch = stato.scritture.at(-1).patch
    expect(patch.status).toBe('pagato')
  })
})
