// @vitest-environment happy-dom
'use strict'

// LA SEZIONE «FORNITORI» (REQ-NAV-001). Chiesta dall'utente il 26/08/2026:
// anagrafica, ordini e scadenzario stavano nel magazzino, che però risponde
// a «cosa ho sullo scaffale»; queste tre rispondono a «con chi lavoro e
// quanto gli devo». Lo Scadenzario resta una funzione premium
// (REQ-LIC-001): dove il modulo non lavora, la voce non c'è — e la sezione
// non resta né vuota né monca, perché le altre due ci sono sempre.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { useEffect, useState } from 'react'

// Ogni pannello ha il suo giro: qui basta sapere che la sottosezione giusta
// monta il pannello giusto.
vi.mock('../../src/components/InventoryManager.jsx', () => ({
  FornitoriPanel: () => <div>PANNELLO ANAGRAFICA</div>,
  default: () => <div>MAGAZZINO</div>,
}))
// DA REQ-MAG-038 IL PANNELLO È LO STESSO PER DUE SOTTOSEZIONI: dice quale
// mostra con `vista`, così qui si vede che la voce toccata apre la schermata
// giusta e non solo «il pannello degli ordini».
vi.mock('../../src/components/PurchaseOrdersPanel.jsx', () => ({
  default: ({ vista }) => <div>PANNELLO ORDINI {vista}</div>,
}))
vi.mock('../../src/components/SupplierInvoicesPanel.jsx', () => ({
  default: () => <div>PANNELLO SCADENZARIO</div>,
}))
vi.mock('../../src/components/AltreSpesePanel.jsx', () => ({
  default: () => <div>PANNELLO ALTRE SPESE</div>,
}))
vi.mock('../../src/components/RiepilogoFornitoriPanel.jsx', () => ({
  default: () => <div>PANNELLO RIEPILOGO</div>,
}))

// Le impostazioni del locale: di partenza quelle vere di questa
// installazione (lo scadenzario è incluso, vedi lib/licenza.js).
const stato = { impostazioni: {}, avvisaImpostazioni: null }

vi.mock('../../src/lib/api.js', () => ({
  subscribeSettings: vi.fn((cb) => {
    // La callback si tiene: le impostazioni cambiano anche a schermata
    // aperta, ed è proprio il caso che le prove premium devono rifare.
    stato.avvisaImpostazioni = cb
    cb(stato.impostazioni)
    return () => {}
  }),
  settingsIniziali: () => stato.impostazioni,
}))

import FornitoriTab from '../../src/components/FornitoriTab.jsx'
import { subscribeSottosezioni } from '../../src/lib/sottosezioni.js'

// Le sottosezioni stanno nel menu a scomparsa, sotto la pagina aperta: qui
// si rifà quel pezzetto di menu, come nelle prove del magazzino.
function BarraSezioni() {
  const [sotto, setSotto] = useState({ voci: [], attiva: null, scegli: null })
  useEffect(() => subscribeSottosezioni(setSotto), [])
  return (
    <div>
      {(sotto.voci || []).map((v) => (
        <button key={v.id} onClick={() => sotto.scegli?.(v.id)}>
          {v.icona} {v.label}
        </button>
      ))}
    </div>
  )
}

const mostra = () =>
  render(
    <>
      <FornitoriTab />
      <BarraSezioni />
    </>
  )

beforeEach(() => {
  vi.clearAllMocks()
  stato.impostazioni = {}
})

// LE SOTTOSEZIONI SONO DIVENTATE CINQUE il 27/08/2026 (REQ-MAG-034): «Altre
// spese» e «Riepilogo» sono gli ultimi due pezzi di REQ-MAG-025, e stanno
// qui perché i soldi che escono si guardano dove si registrano. Non sono
// premium: l'elenco filtrato deve continuare a comportarsi allo stesso modo.
describe('le sottosezioni di Fornitori', () => {
  it('si apre sull’anagrafica: è il posto da cui si parte', () => {
    mostra()
    expect(screen.getByText('PANNELLO ANAGRAFICA')).toBeInTheDocument()
    expect(screen.queryByText(/PANNELLO ORDINI/)).toBeNull()
  })

  it('ci sono tutte, e ognuna apre il suo pannello', async () => {
    const user = userEvent.setup()
    mostra()
    for (const voce of [
      'Gestione fornitori',
      'Nuovo ordine',
      'Lista ordini',
      'Scadenzario',
      'Altre spese',
      'Riepilogo',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(voce) })).toBeInTheDocument()
    }
    // LE DUE VOCI SONO DUE SCHERMATE (REQ-MAG-038): comporre un ordine e
    // guardare quelli già fatti sono lavori diversi, e prima stavano nella
    // stessa pagina uno sotto l'altro.
    await user.click(screen.getByRole('button', { name: /Nuovo ordine/ }))
    expect(screen.getByText('PANNELLO ORDINI nuovo')).toBeInTheDocument()
    expect(screen.queryByText('PANNELLO ANAGRAFICA')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Lista ordini/ }))
    expect(screen.getByText('PANNELLO ORDINI lista')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Scadenzario/ }))
    expect(screen.getByText('PANNELLO SCADENZARIO')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Altre spese/ }))
    expect(screen.getByText('PANNELLO ALTRE SPESE')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Riepilogo/ }))
    expect(screen.getByText('PANNELLO RIEPILOGO')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Gestione fornitori/ }))
    expect(screen.getByText('PANNELLO ANAGRAFICA')).toBeInTheDocument()
  })

  // Non sono premium e non se ne è inventato un modulo: le altre spese si
  // scrivono a mano, e il riepilogo mette insieme quello che c'è — con lo
  // scadenzario spento la colonna della merce resta a zero, che è la verità
  // di quel locale e non un pezzo mancante.
  it('le due voci nuove restano anche con lo scadenzario spento', async () => {
    stato.impostazioni = { modulo_scadenzario_enabled: false }
    mostra()
    expect(screen.getByRole('button', { name: /Altre spese/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Riepilogo/ })).toBeInTheDocument()
  })
})

describe('lo scadenzario è una funzione premium (REQ-LIC-001)', () => {
  it('spento non c’è, e la sezione resta in piedi con le altre due', async () => {
    stato.impostazioni = { modulo_scadenzario_enabled: false }
    mostra()
    expect(screen.queryByRole('button', { name: /Scadenzario/ })).toBeNull()
    expect(screen.queryByText('PANNELLO SCADENZARIO')).toBeNull()
    // Non vuota e non monca: l'anagrafica è aperta e gli ordini ci sono.
    expect(screen.getByText('PANNELLO ANAGRAFICA')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nuovo ordine/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lista ordini/ })).toBeInTheDocument()
  })

  it('e se si spegne mentre lo si guarda, si torna all’anagrafica', async () => {
    const user = userEvent.setup()
    mostra()
    await user.click(screen.getByRole('button', { name: /Scadenzario/ }))
    expect(screen.getByText('PANNELLO SCADENZARIO')).toBeInTheDocument()

    await act(async () => {
      stato.avvisaImpostazioni({ modulo_scadenzario_enabled: false })
    })
    expect(screen.queryByText('PANNELLO SCADENZARIO')).toBeNull()
    expect(screen.getByText('PANNELLO ANAGRAFICA')).toBeInTheDocument()
  })

  it('e se si accende mentre si guardano gli ordini, non sposta nessuno', async () => {
    const user = userEvent.setup()
    stato.impostazioni = { modulo_scadenzario_enabled: false }
    mostra()
    await user.click(screen.getByRole('button', { name: /Lista ordini/ }))
    expect(screen.getByText('PANNELLO ORDINI lista')).toBeInTheDocument()

    await act(async () => {
      stato.avvisaImpostazioni({})
    })
    expect(screen.getByRole('button', { name: /Scadenzario/ })).toBeInTheDocument()
    expect(screen.getByText('PANNELLO ORDINI lista')).toBeInTheDocument()
  })
})
