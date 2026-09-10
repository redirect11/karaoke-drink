// @vitest-environment happy-dom
'use strict'

// ── SE LA STAMPANTE È VIVA LO DICE LEI (BUG-102) ─────────────────────
//
// La sera del 05/09/2026 la stampante ha smesso di stampare TUTTO: non solo
// la chiusura di cassa — anche le ristampe di chiusure vecchie, cioè fogli
// già pronti. E il pallino in alto è rimasto verde per tutto il tempo.
//
// PERCHÉ IL VERDE MENTIVA. La vita del collegamento si chiedeva a
// `isConnected()` dell'SDK Epson, che risponde di sì anche quando sta solo
// PROVANDO a riconnettersi. Quindi il battito non scattava, l'oggetto
// stampante restava in memoria, il controllo di stato lo trovava e diceva
// «ok», e ogni invio finiva in un collegamento che non c'era più: nessun
// errore, nessun blocco, nessuna carta.
//
// LA CURA, in tre giri. Primo (BUG-102): si smette di chiedere all'SDK e si
// ascolta la STAMPANTE. Secondo (BUG-105): l'interrogazione dell'SDK, che
// passava da un canale suo, dichiarava morta una stampante viva, e si
// spegne. Terzo (BUG-107): la domanda si fa sul CANALE DELLE STAMPE — un
// lavoro vuoto ogni mezzo minuto, il modo Epson di chiedere lo stato senza
// far uscire carta — e i ganci dell'SDK per il socket che cade vengono
// attaccati all'oggetto giusto, dove per un anno non erano stati.
//
// Questi test guardano la cosa dal lato del DANNO: che il collegamento
// morto venga mollato, che qualcuno lo venga a sapere, e — la parte che
// vale quanto le altre — che nessuna di queste aggiunte possa fermare una
// stampa o sballare il registro.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Le testine create finora: ogni stretta di mano ne fa una nuova, quindi
// contarle è il modo di sapere se il collegamento è stato rifatto.
let testine
let invii
let rispostaPer
// I collegamenti chiusi per bene: `disconnect()` è la differenza fra
// chiudere e abbandonare, e sulla stampante vera è la sessione che si
// libera invece di restare mezza aperta.
let chiusure
// I dispositivi (`ePOSDevice`) creati: è su QUESTI che l'SDK alza
// `ondisconnect` e `onreconnecting`, non sulla testina (BUG-107).
let dispositivi

function accendiLaStampante() {
  testine = []
  invii = []
  chiusure = []
  dispositivi = []
  window.epson = {
    ePOSDevice: class {
      constructor() {
        this.DEVICE_TYPE_PRINTER = 'printer'
        this.ondisconnect = null
        this.onreconnecting = null
        this.onreconnect = null
        dispositivi.push(this)
      }
      connect(_ip, _porta, cb) {
        cb('OK')
      }
      createDevice(_nome, _tipo, _opzioni, cb) {
        // Il builder dell'SDK accumula comandi e `send()` li manda tutti:
        // un invio SENZA comandi è il battito, e la differenza fra i due
        // è tutto ciò che questi test devono poter vedere.
        const comandi = []
        const scrive = () => comandi.push(1)
        const testina = {
          ALIGN_LEFT: 'l', ALIGN_CENTER: 'c', ALIGN_RIGHT: 'r',
          COLOR_1: 1, CUT_FEED: 1,
          addTextLang: scrive, addTextSmooth: scrive, addTextAlign: scrive,
          addTextSize: scrive, addTextStyle: scrive, addText: scrive,
          addFeedLine: scrive, addCut: scrive, addImage: scrive,
          addImageUrl: scrive,
          clearCommandBuffer: () => {
            comandi.length = 0
          },
          send: () => {
            const vuoto = comandi.length === 0
            comandi.length = 0
            invii.push({ testina, vuoto })
            const res = rispostaPer(invii.length, testina, vuoto)
            if (res) testina.onreceive?.(res)
          },
          // Il monitor vero è una domanda lunga alla stampante. Qui basta
          // sapere se è stato acceso, con che intervallo, e se è stato
          // spento quando il collegamento è stato mollato: un poller
          // lasciato acceso su una testina buttata è traffico verso una
          // stampante per conto di nessuno.
          monitorAcceso: false,
          startMonitor() {
            this.monitorAcceso = true
            return true
          },
          stopMonitor() {
            this.monitorAcceso = false
            return true
          },
          onreceive: null,
          // Come nell'SDK vero: la costante sta sull'oggetto, e `status` è
          // quello che la STAMPANTE ha risposto all'ultimo giro del
          // monitor. Accendendoci il segno «nessuna risposta» si finge
          // esattamente la sera del 5 settembre.
          ASB_NO_RESPONSE: 1,
          status: 0,
        }
        testine.push(testina)
        cb(testina, 'OK')
      }
      disconnect() {
        chiusure.push(this)
        // Come nell'SDK vero: chiudere alza `ondisconnect` NELLO STESSO
        // GIRO. Chi chiude deve aspettarselo.
        this.ondisconnect?.()
      }
      isConnected() {
        // IL PUNTO DI TUTTA LA FACCENDA: l'SDK dice sempre di sì. È quello
        // che faceva davvero mentre non usciva niente.
        return true
      }
    },
  }
}

const OK = { success: true, code: '', status: 0 }
const respira = async (giri = 40) => {
  for (let i = 0; i < giri; i++) await Promise.resolve()
}
const ultima = () => testine[testine.length - 1]
const ultimoDispositivo = () => dispositivi[dispositivi.length - 1]
// Stampe e battiti passano dalla stessa `send()`: li distingue solo il
// fatto che il battito non ha comandi dentro.
const stampe = () => invii.filter((i) => !i.vuoto)
const battiti = () => invii.filter((i) => i.vuoto)

beforeEach(() => {
  // Il printer è un singleton di modulo: ogni prova riparte da capo.
  vi.resetModules()
  localStorage.clear()
  localStorage.setItem(
    'tana_printer_v2',
    JSON.stringify({ ip: '10.0.0.9', port: 8043, https: true })
  )
  // Serve quella vera: la finta risponde sempre, e qui il punto è proprio
  // decidere se e quando risponde.
  localStorage.setItem('tana_stampante_finta', 'false')
  rispostaPer = () => OK
  accendiLaStampante()
  window.Image = class {
    set src(_v) {
      queueMicrotask(() => this.onerror?.(new Error('404')))
    }
  }
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  delete window.epson
})

async function avvisi() {
  const { subscribeNotifs } = await import('../../src/lib/notifyStore.js')
  let stato = null
  subscribeNotifs((s) => {
    stato = s
  })()
  return stato.tutte
}

// ── IL MONITOR RESTA SPENTO (BUG-105) ────────────────────────────────
//
// Acceso il 06/09 in buona fede, tolto il 08/09 dopo una serata al banco:
// «esce spesso questo avviso e la stampa è molto lenta, ci mette molti
// secondi per stampare la chiusura dell'ordine».
//
// Il danno, visto al banco: ogni dieci secondi il monitor falliva, alzava
// `onpoweroff`, e il collegamento veniva buttato. La stampa dopo rifaceva
// la stretta di mano — che con un certificato auto-firmato su iPad costa
// secondi. Avvisi a raffica e stampe lente erano la stessa cosa vista da
// due lati.
//
// PERCHÉ FALLISSE È UN'IPOTESI (vedi `ascoltaLaStampante` in printer.js):
// `startMonitor()` interroga la stampante su un canale HTTP suo, verso
// un'altra origine e con intestazioni che chiedono al browser un permesso
// preventivo che la stampante forse non dà. Non è verificato — la stretta
// di mano di socket.io passa dalla stessa origine e funziona. Quel che
// conta è la lezione: una diagnostica su un canale DIVERSO da quello delle
// stampe può sbagliarsi per conto suo, e se può buttare il collegamento il
// suo errore diventa un guasto vero. Da qui il battito (più sotto).
describe('il monitor non si accende', () => {
  it('nessuna interrogazione parte alla stretta di mano', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    expect(ultima().monitorAcceso).toBe(false)
  })

  it('e la stampa esce come sempre', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    expect(invii).toHaveLength(1)
  })
})

describe('quando smette di rispondere, il collegamento si molla', () => {
  it('«non rispondo più»: la stampa dopo rifà la stretta di mano', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    const prima = ultima()
    expect(testine).toHaveLength(1)

    // È la stampante a dirlo, non l'SDK — che qui continua a giurare che
    // il collegamento è su.
    prima.onpoweroff()
    await respira()

    await P.printTest()
    await respira()

    // Collegamento nuovo: prima si continuava a parlare a quello morto.
    expect(testine).toHaveLength(2)
    expect(invii[1].testina).toBe(ultima())
  })

  it('e il monitor di quello vecchio si spegne', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    const prima = ultima()

    prima.onpoweroff()
    await respira()

    // Un poller lasciato acceso su una testina buttata interrogherebbe la
    // stampante per conto di un collegamento che non esiste più, e ogni
    // riconnessione ne lascerebbe indietro un altro.
    expect(prima.monitorAcceso).toBe(false)
  })

  it('lo viene a sapere chi sta lavorando', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    ultima().onpoweroff()
    await respira()

    const tutti = await avvisi()
    expect(tutti[0].body).toContain('non risponde')
  })

  it('il pallino smette di dire che va tutto bene', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    ultima().onpoweroff()
    await respira()

    // Prima qui usciva `ok: true` per il solo fatto che in memoria c'era un
    // oggetto stampante: è il verde che non voleva dire niente.
    expect(P.guastoStampante()).toBe('la stampante non risponde')
  })

  it('e quando torna, il verde torna con lei', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    ultima().onpoweroff()
    await respira()
    // La testina buttata non serve più: si riparte, e la stampante nuova
    // dice che c'è.
    await P.printTest()
    await respira()
    ultima().ononline()

    expect(P.guastoStampante()).toBe(null)
  })
})

describe('un guaio della carta non è un collegamento morto', () => {
  // Carta finita, coperchio aperto, fuori linea: la stampante ci PARLA, il
  // collegamento è buono. Buttarlo vorrebbe dire una riconnessione inutile
  // nel mezzo del servizio.
  for (const [evento, atteso] of [
    ['onpaperend', 'la carta è finita'],
    ['oncoveropen', 'il coperchio della stampante è aperto'],
    ['onoffline', 'la stampante è fuori linea'],
  ]) {
    it(`${evento}: si avvisa, ma il collegamento resta`, async () => {
      const P = await import('../../src/lib/printer.js')
      await P.printTest()
      await respira()
      const prima = ultima()

      prima[evento]()
      await respira()
      expect(P.guastoStampante()).toBe(atteso)

      await P.printTest()
      await respira()
      expect(testine).toHaveLength(1)
      expect(invii[1].testina).toBe(prima)
    })
  }

  it('e la carta che torna a uscire chiude il guaio', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    ultima().onpaperend()
    await respira()
    expect(P.guastoStampante()).toBe('la carta è finita')

    // Una risposta buona è la prova che la carta c'è: l'ha appena stampata.
    await P.printTest()
    await respira()
    expect(P.guastoStampante()).toBe(null)
  })
})

describe('tre invii che nessuno raccoglie sono una strada chiusa', () => {
  // La regola vale per le stampe e, più sotto, per i battiti: passano
  // dalla stessa strada.
  it('uno solo no: «non lo sappiamo» resta la risposta onesta', async () => {
    rispostaPer = () => undefined
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    await vi.advanceTimersByTimeAsync(6000)
    await respira()

    expect(P.guastoStampante()).toBe(null)
    expect(await avvisi()).toHaveLength(0)
  })

  it('tre di fila sì: si molla e si dice', async () => {
    rispostaPer = () => undefined
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await P.printTest()
    await P.printTest()
    await respira()
    expect(invii).toHaveLength(3)

    await vi.advanceTimersByTimeAsync(6000)
    await respira()

    expect(P.guastoStampante()).toBe('la stampante non risponde')
    expect((await avvisi())[0].body).toContain('non risponde')

    // E il collegamento è stato mollato: la stampa dopo ne apre uno nuovo.
    rispostaPer = () => OK
    await P.printTest()
    await respira()
    expect(testine).toHaveLength(2)
  })

  it('il conto riparte con la strada nuova', async () => {
    // Senza azzerarlo, il primo silenzio del collegamento nuovo lo farebbe
    // mollare di nuovo dopo un solo foglio.
    rispostaPer = () => undefined
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await P.printTest()
    await P.printTest()
    await vi.advanceTimersByTimeAsync(6000)
    await respira()
    expect(testine).toHaveLength(1)

    await P.printTest()
    await respira()
    await vi.advanceTimersByTimeAsync(6000)
    await respira()

    // Un foglio muto sul collegamento nuovo: uno solo, quindi non si molla.
    expect(testine).toHaveLength(2)
  })
})

describe('e niente di tutto questo rompe quello che c’era', () => {
  it('gli eventi di stato non contano come risposte di stampa', async () => {
    // Il monitor passa da una strada sua e NON alza `onreceive`: se lo
    // facesse, il conto invii/risposte si sfaserebbe e ogni esito nel
    // registro finirebbe sul foglio sbagliato.
    let rispondi = null
    rispostaPer = (_n, testina) => {
      rispondi = () => testina.onreceive?.(OK)
      return undefined
    }
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    ultima().onpaperend()
    ultima().ononline()
    await respira()

    rispondi()
    await respira()

    const { statoRegistro } = await import('../../src/lib/registroStampe.js')
    const voci = statoRegistro().voci
    expect(voci).toHaveLength(1)
    expect(voci[0].esito).toBe('riuscita')
  })

  it('lo stesso guaio non fa una valanga di avvisi', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    // Col monitor acceso una stampante spenta lo direbbe ogni dieci
    // secondi: sei strisce identiche al minuto sono il modo migliore per
    // smettere di leggerle.
    ultima().onpaperend()
    ultima().onpaperend()
    ultima().onpaperend()
    await respira()

    expect(await avvisi()).toHaveLength(1)
  })

  it('nessuna stampa aspetta il monitor', async () => {
    const P = await import('../../src/lib/printer.js')
    let finita = false
    const stampa = P.printTest().then(() => {
      finita = true
    })
    await respira()

    // Nessun orologio fatto girare: il foglio è partito e il gesto è
    // chiuso, come prima di tutta questa storia.
    expect(invii).toHaveLength(1)
    expect(finita).toBe(true)
    await stampa
  })
})

// ── IL BATTITO: UN LAVORO VUOTO SUL CANALE DELLE STAMPE (BUG-107) ─────
//
// Una stampante che sparisce in silenzio — cavo staccato, indirizzo
// cambiato dal router, Wi-Fi caduto — non chiude nessun socket: il browser
// non se ne accorge finché non prova a MANDARE qualcosa. È la sera del
// 05/09: verde, socket morto, nessun evento. L'unico modo di scoprirlo è
// mandare qualcosa e vedere se torna.
//
// Quel qualcosa è un documento VUOTO, ed è il modo ufficiale Epson di
// chiedere lo stato senza stampare (manuale ePOS-Print XML, p. 56: «To
// check the printer status without printing, send empty print data»).
// Passa dallo stesso WebSocket delle stampe, si conta e si ascolta come
// una stampa: una risposta prova che la strada è aperta ADESSO, tre
// silenzi di fila la chiudono.
describe('il battito', () => {
  it('ogni mezzo minuto parte un lavoro vuoto, sulla stessa testina', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    expect(battiti()).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(30000)
    expect(battiti()).toHaveLength(1)
    expect(battiti()[0].testina).toBe(ultima())

    await vi.advanceTimersByTimeAsync(60000)
    expect(battiti()).toHaveLength(3)
    // E non ha fatto nascere nessun collegamento nuovo.
    expect(testine).toHaveLength(1)
  })

  it('non entra nel registro delle stampe', async () => {
    // Un rigo ogni mezzo minuto renderebbe il registro illeggibile: il
    // battito è diagnostica, non una stampa.
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    await vi.advanceTimersByTimeAsync(90000)
    expect(battiti()).toHaveLength(3)

    const { statoRegistro } = await import('../../src/lib/registroStampe.js')
    expect(statoRegistro().voci).toHaveLength(1)
  })

  it('finché risponde, il collegamento resta quello: niente strette di mano', async () => {
    // Era la finestra di un minuto a farle rifare (BUG-106): col battito
    // che risponde la prova è sempre fresca e la finestra non scade mai.
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    await vi.advanceTimersByTimeAsync(121000)
    await P.printTest()
    await respira()

    expect(testine).toHaveLength(1)
    expect(stampe()).toHaveLength(2)
  })

  it('un battito muto da solo non molla niente', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    rispostaPer = () => undefined
    await vi.advanceTimersByTimeAsync(36000)

    expect(P.guastoStampante()).toBe(null)
    expect(await avvisi()).toHaveLength(0)
  })

  it('tre battiti muti di fila: si molla e si dice', async () => {
    // Il caso del 05/09, scoperto da solo entro un minuto e mezzo: tre
    // battiti muti più i cinque secondi d'ascolto dell'ultimo.
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    rispostaPer = () => undefined
    await vi.advanceTimersByTimeAsync(96000)
    expect(battiti()).toHaveLength(3)

    expect(P.guastoStampante()).toBe('la stampante non risponde')
    expect((await avvisi())[0].body).toContain('non risponde')

    // E la stampa dopo rifà la stretta di mano invece di parlare al vuoto.
    rispostaPer = () => OK
    await P.printTest()
    await respira()
    expect(testine).toHaveLength(2)
    expect(stampe()[1].testina).toBe(ultima())
  })

  it('un collegamento mollato non lo riapre il battito', async () => {
    // La stretta di mano costa e la fa la prima stampa che serve: un
    // battito che riaprisse da sé rifarebbe la stretta di mano ogni mezzo
    // minuto verso una stampante spenta.
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    ultima().onpoweroff()
    await respira()
    expect(testine).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(120000)

    expect(testine).toHaveLength(1)
    expect(battiti()).toHaveLength(0)
  })

  it('se risponde «non ce la faccio», si dice ma il collegamento resta', async () => {
    // Carta finita scoperta dal battito, non dalla stampa: chi sta al banco
    // lo sa PRIMA di battere il conto.
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    rispostaPer = () => ({ success: false, code: 'ASB_NO_PAPER', status: 0 })
    await vi.advanceTimersByTimeAsync(30000)

    expect(P.guastoStampante()).toBe('la carta è finita')
    expect((await avvisi())[0].body).toContain('carta')
    await P.printTest()
    await respira()
    expect(testine).toHaveLength(1)
  })

  it('lo stesso guaio detto dalla stampa e poi dal battito è un avviso solo', async () => {
    // La carta finisce: la stampa fallisce e lo dice; mezzo minuto dopo il
    // battito la trova ancora finita. È un fatto solo, con due titoli
    // diversi sarebbero due strisce uguali — e chi le legge smetterebbe.
    rispostaPer = () => ({ success: false, code: 'ASB_NO_PAPER', status: 0 })
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    expect(await avvisi()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(30000)
    expect(battiti()).toHaveLength(1)
    expect(await avvisi()).toHaveLength(1)
  })

  it('e non sfasa il conto delle risposte: ogni esito resta sul suo foglio', async () => {
    // Il battito si conta come un invio: se non lo facesse, la sua
    // risposta finirebbe addosso alla stampa dopo, e nel registro un esito
    // sul foglio sbagliato.
    rispostaPer = (n, testina, vuoto) => {
      if (vuoto) return OK
      return n === 1 ? OK : { success: false, code: 'ASB_NO_PAPER', status: 0 }
    }
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    await vi.advanceTimersByTimeAsync(60000)
    await P.printTest()
    await respira()

    const { statoRegistro } = await import('../../src/lib/registroStampe.js')
    const voci = statoRegistro().voci
    expect(voci).toHaveLength(2)
    // Il registro tiene l'ultima voce in cima.
    expect(voci.map((v) => v.esito)).toEqual(['fallita', 'riuscita'])
  })
})

// ── LA FINESTRA DI UN MINUTO RESTA COME RETE DI RISERVA (BUG-106) ────
//
// Prima del battito era la regola: prima di stampare, se la stampante non
// aveva risposto da più di un minuto, si rifaceva la stretta di mano. Col
// battito che risponde la finestra non scade mai; scade solo quando i
// battiti sono muti — nel minuto e mezzo che il contatore dei muti impiega
// a decidere — e allora la stampa che arriva in quel buco riparte da zero
// invece di partire verso il vuoto. È l'ultima difesa, non la prima.
describe('la finestra di un minuto, quando i battiti sono muti', () => {
  it('due stampe di fila non ne rifanno nessuna', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    await P.printTest()
    await respira()

    // Durante il servizio il collegamento resta caldo: rifarlo a ogni
    // comanda era proprio quello che faceva fallire la prima stampa quando
    // l'eccezione del certificato era scaduta.
    expect(testine).toHaveLength(1)
    expect(stampe()).toHaveLength(2)
  })

  it('la stampa che arriva nel buco riparte da zero', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    // Due battiti muti: non bastano ancora a mollare, ma dall'ultima
    // risposta è passato più di un minuto.
    rispostaPer = () => undefined
    await vi.advanceTimersByTimeAsync(61000)
    expect(P.guastoStampante()).toBe(null)
    rispostaPer = () => OK
    await P.printTest()
    await respira()

    expect(testine).toHaveLength(2)
    // E il foglio è uscito dalla testina NUOVA: prima finiva in quella
    // vecchia, cioè da nessuna parte.
    expect(stampe()[1].testina).toBe(ultima())
  })

  it('e quel collegamento si chiude, non si abbandona', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    rispostaPer = () => undefined
    await vi.advanceTimersByTimeAsync(61000)
    rispostaPer = () => OK
    await P.printTest()
    await respira()

    // Abbandonarlo lascerebbe sulla stampante una sessione mezza aperta
    // finché non scade da sé: una alla volta non è un problema, ripetuto a
    // ogni pausa sì, perché di sessioni insieme ne regge poche.
    expect(chiusure).toHaveLength(1)
  })

  it('ma dopo trenta secondi no: durante il servizio non si tocca niente', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    rispostaPer = () => undefined
    await vi.advanceTimersByTimeAsync(30000)
    rispostaPer = () => OK
    await P.printTest()
    await respira()

    expect(testine).toHaveLength(1)
  })

  it('la stretta di mano appena fatta vale come prova', async () => {
    // Senza questo, la prima stampa dopo una riconnessione troverebbe il
    // collegamento già scaduto e ne farebbe un'altra, all'infinito.
    rispostaPer = (_n, _t, vuoto) => (vuoto ? undefined : OK)
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    await vi.advanceTimersByTimeAsync(61000)
    await P.printTest()
    await respira()
    expect(testine).toHaveLength(2)

    await P.printTest()
    await respira()
    expect(testine).toHaveLength(2)
  })

  it('un invio a cui nessuno risponde non è una prova', async () => {
    // È il punto: prova vuol dire che la stampante ha PARLATO. Un foglio
    // mandato e mai confermato è esattamente il silenzio da cui nasce
    // BUG-102, e prenderlo per buono rimetterebbe in piedi il difetto.
    rispostaPer = () => undefined
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    await vi.advanceTimersByTimeAsync(61000)
    rispostaPer = () => OK
    await P.printTest()
    await respira()

    expect(testine).toHaveLength(2)
  })
})

// ── E PRIMA DI STAMPARE SI GUARDA COSA HA SCRITTO LEI ────────────────
//
// L'SDK scrive sulla testina lo stato che la stampante ha risposto al
// monitor, e quando smette di rispondere ci accende il segno «nessuna
// risposta». Col monitor spento (BUG-105) oggi quel segno non lo accende
// nessuno; leggerlo costa zero e resta per il giorno in cui tornasse
// utile. Se c'è, vale subito: non si aspetta né un battito né la finestra.
describe('lo stato scritto sulla testina si legge prima di stampare', () => {
  it('se ha detto di non rispondere, si riparte da zero senza aspettare', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    const prima = ultima()

    // Il segno resta scritto sulla testina. Non passa nemmeno un secondo.
    prima.status = prima.ASB_NO_RESPONSE
    await P.printTest()
    await respira()

    expect(testine).toHaveLength(2)
    expect(stampe()[1].testina).toBe(ultima())
  })

  it('se invece sta bene non si tocca niente', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    await P.printTest()
    await respira()

    expect(testine).toHaveLength(1)
    expect(chiusure).toHaveLength(0)
  })
})

// ── I GANCI DELL'SDK, SULL'OGGETTO GIUSTO (BUG-107) ──────────────────
//
// L'SDK Epson avvisa quando il socket cade: `onreconnecting` mentre ci
// riprova da solo (cinque volte ogni tre secondi), `ondisconnect` quando
// si arrende. Li alza sul DISPOSITIVO (`ePOSDevice`), e fin dal primo
// giorno l'app li aveva attaccati alla TESTINA, dove non scattano mai.
// Tutte le cadute rumorose — stampante spenta, cavo staccato con la
// stampante che chiude — l'SDK le sapeva e noi no.
describe("i ganci dell'SDK stanno sul dispositivo, non sulla testina", () => {
  it('sono attaccati al dispositivo', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    expect(typeof ultimoDispositivo().ondisconnect).toBe('function')
    expect(typeof ultimoDispositivo().onreconnecting).toBe('function')
    // E non più alla testina, che non li alzerebbe mai.
    expect(ultima().ondisconnect).toBeUndefined()
  })

  it('«sto provando a ricollegarmi»: si molla, si chiude e si dice', async () => {
    // In quel quarto di minuto `isConnected()` dice di sì e una stampa
    // prenderebbe una strada che non arriva. Non si aspetta: si chiude,
    // così l'SDK smette di provarci, e la stampa dopo riparte da zero.
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    ultimoDispositivo().onreconnecting()
    await respira()

    expect(chiusure).toHaveLength(1)
    expect(P.guastoStampante()).toBe('la stampante non risponde')
    expect((await avvisi())[0].body).toContain('non risponde')

    await P.printTest()
    await respira()
    expect(testine).toHaveLength(2)
    expect(stampe()[1].testina).toBe(ultima())
  })

  it('«mi sono arreso»: si molla e si dice, senza chiudere quel che è già chiuso', async () => {
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    ultimoDispositivo().ondisconnect()
    await respira()

    expect(chiusure).toHaveLength(0)
    expect(P.guastoStampante()).toBe('la stampante non risponde')

    await P.printTest()
    await respira()
    expect(testine).toHaveLength(2)
  })

  it('il gancio di un dispositivo già buttato non fa niente', async () => {
    // `ondisconnect` arriva DOPO `onreconnecting`, a dispositivo già
    // dimenticato — e magari dopo che la stampa seguente ne ha aperto uno
    // nuovo. Buttare quello nuovo per una caduta di quello vecchio sarebbe
    // un secondo danno.
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()
    const vecchio = ultimoDispositivo()
    vecchio.onreconnecting()
    await respira()
    await P.printTest()
    await respira()
    expect(testine).toHaveLength(2)

    vecchio.ondisconnect()
    await respira()
    await P.printTest()
    await respira()

    expect(testine).toHaveLength(2)
    expect(chiusure).toHaveLength(1)
  })

  it('chiudere noi non passa per una caduta', async () => {
    // `disconnect()` dell'SDK alza `ondisconnect` nello stesso giro: se il
    // gestore prendesse la nostra chiusura per una caduta, ogni «Test
    // stampa» farebbe partire un avviso di stampante che non risponde.
    const P = await import('../../src/lib/printer.js')
    await P.printTest()
    await respira()

    P.disconnectPrinter()
    await respira()

    expect(chiusure).toHaveLength(1)
    expect(P.guastoStampante()).toBe(null)
    expect(await avvisi()).toHaveLength(0)
  })
})
