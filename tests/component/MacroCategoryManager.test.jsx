// @vitest-environment happy-dom
'use strict'

// UNA MACRO SI APRE E DENTRO CI SONO I SINGOLI PRODOTTI E LE SINGOLE VOCI,
// ognuno con la sua percentuale (REQ-MAG-042). Flavio, 09/09/2026:
// «clicco su una macro categoria e mi appaiono tutti i prodotti di
// magazzino e tutti gli items del menu … sinistra prodotti destra items …
// tutti in ordine alfabetico … con una percentuale».
//
// E TUTTO SI VEDE SUBITO, SENZA RETE: una macro nuova, un nome cambiato, un
// peso scritto restano a schermo nell'istante del gesto. È una lista lunga
// da riempire una casella dietro l'altra, e aspettare la rete a ogni
// casella vorrebbe dire compilarne una al minuto.
//
// COM'È FATTO: si mocka SOLO Firestore, non `src/lib/api.js`, se no si
// proverebbe il mock e non il codice. Ogni scrittura resta appesa per
// sempre, come fa davvero una cache mentre la scrittura è in coda (il
// modello è tests/unit/giroInLocale.test.js).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const mai = () => new Promise(() => {})
const stato = { scritture: [] }

vi.mock('../../src/lib/firebaseClient.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
  functions: {},
  storage: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db, nome) => ({ __col: nome }),
  doc: (...args) => {
    if (args.length >= 3) return { col: args[1], id: args[2] }
    return { col: args[0]?.__col || 'x', id: 'id-nuovo' }
  },
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(() => mai()),
  setDoc: vi.fn((ref, data, opts) => {
    stato.scritture.push({ tipo: 'set', col: ref?.col, id: ref?.id, data, opts })
    return mai()
  }),
  updateDoc: vi.fn((ref, patch) => {
    stato.scritture.push({ tipo: 'update', col: ref?.col, id: ref?.id, patch })
    return mai()
  }),
  deleteDoc: vi.fn((ref) => {
    stato.scritture.push({ tipo: 'delete', col: ref?.col, id: ref?.id })
    return mai()
  }),
  deleteField: () => ({ __delete: true }),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  onSnapshot: () => () => {},
  serverTimestamp: () => null,
  increment: (n) => n,
  writeBatch: () => ({ update: vi.fn(), set: vi.fn(), commit: () => mai() }),
  Timestamp: class Timestamp {
    static fromDate(d) {
      return d
    }
    static fromMillis(m) {
      return m
    }
  },
}))

const { default: MacroCategoryManager } = await import('../../src/components/MacroCategoryManager.jsx')

const MACROS = [
  {
    id: 'm1',
    name: 'Distillati',
    sort_order: 0,
    pesi_prodotti: { gin: 100 },
    pesi_voci: { negroni: 100 },
  },
  {
    id: 'm2',
    name: 'Bibite',
    sort_order: 1,
    pesi_prodotti: { schweppes: 40 },
    pesi_voci: {},
  },
]
const PRODOTTI = [
  { id: 'schweppes', name: 'Schweppes' },
  { id: 'gin', name: 'Gin' },
  { id: 'agave', name: 'Agave' },
]
const VOCI = [
  { id: 'spritz', name: 'Spritz' },
  { id: 'negroni', name: 'Negroni' },
]

beforeEach(() => {
  vi.clearAllMocks()
  stato.scritture = []
})

const monta = (props = {}) =>
  render(<MacroCategoryManager macros={MACROS} prodotti={PRODOTTI} voci={VOCI} {...props} />)

const apri = (user, nome) => user.click(screen.getByRole('button', { name: new RegExp(nome) }))
const colonne = () => document.querySelectorAll('.macro-pesi .macro-colonna')
const nomiIn = (col) => [...col.querySelectorAll('.macro-peso-nome')].map((n) => n.textContent)
const pesiScritti = () => stato.scritture.filter((s) => s.tipo === 'set' && s.opts?.merge)

describe('l’elenco delle macro', () => {
  it('dice quanti prodotti e quante voci ha dentro ognuna, senza aprirla', () => {
    monta()
    expect(screen.getByRole('button', { name: /Distillati/ })).toHaveTextContent('1 prodotti · 1 voci')
    expect(screen.getByRole('button', { name: /Bibite/ })).toHaveTextContent('1 prodotti · 0 voci')
    expect(screen.queryByRole('textbox', { name: 'Cerca fra i prodotti' })).toBeNull()
  })

  // Con la rete staccata `addDoc` non tornerebbe mai: l'id se lo fa il
  // terminale e la macro compare nell'istante in cui si tocca «Aggiungi».
  it('una macro nuova compare subito, e la scrittura parte in sottofondo', async () => {
    const user = userEvent.setup()
    monta()
    await user.type(screen.getByPlaceholderText(/es\. Distillati/), 'Food')
    await user.click(screen.getByRole('button', { name: 'Aggiungi' }))
    expect(screen.getByRole('button', { name: /Food/ })).toHaveTextContent('0 prodotti · 0 voci')
    expect(stato.scritture).toEqual([
      expect.objectContaining({ tipo: 'set', col: 'macro_categories', data: expect.objectContaining({ name: 'Food', sort_order: 2 }) }),
    ])
  })

  it('cancellandone una, si dice cosa succede a prodotti e voci, e sparisce subito', async () => {
    const user = userEvent.setup()
    const conferma = vi.spyOn(window, 'confirm').mockReturnValue(true)
    monta()
    await user.click(screen.getAllByRole('button', { name: '🗑' })[0])
    expect(conferma.mock.calls[0][0]).toMatch(/Prodotti e voci restano/)
    expect(screen.queryByRole('button', { name: /Distillati/ })).toBeNull()
    expect(stato.scritture).toEqual([{ tipo: 'delete', col: 'macro_categories', id: 'm1' }])
  })

  it('spostandone una, l’ordine cambia subito', async () => {
    const user = userEvent.setup()
    monta()
    await user.click(screen.getAllByRole('button', { name: '↓' })[0])
    const nomi = [...document.querySelectorAll('.macro-apri strong')].map((n) => n.textContent)
    expect(nomi).toEqual(['🗂️ Bibite', '🗂️ Distillati'])
    expect(stato.scritture.map((s) => [s.id, s.patch])).toEqual([
      ['m1', { sort_order: 1 }],
      ['m2', { sort_order: 0 }],
    ])
  })
})

describe('dentro una macro', () => {
  it('a sinistra i prodotti, a destra le voci, tutti in ordine alfabetico', async () => {
    const user = userEvent.setup()
    monta()
    await apri(user, 'Distillati')
    const col = colonne()
    expect(col).toHaveLength(2)
    expect(col[0]).toHaveTextContent('Prodotti del magazzino')
    expect(col[1]).toHaveTextContent('Voci del menù')
    expect(nomiIn(col[0])).toEqual(['Agave', 'Gin', 'Schweppes'])
    expect(nomiIn(col[1])).toEqual(['Negroni', 'Spritz'])
  })

  it('mostra la quota che ognuno ha già qui', async () => {
    const user = userEvent.setup()
    monta()
    await apri(user, 'Distillati')
    expect(screen.getByRole('spinbutton', { name: 'Gin: quota in Distillati' })).toHaveValue(100)
    expect(screen.getByRole('spinbutton', { name: 'Agave: quota in Distillati' })).toHaveValue(null)
  })

  it('si scrive una percentuale, si esce dalla casella, e resta lì subito', async () => {
    const user = userEvent.setup()
    monta()
    await apri(user, 'Distillati')
    const casella = screen.getByRole('spinbutton', { name: 'Spritz: quota in Distillati' })
    await user.type(casella, '80')
    // Finché si scrive non si salva: «8» prima di «80» sarebbe una quota
    // sbagliata scritta per un istante.
    expect(pesiScritti()).toHaveLength(0)
    await user.tab()
    expect(pesiScritti()).toEqual([
      expect.objectContaining({ id: 'm1', data: { pesi_voci: { spritz: 80 } }, opts: { merge: true } }),
    ])
    expect(casella).toHaveValue(80)
    // E il riassunto nell'elenco si aggiorna senza rileggere niente: la
    // scrittura è ancora appesa.
    expect(screen.getByRole('button', { name: /Distillati/ })).toHaveTextContent('1 prodotti · 2 voci')
  })

  it('con Invio si salva come uscendo', async () => {
    const user = userEvent.setup()
    monta()
    await apri(user, 'Distillati')
    await user.type(screen.getByRole('spinbutton', { name: 'Agave: quota in Distillati' }), '50{Enter}')
    expect(pesiScritti()[0].data).toEqual({ pesi_prodotti: { agave: 50 } })
  })

  // La Schweppes sta già al 40% fra le bibite: qui può prendere al più il
  // 60%, e lo si legge accanto al nome. Un 100 scritto per sbaglio si
  // riporta al tetto, così la somma non passa cento.
  it('dice quanto è già altrove, e non lascia passare cento', async () => {
    const user = userEvent.setup()
    monta()
    await apri(user, 'Distillati')
    const casella = screen.getByRole('spinbutton', { name: 'Schweppes: quota in Distillati' })
    const riga = casella.closest('label')
    expect(within(riga).getByText('40% altrove')).toBeInTheDocument()
    await user.type(casella, '100')
    await user.tab()
    expect(pesiScritti()[0].data).toEqual({ pesi_prodotti: { schweppes: 60 } })
    expect(casella).toHaveValue(60)
  })

  it('svuotando la casella la quota si toglie', async () => {
    const user = userEvent.setup()
    monta()
    await apri(user, 'Distillati')
    await user.clear(screen.getByRole('spinbutton', { name: 'Gin: quota in Distillati' }))
    await user.tab()
    expect(pesiScritti()[0].data).toEqual({ pesi_prodotti: { gin: { __delete: true } } })
    expect(screen.getByRole('button', { name: /Distillati/ })).toHaveTextContent('0 prodotti · 1 voci')
  })

  it('la ricerca restringe la colonna, e «solo senza macro» toglie chi è già a posto', async () => {
    const user = userEvent.setup()
    monta()
    await apri(user, 'Distillati')
    const cerca = screen.getByRole('textbox', { name: 'Cerca fra i prodotti' })
    await user.type(cerca, 'ga')
    expect(nomiIn(colonne()[0])).toEqual(['Agave'])
    await user.clear(cerca)
    expect(nomiIn(colonne()[0])).toEqual(['Agave', 'Gin', 'Schweppes'])
    await user.click(within(colonne()[0]).getByRole('checkbox'))
    // Gin è al 100% qui e la Schweppes al 40% altrove: resta solo l'Agave.
    expect(nomiIn(colonne()[0])).toEqual(['Agave'])
    // E a destra, dove tutto è già attribuito, lo si dice invece di
    // lasciare una colonna vuota.
    await user.click(within(colonne()[1]).getByRole('checkbox'))
    expect(nomiIn(colonne()[1])).toEqual(['Spritz'])
    await user.type(screen.getByRole('textbox', { name: 'Cerca fra le voci' }), 'negroni')
    expect(within(colonne()[1]).getByText('Niente da mostrare.')).toBeInTheDocument()
  })
})
