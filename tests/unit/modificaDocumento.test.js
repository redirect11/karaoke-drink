// @vitest-environment happy-dom
'use strict'

// ── CORREGGERE UN DOCUMENTO, CON LA RETE STACCATA (REQ-MAG-041) ──────
//
// «In Scadenzario i documenti creati devono essere modificabili nel caso di
// variazione o errore» (Flavio, 03/09/2026). Prima si poteva solo segnare
// pagato: chi sbagliava a battere una cifra doveva cancellare e rifare, e
// con la cancellazione se ne andavano righe, allegato e legame con l'ordine.
//
// COM'È FATTO QUESTO TEST, ed è il punto: si mocka SOLO Firestore, non
// `src/lib/api.js` — se no si proverebbe il mock e non il codice. Ogni
// scrittura resta appesa per sempre e ogni lettura risponde con quello che
// c'era PRIMA, che è quello che fa davvero una cache mentre la scrittura è
// in coda. È il modello di `tests/unit/giroInLocale.test.js`.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {})
const stato = { scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
  functions: {},
  storage: {},
}))

// LA CACHE RISPONDE COL PASSATO: un documento che non esiste per quanto
// riguarda questa lettura. Chi rilegge dopo aver scritto, qui, non trova
// niente — ed è esattamente il motivo per cui non si rilegge.
const leggi = async () => ({ exists: () => false, data: () => ({}) })

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
const { totaliProspetto, riconciliato } = await import('../../src/lib/confrontoOrdine.js')

// La scrittura parte in sottofondo, cioè al giro dopo (`bgWrite` la manda in
// un microtask). Il RISULTATO invece si vede subito.
const giro = () => new Promise((r) => setTimeout(r, 0))
const scritture = (col) => stato.scritture.filter((s) => s.col === col)

// Il documento com'è al banco: con dentro le righe, l'allegato e il legame
// con l'ordine, cioè le tre cose che la cancellazione portava via.
const FATTURA = {
  id: 'inv-1',
  supplier_id: 'nova',
  supplier_name: 'Nova',
  number: '1556',
  doc_type: 'Fattura',
  date: '2026-08-26',
  amount: 120,
  paid: false,
  notes: null,
  lines: [{ item_id: 'campari', name: 'Campari', qty_packages: 4, unit_cost: 12, vat: 22 }],
  order_id: 'po-1',
  attachment: { name: 'fattura.pdf', path: 'fatture/inv-1/fattura.pdf', url: 'https://x/y', size: 1024 },
  generata: false,
  storia: [],
}

beforeEach(() => {
  stato.scritture = []
})

describe('la correzione si vede subito e non aspetta niente', () => {
  it('l’importo corretto torna nell’istante del gesto, e la scrittura parte dopo', async () => {
    const dopo = api.modificaFattura(FATTURA, { amount: 130 })
    expect(dopo.amount).toBe(130)
    await giro()
    const scritte = scritture('supplier_invoices')
    expect(scritte).toHaveLength(1)
    expect(scritte[0].patch.amount).toBe(130)
  })

  // NON SI RILEGGE QUELLO CHE SI È APPENA SCRITTO (BUG-045): la cache qui
  // risponde che il documento non esiste. Se `modificaFattura` rileggesse,
  // solleverebbe invece di rispondere.
  it('non rilegge il documento: lo compone su quello che ha in mano', () => {
    const dopo = api.modificaFattura(FATTURA, { number: '1557' })
    expect(dopo.number).toBe('1557')
    expect(dopo.supplier_name).toBe('Nova')
  })
})

describe('si corregge, non si stravolge', () => {
  // È il motivo per cui la voce esiste: prima l'unico modo di cambiare una
  // cifra era cancellare e rifare, e con la cancellazione se ne andavano
  // prodotti, allegato e ordine collegato.
  it('righe, allegato e ordine collegato restano dove sono', async () => {
    const dopo = api.modificaFattura(FATTURA, { amount: 130, date: '2026-08-27' })
    expect(dopo.lines).toHaveLength(1)
    expect(dopo.attachment.path).toBe('fatture/inv-1/fattura.pdf')
    expect(dopo.order_id).toBe('po-1')
    await giro()
    // E non compaiono nemmeno nella patch: quello che non si nomina non si
    // può sovrascrivere per sbaglio.
    const patch = scritture('supplier_invoices')[0].patch
    expect(patch.lines).toBeUndefined()
    expect(patch.attachment).toBeUndefined()
    expect(patch.order_id).toBeUndefined()
    expect(patch.paid).toBeUndefined()
  })

  it('senza niente di cambiato non si scrive niente', async () => {
    const dopo = api.modificaFattura(FATTURA, { amount: 120, number: '1556' })
    expect(dopo).toBe(FATTURA)
    await giro()
    expect(scritture('supplier_invoices')).toEqual([])
  })

  // IL LEGAME CON L'ORDINE È LA COPPIA ORDINE + FORNITORE (REQ-MAG-031):
  // cambiare fornitore sotto un documento agganciato vorrebbe dire merce
  // pagata a chi non l'ha venduta.
  it('il fornitore di un documento agganciato non si cambia di nascosto', async () => {
    expect(() => api.modificaFattura(FATTURA, { supplier_id: 'mar', supplier_name: 'Mar' })).toThrow(
      /scollegalo/
    )
    await giro()
    expect(scritture('supplier_invoices')).toEqual([])
  })
})

describe('la correzione resta scritta sul documento', () => {
  it('la storia dice cosa è cambiato, da cosa a cosa', async () => {
    const dopo = api.modificaFattura(FATTURA, { amount: 130 })
    const voce = dopo.storia.at(-1)
    expect(voce.tipo).toBe('documento_corretto')
    expect(voce.at).toBeTruthy()
    expect(voce.dettaglio.cambi[0].campo).toBe('Importo')
    expect(voce.dettaglio.cambi[0].da).toMatch(/^120,00/)
    expect(voce.dettaglio.cambi[0].a).toMatch(/^130,00/)
    await giro()
    expect(scritture('supplier_invoices')[0].patch.storia).toHaveLength(1)
  })

  // «Mi devono modificare il prezzo di una fattura magari già pagata»
  // (Flavio): è legittimo, ed è anche l'unico caso in cui la correzione va
  // guardata due volte, perché quei soldi sono già usciti.
  it('su un documento già pagato lo dice, ed è il caso di Flavio', () => {
    const pagata = { ...FATTURA, paid: true }
    const dopo = api.modificaFattura(pagata, { amount: 100 })
    // Il documento resta pagato: correggere una cifra non disfà un pagamento.
    expect(dopo.paid).toBe(true)
    expect(dopo.storia.at(-1).dettaglio.pagato).toBe(true)
  })

  it('le correzioni si accumulano, non si sovrascrivono', () => {
    const una = api.modificaFattura(FATTURA, { amount: 130 })
    const due = api.modificaFattura(una, { number: '1557' })
    expect(due.storia).toHaveLength(2)
    expect(due.storia.map((v) => v.tipo)).toEqual(['documento_corretto', 'documento_corretto'])
  })
})

// ── IL CONFRONTO ORDINE ↔ FATTURA SI RIFÀ COI NUMERI NUOVI ───────────
//
// REQ-MAG-038: il confronto non è un valore salvato, si calcola ogni volta
// sul documento in mano. Correggere l'importo lo cambia nello stesso istante,
// e il test lo dimostra invece di darlo per buono — è il posto dove un
// numero congelato non si vedrebbe finché non arriva il commercialista.
describe('correggere l’importo rifà il confronto con l’ordine', () => {
  const ORDINE = {
    id: 'po-1',
    supplier_id: 'nova',
    status: 'ricevuto',
    lines: [
      {
        item_id: 'campari',
        name: 'Campari',
        qty_packages: 4,
        unit_cost: 12,
        unit_cost_ordinato: 12,
        vat: 22,
        stato: 'consegnato',
      },
    ],
  }
  // Senza righe sul documento il confronto è fra i soldi: il netto ricevuto
  // (48) e l'importo del documento, che deve stare fra 48 e 58,56 (lordo).
  const SENZA_RIGHE = { ...FATTURA, lines: [], amount: 120 }

  it('l’importo sbagliato non torna, quello corretto sì', () => {
    expect(totaliProspetto(ORDINE, SENZA_RIGHE).documento).toBe(120)
    expect(riconciliato(ORDINE, SENZA_RIGHE)).toBe(false)

    const corretta = api.modificaFattura(SENZA_RIGHE, { amount: 58.56 })
    expect(totaliProspetto(ORDINE, corretta).documento).toBe(58.56)
    expect(riconciliato(ORDINE, corretta)).toBe(true)
  })
})
