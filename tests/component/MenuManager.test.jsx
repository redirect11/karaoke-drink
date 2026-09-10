// @vitest-environment happy-dom
'use strict'

// DUPLICARE UN DRINK. Mezzo listino sono variazioni: lo stesso drink col
// gin diverso, la versione analcolica, il formato grande. Rifarli a mano
// vuol dire riscrivere la RICETTA ingrediente per ingrediente, ed è lì che
// si sbaglia una dose e poi il magazzino scala storto.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

// Il filo per far arrivare alla pagina, mentre è aperta, quello che il
// server manderebbe: vi.mock viene issato in cima al file, quindi la
// scatola va creata con vi.hoisted o dentro il mock sarebbe ancora vuota.
const filo = vi.hoisted(() => ({ consegnaCategorie: null }))

const DRINKS = [
  {
    id: 'mojito',
    name: 'Mojito',
    price: 7,
    description: 'Rum, lime, menta',
    recipe: 'Pesta la menta, poi allunga con soda.',
    available: true,
    category_id: 'c1',
    image_url: 'https://esempio/mojito.jpg',
    recipe_items: [{ inventory_item_id: 'i1', name: 'Rum', qty: 50, unit: 'ml' }],
  },
]
const CATEGORIE = [{ id: 'c1', name: 'Cocktail', sort_order: 0 }]
const MAGAZZINO = [{ id: 'i1', name: 'Rum', unit: 'ml', qty: 3000, cost: 20, package_qty: 700 }]

vi.mock('../../src/lib/api.js', () => ({
  fetchDrinks: vi.fn(() => Promise.resolve(DRINKS)),
  updateDrink: vi.fn(() => Promise.resolve()),
  deleteDrink: vi.fn(() => Promise.resolve()),
  fetchCategories: vi.fn(() => Promise.resolve(CATEGORIE)),
  // La pagina sta in ascolto: qui teniamo il filo per consegnare, a mano,
  // quello che il server manderebbe mentre la pagina è aperta.
  subscribeCategories: vi.fn((onChange) => {
    filo.consegnaCategorie = onChange
    onChange(CATEGORIE)
    return () => {}
  }),
  createCategory: vi.fn(() => Promise.resolve({ id: 'c2', name: 'Nuova' })),
  updateCategory: vi.fn(() => Promise.resolve()),
  deleteCategory: vi.fn(() => Promise.resolve()),
  fetchInventoryItems: vi.fn(() => Promise.resolve(MAGAZZINO)),
  subscribePosPrefs: vi.fn(() => () => {}),
  savePosColors: vi.fn(() => Promise.resolve()),
  subscribeSettings: vi.fn(() => () => {}),
  DEFAULT_SETTINGS: { stripe_menu: 'scorte' },
  settingsIniziali: () => ({ stripe_menu: 'scorte' }),
}))
vi.mock('../../src/lib/storage.js', () => ({
  deleteDrinkImageByUrl: vi.fn(() => Promise.resolve()),
  uploadDrinkImage: vi.fn(() => Promise.resolve('https://esempio/nuova.jpg')),
}))

const salvaDrink = vi.fn(() => Promise.resolve())
vi.mock('../../src/lib/saveDrink.js', () => ({
  saveDrinkFromForm: (...a) => salvaDrink(...a),
}))

import MenuManager from '../../src/components/MenuManager.jsx'
import { subscribeSottosezioni } from '../../src/lib/sottosezioni.js'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

// Apre le azioni della card del Mojito e restituisce il riquadro.
async function azioniMojito(user) {
  const card = (await screen.findByText('Mojito')).closest('.menu-card')
  await user.click(within(card).getByRole('button', { name: /Azioni/ }))
  return within(card)
}

describe('duplicare un drink dalle azioni della card', () => {
  it('apre la scheda già piena, col nome marcato come copia', async () => {
    const user = userEvent.setup()
    render(<MenuManager />)
    const card = await azioniMojito(user)
    await user.click(card.getByRole('button', { name: /Duplica/ }))

    expect(await screen.findByLabelText('Nome *')).toHaveValue('Mojito (copia)')
    expect(screen.getByLabelText(/Prezzo/)).toHaveValue(7)
    // LA RICETTA VIENE DIETRO: è la parte lunga, ed è il motivo per cui si
    // duplica invece di rifare da capo.
    expect(screen.getByText('Rum')).toBeInTheDocument()
  })

  it('salvando NASCE un drink nuovo: l’originale non si tocca', async () => {
    const user = userEvent.setup()
    render(<MenuManager />)
    const card = await azioniMojito(user)
    await user.click(card.getByRole('button', { name: /Duplica/ }))
    await screen.findByLabelText('Nome *')
    await user.click(screen.getByRole('button', { name: /^Salva/ }))

    await waitFor(() => expect(salvaDrink).toHaveBeenCalled())
    const arg = salvaDrink.mock.calls[0][0]
    expect(arg.existing).toBe(null) // nuovo, non una modifica del Mojito
    expect(arg.form.name).toBe('Mojito (copia)')
  })

  it('la copia non si porta dietro la foto dell’originale', async () => {
    // Il file è agganciato al drink che l'ha caricato: cancellando
    // l'originale sparirebbe anche dalla copia, che resterebbe con un
    // riquadro rotto in carta.
    const user = userEvent.setup()
    render(<MenuManager />)
    const card = await azioniMojito(user)
    await user.click(card.getByRole('button', { name: /Duplica/ }))
    await screen.findByLabelText('Nome *')
    await user.click(screen.getByRole('button', { name: /^Salva/ }))

    await waitFor(() => expect(salvaDrink).toHaveBeenCalled())
    expect(salvaDrink.mock.calls[0][0].form.image_url).toBe(null)
  })

  it('«Aggiungi prodotto» dopo una duplica parte da vuoto', async () => {
    const user = userEvent.setup()
    render(<MenuManager />)
    const card = await azioniMojito(user)
    await user.click(card.getByRole('button', { name: /Duplica/ }))
    await screen.findByLabelText('Nome *')
    await user.click(screen.getByRole('button', { name: /Annulla/ }))
    await user.click(await screen.findByRole('button', { name: /Aggiungi prodotto/ }))
    expect(await screen.findByLabelText('Nome *')).toHaveValue('')
  })
})

// IL CONTEGGIO DELLE CATEGORIE NEL MENU A LATO. Le categorie si leggevano
// una volta sola all’apertura della pagina: il numero fra parentesi restava
// quello di allora, e una categoria creata dall’altro terminale (o al volo
// dalla scheda di un drink) non si contava finché non si entrava nella
// sezione. Al banco vuol dire fidarsi di un numero sbagliato.
describe('il conteggio «Categorie (N)» nel menu a lato', () => {
  // Le voci del menu a lato non le disegna la pagina: le dichiara e basta
  // (lib/sottosezioni.js), la barra le mostra. Qui le leggiamo da lì.
  function spiaVoci() {
    let ultime = []
    const stop = subscribeSottosezioni((s) => { ultime = s.voci })
    return { voce: (id) => ultime.find((v) => v.id === id), stop }
  }

  it('si aggiorna appena ne arriva una nuova, senza entrare nella sezione', async () => {
    const spia = spiaVoci()
    render(<MenuManager />)
    await screen.findByText('Mojito')
    await waitFor(() => expect(spia.voce('categorie').label).toBe('Categorie (1)'))

    // Un altro terminale aggiunge «Analcolici»: la pagina resta sul catalogo.
    act(() =>
      filo.consegnaCategorie([...CATEGORIE, { id: 'c2', name: 'Analcolici', sort_order: 1 }])
    )

    await waitFor(() => expect(spia.voce('categorie').label).toBe('Categorie (2)'))
    expect(screen.queryByPlaceholderText('Nuova categoria')).not.toBeInTheDocument()
    spia.stop()
  })

  it('e cala quando una categoria viene tolta', async () => {
    const spia = spiaVoci()
    render(<MenuManager />)
    await screen.findByText('Mojito')
    act(() => filo.consegnaCategorie([]))
    await waitFor(() => expect(spia.voce('categorie').label).toBe('Categorie (0)'))
    spia.stop()
  })
})

// ── L'IVA DI VENDITA SULLA SINGOLA VOCE (REQ-MENU-013) ───────────────
// Il locale ha la sua aliquota generale, ma nel menù c'è una categoria
// BOTTIGLIE e una bottiglia intera non si rivende come un drink servito al
// banco. Mettere tutto al 10% gonfia il netto, e dal netto scendono
// margine, incidenze e conto di fine mese.
describe('l’IVA di vendita nella scheda del prodotto', () => {
  it('c’è un campo suo, e vuoto vale quella del locale', async () => {
    const user = userEvent.setup()
    render(<MenuManager />)
    await user.click(await screen.findByRole('button', { name: /Aggiungi prodotto/ }))
    const campo = await screen.findByLabelText(/IVA vendita/)
    // Parte VUOTO: chi non ha eccezioni da scrivere non compila niente.
    expect(campo).toHaveValue(null)
    expect(screen.getByText(/vale quella del locale/i)).toBeInTheDocument()
  })

  it('quello che si scrive lì finisce nel prodotto salvato', async () => {
    const user = userEvent.setup()
    render(<MenuManager />)
    await user.click(await screen.findByRole('button', { name: /Aggiungi prodotto/ }))
    await user.type(await screen.findByLabelText('Nome *'), 'Bottiglia di gin')
    await user.type(screen.getByLabelText(/IVA vendita/), '22')
    await user.click(screen.getByRole('button', { name: /^Salva/ }))

    await waitFor(() => expect(salvaDrink).toHaveBeenCalled())
    expect(salvaDrink.mock.calls[0][0].form.sale_vat).toBe('22')
  })
})

// LE ICONE DELLE SOTTOSEZIONI SONO EMOJI, E VANNO SCRITTE A COLORI.
// 🏷 e 🗂 sono fra i pochi emoji con presentazione TESTUALE di serie:
// scritti nudi il font li disegna in bianco e nero, e su Windows escono
// come rettangolini storti. Provammo a sostituirli con disegni SVG: il
// glifo si vedeva, ma in una fila fatta di emoji a colori due sagome
// monocrome stonavano, e lo stacco si notava piu' del difetto di prima.
// La cura e' il selettore di variante U+FE0F in coda, che dice al font
// «questa disegnala a colori»: stessa emoji, stessa fila. Qui si
// controlla che non ne resti in giro una NUDA, cioe' senza selettore.
describe('le icone delle sottosezioni', () => {
  const sorgente = (f) => readFileSync(join(process.cwd(), 'src/components', f), 'utf8')
  // Le righe fra `const NOME = [` e la quadra che lo chiude a inizio riga.
  const elenco = (f, nome) => {
    const righe = sorgente(f).split(/\r?\n/)
    const da = righe.findIndex((riga) => riga.includes(`const ${nome} = [`))
    expect(da, `${nome} in ${f}`).toBeGreaterThan(-1)
    const fine = righe.findIndex((riga, i) => i > da && riga.startsWith(']'))
    return righe.slice(da, fine + 1).join(' ')
  }

  // 🏷 o 🗂 NON seguiti da U+FE0F: l'emoji nuda, quella che si vede male.
  const NUDA = /[\u{1F3F7}\u{1F5C2}](?!\u{FE0F})/u

  // Le Statistiche non hanno più un elenco di sezioni: il «Mensile per
  // macro» ha traslocato in Bilancio, e con una vista sola non c'è niente
  // da far scegliere. L'elenco col 🗂️ dentro adesso è quello del Bilancio.
  it('menù, magazzino, bilancio e impostazioni le scrivono a colori', () => {
    for (const [file, nome] of [
      ['MenuManager.jsx', 'sezioni'],
      ['InventoryManager.jsx', 'INV_VIEWS'],
      ['BilancioTab.jsx', 'SEZIONI_BILANCIO'],
      ['SettingsTab.jsx', 'GRUPPI'],
    ]) {
      expect(elenco(file, nome), `${nome} in ${file}`).not.toMatch(NUDA)
    }
  })

  it('e non ne resta una nuda nei pannelli delle macro', () => {
    for (const f of ['MacroCategoryManager.jsx', 'MacroMonthlyTab.jsx']) {
      expect(sorgente(f), f).not.toMatch(NUDA)
    }
  })
})
