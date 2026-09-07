// @vitest-environment happy-dom
'use strict'

// I SOLDI DI UN CONTO SI RIFANNO SEMPRE ALLO STESSO MODO.
//
// Quattro gesti riscrivono le comande di un conto aperto — la modifica del
// cliente, l'aggiunta al conto, la divisione di una comanda, la modifica dal
// banco — e ognuno dei quattro rifa' il totale: aggrega le righe, ci somma
// coperto, costo di servizio e mancia, e ricalcola lo sconto con la
// strategia scelta.
//
// Quelle cinque righe erano scritte quattro volte. Bastava che una restasse
// indietro perche' lo stesso conto valesse due cifre diverse a seconda del
// gesto che l'aveva toccato — e a scoprirlo sarebbe stato chi paga. Adesso
// sono una funzione sola, e queste prove tengono i quattro gesti sulla
// stessa riga: se domani se ne aggiunge un quinto, si aggiunge qui.

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
  doc: (...args) => {
    if (args.length >= 3) return { col: args[1], id: args[2] }
    if (args.length === 2) return { col: args[0]?.__col || 'orders', id: args[1] }
    return { col: args[0]?.__col || 'payments', id: 'nuovo' }
  },
  getDoc: vi.fn(async (ref) => {
    if (ref?.col === 'orders') {
      return { exists: () => !!stato.ordine, id: ref.id, data: () => stato.ordine }
    }
    return { exists: () => false, data: () => ({}) }
  }),
  getDocFromCache: vi.fn(async () => {
    throw new Error('niente cache')
  }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(async () => ({ id: 'x' })),
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async (ref, patch) => {
    stato.scritture.push(patch)
    if (ref?.col === 'orders') stato.ordine = { ...stato.ordine, ...patch }
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

const { updateOrderItems, addComanda, preparazioneParziale, bartenderUpdateComanda } =
  await import('../../src/lib/api.js')
const { _azzeraMutazioni } = await import('../../src/lib/mutazioniOrdine.js')

const mojito = (qty = 2) => ({ drink_id: 'mojito', name: 'Mojito', unit_price: 8, qty })

// Un conto con i supplementi accesi: coperto 4, servizio 2, mancia 1 — sono
// i numeri che una copia rimasta indietro dimenticherebbe.
const conto = (comande) => ({
  status: 'aperto',
  payment_status: 'non_richiesto',
  daily_number: 7,
  coperto_amount: 4,
  service_charge_amount: 2,
  tip_amount: 1,
  total: 23,
  items: [mojito(2)],
  comande,
})

const unaComanda = (extra = {}) => [
  {
    id: 'c1',
    seq: 1,
    status: 'ricevuto',
    status_times: { ricevuto: '2026-08-19T20:00:00.000Z' },
    created_at: '2026-08-19T20:00:00.000Z',
    inventory_applied: false,
    items: [mojito(2)],
    ...extra,
  },
]

const respira = () => new Promise((r) => setTimeout(r, 0))
const ultima = () => stato.scritture[stato.scritture.length - 1]

beforeEach(() => {
  // LA MEMORIA DEL TERMINALE SI AZZERA FRA UNA PROVA E L'ALTRA. Le mutazioni
  // di un conto si ricordano quello che hanno appena composto, finché la
  // cache non lo conferma (lib/mutazioniOrdine.js) — e qui la cache non
  // conferma MAI, apposta: senza questo, la prova dopo comporrebbe sul conto
  // della prova prima.
  _azzeraMutazioni()
  stato.ordine = conto(unaComanda())
  stato.scritture = []
})

describe('i quattro gesti rifanno il totale allo stesso modo', () => {
  it('la modifica del cliente: righe nuove, e i supplementi ci sono ancora', async () => {
    await updateOrderItems('ord-1', [mojito(3)])
    await respira()
    // 3 × 8 = 24, più coperto 4 + servizio 2 + mancia 1.
    expect(ultima().total).toBe(31)
  })

  it('l’aggiunta al conto: la comanda nuova entra nel totale', async () => {
    await addComanda('ord-1', [{ drink_id: 'gin', name: 'Gin tonic', unit_price: 9, qty: 1 }])
    await respira()
    // 2 × 8 + 9 = 25, più i 7 di supplementi.
    expect(ultima().total).toBe(32)
    expect(ultima().items).toHaveLength(2)
  })

  it('la modifica dal banco: stessa regola, stesso risultato', async () => {
    stato.ordine = conto(unaComanda({ status: 'in_preparazione' }))
    await bartenderUpdateComanda('ord-1', 'c1', { items: [mojito(1)] })
    await respira()
    expect(ultima().total).toBe(15)
  })

  it('dividere una comanda non cambia il totale di un centesimo', async () => {
    // Le stesse unità stanno in due ticket invece che in uno: il conto è
    // quello di prima. Se qui il totale si muove, qualcuno paga di più.
    await preparazioneParziale('ord-1', 'c1', [1])
    await respira()
    expect(ultima().total).toBe(23)
    // La comanda annullata per divisione non conta: sono i figli a portare
    // le righe.
    expect(ultima().items).toEqual([expect.objectContaining({ drink_id: 'mojito', qty: 2 })])
  })
})

describe('lo sconto segue il conto, con la strategia scelta', () => {
  it('lo sconto a percentuale si rifà sul totale nuovo, in tutti e quattro', async () => {
    stato.ordine = { ...conto(unaComanda()), discount: { type: 'percent', value: 10 }, discount_amount: 2.3 }
    await addComanda('ord-1', [{ drink_id: 'gin', name: 'Gin tonic', unit_price: 9, qty: 1 }])
    await respira()
    // 10% di 32.
    expect(ultima().discount_amount).toBeCloseTo(3.2, 2)
  })

  it('senza sconto non si scrive nessun campo sconto', async () => {
    // Scrivere `discount_amount: 0` su un conto che non ne ha mai avuto uno
    // vorrebbe dire far comparire uno sconto da nessuna parte.
    await addComanda('ord-1', [{ drink_id: 'gin', name: 'Gin tonic', unit_price: 9, qty: 1 }])
    await respira()
    expect('discount_amount' in ultima()).toBe(false)
  })
})

describe('le righe del cliente non si fondono fra loro', () => {
  it('due righe dello stesso drink restano due righe', async () => {
    // L'aggregato del conto fonde due righe dello stesso drink: qui no,
    // perché sono le righe che il cliente ha battuto — con le loro note e i
    // loro prezzi — e fonderle le farebbe sparire.
    await updateOrderItems('ord-1', [
      { ...mojito(1), line_id: 'r1' },
      { ...mojito(1), line_id: 'r2', note: 'senza ghiaccio' },
    ])
    await respira()
    expect(ultima().items).toHaveLength(2)
    expect(ultima().items[1].note).toBe('senza ghiaccio')
    expect(ultima().total).toBe(23)
  })
})
