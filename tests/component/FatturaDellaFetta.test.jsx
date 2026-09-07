// @vitest-environment happy-dom
'use strict'

// ── IL LEGAME FATTURA ↔ FETTA, NELLE DUE SCHERMATE (REQ-MAG-031) ─────
//
// L'utente, 20/08: «la vista degli ordini contiene più fornitori, ma la
// fattura è collegata all'ordine PER IL FORNITORE, perché è il fornitore che
// rilascia la fattura».
//
// Qui si sorveglia quello che si vede: che da una fetta si arrivi alla sua
// fattura e da una fattura alla sua fetta, che il fornitore sbagliato non si
// possa nemmeno scegliere, e che i due buchi — merce arrivata senza
// documento, documento senza ordine — si vedano senza andarli a cercare.
// Sono le due cose che a fine mese fanno tornare o non tornare i conti con
// il commercialista.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const NOVA = { id: 'nova', name: 'Nova', email: 'ordini@nova.it', color: '#e74c3c' }
const ENOFEL = { id: 'enofel', name: 'Enofel', email: 'ordini@enofel.it', color: '#3498db' }

const ARTICOLI = [
  { id: 'campari', name: 'Campari', unit: 'pz', stock: 2, package_size: 700, content_unit: 'ml', cost: 12, vat: 22, kind: 'scorta', status: 'linea' },
  { id: 'gin', name: 'Gin Mare', unit: 'pz', stock: 5, package_size: 700, content_unit: 'ml', cost: 30, vat: 22, kind: 'scorta', status: 'linea' },
]

// Il giro del 20 agosto: DUE ORDINI, uno per fornitore (REQ-MAG-037). Nova
// ha consegnato, Enofel no — è il caso normale, consegnano in giorni
// diversi, ed è la ragione per cui i documenti sono due e non uno.
const ORDINE = {
  id: 'po-1',
  supplier_id: 'nova',
  supplier_name: 'Nova',
  created_at: '2026-08-20T09:00:00.000Z',
  status: 'ricevuto',
  total_net: 75,
  total_gross: 91.5,
  lines: [
    { item_id: 'campari', name: 'Campari', unit: 'pz', package_size: 700, qty_packages: 6, unit_cost: 12.5, vat: 22, supplier_id: 'nova', supplier_name: 'Nova', stato: 'consegnato' },
  ],
}

const ORDINE_ENOFEL = {
  id: 'po-2',
  supplier_id: 'enofel',
  supplier_name: 'Enofel',
  created_at: '2026-08-20T09:05:00.000Z',
  status: 'inviato',
  total_net: 30,
  total_gross: 36.6,
  lines: [
    { item_id: 'gin', name: 'Gin Mare', unit: 'pz', package_size: 700, qty_packages: 1, unit_cost: 30, vat: 22, supplier_id: 'enofel', supplier_name: 'Enofel', stato: 'richiesto' },
  ],
}

const FATTURA_NOVA = {
  id: 'inv-nova',
  supplier_id: 'nova',
  supplier_name: 'Nova',
  number: '1556',
  doc_type: 'Fattura',
  date: '2026-08-26',
  amount: 81,
  paid: false,
  lines: [],
  order_id: null,
}

const FATTURA_ENOFEL = { ...FATTURA_NOVA, id: 'inv-enofel', supplier_id: 'enofel', supplier_name: 'Enofel', number: '77', amount: 30 }

const stato = { ordini: [ORDINE, ORDINE_ENOFEL], fatture: [FATTURA_NOVA] }

vi.mock('../../src/lib/api.js', () => ({
  fetchInventoryItems: vi.fn(async () => ARTICOLI),
  fetchSuppliers: vi.fn(async () => [NOVA, ENOFEL]),
  fetchSupplierPrices: vi.fn(async () => []),
  fetchPurchaseOrders: vi.fn(async () => stato.ordini),
  fetchSupplierInvoices: vi.fn(async () => stato.fatture),
  // I modelli d'ordine (REQ-MAG-039): qui non si provano, ma il pannello li
  // legge insieme al resto e senza questi non partirebbe la lettura.
  fetchModelliOrdine: vi.fn(async () => []),
  salvaModelloOrdine: vi.fn((m) => ({ id: 'mod-1', ...m })),
  eliminaModelloOrdine: vi.fn(),
  createPurchaseOrder: vi.fn(async () => ({})),
  // I due gesti nuovi di REQ-MAG-037: i prodotti che passano in
  // assortimento alla conferma, e la riga che si toglie da un ordine già
  // fatto.
  liberaDaAssortimento: vi.fn(() => []),
  segnaInAssortimento: vi.fn(() => []),
  togliRigaOrdine: vi.fn(async () => ({ ordine: stato.ordini[0], articolo: null })),
  consegnaRigheOrdine: vi.fn(async () => ({})),
  deletePurchaseOrder: vi.fn(async () => {}),
  // I gesti nuovi della Lista ordini (REQ-MAG-038).
  confermaOrdine: vi.fn((o) => o),
  chiudiOrdine: vi.fn((o) => o),
  registraMovimentoOrdine: vi.fn((o) => o),
  generaFatturaDaOrdine: vi.fn(() => ({})),
  segnaFatturaPagata: vi.fn((f, paid) => ({ ...f, paid })),
  allineaPrezziDaFattura: vi.fn(async (o) => o),
  createSupplierInvoice: vi.fn(async () => ({})),
  updateSupplierInvoice: vi.fn(async () => {}),
  deleteSupplierInvoice: vi.fn(async () => {}),
  aggiungiProdottiAFattura: vi.fn(async () => ({})),
  // Come l'api vera: compone il documento aggiornato senza rileggerlo.
  collegaFatturaAFetta: vi.fn(async (id, { order_id }) => ({
    ...stato.fatture.find((f) => f.id === id),
    order_id: order_id || null,
  })),
}))

vi.mock('../../src/lib/printer.js', () => ({ printOrdineFornitore: vi.fn(async () => {}) }))
vi.mock('../../src/lib/toast.js', () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }))

import PurchaseOrdersPanel from '../../src/components/PurchaseOrdersPanel.jsx'
import SupplierInvoicesPanel from '../../src/components/SupplierInvoicesPanel.jsx'
import { collegaFatturaAFetta as collegato } from '../../src/lib/api.js'

beforeEach(() => {
  vi.clearAllMocks()
  stato.ordini = [ORDINE, ORDINE_ENOFEL]
  stato.fatture = [{ ...FATTURA_NOVA }]
})

// Apre il dettaglio di un ordine nella Lista ordini: il documento sta lì
// dentro, perché la lista si scorre per trovare un ordine e non per
// rileggerlo tutto (REQ-MAG-038).
async function apriOrdine(user, nome) {
  render(<PurchaseOrdersPanel vista="lista" />)
  await user.click(await screen.findByRole('button', { name: new RegExp(`L’ordine di ${nome}`) }))
}

describe('dall’ordine si vede se la fattura c’è', () => {
  // IL PRIMO DEI DUE BUCHI: la merce è arrivata, il documento no.
  it('un ordine consegnato senza documento lo dice, e si conta in testa', async () => {
    render(<PurchaseOrdersPanel vista="lista" />)
    expect(await screen.findByText('senza documento')).toBeInTheDocument()
    expect(screen.getByText('1 consegna senza documento')).toBeInTheDocument()
  })

  // L'ordine di Enofel è ancora «richiesto»: lì non è arrivato niente, e
  // segnalarlo insegnerebbe a ignorare il segnale.
  it('l’ordine ancora richiesto non risulta scoperto', async () => {
    render(<PurchaseOrdersPanel vista="lista" />)
    await screen.findByText('senza documento')
    expect(screen.getAllByText('senza documento')).toHaveLength(1)
  })

  it('con la fattura attaccata si legge il documento, e il buco si chiude', async () => {
    stato.fatture = [{ ...FATTURA_NOVA, order_id: 'po-1' }]
    const user = userEvent.setup()
    await apriOrdine(user, 'Nova')
    expect(await screen.findByText(/Fattura n\. 1556/)).toBeInTheDocument()
    expect(screen.queryByText('senza documento')).toBeNull()
    expect(screen.queryByText(/consegna senza documento/)).toBeNull()
  })
})

describe('il fornitore fa da guardia, e non si può nemmeno sbagliare', () => {
  it('all’ordine di Enofel si propongono solo i documenti di Enofel', async () => {
    stato.fatture = [FATTURA_NOVA, FATTURA_ENOFEL]
    const user = userEvent.setup()
    await apriOrdine(user, 'Enofel')
    await user.click(
      screen.getByRole('button', { name: 'Associa un documento all’ordine di Enofel' })
    )

    const tendina = screen.getByLabelText('Documento')
    expect(tendina.textContent).toContain('#77')
    // Quella di Nova non è in elenco: agganciarla qui vorrebbe dire pagare
    // merce a chi non l'ha venduta.
    expect(tendina.textContent).not.toContain('#1556')
  })

  it('un documento già agganciato altrove non si propone una seconda volta', async () => {
    stato.fatture = [{ ...FATTURA_NOVA, order_id: 'po-vecchio' }]
    const user = userEvent.setup()
    await apriOrdine(user, 'Nova')
    // Non c'è niente da scegliere, quindi il tasto è spento: il modo di
    // impedirlo è non farlo comparire, non spiegarlo dopo con un errore.
    expect(
      screen.getByRole('button', { name: 'Associa un documento all’ordine di Nova' })
    ).toBeDisabled()
  })
})

describe('si aggancia e si sgancia, dai due lati', () => {
  it('dall’ordine si sceglie il documento e la riga lo mostra subito', async () => {
    const user = userEvent.setup()
    await apriOrdine(user, 'Nova')
    await user.click(
      screen.getByRole('button', { name: 'Associa un documento all’ordine di Nova' })
    )
    await user.selectOptions(screen.getByLabelText('Documento'), 'inv-nova')
    await user.click(screen.getByRole('button', { name: 'Collega' }))

    expect(collegato).toHaveBeenCalledWith('inv-nova', { order_id: 'po-1' })
    // Niente attesa: l'esito si vede nell'istante in cui si tocca.
    expect(await screen.findByText(/Fattura n\. 1556/)).toBeInTheDocument()
  })

  it('e dall’ordine si stacca, che è lo stesso gesto al contrario', async () => {
    stato.fatture = [{ ...FATTURA_NOVA, order_id: 'po-1' }]
    const user = userEvent.setup()
    await apriOrdine(user, 'Nova')
    await user.click(
      await screen.findByRole('button', { name: 'Scollega il documento dall’ordine di Nova' })
    )

    expect(collegato).toHaveBeenCalledWith('inv-nova', { order_id: null })
    await waitFor(() => expect(screen.getByText('senza documento')).toBeInTheDocument())
  })

  it('dal documento si vede a quale parte di quale ordine si riferisce', async () => {
    stato.fatture = [{ ...FATTURA_NOVA, order_id: 'po-1' }]
    render(<SupplierInvoicesPanel />)
    // La data dell'ordine, quanti articoli e il netto: l'ordine è di Nova,
    // e il gin di Enofel sta nel suo, che è un altro documento.
    expect(await screen.findByText(/Ordine 2026-08-20 · 1 art\./)).toBeInTheDocument()
  })

  it('dal documento si collega, scegliendo fra gli ordini del suo fornitore', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await user.click(await screen.findByRole('button', { name: /Collega a un ordine il documento di Nova/ }))
    await user.selectOptions(screen.getByLabelText('Ordine'), 'po-1')
    await user.click(screen.getByRole('button', { name: 'Collega' }))

    expect(collegato).toHaveBeenCalledWith('inv-nova', { order_id: 'po-1' })
    expect(await screen.findByText(/Ordine 2026-08-20/)).toBeInTheDocument()
  })
})

describe('un documento senza ordine si vede, e si può isolare', () => {
  // IL SECONDO DEI DUE BUCHI: il documento c'è, l'ordine no.
  it('la riga lo dice, e il filtro tiene solo quelli', async () => {
    stato.fatture = [{ ...FATTURA_NOVA }, { ...FATTURA_ENOFEL, order_id: 'po-1' }]
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)

    expect(await screen.findByText('senza ordine')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Senza ordine (1)' }))
    // Resta il solo documento scoperto: quello di Enofel ha il suo ordine.
    await waitFor(() => expect(screen.queryByText('#77')).toBeNull())
    expect(screen.getByText('#1556')).toBeInTheDocument()
  })
})
