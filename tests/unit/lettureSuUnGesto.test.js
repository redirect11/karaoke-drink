// @vitest-environment happy-dom
'use strict'

// UN TOCCO SU UNA CARD, UNA LETTURA SOLA.
//
// `advanceComanda`, `preparazioneParziale` e `setOrderServiceMode`
// rileggevano il conto DOPO aver scritto, solo per restituirlo — e nessuno
// dei loro chiamanti (verificati tutti e otto: OrderPosDetail, ComandaPage,
// BartenderPage, ServiceQueue, OrderStatusPage) guardava quel valore: gli
// interessa l'eventuale errore, e la schermata si e' gia' aggiornata da
// sola. Ogni tocco costava cosi' due letture dello stesso documento invece
// di una, piu' una normalizzazione intera buttata via: con ~150 comande a
// sera fanno ~450 letture a vuoto, tutte dentro il percorso di un gesto.
//
// Qui si conta. Se un domani qualcuno rimette una rilettura «per restituire
// l'ordine», questo test glielo dice prima che lo faccia il banco.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const stato = { ordine: null, letture: 0, scritture: [] }

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
      stato.letture += 1
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
    stato.scritture.push({ id: ref?.id, patch })
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

const { advanceComanda, preparazioneParziale, setOrderServiceMode } = await import(
  '../../src/lib/api.js'
)
const { _azzeraMutazioni } = await import('../../src/lib/mutazioniOrdine.js')

const conto = () => ({
  status: 'aperto',
  payment_status: 'non_richiesto',
  daily_number: 7,
  total: 16,
  service_mode: 'tavolo',
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: 'ricevuto',
      status_times: { ricevuto: '2026-08-19T20:00:00.000Z' },
      created_at: '2026-08-19T20:00:00.000Z',
      inventory_applied: false,
      items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 8, qty: 2 }],
    },
  ],
  items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 8, qty: 2 }],
})

// Le scritture partono in sottofondo: si lascia respirare la coda dei
// microtask, cosi' quello che deve arrivare arriva.
const respira = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  // LA MEMORIA DEL TERMINALE SI AZZERA FRA UNA PROVA E L'ALTRA. Le mutazioni
  // di un conto si ricordano quello che hanno appena composto, finché la
  // cache non lo conferma (lib/mutazioniOrdine.js) — e qui la cache non
  // conferma MAI, apposta: senza questo, la prova dopo comporrebbe sul conto
  // della prova prima.
  _azzeraMutazioni()
  stato.ordine = conto()
  stato.letture = 0
  stato.scritture = []
})

describe('un gesto sulla card costa una lettura sola', () => {
  it('avanzare una comanda: si legge una volta, si scrive una volta', async () => {
    await advanceComanda('ord-1', 'c1', 'in_preparazione')
    await respira()
    expect(stato.letture).toBe(1)
    expect(stato.scritture[0].patch.comande[0].status).toBe('in_preparazione')
  })

  it('e non restituisce l’ordine: chi tocca la card guarda solo l’errore', async () => {
    // Restituirlo voleva dire rileggerlo. Nessuno dei chiamanti lo usa, e la
    // schermata si e' gia' aggiornata con la copia locale.
    await expect(advanceComanda('ord-1', 'c1', 'pronto')).resolves.toBeUndefined()
  })

  it('cambiare il modo di consegna: una lettura, e i supplementi rifatti', async () => {
    await expect(setOrderServiceMode('ord-1', 'banco')).resolves.toBeUndefined()
    await respira()
    expect(stato.letture).toBe(1)
    expect(stato.scritture[0].patch.service_mode).toBe('banco')
  })

  it('dividere una comanda: una lettura, e le due parti scritte insieme', async () => {
    await expect(preparazioneParziale('ord-1', 'c1', [1])).resolves.toBeUndefined()
    await respira()
    expect(stato.letture).toBe(1)
    const comande = stato.scritture[0].patch.comande
    expect(comande.map((c) => c.status)).toEqual(['annullato', 'in_preparazione', 'ricevuto'])
  })

  it('prese tutte le unita’ non si divide niente: la comanda avanza e basta', async () => {
    // Passa da preparazioneParziale ad advanceComanda: una lettura a testa,
    // due in tutto — non quattro come quando ognuna si rileggeva l'esito.
    await preparazioneParziale('ord-1', 'c1', [2])
    await respira()
    expect(stato.letture).toBe(2)
    expect(stato.scritture[0].patch.comande[0].status).toBe('in_preparazione')
  })

  it('un errore arriva lo stesso a chi ha toccato la card', async () => {
    stato.ordine = null
    await expect(advanceComanda('ord-1', 'c1', 'pronto')).rejects.toThrow(/Ordine non trovato/)
  })
})
