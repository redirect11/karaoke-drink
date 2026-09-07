// @vitest-environment happy-dom
'use strict'

// ── «NUOVO ORDINE»: UNA TABELLA SOLA, E LA RIGA CHE SI APRE (REQ-MAG-036) ─
//
// La schermata di prima l'utente l'ha provata il 27/08/2026 e l'ha bocciata:
// «nella sezione ordini NON MI PIACE LA DOPPIA LISTA e quei box sono
// POSTICCI. Serve una UX e UI più moderna e semplice. Deve esserci UNA SOLA
// TABELLA dove su ogni riga vedrò il nome del prodotto e i vari campi per
// compilare l'ordine, compresa una dropdown per la scelta del fornitore». E
// ancora: «è SCOMODISSIMO l'ordine in basso. Dobbiamo metterlo affianco, e
// già lì separare i prodotti di un fornitore rispetto a un altro».
//
// Qui si sorveglia che non ci si torni: una tabella, l'ordine di fianco già
// diviso per fornitore, l'intestazione che ordina, la preselezione di quello
// che manca e la riga che si apre.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const NOVA = { id: 'nova', name: 'Nova', email: 'ordini@nova.it', color: '#e74c3c' }
const ENOFEL = { id: 'enofel', name: 'Enofel', email: 'ordini@enofel.it', color: '#3498db' }

// Un magazzino piccolo con tutti i casi che contano: finito, sotto soglia,
// pieno, e uno fuori linea (che è finito ma non si propone).
const CAMPARI = { id: 'campari', name: 'Campari', unit: 'pz', stock: 0, low_threshold: 2, package_size: 700, cost: 12, vat: 22, kind: 'scorta', status: 'linea' }
const GIN = { id: 'gin', name: 'Gin Mare', unit: 'pz', stock: 1, low_threshold: 2, package_size: 700, cost: 30, vat: 22, kind: 'scorta', status: 'assortimento' }
const RUM = { id: 'rum', name: 'Rum Zacapa', unit: 'pz', stock: 9, low_threshold: 2, package_size: 700, cost: 40, vat: 22, kind: 'scorta', status: 'premium' }
const AMARO = { id: 'amaro', name: 'Amaro Lucano', unit: 'pz', stock: 0, low_threshold: 3, package_size: 700, cost: 9, vat: 22, kind: 'scorta', status: 'out' }

const LISTINI = [
  { id: 'nova__campari', supplier_id: 'nova', item_id: 'campari', price: 12.5, last_price_at: '2026-08-01T10:00:00.000Z' },
  { id: 'enofel__campari', supplier_id: 'enofel', item_id: 'campari', price: 11.9, last_price_at: '2024-02-01T10:00:00.000Z' },
  { id: 'enofel__gin', supplier_id: 'enofel', item_id: 'gin', price: 28, last_price_at: '2026-05-01T10:00:00.000Z' },
]

const stato = { articoli: [CAMPARI, GIN, RUM, AMARO], listini: LISTINI, ordini: [], fatture: [] }

vi.mock('../../src/lib/api.js', () => ({
  fetchInventoryItems: vi.fn(async () => stato.articoli),
  fetchSuppliers: vi.fn(async () => [NOVA, ENOFEL]),
  fetchSupplierPrices: vi.fn(async () => stato.listini),
  fetchPurchaseOrders: vi.fn(async () => stato.ordini),
  createPurchaseOrder: vi.fn(async (o) => ({ id: `po-nuovo-${(stato.creati = (stato.creati || 0) + 1)}`, created_at: '2026-08-27T09:00:00.000Z', status: 'inviato', ...o })),
  // I due gesti nuovi di REQ-MAG-037: i prodotti che passano in
  // assortimento alla conferma, e la riga che si toglie da un ordine già
  // fatto.
  liberaDaAssortimento: vi.fn(() => []),
  segnaInAssortimento: vi.fn(() => []),
  togliRigaOrdine: vi.fn(async () => ({ ordine: stato.ordini[0], articolo: null })),
  consegnaRigheOrdine: vi.fn(async (id) => ({ ...stato.ordini[0], id })),
  segnaRighePagate: vi.fn(async (id) => ({ ...stato.ordini[0], id })),
  deletePurchaseOrder: vi.fn(async () => {}),
  fetchSupplierInvoices: vi.fn(async () => stato.fatture),
  // I modelli d'ordine (REQ-MAG-039): qui non si provano, ma il pannello li
  // legge insieme al resto e senza questi non partirebbe la lettura.
  fetchModelliOrdine: vi.fn(async () => []),
  salvaModelloOrdine: vi.fn((m) => ({ id: 'mod-1', ...m })),
  eliminaModelloOrdine: vi.fn(),
  collegaFatturaAFetta: vi.fn(async (id) => ({ id })),
}))

vi.mock('../../src/lib/printer.js', () => ({ printOrdineFornitore: vi.fn(async () => {}) }))
vi.mock('../../src/lib/toast.js', () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }))

import PurchaseOrdersPanel from '../../src/components/PurchaseOrdersPanel.jsx'
import { createPurchaseOrder as creato } from '../../src/lib/api.js'

// LA CONFERMA PASSA DAL RIEPILOGO (REQ-MAG-037): il tasto della
// composizione non manda più niente a nessuno, porta a rivedere fornitore per
// fornitore, e l'ordine si crea per singolo fornitore.
async function confermaOrdine(user, fornitore) {
  await user.click(screen.getByRole('button', { name: /Rivedi e conferma/ }))
  const riga = screen.getByRole('button', { name: `I prodotti di ${fornitore}` }).closest('.inv-row')
  await user.click(within(riga).getByRole('button', { name: /Crea l/ }))
}

// SCRIVERE IN UN CAMPO SI FA IN UN COLPO SOLO, non tasto per tasto.
// `user.clear` + `user.type` battono un carattere alla volta e ogni battuta
// e' un giro di stato di React: con la suite intera in parallelo la macchina
// va sotto carico, lo svuotamento e la prima battuta finiscono nello stesso
// giro e il campo si ritrova «44» invece di «4». Il test falliva una volta
// su tre, ed e' il genere di rosso che insegna a rilanciare invece che a
// guardare. Qui non si sta provando la tastiera — quello lo fanno i test
// del tocco sulla riga — ma che il numero scritto arrivi fino all'ordine
// salvato: `fireEvent.change` lo dice in un evento solo, deterministico.
const scriviCampo = (campo, valore) => fireEvent.change(campo, { target: { value: valore } })

const tabella = () => document.querySelector('.ordine-tabella')
const righe = () => [...document.querySelectorAll('.ordine-tabella .inv-row')]
const carrello = () => screen.getByLabelText('Ordine in composizione')

beforeEach(() => {
  vi.clearAllMocks()
  stato.articoli = [CAMPARI, GIN, RUM, AMARO]
  stato.listini = LISTINI
  stato.ordini = []
  stato.fatture = []
})

describe('una tabella sola', () => {
  it('ogni riga porta prodotto, disponibilità, fornitore, prezzo e i campi da compilare', async () => {
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    // L'intestazione c'è, e sono le quattro colonne che ordinano: il nome
    // del tasto è il titolo della colonna, il «title» dice cosa fa.
    for (const col of ['Prodotto', 'Disponibilità', 'Fornitore', '€/pz']) {
      const th = screen.getByRole('button', { name: col })
      expect(th).toHaveAttribute('title', `Ordina per ${col}`)
    }
    // La riga del Campari di Nova: tendina del fornitore, prezzo di listino
    // di QUEL fornitore, pezzi e totale, tutti sulla riga.
    expect(screen.getByLabelText('Fornitore per Campari (Nova)')).toHaveValue('nova')
    expect(screen.getByLabelText('Pezzi di Campari (Nova)')).toBeInTheDocument()
    expect(screen.getByLabelText('Totale di Campari (Nova)')).toBeInTheDocument()
    const riga = screen.getByLabelText('Ordina Campari (Nova)').closest('.inv-row')
    expect(within(riga).getByText('12,50 €')).toBeInTheDocument()
    expect(within(riga).getByText('Esaurito')).toBeInTheDocument()
  })

  // «Se cerco un prodotto vedrò probabilmente il prodotto DUPLICATO se
  // associato a più di un fornitore»: il doppione non è un difetto.
  it('lo stesso prodotto su due listini fa due righe, una per fornitore', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    await user.type(screen.getByLabelText('Cerca un prodotto'), 'campa')
    await waitFor(() => expect(righe()).toHaveLength(2))
    expect(screen.getByLabelText('Ordina Campari (Nova)')).toBeInTheDocument()
    expect(screen.getByLabelText('Ordina Campari (Enofel)')).toBeInTheDocument()
  })

  it('col filtro si vedono solo gli item di quel fornitore', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    await user.selectOptions(screen.getByLabelText('Filtra per fornitore'), 'nova')
    await waitFor(() => expect(righe()).toHaveLength(1))
    expect(screen.getByLabelText('Ordina Campari (Nova)')).toBeInTheDocument()
  })

  // «Voglio l'header della tabella fisso in alto, coi titoli delle colonne
  // che posso usare per ordinare».
  it('l’intestazione ordina, e il secondo tocco inverte', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    const primo = () => righe()[0].querySelector('.inv-row-name').textContent
    expect(primo()).toContain('Amaro Lucano')
    await user.click(screen.getByRole('button', { name: 'Prodotto' }))
    await waitFor(() => expect(primo()).toContain('Rum Zacapa'))
  })

  // Chi è finito viene per primo: ordinare per disponibilità è chiedere
  // «cosa manca», non l'alfabeto dei tre stati.
  it('ordinando per disponibilità viene prima quello che è finito', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    await user.click(screen.getByRole('button', { name: 'Disponibilità' }))
    await waitFor(() => expect(righe().at(-1).textContent).toContain('Rum Zacapa'))
  })
})

describe('la preselezione: il giro del magazzino è già fatto', () => {
  it('esauriti e sotto soglia partono spuntati, chi è pieno no', async () => {
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    await waitFor(() => expect(screen.getByLabelText('Ordina Campari (Nova)')).toBeChecked())
    expect(screen.getByLabelText('Ordina Gin Mare (Enofel)')).toBeChecked()
    expect(screen.getByLabelText('Ordina Rum Zacapa (senza fornitore)')).not.toBeChecked()
    // Un prodotto su due listini si spunta UNA volta sola, se no lo si
    // comprerebbe due volte.
    expect(screen.getByLabelText('Ordina Campari (Enofel)')).not.toBeChecked()
  })

  // «Se è fuori linea non viene considerato nella precompilazione
  // dell'ordine» (utente, 27/08). Ma in tabella c'è: si può sempre
  // aggiungere a mano, ed è così che rientra.
  it('il fuori linea è in tabella ma non spuntato', async () => {
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    const spunta = screen.getByLabelText('Ordina Amaro Lucano (senza fornitore)')
    expect(spunta).not.toBeChecked()
    expect(spunta.closest('.inv-row')).toHaveTextContent('fuori linea')
  })

  it('l’ordine di fianco è già diviso per fornitore', async () => {
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    await waitFor(() => expect(within(carrello()).getByText('Nova')).toBeInTheDocument())
    expect(within(carrello()).getByText('Enofel')).toBeInTheDocument()
    expect(within(carrello()).getByText(/× Campari/)).toBeInTheDocument()
    expect(within(carrello()).getByText(/× Gin Mare/)).toBeInTheDocument()
  })

  it('dall’ordine si toglie una riga, e la spunta in tabella si spegne', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    // SI ASPETTA IL TASTO CHE SI STA PER PREMERE, non «Campari» in tabella:
    // il carrello lo riempie un ALTRO effetto (la precompilazione di quello
    // che sta finendo), e nella corsa con la coverage — che è più lenta —
    // la tabella era pronta e l'ordine no. Il test ballava.
    const togli = await screen.findByRole('button', { name: 'Togli Campari dall’ordine' })
    await user.click(togli)
    await waitFor(() => expect(screen.getByLabelText('Ordina Campari (Nova)')).not.toBeChecked())
  })
})

describe('i campi si compilano sulla riga', () => {
  // «Se aggiungo una quantità sulla riga del prodotto, questo viene
  // selezionato automaticamente per l'ordine»: scrivere una quantità È la
  // decisione di ordinarlo.
  it('scrivere una quantità seleziona la riga', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    const spunta = screen.getByLabelText('Ordina Rum Zacapa (senza fornitore)')
    expect(spunta).not.toBeChecked()
    await user.type(screen.getByLabelText('Pezzi di Rum Zacapa (senza fornitore)'), '3')
    expect(spunta).toBeChecked()
    expect(within(carrello()).getByText('3× Rum Zacapa')).toBeInTheDocument()
  })

  it('il totale della riga segue i pezzi e il prezzo di listino', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    const pezzi = screen.getByLabelText('Pezzi di Campari (Nova)')
    scriviCampo(pezzi, '4')
    await waitFor(() => expect(screen.getByLabelText('Totale di Campari (Nova)')).toHaveValue(50))
  })

  // Il totale si corregge sulla riga, e da lì torna indietro al prezzo del
  // pezzo: il listino dice quanto ci si aspetta di pagare, la cifra scritta
  // a mano è quella dell'ordine.
  it('il totale corretto a mano finisce sull’ordine salvato', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    const pezzi = screen.getByLabelText('Pezzi di Campari (Nova)')
    scriviCampo(pezzi, '4')
    const totale = screen.getByLabelText('Totale di Campari (Nova)')
    scriviCampo(totale, '40')
    await confermaOrdine(user, 'Nova')
    await waitFor(() => expect(creato).toHaveBeenCalled())
    const riga = creato.mock.calls.at(-1)[0].lines.find((l) => l.item_id === 'campari')
    expect(riga.qty_packages).toBe(4)
    expect(riga.unit_cost).toBe(10)
  })

  it('la tendina manda la riga a un altro fornitore, col suo prezzo', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    await user.selectOptions(screen.getByLabelText('Fornitore per Gin Mare (Enofel)'), 'nova')
    await waitFor(() => expect(within(carrello()).getByText('Nova')).toBeInTheDocument())
    // Nova non ha il Gin sul listino: vale il costo del prodotto (30).
    await confermaOrdine(user, 'Nova')
    await waitFor(() => expect(creato).toHaveBeenCalled())
    const riga = creato.mock.calls.at(-1)[0].lines.find((l) => l.item_id === 'gin')
    expect(riga).toMatchObject({ supplier_id: 'nova', unit_cost: 30 })
  })

  // «Va anche bene che è disabilitato il fornitore in quanto già l'ho
  // ordinato a quel fornitore» (Flavio): due righe dello stesso prodotto
  // allo stesso fornitore sono un doppione, e un doppione si paga due volte.
  it('un fornitore già usato per quel prodotto non si può riscegliere', async () => {
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    // La preselezione arriva un attimo dopo il primo disegno: è lei a
    // mettere il Campari di Nova nell'ordine, ed è per quello che Nova si
    // spegne sull'altra riga.
    const opzione = () =>
      [...screen.getByLabelText('Fornitore per Campari (Enofel)').options].find((o) => o.value === 'nova')
    await waitFor(() => expect(opzione()).toBeDisabled())
    expect(opzione().textContent).toMatch(/già in questo ordine/)
  })
})

// ── IL TOCCO SULLA RIGA AGGIUNGE E TOGLIE (REQ-MAG-036) ──────────────
//
// Chiesto dall'utente il 27/08 dopo aver provato: «se clicco su una riga
// degli ordini, questo deve essere aggiunto se non è aggiunto e toglierlo se
// è aggiunto. In pratica basta che tocco la riga». Il bersaglio è TUTTA la
// riga: si compone un ordine passando in rassegna decine di prodotti, e
// centrare una casella piccola decine di volte è il tipo di fatica che non si
// nota finché non la si fa.
describe('il tocco sulla riga', () => {
  const rigaDi = (nome) => screen.getByLabelText(`Ordina ${nome}`).closest('.inv-row-main')

  it('toccando la riga il prodotto entra nell’ordine, e ritoccandola esce', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    const spunta = screen.getByLabelText('Ordina Rum Zacapa (senza fornitore)')
    expect(spunta).not.toBeChecked()
    // Il nome del prodotto è in mezzo alla riga: è lì che va il dito.
    await user.click(within(rigaDi('Rum Zacapa (senza fornitore)')).getByText('Rum Zacapa'))
    expect(spunta).toBeChecked()
    expect(within(carrello()).getByText(/Rum Zacapa/)).toBeInTheDocument()
    await user.click(within(rigaDi('Rum Zacapa (senza fornitore)')).getByText('Rum Zacapa'))
    expect(spunta).not.toBeChecked()
  })

  // I campi che si scrivono e la tendina restano esclusi: se no scriverci
  // dentro toglierebbe dall'ordine il prodotto appena aggiunto.
  it('scrivere nella quantità o nella tendina non toglie il prodotto', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    const spunta = screen.getByLabelText('Ordina Campari (Nova)')
    expect(spunta).toBeChecked() // preselezionato: è esaurito
    await user.click(screen.getByLabelText('Pezzi di Campari (Nova)'))
    expect(spunta).toBeChecked()
    await user.click(screen.getByLabelText('Totale di Campari (Nova)'))
    expect(spunta).toBeChecked()
    await user.click(screen.getByLabelText('Fornitore per Campari (Nova)'))
    expect(spunta).toBeChecked()
  })

  // Il tasto che apre la scheda è escluso anche lui: aprire un prodotto per
  // guardarlo non è la decisione di comprarlo.
  it('aprire la scheda non aggiunge niente all’ordine', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    const spunta = screen.getByLabelText('Ordina Rum Zacapa (senza fornitore)')
    await user.click(
      screen.getByRole('button', { name: 'Apri la scheda di Rum Zacapa (senza fornitore)' })
    )
    expect(document.querySelector('.inv-row-dettaglio')).toBeInTheDocument()
    expect(spunta).not.toBeChecked()
  })

  // DEVE FUNZIONARE ANCHE DA TASTIERA, e chi legge con un lettore di schermo
  // deve capire cosa sta toccando: per questo la casella resta al suo posto
  // invece di essere sostituita da un `div` cliccabile. È lei a portare ruolo
  // («casella di controllo»), nome («Ordina Rum Zacapa») e stato, ed è lei a
  // farsi premere con lo spazio dopo esserci arrivati col tabulatore.
  it('da tastiera la casella porta nome, ruolo e stato, e lo spazio la preme', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    const spunta = screen.getByRole('checkbox', { name: 'Ordina Rum Zacapa (senza fornitore)' })
    expect(spunta).not.toBeChecked()
    spunta.focus()
    expect(spunta).toHaveFocus()
    await user.keyboard(' ')
    expect(spunta).toBeChecked()
    await user.keyboard(' ')
    expect(spunta).not.toBeChecked()
  })
})

describe('la riga che si apre', () => {
  // «Quando seleziono un item mi si deve aprire la riga che mi dirà anche le
  // info di quel prodotto — se in assortimento, out, in linea eccetera,
  // quante scorte ho ancora in magazzino — più la possibilità di modificare
  // gli stessi campi che modificherei inline sulla riga stessa».
  it('mostra stato commerciale, scorte e gli stessi campi', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    await user.click(screen.getByRole('button', { name: 'Apri la scheda di Rum Zacapa (senza fornitore)' }))
    const scheda = document.querySelector('.inv-row-dettaglio')
    expect(scheda).toHaveTextContent('Premium')
    expect(scheda).toHaveTextContent('In scorta')
    expect(scheda).toHaveTextContent('In casa: 9 pz')
    expect(screen.getByLabelText('Fornitore per Rum Zacapa (senza fornitore) nella scheda')).toBeInTheDocument()
    expect(screen.getByLabelText('Totale di Rum Zacapa (senza fornitore) nella scheda')).toBeInTheDocument()
  })

  it('i campi della scheda e quelli della riga sono la stessa cosa', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrdersPanel />)
    await screen.findAllByText('Campari')
    await user.click(screen.getByRole('button', { name: 'Apri la scheda di Rum Zacapa (senza fornitore)' }))
    await user.type(screen.getByLabelText('Pezzi di Rum Zacapa (senza fornitore) nella scheda'), '2')
    expect(screen.getByLabelText('Pezzi di Rum Zacapa (senza fornitore)')).toHaveValue(2)
    expect(screen.getByLabelText('Ordina Rum Zacapa (senza fornitore)')).toBeChecked()
  })
})

describe('le righe si caricano scorrendo', () => {
  // Il numero misurato il 27/08 dice perché serve: 388 prodotti e 367 righe
  // di listino, e una riga per COPPIA prodotto-fornitore.
  const TANTI = Array.from({ length: 95 }, (_, i) => ({
    id: `p${String(i).padStart(3, '0')}`,
    name: `Prodotto ${String(i).padStart(3, '0')}`,
    unit: 'pz',
    stock: 5,
    low_threshold: 1,
    package_size: 700,
    cost: 10,
    vat: 22,
    kind: 'scorta',
  }))

  it('si parte da una finestra di righe, non da tutto il magazzino', async () => {
    stato.articoli = TANTI
    stato.listini = []
    render(<PurchaseOrdersPanel />)
    await screen.findByText('Prodotto 000')
    expect(righe()).toHaveLength(40)
    expect(screen.getByText(/Mostrate 40 righe su 95/)).toBeInTheDocument()
  })

  it('scorrendo verso il fondo se ne caricano altre', async () => {
    stato.articoli = TANTI
    stato.listini = []
    render(<PurchaseOrdersPanel />)
    await screen.findByText('Prodotto 000')
    const el = tabella()
    // In un DOM finto un riquadro non ha altezza: le misure del riquadro che
    // scorre si dichiarano qui, che è quello che il browser direbbe quando
    // si è quasi in fondo.
    Object.defineProperty(el, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true })
    Object.defineProperty(el, 'scrollTop', { value: 1350, configurable: true, writable: true })
    fireEvent.scroll(el)
    await waitFor(() => expect(righe()).toHaveLength(80))
  })

  // Chi arriva con la tastiera non fa scorrere niente col tabulatore: il
  // tasto c'è per lui.
  it('e c’è il tasto per chi non scorre col dito', async () => {
    const user = userEvent.setup()
    stato.articoli = TANTI
    stato.listini = []
    render(<PurchaseOrdersPanel />)
    await screen.findByText('Prodotto 000')
    await user.click(screen.getByRole('button', { name: 'Mostra altre righe' }))
    expect(righe()).toHaveLength(80)
  })

  // Cercando si riparte dalla prima finestra: restare a quattrocento righe
  // caricate per mostrarne due è lavoro sprecato a ogni tasto premuto.
  it('cambiando ricerca la finestra riparte da capo', async () => {
    const user = userEvent.setup()
    stato.articoli = TANTI
    stato.listini = []
    render(<PurchaseOrdersPanel />)
    await screen.findByText('Prodotto 000')
    await user.click(screen.getByRole('button', { name: 'Mostra altre righe' }))
    expect(righe()).toHaveLength(80)
    await user.type(screen.getByLabelText('Cerca un prodotto'), 'Prodotto 0')
    await waitFor(() => expect(righe()).toHaveLength(40))
  })
})
