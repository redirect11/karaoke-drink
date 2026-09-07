// @vitest-environment happy-dom
'use strict'

// LA CODA A CORSIE (Impostazioni → Coda ordini → «Corsie di stato»).
//
// La stessa vista mostra due cose diverse a seconda di CHI guarda, perché
// sono due mestieri:
//
//   AL BANCO (bartender) le colonne sono i passi del servizio — da fare,
//   al banco, al ritiro, da incassare — e dentro ci stanno le COMANDE, una
//   card per ticket: chi sta allo shaker prepara un ticket per volta, e un
//   conto con tre comande in tre passi diversi disegnato come una card sola
//   direbbe una cosa sbagliata comunque la si metta. Il tasto fa avanzare
//   QUELLA comanda, non tutto il conto.
//
//   A CHI GUARDA LA SERATA (admin, sala) le colonne sono le tre cose che un
//   CONTO può essere: in corso, chiusi, annullati.
//
// Le altre cose che si provano qui sono quelle che al banco costano un
// drink sbagliato:
//   · le colonne ci sono tutte, sempre, anche vuote: la posizione di una
//     colonna si impara a memoria e non deve ballare;
//   · il tasto fa la STESSA cosa delle altre viste — chiama le funzioni
//     dell'app, non una scorciatoia sua;
//   · la ricerca filtra dentro le corsie, tutte insieme;
//   · chi è al banco può spegnere le colonne che in quel momento non gli
//     servono, e al ricarico le ritrova come le aveva lasciate.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
// Chi risulta collegato, e i colpi di vita partiti: li pilota il test.
let presenzeFinte = []
let battiti = []
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
  segnalaPresenza: (r) => battiti.push(r),
  subscribePresenze: (cb) => {
    cb(presenzeFinte)
    return () => {}
  },
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
  segnaComandaStampata: vi.fn(),
  segnaScontrinoStampato: vi.fn(),
  createOrder: vi.fn(() => Promise.resolve({})),
  setOrderColore: vi.fn(),
  saveStaffToken: vi.fn(() => Promise.resolve()),
  rimuoviStaffToken: vi.fn(() => Promise.resolve()),
  clockOut: vi.fn(() => Promise.resolve()),
}))

// ── TRASCINARE UNA COMANDA IN UN'ALTRA COLONNA ──────────────────────
//
// IL GESTO NON SI PROVA QUI, LA REGOLA SÌ. Il dito che tiene premuto, la
// card che segue, il rilascio: lo fa dnd-kit, ed è provato a casa sua — in
// un test senza schermo le card non hanno misure e un dito non c'è. Quello
// che deve reggere è il NOSTRO incastro: su quale colonna è stata mollata
// la card, quale stato ne viene, e che a scriverlo sia la strada di sempre.
//
// Quindi la libreria diventa un guscio che consegna al test la funzione che
// chiamerebbe al rilascio: `lascia(card, colonna)` è «ho mollato quella
// comanda su quella colonna». Quello che resta da provare a mano, sul
// tablet, sta scritto nel requisito (REQ-CODA-007).
//
// SI SOSTITUISCE UNA COSA SOLA, il guscio che riceve il gesto: i ganci
// veri (useDraggable, useDroppable, i sensori) restano quelli della
// libreria e vengono montati per davvero, o questo test direbbe che la
// lavagna funziona anche il giorno in cui non si monta piu'.
let lascia = null
vi.mock('@dnd-kit/core', async (originale) => {
  const vera = await originale()
  return {
    ...vera,
    DndContext: ({ children, onDragStart, onDragEnd }) => {
      lascia = (card, colonna) => {
        onDragStart({ active: { id: card } })
        onDragEnd({ active: { id: card }, over: colonna ? { id: colonna } : null })
      }
      return <>{children}</>
    },
  }
})

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
  reclaimReceiptPrint: vi.fn(() => false),
  releaseReceiptPrint: vi.fn(),
  scontrinoGiaUscito: vi.fn(() => false),
}))
vi.mock('../../src/lib/paymentsApi.js', () => ({
  readerCheckout: vi.fn(async () => ({})),
  readerTerminate: vi.fn(async () => {}),
}))
vi.mock('../../src/lib/staffApi.js', () => ({ preloadStaff: vi.fn() }))
// Il perché la cassa non si può chiudere esce come avviso al tocco
// (BUG-062): si spia quello, il resto del modulo resta vero.
vi.mock('../../src/lib/toast.js', async (orig) => ({
  ...(await orig()),
  showToast: vi.fn(),
}))
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
import { nascondiOrdine, mostraOrdine } from '../../src/lib/ordiniNascosti.js'
import { updateOrderStatus, advanceComanda, setOrderColore, markOrderPaid } from '../../src/lib/api.js'
import { showToast } from '../../src/lib/toast.js'
import {
  loadPrinterSettings,
  printScontrino,
  reclaimReceiptPrint,
  claimReceiptPrint,
} from '../../src/lib/printer.js'

const ORA = '2026-08-16T21:00:00.000Z'

// Un conto come arriva dalla coda: comande allineate allo stato, così le
// regole di chiusura (comande.js) rispondono come in produzione. Le righe
// stanno DENTRO la comanda, che è dove stanno davvero: al banco la card è
// il ticket, e senza righe nella comanda non ci sarebbe niente da leggere.
const conto = (patch) => ({
  daily_number: 1,
  status: 'aperto',
  payment_status: 'non_richiesto',
  created_at: ORA,
  order_date: '2026-08-16',
  cash_session_id: 'cassa-1',
  total: 10,
  order_items: [],
  comande: [
    {
      id: `c-${patch.id}`,
      seq: 1,
      status: patch.workflow_status ?? 'ricevuto',
      created_at: ORA,
      items: patch.order_items || [],
    },
  ],
  placed_by: { email: 'marta@bar.it', name: 'Marta', role: 'bartender' },
  ...patch,
})

const CODA = [
  conto({
    id: 'o41',
    daily_number: 41,
    workflow_status: 'ricevuto',
    table_label: '4',
    total: 24,
    order_items: [
      { id: 'i1', name: 'Negroni', qty: 2, unit_price: 9 },
      { id: 'i2', name: 'Gin tonic', qty: 1, unit_price: 6 },
    ],
  }),
  conto({
    id: 'o42',
    daily_number: 42,
    workflow_status: 'ricevuto',
    service_mode: 'banco',
    note: 'Poco ghiaccio',
    total: 9,
    order_items: [{ id: 'i3', name: 'Espresso Martini', qty: 1, unit_price: 9 }],
  }),
  conto({
    id: 'o39',
    daily_number: 39,
    workflow_status: 'in_preparazione',
    customer_name: 'Ciro',
    total: 30,
    order_items: [{ id: 'i4', name: 'Old Fashioned', qty: 2, unit_price: 15 }],
  }),
  conto({
    id: 'o37',
    daily_number: 37,
    workflow_status: 'pronto',
    total: 18,
    order_items: [{ id: 'i6', name: 'Americano', qty: 2, unit_price: 9 }],
  }),
  // pagato ma non ancora consegnato: resta al ritiro, col bollo «Pagato»
  conto({
    id: 'o36',
    daily_number: 36,
    workflow_status: 'pronto',
    payment_status: 'pagato',
    total: 40,
    order_items: [{ id: 'i7', name: 'Margarita', qty: 4, unit_price: 10 }],
  }),
  conto({
    id: 'o33',
    daily_number: 33,
    workflow_status: 'ritirato',
    table_label: '9',
    total: 58,
    order_items: [{ id: 'i5', name: 'Spritz', qty: 6, unit_price: 9 }],
  }),
]

// La colonna che ha per testata quel titolo.
const corsia = (titolo) => document.querySelector(`.corsia-${titolo}`)?.closest('.corsia')

// La modale del colore del conto, quando è aperta.
const tavolozza = () => document.querySelector('.colori-conto-box')

function montaCoda() {
  return render(
    <MemoryRouter>
      <BartenderPage />
    </MemoryRouter>
  )
}

// LA FILA DEI FILTRI NASCE CHIUSA (REQ-CODA-008): tutto quello che
// restringe la coda sta dietro il tastino ⚗️ della testata. Chi in un test
// vuole toccare un filtro lo apre prima, come si fa al banco — e questi
// test dicono cosa fanno i filtri, non dove stanno: quello lo dicono i loro.
const apriFiltri = (utente) => utente.click(screen.getByRole('button', { name: 'Filtri' }))

// LE COLONNE SONO CHIP IN FILA COI FILTRI, uno per colonna: per averle a
// schermo basta aprire «▾ Filtri». C'era davanti un «▦ Colonne» che le
// apriva — un secondo livello di nascondimento dentro il primo — e non
// c'è più: «togli il testo colonne e metti tutti i tasti che si aprono
// cliccando colonne al posto di colonne. Non c'è più bisogno visto che
// nascondiamo tutto con filtri» (l'utente, 20/08/2026). L'helper resta
// perché ai punti di chiamata dice cosa serve, non dove si tocca.
// I NOMI DEL TASTINO DEL PRONTO, per lo screen reader e per i test. Dicono
// COSA FA, non com'è messo: da unito taglia, da diviso ricuce.
const TAGLIA = /^Dividi «Da servire\/Ritirare»/
const UNISCI = /^Riunisci «Da servire»/

const apriColonne = async (utente) => {
  if (!document.querySelector('.chips-filtri')) await apriFiltri(utente)
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  ordini = CODA
  inVolo = []
  mandaOrdini = null
  ruolo = 'admin'
  // L'elenco dei conti «appena chiusi qui» vive in memoria: senza pulirlo
  // un test si porterebbe dietro quello di prima.
  for (const o of CODA) mostraOrdine(o.id)
  impostazioni = {
    queue_view: 'corsie',
    queue_search: 'filtra',
    workflow_enabled: true,
    groups_enabled: false,
    business_day_cutoff_hour: 6,
  }
})

// LE CORSIE DI CHI GUARDA LA SERATA. Erano quattro anche per lui, coi
// passi del servizio: ma «a che punto sta la preparazione» è una domanda
// del banco — a chi tiene la cassa serve sapere quanti conti sono aperti,
// quanti incassati e quanti saltati.
describe('le corsie di chi guarda la serata (admin)', () => {
  it('sono le tre del conto: in corso, chiusi, annullati', async () => {
    montaCoda()
    await screen.findByText('In corso')
    for (const titolo of ['In corso', '💶 Chiusi', '✖️ Annullati']) {
      expect(screen.getByText(titolo)).toBeInTheDocument()
    }
    // niente passi del servizio, e niente comande: la card è il conto
    expect(screen.queryByText('Da fare')).not.toBeInTheDocument()
    expect(screen.queryByText(/comanda 1/)).not.toBeInTheDocument()
    expect(within(corsia('attivi')).getByText('#41')).toBeInTheDocument()
    expect(
      within(corsia('attivi')).getAllByRole('button', { name: 'Incassa' })[0]
    ).toBeInTheDocument()
  })

  // IL LUCCHETTO SENZA NOME. Sugli schermi larghi la voce della cassa era
  // un'icona grigia in fondo alla barra: nessuno sapeva cosa fosse, e
  // quando era spenta non si capiva perché. È la cosa che chiude la
  // serata: si scrive per esteso.
  //
  // E IL PERCHÉ TORNA SOTTO, PIÙ CORTO. Con BUG-062 la riga era stata
  // tolta del tutto perché ALLARGAVA il tasto (colonna con `align-items:
  // stretch`: la larghezza la fa il figlio più largo). «È scomparsa la
  // label sotto al tasto. Diventa "chiudi X conti e X comande"» (l'utente,
  // 20/08): era la sola cosa che diceva perché il tasto è grigio, e al
  // banco un mouse da fermare sopra il tasto non c'è. Torna, ma il tasto
  // NON si riallarga — la colonna non stira più i figli.
  it('la cassa si chiama per nome, e sotto dice perché non si chiude', async () => {
    montaCoda()
    await screen.findByText('In corso')
    const tasto = screen.getByRole('button', { name: /Chiudi cassa/ })
    // Spento a vedersi, ma il tocco deve arrivare: è quello che fa uscire
    // il motivo. `disabled` lo mangerebbe.
    expect(tasto).toHaveAttribute('aria-disabled', 'true')
    // LO SCOLORITO SE LO PRENDE DA `aria-disabled`, non da una classe sua:
    // `.btn[aria-disabled="true"]` vale per tutta la famiglia dei bottoni,
    // e una `.spento` per la sola cassa era la stessa cosa detta un'altra
    // volta e con un'opacità diversa (0.55 invece di 0.5), differenza che
    // nessuno aveva mai deciso.
    expect(tasto).not.toHaveClass('spento')
    expect(tasto).toHaveAttribute('title', expect.stringMatching(/^Chiudi \d+ cont/))

    // LA RIGA C'È, ED È SOTTO QUEL TASTO: nella stessa colonna, non in
    // fondo alla riga delle azioni, dove si leggeva come una nota del «+».
    const perche = document.querySelector('.board-cassa-perche')
    expect(perche).toBeTruthy()
    expect(perche.textContent).toMatch(/^Chiudi \d+ cont/)
    expect(perche.parentElement).toBe(tasto.parentElement)
    expect(perche.parentElement).toHaveClass('board-cassa-box')
    // Che quella colonna NON stiri il bottone — il difetto di BUG-062 — è
    // una cosa del foglio di stile, e jsdom non fa layout: a sorvegliarla è
    // tests/unit/css.test.js.
  })

  it('e provando a chiuderla lo ridice, invece di non fare niente', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('In corso')

    await utente.click(screen.getByRole('button', { name: /Chiudi cassa/ }))
    // niente finestra di chiusura: la cassa non si chiude
    expect(screen.queryByText('chiudi cassa')).not.toBeInTheDocument()
    // L'avviso resta anche con la riga tornata: un tocco che non fa NIENTE
    // si legge come un'app rotta, e chi preme di corsa la riga sotto non
    // l'ha guardata.
    expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/^Chiudi \d+ cont/),
      expect.anything()
    )
  })

  // LA CASSA NON SI CHIUDE CON DRINK ANCORA DA FARE. Un conto può essere
  // già incassato e avere comande al banco: chiudere lì vorrebbe dire
  // mandare a casa la serata con dei drink pagati e mai usciti.
  it('con comande ancora da servire il tasto è spento, e lo dice', async () => {
    ordini = [
      {
        ...CODA[0],
        id: 'o70',
        daily_number: 70,
        payment_status: 'pagato',
        workflow_status: 'in_preparazione',
        comande: [{ id: 'c1', seq: 1, status: 'in_preparazione', created_at: ORA, items: [] }],
      },
    ]
    montaCoda()
    await screen.findByText('In corso')
    const tasto = screen.getByRole('button', { name: /Chiudi cassa/ })
    expect(tasto).toHaveAttribute('aria-disabled', 'true')
    // il conto è incassato — nessun conto aperto — ma il drink no
    expect(tasto).toHaveAttribute('title', 'Chiudi 1 comanda')
  })

  // UN CONTO RISCOSSO È UN CONTO CHIUSO. Con gli stati del servizio accesi
  // la coda considera chiuso solo quello pagato E servito — così un drink
  // pagato in anticipo non sparisce dal banco — ma queste corsie parlano
  // del CONTO, non del lavoro: chi aveva appena incassato lo cercava fra i
  // chiusi e lo trovava ancora «in corso». Il lavoro rimasto si vede dove
  // è il suo posto, nelle corsie delle comande.
  it('un conto appena incassato passa fra i chiusi, anche se c’è ancora da servire', async () => {
    ordini = [
      {
        ...CODA[0],
        id: 'o48',
        daily_number: 48,
        payment_status: 'pagato',
        payments: [{ amount: 24, method: 'banco', at: ORA }],
      },
    ]
    montaCoda()
    await screen.findByText('In corso')
    expect(within(corsia('chiusi')).getByText('#48')).toBeInTheDocument()
    expect(within(corsia('attivi')).queryByText('#48')).not.toBeInTheDocument()
  })

  // DENTRO I CHIUSI: SERVITI E DA SERVIRE. Un conto chiuso è un conto
  // incassato, e basta — si paga in anticipo tutte le sere. Prima quei
  // conti restavano in mezzo a quelli in corso, con un tasto «nascondi
  // pagati» per toglierseli dagli occhi; adesso stanno fra i chiusi, e
  // «quali hanno ancora roba da portare» si chiede lì dentro.
  it('nei chiusi si separano i serviti da quelli ancora da portare', async () => {
    const utente = userEvent.setup()
    ordini = [
      // incassato e tutto uscito
      {
        ...CODA[0],
        id: 'o60',
        daily_number: 60,
        payment_status: 'pagato',
        workflow_status: 'ritirato',
        comande: [{ id: 'c1', seq: 1, status: 'ritirato', created_at: ORA, items: [] }],
      },
      // incassato, ma un giro è ancora al banco
      {
        ...CODA[0],
        id: 'o61',
        daily_number: 61,
        payment_status: 'pagato',
        workflow_status: 'in_preparazione',
        comande: [
          { id: 'c1', seq: 1, status: 'ritirato', created_at: ORA, items: [] },
          { id: 'c2', seq: 2, status: 'in_preparazione', created_at: ORA, items: [] },
        ],
      },
    ]
    montaCoda()
    await screen.findByText('In corso')
    await apriFiltri(utente)
    // tutti e due sono CHIUSI: i soldi sono presi
    expect(within(corsia('chiusi')).getByText('#60')).toBeInTheDocument()
    expect(within(corsia('chiusi')).getByText('#61')).toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: /Da servire/ }))
    expect(within(corsia('chiusi')).getByText('#61')).toBeInTheDocument()
    expect(within(corsia('chiusi')).queryByText('#60')).not.toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: /Serviti/ }))
    expect(within(corsia('chiusi')).getByText('#60')).toBeInTheDocument()
    expect(within(corsia('chiusi')).queryByText('#61')).not.toBeInTheDocument()

    // e vale SOLO dentro i chiusi: gli altri conti non si muovono
    expect(corsia('attivi')).toBeTruthy()
  })

  it('«Nascondi pagati» non c’è più: quei conti stanno fra i chiusi', async () => {
    montaCoda()
    await screen.findByText('In corso')
    expect(screen.queryByRole('button', { name: /Nascondi pagati/ })).not.toBeInTheDocument()
  })

  // ABBIAMO CAMBIATO IDEA: prima la pastiglia c'era solo se la coda era
  // già disegnata a corsie. Ma la vista del banco è una vista A SÉ, non una
  // variante delle corsie: chi tiene la cassa lavora in GRIGLIA perché è
  // quella che gli serve per i conti, e a metà serata vuole dare
  // un'occhiata a com'è messa la preparazione senza andare in Impostazioni
  // a cambiare vista, guardare, e tornare a rimetterla com'era.
  it('il tasto c’è anche a griglia, e tornando indietro la griglia è lì', async () => {
    const utente = userEvent.setup()
    impostazioni = { ...impostazioni, queue_view: 'griglia' }
    montaCoda()
    await screen.findByText(/In servizio/)
    expect(document.querySelector('.order-grid')).toBeTruthy()

    // IL TASTO DICE DOVE PORTA, non dove si è: si legge da sé, senza
    // dover prima capire com'è messa la vista adesso.
    await utente.click(screen.getByRole('button', { name: /Comande/ }))
    expect(await screen.findByText('Da fare')).toBeInTheDocument()
    expect(document.querySelector('.order-grid')).toBe(null)

    await utente.click(screen.getByRole('button', { name: /Ordini/ }))
    await waitFor(() => expect(document.querySelector('.order-grid')).toBeTruthy())
    expect(screen.queryByText('Da fare')).not.toBeInTheDocument()
  })

  // È SALITO IN TESTATA, ED È DIVENTATO UN'ICONA. Era una pastiglia in
  // fondo a destra nella riga dei filtri; ma quella riga adesso, da chiusa,
  // non esiste proprio (REQ-CODA-008), e il cambio vista deve restare a UN
  // tocco — non un tocco per riaprire la riga e uno per cambiare. «Il tasto
  // comande/ordini diventa solo una icona più piccola e mettila in alto
  // insieme agli altri tasti (stampante, staff, ordine)» (l'utente, 20/08).
  it('sta in testata coi tastini delle azioni, non in una riga di pastiglie', async () => {
    montaCoda()
    await screen.findByText('In corso')
    const tasto = screen.getByRole('button', { name: 'Comande' })
    expect(tasto.closest('.chips-filtri')).toBe(null)
    expect(tasto.closest('.board-actions')).toBeTruthy()
    // stessa famiglia di 📟 e ↕: quadrato piccolo, solo icona
    expect(tasto).toHaveClass('board-icona')
    expect(tasto).toHaveTextContent('🍸')
    // il nome per esteso non si perde: sta nel title
    expect(tasto).toHaveAttribute('title', expect.stringContaining('comande'))
  })

  // E DALL'ALTRA PARTE DICE L'ALTRA COSA: un tasto dice DOVE PORTA, non
  // dove si è. Guardando le comande porta a «🧾», i conti.
  it('l’icona cambia con la vista, e continua a dire dove porta', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('In corso')

    await utente.click(screen.getByRole('button', { name: 'Comande' }))
    const tasto = await screen.findByRole('button', { name: 'Ordini' })
    expect(tasto).toHaveTextContent('🧾')
    expect(tasto).toHaveClass('board-icona')
  })

  // ── ANCHE I FILTRI DELLA GRIGLIA STANNO SUI CONTEGGI (BUG-061) ────
  //
  // «Rispetto alla vista corsie li vorrei nello stesso punto» (l'utente,
  // 20/08). Sono due modi di guardare la STESSA coda: chi passa dall'una
  // all'altra deve ritrovare i filtri dov'erano, e la riga a sé costava un
  // livello fra la testata e la prima card.
  it('anche a griglia i filtri escono sotto i conteggi, in testata', async () => {
    const utente = userEvent.setup()
    impostazioni = { ...impostazioni, queue_view: 'griglia' }
    montaCoda()
    await screen.findByText(/In servizio/)
    await apriFiltri(utente)

    const riga = screen.getByRole('button', { name: 'Aperti' }).closest('.chips-filtri')
    const conteggi = riga.closest('.board-sotto')
    expect(conteggi).toBeTruthy()
    expect(within(conteggi).getByText(/apert/)).toBeInTheDocument()
    // tutti nella stessa fila; il cambio vista no, sta in testata
    for (const nome of ['Aperti', /Chiusi/, /Annullati/, /Staff/]) {
      expect(within(riga).getByRole('button', { name: nome })).toBeInTheDocument()
    }
    expect(within(riga).queryByRole('button', { name: 'Comande' })).not.toBeInTheDocument()
    // e fuori dalla testata non resta nessuna riga di pastiglie
    const testata = document.querySelector('.board-head')
    expect(
      [...document.querySelectorAll('.chips-row, .chips-filtri')].filter((r) => !testata.contains(r))
    ).toHaveLength(0)
  })

  it('e da lì fanno esattamente quello che facevano prima', async () => {
    const utente = userEvent.setup()
    impostazioni = { ...impostazioni, queue_view: 'griglia' }
    montaCoda()
    await screen.findByText(/In servizio/)
    expect(screen.getByText('#41')).toBeInTheDocument()
    await apriFiltri(utente)

    // I TRE STATI SI ESCLUDONO (REQ-CODA-009, sesta correzione):
    // accendere «Chiusi» spegne «Aperti» da solo, e #41 se ne va senza
    // che nessuno debba spegnere niente a mano.
    await utente.click(screen.getByRole('button', { name: '💶 Chiusi' }))
    expect(screen.getByRole('button', { name: '💶 Chiusi' })).toHaveClass('active')
    expect(screen.getByRole('button', { name: 'Aperti' })).not.toHaveClass('active')
    await waitFor(() => expect(screen.queryByText('#41')).not.toBeInTheDocument())

    await utente.click(screen.getByRole('button', { name: 'Aperti' }))
    await waitFor(() => expect(screen.getByText('#41')).toBeInTheDocument())
  })

  it('nella coda dei conti non si sceglie nessuna colonna: sono tre e ci stanno tutte', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('In corso')
    // CON LA FILA APERTA, o mancherebbero solo perché sono a scomparsa.
    await apriFiltri(utente)
    const riga = document.querySelector('.chips-filtri')
    // Nessun chip di colonna: quelli del banco non ci sono, e le tre dei
    // conti non si spengono — sono la risposta alla domanda «com'è andata».
    // Si cercano i nomi che SOLO le colonne del banco portano: «Da
    // servire/Ritirare» e «Serviti/Ritirati» qui ci sono, ma come porzioni
    // del tasto dei chiusi, che è un'altra cosa (si vede più sotto).
    for (const nome of ['Da fare', 'In preparazione', '💶 Chiuse', '✖️ Annullate'])
      expect(within(riga).queryByRole('button', { name: nome })).not.toBeInTheDocument()
  })

  // LE DUE DOMANDE. Chi guarda la serata se le fa tutte e due: «come sta
  // andando» (i conti) e «a che punto è la preparazione» (le comande).
  // L'interruttore passa dall'una all'altra e si ricorda su questo
  // terminale; al banco non c'è, lì la risposta è sempre il lavoro.
  it('può passare alle comande, e al ricarico ci resta — ma non è il suo default', async () => {
    const utente = userEvent.setup()
    const vista = montaCoda()
    await screen.findByText('In corso')

    await utente.click(screen.getByRole('button', { name: /Comande/ }))
    expect(await screen.findByText('Da fare')).toBeInTheDocument()
    expect(screen.queryByText('In corso')).not.toBeInTheDocument()

    vista.unmount()
    montaCoda()
    expect(await screen.findByText('Da fare')).toBeInTheDocument()

    // e si torna indietro dallo stesso tasto, che adesso dice «Ordini»
    await utente.click(screen.getByRole('button', { name: /Ordini/ }))
    expect(await screen.findByText('In corso')).toBeInTheDocument()
  })
})

// ── I FILTRI STANNO DIETRO UN TASTINO, NELLA RIGA SOTTO (REQ-CODA-008) ─
//
// «I filtri e tutti i bottoni li voglio a scomparsa, con un tasto che non
// occupi troppo spazio, sia per ordini sia per comande» (l'utente, 20/08).
// Sulla riga dei conteggi erano arrivati a sette e si mangiavano la riga
// intera, in una lavagna che si guarda da lontano mentre si versa.
//
// IL TASTINO ERA SALITO IN TESTATA, ED È TORNATO GIÙ. Per far sparire del
// tutto la riga da chiusa era finito coi tastini delle azioni, accanto a
// stampante e pannelli; l'utente l'ha rimandato al suo posto: «e spostala
// da lì, mettila sotto dove stavano i vecchi bottoni. Rimetti lì giù anche
// il tasto dei filtri» (20/08). Adesso la riga sotto c'è sempre, ma da
// chiusa è DUE TASTINI — ⚗️ e la freccia dell'ordinamento — non le sette
// pastiglie di partenza: l'altezza guadagnata resta quasi tutta, e il tasto
// sta insieme a quello che apre.
//
// La parte delicata resta: DA CHIUSO non si deve nascondere lo STATO. Un
// filtro acceso e invisibile è una coda che sembra sbagliata — dodici conti
// dove ce ne sono quaranta, e niente a schermo che lo dica. In 44px non ci
// sta un nome, ci sta il NUMERO, e i nomi vanno nel title.
describe('la fila dei filtri sta dietro il tastino ⚗️, nella riga sotto', () => {
  beforeEach(() => {
    impostazioni = { ...impostazioni, queue_view: 'griglia' }
  })

  // DA CHIUSA LA RIGA DEI CHIP NON ESISTE. «Il tasto per mostrare/nascondere
  // i filtri deve essere un tasto piccolo e i filtri devono uscire sotto»
  // (l'utente, 20/08/2026): i due tastini si appoggiano alla riga dei
  // conteggi, che c'è comunque, e a filtri chiusi la coda non paga niente.
  it('di suo è chiusa: nessun chip, e i tastini stanno sui conteggi', async () => {
    montaCoda()
    await screen.findByText(/In servizio/)

    for (const nome of ['Aperti', /Chiusi/, /Annullati/, /Staff/]) {
      expect(screen.queryByRole('button', { name: nome })).not.toBeInTheDocument()
    }
    // NESSUNA riga di pastiglie a schermo: da chiusa non viene disegnata.
    expect(document.querySelector('.chips-filtri')).toBe(null)

    const tasto = screen.getByRole('button', { name: 'Filtri' })
    // GIÙ, NON IN TESTATA fra le azioni: sta sulla riga dei conteggi.
    expect(tasto.closest('.board-actions')).toBe(null)
    const tastini = tasto.closest('.coda-tastini')
    expect(tastini.closest('.board-sotto')).toBeTruthy()
    // UN BOTTONE COL RIQUADRO, MA BASSO — non la famiglia da 44px di 📟 e
    // ＋. «Aggiungi un bordo e rendilo un bottone ma lascia la freccetta e
    // la scritta filtri. Il tasto non farlo troppo alto come gli altri»
    // (l'utente, 20/08/2026): il riquadro lo mette `.coda-tastino`, e le
    // misure stanno nel foglio (tests/unit/css.test.js).
    expect(tasto).toHaveClass('coda-tastino')
    expect(tasto).not.toHaveClass('board-icona')
    expect(tasto).toHaveTextContent('▾ Filtri')
    // E CON LUI, A DESTRA, IL SUO GEMELLO: il verso della coda, stesso
    // vestito e stessa misura — «stessa dimensione dei filtri» — ma solo
    // l'icona, quindi il riquadro si fa quadrato.
    const ordine = within(tastini).getByRole('button', { name: /Prima i più/ })
    expect(ordine).toHaveClass('coda-tastino')
    expect(ordine).toHaveClass('solo-icona')
    // E NON PORTA NESSUN NUMERO. C'era un badge col conteggio dei filtri
    // accesi: tolto il 22/08/2026 — «sì ma infatti togliamo quel numero.
    // Non serve» (l'utente). Il tasto dice «▾ Filtri» e basta.
    expect(tasto.textContent.trim()).toBe('▾ Filtri')
    expect(document.querySelector('.coda-tastino-conta')).toBe(null)
    expect(tasto).not.toHaveClass('active')
  })

  // IL NOME DEL TASTO È IL GESTO CHE FA. «"filtra la coda" non va bene, deve
  // essere "mostra filtri"» (l'utente, 20/08): a filtrare sono i chip.
  it('si chiama «Mostra filtri», e da aperto «Nascondi filtri»', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText(/In servizio/)

    expect(screen.getByRole('button', { name: 'Filtri' })).toHaveAttribute(
      'title',
      'Mostra filtri'
    )
    await apriFiltri(utente)
    expect(screen.getByRole('button', { name: 'Filtri' })).toHaveAttribute(
      'title',
      'Nascondi filtri'
    )
  })

  it('toccandolo i chip escono SOTTO, e richiudendo la riga sparisce', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText(/In servizio/)

    await apriFiltri(utente)
    const riga = screen.getByRole('button', { name: 'Aperti' }).closest('.chips-filtri')
    for (const nome of ['Aperti', /Chiusi/, /Annullati/, /Staff/]) {
      // IN UNA RIGA, non in una tendina sopra la coda: si toccano a raffica
      // mentre si lavora, e un pannello coprirebbe quello che si guarda
      // per decidere che filtro serve. (La sola tendina è quella degli
      // staff, che sono quanti sono i turni: vedi REQ-CODA-009.)
      expect(within(riga).getByRole('button', { name: nome })).toBeInTheDocument()
    }
    // È UNA RIGA SOTTO, non quella dei tastini: i due tastini restano
    // dov'erano, sui conteggi.
    expect(riga).toHaveClass('chips-filtri')
    expect(within(riga).queryByRole('button', { name: 'Filtri' })).not.toBeInTheDocument()
    // e la coda sotto non ha guadagnato una riga di pastiglie tutta sua
    const testata = document.querySelector('.board-head')
    expect(
      [...document.querySelectorAll('.chips-row, .chips-filtri')].filter((r) => !testata.contains(r))
    ).toHaveLength(0)

    await apriFiltri(utente)
    expect(screen.queryByRole('button', { name: 'Aperti' })).not.toBeInTheDocument()
    // LA RIGA SE NE VA DEL TUTTO: è l'altezza che si sta restituendo ai
    // conti. Il tasto per riaprirla non era lì dentro.
    expect(document.querySelector('.chips-filtri')).toBe(null)
    expect(screen.getByRole('button', { name: 'Filtri' })).toBeInTheDocument()
  })

  // ── IL NUMERO SUL TASTINO NON C'È, E NON DEVE TORNARE ────────────
  //
  // «Sì ma infatti togliamo quel numero. Non serve» (l'utente,
  // 22/08/2026). Qui c'erano due test che provavano il badge: uno che si
  // accendeva col primo filtro, uno che lo faceva crescere col secondo.
  //
  // IL BADGE È STATO PROVATO QUATTRO VOLTE, con quattro criteri diversi —
  // i generi di filtro (BUG-080), una restrizione per colonna (BUG-080),
  // solo ciò che restringe (BUG-085), i chip accesi — e chi guarda li ha
  // bocciati tutti: «non mi è chiaro come conta i filtri», «funziona al
  // contrario», «ne ho tre e lui dice zero». Poi la richiesta è cambiata
  // in toglierlo. Questo test è la guardia perché non ricompaia per la
  // quinta volta, magari con un criterio nuovo.
  it('coi filtri accesi il tastino resta senza numero', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText(/In servizio/)

    const tasto = () => screen.getByRole('button', { name: 'Filtri' })
    await apriFiltri(utente)
    // Due filtri accesi insieme: lo stato dei chiusi e, dentro di lui, la
    // porzione da servire. Nel giro precedente facevano «2».
    await utente.click(screen.getByRole('button', { name: '💶 Chiusi' }))
    await utente.click(screen.getByRole('button', { name: 'Da servire/Ritirare' }))
    await apriFiltri(utente) // richiudo: è lì che il badge compariva

    expect(tasto().textContent.trim()).toBe('▾ Filtri')
    expect(tasto().textContent).not.toMatch(/\d/)
    expect(document.querySelector('.coda-tastino-conta')).toBe(null)
    // E NEMMENO SI COLORA: la classe `active` leggeva il conteggio, e senza
    // non ha più niente da leggere. Rimetterla vorrebbe dire ricostruire
    // il conteggio sotto un altro nome.
    expect(tasto()).not.toHaveClass('active')
  })

  // IL TITLE DICE SOLO IL GESTO. Accodava l'elenco dei filtri accesi —
  // «Mostra filtri — accesi: Chiusi, Miei» — e quella lista era la stessa
  // da cui il badge tirava il numero: tenerla in piedi per un tooltip
  // avrebbe voluto dire tenere in piedi la macchina intera.
  it('il title non elenca i filtri, né da aperta né da chiusa', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText(/In servizio/)

    const tasto = () => screen.getByRole('button', { name: 'Filtri' })
    await apriFiltri(utente)
    await utente.click(screen.getByRole('button', { name: '💶 Chiusi' }))
    expect(tasto()).toHaveAttribute('title', 'Nascondi filtri')
    await apriFiltri(utente)
    expect(tasto()).toHaveAttribute('title', 'Mostra filtri')
  })

  // È UNA SCELTA DI QUESTO TERMINALE, come le colonne spente: al banco la
  // fila resta aperta tutta la sera, alla cassa non si tocca mai — e
  // nessuno la vuole riaprire a ogni ricarico.
  it('aperta o chiusa, se lo ricorda al ricarico', async () => {
    const utente = userEvent.setup()
    const vista = montaCoda()
    await screen.findByText(/In servizio/)

    await apriFiltri(utente)
    expect(localStorage.getItem('tana:coda:filtri-aperti')).toBe('1')

    vista.unmount()
    montaCoda()
    await screen.findByText(/In servizio/)
    expect(screen.getByRole('button', { name: 'Aperti' })).toBeInTheDocument()
  })

  // UN MECCANISMO SOLO, non uno per vista: «sia per ordini sia per
  // comande». Al banco dentro la fila ci vanno anche le colonne, che sono
  // filtri a tutti gli effetti — restringono quello che si vede.
  it('al banco è lo stesso tastino, e le colonne ci stanno dentro', async () => {
    const utente = userEvent.setup()
    ruolo = 'bartender'
    impostazioni = { ...impostazioni, queue_view: 'corsie' }
    montaCoda()
    await screen.findByText('Da fare')

    // Chiusa: né lo staff né le colonne. (Il titolo della colonna è anche
    // la testata della corsia, che a schermo c'è comunque: si guarda se la
    // fila esiste, e da chiusa non esiste proprio.)
    expect(document.querySelector('.chips-filtri')).toBe(null)
    expect(screen.queryByRole('button', { name: /Staff/ })).not.toBeInTheDocument()

    await apriFiltri(utente)
    const riga = document.querySelector('.chips-filtri')
    expect(within(riga).getByRole('button', { name: /Staff/ })).toBeInTheDocument()
    expect(within(riga).getByRole('button', { name: 'Serviti/Ritirati' })).toBeInTheDocument()
  })

  // ── SPEGNERE LE COLONNE NON ROMPE LA LAVAGNA (BUG-085) ───────────
  //
  // Questo blocco nasce da «credo che l'indicatore del numero di filtri
  // attivi funzioni al contrario. Li ho disattivati tutti ma lui indica
  // tre filtri attivi» (l'utente, 22/08/2026). L'indicatore non c'è più —
  // vedi la guardia più su — ma il COMPORTAMENTO che la segnalazione
  // aveva scoperto resta e va provato: spegnendo tutte le colonne la
  // lavagna le rimette a schermo tutte, perché una lavagna senza colonne
  // è indistinguibile da un'app rotta.

  // I chip delle colonne, quelli accesi: sono le corsie a schermo.
  const chipAccesi = () =>
    [...document.querySelector('.chips-filtri').querySelectorAll('.chip')].filter((c) =>
      c.classList.contains('active')
    )

  // LA FOTOGRAFIA DELLA SEGNALAZIONE, rifatta com'era: locale che fa
  // nascere le comande già IN PREPARAZIONE (quindi «Da fare» non è una
  // colonna sceglibile), tutti i chip delle colonne spenti — e la lavagna
  // che le rimette a schermo tutte e sei (`corsieVisibili`).
  it('spengo tutte le colonne, la lavagna le mostra tutte', async () => {
    const utente = userEvent.setup()
    ruolo = 'bartender'
    // Nessuna comanda in «ricevuto»: «Da fare» resta vuota, ed è il caso
    // in cui la coda la nasconde da sé (non l'ha spenta nessuno).
    ordini = CODA.filter((o) => o.workflow_status !== 'ricevuto')
    impostazioni = { ...impostazioni, queue_view: 'corsie', comande_in_preparazione: true }
    montaCoda()
    await screen.findByText('In preparazione')

    await apriFiltri(utente)
    for (const c of chipAccesi()) await utente.click(c)
    await apriFiltri(utente)

    // Tutte e sei a schermo: è quello che si vede nella fotografia.
    expect(document.querySelectorAll('.corsia')).toHaveLength(6)
    // E il tastino, in quella fotografia, diceva «3»: adesso non dice
    // niente, e non deve tornare a dirlo (22/08/2026).
    expect(screen.getByRole('button', { name: 'Filtri' }).textContent).not.toMatch(/\d/)
  })

  // RIACCENDERE UNA COLONNA FA VEDERE DI PIÙ, ed è il contrario di
  // filtrare: la lavagna torna intera.
  it('«Chiuse» e «Annullate» riaccese rimettono la lavagna intera', async () => {
    const utente = userEvent.setup()
    ruolo = 'bartender'
    impostazioni = { ...impostazioni, queue_view: 'corsie' }
    montaCoda()
    await screen.findByText('Da fare')

    await apriFiltri(utente)
    await utente.click(screen.getByRole('button', { name: '💶 Chiuse' }))
    await utente.click(screen.getByRole('button', { name: '✖️ Annullate' }))
    await apriFiltri(utente)

    expect(document.querySelectorAll('.corsia')).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Filtri' })).toHaveAttribute(
      'title',
      'Mostra filtri'
    )
  })

  // ── LA FOTOGRAFIA DELL'ULTIMA SEGNALAZIONE ───────────────────────
  //
  // «Non mi sembra che il conteggio dei filtri funzioni ancora. Deve
  // contare le colonne visualizzate. Ne ho tre e lui dice zero. Se ne
  // seleziono 1 dice 2» (l'utente, 22/08/2026), con lo screenshot della
  // coda a corsie: cinque chip in fila, i primi tre accesi, tre corsie a
  // schermo. Poco dopo: «sì ma infatti togliamo quel numero. Non serve».
  //
  // QUINDI QUI NON SI CONTA NIENTE, e il test lo dice per tutti e due i
  // casi dello screenshot — tre colonne accese e una sola — perché sono
  // esattamente i due su cui il conteggio era stato bocciato.
  it('tre colonne accese o una sola: nessun numero, in nessuno dei due casi', async () => {
    const utente = userEvent.setup()
    ruolo = 'bartender'
    impostazioni = { ...impostazioni, queue_view: 'corsie' }
    montaCoda()
    await screen.findByText('Da fare')

    const tasto = () => screen.getByRole('button', { name: 'Filtri' })
    const senzaNumero = () => {
      expect(tasto().textContent.trim()).toBe('▾ Filtri')
      expect(document.querySelector('.coda-tastino-conta')).toBe(null)
      expect(tasto()).not.toHaveClass('active')
    }

    // Si spengono le colonne fino a lasciarne tre accese, come nella foto.
    await apriFiltri(utente)
    let accesi = chipAccesi()
    while (accesi.length > 3) {
      await utente.click(accesi[accesi.length - 1])
      accesi = chipAccesi()
    }
    expect(chipAccesi()).toHaveLength(3)
    await apriFiltri(utente)
    senzaNumero()

    // E con una sola accesa — il caso in cui il tastino diceva «2».
    await apriFiltri(utente)
    accesi = chipAccesi()
    while (accesi.length > 1) {
      await utente.click(accesi[accesi.length - 1])
      accesi = chipAccesi()
    }
    expect(chipAccesi()).toHaveLength(1)
    await apriFiltri(utente)
    senzaNumero()
  })

  // ── UN LIVELLO SOLO DI NASCONDIMENTO ─────────────────────────────
  //
  // Le colonne hanno fatto due giri. Prima uscivano in una SECONDA riga
  // sotto quella dei filtri, e sono state accodate alla stessa — «quei
  // filtri devono apparire sulla stessa riga degli altri tasti» (l'utente,
  // 20/08/2026). Restava però un «▦ Colonne» davanti che le apriva: chip
  // che aprivano chip, un secondo livello dentro il primo. «Togli il testo
  // colonne e metti tutti i tasti che si aprono cliccando colonne al posto
  // di colonne. Non c'è più bisogno visto che nascondiamo tutto con
  // filtri» (20/08/2026). Adesso «▾ Filtri» è l'UNICO livello: aperta la
  // fila le colonne ci sono già, senza toccare altro.
  it('aprendo la fila le colonne ci sono già, e nessun tasto le apre', async () => {
    const utente = userEvent.setup()
    ruolo = 'bartender'
    impostazioni = { ...impostazioni, queue_view: 'corsie' }
    montaCoda()
    await screen.findByText('Da fare')

    // Chiusa: nessuna riga di pastiglie, come prima.
    expect(document.querySelectorAll('.chips-row, .chips-filtri')).toHaveLength(0)

    await apriFiltri(utente)
    // UNA SOLA RIGA, e le colonne sono già lì dentro — senza secondo tocco.
    // (Se non ci stanno va a capo da sé: è il capo naturale del flusso,
    // non un livello in più.)
    const righe = document.querySelectorAll('.chips-row, .chips-filtri')
    expect(righe).toHaveLength(1)
    const riga = righe[0]
    // Tutte quante, non una: sono i chip che stavano dietro il tasto.
    for (const nome of [
      'In preparazione',
      'Da servire/Ritirare',
      'Serviti/Ritirati',
      '💶 Chiuse',
      '✖️ Annullate',
    ])
      expect(within(riga).getByRole('button', { name: nome })).toBeInTheDocument()
    // e il tasto che le apriva non esiste più
    expect(screen.queryByRole('button', { name: /Colonne/ })).not.toBeInTheDocument()
  })

  // E SE NE VANNO CON LA FILA: sono chip come gli altri, non un pannello
  // che sopravvive alla riga che lo conteneva.
  it('chiudendo la fila se ne vanno anche le colonne', async () => {
    const utente = userEvent.setup()
    ruolo = 'bartender'
    impostazioni = { ...impostazioni, queue_view: 'corsie' }
    montaCoda()
    await screen.findByText('Da fare')

    await apriColonne(utente)
    const riga = document.querySelector('.chips-filtri')
    expect(within(riga).getByRole('button', { name: 'Serviti/Ritirati' })).toBeInTheDocument()

    // chiusa la fila se ne va tutto: chip dei filtri E chip delle colonne
    await apriFiltri(utente)
    expect(document.querySelectorAll('.chips-row, .chips-filtri')).toHaveLength(0)
  })

  // ── SUL TELEFONO NON FINISCONO DENTRO IL ⋯ ──────────────────────
  //
  // Nel ⋯ ci vanno le cose che si fanno OGNI TANTO: i pannelli e la cassa.
  // Passare dai conti alle comande si fa durante il servizio, decine di
  // volte — dentro il menu sarebbero due tocchi — e resta in testata,
  // accanto al ⋯.
  //
  // FILTRI E ORDINAMENTO STANNO GIÙ, sul telefono come ovunque: sono scesi
  // dalla testata («mettila sotto dove stavano i vecchi bottoni», l'utente
  // 20/08) e dal ⋯ l'ordinamento è uscito — in due posti sarebbero due
  // stati da tenere allineati a mano.
  //
  // GIÙ DOVE, PERÒ, È CAMBIATO. Stavano in fondo alla riga dei conteggi —
  // e sul telefono quella riga è già piena di conteggi e legenda, quindi
  // andavano a capo su una fascia tutta loro, due tastini soli spinti a
  // destra: «il layout sopra le card non è il massimo su mobile»
  // (l'utente, 21/08/2026). Adesso stanno in riga con la ricerca, che è
  // esattamente dove la lista e le schede li tengono già. Una fascia di
  // testata in meno è una card in più sulla lavagna.
  describe('sul telefono', () => {
    const vero = window.matchMedia
    beforeEach(() => {
      window.matchMedia = (query) => ({
        matches: query.includes('700px'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })
    })
    afterEach(() => {
      window.matchMedia = vero
    })

    it('il cambio vista resta in testata; filtri e ordinamento stanno giù', async () => {
      const utente = userEvent.setup()
      montaCoda()
      await screen.findByText(/In servizio/)

      // il ⋯ c'è: siamo davvero in modo telefono
      const altro = screen.getByRole('button', { name: 'Altro' })
      const azioni = altro.closest('.board-actions')
      expect(within(azioni).getByRole('button', { name: 'Comande' })).toBeInTheDocument()

      // i due tastini no: stanno giù, in riga con la ricerca — e lì non
      // costano una fascia, perché la ricerca ce l'ha comunque.
      expect(within(azioni).queryByRole('button', { name: 'Filtri' })).not.toBeInTheDocument()
      const tastini = screen.getByRole('button', { name: 'Filtri' }).closest('.coda-tastini')
      expect(tastini.closest('.board-cerca')).toBeTruthy()
      expect(tastini.closest('.board-sotto')).toBeNull()
      // e la ricerca è lì con loro: è quella la fascia
      expect(tastini.closest('.board-cerca').querySelector('.board-search')).toBeTruthy()
      expect(within(tastini).getByRole('button', { name: /Prima i più/ })).toBeInTheDocument()

      // e nemmeno dentro il ⋯: niente doppioni, o sarebbero due stati da
      // tenere allineati a mano
      await utente.click(altro)
      expect(await screen.findByText('Coda ordini')).toBeInTheDocument()
      expect(screen.queryByText(/Ordina dal/)).not.toBeInTheDocument()
    })
  })
})

// ── I FILTRI DI STATO SI COMBINANO (REQ-CODA-009) ────────────────────
//
// «Il conteggio dei filtri accesi è inutile sulla schermata degli ordini.
// Non esistono veri e propri filtri. A meno che non diventino davvero dei
// filtri, così togliamo TUTTI. Se diventano dei filtri io posso vedere
// quelli aperti, chiusi se seleziono chiuso e annullati se seleziono
// annullati. Posso anche disabilitare In Corso che deve diventare Aperti,
// non In corso. Il filtro Aperti lo posso deselezionare solo se chiusi,
// annullati o tutti e due sono attivi. Se disattivo il filtro su chiusi e
// annullati, si riattiva il filtro aperti» (l'utente, 20/08/2026).
//
// Erano quattro schede che si escludevano, e per vedere aperti e chiusi
// insieme bisognava chiedere «Tutti» — cioè anche gli annullati.
describe('i filtri di stato della coda a griglia', () => {
  const APERTO = conto({ id: 'a1', daily_number: 41, workflow_status: 'ricevuto' })
  const CHIUSO = conto({
    id: 'c1',
    daily_number: 36,
    workflow_status: 'pronto',
    payment_status: 'pagato',
  })
  const ANNULLATO = conto({
    id: 'x1',
    daily_number: 30,
    status: 'annullato',
    workflow_status: 'annullato',
  })

  beforeEach(() => {
    impostazioni = { ...impostazioni, queue_view: 'griglia' }
    ordini = [APERTO, CHIUSO, ANNULLATO]
    for (const o of ordini) mostraOrdine(o.id)
  })

  const inCoda = () =>
    [...document.querySelectorAll('.order-grid .order-card')]
      .map((c) => c.textContent.match(/#(\d+)/)?.[1])
      .filter(Boolean)

  it('sono tre, si chiamano «Aperti» e «Tutti» non c’è più', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('#41')
    await apriFiltri(utente)

    expect(screen.getByRole('button', { name: 'Aperti' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'In corso' })).not.toBeInTheDocument()
    // «Tutti» era la quarta scheda, e non è tornata nemmeno adesso che i
    // tre si escludono di nuovo: mescolava gli incassi con gli annullati.
    expect(screen.queryByRole('button', { name: 'Tutti' })).not.toBeInTheDocument()
    // Sono interruttori, non linguette: lo dice anche a chi legge con la voce.
    expect(screen.getByRole('button', { name: 'Aperti' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('la coda si apre coi soli aperti', async () => {
    montaCoda()
    await screen.findByText('#41')
    expect(inCoda()).toEqual(['41'])
  })

  // ── UNO E UNO SOLO (SESTA CORREZIONE, 20/08/2026) ──────────────
  //
  // «No allora riportiamo aperti, chiusi e annullati come mutuamente
  // esclusivi» (l'utente, dopo mezza giornata di filtri combinabili). I
  // test dell'unione — «Aperti + Chiusi mostra tutti e due», il rifiuto
  // silenzioso di spegnere l'ultimo acceso, il ritorno automatico ad
  // «Aperti» — sono spariti con la regola che descrivevano: erano la
  // specifica di un'app che non c'è più.
  it('toccarne uno spegne gli altri: la coda mostra un mondo per volta', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('#41')
    await apriFiltri(utente)

    await utente.click(screen.getByRole('button', { name: '💶 Chiusi' }))
    await waitFor(() => expect(inCoda()).toEqual(['36']))
    expect(screen.getByRole('button', { name: 'Aperti' })).not.toHaveClass('active')
    expect(screen.getByRole('button', { name: '✖️ Annullati' })).not.toHaveClass('active')

    await utente.click(screen.getByRole('button', { name: '✖️ Annullati' }))
    await waitFor(() => expect(inCoda()).toEqual(['30']))
    expect(screen.getByRole('button', { name: '💶 Chiusi' })).not.toHaveClass('active')

    await utente.click(screen.getByRole('button', { name: 'Aperti' }))
    await waitFor(() => expect(inCoda()).toEqual(['41']))
  })

  it('ritoccare quello acceso non lo spegne, e non dice niente', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('#41')
    await apriFiltri(utente)

    // Rifiuto silenzioso: senza nessuno stato la coda sarebbe vuota per
    // forza, e un avviso per un tocco che non doveva partire è rumore.
    await utente.click(screen.getByRole('button', { name: 'Aperti' }))
    expect(screen.getByRole('button', { name: 'Aperti' })).toHaveClass('active')
    expect(inCoda()).toEqual(['41'])
  })

  it('la coda vuota dice come è filtrata', async () => {
    const utente = userEvent.setup()
    ordini = [APERTO]
    montaCoda()
    await screen.findByText('#41')
    await apriFiltri(utente)

    await utente.click(screen.getByRole('button', { name: '💶 Chiusi' }))
    expect(await screen.findByText('Nessun ordine chiuso.')).toBeInTheDocument()
  })

  // ── IL TASTO DEI CHIUSI, A TRE PORZIONI ─────────────────────────
  //
  // «La cosa di servire e serviti unisci i tasti con chiusi, quindi tasto
  // grande con tre selezioni. Se seleziono chiusi, vedo le altre due
  // porzioni del tasto e posso filtrare Chiusi: sia da servire che
  // serviti, serviti solo quelli serviti, da servire quelli da servire»
  // (l'utente, 20/08/2026).
  describe('il tasto dei chiusi, a tre porzioni', () => {
    // Due conti chiusi: uno uscito per intero, uno con ancora da portare.
    const SERVITO = conto({
      id: 'cs',
      daily_number: 20,
      workflow_status: 'ritirato',
      payment_status: 'pagato',
      comande: [{ id: 'k1', seq: 1, status: 'ritirato', items: [] }],
    })
    const DA_SERVIRE = conto({
      id: 'cn',
      daily_number: 21,
      workflow_status: 'pronto',
      payment_status: 'pagato',
      comande: [{ id: 'k2', seq: 1, status: 'in_preparazione', items: [] }],
    })

    beforeEach(() => {
      ordini = [APERTO, SERVITO, DA_SERVIRE]
      for (const o of ordini) mostraOrdine(o.id)
    })

    const porzioni = () =>
      [...document.querySelectorAll('.chip-gruppo .chip')].map((b) => b.textContent)

    it('da spento si vede solo «Chiusi»: le porzioni escono accendendolo', async () => {
      const utente = userEvent.setup()
      montaCoda()
      await screen.findByText('#41')
      await apriFiltri(utente)

      // Chiuso su sé stesso: nessuna porzione, e nessun chip a metà riga.
      expect(porzioni()).toEqual([])

      await utente.click(screen.getByRole('button', { name: '💶 Chiusi' }))
      // UN TASTO SOLO, tre porzioni, nell'ordine del lavoro.
      await waitFor(() =>
        expect(porzioni()).toEqual(['💶 Chiusi', 'Da servire/Ritirare', 'Serviti/Ritirati'])
      )
    })

    it('neutro: nessuna porzione accesa, e si vedono tutti i chiusi', async () => {
      const utente = userEvent.setup()
      montaCoda()
      await screen.findByText('#41')
      await apriFiltri(utente)
      await utente.click(screen.getByRole('button', { name: '💶 Chiusi' }))

      await waitFor(() => expect(inCoda().slice().sort()).toEqual(['20', '21']))
      for (const nome of ['Da servire/Ritirare', 'Serviti/Ritirati']) {
        expect(screen.getByRole('button', { name: nome })).toHaveAttribute(
          'aria-pressed',
          'false'
        )
      }
    })

    it('ciascuna porzione stringe, e ritoccandola si torna al neutro', async () => {
      const utente = userEvent.setup()
      montaCoda()
      await screen.findByText('#41')
      await apriFiltri(utente)
      await utente.click(screen.getByRole('button', { name: '💶 Chiusi' }))

      await utente.click(screen.getByRole('button', { name: 'Serviti/Ritirati' }))
      await waitFor(() => expect(inCoda()).toEqual(['20']))

      await utente.click(screen.getByRole('button', { name: 'Da servire/Ritirare' }))
      await waitFor(() => expect(inCoda()).toEqual(['21']))

      await utente.click(screen.getByRole('button', { name: 'Da servire/Ritirare' }))
      await waitFor(() => expect(inCoda().slice().sort()).toEqual(['20', '21']))
    })

    it('senza gli stati del servizio le porzioni non esistono', async () => {
      // «Sono attivi solo quando sono attivi gli stati di servizio»
      // (l'utente): senza la preparazione, tutto quello che è stato
      // pagato è uscito per definizione e la domanda non c'è.
      const utente = userEvent.setup()
      impostazioni = { ...impostazioni, workflow_enabled: false }
      montaCoda()
      await screen.findByText('#41')
      await apriFiltri(utente)
      await utente.click(screen.getByRole('button', { name: '💶 Chiusi' }))

      expect(screen.queryByRole('button', { name: /Da servire/ })).toBe(null)
      expect(screen.queryByRole('button', { name: /Serviti/ })).toBe(null)
    })

    it('senza ritiro al banco le porzioni perdono la metà che non esiste', async () => {
      const utente = userEvent.setup()
      impostazioni = { ...impostazioni, service_mode: 'tavolo' }
      montaCoda()
      await screen.findByText('#41')
      await apriFiltri(utente)
      await utente.click(screen.getByRole('button', { name: '💶 Chiusi' }))

      await waitFor(() =>
        expect(porzioni()).toEqual(['💶 Chiusi', 'Da servire', 'Serviti'])
      )
    })
  })
})

// ── LA TENDINA DEGLI AUTORI (REQ-CODA-009) ───────────────────────────
//
// «Il filtro miei dovrebbe diventare un menu a tendina dove di default sono
// selezionati tutti gli utenti che hanno aperto almeno un ordine per vedere
// tutti gli ordini. Poi posso scegliere di deselezionare e vedere solo gli
// ordini di qualcuno (i miei ad esempio)» (l'utente, 20/08/2026).
describe('chi ha aperto il conto: la tendina «Staff»', () => {
  const DI_MARTA = conto({ id: 'm1', daily_number: 41, workflow_status: 'ricevuto' })
  const DEL_CAPO = conto({
    id: 'k1',
    daily_number: 42,
    workflow_status: 'ricevuto',
    placed_by: { email: 'capo@bar.it', name: 'Capo', role: 'admin' },
  })

  beforeEach(() => {
    impostazioni = { ...impostazioni, queue_view: 'griglia' }
    ordini = [DI_MARTA, DEL_CAPO]
    for (const o of ordini) mostraOrdine(o.id)
  })

  it('di suo ci sono tutti, e la pastiglia non nomina nessuno', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('#41')
    await apriFiltri(utente)

    const tendina = screen.getByRole('button', { name: /Staff/ })
    expect(tendina).toHaveTextContent('✍️ Staff')
    expect(screen.getByText('#41')).toBeInTheDocument()
    expect(screen.getByText('#42')).toBeInTheDocument()
  })

  it('dentro c’è chi ha battuto almeno un conto, e si deseleziona', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('#41')
    await apriFiltri(utente)

    await utente.click(screen.getByRole('button', { name: /Staff/ }))
    const pannello = screen.getByRole('dialog', { name: /Chi ha aperto il conto/ })
    expect(within(pannello).getByText('Marta')).toBeInTheDocument()
    expect(within(pannello).getByText('Capo')).toBeInTheDocument()

    // Si spegne Marta: restano i conti del Capo — cioè «i miei», che era
    // il vecchio filtro e adesso è un caso di questo.
    await utente.click(within(pannello).getByRole('button', { name: /Marta/ }))
    await waitFor(() => expect(screen.queryByText('#41')).not.toBeInTheDocument())
    expect(screen.getByText('#42')).toBeInTheDocument()
    // e la pastiglia lo dice senza doverla aprire
    expect(document.querySelector('.tendina-tasto')).toHaveTextContent('✍️ Capo')
  })

  it('NON si chiude al primo tocco, ma si chiude toccando fuori', async () => {
    // Qui si deselezionano più persone di fila: una tendina che sparisce a
    // ogni scelta va riaperta ogni volta.
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('#41')
    await apriFiltri(utente)

    await utente.click(screen.getByRole('button', { name: /Staff/ }))
    const pannello = screen.getByRole('dialog', { name: /Chi ha aperto il conto/ })
    await utente.click(within(pannello).getByRole('button', { name: /Marta/ }))
    expect(screen.getByRole('dialog', { name: /Chi ha aperto il conto/ })).toBeInTheDocument()

    await utente.click(document.body)
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Chi ha aperto il conto/ })).toBe(null)
    )
  })

  it('MAI ZERO: spegnendo l’ultimo rimasto tornano tutti', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('#41')
    await apriFiltri(utente)

    await utente.click(screen.getByRole('button', { name: /Staff/ }))
    const pannello = screen.getByRole('dialog', { name: /Chi ha aperto il conto/ })
    await utente.click(within(pannello).getByRole('button', { name: /Marta/ }))
    await utente.click(within(pannello).getByRole('button', { name: /Capo/ }))

    // Una coda vuota per forza è indistinguibile da un'app rotta.
    await waitFor(() => expect(screen.getByText('#41')).toBeInTheDocument())
    expect(screen.getByText('#42')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Staff/ })).toHaveTextContent('✍️ Staff')
  })

  it('si incrocia con gli stati: i chiusi di una persona sola', async () => {
    const utente = userEvent.setup()
    ordini = [
      DI_MARTA,
      DEL_CAPO,
      conto({ id: 'k2', daily_number: 43, payment_status: 'pagato', workflow_status: 'pronto',
        placed_by: { email: 'capo@bar.it', name: 'Capo', role: 'admin' } }),
    ]
    for (const o of ordini) mostraOrdine(o.id)
    montaCoda()
    await screen.findByText('#41')
    await apriFiltri(utente)

    // Un tocco solo: gli stati si escludono, e «Chiusi» spegne «Aperti».
    await utente.click(screen.getByRole('button', { name: '💶 Chiusi' }))
    await utente.click(screen.getByRole('button', { name: /Staff/ }))
    const pannello = screen.getByRole('dialog', { name: /Chi ha aperto il conto/ })
    await utente.click(within(pannello).getByRole('button', { name: /Marta/ }))

    await waitFor(() => expect(screen.getByText('#43')).toBeInTheDocument())
    expect(screen.queryByText('#41')).not.toBeInTheDocument()
    expect(screen.queryByText('#42')).not.toBeInTheDocument()
  })
})

// A DECIDERE CHE AL BANCO SI VEDANO LE COMANDE SONO GLI STATI DEL
// SERVIZIO, non la vista scelta per la coda: quei passi sono ciò che dà
// senso alla vista del banco, e senza non c'è niente da mostrare. COME
// disegnarla lo dice `settings.bartender_view`, sorella di `queue_view`.
// LA SALA SERVE, NON PREPARA (REQ-STAFF-014). Chi porta i vassoi va a
// guardare il lavoro per sapere cosa portare — la pastiglia «Comande» c'è
// anche per lui — ma quei passi non li segna: l'unico tasto che gli resta è
// quello dell'ultimo, «servito», perché è lui a portare il drink al tavolo.
describe('le corsie viste dalla sala', () => {
  beforeEach(() => {
    ruolo = 'staff'
  })

  it('guarda il lavoro, ma prendere in carico e segnare pronto non sono suoi', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('In corso')
    await utente.click(screen.getByRole('button', { name: /Comande/ }))
    await screen.findByText('Da fare')

    // Le colonne ci sono tutte: gli servono per sapere a che punto è il
    // lavoro. I tasti che lo fanno avanzare no.
    expect(within(corsia('da-fare')).queryByRole('button', { name: 'In preparazione' })).toBeNull()
    expect(within(corsia('al-banco')).queryByRole('button', { name: 'Pronto' })).toBeNull()

    // L'ultimo passo invece è il suo mestiere.
    expect(
      within(corsia('al-ritiro')).getAllByRole('button', { name: 'Ritirato/Servito' })[0]
    ).toBeInTheDocument()
    // E il conto che ha appena servito lo incassa: quelli sono soldi, non
    // lavoro del banco.
    expect(within(corsia('ritirati')).getByRole('button', { name: 'Incassa' })).toBeInTheDocument()
  })

  it('e dal ⋯ della card non torna indietro né divide', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('In corso')
    await utente.click(screen.getByRole('button', { name: /Comande/ }))
    await screen.findByText('Da fare')

    // Resta la ristampa: un foglio perso capita anche a chi serve.
    const azioni = within(corsia('al-banco')).getAllByRole('button', { name: /Azioni/ })[0]
    await utente.click(azioni)
    expect(screen.getByRole('button', { name: /Ristampa la comanda/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Torna a/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Preparazione parziale/ })).toBeNull()
  })
})

describe('la vista del banco si accende da sé', () => {
  beforeEach(() => {
    ruolo = 'bartender'
  })

  it('col servizio acceso il bartender apre sulle comande, qualunque vista abbia la coda', async () => {
    impostazioni = { ...impostazioni, queue_view: 'griglia' }
    montaCoda()
    await screen.findByText('Da fare')
    expect(within(corsia('da-fare')).getByText('#41')).toBeInTheDocument()
  })

  it('col servizio spento la vista del banco non esiste: si vede la coda come tutti', async () => {
    // Senza i passi del servizio non ci sarebbe niente da mostrare.
    impostazioni = { ...impostazioni, queue_view: 'griglia', workflow_enabled: false }
    montaCoda()
    await screen.findByText(/In servizio/)
    expect(screen.queryByText('Da fare')).not.toBeInTheDocument()
    // nessuna colonna: è la griglia, quella che sceglie l'impostazione
    expect(document.querySelector('.corsia')).toBe(null)
    expect(document.querySelector('.order-grid')).toBeTruthy()
  })

  it('la vista si sceglie dalle impostazioni del locale, e senza scelta è «corsie di stato»', async () => {
    // È una lista di viste possibili, non un interruttore: quando se ne
    // aggiungerà un'altra il valore già salvato resta buono.
    impostazioni = { ...impostazioni, queue_view: 'lista', bartender_view: undefined }
    montaCoda()
    await screen.findByText('Da fare')
  })
})

describe('le corsie del banco: una card per comanda', () => {
  beforeEach(() => {
    ruolo = 'bartender'
  })

  // ── I FILTRI STANNO SULLA RIGA DEI CONTEGGI (BUG-042) ────────────
  //
  // Erano una riga a sé fra i conteggi e le testate delle colonne: 64px
  // — 8 di stacco, 40 di pastiglia, 4 di imbottitura, 12 sotto — per due
  // pastiglie corte, e tre livelli prima di vedere la prima comanda.
  // Questa lavagna si guarda da lontano mentre si versa: ogni riga
  // sprecata sopra è una comanda in meno sotto.
  it('i filtri non hanno più una riga loro: escono sotto i conteggi', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('Da fare')
    await apriFiltri(utente)

    const riga = screen.getByRole('button', { name: /Staff/ }).closest('.chips-filtri')
    const conteggi = riga.closest('.board-sotto')
    // Dentro la testata, appesi alla riga dei conteggi — non un livello
    // suo fra i conteggi e le colonne.
    expect(conteggi).toBeTruthy()
    expect(within(conteggi).getByText(/apert/)).toBeInTheDocument()
    // Anche le colonne sono lì con loro: la riga è una sola. (Il cambio
    // vista al banco non c'è: lì la risposta è sempre il lavoro.)
    expect(within(riga).getByRole('button', { name: 'Serviti/Ritirati' })).toBeInTheDocument()
    // E fuori dalla testata non resta nessuna riga di pastiglie: era
    // quella che costava il livello in più.
    const testata = document.querySelector('.board-head')
    expect(
      [...document.querySelectorAll('.chips-row, .chips-filtri')].filter((r) => !testata.contains(r))
    ).toHaveLength(0)
  })

  it('e fanno esattamente quello che facevano prima', async () => {
    // Si è spostato DOVE stanno, non cosa fanno.
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('Da fare')
    await apriFiltri(utente)

    // La tendina «Staff» si apre e mostra chi ha battuto un conto.
    await utente.click(screen.getByRole('button', { name: /Staff/ }))
    expect(screen.getByRole('dialog', { name: /Chi ha aperto il conto/ })).toBeInTheDocument()
    // E le colonne si spengono da qui, dalla stessa riga: sono chip come
    // gli altri, e la riga resta una.
    const fila = document.querySelector('.chips-filtri')
    await utente.click(within(fila).getByRole('button', { name: 'Serviti/Ritirati' }))
    expect(corsia('ritirati')).toBeFalsy()
    expect(document.querySelectorAll('.chips-row, .chips-filtri')).toHaveLength(1)
  })

  // ── INCASSARE NON FA SPARIRE I DRINK DA FARE (BUG-023) ───────────
  //
  // Si incassa un conto che ha ancora comande «da fare» o «in
  // preparazione» e quelle sparivano dalla coda; ricaricando la pagina
  // tornavano. Non erano i dati — il pagamento non le serve (BUG-019) —
  // era la VISTA: chiudendo un conto lo si nasconde all'istante dalla coda
  // (ordiniNascosti, un elenco che vive in memoria, ed è per questo che il
  // ricaricamento «aggiustava»), e sparendo il conto sparivano anche le
  // sue comande. Al banco vuol dire non vedere più dei drink già pagati.
  //
  // Qui si ripercorre la sequenza SENZA rete: si incassa (il conto viene
  // nascosto e la cache rimanda il conto saldato) e subito dopo le due
  // comande devono essere ancora nelle loro corsie, col bollo «Pagato».
  it('incassando un conto, le comande ancora da fare restano al banco col bollo', async () => {
    const conDueComande = (pagato) => ({
      ...CODA[0],
      id: 'o90',
      daily_number: 90,
      payment_status: pagato ? 'pagato' : 'non_richiesto',
      workflow_status: 'ricevuto',
      comande: [
        { id: 'c1', seq: 1, status: 'ricevuto', created_at: ORA, items: [] },
        { id: 'c2', seq: 2, status: 'in_preparazione', created_at: ORA, items: [] },
      ],
    })
    ordini = [conDueComande(false)]
    montaCoda()
    await screen.findByText('Da fare')
    expect(within(corsia('da-fare')).getByText('#90')).toBeInTheDocument()

    // L'INCASSO, come lo vede la coda: il conto si nasconde subito e la
    // cache rimanda il conto saldato. Nessuna attesa di rete.
    act(() => {
      nascondiOrdine('o90')
      mandaOrdini([conDueComande(true)])
    })

    const daFare = corsia('da-fare')
    const alBanco = corsia('al-banco')
    expect(within(daFare).getByText('#90')).toBeInTheDocument()
    expect(within(alBanco).getByText('#90')).toBeInTheDocument()
    // e si vede che sono già pagate: i soldi ci sono, il drink no
    expect(within(daFare).getByText('Pagato')).toBeInTheDocument()
    expect(within(alBanco).getByText('Pagato')).toBeInTheDocument()
  })

  it('ma un conto senza più niente da fare si nasconde eccome', async () => {
    // È il motivo per cui il nascondere esiste: chiuso un conto servito,
    // resta a schermo per un attimo e chi guarda si chiede se sia andata.
    const servito = {
      ...CODA[0],
      id: 'o91',
      daily_number: 91,
      workflow_status: 'ritirato',
      comande: [{ id: 'c1', seq: 1, status: 'ritirato', created_at: ORA, items: [] }],
    }
    ordini = [servito]
    montaCoda()
    await screen.findByText('Da fare')
    act(() => nascondiOrdine('o91'))
    expect(screen.queryByText('#91')).not.toBeInTheDocument()
  })

  // ── COL SALTO ACCESO, «DA FARE» NON ESISTE ───────────────────────
  //
  // Se il locale fa nascere le comande già in preparazione, quel passo non
  // si usa: nessuna comanda ci nasce, nessuno guarda quella colonna. Non
  // si deve poterci rimandare una comanda a mano, e non si deve poter
  // accendere una colonna che resterà vuota. Ma il lavoro non si nasconde
  // mai: se una comanda ci è finita lo stesso, la colonna compare da sé.
  it('col salto acceso «Da fare» sparisce dal filtro delle colonne', async () => {
    const utente = userEvent.setup()
    impostazioni = { ...impostazioni, comande_in_preparazione: true }
    ordini = [
      {
        ...CODA[0],
        id: 'o95',
        daily_number: 95,
        workflow_status: 'in_preparazione',
        comande: [{ id: 'c1', seq: 1, status: 'in_preparazione', created_at: ORA, items: [] }],
      },
    ]
    montaCoda()
    await screen.findByText('In preparazione')

    // la colonna non c'è, e non si può nemmeno accendere
    expect(corsia('da-fare')).toBeFalsy()
    await apriColonne(utente)
    expect(screen.queryByRole('button', { name: 'Da fare' })).not.toBeInTheDocument()
  })

  it('ma una comanda ferma a «da fare» fa comparire la colonna lo stesso', async () => {
    impostazioni = { ...impostazioni, comande_in_preparazione: true }
    ordini = [
      {
        ...CODA[0],
        id: 'o96',
        daily_number: 96,
        workflow_status: 'ricevuto',
        comande: [{ id: 'c1', seq: 1, status: 'ricevuto', created_at: ORA, items: [] }],
      },
    ]
    montaCoda()
    await screen.findByText('Da fare')
    expect(within(corsia('da-fare')).getByText('#96')).toBeInTheDocument()
  })

  // ── IL PRONTO, UNITO O DIVISO ────────────────────────────────────
  //
  // Quella colonna tiene due lavori diversi: roba da portare a un tavolo e
  // roba che aspetta il cliente al bancone. Chi è in sala guarda i primi,
  // chi sta al banco i secondi.
  const contoPronto = (id, numero, modo) => ({
    ...CODA[0],
    id,
    daily_number: numero,
    service_mode: modo,
    workflow_status: 'pronto',
    comande: [{ id: 'c1', seq: 1, status: 'pronto', created_at: ORA, items: [] }],
  })

  // IL BADGE «Ritiro / Servizio» È STATO TOLTO (19/08, chiesto dall'utente:
  // «il badge servizio non serve»). Diceva come va consegnato, ma la card
  // lo dice già senza pastiglie — un conto con un tavolo si porta, uno al
  // bancone si ritira — e da quando il tavolo è scritto in grande accanto
  // al numero si legge prima di prima. Una pastiglia su ogni card pronta
  // costava una riga a tutte per una cosa che si capisce dal nome.
  it('di suo il pronto è una colonna sola, senza pastiglie in più', async () => {
    impostazioni = { ...impostazioni, service_mode: 'entrambi' }
    ordini = [contoPronto('o80', 80, 'banco')]
    montaCoda()
    await screen.findByText('Da fare')
    const pronto = corsia('al-ritiro')
    expect(within(pronto).getByText(/#80/)).toBeInTheDocument()
    expect(pronto.querySelector('.pill.consegna-banco')).toBeFalsy()
    expect(corsia('al-ritiro-banco')).toBeFalsy()
  })

  it('dividendolo diventano due colonne, e il badge non serve più', async () => {
    const utente = userEvent.setup()
    impostazioni = { ...impostazioni, service_mode: 'entrambi' }
    ordini = [contoPronto('o80', 80, 'banco'), contoPronto('o81', 81, 'tavolo')]
    montaCoda()
    await screen.findByText('Da fare')

    await apriColonne(utente)
    await utente.click(screen.getByRole('button', { name: TAGLIA }))

    expect(within(corsia('al-ritiro')).getByText('#81')).toBeInTheDocument()
    expect(within(corsia('al-ritiro-banco')).getByText('#80')).toBeInTheDocument()
    // la colonna dice già quello che direbbe il badge
    expect(corsia('al-ritiro-banco').querySelector('.pill.consegna-banco')).toBe(null)
  })

  // ── IL ✂️ STA ATTACCATO AL CHIP DEL PRONTO ────────────────────────
  //
  // Era un chip a sé in fondo alla fila, «✂️ Dividi il pronto»: «dobbiamo
  // integrarlo meglio con gli altri due bottoni, in qualche modo non si
  // capisce a che serve. E poi è troppo lungo» (l'utente, 20/08/2026).
  // Il guaio era che in quella fila ogni chip ACCENDE una colonna, e
  // quello cambiava come una colonna è FATTA — stesso vestito, altro
  // mestiere, e lontano dalla colonna di cui parlava.
  it('il tastino che divide sta nel gruppo del chip della colonna, non in fondo alla fila', async () => {
    const utente = userEvent.setup()
    impostazioni = { ...impostazioni, service_mode: 'entrambi' }
    montaCoda()
    await screen.findByText('Da fare')
    await apriColonne(utente)

    // Niente più frase: il vecchio chip non esiste.
    expect(screen.queryByRole('button', { name: /Dividi il pronto/ })).not.toBeInTheDocument()

    // Il tastino e il chip della colonna stanno nello STESSO gruppo: è
    // quello che dice, senza parole, di cosa si sta parlando.
    const gruppo = screen.getByRole('button', { name: TAGLIA }).closest('.chip-gruppo')
    expect(gruppo).toBeTruthy()
    expect(
      within(gruppo).getByRole('button', { name: 'Da servire/Ritirare' })
    ).toBeInTheDocument()
    // ed è un BOTTONE SUO, non un'icona dentro il chip della colonna:
    // accendere una colonna e dividerla sono due cose diverse, e da
    // tastiera o con lo screen reader si devono poter distinguere.
    expect(within(gruppo).getAllByRole('button')).toHaveLength(2)
  })

  it('diviso, al posto della colonna ci sono le due metà col segno per riunirle', async () => {
    const utente = userEvent.setup()
    impostazioni = { ...impostazioni, service_mode: 'entrambi' }
    montaCoda()
    await screen.findByText('Da fare')
    await apriColonne(utente)
    await utente.click(screen.getByRole('button', { name: TAGLIA }))

    // L'effetto si vede DOVE si è toccato: al posto del chip unito,
    // dentro lo stesso gruppo, i due chip delle due colonne.
    const gruppo = screen.getByRole('button', { name: UNISCI }).closest('.chip-gruppo')
    expect(within(gruppo).getByRole('button', { name: 'Da servire' })).toBeInTheDocument()
    expect(within(gruppo).getByRole('button', { name: 'Da ritirare' })).toBeInTheDocument()
    expect(within(gruppo).queryByRole('button', { name: 'Da servire/Ritirare' })).toBe(null)
    // IL SEGNO DICE COSA FA, non com'è messo: da diviso l'unica cosa che
    // può fare è ricucire, e un ✂️ «acceso» direbbe comunque «taglia».
    expect(screen.queryByRole('button', { name: TAGLIA })).toBe(null)

    // e si riunisce da lì, tornando a una colonna sola.
    await utente.click(screen.getByRole('button', { name: UNISCI }))
    expect(await screen.findByRole('button', { name: TAGLIA })).toBeInTheDocument()
    expect(corsia('al-ritiro-banco')).toBeFalsy()
  })

  // «Ovviamente vale solo se è attivo il ritiro al banco» (l'utente,
  // 20/08/2026): col solo servizio ai tavoli non c'è niente da separare, e
  // un tasto che non fa niente è peggio di un tasto che non c'è.
  it('col SOLO SERVIZIO non c’è niente da dividere, e il tastino non c’è', async () => {
    const utente = userEvent.setup()
    impostazioni = { ...impostazioni, service_mode: 'tavolo' }
    montaCoda()
    await screen.findByText('Da fare')
    await apriColonne(utente)

    expect(screen.queryByRole('button', { name: TAGLIA })).toBe(null)
    expect(screen.queryByRole('button', { name: UNISCI })).toBe(null)
    expect(screen.queryByRole('button', { name: /Dividi il pronto/ })).not.toBeInTheDocument()
    // Il chip della colonna resta, da solo e senza gruppo attorno — e col
    // solo servizio perde anche la metà del nome che non esiste: «se il
    // ritiro non è attivo diventano solo Da servire e Serviti (sia filtri
    // che label lane)» (l'utente, 20/08/2026).
    const riga = document.querySelector('.chips-filtri')
    expect(within(riga).queryByRole('button', { name: 'Da servire/Ritirare' })).toBe(null)
    expect(within(riga).getByRole('button', { name: 'Da servire' }).closest('.chip-gruppo')).toBe(
      null
    )
    expect(within(riga).getByRole('button', { name: 'Serviti' })).toBeInTheDocument()
  })


  it('mostra le corsie del banco, con una card per COMANDA e i totali di ognuna', async () => {
    montaCoda()
    await screen.findByText('Da fare')
    // I nomi sono gli STATI del servizio, non dove sta il drink: la stessa
    // parola sul tasto che ci porta e sulla colonna dove finisce.
    // Il titolo si cerca nella TESTA della colonna: «In preparazione» è
    // anche il tasto della colonna accanto, ed e' voluto — il tasto dice
    // dove va a finire il conto.
    const titoli = [...document.querySelectorAll('.corsia-titolo')].map((n) => n.textContent)
    for (const titolo of [
      'Da fare',
      'In preparazione',
      'Da servire/Ritirare',
      'Serviti/Ritirati',
    ]) {
      expect(titoli.some((t) => t.startsWith(titolo))).toBe(true)
    }

    // Da fare: le due comande appena arrivate, col totale della colonna —
    // che è quello delle RIGHE che ci stanno dentro, non dei conti interi.
    const daFare = corsia('da-fare')
    expect(within(daFare).getByText('#41')).toBeInTheDocument()
    expect(within(daFare).getByText('#42')).toBeInTheDocument()
    // UNA COMANDA SOLA: nessun numero di ticket. Di base la comanda è una e
    // esce tutta per l'intero ordine — dividerla è la deroga — e finché
    // resta così questa vista è indistinguibile da quella dei conti.
    expect(within(daFare).queryByText(/comanda 1/)).not.toBeInTheDocument()
    expect(within(daFare).getByText('33,00 €')).toBeInTheDocument()

    // Pronto: il pronto e quello già pagato, che resta lì col bollo
    const alRitiro = corsia('al-ritiro')
    expect(within(alRitiro).getByText('#36')).toBeInTheDocument()
    expect(within(alRitiro).getByText('Pagato')).toBeInTheDocument()

    // Ritirato/Servito: la comanda consegnata di un conto non saldato.
    // C'era una colonna «Da incassare» con dentro il CONTO: conteneva gli
    // stessi drink di questa, solo raggruppati per conto invece che per
    // ticket. La card resta il ticket e non chiede soldi — dice che quei
    // drink sono usciti — e il tasto porta in cassa.
    const ritirati = corsia('ritirati')
    expect(within(ritirati).getByText('#33')).toBeInTheDocument()
    expect(within(ritirati).getByText('Tavolo 9')).toBeInTheDocument()
    expect(within(ritirati).getByText(/Spritz/)).toBeInTheDocument()
    expect(document.querySelector('.corsia-da-incassare')).toBe(null)
  })

  it('il tasto fa avanzare QUELLA comanda, non tutto il conto', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('Da fare')

    const daFare = corsia('da-fare')
    await utente.click(within(daFare).getAllByRole('button', { name: 'In preparazione' })[0])
    // advanceComanda, con l'id della comanda: è la stessa strada del
    // dettaglio del conto, non una scorciatoia di questa vista.
    expect(advanceComanda).toHaveBeenCalledWith('o41', 'c-o41', 'in_preparazione')
    expect(updateOrderStatus).not.toHaveBeenCalled()

    // e la card è già passata di corsia, senza aspettare il server: al
    // banco un gesto che non si vede subito è un gesto che si ripete.
    expect(within(corsia('al-banco')).getByText('#41')).toBeInTheDocument()

    // ogni corsia ha il verbo del suo passo
    expect(
      within(corsia('al-banco')).getAllByRole('button', { name: 'Pronto' })[0]
    ).toBeInTheDocument()
    expect(
      within(corsia('al-ritiro')).getAllByRole('button', { name: 'Ritirato/Servito' })[0]
    ).toBeInTheDocument()
    expect(
      within(corsia('ritirati')).getByRole('button', { name: 'Incassa' })
    ).toBeInTheDocument()
  })

  // DOVE PORTANO I TOCCHI. Dal banco la prima domanda è «cosa devo fare
  // qui», e la risposta è il TICKET: la card apre la comanda. Il conto è
  // l'altra domanda — quanto fa, cosa aggiungo, chi paga — e ha un tasto
  // suo, piccolo e scritto, che non ruba il posto a quello grande.
  it('toccando la card si apre la COMANDA; al conto si va da un tasto suo', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('Da fare')

    await utente.click(within(corsia('da-fare')).getByText('#41'))
    expect(navigateSpy).toHaveBeenCalledWith('/ordine/o41/comanda/c-o41')

    const card = within(corsia('da-fare')).getByText('#41').closest('.corsia-card')
    await utente.click(within(card).getByRole('button', { name: /Conto/ }))
    expect(navigateSpy).toHaveBeenCalledWith('/ordine/o41')

    // ANCHE LA COMANDA SERVITA È UN TICKET: si apre come le altre, e ha il
    // suo tasto per il conto. Prima quella colonna conteneva il CONTO, e
    // toccarla apriva direttamente il conto.
    await utente.click(within(corsia('ritirati')).getByText('#33'))
    expect(navigateSpy).toHaveBeenCalledWith('/ordine/o33/comanda/c-o33')

    // «Incassa» invece porta dritto al pagamento del conto, che è il flusso
    // esistente: sconto, conto diviso, contanti, carta e lettore stanno lì.
    await utente.click(within(corsia('ritirati')).getByRole('button', { name: 'Incassa' }))
    expect(navigateSpy).toHaveBeenCalledWith('/ordine/o33?pagamento=1')
  })

  it('la ricerca filtra dentro le corsie, tutte insieme', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('Da fare')

    await utente.type(screen.getByPlaceholderText(/Cerca numero/), '41')

    expect(screen.getByText('#41')).toBeInTheDocument()
    expect(screen.queryByText('#42')).not.toBeInTheDocument()
    expect(screen.queryByText('#33')).not.toBeInTheDocument()
    // le colonne restano tutte, anche svuotate: la loro posizione si
    // impara a memoria
    const titoli = [...document.querySelectorAll('.corsia-titolo')].map((n) => n.textContent)
    for (const titolo of [
      'Da fare',
      'In preparazione',
      'Da servire/Ritirare',
      'Serviti/Ritirati',
    ]) {
      expect(titoli.some((t) => t.startsWith(titolo))).toBe(true)
    }
  })

  it('due comande dello stesso conto stanno in due colonne diverse', async () => {
    // È il motivo per cui questa vista esiste: un conto con una comanda
    // pronta e un'aggiunta ancora da fare, disegnato come una card sola,
    // direbbe una cosa sbagliata comunque la si metta.
    ordini = [
      {
        ...CODA[0],
        id: 'o44',
        daily_number: 44,
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'pronto',
            created_at: ORA,
            items: [{ id: 'a', name: 'Negroni', qty: 2, unit_price: 9 }],
          },
          {
            id: 'c2',
            seq: 2,
            status: 'ricevuto',
            created_at: ORA,
            items: [{ id: 'b', name: 'Gin tonic', qty: 1, unit_price: 6 }],
          },
        ],
      },
    ]
    montaCoda()
    await screen.findByText('Da fare')

    expect(within(corsia('al-ritiro')).getByText('· comanda 1')).toBeInTheDocument()
    expect(within(corsia('al-ritiro')).getByText(/Negroni/)).toBeInTheDocument()
    expect(within(corsia('da-fare')).getByText('· comanda 2')).toBeInTheDocument()
    expect(within(corsia('da-fare')).getByText(/Gin tonic/)).toBeInTheDocument()
  })

  // CHI STA AL BANCO SPEGNE LE COLONNE CHE NON GLI SERVONO. A metà serata
  // guarda «Da fare» e «In preparazione»: le altre gli mangiano mezzo schermo
  // per roba che in quel momento non lo riguarda. La scelta è di QUESTO
  // terminale — al banco e alla cassa non si guardano le stesse cose — e
  // deve sopravvivere a un ricaricamento della pagina.
  it('le colonne si spengono e si riaccendono, e si ricordano al ricarico', async () => {
    const utente = userEvent.setup()
    const vista = montaCoda()
    await screen.findByText('Da fare')

    await apriColonne(utente)
    await utente.click(
      screen.getByRole('button', { name: 'Da servire/Ritirare', pressed: true })
    )
    expect(corsia('al-ritiro')).toBeFalsy()
    expect(corsia('da-fare')).toBeTruthy()

    // ricaricando la pagina la colonna è ancora spenta: è una preferenza
    // di chi sta a questo schermo, non un capriccio di questa sessione
    vista.unmount()
    montaCoda()
    // SI ASPETTA LA CORSIA, non il testo: da quando le colonne sono chip in
    // fila coi filtri — e la fila aperta se lo ricorda al ricarico — «Da
    // fare» sta a schermo due volte, sulla testata e sul suo chip.
    await waitFor(() => expect(corsia('da-fare')).toBeTruthy())
    expect(corsia('al-ritiro')).toBeFalsy()

    // e si riaccende dallo stesso posto
    await apriColonne(utente)
    await utente.click(
      screen.getByRole('button', { name: 'Da servire/Ritirare', pressed: false })
    )
    expect(corsia('al-ritiro')).toBeTruthy()
  })

  // ── LE COLONNE SPENTE, E IL SEGNALE CHE NON C'È PIÙ ──────────────
  //
  // C'È STATO UN SEGNALE, ed è una storia da tenere. Prima era un
  // arancione sul chip «▦ Colonne» acceso «se ce n'è almeno una spenta» —
  // ma due nascono spente di serie, quindi era acceso su ogni terminale
  // nuovo, per sempre: «continua ad essere sempre attivo» (l'utente,
  // BUG-058). Poi il chip è sparito (20/08) e il segnale è diventato un
  // NUMERO sul tastino «▾ Filtri», che è l'unico posto dove da fila chiusa
  // si poteva ancora dire qualcosa.
  //
  // E IL NUMERO HA FATTO TRE GIRI IN UN GIORNO — quanti generi di filtro
  // (BUG-080), quante deviazioni dal normale, quante restrizioni
  // (BUG-085) — bocciato ogni volta da chi lo guardava, finché la
  // richiesta non è diventata: «sì ma infatti togliamo quel numero. Non
  // serve» (l'utente, 22/08/2026).
  //
  // QUELLO CHE RESTA DA PROVARE QUI È LA LAVAGNA: quali colonne stanno a
  // schermo dopo aver toccato i chip, e che la memoria del terminale non
  // si riempia di fantasmi. Il tastino non deve dire niente, mai.
  it('spengo e riaccendo le colonne: cambia la lavagna, non il tastino', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('Da fare')

    const tasto = () => screen.getByRole('button', { name: 'Filtri' })
    const mutoEDiGrigio = () => {
      expect(tasto().textContent.trim()).toBe('▾ Filtri')
      expect(tasto()).not.toHaveClass('active')
      expect(tasto()).toHaveAttribute('title', 'Mostra filtri')
    }

    // Terminale mai toccato: le due spente di serie non sono a schermo.
    expect(corsia('chiusi')).toBeFalsy()
    mutoEDiGrigio()

    // Spengo una corsia normalmente a schermo: quella roba non si vede più.
    await apriFiltri(utente)
    await utente.click(
      screen.getByRole('button', { name: 'Da servire/Ritirare', pressed: true })
    )
    await apriFiltri(utente) // richiudo
    expect(corsia('al-ritiro')).toBeFalsy()
    mutoEDiGrigio()

    // Riaccendo una di serie spenta: a schermo c'è una colonna in più.
    await apriFiltri(utente)
    await utente.click(screen.getByRole('button', { name: '💶 Chiuse', pressed: false }))
    await apriFiltri(utente)
    expect(corsia('chiusi')).toBeTruthy()
    mutoEDiGrigio()

    // Rimetto a schermo quella nascosta: la lavagna è di nuovo intera.
    await apriFiltri(utente)
    await utente.click(
      screen.getByRole('button', { name: 'Da servire/Ritirare', pressed: false })
    )
    await apriFiltri(utente)
    expect(corsia('al-ritiro')).toBeTruthy()
    mutoEDiGrigio()
  })

  // UNA COLONNA CHE NON ESISTE PIÙ non deve restare nella memoria del
  // terminale. Gli id delle corsie sono cambiati coi rimaneggiamenti, e
  // quelli vecchi ci restavano dentro: nell'elenco non c'era nessuna
  // colonna da riaccendere per toglierli, e finché il tastino portava un
  // badge lo tenevano acceso per sempre.
  it('gli id di colonne che non esistono più si buttano all’apertura', async () => {
    // La memoria tiene anche le due spente di serie: il terminale aveva
    // nascosto al-ritiro e basta. Il fantasma va buttato.
    localStorage.setItem(
      'tana:corsie:nascoste',
      JSON.stringify(['al-ritiro', 'chiusi', 'annullati', 'corsia-fantasma', 'da-incassare-vecchia'])
    )
    montaCoda()
    await screen.findByText('Da fare')

    // resta la sola spenta vera — «al-ritiro» — e la memoria è ripulita
    // sul disco
    expect(corsia('al-ritiro')).toBeFalsy()
    expect(JSON.parse(localStorage.getItem('tana:corsie:nascoste'))).toEqual([
      'al-ritiro',
      'chiusi',
      'annullati',
    ])
  })

  // LE TRE COLONNE DELLA FOTOGRAFIA. Il locale fa nascere le comande già
  // in preparazione — «Da fare» non la spegne il terminale, non esiste
  // proprio finché è vuota (`corsieSceglibili`) — e le due dello sguardo
  // all'indietro nascono spente di serie. Restano tre corsie, ed è la
  // lavagna dello screenshot su cui il conteggio è stato bocciato.
  it('col locale che parte «in preparazione» restano tre colonne, e nessun numero', async () => {
    impostazioni = { ...impostazioni, comande_in_preparazione: true }
    ordini = CODA.filter((o) => o.workflow_status !== 'ricevuto')
    montaCoda()
    await screen.findByText('In preparazione')

    // le tre colonne della fotografia, e «Da fare» che non c'è
    for (const id of ['al-banco', 'al-ritiro', 'ritirati']) expect(corsia(id)).toBeTruthy()
    for (const id of ['da-fare', 'chiusi', 'annullati']) expect(corsia(id)).toBeFalsy()

    const tasto = screen.getByRole('button', { name: 'Filtri' })
    expect(tasto.textContent.trim()).toBe('▾ Filtri')
    expect(tasto).toHaveAttribute('title', 'Mostra filtri')
  })

  it('un conto appena battuto si vede subito, prima ancora del server', async () => {
    // Altrimenti chi batte al POS torna in coda, non lo trova e lo ribatte.
    inVolo = [
      { tempId: 't1', state: 'sending', order: { table_label: '7', customer_name: 'Giulia' } },
    ]
    montaCoda()
    await screen.findByText('Da fare')

    const daFare = corsia('da-fare')
    expect(within(daFare).getByText('#…')).toBeInTheDocument()
    expect(within(daFare).getByText('Tavolo 7 · Giulia')).toBeInTheDocument()
  })

  // PAGATO MA ANCORA DA FARE. È il caso strano — i soldi li hai già presi,
  // il drink lo devi ancora fare — e la comanda resta dov'è: una comanda
  // diventa chiusa quando è stata SERVITA, non quando arrivano i soldi.
  it('il conto pagato in anticipo resta al banco col bollo, e non risulta chiuso', async () => {
    const utente = userEvent.setup()
    ordini = [
      {
        ...CODA[0],
        id: 'o45',
        daily_number: 45,
        payment_status: 'pagato',
        workflow_status: 'ricevuto',
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'ricevuto',
            created_at: ORA,
            items: [{ id: 'a', name: 'Negroni', qty: 1, unit_price: 9 }],
          },
        ],
      },
    ]
    montaCoda()
    await screen.findByText('Da fare')

    const daFare = corsia('da-fare')
    expect(within(daFare).getByText('#45')).toBeInTheDocument()
    expect(within(daFare).getByText('Pagato')).toBeInTheDocument()
    // la card si nota: non è una voce archiviata sbiadita
    expect(daFare.querySelector('.corsia-card')).toHaveClass('pagato-da-servire')
    // e non chiede soldi a nessuno: è già saldato
    expect(within(corsia('ritirati')).queryByText('#45')).not.toBeInTheDocument()

    // «Chiuse» non ingombra il banco, ma si accende dal filtro — e lì
    // dentro questo conto NON c'è: il drink è ancora da fare.
    expect(corsia('chiusi')).toBeFalsy()
    await apriColonne(utente)
    await utente.click(screen.getByRole('button', { name: '💶 Chiuse', pressed: false }))
    expect(within(corsia('chiusi')).queryByText('#45')).not.toBeInTheDocument()
  })

  // CHI STA ALLO SHAKER NON INCASSA: quella colonna gli ruba spazio, e si
  // spegne come tutte le altre. Chi sta in cassa la tiene.
  it('anche la colonna dei serviti si nasconde dal filtro', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('Da fare')
    expect(corsia('ritirati')).toBeTruthy()

    await apriColonne(utente)
    await utente.click(screen.getByRole('button', { name: 'Serviti/Ritirati', pressed: true }))
    expect(corsia('ritirati')).toBeFalsy()
    expect(corsia('da-fare')).toBeTruthy()
  })

  // ACCONTO: una parte incassata e il conto ancora aperto. Se la card non
  // lo dice, chi la porta al tavolo chiede l'intero — e succede.
  // LE AZIONI DI UNA COMANDA SI APRONO NELLA CARD, come per i conti: una
  // finestrella a tutto schermo per un «torna a in preparazione» fa perdere
  // di vista la colonna proprio mentre si lavora.
  it('il ⋯ della comanda apre le sue azioni dentro la card', async () => {
    const utente = userEvent.setup()
    montaCoda()
    await screen.findByText('Da fare')

    const card = corsia('al-banco').querySelector('.corsia-card')
    await utente.click(within(card).getByRole('button', { name: /Azioni/ }))

    // stanno DENTRO la card, non in una finestrella sopra la pagina
    const aperte = card.querySelector('.corsia-azioni-aperte')
    expect(aperte).toBeTruthy()
    expect(within(aperte).getByRole('button', { name: /Torna a/ })).toBeInTheDocument()
    expect(within(aperte).getByRole('button', { name: /Ristampa/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // e si richiude dallo stesso tasto
    await utente.click(within(card).getByRole('button', { name: /Chiudi/ }))
    expect(card.querySelector('.corsia-azioni-aperte')).toBeFalsy()
  })

  it('il conto con un acconto lo dice, e la card cambia colore', async () => {
    ordini = [
      {
        ...CODA[0],
        id: 'o47',
        daily_number: 47,
        payment_status: 'parziale',
        payments: [{ amount: 10, method: 'banco', at: ORA }],
      },
    ]
    montaCoda()
    await screen.findByText('Da fare')

    const daFare = corsia('da-fare')
    expect(within(daFare).getByText('💳 Acconto')).toBeInTheDocument()
    expect(daFare.querySelector('.corsia-card')).toHaveClass('acconto')
  })

  it('le comande di un conto annullato si ritrovano sotto «Annullate»', async () => {
    const utente = userEvent.setup()
    ordini = [
      {
        ...CODA[0],
        id: 'o46',
        daily_number: 46,
        status: 'annullato',
        workflow_status: 'annullato',
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'ricevuto',
            created_at: ORA,
            items: [{ id: 'a', name: 'Negroni', qty: 1, unit_price: 9 }],
          },
        ],
      },
    ]
    montaCoda()
    await screen.findByText('Da fare')
    // quella roba non si fa: non è lavoro
    expect(within(corsia('da-fare')).queryByText('#46')).not.toBeInTheDocument()

    await apriColonne(utente)
    await utente.click(screen.getByRole('button', { name: '✖️ Annullate', pressed: false }))
    expect(within(corsia('annullati')).getByText('#46')).toBeInTheDocument()
  })

  it('senza stati di servizio le corsie diventano tre: in corso, chiusi, annullati', async () => {
    impostazioni = { ...impostazioni, workflow_enabled: false }
    montaCoda()
    await screen.findByText('In corso')

    for (const titolo of ['In corso', '💶 Chiusi', '✖️ Annullati']) {
      expect(screen.getByText(titolo)).toBeInTheDocument()
    }
    expect(screen.queryByText('Da fare')).not.toBeInTheDocument()
    // Niente avanzamenti: senza gli stati l'unica cosa da fare a un conto
    // in corso è incassarlo.
    expect(screen.queryByRole('button', { name: 'In preparazione' })).not.toBeInTheDocument()
    expect(
      within(corsia('attivi')).getAllByRole('button', { name: 'Incassa' })[0]
    ).toBeInTheDocument()
  })

  // IL VERSO DELLA CODA VALE PER TUTTE LE CORSIE. Il tasto girava solo la
  // griglia: nelle corsie premerlo non faceva niente di visibile, e un
  // tasto che non risponde fa dubitare dell'app.
  it('la freccia dell’ordinamento inverte le card in ogni corsia', async () => {
    const user = userEvent.setup()
    montaCoda()
    // I numeri corsia per corsia: l'ordine si gira DENTRO ogni colonna, non
    // fra colonne diverse — le corsie restano dove sono.
    const perCorsia = () =>
      [...document.querySelectorAll('.corsia')].map((c) =>
        [...c.querySelectorAll('.corsia-num')].map((n) => n.textContent.trim().split(' ')[0])
      )
    const prima = await waitFor(() => {
      const c = perCorsia()
      expect(c.some((col) => col.length > 1)).toBe(true)
      return c
    })
    // IL TASTO DICE COM'È MESSA LA CODA, non dove porta: «basta scrivere
    // Prima i più recenti/vecchi in base all'ordinamento attuale»
    // (l'utente, 20/08). Quindi il nome CAMBIA col verso, e con lui la
    // freccia — giù si scende verso i vecchi, su si sale verso gli ultimi.
    // Di suo la coda parte dal più vecchio, come nasce la serata.
    const tasto = screen.getByRole('button', { name: 'Prima i più vecchi' })
    expect(tasto).toHaveTextContent('↑')
    await user.click(tasto)
    await waitFor(() => expect(perCorsia()).not.toEqual(prima))
    expect(perCorsia()).toEqual(prima.map((col) => [...col].reverse()))

    const girato = screen.getByRole('button', { name: 'Prima i più recenti' })
    expect(girato).toHaveTextContent('↓')
    // e non resta traccia della frase di prima, che l'utente ha bocciato
    expect(girato.getAttribute('title')).not.toMatch(/Adesso|tocca per/i)
  })
})
// ── IL COLORE DEL CONTO (REQ-UI-020) ─────────────────────────────────
//
// Un conto battuto in tre volte diventa tre comande, e le tre comande
// finiscono in tre colonne diverse della lavagna: da due metri nessuno vede
// più che sono lo stesso tavolo. Il colore tinge la CARD INTERA, ed è del
// conto — la comanda se lo porta dietro.
//
// Fu provato come pallino accanto al numero e non serviva a niente: questo
// colore deve rispondere da lontano, e dieci pixel da lontano non ci sono.
//
// Le due cose che qui costano un drink sbagliato:
//   · lo stesso conto tinge le sue card allo stesso modo in TUTTE le colonne;
//   · la striscia a sinistra resta quella dello STATO. Fra i due segni vince
//     lo stato, sempre: è quello che dice cosa fare adesso, e se il colore
//     del conto se lo mangiasse la lavagna diventerebbe muta.
describe('il colore del conto, e le comande che se lo portano dietro', () => {
  const colorate = (nodo) => [...nodo.querySelectorAll('.conto-colorato')]
  const tinta = (card) => card.style.getPropertyValue('--conto-colore')

  it('lo stesso conto tinge le sue card in tutte le colonne', async () => {
    ruolo = 'bartender'
    ordini = [
      {
        ...CODA[0],
        id: 'o44',
        daily_number: 44,
        colore: '#9b59b6',
        comande: [
          { id: 'c1', seq: 1, status: 'pronto', created_at: ORA, items: [{ id: 'a', name: 'Negroni', qty: 1, unit_price: 9 }] },
          { id: 'c2', seq: 2, status: 'ricevuto', created_at: ORA, items: [{ id: 'b', name: 'Gin tonic', qty: 1, unit_price: 6 }] },
        ],
      },
    ]
    montaCoda()
    await screen.findByText('Da fare')

    const daFare = colorate(corsia('da-fare'))
    const alRitiro = colorate(corsia('al-ritiro'))
    expect(daFare).toHaveLength(1)
    expect(alRitiro).toHaveLength(1)
    // Lo stesso colore, non «uno a testa»: è tutto il punto.
    expect(tinta(daFare[0])).toBe('#9b59b6')
    expect(tinta(alRitiro[0])).toBe('#9b59b6')
  })

  it('un conto senza colore resta com’è: non se ne inventa uno', async () => {
    // I conti nati prima dell'impostazione restano com'erano. Se il colore
    // si ricalcolasse dall'id, accendere l'interruttore colorerebbe di
    // colpo tutta la coda — e domani, cambiata la tavolozza, la
    // colorerebbe di nuovo diversa.
    ruolo = 'bartender'
    ordini = [{ ...CODA[0], id: 'o45', daily_number: 45 }]
    montaCoda()
    await screen.findByText('Da fare')

    expect(colorate(document.body)).toHaveLength(0)
  })

  it('di suo vince lo stato: la striscia della card non cambia per il colore', async () => {
    ordini = [{ ...CODA[0], id: 'o46', daily_number: 46, colore: '#e74c3c' }]
    montaCoda()
    await screen.findByText('In corso')

    const card = document.querySelector('.corsia-card')
    // La striscia a sinistra è dello STATO, e resta dov'era: il fondo
    // colorato è un segno in più, non un segno al posto di quello. La
    // classe dello stato sopravvive accanto a quella del colore, e nessuno
    // scrive il bordo a mano.
    // È il DEFAULT, e conta che resti tale: chi non tocca l'impostazione
    // nuova deve vedere la coda di ieri sera.
    expect(card).toHaveClass('ricevuto')
    expect(card).toHaveClass('conto-colorato')
    expect(card).not.toHaveClass('bordo-conto')
    expect(card.style.borderLeftColor).toBe('')
    expect(tinta(card)).toBe('#e74c3c')
  })

  it('dal ⋯ della comanda si dà il colore, ed è quello del CONTO', async () => {
    ruolo = 'bartender'
    const utente = userEvent.setup()
    ordini = [{ ...CODA[0], id: 'o47', daily_number: 47 }]
    montaCoda()
    await screen.findByText('Da fare')

    const card = corsia('da-fare').querySelector('.corsia-card')
    await utente.click(within(card).getByRole('button', { name: /Azioni/ }))
    const aperte = card.querySelector('.corsia-azioni-aperte')
    await utente.click(within(aperte).getByRole('button', { name: /Colore del conto/ }))
    await utente.click(within(tavolozza()).getByRole('button', { name: 'Colore #2ecc71' }))

    // Si scrive sul CONTO (o47), non sulla comanda: è il conto ad avere un
    // colore, e le sue comande lo mostrano.
    expect(setOrderColore).toHaveBeenCalledWith('o47', '#2ecc71')
  })

  it('e si toglie, per un conto colorato per sbaglio', async () => {
    const utente = userEvent.setup()
    ordini = [{ ...CODA[0], id: 'o48', daily_number: 48, colore: '#e74c3c' }]
    montaCoda()
    await screen.findByText('In corso')

    const card = document.querySelector('.corsia-card')
    await utente.click(within(card).getByRole('button', { name: /Azioni/ }))
    await utente.click(within(card).getByRole('button', { name: /Colore del conto/ }))
    await utente.click(within(tavolozza()).getByRole('button', { name: 'Nessun colore' }))

    expect(setOrderColore).toHaveBeenCalledWith('o48', null)
  })
})

// ── LA TAVOLOZZA STA IN UNA MODALE, NON NEL MENU (REQ-UI-020) ────────
//
// «I colori del conto e della comanda andrebbero messi in una modale che
// si apre con un bottone» (l'utente, 20/08/2026). Dentro il ⋯ erano dodici
// gettoni in due file più il «niente»: tre righe di menu, e le azioni vere
// — torna indietro, dividi, ristampa — finivano sopra una macchia di
// quadratini, su una card che in corsia è larga un dito.
//
// Quello che qui costa un tocco sbagliato al banco:
//   · nel menu c'è UN tasto, e dice già di che colore è il conto: sennò per
//     rispondere alla domanda più frequente («di che colore è questo?»)
//     bisognerebbe aprire la modale ogni volta;
//   · scegliere APPLICA E CHIUDE, modale e menu: il gesto finisce lì, e un
//     menu rimasto aperto dietro tiene la card alta il doppio proprio
//     mentre si torna a guardare la colonna;
//   · niente aspetta la rete: la scrittura parte in sottofondo e la modale
//     è già sparita.
describe('il colore si sceglie in una modale', () => {
  const menu = (card) => card.querySelector('.corsia-azioni-aperte')

  const apriIlMenu = async (utente, card) =>
    utente.click(within(card).getByRole('button', { name: /Azioni/ }))

  it('nel menu c’è un tasto solo, non la fila dei gettoni', async () => {
    const utente = userEvent.setup()
    ordini = [{ ...CODA[0], id: 'o60', daily_number: 60 }]
    montaCoda()
    await screen.findByText('In corso')

    const card = document.querySelector('.corsia-card')
    await apriIlMenu(utente, card)

    expect(within(menu(card)).getByRole('button', { name: /Colore del conto/ })).toBeInTheDocument()
    // I dodici quadratini non stanno più lì dentro, e nemmeno il «✕»:
    // è tutto dietro il tasto.
    expect(menu(card).querySelectorAll('.colore-conto')).toHaveLength(0)
    // E finché non si tocca il tasto la modale non c’è.
    expect(tavolozza()).toBe(null)
  })

  it('il tasto porta addosso il colore di adesso', async () => {
    const utente = userEvent.setup()
    ordini = [
      { ...CODA[0], id: 'o61', daily_number: 61, colore: '#9b59b6' },
      { ...CODA[0], id: 'o62', daily_number: 62 },
    ]
    montaCoda()
    await screen.findByText('In corso')

    // Un menu per volta: aprire il secondo chiude il primo, ed è giusto
    // così — sono due card della stessa colonna.
    const [colorato, spento] = [...document.querySelectorAll('.corsia-card')]

    await apriIlMenu(utente, colorato)
    // Un pallino pieno del colore del conto…
    const pieno = menu(colorato).querySelector('.pallino-colore-conto')
    expect(pieno.style.background).toBe('#9b59b6')

    await apriIlMenu(utente, spento)
    // …e uno vuoto quando il conto un colore non ce l’ha: un cerchio col
    // solo bordo dice «nessuno», un posto lasciato in bianco sembrerebbe
    // una cosa non caricata.
    const vuoto = menu(spento).querySelector('.pallino-colore-conto')
    expect(vuoto).toHaveClass('niente')
    expect(vuoto.style.background).toBe('')
  })

  it('scegliere applica e chiude: la modale e anche il menu sotto', async () => {
    const utente = userEvent.setup()
    ordini = [{ ...CODA[0], id: 'o63', daily_number: 63 }]
    montaCoda()
    await screen.findByText('In corso')

    const card = document.querySelector('.corsia-card')
    await apriIlMenu(utente, card)
    await utente.click(within(menu(card)).getByRole('button', { name: /Colore del conto/ }))
    await utente.click(within(tavolozza()).getByRole('button', { name: 'Colore #3498db' }))

    expect(setOrderColore).toHaveBeenCalledWith('o63', '#3498db')
    expect(tavolozza()).toBe(null)
    // Il menu della card se n’è andato con lei: il gesto è finito.
    expect(document.querySelector('.corsia-azioni-aperte')).toBe(null)
  })

  it('si può cambiare idea: la ✕ chiude senza scrivere niente', async () => {
    const utente = userEvent.setup()
    ordini = [{ ...CODA[0], id: 'o64', daily_number: 64 }]
    montaCoda()
    await screen.findByText('In corso')

    const card = document.querySelector('.corsia-card')
    await apriIlMenu(utente, card)
    await utente.click(within(menu(card)).getByRole('button', { name: /Colore del conto/ }))
    await utente.click(within(tavolozza()).getByRole('button', { name: 'Chiudi' }))

    expect(tavolozza()).toBe(null)
    expect(setOrderColore).not.toHaveBeenCalled()
  })

  it('e la modale si chiude con Esc, come tutte le altre', async () => {
    const utente = userEvent.setup()
    ordini = [{ ...CODA[0], id: 'o65', daily_number: 65 }]
    montaCoda()
    await screen.findByText('In corso')

    const card = document.querySelector('.corsia-card')
    await apriIlMenu(utente, card)
    await utente.click(within(menu(card)).getByRole('button', { name: /Colore del conto/ }))
    await utente.keyboard('{Escape}')

    expect(tavolozza()).toBe(null)
    expect(setOrderColore).not.toHaveBeenCalled()
  })
})

// ── LA STRISCIA PUÒ DIRE IL COLORE DEL CONTO (REQ-UI-020) ────────────
//
// «Serve una impostazione che mi permetta di scegliere se il bordino
// rappresenta gli stati del pagamento ordine o può essere del colore
// scelto per la card» (l'utente, 20/08/2026). Dove un conto si spezza in
// tante comande sparse, riconoscere il tavolo vale più del passo di
// lavoro — e a deciderlo è chi manda avanti il locale.
//
// Quello che qui costa un drink sbagliato:
//   · l'impostazione vale in TUTTE le viste della coda, non solo in quella
//     che si è toccata per ultima: la striscia deve voler dire la stessa
//     cosa ovunque, o non vuol dire niente;
//   · un conto senza colore, e un conto annullato, tengono la striscia
//     dello stato: la prima cosa sparirebbe, la seconda tornerebbe viva.
describe('la striscia della card può portare il colore del conto', () => {
  const acceso = () => {
    impostazioni = { ...impostazioni, bordo_colore_conto: true }
  }
  const tinta = (card) => card.style.getPropertyValue('--conto-colore')

  it('accesa l’impostazione, la card delle corsie porta il colore sulla striscia', async () => {
    acceso()
    ordini = [{ ...CODA[0], id: 'o51', daily_number: 51, colore: '#e74c3c' }]
    montaCoda()
    await screen.findByText('In corso')

    const card = document.querySelector('.corsia-card')
    expect(card).toHaveClass('bordo-conto')
    // IL FONDO NON SI PERDE: sono due segni, e quello che risponde da
    // lontano resta il fondo. La classe dello stato resta anche lei —
    // a spegnerla ci pensa il CSS, non il JSX.
    expect(card).toHaveClass('conto-colorato')
    expect(card).toHaveClass('ricevuto')
    expect(tinta(card)).toBe('#e74c3c')
  })

  it('e vale anche nella griglia, dove la striscia diceva il pagamento', async () => {
    acceso()
    impostazioni = { ...impostazioni, queue_view: 'griglia' }
    ordini = [{ ...CODA[0], id: 'o52', daily_number: 52, colore: '#1abc9c' }]
    montaCoda()
    await screen.findByText('#52')

    const card = document.querySelector('.grid-card')
    expect(card).toHaveClass('bordo-conto')
    // La classe del pagamento resta sotto: se domani si spegne
    // l'impostazione, la griglia torna a dire quello che diceva.
    expect(card).toHaveClass('pay-aperto')
    expect(tinta(card)).toBe('#1abc9c')
  })

  it('un conto senza colore tiene la striscia dello stato: non sparisce', async () => {
    // Mettendo la classe lo stesso, `var(--conto-colore)` non sarebbe
    // definita e la striscia diventerebbe trasparente: una card senza
    // bordo, che non dice più né una cosa né l'altra.
    acceso()
    ordini = [{ ...CODA[0], id: 'o53', daily_number: 53 }]
    montaCoda()
    await screen.findByText('In corso')

    const card = document.querySelector('.corsia-card')
    expect(card).not.toHaveClass('bordo-conto')
    expect(card).toHaveClass('ricevuto')
  })

  it('un conto annullato tiene il grigio, impostazione o no', async () => {
    // Lavoro buttato: una striscia accesa lo rimetterebbe in mezzo ai vivi,
    // e nella colonna degli annullati sarebbe la card più vistosa di tutte.
    acceso()
    ordini = [
      {
        ...CODA[0],
        id: 'o54',
        daily_number: 54,
        status: 'annullato',
        workflow_status: 'annullato',
        colore: '#f1c40f',
      },
    ]
    montaCoda()
    await screen.findByText('✖️ Annullati')

    const card = document.querySelector('.corsia-card')
    expect(card).not.toHaveClass('bordo-conto')
    // Il FONDO resta colorato anche lì: è il conto, non il suo stato.
    expect(card).toHaveClass('conto-colorato')
  })
})

// ── CHI È COLLEGATO, NELLA LEGENDA (REQ-CODA-005) ────────────────────
//
// La legenda diceva solo chi aveva già battuto un conto: chi si collegava
// non compariva, e non sapeva con che lettera si sarebbe riconosciuto.
//
// La cosa da non sbagliare è CHI PUÒ SAPERLO: admin e bartender sì, la
// sala no. Sapere chi è collegato è un'informazione sulle persone, non sul
// lavoro, e non deve servire a controllare i colleghi. Il lucchetto vero è
// nelle regole di Firestore; qui si controlla che la schermata non chieda
// nemmeno il dato quando non le spetta.
describe('chi è collegato, nella legenda', () => {
  const OGGI = new Date().toISOString()

  // La voce è spezzata fra più elementi (la lettera in uno span, il nome
  // accanto): si guarda il testo della legenda intera, che è anche il modo
  // in cui la legge chi sta al banco.
  const legenda = () => document.querySelector('.order-legend')?.textContent || ''

  it('l’admin vede in legenda anche chi non ha ancora battuto niente', async () => {
    ruolo = 'admin'
    // Bruno e non Marco: nei dati di prova c'è già una Marta, e due nomi
    // con la stessa iniziale si pestano — è un difetto suo della legenda,
    // vecchio quanto la legenda stessa (BUG-043), non di questa aggiunta.
    presenzeFinte = [{ uid: 'u-bruno', name: 'Bruno', role: 'staff', last_seen: OGGI }]
    montaCoda()
    await screen.findByText('In corso')
    await waitFor(() => expect(legenda()).toContain('Bruno'))
  })

  it('alla sala quella riga non arriva', async () => {
    ruolo = 'staff'
    presenzeFinte = [{ uid: 'u-bruno', name: 'Bruno', role: 'staff', last_seen: OGGI }]
    montaCoda()
    await screen.findByText('In corso')

    expect(legenda()).not.toContain('Bruno')
  })

  it('ma la sala dice lo stesso che c’è: gli altri devono saperlo', async () => {
    ruolo = 'staff'
    battiti = []
    presenzeFinte = []
    montaCoda()
    await screen.findByText('In corso')

    // Un colpo di vita parte comunque — chi è in sala non vede l'elenco,
    // ma negli elenchi degli altri ci deve stare.
    expect(battiti.length).toBeGreaterThan(0)
  })

  it('chi tace da troppo non compare, anche se la riga è rimasta', async () => {
    ruolo = 'admin'
    const vecchio = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    presenzeFinte = [{ uid: 'u-sara', name: 'Sara', role: 'staff', last_seen: vecchio }]
    montaCoda()
    await screen.findByText('In corso')

    expect(legenda()).not.toContain('Sara')
  })
})

// ── LA CHIUSURA RAPIDA STAMPA COME IL PANNELLO (BUG-054) ─────────────
//
// «💶 Contanti» e «💳 Carta» nelle azioni nascoste della card sono una
// riscossione a tutti gli effetti: lo scontrino deve uscire AL GESTO, con
// la pretesa forzata, come dal tab Riscuotere. Prima ci si affidava allo
// snapshot della coda, che con la pretesa normale taceva sui conti già
// stampati una volta — riscosso, riaperto, richiuso dal tasto rapido:
// niente carta.
// ── LA CODA NON STAMPA SCONTRINI ─────────────────────────────────────
//
// «Alla prima apertura dell'app ero in inventario. Sono tornato in coda
// ordini e mi ha stampato tutti gli SCONTRINI. C'era un solo ordine e una
// sola comanda ma mi ha stampato lo scontrino» (l'utente, 20/08).
// Qui viveva un blocco che stampava OGNI conto pagato che passava dallo
// snapshot, e l'unica guardia era una pretesa in localStorage: un browser
// nuovo — o una memoria svuotata — non ne aveva nessuna, e la serata intera
// usciva dalla stampante in raffica. Lo scontrino appartiene al GESTO
// dell'incasso, non a uno sguardo sulla coda (BUG-055).
describe('tornando in coda, gli scontrini non escono', () => {
  it('un conto già pagato nella coda non fa uscire nessuna carta', async () => {
    ruolo = 'admin'
    // Tutto acceso e tutto permesso: l'auto-stampa dello scontrino c'è, e la
    // pretesa dice di sì (è la memoria vuota di un browser appena aperto).
    loadPrinterSettings.mockReturnValue({ autoPrintScontrino: true })
    claimReceiptPrint.mockReturnValue(true)
    printScontrino.mockClear()
    montaCoda()
    await screen.findByText('In corso')
    // Nella coda c'è il conto #36, pagato. Prima di questa cura qui usciva
    // il suo scontrino — e con lui quello di tutti gli altri conti pagati.
    expect(printScontrino).not.toHaveBeenCalled()
  })
})

describe('la chiusura rapida dalla card stampa lo scontrino', () => {
  it('Contanti stampa al gesto, col metodo sullo scontrino', async () => {
    const utente = userEvent.setup()
    ruolo = 'admin'
    impostazioni = { ...impostazioni, queue_view: 'griglia' }
    loadPrinterSettings.mockReturnValue({ autoPrintScontrino: true })
    // Il mock del file risponde false (nelle altre prove la stampa non
    // c'entra): qui la pretesa deve passare, e' il gesto dell'incasso.
    reclaimReceiptPrint.mockReturnValue(true)
    printScontrino.mockClear()
    montaCoda()
    await screen.findByText(/In servizio/)

    const card = document.querySelector('.grid-card')
    await utente.click(within(card).getByRole('button', { name: /Azioni|⋯/ }))
    await utente.click(screen.getByRole('button', { name: /Contanti/ }))

    expect(markOrderPaid).toHaveBeenCalled()
    expect(printScontrino).toHaveBeenCalledTimes(1)
    // Lo scontrino dice COME si è pagato: era il motivo dei due tasti.
    expect(printScontrino.mock.calls[0][0].payment_method).toBe('banco')
  })

  it('e con l’auto-stampa spenta la stampante resta muta', async () => {
    const utente = userEvent.setup()
    ruolo = 'admin'
    impostazioni = { ...impostazioni, queue_view: 'griglia' }
    loadPrinterSettings.mockReturnValue({})
    printScontrino.mockClear()
    montaCoda()
    await screen.findByText(/In servizio/)

    const card = document.querySelector('.grid-card')
    await utente.click(within(card).getByRole('button', { name: /Azioni|⋯/ }))
    await utente.click(screen.getByRole('button', { name: /Carta/ }))

    expect(markOrderPaid).toHaveBeenCalled()
    expect(printScontrino).not.toHaveBeenCalled()
  })
})


// ── SI CAMBIA STATO ANCHE TRASCINANDO ───────────────────────────
//
// «Le comande nella vista a lane [possono essere] trascinate da una colonna
// all'altra per cambiare stato» (l'utente, 20/08), e la precisazione che
// dice cos'è: «non è che DEVONO — come modo ALTERNATIVO per cambiare
// stato, le posso trascinare». I tasti restano identici, e ci sono i loro
// test qui sopra: questi provano la SECONDA strada.
describe('le comande si spostano anche col dito', () => {
  beforeEach(() => {
    ruolo = 'bartender'
  })

  it('mollata su «In preparazione», la comanda avanza per la strada di sempre', async () => {
    montaCoda()
    await screen.findByText('Da fare')
    expect(within(corsia('da-fare')).getByText('#41')).toBeInTheDocument()

    act(() => lascia('o41:c-o41', 'al-banco'))

    // La stessa scrittura del tasto grande: advanceComanda, col passo
    // della colonna in cui è stata lasciata. Nessuna scorciatoia.
    expect(advanceComanda).toHaveBeenCalledWith('o41', 'c-o41', 'in_preparazione')
    // E LOCAL-FIRST: la card sta già nella colonna nuova, senza che il
    // server abbia rimandato niente. Al banco un gesto si vede subito.
    expect(within(corsia('al-banco')).getByText('#41')).toBeInTheDocument()
    expect(within(corsia('da-fare')).queryByText('#41')).not.toBeInTheDocument()
  })

  it('e anche all\'indietro: dal pronto si torna a «Da fare»', async () => {
    montaCoda()
    await screen.findByText('Da fare')
    // «Pronto» premuto sul ticket sbagliato: lo si riporta indietro col
    // dito, invece di aprire il ⋯ e cercare la voce.
    act(() => lascia('o37:c-o37', 'da-fare'))
    expect(advanceComanda).toHaveBeenCalledWith('o37', 'c-o37', 'ricevuto')
  })

  it('sulle colonne che non sono un passo del lavoro non succede niente', async () => {
    montaCoda()
    await screen.findByText('Da fare')

    // «Annullate» sarebbe un annullo, e la strada per annullare UNA
    // comanda coi drink che restano sul conto non c'è ancora
    // (REQ-ORD-021); «Chiuse» è servita + conto pagato, non un passo.
    act(() => lascia('o41:c-o41', 'annullati'))
    act(() => lascia('o41:c-o41', 'chiusi'))
    // E mollata fuori da ogni colonna: nemmeno.
    act(() => lascia('o41:c-o41', null))

    expect(advanceComanda).not.toHaveBeenCalled()
    // La comanda è rimasta dov'era, e nessuna è sparita dalla lavagna.
    expect(within(corsia('da-fare')).getByText('#41')).toBeInTheDocument()
  })

  it('rilasciata nella colonna in cui sta gi\u00e0: nessuna scrittura', async () => {
    montaCoda()
    await screen.findByText('Da fare')
    act(() => lascia('o41:c-o41', 'da-fare'))
    expect(advanceComanda).not.toHaveBeenCalled()
  })
})

// ── IL ☰ DELLA LAVAGNA STA NELLA TESTATA ─────────────────────────────
//
// «Il tasto menu va a finire sulla label» (l'utente, 21/08/2026), con uno
// screenshot dal telefono: a tutto schermo la topbar è nascosta e il menu
// si apriva da un tasto FISSO nell'angolo, fuori dal flusso. Il posto glielo
// teneva la testata a mano — un rientro sul titolo, un altro sull'avviso
// della cassa — e quel posto era vero solo a PAGINA IN CIMA. La coda scorre:
// scorrendo, la testata gli passava sotto e il conteggio dei conti aperti e
// il nome del terminale si leggevano mozzati («…erti · 6 chiusi»).
//
// Adesso il ☰ è un figlio della testata come gli altri: scorre con lei,
// non le sta sopra, e non c'è più niente che possa finirci sotto.
describe('il ☰ della coda', () => {
  beforeEach(() => {
    impostazioni = { queue_view: 'corsie', workflow_enabled: true }
    ruolo = 'admin'
    ordini = [conto({ id: 'o1', daily_number: 1 })]
  })

  it('sta dentro la testata, non flottante sopra la pagina', async () => {
    montaCoda()
    await screen.findByText(/In servizio/)
    const menu = screen.getByRole('button', { name: 'Menu' })
    expect(menu).toHaveClass('board-burger')
    // dentro la testata: è lei a fargli posto, scorrendo insieme a lui
    expect(menu.closest('.board-head')).toBeTruthy()
    // ed è il PRIMO pezzo della fascia: chi cerca il menu guarda a
    // sinistra, in alto (docs/navigazione.md)
    expect(menu.closest('.board-head').firstElementChild).toBe(menu)
  })

  it('apre il menu laterale, come il ☰ della barra', async () => {
    const utente = userEvent.setup()
    const aperture = []
    const spia = () => aperture.push(1)
    window.addEventListener('tana:toggle-drawer', spia)
    try {
      montaCoda()
      await screen.findByText(/In servizio/)
      await utente.click(screen.getByRole('button', { name: 'Menu' }))
      expect(aperture).toHaveLength(1)
    } finally {
      window.removeEventListener('tana:toggle-drawer', spia)
    }
  })
})
