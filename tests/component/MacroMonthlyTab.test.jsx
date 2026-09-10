// @vitest-environment happy-dom
'use strict'

// BILANCIO → VENDUTO × INCASSATO. La tabella «Mensile per macro» stava
// nelle Statistiche e ha traslocato qui: quanto ha reso ogni gruppo del
// menù è una domanda da conti di fine mese, non da serata.
//
// IL TRASLOCO È UN CAMBIO DI POSTO, NON DI CONTENUTO — incassato, costo del
// venduto, margine e inc/costo restano quelli — e porta con sé le due righe
// che il foglio di Flavio aveva e la tabella no: quanto pesa una macro sul
// margine del mese, e quanto pesa un mese sull'incassato dell'anno.
//
// E LE DIDASCALIE NON SONO UN ABBELLIMENTO: margine, inc/costo e le due
// incidenze si spiegano sotto la tabella, in parole da banco — compresa la
// differenza col foglio, che è la prima cosa che si chiede chi mette i due
// numeri accanto.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const ANNO = new Date().getFullYear()

// Due mesi della stessa annata: il primo con due macro (per vedere come si
// spartiscono il margine), il secondo con una sola.
const ordini = [
  {
    id: 'a',
    status: 'pagato',
    created_at: `${ANNO}-07-15T20:00:00.000Z`,
    order_items: [
      { drink_id: 'gintonic', qty: 1, unit_price: 8 },
      { drink_id: 'schweppes-sola', qty: 1, unit_price: 3 },
    ],
  },
  {
    id: 'b',
    status: 'pagato',
    created_at: `${ANNO}-06-10T20:00:00.000Z`,
    order_items: [{ drink_id: 'jagerbomb', qty: 1, unit_price: 6 }],
  },
]

vi.mock('../../src/lib/api.js', () => ({
  DEFAULT_SETTINGS: { sale_vat: 0, business_day_cutoff_hour: 5 },
  subscribeSettings: (cb) => {
    cb({ sale_vat: 0, business_day_cutoff_hour: 5 })
    return () => {}
  },
  fetchOrdersBetween: async () => ordini,
  fetchDrinks: async () => [
    {
      id: 'gintonic',
      category_id: 'menu-alcolici',
      recipe_items: [
        { inventory_item_id: 'gin', unit: 'ml', qty: 50 },
        { inventory_item_id: 'schweppes', unit: 'pz', qty: 1 },
      ],
    },
    {
      id: 'jagerbomb',
      category_id: 'menu-alcolici',
      recipe_items: [
        { inventory_item_id: 'jager', unit: 'ml', qty: 40 },
        { inventory_item_id: 'redbull', unit: 'pz', qty: 1 },
      ],
    },
    {
      id: 'schweppes-sola',
      category_id: 'menu-bibite',
      recipe_items: [{ inventory_item_id: 'schweppes', unit: 'pz', qty: 1 }],
    },
  ],
  fetchInventoryItems: async () => [
    { id: 'gin', unit: 'ml', package_size: 700, cost: 21, vat: 0 },
    { id: 'jager', unit: 'ml', package_size: 700, cost: 14, vat: 0 },
    { id: 'schweppes', unit: 'pz', cost: 0.5, vat: 0 },
    { id: 'redbull', unit: 'pz', cost: 1, vat: 0 },
  ],
  // Le macro portano i pesi delle voci (REQ-MAG-042): ogni drink al 100%
  // nella sua.
  fetchMacroCategories: async () => [
    { id: 'mm-alc', name: 'Alcolici e distillati', pesi_voci: { gintonic: 100, jagerbomb: 100 } },
    { id: 'mm-bib', name: 'Birre e bibite', pesi_voci: { 'schweppes-sola': 100 } },
  ],
}))

import MacroMonthlyTab from '../../src/components/MacroMonthlyTab.jsx'

// La riga di una tabella, presa dal blocco che la contiene: le righe si
// chiamano uguali in tutti i blocchi, ed è giusto così — cambia il blocco.
async function blocco(titolo) {
  return (await screen.findByText(titolo)).closest('.card')
}
const cerca = (card, etichetta) =>
  [...card.querySelectorAll('tbody tr')].find(
    (r) => r.querySelector('th')?.textContent === etichetta
  )
async function riga(titolo, etichetta) {
  const r = cerca(await blocco(titolo), etichetta)
  if (!r) throw new Error(`riga «${etichetta}» non trovata in «${titolo}»`)
  return r
}

describe('Venduto × Incassato', () => {
  it('dice quanto pesa una macro sul margine del mese', async () => {
    render(<MacroMonthlyTab />)
    // Luglio: distillati 6 € di margine, bibite 2,50 — su 8,50 del mese.
    const alc = await riga('🗂️ Alcolici e distillati', 'Incidenza')
    expect(within(alc).getByText('70,6%')).toBeInTheDocument()
    const bib = await riga('🗂️ Birre e bibite', 'Incidenza')
    expect(within(bib).getByText('29,4%')).toBeInTheDocument()
  })

  it('e quanto pesa un mese sull’incassato dell’anno', async () => {
    render(<MacroMonthlyTab />)
    // Luglio 11 € su 17 dell'anno; giugno 6 su 17.
    const tot = await riga(/Σ Totale/, 'Incidenza sull’anno')
    expect(within(tot).getByText('64,7%')).toBeInTheDocument()
    expect(within(tot).getByText('35,3%')).toBeInTheDocument()
  })

  // La riga «incidenza sull'anno» è dei TOTALI: su una macro sarebbe la
  // stessa parola per un'altra domanda.
  it('le due incidenze non stanno sulla stessa riga', async () => {
    render(<MacroMonthlyTab />)
    const card = await blocco('🗂️ Birre e bibite')
    expect(cerca(card, 'Incidenza sull’anno')).toBeUndefined()
    expect(cerca(card, 'Incidenza')).toBeTruthy()
  })

  it('quello che calcolava prima non è cambiato', async () => {
    render(<MacroMonthlyTab />)
    const inc = await riga('🗂️ Alcolici e distillati', 'Incassato')
    expect(within(inc).getByText('14 €')).toBeInTheDocument() // 8 + 6, colonna TOT
    const mar = await riga('🗂️ Alcolici e distillati', 'Margine')
    expect(within(mar).getByText('10 €')).toBeInTheDocument() // 14 − 3,80 ≈ 10
  })

  it('sotto la tabella c’è scritto che numeri sono, in parole da banco', async () => {
    render(<MacroMonthlyTab />)
    expect(
      await screen.findByText(/quante volte rientra quello che hai speso/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/quanto pesa questo gruppo sul margine/i)).toBeInTheDocument()
  })

  it('e perché col foglio di Flavio non tornerà mai', async () => {
    render(<MacroMonthlyTab />)
    // Non è un errore di nessuno dei due: sono due conti diversi.
    expect(await screen.findByText(/entrata dalla porta/i)).toBeInTheDocument()
  })
})
