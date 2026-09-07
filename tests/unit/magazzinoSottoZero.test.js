// @vitest-environment happy-dom
'use strict'

// ── IL MAGAZZINO VA SOTTO ZERO, ED È VOLUTO (BUG-101) ────────────────
//
// Prima si scaricava «al massimo quello che risulta in giacenza»: da due
// bottiglie se ne toglievano due anche quando ne erano uscite tre, e il
// magazzino si fermava a zero. Sembrava prudenza, era il contrario — quel
// terzo giro spariva senza lasciare traccia, e con lui l'unica cosa che
// diceva che qualcosa non tornava.
//
// PERCHÉ IL MENO NON È MERCE CHE MANCA. Da uno scaffale vuoto non si versa:
// se un prodotto continua a uscire dopo essere finito, sullo scaffale c'era
// davvero — è arrivato senza che nessuno lo caricasse, o l'ultimo inventario
// era vecchio. Il meno non conta bottiglie assenti: misura QUANTO SE N'È
// VERSATO SENZA CHE RISULTASSE. Per questo si chiude da sé al primo carico,
// che riparte da zero: le bottiglie appena arrivate ci sono tutte.
//
// COM'È FATTO QUESTO TEST: come `giroInLocale.test.js`, cioè senza rete e
// nel modo più cattivo — ogni scrittura resta appesa per sempre, ogni
// lettura risponde con quello che c'era prima. Si mocka solo Firestore, mai
// `src/lib/api.js`: quello che si prova è il codice vero.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ORDER_STATUSES } from '../../src/lib/orderStatus.js'

const mai = () => new Promise(() => {})
const stato = { ordine: null, articoli: {}, drink: {}, scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1', email: 'banco@tana.it', displayName: 'Banco' } },
  functions: {},
  storage: {},
}))

const leggi = async (ref) => {
  if (ref?.col === 'inventory_items') {
    const a = stato.articoli[ref.id]
    return { exists: () => !!a, id: ref.id, data: () => a }
  }
  if (ref?.col === 'orders') {
    return { exists: () => !!stato.ordine, id: ref.id, data: () => stato.ordine }
  }
  // La ricetta sta sul drink: quando una comanda si corregge, le righe
  // riscritte sul conto non se la portano dietro ed è di qui che si rilegge.
  if (ref?.col === 'drinks') {
    const d = stato.drink[ref.id]
    return { exists: () => !!d, id: ref.id, data: () => d }
  }
  return { exists: () => false, data: () => ({}) }
}

vi.mock('firebase/firestore', () => ({
  collection: (_db, nome) => ({ col: nome }),
  doc: (_db, col, id) => ({ col: col || 'orders', id: id || 'ord-1' }),
  getDoc: vi.fn(leggi),
  getDocFromCache: vi.fn(leggi),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn((c, data) => {
    stato.scritture.push({ tipo: 'add', col: c?.col, data })
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
  // Si tiene il segno chiesto, non il risultato: è quello che si vuole
  // guardare — quanto lo scarico ha CHIESTO di togliere.
  increment: (n) => ({ inc: n }),
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
const { _azzeraMutazioni } = await import('../../src/lib/mutazioniOrdine.js')

// Si aspetta IL DATO — la scrittura sul magazzino — non un tempo a caso:
// lo scarico parte in sottofondo, e un `await` fisso sarebbe un test che
// passa sul portatile veloce e balla in CI.
async function scritturaSu(articolo, entro = 2000) {
  const fine = Date.now() + entro
  while (Date.now() < fine) {
    const w = stato.scritture.find(
      (s) => s.tipo === 'update' && s.col === 'inventory_items' && s.id === articolo
    )
    if (w) return w
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error(`nessuno ha scritto su ${articolo}`)
}

// Il gin nel modello di oggi: la giacenza si conta A PEZZI e la bottiglia
// dice quanto contiene. `0,2` è un fondo, un quinto di bottiglia. Scritto
// nella forma vecchia (a ml) lo scarico lo salterebbe apposta, e questo test
// proverebbe il silenzio invece della regola.
const gin = (stock) => ({
  name: 'Gin Bombay',
  unit: 'pz',
  stock,
  package_size: 1000,
  content_unit: 'ml',
  low_threshold: 0.5,
})

// Un cocktail che di quel gin ne chiede 250 ml: un quarto di bottiglia,
// cioè 0,25 pezzi.
const contoCol = (qty) => ({
  status: 'aperto',
  payment_status: 'non_richiesto',
  daily_number: 7,
  total: 8 * qty,
  discount_amount: 0,
  payments: [],
  items: [],
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: ORDER_STATUSES.IN_PREPARAZIONE,
      inventory_applied: false,
      items: [
        {
          drink_id: 'negroni',
          name: 'Negroni',
          qty,
          unit_price: 8,
          recipe_items: [{ inventory_item_id: 'gin', qty: 250, unit: 'ml' }],
        },
      ],
    },
  ],
  created_at: '2026-09-04T20:00:00.000Z',
})

beforeEach(() => {
  _azzeraMutazioni?.()
  stato.ordine = null
  stato.articoli = {}
  stato.drink = { negroni: { recipe_items: [{ inventory_item_id: 'gin', qty: 250, unit: 'ml' }] } }
  stato.scritture = []
  vi.clearAllMocks()
})

describe('quello che esce si toglie tutto, anche quando la giacenza non basta', () => {
  it('da un fondo di 0,2 se ne toglie 0,25: il magazzino resta a −0,05', async () => {
    stato.articoli.gin = gin(0.2)
    stato.ordine = contoCol(1)

    await api.advanceComanda('ord-1', 'c1', ORDER_STATUSES.PRONTO)
    const w = await scritturaSu('gin')

    // Prima qui si chiedeva 0,2 — cioè tutto il fondo — e il goccio versato
    // in più non lo sapeva più nessuno.
    expect(w.patch.stock).toEqual({ inc: -0.25 })
  })

  it('da una giacenza già a zero si scarica lo stesso', async () => {
    stato.articoli.gin = gin(0)
    stato.ordine = contoCol(1)

    await api.advanceComanda('ord-1', 'c1', ORDER_STATUSES.PRONTO)
    const w = await scritturaSu('gin')

    // Il caso che il freno cancellava per intero: a zero non si toglieva
    // niente, e una serata di drink versati da una bottiglia mai caricata
    // lasciava il magazzino fermo a zero come se nulla fosse.
    expect(w.patch.stock).toEqual({ inc: -0.25 })
  })

  it('tre drink su un fondo da 0,2 chiedono tutti e 0,75 i pezzi', async () => {
    stato.articoli.gin = gin(0.2)
    stato.ordine = contoCol(3)

    await api.advanceComanda('ord-1', 'c1', ORDER_STATUSES.PRONTO)
    const w = await scritturaSu('gin')

    // Tre quarti di bottiglia usciti da un quinto: il magazzino finisce a
    // −0,55, che è quanto se n'è versato senza che risultasse.
    expect(w.patch.stock).toEqual({ inc: -0.75 })
  })

  it('la giacenza che basta si comporta come sempre', async () => {
    stato.articoli.gin = gin(4)
    stato.ordine = contoCol(2)

    await api.advanceComanda('ord-1', 'c1', ORDER_STATUSES.PRONTO)
    const w = await scritturaSu('gin')

    expect(w.patch.stock).toEqual({ inc: -0.5 })
  })

  // NIENTE ATTESE: il gesto è finito nell'istante in cui si tocca, e la
  // scrittura se ne va per conto suo. Se questa chiamata aspettasse la rete
  // resterebbe appesa — col locale pieno è l'app bloccata.
  it('il passaggio a pronto non aspetta nessuna scrittura', async () => {
    stato.articoli.gin = gin(0)
    stato.ordine = contoCol(1)

    const esito = await Promise.race([
      api.advanceComanda('ord-1', 'c1', ORDER_STATUSES.PRONTO).then(() => 'tornata'),
      new Promise((r) => setTimeout(() => r('appesa'), 1000)),
    ])
    expect(esito).toBe('tornata')
  })
})

// ── E LA COMANDA CHE SI CORREGGE ─────────────────────────────────────
//
// Quando una comanda già scalata viene modificata, il magazzino insegue la
// differenza. Il freno di prima stava anche qui, e non toglieva soltanto il
// meno: un delta NEGATIVO — cioè un drink tolto dalla comanda, merce che
// torna sullo scaffale — veniva azzerato insieme al resto. Il movimento
// diceva «carico», la giacenza non si muoveva di un millilitro, e il
// magazzino restava indietro di un drink per sempre.
describe('la comanda corretta rimette a posto il magazzino nei due versi', () => {
  const comandaScalata = (qty) => ({
    status: 'aperto',
    payment_status: 'non_richiesto',
    daily_number: 7,
    total: 8 * qty,
    discount_amount: 0,
    payments: [],
    items: [],
    comande: [
      {
        id: 'c1',
        seq: 1,
        status: ORDER_STATUSES.PRONTO,
        inventory_applied: true,
        inventory_consumption: [{ inventory_item_id: 'gin', qty: 250 * qty, unit: 'ml' }],
        items: [
          {
            drink_id: 'negroni',
            name: 'Negroni',
            qty,
            unit_price: 8,
            recipe_items: [{ inventory_item_id: 'gin', qty: 250, unit: 'ml' }],
          },
        ],
      },
    ],
    created_at: '2026-09-04T20:00:00.000Z',
  })

  const riga = (qty) => ({
    drink_id: 'negroni',
    name: 'Negroni',
    qty,
    unit_price: 8,
    recipe_items: [{ inventory_item_id: 'gin', qty: 250, unit: 'ml' }],
  })

  it('un drink tolto dalla comanda torna in giacenza', async () => {
    stato.articoli.gin = gin(1)
    stato.ordine = comandaScalata(2)

    await api.bartenderUpdateComanda('ord-1', 'c1', { items: [riga(1)] })
    const w = await scritturaSu('gin')

    // Il quarto di bottiglia non versato torna sullo scaffale. Prima qui si
    // scriveva zero, e il movimento diceva «carico» di una cosa che non era
    // mai rientrata.
    expect(w.patch.stock).toEqual({ inc: 0.25 })
  })

  it('un drink aggiunto su un prodotto finito scende sotto zero', async () => {
    stato.articoli.gin = gin(0)
    stato.ordine = comandaScalata(1)

    await api.bartenderUpdateComanda('ord-1', 'c1', { items: [riga(2)] })
    const w = await scritturaSu('gin')

    expect(w.patch.stock).toEqual({ inc: -0.25 })
  })
})
