'use strict'

// ── IL RIEPILOGO DEI SOLDI CHE ESCONO (REQ-MAG-034) ──────────────────
//
// Quarta voce di Fornitori: la merce (dalle fatture), le altre spese e
// quanto resta aperto, mese per mese. È il numero che Bilancio → Mesi userà
// per il netto (REQ-CASSA-012), e la ragione per cui sta in Fornitori è che
// i soldi che escono si guardano dove si registrano.
//
// QUELLO CHE SI SORVEGLIA QUI È IL DOPPIO CONTEGGIO, che è il modo in cui
// questo numero può sbagliare in silenzio: «da pagare» è una fetta della
// merce già contata, «senza fattura» è merce arrivata di cui manca il
// documento — nessuna delle due entra nel totale.

import { describe, it, expect } from 'vitest'
import { riepilogoMesi, totaleRiepilogo, nomeMese } from '../../src/lib/riepilogoFornitori.js'

const NOVA = { id: 'nova', name: 'Nova' }

const FATTURE = [
  { id: 'f1', supplier_id: 'nova', supplier_name: 'Nova', date: '2026-01-12', amount: 1000, paid: true, order_id: 'po-1' },
  { id: 'f2', supplier_id: 'nova', supplier_name: 'Nova', date: '2026-01-28', amount: 809, paid: false, order_id: null },
  { id: 'f3', supplier_id: 'nova', supplier_name: 'Nova', date: '2026-02-05', amount: 500, paid: true, order_id: null },
]

const SPESE = [
  { id: 's1', name: 'Sgabelli', qty: 4, unit_cost: 39.9, bought: true, bought_at: '2026-01-14' },
  // Desiderata e prezzata: non è uscito niente, e non deve pesare su gennaio.
  { id: 's2', name: 'Divano', qty: 1, unit_cost: 499, bought: false, bought_at: null },
]

// Un ordine di gennaio con la merce arrivata e nessun documento agganciato:
// è il primo dei due buchi di REQ-MAG-031, visto dal lato dei conti.
const ORDINI = [
  {
    id: 'po-9',
    created_at: '2026-01-20T09:00:00.000Z',
    lines: [
      { item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12.5, vat: 22, supplier_id: 'nova', stato: 'consegnato' },
    ],
  },
]

const riepilogo = (extra = {}) =>
  riepilogoMesi({ fatture: FATTURE, spese: SPESE, ordini: [], suppliers: [NOVA], ...extra })

describe('un mese per riga, dal più recente', () => {
  it('ci sono solo i mesi in cui è successo qualcosa', () => {
    expect(riepilogo().map((r) => r.mese)).toEqual(['2026-02', '2026-01'])
  })

  it('la merce è l’importo dei documenti di quel mese, pagati o no', () => {
    const gennaio = riepilogo().find((r) => r.mese === '2026-01')
    expect(gennaio.merce).toBe(1809)
  })

  it('le altre spese sono solo quelle comprate', () => {
    const gennaio = riepilogo().find((r) => r.mese === '2026-01')
    // 4 × 39,90: il divano da 499 è un desiderio e resta fuori.
    expect(gennaio.altre).toBeCloseTo(159.6, 2)
  })

  it('il totale è merce più altre spese', () => {
    const gennaio = riepilogo().find((r) => r.mese === '2026-01')
    expect(gennaio.totale).toBeCloseTo(1968.6, 2)
  })
})

describe('quello che resta aperto non si somma al totale', () => {
  // «Da pagare» è una fetta della merce: quelle fatture stanno già dentro
  // «merce», e sommarle conterebbe due volte la stessa uscita.
  it('il da pagare è dentro la merce, non in più', () => {
    const gennaio = riepilogo().find((r) => r.mese === '2026-01')
    expect(gennaio.daPagare).toBe(809)
    expect(gennaio.totale).toBeCloseTo(gennaio.merce + gennaio.altre, 2)
  })

  // La merce consegnata senza documento non è ancora una spesa registrata:
  // sommarla la conterebbe una seconda volta il giorno che la fattura arriva.
  it('la consegna senza fattura si mostra e resta fuori dal totale', () => {
    const righe = riepilogoMesi({ fatture: FATTURE, spese: SPESE, ordini: ORDINI, suppliers: [NOVA] })
    const gennaio = righe.find((r) => r.mese === '2026-01')
    expect(gennaio.senzaFattura).toBe(75) // 6 × 12,50, netto della fetta
    expect(gennaio.totale).toBeCloseTo(1968.6, 2)
  })
})

describe('i casi che nei dati veri ci sono', () => {
  // Una fattura senza data non ha mese: metterla in quello corrente
  // sposterebbe soldi da un mese all'altro senza che nessuno l'abbia deciso.
  it('una fattura senza data resta fuori invece di finire nel mese sbagliato', () => {
    const righe = riepilogoMesi({ fatture: [...FATTURE, { id: 'f9', amount: 300, date: null }], suppliers: [NOVA] })
    expect(righe.map((r) => r.mese)).toEqual(['2026-02', '2026-01'])
    expect(righe.reduce((s, r) => s + r.merce, 0)).toBe(2309)
  })

  it('senza niente in mano non esplode e non inventa mesi', () => {
    expect(riepilogoMesi()).toEqual([])
    expect(totaleRiepilogo([])).toMatchObject({ merce: 0, altre: 0, totale: 0 })
  })
})

describe('il totale in testa', () => {
  it('somma le righe e rifà lo stesso conto', () => {
    const righe = riepilogoMesi({ fatture: FATTURE, spese: SPESE, ordini: ORDINI, suppliers: [NOVA] })
    const tot = totaleRiepilogo(righe)
    expect(tot.merce).toBe(2309)
    expect(tot.altre).toBeCloseTo(159.6, 2)
    expect(tot.totale).toBeCloseTo(2468.6, 2)
    expect(tot.daPagare).toBe(809)
    expect(tot.senzaFattura).toBe(75)
  })
})

describe('il mese si legge in italiano', () => {
  it('«2026-01» si scrive «gennaio 2026»', () => {
    expect(nomeMese('2026-01')).toBe('gennaio 2026')
    expect(nomeMese('2026-12')).toBe('dicembre 2026')
    expect(nomeMese(null)).toBe('—')
  })
})

// ── LA NOTA DI CREDITO SCALA ANCHE QUI (BUG-100) ─────────────────────
//
// «La nota di credito deve andare a modificare il totale dello scadenzario:
// deve essere in negativo, perché mi stanno scalando dei soldi» (Flavio,
// 03/09/2026). Il riepilogo conta la merce DALLE FATTURE, quindi è il posto
// dove il segno sbagliato gonfiava il mese senza che nessuno lo vedesse.
describe('la nota di credito abbassa il mese, non lo alza', () => {
  const NOTA = {
    id: 'nc1',
    supplier_id: 'nova',
    supplier_name: 'Nova',
    doc_type: 'Nota di credito',
    date: '2026-01-30',
    amount: 300,
    paid: false,
  }

  it('la merce di gennaio scende di quello che il fornitore ci scala', () => {
    const righe = riepilogoMesi({ fatture: [...FATTURE, NOTA], spese: SPESE, suppliers: [NOVA] })
    const gennaio = righe.find((r) => r.mese === '2026-01')
    // 1.809 di documenti meno 300 di nota: 1.509, non 2.109.
    expect(gennaio.merce).toBe(1509)
    expect(gennaio.totale).toBeCloseTo(1668.6, 2)
  })

  // Finché non è stata scalata, quei soldi abbassano anche il debito: è la
  // cifra da cui si parte quando si fa il bonifico a quel fornitore.
  it('e abbassa anche quello che resta da pagare', () => {
    const righe = riepilogoMesi({ fatture: [...FATTURE, NOTA], spese: SPESE, suppliers: [NOVA] })
    expect(righe.find((r) => r.mese === '2026-01').daPagare).toBe(509)
  })

  // NON SI MIGRA NIENTE: i documenti in archivio hanno `doc_type: 'Reso'`, e
  // devono continuare a valere come le note di credito di oggi.
  it('un documento di ieri, scritto «Reso», scala come una nota di credito', () => {
    const vecchio = { ...NOTA, id: 'nc0', doc_type: 'Reso' }
    const righe = riepilogoMesi({ fatture: [...FATTURE, vecchio], spese: SPESE, suppliers: [NOVA] })
    expect(righe.find((r) => r.mese === '2026-01').merce).toBe(1509)
  })

  it('il totale in testa la porta dentro una volta sola', () => {
    const righe = riepilogoMesi({ fatture: [...FATTURE, NOTA], spese: SPESE, suppliers: [NOVA] })
    expect(totaleRiepilogo(righe).merce).toBe(2009)
  })
})
