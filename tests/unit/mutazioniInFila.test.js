// @vitest-environment happy-dom
'use strict'

// ── DUE GESTI RAVVICINATI SULLO STESSO CONTO ─────────────────────────
//
// «Ho creato un ordine, ho aggiunto velocemente item, ma ha sincronizzato e
// mi ha lasciato solo il primo item» (l'utente, 20/08). E, dallo stesso
// giro al banco: due comande separate per un conto solo.
//
// LA CAUSA. Ogni mutazione di un conto legge il documento, ricompone
// l'array `comande` e lo riscrive INTERO — Firestore un array lo riscrive
// intero. Due gesti ravvicinati partono insieme: il secondo legge prima che
// la scrittura del primo sia comparsa in cache, compone dal passato, e
// l'ultimo che scrive cancella l'altro.
//
// COM'È FATTO QUESTO TEST, ed è il punto: la cache APPLICA LE SCRITTURE CON
// RITARDO, che è quello che fa davvero. Non c'è modo di «aspettare che la
// cache abbia recepito»: se la cura funzionasse solo perché il ritardo è
// zero, qui si vedrebbe.
//
// Non si mocka `src/lib/api.js`: si mocka SOLO Firestore. Il codice provato
// è quello vero.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {})
const stato = { ordine: null, scritture: [], ritardo: 0 }

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
    // LA CACHE APPLICA DOPO. Quanto dopo lo decide il test: la cura non
    // deve dipendere da questo numero.
    setTimeout(() => {
      stato.ordine = { ...stato.ordine, ...patch }
    }, stato.ritardo)
    return mai() // la rete non c'è: l'ACK del server non arriva mai
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
const { _azzeraMutazioni, inCodaOrdine } = await import('../../src/lib/mutazioniOrdine.js')

const subito = (p) =>
  Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('rimasto appeso')), 2000))])

const riga = (nome, qty, prezzo) => ({
  drink_id: nome.toLowerCase(),
  name: nome,
  qty,
  unit_price: prezzo,
})

// Il conto ha una comanda GIÀ SERVITA: le righe nuove non ci confluiscono,
// ognuna si porta dietro una comanda sua. È il caso che fa vedere la corsa.
const contoServito = () => ({
  status: 'aperto',
  payment_status: 'non_richiesto',
  daily_number: 20,
  total: 7,
  discount: null,
  discount_amount: 0,
  payments: [],
  items: [riga('Negroni', 1, 7)],
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: 'servito',
      items: [riga('Negroni', 1, 7)],
      inventory_applied: true,
    },
  ],
  created_at: '2026-08-20T20:00:00.000Z',
})

const ultimaScrittura = (campo) =>
  [...stato.scritture].reverse().find((p) => p && campo in p) || null

beforeEach(() => {
  stato.ordine = contoServito()
  stato.scritture = []
  stato.ritardo = 0
  _azzeraMutazioni()
})

describe('aggiunte ravvicinate allo stesso conto', () => {
  it('due addComanda insieme: nessuna delle due sparisce', async () => {
    const a = api.addComanda('ord-1', [riga('Limoncello', 1, 4)])
    const b = api.addComanda('ord-1', [riga('Jefferson', 1, 9)])
    await subito(Promise.all([a, b]))
    const scritta = ultimaScrittura('comande')
    // c1 più le due nuove. Prima della cura ne arrivavano due: la seconda
    // componeva dal passato e cancellava la prima.
    expect(scritta.comande).toHaveLength(3)
    const nomi = scritta.comande.flatMap((c) => c.items.map((i) => i.name))
    expect(nomi).toContain('Limoncello')
    expect(nomi).toContain('Jefferson')
  })

  it('e i numeri di comanda non si ripetono', async () => {
    await subito(
      Promise.all([
        api.addComanda('ord-1', [riga('Limoncello', 1, 4)]),
        api.addComanda('ord-1', [riga('Jefferson', 1, 9)]),
        api.addComanda('ord-1', [riga('Americano', 1, 5)]),
      ])
    )
    const scritta = ultimaScrittura('comande')
    const ids = scritta.comande.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(scritta.comande).toHaveLength(4)
  })

  it('anche se la cache ci mette mezzo secondo ad applicare le scritture', async () => {
    // Il ritardo vero è di millisecondi; qui si esagera apposta. Se la cura
    // si reggesse sul fatto che la cache «di solito ci arriva prima», qui
    // tornerebbe il difetto.
    stato.ritardo = 500
    await subito(
      Promise.all([
        api.addComanda('ord-1', [riga('Montenegro', 1, 5)]),
        api.addComanda('ord-1', [riga('Jagermeister', 1, 5)]),
      ])
    )
    const scritta = ultimaScrittura('comande')
    expect(scritta.comande).toHaveLength(3)
  })

  it('il totale finale li conta tutti e due', async () => {
    await subito(
      Promise.all([
        api.addComanda('ord-1', [riga('Limoncello', 1, 4)]),
        api.addComanda('ord-1', [riga('Jefferson', 1, 9)]),
      ])
    )
    // 7 + 4 + 9
    expect(ultimaScrittura('total').total).toBe(20)
  })

  it('un avanzamento e una aggiunta insieme: non si mangiano a vicenda', async () => {
    await subito(
      Promise.all([
        api.advanceComanda('ord-1', 'c1', 'ritirato'),
        api.addComanda('ord-1', [riga('Sambuca', 1, 4)]),
      ])
    )
    const scritta = ultimaScrittura('comande')
    expect(scritta.comande).toHaveLength(2)
    // L'avanzamento è ancora lì: prima l'aggiunta lo riscriveva sotto.
    expect(scritta.comande.find((c) => c.id === 'c1').status).toBe('ritirato')
  })
})

describe('la fila, e i suoi limiti', () => {
  it('conti DIVERSI non si mettono in fila fra loro', async () => {
    // Sarebbe il rimedio peggiore del male: al banco si lavora su più conti
    // insieme, e un conto lento non deve fermare gli altri.
    let sbloccaPrimo
    const primo = inCodaOrdine('ord-1', () => new Promise((r) => (sbloccaPrimo = r)))
    let secondoFatto = false
    const secondo = inCodaOrdine('ord-2', async () => {
      secondoFatto = true
    })
    await subito(secondo)
    expect(secondoFatto).toBe(true)
    sbloccaPrimo()
    await subito(primo)
  })

  it('una mutazione fallita non tappa la fila del conto', async () => {
    const rotta = inCodaOrdine('ord-9', async () => {
      throw new Error('conto chiuso')
    })
    await expect(rotta).rejects.toThrow('conto chiuso')
    await expect(subito(inCodaOrdine('ord-9', async () => 'passata'))).resolves.toBe('passata')
  })
})
