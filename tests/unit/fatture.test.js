'use strict'

// ── I PRODOTTI DI UNA FATTURA FORNITORE (REQ-MAG-030) ────────────────
//
// Flavio, guardando lo scadenzario il 26/08/2026: «sotto mi deve apparire un
// tasto che fa il carico. Dobbiamo usare un'altra dicitura sicuramente, tipo
// AGGIUNGI PRODOTTI magari, e ci mettiamo anche i prodotti [...] Sempre che
// poi dopo mi fa la domanda se voglio aggiornare il prezzo — nel caso lo
// vado a modificare — oppure lasciarlo invariato, così, senza carico, perché
// magari me li sono caricati già prima in altro modo».
//
// Qui si prova la parte che decide: quale prezzo sta in archivio, quando c'è
// davvero una domanda da fare, e cosa si può riprendere da un ordine.

import { describe, it, expect } from 'vitest'
import {
  righeFattura,
  totaliRigheFattura,
  prezzoInArchivio,
  prezzoDiverso,
  rigaDaProdotto,
  righeDaOrdine,
  invoiceTotals,
  eNotaDiCredito,
  importoContabile,
  importoLeggibile,
  etichettaSaldo,
  cambiFattura,
  modificaAmmessa,
  TIPI_DOCUMENTO,
  DOC_NOTA_CREDITO,
} from '../../src/lib/fatture.js'

const CAMPARI = { id: 'campari', name: 'Campari', unit: 'pz', package_size: 700, cost: 12, vat: 22 }
const LISTINI = [
  { id: 'nova__campari', supplier_id: 'nova', item_id: 'campari', price: 12.5 },
  { id: 'enofel__campari', supplier_id: 'enofel', item_id: 'campari', price: 11.9 },
]

describe('le righe di una fattura', () => {
  // Nessuna fattura in archivio ha righe: prima di questa voce il documento
  // era solo una testata. Non è un errore, è la normalità di partenza.
  it('una fattura senza righe ne ha zero, non esplode', () => {
    expect(righeFattura({ id: 'inv1', amount: 100 })).toEqual([])
    expect(righeFattura(null)).toEqual([])
  })

  it('il netto è quello delle righe, confezioni per prezzo', () => {
    const totali = totaliRigheFattura([
      { qty_packages: 6, unit_cost: 12, vat: 22 },
      { qty_packages: 2, unit_cost: 20, vat: 22 },
    ])
    expect(totali.net).toBeCloseTo(112, 2)
    expect(totali.pieces).toBe(8)
  })
})

describe('il prezzo che sta in archivio', () => {
  // È quello del listino DI QUEL FORNITORE (REQ-MAG-029): lo stesso Campari
  // costa 12,50 da Nova e 11,90 da Enofel, e la domanda va fatta sul numero
  // giusto.
  it('è quello del listino di quel fornitore', () => {
    expect(prezzoInArchivio(CAMPARI, LISTINI, 'nova')).toBe(12.5)
    expect(prezzoInArchivio(CAMPARI, LISTINI, 'enofel')).toBe(11.9)
  })

  // Sono 378 prodotti su 388 a non stare sul listino di nessuno: senza riga
  // si ricade sul costo del prodotto, che è l'ultimo pagato a chiunque.
  it('senza riga di listino si ricade sul costo del prodotto', () => {
    expect(prezzoInArchivio(CAMPARI, [], 'nova')).toBe(12)
    expect(prezzoInArchivio({ id: 'x', name: 'X' }, [], 'nova')).toBe(null)
  })
})

describe('la domanda sul prezzo si fa solo dove serve', () => {
  it('un prezzo uguale non fa nessuna domanda', () => {
    expect(prezzoDiverso(12.5, 12.5)).toBe(false)
    // Sotto il centesimo non c'è niente da chiedere: chiederlo comunque
    // insegnerebbe a rispondere senza leggere.
    expect(prezzoDiverso(12.5, 12.502)).toBe(false)
  })

  it('un prezzo cambiato la fa, in su come in giù', () => {
    expect(prezzoDiverso(12.5, 13.5)).toBe(true)
    expect(prezzoDiverso(12.5, 11)).toBe(true)
  })

  it('senza un prezzo in archivio non c’è niente da confrontare', () => {
    expect(prezzoDiverso(null, 13.5)).toBe(false)
    expect(prezzoDiverso(12.5, '')).toBe(false)
  })
})

describe('una riga nuova parte dal prezzo in archivio', () => {
  // Chi compila corregge solo dove il documento dice un numero diverso: è lì
  // che compare la domanda, e solo lì.
  it('propone il prezzo del listino di quel fornitore', () => {
    const riga = rigaDaProdotto(CAMPARI, { listini: LISTINI, supplierId: 'enofel', qty: 6 })
    expect(riga).toMatchObject({ item_id: 'campari', qty_packages: 6, unit_cost: 11.9, vat: 22 })
    // La confezione se la porta dietro: le quantità in magazzino sono in
    // unità base, e senza il contenuto del pezzo il carico non saprebbe
    // quanti millilitri sono sei bottiglie.
    expect(riga.package_size).toBe(700)
  })
})

// QUESTO GRUPPO PROVAVA ANCHE `ordiniRiprendibili`, che non c'è più
// (REQ-MAG-031): quali ordini si possano riprendere adesso lo dicono le
// fette collegabili, perché riprendere le righe e agganciare la fattura sono
// lo stesso gesto. Della vecchia funzione è caduta anche la condizione «solo
// se ha già consegnato qualcosa»: una proforma arriva anche prima della
// merce, e allora quelle righe sono proprio quelle da copiare.
describe('le righe di un ordine si riprendono sulla fattura', () => {
  const ordine = {
    id: 'po-1',
    created_at: '2026-08-20T09:00:00.000Z',
    lines: [
      { item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12.5, vat: 22, supplier_id: 'nova', stato: 'consegnato' },
      { item_id: 'gin', name: 'Gin Mare', qty_packages: 1, unit_cost: 30, vat: 22, supplier_id: 'enofel', stato: 'consegnato' },
    ],
  }

  it('le righe copiate sono solo quelle di quel fornitore', () => {
    const righe = righeDaOrdine(ordine, 'nova')
    expect(righe).toHaveLength(1)
    expect(righe[0]).toMatchObject({ item_id: 'campari', qty_packages: 6, unit_cost: 12.5 })
  })

  // È il segno che spegne il carico da solo: quella merce è già entrata in
  // magazzino alla consegna, e caricarla due volte è l'errore da impedire.
  it('e dicono se quella merce è già stata caricata', () => {
    expect(righeDaOrdine(ordine, 'nova')[0].gia_caricata).toBe(true)
    const richiesto = { ...ordine, lines: [{ ...ordine.lines[0], stato: 'richiesto' }] }
    expect(righeDaOrdine(richiesto, 'nova')[0].gia_caricata).toBe(false)
  })

  // Sugli ordini scritti prima di REQ-MAG-029 il fornitore stava
  // sull'ORDINE e non sulla riga: senza questo, un ordine di ieri non si
  // riprenderebbe mai.
  it('un ordine vecchio, col fornitore in testa, si riprende lo stesso', () => {
    const vecchio = {
      id: 'po-0',
      supplier_id: 'nova',
      created_at: '2026-08-01T09:00:00.000Z',
      lines: [{ item_id: 'campari', name: 'Campari', qty_packages: 2, unit_cost: 12, stato: 'consegnato' }],
    }
    expect(righeDaOrdine(vecchio, 'nova')).toHaveLength(1)
  })
})

// ── LA NOTA DI CREDITO (BUG-100) ─────────────────────────────────────
//
// Flavio, 03/09/2026: «reso dovrebbe diventare nota di credito, perché
// questa è la dicitura giusta. Non è importante che io renda: magari è
// sbagliato solamente un prezzo, quindi io non rendo niente, mi devono
// modificare il prezzo di una fattura magari già pagata, mi fanno la nota di
// credito. E la nota di credito deve andare a modificare il totale dello
// scadenzario: deve essere in negativo, perché mi stanno scalando dei soldi».
//
// Qui si sorveglia la cosa che può sbagliare in silenzio: il SEGNO. Fino a
// ieri quei documenti si sommavano, e il totale del mese usciva più alto del
// doppio della correzione.

describe('«reso» si chiama nota di credito, e il nome vecchio vale ancora', () => {
  it('nella tendina c’è il nome nuovo, non più quello vecchio', () => {
    expect(TIPI_DOCUMENTO).toContain(DOC_NOTA_CREDITO)
    expect(TIPI_DOCUMENTO).not.toContain('Reso')
  })

  // NON SI MIGRA NIENTE: in archivio ci sono documenti scritti «Reso», e
  // devono continuare a valere. Chi legge riconosce le due parole come la
  // stessa cosa, e a saperlo è una funzione sola.
  it('un documento di ieri, scritto «Reso», è una nota di credito', () => {
    expect(eNotaDiCredito({ doc_type: 'Reso' })).toBe(true)
    expect(eNotaDiCredito({ doc_type: DOC_NOTA_CREDITO })).toBe(true)
  })

  it('una fattura non lo è, e nemmeno «Nessun documento»', () => {
    expect(eNotaDiCredito({ doc_type: 'Fattura' })).toBe(false)
    expect(eNotaDiCredito({ doc_type: 'Proforma' })).toBe(false)
    expect(eNotaDiCredito({ doc_type: 'Nessun documento' })).toBe(false)
    expect(eNotaDiCredito(null)).toBe(false)
  })
})

describe('una nota di credito sottrae', () => {
  it('l’importo si scrive positivo e si conta negativo', () => {
    expect(importoContabile({ doc_type: 'Fattura', amount: 1000 })).toBe(1000)
    expect(importoContabile({ doc_type: DOC_NOTA_CREDITO, amount: 120 })).toBe(-120)
  })

  it('anche col nome vecchio: un «Reso» di ieri scala come oggi', () => {
    expect(importoContabile({ doc_type: 'Reso', amount: 36.6 })).toBe(-36.6)
  })

  // Se qualcuno batte −120 intendendo una detrazione, il segno non si gira
  // due volte: la nota tornerebbe a sommare, che è precisamente il difetto.
  it('un importo già scritto col meno non torna a sommare', () => {
    expect(importoContabile({ doc_type: DOC_NOTA_CREDITO, amount: -120 })).toBe(-120)
  })

  it('senza importo, o senza documento, non esplode', () => {
    expect(importoContabile({ doc_type: DOC_NOTA_CREDITO })).toBe(-0)
    expect(importoContabile(null)).toBe(0)
  })

  // IL COLORE NON BASTA: la cifra si legge come una sottrazione anche da chi
  // il verde non lo distingue, o guarda lo schermo di sera e di fretta.
  it('si legge col meno davanti', () => {
    expect(importoLeggibile({ doc_type: DOC_NOTA_CREDITO, amount: 120 })).toMatch(/^− 120,00/)
    expect(importoLeggibile({ doc_type: 'Fattura', amount: 120 })).toMatch(/^120,00/)
  })
})

// `invoiceTotals` stava in warehouse.js: è venuto qui con BUG-100, perché da
// quando una nota di credito sottrae i totali devono conoscere i tipi di
// documento. Il primo caso è quello di prima, invariato.
describe('i totali dello scadenzario', () => {
  const invoices = [
    { supplier_id: 'nova', supplier_name: 'NOVA', amount: 100, paid: false },
    { supplier_id: 'nova', supplier_name: 'NOVA', amount: 50, paid: false },
    { supplier_id: 'mar', supplier_name: 'MAR', amount: 30, paid: false },
    { supplier_id: 'nova', supplier_name: 'NOVA', amount: 999, paid: true },
  ]

  it('totale da pagare, pagato e ripartizione per fornitore', () => {
    const t = invoiceTotals(invoices)
    expect(t.unpaid).toBe(180)
    expect(t.paid).toBe(999)
    expect(t.bySupplier[0]).toMatchObject({ supplier_id: 'nova', unpaid: 150, count: 2 })
    expect(t.bySupplier[1]).toMatchObject({ supplier_id: 'mar', unpaid: 30 })
  })

  // È IL DIFETTO, misurato: 180 di documenti aperti e una nota di credito da
  // 120 fanno 60 da pagare. Sommandola — com'era — ne facevano 300.
  it('una nota di credito ABBASSA il «Da pagare», non lo alza', () => {
    const t = invoiceTotals([
      ...invoices,
      { supplier_id: 'nova', supplier_name: 'NOVA', doc_type: DOC_NOTA_CREDITO, amount: 120, paid: false },
    ])
    expect(t.unpaid).toBe(60)
  })

  it('e abbassa anche il totale di quel fornitore, non di un altro', () => {
    const t = invoiceTotals([
      ...invoices,
      { supplier_id: 'nova', supplier_name: 'NOVA', doc_type: 'Reso', amount: 100, paid: false },
    ])
    const nova = t.bySupplier.find((s) => s.supplier_id === 'nova')
    const mar = t.bySupplier.find((s) => s.supplier_id === 'mar')
    expect(nova.unpaid).toBe(50)
    expect(mar.unpaid).toBe(30)
  })
})

// UNA NOTA DI CREDITO NON SI PAGA: o la si incassa, o — molto più spesso —
// la si scala da quello che si deve. Il gesto resta uno solo (lo stesso
// campo `paid`, lo stesso tasto, gli stessi totali): a cambiare è la parola.
describe('«pagata» non vuol dire niente su una nota di credito', () => {
  it('su una fattura si paga', () => {
    expect(etichettaSaldo({ doc_type: 'Fattura', paid: false })).toBe('⏳ da pagare')
    expect(etichettaSaldo({ doc_type: 'Fattura', paid: true })).toBe('✅ pagato')
  })

  it('su una nota di credito si scala', () => {
    expect(etichettaSaldo({ doc_type: DOC_NOTA_CREDITO, paid: false })).toBe('⏳ da scalare')
    expect(etichettaSaldo({ doc_type: 'Reso', paid: true })).toBe('✅ scalata')
  })
})

// ── LA CORREZIONE DI UN DOCUMENTO (REQ-MAG-041) ──────────────────────
//
// «In Scadenzario i documenti creati devono essere modificabili nel caso di
// variazione o errore» (Flavio, 03/09/2026). Qui la parte pura: cosa si
// racconta di una correzione, e quando una correzione non si può fare.

describe('cosa è cambiato, già scritto in italiano', () => {
  const PRIMA = {
    id: 'inv-1',
    supplier_id: 'nova',
    supplier_name: 'Nova',
    number: '1556',
    doc_type: 'Fattura',
    date: '2026-08-26',
    amount: 120,
    notes: null,
  }

  it('un importo corretto si racconta da quanto a quanto', () => {
    const cambi = cambiFattura(PRIMA, { ...PRIMA, amount: 130 })
    expect(cambi).toHaveLength(1)
    expect(cambi[0].campo).toBe('Importo')
    expect(cambi[0].da).toMatch(/^120,00/)
    expect(cambi[0].a).toMatch(/^130,00/)
  })

  // Il tipo cambia il SEGNO dell'importo, quindi la storia deve leggersi col
  // segno di allora: «da 120,00 € a − 120,00 €» dice cosa è successo ai
  // conti, «da 120 a 120» non direbbe niente.
  it('diventando nota di credito, l’importo si racconta col meno', () => {
    const cambi = cambiFattura(PRIMA, { ...PRIMA, doc_type: DOC_NOTA_CREDITO })
    expect(cambi.map((c) => c.campo)).toEqual(['Tipo', 'Importo'])
    expect(cambi[1].a).toMatch(/^− 120,00/)
  })

  it('un campo vuoto si legge «—», non «null»', () => {
    const cambi = cambiFattura(PRIMA, { ...PRIMA, notes: 'differenza di prezzo' })
    expect(cambi[0]).toMatchObject({ campo: 'Note', da: '—', a: 'differenza di prezzo' })
  })

  // APRIRE IL MODULO E CHIUDERLO NON È UNA CORREZIONE: una riga di storia
  // che dice «corretto» senza dire cosa è il modo in cui uno storico smette
  // di valere qualcosa.
  it('senza niente di cambiato non c’è niente da raccontare', () => {
    expect(cambiFattura(PRIMA, { ...PRIMA })).toEqual([])
    // Sotto il centesimo non è una correzione, come per i prezzi.
    expect(cambiFattura(PRIMA, { ...PRIMA, amount: 120.002 })).toEqual([])
  })

  it('del fornitore si legge il nome, e a cambiare è l’identificativo', () => {
    const cambi = cambiFattura(PRIMA, { ...PRIMA, supplier_id: 'mar', supplier_name: 'Mar' })
    expect(cambi[0]).toMatchObject({ campo: 'Fornitore', da: 'Nova', a: 'Mar' })
  })
})

describe('quando una correzione non si può fare', () => {
  const AGGANCIATA = {
    id: 'inv-1',
    supplier_id: 'nova',
    supplier_name: 'Nova',
    doc_type: 'Fattura',
    amount: 120,
    order_id: 'po-1',
  }

  // IL LEGAME CON L'ORDINE È LA COPPIA ORDINE + FORNITORE (REQ-MAG-031):
  // cambiando fornitore sotto un documento agganciato, quella parte
  // dell'ordine resterebbe legata alla fattura di qualcun altro.
  it('il fornitore di un documento agganciato si cambia solo scollegandolo', () => {
    expect(modificaAmmessa(AGGANCIATA, { ...AGGANCIATA, supplier_id: 'mar' })).toMatch(/scollegalo/)
    expect(modificaAmmessa(AGGANCIATA, { ...AGGANCIATA, amount: 130 })).toBeNull()
  })

  it('senza aggancio il fornitore si corregge', () => {
    const libera = { ...AGGANCIATA, order_id: null }
    expect(modificaAmmessa(libera, { ...libera, supplier_id: 'mar' })).toBeNull()
  })

  it('un documento senza fornitore non si salva: lo emette qualcuno', () => {
    expect(modificaAmmessa(AGGANCIATA, { ...AGGANCIATA, supplier_id: '' })).toMatch(/fornitore/)
  })
})
