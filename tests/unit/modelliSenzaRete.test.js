// @vitest-environment happy-dom
'use strict'

// ── SALVARE UN MODELLO CON LA RETE STACCATA (REQ-MAG-039) ────────────
//
// Il local-first è la prima regola, e vale anche per un gesto piccolo: un
// modello si salva mentre si compone un ordine, col locale aperto, e deve
// comparire in tendina nell'istante in cui si tocca «Salva». Un `await` su
// una scrittura Firestore offline non torna mai.
//
// COM'È FATTO QUESTO TEST: si mocka SOLO Firestore, non `src/lib/api.js` — se
// no si proverebbe il mock e non il codice. Ogni scrittura resta appesa per
// sempre e ogni lettura risponde con quello che c'era PRIMA, che è quello che
// fa davvero una cache mentre la scrittura è in coda. È il modello di
// `tests/unit/giroInLocale.test.js`.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {})
const stato = { scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
  functions: {},
  storage: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db, nome) => ({ __col: nome }),
  doc: (...args) => {
    if (args.length >= 3) return { col: args[1], id: args[2] }
    if (args.length === 2) return { col: args[0]?.__col || 'x', id: args[1] }
    return { col: args[0]?.__col || 'x', id: 'id-nuovo' }
  },
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocFromCache: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(() => mai()),
  setDoc: vi.fn((ref, data) => {
    stato.scritture.push({ tipo: 'set', col: ref?.col, id: ref?.id, data })
    return mai()
  }),
  updateDoc: vi.fn(() => mai()),
  deleteDoc: vi.fn((ref) => {
    stato.scritture.push({ tipo: 'delete', col: ref?.col, id: ref?.id })
    return mai()
  }),
  query: () => ({}),
  where: () => ({}),
  documentId: () => 'id',
  orderBy: () => ({}),
  limit: () => ({}),
  onSnapshot: () => () => {},
  serverTimestamp: () => null,
  increment: (n) => ({ __increment: n }),
  writeBatch: () => ({ update: vi.fn(), set: vi.fn(), commit: () => mai() }),
  Timestamp: class Timestamp {
    static fromDate(d) {
      return d
    }
    static fromMillis(m) {
      return m
    }
  },
}))

const api = await import('../../src/lib/api.js')

// La scrittura parte in sottofondo, cioè al giro dopo. Il RISULTATO invece si
// vede subito, ed è il punto di tutto questo file.
const giro = () => new Promise((r) => setTimeout(r, 0))
const scritture = (col) => stato.scritture.filter((s) => s.col === col)

const RIGHE = [
  { item_id: 'campari', item_name: 'Campari', supplier_id: 'nova', qty: 2 },
  { item_id: 'gin', item_name: 'Gin Mare', supplier_id: 'enofel', qty: 1 },
]

beforeEach(() => {
  stato.scritture = []
})

describe('un modello si salva senza aspettare niente', () => {
  it('torna già composto, con id e nome, e la scrittura parte dopo', async () => {
    const m = api.salvaModelloOrdine({ nome: '  Giro della settimana  ', righe: RIGHE })
    expect(m.id).toBeTruthy()
    // Il nome si ripulisce: in tendina uno spazio davanti non si vede e
    // manda in fondo all'ordinamento.
    expect(m.nome).toBe('Giro della settimana')
    expect(m.righe).toHaveLength(2)
    expect(m.created_at).toBeTruthy()
    await giro()
    expect(scritture('purchase_order_templates')).toHaveLength(1)
  })

  // LA REGOLA CHE NON SI TOCCA: nel documento non ci finisce nessun prezzo.
  // «Il modello non memorizza il prezzo»: il prezzo arriva dal listino nel
  // momento in cui si compone l'ordine, e il listino lo allinea la fattura.
  it('sul documento non finisce nessun prezzo', async () => {
    api.salvaModelloOrdine({
      nome: 'Inizio mese',
      righe: [
        {
          item_id: 'campari',
          item_name: 'Campari',
          supplier_id: 'nova',
          qty: 2,
          prezzo: 25.05,
          unit_cost: 1.04,
          totale: 50.1,
        },
      ],
    })
    await giro()
    const riga = scritture('purchase_order_templates')[0].data.righe[0]
    expect(Object.keys(riga).sort()).toEqual(['item_id', 'item_name', 'qty', 'supplier_id'])
  })

  it('un modello senza nome non si salva, e lo dice', () => {
    expect(() => api.salvaModelloOrdine({ nome: '   ', righe: RIGHE })).toThrow(/nome/i)
  })

  // Aggiornare è la stessa strada, e serve sia a cambiargli le righe sia a
  // rinominarlo: si scrive sullo stesso documento invece di lasciarne due.
  it('con l’id di uno che c’è già si scrive sullo stesso documento', async () => {
    const m = api.salvaModelloOrdine({ id: 'mod-1', nome: 'Rinominato', righe: RIGHE })
    expect(m.id).toBe('mod-1')
    await giro()
    const scritta = scritture('purchase_order_templates')[0]
    expect(scritta.id).toBe('mod-1')
    // La data di nascita non si riscrive: è già sul documento, e il `merge`
    // la lascia dov'è.
    expect(scritta.data.created_at).toBeUndefined()
    expect(scritta.data.updated_at).toBeTruthy()
  })

  it('eliminare non aspetta la rete', async () => {
    api.eliminaModelloOrdine('mod-1')
    await giro()
    expect(scritture('purchase_order_templates')[0]).toMatchObject({
      tipo: 'delete',
      id: 'mod-1',
    })
  })
})
