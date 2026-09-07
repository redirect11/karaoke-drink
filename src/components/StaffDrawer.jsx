import { useEffect, useRef, useState } from 'react'

// Quanto può essere largo il menu agganciato. Sotto i 150px le voci si
// spezzano; sopra i 360 si mangia la pagina.
const MENU_DEFAULT = 178
const MIN_MENU = 150
const MAX_MENU = 360
import { useNavigate } from 'react-router-dom'
import { auth } from '../lib/firebaseClient.js'
import { logoutStaff } from '../lib/logout.js'
import { devToolsEnabled } from '../dev/devActions.js'
import { isGestore, RUOLO_ETICHETTA } from '../lib/ruoli.js'
import { useSchermoLargo } from '../lib/useTelefono.js'
import { usePaginaPiena } from '../lib/paginaPiena.js'
import { IconGruppo, IconPersona } from './Icons.jsx'
import VersionBadge from './VersionBadge.jsx'
import {
  subscribeSettings,
  subscribeOpenGroups,
  createManualGroup,
  DEFAULT_SETTINGS,
} from '../lib/api.js'
// Le voci stanno in un posto solo: le stesse fanno il titolo nella barra.
import { vociPerRuolo } from '../lib/sezioni.js'
import { subscribeSottosezioni } from '../lib/sottosezioni.js'

// Menu laterale dello staff: usato nel gestionale (onSelect cambia tab)
// e nella vista menu per l'ordinazione manuale (naviga a /bar?tab=…).
//
// `flottante`: il ☰ nell'angolo, per le schermate a tutto schermo dove la
// topbar non c'è. Chi ha una testata sua — la lavagna della coda — lo mette
// dentro quella (`.board-burger`) e qui lo spegne: un tasto fisso sopra una
// pagina che scorre finisce prima o poi su quello che c'è scritto sotto.
export default function StaffDrawer({ role, active = null, onSelect = null, flottante = true }) {
  const [open, setOpen] = useState(false)
  // I gruppi restano chiusi finché non li si apre, e la scelta si ricorda:
  // chi lavora a gruppi non deve riaprirli a ogni giro.
  // Le sottosezioni della pagina aperta: le dichiara la pagina stessa.
  const [sotto, setSotto] = useState({ voci: [], attiva: null, scegli: null })
  useEffect(() => subscribeSottosezioni(setSotto), [])
  const [gruppiAperti, setGruppiAperti] = useState(
    () => localStorage.getItem('tana:drawer-gruppi') === '1'
  )
  // ── IL MENU AGGANCIATO ALLA PAGINA ────────────────────────────────
  // Dove la pagina ha delle sezioni sue (Impostazioni, Inventario) e c'è
  // posto, il menu è APERTO come parte della pagina: il contenuto si
  // stringe per fargli posto invece di finirci sotto. Lì dentro si salta da
  // una sezione all'altra venti volte di seguito, e un menu che copre
  // significa aprire, cercare, scegliere — e intanto non vedere più dove si
  // era.
  //
  // SI APRE E SI CHIUDE COL ☰, come ovunque. Un secondo tasto per
  // "agganciare" sarebbe una cosa in più da capire per una differenza che a
  // chi lavora non interessa: il menu c'è o non c'è. Che poi resti aperto
  // dentro la pagina invece di coprirla è come si presenta, non un'altra
  // funzione. La scelta resta anche domani.
  const [agganciato, setAgganciato] = useState(
    () => localStorage.getItem('tana:drawer-agganciato') !== '0'
  )
  // Dove il menu può stare dentro la pagina: sezioni proprie da mostrare e
  // schermo abbastanza largo (sul telefono sarebbe mezzo schermo).
  const largo = useSchermoLargo()
  const agganciabile = largo && sotto.voci.length > 0
  const navigate = useNavigate()
  const utente = auth.currentUser
  const nomeUtente = utente?.displayName || String(utente?.email || '').split('@')[0] || 'Il mio profilo'

  useEffect(() => {
    try {
      localStorage.setItem('tana:drawer-gruppi', gruppiAperti ? '1' : '0')
    } catch {
      /* niente memoria: valgono per questa sessione */
    }
  }, [gruppiAperti])

  // Il menu si apre dal ☰ della TOPBAR (che sta in App.jsx): il tasto flottante
  // resta solo nelle schermate a tutto schermo, dove la topbar è nascosta.
  // Lo stesso tasto fa la stessa cosa nei due modi: dove il menu è parte
  // della pagina apre e chiude quella colonna, altrove apre e chiude il
  // pannello che scorre sopra.
  useEffect(() => {
    const h = () => {
      if (agganciabile) setAgganciato((v) => !v)
      else setOpen((o) => !o)
    }
    window.addEventListener('tana:toggle-drawer', h)
    return () => window.removeEventListener('tana:toggle-drawer', h)
  }, [agganciabile])

  // Col menu aperto i tasti dello zoom devono passare DIETRO: stanno in
  // basso a sinistra, cioè esattamente sopra le ultime voci (Esci).
  useEffect(() => {
    document.body.classList.toggle('drawer-open', open)
    return () => document.body.classList.remove('drawer-open')
  }, [open])

  // Solo le pagine con sezioni proprie tengono il menu agganciato: sulla
  // coda ordini sarebbe una colonna in meno di conti. La classe sta sul
  // body perché a diventare una riga dev'essere la PAGINA, che sta in un
  // altro componente; sul telefono il CSS la ignora — lì una colonna fissa
  // sarebbe mezzo schermo.
  const dock = agganciato && agganciabile
  useEffect(() => {
    document.body.classList.toggle('drawer-agganciato', dock)
    return () => document.body.classList.remove('drawer-agganciato')
  }, [dock])

  // OGNUNO SCORRE PER CONTO SUO. Col menu dentro la pagina, scorrendo il
  // contenuto scorreva via anche il menu: le due colonne erano una pagina
  // sola, alta quanto il contenuto. Qui si accende la catena delle altezze
  // (lib/paginaPiena.js): la schermata sta nella finestra, e a scorrere
  // sono il menu e il contenuto, separatamente.
  usePaginaPiena(dock)

  // CHIUDENDOLO NON DEVE PASSARE IL PANNELLONE. Togliendo l'aggancio il
  // menu torna per un istante quello a scomparsa — largo, fisso — e si
  // vedeva la SUA animazione di uscita scorrere via da sinistra. Per quel
  // momento l'animazione si spegne: il menu agganciato se ne va e basta.
  // LA MANIGLIA: il menu agganciato si allarga e si stringe tirando il suo
  // bordo destro. Le voci sono parole («Cassa», «Magazzino») ma le
  // sottosezioni no — «Marginalità listino» a 178px va a capo o si taglia —
  // e su un monitor grande quella colonna stretta è solo spazio sprecato.
  // Cresce tutto insieme, testo compreso: una colonna larga con la scritta
  // piccola in mezzo sembra rotta.
  const [largh, setLargh] = useState(() => {
    const v = Number(localStorage.getItem('tana:menu-largo'))
    return v >= MIN_MENU && v <= MAX_MENU ? v : MENU_DEFAULT
  })
  const tiraDaX = useRef(null)
  const tira = (e) => {
    e.preventDefault()
    tiraDaX.current = { x0: e.clientX, l0: largh }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const muovi = (e) => {
    if (!tiraDaX.current) return
    const { x0, l0 } = tiraDaX.current
    setLargh(Math.min(MAX_MENU, Math.max(MIN_MENU, Math.round(l0 + (e.clientX - x0)))))
  }
  const lascia = () => {
    if (!tiraDaX.current) return
    tiraDaX.current = null
    try {
      localStorage.setItem('tana:menu-largo', String(largh))
    } catch {
      /* niente memoria: la larghezza vale per questa sessione */
    }
  }

  const [stacco, setStacco] = useState(false)
  const primoGiro = useRef(true)
  useEffect(() => {
    if (primoGiro.current) {
      primoGiro.current = false
      return undefined
    }
    setStacco(true)
    const t = setTimeout(() => setStacco(false), 260)
    return () => clearTimeout(t)
  }, [dock])

  useEffect(() => {
    try {
      localStorage.setItem('tana:drawer-agganciato', agganciato ? '1' : '0')
    } catch {
      /* niente memoria: vale per questa volta */
    }
  }, [agganciato])

  // Gruppi nel drawer (quadratini): attivi se l'impostazione lo prevede.
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [groups, setGroups] = useState([])
  const [newName, setNewName] = useState('')
  useEffect(() => subscribeSettings(setSettings, () => {}), [])
  const showGroups = settings.groups_enabled && settings.groups_in_drawer
  useEffect(() => {
    if (!showGroups) {
      setGroups([])
      return
    }
    return subscribeOpenGroups(setGroups, () => {})
  }, [showGroups])
  // Solo gruppi che possono ricevere ordini diretti (no contenitori).
  const groupTiles = groups.filter((g) => !g.has_child_groups)

  // Chi vede quali voci lo decide sezioni.js: non tutte sono di tutto il
  // gestionale (il Bilancio è dell'admin) e non tutte ci sono in questa
  // installazione (le funzioni premium, REQ-LIC-001). Il filtro sta dove
  // sta l'elenco, e le impostazioni gliele passa chi le ha già in mano.
  const base = vociPerRuolo(role, settings)
  const items = isGestore(role) && devToolsEnabled ? [...base, ['dev', '🛠', 'Dev']] : base

  function go(id) {
    setOpen(false)
    // "Vista cliente" non è una sezione del gestionale: è il menù come lo
    // vede chi ordina. Era un tasto in barra, ma la navigazione sta qui.
    // ?vista=cliente: il menù COM'È PER CHI ORDINA. Senza, un membro del
    // personale che apre /menu trova il proprio strumento per gli ordini
    // manuali — utile, ma non è la vista cliente.
    if (id === 'vista-cliente') return navigate('/menu?vista=cliente')
    if (onSelect) onSelect(id)
    else navigate(id === 'servizio' ? '/bar' : `/bar?tab=${id}`)
  }

  function nuovoOrdine() {
    setOpen(false)
    // Per i gestori la creazione ordine è la CASSA in stile POS (segue il
    // tema staff). La sala invece ordina DAL MENÙ: lo stesso che mostra al
    // tavolo, con la ricerca — il POS è lo strumento del banco.
    navigate(isGestore(role) ? '/pos' : '/menu')
  }

  // Toccando un gruppo si aprono i SUOI ORDINI nella coda (non si entra
  // a comporre un ordine: da lì semmai si aggiunge).
  function apriGruppo(id) {
    setOpen(false)
    navigate(`/bar?group=${id}`)
  }

  async function creaGruppo() {
    const name = newName.trim()
    if (!name) return
    const u = auth.currentUser
    const g = await createManualGroup({
      name,
      created_by: u ? { uid: u.uid, email: u.email, role } : null,
    }).catch(() => null)
    setNewName('')
    if (g) apriGruppo(g.id)
  }

  return (
    <>
      {flottante && (
        <button className="bar-burger" aria-label="Menu" onClick={() => setOpen(true)}>
          ☰
        </button>
      )}
      <div className={`bar-nav-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <nav
        className={`bar-sidebar${open ? ' open' : ''}${dock ? ' agganciata' : ''}${
          stacco ? ' stacco' : ''
        }`}
        // Il testo cresce con la colonna: dentro il menu le misure sono in
        // «em», quindi basta questa.
        style={dock ? { width: largh, fontSize: `${(0.85 * largh) / MENU_DEFAULT}rem` } : undefined}
      >
        <div className="brand-mini">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
          Gestionale
        </div>
        {/* IL SECONDO LIVELLO STA QUI DENTRO, sotto la pagina in cui ci si
            trova. È il modo in cui si fa di solito con un menu a scomparsa:
            un posto solo per navigare, uguale sul telefono e sul computer,
            invece di schede in barra (che sopra le cinque voci non ci
            stanno) o di una colonna in pagina (che costa spazio tutto il
            giorno). Le sottosezioni compaiono per la pagina APERTA: sono le
            uniche che si conoscono senza esserci passati. */}
        {items.map(([id, icon, label]) => (
          <div key={id}>
            <div
              className={`bar-nav-item${active === id ? ' active' : ''}`}
              onClick={() => go(id)}
            >
              <span>{icon}</span> {label}
            </div>
            {active === id && sotto.voci.length > 0 && (
              <div className="bar-nav-sotto">
                {sotto.voci.map((v) => (
                  <div
                    key={v.id}
                    className={`bar-nav-item bar-nav-sottovoce${
                      v.id === sotto.attiva ? ' active' : ''
                    }`}
                    onClick={() => {
                      sotto.scegli?.(v.id)
                      setOpen(false)
                    }}
                  >
                    <span>{v.icona}</span> {v.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="bar-nav-sep" />
        <div
          className={`bar-nav-item${active === 'ordine' ? ' active' : ''}`}
          onClick={nuovoOrdine}
        >
          <span>✍️</span> {isGestore(role) ? 'Nuovo ordine' : 'Nuovo ordine dal menù'}
        </div>

        {showGroups && (
          <div className="drawer-groups">
            {/* A SCOMPARSA. I gruppi sono pochi ma occupano molto (riquadri
                a due colonne) e spingevano "Esci" e il resto fuori vista.
                Chiusi di default: chi li usa li apre, e la scelta resta. */}
            <button
              type="button"
              className={`drawer-groups-title${gruppiAperti ? ' aperto' : ''}`}
              onClick={() => setGruppiAperti((v) => !v)}
              aria-expanded={gruppiAperti}
            >
              <span className="drawer-groups-freccia">▸</span>
              Gruppi
              {groupTiles.length > 0 && <span className="drawer-groups-conto">{groupTiles.length}</span>}
            </button>
            {gruppiAperti && (
              <>
                <div className="group-tiles">
                  {groupTiles.map((g) => (
                    <button
                      key={g.id}
                      className="group-tile"
                      title={g.name}
                      onClick={() => apriGruppo(g.id)}
                    >
                      <span className="group-tile-ic">
                        {g.kind === 'customer' ? <IconPersona /> : <IconGruppo />}
                      </span>
                      <span className="group-tile-name">{g.name}</span>
                    </button>
                  ))}
                </div>
                <div className="row" style={{ gap: 6, padding: '0 14px', marginTop: 8 }}>
                  <input
                    type="text"
                    placeholder="+ Nuovo gruppo"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && creaGruppo()}
                  />
                  <button
                    className="btn small"
                    style={{ flexShrink: 0 }}
                    onClick={creaGruppo}
                    disabled={!newName.trim()}
                  >
                    Crea
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="bar-nav-sep" />
        {/* CHI È COLLEGATO. Serve al bar con più persone e un dispositivo
            solo: prima di battere un ordine si vede a nome di chi va, e con
            un tocco si apre il profilo (nome, password). */}
        <div
          className={`bar-nav-item drawer-io${active === 'profilo' ? ' active' : ''}`}
          onClick={() => {
            setOpen(false)
            navigate('/profilo-staff')
          }}
        >
          <span>{RUOLO_ETICHETTA[role]?.split(' ')[0] ?? '🙋'}</span>
          <span className="drawer-io-testo">
            <span className="drawer-io-nome">{nomeUtente}</span>
            <span className="drawer-io-ruolo">
              {(RUOLO_ETICHETTA[role] ?? 'Utente').replace(/^\S+\s/, '')}
            </span>
          </span>
        </div>
        <div className="bar-nav-item" onClick={() => logoutStaff()}>
          <span>🚪</span> Esci
        </div>
        {/* Ramo e commit del deploy: con più branch che passano a turno
            sullo stesso ambiente di test, serve sapere cosa si sta
            guardando prima di dire "non funziona". */}
        <VersionBadge className="drawer-versione" />
      </nav>
      {/* LA MANIGLIA STA FUORI DAL MENU. Dentro scorreva col contenuto e
          finiva sotto la barra di scorrimento: per prenderla bisognava
          azzeccare due pixel. Qui è una colonna sua, alta quanto la pagina,
          fra il menu e il contenuto. */}
      {dock && (
        <div
          className="bar-sidebar-maniglia"
          role="separator"
          aria-label="Larghezza del menu"
          title="Trascina per allargare · doppio clic per rimetterlo com'era"
          onPointerDown={tira}
          onPointerMove={muovi}
          onPointerUp={lascia}
          onPointerCancel={lascia}
          onDoubleClick={() => {
            // Doppio clic: si torna alla misura di partenza. Tirandola
            // troppo si finisce con mezza pagina di menu, e rimetterla a
            // occhio è una seccatura.
            setLargh(MENU_DEFAULT)
            try {
              localStorage.setItem('tana:menu-largo', String(MENU_DEFAULT))
            } catch {
              /* pazienza */
            }
          }}
        />
      )}

    </>
  )
}
