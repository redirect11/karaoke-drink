// @vitest-environment happy-dom
'use strict'

// ── I MODELLI D'ORDINE, A SCHERMO (REQ-MAG-039) ──────────────────────
//
// «Flavio potrebbe voler salvare un ordine come TEMPLATE, e nella creazione
// dell'ordine, oltre alla precompilazione, deve poter usare un template
// salvato — con quantità già impostate e prodotti per fornitore già
// selezionati, in modo da poter partire da una situazione che lui conosce. Il
// template si può salvare in fase di creazione» (l'utente, 27/08/2026).
//
// Qui si sorvegliano le quattro cose che il requisito chiede per nome: che si
// salvi mentre si compone, che applicarlo NON cancelli la precompilazione,
// che dal modello non passi nessun prezzo, e che quello che non è stato
// ripreso si legga a schermo col suo perché.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const NOVA = { id: 'nova', name: 'Nova', email: 'ordini@nova.it', color: '#e74c3c' }
const ENOFEL = { id: 'enofel', name: 'Enofel', email: 'ordini@enofel.it', color: '#3498db' }

// Campari e Gin sono sotto scorta: la precompilazione li spunta da sola. Il
// Rum è pieno, quindi nell'ordine ci arriva solo se lo mette il modello — ed è
// esattamente la differenza fra le scorte e l'abitudine.
const CAMPARI = { id: 'campari', name: 'Campari', unit: 'pz', stock: 0, low_threshold: 2, package_size: 700, cost: 12, vat: 22, kind: 'scorta', status: 'linea' }
const GIN = { id: 'gin', name: 'Gin Mare', unit: 'pz', stock: 1, low_threshold: 2, package_size: 700, cost: 30, vat: 22, kind: 'scorta', status: 'linea' }
const RUM = { id: 'rum', name: 'Rum Zacapa', unit: 'pz', stock: 9, low_threshold: 2, package_size: 700, cost: 40, vat: 22, kind: 'scorta', status: 'linea' }

const LISTINI = [
  { id: 'nova__campari', supplier_id: 'nova', item_id: 'campari', price: 12.5, last_price_at: '2026-08-01T10:00:00.000Z' },
  { id: 'enofel__gin', supplier_id: 'enofel', item_id: 'gin', price: 28, last_price_at: '2026-05-01T10:00:00.000Z' },
]

// Un modello che contiene tutti e tre i casi: un prodotto ordinabile ma non
// più sul listino di quel fornitore, e uno che dal magazzino è sparito.
const GIRO = {
  id: 'mod-1',
  nome: 'Giro della settimana',
  righe: [
    { item_id: 'rum', item_name: 'Rum Zacapa', supplier_id: 'nova', qty: 3 },
    { item_id: 'sparito', item_name: 'Vecchio Amaro', supplier_id: 'nova', qty: 1 },
  ],
}

const ORDINE = {
  id: 'po-1',
  supplier_id: 'nova',
  supplier_name: 'Nova',
  created_at: '2026-08-20T09:00:00.000Z',
  status: 'inviato',
  total_net: 25,
  total_gross: 30.5,
  storia: [],
  lines: [
    {
      item_id: 'campari',
      name: 'Campari',
      unit: 'pz',
      package_size: 700,
      qty_packages: 2,
      colli: 2,
      pezzi_per_collo: 1,
      unit_cost: 12.5,
      vat: 22,
      supplier_id: 'nova',
      supplier_name: 'Nova',
      stato: 'richiesto',
    },
  ],
}

const stato = { modelli: [], ordini: [] }

vi.mock('../../src/lib/api.js', () => ({
  fetchInventoryItems: vi.fn(async () => [CAMPARI, GIN, RUM]),
  fetchSuppliers: vi.fn(async () => [NOVA, ENOFEL]),
  fetchSupplierPrices: vi.fn(async () => LISTINI),
  fetchPurchaseOrders: vi.fn(async () => stato.ordini),
  fetchSupplierInvoices: vi.fn(async () => []),
  fetchModelliOrdine: vi.fn(async () => stato.modelli),
  // Le tre scritture del modello sono sincrone come nel codice vero: il
  // risultato si compone in memoria e non si aspetta la rete.
  salvaModelloOrdine: vi.fn(({ id, nome, righe }) => ({
    id: id || `mod-${(stato.creati = (stato.creati || 0) + 1)}`,
    nome,
    righe,
  })),
  eliminaModelloOrdine: vi.fn(),
  createPurchaseOrder: vi.fn(async (o) => ({ id: 'po-nuovo', created_at: '2026-08-27T09:00:00.000Z', status: 'inviato', ...o })),
  confermaOrdine: vi.fn((o) => o),
  chiudiOrdine: vi.fn((o) => o),
  registraMovimentoOrdine: vi.fn((o) => o),
  consegnaRigheOrdine: vi.fn(async (id) => ({ ...ORDINE, id })),
  segnaInAssortimento: vi.fn(() => []),
  liberaDaAssortimento: vi.fn(() => []),
  togliRigaOrdine: vi.fn(async () => ({ ordine: ORDINE, articolo: null })),
  deletePurchaseOrder: vi.fn(async () => {}),
  collegaFatturaAFetta: vi.fn(async (id) => ({ id })),
  generaFatturaDaOrdine: vi.fn(() => ({ id: 'f1' })),
  segnaFatturaPagata: vi.fn((f) => f),
  allineaPrezziDaFattura: vi.fn(async (o) => o),
}))

vi.mock('../../src/lib/printer.js', () => ({ printOrdineFornitore: vi.fn(async () => {}) }))
vi.mock('../../src/lib/toast.js', () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }))

import PurchaseOrdersPanel from '../../src/components/PurchaseOrdersPanel.jsx'
import { salvaModelloOrdine, eliminaModelloOrdine } from '../../src/lib/api.js'

const carrello = () => screen.getByLabelText('Ordine in composizione')

// SCRIVERE IN UN CAMPO SI FA IN UN COLPO SOLO, non tasto per tasto: sotto
// carico le battute finiscono nello stesso giro di React e il campo si
// ritrova la stringa raddoppiata. Qui non si sta provando la tastiera.
const scrivi = (campo, testo) => fireEvent.change(campo, { target: { value: testo } })

async function apriComposizione() {
  render(<PurchaseOrdersPanel vista="nuovo" />)
  await waitFor(() => expect(screen.getByText('Nuovo ordine')).toBeInTheDocument())
  // La preselezione ha già spuntato quello che manca: è il punto di partenza
  // su cui il modello si somma.
  await waitFor(() => expect(within(carrello()).getByText(/Campari/)).toBeInTheDocument())
}

beforeEach(() => {
  vi.clearAllMocks()
  stato.modelli = []
  stato.ordini = []
  stato.creati = 0
})

describe('salvare un modello mentre si compone', () => {
  it('conserva prodotti, fornitore e quantità — e nessun prezzo', async () => {
    const user = userEvent.setup()
    await apriComposizione()

    // Il tasto dice quante righe salva: si salva mentre la tabella è piena
    // di righe che nell'ordine non ci sono.
    await user.click(screen.getByRole('button', { name: /Salva le 2 righe come modello/ }))
    scrivi(screen.getByLabelText('Nome del modello'), 'Giro della settimana')
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    expect(salvaModelloOrdine).toHaveBeenCalledTimes(1)
    const salvato = salvaModelloOrdine.mock.calls[0][0]
    expect(salvato.nome).toBe('Giro della settimana')
    expect(salvato.id).toBe(null)
    expect(salvato.righe).toHaveLength(2)
    // Le righe portano tre cose e basta: il prezzo lo rimette il listino
    // quando il modello si applica.
    for (const r of salvato.righe) {
      expect(Object.keys(r).sort()).toEqual(['item_id', 'item_name', 'qty', 'supplier_id'])
    }
    // E compare subito in tendina, senza rileggere niente.
    expect(
      within(screen.getByLabelText('Modelli d’ordine')).getByRole('option', {
        name: /Giro della settimana/,
      })
    ).toBeInTheDocument()
  })

  it('senza niente selezionato non c’è modello da salvare', async () => {
    const user = userEvent.setup()
    await apriComposizione()
    // Si svuota l'ordine togliendo le due righe preselezionate.
    for (const nome of ['Campari', 'Gin Mare']) {
      await user.click(within(carrello()).getByRole('button', { name: `Togli ${nome} dall’ordine` }))
    }
    expect(screen.getByRole('button', { name: 'Salva come modello' })).toBeDisabled()
  })
})

describe('usare un modello salvato', () => {
  beforeEach(() => {
    stato.modelli = [GIRO]
  })

  // «Le due cose rispondono a domande diverse e devono poter convivere»: la
  // precompilazione guarda le scorte, il modello l'abitudine.
  it('si somma alla precompilazione invece di sostituirla', async () => {
    const user = userEvent.setup()
    await apriComposizione()
    scrivi(screen.getByLabelText('Modelli d’ordine'), 'mod-1')
    await user.click(screen.getByRole('button', { name: 'Usa il modello' }))

    // Quello che il modello porta: tre Rum, che nessuna scorta avrebbe
    // proposto perché ce ne sono nove in casa.
    expect(within(carrello()).getByText(/3× Rum Zacapa/)).toBeInTheDocument()
    // E quello che c'era prima resta dov'era.
    expect(within(carrello()).getByText(/Campari/)).toBeInTheDocument()
    expect(within(carrello()).getByText(/Gin Mare/)).toBeInTheDocument()
  })

  // «Chi lo applica deve vedere cosa non è stato ripreso e perché, invece di
  // trovarsi un ordine più corto senza spiegazione».
  it('dice cosa non è stato ripreso, e perché', async () => {
    const user = userEvent.setup()
    await apriComposizione()
    scrivi(screen.getByLabelText('Modelli d’ordine'), 'mod-1')
    await user.click(screen.getByRole('button', { name: 'Usa il modello' }))

    const esito = screen.getByRole('status')
    expect(within(esito).getByText(/Riprese 1 righe su 2/)).toBeInTheDocument()
    expect(within(esito).getByText(/Vecchio Amaro: non è più in magazzino/)).toBeInTheDocument()
    // Il Rum si riprende lo stesso — si può ordinare a chiunque — ma il
    // prezzo non viene più dal listino di quel fornitore.
    expect(within(esito).getByText(/Rum Zacapa: Nova non lo ha più a listino/)).toBeInTheDocument()
  })

  it('si rinomina e si elimina', async () => {
    const user = userEvent.setup()
    await apriComposizione()
    scrivi(screen.getByLabelText('Modelli d’ordine'), 'mod-1')

    await user.click(screen.getByRole('button', { name: 'Rinomina' }))
    scrivi(screen.getByLabelText('Nuovo nome'), 'Inizio mese')
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    // Rinominare scrive sullo stesso documento: se no resterebbero due voci
    // in tendina, che è il modo più rapido per applicare quella sbagliata.
    expect(salvaModelloOrdine).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mod-1', nome: 'Inizio mese' })
    )

    await user.click(screen.getByRole('button', { name: 'Elimina' }))
    // La conferma è un dialogo, non un `window.confirm`: nella PWA quello
    // viene bloccato in silenzio.
    const dialogo = document.querySelector('.confirm-box')
    await user.click(within(dialogo).getByRole('button', { name: 'Elimina' }))
    expect(eliminaModelloOrdine).toHaveBeenCalledWith('mod-1')
  })
})

// ── «SALVA QUESTO COME MODELLO» DALLA LISTA ORDINI ───────────────────
//
// Un ordine già fatto è il giro esatto, con le sue quantità: ricomporlo a
// mano nella tabella per riconservarlo sarebbe rifare un lavoro già fatto.
describe('un modello ricavato da un ordine già fatto', () => {
  it('riprende righe e fornitore dell’ordine, senza prezzi', async () => {
    const user = userEvent.setup()
    stato.ordini = [ORDINE]
    render(<PurchaseOrdersPanel vista="lista" />)
    await waitFor(() => expect(screen.getByText('Lista ordini')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /L’ordine di Nova/ }))
    await user.click(screen.getByRole('button', { name: 'Salva come modello' }))
    // Il nome parte da quello del fornitore, che è il primo modo in cui uno
    // chiama il giro che fa da lui.
    const campo = screen.getByLabelText('Nome del modello')
    expect(campo).toHaveValue('Nova')
    scrivi(campo, 'Ordine grosso Nova')
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    expect(salvaModelloOrdine).toHaveBeenCalledWith({
      id: null,
      nome: 'Ordine grosso Nova',
      righe: [{ item_id: 'campari', item_name: 'Campari', supplier_id: 'nova', qty: 2 }],
    })
  })
})
