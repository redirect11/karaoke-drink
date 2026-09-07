'use strict'

// IL LISTINO FORNITORI: un prodotto, più fornitori (REQ-MAG-029).
//
// Nasce da Flavio, che ha provato la sezione Ordini il 26/08/2026: «quel
// prodotto — ad esempio il Campari — deve essere associato a quel
// fornitore, e io questo non lo posso fare CATEGORICAMENTE: è quasi sicuro
// che il Campari lo prendo anche da fornitori differenti».
//
// Qui si prova la logica pura: chi si vede nel catalogo, chi si propone,
// come si tagliano le fette di un ordine con più fornitori dentro. Sono i
// conti su cui si decide quanto si spende e a chi si manda l'ordine.

import { describe, it, expect } from 'vitest'
import {
  idRigaListino,
  rigaVirtuale,
  righeDiProdotto,
  catalogoOrdinabile,
  filtraCatalogo,
  fornitoreProposto,
  piuEconomica,
  fornitoriGiaUsati,
  fornitoriPerArticolo,
  fetteFornitore,
  livelloDi,
  livelloDelGruppo,
  statoOrdine,
  coloreFornitore,
  coloreACaso,
  COLORI_FORNITORE,
} from '../../src/lib/listini.js'

const NOVA = { id: 'nova', name: 'Nova', email: 'ordini@nova.it', color: '#e74c3c' }
const ENOFEL = { id: 'enofel', name: 'Enofel', color: '#3498db' }
const FORNITORI = [NOVA, ENOFEL]

const CAMPARI = { id: 'campari', name: 'Campari', unit: 'pz', cost: 12, vat: 22 }
const GIN = { id: 'gin', name: 'Gin Mare', unit: 'pz', cost: 30, vat: 22 }

describe('l’id di una riga di listino', () => {
  // L'unicità della coppia dev'essere STRUTTURALE: con un id casuale due
  // terminali potrebbero scrivere due prezzi diversi dello stesso Campari
  // dallo stesso fornitore, e nessuno saprebbe qual è quello buono.
  it('è deterministico: la stessa coppia dà sempre lo stesso id', () => {
    expect(idRigaListino('nova', 'campari')).toBe(idRigaListino('nova', 'campari'))
    expect(idRigaListino('nova', 'campari')).not.toBe(idRigaListino('enofel', 'campari'))
  })

  it('senza fornitore o senza prodotto non c’è riga', () => {
    expect(idRigaListino(null, 'campari')).toBeNull()
    expect(idRigaListino('nova', null)).toBeNull()
  })
})

// IL PASSAGGIO NON MIGRA NIENTE: la compatibilità sta in una funzione sola.
// Dieci prodotti su 388 hanno il vecchio campo `supplier_id` scritto, e
// devono continuare a comportarsi come prima senza che nessuno lanci uno
// script contro il database.
describe('il vecchio campo fornitore diventa una riga virtuale', () => {
  it('un prodotto col vecchio campo ha la sua riga, col suo costo', () => {
    const riga = rigaVirtuale({ ...CAMPARI, supplier_id: 'nova' })
    expect(riga).toMatchObject({ supplier_id: 'nova', item_id: 'campari', price: 12, virtuale: true })
  })

  it('senza vecchio campo non si inventa niente', () => {
    expect(rigaVirtuale(CAMPARI)).toBeNull()
  })

  it('e appena esiste una riga vera, la virtuale non serve più', () => {
    const item = { ...CAMPARI, supplier_id: 'nova' }
    const righe = righeDiProdotto(item, [
      { supplier_id: 'enofel', item_id: 'campari', price: 11 },
    ])
    expect(righe).toHaveLength(1)
    expect(righe[0].supplier_id).toBe('enofel')
  })
})

describe('il catalogo ordinabile: una riga per coppia prodotto-fornitore', () => {
  const listini = [
    { supplier_id: 'nova', item_id: 'campari', price: 12.5, package_label: 'cartone da 6', code: 'CMP01' },
    { supplier_id: 'enofel', item_id: 'campari', price: 11.9 },
  ]

  it('lo stesso Campari compare una volta per fornitore, e il prodotto resta uno', () => {
    const righe = catalogoOrdinabile({ items: [CAMPARI], listini, suppliers: FORNITORI })
    expect(righe).toHaveLength(2)
    // È la RIGA a duplicarsi: il prodotto sotto è sempre lo stesso.
    expect(new Set(righe.map((r) => r.item_id))).toEqual(new Set(['campari']))
    expect(righe.map((r) => r.supplier_name).sort()).toEqual(['Enofel', 'Nova'])
    // Ognuna col prezzo del SUO fornitore: è il confronto per cui esiste.
    expect(righe.find((r) => r.supplier_id === 'nova').price).toBe(12.5)
    expect(righe.find((r) => r.supplier_id === 'enofel').price).toBe(11.9)
  })

  it('i doppioni si distinguono anche dal colore del fornitore', () => {
    const righe = catalogoOrdinabile({ items: [CAMPARI], listini, suppliers: FORNITORI })
    expect(righe.find((r) => r.supplier_id === 'nova').colore).toBe('#e74c3c')
    expect(righe.find((r) => r.supplier_id === 'enofel').colore).toBe('#3498db')
  })

  it('la confezione e il codice sono QUELLI DEL FORNITORE, non del prodotto', () => {
    const righe = catalogoOrdinabile({ items: [CAMPARI], listini, suppliers: FORNITORI })
    const nova = righe.find((r) => r.supplier_id === 'nova')
    expect(nova.package_label).toBe('cartone da 6')
    expect(nova.code).toBe('CMP01')
  })

  // OGGI 378 PRODOTTI SU 388 NON HANNO NESSUN FORNITORE, perché l'import da
  // Excel scriveva il campo a nullo. Una schermata che mostrasse solo chi ha
  // un listino sarebbe vuota — ed è proprio il guaio che Flavio ha visto.
  it('un prodotto senza nessun fornitore resta ordinabile', () => {
    const righe = catalogoOrdinabile({ items: [GIN], listini: [], suppliers: FORNITORI })
    expect(righe).toHaveLength(1)
    expect(righe[0]).toMatchObject({ item_id: 'gin', supplier_id: null, supplier_name: null })
    // Il prezzo di partenza è il costo del prodotto: l'ultimo pagato a
    // chiunque, che è l'unica cosa che si sa.
    expect(righe[0].price).toBe(30)
  })

  it('con zero listini la schermata regge: c’è una riga per prodotto', () => {
    const righe = catalogoOrdinabile({ items: [CAMPARI, GIN], listini: [], suppliers: [] })
    expect(righe.map((r) => r.item_name)).toEqual(['Campari', 'Gin Mare'])
  })
})

// LA RICERCA VIENE PRIMA DEL FORNITORE. Flavio: «sarebbe buono se avesse il
// campetto di ricerca, in modo tale che io posso mettere il prodotto
// INDIPENDENTEMENTE da quale fornitore resta associato».
describe('cercare un prodotto senza sapere di chi è', () => {
  const listini = [
    { supplier_id: 'nova', item_id: 'campari', price: 12.5 },
    { supplier_id: 'enofel', item_id: 'campari', price: 11.9 },
  ]
  const righe = catalogoOrdinabile({ items: [CAMPARI, GIN], listini, suppliers: FORNITORI })

  it('il nome basta: escono tutte le righe di quel prodotto', () => {
    const trovate = filtraCatalogo(righe, { query: 'campa' })
    expect(trovate).toHaveLength(2)
    expect(new Set(trovate.map((r) => r.supplier_name))).toEqual(new Set(['Nova', 'Enofel']))
  })

  it('col filtro fornitore si vede il catalogo di quel fornitore', () => {
    const trovate = filtraCatalogo(righe, { supplierId: 'nova' })
    expect(trovate.map((r) => r.item_name)).toEqual(['Campari'])
  })

  it('e si possono cercare quelli che non hanno ancora un fornitore', () => {
    const trovate = filtraCatalogo(righe, { supplierId: 'none' })
    expect(trovate.map((r) => r.item_name)).toEqual(['Gin Mare'])
  })
})

// IL FORNITORE PROPOSTO È QUELLO DELL'ULTIMO ACQUISTO, NON IL PIÙ
// ECONOMICO: il prezzo più basso in archivio è quasi sempre il più vecchio,
// perché nessuno aggiorna al rialzo il listino di un fornitore da cui non
// compra più. Proporlo vorrebbe dire mandare l'ordine a chi quel prezzo non
// lo fa più da due anni.
describe('chi si propone quando si aggiunge un prodotto all’ordine', () => {
  const righe = [
    { supplier_id: 'enofel', item_id: 'campari', price: 9.5, last_price_at: '2024-02-01T10:00:00.000Z' },
    { supplier_id: 'nova', item_id: 'campari', price: 12.5, last_price_at: '2026-08-01T10:00:00.000Z' },
  ]

  it('si propone l’ultimo acquisto, anche se costa di più', () => {
    expect(fornitoreProposto(righe).supplier_id).toBe('nova')
  })

  it('il più economico si MOSTRA accanto, come confronto', () => {
    expect(piuEconomica(righe).supplier_id).toBe('enofel')
  })

  it('un fornitore escluso non si propone né si mostra', () => {
    expect(fornitoreProposto(righe, { esclusi: ['nova'] }).supplier_id).toBe('enofel')
    expect(piuEconomica(righe, { esclusi: ['enofel'] }).supplier_id).toBe('nova')
  })

  it('senza nessun fornitore in listino non si propone niente', () => {
    expect(fornitoreProposto([])).toBeNull()
    expect(piuEconomica([{ supplier_id: 'nova', price: 0 }])).toBeNull()
  })
})

// «Va anche bene che è disabilitato il fornitore in quanto già l'ho
// ordinato a quel fornitore» (Flavio): due righe dello stesso prodotto allo
// stesso fornitore, nello stesso ordine, sono un doppione — e un doppione
// in un ordine si paga due volte.
describe('un fornitore già usato per quel prodotto non si può riusare', () => {
  it('conta solo lo stesso prodotto, non tutto l’ordine', () => {
    const righe = [
      { item_id: 'campari', supplier_id: 'nova' },
      { item_id: 'gin', supplier_id: 'enofel' },
    ]
    expect([...fornitoriGiaUsati(righe, 'campari')]).toEqual(['nova'])
    expect([...fornitoriGiaUsati(righe, 'gin')]).toEqual(['enofel'])
    expect([...fornitoriGiaUsati(righe, 'rum')]).toEqual([])
  })
})

describe('chi vende cosa, per il filtro del magazzino', () => {
  it('un prodotto può avere più fornitori, e il magazzino li vede tutti', () => {
    const mappa = fornitoriPerArticolo(
      [CAMPARI, GIN],
      [
        { supplier_id: 'nova', item_id: 'campari' },
        { supplier_id: 'enofel', item_id: 'campari' },
      ]
    )
    expect(mappa.get('campari').sort()).toEqual(['enofel', 'nova'])
    expect(mappa.get('gin')).toEqual([])
  })

  it('e chi ha ancora solo il vecchio campo non sparisce dai filtri', () => {
    const mappa = fornitoriPerArticolo([{ ...GIN, supplier_id: 'nova' }], [])
    expect(mappa.get('gin')).toEqual(['nova'])
  })
})

// I TRE LIVELLI, parole di Flavio: «ci devono stare i livelli di RICHIESTO,
// CONSEGNATO, PAGATO». Il carico a magazzino avviene al passaggio a
// CONSEGNATO — è questo che risolve «ordinato ma non ancora ricevuto» senza
// inventare uno stato nuovo sul prodotto.
describe('i tre livelli della riga d’ordine', () => {
  it('una riga senza livello scritto è «richiesta»: gli ordini di ieri non sono consegnati', () => {
    expect(livelloDi({})).toBe('richiesto')
    expect(livelloDi({ stato: 'inventato' })).toBe('richiesto')
    expect(livelloDi({ stato: 'pagato' })).toBe('pagato')
  })

  it('un gruppo vale quanto la sua riga più indietro', () => {
    expect(livelloDelGruppo([{ stato: 'pagato' }, { stato: 'consegnato' }])).toBe('consegnato')
    expect(livelloDelGruppo([{ stato: 'pagato' }, {}])).toBe('richiesto')
    expect(livelloDelGruppo([{ stato: 'pagato' }, { stato: 'pagato' }])).toBe('pagato')
  })

  it('l’ordine intero resta «inviato» finché c’è qualcosa da consegnare', () => {
    expect(statoOrdine({ lines: [{ stato: 'consegnato' }, {}] })).toBe('inviato')
    expect(statoOrdine({ lines: [{ stato: 'consegnato' }, { stato: 'pagato' }] })).toBe('ricevuto')
  })
})

// L'ORDINE RESTA UNO, coi fornitori dentro, e il per-fornitore è una VISTA
// (REQ-MAG-025, 20/08). Ma email, stampa e fattura vanno per FETTA:
// mandare a Nova anche le righe di Enofel è un errore verso il fornitore.
describe('le fette di fornitore dentro un ordine solo', () => {
  const ordine = {
    id: 'po1',
    created_at: '2026-08-26T09:00:00.000Z',
    lines: [
      { item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12, vat: 22, supplier_id: 'nova' },
      { item_id: 'gin', name: 'Gin Mare', qty_packages: 2, unit_cost: 30, vat: 22, supplier_id: 'enofel' },
      { item_id: 'rum', name: 'Rum', qty_packages: 1, unit_cost: 20, vat: 22, supplier_id: 'nova' },
    ],
  }

  it('ogni fornitore vede SOLO le sue righe', () => {
    const fette = fetteFornitore(ordine, { suppliers: FORNITORI })
    expect(fette).toHaveLength(2)
    const nova = fette.find((f) => f.supplier_id === 'nova')
    expect(nova.lines.map((l) => l.name)).toEqual(['Campari', 'Rum'])
    expect(nova.email).toBe('ordini@nova.it')
    // Le posizioni servono a far avanzare le righe giuste dentro l'array.
    expect(nova.indici).toEqual([0, 2])
  })

  it('i totali sono quelli della fetta, non dell’ordine intero', () => {
    const nova = fetteFornitore(ordine, { suppliers: FORNITORI }).find((f) => f.supplier_id === 'nova')
    expect(nova.total_net).toBeCloseTo(6 * 12 + 20, 2)
    expect(nova.total_gross).toBeCloseTo((6 * 12 + 20) * 1.22, 2)
  })

  // La fetta ha la stessa FORMA di un ordine: così testo, copia e stampa la
  // trattano come sempre, senza una seconda versione di quelle funzioni.
  it('la fetta si stampa come un ordine: ha data, nome e totali', () => {
    const nova = fetteFornitore(ordine, { suppliers: FORNITORI }).find((f) => f.supplier_id === 'nova')
    expect(nova.created_at).toBe(ordine.created_at)
    expect(nova.supplier_name).toBe('Nova')
    expect(nova.stato).toBe('richiesto')
  })

  it('un ordine vecchio, col fornitore scritto in testa, resta una fetta sola', () => {
    const vecchio = {
      supplier_id: 'nova',
      supplier_name: 'Nova',
      lines: [{ item_id: 'campari', name: 'Campari', qty_packages: 1, unit_cost: 12 }],
    }
    const fette = fetteFornitore(vecchio, { suppliers: FORNITORI })
    expect(fette).toHaveLength(1)
    expect(fette[0].supplier_id).toBe('nova')
  })

  it('e le righe senza fornitore stanno insieme, invece di sparire', () => {
    const fette = fetteFornitore({ lines: [{ item_id: 'gin', qty_packages: 1, unit_cost: 5 }] })
    expect(fette).toHaveLength(1)
    expect(fette[0].supplier_id).toBeNull()
  })
})

describe('il colore del fornitore', () => {
  it('è quello scelto, se c’è', () => {
    expect(coloreFornitore(NOVA)).toBe('#e74c3c')
  })

  // Chi è stato creato prima non ne ha uno: gliene tocca uno STABILE, non
  // uno nuovo a ogni ricarica — un colore che cambia non identifica niente.
  it('e chi non ce l’ha ne riceve uno stabile, calcolato dal suo id', () => {
    const senza = { id: 'font', name: 'Font' }
    expect(coloreFornitore(senza)).toBe(coloreFornitore(senza))
    expect(COLORI_FORNITORE).toContain(coloreFornitore(senza))
  })

  it('quello proposto alla creazione viene dalla tavolozza di casa', () => {
    expect(COLORI_FORNITORE).toContain(coloreACaso())
  })
})
