// @vitest-environment happy-dom
'use strict'

// ── SULLA COMANDA LE VOCI SONO SEMPRE ACCORPATE (BUG-083) ────────────
//
// «Per la comanda, le voci devono essere sempre accorpate. Al momento, se
// sono separate escono separate, se sono unite escono unite. Devono essere
// sempre unite sulla comanda» (l'utente, 22/08/2026).
//
// Al banco si contano PEZZI: quattro righe «1 JEFFERSON» una sotto l'altra
// si contano peggio di una «4 JEFFERSON». Separare le righe serve a
// dividere il CONTO — ai soldi — e lì non cambia niente.
//
// Qui si prova la regola da tutti e due i lati: la funzione pura, e LA
// CARTA che esce (il facsimile della stampante finta), perché è la carta
// la cosa che il barista tiene in mano.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { righeDellaComanda, pezziDellaComanda } from '../../src/lib/comande.js'

const riga = (over = {}) => ({
  drink_id: 'jefferson',
  name: 'Jefferson',
  unit_price: 8,
  qty: 1,
  ...over,
})

describe('righeDellaComanda: la regola, senza stampante', () => {
  it('quattro righe uguali diventano una da quattro', () => {
    const righe = righeDellaComanda([riga(), riga(), riga(), riga()])
    expect(righe).toHaveLength(1)
    expect(righe[0].qty).toBe(4)
    expect(righe[0].name).toBe('Jefferson')
  })

  it('una riga già unita resta com’è: accorpare due volte non cambia niente', () => {
    const righe = righeDellaComanda([riga({ qty: 4 })])
    expect(righe).toHaveLength(1)
    expect(righe[0].qty).toBe(4)
  })

  it('mezze separate e mezze unite fanno lo stesso ticket', () => {
    const separate = righeDellaComanda([riga(), riga(), riga(), riga()])
    const miste = righeDellaComanda([riga({ qty: 2 }), riga(), riga()])
    expect(miste).toEqual(separate)
  })

  // LA NOTA È LAVORO DIVERSO: «poco ghiaccio» vale per due dei quattro, e
  // accorparli farebbe sparire la nota o la stamperebbe su tutti e quattro.
  it('stesso prodotto ma nota diversa NON si accorpa', () => {
    const righe = righeDellaComanda([
      riga(),
      riga({ note: 'poco ghiaccio' }),
      riga({ note: 'poco ghiaccio' }),
      riga(),
    ])
    expect(righe).toHaveLength(2)
    expect(righe.map((r) => [r.qty, r.note ?? null])).toEqual([
      [2, null],
      [2, 'poco ghiaccio'],
    ])
  })

  it('la nota vuota e la nota assente sono la stessa cosa', () => {
    expect(righeDellaComanda([riga(), riga({ note: '' })])).toHaveLength(1)
  })

  // Due prodotti liberi battuti con lo stesso nome ma prezzi diversi sono
  // due cose diverse: sommarli direbbe una bugia su cosa è stato battuto.
  it('stesso nome ma prezzo diverso resta su due righe', () => {
    const righe = righeDellaComanda([
      { custom: true, name: 'Extra', unit_price: 2, qty: 1 },
      { custom: true, name: 'Extra', unit_price: 3, qty: 1 },
      { custom: true, name: 'Extra', unit_price: 2, qty: 1 },
    ])
    expect(righe.map((r) => [r.qty, r.unit_price])).toEqual([
      [2, 2],
      [1, 3],
    ])
  })

  it('due drink diversi restano due righe, nell’ordine in cui sono stati battuti', () => {
    const righe = righeDellaComanda([
      riga(),
      riga({ drink_id: 'spritz', name: 'Spritz', unit_price: 7 }),
      riga(),
    ])
    expect(righe.map((r) => [r.name, r.qty])).toEqual([
      ['Jefferson', 2],
      ['Spritz', 1],
    ])
  })

  it('una riga senza quantità vale uno, non NaN', () => {
    // Sui documenti vecchi `qty` può mancare: sommando, un `undefined`
    // farebbe uscire «NaN JEFFERSON» sulla carta.
    const righe = righeDellaComanda([riga({ qty: undefined }), riga()])
    expect(righe[0].qty).toBe(2)
  })

  it('senza righe non esplode', () => {
    expect(righeDellaComanda(undefined)).toEqual([])
    expect(righeDellaComanda([])).toEqual([])
  })
})

describe('pezziDellaComanda: il «CL: N» in cima al ticket', () => {
  it('accorpare non crea né perde pezzi', () => {
    const grezze = [riga(), riga(), riga(), riga(), riga({ note: 'poco ghiaccio' })]
    expect(pezziDellaComanda(grezze)).toBe(5)
    expect(pezziDellaComanda(righeDellaComanda(grezze))).toBe(5)
  })
})

// ── E ADESSO LA CARTA ─────────────────────────────────────────────────
//
// La stampante finta raccoglie le righe e apre il facsimile: si legge
// quello che ESCE. Stesso apparecchio di tests/unit/campiDiStampa.test.js.

describe('la carta che esce dal banco', () => {
  let finestre

  beforeEach(() => {
    // Il printer è un singleton di modulo (connessione, coda, logo): ogni
    // prova riparte da capo.
    vi.resetModules()
    localStorage.clear()
    finestre = []
    window.open = vi.fn(() => {
      const scritto = []
      finestre.push(scritto)
      return { document: { write: (h) => scritto.push(h), close: () => {} }, focus: () => {} }
    })
    window.Image = class {
      constructor() {
        this.width = 400
        this.height = 200
      }
      set src(_v) {
        queueMicrotask(() => this.onerror?.(new Error('404')))
      }
    }
    vi.useFakeTimers({ now: Date.parse('2026-08-22T21:30:00.000Z') })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const carta = (n = 0) => {
    const html = (finestre[n] || []).join('')
    return html.match(/<pre>([\s\S]*?)<\/pre>/)?.[1] ?? ''
  }
  const nudo = (t) =>
    t
      .split('\n')
      .map((r) => r.replace(/\s+$/, ''))
      .filter((r) => r !== '')
      .join('\n')

  const conto = (items) => ({
    id: 'o1',
    daily_number: 7,
    status: 'aperto',
    customer_name: 'Anna',
    comande: [{ id: 'c1', status: 'ricevuto', items }],
  })

  // IL TICKET DI QUATTRO JEFFERSON SEPARATI: una riga sola, e «CL: 4».
  //
  // La fascia è cambiata il 25/08/2026 (BUG-089): diceva «DIRETTO» su ogni
  // ticket, adesso dice quale ticket è — «COMANDA 1 - ORDINE 7» — con
  // l'ora scesa sotto, dentro lo stesso nero, perché accanto non ci sta.
  // Dal conteggio in giù la carta è identica: qui si guarda
  // l'accorpamento delle righe, e quello non si è mosso.
  const QUATTRO_UGUALI = `    C O M A N D A   1   -   O R D I N E   7
                   2 3 : 3 0
CONTATORIE                                 CL: 4
BAR                                      Vendeur
                    A n n a
                  Il tuo menu
------------------------------------------------
4  JEFFERSON
------------------------------------------------
────────────────────────────────────────────────`

  it('quattro righe uguali escono come una «4 JEFFERSON»', async () => {
    const printer = await import('../../src/lib/printer.js')
    await printer.printComanda(conto([riga(), riga(), riga(), riga()]))
    expect(nudo(carta())).toBe(QUATTRO_UGUALI)
  })

  it('la stessa carta esce se al conto le righe erano già unite', async () => {
    const printer = await import('../../src/lib/printer.js')
    await printer.printComanda(conto([riga({ qty: 4 })]))
    expect(nudo(carta())).toBe(QUATTRO_UGUALI)
  })

  it('due dei quattro «poco ghiaccio» restano la loro riga, con la nota', async () => {
    const printer = await import('../../src/lib/printer.js')
    await printer.printComanda(
      conto([riga(), riga({ note: 'poco ghiaccio' }), riga({ note: 'poco ghiaccio' }), riga()])
    )
    expect(nudo(carta())).toBe(`    C O M A N D A   1   -   O R D I N E   7
                   2 3 : 3 0
CONTATORIE                                 CL: 4
BAR                                      Vendeur
                    A n n a
                  Il tuo menu
------------------------------------------------
2  JEFFERSON
2  JEFFERSON
     > poco ghiaccio
------------------------------------------------
────────────────────────────────────────────────`)
  })

  // IL TICKET UNITO (più comande dello stesso conto su una ricevuta sola)
  // segue la stessa regola — e non perde più le note per strada: prima
  // fondeva per `drink_id` e una delle due spariva.
  it('il ticket unito accorpa fra comande diverse senza perdere le note', async () => {
    const printer = await import('../../src/lib/printer.js')
    await printer.printComandaUnita({
      id: 'o1',
      daily_number: 7,
      status: 'aperto',
      customer_name: 'Anna',
      comande: [
        { id: 'c1', status: 'ritirato', items: [riga(), riga({ note: 'poco ghiaccio' })] },
        { id: 'c2', status: 'ricevuto', items: [riga(), riga()] },
      ],
    })
    expect(nudo(carta())).toBe(`                O R D I N E   7
                   2 3 : 3 0
CONTATORIE                                 CL: 4
BAR                                      Vendeur
                    A n n a
                  Il tuo menu
------------------------------------------------
3  JEFFERSON
1  JEFFERSON
     > poco ghiaccio
------------------------------------------------
────────────────────────────────────────────────`)
  })
})
