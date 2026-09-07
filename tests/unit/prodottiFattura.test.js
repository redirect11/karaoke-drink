// @vitest-environment happy-dom
'use strict'

// ── «AGGIUNGI PRODOTTI» A UNA FATTURA, SENZA RETE (REQ-MAG-030) ──────
//
// Flavio, 26/08/2026: «ci mettiamo anche i prodotti, in modo tale che li va
// già a caricare all'interno dei prodotti di magazzino. Sempre che poi dopo
// mi fa la domanda se voglio aggiornare il prezzo — nel caso lo vado a
// modificare — oppure lasciarlo invariato, così, senza carico, perché magari
// me li sono caricati già prima in altro modo».
//
// Le due cose che questo file sorveglia sono quelle che al banco costano:
// che il carico si possa NON fare (caricare due volte la stessa merce è
// l'errore da impedire) e che il prezzo non si muova da solo.
//
// COM'È FATTO QUESTO TEST, come per la consegna di un ordine: si mocka SOLO
// Firestore, non `src/lib/api.js` — se no si proverebbe il mock e non il
// codice. Ogni scrittura resta appesa per sempre e ogni lettura risponde con
// quello che c'era PRIMA, che è quello che fa davvero una cache mentre la
// scrittura è in coda.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {})
const stato = { fattura: null, articolo: null, scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
  functions: {},
  storage: {},
}))

const leggi = async (ref) => {
  if (ref?.col === 'supplier_invoices') {
    return { exists: () => !!stato.fattura, id: 'inv-1', data: () => stato.fattura }
  }
  if (ref?.col === 'inventory_items') {
    return { exists: () => !!stato.articolo, id: ref.id, data: () => stato.articolo }
  }
  return { exists: () => false, data: () => ({}) }
}

vi.mock('firebase/firestore', () => ({
  collection: (_db, nome) => ({ __col: nome }),
  doc: (...args) => {
    if (args.length >= 3) return { col: args[1], id: args[2] }
    if (args.length === 2) return { col: args[0]?.__col || 'x', id: args[1] }
    return { col: args[0]?.__col || 'x', id: 'nuovo' }
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

const RIGA = {
  item_id: 'campari',
  name: 'Campari',
  unit: 'pz',
  package_size: 700,
  qty_packages: 6,
  unit_cost: 13.5,
  vat: 22,
}

beforeEach(() => {
  // La fattura com'è in archivio: SOLO UNA TESTATA, senza righe. È il dato
  // da cui nasce tutta questa voce.
  stato.fattura = {
    supplier_id: 'nova',
    supplier_name: 'Nova',
    number: '1556',
    doc_type: 'Fattura',
    date: '2026-08-26',
    amount: 81,
    paid: false,
  }
  stato.articolo = { name: 'Campari', unit: 'pz', stock: 2, package_size: 700, content_unit: 'ml', cost: 12, kind: 'scorta' }
  stato.scritture = []
})

const scritture = (col, tipo = null) =>
  stato.scritture.filter((s) => s.col === col && (tipo == null || s.tipo === tipo))

describe('i prodotti si aggiungono al documento', () => {
  it('la fattura guadagna le righe, e le guadagna qui', async () => {
    const dopo = await subito(api.aggiungiProdottiAFattura('inv-1', { righe: [RIGA] }))
    expect(dopo.lines).toHaveLength(1)
    expect(dopo.lines[0]).toMatchObject({ item_id: 'campari', qty_packages: 6, unit_cost: 13.5 })
    expect(scritture('supplier_invoices', 'update')[0].patch.lines).toHaveLength(1)
  })

  // Le righe si AGGIUNGONO: una seconda consegna dello stesso fornitore non
  // cancella quello che c'era già sul documento.
  it('le righe già sul documento restano dov’erano', async () => {
    stato.fattura.lines = [{ item_id: 'gin', name: 'Gin Mare', qty_packages: 1, unit_cost: 30, caricata: true }]
    const dopo = await subito(api.aggiungiProdottiAFattura('inv-1', { righe: [RIGA] }))
    expect(dopo.lines.map((l) => l.item_id)).toEqual(['gin', 'campari'])
  })

  it('una riga senza quantità non finisce sul documento', async () => {
    const dopo = await subito(api.aggiungiProdottiAFattura('inv-1', { righe: [{ ...RIGA, qty_packages: 0 }] }))
    expect(dopo.lines).toEqual([])
    expect(stato.scritture).toEqual([])
  })

  // L'IMPORTO DELLA TESTATA È QUELLO DEL DOCUMENTO, e resta di chi l'ha
  // battuto: i prodotti si aggiungono a mano e nell'ordine che capita, e
  // riscrivere l'importo dopo la prima riga farebbe sembrare sbagliata una
  // fattura che è giusta.
  it('l’importo della fattura non si muove da solo', async () => {
    const dopo = await subito(api.aggiungiProdottiAFattura('inv-1', { righe: [RIGA] }))
    expect(dopo.amount).toBe(81)
    expect(scritture('supplier_invoices', 'update')[0].patch.amount).toBeUndefined()
  })
})

describe('il carico a magazzino è facoltativo', () => {
  // «Magari me li sono caricati già prima in altro modo» (Flavio): le righe
  // si mettono e le giacenze non si toccano.
  it('senza carico il magazzino non si tocca', async () => {
    const dopo = await subito(api.aggiungiProdottiAFattura('inv-1', { righe: [RIGA], carica: false }))
    expect(scritture('inventory_items')).toEqual([])
    expect(scritture('stock_movements')).toEqual([])
    expect(dopo.lines[0].caricata).toBe(false)
  })

  // La giacenza si muove nell'unità con cui quel prodotto si conta: dopo il
  // travaso è il PEZZO, e il contenuto (700 ml) sta sulla scheda. Il conto
  // lo fa `caricoDaConfezioni`, lo stesso che usa la consegna di un ordine:
  // due copie della stessa moltiplicazione sono due occasioni di scriverla
  // diversa.
  it('col carico la giacenza sale, col suo movimento', async () => {
    const dopo = await subito(api.aggiungiProdottiAFattura('inv-1', { righe: [RIGA], carica: true }))
    const carichi = scritture('inventory_items', 'update')
    expect(carichi).toHaveLength(1)
    expect(carichi[0].patch.stock).toEqual({ __increment: 6 })
    expect(scritture('stock_movements', 'add')[0].data).toMatchObject({
      item_id: 'campari',
      qty: 6,
      reason: 'fattura fornitore',
    })
    // E resta scritto sulla riga, che è quello che impedisce di caricare due
    // volte la stessa merce.
    expect(dopo.lines[0].caricata).toBe(true)
  })
})

describe('il prezzo si chiede, non si impone', () => {
  // «Oppure lasciarlo invariato»: chi non risponde alla domanda non aggiorna
  // niente — né il listino del fornitore né il costo del prodotto.
  it('senza risposta il listino e il costo restano dov’erano', async () => {
    await subito(api.aggiungiProdottiAFattura('inv-1', { righe: [RIGA], carica: true }))
    expect(scritture('supplier_prices')).toEqual([])
    expect(scritture('inventory_items', 'update')[0].patch.cost).toBeUndefined()
  })

  it('con il sì il prezzo va nel listino di QUEL fornitore, con la sua data', async () => {
    await subito(
      api.aggiungiProdottiAFattura('inv-1', { righe: [{ ...RIGA, aggiorna_prezzo: true }], carica: true })
    )
    const listino = scritture('supplier_prices', 'set')
    expect(listino).toHaveLength(1)
    // L'id è deterministico: fornitore + prodotto (REQ-MAG-029).
    expect(listino[0].id).toBe('nova__campari')
    expect(listino[0].data).toMatchObject({ supplier_id: 'nova', item_id: 'campari', price: 13.5, last_price: 13.5 })
    expect(listino[0].data.last_price_at).toBeTruthy()
    // E diventa anche il costo di riferimento del prodotto. Il PREZZO DI
    // VENDITA del menu non lo tocca nessuno: è di Flavio.
    expect(scritture('inventory_items', 'update')[0].patch.cost).toBe(13.5)
  })

  // Le due leve sono davvero indipendenti: si può aggiornare il prezzo senza
  // caricare niente, che è il caso di chi ha già messo la merce a scaffale.
  it('il prezzo si aggiorna anche senza carico', async () => {
    await subito(
      api.aggiungiProdottiAFattura('inv-1', { righe: [{ ...RIGA, aggiorna_prezzo: true }], carica: false })
    )
    expect(scritture('supplier_prices', 'set')).toHaveLength(1)
    const patch = scritture('inventory_items', 'update')[0].patch
    expect(patch.cost).toBe(13.5)
    expect(patch.stock).toBeUndefined()
  })
})

describe('l’esito si vede subito, senza aspettare la rete', () => {
  // Le scritture restano appese per sempre e la cache risponde col documento
  // di PRIMA: se la funzione rileggesse, qui tornerebbe una fattura ancora
  // senza righe (è stato il difetto di BUG-045).
  it('la fattura che torna è già quella coi prodotti dentro', async () => {
    const dopo = await subito(api.aggiungiProdottiAFattura('inv-1', { righe: [RIGA] }))
    expect(dopo.id).toBe('inv-1')
    expect(dopo.supplier_name).toBe('Nova')
    expect(dopo.lines).toHaveLength(1)
  })

  // Prodotto cancellato dall'anagrafica mentre la fattura si compilava: il
  // documento contabile resta valido, il magazzino non c'entra.
  it('un prodotto sparito non impedisce di scrivere il documento', async () => {
    stato.articolo = null
    const dopo = await subito(api.aggiungiProdottiAFattura('inv-1', { righe: [RIGA], carica: true }))
    expect(dopo.lines).toHaveLength(1)
    expect(scritture('inventory_items')).toEqual([])
  })
})
