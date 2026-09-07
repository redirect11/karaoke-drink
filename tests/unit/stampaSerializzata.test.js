// @vitest-environment happy-dom
'use strict'

// ── UN LAVORO DI STAMPA CONTIENE UN ORDINE SOLO (BUG-052) ────────────
//
// «Il bug era che venivano stampate comande di ordini DIVERSI» (l'utente,
// 20/08, sull'emulatore): un facsimile con dentro due intestazioni, due
// numeri di conto e le righe di tutti e due.
//
// LA CAUSA NON ERA IL FORMATO DEL TICKET, era il BUILDER: `getPrinter()`
// restituisce sempre lo stesso oggetto — la connessione si tiene viva fra
// una stampa e l'altra — e quell'oggetto ACCUMULA i comandi fino a
// `send()`. Chi si ferma prima di `send()` lascia i suoi pezzi dentro, e il
// lavoro dopo se li porta via.
//
// Qui non si guarda una lista di comande: si guarda LA CARTA. In locale la
// stampante è finta e ogni lavoro apre la sua finestra col facsimile —
// contarle e leggerle è l'unico modo di dire che due conti non si sono
// mescolati.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Le finestre del facsimile, in ordine di uscita.
let finestre
// Le <img> del logo ancora in volo: il logo dello scontrino si sblocca
// quando lo decide il test, che è il modo di tenere un lavoro sospeso a
// metà builder senza inventarsi niente.
let immaginiInVolo

beforeEach(() => {
  // Il printer è un singleton di modulo (connessione + coda): ogni prova
  // riparte da capo, o si porterebbe dietro la coda di quella prima.
  vi.resetModules()
  finestre = []
  immaginiInVolo = []
  window.open = vi.fn(() => {
    const scritto = []
    finestre.push(scritto)
    return { document: { write: (h) => scritto.push(h), close: () => {} }, focus: () => {} }
  })
  window.Image = class {
    constructor() {
      immaginiInVolo.push(this)
    }
    set src(_v) {
      /* non carica finché non lo dice il test */
    }
  }
})

const carta = () => finestre.map((f) => f.join(''))
const conto = (n, items) => ({
  id: `o${n}`,
  daily_number: n,
  total: 10,
  created_at: '2026-08-20T21:00:00.000Z',
  comande: [{ id: 'c1', seq: 1, status: 'ricevuto', items }],
  order_items: items.map((i) => ({ ...i, unit_price: 10 })),
})

// UN DATO CHE ESPLODE QUANDO LO SI LEGGE. Qui c'era una riga senza nome:
// `item.name.toUpperCase()` saltava, e il ticket si fermava a metà
// builder. Da BUG-086 una riga senza nome non ferma più niente — esce
// «(SENZA NOME)» e la carta esce lo stesso — quindi per tenere in piedi
// QUESTA prova, che è sul residuo e non sul nome, il guasto si mette con
// un campo che non si lascia nemmeno scrivere — un oggetto senza
// prototipo, su cui `String(...)` esplode: sta per qualunque cosa possa
// andare storta a metà ticket, oggi o fra sei mesi.
const rigaChePlode = () => ({ qty: 1, name: Object.create(null) })

describe('una stampa che si ferma a metà non sporca quella dopo', () => {
  it('IL DIFETTO: due conti diversi finivano sullo stesso ticket', async () => {
    const { printComanda } = await import('../../src/lib/printer.js')
    // Conto 1: la seconda riga è storta. Il ticket è già cominciato — la
    // prima riga è nel builder — e lì salta tutto. È il dato storto di una
    // sera qualunque; quello che conta è che la stampa si interrompa DOPO
    // aver scritto qualcosa.
    await expect(
      printComanda(conto(1, [{ qty: 1, name: 'Mojito' }, rigaChePlode()]))
    ).rejects.toThrow()
    expect(finestre).toHaveLength(0) // niente è uscito, giusto così

    // Conto 2, dati a posto: prima si portava via i resti del conto 1 e
    // usciva un ticket con DUE intestazioni e DUE numeri.
    await printComanda(conto(2, [{ qty: 1, name: 'Negroni' }]))
    expect(finestre).toHaveLength(1)
    expect(carta()[0]).toContain('NEGRONI')
    expect(carta()[0]).not.toContain('MOJITO')
    // E nemmeno il numero dell'altro conto: l'intestazione è una sola.
    expect(carta()[0]).not.toMatch(/#\s*1\b/)
  })

  it('e l’auto-stampa che RIPROVA non accumula un residuo per giro', async () => {
    const { printComanda } = await import('../../src/lib/printer.js')
    // Quando una comanda non esce, la coda libera la pretesa e al prossimo
    // snapshot ci riprova: il residuo si sommava a ogni tentativo.
    const storto = conto(1, [{ qty: 1, name: 'Mojito' }, rigaChePlode()])
    for (let giro = 0; giro < 3; giro++) {
      await expect(printComanda(storto)).rejects.toThrow()
    }
    await printComanda(conto(2, [{ qty: 1, name: 'Negroni' }]))
    expect(finestre).toHaveLength(1)
    expect(carta()[0].match(/MOJITO/g)).toBe(null)
  })
})

// ── UN DOCUMENTO STORTO NON SI MANGIA IL TICKET (BUG-086) ────────────
//
// `item.name.toUpperCase()`, senza difesa: una riga senza nome — un
// ordine vecchio, una scrittura arrivata a metà — faceva saltare la
// comanda, e l'auto-stampa ci riprovava a ogni snapshot senza uscire mai.
// Al banco è un giro di lavoro che non arriva e nessuno che sappia
// perché. Due funzioni più sotto, l'ordine al fornitore la difesa ce
// l'aveva già: era in un posto solo.
//
// La regola adesso è una per tutte le stampe: la carta ESCE, e si vede
// cos'è storto.
describe('le righe con i dati mancanti', () => {
  it('la comanda esce lo stesso, e dice quale riga non ha nome', async () => {
    const { printComanda } = await import('../../src/lib/printer.js')
    await printComanda(conto(1, [{ qty: 2, name: 'Mojito' }, { qty: 1 }]))
    expect(finestre).toHaveLength(1)
    const foglio = carta()[0]
    expect(foglio).toMatch(/M ?O ?J ?I ?T ?O/)
    expect(foglio).toMatch(/\( ?S ?E ?N ?Z ?A ? ?N ?O ?M ?E ?\)/)
  })

  it('e lo scontrino non stampa più «undefined» né «NaN€»', async () => {
    const { printScontrino } = await import('../../src/lib/printer.js')
    const stampa = printScontrino({
      id: 'o7',
      daily_number: 7,
      total: 10,
      created_at: '2026-08-24T21:00:00.000Z',
      // Una riga senza nome e senza prezzo: capita sui documenti vecchi.
      order_items: [{ qty: 1 }],
    })
    // Il logo non arriva (qui non arriva mai): si dice subito, se no la
    // prova sta ferma i tre secondi del tempo massimo.
    for (let i = 0; i < 4; i++) await Promise.resolve()
    immaginiInVolo.forEach((i) => i.onerror?.(new Error('niente logo')))
    await stampa
    const foglio = carta()[0]
    expect(foglio).not.toContain('undefined')
    expect(foglio).not.toContain('NaN')
    expect(foglio).toContain('(senza nome)')
    expect(foglio).toContain('0.00€')
  })
})

describe('due stampe partite nello stesso giro non si accavallano', () => {
  it('scontrino col logo che tarda, poi due comande di conti diversi', async () => {
    const { printComanda, printScontrino } = await import('../../src/lib/printer.js')
    // Lo scontrino si ferma sul logo (l'immagine non è ancora arrivata) col
    // builder già suo. È il caso vero: la coda ordini stampa comande e
    // scontrini di più conti nello stesso snapshot, senza aspettare.
    const scontrino = printScontrino(conto(1, [{ qty: 1, name: 'Mojito' }]))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(immaginiInVolo.length).toBe(1) // è lì, sospeso

    // Adesso partono due comande di ALTRI conti, nello stesso giro.
    const b = printComanda(conto(2, [{ qty: 1, name: 'Negroni' }]))
    const c = printComanda(conto(3, [{ qty: 1, name: 'Spritz' }]))
    // Non escono finché lo scontrino non ha finito: la coda le trattiene.
    await Promise.resolve()
    expect(finestre).toHaveLength(0)

    immaginiInVolo.forEach((i) => i.onerror?.(new Error('niente logo')))
    await Promise.all([scontrino, b, c])

    // Tre lavori, tre pezzi di carta, ognuno di UN conto solo.
    expect(finestre).toHaveLength(3)
    const [uno, due, tre] = carta()
    expect(uno).toContain('Mojito')
    expect(uno).not.toContain('NEGRONI')
    expect(uno).not.toContain('SPRITZ')
    expect(due).toContain('NEGRONI')
    expect(due).not.toContain('SPRITZ')
    expect(tre).toContain('SPRITZ')
    expect(tre).not.toContain('NEGRONI')
  })

  it('e l’ordine di uscita è quello in cui sono state chieste', async () => {
    // Al banco la sequenza conta: i ticket si leggono nell'ordine in cui
    // sono stati battuti.
    const { printComanda } = await import('../../src/lib/printer.js')
    const lavori = [1, 2, 3, 4].map((n) => printComanda(conto(n, [{ qty: 1, name: `Drink${n}` }])))
    await Promise.all(lavori)
    expect(carta().map((c) => c.match(/D ?R ?I ?N ?K ?\d/)[0].replace(/ /g, ''))).toEqual([
      'DRINK1',
      'DRINK2',
      'DRINK3',
      'DRINK4',
    ])
  })
})

// ── IL CONFINE: MAI CONTI DIVERSI SULLO STESSO FOGLIO ────────────────
//
// «Ma sempre dello stesso ordine!» (l'utente, 20/08). Vale per tutte e due
// le strade: le comande separate e quella unita. Un ticket è un giro di
// lavoro al banco, e un giro appartiene a un conto solo — due conti sulla
// stessa carta vuol dire drink portati al tavolo sbagliato.
describe('un lavoro di stampa contiene un ordine solo', () => {
  const conQuattroComande = () => ({
    id: 'o9',
    daily_number: 9,
    comande: [
      // Con `drink_id`, come al banco: e' quello che permette di sommare
      // lo stesso drink battuto in due riprese.
      { id: 'c1', seq: 1, status: 'ritirato', items: [{ drink_id: 'moj', qty: 1, name: 'Mojito' }] },
      { id: 'c2', seq: 2, status: 'annullato', items: [{ drink_id: 'neg', qty: 5, name: 'Negroni' }] },
      { id: 'c3', seq: 3, status: 'ricevuto', items: [{ drink_id: 'moj', qty: 2, name: 'Mojito' }] },
      { id: 'c4', seq: 4, status: 'ricevuto', items: [{ drink_id: 'spr', qty: 1, name: 'Spritz' }] },
    ],
  })

  it('«una per comanda»: tanti fogli quante comande, e niente di altri conti', async () => {
    const { printComande } = await import('../../src/lib/printer.js')
    expect(await printComande(conQuattroComande())).toBe(3) // l'annullata resta fuori
    expect(finestre).toHaveLength(3)
    for (const c of carta()) expect(c).not.toContain('NEGRONI')
  })

  it('«tutto su una»: UN foglio con tutti i prodotti del conto, sommati', async () => {
    const { printComandaUnita } = await import('../../src/lib/printer.js')
    await printComandaUnita(conQuattroComande())
    expect(finestre).toHaveLength(1)
    const foglio = carta()[0]
    // I tre Mojito di due comande diverse fanno una riga sola da 3.
    expect(foglio).toMatch(/3\s+M ?O ?J ?I ?T ?O/)
    expect(foglio).toContain('SPRITZ')
    expect(foglio).not.toContain('NEGRONI') // annullata: lavoro buttato
    // Un'intestazione sola, cioè un conto solo. Dal 25/08 la fascia dice
    // il conto invece di «DIRETTO» (BUG-089); sul ticket unito, che non è
    // nessuna comanda in particolare, dice solo quello.
    expect(foglio.match(/O ?R ?D ?I ?N ?E/g)).toHaveLength(1)
  })

  it('e prende un ORDINE, non una lista: non c’è modo di passargliene due', async () => {
    // Il confine è nella FIRMA, non in un controllo che qualcuno può
    // dimenticare: printComandaUnita(order) e printComande(order, comande)
    // partono da un conto solo, e le comande sono le sue.
    const { printComandaUnita, printComande } = await import('../../src/lib/printer.js')
    expect(printComandaUnita.length).toBe(1)
    expect(printComande.length).toBe(2)
    // Anche passando le comande a mano, l'intestazione è quella dell'ordine
    // che si è dato: le righe di un altro conto non hanno come entrare.
    const mio = conQuattroComande()
    await printComande(mio, [mio.comande[0]])
    expect(carta()[0]).toContain('# 9')
  })
})
