// @vitest-environment happy-dom
'use strict'

// ── CHIUDERE LA CASSA SENZA RETE (BUG-098) ───────────────────────────
//
// La chiusura di cassa è l'ultimo gesto della serata, e capita spesso col
// locale già mezzo chiuso e il Wi-Fi che fa quello che vuole. Vale quindi
// la regola di tutte le altre: si scrive in sottofondo e l'esito si vede
// nell'istante del gesto — mai «quando sincronizza».
//
// E DA BUG-098 C'È UNA COSA IN PIÙ DA SORVEGLIARE: la stampa adesso
// racconta com'è andata, con un avviso quando la carta non esce. Ma quel
// racconto arriva DOPO e per conto suo — il ripensamento del 01/09/2026 ha
// tolto l'attesa che la prima stesura ci aveva messo — e non deve mai
// trattenere la chiusura: la cassa si chiude e basta, il foglio è una
// conseguenza.
//
// Come il modello (`giroInLocale.test.js`): non si mocka `api.js` — si
// proverebbe il mock — si mocka SOLO Firestore, e nel modo più cattivo
// possibile: ogni scrittura resta appesa per sempre.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {}) // una Promise che non si risolve mai
const scritture = []

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1', email: 'flavio@tana.it' } },
  functions: {},
  storage: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: (_db, col, id) => ({ col, id }),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocFromCache: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(() => mai()),
  setDoc: vi.fn((ref, data) => {
    scritture.push({ tipo: 'set', ref, data })
    return mai()
  }),
  updateDoc: vi.fn((ref, patch) => {
    scritture.push({ tipo: 'update', ref, patch })
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
    static fromDate(d) { return d }
    static fromMillis(m) { return m }
  },
}))

const api = await import('../../src/lib/api.js')

// Se una chiamata restasse appesa il test fallirebbe per timeout, che è lo
// stesso sintomo del banco: il tasto premuto e niente che succede.
const subito = (p) =>
  Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('rimasto appeso')), 1000))])

const RECAP = {
  incassato: 430,
  nPagati: 18,
  sconti: 0,
  fondo: 50,
  byMethod: { banco: 200, carta: 130, lettore: 80, online: 20, buono: 0 },
  contanteAtteso: 250,
  apertoDaIncassare: 0,
  nAperti: 0,
}
const SESSIONE = { id: 's1', opened_at: '2026-08-28T17:00:00.000Z' }

let finestre

beforeEach(() => {
  scritture.length = 0
  finestre = []
  localStorage.clear()
  window.open = vi.fn(() => {
    const scritto = []
    finestre.push(scritto)
    return { document: { write: (h) => scritto.push(h), close: () => {} }, focus: () => {} }
  })
  window.Image = class {
    set src(_v) {
      queueMicrotask(() => this.onerror?.(new Error('404')))
    }
  }
})

describe('la cassa si chiude anche con la rete staccata', () => {
  it('chiudere non restituisce niente da aspettare: il gesto ha già effetto', async () => {
    // `closeCashSession` non torna una Promise: chi la chiama non ha
    // NIENTE su cui mettere un `await`, ed è la difesa migliore possibile
    // contro chi domani ce lo metterebbe.
    const esito = api.closeCashSession(SESSIONE.id, {
      by: { email: 'flavio@tana.it' },
      snapshot: RECAP,
      countedCash: '265',
    })
    expect(esito).toBe(undefined)

    // Le due scritture sono partite lo stesso, appese in coda: la sessione
    // chiusa e il puntatore della cassa aperta svuotato.
    expect(scritture).toHaveLength(2)
    const chiusura = scritture.find((s) => s.tipo === 'update')
    expect(chiusura.patch.status).toBe('closed')
    expect(chiusura.patch.counted_cash).toBe(265)
    // La differenza si calcola qui, in locale, e non si va a rileggere
    // niente per saperla: 265 contati contro 250 attesi.
    expect(chiusura.patch.difference).toBe(15)
    expect(chiusura.patch.snapshot).toEqual(RECAP)
  })

  it('e la stampa non la trattiene: il foglio parte per conto suo', async () => {
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    api.closeCashSession(SESSIONE.id, { by: null, snapshot: RECAP, countedCash: null })
    // La stampa si chiede DOPO, e nessuno la aspetta: al banco la cassa è
    // già chiusa nell'istante in cui si è toccato il tasto.
    const stampa = printChiusuraCassa(RECAP, SESSIONE, {})
    expect(scritture).toHaveLength(2) // la chiusura è già scritta, senza aspettare la carta

    await subito(stampa)
    expect(finestre).toHaveLength(1)
  })

  it('la stampante spenta non riapre la cassa: la chiusura resta scritta', async () => {
    // È la promessa scritta nei due riquadri della chiusura, e la metà che
    // conta al banco: «se la stampante non risponde, la cassa resta
    // comunque chiusa».
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    // Nessuna finestra: il browser blocca il facsimile. Basta a rendere il
    // giro «senza carta» senza inventare un guasto.
    window.open = vi.fn(() => null)
    const errori = vi.spyOn(console, 'info').mockImplementation(() => {})
    api.closeCashSession(SESSIONE.id, { by: null, snapshot: RECAP, countedCash: null })
    await subito(printChiusuraCassa(RECAP, SESSIONE, {}).catch(() => {}))
    errori.mockRestore()

    const chiusura = scritture.find((s) => s.tipo === 'update')
    expect(chiusura.patch.status).toBe('closed')
  })
})
