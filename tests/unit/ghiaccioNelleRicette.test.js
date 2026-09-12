// IL GHIACCIO NELLE RICETTE SI MOLTIPLICA: ×2 RISPETTO ALLA DOSE SCRITTA
// (REQ-MENU-015).
//
// Flavio, 09/09/2026: «moltiplicare tutte le quantità di ghiaccio per 1,5».
// E il 12/09: «ho fatto un errore di calcolo, quindi va raddoppiato». Lo
// script `scripts/ghiaccio-nelle-ricette.js` riscrive le righe di ricetta;
// questa è la parte che decide DI QUANTO e COSA riscrivere.
//
// Il pericolo di uno script che moltiplica è lanciarlo due volte: 100 → 200
// → 400 senza che nessuno se ne accorga. Per quello l'obiettivo si dice
// rispetto alla dose ORIGINALE e sull'articolo del ghiaccio resta un segno
// con quello che è già stato fatto: il fattore da applicare è la differenza.

import { describe, it, expect } from 'vitest'
import { righeDaRiscrivere, fattoreDaApplicare } from '../../scripts/lib-ghiaccio.js'

const GHIACCIO = 'ghiaccio-1'
const riga = (id, qty) => ({ inventory_item_id: id, qty, unit: 'g' })

describe('di quanto si moltiplica', () => {
  it('dalle dosi originali all’obiettivo: ×2', () => {
    expect(fattoreDaApplicare(undefined, 2)).toBe(2)
    expect(fattoreDaApplicare(null, 2)).toBe(2)
    expect(fattoreDaApplicare(1, 2)).toBe(2)
  })

  // Su test il ×1,5 del 10/09 è già passato: per arrivare a ×2 manca un
  // terzo, non il doppio.
  it('da dosi già a ×1,5 manca solo il resto per arrivare a ×2', () => {
    expect(fattoreDaApplicare(1.5, 2)).toBeCloseTo(4 / 3, 10)
  })

  it('un obiettivo che non è un numero positivo si rifiuta', () => {
    expect(() => fattoreDaApplicare(1, 0)).toThrow()
    expect(() => fattoreDaApplicare(1, 'boh')).toThrow()
  })
})

describe('quali righe si riscrivono', () => {
  it('si tocca solo il ghiaccio, moltiplicato e arrotondato', () => {
    const righe = [riga('gin', 50), riga(GHIACCIO, 100), riga('tonica', 200), riga(GHIACCIO, 75)]
    const { cambi, saltate } = righeDaRiscrivere(righe, GHIACCIO, 2)
    expect([...cambi]).toEqual([
      [1, 200],
      [3, 150],
    ])
    expect(saltate).toEqual([])
  })

  // 150 × 4/3 = 200 e 300 × 4/3 = 400: è il passaggio che si fa su test.
  it('da ×1,5 a ×2 le dosi tornano intere', () => {
    const { cambi } = righeDaRiscrivere([riga(GHIACCIO, 150), riga(GHIACCIO, 300)], GHIACCIO, 4 / 3)
    expect([...cambi]).toEqual([
      [0, 200],
      [1, 400],
    ])
  })

  // Uno zero o una scritta non sono una dose: si segnalano e restano.
  it('una riga senza una dose vera si segnala e non si tocca', () => {
    const { cambi, saltate } = righeDaRiscrivere([riga(GHIACCIO, 0), riga(GHIACCIO, 'boh')], GHIACCIO, 2)
    expect(cambi.size).toBe(0)
    expect(saltate).toEqual([0, 1])
  })

  it('con fattore 1 non cambia niente', () => {
    expect(righeDaRiscrivere([riga(GHIACCIO, 100)], GHIACCIO, 1).cambi.size).toBe(0)
  })

  it('una quantità scritta come testo si legge come numero', () => {
    expect(righeDaRiscrivere([riga(GHIACCIO, '100')], GHIACCIO, 2).cambi.get(0)).toBe(200)
  })

  it('senza righe non c’è niente da fare', () => {
    expect(righeDaRiscrivere(undefined, GHIACCIO, 2).cambi.size).toBe(0)
  })
})
