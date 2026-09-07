// @vitest-environment happy-dom
'use strict'

// ── LA CONSEGNA DI UN ORDINE FORNITORE, SENZA RETE (REQ-MAG-029) ─────
//
// Flavio, 26/08/2026: «io mi creo l'ordine che devo mandare al fornitore e
// in quel momento lui non mi carica ancora i prodotti; una volta che me li
// ha portati io faccio consegnato, e dopo mi fa il carico». E subito dopo:
// «prendo dieci cose, mi esce 300 euro di ordine; una volta che il
// fornitore mi scarica l'ordine vedo se veramente sono 300 o di più o di
// meno, e modifico il prezzo quando necessario. NON POSSO MODIFICARE IL
// FORNITORE PERCHÉ DA LUI L'HO COMPRATO».
//
// COM'È FATTO QUESTO TEST, ed è il punto: si mocka SOLO Firestore, non
// `src/lib/api.js` — se no si proverebbe il mock e non il codice. Ogni
// scrittura resta appesa per sempre e ogni lettura risponde con quello che
// c'era PRIMA, che è quello che fa davvero una cache mentre la scrittura è
// in coda: se la funzione, per sapere com'è andata, rileggesse invece di
// comporre il risultato in memoria, qui tornerebbe il dato vecchio.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {})
const stato = { ordine: null, articolo: null, scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
  functions: {},
  storage: {},
}))

const leggi = async (ref) => {
  if (ref?.col === 'purchase_orders') {
    return { exists: () => !!stato.ordine, id: 'po-1', data: () => stato.ordine }
  }
  if (ref?.col === 'inventory_items') {
    return { exists: () => !!stato.articolo, id: ref.id, data: () => stato.articolo }
  }
  return { exists: () => false, data: () => ({}) }
}

vi.mock('firebase/firestore', () => ({
  collection: (_db, nome) => ({ __col: nome }),
  doc: (...args) => {
    if (args.length >= 3) return { col: args[1], id: args[2] }
    if (args.length === 2) return { col: args[0]?.__col || 'x', id: args[1] }
    return { col: args[0]?.__col || 'x', id: 'nuovo' }
  },
  getDoc: vi.fn(leggi),
  getDocFromCache: vi.fn(leggi),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn((c, data) => {
    stato.scritture.push({ tipo: 'add', col: c?.__col, data })
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
  increment: (n) => ({ __increment: n }),
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

const ordineDueFornitori = () => ({
  created_at: '2026-08-26T09:00:00.000Z',
  status: 'inviato',
  received_at: null,
  total_net: 92,
  total_gross: 112.24,
  lines: [
    { item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12, vat: 22, supplier_id: 'nova', stato: 'richiesto' },
    { item_id: 'gin', name: 'Gin Mare', qty_packages: 1, unit_cost: 20, vat: 22, supplier_id: 'enofel', stato: 'richiesto' },
  ],
})

beforeEach(() => {
  stato.ordine = ordineDueFornitori()
  // Il prodotto come sta sul database, già nella gestione a pezzi.
  stato.articolo = { name: 'Campari', unit: 'pz', stock: 2, package_size: 700, content_unit: 'ml', kind: 'scorta' }
  stato.scritture = []
})

const scritture = (col, tipo = null) =>
  stato.scritture.filter((s) => s.col === col && (tipo == null || s.tipo === tipo))

describe('il carico avviene alla CONSEGNA, e solo per la fetta consegnata', () => {
  it('la riga consegnata alza la giacenza, l’altra resta dov’è', async () => {
    const dopo = await subito(api.consegnaRigheOrdine('po-1', { indici: [0] }))
    // La giacenza si è mossa una volta sola: quella del Campari.
    const carichi = scritture('inventory_items', 'update')
    expect(carichi).toHaveLength(1)
    expect(carichi[0].id).toBe('campari')
    expect(carichi[0].patch.stock).toEqual({ __increment: 6 })
    // E il movimento porta il perché, come ogni carico.
    expect(scritture('stock_movements', 'add')[0].data).toMatchObject({
      item_id: 'campari',
      reason: 'ordine fornitore',
    })
    // La riga di Enofel non è stata toccata: consegna in giorni diversi.
    expect(dopo.lines[1].stato).toBe('richiesto')
  })

  // L'ORDINE NON È «RICEVUTO» FINCHÉ MANCA QUALCOSA: con due fornitori
  // dentro, il primo che arriva non chiude niente.
  it('l’ordine resta «inviato» finché una fetta non è arrivata', async () => {
    const dopo = await subito(api.consegnaRigheOrdine('po-1', { indici: [0] }))
    expect(dopo.status).toBe('inviato')
    const conclusivo = await subito(api.consegnaRigheOrdine('po-1', { indici: [1] }))
    // La seconda consegna parte dal documento com'è sul database, che qui
    // è ancora quello di prima (la scrittura è appesa): la riga 1 avanza.
    expect(conclusivo.lines[1].stato).toBe('consegnato')
  })

  it('una riga già consegnata non si carica una seconda volta', async () => {
    stato.ordine.lines[0].stato = 'consegnato'
    await subito(api.consegnaRigheOrdine('po-1', { indici: [0] }))
    expect(scritture('inventory_items')).toEqual([])
  })
})

describe('alla consegna si corregge il prezzo, mai il fornitore', () => {
  it('il prezzo corretto va nel listino di QUEL fornitore, con la sua data', async () => {
    await subito(api.consegnaRigheOrdine('po-1', { indici: [0], prezzi: { 0: '13.5' } }))
    const listino = scritture('supplier_prices', 'set')
    expect(listino).toHaveLength(1)
    // L'id è deterministico: fornitore + prodotto, non un id a caso.
    expect(listino[0].id).toBe('nova__campari')
    expect(listino[0].data).toMatchObject({ supplier_id: 'nova', item_id: 'campari', price: 13.5, last_price: 13.5 })
    expect(listino[0].data.last_price_at).toBeTruthy()
  })

  it('e diventa anche il costo di riferimento del prodotto', async () => {
    await subito(api.consegnaRigheOrdine('po-1', { indici: [0], prezzi: { 0: '13.5' } }))
    expect(scritture('inventory_items', 'update')[0].patch.cost).toBe(13.5)
  })

  it('il fornitore della riga non si tocca: da lui l’abbiamo comprato', async () => {
    const dopo = await subito(api.consegnaRigheOrdine('po-1', { indici: [0], prezzi: { 0: '13.5' } }))
    expect(dopo.lines[0].supplier_id).toBe('nova')
    expect(dopo.lines[0].unit_cost).toBe(13.5)
    // E il totale dell'ordine segue il prezzo vero, non quello sperato.
    expect(dopo.total_net).toBeCloseTo(6 * 13.5 + 20, 2)
  })

  it('senza correzione resta il prezzo dell’ordine', async () => {
    const dopo = await subito(api.consegnaRigheOrdine('po-1', { indici: [0] }))
    expect(dopo.lines[0].unit_cost).toBe(12)
  })
})

describe('l’esito si vede subito, senza aspettare la rete', () => {
  // Le scritture restano appese per sempre e la cache risponde col
  // documento di PRIMA: se la funzione rileggesse, qui tornerebbe una riga
  // ancora «richiesta».
  it('l’ordine che torna è già quello consegnato, non quello di prima', async () => {
    const dopo = await subito(api.consegnaRigheOrdine('po-1', { indici: [0] }))
    expect(dopo.lines[0].stato).toBe('consegnato')
    expect(dopo.lines[0].delivered_at).toBeTruthy()
  })

  // «PAGATO» NON SI SCRIVE PIÙ SULLA RIGA (REQ-MAG-038). C'era
  // `segnaRighePagate`, che portava le righe consegnate al livello «pagato»:
  // non c'è più, ed è una cancellazione voluta — «il discorso degli ordini
  // pagati è già nello scadenzario» (utente, 27/08). Lo stato del pagamento
  // sta in un posto solo, `paid` sulla fattura, perché chi paga paga un
  // DOCUMENTO. Due copie dello stesso stato divergono sempre.
  it('non esiste più nessuna strada per segnare pagata una riga d’ordine', () => {
    expect(api.segnaRighePagate).toBeUndefined()
  })
})

// ── QUELLO CHE È ARRIVATO, E QUELLO CHE ERA STATO CHIESTO ────────────
//
// «Quando l'ordine arriva deve poter MODIFICARE L'ORDINE in base a quello
// che ha effettivamente ricevuto» (utente, 27/08, REQ-MAG-038). Sono due
// elenchi distinti, e tenerli distinti è quello che impedisce di pagare in
// fattura una cassa che non è mai arrivata.
describe('la consegna registra le quantità ricevute', () => {
  it('il carico va sui pezzi ricevuti, e l’ordinato resta scritto', async () => {
    const dopo = await subito(
      api.consegnaRigheOrdine('po-1', { indici: [0], quantita: { 0: '4' } })
    )
    // Chiesti sei, arrivati quattro: `qty_packages` non si tocca.
    expect(dopo.lines[0].qty_packages).toBe(6)
    expect(dopo.lines[0].qty_received).toBe(4)
    // In magazzino entrano quattro confezioni, non sei: caricare l'ordinato
    // quando è arrivato meno vuol dire una giacenza che nessuno ha sullo
    // scaffale.
    expect(scritture('inventory_items', 'update')[0].patch.stock).toEqual({ __increment: 4 })
  })

  it('senza dire niente si è ricevuto quello che si era chiesto', async () => {
    const dopo = await subito(api.consegnaRigheOrdine('po-1', { indici: [0] }))
    expect(dopo.lines[0].qty_received).toBe(6)
  })

  // Il prezzo dell'ordine si conserva la prima volta che lo si corregge: se
  // il prezzo della bolla lo sovrascrivesse, il confronto con la fattura
  // direbbe per sempre «nessuna differenza».
  it('il prezzo di quando l’ordine è partito resta a parte', async () => {
    const dopo = await subito(
      api.consegnaRigheOrdine('po-1', { indici: [0], prezzi: { 0: '13.5' } })
    )
    expect(dopo.lines[0].unit_cost).toBe(13.5)
    expect(dopo.lines[0].unit_cost_ordinato).toBe(12)
  })

  // «Serve una lista dei movimenti fatti per quell'ordine, una specie di
  // history»: una quantità corretta all'arrivo cancella quella di prima, e
  // quello che non si scrive adesso non si ricostruisce dopo.
  it('la storia dice cosa è cambiato, e quando', async () => {
    const dopo = await subito(
      api.consegnaRigheOrdine('po-1', { indici: [0], prezzi: { 0: '13.5' }, quantita: { 0: '4' } })
    )
    const tipi = dopo.storia.map((v) => v.tipo)
    expect(tipi).toContain('consegnato')
    expect(tipi).toContain('prezzo')
    expect(tipi).toContain('quantita')
    expect(dopo.storia.every((v) => !!v.at)).toBe(true)
  })
})
