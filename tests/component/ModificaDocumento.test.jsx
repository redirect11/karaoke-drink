// @vitest-environment happy-dom
'use strict'

// ── CORREGGERE UN DOCUMENTO DALLO SCADENZARIO (REQ-MAG-041) ──────────
//
// Flavio, 03/09/2026: «in Scadenzario i documenti creati devono essere
// modificabili nel caso di variazione o errore».
//
// Prima si poteva solo segnare pagato: chi sbagliava a battere una cifra
// doveva cancellare il documento e rifarlo, e con la cancellazione se ne
// andavano i prodotti, l'allegato e il legame con l'ordine. Qui si sorveglia
// che la correzione NON porti via niente di quelle tre cose, e che la
// modifica di un documento già pagato — che è il caso da cui la voce nasce —
// resti tracciabile.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const NOVA = { id: 'nova', name: 'Nova' }
const MAR = { id: 'mar', name: 'Mar' }

// Il documento com'è al banco: con dentro i prodotti, l'allegato e l'ordine
// collegato, cioè le tre cose che la cancellazione portava via.
const FATTURA = {
  id: 'inv-1',
  supplier_id: 'nova',
  supplier_name: 'Nova',
  number: '1556',
  doc_type: 'Fattura',
  date: '2026-08-26',
  amount: 120,
  paid: false,
  notes: null,
  lines: [{ item_id: 'campari', name: 'Campari', qty_packages: 4, unit_cost: 12, vat: 22 }],
  order_id: null,
  attachment: { name: 'fattura.pdf', path: 'fatture/inv-1/fattura.pdf', url: 'https://x/y', size: 2048 },
  generata: false,
  storia: [],
}

const stato = { fatture: [FATTURA] }

// `modificaFattura` è il vero: qui si prova la SCHERMATA, e il pezzo di
// codice che compone il documento corretto ha già il suo test senza rete
// (tests/unit/modificaDocumento.test.js). Il mock lo imita nella sola cosa
// che conta per la schermata — restituisce il documento aggiornato senza
// aspettare — e registra con cosa è stato chiamato.
const modificato = vi.fn((fattura, dati) => ({ ...fattura, ...dati }))

vi.mock('../../src/lib/api.js', () => ({
  fetchSuppliers: vi.fn(async () => [NOVA, MAR]),
  fetchSupplierInvoices: vi.fn(async () => stato.fatture),
  createSupplierInvoice: vi.fn(async (i) => ({ id: 'inv-nuova', ...i })),
  updateSupplierInvoice: vi.fn(async () => {}),
  deleteSupplierInvoice: vi.fn(async () => {}),
  fetchInventoryItems: vi.fn(async () => []),
  fetchSupplierPrices: vi.fn(async () => []),
  fetchPurchaseOrders: vi.fn(async () => []),
  aggiungiProdottiAFattura: vi.fn(async () => ({})),
  collegaFatturaAFetta: vi.fn(async () => ({})),
  allegaDocumentoAFattura: vi.fn(async () => ({})),
  togliAllegatoDaFattura: vi.fn(async () => ({})),
  modificaFattura: vi.fn((fattura, dati) => modificato(fattura, dati)),
}))

import SupplierInvoicesPanel from '../../src/components/SupplierInvoicesPanel.jsx'

// SI ASPETTANO I DATI, non il titolo: la schermata carica i documenti, e
// cercare il tasto prima che siano arrivati è il modo di scrivere un test
// che passa a giorni alterni.
async function apriLaCorrezione(user, nome = 'Modifica il documento di Nova #1556') {
  await user.click(await screen.findByRole('button', { name: nome }))
  return await screen.findByLabelText('Importo € *')
}

// La cifra si legge DENTRO la riga del documento: in testa alla schermata
// c'è il «Da pagare», che porta lo stesso numero quando il documento è uno
// solo — cercarlo a schermo intero troverebbe tutti e due.
const rigaDelDocumento = () => screen.getByText('#1556').closest('.inv-item')

beforeEach(() => {
  vi.clearAllMocks()
  stato.fatture = [{ ...FATTURA }]
})

describe('un documento si può correggere', () => {
  it('ogni documento ha il suo tasto per correggerlo', async () => {
    render(<SupplierInvoicesPanel />)
    expect(
      await screen.findByRole('button', { name: 'Modifica il documento di Nova #1556' })
    ).toBeInTheDocument()
  })

  // IL MODULO PARTE DAI DATI DEL DOCUMENTO, non vuoto: si sta correggendo
  // una cifra, non ribattendo tutto da capo.
  it('il modulo si apre già compilato con quello che c’è scritto', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    const importo = await apriLaCorrezione(user)
    expect(importo).toHaveValue(120)
    expect(screen.getByLabelText('Numero doc.')).toHaveValue('1556')
    expect(screen.getByLabelText('Data')).toHaveValue('2026-08-26')
  })

  it('la cifra corretta parte, e il modulo si chiude', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    const importo = await apriLaCorrezione(user)
    await user.clear(importo)
    await user.type(importo, '130')
    await user.click(screen.getByRole('button', { name: 'Salva le correzioni' }))

    expect(modificato).toHaveBeenCalledTimes(1)
    const [fattura, dati] = modificato.mock.calls[0]
    expect(fattura.id).toBe('inv-1')
    expect(dati.amount).toBe(130)
    // L'esito si vede subito: la riga torna al suo posto con la cifra nuova.
    expect(await screen.findByText('#1556')).toBeInTheDocument()
    expect(within(rigaDelDocumento()).getByText(/^130,00/)).toBeInTheDocument()
  })

  // SI CORREGGE, NON SI STRAVOLGE: prodotti, allegato e ordine collegato non
  // passano di qui, quindi non si possono perdere per sbaglio.
  it('prodotti e allegato restano sotto il documento dopo la correzione', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    const importo = await apriLaCorrezione(user)
    await user.clear(importo)
    await user.type(importo, '130')
    await user.click(screen.getByRole('button', { name: 'Salva le correzioni' }))

    expect(await screen.findByText(/4× Campari/)).toBeInTheDocument()
    expect(screen.getByText(/fattura\.pdf/)).toBeInTheDocument()
    const [, dati] = modificato.mock.calls[0]
    expect(dati.lines).toBeUndefined()
    expect(dati.attachment).toBeUndefined()
    expect(dati.order_id).toBeUndefined()
  })

  it('annullando non si corregge niente', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    const importo = await apriLaCorrezione(user)
    await user.clear(importo)
    await user.type(importo, '999')
    await user.click(screen.getByRole('button', { name: 'Annulla' }))

    expect(modificato).not.toHaveBeenCalled()
    expect(await screen.findByText('#1556')).toBeInTheDocument()
    expect(within(rigaDelDocumento()).getByText(/^120,00/)).toBeInTheDocument()
  })
})

describe('correggere un documento già pagato', () => {
  // «Mi devono modificare il prezzo di una fattura magari già pagata, mi
  // fanno la nota di credito» (Flavio): è legittimo, e il tasto c'è.
  it('si corregge anche se è pagato, e resta pagato', async () => {
    stato.fatture = [{ ...FATTURA, paid: true }]
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    const importo = await apriLaCorrezione(user)
    await user.clear(importo)
    await user.type(importo, '100')
    await user.click(screen.getByRole('button', { name: 'Salva le correzioni' }))

    expect(await screen.findByRole('button', { name: /pagato/ })).toBeInTheDocument()
    // «Pagato» non passa nemmeno dal modulo: il suo tasto è quello sulla
    // riga, e resta uno solo (REQ-MAG-038). Due posti per dire la stessa
    // cosa vogliono dire due stati da tenere allineati.
    expect(modificato.mock.calls[0][1].paid).toBeUndefined()
  })

  // La casella «Già pagato» è della creazione: correggendo, il pagamento si
  // tocca dal tasto sulla riga.
  it('nel modulo di correzione non c’è la casella «Già pagato»', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await apriLaCorrezione(user)
    expect(screen.queryByLabelText('Già pagato')).toBeNull()
  })

  // La traccia si legge sotto il documento: è quello che a fine mese spiega
  // perché una cifra pagata non è più quella.
  it('la correzione fatta si legge sotto il documento', async () => {
    stato.fatture = [
      {
        ...FATTURA,
        paid: true,
        storia: [
          {
            at: '2026-09-03T15:51:00.000Z',
            tipo: 'documento_corretto',
            dettaglio: { pagato: true, cambi: [{ campo: 'Importo', da: '120,00 €', a: '100,00 €' }] },
          },
        ],
      },
    ]
    render(<SupplierInvoicesPanel />)
    expect(
      await screen.findByText(/Documento corretto \(già pagato\) · Importo da 120,00 € a 100,00 €/)
    ).toBeInTheDocument()
  })
})

describe('il fornitore di un documento agganciato', () => {
  // IL LEGAME CON L'ORDINE È LA COPPIA ORDINE + FORNITORE (REQ-MAG-031):
  // cambiarlo di sotto vorrebbe dire merce pagata a chi non l'ha venduta. Si
  // impedisce prima invece di spiegarlo dopo con un errore.
  it('non si sceglie: il campo è spento e lo dice', async () => {
    stato.fatture = [{ ...FATTURA, order_id: 'po-1' }]
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await apriLaCorrezione(user)
    expect(screen.getByLabelText('Fornitore *')).toBeDisabled()
    expect(screen.getByText(/scollega prima l’ordine/)).toBeInTheDocument()
  })

  it('senza ordine collegato si cambia', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await apriLaCorrezione(user)
    const fornitore = screen.getByLabelText('Fornitore *')
    expect(fornitore).not.toBeDisabled()
    await user.selectOptions(fornitore, 'mar')
    await user.click(screen.getByRole('button', { name: 'Salva le correzioni' }))
    expect(modificato.mock.calls[0][1]).toMatchObject({ supplier_id: 'mar', supplier_name: 'Mar' })
  })
})

describe('il tipo di documento nel modulo di correzione', () => {
  // NON SI MIGRA NIENTE (BUG-100): in archivio ci sono documenti scritti
  // «Reso». La tendina non ha più quella voce, e senza questo la selezione
  // resterebbe vuota — chi salva si ritroverebbe il tipo cambiato senza
  // averlo chiesto.
  it('un vecchio «Reso» si apre già su «Nota di credito»', async () => {
    stato.fatture = [{ ...FATTURA, doc_type: 'Reso' }]
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await apriLaCorrezione(user)
    expect(screen.getByLabelText('Tipo')).toHaveValue('Nota di credito')
  })

  // Un tipo che l'app non conosce affatto se lo tiene com'è: aprire e
  // salvare non deve cambiarlo di nascosto.
  it('un tipo sconosciuto resta quello che è', async () => {
    stato.fatture = [{ ...FATTURA, doc_type: 'Scontrino' }]
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await apriLaCorrezione(user)
    expect(screen.getByLabelText('Tipo')).toHaveValue('Scontrino')
  })

  it('scegliendo la nota di credito, il modulo dice che l’importo si scrive positivo', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await apriLaCorrezione(user)
    await user.selectOptions(screen.getByLabelText('Tipo'), 'Nota di credito')
    expect(
      await screen.findByText(/L’importo si scrive positivo/)
    ).toBeInTheDocument()
  })
})
