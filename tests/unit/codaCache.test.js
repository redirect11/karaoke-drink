// @vitest-environment happy-dom
'use strict'

// LA CODA PARTE DALLA CACHE, POI SI ALLINEA AL SERVER.
//
// Firestore è local-first, ma onSnapshot risponde subito col dato locale solo
// quando SA di essere offline. Con una rete collegata che non passa (wifi del
// locale, portale captive, DNS muto) l'SDK crede di essere online e aspetta il
// server: la coda restava sullo spinner pur avendo tutti gli ordini in cache.
//
// Qui si verifica che la cache dia il primo risultato SUBITO e che il listener
// continui comunque a lavorare in sottofondo, sovrascrivendo con quello che
// arriva dal server appena la rete torna.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ordiniInCoda } from '../../src/lib/coda.js'
import { contoChiuso } from '../../src/lib/comande.js'

// Documenti finti: `data()` restituisce il documento grezzo, come Firestore.
const docFinto = (id, data) => ({ id, data: () => data })

const stato = {
  cache: { aperti: [], recenti: [] },
  listeners: [], // { tipo, cb }
}

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: null },
  functions: {},
  storage: {},
}))

vi.mock('firebase/firestore', () => {
  // `where` e `query` conservano abbastanza informazione da capire QUALE
  // delle due query è: gli aperti filtrano su `status`, i recenti su `created_at`.
  const where = (field, op, value) => ({ field, op, value })
  const query = (_col, ...clausole) => ({
    tipo: clausole.find((c) => c.field === 'closed_in_session')
      ? 'chiusi-qui'
      : clausole.find((c) => c.field === 'status')
        ? 'aperti'
        : 'recenti',
  })
  return {
    collection: () => ({}),
    doc: () => ({}),
    addDoc: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    getDocsFromCache: vi.fn(async (q) => ({ docs: stato.cache[q.tipo] || [] })),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    query,
    where,
    documentId: () => 'id',
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: (q, cb) => {
      stato.listeners.push({ tipo: q.tipo, cb })
      return () => {}
    },
    serverTimestamp: () => null,
    increment: (n) => n,
    writeBatch: vi.fn(),
    // Classe, non oggetto: mapOrder fa `instanceof Timestamp` per capire se
    // una data è un timestamp di Firestore.
    Timestamp: class Timestamp {
      static fromDate(d) {
        return d
      }
      static fromMillis(m) {
        return m
      }
    },
  }
})

const { subscribeActiveOrders } = await import('../../src/lib/api.js')

const ordine = (id, nome) => ({
  status: 'aperto',
  customer_name: nome,
  daily_number: 1,
  created_at: '2026-08-09T20:00:00.000Z',
  comande: [],
  payments: [],
})

describe('coda: prima la cache, poi il server', () => {
  beforeEach(() => {
    stato.cache = { aperti: [], recenti: [] }
    stato.listeners = []
  })

  it('con la cache piena gli ordini compaiono senza aspettare il server', async () => {
    stato.cache.aperti = [docFinto('a', ordine('a', 'dalla cache'))]
    const visti = []
    subscribeActiveOrders((list) => visti.push(list))
    // Nessun listener ha ancora risposto: il server sta zitto.
    await vi.waitFor(() => expect(visti.length).toBeGreaterThan(0))
    expect(visti[0].map((o) => o.customer_name)).toEqual(['dalla cache'])
  })

  it('il listener resta attivo e allinea al server quello che arriva dopo', async () => {
    stato.cache.aperti = [docFinto('a', ordine('a', 'dalla cache'))]
    const visti = []
    subscribeActiveOrders((list) => visti.push(list))
    await vi.waitFor(() => expect(visti.length).toBeGreaterThan(0))

    // Ora la rete torna: il listener degli aperti consegna il dato del server.
    const l = stato.listeners.find((x) => x.tipo === 'aperti')
    expect(l).toBeTruthy() // la sottoscrizione non è stata sostituita dalla cache
    l.cb({ docs: [docFinto('a', ordine('a', 'dal server')), docFinto('b', ordine('b', 'nuovo'))] })

    const ultimo = visti[visti.length - 1]
    expect(ultimo.map((o) => o.customer_name)).toEqual(['dal server', 'nuovo'])
  })

  it('senza cache non si inventa niente: si aspetta il server, come prima', async () => {
    const visti = []
    subscribeActiveOrders((list) => visti.push(list))
    await new Promise((r) => setTimeout(r, 10))
    expect(visti).toHaveLength(0)
    stato.listeners.find((x) => x.tipo === 'aperti').cb({ docs: [docFinto('a', ordine('a', 'dal server'))] })
    expect(visti[visti.length - 1].map((o) => o.customer_name)).toEqual(['dal server'])
  })

  it('il dato del server non viene ricoperto dalla cache che arriva tardi', async () => {
    stato.cache.aperti = [docFinto('z', ordine('z', 'vecchio in cache'))]
    const visti = []
    subscribeActiveOrders((list) => visti.push(list))
    // Il server risponde PRIMA che la lettura dalla cache si completi.
    stato.listeners.find((x) => x.tipo === 'aperti').cb({ docs: [docFinto('a', ordine('a', 'dal server'))] })
    await new Promise((r) => setTimeout(r, 10))
    expect(visti[visti.length - 1].map((o) => o.customer_name)).toEqual(['dal server'])
  })
})

// ANNULLO UN CONTO E LO DEVO RITROVARE SOTTO «ANNULLATI». Sembra ovvio, e
// invece non succedeva: un conto aperto ieri e annullato stasera usciva
// dall'elenco dei conti APERTI e non entrava in quello di oggi — che guarda
// la data di apertura — quindi spariva dallo schermo nell'istante in cui lo
// si annullava. Si agisce su un conto e quello svanisce: non si sa nemmeno
// se l'operazione è andata a buon fine.
//
// Il test parte dai dati come ARRIVANO (le query di Firestore) e finisce
// dove guarda chi lavora (la tab). Provare le regole a pezzi dimostrava che
// funzionavano tutte mentre a schermo non c'era niente.
describe('un conto annullato finisce nella tab Annullati', () => {
  const CASSA = 'cassa-di-stasera'
  const APERTA_DA = '2026-08-16T18:00:00.000Z'

  const annullatoStasera = {
    status: 'annullato',
    customer_name: 'Peppe',
    daily_number: 7,
    // Aperto DUE GIORNI FA e rimasto lì: è il caso che spariva.
    created_at: '2026-08-14T21:00:00.000Z',
    order_date: '2026-08-14',
    cash_session_id: 'una-cassa-vecchia',
    closed_in_session: CASSA,
    status_times: { annullato: '2026-08-16T23:40:00.000Z' },
    comande: [],
    payments: [],
  }

  beforeEach(() => {
    stato.cache = { aperti: [], recenti: [] }
    stato.listeners = []
  })

  it('lo si vede anche se il conto era di due giorni fa', async () => {
    const visti = []
    subscribeActiveOrders((list) => visti.push(list), null, { cashSessionId: CASSA })

    // Le due query di sempre non lo contengono: non è più aperto, e non è
    // nato oggi. A trovarlo è l'ascolto sui conti chiusi in QUESTA cassa.
    stato.listeners.find((x) => x.tipo === 'aperti').cb({ docs: [] })
    stato.listeners.find((x) => x.tipo === 'recenti').cb({ docs: [] })
    const chiusiQui = stato.listeners.find((x) => x.tipo === 'chiusi-qui')
    expect(chiusiQui).toBeTruthy()
    chiusiQui.cb({ docs: [docFinto('vecchio', annullatoStasera)] })

    const dallaCoda = visti[visti.length - 1]
    expect(dallaCoda).toHaveLength(1)

    // E adesso la parte che guarda chi lavora: la tab Annullati.
    const opzioni = {
      isChiuso: (o) => contoChiuso(o, { workflowOn: true }),
      cassa: CASSA,
      apertaDa: APERTA_DA,
      giornataDi: (o) => o.order_date,
      oggi: '2026-08-16',
    }
    expect(ordiniInCoda(dallaCoda, { ...opzioni, filtro: 'annullati' })).toHaveLength(1)
    expect(ordiniInCoda(dallaCoda, { ...opzioni, filtro: 'tutti' })).toHaveLength(1)
    // Non è un incasso: fra i chiusi non ci va, e in corso nemmeno.
    expect(ordiniInCoda(dallaCoda, { ...opzioni, filtro: 'chiusi' })).toHaveLength(0)
    expect(ordiniInCoda(dallaCoda, { ...opzioni, filtro: 'attivi' })).toHaveLength(0)
  })

  it('quello annullato in una cassa precedente non torna a galla', async () => {
    const visti = []
    subscribeActiveOrders((list) => visti.push(list), null, { cashSessionId: CASSA })
    stato.listeners.find((x) => x.tipo === 'aperti').cb({ docs: [] })
    stato.listeners
      .find((x) => x.tipo === 'recenti')
      .cb({
        docs: [
          docFinto('altraserata', {
            ...annullatoStasera,
            closed_in_session: 'cassa-di-ieri',
            status_times: { annullato: '2026-08-15T23:00:00.000Z' },
          }),
        ],
      })
    const dallaCoda = visti[visti.length - 1] || []
    expect(
      ordiniInCoda(dallaCoda, {
        filtro: 'annullati',
        isChiuso: (o) => contoChiuso(o, { workflowOn: true }),
        cassa: CASSA,
        apertaDa: APERTA_DA,
        giornataDi: (o) => o.order_date,
        oggi: '2026-08-16',
      })
    ).toHaveLength(0)
  })

  it('senza cassa aperta non si ascolta niente di chiuso', () => {
    subscribeActiveOrders(() => {}, null, {})
    expect(stato.listeners.find((x) => x.tipo === 'chiusi-qui')).toBeFalsy()
  })
})
