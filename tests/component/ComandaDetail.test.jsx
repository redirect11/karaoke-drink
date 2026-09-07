// @vitest-environment happy-dom
'use strict'

// IL DETTAGLIO DI UNA COMANDA.
//
// Il dettaglio del CONTO risponde alla domanda della cassa: quanto fa, chi
// paga, cosa aggiungo. Questa risponde a quella del banco: cosa devo fare
// adesso, per chi, e da quanto sta lì. Le cose che si provano qui sono
// quelle che al banco costano un drink:
//   · si vedono le righe di QUESTA comanda, con le note che dicono come si
//     prepara, e il totale è il suo — non quello del conto;
//   · i passi portano l'ora: al banco quei minuti sono la differenza fra
//     «siamo indietro» e «questo ticket è stato dimenticato»;
//   · il tasto grande fa avanzare QUELLA comanda e si vede subito, senza
//     aspettare il server;
//   · al CONTO si risale sempre, perché è lì che si incassa e si aggiunge.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { MemoryRouter } from '../helpers/router.jsx'
import '@testing-library/jest-dom/vitest'

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async (orig) => {
  const vera = await orig()
  return { ...vera, useNavigate: () => navigateSpy }
})

// Chi guarda: il ruolo decide se questa pagina è sua.
let ruolo = 'bartender'
vi.mock('../../src/lib/firebaseClient.js', () => ({
  auth: { currentUser: { uid: 'u1', email: 'marta@bar.it' } },
  db: {},
}))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb({ uid: 'u1', getIdTokenResult: async () => ({ claims: { role: ruolo } }) })
    return () => {}
  },
}))

// L'ordine come lo manda il server: la sottoscrizione lo consegna subito.
let ordine = null
// Le impostazioni del locale: gli stati del servizio accendono i passi — e
// con essi la divisione della comanda.
let impostazioni = { workflow_enabled: true }
// La sottoscrizione resta in mano al test: dopo un gesto si può far
// arrivare lo snapshot successivo, come farebbe il server.
let mandaOrdine = null
vi.mock('../../src/lib/api.js', () => ({
  subscribeOrder: (_id, cb) => {
    mandaOrdine = cb
    cb(ordine)
    return () => {}
  },
  subscribeSettings: (cb) => {
    cb({ ...impostazioni })
    return () => {}
  },
  settingsIniziali: () => ({ ...impostazioni }),
  advanceComanda: vi.fn(() => Promise.resolve()),
  preparazioneParziale: vi.fn(() => Promise.resolve()),
  setOrderServiceMode: vi.fn(() => Promise.resolve({})),
}))
vi.mock('../../src/lib/printer.js', () => ({ printComanda: vi.fn(async () => {}) }))
vi.mock('../../src/lib/toast.js', () => ({ showToast: vi.fn() }))

import ComandaPage from '../../src/pages/ComandaPage.jsx'
import {
  advanceComanda,
  preparazioneParziale,
  setOrderServiceMode,
} from '../../src/lib/api.js'
import { printComanda } from '../../src/lib/printer.js'

const ORA = '2026-08-18T21:00:00.000Z'
const POI = '2026-08-18T21:06:00.000Z'

const conto = (over = {}) => ({
  id: 'o41',
  daily_number: 41,
  status: 'aperto',
  payment_status: 'non_richiesto',
  table_label: '4',
  customer_name: 'Ciro',
  created_at: ORA,
  note: 'Allergia alle noci',
  service_mode: 'tavolo',
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: 'ricevuto',
      created_at: ORA,
      status_times: { ricevuto: ORA },
      items: [{ drink_id: 'gin', name: 'Gin Tonic', qty: 2, unit_price: 8 }],
    },
    {
      id: 'c2',
      seq: 2,
      status: 'in_preparazione',
      created_at: ORA,
      status_times: { ricevuto: ORA, in_preparazione: POI },
      items: [
        { drink_id: 'negroni', name: 'Negroni', qty: 3, unit_price: 9, note: 'senza ghiaccio' },
      ],
    },
  ],
  ...over,
})

const albero = (comandaId) => (
  <MemoryRouter initialEntries={[`/ordine/o41/comanda/${comandaId}`]}>
    <Routes>
      <Route path="/ordine/:id/comanda/:comandaId" element={<ComandaPage />} />
      <Route path="/ordine/:id" element={<div>schermata del conto</div>} />
    </Routes>
  </MemoryRouter>
)

function monta(comandaId = 'c2') {
  return render(albero(comandaId))
}

beforeEach(() => {
  vi.clearAllMocks()
  ruolo = 'bartender'
  impostazioni = { workflow_enabled: true, service_mode: 'entrambi' }
  ordine = conto()
})

describe('il dettaglio di una comanda', () => {
  it('dice che comanda è, dove va e cosa c’è da fare', async () => {
    monta()
    await screen.findByText(/Cosa c’è da fare/)

    // il numero del conto e quello del ticket, che è come si chiama al banco
    expect(screen.getByText('· comanda 2')).toBeInTheDocument()
    expect(screen.getByText('Tavolo 4 · Ciro')).toBeInTheDocument()

    // le righe di QUESTA comanda, con la nota che dice come si prepara
    const righe = document.querySelector('.comanda-det-righe')
    expect(within(righe).getByText(/Negroni/)).toBeInTheDocument()
    expect(within(righe).getByText(/senza ghiaccio/)).toBeInTheDocument()
    expect(within(righe).queryByText(/Gin Tonic/)).not.toBeInTheDocument()

    // e il totale è il SUO — tre negroni — non quello del conto intero,
    // che ha dentro anche i due gin tonic dell'altra comanda
    const totale = within(righe.querySelector('.comanda-det-totale'))
    expect(totale.getByText('27,00 €')).toBeInTheDocument()

    // la nota del conto vale anche per il pezzo che si sta preparando
    expect(within(righe).getByText(/Allergia alle noci/)).toBeInTheDocument()
  })

  it('i passi portano l’ora di quando sono stati toccati', async () => {
    monta()
    await screen.findByText(/Cosa c’è da fare/)
    const passi = [...document.querySelectorAll('.comanda-det-passi .step')]
    expect(passi.length).toBe(4)
    // «in preparazione» è quello di adesso, e i due toccati hanno l'ora
    expect(passi[0]).toHaveClass('done')
    expect(passi[1]).toHaveClass('active')
    expect(passi[2]).not.toHaveClass('done')
    expect(passi[0].textContent).toMatch(/\d{2}:\d{2}/)
    expect(passi[2].textContent).toMatch(/—/)
  })

  it('il tasto grande fa avanzare QUELLA comanda, e si vede subito', async () => {
    const utente = userEvent.setup()
    monta()
    await screen.findByText(/Cosa c’è da fare/)

    await utente.click(screen.getByRole('button', { name: 'Pronto' }))
    expect(advanceComanda).toHaveBeenCalledWith('o41', 'c2', 'pronto')

    // senza aspettare il server la schermata è già al passo dopo: al banco
    // un gesto che non si vede subito è un gesto che si ripete
    await waitFor(() => expect(screen.getByRole('button', { name: 'Servito' })).toBeInTheDocument())
  })

  it('si può riportare indietro, anche di più di un passo', async () => {
    const utente = userEvent.setup()
    monta()
    await screen.findByText(/Cosa c’è da fare/)
    // «Da fare», non «Ordine ricevuto»: al banco la colonna si chiama
    // così, e due nomi per lo stesso passo fanno chiedere se siano due cose.
    await utente.click(screen.getByRole('button', { name: /Da fare/ }))
    expect(advanceComanda).toHaveBeenCalledWith('o41', 'c2', 'ricevuto')
  })

  // COL SALTO ACCESO «da fare» non esiste: nessuna comanda ci nasce,
  // nessuno guarda quella colonna, e rimandarcene una a mano vuol dire
  // nasconderla dove non la cerca più nessuno.
  it('col salto acceso non si può riportare a «da fare»', async () => {
    impostazioni = { workflow_enabled: true, comande_in_preparazione: true }
    monta('c2') // è in preparazione: senza salto si tornerebbe a «da fare»
    await screen.findByText(/Cosa c’è da fare/)
    expect(screen.queryByRole('button', { name: /↩︎/ })).not.toBeInTheDocument()
  })

  it('e da una comanda pronta si torna al banco, non più indietro', async () => {
    impostazioni = { workflow_enabled: true, comande_in_preparazione: true }
    ordine = conto({
      comande: [
        {
          id: 'c2',
          seq: 2,
          status: 'pronto',
          created_at: ORA,
          status_times: { ricevuto: ORA, in_preparazione: POI, pronto: POI },
          items: [{ drink_id: 'negroni', name: 'Negroni', qty: 1, unit_price: 9 }],
        },
      ],
    })
    monta('c2')
    await screen.findByText(/Cosa c’è da fare/)
    expect(screen.getByRole('button', { name: /In preparazione/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Da fare/ })).not.toBeInTheDocument()
  })

  // ── SERVIZIO O RITIRO, DAL TICKET ────────────────────────────────
  //
  // «Questo se lo porta via» si decide col bicchiere in mano, guardando il
  // ticket: prima bisognava risalire al conto, aprirlo, entrare in «Dati
  // conto» e scorrere fino in fondo. Tre passaggi per un tocco.
  const comandaCon = (status, over = {}) =>
    conto({
      comande: [
        {
          id: 'c2',
          seq: 2,
          status,
          created_at: ORA,
          status_times: { ricevuto: ORA },
          items: [{ drink_id: 'negroni', name: 'Negroni', qty: 2, unit_price: 9 }],
        },
      ],
      ...over,
    })

  it('da una comanda «da fare» si passa a ritiro', async () => {
    const utente = userEvent.setup()
    ordine = comandaCon('ricevuto')
    monta('c2')
    await screen.findByText(/Cosa c’è da fare/)
    await utente.click(screen.getByRole('button', { name: /Ritiro/ }))
    expect(setOrderServiceMode).toHaveBeenCalledWith('o41', 'banco')
  })

  it('e lo dice che vale per TUTTO IL CONTO', async () => {
    // Guardando un ticket uno crede di star marcando quello che ha in
    // mano: il modo sta sul conto, e cambia anche per le altre comande.
    impostazioni = { ...impostazioni, coperto_enabled: true }
    ordine = comandaCon('in_preparazione')
    monta('c2')
    await screen.findByText(/Cosa c’è da fare/)
    expect(screen.getByText(/Vale per tutto il conto/i)).toBeInTheDocument()
    // e cosa succede ai soldi si legge prima di premere
    expect(screen.getByText(/coperto e servizio si azzerano/i)).toBeInTheDocument()
  })

  it('da una comanda PRONTA non si cambia più: il drink è già uscito', async () => {
    ordine = comandaCon('pronto')
    monta('c2')
    await screen.findByText(/Cosa c’è da fare/)
    expect(screen.queryByRole('button', { name: /Ritiro/ })).not.toBeInTheDocument()
  })

  it('col SOLO SERVIZIO non c’è niente da scegliere', async () => {
    impostazioni = { workflow_enabled: true, service_mode: 'tavolo' }
    ordine = comandaCon('ricevuto')
    monta('c2')
    await screen.findByText(/Cosa c’è da fare/)
    expect(screen.queryByRole('button', { name: /Ritiro/ })).not.toBeInTheDocument()
  })

  it('con un acconto si cambia il modo, ma i soldi restano quelli', async () => {
    const utente = userEvent.setup()
    impostazioni = { ...impostazioni, coperto_enabled: true }
    ordine = comandaCon('ricevuto', {
      payment_status: 'parziale',
      payments: [{ amount: 10, method: 'banco' }],
    })
    monta('c2')
    await screen.findByText(/Cosa c’è da fare/)
    expect(screen.getByText(/coperto e servizio restano quelli/i)).toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: /Ritiro/ }))
    expect(setOrderServiceMode).toHaveBeenCalledWith('o41', 'banco')
  })

  it('DA QUI SI RISALE AL CONTO: è lì che si incassa e si aggiunge', async () => {
    const utente = userEvent.setup()
    monta()
    await screen.findByText(/Cosa c’è da fare/)
    await utente.click(screen.getByRole('button', { name: /Apri il conto #41/ }))
    expect(navigateSpy).toHaveBeenCalledWith('/ordine/o41')
  })

  it('e si torna alla coda da dove si era arrivati', async () => {
    const utente = userEvent.setup()
    monta()
    await screen.findByText(/Cosa c’è da fare/)
    await utente.click(screen.getByRole('button', { name: /Torna alla coda/ }))
    expect(navigateSpy).toHaveBeenCalledWith('/bar')
  })

  it('la comanda si ristampa: la copia al banco si perde, si strappa, si bagna', async () => {
    const utente = userEvent.setup()
    monta()
    await screen.findByText(/Cosa c’è da fare/)
    await utente.click(screen.getByRole('button', { name: /Ristampa/ }))
    expect(printComanda).toHaveBeenCalledTimes(1)
    expect(printComanda.mock.calls[0][1].id).toBe('c2')
  })

  it('un conto già pagato non ha tasti: non c’è più niente da fare', async () => {
    ordine = conto({ status: 'pagato', payment_status: 'pagato' })
    monta()
    await screen.findByText(/Cosa c’è da fare/)
    expect(screen.queryByRole('button', { name: 'Pronto' })).not.toBeInTheDocument()
    expect(screen.getByText('💶 Pagato')).toBeInTheDocument()
  })

  it('l’acconto si vede anche da qui', async () => {
    // Chi finisce la comanda spesso è quello che poi porta il conto al
    // tavolo: senza dirlo qui, chiede l'intero — ed è successo.
    ordine = conto({ payment_status: 'parziale', payments: [{ amount: 10 }] })
    monta()
    await screen.findByText(/Cosa c’è da fare/)
    expect(screen.getByText('💳 Acconto')).toBeInTheDocument()
  })

  // ── DIVIDERE DA QUI ────────────────────────────────────
  //
  // Preparare tre gin tonic su cinque è una decisione che si prende
  // guardando IL TICKET, non il conto: sta qui perché qui c'è chi la
  // prende. Farlo risalire al conto per dividere quello che ha già davanti
  // sono due schermate indietro per una cosa che riguarda solo questa
  // comanda. La strada è la stessa del conto — dividiComanda +
  // preparazioneParziale — e resta l'unica.
  it('si sceglie quante unità preparare adesso, e parte la stessa strada del conto', async () => {
    const utente = userEvent.setup()
    monta('c1') // due gin tonic, ancora «da fare»: si può dividere
    await screen.findByText(/Cosa c’è da fare/)

    await utente.click(screen.getByRole('button', { name: /Preparazione parziale/ }))
    await utente.click(screen.getByRole('button', { name: 'Uno in più di Gin Tonic' }))
    await utente.click(screen.getByRole('button', { name: 'Preparo questi' }))

    expect(preparazioneParziale).toHaveBeenCalledWith('o41', 'c1', [1])
  })

  // SI DIVIDE FINCHÉ IL DRINK NON È USCITO DAL BANCO: a «da fare» e a «in
  // preparazione». Dividere una comanda già al banco è il caso vero —
  // sto preparando cinque gin tonic, ne faccio uscire tre adesso e due
  // dopo — e le due parti restano tutte e due in preparazione: il lavoro è
  // cominciato su entrambe.
  it('una comanda in preparazione si divide, e le due parti restano al banco', async () => {
    const utente = userEvent.setup()
    ordine = conto({
      comande: [
        {
          id: 'c2',
          seq: 2,
          status: 'in_preparazione',
          created_at: ORA,
          status_times: { ricevuto: ORA, in_preparazione: POI },
          items: [{ drink_id: 'negroni', name: 'Negroni', qty: 5, unit_price: 9 }],
        },
      ],
    })
    monta('c2')
    await screen.findByText(/Cosa c’è da fare/)

    await utente.click(screen.getByRole('button', { name: /Preparazione parziale/ }))
    for (let i = 0; i < 3; i++) {
      await utente.click(screen.getByRole('button', { name: 'Uno in più di Negroni' }))
    }
    await utente.click(screen.getByRole('button', { name: 'Preparo questi' }))
    expect(preparazioneParziale).toHaveBeenCalledWith('o41', 'c2', [3])
  })

  it('ma una comanda PRONTA non si divide più: è roba sul vassoio', async () => {
    ordine = conto({
      comande: [
        {
          id: 'c2',
          seq: 2,
          status: 'pronto',
          created_at: ORA,
          status_times: { ricevuto: ORA, in_preparazione: POI, pronto: POI },
          items: [{ drink_id: 'negroni', name: 'Negroni', qty: 5, unit_price: 9 }],
        },
      ],
    })
    monta('c2')
    await screen.findByText(/Cosa c’è da fare/)
    expect(screen.queryByRole('button', { name: /Preparazione parziale/ })).not.toBeInTheDocument()
  })

  it('col salto acceso si divide la comanda «in preparazione»', async () => {
    const utente = userEvent.setup()
    impostazioni = { workflow_enabled: true, comande_in_preparazione: true }
    ordine = conto({
      comande: [
        {
          id: 'c2',
          seq: 2,
          status: 'in_preparazione',
          created_at: ORA,
          status_times: { ricevuto: ORA, in_preparazione: POI },
          items: [{ drink_id: 'negroni', name: 'Negroni', qty: 3, unit_price: 9 }],
        },
      ],
    })
    monta('c2')
    await screen.findByText(/Cosa c’è da fare/)

    await utente.click(screen.getByRole('button', { name: /Preparazione parziale/ }))
    await utente.click(screen.getByRole('button', { name: 'Uno in più di Negroni' }))
    await utente.click(screen.getByRole('button', { name: 'Preparo questi' }))
    expect(preparazioneParziale).toHaveBeenCalledWith('o41', 'c2', [1])
  })

  it('su un drink solo non si propone: sarebbe tutto o niente', async () => {
    // Cioè il tasto grande, che c'è già.
    ordine = conto({
      comande: [
        {
          id: 'c2',
          seq: 2,
          status: 'in_preparazione',
          created_at: ORA,
          status_times: { ricevuto: ORA, in_preparazione: POI },
          items: [{ drink_id: 'negroni', name: 'Negroni', qty: 1, unit_price: 9 }],
        },
      ],
    })
    monta('c2')
    await screen.findByText(/Cosa c’è da fare/)
    expect(screen.queryByRole('button', { name: /Preparazione parziale/ })).not.toBeInTheDocument()
  })

  it('senza gli stati del servizio non si divide niente', async () => {
    impostazioni = { workflow_enabled: false }
    monta('c1')
    await screen.findByText(/Cosa c’è da fare/)
    expect(screen.queryByRole('button', { name: /Preparazione parziale/ })).not.toBeInTheDocument()
  })

  it('DOPO LA DIVISIONE si va sul pezzo che si è detto di preparare adesso', async () => {
    // Quella comanda non esiste più: al suo posto ne nascono due, e chi ha
    // appena diviso ha in mano la prima. Restare lì vorrebbe dire guardare
    // un ticket che non c'è. Si sostituisce il passo nella storia del
    // browser: «indietro» deve riportare alla coda.
    const utente = userEvent.setup()
    monta('c1')
    await screen.findByText(/Cosa c’è da fare/)
    await utente.click(screen.getByRole('button', { name: /Preparazione parziale/ }))
    await utente.click(screen.getByRole('button', { name: 'Uno in più di Gin Tonic' }))
    await utente.click(screen.getByRole('button', { name: 'Preparo questi' }))

    // il server risponde: la vecchia è annullata, e ne sono nate due
    ordine = conto({
      comande: [
        {
          id: 'c1',
          seq: 1,
          status: 'annullato',
          annullata_per: 'divisione',
          divisa_in: ['c3', 'c4'],
          items: [{ drink_id: 'gin', name: 'Gin Tonic', qty: 2, unit_price: 8 }],
        },
        {
          id: 'c3',
          seq: 3,
          status: 'in_preparazione',
          divisa_da: 'c1',
          items: [{ drink_id: 'gin', name: 'Gin Tonic', qty: 1, unit_price: 8 }],
        },
        {
          id: 'c4',
          seq: 4,
          status: 'ricevuto',
          divisa_da: 'c1',
          items: [{ drink_id: 'gin', name: 'Gin Tonic', qty: 1, unit_price: 8 }],
        },
      ],
    })
    act(() => mandaOrdine(ordine))
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith('/ordine/o41/comanda/c3', { replace: true })
    )
  })

  it('chi non gestisce finisce sul conto, non davanti a un «non puoi»', async () => {
    ruolo = 'staff'
    monta()
    expect(await screen.findByText('schermata del conto')).toBeInTheDocument()
  })

  it('comanda sparita (divisa, conto rifatto): si va dove la risposta c’è', async () => {
    monta('c9')
    expect(await screen.findByText(/Questa comanda non c’è più/)).toBeInTheDocument()
  })
})
