// @vitest-environment happy-dom
'use strict'

// ── IL LISTINO SI COMPILA NELLA SCHEDA DEL FORNITORE (REQ-MAG-035) ───
//
// L'utente, 27/08/2026, dopo aver provato quello che era stato costruito:
// «l'associazione prodotto → fornitori DEVE avvenire nella gestione
// Fornitori. Quando creo/modifico un fornitore mi si deve aprire una pagina
// dove posso associare i prodotti già in magazzino a quel fornitore, o
// addirittura CREARE un prodotto che poi andrà a finire in magazzino. Posso
// aggiungere anche un prezzo di listino, che poi sarà quello che vedrò
// quando compilerò/precompilerò un ordine».
//
// Il listino esisteva come DATO e si popolava solo consegnando ordini: un
// fornitore nuovo restava senza prezzi finché non gli si comprava qualcosa,
// e la schermata dell'ordine non aveva niente da proporre. Qui si sorveglia
// che quella porta resti aperta.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const NOVA = { id: 'nova', name: 'Nova', color: '#e74c3c', sort_order: 0 }
const ENOFEL = { id: 'enofel', name: 'Enofel', color: '#3498db', sort_order: 1 }

const CAMPARI = { id: 'campari', name: 'Campari', unit: 'pz', stock: 2, cost: 12, vat: 22, kind: 'scorta' }
const GIN = { id: 'gin', name: 'Gin Mare', unit: 'pz', stock: 5, cost: 30, vat: 22, kind: 'scorta' }

const stato = {
  fornitori: [NOVA, ENOFEL],
  items: [CAMPARI, GIN],
  listini: [],
  variazioni: [],
}

vi.mock('../../src/lib/cashSession.js', () => ({
  useCashSession: () => ({ session: null, open: false, loading: false }),
}))

vi.mock('../../src/lib/toast.js', () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }))

vi.mock('../../src/lib/api.js', () => ({
  fetchInventoryItems: vi.fn(async () => stato.items),
  fetchInventoryCategories: vi.fn(async () => []),
  fetchSuppliers: vi.fn(async () => stato.fornitori),
  fetchSupplierPrices: vi.fn(async () => stato.listini),
  fetchVariazioniPrezzo: vi.fn(async () => stato.variazioni),
  // Le due scritture del listino tornano quello che hanno COMPOSTO in
  // memoria: la vera non rilegge niente, e il mock non deve poter far
  // sembrare che funzioni una schermata che invece aspetta la rete.
  salvaRigaListino: vi.fn(
    ({ supplier_id, item_id, price, pezzi_per_collo, package_label, code, precedente }) => ({
      riga: {
        ...(precedente || {}),
        id: `${supplier_id}__${item_id}`,
        supplier_id,
        item_id,
        price: price == null || price === '' ? null : Number(price),
        // Il collo vuoto vale UNO, come nella vera: è la scala di
        // REQ-MAG-040, e un mock che rispondesse `undefined` proverebbe una
        // schermata che nella realtà non esiste.
        pezzi_per_collo: Number(pezzi_per_collo) >= 1 ? Math.round(Number(pezzi_per_collo)) : 1,
        package_label: package_label || null,
        code: code || null,
      },
      variazione: null,
    })
  ),
  eliminaRigaListino: vi.fn(),
  creaProdottoAListino: vi.fn(({ supplier_id, name, price }) => ({
    item: { id: 'nato', name, unit: 'pz', stock: 0, cost: 0, scheda_da_completare: true },
    riga: { id: `${supplier_id}__nato`, supplier_id, item_id: 'nato', price: price ?? null },
    variazione: null,
  })),
  fetchStockMovements: vi.fn(async () => []),
  fetchMacroCategories: vi.fn(async () => []),
  createInventoryItem: vi.fn(),
  updateInventoryItem: vi.fn(),
  deleteInventoryItem: vi.fn(),
  loadStock: vi.fn(),
  receiveBottles: vi.fn(),
  adjustStock: vi.fn(),
  createInventoryCategory: vi.fn(),
  updateInventoryCategory: vi.fn(),
  deleteInventoryCategory: vi.fn(),
  createMacroCategory: vi.fn(),
  updateMacroCategory: vi.fn(),
  deleteMacroCategory: vi.fn(),
  createSupplier: vi.fn(async ({ name }) => ({ id: 'nuovo', name, color: '#2ecc71' })),
  updateSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
  subscribeOpenCashSession: vi.fn((cb) => {
    cb(null)
    return () => {}
  }),
  subscribeActiveOrders: vi.fn((cb) => {
    cb([])
    return () => {}
  }),
  subscribeDrinks: vi.fn((_opts, cb) => {
    cb([])
    return () => {}
  }),
  subscribeSettings: vi.fn((cb) => {
    cb({ price_markup: 3, purchase_vat: 22 })
    return () => {}
  }),
  settingsIniziali: { price_markup: 3, purchase_vat: 22 },
  travasoMagazzino: vi.fn(),
  provaTravasoMagazzino: vi.fn(),
}))

import ListinoFornitore from '../../src/components/ListinoFornitore.jsx'
import { FornitoriPanel } from '../../src/components/InventoryManager.jsx'
import {
  salvaRigaListino,
  creaProdottoAListino,
  eliminaRigaListino,
  createSupplier,
} from '../../src/lib/api.js'

beforeEach(() => {
  vi.clearAllMocks()
  stato.fornitori = [NOVA, ENOFEL]
  stato.items = [CAMPARI, GIN]
  stato.listini = []
  stato.variazioni = []
})

describe('come ci si arriva: dalla scheda del fornitore', () => {
  it('ogni fornitore ha il suo listino, e si torna indietro da dove si è entrati', async () => {
    const user = userEvent.setup()
    render(<FornitoriPanel />)
    await screen.findByText('Nova')

    await user.click(screen.getByLabelText('Listino di Nova'))
    expect(await screen.findByText('Listino di Nova')).toBeInTheDocument()

    // LA VIA D'USCITA È UNA SOLA E DICE DOVE RIPORTA (docs/navigazione.md):
    // il listino è il dettaglio di una riga, non una sottosezione in più.
    await user.click(screen.getByText('← Fornitori'))
    await screen.findByText('Enofel')
    expect(screen.queryByText('Listino di Nova')).toBeNull()
  })

  // «Quando creo un fornitore mi si deve aprire una pagina dove posso
  // associare i prodotti» (l'utente): un fornitore appena creato è un
  // fornitore da cui non si sa ancora cosa si compra.
  it('creando un fornitore si apre il suo listino', async () => {
    const user = userEvent.setup()
    render(<FornitoriPanel />)
    await screen.findByText('Nova')

    await user.type(screen.getByPlaceholderText('Nuovo fornitore (es. NOVA)'), 'Font')
    stato.fornitori = [...stato.fornitori, { id: 'nuovo', name: 'Font', color: '#2ecc71' }]
    await user.click(screen.getByText('Aggiungi'))

    expect(createSupplier).toHaveBeenCalled()
    expect(await screen.findByText('Listino di Font')).toBeInTheDocument()
  })
})

describe('che cosa vende questo fornitore, e a quanto', () => {
  it('si cerca un prodotto del magazzino e lo si associa, col prezzo di listino', async () => {
    const user = userEvent.setup()
    render(<ListinoFornitore fornitore={NOVA} onIndietro={() => {}} />)
    await screen.findByText('Listino di Nova')

    await user.type(screen.getByLabelText('Cerca un prodotto in magazzino'), 'campa')
    await user.click(await screen.findByLabelText('Associa Campari a Nova'))

    expect(salvaRigaListino).toHaveBeenCalledWith(
      expect.objectContaining({ supplier_id: 'nova', item_id: 'campari', price: 12 })
    )
    // LA RIGA COMPARE SUBITO. Il listino non si rilegge — la lettura
    // finta torna sempre l'elenco vuoto — e se la schermata aspettasse il
    // server qui non ci sarebbe niente.
    const listino = screen.getByText('Prodotti a listino').closest('.card')
    expect(await within(listino).findByText('Campari')).toBeInTheDocument()
  })

  it('un prodotto già a listino non si ripropone nella ricerca', async () => {
    const user = userEvent.setup()
    stato.listini = [{ id: 'nova__campari', supplier_id: 'nova', item_id: 'campari', price: 12.5 }]
    render(<ListinoFornitore fornitore={NOVA} onIndietro={() => {}} />)
    await screen.findByText('Campari')

    await user.type(screen.getByLabelText('Cerca un prodotto in magazzino'), 'campa')
    await waitFor(() => expect(screen.queryByLabelText('Associa Campari a Nova')).toBeNull())
  })

  it('il prezzo si corregge sulla riga, e chi lo salva porta con sé quello di prima', async () => {
    const user = userEvent.setup()
    stato.listini = [{ id: 'nova__campari', supplier_id: 'nova', item_id: 'campari', price: 12.5 }]
    render(<ListinoFornitore fornitore={NOVA} onIndietro={() => {}} />)
    const prezzo = await screen.findByLabelText('Prezzo di Campari')
    expect(prezzo).toHaveValue(12.5)

    // Il tasto compare solo dove qualcosa è cambiato: cinquanta righe con
    // cinquanta «Salva» spenti sono cinquanta bersagli che non fanno niente.
    expect(screen.queryByText('Salva')).toBeNull()
    await user.clear(prezzo)
    await user.type(prezzo, '13')
    await user.click(screen.getByText('Salva'))

    expect(salvaRigaListino).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier_id: 'nova',
        item_id: 'campari',
        price: '13',
        // SENZA IL PREZZO DI PRIMA lo storico non saprebbe se è cambiato
        // qualcosa, e ogni salvataggio diventerebbe una variazione.
        precedente: expect.objectContaining({ price: 12.5 }),
      })
    )
    await waitFor(() => expect(screen.queryByText('Salva')).toBeNull())
  })

  it('si toglie un prodotto dal listino', async () => {
    const user = userEvent.setup()
    stato.listini = [{ id: 'nova__campari', supplier_id: 'nova', item_id: 'campari', price: 12.5 }]
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ListinoFornitore fornitore={NOVA} onIndietro={() => {}} />)
    await screen.findByText('Campari')

    await user.click(screen.getByLabelText('Dettagli di Campari'))
    await user.click(await screen.findByText('🗑 Togli dal listino'))

    expect(eliminaRigaListino).toHaveBeenCalledWith('nova', 'campari')
    await waitFor(() => expect(screen.queryByText('Campari')).toBeNull())
  })
})

// ── I PEZZI PER COLLO SI SCRIVONO QUI (REQ-MAG-040) ──────────────────
//
// «Da un fornitore le Bjorne vanno a pezzo, da un altro vanno a collo
// (cartone da X bottiglie)» (utente, 27/08/2026). Il numero è DEL FORNITORE e
// non del prodotto — sul prodotto sarebbe uno solo per tutti — quindi si
// compila da qui, che è la schermata del listino di quel fornitore: è dove
// Flavio dirà che da FONT la Bjorne va a 24.
describe('i pezzi per collo, e il prezzo che si ricava', () => {
  const BJORNE = { id: 'bjorne', name: 'Bjorne', unit: 'pz', stock: 0, cost: 1.2333, vat: 22, kind: 'scorta' }

  it('si scrive il numero, e accanto compare il prezzo del pezzo', async () => {
    const user = userEvent.setup()
    stato.items = [BJORNE]
    stato.listini = [{ id: 'nova__bjorne', supplier_id: 'nova', item_id: 'bjorne', price: 25.05 }]
    render(<ListinoFornitore fornitore={NOVA} onIndietro={() => {}} />)
    // Finché il collo non c'è, il prezzo è quello del pezzo e basta: nessun
    // secondo numero, nessuna parola nuova.
    expect(await screen.findByLabelText('Prezzo di Bjorne')).toHaveValue(25.05)
    expect(screen.queryByText('1,04 €/pz')).toBeNull()

    await user.click(screen.getByLabelText('Dettagli di Bjorne'))
    // Il campo parte da 1 — il collo da un pezzo, che è il caso normale — e
    // si riscrive: mostrare vuoto lascerebbe credere che il dato manchi.
    const perCollo = await screen.findByLabelText('Pezzi per collo')
    expect(perCollo).toHaveValue(1)
    await user.clear(perCollo)
    await user.type(perCollo, '24')

    // Adesso quel 25,05 è il prezzo del CARTONE, e la schermata lo dice: il
    // segnaposto del campo diventa €/collo e sotto compare il prezzo del
    // pezzo, che è il numero che una persona riconosce a colpo d'occhio.
    expect(screen.getByLabelText('Prezzo di Bjorne')).toHaveAttribute('placeholder', '€/collo')
    expect(screen.getByText('1,04 €/pz')).toBeInTheDocument()
  })

  it('il numero si salva sulla riga di listino', async () => {
    const user = userEvent.setup()
    stato.items = [BJORNE]
    stato.listini = [{ id: 'nova__bjorne', supplier_id: 'nova', item_id: 'bjorne', price: 25.05 }]
    render(<ListinoFornitore fornitore={NOVA} onIndietro={() => {}} />)
    await user.click(await screen.findByLabelText('Dettagli di Bjorne'))
    const perCollo = await screen.findByLabelText('Pezzi per collo')
    await user.clear(perCollo)
    await user.type(perCollo, '24')
    await user.click(screen.getByText('Salva'))
    expect(salvaRigaListino).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: 'bjorne', pezzi_per_collo: '24' })
    )
  })

  // IL TERZO GRADINO DELLA SCALA: l'unità in cui quel fornitore prezza. Vino
  // a 9 €/litro in bottiglie da 75 cl fa 6,75 a bottiglia, e il numero si
  // vede mentre lo si scrive — è la difesa vera contro una moltiplicazione
  // sbagliata: il risultato sta sotto gli occhi di chi sa quanto costa quella
  // bottiglia.
  it('si può prezzare al litro, e il prezzo della bottiglia si calcola da sé', async () => {
    const user = userEvent.setup()
    const VINO = { id: 'vino', name: 'Falanghina', unit: 'pz', stock: 0, package_size: 750, content_unit: 'ml', cost: 6.75, vat: 22, kind: 'scorta' }
    stato.items = [VINO]
    stato.listini = [{ id: 'nova__vino', supplier_id: 'nova', item_id: 'vino', price: 9 }]
    render(<ListinoFornitore fornitore={NOVA} onIndietro={() => {}} />)
    await user.click(await screen.findByLabelText('Dettagli di Falanghina'))
    await user.selectOptions(await screen.findByLabelText('Prezzo espresso per'), 'l')
    expect(screen.getByText('6,75 €/pz')).toBeInTheDocument()
    await user.click(screen.getByText('Salva'))
    expect(salvaRigaListino).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: 'vino', unita_prezzo: 'l' })
    )
  })

  // SE IL CONTENUTO NON È DICHIARATO IL CONTO NON SI FA, e non esce un numero
  // inventato: esce il perché, con le parole che il magazzino usa già per la
  // stessa mancanza. Un prezzo inventato diventa un ordine, e poi una fattura
  // che non torna.
  it('un prezzo al litro su un prodotto senza contenuto dice perché non si può', async () => {
    const user = userEvent.setup()
    stato.items = [BJORNE]
    stato.listini = [{ id: 'nova__bjorne', supplier_id: 'nova', item_id: 'bjorne', price: 9 }]
    render(<ListinoFornitore fornitore={NOVA} onIndietro={() => {}} />)
    await user.click(await screen.findByLabelText('Dettagli di Bjorne'))
    await user.selectOptions(await screen.findByLabelText('Prezzo espresso per'), 'l')
    expect(screen.getByText(/non si sa quanto contiene un pezzo/)).toBeInTheDocument()
    expect(screen.queryByText(/€\/pz/)).toBeNull()
  })

  // IL COLLO VUOTO VALE UNO, mai zero e mai niente: le 367 righe già in
  // archivio quel campo non ce l'hanno, e un `undefined` che finisce in una
  // moltiplicazione dà un ordine da zero pezzi.
  it('una riga senza il campo mostra un collo da un pezzo', async () => {
    const user = userEvent.setup()
    stato.items = [BJORNE]
    stato.listini = [{ id: 'nova__bjorne', supplier_id: 'nova', item_id: 'bjorne', price: 1.2333 }]
    render(<ListinoFornitore fornitore={NOVA} onIndietro={() => {}} />)
    await user.click(await screen.findByLabelText('Dettagli di Bjorne'))
    expect(await screen.findByLabelText('Pezzi per collo')).toHaveValue(1)
  })
})

describe('il prodotto che ancora non esiste', () => {
  // «O addirittura CREARE un prodotto che poi andrà a finire in magazzino»
  // (l'utente). Nasce come quelli che arrivano con una consegna: nome e
  // prezzo, contato a pezzi, con la scheda da completare addosso.
  it('si crea da qui e finisce in magazzino, già associato', async () => {
    const user = userEvent.setup()
    render(<ListinoFornitore fornitore={NOVA} onIndietro={() => {}} />)
    await screen.findByText('Listino di Nova')

    await user.type(screen.getByLabelText('Cerca un prodotto in magazzino'), 'Amaro del Capo')
    await user.click(await screen.findByText(/Crea «Amaro del Capo» in magazzino/))

    expect(creaProdottoAListino).toHaveBeenCalledWith(
      expect.objectContaining({ supplier_id: 'nova', name: 'Amaro del Capo' })
    )
    const listino = screen.getByText('Prodotti a listino').closest('.card')
    expect(await within(listino).findByText('Amaro del Capo')).toBeInTheDocument()
  })

  // Due Campari in magazzino sono due giacenze che si contraddicono: se il
  // nome c'è già non si crea niente, si associa quello che c'è.
  it('un nome che esiste già non offre di crearne un altro', async () => {
    const user = userEvent.setup()
    render(<ListinoFornitore fornitore={NOVA} onIndietro={() => {}} />)
    await screen.findByText('Listino di Nova')

    await user.type(screen.getByLabelText('Cerca un prodotto in magazzino'), 'Campari')
    expect(screen.queryByText(/Crea «Campari» in magazzino/)).toBeNull()
  })
})

describe('lo storico dei prezzi si legge sotto la riga', () => {
  // Il grafico è una voce futura; il dato si scrive e si legge da adesso,
  // perché uno storico non si ricostruisce all'indietro.
  it('dice quando il prezzo è cambiato e da dove viene', async () => {
    const user = userEvent.setup()
    stato.listini = [{ id: 'nova__campari', supplier_id: 'nova', item_id: 'campari', price: 13 }]
    stato.variazioni = [
      {
        id: 'v1',
        supplier_id: 'nova',
        item_id: 'campari',
        price: 13,
        previous_price: 12.5,
        origine: 'fattura',
        at: '2026-08-20T10:00:00.000Z',
      },
    ]
    render(<ListinoFornitore fornitore={NOVA} onIndietro={() => {}} />)
    await screen.findByText('Campari')

    // Un prezzo battuto a mano e uno preso da un documento fiscale non hanno
    // lo stesso peso, e chi legge deve poterli distinguere.
    expect(screen.getByText(/allineato da una fattura/)).toBeInTheDocument()
    await user.click(screen.getByLabelText('Dettagli di Campari'))
    expect(await screen.findByText('Variazioni di prezzo')).toBeInTheDocument()
  })

  it('senza variazioni lo dice, invece di lasciare uno spazio vuoto', async () => {
    const user = userEvent.setup()
    stato.listini = [{ id: 'nova__campari', supplier_id: 'nova', item_id: 'campari', price: 13 }]
    render(<ListinoFornitore fornitore={NOVA} onIndietro={() => {}} />)
    await screen.findByText('Campari')

    await user.click(screen.getByLabelText('Dettagli di Campari'))
    expect(await screen.findByText(/Nessuna variazione registrata/)).toBeInTheDocument()
  })
})
