// LE MACRO-CATEGORIE SONO UN ELENCO SOLO, COI PESI SOPRA (REQ-MAG-042).
//
// Flavio, 09/09/2026: «clicco su una macro categoria e mi appaiono tutti i
// prodotti di magazzino e tutti gli items del menu … con una percentuale:
// il 100%, l'80%, il 60%». Qui si prova la parte pura: come si legge un
// peso, quanto resta da dare, e come si spartisce un euro fra le macro
// quando le quote non fanno cento — o lo passano.

import { describe, it, expect } from 'vitest'
import {
  UNASSIGNED,
  LATI,
  pesoAmmesso,
  pesiPuliti,
  perNome,
  ordinaMacro,
  pesoDi,
  quotaAltrove,
  pesiAltrove,
  macroConPeso,
  ripartizione,
  ripartisci,
  conteggioPesi,
} from '../../src/lib/macros.js'

const macros = [
  {
    id: 'm2',
    name: 'Birre e bibite',
    sort_order: 1,
    pesi_prodotti: { schweppes: 40, redbull: 100 },
    pesi_voci: { 'schweppes-sola': 100 },
  },
  {
    id: 'm1',
    name: 'Alcolici e distillati',
    sort_order: 0,
    pesi_prodotti: { gin: 100, schweppes: 60 },
    pesi_voci: { gintonic: 100, spritz: 80 },
  },
]

describe('pesoAmmesso: l’unica regola sul valore di un peso', () => {
  it('un intero da 1 a 100 passa, arrotondato', () => {
    expect(pesoAmmesso(80)).toBe(80)
    expect(pesoAmmesso('60')).toBe(60)
    expect(pesoAmmesso(33.4)).toBe(33)
  })

  // Uno zero, un numero negativo o una scritta non sono pesi; un 150 si
  // riporta al tetto. Un peso «strano» che passasse conterebbe un euro in
  // più o in meno.
  it('quello che non è un peso vale zero, quello che sfora si ferma al tetto', () => {
    expect(pesoAmmesso(0)).toBe(0)
    expect(pesoAmmesso(-5)).toBe(0)
    expect(pesoAmmesso('boh')).toBe(0)
    expect(pesoAmmesso(undefined)).toBe(0)
    expect(pesoAmmesso(150)).toBe(100)
  })

  // Il tetto è cento meno quello che le altre macro hanno già preso: la
  // stessa regola vale per la casella e per chi scrive.
  it('col tetto delle altre macro', () => {
    expect(pesoAmmesso(100, 60)).toBe(60)
    expect(pesoAmmesso(50, 60)).toBe(50)
    expect(pesoAmmesso(10, 0)).toBe(0)
    expect(pesoAmmesso(10, 250)).toBe(10)
  })

  it('pesiPuliti tiene solo i pesi veri', () => {
    expect(pesiPuliti({ a: 40, b: 0, c: 'boh', d: '60', e: 150 })).toEqual({ a: 40, d: 60, e: 100 })
    expect(pesiPuliti(undefined)).toEqual({})
  })
})

describe('ordinaMacro', () => {
  it('per sort_order, poi per nome', () => {
    expect(ordinaMacro(macros).map((m) => m.id)).toEqual(['m1', 'm2'])
    // Con la lingua giusta: senza, «È» finirebbe dopo la zeta.
    expect([{ name: 'Zenzero' }, { name: 'È tutto' }].sort(perNome).map((x) => x.name)).toEqual(['È tutto', 'Zenzero'])
    const pari = [
      { id: 'b', name: 'Vino', sort_order: 0 },
      { id: 'a', name: 'Food', sort_order: 0 },
    ]
    expect(ordinaMacro(pari).map((m) => m.id)).toEqual(['a', 'b'])
    expect(ordinaMacro(null)).toEqual([])
  })
})

describe('pesoDi e quotaAltrove', () => {
  it('legge il peso di un prodotto o di una voce in una macro', () => {
    expect(pesoDi(macros[1], 'prodotti', 'gin')).toBe(100)
    expect(pesoDi(macros[1], 'voci', 'spritz')).toBe(80)
    expect(pesoDi(macros[1], 'prodotti', 'redbull')).toBe(0)
    expect(pesoDi(undefined, 'voci', 'x')).toBe(0)
  })

  it('i due lati leggono campi diversi', () => {
    expect(LATI.prodotti).toBe('pesi_prodotti')
    expect(LATI.voci).toBe('pesi_voci')
  })

  // Mentre si compila una macro serve sapere quanto le ALTRE hanno già
  // preso: è il tetto oltre il quale la somma passerebbe cento.
  it('quanto è già assegnato alle altre macro', () => {
    expect(quotaAltrove(macros, 'prodotti', 'schweppes', 'm1')).toBe(40)
    expect(quotaAltrove(macros, 'prodotti', 'schweppes', 'm2')).toBe(60)
    expect(quotaAltrove(macros, 'prodotti', 'schweppes')).toBe(100)
    expect(quotaAltrove(macros, 'voci', 'gintonic', 'm1')).toBe(0)
  })

  // Per una colonna intera lo stesso conto si fa in un giro solo.
  it('e per tutti gli id insieme', () => {
    const altrove = pesiAltrove(macros, 'prodotti', 'm1')
    expect(altrove.get('schweppes')).toBe(40)
    expect(altrove.get('redbull')).toBe(100)
    expect(altrove.get('gin')).toBeUndefined()
  })
})

describe('ripartizione: come si spartisce un euro', () => {
  it('60/40 fra due macro', () => {
    expect(ripartizione(macros, 'prodotti', 'schweppes')).toEqual([
      { macro: 'm2', quota: 0.4 },
      { macro: 'm1', quota: 0.6 },
    ])
  })

  it('il 100% in una sola: una parte intera', () => {
    expect(ripartizione(macros, 'voci', 'gintonic')).toEqual([{ macro: 'm1', quota: 1 }])
  })

  // Le quote non arrivano a cento: il resto NON sparisce, va a «non
  // attribuito» — se no la somma delle macro non farebbe l'incasso della
  // serata.
  it('sotto cento, il resto va a «non attribuito»', () => {
    expect(ripartizione(macros, 'voci', 'spritz')).toEqual([
      { macro: 'm1', quota: 0.8 },
      { macro: UNASSIGNED, quota: 0.2 },
    ])
  })

  // Due persone che scrivono insieme possono far passare cento: si
  // riporta in proporzione, così nessun euro si conta due volte.
  it('sopra cento si riporta a cento in proporzione', () => {
    const doppie = [
      { id: 'a', pesi_voci: { x: 100 } },
      { id: 'b', pesi_voci: { x: 50 } },
    ]
    const parti = ripartizione(doppie, 'voci', 'x')
    expect(parti.map((p) => p.macro)).toEqual(['a', 'b'])
    expect(parti[0].quota).toBeCloseTo(2 / 3, 6)
    expect(parti[1].quota).toBeCloseTo(1 / 3, 6)
    expect(parti.reduce((s, p) => s + p.quota, 0)).toBeCloseTo(1, 6)
  })

  it('nessun peso da nessuna parte: tutto «non attribuito»', () => {
    expect(ripartizione(macros, 'voci', 'boh')).toEqual([{ macro: UNASSIGNED, quota: 1 }])
    expect(ripartizione(macros, 'voci', null)).toEqual([{ macro: UNASSIGNED, quota: 1 }])
    expect(ripartizione([], 'prodotti', 'gin')).toEqual([{ macro: UNASSIGNED, quota: 1 }])
  })
})

// Un importo si spartisce in un punto solo, e ogni parte è già al
// centesimo: vendite e acquisti passano tutti da qui.
describe('ripartisci: degli importi in quote', () => {
  it('spartisce ogni importo e arrotonda', () => {
    expect(ripartisci(macros, 'voci', 'spritz', { incasso: 10, costo: 1.999 })).toEqual([
      { macro: 'm1', incasso: 8, costo: 1.6 },
      { macro: UNASSIGNED, incasso: 2, costo: 0.4 },
    ])
  })

  it('senza pesi, tutto a «non attribuito»', () => {
    expect(ripartisci([], 'prodotti', 'gin', { amount: 5 })).toEqual([{ macro: UNASSIGNED, amount: 5 }])
  })
})

// La schermata scrive in sottofondo e non rilegge: la macro che mostra
// dopo un peso scritto è quella di prima più il peso nuovo.
describe('macroConPeso: la macro dopo un peso scritto', () => {
  it('cambia il singolo peso e lascia il resto', () => {
    const dopo = macroConPeso(macros[1], 'voci', 'negroni', 50)
    expect(dopo.pesi_voci).toEqual({ gintonic: 100, spritz: 80, negroni: 50 })
    expect(dopo.pesi_prodotti).toBe(macros[1].pesi_prodotti)
    expect(macros[1].pesi_voci.negroni).toBeUndefined()
  })

  it('uno zero vuol dire «tolto»', () => {
    const dopo = macroConPeso(macros[1], 'voci', 'spritz', 0)
    expect(dopo.pesi_voci).toEqual({ gintonic: 100 })
  })
})

describe('conteggioPesi', () => {
  it('quanti prodotti e quante voci ha dentro una macro', () => {
    expect(conteggioPesi(macros[1])).toEqual({ prodotti: 2, voci: 2 })
    expect(conteggioPesi({ pesi_prodotti: { b: 30 } })).toEqual({ prodotti: 1, voci: 0 })
    expect(conteggioPesi(undefined)).toEqual({ prodotti: 0, voci: 0 })
  })
})
