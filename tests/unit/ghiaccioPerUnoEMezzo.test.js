// IL GHIACCIO NELLE RICETTE PASSA A UNA VOLTA E MEZZO (REQ-MENU-015).
//
// Flavio, 09/09/2026: «bisognerebbe moltiplicare tutte le quantità di
// ghiaccio per 1,5. Quindi se ho 100 grammi diventano 150, se ho 200
// diventano 300». Lo script `scripts/ghiaccio-per-uno-e-mezzo.js` riscrive
// le righe di ricetta, e questa è la parte che decide COSA riscrivere.
//
// Il pericolo di uno script che moltiplica è lanciarlo due volte: la
// seconda il ghiaccio va a 225 e nessuno se ne accorge fino al magazzino
// che scende a vuoto. Per quello le dosi si riconoscono da una tabella, e
// il «già fatto» è una dose d'arrivo.

import { describe, it, expect } from 'vitest'
import { righeDaRiscrivere, DOSI_GHIACCIO } from '../../scripts/lib-ghiaccio.js'

const GHIACCIO = 'ghiaccio-1'
const riga = (id, qty) => ({ inventory_item_id: id, qty, unit: 'g' })

describe('quali righe di ghiaccio si riscrivono', () => {
  it('100 diventa 150 e 200 diventa 300, e si tocca solo il ghiaccio', () => {
    const righe = [riga('gin', 50), riga(GHIACCIO, 100), riga('tonica', 200), riga(GHIACCIO, 200)]
    const { cambi, giaFatte, inattese } = righeDaRiscrivere(righe, GHIACCIO)
    expect([...cambi]).toEqual([
      [1, 150],
      [3, 300],
    ])
    expect(giaFatte).toEqual([])
    expect(inattese).toEqual([])
  })

  // Rilanciato per sbaglio, non moltiplica una seconda volta.
  it('una dose già a 150 o 300 si lascia stare', () => {
    const righe = [riga(GHIACCIO, 150), riga(GHIACCIO, 300)]
    const { cambi, giaFatte } = righeDaRiscrivere(righe, GHIACCIO)
    expect(cambi.size).toBe(0)
    expect(giaFatte).toEqual([0, 1])
  })

  // Un 220 o un 80 non si sa da dove venga: si segnala e lo decide una
  // persona guardando l'anteprima.
  it('una dose fuori tabella si segnala e non si tocca', () => {
    const { cambi, inattese } = righeDaRiscrivere([riga(GHIACCIO, 220), riga(GHIACCIO, 80)], GHIACCIO)
    expect(cambi.size).toBe(0)
    expect(inattese).toEqual([0, 1])
  })

  it('con «anche fuori tabella» si moltiplica per 1,5 anche lei, arrotondata', () => {
    const { cambi, inattese } = righeDaRiscrivere(
      [riga(GHIACCIO, 220), riga(GHIACCIO, 75), riga(GHIACCIO, 0)],
      GHIACCIO,
      { ancheFuoriTabella: true }
    )
    expect([...cambi]).toEqual([
      [0, 330],
      [1, 113],
    ])
    // Zero non è una dose: resta segnalata.
    expect(inattese).toEqual([2])
  })

  it('una quantità scritta come testo si legge come numero', () => {
    const { cambi } = righeDaRiscrivere([riga(GHIACCIO, '100')], GHIACCIO)
    expect(cambi.get(0)).toBe(DOSI_GHIACCIO[100])
  })

  it('senza righe non c’è niente da fare', () => {
    expect(righeDaRiscrivere(undefined, GHIACCIO).cambi.size).toBe(0)
  })
})
