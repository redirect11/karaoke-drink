// @vitest-environment happy-dom
'use strict'

// ── UN FATTO, UN AVVISO (BUG-072) ────────────────────────────────────
//
// «Perché arrivano due notifiche diverse di ordine ricevuto? E poi vedi che
// ci sono due ordini #5» (l'utente, 21/08/2026). Nel centro notifiche, uno
// dietro l'altro sull'ordine #5 delle 21:20: «🆕 Nuovo ordine — Ordine #5
// ricevuto.» e «Ordine ricevuto — Ordine #5». E poi: «vedi che tra l'altro
// le notifiche sono diverse». Non è la stessa notifica consegnata due volte
// — quella il sistema la fonderebbe dal `tag` — sono DUE avvisi, con due
// titoli e due corpi, per un fatto solo.
//
// COME NASCEVANO. Nello stesso gestore di snapshot della coda c'erano due
// strade che potevano parlare dello stesso conto:
//   · «ordine nuovo», che chiedeva soltanto «l'ho già visto?» a una memoria
//     rifatta da capo a ogni snapshot;
//   · «cambio di stato», che guarda lo stato di prima.
// Bastava che il conto uscisse dalla finestra della coda e rientrasse — ed è
// quello che fa un conto annullato e poi ripristinato — perché la prima lo
// credesse nuovo mentre la seconda raccontava il ritorno.
//
// E succedeva anche SENZA che il conto sparisse mai, col pagamento
// obbligatorio: il conto entrava nell'insieme «aspetta di essere pagato» e
// da lì non usciva più, nemmeno annullandolo. È il giro che riproduce qui
// sotto, riga per riga, la sequenza letta al banco.
//
// COSA DEVE FARE ADESSO: un conto ripristinato è una notizia — torna in coda,
// c'è di nuovo da fare — ma un avviso solo, e con le parole del fatto
// («Conto ripristinato»), non con quelle di un ordine che non è mai arrivato.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { MemoryRouter } from '../helpers/router.jsx'
import '@testing-library/jest-dom/vitest'

vi.mock('react-router-dom', async (orig) => {
  const vera = await orig()
  return { ...vera, useNavigate: () => vi.fn() }
})

let ordini = []
let mandaOrdini = null

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
  subscribePresenze: (cb) => { cb([]); return () => {} },
  DEFAULT_SETTINGS: {},
  settingsIniziali: () => ({}),
  subscribeSettings: (cb) => { cb({}); return () => {} },
  subscribeActiveOrders: (cb) => { mandaOrdini = cb; cb(ordini); return () => {} },
  subscribeOpenCashSession: (cb) => {
    cb({ id: 'cassa-1', status: 'open', opened_at: '2026-08-16T18:00:00.000Z' })
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
  subscribePending: (cb) => { cb({ pending: [], banners: [] }); return () => {} },
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
import { notify } from '../../src/lib/notify.js'
import { idDispositivo } from '../../src/lib/dispositivo.js'

// Un terminale che non e' questo: cosi' gli avvisi non vengono zittiti da
// «l'ho fatto io» e si vede quello che vedrebbe il banco.
const ALTRO = 'altro-tablet'

const ORA = '2026-08-16T21:00:00.000Z'
const conto = (patch) => ({
  daily_number: 5,
  status: 'aperto',
  payment_status: 'non_richiesto',
  created_at: ORA,
  order_date: '2026-08-16',
  cash_session_id: 'cassa-1',
  total: 10,
  order_items: [],
  comande: [{ id: 'c-o5', seq: 1, status: patch.workflow_status ?? 'ricevuto', created_at: ORA, items: [] }],
  placed_by: { email: 'marta@bar.it', name: 'Marta', role: 'bartender', device: ALTRO },
  ...patch,
})

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  ordini = []
})

// Titolo e corpo di ogni avviso partito, in ordine.
const avvisi = () => notify.mock.calls.map((c) => `${c[0]} | ${c[1]}`)

// Monta la coda e le fa vedere il primo snapshot: da lì in poi ogni
// `mandaOrdini` è quello che arriverebbe dal server (o dalla cache).
async function coda(primo = []) {
  ordini = primo
  render(
    <MemoryRouter>
      <BartenderPage />
    </MemoryRouter>
  )
  await act(async () => {})
  notify.mockClear()
}

describe('annulla e ripristina: un avviso solo', () => {
  it('il conto col pagamento obbligatorio non torna «nuovo»', async () => {
    // LA SEQUENZA DEL BANCO. Il conto arriva dal menù e aspetta di essere
    // pagato (in coda non ci entra, e infatti non si annuncia). Lo si
    // annulla, poi lo si rimette in piedi e stavolta è saldato.
    const attesa = { payment_required: true, payment_status: 'in_attesa' }
    const arrivato = conto({ id: 'o5', workflow_status: 'ricevuto', ...attesa })
    const annullato = conto({
      id: 'o5',
      workflow_status: 'annullato',
      status: 'annullato',
      cancelled_device: ALTRO,
      ...attesa,
    })
    const tornato = conto({
      id: 'o5',
      workflow_status: 'ricevuto',
      payment_required: true,
      payment_status: 'pagato',
      ripristinato_device: ALTRO,
    })
    await coda()
    await act(async () => mandaOrdini([arrivato]))
    await act(async () => mandaOrdini([annullato]))
    await act(async () => mandaOrdini([tornato]))
    // Prima erano tre: l'annullo, «🆕 Nuovo ordine — Ordine #5 ricevuto.» e
    // il cambio di stato. Due di questi raccontavano lo stesso ritorno.
    expect(avvisi()).toEqual([
      '✖️ Annullato | Ordine #5',
      '↩️ Conto ripristinato | Ordine #5',
    ])
  })

  it('e nemmeno il conto che nel frattempo era sparito dalla coda', async () => {
    // Un conto annullato può uscire davvero dalla finestra della coda: è
    // quello aperto ieri e mai chiuso, che annullandolo esce dai conti
    // aperti e non entra in quelli di oggi. Al ritorno il banco deve
    // leggere che è tornato, non che è arrivato.
    const aperto = conto({ id: 'o5', workflow_status: 'ricevuto' })
    const annullato = conto({
      id: 'o5',
      workflow_status: 'annullato',
      status: 'annullato',
      cancelled_device: ALTRO,
    })
    const tornato = conto({ id: 'o5', workflow_status: 'ricevuto', ripristinato_device: ALTRO })
    await coda([aperto])
    await act(async () => mandaOrdini([annullato]))
    await act(async () => mandaOrdini([])) // sparito dalla vista
    await act(async () => mandaOrdini([tornato]))
    expect(avvisi()).toEqual([
      '✖️ Annullato | Ordine #5',
      '↩️ Conto ripristinato | Ordine #5',
    ])
  })

  it('chi l’ha ripristinato da qui non se lo sente ripetere', async () => {
    // Stessa idea di `annullatoDaQui`: si ripristina dal conto, non dalla
    // coda, quindi «l'ho premuto io» di questa schermata non basta — il
    // metro è il terminale.
    const annullato = conto({
      id: 'o5',
      workflow_status: 'annullato',
      status: 'annullato',
      cancelled_device: ALTRO,
    })
    const tornato = conto({
      id: 'o5',
      workflow_status: 'ricevuto',
      ripristinato_device: idDispositivo(),
    })
    await coda([annullato])
    await act(async () => mandaOrdini([tornato]))
    expect(avvisi()).toEqual([])
  })
})

describe('un ordine mai visto resta un ordine nuovo', () => {
  it('e lo si annuncia con le parole di sempre', async () => {
    // La memoria che non dimentica non deve zittire il caso per cui esiste
    // l'avviso: un conto battuto altrove che compare adesso in coda.
    await coda()
    await act(async () => mandaOrdini([conto({ id: 'o7', daily_number: 7, workflow_status: 'ricevuto' })]))
    expect(avvisi()).toEqual(['🆕 Nuovo ordine | Ordine #7 ricevuto.'])
  })
})
