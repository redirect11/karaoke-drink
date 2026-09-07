import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from '../lib/firebaseClient.js'
import {
  updateOrderStatus,
  markOrderPaid,
  cancelOrder,
  subscribeActiveOrders,
  subscribeSettings,
  DEFAULT_SETTINGS,
  settingsIniziali,
  saveStaffToken,
  restoreOrder,
  advanceComanda,
  setOrderColore,
  segnalaPresenza,
  subscribePresenze,
  segnaComandaStampata,
  segnaScontrinoStampato,
} from '../lib/api.js'
import { getPushToken } from '../lib/push.js'
import { logoutStaff } from '../lib/logout.js'
import {
  ORDER_STATUSES,
  STATUS_LABELS,
  STATUS_EMOJI,
  formatPrice,
  nextStatus,
  statoAlBanco,
  AVVISO_NUOVO_ORDINE,
  AVVISO_RIPRISTINO,
  placedByName,
  placedByLetter,
} from '../lib/orderStatus.js'
import {
  bucketByStatus,
  ordersRecap,
  ordineCorrisponde,
  primoCorrispondente,
  restaInCoda,
  ordiniInCoda,
  contiPerScheda,
  SCHEDE_VUOTE,
  voceCassa,
  comandeDaServire,
  haLavoroDaFare,
  gruppiInCoda,
  schedeCoda,
  corsieDiStato,
  corsieComande,
  attesaPagamento,
  corsieDaMostrare,
  corsieSceglibili,
  gruppiColonne,
  soloCorsieVive,
  intestazioneGiornata,
  giornataDelConto,
  raggruppaPerGiornata,
  corsieDelPronto,
  CORSIE_PRONTO_DIVISO,
  CORSIE_SPENTE_ALL_INIZIO,
  sottofiltriChiusi,
  nomiDelServizio,
  FILTRI_STATO,
  STATO_DEFAULT,
  frasePerCodaVuota,
  autoriDeiConti,
  autoriAttivi,
  cambiaAutoreScelto,
  conAutori,
  riassuntoAutori,
  cambiaSottoChiusi,
  AUTORE_CLIENTE,
  spiegaFiltri,
  spiegaOrdine,
} from '../lib/coda.js'
import { StoriaOrdineDialog, RipristinaOrdineDialog } from '../components/StoriaOrdine.jsx'
import { useTelefono } from '../lib/useTelefono.js'
import StatusBell from '../components/StatusBell.jsx'
import Tendina from '../components/Tendina.jsx'
import ActionSheet from '../components/ActionSheet.jsx'
import {
  isBanco,
  isGestore,
  isPersonale,
  puoGestireComande,
  puoSegnare,
} from '../lib/ruoli.js'
import { sezioneConsentita } from '../lib/sezioni.js'
import { senzaNascosti, subscribeNascosti, mostraOrdine } from '../lib/ordiniNascosti.js'
import { battutoDaQui, annullatoDaQui, ripristinatoDaQui, idDispositivo } from '../lib/dispositivo.js'
import {
  corsieNascoste,
  ricordaCorsieNascoste,
  vistaCorsie,
  ricordaVistaCorsie,
  prontoDiviso,
  ricordaProntoDiviso,
  filtriAperti,
  ricordaFiltriAperti,
} from '../lib/impostazioniLocali.js'
import {
  fraseAnnulloDefault,
  fraseAnnulloPossibile,
  mondoConsegna,
} from '../lib/consegna.js'
import {
  leggiAvvisi,
  subscribeAvvisi,
  avvisoAttivo,
  idAvvisoStato,
} from '../lib/preferenzeNotifiche.js'
import {
  activeComanda,
  allServed,
  comandaDivisibile,
  contoChiuso,
  nextComandaStatus,
  statiPrimaComanda,
  statoComandaNuova,
  statoDiLavoro,
} from '../lib/comande.js'
import { useComandeLocali } from '../lib/comandeLocali.js'
import { ricordaRuolo } from '../lib/ruoloLocale.js'
import { paidAmount, orderTotal, scontoTotale } from '../lib/pagamento.js'
import { businessDayKey, businessDayLabel, businessDayShort } from '../lib/businessDay.js'
import { isAwaitingPayment } from '../lib/payments.js'
import { readerCheckout, readerTerminate } from '../lib/paymentsApi.js'
import { ensureNotificationPermission, notify } from '../lib/notify.js'
import { showToast } from '../lib/toast.js'
import { beep, installAudioUnlock } from '../lib/beep.js'
import { subscribePending, dismissPending, dismissBanner } from '../lib/pendingOrders.js'
import { printComanda, printScontrino, loadPrinterSettings, reclaimReceiptPrint, releaseReceiptPrint, scontrinoGiaUscito, comandeDaStampare, claimComandaPrint, releaseComandaPrint } from '../lib/printer.js'
import MenuManager from '../components/MenuManager.jsx'
import PrinterSetup from '../components/PrinterSetup.jsx'
import InventoryManager from '../components/InventoryManager.jsx'
import FornitoriTab from '../components/FornitoriTab.jsx'
import SettingsTab from '../components/SettingsTab.jsx'
import PallinoStampante from '../components/PallinoStampante.jsx'
import StatsTab from '../components/StatsTab.jsx'
import BilancioTab from '../components/BilancioTab.jsx'
import StaffHoursTab from '../components/StaffHoursTab.jsx'
import UtentiTab from '../components/UtentiTab.jsx'
import VipTab from '../components/VipTab.jsx'
import ServiceQueue from '../components/ServiceQueue.jsx'
import StaffCallList from '../components/StaffCallList.jsx'
import Caricamento from '../components/Caricamento.jsx'
import { ModaleColoreConto, TastoColoreConto, voceColoreConto } from '../components/Corsia.jsx'
import { coloreCardConto } from '../lib/coloriConto.js'
import { legendaConPresenze, BATTITO_PRESENZA_MS } from '../lib/presenza.js'
import CorsieStato from '../components/CorsieStato.jsx'
import CorsieComande from '../components/CorsieComande.jsx'
import OrderBy from '../components/OrderBy.jsx'
import FumettoAvvisi from '../components/FumettoAvvisi.jsx'
import CampoPassword from '../components/CampoPassword.jsx'
import ApriCassaBox from '../components/ApriCassaBox.jsx'
import ChiudiCassaBox from '../components/ChiudiCassaBox.jsx'
import GroupsPanel from '../components/GroupsPanel.jsx'
import GroupView from '../components/GroupView.jsx'
import CassaTab from '../components/CassaTab.jsx'
import InvoicesTab from '../components/InvoicesTab.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import CancelOrderDialog from '../components/CancelOrderDialog.jsx'
import DevTools from '../components/DevTools.jsx'
import StaffDrawer from '../components/StaffDrawer.jsx'
import { devToolsEnabled } from '../dev/devActions.js'
import { preloadStaff } from '../lib/staffApi.js'
import { useCashSession } from '../lib/cashSession.js'

// Badge accanto al numero d'ordine: la LETTERA del dipendente che l'ha aperto,
// oppure il segno del CLIENTE se l'ha aperto lui dall'app.
// Colore della striscia laterale della card per STATO dell'ordine (non della
// preparazione): aperto · pagato parzialmente · pagato · annullato.
const annullato = (o) =>
  o.status === ORDER_STATUSES.ANNULLATO || o.workflow_status === ORDER_STATUSES.ANNULLATO

function orderStripClass(o) {
  if (o.status === ORDER_STATUSES.ANNULLATO || o.workflow_status === ORDER_STATUSES.ANNULLATO)
    return 'pay-annullato'
  if (o.payment_status === 'pagato') return 'pay-pagato'
  if (o.payment_status === 'parziale') return 'pay-parziale'
  return 'pay-aperto'
}

export default function BartenderPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(undefined) // undefined = caricamento, null = non loggato
  const [role, setRole] = useState(null) // 'admin' | 'bartender' | 'staff' | 'cliente'
  // Tab iniziale anche da query (?tab=stats): usato dal drawer nel menu.
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(() => params.get('tab') || 'coda')
  // La sezione segue SEMPRE l'indirizzo, in entrambi i versi. Prima si
  // aggiornava solo quando il parametro c'era: tornando a /bar (che è la
  // coda, senza parametro) la pagina restava sulla sezione di prima, e
  // "← Ordini" o il tasto indietro sembravano non fare niente — l'indirizzo
  // cambiava, la schermata no.
  const tabParam = params.get('tab')
  // Le impostazioni del locale servono a sapere quali sezioni ESISTONO qui:
  // le funzioni premium (REQ-LIC-001) tolgono voci a tutti, non a un ruolo.
  // Dalla cache, come ovunque: nessuna lettura nuova, e nessuna sezione che
  // lampeggia in attesa del server.
  const [impostazioni, setImpostazioni] = useState(settingsIniziali)
  useEffect(() => subscribeSettings(setImpostazioni, () => {}), [])
  useEffect(() => {
    setTab(tabParam || 'coda')
  }, [tabParam])
  // Cambiando sezione dal menu si aggiorna ANCHE l'indirizzo: così indirizzo e
  // sezione restano sempre d'accordo e le scorciatoie (es. "Lista ordini" dal
  // Flusso cassa) funzionano anche se ci si era già passati.
  const goTab = (id) => {
    setTab(id)
    const next = new URLSearchParams(params)
    if (id === 'coda') next.delete('tab')
    else next.set('tab', id)
    // PUSH (non replace): ogni sezione entra nella cronologia, così il tasto
    // indietro — del browser o dell'app — torna alla sezione precedente e non
    // salta fuori dal gestionale.
    setParams(next)
  }

  // E L'INDIRIZZO SI RIMETTE IN PARI. Il titolo nella barra lo legge dalla
  // query (lib/sezioni.js) e non conosce il ruolo: senza questo, un
  // bartender su `?tab=bilancio` vedrebbe la coda con scritto «Bilancio»
  // sopra. `replace`, non push: il tasto indietro deve uscire dal
  // gestionale, non rimbalzare su un indirizzo che non si può aprire.
  useEffect(() => {
    if (!isGestore(role) || sezioneConsentita(tabParam, role, impostazioni)) return
    const next = new URLSearchParams(params)
    next.delete('tab')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam, role, impostazioni])

  // L'elenco dello staff passa da una Cloud Function: lo si scalda appena si
  // entra nel gestionale, così quando si aprono i pannelli i nomi ci sono già
  // invece di comparire dopo un "Carico lo staff…".
  useEffect(() => {
    if (isGestore(role)) preloadStaff()
  }, [role])

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null)
        setRole(null)
        return
      }
      // Ruolo dai custom claims: senza claim è un CLIENTE registrato
      // (nessun accesso al gestionale).
      //
      // IL RUOLO VIVE DENTRO IL TOKEN, E IL TOKEN DURA UN'ORA. Chi era già
      // collegato quando gli è cambiato il ruolo continua a girare con
      // quello vecchio: le regole del database guardano il token, non
      // l'anagrafica, e il risultato è una schermata che carica il menù ma
      // non la cassa, con "permessi insufficienti" sparso in giro — un
      // guaio da capire, in mezzo al servizio.
      //
      // Quindi: prima quello che c'è (istantaneo, la schermata si apre
      // subito), poi SEMPRE uno fresco in sottofondo. Se il ruolo è
      // cambiato, la pagina si allinea da sola in un secondo.
      try {
        const ruolo = (await u.getIdTokenResult()).claims.role ?? 'cliente'
        setRole(ruolo)
        ricordaRuolo(u.uid, ruolo)
        u.getIdTokenResult(true)
          .then((t) => {
            const aggiornato = t.claims.role ?? 'cliente'
            ricordaRuolo(u.uid, aggiornato)
            if (aggiornato !== ruolo) setRole(aggiornato)
          })
          .catch(() => {
            /* offline: si tiene quello in tasca, è comunque valido */
          })
      } catch {
        setRole('cliente')
      }
      setUser(u)
    })
  }, [])

  // Il GESTIONALE usa tutta la larghezza della pagina (liste, tabelle e
  // statistiche stavano strette nei 760px pensati per il lato cliente).
  // L'header col logo resta: niente fullbleed, che lo nasconderebbe.
  const wideTab = isPersonale(role)
  useEffect(() => {
    if (!wideTab) return undefined
    document.body.classList.add('bar-wide')
    // Cinturino di sicurezza: le sezioni del gestionale NON sono mai a tutto
    // schermo. Se la classe è rimasta appiccicata da una schermata precedente
    // (coda a griglia, POS), la topbar sparirebbe e resterebbero due ☰.
    if (tab !== 'coda') document.body.classList.remove('fullbleed')
    return () => document.body.classList.remove('bar-wide')
  }, [wideTab, tab])

  if (user === undefined || (user && role === null)) {
    return <Caricamento testo="Ti sto facendo entrare…" />
  }
  if (!user) return <LoginForm />

  // Cliente registrato: nessun accesso al gestionale.
  if (role === 'cliente') {
    return (
      <div className="empty">
        🔒 Quest’area è riservata allo staff.
        <br />
        {/* Anche da qui si esce dalla porta giusta: il signOut secco
            lasciava la timbratura aperta e questo terminale nella rubrica
            degli avvisi. */}
        <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => logoutStaff()}>
          Esci e accedi come staff
        </button>
      </div>
    )
  }

  // LA SALA LAVORA SULLA STESSA CODA DEL BANCO. Aveva due pagine sue («Da
  // servire» e «I miei ordini») e non vedeva mai quello che vedeva il
  // bartender: ora la home è la stessa coda del gestionale, «I miei
  // ordini» è diventato il filtro «Miei» della coda (il vecchio indirizzo
  // ?tab=miei-ordini ci arriva col filtro già acceso) e «Da servire»
  // resta come sezione. Tutto il resto è roba da gestori: un tab non suo
  // riporta alla coda.
  const salaMiei = !isGestore(role) && tab === 'miei-ordini'
  // Una sezione riservata non si apre nemmeno scrivendo l'indirizzo a mano:
  // il Bilancio è dell'admin, e un bartender che arriva su `?tab=bilancio`
  // — collegamento salvato, indirizzo battuto — si ritrova sulla coda,
  // senza una schermata che si apre per dirgli «non puoi».
  const tabEffettivo = !isGestore(role)
    ? tab === 'servizio'
      ? 'servizio'
      : 'coda'
    : sezioneConsentita(tab, role, impostazioni)
      ? tab
      : 'coda'

  return (
    // La classe serve alla catena delle altezze: da qui in giù, quando la
    // pagina deve stare tutta nella finestra, ogni contenitore passa al
    // figlio quello che gli resta. Un div senza nome la spezzava.
    <div className="bar-page">
      {/* NIENTE ☰ FLOTTANTE: la lavagna della coda ne ha uno suo, dentro la
          testata (`.board-burger`), e nelle altre sezioni la topbar c'è e il
          ☰ sta lì. Un tasto fisso nell'angolo sopra una pagina che scorre
          finisce addosso a quello che scorre. */}
      <StaffDrawer role={role} active={tabEffettivo} onSelect={goTab} flottante={false} />

      {/* Toccando un gruppo (menu laterale) si ENTRA nella sua vista: la
          lista dei suoi ordini col conto. La coda resta com'è — lì ci
          vanno solo gli ordini, i pannelli restano dietro il loro tasto. */}
      {params.get('group') && (
        <GroupView groupId={params.get('group')} onClose={() => navigate('/bar')} />
      )}

      <div className="bar-content">
        {/* L'«indietro» sta nella barra in alto, fra il ☰ e il marchio
            (vedi App.jsx): dentro la pagina si mangiava la prima riga di
            contenuto in ogni sezione. */}
        {tabEffettivo === 'coda' && <OrderQueue mieiIniziale={salaMiei} gestore={isGestore(role)} ruolo={role} />}
        {/* «Da servire»: la sezione della sala (drink pronti da portare). */}
        {tabEffettivo === 'servizio' && <ServiceQueue />}
        {tabEffettivo === 'pagamenti' && <CassaTab />}
        {/* IL VECCHIO INDIRIZZO NON SI ROMPE. `?tab=storico` è nei
            collegamenti salvati e nei messaggi: porta alla cassa, aperta
            sulla lista ordini. */}
        {tabEffettivo === 'storico' && (
          <CassaTab sezioneIniziale="ordini" />
        )}
        {tabEffettivo === 'fatture' && <InvoicesTab />}
        {tabEffettivo === 'stats' && <StatsTab />}
        {tabEffettivo === 'bilancio' && <BilancioTab />}
        {tabEffettivo === 'menu' && <MenuTab />}
        {tabEffettivo === 'inventario' && <InventoryManager />}
        {tabEffettivo === 'fornitori' && <FornitoriTab />}
        {(tabEffettivo === 'staff' || tabEffettivo === 'ore') && <StaffHoursTab />}
        {tabEffettivo === 'utenti' && <UtentiTab role={role} />}
        {/* I buoni VIP sono un pannello di "Utenti e ruoli": qui restano
            solo perché i vecchi collegamenti (?tab=vip) funzionino. */}
        {tabEffettivo === 'vip' && <VipTab />}
        {tabEffettivo === 'impostazioni' && <SettingsTab role={role} />}
        {/* La stampante sta nelle Impostazioni: qui resta solo perché i
            vecchi collegamenti (?tab=stampante) continuino a funzionare. */}
        {tabEffettivo === 'stampante' && <PrinterSetup />}
        {tabEffettivo === 'dev' && devToolsEnabled && <DevTools />}
      </div>
    </div>
  )
}

function MenuTab() {
  return <MenuManager />
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setErr(null)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (e) {
      setErr(loginError(e.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 style={{ marginTop: 0 }}>Accesso staff</h2>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setErr(null) }}
        placeholder="bartender@example.com"
        required
      />
      <label htmlFor="password" style={{ marginTop: 10 }}>Password</label>
      <CampoPassword
        id="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setErr(null) }}
        placeholder="••••••••"
        required
      />
      {err && <div className="banner" style={{ marginTop: 10 }}>{err}</div>}
      <button className="btn block" style={{ marginTop: 14 }} type="submit" disabled={loading}>
        {loading ? 'Accesso…' : 'Entra'}
      </button>
    </form>
  )
}

function loginError(code) {
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Email o password non corretti.'
  }
  if (code === 'auth/too-many-requests') return 'Troppi tentativi. Riprova tra qualche minuto.'
  if (code === 'auth/network-request-failed') return 'Errore di rete. Controlla la connessione.'
  return 'Errore di accesso. Riprova.'
}

const STATUS_TABS = [
  ORDER_STATUSES.RICEVUTO,
  ORDER_STATUSES.IN_PREPARAZIONE,
  ORDER_STATUSES.PRONTO,
  ORDER_STATUSES.RITIRATO,
  ORDER_STATUSES.PAGATO,
]

// Minuti (1 decimale) tra due timestamp ISO, o null se mancanti.
function minutesBetween(fromIso, toIso) {
  const t1 = Date.parse(fromIso || '')
  const t2 = Date.parse(toIso || '')
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || t2 < t1) return null
  return Math.round((t2 - t1) / 6000) / 10
}

// Porta sotto gli occhi il conto acceso dalla ricerca.
//
// È un componente a sé, e non un `useEffect` dentro OrderQueue, perché lì
// sopra c'è un return anticipato (la coda che sta ancora caricando): un
// hook messo dopo quel punto verrebbe eseguito in certi render e in altri
// no, e React conta sull'ordine sempre uguale. Il lint lo boccia, ed è
// stato lui a prendermi con le mani nel sacco.
function PortaInVista({ id }) {
  useEffect(() => {
    if (!id) return
    // `block: 'center'` e non 'nearest': se il conto è appena fuori
    // schermo, "nearest" lo incolla al bordo e sembra tagliato.
    document
      .getElementById(`ordine-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [id])
  return null
}

function OrderQueue({ mieiIniziale = false, gestore = false, ruolo = null }) {
  const [ordersReady, setOrdersReady] = useState(false) // primo snapshot arrivato
  const [ordersRaw, setOrders] = useState([])
  // CONTI APPENA CHIUSI QUI: fuori dalla lista all'istante. La scrittura
  // parte in sottofondo e per un attimo la coda ha ancora la versione di
  // prima: si tornava dalla schermata del conto e lo si vedeva lì, per poi
  // guardarlo sparire — abbastanza per chiedersi se l'operazione fosse
  // andata a buon fine.
  const [chiusiQui, setChiusiQui] = useState([])
  useEffect(() => subscribeNascosti(setChiusiQui), [])
  // QUALE STATO È IN CODA. UNO SOLO: «riportiamo aperti, chiusi e
  // annullati come mutuamente esclusivi» (l'utente, 20/08/2026, dopo
  // averli provati combinabili). Sopra la coda si chiede una cosa per
  // volta — cosa c'è da fare, quanto ho incassato, cosa ho annullato — e
  // una coda mista costringe a rileggere ogni card per sapere in quale dei
  // tre mondi sta. La regola sta in coda.js (REQ-CODA-009), che è dove si
  // prova; qui si tiene solo la scelta.
  // Esclusivi vuol dire che il tocco È la scelta: `setStato(id)`, senza
  // nessuna regola di combinazione in mezzo.
  const [stato, setStato] = useState(STATO_DEFAULT)
  // DENTRO I CHIUSI: tutti, quelli usciti per intero, quelli con ancora
  // qualcosa da portare. Un conto chiuso è un conto incassato — si paga in
  // anticipo tutte le sere — e «quali dei chiusi hanno ancora roba da
  // consegnare» è una domanda vera, che prima si rispondeva tenendo quei
  // conti in mezzo a quelli aperti.
  const [sottoChiusi, setSottoChiusi] = useState('tutti')
  // NASCONDERE VALE SOLO PER I CONTI APERTI. Un conto chiuso da qui
  // sparisce subito da «Aperti» — è il suo mestiere — ma restava nascosto
  // anche sotto «Chiusi»: si chiudeva un conto e nello storico non c'era,
  // fino a ricaricare la pagina. E riaprendolo non tornava fra quelli
  // aperti, perché era ancora nell'elenco dei nascosti.
  // Si nasconde solo mentre si guardano gli APERTI: sotto «Chiusi» il
  // conto appena incassato deve restare a schermo, è lì che si va a
  // cercarlo, e sotto «Annullati» vale lo stesso.
  // ...E UN CONTO INCASSATO CON DEI DRINK ANCORA DA FARE NON SI NASCONDE
  // AFFATTO. Nascondere serve a togliere di mezzo un conto su cui non c'è
  // più niente da fare; ma si paga in anticipo tutte le sere, e sparendo
  // si portava dietro le sue comande — al banco i drink appena pagati si
  // volatilizzavano, e tornavano solo ricaricando la pagina (BUG-023).
  const soloAperti = stato === 'attivi'
  const orders = useMemo(
    () => (soloAperti ? senzaNascosti(ordersRaw, haLavoroDaFare) : ordersRaw),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordersRaw, chiusiQui, soloAperti]
  )
  const [error, setError] = useState(null)
  const [statusTab, setStatusTab] = useState(ORDER_STATUSES.RICEVUTO)
  // La scheda attiva quando gli stati di servizio sono SPENTI: in corso,
  // chiusi o annullati — le stesse voci della griglia.
  const [tabSemplice, setTabSemplice] = useState('attivi')
  // Quale card delle corsie ha le azioni aperte: una alla volta, se no la
  // colonna diventa un muro di tasti.
  const [corsiaAperta, setCorsiaAperta] = useState(null)
  // Quale card mostra tutte le righe (i conti lunghi si aprono a richiesta).
  const [corsiaEspansa, setCorsiaEspansa] = useState(null)
  // Le comande come le vede chi sta qui adesso: il gesto è sulla singola
  // comanda e deve vedersi nell'istante in cui si tocca. La copia locale e
  // la sua pulizia stanno in lib/comandeLocali.js, uguali per la coda, il
  // conto e il dettaglio della comanda.
  const comandeLocali = useComandeLocali(orders)
  // Quali colonne chi sta a QUESTO terminale ha spento, e se guarda i conti
  // o le comande: preferenze del dispositivo, non del locale — al banco e
  // alla cassa non si guardano le stesse cose.
  const [nascoste, setNascoste] = useState(() => {
    const salvate = corsieNascoste()
    if (salvate == null) return CORSIE_SPENTE_ALL_INIZIO
    // LA MEMORIA SI RIPULISCE ALL'APERTURA. Le corsie sono state
    // rimaneggiate piu' volte e gli id sono cambiati: un id morto restava
    // qui dentro, contava come colonna spenta — quindi teneva acceso il
    // badge del tastino dei filtri per sempre — e nell'elenco non c'era
    // niente da riaccendere per spegnerlo (BUG-058).
    const vive = soloCorsieVive(salvate)
    if (vive.length !== salvate.length) ricordaCorsieNascoste(vive)
    return vive
  })
  const [vista, setVista] = useState(vistaCorsie)
  // LA FILA DEI FILTRI STA DIETRO UN TASTO. Chiusa di suo, e la scelta è di
  // QUESTO terminale (vedi impostazioniLocali): al banco la fila resta
  // aperta tutta la sera, alla cassa non si tocca mai.
  const [filtriVisibili, setFiltriVisibili] = useState(filtriAperti)
  // La colonna del pronto: una sola col badge, o due (da servire / da
  // ritirare). Scelta di QUESTO terminale — il tablet della sala e quello
  // del banco non guardano lo stesso lavoro.
  const [prontoSeparato, setProntoSeparato] = useState(prontoDiviso)
  // Barra stretta o larga: da questo dipende se le azioni della testata
  // stanno dietro il ⋯ o a vista come icone.
  const telefono = useTelefono()
  const [soloOggi, setSoloOggi] = useState(false) // nasconde i conti dei giorni scorsi
  // CHI HA APERTO IL CONTO. Era «✍️ Miei», acceso o spento: o tutti o solo
  // i propri. Adesso è una tendina con dentro chi ha battuto almeno un
  // conto, tutti selezionati di suo (REQ-CODA-009): «i miei» è una delle
  // scelte possibili, non l'unica alternativa a «tutti» — al banco capita
  // di voler vedere i conti di UNA persona che non sei tu.
  //
  // `null` VUOL DIRE TUTTI, e non è l'elenco di tutti quelli di adesso: chi
  // apre il suo primo conto a metà serata entra da solo in una tendina
  // lasciata al default. La regola sta in coda.js (`autoriAttivi`).
  //
  // Arrivando da «I miei ordini» della sala si parte già filtrati su di sé:
  // è la pagina che quel filtro ha sostituito.
  const [autoriScelti, setAutoriScelti] = useState(() => {
    const mia = auth.currentUser?.email?.trim().toLowerCase()
    return mieiIniziale && mia ? [mia] : null
  })

  const [slowLoad, setSlowLoad] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null) // { title, message, danger, run }
  const [cancelTarget, setCancelTarget] = useState(null) // { order, kind }
  // Storia del conto e ripristino: due pannelli, un conto alla volta.
  // Quali avvisi vuole CHI GUARDA QUESTO SCHERMO (per dispositivo e per
  // persona). In un ref perché la sottoscrizione agli ordini nasce una volta
  // sola: leggendoli dallo stato resterebbero quelli di quando è nata.
  const avvisi = useRef(leggiAvvisi(auth.currentUser?.uid))
  useEffect(
    () => subscribeAvvisi(auth.currentUser?.uid, (p) => { avvisi.current = p }),
    []
  )
  // ── CHI È COLLEGATO ─────────────────────────────────────────────────
  // Due cose separate: si DICE che ci siamo (un colpo ogni tanto) e si
  // GUARDA chi c'è. Chi guarda sono solo admin e bartender — il filtro sta
  // in presenza.js — ma il colpo lo dà chiunque sia personale: anche chi
  // non può vedere l'elenco deve comparirci per gli altri.
  const [presenze, setPresenze] = useState([])
  useEffect(() => {
    if (!isPersonale(ruolo)) return
    const u = auth.currentUser
    if (!u) return
    const battito = () =>
      // Il nome si ricava con placedByName, la STESSA funzione che dà il
      // nome sulle card: se i due divergessero, uno comparirebbe in legenda
      // con una lettera e sui suoi conti con un'altra.
      segnalaPresenza({
        uid: u.uid,
        name: placedByName({ name: u.displayName, email: u.email }),
        role: ruolo,
      })
    battito()
    // SOLO MENTRE LA PAGINA È DAVANTI. Un tablet in tasca con l'app aperta
    // continuerebbe a dire «ci sono» tutta la notte: si smette quando la
    // pagina va via, e la presenza scade da sola. Al ritorno si ricomincia
    // con un colpo subito, che è quello che rimette la lettera in legenda.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') battito()
    }, BATTITO_PRESENZA_MS)
    const alRitorno = () => {
      if (document.visibilityState === 'visible') battito()
    }
    document.addEventListener('visibilitychange', alRitorno)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', alRitorno)
    }
  }, [ruolo])
  useEffect(() => {
    // L'elenco lo legge solo chi può vederlo: senza questo, un terminale
    // di sala terrebbe aperto un ascolto per un dato che non mostrerà mai.
    if (!isGestore(ruolo)) return
    return subscribePresenze(setPresenze, () => {})
  }, [ruolo])

  // Gli avanzamenti fatti DA QUI non si annunciano: l'ho appena premuto io.
  const avanzatiDaMe = useRef(new Set())
  // LA CODA NON DIMENTICA I CONTI CHE HA GIÀ VISTO. Qui c'erano DUE memorie
  // rifatte da capo a ogni snapshot — questa e un `knownIds` gemello — e
  // bastava che un conto uscisse dalla finestra della coda (annullato,
  // chiuso, di ieri) e rientrasse perché tornasse a risultare NUOVO: il
  // banco riceveva due avvisi per lo stesso fatto, «🆕 Nuovo ordine» e il
  // cambio di stato, con parole diverse (BUG-072). Una memoria sola, che si
  // aggiunge e non si azzera: «mai visto» è l'unica cosa che rende nuovo un
  // conto. Cresce di una riga per conto e muore col ricarico della pagina.
  const statoPrec = useRef(new Map())
  const [storiaTarget, setStoriaTarget] = useState(null)
  const [ripristinoTarget, setRipristinoTarget] = useState(null)
  // Il conto a cui si sta dando un colore: la tavolozza è una modale sola
  // per la pagina, non una per card.
  const [coloreTarget, setColoreTarget] = useState(null)
  const [search, setSearch] = useState('')
  const [showPanels, setShowPanels] = useState(false) // pannelli (chiamate/gruppi) nella griglia
  const [menuBoard, setMenuBoard] = useState(false) // menu ⋯ della lavagna
  const [apriCassa, setApriCassa] = useState(false) // box «apri la cassa»
  const [chiudiCassa, setChiudiCassa] = useState(false) // box «chiudi la cassa»
  // Verso della lista: dal più vecchio (come nasce la serata) o dal più
  // recente (utile quando i conti sono tanti e l'ultimo è quello che
  // serve). Si ricorda, perché è una preferenza di chi lavora.
  const [ordineDesc, setOrdineDesc] = useState(() => {
    try {
      return localStorage.getItem('tana:coda:desc') === '1'
    } catch {
      return false
    }
  })
  const cambiaOrdine = () =>
    setOrdineDesc((v) => {
      try {
        localStorage.setItem('tana:coda:desc', v ? '0' : '1')
      } catch {
        /* niente memoria: vale per questa sessione */
      }
      return !v
    })
  const [openCards, setOpenCards] = useState(() => new Set()) // card-griglia coi tasti aperti
  const [pend, setPend] = useState({ pending: [], banners: [] }) // ordini POS in invio
  const [settings, setSettings] = useState(settingsIniziali)
  const knownComande = useRef(new Map()) // id ordine -> n. comande (per il toast aggiunte)
  const navigate = useNavigate()

  useEffect(() => subscribeSettings((s) => setSettings(s)), [])
  useEffect(() => subscribePending(setPend), [])
  // Senza cassa aperta non si battono ordini: il «+» è spento e in cima
  // compare l'avviso con la scorciatoia per aprirla.
  // ATTENZIONE ALLA FORMA: `open` è un BOOLEANO, la cassa vera sta in
  // `session`. Leggendo `cassaAperta?.id` da un booleano viene `undefined`,
  // e allora ogni conto chiuso o annullato spariva dalla coda — sembrava un
  // problema di filtri e invece era questa riga.
  const { session: cassaAperta, loading: cassaLoading } = useCashSession()

  // Gestione preparazione: se spenta spariscono stati e avanzamenti.
  const workflowOn = settings.workflow_enabled !== false
  // COSA DICE LA STRISCIA a sinistra della card: di suo lo stato (com'è
  // sempre stato), oppure il colore del conto se il locale l'ha scelto.
  // Chi decide è lib/coloriConto.js: qui si legge solo l'impostazione, che
  // è già in cache come tutte le altre.
  const bordoColoreConto = settings.bordo_colore_conto === true
  // In che passo nasce il lavoro in questo locale: lo dice comande.js, in
  // un posto solo. Serve a sapere fin dove si può tornare indietro — sotto
  // quel passo non c'è niente da guardare — e quali colonne ha senso
  // accendere.
  const passoDiNascita = statoComandaNuova(settings)

  // GLI STATI DEL SERVIZIO ACCENDONO LA VISTA DEL BANCO. Chi sta allo
  // shaker non guarda i conti, guarda il lavoro: le comande, nei passi in
  // cui stanno. Quei passi sono esattamente ciò che dà senso a questa
  // vista — spenti gli stati del servizio non esiste proprio, e al banco
  // si vede la coda come la vedono tutti gli altri.
  //
  // COME disegnarla lo dice `settings.bartender_view`, un'impostazione del
  // LOCALE sorella di `queue_view`: per ora l'unica voce è «corsie di
  // stato», ma è scritta come una lista di viste possibili proprio perché
  // è il posto dove le prossime andranno ad aggiungersi.
  const vistaBanco = workflowOn && isBanco(ruolo)
  // LA SALA SERVE, NON PREPARA (REQ-STAFF-014). Vede a che punto sono le
  // comande — le serve per sapere cosa portare — ma i passi del banco non
  // li tocca: qui si spengono i tasti che li segnano, la strada per tornare
  // indietro, la divisione e l'annullo. Il metro sta in `ruoli.js`, in un
  // posto solo.
  const comandaIlLavoro = puoGestireComande(ruolo)
  const bancoCorsie = vistaBanco && (settings.bartender_view || 'corsie') === 'corsie'

  // Le viste a LAVAGNA — la griglia, le corsie di stato, la vista del banco
  // — stanno a tutto schermo: aggiungono `fullbleed` al body così la pagina
  // esce dal contenitore centrato (.app, max 760px) e riempie larghezza e
  // altezza. Rimosso quando si lascia la lavagna o si smonta la coda.
  // CHI NON È AL BANCO PUÒ ANDARE A GUARDARE IL LAVORO, da qualunque vista
  // della coda: è una pastiglia sopra le corsie (vedi puoScegliere), e la
  // scelta è di questo terminale. Tornando indietro la coda si ritrova
  // com'era — griglia compresa — perché quella resta l'impostazione del
  // locale e nessuno l'ha toccata.
  const guardaComande = workflowOn && !vistaBanco && vista === 'comande'
  const gridView = !vistaBanco && !guardaComande && settings.queue_view === 'griglia'
  // LA CODA DELL'ADMIN NON CAMBIA: con «corsie di stato» continua a vedere
  // i CONTI — in corso, chiusi, annullati — come ha sempre fatto.
  const corsieView =
    bancoCorsie || guardaComande || (!vistaBanco && settings.queue_view === 'corsie')
  const lavagna = gridView || corsieView
  useEffect(() => {
    if (!lavagna) return undefined
    document.body.classList.add('fullbleed')
    return () => document.body.classList.remove('fullbleed')
  }, [lavagna])

  // Se dopo 8s gli ordini non sono arrivati, probabilmente il database non è
  // raggiungibile (l'SDK ritenta in silenzio): mostra un suggerimento.
  useEffect(() => {
    const t = setTimeout(() => setSlowLoad(true), 8000)
    return () => clearTimeout(t)
  }, [])

  // Registrazione push del dispositivo (indipendente dagli ordini).
  useEffect(() => {
    installAudioUnlock() // sblocca il bip al primo tocco (richiesto da iOS)
    // Registra il token push del dispositivo del bartender: senza questo la
    // push "nuovo ordine" non arriverebbe a chi sta solo sul gestionale.
    const uid = auth.currentUser?.uid
    ensureNotificationPermission().then(async (ok) => {
      if (!ok || !uid) return
      const token = await getPushToken()
      if (token) saveStaffToken(uid, token, idDispositivo()).catch(() => {})
    })
  }, [])

  // Osserva la CODA: conti aperti (sempre, per sempre) + chiusi di oggi.
  const cutoffHour = settings.business_day_cutoff_hour
  useEffect(() => {
    let primed = false
    const awaiting = new Set() // ordini in attesa di pagamento obbligatorio
    const unsub = subscribeActiveOrders(
      (data) => {
        // Notifica i nuovi ordini "ricevuti" comparsi dopo il primo
        // caricamento. Quelli con pagamento obbligatorio vengono
        // notificati solo QUANDO risultano pagati (prima non si preparano).
        if (primed) {
          const printerSettings = loadPrinterSettings()
          for (const o of data) {
            const isNew = !statoPrec.current.has(o.id)
            // USCITO DALLA CODA, USCITO DALL'ATTESA. Un conto annullato
            // mentre aspettava il pagamento obbligatorio restava in questo
            // insieme per sempre: ripristinandolo veniva annunciato come
            // «nuovo ordine» — ed era il secondo avviso, quello di troppo,
            // che il banco ha visto sull'ordine #5 (BUG-072).
            if (o.workflow_status === ORDER_STATUSES.ANNULLATO) awaiting.delete(o.id)
            // C'È QUALCOSA DA FARE? Un ordine battuto alla cassa nasce già
            // «in preparazione» — chi lo batte sta facendo il drink —
            // mentre quelli dal menù nascono «ricevuto». Guardando i soli
            // «ricevuto», un ordine preso al POS da un altro terminale non
            // faceva suonare niente qui.
            if (
              o.workflow_status !== ORDER_STATUSES.RICEVUTO &&
              o.workflow_status !== ORDER_STATUSES.IN_PREPARAZIONE
            )
              continue
            // NIENTE AVVISO SOLO A CHI L'HA MANDATO. Prima si tacevano tutti
            // gli ordini battuti da un gestore, su QUALUNQUE dispositivo:
            // col telefono in mano a un admin, al banco non suonava niente.
            // Il metro giusto non è il ruolo, è il terminale — lo stesso
            // account sta su tablet, telefono e portatile insieme.
            if (battutoDaQui(o.placed_by)) continue
            if (isAwaitingPayment(o)) {
              if (isNew) awaiting.add(o.id)
              continue
            }
            if (isNew || awaiting.has(o.id)) {
              awaiting.delete(o.id)
              if (avvisoAttivo(avvisi.current, 'nuovo_ordine')) {
                beep() // su iPad in primo piano il banner di sistema è soppresso
                // STESSO NOME della notifica che manda il server (sw.js):
                // così il sistema le fonde in una invece di mostrarne due —
                // l'app suona subito, la push arriva un istante dopo.
                notify(AVVISO_NUOVO_ORDINE.titolo, AVVISO_NUOVO_ORDINE.corpo(o.daily_number), {
                  tag: `new-order-${o.id}`,
                  renotify: true,
                })
              }
            }
          }
          // LA CODA STAMPA COMANDE, NON SCONTRINI (BUG-055). Qui viveva
          // anche l'auto-stampa dello scontrino, «ogni conto pagato che
          // vedo»: al primo sguardo di un browser nuovo — o dopo una
          // memoria svuotata — usciva la carta di tutti i conti pagati
          // della serata. «Deve avvenire solo quando esco dall'ordine e
          // deve stampare la COMANDA, non lo scontrino» (l'utente, 20/08).
          // Lo scontrino appartiene al GESTO della riscossione (il pannello
          // dei pagamenti, i tasti rapidi qui sotto), non allo snapshot.
          // AUTO-STAMPA COMANDE: fuori dal blocco degli avvisi, apposta.
          // La stampa non è un avviso: la comanda serve al banco anche per
          // l'ordine battuto da QUESTO terminale, e serve anche quando è la
          // SECONDA comanda di un conto già aperto — due casi che i filtri
          // degli avvisi (battutoDaQui, ordine nuovo) tagliavano fuori.
          // La regola di cosa stampare sta in printer.js (comandeDaStampare),
          // la pretesa per non stampare doppio pure (claimComandaPrint).
          // E DI CHI STAMPA: il terminale che ha battuto l'ordine, e solo
          // lui (stampaQuestoTerminale, dentro comandeDaStampare). Le
          // impostazioni si passano già lette: servono a sapere se il
          // locale è in rimbalzo, e sono le stesse per tutti i conti.
          if (printerSettings.autoPrintComanda) {
            for (const o of data) {
              for (const c of comandeDaStampare(o, { impostazioni: printerSettings })) {
                if (claimComandaPrint(o.id, c)) {
                  printComanda(o, c)
                    // Il segno va SUL DATO solo a carta uscita: segnare
                    // prima vorrebbe dire che una stampa fallita mette a
                    // tacere tutti i terminali per sempre.
                    .then(() => segnaComandaStampata(o.id, c.id))
                    .catch((e) => {
                      console.warn('[printer] auto-comanda:', e.message)
                      // Pretesa locale libera: al prossimo snapshot si
                      // riprova — carta finita, stampante spenta, si
                      // sistema e la comanda esce da sola.
                      releaseComandaPrint(o.id, c)
                    })
                }
              }
            }
          }
          // AGGIUNTE a conti esistenti (da altro dispositivo/staff): toast
          // in app. Le proprie aggiunte non passano di qua: si fanno dal
          // dettaglio ordine, dove questa vista non è montata.
          for (const o of data) {
            const prev = knownComande.current.get(o.id)
            const n = (o.comande || []).length
            if (prev != null && n > prev && o.status === 'aperto') {
              showToast(`➕ Aggiunta all'ordine #${o.daily_number ?? '—'}${o.customer_name ? ` (${o.customer_name})` : ''}`)
            }
          }
          // AVANZAMENTI FATTI ALTROVE. Chi sta in sala deve sapere che un
          // conto è diventato «pronto» senza dover guardare la coda ogni
          // minuto; chi l'ha premuto qui non ha bisogno che glielo si
          // ripeta. Ogni stato si accende e si spegne per conto suo, dalle
          // impostazioni: in sala interessa «pronto», al banco altro.
          for (const o of data) {
            const prima = statoPrec.current.get(o.id)
            const ora = o.workflow_status
            if (!prima || prima === ora) continue
            if (avanzatiDaMe.current.has(`${o.id}:${ora}`)) {
              avanzatiDaMe.current.delete(`${o.id}:${ora}`)
              continue
            }
            // ANNULLATO DA QUESTO TERMINALE: niente avviso. Chi annulla lo
            // fa quasi sempre dal conto, non da qui, quindi «l'ho premuto
            // io» (avanzatiDaMe) non basta: quella schermata è un'altra.
            // Il metro è il terminale, come per gli ordini nuovi.
            if (ora === ORDER_STATUSES.ANNULLATO && annullatoDaQui(o)) continue
            // UN CONTO CHE RIENTRA IN CODA è una notizia — c'è di nuovo da
            // fare — ma non è un passo del servizio: annunciarlo col nome
            // della colonna dove atterra («Da fare») racconta dov'è finito,
            // non cosa è successo. E chi l'ha rimesso in piedi lo sa già,
            // come per l'annullo.
            const tornatoInCoda =
              prima === ORDER_STATUSES.ANNULLATO && ora !== ORDER_STATUSES.ANNULLATO
            if (tornatoInCoda && ripristinatoDaQui(o)) continue
            if (!avvisoAttivo(avvisi.current, idAvvisoStato(ora))) continue
            // Le parole stanno in un posto solo: statoAlBanco per i passi
            // del servizio, orderStatus.js per i fatti che passo non sono.
            const nome = statoAlBanco(ora, o.service_mode)
            if (!tornatoInCoda && !nome) continue
            notify(
              tornatoInCoda ? AVVISO_RIPRISTINO.titolo : `${STATUS_EMOJI[ora] || '•'} ${nome}`,
              `Ordine #${o.daily_number ?? '—'}${o.customer_name ? ` · ${o.customer_name}` : ''}`
            )
          }
        }
        knownComande.current = new Map(data.map((o) => [o.id, (o.comande || []).length]))
        // Si AGGIUNGE: i conti spariti dalla finestra restano nella memoria,
        // altrimenti al loro ritorno sarebbero di nuovo «nuovi» (BUG-072).
        for (const o of data) statoPrec.current.set(o.id, o.workflow_status)
        setOrders(data)
        setOrdersReady(true)
        primed = true
      },
      (e) => {
        setError(e.message)
        setOrdersReady(true) // errore visibile in pagina, niente spinner infinito
      },
      { cutoffHour, cashSessionId: cassaAperta?.id ?? null }
    )
    return unsub
  }, [cutoffHour, cassaAperta?.id])

  // Scambio placeholder → ordine reale: appena l'ordine con il
  // client_temp_id del placeholder arriva dalla sottoscrizione, il
  // placeholder si toglie (lo scambio è sul posto: mai due card né buchi).
  useEffect(() => {
    for (const p of pend.pending) {
      if (orders.some((o) => o.client_temp_id === p.tempId)) dismissPending(p.tempId)
    }
  }, [orders, pend.pending])

  // Nessuna apertura/chiusura di serata: il servizio è perpetuo. I conti
  // restano aperti finché non li si chiude a mano; la giornata commerciale
  // serve solo a raggruppare (statistiche e progressivo #N).

  // Porta il conto a uno stato: quello dopo, se non si dice altro, oppure
  // uno preciso — anche INDIETRO, per chi ha toccato «pronto» sul conto
  // sbagliato. La strada è la stessa (override ottimistico + scrittura in
  // sottofondo): non c'è un modo per andare avanti e uno per tornare.
  function advance(order, stato = null) {
    const ns = stato || nextStatus(order.workflow_status)
    if (!ns || ns === order.workflow_status) return
    avanzatiDaMe.current.add(`${order.id}:${ns}`)
    // LA MEMORIA DI «L'HO APPENA FATTO IO» STA SULLE COMANDE, una sola per
    // tutta la schermata. Prima qui c'era `queueOverrides`, che teneva lo
    // stato del CONTO: si avanzava un conto dalla griglia e le sue comande
    // restavano quelle del server, si avanzava un ticket dal banco e lo
    // stato del conto restava quello del server. Con la pastiglia
    // «🍸 Comande / 🧾 Ordini» le due viste stanno a un tocco di distanza
    // sullo stesso terminale: si girava la pastiglia e il conto era ancora
    // dov'era, finché non arrivava lo snapshot. Offline non arriva.
    const attiva = activeComanda(comandeLocali.conComande(order))
    if (attiva) {
      const adesso = new Date().toISOString()
      comandeLocali.applica(order, (comande) =>
        comande.map((c) =>
          c.id === attiva.id
            ? { ...c, status: ns, status_times: { ...(c.status_times || {}), [ns]: adesso } }
            : c
        )
      )
    }
    // La scrittura resta quella di sempre: il server sceglie la comanda
    // attiva da sé, ed è la stessa che si è appena mossa qui.
    updateOrderStatus(order.id, ns).catch((e) => {
      setError(e.message)
      showToast(`⚠️ Avanzamento non riuscito: ${e.message}`, { kind: 'error' })
      // Non è passata: si torna a quello che dice il server, che è l'unica
      // cosa vera.
      comandeLocali.scarta(order.id)
    })
  }

  // Porta AVANTI UNA COMANDA, non tutto il conto: è il gesto delle corsie
  // del banco, dove ogni card è un ticket. Gli stati del servizio sono
  // SOTTOSTATI dell'ordine — stanno sulle comande, non sul conto — e con
  // una comanda sola le due cose coincidono; con più di una no, ed è
  // esattamente quello che questa vista serve a far vedere. La strada è
  // quella di sempre: si vede subito, si scrive in sottofondo, e cosa
  // viene dopo lo dice comande.js, come nel dettaglio del conto.
  // `stato` esplicito serve a TORNARE INDIETRO: si segna «pronto» il ticket
  // sbagliato, e senza una strada per rimetterlo dov'era l'unica sarebbe
  // annullare la comanda e rifarla, perdendo orari e storia.
  function avanzaComanda(order, comanda, stato = null) {
    if (!comanda) return
    const ns = stato || nextComandaStatus(comanda.status)
    if (!ns) return
    const adesso = new Date().toISOString()
    comandeLocali.applica(order, (comande) =>
      comande.map((c) =>
        c.id === comanda.id
          ? { ...c, status: ns, status_times: { ...(c.status_times || {}), [ns]: adesso } }
          : c
      )
    )
    advanceComanda(order.id, comanda.id, ns).catch((e) => {
      setError(e.message)
      showToast(`⚠️ Avanzamento non riuscito: ${e.message}`, { kind: 'error' })
      comandeLocali.scarta(order.id)
    })
  }

  // Annullamento bartender: apre il dialog con frase/motivazione/notifica.
  // kind: 'ordine' (ricevuto), 'preparazione' (in_preparazione),
  // 'non_ritirato' (pronto mai ritirato/servito).
  function confirmCancel({ phrase, message, notify }) {
    const { order, kind } = cancelTarget
    setCancelTarget(null)
    // In background: il dialog si chiude subito, la card sparisce con lo
    // snapshot; in errore arriva il toast.
    cancelOrder(order.id, { by: 'bartender', kind, phrase, message, notify }).catch((e) => {
      setError(e.message)
      showToast(`⚠️ Annullo non riuscito: ${e.message}`, { kind: 'error' })
    })
  }

  // Attesa del primo snapshot: si mostra SOLO se non c'è già qualcosa da
  // vedere. Un ordine appena battuto è un segnaposto locale, quindi deve
  // comparire subito — la sincronizzazione col server viene dopo, non
  // prima (era il caso del primo ordine della giornata: il contatore del
  // giorno non è ancora in cache e la scrittura passa dal server).
  if (!ordersReady && pend.pending.length === 0) {
    return (
      <div>
        {error && <div className="banner">Errore: {error}</div>}
        <div className="empty">
          Carico gli ordini…
          {slowLoad && (
            <>
              {/* Chi legge questo sta al bancone, non davanti al codice: gli
                  emulatori non gli dicono niente. La causa quasi sempre è una
                  rete che RISULTA collegata ma non passa (wifi del locale che
                  fa i capricci): lì l'app aspetta il server invece di
                  arrendersi alla cache.
                  In LOCALE però la causa è quasi sempre un'altra — il
                  database finto che si è impiantato: accetta le connessioni
                  e non risponde più. Dire «controlla il wifi» a chi sta
                  sviluppando è mandarlo a cercare dalla parte sbagliata. */}
              <p className="muted" style={{ fontSize: '0.85rem', marginTop: 12 }}>
                {import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'
                  ? 'Il database locale (emulatore) non risponde: accetta le connessioni ma non manda niente. Riavvia gli emulatori — «npm run emulators».'
                  : 'Il wifi risulta collegato ma non sta passando niente. Prova a spegnere e riaccendere il wifi, oppure passa alla rete del telefono: gli ordini già presi restano al sicuro.'}
              </p>
              <button
                className="btn ghost small"
                style={{ marginTop: 8 }}
                onClick={() => window.location.reload()}
              >
                🔄 Ricarica
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // Ordini "effettivi" a schermo: quelli del server con sopra l'ultimo gesto
  // fatto da questo terminale. Le comande sono la memoria, e lo stato del
  // conto si RICAVA da quelle (statoDiLavoro): così le due viste — conti e
  // comande — raccontano sempre la stessa cosa, anche offline.
  const effOrders = orders.map((o) => {
    const conLocali = comandeLocali.conComande(o)
    if (conLocali === o) return o
    return {
      ...conLocali,
      workflow_status: statoDiLavoro(conLocali),
      active_comanda_id: activeComanda(conLocali)?.id ?? null,
    }
  })
  // ── DA CHIUDERE: conti rimasti aperti dalle giornate precedenti ──
  // Restano fuori dalla schermata principale (altrimenti si mescolano agli
  // ordini di oggi e i numeri del giorno sembrano duplicati): stanno nella
  // loro tab dedicata, con la data ben visibile sulla card.
  const oggiKey = businessDayKey(new Date(), cutoffHour)
  // DI CHE GIORNATA È UN CONTO. La regola — e tutti i ripieghi sulle date
  // locali, che ci sono sempre — sta in coda.js: la data si scrive dal
  // client alla nascita, e un documento monco deve comunque finire sotto
  // il SUO giorno invece che in un limbo senza etichetta.
  const dayOf = (o) => giornataDelConto(o, cutoffHour)
  // Un conto è CHIUSO — e quindi esce dalla coda — solo quando non c'è più
  // nulla da fare. Con la preparazione attiva servono DUE cose: pagato E
  // servito. Un ordine pagato in anticipo ma non ancora consegnato è
  // lavoro ancora da fare, e sparire sarebbe il modo migliore per
  // dimenticarselo. Senza la preparazione, invece, il pagamento chiude.
  // UN CONTO CHIUSO È UN CONTO INCASSATO. Punto: i soldi sono presi, e per
  // la coda dei CONTI — griglia, lista, schede, conteggi e corsie — non
  // c'è altro da chiedersi. Prima con gli stati del servizio ne servivano
  // due, pagato E servito, e un conto appena riscosso restava fra quelli
  // «in corso» finché qualcuno non lo serviva: chi aveva appena preso i
  // soldi lo cercava fra i chiusi e non lo trovava. Il lavoro ancora da
  // fare si guarda dove è il suo posto — le corsie delle COMANDE — e,
  // dentro i chiusi, col sottofiltro «Da servire».
  // La regola con gli stati resta viva altrove: il magazzino (impegnato.js)
  // deve sapere che un conto pagato e non servito ha ancora ingredienti in
  // ballo, e lì `contoChiuso` si chiama col workflow acceso.
  const isChiuso = (o) => contoChiuso(o, { workflowOn: false })
  // PAGATO MA NON ANCORA USCITO: non cambia dove sta il conto — sta fra i
  // chiusi, coi soldi presi — ma la card lo dice lo stesso, che è il caso
  // strano e non deve sfuggire a chi ci passa sopra gli occhi.
  const pagato = (o) =>
    o.payment_status === 'pagato' || o.workflow_status === ORDER_STATUSES.PAGATO
  const servito = (o) => allServed(o) || o.workflow_status === ORDER_STATUSES.RITIRATO
  const arretrati = effOrders
    .filter((o) => !isChiuso(o) && dayOf(o) && dayOf(o) !== oggiKey)
    .sort((a, b) => String(dayOf(a)).localeCompare(String(dayOf(b))))
  const arretratiIds = new Set(arretrati.map((o) => o.id))
  // Etichetta della giornata dell'ordine: "oggi", "ieri" o la data estesa.
  const dayLabel = (o) => businessDayShort(dayOf(o), new Date(), cutoffHour)
  // Quando è stato APERTO il conto: la giornata da sola non basta — su una
  // board piena serve sapere se quel tavolo è lì da dieci minuti o da un'ora.
  const apertoLabel = (o) => {
    const g = dayLabel(o)
    const t = o.created_at
    if (!t) return g
    try {
      return `${g} ${new Date(t).toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    } catch {
      return g
    }
  }
  // Raggruppa una lista per giornata: prima oggi, poi i giorni scorsi dal
  // più recente. Sta in coda.js, col segnaposto «—» che non esiste più —
  // finiva dritto nel formattatore delle date e in cima al gruppo si
  // leggeva «Invalid Date».
  const groupByDay = (list) => raggruppaPerGiornata(list, { giornataDi: dayOf, oggi: oggiKey })
  // LA RIGA SOPRA UN GIORNO SCORSO. Sotto oggi non ci va: i conti di
  // stasera sono il caso normale e non hanno bisogno di essere annunciati.
  // Cosa c'è scritto lo decide la scheda aperta (intestazioneGiornata): fra
  // i chiusi «Da chiudere» era una bugia. La lista ne ha una sola, i conti
  // IN CORSO, e passa 'attivi'.
  const separatoreGiornata = (day, filtro) =>
    day === oggiKey ? null : (
      <div className="day-sep">
        {intestazioneGiornata(filtro, businessDayLabel(day, new Date(), cutoffHour))}
      </div>
    )

  const ordersOggi = effOrders.filter((o) => !arretratiIds.has(o.id))
  const ordersInVista = soloOggi ? ordersOggi : effOrders
  // RIEPILOGO DI TESTATA: conta ESATTAMENTE i conti che si vedono in coda,
  // qualunque tab sia aperta. Prima contava una lista sua — la giornata — e
  // i numeri non tornavano con quello che c'era sotto: «0 chiusi» sopra una
  // tab piena di conti chiusi. Se cambia la regola di cosa resta in coda,
  // cambia anche il riepilogo, perché è la stessa lista.
  // Si parte dagli ordini GREZZI, non da quelli che la tab sta mostrando:
  // «in corso» nasconde i conti appena chiusi qui e le altre tab no, e il
  // riepilogo cambiava numero solo perché si toccava un filtro.
  const inCoda = ordersRaw.filter((o) =>
    restaInCoda(o, {
      chiuso: isChiuso(o) || annullato(o),
      cassa: cassaAperta?.id ?? null,
      apertaDa: cassaAperta?.opened_at ?? null,
      giornata: dayOf(o),
      oggi: oggiKey,
    })
  )
  const recap = ordersRecap(inCoda, isChiuso)
  // Quanti ticket sono ancora al banco, fra i conti di questa apertura di
  // cassa. Senza gli stati del servizio non vuol dire niente: lì le comande
  // risultano servite alla riscossione, e a bloccare la chiusura basta e
  // avanza il conto ancora aperto.
  const ticketDaServire = workflowOn ? comandeDaServire(inCoda) : 0

  // Leggenda "chi ha aperto l'ordine": lettera → nome per lo staff che ha
  // battuto ordini oggi, più l'eventuale voce Cliente (ordini dall'app).
  // Calcolo semplice (non hook: qui siamo dopo eventuali early-return).
  const legenda = (() => {
    const staff = new Map()
    let hasClient = false
    for (const o of ordersOggi) {
      const L = placedByLetter(o.placed_by)
      if (L) { if (!staff.has(L)) staff.set(L, placedByName(o.placed_by)) }
      else hasClient = true
    }
    return { staff: [...staff.entries()].sort((a, b) => a[0].localeCompare(b[0])), hasClient }
  })()
  // CHI È COLLEGATO si unisce alla legenda, ma solo per chi ha diritto di
  // saperlo: la regola sta in lib/presenza.js, che è dove si decide cosa
  // mostrare a chi. Qui si passa il ruolo e si disegna quello che torna.
  const vociLegenda = legendaConPresenze(legenda.staff, presenze, {
    ruolo,
    uidMio: auth.currentUser?.uid || null,
  })
  // GLI AUTORI DELLA TENDINA: chi ha battuto almeno un conto fra quelli in
  // vista. È la stessa domanda della legenda qui sopra, ma la chiave è
  // l'email e non la lettera — due Marco sulle card si distinguono a
  // fatica, nel filtro sarebbero proprio la stessa persona.
  //
  // SI PAGA SOLO SE SERVE. È una passata su tutta la coda, e a fila chiusa
  // con lo staff non filtrato il risultato lo si butta: la tendina non si
  // disegna, `conAutori` con `autoriScelti == null` torna la lista intera
  // senza guardare l'elenco, e il riassunto non lo chiede nessuno. Con 120
  // conti quella passata rifatta a ogni tasto della ricerca e a ogni
  // snapshot dal server è tempo regalato.
  const autori = filtriVisibili || autoriScelti != null ? autoriDeiConti(ordersInVista) : []
  const autoriAccesi = autoriAttivi(autoriScelti, autori)
  // LO STAFF STA STRINGENDO? e come si chiama quello che è scelto. Servono
  // in due posti lontani — la pastiglia della tendina, che li porta addosso,
  // e l'elenco dei filtri accesi per il title del tastino — e stavano
  // scritti a mano in tutti e due, col secondo che si toglieva l'emoji del
  // primo con un `replace`. Una volta qui, letti da tutti e due.
  const staffFiltra = autoriAccesi.length !== autori.length
  const riassuntoStaff = riassuntoAutori(autoriScelti, autori)
  // La stessa chiave che usa `autoreDi`: serve solo a scrivere «sei tu»
  // accanto al proprio nome nella tendina.
  const emailMia = auth.currentUser?.email?.trim().toLowerCase() || ''

  // Ricerca rapida: numero, cliente, tavolo, drink, chi ha inserito.
  const q = search.trim().toLowerCase()
  // DUE MODI, si sceglie dalle impostazioni (Coda ordini → La ricerca):
  //   filtra    — resta in pagina solo chi risponde (come è sempre stato)
  //   evidenzia — la coda non si tocca: si accende il primo conto trovato
  //               e ce lo si porta sotto gli occhi. Al banco, con la coda a
  //               memoria per posizione, veder sparire tutto il resto vuol
  //               dire perdere il colpo d'occhio proprio mentre si cerca.
  const ricercaEvidenzia = settings.queue_search === 'evidenzia'
  // Cercando esplicitamente si trovano anche i conti dei giorni scorsi
  // (altrimenti sarebbero raggiungibili solo dalla tab "Da chiudere").
  const visibleOrdersTutti =
    q && !ricercaEvidenzia
      ? ordersInVista.filter((o) => ordineCorrisponde(o, q))
      : ordersInVista
  // IL FILTRO DEGLI AUTORI si incrocia con tutto il resto: vale per ogni
  // vista della coda — griglia, corsie, lista, schede — e sta PRIMA degli
  // stati, che sono l'ultima passata (ordiniInCoda, contiPerScheda). Così
  // «Chiusi» + «solo i miei» vuol dire i miei chiusi, e i conteggi delle
  // colonne raccontano la stessa coda che si vede.
  const visibleOrders = conAutori(visibleOrdersTutti, autoriScelti, autori)
  const listView = settings.queue_view === 'lista'
  // ── SI CALCOLA LA VISTA CHE SI GUARDA, NON TUTTE E TRE ─────────
  //
  // Qui dentro convivono quattro modi di guardare la stessa coda — griglia,
  // corsie, lista unica, schede — e se ne mostra UNO. Venivano preparati
  // tutti a ogni disegno: con 120 conti erano circa diciotto passate
  // complete sulla lista e quattro ordinamenti, buttati via tre volte su
  // quattro. E ridisegnare capita a ogni tasto premuto nella ricerca, a
  // ogni card aperta, a ogni snapshot dal server: in una serata piena sono
  // centinaia.
  //
  // Adesso ogni catena ha la sua guardia. Quella non in pagina resta vuota,
  // e chi la legge — sempre da dentro il suo ramo di JSX — non se ne
  // accorge.
  const vistaSchede = !gridView && !corsieView && !listView
  const buckets = listView || vistaSchede ? bucketByStatus(visibleOrders) : {}
  const list = buckets[statusTab] || []
  // Vista a lista unica: ordini in corso (per numero) + evasi.
  const inCorso = listView
    ? [
        ...(buckets[ORDER_STATUSES.RICEVUTO] || []),
        ...(buckets[ORDER_STATUSES.IN_PREPARAZIONE] || []),
        ...(buckets[ORDER_STATUSES.PRONTO] || []),
      ].sort((a, b) => (a.daily_number || 0) - (b.daily_number || 0))
    : []
  const evasi = listView
    ? [...(buckets[ORDER_STATUSES.RITIRATO] || []), ...(buckets[ORDER_STATUSES.PAGATO] || [])]
    : []
  // Vista a griglia: di default gli ordini in corso; col filtro si vedono
  // anche i chiusi/pagati o TUTTI gli ordini in vista.
  const isClosed = isChiuso
  // Chiusi e annullati di prima dell'ultima chiusura di cassa non sono coda:
  // stanno in Cassa. La composizione sta in coda.js, ed è quella provata dai
  // test.
  // Le tre schede della vista a schede SENZA stati di servizio: contate e
  // riempite con le stesse regole della griglia.
  const schedeSemplici = schedeCoda(workflowOn)
  // Cosa resta in coda per QUESTA apertura di cassa: le opzioni sono le
  // stesse per tutte le viste, e scriverle una volta è anche il modo di non
  // farle divergere.
  const restaInCodaOpts = {
    isChiuso: isClosed,
    cassa: cassaAperta?.id ?? null,
    apertaDa: cassaAperta?.opened_at ?? null,
    giornataDi: dayOf,
    oggi: oggiKey,
  }
  // LE SCHEDE, SMISTATE UNA VOLTA SOLA. Servono alle linguette (tre
  // conteggi), alla scheda aperta e alle corsie: erano sei giri di tre
  // filtri sulla stessa lista, adesso è uno.
  const perScheda =
    corsieView || vistaSchede ? contiPerScheda(visibleOrders, restaInCodaOpts) : SCHEDE_VUOTE
  const boardOrders = gridView
    ? ordiniInCoda(visibleOrders, {
        ...restaInCodaOpts,
        filtro: stato,
        sottoChiusi,
      })
        .slice()
        .sort((a, b) => ((a.daily_number || 0) - (b.daily_number || 0)) * (ordineDesc ? -1 : 1))
    : []
  // Ordini POS in invio. Finché il placeholder è attivo l'ordine reale
  // resta nascosto: il match usa il client_temp_id scritto sull'ordine
  // (deterministico anche se lo snapshot arriva PRIMA che il placeholder
  // conosca il realId — era la causa del doppione per un attimo).
  const pendingRealIds = new Set(pend.pending.filter((p) => p.realId).map((p) => p.realId))
  const pendingTempIds = new Set(pend.pending.map((p) => p.tempId))
  const visibleBoard = boardOrders.filter(
    (o) =>
      !pendingRealIds.has(o.id) &&
      !(o.client_temp_id && pendingTempIds.has(o.client_temp_id))
  )
  const boardGroups = gridView ? groupByDay(visibleBoard) : []
  // LE CORSIE DI STATO: partono dalla stessa lista delle altre viste —
  // quello che resta in coda per questa apertura di cassa, già passato per
  // ricerca e tendina dello staff — e la smistano. Le regole di cosa sta
  // dove stanno in lib/coda.js, che è dove si provano.
  // ORDINATE COME LE ALTRE VISTE. Il tasto «↕» girava solo la griglia: qui
  // la lista arrivava com'era, e premerlo non faceva niente di visibile —
  // un tasto che non risponde fa dubitare dell'app, non del tasto. L'ordine
  // vale per TUTTE le corsie insieme: si guarda la coda, non una colonna.
  // Le comande sono già quelle di questo terminale: le mette effOrders, in
  // cima alla catena, e da lì scendono a tutte le viste. Prima le rimetteva
  // anche qui, e la vista dei conti — che stava su un'altra memoria — no.
  const contiInCorsia = corsieView
    ? perScheda.tutti
        .slice()
        .sort((a, b) => ((a.daily_number || 0) - (b.daily_number || 0)) * (ordineDesc ? -1 : 1))
    : []

  // CHI GUARDA DECIDE COSA VEDE. Sono due domande diverse davanti allo
  // stesso schermo, e rispondere a tutti e due con la stessa vista vuol
  // dire darla sbagliata a uno dei due:
  //
  //   AL BANCO interessa il LAVORO — le COMANDE, una per una, nel passo in
  //   cui stanno: chi sta allo shaker prepara un ticket per volta, non un
  //   conto, e un conto con tre comande in tre passi diversi disegnato come
  //   una card sola racconta una bugia comunque la si metta.
  //
  //   A CHI GUARDA LA SERATA interessa com'è messo il CONTO: in corso,
  //   chiuso, annullato. Sono le tre cose che un conto può essere, le
  //   stesse della griglia e delle schede.
  //
  // Al banco la vista è già quella: la accendono gli stati del servizio
  // (vistaBanco), e non c'è niente da scegliere — un tasto che porta
  // altrove è solo un modo per perdersi la coda a metà serata. Chi guarda
  // la serata parte dai CONTI, come ha sempre fatto, e con la pastiglia
  // può andare a vedere il lavoro: è un passaggio a mano, di questo
  // terminale (vistaCorsie), non il suo default.
  //
  // Senza gli stati del servizio i passi non esistono per nessuno — un
  // conto è solo aperto, chiuso o annullato — e restano le tre corsie.
  // LA PASTIGLIA C'È CON QUALUNQUE VISTA DELLA CODA, non solo a corsie: la
  // vista del banco è una vista a sé, non una variante delle corsie. Chi
  // tiene la cassa lavora in griglia perché è quella che gli serve per i
  // conti, ma a metà serata vuole dare un'occhiata a com'è messa la
  // preparazione: senza questo tasto doveva cambiare vista in Impostazioni,
  // guardare, e tornare a rimetterla com'era. Al banco la pastiglia non
  // c'è: lì non c'è niente da scegliere.
  const puoScegliere = workflowOn && !vistaBanco
  const corsieBanco = bancoCorsie || guardaComande
  // Il ritiro esiste solo dove il locale lo fa: col solo servizio non c'è
  // niente da separare, e la scelta non si propone nemmeno.
  const ritiroEsiste = mondoConsegna(settings) === 'entrambi'
  // Come si chiamano le due metà del servizio in QUESTO locale: i titoli
  // delle corsie, i chip delle colonne e le porzioni del tasto dei chiusi
  // li prendono tutti da qui (nomiDelServizio), o divergono al primo
  // ritocco.
  const nomiServizio = nomiDelServizio(ritiroEsiste)
  // E come si chiamano le due colonne che nascono dividendo il pronto: sono
  // i titoli delle corsie stesse (CORSIE_PRONTO_DIVISO), non due parole
  // ribattute nell'annuncio del ✂️ — rinominarne una lasciava lo screen
  // reader a dire il nome vecchio.
  const [meta1, meta2] = CORSIE_PRONTO_DIVISO.map((c) => c.titolo)
  const divisioneP = corsieDelPronto({ divise: prontoSeparato, ritiroEsiste })
  const corsieDelBanco = corsieBanco
    ? corsieComande(contiInCorsia, {
        isChiuso: isClosed,
        prontoDiviso: divisioneP,
        ritiroEsiste,
      })
    : []
  // LE CORSIE DEI CONTI PARLANO DEL CONTO, non del lavoro: «In corso»,
  // «Chiusi», «Annullati» sono le tre cose che un CONTO può essere, e per
  // un conto chiuso vuol dire incassato — la stessa regola di tutta la coda
  // dei conti (isChiuso, qui sopra).
  const corsie = corsieBanco
    ? []
    : corsieDiStato(contiInCorsia, { isChiuso, sottoChiusi })
  // Le colonne spente su questo terminale si tolgono qui, DOPO che sono
  // state riempite: così i conteggi non cambiano a seconda di cosa si
  // guarda, e riaccendendone una la si trova già piena.
  const corsieMostrate = corsieBanco
    ? corsieDaMostrare(corsieDelBanco, nascoste, { passoDiNascita })
    : corsie
  // Le colonne che si possono accendere e spegnere a mano: da qui escono i
  // chip, uno per colonna, dentro la fila dei filtri.
  const sceglibili = corsieBanco ? corsieSceglibili(corsieDelBanco, { passoDiNascita }) : []
  const cambiaPronto = () => {
    const nuovo = !prontoSeparato
    setProntoSeparato(nuovo)
    ricordaProntoDiviso(nuovo)
  }
  const cambiaCorsia = (id) => {
    const via = nascoste.includes(id) ? nascoste.filter((x) => x !== id) : [...nascoste, id]
    setNascoste(via)
    ricordaCorsieNascoste(via)
  }
  // LE DUE DOMANDE, in una pastiglia sola. Chi guarda la serata vuole
  // sapere sia come sta andando (i CONTI) sia a che punto è la preparazione
  // (le COMANDE): l'interruttore passa dall'una all'altra e si ricorda su
  // questo terminale. Sta in tutte le viste della coda — griglia, lista,
  // schede, corsie — perché la vista del banco è una vista A SÉ, non una
  // variante delle corsie: chi tiene la cassa lavora in griglia, e per dare
  // un'occhiata al banco non deve passare dalle Impostazioni e poi tornare
  // a rimettere tutto com'era. È scritta qui una volta e appesa dove serve.
  // Al banco non c'è: lì la risposta è sempre il lavoro, e un tasto che
  // porta altrove è solo un modo per perdersi la coda a metà serata.
  const cambiaVista = () => {
    const nuova = corsieBanco ? 'conti' : 'comande'
    setVista(nuova)
    ricordaVistaCorsie(nuova)
  }
  // ── I CHIUSI SONO UN TASTO SOLO, A TRE PORZIONI ──────────────────
  //
  // «La cosa di servire e serviti unisci i tasti con chiusi, quindi tasto
  // grande con tre selezioni. Se seleziono chiusi, vedo le altre due
  // porzioni del tasto e posso filtrare Chiusi: sia da servire che
  // serviti, serviti solo quelli serviti, da servire quelli da servire»
  // (l'utente, 20/08/2026).
  //
  // ERANO CHIP FRATELLI IN FILA, indistinguibili dagli stati che stavano
  // accanto: «Chiusi», «Serviti» e «Da servire» sembravano tre filtri
  // dello stesso rango, mentre gli ultimi due sono una domanda DENTRO il
  // primo — e comparivano dal nulla a metà riga, spostando tutto quello
  // che avevano dopo. Attaccati nello stesso gruppo (`.chip-gruppo`,
  // DESIGN.md) si legge quello che sono: un tasto solo che si apre.
  //
  // IL NEUTRO È NESSUNA DELLE DUE ACCESA — tutti i chiusi — e resta la
  // semantica di prima: accendere una porzione stringe, ritoccarla torna
  // al neutro, le due sono esclusive fra loro. Non c'è una porzione
  // «Tutti»: sarebbe accesa quasi sempre e direbbe «nessun filtro»
  // sembrando un filtro.
  //
  // SOLO COGLI STATI DEL SERVIZIO ACCESI: «sono attivi solo quando sono
  // attivi gli stati di servizio» (l'utente). Senza la preparazione, tutto
  // quello che è stato pagato è uscito per definizione e la domanda non
  // esiste. E i NOMI seguono il ritiro (nomiDelServizio): dove al banco
  // non si ritira, «/Ritirare» nominerebbe una cosa che nel bar non
  // succede.
  //
  // Il ternario `workflowOn ? … : null` che stava qui dentro non serviva:
  // tutti e due i chiamanti sono già dietro `workflowOn`, e una guardia che
  // non può essere falsa fa credere che il caso esista.
  const porzioniChiusi = () =>
    sottofiltriChiusi(ritiroEsiste).map(([k, label]) => (
      <button
        key={k}
        className={`chip ${sottoChiusi === k ? 'active' : ''}`}
        onClick={() => setSottoChiusi((s) => cambiaSottoChiusi(s, k))}
        aria-pressed={sottoChiusi === k}
        title={`Dei conti chiusi, solo quelli ${k === 'serviti' ? 'usciti per intero' : 'con ancora qualcosa da portare'}`}
      >
        {label}
      </button>
    ))

  // IL GRUPPO CHE LE TIENE INSIEME, scritto una volta. Erano due
  // `<div className="chip-gruppo">` battuti a mano nei due rami — in
  // griglia col chip «Chiusi» dentro, nelle corsie senza — e i due
  // `aria-label` avevano già preso strade diverse: «Dei conti chiusi» e
  // «Conti chiusi». Chi non vede lo schermo sentiva due nomi per lo stesso
  // tasto a seconda della vista.
  const gruppoChiusi = (dentro, chiave) => (
    <div key={chiave} className="chip-gruppo" role="group" aria-label="Conti chiusi">
      {dentro}
    </div>
  )

  // IL TASTO DICE DOVE PORTA, non dove si è. Era una pastiglia «Comande»
  // che si accendeva quando le comande le stavi già guardando: un
  // interruttore che si legge solo sapendo com'è messo adesso, e per
  // saperlo bisognava guardare le colonne. Un tasto si legge da sé — c'è
  // scritto quello che succede a premerlo — e vale anche per chi arriva
  // davanti allo schermo senza sapere chi c'è stato prima.
  //
  // STA IN TESTATA, COI TASTINI DELLE AZIONI. Prima era una pastiglia in
  // fondo a destra nella riga dei filtri, ed è dovuta uscire di lì: quella
  // riga adesso, da chiusa, non esiste proprio (REQ-CODA-008) — e il
  // cambio vista deve restare a UN tocco sempre, non un tocco per riaprire
  // la riga e uno per cambiare. Nella testata è già il posto di quello che
  // «si può fare adesso» (docs/navigazione.md), sta accanto a stampante,
  // pannelli e ordinamento, e non costa una riga a nessuno.
  //
  // SOLO ICONA, e il nome per esteso nel title: qui la larghezza è della
  // ricerca. «🧾» porta ai conti, «🍸» alle comande — e resta un tasto che
  // dice DOVE PORTA, non dove si è.
  const tastoVista = puoScegliere ? (
    <button
      className="btn ghost small board-icona"
      onClick={cambiaVista}
      title={corsieBanco ? 'Torna ai conti' : 'Guarda le comande al banco'}
      aria-label={corsieBanco ? 'Ordini' : 'Comande'}
    >
      {corsieBanco ? '🧾' : '🍸'}
    </button>
  ) : null

  // ── CHI HA APERTO IL CONTO: LA TENDINA DEGLI AUTORI ─────────────────
  //
  // C'è in tutte le viste della coda ed è sempre la stessa — una
  // implementazione, appesa dove serve, come il cambio vista. Era «✍️
  // Miei», acceso o spento; adesso dentro ci sono tutti quelli che hanno
  // battuto almeno un conto, accesi di suo, e si spegne chi non interessa
  // (REQ-CODA-009).
  //
  // SI CHIAMA «STAFF». Per un giro si era chiamata «Autori» — «la dropdown
  // che hai chiamato Autori chiamala Staff» (l'utente, 20/08/2026) — e ha
  // ragione: «autore» è una parola da redazione, la squadra della serata è
  // lo staff. Dentro il codice i nomi restano `autori*`: rinominarli a
  // tappeto costa un diff che non serve a nessuno (CLAUDE.md), ed è lo
  // SCHERMO che deve parlare italiano da bar.
  //
  // È UNA TENDINA, in deroga a docs/navigazione.md — «i filtri stanno in
  // riga, non in una tendina, che costringe ad aprirla per sapere cosa c'è
  // dentro». L'ha chiesta l'utente («il filtro miei dovrebbe diventare un
  // menu a tendina», 20/08/2026) e qui la deroga si regge da sé: i nomi
  // sono quanti sono i turni — sei, otto, dieci — e in riga sarebbero
  // dieci pastiglie che scorrono, cioè la riga che stiamo togliendo. La
  // pastiglia dice comunque cosa è scelto senza aprirla (`riassuntoAutori`).
  //
  // Si riusa `Tendina`, che sa già chiudersi al tocco fuori e con Esc:
  // scriverne un'altra qui vuol dire scrivere di nuovo quei due ascolti, e
  // sbagliarne uno.
  //
  // L'EMOJI STA QUI, non dentro `riassuntoAutori`: è il vestito della
  // pastiglia, e questo è l'unico posto che lo vuole — il title del
  // tastino «▾ Filtri» vuole il nome nudo, e prima se la toglieva con un
  // `replace` (un secondo posto da tenere d'accordo su una stringa).
  //
  // LE VOCI SI COSTRUISCONO ALL'APERTURA. `Tendina` accetta un
  // figlio-funzione e lo chiama solo quando il pannello è aperto: la
  // tendina sta chiusa quasi sempre, e quei bottoni sono quanti sono i
  // turni della serata.
  const tendinaStaff =
    autori.length > 0 ? (
      <Tendina
        etichetta="Chi ha aperto il conto"
        riassunto={`✍️ ${riassuntoStaff}`}
        attivo={staffFiltra}
        largo={240}
      >
        {() => (
          <>
            {/* NON SI CHIUDE AL PRIMO TOCCO: qui si deselezionano più
                persone di fila, e una tendina che sparisce a ogni scelta va
                riaperta ogni volta. Si chiude fuori, o con Esc. */}
            <div className="tendina-titolo">Chi ha aperto il conto</div>
            {autori.map((v) => (
              <button
                key={v.chiave}
                type="button"
                className={`tendina-voce${autoriAccesi.includes(v.chiave) ? ' scelta' : ''}`}
                onClick={() => setAutoriScelti((s) => cambiaAutoreScelto(s, v.chiave, autori))}
                aria-pressed={autoriAccesi.includes(v.chiave)}
              >
                <span>
                  {v.chiave === AUTORE_CLIENTE ? '🌐 ' : ''}
                  {v.nome}
                  {v.chiave === emailMia && <span className="muted small"> · sei tu</span>}
                </span>
              </button>
            ))}
          </>
        )}
      </Tendina>
    ) : null

  const cambiaFiltri = () => {
    const aperti = !filtriVisibili
    setFiltriVisibili(aperti)
    ricordaFiltriAperti(aperti)
  }

  // IL TASTINO CHE APRE I FILTRI. «Non ci siamo capiti: il tasto per
  // mostrare/nascondere i filtri deve essere un tasto piccolo e i filtri
  // devono uscire sotto. Come il tasto che mostra/nasconde i prodotti da
  // una card delle comande» (l'utente, 20/08/2026).
  //
  // COSA MOSTRA È GIUSTO COSÌ: chevron ▾/▴ e la parola «Filtri». COM'È
  // VESTITO no, ed è cambiato due volte in un giorno. Era un tastino
  // quadrato da 44px (`board-icona`, la famiglia di 📟 e ＋); è diventato
  // il pattern di `.corsia-piu` — niente riquadro, colore attenuato — e da
  // lì l'utente l'ha rimandato indietro a metà strada: «Ok, così com'è
  // filtri, aggiungi un bordo e rendilo un bottone ma lascia la freccetta
  // e la scritta filtri. Il tasto non farlo troppo alto come gli altri»
  // (20/08/2026).
  //
  // Quindi: BOTTONE VERO, col riquadro, ma BASSO — non i 44px dei tasti che
  // fanno qualcosa alla serata. Un tasto che governa come si guarda la coda
  // si deve vedere che è un tasto, e non deve pesare come «Incassa».
  //
  // A DESTRA, INSIEME ALL'ORDINAMENTO: «il tasto dei filtri deve essere
  // sulla destra insieme a quello dell'ordinamento non a sinistra dei
  // filtri» (20/08/2026). Stanno in fondo alla riga dei conteggi, che c'è
  // comunque: da chiusi costano ZERO altezza.
  //
  // NON PORTA NESSUN NUMERO, ed è una decisione presa dopo averlo provato
  // quattro volte. «Sì ma infatti togliamo quel numero. Non serve»
  // (l'utente, 22/08/2026). La storia per esteso — i quattro criteri e
  // perché nessuno reggeva — sta accanto a `spiegaFiltri` in coda.js:
  // qui basta sapere che non è una dimenticanza.
  const tastoFiltri = (
    <button
      className="coda-tastino"
      onClick={cambiaFiltri}
      aria-expanded={filtriVisibili}
      // IL NOME NON CAMBIA MAI: chi lo cerca lo cerca come «Filtri». Quello
      // che cambia è il title, che dice il gesto — aprire o chiudere.
      aria-label="Filtri"
      title={spiegaFiltri(filtriVisibili)}
    >
      {filtriVisibili ? '▴' : '▾'} Filtri
    </button>
  )

  // IL VERSO DELLA CODA. È UN BOTTONE, GEMELLO DEL TASTO DEI FILTRI: stesso
  // riquadro, stessa altezza, uno accanto all'altro. «Non ti avevo chiesto
  // di farlo per il tasto dell'ordinamento. Il tasto dell'ordinamento deve
  // essere come gli altri, solo i filtri si nascondono in quel modo» — e
  // poi, sulla misura di tutti e due: «Il tasto non farlo troppo alto come
  // gli altri, stessa cosa per la freccetta dell'ordinamento. Stessa
  // dimensione dei filtri» (l'utente, 20/08/2026).
  //
  // NON SI NASCONDE MAI, e questa è la differenza vera: non è un filtro, è
  // il verso in cui si legge la coda. Il tasto accanto apre e chiude i
  // chip; questo gira la lista e resta a schermo sempre.
  //
  // SOLO L'ICONA, quindi il riquadro si fa quadrato (`solo-icona`): una
  // pastiglia lunga attorno a una freccia sola è tutta aria.
  //
  // NOME E ICONA VENGONO DA `spiegaOrdine`, insieme: erano due ternari
  // scritti a mano in due punti — la testata e il ⋯ — e già divergevano.
  // Adesso è una regola sola, provata a unità, e dice DOVE SEI: «Prima i
  // più recenti» / «Prima i più vecchi» (il perché sta in coda.js).
  const verso = spiegaOrdine(ordineDesc)
  const tastoOrdine = (
    <button
      className="coda-tastino solo-icona"
      onClick={cambiaOrdine}
      title={verso.nome}
      aria-label={verso.nome}
    >
      {verso.icona}
    </button>
  )

  // I DUE TASTINI, appesi a una riga che esiste già — la riga dei conteggi
  // sulle lavagne, la riga della ricerca in lista e schede. «Devi rivedere
  // la UX e migliorarla sempre tenendo presente il fatto che ci serve
  // spazio verticale» (l'utente, 20/08/2026): a filtri chiusi la coda non
  // paga NIENTE per averli, né una riga né un margine.
  const tastini = (
    <span className="coda-tastini">
      {tastoFiltri}
      {tastoOrdine}
    </span>
  )

  // ── LA FILA DEI FILTRI: UNA SOLA, PER TUTTE E QUATTRO LE VISTE ───────
  //
  // «I filtri e tutti i bottoni li voglio a scomparsa, con un tasto che non
  // occupi troppo spazio, sia per ordini sia per comande» (l'utente,
  // 20/08). In griglia erano arrivati a sette e anche compattati si
  // mangiavano la riga intera; nelle corsie sono meno, ma è la stessa coda
  // e un meccanismo per vista sarebbero quattro cose da imparare.
  //
  // I CHIP COMPAIONO NELLA STESSA RIGA — che va a capo o scorre come ha
  // sempre fatto — non in una tendina: sono pochi, si toccano a raffica
  // mentre si lavora, e un pannello sopra la coda coprirebbe proprio quello
  // che si sta guardando per decidere che filtro serve.
  //
  // DENTRO CI VA SOLO QUELLO CHE RESTRINGE LA LISTA, più i due tastini che
  // la governano. Il cambio vista sta FUORI, in testata
  // (docs/navigazione.md): non filtra, cambia quello che si guarda — e
  // l'utente non ha chiesto di spostarlo. Il «＋» sta nella testata e non
  // c'entra affatto: crea.
  //
  // DA CHIUSA LA RIGA NON ESISTE. «I filtri devono uscire sotto» (l'utente,
  // 20/08/2026): il tastino sta su una riga che c'era comunque, i chip
  // escono in una riga sotto, e chiudendo quella riga se ne va del tutto —
  // niente altezza, niente margini, niente riga di due tastini come nel
  // giro precedente. È il verso giusto per una lavagna che si guarda da
  // lontano: ogni riga sprecata è una comanda in meno a schermo.
  //
  // I TASTINI NON STANNO PIÙ QUI DENTRO: sono in fondo alla riga sopra
  // (`tastini`), a destra. Prima aprivano la fila da dentro la fila stessa,
  // e la fila doveva quindi esistere sempre.
  //
  // PRENDE UNA FUNZIONE, non i chip già fatti. Riceverli fatti vuol dire
  // costruirli PRIMA di sapere se la fila si disegna: a filtri chiusi —
  // com'è quasi sempre, ed è tutto il punto della scomparsa — erano un
  // albero di elementi costruito e buttato a ogni disegno. Così la fila
  // chiusa non costa niente davvero, non solo a schermo.
  //
  // DOVE STA LA RIGA lo dice il CSS del contesto (`.board-sotto
  // .chips-filtri` sulle lavagne, la riga di lista e schede sotto la
  // ricerca): i margini erano un `style` inline passato da un chiamante
  // solo, cioè una regola di foglio scritta in JavaScript.
  const filaFiltri = (chip) =>
    filtriVisibili ? <div className="chips-filtri">{chip()}</div> : null

  // ── «SOLO OGGI», DOVUNQUE SIA ACCESO ─────────────────────────
  //
  // Nasconde i conti rimasti aperti dai giorni scorsi, che di suo stanno in
  // coda sotto la loro data. NON È UN FILTRO DELLA SOLA GRIGLIA: taglia
  // `ordersInVista`, la lista da cui scendono tutte e quattro le viste — ma
  // il chip nasceva solo lì. Chi lo accendeva in griglia e poi passava alle
  // comande si portava dietro il taglio, senza un chip per spegnerlo e
  // senza niente a schermo che lo dicesse: una coda che sembra sbagliata.
  //
  // FUORI DALLA GRIGLIA COMPARE SOLO DA ACCESO, e lì serve a rimettere la
  // coda com'era: i conti dei giorni scorsi si vanno a cercare in griglia,
  // che è la vista che li raggruppa per data.
  const chipSoloOggi = (gridView ? arretrati.length > 0 || soloOggi : soloOggi) && (
    <button
      className={`chip ${soloOggi ? 'active' : ''}`}
      onClick={() => setSoloOggi((v) => !v)}
      title={
        arretrati.length
          ? `Nascondi i ${arretrati.length} conti rimasti aperti dai giorni scorsi`
          : 'Nascondi i conti rimasti aperti dai giorni scorsi'
      }
    >
      📅 Solo oggi{arretrati.length ? ` (${arretrati.length})` : ''}
    </button>
  )

  // Il chip di una colonna: acceso = la colonna è a schermo. Scritto una
  // volta sola perché lo disegnano due rami — dentro il gruppo del pronto
  // e fuori — e due copie divergono al primo ritocco.
  const chipColonna = (c) => (
    <button
      key={c.id}
      className={`chip ${nascoste.includes(c.id) ? '' : 'active'}`}
      onClick={() => cambiaCorsia(c.id)}
      aria-pressed={!nascoste.includes(c.id)}
    >
      {c.titolo}
    </button>
  )

  // ── I FILTRI DELLE CORSIE, SULLA RIGA DEI CONTEGGI ──────────────
  //
  // Erano una riga a sé fra i conteggi e le testate delle colonne: tre
  // livelli prima di vedere una comanda, per due pastiglie corte. Quella
  // lavagna si guarda da lontano mentre si versa, e ogni riga sprecata è
  // una comanda in meno a schermo.
  //
  // La riga dei conteggi è corta — «12 aperti · 40 chiusi · 380,00 €» — e
  // ha spazio a destra: da lì in su i filtri ci stanno accanto, e la riga
  // sparisce. Sul telefono no: lì la riga dei conteggi è già piena, e i
  // filtri tornano sotto e scorrono in orizzontale come hanno sempre
  // fatto. A dire da dove in su è la LAVAGNA (container query `corsie`),
  // non la finestra: col menu agganciato ha 200-250px in meno.
  //
  // Qui dentro c'è SOLO quello che restringe la lista: il cambio vista è
  // salito in testata coi tastini delle azioni (docs/navigazione.md).
  //
  // SI COSTRUISCE SOLO SE È LA VISTA CHE SI GUARDA — è la stessa guardia
  // che hanno già `boardOrders`, `perScheda` e `buckets` («SI CALCOLA LA
  // VISTA CHE SI GUARDA», più sopra): prima si costruivano tutte e due le
  // file, corsie e griglia, e una delle due finiva sempre nel cestino.
  const filtriCorsie = corsieView
    ? filaFiltri(() => (
      <>
        {tendinaStaff}
        {/* E se il taglio dei giorni scorsi è rimasto acceso passando qui
            dalla griglia, il chip per spegnerlo c'è (vedi `chipSoloOggi`). */}
        {chipSoloOggi}
        {/* LE DUE PORZIONI DEI CHIUSI stanno qui, in riga con gli altri:
            nelle corsie dei conti la colonna «Chiusi» c'è sempre, quindi la
            domanda ha sempre senso e non c'è nessun «Chiusi» da accendere a
            cui attaccarle — restano un tasto a due porzioni, con lo stesso
            vestito che hanno in griglia. Al banco no: lì si guardano le
            comande, e i conti chiusi non hanno una colonna. */}
        {!corsieBanco && workflowOn && gruppoChiusi(porzioniChiusi())}
        {/* QUALI COLONNE TENERE A SCHERMO. A metà serata chi sta allo
            shaker guarda «Da fare» e «Al banco», e le altre due gli
            mangiano mezzo schermo per roba che in quel momento non lo
            riguarda. È una scelta di QUESTO terminale e si ricorda.
            ED È UN FILTRO a tutti gli effetti — restringe quello che si
            vede — quindi sta dentro la scomparsa con gli altri.

            UN CHIP PER COLONNA, IN FILA COI FRATELLI. C'era davanti un
            «▦ Colonne» che apriva i loro chip: due livelli di nascondimento
            uno dentro l'altro, e da quando la fila intera sta dietro
            «▾ Filtri» il primo non serviva più a niente — «togli il testo
            colonne e metti tutti i tasti che si aprono cliccando colonne al
            posto di colonne. Non c'è più bisogno visto che nascondiamo tutto
            con filtri» (l'utente, 20/08/2026). Adesso sono sei o sette in
            fila: la riga va a capo da sé, che è il capo naturale del flusso.
            Quante ne sono spente lo dice il badge del tastino a fila chiusa,
            dove la cosa serve davvero — a fila aperta si vede dai chip. */}
        {/* IL TAGLIO DEL PRONTO STA ATTACCATO AL SUO CHIP. Era un chip a sé
            in fondo alla fila, «✂️ Dividi il pronto»: «dobbiamo integrarlo
            meglio con gli altri due bottoni, in qualche modo non si capisce
            a che serve. E poi è troppo lungo» (l'utente, 20/08/2026).
            Adesso è un tastino appeso al chip della colonna che divide —
            «Da servire/Ritirare ✂️» — e premendolo, NELLO STESSO POSTO,
            compaiono «Da servire» e «Da ritirare» accoppiati col loro 🔗
            per riunirli. L'interruttore
            sta dove agisce, e il suo effetto si vede lì: niente frase da
            leggere, niente chip orfano lontano dalla colonna di cui parla.
            Come si raggruppano lo dice `gruppiColonne` in coda.js. */}
        {corsieBanco &&
          gruppiColonne(sceglibili, { taglioPossibile: ritiroEsiste }).map((g) => {
            // Diviso = il gruppo tiene due corsie invece di una. Lo dicono le
            // corsie stesse: un campo `diviso` accanto a loro era la stessa
            // cosa scritta due volte, e due scritture si contraddicono.
            const diviso = g.corsie.length > 1
            return g.taglio ? (
              <div key={g.id} className="chip-gruppo">
                {g.corsie.map(chipColonna)}
                {/* UN BOTTONE SUO, non un'icona cliccabile dentro un altro
                    bottone: accende una colonna e dividerla sono due cose
                    diverse, e chi naviga da tastiera o con lo screen reader
                    deve poterle distinguere. Il gruppo le tiene insieme
                    solo agli occhi.
                    IL SEGNO DICE COSA FA, NON COM'È MESSO: ✂️ da unito,
                    🔗 da diviso. Un ✂️ «acceso» direbbe comunque «taglia»
                    mentre l'unica cosa che può fare è ricucire — e da
                    lontano, sulla lavagna, si legge il segno, non il
                    colore. Com'è messo adesso lo dicono i chip accanto, che
                    è tutto il punto di averlo messo lì. */}
                {/* I NOMI DELLE DUE META' SONO QUELLI DELLE CORSIE
                    (`CORSIE_PRONTO_DIVISO`), non due parole ribattute qui:
                    scritti a mano, rinominare una colonna divisa lasciava
                    l'annuncio a dire il nome vecchio — e chi non vede lo
                    schermo è proprio chi non può accorgersene. */}
                <button
                  type="button"
                  className={`chip chip-taglio${diviso ? ' active' : ''}`}
                  onClick={cambiaPronto}
                  aria-label={
                    diviso
                      ? `Riunisci «${meta1}» e «${meta2}» in una colonna «${nomiServizio.daServire}»`
                      : `Dividi «${nomiServizio.daServire}» in «${meta1}» e «${meta2}»`
                  }
                  title={
                    diviso
                      ? `Riunisci «${meta1}» e «${meta2}» in una colonna sola, col badge sulla card`
                      : `Dividi «${nomiServizio.daServire}» in «${meta1}» e «${meta2}»`
                  }
                >
                  <span aria-hidden>{diviso ? '🔗' : '✂️'}</span>
                </button>
              </div>
            ) : (
              g.corsie.map(chipColonna)
            )
          })}
      </>
      ))
    : null

  // ── I FILTRI DELLA GRIGLIA, SULLA STESSA RIGA DELLE CORSIE ─────────
  //
  // «Rispetto alla vista corsie li vorrei nello stesso punto» (l'utente,
  // 20/08). Erano una riga a sé fra la testata e la prima card, e non c'è
  // motivo perché due viste della STESSA coda mettano i loro filtri in due
  // posti diversi: chi passa dall'una all'altra deve ritrovarli dov'erano.
  //
  // QUI SONO CINQUE, non due come nelle corsie (BUG-042), e sui 1000-1300px
  // del banco non ci stavano accanto ai conteggi nemmeno scorrendo: per
  // questo escono in una riga tutta loro. VA A CAPO, NON SCORRE, e non è un
  // gusto: dentro un contenitore che scorre in orizzontale il pannello
  // della tendina dello staff — che è `position: absolute` — verrebbe
  // TAGLIATO, e si aprirebbe dentro una riga alta 40px. La riga esiste solo
  // da aperta e per scelta di chi guarda: se sul telefono i chip vanno su
  // due righe, sono due righe che qualcuno ha chiesto, e si tolgono
  // richiudendo. E la più lunga resta accorciata: «📅 Solo oggi (3)»
  // invece di «📅 Solo oggi (3 da chiudere)», e cosa siano quei tre lo dice
  // il titolo.
  //
  // Anche questa si costruisce SOLO se è la vista che si guarda (vedi
  // `filtriCorsie`).
  const filtriOrdini = gridView
    ? filaFiltri(() => (
      <>
        {/* I TRE STATI, ESCLUSIVI. Uno acceso vuol dire «sto guardando
            quello», e gli altri due si spengono: «riportiamo aperti, chiusi
            e annullati come mutuamente esclusivi» (l'utente, 20/08/2026).
            Restano `aria-pressed` e non delle linguette — sono filtri di
            questa coda, non tre code diverse (REQ-CODA-009).
            E «CHIUSI» NON È UN CHIP SOLO: è un tasto a tre porzioni, che si
            apre quando lo si accende. Da spento si vede solo lui; acceso,
            accanto compaiono «Da servire/Ritirare» e «Serviti/Ritirati»,
            attaccate nello stesso gruppo perché sono una domanda DENTRO i
            chiusi e non due filtri fratelli. */}
        {FILTRI_STATO.map(([k, label]) => {
          const chip = (
            <button
              key={k}
              className={`chip ${stato === k ? 'active' : ''}`}
              onClick={() => setStato(k)}
              aria-pressed={stato === k}
            >
              {label}
            </button>
          )
          if (k !== 'chiusi' || stato !== 'chiusi' || !workflowOn) return chip
          return gruppoChiusi(
            <>
              {chip}
              {porzioniChiusi()}
            </>,
            k
          )
        })}
        {tendinaStaff}
        {/* C'ERA UN «NASCONDI PAGATI», E NON SERVE PIÙ. Serviva a togliere
            dagli occhi i conti già incassati ma non ancora serviti, perché
            restavano in mezzo a quelli in corso: adesso un conto pagato è
            chiuso, sta fra i chiusi, e chi vuole sapere quali hanno ancora
            roba da portare lo chiede lì dentro («Da servire»). */}
        {/* Conti dei giorni scorsi: di default sono in coda, sotto la loro
            data. Questo tasto li nasconde e lascia solo oggi — ed è lo
            stesso chip delle altre viste, che il taglio se lo portano
            dietro (vedi `chipSoloOggi`). */}
        {chipSoloOggi}
      </>
      ))
    : null

  // IL CONTO ACCESO. Solo nel modo "evidenzia": è il primo che risponde
  // NELL'ORDINE IN CUI STA SULLO SCHERMO — non nell'ordine in cui arrivano
  // dal database, altrimenti si accende un conto e lo scorrimento va da
  // un'altra parte. Ogni vista ha il suo ordine, quindi si guarda la lista
  // che quella vista sta davvero disegnando.
  // La lista si appiattisce SOLO quando serve davvero: senza la guardia,
  // ogni disegno costruiva un array di tutta la coda per una ricerca che
  // il piu' delle volte non e' nemmeno accesa.
  const ordiniComeSiVedono =
    ricercaEvidenzia && q
      ? gridView
        ? boardGroups.flatMap((g) => g.orders)
        : corsieView
          ? corsieBanco
            ? corsieMostrate.flatMap((c) => c.schede.map((s) => s.ordine))
            : corsieMostrate.flatMap((c) => c.ordini)
          : listView
            ? [...inCorso, ...evasi]
            : list
      : []
  const acceso = ricercaEvidenzia ? primoCorrispondente(ordiniComeSiVedono, q) : null
  const idAcceso = acceso?.id || null
  // Toccando un conto qualsiasi la ricerca si azzera: si è trovato quello
  // che si cercava, e lasciare il testo lì vorrebbe dire ritrovarsi la
  // coda accesa a metà al giro dopo.
  const contoToccato = () => {
    if (ricercaEvidenzia && search) setSearch('')
  }
  // A schede si guarda una scheda per volta: il conto cercato può esserci
  // ed essere in un'altra. Dire solo "non c'è" manderebbe a cercarlo di
  // nuovo dove non è mai stato.
  const altroveNonInVista =
    ricercaEvidenzia && q && !idAcceso ? primoCorrispondente(ordersInVista, q) : null
  const avvisoRicerca =
    ricercaEvidenzia && q && !idAcceso
      ? altroveNonInVista
        ? `🔍 «${search.trim()}» sta in un'altra scheda.`
        : `🔍 Nessun conto per «${search.trim()}».`
      : null

  async function incassaSuLettore(o) {
    setError(null)
    try {
      const res = await readerCheckout(o.id)
      if (res.unavailable) {
        setError('Lettore non disponibile in ambiente di sviluppo: simula dai DevTools.')
      }
    } catch (e) {
      setError(e.message)
    }
  }

  async function annullaSuLettore(o) {
    setError(null)
    try {
      await readerTerminate(o.id)
    } catch (e) {
      setError(e.message)
    }
  }

  // Chi sta usando l'app in questo momento: la storia deve dire CHI ha
  // riaperto un conto, non solo che è stato riaperto.
  const chiSonoIo = () =>
    auth.currentUser?.displayName ||
    String(auth.currentUser?.email || '').split('@')[0] ||
    null

  const toggleCard = (id) =>
    setOpenCards((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  // APRIRE LA TAVOLOZZA CHIUDE IL MENU DELLA CARD. Il gesto finisce nella
  // modale — si sceglie il colore e si torna a guardare la colonna — e un
  // menu rimasto aperto dietro chiederebbe un secondo tocco per sparire,
  // tenendo intanto la card alta il doppio. Il menu della comanda si
  // chiude da sé (CorsieComande lo fa per ogni voce); qui i menu aperti
  // sono due, quello delle corsie e quello della griglia, e si chiudono
  // solo se erano aperti su QUESTO conto.
  const apriColoreConto = (o) => {
    setCorsiaAperta((id) => (id === o.id ? null : id))
    setOpenCards((s) => {
      if (!s.has(o.id)) return s
      const n = new Set(s)
      n.delete(o.id)
      return n
    })
    setColoreTarget(o)
  }

  // Pulsanti azione di un ordine (avanza stato, incasso, stampe, annullo).
  // Condivisi dalla card piena (liste) e dalla card-griglia (a scomparsa).
  const orderActions = (o, { senzaAvanzamento = false } = {}) => {
    // CONTO CHIUSO O ANNULLATO: due cose sole. Non c'è più niente da
    // preparare né da incassare, e i tasti spenti in fila — «Contanti» e
    // «Carta» grigi su un conto già pagato — sono solo rumore addosso a chi
    // cerca l'unica cosa che serve: ristampare lo scontrino a chi lo chiede,
    // o riaprire il conto quando ci si accorge di un errore.
    if (isChiuso(o) || annullato(o)) {
      return (
        <div className="grid-2" style={{ marginTop: 8 }}>
          <button
            className="btn ghost small"
            onClick={() => printScontrino(o).catch((e) => setError(`Stampa: ${e.message}`))}
          >
            🧾 Scontrino
          </button>
          <button
            className="btn ghost small"
            onClick={() => setRipristinoTarget(o)}
          >
            ♻️ Riapri conto
          </button>
        </div>
      )
    }
    const ns = nextStatus(o.workflow_status)
    const awaiting = attesaPagamento(o, passoDiNascita)
    const readerReady = settings.payments_reader_enabled && settings.sumup_reader_id
    const readerPending = o.payment_method === 'lettore' && o.payment_status === 'in_attesa'
    // Senza gestione della preparazione l'ordine resta "ricevuto": legare
    // l'incasso agli stati lo renderebbe impossibile.
    const canCollect =
      o.payment_status !== 'pagato' &&
      (!workflowOn || [ORDER_STATUSES.PRONTO, ORDER_STATUSES.RITIRATO].includes(o.workflow_status))
    return (
      <>
        {/* Coi tasti che compaiono e spariscono, quello che cercavi non è più
            dove l'avevi visto un attimo prima. Ci sono sempre: spenti quando
            l'azione non è possibile, con il perché nel titolo. */}
        {/* UN PASSO INDIETRO. Si segna «pronto» il conto sbagliato, si tocca
            «consegnato» mentre il drink è ancora sul vassoio: senza questo
            l'unica strada era annullare e ribattere, perdendo orario e
            storia. Sta accanto al passo avanti, più piccolo: si sbaglia meno
            spesso di quanto si lavori. */}
        {/* Tornare indietro è di chi prepara: la sala non l'ha mai fatto —
            e un tasto che non le serve mai è meglio non averlo, non averlo
            spento (i ruoli non cambiano a metà serata). */}
        {comandaIlLavoro && workflowOn && statiPrimaComanda(o.workflow_status, passoDiNascita).length > 0 && (
          <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="muted small">Torna a</span>
            {statiPrimaComanda(o.workflow_status, passoDiNascita).map((st) => (
              <button
                key={st}
                className="chip"
                onClick={() => advance(o, st)}
                title={`Riporta il conto a «${statoAlBanco(st, o.service_mode)}»`}
              >
                ↩︎ {statoAlBanco(st, o.service_mode)}
              </button>
            ))}
          </div>
        )}
        {/* L'UNICO PASSO DELLA SALA È «SERVITO»: è lei a portare il drink al
            tavolo. Prendere in carico e segnare pronto sono del banco. */}
        {workflowOn && !senzaAvanzamento && puoSegnare(ruolo, ns) && (
          <button
            className="btn block"
            disabled={!ns || o.workflow_status === ORDER_STATUSES.RITIRATO || awaiting}
            title={
              awaiting
                ? 'In attesa del pagamento: non si prepara'
                : !ns || o.workflow_status === ORDER_STATUSES.RITIRATO
                  ? 'Nessuno stato successivo'
                  : undefined
            }
            onClick={() => advance(o)}
          >
            {ns && o.workflow_status !== ORDER_STATUSES.RITIRATO
              ? `Segna come “${statoAlBanco(ns, o.service_mode)}”`
              : 'Servito'}
          </button>
        )}
        {readerPending ? (
          <div style={{ marginTop: 8 }}>
            <p className="muted small" style={{ margin: '0 0 6px', textAlign: 'center' }}>
              📟 In corso sul lettore… carta del cliente sul Solo.
            </p>
            <button className="btn ghost small block" onClick={() => annullaSuLettore(o)}>
              ✖️ Annulla sul lettore
            </button>
          </div>
        ) : (
          readerReady && (
            <button
              className="btn secondary block"
              style={{ marginTop: o.workflow_status === ORDER_STATUSES.PRONTO ? 8 : 0 }}
              disabled={!canCollect}
              title={canCollect ? undefined : 'Conto già chiuso o non ancora incassabile'}
              onClick={() => incassaSuLettore(o)}
            >
              📟 Incassa sul lettore
            </button>
          )
        )}
        {(
          // DUE tasti, non uno. C'era solo "Incassato (contanti)": è il tasto
          // più a portata di mano della board, e chi incassava con la carta lo
          // premeva lo stesso — il conto finiva nei contanti e a fine serata
          // la cassa non tornava. Il metodo ora si sceglie qui.
          //
          // E LO SCONTRINO ESCE AL GESTO, come dal pannello dei pagamenti
          // (BUG-054): questa è una riscossione a tutti gli effetti, quindi
          // stessa regola — pretesa FORZATA (reclaim: un incasso vero è una
          // chiusura nuova) e il metodo scritto sullo scontrino. Prima ci si
          // affidava allo snapshot della coda, che con la pretesa normale
          // taceva sui conti già stampati una volta.
          <div className="grid-2" style={{ marginTop: 8 }}>
            {[
              ['banco', '💶 Contanti'],
              ['carta', '💳 Carta'],
            ].map(([metodo, etichetta]) => (
              <button
                key={metodo}
                className="btn"
                disabled={readerPending || !canCollect}
                title={canCollect ? undefined : 'Conto già chiuso'}
                onClick={() => {
                  markOrderPaid(o.id, metodo, { autoServe: !workflowOn }).catch((e) =>
                    setError(e.message)
                  )
                  // La stampa non aspetta la scrittura: local-first, il
                  // gesto è già fatto. Lo scontrino porta il residuo
                  // incassato adesso e il metodo appena scelto.
                  try {
                    if (
                      loadPrinterSettings().autoPrintScontrino &&
                      // Un altro terminale l'ha già stampato: il segno sta sul
                      // conto, non nella memoria di questo browser (BUG-055).
                      !scontrinoGiaUscito(o) &&
                      reclaimReceiptPrint(o.id)
                    ) {
                      const residuo = Math.max(0, orderTotal(o) - paidAmount(o))
                      printScontrino({
                        ...o,
                        payments: [
                          ...(o.payments || []),
                          { amount: residuo, method: metodo, at: new Date().toISOString() },
                        ],
                        payment_method: metodo,
                      })
                        // Il segno va sul dato A CARTA USCITA: segnarlo prima
                        // vorrebbe dire che una stampa fallita mette a tacere
                        // tutti i terminali per sempre.
                        .then(() => segnaScontrinoStampato(o.id))
                        .catch((e) => {
                          setError(`Scontrino non stampato: ${e.message}`)
                          releaseReceiptPrint(o.id)
                        })
                    }
                  } catch {
                    /* stampante non configurata: si continua */
                  }
                }}
              >
                {etichetta}
              </button>
            ))}
          </div>
        )}
        <div className="grid-2" style={{ marginTop: 8 }}>
          <button
            className="btn ghost small"
            onClick={() => printComanda(o, o.comande?.find((cc) => cc.id === o.active_comanda_id) ?? null).catch((e) => setError(`Stampa: ${e.message}`))}
          >
            🖨 Comanda
          </button>
          <button
            className="btn ghost small"
            onClick={() => printScontrino(o).catch((e) => setError(`Stampa: ${e.message}`))}
          >
            🧾 Scontrino
          </button>
        </div>
        {/* Annullare è di chi versa: è il suo lavoro che si butta. */}
        {comandaIlLavoro && o.workflow_status === ORDER_STATUSES.RICEVUTO && (
          <button
            className="btn ghost small block"
            style={{ marginTop: 8 }}
            onClick={() => setCancelTarget({ order: o, kind: 'ordine' })}
          >
            ✖️ Annulla ordine
          </button>
        )}
        {/* Annullare è di chi versa: è il suo lavoro che si butta. */}
        {comandaIlLavoro && o.workflow_status === ORDER_STATUSES.IN_PREPARAZIONE && (
          <button
            className="btn ghost small block"
            style={{ marginTop: 8 }}
            onClick={() => setCancelTarget({ order: o, kind: 'preparazione' })}
          >
            ✖️ Annulla preparazione
          </button>
        )}
        {/* Annullare è di chi versa: è il suo lavoro che si butta. */}
        {comandaIlLavoro && o.workflow_status === ORDER_STATUSES.PRONTO && (
          <button
            className="btn ghost small block"
            style={{ marginTop: 8 }}
            onClick={() => setCancelTarget({ order: o, kind: 'non_ritirato' })}
          >
            🚫 {o.service_mode === 'tavolo' ? 'Non servito' : 'Non ritirato'}
          </button>
        )}
        {/* IL COLORE DEL CONTO, A MANO. Sempre disponibile, che i colori
            automatici siano accesi o spenti, e anche sui conti nati prima
            che l'impostazione esistesse: è il caso per cui serve di più —
            due tavoli che si somigliano, e uno dei due lo si segna. */}
        <TastoColoreConto order={o} onApri={() => apriColoreConto(o)} />
        {/* STORIA E RIPRISTINA NON STANNO QUI. Sono due cose che si fanno
            una volta ogni tanto — «com'è che questo conto è stato
            riaperto?» — e in coda occupavano una riga intera su ogni card,
            per tutta la serata, sul telefono dove lo spazio è quello che
            serve agli ordini. Si trovano dentro il conto (⋯ Azioni), che è
            dove si va quando quella domanda ce la si fa davvero. */}
      </>
    )
  }

  // Card-griglia compatta: tutte uguali, più larghe che alte. Mostra solo
  // numero, cliente/tavolo, stato, n° prodotti e subtotale. I tasti sono a
  // scomparsa: nascosti di default, compaiono toccando la card.
  const renderGridCard = (o) => {
    const awaiting = attesaPagamento(o, passoDiNascita)
    const count = (o.order_items || []).reduce((s, i) => s + i.qty, 0)
    const open = openCards.has(o.id)
    const colore = coloreCardConto(o, bordoColoreConto)
    return (
      <div
        className={`card order-card grid-card ${o.workflow_status} ${orderStripClass(o)}${
          workflowOn && pagato(o) && !servito(o) ? ' pagato-da-servire' : ''
        }${o.id === idAcceso ? ' conto-acceso' : ''}${colore ? ' ' + colore.className : ''}`}
        key={o.id}
        id={`ordine-${o.id}`}
        onClick={contoToccato}
        style={{ ...colore?.style, ...(awaiting ? { opacity: 0.55 } : null) }}
      >
        {/* Corpo: click → dettaglio ordine */}
        <div
          className="grid-card-main"
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/ordine/${o.id}`)}
        >
          <div className="row between">
            <span className="bignum">
              #{o.daily_number ?? '—'} <OrderBy order={o} />
            </span>
            {/* Il badge di preparazione compare solo se si tracciano gli stati:
                a gestione preparazione spenta l'ordine è solo ricevuto→pagato. */}
            {workflowOn && (
              <span className={`pill ${o.workflow_status}`}>
                {STATUS_EMOJI[o.workflow_status]}{' '}
                {statoAlBanco(o.workflow_status, o.service_mode)}
              </span>
            )}
          </div>
          {/* NOME del conto in grande: è la prima cosa da riconoscere sulla
              card. Tavolo, gruppo e pagamento restano piccoli, sotto.
              La riga c'è SEMPRE, anche senza nome: altrimenti i conti senza
              nome venivano più bassi e la board risultava a scalini. */}
          <div className="grid-card-name">{o.customer_name || ' '}</div>
          <div className="grid-card-sub row between" style={{ gap: 6 }}>
            <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {o.table_label && <span className="muted">🍽 Tavolo {o.table_label}</span>}
              {o.note && <span className="muted">{o.table_label ? ' · ' : ''}{o.note}</span>}
            </span>
            {/* Pagamento allineato a DESTRA, fra il badge di stato (sopra) e
                il prezzo (sotto). Il gruppo, se c'è, gli sta accanto. */}
            <span className="row" style={{ gap: 4, flexShrink: 0 }}>
              {o.group_name_snapshot && (
                <span className="pill small">👥 {o.group_name_snapshot}</span>
              )}
              {o.payment_status === 'pagato' && o.workflow_status !== ORDER_STATUSES.PAGATO && (
                <span className="pill pagato small">💳 Pagato</span>
              )}
              {o.payment_status === 'parziale' && (
                <span className="pill ricevuto small" title={`Incassati ${formatPrice(paidAmount(o))}`}>
                  💳 Acconto
                </span>
              )}
            </span>
          </div>
          <div className="row between" style={{ alignItems: 'baseline', marginTop: 'auto' }}>
            <span className="grid-card-meta">
              {count} prodott{count === 1 ? 'o' : 'i'} · {apertoLabel(o)}
              {/* Sconto applicato: si vede, e il totale è già quello scontato. */}
              {scontoTotale(o) > 0 && (
                <span className="sconto-badge"> 🎁 −{formatPrice(scontoTotale(o))}</span>
              )}
            </span>
            {/* Un conto ANNULLATO non ha incassato niente: il totale si mostra
                barrato, com'è nei conti di casa. Prima si leggeva "4,00 €"
                identico a un conto vero e sembrava che contasse (non conta:
                gli annullati restano fuori da cassa e statistiche). */}
            <span
              className={`grid-card-tot${annullato(o) ? ' tot-annullato' : ''}`}
              title={annullato(o) ? 'Ordine annullato: non incassato' : undefined}
            >
              {formatPrice(orderTotal(o))}
            </span>
          </div>
        </div>
        {/* Pulsante separato: apre/chiude i tasti azione (non va al dettaglio) */}
        <button
          type="button"
          className="grid-card-toggle"
          onClick={() => toggleCard(o.id)}
          aria-expanded={open}
        >
          {open ? '▴ Chiudi' : '⋯ Azioni'}
        </button>
        {open && <div className="grid-card-actions">{orderActions(o)}</div>}
      </div>
    )
  }

  // Ordine POS in invio: a schermo è GIÀ un ordine a tutti gli effetti
  // (stessa card, stessi colori, info complete) — la sincronizzazione la
  // racconta il toast, non la card. Solo in errore si distingue.
  function renderPendingCard(p) {
    const o = p.order
    const count = (o.order_items || []).reduce((s, i) => s + i.qty, 0)
    const isError = p.state === 'error'
    return (
      <div
        className={`card order-card grid-card ${isError ? 'grid-card-pending error' : o.workflow_status}`}
        key={p.tempId}
      >
        <div className="grid-card-main" style={{ cursor: 'default' }}>
          <div className="row between">
            <span className="bignum">#{o.daily_number ?? '…'} <OrderBy order={o} /></span>
            <span className={`pill ${isError ? '' : o.workflow_status}`}>
              {isError
                ? '⚠️ Errore invio'
                : `${STATUS_EMOJI[o.workflow_status]} ${statoAlBanco(o.workflow_status, o.service_mode)}`}
            </span>
          </div>
          <div className="grid-card-sub">
            {o.customer_name && <strong>{o.customer_name}</strong>}
            {o.table_label && <span className="muted"> · Tavolo {o.table_label}</span>}
          </div>
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <span className="muted">{count} prodott{count === 1 ? 'o' : 'i'}</span>
            <span className="grid-card-tot">{formatPrice(o.total)}</span>
          </div>
        </div>
        {/* Footer identico alla card reale (stessa altezza prima e dopo
            la sincronizzazione); le azioni arrivano con l'ordine vero. */}
        {!isError && (
          <button type="button" className="grid-card-toggle" disabled>
            ⋯ Azioni
          </button>
        )}
        {isError && (
          <div className="grid-card-actions">
            <p className="muted small" style={{ margin: '0 0 6px' }}>{p.error}</p>
            <button className="btn ghost small block" onClick={() => dismissPending(p.tempId)}>
              Rimuovi
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderCard = (o) => {
        const awaiting = attesaPagamento(o, passoDiNascita)
        const colore = coloreCardConto(o, bordoColoreConto)
        return (
          <div
            className={`card order-card ${o.workflow_status}${
              workflowOn && pagato(o) && !servito(o) ? ' pagato-da-servire' : ''
            }${o.id === idAcceso ? ' conto-acceso' : ''}${colore ? ' ' + colore.className : ''}`}
            key={o.id}
            id={`ordine-${o.id}`}
            onClick={contoToccato}
            style={{ ...colore?.style, ...(awaiting ? { opacity: 0.55 } : null) }}
          >
            <div className="row between">
              <div>
                <span className="bignum" style={{ fontSize: '1.4rem', fontWeight: 600 }}>
                  #{o.daily_number ?? '—'} <OrderBy order={o} />
                </span>{' '}
                {o.customer_name && <strong>{o.customer_name}</strong>}{' '}
                {o.table_label && (
                  <span className="muted">· Tavolo {o.table_label}</span>
                )}{' '}
                {o.group_name_snapshot && (
                  <span className="pill small">👥 {o.group_name_snapshot}</span>
                )}{' '}
                <span className="muted small">📅 {apertoLabel(o)}</span>
                {o.service_mode === 'banco' && (
                  <span className="pill" style={{ marginLeft: 6 }}>🚶 Ritiro al banco</span>
                )}
                {o.service_mode === 'tavolo' && (
                  <span className="pill" style={{ marginLeft: 6 }}>🍸 Al tavolo</span>
                )}
                {/* Stato pagamento */}
                {o.payment_status === 'pagato' && o.workflow_status !== ORDER_STATUSES.PAGATO && (
                  <span className="pill pagato" style={{ marginLeft: 6 }}>
                    💳 Pagato{o.payment_method === 'online' ? ' online' : ''}
                  </span>
                )}
                {o.payment_status === 'parziale' && (
                  <span className="pill ricevuto" style={{ marginLeft: 6 }}>
                    💳 Parziale · incassati {formatPrice(paidAmount(o))}
                  </span>
                )}
                {awaiting && (
                  <span className="pill ricevuto" style={{ marginLeft: 6 }}>
                    ⏳ In attesa di pagamento
                  </span>
                )}
                {o.payment_status === 'fallito' && (
                  <span className="pill" style={{ marginLeft: 6, background: 'rgba(231,76,60,0.25)', color: '#ffb3a7' }}>
                    ❌ Pagamento fallito
                  </span>
                )}
                {o.payment_after_cancel && (
                  <span className="pill" style={{ marginLeft: 6, background: 'rgba(231,76,60,0.25)', color: '#ffb3a7' }}>
                    ⚠️ Pagato dopo annullo
                  </span>
                )}
              </div>
              {workflowOn && (
                <span className={`pill ${o.workflow_status}`}>
                  {STATUS_EMOJI[o.workflow_status]}{' '}
                  {statoAlBanco(o.workflow_status, o.service_mode)}
                </span>
              )}
            </div>
            <div style={{ margin: '8px 0' }}>
              {(o.order_items || []).map((i) => (
                <div className="row between" key={i.id}>
                  <span>
                    {i.qty}× {i.name}
                    {/* La nota della RIGA — «senza ghiaccio», «per Anna» — è
                        quella che cambia come si prepara. Si vedeva solo nel
                        conto e sulla comanda stampata: chi lavora guardando
                        lo schermo invece della stampante non la leggeva mai. */}
                    {i.note && <span className="riga-nota">↳ {i.note}</span>}
                  </span>
                  <span className="muted">{formatPrice(i.qty * i.unit_price)}</span>
                </div>
              ))}
            </div>
            {o.placed_by && (
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                ✍️ Ordine manuale inserito da <strong>{placedByName(o.placed_by)}</strong> ({o.placed_by.role})
              </p>
            )}
            {o.note && (
              <div className="order-note">📝 {o.note}</div>
            )}
            {/* Tempi effettivi: preparazione sui "pronti", servizio sui serviti al tavolo. */}
            {o.workflow_status === ORDER_STATUSES.PRONTO && (() => {
              const m = minutesBetween(o.status_times?.in_preparazione, o.status_times?.pronto)
              return m != null && (
                <p className="muted small" style={{ margin: '0 0 8px' }}>
                  ⏱ Preparato in {m} min
                </p>
              )
            })()}
            {o.workflow_status === ORDER_STATUSES.RITIRATO && o.service_mode === 'tavolo' && (() => {
              const m = minutesBetween(o.status_times?.pronto, o.status_times?.ritirato)
              return m != null && (
                <p className="muted small" style={{ margin: '0 0 8px' }}>
                  ⏱ Servito in {m} min
                </p>
              )
            })()}
            {awaiting && (
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                ⏳ Entra in coda al pagamento: non preparare.
              </p>
            )}
            {orderActions(o)}
          </div>
        )
  }

  return (
    <div className={lavagna ? `queue-board${corsieView ? ' corsie-board' : ''}` : undefined}>
      <PortaInVista id={idAcceso} />
      {/* A tutto schermo la topbar non c'è, e con lei sparivano campanella,
          notifiche e stato della sincronizzazione: torna come tasto tondo in
          basso a destra (il CSS la mostra solo quando serve). */}
      {lavagna && <StatusBell floating />}
      {/* L'avviso a fumetto, se il locale ha scelto quello: sta SOLO qui,
          nella coda, che è il posto dove gli ordini si aspettano. Toccandolo
          si aprono gli avvisi (la campanella ascolta l'evento). */}
      <FumettoAvvisi onApri={() => window.dispatchEvent(new Event('tana:apri-avvisi'))} />
      {error && <div className="banner">Errore: {error}</div>}

      {/* Cassa chiusa: non si battono ordini finché non la si apre. */}
      {!cassaLoading && !cassaAperta && (
        <div className="banner cassa-chiusa-banner">
          🔴 <strong>Cassa chiusa</strong> —{' '}
          {gestore ? 'per battere ordini apri prima la cassa.' : 'per battere ordini la deve aprire il banco.'}{' '}
          {/* Si apre da qui: mandare al flusso di cassa per premere un tasto e
              tornare indietro sono tre passaggi per una cosa che ne vale uno.
              La sala invece legge e basta: aprirla non è cosa sua, e un tasto
              che dà «permesso negato» è peggio di nessun tasto. */}
          {gestore && (
            <button
              type="button"
              className="btn small"
              style={{ marginLeft: 8 }}
              onClick={() => setApriCassa(true)}
            >
              🟢 Apri cassa
            </button>
          )}
        </div>
      )}

      {lavagna ? (
        // Testata compatta della lavagna — griglia o corsie che sia: info
        // giornata, ricerca e, in alto a destra, il «+» per battere un nuovo
        // ordine (apre il POS cassa). È una sola per tutte e due le viste:
        // cambiare vista non deve cambiare i comandi.
        <div className="board-head">
          {/* IL ☰ STA NEL FLUSSO DELLA TESTATA, non fisso nell'angolo.
              A tutto schermo la topbar è nascosta e il menu si apriva da un
              tasto FISSO sopra la pagina: il posto glielo teneva la testata
              a mano — un rientro sul titolo, un altro sull'avviso della
              cassa — e quel posto era vero solo a pagina in cima. La coda
              scorre, e scorrendo la testata gli passava sotto: «il tasto
              menu va a finire sulla label» (l'utente, 21/08/2026).
              Nel flusso il posto non si tiene: si occupa. */}
          <button
            type="button"
            className="board-burger"
            aria-label="Menu"
            title="Menu"
            onClick={() => window.dispatchEvent(new Event('tana:toggle-drawer'))}
          >
            ☰
          </button>
          <div className="board-title">
            <strong>In servizio</strong>
          </div>
          {/* LA RICERCA, E SUL TELEFONO I DUE TASTINI CON LEI. Da tablet in
              su questo guscio non esiste (`display: contents`) e il campo
              sta in riga 1 com'è sempre stato. Sul telefono invece i due
              tastini finivano a capo su una fascia tutta loro — «il layout
              sopra le card non è il massimo su mobile» (l'utente,
              21/08/2026) — spinti a destra, da soli: una fascia di testata
              è una card in meno. Accanto alla ricerca ci stanno, ed è dove
              chi passa da lista e schede li ha appena lasciati. */}
          <div className="board-cerca">
            <input
              type="search"
              className="menu-search board-search"
              placeholder="🔍 Cerca numero, cliente, tavolo, drink…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {telefono && tastini}
          </div>
          <div className="board-actions">
            {/* SI STAMPERÀ? La domanda viene in mente mentre si prende
                l'ordine, non nelle impostazioni — e in sala le
                impostazioni non ci sono affatto. */}
            <PallinoStampante gestore={gestore} />
            {/* SUL TELEFONO IL ⋯, SUGLI SCHERMI LARGHI LE ICONE. In una
                barra stretta le azioni che si fanno OGNI TANTO stanno
                dietro un tasto solo; su tablet e computer lo spazio accanto
                alla ricerca c'è, e nasconderle dietro un menu vuol dire due
                gesti per una cosa che ne vale uno — e non vedere nemmeno se
                i pannelli sono accesi. Stesse azioni, stessi handler: qui
                cambia solo dove stanno. */}
            {telefono ? (
              <button
                className={`btn ghost small board-pannelli${showPanels ? ' active' : ''}`}
                onClick={() => setMenuBoard(true)}
                title="Altro: pannelli e cassa"
                aria-label="Altro"
              >
                ⋯
              </button>
            ) : (
              <button
                className={`btn ghost small board-icona${showPanels ? ' active' : ''}`}
                onClick={() => setShowPanels((v) => !v)}
                title={showPanels ? 'Nascondi i pannelli' : 'Chiamate staff e gruppi'}
                aria-label={showPanels ? 'Nascondi i pannelli' : 'Chiamate staff e gruppi'}
                aria-pressed={showPanels}
              >
                📟
              </button>
            )}
            {/* IL CAMBIO VISTA RESTA QUASSÙ ANCHE SUL TELEFONO, accanto al
                ⋯ e non dentro: passare dai conti alle comande si fa
                DURANTE il servizio, decine di volte, e non è una «cosa che
                si fa ogni tanto». Dentro il ⋯ sarebbero due tocchi.
                FILTRI E ORDINAMENTO NO, sono scesi nella riga sotto — «e
                spostala da lì, mettila sotto dove stavano i vecchi
                bottoni. Rimetti lì giù anche il tasto dei filtri»
                (l'utente, 20/08) — e lì stanno anche sul telefono, che dal
                ⋯ sarebbero due posti per la stessa cosa. */}
            {tastoVista}
            {!telefono &&
              (() => {
                // La voce della cassa (apri/chiudi, o niente per la sala)
                // la decide coda.js: è una regola, e le regole si provano.
                const v = voceCassa({
                  gestore,
                  cassaAperta: !!cassaAperta,
                  contiAperti: recap.aperti,
                  daServire: ticketDaServire,
                })
                if (!v) return null
                return (
                  // QUESTA NON È UN'ICONA. Le altre — i pannelli,
                  // l'ordinamento, i filtri — si capiscono e si annullano
                  // con un secondo tocco; la cassa è la cosa che chiude la
                  // serata, e un lucchetto grigio in fondo a una barra non
                  // dice a nessuno che cos'è. Si scrive per esteso.
                  //
                  // E IL PERCHÉ TORNA SOTTO. «È scomparsa la label sotto al
                  // tasto» (l'utente, 20/08): tolta con BUG-062, la riga
                  // che spiega perché la cassa non si chiude è la sola cosa
                  // che lo dice a chi non ha un mouse da fermare sopra il
                  // tasto. Torna, più corta — «Chiudi 3 conti e 2 comande».
                  //
                  // MA NON RIALLARGA IL TASTO, che era il difetto vero: la
                  // colonna NON stira i figli (niente `align-items:
                  // stretch`), quindi il bottone resta largo quanto «🔒
                  // Chiudi cassa» e la frase — testo leggero, non un
                  // bersaglio — può sporgere di lato senza che nessuno
                  // provi a premerla.
                  //
                  // Il tasto NON è `disabled` ma `aria-disabled`: un tasto
                  // spento davvero non riceve il tocco, e al banco il tocco
                  // deve arrivare — è quello che fa uscire l'avviso col
                  // motivo, per chi la frase l'ha letta di sguincio.
                  <span className="board-cassa-box">
                    <button
                      className="btn ghost small board-cassa"
                      aria-disabled={v.disabled || undefined}
                      title={v.hint}
                      onClick={() => {
                        if (v.disabled) return showToast(v.hint, { kind: 'info' })
                        return v.id === 'apri-cassa' ? setApriCassa(true) : setChiudiCassa(true)
                      }}
                    >
                      {v.icon} {v.label}
                    </button>
                    {/* Solo quando è spento: a cassa chiudibile la riga
                        direbbe «conta il contante», che è quello che il
                        tasto fa già e non è un impedimento. */}
                    {v.disabled && v.hint && (
                      <span className="board-cassa-perche muted small">{v.hint}</span>
                    )}
                  </span>
                )
              })()}
            {cassaAperta || cassaLoading ? (
              <Link className="btn board-add" to="/pos" aria-label="Nuovo ordine" title="Nuovo ordine" />
            ) : (
              <button
                className="btn board-add"
                disabled
                aria-label="Nuovo ordine (apri prima la cassa)"
                title="Apri la cassa per battere ordini"
              />
            )}
          </div>
          {/* SECONDA RIGA: conteggi e legenda degli autori. Stavano dentro
              il titolo, e il titolo diventava alto due o tre righe: la
              testata li centrava tutti insieme (ricerca, ⋯, +) su
              quell'altezza variabile, e sul tablet non era allineato più
              niente. Qui sono una riga a sé, sotto e a filo a sinistra. */}
          <div className="board-sotto">
            <span className="muted board-conti">
              {recap.aperti} apert{recap.aperti === 1 ? 'o' : 'i'} · {recap.chiusi} chius
              {recap.chiusi === 1 ? 'o' : 'i'}
              {/* Gli annullati solo se ce ne sono: una serata pulita non
                  deve leggere «0 annullati». Fuori dal totale, che sono i
                  soldi veri. */}
              {recap.annullati > 0 &&
                ` · ${recap.annullati} annullat${recap.annullati === 1 ? 'o' : 'i'}`}
              {' · '}
              {formatPrice(recap.total)}
            </span>
            {/* Cercando con l'evidenziazione la coda non cambia: se non si
                trova niente, senza scritta non succede proprio nulla e si
                resta a chiedersi se abbia capito. */}
            {avvisoRicerca && <span className="muted">{avvisoRicerca}</span>}
            {(vociLegenda.length > 0 || legenda.hasClient) && (
              <div className="order-legend">
                {vociLegenda.map((v) => (
                  <span key={v.lettera} className={v.soloOnline ? 'legenda-online' : undefined}>
                    <span className="order-by staff">{v.lettera}</span> {v.nome}
                    {/* «SEI TU» è metà del motivo per cui la cosa è stata
                        chiesta: chi si collega deve sapere con che lettera
                        si riconoscerà sulle card, prima di battere il primo
                        conto. */}
                    {v.mio && <span className="muted small"> · sei tu</span>}
                  </span>
                ))}
                {legenda.hasClient && (
                  <span><span className="order-by client">🌐</span> Cliente</span>
                )}
              </div>
            )}
            {/* I DUE TASTINI IN FONDO A DESTRA, sulla riga dei conteggi —
                che c'è comunque. Da filtri chiusi la lavagna non paga
                niente per averli: nessuna riga in più, nessun margine.
                Vale per tutte e due le lavagne, corsie e griglia.
                SUL TELEFONO NO: lì stanno in riga con la ricerca, perché
                qui la riga è già piena di conteggi e legenda e loro
                andavano a capo su una fascia tutta loro. */}
            {!telefono && tastini}
            {/* I CHIP ESCONO SOTTO, in una riga che esiste solo da aperti
                («i filtri devono uscire sotto», l'utente 20/08/2026). */}
            {corsieView ? filtriCorsie : filtriOrdini}
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <strong>Oggi</strong>
            <div className="muted">
              {recap.aperti} apert{recap.aperti === 1 ? 'o' : 'i'} · {recap.chiusi} chius{recap.chiusi === 1 ? 'o' : 'i'}
              {recap.annullati > 0 &&
                ` · ${recap.annullati} annullat${recap.annullati === 1 ? 'o' : 'i'}`}
              {' · '}
              {formatPrice(recap.total)}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <Link className="btn" to="/pos" style={{ flex: 1 }}>
              🍸 POS cassa
            </Link>
            <Link className="btn ghost" to="/menu" style={{ flex: 1 }}>
              ✍️ Vista cliente
            </Link>
          </div>
        </>
      )}

      <ActionSheet
        open={menuBoard}
        onClose={() => setMenuBoard(false)}
        titolo="Coda ordini"
        voci={[
          {
            id: 'pannelli',
            icon: '📟',
            label: showPanels ? 'Nascondi i pannelli' : 'Chiamate staff e gruppi',
            hint: 'Il cerca-persone e i gruppi aperti',
            onClick: () => setShowPanels((v) => !v),
          },
          // L'ORDINAMENTO NON STA PIÙ QUI. È sceso nella riga sotto la
          // testata, insieme al tastino dei filtri, e ci sta anche sul
          // telefono: tenerlo pure nel ⋯ sarebbero due posti per la stessa
          // cosa — e due tocchi, invece di uno, per girare la coda.
          //
          // La voce della cassa (apri/chiudi, o niente per la sala) sta in
          // coda.js: è una regola, e le regole si provano.
          (() => {
            const v = voceCassa({
              gestore,
              cassaAperta: !!cassaAperta,
              contiAperti: recap.aperti,
              daServire: ticketDaServire,
            })
            if (!v) return null
            return {
              ...v,
              onClick: () => (v.id === 'apri-cassa' ? setApriCassa(true) : setChiudiCassa(true)),
            }
          })(),
        ].filter(Boolean)}
      />

      {chiudiCassa && (
        <ChiudiCassaBox
          by={auth.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email } : null}
          onClose={() => setChiudiCassa(false)}
        />
      )}

      {apriCassa && (
        <ApriCassaBox
          cutoffHour={cutoffHour}
          by={auth.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email } : null}
          onClose={() => setApriCassa(false)}
        />
      )}

      {/* Pannelli chiamate/gruppi: sulle lavagne compaiono solo col toggle
          «Pannelli»; nelle altre viste restano sempre visibili. */}
      {(!lavagna || showPanels) && (
        <>
          {/* Aperti APPOSTA dal menu ⋯: se non c'è niente da mostrare lo
              si dice. Prima si toccava «Chiamate staff e gruppi» e non
              succedeva niente — senza altri account lo staff è vuoto e i
              gruppi possono essere spenti — e sembrava un tasto rotto. */}
          <StaffCallList mostraSeVuoto={showPanels} />
          {/* Pannello, cartello o niente: la regola sta in lib/coda.js. */}
          {gruppiInCoda({
            accesi: settings.groups_enabled,
            inCoda: settings.groups_in_queue,
            pannelli: showPanels,
          }) === 'pannello' && <GroupsPanel orders={orders} role="bartender" />}
          {gruppiInCoda({
            accesi: settings.groups_enabled,
            inCoda: settings.groups_in_queue,
            pannelli: showPanels,
          }) === 'cartello' && (
            <div className="card" style={{ marginTop: 8 }}>
              <strong>👥 Gruppi</strong>
              <p className="muted small" style={{ margin: '6px 0 0' }}>
                I gruppi non si mostrano in coda: si accendono in
                Impostazioni → Gruppi.
              </p>
            </div>
          )}
        </>
      )}

      {!lavagna && (
        <>
          {/* IL CAMBIO VISTA STA IN RIGA CON LA RICERCA. Nelle lavagne vive
              in testata accanto al campo; qui la testata non c'è, e questa
              è la riga che le somiglia di più — così chi cambia vista lo
              ritrova nello stesso posto relativo.
              E QUI STANNO ANCHE I DUE TASTINI, in fondo a destra: sulle
              lavagne si appoggiano alla riga dei conteggi, che qui non
              c'è, e questa è l'unica riga che esiste comunque. Il conto è
              lo stesso — a filtri chiusi non si spende una riga. */}
          <div className="coda-cerca-riga">
            <input
              type="search"
              className="menu-search"
              placeholder="🔍 Cerca per numero, cliente, tavolo, drink…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {tastoVista}
            {tastini}
          </div>
          {avvisoRicerca && (
            <p className="muted small" style={{ margin: '-4px 0 8px' }}>
              {avvisoRicerca}
            </p>
          )}
          {/* STESSA FILA DELLE LAVAGNE: qui i chip sono pochi — gli stati
              li fanno le linguette di questa vista — ma un meccanismo che
              vale in tre viste su quattro è una cosa da imparare due
              volte. Il taglio dei giorni scorsi compare solo se è acceso:
              da spento, in questa vista, non avrebbe niente da offrire. */}
          {filaFiltri(() => (
            <>
              {tendinaStaff}
              {chipSoloOggi}
            </>
          ))}
        </>
      )}

      {gridView ? (
        <>
          {/* Avvisi (es. comanda non stampata) dagli invii in background */}
          {pend.banners.map((b) => (
            <div className="banner" key={b.id} onClick={() => dismissBanner(b.id)} style={{ cursor: 'pointer' }}>
              🖨 {b.msg} <span className="muted">(tocca per chiudere)</span>
            </div>
          ))}
          {/* I FILTRI NON SONO PIÙ QUI: stanno sotto la riga dei conteggi,
              in testata (vedi `filtriOrdini`), e i sottofiltri dei chiusi
              sono in riga con loro — non più una riga «Dei chiusi:» a sé.
              Erano tutti una riga a sé fra la testata e le card. */}
          {/* Griglia: ordini in invio (grigi) + ordini secondo i filtri */}
          {pend.pending.length === 0 && visibleBoard.length === 0 && (
            <div className="empty">{frasePerCodaVuota(stato, soloOggi)}</div>
          )}
          {/* I nuovi ordini vanno IN FONDO (numeri più alti): il placeholder
              in sync sta già lì, così alla conferma non cambia posizione. */}
          {/* Una griglia per giornata: oggi in cima, poi i conti ancora
              aperti dei giorni scorsi, ciascuno sotto la sua data. */}
          {!boardGroups.some((g) => g.day === oggiKey) && pend.pending.length > 0 && (
            <div className="order-grid">{pend.pending.map(renderPendingCard)}</div>
          )}
          {boardGroups.map(({ day, orders: gOrders }) => (
            <div key={day}>
              {separatoreGiornata(day, stato)}
              <div className="order-grid">
                {gOrders.map(renderGridCard)}
                {day === oggiKey && pend.pending.map(renderPendingCard)}
              </div>
            </div>
          ))}
        </>
      ) : corsieView ? (
        <>
          {/* CORSIE DI STATO: una colonna per passo del lavoro, un tasto per
              card. Le azioni sono le STESSE della griglia — «avanti di uno»
              è `advance`, l'incasso è il pagamento del conto — perché una
              vista è un modo di guardare, non un secondo modo di lavorare.

              QUI NON C'È PIÙ NIENTE PRIMA DELLE COLONNE. I filtri stanno
              sulla riga dei conteggi, in testata (vedi `filtriCorsie`), e
              da questo giro ci sta dentro anche la SCELTA DELLE COLONNE:
              era rimasta l'ultima riga annidata — chip che aprivano chip
              su un secondo livello — e l'utente l'ha bocciata («quei
              filtri devono apparire sulla stessa riga degli altri tasti»,
              20/08/2026). Fra i conteggi e la prima comanda adesso non c'è
              più nessun livello. */}
          {corsieBanco ? (
            <CorsieComande
              // IL ⋯ DELLA CARD. Le cose che si fanno di rado ma proprio
              // da lì: rimandare indietro una comanda toccata per sbaglio,
              // dividerla, ristamparla. Le decide qui la pagina, che sa le
              // impostazioni del locale e come si scrive sul database; la
              // card le disegna e basta.
              vociComanda={(s) => {
                const c = s?.comanda
                if (!c) return []
                const o = s.ordine
                const indietro = statiPrimaComanda(c.status, passoDiNascita)
                return [
                  // Tornare indietro e dividere sono di chi prepara: alla
                  // sala restano lo stato che vede e la ristampa.
                  ...(comandaIlLavoro ? indietro : []).map((st) => ({
                    id: `indietro-${st}`,
                    icon: '↩︎',
                    label: `Torna a «${statoAlBanco(st, o?.service_mode)}»`,
                    hint: 'Segnata per sbaglio: si rimette dov\'era',
                    onClick: () => avanzaComanda(o, c, st),
                  })),
                  comandaIlLavoro && comandaDivisibile(c) && {
                    id: 'dividi',
                    icon: '✂️',
                    label: 'Preparazione parziale',
                    hint: 'Ne preparo una parte adesso, il resto dopo',
                    onClick: () => navigate(`/ordine/${o.id}/comanda/${c.id}?dividi=1`),
                  },
                  {
                    id: 'ristampa',
                    icon: '🖨',
                    label: 'Ristampa la comanda',
                    hint: 'Se il foglio si è perso o è illeggibile',
                    onClick: () =>
                      printComanda(o, c).catch((e) => setError(`Stampa: ${e.message}`)),
                  },
                  // IL COLORE SI DÀ ANCHE DA QUI, ed è il colore del CONTO:
                  // cambiandolo cambia il pallino di tutte le sue comande,
                  // che è esattamente il punto. Il ⋯ è già aperto sulla card
                  // sbagliata da riconoscere: chiudere, aprire il conto e
                  // tornare indietro sarebbero tre gesti per un tocco.
                  voceColoreConto(o, () => apriColoreConto(o)),
                ].filter(Boolean)
              }}
              corsie={corsieMostrate}
              ruolo={ruolo}
              idAcceso={idAcceso}
              inArrivo={pend.pending}
              onScarta={dismissPending}
              // TOCCANDO LA CARD SI APRE LA COMANDA, non il conto: dal
              // banco la prima domanda è «cosa devo fare qui», e la
              // risposta è il ticket. Nella colonna dei soldi la card è
              // già il conto (non c'è una comanda sola da aprire) e allora
              // si va lì, come prima.
              onApri={(o, comanda) => {
                contoToccato()
                navigate(comanda ? `/ordine/${o.id}/comanda/${comanda.id}` : `/ordine/${o.id}`)
              }}
              onApriConto={(o) => {
                contoToccato()
                navigate(`/ordine/${o.id}`)
              }}
              onAvanza={avanzaComanda}
              onIncassa={(o) => navigate(`/ordine/${o.id}?pagamento=1`)}
              espansa={corsiaEspansa}
              onEspandi={setCorsiaEspansa}
              attesaPagamento={(o) =>
                attesaPagamento(o, passoDiNascita)
              }
              bordoColoreConto={bordoColoreConto}
            />
          ) : (
          <CorsieStato
            corsie={corsieMostrate}
            idAcceso={idAcceso}
            // I conti appena battuti al POS, ancora in volo: in cima alla
            // prima corsia. Sono già ordini a tutti gli effetti per chi
            // lavora — la sincronizzazione è affar nostro, non suo.
            inArrivo={pend.pending}
            onScarta={dismissPending}
            onApri={(o) => {
              contoToccato()
              navigate(`/ordine/${o.id}`)
            }}
            azioni={orderActions}
            aperta={corsiaAperta}
            onApriAzioni={setCorsiaAperta}
            espansa={corsiaEspansa}
            onEspandi={setCorsiaEspansa}
            bordoColoreConto={bordoColoreConto}
            // «Incassa» apre il pagamento del conto, quello vero: sconto,
            // conto diviso, contanti, carta e lettore stanno lì. Rifarne una
            // versione ridotta qui vorrebbe dire due casse che si comportano
            // in modo diverso.
            onIncassa={(o) => navigate(`/ordine/${o.id}?pagamento=1`)}
          />
          )}
        </>
      ) : listView ? (
        <>
          {/* Lista unica: stato indicato dal colore/etichetta della card */}
          <h3 className="cat-header">In corso ({inCorso.length})</h3>
          {inCorso.length === 0 && <div className="empty">Nessun ordine in corso.</div>}
          {groupByDay(inCorso).map(({ day, orders: gOrders }) => (
            <div key={day}>
              {separatoreGiornata(day, 'attivi')}
              {gOrders.map(renderCard)}
            </div>
          ))}

          <h3 className="cat-header">Serviti/Ritirati ({evasi.length})</h3>
          {evasi.length === 0 && <div className="empty">Ancora nessun ordine servito o ritirato.</div>}
          {evasi.map(renderCard)}
        </>
      ) : (
        schedeSemplici ? (
        <>
          {/* STATI DI SERVIZIO SPENTI: i cinque passi del lavoro non
              esistono, e mostrarli lasciava quattro linguette vuote con
              tutti i conti sotto «Ordine ricevuto». Restano le tre cose che
              un conto può essere — in corso, chiuso, annullato — con le
              stesse regole della griglia (ordiniInCoda), così le due viste
              raccontano la stessa storia. Ricerca e tendina dello staff
              valgono qui come dappertutto: filtrano dentro la scheda in cui
              si sta. */}
          <div className="tabs" style={{ marginTop: 8 }}>
            {schedeSemplici.map(([k, label]) => (
              <div
                key={k}
                className={`tab ${tabSemplice === k ? 'active' : ''}`}
                onClick={() => setTabSemplice(k)}
              >
                {label} ({perScheda[k].length})
              </div>
            ))}
          </div>

          {perScheda[tabSemplice].length === 0 && (
            <div className="empty">
              {tabSemplice === 'attivi'
                ? 'Nessun conto in corso.'
                : tabSemplice === 'chiusi'
                  ? 'Nessun conto chiuso in questa cassa.'
                  : 'Nessun conto annullato in questa cassa.'}
            </div>
          )}
          {perScheda[tabSemplice].map(renderCard)}
        </>
        ) : (
        <>
          {/* Sotto-tab per stato */}
          <div className="tabs" style={{ marginTop: 8 }}>
            {STATUS_TABS.map((s) => (
              <div
                key={s}
                className={`tab ${statusTab === s ? 'active' : ''}`}
                onClick={() => setStatusTab(s)}
              >
                {STATUS_EMOJI[s]} {statoAlBanco(s)} ({(buckets[s] || []).length})
              </div>
            ))}
          </div>

          {list.length === 0 && <div className="empty">Nessun ordine in questo stato.</div>}
          {list.map(renderCard)}
        </>
        )
      )}

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          danger={confirmAction.danger}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            const { run } = confirmAction
            setConfirmAction(null)
            run()
          }}
        />
      )}

      {cancelTarget && (
        <CancelOrderDialog
          order={cancelTarget.order}
          kind={cancelTarget.kind}
          // La frase che si applica DAVVERO: se il locale è a solo servizio,
          // quella del bancone non si propone nemmeno qui — manderebbe il
          // cliente dove nessuno lo aspetta.
          defaultPhrase={fraseAnnulloDefault(settings)}
          ritiroPossibile={fraseAnnulloPossibile('bancone', settings)}
          onCancel={() => setCancelTarget(null)}
          onConfirm={confirmCancel}
        />
      )}

      {storiaTarget && (
        <StoriaOrdineDialog order={storiaTarget} onClose={() => setStoriaTarget(null)} />
      )}

      {coloreTarget && (
        <ModaleColoreConto
          order={coloreTarget}
          onChiudi={() => setColoreTarget(null)}
          // Local-first: si chiude SUBITO e la scrittura parte in
          // sottofondo. Un `await` qui, con la rete che balla, terrebbe la
          // modale ferma sopra la coda finché il server non risponde.
          onScegli={(c) => {
            const o = coloreTarget
            setColoreTarget(null)
            setOrderColore(o.id, c)
          }}
        />
      )}

      {ripristinoTarget && (
        <RipristinaOrdineDialog
          order={ripristinoTarget}
          onClose={() => setRipristinoTarget(null)}
          onConferma={(motivo) => {
            const o = ripristinoTarget
            setRipristinoTarget(null)
            // Il conto era stato nascosto dalla coda quando l'avevamo
            // chiuso qui: riaprendolo deve tornare a vedersi subito, senza
            // aspettare il giro del server.
            mostraOrdine(o.id)
            // Un conto riaperto è un conto da richiudere, e alla chiusura lo
            // scontrino deve poter uscire di nuovo (BUG-047).
            releaseReceiptPrint(o.id)
            restoreOrder(o.id, { motivo, chi: chiSonoIo() }).catch((e) =>
              setError(`Conto non ripristinato: ${e.message}`)
            )
          }}
        />
      )}
    </div>
  )
}

function SerataReport({ report, onClose }) {
  const { finance, products, longest_prep, phase_averages, drinks_sold } = report
  const fmtMin = (m) => (m == null ? '—' : `${Math.round(m * 10) / 10} min`)
  const top = products.slice(0, 3)

  return (
    <div className="overlay" onClick={onClose}>
      <div className="summary-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="summary-head">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
          <h2>Resoconto serata</h2>
          <p className="muted" style={{ margin: 0 }}>
            {finance.ordini} ordini · {drinks_sold} drink venduti
          </p>
        </div>

        <h3 className="cat-header">Incassi</h3>
        <div className="summary-rows" style={{ margin: '4px 0 16px' }}>
          <div className="summary-row">
            <span className="muted">Drink</span>
            <span>{formatPrice(finance.drink)}</span>
          </div>
          {finance.coperto > 0 && (
            <div className="summary-row">
              <span className="muted">Coperto</span>
              <span>{formatPrice(finance.coperto)}</span>
            </div>
          )}
          {finance.servizio > 0 && (
            <div className="summary-row">
              <span className="muted">Servizio</span>
              <span>{formatPrice(finance.servizio)}</span>
            </div>
          )}
          {finance.mance > 0 && (
            <div className="summary-row">
              <span className="muted">Mance</span>
              <span>{formatPrice(finance.mance)}</span>
            </div>
          )}
          <div className="summary-row summary-total">
            <span>INCASSO</span>
            <span>{formatPrice(finance.incasso)}</span>
          </div>
        </div>

        {products.length > 0 && (
          <>
            <h3 className="cat-header">Prodotti venduti</h3>
            <div className="summary-rows" style={{ margin: '4px 0 16px' }}>
              {products.map((p) => (
                <div className="summary-row" key={p.name}>
                  <span>
                    {p.qty} × {p.name}
                  </span>
                  <span>{formatPrice(p.revenue)}</span>
                </div>
              ))}
              <div className="summary-row summary-total">
                <span>TOTALE DRINK</span>
                <span>{formatPrice(products.reduce((s, p) => s + p.revenue, 0))}</span>
              </div>
            </div>
          </>
        )}

        <h3 className="cat-header">Statistiche</h3>
        <div className="summary-rows" style={{ margin: '4px 0 16px' }}>
          {top.length > 0 && (
            <div className="summary-row">
              <span className="muted">Più venduti</span>
              <span style={{ textAlign: 'right' }}>
                {top.map((p) => `${p.name} (${p.qty})`).join(' · ')}
              </span>
            </div>
          )}
          {longest_prep && (
            <div className="summary-row">
              <span className="muted">Preparazione più lunga</span>
              <span>
                #{longest_prep.daily_number} · {fmtMin(longest_prep.minutes)}
              </span>
            </div>
          )}
          <div className="summary-row">
            <span className="muted">Attesa media</span>
            <span>{fmtMin(phase_averages?.attesa)}</span>
          </div>
          <div className="summary-row">
            <span className="muted">Preparazione media</span>
            <span>{fmtMin(phase_averages?.preparazione)}</span>
          </div>
          <div className="summary-row">
            <span className="muted">Servizio al tavolo medio</span>
            <span>{fmtMin(phase_averages?.servizio)}</span>
          </div>
          <div className="summary-row">
            <span className="muted">Ciclo completo medio</span>
            <span>{fmtMin(phase_averages?.cicloCompleto)}</span>
          </div>
        </div>

        <button className="btn block" onClick={onClose}>
          Chiudi resoconto
        </button>
      </div>
    </div>
  )
}
