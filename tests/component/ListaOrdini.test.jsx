// @vitest-environment happy-dom
'use strict'

// ── LA LISTA ORDINI (REQ-MAG-038) ────────────────────────────────────
//
// «Lo storico di tutti gli ordini fatti, filtrabile per STATO dell'ordine»
// (utente, 27/08/2026). Qui si sorveglia quello che si vede: il filtro, la
// bozza che non fa niente, il documento con le sue due strade, i due
// confronti e la storia dell'ordine.
//
// LA COSA DA NON PERDERE MAI DI VISTA: «pagato» non è un dato dell'ordine,
// è una domanda alla sua fattura. Se un giorno comparisse un tasto che
// scrive «pagato» sull'ordine, a fine mese il totale «Da pagare» dello
// scadenzario direbbe un'altra cifra e nessuno saprebbe quale delle due è
// vera.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const NOVA = { id: 'nova', name: 'Nova', email: 'ordini@nova.it', color: '#e74c3c' }

const ARTICOLI = [
  { id: 'campari', name: 'Campari', unit: 'pz', stock: 2, package_size: 700, content_unit: 'ml', cost: 12, vat: 22, kind: 'scorta', status: 'linea' },
]

const riga = (patch = {}) => ({
  item_id: 'campari',
  name: 'Campari',
  unit: 'pz',
  package_size: 700,
  qty_packages: 6,
  unit_cost: 12,
  vat: 22,
  supplier_id: 'nova',
  supplier_name: 'Nova',
  stato: 'richiesto',
  ...patch,
})

const ordine = (patch = {}) => ({
  id: 'po-1',
  supplier_id: 'nova',
  supplier_name: 'Nova',
  created_at: '2026-08-27T09:00:00.000Z',
  status: 'inviato',
  closed_at: null,
  storia: [],
  total_net: 72,
  total_gross: 87.84,
  lines: [riga()],
  ...patch,
})

const stato = { ordini: [], fatture: [] }

vi.mock('../../src/lib/api.js', () => ({
  fetchInventoryItems: vi.fn(async () => ARTICOLI),
  fetchSuppliers: vi.fn(async () => [NOVA]),
  fetchSupplierPrices: vi.fn(async () => []),
  fetchPurchaseOrders: vi.fn(async () => stato.ordini),
  fetchSupplierInvoices: vi.fn(async () => stato.fatture),
  // I modelli d'ordine (REQ-MAG-039): qui non si provano, ma il pannello li
  // legge insieme al resto e senza questi non partirebbe la lettura.
  fetchModelliOrdine: vi.fn(async () => []),
  salvaModelloOrdine: vi.fn((m) => ({ id: 'mod-1', ...m })),
  eliminaModelloOrdine: vi.fn(),
  createPurchaseOrder: vi.fn(() => ({ id: 'po-nuovo' })),
  // Come l'api vera: compongono in memoria e non aspettano la rete.
  confermaOrdine: vi.fn((o) => ({ ...o, status: 'inviato' })),
  chiudiOrdine: vi.fn((o) => ({ ...o, closed_at: '2026-08-27T12:00:00.000Z' })),
  registraMovimentoOrdine: vi.fn((o) => o),
  generaFatturaDaOrdine: vi.fn((o, opzioni = {}) => ({
    id: 'inv-gen',
    supplier_id: o.supplier_id,
    supplier_name: o.supplier_name,
    doc_type: opzioni.doc_type || 'Proforma',
    date: '2026-08-27',
    amount: o.total_gross,
    paid: !!opzioni.paid,
    generata: true,
    order_id: o.id,
    lines: o.lines,
  })),
  segnaFatturaPagata: vi.fn((f, paid) => ({ ...f, paid })),
  allineaPrezziDaFattura: vi.fn(async (o) => o),
  consegnaRigheOrdine: vi.fn(async (id) => ({ ...stato.ordini[0], id })),
  togliRigaOrdine: vi.fn(async () => ({ ordine: stato.ordini[0], articolo: null })),
  segnaInAssortimento: vi.fn(() => []),
  liberaDaAssortimento: vi.fn(() => []),
  deletePurchaseOrder: vi.fn(async () => {}),
  collegaFatturaAFetta: vi.fn(async (id, { order_id }) => ({
    ...stato.fatture.find((f) => f.id === id),
    order_id: order_id || null,
  })),
}))

vi.mock('../../src/lib/printer.js', () => ({ printOrdineFornitore: vi.fn(async () => {}) }))
vi.mock('../../src/lib/toast.js', () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }))

import PurchaseOrdersPanel from '../../src/components/PurchaseOrdersPanel.jsx'
import {
  confermaOrdine as confermato,
  chiudiOrdine as chiuso,
  generaFatturaDaOrdine as generata,
  segnaFatturaPagata as pagata,
  allineaPrezziDaFattura as allineato,
  segnaInAssortimento as assortimento,
  createPurchaseOrder as creato,
} from '../../src/lib/api.js'

// ASPETTA LE RIGHE, NON IL TITOLO. «Lista ordini» e' l'intestazione e
// compare al primo disegno, mentre gli ordini arrivano dopo: un test che si
// accontentava di quello asseriva su una lista ancora vuota, e sotto carico
// perdeva la corsa — rosso una volta su tre, sempre su una schermata sana.
// Qui si aspetta il primo ordine disegnato, che c'e' solo a dati arrivati.
const lista = () => screen.findAllByRole('button', { name: /L’ordine di/ })

async function apri(user, nome = 'Nova') {
  render(<PurchaseOrdersPanel vista="lista" />)
  await user.click(await screen.findByRole('button', { name: new RegExp(`L’ordine di ${nome}`) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  stato.ordini = []
  stato.fatture = []
})

describe('il filtro per stato', () => {
  beforeEach(() => {
    stato.ordini = [
      ordine({ id: 'po-b', status: 'bozza' }),
      ordine({ id: 'po-r', status: 'inviato' }),
      ordine({ id: 'po-c', status: 'ricevuto', lines: [riga({ stato: 'consegnato' })] }),
    ]
    stato.fatture = [
      { id: 'inv-1', supplier_id: 'nova', supplier_name: 'Nova', number: '1556', doc_type: 'Fattura', date: '2026-08-27', amount: 87.84, paid: true, lines: [], order_id: 'po-c' },
    ]
  })

  // Il numero sta sul chip: «quanti me ne restano da pagare» è la domanda, e
  // contarli scorrendo venticinque ordini è il modo in cui non ci si
  // risponde.
  it('ogni voce porta il suo numero, anche a zero', async () => {
    render(<PurchaseOrdersPanel vista="lista" />)
    await lista()
    expect(screen.getByRole('button', { name: 'Tutti (3)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bozze (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pagati (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chiusi (0)' })).toBeInTheDocument()
  })

  it('scegliendo uno stato restano solo quegli ordini', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel vista="lista" />)
    await lista()
    expect(screen.getAllByText('Nova')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Bozze (1)' }))
    await waitFor(() => expect(screen.getAllByText('Nova')).toHaveLength(1))
    expect(screen.getByText('Bozza')).toBeInTheDocument()
  })

  it('se in quello stato non c’è niente, lo dice invece di restare vuoto', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel vista="lista" />)
    await lista()
    await user.click(screen.getByRole('button', { name: 'Chiusi (0)' }))
    expect(await screen.findByText('Nessun ordine in questo stato.')).toBeInTheDocument()
  })
})

// ── LA BOZZA È L'UNICO STATO CHE NON FA NIENTE ──────────────────────
//
// «L'ordine bozza NON IMPATTA SUL MAGAZZINO. In questo modo Flavio può
// riprendere la creazione dell'ordine in un altro momento e confermarlo
// quando effettivamente gli serve» (utente, 27/08). Comporre venti righe è
// un lavoro che si interrompe — arriva gente, si apre il locale — e senza
// bozza si ricomincia da capo oppure si conferma un ordine solo per non
// perderlo, che è peggio.
describe('la bozza si riprende, e finché è bozza non muove niente', () => {
  beforeEach(() => {
    stato.ordini = [ordine({ status: 'bozza' })]
  })

  it('non ha il tasto della consegna: non è partita per nessuno', async () => {
    render(<PurchaseOrdersPanel vista="lista" />)
    await lista()
    expect(screen.queryByRole('button', { name: /Consegnato/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Manda l’ordine' })).toBeInTheDocument()
  })

  // Non risulta scoperta e non chiede documenti: non è arrivato niente e non
  // c'è niente da pagare.
  it('non conta fra le consegne senza documento', async () => {
    render(<PurchaseOrdersPanel vista="lista" />)
    await lista()
    expect(screen.queryByText(/consegna senza documento/)).toBeNull()
    expect(screen.queryByText('senza documento')).toBeNull()
  })

  // È LA CONFERMA IL GRILLETTO, non la creazione (REQ-MAG-037): i prodotti
  // passano in assortimento adesso, non quando la bozza è nata.
  it('mandandola, passa a richiesto e i prodotti vanno in assortimento', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel vista="lista" />)
    await lista()
    await user.click(screen.getByRole('button', { name: 'Manda l’ordine' }))
    expect(confermato).toHaveBeenCalledWith(expect.objectContaining({ id: 'po-1' }))
    expect(assortimento).toHaveBeenCalled()
    // L'esito si vede nell'istante del gesto, senza aspettare la rete.
    expect(await screen.findByText('Richiesto')).toBeInTheDocument()
  })
})

describe('il documento: si associa, si genera, o non c’è', () => {
  beforeEach(() => {
    stato.ordini = [ordine({ status: 'ricevuto', lines: [riga({ stato: 'consegnato', qty_received: 6 })] })]
  })

  it('un ordine consegnato senza documento lo dice in riga', async () => {
    render(<PurchaseOrdersPanel vista="lista" />)
    await lista()
    expect(screen.getByText('senza documento')).toBeInTheDocument()
  })

  // «La posso anche generare dall'ordine, coi prezzi dell'ordine».
  it('si genera dall’ordine, e si vede che l’abbiamo fatta noi', async () => {
    const user = userEvent.setup()
    await apri(user)
    await user.click(screen.getByRole('button', { name: 'Genera il documento dall’ordine di Nova' }))
    expect(generata).toHaveBeenCalledWith(expect.objectContaining({ id: 'po-1' }), {})
    // UNA FATTURA NOSTRA NON È QUELLA DEL FORNITORE: la prima dice quanto ci
    // si aspetta di pagare, la seconda quanto lui chiede.
    expect(await screen.findByText('Generata dall’ordine')).toBeInTheDocument()
  })

  // «Il caso di pagare un fornitore senza fattura non c'è. Io creerò SEMPRE
  // un item nello scadenzario che paga un ordine anche senza fattura».
  it('«Pagato senza documento» crea la riga di scadenzario e la paga', async () => {
    const user = userEvent.setup()
    await apri(user)
    await user.click(
      screen.getByRole('button', { name: 'Registra il pagamento dell’ordine di Nova senza documento' })
    )
    expect(generata).toHaveBeenCalledWith(expect.objectContaining({ id: 'po-1' }), {
      doc_type: 'Nessun documento',
      paid: true,
    })
    expect(await screen.findByText('✅ pagato')).toBeInTheDocument()
  })
})

describe('«pagato» si scrive sulla fattura, mai sull’ordine', () => {
  beforeEach(() => {
    stato.ordini = [ordine({ status: 'ricevuto', lines: [riga({ stato: 'consegnato', qty_received: 6 })] })]
    stato.fatture = [
      { id: 'inv-1', supplier_id: 'nova', supplier_name: 'Nova', number: '1556', doc_type: 'Fattura', date: '2026-08-27', amount: 87.84, paid: false, lines: [], order_id: 'po-1' },
    ]
  })

  it('il chip lo dice, e toccarlo scrive sul documento', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel vista="lista" />)
    await lista()
    await user.click(screen.getByRole('button', { name: 'Segna pagato il documento di Nova' }))
    expect(pagata).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-1' }), true)
    expect(await screen.findByText('✅ pagato')).toBeInTheDocument()
  })
})

// ── I DUE CONFRONTI ─────────────────────────────────────────────────
//
// «Bisognerà mostrare la DIFFERENZA DI PREZZO da quando è stato fatto
// l'ordine rispetto al prezzo indicato in fattura», e «verificare se ci sono
// gli stessi articoli e i prezzi rispetto all'ordine effettuato e all'ordine
// ricevuto».
describe('i tre elenchi e i due confronti', () => {
  beforeEach(() => {
    // Sei chiesti, quattro arrivati, quattro fatturati a 13,50.
    stato.ordini = [
      ordine({
        status: 'ricevuto',
        lines: [riga({ stato: 'consegnato', qty_received: 4, unit_cost: 13.5, unit_cost_ordinato: 12 })],
      }),
    ]
    stato.fatture = [
      {
        id: 'inv-1',
        supplier_id: 'nova',
        supplier_name: 'Nova',
        number: '1556',
        doc_type: 'Fattura',
        date: '2026-08-27',
        amount: 65.88,
        paid: false,
        order_id: 'po-1',
        lines: [{ item_id: 'campari', name: 'Campari', qty_packages: 4, unit_cost: 13.5, vat: 22 }],
      },
    ]
  })

  it('le tre colonne stanno una accanto all’altra', async () => {
    const user = userEvent.setup()
    await apri(user)
    const prospetto = (await screen.findByText('Ordinato, ricevuto, fatturato')).closest(
      '.ordine-blocco'
    )
    expect(within(prospetto).getByText('Ordinato')).toBeInTheDocument()
    expect(within(prospetto).getByText('Ricevuto')).toBeInTheDocument()
    expect(within(prospetto).getByText('In fattura')).toBeInTheDocument()
    // Sei chiesti, quattro arrivati: l'ordinato non è stato sovrascritto.
    expect(within(prospetto).getByText('6')).toBeInTheDocument()
    expect(within(prospetto).getAllByText('4')).not.toHaveLength(0)
  })

  it('la differenza di prezzo si legge col segno', async () => {
    const user = userEvent.setup()
    await apri(user)
    expect(await screen.findByText('+1,50 €')).toBeInTheDocument()
    expect(screen.getByText('prezzo diverso da quello dell’ordine')).toBeInTheDocument()
  })

  it('e quello che non torna nella merce pure', async () => {
    const user = userEvent.setup()
    await apri(user)
    expect(await screen.findByText('arrivato meno del richiesto')).toBeInTheDocument()
  })

  // «Il confronto non finisce in un avviso»: il prezzo del documento allinea
  // il listino, se no lo stesso scarto ricompare al giro dopo e l'avviso
  // diventa rumore che si impara a ignorare.
  it('e da lì si allinea il listino, in un gesto', async () => {
    const user = userEvent.setup()
    await apri(user)
    await user.click(await screen.findByRole('button', { name: /Allinea il listino al documento/ }))
    expect(allineato).toHaveBeenCalled()
  })

  // «Solo dopo l'ordine si può mettere a CHIUSO»: chiuso non è sinonimo di
  // pagato, e non arriva da solo.
  it('con gli elenchi che non tornano il tasto «Chiudi» è spento, e dice perché', async () => {
    render(<PurchaseOrdersPanel vista="lista" />)
    await lista()
    const tasto = screen.getByRole('button', { name: 'Chiudi' })
    expect(tasto).toBeDisabled()
    expect(tasto).toHaveAttribute('title', expect.stringMatching(/non tornano/))
  })

  it('quando tornano si chiude, e la riga lo mostra', async () => {
    const user = userEvent.setup()
    stato.ordini = [
      ordine({
        status: 'ricevuto',
        lines: [riga({ stato: 'consegnato', qty_packages: 4, qty_received: 4, unit_cost: 13.5, unit_cost_ordinato: 13.5 })],
      }),
    ]
    render(<PurchaseOrdersPanel vista="lista" />)
    await lista()
    await user.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(chiuso).toHaveBeenCalled()
    expect(await screen.findByText('Chiuso')).toBeInTheDocument()
  })
})

// ── LA STORIA DELL'ORDINE ───────────────────────────────────────────
//
// «Serve una lista dei movimenti fatti per quell'ordine, una specie di
// history, se l'ordine è già stato confermato ma Flavio fa delle modifiche».
// Con tre elenchi da confrontare le modifiche dopo la conferma sono la
// norma, non l'eccezione.
describe('la storia dell’ordine', () => {
  it('dice cosa è successo, dal più recente', async () => {
    const user = userEvent.setup()
    stato.ordini = [
      ordine({
        storia: [
          { at: '2026-08-27T09:00:00.000Z', tipo: 'creato', dettaglio: { righe: 1 } },
          { at: '2026-08-27T11:30:00.000Z', tipo: 'quantita', dettaglio: { nome: 'Campari', da: 6, a: 4 } },
        ],
      }),
    ]
    await apri(user)
    const storia = (await screen.findByText('Cosa è successo')).closest('.ordine-blocco')
    const voci = within(storia).getAllByRole('listitem')
    expect(voci[0]).toHaveTextContent('Campari: ricevuti 4 invece di 6')
    expect(voci[1]).toHaveTextContent('Ordine creato · 1 righe')
  })

  // Gli ordini scritti prima di questa voce non hanno storia, e non è un
  // errore: comincia da quando la si scrive.
  it('un ordine senza storia non mostra un blocco vuoto', async () => {
    const user = userEvent.setup()
    stato.ordini = [ordine({ storia: [] })]
    await apri(user)
    expect(screen.queryByText('Cosa è successo')).toBeNull()
  })
})

// ── LA BOZZA NASCE DAL RIEPILOGO ────────────────────────────────────
//
// «Forse sarebbe meglio anche salvare l'ordine come BOZZA» (utente, 27/08).
// Si salva dove si conferma, perché è lì che si decide: o parte, o si mette
// da parte.
describe('dal riepilogo si può salvare in bozza invece di mandare', () => {
  it('nasce un ordine bozza, e nessun prodotto va in assortimento', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    await user.type(screen.getByLabelText('Pezzi di Campari (senza fornitore)'), '3')
    await user.click(screen.getByRole('button', { name: /Rivedi e conferma/ }))
    await user.click(screen.getByRole('button', { name: 'Salva in bozza' }))

    await waitFor(() => expect(creato).toHaveBeenCalled())
    expect(creato.mock.calls.at(-1)[0].bozza).toBe(true)
    // «L'ordine bozza NON IMPATTA SUL MAGAZZINO»: in assortimento ci si va
    // alla conferma, e questa non è una conferma.
    expect(assortimento).not.toHaveBeenCalled()
    // La tabella di quel fornitore resta a schermo, ma col badge giusto: non
    // è stato ordinato niente a nessuno.
    expect(await screen.findByText('In bozza')).toBeInTheDocument()
  })
})
