// @vitest-environment happy-dom
'use strict'

// IL TRAVASO DEL MAGAZZINO, IN MANO A CHI LAVORA (REQ-MAG-018).
//
// «Il travaso dovrebbe farlo l'utente. Quando entra in magazzino un banner
// gli dice che deve iniziare la migrazione. Quando preme ok, parte prima un
// dry run che lo avvisa dei prodotti che devono essere sistemati prima, e
// poi, se tutto è come se lo aspetta, chiede conferma e migra i dati»
// (18/08). Niente di automatico: il database lo cambia un gesto, e prima di
// quel gesto si vede cosa cambia.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

// Il magazzino com'è messo in ogni prova lo decide questa variabile: la
// stessa schermata deve comportarsi in tre modi diversi — già a posto, da
// aggiornare, con roba da sistemare prima — e sono tre situazioni vere.
let ITEMS = []

vi.mock('../../src/lib/api.js', () => ({
  fetchInventoryItems: vi.fn(() => Promise.resolve(ITEMS)),
  createInventoryItem: vi.fn((x) => Promise.resolve({ id: 'nuovo', ...x })),
  updateInventoryItem: vi.fn(() => Promise.resolve({})),
  deleteInventoryItem: vi.fn(() => Promise.resolve()),
  loadStock: vi.fn(() => Promise.resolve({})),
  receiveBottles: vi.fn(() => Promise.resolve({})),
  adjustStock: vi.fn(() => Promise.resolve({})),
  travasaMagazzinoAPezzi: vi.fn(({ onAvanzamento } = {}) => {
    onAvanzamento?.(0, 2)
    onAvanzamento?.(2, 2)
    return Promise.resolve({ travasati: 2 })
  }),
  fetchStockMovements: vi.fn(() => Promise.resolve([])),
  fetchInventoryCategories: vi.fn(() => Promise.resolve([])),
  createInventoryCategory: vi.fn(() => Promise.resolve({})),
  updateInventoryCategory: vi.fn(() => Promise.resolve({})),
  deleteInventoryCategory: vi.fn(() => Promise.resolve()),
  fetchMacroCategories: vi.fn(() => Promise.resolve([])),
  createMacroCategory: vi.fn(() => Promise.resolve({})),
  updateMacroCategory: vi.fn(() => Promise.resolve({})),
  deleteMacroCategory: vi.fn(() => Promise.resolve()),
  fetchSuppliers: vi.fn(() => Promise.resolve([])),
  fetchSupplierPrices: vi.fn(() => Promise.resolve([])),
  salvaRigaListino: vi.fn(() => Promise.resolve({})),
  createSupplier: vi.fn(() => Promise.resolve({})),
  updateSupplier: vi.fn(() => Promise.resolve({})),
  deleteSupplier: vi.fn(() => Promise.resolve()),
  subscribeSettings: (cb) => {
    cb({ price_markup: 3, purchase_vat: 22 })
    return () => {}
  },
  // Il magazzino parte dalla CACHE delle impostazioni (REQ-LIC-001): le
  // sezioni premium non devono comparire e sparire mentre il server
  // risponde. Qui i moduli sono spenti, come sul locale che non li ha.
  settingsIniziali: () => ({ price_markup: 3, purchase_vat: 22 }),
  subscribeOpenCashSession: (cb) => {
    cb(null)
    return () => {}
  },
  subscribeActiveOrders: (cb) => {
    cb([])
    return () => {}
  },
  subscribeDrinks: (_opts, cb) => {
    cb([])
    return () => {}
  },
  DEFAULT_SETTINGS: { price_markup: 3, purchase_vat: 22 },
}))
vi.mock('../../src/components/StockCountPanel.jsx', () => ({ default: () => <div>CONTA</div> }))
vi.mock('../../src/components/PurchaseOrdersPanel.jsx', () => ({ default: () => <div>ORDINI</div> }))
vi.mock('../../src/components/SupplierInvoicesPanel.jsx', () => ({
  default: () => <div>SCADENZARIO</div>,
}))

import InventoryManager from '../../src/components/InventoryManager.jsx'
import { travasaMagazzinoAPezzi } from '../../src/lib/api.js'

// Un prodotto già a posto: si conta a pezzi e non ha niente da raccontare.
const aPosto = {
  id: 'campari',
  name: 'Campari',
  unit: 'pz',
  package_size: 1000,
  content_unit: 'ml',
  stock: 3,
  cost: 12,
  vat: 22,
}
// Uno letto travasato al volo: sul database è ancora a litri, e la lettura
// tollerante lo mostra in pezzi portandosi dietro da dove viene.
const daMigrare = {
  id: 'spina',
  name: 'Birra alla spina',
  unit: 'pz',
  package_size: 20000,
  content_unit: 'ml',
  stock: 0.92,
  cost: 60,
  vat: 22,
  formaVecchia: { unit: 'ml', stock: 18400 },
}
// E uno che nemmeno la lettura sa portare a pezzi: comprato a chili e
// spremuto in centilitri, cos'è un pezzo lo deve dire una persona.
const daSistemare = {
  id: 'limoni',
  name: 'Limoni',
  unit: 'g',
  package_size: 1000,
  resa: 0.5,
  resa_unit: 'ml',
  stock: 5000,
  low_threshold: 1000,
  cost: 2,
  vat: 4,
}

beforeEach(() => {
  travasaMagazzinoAPezzi.mockReset()
  travasaMagazzinoAPezzi.mockImplementation(({ onAvanzamento } = {}) => {
    onAvanzamento?.(0, 2)
    onAvanzamento?.(2, 2)
    return Promise.resolve({ travasati: 2, saltati: 0, bloccati: 0 })
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('quando il magazzino è già a posto', () => {
  it('di tutta questa faccenda non si vede niente', async () => {
    // Può succedere che i dati arrivino già sistemati da un'altra strada:
    // un cartello acceso su un database a posto è peggio di nessun cartello.
    ITEMS = [aPosto]
    render(<InventoryManager />)
    await screen.findByText('Campari')
    expect(screen.queryByText(/Il magazzino va aggiornato/)).toBeNull()
    expect(screen.getByRole('button', { name: '+ Nuovo prodotto' })).not.toBeDisabled()
  })
})

describe('quando c’è da aggiornare', () => {
  it('il banner lo dice entrando, e prima si guarda cosa cambia', async () => {
    ITEMS = [aPosto, daMigrare]
    const user = userEvent.setup()
    render(<InventoryManager />)
    await screen.findByText('Campari')
    expect(screen.getByText(/Il magazzino va aggiornato/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Guarda cosa cambia/ }))
    const box = await screen.findByRole('dialog', { name: /Cosa cambia/ })
    // È una prova a vuoto: qui non si scrive niente, e c'è scritto.
    expect(within(box).getByText(/non cambia niente/)).toBeInTheDocument()
    // E si vede il prodotto per nome, con la giacenza prima e dopo.
    expect(within(box).getByText('Birra alla spina')).toBeInTheDocument()
    expect(within(box).getByText(/18,4 L → 0,92 pz/)).toBeInTheDocument()
    expect(travasaMagazzinoAPezzi).not.toHaveBeenCalled()
  })

  it('finché non si aggiorna, il magazzino è in sola lettura', async () => {
    ITEMS = [aPosto, daMigrare]
    const user = userEvent.setup()
    render(<InventoryManager />)
    await screen.findByText('Campari')
    // Niente prodotti nuovi…
    expect(screen.getByRole('button', { name: '+ Nuovo prodotto' })).toBeDisabled()
    // …e niente carico né conta: scriverebbero pezzi su una giacenza
    // ancora contata in centilitri.
    await user.click(screen.getByText('Campari'))
    expect(screen.queryByRole('button', { name: /Carico/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Modifica/ })).toBeDisabled()
  })

  it('e con la conferma si aggiorna, dicendo a che punto sta', async () => {
    ITEMS = [aPosto, daMigrare]
    const user = userEvent.setup()
    render(<InventoryManager />)
    await screen.findByText('Campari')
    await user.click(screen.getByRole('button', { name: /Guarda cosa cambia/ }))
    await user.click(await screen.findByRole('button', { name: /Aggiorna 1 prodott/ }))
    await waitFor(() => expect(travasaMagazzinoAPezzi).toHaveBeenCalled())
    expect(await screen.findByText(/Magazzino aggiornato/)).toBeInTheDocument()
  })
})

describe('quando c’è roba da sistemare prima', () => {
  it('la prova a vuoto li elenca per nome, e non offre di aggiornare', async () => {
    // Nomi, non conteggi: chi legge deve sapere quali aprire.
    ITEMS = [aPosto, daMigrare, daSistemare]
    const user = userEvent.setup()
    render(<InventoryManager />)
    await screen.findByText('Campari')
    await user.click(screen.getByRole('button', { name: /Guarda cosa cambia/ }))
    const box = await screen.findByRole('dialog', { name: /Cosa cambia/ })
    expect(within(box).getByText('Limoni')).toBeInTheDocument()
    expect(within(box).getByText(/si compra a g e si usa in ml/)).toBeInTheDocument()
    expect(within(box).queryByRole('button', { name: /Aggiorna/ })).toBeNull()
  })

  it('e proprio quelli si possono ancora aprire: è l’unico modo di sbloccare', async () => {
    ITEMS = [aPosto, daSistemare]
    const user = userEvent.setup()
    render(<InventoryManager />)
    await screen.findByText('Campari')
    await user.click(screen.getByText('Limoni'))
    const modifica = screen.getByRole('button', { name: /Modifica/ })
    expect(modifica).not.toBeDisabled()
    await user.click(modifica)
    // La scheda dice cosa manca e cosa succede alla giacenza.
    expect(screen.getByText(/blocca/)).toBeInTheDocument()
    // La scheda riparte da com'era scritto — comprato al chilo — e già così
    // la giacenza si conta: cinque chili, cinque pezzi da un chilo.
    const contenuto = screen.getByLabelText(/A quanto corrisponde un pezzo/)
    expect(contenuto).toHaveValue(1000)
    expect(document.querySelector('.banner').textContent).toMatch(/5 pz/)
    // Dicendo invece che un pezzo è un limone da 100 g, i cinque chili
    // diventano cinquanta limoni.
    await user.clear(contenuto)
    await user.type(contenuto, '100')
    expect(document.querySelector('.banner').textContent).toMatch(/50 pz/)
  })
})

// ── IL CARTELLO E LA PROVA A VUOTO NON MENTONO MAI ───────────────────
// Il magazzino si legge una volta sola (non è la coda, e va benissimo così),
// ma qualcuno può cambiare i prodotti da un altro terminale. Successo
// davvero il 18/08: la schermata contava ancora la lista di dieci minuti
// prima, e l'aggiornamento è andato a scrivere su documenti spariti.
describe('la prova a vuoto rilegge sempre', () => {
  it('conta i prodotti di adesso, non quelli visti prima', async () => {
    ITEMS = [aPosto, daMigrare]
    const user = userEvent.setup()
    render(<InventoryManager />)
    await screen.findByText('Campari')

    // Nel frattempo il magazzino cambia sotto: quello da aggiornare non c'è
    // più, ne è arrivato un altro.
    ITEMS = [aPosto, { ...daMigrare, id: 'altro', name: 'Vermut della casa' }]
    await user.click(screen.getByRole('button', { name: /Guarda cosa cambia/ }))
    const box = await screen.findByRole('dialog', { name: /Cosa cambia/ })
    expect(within(box).getByText('Vermut della casa')).toBeInTheDocument()
    expect(within(box).queryByText('Birra alla spina')).toBeNull()
  })

  it('e se nel frattempo è già tutto a posto, il cartello sparisce da solo', async () => {
    ITEMS = [aPosto, daMigrare]
    const user = userEvent.setup()
    render(<InventoryManager />)
    await screen.findByText('Campari')
    ITEMS = [aPosto]
    await user.click(screen.getByRole('button', { name: /Guarda cosa cambia/ }))
    await waitFor(() =>
      expect(screen.queryByText(/Il magazzino va aggiornato/)).toBeNull()
    )
  })
})

// ── LA LINGUA DEL DATABASE NON ARRIVA AL BANCO ───────────────────────
// «NOT_FOUND: no entity to update: app dev~demo-tana-drink path < Element
// {...} >» è finito davvero in mezzo alla schermata. Chi ha in mano un
// vassoio deve leggere cos'è successo e cosa può fare, non il nome interno
// di un documento.
describe('quello che si legge quando qualcosa va storto', () => {
  it('i prodotti spariti si contano e si dicono in italiano', async () => {
    ITEMS = [aPosto, daMigrare]
    travasaMagazzinoAPezzi.mockResolvedValueOnce({ travasati: 3, saltati: 2, bloccati: 0 })
    const user = userEvent.setup()
    render(<InventoryManager />)
    await screen.findByText('Campari')
    await user.click(screen.getByRole('button', { name: /Guarda cosa cambia/ }))
    await user.click(await screen.findByRole('button', { name: /Aggiorna/ }))
    expect(await screen.findByText(/2 prodotti non ci sono più/)).toBeInTheDocument()
    expect(screen.getByText(/Gli altri sono a posto/)).toBeInTheDocument()
  })

  it('e se si ferma davvero, dice cosa è passato e che si può riprovare', async () => {
    ITEMS = [aPosto, daMigrare]
    travasaMagazzinoAPezzi.mockRejectedValueOnce(
      new Error('NOT_FOUND: no entity to update: app: "dev~demo-tana-drink" path < Element {…} >')
    )
    const user = userEvent.setup()
    render(<InventoryManager />)
    await screen.findByText('Campari')
    await user.click(screen.getByRole('button', { name: /Guarda cosa cambia/ }))
    await user.click(await screen.findByRole('button', { name: /Aggiorna/ }))
    expect(await screen.findByText(/si è fermato/)).toBeInTheDocument()
    expect(screen.getByText(/puoi riprovare/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/NOT_FOUND|Element|dev~/)
  })
})
