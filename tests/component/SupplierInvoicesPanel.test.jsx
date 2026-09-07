// @vitest-environment happy-dom
'use strict'

// ── LO SCADENZARIO: «AGGIUNGI PRODOTTI» (REQ-MAG-030) ────────────────
//
// Flavio, 26/08/2026: «ho appena visto che questa cosa quasi già c'è ed è
// scadenzario, e dalla foto è proprio quello che mi serve. Però sotto mi
// deve apparire un tasto che fa il carico. Dobbiamo usare un'altra dicitura
// sicuramente, tipo AGGIUNGI PRODOTTI magari, e ci mettiamo anche i
// prodotti, in modo tale che li va già a caricare all'interno dei prodotti
// di magazzino. Sempre che poi dopo mi fa la domanda se voglio aggiornare il
// prezzo — nel caso lo vado a modificare — oppure lasciarlo invariato, così,
// senza carico, perché magari me li sono caricati già prima in altro modo».
//
// LA DICITURA NON È UN DETTAGLIO: il tasto non si chiama «carico» perché il
// carico è una conseguenza, e per giunta facoltativa. Qui si sorveglia anche
// quello.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const NOVA = { id: 'nova', name: 'Nova', email: 'ordini@nova.it' }

const ARTICOLI = [
  { id: 'campari', name: 'Campari', unit: 'pz', stock: 2, package_size: 700, content_unit: 'ml', cost: 12, vat: 22, kind: 'scorta' },
  { id: 'gin', name: 'Gin Mare', unit: 'pz', stock: 5, package_size: 700, content_unit: 'ml', cost: 30, vat: 22, kind: 'scorta' },
]

const LISTINI = [
  { id: 'nova__campari', supplier_id: 'nova', item_id: 'campari', price: 12.5, last_price_at: '2026-08-01T10:00:00.000Z' },
]

// Una fattura com'è in archivio: SOLO UNA TESTATA, senza righe. È il dato da
// cui nasce tutta questa voce.
const FATTURA = {
  id: 'inv-1',
  supplier_id: 'nova',
  supplier_name: 'Nova',
  number: '1556',
  doc_type: 'Fattura',
  date: '2026-08-26',
  amount: 81,
  paid: false,
  notes: null,
  lines: [],
}

const stato = { fatture: [FATTURA], articoli: ARTICOLI, ordini: [] }

vi.mock('../../src/lib/api.js', () => ({
  fetchSuppliers: vi.fn(async () => [NOVA]),
  fetchSupplierInvoices: vi.fn(async () => stato.fatture),
  createSupplierInvoice: vi.fn(async (i) => ({ id: 'inv-nuova', ...i })),
  updateSupplierInvoice: vi.fn(async () => {}),
  deleteSupplierInvoice: vi.fn(async () => {}),
  fetchInventoryItems: vi.fn(async () => stato.articoli),
  fetchSupplierPrices: vi.fn(async () => LISTINI),
  fetchPurchaseOrders: vi.fn(async () => stato.ordini),
  aggiungiProdottiAFattura: vi.fn(async (id, arg) => ({
    ...stato.fatture[0],
    id,
    order_id: arg.order_id ?? stato.fatture[0].order_id ?? null,
    lines: arg.righe.map((r) => ({ ...r, caricata: !!arg.carica })),
  })),
  collegaFatturaAFetta: vi.fn(async (id, { order_id }) => ({
    ...stato.fatture[0],
    id,
    order_id: order_id || null,
  })),
}))

import SupplierInvoicesPanel from '../../src/components/SupplierInvoicesPanel.jsx'
import { aggiungiProdottiAFattura as aggiunti } from '../../src/lib/api.js'

const finestra = () => screen.getByLabelText('Cerca un prodotto').closest('.confirm-box')

async function apriEAggiungiCampari(user) {
  await user.click(await screen.findByRole('button', { name: /Aggiungi prodotti/ }))
  await user.type(screen.getByLabelText('Cerca un prodotto'), 'campa')
  await user.click(await screen.findByRole('button', { name: 'Aggiungi Campari' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  stato.fatture = [{ ...FATTURA }]
  stato.articoli = ARTICOLI
  stato.ordini = []
})

describe('il tasto sta sotto la fattura, e non si chiama «carico»', () => {
  it('ogni documento ha il suo «Aggiungi prodotti»', async () => {
    render(<SupplierInvoicesPanel />)
    expect(await screen.findByRole('button', { name: /Aggiungi prodotti/ })).toBeInTheDocument()
  })

  // «Dobbiamo usare un'altra dicitura sicuramente» (Flavio): chiamarlo
  // «carico» prometterebbe una cosa che si può decidere di non fare.
  it('la parola «carico» non sta sul tasto', async () => {
    render(<SupplierInvoicesPanel />)
    const tasto = await screen.findByRole('button', { name: /Aggiungi prodotti/ })
    expect(tasto.textContent).not.toMatch(/carico|carica/i)
  })
})

describe('i prodotti si cercano e si aggiungono al documento', () => {
  it('si cerca il prodotto e lo si mette sulla fattura', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await apriEAggiungiCampari(user)

    // La riga è nella finestra, col prezzo in archivio di QUEL fornitore.
    expect(screen.getByLabelText('Prezzo di Campari')).toHaveValue(12.5)
    await user.click(screen.getByRole('button', { name: /Aggiungi e carica/ }))

    expect(aggiunti).toHaveBeenCalledTimes(1)
    const [id, arg] = aggiunti.mock.calls[0]
    expect(id).toBe('inv-1')
    expect(arg.righe[0]).toMatchObject({ item_id: 'campari', unit_cost: 12.5 })
  })

  // Le righe messe si vedono subito sotto la fattura: la scrittura parte in
  // sottofondo e nessuno la aspetta.
  it('i prodotti aggiunti compaiono sotto la fattura', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await apriEAggiungiCampari(user)
    await user.click(screen.getByRole('button', { name: /Aggiungi e carica/ }))
    await waitFor(() => expect(screen.getByText(/1× Campari/)).toBeInTheDocument())
  })
})

describe('il carico a magazzino è facoltativo', () => {
  // «Magari me li sono caricati già prima in altro modo» (Flavio): sono due
  // cose distinte, ricostruire un documento e muovere una giacenza.
  it('spegnendo la casella il tasto lo dice, e il carico non parte', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await apriEAggiungiCampari(user)

    await user.click(within(finestra()).getByLabelText('Carica la merce a magazzino'))
    await user.click(screen.getByRole('button', { name: /Aggiungi senza caricare/ }))
    expect(aggiunti.mock.calls[0][1].carica).toBe(false)
  })
})

describe('il prezzo si chiede, non si impone', () => {
  // «Sempre che poi dopo mi fa la domanda se voglio aggiornare il prezzo —
  // nel caso lo vado a modificare — oppure lasciarlo invariato».
  it('la domanda compare solo dove il prezzo è cambiato', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await apriEAggiungiCampari(user)

    // Col prezzo di listino non c'è niente da chiedere.
    expect(screen.queryByText(/Aggiorna il prezzo/)).toBeNull()

    await user.clear(screen.getByLabelText('Prezzo di Campari'))
    await user.type(screen.getByLabelText('Prezzo di Campari'), '13.5')
    // Vecchio e nuovo affiancati, e il nuovo è il campo stesso.
    expect(await screen.findByText(/in archivio.*12,50.*13,50/)).toBeInTheDocument()
  })

  // IL PRE-IMPOSTATO NON MUOVE I PREZZI: chi non risponde non aggiorna
  // niente.
  it('la domanda parte da «no», e resta «no» se nessuno la tocca', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await apriEAggiungiCampari(user)
    await user.clear(screen.getByLabelText('Prezzo di Campari'))
    await user.type(screen.getByLabelText('Prezzo di Campari'), '13.5')
    await screen.findByText(/in archivio/)

    await user.click(screen.getByRole('button', { name: /Aggiungi e carica/ }))
    expect(aggiunti.mock.calls[0][1].righe[0].aggiorna_prezzo).toBe(false)
  })

  it('rispondendo di sì il prezzo nuovo viaggia con la riga', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await apriEAggiungiCampari(user)
    await user.clear(screen.getByLabelText('Prezzo di Campari'))
    await user.type(screen.getByLabelText('Prezzo di Campari'), '13.5')

    await user.click(await screen.findByText(/in archivio/))
    await user.click(screen.getByRole('button', { name: /Aggiungi e carica/ }))
    expect(aggiunti.mock.calls[0][1].righe[0]).toMatchObject({
      unit_cost: '13.5',
      aggiorna_prezzo: true,
    })
  })
})

describe('riprendere le righe da un ordine, che è anche collegarlo', () => {
  const ORDINE = {
    id: 'po-1',
    created_at: '2026-08-20T09:00:00.000Z',
    supplier_id: 'nova',
    supplier_name: 'Nova',
    lines: [
      { item_id: 'campari', name: 'Campari', unit: 'pz', package_size: 700, qty_packages: 6, unit_cost: 12.5, vat: 22, supplier_id: 'nova', stato: 'consegnato' },
    ],
  }

  it('senza ordini di quel fornitore la tendina non c’è', async () => {
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await user.click(await screen.findByRole('button', { name: /Aggiungi prodotti/ }))
    expect(screen.queryByLabelText(/Riprendi le righe da un ordine/)).toBeNull()
  })

  // QUESTO TEST DICEVA IL CONTRARIO, ed è cambiato apposta (REQ-MAG-031):
  // «nessun riferimento all'ordine finisce sulla fattura, il legame è
  // un'altra voce ancora da decidere». Adesso quella voce è decisa e il
  // legame è un dato vero, e riprendere le righe è lo stesso gesto che
  // agganciare il documento: si sta ricopiando la fattura dall'ordine che
  // l'ha generata. Lasciare il legame non scritto proprio lì voleva dire
  // ritrovarsi a fine mese quella fetta senza documento.
  it('le righe si copiano, e l’ordine resta collegato al documento', async () => {
    stato.ordini = [ORDINE]
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await user.click(await screen.findByRole('button', { name: /Aggiungi prodotti/ }))
    await user.selectOptions(screen.getByLabelText(/Riprendi le righe da un ordine/), 'po-1')

    expect(await screen.findByLabelText('Quantità di Campari')).toHaveValue(6)
    await user.click(screen.getByRole('button', { name: /Aggiungi senza caricare/ }))
    const [, arg] = aggiunti.mock.calls[0]
    expect(arg.righe[0]).toMatchObject({ item_id: 'campari', qty_packages: 6 })
    expect(arg.order_id).toBe('po-1')
  })

  // QUELLA MERCE È GIÀ IN MAGAZZINO, entrata alla consegna: caricarla una
  // seconda volta è l'errore da impedire.
  it('la merce già consegnata spegne il carico da sola', async () => {
    stato.ordini = [ORDINE]
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await user.click(await screen.findByRole('button', { name: /Aggiungi prodotti/ }))
    await user.selectOptions(screen.getByLabelText(/Riprendi le righe da un ordine/), 'po-1')

    expect(await screen.findByRole('button', { name: /Aggiungi senza caricare/ })).toBeInTheDocument()
    expect(within(finestra()).getByLabelText('Carica la merce a magazzino')).not.toBeChecked()
    expect(screen.getByText(/la merce è entrata in magazzino alla consegna/)).toBeInTheDocument()
  })
})

describe('il magazzino in sola lettura vale anche qui', () => {
  // BUG-029: finché il travaso non è fatto il carico sommerebbe pezzi a
  // giacenze scritte alla vecchia maniera. Le righe però si aggiungono lo
  // stesso: sono carta, non giacenze.
  it('col magazzino da aggiornare si scrive il documento, non le giacenze', async () => {
    // Il caso vero: «c'è scritto che un pezzo contiene 330, ma non di che
    // misura» — cl? ml? grammi? Finché non lo dice una persona il magazzino
    // resta in sola lettura.
    stato.articoli = [{ id: 'campari', name: 'Campari', unit: 'pz', stock: 2, package_size: 330, kind: 'scorta' }]
    const user = userEvent.setup()
    render(<SupplierInvoicesPanel />)
    await apriEAggiungiCampari(user)

    const casella = within(finestra()).getByLabelText('Carica la merce a magazzino')
    expect(casella).toBeDisabled()
    expect(casella).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: /Aggiungi senza caricare/ }))
    expect(aggiunti.mock.calls[0][1].carica).toBe(false)
  })
})

// ── LA NOTA DI CREDITO A SCHERMO (BUG-100) ───────────────────────────
//
// Flavio, 03/09/2026: «la nota di credito, che sostituisce la parola reso,
// deve andare a modificare il totale dello scadenzario: deve essere in
// negativo, perché mi stanno scalando dei soldi. E poi il colore deve
// apparire in un altro colore, preferibilmente verde».
//
// Il colore da solo non basta e non è mai solo: la cifra si legge come una
// sottrazione anche di sera, di fretta, su un telefono.
describe('una nota di credito si vede che scala', () => {
  const NOTA = {
    ...FATTURA,
    id: 'inv-nc',
    number: '9',
    doc_type: 'Nota di credito',
    amount: 120,
    paid: false,
  }

  it('la cifra ha il meno davanti e il verde della nota di credito', async () => {
    stato.fatture = [NOTA]
    render(<SupplierInvoicesPanel />)
    const importo = await screen.findByText(/^−\s*120,00/)
    expect(importo).toHaveClass('importo-nota-credito')
  })

  // La fattura accanto non cambia: il verde e il meno sono di quel documento
  // lì, non di tutta la colonna.
  it('la fattura accanto resta come prima', async () => {
    stato.fatture = [NOTA, FATTURA]
    render(<SupplierInvoicesPanel />)
    const fattura = await screen.findByText(/^81,00/)
    expect(fattura).not.toHaveClass('importo-nota-credito')
  })

  // NON SI MIGRA NIENTE: i documenti in archivio hanno `doc_type: 'Reso'`.
  it('un documento di ieri, scritto «Reso», si legge come una nota di credito', async () => {
    stato.fatture = [{ ...NOTA, id: 'inv-reso', doc_type: 'Reso' }]
    render(<SupplierInvoicesPanel />)
    const importo = await screen.findByText(/^−\s*120,00/)
    expect(importo).toHaveClass('importo-nota-credito')
  })

  // UNA NOTA DI CREDITO NON SI PAGA: o la si incassa, o la si scala da
  // quello che si deve. Il gesto resta uno, cambia la parola.
  it('il tasto dice «da scalare», non «da pagare»', async () => {
    stato.fatture = [NOTA]
    render(<SupplierInvoicesPanel />)
    expect(await screen.findByRole('button', { name: /da scalare/ })).toBeInTheDocument()
  })

  // IL «DA PAGARE» IN TESTA È IL NETTO: 81 di fattura meno 120 di nota fanno
  // −39, e sommandoli — com'era — ne facevano 201.
  it('il «Da pagare» in testa scende invece di salire', async () => {
    stato.fatture = [NOTA, FATTURA]
    render(<SupplierInvoicesPanel />)
    const chip = (await screen.findByText('Da pagare')).closest('.chip')
    expect(chip.textContent).toMatch(/-39,00/)
  })
})
