// @vitest-environment happy-dom
'use strict'

// ── «ALTRE SPESE»: LA LISTA DELLA SPESA CHE DIVENTA UN REGISTRO ──────
//
// Terza sottosezione di Fornitori (REQ-MAG-034). Nasce dal foglio «TO BUY»
// di FORNITORI REC.xlsx — tavoli, sgabelli, divani, una tenda, uno scaffale,
// bicchieri di plastica — con le sue colonne: articolo, quantità, prezzo,
// dove si compra e note.
//
// QUELLO CHE SI SORVEGLIA QUI è la distinzione senza la quale il numero
// sbaglia: quel foglio si chiama «da comprare», e un divano DESIDERATO non
// deve abbassare l'utile di gennaio. E la seconda cosa, che è di tono: nei
// campi non ci sono esempi, perché cosa Flavio metta nelle sue spese ancora
// non lo sappiamo (REQ-CASSA-012) e un suggerimento insegnerebbe a
// scriverci quello che abbiamo immaginato noi.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const SGABELLI = {
  id: 'sp-1',
  name: 'Sgabelli',
  qty: 4,
  unit_cost: 39.9,
  shop: 'Amazon',
  notes: null,
  bought: true,
  bought_at: '2026-01-14',
}
const DIVANO = {
  id: 'sp-2',
  name: 'Divano',
  qty: 1,
  unit_cost: 499,
  shop: 'Vente-Unique',
  notes: null,
  bought: false,
  bought_at: null,
}

const stato = { spese: [] }

vi.mock('../../src/lib/api.js', () => ({
  fetchAltreSpese: vi.fn(async () => stato.spese),
  creaAltraSpesa: vi.fn(async (dati) => ({ id: 'sp-nuova', notes: null, ...dati })),
  aggiornaAltraSpesa: vi.fn(async (id, patch) => ({
    ...stato.spese.find((s) => s.id === id),
    ...patch,
  })),
  eliminaAltraSpesa: vi.fn(async () => {}),
}))

import AltreSpesePanel from '../../src/components/AltreSpesePanel.jsx'
import {
  creaAltraSpesa as creata,
  aggiornaAltraSpesa as aggiornata,
  eliminaAltraSpesa as eliminata,
} from '../../src/lib/api.js'

beforeEach(() => {
  vi.clearAllMocks()
  stato.spese = [SGABELLI, DIVANO]
  globalThis.confirm = vi.fn(() => true)
})

describe('comprata o solo desiderata, e si vede', () => {
  it('ogni voce dice a quale delle due appartiene', async () => {
    render(<AltreSpesePanel />)
    expect(await screen.findByText('Sgabelli')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Segna «Sgabelli» come da comprare/ })).toHaveTextContent('comprata')
    expect(screen.getByRole('button', { name: /Segna «Divano» come comprata/ })).toHaveTextContent('da comprare')
  })

  // È la riga che protegge l'utile di gennaio: nel totale di quello che è
  // uscito ci sono i 159,60 degli sgabelli, non i 499 del divano.
  it('nel totale di quello che è uscito c’è solo il comprato', async () => {
    render(<AltreSpesePanel />)
    const comprato = await screen.findByText(/Comprato/)
    expect(comprato).toHaveTextContent('159,60')
    expect(comprato).not.toHaveTextContent('499')
    // Il costo della lista si legge, ma staccato e detto per quello che è.
    expect(screen.getByText(/Ancora da comprare/)).toHaveTextContent('499,00')
  })

  it('si segna comprata con un tocco, e la data la mette il gesto', async () => {
    const user = userEvent.setup()
    render(<AltreSpesePanel />)
    await user.click(await screen.findByRole('button', { name: /Segna «Divano» come comprata/ }))

    expect(aggiornata).toHaveBeenCalledTimes(1)
    const [id, patch] = aggiornata.mock.calls[0]
    expect(id).toBe('sp-2')
    expect(patch.bought).toBe(true)
    // Senza data non peserebbe su nessun mese: si mette quella di oggi, che è
    // quando il gesto sta succedendo.
    expect(patch.bought_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('e il cambio si vede subito, senza aspettare la scrittura', async () => {
    const user = userEvent.setup()
    render(<AltreSpesePanel />)
    await user.click(await screen.findByRole('button', { name: /Segna «Divano» come comprata/ }))
    expect(await screen.findByRole('button', { name: /Segna «Divano» come da comprare/ })).toBeInTheDocument()
  })

  it('il filtro tiene solo quello che resta da comprare', async () => {
    const user = userEvent.setup()
    render(<AltreSpesePanel />)
    await user.click(await screen.findByRole('button', { name: /Solo da comprare/ }))
    expect(screen.getByText('Divano')).toBeInTheDocument()
    expect(screen.queryByText('Sgabelli')).toBeNull()
  })
})

describe('il buco: comprata e senza prezzo', () => {
  // Una voce segnata comprata ma non prezzata pesa zero sul mese, e nessuno
  // se ne accorge finché non si confrontano i totali. Sul desiderio invece
  // il prezzo a zero è la normalità del foglio, e segnalarlo insegnerebbe a
  // ignorare il segnale.
  it('si vede sulla riga e si conta in testa; il desiderio non prezzato no', async () => {
    stato.spese = [
      { ...SGABELLI, id: 'sp-3', name: 'Tenda', unit_cost: 0 },
      { ...DIVANO, unit_cost: 0 },
    ]
    render(<AltreSpesePanel />)
    expect(await screen.findByText('senza prezzo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Senza prezzo \(1\)/ })).toBeInTheDocument()
  })

  it('senza nessuna voce così il chip non c’è', async () => {
    render(<AltreSpesePanel />)
    await screen.findByText('Sgabelli')
    expect(screen.queryByRole('button', { name: /Senza prezzo/ })).toBeNull()
  })
})

describe('scrivere una spesa', () => {
  it('i campi sono le colonne del foglio, e la riga compare subito', async () => {
    const user = userEvent.setup()
    render(<AltreSpesePanel />)
    await user.click(await screen.findByRole('button', { name: /Nuova spesa/ }))

    await user.type(screen.getByLabelText(/Articolo/), 'Tenda')
    await user.clear(screen.getByLabelText('Quantità'))
    await user.type(screen.getByLabelText('Quantità'), '2')
    await user.type(screen.getByLabelText('Prezzo €'), '120')
    await user.type(screen.getByLabelText('Dove si compra'), 'Bricoware')
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    expect(creata).toHaveBeenCalledTimes(1)
    expect(creata.mock.calls[0][0]).toMatchObject({
      name: 'Tenda',
      qty: 2,
      unit_cost: 120,
      shop: 'Bricoware',
      bought: false,
    })
    expect(await screen.findByText('Tenda')).toBeInTheDocument()
  })

  // ⚠️ NIENTE ESEMPI NEI CAMPI (REQ-CASSA-012): «affitto, SIAE,
  // commercialista, utenze» era una lista inventata da chi scriveva quella
  // voce, non una frase di Flavio. Un segnaposto qui insegnerebbe a
  // scriverci quello che ci siamo immaginati.
  it('nessun campo suggerisce cosa scriverci', async () => {
    const user = userEvent.setup()
    render(<AltreSpesePanel />)
    await user.click(await screen.findByRole('button', { name: /Nuova spesa/ }))
    for (const campo of ['Articolo *', 'Dove si compra', 'Note']) {
      expect(screen.getByLabelText(campo)).not.toHaveAttribute('placeholder')
    }
  })

  // La data serve solo a quello che è uscito davvero: su un promemoria non
  // c'è niente da datare.
  it('la data compare solo quando si segna già comprata', async () => {
    const user = userEvent.setup()
    render(<AltreSpesePanel />)
    await user.click(await screen.findByRole('button', { name: /Nuova spesa/ }))
    expect(screen.queryByLabelText(/Data dell/)).toBeNull()
    await user.click(screen.getByLabelText('Già comprata'))
    expect(screen.getByLabelText(/Data dell/)).toBeInTheDocument()
  })

  // Una voce del foglio nasce senza prezzo e lo prende il giorno che la si
  // compra: senza la modifica quel numero non entrerebbe mai.
  it('una voce si riapre e si corregge', async () => {
    const user = userEvent.setup()
    render(<AltreSpesePanel />)
    await user.click(await screen.findByRole('button', { name: /Modifica «Divano»/ }))
    const prezzo = screen.getByLabelText('Prezzo €')
    await user.clear(prezzo)
    await user.type(prezzo, '450')
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    expect(aggiornata).toHaveBeenCalledTimes(1)
    expect(aggiornata.mock.calls[0][0]).toBe('sp-2')
    expect(aggiornata.mock.calls[0][1]).toMatchObject({ unit_cost: 450, name: 'Divano' })
  })

  it('una voce si elimina, e sparisce nell’istante del gesto', async () => {
    const user = userEvent.setup()
    render(<AltreSpesePanel />)
    await user.click(await screen.findByRole('button', { name: /Elimina «Divano»/ }))
    expect(eliminata).toHaveBeenCalledWith('sp-2')
    await waitFor(() => expect(screen.queryByText('Divano')).toBeNull())
  })
})

describe('quello che va scritto qui, e quello che no', () => {
  // ⚠️ LA DECISIONE DI REQ-CASSA-012: la merce arriva dalle fatture e si
  // conta da sola; se la si riscrive qui la stessa uscita viene contata due
  // volte e il netto del mese sbaglia in silenzio.
  it('la schermata dice che la merce dei fornitori non va qui', async () => {
    render(<AltreSpesePanel />)
    const spiega = await screen.findByText(/non entra in magazzino/)
    expect(spiega).toHaveTextContent(/si conta dalle fatture/)
    expect(spiega).toHaveTextContent(/due volte/)
  })
})

describe('l’altro modo di sparire dai conti', () => {
  // Da questa schermata non nasce: segnando comprata la data si mette da
  // sola. Nasce da quello che arriva da fuori — una riga importata dal
  // foglio — e senza data non ha un mese su cui pesare, quindi resterebbe
  // fuori dal riepilogo senza dire niente.
  it('una spesa comprata senza data lo dice sulla riga', async () => {
    stato.spese = [{ ...SGABELLI, bought_at: null }]
    render(<AltreSpesePanel />)
    expect(await screen.findByText('senza data')).toBeInTheDocument()
  })
})
