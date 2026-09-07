'use strict'

// IL TITOLO DELLA PAGINA STA NELLA BARRA, non dentro la pagina: una riga di
// titolo in cima al contenuto è una riga in meno di contenuto, e su un tablet
// al banco quella riga si vede.

import { describe, it, expect } from 'vitest'
import {
  titoloPagina,
  NAV_GESTIONALE,
  vociPerRuolo,
  sezioneConsentita,
} from '../../src/lib/sezioni.js'

describe('titoloPagina', () => {
  it('nel gestionale porta il nome della sezione, con la sua icona', () => {
    expect(titoloPagina('/bar', '?tab=impostazioni')).toEqual({
      icona: '⚙️',
      titolo: 'Impostazioni',
    })
    // Il tab si chiama ancora `inventario` (cambiarlo vorrebbe dire
    // migrare indirizzi salvati), ma a schermo si legge Magazzino.
    expect(titoloPagina('/bar', '?tab=inventario').titolo).toBe('Magazzino')
  })

  // La coda è la schermata di partenza e si presenta da sé: un titolo lì
  // sarebbe solo rumore.
  it('nella coda non c’è titolo', () => {
    expect(titoloPagina('/bar', '')).toBe(null)
    expect(titoloPagina('/bar', '?tab=coda')).toBe(null)
  })

  it('vale anche per le pagine fuori dal gestionale', () => {
    expect(titoloPagina('/profilo-staff', '').titolo).toBe('Il mio profilo')
    expect(titoloPagina('/ordini', '').titolo).toBe('I miei ordini')
  })

  it('dove non serve non si inventa niente', () => {
    expect(titoloPagina('/menu', '')).toBe(null)
    expect(titoloPagina('/pos', '')).toBe(null)
    expect(titoloPagina('/', '')).toBe(null)
  })

  // Le voci del menu laterale e i titoli sono lo stesso elenco: tenendone
  // due, prima o poi uno dice «Lista ordini» e l'altro «Storico».
  it('ogni voce del menu ha icona e nome', () => {
    for (const [id, icona, nome] of NAV_GESTIONALE) {
      expect(id, 'id mancante').toBeTruthy()
      expect(icona, `icona mancante per ${id}`).toBeTruthy()
      expect(nome, `nome mancante per ${id}`).toBeTruthy()
    }
  })
})

// ── LA CASSA È UNA SOLA ──────────────────────────────────────────────
// Flusso, lista ordini e chiusure erano tre posti per la stessa domanda —
// «quanto ho incassato» — e due si raggiungevano da tasti in fondo alla
// pagina, che si trovano solo scorrendo. «Lista ordini» aveva perfino una
// voce sua nel menu, come se fosse un altro mestiere.
describe('la voce Cassa', () => {
  it('si chiama Cassa, non «Flusso cassa»', () => {
    expect(titoloPagina('/bar', '?tab=pagamenti').titolo).toBe('Cassa')
  })

  it('«Lista ordini» non è più una voce del menu', () => {
    expect(NAV_GESTIONALE.some(([id]) => id === 'storico')).toBe(false)
  })

  it('il vecchio indirizzo porta alla cassa, non nel vuoto', () => {
    // `?tab=storico` sta nei collegamenti salvati e nei messaggi.
    expect(titoloPagina('/bar', '?tab=storico').titolo).toBe('Cassa')
  })
})

// ── IL BILANCIO È DELL'ADMIN ─────────────────────────────────────────
// I conti del locale — incassi, stipendi, spese, netto del mese — sono di
// chi il locale lo paga. È la prima voce del gestionale che non basta
// essere gestori per vedere: prima il menu si filtrava con `isGestore`,
// che tiene dentro anche il bartender.
describe('chi vede quali sezioni', () => {
  it('«Bilancio» sta nel menu dell’admin', () => {
    expect(vociPerRuolo('admin').some(([id]) => id === 'bilancio')).toBe(true)
  })

  // SI TOGLIE, non si nasconde dentro la pagina: una pagina che si apre e
  // poi dice «non puoi» si è già fatta vedere.
  it('al bartender la voce non compare proprio', () => {
    expect(vociPerRuolo('bartender').some(([id]) => id === 'bilancio')).toBe(false)
    // E il resto del gestionale gli resta tutto: la cassa, il magazzino,
    // le impostazioni.
    const suoi = vociPerRuolo('bartender').map(([id]) => id)
    for (const id of ['coda', 'pagamenti', 'inventario', 'menu', 'impostazioni']) {
      expect(suoi, `${id} è del bartender`).toContain(id)
    }
  })

  it('chi non è gestore resta col menu della sala', () => {
    for (const r of ['staff', 'cliente', null, undefined]) {
      const ids = vociPerRuolo(r).map(([id]) => id)
      expect(ids).not.toContain('bilancio')
      expect(ids).not.toContain('impostazioni')
    }
  })

  // Togliere la voce dal menu non basta: `?tab=bilancio` si batte a mano, e
  // un collegamento salvato quando si era admin resta nella cronologia.
  it('l’indirizzo battuto a mano non apre una sezione che non è tua', () => {
    expect(sezioneConsentita('bilancio', 'admin')).toBe(true)
    expect(sezioneConsentita('bilancio', 'bartender')).toBe(false)
  })

  it('le sezioni di tutti restano di tutti', () => {
    for (const id of ['coda', 'pagamenti', 'stats', 'inventario']) {
      expect(sezioneConsentita(id, 'bartender')).toBe(true)
    }
    // Una sezione che non è nell'elenco (i vecchi indirizzi, `?tab=vip`)
    // non si blocca: non è riservata, è solo fuori dal menu.
    expect(sezioneConsentita('vip', 'bartender')).toBe(true)
    expect(sezioneConsentita(null, 'bartender')).toBe(true)
  })

  it('e nella barra in alto la pagina ha il suo nome', () => {
    expect(titoloPagina('/bar', '?tab=bilancio').titolo).toBe('Bilancio')
  })
})

// ── FORNITORI È UNA SEZIONE SUA, E DELL'ADMIN ────────────────────────
// Chiesta dall'utente il 26/08/2026: anagrafica, ordini e scadenzario
// stavano nel magazzino, che però risponde a «cosa ho sullo scaffale».
// Solo admin per la ragione già a verbale in REQ-MAG-025: ordini e fatture
// fornitore sono i soldi che ESCONO dal locale, e non sono roba da turno.
describe('la sezione Fornitori', () => {
  it('è una voce del menu, con la sua icona e il suo nome nella barra', () => {
    expect(NAV_GESTIONALE.some(([id]) => id === 'fornitori')).toBe(true)
    expect(titoloPagina('/bar', '?tab=fornitori')).toEqual({
      icona: '🏭',
      titolo: 'Fornitori',
    })
  })

  it('la vede l’admin, non il bartender', () => {
    expect(vociPerRuolo('admin').some(([id]) => id === 'fornitori')).toBe(true)
    expect(vociPerRuolo('bartender').some(([id]) => id === 'fornitori')).toBe(false)
  })

  it('e non ci si entra battendo l’indirizzo a mano', () => {
    expect(sezioneConsentita('fornitori', 'admin')).toBe(true)
    expect(sezioneConsentita('fornitori', 'bartender')).toBe(false)
  })

  it('il magazzino invece resta di tutti i gestori', () => {
    // Il trasloco non porta via al banco quello che gli serve: le giacenze
    // restano dov'erano.
    expect(sezioneConsentita('inventario', 'bartender')).toBe(true)
  })
})

// ── LE FUNZIONI PREMIUM TOLGONO VOCI A TUTTI ─────────────────────────
// REQ-LIC-001, chiesto dall'utente il 26/08/2026: le fatture ai clienti
// sono premium e per questa installazione non sono incluse. Non è una
// domanda sul ruolo — la voce non c'è per nessuno — ma il filtro sta qui,
// accanto all'elenco, com'è già per il ruolo. È il pezzo che la Fase 3 del
// piano di sbrandizzazione chiede a questo file.
describe('le voci che il locale non ha', () => {
  it('«Fatture» non è nel menu di nessuno, admin compreso', () => {
    expect(vociPerRuolo('admin').some(([id]) => id === 'fatture')).toBe(false)
    expect(vociPerRuolo('bartender').some(([id]) => id === 'fatture')).toBe(false)
  })

  it('e non ci si entra battendo l’indirizzo a mano', () => {
    expect(sezioneConsentita('fatture', 'admin')).toBe(false)
  })

  it('con la licenza che le include, la voce torna a tutto il gestionale', () => {
    const licenza = { licenza: { moduli: { fatture: true } } }
    expect(vociPerRuolo('admin', licenza).some(([id]) => id === 'fatture')).toBe(true)
    expect(vociPerRuolo('bartender', licenza).some(([id]) => id === 'fatture')).toBe(true)
    expect(sezioneConsentita('fatture', 'bartender', licenza)).toBe(true)
  })

  it('inclusa ma spenta dalle impostazioni: la voce non c’è', () => {
    const spenta = { licenza: { moduli: { fatture: true } }, modulo_fatture_enabled: false }
    expect(vociPerRuolo('admin', spenta).some(([id]) => id === 'fatture')).toBe(false)
    expect(sezioneConsentita('fatture', 'admin', spenta)).toBe(false)
  })

  it('il ruolo e la licenza si sommano, non si sostituiscono', () => {
    // «Fornitori» è dell'admin e non è premium; «Fatture» è premium e non è
    // di un ruolo: le due domande restano separate.
    const licenza = { licenza: { moduli: { fatture: true } } }
    expect(vociPerRuolo('bartender', licenza).some(([id]) => id === 'fornitori')).toBe(false)
    expect(sezioneConsentita('fornitori', 'bartender', licenza)).toBe(false)
  })

  it('senza impostazioni passa solo quello che è incluso di suo', () => {
    // Il primo disegno arriva prima del server: meglio una voce che compare
    // che una che lampeggia e sparisce.
    const ids = vociPerRuolo('admin').map(([id]) => id)
    expect(ids).toContain('inventario')
    expect(ids).not.toContain('fatture')
  })
})
