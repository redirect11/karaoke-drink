'use strict'

// ── COLLI E PEZZI: UNA SCALA SOLA (REQ-MAG-040) ──────────────────────
//
// Trovato dall'utente il 27/08/2026 provando la tabella del nuovo ordine:
// «bisogna distinguere colli e pezzi in qualche modo. Da un fornitore le
// Bjorne vanno a pezzo, da un altro vanno a collo (cartone da X bottiglie):
// hai messo Bjorne 8 pz ma il prezzo unitario del fornitore è AL COLLO, che
// è 25 euro, e viene fuori 200 euro per 8 pezzi».
//
// Questo è il file che sorveglia quel conto, ed è la parte che sbagliata fa
// uscire un ordine da 200 euro invece che da 8,35. La scala è una sola —
// COLLO → PEZZI → unità di contenuto — e chi si compra a bottiglia è il caso
// degenere di un collo da uno: qui dentro si prova che moltiplicare per uno
// non cambia niente, perché è quella la ragione per cui non ci sono due
// strade nel codice.
//
// I numeri non sono inventati: vengono da `scripts/colli-noti.json`, le
// dieci righe riconosciute come colli sui fogli veri di Flavio.

import { describe, it, expect } from 'vitest'
import {
  PEZZI_PER_COLLO_PREDEFINITO,
  UNITA_PREZZO_PREDEFINITA,
  aCollo,
  catalogoOrdinabile,
  pezziPerCollo,
  piuEconomica,
  prezzoAlPezzo,
  scalaListino,
  unitaPrezzo,
} from '../../src/lib/listini.js'
import {
  didascaliaListino,
  etichettaQuantita,
  listinoDelFornitore,
  preselezioneIniziale,
  prezzoDiListino,
  pezziOrdinati,
  righeOrdine,
  righeScelte,
} from '../../src/lib/composizioneOrdine.js'
import { purchaseOrderTotals } from '../../src/lib/warehouse.js'

// La Bjorne vera: da MAR a bottiglia, da FONT a cartone da 24 a 25,05.
// L'app conosceva già il costo del pezzo — 1,2333 — e 25,05 / 24 fa 1,0437,
// che è meno: comprare a cassa conviene, ed è quello che ci si aspetta.
const BJORNE = {
  id: 'bjorne',
  name: 'Bjorne',
  unit: 'pz',
  stock: 0,
  low_threshold: 8,
  cost: 1.2333,
  vat: 22,
  kind: 'scorta',
  status: 'linea',
}
const TANQUERAY = {
  id: 'tanqueray',
  name: 'Tanqueray',
  unit: 'pz',
  stock: 0,
  low_threshold: 2,
  package_size: 700,
  cost: 14,
  vat: 22,
  kind: 'scorta',
  status: 'linea',
}
const MAR = { id: 'mar', name: 'MAR', color: '#e74c3c' }
const FONT = { id: 'font', name: 'FONT', color: '#3498db' }
const FORNITORI = [MAR, FONT]

const A_COLLO = {
  id: 'font__bjorne',
  supplier_id: 'font',
  item_id: 'bjorne',
  price: 25.05,
  pezzi_per_collo: 24,
}
const A_PEZZO = { id: 'mar__bjorne', supplier_id: 'mar', item_id: 'bjorne', price: 1.2333 }
const LISTINI = [A_COLLO, A_PEZZO]

const perChiave = (items = [BJORNE], listini = LISTINI) =>
  new Map(catalogoOrdinabile({ items, listini, suppliers: FORNITORI }).map((r) => [r.key, r]))

// I centesimi: sotto ci sono divisioni, e confrontare due float per
// uguaglianza esatta sarebbe una prova che passa o no a seconda del vento.
const cent = (n) => Math.round(n * 100) / 100

describe('la scala vale sempre, e il collo vuoto è un collo da uno', () => {
  // LA DIFESA CHE CONTA. Le 367 righe di listino già in archivio quel campo
  // non ce l'hanno: se un conto legge `undefined` e moltiplica esce un ordine
  // da zero pezzi, se divide esce Infinity. Si legge da UNA funzione sola, e
  // questa è la prova che risponde 1.
  it('una riga senza il campo vale un collo da un pezzo', () => {
    expect(pezziPerCollo({ price: 10 })).toBe(PEZZI_PER_COLLO_PREDEFINITO)
    expect(pezziPerCollo({ price: 10 })).toBe(1)
    expect(pezziPerCollo(null)).toBe(1)
    expect(pezziPerCollo(undefined)).toBe(1)
    expect(pezziPerCollo({ pezzi_per_collo: null })).toBe(1)
    // Zero e i numeri storti sono la stessa cosa: un collo che non contiene
    // niente non esiste, e diviso zero non si fa.
    expect(pezziPerCollo({ pezzi_per_collo: 0 })).toBe(1)
    expect(pezziPerCollo({ pezzi_per_collo: -3 })).toBe(1)
    expect(pezziPerCollo({ pezzi_per_collo: 'ventiquattro' })).toBe(1)
    expect(pezziPerCollo({ pezzi_per_collo: '24' })).toBe(24)
  })

  // L'UNIFORMITÀ STA NEI CONTI, NON NELLE PAROLE: «1 collo di Tanqueray» a
  // schermo non lo dice nessuno, e `aCollo` è ciò che governa le parole.
  it('«collo» si dice solo dove un collo c’è davvero', () => {
    expect(aCollo(A_COLLO)).toBe(true)
    expect(aCollo(A_PEZZO)).toBe(false)
    expect(aCollo({ pezzi_per_collo: 1 })).toBe(false)
    expect(etichettaQuantita({ qty: 8, perCollo: 1 })).toBe('8 pz')
    expect(etichettaQuantita({ qty: 8 })).toBe('8 pz')
    expect(etichettaQuantita({ qty: 2, perCollo: 24 })).toBe('2 colli · 48 pz')
    expect(etichettaQuantita({ qty: 1, perCollo: 12 })).toBe('1 collo · 12 pz')
  })

  it('moltiplicare per un collo da uno non cambia niente', () => {
    expect(pezziOrdinati(8, 1)).toBe(8)
    expect(pezziOrdinati(8, null)).toBe(8)
    expect(pezziOrdinati(2, 24)).toBe(48)
  })
})

describe('il prezzo del collo si salva, quello del pezzo si ricava', () => {
  // IL CONTO CHE MANCAVA. 25,05 al cartone da 24 fa 1,0437 a bottiglia: otto
  // Bjorne da FONT costano 8,35 euro, non 200.
  it('otto Bjorne da FONT costano 8,35, non 200', () => {
    const alPezzo = prezzoAlPezzo(A_COLLO)
    expect(cent(alPezzo)).toBe(1.04)
    expect(cent(alPezzo * 8)).toBe(8.35)
    // Il difetto da cui questa voce è nata, scritto per esteso: moltiplicare
    // i pezzi voluti per il prezzo del collo.
    expect(cent(A_COLLO.price * 8)).toBe(200.4)
  })

  // Il prezzo al pezzo ricavato coincide col costo che l'app già conosceva:
  // è la prova del nove della regola con cui i dieci colli sono stati
  // riconosciuti sui fogli (MBU California, 19,98 / 12 = 1,665 contro 1,67).
  it('il prezzo ricavato torna col costo già in archivio', () => {
    const mbu = { price: 19.98, pezzi_per_collo: 12 }
    expect(prezzoAlPezzo(mbu)).toBeCloseTo(1.67, 2)
  })

  // NON SI CONGELA IL PREZZO AL PEZZO: 25,05 / 24 è 1,04375, e quel numero
  // arrotondato e rimoltiplicato per 24 dà 24,96 — il totale dell'ordine non
  // coinciderebbe più con la fattura.
  it('il collo × il suo prezzo torna alla cifra della fattura', () => {
    const scelte = righeScelte(
      { 'bjorne|font': { qty: '2', supplier_id: 'font' } },
      { perChiave: perChiave(), listini: LISTINI, suppliers: FORNITORI }
    )
    expect(scelte[0].totale).toBe(50.1) // 2 × 25,05, esatto
    expect(cent(purchaseOrderTotals(righeOrdine(scelte, { listini: LISTINI })).net)).toBe(50.1)
    // Il prezzo al pezzo arrotondato NON ci arriverebbe.
    expect(cent(cent(25.05 / 24) * 24)).toBe(24.96)
  })

  // Senza riga di listino si ricade sul costo del prodotto, che è un prezzo
  // al pezzo: cioè un collo da uno. Vale per 378 prodotti su 388.
  it('senza listino il costo del prodotto è un collo da uno', () => {
    const l = listinoDelFornitore(TANQUERAY, [], null)
    expect(l).toMatchObject({ perCollo: 1, aCollo: false, prezzoCollo: 14, prezzoPezzo: 14 })
    expect(prezzoDiListino(TANQUERAY, [], null)).toBe(14)
  })
})

describe('il confronto fra fornitori si fa al pezzo', () => {
  // Fra 1,2333 a bottiglia e 25,05 al cartone da 24 il più economico è il
  // cartone. Confrontando i due prezzi come sono scritti sembrerebbe che il
  // cartone costi venti volte tanto — ed è il confronto per cui il listino
  // esiste.
  it('il cartone da 24 è più economico della bottiglia, non venti volte più caro', () => {
    expect(piuEconomica(LISTINI).supplier_id).toBe('font')
  })
})

describe('l’ordine si conta in colli, il magazzino in pezzi', () => {
  it('due cartoni sono 48 bottiglie sull’ordine salvato', () => {
    const scelte = righeScelte(
      { 'bjorne|font': { qty: '2', supplier_id: 'font' } },
      { perChiave: perChiave(), listini: LISTINI, suppliers: FORNITORI }
    )
    expect(scelte[0]).toMatchObject({ qty: 2, perCollo: 24, aCollo: true, pezzi: 48 })
    const [riga] = righeOrdine(scelte, { listini: LISTINI })
    // `qty_packages` è quello che `caricoDaConfezioni` e `registraAcquisto`
    // hanno sempre inteso: PEZZI. Il magazzino non impara un'unità nuova.
    expect(riga.qty_packages).toBe(48)
    expect(riga.colli).toBe(2)
    expect(riga.pezzi_per_collo).toBe(24)
    expect(riga.prezzo_collo).toBe(25.05)
    expect(riga.unit_cost).toBeCloseTo(1.04375, 5)
  })

  it('chi si compra a pezzo salva esattamente quello che salvava prima', () => {
    const scelte = righeScelte(
      { 'bjorne|mar': { qty: '8', supplier_id: 'mar' } },
      { perChiave: perChiave(), listini: LISTINI, suppliers: FORNITORI }
    )
    const [riga] = righeOrdine(scelte, { listini: LISTINI })
    expect(riga.qty_packages).toBe(8)
    expect(riga.unit_cost).toBe(1.2333)
    // Il collo da uno c'è, e non dice niente di nuovo.
    expect(riga.pezzi_per_collo).toBe(1)
    expect(riga.colli).toBe(8)
  })

  // Il totale corretto a mano vale per quello che si sta ordinando, e da lì
  // si ricava il prezzo del pezzo che finisce sull'ordine: si divide per i
  // PEZZI, non per i colli.
  it('il totale corretto a mano si divide per i pezzi', () => {
    const scelte = righeScelte(
      { 'bjorne|font': { qty: '2', supplier_id: 'font', totale: '48' } },
      { perChiave: perChiave(), listini: LISTINI, suppliers: FORNITORI }
    )
    expect(scelte[0].totale).toBe(48)
    expect(scelte[0].unit_cost).toBe(1) // 48 / 48 pezzi
    expect(righeOrdine(scelte, { listini: LISTINI })[0].prezzo_collo).toBe(24)
  })
})

// La soglia di riordino è in PEZZI e il suggerimento riporta la giacenza a
// due volte la soglia (`suggestedPackages`): con soglia 8 e zero in casa sono
// 16 bottiglie. Da FONT però si comprano cartoni da 24, e proporre «16»
// vorrebbe dire sedici cartoni — 384 bottiglie, il parente stretto delle 192
// da cui usciva l'ordine da 200 euro.
describe('la preselezione propone colli, non pezzi', () => {
  it('i pezzi che mancano diventano un cartone, non sedici', () => {
    const catalogo = catalogoOrdinabile({
      items: [BJORNE],
      listini: [A_COLLO],
      suppliers: FORNITORI,
    })
    expect([...preselezioneIniziale(catalogo).values()]).toEqual([1])
  })

  // Si arrotonda PER ECCESSO: mezzo cartone non lo vende nessuno. Soglia 25
  // vuol dire 50 bottiglie da riportare in casa, cioè tre cartoni da 24 —
  // non due, che ne lascerebbero due fuori.
  it('cinquanta pezzi che mancano diventano tre cartoni', () => {
    const tanti = { ...BJORNE, low_threshold: 25 }
    const catalogo = catalogoOrdinabile({
      items: [tanti],
      listini: [{ ...A_COLLO, item_id: 'bjorne' }],
      suppliers: FORNITORI,
    })
    expect([...preselezioneIniziale(catalogo).values()]).toEqual([3])
  })

  it('da chi vende a pezzo la proposta resta quella di prima', () => {
    const catalogo = catalogoOrdinabile({
      items: [BJORNE],
      listini: [A_PEZZO],
      suppliers: FORNITORI,
    })
    expect([...preselezioneIniziale(catalogo).values()]).toEqual([16])
  })
})

// ── IL TERZO GRADINO: L'UNITÀ IN CUI IL FORNITORE PREZZA ─────────────
//
// Il conto è sempre lo stesso, tre moltiplicazioni e nessun ramo speciale:
//
//     prezzo per unità di contenuto × contenuto di un pezzo
//       × pezzi per collo = prezzo del collo
//
// Vino a 9 €/litro in bottiglie da 75 cl: 9 × 0,75 = 6,75 a bottiglia;
// cartone da 6 → il collo costa 40,50.
describe('l’unità in cui il fornitore prezza', () => {
  const VINO = {
    id: 'vino',
    name: 'Falanghina',
    unit: 'pz',
    stock: 0,
    low_threshold: 2,
    package_size: 750,
    content_unit: 'ml',
    cost: 6.75,
    vat: 22,
    kind: 'scorta',
    status: 'linea',
  }

  it('il valore di partenza è «collo», e le righe di ieri restano quelle di ieri', () => {
    expect(UNITA_PREZZO_PREDEFINITA).toBe('collo')
    expect(unitaPrezzo({ price: 10 })).toBe('collo')
    expect(unitaPrezzo(null)).toBe('collo')
    expect(unitaPrezzo({ unita_prezzo: 'al chilo e mezzo' })).toBe('collo')
    expect(unitaPrezzo({ unita_prezzo: 'L' })).toBe('l')
  })

  it('nove euro al litro fanno 6,75 a bottiglia e 40,50 il cartone da sei', () => {
    const riga = { price: 9, unita_prezzo: 'l', pezzi_per_collo: 6 }
    const s = scalaListino(riga, VINO)
    expect(s.contenuto).toBe(0.75)
    expect(cent(s.prezzoPezzo)).toBe(6.75)
    expect(cent(s.prezzoCollo)).toBe(40.5)
    expect(s.problema).toBe(null)
  })

  // Il fornitore che vende a cartoni ma quota la bottiglia: il collo si
  // ricava all'insù invece che all'ingiù. Stessa scala, letta dall'altro capo.
  it('un prezzo al pezzo moltiplica per il collo invece di dividere', () => {
    const s = scalaListino({ price: 1.05, unita_prezzo: 'pz', pezzi_per_collo: 24 }, BJORNE)
    expect(s.prezzoPezzo).toBe(1.05)
    expect(cent(s.prezzoCollo)).toBe(25.2)
  })

  // SE IL CONTENUTO NON È DICHIARATO IL CONTO NON SI FA, e non esce un numero
  // inventato: esce il perché, con le parole che il magazzino usa già per la
  // stessa mancanza (`motivoNonMigrabile`). Un prezzo inventato diventa un
  // ordine, e poi una fattura che non torna.
  it('senza contenuto dichiarato non esce un prezzo, esce il perché', () => {
    const s = scalaListino({ price: 9, unita_prezzo: 'l' }, BJORNE)
    expect(s.prezzoPezzo).toBe(null)
    expect(s.prezzoCollo).toBe(null)
    expect(s.problema).toMatch(/non si sa quanto contiene/)
  })

  // NIENTE CONVERSIONI FRA PESO E VOLUME: in questo progetto non esistono, si
  // passa dalla resa che dichiara chi compra. Un prezzo al chilo su una cosa
  // che si misura in millilitri è una riga scritta male, non un conto da fare.
  it('un prezzo al chilo su un liquido si rifiuta invece di convertire', () => {
    const s = scalaListino({ price: 9, unita_prezzo: 'kg' }, VINO)
    expect(s.prezzoPezzo).toBe(null)
    expect(s.problema).toMatch(/due misure diverse/)
  })

  // Chi si compra a pezzo e non ha contenuto da dichiarare — una busta di
  // patatine, una «U» — non deve inciampare in niente: il suo prezzo è al
  // collo, e la scala non gli chiede nient'altro.
  it('chi non ha contenuto da dichiarare non incontra nessun ostacolo', () => {
    const patatine = { id: 'p', name: 'Patatine', unit: 'pz', stock: 0, cost: 1.5 }
    const s = scalaListino({ price: 1.5 }, patatine)
    expect(s).toMatchObject({ prezzoPezzo: 1.5, prezzoCollo: 1.5, problema: null })
  })

  // DA DOVE VIENE IL PREZZO DEL PEZZO si legge sotto la colonna: è la difesa
  // che vale più di tutte, perché per correggere un numero sbagliato bisogna
  // sapere da quale è uscito. Dove non c'è niente da spiegare non si scrive
  // niente, e la riga resta quella di sempre.
  it('la didascalia dice il prezzo scritto e il collo, e tace dove non serve', () => {
    expect(didascaliaListino(scalaListino({ price: 14 }, VINO))).toBe(null)
    expect(didascaliaListino(scalaListino({ price: 25.05, pezzi_per_collo: 24 }, BJORNE))).toBe(
      'collo da 24: 25,05 €'
    )
    expect(
      didascaliaListino(scalaListino({ price: 9, unita_prezzo: 'l', pezzi_per_collo: 6 }, VINO))
    ).toBe('9,00 €/L · collo da 6: 40,50 €')
  })
})
