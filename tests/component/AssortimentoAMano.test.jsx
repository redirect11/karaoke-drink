// @vitest-environment happy-dom
'use strict'

// ── A MANO SI PUÒ, MA COSTA UNA DOMANDA (REQ-MAG-037) ────────────────
//
// «Gli si deve DIRE che quel prodotto è presente in un ordine in attesa di
// essere ricevuto. Se cambia lo stato manualmente, il prodotto va eliminato
// dall'ordine» (utente, 27/08/2026). Sono la stessa decisione presa dai due
// capi e non possono divergere: un prodotto non più «in assortimento» che
// resta dentro un ordine aperto è un ordine che nessuno sa più di aver
// fatto.
//
// E L'INTERFACCIA DEL MAGAZZINO NON CAMBIA: nessun comando spostato, nessuna
// colonna nuova. Quello che cambia è il VALORE che la lista mostra — un
// prodotto dentro un ordine aperto si legge «in assortimento» — e la domanda
// che compare quando si cambia quello stato a mano.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

// Il Campari sta in un ordine ancora in attesa: è in assortimento, e si
// ricorda di essere «in linea».
const CAMPARI = {
  id: 'campari',
  name: 'Campari',
  unit: 'pz',
  package_size: 700,
  content_unit: 'ml',
  stock: 3,
  category_id: 'c1',
  cost: 12,
  vat: 22,
  low_threshold: 0,
  status: 'assortimento',
  assortimento_da: 'linea',
  ordini_assortimento: ['po-1'],
}
// Il Rum non sta in nessun ordine: cambiargli stato non deve chiedere
// niente a nessuno.
const RUM = {
  id: 'rum',
  name: 'Rum Zacapa',
  unit: 'pz',
  package_size: 700,
  content_unit: 'ml',
  stock: 2,
  category_id: 'c1',
  cost: 40,
  vat: 22,
  low_threshold: 0,
  status: 'premium',
}

const CATS = [{ id: 'c1', name: 'Distillati', sort_order: 0 }]
const stato = { impostazioni: { price_markup: 3, purchase_vat: 22 } }

vi.mock('../../src/components/StockCountPanel.jsx', () => ({
  default: () => <div>PANNELLO CONTA</div>,
}))
vi.mock('../../src/lib/paginaPiena.js', () => ({ usePaginaPiena: () => {} }))
vi.mock('../../src/lib/toast.js', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastSync: vi.fn(),
}))
vi.mock('../../src/lib/cashSession.js', () => ({
  useCashSession: () => ({ session: null, open: false, loading: false }),
}))

vi.mock('../../src/lib/api.js', () => ({
  fetchInventoryItems: vi.fn(async () => [CAMPARI, RUM]),
  fetchInventoryCategories: vi.fn(async () => CATS),
  fetchSuppliers: vi.fn(async () => []),
  fetchSupplierPrices: vi.fn(async () => []),
  salvaRigaListino: vi.fn(async () => ({})),
  fetchStockMovements: vi.fn(async () => []),
  fetchMacroCategories: vi.fn(async () => []),
  createInventoryItem: vi.fn(async (i) => ({ id: 'nuovo', ...i })),
  updateInventoryItem: vi.fn(async (id, patch) => ({ id, ...patch })),
  deleteInventoryItem: vi.fn(),
  togliProdottoDagliOrdini: vi.fn(async () => []),
  loadStock: vi.fn(),
  receiveBottles: vi.fn(),
  adjustStock: vi.fn(),
  createInventoryCategory: vi.fn(),
  updateInventoryCategory: vi.fn(),
  deleteInventoryCategory: vi.fn(),
  createMacroCategory: vi.fn(),
  updateMacroCategory: vi.fn(),
  deleteMacroCategory: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
  subscribeOpenCashSession: vi.fn((cb) => {
    cb(null)
    return () => {}
  }),
  subscribeActiveOrders: vi.fn((cb) => {
    cb([])
    return () => {}
  }),
  subscribeDrinks: vi.fn((_opts, cb) => {
    cb([])
    return () => {}
  }),
  subscribeSettings: vi.fn((cb) => {
    cb(stato.impostazioni)
    return () => {}
  }),
  settingsIniziali: () => stato.impostazioni,
  DEFAULT_SETTINGS: { price_markup: 3, purchase_vat: 22 },
}))

import InventoryManager from '../../src/components/InventoryManager.jsx'
import {
  updateInventoryItem as aggiornato,
  togliProdottoDagliOrdini as liberato,
} from '../../src/lib/api.js'

beforeEach(() => {
  vi.clearAllMocks()
})

// Si apre la scheda di un prodotto: riga, poi «✏️ Modifica».
async function apriScheda(user, nome) {
  render(<InventoryManager />)
  await screen.findByText(nome)
  await user.click(screen.getByText(nome).closest('button'))
  await user.click(screen.getByRole('button', { name: /Modifica/ }))
  await screen.findByText('Modifica prodotto')
}

describe('il magazzino legge «in assortimento» chi sta in un ordine', () => {
  it('la lista mostra lo stato di passaggio, non quello di prima', async () => {
    render(<InventoryManager />)
    await screen.findByText('Campari')
    const riga = screen.getByText('Campari').closest('.inv-row')
    // La striscia e il titolo della riga sono quelli dell'assortimento: è il
    // cambiamento voluto, «i prodotti ordinati in magazzino diventeranno in
    // assortimento».
    expect(riga.className).toMatch(/ass-assortimento/)
    expect(riga).toHaveAttribute('title', 'In assortimento')
  })
})

describe('cambiare lo stato a mano su un prodotto ordinato', () => {
  it('lo dice prima, e non salva niente finché non si risponde', async () => {
    const user = userEvent.setup()
    await apriScheda(user, 'Campari')
    await user.selectOptions(screen.getByLabelText('Stato'), 'premium')
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    const avviso = await screen.findByText(/è in un ordine aperto/)
    expect(avviso.closest('.confirm-box')).toHaveTextContent(
      /fa parte di un ordine ancora in attesa di consegna/
    )
    expect(aggiornato).not.toHaveBeenCalled()
    // Annullando non succede niente: la scheda resta aperta com'era.
    await user.click(within(avviso.closest('.confirm-box')).getByRole('button', { name: 'Annulla' }))
    expect(aggiornato).not.toHaveBeenCalled()
    expect(screen.getByText('Modifica prodotto')).toBeInTheDocument()
  })

  it('confermando, lo stato si scrive e il prodotto esce dall’ordine', async () => {
    const user = userEvent.setup()
    await apriScheda(user, 'Campari')
    await user.selectOptions(screen.getByLabelText('Stato'), 'premium')
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await screen.findByText(/è in un ordine aperto/)
    await user.click(screen.getByRole('button', { name: 'Cambia lo stato' }))

    await waitFor(() => expect(aggiornato).toHaveBeenCalled())
    const [id, patch] = aggiornato.mock.calls.at(-1)
    expect(id).toBe('campari')
    // Lo stato scelto, e la memoria liberata: non è più in passaggio.
    expect(patch).toMatchObject({
      status: 'premium',
      assortimento_da: null,
      ordini_assortimento: [],
    })
    // E il legame si taglia anche dall'altra parte.
    await waitFor(() => expect(liberato).toHaveBeenCalledWith('campari', ['po-1']))
  })
})

describe('senza ordini aperti non si chiede niente', () => {
  it('il prodotto che non sta in nessun ordine si salva e basta', async () => {
    const user = userEvent.setup()
    await apriScheda(user, 'Rum Zacapa')
    await user.selectOptions(screen.getByLabelText('Stato'), 'linea')
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(aggiornato).toHaveBeenCalled())
    expect(screen.queryByText(/è in un ordine aperto/)).toBeNull()
    // La memoria si libera comunque: uno stato scritto a mano non è uno
    // stato di passaggio.
    expect(aggiornato.mock.calls.at(-1)[1]).toMatchObject({
      status: 'linea',
      assortimento_da: null,
      ordini_assortimento: [],
    })
    expect(liberato).not.toHaveBeenCalled()
  })

  // Mettercelo a mano è legittimo, e si ricorda da dove viene: così, se poi
  // ci finisce dentro un ordine e l'ordine arriva, torna al suo posto.
  it('metterlo a mano in assortimento registra da dove viene', async () => {
    const user = userEvent.setup()
    await apriScheda(user, 'Rum Zacapa')
    await user.selectOptions(screen.getByLabelText('Stato'), 'assortimento')
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(aggiornato).toHaveBeenCalled())
    expect(aggiornato.mock.calls.at(-1)[1]).toMatchObject({
      status: 'assortimento',
      assortimento_da: 'premium',
      ordini_assortimento: [],
    })
  })
})
