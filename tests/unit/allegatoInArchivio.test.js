// @vitest-environment happy-dom
'use strict'

// ── L'ALLEGATO DI UNA FATTURA, DAL FILE ALL'ARCHIVIO (REQ-MAG-033) ───
//
// L'utente, 20/08: «Allegare = il documento vero (foto/PDF), non solo un
// numero. Serve lo Storage».
//
// Le cose che qui costano davvero sono tre: che la foto del telefono venga
// RIDOTTA prima di partire (chi scatta è in magazzino, con la connessione
// del locale), che una sostituzione non butti via il vecchio file prima di
// avere il nuovo, e che il file di una fattura cancellata non resti orfano
// su Storage — nessuno saprebbe più di chi era.
//
// COM'È FATTO QUESTO TEST: si mockano SOLO i confini, cioè `firebase/firestore`
// e `firebase/storage`. `src/lib/api.js`, `src/lib/storage.js` e
// `src/lib/allegati.js` sono quelli veri — se no si proverebbe il mock e non
// il codice. Le scritture su Firestore restano appese per sempre, che è
// quello che fa davvero una cache mentre la scrittura è in coda.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {})
const stato = {
  fattura: null,
  scritture: [],
  caricati: [],
  cancellati: [],
  cancellaFallisce: false,
  caricamentoFallisce: false,
  canvas: null,
}

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
  addDoc: vi.fn(() => mai()),
  setDoc: vi.fn(() => mai()),
  updateDoc: vi.fn((ref, patch) => {
    stato.scritture.push({ tipo: 'update', col: ref?.col, id: ref?.id, patch })
    return mai()
  }),
  // La cancellazione di una fattura invece SI ASPETTA: è quella che deve
  // essere finita prima che il file se ne vada dietro.
  deleteDoc: vi.fn((ref) => {
    stato.scritture.push({ tipo: 'delete', col: ref?.col, id: ref?.id })
    return Promise.resolve()
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

vi.mock('firebase/storage', () => ({
  ref: (_s, path) => ({ path }),
  uploadBytes: vi.fn(async (r, dati, meta) => {
    if (stato.caricamentoFallisce) throw new Error('rete assente')
    stato.caricati.push({ path: r.path, size: dati?.size, contentType: meta?.contentType })
  }),
  getDownloadURL: vi.fn(async (r) => `https://storage/${r.path}?token=abc`),
  deleteObject: vi.fn(async (r) => {
    if (stato.cancellaFallisce) throw new Error('non trovato')
    stato.cancellati.push(r.path)
  }),
}))

// happy-dom non decodifica immagini vere: si finge una fotografia da 4000×3000
// (uno scatto di telefono) e un canvas che dice quanto pesa quello che esce.
class ImmagineFinta {
  set src(_v) {
    this.width = 4000
    this.height = 3000
    setTimeout(() => this.onload?.(), 0)
  }
}

function preparaBrowser() {
  globalThis.Image = ImmagineFinta
  URL.createObjectURL = () => 'blob:finto'
  URL.revokeObjectURL = () => {}
  const canvas = globalThis.HTMLCanvasElement.prototype
  canvas.getContext = () => ({ drawImage: () => {} })
  canvas.toBlob = function toBlob(cb, tipo, qualita) {
    stato.canvas = { larghezza: this.width, altezza: this.height, tipo, qualita }
    cb({ size: 380 * 1024, type: tipo })
  }
}

const api = await import('../../src/lib/api.js')

// Se una chiamata restasse appesa il test fallirebbe per timeout, che è lo
// stesso sintomo del banco: il tasto premuto e niente che succede.
const subito = (p) =>
  Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('rimasto appeso')), 2000))])

const FATTURA = {
  supplier_id: 'nova',
  supplier_name: 'Nova',
  number: '1556',
  doc_type: 'Fattura',
  date: '2026-08-26',
  amount: 81,
  paid: false,
  lines: [],
}

// Uno scatto di una fattura A4 col telefono: cinque mega, il caso normale.
const SCATTO = { type: 'image/jpeg', size: 5 * 1024 * 1024, name: 'IMG_1420.jpg' }
const PDF = { type: 'application/pdf', size: 420 * 1024, name: 'fattura-1556.pdf' }

beforeEach(() => {
  vi.clearAllMocks()
  stato.fattura = { ...FATTURA }
  stato.scritture = []
  stato.caricati = []
  stato.cancellati = []
  stato.cancellaFallisce = false
  stato.caricamentoFallisce = false
  stato.canvas = null
  preparaBrowser()
})

describe('la foto del telefono si riduce prima di partire', () => {
  // Cinque mega dalla connessione del magazzino sono un minuto di attesa e
  // un mega di traffico per ogni fattura. Ridotta a duemila punti sul lato
  // lungo la fattura si legge ancora — è quello che serve — e pesa mezzo.
  it('uno scatto da 5 MB parte ridotto, e non com’era', async () => {
    await subito(api.allegaDocumentoAFattura('inv-1', SCATTO))

    expect(stato.canvas).toMatchObject({ larghezza: 2000, altezza: 1500, tipo: 'image/jpeg' })
    expect(stato.caricati).toHaveLength(1)
    expect(stato.caricati[0].size).toBe(380 * 1024)
    expect(stato.caricati[0].contentType).toBe('image/jpeg')
  })

  // IL PDF NON SI TOCCA: ricomprimerlo vorrebbe dire rovinare il testo, che
  // è esattamente la cosa da leggere. Si accetta o si rifiuta.
  it('un PDF sale com’è', async () => {
    await subito(api.allegaDocumentoAFattura('inv-1', PDF))
    expect(stato.canvas).toBeNull()
    expect(stato.caricati[0]).toMatchObject({ size: 420 * 1024, contentType: 'application/pdf' })
    expect(stato.caricati[0].path).toMatch(/^fatture\/inv-1\/.*\.pdf$/)
  })

  // Il limite si dice PRIMA, e con una frase che dice cosa fare: non si
  // aspetta che sia Storage a rifiutare un file già partito.
  it('un formato che non si può allegare non parte nemmeno', async () => {
    await expect(
      subito(api.allegaDocumentoAFattura('inv-1', { type: 'image/heic', size: 3e6, name: 'IMG.HEIC' }))
    ).rejects.toThrow(/JPG/)
    expect(stato.caricati).toHaveLength(0)
    expect(stato.scritture).toHaveLength(0)
  })
})

describe('quello che si scrive sulla fattura', () => {
  it('l’allegato si scrive in sottofondo e il documento si compone, non si rilegge', async () => {
    const agg = await subito(api.allegaDocumentoAFattura('inv-1', PDF))

    // Il risultato lo si ha SUBITO, con l'allegato dentro, mentre la
    // scrittura è ancora appesa (BUG-045: rileggere avrebbe dato il passato).
    expect(agg.attachment).toMatchObject({
      name: 'fattura-1556.pdf',
      content_type: 'application/pdf',
      size: 420 * 1024,
    })
    expect(agg.attachment.url).toMatch(/^https:\/\/storage\//)
    // Il percorso si scrive accanto all'URL: senza, il file non si potrebbe
    // più cancellare.
    expect(agg.attachment.path).toBe(stato.caricati[0].path)
    expect(agg.number).toBe('1556')

    const scritta = stato.scritture.find((s) => s.tipo === 'update')
    expect(scritta.col).toBe('supplier_invoices')
    expect(scritta.patch.attachment.path).toBe(agg.attachment.path)
  })

  it('togliere l’allegato lo cancella davvero', async () => {
    stato.fattura = { ...FATTURA, attachment: { url: 'https://storage/x', path: 'fatture/inv-1/vecchio.jpg' } }
    const agg = await subito(api.togliAllegatoDaFattura('inv-1'))

    expect(agg.attachment).toBeNull()
    expect(stato.scritture[0].patch).toEqual({ attachment: null })
    // Tenerlo su Storage senza niente che lo nomini sarebbe lo stesso orfano
    // di una fattura eliminata.
    expect(stato.cancellati).toEqual(['fatture/inv-1/vecchio.jpg'])
  })
})

describe('sostituire non butta via prima di avere', () => {
  it('il vecchio file se ne va solo dopo che il nuovo è su', async () => {
    stato.fattura = { ...FATTURA, attachment: { url: 'https://storage/x', path: 'fatture/inv-1/vecchio.jpg' } }
    const agg = await subito(api.allegaDocumentoAFattura('inv-1', PDF))

    expect(stato.caricati).toHaveLength(1)
    expect(stato.cancellati).toEqual(['fatture/inv-1/vecchio.jpg'])
    expect(agg.attachment.path).not.toBe('fatture/inv-1/vecchio.jpg')
  })

  // È IL CASO CHE FA IL DANNO: la rete cade a metà sostituzione. Se il
  // vecchio file fosse già stato cancellato, la fattura resterebbe senza
  // carta e nessuno se ne accorgerebbe fino a fine mese.
  it('se il caricamento non riesce, l’allegato di prima è ancora lì', async () => {
    stato.fattura = { ...FATTURA, attachment: { url: 'https://storage/x', path: 'fatture/inv-1/vecchio.jpg' } }
    stato.caricamentoFallisce = true

    await expect(subito(api.allegaDocumentoAFattura('inv-1', PDF))).rejects.toThrow()
    expect(stato.cancellati).toEqual([])
    expect(stato.scritture).toHaveLength(0)
  })
})

describe('chi cancella la fattura porta via anche l’allegato', () => {
  // Senza il documento che lo nomina, quel file resterebbe su Storage per
  // sempre e nessuno saprebbe più di chi era né perché è lì.
  it('il file non resta orfano', async () => {
    stato.fattura = { ...FATTURA, attachment: { url: 'https://storage/x', path: 'fatture/inv-1/doc.pdf' } }
    await subito(api.deleteSupplierInvoice('inv-1'))

    expect(stato.scritture.some((s) => s.tipo === 'delete')).toBe(true)
    expect(stato.cancellati).toEqual(['fatture/inv-1/doc.pdf'])
  })

  // La cancellazione del file è un tentativo, non una condizione: la
  // fattura se ne va comunque, e un file già assente non è un motivo per
  // lasciare in pagina un documento che l'utente ha appena eliminato.
  it('se il file non si riesce a cancellare, la fattura se ne va lo stesso', async () => {
    stato.fattura = { ...FATTURA, attachment: { url: 'https://storage/x', path: 'fatture/inv-1/doc.pdf' } }
    stato.cancellaFallisce = true
    await expect(subito(api.deleteSupplierInvoice('inv-1'))).resolves.toBeUndefined()
    expect(stato.scritture.some((s) => s.tipo === 'delete')).toBe(true)
  })

  it('una fattura senza allegato si cancella come sempre', async () => {
    await subito(api.deleteSupplierInvoice('inv-1'))
    expect(stato.cancellati).toEqual([])
  })
})
