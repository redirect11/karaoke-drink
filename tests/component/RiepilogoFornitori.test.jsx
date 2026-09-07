// @vitest-environment happy-dom
'use strict'

// ── IL «RIEPILOGO» DI FORNITORI (REQ-MAG-034) ────────────────────────
//
// Quarta voce della sezione: merce, altre spese e quanto resta aperto, mese
// per mese. È il numero che Bilancio → Mesi userà per il netto
// (REQ-CASSA-012).
//
// LA COSA CHE QUESTO TEST NON LASCIA CADERE è una frase a schermo. Misurato
// sui fogli il 19/08: la riga «spese» del foglio mensile contiene ANCHE la
// merce (gen 2.380 contro 1.809 di acquisti, apr 5.005 contro 2.884, giu
// 12.726 contro 8.673), mentre nell'app le due cose restano separate. Il
// totale dell'app vale quindi MENO del suo, e se non lo si dice in
// schermata, al primo confronto sembra che l'app sbagli e si torna al
// foglio.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const NOVA = { id: 'nova', name: 'Nova' }

// La riga di un mese, per non confondere il suo totale con quello in testa:
// con un mese solo sono lo stesso numero, ed è proprio il caso in cui una
// prova scritta male passerebbe comunque.
const mese = async (nome) => within((await screen.findByText(nome)).closest('.inv-item'))

const stato = {
  fatture: [
    { id: 'f1', supplier_id: 'nova', supplier_name: 'Nova', date: '2026-01-12', amount: 1000, paid: true, order_id: 'po-9' },
    { id: 'f2', supplier_id: 'nova', supplier_name: 'Nova', date: '2026-01-28', amount: 809, paid: false, order_id: null },
  ],
  spese: [
    { id: 's1', name: 'Sgabelli', qty: 4, unit_cost: 39.9, bought: true, bought_at: '2026-01-14' },
    { id: 's2', name: 'Divano', qty: 1, unit_cost: 499, bought: false, bought_at: null },
  ],
  ordini: [],
}

vi.mock('../../src/lib/api.js', () => ({
  fetchSuppliers: vi.fn(async () => [NOVA]),
  fetchSupplierInvoices: vi.fn(async () => stato.fatture),
  fetchPurchaseOrders: vi.fn(async () => stato.ordini),
  fetchAltreSpese: vi.fn(async () => stato.spese),
}))

import RiepilogoFornitoriPanel from '../../src/components/RiepilogoFornitoriPanel.jsx'

beforeEach(() => {
  vi.clearAllMocks()
  stato.ordini = []
})

describe('un mese per riga, coi due numeri che lo compongono', () => {
  it('la merce viene dalle fatture, le altre spese solo da quelle comprate', async () => {
    render(<RiepilogoFornitoriPanel />)
    const gennaio = await mese('gennaio 2026')
    // 1.000 + 809 di documenti; 4 × 39,90 di spese comprate. Il divano da 499
    // è un desiderio e non entra.
    const riga = gennaio.getByText(/Merce .* Altre spese/)
    expect(riga).toHaveTextContent('1.809,00')
    expect(riga).toHaveTextContent('159,60')
    expect(riga).not.toHaveTextContent('499')
  })

  it('il totale del mese è la somma dei due', async () => {
    render(<RiepilogoFornitoriPanel />)
    const gennaio = await mese('gennaio 2026')
    expect(gennaio.getByText('1.968,60 €')).toBeInTheDocument()
  })
})

describe('quello che resta aperto si vede, e non gonfia il totale', () => {
  it('il da pagare è già dentro la merce', async () => {
    render(<RiepilogoFornitoriPanel />)
    const gennaio = await mese('gennaio 2026')
    expect(gennaio.getByText(/Ancora da pagare/)).toHaveTextContent('809,00')
    // Il totale non cambia: quelle fatture sono già contate una volta.
    expect(gennaio.getByText('1.968,60 €')).toBeInTheDocument()
  })

  it('la merce consegnata e senza documento si mostra a parte', async () => {
    stato.ordini = [
      {
        id: 'po-1',
        created_at: '2026-01-20T09:00:00.000Z',
        lines: [
          { item_id: 'campari', name: 'Campari', qty_packages: 6, unit_cost: 12.5, vat: 22, supplier_id: 'nova', stato: 'consegnato' },
        ],
      },
    ]
    render(<RiepilogoFornitoriPanel />)
    const gennaio = await mese('gennaio 2026')
    expect(gennaio.getByText(/Consegnato senza fattura/)).toHaveTextContent('75,00')
    // Il totale del mese non si muove di un centesimo: quella merce entrerà
    // quando arriva il documento, e sommarla adesso la conterebbe due volte.
    expect(gennaio.getByText('1.968,60 €')).toBeInTheDocument()
  })
})

describe('la frase che evita il primo equivoco', () => {
  // Senza questa, al primo confronto col foglio mensile sembra che l'app
  // sbagli: la sua riga «spese» contiene anche la merce, la nostra no.
  it('dice che questi totali sono più bassi di quelli del foglio, e perché', async () => {
    render(<RiepilogoFornitoriPanel />)
    const frase = await screen.findByText(/foglio mensile/)
    expect(frase).toHaveTextContent(/comprende anche la merce/)
    expect(frase).toHaveTextContent(/più bassi/)
    expect(frase).toHaveTextContent(/una volta sola/)
  })
})
