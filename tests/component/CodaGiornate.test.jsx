// @vitest-environment happy-dom
'use strict'

// LE GIORNATE IN CODA: la riga che separa oggi dai giorni scorsi.
//
// Un conto rimasto aperto dall'altra sera non si mescola a quelli di
// stasera: scende sotto una riga con la sua data. Quella riga è l'unica
// cosa che dice PERCHÉ quei conti sono ancora lì, e diceva male in due
// modi diversi — l'etichetta era una sola per tutte le schede
// («Da chiudere» anche fra i chiusi, BUG-059) e una data che non si
// riusciva a leggere usciva come «Invalid Date» (BUG-060).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  segnalaPresenza: vi.fn(),
  subscribePresenze: (cb) => {
    cb([])
    return () => {}
  },
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
  // La cassa è aperta da tre giorni: così i conti chiusi delle sere scorse
  // restano in coda (restaInCoda guarda l'apertura, non il calendario).
  subscribeOpenCashSession: (cb) => {
    cb({
      id: 'cassa-1',
      status: 'open',
      opened_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    })
    return () => {}
  },
  updateOrderStatus: vi.fn(() => Promise.resolve()),
  advanceComanda: vi.fn(() => Promise.resolve()),
  markOrderPaid: vi.fn(() => Promise.resolve()),
  cancelOrder: vi.fn(() => Promise.resolve()),
  restoreOrder: vi.fn(() => Promise.resolve()),
  segnaComandaStampata: vi.fn(),
  segnaScontrinoStampato: vi.fn(),
  createOrder: vi.fn(() => Promise.resolve({})),
  setOrderColore: vi.fn(),
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
  reclaimReceiptPrint: vi.fn(() => false),
  releaseReceiptPrint: vi.fn(),
  scontrinoGiaUscito: vi.fn(() => false),
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
import { businessDayKey } from '../../src/lib/businessDay.js'

const CUTOFF = 6
const OGGI = businessDayKey(new Date(), CUTOFF)
const IERI = (() => {
  const d = new Date(`${OGGI}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
})()
// Un istante di ieri sera, dopo l'apertura della cassa. Si conta DA IERI,
// non da adesso meno venti ore: quel conto cadeva dentro la giornata di
// oggi ogni volta che i test giravano fra mezzanotte e le sei — cioe'
// proprio nelle ore in cui il locale lavora e in cui si guardano i rossi.
// Le 21 di IERI stanno sempre in quella giornata, a qualunque ora si provi.
const IERI_SERA = new Date(`${IERI}T21:00:00`).toISOString()

const conto = (patch) => ({
  status: 'aperto',
  payment_status: 'non_richiesto',
  created_at: IERI_SERA,
  order_date: IERI,
  cash_session_id: 'cassa-1',
  total: 10,
  order_items: [],
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: patch.workflow_status ?? 'ricevuto',
      created_at: IERI_SERA,
      items: [],
    },
  ],
  placed_by: { email: 'marta@bar.it', name: 'Marta', role: 'bartender' },
  ...patch,
})

const montaCoda = () =>
  render(
    <MemoryRouter>
      <BartenderPage />
    </MemoryRouter>
  )

// Le righe che separano le giornate, come si leggono a schermo.
const separatori = () =>
  [...document.querySelectorAll('.day-sep')].map((n) => n.textContent.trim())

// I FILTRI DI STATO STANNO DIETRO IL TASTINO DEI FILTRI (REQ-CODA-008):
// la fila nasce chiusa, e chi vuole cambiarli la apre prima — come al
// banco. E SI ESCLUDONO A VICENDA (REQ-CODA-009, sesta correzione del
// 20/08/2026): per vedere solo i chiusi basta accendere «Chiusi», che
// spegne «Aperti» da sé. Per mezza giornata sono stati combinabili e ci
// volevano due tocchi.
const apriFiltri = async (utente) => {
  await utente.click(screen.getByRole('button', { name: 'Filtri' }))
}
const soloStato = async (utente, nome) => {
  await apriFiltri(utente)
  await utente.click(screen.getByRole('button', { name: nome }))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  impostazioni = {
    queue_view: 'griglia',
    queue_search: 'filtra',
    workflow_enabled: false,
    groups_enabled: false,
    business_day_cutoff_hour: CUTOFF,
  }
  ordini = [
    // rimasto aperto dall'altra sera
    conto({ id: 'v1', daily_number: 11, workflow_status: 'ricevuto' }),
    // incassato l'altra sera, e chiuso davvero
    conto({
      id: 'v2',
      daily_number: 12,
      status: 'pagato',
      workflow_status: 'pagato',
      payment_status: 'pagato',
      status_times: { pagato: IERI_SERA },
    }),
    // annullato l'altra sera
    conto({
      id: 'v3',
      daily_number: 13,
      status: 'annullato',
      workflow_status: 'annullato',
      status_times: { annullato: IERI_SERA },
    }),
  ]
})

// L'ETICHETTA DIPENDE DALLA SCHEDA (BUG-059).
//
// «Da chiudere · ieri» era scritto su ogni gruppo, in ogni scheda. Fra i
// CHIUSI è falso: quei conti sono pagati e chiusi, non c'è più niente da
// fare — e chi legge va a cercare cosa manca.
describe('la riga che separa le giornate', () => {
  it('fra i conti IN CORSO dice che sono rimasti da chiudere', async () => {
    montaCoda()
    await screen.findByText('#11')
    expect(separatori()).toEqual(['⏳ Da chiudere · ieri'])
  })

  it('coi soli CHIUSI dice «Chiusi», non «Da chiudere»', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('#11')
    await soloStato(utente, /Chiusi/)
    expect(await screen.findByText('#12')).toBeInTheDocument()
    expect(separatori()).toEqual(['💶 Chiusi · ieri'])
  })

  it('coi soli ANNULLATI dice «Annullati»', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('#11')
    await soloStato(utente, /Annullati/)
    expect(await screen.findByText('#13')).toBeInTheDocument()
    expect(separatori()).toEqual(['✖️ Annullati · ieri'])
  })

  it('e la riga cambia con lo stato, senza mai mescolarli', async () => {
    // C'ERA UN CASO IN PIÙ, ed è sparito con la regola: con gli stati
    // combinabili «Aperti + Chiusi» metteva sotto la stessa riga conti di
    // due nature e la riga si riduceva alla sola data. Adesso in coda c'è
    // sempre uno stato solo, quindi la riga ha sempre qualcosa da dire —
    // e passando da uno all'altro cambia con lui.
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('#11')
    await soloStato(utente, /Chiusi/)
    expect(await screen.findByText('#12')).toBeInTheDocument()
    expect(separatori()).toEqual(['💶 Chiusi · ieri'])

    await utente.click(screen.getByRole('button', { name: 'Aperti' }))
    await screen.findByText('#11')
    expect(separatori()).toEqual(['⏳ Da chiudere · ieri'])
  })
})

// «Invalid Date» COME INTESTAZIONE DI GRUPPO (BUG-060).
//
// I conti senza data leggibile finivano in un gruppo con un trattino per
// chiave, e la chiave del gruppo è la stessa cosa che va al formattatore
// delle date: in cima al gruppo si leggeva «Invalid Date». Adesso la data
// si cerca in tutte le date locali che il conto si porta dietro, e se
// proprio non c'è il conto va sotto oggi — senza etichette inventate.
describe('un conto con la data monca', () => {
  it('non stampa mai «Invalid Date» in cima a un gruppo', async () => {
    ordini = [
      ...ordini,
      conto({ id: 'monco', daily_number: 99, order_date: null, created_at: null, comande: [] }),
    ]
    montaCoda()
    await screen.findByText('#99')
    expect(document.body.textContent).not.toMatch(/Invalid Date/)
  })

  it('senza nessuna data va sotto oggi, dove chi lavora lo vede', async () => {
    ordini = [
      conto({ id: 'monco', daily_number: 99, order_date: null, created_at: null, comande: [] }),
    ]
    montaCoda()
    await screen.findByText('#99')
    // sotto oggi non c'è nessuna riga di separazione: è il gruppo in cima
    expect(separatori()).toEqual([])
  })

  it('ma se una data locale c’è, il conto finisce sotto IL SUO giorno', async () => {
    // `order_date` manca e `created_at` non è ancora arrivato dal server:
    // resta l'apertura, che l'orologio di qui ha scritto alla nascita.
    ordini = [
      conto({
        id: 'monco',
        daily_number: 99,
        order_date: null,
        created_at: null,
        comande: [],
        tempi_conto: { aperto: IERI_SERA },
      }),
    ]
    montaCoda()
    await screen.findByText('#99')
    expect(separatori()).toEqual(['⏳ Da chiudere · ieri'])
  })
})

// ── IL TAGLIO DEI GIORNI SCORSI SI PORTA DIETRO (BUG-080) ─────────
//
// «Solo oggi» non è un filtro della griglia: taglia la lista da cui
// scendono TUTTE le viste. Il chip però stava solo in griglia: chi lo
// accendeva e poi passava alle comande — stessa pagina, un tocco — si
// ritrovava la coda tagliata e nessun chip per rimetterla a posto.
//
// IL BADGE NON C'ENTRA PIÙ. Questo test controllava anche il numero sul
// tastino («1» di qua e di là): il numero è stato tolto il 22/08/2026
// («sì ma infatti togliamo quel numero. Non serve»), e quello che conta
// qui è che il CHIP viaggi con la vista — è lui il modo di spegnere il
// taglio, ed è l'unica cosa che chi guarda può usare.
describe('«Solo oggi» passando dai conti alle comande', () => {
  const tasto = () => screen.getByRole('button', { name: 'Filtri' })

  it('il chip per spegnerlo c’è anche fra le comande', async () => {
    const utente = userEvent.setup()
    // il tasto che porta alle comande esiste solo con gli stati del
    // servizio accesi
    impostazioni = { ...impostazioni, workflow_enabled: true }
    montaCoda()
    await screen.findByText('#11')

    // in griglia: accendo il taglio e richiudo la fila
    await apriFiltri(utente)
    await utente.click(screen.getByRole('button', { name: /Solo oggi/ }))
    await apriFiltri(utente)

    // stessa pagina, un tocco: adesso si guardano le comande
    await utente.click(screen.getByRole('button', { name: 'Comande' }))

    // e si spegne da dove si vede, senza tornare in griglia
    await apriFiltri(utente)
    const chip = screen.getByRole('button', { name: /Solo oggi/ })
    expect(chip).toHaveClass('active')
    await utente.click(chip)
    // Spento, il chip se ne va: fuori dalla griglia sta in fila solo
    // quando è ACCESO, che lì è l'unico motivo per farlo vedere.
    expect(screen.queryByRole('button', { name: /Solo oggi/ })).not.toBeInTheDocument()

    // IL TASTINO, IN TUTTO QUESTO, NON HA MAI PORTATO UN NUMERO.
    await apriFiltri(utente)
    expect(tasto().textContent).not.toMatch(/\d/)
  })
})
