// @vitest-environment happy-dom
'use strict'

// ── TUTTE LE STRADE CHE CAMBIANO UN PREZZO LASCIANO IL SEGNO (REQ-MAG-035)
//
// Il grafico dell'andamento dei prezzi è una voce futura; il DATO si scrive
// da adesso, perché uno storico non si ricostruisce all'indietro e ogni
// settimana senza è persa per sempre. Il rischio concreto è che una delle
// tre strade resti scollegata e il grafico nasca con i buchi dentro: qui si
// passano tutte e tre.
//
//   1. il listino compilato a mano nella scheda del fornitore
//   2. il prezzo corretto alla consegna di un ordine
//   3. il prezzo allineato da una fattura
//
// COM'È FATTO QUESTO TEST: si mocka SOLO Firestore, non `src/lib/api.js` —
// se no si proverebbe il mock e non il codice. Ogni scrittura resta appesa
// per sempre e ogni lettura risponde con quello che c'era PRIMA, che è
// quello che fa davvero una cache mentre la scrittura è in coda: chi
// rileggesse per sapere com'è andata, qui leggerebbe il passato.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {})
const stato = { ordine: null, articolo: null, fattura: null, listino: null, scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
  functions: {},
  storage: {},
}))

const leggi = async (ref) => {
  if (ref?.col === 'purchase_orders') {
    return { exists: () => !!stato.ordine, id: 'po-1', data: () => stato.ordine }
  }
  if (ref?.col === 'inventory_items') {
    return { exists: () => !!stato.articolo, id: ref.id, data: () => stato.articolo }
  }
  if (ref?.col === 'supplier_invoices') {
    return { exists: () => !!stato.fattura, id: ref.id, data: () => stato.fattura }
  }
  // LA RIGA DI LISTINO COM'ERA PRIMA: è quella che dice se il prezzo è
  // cambiato davvero, e va letta PRIMA di scrivere.
  if (ref?.col === 'supplier_prices') {
    return { exists: () => !!stato.listino, id: ref.id, data: () => stato.listino }
  }
  return { exists: () => false, data: () => ({}) }
}

vi.mock('firebase/firestore', () => ({
  collection: (_db, nome) => ({ __col: nome }),
  doc: (...args) => {
    if (args.length >= 3) return { col: args[1], id: args[2] }
    if (args.length === 2) return { col: args[0]?.__col || 'x', id: args[1] }
    return { col: args[0]?.__col || 'x', id: 'nato-qui' }
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
    static fromDate(d) { return d }
    static fromMillis(m) { return m }
  },
}))

const api = await import('../../src/lib/api.js')

// Se una chiamata restasse appesa il test fallirebbe per timeout, che è lo
// stesso sintomo del banco: il tasto premuto e niente che succede.
const subito = (p) =>
  Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('rimasto appeso')), 1000))])

// Le scritture partono in SOTTOFONDO (`bgWrite`), cioè un microtask dopo il
// gesto: chi controlla cos'è stato scritto deve lasciarle partire. È la
// stessa attesa che al banco non c'è — a schermo l'esito si vede prima.
const partite = () => new Promise((ok) => setTimeout(ok, 0))

const scritture = (col, tipo = null) =>
  stato.scritture.filter((s) => s.col === col && (tipo == null || s.tipo === tipo))
const storico = () => scritture('supplier_price_history', 'set')

beforeEach(() => {
  stato.ordine = {
    created_at: '2026-08-26T09:00:00.000Z',
    status: 'inviato',
    received_at: null,
    lines: [
      { item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12, vat: 22, supplier_id: 'nova', stato: 'richiesto' },
    ],
  }
  stato.articolo = { name: 'Campari', unit: 'pz', stock: 2, package_size: 700, content_unit: 'ml', kind: 'scorta' }
  stato.fattura = {
    supplier_id: 'nova',
    supplier_name: 'Nova',
    number: 'F-1',
    date: '2026-08-27',
    amount: 0,
    lines: [],
  }
  stato.listino = { supplier_id: 'nova', item_id: 'campari', price: 12.5 }
  stato.scritture = []
})

describe('1. il listino compilato a mano', () => {
  it('scrive la riga e la variazione, con l’origine giusta', async () => {
    const { riga, variazione } = api.salvaRigaListino({
      supplier_id: 'nova',
      item_id: 'campari',
      price: 13,
      precedente: { id: 'nova__campari', supplier_id: 'nova', item_id: 'campari', price: 12.5 },
    })
    await partite()
    expect(scritture('supplier_prices', 'set')[0].data.price).toBe(13)
    expect(storico()).toHaveLength(1)
    expect(storico()[0].data).toMatchObject({
      supplier_id: 'nova',
      item_id: 'campari',
      price: 13,
      previous_price: 12.5,
      origine: 'manuale',
    })
    // Il risultato si COMPONE: la scrittura è ancora appesa, e rileggere
    // qui darebbe 12,50 — il prezzo di prima.
    expect(riga.price).toBe(13)
    expect(variazione.price).toBe(13)
  })

  // La schermata del magazzino salva la scheda di un prodotto anche quando
  // il prezzo non lo tocca nessuno: se ogni salvataggio fosse una
  // variazione, lo storico direbbe che il Campari cambia prezzo ogni volta
  // che qualcuno gli corregge il nome.
  it('salvare lo stesso prezzo non sporca lo storico', async () => {
    api.salvaRigaListino({
      supplier_id: 'nova',
      item_id: 'campari',
      price: 12.5,
      precedente: { supplier_id: 'nova', item_id: 'campari', price: 12.5 },
    })
    await partite()
    expect(scritture('supplier_prices', 'set')).toHaveLength(1)
    expect(storico()).toHaveLength(0)
  })

  // Un prezzo battuto a mano NON è un acquisto: `last_price_at` è la data
  // dell'ultima merce comprata davvero, ed è quella che decide il fornitore
  // proposto al prossimo ordine.
  it('non finge un acquisto che non c’è stato', async () => {
    const { riga } = api.salvaRigaListino({
      supplier_id: 'nova',
      item_id: 'campari',
      price: 13,
      precedente: {
        supplier_id: 'nova',
        item_id: 'campari',
        price: 12.5,
        last_price: 12.5,
        last_price_at: '2026-01-02T00:00:00.000Z',
      },
    })
    await partite()
    const scritto = scritture('supplier_prices', 'set')[0].data
    expect('last_price_at' in scritto).toBe(false)
    expect(riga.last_price_at).toBe('2026-01-02T00:00:00.000Z')
  })
})

describe('2. il prezzo corretto alla consegna', () => {
  it('la consegna con un prezzo diverso lascia la sua variazione', async () => {
    await subito(api.consegnaRigheOrdine('po-1', { indici: [0], prezzi: { 0: 14 } }))
    expect(scritture('supplier_prices', 'set')[0].data.price).toBe(14)
    expect(storico()).toHaveLength(1)
    expect(storico()[0].data).toMatchObject({
      supplier_id: 'nova',
      item_id: 'campari',
      price: 14,
      previous_price: 12.5,
      origine: 'consegna',
    })
  })

  it('una consegna al prezzo di listino non registra niente', async () => {
    stato.listino = { supplier_id: 'nova', item_id: 'campari', price: 12 }
    await subito(api.consegnaRigheOrdine('po-1', { indici: [0] }))
    // Il listino si riscrive lo stesso — cambia `last_price_at`, che è
    // l'ultimo acquisto — ma il prezzo non è cambiato.
    expect(scritture('supplier_prices', 'set')).toHaveLength(1)
    expect(storico()).toHaveLength(0)
  })

  // Un fornitore che non ha mai venduto quel prodotto non ha una riga di
  // listino: la prima consegna È la nascita del prezzo, e va registrata.
  it('senza listino di partenza il prezzo nasce, e si scrive', async () => {
    stato.listino = null
    await subito(api.consegnaRigheOrdine('po-1', { indici: [0], prezzi: { 0: 14 } }))
    expect(storico()).toHaveLength(1)
    expect(storico()[0].data.previous_price).toBeNull()
  })
})

describe('3. il prezzo allineato da una fattura', () => {
  it('la fattura che aggiorna il prezzo lascia la variazione più pesante', async () => {
    await subito(
      api.aggiungiProdottiAFattura('inv-1', {
        righe: [{ item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 15, aggiorna_prezzo: true }],
        carica: false,
      })
    )
    expect(storico()).toHaveLength(1)
    expect(storico()[0].data).toMatchObject({
      price: 15,
      previous_price: 12.5,
      origine: 'fattura',
    })
  })

  // CHI NON RISPONDE NON AGGIORNA NIENTE (REQ-MAG-030): se il prezzo non
  // aggiorna il listino, non è successo niente da registrare.
  it('senza la spunta sul prezzo non si tocca né listino né storico', async () => {
    await subito(
      api.aggiungiProdottiAFattura('inv-1', {
        righe: [{ item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 15, aggiorna_prezzo: false }],
        carica: false,
      })
    )
    expect(scritture('supplier_prices', 'set')).toHaveLength(0)
    expect(storico()).toHaveLength(0)
  })
})

describe('un prodotto che nasce dal listino', () => {
  // «Posso associare i prodotti già in magazzino a quel fornitore, o
  // addirittura CREARE un prodotto che poi andrà a finire in magazzino»
  // (l'utente, 27/08/2026). La strada è quella del prodotto che nasce da una
  // consegna: nome e prezzo, contato a pezzi, scheda da completare.
  it('entra in magazzino, sul listino e nello storico, senza aspettare la rete', async () => {
    stato.listino = null
    const { item, riga, variazione } = api.creaProdottoAListino({
      supplier_id: 'nova',
      name: 'Amaro del Capo',
      price: 9.9,
    })
    await partite()
    const nato = scritture('inventory_items', 'set')[0].data
    expect(nato).toMatchObject({
      name: 'Amaro del Capo',
      unit: 'pz',
      stock: 0,
      cost: 9.9,
      scheda_da_completare: true,
    })
    expect(scritture('supplier_prices', 'set')[0].data).toMatchObject({
      supplier_id: 'nova',
      item_id: item.id,
      price: 9.9,
    })
    expect(variazione).toMatchObject({ price: 9.9, previous_price: null, origine: 'manuale' })
    // L'id se lo dà il client: `addDoc` risolve solo con l'ACK del server, e
    // offline non torna mai — chi crea un prodotto resterebbe a guardare una
    // schermata ferma.
    expect(item.id).toBeTruthy()
    expect(riga.item_id).toBe(item.id)
  })

  it('senza nome non nasce niente', async () => {
    expect(() => api.creaProdottoAListino({ supplier_id: 'nova', name: '  ' })).toThrow()
    await partite()
    expect(scritture('inventory_items', 'set')).toHaveLength(0)
  })
})

describe('togliere un prodotto dal listino', () => {
  // Quel prezzo è stato pagato davvero: togliere il prodotto dal catalogo di
  // un fornitore non lo rende falso, e uno storico che si cancella non è uno
  // storico.
  it('cancella la riga e lascia stare le variazioni', async () => {
    api.eliminaRigaListino('nova', 'campari')
    await partite()
    expect(scritture('supplier_prices', 'delete')).toHaveLength(1)
    expect(scritture('supplier_price_history', 'delete')).toHaveLength(0)
  })
})
