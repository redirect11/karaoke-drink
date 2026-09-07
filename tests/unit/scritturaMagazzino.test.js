// @vitest-environment happy-dom
'use strict'

// IL MAGAZZINO SI SCRIVE DA UNA PORTA SOLA (BUG-029).
//
// In LETTURA il modello vecchio si legge con tolleranza — `articoloNormalizzato`,
// applicato in un punto solo — e a schermo tutto risulta già a pezzi. In
// SCRITTURA no: si rilegge il documento com'è scritto sul database, e sommare
// pezzi a una giacenza ancora in centilitri dà un numero senza senso. Un
// numero storto in magazzino sembra plausibile a chi lo legge: «47» di limoni
// non ha niente di strano, giusto o sbagliato che sia.
//
// Il controllo «prima va aggiornato il magazzino» era stato copiato a mano in
// due casi su sette. Ce l'avevano il carico e la rettifica; non ce l'avevano
// `receiveBottles`, la consegna di un ordine fornitore, l'allineamento della conta e lo
// scarico delle comande — e il buco concreto era Acquisti → «ricevuto», che
// scriveva su un magazzino non ancora aggiornato perché il blocco viveva
// dentro la schermata del magazzino.
//
// Qui si prova ogni strada, una per una. Finché è una riga da ricopiare, ogni
// percorso nuovo nasce senza.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// I documenti come stanno sul database: `vecchio` è ancora in centilitri.
const vecchio = {
  name: 'Gin',
  unit: 'cl',
  stock: 350,
  package_size: 70,
  low_threshold: 0,
  kind: 'scorta',
}
const nuovo = {
  name: 'Gin',
  unit: 'pz',
  stock: 5,
  // Il contenuto si scrive in unità BASE (ml, g): è la regola del magazzino,
  // «4 cl» non deve mai diventare 4 pezzi.
  package_size: 700,
  content_unit: 'ml',
  low_threshold: 0,
  kind: 'scorta',
}

const stato = { articolo: nuovo, scritture: [] }

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
    return { col: args[0]?.__col || 'x', id: 'nuovo' }
  },
  getDoc: vi.fn(async (ref) => {
    if (ref?.col === 'inventory_items') {
      return { exists: () => true, id: ref.id, data: () => stato.articolo }
    }
    if (ref?.col === 'purchase_orders') {
      return {
        exists: () => true,
        id: ref.id,
        data: () => ({
          status: 'inviato',
          lines: [{ item_id: 'art-1', qty_packages: 2 }],
        }),
      }
    }
    if (ref?.col === 'stock_counts') {
      return { exists: () => true, id: ref.id, data: () => ({ status: 'open' }) }
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
    stato.scritture.push({ col: ref?.col, id: ref?.id, patch })
  }),
  deleteDoc: vi.fn(async () => {}),
  query: () => ({}),
  where: () => ({}),
  documentId: () => 'id',
  orderBy: () => ({}),
  limit: () => ({}),
  onSnapshot: () => () => {},
  serverTimestamp: () => null,
  increment: (n) => ({ __increment: n }),
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

const api = await import('../../src/lib/api.js')
const { articoloNormalizzato, magazzinoBloccato, patchNormalizza } = await import(
  '../../src/lib/inventory.js'
)

// Le strade che caricano o correggono una giacenza: sono quelle che devono
// fermarsi tutte allo stesso modo.
const strade = [
  ['carico a mano', () => api.loadStock('art-1', 2)],
  ['carico a confezioni', () => api.receiveBottles('art-1', 2)],
  ['rettifica della giacenza', () => api.adjustStock('art-1', 3)],
  // Era `receivePurchaseOrder`, che caricava l'ordine intero al «ricevuto».
  // Da REQ-MAG-029 il carico avviene al passaggio a CONSEGNATO, riga per
  // riga: il gesto ha un altro nome, la regola che deve rispettare è la
  // stessa — con un magazzino ancora da aggiornare non scrive niente.
  ['consegna di righe di un ordine fornitore', () => api.consegnaRigheOrdine('po-1')],
  [
    'allineamento della conta',
    () =>
      api.closeStockCount('sc-1', {
        lines: [{ item_id: 'art-1', rim: 3 }],
        totals: {},
        align: true,
      }),
  ],
]

beforeEach(() => {
  stato.articolo = nuovo
  stato.scritture = []
})

describe('col magazzino ancora da aggiornare nessuna strada scrive', () => {
  for (const [nome, esegui] of strade) {
    it(`${nome}: si ferma, e dice cosa fare`, async () => {
      stato.articolo = vecchio
      await expect(esegui()).rejects.toThrow(/aggiornato il magazzino/i)
      // La cosa che conta non è il messaggio: è che non sia stato scritto
      // niente su quella giacenza.
      expect(stato.scritture.filter((s) => s.col === 'inventory_items')).toEqual([])
    })
  }
})

describe('a magazzino aggiornato le stesse strade scrivono', () => {
  for (const [nome, esegui] of strade) {
    it(`${nome}: la giacenza si muove`, async () => {
      await esegui()
      expect(stato.scritture.some((s) => s.col === 'inventory_items')).toBe(true)
    })
  }
})

describe('la regola del «in sola lettura» è una sola', () => {
  // `magazzinoBloccato` guarda gli articoli COME LI LEGGE L'APP, cioè già
  // passati da `articoloNormalizzato`: è quello che hanno in mano le due
  // schermate.
  const comeLiVede = (grezzo) => articoloNormalizzato({ id: 'art-1', ...grezzo })

  it('un articolo nella forma vecchia blocca il magazzino', () => {
    // È la stessa condizione che ferma le scritture: la schermata del
    // magazzino e quella degli Acquisti la CHIEDONO, non la riscrivono —
    // finché era una riga da ricopiare, Acquisti ne era rimasta fuori.
    expect(patchNormalizza(vecchio)).toBeTruthy()
    expect(magazzinoBloccato([comeLiVede(vecchio)])).toBe(true)
  })

  it('a travaso fatto non blocca niente', () => {
    expect(patchNormalizza(nuovo)).toBe(null)
    expect(magazzinoBloccato([comeLiVede(nuovo)])).toBe(false)
  })

  it('magazzino vuoto: non c’è niente da aggiornare, e niente da bloccare', () => {
    expect(magazzinoBloccato([])).toBe(false)
  })
})
