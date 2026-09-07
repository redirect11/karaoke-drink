import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  advanceComanda,
  addComanda,
  chiudiCreazione,
  bartenderUpdateComanda,
  updateOrderInfo,
  setOrderGroup,
  cancelOrder,
  restoreOrder,
  closePaidOrder,
  createOrder,
  subscribeOpenGroups,
  fetchRecentDrinkIds,
  subscribeOrder,
  subscribeSettings,
  peekNextDailyNumber,
  preparazioneParziale,
  setOrderServiceMode,
  DEFAULT_SETTINGS,
  settingsIniziali,
} from '../lib/api.js'
import { useDraft, loadLayout, saveLayout, saveDraft } from '../lib/useDraft.js'
import { dismissKeyboard } from '../lib/keyboard.js'
import { useResizable } from '../lib/useResizable.js'
import { useTelefono } from '../lib/useTelefono.js'
import { nascondiOrdine, mostraOrdine } from '../lib/ordiniNascosti.js'
import ZoomControl from './ZoomControl.jsx'
import { auth } from '../lib/firebaseClient.js'
import { onAuthStateChanged } from 'firebase/auth'
import { useMenu } from '../lib/menuCache.js'
import {
  ORDER_STATUSES,
  STATUS_LABELS,
  statoAlBanco,
  STATUS_EMOJI,
  formatPrice,
  placedByName,
  paymentMethodLabel,
} from '../lib/orderStatus.js'
import { idDispositivo } from '../lib/dispositivo.js'
import { modoAllaNascita } from '../lib/consegna.js'
import ScegliConsegna from './ScegliConsegna.jsx'
import {
  nextComandaStatus,
  activeComanda,
  orderIsClosed,
  comandaEditable,
  comandaPerLeAggiunte,
  ultimaComandaViva,
  comandaDivisibile,
  statiDopoLaDivisione,
  statiPrimaComanda,
  statoComandaNuova,
  annullataPerDivisione,
  ANNULLATA_PER_DIVISIONE,
  dividiComanda,
  gruppoDiRiga,
  gruppiDelConto,
  titoloGruppo,
  ORDER_OPEN,
} from '../lib/comande.js'
import { paidAmount, dettaglioIncassi, scontoTotale } from '../lib/pagamento.js'
import { aggiunteInComandaNuova, isPersonale, puoGestireComande, puoSegnare } from '../lib/ruoli.js'
import { spegnibile } from '../lib/sensoriDnd.js'
import {
  makeLineId,
  mergeLines,
  splitAll,
  hasMergeable,
  moveLine,
  reconcileLayout,
} from '../lib/orderLines.js'
import { toastSuccess, toastError } from '../lib/toast.js'
import { printComanda, printComande, printComandaUnita, comandeStampabili, releaseReceiptPrint } from '../lib/printer.js'
import PosProductPicker from './PosProductPicker.jsx'
import PreparazioneParziale from './PreparazioneParziale.jsx'
import { useComandeLocali, comandaProvvisoria } from '../lib/comandeLocali.js'
import { IconPrinter, IconReceipt, IconCard, IconRefresh, IconX, IconCheck, IconClose, IconGruppo, IconPersona, IconTag } from './Icons.jsx'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import CustomDrinkForm from './CustomDrinkForm.jsx'
import SchedaDrink from './SchedaDrink.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import ActionSheet from './ActionSheet.jsx'
import { StoriaOrdineDialog, RipristinaOrdineDialog } from './StoriaOrdine.jsx'
import { ripristinabile, ultimaRiapertura, quando } from '../lib/storiaOrdine.js'
import PaymentScreen from './PaymentScreen.jsx'
import { azioniContoRidotte, ricordaAzioniContoRidotte } from '../lib/impostazioniLocali.js'

// ── Schermata UNICA POS creazione/modifica ordine (stile SumUp) ───────────
// UN SOLO componente: con `order` è la MODIFICA di un ordine esistente,
// senza `order` (null) è la CREAZIONE. Layout e gesti identici.
//
// A destra c'è UNA SOLA lista di item: quelli già confermati (dalle
// comande) e quelli non ancora confermati (BOZZA), senza separazione
// visiva. Tutti gli item sono spostabili col drag (tieni premuto). La
// BOZZA è persistita in localStorage per contesto ('new' in creazione,
// id ordine in modifica): non si perde uscendo, si riprende dov'era —
// finché l'ordine non è confermato/pagato.
//
// Rimozione: gli item NON confermati e quelli confermati ma ancora IN
// PREPARAZIONE si possono togliere; pronti/serviti/pagati no.
//
// NIENTE tasto Conferma: gli item si confermano da soli. In CREAZIONE,
// appena si aggiunge il primo item l'ordine viene CREATO (createOrder) e si
// passa alla modifica (/ordine/:id); il nome si chiede UNA sola volta
// all'uscita, se manca. In MODIFICA le aggiunte confluiscono nella comanda in
// preparazione (una NUOVA comanda solo se l'ordine è già pronto/servito).
// Dal footer si "Chiude" (torna alla coda); il pagamento resta a parte.

// Ultimo progressivo previsto, tenuto in locale: serve solo a mostrare subito
// il numero giusto invece di un segnaposto che poi cambia. Si scarta se è
// vecchio, altrimenti a inizio serata si vedrebbe il numero di ieri.
const CHIAVE_NUMERO = 'tana:prossimoNumero'
const ORE_VALIDE = 8

function numeroPrevistoInCache() {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE_NUMERO) || 'null')
    if (!v || !Number.isFinite(v.n)) return null
    if (Date.now() - v.at > ORE_VALIDE * 3600 * 1000) return null
    return v.n
  } catch {
    return null
  }
}

// IL CONTO CHE STAVO APRENDO. In creazione l'ordine nasce SENZA cambiare
// pagina (niente navigazione, la schermata resta montata): se il browser
// ricarica — basta uno scorrimento di troppo in cima alla lista, e su
// Android parte l'aggiornamento della pagina — l'app non saprebbe più a
// quale conto stava lavorando e ne aprirebbe un altro, lasciando il primo
// aperto in coda con dentro la roba già battuta.
// Qui si tiene il suo id: al ritorno si riprende da lì. Si dimentica
// uscendo dal conto o quando il conto si chiude — e comunque scade, per
// non ritrovarsi dentro un conto di ieri.
const CHIAVE_IN_CORSO = 'tana:pos:conto-in-corso'
const ORE_IN_CORSO = 8

function contoInCorso() {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE_IN_CORSO) || 'null')
    if (!v?.id) return null
    if (Date.now() - v.at > ORE_IN_CORSO * 3600 * 1000) return null
    return v.id
  } catch {
    return null
  }
}

function ricordaContoInCorso(id) {
  try {
    if (id) localStorage.setItem(CHIAVE_IN_CORSO, JSON.stringify({ id, at: Date.now() }))
    else localStorage.removeItem(CHIAVE_IN_CORSO)
  } catch {
    /* senza memoria locale si riparte da zero, come prima */
  }
}

function ricordaNumeroPrevisto(n) {
  try {
    localStorage.setItem(CHIAVE_NUMERO, JSON.stringify({ n, at: Date.now() }))
  } catch {
    /* senza memoria locale si parte dal segnaposto, come prima */
  }
}

// ── RIORDINARE LE RIGHE DEL CONTO ────────────────────────────────────
//
// Si potevano già spostare, ma a lungo-premuto e con un movimento fatto a
// mano: la riga saltava, le altre no, e capitava di spostarne una mentre si
// voleva solo toccarla. Ora è la stessa libreria della griglia dei prodotti
// (dnd-kit): la riga segue il dito e le altre si scansano da sole.
//
// E come nella griglia si entra in «organizza»: fuori di lì le righe non si
// muovono — toccarle apre la riga, che è quello che si fa mille volte a
// sera — e dentro compare la maniglia, che è l'unica cosa che trascina.
// I sensori restano montati anche fuori da «organizza»: a spegnerli è
// l'opzione `attiva`. Svuotare la lista cambierebbe la lunghezza delle
// dipendenze di un `useEffect` dentro dnd-kit, che è vietato — il perché
// per esteso sta in `lib/sensoriDnd.js`.
const PointerSensorSpegnibile = spegnibile(PointerSensor)

function RigaOrdinabile({ id, attiva, bloccata, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !attiva || bloccata,
  })
  return (
    <div
      ref={setNodeRef}
      className={`posd-riga-wrap${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {attiva && !bloccata && (
        <span
          className="posd-riga-grip"
          title="Trascina per spostare"
          aria-label="Sposta la riga"
          {...attributes}
          {...listeners}
        >
          ⠿
        </span>
      )}
      {children}
    </div>
  )
}

// Quando è stato aperto il conto: data breve + ora. "oggi" per la giornata in
// corso, perché scrivere la data di oggi accanto al numero è rumore.
function apertoIl(iso) {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const oggi = new Date()
  const stessoGiorno =
    d.getDate() === oggi.getDate() &&
    d.getMonth() === oggi.getMonth() &&
    d.getFullYear() === oggi.getFullYear()
  if (stessoGiorno) return `oggi ${ora}`
  return `${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })} ${ora}`
}

// `apriPagamento`: la schermata si apre già sul pagamento. Serve a chi ci
// arriva dal dettaglio di un ordine premendo «Pagamento» — al tavolo il
// gesto è uno solo, e passare per il conto per poi premere un altro tasto
// sarebbe un giro in più mentre il cliente aspetta col portafogli in mano.
export default function OrderPosDetail({ order: orderProp = null, apriPagamento = false }) {
  const navigate = useNavigate()
  // Ordine auto-creato IN PLACE alla prima aggiunta (creazione): NON si naviga
  // altrove, così il layout non si ricarica. Da lì la schermata è identica alla
  // modifica (l'ordine effettivo è prop OPPURE quello appena creato).
  const [selfOrder, setSelfOrder] = useState(null)
  const order = orderProp || selfOrder
  const isNew = !order
  // L'ID DEL CONTO IN UN RIFERIMENTO. Chi scrive al server in ritardo —
  // il flush col debounce, le correzioni delle righe cambiate mentre
  // l'ordine nasceva — non può dipendere dal giro di render: la chiusura
  // vecchia aveva ancora `order` nullo e la scrittura cadeva nel vuoto.
  const orderIdRef = useRef(null)
  if (order?.id) orderIdRef.current = order.id
  // SESSIONE DI CREAZIONE APERTA: solo per il conto nato in questa
  // schermata (`selfOrder`) e finché il documento lo dice. Un conto aperto
  // dalla coda (`orderProp`) è già «creato»: lì vale la regola della presa
  // in carico.
  const inCreazione = !orderProp && !!selfOrder && selfOrder.in_creazione === true
  // Ordine appena creato in place e ancora senza nome: all'uscita lo si chiede
  // una volta (poi non più).
  const createdInPlace = !orderProp && !!selfOrder
  const nameAskedRef = useRef(false)
  const { drinks, cats, loading } = useMenu()
  const [error, setError] = useState(null)
  const [showCustom, setShowCustom] = useState(false)
  const [editLine, setEditLine] = useState(null) // riga bozza in modifica (editor)
  const [showComande, setShowComande] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmSvuota, setConfirmSvuota] = useState(false)
  // La scheda del drink (ingredienti e preparazione), dalla ⓘ sulla card.
  const [schedaDrink, setSchedaDrink] = useState(null)
  // «Organizza» per la lista del conto: come nella griglia, è un
  // interruttore che fa comparire le maniglie. Fuori di lì toccare una riga
  // la apre — è quello che si fa mille volte a sera — e niente si sposta per
  // sbaglio.
  const [organizzaLista, setOrganizzaLista] = useState(false)
  const sensoriLista = useSensors(
    // Otto pixel prima di considerarlo un trascinamento: sotto quella soglia
    // è un tocco, e il tocco apre la riga.
    useSensor(PointerSensorSpegnibile, {
      attiva: organizzaLista,
      activationConstraint: { distance: 8 },
    })
  )
  // Menu delle azioni: esiste solo sul telefono, dove i tasti non ci stanno
  // tutti in pagina senza mangiarsi le righe del conto.
  const [showAzioni, setShowAzioni] = useState(false)
  // I tasti sopra la lista si possono ridurre: chi fa solo drink si
  // riprende tre righe di schermo, e li ritrova tutti nel ⋯.
  const [azioniRidotte, setAzioniRidotte] = useState(azioniContoRidotte)
  // Il menu delle azioni vale SOLO sul telefono: altrove i tasti stanno in
  // pagina, e un ⋯ in più sarebbe solo un doppione da capire.
  const telefono = useTelefono()
  const [showPayment, setShowPayment] = useState(apriPagamento)
  const [showStoria, setShowStoria] = useState(false)
  // Chi sta usando l'app: la storia deve dire CHI ha riaperto il conto.
  // CHI SONO IO, nella forma che la storia sa scrivere: nome e, se si sa,
  // ruolo. Prima era una stringa e basta, e nella stessa storia la stessa
  // persona compariva con tre etichette diverse.
  const chiSonoIo = () =>
    auth.currentUser
      ? {
          name: auth.currentUser.displayName || null,
          email: auth.currentUser.email || null,
          role: staffRef.current?.role || null,
        }
      : null
  // Il proprio ruolo, sempre a portata: serve a firmare le cose che si fanno
  // (vedi chiSonoIo) senza dipendere dall'ordine dei render.
  const staffRef = useRef(null)
  const [showRipristino, setShowRipristino] = useState(false)
  const [askName, setAskName] = useState(false) // modale nome (creazione)
  const [settings, setSettings] = useState(settingsIniziali)
  // Il locale segue la preparazione? Sta qui in alto perché lo chiedono in
  // due punti lontani fra loro: come si raggruppano le righe (qui sotto) e
  // quali tasti di avanzamento esistono (più giù).
  const workflowOn = settings.workflow_enabled !== false
  useEffect(() => subscribeSettings(setSettings, () => {}), [])

  // CONTO DI GRUPPO (solo in creazione): si arriva qui da /pos?group=<id>
  // toccando un gruppo nel drawer o nella coda. L'ordine nasce già dentro
  // quel conto, così il gruppo si paga tutto insieme.
  const [params] = useSearchParams()
  const groupParam = isNew ? params.get('group') || '' : ''
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState(groupParam || order?.group_id || '')
  const [pickGroup, setPickGroup] = useState(false)
  useEffect(() => setGroupId(groupParam), [groupParam])
  // Il conto passa da "nuovo" a "esistente" appena si aggiunge il primo drink:
  // legare i gruppi a `isNew` faceva sparire il tasto sotto le dita, proprio
  // mentre lo si stava per usare. I gruppi ci sono se sono ACCESI, punto.
  const groupsOn = settings.groups_enabled
  // I CALCOLI DELLE RIGHE («2 × 5,00 €») si mostrano a richiesta, dal menù
  // ⋯ del conto: in riga, accanto a ogni nome, erano rumore — il numero
  // che conta è il subtotale. La scelta si ricorda sul dispositivo.
  const [mostraCalcoli, setMostraCalcoli] = useState(() => {
    try {
      return localStorage.getItem('tana:pos:calcoli') === '1'
    } catch {
      return false
    }
  })
  const toggleCalcoli = () =>
    setMostraCalcoli((v) => {
      const next = !v
      try {
        localStorage.setItem('tana:pos:calcoli', next ? '1' : '0')
      } catch {
        /* niente memoria: vale per questa sessione */
      }
      return next
    })
  // Il dettaglio dei supplementi (coperto/servizio/mancia) sotto il
  // Subtotale: aperto dove lo spazio c'è, chiuso di suo sul telefono —
  // si apre toccando il Subtotale.
  const [mostraSupplementi, setMostraSupplementi] = useState(
    () => !window.matchMedia('(max-width: 899px)').matches
  )
  // Su un conto già creato il gruppo si scrive subito sull'ordine.
  const orderIdCorrente = order?.id
  useEffect(() => {
    if (isNew || !orderIdCorrente) return
    setGroupId(order?.group_id || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdCorrente, order?.group_id])
  const scegliGruppo = (id) => {
    setGroupId(id)
    if (!isNew && orderIdCorrente) {
      setOrderGroup(orderIdCorrente, id || null).catch((e) =>
        toastError(`Gruppo non aggiornato: ${e.message}`)
      )
    }
  }
  useEffect(() => {
    if (!groupsOn) return
    return subscribeOpenGroups(setGroups, () => setGroups([]))
  }, [groupsOn])
  const group = groups.find((g) => g.id === groupId) || null
  // Un gruppo contenitore non può ricevere ordini diretti: si sceglie fra
  // i soli gruppi "foglia".
  const groupChoices = groups.filter((g) => !g.has_child_groups)
  // Un gruppo che contiene sottogruppi non può avere ordini diretti: si
  // ordina in uno dei suoi sottogruppi (lo impedisce anche createOrder).
  const groupIsContainer = !!group?.has_child_groups

  // AGGIUNTE in composizione (BOZZA persistente). In creazione la chiave
  // tiene conto del gruppo: bozze di gruppi diversi non si mescolano.
  const draftKey = order ? order.id : groupParam ? `new:${groupParam}` : 'new'
  const [draft, setDraft, clearDraft, dimenticaBozzaSalvata] = useDraft(draftKey)
  const draftRef = useRef(draft)
  draftRef.current = draft

  // Colonne POS ridimensionabili (larghezze ricordate per dispositivo).
  const catsRz = useResizable('pos-cats', { def: 168, min: 140, max: 340, side: 'right' })
  // Recenti per la griglia POS: gli ultimi item ordinati (best-effort).
  const [recentIds, setRecentIds] = useState([])
  useEffect(() => {
    fetchRecentDrinkIds(20).then(setRecentIds).catch(() => setRecentIds([]))
  }, [])
  const comandaRz = useResizable('pos-comanda', { def: 400, min: 260, max: 700, side: 'left' })
  // Scala del footer (totale + conferma/pagamento): la maniglia in cima lo
  // "allunga" e tasti/font crescono insieme. Valore in % (100 = normale).
  const footRz = useResizable('pos-foot-scale', { def: 100, min: 80, max: 175, axis: 'y', side: 'up', speed: 0.5 })
  // ALTEZZA DEL PANNELLO ORDINE sul telefono (in dvh): con più di tre o
  // quattro righe il conto non ci stava e bisognava scorrere dentro una
  // finestrella. Si tira su la maniglia e si guarda tutto il conto.
  const altezzaRz = useResizable('pos-comanda-h', {
    // In quarti di schermo: da un quarto (si guarda la griglia) a tre
    // quarti (si guarda il conto), partendo da metà. Oltre i tre quarti
    // della griglia non resterebbe abbastanza per battere.
    def: 50,
    min: 25,
    max: 75,
    axis: 'y',
    side: 'up',
    speed: 0.13, // pixel → dvh (uno schermo tipico è ~800px: 1dvh ≈ 8px)
  })
  // Allargando una colonna ne crescono anche i testi (e viceversa): la scala
  // del font segue la larghezza rispetto alla misura di riposo (def), con un
  // tetto per non esagerare. Guida i font via CSS (--cats-scale/--comanda-scale).
  const clampScale = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  // Smartphone (layout in colonna): testi più piccoli e pannello ordine
  // COLLASSABILE, altrimenti la griglia resta schiacciata.
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
    const h = (e) => setIsPhone(e.matches)
    mq.addEventListener?.('change', h)
    return () => mq.removeEventListener?.('change', h)
  }, [])
  // Base più grande su tablet/desktop (leggibile su iPad); su smartphone scala
  // fissa più contenuta (la colonna è comunque al 100%).
  const catsScale = isPhone ? 0.95 : clampScale(catsRz.width / 150, 1.1, 1.7)
  // Il MINIMO della scala del testo delle righe è configurabile
  // (Impostazioni → Vista ordine): il pavimento fisso a 1.1 per qualcuno
  // era un manifesto — sotto la soglia scelta il testo non scende, per
  // quanto si stringa il pannello.
  const testoMin = clampScale(Number(settings.pos_testo_min) || 1.1, 0.8, 1.4)
  const comandaScale = isPhone
    ? Math.min(0.95, testoMin)
    : clampScale(comandaRz.width / 340, testoMin, 1.7)

  // Pannello ordine in basso (solo smartphone): si RIMPICCIOLISCE quando si
  // lavora sulla griglia (scroll/ricerca/aggiunta) e si riapre toccandolo.
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const lastGridTouchRef = useRef(0)
  const collapsePanel = useCallback(() => {
    lastGridTouchRef.current = Date.now()
    if (window.matchMedia('(max-width: 899px)').matches) setPanelCollapsed(true)
  }, [])
  // La barra ignora i tocchi subito dopo un'interazione con la griglia: il tap
  // su una card vicino al bordo (o il "ghost click" dopo il collasso) non deve
  // riaprire il pannello da solo.
  const expandPanel = () => {
    if (Date.now() - lastGridTouchRef.current < 450) return
    setPanelCollapsed(false)
  }

  // APRENDO IL PANNELLO SI VEDE L'ULTIMA RIGA. È quella appena battuta:
  // trovarsi in cima alla lista, con l'ultimo drink fuori vista, vuol dire
  // scorrere ogni volta per controllare quello che si è appena aggiunto.
  useEffect(() => {
    if (panelCollapsed) return undefined
    // Dopo il render: la lista si popola in un secondo giro.
    const t = requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(t)
  }, [panelCollapsed])

  // Staff loggato: serve per l'attribuzione dell'ordine creato dal POS e —
  // sempre, anche in modifica — per sapere CHI sta guardando. La sala serve
  // e non prepara (REQ-STAFF-014): senza il ruolo qui, questa schermata le
  // offrirebbe i passi del banco.
  const [staff, setStaff] = useState(null)
  const [ruolo, setRuolo] = useState(null)
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setRuolo(null)
        return setStaff(null)
      }
      try {
        const token = await u.getIdTokenResult()
        const role = token.claims.role
        setRuolo(isPersonale(role) ? role : null)
        if (isPersonale(role)) {
          const io = { email: u.email, name: u.displayName || u.email, role }
          staffRef.current = io
          setStaff(io)
        }
      } catch {
        setRuolo(null)
        setStaff(null)
      }
    })
  }, [])

  // LA SALA SERVE, NON PREPARA. Vede il conto e ci lavora sopra — aggiunge
  // righe, corregge quello che ha appena battuto — ma le comande già mandate
  // al banco non le riscrive, e i passi della preparazione non li segna.
  const comandaIlLavoro = puoGestireComande(ruolo)
  // Le aggiunte della sala non entrano in una comanda che qualcuno sta già
  // preparando: nasce un ticket nuovo. Il ruolo passa da un ref perché
  // queste funzioni vivono fuori dal ciclo di render (vedi flushAdditions).
  const ruoloRef = useRef(null)
  ruoloRef.current = ruolo
  // LA SESSIONE DI CREAZIONE. Finché chi ha battuto il conto non è uscito,
  // quella è UNA comanda sola: «se non sono ancora uscito dalla creazione
  // ordine quella è sempre una sola comanda (anche se da creazione ordine
  // vado in pagamento)» (l'utente, 20/08). Vale per il conto nato QUI —
  // `selfOrder` — non per un conto riaperto dalla coda.
  const inCreazioneRef = useRef(false)
  inCreazioneRef.current = inCreazione
  const bersaglioAggiunte = () =>
    aggiunteInComandaNuova(ruoloRef.current)
      ? null
      : comandaPerLeAggiunte(effComandeRef.current, { inCreazione: inCreazioneRef.current })

  // Ordine auto-creato in place: lo si tiene aggiornato dal server (comande,
  // pagamenti…) senza rimontare la pagina. Si aggiorna lo stato SOLO se cambia
  // davvero (i "battiti" identici della sottoscrizione non causano re-render).
  const selfOrderId = selfOrder?.id
  const selfOrderJsonRef = useRef('')
  useEffect(() => {
    if (!selfOrderId || orderProp) return
    return subscribeOrder(selfOrderId, (o) => {
      if (!o) return
      const j = JSON.stringify(o)
      if (j === selfOrderJsonRef.current) return
      selfOrderJsonRef.current = j
      setSelfOrder(o)
      // Chiuso o annullato (magari da un altro dispositivo): non è più
      // "il conto in corso", e al prossimo giro si riparte puliti.
      if (o.status !== ORDER_OPEN) ricordaContoInCorso(null)
    }, () => {})
  }, [selfOrderId, orderProp])

  // RIPRESA DOPO UN RICARICAMENTO. Si entra in creazione ma un conto era
  // già stato aperto qui: si torna dentro quello invece di aprirne un
  // altro e lasciare il primo per strada, con dentro quello che era già
  // stato battuto. Solo se è ancora aperto: un conto chiuso non si
  // riapre.
  // LA SCHERMATA È ANCORA QUI? La creazione va avanti anche dopo che si è
  // usciti — è quello che la rende immediata — ma quello che scrive PER la
  // schermata (il conto in corso, lo stato locale) non deve più toccare
  // niente: si usciva, la creazione finiva un istante dopo e si rimetteva in
  // memoria «il conto in corso», così il «+» seguente riapriva quello — e
  // per un attimo si vedevano i suoi prodotti segnati nella griglia.
  const montatoRef = useRef(true)
  useEffect(() => {
    // Rimesso a `true` nel corpo, non solo all'inizializzazione: in sviluppo
    // StrictMode monta, finge di smontare e rimonta — e il riferimento
    // restava `false` per tutta la sessione. Sull'emulatore la creazione non
    // passava mai a modifica (setSelfOrder saltato), le righe battute dopo
    // restavano orfane e il pagamento mostrava solo il primo giro: gli
    // stessi sintomi del banco, ma sempre, e senza rete di mezzo.
    montatoRef.current = true
    return () => {
      montatoRef.current = false
    }
  }, [])

  // USCENDO DA QUI, LA BOZZA SI CHIUDE. Da qualunque parte si esca — la
  // freccia, il menu, il tasto indietro del browser — quello che è stato
  // battuto diventa un CONTO (si crea da sé, in locale) e la copia salvata
  // sparisce.
  //
  // È la regola che mancava: la schermata del conto nuovo si deve aprire
  // PULITA, senza pulizie all'apertura. Prima la bozza restava sotto la
  // chiave 'new' e il conto dopo se la ritrovava dentro — le righe di quello
  // prima, pronte a essere battute due volte. La «bozza che non si perde»
  // continua a valere: non si perde perché diventa un conto, non perché
  // resta in un cassetto.
  const uscitaRef = useRef(null)
  // ── SI STA ANNULLANDO: L'USCITA NON DEVE CHIUDERE LA COMPOSIZIONE ──
  //
  // «Se alla creazione di un ordine lo annullo anche, la comanda non deve
  // uscire se è abilitata la stampa automatica» (l'utente, 21/08/2026).
  //
  // Annullare in creazione fa due cose nello stesso battito: si torna alla
  // coda (e l'uscita toglie `in_creazione`, che è il cancello della
  // stampa) e parte l'annullo, che deve prima leggersi il conto. L'uscita
  // arrivava per prima, e per quel pezzo di secondo la coda vedeva un
  // conto composto, aperto e da stampare: la carta usciva, e l'annullo la
  // raggiungeva quando era già sul banco.
  //
  // E CAPITA COL CONTO GIÀ NATO, che è il caso vero: battuta la prima
  // riga il conto esiste (`isNew` diventa falso) ma resta `in_creazione`
  // finché non si esce. Chi annulla lì passa dal ramo dell'annullo
  // normale, non da quello del conto ancora nuovo: per questo il segno si
  // mette in cima al gesto, prima di distinguere i due casi.
  //
  // La cura non è aspettare: è non aprire quel cancello. A chiuderlo ci
  // pensa l'annullo stesso, insieme allo stato, in una scrittura sola
  // (`cancelOrder` in api.js). Qui basta ricordarsi che si sta annullando
  // — memoria locale immediata, come `ordiniNascosti` per la coda.
  const staAnnullando = useRef(false)
  uscitaRef.current = () => {
    if (staAnnullando.current) return
    // QUELLO CHE È STATO BATTUTO PARTE ADESSO. La bozza diventa comanda e le
    // comande in sospeso vanno al server senza aspettare il mezzo secondo
    // dell'auto-conferma: fra un istante questa schermata non esiste più e i
    // suoi timer muoiono con lei. Battendo in fretta lo stesso prodotto e
    // tornando subito in coda ne arrivava UNO SOLO — l'ultimo giro moriva
    // col timer.
    flushAdditionsRef.current?.()
    flushAllRef.current?.()
    if (orderProp) return
    ricordaContoInCorso(null)
    // LA SESSIONE DI CREAZIONE FINISCE QUI, e solo qui: andare in pagamento
    // e tornare è ancora la stessa battuta. Da adesso le comande di questo
    // conto possono uscire dalla stampante — il ticket esce COMPLETO, non a
    // metà composizione — e le righe che arrivano dopo seguono la regola
    // della presa in carico.
    const nato = draftRef.current.length > 0 ? createFromDraftRef.current() : null
    Promise.resolve(nato)
      .then((o) => chiudiCreazione(o?.id || orderIdRef.current))
      .catch(() => {})
    saveDraft('new', [])
  }
  useEffect(
    () => () => {
      // Non subito: in sviluppo StrictMode smonta e rimonta al volo per
      // scovare proprio questi errori, e l'uscita partiva a schermata appena
      // aperta — buttava la memoria del conto in corso e, con una bozza
      // salvata, creava un conto a vuoto. Un microtask dopo, se si è ancora
      // smontati, l'uscita è quella vera; se si è stati rimontati non si è
      // usciti affatto.
      queueMicrotask(() => {
        if (!montatoRef.current) uscitaRef.current?.()
      })
    },
    []
  )

  // USCENDO DAL POS SI DIMENTICA. Il «+» deve aprire un conto NUOVO: la
  // memoria del conto in corso serve solo a riprenderlo dopo un
  // RICARICAMENTO della pagina — dove questa pulizia non gira, perché il
  // programma muore e basta. Uscendo a mano invece gira, e premendo «+» non
  // ci si ritrova dentro il conto appena battuto.
  useEffect(() => {
    if (orderProp || selfOrder) return undefined
    const id = contoInCorso()
    if (!id) return undefined
    let vivo = true
    let stop = null
    stop = subscribeOrder(
      id,
      (o) => {
        if (!vivo) return
        vivo = false
        if (o && o.status === ORDER_OPEN) {
          selfOrderJsonRef.current = JSON.stringify(o)
          setSelfOrder(o)
        } else {
          ricordaContoInCorso(null)
        }
        // Basta la prima risposta: da qui in poi ci pensa l'ascolto
        // normale del conto (selfOrderId), questo era solo per ritrovarlo.
        stop?.()
      },
      () => ricordaContoInCorso(null)
    )
    return () => {
      vivo = false
      stop?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderProp])

  // PAGAMENTO DIRETTO (creazione): la schermata si apre subito su un GUSCIO
  // locale (id nullo) mentre il conto nasce in sottofondo. Righe e totale
  // non stanno qui dentro: li ricompone sempre `ordineDaPagare`, dallo
  // stato a schermo — è la regola di casa, e l'unica versione del conto che
  // non mente mai. Prima il guscio portava le righe congelate al momento
  // del tocco, e appena il server rispondeva prendeva il SUO conto: quello
  // che si era battuto dopo spariva dal pagamento fino alla
  // sincronizzazione (BUG-017).
  const [payOrder, setPayOrder] = useState(null)
  const payIdRef = useRef(null)

  // POS a tutto schermo, come la cassa.
  useEffect(() => {
    document.body.classList.add('fullbleed')
    return () => document.body.classList.remove('fullbleed')
  }, [])

  // Quando si aggiunge un item, si porta la lista sulla riga toccata e la si
  // evidenzia un attimo: con la lista lunga, altrimenti, non si vede se è
  // stato inserito davvero.
  const listRef = useRef(null)
  const scrollKeyRef = useRef(null)
  const scrollToLine = useCallback((key) => {
    scrollKeyRef.current = key // lo scroll vero avviene nell'effetto su orderedLines
  }, [])

  // Invio su un campo dati conto: chiude la tastiera virtuale. Diretto
  // sull'input e con il rimedio Windows (readonly momentaneo), così funziona
  // su Windows, Android e iPhone/iPad.

  const closed = isNew ? false : orderIsClosed(order)
  const comande = useMemo(() => (isNew ? [] : order.comande || []), [isNew, order])

  // ── Diminuzioni OTTIMISTICHE sulle comande modificabili (modifica) ──
  const [pendingEdits, setPendingEdits] = useState({}) // comandaId -> items
  const flushTimers = useRef({})
  const latestPending = useRef({})
  latestPending.current = pendingEdits

  const flushComanda = useCallback(async (comandaId) => {
    clearTimeout(flushTimers.current[comandaId])
    delete flushTimers.current[comandaId]
    const items = latestPending.current[comandaId]
    // L'id dal riferimento, non dalla chiusura: la scrittura può partire
    // dopo l'uscita, o nell'attimo in cui il conto è appena nato e `order`
    // nel render di questa funzione era ancora nullo.
    const oid = orderIdRef.current
    if (!items || !oid) return
    try {
      await bartenderUpdateComanda(oid, comandaId, { items })
      // L'override NON si toglie qui: la scrittura risponde PRIMA dello snapshot,
      // e toglierlo subito farebbe sparire+riapparire l'item nella lista (il
      // "ricaricamento" alla sync). Lo toglie l'effetto sotto, quando la comanda
      // dal server combacia davvero con l'override.
    } catch (e) {
      // Se nel frattempo si è usciti dalla schermata non c'è più niente da
      // aggiornare: la scrittura resta in coda a Firestore e riparte da sé.
      if (!montatoRef.current) return
      setError(e.message)
      setPendingEdits((p) => omit(p, comandaId))
    }
  }, [])

  // ── SEGNARE UNA MODIFICA IN SOSPESO ────────────────────────────────
  //
  // Ogni cambio a una comanda (una riga in più, una quantità in meno, una
  // ricetta cambiata al volo) si vede subito a schermo e parte poco dopo,
  // in un colpo solo. Il punto delicato è che va scritto SUBITO anche nel
  // riferimento: fra l'ultimo gesto e l'uscita dalla schermata non c'è il
  // tempo di un altro disegno, e chi manda le righe al server legge da lì.
  // Passando solo dallo stato di React, uscendo di corsa si perdeva
  // l'ultima modifica — un gin più pregiato messo a mano tornava quello di
  // listino, col suo costo. Stessa lezione della bozza, che si salva fuori
  // dagli updater.
  const segnaModifica = useCallback((comandaId, items, ritardo = 600) => {
    latestPending.current = { ...latestPending.current, [comandaId]: items }
    setPendingEdits((p) => ({ ...p, [comandaId]: items }))
    clearTimeout(flushTimers.current[comandaId])
    flushTimers.current[comandaId] = setTimeout(() => flushComanda(comandaId), ritardo)
  }, [flushComanda])

  const flushAll = useCallback(async () => {
    await Promise.all(Object.keys(latestPending.current).map((id) => flushComanda(id)))
  }, [flushComanda])

  const flushAllRef = useRef(flushAll)
  flushAllRef.current = flushAll

  useEffect(() => {
    const timers = flushTimers.current
    // I timer si spengono, ma quello che aspettavano parte lo stesso: ci
    // pensa l'uscita (uscitaRef), che manda tutto da sé senza passare dai
    // timer — un microtask dopo lo smontaggio.
    return () => Object.values(timers).forEach(clearTimeout)
  }, [])

  // QUELLO CHE HO APPENA FATTO IO: avanzamenti, comande appena nate,
  // divisioni. Erano tre pezzi separati qui dentro — statusOverrides,
  // nuoveInVolo, divise — e ognuno aveva la sua pulizia: adesso è un array
  // `comande` solo, quello di lib/comandeLocali.js, lo stesso che usano la
  // coda e il dettaglio della comanda.
  const contoPerLocali = useMemo(() => ({ id: order?.id ?? '__nuovo', comande }), [order?.id, comande])
  const comandeLocali = useComandeLocali([contoPerLocali])

  const advance = (comandaId, ns) => {
    const adesso = new Date().toISOString()
    comandeLocali.applica(contoPerLocali, (arr) =>
      arr.map((c) =>
        c.id === comandaId
          ? { ...c, status: ns, status_times: { ...(c.status_times || {}), [ns]: adesso } }
          : c
      )
    )
    ;(async () => {
      try {
        await flushAll()
        await advanceComanda(order.id, comandaId, ns)
        // La copia locale NON si toglie qui: la scrittura risponde prima
        // che arrivi lo snapshot, e toglierla subito farebbe riapparire
        // per un istante lo stato precedente. La toglie la firma.
      } catch (e) {
        setError(e.message)
        comandeLocali.scarta(contoPerLocali.id)
      }
    })()
  }

  // ── PREPARAZIONE PARZIALE ────────────────────────────────
  //
  // Al banco capita di vedere tre gin tonic in una comanda e due in
  // un'altra e prepararli insieme, per farli uscire in una volta sola. Non
  // andrebbe fatto — un ticket si lavora intero — ma si fa: l'app non lo
  // impedisce, lo REGISTRA, così il conto resta giusto e la coda dice
  // davvero cosa è al banco e cosa aspetta ancora.
  //
  // QUALE comanda si sta dividendo. Le quantità le tiene il riquadro, che
  // sta in un file suo (PreparazioneParziale) perché lo stesso gesto si fa
  // anche dal dettaglio della comanda: due schermate che dividono in due
  // modi diversi sarebbero due modi diversi di sbagliare il conto.
  const [parziale, setParziale] = useState(null)
  const confermaParziale = (c, scelte) => {
    const divisa = dividiComanda(c, scelte)
    if (!divisa) return
    setParziale(null)
    const adesso = new Date().toISOString()
    // In che passo nascono le due parti lo dice quella di partenza
    // (statiDopoLaDivisione): da «da fare» la parte scelta è quella che si
    // comincia adesso, da «in preparazione» sono tutte e due già al banco.
    const passi = statiDopoLaDivisione(c.status)
    // SI VEDE SUBITO. La comanda di partenza risulta annullata e al suo
    // posto compaiono le due nuove: chi ha appena scelto tre gin tonic su
    // cinque deve vederli al banco nell'istante in cui tocca, non quando
    // risponde il server. Se ne vanno da sé quando dallo snapshot arriva
    // la stessa cosa.
    comandeLocali.applica(contoPerLocali, (arr) => {
      if (divisa.tutta) {
        // Prese tutte le unità non c'è niente da dividere: se è già dove
        // dovrebbe andare non si muove niente.
        if (c.status === passi.nuova) return arr
        return arr.map((x) =>
          x.id === c.id
            ? {
                ...x,
                status: passi.nuova,
                status_times: { ...(x.status_times || {}), [passi.nuova]: adesso },
              }
            : x
        )
      }
      // I NUMERI CHE PRENDERANNO DAVVERO. Le comande nuove nascono dopo
      // l'ultima del conto: mostrarle senza numero (o tutte «comanda 0»)
      // vorrebbe dire vederle rinumerarsi sotto gli occhi appena risponde
      // il server, proprio mentre si legge quale preparare.
      const prossimo = arr.reduce((m, x) => Math.max(m, x.seq || 0), 0)
      return [
        // UNA COMANDA DIVISA NON È UNA COMANDA ANNULLATA: nel dato lo è,
        // ma leggere «Annullato» qui farebbe pensare a un drink saltato,
        // mentre quei drink sono nelle due sotto. Il motivo si scrive
        // subito, non quando risponde il server.
        ...arr.map((x) =>
          x.id === c.id
            ? {
                ...x,
                status: ORDER_STATUSES.ANNULLATO,
                annullata_per: ANNULLATA_PER_DIVISIONE,
                status_times: {
                  ...(x.status_times || {}),
                  [ORDER_STATUSES.ANNULLATO]: adesso,
                },
              }
            : x
        ),
        comandaProvvisoria({
          seq: prossimo + 1,
          status: passi.nuova,
          items: divisa.nuova,
          created_at: c.created_at || null,
        }),
        comandaProvvisoria({
          seq: prossimo + 2,
          status: passi.resta,
          items: divisa.resta,
          created_at: c.created_at || null,
        }),
      ]
    })
    preparazioneParziale(order.id, c.id, scelte).catch((e) => {
      // Non è passata: si torna a quello che dice il server, che è l'unica
      // cosa vera — o al banco si prepara una divisione che sul conto non
      // esiste.
      comandeLocali.scarta(contoPerLocali.id)
      toastError(`Divisione non riuscita: ${e.message}`)
    })
  }

  // Stessa logica per gli item: l'override (aggiunte/decrementi ottimistici) si
  // toglie SOLO quando la comanda dal server combacia — così l'item non
  // sparisce+riappare (niente "ricaricamento" alla sincronizzazione).
  useEffect(() => {
    const sig = (arr) =>
      (arr || []).map((i) => `${i.drink_id}~${i.qty}~${i.unit_price}~${i.custom ? 1 : 0}`).join('|')
    setPendingEdits((p) => {
      if (Object.keys(p).length === 0) return p
      let next = p
      for (const c of comande) {
        if (p[c.id] && sig(p[c.id]) === sig(c.items)) {
          if (next === p) next = { ...p }
          delete next[c.id]
        }
      }
      return next
    })
  }, [comande])

  // Comande "effettive": quelle come le vede chi sta qui adesso, con sopra
  // le modifiche alle RIGHE non ancora inviate.
  //
  // `pendingEdits` resta un pezzo a sé apposta: non è «l'ho già scritto»
  // ma «lo scriverò fra mezzo secondo» — le quantità si aggiustano a
  // raffica e la scrittura aspetta che le dita si fermino. Ha una pulizia
  // sua, sulle RIGHE, perché quello che aspetta è che tornino indietro
  // quelle. Metterlo nello stesso posto vorrebbe dire non sapere più quali
  // comande hanno una scrittura ancora da mandare.
  const effComande = useMemo(
    () =>
      comandeLocali
        .comandeDi(contoPerLocali)
        .map((c) => (pendingEdits[c.id] ? { ...c, items: pendingEdits[c.id] } : c)),
    [comandeLocali, contoPerLocali, pendingEdits]
  )
  // Quelle che si possono ancora ristampare: le annullate no, è lavoro
  // buttato e rimetterlo al banco sarebbe un ticket da non preparare.
  // Si guardano quelle a schermo — comprese le appena battute, che qui ci
  // sono già e sul server magari no.
  const stampabili = useMemo(
    () => comandeStampabili({ comande: effComande }),
    [effComande]
  )
  // Riferimenti sempre aggiornati per l'auto-conferma e la conferma all'uscita.
  const effComandeRef = useRef(effComande)
  effComandeRef.current = effComande
  // L'aggiunta parte da un callback che nasce una volta sola (dipende dalla
  // bozza, non dal render): senza un ref si porterebbe dietro la copia
  // locale di quando è stato creato.
  const comandeLocaliRef = useRef(comandeLocali)
  comandeLocaliRef.current = comandeLocali

  // LA STESSA RIGA NON SI CONTA DUE VOLTE. Nell'attimo in cui il conto
  // nasce, le righe inviate stanno già nelle comande ma la bozza non ha
  // ancora cambiato chiave: per un render la stessa riga vive in due posti.
  // La lista si difendeva da sola (stessa chiave = stesso nodo); totali e
  // pagamento no, e il conto raddoppiava per un battito. Qui la bozza è
  // depurata delle righe che una comanda porta già (stessa identità,
  // line_id) — e un cassetto rimasto sporco da un crash si ripulisce da sé.
  const bozzaViva = useMemo(() => {
    if (draft.length === 0) return draft
    const confermate = new Set()
    for (const c of effComande)
      for (const it of c.items || []) if (it.line_id) confermate.add(it.line_id)
    if (confermate.size === 0) return draft
    const resta = draft.filter((l) => !confermate.has(l.line_id))
    return resta.length === draft.length ? draft : resta
  }, [draft, effComande])
  const bozzaVivaRef = useRef(bozzaViva)
  bozzaVivaRef.current = bozzaViva

  // ── DOVE VANNO LE RIGHE NUOVE, QUANDO NON PUÒ DIRLO L'APP ────────────
  //
  // Col servizio acceso lo dice la regola: nella comanda finché nessuno
  // l'ha presa in mano, in una nuova da lì in poi. Col servizio SPENTO
  // quella regola non ha nessun appiglio — non esistono passi, non esiste
  // «preso in carico» — e a saperlo è solo chi sta al banco: «se non ci
  // sono gli stati di servizio, il bartender/admin SCEGLIE, solo in
  // modifica» (l'utente, 20/08). Quindi si chiede, con due tasti, e solo
  // qui: non in creazione (lì è una comanda sola per definizione) e non
  // alla sala, che manda sempre un ticket nuovo.
  const sceltaAggiunte =
    !isNew &&
    !inCreazione &&
    !workflowOn &&
    !closed &&
    comandaIlLavoro &&
    !aggiunteInComandaNuova(ruolo) &&
    bozzaViva.length > 0 &&
    !!ultimaComandaViva(effComande)

  // ── LISTA UNICA: item confermati (per-riga, dalle comande) + bozza ──
  // Le quantità già pagate (acconti/split registrati) vengono scorporate in
  // righe "pagate" a sé, così si distinguono e si possono spostare in fondo.
  // Un conto RIAPERTO si modifica tutto, righe vecchie comprese: è il
  // motivo per cui lo si riapre. Vedi api.js/bartenderUpdateComanda.
  const riaperto = Array.isArray(order?.riaperture) && order.riaperture.length > 0
  // IL CONTO ANNULLATO NON È UN CONTO VUOTO. Annullando, tutte le sue
  // comande diventano «annullate» e qui venivano saltate: si apriva un
  // conto senza una riga e a zero euro, e non si capiva né cosa ci fosse
  // dentro né se valesse la pena riaprirlo. Dentro un conto ancora aperto
  // invece una comanda annullata resta fuori: quella roba non si fa e non
  // si paga.
  const contoAnnullato = !isNew && order?.workflow_status === ORDER_STATUSES.ANNULLATO

  const confirmedLines = useMemo(() => {
    const remainingPaid = {}
    for (const p of order?.payments || [])
      for (const it of p.items || [])
        if (it.drink_id) remainingPaid[it.drink_id] = (remainingPaid[it.drink_id] || 0) + (Number(it.qty) || 0)
    const out = []
    for (const c of effComande) {
      const comandaAnnullata = c.status === ORDER_STATUSES.ANNULLATO
      if (comandaAnnullata && !contoAnnullato) continue
      // Su un conto annullato si elencano anche le comande annullate: è il
      // modo per capire cosa c'era dentro. Ma non quelle sparite in una
      // DIVISIONE: quei drink non sono spariti, sono nelle due comande
      // nate al loro posto, e comparirebbero due volte.
      if (annullataPerDivisione(c)) continue
      ;(c.items || []).forEach((it, idx) => {
        const base = {
          source: 'comanda',
          comandaId: c.id,
          itemIndex: idx,
          status: c.status,
          drink_id: it.drink_id,
          name: it.name,
          unit_price: it.unit_price,
          custom: it.custom,
          recipe_items: it.recipe_items,
          note: it.note || null,
        }
        const paidHere = it.drink_id ? Math.min(it.qty, remainingPaid[it.drink_id] || 0) : 0
        if (it.drink_id) remainingPaid[it.drink_id] -= paidHere
        const unpaidQty = it.qty - paidHere
        // Stessa chiave della bozza da cui viene: la riga resta LO STESSO
        // nodo e non riparte da capo (vedi draftToItems).
        const chiave = it.line_id ? `d:${it.line_id}` : `c:${c.id}:${idx}`
        if (unpaidQty > 0)
          out.push({
            ...base,
            key: chiave,
            qty: unpaidQty,
            // Alla sala le comande già mandate al banco restano da leggere:
            // toccarle vuol dire cambiare il lavoro sotto le mani di chi versa.
            removable:
              comandaIlLavoro && !comandaAnnullata && (comandaEditable(c) || riaperto),
            annullata: comandaAnnullata,
          })
        if (paidHere > 0)
          out.push({ ...base, key: `${chiave}:paid`, qty: paidHere, removable: false, paid: true })
      })
    }
    return out
  }, [effComande, order?.payments, riaperto, contoAnnullato, comandaIlLavoro])

  const draftLines = useMemo(
    () => bozzaViva.map((l) => ({ ...l, key: `d:${l.line_id}`, source: 'draft', status: 'draft', removable: true })),
    [bozzaViva]
  )

  const allByKey = useMemo(() => {
    const m = new Map()
    for (const l of confirmedLines) m.set(l.key, l)
    for (const l of draftLines) m.set(l.key, l)
    return m
  }, [confirmedLines, draftLines])
  const naturalKeys = useMemo(
    () => [...confirmedLines.map((l) => l.key), ...draftLines.map((l) => l.key)],
    [confirmedLines, draftLines]
  )
  const naturalSig = naturalKeys.join('|')

  // Ordine di visualizzazione: riordino a mano di TUTTI gli item, persistito
  // per contesto così sopravvive sia agli update dal server sia all'uscita
  // dalla schermata.
  const [layout, setLayout] = useState(() => loadLayout(draftKey))
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  useEffect(() => {
    setLayout((prev) =>
      reconcileLayout(prev, naturalSig ? naturalSig.split('|') : [], settings.pos_add_top)
    )
  }, [naturalSig, settings.pos_add_top])
  useEffect(() => {
    saveLayout(draftKey, layout)
  }, [draftKey, layout])
  // Nasconde/mostra le righe già pagate (che stanno comunque in fondo).
  const [hidePaid, setHidePaid] = useState(false)
  // I GRUPPI DEL CONTO: «In preparazione», «Pronto», «Servito», «Pagati».
  // Ci sono solo quando c'è più di una cosa da dire — e nel caso normale
  // non c'è: la comanda è una sola ed esce tutta per l'intero ordine, tutti
  // i drink stanno nello stesso passo, e un titolo per dire una cosa sola
  // è rumore. Dividere una comanda è la deroga, ed è lì che questi titoli
  // servono davvero.
  // QUALI TITOLI HANNO SENSO. Col servizio acceso: i passi, se sono più
  // d'uno. Col servizio spento: solo «💳 Pagati», che c'era da sempre e
  // parla di soldi, non di lavoro — e quello si mostra appena c'è una riga
  // pagata, perché la sua ragione è separarla da quelle ancora da pagare.
  const gruppiMostrati = useMemo(
    () => gruppiDelConto([...allByKey.values()], { conServizio: workflowOn }),
    [allByKey, workflowOn]
  )
  const gruppiVisibili = workflowOn
    ? gruppiMostrati.length > 1
    : gruppiMostrati.includes('pagati')
  const orderedLines = useMemo(() => {
    const arr = layout.map((k) => allByKey.get(k)).filter(Boolean)
    const unpaid = arr.filter((l) => !l.paid)
    const paid = arr.filter((l) => l.paid)
    const lista = hidePaid ? unpaid : [...unpaid, ...paid]
    if (!gruppiVisibili) return lista
    // L'ORDINE A MANO CEDE SOLO QUANDO SERVE. Con i gruppi in vista le
    // righe si mettono in fila per passo del servizio, o i titoli si
    // ripeterebbero tre volte lungo la lista; senza gruppi (il caso
    // normale) resta esattamente com'è stata sistemata.
    // La chiave si calcola UNA volta per riga, non a ogni confronto: dentro
    // il comparatore un `indexOf` su un conto da quaranta righe diventa
    // qualche centinaio di giri per mettere in fila quaranta cose. E chi non
    // sta in nessun gruppo mostrato viene PRIMA: col servizio spento sono le
    // righe ancora da pagare, e i pagati vanno in fondo — è lì che si
    // guardano.
    const posto = new Map(gruppiMostrati.map((g, i) => [g, i]))
    return lista
      .map((l, i) => [l, posto.get(gruppoDiRiga(l)) ?? -1, i])
      .sort((a, b) => a[1] - b[1] || a[2] - b[2])
      .map(([l]) => l)
  }, [layout, allByKey, hidePaid, gruppiVisibili, gruppiMostrati])
  const paidCount = useMemo(
    () => [...allByKey.values()].filter((l) => l.paid).reduce((s, l) => s + l.qty, 0),
    [allByKey]
  )

  // Scroll all'item appena aggiunto: si aggancia a orderedLines perché
  // l'aggiunta passa da più render (bozza → reconcile del layout) e la riga
  // nuova entra nel DOM solo quando orderedLines la include. Scrolla e azzera.
  useEffect(() => {
    const key = scrollKeyRef.current
    if (!key) return
    const el = listRef.current?.querySelector(`[data-line-key="${key}"]`)
    if (el) {
      // 'nearest': scorre SOLO se la riga non è già visibile, del minimo
      // indispensabile e senza animazione → niente slide involontari.
      el.scrollIntoView({ block: 'nearest' })
      scrollKeyRef.current = null
    }
  }, [orderedLines])

  // Auto-larghezza della colonna ordine: aggiungendo un item la colonna si
  // allarga (mai oltre il massimo) per far entrare il nome più lungo. Non si
  // restringe da sola, così un allargamento manuale resta.
  const measureRef = useRef(null)
  const namesSig = orderedLines.map((l) => `${l.custom ? '*' : ''}${l.name}`).join('')
  useEffect(() => {
    if (isNew || !orderedLines.length || typeof document === 'undefined') return
    const canvas = measureRef.current || (measureRef.current = document.createElement('canvas'))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const px = Math.round(16 * comandaScale * 0.88)
    ctx.font = `500 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`
    let maxW = 0
    for (const l of orderedLines) {
      const w = ctx.measureText(`⠿ ${l.custom ? '✨ ' : ''}${l.name}  · ${formatPrice(l.unit_price)}`).width
      if (w > maxW) maxW = w
    }
    // overhead: padding lista + controlli quantità
    const needed = Math.ceil(maxW + 24 + 86)
    if (needed > comandaRz.width + 6) comandaRz.setWidth(Math.min(700, needed))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesSig])

  // Ordine appena aperto e rimasto SENZA prodotti (si aggiunge una voce e la si
  // toglie subito): si annulla da solo e si torna alla coda, senza chiedere
  // nulla — non era un conto, era un ripensamento. Vale solo per l'ordine
  // creato in questa sessione, mai per uno aperto dalla coda.
  useEffect(() => {
    // Vale per QUALSIASI conto aperto rimasto senza righe, non solo per quello
    // creato in questa sessione: uscendo e rientrando (per esempio quando si
    // chiude il box del nome) il conto non era più "creato qui", e togliendo
    // l'ultima riga restava aperto e vuoto in mezzo agli altri.
    if (isNew || closed || !order?.id) return
    if (orderedLines.length > 0 || draft.length > 0) return
    if ((order.payments || []).length > 0) return // qualcosa è già stato incassato
    const t = setTimeout(async () => {
      // PRIMA si scrive la rimozione, POI si annulla. La rimozione dell'ultima
      // riga passa da un salvataggio ritardato (600ms): l'annullo arrivava
      // prima, leggeva l'ordine con la riga ancora dentro e la riscriveva
      // così com'era. Risultato: un conto annullato che in coda mostrava
      // ancora "1 prodotto · 4,00 €" mentre dentro non aveva più niente.
      try {
        await flushAll()
      } catch {
        /* se la scrittura non riesce si annulla lo stesso: il conto va chiuso */
      }
      cancelOrder(order.id, { by: 'bartender' }).catch(() => mostraOrdine(order.id))
      nascondiOrdine(order.id)
      navigate('/bar')
    }, 400) // respiro: evita di annullare durante una sostituzione di riga
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, closed, order?.id, orderedLines.length, draft.length])

  // Memoria bozza solo finché non confermato/pagato: se l'ordine è chiuso
  // (pagato/annullato) si azzera.
  useEffect(() => {
    if (closed) clearDraft()
  }, [closed, clearDraft])

  const draftCount = bozzaViva.reduce((s, i) => s + i.qty, 0)
  const draftTotal = bozzaViva.reduce((s, i) => s + i.qty * i.unit_price, 0)
  // Le righe di un conto annullato si vedono ma non fanno somma: quel
  // conto non lo paga nessuno, e un totale diverso da zero lo farebbe
  // sembrare ancora da incassare.
  const confirmedTotal = confirmedLines.reduce(
    (s, l) => s + (l.annullata ? 0 : l.qty * l.unit_price),
    0
  )
  // QUANTI PEZZI DI OGNI PRODOTTO CI SONO NEL CONTO: è il numero sulla card
  // della griglia. Si conta per id, ma un conto può portarsi dietro l'id di
  // un prodotto che NON C'È PIÙ — cancellato e rifatto, o un catalogo
  // reimportato — e allora la card restava senza numero mentre le righe
  // erano lì sotto, a vista: sembrava che il conto e la griglia parlassero
  // di due cose diverse. In quel caso si ripiega sul NOME, che è quello che
  // legge chi sta al banco.
  const idPerNome = useMemo(() => {
    const m = new Map()
    for (const d of drinks || []) if (d?.name) m.set(d.name.trim().toLowerCase(), d.id)
    return m
  }, [drinks])
  const qtyByDrink = useMemo(() => {
    const vivi = new Set((drinks || []).map((d) => d.id))
    const chiave = (id, nome) =>
      id && vivi.has(id) ? id : idPerNome.get(String(nome || '').trim().toLowerCase()) || id
    const m = {}
    for (const l of confirmedLines) {
      if (l.custom) continue
      const k = chiave(l.drink_id, l.name)
      if (k) m[k] = (m[k] || 0) + l.qty
    }
    for (const l of bozzaViva) {
      if (l.custom) continue
      const k = chiave(l.drink_id, l.name)
      if (k) m[k] = (m[k] || 0) + l.qty
    }
    return m
  }, [confirmedLines, bozzaViva, drinks, idPerNome])

  // MODIFICA: l'item entra DIRETTAMENTE nella comanda che accoglie il lavoro
  // nuovo (modifica ottimistica, chiave riga stabile) e si sincronizza in
  // background — così NON si vede la riga "ricaricarsi" (niente swap
  // bozza→comanda). Se nessuna comanda del conto è più «da fare», ne nasce
  // una: dove finiscono le righe nuove lo dice comandaPerLeAggiunte, in un
  // posto solo.
  const addToEditableComanda = (item) => {
    const target = bersaglioAggiunte()
    if (!target) {
      // NESSUNA COMANDA DA FARE: le righe passano dalla BOZZA, che le
      // raccoglie e le manda tutte insieme (flushAdditions, poco dopo
      // l'ultimo tocco). Prima ogni tocco chiamava addComanda per conto
      // suo: tre tocchi di fila facevano tre ticket per lo stesso giro, e
      // al banco arrivavano tre comande da una riga. Le righe si vedono
      // subito lo stesso — la bozza sta nella lista come le altre.
      setDraft((items) => [...items, { line_id: makeLineId(), ...item }])
      return
    }
    // Dalla GRIGLIA ogni tocco è una riga a sé (due Spritz sono due righe, così
    // si possono personalizzare e annotare separatamente). Per aumentare la
    // quantità di una riga esistente si usa il + su quella riga.
    const cur = target.items || []
    const items = [...cur, item]
    const scrollIdx = items.length - 1
    segnaModifica(target.id, items, 500)
    scrollToLine(`c:${target.id}:${scrollIdx}`)
  }

  // + dalla griglia/catalogo o da una riga. In MODIFICA va dritto nella comanda;
  // in CREAZIONE finisce in bozza (poi createFromDraft crea l'ordine).
  const plusFromCatalog = (d) => {
    if (closed) return
    const base = {
      drink_id: d.id,
      name: d.name,
      unit_price: d.price,
      sumup_product_id: d.sumup_product_id ?? null,
      qty: 1,
    }
    if (!isNew) {
      addToEditableComanda(base)
      return
    }
    const nuova = { line_id: makeLineId(), ...base }
    setDraft((items) => [...items, nuova])
    scrollToLine(`d:${nuova.line_id}`)
  }

  // − dalla griglia: toglie dall'ultima riga di bozza; se non c'è, scala la
  // prima riga confermata modificabile (in preparazione) di quel drink.
  function minusFromCatalog(drinkId) {
    if (closed) return
    const idx = [...draft].reverse().findIndex((l) => !l.custom && l.drink_id === drinkId)
    if (idx >= 0) {
      const realIdx = draft.length - 1 - idx
      setDraft((items) =>
        items
          .map((l, j) => (j === realIdx ? { ...l, qty: l.qty - 1 } : l))
          .filter((l) => l.qty > 0)
      )
      return
    }
    if (isNew) return
    const line = confirmedLines.find((l) => l.removable && l.drink_id === drinkId && l.qty > 0)
    if (line) reduceComandaLine(line.comandaId, line.itemIndex)
  }

  const setDraftLineQty = (lineId, qty) =>
    setDraft((items) => items.map((l) => (l.line_id === lineId ? { ...l, qty } : l)).filter((l) => l.qty > 0))

  // Scala di 1 una specifica riga di una comanda modificabile (annulla un
  // item confermato ma ancora in preparazione), con sync debounced.
  function reduceComandaLine(comandaId, itemIndex) {
    if (closed) return
    const c = effComande.find((x) => x.id === comandaId)
    if (!c) return
    const items = (c.items || [])
      .map((it, j) => (j === itemIndex ? { ...it, qty: it.qty - 1 } : it))
      .filter((it) => it.qty > 0)
    segnaModifica(comandaId, items)
  }

  // − su una qualsiasi riga della lista, secondo lo stato.
  const minusRow = (l) => {
    if (closed) return
    if (l.source === 'draft') setDraftLineQty(l.line_id, l.qty - 1)
    else if (l.removable) reduceComandaLine(l.comandaId, l.itemIndex)
  }
  // + su una riga del conto: aumenta la quantità di QUELLA riga. È il gesto
  // opposto al tocco sulla griglia, che invece aggiunge una riga nuova.
  const plusRow = (l) => {
    if (closed || l.paid) return
    if (l.source === 'draft') {
      setDraftLineQty(l.line_id, l.qty + 1)
      return
    }
    // LA SALA NON RISCRIVE UNA COMANDA GIÀ MANDATA: il suo «+» è un drink in
    // più sul conto, e va al banco come un ticket nuovo — la stessa strada
    // di un tocco sulla griglia.
    if (aggiunteInComandaNuova(ruoloRef.current)) {
      addToEditableComanda({
        drink_id: l.drink_id,
        name: l.name,
        unit_price: l.unit_price,
        qty: 1,
        ...(l.custom ? { custom: true, recipe_items: l.recipe_items ?? [] } : {}),
      })
      return
    }
    const c = effComandeRef.current.find((x) => x.id === l.comandaId)
    if (!c || !(comandaEditable(c) || riaperto)) return
    const items = (c.items || []).map((it, j) => (j === l.itemIndex ? { ...it, qty: it.qty + 1 } : it))
    segnaModifica(l.comandaId, items)
  }

  // ── Riordino della lista ──
  // Lo fa dnd-kit, la stessa libreria della griglia dei prodotti: la riga
  // segue il dito e le altre si scansano da sole (vedi RigaOrdinabile).
  // Prima era fatto a mano, a lungo-premuto: la riga saltava, le altre no, e
  // capitava di spostarne una mentre si voleva solo toccarla.
  // Il riordino delle righe di bozza si rende persistente allineando
  // l'array della bozza all'ordine visivo.
  // Allinea l'ordine della bozza (persistito) alla sequenza visiva corrente.
  const syncDraftOrder = () => {
    const draftIds = layoutRef.current.filter((k) => k.startsWith('d:')).map((k) => k.slice(2))
    setDraft((cur) => {
      const byId = new Map(cur.map((l) => [l.line_id, l]))
      const next = draftIds.map((id) => byId.get(id)).filter(Boolean)
      return next.length === cur.length ? next : cur
    })
  }

  // Separa/Unisci agiscono su TUTTE le voci visibili: la bozza + gli item
  // delle comande modificabili (confermati). Sui confermati si programma il
  // salvataggio come per le altre modifiche per-riga.
  // Separare vuol dire anche dare a ogni riga nuova un identificativo suo:
  // vedi splitAll in lib/orderLines.js (le righe con lo stesso id sparivano).
  const explode = (items) => splitAll(items)
  const transformEditableComande = (transform) => {
    for (const c of effComande) {
      if (!comandaEditable(c)) continue
      const cur = c.items || []
      const items = transform(cur)
      if (items.length === cur.length) continue // niente da unire/separare qui
      segnaModifica(c.id, items)
    }
  }
  const mergeDraft = () => {
    setDraft((items) => mergeLines(items))
    transformEditableComande((items) => mergeLines(items))
  }
  const splitAllDraft = () => {
    setDraft((items) => splitAll(items))
    transformEditableComande(explode)
  }
  const editableComande = effComande.filter(comandaEditable)
  // Unisci e Separa sono INDIPENDENTI: si può avere insieme una riga da 5 (da
  // separare) e due righe uguali (da unire), quindi entrambi i tasti compaiono
  // quando l'azione è possibile — prima "Separa" spariva finché c'era qualcosa
  // da unire.
  const canMerge =
    hasMergeable(draft) || editableComande.some((c) => hasMergeable(c.items || []))
  const canSplit =
    draft.some((l) => l.qty > 1) ||
    editableComande.some((c) => (c.items || []).some((i) => i.qty > 1))
  const applyEdit = ({ name, price, recipe_items, note }) => {
    const l = editLine
    setEditLine(null)
    if (!l) return
    // Ricetta SEMPRE un array: svuotarla a mano è una scelta, non va riletta
    // dal prodotto di catalogo al prossimo giro.
    const patch = { name, unit_price: price, custom: true, recipe_items: recipe_items || [], note: note || null }
    if (l.source === 'draft') {
      if (draftRef.current.some((x) => x.line_id === l.line_id)) {
        setDraft((items) => items.map((x) => (x.line_id === l.line_id ? { ...x, ...patch } : x)))
        return
      }
      // La riga è DIVENTATA un item confermato mentre l'editor era aperto:
      // il conto nasce da solo sotto le dita, la bozza cambia chiave e il
      // ritocco cadeva nel vuoto. La si insegue nella comanda che se l'è
      // presa — stessa identità, il line_id.
      for (const c of effComandeRef.current) {
        const idx = (c.items || []).findIndex((it) => it.line_id === l.line_id)
        if (idx >= 0) {
          segnaModifica(c.id, c.items.map((it, j) => (j === idx ? { ...it, ...patch } : it)))
          return
        }
      }
      return
    }
    // Item già CONFERMATO (comanda in preparazione): modifica ottimistica sulla
    // comanda + sync in background (come le diminuzioni per-riga).
    const c = effComandeRef.current.find((x) => x.id === l.comandaId)
    if (!c) return
    const items = (c.items || []).map((it, idx) => (idx === l.itemIndex ? { ...it, ...patch } : it))
    segnaModifica(l.comandaId, items)
  }

  // Dati di partenza dell'editor per-item: se la riga è già stata
  // personalizzata si riprende la sua ricetta, altrimenti si carica quella
  // del prodotto di catalogo — così gli ingredienti si possono sostituire
  // o togliere, non solo aggiungere.
  const editInitial = useMemo(() => {
    if (!editLine) return null
    const base = drinks.find((d) => d.id === editLine.drink_id)
    const recipe = editLine.custom
      ? editLine.recipe_items || []
      : base?.recipe_items || []
    return {
      name: editLine.name,
      price: editLine.unit_price,
      recipe_items: recipe,
      note: editLine.note || '',
    }
  }, [editLine, drinks])

  // Righe di bozza → item per createOrder (usano `price`).
  // `line_id` viaggia con l'item fino al documento dell'ordine. Non serve ai
  // conti: serve a non far SALTARE la riga quando la bozza diventa item
  // confermato. Senza, la chiave React cambiava (d:… → c:…), il nodo veniva
  // ricreato e l'item appena aggiunto rifaceva il suo effetto di comparsa —
  // il "piccolo relayout" che si vedeva a ogni primo drink.
  const draftToItems = (righe = draft) =>
    righe.map((l) => ({
      drink_id: l.drink_id,
      name: l.name,
      price: l.unit_price,
      qty: l.qty,
      line_id: l.line_id,
      ...(l.custom ? { custom: true } : {}),
      ...(l.recipe_items ? { recipe_items: l.recipe_items } : {}),
      ...(l.note ? { note: l.note } : {}),
    }))

  // DA QUALE TERMINALE. Serve a non avvisare chi l'ordine l'ha appena
  // mandato — e solo lui: lo stesso account sta su tablet, telefono e
  // portatile insieme, e chi e' rimasto al banco l'avviso lo vuole.
  const placedBy = () =>
    staff
      ? { email: staff.email, name: staff.name, role: staff.role, device: idDispositivo() }
      : undefined

  // In che passo nasce un conto lo dice il locale, e lo dice in un posto
  // solo (statoComandaNuova): qui non si decide niente, si chiede.
  const statoIniziale = statoComandaNuova(settings)
  // Stesso motivo per il passo in cui nasce una comanda: l'impostazione può
  // cambiare mentre la schermata è aperta, e il callback dell'aggiunta è
  // già stato creato.
  const statoNuovaRef = useRef(statoIniziale)
  statoNuovaRef.current = statoIniziale
  // Con che modo NASCE un conto battuto qui: lo dice l'impostazione del
  // locale, che è un valore di partenza e non un vincolo — da «Dati conto»
  // si cambia sempre, conto per conto (vedi lib/consegna.js).
  const modoConsegna = modoAllaNascita(settings)

  // MODIFICA: manda al server le aggiunte in sospeso (senza navigare). Gli
  // item confluiscono nella comanda ancora «da fare», se c'è; da «in
  // preparazione» in poi ne nasce una NUOVA (comandaPerLeAggiunte). Usata
  // dall'AUTO-CONFERMA (ogni aggiunta è confermata subito) e all'uscita per
  // non perdere nulla.
  // `scelta` la passa una persona, e solo col servizio spento (vedi
  // `sceltaAggiunte` più sotto): 'comanda' = le righe entrano nell'ultima
  // comanda del conto, 'nuova' = ne nasce una. Senza scelta decide la
  // regola (comandaPerLeAggiunte), che è quello che succede sempre col
  // servizio acceso e durante la creazione.
  const flushAdditions = useCallback((scelta = null) => {
    if (isNew || !order?.id) return
    // La bozza DEPURATA delle righe che una comanda porta già: un cassetto
    // rimasto sporco (crash, corse alla nascita del conto) non deve battere
    // due volte le stesse righe. `clearDraft` sotto pulisce comunque tutto.
    const additions = bozzaVivaRef.current
    if (!additions || additions.length === 0) {
      if (draftRef.current.length > 0) clearDraft()
      return
    }
    const target =
      scelta === 'nuova'
        ? null
        : scelta === 'comanda'
          ? ultimaComandaViva(effComandeRef.current)
          : bersaglioAggiunte()
    const oid = order.id
    if (target) {
      // OTTIMISTICO: gli item entrano SUBITO nella comanda (stesso render in cui
      // si svuota la bozza), così non spariscono un istante = niente flicker. Il
      // sync col server (e la pulizia dell'override) li fa flushComanda.
      const merged = [...(target.items || []), ...additions]
      clearDraft()
      segnaModifica(target.id, merged, 250)
    } else {
      // NESSUNA COMANDA DA FARE → NE NASCE UNA. E resta a schermo
      // mentre vola al server: prima si svuotava la bozza e si aspettava la
      // risposta, quindi per un attimo — o per tutto il tempo che la rete si
      // prendeva — quelle righe non esistevano da nessuna parte. Chi in
      // quell'attimo apriva il pagamento non le trovava, e il conto era
      // giusto solo dopo la sincronizzazione. Qui non si aspetta niente:
      // vedi docs/architettura.md.
      clearDraft()
      // NASCE COME NASCERÀ DAVVERO: stesso passo e stesso numero che le
      // darà il server (statoComandaNuova, letto dalla stessa regola).
      // Prima la provvisoria diceva
      // «da fare» e «comanda 0», e un istante dopo cambiava tutte e due le
      // cose da sé, sotto gli occhi di chi stava leggendo quale preparare.
      const inVolo = comandaProvvisoria({
        seq: effComandeRef.current.reduce((m, x) => Math.max(m, x.seq || 0), 0) + 1,
        status: statoNuovaRef.current,
        items: additions,
      })
      comandeLocaliRef.current.applica({ id: oid, comande: effComandeRef.current }, (arr) => [
        ...arr,
        inVolo,
      ])
      ;(async () => {
        try {
          await flushAll()
          await addComanda(oid, additions)
        } catch (e) {
          // Non è arrivata: le righe tornano in bozza, così si vedono ancora
          // e si può riprovare. Sparire in silenzio sarebbe peggio.
          comandeLocaliRef.current.applica({ id: oid, comande: [] }, (arr) =>
            arr.filter((c) => c.id !== inVolo.id)
          )
          saveDraft(oid, additions)
          toastError(`Aggiunte non inviate: ${e.message}`)
        }
      })()
    }
  }, [isNew, order?.id, flushAll, clearDraft, segnaModifica])

  // Auto-conferma in MODIFICA: poco dopo l'ultima aggiunta gli item vengono
  // confermati da soli (niente tasto Conferma, niente stato "non confermato"
  // che resta). In CREAZIONE resta la conferma manuale (serve nome/tavolo).
  // Il timer dipende SOLO da draft/isNew (flushAdditions via ref) così non si
  // resetta a ogni render.
  const flushAdditionsRef = useRef(flushAdditions)
  flushAdditionsRef.current = flushAdditions
  // Poco dopo l'ultima aggiunta: in MODIFICA gli item si confermano da soli;
  // in CREAZIONE l'ordine viene CREATO con la bozza e si passa alla modifica
  // (da lì le aggiunte successive si confermano al volo). Il timer si resetta a
  // ogni aggiunta, così parte solo quando la bozza è "ferma" (batch completo).
  useEffect(() => {
    // Con la scelta a schermo l'auto-conferma non parte: le righe aspettano
    // che qualcuno dica dove vanno (vedi `sceltaAggiunte`). All'uscita
    // partono lo stesso, nella comanda — è la strada che non fa carta in più.
    if (draft.length === 0 || sceltaAggiunte) return
    const t = setTimeout(() => {
      if (isNew) createFromDraftRef.current()
      else flushAdditionsRef.current()
    }, 300)
    return () => clearTimeout(t)
  }, [draft, isNew, sceltaAggiunte])

  // CREAZIONE: appena si aggiunge il primo item l'ordine viene CREATO IN PLACE
  // (setSelfOrder), SENZA navigare: la schermata resta montata e da lì si
  // continua come nella modifica (aggiunte confermate al volo). Il nome si
  // chiede solo all'uscita, se manca.
  const creatingRef = useRef(false)
  // LA CHIAVE DELLA BATTUTA. Identifica QUESTA creazione: se la richiesta
  // parte due volte — l'auto-creazione mentre si preme «Paga», un doppio
  // tocco — il conto resta uno solo (vedi createOrder). Non cambia finché
  // la schermata resta in creazione.
  const chiaveBattutaRef = useRef(null)
  const chiaveBattuta = () => {
    if (!chiaveBattutaRef.current) {
      chiaveBattutaRef.current = `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    }
    return chiaveBattutaRef.current
  }
  // Promise dell'ordine in creazione: chi arriva mentre la creazione è in volo
  // (es. il tasto Pagamento) deve ASPETTARE questo, non creare un secondo
  // ordine — altrimenti si ritrovano due conti con lo stesso nome/tavolo.
  const creatingPromiseRef = useRef(null)
  const itemsInVoloRef = useRef(null)
  const createFromDraft = async () => {
    if (!isNew) return null
    if (creatingRef.current) return creatingPromiseRef.current
    const items = draftToItems()
    if (items.length === 0) return null
    // QUALI RIGHE STANNO PARTENDO. La creazione dura qualche decimo di
    // secondo, e in quei decimi al banco si continua a battere: le righe
    // aggiunte nel frattempo NON sono in questo ordine e non vanno buttate
    // via con le altre.
    const inviate = new Set(items.map((i) => i.line_id))
    creatingRef.current = true
    // LA BOZZA SI SVUOTA SUBITO, non quando il server risponde. Aspettare la
    // scrittura voleva dire che, uscendo prima della sincronizzazione, il
    // conto DOPO si apriva con dentro la roba di quello prima — righe già
    // battute su un altro conto, pronte a essere battute due volte.
    // Le righe arrivate mentre l'ordine nasceva restano da parte: appena
    // c'è l'id vanno nella bozza sua.
    // Le righe restano a schermo mentre il conto nasce: quello che si vede e
    // quello che si ritrova riaprendo sono due cose diverse (vedi useDraft).
    const partite = draftRef.current.filter((r) => inviate.has(r.line_id))
    // Le righe che stanno partendo restano a portata di mano: chi preme
    // «Pagamento» in quell'istante deve vedere il conto, non una schermata
    // vuota perché la bozza è già stata svuotata.
    itemsInVoloRef.current = items
    const restanti = draftRef.current.filter((r) => !inviate.has(r.line_id))
    dimenticaBozzaSalvata()
    const run = async () => {
      try {
        const created = await createOrder({
          table_label: info.table_label || null,
          note: info.note || null,
          customer_name: info.customer_name.trim() || null,
          items,
          client_temp_id: chiaveBattuta(),
          // Il conto nasce mentre lo si sta ancora battendo: la sessione di
          // creazione resta aperta finché non si esce da questa schermata.
          in_creazione: true,
          placed_by: placedBy(),
          status: statoIniziale,
          service_mode: modoConsegna,
          group_id: group && !groupIsContainer ? group.id : null,
          group_name_snapshot: group && !groupIsContainer ? group.name : null,
        })
        // LE RIGHE BATTUTE MENTRE L'ORDINE NASCEVA NON SI BUTTANO: la bozza
        // cambia CHIAVE — da 'new' all'id dell'ordine — e vanno passate a
        // mano, altrimenti restano in un cassetto che nessuno riapre più.
        // Un istante dopo, l'auto-conferma le manda dentro l'ordine.
        const arrivateDopo = draftRef.current.filter((r) => !inviate.has(r.line_id))
        const daPortare = [...restanti, ...arrivateDopo]
        if (daPortare.length) saveDraft(created.id, daPortare)
        // LE RIGHE PARTITE POSSONO ESSERE CAMBIATE NEL FRATTEMPO. Mentre il
        // conto nasceva si può aver ritoccato una riga già inviata — il
        // prezzo, la ricetta, la quantità, perfino toglierla. Quelle
        // modifiche non stanno in `daPortare` (la riga è fra le inviate) né
        // nell'ordine creato (è nato con la versione vecchia): andavano
        // perse — il gin buono messo a mano tornava di listino (BUG-016, ma
        // in creazione). Qui si confronta la comanda nata con la bozza
        // com'è ADESSO e la differenza parte come una modifica qualsiasi.
        orderIdRef.current = created.id
        const correzione = correggiComandaNata(created, inviate, draftRef.current)
        if (correzione) segnaModifica(correzione.comandaId, correzione.items, 0)
        itemsInVoloRef.current = null
        if (montatoRef.current) {
          selfOrderJsonRef.current = JSON.stringify(created) // evita un re-render doppio dalla subscription
          ricordaContoInCorso(created.id) // se la pagina ricarica, si riprende da qui
          setSelfOrder(created) // diventa "modifica" in place, niente reload
        }
        return created
      } catch (e) {
        creatingRef.current = false
        creatingPromiseRef.current = null
        // Il conto non è nato: le righe tornano in bozza. Averle svuotate
        // subito non deve costare quello che si era battuto.
        saveDraft('new', [...partite, ...restanti])
        toastError(`Ordine non creato: ${e.message}`)
        return null
      }
    }
    creatingPromiseRef.current = run()
    return creatingPromiseRef.current
  }
  const createFromDraftRef = useRef(createFromDraft)
  createFromDraftRef.current = createFromDraft

  // Modale nome (uscita di un ordine appena creato senza nome): lo salva
  // sull'ordine e torna alla coda.
  const submitNew = (name) => {
    setAskName(false)
    const nm = (name || '').trim() || null
    // Il conto può essere ancora in fase di nascita: il nome lo si mette
    // appena c'è, in sottofondo. Nessuno resta a guardare una schermata
    // ferma per un campo di testo.
    if (nm) {
      const dove = order?.id ? Promise.resolve(order) : creatingPromiseRef.current
      Promise.resolve(dove)
        .then((o) => (o?.id ? updateOrderInfo(o.id, { customer_name: nm }) : null))
        .catch((e) => toastError(`Nome non salvato: ${e.message}`))
    }
    setInfo({ customer_name: '', table_label: '', note: '' })
    navigate('/bar')
  }

  // "Invia" manda la COMANDA al banco (non lo scontrino del cliente): si
  // stampa quella in lavorazione, con dentro anche le aggiunte appena
  // fatte. Sta qui e non dentro il tasto perché la usano in due: il footer
  // sul tablet e il menu delle azioni sul telefono.
  function inviaComanda() {
    // ANCHE SU UN CONTO APPENA BATTUTO. Prima il tasto era spento finché
    // l'ordine non esisteva sul server: al banco vuol dire aspettare la rete
    // per mandare in stampa una comanda che si ha già davanti. Il conto si
    // crea qui (in locale, immediato) e la stampa parte appena c'è.
    if (isNew) {
      const nascita = createFromDraftRef.current()
      Promise.resolve(nascita).then((o) => {
        if (!o) return
        printComanda(o, (o.comande || []).at(-1) || null)
          .then(() => toastSuccess('Comanda inviata al banco'))
          .catch((e) => setError(`Stampa: ${e.message}`))
      })
      return
    }
    flushAll()
    flushAdditions()
    const daStampare =
      active ??
      effComandeRef.current.filter((c) => c.status !== ORDER_STATUSES.ANNULLATO).at(-1) ??
      null
    printComanda(order, daStampare)
      .then(() => toastSuccess('Comanda inviata al banco'))
      .catch((e) => setError(`Stampa: ${e.message}`))
  }

  // C'È QUALCOSA SU CUI LAVORARE? In creazione sono le righe in bozza —
  // oppure quelle appena partite per la creazione, perché la bozza si svuota
  // subito e i tasti non devono spegnersi in quell'istante.
  const conRighe = draftCount > 0 || (itemsInVoloRef.current || []).length > 0 || !isNew

  // ANNULLARE SI PUÒ FINCHÉ IL CONTO È APERTO, e in creazione sempre: è la
  // via d'uscita di chi ha aperto un conto per sbaglio o ha cambiato idea.
  // I tasti «annulla» sono due (il pannello e la barra azioni) e avevano due
  // regole diverse — quello della barra era spento per tutta la creazione,
  // anche a righe battute. Da qui in poi la regola è una sola.
  // ANNULLARE UN CONTO GIÀ APERTO butta il lavoro del banco: è di chi versa.
  // In creazione invece si annulla sempre — lì non c'è niente di nessuno,
  // solo la bozza che si sta battendo.
  const annullaSpento = isNew ? false : closed || !comandaIlLavoro
  const annullaOrdine = () => {
    // Senza righe non c'è niente da buttare né da annullare: si torna in
    // coda e basta, senza far confermare una cosa che non succede.
    if (isNew && !conRighe) {
      ricordaContoInCorso(null)
      navigate('/bar')
      return
    }
    setConfirmCancel(true)
  }

  // Quante righe si porterebbe via il «svuota»: in creazione la bozza, su un
  // conto aperto anche quelle già confermate ma ancora modificabili.
  const righeDaSvuotare = isNew
    ? draftCount
    : draftCount + confirmedLines.filter((l) => l.removable !== false).length

  function svuotaTutto() {
    clearDraft()
    if (isNew) return
    // Sul conto vero le righe si tolgono UNA PER UNA con la strada di
    // sempre (reduceComandaLine): così comande e magazzino restano in pari,
    // e non c'è una seconda logica di cancellazione che un giorno dirà una
    // cosa diversa dalla prima.
    for (const l of confirmedLines.filter((r) => r.removable)) {
      for (let i = 0; i < (Number(l.qty) || 0); i++) {
        reduceComandaLine(l.comandaId, l.itemIndex)
      }
    }
  }

  // PAGAMENTO IN CREAZIONE. La schermata si apre SUBITO su un guscio locale
  // (righe e totale li ricompone `ordineDaPagare`, sempre da quello che c'è
  // a schermo) e il conto nasce per la strada di sempre — createFromDraft —
  // che al ritorno porta con sé le righe battute nel frattempo e passa la
  // schermata a modifica. Prima qui viveva una SECONDA creazione, con le
  // righe congelate al momento del tocco: quello che si batteva dopo —
  // chiudendo il pagamento e riaprendolo — restava orfano, e alla risposta
  // del server la bozza si svuotava buttando anche quello. Il pagamento
  // mostrava solo il primo giro finché il server non risincronizzava, e a
  // volte per sempre (BUG-017).
  function handlePayNow() {
    // Le righe possono essere già partite per la creazione: la bozza si
    // svuota subito (vedi createFromDraft) e restano in volo.
    const inVolo = itemsInVoloRef.current || []
    if ((draft.length === 0 && inVolo.length === 0) || showPayment || payOrder) return
    setError(null)
    // Il guscio fa aprire la schermata prima che l'ordine esista. Numero e
    // dati sono quelli che la testata mostra già.
    setPayOrder({
      id: null,
      daily_number: nextNum,
      status: ORDER_OPEN,
      payment_status: 'non_richiesto',
      customer_name: info.customer_name.trim() || null,
      table_label: info.table_label || null,
      discount: null,
      discount_amount: 0,
      payments: [],
      lottery_code: null,
      invoice_number: null,
      comande: [],
      order_items: [],
    })
    setShowPayment(true)
    // Una sola strada per nascere: se l'auto-creazione è già in volo,
    // createFromDraft restituisce QUELLA (creatingRef), non un secondo conto.
    payIdRef.current = createFromDraftRef.current().then((o) => {
      if (!o?.id) throw new Error('Ordine non creato')
      return o.id
    })
    payIdRef.current.catch(() => {
      // Il motivo lo ha già detto il toast della creazione: qui si chiude il
      // pagamento; la bozza è tornata intatta e si riprova.
      if (!montatoRef.current) return
      setPayOrder(null)
      setShowPayment(false)
      payIdRef.current = null
    })
  }

  // ── Comanda attiva: azione rapida di avanzamento (modifica) ──
  const active = activeComanda({ comande: effComande })

  // SI LEGGE A CHE PUNTO STA IL LAVORO? Solo su un conto già nato, in un
  // locale che segue il servizio, e finché il conto è in corso: su un conto
  // chiuso quel passo non è più una cosa da fare. Le condizioni sono quelle
  // di sempre — è la POSIZIONE della pastiglia che è cambiata, non quando
  // compare — e stanno in una costante perché adesso le guarda anche la
  // barra in alto, per sapere quanto spazio le resta.
  const mostraStatoLavoro = !isNew && workflowOn && !!active && !closed

  // SUL TELEFONO NON CI STANNO DUE PASTIGLIE PER ESTESO. Misurato in Chrome
  // vero: la barra al completo chiede 505px, e un telefono ne ha 360-430.
  // Cedono in quest'ordine — l'ora, che si rilegge nella storia del conto, e
  // poi la PAROLA dello stato del conto, che resta il suo segno col nome nel
  // title: quel conto ce l'hai aperto davanti, e quanto c'è da incassare lo
  // dice comunque il tasto in fondo. Resta per esteso quello che nella barra
  // ci è appena arrivato, e che nient'altro lassù dice: il lavoro.
  const barraStretta = telefono && mostraStatoLavoro

  // ── Info conto ──
  const [info, setInfo] = useState({
    customer_name: order?.customer_name || '',
    table_label: order?.table_label || '',
    note: order?.note || '',
  })
  const [showInfo, setShowInfo] = useState(false) // popup dati conto
  // Progressivo previsto per l'ordine in creazione (non lo consuma).
  // PROGRESSIVO PREVISTO, subito. La lettura del contatore è asincrona: finché
  // non rispondeva la testata diceva "Nuovo ordine" e poi diventava "#12" —
  // una parola che si trasforma in un numero, con tutto quello che sta
  // accanto che si sposta. Si parte dall'ultimo numero visto (in memoria
  // locale) e lo si corregge quando arriva quello vero: nel caso normale è
  // già giusto e non si muove niente.
  const [nextNum, setNextNum] = useState(numeroPrevistoInCache)
  useEffect(() => {
    if (!isNew) return
    let vivo = true
    peekNextDailyNumber({ cutoffHour: settings.business_day_cutoff_hour })
      .then((n) => {
        if (!vivo) return
        setNextNum(n)
        ricordaNumeroPrevisto(n)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [isNew, settings.business_day_cutoff_hour])
  const orderId = order?.id
  useEffect(() => {
    if (isNew) return
    setInfo({
      customer_name: order.customer_name || '',
      table_label: order.table_label || '',
      note: order.note || '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])
  // CHIUSURA DEL POPUP DATI CONTO — sempre salvando.
  // Prima il salvataggio stava solo sul tasto: chiudendo con la ✕, toccando
  // fuori dal riquadro o premendo Invio (che chiude la tastiera e sembra
  // confermare) il nome appena scritto spariva senza un avviso. È il "a
  // volte non viene salvato" segnalato: dipende da COME si chiude.
  const infoDirty =
    !isNew &&
    (info.customer_name !== (order.customer_name || '') ||
      info.table_label !== (order.table_label || '') ||
      info.note !== (order.note || ''))

  // CHIUSURA DEL POPUP DATI CONTO — sempre salvando.
  // Prima il salvataggio stava solo sul tasto: chiudendo con la ✕, toccando
  // fuori dal riquadro o premendo Invio (che chiude la tastiera e sembra
  // confermare) il nome appena scritto spariva senza un avviso. È il "a
  // volte non viene salvato": dipende da COME si chiude il popup.
  // Invio nel popup: chiude la tastiera E salva. Prima chiudeva solo la
  // tastiera, e chi dava per fatto il salvataggio perdeva il nome.
  const infoOnEnter = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    dismissKeyboard(e.currentTarget)
    chiudiInfo()
  }

  // ── SERVIZIO O RITIRO SU QUESTO CONTO ──────────────────────
  //
  // L'impostazione del locale dice come NASCONO i conti; qui si cambia
  // quello che si ha in mano. E cambia i SOLDI: il ritiro azzera coperto e
  // servizio. Le regole stanno in lib/consegna.js.
  const modoDelConto = isNew ? modoConsegna : order?.service_mode || null
  const cambiaModoConsegna = (modo) => {
    if (isNew) return
    setOrderServiceMode(order.id, modo).catch((e) =>
      toastError(`Modo non cambiato: ${e.message}`)
    )
  }

  const chiudiInfo = () => {
    setShowInfo(false)
    if (isNew || !order?.id || closed || !infoDirty) return
    updateOrderInfo(order.id, info).catch((e) =>
      toastError(`Dati conto non salvati: ${e.message}`)
    )
  }

  const extras =
    Number(order?.coperto_amount || 0) +
    Number(order?.service_charge_amount || 0) +
    Number(order?.tip_amount || 0)

  // Un ordine senza alcun identificativo (nome o tavolo): all'uscita di un
  // ordine APPENA creato glielo si chiede una volta sola.
  const needsName = (o) => o && !o.customer_name && !o.table_label

  // Uscita dalla schermata.
  const askNameThenExit = () => {
    nameAskedRef.current = true
    setAskName(true)
  }
  const handleExit = () => {
    // Uscendo dal conto la ripresa non serve più: si esce apposta, non per
    // sbaglio. Restasse, il prossimo "nuovo ordine" ripartirebbe da questo.
    ricordaContoInCorso(null)
    if (!isNew) {
      // Le modifiche ottimistiche ancora in volo (aggiunte/decrementi) si
      // inviano ora, per non perderle uscendo. Se è un ordine creato in place
      // senza nome, lo si chiede una volta prima di uscire.
      flushAll()
      flushAdditions()
      if (createdInPlace && !nameAskedRef.current && needsName(order)) return askNameThenExit()
      return navigate('/bar')
    }
    // Nulla ancora creato (uscita prima dell'auto-creazione): il conto si crea
    // ORA, ma NON SI ASPETTA. Prima si aspettava che fosse nato per sapere se
    // chiedere il nome — e siccome il nome lo si sa già da qui (è quello che
    // si è scritto, o non si è scritto, in questa schermata), l'unica cosa
    // che quell'attesa produceva era il box che compariva in ritardo.
    if (draftCount === 0) return navigate('/bar')
    createFromDraftRef.current()
    const senzaNome = !info.customer_name.trim() && !info.table_label.trim()
    if (!nameAskedRef.current && senzaNome) return askNameThenExit()
    navigate('/bar')
  }

  // In creazione si mostra GIÀ il progressivo che l'ordine avrà (letto dal
  // contatore della sessione di cassa), invece di un generico "Nuovo ordine":
  // il numero è il riferimento che si dice al cliente e si scrive sul bicchiere.
  const numero = isNew ? nextNum : order.daily_number
  // Mai una parola al posto del numero: se non lo si sa ancora si tiene il
  // segnaposto, che occupa lo stesso spazio.
  const headTitle = numero != null ? `#${numero}` : '#…'
  const nomeConto = isNew ? info.customer_name.trim() : order.customer_name
  const panelTitle = `${headTitle}${nomeConto ? ` · ${nomeConto}` : ''}`
  const canPay = !isNew && !closed && order.payment_status !== 'pagato'
  // IL TASTO DEL PAGAMENTO, SU UN CONTO CHIUSO, RIMETTE IN CORSO. Lì era
  // spento a non fare niente — e accanto ce n'era un secondo, che compariva
  // solo in quel caso. Due tasti per due stati dello stesso conto: quello
  // che serve è uno, che dice cosa si può fare adesso. È anche il posto
  // dove il dito va già: su un conto chiuso per sbaglio si preme lì.
  const daRiaprire = !isNew && ripristinabile(order)

  // ── IL PAGAMENTO GUARDA IL CONTO COM'È A SCHERMO ───────────────────
  //
  // `order` è quello che sa il SERVER — e in creazione non c'è nemmeno: al
  // suo posto c'è il guscio `payOrder`. Le righe appena battute stanno
  // ancora nella bozza (si confermano da sole poco dopo) o in una scrittura
  // in volo: chi batteva due drink e apriva subito il pagamento si trovava
  // il conto di prima — quattro righe a schermo, tre nel pagamento, col
  // cliente davanti e il totale sbagliato.
  //
  // Qui il conto si ricompone in locale, come vuole la regola di casa
  // (docs/architettura.md): le comande con dentro le modifiche in volo, la
  // bozza VIVA (senza le righe che una comanda porta già) come una comanda
  // in più, e il totale che si vede sotto le righe. Vale in modifica E in
  // creazione: il pagamento mostra sempre quello che si è battuto, che il
  // server abbia già risposto o no. Il server lo raggiunge un istante dopo
  // — ci pensa `onBeforePay`, che manda tutto prima di registrare l'incasso.
  const ordineDaPagare = useMemo(() => {
    const base = order || payOrder
    if (!base) return null
    const bozza = draftToItems(bozzaViva).map((i) => ({
      drink_id: i.drink_id,
      name: i.name,
      unit_price: i.price,
      qty: i.qty,
      ...(i.line_id ? { line_id: i.line_id } : {}),
      ...(i.custom ? { custom: true } : {}),
    }))
    const comandeLocali = bozza.length
      ? [...effComande, { id: '__bozza', status: ORDER_STATUSES.RICEVUTO, items: bozza }]
      : effComande
    return {
      ...base,
      comande: comandeLocali,
      total: confirmedTotal + draftTotal + extras,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, payOrder, effComande, bozzaViva, confirmedTotal, draftTotal, extras])

  // Aprendo il pagamento la bozza si conferma SUBITO, senza aspettare il
  // mezzo secondo dell'auto-conferma: da lì in poi quelle righe sono del
  // conto, e non c'è una finestra in cui esistono solo a schermo.
  const apriIlPagamento = useCallback(() => {
    flushAdditions()
    setShowPayment(true)
  }, [flushAdditions])
  // QUANTO RESTA DA INCASSARE, scritto sul tasto Pagamento. Prima la cifra
  // compariva solo finché l'ordine non esisteva ancora: appena si creava da
  // sé — cioè un istante dopo il primo prodotto — spariva, e sembrava un
  // difetto. È il totale meno lo sconto e gli acconti già presi.
  // Ingranditi al massimo dalla maniglia, tre parole non stanno su una
  // riga: da lì in poi restano le sole icone. Meglio un'icona che si vede
  // di una parola tagliata. (La scala del footer va da 80 a 175.)
  const soloIcone = telefono && footRz.width > 118

  const daIncassare = Math.max(
    0,
    confirmedTotal +
      draftTotal +
      extras -
      (isNew ? 0 : scontoTotale(order) + paidAmount(order))
  )

  return (
    // L'altezza si divide per lo zoom: dentro un contenitore scalato 100dvh
    // varrebbe più dello schermo e la schermata sborderebbe (vedi ZoomControl).
    <div
      className="posd-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100dvh / var(--zoom, 1))',
        overflow: 'hidden',
      }}
    >
      {/* ── Barra in alto (sotto la barra di sistema del tablet: --safe-top) ── */}
      {/* Com'è messa la riga sta in .posd-topbar, non qui: da `style` inline
          vinceva sempre lei, e il `gap` del telefono non ha mai contato. */}
      {/* `con-lavoro`: con la pastiglia del lavoro a bordo la riga è più
          piena, e le soglie del foglio di stile sanno cosa togliere. */}
      <div className={`posd-topbar${mostraStatoLavoro ? ' con-lavoro' : ''}`}>
        {/* Sul telefono la sola freccia: "Ordini" scritto per esteso andava a
            capo e si mangiava la riga, dove servono numero, ora e stato. */}
        <button className="btn ghost small" aria-label="Torna agli ordini" onClick={handleExit}>
          {telefono ? '←' : '← Ordini'}
        </button>
        <strong className="posd-num">{headTitle}</strong>
        {/* QUANDO è stato aperto il conto, accanto al numero: sapere che quel
            tavolo è lì dalle nove cambia come lo si tratta. Sul telefono, con
            lo stato del lavoro a bordo, è la prima cosa che cede: la si
            rilegge nella storia del conto, dal ⋯. */}
        {!isNew && order.created_at && !barraStretta && (
          <span className="muted small posd-aperto" title="Conto aperto il">
            {apertoIl(order.created_at)}
          </span>
        )}
        {!isNew && (() => {
          // Il pill del conto porta anche lo stato del pagamento: un conto
          // aperto può essere già saldato (in attesa di servizio) o pagato
          // in parte. Meglio un solo pill parlante che due accostati.
          // Se è già saldato, il pill NON dice "aperto": dice "Pagato". Che
          // resti da servire lo mostrano lo stato di lavorazione e il footer.
          const paid = order.payment_status === 'pagato'
          const parziale = order.payment_status === 'parziale'
          const aperto = order.status === ORDER_OPEN
          const cls = aperto && paid ? 'pagato' : order.status
          const emoji = aperto && paid ? '💳' : STATUS_EMOJI[order.status]
          const label =
            aperto && paid
              ? 'Pagato'
              : aperto && parziale
                ? `Acconto ${formatPrice(paidAmount(order))}`
                : STATUS_LABELS[order.status]
          return (
            // IL `title` DICE DI COSA PARLA QUESTA PASTIGLIA. Da quando in
            // fondo alla barra c'è anche quella della lavorazione
            // (posd-stato), due pastiglie sulla stessa riga possono sembrare
            // due versioni della stessa cosa — e «🟢 Conto aperto» e «🔔
            // Pronto» sono pure dello stesso verde. Qui i SOLDI, là il
            // LAVORO, e ognuna lo dice a chi ci si ferma sopra.
            // SUL TELEFONO RESTA IL SOLO SEGNO (🟢 / 💳 / 🟡): la parola non
            // ci sta in due, e questa è quella che si può perdere — il conto
            // è aperto davanti a chi guarda, e quanto resta da incassare sta
            // scritto sul tasto in fondo. Il nome per esteso non sparisce:
            // resta nel `title`, come già per l'ora e per l'id.
            <span className={`pill ${cls} posd-conto-stato`} title={`Stato del conto: ${label}`}>
              {/* Il ramo largo resta scritto com'era — `{emoji} {label}`, tre
                  figli e i 6px del pill in mezzo — perché è così che si
                  vestono tutte le pastiglie dell'app: unirli in una stringa
                  sola l'avrebbe stretta di una decina di pixel rispetto alle
                  sorelle in coda. */}
              {barraStretta ? (
                emoji
              ) : (
                <>
                  {emoji} {label}
                </>
              )}
            </span>
          )
        })()}
        {!isNew && order.placed_by && (
          <span className="muted small posd-autore">✍️ {placedByName(order.placed_by)}</span>
        )}
        {/* Progressivo assoluto di sistema: id interno che non riparte mai
            (il #N in grande invece riparte ogni giornata). */}
        {!isNew && order.serial != null && (
          <span
            className="muted posd-serial"
            style={{ fontSize: '0.7rem', opacity: 0.6 }}
            title="Progressivo interno dell'ordine"
          >
            id {String(order.serial).padStart(5, '0')}
          </span>
        )}
        {/* A CHE PUNTO STA IL LAVORO, IN FONDO A DESTRA DELLA BARRA.
            «Sposta lo stato di servizio nella barra in alto» (l'utente,
            21/08/2026, con la freccia sullo spazio vuoto a destra). Stava
            nella testata della colonna del conto, accanto al numero: lì
            rispondeva alla stessa domanda, ma era una pastiglia dentro la
            riga dei tasti del conto, e la barra in alto — che è la riga
            del «com'è messo questo conto» — quello spazio ce l'aveva
            vuoto. A sinistra il CONTO e i SOLDI (numero, ora, stato del
            conto, chi l'ha aperto), a destra il LAVORO: due domande
            diverse, due estremi della stessa riga.
            CON PIÙ COMANDE IN PASSI DIVERSI il conto non ha UN solo
            stato: si mostra quello della comanda ATTIVA, cioè il passo
            PIÙ INDIETRO fra quelle aperte (activeComanda). Chi apre un
            conto vuole sapere quanto MANCA, non quanto è già uscito — ed
            è la stessa regola con cui la coda decide lo stato di un
            conto, quindi le due schermate non possono discordare. */}
        {mostraStatoLavoro && (
          <span
            className={`pill ${active.status} posd-stato`}
            title={`Stato della lavorazione: ${statoAlBanco(active.status, order.service_mode)}`}
          >
            {STATUS_EMOJI[active.status]} {statoAlBanco(active.status, order.service_mode)}
          </span>
        )}
        {/* ZOOM sul telefono: qui, in fondo alla testata. Flottante
            nell'angolo finiva sopra i tasti del conto e si premeva lui.
            RESTA L'ULTIMO anche adesso che la pastiglia del lavoro gli sta
            davanti: è un COMANDO, e i comandi della barra stanno agli
            estremi (l'uscita a sinistra, lo zoom a destra) dove il pollice
            li trova senza guardare; quello che si legge sta in mezzo. */}
        {telefono && <ZoomControl inline />}
      </div>

      {/* PERCHÉ QUESTO CONTO È IN CORSO. Un conto riaperto, guardato mezz'ora
          dopo, è indistinguibile da uno normale — e se dentro c'è un incasso
          diventa un mistero. Il motivo sta qui, dove lo si legge senza
          cercarlo; il resto della storia è nei ⋯. */}
      {!isNew && (() => {
        const r = ultimaRiapertura(order)
        if (!r) return null
        return (
          <div className="riaperto-nota" style={{ margin: '8px 8px 0', flexShrink: 0 }}>
            ♻️ <strong>Conto riaperto</strong> il {quando(r.at)}
            {r.chi ? ` da ${r.chi}` : ''}
            {r.motivo ? <> — « {r.motivo} »</> : ''}
          </div>
        )
      })()}

      {error && <div className="banner" style={{ margin: '8px 8px 0', flexShrink: 0 }}>{error}</div>}

      {/* ── Corpo a 3 colonne: categorie · griglia · ordine ── */}
      <div
        className="posd-body"
        style={{
          '--pos-cats-w': `${catsRz.width}px`,
          '--pos-comanda-w': `${comandaRz.width}px`,
          '--cats-scale': catsScale,
          '--comanda-scale': comandaScale,
        }}
      >
        <PosProductPicker
          drinks={drinks}
          cats={cats}
          loading={loading}
          qtyByDrink={qtyByDrink}
          onInfo={settings.pos_ricetta_info === false ? undefined : setSchedaDrink}
          categoryDisplay={settings.category_display}
          ricercaEvidenzia={settings.pos_search === 'evidenzia'}
          modoStriscia={settings.stripe_pos}
          scorteVerdi={!!settings.stripe_ok_verde}
          catsHandleProps={catsRz.handleProps}
          recentIds={recentIds}
          onAdd={(d) => {
            collapsePanel()
            plusFromCatalog(d)
          }}
          onSetQty={(d, q) => {
            collapsePanel()
            const cur = qtyByDrink[d.id] ?? 0
            if (q > cur) plusFromCatalog(d)
            else if (q < cur) minusFromCatalog(d.id)
          }}
          onInteract={collapsePanel}
          disabled={closed}
        />

        {/* Maniglia fra griglia e pannello ordine */}
        <div className="posd-resize-handle" {...comandaRz.handleProps} />

        {/* ── Pannello destro: L'ORDINE (lista unica). Su smartphone si
            comprime in una barra (totale + n. item) mentre si lavora sulla
            griglia; un tocco la riapre. ── */}
        <div
          className={`posd-comanda${panelCollapsed ? ' collapsed' : ''}`}
          style={{ '--pos-comanda-h': `${altezzaRz.width}dvh` }}
        >
          {/* Maniglia per l'altezza (telefono): tieni premuto e trascina.
              Col dito serve una presa voluta, altrimenti sfiorandola mentre
              si scorre il pannello cambiava altezza da solo. */}
          {telefono && !panelCollapsed && (
            <div
              className={`posd-altezza-handle${altezzaRz.attivo ? ' attiva' : ''}`}
              title="Tieni premuto e trascina per cambiare l'altezza"
              {...altezzaRz.handleProps}
            />
          )}
          {panelCollapsed && (
            <button
              type="button"
              className="posd-collapsed-bar"
              onClick={expandPanel}
            >
              <span style={{ minWidth: 0 }}>
                <span className="muted">
                  🧾 {confirmedLines.reduce((s, l) => s + l.qty, 0) + draftCount} item — tocca per aprire
                </span>
                <span className="posd-collapsed-tot" style={{ display: 'block' }}>
                  {formatPrice(confirmedTotal + draftTotal + extras)}
                </span>
              </span>
              <span className="muted" style={{ marginLeft: 'auto', fontSize: '1.4rem' }}>▲</span>
            </button>
          )}
          {/* Com'è messa la testata sta in `.posd-testa`, non su uno `style`
              inline: da inline `flex-shrink: 0` vinceva sempre, e con poca
              altezza (finestra bassa, zoom alto) restava una fascia rigida
              che spingeva i tasti del piede fuori dallo schermo (BUG-077). */}
          <div className="posd-testa">
            {/* Il nome del conto si prende tutta la riga: schiacciato fra i
                tasti restava un filo di spazio e spariva nei puntini. */}
            <div className="row between" style={{ alignItems: 'center', gap: 8 }}>
              <strong className="posd-title" style={{ display: 'block', flex: 1, minWidth: 0 }}>
                {panelTitle}
              </strong>
              {/* A CHE PUNTO STA IL LAVORO NON SI LEGGE PIÙ QUI: sta nella
                  barra in alto, in fondo a destra (il `posd-stato` della
                  testata di pagina). Qui restano il nome del conto e i
                  tasti che agiscono sulle righe — la riga è loro. */}
              {/* LA STORIA E LO SVUOTA STANNO NEL ⋯. Erano due icone qui in
                  alto, in mezzo a quelle che si usano davvero: la storia si
                  guarda una volta a serata, e svuotare un conto è la cosa
                  più irreversibile della schermata — non deve stare a un
                  dito dai tasti che si premono di corsa. */}
              {/* ORGANIZZA: come nella griglia dei prodotti, un interruttore
                  che fa comparire le maniglie. Fuori di lì toccare una riga
                  la apre — è quello che si fa mille volte a sera — e niente
                  si sposta per sbaglio. */}
              {righeDaSvuotare > 0 && !closed && (
                <button
                  className={`btn ghost small${organizzaLista ? ' active' : ''}`}
                  onClick={() => setOrganizzaLista((v) => !v)}
                  aria-label={organizzaLista ? 'Fine riordino' : 'Organizza le righe'}
                  title={
                    organizzaLista
                      ? 'Fine: le righe tornano a aprirsi al tocco'
                      : 'Organizza: compaiono le maniglie per spostare le righe'
                  }
                >
                  {organizzaLista ? '✓' : '↕'}
                </button>
              )}
              {/* Il ⋯ c'è a TUTTE le taglie: era solo da telefono, ma le
                  azioni che non meritano un tasto sempre visibile (i
                  calcoli delle righe, la storia) servono anche su tablet
                  e desktop. */}
              {/* RIDUCI I TASTI. «Unisci», «Dati conto» e «Prodotto libero»
                  sono tre righe di schermo prese alla lista: a chi batte
                  conti complicati servono a portata di dito, a chi fa solo
                  drink no. Ridotti non spariscono — sono tutti nel ⋯ qui
                  accanto — e «Comande» resta comunque a vista. */}
              <button
                className={`btn ghost small${azioniRidotte ? ' active' : ''}`}
                onClick={() =>
                  setAzioniRidotte((v) => {
                    ricordaAzioniContoRidotte(!v)
                    return !v
                  })
                }
                aria-expanded={!azioniRidotte}
                aria-label={azioniRidotte ? 'Mostra i tasti del conto' : 'Nascondi i tasti del conto'}
                title={
                  azioniRidotte
                    ? 'Mostra Unisci, Dati conto e Prodotto libero'
                    : 'Nascondi Unisci, Dati conto e Prodotto libero: restano nel ⋯'
                }
              >
                {azioniRidotte ? '▾' : '▴'}
              </button>
              <button
                className="btn ghost small"
                onClick={() => setShowAzioni(true)}
                aria-label="Azioni del conto"
                title="Azioni del conto"
              >
                ⋯
              </button>
            </div>
            <div className="posd-azioni">
              {/* I tasti ci sono SEMPRE, spenti quando non servono. Comparire e
                  sparire sposta tutto quello che sta sotto proprio mentre ci si
                  sta per premere sopra — e il tasto che cercavi non è più lì. */}
                {/* UN TASTO SOLO per Unisci/Separa: dei due, alla volta ne
                    serve uno — il tasto mostra l'azione possibile e cambia
                    faccia da sé (se c'è da unire, unisce; altrimenti
                    separa). Quando servono entrambe vince Unisci, e Separa
                    resta comunque raggiungibile dal ⋯. */}
                {!azioniRidotte && (
                  <button
                    className="btn ghost small"
                    onClick={canMerge ? mergeDraft : splitAllDraft}
                    disabled={!canMerge && !canSplit}
                    title={
                      canMerge
                        ? 'Unisci le righe uguali'
                        : canSplit
                          ? 'Separa le quantità'
                          : 'Niente da unire o separare'
                    }
                  >
                    {canMerge ? '🔗 Unisci' : '⑃ Separa'}
                  </button>
                )}
                {/* NASCONDI I PAGATI sta qui, in riga con gli altri: da
                    sopra la lista si portava via una riga di schermo tutta
                    per sé e sembrava un titolo delle righe, non un tasto.
                    Compare solo quando c'è qualcosa di pagato da nascondere. */}
                {paidCount > 0 && (
                  <button
                    className="btn ghost small"
                    onClick={() => setHidePaid((v) => !v)}
                    title={
                      hidePaid
                        ? 'Rimetti in lista le righe già incassate'
                        : 'Lascia in lista solo quello che resta da pagare'
                    }
                  >
                    {hidePaid ? `💳 Mostra pagati (${paidCount})` : `💳 Nascondi pagati (${paidCount})`}
                  </button>
                )}
                <button
                  className="btn secondary small"
                  onClick={() => setShowComande(true)}
                  disabled={isNew}
                  title={isNew ? 'Il conto non è ancora stato aperto' : 'Storico comande'}
                >
                  <IconReceipt /> Comande ({isNew ? 0 : comande.length})
                </button>
                {/* «RIMETTI IN CORSO» STA NELLA BARRA IN FONDO, dove su un
                    conto chiuso ha già preso il posto di «Pagamento»: era
                    lo stesso tasto due volte nella stessa schermata, a un
                    dito di distanza, e due tasti uguali fanno pensare che
                    facciano due cose diverse. */}
            </div>
            {!isNew && order.table_label && (
              <div className="muted small">🍽 Tavolo {order.table_label}</div>
            )}
            {/* Conto di gruppo. In CREAZIONE si sceglie qui (se i gruppi
                sono attivi): si deve poter associare l'ordine anche senza
                essere arrivati dal gruppo. In MODIFICA si mostra e basta. */}
            {!isNew && order.group_name_snapshot && (
              <div className="muted small" style={{ marginTop: 2 }}>
                <span className="pill small">👥 {order.group_name_snapshot}</span>
              </div>
            )}
            {groupsOn && (
              <div className="row between posd-gruppo-row" style={{ alignItems: 'center', marginTop: 2 }}>
                {group && !groupIsContainer ? (
                  <span className="pill small">👥 {group.name}</span>
                ) : (
                  <span className="muted small">Nessun gruppo</span>
                )}
                <span className="row" style={{ gap: 6 }}>
                  {/* Solo l'icona: il nome del gruppo, quando c'è, sta già a
                      sinistra, e la scritta mangiava mezza riga. */}
                  <button
                    className="btn ghost small"
                    onClick={() => setPickGroup(true)}
                    aria-label={group ? 'Cambia gruppo' : 'Associa a gruppo'}
                    title={group ? 'Cambia gruppo' : 'Associa a gruppo'}
                  >
                    👥
                  </button>
                  {/* La ✕ toglie il conto dal gruppo: senza un gruppo non
                      vuol dire niente, quindi non c'è. */}
                  {group && (
                    <button
                      className="btn ghost small"
                      onClick={() => scegliGruppo('')}
                      aria-label="Togli dal gruppo"
                      title="Togli dal gruppo"
                    >
                      ✕
                    </button>
                  )}
                </span>
              </div>
            )}
            {groupIsContainer && (
              <div className="banner" style={{ margin: '4px 0' }}>
                👥 “{group.name}” contiene altri gruppi: non può avere ordini
                diretti. Scegli uno dei suoi sottogruppi.
              </div>
            )}

            {/* Azioni FISSE in testata, una sotto l'altra: prima Dati conto,
                poi Prodotto libero. Con la lista lunga scorrevano via insieme
                al nome del conto. Chi ha ridotto i tasti (il ▴ qui sopra) non
                le vede: le trova nel ⋯, dove ci sono sempre state. */}
            {!azioniRidotte && (
              <div className="posd-azioni-fisse">
                <button className="btn ghost small block" onClick={() => setShowInfo(true)}>
                  👤 Dati conto
                </button>
                <button
                  className="btn ghost small block"
                  disabled={closed}
                  onClick={() => setShowCustom(true)}
                >
                  <IconTag /> Prodotto libero
                </button>
              </div>
            )}
          </div>

          <div ref={listRef} className="posd-list" style={{ flex: 1, overflowY: 'auto', padding: '6px 12px 10px' }}>
            {orderedLines.length === 0 && (
              <p className="muted small" style={{ margin: '6px 0 0' }}>
                Tocca i prodotti per aggiungerli all'ordine.
              </p>
            )}


            <DndContext
              sensors={sensoriLista}
              collisionDetection={closestCenter}
              onDragEnd={({ active, over }) => {
                if (!over || active.id === over.id) return
                setLayout((lay) => {
                  const da = lay.indexOf(active.id)
                  const a = lay.indexOf(over.id)
                  return da < 0 || a < 0 ? lay : moveLine(lay, da, a)
                })
                syncDraftOrder()
              }}
            >
            <SortableContext
              items={orderedLines.filter((l) => !l.paid).map((l) => l.key)}
              strategy={verticalListSortingStrategy}
            >
            {orderedLines.map((l, idx) => {
              const isDraft = l.source === 'draft'
              const isPaid = !!l.paid
              const canMinus = !closed && !isPaid && (isDraft || l.removable)
              // A CHE PUNTO È QUESTA RIGA. Gli stati del servizio stanno sulle
              // COMANDE, non sul conto: con una comanda sola tutti i drink
              // sono nello stesso passo e non c'è niente da intestare — un
              // titolo per dire una cosa sola è rumore. Appena il banco
              // divide una comanda per prepararne una parte, invece, aprendo
              // il conto si deve vedere cosa è al banco e cosa è già uscito:
              // le righe si raggruppano come già si fa con quelle pagate.
              // E le due cose convivono: un conto si incassa in qualunque
              // passo del servizio — dalla cassa è chiuso, dal banco magari
              // no — e i due titoli lo dicono insieme senza contraddirsi.
              const gruppo = gruppiMostrati.includes(gruppoDiRiga(l)) ? gruppoDiRiga(l) : null
              const primaDi = orderedLines[idx - 1]
              const gruppoPrima = gruppiMostrati.includes(gruppoDiRiga(primaDi))
                ? gruppoDiRiga(primaDi)
                : null
              const titolo =
                gruppiVisibili && gruppo && gruppo !== gruppoPrima ? titoloGruppo(gruppo) : null
              return (
                // Il titolo del gruppo sta FUORI dal riquadro trascinabile:
                // dentro finiva sulla stessa linea della prima riga, perché
                // quel riquadro è una fila.
                <Fragment key={l.key}>
                  {titolo && (
                    <div className="posd-gruppo muted small">{titolo}</div>
                  )}
                  <RigaOrdinabile id={l.key} attiva={organizzaLista} bloccata={isPaid || closed}>
                  <div
                    className={`row between draft-line${l.annullata ? ' riga-annullata' : ''}`}
                    data-line-key={l.key}
                    // Toccare la riga la apre: il trascinamento sta nella
                    // maniglia, e solo in «organizza».
                    onClick={() => {
                      if (closed || isPaid || organizzaLista) return
                      if (isDraft || l.removable) setEditLine(l)
                    }}
                    style={{
                      alignItems: 'center',
                      marginTop: 2,
                      cursor: closed || isPaid || organizzaLista ? 'default' : 'pointer',
                      borderRadius: 8,
                      opacity: isPaid ? 0.6 : 1,
                    }}
                  >
                    {/* L'item è CLICCABILE per modificarlo (niente tasto matita):
                        il tap è gestito in endDrag (pointerup) perché il
                        pointer-capture del drag intercetta il click sul figlio. */}
                    <span
                      className="grow"
                      style={{ fontSize: '1.08em', display: 'flex', alignItems: 'center', minWidth: 0, cursor: !closed && (isDraft || l.removable) ? 'pointer' : 'inherit' }}
                      title={!closed && (isDraft || l.removable) ? `Modifica ${l.name}` : undefined}
                    >
                      <span style={{ minWidth: 0, overflow: 'hidden' }}>
                        <span style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                            {l.custom ? '✨ ' : ''}{l.name}
                          </span>
                        </span>
                        {/* IL CALCOLO A RICHIESTA (⋯ → «Mostra i calcoli»).
                            Stava in riga accanto a ogni nome ed era rumore:
                            il numero che conta è il subtotale, a destra.
                            Chi vuole vedere da dove viene lo accende, e
                            compare qui sotto come le note — se una riga ha
                            nota e calcolo, sono due righe distinte. */}
                        {mostraCalcoli && l.qty > 1 && (
                          <span
                            className="muted"
                            style={{ display: 'block', fontSize: '0.78em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            ↳ {l.qty} × {formatPrice(l.unit_price)}
                          </span>
                        )}
                        {/* Nota della riga (es. "poco ghiaccio", o di chi è) */}
                        {l.note && (
                          <span
                            className="muted"
                            style={{ display: 'block', fontSize: '0.78em', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            ↳ {l.note}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="row" style={{ gap: 4, alignItems: 'center' }}>
                      {/* Il SUBTOTALE c'è sempre, anche con un pezzo solo:
                          senza, le righe singole restavano senza prezzo
                          quando il calcolo è spento. */}
                      <strong
                        className="posd-riga-tot"
                        title={`${l.qty} × ${formatPrice(l.unit_price)}`}
                      >
                        {formatPrice(l.qty * l.unit_price)}
                      </strong>
                      {/* I +/− NON APRONO LA RIGA. Toccare la riga apre la
                          scheda dell'item, e il clic sui tasti risaliva fin
                          lì: si aumentava di uno e si finiva dentro la
                          modifica, ogni volta. */}
                      <span
                        className="qty"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Etichette col nome: nella lista ci sono molte righe,
                            e i +/- della griglia hanno un altro significato. */}
                        <button aria-label={`Riduci ${l.name}`} onClick={() => minusRow(l)} disabled={!canMinus}>−</button>
                        <strong>{l.qty}</strong>
                        <button aria-label={`Aumenta ${l.name}`} onClick={() => plusRow(l)} disabled={closed || isPaid}>+</button>
                      </span>
                    </span>
                  </div>
                  </RigaOrdinabile>
                </Fragment>
              )
            })}
            </SortableContext>
            </DndContext>

          </div>

          {/* Footer: avanzamento comanda + totale + CONFERMA vicino a PAGAMENTO.
              Ridimensionabile dalla maniglia in cima: font e tasti scalano. */}
          <div className="posd-comanda-foot" style={{ '--foot-scale': footRz.width / 100 }}>
            <div className="posd-foot-handle" title="Trascina per ingrandire/rimpicciolire" {...footRz.handleProps} />
            {/* QUELLO CHE SI LEGGE, separato da quello che si preme. Sono
                numeri: quando l'altezza manca cedono loro e scorrono, mentre
                i tasti qui sotto restano dove sono (BUG-077). */}
            <div className="posd-foot-info">
            {/* IL BOLLO DELLO STATO SE N'È ANDATO IN TESTATA (vedi sopra);
                qui resta il tasto, che è un'altra cosa: chiudere un conto
                già pagato senza far avanzare gli stati uno per uno. Sta
                accanto ai soldi perché è lì che si guarda quando si finisce
                un conto, e l'avanzamento vero resta nel popup Servizio. */}
            {!isNew && workflowOn && active && !closed && order.payment_status === 'pagato' && (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button
                  className="btn small"
                  onClick={() =>
                    closePaidOrder(order.id).catch((e) => toastError(`Chiusura non riuscita: ${e.message}`))
                  }
                >
                  <IconCheck /> Chiudi conto
                </button>
              </div>
            )}

            {/* I SUPPLEMENTI IN CHIARO. Prima una riga cumulativa diceva
                «Coperto/servizio/mancia · 5,50 €» e non si capiva né cosa
                fosse attivo né quanto pesasse ognuno. Ora: Subtotale (il
                conto nudo) in evidenza, sotto le voci attive una per riga,
                in piccolo e strette; in fondo il Totale che somma tutto.
                Sul telefono il dettaglio parte chiuso: si apre dal
                Subtotale. */}
            {extras > 0 && (
              <>
                <div
                  className="row between"
                  onClick={() => setMostraSupplementi((v) => !v)}
                  style={{ cursor: 'pointer', margin: 0, lineHeight: 1.35 }}
                  title="Il conto senza supplementi — tocca per il dettaglio"
                >
                  <strong style={{ fontSize: '0.95em' }}>
                    Subtotale{' '}
                    <span className="muted" style={{ fontWeight: 400, fontSize: '0.8em' }}>
                      {mostraSupplementi ? '▾' : '▸'}
                    </span>
                  </strong>
                  <strong style={{ fontSize: '0.95em' }}>{formatPrice(confirmedTotal + draftTotal)}</strong>
                </div>
                {mostraSupplementi &&
                  [
                    ['Coperto', Number(order?.coperto_amount || 0)],
                    ['Servizio', Number(order?.service_charge_amount || 0)],
                    ['Mancia', Number(order?.tip_amount || 0)],
                  ]
                    .filter(([, v]) => v > 0)
                    .map(([label, v]) => (
                      <div
                        className="row between muted small"
                        key={label}
                        style={{ margin: 0, lineHeight: 1.3 }}
                      >
                        <span>{label}</span>
                        <span>{formatPrice(v)}</span>
                      </div>
                    ))}
              </>
            )}
            <div className="row between" style={extras > 0 ? { marginTop: 2 } : undefined}>
              <strong>Totale</strong>
              <strong className="price">{formatPrice(confirmedTotal + draftTotal + extras)}</strong>
            </div>
            {/* CHE COSA È STATO PAGATO. C'era una riga sola — «Sconto e acconti
                già incassati −15,00 €» — e quindici euro di che non lo diceva
                nessuno: uno sconto, un acconto, con che metodo, per quali
                righe. Davanti al cliente che chiede, quella riga non
                rispondeva a niente. */}
            {!isNew &&
              (() => {
                const d = dettaglioIncassi(order)
                if (d.sconto <= 0 && d.incassi.length === 0) return null
                return (
                  <div className="posd-incassi">
                    {/* GLI SCONTI SONO PIÙ D'UNO: ognuno se l'è portato via
                        la riscossione a cui apparteneva. Sommarli in una riga
                        sola sarebbe di nuovo la cifra che non spiega niente. */}
                    {d.sconti.map((sc, idx) => (
                      <div className="row between muted small" key={`sc-${idx}`}>
                        <span>{sc.etichetta}</span>
                        <span>−{formatPrice(sc.importo)}</span>
                      </div>
                    ))}
                    {d.incassi.map((i, idx) => (
                      <div key={idx} className="posd-incasso">
                        <div className="row between muted small">
                          <span>
                            {/* UN IMPORTO BATTUTO A MANO NON COPRE NESSUNA
                                RIGA: sono soldi lasciati sul conto, e dire il
                                contrario sarebbe inventarselo. Le righe le
                                copre solo chi le sceglie nella schermata di
                                pagamento. */}
                            {i.cosa ? 'Pagate' : 'Acconto'}
                            {i.metodo ? ` · ${paymentMethodLabel(i.metodo)}` : ''}
                            {i.quando ? ` · ${apertoIl(i.quando)}` : ''}
                          </span>
                          <span>−{formatPrice(i.importo)}</span>
                        </div>
                        {i.cosa && (
                          <div className="muted small posd-incasso-cosa">{i.cosa.join(' · ')}</div>
                        )}
                        {i.sconto && (
                          <div className="muted small posd-incasso-cosa">
                            🎁 {i.sconto.etichetta} −{formatPrice(i.sconto.importo)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })()}

            {/* Niente tasto Conferma: gli item si confermano da soli (si torna
                con "← Ordini"). I tasti azione sono SEMPRE presenti: quelli non
                applicabili sono disabilitati, non spariscono. */}
            {/* DOVE VANNO LE RIGHE NUOVE - solo col servizio spento, dove
                l'app non ha modo di saperlo (vedi `sceltaAggiunte`). Due
                tasti e una domanda in parole normali: finche' non si
                risponde, le righe restano dove sono e si vedono. */}
            {sceltaAggiunte && (
              <div className="posd-scelta-aggiunte">
                <span className="muted small">Le righe nuove dove vanno?</span>
                <div className="grid-2" style={{ marginTop: 6 }}>
                  <button className="btn small" onClick={() => flushAdditions('comanda')}>
                    &#10133; Nella comanda
                  </button>
                  <button className="btn ghost small" onClick={() => flushAdditions('nuova')}>
                    <IconPrinter /> Comanda nuova
                  </button>
                </div>
              </div>
            )}
            </div>

            <div className="posd-foot-azioni">
            {/* LA RIGA CHE NON CEDE MAI. «Invia comanda» e «Pagamento» sono i
                due gesti della serata: restano dove sono, alla stessa
                altezza, qualunque sia la finestra e qualunque lo zoom. */}
            <div className="grid-2">
              <button className="btn ghost small" disabled={!conRighe} onClick={inviaComanda}>
                <IconPrinter /> Invia comanda
              </button>
              {daRiaprire ? (
                <button
                  className="btn small posd-riapri"
                  onClick={() => setShowRipristino(true)}
                  title="Il conto torna fra quelli aperti"
                >
                  ♻️ Riapri conto
                </button>
              ) : (
                <button
                  className="btn small"
                  disabled={isNew ? !conRighe : !canPay}
                  onClick={isNew ? handlePayNow : apriIlPagamento}
                >
                  <IconCard /> Pagamento{daIncassare > 0 ? ` · ${formatPrice(daIncassare)}` : ''}
                </button>
              )}
            </div>

            {/* I DUE SECONDARI. Servono, ma non cento volte a sera: se
                l'altezza non basta per tutti sono loro a scorrere — mai a
                sparire, che è quello che facevano prima (BUG-077). */}
            <div className="posd-foot-secondarie">
            {workflowOn && (
              <button
                className="btn ghost small block"
                disabled={isNew || closed}
                onClick={() => setShowComande(true)}
              >
                <IconRefresh /> Stato servizio
              </button>
            )}

            <button
              className="btn ghost small block"
              disabled={annullaSpento}
              onClick={annullaOrdine}
            >
              <IconX /> Annulla ordine
            </button>
            </div>
            </div>

            {/* TELEFONO: un tasto solo, tutto il resto nel menu dal basso.
                In pagina restano il totale e le righe del conto. */}
            {/* TELEFONO: i tre gesti della serata su una riga sola —
                si manda al banco, si incassa, si annulla. Tutto il resto
                sta dietro i ⋯ in alto, dove non intralcia. */}
            {telefono && (
              <div className="posd-foot-telefono">
                <button
                  className="btn ghost"
                  disabled={!conRighe}
                  onClick={inviaComanda}
                  aria-label="Invia"
                  title="Invia la comanda al banco"
                >
                  <IconPrinter />
                  {!soloIcone && ' Invia'}
                </button>
                {daRiaprire ? (
                  <button
                    className="btn"
                    onClick={() => setShowRipristino(true)}
                    aria-label="Riapri conto"
                    title="Il conto torna fra quelli aperti"
                  >
                    ♻️{!soloIcone && ' Riapri conto'}
                  </button>
                ) : (
                  <button
                    className="btn"
                    disabled={isNew ? !conRighe : !canPay}
                    onClick={isNew ? handlePayNow : apriIlPagamento}
                    aria-label="Paga"
                    title="Incassa il conto"
                  >
                    <IconCard />
                    {!soloIcone && ' Paga'}
                  </button>
                )}
                <button
                  className="btn ghost"
                  disabled={annullaSpento}
                  onClick={annullaOrdine}
                  aria-label="Annulla"
                  title="Annulla l'ordine"
                >
                  <IconX />
                  {!soloIcone && ' Annulla'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MENU AZIONI (solo telefono) ──────────────────────────────
          Le stesse azioni dei tasti, con gli stessi handler: qui non c'è
          una seconda logica da tenere allineata, solo un altro posto da
          cui chiamarla. */}
      <ActionSheet
        open={showAzioni}
        onClose={() => setShowAzioni(false)}
        titolo={panelTitle}
        voci={[
          {
            id: 'comande',
            icon: <IconReceipt />,
            label: `Comande (${isNew ? 0 : comande.length})`,
            hint: workflowOn ? 'Stato del servizio e ristampe' : 'Storico delle comande',
            disabled: isNew,
            onClick: () => setShowComande(true),
          },
          {
            id: 'libero',
            icon: <IconTag />,
            label: 'Prodotto libero',
            hint: 'Una voce che non è a menù',
            disabled: closed,
            onClick: () => setShowCustom(true),
          },
          {
            id: 'dati',
            icon: '👤',
            label: 'Dati conto',
            hint: 'Nome, tavolo, note',
            onClick: () => setShowInfo(true),
          },
          // LA SCHERMATA DA GIRARE AL CLIENTE. Il QR con cui segue l'ordine
          // dal suo telefono stava sulla pagina di stato, che chi lavora non
          // apre più: senza questa voce non ci si arriverebbe da nessuna
          // parte. Senza gli stati del servizio non c'è niente da seguire,
          // e allora non compare.
          workflowOn && {
            id: 'cliente',
            icon: '📲',
            label: 'Mostra al cliente',
            hint: "Il QR per seguire l'ordine dal suo telefono",
            disabled: isNew,
            onClick: () => navigate(`/ordine/${order.id}?cliente=1`),
          },
          {
            id: 'storia',
            icon: '🕘',
            label: 'Storia del conto',
            hint: 'Aperto, chiuso, annullato, riaperto',
            disabled: isNew,
            onClick: () => setShowStoria(true),
          },
          // UNA VOCE SOLA, come il tasto in barra: delle due, alla volta ne
          // serve una — o le righe uguali stanno insieme (e allora si
          // separano) o sono separate (e allora si uniscono). Erano due voci
          // e una delle due era sempre spenta: due righe di menu per dirne
          // una. Quando servono entrambe vince «unisci», la rimessa in
          // ordine. (Qui siamo in un array: i commenti sono `//`, non JSX.)
          ((canMerge || canSplit) && {
            id: 'unisci-separa',
            icon: canMerge ? '🔗' : '⑃',
            label: canMerge ? 'Unisci le righe uguali' : 'Separa le quantità',
            hint: canMerge
              ? 'Le stesse voci tornano una riga sola'
              : 'Ogni pezzo diventa una riga a sé',
            onClick: canMerge ? mergeDraft : splitAllDraft,
          }),
          {
            id: 'svuota',
            icon: '🧹',
            label: 'Svuota il conto',
            hint: 'Toglie tutte le righe: chiede conferma',
            disabled: !(righeDaSvuotare > 0) || closed,
            onClick: () => setConfirmSvuota(true),
          },
          {
            id: 'calcoli',
            icon: '🧮',
            label: mostraCalcoli ? 'Nascondi i calcoli delle righe' : 'Mostra i calcoli delle righe',
            hint: 'Sotto ogni riga, «2 × 5,00 €», come le note',
            onClick: toggleCalcoli,
          },
          groupsOn && {
            id: 'gruppo',
            icon: <IconGruppo />,
            label: group ? `Gruppo: ${group.name}` : 'Associa a un gruppo',
            hint: group ? 'Cambia o togli' : null,
            onClick: () => setPickGroup(true),
          },
        ]}
      />

      {/* ── Modale comande (modifica): stati, avanzamento, stampa ── */}
      {showComande && (
        <div className="overlay confirm-overlay" onClick={() => setShowComande(false)}>
          <div
            className="confirm-box"
            style={{ maxHeight: '85vh', overflowY: 'auto', width: 'min(440px, 94vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between" style={{ alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}><IconReceipt /> Comande</h3>
              <button className="btn ghost small" onClick={() => setShowComande(false)}><IconClose /> Chiudi</button>
            </div>
            {/* PIÙ DI UNA COMANDA: due modi di ristamparle, e servono
                tutti e due. «Anche di stampare UNA SOLA comanda con tutti i
                prodotti di più comande ma sempre dello stesso ordine. Va
                bene stampare tutte le comande insieme su più ricevute ma
                serve anche stampare tutto su una sola ricevuta» (l'utente,
                20/08).
                Le etichette dicono cosa ESCE dalla stampante — quanti pezzi
                di carta — perché è quello che chi stampa deve sapere prima
                di toccare, non come si chiama la funzione dentro.
                Compaiono solo quando le comande sono davvero più d'una. */}
            {stampabili.length > 1 && (
              <div className="grid-2" style={{ marginTop: 10, gap: 6 }}>
                <button
                  className="btn ghost small"
                  onClick={() =>
                    printComande(order, stampabili)
                      .then((n) => toastSuccess(`${n} comande in stampa`))
                      .catch((e) => setError(`Stampa: ${e.message}`))
                  }
                >
                  <IconPrinter /> Una per comanda ({stampabili.length})
                </button>
                <button
                  className="btn ghost small"
                  onClick={() =>
                    printComandaUnita(order)
                      .then(() => toastSuccess('Comanda unita in stampa'))
                      .catch((e) => setError(`Stampa: ${e.message}`))
                  }
                >
                  <IconPrinter /> Tutto su una
                </button>
              </div>
            )}
            {effComande.map((c) => {
              const ns = nextComandaStatus(c.status)
              return (
                <div className="card" key={c.id} style={{ margin: '10px 0 0', padding: 12 }}>
                  <div className="row between" style={{ alignItems: 'center' }}>
                    <span className="muted small" style={{ whiteSpace: 'nowrap' }}>
                      COMANDA {c.seq}
                      {c.created_at ? ` · ${String(c.created_at).slice(11, 16)}` : ''}
                    </span>
                    {/* UNA COMANDA DIVISA NON È UNA COMANDA ANNULLATA. Nel
                        dato è annullata — serve a tenere la storia, e la
                        copia già stampata ha un riscontro — ma qui dentro
                        leggere «Annullato» farebbe pensare a un drink
                        saltato, mentre quei drink sono nelle due comande
                        sotto. */}
                    {/* IL PASSO DEL SERVIZIO SI MOSTRA SOLO SE ESISTE. In un
                        locale che non segue la preparazione le comande uno
                        stato ce l'hanno lo stesso — è il dato — ma dirlo a
                        schermo vuol dire parlare di una cosa che lì non si
                        fa. Resta «✂️ Divisa», che non è un passo del
                        servizio: è cosa ne è stato di quel ticket. */}
                    {(workflowOn || annullataPerDivisione(c)) && (
                      <span className={`pill ${c.status}`} style={{ fontSize: '0.7rem' }}>
                        {annullataPerDivisione(c) ? (
                          '✂️ Divisa'
                        ) : (
                          <>
                            {STATUS_EMOJI[c.status]}{' '}
                            {statoAlBanco(c.status, order.service_mode)}
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  {(c.items || []).map((i, idx) => (
                    <div className="row between" key={idx} style={{ marginTop: 4 }}>
                      <span className="muted small">
                        {i.qty}× {i.custom ? '✨ ' : ''}{i.name}
                      </span>
                      <span className="muted small">{formatPrice(i.qty * i.unit_price)}</span>
                    </div>
                  ))}
                  <div className="grid-2" style={{ marginTop: 8, gap: 6 }}>
                    <button
                      className="btn ghost small"
                      aria-label={`Stampa comanda ${c.seq}`}
                      onClick={() => printComanda(order, c).catch((e) => setError(`Stampa: ${e.message}`))}
                    >
                      <IconPrinter /> Stampa
                    </button>
                    {ns && workflowOn && !closed && puoSegnare(ruolo, ns) ? (
                      <button className="btn small" onClick={() => advance(c.id, ns)}>
                        Segna “{statoAlBanco(ns, order.service_mode)}”
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                  {/* ── PREPARAZIONE PARZIALE ─────────────────────
                      Tre gin tonic qui e due nella comanda del tavolo
                      accanto si preparano insieme, per farli uscire in una
                      volta. Non andrebbe fatto — un ticket si lavora
                      intero — ma si fa, e l'app non lo impedisce: si
                      scelgono le unità che si preparano ADESSO, quelle
                      partono in una comanda nuova e il resto resta «da
                      fare», così il conto non perde niente per strada.
                      Finché il drink non è uscito dal banco: a «da fare» e
                      a «in preparazione». Da «pronto» in poi è roba sul
                      vassoio. */}
                  {comandaIlLavoro && workflowOn && !closed && comandaDivisibile(c) && (
                    parziale === c.id ? (
                      <PreparazioneParziale
                        comanda={c}
                        onAnnulla={() => setParziale(null)}
                        onConferma={(scelte) => confermaParziale(c, scelte)}
                      />
                    ) : (
                      <button
                        className="btn ghost small block"
                        style={{ marginTop: 6 }}
                        onClick={() => setParziale(c.id)}
                      >
                        ✂️ Preparazione parziale
                      </button>
                    )
                  )}
                  {/* TORNARE INDIETRO, anche di più di un passo. Si segna
                      «pronto» la comanda sbagliata, o «servito» mentre il
                      vassoio è ancora al banco: senza questo restava solo
                      annullare il conto e ribatterlo. Gli stati già passati
                      sono lì, in fila: si sceglie quello giusto. */}
                  {comandaIlLavoro &&
                    workflowOn &&
                    !closed &&
                    statiPrimaComanda(c.status, statoIniziale).length > 0 && (
                      <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <span className="muted small">Torna a</span>
                        {statiPrimaComanda(c.status, statoIniziale).map((st) => (
                          <button
                            key={st}
                            className="chip"
                            onClick={() => advance(c.id, st)}
                            title={`Riporta la comanda ${c.seq} a «${statoAlBanco(st, order.service_mode)}»`}
                          >
                            ↩︎ {statoAlBanco(st, order.service_mode)}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              )
            })}
            {comande.length === 0 && <p className="muted small">Nessuna comanda.</p>}

            {/* QUI NON SI STAMPA PIU' LO SCONTRINO. C'era un tasto
                «Scontrino (non fiscale)» in fondo a questo pannello: «non
                serve» (l'utente, 21/08/2026). E non serviva davvero — lo
                scontrino appartiene al gesto della riscossione (REQ-STAMPA-001),
                e il conto che il cliente vuole vedere prima di pagare ha gia'
                il suo tasto, «Preconto», nella schermata dei pagamenti. Qui
                dentro ci sono le COMANDE: la stampa che ha senso e' quella
                del ticket al banco, ed e' il tasto «Stampa» di ogni comanda. */}
          </div>
        </div>
      )}

      {/* ── Popup Dati conto (nome/tavolo/note) ── */}
      {showInfo && (
        <div className="overlay confirm-overlay" onClick={chiudiInfo}>
          <div
            className="confirm-box"
            role="dialog"
            aria-label="Dati conto"
            style={{ width: 'min(400px, 94vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between" style={{ alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>👤 Dati conto</h3>
              <button className="btn ghost small" onClick={chiudiInfo}>✕</button>
            </div>
            <label htmlFor="pd-name" style={{ display: 'block', marginTop: 10 }}>Nome</label>
            <input
              id="pd-name"
              value={info.customer_name}
              disabled={closed}
              autoFocus
              onKeyDown={infoOnEnter}
              onChange={(e) => setInfo((v) => ({ ...v, customer_name: e.target.value }))}
              placeholder="Es. Marco, Tavolo 4…"
            />
            <div className="grid-2" style={{ marginTop: 8 }}>
              <div>
                <label htmlFor="pd-table">Tavolo</label>
                <input
                  id="pd-table"
                  value={info.table_label}
                  disabled={closed}
                  onKeyDown={infoOnEnter}
                  onChange={(e) => setInfo((v) => ({ ...v, table_label: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="pd-note">Note</label>
                {/* UNA NOTA È UNA FRASE, non una parola. In una casella da
                    una riga «tavolo fuori, portare due bicchieri in più e
                    il ghiaccio a parte» si scriveva alla cieca, vedendone
                    tre parole per volta. E qui l'Invio va a capo: a chiudere
                    ci sono i tasti sotto. */}
                <textarea
                  id="pd-note"
                  rows={3}
                  value={info.note}
                  disabled={closed}
                  placeholder="Es. tavolo fuori, ghiaccio a parte"
                  onChange={(e) => setInfo((v) => ({ ...v, note: e.target.value }))}
                />
              </div>
            </div>
            {/* Sta qui, coi dati del conto, perché è di quel conto — come
                il tavolo e il nome. Da qui non serve dire che vale per
                tutte le comande: si sta guardando il conto intero. */}
            <div style={{ marginTop: 12 }}>
              <ScegliConsegna
                order={order}
                modo={modoDelConto}
                inCreazione={isNew}
                senzaSupplementi={!settings.coperto_enabled && !settings.service_charge_enabled}
                onCambia={cambiaModoConsegna}
              />
            </div>
            {!closed && (
              <button
                className="btn block"
                style={{ marginTop: 12 }}
                onClick={chiudiInfo}
              >
                {isNew ? 'OK' : '💾 Salva dati conto'}
              </button>
            )}
          </div>
        </div>
      )}

      {showCustom && (
        <CustomDrinkForm
          onCancel={() => setShowCustom(false)}
          onAdd={({ name, price, recipe_items, note }) => {
            const custom = {
              drink_id: `custom-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
              custom: true,
              name,
              unit_price: price,
              qty: 1,
              sumup_product_id: null,
              recipe_items,
              ...(note ? { note } : {}),
            }
            setShowCustom(false)
            // MODIFICA: dritto nella comanda (niente flicker); CREAZIONE: bozza.
            if (!isNew) {
              addToEditableComanda(custom)
            } else {
              const nuova = { line_id: makeLineId(), ...custom }
              setDraft((items) => [...items, nuova])
              scrollToLine(`d:${nuova.line_id}`)
            }
          }}
        />
      )}

      {/* ── Modifica per-item di una riga di bozza ── */}
      {editLine && (
        <CustomDrinkForm
          initial={editInitial}
          warnNoRecipe={editInitial?.recipe_items.length === 0}
          onCancel={() => setEditLine(null)}
          onAdd={applyEdit}
        />
      )}

      {/* ── Modale nome del conto all'uscita di un ordine appena creato ── */}
      {askName && (
        // MODALE: cliccare fuori non chiude niente. Con un tocco a vuoto che
        // chiude, un dito appoggiato di striscio sullo schermo fa sparire la
        // domanda e non si sa più se il nome è stato messo. Si esce dalla ✕ o
        // salvando — e in entrambi i casi si prosegue verso la lista ordini,
        // che è dove si stava andando.
        <div className="overlay confirm-overlay">
          <form
            className="confirm-box"
            role="dialog"
            aria-label="Nome del conto"
            style={{ width: 'min(360px, 94vw)' }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              submitNew(info.customer_name)
            }}
          >
            <div className="row between" style={{ alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>👤 Nome del conto</h3>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => submitNew('')}
                aria-label="Chiudi senza dare un nome"
                title="Chiudi senza dare un nome"
              >
                ✕
              </button>
            </div>
            <p className="muted small" style={{ margin: '8px 0' }}>
              Vuoto = numero progressivo. Si può cambiare dopo, dai Dati conto.
            </p>
            <label htmlFor="pos-askname">Nome</label>
            <input
              id="pos-askname"
              value={info.customer_name}
              onChange={(e) => setInfo((v) => ({ ...v, customer_name: e.target.value }))}
              placeholder="Es. Marco, Tavolo 4…"
              autoFocus
            />
            <button className="btn block" type="submit" style={{ marginTop: 10 }}>
              Salva{info.customer_name.trim() ? '' : ' senza nome'}
            </button>
          </form>
        </div>
      )}

      {/* ── Schermata Pagamento ──
          UNA SOLA, e NON appesa a `isNew`: quello che comanda è "c'è un
          pagamento in corso", che il conto sia nato un istante prima o
          mezz'ora prima. E il conto che riceve è SEMPRE `ordineDaPagare`,
          la ricomposizione locale: prima, in creazione, riceveva il guscio
          con le righe congelate al tocco — e appena il server rispondeva,
          il SUO conto: le righe battute nel frattempo sparivano dal
          pagamento fino alla sincronizzazione, o per sempre (BUG-017). */}
      {showPayment && ordineDaPagare && (
        <PaymentScreen
          order={ordineDaPagare}
          settings={settings}
          onClose={() => {
            setPayOrder(null)
            setShowPayment(false)
          }}
          onPaid={() => {
            // Niente pulizie della bozza qui: se qualche riga non è ancora
            // partita, all'uscita ci pensa `uscitaRef` a mandarla. Buttarla
            // adesso perdeva quello che si era battuto mentre l'incasso era
            // in corso.
            // In creazione l'id arriva da una PROMESSA: va attesa, se no si
            // "nasconde" un oggetto Promise e il conto pagato resta a
            // schermo nella coda finché il server non lo conferma.
            Promise.resolve(order?.id || payIdRef.current)
              .then((id) => id && nascondiOrdine(id))
              .catch(() => {})
            navigate('/bar')
          }}
          onBeforePay={async () => {
            // Prima dell'incasso parte TUTTO quello che è a schermo: la
            // bozza (che diventa comanda) e le modifiche in sospeso.
            flushAdditionsRef.current?.()
            await flushAll()
          }}
          onError={setError}
          resolveOrderId={order?.id ? undefined : () => payIdRef.current}
        />
      )}

      {showStoria && !isNew && (
        <StoriaOrdineDialog order={order} onClose={() => setShowStoria(false)} />
      )}

      {showRipristino && !isNew && (
        <RipristinaOrdineDialog
          order={order}
          onClose={() => setShowRipristino(false)}
          onConferma={(motivo) => {
            setShowRipristino(false)
            mostraOrdine(order.id)
            // Riaperto: alla prossima chiusura lo scontrino deve uscire di
            // nuovo, e la prenotazione di stampa va restituita (BUG-047).
            releaseReceiptPrint(order.id)
            restoreOrder(order.id, { motivo, chi: chiSonoIo() }).catch((e) =>
              setError(`Conto non ripristinato: ${e.message}`)
            )
          }}
        />
      )}

      {/* ── Scelta del gruppo a cui addebitare l'ordine ── */}
      {pickGroup && (
        <div className="overlay confirm-overlay" onClick={() => setPickGroup(false)}>
          <div
            className="confirm-box"
            role="dialog"
            aria-label="Scegli il gruppo"
            style={{ width: 'min(420px, 94vw)', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between" style={{ alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>👥 Conto di gruppo</h3>
              <button className="btn ghost small" onClick={() => setPickGroup(false)}>✕</button>
            </div>
            <p className="muted small" style={{ margin: '8px 0' }}>
              L’ordine entra nel conto del gruppo e si potrà pagare insieme
              agli altri.
            </p>
            <button
              className={`btn ${groupId ? 'ghost' : ''} block`}
              onClick={() => {
                scegliGruppo('')
                setPickGroup(false)
              }}
            >
              Nessun gruppo
            </button>
            {groupChoices.map((g) => (
              <button
                key={g.id}
                className={`btn ${groupId === g.id ? '' : 'secondary'} block`}
                style={{ marginTop: 6 }}
                onClick={() => {
                  scegliGruppo(g.id)
                  setPickGroup(false)
                }}
              >
                {g.kind === 'customer' ? <IconPersona /> : <IconGruppo />} {g.name}
              </button>
            ))}
            {groupChoices.length === 0 && (
              <p className="muted small" style={{ marginTop: 8 }}>
                Nessun gruppo aperto: si creano dalla coda ordini.
              </p>
            )}
          </div>
        </div>
      )}

      {schedaDrink && (
        <SchedaDrink drink={schedaDrink} onClose={() => setSchedaDrink(null)} />
      )}

      {confirmSvuota && (
        <ConfirmDialog
          title="🧹 Svuotare il conto?"
          message={`Le ${righeDaSvuotare} righe battute finora vengono tolte. Il conto resta aperto, vuoto.`}
          confirmLabel="Svuota"
          cancelLabel="Indietro"
          danger
          onCancel={() => setConfirmSvuota(false)}
          onConfirm={() => {
            setConfirmSvuota(false)
            svuotaTutto()
          }}
        />
      )}

      {confirmCancel && (
        <ConfirmDialog
          title="✖️ Annullare l'ordine?"
          message={
            isNew
              ? 'Le righe battute finora vengono buttate e si torna alla coda. Il conto non è ancora stato aperto.'
              : `L'ordine #${order?.daily_number ?? ''} verrà annullato e le scorte già scalate torneranno a magazzino.`
          }
          confirmLabel="Annulla ordine"
          cancelLabel="Indietro"
          danger
          onCancel={() => setConfirmCancel(false)}
          onConfirm={() => {
            setConfirmCancel(false)
            // DA QUI IN POI L'USCITA NON TOCCA PIÙ NIENTE (BUG-071): il
            // conto lo chiude l'annullo, cancello della stampa compreso.
            // Vale in tutti e due i casi qui sotto, e il secondo è quello
            // che si vede al banco: battuta la prima riga il conto NASCE
            // (`isNew` diventa falso) ma resta `in_creazione` — annullando
            // lì, l'uscita toglieva il segno e la comanda usciva.
            staAnnullando.current = true
            // Conto «nuovo»: la bozza si butta e si torna indietro. MA se
            // nel frattempo l'ordine è nato — l'auto-creazione scatta poco
            // dopo l'ultima riga, e battere quattro cose ci mette di più —
            // quello va ANNULLATO davvero, altrimenti resta aperto in coda
            // con dentro la roba che si è appena buttata. Era il conto
            // fantasma che poi ricompariva aprendo il conto dopo.
            // ANNULLARE LASCIA SEMPRE UN CONTO ANNULLATO. Anche se l'ordine
            // non era ancora nato: il numero è già stato mostrato e preso, e
            // di quello che è stato battuto deve restare traccia — un conto
            // sparito nel nulla non si può nemmeno controllare. Quindi si
            // crea (in locale, immediato) e si annulla.
            if (isNew) {
              const nato = creatingPromiseRef.current || createFromDraftRef.current()
              clearDraft()
              ricordaContoInCorso(null)
              Promise.resolve(nato)
                .then((o) => {
                  if (!o?.id) return null
                  nascondiOrdine(o.id)
                  return cancelOrder(o.id, { by: 'bartender' })
                })
                .catch((e) => toastError(`Annullo non riuscito: ${e.message}`))
              return navigate('/bar')
            }
            cancelOrder(order.id, { by: 'bartender' }).catch((e) => {
              // Non è andata: torni a vederlo in coda, com'è giusto.
              mostraOrdine(order.id)
              toastError(`Annullo non riuscito: ${e.message}`)
            })
            // Sparisce dalla coda SUBITO, senza aspettare il database:
            // altrimenti lo si ritrova lì per un istante e si dubita.
            nascondiOrdine(order.id)
            // SI TORNA AGLI ORDINI. Un conto annullato non si lavora più:
            // restarci davanti serve solo a chiedersi se l'annullo è andato,
            // e a rischiare di batterci sopra. Come quando si svuota da sé.
            // La scrittura prosegue per conto suo: se fallisce lo dice il
            // toast, ma la coda è già lì.
            navigate('/bar')
          }}
        />
      )}
    </div>
  )
}

// Copia di un oggetto senza una chiave (per rimuovere gli override flushati).
function omit(obj, key) {
  const next = { ...obj }
  delete next[key]
  return next
}

// LA COMANDA APPENA NATA, CONFRONTATA CON LA BOZZA DI ADESSO. L'ordine
// nasce con le righe com'erano quando la creazione è partita; nei decimi di
// secondo della nascita quelle righe possono essere state ritoccate (prezzo,
// ricetta, quantità) o tolte. Restituisce gli item corretti della prima
// comanda — quella nata con l'ordine — o null se non c'è niente da
// correggere. Le righe di altre battute (line_id non fra le inviate) non si
// toccano.
function correggiComandaNata(created, inviate, bozzaAttuale) {
  const comanda = (created?.comande || [])[0]
  if (!comanda) return null
  const perId = new Map(bozzaAttuale.map((r) => [r.line_id, r]))
  let cambiata = false
  const items = []
  for (const it of comanda.items || []) {
    if (!it.line_id || !inviate.has(it.line_id)) {
      items.push(it)
      continue
    }
    const ora = perId.get(it.line_id)
    if (!ora) {
      // Tolta mentre l'ordine nasceva: non deve rispuntare dal server.
      cambiata = true
      continue
    }
    const aggiornato = {
      ...it,
      name: ora.name,
      unit_price: ora.unit_price,
      qty: ora.qty,
      ...(ora.custom ? { custom: true } : {}),
      ...(ora.recipe_items ? { recipe_items: ora.recipe_items } : {}),
      note: ora.note || null,
    }
    if (
      aggiornato.name !== it.name ||
      aggiornato.unit_price !== it.unit_price ||
      aggiornato.qty !== it.qty ||
      !!aggiornato.custom !== !!it.custom ||
      (aggiornato.note || null) !== (it.note || null) ||
      JSON.stringify(aggiornato.recipe_items || []) !== JSON.stringify(it.recipe_items || [])
    ) {
      cambiata = true
    }
    items.push(aggiornato)
  }
  return cambiata ? { comandaId: comanda.id, items } : null
}
