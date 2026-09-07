// @vitest-environment happy-dom
'use strict'

// ── LA CODA GUARDA LA MEMORIA, COME IL SINGOLO CONTO (BUG-099) ───────
//
// Il guaio, parole di chi stava al banco: «dopo che riscuoto il conto e
// torna automaticamente alla coda ordini, vedo per un attimo scomparire
// l'ordine nella coda. Quando torno alla coda non voglio vedere quell'ordine
// scomparire: deve essere già andato via».
//
// LA CAUSA. Una mutazione di un conto manda la scrittura in sottofondo e
// RICORDA com'è il conto dopo (`ricordaOrdine`, lib/mutazioniOrdine.js). Quel
// ricordo però era consultato in un posto solo su due: rileggendo UN conto
// (`leggiOrdine`), mai componendo la LISTA della coda — che si dipinge dalla
// cache di Firestore, e nell'istante del gesto la cache ha ancora la versione
// di prima. Una memoria e due letture, e una non la guardava.
//
// COME È FATTO QUESTO TEST, ed è il punto: la rete non c'è, e non c'è nel
// modo più cattivo possibile (stessa impalcatura di giroInLocale.test.js).
// Ogni scrittura resta appesa PER SEMPRE e ogni lettura — cache compresa —
// risponde col documento di PRIMA, che è esattamente quello che fa una cache
// mentre la scrittura è in coda. Si mocka solo `firebase/firestore`: quello
// che si prova è il codice vero, non un mock di `api.js`.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { contoChiuso } from '../../src/lib/comande.js'
import { ordiniInCoda } from '../../src/lib/coda.js'

const mai = () => new Promise(() => {}) // una Promise che non si risolve mai

// LA CACHE: i documenti come stavano PRIMA del gesto. Non si aggiorna da
// sola, apposta — chi rilegge, qui, rilegge il passato.
const stato = {
  docs: new Map(), // id -> documento grezzo
  listeners: [], // { tipo, cb }
  scritture: [], // { id, patch }
  cache: { aperti: [], recenti: [], 'chiusi-qui': [] },
}

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1', email: 'banco@tana.it', displayName: 'Banco' } },
  functions: {},
  storage: {},
}))

vi.mock('firebase/firestore', () => {
  let seq = 0
  const collection = (_db, name) => ({ name })
  // `doc(db, col, id)`, `doc(colRef, id)` e `doc(colRef)` (id generato).
  const doc = (a, b, c) => {
    if (c !== undefined) return { col: b, id: c }
    if (b !== undefined) return { col: a?.name ?? null, id: b }
    return { col: a?.name ?? null, id: `gen-${++seq}` }
  }
  const leggi = async (ref) => {
    if (ref?.col === 'orders' && stato.docs.has(ref.id)) {
      return { exists: () => true, id: ref.id, data: () => stato.docs.get(ref.id) }
    }
    return { exists: () => false, id: ref?.id, data: () => ({}) }
  }
  const where = (field, op, value) => ({ field, op, value })
  // Quale delle tre query è: gli aperti filtrano su `status`, i chiusi in
  // cassa su `closed_in_session`, i recenti su `created_at`.
  const query = (_col, ...clausole) => ({
    tipo: clausole.find((c) => c.field === 'closed_in_session')
      ? 'chiusi-qui'
      : clausole.find((c) => c.field === 'status')
        ? 'aperti'
        : 'recenti',
  })
  return {
    collection,
    doc,
    getDoc: vi.fn(leggi),
    getDocFromCache: vi.fn(leggi),
    getDocs: vi.fn(async () => ({ docs: [] })),
    getDocsFromCache: vi.fn(async (q) => ({ docs: stato.cache[q.tipo] || [] })),
    addDoc: vi.fn(() => mai()),
    setDoc: vi.fn(() => mai()),
    updateDoc: vi.fn((ref, patch) => {
      stato.scritture.push({ id: ref?.id, patch })
      return mai()
    }),
    deleteDoc: vi.fn(() => mai()),
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
    writeBatch: () => ({ update: vi.fn(), set: vi.fn(), commit: () => mai() }),
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

const api = await import('../../src/lib/api.js')
const { _azzeraMutazioni } = await import('../../src/lib/mutazioniOrdine.js')

const STATI_APERTI = ['aperto', 'ricevuto', 'in_preparazione', 'pronto', 'ritirato']

const riga = (nome, qty, prezzo) => ({
  drink_id: nome.toLowerCase(),
  name: nome,
  qty,
  unit_price: prezzo,
})

// Un conto di stasera: due drink, una comanda ancora da fare. `created_at` è
// ADESSO, così la giornata commerciale del conto e quella di «oggi» sono la
// stessa qualunque sia l'ora in cui gira il test.
const conto = (extra = {}) => ({
  status: 'aperto',
  payment_status: 'non_richiesto',
  daily_number: 21,
  customer_name: 'Lele',
  total: 11,
  discount_amount: 0,
  payments: [],
  items: [riga('Negroni', 1, 7), riga('Americano', 1, 4)],
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: 'ricevuto',
      items: [riga('Negroni', 1, 7), riga('Americano', 1, 4)],
      inventory_applied: false,
    },
  ],
  created_at: new Date().toISOString(),
  ...extra,
})

const snapDi = (id) => ({
  id,
  exists: () => true,
  data: () => stato.docs.get(id),
})

// LO SNAPSHOT COME LO DÀ LA CACHE: gli stessi documenti di prima, in tutte e
// tre le query. È il momento esatto in cui si torna alla coda dopo un gesto.
function mandaDallaCache({ cassa = null } = {}) {
  const tutti = [...stato.docs.keys()].map(snapDi)
  const perTipo = {
    aperti: tutti.filter((d) => STATI_APERTI.includes(d.data().status)),
    recenti: tutti,
    'chiusi-qui': cassa ? tutti.filter((d) => d.data().closed_in_session === cassa) : [],
  }
  for (const l of stato.listeners) l.cb({ docs: perTipo[l.tipo] || [] })
}

function osserva(opzioni = {}) {
  const visti = []
  const stop = api.subscribeActiveOrders((list) => visti.push(list), null, opzioni)
  return { visti, stop, ultimo: () => visti[visti.length - 1] || [] }
}

const cercaIn = (lista, id) => (lista || []).filter((o) => o.id === id)
const trova = (lista, id) => cercaIn(lista, id)[0] || null

beforeEach(() => {
  // LA MEMORIA DEL TERMINALE SI AZZERA FRA UNA PROVA E L'ALTRA: senza, la
  // prova dopo comporrebbe sul conto della prova prima.
  _azzeraMutazioni()
  stato.docs = new Map([['ord-1', conto()]])
  stato.listeners = []
  stato.scritture = []
  stato.cache = { aperti: [], recenti: [], 'chiusi-qui': [] }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('riscuotere un conto: sparisce subito, e non c’è mai stato il lampo', () => {
  it('tornando in coda il conto risulta già chiuso, dalla PRIMA pennellata', async () => {
    await api.markOrderPaid('ord-1', 'banco', { autoServe: true })

    // Si torna alla coda: la sottoscrizione riparte da capo e dipinge dalla
    // cache, che ha ancora il conto APERTO. È il momento del lampo.
    stato.cache.aperti = [snapDi('ord-1')]
    stato.cache.recenti = [snapDi('ord-1')]
    const q = osserva()
    await vi.waitFor(() => expect(q.visti.length).toBeGreaterThan(0))
    mandaDallaCache()

    // NESSUNA delle pennellate lo ha mai mostrato aperto: non è che sparisce
    // in fretta, è che non c'è mai stato.
    for (const lista of q.visti) {
      const o = trova(lista, 'ord-1')
      if (o) expect(o.status).toBe('pagato')
    }
    expect(trova(q.ultimo(), 'ord-1').status).toBe('pagato')
    q.stop()
  })

  it('e la scrittura è ancora appesa: non si è aspettato niente', async () => {
    await api.markOrderPaid('ord-1', 'banco', { autoServe: true })
    // Il documento in cache è quello di prima — la scrittura non è atterrata
    // da nessuna parte — eppure la coda lo dà per chiuso.
    expect(stato.docs.get('ord-1').status).toBe('aperto')
    expect(stato.scritture).toHaveLength(1)
    const q = osserva()
    mandaDallaCache()
    expect(contoChiuso(trova(q.ultimo(), 'ord-1'), { workflowOn: true })).toBe(true)
    q.stop()
  })

  it('sotto «in corso» non c’è più, sotto «chiusi» sì: sta in una scheda sola', async () => {
    await api.markOrderPaid('ord-1', 'banco', { autoServe: true })
    const q = osserva()
    mandaDallaCache()
    const opzioni = {
      isChiuso: (o) => contoChiuso(o, { workflowOn: true }),
      giornataDi: (o) => o.order_date,
    }
    expect(ordiniInCoda(q.ultimo(), { ...opzioni, filtro: 'attivi' })).toHaveLength(0)
    expect(ordiniInCoda(q.ultimo(), { ...opzioni, filtro: 'chiusi' })).toHaveLength(1)
    q.stop()
  })
})

describe('gli altri gesti sul conto, tutti con la rete staccata', () => {
  it('annullare: il conto risulta annullato appena si torna in coda', async () => {
    await api.cancelOrder('ord-1', { by: 'bartender' })
    const q = osserva()
    mandaDallaCache()
    expect(trova(q.ultimo(), 'ord-1').status).toBe('annullato')
    q.stop()
  })

  it('annullato → rimetti in corso: ricompare aperto, senza aspettare il server', async () => {
    stato.docs.set('ord-1', conto({ status: 'annullato' }))
    await api.restoreOrder('ord-1', { motivo: 'sbagliato conto' })
    const q = osserva()
    mandaDallaCache()
    expect(trova(q.ultimo(), 'ord-1').status).toBe('aperto')
    q.stop()
  })

  it('chiuso → rimetti in corso: idem', async () => {
    stato.docs.set(
      'ord-1',
      conto({ status: 'pagato', payment_status: 'pagato', paid_at: new Date().toISOString() })
    )
    await api.restoreOrder('ord-1', { motivo: 'il cliente ordina ancora' })
    const q = osserva()
    mandaDallaCache()
    const o = trova(q.ultimo(), 'ord-1')
    expect(o.status).toBe('aperto')
    expect(contoChiuso(o, { workflowOn: true })).toBe(false)
    q.stop()
  })

  it('pagamento PARZIALE: il conto RESTA in coda, perché non è chiuso', async () => {
    // Undici euro di conto, cinque incassati: si continua a lavorarci.
    const esito = await api.registerPayment('ord-1', { amount: 5, method: 'banco' })
    expect(esito.closed).toBe(false)
    const q = osserva()
    mandaDallaCache()
    const o = trova(q.ultimo(), 'ord-1')
    expect(o.status).toBe('aperto')
    expect(contoChiuso(o, { workflowOn: true })).toBe(false)
    q.stop()
  })

  it('saldare il residuo chiude il conto, e la coda lo sa subito', async () => {
    const esito = await api.registerPayment('ord-1', { amount: 11, method: 'banco', autoServe: true })
    expect(esito.closed).toBe(true)
    const q = osserva()
    mandaDallaCache()
    expect(contoChiuso(trova(q.ultimo(), 'ord-1'), { workflowOn: true })).toBe(true)
    q.stop()
  })

  it('incasso di GRUPPO: i conti del tavolo spariscono insieme, non uno per volta', async () => {
    stato.docs.set('ord-2', conto({ daily_number: 22, customer_name: 'Ciro' }))
    stato.docs.set('ord-3', conto({ daily_number: 23, customer_name: 'Anna' }))
    await api.payGroupCash({ orderIds: ['ord-1', 'ord-2', 'ord-3'], method: 'banco' })
    const q = osserva()
    mandaDallaCache()
    const chiusi = ['ord-1', 'ord-2', 'ord-3'].map(
      (id) => trova(q.ultimo(), id)?.payment_status === 'pagato'
    )
    expect(chiusi).toEqual([true, true, true])
    q.stop()
  })

  it('avanzare una comanda si vede in coda all’istante (ed è un’altra memoria ancora)', async () => {
    // `comandeLocali` è la memoria della SCHERMATA; qui si prova che anche
    // l'avanzamento passa dal ricordo del conto e arriva alla lista, senza
    // che le due cose si pestino i piedi.
    await api.advanceComanda('ord-1', 'c1', 'in_preparazione')
    const q = osserva()
    mandaDallaCache()
    const o = trova(q.ultimo(), 'ord-1')
    expect(o.workflow_status).toBe('in_preparazione')
    expect(o.comande[0].status).toBe('in_preparazione')
    q.stop()
  })
})

describe('il conto sta in una lista sola', () => {
  it('presente in tutti e tre gli ascolti, esce dalla coda UNA volta', async () => {
    const CASSA = 'cassa-di-stasera'
    stato.docs.set('ord-1', conto({ closed_in_session: CASSA }))
    await api.markOrderPaid('ord-1', 'banco', { autoServe: true })
    const q = osserva({ cashSessionId: CASSA })
    mandaDallaCache({ cassa: CASSA })
    // Il documento è negli aperti (in cache è ancora aperto), nei recenti e
    // fra i chiusi di questa cassa: se il ricordo si applicasse a un elenco
    // solo, qui uscirebbero due conti che si contraddicono.
    expect(cercaIn(q.ultimo(), 'ord-1')).toHaveLength(1)
    expect(trova(q.ultimo(), 'ord-1').status).toBe('pagato')
    q.stop()
  })

  it('un conto che questo terminale non ha toccato passa dal documento vero', async () => {
    stato.docs.set('ord-2', conto({ daily_number: 22, customer_name: 'Ciro' }))
    await api.markOrderPaid('ord-1', 'banco', { autoServe: true })
    const q = osserva()
    mandaDallaCache()
    // Il ricordo vale per il conto ricordato e basta: l'altro resta com'è.
    expect(trova(q.ultimo(), 'ord-1').status).toBe('pagato')
    expect(trova(q.ultimo(), 'ord-2').status).toBe('aperto')
    q.stop()
  })
})

describe('il ricordo si fa da parte da solo', () => {
  it('muore appena il documento vero racconta la stessa cosa: da lì comanda il server', async () => {
    await api.markOrderPaid('ord-1', 'banco', { autoServe: true })
    const q = osserva()
    mandaDallaCache()
    expect(trova(q.ultimo(), 'ord-1').status).toBe('pagato')

    // Ora la scrittura atterra: il documento vero dice quello che dicevamo noi.
    const patch = stato.scritture[0].patch
    stato.docs.set('ord-1', { ...stato.docs.get('ord-1'), ...patch })
    mandaDallaCache()
    expect(trova(q.ultimo(), 'ord-1').status).toBe('pagato')

    // E da qui in poi comanda il server: un altro terminale riapre il conto e
    // si vede, perché il ricordo se n'è andato quando ha visto che bastava.
    stato.docs.set('ord-1', conto({ riaperture: [{ at: new Date().toISOString() }] }))
    mandaDallaCache()
    expect(trova(q.ultimo(), 'ord-1').status).toBe('aperto')
    q.stop()
  })

  it('scade da sé se la scrittura non arriva MAI: la coda si rifà i conti da sola', async () => {
    vi.useFakeTimers()
    await api.markOrderPaid('ord-1', 'banco', { autoServe: true })
    const q = osserva()
    mandaDallaCache()
    expect(trova(q.ultimo(), 'ord-1').status).toBe('pagato')

    // Nessuno snapshot nuovo: la scrittura resta appesa per sempre. Passata
    // la vita del ricordo la coda deve tornare a dire quello che dice il
    // documento vero — senza che nessuno la tocchi.
    const quante = q.visti.length
    vi.advanceTimersByTime(2500)
    expect(q.visti.length).toBeGreaterThan(quante)
    expect(trova(q.ultimo(), 'ord-1').status).toBe('aperto')
    q.stop()
  })

  it('un ALTRO terminale riapre il conto: il ricordo non lo nasconde per sempre', async () => {
    vi.useFakeTimers()
    // Qui si incassa…
    await api.markOrderPaid('ord-1', 'banco', { autoServe: true })
    const q = osserva()
    mandaDallaCache()
    expect(trova(q.ultimo(), 'ord-1').status).toBe('pagato')

    // …e nel frattempo un altro terminale lo rimette in corso. La sua
    // scrittura arriva, ma non è la nostra: il confronto della patch non
    // combacia, quindi per la finestra dichiarata (VITA_MEMORIA) qui si
    // continua a vedere quello che si è appena fatto. È l'«ultimo che scrive
    // vince» di sempre, ristretto a un paio di secondi.
    stato.docs.set('ord-1', conto({ riaperture: [{ at: new Date().toISOString() }] }))
    mandaDallaCache()
    expect(trova(q.ultimo(), 'ord-1').status).toBe('pagato')

    // Passata la finestra, comanda il documento vero: il conto riaperto
    // dall'altro terminale torna a vedersi anche qui, e la coda si aggiorna
    // da sola senza aspettare un altro snapshot.
    vi.advanceTimersByTime(2500)
    expect(trova(q.ultimo(), 'ord-1').status).toBe('aperto')
    q.stop()
  })

  it('smettendo di ascoltare non resta nessuna sveglia accesa', async () => {
    vi.useFakeTimers()
    await api.markOrderPaid('ord-1', 'banco', { autoServe: true })
    const q = osserva()
    mandaDallaCache()
    q.stop()
    const quante = q.visti.length
    vi.advanceTimersByTime(5000)
    // La coda non c'è più: nessuno deve ricevere altre liste.
    expect(q.visti.length).toBe(quante)
  })
})
