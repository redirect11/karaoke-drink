// @vitest-environment happy-dom
'use strict'

// UNA SCRITTURA IN SOTTOFONDO TOCCA SOLO I CAMPI CHE LE COMPETONO.
//
// Difetto visto al banco: si premeva «Ritirato/Servito» e la card tornava
// indietro; bisognava premere due volte.
//
// `comande` è un ARRAY, e Firestore un array lo riscrive intero. Lo scarico
// del magazzino si rileggeva il documento all'INIZIO del suo lavoro, poi
// andava in rete a leggere ricette e articoli — quello che ci mette, ci
// mette — e alla fine riscriveva quell'array vecchio. Nel frattempo
// l'avanzamento aveva scritto lo stato nuovo, e il magazzino ci passava
// sopra.
//
// La regola: chi scrive in sottofondo si rilegge il documento NELL'ISTANTE
// PRIMA DI SCRIVERE, e cambia solo i suoi campi. Qui si prova esattamente
// quello: mentre lo scarico è a metà lavoro arriva un secondo avanzamento,
// e quando lo scarico scrive non deve portarsi via lo stato.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const stato = {
  ordine: null,
  scritture: [],
  // Si sblocca a mano: serve a tenere lo scarico «a metà lavoro» mentre
  // qualcun altro scrive sull'ordine.
  ricetteAppese: null,
  // Quante volte lo scarico si è messo al lavoro: la ricetta la va a
  // leggere solo lui, quindi contarne le letture conta gli scarichi.
  ricetteLette: 0,
}

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: null },
  functions: {},
  storage: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db, nome) => ({ __col: nome }),
  doc: (...args) => {
    if (args.length >= 3) return { col: args[1], id: args[2] }
    if (args.length === 2) return { col: args[0]?.__col || 'orders', id: args[1] }
    return { col: args[0]?.__col || 'payments', id: 'nuovo' }
  },
  getDoc: vi.fn(async (ref) => {
    // Le ricette sono la lettura lunga: è lì che si apre la finestra.
    if (ref?.col === 'drinks') {
      stato.ricetteLette += 1
      if (stato.ricetteAppese) await stato.ricetteAppese
      return { exists: () => true, id: ref.id, data: () => ({ recipe_items: [] }) }
    }
    if (ref?.col && ref.col !== 'orders') {
      return { exists: () => false, data: () => ({}) }
    }
    return { exists: () => !!stato.ordine, id: ref?.id || 'ord-1', data: () => stato.ordine }
  }),
  getDocFromCache: vi.fn(async () => {
    throw new Error('niente cache')
  }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(async () => ({ id: 'x' })),
  setDoc: vi.fn(async () => {}),
  // Le scritture si applicano al «documento» finto, come farebbe la cache
  // di Firestore: così la rilettura successiva vede l'ultima verità.
  updateDoc: vi.fn(async (ref, patch) => {
    stato.scritture.push({ id: ref?.id, patch })
    if (ref?.col === 'orders' || ref?.id === 'ord-1') {
      stato.ordine = { ...stato.ordine, ...patch }
    }
  }),
  deleteDoc: vi.fn(async () => {}),
  query: () => ({}),
  where: () => ({}),
  documentId: () => 'id',
  orderBy: () => ({}),
  limit: () => ({}),
  onSnapshot: () => () => {},
  serverTimestamp: () => null,
  increment: (n) => n,
  writeBatch: () => ({ update: vi.fn(), set: vi.fn(), commit: async () => {} }),
  Timestamp: class Timestamp {
    static fromDate(d) {
      return d
    }
    static fromMillis(m) {
      return m
    }
  },
}))

const { advanceComanda } = await import('../../src/lib/api.js')
const { _azzeraMutazioni } = await import('../../src/lib/mutazioniOrdine.js')
const { idDispositivo } = await import('../../src/lib/dispositivo.js')

const conto = () => ({
  status: 'aperto',
  payment_status: 'non_richiesto',
  daily_number: 7,
  total: 10,
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: 'in_preparazione',
      status_times: {},
      inventory_applied: false,
      items: [{ drink_id: 'gin', name: 'Gin Tonic', qty: 1, unit_price: 8 }],
    },
  ],
})

const statoDiC1 = () => stato.ordine.comande.find((c) => c.id === 'c1').status
const respira = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  // LA MEMORIA DEL TERMINALE SI AZZERA FRA UNA PROVA E L'ALTRA. Le mutazioni
  // di un conto si ricordano quello che hanno appena composto, finché la
  // cache non lo conferma (lib/mutazioniOrdine.js) — e qui la cache non
  // conferma MAI, apposta: senza questo, la prova dopo comporrebbe sul conto
  // della prova prima.
  _azzeraMutazioni()
  stato.ordine = conto()
  stato.scritture = []
  stato.ricetteAppese = null
  stato.ricetteLette = 0
})

describe('lo scarico del magazzino non riscrive lo stato delle comande', () => {
  it('IL DOPPIO TOCCO: mentre il magazzino lavora, un avanzamento non si perde', async () => {
    // Lo scarico parte al «pronto» e si ferma sulle ricette.
    let sblocca
    stato.ricetteAppese = new Promise((r) => {
      sblocca = r
    })

    await advanceComanda('ord-1', 'c1', 'pronto')
    await respira()
    expect(statoDiC1()).toBe('pronto')

    // Nel frattempo qualcuno porta avanti la comanda: è il secondo tocco,
    // o un altro terminale.
    await advanceComanda('ord-1', 'c1', 'ritirato')
    await respira()
    expect(statoDiC1()).toBe('ritirato')

    // Adesso il magazzino finisce e scrive. Non deve riportare lo stato a
    // com'era quando ha cominciato.
    sblocca()
    await respira()
    await respira()
    await respira()

    expect(statoDiC1()).toBe('ritirato')
    // e il suo lavoro l'ha fatto: la comanda risulta scaricata
    expect(stato.ordine.comande.find((c) => c.id === 'c1').inventory_applied).toBe(true)
  })

  it('senza nessuno di mezzo, lo scarico si scrive normalmente', async () => {
    await advanceComanda('ord-1', 'c1', 'pronto')
    await respira()
    await respira()
    const c1 = stato.ordine.comande.find((c) => c.id === 'c1')
    expect(c1.status).toBe('pronto')
    expect(c1.inventory_applied).toBe(true)
  })

  // AVANTI E INDIETRO, DAL VIVO. Il passaggio a «pronto» scala; rimetterla
  // «in preparazione» e riportarla a «pronto» non scala una seconda volta —
  // qui si guarda proprio quante volte il magazzino viene toccato, non solo
  // cosa risponde la regola.
  it('pronto → indietro → pronto: il magazzino si tocca una volta sola', async () => {
    await advanceComanda('ord-1', 'c1', 'pronto')
    await respira()
    await respira()
    expect(stato.ricetteLette).toBe(1)

    await advanceComanda('ord-1', 'c1', 'in_preparazione')
    await respira()
    await respira()
    await advanceComanda('ord-1', 'c1', 'pronto')
    await respira()
    await respira()
    await advanceComanda('ord-1', 'c1', 'ritirato')
    await respira()
    await respira()

    expect(stato.ricetteLette).toBe(1)
    expect(stato.ordine.comande.find((c) => c.id === 'c1').inventory_applied).toBe(true)
  })
})

// DA QUALE TERMINALE E' PARTITO IL «PRONTO» (BUG-036).
//
// La Cloud Function avvisa tutti gli altri quando un drink e' pronto, e
// per saltare chi ha appena premuto il tasto le serve saperlo dal
// documento: la push nasce dal cambio dell’ordine, non dal gesto. Senza
// questo campo o si avvisava anche chi aveva premuto — il telefono che
// squilla in mano — o non si avvisava nessuno.
describe('l’avanzamento lascia scritto da dove e’ partito', () => {
  it('portando una comanda a pronto, il conto porta il dispositivo', async () => {
    await advanceComanda('ord-1', 'c1', 'pronto')
    await respira()
    expect(stato.ordine.avanzamento_device).toBe(idDispositivo())
  })

  it('sta nella stessa scrittura dello stato, non in una a parte', async () => {
    // Se arrivasse dopo, la Function leggerebbe il documento senza il
    // dispositivo e non saprebbe chi saltare.
    await advanceComanda('ord-1', 'c1', 'pronto')
    const conStato = stato.scritture.find((w) => w.patch?.comande)
    expect(conStato.patch.avanzamento_device).toBe(idDispositivo())
  })
})
