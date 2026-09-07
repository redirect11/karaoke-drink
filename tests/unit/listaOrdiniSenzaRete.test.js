// @vitest-environment happy-dom
'use strict'

// ── I GESTI DELLA LISTA ORDINI, CON LA RETE STACCATA (REQ-MAG-038) ───
//
// Il local-first è la prima regola: coda, conto, pagamenti e — da qui in
// avanti — anche gli ordini fornitore devono rispondere nell'istante in cui
// si tocca. Un `await` su una scrittura Firestore offline non torna mai, ed
// è l'app bloccata col locale pieno.
//
// COM'È FATTO QUESTO TEST, ed è il punto: si mocka SOLO Firestore, non
// `src/lib/api.js` — se no si proverebbe il mock e non il codice. Ogni
// scrittura resta appesa per sempre e ogni lettura risponde con quello che
// c'era PRIMA, che è quello che fa davvero una cache mentre la scrittura è
// in coda. È il modello di `tests/unit/giroInLocale.test.js`.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {})
const stato = { articolo: null, listino: null, scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
  functions: {},
  storage: {},
}))

const leggi = async (ref) => {
  if (ref?.col === 'inventory_items')
    return { exists: () => !!stato.articolo, id: ref.id, data: () => stato.articolo }
  if (ref?.col === 'supplier_prices')
    return { exists: () => !!stato.listino, id: ref.id, data: () => stato.listino }
  return { exists: () => false, data: () => ({}) }
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
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn((c, data) => {
    stato.scritture.push({ tipo: 'add', col: c?.__col, data })
    return mai()
  }),
  setDoc: vi.fn((ref, data) => {
    stato.scritture.push({ tipo: 'set', col: ref?.col, id: ref?.id, data })
    return mai()
  }),
  updateDoc: vi.fn((ref, patch) => {
    stato.scritture.push({ tipo: 'update', col: ref?.col, id: ref?.id, patch })
    return mai()
  }),
  deleteDoc: vi.fn(() => mai()),
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
    static fromDate(d) { return d }
    static fromMillis(m) { return m }
  },
}))

const api = await import('../../src/lib/api.js')

// Se una chiamata restasse appesa il test fallirebbe per timeout, che è lo
// stesso sintomo del banco: il tasto premuto e niente che succede.
const subito = (p) =>
  Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('rimasto appeso')), 1000))])

// LA SCRITTURA PARTE IN SOTTOFONDO, cioè al giro dopo: `bgWrite` la manda
// in un microtask. Il RISULTATO invece si vede subito — è il punto di tutto
// questo file — quindi le due cose si guardano in due momenti diversi, e
// aspettare un giro per leggere le scritture non è aspettare la rete.
const giro = () => new Promise((r) => setTimeout(r, 0))

const scritture = (col, tipo = null) =>
  stato.scritture.filter((s) => s.col === col && (tipo == null || s.tipo === tipo))

const ORDINE = {
  id: 'po-1',
  supplier_id: 'nova',
  supplier_name: 'Nova',
  created_at: '2026-08-27T09:00:00.000Z',
  status: 'ricevuto',
  storia: [{ at: '2026-08-27T09:00:00.000Z', tipo: 'creato' }],
  total_net: 54,
  total_gross: 65.88,
  lines: [
    {
      item_id: 'campari',
      name: 'Campari',
      unit: 'pz',
      package_size: 700,
      qty_packages: 4,
      unit_cost: 12,
      unit_cost_ordinato: 12,
      vat: 22,
      stato: 'consegnato',
    },
  ],
}

beforeEach(() => {
  stato.scritture = []
  stato.articolo = { name: 'Campari', unit: 'pz', stock: 2, package_size: 700, content_unit: 'ml', kind: 'scorta' }
  stato.listino = { price: 12 }
})

describe('la bozza nasce e parte senza aspettare niente', () => {
  // «L'ordine bozza NON IMPATTA SUL MAGAZZINO»: nasce un documento e basta.
  it('la bozza si scrive col suo stato, e la storia comincia da lì', async () => {
    const o = api.createPurchaseOrder({
      supplier_id: 'nova',
      supplier_name: 'Nova',
      lines: ORDINE.lines,
      total_net: 54,
      total_gross: 65.88,
      bozza: true,
    })
    expect(o.status).toBe('bozza')
    expect(o.id).toBeTruthy()
    // La data è quella del terminale: il segnaposto del server non si vede.
    expect(o.created_at).toBeTruthy()
    expect(o.storia[0].tipo).toBe('bozza')
    await giro()
    expect(scritture('purchase_orders', 'set')).toHaveLength(1)
  })

  it('senza bozza l’ordine nasce già mandato', () => {
    const o = api.createPurchaseOrder({ supplier_id: 'nova', lines: [], total_net: 0, total_gross: 0 })
    expect(o.status).toBe('inviato')
    expect(o.storia[0].tipo).toBe('creato')
  })

  // Confermare non legge niente: lo stato nuovo è deciso e la storia si
  // compone su quella che si ha in mano.
  it('confermare non rilegge il documento e risponde subito', async () => {
    const o = api.confermaOrdine({ ...ORDINE, status: 'bozza' })
    expect(o.status).toBe('inviato')
    expect(o.storia.map((v) => v.tipo)).toEqual(['creato', 'confermato'])
    await giro()
    expect(scritture('purchase_orders', 'update')[0].patch.status).toBe('inviato')
  })

  it('chiudere scrive la data e lascia l’ordine consegnato', () => {
    const o = api.chiudiOrdine(ORDINE)
    expect(o.closed_at).toBeTruthy()
    expect(o.status).toBe('ricevuto')
    expect(o.storia.at(-1).tipo).toBe('chiuso')
  })
})

describe('il documento: generato, o nessuno', () => {
  it('la fattura generata si compone in memoria, coi prezzi dell’ordine', async () => {
    const f = api.generaFatturaDaOrdine(ORDINE)
    expect(f.id).toBeTruthy()
    expect(f.order_id).toBe('po-1')
    expect(f.supplier_id).toBe('nova')
    // GENERATA DA NOI, e va detto: dice quanto ci si aspetta di pagare, non
    // quanto il fornitore chiede.
    expect(f.generata).toBe(true)
    expect(f.paid).toBe(false)
    // L'importo è il LORDO, come su qualunque documento dello scadenzario.
    expect(f.amount).toBeCloseTo(58.56, 2)
    expect(f.lines).toHaveLength(1)
    await giro()
    expect(scritture('supplier_invoices', 'set')).toHaveLength(1)
  })

  // «Il caso di pagare un fornitore senza fattura non c'è. Io creerò SEMPRE
  // un item nello scadenzario»: il contante al piccolo fornitore deve
  // comparire nel totale del mese come tutti gli altri soldi che escono.
  it('«Nessun documento» è una riga di scadenzario, e risulta pagata', () => {
    const f = api.generaFatturaDaOrdine(ORDINE, { doc_type: 'Nessun documento', paid: true })
    expect(f.doc_type).toBe('Nessun documento')
    expect(f.paid).toBe(true)
    expect(f.order_id).toBe('po-1')
  })

  it('un ordine senza fornitore non genera niente: il documento lo emette qualcuno', () => {
    expect(() => api.generaFatturaDaOrdine({ ...ORDINE, supplier_id: null })).toThrow()
  })

  it('pagato si scrive sulla fattura, e l’esito si vede subito', async () => {
    const f = api.segnaFatturaPagata({ id: 'inv-1', paid: false }, true)
    expect(f.paid).toBe(true)
    await giro()
    expect(scritture('supplier_invoices', 'update')[0].patch).toEqual({ paid: true })
  })
})

describe('il prezzo del documento allinea il listino', () => {
  const FATTURA = {
    id: 'inv-1',
    supplier_id: 'nova',
    amount: 65.88,
    lines: [{ item_id: 'campari', name: 'Campari', qty_packages: 4, unit_cost: 13.5, vat: 22 }],
  }

  it('scrive il listino e la variazione, senza toccare la giacenza', async () => {
    const o = await subito(api.allineaPrezziDaFattura(ORDINE, FATTURA))
    await giro()
    const listino = scritture('supplier_prices', 'set')
    expect(listino).toHaveLength(1)
    expect(listino[0].id).toBe('nova__campari')
    expect(listino[0].data).toMatchObject({ price: 13.5, last_price: 13.5 })
    // LA MERCE È GIÀ ENTRATA ALLA CONSEGNA: qui si tocca solo il prezzo.
    const prodotto = scritture('inventory_items', 'update')
    expect(prodotto[0].patch.stock).toBeUndefined()
    expect(prodotto[0].patch.cost).toBe(13.5)
    expect(scritture('stock_movements')).toEqual([])
    // La variazione porta da dove viene: un numero preso da un documento
    // fiscale è quello che si è pagato davvero.
    const storico = scritture('supplier_price_history', 'set')
    expect(storico[0].data).toMatchObject({ price: 13.5, previous_price: 12, origine: 'fattura' })
    // E la storia dell'ordine lo registra.
    expect(o.storia.at(-1).tipo).toBe('prezzi_allineati')
  })

  it('senza scarti non scrive niente', async () => {
    const uguale = { ...FATTURA, lines: [{ item_id: 'campari', qty_packages: 4, unit_cost: 12 }] }
    await subito(api.allineaPrezziDaFattura(ORDINE, uguale))
    await giro()
    expect(scritture('supplier_prices')).toEqual([])
  })
})
