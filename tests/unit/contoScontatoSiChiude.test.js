// @vitest-environment happy-dom
'use strict'

// ── CHIUDERE UN CONTO SCONTATO, SENZA ASPETTARE LA RETE ───────────────
//
// Raccontato dal locale il 19/08: «quando chiudi un tavolo con lo sconto non
// stampa lo scontrino; stampa solo ed esclusivamente se si chiude senza
// sconto».
//
// La strada è questa: lo sconto si applica un attimo prima di riscuotere e
// la sua scrittura parte in sottofondo. `registerPayment` rileggeva il conto
// per decidere se l'incasso lo saldava — e la rilettura prende la versione
// di PRIMA, quella senza sconto. Il residuo risultava più alto dell'incasso,
// il conto veniva scritto «parziale» invece che «pagato»: a schermo chiuso,
// sul database aperto. Lo scontrino automatico guarda proprio
// `payment_status`, e non usciva mai.
//
// COME È FATTO QUESTO TEST, ed è il punto: ogni scrittura resta appesa per
// sempre e ogni lettura risponde col passato, che è esattamente ciò che fa
// una cache mentre la scrittura è ancora in coda. Non si mocka
// `src/lib/api.js`: si mocka SOLO Firestore, così quello che si prova è il
// codice vero.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {}) // una Promise che non si risolve mai
const stato = { ordine: null, scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1', email: 'banco@tana.it', displayName: 'Banco' } },
  functions: {},
  storage: {},
}))

// La cache non si aggiorna da sola: risponde sempre col documento com'era
// prima del gesto. Chi rilegge, qui, rilegge il passato.
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

// Se una chiamata restasse appesa il test fallirebbe per timeout, che è lo
// stesso sintomo del banco: il tasto premuto e niente che succede.
const subito = (p) =>
  Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('rimasto appeso')), 1000))])

const riga = (nome, qty, prezzo) => ({ drink_id: nome.toLowerCase(), name: nome, qty, unit_price: prezzo })

const contoDaVentidue = () => ({
  status: 'aperto',
  payment_status: 'non_richiesto',
  daily_number: 21,
  total: 22,
  discount: null,
  discount_amount: 0,
  payments: [],
  items: [riga('Mojito', 2, 7), riga('Gin', 1, 8)],
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: 'ritirato',
      items: [riga('Mojito', 2, 7), riga('Gin', 1, 8)],
      inventory_applied: true,
    },
  ],
  created_at: '2026-08-19T20:00:00.000Z',
})

const ultimaPatch = () => stato.scritture.filter((s) => s.tipo === 'update').at(-1).patch

beforeEach(() => {
  // LA MEMORIA DEL TERMINALE SI AZZERA FRA UNA PROVA E L'ALTRA. Le mutazioni
  // di un conto si ricordano quello che hanno appena composto, finché la
  // cache non lo conferma (lib/mutazioniOrdine.js) — e qui la cache non
  // conferma MAI, apposta: senza questo, la prova dopo comporrebbe sul conto
  // della prova prima.
  _azzeraMutazioni()
  stato.ordine = contoDaVentidue()
  stato.scritture = []
})

describe('un conto scontato si chiude come chiuso', () => {
  it('sconto del 10% e incasso del residuo: il conto risulta PAGATO', async () => {
    await subito(api.setOrderDiscount('ord-1', { type: 'percent', value: 10 }))
    // La schermata sa che con 19,80 il conto è saldato: glielo dice.
    const res = await subito(
      api.registerPayment('ord-1', { amount: 19.8, method: 'banco', autoServe: true, chiude: true })
    )
    expect(res.closed).toBe(true)
    // Senza questo, lo scontrino automatico della coda non parte mai: guarda
    // proprio `payment_status`.
    expect(ultimaPatch().payment_status).toBe('pagato')
  })

  it('e l’incasso registrato è la cifra battuta, non il residuo di prima', async () => {
    await subito(api.setOrderDiscount('ord-1', { type: 'percent', value: 10 }))
    await subito(
      api.registerPayment('ord-1', { amount: 19.8, method: 'banco', autoServe: true, chiude: true })
    )
    expect(ultimaPatch().payments.at(-1).amount).toBe(19.8)
  })

  it('conto offerto per intero: si chiude anche senza incassare niente', async () => {
    await subito(api.setOrderDiscount('ord-1', { type: 'euro', value: 22 }))
    await subito(api.markOrderPaid('ord-1', null, { autoServe: true }))
    expect(ultimaPatch().payment_status).toBe('pagato')
  })

  // IL TETTO SUL RESIDUO RESTA per chi non dichiara niente: un acconto è un
  // acconto, e il conto deve restare aperto.
  it('un acconto vero resta un acconto: senza «chiude» il conto resta parziale', async () => {
    const res = await subito(api.registerPayment('ord-1', { amount: 10, method: 'banco' }))
    expect(res.closed).toBe(false)
    expect(ultimaPatch().payment_status).toBe('parziale')
  })

  it('e chi non dichiara niente non registra mai più del dovuto', async () => {
    await subito(api.registerPayment('ord-1', { amount: 50, method: 'banco', autoServe: true }))
    expect(ultimaPatch().payments.at(-1).amount).toBe(22)
  })
})

// ── DUE RISCOSSIONI SCONTATE, SENZA RETE ─────────────────────────────
//
// «Se ho applicato uno sconto a 2 prodotti prima e a tre prodotti dopo, sono
// due sconti applicati» (l'utente, 20/08/2026). Il giro vero è questo: si
// sconta la parte di uno, si incassa, e chi resta al tavolo si fa scontare la
// sua — mentre la rete non risponde e ogni rilettura racconta il passato.
//
// Lo sconto viaggia DENTRO il pagamento proprio per questo: qui `leggiOrdine`
// risponde sempre col conto di prima, quindi il residuo lo può sapere solo chi
// gli passa lo sconto insieme all'importo. È BUG-046 risolto alla radice — un
// gesto, una scrittura — e `chiude` resta come seconda cintura.
describe('gli sconti si accumulano, uno per riscossione', () => {
  const gin = riga('Gin', 1, 8)
  const mojito = riga('Mojito', 2, 7)

  it('il primo sconto se ne va dentro il primo incasso', async () => {
    await subito(
      api.registerPayment('ord-1', {
        amount: 6,
        method: 'banco',
        items: [gin],
        sconto: { type: 'euro', value: 2, amount: 2, items: [gin] },
      })
    )
    const patch = ultimaPatch()
    expect(patch.payments.at(-1).sconto).toEqual({
      type: 'euro',
      value: 2,
      amount: 2,
      items: [gin],
    })
    // E sul conto non resta niente di preparato: il prossimo parte pulito.
    expect(patch.discount_amount).toBe(0)
    expect(patch.discount).toBeNull()
    expect(patch.discount_items).toBeNull()
    // Restano 14 € da incassare: il conto NON si chiude.
    expect(patch.payment_status).toBe('parziale')
  })

  it('il secondo sconto è un altro sconto, e il conto si chiude al centesimo', async () => {
    // Il primo incasso è già scritto sul conto (la rilettura, offline, lo
    // vedrebbe solo dopo l'ACK del server: qui glielo mettiamo noi, come fa
    // la cache quando la scrittura finalmente passa).
    stato.ordine = {
      ...contoDaVentidue(),
      payment_status: 'parziale',
      payments: [
        {
          id: 'p1',
          amount: 6,
          method: 'banco',
          items: [gin],
          sconto: { type: 'euro', value: 2, amount: 2, items: [gin] },
        },
      ],
    }
    const res = await subito(
      api.registerPayment('ord-1', {
        amount: 12.6,
        method: 'banco',
        items: [mojito],
        autoServe: true,
        chiude: true,
        sconto: { type: 'percent', value: 10, amount: 1.4, items: [mojito] },
      })
    )
    expect(res.closed).toBe(true)
    const patch = ultimaPatch()
    expect(patch.payment_status).toBe('pagato')
    // Due sconti, non uno: 2 € sul Gin e 1,40 sui due Mojito.
    expect(patch.payments.map((p) => p.sconto.amount)).toEqual([2, 1.4])
    // 6 + 12,60 = 18,60 incassati; 22 − 2 − 1,40 = 18,60. Torna al centesimo.
    expect(patch.payments.reduce((s, p) => s + p.amount, 0)).toBe(18.6)
  })

  it('il residuo lo decide lo sconto che arriva col gesto, non la rilettura', async () => {
    // Nessuno sconto scritto sul conto (la sua scrittura è ancora appesa, o
    // non c'è mai stata): senza il tetto, chi non dichiara niente incasserebbe
    // 22. Dichiarando lo sconto, il tetto scende a 19,80 — e ci sta dentro.
    await subito(
      api.registerPayment('ord-1', {
        amount: 50,
        method: 'banco',
        autoServe: true,
        sconto: { type: 'percent', value: 10, amount: 2.2, items: null },
      })
    )
    expect(ultimaPatch().payments.at(-1).amount).toBe(19.8)
    expect(ultimaPatch().payment_status).toBe('pagato')
  })
})
