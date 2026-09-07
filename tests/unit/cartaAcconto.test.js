// @vitest-environment happy-dom
'use strict'

// ── LA CARTA DELL'ACCONTO, E IL PRECONTO CHE LI ELENCA (REQ-STAMPA-015) ──
//
// Come in `campiDiStampa.test.js`: qui non si guardano le impostazioni, si
// guarda LA CARTA. La stampante finta apre una finestra col facsimile, e
// leggerlo riga per riga è l'unico modo di dire che quel foglio risponde
// alle quattro domande di chi ha appena messo dei soldi sul tavolo — cosa
// ho pagato, quanto, come, quanto resta — e che non si può scambiare per
// lo scontrino finale.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let finestre

beforeEach(() => {
  // Il printer è un singleton di modulo (connessione, coda, cache del
  // logo): ogni prova riparte da capo.
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
  vi.useFakeTimers({ now: Date.parse('2026-08-21T21:30:00.000Z') })
})

afterEach(() => {
  vi.useRealTimers()
})

const carta = (n = 0) => {
  const html = (finestre[n] || []).join('')
  return html.match(/<pre>([\s\S]*?)<\/pre>/)?.[1] ?? ''
}

const impostazioni = (dati) => localStorage.setItem('tana:impostazioni', JSON.stringify(dati))

const nudo = (t) =>
  t
    .split('\n')
    .map((r) => r.replace(/\s+$/, ''))
    .filter((r) => r !== '')
    .join('\n')

const compatto = (t) => t.replace(/\s+/g, '')

// Un conto da 46 €: sei drink, un tavolo, quattro persone. Quello vero al
// banco: si divide, e ognuno paga le sue righe.
const CONTO = {
  id: 'conto-diviso',
  daily_number: 12,
  status: 'aperto',
  table_label: '4',
  created_at: '2026-08-21T21:00:00.000Z',
  total: 46,
  payments: [],
  order_items: [
    { drink_id: 'negroni', qty: 2, name: 'Negroni', unit_price: 8 },
    { drink_id: 'spritz', qty: 2, name: 'Spritz', unit_price: 7 },
    { drink_id: 'gin', qty: 2, name: 'Gin Tonic', unit_price: 8 },
  ],
  comande: [
    {
      id: 'c1',
      status: 'ritirato',
      items: [
        { drink_id: 'negroni', qty: 2, name: 'Negroni', unit_price: 8 },
        { drink_id: 'spritz', qty: 2, name: 'Spritz', unit_price: 7 },
        { drink_id: 'gin', qty: 2, name: 'Gin Tonic', unit_price: 8 },
      ],
    },
  ],
}

// La riscossione di chi se ne va per primo: i suoi due Negroni, scontati
// di 3 €, in contanti.
const INCASSO = {
  amount: 13,
  method: 'contanti',
  items: [{ drink_id: 'negroni', qty: 2, name: 'Negroni', unit_price: 8 }],
  sconto: {
    type: 'euro',
    value: 3,
    amount: 3,
    items: [{ drink_id: 'negroni', qty: 2, name: 'Negroni', unit_price: 8 }],
  },
  at: '2026-08-21T21:30:00.000Z',
}

// CHI STA STAMPANDO, che dal 25/08 è il nome sulla riga dell'operatore
// (BUG-088): sulla ricevuta d'acconto è chi ha appena preso i soldi, ed è
// la persona che il cliente ha davanti. Al banco lo mette l'ascolto di
// Firebase Auth in App.jsx; qui lo si dice a mano.
const CHI_STAMPA = { name: 'Giulia', email: 'giulia@tana.local' }

const stampaAcconto = async (order = CONTO, incasso = INCASSO, chiStampa = CHI_STAMPA) => {
  const printer = await import('../../src/lib/printer.js')
  printer.impostaUtenteStampante(chiStampa ? 'u-giulia' : null, chiStampa)
  await printer.printScontrinoAcconto(order, incasso)
  return carta()
}

// ── IL FACSIMILE, RIGA PER RIGA ──────────────────────────────────────
//
// Se un giorno cambia, o è cambiato il documento di proposito — e allora
// si aggiorna spiegando perché — o qualcosa si è spento da solo in un
// locale che non ha scelto niente.
//
// AGGIORNATO IL 25/08/2026, UNA RIGA (BUG-088): «Utente A» → «Giulia»,
// il nome di chi sta stampando. Era una costante scritta a mano, uguale
// per chiunque, mentre il campo si chiamava «Chi ha incassato». Tutto il
// resto è identico, carattere per carattere.
const ACCONTO_DI_SEMPRE = `    L a   T a n a   d e l   C o n i g l i o
           Corso Tommaso Vitale 87/89
               80035 Nola - Italy
                 A C C O N T O
ACCONTO - 12                  21/08/26, 23:30:00
Giulia
Vendita - Tavolo 4
------------------------------------------------
QTA  Prodotto                    PU       Prezzo
------------------------------------------------
2x  Negroni                        8.00€  16.00€
------------------------------------------------
Sconto su 2 prodotti                      -3.00€
------------------------------------------------
                    Versato
                  1 3 . 0 0 €
                    Contante
------------------------------------------------
Totale del conto                          43.00€
Versato in tutto                          13.00€
Resta da pagare                           30.00€
------------------------------------------------
       Ricevuta di acconto, non fiscale.
             Il conto resta aperto.
                  conto-diviso
                 EFFEVI - SRLS
────────────────────────────────────────────────`

describe('lo scontrino d’acconto, senza aver scelto niente', () => {
  it('la carta, riga per riga', async () => {
    expect(nudo(await stampaAcconto())).toBe(ACCONTO_DI_SEMPRE)
  })

  // I CONTI DEVONO TORNARE, ed è l'unica cosa che il cliente controlla
  // davvero: 46 di listino − 3 di sconto = 43 di conto; 13 versati adesso,
  // 30 che restano. Lo sconto è dentro il pagamento E NON PIÙ sul
  // documento: contandolo due volte il residuo scenderebbe a 27, cioè tre
  // euro regalati al saldo.
  it('totale, versato e resto tornano', async () => {
    const uscito = compatto(await stampaAcconto())
    expect(uscito).toContain('Totaledelconto43.00€')
    expect(uscito).toContain('Versatointutto13.00€')
    expect(uscito).toContain('Restadapagare30.00€')
  })

  // Non si può scambiare per lo scontrino finale: c'è scritto ACCONTO in
  // cima e che il conto resta aperto in fondo, e non c'è nessun «Totale
  // con IVA» a farlo somigliare a una chiusura.
  it('dice di essere un acconto e non uno scontrino', async () => {
    const uscito = await stampaAcconto()
    expect(compatto(uscito)).toContain('ACCONTO')
    expect(uscito).toContain('Il conto resta aperto.')
    expect(uscito).not.toContain('Totale con IVA')
  })

  // Un acconto battuto a mano — «venti euro sul tavolo» — non salda righe
  // in particolare: la lista non si stampa, e nemmeno l'intestazione delle
  // colonne. Meglio niente che un elenco che non è quello che si è pagato.
  it('senza righe non stampa una lista vuota', async () => {
    const uscito = await stampaAcconto(CONTO, { amount: 20, method: 'carta', items: null })
    expect(uscito).not.toContain('QTA  Prodotto')
    expect(uscito).not.toContain('Negroni')
    expect(compatto(uscito)).toContain('2 0 . 0 0 €'.replace(/\s+/g, ''))
    expect(compatto(uscito)).toContain('Restadapagare26.00€')
  })
})

describe('spegnere i campi dell’acconto', () => {
  it('le righe scelte spariscono, l’acconto resta un acconto', async () => {
    impostazioni({
      stampa_acconto: {
        campi: {
          nome_locale: false,
          indirizzo: false,
          citta: false,
          operatore: false,
          riepilogo_conto: false,
          codice_conto: false,
        },
      },
    })
    const uscito = await stampaAcconto()
    expect(uscito).not.toContain('La Tana del Coniglio')
    expect(uscito).not.toContain('Giulia')
    expect(uscito).not.toContain('Resta da pagare')
    expect(uscito).not.toContain('conto-diviso')
    // QUELLO CHE NON SI PUÒ SPEGNERE: la fascia, le righe pagate,
    // l'importo e la riga che dice che il conto è ancora aperto.
    expect(compatto(uscito)).toContain('ACCONTO')
    expect(uscito).toContain('Negroni')
    expect(compatto(uscito)).toContain('13.00€')
    expect(uscito).toContain('Il conto resta aperto.')
  })

  it('scegliere quello che c’è già non sposta niente', async () => {
    const vuoto = await stampaAcconto()
    vi.resetModules()
    finestre = []
    impostazioni({
      stampa_acconto: {
        campi: {
          nome_locale: true,
          indirizzo: true,
          citta: true,
          numero: true,
          operatore: true,
          riga_vendita: true,
          intestazione_colonne: true,
          sconto: true,
          metodo: true,
          riepilogo_conto: true,
          codice_conto: true,
          ragione_sociale: true,
          riga_cortesia: false,
        },
      },
    })
    expect(await stampaAcconto()).toBe(vuoto)
  })
})

// ── LE DUE RIGHE SOTTO AL NUMERO (BUG-088) ───────────────────────────
//
// La ricevuta d'acconto aveva le stesse due righe dello scontrino, e gli
// stessi due difetti: «Utente A» scritto a mano, e il numero del conto
// ripetuto sotto forma di «Vendita - Comanda #12».
describe('la ricevuta d’acconto dice chi stampa e di chi è il conto', () => {
  it('se non si sa chi stampa, la riga non c’è', async () => {
    const uscito = await stampaAcconto(CONTO, INCASSO, null)
    expect(uscito).not.toContain('Utente A')
    expect(uscito).not.toContain('Giulia')
    // La carta esce lo stesso, con tutto il resto.
    expect(compatto(uscito)).toContain('13.00€')
  })

  it('senza tavolo dice il nome del cliente, non il numero del conto', async () => {
    const uscito = await stampaAcconto({ ...CONTO, table_label: null, customer_name: 'Anna' })
    expect(uscito).toContain('Vendita - Anna')
    expect(uscito).not.toContain('Comanda #12')
  })

  it('senza tavolo e senza nome quella riga non esce', async () => {
    const uscito = await stampaAcconto({ ...CONTO, table_label: null })
    expect(uscito).not.toContain('Vendita')
    expect(uscito).toContain('ACCONTO - 12')
  })
})

// ── IL PRECONTO CON DUE ACCONTI SCONTATI ─────────────────────────────
//
// «Il tasto preconto continua a stampare lo scontrino totale con tutti gli
// acconti specificati» (l'utente, 21/08/2026). Gli incassi si elencavano
// già uno per uno; quello che mancava era il RESTO — «Totale 46,00» sopra
// e «Contante 13,00 / Carta 15,00» sotto, e la sottrazione la faceva a
// mente chi teneva il foglio davanti al cliente.
const CONTO_CON_DUE_ACCONTI = {
  ...CONTO,
  payments: [
    {
      id: 'p1',
      amount: 13,
      method: 'contanti',
      at: '2026-08-21T21:30:00.000Z',
      items: [{ drink_id: 'negroni', qty: 2, name: 'Negroni', unit_price: 8 }],
      sconto: {
        type: 'euro',
        value: 3,
        amount: 3,
        items: [{ drink_id: 'negroni', qty: 2, name: 'Negroni', unit_price: 8 }],
      },
    },
    {
      id: 'p2',
      amount: 12,
      method: 'carta',
      at: '2026-08-21T21:40:00.000Z',
      items: [{ drink_id: 'spritz', qty: 2, name: 'Spritz', unit_price: 7 }],
      sconto: {
        type: 'percent',
        value: 15,
        amount: 2.1,
        items: [{ drink_id: 'spritz', qty: 2, name: 'Spritz', unit_price: 7 }],
      },
    },
  ],
}

const PRECONTO_CON_DUE_ACCONTI = `    L a   T a n a   d e l   C o n i g l i o
           Corso Tommaso Vitale 87/89
               80035 Nola - Italy
SCONTRINO - 12                21/08/26, 23:00:00
Giulia
1 cliente
Vendita - Tavolo 4
------------------------------------------------
QTA  Prodotto                    PU       Prezzo
------------------------------------------------
2x  Negroni                        8.00€  16.00€
2x  Spritz                         7.00€  14.00€
2x  Gin Tonic                      8.00€  16.00€
Subtotale                                 46.00€
Sconto su 2 prodotti                      -3.00€
Sconto 15% su 2 prodotti                  -2.10€
------------------------------------------------
IVA 10.0% (A)                              3.72€
Subtotale                                 37.18€
                 Totale con IVA
                  4 0 . 9 0 €
------------------------------------------------
Pagamenti
Contante (A)                              13.00€
Carta di Credito (A)                      12.00€
Resta da pagare                           15.90€
------------------------------------------------
                  conto-diviso
                 EFFEVI - SRLS
────────────────────────────────────────────────`

describe('il preconto di un conto con due acconti scontati', () => {
  it('li elenca tutti, e i conti tornano', async () => {
    const printer = await import('../../src/lib/printer.js')
    printer.impostaUtenteStampante('u-giulia', CHI_STAMPA)
    await printer.printScontrino(CONTO_CON_DUE_ACCONTI)
    expect(nudo(carta())).toBe(PRECONTO_CON_DUE_ACCONTI)
  })

  // 46 di listino − 3 − 2,10 di sconti = 40,90 di conto; 13 + 12 = 25
  // incassati; 15,90 che restano. Se il resto non tornasse, la
  // discussione sarebbe al banco con il conto in mano.
  it('a conto chiuso il resto non si stampa', async () => {
    const printer = await import('../../src/lib/printer.js')
    await printer.printScontrino({
      ...CONTO_CON_DUE_ACCONTI,
      status: 'pagato',
      payments: [
        ...CONTO_CON_DUE_ACCONTI.payments,
        { id: 'p3', amount: 15.9, method: 'contanti', at: '2026-08-21T21:50:00.000Z' },
      ],
    })
    expect(carta()).not.toContain('Resta da pagare')
  })
})
