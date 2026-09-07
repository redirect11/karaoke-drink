// @vitest-environment happy-dom
'use strict'

// ── IL GIRO DI UNA SERATA, SENZA RETE ────────────────────────────────
//
// Questo è il test che vale più di tutti gli altri messi insieme, e la
// ragione sta in una frase di chi lavora al banco: «non voglio aggiungere
// prodotti in un ordine quando non ho connessione e non vedere i dati
// perché non c'è internet».
//
// LA REGOLA, che qui si sorveglia: coda ordini, comande, nuovo ordine,
// modifica ordine e pagamenti lavorano SOLO su quello che hanno già in
// mano. Si scrive in sottofondo e l'esito si vede nell'istante del gesto —
// mai dopo, mai «quando sincronizza».
//
// COME È FATTO QUESTO TEST, ed è il punto: la rete non c'è, e non c'è nel
// modo più cattivo possibile. Ogni scrittura resta appesa per sempre, e
// ogni lettura risponde con quello che c'era PRIMA — perché è esattamente
// ciò che fa una cache mentre la scrittura è ancora in coda. Se una
// funzione, per sapere com'è andata, rilegge invece di costruire il
// risultato in memoria, qui si vede subito: torna il dato vecchio.
//
// Non si mockano `src/lib/api.js` né i suoi ritorni: si mocka SOLO
// Firestore. Quello che si prova è il codice vero.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {}) // una Promise che non si risolve mai
const stato = { ordine: null, scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1', email: 'banco@tana.it', displayName: 'Banco' } },
  functions: {},
  storage: {},
}))

// LA CACHE NON SI AGGIORNA DA SOLA. Risponde sempre con `stato.ordine`,
// cioè il documento com'era prima del gesto: è la fotografia di quel
// momento in cui la scrittura è partita ma non è ancora arrivata da
// nessuna parte. Chi rilegge, qui, rilegge il passato.
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
  addDoc: vi.fn((_c, data) => {
    stato.scritture.push({ tipo: 'add', data })
    return mai()
  }),
  setDoc: vi.fn((_r, data) => {
    stato.scritture.push({ tipo: 'set', data })
    return mai()
  }),
  updateDoc: vi.fn((_r, patch) => {
    stato.scritture.push({ tipo: 'update', patch })
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
const { _azzeraMutazioni } = await import('../../src/lib/mutazioniOrdine.js')

// Se una di queste chiamate restasse appesa il test fallirebbe per timeout,
// che è lo stesso sintomo del banco: il tasto premuto e niente che succede.
const subito = (p) =>
  Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('rimasto appeso')), 1000))])

const riga = (nome, qty, prezzo) => ({
  drink_id: nome.toLowerCase(),
  name: nome,
  qty,
  unit_price: prezzo,
})

const contoConDue = () => ({
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
  created_at: '2026-08-19T20:00:00.000Z',
})

beforeEach(() => {
  // LA MEMORIA DEL TERMINALE SI AZZERA FRA UNA PROVA E L'ALTRA. Le mutazioni
  // di un conto si ricordano quello che hanno appena composto, finché la
  // cache non lo conferma (lib/mutazioniOrdine.js) — e qui la cache non
  // conferma MAI, apposta: senza questo, la prova dopo comporrebbe sul conto
  // della prova prima.
  _azzeraMutazioni()
  stato.ordine = contoConDue()
  stato.scritture = []
})

describe('modificare un conto senza rete', () => {
  it('il conto che torna ha GIÀ le righe nuove, non quelle di prima', async () => {
    const nuove = [riga('Negroni', 1, 7), riga('Americano', 1, 4), riga('Mezcal', 2, 8)]
    const dopo = await subito(api.bartenderUpdateComanda('ord-1', 'c1', { items: nuove }))

    // Tre righe, non due: se qui ce ne sono due, la schermata sta
    // mostrando quello che c'era prima del gesto.
    expect(dopo.order_items ?? dopo.items).toHaveLength(3)
  })

  it('e il totale è già quello nuovo', async () => {
    const nuove = [riga('Negroni', 1, 7), riga('Americano', 1, 4), riga('Mezcal', 2, 8)]
    const dopo = await subito(api.bartenderUpdateComanda('ord-1', 'c1', { items: nuove }))

    // 7 + 4 + 16 = 27. Col conto vecchio farebbe 11, ed è la cifra
    // sbagliata che si legge sulla card finché non arriva il server.
    expect(dopo.total).toBe(27)
  })

  it('la scrittura è partita, ma nessuno l’ha aspettata', async () => {
    await subito(api.bartenderUpdateComanda('ord-1', 'c1', { items: [riga('Gin', 1, 6)] }))
    // La riga è stata mandata (in sottofondo, e resterà appesa per sempre
    // finché non torna la rete): quello che conta è che il gesto sia
    // finito lo stesso.
    expect(stato.scritture.length).toBeGreaterThan(0)
  })
})

describe('aggiungere una comanda a un conto aperto, senza rete', () => {
  it('il conto che torna ha già la comanda nuova e il totale rifatto', async () => {
    const dopo = await subito(api.addComanda('ord-1', [riga('Spritz', 3, 6)]))
    const comande = dopo.comande || []
    expect(comande.length).toBeGreaterThan(1)
    // 7 + 4 + 18 = 29
    expect(dopo.total).toBe(29)
  })
})

describe('la modifica dal telefono del cliente, senza rete', () => {
  it('torna il conto aggiornato, non quello di partenza', async () => {
    const dopo = await subito(
      api.updateOrderItems('ord-1', [riga('Negroni', 2, 7), riga('Americano', 1, 4)])
    )
    expect(dopo.total).toBe(18)
  })
})

// ── LA GUARDIA SULLA REGOLA ──────────────────────────────────────────
//
// I test qui sopra provano il comportamento di oggi. Questo protegge la
// REGOLA, ed è il motivo per cui esiste: il difetto è tornato più di una
// volta, sempre nello stesso modo — qualcuno aggiunge una funzione che
// scrive in sottofondo e poi rilegge il conto «per restituirlo».
//
// Rileggere dopo una scrittura in sottofondo è sempre sbagliato, e non a
// volte: la scrittura non è ancora partita, quindi si rilegge la versione
// di prima. Il conto aggiornato si compone (`ordineDopo`), non si chiede.
describe('la regola, sorvegliata nel codice', () => {
  it('nessuna funzione degli ordini rilegge il conto per restituirlo', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const api = readFileSync(join(process.cwd(), 'src/lib/api.js'), 'utf8')

    const riletture = api
      .split('\n')
      .map((r, i) => [i + 1, r])
      .filter(([, r]) => /return\s+mapOrder\(await\s+leggiOrdine\(/.test(r))

    expect(
      riletture.map(([n, r]) => `riga ${n}: ${r.trim()}`),
      'chi scrive in sottofondo non può rileggere per restituire: componi con ordineDopo()'
    ).toEqual([])
  })
})
