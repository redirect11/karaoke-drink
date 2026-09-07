// @vitest-environment happy-dom
'use strict'

// ── LA RISPOSTA DELLA STAMPANTE È DIAGNOSTICA (REQ-STAMPA-016, BUG-098)
//
// Flavio, 28/08/2026: «quando fanno la chiusura cassa, la stampante non
// stampa lo scontrino di chiusura molto spesso». E i fatti: durante la
// serata la stampante stampa SEMPRE, la RISTAMPA della stessa chiusura
// esce subito, e quando non stampa NON compare nessun avviso.
//
// La causa strutturale è una sola: NON SAPEVAMO SE AVESSE STAMPATO. La
// risposta della stampante (`onreceive`: carta finita, coperchio aperto,
// fuori linea) finiva in una riga di console scollegata dal lavoro che
// l'aveva causata.
//
// IL RIPENSAMENTO DEL 01/09/2026, ed è il motivo per cui questo file è
// stato riscritto: la prima stesura aveva messo il lavoro ad ASPETTARE
// quella risposta. Era un `await` sulla stampante nel mezzo di un gesto —
// la cosa che in questo progetto non si fa (CLAUDE.md, local-first): chi
// chiude cassa col locale pieno non deve stare fermo davanti a una
// testina. Quello che cambia rispetto ai test di prima è QUANDO si sa
// l'esito, non CHE lo si sappia:
//   · la stampa si chiude sull'INVIO, come è sempre stato;
//   · la risposta arriva dopo e aggiorna la voce nel registro;
//   · su risposta di ERRORE parte un avviso, che resta nello storico;
//   · su risposta buona non si dice niente a schermo;
//   · nessuna risposta = nessuno se ne accorge, e la voce resta «inviata»;
//   · e nessun ritentativo automatico: a ristampare è una persona.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Le testine create finora: ogni stretta di mano ne fa una nuova, e
// tenerle in mano è il modo di far arrivare una risposta IN RITARDO da una
// connessione che nel frattempo è stata buttata.
let testine
// Gli invii arrivati alla stampante, in ordine. È la CARTA: se qui non c'è
// niente, al banco non è uscito niente.
let invii
// Chi risponde, e come. Tornando `undefined` questa stampante tace, e la
// risposta se la manderà la prova a mano — o mai più.
let rispostaPer

function accendiLaStampante() {
  testine = []
  invii = []
  window.epson = {
    ePOSDevice: class {
      constructor() {
        this.DEVICE_TYPE_PRINTER = 'printer'
      }
      connect(_ip, _porta, cb) {
        cb('OK')
      }
      createDevice(_nome, _tipo, _opzioni, cb) {
        const testina = {
          ALIGN_LEFT: 'l', ALIGN_CENTER: 'c', ALIGN_RIGHT: 'r',
          COLOR_1: 1, CUT_FEED: 1,
          addTextLang: () => {}, addTextSmooth: () => {}, addTextAlign: () => {},
          addTextSize: () => {}, addTextStyle: () => {}, addText: () => {},
          addFeedLine: () => {}, addCut: () => {}, addImage: () => {},
          addImageUrl: () => {}, clearCommandBuffer: () => {},
          send: () => {
            invii.push({ testina })
            const res = rispostaPer(invii.length, testina)
            if (res) testina.onreceive?.(res)
          },
          onreceive: null,
          ondisconnect: null,
        }
        testine.push(testina)
        cb(testina, 'OK')
      }
      isConnected() {
        return true
      }
    },
  }
}

const OK = { success: true, code: '', status: 0 }
const CARTA_FINITA = { success: false, code: 'EPTR_REC_EMPTY', status: 0 }
const COPERCHIO = { success: false, code: 'EPTR_COVER_OPEN', status: 0 }

const respira = async (giri = 40) => {
  for (let i = 0; i < giri; i++) await Promise.resolve()
}

beforeEach(() => {
  // Il printer è un singleton di modulo (connessione, coda, contatori
  // delle risposte): ogni prova riparte da capo.
  vi.resetModules()
  localStorage.clear()
  localStorage.setItem(
    'tana_printer_v2',
    JSON.stringify({ ip: '10.0.0.9', port: 8043, https: true })
  )
  // La stampante finta risponde sempre e non si può far tacere: qui serve
  // quella vera, che è il solo modo di decidere SE e QUANDO risponde.
  localStorage.setItem('tana_stampante_finta', 'false')
  rispostaPer = () => OK
  accendiLaStampante()
  // Niente logo: qui non c'è un server che lo serva, e l'errore arriva
  // subito invece di far aspettare i tre secondi del tempo massimo — che
  // con gli orologi finti non scadrebbero mai da soli.
  window.Image = class {
    set src(_v) {
      queueMicrotask(() => this.onerror?.(new Error('404')))
    }
  }
  // Gli orologi finti servono a due cose sole: chiudere a comando la
  // finestra d'ascolto delle risposte, e far passare il minuto oltre il
  // quale un avviso uguale torna a farsi vedere. Nessuna prova qui aspetta
  // un timer per avere il suo esito — è esattamente il punto.
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  delete window.epson
})

// Il registro delle stampe: è lì che al banco si va a leggere com'è andata.
async function registro() {
  const { statoRegistro } = await import('../../src/lib/registroStampe.js')
  return statoRegistro()
}

// Gli avvisi arrivati a chi sta lavorando: lo storico dietro la campanella
// e la strisciolina che compare adesso.
async function avvisi() {
  const { subscribeNotifs } = await import('../../src/lib/notifyStore.js')
  let stato = null
  subscribeNotifs((s) => {
    stato = s
  })()
  return stato.tutte
}

async function striscioline() {
  const { subscribeToasts } = await import('../../src/lib/toast.js')
  let stato = []
  subscribeToasts((t) => {
    stato = t
  })()
  return stato
}

// ── LA STAMPA NON ASPETTA ────────────────────────────────────────────
//
// È il vincolo che viene prima di tutti gli altri: chi chiude cassa non
// deve aspettare la stampante, come chi incassa non aspetta Firestore.
describe('la stampa si chiude sull’invio', () => {
  it('la stampante non risponde mai: chi ha chiesto la stampa va avanti lo stesso', async () => {
    rispostaPer = () => undefined
    const P = await import('../../src/lib/printer.js')

    let finita = false
    const stampa = P.printTest().then(() => {
      finita = true
    })
    await respira()

    // Il foglio è partito e il gesto è già chiuso, senza aver fatto girare
    // NESSUN orologio: nessuna attesa aggiunta a una serata di comande.
    expect(invii).toHaveLength(1)
    expect(finita).toBe(true)
    await stampa
  })

  it('e non aspetta nemmeno quando la risposta sta per arrivare', async () => {
    // LA PROVA CHE CONTA DI PIÙ. La risposta è pronta e in mano al test: se
    // il lavoro l'aspettasse, `printTest()` non tornerebbe finché non la si
    // manda. Torna prima, e la voce nel registro dice «inviata».
    let rispondi = null
    rispostaPer = (_n, testina) => {
      rispondi = () => testina.onreceive?.(OK)
      return undefined
    }
    const P = await import('../../src/lib/printer.js')
    await expect(P.printTest()).resolves.toBeUndefined()
    expect((await registro()).voci[0].esito).toBe('inviata')

    // Solo ADESSO la stampante parla, e la voce già scritta si corregge.
    rispondi()
    await respira()
    expect((await registro()).voci[0].esito).toBe('riuscita')
  })

  it('una risposta di errore non fa fallire il gesto: lo dice a parte', async () => {
    // Prima del ripensamento questa chiamata veniva RIFIUTATA, e il rifiuto
    // arrivava dopo l'attesa. Adesso il gesto è già chiuso quando si scopre
    // il guasto: a raccontarlo è l'avviso, non un'eccezione in faccia a chi
    // ha già cambiato schermata.
    rispostaPer = () => CARTA_FINITA
    const P = await import('../../src/lib/printer.js')
    await expect(P.printTest()).resolves.toBeUndefined()
    await respira()
    expect((await registro()).voci[0].esito).toBe('fallita')
  })

  it('e non si ritenta da soli: un foglio mandato, uno solo', async () => {
    // IL RITENTATIVO AUTOMATICO È STATO TOLTO. Senza attesa non c'è più il
    // momento in cui riprovare, e a ristampare è una persona: è anche
    // l'unico modo di non rischiare il doppio scontrino su una stampa che
    // in realtà era uscita.
    rispostaPer = () => CARTA_FINITA
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    await vi.advanceTimersByTimeAsync(30000)
    await respira()

    expect(invii).toHaveLength(1)
    expect(testine).toHaveLength(1) // nessuna stretta di mano rifatta
  })
})

// ── QUELLO CHE LA RISPOSTA RACCONTA ──────────────────────────────────
describe('la risposta aggiorna il registro', () => {
  it('risposta positiva: la voce diventa «riuscita»', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    expect(invii).toHaveLength(1)
    const voce = (await registro()).voci[0]
    expect(voce.esito).toBe('riuscita')
    expect(voce.che).toBe('Prova di stampa')
  })

  it('risposta di errore: la voce dice «non stampata», col motivo in italiano', async () => {
    rispostaPer = () => CARTA_FINITA
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    const voce = (await registro()).voci[0]
    expect(voce.esito).toBe('fallita')
    expect(voce.motivo).toMatch(/la carta è finita/)
  })

  it('un codice che non conosciamo si scrive per intero, invece di sparire', async () => {
    // Un «errore generico» non si va a cercare sul manuale; un codice sì.
    rispostaPer = () => ({ success: false, code: 'EPTR_QUALCOSA_DI_NUOVO' })
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    expect((await registro()).voci[0].motivo).toMatch(/EPTR_QUALCOSA_DI_NUOVO/)
  })

  it('nessuna risposta: la voce resta «inviata», che è l’informazione vera', async () => {
    // La stampante che stampa e non conferma esiste. Dire «non stampata»
    // sarebbe una bugia, e manderebbe a cercare un guasto che non c'è.
    rispostaPer = () => undefined
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    // Anche molto dopo, quando la finestra d'ascolto si è chiusa da sola.
    await vi.advanceTimersByTimeAsync(10000)
    await respira()

    const voce = (await registro()).voci[0]
    expect(voce.esito).toBe('inviata')
    expect(voce.motivo).toBe('')
  })

  it('il lavoro che non parte nemmeno resta un fallimento, e lo dice subito', async () => {
    // La difesa di BUG-086: un documento storto o un lavoro impiccato
    // RIFIUTA, perché lì il chiamante deve saperlo adesso — è quello che
    // libera la pretesa dello scontrino.
    const P = await import('../../src/lib/printer.js')
    await expect(
      P.printComanda({
        id: 'o1',
        daily_number: 3,
        comande: [{ id: 'c', items: [{ qty: 1, name: Object.create(null) }] }],
      })
    ).rejects.toThrow()
    await respira()

    const stato = await registro()
    expect(stato.voci[0].esito).toBe('fallita')
    expect(stato.inCorso).toBe(null)
  })
})

// ── SOLO GLI ERRORI FANNO RUMORE ─────────────────────────────────────
//
// «Spero anche che sull'evento di receive, se c'è un errore, venga inviata
// una notifica e scritto nel box delle notifiche. La stampa andata a buon
// fine non dovrebbe uscire, ma solo gli errori.» È l'unica cosa che
// nessuno nota da sé: la chiusura di cassa non uscita è rimasta invisibile
// per settimane.
describe('l’avviso di una stampa non riuscita', () => {
  it('dice COSA non è uscito e PERCHÉ, e resta nello storico', async () => {
    rispostaPer = () => CARTA_FINITA
    const P = await import('../../src/lib/printer.js')
    await P.printScontrino({
      id: 'o42',
      daily_number: 42,
      total: 23,
      order_items: [{ qty: 1, name: 'Negroni', unit_price: 23 }],
      payments: [],
    })
    await respira()

    const storico = await avvisi()
    expect(storico).toHaveLength(1)
    expect(storico[0].title).toMatch(/non riuscita/i)
    // Cosa: lo scontrino di quel conto. Perché: in parole da banco.
    expect(storico[0].body).toMatch(/Scontrino conto #42/)
    expect(storico[0].body).toMatch(/la carta è finita/)
    // E NIENTE CODICI DELL'SDK a schermo: quelli restano nel registro.
    expect(storico[0].body).not.toMatch(/EPTR/)
    // Non nasce già letta: la campanella la deve mostrare.
    expect(storico[0].letta).toBe(false)
    // E si vede anche adesso, senza aprire niente.
    expect(await striscioline()).toHaveLength(1)
  })

  it('una stampa riuscita non dice niente a schermo', async () => {
    // Un avviso a ogni comanda diventa rumore nel giro di mezz'ora, e la
    // carta uscita si vede da sé.
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    expect((await registro()).voci[0].esito).toBe('riuscita')
    expect(await avvisi()).toHaveLength(0)
    expect(await striscioline()).toHaveLength(0)
  })

  it('e nemmeno una stampante che tace: il silenzio non è un guasto', async () => {
    rispostaPer = () => undefined
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await vi.advanceTimersByTimeAsync(10000)
    await respira()

    expect(await avvisi()).toHaveLength(0)
  })

  it('dieci stampe fallite di fila non fanno dieci avvisi uguali', async () => {
    // NIENTE VALANGHE. Con la stampante fuori linea falliscono tutte le
    // stampe della serata: dieci strisce identiche una sull'altra sono
    // peggio di una sola, perché si smette di leggerle. Il registro le ha
    // tutte, ed è il posto dove si contano.
    rispostaPer = () => CARTA_FINITA
    const P = await import('../../src/lib/printer.js')
    for (let n = 0; n < 10; n++) {
      await P.printTest()
      await respira()
    }

    expect((await registro()).voci.filter((v) => v.esito === 'fallita')).toHaveLength(10)
    expect(await avvisi()).toHaveLength(1)
  })

  it('ma un guasto DIVERSO si dice subito: è un’altra cosa da andare a sistemare', async () => {
    // Carta finita e coperchio aperto si rimediano in due modi diversi:
    // tacere il secondo perché il primo è appena stato detto manderebbe a
    // guardare il posto sbagliato.
    let quale = CARTA_FINITA
    rispostaPer = () => quale
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    quale = COPERCHIO
    await P.printTest()
    await respira()

    const storico = await avvisi()
    expect(storico).toHaveLength(2)
    expect(storico[0].body).toMatch(/coperchio/)
    expect(storico[1].body).toMatch(/carta/)
  })

  it('e passato il minuto, lo stesso guasto torna a farsi vedere', async () => {
    // Il silenzio non è per sempre: se dopo un minuto la stampante fallisce
    // ancora, vuol dire che nessuno ci ha messo mano e vale la pena dirlo.
    rispostaPer = () => CARTA_FINITA
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    expect(await avvisi()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(61000)
    await P.printTest()
    await respira()
    expect(await avvisi()).toHaveLength(2)
  })
})

// ── DARE OGNI RISPOSTA AL SUO FOGLIO ─────────────────────────────────
//
// L'SDK non dà identificativi di lavoro: la correlazione si regge sul
// fatto che le risposte tornano nell'ordine degli invii. Adesso che il
// lavoro non aspetta, di fogli in volo ce n'è più di uno alla volta — e
// sbagliare vorrebbe dire un avviso di «carta finita» addosso a una stampa
// riuscita.
describe('la risposta va sul foglio che l’ha causata', () => {
  it('due fogli di fila: a ognuno la sua risposta', async () => {
    const risposte = []
    rispostaPer = (n, testina) => {
      risposte.push(() => testina.onreceive?.(n === 1 ? CARTA_FINITA : OK))
      return undefined
    }
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await P.printTest()
    await respira()
    expect(invii).toHaveLength(2)

    risposte[0]()
    risposte[1]()
    await respira()

    // Il registro si legge dalla più recente: [0] è il secondo foglio.
    const voci = (await registro()).voci
    expect(voci[1].esito).toBe('fallita')
    expect(voci[0].esito).toBe('riuscita')
  })

  it('la risposta di una connessione già buttata non finisce addosso a nessuno', async () => {
    rispostaPer = () => undefined
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    const vecchia = invii.at(-1).testina

    // La connessione cade e si rifà: l'oggetto stampante è un altro.
    P.disconnectPrinter()
    await P.printTest()
    await respira()
    expect(testine).toHaveLength(2)

    // Adesso la testina di prima si sveglia e dice «carta finita»: senza
    // difesa quel guasto diventerebbe il verdetto del foglio di adesso —
    // un avviso a schermo per una stampa che è uscita benissimo.
    vecchia.onreceive?.(CARTA_FINITA)
    await respira()

    expect((await registro()).voci.every((v) => v.esito === 'inviata')).toBe(true)
    expect(await avvisi()).toHaveLength(0)
  })

  it('una risposta che arriva troppo tardi non si attribuisce a indovinare', async () => {
    // L'ascolto si chiude da solo dopo qualche secondo, e NON è un'attesa:
    // il lavoro è chiuso da un pezzo. Serve solo a non lasciare i conti
    // sfasati, che è come una risposta finisce sul foglio sbagliato.
    let rispondi = null
    rispostaPer = (_n, testina) => {
      rispondi = () => testina.onreceive?.(CARTA_FINITA)
      return undefined
    }
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await vi.advanceTimersByTimeAsync(10000)

    rispondi()
    await respira()
    expect((await registro()).voci[0].esito).toBe('inviata')
    expect(await avvisi()).toHaveLength(0)
  })

  it('e una stampante lenta la prima volta non resta muta per tutta la serata', async () => {
    // Contare gli invii funziona finché a ogni invio segue una risposta:
    // una che non arriva MAI lascerebbe il conto indietro di uno per
    // sempre, e da lì in poi ogni risposta finirebbe sul foglio sbagliato.
    rispostaPer = () => undefined
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await vi.advanceTimersByTimeAsync(10000)
    await respira()
    expect((await registro()).voci[0].esito).toBe('inviata')

    // Da qui in poi risponde, e le voci tornano a dire la verità.
    rispostaPer = () => OK
    await P.printTest()
    await respira()
    expect((await registro()).voci[0].esito).toBe('riuscita')
  })
})

// ── LA CODA ──────────────────────────────────────────────────────────
describe('la coda delle stampe', () => {
  it('un lavoro fallito non blocca il successivo', async () => {
    // Carta finita adesso non vuol dire stampante morta: si cambia il
    // rotolo e la comanda dopo deve uscire.
    let giri = 0
    rispostaPer = () => (++giri === 1 ? CARTA_FINITA : OK)
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await P.printTest()
    await respira()

    const stato = await registro()
    expect(stato.voci[0].esito).toBe('riuscita')
    expect(stato.voci[1].esito).toBe('fallita')
    // E la coda è tornata vuota: nessun lavoro resta appeso.
    expect(stato.inCorso).toBe(null)
    expect(stato.inAttesa).toHaveLength(0)
  })

  it('le stampe restano una per volta, ma nessuna aspetta una risposta', async () => {
    // La coda serve ancora a non intrecciare due ticket nello stesso
    // builder (BUG-052). Quello che NON fa più è tenere ferma la seconda
    // finché la prima non è confermata: la coda scorre alla velocità degli
    // invii.
    rispostaPer = () => undefined
    const P = await import('../../src/lib/printer.js')
    const primo = P.printTest()
    const secondo = P.printTest()
    await respira()

    await expect(primo).resolves.toBeUndefined()
    await expect(secondo).resolves.toBeUndefined()
    expect(invii).toHaveLength(2)
  })
})
