'use strict'

// LA TABELLA DEL NUOVO ORDINE (REQ-MAG-036).
//
// La schermata di prima l'utente l'ha bocciata il 27/08/2026 — «non mi piace
// LA DOPPIA LISTA e quei box sono POSTICCI» — e quella nuova è una tabella
// sola con l'ordine di fianco. Qui si provano i conti che la governano:
// ordinamento delle colonne, preselezione di quello che manca, finestra
// delle righe caricate, prezzi, e il raggruppamento per fornitore
// dell'ordine in composizione.
//
// Sono conti che decidono cosa si compra e quanto si spende: si provano coi
// numeri, senza Firebase e senza schermata.

import { describe, it, expect } from 'vitest'
import {
  PASSO_RIGHE,
  ordinaCatalogo,
  ordiniDaCreare,
  preselezioneIniziale,
  uniscePreselezione,
  prezzoDiListino,
  prezzoDaTotale,
  prossimaFinestra,
  raggruppaPerFornitore,
  righeOrdine,
  righeScelte,
  totaleRiga,
  vicinoAlFondo,
} from '../../src/lib/composizioneOrdine.js'
import { catalogoOrdinabile } from '../../src/lib/listini.js'

const NOVA = { id: 'nova', name: 'Nova', color: '#e74c3c' }
const ENOFEL = { id: 'enofel', name: 'Enofel', color: '#3498db' }
const FORNITORI = [NOVA, ENOFEL]

// Un magazzino piccolo ma con tutti i casi che contano: uno esaurito, uno
// sotto soglia, uno pieno, uno fuori linea e finito.
const CAMPARI = { id: 'campari', name: 'Campari', unit: 'pz', stock: 0, low_threshold: 2, package_size: 700, cost: 12, vat: 22, kind: 'scorta' }
const GIN = { id: 'gin', name: 'Gin Mare', unit: 'pz', stock: 1, low_threshold: 2, package_size: 700, cost: 30, vat: 22, kind: 'scorta' }
const RUM = { id: 'rum', name: 'Rum Zacapa', unit: 'pz', stock: 9, low_threshold: 2, package_size: 700, cost: 40, vat: 22, kind: 'scorta' }
const AMARO = { id: 'amaro', name: 'Amaro fuori linea', unit: 'pz', stock: 0, low_threshold: 3, package_size: 700, cost: 9, vat: 22, kind: 'scorta', status: 'out' }
const ARTICOLI = [CAMPARI, GIN, RUM, AMARO]

// Il Campari sta su due listini: è il doppione da cui nasce tutta la voce.
const LISTINI = [
  { id: 'nova__campari', supplier_id: 'nova', item_id: 'campari', price: 12.5, last_price_at: '2026-08-01T10:00:00.000Z' },
  { id: 'enofel__campari', supplier_id: 'enofel', item_id: 'campari', price: 11.9, last_price_at: '2024-02-01T10:00:00.000Z' },
  { id: 'enofel__gin', supplier_id: 'enofel', item_id: 'gin', price: 28, last_price_at: '2026-05-01T10:00:00.000Z' },
]

const catalogo = () => catalogoOrdinabile({ items: ARTICOLI, listini: LISTINI, suppliers: FORNITORI })
const perChiave = () => new Map(catalogo().map((r) => [r.key, r]))
const nomi = (righe) => righe.map((r) => `${r.item_name}/${r.supplier_name || '—'}`)

describe('le colonne ordinano', () => {
  it('per nome, nei due versi', () => {
    const su = ordinaCatalogo(catalogo(), { col: 'nome', dir: 'asc' })
    const giu = ordinaCatalogo(catalogo(), { col: 'nome', dir: 'desc' })
    expect(su[0].item_name).toBe('Amaro fuori linea')
    expect(giu[0].item_name).toBe('Rum Zacapa')
  })

  // L'ordine delle tre disponibilità è quello dell'URGENZA, non
  // l'alfabetico: chi ordina per disponibilità vuole vedere per primo quello
  // che è finito.
  it('per disponibilità, e prima viene quello che è finito', () => {
    const righe = ordinaCatalogo(catalogo(), { col: 'scorta', dir: 'asc' })
    // Esauriti (Campari ×2, Amaro), poi il sotto soglia, poi chi ce n'è.
    expect(righe.at(-1).item_name).toBe('Rum Zacapa')
    expect(righe.slice(0, 3).map((r) => r.item_name)).toEqual(
      expect.arrayContaining(['Amaro fuori linea', 'Campari'])
    )
    expect(righe.map((r) => r.item_name).indexOf('Gin Mare')).toBeLessThan(
      righe.map((r) => r.item_name).indexOf('Rum Zacapa')
    )
  })

  it('per prezzo di listino, dal più basso', () => {
    const righe = ordinaCatalogo(catalogo(), { col: 'prezzo', dir: 'asc' })
    expect(righe.map((r) => r.price)[0]).toBe(9)
  })

  // Una riga senza prezzo non è «la più economica», e una senza fornitore
  // non è «il primo in ordine alfabetico»: chi non ha il dato sta in fondo
  // in tutti e due i versi, o il primo posto lo prenderebbe il vuoto.
  it('chi non ha il dato resta in fondo, in salita come in discesa', () => {
    const senzaPrezzo = { id: 'x', name: 'Senza prezzo', unit: 'pz', stock: 5, kind: 'scorta' }
    const righe = catalogoOrdinabile({ items: [CAMPARI, senzaPrezzo], listini: LISTINI, suppliers: FORNITORI })
    for (const dir of ['asc', 'desc']) {
      expect(ordinaCatalogo(righe, { col: 'prezzo', dir }).at(-1).item_name).toBe('Senza prezzo')
      expect(ordinaCatalogo(righe, { col: 'fornitore', dir }).at(-1).item_name).toBe('Senza prezzo')
    }
  })

  it('per fornitore, e i doppioni dello stesso prodotto restano distinti', () => {
    const righe = ordinaCatalogo(catalogo(), { col: 'fornitore', dir: 'asc' })
    expect(nomi(righe)[0]).toBe('Campari/Enofel')
  })

  // Senza secondo criterio due righe uguali ballerebbero di posto a ogni
  // disegno, e la spunta appena data sembrerebbe essersi spostata da sola.
  it('a parità l’ordine è stabile: nome e poi fornitore', () => {
    const righe = ordinaCatalogo(catalogo(), { col: 'scorta', dir: 'asc' })
    const campari = righe.filter((r) => r.item_name === 'Campari')
    expect(campari.map((r) => r.supplier_name)).toEqual(['Enofel', 'Nova'])
  })
})

describe('la preselezione: quello che manca è già spuntato', () => {
  it('prende gli esauriti e i sotto soglia, e lascia stare chi è pieno', () => {
    const scelte = preselezioneIniziale(catalogo())
    const prodotti = [...scelte.keys()].map((k) => k.split('|')[0])
    expect(prodotti).toContain('campari')
    expect(prodotti).toContain('gin')
    expect(prodotti).not.toContain('rum')
  })

  // «Se è fuori linea non viene considerato nella precompilazione
  // dell'ordine» (utente, 27/08). Resta in tabella e si può aggiungere a
  // mano — è così che rientra — ma non si propone da solo.
  it('chi è fuori linea non si precompila, anche se è finito', () => {
    const scelte = preselezioneIniziale(catalogo())
    expect([...scelte.keys()].some((k) => k.startsWith('amaro'))).toBe(false)
  })

  // Lo stesso Campari sta su due listini: spuntarle tutte e due vorrebbe
  // dire comprarlo due volte.
  it('un prodotto su due listini si spunta UNA volta sola, dall’ultimo acquisto', () => {
    const scelte = preselezioneIniziale(catalogo())
    const campari = [...scelte.keys()].filter((k) => k.startsWith('campari|'))
    expect(campari).toEqual(['campari|nova'])
  })

  // IN ASSORTIMENTO SENZA ORDINE SI PROPONE LO STESSO (REQ-MAG-037): è lo
  // stato che Flavio mette a mano quando quel prodotto gli serve, e «anche in
  // quel caso verrà preso in considerazione come un prodotto sotto soglia o
  // esaurito nella precompilazione». Qui il Rum è pieno e non si proporrebbe.
  it('quello messo a mano in assortimento si propone anche se è pieno', () => {
    const aMano = { ...RUM, status: 'assortimento', assortimento_da: 'premium' }
    const scelte = preselezioneIniziale(
      catalogoOrdinabile({ items: [aMano], listini: [], suppliers: [] })
    )
    expect([...scelte.keys()].some((k) => k.startsWith('rum'))).toBe(true)
  })

  // IL VECCHIO DEFAULT NON È UNA SCELTA DI FLAVIO. 'assortimento' era il
  // valore di partenza di ogni prodotto che non dichiarava niente — metà del
  // magazzino vero — e se contasse come «messo a mano» si troverebbero
  // preselezionate centinaia di righe piene.
  it('il vecchio default non si propone se le scorte ci sono', () => {
    const vecchio = { ...RUM, status: 'assortimento' }
    const scelte = preselezioneIniziale(
      catalogoOrdinabile({ items: [vecchio], listini: [], suppliers: [] })
    )
    expect([...scelte.keys()]).toEqual([])
  })

  // `suggestedPackages` risponde 0 quando il prodotto non ha soglia o non si
  // conta a confezioni: una riga proposta con zero pezzi sarebbe una spunta
  // che non ordina niente.
  it('la quantità proposta non è mai zero', () => {
    const senzaSoglia = { id: 'z', name: 'Zero', unit: 'pz', stock: 0, kind: 'scorta' }
    const scelte = preselezioneIniziale(catalogoOrdinabile({ items: [senzaSoglia], listini: [], suppliers: [] }))
    expect([...scelte.values()]).toEqual([1])
  })
})

describe('i prezzi della riga', () => {
  it('il prezzo unitario è quello del listino DI QUEL fornitore', () => {
    expect(prezzoDiListino(CAMPARI, LISTINI, 'nova')).toBe(12.5)
    expect(prezzoDiListino(CAMPARI, LISTINI, 'enofel')).toBe(11.9)
  })

  // Senza riga di listino si ricade sul costo del prodotto, che è l'ultimo
  // pagato a chiunque: 378 prodotti su 388 non stanno sul listino di nessuno.
  it('senza listino vale il costo del prodotto', () => {
    expect(prezzoDiListino(RUM, LISTINI, 'nova')).toBe(40)
    expect(prezzoDiListino(RUM, LISTINI, null)).toBe(40)
  })

  it('il totale è pezzi per prezzo, e si può tornare indietro', () => {
    expect(totaleRiga(4, 12.5)).toBe(50)
    expect(prezzoDaTotale(50, 4)).toBe(12.5)
    // Zero pezzi non fanno un prezzo: nessuna divisione per zero.
    expect(prezzoDaTotale(50, 0)).toBe(0)
  })
})

describe('l’ordine in composizione, già diviso per fornitore', () => {
  const selezioni = () => ({
    'campari|nova': { qty: '6', supplier_id: 'nova' },
    'gin|enofel': { qty: '2', supplier_id: 'enofel' },
    'rum|': { qty: '1', supplier_id: null },
  })

  it('ogni fornitore ha il suo gruppo, col suo totale', () => {
    const scelte = righeScelte(selezioni(), { perChiave: perChiave(), listini: LISTINI, suppliers: FORNITORI })
    const gruppi = raggruppaPerFornitore(scelte)
    expect(gruppi.map((g) => g.supplier_name)).toEqual(['Enofel', 'Nova', null])
    expect(gruppi[1].totale).toBe(75) // 6 × 12,50
    expect(gruppi[0].totale).toBe(56) // 2 × 28
  })

  // Chi non ha fornitore va in fondo: è la parte da sistemare prima di
  // mandare, non una famiglia come le altre.
  it('chi non ha fornitore sta in fondo', () => {
    const gruppi = raggruppaPerFornitore(
      righeScelte(selezioni(), { perChiave: perChiave(), listini: LISTINI, suppliers: FORNITORI })
    )
    expect(gruppi.at(-1).supplier_id).toBeNull()
    expect(gruppi.at(-1).righe[0].item_name).toBe('Rum Zacapa')
  })

  // La tendina della riga può mandare a un ALTRO fornitore: 378 prodotti su
  // 388 non stanno sul listino di nessuno, e il fornitore si sceglie lì.
  it('cambiando fornitore cambia il prezzo, perché cambia il listino', () => {
    const scelte = righeScelte(
      { 'campari|nova': { qty: '2', supplier_id: 'enofel' } },
      { perChiave: perChiave(), listini: LISTINI, suppliers: FORNITORI }
    )
    expect(scelte[0].supplier_name).toBe('Enofel')
    expect(scelte[0].prezzo).toBe(11.9)
    expect(scelte[0].totale).toBeCloseTo(23.8, 5)
  })

  // «Prezzo totale rispetto ai pezzi voluti, modificabile sulla riga stessa»
  // (utente, 27/08): il listino dice quanto ci si aspetta di pagare, ma se
  // il fornitore ha fatto un altro prezzo per quel lotto comanda la cifra
  // scritta a mano — ed è da lì che si ricava il prezzo del pezzo.
  it('il totale corretto a mano comanda sul prezzo del pezzo', () => {
    const scelte = righeScelte(
      { 'campari|nova': { qty: '4', supplier_id: 'nova', totale: '40' } },
      { perChiave: perChiave(), listini: LISTINI, suppliers: FORNITORI }
    )
    expect(scelte[0].totale).toBe(40)
    expect(scelte[0].unit_cost).toBe(10)
    // Il prezzo di LISTINO resta quello che è: è l'altro dato, e non si
    // mette a ballare perché qualcuno ha corretto un totale.
    expect(scelte[0].prezzo).toBe(12.5)
  })

  it('le righe salvate portano prezzo, fornitore e livello di partenza', () => {
    const scelte = righeScelte(selezioni(), { perChiave: perChiave(), listini: LISTINI, suppliers: FORNITORI })
    const lines = righeOrdine(scelte, { listini: LISTINI })
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({
      item_id: 'campari',
      supplier_id: 'nova',
      unit_cost: 12.5,
      qty_packages: 6,
      stato: 'richiesto',
    })
    // IL CAMPO `status_target` NON SI SCRIVE PIÙ, ed è una decisione, non una
    // dimenticanza: portava «mettilo in assortimento quando arriva»
    // (REQ-MAG-025 punto 5), e da REQ-MAG-037 l'arrivo è esattamente il
    // momento in cui il prodotto ESCE dall'assortimento. Le due cose non
    // possono stare sulla stessa riga.
    expect(lines[0].status_target).toBeUndefined()
  })

  // Una riga spuntata e lasciata vuota è un ripensamento, non un ordine di
  // niente.
  it('le quantità a zero non finiscono nell’ordine', () => {
    const scelte = righeScelte(
      { 'campari|nova': { qty: '', supplier_id: 'nova' } },
      { perChiave: perChiave(), listini: LISTINI, suppliers: FORNITORI }
    )
    expect(scelte).toHaveLength(1)
    expect(righeOrdine(scelte, { listini: LISTINI })).toHaveLength(0)
  })

  it('una selezione su una riga che non esiste più si ignora', () => {
    const scelte = righeScelte({ 'sparito|nova': { qty: '3' } }, { perChiave: perChiave(), listini: LISTINI, suppliers: FORNITORI })
    expect(scelte).toEqual([])
  })
})

// ── UN ORDINE PER FORNITORE (REQ-MAG-037) ────────────────────
//
// «Tutti i prodotti di quell'ordine» non sono più le righe di un documento
// solo: alla conferma nascono N ordini distinti, uno per fornitore. Qui si
// prova il conto che li prepara — chi va con chi, quanto fa, e chi non
// compare affatto.
describe('gli ordini da creare, uno per fornitore', () => {
  const selezioni = () => ({
    'campari|nova': { qty: '6', supplier_id: 'nova' },
    'gin|enofel': { qty: '2', supplier_id: 'enofel' },
    'rum|': { qty: '1', supplier_id: null },
  })
  const fette = () =>
    ordiniDaCreare(
      righeScelte(selezioni(), { perChiave: perChiave(), listini: LISTINI, suppliers: FORNITORI }),
      { listini: LISTINI }
    )

  it('ogni fornitore porta le sue righe, il suo totale e la sua chiave', () => {
    const f = fette()
    expect(f.map((g) => g.supplier_name)).toEqual(['Enofel', 'Nova', null])
    expect(f.map((g) => g.chiave)).toEqual(['enofel', 'nova', 'senza'])
    expect(f[1].lines).toHaveLength(1)
    expect(f[1].lines[0]).toMatchObject({ item_id: 'campari', qty_packages: 6, stato: 'richiesto' })
    expect(f[1].totali.net).toBe(75)
  })

  // «Sono ovviamente visibili SOLO se ho selezionato e sto ordinando prodotti
  // da quel fornitore»: un fornitore le cui righe sono tutte a zero non è un
  // ordine da mandare a nessuno.
  it('un fornitore senza righe da ordinare non compare', () => {
    const f = ordiniDaCreare(
      righeScelte(
        { 'campari|nova': { qty: '', supplier_id: 'nova' }, 'gin|enofel': { qty: '2', supplier_id: 'enofel' } },
        { perChiave: perChiave(), listini: LISTINI, suppliers: FORNITORI }
      ),
      { listini: LISTINI }
    )
    expect(f.map((g) => g.supplier_name)).toEqual(['Enofel'])
  })

  // Le righe da rivedere a schermo e quelle da salvare devono dire la stessa
  // cosa: se il riepilogo mostrasse una riga e ne salvasse un'altra, la
  // revisione non servirebbe a niente.
  it('quello che si rivede e quello che si salva sono la stessa cosa', () => {
    for (const g of fette()) {
      expect(g.righe.map((r) => r.item_id)).toEqual(g.lines.map((l) => l.item_id))
      expect(g.righe.map((r) => r.qty)).toEqual(g.lines.map((l) => l.qty_packages))
    }
  })

  it('senza niente di selezionato non c’è nessun ordine da creare', () => {
    expect(ordiniDaCreare([], { listini: LISTINI })).toEqual([])
  })
})

describe('lo scorrimento continuo', () => {
  // Si carica PRIMA di toccare il fondo: arrivare a un elenco che finisce e
  // aspettare che si allunghi è la stessa attesa che il local-first vieta
  // altrove.
  it('quando manca poco al fondo si chiedono altre righe', () => {
    expect(vicinoAlFondo({ scrollTop: 900, clientHeight: 400, scrollHeight: 1350 })).toBe(true)
    expect(vicinoAlFondo({ scrollTop: 0, clientHeight: 400, scrollHeight: 4000 })).toBe(false)
  })

  it('la finestra cresce di un passo e non supera il totale', () => {
    expect(prossimaFinestra(PASSO_RIGHE, 1000)).toBe(PASSO_RIGHE * 2)
    expect(prossimaFinestra(PASSO_RIGHE, 50)).toBe(50)
    expect(prossimaFinestra(50, 50)).toBe(50)
  })
})

// ── LA PRESELEZIONE NON CANCELLA QUELLO CHE SI E' SCRITTO ─────────────
//
// Trovato dalla CI il 28/08/2026, su una macchina piu' lenta della mia: due
// colli scritti tornavano a uno. La preselezione arriva DOPO il primo disegno
// delle righe, e sostituendo lo stato buttava via quello che qualcuno aveva
// appena scritto — senza un errore e senza un segno, che e' il modo peggiore
// di sbagliare. Sul tablet del banco, con 388 prodotti e 367 listini da
// mettere in fila, quella finestra non e' zero.
describe('la preselezione si aggiunge, non sostituisce', () => {
  it('quello che e gia scritto vince sulla proposta', () => {
    const proposta = { 'campari|nova': { qty: '1', supplier_id: 'nova' } }
    const scritto = { 'campari|nova': { qty: '5', supplier_id: 'nova' } }
    expect(uniscePreselezione(proposta, scritto)['campari|nova'].qty).toBe('5')
  })

  it('le righe proposte che nessuno ha toccato restano', () => {
    const proposta = { a: { qty: '1' }, b: { qty: '2' } }
    const scritto = { a: { qty: '9' } }
    const unione = uniscePreselezione(proposta, scritto)
    expect(unione.a.qty).toBe('9')
    expect(unione.b.qty).toBe('2')
  })

  it('senza niente di scritto vale la proposta, e viceversa', () => {
    expect(uniscePreselezione({ a: { qty: '1' } }, {})).toEqual({ a: { qty: '1' } })
    expect(uniscePreselezione({}, { a: { qty: '3' } })).toEqual({ a: { qty: '3' } })
    expect(uniscePreselezione(null, null)).toEqual({})
  })
})
