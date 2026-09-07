'use strict'

// ── I MODELLI D'ORDINE: COMPORLI E APPLICARLI (REQ-MAG-039) ──────────
//
// «Flavio potrebbe voler salvare un ordine come TEMPLATE, e nella creazione
// dell'ordine, oltre alla precompilazione, deve poter usare un template
// salvato — con quantità già impostate e prodotti per fornitore già
// selezionati» (l'utente, 27/08/2026).
//
// Qui si sorvegliano le due cose che, sbagliate, fanno danno in silenzio:
//   1) IL PREZZO NON STA NEL MODELLO. «Quando lo carico il prezzo sulla
//      creazione/modifica ordine è sempre quello del listino del fornitore,
//      aggiornato all'ultima fattura». Un modello coi prezzi dentro manderebbe
//      un ordine a cifre di due mesi fa, ed è la cosa che il confronto
//      ordine-fattura (REQ-MAG-038) esiste apposta per scoprire.
//   2) QUANDO IL MONDO È CAMBIATO SI DICE. Un modello può contenere un
//      prodotto che non esiste più o un fornitore che non lo vende più: chi lo
//      applica deve vedere cosa non è stato ripreso e perché, invece di
//      trovarsi un ordine più corto senza spiegazione.

import { describe, it, expect } from 'vitest'
import {
  MOTIVI,
  applicaModello,
  modelloConNome,
  nomeModello,
  righeModello,
  righeModelloDaOrdine,
  testoAvviso,
} from '../../src/lib/modelliOrdine.js'
import { catalogoOrdinabile } from '../../src/lib/listini.js'

const NOVA = { id: 'nova', name: 'Nova' }
const ENOFEL = { id: 'enofel', name: 'Enofel' }

const CAMPARI = { id: 'campari', name: 'Campari', unit: 'pz', stock: 3, cost: 12, status: 'linea' }
const GIN = { id: 'gin', name: 'Gin Mare', unit: 'pz', stock: 5, cost: 30, status: 'linea' }
// Fuori linea: si può ancora ordinare — è così che rientra — ma va detto.
const AMARO = { id: 'amaro', name: 'Amaro Lucano', unit: 'pz', stock: 0, cost: 9, status: 'out' }
// Senza nessuna riga di listino: 378 prodotti su 388 stanno così.
const TONICA = { id: 'tonica', name: 'Tonica', unit: 'pz', stock: 20, cost: 1, status: 'linea' }

const LISTINI = [
  { id: 'nova__campari', supplier_id: 'nova', item_id: 'campari', price: 12.5 },
  { id: 'enofel__campari', supplier_id: 'enofel', item_id: 'campari', price: 11.9 },
  { id: 'enofel__gin', supplier_id: 'enofel', item_id: 'gin', price: 28 },
  { id: 'nova__amaro', supplier_id: 'nova', item_id: 'amaro', price: 9 },
]

const suppliers = [NOVA, ENOFEL]
const catalogo = catalogoOrdinabile({
  items: [CAMPARI, GIN, AMARO, TONICA],
  listini: LISTINI,
  suppliers,
})

const applica = (righe, selezioni = {}) =>
  applicaModello({ nome: 'Giro', righe }, { catalogo, suppliers, selezioni })

describe('comporre un modello da quello che si sta ordinando', () => {
  it('tiene prodotto, fornitore e quantità, e nient’altro', () => {
    const righe = righeModello([
      {
        key: 'campari|nova',
        item_id: 'campari',
        item_name: 'Campari',
        supplier_id: 'nova',
        qty: 2,
        // Tutto quello che segue NON deve finire nel modello: sono prezzi, e
        // il prezzo lo rimette il listino ogni volta che si applica.
        prezzo: 25.05,
        prezzoPezzo: 1.04,
        unit_cost: 1.04,
        totale: 50.1,
        perCollo: 24,
      },
    ])
    expect(righe).toEqual([
      { item_id: 'campari', item_name: 'Campari', supplier_id: 'nova', qty: 2 },
    ])
  })

  it('lascia fuori le righe spuntate e rimaste a zero', () => {
    const righe = righeModello([
      { item_id: 'campari', item_name: 'Campari', supplier_id: 'nova', qty: 0 },
      { item_id: 'gin', item_name: 'Gin Mare', supplier_id: 'enofel', qty: 1 },
    ])
    expect(righe.map((r) => r.item_id)).toEqual(['gin'])
  })
})

describe('un modello ricavato da un ordine già fatto', () => {
  // Un ordine è di un fornitore solo (REQ-MAG-037): il giro intero si rifà
  // applicando più modelli, perché applicare SOMMA a quello che c'è già.
  it('riprende i COLLI ordinati, non i pezzi entrati in magazzino', () => {
    const ordine = {
      supplier_id: 'nova',
      lines: [
        // Cartone da 24: due colli sono 48 bottiglie. Riprendere 48 come
        // colli vorrebbe dire ordinarne 1152.
        { item_id: 'campari', name: 'Campari', supplier_id: 'nova', qty_packages: 48, colli: 2, pezzi_per_collo: 24 },
        // Riga scritta prima di REQ-MAG-040: senza `colli` un collo è un
        // pezzo, che è il caso degenere della scala e non un'eccezione.
        { item_id: 'gin', name: 'Gin Mare', supplier_id: 'enofel', qty_packages: 3 },
      ],
    }
    expect(righeModelloDaOrdine(ordine)).toEqual([
      { item_id: 'campari', item_name: 'Campari', supplier_id: 'nova', qty: 2 },
      { item_id: 'gin', item_name: 'Gin Mare', supplier_id: 'enofel', qty: 3 },
    ])
  })

  it('il fornitore in testa vale per le righe che non lo portano', () => {
    const righe = righeModelloDaOrdine({
      supplier_id: 'nova',
      lines: [{ item_id: 'campari', name: 'Campari', qty_packages: 1 }],
    })
    expect(righe[0].supplier_id).toBe('nova')
  })
})

describe('applicare un modello', () => {
  it('rimette prodotti, fornitore e quantità sulla riga giusta', () => {
    const esito = applica([
      { item_id: 'campari', item_name: 'Campari', supplier_id: 'nova', qty: 3 },
      { item_id: 'gin', item_name: 'Gin Mare', supplier_id: 'enofel', qty: 1 },
    ])
    expect(esito.riprese).toBe(2)
    expect(esito.avvisi).toEqual([])
    expect(esito.selezioni['campari|nova']).toEqual({ qty: '3', supplier_id: 'nova' })
    expect(esito.selezioni['gin|enofel']).toEqual({ qty: '1', supplier_id: 'enofel' })
  })

  // LA REGOLA CHE NON SI TOCCA: nessun prezzo passa dal modello. `totale` è
  // il campo della correzione a mano, e senza di lui la riga si valorizza dal
  // listino del fornitore, ogni volta.
  it('non porta nessun prezzo: la selezione non ha il totale corretto', () => {
    const esito = applica([{ item_id: 'campari', supplier_id: 'nova', qty: 3 }])
    expect(esito.selezioni['campari|nova']).not.toHaveProperty('totale')
  })

  // «Le due cose rispondono a domande diverse e devono poter convivere»: la
  // precompilazione guarda le scorte, il modello l'abitudine.
  it('si somma a quello che era già spuntato', () => {
    const esito = applica([{ item_id: 'gin', supplier_id: 'enofel', qty: 1 }], {
      'campari|nova': { qty: '5', supplier_id: 'nova' },
    })
    expect(esito.selezioni['campari|nova']).toEqual({ qty: '5', supplier_id: 'nova' })
    expect(esito.selezioni['gin|enofel'].qty).toBe('1')
  })

  it('sulle sue righe vince la quantità del modello', () => {
    const esito = applica([{ item_id: 'campari', supplier_id: 'nova', qty: 3 }], {
      'campari|nova': { qty: '1', supplier_id: 'nova' },
    })
    expect(esito.selezioni['campari|nova'].qty).toBe('3')
  })

  it('un prodotto senza fornitore nel modello resta senza fornitore', () => {
    const esito = applica([{ item_id: 'tonica', supplier_id: null, qty: 6 }])
    expect(esito.selezioni['tonica|']).toEqual({ qty: '6', supplier_id: null })
    expect(esito.avvisi).toEqual([])
  })
})

// ── QUANDO IL MONDO È CAMBIATO ───────────────────────────────────────
//
// «Un modello può contenere un prodotto che non esiste più, o un fornitore
// che non lo vende più (riga di listino tolta). Chi lo applica deve vedere
// cosa non è stato ripreso e perché».
describe('quello che non c’è più si dice', () => {
  it('il prodotto sparito dal magazzino non si riprende, e si nomina lo stesso', () => {
    const esito = applica([
      { item_id: 'sparito', item_name: 'Vecchio Amaro', supplier_id: 'nova', qty: 2 },
      { item_id: 'gin', supplier_id: 'enofel', qty: 1 },
    ])
    expect(esito.riprese).toBe(1)
    expect(esito.totali).toBe(2)
    const avviso = esito.avvisi[0]
    expect(avviso.motivo).toBe(MOTIVI.prodotto_sparito)
    expect(avviso.ripresa).toBe(false)
    // Il nome salvato nel modello serve QUI, ed è l'unico posto in cui
    // serve: senza, l'avviso direbbe un id.
    expect(avviso.nome).toBe('Vecchio Amaro')
    expect(Object.keys(esito.selezioni)).toEqual(['gin|enofel'])
  })

  it('il fornitore che non lo vende più: il prodotto si riprende, il prezzo no', () => {
    // Il modello dice Gin da NOVA, ma sul listino di Nova il gin non c'è.
    const esito = applica([{ item_id: 'gin', item_name: 'Gin Mare', supplier_id: 'nova', qty: 2 }])
    expect(esito.riprese).toBe(1)
    // Si posa sull'unica riga che quel prodotto ha, tenendo il fornitore
    // scelto: si può ordinare a chiunque, anche fuori listino.
    expect(esito.selezioni['gin|enofel']).toEqual({ qty: '2', supplier_id: 'nova' })
    expect(esito.avvisi[0]).toMatchObject({
      motivo: MOTIVI.fuori_listino,
      ripresa: true,
      fornitore: 'Nova',
    })
  })

  it('il fornitore cancellato dall’anagrafica lascia la riga senza fornitore', () => {
    const esito = applica([{ item_id: 'campari', supplier_id: 'chiuso', qty: 1 }])
    // Un id che non corrisponde più a nessuno non si riscrive sulla riga:
    // sarebbe un ordine intestato al vuoto. Il prodotto si posa sulla prima
    // riga che ha in tabella, e il fornitore si riscegli a mano.
    expect(esito.selezioni['campari|enofel']).toEqual({ qty: '1', supplier_id: null })
    expect(esito.avvisi[0].motivo).toBe(MOTIVI.fornitore_sparito)
    expect(esito.avvisi[0].ripresa).toBe(true)
  })

  it('il prodotto messo fuori linea nel frattempo si riprende, ma va detto', () => {
    const esito = applica([{ item_id: 'amaro', supplier_id: 'nova', qty: 1 }])
    expect(esito.selezioni['amaro|nova'].qty).toBe('1')
    expect(esito.avvisi[0].motivo).toBe(MOTIVI.fuori_linea)
    expect(esito.avvisi[0].ripresa).toBe(true)
  })

  it('due righe che cadrebbero sulla stessa riga: la seconda non si perde in silenzio', () => {
    // Il gin sta sul listino del solo Enofel: due righe del modello che lo
    // chiedono ad altri ricadono tutte e due su quella riga, e la seconda
    // cancellerebbe la quantità della prima.
    const esito = applica([
      { item_id: 'gin', item_name: 'Gin Mare', supplier_id: 'nova', qty: 4 },
      { item_id: 'gin', item_name: 'Gin Mare', supplier_id: 'chiuso', qty: 9 },
    ])
    expect(esito.selezioni['gin|enofel'].qty).toBe('4')
    // Il primo avviso è che Nova quel gin non lo vende; il secondo è la riga
    // che non è stata ripresa perché sarebbe finita sopra la prima.
    expect(esito.avvisi.map((a) => a.motivo)).toEqual([MOTIVI.fuori_listino, MOTIVI.doppione])
    expect(esito.riprese).toBe(1)
  })

  it('ogni motivo ha una frase che dice cosa è successo', () => {
    expect(testoAvviso({ nome: 'Campari', motivo: MOTIVI.prodotto_sparito })).toContain(
      'non è più in magazzino'
    )
    expect(
      testoAvviso({ nome: 'Gin Mare', fornitore: 'Nova', motivo: MOTIVI.fuori_listino })
    ).toContain('Nova non lo ha più a listino')
    expect(testoAvviso({ nome: 'Amaro', motivo: MOTIVI.fuori_linea })).toContain('fuori linea')
  })
})

describe('il nome del modello', () => {
  it('si ripulisce, e senza nome non c’è modello', () => {
    expect(nomeModello('  Giro della settimana  ')).toBe('Giro della settimana')
    expect(nomeModello('   ')).toBe('')
    expect(nomeModello(null)).toBe('')
  })

  // Due voci con lo stesso nome in tendina sono il modo più rapido per
  // applicare quella sbagliata: salvare con un nome già usato aggiorna.
  it('riconosce il modello che porta già quel nome, comunque scritto', () => {
    const modelli = [{ id: 'm1', nome: 'Giro della settimana' }]
    expect(modelloConNome(modelli, 'giro della SETTIMANA')?.id).toBe('m1')
    expect(modelloConNome(modelli, 'Inizio mese')).toBe(null)
    expect(modelloConNome(modelli, '  ')).toBe(null)
  })
})
