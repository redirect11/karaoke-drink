'use strict'

// IL TRAVASO DEI PRODOTTI AL MODELLO A PEZZI (REQ-MAG-018).
//
// «Il travaso deve avvenire in fase di aggiornamento: quando si aggiorna il
// bundle si aggiornano i prodotti» (18/08). Non c'è nessuno script lanciato
// contro il database — si legge tollerante, come si fa da sempre con gli
// ordini vecchi (normalizeOrderDoc, REQ-ORD-002), e l'articolo si riscrive
// nella forma nuova la prima volta che qualcuno lo tocca.
//
// Questi test sono l'unica cosa che sta fra una conversione sbagliata e le
// giacenze vere del locale: un numero storto in pezzi sembra plausibile a
// chiunque lo legga — «47» di limoni non ha niente di strano, che sia giusto
// o no. Quindi non si controlla solo che il travaso faccia qualcosa: si
// controlla che il magazzino, dopo, dica le stesse cose di prima.

import { describe, it, expect } from 'vitest'
import {
  articoloNormalizzato,
  patchNormalizza,
  stockValue,
  pezziInGiacenza,
  qtyInStockUnit,
  costPerUnit,
  entryUnits,
} from '../../src/lib/inventory.js'
import { recipeCost } from '../../src/lib/pricing.js'

describe('la bottiglia contata a volume si legge a pezzi', () => {
  // Il caso ovvio, quello che Flavio dà per scontato: «per una bottiglia da
  // 70 cl è ovvio — 1 pz = 70 cl, e la giacenza in cl diventa pezzi
  // frazionati, senza stime».
  const gin = {
    name: 'Gin Bosford',
    unit: 'ml',
    package_size: 700,
    stock: 2100,
    low_threshold: 700,
    cost: 14,
    vat: 22,
  }
  const letto = articoloNormalizzato(gin)

  it('1 pz = 70 cl, e tre bottiglie restano tre bottiglie', () => {
    expect(letto).toMatchObject({
      unit: 'pz',
      display_unit: 'pz',
      package_size: 700,
      content_unit: 'ml',
      stock: 3,
      low_threshold: 1,
    })
    // Il prezzo non si tocca: era il costo della confezione, ed è il costo
    // del pezzo.
    expect(letto.cost).toBe(14)
  })

  it('valore e pezzi in magazzino non cambiano di un centesimo', () => {
    expect(stockValue(letto)).toBeCloseTo(stockValue(gin), 9)
    expect(pezziInGiacenza(letto)).toBeCloseTo(pezziInGiacenza(gin), 9)
  })

  it('e una ricetta costa e scarica esattamente come prima', () => {
    // 40 ml di gin erano 40 ml di giacenza; adesso sono 0,057 pezzi, che di
    // quella bottiglia sono gli stessi 40 ml. È il numero che non deve
    // muoversi: succede ogni volta che si batte un drink.
    expect(qtyInStockUnit(40, 'ml', letto) * 700).toBeCloseTo(qtyInStockUnit(40, 'ml', gin), 9)
    expect(costPerUnit(letto, 'cl')).toBeCloseTo(costPerUnit(gin, 'cl'), 9)
    // Nessuna unità sparisce dalle ricette (il pezzo, semmai, si aggiunge:
    // prima di una bottiglia contata a millilitri non si poteva dire «una»).
    for (const u of entryUnits(gin)) expect(entryUnits(letto)).toContain(u)
  })

  it('e si porta dietro da dove viene, per poterlo dire a chi guarda', () => {
    // Il travaso non deve essere silenzioso su una giacenza: la scheda lo
    // scrive prima di salvare.
    expect(letto.formaVecchia).toEqual({ unit: 'ml', stock: 2100 })
  })
})

describe('lo sfuso comprato in una misura e usato in un’altra', () => {
  // I limoni: comprati al CHILO, dosati in CL di succo. Nel modello vecchio
  // si potevano scrivere in ricetta tutte e due le misure; nel nuovo un
  // pezzo corrisponde a una cosa sola. Sceglierla al posto di chi lavora
  // vorrebbe dire buttare via l'altra — e se una ricetta dosava nella misura
  // buttata, da quel momento scarica un chilo dove voleva un grammo.
  const limoni = {
    name: 'Limoni',
    unit: 'g',
    package_size: 1000, // si comprava al chilo
    resa: 0.5, // 0,5 ml di succo per grammo
    resa_unit: 'ml',
    stock: 5000, // cinque chili
    cost: 2, // al chilo
    vat: 4,
  }

  it('resta com’è: cos’è un pezzo lo deve dire una persona', () => {
    // «Capire cos'è un pezzo per ciascuna, senza che nessuno lo dichiari a
    // mano, resta da progettare» (REQ-MAG-018): qui non si indovina.
    expect(patchNormalizza(limoni)).toBe(null)
    expect(articoloNormalizzato(limoni)).toBe(limoni)
  })

  it('e finché resta com’è le sue ricette scaricano come sempre', () => {
    // 4 cl di succo sono 80 g di limoni, 1 g è 1 g: niente si muove.
    expect(qtyInStockUnit(4, 'cl', limoni)).toBeCloseTo(80, 9)
    expect(qtyInStockUnit(1, 'g', limoni)).toBeCloseTo(1, 9)
  })

  it('ma se le due misure sono della stessa famiglia il travaso passa', () => {
    // Il fusto alla spina: comprato a litri, versato a cl. È la stessa
    // misura scritta in due modi, e non si butta via niente.
    const spina = {
      name: 'Birra alla spina',
      unit: 'ml',
      package_size: 30000, // il fusto da 30 litri
      resa: 1,
      resa_unit: 'ml',
      stock: 60000,
      cost: 90,
      vat: 22,
    }
    const letto = articoloNormalizzato(spina)
    expect(letto).toMatchObject({
      unit: 'pz',
      package_size: 30000,
      content_unit: 'ml',
      stock: 2,
      resa: null,
    })
    expect(qtyInStockUnit(40, 'cl', letto) * 30000).toBeCloseTo(qtyInStockUnit(40, 'cl', spina), 9)
    expect(stockValue(letto)).toBeCloseTo(stockValue(spina), 9)
  })
})

describe('quello che si contava a «U»', () => {
  // Una U era già una cosa che si conta — il sacco, la confezione — quindi
  // sei U fanno sei pezzi: qui non c'è niente da dividere.
  it('il ghiaccio a sacchi si legge sei pezzi', () => {
    const ghiaccio = { name: 'Ghiaccio', unit: 'U', stock: 6, cost: 2, vat: 22 }
    const letto = articoloNormalizzato(ghiaccio)
    expect(letto).toMatchObject({
      unit: 'pz',
      package_size: 1,
      content_unit: 'U',
      stock: 6,
    })
    expect(stockValue(letto)).toBeCloseTo(stockValue(ghiaccio), 9)
  })

  // Dal 12/09/2026 il campo `scorta` non si scrive più (tutto si scarica):
  // il travaso non lo aggiunge, e se c'era lo lascia dov'è.
  it('il travaso non scrive più «scorta», e il costo a unità non cambia', () => {
    const lavoro = { name: 'Tempo di Lavorazione', unit: 'U', stock: 0, cost: 0.5, vat: 22 }
    const letto = articoloNormalizzato(lavoro)
    expect(patchNormalizza(lavoro)).not.toHaveProperty('scorta')
    expect(costPerUnit(letto, 'U')).toBeCloseTo(costPerUnit(lavoro, 'U'), 9)
  })
})

describe('chi non si può leggere a pezzi resta com’è', () => {
  it('senza sapere quanto contiene una confezione non si inventa niente', () => {
    // Inventarsi il contenuto sarebbe peggio che lasciarlo com'è: la
    // giacenza in millilitri diventerebbe un numero di bottiglie a caso.
    const sfuso = { name: 'Sciroppo sfuso', unit: 'ml', stock: 4000 }
    expect(patchNormalizza(sfuso)).toBe(null)
    expect(articoloNormalizzato(sfuso)).toBe(sfuso)
  })
})

describe('rileggere non cambia più niente', () => {
  // È la proprietà che rende il travaso alla lettura una cosa sicura: si
  // legge dieci volte al minuto, e la decima deve dire quello che diceva la
  // prima.
  it('quello che è già a pezzi torna identico, senza copie', () => {
    const campari = {
      name: 'Campari',
      unit: 'pz',
      package_size: 1000,
      content_unit: 'ml',
      stock: 7.49,
      scorta: true,
      cost: 12,
      vat: 22,
    }
    expect(patchNormalizza(campari)).toBe(null)
    expect(articoloNormalizzato(campari)).toBe(campari)
  })

  it('e quello convertito, riletto, non si muove più', () => {
    const gin = { name: 'Gin', unit: 'ml', package_size: 700, stock: 2100, cost: 14, vat: 22 }
    const primo = articoloNormalizzato(gin)
    expect(patchNormalizza(primo)).toBe(null)
    expect(articoloNormalizzato(primo)).toBe(primo)
  })

  it('una resa su un articolo già a pezzi si riassorbe nel contenuto', () => {
    // Due risposte alla stessa domanda litigano: resaUso preferisce la resa,
    // quindi il contenuto diceva una cosa e lo scarico ne faceva un'altra.
    const strano = { unit: 'pz', package_size: 700, content_unit: 'ml', resa: 500, resa_unit: 'ml', stock: 2, cost: 10, vat: 22 }
    const letto = articoloNormalizzato(strano)
    expect(letto).toMatchObject({ package_size: 500, content_unit: 'ml', resa: null })
    expect(qtyInStockUnit(4, 'cl', letto)).toBeCloseTo(qtyInStockUnit(4, 'cl', strano), 9)
    expect(patchNormalizza(letto)).toBe(null)
  })
})

// ── IL NUMERO CHE NON DEVE MUOVERSI ──────────────────────────────────
// Un drink costa quello che costa: se dopo l'aggiornamento un cocktail
// costasse un centesimo in più o in meno, vorrebbe dire che una conversione
// ha mentito — e il prezzo consigliato, il margine e le statistiche del mese
// verrebbero dietro.
describe('le ricette costano uguale prima e dopo', () => {
  const vecchi = {
    gin: { name: 'Gin', unit: 'ml', package_size: 700, stock: 2100, cost: 14, vat: 22 },
    zucchero: { name: 'Zucchero', unit: 'g', package_size: 1000, stock: 1870, cost: 1.5, vat: 10 },
    birra: { name: 'Birra', unit: 'pz', stock: 24, cost: 1.2, vat: 22 },
    ghiaccio: { name: 'Ghiaccio', unit: 'U', scorta: true, stock: 6, cost: 2, vat: 22 },
    lavoro: { name: 'Lavoro', unit: 'U', stock: 0, cost: 0.5, vat: 22 },
    spina: {
      name: 'Spina',
      unit: 'ml',
      package_size: 30000,
      resa: 1,
      resa_unit: 'ml',
      stock: 18400,
      cost: 90,
      vat: 22,
    },
  }
  const ricetta = [
    { inventory_item_id: 'gin', name: 'Gin', unit: 'cl', qty: 4 },
    { inventory_item_id: 'zucchero', name: 'Zucchero', unit: 'g', qty: 8 },
    { inventory_item_id: 'birra', name: 'Birra', unit: 'pz', qty: 1 },
    { inventory_item_id: 'ghiaccio', name: 'Ghiaccio', unit: 'U', qty: 1 },
    { inventory_item_id: 'lavoro', name: 'Lavoro', unit: 'U', qty: 2 },
    { inventory_item_id: 'spina', name: 'Spina', unit: 'cl', qty: 20 },
  ]

  it('il costo del drink è lo stesso, al centesimo', () => {
    const nuovi = Object.fromEntries(
      Object.entries(vecchi).map(([k, v]) => [k, articoloNormalizzato(v)])
    )
    const prima = recipeCost(ricetta, vecchi)
    const dopo = recipeCost(ricetta, nuovi)
    // Nessun ingrediente perde il suo costo per strada: un «non lo so» in
    // più farebbe sparire una voce dal totale senza che nessuno se ne
    // accorga, e il drink sembrerebbe costare meno.
    expect(dopo.missing).toEqual(prima.missing)
    expect(dopo.cost).toBeCloseTo(prima.cost, 9)
    expect(prima.cost).toBeGreaterThan(0)
  })
})
