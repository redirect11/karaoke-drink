// @vitest-environment happy-dom
'use strict'

// LA BARRA IN CIMA, UGUALE OVUNQUE.
//
// Prima cambiava forma a ogni schermata: il ☰ c'era solo nel gestionale e
// nel menù, e a destra si alternavano tre cose diverse — il chip col nome,
// "🍸 Ciao, nome" con l'Esci accanto, "🫱 Torna al servizio". Passando
// dalla coda al profilo la barra diventava un'altra e il menu spariva:
// per tornare indietro restava il tasto del browser.
//
// E il TEMA seguiva l'indirizzo, non chi guardava. Bastava un percorso
// dimenticato nell'elenco — il profilo staff, "i miei ordini", l'accesso —
// perché a chi sta lavorando arrivassero i colori pensati per il cliente,
// in mezzo alla serata. Ora segue il ruolo.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from '../helpers/router.jsx'
import '@testing-library/jest-dom/vitest'

// Chi è collegato: lo decide ogni test prima di montare.
let ruoloClaim = null
let clienteLoggato = null

vi.mock('../../src/lib/firebaseClient.js', () => ({
  isFirebaseConfigured: true,
  auth: { currentUser: null },
  db: {},
}))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb(
      ruoloClaim
        ? {
            uid: 'u1',
            email: 'capo@bar.it',
            displayName: 'Capo Bar',
            getIdTokenResult: async () => ({ claims: { role: ruoloClaim } }),
          }
        : null
    )
    return () => {}
  },
}))
vi.mock('../../src/lib/customerAuth.js', () => ({
  useCustomer: () => ({ user: clienteLoggato, profile: null }),
  useHasOrders: () => false,
  logoutCustomer: vi.fn(),
}))

// Due temi ben diversi, così si vede subito quale è arrivato. (Dentro la
// fabbrica di vi.mock, che finisce in cima al file, vanno riscritti: da lì
// non si vedono le costanti.)
const TEMA_STAFF = { preset: 'notte-blu', custom: null }
const TEMA_CLIENTE = { preset: 'crema', custom: null }
vi.mock('../../src/lib/api.js', () => ({
  DEFAULT_SETTINGS: {},
  settingsIniziali: () => ({}),
  subscribeSettings: (cb) => {
    cb({
      customer_accounts_enabled: true,
      theme_staff: { preset: 'notte-blu', custom: null },
      theme_client: { preset: 'crema', custom: null },
      groups_enabled: false,
      groups_in_drawer: false,
    })
    return () => {}
  },
  subscribeOpenGroups: (cb) => {
    cb([])
    return () => {}
  },
  createManualGroup: vi.fn(),
  clockIn: vi.fn(async () => {}),
  subscribePrinterConfig: () => () => {},
}))

vi.mock('../../src/lib/printer.js', () => ({
  savePrinterSettings: vi.fn(),
  impostaUtenteStampante: vi.fn(),
}))
vi.mock('../../src/lib/appVersion.js', () => ({ subscribeUpdateAvailable: () => () => {} }))
vi.mock('../../src/lib/cookieConsent.js', () => ({ openCookiePreferences: vi.fn() }))
vi.mock('../../src/dev/devActions.js', () => ({ envLabel: '', devToolsEnabled: false }))
vi.mock('../../src/lib/logout.js', () => ({ logoutStaff: vi.fn() }))
vi.mock('../../src/components/StatusBell.jsx', () => ({
  default: () => <div data-testid="campanella" />,
}))
vi.mock('../../src/components/VersionBadge.jsx', () => ({ default: () => null }))
vi.mock('../../src/components/ZoomControl.jsx', () => ({ default: () => null }))
vi.mock('../../src/components/Toasts.jsx', () => ({ default: () => null }))

// Le pagine non c'entrano: qui si guarda solo la barra. (Le fabbriche di
// vi.mock finiscono in cima al file: niente scorciatoie condivise.)
vi.mock('../../src/pages/LandingPage.jsx', () => ({ default: () => <div>PAGINA HOME</div> }))
vi.mock('../../src/pages/MenuPage.jsx', () => ({ default: () => <div>PAGINA MENU</div> }))
vi.mock('../../src/pages/OrderStatusPage.jsx', () => ({ default: () => <div>PAGINA ORDINE</div> }))
vi.mock('../../src/pages/MyOrdersPage.jsx', () => ({ default: () => <div>PAGINA MIEI ORDINI</div> }))
vi.mock('../../src/pages/BartenderPage.jsx', () => ({ default: () => <div>PAGINA CODA</div> }))
vi.mock('../../src/pages/StaffProfilePage.jsx', () => ({
  default: () => <div>PAGINA PROFILO STAFF</div>,
}))
vi.mock('../../src/pages/PosPage.jsx', () => ({ default: () => <div>PAGINA POS</div> }))
vi.mock('../../src/pages/AccountPages.jsx', () => ({
  AccediPage: () => <div>PAGINA ACCEDI</div>,
  RegistratiPage: () => <div>PAGINA REGISTRATI</div>,
  ProfiloPage: () => <div>PAGINA PROFILO</div>,
}))

import App from '../../src/App.jsx'
import { THEME_PRESETS } from '../../src/lib/themes.js'

function apri(percorso) {
  return render(
    <MemoryRouter initialEntries={[percorso]}>
      <App />
    </MemoryRouter>
  )
}

const burger = () => document.querySelector('.topbar-burger')
const accento = () => document.documentElement.style.getPropertyValue('--accent')

beforeEach(() => {
  ruoloClaim = null
  clienteLoggato = null
  document.documentElement.removeAttribute('style')
  localStorage.clear()
})

describe('la barra in cima è la stessa su tutte le schermate', () => {
  it('logo, nome e ☰ ci sono anche fuori dal gestionale', async () => {
    ruoloClaim = 'admin'
    apri('/profilo-staff')
    // Si aspetta il CHIP di chi è collegato, non il ☰: quello c'è anche
    // prima che arrivi il ruolo, e in quell'attimo è montato il menu del
    // CLIENTE — che porta anche lui il nome del locale. Aspettando il ☰ il
    // nome si trovava due volte, ogni tanto: una prova ballerina è peggio di
    // una prova che manca, perché la si impara a ignorare.
    await waitFor(() => expect(document.querySelector('.topbar-io')).not.toBeNull())
    expect(screen.getByText('La Tana del Coniglio')).toBeInTheDocument()
    // A destra una cosa sola: chi è collegato, che apre il suo profilo.
    const io = document.querySelector('.topbar-io')
    expect(io).toHaveAttribute('href', '/profilo-staff')
    expect(io).toHaveTextContent('Capo Bar')
    // Le vecchie varianti sono voci del menu laterale, non della barra.
    expect(screen.queryByText(/Ciao, Capo Bar/)).toBeNull()
    expect(screen.queryByText('Torna al servizio')).toBeNull()
  })

  it('la stessa barra nel menù usato per gli ordini manuali', async () => {
    ruoloClaim = 'bartender'
    apri('/menu')
    await waitFor(() => expect(document.querySelector('.topbar-io')).not.toBeNull())
    expect(burger()).not.toBeNull()
    expect(screen.getByText('La Tana del Coniglio')).toBeInTheDocument()
  })

  // Nel POS ci si arriva dal menu (o dal ➕ della coda), non aprendo l'app lì
  // dentro: all'avvio della sessione si viene riportati alla lista ordini.
  it('niente ☰ mentre si compone un conto: da lì si esce con «← Ordini»', async () => {
    const user = userEvent.setup()
    ruoloClaim = 'bartender'
    // Da una schermata qualsiasi: il menu laterale lo monta l'app (nella coda
    // se lo monta la pagina, che qui è finta).
    apri('/profilo-staff')
    await screen.findByText('PAGINA PROFILO STAFF')
    await user.click(burger())
    await user.click(screen.getByText('Nuovo ordine'))
    await screen.findByText('PAGINA POS')
    expect(burger()).toBeNull()
  })

  it('niente ☰ nemmeno modificando un ordine, se a guardarlo è lo staff', async () => {
    ruoloClaim = 'bartender'
    apri('/ordine/abc')
    await screen.findByText('PAGINA ORDINE')
    expect(burger()).toBeNull()
  })

  it('lo stesso ordine, visto dal cliente, il ☰ ce l’ha', async () => {
    apri('/ordine/abc')
    await screen.findByText('PAGINA ORDINE')
    expect(burger()).not.toBeNull()
  })
})

// Aprendo l'app, chi lavora si trovava la vetrina dei clienti e doveva
// cercarsi la strada per la coda.
describe('chi lavora non passa dalla vetrina', () => {
  it('dalla home lo staff finisce dritto nella lista ordini', async () => {
    ruoloClaim = 'bartender'
    apri('/')
    await screen.findByText('PAGINA CODA')
    expect(screen.queryByText('PAGINA HOME')).toBeNull()
  })

  it('anche il gestore', async () => {
    ruoloClaim = 'admin'
    apri('/')
    await screen.findByText('PAGINA CODA')
  })

  it('il cliente la vetrina la vede, com’è giusto', async () => {
    apri('/')
    await screen.findByText('PAGINA HOME')
    expect(screen.queryByText('PAGINA CODA')).toBeNull()
  })

  // La scheda resta aperta sul POS, l'app si riapre lì dentro e la schermata
  // riprende da sé il conto lasciato in corso: si finisce a battere righe in
  // un conto che non si è scelto. Nel POS ci si entra col ➕, non per inerzia.
  it('riaprendo l’app dentro il POS si finisce nella lista ordini', async () => {
    ruoloClaim = 'bartender'
    apri('/pos')
    await screen.findByText('PAGINA CODA')
    expect(screen.queryByText('PAGINA POS')).toBeNull()
  })

  it('col QR del tavolo si va al menù anche se a inquadrarlo è il barista', async () => {
    // La home inoltra da sé al menù coi parametri: il rimando alla coda non
    // deve rubargli la precedenza, o il tavolo si perde.
    ruoloClaim = 'bartender'
    apri('/?tavolo=12')
    await screen.findByText('PAGINA HOME')
    expect(screen.queryByText('PAGINA CODA')).toBeNull()
  })
})

describe('il menu laterale risponde anche al cliente', () => {
  // Il menu, e non la barra: "Accedi" sta in tutti e due, e cercarlo in
  // pagina ne troverebbe due.
  const menu = () => within(document.querySelector('.bar-sidebar'))

  it('il suo menu: menù, i propri ordini, accesso — niente gestionale', async () => {
    apri('/ordini')
    await waitFor(() => expect(burger()).not.toBeNull())
    expect(menu().getByText('Menù')).toBeInTheDocument()
    expect(menu().getByText('I miei ordini')).toBeInTheDocument()
    expect(menu().getByText('Accedi')).toBeInTheDocument()
    expect(menu().getByText('Registrati')).toBeInTheDocument()
    // Le porte chiuse non si mostrano: le impostazioni non sono cosa sua.
    expect(screen.queryByText('Impostazioni')).toBeNull()
    expect(screen.queryByText('Utenti e ruoli')).toBeNull()
  })

  it('collegato, trova il proprio profilo e l’uscita', async () => {
    clienteLoggato = { uid: 'c1', email: 'anna@tana.it', displayName: 'Anna Rossi' }
    apri('/ordini')
    await waitFor(() => expect(burger()).not.toBeNull())
    expect(menu().getByText('Il mio profilo')).toBeInTheDocument()
    expect(menu().getByText('Esci')).toBeInTheDocument()
    expect(menu().queryByText('Registrati')).toBeNull()
  })
})

describe('il tema segue chi guarda, non l’indirizzo', () => {
  it('a chi lavora il gestionale, anche sul proprio profilo', async () => {
    ruoloClaim = 'admin'
    apri('/profilo-staff')
    await waitFor(() => expect(accento()).toBe(THEME_PRESETS[TEMA_STAFF.preset].vars['--accent']))
  })

  it('e anche su «i miei ordini» e sull’accesso, che prima sfuggivano', async () => {
    ruoloClaim = 'staff'
    apri('/ordini')
    await waitFor(() => expect(accento()).toBe(THEME_PRESETS[TEMA_STAFF.preset].vars['--accent']))
  })

  it('al cliente il suo, sempre', async () => {
    apri('/menu')
    await waitFor(() => expect(accento()).toBe(THEME_PRESETS[TEMA_CLIENTE.preset].vars['--accent']))
  })

  it('l’anteprima «vista cliente» mostra i colori del cliente: è il suo mestiere', async () => {
    ruoloClaim = 'admin'
    apri('/menu?vista=cliente')
    await waitFor(() => expect(accento()).toBe(THEME_PRESETS[TEMA_CLIENTE.preset].vars['--accent']))
  })
})

// L'«indietro» delle sezioni del gestionale stava dentro la pagina e si
// mangiava la prima riga di contenuto: nelle Impostazioni, che hanno bisogno
// di tutta l'altezza per stare in uno schermo, era una riga di troppo.
describe('l’indietro sta nella barra, non dentro la pagina', () => {
  const nastro = () => [...document.querySelector('.topbar').children].map((e) => e.className)

  it('in una sezione del gestionale c’è, fra il ☰ e il marchio', async () => {
    ruoloClaim = 'admin'
    apri('/bar?tab=impostazioni')
    await waitFor(() => expect(document.querySelector('.topbar-back')).not.toBeNull())
    const ordine = nastro()
    expect(ordine.indexOf('topbar-burger')).toBeLessThan(ordine.indexOf('topbar-back'))
    expect(ordine.indexOf('topbar-back')).toBeLessThan(ordine.indexOf('brand'))
  })

  it('anche nel proprio profilo, dove prima c’era un tasto in fondo alla pagina', async () => {
    ruoloClaim = 'bartender'
    apri('/profilo-staff')
    await waitFor(() => expect(document.querySelector('.topbar-back')).not.toBeNull())
    expect(screen.queryByText(/Torna al gestionale/)).toBeNull()
  })

  it('nella coda non c’è: da lì non si torna da nessuna parte', async () => {
    ruoloClaim = 'admin'
    apri('/bar')
    await screen.findByText('PAGINA CODA')
    expect(document.querySelector('.topbar-back')).toBeNull()
  })

  it('al cliente non compare mai', async () => {
    apri('/menu')
    await screen.findByText('PAGINA MENU')
    expect(document.querySelector('.topbar-back')).toBeNull()
  })
})

// ── Cosa è cambiato, dopo un aggiornamento ───────────────────────────
// L'app si aggiorna da sé mentre la si usa: chi lavora si ritrova qualcosa
// spostato di posto e non sa perché. Le note ci sono sempre state, ma in
// fondo alle impostazioni, dove nessuno va a cercarle.
describe('le novità dopo un aggiornamento', () => {
  const CHANGELOG = `# Note

## 0.0.0-test — oggi

- La cosa nuova.
`

  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, text: () => Promise.resolve(CHANGELOG) })
    )
  })

  it('build nuova: il box con le note esce da sé', async () => {
    // Una build già vista diversa da questa: è lo stato di chi riapre l'app
    // dopo un aggiornamento, comunque ci sia arrivato.
    localStorage.setItem('tana:novita:vista', 'build-vecchia')
    apri('/menu')
    expect(await screen.findByRole('dialog', { name: 'Novità di questa versione' })).toBeInTheDocument()
    expect(await screen.findByText(/La cosa nuova/)).toBeInTheDocument()
  })

  it('chiuso il box, la build risulta vista e non torna più', async () => {
    const user = userEvent.setup()
    localStorage.setItem('tana:novita:vista', 'build-vecchia')
    const { unmount } = apri('/menu')
    await user.click(await screen.findByRole('button', { name: 'Ho capito' }))
    expect(localStorage.getItem('tana:novita:vista')).not.toBe('build-vecchia')
    unmount()
    apri('/menu')
    // Il box non torna, e non torna nemmeno DOPO che la seconda apertura ha
    // finito di caricarsi (note e stato degli avvisi arrivano da letture
    // asincrone). Verificarlo subito e basta significava dire «non c'e'»
    // quando semplicemente non era ancora arrivato niente.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Novità di questa versione' })).toBeNull()
    )
  })

  // Del box, dopo averlo chiuso, non resterebbe niente: l'avviso si registra
  // comunque — già letto, perché è appena stato mostrato — così l'aggiornamento
  // si ritrova nello storico della campanella.
  it('resta traccia in campanella, come notifica già letta', async () => {
    localStorage.setItem('tana:novita:vista', 'build-vecchia')
    apri('/menu')
    await screen.findByRole('dialog', { name: 'Novità di questa versione' })
    const notifiche = JSON.parse(localStorage.getItem('tana:notifs') || '[]')
    expect(notifiche[0].title).toMatch(/aggiornata/i)
    expect(notifiche[0].href).toMatch(/tab=impostazioni/)
    expect(notifiche[0].letta).toBe(true)
  })

  it('prima apertura su un dispositivo nuovo: nessun box, nessuna notifica', async () => {
    apri('/menu')
    await screen.findByText('PAGINA MENU')
    expect(screen.queryByRole('dialog', { name: 'Novità di questa versione' })).toBeNull()
    expect(JSON.parse(localStorage.getItem('tana:notifs') || '[]')).toEqual([])
  })
})

// ── DA SLOGGATI NON C'È NESSUNA CAMPANELLA ───────────────────────────
// Chi non è entrato è un cliente qualunque sulla parte pubblica: gli avvisi
// parlano di ordini che non ha fatto, e «registra questo terminale» è una
// domanda del gestionale. Sulla schermata d'accesso comparivano tutte e
// due, sopra al modulo.
describe('la campanella e chi non è entrato', () => {
  it('non c’è finché nessuno è collegato', async () => {
    ruoloClaim = null
    clienteLoggato = null
    apri('/')
    expect(await screen.findByText('PAGINA HOME')).toBeInTheDocument()
    expect(screen.queryByTestId('campanella')).toBeNull()
  })

  it('c’è per chi lavora', async () => {
    ruoloClaim = 'bartender'
    clienteLoggato = null
    apri('/')
    expect(await screen.findByTestId('campanella')).toBeInTheDocument()
  })
})
