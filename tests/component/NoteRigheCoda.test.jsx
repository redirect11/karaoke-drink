// @vitest-environment happy-dom
'use strict'

// LA NOTA DELLA RIGA NELLE CODE A SCHERMO (BUG-005).
//
// «Senza ghiaccio», «per Anna»: è la riga che cambia come si prepara un
// drink e a chi va consegnato. Si vedeva solo dentro il conto e sulla
// comanda stampata — chi al banco o in sala lavora guardando lo schermo
// invece della stampante non la leggeva mai, e il drink usciva sbagliato.
//
// Qui si prova che compare in tutte e due le code a schermo: quella del
// gestionale (vista a lista) e quella di sala. La nota del CONTO — un'altra
// cosa, che vale per tutte le righe — continua a stare in fondo alla card.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from '../helpers/router.jsx'
import '@testing-library/jest-dom/vitest'

vi.mock('react-router-dom', async (orig) => {
  const vera = await orig()
  return { ...vera, useNavigate: () => vi.fn() }
})

let impostazioni = {}
let ordini = []

vi.mock('../../src/lib/firebaseClient.js', () => ({
  isFirebaseConfigured: true,
  auth: { currentUser: { uid: 'u1', email: 'capo@bar.it', displayName: 'Capo' } },
  db: {},
}))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb({
      uid: 'u1',
      email: 'capo@bar.it',
      displayName: 'Capo',
      getIdTokenResult: async () => ({ claims: { role: 'admin' } }),
    })
    return () => {}
  },
}))

vi.mock('../../src/lib/api.js', () => ({
  // La coda dice «ci sono» e guarda chi c'è (legenda con le presenze):
  // qui non serve a niente, ma senza queste due la pagina non si monta.
  segnalaPresenza: () => {},
  subscribePresenze: () => () => {},
  DEFAULT_SETTINGS: {},
  settingsIniziali: () => ({ ...impostazioni }),
  subscribeSettings: (cb) => {
    cb({ ...impostazioni })
    return () => {}
  },
  subscribeActiveOrders: (cb) => {
    cb(ordini)
    return () => {}
  },
  subscribeOpenCashSession: (cb) => {
    cb({ id: 'cassa-1', status: 'open', opened_at: '2026-08-18T18:00:00.000Z' })
    return () => {}
  },
  subscribeMyCalls: (_uid, cb) => {
    cb([])
    return () => {}
  },
  ackStaffCall: vi.fn(() => Promise.resolve()),
  updateOrderStatus: vi.fn(() => Promise.resolve()),
  advanceComanda: vi.fn(() => Promise.resolve()),
  markOrderPaid: vi.fn(() => Promise.resolve()),
  cancelOrder: vi.fn(() => Promise.resolve()),
  restoreOrder: vi.fn(() => Promise.resolve()),
  createOrder: vi.fn(() => Promise.resolve({})),
  saveStaffToken: vi.fn(() => Promise.resolve()),
  rimuoviStaffToken: vi.fn(() => Promise.resolve()),
  clockOut: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../src/lib/push.js', () => ({ getPushToken: vi.fn(async () => null) }))
vi.mock('../../src/lib/notify.js', () => ({
  ensureNotificationPermission: vi.fn(async () => false),
  notify: vi.fn(),
}))
vi.mock('../../src/lib/beep.js', () => ({ beep: vi.fn(), installAudioUnlock: vi.fn() }))
vi.mock('../../src/lib/printer.js', () => ({
  printComanda: vi.fn(async () => {}),
  printScontrino: vi.fn(async () => {}),
  loadPrinterSettings: vi.fn(() => ({})),
  claimReceiptPrint: vi.fn(() => false),
}))
vi.mock('../../src/lib/paymentsApi.js', () => ({
  readerCheckout: vi.fn(async () => ({})),
  readerTerminate: vi.fn(async () => {}),
}))
vi.mock('../../src/lib/staffApi.js', () => ({ preloadStaff: vi.fn() }))
vi.mock('../../src/lib/pendingOrders.js', () => ({
  subscribePending: (cb) => {
    cb({ pending: [], banners: [] })
    return () => {}
  },
  dismissPending: vi.fn(),
  dismissBanner: vi.fn(),
}))

// Il resto del gestionale non è in prova qui: montarlo vorrebbe dire
// montare mezza app di finzioni.
vi.mock('../../src/components/MenuManager.jsx', () => ({ default: () => <div>menu</div> }))
vi.mock('../../src/components/PrinterSetup.jsx', () => ({ default: () => <div>stampante</div> }))
vi.mock('../../src/components/InventoryManager.jsx', () => ({ default: () => <div>inventario</div> }))
vi.mock('../../src/components/SettingsTab.jsx', () => ({ default: () => <div>impostazioni</div> }))
vi.mock('../../src/components/StatsTab.jsx', () => ({ default: () => <div>statistiche</div> }))
vi.mock('../../src/components/StaffHoursTab.jsx', () => ({ default: () => <div>ore</div> }))
vi.mock('../../src/components/UtentiTab.jsx', () => ({ default: () => <div>utenti</div> }))
vi.mock('../../src/components/VipTab.jsx', () => ({ default: () => <div>vip</div> }))
vi.mock('../../src/components/StaffCallList.jsx', () => ({ default: () => <div>chiamate</div> }))
vi.mock('../../src/components/CassaTab.jsx', () => ({ default: () => <div>cassa</div> }))
vi.mock('../../src/components/InvoicesTab.jsx', () => ({ default: () => <div>fatture</div> }))
vi.mock('../../src/components/DevTools.jsx', () => ({ default: () => <div>dev</div> }))
vi.mock('../../src/components/StaffDrawer.jsx', () => ({ default: () => <div>menu laterale</div> }))
vi.mock('../../src/components/GroupsPanel.jsx', () => ({ default: () => <div>gruppi</div> }))
vi.mock('../../src/components/GroupView.jsx', () => ({ default: () => <div>gruppo</div> }))
vi.mock('../../src/components/ApriCassaBox.jsx', () => ({ default: () => <div>apri cassa</div> }))
vi.mock('../../src/components/ChiudiCassaBox.jsx', () => ({ default: () => <div>chiudi cassa</div> }))
vi.mock('../../src/components/PallinoStampante.jsx', () => ({ default: () => <div>pallino</div> }))
vi.mock('../../src/components/StatusBell.jsx', () => ({ default: () => <div>campanella</div> }))

import BartenderPage from '../../src/pages/BartenderPage.jsx'
import ServiceQueue from '../../src/components/ServiceQueue.jsx'

const ORA = '2026-08-18T21:00:00.000Z'

// Un conto con due righe: una annotata, una no. Serve che la nota compaia
// SOTTO la sua riga e non altrove — attaccata al drink sbagliato è peggio
// che non averla.
const CONTO = {
  id: 'o41',
  daily_number: 41,
  status: 'aperto',
  workflow_status: 'pronto',
  payment_status: 'non_richiesto',
  created_at: ORA,
  order_date: '2026-08-18',
  cash_session_id: 'cassa-1',
  table_label: '4',
  total: 24,
  note: 'Tavolo di fuori',
  order_items: [
    { id: 'i1', name: 'Negroni', qty: 2, unit_price: 9, note: 'senza ghiaccio' },
    { id: 'i2', name: 'Gin tonic', qty: 1, unit_price: 6 },
  ],
  comande: [{ id: 'c-o41', seq: 1, status: 'pronto', created_at: ORA, items: [] }],
  placed_by: { email: 'marta@bar.it', name: 'Marta', role: 'bartender' },
}

// La riga della card che contiene quel prodotto.
const rigaDi = (nome) =>
  [...document.querySelectorAll('.order-card .row.between')].find((r) =>
    r.textContent.includes(nome)
  )

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  ordini = [CONTO]
  impostazioni = {
    queue_view: 'lista',
    queue_search: 'filtra',
    workflow_enabled: true,
    groups_enabled: false,
    business_day_cutoff_hour: 6,
  }
})

describe('la nota della riga si vede nella coda del gestionale', () => {
  it('compare sotto il prodotto a cui appartiene', async () => {
    render(
      <MemoryRouter>
        <BartenderPage />
      </MemoryRouter>
    )
    await screen.findByText(/Negroni/)
    const negroni = rigaDi('Negroni')
    expect(within(negroni).getByText(/senza ghiaccio/)).toBeInTheDocument()
    // Il gin tonic non ha note: non deve ereditare quella del vicino.
    expect(rigaDi('Gin tonic').textContent).not.toMatch(/senza ghiaccio/)
  })

  it('non si mangia la nota del CONTO, che è un altro avviso', async () => {
    render(
      <MemoryRouter>
        <BartenderPage />
      </MemoryRouter>
    )
    await screen.findByText(/Negroni/)
    expect(document.querySelector('.order-note').textContent).toMatch(/Tavolo di fuori/)
  })
})

describe('la nota della riga si vede nella coda di sala', () => {
  it('chi porta il vassoio la legge sulla card', async () => {
    render(
      <MemoryRouter>
        <ServiceQueue />
      </MemoryRouter>
    )
    await screen.findByText(/Negroni/)
    const negroni = rigaDi('Negroni')
    expect(within(negroni).getByText(/senza ghiaccio/)).toBeInTheDocument()
    expect(rigaDi('Gin tonic').textContent).not.toMatch(/senza ghiaccio/)
  })
})
