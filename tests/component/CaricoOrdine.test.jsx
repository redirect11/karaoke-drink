// @vitest-environment happy-dom
'use strict'

// ── IL CARICO DI UNA CONSEGNA, RIGA PER RIGA E TUTTO INSIEME ─────────
//
// REQ-MAG-025 punto 4, parole dell'utente il 20/08: «è il bartender che
// decide, quando l'ordine è arrivato, SE e QUALI prodotti caricare in
// inventario. Riga per riga, più un tasto CARICA TUTTI». Il fornitore
// consegna quello che ha, non quello che è stato ordinato: le due casse su
// tre arrivate si caricano, la terza resta in attesa.
//
// L'ASSORTIMENTO PRE-IMPOSTATO NON C'È PIÙ (REQ-MAG-025 punto 5), e la sua
// casella nemmeno: da REQ-MAG-037 «in assortimento» vuol dire «c'è un ordine
// aperto», quindi la consegna è il momento in cui quello stato FINISCE, non
// quello in cui comincia. Cosa succede allo stato commerciale al carico lo
// sorveglia tests/unit/prodottoNuovoDaOrdine.test.js, sul codice vero.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const NOVA = { id: 'nova', name: 'Nova', email: 'ordini@nova.it', color: '#e74c3c' }

const ARTICOLI = [
  { id: 'campari', name: 'Campari', unit: 'pz', stock: 2, package_size: 700, content_unit: 'ml', cost: 12, vat: 22, kind: 'scorta', status: 'assortimento' },
  { id: 'gin', name: 'Gin Mare', unit: 'pz', stock: 5, package_size: 700, content_unit: 'ml', cost: 30, vat: 22, kind: 'scorta', status: 'assortimento' },
  // Un premium: è su questo che il pre-impostato cambia qualcosa, e quindi
  // è l'unico a cui la casella viene chiesta.
  { id: 'rum', name: 'Rum Zacapa', unit: 'pz', stock: 1, package_size: 700, content_unit: 'ml', cost: 45, vat: 22, kind: 'scorta', status: 'premium' },
]

// Una fetta sola, con tre righe: è il caso in cui «quali caricare» conta.
const ORDINE = {
  id: 'po-1',
  created_at: '2026-08-27T09:00:00.000Z',
  status: 'inviato',
  total_net: 152,
  total_gross: 185.44,
  lines: [
    { item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12, vat: 22, supplier_id: 'nova', supplier_name: 'Nova', stato: 'richiesto' },
    { item_id: 'gin', name: 'Gin Mare', qty_packages: 2, unit_cost: 30, vat: 22, supplier_id: 'nova', supplier_name: 'Nova', stato: 'richiesto' },
    { item_id: 'rum', name: 'Rum Zacapa', qty_packages: 1, unit_cost: 45, vat: 22, supplier_id: 'nova', supplier_name: 'Nova', stato: 'richiesto' },
  ],
}

const stato = { ordini: [], listini: [], fatture: [] }

vi.mock('../../src/lib/api.js', () => ({
  fetchInventoryItems: vi.fn(async () => ARTICOLI),
  fetchSuppliers: vi.fn(async () => [NOVA]),
  fetchSupplierPrices: vi.fn(async () => stato.listini),
  fetchPurchaseOrders: vi.fn(async () => stato.ordini),
  createPurchaseOrder: vi.fn(async (o) => ({ id: `po-nuovo-${(stato.creati = (stato.creati || 0) + 1)}`, created_at: '2026-08-27T09:00:00.000Z', status: 'inviato', ...o })),
  // I due gesti nuovi di REQ-MAG-037: i prodotti che passano in
  // assortimento alla conferma, e la riga che si toglie da un ordine già
  // fatto.
  liberaDaAssortimento: vi.fn(() => []),
  segnaInAssortimento: vi.fn(() => []),
  togliRigaOrdine: vi.fn(async () => ({ ordine: stato.ordini[0], articolo: null })),
  consegnaRigheOrdine: vi.fn(async (id) => ({ ...stato.ordini[0], id })),
  segnaRighePagate: vi.fn(async (id) => ({ ...stato.ordini[0], id })),
  deletePurchaseOrder: vi.fn(async () => {}),
  fetchSupplierInvoices: vi.fn(async () => stato.fatture),
  // I modelli d'ordine (REQ-MAG-039): qui non si provano, ma il pannello li
  // legge insieme al resto e senza questi non partirebbe la lettura.
  fetchModelliOrdine: vi.fn(async () => []),
  salvaModelloOrdine: vi.fn((m) => ({ id: 'mod-1', ...m })),
  eliminaModelloOrdine: vi.fn(),
  collegaFatturaAFetta: vi.fn(async () => ({})),
}))

vi.mock('../../src/lib/printer.js', () => ({ printOrdineFornitore: vi.fn(async () => {}) }))
vi.mock('../../src/lib/toast.js', () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }))

import PurchaseOrdersPanel from '../../src/components/PurchaseOrdersPanel.jsx'
import {
  consegnaRigheOrdine as consegnato,
  createPurchaseOrder as creato,
} from '../../src/lib/api.js'

beforeEach(() => {
  vi.clearAllMocks()
  stato.ordini = []
  stato.listini = []
  stato.fatture = []
})

// Apre la finestra della consegna sulla fetta di Nova.
async function apriConsegna(user) {
  render(<PurchaseOrdersPanel vista="lista" />)
  const storico = (await screen.findByText('Lista ordini')).closest('.card')
  const riga = within(storico).getByText('Nova').closest('.inv-row')
  await user.click(within(riga).getByRole('button', { name: /Consegnato/ }))
  return await screen.findByLabelText('Carica Campari')
}

describe('si decide SE e QUALI righe caricare', () => {
  beforeEach(() => {
    stato.ordini = [ORDINE]
  })

  // SI PARTE CON TUTTO SPUNTATO: la consegna intera è il caso normale, e chi
  // non tocca niente carica quello che ha ordinato.
  it('all’apertura sono spuntate tutte, e il tasto lo dice', async () => {
    const user = userEvent.setup()
    const prima = await apriConsegna(user)
    expect(prima).toBeChecked()
    expect(screen.getByLabelText('Carica Gin Mare')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Carica tutti (3)' })).toBeInTheDocument()
  })

  it('togliendo una spunta si carica solo il resto, e il tasto cambia parole', async () => {
    const user = userEvent.setup()
    await apriConsegna(user)
    await user.click(screen.getByLabelText('Carica Gin Mare'))
    const tasto = screen.getByRole('button', { name: 'Carica i selezionati (2)' })
    await user.click(tasto)
    const [id, opts] = consegnato.mock.calls.at(-1)
    expect(id).toBe('po-1')
    // La riga 1 (il Gin) resta «richiesta»: si caricherà quando arriva.
    expect(opts.indici).toEqual([0, 2])
  })

  // «Più un tasto CARICA TUTTI»: le tre righe si caricano in un gesto, senza
  // spuntarle a una a una.
  it('«Carica tutti» manda tutte le righe ancora richieste della fetta', async () => {
    const user = userEvent.setup()
    await apriConsegna(user)
    await user.click(screen.getByRole('button', { name: 'Carica tutti (3)' }))
    expect(consegnato.mock.calls.at(-1)[1].indici).toEqual([0, 1, 2])
  })

  it('la spunta si toglie e si rimette a tutte in un colpo', async () => {
    const user = userEvent.setup()
    await apriConsegna(user)
    await user.click(screen.getByRole('button', { name: 'Togli tutte le spunte' }))
    // Senza niente spuntato non si carica: il tasto è spento, e non c'è
    // nessun gesto che scriva a vuoto.
    expect(screen.getByRole('button', { name: 'Carica i selezionati (0)' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Spunta tutte' }))
    expect(screen.getByRole('button', { name: 'Carica tutti (3)' })).toBeInTheDocument()
  })

  // Di lì si carica, non si ricarica: una riga già consegnata non torna
  // nella finestra, come le righe già in archivio della fattura
  // (REQ-MAG-030).
  it('le righe già consegnate non compaiono più', async () => {
    const user = userEvent.setup()
    stato.ordini = [
      { ...ORDINE, lines: [{ ...ORDINE.lines[0], stato: 'consegnato' }, ORDINE.lines[1], ORDINE.lines[2]] },
    ]
    render(<PurchaseOrdersPanel vista="lista" />)
    const storico = (await screen.findByText('Lista ordini')).closest('.card')
    const riga = within(storico).getByText('Nova').closest('.inv-row')
    await user.click(within(riga).getByRole('button', { name: /Consegnato/ }))
    await screen.findByLabelText('Carica Gin Mare')
    expect(screen.queryByLabelText('Carica Campari')).toBeNull()
    expect(screen.getByRole('button', { name: 'Carica tutti (2)' })).toBeInTheDocument()
  })
})

// ── LA CASELLA DELL'ASSORTIMENTO NON DEVE TORNARE (REQ-MAG-037) ────
//
// Fino al 27/08 la scheda della riga aveva una casella «In assortimento
// quando arriva», e la riga d'ordine si portava dietro un `status_target`.
// Non è stata tolta per semplificare: «in assortimento» ha cambiato
// significato, e adesso vuol dire «c'è un ordine aperto». Una casella che
// dice «mettilo in assortimento QUANDO ARRIVA» chiederebbe di accendere uno
// stato nell'istante esatto in cui va spento.
//
// Il passaggio in assortimento non si chiede più a nessuno: lo decide la
// conferma dell'ordine nel riepilogo, e basta quella.
//
// DA REQ-MAG-038 LE SCHERMATE SONO DUE: la consegna si fa dalla «Lista
// ordini» (`vista="lista"`), la composizione dal «Nuovo ordine», che è
// quello che il pannello mostra senza dirgli niente.
describe('la casella dell’assortimento non c’è più', () => {
  const apri = (user, nome) =>
    user.click(screen.getByRole('button', { name: `Apri la scheda di ${nome} (senza fornitore)` }))

  it('la scheda della riga non chiede più niente sull’assortimento', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    await apri(user, 'Rum Zacapa')
    expect(screen.queryByLabelText(/in assortimento quando arriva/i)).toBeNull()
  })

  it('sulla riga d’ordine non si scrive nessuno stato da applicare', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    await user.type(screen.getByLabelText('Pezzi di Rum Zacapa (senza fornitore)'), '1')
    await user.click(screen.getByRole('button', { name: /Rivedi e conferma/ }))
    await user.click(screen.getByRole('button', { name: /Crea l/ }))
    await waitFor(() => expect(creato).toHaveBeenCalled())
    expect(creato.mock.calls.at(-1)[0].lines[0].status_target).toBeUndefined()
  })
})
