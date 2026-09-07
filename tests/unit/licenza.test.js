'use strict'

// LE FUNZIONI PREMIUM (REQ-LIC-001). Un posto solo che risponde per tutta
// l'app, e DUE domande che non si impastano:
//   INCLUSO — il locale ce l'ha (lo dirà la licenza);
//   ACCESO  — in questo momento lo usa (l'interruttore delle impostazioni).
// Senza la prima non si distingue un locale che la funzione non ce l'ha da
// uno che ce l'ha e l'ha spenta, e sono due schermate diverse.

import { describe, it, expect } from 'vitest'
import {
  MODULI_PREMIUM,
  MOTIVO_PREMIUM,
  chiaveModulo,
  ePremium,
  moduliPremium,
  moduloAcceso,
  moduloAttivo,
  moduloIncluso,
  voceVisibile,
} from '../../src/lib/licenza.js'

// Come sta questa installazione oggi, senza nessuna licenza scritta: lo
// scadenzario è incluso (l'utente lo ha richiesto il 26/08/2026), la conta
// no. Le prove partono da qui, come l'app quando le impostazioni sono
// quelle di sempre.
describe('cosa ha questa installazione, senza licenza scritta', () => {
  it('lo scadenzario è incluso e lavora', () => {
    expect(moduloIncluso({}, 'scadenzario')).toBe(true)
    expect(moduloAttivo({}, 'scadenzario')).toBe(true)
  })

  it('la conta non è inclusa, e nessun interruttore la accende', () => {
    expect(moduloIncluso({}, 'conta')).toBe(false)
    expect(moduloAttivo({}, 'conta')).toBe(false)
    // IL PUNTO DELLA DISTINZIONE: il flag d'uso c'è e dice «acceso», ma il
    // locale la funzione non ce l'ha. Un flag solo non saprebbe dirlo.
    expect(moduloAcceso({ modulo_conta_enabled: true }, 'conta')).toBe(true)
    expect(moduloAttivo({ modulo_conta_enabled: true }, 'conta')).toBe(false)
  })
})

describe('incluso e acceso, le quattro combinazioni', () => {
  it('incluso e acceso: lavora', () => {
    expect(moduloAttivo({ modulo_scadenzario_enabled: true }, 'scadenzario')).toBe(true)
  })

  it('incluso e spento: non lavora, ma non è «non incluso»', () => {
    const stato = { modulo_scadenzario_enabled: false }
    expect(moduloIncluso(stato, 'scadenzario')).toBe(true)
    expect(moduloAcceso(stato, 'scadenzario')).toBe(false)
    expect(moduloAttivo(stato, 'scadenzario')).toBe(false)
  })

  it('non incluso: non lavora comunque, acceso o spento', () => {
    expect(moduloAttivo({ modulo_conta_enabled: true }, 'conta')).toBe(false)
    expect(moduloAttivo({ modulo_conta_enabled: false }, 'conta')).toBe(false)
  })

  it('quello che è incluso è acceso di suo: non serve accenderlo a mano', () => {
    // Idioma di `workflow_enabled !== false`: quello che il locale ha
    // comprato funziona senza che nessuno debba andare a cercarlo, e si
    // spegne solo se qualcuno lo spegne davvero.
    expect(moduloAcceso({}, 'scadenzario')).toBe(true)
    expect(moduloAcceso({ modulo_scadenzario_enabled: undefined }, 'scadenzario')).toBe(true)
    expect(moduloAcceso({ modulo_scadenzario_enabled: false }, 'scadenzario')).toBe(false)
  })
})

describe('i casi storti: nel dubbio, non lavora', () => {
  it('impostazioni non ancora arrivate: quello che è incluso lavora, il resto no', () => {
    // Il primo disegno arriva prima del server. Una sezione che compare per
    // mezzo secondo e poi sparisce è peggio di una che non c'è: partendo
    // dalla cache lo stato è già quello giusto, e per un modulo non incluso
    // la risposta è comunque «no» anche se lo stato è nullo.
    expect(moduloAttivo(null, 'conta')).toBe(false)
    expect(moduloAttivo(undefined, 'conta')).toBe(false)
    expect(moduloAttivo(null, 'scadenzario')).toBe(true)
  })

  it('la FORMA VECCHIA delle impostazioni non cambia niente', () => {
    // Il documento settings/bar dei locali è stato scritto anni prima di
    // questi campi: quello che non c'è non toglie l'incluso e non accende
    // il non incluso.
    const vecchio = { workflow_enabled: true, price_markup: 3 }
    expect(moduloAttivo(vecchio, 'scadenzario')).toBe(true)
    expect(moduloAttivo(vecchio, 'conta')).toBe(false)
  })

  it('solo il booleano `false` spegne', () => {
    // Un `0` o una stringa «false» arrivano da import e migrazioni scritti
    // a mano, e non sono una decisione di nessuno.
    expect(moduloAcceso({ modulo_scadenzario_enabled: 0 }, 'scadenzario')).toBe(true)
    expect(moduloAcceso({ modulo_scadenzario_enabled: 'false' }, 'scadenzario')).toBe(true)
  })

  it('un id che non è un modulo premium non è incluso, non è acceso, non è attivo', () => {
    for (const id of ['prodotti', undefined, 'licenza']) {
      expect(moduloIncluso({ licenza: { moduli: { [id]: true } } }, id)).toBe(false)
      expect(moduloAcceso({}, id)).toBe(false)
      expect(moduloAttivo({}, id)).toBe(false)
    }
  })
})

describe('il punto di innesto della licenza vera (Fase 3 del piano)', () => {
  // Quando arriverà `settings/licenza`, chi lo collega tocca SOLO
  // `moduloIncluso`: se lo stato porta una licenza, comanda lei.
  it('la licenza toglie quello che la tabella includeva', () => {
    const stato = { licenza: { moduli: { conta: true } } }
    expect(moduloIncluso(stato, 'scadenzario')).toBe(false)
    expect(moduloAttivo(stato, 'scadenzario')).toBe(false)
  })

  it('la licenza dà quello che la tabella non includeva', () => {
    const stato = { licenza: { moduli: { conta: true, scadenzario: true } } }
    expect(moduloIncluso(stato, 'conta')).toBe(true)
    expect(moduloAttivo(stato, 'conta')).toBe(true)
  })

  it('una licenza che non nomina il modulo lo tiene fuori, senza ricadere sulla tabella', () => {
    // Se la licenza c'è, è LEI la verità anche per quello che tace: la
    // tabella nel codice si riaprirebbe da sola un modulo non venduto.
    expect(moduloIncluso({ licenza: { moduli: {} } }, 'scadenzario')).toBe(false)
  })

  it('la licenza dice cosa il locale HA, non se lo sta usando', () => {
    // La licenza nomina il modulo, l'impostazione lo spegne: comandano
    // tutt'e due, ognuna sulla sua domanda.
    const stato = { licenza: { moduli: { conta: true } }, modulo_conta_enabled: false }
    expect(moduloIncluso(stato, 'conta')).toBe(true)
    expect(moduloAcceso(stato, 'conta')).toBe(false)
    expect(moduloAttivo(stato, 'conta')).toBe(false)
    // E il verso opposto: l'impostazione accesa su un modulo che la licenza
    // non nomina non lo fa entrare dalla finestra.
    const altro = { licenza: { moduli: { conta: true } }, modulo_scadenzario_enabled: true }
    expect(moduloAcceso(altro, 'scadenzario')).toBe(true)
    expect(moduloAttivo(altro, 'scadenzario')).toBe(false)
  })

  it('una licenza senza l’elenco dei moduli non conta: si torna alla tabella', () => {
    // Un documento a metà (piano scritto, moduli no) non deve spegnere il
    // locale: è un caso di migrazione, non una decisione commerciale.
    expect(moduloIncluso({ licenza: { piano: 'base' } }, 'scadenzario')).toBe(true)
  })
})

describe('la tabella dei moduli', () => {
  it('la chiave di ogni modulo è quella scritta sui documenti dei locali', () => {
    expect(chiaveModulo('conta')).toBe('modulo_conta_enabled')
    expect(chiaveModulo('scadenzario')).toBe('modulo_scadenzario_enabled')
    expect(chiaveModulo('prodotti')).toBeNull()
  })

  it('ogni modulo ha nome, descrizione, una chiave sua e dice se è incluso', () => {
    const chiavi = new Set()
    for (const m of moduliPremium()) {
      expect(m.label).toBeTruthy()
      expect(m.descrizione).toBeTruthy()
      expect(m.chiave).toMatch(/^modulo_.*_enabled$/)
      expect(typeof m.incluso).toBe('boolean')
      expect(chiavi.has(m.chiave)).toBe(false)
      chiavi.add(m.chiave)
    }
    expect(moduliPremium().map((m) => m.id)).toEqual(Object.keys(MODULI_PREMIUM))
  })

  it('il motivo dell’interruttore bloccato dice cosa è e non promette niente', () => {
    expect(MOTIVO_PREMIUM).toMatch(/premium/i)
    // Niente toni da venditore a schermo (DESIGN.md, guardrail 3).
    expect(MOTIVO_PREMIUM).not.toMatch(/sblocca|acquista|ora!|scopri/i)
  })
})

describe('filtrare un elenco di voci', () => {
  it('una voce che non è premium passa sempre', () => {
    expect(voceVisibile({}, 'prodotti')).toBe(true)
    expect(voceVisibile(null, 'movimenti')).toBe(true)
    expect(ePremium('prodotti')).toBe(false)
  })

  it('una voce premium passa solo se il modulo lavora', () => {
    expect(ePremium('conta')).toBe(true)
    expect(voceVisibile({}, 'conta')).toBe(false)
    expect(voceVisibile({}, 'scadenzario')).toBe(true)
    expect(voceVisibile({ modulo_scadenzario_enabled: false }, 'scadenzario')).toBe(false)
  })
})
