// @vitest-environment happy-dom
'use strict'

// ── IL GIRO DEGLI ORDINI, SENZA RETE (REQ-MAG-037) ───────────────────
//
// Il riepilogo conferma un fornitore per volta, e ogni conferma è un ordine.
// Se quel gesto aspettasse la scrittura, con la cassa offline resterebbe
// appeso per sempre: il tasto premuto e niente che succede, che al banco
// vuol dire premerlo di nuovo — e due ordini allo stesso fornitore.
//
// COM'È FATTO QUESTO TEST, sul modello di tests/unit/giroInLocale.test.js:
// si mocka SOLO Firestore, non `src/lib/api.js` — se no si proverebbe il
// mock e non il codice. Ogni scrittura resta appesa PER SEMPRE e ogni
// lettura risponde con quello che c'era prima, che è quello che fa una
// cache mentre la scrittura è ancora in coda. Chi rilegge, qui, rilegge il
// passato.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {})
const stato = { ordini: {}, articoli: {}, scritture: [], nuovi: 0 }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
  functions: {},
  storage: {},
}))

const leggi = async (ref) => {
  const fonte = ref?.col === 'purchase_orders' ? stato.ordini : stato.articoli
  const documento = fonte[ref?.id]
  return { exists: () => !!documento, id: ref?.id, data: () => documento }
}

vi.mock('firebase/firestore', () => ({
  collection: (_db, nome) => ({ __col: nome }),
  doc: (...args) => {
    if (args.length >= 3) return { col: args[1], id: args[2] }
    if (args.length === 2) return { col: args[0]?.__col || 'x', id: args[1] }
    // `doc(collection(...))` senza id: è così che si prende un id nuovo
    // senza chiedere niente alla rete.
    return { col: args[0]?.__col || 'x', id: `nuovo-${++stato.nuovi}` }
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

const RIGHE_NOVA = [
  { item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12.5, vat: 22, supplier_id: 'nova', supplier_name: 'Nova', stato: 'richiesto' },
  { item_id: 'rum', name: 'Rum Zacapa', qty_packages: 1, unit_cost: 40, vat: 22, supplier_id: 'nova', supplier_name: 'Nova', stato: 'richiesto' },
]

beforeEach(() => {
  stato.scritture = []
  stato.nuovi = 0
  stato.articoli = {
    campari: { name: 'Campari', unit: 'pz', stock: 0, package_size: 700, content_unit: 'ml', status: 'linea' },
    rum: { name: 'Rum Zacapa', unit: 'pz', stock: 1, package_size: 700, content_unit: 'ml', status: 'premium' },
  }
  stato.ordini = {
    'po-1': {
      created_at: '2026-08-27T09:00:00.000Z',
      status: 'inviato',
      received_at: null,
      total_net: 115,
      total_gross: 140.3,
      lines: RIGHE_NOVA.map((l) => ({ ...l })),
    },
  }
})

const scritture = (col, tipo = null) =>
  stato.scritture.filter((s) => s.col === col && (tipo == null || s.tipo === tipo))

describe('confermare un fornitore non aspetta la rete', () => {
  it('l’ordine torna subito, con id, righe e data', async () => {
    const ordine = await subito(
      api.createPurchaseOrder({
        supplier_id: 'nova',
        supplier_name: 'Nova',
        lines: RIGHE_NOVA,
        total_net: 115,
        total_gross: 140.3,
      })
    )
    expect(ordine.id).toBeTruthy()
    expect(ordine.supplier_name).toBe('Nova')
    expect(ordine.lines).toHaveLength(2)
    expect(ordine.total_gross).toBe(140.3)
    // La data è quella del terminale: il segnaposto del server arriverebbe
    // solo quando la scrittura tocca terra, e a schermo non si può leggere.
    expect(ordine.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    // E la scrittura è partita, in sottofondo.
    expect(scritture('purchase_orders', 'set')).toHaveLength(1)
  })

  // UN ORDINE PER FORNITORE: due conferme, due documenti distinti. Un id
  // riusato sarebbe un ordine che ne cancella un altro.
  it('due conferme fanno due ordini con id diversi', async () => {
    const a = await subito(api.createPurchaseOrder({ lines: RIGHE_NOVA, total_net: 1, total_gross: 1 }))
    const b = await subito(api.createPurchaseOrder({ lines: [], total_net: 0, total_gross: 0 }))
    expect(a.id).not.toBe(b.id)
  })
})

describe('i prodotti passano in assortimento alla conferma', () => {
  it('lo stato cambia subito, e si ricorda da dove viene', async () => {
    const articoli = [
      { id: 'campari', name: 'Campari', status: 'linea' },
      { id: 'rum', name: 'Rum Zacapa', status: 'premium' },
    ]
    const aggiornati = api.segnaInAssortimento(articoli, 'po-9')
    expect(aggiornati.map((a) => a.status)).toEqual(['assortimento', 'assortimento'])
    expect(aggiornati.map((a) => a.assortimento_da)).toEqual(['linea', 'premium'])
    // Due scritture IN SOTTOFONDO, una per prodotto: partono dopo il gesto
    // (bgWrite le mette in coda), non prima — chi tocca il tasto ha già
    // visto l'esito.
    await Promise.resolve()
    expect(scritture('inventory_items', 'update')).toHaveLength(2)
    expect(scritture('inventory_items', 'update')[1].patch).toMatchObject({
      status: 'assortimento',
      assortimento_da: 'premium',
      ordini_assortimento: ['po-9'],
    })
  })

  // L'ORDINE CANCELLATO LIBERA I SUOI PRODOTTI: se no resterebbero «in
  // arrivo» per sempre, da un ordine che non esiste più.
  it('cancellato l’ordine, i prodotti tornano allo stato di prima', async () => {
    const dentro = [
      { id: 'campari', status: 'assortimento', assortimento_da: 'linea', ordini_assortimento: ['po-1'] },
    ]
    const aggiornati = api.liberaDaAssortimento(dentro, 'po-1')
    await Promise.resolve()
    expect(aggiornati[0].status).toBe('linea')
    expect(scritture('inventory_items', 'update')[0].patch).toMatchObject({
      status: 'linea',
      assortimento_da: null,
      ordini_assortimento: [],
    })
  })

  // «Il prodotto DEVE essere in linea o premium»: un fuori linea non ci
  // passa, e non si scrive niente su di lui.
  it('un fuori linea non ci passa', async () => {
    const aggiornati = api.segnaInAssortimento([{ id: 'x', status: 'out' }], 'po-9')
    await Promise.resolve()
    expect(aggiornati).toEqual([])
    expect(scritture('inventory_items')).toEqual([])
  })
})

describe('togliere un item da un ordine già fatto', () => {
  it('l’ordine torna senza quella riga, coi totali rifatti', async () => {
    stato.articoli.campari = {
      ...stato.articoli.campari,
      status: 'assortimento',
      assortimento_da: 'linea',
      ordini_assortimento: ['po-1'],
    }
    const { ordine, articolo } = await subito(api.togliRigaOrdine('po-1', { indice: 0 }))
    expect(ordine.lines.map((l) => l.item_id)).toEqual(['rum'])
    expect(ordine.total_net).toBe(40)
    // E IL PRODOTTO TORNA ALLO STATO DI PRIMA: è la seconda delle due sole
    // strade per uscire da «in assortimento».
    expect(articolo.status).toBe('linea')
    expect(scritture('inventory_items', 'update')[0].patch).toMatchObject({
      status: 'linea',
      ordini_assortimento: [],
    })
  })

  // La merce già arrivata ha alzato la giacenza e scritto un movimento:
  // toglierla vorrebbe dire scaricare roba che sta sullo scaffale.
  it('una riga già consegnata non si toglie', async () => {
    stato.ordini['po-1'].lines[0].stato = 'consegnato'
    await expect(subito(api.togliRigaOrdine('po-1', { indice: 0 }))).rejects.toThrow(/già arrivata/)
  })

  it('un indice che non esiste non tocca niente', async () => {
    const { ordine } = await subito(api.togliRigaOrdine('po-1', { indice: 9 }))
    expect(ordine.lines).toHaveLength(2)
    expect(scritture('purchase_orders', 'update')).toEqual([])
  })
})

describe('lo stato cambiato a mano toglie il prodotto dagli ordini', () => {
  it('la riga ancora in attesa esce dall’ordine', async () => {
    const toccati = await subito(api.togliProdottoDagliOrdini('campari', ['po-1']))
    expect(toccati).toHaveLength(1)
    expect(toccati[0].lines.map((l) => l.item_id)).toEqual(['rum'])
  })

  // Quello che è già arrivato è storia dell'ordine: cancellarlo farebbe
  // sparire una consegna dai conti.
  it('la riga già consegnata resta dov’è', async () => {
    stato.ordini['po-1'].lines[0].stato = 'consegnato'
    const toccati = await subito(api.togliProdottoDagliOrdini('campari', ['po-1']))
    expect(toccati).toEqual([])
  })

  it('un ordine che non c’è più non ferma niente', async () => {
    const toccati = await subito(api.togliProdottoDagliOrdini('campari', ['sparito', 'po-1']))
    expect(toccati).toHaveLength(1)
  })
})
