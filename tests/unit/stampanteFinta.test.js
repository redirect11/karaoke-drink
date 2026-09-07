// @vitest-environment happy-dom
'use strict'

// LA STAMPANTE FINTA, SOLO IN LOCALE. Da un computer di sviluppo
// l'apparecchio del bar non si raggiunge, e ogni modifica a comande e
// scontrini si provava a occhio nel codice. Sull'ambiente di TEST invece
// non si accende: lì ci si collega alla stampante vera, ed è il posto dove
// provarla davvero.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { stampanteFintaAttiva, creaStampanteFinta, forzaStampanteFinta } from '../../src/lib/stampanteFinta.js'

describe('quando si accende la stampante finta', () => {
  it('col server di sviluppo', () => {
    expect(stampanteFintaAttiva({ DEV: true })).toBe(true)
  })

  it('con l’app compilata «come il server», in locale', () => {
    expect(stampanteFintaAttiva({ MODE: 'locale' })).toBe(true)
  })

  it('con gli emulatori: se il database è finto, lo è anche il bar', () => {
    expect(stampanteFintaAttiva({ VITE_USE_FIREBASE_EMULATOR: 'true' })).toBe(true)
  })

  it('NON sull’ambiente di test: lì si prova la stampante vera', () => {
    expect(stampanteFintaAttiva({ VITE_APP_ENV: 'test', PROD: true })).toBe(false)
  })

  it('NON in produzione', () => {
    expect(stampanteFintaAttiva({ VITE_APP_ENV: 'production', PROD: true })).toBe(false)
  })

  it('si può forzare, in un verso e nell’altro', () => {
    expect(stampanteFintaAttiva({ VITE_STAMPANTE_FINTA: 'true', PROD: true })).toBe(true)
    expect(stampanteFintaAttiva({ VITE_STAMPANTE_FINTA: 'false', DEV: true })).toBe(false)
  })
})

describe('quello che esce dalla stampante finta', () => {
  // LA FINESTRA SI GUARDA, NON SI STAMPA. Prima partiva da sola la stampa
  // in PDF: per leggere una comanda si passava ogni volta da una finestra
  // di sistema, con un file da buttare a ogni prova. Chi vuole la carta ha
  // il suo tasto dentro la pagina.
  it('mostra il facsimile e NON fa partire la stampa da sola', () => {
    const stampa = vi.fn()
    const doc = { write: vi.fn(), close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue({ document: doc, focus: vi.fn(), print: stampa })
    vi.useFakeTimers()

    const p = creaStampanteFinta('Comanda')
    p.addTextAlign(p.ALIGN_CENTER)
    p.addText('LA TANA\n')
    p.addTextAlign(p.ALIGN_LEFT)
    p.addText('2  Negroni\n')
    p.addCut()
    p.send()

    vi.runAllTimers()
    const scritto = doc.write.mock.calls[0][0]
    expect(scritto).toContain('LA TANA')
    expect(scritto).toContain('Negroni')
    expect(scritto).toContain('facsimile')
    expect(stampa).not.toHaveBeenCalled()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('il logo, se c’è, sta in cima al facsimile', () => {
    const doc = { write: vi.fn(), close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue({ document: doc, focus: vi.fn(), print: vi.fn() })
    const p = creaStampanteFinta('Scontrino')
    p.addImageUrl('/logo.png')
    p.addText('LA TANA\n')
    p.send()
    const scritto = doc.write.mock.calls[0][0]
    expect(scritto).toContain('<img src="/logo.png"')
    vi.restoreAllMocks()
  })

  it('avvisa chi ascolta, come farebbe quella vera', () => {
    vi.spyOn(window, 'open').mockReturnValue(null) // finestra bloccata
    const p = creaStampanteFinta('Scontrino')
    const visto = vi.fn()
    p.onreceive = visto
    p.addText('prova\n')
    p.send()
    expect(visto).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    vi.restoreAllMocks()
  })

  it('dopo l’invio riparte pulita: due comande non si sommano', () => {
    const doc = { write: vi.fn(), close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue({ document: doc, focus: vi.fn(), print: vi.fn() })
    vi.useFakeTimers()
    const p = creaStampanteFinta('Comanda')
    p.addText('prima\n')
    p.send()
    p.addText('seconda\n')
    p.send()
    vi.runAllTimers()
    expect(doc.write.mock.calls[1][0]).not.toContain('prima')
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
})

// ── L'INTERRUTTORE DEL TERMINALE (sezione Dev) ───────────────────────
//
// «Se non ho la stampante voglio poter fare le prove di stampa simulata
// anche sulla versione web» (l'utente, 20/08). Sul sito di TEST l'ambiente
// è quello vero e la finta resta spenta di suo — la regola qui sopra non
// cambia — ma il TERMINALE può forzarla dalla sezione Dev: localStorage,
// vale solo per quel dispositivo, e vince in tutti e due i versi.
describe('la forzatura dal terminale', () => {
  afterEach(() => {
    forzaStampanteFinta(null)
  })

  const AMBIENTE_TEST = { DEV: false, MODE: 'production' }

  it('accesa dalla sezione Dev, simula anche sul sito di test', () => {
    forzaStampanteFinta(true)
    expect(stampanteFintaAttiva(AMBIENTE_TEST)).toBe(true)
  })

  it('e vince anche al contrario: stampante vera in locale', () => {
    forzaStampanteFinta(false)
    expect(stampanteFintaAttiva({ DEV: true })).toBe(false)
  })

  it('tolta la forzatura, torna la regola d’ambiente', () => {
    forzaStampanteFinta(true)
    forzaStampanteFinta(null)
    expect(stampanteFintaAttiva(AMBIENTE_TEST)).toBe(false)
    expect(stampanteFintaAttiva({ DEV: true })).toBe(true)
  })
})

// Le finestre del facsimile aperte dalla stampante finta: contarle è il
// modo di dire se la carta e' uscita.
let finestre

// ── IL GUASTO FINTO (BUG-098) ────────────────────────────────────────
//
// La catena della diagnostica — risposta di errore, registro, avviso a
// schermo — fino a qui si provava solo al banco, con la carta finita in
// mano: ed è esattamente per questo che «la chiusura di cassa spesso non
// stampa» è sopravvissuto tanto. Con la stampante finta che sa rompersi,
// tutta la catena si prova da un computer di sviluppo.
describe('la stampante finta sa anche rompersi', () => {
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
  })

  it('di suo non si rompe: nessun guasto, e la risposta arriva', async () => {
    const { guastoFinto } = await import('../../src/lib/stampanteFinta.js')
    expect(guastoFinto()).toBe(null)

    const P = await import('../../src/lib/printer.js')
    const { statoRegistro } = await import('../../src/lib/registroStampe.js')
    await P.printTest()
    expect(finestre).toHaveLength(1)
    expect(statoRegistro().voci[0].esito).toBe('riuscita')
  })

  it('«carta finita»: niente facsimile, e il motivo arriva fino al registro', async () => {
    // CAMBIATO col ripensamento di BUG-098 (01/09/2026): la stampa non
    // aspetta più la risposta, quindi NON rifiuta più — chi ha chiesto la
    // stampa è andato avanti da un pezzo. Il guasto si legge dopo, nel
    // registro, che è il posto dove serve a chi ripara.
    const { impostaGuastoFinto } = await import('../../src/lib/stampanteFinta.js')
    impostaGuastoFinto('carta')

    const P = await import('../../src/lib/printer.js')
    const { statoRegistro } = await import('../../src/lib/registroStampe.js')
    await expect(P.printTest()).resolves.toBeUndefined()
    // Come al banco: la stampante ha detto di no e la carta non esce.
    expect(finestre).toHaveLength(0)
    const voce = statoRegistro().voci[0]
    expect(voce.esito).toBe('fallita')
    expect(voce.motivo).toMatch(/la carta è finita/)
  })

  it('«nessuna risposta»: la carta esce e la voce resta in attesa', async () => {
    // È il caso sospettato dietro la chiusura di cassa che non si vede
    // uscire, e il più difficile da riconoscere: la stampante fa MENO, non
    // di più. Un fallimento non c'è — e dirlo sarebbe una bugia. Da
    // BUG-098 (ripensamento) non c'è nemmeno più un'attesa: la stampa si
    // chiude subito e la voce resta «inviata» per sempre.
    const { impostaGuastoFinto } = await import('../../src/lib/stampanteFinta.js')
    impostaGuastoFinto('muta')

    const P = await import('../../src/lib/printer.js')
    const { statoRegistro } = await import('../../src/lib/registroStampe.js')
    await P.printTest()

    expect(finestre).toHaveLength(1) // il facsimile c'è: la carta è uscita
    expect(statoRegistro().voci[0].esito).toBe('inviata')
  })

  it('il guasto si spegne, e la stampa torna a riuscire', async () => {
    const { impostaGuastoFinto, guastoFinto } = await import('../../src/lib/stampanteFinta.js')
    impostaGuastoFinto('carta')
    impostaGuastoFinto(null)
    expect(guastoFinto()).toBe(null)

    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    expect(finestre).toHaveLength(1)
  })

  it('un guasto che non esiste non si accende: si scrive quello, o niente', async () => {
    // La leva la muove chi sta provando, ma il valore arriva da
    // localStorage: una memoria sporca non deve poter inventare un
    // comportamento che nel codice non c'è.
    const { impostaGuastoFinto, guastoFinto } = await import('../../src/lib/stampanteFinta.js')
    impostaGuastoFinto('esplodi')
    expect(guastoFinto()).toBe(null)
    localStorage.setItem('tana_stampante_finta_guasto', 'esplodi')
    expect(guastoFinto()).toBe(null)
  })
})
