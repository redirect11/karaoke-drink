// @vitest-environment happy-dom
'use strict'

// Il MENU laterale del gestionale: quello che si tocca cinquanta volte a
// sera. I gruppi occupavano mezzo menu e spingevano fuori le ultime voci,
// e non c'era modo di vedere a nome di chi si stava battendo.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { MemoryRouter } from '../helpers/router.jsx'
import '@testing-library/jest-dom/vitest'

vi.mock('../../src/lib/firebaseClient.js', () => ({
  auth: { currentUser: { uid: 'a1', email: 'capo@bar.it', displayName: 'Capo Bar' } },
}))
vi.mock('../../src/lib/logout.js', () => ({ logoutStaff: vi.fn() }))
vi.mock('../../src/dev/devActions.js', () => ({ devToolsEnabled: false }))
vi.mock('../../src/lib/api.js', () => ({
  DEFAULT_SETTINGS: { groups_enabled: false, groups_in_drawer: false },
  settingsIniziali: () => ({ groups_enabled: false, groups_in_drawer: false }),
  subscribeSettings: vi.fn((cb) => {
    cb({ groups_enabled: true, groups_in_drawer: true })
    return () => {}
  }),
  subscribeOpenGroups: vi.fn((cb) => {
    cb([{ id: 'g1', name: 'SumUp Test', kind: 'manual' }])
    return () => {}
  }),
  createManualGroup: vi.fn(),
}))

import StaffDrawer from '../../src/components/StaffDrawer.jsx'
import { Sottosezioni } from '../../src/lib/sottosezioni.js'

function apri(role = 'admin') {
  const r = render(
    <MemoryRouter initialEntries={['/bar']}>
      <Routes>
        <Route path="/bar" element={<StaffDrawer role={role} />} />
        <Route path="/profilo-staff" element={<div>PAGINA PROFILO</div>} />
        <Route path="/pos" element={<div>PAGINA POS</div>} />
        <Route path="/menu" element={<div>PAGINA MENU</div>} />
      </Routes>
    </MemoryRouter>
  )
  return r
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('menu laterale', () => {
  it('i gruppi partono chiusi e si aprono a richiesta', async () => {
    apri()
    expect(screen.getByRole('button', { name: /Gruppi/ })).toBeInTheDocument()
    expect(screen.queryByTitle('SumUp Test')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Gruppi/ }))
    expect(screen.getByTitle('SumUp Test')).toBeInTheDocument()
  })

  it('riaperto il menu, i gruppi restano come li avevi lasciati', async () => {
    const primo = apri()
    await userEvent.click(screen.getByRole('button', { name: /Gruppi/ }))
    primo.unmount()
    apri()
    expect(screen.getByTitle('SumUp Test')).toBeInTheDocument()
  })

  it('in fondo c’è chi è collegato, col suo ruolo, e apre il profilo', async () => {
    apri('admin')
    expect(screen.getByText('Capo Bar')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Capo Bar'))
    expect(screen.getByText('PAGINA PROFILO')).toBeInTheDocument()
  })

  it('la stampante non è più una voce di menu, gli utenti sì', () => {
    apri()
    expect(screen.queryByText('Stampante')).toBeNull()
    expect(screen.getByText('Utenti e ruoli')).toBeInTheDocument()
    // "Vista cliente" era un tasto in barra: la navigazione sta nel menu.
    expect(screen.getByText('Vista cliente')).toBeInTheDocument()
    expect(screen.getByText('Staff')).toBeInTheDocument()
  })

  it('lo staff di sala non vede il gestionale, ma lavora sulla stessa coda', () => {
    apri('staff')
    expect(screen.queryByText('Utenti e ruoli')).toBeNull()
    // La home della sala è la coda del banco; «I miei ordini» non è più
    // una pagina (è il filtro «Miei» della coda), «Da servire» resta.
    expect(screen.getByText('Coda ordini')).toBeInTheDocument()
    expect(screen.getByText('Da servire')).toBeInTheDocument()
    expect(screen.queryByText('I miei ordini')).toBeNull()
    expect(screen.getByText('Staff')).toBeInTheDocument() // il suo ruolo, in fondo
  })

  it('per la sala «Nuovo ordine» apre il menù, non il POS', async () => {
    // Il POS è lo strumento del banco: la sala ordina dal menù che sta
    // mostrando al tavolo, con la ricerca.
    apri('staff')
    await userEvent.click(screen.getByText('Nuovo ordine dal menù'))
    expect(screen.getByText('PAGINA MENU')).toBeInTheDocument()
  })

  // ── IL BILANCIO È DELL'ADMIN ───────────────────────────────────────
  // I conti del locale li guarda chi il locale lo paga. Prima il menu si
  // filtrava tutto con `isGestore`, che tiene dentro anche il bartender:
  // questa è la prima voce che vuole un filtro più stretto.
  it('«Bilancio» lo vede l’admin', () => {
    apri('admin')
    expect(screen.getByText('Bilancio')).toBeInTheDocument()
  })

  it('al bartender la voce «Bilancio» non compare', () => {
    apri('bartender')
    expect(screen.queryByText('Bilancio')).toBeNull()
    // Il resto del gestionale resta suo.
    expect(screen.getByText('Cassa')).toBeInTheDocument()
    expect(screen.getByText('Magazzino')).toBeInTheDocument()
  })

  it('per il gestore «Nuovo ordine» apre il POS', async () => {
    apri('admin')
    await userEvent.click(screen.getByText('Nuovo ordine'))
    expect(screen.getByText('PAGINA POS')).toBeInTheDocument()
  })
})

// ── IL MENU AGGANCIATO ALLA PAGINA ───────────────────────────────────
// Dove la pagina ha sezioni sue (Impostazioni, Inventario) il menu resta
// aperto dentro la pagina: si salta da una sezione all'altra venti volte di
// seguito, e un menu che copre vuol dire aprirlo, cercare, scegliere — e
// intanto non vedere piu' dove si era. Chi vuole tutta la larghezza lo
// chiude, e resta chiuso anche domani.
describe('il menu agganciato alla pagina', () => {
  const SEZIONI = [
    { id: 'aspetto', icona: '🎨', label: 'Aspetto' },
    { id: 'stampante', icona: '🖨️', label: 'Stampante' },
  ]

  function conSezioni(voci = SEZIONI) {
    return render(
      <MemoryRouter initialEntries={['/bar']}>
        <StaffDrawer role="admin" active="impostazioni" />
        <Sottosezioni voci={voci} attiva="aspetto" scegli={() => {}} />
      </MemoryRouter>
    )
  }

  it('con le sezioni della pagina il menu e’ gia’ aperto, senza toccare niente', () => {
    conSezioni()
    expect(document.body.classList.contains('drawer-agganciato')).toBe(true)
    expect(document.querySelector('.bar-sidebar.agganciata')).toBeTruthy()
  })

  // LA MANIGLIA. Le voci sono parole corte, le sottosezioni no —
  // «Marginalità listino» a 178px si taglia — e su un monitor grande quella
  // colonna stretta è spazio sprecato. Cresce tutto insieme, testo
  // compreso: una colonna larga con la scritta piccola sembra rotta.
  it('il menu agganciato si allarga tirando il bordo, e se lo ricorda', () => {
    conSezioni()
    const menu = document.querySelector('.bar-sidebar.agganciata')
    const maniglia = document.querySelector('.bar-sidebar-maniglia')
    expect(maniglia).toBeTruthy()
    expect(menu.style.width).toBe('178px')

    fireEvent.pointerDown(maniglia, { clientX: 200 })
    fireEvent.pointerMove(maniglia, { clientX: 300 })
    fireEvent.pointerUp(maniglia, { clientX: 300 })

    expect(document.querySelector('.bar-sidebar.agganciata').style.width).toBe('278px')
    // Il testo cresce con la colonna.
    expect(parseFloat(document.querySelector('.bar-sidebar.agganciata').style.fontSize)).toBeGreaterThan(0.85)
    expect(localStorage.getItem('tana:menu-largo')).toBe('278')
  })

  it('non si può tirare oltre misura: mezza pagina di menu non serve a nessuno', () => {
    conSezioni()
    const maniglia = document.querySelector('.bar-sidebar-maniglia')
    fireEvent.pointerDown(maniglia, { clientX: 200 })
    fireEvent.pointerMove(maniglia, { clientX: 2000 })
    fireEvent.pointerUp(maniglia, { clientX: 2000 })
    expect(document.querySelector('.bar-sidebar.agganciata').style.width).toBe('360px')
  })

  it('doppio clic sulla maniglia: si torna alla misura di partenza', () => {
    localStorage.setItem('tana:menu-largo', '300')
    conSezioni()
    expect(document.querySelector('.bar-sidebar.agganciata').style.width).toBe('300px')
    fireEvent.doubleClick(document.querySelector('.bar-sidebar-maniglia'))
    expect(document.querySelector('.bar-sidebar.agganciata').style.width).toBe('178px')
  })

  it('sulle pagine senza sezioni resta a scomparsa: la coda non perde una colonna', () => {
    render(
      <MemoryRouter initialEntries={['/bar']}>
        <StaffDrawer role="admin" active="coda" />
      </MemoryRouter>
    )
    expect(document.body.classList.contains('drawer-agganciato')).toBe(false)
  })

  // SI APRE E SI CHIUDE COL ☰, come ovunque: non c'è un secondo tasto per
  // «agganciarlo». A chi lavora interessa che il menu ci sia o non ci sia;
  // che resti dentro la pagina invece di coprirla è come si presenta.
  const tocca = () => act(() => { window.dispatchEvent(new Event('tana:toggle-drawer')) })

  it('il ☰ lo chiude e lo riapre, sempre dentro la pagina', () => {
    conSezioni()
    tocca()
    expect(document.body.classList.contains('drawer-agganciato')).toBe(false)
    // Chiuso vuol dire chiuso: non ricompare come pannello che copre.
    expect(document.querySelector('.bar-sidebar.open')).toBeNull()
    tocca()
    expect(document.body.classList.contains('drawer-agganciato')).toBe(true)
  })

  it('chiuso una volta, resta chiuso anche la volta dopo', () => {
    const primo = conSezioni()
    tocca()
    primo.unmount()
    conSezioni()
    expect(document.body.classList.contains('drawer-agganciato')).toBe(false)
  })

  it('dove non si aggancia, il ☰ apre il pannello come sempre', () => {
    render(
      <MemoryRouter initialEntries={['/bar']}>
        <StaffDrawer role="admin" active="coda" />
      </MemoryRouter>
    )
    tocca()
    expect(document.querySelector('.bar-sidebar.open')).toBeTruthy()
    expect(document.body.classList.contains('drawer-agganciato')).toBe(false)
  })
})

// ── IL ☰ FLOTTANTE SI PUÒ SPEGNERE ───────────────────────────────────
//
// Serve alle schermate a tutto schermo che una testata loro non ce l'hanno.
// Dove la testata c'è — la lavagna della coda — il ☰ sta lì dentro, nel
// flusso, e questo va spento: due ☰ sulla stessa schermata sono uno di
// troppo, e uno fisso sopra una pagina che scorre finisce addosso a quello
// che scorre («il tasto menu va a finire sulla label», l'utente 21/08/2026).
describe('il ☰ flottante del menu laterale', () => {
  it('di suo c’è: le schermate senza testata si aprono il menu da lì', () => {
    render(
      <MemoryRouter initialEntries={['/bar']}>
        <StaffDrawer role="admin" active="coda" />
      </MemoryRouter>
    )
    expect(document.querySelector('.bar-burger')).toBeTruthy()
  })

  it('e si spegne per chi il ☰ ce l’ha già in testata', () => {
    render(
      <MemoryRouter initialEntries={['/bar']}>
        <StaffDrawer role="admin" active="coda" flottante={false} />
      </MemoryRouter>
    )
    expect(document.querySelector('.bar-burger')).toBeNull()
    // il menu resta apribile dall'evento: è lo stesso tasto, altrove
    expect(document.querySelector('.bar-sidebar')).toBeTruthy()
  })
})
