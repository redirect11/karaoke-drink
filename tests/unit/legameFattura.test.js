'use strict'

// ── IL LEGAME FATTURA ↔ FETTA DI FORNITORE (REQ-MAG-031) ─────────────
//
// L'utente, 20/08: «la vista degli ordini contiene più fornitori, ma la
// fattura è collegata all'ordine PER IL FORNITORE, perché è il fornitore che
// rilascia la fattura».
//
// Quindi il legame non è fattura-ordine ma fattura-FETTA, e le due cose che
// qui si sorvegliano sono quelle che a fine mese costano: che una fattura
// non finisca sulla merce di un altro fornitore, e che i due buchi — merce
// arrivata senza documento, documento senza ordine — si contino da soli.

import { describe, it, expect } from 'vitest'
import {
  fatturaDellaFetta,
  fettaDellaFattura,
  aggancioAmmesso,
  fetteCollegabili,
  fattureCollegabili,
  fetteSenzaFattura,
  fattureSenzaFetta,
} from '../../src/lib/fatture.js'
import { fetteFornitore } from '../../src/lib/listini.js'

const FORNITORI = [
  { id: 'nova', name: 'Nova' },
  { id: 'enofel', name: 'Enofel' },
]

// L'ordine del 20 agosto: due fornitori dentro, come nella vita vera. Nova
// ha già consegnato, Enofel no.
const ORDINE = {
  id: 'po-1',
  created_at: '2026-08-20T09:00:00.000Z',
  lines: [
    { item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12.5, vat: 22, supplier_id: 'nova', stato: 'consegnato' },
    { item_id: 'gin', name: 'Gin Mare', qty_packages: 1, unit_cost: 30, vat: 22, supplier_id: 'enofel', stato: 'richiesto' },
  ],
}

const fetta = (supplierId, ordine = ORDINE) =>
  fetteFornitore(ordine, { suppliers: FORNITORI }).find((f) => f.supplier_id === supplierId)

const FATTURA_NOVA = { id: 'inv-nova', supplier_id: 'nova', supplier_name: 'Nova', number: '1556', amount: 81, order_id: null }
const FATTURA_ENOFEL = { id: 'inv-enofel', supplier_id: 'enofel', supplier_name: 'Enofel', number: '77', amount: 30, order_id: null }

describe('la fattura sta sulla fetta, non sull’ordine', () => {
  it('un ordine con due fornitori ha due fatture, una per fetta', () => {
    const fatture = [
      { ...FATTURA_NOVA, order_id: 'po-1' },
      { ...FATTURA_ENOFEL, order_id: 'po-1' },
    ]
    expect(fatturaDellaFetta(fatture, fetta('nova')).id).toBe('inv-nova')
    expect(fatturaDellaFetta(fatture, fetta('enofel')).id).toBe('inv-enofel')
  })

  it('e dalla fattura si torna alla sua fetta', () => {
    const f = fettaDellaFattura({ ...FATTURA_NOVA, order_id: 'po-1' }, [ORDINE], { suppliers: FORNITORI })
    expect(f.supplier_name).toBe('Nova')
    // È la fetta, non l'ordine: dentro ci sono solo le righe di Nova.
    expect(f.lines.map((l) => l.item_id)).toEqual(['campari'])
  })

  // In mano ci sono gli ultimi venticinque ordini: di uno più vecchio si sa
  // che il legame c'è, non cosa contiene. Chi chiama distingue i due casi.
  it('un ordine fuori dagli ultimi non fa sparire il legame, torna solo vuota', () => {
    expect(fettaDellaFattura({ ...FATTURA_NOVA, order_id: 'po-vecchio' }, [ORDINE], { suppliers: FORNITORI })).toBe(null)
    expect(fettaDellaFattura(FATTURA_NOVA, [ORDINE], { suppliers: FORNITORI })).toBe(null)
  })
})

describe('il fornitore fa da guardia', () => {
  // «Agganciare la fattura di Nova alla fetta di Enofel non è un errore di
  // battitura, è un conto sbagliato»: merce pagata a chi non l'ha venduta.
  it('la fattura di un fornitore non si aggancia alla fetta di un altro', () => {
    const motivo = aggancioAmmesso(FATTURA_NOVA, fetta('enofel'), { fatture: [] })
    expect(motivo).toMatch(/Enofel/)
    expect(motivo).toMatch(/Nova/)
  })

  it('sulla sua, invece, si aggancia', () => {
    expect(aggancioAmmesso(FATTURA_NOVA, fetta('nova'), { fatture: [] })).toBe(null)
  })

  // La fetta «senza fornitore» esiste (righe di un ordine a cui nessuno ha
  // detto da chi si compra) ma una fattura la rilascia qualcuno: lì non si
  // aggancia niente.
  it('una fetta senza fornitore non prende nessun documento', () => {
    const senza = { id: 'po-2', created_at: '2026-08-20T09:00:00.000Z', lines: [{ item_id: 'x', qty_packages: 1 }] }
    expect(aggancioAmmesso(FATTURA_NOVA, fetta(null, senza), { fatture: [] })).toMatch(/fornitore/)
  })
})

describe('uno-a-uno, nei due sensi', () => {
  it('una fetta che ha già un documento non ne prende un secondo', () => {
    const prima = { ...FATTURA_NOVA, order_id: 'po-1' }
    const seconda = { id: 'inv-2', supplier_id: 'nova', supplier_name: 'Nova', order_id: null }
    expect(aggancioAmmesso(seconda, fetta('nova'), { fatture: [prima] })).toMatch(/ha già un documento/)
    // Ma quella che ci sta già non è in conflitto con sé stessa: riscegliere
    // il proprio ordine deve restare possibile, se no non si potrebbero più
    // riprendere le sue righe.
    expect(aggancioAmmesso(prima, fetta('nova'), { fatture: [prima] })).toBe(null)
  })

  // Il campo è uno solo, quindi riscriverlo staccherebbe in silenzio la
  // fetta di prima, che tornerebbe scoperta senza che nessuno l'abbia
  // deciso. Si stacca a mano, e staccare è un gesto che si vede.
  it('un documento già collegato a un altro ordine si stacca prima', () => {
    const altrove = { ...FATTURA_NOVA, order_id: 'po-vecchio' }
    expect(aggancioAmmesso(altrove, fetta('nova'), { fatture: [] })).toMatch(/già collegato/)
  })
})

describe('le candidate le filtra la stessa guardia', () => {
  it('alla fattura si propongono solo le fette del suo fornitore', () => {
    const fette = fetteCollegabili(FATTURA_ENOFEL, [ORDINE], { suppliers: FORNITORI, fatture: [] })
    expect(fette.map((f) => f.supplier_id)).toEqual(['enofel'])
    // Non si chiede che la merce sia già arrivata: la fetta di Enofel è
    // ancora «richiesta» e si collega lo stesso, perché una proforma arriva
    // anche prima della merce.
    expect(fette[0].stato).toBe('richiesto')
  })

  it('e alla fetta solo i documenti del suo fornitore, ancora liberi', () => {
    const fatture = [FATTURA_NOVA, FATTURA_ENOFEL, { id: 'inv-3', supplier_id: 'nova', order_id: 'po-vecchio' }]
    expect(fattureCollegabili(fatture, fetta('nova')).map((f) => f.id)).toEqual(['inv-nova'])
  })

  it('una fetta già coperta non compare più fra le candidate', () => {
    const fatture = [{ ...FATTURA_NOVA, order_id: 'po-1' }]
    const seconda = { id: 'inv-2', supplier_id: 'nova', supplier_name: 'Nova', order_id: null }
    expect(fetteCollegabili(seconda, [ORDINE], { suppliers: FORNITORI, fatture })).toEqual([])
  })
})

describe('i due buchi si contano da soli', () => {
  // «Sono le due cose che a fine mese fanno tornare o non tornare i conti
  // con il commercialista» (l'utente).
  it('la merce è arrivata e il documento no', () => {
    const scoperte = fetteSenzaFattura([ORDINE], [], { suppliers: FORNITORI })
    // Solo Nova: la fetta di Enofel è ancora richiesta, lì non è arrivato
    // niente e segnalarla insegnerebbe a ignorare il segnale.
    expect(scoperte.map((f) => f.supplier_id)).toEqual(['nova'])
  })

  it('con la fattura attaccata il buco si chiude', () => {
    const fatture = [{ ...FATTURA_NOVA, order_id: 'po-1' }]
    expect(fetteSenzaFattura([ORDINE], fatture, { suppliers: FORNITORI })).toEqual([])
  })

  it('il documento c’è e l’ordine no', () => {
    const fatture = [FATTURA_NOVA, { ...FATTURA_ENOFEL, order_id: 'po-1' }]
    expect(fattureSenzaFetta(fatture).map((f) => f.id)).toEqual(['inv-nova'])
  })
})
