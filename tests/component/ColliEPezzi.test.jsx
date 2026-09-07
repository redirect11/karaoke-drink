// @vitest-environment happy-dom
'use strict'

// ── COLLI E PEZZI, A SCHERMO (REQ-MAG-040) ───────────────────────────
//
// «Hai messo Bjorne 8 pz ma il prezzo unitario del fornitore è AL COLLO, che
// è 25 euro, e viene fuori 200 euro per 8 pezzi» (utente, 27/08/2026).
//
// I conti stanno in `tests/unit/colliEPezzi.test.js`; qui si sorveglia cosa
// se ne vede, che è l'altra metà del guaio: la cifra sbagliata era LEGGIBILE
// e nessuno l'ha fermata prima che diventasse un ordine.
//
// Le due cose da non perdere:
//   · dove un collo c'è, si vedono i DUE prezzi (il pezzo, per confrontare;
//     il collo, per controllare la bolla) e si ordina in COLLI;
//   · dove non c'è — quasi ovunque — la schermata è IDENTICA a prima e la
//     parola «collo» non compare, perché chi ordina al banco pensa a
//     bottiglie.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const MAR = { id: 'mar', name: 'MAR', email: 'ordini@mar.it', color: '#e74c3c' }
const FONT = { id: 'font', name: 'FONT', email: 'ordini@font.it', color: '#3498db' }

// La Bjorne vera dei fogli: da MAR a bottiglia a 1,2333, da FONT a cartone da
// 24 a 25,05 — che al pezzo fa 1,04, cioè meno. Il Tanqueray è il controllo:
// si compra a bottiglia, e per lui non deve cambiare niente.
const BJORNE = { id: 'bjorne', name: 'Bjorne', unit: 'pz', stock: 0, low_threshold: 8, cost: 1.2333, vat: 22, kind: 'scorta', status: 'linea' }
const TANQUERAY = { id: 'tanqueray', name: 'Tanqueray', unit: 'pz', stock: 9, low_threshold: 2, package_size: 700, cost: 14, vat: 22, kind: 'scorta', status: 'linea' }

const LISTINI = [
  { id: 'font__bjorne', supplier_id: 'font', item_id: 'bjorne', price: 25.05, pezzi_per_collo: 24, last_price_at: '2026-08-01T10:00:00.000Z' },
  { id: 'mar__bjorne', supplier_id: 'mar', item_id: 'bjorne', price: 1.2333, last_price_at: '2024-02-01T10:00:00.000Z' },
  { id: 'mar__tanqueray', supplier_id: 'mar', item_id: 'tanqueray', price: 14 },
]

const stato = { articoli: [BJORNE, TANQUERAY], listini: LISTINI, ordini: [], fatture: [] }

vi.mock('../../src/lib/api.js', () => ({
  fetchInventoryItems: vi.fn(async () => stato.articoli),
  fetchSuppliers: vi.fn(async () => [MAR, FONT]),
  fetchSupplierPrices: vi.fn(async () => stato.listini),
  fetchPurchaseOrders: vi.fn(async () => stato.ordini),
  createPurchaseOrder: vi.fn(async (o) => ({ id: 'po-1', created_at: '2026-08-27T09:00:00.000Z', status: 'inviato', ...o })),
  liberaDaAssortimento: vi.fn(() => []),
  segnaInAssortimento: vi.fn(() => []),
  togliRigaOrdine: vi.fn(async () => ({ ordine: null, articolo: null })),
  consegnaRigheOrdine: vi.fn(async (id) => ({ id })),
  segnaRighePagate: vi.fn(async (id) => ({ id })),
  deletePurchaseOrder: vi.fn(async () => {}),
  fetchSupplierInvoices: vi.fn(async () => stato.fatture),
  // I modelli d'ordine (REQ-MAG-039): qui non si provano, ma il pannello li
  // legge insieme al resto e senza questi non partirebbe la lettura.
  fetchModelliOrdine: vi.fn(async () => []),
  salvaModelloOrdine: vi.fn((m) => ({ id: 'mod-1', ...m })),
  eliminaModelloOrdine: vi.fn(),
  collegaFatturaAFetta: vi.fn(async (id) => ({ id })),
}))

vi.mock('../../src/lib/printer.js', () => ({ printOrdineFornitore: vi.fn(async () => {}) }))
vi.mock('../../src/lib/toast.js', () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }))

import PurchaseOrdersPanel from '../../src/components/PurchaseOrdersPanel.jsx'
import { createPurchaseOrder as creato } from '../../src/lib/api.js'

const carrello = () => screen.getByLabelText('Ordine in composizione')
const rigaDi = (nome) => screen.getByLabelText(`Ordina ${nome}`).closest('.inv-row')

async function confermaOrdine(user, fornitore) {
  await user.click(screen.getByRole('button', { name: /Rivedi e conferma/ }))
  const riga = screen.getByRole('button', { name: `I prodotti di ${fornitore}` }).closest('.inv-row')
  await user.click(within(riga).getByRole('button', { name: /Crea l/ }))
}

beforeEach(() => {
  vi.clearAllMocks()
  stato.articoli = [BJORNE, TANQUERAY]
  stato.listini = LISTINI
  stato.ordini = []
})

describe('la riga di chi vende a collo', () => {
  // I DUE PREZZI, ENTRAMBI LEGGIBILI. Nella colonna c'è quello del pezzo,
  // perché è l'unico con cui si confrontano due fornitori che vendono in
  // confezioni diverse; sotto c'è quello del collo, perché è la cifra scritta
  // sulla bolla di FONT e quella che si controlla.
  it('mostra il prezzo del pezzo e, sotto, quello del collo', async () => {
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Bjorne')
    const riga = rigaDi('Bjorne (FONT)')
    expect(within(riga).getByText('1,04 €')).toBeInTheDocument()
    expect(within(riga).getByText(/collo da 24: 25,05 €/)).toBeInTheDocument()
  })

  // Si ordina nell'unità in cui quel fornitore VENDE: chiedergli otto pezzi
  // non si può, e il campo lo dice mentre ci si scrive dentro.
  it('il campo della quantità chiede colli, non pezzi', async () => {
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Bjorne')
    expect(screen.getByLabelText('Colli di Bjorne (FONT)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Pezzi di Bjorne (FONT)')).not.toBeInTheDocument()
  })

  it('scrivendo due colli si leggono i quarantotto pezzi che arrivano', async () => {
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Bjorne')
    const colli = screen.getByLabelText('Colli di Bjorne (FONT)')
    // UN EVENTO SOLO, non tasto per tasto: `clear` piu' `type` sotto carico
    // finiscono nello stesso giro di React e il campo resta a metà — questo
    // test faceva rosso una volta su tre. Qui non si sta provando la
    // tastiera, si sta provando il conto.
    fireEvent.change(colli, { target: { value: '2' } })
    expect(within(rigaDi('Bjorne (FONT)')).getByText('= 48 pz')).toBeInTheDocument()
    expect(within(carrello()).getByText(/2 colli · 48 pz/)).toBeInTheDocument()
    // 2 × 25,05: il totale è quello che FONT fattura.
    expect(within(carrello()).getAllByText('50,10 €').length).toBeGreaterThan(0)
  })

  // LA PRESELEZIONE NON CHIEDE OTTO CARTONI. Ne mancano sedici bottiglie —
  // soglia 8, riportata al doppio — e da FONT quelle sedici stanno in un
  // cartone solo.
  it('la preselezione propone un cartone, non sedici', async () => {
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Bjorne')
    await waitFor(() => expect(screen.getByLabelText('Colli di Bjorne (FONT)')).toHaveValue(1))
    // 25,05 e non 400,80: è il difetto da cui questa voce è nata.
    expect(within(carrello()).getAllByText('25,05 €').length).toBeGreaterThan(0)
  })

  // Sull'ordine salvato le quantità tornano PEZZI: il magazzino non impara
  // un'unità nuova, e `caricoDaConfezioni` conta bottiglie come ha sempre
  // fatto.
  it('l’ordine salvato porta i pezzi, coi colli scritti accanto', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Bjorne')
    const colli = await screen.findByLabelText('Colli di Bjorne (FONT)')
    await user.clear(colli)
    await user.type(colli, '2')
    await confermaOrdine(user, 'FONT')
    await waitFor(() => expect(creato).toHaveBeenCalled())
    const riga = creato.mock.calls.at(-1)[0].lines.find((l) => l.item_id === 'bjorne')
    expect(riga.qty_packages).toBe(48)
    expect(riga.colli).toBe(2)
    expect(riga.pezzi_per_collo).toBe(24)
    expect(riga.prezzo_collo).toBe(25.05)
  })

  // Il confronto fra i due fornitori si fa AL PEZZO: fra 1,23 a bottiglia e
  // 25,05 al cartone da 24 il più economico è il cartone, e leggendo i due
  // numeri come sono scritti sembrerebbe il contrario.
  it('nella scheda il più economico è chi vende il cartone', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Bjorne')
    await user.click(screen.getByRole('button', { name: 'Apri la scheda di Bjorne (FONT)' }))
    const scheda = document.querySelector('.inv-row-dettaglio')
    expect(scheda).toHaveTextContent('più economico FONT a 1,04 €/pz')
    expect(scheda).toHaveTextContent('collo da 24: 25,05 €')
  })
})

describe('chi si compra a pezzo non si accorge di niente', () => {
  // L'uniformità sta nei CONTI, non nelle parole: un collo da uno esiste
  // dentro il codice e non deve mai affacciarsi a schermo. «1 collo di
  // Tanqueray» non lo dice nessuno.
  it('la parola «collo» non compare sulla riga di chi vende a bottiglia', async () => {
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Tanqueray')
    expect(screen.getByLabelText('Pezzi di Tanqueray (MAR)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Colli di Tanqueray (MAR)')).not.toBeInTheDocument()
    expect(rigaDi('Tanqueray (MAR)')).not.toHaveTextContent(/collo/i)
  })

  it('il prezzo resta uno solo, e l’ordine resta in pezzi', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Tanqueray')
    const riga = rigaDi('Tanqueray (MAR)')
    expect(within(riga).getByText('14,00 €')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Pezzi di Tanqueray (MAR)'), '3')
    expect(within(carrello()).getByText('3× Tanqueray')).toBeInTheDocument()
    await confermaOrdine(user, 'MAR')
    await waitFor(() => expect(creato).toHaveBeenCalled())
    const salvata = creato.mock.calls.at(-1)[0].lines.find((l) => l.item_id === 'tanqueray')
    expect(salvata.qty_packages).toBe(3)
    expect(salvata.unit_cost).toBe(14)
  })
})
