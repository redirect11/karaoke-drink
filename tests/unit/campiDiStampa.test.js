// @vitest-environment happy-dom
'use strict'

// ── LA CARTA CHE ESCE COI CAMPI SCELTI (REQ-STAMPA-014) ──────────────
//
// Qui non si guardano le impostazioni: si guarda LA CARTA. In locale la
// stampante è finta e ogni lavoro apre la sua finestra col facsimile —
// leggerlo è l'unico modo di dire che uno scontrino è ancora uno
// scontrino dopo che qualcuno ha spento tre campi.
//
// LA PROVA CHE CONTA È LA PRIMA: con le impostazioni vuote — cioè in
// ogni locale che questo pannello non l'ha mai aperto — la carta deve
// uscire IDENTICA a prima. Non c'è migrazione da far girare e non c'è
// una sera in cui gli scontrini cambiano da soli.

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
  // Nessun logo: `logo.png` non c'è (in prova non c'è un server che lo
  // serva), e l'errore arriva subito. Dove il logo serve, la prova se lo
  // accende da sé.
  window.Image = class {
    constructor() {
      this.width = 400
      this.height = 200
    }
    set src(_v) {
      queueMicrotask(() => this.onerror?.(new Error('404')))
    }
  }
  // L'ora della comanda è «adesso»: senza un adesso fermo, il facsimile
  // cambia a ogni giro.
  vi.useFakeTimers({ now: Date.parse('2026-08-20T21:30:00.000Z') })
})

afterEach(() => {
  vi.useRealTimers()
})

// Il testo del facsimile, senza il vestito HTML della finestra.
const carta = (n = 0) => {
  const html = (finestre[n] || []).join('')
  return html.match(/<pre>([\s\S]*?)<\/pre>/)?.[1] ?? ''
}

// Le impostazioni del locale, come le lascia `subscribeSettings` per chi
// stampa: nella memoria del terminale, mai da chiedere alla rete.
const impostazioni = (dati) => localStorage.setItem('tana:impostazioni', JSON.stringify(dati))

const CONTO = {
  id: 'ordine-di-prova',
  daily_number: 12,
  status: 'pagato',
  table_label: '4',
  customer_name: 'Anna',
  created_at: '2026-08-20T21:00:00.000Z',
  total: 23,
  discount_amount: 3,
  coperto_persons: 2,
  coperto_amount: 4,
  lottery_code: 'ABCD1234',
  payment_method: 'contanti',
  note: 'Vicino alla finestra',
  order_items: [
    { qty: 2, name: 'Negroni', unit_price: 8, note: 'poco ghiaccio' },
    { qty: 1, name: 'Spritz', unit_price: 7 },
  ],
  comande: [
    {
      id: 'c1',
      status: 'ricevuto',
      items: [
        { qty: 2, name: 'Negroni', unit_price: 8, note: 'poco ghiaccio' },
        { qty: 1, name: 'Spritz', unit_price: 7 },
      ],
    },
  ],
}

// CHI STA STAMPANDO, che dal 25/08 è il nome sulla riga dell'operatore
// (BUG-088): al banco lo mette l'ascolto di Firebase Auth in App.jsx, qui
// lo si dice a mano. Senza, la riga non uscirebbe affatto — ed è il caso
// che si prova più sotto, di proposito.
const CHI_STAMPA = { name: 'Marco', email: 'marco@tana.local' }

const stampa = async (quale, order = CONTO, chiStampa = CHI_STAMPA) => {
  const printer = await import('../../src/lib/printer.js')
  printer.impostaUtenteStampante(chiStampa ? 'u-marco' : null, chiStampa)
  if (quale === 'comanda') await printer.printComanda(order)
  else await printer.printScontrino(order)
  return carta()
}

// ── PRIMA E DOPO, CON LE IMPOSTAZIONI VUOTE ──────────────────────────
//
// Il facsimile qui sotto è quello che usciva PRIMA che i campi si
// potessero scegliere, riga per riga. Se un giorno cambia, o è cambiato
// il formato di proposito — e allora si aggiorna spiegando perché — o
// qualcosa si è spento da solo in un locale che non ha scelto niente.
//
// AGGIORNATO IL 25/08/2026, DUE RIGHE (BUG-088). Erano le uniche due che
// non dicevano il vero, ed è l'utente ad averle viste su uno scontrino
// appena uscito:
//   · «Utente A» → «Marco», il nome di chi sta stampando. Era una
//     costante scritta a mano, uguale per chiunque e per sempre, mentre
//     l'impostazione prometteva una persona;
//   · «2 clientei» → «2 clienti»: la «i» del plurale era attaccata a
//     «cliente».
// La terza riga della segnalazione — «Vendita - Comanda #12» — qui non
// si vede cambiare perché il conto di prova ha il tavolo, e col tavolo
// quella riga era già giusta. Senza tavolo adesso non esce affatto: c'è
// la sua prova più sotto.
// TUTTO IL RESTO È IDENTICO, carattere per carattere.
const SCONTRINO_DI_SEMPRE = `    L a   T a n a   d e l   C o n i g l i o
           Corso Tommaso Vitale 87/89
               80035 Nola - Italy
SCONTRINO - 12                20/08/26, 23:00:00
Marco
2 clienti
Vendita - Tavolo 4
------------------------------------------------
QTA  Prodotto                    PU       Prezzo
------------------------------------------------
2x  Negroni                        8.00€  16.00€
1x  Spritz                         7.00€   7.00€
2x  Coperto                        4.00€   4.00€
Subtotale                                 23.00€
Sconto                                    -3.00€
------------------------------------------------
IVA 10.0% (A)                              1.82€
Subtotale                                 18.18€
                 Totale con IVA
                  2 0 . 0 0 €
------------------------------------------------
Pagamenti
Contante (A)                              20.00€
------------------------------------------------
Codice Lotteria                         ABCD1234
------------------------------------------------
                ordine-di-prova
                 EFFEVI - SRLS
────────────────────────────────────────────────`

// AGGIORNATO IL 25/08/2026, LA FASCIA (BUG-089). Diceva «DIRETTO» su
// ogni ticket — l'etichetta di SumUp POS Pro che là vuol dire «la prima
// infornata», mentre noi la stampavamo anche sulla seconda e sulla terza
// comanda dello stesso tavolo. Adesso dice QUALE ticket è, e l'ora scende
// sotto: «COMANDA 2 - ORDINE 28» a corpo doppio occupa 21 dei 24
// caratteri che ci stanno sulla carta, e accanto l'ora non ci sta più.
// Le due righe si pareggiano in larghezza, se no il nero uscirebbe a
// scaletta. Dal conteggio in giù è tutto identico.
const COMANDA_DI_SEMPRE = `   C O M A N D A   1   -   O R D I N E   1 2
                   2 3 : 3 0
CONTATORIE                                 CL: 3
BAR                                      Vendeur
                    A n n a
                  Il tuo menu
------------------------------------------------
2  NEGRONI
     > poco ghiaccio
1  SPRITZ
------------------------------------------------
Nota: Vicino alla finestra
------------------------------------------------
────────────────────────────────────────────────`

// La finestra del facsimile non ripete le righe vuote e lascia cadere gli
// spazi in coda: si confronta quello che si legge.
const nudo = (t) =>
  t
    .split('\n')
    .map((r) => r.replace(/\s+$/, ''))
    .filter((r) => r !== '')
    .join('\n')

// Il testo GRANDE la finestra lo scrive spaziando le lettere, com'è sulla
// carta: per cercarci dentro una parola si toglie la spaziatura.
const compatto = (t) => t.replace(/\s+/g, '')

describe('senza aver scelto niente, la carta è quella di sempre', () => {
  it('lo scontrino, riga per riga', async () => {
    expect(nudo(await stampa('scontrino'))).toBe(SCONTRINO_DI_SEMPRE)
  })

  it('la comanda, riga per riga', async () => {
    expect(nudo(await stampa('comanda'))).toBe(COMANDA_DI_SEMPRE)
  })

  // La stessa cosa detta dall'altra parte: scrivere nelle impostazioni
  // ESATTAMENTE i valori di partenza non deve cambiare un carattere.
  it('scegliere quello che c’è già non sposta niente', async () => {
    const vuoto = await stampa('scontrino')
    vi.resetModules()
    finestre = []
    impostazioni({
      stampa_scontrino: {
        campi: {
          nome_locale: true,
          indirizzo: true,
          citta: true,
          numero: true,
          operatore: true,
          persone: true,
          riga_vendita: true,
          intestazione_colonne: true,
          coperto: true,
          sconto: true,
          iva: true,
          pagamenti: true,
          lotteria: true,
          codice_conto: true,
          ragione_sociale: true,
          riga_cortesia: false,
        },
      },
    })
    expect(await stampa('scontrino')).toBe(vuoto)
  })
})

describe('spegnere i campi dello scontrino', () => {
  it('le righe scelte spariscono, i prodotti e il totale restano', async () => {
    impostazioni({
      stampa_scontrino: {
        campi: { operatore: false, persone: false, codice_conto: false, lotteria: false },
      },
    })
    const uscito = await stampa('scontrino')
    expect(uscito).not.toContain('Marco')
    expect(uscito).not.toContain('2 clienti')
    expect(uscito).not.toContain('ordine-di-prova')
    expect(uscito).not.toContain('ABCD1234')
    // LA LISTA DEI PRODOTTI È FISSA, e con lei il totale.
    expect(uscito).toContain('Negroni')
    expect(uscito).toContain('Spritz')
    expect(compatto(uscito)).toContain('20.00€') // il totale, in corpo grande
  })

  it('spegnendo l’intestazione lo scontrino non comincia con una riga vuota', async () => {
    impostazioni({
      stampa_scontrino: { campi: { nome_locale: false, indirizzo: false, citta: false } },
    })
    const uscito = await stampa('scontrino')
    expect(uscito).not.toContain('La Tana del Coniglio')
    expect(uscito).not.toContain('80035 Nola')
    // La prima riga scritta è già il numero del conto.
    expect(nudo(uscito).split('\n')[0]).toContain('SCONTRINO - 12')
  })

  it('senza IVA e senza sconto restano i prodotti e quello che si paga', async () => {
    impostazioni({ stampa_scontrino: { campi: { iva: false, sconto: false, pagamenti: false } } })
    const uscito = await stampa('scontrino')
    expect(uscito).not.toContain('IVA 10.0%')
    expect(uscito).not.toContain('Sconto')
    expect(uscito).not.toContain('Pagamenti')
    expect(uscito).toContain('Totale con IVA')
  })

  it('la riga di saluto si accende e si scrive', async () => {
    impostazioni({
      stampa_scontrino: {
        campi: { riga_cortesia: true },
        testi: { riga_cortesia: 'Grazie e a presto!' },
      },
    })
    expect(await stampa('scontrino')).toContain('Grazie e a presto!')
  })

  // Accesa ma senza parole non stampa una riga vuota: sarebbe carta. La
  // carta torna identica a quella di sempre, carattere per carattere.
  it('accesa e vuota non stampa niente', async () => {
    impostazioni({ stampa_scontrino: { campi: { riga_cortesia: true }, testi: { riga_cortesia: '  ' } } })
    expect(nudo(await stampa('scontrino'))).toBe(SCONTRINO_DI_SEMPRE)
  })
})

// ── LE TRE RIGHE SOTTO AL NUMERO (BUG-088) ───────────────────────────
//
// «"Utente A" che sarebbe? E poi scrivi "scontrino 28" e poi "comanda n
// 28". Non ha molto senso» (l'utente, 25/08/2026). Tre righe, tre difetti
// diversi, tutti e tre residui del modello da cui il ticket è nato.
describe('lo scontrino dice chi stampa, di chi è il conto, e quante persone', () => {
  // La riga dell'operatore non è un dato del CONTO: è chi è collegato a
  // questo terminale adesso. Una ristampa porta quindi il nome di chi
  // ristampa — è lui che quel foglio lo consegna.
  it('porta il nome di chi sta stampando', async () => {
    expect(await stampa('scontrino')).toContain('Marco')
  })

  it('una ristampa da un altro terminale porta l’altro nome', async () => {
    expect(await stampa('scontrino', CONTO, { name: 'Giulia' })).toContain('Giulia')
  })

  // Lo stesso ripiego della coda e del dettaglio conto: senza nome
  // impostato si legge la parte davanti alla chiocciola. Non una formula
  // nuova — la stessa persona si deve chiamare allo stesso modo ovunque.
  it('senza nome impostato resta la parte davanti alla chiocciola', async () => {
    const uscito = await stampa('scontrino', CONTO, { email: 'giulia@tana.local' })
    expect(uscito).toContain('giulia')
    expect(uscito).not.toContain('giulia@tana.local')
  })

  // NESSUNO COLLEGATO: la riga non esce. Stampare «Utente A» — o una riga
  // vuota — vuol dire promettere un dato che non c'è, ed è il difetto che
  // l'utente ha visto.
  it('se non si sa chi stampa, la riga non c’è', async () => {
    const uscito = nudo(await stampa('scontrino', CONTO, null))
    expect(uscito).not.toContain('Utente A')
    expect(uscito).not.toContain('Marco')
    // Sotto al numero c'è subito il resto: niente riga vuota al suo posto.
    const righe = uscito.split('\n')
    expect(righe[righe.findIndex((r) => r.includes('SCONTRINO - 12')) + 1]).toBe('2 clienti')
  })

  // ── DI CHI È IL CONTO, e non il numero un'altra volta ──────────────
  it('col tavolo dice il tavolo, come ha sempre fatto', async () => {
    expect(await stampa('scontrino')).toContain('Vendita - Tavolo 4')
  })

  it('senza tavolo dice il nome del cliente', async () => {
    const uscito = await stampa('scontrino', { ...CONTO, table_label: null })
    expect(uscito).toContain('Vendita - Anna')
    // E NON il numero del conto chiamato comanda: 12 è il numero del
    // CONTO, e le sue comande sono la 1 e la 2.
    expect(uscito).not.toContain('Comanda #12')
  })

  it('senza tavolo e senza nome quella riga non esce', async () => {
    const uscito = await stampa('scontrino', {
      ...CONTO,
      table_label: null,
      customer_name: null,
    })
    expect(uscito).not.toContain('Vendita')
    // Il numero resta dov'era: in cima, una volta sola.
    expect(uscito).toContain('SCONTRINO - 12')
  })

  // ── UN CLIENTE, DUE CLIENTI ────────────────────────────────────────
  it('due coperti sono «2 clienti», non «2 clientei»', async () => {
    const uscito = await stampa('scontrino')
    expect(uscito).toContain('2 clienti')
    expect(uscito).not.toContain('clientei')
  })

  it('un coperto solo resta «1 cliente»', async () => {
    expect(await stampa('scontrino', { ...CONTO, coperto_persons: 1 })).toContain('1 cliente')
  })

  // Senza coperto il conto è di una persona: com'è sempre stato, e non
  // «0 clienti».
  it('senza coperto è «1 cliente»', async () => {
    const uscito = await stampa('scontrino', { ...CONTO, coperto_persons: 0, coperto_amount: 0 })
    expect(uscito).toContain('1 cliente')
    expect(uscito).not.toContain('0 clienti')
  })
})

describe('i campi della comanda', () => {
  // LA FASCIA DICE QUALE TICKET È (BUG-089), e non si scrive più: il
  // testo salvato ieri da chi aveva messo la sua parola non viene più
  // letto, e la carta esce piena lo stesso.
  it('la fascia porta il numero della comanda e quello del conto', async () => {
    impostazioni({ stampa_comanda: { testi: { fascia: 'CUCINA' } } })
    const uscito = await stampa('comanda')
    expect(compatto(uscito)).toContain('COMANDA1-ORDINE12')
    expect(compatto(uscito)).not.toContain('CUCINA')
    expect(compatto(uscito)).not.toContain('DIRETTO')
  })

  // La seconda comanda di quel tavolo dice che è la seconda: era proprio
  // questo che «DIRETTO» su ogni ticket non diceva.
  it('la seconda comanda dello stesso conto si vede che è la seconda', async () => {
    const conDue = {
      ...CONTO,
      comande: [
        { id: 'c1', seq: 1, status: 'ritirato', items: [{ qty: 1, name: 'Spritz', unit_price: 7 }] },
        { id: 'c2', seq: 2, status: 'ricevuto', items: [{ qty: 2, name: 'Negroni', unit_price: 8 }] },
      ],
    }
    expect(compatto(await stampa('comanda', conDue))).toContain('COMANDA2-ORDINE12')
  })

  it('l’ora si può togliere dalla fascia', async () => {
    impostazioni({ stampa_comanda: { campi: { ora: false } } })
    const uscito = await stampa('comanda')
    expect(compatto(uscito)).toContain('COMANDA1-ORDINE12')
    expect(compatto(uscito)).not.toContain('23:30')
  })

  // NIENTE «undefined» SULLA CARTA. Un conto appena nato non ha ancora il
  // suo numero del giorno, e il ticket unito non è nessuna comanda in
  // particolare: quello che non si sa non si scrive.
  it('senza il numero del conto la fascia dice solo la comanda', async () => {
    const uscito = await stampa('comanda', { ...CONTO, daily_number: null })
    expect(compatto(uscito)).toContain('COMANDA1')
    expect(uscito).not.toContain('ORDINE')
    expect(uscito).not.toContain('undefined')
  })

  // LA FASCIA STA IN UNA RIGA. A corpo doppio sulla carta da 80 mm ci
  // stanno 24 caratteri: se il respiro ai lati la facesse sfondare, la
  // stampante andrebbe a capo da sola e il rettangolo nero si
  // spezzerebbe in due.
  it('la fascia non sfonda la carta, nemmeno coi numeri lunghi', async () => {
    const printer = await import('../../src/lib/printer.js')
    const { configStampa } = await import('../../src/lib/campiStampa.js')
    const cfg = configStampa({}, 'comanda')
    const larghe = [
      [{ daily_number: 12, comande: [] }, { seq: 1 }],
      [{ daily_number: 1234, comande: [] }, { seq: 12 }],
    ]
    for (const [ordine, comanda] of larghe) {
      for (const riga of printer.strisciaComanda(cfg, '23:30', ordine, comanda)) {
        expect(riga.length).toBeLessThanOrEqual(printer.LARGHEZZA_FASCIA)
      }
    }
  })

  it('sul ticket unito la fascia dice solo il conto', async () => {
    const printer = await import('../../src/lib/printer.js')
    await printer.printComandaUnita(CONTO)
    const uscito = compatto(carta())
    expect(uscito).toContain('ORDINE12')
    expect(uscito).not.toContain('COMANDA')
    expect(uscito).not.toContain('undefined')
  })

  // Fascia spenta E ora spenta vorrebbero dire una striscia nera vuota in
  // cima al ticket: non esce proprio.
  it('spegnendo la fascia il ticket comincia dal conteggio', async () => {
    impostazioni({ stampa_comanda: { campi: { fascia: false } } })
    const uscito = await stampa('comanda')
    expect(compatto(uscito)).not.toContain('COMANDA1-ORDINE12')
    expect(uscito).not.toContain('23:30')
    expect(nudo(uscito).split('\n')[0]).toContain('CONTATORIE')
  })

  it('le righe di servizio si tolgono, e con loro il vuoto che le separava', async () => {
    impostazioni({ stampa_comanda: { campi: { conteggio: false, reparto: false } } })
    const uscito = await stampa('comanda')
    expect(uscito).not.toContain('CONTATORIE')
    expect(uscito).not.toContain('Vendeur')
    expect(uscito).toContain('NEGRONI')
  })

  it('le note dei prodotti si possono togliere, i prodotti no', async () => {
    impostazioni({ stampa_comanda: { campi: { note_riga: false, nota_conto: false } } })
    const uscito = await stampa('comanda')
    expect(uscito).not.toContain('poco ghiaccio')
    expect(uscito).not.toContain('Vicino alla finestra')
    expect(uscito).toContain('NEGRONI')
    expect(uscito).toContain('SPRITZ')
  })

  it('il nome grande e la riga sotto si spengono insieme senza lasciare buchi', async () => {
    impostazioni({ stampa_comanda: { campi: { titolo: false, sottotitolo: false } } })
    const uscito = await stampa('comanda')
    expect(compatto(uscito)).not.toContain('Anna')
    expect(uscito).not.toContain('Il tuo menu')
  })
})

// ── IL LOGO, STAMPA PER STAMPA (REQ-STAMPA-011) ──────────────────────
describe('il logo esce dove il locale ha detto', () => {
  // Un logo che si carica davvero: qui interessa se finisce sulla carta,
  // non com'è disegnato.
  const conImmagine = () => {
    window.Image = class {
      constructor() {
        this.width = 400
        this.height = 200
      }
      set src(_v) {
        queueMicrotask(() => this.onload?.())
      }
    }
    globalThis.HTMLCanvasElement.prototype.getContext = () => ({
      fillStyle: '',
      fillRect: () => {},
      drawImage: () => {},
    })
  }

  it('sullo scontrino sì, sulla comanda no: è così che è sempre stato', async () => {
    conImmagine()
    expect(await stampa('scontrino')).not.toBe('') // la carta esce
    expect(finestre[0].join('')).toContain('<img')
    vi.resetModules()
    finestre = []
    expect(await stampa('comanda')).not.toBe('')
    expect(finestre[0].join('')).not.toContain('<img')
  })

  it('acceso sulla comanda, esce anche lì', async () => {
    conImmagine()
    impostazioni({ stampa_logo: { comanda: true } })
    await stampa('comanda')
    expect(finestre[0].join('')).toContain('<img')
  })

  it('spento sullo scontrino, non esce più', async () => {
    conImmagine()
    impostazioni({ stampa_logo: { scontrino: false } })
    await stampa('scontrino')
    expect(finestre[0].join('')).not.toContain('<img')
  })

  // Un conto ancora aperto stampa il PRECONTO, e il preconto ha la sua
  // scelta: chi vuole il logo solo sul foglio che resta al cliente lo
  // spegne sullo scontrino e non su questo.
  it('il conto ancora aperto è un preconto, e segue la scelta del preconto', async () => {
    conImmagine()
    impostazioni({ stampa_logo: { preconto: false, scontrino: true } })
    await stampa('scontrino', { ...CONTO, status: 'aperto' })
    expect(finestre[0].join('')).not.toContain('<img')
  })

  it('l’immagine caricata dal locale prende il posto di quella del programma', async () => {
    conImmagine()
    const png = 'data:image/png;base64,iVBORw0KGgo='
    impostazioni({ stampa_logo: { immagine: png } })
    await stampa('scontrino')
    expect(finestre[0].join('')).toContain(png)
  })
})

// ── DUE SCONTI SULLA STESSA CARTA ────────────────────────────────────
//
// «Gli sconti poi si accumulano nello scontrino. Se ho applicato uno sconto a
// 2 prodotti prima e a tre prodotti dopo, sono due sconti applicati»
// (l'utente, 20/08/2026). Con una riga sola — «Sconto −3,50 €» — il cliente
// che chiede perché non ha risposta: tre euro e cinquanta di che cosa, e su
// quali prodotti. Adesso ogni sconto è la sua riga e dice su che cosa cadeva.
describe('lo scontrino elenca gli sconti uno per uno', () => {
  const CONTO_A_META = {
    ...CONTO,
    coperto_persons: 0,
    coperto_amount: 0,
    lottery_code: null,
    discount: null,
    discount_amount: 0,
    payments: [
      {
        id: 'p1',
        amount: 6,
        method: 'banco',
        at: '2026-08-20T21:10:00.000Z',
        items: [{ qty: 1, name: 'Negroni', unit_price: 8 }],
        sconto: {
          type: 'euro',
          value: 2,
          amount: 2,
          items: [{ qty: 1, name: 'Negroni', unit_price: 8 }],
        },
      },
      {
        id: 'p2',
        amount: 13.5,
        method: 'carta',
        at: '2026-08-20T21:20:00.000Z',
        items: [
          { qty: 1, name: 'Negroni', unit_price: 8 },
          { qty: 1, name: 'Spritz', unit_price: 7 },
        ],
        sconto: {
          type: 'percent',
          value: 10,
          amount: 1.5,
          items: [
            { qty: 1, name: 'Negroni', unit_price: 8 },
            { qty: 1, name: 'Spritz', unit_price: 7 },
          ],
        },
      },
    ],
  }

  it('due riscossioni scontate = due righe, e il totale è quello incassato', async () => {
    const uscito = await stampa('scontrino', CONTO_A_META)
    expect(uscito).toContain('Subtotale                                 23.00€')
    expect(uscito).toContain('Sconto su 1 prodotto                      -2.00€')
    expect(uscito).toContain('Sconto 10% su 2 prodotti                  -1.50€')
    // 23 − 2 − 1,50 = 19,50, che è anche la somma dei due incassi.
    expect(uscito).toContain('1 9 . 5 0 €')
    expect(uscito).toContain('Contante (A)                               6.00€')
    expect(uscito).toContain('Carta di Credito (A)                      13.50€')
  })

  it('e spegnendo il campo Sconto spariscono tutte, come una sola', async () => {
    impostazioni({ stampa_scontrino: { campi: { sconto: false } } })
    const uscito = await stampa('scontrino', CONTO_A_META)
    expect(uscito).not.toContain('Sconto')
    // Il totale resta quello vero: si toglie la spiegazione, non lo sconto.
    expect(uscito).toContain('1 9 . 5 0 €')
  })
})
