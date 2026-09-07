// @vitest-environment happy-dom
'use strict'

// ── LO SCADENZARIO: L'ALLEGATO DEL DOCUMENTO (REQ-MAG-033) ───────────
//
// L'utente, 20/08: «Allegare = il documento vero (foto/PDF), non solo un
// numero».
//
// Quello che questo file sorveglia è il mestiere della schermata: che chi ha
// la carta e chi no si veda a colpo d'occhio, con LO STESSO linguaggio del
// «senza ordine» che sta due righe più su (REQ-MAG-031) e non con un terzo
// modo di dire la stessa cosa; che l'attesa del caricamento SI VEDA; e che
// un caricamento fallito lasci la fattura esattamente com'era.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const NOVA = { id: 'nova', name: 'Nova' }

const CON_CARTA = {
  id: 'inv-1',
  supplier_id: 'nova',
  supplier_name: 'Nova',
  number: '1556',
  doc_type: 'Fattura',
  date: '2026-08-26',
  amount: 81,
  paid: false,
  lines: [],
  order_id: null,
  attachment: {
    url: 'https://storage/fatture/inv-1/1.pdf?token=abc',
    path: 'fatture/inv-1/1.pdf',
    content_type: 'application/pdf',
    size: 420 * 1024,
    name: 'fattura-1556.pdf',
  },
}

const SENZA_CARTA = {
  id: 'inv-2',
  supplier_id: 'nova',
  supplier_name: 'Nova',
  number: '1557',
  doc_type: 'Fattura',
  date: '2026-08-25',
  amount: 40,
  paid: false,
  lines: [],
  order_id: null,
  attachment: null,
}

const stato = { fatture: [], allegaFallisce: null, allegaAppeso: false }

vi.mock('../../src/lib/api.js', () => ({
  fetchSuppliers: vi.fn(async () => [NOVA]),
  fetchSupplierInvoices: vi.fn(async () => stato.fatture),
  createSupplierInvoice: vi.fn(async (i) => ({ id: 'inv-nuova', ...i })),
  updateSupplierInvoice: vi.fn(async () => {}),
  deleteSupplierInvoice: vi.fn(async () => {}),
  fetchInventoryItems: vi.fn(async () => []),
  fetchSupplierPrices: vi.fn(async () => []),
  fetchPurchaseOrders: vi.fn(async () => []),
  aggiungiProdottiAFattura: vi.fn(async () => stato.fatture[0]),
  collegaFatturaAFetta: vi.fn(async () => stato.fatture[0]),
  allegaDocumentoAFattura: vi.fn(async (id, file) => {
    if (stato.allegaFallisce) throw new Error(stato.allegaFallisce)
    if (stato.allegaAppeso) await new Promise(() => {})
    const prima = stato.fatture.find((f) => f.id === id)
    return {
      ...prima,
      attachment: {
        url: `https://storage/fatture/${id}/nuovo.jpg?token=xyz`,
        path: `fatture/${id}/nuovo.jpg`,
        content_type: 'image/jpeg',
        size: 380 * 1024,
        name: file.name,
      },
    }
  }),
  togliAllegatoDaFattura: vi.fn(async (id) => ({
    ...stato.fatture.find((f) => f.id === id),
    attachment: null,
  })),
}))

import SupplierInvoicesPanel from '../../src/components/SupplierInvoicesPanel.jsx'
import {
  allegaDocumentoAFattura as allega,
  togliAllegatoDaFattura as togli,
} from '../../src/lib/api.js'

// La casella del file è nascosta apposta: il gesto parte dal tasto della
// riga. Nel test ci si arriva per etichetta, come farebbe uno screen reader.
const casellaFile = () => screen.getByLabelText('Il file da allegare al documento')

const SCATTO = new File(['x'], 'IMG_1420.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  vi.clearAllMocks()
  stato.fatture = [{ ...CON_CARTA }, { ...SENZA_CARTA }]
  stato.allegaFallisce = null
  stato.allegaAppeso = false
})

describe('chi ha la carta e chi no si vede a colpo d’occhio', () => {
  // LO STESSO LINGUAGGIO DEL «SENZA ORDINE»: ambra, perché non è un errore —
  // è lavoro che manca (il rosso, in questa app, vuol dire annullato).
  it('il documento senza allegato porta il suo segno, quello con la carta no', async () => {
    render(<SupplierInvoicesPanel />)
    expect(await screen.findByText('senza allegato')).toBeInTheDocument()
    expect(screen.getAllByText('senza allegato')).toHaveLength(1)
    expect(screen.getByText(/fattura-1556\.pdf/)).toBeInTheDocument()
  })

  // Il segno è quello dell'altro buco, non un colore inventato per l'occasione.
  it('il segno è ambra, come «senza ordine»', async () => {
    render(<SupplierInvoicesPanel />)
    expect(await screen.findByText('senza allegato')).toHaveClass('badge-low')
  })

  it('l’allegato si legge col nome e col peso, senza aprirlo', async () => {
    render(<SupplierInvoicesPanel />)
    expect(await screen.findByText(/fattura-1556\.pdf · 420 kB/)).toBeInTheDocument()
  })

  // A fine mese si guardano tutti insieme, e non si scorrono uno per uno:
  // stesso mestiere del chip «Senza ordine (n)».
  it('il chip li conta e li isola', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    const chip = await screen.findByRole('button', { name: 'Senza allegato (1)' })

    await user.click(chip)
    expect(screen.queryByText(/fattura-1556\.pdf/)).toBeNull()
    expect(screen.getByText('senza allegato')).toBeInTheDocument()
  })
})

describe('si allega una foto o un PDF', () => {
  // IL LIMITE SI DICE PRIMA: formati e peso stanno sul tasto, non in un
  // errore che arriva dopo aver aspettato il caricamento.
  it('il tasto dice cosa ci sta prima che qualcuno lo tocchi', async () => {
    render(<SupplierInvoicesPanel />)
    const tasto = await screen.findByRole('button', { name: /Allega il documento di Nova #1557/ })
    expect(tasto).toHaveTextContent(/foto o PDF/)
    expect(tasto).toHaveTextContent(/fino a 8 MB/)
  })

  it('il file scelto arriva alla fattura giusta, e l’allegato compare', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await user.click(await screen.findByRole('button', { name: /Allega il documento di Nova #1557/ }))
    await user.upload(casellaFile(), SCATTO)

    await waitFor(() => expect(allega).toHaveBeenCalledTimes(1))
    expect(allega.mock.calls[0][0]).toBe('inv-2')
    expect(allega.mock.calls[0][1].name).toBe('IMG_1420.jpg')
    expect(await screen.findByText(/IMG_1420\.jpg/)).toBeInTheDocument()
    // Il buco si è chiuso: il segno se ne va e il conto scende.
    expect(screen.queryByText('senza allegato')).toBeNull()
    expect(screen.getByRole('button', { name: 'Senza allegato (0)' })).toBeInTheDocument()
  })

  // QUI SI ASPETTA — è gestione, non la coda — ma l'attesa si deve VEDERE:
  // una foto da cinque mega sulla connessione del locale non è istantanea, e
  // chi non vede niente tocca il tasto una seconda volta.
  it('mentre carica lo dice', async () => {
    stato.allegaAppeso = true
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await user.click(await screen.findByRole('button', { name: /Allega il documento di Nova #1557/ }))
    await user.upload(casellaFile(), SCATTO)

    expect(await screen.findByText('Carico l’allegato…')).toBeInTheDocument()
  })

  // Un caricamento fallito deve DIRLO e lasciare la fattura com'era:
  // mostrare un allegato che non è mai partito sarebbe peggio del guasto.
  it('se il caricamento non riesce lo dice, e il documento resta com’era', async () => {
    stato.allegaFallisce = 'Questo PDF pesa 12 MB: il limite è 8 MB.'
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await user.click(await screen.findByRole('button', { name: /Allega il documento di Nova #1557/ }))
    await user.upload(casellaFile(), SCATTO)

    expect(await screen.findByText(/il limite è 8 MB/)).toBeInTheDocument()
    expect(screen.getByText('senza allegato')).toBeInTheDocument()
    expect(screen.queryByText('Carico l’allegato…')).toBeNull()
  })
})

describe('si riapre, si sostituisce, si toglie', () => {
  // UN LINK E NON UN TASTO: sul telefono apre la foto o il PDF con quello che
  // la persona usa già, e si può tenere premuto per salvarlo.
  it('«Apri» porta al file', async () => {
    render(<SupplierInvoicesPanel />)
    const apri = await screen.findByRole('link', { name: /Apri l’allegato del documento di Nova #1556/ })
    expect(apri).toHaveAttribute('href', CON_CARTA.attachment.url)
    expect(apri).toHaveAttribute('target', '_blank')
  })

  it('sostituire passa dalla stessa strada di allegare', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await user.click(await screen.findByRole('button', { name: /Sostituisci l’allegato del documento di Nova #1556/ }))
    await user.upload(casellaFile(), SCATTO)

    await waitFor(() => expect(allega).toHaveBeenCalledTimes(1))
    expect(allega.mock.calls[0][0]).toBe('inv-1')
    expect(await screen.findByText(/IMG_1420\.jpg/)).toBeInTheDocument()
  })

  // Il file viene cancellato davvero: è l'unica copia che il locale ha di
  // quel documento, quindi si chiede conferma.
  it('togliere chiede conferma, e la fattura torna senza allegato', async () => {
    const conferma = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await user.click(await screen.findByRole('button', { name: /Togli l’allegato dal documento di Nova #1556/ }))

    expect(conferma).toHaveBeenCalledWith(expect.stringMatching(/cancellato/))
    await waitFor(() => expect(togli).toHaveBeenCalledWith('inv-1'))
    await waitFor(() => expect(screen.getAllByText('senza allegato')).toHaveLength(2))
    conferma.mockRestore()
  })

  it('rispondendo di no non si cancella niente', async () => {
    const conferma = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await user.click(await screen.findByRole('button', { name: /Togli l’allegato dal documento di Nova #1556/ }))

    expect(togli).not.toHaveBeenCalled()
    conferma.mockRestore()
  })
})

describe('il documento e il suo allegato stanno insieme', () => {
  // La riga del documento resta quella di prima: l'allegato è una riga in
  // più, non una schermata a parte.
  it('l’allegato sta sotto la fattura di cui parla', async () => {
    render(<SupplierInvoicesPanel />)
    await screen.findByText(/fattura-1556\.pdf/)
    const riga = screen.getByText(/fattura-1556\.pdf/).closest('.inv-item')
    expect(within(riga).getByText(/#1556/)).toBeInTheDocument()
  })
})
