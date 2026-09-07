// @vitest-environment happy-dom
'use strict'

// UN PANNELLO CHE SI APRE APPOSTA NON PUÒ RESTARE MUTO. Dal menu ⋯ della
// coda si tocca «Chiamate staff e gruppi» e non succedeva niente: con un
// solo account non c'è nessuno da chiamare, e il pannello si toglieva di
// mezzo da sé. Chi tocca vede un tasto che non fa nulla, e pensa sia rotto.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

let staff = []

vi.mock('../../src/lib/firebaseClient.js', () => ({
  auth: { currentUser: { uid: 'io' } },
}))
vi.mock('../../src/lib/staffApi.js', () => ({
  staffFromCache: [],
  listStaff: () => Promise.resolve(staff),
}))
vi.mock('../../src/lib/api.js', () => ({
  createStaffCall: vi.fn(),
  subscribePendingCalls: vi.fn(() => () => {}),
  subscribeStaffShiftsRange: vi.fn(() => () => {}),
  clockIn: vi.fn(),
  clockOut: vi.fn(),
}))

import StaffCallList from '../../src/components/StaffCallList.jsx'

beforeEach(() => {
  staff = []
})

describe('il pannello «chiama lo staff»', () => {
  it('aperto apposta e senza nessuno da chiamare, lo dice', async () => {
    render(<StaffCallList mostraSeVuoto />)
    expect(await screen.findByText(/Non c'è nessun altro da chiamare/)).toBeInTheDocument()
    // E dice pure dove si creano gli account, che è la domanda dopo.
    expect(screen.getByText(/Utenti e ruoli/)).toBeInTheDocument()
  })

  it('dove compare da sé resta muto: una card vuota fissa sarebbe rumore', async () => {
    const { container } = render(<StaffCallList />)
    // `waitFor` di Testing Library, non quello di vitest: e' l'unico che
    // fa atterrare l'elenco dello staff DENTRO il giro di disegno. Con
    // l'altro la lettura finiva a test concluso, e la verifica «non c'e'
    // niente» era vera solo perche' non era ancora arrivato niente.
    await waitFor(() => expect(container.querySelector('.card')).toBeNull())
  })

  it('con qualcuno da chiamare mostra l’elenco, non il messaggio', async () => {
    staff = [{ uid: 'anna', name: 'Anna', role: 'staff' }]
    render(<StaffCallList mostraSeVuoto />)
    expect(await screen.findByText('Anna')).toBeInTheDocument()
    expect(screen.queryByText(/Non c'è nessun altro/)).toBeNull()
  })

  it('chi guarda non chiama se stesso', async () => {
    staff = [{ uid: 'io', name: 'Capo Bar', role: 'admin' }]
    render(<StaffCallList mostraSeVuoto />)
    expect(await screen.findByText(/Non c'è nessun altro da chiamare/)).toBeInTheDocument()
  })
})
