'use strict'

// ── I CAMPI DELLO SCONTRINO E DELLA COMANDA (REQ-STAMPA-014) ─────────
//
// «Servono delle impostazioni per cambiare/modificare/aggiungere/eliminare
// i campi dello scontrino. I campi che si possono aggiungere/togliere NON
// sono campi liberi: sono i campi che in genere si trovano su uno
// scontrino. La stessa cosa per la comanda. Sicuramente deve andarci la
// lista dei prodotti, quella è fissa» (l'utente, 20/08).
//
// Qui si prova il VOCABOLARIO: cosa risponde a chi stampa, e cosa
// risponde quando il locale non ha mai aperto quel pannello. La carta che
// ne esce si guarda in campiDiStampa.test.js.

import { describe, it, expect } from 'vitest'
import {
  CAMPI_SCONTRINO,
  CAMPI_COMANDA,
  configStampa,
  immagineCaricata,
  logoAcceso,
  problemiLogo,
  quotaScura,
  tipoScontrino,
  TIPI_LOGO,
  LARGHEZZA_LOGO,
} from '../../src/lib/campiStampa.js'

const ids = (campi) => campi.map((c) => c.id)

describe('il vocabolario è chiuso, e non contiene i prodotti', () => {
  // «Sicuramente deve andarci la lista dei prodotti, quella è fissa»: non
  // è che di suo è accesa — non c'è proprio, così non esiste il modo di
  // spegnerla per sbaglio. Stessa cosa per il totale: un conto senza
  // totale non è un conto.
  it('la lista dei prodotti non è fra i campi dello scontrino', () => {
    for (const id of ids(CAMPI_SCONTRINO)) {
      expect(id).not.toMatch(/prodotti|righe|articoli|totale/)
    }
  })

  it('e nemmeno fra quelli della comanda', () => {
    for (const id of ids(CAMPI_COMANDA)) {
      expect(id).not.toMatch(/prodotti|righe|articoli/)
    }
  })

  it('ogni campo ha un’etichetta da vassoio e un valore di partenza', () => {
    for (const campo of [...CAMPI_SCONTRINO, ...CAMPI_COMANDA]) {
      expect(campo.label.length).toBeGreaterThan(2)
      expect(typeof campo.acceso).toBe('boolean')
      // Il testo c'è solo dove il campo è puro testo, e ha un valore di
      // partenza: quello che si stampa oggi.
      if (campo.testo) expect(typeof campo.testo.valore).toBe('string')
    }
  })
})

describe('quando il locale non ha scelto niente', () => {
  // NESSUNA MIGRAZIONE: il documento delle impostazioni non ha queste
  // voci, e la carta deve uscire com'è sempre uscita.
  it('vale il comportamento di oggi, campo per campo', () => {
    const cfg = configStampa({}, 'scontrino')
    for (const campo of CAMPI_SCONTRINO) {
      expect(cfg.mostra(campo.id)).toBe(campo.acceso)
    }
  })

  it('e le parole di oggi', () => {
    const cfg = configStampa(undefined, 'comanda')
    expect(cfg.testo('sottotitolo')).toBe('Il tuo menu')
    expect(cfg.testo('conteggio')).toBe('CONTATORIE')
  })

  // LA FASCIA NON HA PIÙ PAROLE DA SCRIVERE (BUG-089): dice quale ticket
  // è, e quel contenuto viene dai dati. Un locale che aveva scritto la
  // sua parola non trova niente di rotto — quel testo non viene più
  // letto, e la fascia esce piena lo stesso.
  it('la fascia non ha parole, e quelle salvate ieri non la rompono', () => {
    expect(configStampa(undefined, 'comanda').testo('fascia')).toBe('')
    const conVecchio = configStampa({ stampa_comanda: { testi: { fascia: 'CUCINA' } } }, 'comanda')
    expect(conVecchio.mostra('fascia')).toBe(true)
  })

  // UN CAMPO CHE NESSUNO HA ELENCATO SI STAMPA. Se domani printer.js
  // scrive un blocco nuovo e qui non è ancora nel vocabolario, la carta
  // esce COMPLETA: una riga sparita in silenzio sarebbe il difetto
  // peggiore che questa roba possa avere.
  it('un campo che il vocabolario non conosce si stampa lo stesso', () => {
    expect(configStampa({}, 'scontrino').mostra('roba_inventata_domani')).toBe(true)
  })

  it('una stampa che non ha campi non fa saltare niente', () => {
    expect(configStampa({}, 'fattura').mostra('qualunque')).toBe(true)
    expect(configStampa({}, 'fattura').testo('qualunque')).toBe('')
  })
})

describe('quando il locale sceglie', () => {
  const scelte = {
    stampa_scontrino: {
      campi: { operatore: false, riga_cortesia: true },
      testi: { riga_cortesia: 'Grazie e a presto!' },
    },
  }

  it('il campo spento resta spento, gli altri non si toccano', () => {
    const cfg = configStampa(scelte, 'scontrino')
    expect(cfg.mostra('operatore')).toBe(false)
    expect(cfg.mostra('numero')).toBe(true)
  })

  it('un campo spento di suo si può accendere', () => {
    const cfg = configStampa(scelte, 'scontrino')
    expect(cfg.mostra('riga_cortesia')).toBe(true)
    expect(cfg.testo('riga_cortesia')).toBe('Grazie e a presto!')
  })

  // Il testo VUOTO è una scelta: vuol dire «quella riga non la voglio»,
  // e non deve tornare al valore di partenza.
  it('un testo cancellato resta cancellato', () => {
    const cfg = configStampa({ stampa_comanda: { testi: { sottotitolo: '' } } }, 'comanda')
    expect(cfg.testo('sottotitolo')).toBe('')
  })
})

// ── PRECONTO O SCONTRINO ─────────────────────────────────────────────
//
// Sono la stessa stampa e nessun chiamante passa un tipo: la differenza
// la fa il conto. Serve al logo, che sul preconto può esserci e sullo
// scontrino no (o viceversa).
describe('preconto o scontrino lo dice il conto', () => {
  it('conto ancora aperto: è un preconto', () => {
    expect(tipoScontrino({ status: 'aperto' })).toBe('preconto')
  })

  it('conto pagato: è uno scontrino', () => {
    expect(tipoScontrino({ status: 'pagato' })).toBe('scontrino')
    expect(tipoScontrino({ status: 'aperto', payment_status: 'pagato' })).toBe('scontrino')
  })

  it('senza conto non si inventa niente', () => {
    expect(tipoScontrino(null)).toBe('preconto')
  })
})

// ── IL LOGO, STAMPA PER STAMPA (REQ-STAMPA-011) ──────────────────────
describe('su quali stampe esce il logo', () => {
  it('di suo dove è sempre uscito: scontrino e preconto', () => {
    expect(logoAcceso({}, 'scontrino')).toBe(true)
    expect(logoAcceso({}, 'preconto')).toBe(true)
  })

  it('di suo NON sulla comanda: al banco è carta consumata', () => {
    expect(logoAcceso({}, 'comanda')).toBe(false)
    expect(logoAcceso({}, 'chiusura')).toBe(false)
  })

  it('il locale può ribaltarlo, stampa per stampa', () => {
    const s = { stampa_logo: { scontrino: false, comanda: true } }
    expect(logoAcceso(s, 'scontrino')).toBe(false)
    expect(logoAcceso(s, 'comanda')).toBe(true)
    expect(logoAcceso(s, 'preconto')).toBe(true) // non toccato: resta com'era
  })

  it('una stampa che non è nell’elenco non prende il logo', () => {
    expect(logoAcceso({ stampa_logo: { fattura: true } }, 'fattura')).toBe(false)
    // Lo scontrino d'acconto è entrato nell'elenco (REQ-STAMPA-015): è
    // carta che resta in mano al cliente come il preconto, quindi nasce
    // col logo acceso.
    expect(TIPI_LOGO.map((t) => t.id)).toEqual([
      'scontrino',
      'preconto',
      'acconto',
      'comanda',
      'chiusura',
    ])
    expect(logoAcceso({}, 'acconto')).toBe(true)
  })
})

describe('quale immagine', () => {
  it('senza niente di caricato vale quella del programma', () => {
    expect(immagineCaricata({})).toBeNull()
    expect(immagineCaricata({ stampa_logo: {} })).toBeNull()
  })

  it('l’immagine caricata dal locale', () => {
    const png = 'data:image/png;base64,AAAA'
    expect(immagineCaricata({ stampa_logo: { immagine: png } })).toBe(png)
  })

  // Roba che non è un'immagine non diventa il logo per sbaglio: finirebbe
  // dritta in un <img> e in una stampa.
  it('quello che non è un’immagine non passa', () => {
    expect(immagineCaricata({ stampa_logo: { immagine: 'https://altrove/logo.png' } })).toBeNull()
    expect(immagineCaricata({ stampa_logo: { immagine: 42 } })).toBeNull()
  })
})

// ── DIRLO SUBITO, NON SULLA CARTA ────────────────────────────────────
//
// «Il caricamento deve dire subito se l'immagine non va bene invece di
// stampare un rettangolo nero» (dalla voce a registro). Una foto scura
// ridotta in bianco e nero diventa esattamente quello, in cima a ogni
// scontrino della serata.
describe('un’immagine che non va bene si scopre al caricamento', () => {
  const buona = { larghezza: 600, altezza: 300, quotaScura: 0.25, peso: 9000 }

  it('un logo normale passa senza dire niente', () => {
    expect(problemiLogo(buona)).toBeNull()
  })

  it('una foto scura: sulla carta sarebbe un rettangolo nero', () => {
    const guaio = problemiLogo({ ...buona, quotaScura: 0.9 })
    expect(guaio.grave).toBe(true)
    expect(guaio.testo).toMatch(/rettangolo nero/)
  })

  it('un’immagine quasi bianca non si vedrebbe', () => {
    expect(problemiLogo({ ...buona, quotaScura: 0.001 }).grave).toBe(true)
  })

  it('un’immagine molto più alta che larga si mangia la carta', () => {
    const guaio = problemiLogo({ larghezza: 200, altezza: 800, quotaScura: 0.3, peso: 9000 })
    expect(guaio.grave).toBe(true)
    expect(guaio.testo).toMatch(/alta che larga/)
  })

  it('un’immagine che resta pesante non si tiene: viaggia a ogni apertura', () => {
    expect(problemiLogo({ ...buona, peso: 400_000 }).grave).toBe(true)
  })

  it('un file che non si apre lo si dice con parole da vassoio', () => {
    const guaio = problemiLogo({})
    expect(guaio.grave).toBe(true)
    expect(guaio.testo).toMatch(/PNG o un JPG/)
  })

  // Piccola si può usare: si avvisa e basta. Un avviso che blocca sarebbe
  // un no travestito.
  it('un’immagine piccola si può usare, ma si dice che sgrana', () => {
    const guaio = problemiLogo({ ...buona, larghezza: 80, altezza: 40 })
    expect(guaio.grave).toBe(false)
    expect(guaio.testo).toMatch(/sgranata/)
  })

  it('la larghezza di riferimento è quella della testina', () => {
    expect(LARGHEZZA_LOGO).toBe(220)
  })
})

describe('quanto è scura un’immagine', () => {
  // Quattro punti per volta (rosso, verde, blu, trasparenza): è come
  // arrivano da un canvas.
  const punti = (colori) => Uint8ClampedArray.from(colori.flat())

  it('tutta nera: tutto scuro', () => {
    expect(quotaScura(punti([[0, 0, 0, 255], [0, 0, 0, 255]]))).toBe(1)
  })

  it('tutta bianca: niente di scuro', () => {
    expect(quotaScura(punti([[255, 255, 255, 255]]))).toBe(0)
  })

  it('metà e metà', () => {
    expect(quotaScura(punti([[0, 0, 0, 255], [255, 255, 255, 255]]))).toBe(0.5)
  })

  it('senza punti non si azzarda un giudizio', () => {
    expect(quotaScura(null)).toBe(0)
    expect(quotaScura(new Uint8ClampedArray(0))).toBe(0)
  })
})
