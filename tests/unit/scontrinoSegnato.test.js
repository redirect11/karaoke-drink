// @vitest-environment happy-dom
'use strict'

// ── LO SCONTRINO ESCE UNA VOLTA, E IL SEGNO STA SUL DATO ─────────────
//
// «Alla prima apertura dell'app ero in inventario. Sono tornato in coda
// ordini e mi ha stampato tutti gli SCONTRINI» (l'utente, 20/08). La
// guardia contro le copie doppie viveva SOLO in localStorage
// (`claimReceiptPrint`): un browser nuovo, o una memoria svuotata, non
// aveva nessuna pretesa presa e vedeva ogni conto pagato della serata come
// un conto da stampare.
//
// La cura è la stessa già presa per le comande (BUG-050): il segno va SUL
// DATO — `receipt_print_at` sul conto — scritto in sottofondo a carta
// uscita. Qui si prova che il segno si scrive, che si legge, e che una
// riapertura lo azzera: un conto riaperto è un conto da richiudere, e alla
// chiusura la carta deve uscire di nuovo (BUG-047).
//
// Niente rete: si mocka SOLO Firestore, le scritture restano appese per
// sempre e le letture rispondono col passato — come una cache mentre la
// scrittura è ancora in coda.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {})
const stato = { ordine: null, scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1', email: 'banco@tana.it', displayName: 'Banco' } },
  functions: {},
  storage: {},
}))

const leggi = async (ref) => {
  if (ref?.col && ref.col !== 'orders') return { exists: () => false, data: () => ({}) }
  return { exists: () => !!stato.ordine, id: 'ord-1', data: () => stato.ordine }
}

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: (_db, col, id) => ({ col: col || 'orders', id: id || 'ord-1' }),
  getDoc: vi.fn(leggi),
  getDocFromCache: vi.fn(leggi),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(() => mai()),
  setDoc: vi.fn(() => mai()),
  updateDoc: vi.fn((_r, patch) => {
    stato.scritture.push(patch)
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
  increment: (n) => n,
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
const { scontrinoGiaUscito } = await import('../../src/lib/printer.js')

const subito = (p) =>
  Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('rimasto appeso')), 1000))])

const contoPagato = () => ({
  status: 'pagato',
  payment_status: 'pagato',
  daily_number: 36,
  total: 40,
  discount: null,
  discount_amount: 0,
  payments: [{ amount: 40, method: 'banco', at: '2026-08-20T21:10:00.000Z' }],
  items: [{ drink_id: 'margarita', name: 'Margarita', qty: 4, unit_price: 10 }],
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: 'ritirato',
      items: [{ drink_id: 'margarita', name: 'Margarita', qty: 4, unit_price: 10 }],
      inventory_applied: true,
    },
  ],
  receipt_print_at: '2026-08-20T21:10:05.000Z',
  created_at: '2026-08-20T20:00:00.000Z',
})

beforeEach(() => {
  stato.ordine = contoPagato()
  stato.scritture = []
})

describe('il segno dello scontrino sta sul conto', () => {
  it('a carta uscita si scrive `receipt_print_at`, e niente altro', async () => {
    stato.ordine = { ...contoPagato(), receipt_print_at: null }
    api.segnaScontrinoStampato('ord-1')
    // La scrittura parte in sottofondo: un giro di coda e c'è.
    await new Promise((r) => setTimeout(r, 0))
    expect(stato.scritture).toHaveLength(1)
    expect(Object.keys(stato.scritture[0])).toEqual(['receipt_print_at'])
    expect(typeof stato.scritture[0].receipt_print_at).toBe('string')
  })

  it('senza id non si scrive niente (il conto non esiste ancora)', async () => {
    api.segnaScontrinoStampato(null)
    await new Promise((r) => setTimeout(r, 0))
    expect(stato.scritture).toHaveLength(0)
  })

  it('il conto che torna dalla cache PORTA il segno', async () => {
    const o = await subito(api.fetchOrder('ord-1'))
    expect(o.receipt_print_at).toBe('2026-08-20T21:10:05.000Z')
    // Ed è quello che le tre strade dell'incasso guardano prima di stampare.
    expect(scontrinoGiaUscito(o)).toBe(true)
    expect(scontrinoGiaUscito({ ...o, receipt_print_at: null })).toBe(false)
  })

  it('riaprendo il conto il segno si azzera: alla prossima chiusura si ristampa', async () => {
    const dopo = await subito(api.restoreOrder('ord-1', { motivo: 'ci ripensa' }))
    // Composto in locale, senza rileggere niente: è quello che vede subito
    // chi ha premuto «rimetti in corso».
    expect(dopo.receipt_print_at).toBe(null)
    expect(scontrinoGiaUscito(dopo)).toBe(false)
    // E lo stesso è partito verso il server.
    const scritta = stato.scritture.find((p) => 'receipt_print_at' in p)
    expect(scritta.receipt_print_at).toBe(null)
  })
})
