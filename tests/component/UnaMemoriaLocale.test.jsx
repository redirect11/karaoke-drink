// @vitest-environment happy-dom
'use strict'

// UNA SOLA MEMORIA DI «L'HO APPENA FATTO IO» (BUG-028).
//
// L'app è local-first: si tocca, si vede, e la scrittura parte in sottofondo.
// Su questa schermata di memorie ce n'erano DUE. `comandeLocali` — nato
// proprio per unificarne tre sparse — teneva le comande; `queueOverrides`, il
// meccanismo vecchio, teneva lo stato del conto. E ogni vista ne leggeva una
// sola: la vista dei CONTI avanzava con `queueOverrides` e le sue comande
// restavano quelle del server; quella del BANCO avanzava con `comandeLocali`
// e lo stato del conto restava quello del server.
//
// Prima non si notava. Poi è arrivato il tastino «🍸 Comande / 🧾 Ordini»,
// che mette le due viste a un tocco di distanza sullo stesso terminale: si
// avanza un ticket, si gira la vista, e il conto è ancora dov'era finché
// non arriva lo snapshot. Offline non arriva mai — ed è il rimbalzo che
// `comandeLocali` era stato scritto per togliere, spostato di una vista.
//
// Qui si prova la cosa che conta: si fa un gesto in una vista, si gira la
// vista SENZA far arrivare niente dal server, e l'altra deve
// raccontare la stessa storia.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from '../helpers/router.jsx'
import '@testing-library/jest-dom/vitest'

// Dove si va toccando una card: la spia dice se si apre il conto giusto.
const navigateSpy = vi.fn()
vi.mock('react-router-dom', async (orig) => {
  const vera = await orig()
  return { ...vera, useNavigate: () => navigateSpy }
})

// Le impostazioni del locale: ogni test le prepara prima di montare.
let impostazioni = {}
// Gli ordini che il server manda alla coda.
let ordini = []
let mandaOrdini = null
// I conti battuti al POS e non ancora arrivati dal server.
let inVolo = []

vi.mock('../../src/lib/firebaseClient.js', () => ({
  isFirebaseConfigured: true,
  auth: { currentUser: { uid: 'u1', email: 'capo@bar.it', displayName: 'Capo' } },
  db: {},
}))
// CHI GUARDA DECIDE COSA VEDE: all'admin le corsie dei CONTI, a chi sta al
// banco quelle delle COMANDE. Ogni test dice chi è collegato.
let ruolo = 'admin'
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb({
      uid: 'u1',
      email: 'capo@bar.it',
      displayName: 'Capo',
      getIdTokenResult: async () => ({ claims: { role: ruolo } }),
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
  // La sottoscrizione resta in mano al test: dopo un gesto si può far
  // arrivare lo snapshot successivo, come fa la CACHE di Firestore — che
  // risponde subito, senza rete.
  subscribeActiveOrders: (cb) => {
    mandaOrdini = cb
    cb(ordini)
    return () => {}
  },
  subscribeOpenCashSession: (cb) => {
    cb({ id: 'cassa-1', status: 'open', opened_at: '2026-08-16T18:00:00.000Z' })
    return () => {}
  },
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

// Hardware e contorno: al banco ci sono, in un test no.
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
    cb({ pending: inVolo, banners: [] })
    return () => {}
  },
  dismissPending: vi.fn(),
  dismissBanner: vi.fn(),
}))

// Il resto del gestionale non è in prova qui: sezioni, pannelli e menu
// laterale diventano segnaposto, altrimenti montare la coda vorrebbe dire
// montare mezza app (e mezza app di finzioni).
vi.mock('../../src/components/MenuManager.jsx', () => ({ default: () => <div>menu</div> }))
vi.mock('../../src/components/PrinterSetup.jsx', () => ({ default: () => <div>stampante</div> }))
vi.mock('../../src/components/InventoryManager.jsx', () => ({ default: () => <div>inventario</div> }))
vi.mock('../../src/components/SettingsTab.jsx', () => ({ default: () => <div>impostazioni</div> }))
vi.mock('../../src/components/StatsTab.jsx', () => ({ default: () => <div>statistiche</div> }))
vi.mock('../../src/components/StaffHoursTab.jsx', () => ({ default: () => <div>ore</div> }))
vi.mock('../../src/components/UtentiTab.jsx', () => ({ default: () => <div>utenti</div> }))
vi.mock('../../src/components/VipTab.jsx', () => ({ default: () => <div>vip</div> }))
vi.mock('../../src/components/ServiceQueue.jsx', () => ({ default: () => <div>servizio</div> }))
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
import { updateOrderStatus, advanceComanda } from '../../src/lib/api.js'
import { mostraOrdine } from '../../src/lib/ordiniNascosti.js'

const ORA = '2026-08-16T21:00:00.000Z'

// Un conto con UNA comanda: è il caso normale al banco, ed è quello in cui
// le due viste devono per forza dire la stessa cosa — la comanda è il conto.
const conto = (patch) => ({
  daily_number: 41,
  status: 'aperto',
  payment_status: 'non_richiesto',
  created_at: ORA,
  order_date: '2026-08-16',
  cash_session_id: 'cassa-1',
  total: 24,
  table_label: '4',
  order_items: [{ id: 'i1', name: 'Negroni', qty: 2, unit_price: 9 }],
  comande: [
    {
      id: `c-${patch.id}`,
      seq: 1,
      status: patch.workflow_status ?? 'ricevuto',
      created_at: ORA,
      items: [{ id: 'i1', name: 'Negroni', qty: 2, unit_price: 9 }],
    },
  ],
  placed_by: { email: 'marta@bar.it', name: 'Marta', role: 'bartender' },
  ...patch,
})

const CODA = [conto({ id: 'o41', workflow_status: 'ricevuto' })]

const corsia = (id) => document.querySelector(`.corsia-${id}`)?.closest('.corsia')
const cardDi = (id) => document.querySelector(`#ordine-${id}, #comanda-${id}`)

function montaCoda() {
  return render(
    <MemoryRouter>
      <BartenderPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  ordini = CODA
  inVolo = []
  mandaOrdini = null
  ruolo = 'admin'
  for (const o of CODA) mostraOrdine(o.id)
  impostazioni = {
    queue_view: 'corsie',
    queue_search: 'filtra',
    workflow_enabled: true,
    groups_enabled: false,
    business_day_cutoff_hour: 6,
  }
})

// Il tastino della testata che gira fra le due viste. Dice DOVE PORTA, non
// dove si è: «Comande» quando si stanno guardando i conti, e viceversa. Da
// REQ-CODA-008 è solo un'icona (🍸 / 🧾) e il nome vive nell'aria-label,
// quindi qui si cerca per nome — che è quello che il tasto continua a dire.
const giraVista = async (utente, verso) =>
  utente.click(screen.getByRole('button', { name: verso }))

describe('avanzo un ticket dal banco e giro la vista', () => {
  it('il conto è già dove l’ho appena messo, senza aspettare il server', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('In corso')

    // Al banco: la card è il ticket, e il tasto grande lo porta al passo dopo.
    await giraVista(utente, 'Comande')
    await screen.findByText('Da fare')
    await utente.click(
      within(corsia('da-fare')).getByRole('button', { name: 'In preparazione' })
    )
    expect(advanceComanda).toHaveBeenCalledWith('o41', 'c-o41', 'in_preparazione')

    // Il ticket si è già spostato di colonna: è la memoria locale.
    expect(within(corsia('al-banco')).getByText(/#41/)).toBeInTheDocument()

    // E ADESSO LA PARTE CHE ROMPEVA: si gira la vista, e NIENTE arriva
    // dal server. Il conto deve raccontare la stessa cosa del suo ticket.
    await giraVista(utente, 'Ordini')
    await screen.findByText('In corso')
    expect(cardDi('o41')).toHaveClass('in_preparazione')
  })
})

describe('avanzo un conto dalla griglia e giro la vista', () => {
  it('il ticket è già al passo dopo, senza aspettare il server', async () => {
    impostazioni.queue_view = 'griglia'
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText(/#41/)

    // Sulla card della griglia i tasti stanno dietro il ⋯, come al banco:
    // il tasto grande è uno solo, e il resto si apre.
    await utente.click(screen.getByRole('button', { name: '⋯ Azioni' }))
    await utente.click(screen.getByRole('button', { name: 'Segna come “In preparazione”' }))
    expect(updateOrderStatus).toHaveBeenCalledWith('o41', 'in_preparazione')

    // La griglia lo dice già.
    expect(cardDi('o41')).toHaveClass('in_preparazione')

    // E il banco anche: prima la comanda restava «da fare», e chi versava
    // si trovava un ticket in una colonna che il conto aveva già lasciato.
    await giraVista(utente, 'Comande')
    await screen.findByText('In preparazione')
    expect(within(corsia('al-banco')).getByText(/#41/)).toBeInTheDocument()
    expect(within(corsia('da-fare')).queryByText(/#41/)).not.toBeInTheDocument()
  })
})

describe('lo stato del conto si ricava dalle comande, non si tiene a parte', () => {
  it('con due comande in due passi il conto sta al passo più indietro', async () => {
    // Era la differenza vera fra le due memorie: `queueOverrides` scriveva
    // lo stato che avevi premuto, e basta. Ricavandolo dalle comande, un
    // conto con una comanda ancora da fare resta «da fare» — che è quello
    // che scriverà il server un istante dopo, e quello che è vero al banco.
    ordini = [
      {
        ...conto({ id: 'o41', workflow_status: 'ricevuto' }),
        comande: [
          { id: 'c1', seq: 1, status: 'ricevuto', created_at: ORA, items: [] },
          { id: 'c2', seq: 2, status: 'pronto', created_at: ORA, items: [] },
        ],
      },
    ]
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('In corso')

    await giraVista(utente, 'Comande')
    await screen.findByText('Da fare')
    // Si porta avanti SOLO la prima comanda: l'altra è già pronta.
    await utente.click(
      within(corsia('da-fare')).getByRole('button', { name: 'In preparazione' })
    )

    await giraVista(utente, 'Ordini')
    await screen.findByText('In corso')
    // Il conto segue la comanda più indietro, che ora è quella in
    // preparazione: non «pronto» solo perché una lo era già.
    expect(cardDi('o41')).toHaveClass('in_preparazione')
  })
})

describe('se la scrittura non passa si torna a quello che dice il server', () => {
  it('il ticket rimbalza indietro, e con lui il conto', async () => {
    advanceComanda.mockRejectedValueOnce(new Error('niente rete'))
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('In corso')

    await giraVista(utente, 'Comande')
    await screen.findByText('Da fare')
    await utente.click(
      within(corsia('da-fare')).getByRole('button', { name: 'In preparazione' })
    )

    // Lasciare la copia locale vorrebbe dire far preparare al banco un
    // avanzamento che sul conto non esiste.
    await waitFor(() =>
      expect(within(corsia('da-fare')).getByText(/#41/)).toBeInTheDocument()
    )
    await giraVista(utente, 'Ordini')
    await screen.findByText('In corso')
    expect(cardDi('o41')).toHaveClass('ricevuto')
  })
})
