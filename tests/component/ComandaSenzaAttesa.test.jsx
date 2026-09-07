// @vitest-environment happy-dom
'use strict'

// APRIRE UNA COMANDA NON ASPETTA IL SERVER (BUG-031).
//
// La schermata della comanda restava su «Apro la comanda…» finché non
// arrivavano DUE cose: lo snapshot dell'ordine — che la coda aveva già in
// mano un istante prima — e il RUOLO, ricavato da capo con
// `getIdTokenResult()`. Il token dura un'ora: quando è scaduto quella
// chiamata va in rete, e con la linea del locale che risulta collegata ma non
// passa il tocco resta sotto lo spinner. È il divieto scritto in
// docs/architettura.md — niente letture al server nel percorso di un gesto —
// su un gesto che si fa 300-450 volte a sera.
//
// Qui il token NON RISPONDE MAI: è il caso della rete muta. La schermata deve
// aprirsi lo stesso, con l'ultimo ruolo noto su questo dispositivo.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { MemoryRouter } from '../helpers/router.jsx'
import '@testing-library/jest-dom/vitest'

vi.mock('react-router-dom', async (orig) => {
  const vera = await orig()
  return { ...vera, useNavigate: () => vi.fn() }
})

// Il token: ogni prova decide se risponde, quanto ci mette, o se non torna
// mai. È l'unica cosa che cambia fra un caso e l'altro.
let tokenRisponde = null
vi.mock('../../src/lib/firebaseClient.js', () => ({
  auth: { currentUser: { uid: 'u1', email: 'marta@bar.it' } },
  db: {},
}))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb({ uid: 'u1', getIdTokenResult: () => tokenRisponde() })
    return () => {}
  },
}))

let ordine = null
vi.mock('../../src/lib/api.js', () => ({
  subscribeOrder: (_id, cb) => {
    cb(ordine)
    return () => {}
  },
  subscribeSettings: (cb) => {
    cb({ workflow_enabled: true })
    return () => {}
  },
  settingsIniziali: () => ({ workflow_enabled: true }),
  advanceComanda: vi.fn(() => Promise.resolve()),
  preparazioneParziale: vi.fn(() => Promise.resolve()),
  setOrderServiceMode: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../src/lib/printer.js', () => ({ printComanda: vi.fn(async () => {}) }))
vi.mock('../../src/lib/toast.js', () => ({ showToast: vi.fn() }))

import ComandaPage from '../../src/pages/ComandaPage.jsx'
import { ricordaRuolo, ruoloRicordato, gestoreRicordato } from '../../src/lib/ruoloLocale.js'

const ORA = '2026-08-18T21:00:00.000Z'

const conto = {
  id: 'o41',
  daily_number: 41,
  status: 'aperto',
  payment_status: 'non_richiesto',
  table_label: '4',
  created_at: ORA,
  service_mode: 'tavolo',
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: 'ricevuto',
      created_at: ORA,
      status_times: { ricevuto: ORA },
      items: [{ drink_id: 'gin', name: 'Gin Tonic', qty: 2, unit_price: 8 }],
    },
  ],
}

const monta = () =>
  render(
    <MemoryRouter initialEntries={['/ordine/o41/comanda/c1']}>
      <Routes>
        <Route path="/ordine/:id/comanda/:comandaId" element={<ComandaPage />} />
        <Route path="/ordine/:id" element={<div>schermata del conto</div>} />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  ordine = conto
  tokenRisponde = async () => ({ claims: { role: 'bartender' } })
})

describe('col ruolo già noto la comanda si apre subito', () => {
  it('anche se il token non risponde più: è la rete del locale che non passa', () => {
    ricordaRuolo('u1', 'bartender')
    // Non torna MAI: è la chiamata appesa in rete.
    tokenRisponde = () => new Promise(() => {})
    monta()
    // Nessuno spinner: la comanda c'è, con le sue righe.
    expect(screen.queryByText('Apro la comanda…')).not.toBeInTheDocument()
    expect(screen.getByText('Gin Tonic')).toBeInTheDocument()
  })

  it('senza memoria si aspetta, come prima: non si tira a indovinare', () => {
    // Primo accesso su questo dispositivo. Meglio un momento di attesa che
    // aprire il lavoro del banco a chi passava di lì.
    tokenRisponde = () => new Promise(() => {})
    monta()
    expect(screen.getByText('Apro la comanda…')).toBeInTheDocument()
  })

  it('la memoria di un ALTRO utente non vale: non si presta il ruolo', () => {
    // Due persone allo stesso tablet.
    ricordaRuolo('u9', 'bartender')
    tokenRisponde = () => new Promise(() => {})
    monta()
    expect(screen.getByText('Apro la comanda…')).toBeInTheDocument()
  })

  it('e se il token dice di no, si va sul conto lo stesso', async () => {
    // Ottimisti in un verso solo: si ENTRA sulla memoria, non ci si resta
    // contro il token. Il declassato viene rimandato al conto.
    ricordaRuolo('u1', 'bartender')
    tokenRisponde = async () => ({ claims: { role: 'cliente' } })
    monta()
    await waitFor(() => expect(screen.getByText('schermata del conto')).toBeInTheDocument())
  })
})

describe('l’ultimo ruolo noto si legge senza rete', () => {
  it('lo si ritrova, e porta con sé l’utente a cui apparteneva', () => {
    ricordaRuolo('u1', 'bartender')
    expect(ruoloRicordato('u1')).toBe('bartender')
    expect(ruoloRicordato('u9')).toBe(null)
    expect(gestoreRicordato('u1')).toBe(true)
  })

  it('scollegandosi non resta in eredità a chi entra dopo', () => {
    ricordaRuolo('u1', 'bartender')
    ricordaRuolo(null, null)
    expect(ruoloRicordato('u1')).toBe(null)
  })

  it('roba illeggibile non fa saltare niente: si aspetta il token', () => {
    localStorage.setItem('tana:ruolo', '{rotto')
    expect(ruoloRicordato('u1')).toBe(null)
    expect(gestoreRicordato('u1')).toBe(false)
  })

  it('un ruolo che non apre il banco resta un no', () => {
    ricordaRuolo('u1', 'staff')
    expect(gestoreRicordato('u1')).toBe(false)
  })
})
