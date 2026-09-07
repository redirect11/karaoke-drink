// @vitest-environment happy-dom
'use strict'

// ── IL RIEPILOGO PER FORNITORE (REQ-MAG-037) ─────────────────────────
//
// «La creazione dell'ordine deve portarmi a una schermata di RIEPILOGO dove
// avrò una serie di tabelle in base all'ordine che voglio fare ai vari
// fornitori. Le tabelle saranno A SCOMPARSA, una sotto l'altra: se clicco
// sul nome di un fornitore mi si apre la tabella dei prodotti selezionati
// per quel fornitore, che io posso revisionare, e PER SINGOLO FORNITORE
// posso creare l'ordine. Se confermo l'ordine per quel fornitore, sulla riga
// relativa al fornitore vedrò il badge ORDINATO e tutti i prodotti di
// quell'ordine passeranno IN ASSORTIMENTO» (utente, 27/08/2026).
//
// Qui si sorveglia tutto il giro: chi si vede, cosa si apre, cosa nasce alla
// conferma — UN ORDINE PER FORNITORE — e quando i prodotti cambiano stato,
// che è la cosa da non sbagliare. In fondo c'è l'altro capo della stessa
// voce: togliere un item da un ordine GIÀ MANDATO, che è una delle due sole
// strade per far uscire un prodotto da «in assortimento».

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const NOVA = { id: 'nova', name: 'Nova', email: 'ordini@nova.it', color: '#e74c3c' }
const ENOFEL = { id: 'enofel', name: 'Enofel', email: 'ordini@enofel.it', color: '#3498db' }

// Due prodotti, due fornitori, tutti e due da riordinare: è il caso da cui
// nasce la voce — un giro solo, due ordini.
const CAMPARI = { id: 'campari', name: 'Campari', unit: 'pz', stock: 0, low_threshold: 2, package_size: 700, cost: 12, vat: 22, kind: 'scorta', status: 'linea' }
const GIN = { id: 'gin', name: 'Gin Mare', unit: 'pz', stock: 1, low_threshold: 2, package_size: 700, cost: 30, vat: 22, kind: 'scorta', status: 'premium' }

const LISTINI = [
  { id: 'nova__campari', supplier_id: 'nova', item_id: 'campari', price: 12.5, last_price_at: '2026-08-01T10:00:00.000Z' },
  { id: 'enofel__gin', supplier_id: 'enofel', item_id: 'gin', price: 28, last_price_at: '2026-05-01T10:00:00.000Z' },
]

const stato = { articoli: [CAMPARI, GIN], listini: LISTINI, ordini: [], fatture: [], creati: 0 }

vi.mock('../../src/lib/api.js', () => ({
  fetchInventoryItems: vi.fn(async () => stato.articoli),
  fetchSuppliers: vi.fn(async () => [NOVA, ENOFEL]),
  fetchSupplierPrices: vi.fn(async () => stato.listini),
  fetchPurchaseOrders: vi.fn(async () => stato.ordini),
  createPurchaseOrder: vi.fn((o) => ({
    id: `po-${(stato.creati = stato.creati + 1)}`,
    created_at: '2026-08-27T09:00:00.000Z',
    status: 'inviato',
    ...o,
  })),
  // Torna i prodotti aggiornati, come quello vero: la schermata li mostra
  // senza rileggere niente.
  liberaDaAssortimento: vi.fn(() => []),
  segnaInAssortimento: vi.fn((articoli) =>
    articoli.map((a) => ({ ...a, status: 'assortimento', assortimento_da: a.status }))
  ),
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
  collegaFatturaAFetta: vi.fn(async (id) => ({ id })),
}))

vi.mock('../../src/lib/printer.js', () => ({ printOrdineFornitore: vi.fn(async () => {}) }))
vi.mock('../../src/lib/toast.js', () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }))

import PurchaseOrdersPanel from '../../src/components/PurchaseOrdersPanel.jsx'
import {
  createPurchaseOrder as creato,
  segnaInAssortimento as inAssortimento,
  togliRigaOrdine as tolta,
} from '../../src/lib/api.js'

beforeEach(() => {
  vi.clearAllMocks()
  stato.articoli = [CAMPARI, GIN]
  stato.listini = LISTINI
  stato.ordini = []
  stato.fatture = []
  stato.creati = 0
})

// Si arriva al riepilogo con quello che la preselezione ha già spuntato:
// Campari da Nova, Gin da Enofel.
async function apriRiepilogo(user) {
  render(<PurchaseOrdersPanel />)
  await screen.findAllByText('Campari')
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Rivedi e conferma/ })).toBeEnabled()
  )
  await user.click(screen.getByRole('button', { name: /Rivedi e conferma/ }))
}

const rigaDi = (nome) =>
  screen.getByRole('button', { name: `I prodotti di ${nome}` }).closest('.inv-row')

describe('il riepilogo, una tabella a scomparsa per fornitore', () => {
  it('si vedono solo i fornitori da cui si sta ordinando', async () => {
    const user = userEvent.setup()
    await apriRiepilogo(user)
    expect(screen.getByText('Riepilogo dell’ordine')).toBeInTheDocument()
    expect(rigaDi('Nova')).toBeInTheDocument()
    expect(rigaDi('Enofel')).toBeInTheDocument()
    // Nessuno ordina «da nessuno»: quella riga non esiste.
    expect(screen.queryByRole('button', { name: 'I prodotti di Senza fornitore' })).toBeNull()
  })

  it('toccando il nome si apre la tabella dei suoi prodotti', async () => {
    const user = userEvent.setup()
    await apriRiepilogo(user)
    // Chiusa: il prodotto dell'altro fornitore non è a schermo.
    expect(within(rigaDi('Nova')).queryByText('Campari')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'I prodotti di Nova' }))
    const aperta = rigaDi('Nova')
    expect(within(aperta).getByText('Campari')).toBeInTheDocument()
    // Il Gin è di Enofel: nella tabella di Nova non ci deve essere.
    expect(within(aperta).queryByText('Gin Mare')).toBeNull()
  })
})

describe('per singolo fornitore si crea l’ordine', () => {
  it('nasce un ordine con le sole righe di quel fornitore, e compare «Ordinato»', async () => {
    const user = userEvent.setup()
    await apriRiepilogo(user)
    await user.click(within(rigaDi('Nova')).getByRole('button', { name: /Crea l/ }))

    await waitFor(() => expect(creato).toHaveBeenCalledTimes(1))
    const ordine = creato.mock.calls.at(-1)[0]
    expect(ordine.supplier_id).toBe('nova')
    expect(ordine.lines.map((l) => l.item_id)).toEqual(['campari'])
    await waitFor(() => expect(within(rigaDi('Nova')).getByText('Ordinato')).toBeInTheDocument())
    // Il tasto sparisce dove il lavoro è fatto, e resta dove manca.
    expect(within(rigaDi('Nova')).queryByRole('button', { name: /Crea l/ })).toBeNull()
    expect(within(rigaDi('Enofel')).getByRole('button', { name: /Crea l/ })).toBeInTheDocument()
  })

  // «Tutti i prodotti di quell'ordine passeranno IN ASSORTIMENTO», e solo
  // quelli: il fornitore non ancora confermato non tocca niente.
  it('i prodotti di quell’ordine passano in assortimento, gli altri no', async () => {
    const user = userEvent.setup()
    await apriRiepilogo(user)
    await user.click(within(rigaDi('Nova')).getByRole('button', { name: /Crea l/ }))
    await waitFor(() => expect(inAssortimento).toHaveBeenCalledTimes(1))
    const [articoli, orderId] = inAssortimento.mock.calls.at(-1)
    expect(articoli.map((a) => a.id)).toEqual(['campari'])
    expect(orderId).toBe('po-1')
  })

  it('confermato il secondo, sono due ordini distinti', async () => {
    const user = userEvent.setup()
    await apriRiepilogo(user)
    await user.click(within(rigaDi('Nova')).getByRole('button', { name: /Crea l/ }))
    await waitFor(() => expect(within(rigaDi('Nova')).getByText('Ordinato')).toBeInTheDocument())
    await user.click(within(rigaDi('Enofel')).getByRole('button', { name: /Crea l/ }))
    await waitFor(() => expect(creato).toHaveBeenCalledTimes(2))
    expect(creato.mock.calls.map((c) => c[0].supplier_id)).toEqual(['nova', 'enofel'])
    expect(screen.getAllByText('Ordinato')).toHaveLength(2)
    expect(screen.getByText(/Tutti i fornitori sono stati ordinati/)).toBeInTheDocument()
  })

  // Quello che è già partito non si riordina: tornando indietro le righe
  // confermate non stanno più nella composizione.
  it('le righe confermate escono dalla composizione', async () => {
    const user = userEvent.setup()
    await apriRiepilogo(user)
    await user.click(within(rigaDi('Nova')).getByRole('button', { name: /Crea l/ }))
    await waitFor(() => expect(creato).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: /Torna alla composizione/ }))
    const carrello = screen.getByLabelText('Ordine in composizione')
    expect(within(carrello).getByText(/Gin Mare/)).toBeInTheDocument()
    expect(within(carrello).queryByText(/Campari/)).toBeNull()
  })
})


// ── TOGLIERE UN ITEM DA UN ORDINE GIÀ FATTO ───────────────────
//
// «Quello che Flavio può fare è eliminare quell'item dall'ordine ANCHE SE
// GIÀ FATTO, e si ripristina lo stato in linea o premium» (utente, 27/08).
// Prima di oggi questo gesto non esisteva: le righe di un ordine mandato
// erano un elenco separato da virgole, da leggere e basta.
describe('dalla lista ordini si toglie un item da un ordine già mandato', () => {
  const ORDINE = {
    id: 'po-1',
    created_at: '2026-08-26T09:00:00.000Z',
    status: 'inviato',
    total_net: 115,
    total_gross: 140.3,
    lines: [
      { item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12.5, vat: 22, supplier_id: 'nova', supplier_name: 'Nova', stato: 'richiesto' },
      { item_id: 'gin', name: 'Gin Mare', qty_packages: 2, unit_cost: 28, vat: 22, supplier_id: 'nova', supplier_name: 'Nova', stato: 'consegnato' },
    ],
  }

  it('chiede conferma, e toglie la riga giusta di quell’ordine', async () => {
    const user = userEvent.setup()
    stato.ordini = [ORDINE]
    render(<PurchaseOrdersPanel vista="lista" />)
    await screen.findByText('Lista ordini')
    // Le righe stanno nel dettaglio dell'ordine (REQ-MAG-038): si apre
    // toccando il nome del fornitore.
    await user.click(screen.getByRole('button', { name: /L’ordine di Nova/ }))
    await user.click(
      screen.getByRole('button', { name: 'Togli Campari dall’ordine di Nova del 2026-08-26' })
    )
    // La domanda dice cosa succede, senza fare la predica.
    const box = (await screen.findByText(/Togliere il prodotto/)).closest('.confirm-box')
    expect(box).toHaveTextContent(/torna allo stato che aveva prima/)
    await user.click(within(box).getByRole('button', { name: /Togli dall/ }))
    await waitFor(() => expect(tolta).toHaveBeenCalledWith('po-1', { indice: 0 }))
  })

  // La merce già arrivata ha alzato la giacenza: toglierla vorrebbe dire
  // scaricare roba che sta sullo scaffale.
  it('la riga già consegnata non ha nessun tasto per toglierla', async () => {
    const user = userEvent.setup()
    stato.ordini = [ORDINE]
    render(<PurchaseOrdersPanel vista="lista" />)
    const storico = (await screen.findByText('Lista ordini')).closest('.card')
    await user.click(within(storico).getByRole('button', { name: /L’ordine di Nova/ }))
    // Nella lista, e non nell'ordine in composizione: lì il Gin c'è ancora
    // e si toglie eccome, perché non è partito per nessuno.
    expect(within(storico).queryByRole('button', { name: /Togli Gin Mare dall/ })).toBeNull()
    expect(within(storico).getByRole('button', { name: /Togli Campari dall/ })).toBeInTheDocument()
  })
})

describe('dal riepilogo si può ancora togliere', () => {
  // «Che io posso revisionare»: finché il fornitore non è confermato, in
  // magazzino non è cambiato niente e la riga si toglie.
  it('tolto un prodotto, quel fornitore non ha più niente da ordinare', async () => {
    const user = userEvent.setup()
    await apriRiepilogo(user)
    await user.click(screen.getByRole('button', { name: 'I prodotti di Nova' }))
    await user.click(screen.getByRole('button', { name: 'Togli Campari dall’ordine di Nova' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'I prodotti di Nova' })).toBeNull()
    )
    expect(rigaDi('Enofel')).toBeInTheDocument()
    expect(creato).not.toHaveBeenCalled()
  })

  // Confermato, la riga è di un ordine mandato: da lì non si toglie più —
  // si toglie dallo storico, che è l'altro gesto.
  it('dopo la conferma la riga non si toglie più da qui', async () => {
    const user = userEvent.setup()
    await apriRiepilogo(user)
    await user.click(screen.getByRole('button', { name: 'I prodotti di Nova' }))
    await user.click(within(rigaDi('Nova')).getByRole('button', { name: /Crea l/ }))
    await waitFor(() => expect(within(rigaDi('Nova')).getByText('Ordinato')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Togli Campari dall’ordine di Nova' })).toBeNull()
  })
})
