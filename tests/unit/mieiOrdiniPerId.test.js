// @vitest-environment happy-dom
'use strict'

// ── «I MIEI ORDINI» SI CHIEDONO UNO PER ID, NON IN BLOCCO (BUG-093) ──
//
// Il cliente che ordina senza registrarsi tiene gli id dei suoi conti nel
// telefono (cart.js) e poi li va a riprendere. Prima li chiedeva tutti
// insieme, con una query su `documentId() in [...]` spezzata in blocchi da
// 30 — e quella query è un `list`.
//
// Da BUG-093 il `list` sugli ordini passa solo dove la domanda si dimostra
// sicura da sé, e «solo questi id» non è una domanda che una regola sappia
// riconoscere: la lista tornava un permission-denied e la schermata restava
// vuota. Il `get` per id invece resta aperto — è il modello che regge il
// link del conto — quindi si fanno N letture singole.
//
// QUI SI PROVA CHE LA STRADA È CAMBIATA E IL RISULTATO NO: si mocka SOLO
// Firestore (non `src/lib/api.js`, se no si proverebbe il mock), e ogni
// query di collezione risponde come risponderebbe il server con le regole
// nuove — con un rifiuto. Se il codice tornasse a fare una lista, questo
// test lo vede subito.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const archivio = new Map()
const contatori = { getDoc: 0, getDocs: 0 }
// Id per cui la lettura non risponde: è il conto che la cache non ha e la
// rete non può andare a prendere.
const irraggiungibili = new Set()

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: null },
  functions: {},
  storage: {},
}))

const leggi = async (ref) => {
  contatori.getDoc += 1
  if (irraggiungibili.has(ref?.id)) throw new Error('client is offline')
  const dato = archivio.get(ref?.id)
  return { exists: () => !!dato, id: ref?.id, data: () => dato }
}

vi.mock('firebase/firestore', () => ({
  collection: (_db, nome) => ({ __col: nome }),
  doc: (...args) => {
    if (args.length >= 3) return { col: args[1], id: args[2] }
    if (args.length === 2) return { col: args[0]?.__col || 'x', id: args[1] }
    return { col: args[0]?.__col || 'x', id: 'id-nuovo' }
  },
  getDoc: vi.fn(leggi),
  getDocFromCache: vi.fn(leggi),
  // LE REGOLE NUOVE DICONO NO a una lista che non si sa dimostrare: è
  // esattamente quello che tornerebbe il server.
  getDocs: vi.fn(async () => {
    contatori.getDocs += 1
    const e = new Error('Missing or insufficient permissions.')
    e.code = 'permission-denied'
    throw e
  }),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(() => new Promise(() => {})),
  setDoc: vi.fn(() => new Promise(() => {})),
  updateDoc: vi.fn(() => new Promise(() => {})),
  deleteDoc: vi.fn(() => new Promise(() => {})),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  onSnapshot: () => () => {},
  serverTimestamp: () => null,
  increment: (n) => ({ __increment: n }),
  writeBatch: () => ({ update: vi.fn(), set: vi.fn(), commit: () => new Promise(() => {}) }),
  Timestamp: class Timestamp {
    static fromDate(d) { return d }
    static fromMillis(m) { return m }
  },
}))

const { fetchOrdersByIds } = await import('../../src/lib/api.js')

function conto(numero, quando) {
  return {
    daily_number: numero,
    status: 'aperto',
    comande: [{ id: `c${numero}`, seq: 1, status: 'ricevuto', items: [] }],
    comande_statuses: ['ricevuto'],
    total: numero,
    items: [],
    created_at: quando,
  }
}

beforeEach(() => {
  archivio.clear()
  irraggiungibili.clear()
  contatori.getDoc = 0
  contatori.getDocs = 0
  archivio.set('ord-1', conto(1, '2026-08-26T20:00:00.000Z'))
  archivio.set('ord-2', conto(2, '2026-08-26T21:00:00.000Z'))
  archivio.set('ord-3', conto(3, '2026-08-26T22:00:00.000Z'))
})

describe('i conti del telefono si riprendono per id', () => {
  it('li legge uno per uno, senza mai chiedere una lista', async () => {
    const ordini = await fetchOrdersByIds(['ord-1', 'ord-2', 'ord-3'])
    expect(ordini.map((o) => o.id)).toEqual(['ord-3', 'ord-2', 'ord-1'])
    expect(contatori.getDoc).toBe(3)
    expect(contatori.getDocs).toBe(0)
  })

  // Ordinamento e contenuto sono quelli di prima: più recenti in cima,
  // qualunque sia l'ordine in cui il telefono si è segnato gli id.
  it('i più recenti restano in cima', async () => {
    const ordini = await fetchOrdersByIds(['ord-2', 'ord-3', 'ord-1'])
    expect(ordini.map((o) => o.daily_number)).toEqual([3, 2, 1])
  })

  it('un id che non esiste più semplicemente non compare', async () => {
    const ordini = await fetchOrdersByIds(['ord-1', 'sparito', 'ord-2'])
    expect(ordini.map((o) => o.id)).toEqual(['ord-2', 'ord-1'])
  })

  // Lo stesso id due volte tornava un conto solo anche prima: il telefono
  // non dovrebbe ripeterli, ma la lista non deve sdoppiarsi se succede.
  it('un id ripetuto non sdoppia il conto', async () => {
    const ordini = await fetchOrdersByIds(['ord-1', 'ord-1'])
    expect(ordini.map((o) => o.id)).toEqual(['ord-1'])
    expect(contatori.getDoc).toBe(1)
  })

  it('la lista vuota non chiede niente a nessuno', async () => {
    expect(await fetchOrdersByIds([])).toEqual([])
    expect(await fetchOrdersByIds(null)).toEqual([])
    expect(contatori.getDoc).toBe(0)
  })

  // SENZA RETE la query tornava quello che la cache aveva, non un errore:
  // un conto che non risponde non deve azzerare gli altri.
  it('un conto che non risponde non porta via la lista', async () => {
    irraggiungibili.add('ord-2')
    const ordini = await fetchOrdersByIds(['ord-1', 'ord-2', 'ord-3'])
    expect(ordini.map((o) => o.id)).toEqual(['ord-3', 'ord-1'])
  })
})
