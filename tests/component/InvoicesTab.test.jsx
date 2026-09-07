// @vitest-environment happy-dom
'use strict'

// Test di COMPONENTE del gestore fatture (tab Fatture nel gestionale).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from '../helpers/router.jsx'
import '@testing-library/jest-dom/vitest'

const FATTURE = [
  {
    id: 'inv1',
    number: '2/2026',
    total: 22,
    items: [{ name: 'Mojito', qty: 2, unit_price: 7 }],
    customer: { denominazione: 'ACME srl', piva: '01234567890', email: 'a@acme.it' },
    order_id: 'ord1',
    order_daily_number: 4,
    created_at: '2026-07-13T10:00:00.000Z',
    sent_at: null,
  },
  {
    id: 'inv2',
    number: '1/2026',
    total: 10,
    items: [],
    customer: { denominazione: 'Rossi Mario' },
    order_id: 'ord2',
    order_daily_number: 2,
    created_at: '2026-07-12T10:00:00.000Z',
    sent_at: '2026-07-12T11:00:00.000Z',
    sent_to: 'mario@rossi.it',
  },
]

vi.mock('../../src/lib/api.js', () => ({
  subscribeInvoices: vi.fn((cb) => {
    cb(FATTURE)
    return () => {}
  }),
  markInvoiceSent: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../src/lib/printer.js', () => ({
  printFattura: vi.fn(() => Promise.resolve()),
  loadPrinterSettings: vi.fn(() => ({ businessName: 'La Tana' })),
}))

import InvoicesTab from '../../src/components/InvoicesTab.jsx'
import { printFattura } from '../../src/lib/printer.js'

function mount() {
  return render(
    <MemoryRouter>
      <InvoicesTab />
    </MemoryRouter>
  )
}

beforeEach(() => vi.clearAllMocks())

describe('gestore fatture', () => {
  it('elenca le fatture con numero, cliente, totale e stato invio', () => {
    mount()
    expect(screen.getByText('Fattura n. 2/2026')).toBeInTheDocument()
    expect(screen.getByText(/ACME srl/)).toBeInTheDocument()
    expect(screen.getByText('22,00 €')).toBeInTheDocument()
    // la seconda risulta già inviata
    expect(screen.getByText(/Inviata a mario@rossi.it/)).toBeInTheDocument()
  })

  it('la ricerca filtra per cliente', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByPlaceholderText(/Cerca/), 'acme')
    expect(screen.getByText('Fattura n. 2/2026')).toBeInTheDocument()
    expect(screen.queryByText('Fattura n. 1/2026')).not.toBeInTheDocument()
  })

  it('ogni fattura si ristampa', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getAllByRole('button', { name: /Stampa/ })[0])
    expect(printFattura).toHaveBeenCalledTimes(1)
    expect(printFattura.mock.calls[0][0].number).toBe('2/2026')
  })
})
