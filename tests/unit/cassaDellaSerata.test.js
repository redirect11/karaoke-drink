// @vitest-environment happy-dom
'use strict'

// ── DUE ORDINI #5 NELLA STESSA SERA (BUG-074) ────────────────────────
//
// «E poi vedi che ci sono due ordini #5» (l'utente, 21/08/2026). Il numero
// del conto è quello che il cliente si sente dire ad alta voce: due conti
// con lo stesso numero, la stessa sera, sono due comande che si scambiano
// di posto al banco.
//
// IL NUMERO NON SI CHIEDE A NESSUNO. Lo dà il contatore che il dispositivo
// ha già in memoria (lib/progressivi.js), e quale contatore sia lo decide
// una domanda sola: c'è una cassa aperta? Se sì il conto si numera dentro
// la SERATA (`cash-<sessione>`), se no dentro la GIORNATA. Sono due
// contatori indipendenti: nella stessa sera danno benissimo lo stesso #5.
//
// IL DIFETTO stava nella terza risposta possibile, che non veniva
// considerata: «non lo so ancora». L'ascolto su `counters/_active_cash`
// riparte da capo a ogni ricaricamento della pagina, e finché non ha
// risposto la cassa risultava CHIUSA — quindi il conto battuto in quella
// finestra prendeva il numero del giorno e nasceva perfino senza serata
// (`cash_session_id: null`), invisibile alla chiusura di cassa. E il
// numero doppio non lo raccoglieva nemmeno la rete di sicurezza del
// server (`risolviNumeroDuplicato`): il conto orfano si confronta coi
// conti della GIORNATA, ma il conto regolare che arriva dopo si confronta
// coi soli conti della SUA serata, e l'orfano lì dentro non c'è.
//
// LA CURA, e resta local-first: non si aspetta niente e nessuno: ci si
// RICORDA l'ultima cassa che si sapeva aperta, come già si fa coi numeri
// assegnati. Un ricaricamento non fa più dimenticare in che serata si sta.
// La memoria vale per la giornata commerciale in cui è stata scritta —
// quella di ieri non è una risposta — e il server la corregge appena
// risponde.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {})
const scritture = []
// Gli ascolti aperti, per id di documento, e quello che il server ha da
// dire su ciascuno. È il punto di tutta la prova: un documento che NON sta
// in `datiServer` è un ascolto che non ha ancora risposto.
const ascolti = new Map()
const datiServer = new Map()

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1', email: 'banco@tana.it', displayName: 'Banco' } },
  functions: {},
  storage: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: (_db, col, id) => ({ col: col || 'orders', id: id || 'ord-1' }),
  // La cache risponde con quello che è stato appena scritto: il conto
  // appena creato si legge senza rete, come in produzione.
  getDoc: vi.fn(async (ref) => {
    const scritta = scritture.findLast((s) => s.id === ref.id)
    return { exists: () => !!scritta, id: ref.id, data: () => scritta?.data ?? {} }
  }),
  getDocFromCache: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(() => mai()),
  setDoc: vi.fn((ref, data) => {
    scritture.push({ id: ref.id, data })
    return mai()
  }),
  updateDoc: vi.fn(() => mai()),
  deleteDoc: vi.fn(() => mai()),
  query: () => ({}),
  where: () => ({}),
  documentId: () => 'id',
  orderBy: () => ({}),
  limit: () => ({}),
  // COME FA FIRESTORE: chi si mette in ascolto riceve SUBITO quello che c'è
  // in cache, e poi gli aggiornamenti. Quello che in cache non c'è arriva
  // dalla rete — cioè, per un attimo, non arriva.
  onSnapshot: (ref, cb) => {
    ascolti.set(ref.id, cb)
    if (datiServer.has(ref.id)) cb(istantanea(datiServer.get(ref.id)))
    return () => ascolti.delete(ref.id)
  },
  serverTimestamp: () => null,
  increment: (n) => n,
  writeBatch: () => ({ update: vi.fn(), set: vi.fn(), commit: () => mai() }),
  Timestamp: class Timestamp {
    static fromDate(d) { return d }
    static fromMillis(m) { return m }
  },
}))

const api = await import('../../src/lib/api.js')
const {
  avviaProgressivi,
  cassaCorrente,
  _azzeraProgressivi,
  _ricaricaProgressivi,
} = await import('../../src/lib/progressivi.js')
const { businessDayKey, DEFAULT_CUTOFF_HOUR } = await import('../../src/lib/businessDay.js')

const istantanea = (dati) => ({ exists: () => dati != null, data: () => dati })

// Quello che il server sa (e che la cache serve subito a chi ascolta).
const ilServerSa = (id, dati) => {
  datiServer.set(id, dati)
  ascolti.get(id)?.(istantanea(dati))
}
// Un documento che non risponde: l'ascolto c'è, la risposta no.
const ilServerTace = (id) => datiServer.delete(id)

const oggi = () => businessDayKey(new Date(), DEFAULT_CUTOFF_HOUR)
const battiUnConto = () =>
  api.createOrder({ items: [{ drink_id: 'negroni', name: 'Negroni', qty: 1, price: 8 }] })
const ultimoConto = () => scritture.findLast((s) => s.data?.daily_number != null).data

beforeEach(() => {
  localStorage.clear()
  scritture.length = 0
  ascolti.clear()
  datiServer.clear()
  _azzeraProgressivi()
})

describe('la serata non si dimentica a ogni ricaricamento', () => {
  it('il primo conto dopo un ricarico non ricomincia dal contatore del giorno', async () => {
    // PRIMA SERA. Il server dice qual è la cassa aperta e a che numero è
    // arrivata la serata: quattro conti battuti. Anche la GIORNATA ha il suo
    // contatore, ed è fermo a quattro — sono i conti di prima che la cassa
    // aprisse. Due contatori indipendenti, tutti e due a quota 4.
    ilServerSa('_active_cash', { session_id: 'cassa-1' })
    ilServerSa('cash-cassa-1', { last: 4 })
    ilServerSa(oggi(), { last: 4 })
    avviaProgressivi()
    await battiUnConto()
    expect(ultimoConto().daily_number).toBe(5) // il #5 della serata

    // IL RICARICAMENTO. La pagina riparte e gli ascolti sono da rifare. I
    // contatori li serve la cache, ma su `_active_cash` la risposta non è
    // ancora arrivata: è la finestra in cui prima la cassa risultava chiusa.
    ilServerSa('cash-cassa-1', { last: 5 })
    ilServerTace('_active_cash')
    _ricaricaProgressivi()
    avviaProgressivi()
    expect(ascolti.has('_active_cash')).toBe(true) // l'ascolto c'è…
    expect(cassaCorrente()).toBe('cassa-1') // …e intanto vale quel che si sa

    await battiUnConto()
    const conto = ultimoConto()
    // IL NUMERO CONTINUA LA SERIE DELLA SERATA. Prima il conto si numerava
    // sul contatore del giorno, fermo a 4: usciva un SECONDO #5, quello che
    // l'utente si è trovato in coda.
    expect(conto.daily_number).toBe(6)
    // E APPARTIENE ALLA SERATA. Prima nasceva con `cash_session_id: null` —
    // fuori dalla cassa, quindi fuori dalla sua chiusura: è la seconda metà
    // dello stesso difetto, quella che non si vede in coda.
    expect(conto.cash_session_id).toBe('cassa-1')
    // Il contatore che si muove è quello della serata, non quello del giorno.
    expect(scritture.filter((s) => s.id === 'cash-cassa-1')).toHaveLength(2)
    expect(scritture.some((s) => s.id === oggi())).toBe(false)
  })

  it('la cassa di ieri non è una risposta: quella si scorda', async () => {
    // Una memoria vecchia sarebbe peggio del difetto: numererebbe i conti di
    // stasera dentro la serata di ieri, e la chiusura di ieri non torna più.
    // Vale solo per la giornata commerciale in cui è stata scritta.
    localStorage.setItem(
      'tana:cassa-aperta',
      JSON.stringify({ id: 'cassa-di-ieri', giorno: '2020-01-01' })
    )
    ilServerSa(oggi(), { last: 2 })
    _ricaricaProgressivi()
    avviaProgressivi()
    expect(cassaCorrente()).toBe(null)
    await battiUnConto()
    expect(ultimoConto().cash_session_id).toBe(null)
    expect(ultimoConto().daily_number).toBe(3)
  })

  it('e quando il server dice che nessuna cassa è aperta, la memoria sparisce', async () => {
    // «Non lo so ancora» e «non c'è» sono due cose diverse: la seconda è una
    // risposta, e cancella quello che ci si ricordava.
    ilServerSa('_active_cash', { session_id: 'cassa-1' })
    avviaProgressivi()
    expect(cassaCorrente()).toBe('cassa-1')
    ilServerSa('_active_cash', { session_id: null })
    _ricaricaProgressivi()
    avviaProgressivi()
    expect(cassaCorrente()).toBe(null)
  })
})
