// @vitest-environment happy-dom
'use strict'

// ── IL PANNELLO DEI CAMPI DI STAMPA (REQ-STAMPA-014, REQ-STAMPA-011) ──
//
// «Servono delle impostazioni per cambiare/modificare/aggiungere/
// eliminare i campi dello scontrino […] La stessa cosa per la comanda»
// (l'utente, 20/08). Qui si prova il pannello: che mostri i campi che una
// stampa ha davvero, che non offra di spegnere i prodotti, e che quello
// che si tocca finisca nelle impostazioni DEL LOCALE.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const anteprima = vi.fn(() => Promise.resolve())
vi.mock('../../src/lib/printer.js', () => ({ printAnteprima: (q) => anteprima(q) }))

import CampiStampa, { LogoStampe } from '../../src/components/CampiStampa.jsx'
import { CHIAVE_LOGO } from '../../src/lib/campiStampa.js'

const salva = vi.fn()
beforeEach(() => {
  salva.mockClear()
  anteprima.mockClear()
})

const pannello = (quale, settings = {}) =>
  render(<CampiStampa quale={quale} settings={settings} onSave={salva} />)

describe('cosa si può togliere dallo scontrino', () => {
  it('gli interruttori sono quelli dei campi che lo scontrino ha davvero', () => {
    pannello('scontrino')
    for (const campo of ['Numero dello scontrino e data', 'Come è stato pagato', 'IVA e imponibile']) {
      expect(screen.getByLabelText(campo)).toBeInTheDocument()
    }
  })

  // «Sicuramente deve andarci la lista dei prodotti, quella è fissa»: non
  // c'è un interruttore da spegnere per sbaglio, e la schermata lo dice.
  it('la lista dei prodotti e il totale non sono fra le scelte', () => {
    pannello('scontrino')
    expect(screen.queryByLabelText(/prodotti|righe|totale/i)).toBeNull()
    expect(screen.getByText(/prodotti e il totale ci sono sempre/i)).toBeInTheDocument()
  })

  it('di suo è tutto acceso: è la carta di oggi', () => {
    pannello('scontrino')
    expect(screen.getByLabelText('Chi stampa lo scontrino')).toBeChecked()
    // Tranne la riga di saluto, che oggi non c'è.
    expect(screen.getByLabelText('Riga di saluto')).not.toBeChecked()
  })

  it('spegnere un campo lo scrive nelle impostazioni del locale', async () => {
    const user = userEvent.setup()
    pannello('scontrino')
    await user.click(screen.getByLabelText('Chi stampa lo scontrino'))
    expect(salva).toHaveBeenCalledWith({
      stampa_scontrino: { campi: { operatore: false } },
    })
  })

  // Le scelte già prese non si perdono quando se ne fa un'altra: si
  // riscrive l'oggetto intero, non mezzo.
  it('una scelta nuova non cancella quelle di prima', async () => {
    const user = userEvent.setup()
    pannello('scontrino', {
      stampa_scontrino: { campi: { operatore: false }, testi: { riga_cortesia: 'Ciao' } },
    })
    await user.click(screen.getByLabelText('Codice lotteria'))
    expect(salva).toHaveBeenCalledWith({
      stampa_scontrino: {
        campi: { operatore: false, lotteria: false },
        testi: { riga_cortesia: 'Ciao' },
      },
    })
  })
})

describe('i campi che sono puro testo', () => {
  it('la casella compare solo col campo acceso', async () => {
    const user = userEvent.setup()
    const { rerender } = pannello('scontrino')
    expect(screen.queryByLabelText('Cosa c’è scritto')).toBeNull()
    await user.click(screen.getByLabelText('Riga di saluto'))
    rerender(
      <CampiStampa
        quale="scontrino"
        settings={{ stampa_scontrino: { campi: { riga_cortesia: true } } }}
        onSave={salva}
      />
    )
    expect(screen.getByLabelText('Cosa c’è scritto')).toBeInTheDocument()
  })

  // LA FASCIA NON HA PIÙ UNA CASELLA (BUG-089): dice quale ticket è
  // («COMANDA 2 - ORDINE 28») e quel contenuto viene dai dati. Le righe
  // di servizio, che sono etichette e non fatti, le parole ce l'hanno
  // ancora.
  it('la fascia si accende e si spegne, ma non si scrive', () => {
    pannello('comanda')
    expect(screen.getByLabelText('Fascia nera in cima')).toBeChecked()
    expect(screen.queryByLabelText('Cosa c’è scritto nella fascia')).toBeNull()
    const casella = screen.getByLabelText('Come si chiama il reparto')
    fireEvent.change(casella, { target: { value: 'CUCINA' } })
    expect(salva).toHaveBeenLastCalledWith({ stampa_comanda: { testi: { reparto: 'CUCINA' } } })
  })
})

describe('la prova di stampa', () => {
  // Scegliere i campi senza vedere la carta è scegliere alla cieca: il
  // tasto stampa un conto finto passando dalle stesse funzioni della
  // serata.
  it('stampa un facsimile della stampa che si sta sistemando', async () => {
    const user = userEvent.setup()
    pannello('comanda')
    await user.click(screen.getByRole('button', { name: /Prova di stampa/ }))
    expect(anteprima).toHaveBeenCalledWith('comanda')
    expect(await screen.findByText(/Prova inviata/)).toBeInTheDocument()
  })

  it('se la stampante non risponde lo dice, senza dare la colpa a chi legge', async () => {
    const user = userEvent.setup()
    anteprima.mockRejectedValueOnce(new Error('Stampante spenta'))
    pannello('scontrino')
    await user.click(screen.getByRole('button', { name: /Prova di stampa/ }))
    expect(await screen.findByText('Stampante spenta')).toBeInTheDocument()
  })
})

// ── IL LOGO (REQ-STAMPA-011) ─────────────────────────────────────────
describe('il logo, stampa per stampa', () => {
  const logo = (settings = {}, role = 'admin') =>
    render(<LogoStampe settings={settings} onSave={salva} role={role} />)

  it('di suo esce dove è sempre uscito, e non sulla comanda', () => {
    logo()
    expect(screen.getByLabelText('Scontrino')).toBeChecked()
    expect(screen.getByLabelText('Preconto')).toBeChecked()
    expect(screen.getByLabelText('Comanda')).not.toBeChecked()
    expect(screen.getByLabelText('Chiusura di cassa')).not.toBeChecked()
  })

  it('acceso sulla comanda, si scrive nelle impostazioni', async () => {
    const user = userEvent.setup()
    logo()
    await user.click(screen.getByLabelText('Comanda'))
    expect(salva).toHaveBeenCalledWith({ [CHIAVE_LOGO]: { comanda: true } })
  })

  // L'immagine è l'identità del locale, non una preferenza del terminale:
  // la cambia solo chi ha l'accesso da amministratore.
  it('l’immagine la carica solo l’admin', () => {
    const { unmount } = logo({}, 'bartender')
    expect(screen.queryByRole('button', { name: /Carica/ })).toBeNull()
    expect(screen.getByText(/accesso da amministratore/)).toBeInTheDocument()
    unmount()
    logo({}, 'admin')
    expect(screen.getByRole('button', { name: /Carica/ })).toBeInTheDocument()
  })

  it('si può tornare al logo di serie', async () => {
    const user = userEvent.setup()
    logo({ [CHIAVE_LOGO]: { immagine: 'data:image/png;base64,AAA' } })
    await user.click(screen.getByRole('button', { name: /Torna a quello di serie/ }))
    expect(salva).toHaveBeenCalledWith({ [CHIAVE_LOGO]: { immagine: null } })
  })
})

// ── SI DICE SUBITO, NON SULLA CARTA ──────────────────────────────────
//
// Una foto scura, ridotta in bianco e nero, esce come un rettangolo nero
// in cima a ogni scontrino della serata. Il pannello se ne accorge al
// caricamento e non la salva.
describe('un’immagine che non va bene', () => {
  // I punti che la testina troverebbe sull'immagine ridotta: quattro
  // numeri per punto (rosso, verde, blu, trasparenza).
  const preparaTela = (punti) => {
    // happy-dom non disegna: il canvas c'è ma non ha un contesto. Qui
    // serve solo che risponda con i punti che deciderebbe la testina.
    globalThis.HTMLCanvasElement.prototype.getContext = () => ({
      fillStyle: '',
      fillRect: () => {},
      drawImage: () => {},
      getImageData: () => ({ data: Uint8ClampedArray.from(punti) }),
    })
    globalThis.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,RIDOTTA'
    globalThis.Image = class {
      constructor() {
        this.width = 600
        this.height = 300
      }
      set src(_v) {
        queueMicrotask(() => this.onload?.())
      }
    }
    globalThis.FileReader = class {
      readAsDataURL() {
        this.result = 'data:image/png;base64,ORIGINALE'
        queueMicrotask(() => this.onload?.())
      }
    }
  }

  const carica = () => {
    const input = document.getElementById('logo-file')
    fireEvent.change(input, { target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] } })
  }

  it('una foto scura si rifiuta, e il logo resta quello di prima', async () => {
    preparaTela([0, 0, 0, 255]) // tutta nera
    render(<LogoStampe settings={{}} onSave={salva} role="admin" />)
    carica()
    expect(await screen.findByText(/rettangolo nero/)).toBeInTheDocument()
    expect(screen.getByText(/rimasto quello di prima/)).toBeInTheDocument()
    expect(salva).not.toHaveBeenCalled()
  })

  it('un logo buono si salva già ridotto alla larghezza della testina', async () => {
    // Un disegno, non una fotografia: metà dei punti scuri.
    preparaTela([0, 0, 0, 255, 255, 255, 255, 255])
    render(<LogoStampe settings={{}} onSave={salva} role="admin" />)
    await act(async () => carica())
    expect(salva).toHaveBeenCalledWith({
      [CHIAVE_LOGO]: { immagine: 'data:image/png;base64,RIDOTTA' },
    })
  })
})
