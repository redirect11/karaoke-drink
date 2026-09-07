'use strict'

// ── LE ALTRE SPESE, SENZA RETE (REQ-MAG-034) ─────────────────────────
//
// Fornitori è una schermata di gestione e non la coda, ma la regola di casa
// non cambia: niente `await` prima di mostrare l'esito di un gesto, e non si
// rilegge quello che si è appena scritto — si compone (BUG-045).
//
// COM'È FATTO QUESTO TEST, sul modello di `giroInLocale.test.js`: la rete
// non c'è nel modo più cattivo possibile. Ogni scrittura resta appesa per
// sempre e ogni lettura risponde con quello che c'era PRIMA, che è
// esattamente ciò che fa una cache mentre la scrittura è in coda. Se una
// funzione, per sapere com'è andata, rilegge invece di comporre, qui si vede
// subito: torna il dato vecchio.
//
// Non si mocka `src/lib/api.js`: si mocka SOLO Firestore, se no si
// proverebbe il mock e non il codice.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {}) // una Promise che non si risolve mai
const stato = { spesa: null, scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1', email: 'admin@tana.it', displayName: 'Admin' } },
  functions: {},
  storage: {},
}))

// La cache non si aggiorna da sola: risponde sempre con la spesa com'era
// PRIMA del gesto. Chi rilegge, qui, rilegge il passato.
const leggi = async () => ({
  exists: () => !!stato.spesa,
  id: 'sp-1',
  data: () => stato.spesa,
})

vi.mock('firebase/firestore', () => ({
  collection: (_db, nome) => ({ nome }),
  // `doc(collection(...))` — un riferimento nuovo, con l'id fatto dal
  // terminale: è la strada che permette di scrivere senza aspettare il
  // server. `doc(db, col, id)` è quella di sempre.
  doc: (a, b, c) => (a?.nome ? { col: a.nome, id: 'sp-nuova' } : { col: b, id: c }),
  getDoc: vi.fn(leggi),
  getDocFromCache: vi.fn(leggi),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn((_c, data) => {
    stato.scritture.push({ tipo: 'add', data })
    return mai()
  }),
  setDoc: vi.fn((ref, data) => {
    stato.scritture.push({ tipo: 'set', ref, data })
    return mai()
  }),
  updateDoc: vi.fn((ref, patch) => {
    stato.scritture.push({ tipo: 'update', ref, patch })
    return mai()
  }),
  deleteDoc: vi.fn((ref) => {
    stato.scritture.push({ tipo: 'delete', ref })
    return mai()
  }),
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

// Se una di queste chiamate restasse appesa il test fallirebbe per timeout,
// che è lo stesso sintomo del banco: il tasto premuto e niente che succede.
const subito = (p) =>
  Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('rimasto appeso')), 1000))])

beforeEach(() => {
  stato.spesa = {
    name: 'Sgabelli',
    qty: 4,
    unit_cost: 39.9,
    shop: 'Amazon',
    notes: null,
    bought: false,
    bought_at: null,
  }
  stato.scritture = []
})

describe('scrivere una spesa senza rete', () => {
  // Con `addDoc` si aspetta il server per sapere come si chiama il documento
  // appena scritto, e senza rete quell'attesa non finisce mai: la riga non
  // comparirebbe finché non torna la connessione.
  it('la spesa nuova torna subito, con un identificativo suo', async () => {
    const nuova = await subito(
      api.creaAltraSpesa({ name: 'Tenda', qty: 1, unit_cost: 120, bought: true, bought_at: '2026-01-09' })
    )
    expect(nuova.id).toBeTruthy()
    expect(nuova).toMatchObject({ name: 'Tenda', qty: 1, unit_cost: 120, bought: true })
    // La scrittura è partita (e resterà appesa per sempre): nessuno l'ha
    // aspettata.
    expect(stato.scritture.filter((s) => s.tipo === 'set')).toHaveLength(1)
  })

  it('la data non si scrive su quello che non è stato comprato', async () => {
    const nuova = await subito(
      api.creaAltraSpesa({ name: 'Divano', unit_cost: 499, bought: false, bought_at: '2026-01-09' })
    )
    // Un mese di competenza per una cosa che non è successa sposterebbe
    // l'utile di gennaio: la data vale solo per quello che è uscito davvero.
    expect(nuova.bought_at).toBe(null)
  })
})

describe('cambiare una spesa senza rete', () => {
  it('quella che torna è già cambiata, non quella di prima', async () => {
    const dopo = await subito(api.aggiornaAltraSpesa('sp-1', { bought: true, bought_at: '2026-01-14' }))
    // Se qui si leggesse `false`, la schermata starebbe mostrando lo stato
    // precedente al gesto — ed è il difetto di BUG-045.
    expect(dopo.bought).toBe(true)
    expect(dopo.bought_at).toBe('2026-01-14')
    // Il resto della spesa non si perde per strada.
    expect(dopo).toMatchObject({ name: 'Sgabelli', qty: 4, unit_cost: 39.9, shop: 'Amazon' })
  })

  // Su Firestore i numeri devono essere numeri: un prezzo scritto come testo
  // farebbe zero in ogni somma del riepilogo, e nessuno se ne accorgerebbe.
  it('quello che si manda ha i numeri numeri e il resto dei campi al suo posto', async () => {
    await subito(api.aggiornaAltraSpesa('sp-1', { unit_cost: '42.5' }))
    const scritta = stato.scritture.find((s) => s.tipo === 'update')
    expect(scritta.patch.unit_cost).toBe(42.5)
    expect(scritta.patch.qty).toBe(4)
    expect(scritta.patch.name).toBe('Sgabelli')
  })

  it('eliminare non aspetta niente', async () => {
    await subito(api.eliminaAltraSpesa('sp-1'))
    expect(stato.scritture.filter((s) => s.tipo === 'delete')).toHaveLength(1)
  })
})
