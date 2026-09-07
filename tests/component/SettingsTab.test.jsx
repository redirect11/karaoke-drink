// @vitest-environment happy-dom
'use strict'

// IMPOSTAZIONI A SCHEDE. Erano venti riquadri uno sotto l'altro: per
// cambiare l'orario di chiusura si scorreva oltre pagamenti, gruppi,
// sconti e coperto. Ora ogni riquadro è una voce a sinistra — e si apre
// UNA sola alla volta, altrimenti non si è risolto niente.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

// LE IMPOSTAZIONI FINTE, in un oggetto che le prove possono ritoccare:
// alcune sezioni cambiano forma a seconda di come è messo il locale (col
// servizio spento spariscono le voci che parlano di «servire»). È
// `vi.hoisted` perché `vi.mock` viene issato in cima al file e non vedrebbe
// una costante normale definita qui fuori.
const impostazioni = vi.hoisted(() => ({
  menu_only: false,
  workflow_enabled: true,
  groups_enabled: false,
  customer_accounts_enabled: true,
  queue_view: 'tabs',
  service_mode: 'banco',
  cancel_phrase_default: 'bancone',
  // I MODULI PREMIUM (REQ-LIC-001) come li scrive il documento del bar:
  // qui ci sono solo gli interruttori D'USO, che dicono se il locale li sta
  // usando. Cosa il locale HA lo dice la licenza (licenza.js), e per queste
  // prove è quella vera: scadenzario incluso, conta no.
  // Le chiavi stanno QUI e non solo nella prova che le cambia: l'assign del
  // beforeEach aggiunge, non toglie, e un valore scritto da una prova
  // resterebbe addosso a tutte quelle dopo.
  modulo_conta_enabled: true,
  modulo_scadenzario_enabled: true,
  licenza: null,
}))
const IMPOSTAZIONI_BASE = { ...impostazioni }

vi.mock('../../src/lib/api.js', () => {
  return {
    subscribeSettings: (cb) => {
      cb(impostazioni)
      return () => {}
    },
    updateSettings: vi.fn(() => Promise.resolve()),
    resetOpenOrdersToReceived: vi.fn(() => Promise.resolve(0)),
    replaceCatalog: vi.fn(() => Promise.resolve()),
    savePrinterConfig: vi.fn(),
    DEFAULT_SETTINGS: impostazioni,
    settingsIniziali: () => (impostazioni),
  }
})
vi.mock('../../src/lib/firebaseClient.js', () => ({ auth: { currentUser: null }, db: {} }))
vi.mock('../../src/lib/paymentsApi.js', () => ({
  pairSumUpReader: vi.fn(),
  unpairSumUpReader: vi.fn(),
}))
vi.mock('../../src/components/PrinterSetup.jsx', () => ({
  default: () => <div>PANNELLO STAMPANTE</div>,
}))
vi.mock('../../src/components/BackupPanel.jsx', () => ({
  default: () => <div>PANNELLO BACKUP</div>,
}))
vi.mock('../../src/components/InfoTab.jsx', () => ({
  default: () => <div>PANNELLO INFORMAZIONI</div>,
}))
vi.mock('../../src/components/ThemeSettings.jsx', () => ({
  default: () => <div>PANNELLO ASPETTO</div>,
  TemaMenuClienti: () => <div>COLORI MENÙ CLIENTI</div>,
}))

import { MemoryRouter } from '../helpers/router.jsx'
import SettingsTab from '../../src/components/SettingsTab.jsx'
import { subscribeSottosezioni } from '../../src/lib/sottosezioni.js'
import { useEffect, useState } from 'react'

// LE SEZIONI STANNO NEL MENU A SCOMPARSA, sotto la pagina aperta: qui si
// rifà quel pezzetto di menu, così le prove restano quelle di prima —
// «scelgo una sezione, si apre il suo riquadro» — invece di frugare nella
// tubatura.
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

// Col MemoryRouter: coi riquadri impilati per gruppo, in pagina finiscono
// anche card che contengono dei Link (es. lo storico notifiche nel
// profilo), e un Link senza router fa esplodere il render.
const mostra = (props = { role: 'admin' }) =>
  render(
    <MemoryRouter>
      <SettingsTab {...props} />
      <BarraSezioni />
    </MemoryRouter>
  )

beforeEach(() => {
  localStorage.clear()
  Object.assign(impostazioni, IMPOSTAZIONI_BASE)
})

describe('impostazioni a schede', () => {
  it('si apre una sezione sola, non la pagina intera', async () => {
    mostra()
    expect(screen.getByText('PANNELLO ASPETTO')).toBeInTheDocument()
    // I riquadri delle altre sezioni NON sono in pagina.
    expect(screen.queryByRole('heading', { name: 'Pagamenti' })).toBeNull()
    expect(screen.queryByText('PANNELLO STAMPANTE')).toBeNull()
  })

  it('scegliendo un gruppo si aprono i SUOI riquadri, impilati, e si chiude il precedente', async () => {
    // Le voci del sottomenu sono GRUPPI («a cosa afferisce» l'impostazione):
    // un gruppo mostra tutti i riquadri che ha assorbito, uno sotto l'altro.
    const user = userEvent.setup()
    mostra()
    await user.click(screen.getByRole('button', { name: /Cassa e giornata/ }))
    expect(screen.getByRole('heading', { name: 'Pagamenti' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Giornata/ })).toBeInTheDocument()
    expect(screen.queryByText('PANNELLO ASPETTO')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Stampante/ }))
    expect(screen.getByText('PANNELLO STAMPANTE')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pagamenti' })).toBeNull()
  })

  it('il gruppo aperto si ricorda: a impostazioni si torna per lo stesso motivo', async () => {
    const user = userEvent.setup()
    const primo = mostra()
    await user.click(screen.getByRole('button', { name: /Prezzi e supplementi/ }))
    expect(screen.getByRole('heading', { name: 'Coperto' })).toBeInTheDocument()
    primo.unmount()

    mostra()
    expect(screen.getByRole('heading', { name: 'Coperto' })).toBeInTheDocument()
  })

  it('le voci del sottomenu sono GRUPPI, non ventitré sezioni', () => {
    mostra()
    for (const voce of [
      'Aspetto',
      'Menù clienti',
      'Gestione menù',
      'Catalogo prodotti',
      'Banco: coda e ordine',
      'Servizio',
      'Cassa e giornata',
      'Prezzi e supplementi',
      'Gruppi di ordini',
      'Clienti',
      'Stampante',
      'Funzioni premium',
      'Sistema',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(voce) })).toBeInTheDocument()
    }
  })

  it('nei gruppi non si è perso nessun riquadro per strada', async () => {
    // L'accorpamento sposta, non elimina: ogni gruppo deve contenere le
    // intestazioni dei riquadri che ha assorbito.
    const user = userEvent.setup()
    mostra()
    const attese = [
      ['Menù clienti', [/Menù clienti/]],
      ['Gestione menù', [/Gestione menù/]],
      ['Catalogo prodotti', [/Catalogo/]],
      ['Banco: coda e ordine', [/Coda ordini/, /Vista ordine/]],
      [/Servizio$/, [/Consegna/, /preparazione/, /Tempi di servizio/, /Annullamenti/]],
      ['Cassa e giornata', [/Pagamenti/, /^Stampa automatica$/, /Giornata/]],
      ['Prezzi e supplementi', [/Prezzo consigliato/, /Sconto/, /^Coperto$/, /Servizio e mancia/]],
      ['Clienti', [/Account clienti/, /Posizione/, /Notifiche/]],
    ]
    for (const [gruppo, headings] of attese) {
      await user.click(screen.getByRole('button', { name: gruppo instanceof RegExp ? gruppo : new RegExp(gruppo) }))
      for (const h of headings) {
        expect(screen.getByRole('heading', { name: h })).toBeInTheDocument()
      }
    }
    // Sistema: backup e informazioni (qui i pannelli sono finti, si vede
    // il segnaposto).
    await user.click(screen.getByRole('button', { name: /Sistema/ }))
    expect(screen.getByText('PANNELLO BACKUP')).toBeInTheDocument()
    expect(screen.getByText('PANNELLO INFORMAZIONI')).toBeInTheDocument()
  })
})

// ── Come si comporta la ricerca nella coda ────────────────────────────
// Chi lavora al banco ha due abitudini diverse: c'è chi vuole la coda
// ripulita e chi vuole vederla tutta e sapere solo DOVE sta il conto.
// Non si sceglie per lui: l'interruttore sta qui, nelle impostazioni.
describe('la ricerca della coda: filtra o accende', () => {
  it('di suo filtra, come è sempre stato', async () => {
    const user = userEvent.setup()
    mostra()
    await user.click(screen.getByRole('button', { name: /Banco: coda e ordine/ }))
    expect(screen.getByRole('button', { name: /Filtra la coda/ })).toHaveClass('active')
    expect(screen.getByRole('button', { name: /Accendi il conto e portami lì/ })).not.toHaveClass('active')
  })

  it('si può passare ad accendere il conto trovato', async () => {
    const user = userEvent.setup()
    const { updateSettings } = await import('../../src/lib/api.js')
    mostra()
    await user.click(screen.getByRole('button', { name: /Banco: coda e ordine/ }))
    await user.click(screen.getByRole('button', { name: /Accendi il conto e portami lì/ }))
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({ queue_search: 'evidenzia' }))
  })
})

// LA VISTA DEL BANCO STA QUI, accanto a quella della coda: è
// un'impostazione del LOCALE, non di chi guarda. Ad accenderla sono gli
// stati del servizio — senza quei passi non ci sarebbe niente da mostrare —
// e qui si sceglie soltanto come disegnarla.
describe('la vista del banco', () => {
  it('è una lista di viste possibili, e di suo è «corsie di stato»', async () => {
    // Non un interruttore: quando se ne aggiungerà un'altra il valore già
    // scritto su settings/bar resta buono, senza migrazioni.
    const user = userEvent.setup()
    mostra()
    await user.click(screen.getByRole('button', { name: /Banco: coda e ordine/ }))
    const titolo = screen.getByText('La vista del banco')
    // «corsie di stato» è anche una delle viste della CODA: qui si guarda
    // la fila di voci che sta sotto questo titolo, non quella sopra.
    const suoi = [
      ...titolo.nextElementSibling.nextElementSibling.querySelectorAll('button'),
    ]
    expect(suoi.map((b) => b.textContent)).toEqual(['🚦 Corsie di stato'])
    expect(suoi[0]).toHaveClass('active')
    expect(suoi[0]).toBeEnabled()
  })
})

// ── I DUE TASTI DEL PAGAMENTO SI ACCENDONO IN «PAGAMENTI» ───────────
//
// «Metti che anche il tasto "riscuoti e servi" è opzionale nelle
// impostazioni» (l'utente, 21/08/2026). L'impostazione c'era già: stava in
// «Gestione preparazione» e non l'ha trovata. È lo STESSO inciampo del
// 20/08 con «Riscuoti senza stampa», che stava nello stesso posto
// sbagliato per la stessa parentela di forma.
// Chi cerca un tasto della schermata di pagamento apre Pagamenti. I due
// tasti compaiono nella stessa schermata, affiancati: si accendono nello
// stesso posto.
describe('gli interruttori dei tasti di incasso stanno in Pagamenti', () => {
  const apriPagamenti = async (user) =>
    user.click(screen.getByRole('button', { name: /Cassa e giornata/ }))
  // Il riquadro che contiene una certa riga: si risale dalla scritta al
  // suo `.settings-section`, così la prova dice «in QUALE sezione sta» e
  // non solo «c'è da qualche parte in pagina».
  const sezioneDi = (testo) =>
    screen.getByText(testo).closest('.settings-section').querySelector('h3').textContent

  it('«incassare e servire insieme» sta accanto al suo gemello, in Pagamenti', async () => {
    const user = userEvent.setup()
    mostra()
    await apriPagamenti(user)
    expect(sezioneDi('Un tasto per incassare e servire insieme')).toBe('Pagamenti')
    expect(sezioneDi('Un tasto per incassare senza stampare')).toBe('Pagamenti')
  })

  it('e non è rimasto un doppione in «Gestione preparazione»', async () => {
    const user = userEvent.setup()
    mostra()
    await user.click(screen.getByRole('button', { name: /Servizio$/ }))
    expect(screen.getByRole('heading', { name: /preparazione/ })).toBeInTheDocument()
    expect(screen.queryByText('Un tasto per incassare e servire insieme')).toBeNull()
  })

  // ── LE DUE DELLO SCONTRINO D'ACCONTO (REQ-STAMPA-015) ───────────
  // QUESTA PROVA DICEVA «Pagamenti», ed è cambiata la DECISIONE, non il
  // codice sotto: «le impostazioni di stampa automatica riguardano la
  // cassa, quindi anche le impostazioni di stampa automatiche spostale in
  // cassa» (l'utente, 22/08/2026 — REQ-UI-025). «Esce da sola a ogni
  // riscossione» è stampa automatica, e adesso sta con le sue. La lezione
  // di BUG-070 regge lo stesso: restano nella SEZIONE dove si incassa, a
  // uno scorrimento dai tasti dell'incasso, non in un'altra pagina.
  it('le due dell’acconto stanno in «Stampa automatica», nella stessa sezione', async () => {
    const user = userEvent.setup()
    mostra()
    await apriPagamenti(user)
    expect(sezioneDi('Lo scontrino d’acconto a ogni riscossione')).toBe('Stampa automatica')
    expect(sezioneDi('Un tasto per l’acconto con lo scontrino')).toBe('Stampa automatica')
    // …e i tasti dell'incasso sono lì accanto, nella stessa schermata.
    expect(sezioneDi('Un tasto per incassare senza stampare')).toBe('Pagamenti')
  })

  // «Quando la riscossione dello scontrino di acconto è attiva, disabilita
  // l'opzione del terzo bottone» (l'utente, 21/08/2026). Disabilitata, NON
  // sparita: sparire sembrerebbe un guasto — «l'avevo acceso, dov'è
  // finito?» — e chi torna qui non capirebbe cosa ha perso.
  it('con l’acconto automatico acceso, il terzo tasto è spento e dice perché', async () => {
    impostazioni.scontrino_acconto_sempre = true
    impostazioni.scontrino_acconto_tasto = true
    const user = userEvent.setup()
    mostra()
    await apriPagamenti(user)
    const riga = screen.getByText('Un tasto per l’acconto con lo scontrino').closest('.toggle-row')
    const interruttore = riga.querySelector('input[type="checkbox"]')
    expect(interruttore).toBeDisabled()
    // Spento anche a vedersi, benché la scelta di prima sia ancora scritta
    // nelle impostazioni: quel tasto in cassa non compare.
    expect(interruttore).not.toBeChecked()
    expect(riga).toHaveTextContent(/esce già da sola a ogni riscossione/)
  })

  it('spento l’automatico, il terzo tasto torna toccabile com’era', async () => {
    impostazioni.scontrino_acconto_sempre = false
    impostazioni.scontrino_acconto_tasto = true
    const user = userEvent.setup()
    mostra()
    await apriPagamenti(user)
    const interruttore = screen
      .getByText('Un tasto per l’acconto con lo scontrino')
      .closest('.toggle-row')
      .querySelector('input[type="checkbox"]')
    expect(interruttore).toBeEnabled()
    expect(interruttore).toBeChecked()
  })

  it('col servizio spento l’interruttore non c’è: «servire» non esiste', async () => {
    // La condizione se l'è portata dietro dal trasloco. Senza i passi del
    // servizio quel tasto non comparirebbe comunque in cassa, e un
    // interruttore che non fa niente è peggio di uno assente.
    // Il gemello «senza stampa» invece resta: con la stampa il servizio
    // non c'entra niente.
    impostazioni.workflow_enabled = false
    const user = userEvent.setup()
    mostra()
    await apriPagamenti(user)
    expect(screen.queryByText('Un tasto per incassare e servire insieme')).toBeNull()
    expect(screen.getByText('Un tasto per incassare senza stampare')).toBeInTheDocument()
  })
})

// ── LE FUNZIONI PREMIUM ───────────────────────────────────
// REQ-LIC-001. Le due funzioni che questa installazione non ha restano in
// elenco: spente, non toccabili, e AL TOCCO DICONO PERCHÉ. Rimettendo il
// difetto — `disabled` al posto di `aria-disabled` — la terza prova qui
// sotto diventa rossa, perché il tocco non parte nemmeno.
describe('le funzioni premium (REQ-LIC-001)', () => {
  const apriPremium = async (user) => {
    await user.click(screen.getByRole('button', { name: /Funzioni premium/ }))
  }
  const interruttoreDi = (etichetta) =>
    screen.getByText(etichetta).closest('.toggle-row').querySelector('input[type="checkbox"]')

  it('le due funzioni ci sono, e dicono cosa fanno e come sono messe', async () => {
    const user = userEvent.setup()
    mostra()
    await apriPremium(user)
    expect(screen.getByRole('heading', { name: 'Funzioni premium' })).toBeInTheDocument()
    expect(screen.getByText('Conta di magazzino')).toBeInTheDocument()
    expect(screen.getByText('Fatture ai fornitori')).toBeInTheDocument()
    // Le due fatture stanno una sotto l'altra e sono mestieri opposti:
    // l'etichetta deve dire di chi sono senza doverle aprire.
    expect(screen.getByText('Fatture ai clienti')).toBeInTheDocument()
    // Il registro è professionale: si dice cosa fa e com'è messa, niente
    // toni da venditore (DESIGN.md, guardrail 3).
    expect(screen.getAllByText(/Funzione premium: non inclusa\./).length).toBeGreaterThan(0)
    expect(screen.getByText(/Funzione premium, inclusa in questa installazione\./)).toBeInTheDocument()
    expect(screen.queryByText(/sblocca|acquista|scopri/i)).toBeNull()
  })

  it('quella NON INCLUSA è spenta e non si tocca', async () => {
    const user = userEvent.setup()
    mostra()
    await apriPremium(user)
    const interruttore = interruttoreDi('Conta di magazzino')
    expect(interruttore).not.toBeChecked()
    expect(interruttore).toHaveAttribute('aria-disabled', 'true')
  })

  it('e al tocco dice perché, invece di non fare niente', async () => {
    // La ragione dei metodi di pagamento non disponibili: `disabled` non fa
    // partire l'evento, e chi preme resta a premere un tasto morto.
    const { subscribeToasts, dismissToast } = await import('../../src/lib/toast.js')
    let visti = []
    const stop = subscribeToasts((t) => {
      visti = t
    })
    const user = userEvent.setup()
    const { updateSettings } = await import('../../src/lib/api.js')
    mostra()
    await apriPremium(user)
    // Le altre prove hanno già salvato roba: qui conta solo cosa succede
    // DA questo tocco in poi.
    updateSettings.mockClear()
    await user.click(interruttoreDi('Conta di magazzino'))
    expect(visti.some((t) => /premium/i.test(t.message))).toBe(true)
    // E soprattutto: NON si è acceso niente.
    expect(updateSettings).not.toHaveBeenCalled()
    expect(interruttoreDi('Conta di magazzino')).not.toBeChecked()
    visti.forEach((t) => dismissToast(t.id))
    stop()
  })

  it('quella INCLUSA è accesa, si tocca, e si spegne davvero', async () => {
    // Quello che il locale ha comprato lo accende e lo spegne come ogni
    // altra impostazione: premium non vuol dire bloccato.
    const user = userEvent.setup()
    const { updateSettings } = await import('../../src/lib/api.js')
    mostra()
    await apriPremium(user)
    const interruttore = interruttoreDi('Fatture ai fornitori')
    expect(interruttore).toBeChecked()
    expect(interruttore).not.toHaveAttribute('aria-disabled')
    expect(interruttore).toBeEnabled()

    updateSettings.mockClear()
    await user.click(interruttore)
    expect(updateSettings).toHaveBeenCalledWith({ modulo_scadenzario_enabled: false })
  })

  it('spenta a mano, resta toccabile: è inclusa, non è sparita', async () => {
    impostazioni.modulo_scadenzario_enabled = false
    const user = userEvent.setup()
    const { updateSettings } = await import('../../src/lib/api.js')
    mostra()
    await apriPremium(user)
    const interruttore = interruttoreDi('Fatture ai fornitori')
    expect(interruttore).not.toBeChecked()
    expect(interruttore).not.toHaveAttribute('aria-disabled')
    expect(screen.getByText(/Funzione premium, inclusa in questa installazione\./)).toBeInTheDocument()

    updateSettings.mockClear()
    await user.click(interruttore)
    expect(updateSettings).toHaveBeenCalledWith({ modulo_scadenzario_enabled: true })
  })

  it('la licenza che include la conta le sblocca l’interruttore', async () => {
    // Il punto di innesto della Fase 3, visto dalla schermata: cambia il
    // DATO, e la riga passa da bloccata a normale senza toccare il codice.
    impostazioni.licenza = { moduli: { conta: true, scadenzario: true } }
    const user = userEvent.setup()
    mostra()
    await apriPremium(user)
    const interruttore = interruttoreDi('Conta di magazzino')
    expect(interruttore).toBeChecked()
    expect(interruttore).not.toHaveAttribute('aria-disabled')
    expect(screen.getAllByText(/Funzione premium, inclusa in questa installazione\./)).toHaveLength(2)
  })
})
