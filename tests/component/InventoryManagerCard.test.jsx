// @vitest-environment happy-dom
'use strict'

// IL MAGAZZINO A SCHERMO. Quello che si legge sulle card e nella scheda di
// un prodotto: i numeri scritti come si leggono e le unità di misura che si
// possono scegliere. I calcoli stanno in tests/unit/inventory.test.js; qui
// si controlla che arrivino davanti a chi lavora nella forma giusta.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

vi.mock('../../src/lib/api.js', () => {
  // Dichiarati QUI dentro: vi.mock viene issato in cima al file e non
  // vedrebbe una costante definita fuori.
  const items = [
    // Il Campari del 17 agosto: contato a pezzi, bottiglia da 1 L, e una
    // giacenza uscita da una moltiplicazione di ricetta.
    {
      id: 'campari',
      name: 'Campari',
      unit: 'pz',
      package_size: 1000,
      content_unit: 'ml',
      stock: 7.49000000000001,
      cost: 12,
      vat: 22,
    },
    { id: 'ichnusa', name: 'Ichnusa', unit: 'pz', stock: 12, cost: 1.2, vat: 22 },
    // Gli articoli arrivano dalle api SEMPRE nella forma nuova, anche quando
    // sul database sono ancora scritti a «U»: a rimetterli in riga è la
    // lettura tollerante (REQ-MAG-018, mapItem). Qui il magazzino è già
    // aggiornato — il giro del travaso ha il suo file di test.
    {
      id: 'ghiaccio',
      name: 'Ghiaccio',
      unit: 'pz',
      package_size: 1,
      content_unit: 'U',
      scorta: true,
      stock: 6,
      cost: 2,
      vat: 22,
    },
    {
      id: 'lavoro',
      name: 'Tempo di Lavorazione',
      unit: 'pz',
      package_size: 1,
      content_unit: 'U',
      scorta: false,
      stock: 0,
      cost: 0.5,
      vat: 22,
    },
  ]
  return {
    fetchInventoryItems: vi.fn(() => Promise.resolve(items)),
    createInventoryItem: vi.fn((x) => Promise.resolve({ id: 'nuovo', ...x })),
    updateInventoryItem: vi.fn(() => Promise.resolve({})),
    deleteInventoryItem: vi.fn(() => Promise.resolve()),
    loadStock: vi.fn(() => Promise.resolve({})),
    receiveBottles: vi.fn(() => Promise.resolve({})),
    adjustStock: vi.fn(() => Promise.resolve({})),
    fetchStockMovements: vi.fn(() => Promise.resolve([])),
    fetchInventoryCategories: vi.fn(() => Promise.resolve([])),
    createInventoryCategory: vi.fn(() => Promise.resolve({})),
    updateInventoryCategory: vi.fn(() => Promise.resolve({})),
    deleteInventoryCategory: vi.fn(() => Promise.resolve()),
    fetchMacroCategories: vi.fn(() => Promise.resolve([])),
    createMacroCategory: vi.fn(() => Promise.resolve({})),
    updateMacroCategory: vi.fn(() => Promise.resolve({})),
    deleteMacroCategory: vi.fn(() => Promise.resolve()),
    fetchSuppliers: vi.fn(() => Promise.resolve([])),
    fetchSupplierPrices: vi.fn(() => Promise.resolve([])),
    salvaRigaListino: vi.fn(() => Promise.resolve({})),
    createSupplier: vi.fn((s) => Promise.resolve({ id: 'nuovo-fornitore', ...s })),
    updateSupplier: vi.fn(() => Promise.resolve({})),
    deleteSupplier: vi.fn(() => Promise.resolve()),
    subscribeSettings: (cb) => {
      cb({ price_markup: 3, purchase_vat: 22 })
      return () => {}
    },
    // Il magazzino parte dalla CACHE delle impostazioni (REQ-LIC-001): le
    // sezioni premium non devono comparire e sparire mentre il server
    // risponde. Qui i moduli sono spenti, come sul locale che non li ha.
    settingsIniziali: () => ({ price_markup: 3, purchase_vat: 22 }),
    // La colonna «a fine serata» (REQ-MAG-014) legge anche la cassa aperta,
    // i conti in corso e il listino: qui la serata non è aperta, quindi la
    // colonna non compare — ma senza queste tre voci la schermata non si
    // monta proprio.
    subscribeOpenCashSession: (cb) => {
      cb(null)
      return () => {}
    },
    subscribeActiveOrders: (cb) => {
      cb([])
      return () => {}
    },
    subscribeDrinks: (_opts, cb) => {
      cb([])
      return () => {}
    },
    DEFAULT_SETTINGS: { price_markup: 3, purchase_vat: 22 },
  }
})
// Le altre sezioni del magazzino (conta, ordini, scadenzario) hanno una vita
// loro e parlano con Firestore: qui non c'entrano.
vi.mock('../../src/components/StockCountPanel.jsx', () => ({ default: () => <div>CONTA</div> }))
vi.mock('../../src/components/PurchaseOrdersPanel.jsx', () => ({ default: () => <div>ORDINI</div> }))
vi.mock('../../src/components/SupplierInvoicesPanel.jsx', () => ({
  default: () => <div>SCADENZARIO</div>,
}))

import InventoryManager from '../../src/components/InventoryManager.jsx'
import { createInventoryItem, loadStock, adjustStock, createSupplier, salvaRigaListino } from '../../src/lib/api.js'

// Apre la vista a CARD (il default è la lista) e aspetta il prodotto.
// Card e lista sono DUE ICONE, e si cercano dalla loro etichetta: sulla linea
// di produzione era un tasto scritto «▦ Card», e con questo merge diventa
// l'icona «A card» (REQ-MAG-010). Il comportamento provato qui sotto è lo
// stesso: cambia solo come si arriva alla vista.
async function apriCard(user) {
  await screen.findByText('Campari')
  await user.click(screen.getByRole('button', { name: 'A card' }))
}

describe('la card del magazzino', () => {
  it('sotto i pezzi c’è il CONTENUTO, non gli stessi pezzi un’altra volta', async () => {
    const user = userEvent.setup()
    render(<InventoryManager />)
    await apriCard(user)
    // Numero grande: quanti pezzi ci sono. Sotto: quanto prodotto c'è
    // dentro, che è quello che serve a chi sta versando.
    expect(screen.getByText('7,49 pz')).toBeInTheDocument()
    expect(screen.getByText('749 cl')).toBeInTheDocument()
  })

  it('e non compare mai «7.49000000001»', async () => {
    const user = userEvent.setup()
    render(<InventoryManager />)
    await apriCard(user)
    // Il numero grezzo del calcolo, col punto e la coda di decimali, non
    // deve arrivare a schermo da nessuna parte.
    expect(document.body.textContent).not.toMatch(/7\.49/)
    expect(document.body.textContent).not.toMatch(/\d\.\d{4}/)
  })
})

// IL DETTAGLIO DI UNA CARD DEVE STARE DENTRO LA CARD.
//
// Aprendo un prodotto nella vista a Card il pannello dei dettagli sbordava e
// il testo si incolonnava a fisarmonica: «0 pz · 0 piene · 1 pz = 100 cl» a
// capo quattro volte, e costo, IVA e prezzo consigliato accavallati. La
// coppia etichetta/valore usa la griglia a due colonne della vista a Lista,
// dove c'è tutta la larghezza dello schermo; in una card larga 175px la
// colonna del valore resta larga un dito.
//
// Il layout non si prova in jsdom (le larghezze non esistono): quello che si
// prova qui è che la struttura colpita dalla regola sia davvero quella che
// finisce a schermo, e che la regola nel foglio di stile ci sia.
describe('il dettaglio della card non sborda', () => {
  const css = readFileSync('src/index.css', 'utf8')

  it('la scheda aperta di una card è dentro la card', async () => {
    const user = userEvent.setup()
    render(<InventoryManager />)
    await apriCard(user)
    // Ogni card ha il suo «⋯ Azioni»: si apre quella del Campari.
    const card = screen.getByText('Campari').closest('.grid-card')
    await user.click(within(card).getByRole('button', { name: '⋯ Azioni' }))
    expect(
      document.querySelector('.grid-card .grid-card-actions .inv-info .inv-info-row')
    ).not.toBeNull()
  })

  it('dentro una card etichetta e valore si incolonnano', () => {
    expect(css).toMatch(
      /\.grid-card\s+\.grid-card-actions\s+\.inv-info\s+\.inv-info-row\s*\{[^}]*grid-template-columns:\s*1fr/
    )
  })

  it('nella lista, dove lo spazio c’è, restano due colonne', () => {
    // La vista a Lista occupa tutta la larghezza: là la coppia
    // etichetta/valore su una riga sola si legge meglio, e resta com'era.
    expect(css).toMatch(/\.inv-info \.inv-info-row \{[^}]*grid-template-columns: 96px 1fr/)
  })
})

// E NEMMENO LA FILA DEI TRE TASTI DEVE SFONDARE LA CARD.
//
// Primo giro di correzione: le righe di testo si sono sistemate, ma provando
// sul test i tasti «✏️ Modifica · ⧉ Duplica · 🗑 Elimina» uscivano ancora dai
// bordi. Stesso errore un piano sotto: `.inv-azioni` era `repeat(3, 1fr)`, e
// `1fr` vale `minmax(auto, 1fr)` — non scende sotto la larghezza del
// contenuto. Tre bottoni con emoji e parola hanno un minimo più largo di
// quello che una card da 175px può dargli, quindi la griglia sborda invece di
// stringersi. La regola che li mandava a capo era una @media sulla finestra, e
// la finestra qui è grande: è la CARD a essere stretta.
//
// ATTENZIONE A COSA PROVA QUESTO TEST. happy-dom non fa layout — le larghezze
// e scrollWidth sono zero — quindi «la fila non esce dalla card» non si può
// MISURARE qui: quello si guarda con gli occhi, in un browser o al banco. Qui
// si prova il MECCANISMO, e non è poco: il foglio di stile vero viene applicato
// al DOM vero prodotto dal componente, e si controlla quale regola vince su
// quell'elemento — colonne che si stringono e vanno a capo da sé, guidate dal
// contenitore e non dalla finestra.
describe('la fila dei tasti dentro una card', () => {
  const css = readFileSync('src/index.css', 'utf8')

  // Il foglio di stile del progetto, addosso al DOM del componente.
  function applicaCss() {
    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
    return () => style.remove()
  }

  async function apriAzioniInCard(user) {
    render(<InventoryManager />)
    await apriCard(user)
    // Ogni card ha il suo «⋯ Azioni»: si apre quella del Campari.
    const card = screen.getByText('Campari').closest('.grid-card')
    await user.click(within(card).getByRole('button', { name: '⋯ Azioni' }))
  }

  it('le colonne possono stringersi e vanno a capo da sé', async () => {
    const user = userEvent.setup()
    await apriAzioniInCard(user)
    const via = applicaCss()
    const fila = document.querySelector('.grid-card .inv-azioni')
    expect(fila).not.toBeNull()
    const colonne = getComputedStyle(fila).gridTemplateColumns
    // `auto-fit`: tiene solo le colonne che entrano DAVVERO nella card, le
    // altre vanno a capo. Niente più tre colonne per forza.
    expect(colonne).toContain('auto-fit')
    expect(colonne).not.toContain('repeat(3')
    // `min(…, 100%)`: una colonna non è mai più larga della card, nemmeno nel
    // caso peggiore.
    expect(colonne).toMatch(/min\(\s*\d+px\s*,\s*100%\s*\)/)
    via()
  })

  it('e se la parola non ci sta si tronca, invece di sfondare', async () => {
    const user = userEvent.setup()
    await apriAzioniInCard(user)
    const via = applicaCss()
    const tasto = document.querySelector('.grid-card .inv-azioni .btn')
    const stile = getComputedStyle(tasto)
    // Senza `min-width: 0` un bottone resta incomprimibile, allarga la colonna
    // e si torna al punto di partenza.
    expect(['0', '0px']).toContain(stile.minWidth)
    expect(stile.overflow).toBe('hidden')
    expect(stile.textOverflow).toBe('ellipsis')
    via()
  })

  it('nella vista a Lista la fila resta a tre, che lo spazio c’è', async () => {
    const user = userEvent.setup()
    render(<InventoryManager />)
    // Vista a Lista: è il default, basta aprire la riga del prodotto.
    await user.click(await screen.findByRole('button', { name: /Campari/ }))
    const via = applicaCss()
    const fila = document.querySelector('.inv-row .inv-azioni')
    expect(fila).not.toBeNull()
    expect(getComputedStyle(fila).gridTemplateColumns).toBe('repeat(3, 1fr)')
    via()
  })

  it('il comportamento è agganciato alla card, non alla finestra', () => {
    // Una @media guarda la finestra: dentro una card stretta, su un monitor
    // grande, non scatterebbe mai. La regola delle card deve quindi stare al
    // primo livello del foglio di stile, fuori da qualunque blocco @media —
    // e lo si vede dalle graffe ancora aperte prima di lei.
    const pulito = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const dove = pulito.search(/\.grid-card\s+\.inv-azioni\s*\{[^}]*auto-fit/)
    expect(dove).toBeGreaterThan(-1)
    const prima = pulito.slice(0, dove)
    const aperte = (prima.match(/\{/g) || []).length - (prima.match(/\}/g) || []).length
    expect(aperte).toBe(0)
  })
})

// ── L'UNITÀ È SEMPRE IL PEZZO ────────────────────────────────────────
//
// La scheda ha fatto due giri di troppo: prima chiedeva l'unità d'acquisto a
// famiglie, poi «che tipo di prodotto è?» con quattro card. Tutte e due
// costringevano a dichiarare come si vende una cosa che si vende in più modi
// (il Jägermeister va nel Jägerbombo E si serve a cicchetto). Dal 18/08
// l'unità non si sceglie: è il pezzo, e la sola domanda è a quanto
// corrisponde (REQ-MAG-016). I test delle quattro card sono spariti con
// loro: descrivevano un comportamento che abbiamo deciso di cambiare.
describe('la scheda prodotto: l’unità è sempre il pezzo', () => {
  async function apriForm(user) {
    render(<InventoryManager />)
    await screen.findByText('Campari')
    await user.click(screen.getByRole('button', { name: '+ Nuovo prodotto' }))
  }

  it('non chiede né il tipo né l’unità: i campi ci sono da subito', async () => {
    const user = userEvent.setup()
    await apriForm(user)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.queryByLabelText('Come lo compri')).toBeNull()
    expect(screen.getByLabelText(/Costo €\/pz/)).toBeInTheDocument()
    expect(screen.getByLabelText(/A quanto corrisponde un pezzo/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Quantità iniziale \(pz\)/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Soglia di avviso \(pz\)/)).toBeInTheDocument()
  })

  it('col contenuto scritto si salva a pezzi, e il contenuto va in unità base', async () => {
    const user = userEvent.setup()
    createInventoryItem.mockClear()
    await apriForm(user)
    await user.type(screen.getByLabelText('Nome *'), 'Gin Bosford')
    await user.type(screen.getByLabelText(/Costo €\/pz/), '12')
    await user.type(screen.getByLabelText(/A quanto corrisponde un pezzo/), '70')
    await user.type(screen.getByLabelText(/Quantità iniziale \(pz\)/), '3')
    await user.type(screen.getByLabelText(/Soglia di avviso \(pz\)/), '2')
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(createInventoryItem).toHaveBeenCalled())
    expect(createInventoryItem.mock.calls.at(-1)[0]).toMatchObject({
      name: 'Gin Bosford',
      unit: 'pz',
      display_unit: 'pz',
      package_size: 700, // 70 cl in unità base
      content_unit: 'ml',
      // Il campo delle quattro card non si scrive più: era l'unica cosa che
      // quella schermata lasciava nei dati.
      tipo: null,
      // La resa legava due unità d'acquisto diverse: adesso lo stesso legame
      // lo dice il contenuto, e due risposte alla stessa domanda litigano.
      resa: null,
      resa_unit: null,
      scorta: true,
      cost: 12,
      stock: 3,
      low_threshold: 2,
    })
  })

  it('il contenuto è facoltativo: senza, in ricetta si dosa solo a pezzi', async () => {
    const user = userEvent.setup()
    createInventoryItem.mockClear()
    await apriForm(user)
    await user.type(screen.getByLabelText('Nome *'), 'Acqua tonica')
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(createInventoryItem).toHaveBeenCalled())
    expect(createInventoryItem.mock.calls.at(-1)[0]).toMatchObject({
      unit: 'pz',
      package_size: null,
      content_unit: null,
    })
    expect(screen.queryByText(/dosa solo a pezzi/)).toBeNull() // la scheda è chiusa
  })

  it('la confezione già aperta vale la sua frazione di pezzo', async () => {
    const user = userEvent.setup()
    createInventoryItem.mockClear()
    await apriForm(user)
    await user.type(screen.getByLabelText('Nome *'), 'Vermut')
    await user.type(screen.getByLabelText(/A quanto corrisponde un pezzo/), '100')
    await user.type(screen.getByLabelText(/Quantità iniziale \(pz\)/), '2')
    await user.type(screen.getByLabelText(/Confezione aperta/), '50')
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(createInventoryItem).toHaveBeenCalled())
    // 2 piene + mezza da 100 cl = 2,5 pezzi.
    expect(createInventoryItem.mock.calls.at(-1)[0]).toMatchObject({ stock: 2.5 })
  })

  it('le unità del contenuto sono queste e basta: capacità, peso, U', async () => {
    // «Non ce le possiamo mettere a creare ogni volta» (Flavio, 18/08):
    // niente unità inventate dall'utente, mai.
    const user = userEvent.setup()
    await apriForm(user)
    const scelta = screen.getByLabelText('Unità del contenuto')
    expect([...scelta.options].map((o) => o.value)).toEqual(['l', 'cl', 'ml', 'kg', 'g', 'U'])
  })

  it('a peso il conteggio in pezzi è una stima, e la scheda lo dice', async () => {
    // Un limone non pesa sempre uguale: chi legge «47 pz» deve sapere che
    // nessuno li ha contati uno per uno.
    const user = userEvent.setup()
    createInventoryItem.mockClear()
    await apriForm(user)
    await user.type(screen.getByLabelText('Nome *'), 'Ghiaccio')
    await user.type(screen.getByLabelText(/A quanto corrisponde un pezzo/), '8')
    await user.selectOptions(screen.getByLabelText('Unità del contenuto'), 'g')
    expect(screen.getByText(/stima/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(createInventoryItem).toHaveBeenCalled())
    expect(createInventoryItem.mock.calls.at(-1)[0]).toMatchObject({
      unit: 'pz',
      package_size: 8,
      content_unit: 'g',
    })
  })

  it('il «?» spiega i tre livelli: pezzo, contenuto, collo', async () => {
    const user = userEvent.setup()
    await apriForm(user)
    await user.click(screen.getByRole('button', { name: /Come si compila/ }))
    const box = await screen.findByRole('dialog', { name: /Come si compila/ })
    expect(within(box).getByText('Si conta sempre a pezzi')).toBeInTheDocument()
    expect(within(box).getByText('A quanto corrisponde un pezzo')).toBeInTheDocument()
    expect(within(box).getByText('Il collo si dichiara al carico')).toBeInTheDocument()
    expect(within(box).getByText(/La merce a peso si stima/)).toBeInTheDocument()
  })
})

// ── QUELLO CHE NON È MERCE NON SI SCARICA ────────────────────────────
// «Tempo di Lavorazione» sta a listino per mettere il lavoro nel costo del
// drink, ma non sta su nessuno scaffale. Se si scaricasse, al primo Daiquiri
// andrebbe a zero, il menù direbbe «Ingrediente esaurito» e il drink
// sparirebbe dalla carta. Con l'unità bloccata sul pezzo a dirlo non può più
// essere l'unità di misura: lo dice il prodotto, con una casella.
describe('la casella «è una scorta»', () => {
  it('spenta, il prodotto non ha giacenza iniziale né soglia', async () => {
    const user = userEvent.setup()
    createInventoryItem.mockClear()
    render(<InventoryManager />)
    await screen.findByText('Campari')
    await user.click(screen.getByRole('button', { name: '+ Nuovo prodotto' }))
    await user.type(screen.getByLabelText('Nome *'), 'Tempo di Lavorazione')
    await user.type(screen.getByLabelText(/Costo €\/pz/), '0.5')
    await user.click(screen.getByRole('checkbox', { name: /È una scorta/ }))
    expect(screen.queryByLabelText(/Quantità iniziale/)).toBeNull()
    expect(screen.queryByLabelText(/Soglia di avviso/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(createInventoryItem).toHaveBeenCalled())
    expect(createInventoryItem.mock.calls.at(-1)[0]).toMatchObject({
      name: 'Tempo di Lavorazione',
      unit: 'pz',
      scorta: false,
      stock: 0,
      low_threshold: 0,
    })
  })

  it('riaprendo il lavoro già a listino resta spenta', async () => {
    // Il «Tempo di Lavorazione» salvato prima (unità generiche, senza campo
    // `scorta`) non deve diventare merce solo perché si riapre la scheda.
    const user = userEvent.setup()
    render(<InventoryManager />)
    await screen.findByText('Campari')
    await user.click(screen.getByRole('button', { name: /Tempo di Lavorazione/ }))
    await user.click(screen.getByRole('button', { name: '✏️ Modifica' }))
    expect(screen.getByRole('checkbox', { name: /È una scorta/ })).not.toBeChecked()
  })
})

// ── UNA SCHEDA VECCHIA SI RIAPRE, E PASSA AI PEZZI ───────────────────
// I prodotti salvati prima stanno ancora in ml, g o U finché non passa il
// travaso (REQ-MAG-018). Riaprendone uno e salvandolo lo si porta a pezzi:
// la giacenza si converte, e come finisce si legge PRIMA di salvare.
describe('un prodotto storico si legge già a pezzi', () => {
  async function apriModifica(user, nome) {
    render(<InventoryManager />)
    await screen.findByText('Campari')
    await user.click(screen.getByRole('button', { name: new RegExp(nome) }))
    await user.click(screen.getByRole('button', { name: '✏️ Modifica' }))
  }

  it('chi era già a pezzi non cambia niente, e rilegge il suo contenuto', async () => {
    const user = userEvent.setup()
    await apriModifica(user, 'Campari')
    expect(screen.getByLabelText(/A quanto corrisponde un pezzo/)).toHaveValue(100)
    expect(screen.getByLabelText('Unità del contenuto')).toHaveValue('cl')
    // Il costo è quello di un pezzo: la bottiglia costa 12 €.
    expect(screen.getByLabelText(/Costo €\/pz/)).toHaveValue(12)
    expect(screen.queryByText(/era scritto a/)).toBeNull()
  })

})

// ── IL CARICO A COLLI È UN'ECCEZIONE ─────────────────────────────────
// Chi carica due bottiglie prese dal fornitore sotto casa non ha nessun
// cartone da dichiarare: i campi del collo stavano sempre a vista, in fondo
// e dentro il riquadro del prezzo, e la quantità andava scritta a mano
// sperando che il conto tornasse.
describe('carico: il collo dietro un interruttore', () => {
  // Il tasto «Carico» sta nel dettaglio del prodotto: prima si apre la riga.
  async function apriCarico(user) {
    render(<InventoryManager />)
    await user.click(await screen.findByText('Campari'))
    await user.click(await screen.findByRole('button', { name: /Carico/ }))
  }

  it('di suo non si vede: si scrive la quantità e basta', async () => {
    const user = userEvent.setup()
    await apriCarico(user)
    expect(screen.getByRole('checkbox', { name: /Carico a colli/ })).not.toBeChecked()
    expect(screen.queryByLabelText(/per collo/)).toBeNull()
    expect(screen.getByLabelText(/Quanto aggiungi/)).not.toHaveAttribute('readonly')
  })

  it('acceso, il collo sta SOPRA e i pezzi si contano da soli', async () => {
    const user = userEvent.setup()
    await apriCarico(user)
    await user.click(screen.getByRole('checkbox', { name: /Carico a colli/ }))

    const perCollo = screen.getByLabelText(/Pezzi per collo/)
    const colli = screen.getByLabelText(/Quanti colli arrivano/)
    // Il riquadro del collo viene prima della quantità, che è l'ordine in cui
    // si guarda il cartone.
    const pezzi = screen.getByLabelText(/Quanto aggiungi/)
    expect(perCollo.compareDocumentPosition(pezzi) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.type(perCollo, '24')
    await user.type(colli, '2')
    expect(pezzi).toHaveValue(48)
    // E non si corregge a mano: sarebbe un numero che non torna con quello
    // che è arrivato.
    expect(pezzi).toHaveAttribute('readonly')
    // A colli si contano pezzi e basta: un cartone ha dentro pezzi, non
    // centilitri, e l'unità non si può più cambiare.
    expect(screen.queryByLabelText('Unità del carico')).toBeNull()
  })
})

// ── OGNI MOVIMENTO CHIEDE IN CHE UNITÀ ───────────────────────────────
// «Se facciamo un carico, uno scarico, qualsiasi cosa esso sia di
// movimentazione» si sceglie se muovere a pezzi o nell'unità che compone il
// pezzo (Flavio, 18/08): la cassetta di limoni si carica a chili, e i pezzi
// li ricava il contenuto. Prima il carico di un articolo a pezzi accettava
// solo pezzi, e per due bottiglie da mezzo litro non c'era modo di dirlo.
describe('carico e rettifica si scrivono nell’unità che si ha in mano', () => {
  async function apriCarico(user) {
    render(<InventoryManager />)
    await user.click(await screen.findByText('Campari'))
    await user.click(await screen.findByRole('button', { name: /Carico/ }))
  }

  it('il carico offre pezzi e contenuto, e dice quanto entra davvero', async () => {
    const user = userEvent.setup()
    loadStock.mockClear()
    await apriCarico(user)
    const unita = screen.getByLabelText('Unità del carico')
    expect([...unita.options].map((o) => o.value)).toEqual(['pz', 'cl'])

    await user.selectOptions(unita, 'cl')
    await user.type(screen.getByLabelText(/Quanto aggiungi/), '250')
    // Il Campari è una bottiglia da 100 cl: 250 cl sono due pezzi e mezzo, e
    // il numero si legge PRIMA di confermare.
    expect(screen.getByText('2,5 pz')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Conferma carico/ }))
    await waitFor(() => expect(loadStock).toHaveBeenCalled())
    expect(loadStock.mock.calls.at(-1)[1]).toBeCloseTo(2.5, 6)
  })

  it('anche la rettifica: si conta quello che resta nella bottiglia', async () => {
    const user = userEvent.setup()
    adjustStock.mockClear()
    render(<InventoryManager />)
    await user.click(await screen.findByText('Campari'))
    await user.click(await screen.findByRole('button', { name: /Contenuto reale/ }))
    const campo = screen.getByLabelText(/Contenuto effettivo/)
    // Si parte da quello che risulta, in pezzi.
    expect(Number(campo.value)).toBeCloseTo(7.49, 6)
    // Contando i centilitri rimasti la quantità non cambia: cambia come la
    // si scrive. Una bottiglia da 100 cl, 7,49 pezzi, fa 749 cl.
    await user.selectOptions(screen.getByLabelText('Unità della conta'), 'cl')
    expect(Number(campo.value)).toBeCloseTo(749, 6)
    await user.click(screen.getByRole('button', { name: /Salva contenuto/ }))
    await waitFor(() => expect(adjustStock).toHaveBeenCalled())
    expect(adjustStock.mock.calls.at(-1)[1]).toBeCloseTo(7.49, 6)
  })
})

// ── IL CONTENUTO DI UN PEZZO NON È LA DOSE DEL DRINK ─────────────────
// La domanda si legge facilmente per un'altra — «quanto ne va in un
// drink?» — e quella la decide la ricetta. Chi le confonde riempie il campo
// con la dose di un cocktail e scarica il magazzino con numeri sbagliati.
describe('il contenuto di un pezzo, spiegato', () => {
  it('la didascalia dice a cosa serve, e il «?» distingue contenuto e dose', async () => {
    const user = userEvent.setup()
    render(<InventoryManager />)
    await screen.findByText('Campari')
    await user.click(screen.getByRole('button', { name: '+ Nuovo prodotto' }))

    // A vuoto la didascalia dice cosa succede a lasciarlo vuoto.
    expect(screen.getByText(/in ricetta si dosa solo a pezzi/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/A quanto corrisponde un pezzo/), '70')
    expect(screen.getByText(/scalano la loro frazione/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Come funziona il contenuto di un pezzo/ }))
    const box = await screen.findByRole('dialog', { name: /A quanto corrisponde un pezzo/ })
    expect(within(box).getByText(/Se lo lasci vuoto/)).toBeInTheDocument()
    expect(within(box).getByText(/solo a pezzi/)).toBeInTheDocument()
  })
})


// ── «QUANTE NE HO?» È LA PRIMA DOMANDA ───────────────────────────────
// Aprendo un prodotto si leggevano soglia, costo e prezzo consigliato, ma
// non la giacenza — che è la cosa per cui lo si apre.
describe('il dettaglio del prodotto dice quanto ce n’è', () => {
  it('quanto ce n’è è la prima riga', async () => {
    const user = userEvent.setup()
    render(<InventoryManager />)
    await user.click(await screen.findByText('Campari'))
    // Dove si conta a pezzi lo dice la riga «Pezzi», che è più precisa
    // (quante piene, quella aperta, quanto fa una): una riga «Giacenza»
    // sopra direbbe lo stesso numero due volte.
    const prima = document.querySelector('.inv-info .inv-info-row')
    expect(prima.textContent).toMatch(/^(Pezzi|Giacenza)/)
    expect(prima.textContent).toMatch(/[\d.,]+\s*(pz|cl|ml|L|g|kg|U)/)
  })
})

// ── «PZ» AL POSTO DI «BOTTIGLIE», DAPPERTUTTO (REQ-MAG-019) ──────────
// «Non dobbiamo vincolarci troppo a un gestionale per un bar. "Bottiglie"
// non è generico per un gestionale che in qualche modo deve essere generico»
// (Flavio, 18/08). Qui dentro ci sono cubetti, limoni, barattoli e ore di
// lavoro: la parola che vale per tutti è «pz». Restano le «piene / aperta /
// finite» del dettaglio, che descrivono l'oggetto sullo scaffale e non
// l'unità di misura.
describe('le parole a schermo non danno per scontata la bottiglia', () => {
  it('il costo si legge al pezzo, non «alla confezione»', async () => {
    const user = userEvent.setup()
    render(<InventoryManager />)
    await user.click(await screen.findByText('Campari'))
    const costo = await screen.findByText(/€\/pz/)
    expect(costo).toBeInTheDocument()
    expect(screen.queryByText(/\/conf\./)).toBeNull()
  })

  it('e il segno dell’assortimento non parla di bottiglie', async () => {
    // Il file si legge com'è: l'etichetta sta in un `title`, e cercarla a
    // schermo vorrebbe dire montare mezza schermata per una parola.
    const sorgente = readFileSync('src/components/InventoryManager.jsx', 'utf8')
    const titoli = sorgente
      .slice(
        sorgente.indexOf('const ASSORTIMENTO_TITOLO'),
        sorgente.indexOf('function SegnoAssortimento')
      )
      .split(String.fromCharCode(10))
      // I commenti raccontano il perché del cambio, e la parola vecchia ci
      // sta dentro apposta: qui si guarda quello che si legge a schermo.
      .filter((r) => !r.trim().startsWith('//'))
      .join(String.fromCharCode(10))
    expect(titoli).not.toMatch(/ottigli/)
  })
})

// ── IL FORNITORE CHE MANCA SI AGGIUNGE DA QUI (REQ-MAG-017) ──────────
// Accorgersi che il fornitore non c'è mentre si compila la scheda voleva
// dire uscire, andare in Fornitori, crearlo e tornare a ricominciare da
// capo — proprio nel momento in cui si stava facendo un'altra cosa. Il
// modello esiste già nel modulo del drink: «➕ Nuova categoria…».
describe('il fornitore si aggiunge dalla tendina del prodotto', () => {
  it('basta il nome, e resta selezionato su quello che si stava compilando', async () => {
    const user = userEvent.setup()
    createSupplier.mockClear()
    createInventoryItem.mockClear()
    render(<InventoryManager />)
    await screen.findByText('Campari')
    await user.click(screen.getByRole('button', { name: '+ Nuovo prodotto' }))

    // Ultima voce della tendina, come nel menù.
    const tendina = screen.getByLabelText('Fornitore')
    expect([...tendina.options].at(-1).textContent).toMatch(/Nuovo fornitore/)
    await user.selectOptions(tendina, '__new__')

    // Una finestra dove basta confermare il nome: il resto dei dati
    // aziendali si mette dopo, con calma, dalla sezione Fornitori.
    await user.type(screen.getByLabelText('Nome nuovo fornitore'), 'NOVA')
    await user.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(createSupplier).toHaveBeenCalled())
    expect(createSupplier.mock.calls.at(-1)[0]).toMatchObject({ name: 'NOVA' })

    // E il prodotto se lo tiene: se toccasse riselezionarlo a mano il giro
    // non si sarebbe accorciato di niente.
    await waitFor(() => expect(screen.getByLabelText('Fornitore')).toHaveValue('nuovo-fornitore'))
    await user.type(screen.getByLabelText('Nome *'), 'Acqua Brillante Tonica')
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(createInventoryItem).toHaveBeenCalled())
    // IL FORNITORE NON SI SCRIVE PIÙ SUL PRODOTTO (REQ-MAG-029): il
    // prodotto resta UNO e i fornitori possono essere più d'uno, quindi il
    // legame vive nel LISTINO. Prima qui si controllava
    // `supplier_id: 'nuovo-fornitore'` sul prodotto; adesso quel campo non
    // lo scrive più nessuno — non si cancella, ma non si riscrive.
    expect(createInventoryItem.mock.calls.at(-1)[0].supplier_id).toBeUndefined()
    await waitFor(() => expect(salvaRigaListino).toHaveBeenCalled())
    expect(salvaRigaListino.mock.calls.at(-1)[0]).toMatchObject({
      supplier_id: 'nuovo-fornitore',
      item_id: 'nuovo',
    })
  })

  it('e ci si può ripensare senza aver creato niente', async () => {
    const user = userEvent.setup()
    createSupplier.mockClear()
    render(<InventoryManager />)
    await screen.findByText('Campari')
    await user.click(screen.getByRole('button', { name: '+ Nuovo prodotto' }))
    await user.selectOptions(screen.getByLabelText('Fornitore'), '__new__')
    await user.click(screen.getByRole('button', { name: '✕' }))
    expect(createSupplier).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Fornitore')).toBeInTheDocument()
  })
})
