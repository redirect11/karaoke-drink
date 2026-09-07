// @vitest-environment happy-dom
'use strict'

// ── AGGANCIARE LA FATTURA ALLA FETTA, SENZA RETE (REQ-MAG-031) ───────
//
// L'utente, 20/08: «la vista degli ordini contiene più fornitori, ma la
// fattura è collegata all'ordine PER IL FORNITORE, perché è il fornitore che
// rilascia la fattura».
//
// Le due cose che questo file sorveglia sono quelle che costano: che la
// guardia del fornitore stia DAVANTI ALLA SCRITTURA e non solo davanti
// all'elenco delle candidate — le schermate aperte sono due e i terminali
// del locale pure — e che l'esito si veda subito, composto in memoria,
// senza aspettare che la scrittura vada a segno.
//
// COM'È FATTO QUESTO TEST, come per «Aggiungi prodotti»: si mocka SOLO
// Firestore, non `src/lib/api.js` — se no si proverebbe il mock e non il
// codice. Ogni scrittura resta appesa per sempre e ogni lettura risponde con
// quello che c'era PRIMA, che è quello che fa davvero una cache mentre la
// scrittura è in coda.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {})
const stato = { fattura: null, ordine: null, altre: [], scritture: [] }

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
  if (ref?.col === 'purchase_orders') {
    return { exists: () => !!stato.ordine, id: ref.id, data: () => stato.ordine }
  }
  if (ref?.col === 'inventory_items') {
    return { exists: () => false, id: ref.id, data: () => null }
  }
  return { exists: () => false, data: () => ({}) }
}

// Le altre fatture di quell'ordine: è l'unica lettura in più che serve per
// sapere se la fetta è già coperta da qualcun altro.
const cerca = async () => ({
  docs: stato.altre.map((f) => ({ id: f.id, data: () => f })),
})

vi.mock('firebase/firestore', () => ({
  collection: (_db, nome) => ({ __col: nome }),
  doc: (...args) => {
    if (args.length >= 3) return { col: args[1], id: args[2] }
    if (args.length === 2) return { col: args[0]?.__col || 'x', id: args[1] }
    return { col: args[0]?.__col || 'x', id: 'nuovo' }
  },
  getDoc: vi.fn(leggi),
  getDocFromCache: vi.fn(leggi),
  getDocs: vi.fn(cerca),
  getDocsFromCache: vi.fn(cerca),
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

beforeEach(() => {
  stato.fattura = {
    supplier_id: 'nova',
    supplier_name: 'Nova',
    number: '1556',
    doc_type: 'Fattura',
    date: '2026-08-26',
    amount: 81,
    paid: false,
  }
  // L'ordine del 20 agosto, due fornitori dentro: è il caso da cui nasce
  // tutta questa voce.
  stato.ordine = {
    created_at: '2026-08-20T09:00:00.000Z',
    status: 'inviato',
    lines: [
      { item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12.5, supplier_id: 'nova', supplier_name: 'Nova', stato: 'consegnato' },
      { item_id: 'gin', name: 'Gin Mare', qty_packages: 1, unit_cost: 30, supplier_id: 'enofel', supplier_name: 'Enofel', stato: 'richiesto' },
    ],
  }
  stato.altre = []
  stato.scritture = []
})

const aggiornamenti = () =>
  stato.scritture.filter((s) => s.col === 'supplier_invoices' && s.tipo === 'update')

describe('la fattura si aggancia alla fetta del suo fornitore', () => {
  it('si scrive l’ordine sul documento, e l’esito si vede subito', async () => {
    const dopo = await subito(api.collegaFatturaAFetta('inv-1', { order_id: 'po-1' }))
    // Composto in memoria: la cache risponderebbe col documento di prima, e
    // la schermata mostrerebbe il passato (è stato il difetto di BUG-045).
    expect(dopo.order_id).toBe('po-1')
    expect(dopo.number).toBe('1556')
    expect(aggiornamenti()[0].patch).toEqual({ order_id: 'po-1' })
  })

  it('e si stacca dalla stessa strada, al contrario', async () => {
    stato.fattura.order_id = 'po-1'
    const dopo = await subito(api.collegaFatturaAFetta('inv-1', { order_id: null }))
    expect(dopo.order_id).toBe(null)
    expect(aggiornamenti()[0].patch).toEqual({ order_id: null })
  })
})

describe('la guardia sta davanti alla scrittura', () => {
  // Le schermate aperte sono due e i terminali del locale pure: una fetta
  // coperta da un altro terminale un minuto fa non si vede.
  it('una fetta già coperta da un altro documento non si sovrascrive', async () => {
    stato.altre = [{ id: 'inv-9', supplier_id: 'nova', order_id: 'po-1' }]
    await expect(subito(api.collegaFatturaAFetta('inv-1', { order_id: 'po-1' }))).rejects.toThrow(
      /ha già un documento/
    )
    expect(stato.scritture).toEqual([])
  })

  // In quell'ordine di Nova non c'è niente: agganciarcela vorrebbe dire
  // pagare merce a chi non l'ha venduta.
  it('un ordine senza righe di quel fornitore non prende la sua fattura', async () => {
    stato.ordine.lines = [{ item_id: 'gin', qty_packages: 1, supplier_id: 'enofel', stato: 'richiesto' }]
    await expect(subito(api.collegaFatturaAFetta('inv-1', { order_id: 'po-1' }))).rejects.toThrow(/Nova/)
    expect(stato.scritture).toEqual([])
  })

  it('un ordine che non c’è più non lascia il documento a metà', async () => {
    stato.ordine = null
    await expect(subito(api.collegaFatturaAFetta('inv-1', { order_id: 'po-1' }))).rejects.toThrow(
      /Ordine non trovato/
    )
    expect(stato.scritture).toEqual([])
  })

  // Staccare invece non chiede permesso a nessuno: un documento attaccato
  // all'ordine sbagliato dev'essere sempre staccabile.
  it('per staccare non serve nessun ordine', async () => {
    stato.ordine = null
    stato.fattura.order_id = 'po-1'
    await subito(api.collegaFatturaAFetta('inv-1', { order_id: null }))
    expect(aggiornamenti()[0].patch).toEqual({ order_id: null })
  })
})

describe('riprendere le righe e agganciare sono una scrittura sola', () => {
  // Due scritture, e una delle due può restare indietro: la fattura
  // risulterebbe compilata ma senza ordine, che è proprio il buco che questa
  // voce serve a chiudere.
  it('le righe e il legame partono insieme', async () => {
    const riga = { item_id: 'campari', name: 'Campari', unit: 'pz', qty_packages: 6, unit_cost: 12.5, vat: 22 }
    const dopo = await subito(
      api.aggiungiProdottiAFattura('inv-1', { righe: [riga], carica: false, order_id: 'po-1' })
    )
    expect(dopo.order_id).toBe('po-1')
    expect(dopo.lines).toHaveLength(1)
    const patch = aggiornamenti()[0].patch
    expect(patch.order_id).toBe('po-1')
    expect(patch.lines).toHaveLength(1)
  })

  it('e la guardia vale anche di qui', async () => {
    stato.altre = [{ id: 'inv-9', supplier_id: 'nova', order_id: 'po-1' }]
    const riga = { item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12.5 }
    await expect(
      subito(api.aggiungiProdottiAFattura('inv-1', { righe: [riga], carica: false, order_id: 'po-1' }))
    ).rejects.toThrow(/ha già un documento/)
    expect(stato.scritture).toEqual([])
  })

  // Chi aggiunge prodotti a una fattura già agganciata non riscrive il
  // legame: è lo stesso ordine, e la patch resta quella delle righe.
  it('sull’ordine che ha già, il legame non si riscrive', async () => {
    stato.fattura.order_id = 'po-1'
    const riga = { item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12.5 }
    await subito(api.aggiungiProdottiAFattura('inv-1', { righe: [riga], carica: false, order_id: 'po-1' }))
    expect(aggiornamenti()[0].patch.order_id).toBeUndefined()
  })
})
