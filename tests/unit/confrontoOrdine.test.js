'use strict'

// ── I TRE ELENCHI E I DUE CONFRONTI (REQ-MAG-038) ────────────────────
//
// «Quando l'ordine arriva deve poter MODIFICARE L'ORDINE in base a quello
// che ha effettivamente ricevuto», e «quando associerà la fattura potrà
// verificare se ci sono gli stessi articoli e i prezzi rispetto a quanto
// indicato nell'ordine effettuato e nell'ordine ricevuto» (utente, 27/08).
//
// TRE ELENCHI CHE NON VANNO CONFUSI: ordinato, ricevuto, fatturato. Se il
// ricevuto sovrascrivesse l'ordinato, la cassa mancante non la vedrebbe
// nessuno — e la si pagherebbe in fattura.

import { describe, it, expect } from 'vitest'
import {
  ETICHETTA_PROBLEMA,
  fatturaConRighe,
  percheNonSiChiude,
  prezziDaAllineare,
  prospettoOrdine,
  riconciliato,
  righeOrdinate,
  righeRicevute,
  scartiDiMerce,
  scartiDiPrezzo,
  totaliProspetto,
} from '../../src/lib/confrontoOrdine.js'

// Sei Campari chiesti a 12, ne sono arrivati quattro e la bolla diceva 13,5.
const ORDINE = {
  id: 'po-1',
  supplier_id: 'nova',
  status: 'ricevuto',
  lines: [
    {
      item_id: 'campari',
      name: 'Campari',
      qty_packages: 6,
      qty_received: 4,
      unit_cost: 13.5,
      unit_cost_ordinato: 12,
      stato: 'consegnato',
    },
  ],
}

const fattura = (patch = {}) => ({
  id: 'inv-1',
  supplier_id: 'nova',
  amount: 65.88,
  paid: false,
  lines: [{ item_id: 'campari', name: 'Campari', qty_packages: 4, unit_cost: 13.5, vat: 22 }],
  ...patch,
})

describe('l’ordinato non si perde quando arriva la merce', () => {
  it('l’elenco ordinato tiene i pezzi e il prezzo di quando è partito', () => {
    expect(righeOrdinate(ORDINE)).toEqual([
      { item_id: 'campari', name: 'Campari', qty: 6, prezzo: 12 },
    ])
  })

  it('il ricevuto è quello che c’è arrivato, al prezzo della bolla', () => {
    expect(righeRicevute(ORDINE)).toEqual([
      { item_id: 'campari', name: 'Campari', qty: 4, prezzo: 13.5 },
    ])
  })

  // Una riga ancora «richiesta» non è arrivata in quantità zero: è merce che
  // deve ancora venire, e metterla a zero direbbe che il fornitore ha
  // mancato una consegna che non ha ancora fatto.
  it('una riga ancora in attesa non compare fra le ricevute', () => {
    const aperto = { lines: [{ item_id: 'gin', name: 'Gin', qty_packages: 2, unit_cost: 20 }] }
    expect(righeRicevute(aperto)).toEqual([])
    expect(righeOrdinate(aperto)).toHaveLength(1)
  })

  // Le consegne registrate prima di questa voce non hanno `qty_received`: è
  // arrivato quello che si è chiesto, che è anche il caso normale.
  it('senza il campo del ricevuto vale la quantità ordinata', () => {
    const vecchio = { lines: [{ item_id: 'x', name: 'X', qty_packages: 3, unit_cost: 5, stato: 'consegnato' }] }
    expect(righeRicevute(vecchio)[0].qty).toBe(3)
    expect(righeOrdinate(vecchio)[0].prezzo).toBe(5)
  })
})

describe('il primo confronto: i prezzi', () => {
  it('dice di quanto è salito dal prezzo dell’ordine a quello in fattura', () => {
    const riga = prospettoOrdine(ORDINE, fattura())[0]
    expect(riga.prezzo_ordine).toBe(12)
    expect(riga.prezzo_fattura).toBe(13.5)
    expect(riga.differenza).toBeCloseTo(1.5, 2)
    expect(riga.problemi).toContain('prezzo_diverso')
    expect(scartiDiPrezzo(prospettoOrdine(ORDINE, fattura()))).toHaveLength(1)
  })

  // «Non si sa» e «non è cambiato» sono due risposte diverse e non vanno
  // scritte allo stesso modo: senza fattura non c'è nessuna differenza da
  // mostrare, e uno zero direbbe che il prezzo è confermato.
  it('senza fattura la differenza non è zero: non c’è', () => {
    const riga = prospettoOrdine(ORDINE, null)[0]
    expect(riga.differenza).toBeNull()
    expect(riga.problemi).not.toContain('prezzo_diverso')
  })

  // «Il confronto non finisce in un avviso»: il prezzo della fattura allinea
  // il listino, se no lo stesso scarto ricompare al giro dopo e l'avviso
  // diventa rumore che si impara a ignorare.
  it('e da lì escono i prezzi da portare sul listino', () => {
    expect(prezziDaAllineare(ORDINE, fattura())).toEqual([
      { item_id: 'campari', name: 'Campari', prezzo: 13.5, prezzo_prima: 12 },
    ])
  })

  it('un prezzo uguale non fa lavoro: non c’è niente da allineare', () => {
    const uguale = fattura({ lines: [{ item_id: 'campari', name: 'Campari', qty_packages: 4, unit_cost: 12 }] })
    expect(prezziDaAllineare(ORDINE, uguale)).toEqual([])
  })
})

describe('il secondo confronto: la merce', () => {
  it('dice cosa è arrivato in meno, e non è un giudizio', () => {
    const riga = prospettoOrdine(ORDINE, fattura())[0]
    expect(riga.ordinato).toBe(6)
    expect(riga.ricevuto).toBe(4)
    expect(riga.fatturato).toBe(4)
    expect(riga.problemi).toContain('meno_merce')
    expect(ETICHETTA_PROBLEMA.meno_merce).toBe('arrivato meno del richiesto')
  })

  it('un prodotto in fattura che non è arrivato si vede', () => {
    const conIntruso = fattura({
      lines: [
        ...fattura().lines,
        { item_id: 'gin', name: 'Gin Mare', qty_packages: 1, unit_cost: 20 },
      ],
    })
    const gin = prospettoOrdine(ORDINE, conIntruso).find((r) => r.item_id === 'gin')
    expect(gin.problemi).toContain('solo_in_fattura')
  })

  it('e una quantità fatturata diversa da quella arrivata pure', () => {
    const sei = fattura({ lines: [{ item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12 }] })
    const riga = prospettoOrdine(ORDINE, sei)[0]
    expect(riga.problemi).toContain('quantita_diversa')
    expect(scartiDiMerce([riga])).toHaveLength(1)
  })

  // Per anni una fattura è stata solo una testata, e lo è ancora ogni volta
  // che nessuno ci mette dentro i prodotti: dirlo è meglio che mostrare un
  // elenco di prodotti «mancanti in fattura» che non manca nessuno.
  it('una fattura senza righe non fa nascere prodotti mancanti', () => {
    const testata = fattura({ lines: [] })
    expect(fatturaConRighe(testata)).toBe(false)
    const riga = prospettoOrdine(ORDINE, testata)[0]
    expect(riga.fatturato).toBeNull()
    expect(riga.problemi).not.toContain('non_fatturato')
  })

  it('i totali dei tre elenchi si leggono accanto', () => {
    const t = totaliProspetto(ORDINE, fattura())
    expect(t.ordinato).toBeCloseTo(72, 2)
    expect(t.ricevuto).toBeCloseTo(54, 2)
    expect(t.fatturato).toBeCloseTo(54, 2)
    expect(t.documento).toBeCloseTo(65.88, 2)
  })
})

describe('la riconciliazione, e la chiusura che ne dipende', () => {
  // Tutto torna: quattro chiesti, quattro arrivati, quattro fatturati allo
  // stesso prezzo.
  const TORNA = {
    ...ORDINE,
    lines: [{ ...ORDINE.lines[0], qty_packages: 4, unit_cost_ordinato: 13.5 }],
  }

  it('con i tre elenchi che tornano si riconcilia', () => {
    expect(riconciliato(TORNA, fattura())).toBe(true)
    expect(percheNonSiChiude(TORNA, fattura())).toBeNull()
  })

  it('con uno scarto non si riconcilia, e il tasto dice perché', () => {
    expect(riconciliato(ORDINE, fattura())).toBe(false)
    expect(percheNonSiChiude(ORDINE, fattura())).toMatch(/non tornano/)
  })

  // Gli elenchi da far tornare sono tre: con due non si sa se il fornitore
  // ha fatturato quello che ha portato.
  it('senza documento non c’è niente da riconciliare', () => {
    expect(riconciliato(TORNA, null)).toBe(false)
    expect(percheNonSiChiude(TORNA, null)).toMatch(/Manca il documento/)
  })

  it('e con la merce ancora per strada nemmeno', () => {
    const aperto = { ...TORNA, status: 'inviato', lines: [{ ...TORNA.lines[0], stato: 'richiesto' }] }
    expect(percheNonSiChiude(aperto, fattura())).toMatch(/non è ancora arrivata/)
  })

  // È il caso normale delle fatture registrate a mano: righe non ce ne sono,
  // ma i soldi si confrontano lo stesso. L'importo del documento è lordo e
  // il netto dell'ordine no, quindi si accetta quello che cade nella forbice
  // fra i due: più stretti si direbbe «non torna» a un documento che torna.
  it('una fattura senza righe si riconcilia sugli importi', () => {
    const testata = fattura({ lines: [], amount: 65.88 })
    expect(riconciliato(TORNA, testata)).toBe(true)
    // Fuori forbice: quel documento parla di un'altra merce.
    expect(riconciliato(TORNA, fattura({ lines: [], amount: 300 }))).toBe(false)
  })
})
