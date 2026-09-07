// @vitest-environment happy-dom
'use strict'

// ── LA SERA CHE SI RISCUOTEVA E LO SCONTRINO NON USCIVA (BUG-086) ────
//
// Flavio, dal locale, il 24/08 sera: «in fase di riscossione non stampava
// lo scontrino», e «ieri sera buona parte delle stampe non sono uscite».
// Girava la 1.5.1.
//
// LA CATENA, per intero: si riscuote → si prende la pretesa dello
// scontrino → parte la stampa → la stampa si impicca sul logo → la
// promessa non si chiude né bene né male → il `catch` di chi ha chiesto la
// stampa NON PARTE → la pretesa resta presa per sempre. Quel conto non
// stampa più, nemmeno riaperto, nemmeno dalla coda; e a schermo non
// compare niente. Cinque riscossioni, zero scontrini, nessun errore.
//
// I PEZZI SI PROVAVANO, LA CATENA NO. `logoScontrino.test.js` prova che il
// logo si arrende (BUG-053) e che il «non c'è» si ricorda (BUG-032);
// `stampaSerializzata.test.js` prova che i lavori non si accavallano
// (BUG-052). Nessuno metteva insieme riscossione, pretesa, stampa e
// rimedio — che è dove il danno è successo davvero.
//
// Qui si guarda LA CARTA (la stampante finta apre una finestra per ogni
// `send()`) e si guarda LA PRETESA (localStorage): sono le due cose che al
// banco fanno la differenza fra «stampa» e «non stamperà mai più».

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let finestre

beforeEach(() => {
  // Il printer è un singleton di modulo (connessione, coda, cache del
  // logo): ogni prova riparte da capo.
  vi.resetModules()
  finestre = []
  localStorage.clear()
  // L'auto-stampa dello scontrino accesa e la stampante configurata, come
  // al banco.
  localStorage.setItem(
    'tana_printer_v2',
    JSON.stringify({ autoPrintScontrino: true, ip: '10.0.0.9', port: 8043 })
  )
  window.open = vi.fn(() => {
    const scritto = []
    finestre.push(scritto)
    return { document: { write: (h) => scritto.push(h), close: () => {} }, focus: () => {} }
  })
  // IL LOGO NON ARRIVA MAI: un'immagine che non chiama né onload né
  // onerror. È la `fetch` che pende — logo.png non stava fra le risorse
  // precaricate del service worker e si andava a prenderlo in rete — ed è
  // il punto da cui è cominciata la serata del 24/08. Ogni stampa qui
  // dentro passa quindi dai tre secondi del logo (BUG-053).
  window.Image = class {
    set src(_v) {
      /* nessun evento, mai */
    }
  }
})

afterEach(() => {
  vi.useRealTimers()
  delete window.epson
})

const conto = (n) => ({
  id: `o${n}`,
  daily_number: n,
  total: 10,
  payment_status: 'pagato',
  created_at: '2026-08-24T21:00:00.000Z',
  order_items: [{ qty: 1, name: 'Mojito', unit_price: 10 }],
  comande: [{ id: 'c1', seq: 1, status: 'ritirato', items: [{ qty: 1, name: 'Mojito' }] }],
})

// Il gesto della riscossione com'è scritto in PaymentScreen.jsx
// (`closePaid`): pretesa forzata perché l'incasso è una chiusura nuova,
// stampa che NON si aspetta — local-first — e il rimedio nel `catch`.
// Torna una funzione che dice com'è finita, perché al banco l'unica cosa
// che si vede è l'esito.
function riscuoti(P, order) {
  let esito = 'in volo'
  if (P.loadPrinterSettings().autoPrintScontrino && P.reclaimReceiptPrint(order.id)) {
    P.printScontrino(order)
      .then(() => {
        esito = 'carta uscita'
      })
      .catch((e) => {
        esito = `fallita: ${e.message}`
        // La carta non è uscita: la pretesa torna libera, così la coda o
        // la prossima chiusura ci riprovano (BUG-047).
        P.releaseReceiptPrint(order.id)
      })
  } else esito = 'pretesa negata'
  return () => esito
}

const respira = async (giri = 30) => {
  for (let i = 0; i < giri; i++) await Promise.resolve()
}

// ── IL LOGO CHE NON ARRIVA (la causa del 24/08) ──────────────────────
describe('si riscuote con il logo che non arriva mai', () => {
  it('la carta esce lo stesso, e la pretesa non resta appesa', async () => {
    vi.useFakeTimers()
    const P = await import('../../src/lib/printer.js')
    const stato = riscuoti(P, conto(1))
    // Tre secondi: il logo si arrende (BUG-053) e lo scontrino prosegue.
    await vi.advanceTimersByTimeAsync(3100)
    await respira()

    expect(stato()).toBe('carta uscita')
    expect(finestre).toHaveLength(1)
    // La pretesa è presa da chi ha stampato davvero: la coda non fa la
    // seconda copia.
    expect(P.claimReceiptPrint('o1')).toBe(false)
  })

  it('e vale per OGNI conto della serata: cinque riscossioni, cinque fogli', async () => {
    vi.useFakeTimers()
    const P = await import('../../src/lib/printer.js')
    const stati = []
    for (let n = 1; n <= 5; n++) {
      stati.push(riscuoti(P, conto(n)))
      await vi.advanceTimersByTimeAsync(3100)
      await respira()
    }
    // Sulla 1.5.1 erano zero su cinque, e nessuno se ne accorgeva.
    expect(finestre).toHaveLength(5)
    expect(stati.map((s) => s())).toEqual(Array(5).fill('carta uscita'))
  })
})

// ── LA DIFESA SUL LAVORO INTERO ──────────────────────────────────────
//
// Il tempo massimo del logo copre IL LOGO. Se domani si impicca un altro
// passaggio — la stampante che accetta il collegamento e poi tace, un
// `await` aggiunto qui dentro — si tornerebbe al 24/08: pretesa presa per
// sempre e nessun errore da nessuna parte. Quindi il tempo massimo sta
// anche sul LAVORO: quindici secondi e la promessa rifiuta.
describe('una stampa che non si conclude non si tiene il conto', () => {
  // La stampante VERA (niente carta finta) che accetta la chiamata e non
  // risponde più: `getPrinter()` resta sospeso, cioè il lavoro si impicca
  // PRIMA di scrivere una riga.
  function stampanteCheNonRisponde() {
    const inviati = []
    let rispondi = null
    window.epson = {
      ePOSDevice: class {
        constructor() {
          this.DEVICE_TYPE_PRINTER = 'printer'
        }
        connect(_ip, _porta, cb) {
          rispondi = cb // …e non lo chiama nessuno, finché non lo dice la prova
        }
        createDevice(_nome, _tipo, _opzioni, cb) {
          const testina = {
            ALIGN_LEFT: 'l', ALIGN_CENTER: 'c', ALIGN_RIGHT: 'r',
            COLOR_1: 1, CUT_FEED: 1,
            addTextLang: () => {}, addTextSmooth: () => {}, addTextAlign: () => {},
            addTextSize: () => {}, addTextStyle: () => {}, addText: () => {},
            addFeedLine: () => {}, addCut: () => {}, addImage: () => {},
            addImageUrl: () => {}, clearCommandBuffer: () => {},
            send: () => inviati.push('foglio'),
          }
          cb(testina, 'OK')
        }
        isConnected() {
          return true
        }
      },
    }
    return { inviati, rispondiOra: () => rispondi?.('OK') }
  }

  beforeEach(() => {
    // La stampante finta risponde sempre: qui serve quella vera, che è il
    // solo modo di tenere un lavoro appeso senza inventarsi niente.
    localStorage.setItem('tana_stampante_finta', 'false')
  })

  it('scaduto il tempo: la pretesa torna libera e il banco lo viene a sapere', async () => {
    const { inviati } = stampanteCheNonRisponde()
    vi.useFakeTimers()
    const P = await import('../../src/lib/printer.js')
    const stato = riscuoti(P, conto(1))

    // Quattordici secondi: si aspetta ancora. Sotto il tempo massimo non
    // si molla niente — una stampante lenta è una stampante che stampa.
    await vi.advanceTimersByTimeAsync(14000)
    await respira()
    expect(stato()).toBe('in volo')

    await vi.advanceTimersByTimeAsync(2000)
    await respira()

    // 1. Chi sta al banco lo sa: il messaggio arriva a schermo dal
    //    `catch` che sulla 1.5.1 non partiva mai.
    expect(stato()).toBe('fallita: la stampante non ha risposto entro 15 secondi')
    // 2. La pretesa è tornata libera: quel conto può ancora stampare —
    //    dalla coda, o riscuotendo di nuovo.
    expect(P.claimReceiptPrint('o1')).toBe(true)
    // 3. E carta non ne è uscita.
    expect(inviati).toHaveLength(0)
  })

  it('e se la stampa lenta arriva davvero in fondo, non esce una seconda copia', async () => {
    const { inviati, rispondiOra } = stampanteCheNonRisponde()
    vi.useFakeTimers()
    const P = await import('../../src/lib/printer.js')
    const stato = riscuoti(P, conto(1))
    await vi.advanceTimersByTimeAsync(16000)
    await respira()
    expect(stato()).toContain('fallita')

    // La stampante si sveglia mezzo minuto dopo e il lavoro abbandonato
    // riprende da dov'era, arriva in fondo al ticket e chiama `send()`:
    // senza difesa manderebbe alla testina un foglio che nessuno aspetta
    // più, oltre a quello che nel frattempo qualcuno ha ristampato a
    // mano. La penna gliel'abbiamo tolta: scrive su un guscio sordo.
    rispondiOra()
    await vi.advanceTimersByTimeAsync(5000) // il suo logo si arrende e il ticket si completa
    await respira(60)
    expect(inviati).toHaveLength(0)
  })

  it('e la coda riparte: il conto dopo stampa', async () => {
    const { inviati, rispondiOra } = stampanteCheNonRisponde()
    vi.useFakeTimers()
    const P = await import('../../src/lib/printer.js')
    riscuoti(P, conto(1))
    await vi.advanceTimersByTimeAsync(16000)
    await respira()

    // Sulla 1.5.1 la coda restava dietro al lavoro impiccato e la
    // stampante era muta per il resto della serata. Adesso il posto è
    // libero: la stampante torna a rispondere e il conto dopo esce.
    rispondiOra()
    const secondo = riscuoti(P, conto(2))
    // TRE SECONDI PER IL LOGO CHE SI ARRENDE, e basta quello. Col
    // ripensamento di BUG-098 (01/09/2026) il lavoro torna a chiudersi
    // sulla `send()`: la risposta della stampante non trattiene più
    // nessuno, e questa qui non risponde MAI — è il suo mestiere in questa
    // prova. Il margine resta largo perché una prova che sta sul filo dei
    // millisecondi è una prova ballerina.
    await vi.advanceTimersByTimeAsync(9000)
    await respira(60)
    expect(secondo()).toBe('carta uscita')
    // Un foglio solo: quello del conto 2. Il lavoro abbandonato del conto
    // 1 è arrivato in fondo anche lui, ma la sua carta non esce.
    expect(inviati).toHaveLength(1)
  })
})
