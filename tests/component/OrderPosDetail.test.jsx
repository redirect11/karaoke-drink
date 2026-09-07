// @vitest-environment happy-dom
'use strict'

// Test di COMPONENTE del dettaglio ordine POS (OrderPosDetail): monta il
// componente vero con React Testing Library e verifica ciò che il bartender
// vede e tocca. Firebase/menu/stampante sono mockati.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { MemoryRouter } from '../helpers/router.jsx'
import '@testing-library/jest-dom/vitest'

// ── Mock dei moduli con dipendenze Firebase/hardware ──
const mockSettings = { payments_reader_enabled: false, sumup_reader_id: null }
vi.mock('../../src/lib/api.js', () => ({
  advanceComanda: vi.fn(() => Promise.resolve()),
  addComanda: vi.fn(() => Promise.resolve({ comande: [] })),
  chiudiCreazione: vi.fn(),
  bartenderUpdateComanda: vi.fn(() => Promise.resolve()),
  updateOrderInfo: vi.fn(() => Promise.resolve()),
  registerPayment: vi.fn(() => Promise.resolve({ closed: true })),
  setOrderDiscount: vi.fn(() => Promise.resolve()),
  setOrderLotteryCode: vi.fn(() => Promise.resolve()),
  createInvoice: vi.fn(() => Promise.resolve({ id: 'inv1', number: '1/2026' })),
  markInvoiceSent: vi.fn(() => Promise.resolve()),
  subscribeVouchers: vi.fn((cb) => { cb([]); return () => {} }),
  applyVoucherDiscount: vi.fn(() => Promise.resolve({ redeemed: 0 })),
  cancelOrder: vi.fn(() => Promise.resolve()),
  restoreOrder: vi.fn(() => Promise.resolve()),
  fetchInventoryItems: vi.fn(() => Promise.resolve([])),
  // Usati solo in creazione (order == null): qui no-op.
  createOrder: vi.fn(() => Promise.resolve({ id: 'ord-nuovo' })),
  ensureTodaySerata: vi.fn(() => Promise.resolve({ id: 'serata1' })),
  subscribeOrder: vi.fn(() => () => {}),
  fetchRecentDrinkIds: vi.fn(() => Promise.resolve([])),
  subscribePosPrefs: vi.fn(() => () => {}),
  savePosOrder: vi.fn(() => Promise.resolve()),
  savePosFavorites: vi.fn(() => Promise.resolve()),
  DEFAULT_SETTINGS: {},
  settingsIniziali: () => ({}),
  peekNextDailyNumber: vi.fn(() => Promise.resolve(5)),
  setOrderServiceMode: vi.fn(() => Promise.resolve({})),
  preparazioneParziale: vi.fn(() => Promise.resolve()),
  subscribeSettings: vi.fn((cb) => {
    cb(mockSettings)
    return () => {}
  }),
}))
vi.mock('../../src/lib/pendingOrders.js', () => ({ submitPosOrder: vi.fn() }))
vi.mock('../../src/lib/firebaseClient.js', () => ({ auth: {} }))
// CHI GUARDA IL CONTO lo decide il singolo test. Di suo è il banco, che è
// il caso di quasi tutti i test qui sotto; la sala ha una schermata più
// stretta (REQ-STAFF-014) e ha il suo blocco in fondo.
let ruoloCorrente = 'bartender'
// IL RUOLO ARRIVA IN RITARDO, anche qui. `onAuthStateChanged` chiama subito
// il suo callback, ma dentro c'e' un `await` sul token: la schermata nasce
// senza sapere chi la guarda e lo scopre un attimo dopo. Questa e' quella
// promessa, e serve ai test per aspettare la cosa giusta (vedi `mount`).
let consegnaRuolo = null
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((a, cb) => {
    consegnaRuolo = cb({
      uid: 'u1',
      email: 'chi@tana.local',
      displayName: 'Chi lavora',
      getIdTokenResult: () => Promise.resolve({ claims: { role: ruoloCorrente } }),
    })
    return () => {}
  }),
}))
vi.mock('../../src/lib/paymentsApi.js', () => ({
  readerCheckout: vi.fn(() => Promise.resolve({})),
}))
vi.mock('../../src/lib/menuCache.js', () => ({
  useMenu: () => ({
    drinks: [
      { id: 'mojito', name: 'Mojito', price: 7, available: true, category_id: 'cat1' },
      {
        id: 'gin',
        name: 'Gin Tonic',
        price: 8,
        available: true,
        category_id: 'cat1',
        recipe_items: [{ inventory_item_id: 'inv-gin', name: 'Gin', qty: 40, unit: 'ml' }],
      },
    ],
    cats: [{ id: 'cat1', name: 'Cocktail', sort_order: 0 }],
    loading: false,
  }),
}))
// La stampante è finta ma le REGOLE sono quelle vere: `comandeStampabili`
// e `printComande` arrivano dal modulo autentico (printComande gira sopra
// il printComanda finto, che è quello che si conta).
vi.mock('../../src/lib/printer.js', async (originale) => ({
  ...(await originale()),
  printComanda: vi.fn(() => Promise.resolve()),
  printComande: vi.fn(() => Promise.resolve(2)),
  printComandaUnita: vi.fn(() => Promise.resolve()),
  printScontrino: vi.fn(() => Promise.resolve()),
  printFattura: vi.fn(() => Promise.resolve()),
  loadPrinterSettings: vi.fn(() => ({})),
  releaseReceiptPrint: vi.fn(),
  scontrinoGiaUscito: vi.fn(() => false),
}))

import OrderPosDetail from '../../src/components/OrderPosDetail.jsx'
import {
  advanceComanda,
  addComanda,
  bartenderUpdateComanda,
  chiudiCreazione,
  registerPayment,
  updateOrderInfo,
  cancelOrder,
  createOrder,
  restoreOrder,
  preparazioneParziale,
  setOrderServiceMode,
} from '../../src/lib/api.js'
import { readerCheckout } from '../../src/lib/paymentsApi.js'
import { printComanda, printComande, printComandaUnita } from '../../src/lib/printer.js'

// IL CONTO DI PROVA NASCE «DA FARE», come nasce davvero: si battono tre
// conti di fila e poi si comincia a versare. Era «in preparazione» da
// quando le righe aggiunte confluivano nella prima comanda toccabile,
// qualunque passo avesse — la regola che ha causato BUG-024.
const baseOrder = (over = {}) => ({
  id: 'ord1',
  daily_number: 4,
  status: 'aperto',
  workflow_status: 'ricevuto',
  payment_status: 'non_richiesto',
  customer_name: 'iole',
  table_label: '3',
  note: null,
  total: 14,
  coperto_amount: 0,
  service_charge_amount: 0,
  tip_amount: 0,
  order_items: [
    { id: 'ord1-0', drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2, custom: false },
  ],
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: 'ricevuto',
      status_times: {},
      created_at: '2026-07-11T21:00:00.000Z',
      items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
    },
  ],
  ...over,
})

// APRIRE UN CONTO NON FINISCE COL PRIMO DISEGNO: la schermata parte, e poi
// arrivano chi la guarda (il ruolo, dal token) e gli ultimi prodotti
// battuti. Sono due letture asincrone, e finche' non atterrano il conto e'
// a meta' — per la schermata chi guarda non e' nessuno, quindi i passi
// della preparazione non ci sono ancora. Aspettarle qui e' aspettare
// quello che vede davvero chi apre il conto; senza, ogni test asseriva su
// mezza schermata e l'aggiornamento arrivava a test finito, che e' quello
// che React segnala con l'avviso «act».
async function mount(order) {
  const utils = render(
    <MemoryRouter>
      <OrderPosDetail order={order} />
    </MemoryRouter>
  )
  await avvioDelConto()
  return utils
}

// `consegnaRuolo` c'e' quando il token e' stato chiesto (vedi il mock di
// firebase/auth): waitFor lo aspetta DENTRO il test, e con lui atterra
// anche l'altra lettura d'avvio.
const avvioDelConto = () => waitFor(() => expect(consegnaRuolo).not.toBeNull())

// I tasti in fondo al conto. Serve cercarli QUI dentro: la finestra del
// ripristino ha un tasto che si chiama come quello che l'ha aperta, e
// cercandolo in tutta la pagina se ne trovano due.
const azioni = () => within(document.querySelector('.posd-foot-azioni'))

beforeEach(() => {
  vi.clearAllMocks()
  ruoloCorrente = 'bartender'
  // La bozza è persistita in localStorage per ordine: pulisco tra i test.
  localStorage.clear()
})

describe('vista aggregata: ordine a destra, comande nascoste', () => {
  it("mostra i prodotti dell'ORDINE aggregato, non le singole comande", async () => {
    await mount(baseOrder())
    // testata colonna ordine: numero + nome del conto (spostati a destra)
    expect(screen.getAllByText(/#4/).length).toBeGreaterThan(0)
    expect(screen.getByText(/· iole/)).toBeInTheDocument()
    // destra: l'ordine aggregato (niente sezioni COMANDA in vista)
    expect(screen.queryByText(/COMANDA 1/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/Mojito/).length).toBeGreaterThan(0)
    // accesso alle comande dal bottone dedicato
    expect(screen.getByRole('button', { name: /Comande \(1\)/ })).toBeInTheDocument()
    // centro: griglia visibile contemporaneamente
    expect(screen.getByText('Gin Tonic')).toBeInTheDocument()
  })

  it('conto vuoto: griglia + ordine vuoto', async () => {
    await mount(baseOrder({ comande: [], order_items: [], workflow_status: 'ricevuto' }))
    expect(screen.getByText(/Tocca i prodotti per aggiungerli/)).toBeInTheDocument()
    expect(screen.getByText('Gin Tonic')).toBeInTheDocument()
  })
})

describe('aggiunte: la nuova comanda è gestita internamente', () => {
  it('tap sulla griglia → gli item si CONFERMANO da soli, confluiscono nella comanda in prep.', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.click(screen.getAllByText('Gin Tonic')[0])
    await user.click(screen.getAllByText('Gin Tonic')[0])
    // l'aggiunta è confermata da sola (senza cliccare Conferma)
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled())
    // l'ordine è in preparazione → NON crea una nuova comanda: confluisce in c1
    expect(addComanda).not.toHaveBeenCalled()
    const [orderId, comandaId, payload] = bartenderUpdateComanda.mock.calls.at(-1)
    expect(orderId).toBe('ord1')
    expect(comandaId).toBe('c1')
    expect(payload.items.some((i) => i.drink_id === 'gin')).toBe(true)
    expect(payload.items.some((i) => i.drink_id === 'mojito')).toBe(true)
    expect(printComanda).not.toHaveBeenCalled()
  })

  it('ordine già SERVITO: l\'aggiunta crea una NUOVA comanda (addComanda)', async () => {
    const user = userEvent.setup()
    await mount(
      baseOrder({
        comande: [
          { id: 'c1', seq: 1, status: 'ritirato', status_times: {}, items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }] },
        ],
      })
    )
    await user.click(screen.getAllByText('Gin Tonic')[0])
    // nessuna comanda modificabile → nuova comanda, da sola
    await waitFor(() => expect(addComanda).toHaveBeenCalled())
    expect(bartenderUpdateComanda).not.toHaveBeenCalled()
    const [orderId, items] = addComanda.mock.calls.at(-1)
    expect(orderId).toBe('ord1')
    expect(items.some((i) => i.drink_id === 'gin')).toBe(true)
  })

  it('la modifica per-item PRECARICA gli ingredienti del drink (si sostituiscono, non solo si aggiungono)', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.click(screen.getByText('Gin Tonic'))
    // l'item nel conto è cliccabile per modificarlo (niente tasto matita)
    await user.click(screen.getAllByTitle(/Modifica Gin Tonic/).at(-1))
    // la ricetta del prodotto è già lì, quindi si può togliere/cambiare
    expect(screen.getByLabelText('Quantità Gin')).toHaveValue(40)
    expect(screen.queryByText(/non ha ingredienti configurati/)).not.toBeInTheDocument()
  })

  it('drink SENZA ingredienti: avvisa il bartender', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    // Il Mojito non ha recipe_items nel menù mock. L'item è cliccabile per
    // modificarlo; ce n'è più d'uno (comanda + bozza): modifico l'ultima aggiunta.
    await user.click(screen.getAllByText('Mojito')[0])
    await user.click(screen.getAllByTitle(/Modifica Mojito/).at(-1))
    expect(screen.getByText(/non ha ingredienti configurati/)).toBeInTheDocument()
  })

  it('GRIGLIA vs + sulla riga: la griglia duplica, il + aumenta la quantità', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    // due tocchi sulla stessa tile → DUE righe separate di Gin Tonic
    await user.click(screen.getAllByText('Gin Tonic')[0])
    await user.click(screen.getAllByText('Gin Tonic')[0])
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled())
    const dopoGriglia = bartenderUpdateComanda.mock.calls.at(-1)[2].items
    const ginRighe = dopoGriglia.filter((i) => i.drink_id === 'gin')
    expect(ginRighe).toHaveLength(2)
    expect(ginRighe.every((i) => i.qty === 1)).toBe(true)

    // il + sulla riga del Mojito (già nel conto) ne aumenta la QUANTITÀ
    bartenderUpdateComanda.mockClear()
    await user.click(screen.getByRole('button', { name: 'Aumenta Mojito' }))
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled())
    const dopoPiu = bartenderUpdateComanda.mock.calls.at(-1)[2].items
    const mojito = dopoPiu.filter((i) => i.drink_id === 'mojito')
    expect(mojito).toHaveLength(1) // niente riga nuova
    expect(mojito[0].qty).toBe(3) // erano 2
  })

  it('Unisci accorpa righe uguali con quantità diverse (4 + 1 = 5)', async () => {
    const user = userEvent.setup()
    await mount(
      baseOrder({
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'ricevuto',
            status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 4 }],
          },
        ],
      })
    )
    // una riga da 4; se ne aggiunge una da 1 dalla griglia → due righe
    await user.click(screen.getAllByText('Mojito')[0])
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled())
    expect(bartenderUpdateComanda.mock.calls.at(-1)[2].items.filter((i) => i.drink_id === 'mojito')).toHaveLength(2)

    // il tasto Unisci c'è e accorpa in una riga da 5
    bartenderUpdateComanda.mockClear()
    await user.click(screen.getByRole('button', { name: /Unisci/ }))
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled())
    const uniti = bartenderUpdateComanda.mock.calls.at(-1)[2].items.filter((i) => i.drink_id === 'mojito')
    expect(uniti).toHaveLength(1)
    expect(uniti[0].qty).toBe(5)
  })

  it("il tasto è UNO: quando c'è da unire mostra Unisci, e Separa vive nel ⋯", async () => {
    // Erano due tasti fissi, ma dei due ne serve uno alla volta: il tasto
    // unico mostra l'azione possibile (vince Unisci), l'altra resta nel ⋯.
    const user = userEvent.setup()
    await mount(
      baseOrder({
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'in_preparazione',
            status_times: {},
            items: [
              { drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 4 }, // da separare
              { drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 },
              { drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }, // da unire
            ],
          },
        ],
      })
    )
    expect(screen.getByRole('button', { name: /🔗 Unisci/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /⑃ Separa/ })).toBeNull()

    // ANCHE NEL ⋯ LA VOCE È UNA SOLA, e dice la stessa cosa del tasto:
    // erano due righe di menu con una sempre spenta. Qui c'è da unire,
    // quindi si legge «Unisci» e basta.
    await user.click(screen.getByRole('button', { name: 'Azioni del conto' }))
    expect(screen.getByRole('button', { name: /Unisci le righe uguali/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Separa le quantità/ })).toBeNull()

    // Unito quello che c'era da unire, la stessa voce diventa «Separa».
    await user.click(screen.getByRole('button', { name: /Unisci le righe uguali/ }))
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled())
    const dopo = bartenderUpdateComanda.mock.calls.at(-1)[2].items
    expect(dopo.filter((i) => i.drink_id === 'gin')).toHaveLength(1)
  })

  it("il + su un item del conto è un'aggiunta che si conferma da sola", async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.click(screen.getByRole('button', { name: 'Aumenta Mojito' }))
    // ordine in preparazione → l'aggiunta confluisce da sola nella comanda c1
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled())
    expect(addComanda).not.toHaveBeenCalled()
  })
})

describe('diminuzioni: solo dalle comande ancora modificabili', () => {
  it('avanza lo stato della comanda ATTIVA dal popup Servizio', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Stato servizio/ }))
    // Il conto di prova nasce «da fare», quindi il passo dopo è il banco.
    await user.click(screen.getByRole('button', { name: /Segna “In preparazione”/ }))
    expect(advanceComanda).toHaveBeenCalledWith('ord1', 'c1', 'in_preparazione')
  })

  it('il − scala la comanda modificabile con sync in background (debounce)', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.click(screen.getByRole('button', { name: 'Riduci Mojito' }))
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const [, comandaId, payload] = bartenderUpdateComanda.mock.calls[0]
    expect(comandaId).toBe('c1')
    expect(payload.items[0]).toMatchObject({ drink_id: 'mojito', qty: 1 })
  })

  it('comanda servita: il − è disabilitato (quantità bloccate), il + resta', async () => {
    await mount(
      baseOrder({
        workflow_status: 'ritirato',
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'ritirato',
            status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
          },
        ],
      })
    )
    expect(screen.getByRole('button', { name: 'Riduci Mojito' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Aumenta Mojito' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Segna/ })).not.toBeInTheDocument()
  })
})

describe('modale comande: consultazione, avanzamento e stampa', () => {
  // «Il tasto per stampare lo scontrino dal box delle comande non serve»
  // (l'utente, 21/08/2026). In fondo a questo pannello c'era «Scontrino (non
  // fiscale)», che stampava il conto INTERO da dentro la finestra delle
  // comande: due documenti diversi dietro lo stesso vetro, e quello sbagliato
  // era il piu' grande. Lo scontrino appartiene al gesto della riscossione
  // (REQ-STAMPA-001) e il riepilogo prima di pagare ha il suo «Preconto»
  // nella schermata dei pagamenti. Qui dentro si stampano le comande.
  it('non si stampa lo scontrino da qui: questo pannello e delle comande', async () => {
    const user = userEvent.setup()
    const order = baseOrder({
      comande: [
        {
          id: 'c1', seq: 1, status: 'ricevuto', status_times: {},
          items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }],
        },
      ],
    })
    await mount(order)
    await user.click(screen.getByRole('button', { name: /Comande \(1\)/ }))
    expect(screen.getByText(/COMANDA 1/)).toBeInTheDocument()
    // La stampa della comanda resta: e' la carta che serve al banco.
    expect(screen.getByRole('button', { name: /Stampa/ })).toBeInTheDocument()
    // Quella del conto no.
    expect(screen.queryByRole('button', { name: /Scontrino/ })).not.toBeInTheDocument()
  })

  it('le comande si aprono a parte e ognuna si stampa singolarmente', async () => {
    const user = userEvent.setup()
    const order = baseOrder({
      comande: [
        {
          id: 'c1', seq: 1, status: 'ritirato', status_times: {},
          items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
        },
        {
          id: 'c2', seq: 2, status: 'ricevuto', status_times: {},
          items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }],
        },
      ],
    })
    await mount(order)
    // le comande NON sono in vista finché non apro la modale
    expect(screen.queryByText(/COMANDA 1/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Comande \(2\)/ }))
    expect(screen.getByText(/COMANDA 1/)).toBeInTheDocument()
    expect(screen.getByText(/COMANDA 2/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stampa comanda 2' }))
    expect(printComanda).toHaveBeenCalledTimes(1)
    const [printedOrder, printedComanda] = printComanda.mock.calls[0]
    expect(printedOrder.id).toBe('ord1')
    expect(printedComanda.id).toBe('c2')
  })

  // «Se ho più di una comanda (dello stesso ordine!) devo poterle stampare
  // insieme» (l'utente, 20/08). Un conto battuto in tre riprese ha tre
  // ticket, e rifarli uno per uno col conto in mano è tempo perso al banco.
  it('con più di una comanda si stampano tutte in un colpo', async () => {
    const user = userEvent.setup()
    await mount(
      baseOrder({
        comande: [
          {
            id: 'c1', seq: 1, status: 'ritirato', status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
          },
          {
            id: 'c2', seq: 2, status: 'annullato', status_times: {},
            items: [{ drink_id: 'neg', name: 'Negroni', unit_price: 9, qty: 1 }],
          },
          {
            id: 'c3', seq: 3, status: 'ricevuto', status_times: {},
            items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }],
          },
        ],
      })
    )
    await user.click(screen.getByRole('button', { name: /Comande \(3\)/ }))
    // Il conto ne ha tre, ma l'annullata è lavoro buttato: il tasto conta due.
    await user.click(screen.getByRole('button', { name: /Una per comanda \(2\)/ }))
    expect(printComande).toHaveBeenCalledTimes(1)
    const [ordine, comande] = printComande.mock.calls[0]
    expect(ordine.id).toBe('ord1')
    expect(comande.map((c) => c.id)).toEqual(['c1', 'c3'])
  })

  // «Va bene stampare tutte le comande insieme su più ricevute ma serve
  // anche stampare tutto su una sola ricevuta» (l'utente, 20/08). Sono due
  // gesti diversi e servono tutti e due: il gemello dell'altro tasto.
  it('e con lo stesso conto si può stampare tutto su un foglio solo', async () => {
    const user = userEvent.setup()
    await mount(
      baseOrder({
        comande: [
          {
            id: 'c1', seq: 1, status: 'ritirato', status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
          },
          {
            id: 'c2', seq: 2, status: 'ricevuto', status_times: {},
            items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }],
          },
        ],
      })
    )
    await user.click(screen.getByRole('button', { name: /Comande \(2\)/ }))
    await user.click(screen.getByRole('button', { name: /Tutto su una/ }))
    expect(printComandaUnita).toHaveBeenCalledTimes(1)
    // UN ORDINE, non una lista: è il confine che l'utente ha sottolineato
    // («ma sempre dello stesso ordine!»).
    expect(printComandaUnita.mock.calls[0]).toHaveLength(1)
    expect(printComandaUnita.mock.calls[0][0].id).toBe('ord1')
    expect(printComande).not.toHaveBeenCalled()
  })

  it('con una comanda sola i due tasti non ci sono: niente da mettere insieme', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Comande/ }))
    expect(screen.queryByRole('button', { name: /Una per comanda/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Tutto su una/ })).toBeNull()
  })
})

describe('modifiche ottimistiche (UX istantanea)', () => {
  it('aggiunta ISTANTANEA: parte in background senza attendere il server', async () => {
    const user = userEvent.setup()
    bartenderUpdateComanda.mockImplementationOnce(() => new Promise(() => {})) // server lento
    await mount(baseOrder())
    await user.click(screen.getAllByText('Gin Tonic')[0])
    // parte da sola (ottimistico), senza aspettare la risoluzione del server
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled())
    expect(bartenderUpdateComanda.mock.calls.at(-1)[0]).toBe('ord1')
  })

  it('avanzamento ISTANTANEO: lo stato cambia subito, il server segue', async () => {
    const user = userEvent.setup()
    advanceComanda.mockImplementationOnce(() => new Promise(() => {})) // in volo
    await mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Stato servizio/ }))
    await user.click(screen.getByRole('button', { name: /Segna “In preparazione”/ }))
    // lo stato passa subito al passo dopo senza attendere la transazione
    expect(screen.getAllByText(/In preparazione/).length).toBeGreaterThan(0)
    expect(
      screen.queryByRole('button', { name: /Segna “In preparazione”/ })
    ).not.toBeInTheDocument()
  })

  it('tap rapidi sulla griglia: le aggiunte confluiscono nella comanda in prep., senza tasto Conferma', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    const tile = () => screen.getAllByText('Mojito')[0] // la tile della griglia
    await user.click(tile())
    await user.click(tile())
    await user.click(tile())
    // si confermano da sole nella comanda in preparazione (senza cliccare Conferma)
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled())
    expect(addComanda).not.toHaveBeenCalled()
    const payload = bartenderUpdateComanda.mock.calls.at(-1)[2]
    expect(payload.items.some((i) => i.drink_id === 'mojito')).toBe(true)
  })
})

describe('schermata Pagamento', () => {
  it('"Pagamento" apre la schermata POS con dovuto e avviso; Riscuotere incassa tutto', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Pagamento/ }))
    // schermata: articoli a sinistra, importo al centro. L'avviso «comande
    // non ancora servite» NON c'è più a schermo dal 21/08/2026 — occupava
    // una riga fissa nella colonna del tastierino; quello che diceva sta nel
    // `title` di «Riscuotere» (le prove sono in PaymentScreen.test.jsx).
    expect(screen.getByRole('dialog', { name: 'Pagamento' })).toBeInTheDocument()
    expect(screen.getByTestId('pay-amount')).toHaveTextContent('14,00')
    expect(screen.queryByText(/[Cc]omande non ancora servite/)).not.toBeInTheDocument()
    expect(registerPayment).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    expect(registerPayment).toHaveBeenCalledWith('ord1', {
      amount: 14,
      method: 'banco',
      items: null,
      autoServe: false,
      chiude: true,
      sconto: null,
    })
  })

  it('con tutto servito la schermata non mostra avvisi né spiegazioni', async () => {
    const user = userEvent.setup()
    await mount(
      baseOrder({
        workflow_status: 'ritirato',
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'ritirato',
            status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
          },
        ],
      })
    )
    await user.click(screen.getByRole('button', { name: /Pagamento/ }))
    expect(screen.queryByText(/[Cc]omande non ancora servite/)).not.toBeInTheDocument()
    // Non c'è nemmeno il `title`: con tutto servito l'incasso chiude, e non
    // c'è nessuna differenza da spiegare.
    expect(screen.getByRole('button', { name: /Riscuotere/ })).not.toHaveAttribute('title')
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    expect(registerPayment).toHaveBeenCalledWith('ord1', {
      amount: 14,
      method: 'banco',
      items: null,
      autoServe: false,
      chiude: true,
      sconto: null,
    })
  })

  it('lettore SumUp: metodo visibile solo se configurato, Riscuotere avvia readerCheckout', async () => {
    const user = userEvent.setup()
    mockSettings.payments_reader_enabled = true
    mockSettings.sumup_reader_id = 'reader1'
    try {
      await mount(baseOrder())
      await user.click(screen.getByRole('button', { name: /Pagamento/ }))
      await user.click(screen.getByRole('button', { name: /SumUp/ }))
      await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
      expect(readerCheckout).toHaveBeenCalledWith('ord1', { amount: 14, items: null, sconto: null })
      expect(registerPayment).not.toHaveBeenCalled()
    } finally {
      mockSettings.payments_reader_enabled = false
      mockSettings.sumup_reader_id = null
    }
  })

  it('lettore NON configurato: il metodo SumUp è in lista ma spento', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Pagamento/ }))
    // Spento a vedersi, ma toccabile: al tocco dice dove si configura.
    expect(screen.getByRole('button', { name: /SumUp/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('conto chiuso (pagato): griglia e modifiche disabilitate', async () => {
    await mount(
      baseOrder({
        status: 'pagato',
        workflow_status: 'pagato',
        payment_status: 'pagato',
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'ritirato',
            status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
          },
        ],
      })
    )
    // I tasti azione ci sono SEMPRE, ma su un conto chiuso non fanno più
    // quello che facevano: «Annulla ordine» è spento, e al posto di
    // «Pagamento» — che lì era spento a non fare niente — c'è «Rimetti in
    // corso», che è l'unica cosa sensata da fare su un conto chiuso.
    expect(screen.queryByRole('button', { name: /Pagamento/ })).toBeNull()
    expect(azioni().getByRole('button', { name: /Riapri conto/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Annulla ordine/ })).toBeDisabled()
  })
})

describe('ricerca prodotti', () => {
  it('digitando nella barra la griglia filtra su tutto il catalogo', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    expect(screen.getByText('Gin Tonic')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Cerca prodotto'), 'moj')
    expect(screen.queryByText('Gin Tonic')).not.toBeInTheDocument()
    // Mojito resta sia in griglia sia nella riga dell'ordine
    expect(screen.getAllByText('Mojito').length).toBeGreaterThan(0)
  })
})

// IL NOME DEL CONTO NON SI PERDE.
// Segnalato dal locale: "a volte metto il nome e non viene salvato". Il
// salvataggio stava solo sul tasto in fondo al popup: chiudendo con la ✕,
// toccando fuori dal riquadro o premendo Invio — che chiude la tastiera e
// sembra confermare — quello che si era appena scritto spariva in silenzio.
// ── SERVIZIO O RITIRO, SU QUESTO CONTO ─────────────────────
//
// L'impostazione del locale diceva come nascono i conti ed era finita per
// essere un VINCOLO: `service_mode` si scriveva alla creazione e non
// c'era nessun posto in cui cambiarlo. Ma un tavolo che viene a ritirare
// al banco succede tutte le sere, e cambia anche i soldi.
describe('servizio o ritiro, conto per conto', () => {
  const apri = async (user) => user.click(screen.getByRole('button', { name: /Dati conto/ }))

  it('lo staff cambia il modo del conto che ha in mano', async () => {
    const user = userEvent.setup()
    await mount(baseOrder({ service_mode: 'tavolo' }))
    await apri(user)
    await user.click(screen.getByRole('button', { name: /Ritiro/ }))
    expect(setOrderServiceMode).toHaveBeenCalledWith('ord1', 'banco')
  })

  it('quello di adesso si vede acceso, e non si riscrive toccandolo', async () => {
    const user = userEvent.setup()
    await mount(baseOrder({ service_mode: 'banco' }))
    await apri(user)
    expect(screen.getByRole('button', { name: /Ritiro/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await user.click(screen.getByRole('button', { name: /Ritiro/ }))
    expect(setOrderServiceMode).not.toHaveBeenCalled()
  })

  it('DICE CHE TOCCA I SOLDI prima di premere, non dopo', async () => {
    const user = userEvent.setup()
    mockSettings.coperto_enabled = true
    try {
      await mount(baseOrder({ service_mode: 'tavolo' }))
      await apri(user)
      expect(screen.getByText(/coperto e servizio si azzerano/i)).toBeInTheDocument()
    } finally {
      mockSettings.coperto_enabled = false
    }
  })

  it('con un acconto si cambia il modo, ma i soldi restano quelli', async () => {
    const user = userEvent.setup()
    await mount(
      baseOrder({
        service_mode: 'tavolo',
        payment_status: 'parziale',
        payments: [{ amount: 10, method: 'banco' }],
      })
    )
    await apri(user)
    // la frase sta accanto ai due tasti, non altrove nella schermata
    const riquadro = screen.getByRole('button', { name: /Ritiro/ }).closest('div').parentElement
    expect(within(riquadro).getByText(/coperto e servizio restano quelli/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Ritiro/ }))
    expect(setOrderServiceMode).toHaveBeenCalledWith('ord1', 'banco')
  })

  it('su un conto chiuso non si tocca: la strada è «Riapri conto»', async () => {
    const user = userEvent.setup()
    await mount(baseOrder({ status: 'pagato', payment_status: 'pagato' }))
    await apri(user)
    expect(screen.getByRole('button', { name: /Ritiro/ })).toBeDisabled()
    expect(screen.getByText(/riaprilo prima/i)).toBeInTheDocument()
  })
})

describe('dati conto: il nome si salva comunque si chiuda', () => {
  // Il conto di prova un nome ce l'ha già: si svuota il campo, altrimenti
  // quello nuovo si accoda al vecchio.
  const apriPopup = async (user) => {
    await user.click(screen.getByRole('button', { name: /Dati conto/ }))
    const campo = screen.getByLabelText('Nome')
    await user.clear(campo)
    return campo
  }

  it('col tasto Salva', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.type(await apriPopup(user), 'Marco')
    await user.click(screen.getByRole('button', { name: /Salva dati conto/ }))
    expect(updateOrderInfo).toHaveBeenCalledWith(
      'ord1',
      expect.objectContaining({ customer_name: 'Marco' })
    )
  })

  it('chiudendo con la ✕', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.type(await apriPopup(user), 'Marco')
    await user.click(screen.getByRole('button', { name: '✕' }))
    expect(updateOrderInfo).toHaveBeenCalledWith(
      'ord1',
      expect.objectContaining({ customer_name: 'Marco' })
    )
  })

  it('premendo Invio', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    const campo = await apriPopup(user)
    await user.type(campo, 'Marco{Enter}')
    expect(updateOrderInfo).toHaveBeenCalledWith(
      'ord1',
      expect.objectContaining({ customer_name: 'Marco' })
    )
  })

  it('senza modifiche non scrive niente', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Dati conto/ }))
    await user.click(screen.getByRole('button', { name: '✕' }))
    expect(updateOrderInfo).not.toHaveBeenCalled()
  })
})

// I TASTI NON BALLANO.
// Segnalato dal locale: aggiungendo il primo drink il tasto "Associa a
// gruppo" spariva e al suo posto compariva "Comande" — il tasto che stavi per
// premere non era più dov'era. I tasti ci sono sempre: spenti quando l'azione
// non è possibile, mai rimossi.
describe('tasti sempre presenti, spenti se non servono', () => {
  it('il tasto Unisci/Separa c’è anche quando non c’è niente da fare', async () => {
    await mount(baseOrder({ comande: [{ id: 'c1', seq: 1, status: 'in_preparazione', items: [] }] }))
    // Tasto unico: spento, non sparito.
    expect(screen.getByRole('button', { name: /Separa|Unisci/ })).toBeDisabled()
  })

  it('e si accende quando l’azione diventa possibile', async () => {
    await mount(baseOrder()) // 2 Mojito su una riga → si possono separare
    expect(screen.getByRole('button', { name: /⑃ Separa/ })).toBeEnabled()
  })

  it('Comande c’è sempre: sul conto aperto è attivo', async () => {
    await mount(baseOrder())
    expect(screen.getByRole('button', { name: /Comande/ })).toBeEnabled()
  })
})

// CONTO SVUOTATO = CONTO ANNULLATO, sempre.
// Prima valeva solo per il conto creato in quella sessione: uscendo e
// rientrando (per esempio chiudendo il box del nome) il conto non era più
// "creato qui", e togliendo l'ultima riga restava aperto e vuoto in coda.
describe('conto rimasto senza righe', () => {
  it('si annulla da solo e si torna alla lista', async () => {
    const user = userEvent.setup()
    await mount(
      baseOrder({
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'in_preparazione',
            status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
          },
        ],
      })
    )
    // Tolgo l'unica riga rimasta.
    await user.click(screen.getByRole('button', { name: 'Riduci Mojito' }))
    await waitFor(() => expect(cancelOrder).toHaveBeenCalledWith('ord1', { by: 'bartender' }), {
      timeout: 3000,
    })
  })

  it('ma non se qualcosa è già stato incassato', async () => {
    const user = userEvent.setup()
    await mount(
      baseOrder({
        payments: [{ id: 'p1', amount: 7, method: 'banco', at: '2026-07-11T22:00:00.000Z' }],
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'in_preparazione',
            status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
          },
        ],
      })
    )
    const meno = screen.queryByRole('button', { name: 'Riduci Mojito' })
    if (meno && !meno.disabled) await user.click(meno)
    await new Promise((r) => setTimeout(r, 700))
    expect(cancelOrder).not.toHaveBeenCalled()
  })
})

// ── TELEFONO: le azioni stanno in un menu, non in pagina ──────────────
// Su uno schermo stretto i tasti secondari (unisci, gruppi, dati conto,
// annulla) occupavano più spazio delle righe ordinate. Ora c'è un tasto
// "⋯ Azioni" che apre un menu dal basso: il CSS nasconde i tasti in
// pagina sotto i 700px, ma quello che conta è che il menu ci sia e che
// chiami gli STESSI handler — niente seconda logica da tenere allineata.
// (Qui i tasti in pagina ci sono comunque: jsdom non applica il CSS, per
// questo le ricerche sono ristrette al menu.)
describe('menu azioni del telefono', () => {
  // Schermo da telefono: il tasto ⋯ esiste solo qui (useTelefono).
  beforeEach(() => {
    window.matchMedia = (query) => ({
      matches: query.includes('700px'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  })

  const apriMenu = async (user) => {
    await user.click(screen.getByRole('button', { name: 'Azioni del conto' }))
    return within(screen.getByRole('dialog'))
  }

  it('nel menu c’è quello che si usa ogni tanto', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    const menu = await apriMenu(user)
    for (const voce of [/Comande \(1\)/, /Prodotto libero/, /Dati conto/]) {
      expect(menu.getByRole('button', { name: voce })).toBeInTheDocument()
    }
    // Unisci/Separa è UNA voce che cambia secondo quello che si può fare
    // (qui il conto ha 2 Mojito su una riga: c'è da separare), e il
    // «svuota» sta qui perché sul telefono in barra non ci sta.
    expect(menu.getByRole('button', { name: /Separa le quantità/ })).toBeInTheDocument()
    expect(menu.queryByRole('button', { name: /Unisci le righe uguali/ })).toBeNull()
    expect(menu.getByRole('button', { name: /Svuota il conto/ })).toBeInTheDocument()
  })

  // LA SCHERMATA DA GIRARE AL CLIENTE si apre da qui. Il QR con cui il
  // cliente segue l'ordine dal suo telefono stava sulla pagina di stato, che
  // adesso chi lavora non apre più: senza questa voce non ci si arriverebbe
  // da nessuna parte.
  it('«Mostra al cliente» c’è: è la via al QR', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    const menu = await apriMenu(user)
    expect(menu.getByRole('button', { name: /Mostra al cliente/ })).toBeInTheDocument()
  })

  // Senza gli stati del servizio non c'è nessun punto da seguire: offrire il
  // QR sarebbe promettere una cosa che non succede.
  it('col servizio spento non c’è: non ci sarebbe niente da seguire', async () => {
    mockSettings.workflow_enabled = false
    try {
      const user = userEvent.setup()
      await mount(baseOrder())
      const menu = await apriMenu(user)
      expect(menu.queryByRole('button', { name: /Mostra al cliente/ })).toBeNull()
    } finally {
      delete mockSettings.workflow_enabled
    }
  })

  it('quello che si usa sempre NON è nel menu: sta in fondo, su una riga', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    // In fondo al pannello, i tre gesti della serata.
    for (const nome of [/Invia$/, /Paga$/, /Annulla$/]) {
      expect(screen.getByRole('button', { name: nome })).toBeInTheDocument()
    }
    // E non anche dentro il menu, che sarebbe un doppione.
    const menu = await apriMenu(user)
    expect(menu.queryByRole('button', { name: /Invia/ })).toBeNull()
    expect(menu.queryByRole('button', { name: /Paga/ })).toBeNull()
    expect(menu.queryByRole('button', { name: /Annulla/ })).toBeNull()
  })

  it('“Annulla” chiede conferma, non annulla di colpo', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Annulla$/ }))
    await waitFor(() => expect(document.querySelector('.confirm-box')).toBeTruthy())
    expect(cancelOrder).not.toHaveBeenCalled()
  })

  it('scegliendo una voce il menu si chiude: mai due pannelli sovrapposti', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    const menu = await apriMenu(user)
    await user.click(menu.getByRole('button', { name: /Dati conto/ }))
    await waitFor(() =>
      expect(document.querySelector('.action-sheet')).toBeFalsy()
    )
  })

  // «Annulla» stava in questo elenco, e non ci sta più: mentre si batte un
  // conto nuovo è la VIA D'USCITA di chi l'ha aperto per sbaglio o ha
  // cambiato idea. Spento restava solo la freccia in alto, che nessuno
  // cerca. Vedi BUG-011.
  it('su un ordine NUOVO «Invia» è spento, «Annulla» no', async () => {
    await mount(null)
    expect(screen.getByRole('button', { name: /Invia$/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Annulla$/ })).not.toBeDisabled()
  })
})

// ── Quanto c'è da incassare, scritto sul tasto ────────────────────────
// Prima la cifra compariva solo finché l'ordine non esisteva ancora:
// appena si creava da sé — un istante dopo il primo prodotto — spariva, e
// sembrava un difetto. Deve restare, e deve dire quanto manca DAVVERO:
// sconto e acconti già presi non si pagano due volte.
describe('totale sul tasto Pagamento', () => {
  const tastoPagamento = () =>
    screen.getAllByRole('button', { name: /Pagamento/ })[0]

  it('su un conto aperto mostra il totale da incassare', async () => {
    await mount(baseOrder()) // 2 Mojito × 7 €
    expect(tastoPagamento()).toHaveTextContent('14,00 €')
  })

  it('con un acconto già preso mostra solo quello che manca', async () => {
    await mount(
      baseOrder({
        payments: [{ id: 'p1', amount: 10, method: 'banco', at: '2026-07-11T22:00:00.000Z' }],
      })
    )
    expect(tastoPagamento()).toHaveTextContent('4,00 €')
  })

  it('con lo sconto la cifra è quella scontata', async () => {
    await mount(baseOrder({ discount_amount: 4 }))
    expect(tastoPagamento()).toHaveTextContent('10,00 €')
  })

  it('conto già saldato: nessuna cifra da mostrare', async () => {
    await mount(
      baseOrder({
        payments: [{ id: 'p1', amount: 14, method: 'banco', at: '2026-07-11T22:00:00.000Z' }],
      })
    )
    expect(tastoPagamento()).not.toHaveTextContent('€')
  })
})

// ── ITEM BATTUTI MENTRE L'ORDINE SI STA CREANDO ──────────────────────
// Difetto vero, visto al banco: si aggiunge un'acqua, un secondo dopo si
// aggiunge altro, e quando l'ordine finisce di crearsi resta solo
// l'acqua. La creazione dura qualche decimo di secondo; in quei decimi si
// continua a battere, e chi svuotava la bozza a creazione finita portava
// via anche le righe arrivate nel frattempo.
// ── IN CHE PASSO NASCE UNA COMANDA, DAL POS ───────────────────
//
// Lo decide il locale, e vale allo stesso modo per la prima comanda di un
// conto nuovo e per le aggiunte a metà serata: prima erano due regole
// diverse in due posti, e nessuno l'aveva deciso.
// ── LE RIGHE AGGIUNTE NON SI ACCODANO A QUELLO CHE È GIÀ AL BANCO ────
//
// Difetto visto al banco (BUG-024): conto con una comanda in preparazione,
// si aggiungono due righe, e quelle risultavano già prese in carico da
// qualcuno — sparivano dalla colonna «Da fare» e non le cominciava
// nessuno. Le righe nuove nascono nel passo che dice l'impostazione, non
// nel passo della comanda che sta lì accanto.
describe('dove finiscono le righe aggiunte a un conto', () => {
  const conUnaComandaAlBanco = () =>
    baseOrder({
      workflow_status: 'in_preparazione',
      comande: [
        {
          id: 'c1',
          seq: 1,
          status: 'in_preparazione',
          status_times: {},
          items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
        },
      ],
    })

  it('IL DIFETTO: con una comanda al banco, le righe nuove nascono «da fare»', async () => {
    const user = userEvent.setup()
    await mount(conUnaComandaAlBanco())
    await user.click(screen.getAllByText('Gin Tonic')[0])
    await user.click(screen.getAllByText('Gin Tonic')[0])

    // niente si accoda alla comanda in preparazione…
    await waitFor(() => expect(addComanda).toHaveBeenCalled(), { timeout: 3000 })
    expect(bartenderUpdateComanda).not.toHaveBeenCalled()
    // …e la comanda nuova le porta tutte e due
    const [id, items] = addComanda.mock.calls.at(-1)
    expect(id).toBe('ord1')
    expect(items.filter((i) => i.drink_id === 'gin')).toHaveLength(2)
  })

  // QUESTO TEST DICEVA IL CONTRARIO, e la decisione è dell'utente (20/08):
  // «Se sono in preparazione significa che la vecchia comanda è stata già
  // presa in carico». Con l'interruttore acceso il passo di nascita è «in
  // preparazione», e la vecchia regola («confluisce nella comanda che sta
  // nel passo di nascita») faceva finire le aggiunte dentro un ticket che
  // il banco aveva già in mano. Il passo di nascita dice in che stato NASCE
  // una comanda; non dice più dove finiscono le righe che arrivano dopo.
  it('nemmeno con l’interruttore acceso: la comanda al banco non si allunga', async () => {
    const user = userEvent.setup()
    mockSettings.comande_in_preparazione = true
    try {
      await mount(conUnaComandaAlBanco())
      await user.click(screen.getAllByText('Gin Tonic')[0])
      await waitFor(() => expect(addComanda).toHaveBeenCalled(), { timeout: 3000 })
      expect(bartenderUpdateComanda).not.toHaveBeenCalled()
      const [id, items] = addComanda.mock.calls.at(-1)
      expect(id).toBe('ord1')
      expect(items.filter((i) => i.drink_id === 'gin')).toHaveLength(1)
    } finally {
      mockSettings.comande_in_preparazione = false
    }
  })

})

describe('il passo in cui nasce una comanda lo dice il locale', () => {
  it('di suo un conto nuovo nasce «da fare»', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <OrderPosDetail order={null} />
      </MemoryRouter>
    )
    await user.click(screen.getAllByText('Mojito')[0])
    await waitFor(() => expect(createOrder).toHaveBeenCalled())
    expect(createOrder.mock.calls[0][0].status).toBe('ricevuto')
  })

  it('acceso, nasce già in preparazione — e lo dice anche la comanda aggiunta', async () => {
    const user = userEvent.setup()
    mockSettings.comande_in_preparazione = true
    try {
      // conto nuovo
      const { unmount } = render(
        <MemoryRouter>
          <OrderPosDetail order={null} />
        </MemoryRouter>
      )
      await user.click(screen.getAllByText('Mojito')[0])
      await waitFor(() => expect(createOrder).toHaveBeenCalled())
      expect(createOrder.mock.calls[0][0].status).toBe('in_preparazione')
      unmount()

      // aggiunta a un conto già servito: nasce una comanda nuova, e la
      // provvisoria che si vede deve dire lo stesso passo di quella vera —
      // se no la card cambia colonna da sola un istante dopo.
      await mount(
        baseOrder({
          comande: [
            {
              id: 'c1', seq: 1, status: 'ritirato', status_times: {},
              items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
            },
          ],
        })
      )
      await user.click(screen.getAllByText('Gin Tonic')[0])
      await user.click(screen.getByRole('button', { name: /Comande/ }))
      await waitFor(() =>
        expect(
          [...document.querySelectorAll('.confirm-box .card')].at(-1).textContent
        ).toMatch(/In preparazione/)
      )
    } finally {
      mockSettings.comande_in_preparazione = false
    }
  })
})

describe('creazione: niente si perde mentre l’ordine nasce', () => {
  it('gli item battuti durante la creazione finiscono nell’ordine', async () => {
    const user = userEvent.setup()
    // Creazione LENTA e controllata da qui: è la finestra in cui si continua
    // a battere.
    let creaLaConclude
    createOrder.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          creaLaConclude = () =>
            resolve({
              id: 'ord-nuovo',
              status: 'aperto',
              comande: [
                {
                  id: 'c1',
                  seq: 1,
                  // Come nasce davvero: createOrder riceve il passo di
                  // partenza del locale, che di suo è «da fare».
                  status: 'ricevuto',
                  status_times: {},
                  items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
                },
              ],
              order_items: [
                { id: 'x', drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 },
              ],
              payments: [],
            })
        })
    )

    render(
      <MemoryRouter>
        <OrderPosDetail order={null} />
      </MemoryRouter>
    )

    // Primo item: fa partire la creazione (parte da sola dopo ~300ms).
    await user.click(screen.getAllByText('Mojito')[0])
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1), { timeout: 2000 })

    // Mentre l'ordine sta nascendo, se ne battono altri due.
    await user.click(screen.getAllByText('Gin Tonic')[0])
    await user.click(screen.getAllByText('Gin Tonic')[0])

    // Ora il server risponde.
    creaLaConclude()

    // I due Gin Tonic non devono sparire: restano a schermo e vengono
    // mandati al server come aggiunte.
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled(), { timeout: 3000 })
    const items = bartenderUpdateComanda.mock.calls.at(-1)[2].items
    expect(items.filter((i) => i.drink_id === 'gin')).toHaveLength(2)
    expect(screen.getAllByText('Gin Tonic').length).toBeGreaterThan(0)
    expect(createOrder).toHaveBeenCalledTimes(1) // un ordine solo, non due
  })
})


// -- LA SESSIONE DI CREAZIONE: UN ORDINE, UNA COMANDA --------------------
//
// Il danno, visto al banco il 20/08: un conto solo (#20) battuto in
// creazione, e DUE facsimili di comanda -- un LIMONCELLO da solo, poi tutto
// il resto. Parole sue: "mi crea piu' comande quando creo un solo ordine.
// In fase di creazione deve gestire tutto come UNA comanda".
//
// Concorrevano due cose: la regola di ieri (una comanda "in preparazione"
// non accoglie aggiunte -- e col locale che le fa NASCERE in preparazione
// non le accoglieva mai) e la corsa fra due scritture ravvicinate
// (BUG-056). Qui si sorveglia la prima, nel caso che l'ha fatta vedere.
describe('in creazione il conto resta UNA comanda', () => {
  it('tre aggiunte rapide, col passo di nascita «in preparazione»: una sola', async () => {
    const user = userEvent.setup()
    mockSettings.comande_in_preparazione = true
    try {
      createOrder.mockImplementationOnce(async () => ({
        id: 'ord-nuovo',
        status: 'aperto',
        // Nasce gia' in preparazione (impostazione del locale) e con la
        // sessione di creazione APERTA: nessuno l'ha presa in mano.
        in_creazione: true,
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'in_preparazione',
            presa_in_carico: false,
            status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
          },
        ],
        order_items: [{ id: 'x', drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
        payments: [],
      }))

      render(
        <MemoryRouter>
          <OrderPosDetail order={null} />
        </MemoryRouter>
      )

      await user.click(screen.getAllByText('Mojito')[0])
      await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1), { timeout: 2000 })
      // La sessione e' aperta: lo dice il conto, non un'impostazione.
      expect(createOrder.mock.calls[0][0].in_creazione).toBe(true)

      // Altre due righe, subito dopo.
      await user.click(screen.getAllByText('Gin Tonic')[0])
      await user.click(screen.getAllByText('Gin Tonic')[0])

      await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled(), { timeout: 3000 })
      // NESSUNA comanda nuova: le righe entrano in quella che c'e' gia'.
      // Prima di questa cura ognuna faceva il suo ticket.
      expect(addComanda).not.toHaveBeenCalled()
      expect(bartenderUpdateComanda.mock.calls.at(-1)[1]).toBe('c1')
      const items = bartenderUpdateComanda.mock.calls.at(-1)[2].items
      expect(items.filter((i) => i.drink_id === 'gin')).toHaveLength(2)
    } finally {
      mockSettings.comande_in_preparazione = false
    }
  })

  it('uscendo, la sessione si chiude: da li\' in poi vale la regola normale', async () => {
    const user = userEvent.setup()
    createOrder.mockImplementationOnce(async () => ({
      id: 'ord-nuovo',
      status: 'aperto',
      in_creazione: true,
      comande: [
        {
          id: 'c1',
          seq: 1,
          status: 'ricevuto',
          status_times: {},
          items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
        },
      ],
      order_items: [{ id: 'x', drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
      payments: [],
    }))
    const { unmount } = render(
      <MemoryRouter>
        <OrderPosDetail order={null} />
      </MemoryRouter>
    )
    await user.click(screen.getAllByText('Mojito')[0])
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1), { timeout: 2000 })
    unmount()
    // E' l'uscita a chiudere la composizione: da qui la comanda puo'
    // uscire dalla stampante, completa.
    await waitFor(() => expect(chiudiCreazione).toHaveBeenCalledWith('ord-nuovo'))
  })

  // ── MA NON SE SI STA ANNULLANDO (BUG-071) ────────────────────────
  //
  // «Se alla creazione di un ordine lo annullo anche, la comanda non deve
  // uscire se è abilitata la stampa automatica» (l'utente, 21/08/2026).
  //
  // `in_creazione` è il cancello della stampa: finché c'è, la comanda non
  // esce. Annullando, l'uscita lo toglieva SUBITO mentre l'annullo doveva
  // ancora leggersi il conto — e in quel buco la coda vedeva un conto
  // composto, aperto e da stampare. Adesso l'uscita non tocca niente: a
  // chiudere la composizione ci pensa l'annullo, insieme allo stato, in
  // una scrittura sola (cancelOrder in api.js).
  //
  // LA PROVA BATTE UNA RIGA PRIMA DI ANNULLARE, e non è un dettaglio: da
  // lì il conto è già NATO (la schermata passa a modifica) ma resta «in
  // creazione». È il caso vero al banco — si batte, si cambia idea, si
  // annulla — ed è quello che sfuggiva, perché passa dal ramo dell'annullo
  // normale e non da quello del conto ancora nuovo.
  it('annullando in creazione, l’uscita NON apre il cancello della stampa', async () => {
    const user = userEvent.setup()
    // La prova qui sopra ha chiuso una creazione, e la spia se lo ricorda.
    chiudiCreazione.mockClear()
    createOrder.mockImplementationOnce(async () => ({
      id: 'ord-nuovo',
      status: 'aperto',
      in_creazione: true,
      comande: [
        {
          id: 'c1',
          seq: 1,
          status: 'ricevuto',
          status_times: {},
          items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
        },
      ],
      order_items: [{ id: 'x', drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
      payments: [],
    }))
    const { unmount } = render(
      <MemoryRouter>
        <OrderPosDetail order={null} />
      </MemoryRouter>
    )
    await user.click(screen.getAllByText('Mojito')[0])
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1), { timeout: 2000 })
    await user.click(screen.getAllByRole('button', { name: /Annulla ordine/ })[0])
    const conferme = screen.getAllByRole('button', { name: /^Annulla ordine$/ })
    await user.click(conferme[conferme.length - 1])
    // Tornando alla coda la schermata si smonta: è lì che l'uscita partiva.
    unmount()
    await waitFor(() => expect(cancelOrder).toHaveBeenCalled())
    expect(chiudiCreazione).not.toHaveBeenCalled()
  })
})

// ── Dopo l'annullo si torna agli ordini ───────────────────────────────
// Un conto annullato non si lavora più: restarci davanti serve solo a
// chiedersi se l'annullo è andato a buon fine, e a rischiare di batterci
// sopra un altro drink.
describe('annullo dell’ordine', () => {
  it('annullando si torna alla coda', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/ordine/ord1']}>
        <Routes>
          <Route path="/ordine/:id" element={<OrderPosDetail order={baseOrder()} />} />
          <Route path="/bar" element={<div>CODA ORDINI</div>} />
        </Routes>
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: /Annulla ordine/ }))
    const conferma = within(document.querySelector('.confirm-box'))
    await user.click(conferma.getByRole('button', { name: 'Annulla ordine' }))
    expect(cancelOrder).toHaveBeenCalledWith('ord1', { by: 'bartender' })
    expect(await screen.findByText('CODA ORDINI')).toBeInTheDocument()
  })
})

// ── La ricerca prodotti, dentro la schermata vera ─────────────────────
// Il picker da solo era già coperto (PosProductPicker.test.jsx), ma quello
// che al banco non funzionava era il COLLEGAMENTO: l'impostazione arriva
// dalle impostazioni del bar, passa da qui e finisce nella griglia. Se si
// stacca un anello, la ricerca torna a filtrare e nessun test se ne accorge.
describe('la ricerca prodotti segue l’impostazione del bar', () => {
  const card = (nome) =>
    [...document.querySelectorAll('[data-drink-id]')].find((e) => e.textContent.includes(nome))
  const cerca = () => screen.getByLabelText('Cerca prodotto')

  afterEach(() => {
    delete mockSettings.pos_search
  })

  it('«filtra»: cercando resta solo il prodotto che risponde', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.type(cerca(), 'mojito')
    expect(card('Mojito')).toBeTruthy()
    expect(card('Gin Tonic')).toBeFalsy()
  })

  it('«accendi e porta lì»: la griglia resta intera e la card si accende', async () => {
    mockSettings.pos_search = 'evidenzia'
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.type(cerca(), 'mojito')
    // Niente sparisce da sotto le dita…
    expect(card('Gin Tonic')).toBeTruthy()
    // …e quella cercata è accesa.
    expect(card('Mojito')).toHaveClass('prodotto-acceso')
  })
})

// ── Pagamento battuto mentre l'ordine sta ancora nascendo ─────────────
// Segnalato dal banco: si battono due acque di corsa, si preme Pagamento,
// e un attimo dopo si è di nuovo sulla schermata dell'ordine — Pagamento va
// ripremuto. Dipende da quanto si è veloci: l'ordine nasce da solo al primo
// prodotto, e quando il server risponde il conto smette di essere "nuovo".
// La schermata di pagamento era appesa proprio a quel "nuovo": appena
// cambiava, spariva da sé, col cassiere davanti al cliente che paga.
describe('Pagamento premuto mentre l’ordine sta ancora nascendo', () => {
  it('la schermata di pagamento resta aperta quando la creazione va a buon fine', async () => {
    const user = userEvent.setup()
    let rispondiIlServer
    createOrder.mockImplementationOnce(
      () =>
        new Promise((res) => {
          rispondiIlServer = () =>
            res({
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
                  status: 'in_preparazione',
                  items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
                },
              ],
              order_items: [
                { id: 'x', drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 },
              ],
            })
        })
    )
    render(
      <MemoryRouter>
        <OrderPosDetail order={null} />
      </MemoryRouter>
    )
    await user.click(screen.getAllByText('Mojito')[0])
    // L'auto-creazione parte da sola dopo qualche decimo di secondo…
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1), { timeout: 2000 })
    // …e mentre è in volo si preme Pagamento.
    await user.click(screen.getByRole('button', { name: /Pagamento/ }))
    expect(await screen.findByRole('button', { name: /Riscuotere/ })).toBeInTheDocument()

    // Il server risponde: il conto esiste, non è più "nuovo".
    rispondiIlServer()
    // Il numero del conto arriva a schermo: siamo oltre il passaggio.
    // (Compare in due punti: la testata del conto e quella del pagamento.)
    expect((await screen.findAllByText(/#9/)).length).toBeGreaterThan(0)
    // E il pagamento è ancora lì, dove il cassiere l'ha lasciato.
    expect(screen.getByRole('button', { name: /Riscuotere/ })).toBeInTheDocument()
  })
})

// ── Ripristino di un conto chiuso o annullato ────────────────────────
// Capita: si chiude un conto sul tavolo sbagliato, si annulla per un
// malinteso, il cliente torna. Finora l'unica strada era ribatterlo da capo
// e il conto vero restava lì a sporcare la serata.
// I TASTI SOPRA LA LISTA SI RIDUCONO. «Unisci», «Dati conto» e «Prodotto
// libero» sono tre righe di schermo prese alla lista dei drink: a chi batte
// conti complicati servono sotto il dito, a chi fa solo drink no. Ridotti
// non spariscono — sono tutti nel ⋯ — e la scelta e' di questo terminale,
// quindi deve sopravvivere all'uscita dalla schermata.
describe('i tasti del conto si riducono', () => {
  it('il tasto li nasconde, restano nel ⋯, e la scelta si ricorda', async () => {
    const user = userEvent.setup()
    const vista = await mount(baseOrder())
    expect(screen.getByRole('button', { name: /Dati conto/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Nascondi i tasti del conto' }))
    expect(screen.queryByRole('button', { name: /Dati conto/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Prodotto libero/ })).not.toBeInTheDocument()
    // «Comande» resta: e' quello che si apre di continuo
    expect(screen.getByRole('button', { name: /Comande/ })).toBeInTheDocument()

    // e nel ⋯ ci sono tutte, come sempre
    await user.click(screen.getByRole('button', { name: 'Azioni del conto' }))
    expect(screen.getByRole('button', { name: /Dati conto/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Prodotto libero/ })).toBeInTheDocument()

    vista.unmount()
    await mount(baseOrder())
    expect(screen.queryByRole('button', { name: /Dati conto/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mostra i tasti del conto' }))
    expect(screen.getByRole('button', { name: /Dati conto/ })).toBeInTheDocument()
  })
})

describe('rimettere in corso un conto', () => {
  const chiuso = () =>
    baseOrder({
      status: 'pagato',
      workflow_status: 'pagato',
      payment_status: 'pagato',
      created_at: '2026-08-12T20:00:00.000Z',
      tempi_conto: { pagato: '2026-08-12T21:30:00.000Z' },
      payments: [{ amount: 14, method: 'banco', at: '2026-08-12T21:30:00.000Z' }],
    })

  // La storia si apre dal ⋯: era un'icona in testata, in mezzo ai tasti che
  // si premono di corsa, per una cosa che si guarda una volta a serata.
  it('la storia del conto racconta apertura e chiusura', async () => {
    const user = userEvent.setup()
    await mount(chiuso())
    await user.click(screen.getByRole('button', { name: 'Azioni del conto' }))
    await user.click(screen.getByRole('button', { name: /Storia del conto/ }))
    const box = within(screen.getByRole('dialog', { name: 'Storia del conto' }))
    expect(box.getByText('Conto aperto')).toBeInTheDocument()
    expect(box.getByText('Conto chiuso')).toBeInTheDocument()
  })

  it('si chiede una motivazione (facoltativa) e si conferma', async () => {
    const user = userEvent.setup()
    await mount(chiuso())
    await user.click(azioni().getByRole('button', { name: /Riapri conto/ }))
    const box = within(screen.getByRole('dialog', { name: 'Ripristina il conto' }))
    await user.type(box.getByLabelText(/Perché lo riapri/), 'tavolo sbagliato')
    await user.click(box.getByRole('button', { name: /Riapri/ }))
    expect(restoreOrder).toHaveBeenCalledWith('ord1', expect.objectContaining({ motivo: 'tavolo sbagliato' }))
  })

  it('senza motivazione si ripristina lo stesso: al banco i secondi non ci sono', async () => {
    const user = userEvent.setup()
    await mount(chiuso())
    await user.click(azioni().getByRole('button', { name: /Riapri conto/ }))
    const box = within(screen.getByRole('dialog', { name: 'Ripristina il conto' }))
    await user.click(box.getByRole('button', { name: /Riapri/ }))
    expect(restoreOrder).toHaveBeenCalledWith('ord1', expect.objectContaining({ motivo: null }))
  })

  it('su un conto già in corso il tasto resta quello del pagamento', async () => {
    await mount(baseOrder())
    expect(azioni().queryByRole('button', { name: /Riapri conto/ })).toBeNull()
    expect(azioni().getByRole('button', { name: /Pagamento/ })).toBeInTheDocument()
  })

  // Un conto riaperto, guardato mezz'ora dopo, è identico a uno normale: se
  // dentro c'è un incasso diventa un mistero. Il motivo si legge nel conto.
  it('nel conto riaperto si legge perché lo è', async () => {
    await mount(
      baseOrder({
        riaperture: [
          { at: '2026-08-12T22:00:00.000Z', motivo: 'chiuso sul tavolo sbagliato', chi: 'Anna' },
        ],
      })
    )
    expect(screen.getByText(/Conto riaperto/)).toBeInTheDocument()
    expect(screen.getByText(/chiuso sul tavolo sbagliato/)).toBeInTheDocument()
    expect(screen.getByText(/da Anna/)).toBeInTheDocument()
  })
})

// ── UN CONTO RIAPERTO SI MODIFICA TUTTO ──────────────────────────────
// Riaprire serve esattamente a rimettere a posto quello che c'è dentro: un
// giro battuto sul tavolo sbagliato, una birra di troppo. Se le righe di
// prima restano bloccate — perché la comanda risultava servita — il conto
// riaperto non serve a niente.
describe('conto riaperto: le righe di prima si toccano', () => {
  const servito = (extra = {}) =>
    baseOrder({
      total: 14,
      comande: [
        {
          id: 'c1',
          seq: 1,
          status: 'ritirato',
          status_times: {},
          items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
        },
      ],
      order_items: [{ id: 'i1', drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
      ...extra,
    })

  const meno = () => screen.getAllByRole('button', { name: /Riduci Mojito/ })

  it('senza riapertura una comanda servita resta bloccata', async () => {
    await mount(servito())
    expect(meno().every((b) => b.disabled)).toBe(true)
  })

  it('dopo una riapertura la riga si può scalare', async () => {
    const user = userEvent.setup()
    await mount(servito({ riaperture: [{ at: '2026-08-15T21:00:00.000Z', motivo: 'tavolo sbagliato' }] }))
    const tasti = meno().filter((b) => !b.disabled)
    expect(tasti.length).toBeGreaterThan(0)
    await user.click(tasti[0])
    // La modifica parte verso la comanda: le scorte si riallineano con la
    // differenza, come per ogni altra modifica.
    await vi.waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled())
  })
})

// ── Il prezzo della riga, non quello di uno ──────────────────────────
// Difetto visto in produzione (BUG-004): con 3× Tennent's la riga mostrava
// «4,00 €», il prezzo unitario. Il subtotale non c'era proprio, e per sapere
// quanto faceva quella riga bisognava moltiplicare a mente col cliente
// davanti. Poi il calcolo esplicito in riga («3 × 7,00») si è rivelato
// rumore accanto a ogni nome: ora la riga dice solo QUANTO FA, e il
// calcolo si accende dal menù ⋯, comparendo sotto l'item come le note
// (REQ-POS-014).
describe('subtotale di riga', () => {
  const ordineTriplo = () =>
    baseOrder({
      total: 21,
      comande: [
        {
          id: 'c1',
          seq: 1,
          status: 'in_preparazione',
          status_times: {},
          items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 3 }],
        },
      ],
      order_items: [
        { id: 'ord1-0', drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 3 },
      ],
    })

  it('la riga dice quanto fa; il calcolo di suo non appare', async () => {
    await mount(ordineTriplo())
    // Quanto fa la riga…
    expect(screen.getAllByText('21,00 €').length).toBeGreaterThan(0)
    // …senza il calcolo esplicito accanto al nome.
    expect(screen.queryByText(/3 × 7,00/)).toBeNull()
  })

  it('col calcolo acceso (scelta ricordata sul dispositivo) appare sotto la riga', async () => {
    localStorage.setItem('tana:pos:calcoli', '1')
    await mount(ordineTriplo())
    expect(screen.getByText(/↳ 3 × 7,00/)).toBeInTheDocument()
    expect(screen.getAllByText('21,00 €').length).toBeGreaterThan(0)
    localStorage.removeItem('tana:pos:calcoli')
  })

  it('i supplementi attivi si vedono uno per riga, sotto il Subtotale', async () => {
    // Prima una riga cumulativa («Coperto/servizio/mancia · 5,50 €») non
    // diceva né cosa fosse attivo né quanto pesasse ognuno (REQ-POS-016).
    await mount(
      baseOrder({
        total: 18.5,
        coperto_amount: 2,
        tip_amount: 2.5,
      })
    )
    // Il conto nudo…
    expect(screen.getByText('Subtotale', { exact: false })).toBeInTheDocument()
    // …le voci attive, ognuna con il suo importo…
    expect(screen.getByText('Coperto')).toBeInTheDocument()
    expect(screen.getByText('Mancia')).toBeInTheDocument()
    // …e quella spenta non compare.
    expect(screen.queryByText('Servizio')).toBeNull()
  })

  it('con un pezzo solo il subtotale c’è comunque, il calcolo mai', async () => {
    localStorage.setItem('tana:pos:calcoli', '1')
    await mount(
      baseOrder({
        total: 7,
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'in_preparazione',
            status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
          },
        ],
        order_items: [{ id: 'ord1-0', drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
      })
    )
    // Senza il calcolo in riga, la riga singola senza subtotale resterebbe
    // SENZA PREZZO: il subtotale ora c'è sempre.
    expect(document.querySelector('.posd-riga-tot')).not.toBeNull()
    expect(screen.queryByText(/↳ 1 × 7,00/)).toBeNull()
    localStorage.removeItem('tana:pos:calcoli')
  })
})

// ── UN CONTO ANNULLATO NON È UN CONTO VUOTO ──────────────────────────
// Annullando, tutte le comande diventano «annullate» e la schermata le
// saltava: si apriva un conto senza una riga e a zero euro, e non si
// capiva né cosa ci fosse dentro né se valesse la pena riaprirlo (BUG-002).
describe('il conto annullato mostra cosa c’era dentro', () => {
  const annullato = () =>
    baseOrder({
      status: 'annullato',
      workflow_status: 'annullato',
      total: 0,
      comande: [
        {
          id: 'c1',
          seq: 1,
          status: 'annullato',
          status_times: {},
          items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
        },
      ],
      order_items: [{ id: 'i1', drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
    })

  it('le righe ci sono', async () => {
    await mount(annullato())
    expect(screen.getAllByText(/Mojito/).length).toBeGreaterThan(0)
  })

  it('si vede che non contano più: barrate', async () => {
    await mount(annullato())
    expect(document.querySelector('.draft-line.riga-annullata')).toBeTruthy()
  })

  it('ma non fanno somma: quel conto non lo paga nessuno', async () => {
    await mount(annullato())
    // Il totale resta a zero: un numero diverso lo farebbe sembrare ancora
    // da incassare.
    expect(screen.getAllByText('0,00 €').length).toBeGreaterThan(0)
  })

  it('dentro un conto APERTO una comanda annullata resta fuori', async () => {
    // Lì quella roba non si fa e non si paga: mostrarla vorrebbe dire
    // rimetterla nel conto.
    await mount(
      baseOrder({
        total: 7,
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'in_preparazione',
            status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
          },
          {
            id: 'c2',
            seq: 2,
            status: 'annullato',
            status_times: {},
            items: [{ drink_id: 'negroni', name: 'Negroni', unit_price: 8, qty: 1 }],
          },
        ],
        order_items: [{ id: 'i1', drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
      })
    )
    expect(screen.queryByText('Negroni')).toBeNull()
  })
})

// RIORDINARE LE RIGHE DEL CONTO. Si potevano già spostare, ma a
// lungo-premuto e con un movimento fatto a mano: la riga saltava, le altre
// no, e capitava di spostarne una mentre si voleva solo toccarla. Ora è la
// stessa libreria della griglia, e si entra in «organizza» come lì: fuori
// di lì toccare una riga la APRE, che è quello che si fa mille volte a
// sera.
describe('organizza le righe del conto', () => {
  it('le maniglie compaiono solo in «organizza»', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <OrderPosDetail order={baseOrder()} />
      </MemoryRouter>
    )
    expect(screen.queryAllByLabelText('Sposta la riga')).toHaveLength(0)
    await user.click(await screen.findByRole('button', { name: /Organizza le righe/ }))
    expect((await screen.findAllByLabelText('Sposta la riga')).length).toBeGreaterThan(0)
    // E si esce come si è entrati.
    await user.click(screen.getByRole('button', { name: /Fine riordino/ }))
    expect(screen.queryAllByLabelText('Sposta la riga')).toHaveLength(0)
  })
})

// IL NUMERO SULLA CARD E LE RIGHE DEL CONTO DEVONO DIRE LA STESSA COSA.
// Un conto può portarsi dietro l'id di un prodotto che non c'è più —
// cancellato e rifatto, o un catalogo reimportato — e la card restava senza
// numero mentre le righe erano lì sotto, a vista: sembrava che il conto e
// la griglia parlassero di due cose diverse.
describe('la card segna quello che c’è nel conto', () => {
  it('anche se il conto porta un id di prodotto vecchio', async () => {
    const conIdVecchio = baseOrder({
      comande: [
        {
          id: 'c1',
          seq: 1,
          status: 'in_preparazione',
          items: [
            // Stesso nome del drink in griglia, id di un catalogo passato.
            { drink_id: 'id-di-un-tempo', name: 'Mojito', unit_price: 7, qty: 2 },
          ],
        },
      ],
    })
    render(
      <MemoryRouter>
        <OrderPosDetail order={conIdVecchio} />
      </MemoryRouter>
    )
    // Sulla card del Mojito compare il contatore: il conto e la griglia
    // dicono la stessa cosa. (Il «−» accanto alla quantità esiste solo
    // sulle card con qualcosa dentro.)
    // La card mostra il contatore col «2»: sulle card senza niente dentro
    // quel gruppo è nascosto.
    const contatore = await screen.findByText('2', { selector: 'span' })
    expect(contatore).toBeInTheDocument()
  })
})

// I +/− NON APRONO LA RIGA. Toccare la riga apre la scheda dell'item — è
// così che si cambia il prezzo o si mette una nota — ma il clic sui tasti
// della quantità risaliva fin lì: si aumentava di uno e ci si ritrovava
// dentro la modifica, ogni volta.
describe('i tasti della quantità nel conto', () => {
  it('il «+» aumenta e basta: non apre la scheda dell’item', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <OrderPosDetail order={baseOrder()} />
      </MemoryRouter>
    )
    await user.click((await screen.findAllByRole('button', { name: /Aumenta Mojito/ }))[0])
    expect(screen.queryByRole('dialog', { name: /Modifica/i })).toBeNull()
    // E la scheda si apre ancora toccando la riga.
    await user.click(screen.getAllByText('Mojito')[1])
    expect(await screen.findByLabelText(/Prezzo/i)).toBeInTheDocument()
  })
})

// LA ⓘ SI PUÒ SPEGNERE. Dove il listino lo sanno tutti a memoria è un
// segno in più su ogni card, e le card sono cento; dove invece cambia
// spesso, o si dà una mano il sabato, è la differenza fra saper fare un
// drink e doverlo chiedere. Lo decide il locale.
describe('la ⓘ delle ricette', () => {
  it('c’è di suo', async () => {
    render(
      <MemoryRouter>
        <OrderPosDetail order={baseOrder()} />
      </MemoryRouter>
    )
    expect((await screen.findAllByRole('button', { name: /Come si fa/ })).length).toBeGreaterThan(0)
  })

  it('e sparisce se il locale la spegne', async () => {
    mockSettings.pos_ricetta_info = false
    render(
      <MemoryRouter>
        <OrderPosDetail order={baseOrder()} />
      </MemoryRouter>
    )
    await waitFor(() =>
      expect(screen.queryAllByRole('button', { name: /Come si fa/ })).toHaveLength(0)
    )
    delete mockSettings.pos_ricetta_info
  })
})

// ── IL PAGAMENTO VEDE IL CONTO COM'È A SCHERMO ───────────────────────
//
// Battendo di corsa e aprendo subito il pagamento, quello che si vedeva era
// il conto che sapeva IL SERVER: le righe appena battute stavano ancora
// nella bozza, e nella schermata di pagamento non c'erano — quattro righe di
// qua, tre di là, col cliente davanti. Le righe sono locali: il pagamento
// deve leggerle da lì, non aspettare che il server risponda.
describe('aprire il pagamento subito dopo aver battuto', () => {
  it('le righe appena battute ci sono già, e il totale le conta', async () => {
    const user = userEvent.setup()
    // Conto da 2 Mojito (14 €). Se ne battono altri due Gin Tonic (16 €) e
    // si apre il pagamento nello stesso respiro.
    await mount(baseOrder())
    await user.click(screen.getAllByText('Gin Tonic')[0])
    await user.click(screen.getAllByRole('button', { name: /Pagamento/ })[0])

    const pagamento = await screen.findByRole('dialog', { name: /Pagamento/ })
    expect(within(pagamento).getByText(/Gin Tonic/)).toBeInTheDocument()
    // 2 Mojito (14 €) + il Gin Tonic appena battuto (8 €).
    expect(within(pagamento).getAllByText('22,00 €').length).toBeGreaterThan(0)
  })
})

// ── BATTERE IN FRETTA E USCIRE ───────────────────────────────────────
// Tre tap sullo stesso prodotto e via, di corsa, verso la coda: ne arrivava
// UNO SOLO. Le aggiunte aspettano un attimo prima di partire (l'auto-
// conferma), e uscendo i loro timer morivano con la schermata.
describe('uscendo, quello che si è battuto parte lo stesso', () => {
  it('tre tap veloci e via: al server arrivano tutti e tre', async () => {
    const user = userEvent.setup()
    const { unmount } = await mount(baseOrder())
    const gin = screen.getAllByText('Gin Tonic')[0]
    await user.click(gin)
    await user.click(gin)
    await user.click(gin)
    // Via subito, senza aspettare l'auto-conferma.
    unmount()

    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled())
    const ultimo = bartenderUpdateComanda.mock.calls.at(-1)[2]
    // Righe unite o separate poco importa: al server devono arrivare tre.
    const gt = (ultimo.items || [])
      .filter((i) => i.drink_id === 'gin')
      .reduce((s, i) => s + (Number(i.qty) || 0), 0)
    expect(gt).toBe(3)
  })
})

// ── UNA RICETTA CAMBIATA AL VOLO NON SI DIMENTICA ────────────────────
// Si tocca la riga, si mette il gin buono, il prezzo sale — e uscendo
// tornava quello di listino, col suo costo. Le modifiche a una comanda
// aspettano un attimo prima di partire, e uscendo il loro timer moriva con
// la schermata.
describe('la riga modificata a mano resta modificata', () => {
  it('cambio prezzo e via: al server arriva quello nuovo', async () => {
    const user = userEvent.setup()
    const { unmount } = await mount(baseOrder())
    // La riga del conto (comanda in preparazione): toccarla la apre.
    await user.click(screen.getAllByText('Mojito')[1] ?? screen.getAllByText('Mojito')[0])
    const prezzo = await screen.findByLabelText(/Prezzo/)
    await user.clear(prezzo)
    await user.type(prezzo, '12')
    await user.click(screen.getByRole('button', { name: /^Salva/ }))
    unmount()

    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled())
    const items = bartenderUpdateComanda.mock.calls.at(-1)[2].items || []
    expect(items.some((i) => Number(i.unit_price) === 12)).toBe(true)
  })
})


// ── LA PREPARAZIONE PARZIALE ───────────────────────────────
//
// Al banco capita di vedere tre gin tonic in una comanda e due in
// un'altra e prepararli insieme, per farli uscire in una volta sola. Non
// andrebbe fatto — un ticket si lavora intero — ma si fa: l'app non lo
// impedisce, lo REGISTRA, così il conto resta giusto e la coda dice
// davvero cosa è al banco e cosa aspetta ancora.
//
// La comanda di partenza si ANNULLA (resta come storia: la copia già
// stampata ha ancora un riscontro) e al suo posto ne nascono due — quella
// che si prepara adesso e il resto, che resta da fare.
describe('preparazione parziale di una comanda', () => {
  const daFare = (over = {}) =>
    baseOrder({
      workflow_status: 'ricevuto',
      comande: [
        {
          id: 'c1',
          seq: 1,
          status: 'ricevuto',
          status_times: {},
          created_at: '2026-08-16T21:00:00.000Z',
          items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 5 }],
        },
      ],
      ...over,
    })

  const apriComande = async (user) =>
    user.click(screen.getByRole('button', { name: /Comande \(1\)/ }))

  it('cinque da fare, se ne preparano due: due al banco e tre ancora da fare', async () => {
    const user = userEvent.setup()
    await mount(daFare())
    await apriComande(user)

    await user.click(screen.getByRole('button', { name: /Preparazione parziale/ }))
    await user.click(screen.getByRole('button', { name: 'Uno in più di Gin Tonic' }))
    await user.click(screen.getByRole('button', { name: 'Uno in più di Gin Tonic' }))
    await user.click(screen.getByRole('button', { name: 'Preparo questi' }))

    // le unità scelte, riga per riga: due dei cinque
    expect(preparazioneParziale).toHaveBeenCalledWith('ord1', 'c1', [2])

    // E SI VEDE SUBITO, senza aspettare il server: la comanda di partenza
    // è annullata, e al suo posto ce ne sono due — due gin tonic al banco
    // e tre ancora da fare. Il totale delle unità non è cambiato.
    const cards = [...document.querySelectorAll('.confirm-box .card')]
    const testo = cards.map((c) => c.textContent)
    expect(testo[0]).toMatch(/COMANDA 1/)
    // «Divisa», non «Annullato»: nel dato è annullata — serve a tenere la
    // storia — ma leggerlo qui farebbe pensare a un drink saltato, mentre
    // quei drink sono nelle due comande sotto.
    expect(testo[0]).toMatch(/Divisa/)
    expect(testo[0]).not.toMatch(/Annullato/)
    expect(testo[1]).toMatch(/COMANDA 2/)
    expect(testo[1]).toMatch(/In preparazione/)
    expect(testo[1]).toMatch(/2× Gin Tonic/)
    expect(testo[2]).toMatch(/COMANDA 3/)
    // «Da fare»: al banco il passo si chiama come la colonna.
    expect(testo[2]).toMatch(/Da fare/)
    expect(testo[2]).toMatch(/3× Gin Tonic/)
  })

  it('prese tutte le unità non si divide niente: la comanda avanza e basta', async () => {
    const user = userEvent.setup()
    await mount(daFare())
    await apriComande(user)

    await user.click(screen.getByRole('button', { name: /Preparazione parziale/ }))
    for (let i = 0; i < 5; i++) {
      await user.click(screen.getByRole('button', { name: 'Uno in più di Gin Tonic' }))
    }
    await user.click(screen.getByRole('button', { name: 'Preparo questi' }))

    expect(preparazioneParziale).toHaveBeenCalledWith('ord1', 'c1', [5])
    // niente comande in più: quella che c'era è passata al banco
    const cards = [...document.querySelectorAll('.confirm-box .card')]
    expect(cards.length).toBe(1)
    expect(cards[0].textContent).toMatch(/In preparazione/)
    expect(cards[0].textContent).not.toMatch(/Annullato|Divisa/)
  })

  it('senza scegliere niente non si può confermare', async () => {
    const user = userEvent.setup()
    await mount(daFare())
    await apriComande(user)
    await user.click(screen.getByRole('button', { name: /Preparazione parziale/ }))
    expect(screen.getByRole('button', { name: 'Preparo questi' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Lascia stare' }))
    expect(screen.queryByRole('button', { name: 'Preparo questi' })).not.toBeInTheDocument()
    expect(preparazioneParziale).not.toHaveBeenCalled()
  })

  it('UNA COMANDA IN PREPARAZIONE SI DIVIDE, e le due parti restano al banco', async () => {
    // È il caso vero: sto preparando cinque gin tonic, ne faccio uscire
    // tre adesso e due dopo. Nessuna delle due parti torna indietro.
    const user = userEvent.setup()
    await mount(daFare({ comande: [
      {
        id: 'c1', seq: 1, status: 'in_preparazione', status_times: {},
        items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 5 }],
      },
    ] }))
    await apriComande(user)
    await user.click(screen.getByRole('button', { name: /Preparazione parziale/ }))
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: 'Uno in più di Gin Tonic' }))
    }
    await user.click(screen.getByRole('button', { name: 'Preparo questi' }))
    expect(preparazioneParziale).toHaveBeenCalledWith('ord1', 'c1', [3])

    // e si vede subito: la vecchia divisa, le due nuove TUTTE E DUE al
    // banco, cinque unità in totale
    const cards = [...document.querySelectorAll('.confirm-box .card')]
    const testo = cards.map((c) => c.textContent)
    expect(testo[0]).toMatch(/Divisa/)
    expect(testo[1]).toMatch(/In preparazione/)
    expect(testo[1]).toMatch(/3× Gin Tonic/)
    expect(testo[2]).toMatch(/In preparazione/)
    expect(testo[2]).toMatch(/2× Gin Tonic/)
    // nessuna delle due torna indietro: sono due pill «In preparazione»,
    // non una in preparazione e una da fare
    expect(cards.filter((c) => c.querySelector('.pill.in_preparazione')).length).toBe(2)
  })

  it('non si propone su quello che è già sul vassoio, né su un drink solo', async () => {
    const user = userEvent.setup()
    const { unmount } = await mount(daFare({ comande: [
      {
        id: 'c1', seq: 1, status: 'pronto', status_times: {},
        items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 5 }],
      },
    ] }))
    await apriComande(user)
    expect(screen.queryByRole('button', { name: /Preparazione parziale/ })).not.toBeInTheDocument()
    unmount()

    await mount(daFare({ comande: [
      {
        id: 'c1', seq: 1, status: 'ricevuto', status_times: {},
        items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }],
      },
    ] }))
    await apriComande(user)
    expect(screen.queryByRole('button', { name: /Preparazione parziale/ })).not.toBeInTheDocument()
  })
})

// ── A CHE PUNTO È QUESTO CONTO, RIGA PER RIGA ───────────────────
//
// Gli stati del servizio stanno sulle COMANDE, non sul conto: di base la
// comanda è una sola ed esce tutta per l'intero ordine, e allora tutti i
// drink sono nello stesso passo — non c'è niente da intestare. Appena il
// banco ne divide una per prepararne una parte, invece, aprendo il conto si
// deve vedere cosa è al banco e cosa è già uscito.
describe('le righe del conto dicono a che punto sono', () => {
  const titoli = () =>
    [...document.querySelectorAll('.posd-gruppo')].map((n) => n.textContent)

  it('con una comanda sola non c’è nessun titolo: sarebbe un titolo per dire una cosa sola', async () => {
    await mount(baseOrder())
    expect(titoli()).toEqual([])
  })

  // SENZA GLI STATI DEL SERVIZIO QUEI TITOLI NON ESISTONO. Il locale che
  // non segue la preparazione non ha un «in preparazione» da nessuna parte:
  // vederselo comparire in mezzo alle righe di un conto è una parola che
  // parla di una cosa che lì non si fa (BUG-033). Resta la divisione dei
  // pagati, che c'era da prima e riguarda i soldi, non il lavoro.
  it('col servizio spento i passi non si vedono, i pagati sì', async () => {
    mockSettings.workflow_enabled = false
    try {
      await mount(
        baseOrder({
          comande: [
            {
              id: 'c1', seq: 1, status: 'in_preparazione', status_times: {},
              items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 2 }],
            },
            {
              id: 'c2', seq: 2, status: 'ricevuto', status_times: {},
              items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
            },
          ],
        })
      )
      expect(titoli()).toEqual([])
    } finally {
      delete mockSettings.workflow_enabled
    }
  })

  // MA I PAGATI SI VEDONO SEMPRE. Quella divisione non parla di lavoro,
  // parla di soldi: dice cosa è già stato incassato e cosa no, e serve
  // esattamente quanto prima — anzi di più, perché senza i passi del
  // servizio è l'unica cosa che divide le righe.
  // I BOLLI DEL SERVIZIO SEGUONO LA STESSA REGOLA DEI TITOLI: se il locale
  // non segue la preparazione, «In preparazione» non va scritto da nessuna
  // parte — nemmeno nel riquadro delle comande, che è il posto dove si
  // guarda cosa è stato battuto.
  it('col servizio spento il riquadro Comande non mostra i passi', async () => {
    mockSettings.workflow_enabled = false
    try {
      const user = userEvent.setup()
      await mount(baseOrder())
      await user.click(screen.getByRole('button', { name: /Comande/ }))
      const box = document.querySelector('.confirm-box')
      expect(box).toBeTruthy()
      expect(box.textContent).not.toMatch(/In preparazione|Da fare|Pronto/)
    } finally {
      delete mockSettings.workflow_enabled
    }
  })

  it('col servizio spento i pagati restano separati, e in fondo', async () => {
    mockSettings.workflow_enabled = false
    try {
      await mount(
        baseOrder({
          payment_status: 'parziale',
          payments: [
            {
              amount: 7,
              method: 'banco',
              at: '2026-07-11T21:30:00.000Z',
              items: [{ drink_id: 'mojito', name: 'Mojito', qty: 1 }],
            },
          ],
          comande: [
            {
              id: 'c1', seq: 1, status: 'in_preparazione', status_times: {},
              items: [
                { drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 },
                { drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 },
              ],
            },
          ],
        })
      )
      // un titolo solo, quello dei pagati: nessun passo del servizio
      expect(titoli()).toEqual(['💳 Pagati'])
      // e sta in fondo: le righe ancora da pagare vengono prima
      const righe = [...document.querySelectorAll('.posd-gruppo, .draft-line')]
      expect(righe.at(-1).className).toContain('draft-line')
      expect(righe.findIndex((n) => n.className.includes('posd-gruppo'))).toBeGreaterThan(0)
    } finally {
      delete mockSettings.workflow_enabled
    }
  })

  it('divisa la comanda, le righe si raggruppano per passo', async () => {
    await mount(
      baseOrder({
        comande: [
          {
            id: 'c1', seq: 1, status: 'in_preparazione', status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
          },
          {
            id: 'c2', seq: 2, status: 'pronto', status_times: {},
            items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }],
          },
        ],
      })
    )
    expect(titoli()).toEqual(['🍹 In preparazione', '🔔 Pronto'])
    // e le righe stanno sotto il titolo giusto, in ordine di lavorazione
    const righe = [...document.querySelectorAll('.posd-gruppo, .draft-line')].map((n) =>
      n.textContent.replace(/\s+/g, ' ').trim()
    )
    expect(righe[0]).toContain('In preparazione')
    expect(righe[1]).toContain('Mojito')
    expect(righe[2]).toContain('Pronto')
    expect(righe[3]).toContain('Gin Tonic')
  })

  it('PAGATO IN CASSA E IN PREPARAZIONE AL BANCO: si dicono tutte e due', async () => {
    // Un conto si incassa in qualunque stato di servizio: dalla cassa è
    // chiuso, dal banco magari no. Se il gruppo «Pagati» scacciasse quello
    // del servizio, aprendo il conto si leggerebbe che è tutto sistemato
    // mentre un drink è ancora da fare.
    await mount(
      baseOrder({
        payment_status: 'parziale',
        payments: [{ items: [{ drink_id: 'gin', qty: 1 }] }],
        comande: [
          {
            id: 'c1', seq: 1, status: 'in_preparazione', status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
          },
          {
            id: 'c2', seq: 2, status: 'ritirato', status_times: {},
            items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }],
          },
        ],
      })
    )
    expect(titoli()).toEqual(['🍹 In preparazione', '💳 Pagati'])
  })
})

// ── LA SALA SERVE, NON PREPARA (REQ-STAFF-014) ────────────────────────
//
// Chi sta in sala vede a che punto è il lavoro — gli serve per sapere cosa
// portare — ma non lo comanda: l'unico passo che segna è «servito», perché
// è lui a portare il drink al tavolo. Sul CONTO invece lavora, e quello che
// aggiunge arriva al banco come un ticket NUOVO: infilarlo in una comanda
// che qualcuno sta già preparando vuol dire cambiargli il lavoro sotto le
// mani.
describe('la sala e il conto', () => {
  const inSala = async (order = baseOrder()) => {
    ruoloCorrente = 'staff'
    return await mount(order)
  }

  it('quello che aggiunge fa una comanda NUOVA, non entra in quella del banco', async () => {
    const user = userEvent.setup()
    await inSala()
    await user.click(screen.getAllByText('Gin Tonic')[0])
    await waitFor(() => expect(addComanda).toHaveBeenCalled())
    // La comanda c1 del conto di prova è ancora «da fare»: al banco le righe
    // ci sarebbero confluite dentro. Alla sala no.
    expect(bartenderUpdateComanda).not.toHaveBeenCalled()
    const [orderId, items] = addComanda.mock.calls.at(-1)
    expect(orderId).toBe('ord1')
    expect(items.some((i) => i.drink_id === 'gin')).toBe(true)
  })

  it('anche il «+» su una riga già mandata: un drink in più, in un ticket nuovo', async () => {
    const user = userEvent.setup()
    await inSala()
    await user.click(screen.getByRole('button', { name: 'Aumenta Mojito' }))
    await waitFor(() => expect(addComanda).toHaveBeenCalled())
    expect(bartenderUpdateComanda).not.toHaveBeenCalled()
  })

  // Il ruolo arriva dal token, cioè un battito dopo il primo disegno: fino a
  // lì la schermata resta quella del banco, apposta (vedi ruoli.js).
  it('le righe già mandate al banco non le toglie', async () => {
    await inSala()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Riduci Mojito' })).toBeDisabled()
    )
  })

  it('non prende in carico: «Segna “In preparazione”» non c’è', async () => {
    const user = userEvent.setup()
    await inSala()
    await user.click(screen.getByRole('button', { name: /Stato servizio/ }))
    expect(screen.queryByRole('button', { name: /Segna “In preparazione”/ })).toBeNull()
  })

  it('ma quello che porta al tavolo lo segna servito', async () => {
    const user = userEvent.setup()
    await inSala(
      baseOrder({
        workflow_status: 'pronto',
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'pronto',
            status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
          },
        ],
      })
    )
    await user.click(screen.getByRole('button', { name: /Stato servizio/ }))
    await user.click(screen.getByRole('button', { name: /Segna “Ritirato\/Servito”/ }))
    expect(advanceComanda).toHaveBeenCalledWith('ord1', 'c1', 'ritirato')
  })

  it('non divide e non torna indietro', async () => {
    const user = userEvent.setup()
    await inSala(
      baseOrder({
        comande: [
          {
            id: 'c1',
            seq: 1,
            status: 'in_preparazione',
            status_times: {},
            items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 5 }],
          },
        ],
      })
    )
    await user.click(screen.getByRole('button', { name: /Stato servizio/ }))
    expect(screen.queryByRole('button', { name: /Preparazione parziale/ })).toBeNull()
    expect(screen.queryByText('Torna a')).toBeNull()
  })

  it('e non butta il conto: annullare è di chi versa', async () => {
    await inSala()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Annulla ordine/ })).toBeDisabled()
    )
  })

  it('al banco invece non cambia niente', async () => {
    const user = userEvent.setup()
    await mount(baseOrder())
    await user.click(screen.getAllByText('Gin Tonic')[0])
    await waitFor(() => expect(bartenderUpdateComanda).toHaveBeenCalled())
    expect(addComanda).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Annulla ordine/ })).toBeEnabled()
  })
})

// ── LO STATO DELLA LAVORAZIONE STA NELLA BARRA IN ALTO ──────────────────
// «Sposta lo stato di servizio nella barra in alto come indicato dalla
// freccia rossa» (l'utente, 21/08/2026, con la freccia sullo spazio vuoto a
// destra della barra). Prima la pastiglia stava nella testata della colonna
// del conto, accanto al numero e in mezzo ai tasti delle righe.
// QUI SI CONTROLLA SOLO DOVE STA: quando compare e cosa dice non sono
// cambiati, e i test che lo dicono stanno qui sotto insieme agli altri —
// serve a non «sistemare» il posto rompendo la regola.
describe('lo stato della lavorazione sta nella barra in alto', () => {
  const barra = () => document.querySelector('.posd-topbar')
  const pastiglia = () => document.querySelector('.posd-topbar .posd-stato')
  // La testata della colonna del conto: la riga col nome e i tasti ↕ ▲ ⋯.
  const testataColonna = () => document.querySelector('.posd-title')?.parentElement

  // SCHERMO LARGO, salvo dove è scritto il contrario: un blocco più su lascia
  // `matchMedia` incantato sul telefono, e senza questo i test di qui
  // leggerebbero una barra diversa da quella che stanno descrivendo.
  beforeEach(() => {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  })

  it('sta nella barra in alto, e non più nella testata della colonna', async () => {
    await mount(baseOrder())
    expect(pastiglia()).toBeTruthy()
    expect(pastiglia().textContent).toMatch(/Da fare/)
    // Una sola in tutta la schermata: se restasse anche di là sarebbero due
    // posti per la stessa risposta, e uno dei due invecchierebbe.
    expect(document.querySelectorAll('.posd-stato')).toHaveLength(1)
    expect(testataColonna()).toBeTruthy()
    expect(testataColonna().querySelector('.posd-stato')).toBeNull()
  })

  // I SOLDI DA UNA PARTE, IL LAVORO DALL'ALTRA. Nella barra si legge da
  // sinistra: numero, ora e stato del CONTO stanno insieme, lo stato del
  // LAVORO va in fondo — dove punta la freccia dell'utente.
  it('è l’ultima della barra, dopo lo stato del conto', async () => {
    await mount(baseOrder())
    const figli = [...barra().children]
    const conto = barra().querySelector('.posd-conto-stato')
    expect(figli.indexOf(conto)).toBeGreaterThan(-1)
    expect(figli.indexOf(conto)).toBeLessThan(figli.indexOf(pastiglia()))
    expect(figli.at(-1)).toBe(pastiglia())
  })

  // DUE PASTIGLIE VICINE NON DEVONO SEMBRARE LA STESSA COSA: «🟢 Conto
  // aperto» e «🔔 Pronto» sono pure dello stesso verde. Ognuna dice di cosa
  // parla a chi ci si ferma sopra.
  it('si distingue da quella del conto: ognuna dice di cosa parla', async () => {
    await mount(baseOrder())
    expect(barra().querySelector('.posd-conto-stato').getAttribute('title')).toMatch(
      /^Stato del conto/
    )
    expect(pastiglia().getAttribute('title')).toMatch(/^Stato della lavorazione/)
  })

  // IL PASSO PIÙ INDIETRO, non il più avanti: chi apre un conto vuole sapere
  // quanto MANCA. È la stessa regola con cui la coda decide lo stato di un
  // conto, e le due schermate non possono discordare.
  it('con più comande dice il passo PIÙ INDIETRO', async () => {
    await mount(
      baseOrder({
        comande: [
          {
            id: 'c1', seq: 1, status: 'pronto', status_times: {},
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 }],
          },
          {
            id: 'c2', seq: 2, status: 'in_preparazione', status_times: {},
            items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }],
          },
        ],
      })
    )
    expect(pastiglia().textContent).toMatch(/In preparazione/)
  })

  // LA BARRA SA DI ESSERE PIÙ PIENA. Con la pastiglia a bordo si marca
  // `con-lavoro`, e da lì il foglio di stile decide cosa togliere quando lo
  // spazio manca — misurando la barra e non la finestra, che con lo zoom
  // dell'app mente (`zoom` su #root: al 120% un tablet da 768px di barra ne
  // ha 640 veri).
  it('la barra si marca «con-lavoro» solo quando la pastiglia c’è', async () => {
    await mount(baseOrder())
    expect(barra().classList.contains('con-lavoro')).toBe(true)
    mockSettings.workflow_enabled = false
    try {
      await mount(baseOrder())
      expect([...document.querySelectorAll('.posd-topbar')].at(-1).classList.contains('con-lavoro')).toBe(
        false
      )
    } finally {
      delete mockSettings.workflow_enabled
    }
  })

  it('col servizio spento non c’è: quel passo lì non esiste per nessuno', async () => {
    mockSettings.workflow_enabled = false
    try {
      await mount(baseOrder())
      expect(document.querySelector('.posd-stato')).toBeNull()
    } finally {
      delete mockSettings.workflow_enabled
    }
  })

  it('a conto chiuso non c’è: non è più una cosa da fare', async () => {
    await mount(baseOrder({ status: 'pagato', payment_status: 'pagato' }))
    expect(document.querySelector('.posd-stato')).toBeNull()
  })

  it('in creazione non c’è: non c’è ancora nessuna comanda', async () => {
    await mount(null)
    expect(document.querySelector('.posd-stato')).toBeNull()
  })

  // SUL TELEFONO LA BARRA È STRETTA. Misurata in Chrome vero: al completo
  // chiede 505px, e un telefono ne ha 360-430. Con lo stato del lavoro a
  // bordo cedono l'ora (si rilegge nella storia del conto) e la PAROLA
  // dello stato del conto, che resta il suo segno — il nome per esteso non
  // si perde, sta nel title. Quello che NON cede è la pastiglia appena
  // arrivata: è l'unica cosa lassù che dice a che punto è il lavoro.
  describe('sul telefono', () => {
    beforeEach(() => {
      window.matchMedia = (query) => ({
        matches: query.includes('700px'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })
    })

    it('la pastiglia del lavoro resta per esteso, e cedono ora e parola del conto', async () => {
      await mount(baseOrder({ created_at: '2026-08-21T21:00:00.000Z' }))
      expect(pastiglia().textContent).toMatch(/Da fare/)
      expect(document.querySelector('.posd-aperto')).toBeNull()
      const conto = barra().querySelector('.posd-conto-stato')
      expect(conto.textContent.trim()).toBe('🟢')
      expect(conto.getAttribute('title')).toBe('Stato del conto: Conto aperto')
    })

    it('senza lo stato del lavoro la barra resta quella di prima', async () => {
      mockSettings.workflow_enabled = false
      try {
        await mount(baseOrder({ created_at: '2026-08-21T21:00:00.000Z' }))
        expect(document.querySelector('.posd-aperto')).toBeTruthy()
        expect(barra().querySelector('.posd-conto-stato').textContent).toMatch(/Conto aperto/)
      } finally {
        delete mockSettings.workflow_enabled
      }
    })
  })
})

// ── LE FASCE CHE POSSONO CEDERE (BUG-077) ────────────────────────────
//
// Con lo zoom alto l'altezza disponibile cala di un terzo, le misure fisse
// no, e i tasti in fondo finivano FUORI dal riquadro — `overflow: hidden`
// sopra, niente da scorrere: irraggiungibili, non scomodi (40 combinazioni
// su 77, misurate in Chrome). Le regole che li tengono dentro stanno nel
// foglio e sono sorvegliate da tests/unit/css.test.js, ma si appoggiano a
// una STRUTTURA: quello che si legge separato da quello che si preme, e i
// due gesti della serata in un contenitore che non cede. Se qualcuno
// togliesse questi involucri dal componente, il foglio resterebbe giusto e
// inerte — e il difetto tornerebbe senza che niente si accorga.
describe('il piede del conto: cosa cede e cosa resta', () => {
  it('i numeri stanno in `.posd-foot-info`, separati dai tasti', async () => {
    await mount(baseOrder({ coperto_amount: 2, service_charge_amount: 1.5 }))
    const info = document.querySelector('.posd-comanda-foot .posd-foot-info')
    expect(info, 'i numeri del piede non hanno più il loro involucro').toBeTruthy()
    expect(within(info).getByText('Totale')).toBeInTheDocument()
    // E NON contiene i tasti: se li inglobasse, cedendo si porterebbe via
    // anche quelli — che è esattamente il difetto.
    expect(info.querySelector('.posd-foot-azioni')).toBeNull()
  })

  it('«Invia comanda» e «Pagamento» stanno nella riga che non cede', async () => {
    await mount(baseOrder())
    const riga = document.querySelector('.posd-foot-azioni .grid-2')
    expect(riga, 'la riga dei due gesti non c’è più').toBeTruthy()
    expect(within(riga).getByRole('button', { name: /Invia comanda/ })).toBeInTheDocument()
    expect(within(riga).getByRole('button', { name: /Pagamento/ })).toBeInTheDocument()
  })

  it('«Stato servizio» e «Annulla ordine» stanno in `.posd-foot-secondarie`', async () => {
    // Sono loro a scorrere quando l'altezza non basta per tutti: mai a
    // sparire, che è quello che facevano prima.
    await mount(baseOrder())
    const secondarie = document.querySelector('.posd-foot-azioni .posd-foot-secondarie')
    expect(secondarie, 'i due secondari non hanno più il loro involucro').toBeTruthy()
    expect(within(secondarie).getByRole('button', { name: /Annulla ordine/ })).toBeInTheDocument()
    expect(within(secondarie).getByRole('button', { name: /Stato servizio/ })).toBeInTheDocument()
  })

  it('la testata della colonna è `.posd-testa`, non uno `style` inline', async () => {
    // Da inline `flex-shrink: 0` vinceva sempre, e la testata restava una
    // fascia rigida che spingeva fuori i tasti del piede.
    await mount(baseOrder())
    const testa = document.querySelector('.posd-comanda .posd-testa')
    expect(testa, 'la testata della colonna non ha più la sua classe').toBeTruthy()
    expect(testa.getAttribute('style')).toBeNull()
  })
})
