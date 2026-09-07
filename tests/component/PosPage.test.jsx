// @vitest-environment happy-dom
'use strict'

// Test di COMPONENTE della cassa (PosPage): layout identico al dettaglio
// ordine, conferma con modale nome e pagamento diretto.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from '../helpers/router.jsx'

// Spia sulla navigazione: serve a verificare che "← Ordini" riporti davvero
// alla coda, non solo che non esploda.
const navigateSpy = vi.fn()
vi.mock('react-router-dom', async (orig) => {
  const vera = await orig()
  return { ...vera, useNavigate: () => navigateSpy }
})
import '@testing-library/jest-dom/vitest'

vi.mock('../../src/lib/api.js', () => ({
  createOrder: vi.fn(() =>
    Promise.resolve({
      id: 'ord-nuovo',
      daily_number: 9,
      status: 'aperto',
      payment_status: 'non_richiesto',
      total: 7,
      payments: [],
      discount_amount: 0,
      comande: [
        {
          id: 'c1',
          seq: 1,
          // Come nasce davvero un conto: nel passo di partenza del locale,
          // che di suo è «da fare» (statoComandaNuova).
          status: 'ricevuto',
          items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
        },
      ],
      order_items: [{ id: 'x', drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
    })
  ),
  subscribeOrder: vi.fn(() => () => {}),
  fetchRecentDrinkIds: vi.fn(() => Promise.resolve([])),
  subscribePosPrefs: vi.fn(() => () => {}),
  savePosOrder: vi.fn(() => Promise.resolve()),
  savePosFavorites: vi.fn(() => Promise.resolve()),
  subscribeOpenGroups: vi.fn((cb) => {
    cb([
      { id: 'g1', name: 'Tavolo 4', has_child_groups: false },
      { id: 'g2', name: 'Compleanno', has_child_groups: true },
    ])
    return () => {}
  }),
  peekNextDailyNumber: vi.fn(() => Promise.resolve(9)),
  subscribeSettings: vi.fn((cb) => {
    // 'uniti': due tap sullo stesso prodotto sommano la quantità.
    cb({
      payments_reader_enabled: false,
      sumup_reader_id: null,
      order_group_default: 'uniti',
      groups_enabled: true, // i gruppi sono opzionali: qui accesi
    })
    return () => {}
  }),
  DEFAULT_SETTINGS: {},
  settingsIniziali: () => ({}),
  advanceComanda: vi.fn(() => Promise.resolve()),
  addComanda: vi.fn(() => Promise.resolve({ comande: [] })),
  bartenderUpdateComanda: vi.fn(() => Promise.resolve()),
  updateOrderInfo: vi.fn(() => Promise.resolve()),
  cancelOrder: vi.fn(() => Promise.resolve()),
  fetchInventoryItems: vi.fn(() => Promise.resolve([])),
  registerPayment: vi.fn(() => Promise.resolve({ closed: true })),
  setOrderDiscount: vi.fn(() => Promise.resolve()),
  setOrderLotteryCode: vi.fn(() => Promise.resolve()),
  createInvoice: vi.fn(() => Promise.resolve({ id: 'inv1', number: '1/2026' })),
  markInvoiceSent: vi.fn(() => Promise.resolve()),
  subscribeVouchers: vi.fn((cb) => { cb([]); return () => {} }),
  applyVoucherDiscount: vi.fn(() => Promise.resolve({ redeemed: 0 })),
  // Senza cassa aperta il POS non fa battere ordini: qui la cassa è aperta.
  subscribeOpenCashSession: vi.fn((cb) => {
    cb({ id: 'cash1', status: 'open', opened_at: '2026-08-08T18:00:00.000Z' })
    return () => {}
  }),
}))
vi.mock('../../src/lib/pendingOrders.js', () => ({
  submitPosOrder: vi.fn(),
}))
vi.mock('../../src/lib/paymentsApi.js', () => ({
  readerCheckout: vi.fn(() => Promise.resolve({})),
}))
// Mock PARZIALE: le regole di printer.js (quali comande si stampano) sono
// logica pura e la schermata le usa per davvero — a finte restano solo le
// funzioni che vorrebbero una stampante.
vi.mock('../../src/lib/printer.js', async (originale) => ({
  ...(await originale()),
  printScontrino: vi.fn(() => Promise.resolve()),
  printComanda: vi.fn(() => Promise.resolve()),
  printComande: vi.fn(() => Promise.resolve(0)),
  printFattura: vi.fn(() => Promise.resolve()),
  loadPrinterSettings: vi.fn(() => ({})),
}))
vi.mock('../../src/lib/menuCache.js', () => ({
  useMenu: () => ({
    drinks: [
      { id: 'mojito', name: 'Mojito', price: 7, available: true, category_id: 'cat1' },
      { id: 'gin', name: 'Gin Tonic', price: 8, available: true, category_id: 'cat1' },
    ],
    cats: [{ id: 'cat1', name: 'Cocktail', sort_order: 0 }],
    loading: false,
  }),
}))
vi.mock('../../src/lib/firebaseClient.js', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(() => () => {}),
}))

import PosPage from '../../src/pages/PosPage.jsx'
import { submitPosOrder } from '../../src/lib/pendingOrders.js'
import {
  createOrder,
  updateOrderInfo,
  subscribeSettings,
  cancelOrder,
  bartenderUpdateComanda,
} from '../../src/lib/api.js'
import { printComanda } from '../../src/lib/printer.js'

// LA CASSA SI APRE IN DUE TEMPI. Al primo disegno il numero del conto
// ancora non c'e' — si scrive «#…» — e insieme a lui stanno arrivando gli
// ultimi prodotti battuti. Aspettare che il numero vero sia a schermo e'
// aspettare la cassa pronta, quella che vede chi ci lavora: senza, i test
// asserivano su mezza schermata e i due aggiornamenti cadevano fuori dal
// test, che e' quello che React segnala con l'avviso «act».
const cassaPronta = () => screen.findAllByText('#9')

async function mount() {
  // Il carrello persiste in localStorage: pulito per ogni test.
  localStorage.clear()
  const utils = render(
    <MemoryRouter>
      <PosPage />
    </MemoryRouter>
  )
  await cassaPronta()
  return utils
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cassa: layout identico al dettaglio ordine', () => {
  it('categorie a sinistra, griglia al centro, ORDINE a destra', async () => {
    await mount()
    expect(screen.getByRole('button', { name: 'Cocktail' })).toBeInTheDocument()
    expect(screen.getByText('Gin Tonic')).toBeInTheDocument()
    // La testata porta il PROGRESSIVO previsto, mai una parola al suo posto:
    // "Nuovo ordine" che diventava "#9" faceva ballare tutta la riga.
    expect(screen.getAllByText(/^#(9|…)$/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Tocca i prodotti per aggiungerli/)).toBeInTheDocument()
    // stessi elementi del dettaglio: prodotto libero e dati conto ripiegabili
    expect(screen.getByRole('button', { name: /Prodotto libero/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dati conto/ })).toBeInTheDocument()
  })

  it('tap sulla griglia → riga a destra con +/− e totale live', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByText('Mojito'))
    await user.click(screen.getAllByText('Mojito')[0])
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.getByText('14,00 €')).toBeInTheDocument()
  })
})

describe('creazione: ordine creato al primo item, nome chiesto alla chiusura', () => {
  it('aggiungere un item CREA subito l’ordine (createOrder) con quegli item', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByText('Mojito'))
    // l'ordine si crea da solo poco dopo l'aggiunta (senza cliccare Conferma)
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    expect(createOrder.mock.calls[0][0].items).toEqual([
      expect.objectContaining({ drink_id: 'mojito', qty: 1 }),
    ])
  })

  it('alla chiusura di un ordine appena creato chiede il nome e lo salva', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByText('Mojito'))
    await user.click(screen.getByRole('button', { name: /Torna agli ordini/ }))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    // l'ordine creato non ha nome → lo si chiede una volta
    await user.type(await screen.findByLabelText('Nome'), 'iole')
    await user.click(screen.getByRole('button', { name: /^Salva$/ }))
    expect(updateOrderInfo).toHaveBeenCalledWith('ord-nuovo', { customer_name: 'iole' })
  })

  it('chiusura senza nome: nessun nome salvato (resta il progressivo)', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByText('Mojito'))
    await user.click(screen.getByRole('button', { name: /Torna agli ordini/ }))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    await user.click(await screen.findByRole('button', { name: /Salva senza nome/ }))
    expect(updateOrderInfo).not.toHaveBeenCalled()
  })

})

describe('pagamento diretto dal POS', () => {
  it('💳 Pagamento apre SUBITO la schermata: la creazione va in background', async () => {
    const user = userEvent.setup()
    // server lento: la creazione non risolve mai, la UI non deve aspettarla
    createOrder.mockImplementationOnce(() => new Promise(() => {}))
    await mount()
    await user.click(screen.getByText('Mojito'))
    await user.click(screen.getByRole('button', { name: /Pagamento/ }))
    // schermata aperta all'istante sull'ordine LOCALE (totale già giusto)
    expect(screen.getByRole('dialog', { name: 'Pagamento' })).toBeInTheDocument()
    expect(screen.getByTestId('pay-amount')).toHaveTextContent('7,00')
    expect(screen.getByRole('button', { name: /Riscuotere/ })).toBeInTheDocument()
  })

  it('la creazione in background parte da «ricevuto», come le altre', async () => {
    // Anche col pagamento diretto il conto nasce da fare: chi lo batte non
    // ha ancora versato niente, e chi prepara lo prende quando comincia.
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByText('Mojito'))
    await user.click(screen.getByRole('button', { name: /Pagamento/ }))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    expect(createOrder.mock.calls[0][0]).toMatchObject({
      status: 'ricevuto',
    })
  })
})

describe('ricerca prodotti', () => {
  it('la barra di ricerca filtra la griglia prodotti', async () => {
    const user = userEvent.setup()
    await mount()
    await user.type(screen.getByLabelText('Cerca prodotto'), 'gin')
    expect(screen.getByText('Gin Tonic')).toBeInTheDocument()
    expect(screen.queryByText('Mojito')).not.toBeInTheDocument()
  })
})

describe('conto di gruppo dal POS', () => {
  const mountGroup = async (id) => {
    localStorage.clear()
    const utils = render(
      <MemoryRouter initialEntries={[`/pos?group=${id}`]}>
        <PosPage />
      </MemoryRouter>
    )
    await cassaPronta()
    return utils
  }

  it('mostra il gruppo e ci associa l’ordine creato', async () => {
    const user = userEvent.setup()
    await mountGroup('g1')
    expect(screen.getByText(/Tavolo 4/)).toBeInTheDocument()
    await user.click(screen.getByText('Mojito'))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    const arg = createOrder.mock.calls[0][0]
    expect(arg.group_id).toBe('g1')
    expect(arg.group_name_snapshot).toBe('Tavolo 4')
  })

  it('un gruppo CONTENITORE non può avere ordini diretti: avvisa', async () => {
    await mountGroup('g2')
    expect(screen.getByText(/contiene altri gruppi/)).toBeInTheDocument()
  })

  it('si può associare un gruppo anche senza arrivarci dal gruppo', async () => {
    const user = userEvent.setup()
    await mount() // POS normale, nessun ?group=
    await user.click(screen.getByRole('button', { name: /Associa a gruppo/ }))
    await user.click(screen.getByRole('button', { name: /Tavolo 4/ }))
    await user.click(screen.getByText('Mojito'))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    expect(createOrder.mock.calls[0][0].group_id).toBe('g1')
  })

  it('un gruppo CONTENITORE non è fra quelli scegliibili', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByRole('button', { name: /Associa a gruppo/ }))
    expect(screen.getByRole('button', { name: /Tavolo 4/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Compleanno/ })).not.toBeInTheDocument()
  })

  it('senza gruppo l’ordine non ne porta nessuno', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByText('Mojito'))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    expect(createOrder.mock.calls[0][0].group_id).toBeNull()
  })
})

describe('gestione preparazione opzionale', () => {
  const mountConWorkflow = async (on) => {
    localStorage.clear()
    subscribeSettings.mockImplementation((cb) => {
      cb({ order_group_default: 'uniti', workflow_enabled: on, service_mode: 'banco' })
      return () => {}
    })
    const utils = render(
      <MemoryRouter>
        <PosPage />
      </MemoryRouter>
    )
    await cassaPronta()
    return utils
  }

  // Nasceva «in preparazione»: l'idea era che chi lo batte al banco lo stia
  // già facendo. Ma si battono tre conti di fila e poi si comincia a
  // versare — e nelle corsie «Da fare» restava sempre vuota mentre tutto
  // compariva «Al banco». È «Lo preparo io» a dire quando si comincia.
  it('ATTIVA: l’ordine nasce «ricevuto», da fare', async () => {
    const user = userEvent.setup()
    await mountConWorkflow(true)
    await user.click(screen.getByText('Mojito'))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    expect(createOrder.mock.calls[0][0].status).toBe('ricevuto')
  })

  it('SPENTA: l’ordine nasce e resta "ricevuto"', async () => {
    const user = userEvent.setup()
    await mountConWorkflow(false)
    await user.click(screen.getByText('Mojito'))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    expect(createOrder.mock.calls[0][0].status).toBe('ricevuto')
  })

  it('il POS eredita la modalità di consegna del locale', async () => {
    const user = userEvent.setup()
    await mountConWorkflow(true)
    await user.click(screen.getByText('Mojito'))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    expect(createOrder.mock.calls[0][0].service_mode).toBe('banco')
  })
})

// USCITA DAL POS: "← Ordini" deve riportare alla coda. Segnalato da Flavio:
// creato un conto e lasciato lì, premendo la freccia non si tornava alla
// lista degli ordini.
describe('uscita dal POS', () => {
  const mount = async () => {
    const utils = render(
      <MemoryRouter initialEntries={['/pos']}>
        <PosPage />
      </MemoryRouter>
    )
    await cassaPronta()
    return utils
  }

  beforeEach(() => {
    vi.clearAllMocks()
    navigateSpy.mockClear()
  })

  it('senza niente in bozza torna subito alla coda', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByRole('button', { name: /Torna agli ordini/ }))
    expect(navigateSpy).toHaveBeenCalledWith('/bar')
  })

  it('col conto appena creato: dopo il nome torna alla coda', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByText('Mojito'))
    await user.click(screen.getByRole('button', { name: /Torna agli ordini/ }))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    await user.type(await screen.findByLabelText('Nome'), 'iole')
    await user.click(screen.getByRole('button', { name: /^Salva$/ }))
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/bar'))
  })

  it('e anche scegliendo di non dare un nome', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByText('Mojito'))
    await user.click(screen.getByRole('button', { name: /Torna agli ordini/ }))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    await user.click(await screen.findByRole('button', { name: /Salva senza nome/ }))
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/bar'))
  })
})

// APERTURA DI UN NUOVO ORDINE: niente scritte che si trasformano.
// Il progressivo si legge dal contatore, che risponde un istante dopo: prima
// la testata diceva "Nuovo ordine" e poi diventava "#9", e tutto quello che
// stava accanto scivolava di lato mentre lo si guardava.
describe('testata del nuovo ordine', () => {
  beforeEach(() => localStorage.clear())

  it('non scrive mai "Nuovo ordine"', async () => {
    render(
      <MemoryRouter initialEntries={['/pos']}>
        <PosPage />
      </MemoryRouter>
    )
    expect(screen.queryByText(/Nuovo ordine/)).toBeNull()
    await waitFor(() => expect(screen.getAllByText('#9').length).toBeGreaterThan(0))
  })

  it('la seconda volta il numero c’è già, senza segnaposto', async () => {
    const primo = render(
      <MemoryRouter initialEntries={['/pos']}>
        <PosPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getAllByText('#9').length).toBeGreaterThan(0))
    primo.unmount()
    render(
      <MemoryRouter initialEntries={['/pos']}>
        <PosPage />
      </MemoryRouter>
    )
    // Subito, senza aspettare la lettura del contatore.
    expect(screen.getAllByText('#9').length).toBeGreaterThan(0)
    // …e poi la lettura arriva lo stesso: si aspetta qui, se no atterra a
    // test finito.
    await cassaPronta()
  })
})

// LA RIGA APPENA AGGIUNTA NON SI RICREA.
// In creazione l'item nasce in bozza e un attimo dopo diventa item confermato
// dell'ordine appena creato. Se in quel passaggio cambia la chiave React, il
// nodo viene distrutto e ricostruito: la riga "rimbalza" e rifà l'effetto di
// comparsa. La chiave della bozza viaggia con l'item, quindi resta la stessa.
describe('primo item: la riga resta la stessa', () => {
  it('la chiave della riga non cambia quando l’ordine viene creato', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/pos']}>
        <PosPage />
      </MemoryRouter>
    )
    await user.click(screen.getByText('Mojito'))
    const riga = document.querySelector('.draft-line[data-line-key]')
    const chiavePrima = riga.getAttribute('data-line-key')
    expect(chiavePrima).toMatch(/^d:/)

    // L'ordine viene creato: l'item passa da bozza a confermato.
    await waitFor(() => expect(createOrder).toHaveBeenCalled())
    const inviati = createOrder.mock.calls.at(-1)[0].items
    // Il line_id viaggia con l'item, ed è quello che tiene ferma la riga.
    expect(inviati[0].line_id).toBe(chiavePrima.slice(2))
  })
})

// IL BOX DEL NOME È MODALE: si esce solo dalla ✕ o salvando.
// Un tocco a vuoto sullo schermo non deve far sparire la domanda — al banco
// capita di appoggiare il dito di striscio, e poi non si sa più se il nome
// è stato messo o no.
describe('box del nome: modale', () => {
  const apri = async (user) => {
    render(
      <MemoryRouter initialEntries={['/pos']}>
        <PosPage />
      </MemoryRouter>
    )
    await user.click(screen.getByText('Mojito'))
    await user.click(screen.getByRole('button', { name: /Torna agli ordini/ }))
    return screen.findByRole('dialog', { name: /Nome del conto/ })
  }

  it('cliccando fuori resta aperto', async () => {
    const user = userEvent.setup()
    const box = await apri(user)
    await user.click(box.parentElement) // lo sfondo scuro
    expect(screen.getByRole('dialog', { name: /Nome del conto/ })).toBeInTheDocument()
  })

  it('la ✕ chiude e prosegue verso la lista ordini', async () => {
    const user = userEvent.setup()
    await apri(user)
    await user.click(screen.getByRole('button', { name: /Chiudi senza dare un nome/ }))
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/bar'))
    expect(updateOrderInfo).not.toHaveBeenCalled()
  })
})

// IL BOX DEL NOME NON ASPETTA LA CREAZIONE. Prima si aspettava che il conto
// fosse nato per sapere se chiedere il nome — e siccome il nome lo si sa già
// dalla schermata (è quello che si è scritto, o non si è scritto, lì),
// l'unica cosa che quell'attesa produceva era il box in ritardo: al banco,
// col server lento, secondi buoni con la schermata ferma.
describe('uscire dal conto non aspetta il server', () => {
  it('il box del nome compare subito, la creazione va avanti da sé', async () => {
    const user = userEvent.setup()
    // La creazione non risponde: prima bastava a tenere fermo tutto.
    createOrder.mockImplementationOnce(() => new Promise(() => {}))
    await mount()
    await user.click(screen.getByText('Mojito'))
    await user.click(screen.getByRole('button', { name: /Torna agli ordini/ }))
    expect(await screen.findByLabelText('Nome')).toBeInTheDocument()
  })

})

// IL CONTO NUOVO NON EREDITA NIENTE. La bozza è persistente apposta — le
// righe non confermate non si perdono uscendo — ma quando quelle righe sono
// ANDATE (in un conto creato, o in pagamento) la copia salvata va
// dimenticata subito: restava lì, e il conto dopo si apriva con dentro la
// roba appena battuta, pronta a essere battuta due volte.
describe('la bozza si consuma quando le righe partono', () => {
  it('creando il conto, la copia salvata sparisce subito', async () => {
    const user = userEvent.setup()
    // La creazione non risponde: la copia salvata deve sparire lo stesso.
    createOrder.mockImplementationOnce(() => new Promise(() => {}))
    await mount()
    await user.click(screen.getByText('Mojito'))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(localStorage.getItem('tana:draft:new')).toBeNull()
  })

  it('ma a schermo le righe restano: la pagina non deve sembrare resettata', async () => {
    const user = userEvent.setup()
    createOrder.mockImplementationOnce(() => new Promise(() => {}))
    await mount()
    await user.click(screen.getByText('Mojito'))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1), { timeout: 2000 })
    // La riga del conto è ancora lì, col suo prezzo.
    expect(screen.getAllByText('Mojito').length).toBeGreaterThan(1)
  })

  it('mandando le righe in pagamento, idem', async () => {
    const user = userEvent.setup()
    createOrder.mockImplementationOnce(() => new Promise(() => {}))
    await mount()
    await user.click(screen.getByText('Mojito'))
    await user.click(screen.getByRole('button', { name: /Pagamento/ }))
    await waitFor(() => expect(localStorage.getItem('tana:draft:new')).toBeNull())
  })
})

// ANNULLARE LASCIA SEMPRE UN CONTO ANNULLATO, anche se l'ordine non era
// ancora nato: il numero è già stato mostrato e preso, e di quello che è
// stato battuto deve restare traccia — un conto sparito nel nulla non si può
// nemmeno controllare.
describe('annullare un conto appena battuto', () => {
  it('crea il conto e lo annulla: nella lista annullati ci deve essere', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByText('Mojito'))
    await user.click(screen.getByRole('button', { name: /Annulla ordine/ }))
    // Nel box di conferma, il tasto che conferma davvero.
    const conferme = screen.getAllByRole('button', { name: /^Annulla ordine$/ })
    await user.click(conferme[conferme.length - 1])
    await waitFor(() => expect(createOrder).toHaveBeenCalled())
    await waitFor(() => expect(cancelOrder).toHaveBeenCalled())
    expect(navigateSpy).toHaveBeenCalledWith('/bar')
  })
})

// SU UN CONTO VUOTO «ANNULLA» È LA VIA D'USCITA. Era spento finché non si
// batteva qualcosa: chi apriva il conto per sbaglio — o cambiava idea prima
// di battere — si trovava l'unico tasto d'uscita disabilitato, e doveva
// cercare la freccia in alto.
describe('annullare un conto in creazione', () => {
  // I tasti «annulla» sono due — il pannello e la barra azioni — e avevano
  // due regole diverse: quello della barra restava spento per tutta la
  // creazione, anche a righe battute. Si controllano TUTTI, o la prossima
  // volta ne resta indietro uno.
  const tastiAnnulla = () =>
    screen.getAllByRole('button', { name: /^Annulla/ })

  it('senza righe è acceso, e riporta in coda senza chiedere niente', async () => {
    const user = userEvent.setup()
    await mount()
    await waitFor(() => expect(tastiAnnulla().length).toBeGreaterThan(0))
    tastiAnnulla().forEach((b) => expect(b).not.toBeDisabled())
    await user.click(tastiAnnulla()[0])
    // Niente da buttare, niente da confermare: si esce.
    expect(navigateSpy).toHaveBeenCalledWith('/bar')
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('con le righe battute resta acceso e chiede conferma', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByText('Mojito'))
    tastiAnnulla().forEach((b) => expect(b).not.toBeDisabled())
    await user.click(tastiAnnulla()[0])
    expect(await screen.findByText(/Annullare l’ordine\?|Annullare l'ordine\?/)).toBeInTheDocument()
  })
})

// ── IL PAGAMENTO MENTRE IL SERVER TACE (BUG-017) ─────────────────────
//
// La serata vera: si battono due prodotti di corsa, si apre il pagamento
// PRIMA che la creazione in sottofondo sia risposta, si chiude, si batte
// ancora, si riapre. Prima il pagamento mostrava solo il primo giro di
// righe — il conto nasceva con quelle congelate al tocco, e alla risposta
// del server la bozza si svuotava buttando anche il resto: la schermata
// restava VUOTA e le righe nuove non arrivavano mai. Il pagamento deve
// leggere il conto com'è A SCHERMO (regola di casa, docs/architettura.md),
// e quello che si batte nel frattempo deve raggiungere il conto appena
// il server si fa vivo.

// L'ordine che il server restituirebbe per la creazione richiesta: le
// righe sono QUELLE della richiesta (line_id compreso, che è l'identità
// con cui la schermata riconosce le sue righe).
const ordineDaParams = (params) => ({
  id: 'ord-nuovo',
  daily_number: 9,
  status: 'aperto',
  payment_status: 'non_richiesto',
  total: params.items.reduce((s, i) => s + i.qty * i.price, 0),
  payments: [],
  discount_amount: 0,
  customer_name: params.customer_name ?? null,
  table_label: params.table_label ?? null,
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: params.status || 'in_preparazione',
      status_times: {},
      items: params.items.map((i) => ({
        drink_id: i.drink_id,
        name: i.name,
        unit_price: i.price,
        qty: i.qty,
        ...(i.line_id ? { line_id: i.line_id } : {}),
      })),
    },
  ],
  order_items: params.items.map((i) => ({
    drink_id: i.drink_id,
    name: i.name,
    unit_price: i.price,
    qty: i.qty,
  })),
})

describe('il pagamento mentre il server tace (BUG-017)', () => {
  it('due prodotti di corsa e Pagamento: ci sono tutti e due, col totale giusto', async () => {
    const user = userEvent.setup()
    // Il server non risponde MAI: il pagamento non deve accorgersene.
    createOrder.mockImplementationOnce(() => new Promise(() => {}))
    await mount()
    await user.click(screen.getAllByText('Mojito')[0])
    await user.click(screen.getAllByText('Gin Tonic')[0])
    await user.click(screen.getAllByRole('button', { name: /Pagamento/ })[0])

    const pagamento = await screen.findByRole('dialog', { name: 'Pagamento' })
    expect(within(pagamento).getByText(/Mojito/)).toBeInTheDocument()
    expect(within(pagamento).getByText(/Gin Tonic/)).toBeInTheDocument()
    // 7 € + 8 €: il totale conta TUTTE le righe battute.
    expect(screen.getByTestId('pay-amount')).toHaveTextContent('15,00')
  })

  it('chiudi, batti ancora, riapri: c’è tutto — e alla risposta arriva tutto al conto', async () => {
    const user = userEvent.setup()
    let rispondeIlServer
    createOrder.mockImplementationOnce(
      (params) =>
        new Promise((res) => {
          rispondeIlServer = () => res(ordineDaParams(params))
        })
    )
    await mount()
    // Si battono Mojito e Gin Tonic e si apre subito il pagamento.
    await user.click(screen.getAllByText('Mojito')[0])
    await user.click(screen.getAllByText('Gin Tonic')[0])
    await user.click(screen.getAllByRole('button', { name: /Pagamento/ })[0])
    await screen.findByRole('dialog', { name: 'Pagamento' })
    expect(screen.getByTestId('pay-amount')).toHaveTextContent('15,00')

    // Il cliente aggiunge qualcosa: si chiude senza incassare. La schermata
    // NON deve essere vuota — è il conto, con le sue righe.
    await user.click(screen.getByRole('button', { name: /Chiudi/ }))
    expect(screen.getAllByText('Mojito').length).toBeGreaterThan(1)
    expect(screen.getAllByText('Gin Tonic').length).toBeGreaterThan(1)

    // Si batte il terzo prodotto e si riapre il pagamento: ci sono tutti.
    await user.click(screen.getAllByText('Mojito')[0])
    await user.click(screen.getAllByRole('button', { name: /Pagamento/ })[0])
    const pagamento = await screen.findByRole('dialog', { name: 'Pagamento' })
    expect(within(pagamento).getByText(/Gin Tonic/)).toBeInTheDocument()
    expect(screen.getByTestId('pay-amount')).toHaveTextContent('22,00')

    // ORA il server risponde — con le sole righe del primo giro. Le altre
    // non devono sparire: raggiungono il conto come aggiunte.
    rispondeIlServer()
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled(), { timeout: 3000 })
    const items = bartenderUpdateComanda.mock.calls.at(-1)[2].items
    const mojito = items
      .filter((i) => i.drink_id === 'mojito')
      .reduce((s, i) => s + (Number(i.qty) || 0), 0)
    expect(mojito).toBe(2)
    expect(items.some((i) => i.drink_id === 'gin')).toBe(true)
    // Il pagamento è rimasto aperto, sempre col conto intero.
    expect(within(pagamento).getByText(/Gin Tonic/)).toBeInTheDocument()
    expect(screen.getByTestId('pay-amount')).toHaveTextContent('22,00')
    // E il conto è UNO solo: niente doppioni alla riapertura.
    expect(createOrder).toHaveBeenCalledTimes(1)
  })

  it('il prezzo ritoccato mentre l’ordine nasce non torna di listino, nemmeno uscendo subito', async () => {
    const user = userEvent.setup()
    let rispondeIlServer
    createOrder.mockImplementationOnce(
      (params) =>
        new Promise((res) => {
          rispondeIlServer = () => res(ordineDaParams(params))
        })
    )
    const { unmount } = await mount()
    await user.click(screen.getAllByText('Mojito')[0])
    // L'auto-creazione parte col prezzo di listino (7 €)…
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1), { timeout: 2000 })
    // …e mentre è in volo si ritocca il prezzo della riga.
    await user.click(screen.getAllByTitle(/Modifica Mojito/).at(-1))
    const prezzo = await screen.findByLabelText(/Prezzo/)
    await user.clear(prezzo)
    await user.type(prezzo, '12')
    await user.click(screen.getByRole('button', { name: /^Salva/ }))
    // Via subito, senza aspettare la risposta.
    unmount()

    // Il server risponde a schermata già chiusa: la correzione parte da
    // sola, e il conto porta 12 €, non 7.
    rispondeIlServer()
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled(), { timeout: 3000 })
    const items = bartenderUpdateComanda.mock.calls.at(-1)[2].items
    expect(items.some((i) => Number(i.unit_price) === 12)).toBe(true)
    expect(items.some((i) => Number(i.unit_price) === 7)).toBe(false)
  })
})

// ── IN SVILUPPO (StrictMode) COME AL BANCO ───────────────────────────
// StrictMode monta, finge di smontare e rimonta: un riferimento «sono
// montato?» rimasto a false spegneva il passaggio a modifica, e sugli
// emulatori la schermata restava «in creazione» per sempre — righe orfane,
// pagamento col solo primo giro, conto vuoto. I sintomi del banco, ma
// sempre. Qui si prova la creazione dentro StrictMode vero.
describe('in sviluppo (StrictMode) la creazione funziona come al banco', () => {
  it('l’ordine nato passa a modifica anche col montaggio doppio', async () => {
    const user = userEvent.setup()
    localStorage.clear()
    render(
      <StrictMode>
        <MemoryRouter>
          <PosPage />
        </MemoryRouter>
      </StrictMode>
    )
    await user.click(screen.getAllByText('Mojito')[0])
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1), { timeout: 2000 })
    // La schermata è diventata la modifica del conto: la comanda c'è.
    expect(await screen.findByRole('button', { name: /Comande \(1\)/ })).toBeInTheDocument()
  })
})

// ── PAGAMENTO CHIUSO, SI CONTINUA A BATTERE (server già risposto) ─────
//
// Si battono i primi drink, si apre il pagamento, si chiude perché il
// cliente aggiunge qualcosa, si batte ancora e si riapre il pagamento: i
// prodotti nuovi non c'erano. Il pagamento diretto CREA il conto, ma la
// schermata restava «in creazione» con un conto vero dietro: le righe
// battute dopo finivano in un altro cassetto.
describe('battere ancora dopo aver chiuso il pagamento (server già risposto)', () => {
  it('le righe aggiunte dopo si ritrovano riaprendo il pagamento', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByText('Mojito'))
    await user.click(screen.getAllByRole('button', { name: /Paga/ })[0])
    await screen.findByRole('dialog', { name: /Pagamento/ })
    // Il conto è nato: da qui in poi questa schermata è la sua MODIFICA.
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: /Chiudi/ }))
    await user.click(screen.getByText('Gin Tonic'))
    await user.click(screen.getAllByRole('button', { name: /Paga|Pagamento/ })[0])

    const pagamento = await screen.findByRole('dialog', { name: /Pagamento/ })
    expect(within(pagamento).getByText(/Mojito/)).toBeInTheDocument()
    expect(within(pagamento).getByText(/Gin Tonic/)).toBeInTheDocument()
    // E il conto è UNO: il secondo giro non ne apre un altro.
    expect(createOrder).toHaveBeenCalledTimes(1)
  })
})
