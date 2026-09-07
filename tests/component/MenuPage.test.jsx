// @vitest-environment happy-dom
'use strict'

// IL MENÙ È UNO SOLO. C'è stata una seconda schermata, riservata allo staff:
// catalogo a due colonne con la ricerca, nata per gli ordini battuti a mano.
// Quelli si battono al POS, e chi apriva il menù dal gestionale si trovava
// una pagina diversa da quella che stava mostrando al tavolo. Ora chi lavora
// vede lo stesso menù del cliente — e ci può ordinare, se le impostazioni lo
// consentono. La RICERCA è tornata, ma dentro la stessa pagina e solo per lo
// staff: la sala prende l'ordine col cliente davanti e non può scorrere otto
// categorie; il cliente invece sfoglia la vetrina, senza barra.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from '../helpers/router.jsx'
import '@testing-library/jest-dom/vitest'

let mockSettings = {}
let ruoloClaim = 'bartender'

vi.mock('../../src/lib/api.js', () => ({
  subscribeServiceStats: vi.fn(() => () => {}),
  subscribeSettings: vi.fn((cb) => {
    cb({ service_mode: 'tavolo', menu_only: false, ...mockSettings })
    return () => {}
  }),
  subscribeOrder: vi.fn((id, cb) => {
    cb(ordineRicordato)
    return () => {}
  }),
  subscribeReadyOrders: vi.fn(() => () => {}),
  subscribeOpenGroups: vi.fn(() => () => {}),
  subscribeRecentGroups: vi.fn(() => () => {}),
  createOrder: vi.fn(() => Promise.resolve({
    id: 'o1',
    daily_number: 7,
    order_items: [{ drink_id: 'd1', name: 'Mojito', qty: 1, unit_price: 7 }],
    comande: [{ id: 'c1', seq: 1, items: [{ drink_id: 'd1', name: 'Mojito', qty: 1, unit_price: 7 }] }],
  })),
  DEFAULT_SETTINGS: { service_mode: 'tavolo' },
  settingsIniziali: () => ({ service_mode: 'tavolo' }),
}))

const DRINKS = [
  { id: 'd1', name: 'Mojito', price: 7, category_id: 'c1', available: true },
  { id: 'd2', name: 'Negroni', price: 8, category_id: 'c1', available: true },
  { id: 'd3', name: 'Ichnusa', price: 4, category_id: 'c2', available: true },
]
let mockDrinks = DRINKS

vi.mock('../../src/lib/menuCache.js', () => ({
  useMenu: () => ({
    loading: false,
    cats: [
      { id: 'c1', name: 'Cocktail', sort_order: 1 },
      { id: 'c2', name: 'Birre', sort_order: 2 },
    ],
    drinks: mockDrinks,
  }),
}))

// L'ordine che questo dispositivo si ricorda (il cliente lo ritrova in cima
// al menù; chi lavora no).
const ordineRicordato = {
  id: 'o-mio',
  daily_number: 7,
  workflow_status: 'ricevuto',
  total: 8,
  order_items: [{ drink_id: 'd1', name: 'Negroni', qty: 1, unit_price: 8 }],
}

vi.mock('../../src/lib/firebaseClient.js', () => ({
  isFirebaseConfigured: true,
  auth: {},
  db: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb(
      ruoloClaim
        ? {
            email: 'anna@tana.it',
            displayName: 'Anna',
            getIdTokenResult: () => Promise.resolve({ claims: { role: ruoloClaim } }),
          }
        : null
    )
    return () => {}
  },
}))

vi.mock('../../src/lib/customerAuth.js', () => ({
  useCustomer: () => ({ user: null, profile: null }),
}))

vi.mock('../../src/lib/push.js', () => ({ getPushToken: vi.fn(() => Promise.resolve(null)) }))
vi.mock('../../src/lib/notify.js', () => ({ ensureNotificationPermission: vi.fn() }))
vi.mock('../../src/components/StaffDrawer.jsx', () => ({ default: () => null }))

// La stampa non si prova davvero (non c'è nessuna Epson qui): si guarda se
// l'ordine preso al tavolo chiede la sua comanda, e a chi.
let stampaSala = 'ip'
const stampata = vi.fn(() => Promise.resolve())
vi.mock('../../src/lib/printer.js', () => ({
  printComanda: (...a) => stampata(...a),
  salaStampaDaSe: () => stampaSala !== 'rimbalzo',
}))

import MenuPage from '../../src/pages/MenuPage.jsx'

function mostra(percorso = '/menu') {
  return render(
    <MemoryRouter initialEntries={[percorso]}>
      <MenuPage />
    </MemoryRouter>
  )
}

// I prodotti come li vede chi guarda: le card del menù cliente.
const voci = () =>
  [...document.querySelectorAll('.menu-item h3')].map((e) => e.textContent)

beforeEach(() => {
  mockSettings = {}
  mockDrinks = DRINKS
  ruoloClaim = 'bartender'
  stampaSala = 'ip'
  stampata.mockClear()
  localStorage.clear()
  // Al primo accesso il menù mostra il benvenuto a tutta pagina.
  localStorage.setItem('tana_welcome_v1', '1')
})

describe('il menù è uno solo, quello del cliente', () => {
  it('allo staff arriva lo stesso menù, non più il catalogo a due colonne', async () => {
    mostra()
    // Il segno che si è dello staff c'è (l'ordine viene marcato col nome),
    // ma la pagina sotto è la stessa del cliente.
    await screen.findByText(/Inserimento ordine da/)
    expect(voci()).toEqual(['Mojito', 'Negroni', 'Ichnusa'])
    expect(document.querySelector('.staff-menu')).toBeNull()
    expect(document.querySelector('.staff-cats')).toBeNull()
  })

  it('lo staff ha la ricerca: filtra per nome e svuota le categorie mute', async () => {
    const user = userEvent.setup()
    mostra()
    await screen.findByText(/Inserimento ordine da/)
    await user.type(screen.getByPlaceholderText(/Cerca nel menù/), 'moj')
    expect(voci()).toEqual(['Mojito'])
    // La categoria rimasta senza voci sparisce con tutta la sua testata.
    expect(screen.queryByRole('heading', { name: 'Birre' })).toBeNull()
  })

  it('la ricerca a vuoto lo dice, senza lasciare la pagina muta', async () => {
    const user = userEvent.setup()
    mostra()
    await screen.findByText(/Inserimento ordine da/)
    await user.type(screen.getByPlaceholderText(/Cerca nel menù/), 'ramazzotti')
    expect(voci()).toEqual([])
    expect(screen.getByText(/Niente nel menù che risponda/)).toBeInTheDocument()
  })

  it('il cliente la barra di ricerca non ce l’ha: per lui resta la vetrina', async () => {
    ruoloClaim = null
    mostra()
    await screen.findByText('Mojito')
    expect(screen.queryByPlaceholderText(/Cerca nel menù/)).toBeNull()
  })

  it('lo stesso menù per il cliente', async () => {
    ruoloClaim = null
    mostra()
    await screen.findByText('Mojito')
    expect(voci()).toEqual(['Mojito', 'Negroni', 'Ichnusa'])
    expect(document.querySelector('.staff-menu')).toBeNull()
  })

  it('chi lavora può ordinare da qui: il prodotto entra nel carrello', async () => {
    const user = userEvent.setup()
    mostra()
    await screen.findByText(/Inserimento ordine da/)
    const aggiungi = screen.getAllByRole('button', { name: /Aggiungi/ })
    await user.click(aggiungi[0])
    expect(screen.getByText(/Rivedi ordine/)).toBeInTheDocument()
  })

  // IN CARTA CI VA QUELLO CHE SI BEVE.
  // La lista ingredienti sotto al drink stampa le righe della ricetta, e fra
  // quelle righe adesso c'è anche la manodopera, che è una voce di magazzino
  // in unità generiche (U) messa lì per far entrare il lavoro nel costo:
  // «Tempo di Lavorazione 3 U» non è roba da far leggere a chi ordina.
  it('la manodopera non si mostra al cliente', async () => {
    ruoloClaim = null
    mockSettings = { show_ingredient_quantities: true }
    mockDrinks = [
      {
        id: 'd4',
        name: 'Daiquiri',
        price: 8,
        category_id: 'c1',
        available: true,
        recipe_items: [
          { inventory_item_id: 'rum', name: 'Rum', unit: 'ml', qty: 50 },
          { inventory_item_id: 'lime', name: 'Lime', unit: 'pz', qty: 1 },
          { inventory_item_id: 'tempo', name: 'Tempo di Lavorazione', unit: 'U', qty: 3 },
        ],
      },
    ]
    mostra()
    await screen.findByText('Daiquiri')
    const ingredienti = document.querySelector('.ingredients').textContent
    expect(ingredienti).toContain('Rum')
    expect(ingredienti).toContain('Lime')
    expect(ingredienti).not.toContain('Tempo di Lavorazione')
    expect(ingredienti).not.toMatch(/\bU\b/)
  })

  it('e un drink con un solo ingrediente vero non elenca niente', async () => {
    // La lista si mostra da due ingredienti in su: contano quelli che si
    // vedono, non le righe della ricetta.
    ruoloClaim = null
    mockSettings = { show_ingredient_quantities: true }
    mockDrinks = [
      {
        id: 'd5',
        name: 'Shot di Rum',
        price: 4,
        category_id: 'c1',
        available: true,
        recipe_items: [
          { inventory_item_id: 'rum', name: 'Rum', unit: 'ml', qty: 40 },
          { inventory_item_id: 'tempo', name: 'Tempo di Lavorazione', unit: 'U', qty: 1 },
        ],
      },
    ]
    mostra()
    await screen.findByText('Shot di Rum')
    expect(document.querySelector('.ingredients')).toBeNull()
  })

  it('a «solo menù» il cliente guarda e basta: niente tasti per aggiungere', async () => {
    ruoloClaim = null
    mockSettings = { menu_only: true }
    mostra()
    await screen.findByText('Mojito')
    expect(screen.queryByRole('button', { name: /Aggiungi/ })).toBeNull()
    expect(screen.getByText(/Rivolgersi allo staff per ordinare/)).toBeInTheDocument()
  })
})

// ── LA COMANDA DI CHI PRENDE L'ORDINE AL TAVOLO ──────────────────────
// Prima non usciva niente: si sperava che al banco qualcuno tenesse aperta
// la coda con la stampa automatica accesa. Se quella schermata non era
// aperta, l'ordine restava solo a schermo e al banco non lo sapeva nessuno.
describe('la comanda dell’ordine preso in sala', () => {
  // Il giro vero: prodotto nel carrello, riepilogo, nome del cliente
  // (senza non si conferma) e conferma.
  async function ordina(user) {
    await user.click(screen.getAllByRole('button', { name: /Aggiungi/ })[0])
    await user.click(screen.getByRole('button', { name: /Rivedi ordine/ }))
    await user.type(await screen.findByPlaceholderText('es. Mario'), 'Anna')
    await user.click(screen.getByRole('button', { name: /Conferma ordine/ }))
  }

  it('la stampa il telefono che ha preso l’ordine', async () => {
    const user = userEvent.setup()
    mostra()
    await screen.findByText(/Inserimento ordine da/)
    await ordina(user)
    expect(stampata).toHaveBeenCalledTimes(1)
    expect(stampata.mock.calls[0][0].id).toBe('o1')
  })

  it('col rimbalzo il telefono non stampa: esce al banco', async () => {
    stampaSala = 'rimbalzo'
    const user = userEvent.setup()
    mostra()
    await screen.findByText(/Inserimento ordine da/)
    await ordina(user)
    expect(stampata).not.toHaveBeenCalled()
  })

  it('l’ordine del cliente non stampa dal telefono del cliente', async () => {
    ruoloClaim = null
    const user = userEvent.setup()
    mostra()
    await screen.findByText('Mojito')
    await ordina(user)
    expect(stampata).not.toHaveBeenCalled()
  })
})

// LA VISTA MENÙ, PER CHI LAVORA, SERVE A UNA COSA: battere un ordine. La
// coda è un'altra pagina — vedersi in mezzo i propri ordini attivi
// mescolava due mestieri. Al cliente invece servono: è l'unico posto dove
// ritrova quello che ha ordinato.
describe('gli ordini in cima al menù', () => {
  it('il cliente ritrova il suo', async () => {
    localStorage.setItem('tana_my_orders_v1', JSON.stringify(['o-mio']))
    ruoloClaim = null
    mostra()
    expect(await screen.findByText(/Ordine #7/)).toBeInTheDocument()
  })

  it('chi lavora no: gli ordini stanno in coda', async () => {
    localStorage.setItem('tana_my_orders_v1', JSON.stringify(['o-mio']))
    ruoloClaim = 'bartender'
    mostra()
    await waitFor(() => expect(screen.queryByText(/Ordine #7/)).toBeNull())
  })
})
