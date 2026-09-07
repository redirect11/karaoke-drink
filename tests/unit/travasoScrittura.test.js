// @vitest-environment happy-dom
'use strict'

// L'AGGIORNAMENTO DEL MAGAZZINO NON SI FERMA PER UN PRODOTTO CHE NON C'È PIÙ.
//
// Difetto visto davvero (18/08): mentre l'aggiornamento girava, il magazzino
// è stato sostituito da un'altra parte. La schermata aveva in mano la lista
// di un minuto prima, ha provato a scrivere su documenti che non esistevano
// più, e il lotto è morto lì — con addosso un messaggio in lingua database
// («NOT_FOUND: no entity to update: app dev~demo-tana-drink path <…>»)
// piazzato in mezzo alla schermata di chi al banco deve solo capire cosa fare.
//
// Le due regole che escono da lì: ogni lotto RILEGGE invece di fidarsi della
// lista di partenza, e chi non c'è più si salta e si conta a parte.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const stato = {
  prodotti: new Map(),
  // Cosa succede nel magazzino MENTRE stiamo aggiornando: è la coda di un
  // altro terminale, e si scatena dopo una lettura.
  dopoLettura: null,
  letture: 0,
  // Prodotti che rifiutano la scrittura per un motivo qualunque (non
  // «non esiste»): servono a provare che il giro finisce lo stesso.
  ostinati: new Set(),
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
    return { col: 'x', id: 'nuovo' }
  },
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocFromCache: vi.fn(async () => {
    throw new Error('niente cache')
  }),
  getDocs: vi.fn(async () => {
    stato.letture += 1
    const docs = [...stato.prodotti.entries()].map(([id, data]) => ({
      id,
      data: () => data,
    }))
    const dopo = stato.dopoLettura
    stato.dopoLettura = null
    dopo?.()
    return { docs }
  }),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(async () => ({ id: 'x' })),
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async (ref, patch) => {
    if (stato.ostinati.has(ref.id)) {
      throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' })
    }
    if (!stato.prodotti.has(ref.id)) {
      // Il messaggio che è finito a schermo davvero, parola per parola.
      throw Object.assign(
        new Error(
          'NOT_FOUND: no entity to update: app: "dev~demo-tana-drink" path < Element { type: "inventory_items" name: "' +
            ref.id +
            '" } >'
        ),
        { code: 'not-found' }
      )
    }
    stato.prodotti.set(ref.id, { ...stato.prodotti.get(ref.id), ...patch })
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

const { travasaMagazzinoAPezzi } = await import('../../src/lib/api.js')

// Una bottiglia scritta alla vecchia maniera: contata a millilitri.
const vecchio = (nome) => ({ name: nome, unit: 'ml', package_size: 700, stock: 1400 })

beforeEach(() => {
  stato.prodotti = new Map()
  stato.dopoLettura = null
  stato.letture = 0
  stato.ostinati = new Set()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('un prodotto che non c’è più non ferma l’aggiornamento', () => {
  it('si salta, si conta a parte, e gli altri passano lo stesso', async () => {
    stato.prodotti.set('a', vecchio('Gin'))
    stato.prodotti.set('b', vecchio('Vodka'))
    stato.prodotti.set('c', vecchio('Rum'))
    // Un altro terminale cancella la Vodka appena dopo la lettura: quando
    // tocca a lei, quel documento non esiste più.
    stato.dopoLettura = () => stato.prodotti.delete('b')

    const esito = await travasaMagazzinoAPezzi({ lotto: 3 })
    expect(esito).toMatchObject({ travasati: 2, saltati: 1, bloccati: 0 })
    // E gli altri due sono davvero a pezzi, non lasciati a metà.
    expect(stato.prodotti.get('a')).toMatchObject({ unit: 'pz', stock: 2 })
    expect(stato.prodotti.get('c')).toMatchObject({ unit: 'pz', stock: 2 })
  })
})

describe('ogni lotto rilegge, invece di fidarsi della lista di partenza', () => {
  it('un prodotto nato mentre giravamo viene preso dallo stesso giro', async () => {
    // Il verso opposto del guaio: se ci fidassimo della prima lettura, questo
    // resterebbe indietro nella forma vecchia senza che nessuno lo sappia.
    stato.prodotti.set('a', vecchio('Gin'))
    stato.dopoLettura = () => stato.prodotti.set('nuovo', vecchio('Amaro'))

    const esito = await travasaMagazzinoAPezzi({ lotto: 10 })
    expect(esito.travasati).toBe(2)
    expect(stato.prodotti.get('nuovo')).toMatchObject({ unit: 'pz' })
  })

  it('e su un magazzino già a posto non scrive niente', async () => {
    stato.prodotti.set('a', { name: 'Campari', unit: 'pz', package_size: 700, content_unit: 'ml', stock: 3 })
    const esito = await travasaMagazzinoAPezzi({ lotto: 10 })
    expect(esito).toMatchObject({ travasati: 0, saltati: 0, bloccati: 0 })
  })
})

describe('quando uno proprio non si lascia scrivere', () => {
  it('il giro finisce lo stesso, e lo dice', async () => {
    // Senza tenerlo da parte tornerebbe nella lista a ogni giro e
    // l'aggiornamento non finirebbe mai: al banco vuol dire schermata
    // bloccata per sempre.
    stato.prodotti.set('a', vecchio('Gin'))
    stato.prodotti.set('b', vecchio('Vodka'))
    stato.ostinati.add('b')

    const esito = await travasaMagazzinoAPezzi({ lotto: 10 })
    expect(esito).toMatchObject({ travasati: 1, bloccati: 1 })
    // Il motivo tecnico va nella console, non addosso a chi legge.
    expect(console.error).toHaveBeenCalled()
  })
})

describe('l’avanzamento si vede', () => {
  it('dice quanti ne ha fatti e quanti ne restano, giro per giro', async () => {
    stato.prodotti.set('a', vecchio('Gin'))
    stato.prodotti.set('b', vecchio('Vodka'))
    stato.prodotti.set('c', vecchio('Rum'))
    const passi = []
    await travasaMagazzinoAPezzi({ lotto: 2, onAvanzamento: (f, t) => passi.push([f, t]) })
    expect(passi[0]).toEqual([0, 3])
    expect(passi.at(-1)).toEqual([3, 3])
  })
})
