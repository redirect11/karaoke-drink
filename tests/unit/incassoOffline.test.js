// @vitest-environment happy-dom
'use strict'

// INCASSARE DEVE FUNZIONARE ANCHE SENZA RETE — contanti o carta.
//
// Firestore risolve la Promise di una scrittura solo dopo l'ACK del server:
// offline resta pendente per sempre. Un `await` su quella Promise bloccherebbe
// l'incasso — il conto resterebbe aperto sullo schermo e il cassiere non
// saprebbe se ha incassato o no. Per questo le scritture passano da bgWrite
// (fire-and-forget, con l'indicatore di sincronizzazione) e le letture da
// getDoc, che offline risponde dalla cache.
//
// Qui si simula l'offline nel modo più cattivo possibile: OGNI scrittura
// resta appesa e non si risolve mai. L'incasso deve concludersi lo stesso.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mai = () => new Promise(() => {}) // una Promise che non si risolve mai

const stato = { ordine: null, scritture: [], settingsAppese: false, magazzinoAppeso: false }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: null },
  functions: {},
  storage: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: (_db, col, id) => ({ col: col || 'orders', id: id || 'ord-1' }),
  // Le LETTURE offline arrivano dalla cache: qui rispondono subito. Le
  // impostazioni invece possono restare appese (vedi `stato.settingsAppese`):
  // e' il caso che aveva bloccato il salvataggio degli item.
  getDoc: vi.fn(async (ref) => {
    if (ref?.col === 'settings') {
      if (stato.settingsAppese) return mai()
      return { exists: () => false, data: () => ({}) }
    }
    // Ricette e articoli: dopo un import non sono piu' in cache e la lettura
    // parte verso la rete. Con la rete a meta' resta appesa per sempre.
    if (ref?.col === 'drinks' || ref?.col === 'inventory_items') {
      if (stato.magazzinoAppeso) return mai()
      return { exists: () => false, data: () => ({}) }
    }
    return {
      exists: () => !!stato.ordine,
      id: 'ord-1',
      data: () => stato.ordine,
    }
  }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDocsFromCache: vi.fn(async () => ({ docs: [] })),
  // Le SCRITTURE restano appese, come offline.
  addDoc: vi.fn((_c, data) => {
    stato.scritture.push({ tipo: 'add', data })
    return mai()
  }),
  setDoc: vi.fn(() => mai()),
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
    static fromDate(d) {
      return d
    }
    static fromMillis(m) {
      return m
    }
  },
}))

const { registerPayment, markOrderPaid, updateOrderItems, addComanda, advanceComanda } =
  await import('../../src/lib/api.js')
const { _azzeraMutazioni } = await import('../../src/lib/mutazioniOrdine.js')

const contoDa = (totale, extra = {}) => ({
  status: 'aperto',
  payment_status: 'non_richiesto',
  daily_number: 7,
  total: totale,
  discount_amount: 0,
  payments: [],
  comande: [{ id: 'c1', seq: 1, status: 'ritirato', items: [], inventory_applied: true }],
  created_at: '2026-08-09T20:00:00.000Z',
  ...extra,
})

// Se una di queste chiamate restasse appesa, il test fallirebbe per timeout:
// è esattamente il sintomo che si vedrebbe al bancone.
const entroUnSecondo = (p) =>
  Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('rimasto appeso')), 1000))])

describe('incasso senza rete', () => {
  beforeEach(() => {
    // LA MEMORIA DEL TERMINALE SI AZZERA FRA UNA PROVA E L'ALTRA. Le mutazioni
    // di un conto si ricordano quello che hanno appena composto, finché la
    // cache non lo conferma (lib/mutazioniOrdine.js) — e qui la cache non
    // conferma MAI, apposta: senza questo, la prova dopo comporrebbe sul conto
    // della prova prima.
    _azzeraMutazioni()
    stato.ordine = contoDa(20)
    stato.scritture = []
    stato.settingsAppese = false
  })

  it('contanti: si chiude subito, la scrittura va in coda', async () => {
    const esito = await entroUnSecondo(registerPayment('ord-1', { amount: 20, method: 'banco' }))
    expect(esito.closed).toBe(true)
    const patch = stato.scritture.find((s) => s.tipo === 'update')?.patch
    expect(patch.payments).toHaveLength(1)
    expect(patch.payments[0].method).toBe('banco')
    expect(patch.payment_status).toBe('pagato')
  })

  it('carta: stessa cosa, e il metodo resta scritto', async () => {
    const esito = await entroUnSecondo(registerPayment('ord-1', { amount: 20, method: 'carta' }))
    expect(esito.closed).toBe(true)
    const patch = stato.scritture.find((s) => s.tipo === 'update')?.patch
    expect(patch.payments[0].method).toBe('carta')
    expect(patch.payment_method).toBe('carta')
  })

  it('acconto: il conto resta parziale, senza aspettare il server', async () => {
    const esito = await entroUnSecondo(registerPayment('ord-1', { amount: 5, method: 'banco' }))
    expect(esito.closed).toBe(false)
    const patch = stato.scritture.find((s) => s.tipo === 'update')?.patch
    expect(patch.payment_status).toBe('parziale')
  })

  it('chiusura secca (markOrderPaid) non aspetta la rete', async () => {
    await entroUnSecondo(markOrderPaid('ord-1', 'carta'))
    const patch = stato.scritture.find((s) => s.tipo === 'update')?.patch
    expect(patch.payment_status).toBe('pagato')
    expect(patch.payment_method).toBe('carta')
  })

  it('il conto già pagato viene rifiutato subito, non dopo un timeout di rete', async () => {
    stato.ordine = contoDa(20, { payment_status: 'pagato' })
    await expect(
      entroUnSecondo(registerPayment('ord-1', { amount: 20, method: 'banco' }))
    ).rejects.toThrow(/già pagato/)
  })
})

// GLI ITEM SI SALVANO SEMPRE.
// Il ricalcolo dello sconto ha bisogno di sapere quale strategia è impostata,
// ma una PREFERENZA non deve poter ritardare — tantomeno impedire — il
// salvataggio di un ordine. Quando quella lettura veniva attesa, con una rete
// collegata che non passava restava appesa, e con lei la scrittura degli item:
// gli ordini non si salvavano più.
describe('scrittura degli item', () => {
  // Conto ancora modificabile: la prima comanda dev'essere "ricevuto".
  const modificabile = (extra = {}) =>
    contoDa(20, {
      comande: [{ id: 'c1', seq: 1, status: 'ricevuto', items: [], inventory_applied: false }],
      ...extra,
    })

  beforeEach(() => {
    // LA MEMORIA DEL TERMINALE SI AZZERA FRA UNA PROVA E L'ALTRA. Le mutazioni
    // di un conto si ricordano quello che hanno appena composto, finché la
    // cache non lo conferma (lib/mutazioniOrdine.js) — e qui la cache non
    // conferma MAI, apposta: senza questo, la prova dopo comporrebbe sul conto
    // della prova prima.
    _azzeraMutazioni()
    stato.ordine = modificabile()
    stato.scritture = []
    stato.settingsAppese = false
  })

  const righe = [{ drink_id: 'mojito', name: 'Mojito', unit_price: 8, qty: 1 }]

  it('parte anche se le impostazioni non rispondono', async () => {
    stato.settingsAppese = true
    stato.ordine = modificabile({ discount: { type: 'euro', value: 5 }, discount_amount: 5 })
    await entroUnSecondo(updateOrderItems('ord-1', righe))
    const patch = stato.scritture.find((s) => s.tipo === 'update')?.patch
    expect(patch.items).toHaveLength(1)
    expect(patch.total).toBe(8)
  })

  it('senza sconto sul conto il campo non si tocca', async () => {
    await entroUnSecondo(updateOrderItems('ord-1', righe))
    const patch = stato.scritture.find((s) => s.tipo === 'update')?.patch
    expect(patch).not.toHaveProperty('discount_amount')
  })

  it('con lo sconto si riallinea al nuovo totale (tetto, il default)', async () => {
    stato.ordine = modificabile({ discount: { type: 'euro', value: 30 }, discount_amount: 30 })
    await entroUnSecondo(updateOrderItems('ord-1', righe))
    const patch = stato.scritture.find((s) => s.tipo === 'update')?.patch
    expect(patch.discount_amount).toBe(8) // mai più del conto
  })
})

// LA VENDITA SI SCRIVE PRIMA DEL MAGAZZINO.
// Lo scarico delle scorte deve leggere ricette e articoli di inventario:
// letture che, se quei documenti non sono in cache — per esempio dopo un
// import che li ha riscritti tutti — partono verso la rete. Aspettarle prima
// di salvare l'ordine significava PERDERE GLI ITEM quando la rete non
// rispondeva: il conto non si salvava perche' il magazzino taceva.
describe('aggiunte al conto col magazzino che non risponde', () => {
  const conConto = () =>
    contoDa(20, {
      comande: [{ id: 'c1', seq: 1, status: 'ricevuto', items: [], inventory_applied: false }],
    })

  beforeEach(() => {
    // LA MEMORIA DEL TERMINALE SI AZZERA FRA UNA PROVA E L'ALTRA. Le mutazioni
    // di un conto si ricordano quello che hanno appena composto, finché la
    // cache non lo conferma (lib/mutazioniOrdine.js) — e qui la cache non
    // conferma MAI, apposta: senza questo, la prova dopo comporrebbe sul conto
    // della prova prima.
    _azzeraMutazioni()
    stato.ordine = conConto()
    stato.scritture = []
    stato.settingsAppese = false
    stato.magazzinoAppeso = true // il caso peggiore
  })

  // IL CONTO SI CHIUDE PRIMA DEL MAGAZZINO. Lo scarico legge ricette e
  // articoli: aspettarlo voleva dire che il conto risultava pagato solo dopo
  // quelle letture, e nella coda compariva fra i chiusi mezzo secondo più
  // tardi — di più, con la linea del locale. Chi sta al banco deve vedere
  // subito dov'è finito il conto che ha appena incassato.
  it('incassare non aspetta il magazzino: il conto risulta chiuso subito', async () => {
    stato.ordine = contoDa(20, {
      comande: [
        {
          id: 'c1',
          seq: 1,
          status: 'ritirato',
          items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 20, qty: 1 }],
          inventory_applied: false,
        },
      ],
    })
    const esito = await entroUnSecondo(registerPayment('ord-1', { amount: 20, method: 'banco' }))
    expect(esito.closed).toBe(true)
    const patch = stato.scritture.find((s) => s.tipo === 'update')?.patch
    expect(patch.payment_status).toBe('pagato')
    expect(patch.status).toBe('pagato')
  })

  it('la comanda si aggiunge lo stesso, con gli item dentro', async () => {
    await entroUnSecondo(
      addComanda('ord-1', [{ drink_id: 'mojito', name: 'Mojito', unit_price: 8, qty: 2 }])
    )
    const patch = stato.scritture.find((s) => s.tipo === 'update')?.patch
    expect(patch.comande).toHaveLength(2)
    expect(patch.comande[1].items[0].name).toBe('Mojito')
    expect(patch.items[0].qty).toBe(2)
    expect(patch.total).toBe(16)
  })

  it('la comanda resta segnata come NON scaricata: le scorte si riprendono dopo', async () => {
    await entroUnSecondo(
      addComanda('ord-1', [{ drink_id: 'mojito', name: 'Mojito', unit_price: 8, qty: 1 }])
    )
    const patch = stato.scritture.find((s) => s.tipo === 'update')?.patch
    expect(patch.comande[1].inventory_applied).toBe(false)
  })

  it('anche l’avanzamento di stato non aspetta il magazzino', async () => {
    await entroUnSecondo(advanceComanda('ord-1', 'c1', 'in_preparazione'))
    const patch = stato.scritture.find((s) => s.tipo === 'update')?.patch
    expect(patch.comande[0].status).toBe('in_preparazione')
  })
})
