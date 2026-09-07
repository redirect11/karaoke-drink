// @vitest-environment happy-dom
'use strict'

// ── COSA C'È SUL FOGLIO DI CHIUSURA (BUG-098) ────────────────────────
//
// «Quando fanno la chiusura cassa, la stampante non stampa lo scontrino di
// chiusura molto spesso» (Flavio, 28/08/2026). Andando a guardare quel
// gesto è venuto fuori che nessuno aveva mai provato nemmeno COSA c'è
// scritto su quel foglio: `cashRecap` ha venti test — i numeri sono
// coperti — ma dai numeri alla carta non c'era niente in mezzo.
//
// È il documento più difficile da rifare a memoria: le comande si
// riscrivono, lo scontrino si ristampa dal conto, ma il foglio di chiusura
// è la fotografia di una serata finita. Qui si guarda LA CARTA — in locale
// la stampante è finta e ogni lavoro apre la sua finestra col facsimile —
// perché è l'unico modo di dire che quel foglio serve ancora a far
// quadrare il cassetto.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let finestre

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  finestre = []
  window.open = vi.fn(() => {
    const scritto = []
    finestre.push(scritto)
    return { document: { write: (h) => scritto.push(h), close: () => {} }, focus: () => {} }
  })
  window.Image = class {
    set src(_v) {
      queueMicrotask(() => this.onerror?.(new Error('404')))
    }
  }
  // Un adesso fermo: senza, il facsimile cambia a ogni giro.
  vi.useFakeTimers({ now: Date.parse('2026-08-29T02:30:00.000Z') })
})

afterEach(() => {
  vi.useRealTimers()
})

const carta = (n = 0) => {
  const html = (finestre[n] || []).join('')
  return html.match(/<pre>([\s\S]*?)<\/pre>/)?.[1] ?? ''
}

const SESSIONE = { id: 's1', opened_at: '2026-08-28T17:00:00.000Z', fondo_cassa: 50 }

// Il riepilogo com'esce da `cashRecap`: una serata con quattro metodi
// battuti, uno sconto, e un fondo di cinquanta.
const RECAP = {
  incassato: 430,
  nPagati: 18,
  sconti: 12,
  fondo: 50,
  byMethod: { banco: 200, carta: 130, lettore: 80, online: 20, buono: 0 },
  contanteAtteso: 250,
  apertoDaIncassare: 0,
  nAperti: 0,
}

describe('il foglio di chiusura porta la serata intera', () => {
  it('i metodi di pagamento, con gli stessi nomi dello scontrino', async () => {
    // La chiusura si confronta con la striscia degli scontrini: due parole
    // diverse per la stessa cosa costringono a tradurre a mente mentre si
    // contano i soldi.
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    await printChiusuraCassa(RECAP, SESSIONE, { by: 'flavio@tana.it' })
    const foglio = carta()

    expect(foglio).toMatch(/CHIUSURA CASSA/)
    expect(foglio).toMatch(/Contante\s+200\.00€/)
    expect(foglio).toMatch(/Carta di Credito\s+130\.00€/)
    expect(foglio).toMatch(/SumUp\s+80\.00€/)
    expect(foglio).toMatch(/Online\s+20\.00€/)
    // I metodi noti ci sono anche a zero: la striscia si legge uguale ogni
    // sera, e una riga che manca è una domanda in più a fine turno.
    expect(foglio).toMatch(/Buono VIP\s+0\.00€/)
  })

  it('il totale, gli sconti concessi e i conti chiusi', async () => {
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    await printChiusuraCassa(RECAP, SESSIONE, {})
    const foglio = carta()

    expect(foglio).toMatch(/Totale incassato/)
    // Il totale esce a caratteri doppi: sulla carta è la riga che si
    // guarda per prima, e la testina la scrive larga.
    expect(foglio).toMatch(/4 3 0 \. 0 0 €/)
    expect(foglio).toMatch(/Sconti concessi\s+-12\.00€/)
    expect(foglio).toMatch(/Conti chiusi\s+18/)
  })

  it('il fondo e il contante ATTESO: è il numero con cui si conta il cassetto', async () => {
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    await printChiusuraCassa(RECAP, SESSIONE, {})
    const foglio = carta()
    expect(foglio).toMatch(/Fondo cassa\s+50\.00€/)
    expect(foglio).toMatch(/Contante atteso\s+250\.00€/)
  })

  it('l’ora di apertura e chi ha chiuso: una serata si ritrova da lì', async () => {
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    await printChiusuraCassa(RECAP, SESSIONE, { by: 'flavio@tana.it' })
    const foglio = carta()
    expect(foglio).toMatch(/Apertura: 28\/08\/26/)
    expect(foglio).toContain('Operatore: flavio@tana.it')
  })
})

describe('il contante contato e la differenza', () => {
  it('contato in più: la differenza esce col segno davanti', async () => {
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    await printChiusuraCassa(RECAP, SESSIONE, { countedCash: '265' })
    const foglio = carta()
    expect(foglio).toMatch(/Contante contato\s+265\.00€/)
    expect(foglio).toMatch(/Differenza\s+\+15\.00€/)
  })

  it('contato in meno: la differenza è negativa, e si legge', async () => {
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    await printChiusuraCassa(RECAP, SESSIONE, { countedCash: '230' })
    expect(carta()).toMatch(/Differenza\s+-20\.00€/)
  })

  it('il conto torna: differenza a zero, senza segno', async () => {
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    await printChiusuraCassa(RECAP, SESSIONE, { countedCash: '250' })
    expect(carta()).toMatch(/Differenza\s+0\.00€/)
  })

  it('la virgola al posto del punto: chi conta scrive «250,50»', async () => {
    // Sul tastierino dell'iPad la virgola è il separatore di casa.
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    await printChiusuraCassa(RECAP, SESSIONE, { countedCash: '250,50' })
    expect(carta()).toMatch(/Contante contato\s+250\.50€/)
  })

  it('non contato: nessuna riga inventata', async () => {
    // Non tutti contano subito, e una differenza calcolata su uno zero
    // finto sarebbe un ammanco che non esiste.
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    await printChiusuraCassa(RECAP, SESSIONE, { countedCash: '' })
    const foglio = carta()
    expect(foglio).not.toContain('Contante contato')
    expect(foglio).not.toContain('Differenza')
  })
})

describe('i casi storti della chiusura', () => {
  it('con dei conti ancora aperti il foglio lo dice, invece di far finta di niente', async () => {
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    await printChiusuraCassa(
      { ...RECAP, apertoDaIncassare: 45, nAperti: 2 },
      SESSIONE,
      {}
    )
    expect(carta()).toMatch(/Conti aperti \(2\)\s+45\.00€/)
  })

  it('un metodo mai visto prima entra in fondo, invece di sparire', async () => {
    // Il secchio dei metodi è aperto (vedi cassa.js): se domani si batte un
    // metodo nuovo, quei soldi devono comparire da qualche parte.
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    await printChiusuraCassa(
      { ...RECAP, byMethod: { ...RECAP.byMethod, satispay: 33 } },
      SESSIONE,
      {}
    )
    expect(carta()).toMatch(/satispay\s+33\.00€/)
  })

  it('un riepilogo vuoto non stampa «NaN€»: una serata da zero incassi è una serata', async () => {
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    await printChiusuraCassa({}, {}, {})
    const foglio = carta()
    expect(foglio).not.toContain('NaN')
    expect(foglio).not.toContain('undefined')
    expect(foglio).toMatch(/Conti chiusi\s+0/)
  })
})
