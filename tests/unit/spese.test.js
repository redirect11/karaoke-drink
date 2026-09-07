'use strict'

// ── ALTRE SPESE: COMPRATA O SOLO DESIDERATA (REQ-MAG-034) ────────────
//
// La sottosezione nasce da una domanda dell'utente (19/08): «quelle spese da
// inserire a mano non sono gli ordini?». Misurato sui fogli, in parte sì: la
// riga SPESE è sempre più grande degli acquisti dello stesso mese, quindi
// contiene la merce più altro — e quell'altro sta nel foglio «TO BUY» di
// FORNITORI REC.xlsx: tavoli, sgabelli, divani, una tenda, uno scaffale,
// bicchieri di plastica.
//
// QUI SI SORVEGLIA LA COSA CHE REGGE TUTTO: quel foglio è una LISTA DELLA
// SPESA, non un registro. Solo quello che è STATO COMPRATO pesa sul mese;
// senza la distinzione un divano desiderato abbasserebbe l'utile di gennaio.

import { describe, it, expect } from 'vitest'
import {
  quantitaSpesa,
  totaleSpesa,
  spesaComprata,
  meseSpesa,
  speseComprate,
  speseDaComprare,
  speseSenzaPrezzo,
  speseSenzaData,
  totaliSpese,
  spesePerMese,
  totaleSpeseDelMese,
} from '../../src/lib/spese.js'

// Righe vere del foglio «TO BUY», compresa quella che non è ancora prezzata.
const DIVANO = {
  id: 's1',
  name: 'Divano',
  qty: 1,
  unit_cost: 0,
  shop: 'Vente-Unique',
  bought: false,
  bought_at: null,
}
const SGABELLI = {
  id: 's2',
  name: 'Sgabelli',
  qty: 4,
  unit_cost: 39.9,
  shop: 'Amazon',
  bought: true,
  bought_at: '2026-01-14',
}
const SCAFFALE = {
  id: 's3',
  name: 'Scaffale',
  qty: 1,
  unit_cost: 89,
  shop: 'IKEA',
  bought: true,
  bought_at: '2026-02-03',
}

describe('il totale di una riga è quello del foglio', () => {
  it('quantità per prezzo', () => {
    expect(totaleSpesa(SGABELLI)).toBeCloseTo(159.6, 2)
    expect(totaleSpesa(SCAFFALE)).toBe(89)
  })

  // Il prezzo a zero è la normalità di una lista della spesa: diverse righe
  // del foglio non sono ancora prezzate.
  it('una riga non prezzata vale zero, e non è un errore', () => {
    expect(totaleSpesa(DIVANO)).toBe(0)
    expect(totaleSpesa(null)).toBe(0)
  })

  // Chi scrive solo il prezzo ha comprato UNA cosa, non zero cose: con lo
  // zero il totale sparirebbe dal mese in silenzio, che è il peggiore dei
  // due errori possibili.
  it('la quantità che manca vale uno, non zero', () => {
    expect(quantitaSpesa({ unit_cost: 30 })).toBe(1)
    expect(quantitaSpesa({ qty: 0, unit_cost: 30 })).toBe(1)
    expect(totaleSpesa({ unit_cost: 30 })).toBe(30)
    expect(quantitaSpesa({ qty: 4 })).toBe(4)
  })
})

describe('comprata o solo desiderata', () => {
  it('chi non porta il segno è ancora un desiderio', () => {
    expect(spesaComprata(SGABELLI)).toBe(true)
    expect(spesaComprata(DIVANO)).toBe(false)
    // Una riga arrivata dal foglio, senza nemmeno il campo.
    expect(spesaComprata({ name: 'Tenda' })).toBe(false)
  })

  it('i due elenchi non si sovrappongono', () => {
    const tutte = [DIVANO, SGABELLI, SCAFFALE]
    expect(speseComprate(tutte).map((s) => s.id)).toEqual(['s2', 's3'])
    expect(speseDaComprare(tutte).map((s) => s.id)).toEqual(['s1'])
  })

  // È la riga che protegge l'utile di gennaio: il divano desiderato costa
  // zero al mese, anche il giorno che qualcuno gli scrive accanto il prezzo.
  it('un desiderio prezzato non pesa su nessun mese', () => {
    const prezzato = { ...DIVANO, unit_cost: 499 }
    expect(meseSpesa(prezzato)).toBe(null)
    expect(spesePerMese([prezzato]).size).toBe(0)
    expect(totaliSpese([prezzato])).toEqual({ comprato: 0, daComprare: 499 })
  })
})

describe('il mese lo decide la data dell’acquisto', () => {
  it('è il mese in cui i soldi sono usciti', () => {
    expect(meseSpesa(SGABELLI)).toBe('2026-01')
    expect(meseSpesa(SCAFFALE)).toBe('2026-02')
  })

  it('i totali si sommano mese per mese', () => {
    const per = spesePerMese([DIVANO, SGABELLI, SCAFFALE, { ...SCAFFALE, id: 's4' }])
    expect(per.get('2026-01')).toBeCloseTo(159.6, 2)
    expect(per.get('2026-02')).toBe(178)
    expect(totaleSpeseDelMese([SGABELLI], '2026-01')).toBeCloseTo(159.6, 2)
    // Un mese senza spese non è un buco: è zero.
    expect(totaleSpeseDelMese([SGABELLI], '2026-03')).toBe(0)
  })
})

describe('i due buchi di questa sottosezione', () => {
  // Una voce segnata comprata ma senza prezzo pesa zero sul mese, e nessuno
  // se ne accorge finché non si confrontano i totali. Su una riga ancora da
  // comprare invece il prezzo a zero è la normalità, e segnalarla
  // insegnerebbe a ignorare il segnale.
  it('comprata e senza prezzo si vede; desiderata e senza prezzo no', () => {
    const trovate = speseSenzaPrezzo([DIVANO, SGABELLI, { ...DIVANO, id: 's9', bought: true, bought_at: '2026-01-20' }])
    expect(trovate.map((s) => s.id)).toEqual(['s9'])
  })

  // Comprata senza data: non ha mese, quindi resta fuori da ogni riga del
  // riepilogo. Meglio saperlo che vederla sparire.
  it('comprata senza data non entra in nessun mese', () => {
    const senzaData = { ...SGABELLI, id: 's8', bought_at: null }
    expect(meseSpesa(senzaData)).toBe(null)
    expect(speseSenzaData([SGABELLI, senzaData]).map((s) => s.id)).toEqual(['s8'])
    expect(spesePerMese([senzaData]).size).toBe(0)
  })
})

describe('i due totali della sottosezione restano separati', () => {
  // Il costo della lista non è una spesa: è la stima di un promemoria, e
  // sommarlo a quello che è uscito davvero gonfierebbe il mese.
  it('quello che è uscito e quello che costerebbe comprare tutto', () => {
    const totali = totaliSpese([{ ...DIVANO, unit_cost: 499 }, SGABELLI, SCAFFALE])
    expect(totali.comprato).toBeCloseTo(248.6, 2)
    expect(totali.daComprare).toBe(499)
  })

  it('senza niente in elenco sono due zeri', () => {
    expect(totaliSpese([])).toEqual({ comprato: 0, daComprare: 0 })
    expect(totaliSpese(null)).toEqual({ comprato: 0, daComprare: 0 })
  })
})
