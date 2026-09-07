import { useEffect, useMemo, useState } from 'react'
import {
  fetchInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  loadStock,
  adjustStock,
  travasaMagazzinoAPezzi,
  fetchStockMovements,
  fetchInventoryCategories,
  createInventoryCategory,
  updateInventoryCategory,
  deleteInventoryCategory,
  fetchMacroCategories,
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  fetchSupplierPrices,
  salvaRigaListino,
  togliProdottoDagliOrdini,
  subscribeSettings,
  subscribeActiveOrders,
  subscribeDrinks,
  settingsIniziali,
  DEFAULT_SETTINGS,
} from '../lib/api.js'
import { voceVisibile } from '../lib/licenza.js'
import {
  coloreACaso,
  coloreFornitore,
  COLORI_FORNITORE,
  righeDiProdotto,
  fornitoreProposto,
  fornitoriPerArticolo,
} from '../lib/listini.js'
import ListinoFornitore from './ListinoFornitore.jsx'
import { useCashSession } from '../lib/cashSession.js'
import { impegnatoPerArticolo, articoloPrevisto } from '../lib/impegnato.js'
import {
  formatQty,
  fmtItem,
  baseUnit,
  fromBaseQty,
  toBaseQty,
  qtyInStockUnit,
  unitaMovimento,
  statoTravaso,
  magazzinoBloccato,
  motivoNonMigrabile,
  fromStockUnit,
  eScorta,
  stockStatus,
  bottleSummary,
  bottleBreakdown,
  pezziInGiacenza,
  formatPezzi,
  copiaProdotto,
  fmtContenuto,
  contenutoDelPezzo,
  inventorySummary,
  filterItems,
  ASSORTIMENTI,
  assortimentoDi,
  ETICHETTA_ASSORTIMENTO,
  mancaNellaScheda,
  prodottiDaCompletare,
  schedaCompletata,
  costWithVat,
  stockValue,
  smallUnits,
  costPerUnit,
  inventoryTotalValue,
  unitaGenerica,
  UNIT_LABEL,
} from '../lib/inventory.js'
import { cambioAMano, cambioDaAvvisare } from '../lib/statoAssortimento.js'
import { formatPrice } from '../lib/orderStatus.js'
import { parseSupplierList } from '../lib/warehouse.js'
import MacroCategoryManager from './MacroCategoryManager.jsx'
import EtichettaMacro from './EtichettaMacro.jsx'
import { indiceMacro, macroDiCategoria } from '../lib/macros.js'
import { useChiudiConIndietro } from '../lib/schermate.js'
import { toastSuccess, toastError } from '../lib/toast.js'
import StockCountPanel from './StockCountPanel.jsx'
import CategoryRail from './CategoryRail.jsx'
import SortTh from './SortTh.jsx'
import SectionPanels from './SectionPanels.jsx'
import { IconFornitore } from './Icons.jsx'
import Tendina from './Tendina.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { useSottosezioni } from '../lib/sottosezioni.js'
import { usePaginaPiena } from '../lib/paginaPiena.js'

const STATUS_ITEM = [
  { value: 'assortimento', label: 'In assortimento' },
  { value: 'linea', label: '🍾 In linea' },
  { value: 'premium', label: '👑 Premium' },
  { value: 'out', label: '🚫 Fuori assortimento' },
]

const STATUS_LABEL = { ok: '', low: 'in esaurimento', empty: 'esaurito' }

// Come si chiama, a parole, il modo in cui un articolo è gestito: è quello che
// si legge nell'avviso quando lo si cambia in modifica.
const GESTIONE_LABEL = { pz: 'pezzi', g: 'peso', ml: 'liquidi', U: 'unità generiche' }

// Come si legge l'assortimento in lista: OUT accanto al nome (si deve vedere
// subito che non si ricompra) e una coroncina piccola sui premium. Chi è "in
// linea" non porta niente: è la normalità, e un segno su tutto non segna nulla.
// Il chip del filtro porta lo STESSO segno che compare nella riga: è lì che
// si impara cosa vuol dire il bollino, senza una legenda a parte da cercare.
const ASSORTIMENTO_LABEL = {
  assortimento: <>📦 In assortimento</>,
  linea: <>🍾 In linea</>,
  premium: <>👑 Premium</>,
  out: (
    <>
      <span className="badge-empty">OUT</span> Fuori assortimento
    </>
  ),
}
// Gli stessi nomi, in parole: servono al tasto della tendina, che deve dire
// cosa è scelto senza doversi aprire.
const ASSORTIMENTO_NOME = {
  assortimento: 'In assortimento',
  linea: 'In linea',
  premium: 'Premium',
  out: 'Fuori assortimento',
}
const ASSORTIMENTO_TITOLO = {
  assortimento: 'Si tiene, senza niente di speciale',
  linea: 'I primi da controllare prima di una serata',
  // «Bottiglie premium» dava per scontato che qui dentro ci fossero solo
  // bottiglie: un gestionale deve restare generico (REQ-MAG-019).
  premium: 'I prodotti buoni',
  out: 'Fuori assortimento: non si ricompra',
}
// Il segno della SCHEDA DA COMPLETARE (REQ-MAG-032), accanto al nome come la
// coroncina del premium: un prodotto nato da una consegna si riconosce
// scorrendo la lista, senza doverlo aprire.
function SegnoSchedaDaCompletare({ item }) {
  if (!item?.scheda_da_completare) return null
  return <span className="badge-segno" title="Scheda da completare">✏️</span>
}

function SegnoAssortimento({ item }) {
  const a = assortimentoDi(item)
  if (a === 'out') return <span className="badge-empty">OUT</span>
  if (a === 'premium') return <span className="badge-segno" title="Premium">👑</span>
  // La bottiglia: ora è libera, perché la colonna scorte non la usa più per
  // contare le bottiglie rimaste (scrive "3 bott.").
  if (a === 'linea') return <span className="badge-segno" title="In linea">🍾</span>
  return null
}

// Prezzo unitario dell'item con l'unità di misura selezionabile (cl/ml per i
// liquidi, g/mg per i solidi, pz per i pezzi): costo REALE al dettaglio +
// prezzo CONSIGLIATO a ricarico (×3 di default) e GUADAGNO che ne resta.
// È qui che si legge la marginalità dell'ingrediente, per unità.
function UnitPrice({ item, markup }) {
  const units = smallUnits(item)
  const [unit, setUnit] = useState(units[0])
  const cost = costPerUnit(item, unit)
  if (cost == null) return null
  const m = Number(markup) > 0 ? Number(markup) : 3
  const consigliato = cost * m
  const guadagno = consigliato - cost
  return (
    <div className="inv-info-row">
      <dt className="inv-unita">
        Al {unit}
        {units.length > 1 &&
          units.map((u) => (
            <button
              key={u}
              type="button"
              // Pastiglia MINUTA: sta dentro una riga di testo, non in una
              // barra di filtri. Con la misura piena (40px d'altezza) la
              // terza unità andava a capo da sola, e «ml» restava appeso
              // sotto il resto della riga.
              className={`chip mini ${u === unit ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setUnit(u)
              }}
            >
              {u}
            </button>
          ))}
      </dt>
      <dd className="inv-unitprice">
        <span>costo <strong>{formatPrice(cost)}</strong></span>
        <span>consigliato ×{m} <strong className="price">{formatPrice(consigliato)}</strong></span>
        <span className="muted">guadagno {formatPrice(guadagno)}</span>
      </dd>
    </div>
  )
}

// Sezioni del magazzino: cosa c'è sullo scaffale e come è ordinato —
// giacenze, conta periodica, anagrafiche e movimenti.
// DAL 26/08/2026 ORDINI, SCADENZARIO E FORNITORI NON SONO PIÙ QUI: sono
// passati alla sezione «Fornitori» del gestionale (FornitoriTab.jsx), che
// risponde a un'altra domanda — non «cosa ho» ma «con chi lavoro e quanto
// gli devo».
// La CONTA è una funzione premium (lib/licenza.js): resta in questo elenco,
// ma si vede solo dove il modulo lavora. L'elenco non si sdoppia apposta —
// l'ordine delle sezioni è uno solo.
const INV_VIEWS = [
  ['prodotti', '📦', 'Prodotti'],
  ['conta', '📋', 'Conta'],
  ['categorie', '🏷️', 'Categorie'],
  ['macro', '🗂️', 'Macro-categorie'],
  ['movimenti', '📜', 'Movimenti'],
]

// LE SEZIONI DEL MAGAZZINO STANNO NELLA BARRA IN ALTO. Le ho provate in due
// modi sbagliati: a sinistra costavano una colonna (e dentro c'è già la barra
// delle categorie), in orizzontale una riga. Sono una scelta che si fa ogni
// tanto e non merita spazio fisso: ora è il TITOLO della pagina a diventare
// il comando, e sul telefono si apre il foglio dal basso.
export default function InventoryManager() {
  const [sezione, setSezione] = useState('prodotti')
  usePaginaPiena()
  // DUE SEZIONI SONO FUNZIONI PREMIUM (lib/licenza.js): Conta e Scadenzario
  // compaiono solo dove il modulo è acceso. Le impostazioni si prendono
  // dalla cache (`settingsIniziali`) e si aggiornano da sole: nessuna
  // lettura in più e nessuna attesa, se no la barra delle sezioni si
  // disegnerebbe due volte e le voci ballerebbero sotto il dito.
  const [impostazioni, setImpostazioni] = useState(settingsIniziali)
  useEffect(() => subscribeSettings(setImpostazioni, () => {}), [])
  const voci = useMemo(
    () => INV_VIEWS.filter(([id]) => voceVisibile(impostazioni, id)),
    [impostazioni]
  )
  // Il modulo può spegnersi mentre la sua sezione è aperta (lo si spegne
  // da un altro terminale). La vista aperta si RICAVA dall'elenco invece di
  // essere solo quella scelta: così si torna ai Prodotti senza un giro di
  // stato in più, e non resta a schermo un pannello che non è più in
  // elenco.
  const view = voci.some(([id]) => id === sezione) ? sezione : 'prodotti'
  useSottosezioni(
    voci.map(([id, icona, label]) => ({ id, icona, label })),
    view,
    setSezione
  )
  return (
    <div className="pagina-inventario">
      {view === 'prodotti' && <ProductsPanel />}
      {view === 'conta' && <StockCountPanel />}
      {view === 'categorie' && <CategoriePanel />}
      {view === 'macro' && <MacroPanel />}
      {view === 'movimenti' && <MovimentiPanel />}
    </div>
  )
}

// Le tre anagrafiche: si tirano su i dati che servono e basta. Prima
// stavano dentro il pannello dei prodotti, che li aveva già in mano per
// altri motivi — e infatti erano finite lì.
function CategoriePanel() {
  const [categories, setCategories] = useState([])
  // LE MACRO SERVONO ANCHE QUI. Finora questo elenco mostrava il solo
  // nome, e a quale gruppo appartenesse una categoria si andava a vedere
  // nel pannello delle macro — cioè da un'altra parte, dopo essersi
  // chiesti se valeva la pena.
  const [macros, setMacros] = useState([])
  const ricarica = async () => {
    const [cats, macs] = await Promise.all([
      fetchInventoryCategories(),
      fetchMacroCategories('magazzino').catch(() => []),
    ])
    setCategories(cats)
    setMacros(macs)
  }
  useEffect(() => {
    ricarica()
  }, [])
  return <InvCategoryManager categories={categories} macros={macros} onChange={ricarica} />
}

function MacroPanel() {
  const [macros, setMacros] = useState([])
  const [categories, setCategories] = useState([])
  // Le macro del MENÙ servono qui solo per l'aggancio: su ogni macro di
  // spesa si sceglie a quale macro di vendita corrisponde.
  const [macroMenu, setMacroMenu] = useState([])
  // I PRODOTTI CON LA SCHEDA DA COMPLETARE SI GUARDANO QUI (REQ-MAG-032), coi
  // conti che hanno un buco: una categoria senza macro e un prodotto senza
  // categoria sono lo stesso buco visto da due lati (REQ-UI-022), e in tutti
  // e due i casi una spesa vera non compare in «Acquisti × Fatturato».
  const [daCompletare, setDaCompletare] = useState([])
  const ricarica = async () => {
    const [macs, cats, menu, items] = await Promise.all([
      fetchMacroCategories('magazzino'),
      fetchInventoryCategories(),
      fetchMacroCategories('menu').catch(() => []),
      // Il pannello deve reggere anche se il magazzino non risponde: le
      // macro sono la cosa per cui si è entrati, i prodotti un di più.
      fetchInventoryItems().catch(() => []),
    ])
    setMacros(macs)
    setCategories(cats)
    setMacroMenu(menu)
    setDaCompletare(prodottiDaCompletare(items))
  }
  useEffect(() => {
    ricarica()
  }, [])
  return (
    <MacroCategoryManager
      ambito="magazzino"
      macros={macros}
      categories={categories}
      onChange={ricarica}
      aggiornaCategoria={updateInventoryCategory}
      creaCategoria={createInventoryCategory}
      macroDiVendita={macroMenu}
      prodottiDaCompletare={daCompletare}
    />
  )
}

// I MOVIMENTI HANNO UNA SEZIONE LORO. Stavano in fondo alla lista dei
// prodotti dietro un tasto largo quanto lo schermo: fuori contesto (non
// sono un prodotto), e in mezzo ai piedi a chi cercava una bottiglia.
function MovimentiPanel() {
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetchStockMovements({ limit: 100 })
      .then(setMovements)
      .catch(() => setMovements([]))
      .finally(() => setLoading(false))
  }, [])
  if (loading) return <div className="empty">Carico i movimenti…</div>
  if (movements.length === 0) return <div className="empty">Ancora nessun movimento.</div>
  return (
    <div className="card inv-movimenti">
      {movements.map((m) => (
        <div className="row between" key={m.id}>
          <span className="muted small">
            {m.type === 'load' ? '⬆' : '⬇'} {m.item_name} · {m.reason}
          </span>
          <span className="muted small">
            {m.type === 'load' ? '+' : '−'}
            {formatQty(m.qty, m.unit)}
          </span>
        </div>
      ))}
    </div>
  )
}

// L'ANAGRAFICA DEI FORNITORI vive nella sezione «Fornitori»
// (FornitoriTab.jsx), non più qui. Il pannello resta in questo file perché
// ci resta `SupplierManager`, che è il modulo vero e non ha altri clienti:
// spostare seicento righe per una voce di menu avrebbe reso illeggibile il
// diff di un trasloco che di suo è una riga.
export function FornitoriPanel() {
  const [suppliers, setSuppliers] = useState([])
  // IL LISTINO È IL DETTAGLIO DELLA RIGA, non una sottosezione in più
  // (docs/navigazione.md): si apre da un fornitore, si chiude e si torna
  // all'elenco. Uscendo si dimentica, come le chiusure di cassa: tornando
  // qui si riparte sempre dalla lista.
  const [listinoPer, setListinoPer] = useState(null)
  const ricarica = async () => setSuppliers(await fetchSuppliers())
  useEffect(() => {
    ricarica()
  }, [])
  const aperto = suppliers.find((s) => s.id === listinoPer)
  if (aperto) {
    return <ListinoFornitore fornitore={aperto} onIndietro={() => setListinoPer(null)} />
  }
  return (
    <SupplierManager suppliers={suppliers} onChange={ricarica} onListino={setListinoPer} />
  )
}

// QUANTO NE RESTA A FINE SERATA. Si legge con le stesse regole della
// giacenza — pezzi per le bottiglie, unità per il resto — perché è la stessa
// cosa guardata più avanti nel tempo: due modi di scrivere lo stesso numero
// farebbero sembrare due dati diversi.
//
// Torna null quando nessun conto aperto ha chiesto quel prodotto: la tabella
// e le card lo dicono in due modi diversi (un trattino nella colonna, niente
// sotto la card), e a decidere è chi disegna — il numero è lo stesso, e sta
// scritto una volta sola.
function previstoFineSerata(item, impegnato) {
  const previsto = articoloPrevisto(item, impegnato)
  if (!previsto) return null
  const bs = bottleSummary(previsto)
  return {
    testo: bs ? `${formatPezzi(bs.pezzi)} pz` : fmtItem(previsto.stock, previsto),
    finito: (Number(previsto.stock) || 0) <= 0,
  }
}

// LA CELLA «A FINE SERATA» nella tabella. Senza impegno resta un trattino:
// una colonna vuota si legge come un dato mancante.
function CellaFineSerata({ item, impegnato }) {
  const p = previstoFineSerata(item, impegnato)
  if (!p) return <span className="inv-cell-num muted">—</span>
  return <span className={`inv-cell-num inv-row-previsto${p.finito ? ' finito' : ''}`}>{p.testo}</span>
}

// La stessa previsione nella vista a CARD, dove non ci sono colonne: si
// scrive per esteso sotto la giacenza, e solo se quel prodotto è in ballo.
function PrevisioneCard({ item, impegnato }) {
  const p = previstoFineSerata(item, impegnato)
  if (!p) return null
  return (
    <span
      className={`small${p.finito ? ' inv-row-previsto finito' : ' muted'}`}
      style={{ display: 'block' }}
    >
      a fine serata {p.testo}
    </span>
  )
}

function ProductsPanel() {
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  // Il listino: chi vende cosa, e a quanto (REQ-MAG-029). Serve alla scheda
  // prodotto, che il fornitore lo scrive lì e non più sul prodotto.
  const [listini, setListini] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editing, setEditing] = useState(null) // null | 'new' | item
  // Lo stato cambiato a mano su un prodotto che sta in un ordine aperto:
  // { payload, scelte, ordini } finché non si risponde alla domanda.
  const [avvisaOrdine, setAvvisaOrdine] = useState(null)
  // Aperta la scheda, «indietro» torna al magazzino invece di uscire dalla
  // pagina: vedi lib/schermate.js.
  useChiudiConIndietro(!!editing, () => setEditing(null))

  // Filtri
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  // Assortimento: si possono tenere accesi PIÙ valori insieme (linea +
  // premium, linea + out…). Vuoto = si vede tutto.
  const [assortimenti, setAssortimenti] = useState([])
  const toggleAssortimento = (k) =>
    setAssortimenti((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))

  // Riga espansa + carico in corso
  const [invView, setInvView] = useState('lista') // 'lista' | 'card' — default LISTA
  // Ordinamento della tabella: click sull'intestazione, ri-click inverte.
  const [sort, setSort] = useState({ col: 'name', dir: 'asc' })
  const toggleSort = (col) =>
    setSort((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }))
  const [expandedId, setExpandedId] = useState(null)
  const [caricoFor, setCaricoFor] = useState(null)
  const [rettificaFor, setRettificaFor] = useState(null)

  // QUELLO CHE TI RITROVI A FINE SERATA. I conti ancora aperti hanno già
  // promesso degli ingredienti: si guardano gli ordini e il listino e si
  // toglie dalla giacenza quello che il magazzino non ha ancora scalato.
  // A cassa chiusa la colonna non c'è: non c'è una serata in corso di cui
  // dire come finirà.
  const { open: cassaAperta } = useCashSession()
  // Con gli stati del servizio un conto pagato ma non servito è ancora
  // aperto, e i suoi ingredienti sono ancora in ballo; senza, il pagamento
  // chiude e il magazzino è già stato scalato.
  const [workflowOn, setWorkflowOn] = useState(DEFAULT_SETTINGS.workflow_enabled !== false)
  const [ordiniVivi, setOrdiniVivi] = useState([])
  const [drinksById, setDrinksById] = useState({})
  useEffect(() => subscribeActiveOrders(setOrdiniVivi, () => {}), [])
  useEffect(
    () =>
      subscribeDrinks(
        {},
        (ds) => setDrinksById(Object.fromEntries(ds.map((d) => [d.id, d]))),
        () => {}
      ),
    []
  )
  const itemsById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items])
  const impegnato = useMemo(
    () =>
      cassaAperta
        ? impegnatoPerArticolo(ordiniVivi, drinksById, itemsById, { workflowOn })
        : {},
    [cassaAperta, ordiniVivi, drinksById, itemsById, workflowOn]
  )
  // La colonna compare solo se c'è davvero qualcosa in ballo: a serata
  // ferma sarebbe una colonna di trattini.
  const mostraPrevisione = Object.keys(impegnato).length > 0

  // Ricarico (×N) per il prezzo consigliato mostrato accanto al costo.
  const [markup, setMarkup] = useState(DEFAULT_SETTINGS.price_markup)
  // IVA di ACQUISTO (fatture fornitore, 22%): è il default dei prodotti qui.
  const [purchaseVat, setPurchaseVat] = useState(DEFAULT_SETTINGS.purchase_vat)
  useEffect(
    () =>
      subscribeSettings((s) => {
        setWorkflowOn(s.workflow_enabled !== false)
        setMarkup(s.price_markup)
        setPurchaseVat(s.purchase_vat ?? DEFAULT_SETTINGS.purchase_vat)
      }, () => {}),
    []
  )

  const catName = (id) => categories.find((c) => c.id === id)?.name
  const supName = (id) => suppliers.find((s) => s.id === id)?.name
  // Sulla card si leggono TUTTI i fornitori di quel prodotto: uno solo
  // farebbe credere che sia l'unico da cui si compra.
  const supNames = (it) =>
    (fornitoriDegliArticoli.get(it.id) || []).map(supName).filter(Boolean).join(', ')

  async function load() {
    setLoading(true)
    try {
      const [its, cats, sups, list] = await Promise.all([
        fetchInventoryItems(),
        fetchInventoryCategories().catch(() => []),
        fetchSuppliers().catch(() => []),
        // Un magazzino senza nessun listino è la normalità finché non li si
        // compila: la schermata regge lo stesso.
        fetchSupplierPrices().catch(() => []),
      ])
      setItems(its)
      setCategories(cats)
      setSuppliers(sups)
      setListini(list)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // ── A CHE PUNTO STA IL TRAVASO ────────────────────────────────────
  // Non è un flag scritto da qualche parte: si guarda se esistono ancora
  // articoli nella forma vecchia. Se non ce ne sono — e può succedere, i
  // dati possono arrivare già sistemati — di tutta questa faccenda non si
  // vede niente, e la schermata è quella normale di sempre.
  const travaso = useMemo(() => statoTravaso(items), [items])
  const [passoTravaso, setPassoTravaso] = useState(null) // 'prova' | 'corso' | 'fatto'
  const [avanzamento, setAvanzamento] = useState({ fatti: 0, totale: 0 })
  const [esitoTravaso, setEsitoTravaso] = useState(null)
  // Finché il magazzino non è aggiornato si può toccare SOLO quello che va
  // sistemato per farlo partire: è l'unica strada per sbloccarlo. Tutto il
  // resto è in sola lettura — battere una comanda e scaricare le scorte
  // continua a funzionare, che quella è la serata e non aspetta noi.
  // La regola sta in inventory.js, con lo stato del travaso: è la stessa che
  // vale per Acquisti, e finché era una riga scritta qui quella schermata ne
  // restava fuori (BUG-029).
  const bloccato = magazzinoBloccato(items)
  const daSistemare = useMemo(
    () => new Set(travaso.daSistemare.map((it) => it.id)),
    [travaso.daSistemare]
  )
  const modificabile = (it) => !bloccato || daSistemare.has(it.id)

  // LA PROVA A VUOTO RILEGGE, SEMPRE. È quella che si guarda per decidere:
  // non può parlare di prodotti visti dieci minuti fa, e il magazzino qui si
  // legge una volta sola (non è la coda, non serve stare in ascolto). Il
  // caso vero: un altro terminale cambia i prodotti, e questa schermata
  // continuerebbe a contare i vecchi.
  async function apriProva() {
    setPassoTravaso('rileggo')
    await load()
    setPassoTravaso('prova')
  }

  async function avviaTravaso() {
    setPassoTravaso('corso')
    try {
      const esito = await travasaMagazzinoAPezzi({
        onAvanzamento: (fatti, totale) => setAvanzamento({ fatti, totale }),
      })
      setEsitoTravaso(esito)
      setPassoTravaso('fatto')
    } catch (e) {
      // A CHI STA AL BANCO NON SI FA LEGGERE LA LINGUA DEL DATABASE. Il
      // motivo tecnico va nella console; a schermo si dice cosa è successo e
      // che si può riprovare — perché è vero: quello che è passato resta
      // scritto e il giro riprende da dove stava.
      console.error('[travaso] aggiornamento interrotto', e)
      setEsitoTravaso(null)
      setPassoTravaso('interrotto')
    }
    // In ogni caso si rilegge: il cartello e i conteggi devono dire come
    // stanno le cose ADESSO, e sparire da soli quando non c'è più niente da
    // fare, senza che nessuno ricarichi la pagina a mano.
    await load()
  }

  const summary = useMemo(() => inventorySummary(items), [items])
  const totalValue = useMemo(() => inventoryTotalValue(items), [items])
  // Blocco azioni espanse di un item, condiviso dalla vista a CARD e dalla
  // vista a LISTA: carico, rettifica, costi e modifica/elimina.
  const itemActions = (it, bd) => (
    <div className="grid-card-actions">
      {/* SCHEDA DA COMPLETARE (REQ-MAG-032): il prodotto è nato da una
          consegna, con quello che l'ordine sapeva. Non è la lista «da
          sistemare» del travaso e non blocca niente — si dice cosa manca e
          basta, perché è chi conosce il prodotto a poterlo scrivere.
          L'ambra vuol dire «lavoro che manca»: il rosso, in questa app, vuol
          dire annullato (DESIGN.md). */}
      {it.scheda_da_completare && (
        <p className="badge-low" style={{ display: 'block', margin: '0 0 8px' }}>
          ✏️ Scheda da completare: manca {mancaNellaScheda(it).join(', ')}.
          {!it.category_id &&
            ' Finché manca la categoria, quello che si spende per questo prodotto resta fuori dai conti degli acquisti.'}
        </p>
      )}
      <dl className="inv-info">
        {/* QUANTO CE N'È, PER PRIMO — è la ragione per cui un prodotto si
            apre. Dove si conta a pezzi lo dice la riga «Pezzi», che è più
            precisa (quante piene, quella aperta, quanto fa una): una riga
            «Giacenza» sopra ripeteva lo stesso numero due volte. */}
        {bd ? (
          <div className="inv-info-row">
            <dt>Pezzi</dt>
            <dd>
              <strong>{formatPezzi(pezziInGiacenza(it))} pz</strong>
              {' · '}
              {bd.full} piene
              {bd.hasOpen && ` · 1 aperta (${fmtContenuto(bd.openRemaining, it)})`}
              {bd.finished > 0 && ` · ${bd.finished} finite`}
              {/* Il contenuto in cl (o g): un pezzo è la bottiglia, dentro
                  non ci sono pezzi. */}
              <span className="muted"> · 1 pz = {contenutoDelPezzo(it)}</span>
            </dd>
          </div>
        ) : (
          <>
            <div className="inv-info-row">
              <dt>Giacenza</dt>
              <dd>
                <strong>{fmtItem(it.stock, it)}</strong>
              </dd>
            </div>
            {Number(it.package_size) > 0 && (
              <div className="inv-info-row">
                <dt>Confezione</dt>
                <dd>
                  {it.unit === 'pz' ? (
                    <>1 pz = {contenutoDelPezzo(it) ?? `${it.package_size} (misura non detta)`}</>
                  ) : (
                    <>1 conf. = {fmtItem(it.package_size, it)}</>
                  )}
                </dd>
              </div>
            )}
          </>
        )}
        {impegnato[it.id] > 0 && (
          <div className="inv-info-row">
            <dt>A fine serata</dt>
            <dd>
              {/* Il numero da solo non basta: chi legge vuole sapere
                  QUANTO è promesso, per capire se vale la pena aprire
                  un'altra bottiglia adesso o aspettare. */}
              <strong>
                {(() => {
                  const p = articoloPrevisto(it, impegnato[it.id])
                  const bs = bottleSummary(p)
                  return bs ? `${formatPezzi(bs.pezzi)} pz` : fmtItem(p.stock, p)
                })()}
              </strong>
              <span className="muted">
                {' · '}
                {fmtItem(impegnato[it.id], it)} sui conti ancora aperti
              </span>
            </dd>
          </div>
        )}
        {Number(it.low_threshold) > 0 && (
          <div className="inv-info-row">
            <dt>Soglia avviso</dt>
            <dd>{fmtItem(it.low_threshold, it)}</dd>
          </div>
        )}
        {it.cost != null && (
          <>
            <div className="inv-info-row">
              <dt>💶 Costo</dt>
              <dd>
                {formatPrice(it.cost)}/pz <span className="muted">(+IVA {formatPrice(costWithVat(it.cost, it.vat))})</span>
                {' · valore '}<strong>{formatPrice(stockValue(it))}</strong>
              </dd>
            </div>
            <UnitPrice item={it} markup={markup} />
          </>
        )}
      </dl>

      {caricoFor === it.id ? (
        <CaricoForm item={it} onCancel={() => setCaricoFor(null)} onConfirm={(p) => doCarico(it, p)} />
      ) : rettificaFor === it.id ? (
        <RettificaForm
          item={it}
          onCancel={() => setRettificaFor(null)}
          onConfirm={(baseQty) => rettifica(it, baseQty)}
        />
      ) : (
        <>
          {/* MAGAZZINO IN SOLA LETTURA finché non è aggiornato: caricare o
              contare adesso vorrebbe dire scrivere pezzi su una giacenza
              ancora contata in centilitri. Chi va sistemato si apre lo
              stesso, che è l'unico modo di far partire l'aggiornamento. */}
          {bloccato ? (
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              {daSistemare.has(it.id)
                ? '✏️ Questo prodotto va sistemato: aprilo e scrivi a quanto corrisponde un pezzo.'
                : '🔒 Carico e conta tornano appena il magazzino è aggiornato.'}
            </p>
          ) : (
            <>
              <button className="btn small block" style={{ marginTop: 8 }} onClick={() => setCaricoFor(it.id)}>
                ⬆ Carico
              </button>
              <button
                className="btn secondary small block"
                style={{ marginTop: 6 }}
                onClick={() => {
                  setCaricoFor(null)
                  setRettificaFor(it.id)
                }}
              >
                Contenuto reale
              </button>
            </>
          )}
          {/* Tre azioni sulla stessa riga: si modifica, si duplica, si
              elimina. DUPLICA sta in mezzo perché è la via di mezzo — un
              prodotto quasi uguale a questo — e a fianco dell'elimina si
              ragiona due volte prima di premere. */}
          <div className="inv-azioni" style={{ marginTop: 6 }}>
            <button className="btn ghost small" disabled={!modificabile(it)} onClick={() => setEditing(it)}>✏️ Modifica</button>
            <button className="btn ghost small" disabled={bloccato} onClick={() => duplica(it)}>⧉ Duplica</button>
            <button className="btn ghost small" disabled={bloccato} onClick={() => remove(it)}>🗑 Elimina</button>
          </div>
        </>
      )}
    </div>
  )

  // Chi vende cosa, secondo il listino: il filtro per fornitore non può più
  // guardare il campo sul prodotto, che da REQ-MAG-029 non si scrive più.
  const fornitoriDegliArticoli = useMemo(
    () => fornitoriPerArticolo(items, listini),
    [items, listini]
  )

  const visible = useMemo(
    () =>
      filterItems(items, {
        query,
        categoryId: categoryFilter,
        supplierId: supplierFilter,
        status: statusFilter,
        assortimenti,
        fornitoriPerArticolo: fornitoriDegliArticoli,
      }),
    [items, query, categoryFilter, supplierFilter, statusFilter, assortimenti, fornitoriDegliArticoli]
  )

  // Righe ordinate per la TABELLA: testo in ordine alfabetico, numeri per
  // valore. I valori mancanti finiscono sempre in fondo, in entrambi i versi.
  const sortedVisible = useMemo(() => {
    const val = (it) => {
      switch (sort.col) {
        case 'cat': return catName(it.category_id) || ''
        case 'net': return it.cost != null ? Number(it.cost) : null
        case 'gross': return it.cost != null ? costWithVat(it.cost, it.vat) : null
        case 'percl': return costPerUnit(it, 'cl')
        case 'stock': return Number(it.stock) || 0
        case 'previsto': return (Number(it.stock) || 0) - (impegnato[it.id] || 0)
        default: return it.name || ''
      }
    }
    const mul = sort.dir === 'asc' ? 1 : -1
    return [...visible].sort((a, b) => {
      const x = val(a)
      const y = val(b)
      const xMissing = x == null || x === ''
      const yMissing = y == null || y === ''
      if (xMissing && yMissing) return 0
      if (xMissing) return 1 // i vuoti restano in fondo
      if (yMissing) return -1
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * mul
      return String(x).localeCompare(String(y), 'it') * mul
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, sort, categories, impegnato])

  // Conteggi per categoria (su tutto l'inventario) per la barra a sinistra.
  const catItems = useMemo(() => {
    let none = 0
    const per = {}
    for (const it of items) {
      if (it.category_id) per[it.category_id] = (per[it.category_id] || 0) + 1
      else none += 1
    }
    return [
      { key: 'all', label: 'Tutte', count: items.length },
      ...categories.map((c) => ({ key: c.id, label: c.name, count: per[c.id] || 0 })),
      ...(none ? [{ key: 'none', label: 'Senza categoria', count: none }] : []),
    ]
  }, [items, categories])

  // Un fornitore creato dalla scheda di un prodotto: basta il nome, e
  // l'elenco si aggiorna subito senza ricaricare tutto il magazzino — la
  // scheda che lo aspetta è aperta, e ricaricare la chiuderebbe.
  async function creaFornitoreAlVolo(nome) {
    const creato = await createSupplier({ name: nome, sort_order: suppliers.length })
    setSuppliers((prev) => [...prev, creato])
    return creato
  }

  // ── LO STATO A MANO, SU UN PRODOTTO CHE STA IN UN ORDINE (REQ-MAG-037)
  //
  // «Gli si deve DIRE che quel prodotto è presente in un ordine in attesa di
  // essere ricevuto. Se cambia lo stato manualmente, il prodotto va eliminato
  // dall'ordine» (utente, 27/08). Sono la stessa decisione presa dai due
  // capi: un prodotto non più «in assortimento» che resta dentro un ordine
  // aperto è un ordine che nessuno sa più di aver fatto.
  //
  // La domanda si fa con la sola scheda in mano — gli ordini che lo tengono
  // dentro sono scritti sul prodotto — quindi il magazzino non legge niente
  // di nuovo, e la sua interfaccia resta quella di prima.
  async function handleSave(payload, scelte = {}) {
    const ordini = editing && editing !== 'new' ? cambioDaAvvisare(editing, payload.status) : null
    if (ordini) {
      setAvvisaOrdine({ payload, scelte, ordini })
      return
    }
    return salva(payload, scelte)
  }

  // IL FORNITORE NON SI SCRIVE PIÙ SUL PRODOTTO (REQ-MAG-029): finisce nel
  // LISTINO, come riga prodotto-fornitore. Il vecchio campo `supplier_id`
  // non si cancella — resta a leggersi sui dieci prodotti che ce l'hanno,
  // dove fa da riga virtuale — ma da qui in poi nessuno lo riscrive.
  async function salva(payload, { supplier_id } = {}, ordiniDaLiberare = null) {
    setError(null)
    try {
      // LO STATO COMMERCIALE SI SCRIVE CON LA SUA MEMORIA (REQ-MAG-037):
      // passando in assortimento il prodotto si ricorda da dove viene, e
      // uscendone si liberano memoria e legame con gli ordini. Senza, un
      // premium tornerebbe indietro come prodotto qualunque.
      const patchStato =
        editing && editing !== 'new' ? cambioAMano(editing, payload.status) : null
      const conStato = patchStato ? { ...payload, ...patchStato } : payload
      // LA SCHEDA NATA DA UN ORDINE SI CHIUDE QUI (REQ-MAG-032), e la
      // chiude la CATEGORIA: è quella che serve al resto del sistema, ed è
      // per lei che la spesa del prodotto sparirebbe dai conti.
      const completa =
        editing && editing !== 'new' && schedaCompletata(editing, payload)
          ? { ...conStato, scheda_da_completare: false }
          : conStato
      const salvato =
        editing && editing !== 'new'
          ? await updateInventoryItem(editing.id, completa)
          : await createInventoryItem(completa)
      if (supplier_id && salvato?.id) {
        // LA RIGA DI PRIMA SERVE ALLO STORICO (REQ-MAG-035): senza, ogni
        // salvataggio della scheda risulterebbe una variazione di prezzo,
        // anche quello di chi ha solo corretto il nome del prodotto.
        salvaRigaListino({
          supplier_id,
          item_id: salvato.id,
          price: payload.cost ?? null,
          precedente: listini.find(
            (r) => r.supplier_id === supplier_id && r.item_id === salvato.id
          ),
        })
      }
      // Il legame si taglia dall'altra parte SOLO dopo che lo stato è
      // scritto: se la scheda non si salva, il prodotto resta dentro
      // l'ordine e nessuno ha perso niente.
      if (ordiniDaLiberare?.length > 0 && salvato?.id)
        await togliProdottoDagliOrdini(salvato.id, ordiniDaLiberare)
      setEditing(null)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function doCarico(item, { count, unit, newCost }) {
    setError(null)
    try {
      // Quello che si scrive è nell'unità che si ha in mano; in giacenza va
      // in pezzi, con lo stesso conto che fa lo scarico. Gli articoli
      // arrivano qui sempre nella forma nuova (REQ-MAG-018, la lettura
      // tollerante sta in api.js), quindi non c'è nessun altro caso.
      if (count > 0) await loadStock(item.id, qtyInStockUnit(count, unit, item))
      // Prezzo aggiornato al carico (il fornitore ha cambiato tariffa).
      if (newCost != null) await updateInventoryItem(item.id, { cost: newCost })
      setCaricoFor(null)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  // Contenuto reale: la quantità arriva GIÀ convertita in unità base dal form
  // (che lavora in cl per i liquidi, come il bartender conta le bottiglie).
  async function rettifica(item, baseQty) {
    setError(null)
    try {
      await adjustStock(item.id, baseQty)
      setRettificaFor(null)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  // DUPLICA: lo stesso prodotto con un altro nome, da correggere. Al banco
  // il magazzino è pieno di quasi-uguali — stessa bottiglia in due formati,
  // lo stesso amaro di un altro fornitore — e rifarli da zero vuol dire
  // ribattere costo, confezione, categoria, soglia e IVA.
  //
  // La copia nasce con la GIACENZA A ZERO e senza storia di carichi: è un
  // prodotto nuovo che non è mai entrato in magazzino. Copiare anche le
  // scorte vorrebbe dire inventarsi bottiglie che non ci sono.
  async function duplica(item) {
    try {
      const copia = await createInventoryItem(copiaProdotto(item))
      setItems((prev) => [...prev, copia])
      // Si apre subito la scheda: il nome «(copia)» va cambiato, ed è il
      // motivo per cui si sta duplicando.
      setEditing(copia)
    } catch (e) {
      setError(e.message)
    }
  }

  async function remove(item) {
    if (!confirm(`Eliminare "${item.name}" dal magazzino?`)) return
    try {
      await deleteInventoryItem(item.id)
      setItems((prev) => prev.filter((x) => x.id !== item.id))
    } catch (e) {
      setError(e.message)
    }
  }

  if (editing) {
    return (
      <>
        {avvisaOrdine && (
          <ConfirmDialog
            title="Il prodotto è in un ordine aperto"
            message={`«${editing?.name || 'Questo prodotto'}» fa parte di ${
              avvisaOrdine.ordini.length === 1
                ? 'un ordine ancora in attesa di consegna'
                : `${avvisaOrdine.ordini.length} ordini ancora in attesa di consegna`
            }. Cambiando lo stato viene tolto da quell’ordine: le righe già consegnate restano dove sono.`}
            confirmLabel="Cambia lo stato"
            onCancel={() => setAvvisaOrdine(null)}
            onConfirm={() => {
              const { payload, scelte, ordini } = avvisaOrdine
              setAvvisaOrdine(null)
              salva(payload, scelte, ordini)
            }}
          />
        )}
        <ItemForm
          initial={editing === 'new' ? null : editing}
          categories={categories}
          suppliers={suppliers}
          listini={listini}
          defaultVat={purchaseVat}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
          onCreateSupplier={creaFornitoreAlVolo}
        />
      </>
    )
  }

  // Cosa dice il tasto della tendina: una tendina che non dice cosa è
  // scelto costringe ad aprirla per ricordarselo.
  const nomiStato = {
    all: null,
    in_scorta: 'In scorta',
    low: 'In esaurimento',
    empty: 'Esauriti',
  }
  const sceltiOra = [nomiStato[statusFilter], ...assortimenti.map((k) => ASSORTIMENTO_NOME[k])]
    .filter(Boolean)
  const riassuntoFiltri =
    sceltiOra.length === 0
      ? '⚗️ Filtra'
      : sceltiOra.length === 1
        ? `⚗️ ${sceltiOra[0]}`
        : `⚗️ ${sceltiOra.length} filtri`

  return (
    <div className="inv-panel">
      <PannelloTravaso
        travaso={travaso}
        passo={passoTravaso}
        avanzamento={avanzamento}
        esito={esitoTravaso}
        onProva={apriProva}
        onChiudi={() => setPassoTravaso(null)}
        onConferma={avviaTravaso}
      />
      {/* LA TESTATA: ricerca, e sotto le scelte che stanno ferme quasi
          sempre. I filtri erano sette pastiglie sempre aperte — una riga di
          schermo occupata tutto il giorno per una scelta che si cambia due
          volte a sera — più una riga per i fornitori, una per il tasto
          nuovo prodotto e una per card/lista: quattro righe prima di vedere
          un prodotto. Ora stanno in due tendine e due icone, su una riga, e
          il tasto dice cosa è scelto senza doverlo aprire. */}
      <input
        className="inv-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 Cerca prodotto…"
      />

      <div className="inv-testa">
        <Tendina
          etichetta="Filtra i prodotti"
          attivo={statusFilter !== 'all' || assortimenti.length > 0}
          riassunto={riassuntoFiltri}
        >
          <div className="tendina-titolo">Come stanno a scorta</div>
          {[
            ['all', 'Tutti', summary.total],
            // «In scorta» prima delle altre due: è la domanda che ci si fa
            // per prima — cosa c'è — e le altre sono lenti più strette.
            ['in_scorta', 'In scorta', summary.inScorta],
            ['low', 'In esaurimento', summary.low],
            ['empty', 'Esauriti', summary.empty],
          ].map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              className={`tendina-voce${statusFilter === k ? ' scelta' : ''}`}
              onClick={() => setStatusFilter(k)}
            >
              <span>{label}</span>
              <strong>{n}</strong>
            </button>
          ))}
          <div className="tendina-titolo">Assortimento</div>
          {ASSORTIMENTI.map((k) => {
            const quanti = items.filter((it) => assortimentoDi(it) === k).length
            return (
              <button
                key={k}
                type="button"
                className={`tendina-voce${assortimenti.includes(k) ? ' scelta' : ''}`}
                onClick={() => toggleAssortimento(k)}
                title={ASSORTIMENTO_TITOLO[k]}
              >
                <span>{ASSORTIMENTO_LABEL[k]}</span>
                <strong>{quanti}</strong>
              </button>
            )
          })}
          {(assortimenti.length > 0 || statusFilter !== 'all') && (
            <button
              type="button"
              className="btn ghost small block"
              style={{ marginTop: 6 }}
              onClick={() => {
                setAssortimenti([])
                setStatusFilter('all')
              }}
            >
              ✕ Togli i filtri
            </button>
          )}
        </Tendina>

        {suppliers.length > 0 && (
          <Tendina
            etichetta="Fornitore"
            attivo={supplierFilter !== 'all'}
            riassunto={
              supplierFilter === 'all'
                ? '🏭 Fornitore'
                : `🏭 ${suppliers.find((x) => x.id === supplierFilter)?.name || 'Fornitore'}`
            }
          >
            {(chiudi) => (
              <>
                <button
                  type="button"
                  className={`tendina-voce${supplierFilter === 'all' ? ' scelta' : ''}`}
                  onClick={() => {
                    setSupplierFilter('all')
                    chiudi()
                  }}
                >
                  <span>Tutti i fornitori</span>
                </button>
                {suppliers.map((sup) => (
                  <button
                    key={sup.id}
                    type="button"
                    className={`tendina-voce${supplierFilter === sup.id ? ' scelta' : ''}`}
                    onClick={() => {
                      setSupplierFilter(sup.id)
                      chiudi()
                    }}
                  >
                    <span>{sup.name}</span>
                  </button>
                ))}
              </>
            )}
          </Tendina>
        )}

        {/* Un numero senza nome non vuol dire niente: si legge «6.823,82 €»
            e ci si chiede di cosa. */}
        <span className="inv-valore" title="Somma del costo di tutto quello che c'è in magazzino">
          💶 <span className="inv-valore-eti">Valore magazzino</span>{' '}
          <strong>{formatPrice(totalValue)}</strong>
        </span>

        <span className="inv-testa-spinta" />

        {/* Card o lista: due icone, non due tasti con su scritto cosa fanno.
            È una scelta che si fa una volta e resta. */}
        <div className="inv-vista" role="group" aria-label="Come mostrare i prodotti">
          {[
            ['card', '▦', 'A card'],
            ['lista', '☰', 'A lista'],
          ].map(([k, icona, titolo]) => (
            <button
              key={k}
              type="button"
              className={`chip${invView === k ? ' active' : ''}`}
              onClick={() => setInvView(k)}
              title={titolo}
              aria-label={titolo}
              aria-pressed={invView === k}
            >
              {icona}
            </button>
          ))}
        </div>

        <button
          className="btn small"
          disabled={bloccato}
          title={bloccato ? 'Prima va aggiornato il magazzino alla nuova gestione' : undefined}
          onClick={() => setEditing('new')}
        >
          + Nuovo prodotto
        </button>
      </div>

      {/* Categorie a SINISTRA (come il POS), il resto a destra. Si prende
          quello che resta dell'altezza: a scorrere è la lista dei prodotti,
          non la pagina — prima, per tornare alla ricerca dopo aver guardato
          in fondo, si risaliva da capo. */}
      <CategoryRail
        items={catItems}
        selected={categoryFilter}
        onSelect={setCategoryFilter}
        pieno
        chiave="inv-categorie"
      >

      {error && <div className="banner" style={{ marginTop: 8 }}>Errore: {error}</div>}
      {loading && <div className="empty">Carico l’inventario…</div>}

      {/* LA LEGENDA DEI DUE SEGNI. È nata da una domanda vera di Flavio
          (vocale del 20/08): «perché alcune cose hanno questa bacchettina
          davanti — rossa, blu, oppure non ce l'hanno?». Quattro colori
          senza spiegazione sono un codice segreto: la spiegazione sta
          QUI, sotto gli occhi, non in un manuale. Una riga sola, smorzata,
          che va a capo da sé sul telefono. */}
      {!loading && (
        <div className="inv-legenda muted small">
          <span className="inv-legenda-gruppo">
            <span className="dot dot-ok" aria-hidden /> c’è
            <span className="dot dot-low" aria-hidden /> in esaurimento
            <span className="dot dot-empty" aria-hidden /> esaurito
          </span>
          <span className="inv-legenda-gruppo">
            <span className="tacca tacca-linea" aria-hidden /> in linea
            <span className="tacca tacca-premium" aria-hidden /> premium
            <span className="tacca tacca-out" aria-hidden /> fuori (OUT)
            <span className="tacca tacca-assortimento" aria-hidden /> in assortimento
          </span>
        </div>
      )}

      {/* TABELLA: colonne allineate (stato · prodotto · categoria · netto ·
          +IVA · scorte), riga cliccabile per aprire le azioni. */}
      {invView === 'lista' && (
        <div className={`inv-list inv-table${mostraPrevisione ? ' con-previsione' : ''}`}>
          <div className="inv-thead">
            <span aria-hidden />
            <SortTh label="Prodotto" col="name" sort={sort} onSort={toggleSort} />
            <SortTh label="Categoria" col="cat" sort={sort} onSort={toggleSort} />
            <SortTh label="IVA esclusa" col="net" sort={sort} onSort={toggleSort} num />
            <SortTh label="IVA inclusa" col="gross" sort={sort} onSort={toggleSort} num />
            <SortTh label="€/cl" col="percl" sort={sort} onSort={toggleSort} num />
            <SortTh label="Scorte" col="stock" sort={sort} onSort={toggleSort} num />
            {mostraPrevisione && (
              <SortTh label="A fine serata" col="previsto" sort={sort} onSort={toggleSort} num />
            )}
          </div>
          {sortedVisible.map((it) => {
            const st = stockStatus(it)
            const expanded = expandedId === it.id
            const bs = bottleSummary(it)
            const perCl = costPerUnit(it, 'cl') // già IVA inclusa
            return (
              /* DUE SEGNI, DUE COSE. Il PALLINO dice quanta roba c'è
                 (verde/arancione/rosso), la STRISCIA che assortimento è —
                 in linea, premium, in assortimento, fuori. Prima dicevano
                 tutti e due la stessa cosa, e l'assortimento si leggeva
                 solo dai bollini accanto al nome. */
              <div
                className={`inv-row ass-${assortimentoDi(it)}${expanded ? ' open' : ''}`}
                key={it.id}
                title={ETICHETTA_ASSORTIMENTO[assortimentoDi(it)]}
              >
                <button
                  type="button"
                  className="inv-row-main"
                  onClick={() => {
                    setExpandedId(expanded ? null : it.id)
                    setCaricoFor(null)
                  }}
                >
                  <span className={`dot dot-${st}`} />
                  <span className="inv-row-name">
                    {it.name}
                    <SegnoAssortimento item={it} />
                    <SegnoSchedaDaCompletare item={it} />
                  </span>
                  <span className="muted small inv-row-cat">{catName(it.category_id) || '—'}</span>
                  <span className="inv-cell-num">{it.cost != null ? formatPrice(it.cost) : '—'}</span>
                  <span className="inv-cell-num muted">{it.cost != null ? formatPrice(costWithVat(it.cost, it.vat)) : '—'}</span>
                  <span className="inv-cell-num muted">{perCl != null ? formatPrice(perCl) : '—'}</span>
                  <span className="inv-cell-num inv-row-stock">
                    {bs ? (
                      <>
                        {/* SOLO IL NUMERO. «piena / aperta 46 cl /
                            esaurito» raccontava lo stato della bottiglia,
                            che col conteggio a pezzi è già nel numero:
                            «0,5 pz» dice da sé che è mezza, «0 pz» che è
                            finita. Il dettaglio delle bottiglie resta
                            aperto sotto, per chi va a contarle. */}
                        {formatPezzi(bs.pezzi)} pz
                      </>
                    ) : (
                      fmtItem(it.stock, it)
                    )}
                  </span>
                  {mostraPrevisione && <CellaFineSerata item={it} impegnato={impegnato[it.id]} />}
                </button>
                {expanded && itemActions(it, bottleBreakdown(it))}
              </div>
            )
          })}
        </div>
      )}

      {/* Card compatte in griglia (stessa UX delle card ordini): striscia
          colorata per lo stato scorte, dettagli e azioni a scomparsa. */}
      {invView === 'card' && (
      <div className="admin-grid">
        {visible.map((it) => {
          const st = stockStatus(it)
          const expanded = expandedId === it.id
          return (
            <div className={`card grid-card admin-card ass-${assortimentoDi(it)}`} key={it.id}>
              <div
                className="grid-card-main"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setExpandedId(expanded ? null : it.id)
                  setCaricoFor(null)
                }}
              >
                <div className="row between" style={{ alignItems: 'flex-start', gap: 6 }}>
                  <strong style={{ fontSize: '0.92rem', lineHeight: 1.25 }}>
                    {it.name} <SegnoAssortimento item={it} />
                    <SegnoSchedaDaCompletare item={it} />
                  </strong>
                  <span className={`dot dot-${st}`} title={STATUS_LABEL[st] || 'ok'} />
                </div>
                <div className="row between" style={{ alignItems: 'baseline' }}>
                  <span className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {catName(it.category_id) || 'Senza categoria'}
                    {supNames(it) ? ` · ${supNames(it)}` : ''}
                  </span>
                  {(() => {
                    // Item da drink: bottiglie (pezzi) come numero grande, il
                    // CONTENUTO in cl/ml sotto — totale e residuo dell'aperta.
                    const bs = bottleSummary(it)
                    return (
                      <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span className="grid-card-tot" style={{ fontSize: '1.05rem' }}>
                          {bs ? `${formatPezzi(bs.pezzi)} pz` : fmtItem(it.stock, it)}
                        </span>
                        {bs && (
                          <span className="muted small" style={{ display: 'block' }}>
                            {bs.total}
                          </span>
                        )}
                        <PrevisioneCard item={it} impegnato={impegnato[it.id]} />
                      </span>
                    )
                  })()}
                </div>
              </div>
              <button
                type="button"
                className="grid-card-toggle"
                onClick={() => {
                  setExpandedId(expanded ? null : it.id)
                  setCaricoFor(null)
                }}
                aria-expanded={expanded}
              >
                {expanded ? '▴ Chiudi' : '⋯ Azioni'}
              </button>
              {expanded && itemActions(it, bottleBreakdown(it))}
            </div>
          )
        })}
      </div>
      )}

      {!loading && items.length === 0 && (
        <div className="empty">Nessun prodotto in inventario. Aggiungine uno!</div>
      )}
      {!loading && items.length > 0 && visible.length === 0 && (
        <div className="empty">Nessun prodotto corrisponde ai filtri.</div>
      )}

      </CategoryRail>

    </div>
  )
}

// --- Gestione categorie inventario --------------------------------------

function InvCategoryManager({ categories, macros = [], onChange }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const indice = useMemo(() => indiceMacro(macros), [macros])

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await createInventoryCategory({ name: name.trim(), sort_order: categories.length })
      setName('')
      await onChange()
    } finally {
      setBusy(false)
    }
  }
  async function rename(c) {
    const n = prompt('Nuovo nome categoria:', c.name)
    if (n == null || !n.trim()) return
    await updateInventoryCategory(c.id, { name: n.trim() })
    await onChange()
  }
  async function remove(c) {
    if (!confirm(`Eliminare la categoria “${c.name}”? I prodotti resteranno, senza categoria.`)) return
    await deleteInventoryCategory(c.id)
    await onChange()
  }
  async function move(idx, dir) {
    const j = idx + dir
    if (j < 0 || j >= categories.length) return
    const a = categories[idx]
    const b = categories[j]
    await Promise.all([
      updateInventoryCategory(a.id, { sort_order: b.sort_order }),
      updateInventoryCategory(b.id, { sort_order: a.sort_order }),
    ])
    await onChange()
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuova categoria (es. Distillati)" />
        <button className="btn small" onClick={add} disabled={busy}>Aggiungi</button>
      </div>
      {categories.length === 0 && (
        <div className="muted small" style={{ marginTop: 8 }}>Nessuna categoria.</div>
      )}
      {categories.map((c, idx) => (
        <div className="row between" key={c.id} style={{ marginTop: 8 }}>
          <span className="row" style={{ gap: 8, alignItems: 'center' }}>
            {c.name}
            <EtichettaMacro macro={macroDiCategoria(c, indice)} />
          </span>
          <span className="row" style={{ gap: 4 }}>
            <button className="btn ghost small" onClick={() => move(idx, -1)} disabled={idx === 0}>↑</button>
            <button className="btn ghost small" onClick={() => move(idx, 1)} disabled={idx === categories.length - 1}>↓</button>
            <button className="btn ghost small" onClick={() => rename(c)}>✏️</button>
            <button className="btn ghost small" onClick={() => remove(c)}>🗑</button>
          </span>
        </div>
      ))}
    </div>
  )
}

// --- Gestione fornitori --------------------------------------------------

function SupplierManager({ suppliers, onChange, onListino = null }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  // OGNI FORNITORE HA UN COLORE (REQ-MAG-029): è quello che distingue i
  // doppioni nella lista degli ordini, dove lo stesso Campari compare una
  // volta per fornitore. Si propone a caso e si può cambiare a mano.
  const [colore, setColore] = useState(coloreACaso)
  const [tavolozzaPer, setTavolozzaPer] = useState(null) // id fornitore | 'nuovo'

  // Import in blocco (es. dall'Excel): un fornitore per riga, ";email"
  // opzionale. I nomi già presenti vengono saltati.
  async function importList() {
    const rows = parseSupplierList(importText)
    if (rows.length === 0) return
    setBusy(true)
    try {
      const existing = new Set(suppliers.map((s) => s.name.toLowerCase()))
      let added = 0
      for (const r of rows) {
        if (existing.has(r.name.toLowerCase())) continue
        await createSupplier({
          name: r.name,
          sort_order: suppliers.length + added,
          ...(r.email ? { email: r.email } : {}),
        })
        added += 1
      }
      toastSuccess(`Importati ${added} fornitori${rows.length - added > 0 ? ` (${rows.length - added} già presenti)` : ''}`)
      setImportText('')
      setShowImport(false)
      await onChange()
    } catch (e) {
      toastError(`Import fornitori: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const creato = await createSupplier({
        name: name.trim(),
        sort_order: suppliers.length,
        color: colore,
      })
      setName('')
      // Il prossimo fornitore nasce con un altro colore: due creati di
      // fila con lo stesso non si distinguerebbero proprio dove serve.
      setColore(coloreACaso())
      setTavolozzaPer(null)
      await onChange()
      // «Quando creo un fornitore mi si deve aprire una pagina dove posso
      // associare i prodotti» (l'utente, 27/08/2026): un fornitore appena
      // creato è un fornitore da cui non si sa ancora cosa si compra, e
      // quello è il lavoro che viene subito dopo.
      if (creato?.id && onListino) onListino(creato.id)
    } finally {
      setBusy(false)
    }
  }

  async function cambiaColore(s, nuovo) {
    setTavolozzaPer(null)
    await updateSupplier(s.id, { color: nuovo })
    await onChange()
  }
  async function rename(s) {
    const n = prompt('Nuovo nome fornitore:', s.name)
    if (n == null || !n.trim()) return
    await updateSupplier(s.id, { name: n.trim() })
    await onChange()
  }
  // Email per l'invio degli ordini d'acquisto (bottone 📧 negli Ordini).
  async function setEmail(s) {
    const e = prompt(`Email di ${s.name} (per inviare gli ordini):`, s.email || '')
    if (e == null) return
    await updateSupplier(s.id, { email: e.trim() || null })
    await onChange()
  }
  async function remove(s) {
    if (!confirm(`Eliminare il fornitore “${s.name}”? I prodotti resteranno, senza fornitore.`)) return
    await deleteSupplier(s.id)
    await onChange()
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <PastigliaColore
          colore={colore}
          etichetta="Colore del nuovo fornitore"
          onClick={() => setTavolozzaPer((v) => (v === 'nuovo' ? null : 'nuovo'))}
        />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuovo fornitore (es. NOVA)" />
        <button className="btn small" onClick={add} disabled={busy}>Aggiungi</button>
      </div>
      {tavolozzaPer === 'nuovo' && (
        <Tavolozza scelto={colore} onScegli={(c) => { setColore(c); setTavolozzaPer(null) }} />
      )}
      <button
        className="btn ghost small block"
        style={{ marginTop: 8 }}
        onClick={() => setShowImport((v) => !v)}
      >
        📥 Importa elenco (incolla, uno per riga)
      </button>
      {showImport && (
        <div style={{ marginTop: 6 }}>
          <textarea
            rows={5}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'NOVA' + String.fromCharCode(10) + 'ENOFEL;ordini@enofel.it' + String.fromCharCode(10) + 'FONT'}
            style={{ width: '100%' }}
          />
          <button className="btn small block" style={{ marginTop: 6 }} disabled={busy} onClick={importList}>
            Importa
          </button>
        </div>
      )}
      {suppliers.length === 0 && (
        <div className="muted small" style={{ marginTop: 8 }}>Nessun fornitore.</div>
      )}
      {suppliers.map((s) => (
        <div key={s.id}>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="row" style={{ gap: 8, alignItems: 'center', minWidth: 0 }}>
              <PastigliaColore
                colore={coloreFornitore(s)}
                etichetta={`Colore di ${s.name}`}
                onClick={() => setTavolozzaPer((v) => (v === s.id ? null : s.id))}
              />
              <span>
                {s.name}
                {s.email && <span className="muted small"> · {s.email}</span>}
              </span>
            </span>
            <span className="row" style={{ gap: 4 }}>
              {onListino && (
                <button
                  className="btn ghost small"
                  aria-label={`Listino di ${s.name}`}
                  onClick={() => onListino(s.id)}
                >
                  📋 Listino
                </button>
              )}
              <button className="btn ghost small" title="Email per gli ordini" onClick={() => setEmail(s)}>📧</button>
              <button className="btn ghost small" onClick={() => rename(s)}>✏️</button>
              <button className="btn ghost small" onClick={() => remove(s)}>🗑</button>
            </span>
          </div>
          {tavolozzaPer === s.id && (
            <Tavolozza scelto={coloreFornitore(s)} onScegli={(c) => cambiaColore(s, c)} />
          )}
        </div>
      ))}
    </div>
  )
}

// Il segno del colore del fornitore: la stessa pastiglia tonda dei pallini
// della scorta, ma qui dice CHI vende, non quanto ce n'è.
function PastigliaColore({ colore, etichetta, onClick }) {
  return (
    <button
      type="button"
      className="btn ghost small"
      aria-label={etichetta}
      title={etichetta}
      onClick={onClick}
      style={{ padding: 4, lineHeight: 0 }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: colore || 'transparent',
        }}
      />
    </button>
  )
}

function Tavolozza({ scelto, onScegli }) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {COLORI_FORNITORE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Colore ${c}`}
          onClick={() => onScegli(c)}
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: c,
            border: c === scelto ? '2px solid var(--text)' : '1px solid var(--line)',
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  )
}

// LA SCATOLA DEL TRAVASO: sempre la stessa, cambia solo cosa c'è dentro.
// `onFuori` c'è soltanto dove si può chiudere toccando accanto — mentre il
// magazzino si sta aggiornando no, che sarebbe un modo di interromperlo
// senza volerlo.
function RiquadroTravaso({ titolo, onFuori, children }) {
  return (
    <div className="overlay confirm-overlay" onClick={onFuori}>
      <div
        className="confirm-box"
        role="dialog"
        aria-label={titolo}
        onClick={onFuori ? (e) => e.stopPropagation() : undefined}
      >
        {children}
      </div>
    </div>
  )
}

// --- IL TRAVASO AL MODELLO A PEZZI, IN MANO A CHI LAVORA ----------------
//
// «Quando entra in magazzino un banner gli dice che deve iniziare la
// migrazione dei dati alla nuova gestione magazzino. Quando preme ok, parte
// prima un dry run che lo avvisa dei prodotti che devono essere sistemati
// prima, e poi, se tutto è come se lo aspetta, allora chiede conferma e
// migra i dati» (18/08). Niente di automatico: il database lo cambia un
// gesto, e prima di quel gesto si vede cosa cambia.
//
// Se non c'è niente da fare qui non compare NIENTE: la schermata è quella
// normale, senza traccia di tutta questa faccenda.
function PannelloTravaso({ travaso, passo, avanzamento, esito, onProva, onChiudi, onConferma }) {
  if (travaso.fatto && passo !== 'fatto' && passo !== 'interrotto') return null
  const { daMigrare, daSistemare } = travaso
  const pronti = daSistemare.length === 0

  return (
    <>
      {!travaso.fatto && (
        <div className="banner" style={{ marginBottom: 10 }}>
          <strong>Il magazzino va aggiornato.</strong> Da questa versione tutto
          si conta a <strong>pezzi</strong>: {daMigrare.length > 0 && `${daMigrare.length} prodotti`}
          {daMigrare.length > 0 && daSistemare.length > 0 && ' e '}
          {daSistemare.length > 0 && `${daSistemare.length} da sistemare a mano`}
          {' '}
          {daMigrare.length + daSistemare.length === 1 ? 'aspetta' : 'aspettano'} il passaggio.
          Fino ad allora i numeri si leggono già giusti, ma non si può caricare,
          contare né aggiungere prodotti.
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn small" onClick={onProva}>
              Guarda cosa cambia
            </button>
          </div>
        </div>
      )}

      {passo === 'prova' && (
        <RiquadroTravaso titolo="Cosa cambia aggiornando il magazzino" onFuori={onChiudi}>
          <h3 style={{ marginTop: 0 }}>Cosa cambia</h3>
          {/* PRIMA UNA PROVA A VUOTO: qui non si scrive niente. */}
          <p className="small" style={{ marginTop: 0 }}>
            Per adesso non cambia niente: questo è solo l&apos;elenco.
          </p>

          {daSistemare.length > 0 ? (
            <>
              <h4 style={{ margin: '14px 0 2px' }}>
                ⚠️ Da sistemare prima ({daSistemare.length})
              </h4>
              <p className="small" style={{ margin: '0 0 6px' }}>
                Di questi non si sa a quanto corrisponde un pezzo, e nessuno
                può indovinarlo. Aprili, scrivilo, e poi torna qui.
              </p>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {daSistemare.map((it) => (
                  <li key={it.id}>
                    <strong>{it.name}</strong>{' '}
                    <span className="muted">{motivoNonMigrabile(it)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h4 style={{ margin: '14px 0 2px' }}>
                ✅ Si aggiornano {daMigrare.length} prodotti
              </h4>
              <p className="small" style={{ margin: '0 0 6px' }}>
                Le giacenze passano a pezzi: quello che oggi si legge sullo
                schermo è già il numero giusto, e resterà scritto così.
                Prezzi, ricette e menù non si toccano.
              </p>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {daMigrare.slice(0, 8).map((it) => (
                  <li key={it.id}>
                    {it.name}{' '}
                    <span className="muted">
                      {formatQty(it.formaVecchia.stock, baseUnit(it.formaVecchia.unit))} →{' '}
                      {formatPezzi(it.stock)} pz
                    </span>
                  </li>
                ))}
              </ul>
              {daMigrare.length > 8 && (
                <p className="muted small" style={{ margin: '4px 0 0' }}>
                  … e altri {daMigrare.length - 8}.
                </p>
              )}
            </>
          )}

          <div className="grid-2" style={{ marginTop: 16 }}>
            <button type="button" className="btn ghost" onClick={onChiudi}>
              {pronti ? 'Non adesso' : 'Chiudi'}
            </button>
            {pronti && (
              <button type="button" className="btn" onClick={onConferma}>
                Aggiorna {daMigrare.length} prodotti
              </button>
            )}
          </div>
        </RiquadroTravaso>
      )}

      {passo === 'rileggo' && (
        <RiquadroTravaso titolo="Sto guardando il magazzino">
          <h3 style={{ marginTop: 0 }}>Sto guardando…</h3>
          <p className="small" style={{ margin: 0 }}>
            Un momento: rileggo i prodotti, così l&apos;elenco dice come
            stanno le cose adesso.
          </p>
        </RiquadroTravaso>
      )}

      {passo === 'corso' && (
        <RiquadroTravaso titolo="Aggiornamento del magazzino">
          <h3 style={{ marginTop: 0 }}>Sto aggiornando…</h3>
          {/* A LOTTI, e si vede: una schermata ferma al banco vuol dire
              «è bloccata». Se si interrompe si può ricominciare, che
              ogni giro guarda cos'è rimasto da fare. */}
          <p className="small" style={{ margin: 0 }}>
            {avanzamento.fatti} di {avanzamento.totale}. Puoi ricominciare
            da qui se si interrompe: riprende da dov&apos;era.
          </p>
        </RiquadroTravaso>
      )}

      {passo === 'fatto' && (
        <RiquadroTravaso titolo="Aggiornamento del magazzino">
          <h3 style={{ marginTop: 0 }}>✅ Magazzino aggiornato</h3>
          <p className="small" style={{ margin: 0 }}>
            {esito?.travasati ?? avanzamento.totale} prodotti si contano a
            pezzi. Carico, conta e prodotti nuovi sono di nuovo a posto.
          </p>
          {/* CHI NON C'È PIÙ NON È UN ERRORE, ma va detto: un prodotto
              cancellato da un altro terminale mentre l'aggiornamento
              girava semplicemente non c'è, e si va avanti. */}
          {esito?.saltati > 0 && (
            <p className="small" style={{ margin: '8px 0 0' }}>
              {esito.saltati === 1
                ? 'Un prodotto non c’è più: è stato saltato.'
                : `${esito.saltati} prodotti non ci sono più: sono stati saltati.`}{' '}
              Gli altri sono a posto.
            </p>
          )}
          {esito?.bloccati > 0 && (
            <p className="small" style={{ margin: '8px 0 0' }}>
              {esito.bloccati === 1
                ? 'Un prodotto non si è aggiornato'
                : `${esito.bloccati} prodotti non si sono aggiornati`}
              : riprova fra un momento, non fa danni — quelli già
              aggiornati restano come sono.
            </p>
          )}
          <button type="button" className="btn block" style={{ marginTop: 16 }} onClick={onChiudi}>
            Chiudi
          </button>
        </RiquadroTravaso>
      )}

      {passo === 'interrotto' && (
        <RiquadroTravaso titolo="Aggiornamento del magazzino">
          <h3 style={{ marginTop: 0 }}>L&apos;aggiornamento si è fermato</h3>
          <p className="small" style={{ margin: 0 }}>
            {avanzamento.fatti > 0
              ? `${avanzamento.fatti} prodotti sono stati aggiornati e restano così.`
              : 'Non è stato aggiornato niente.'}{' '}
            Il resto è rimasto com&apos;era: puoi riprovare quando vuoi,
            non fa danni — riprende da dove si era fermato.
          </p>
          <button type="button" className="btn block" style={{ marginTop: 16 }} onClick={onChiudi}>
            Chiudi
          </button>
        </RiquadroTravaso>
      )}
    </>
  )
}

// --- Contenuto reale (rettifica giacenza) -------------------------------
// Anche la rettifica è una movimentazione, e come tutte chiede in che unità
// si sta contando: a PEZZI, che è come si conta la giacenza, o nell'unità
// del contenuto (i cl rimasti nella bottiglia aperta). Il valore si converte
// nell'unità della giacenza solo al salvataggio.
function RettificaForm({ item, onCancel, onConfirm }) {
  const units = unitaMovimento(item)
  const [unit, setUnit] = useState(units[0])
  const [val, setVal] = useState(() => String(fromStockUnit(item.stock, units[0], item)))

  function changeUnit(u) {
    // Mantiene la quantità reale, cambiando solo come la si esprime.
    const inGiacenza = qtyInStockUnit(Number(String(val).replace(',', '.')) || 0, unit, item)
    setUnit(u)
    setVal(String(fromStockUnit(inGiacenza, u, item)))
  }
  function confirm() {
    const n = Number(String(val).replace(',', '.'))
    if (Number.isNaN(n) || n < 0) return
    onConfirm(qtyInStockUnit(n, unit, item))
  }

  return (
    <div style={{ marginTop: 8 }}>
      <label htmlFor={`rt-${item.id}`}>Contenuto effettivo di “{item.name}”</label>
      <div className="row" style={{ gap: 6 }}>
        <input
          id={`rt-${item.id}`}
          type="number"
          step="any"
          min="0"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          autoFocus
          style={{ flex: 1 }}
        />
        {units.length > 1 ? (
          <select
            value={unit}
            onChange={(e) => changeUnit(e.target.value)}
            aria-label="Unità della conta"
            style={{ width: 80 }}
          >
            {units.map((u) => (
              <option key={u} value={u}>{UNIT_LABEL[u.toLowerCase()] || u}</option>
            ))}
          </select>
        ) : (
          <span className="chip" style={{ cursor: 'default' }}>{unit}</span>
        )}
      </div>
      <p className="muted small" style={{ margin: '4px 0 0' }}>
        Quantità totale in giacenza dopo la conta (sostituisce quella attuale).
      </p>
      <div className="grid-2" style={{ marginTop: 10 }}>
        <button className="btn ghost small" onClick={onCancel}>Annulla</button>
        <button className="btn small" onClick={confirm}>Salva contenuto</button>
      </div>
    </div>
  )
}

// --- Form di carico -----------------------------------------------------

function CaricoForm({ item, onCancel, onConfirm }) {
  // OGNI MOVIMENTO CHIEDE IN CHE UNITÀ. La cassetta di limoni si carica a
  // chili — nessuno li conta a uno a uno — e la stessa cassetta in magazzino
  // sono pezzi: la conversione la fa il contenuto di un pezzo, non chi
  // scrive. Con un'unità sola non c'è niente da chiedere e il campo resta
  // com'era (REQ-MAG-016).
  const unita = unitaMovimento(item)
  const [unit, setUnit] = useState(unita[0])
  const [count, setCount] = useState('')

  // Costo al carico (bidirezionale): il fornitore spesso scarica il prezzo del
  // COLLO/CARTONE. Si inserisce l'unitario OPPURE il totale del collo (sapendo
  // quanti pezzi ci sono) e l'altro si ricalcola. Il "pezzi per collo" è solo
  // per il calcolo, non viene salvato.
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
  const num = (v) => Number(String(v).replace(',', '.')) || 0
  const [unitCost, setUnitCost] = useState(item.cost != null ? String(item.cost) : '')
  const [perCollo, setPerCollo] = useState('')
  const [colloTot, setColloTot] = useState('')
  // Quanti cartoni si stanno caricando: i pezzi li riempie lui.
  const [cartoni, setCartoni] = useState('')
  // IL COLLO E' UN'ECCEZIONE, NON LA REGOLA. Chi carica due bottiglie prese
  // dal fornitore sotto casa non ha nessun cartone da dichiarare, e si
  // trovava tre campi in piu' da capire. Sta dietro un interruttore: da
  // spento la scheda e' quella di sempre — quanti pezzi, e il prezzo.
  const [aColli, setAColli] = useState(false)

  // A COLLI LA QUANTITÀ NON È UNO STATO: è cartoni × pezzi per collo, e basta.
  // Quando la si teneva scritta a parte bisognava ricordarsi di rifarla a ogni
  // campo toccato — e chi si dimenticava caricava il numero di prima.
  const quantita = aColli ? String(num(cartoni) * num(perCollo) || '') : count

  const onUnit = (v) => {
    setUnitCost(v)
    const p = num(perCollo)
    if (p > 0) setColloTot(num(v) > 0 ? String(r2(num(v) * p)) : '')
  }
  const onCollo = (v) => {
    setPerCollo(v)
    const p = num(v)
    if (p <= 0) return
    if (num(unitCost) > 0) setColloTot(String(r2(num(unitCost) * p)))
    else if (num(colloTot) > 0) setUnitCost(String(r2(num(colloTot) / p)))
  }
  const onTot = (v) => {
    setColloTot(v)
    const p = num(perCollo)
    if (p > 0) setUnitCost(num(v) > 0 ? String(r2(num(v) / p)) : '')
  }

  const unitN = num(unitCost)
  const perN = num(perCollo)
  // A colli si contano PEZZI, sempre: un cartone ha dentro pezzi, non
  // centilitri. Cambiare unità mentre il conto lo fa il collo darebbe una
  // quantità che non torna con quello che è arrivato.
  const unitEffettiva = aColli ? 'pz' : unit
  const etichettaUnita = UNIT_LABEL[String(unitEffettiva).toLowerCase()] || unitEffettiva

  function confirm() {
    const n = num(quantita)
    const newCost = unitCost !== '' && unitN >= 0 && r2(unitN) !== Number(item.cost) ? r2(unitN) : null
    if (!(n > 0) && newCost == null) return
    onConfirm({ count: n, unit: unitEffettiva, newCost })
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* IL COLLO STA SOPRA, perché è da lì che si parte: si guarda il
          cartone, si scrive quanti pezzi ha e quanti ne sono arrivati, e la
          quantità si riempie da sé. Prima i suoi campi stavano in fondo,
          dentro il riquadro del prezzo, e i pezzi andavano scritti a mano
          sperando che il conto tornasse. */}
      <label className="row between" style={{ alignItems: 'center', gap: 8 }}>
        <span>
          Carico a colli
          <span className="muted small"> — un cartone, una cassa</span>
        </span>
        <input
          type="checkbox"
          className="toggle"
          checked={aColli}
          onChange={(e) => {
            setAColli(e.target.checked)
            // Tornando a mano il numero calcolato RESTA scritto, e diventa
            // modificabile: farlo sparire sotto le dita vorrebbe dire
            // ricontare i pezzi già contati.
            if (!e.target.checked) {
              setCount(quantita)
              setCartoni('')
            }
          }}
        />
      </label>

      {aColli && (
        <div className="card" style={{ marginTop: 8, padding: 10 }}>
          <div className="grid-2">
            <div>
              <label htmlFor="cf-collo">Pezzi per collo</label>
              <input
                id="cf-collo"
                type="number"
                step="any"
                min="0"
                value={perCollo}
                onChange={(e) => onCollo(e.target.value)}
                placeholder="Es. 24"
              />
            </div>
            <div>
              <label htmlFor="cf-cartoni">Quanti colli arrivano?</label>
              <input
                id="cf-cartoni"
                type="number"
                step="1"
                min="0"
                value={cartoni}
                onChange={(e) => setCartoni(e.target.value)}
                placeholder="Es. 2"
              />
            </div>
          </div>
          <label htmlFor="cf-tot" style={{ marginTop: 6 }}>Totale collo (€, netto)</label>
          <input
            id="cf-tot"
            type="number"
            step="any"
            min="0"
            value={colloTot}
            onChange={(e) => onTot(e.target.value)}
            placeholder="Prezzo del cartone dal fornitore"
          />
          {perN > 0 && num(cartoni) > 0 && (
            <div className="muted small" style={{ marginTop: 4 }}>
              {num(cartoni)} × {perN} = <strong>{num(cartoni) * perN} pz</strong>
            </div>
          )}
        </div>
      )}

      {/* A colli la quantità la fa il conto: si legge, non si scrive.
          Cambiarla a mano vorrebbe dire caricare un numero che non torna
          con quello che è arrivato. */}
      <label htmlFor="cf-pezzi" style={{ marginTop: 8 }}>Quanto aggiungi?</label>
      <div className="row" style={{ gap: 6 }}>
        <input
          id="cf-pezzi"
          type="number"
          step="any"
          min="0"
          className="grow"
          value={quantita}
          onChange={(e) => setCount(e.target.value)}
          readOnly={aColli}
          aria-readonly={aColli}
          autoFocus={!aColli}
        />
        {unita.length > 1 && !aColli ? (
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            aria-label="Unità del carico"
            style={{ width: 80 }}
          >
            {unita.map((u) => (
              <option key={u} value={u}>{UNIT_LABEL[u.toLowerCase()] || u}</option>
            ))}
          </select>
        ) : (
          <span className="chip" style={{ cursor: 'default' }}>{etichettaUnita}</span>
        )}
      </div>
      {/* Quanto entra davvero in giacenza, quando non si carica a pezzi:
          la merce a peso si conta in pezzi per stima, e il numero va visto
          PRIMA di confermare. */}
      {unitEffettiva !== 'pz' && num(quantita) > 0 && (
        <div className="muted small" style={{ marginTop: 4 }}>
          In magazzino entrano{' '}
          <strong>{formatPezzi(qtyInStockUnit(num(quantita), unitEffettiva, item))} pz</strong>
          {(item.content_unit || item.unit) === 'g' && ' (stima: il peso non fa pezzi esatti)'}
        </div>
      )}

      {/* Prezzo: unitario ↔ totale collo (per confrontare col fornitore) */}
      <div className="card" style={{ marginTop: 10, padding: 10 }}>
        <div className="muted small">💶 Prezzo — aggiorna se il fornitore l'ha cambiato</div>
        <label htmlFor="cf-unit" style={{ marginTop: 6 }}>Costo unitario (€, netto)</label>
        <input id="cf-unit" type="number" step="any" min="0" value={unitCost} onChange={(e) => onUnit(e.target.value)} />
        {unitN > 0 && (
          <div className="muted small" style={{ marginTop: 4 }}>
            Unitario +IVA {formatPrice(costWithVat(unitN, item.vat))}
            {aColli && perN > 0 && ` · Totale collo +IVA ${formatPrice(costWithVat(unitN * perN, item.vat))}`}
          </div>
        )}
      </div>

      <div className="grid-2" style={{ marginTop: 10 }}>
        <button className="btn ghost small" onClick={onCancel}>Annulla</button>
        <button className="btn small" onClick={confirm}>Conferma carico</button>
      </div>
    </div>
  )
}

// --- Form prodotto (creazione + modifica) -------------------------------

// ── L'UNITÀ È SEMPRE IL PEZZO ────────────────────────────────────────
//
// La scheda ha fatto due giri di troppo: prima chiedeva l'unità d'acquisto a
// famiglie (litri, chili, unità generiche), poi «che tipo di prodotto è?» con
// quattro card. Tutte e due le domande facevano la stessa cosa sbagliata:
// costringevano a dichiarare, una volta per tutte, come si vende una cosa che
// si vende in più modi — il Jägermeister va nel Jägerbombo E si serve a
// cicchetto, mai la bottiglia intera (Flavio, 18/08).
//
// Adesso non si sceglie più niente: l'unità è il PEZZO, fissa e bloccata, e
// la sola domanda che resta è «a quanto corrisponde un pezzo» — una capacità
// (l, cl, ml), un peso (kg, g) o la «U» non definita. Le unità sono queste e
// basta: «potremmo caricare tantissime cose con tantissime unità di misura
// che non sappiamo, e non ce le possiamo mettere a creare ogni volta».
//
// A dire come si usa la merce è la RICETTA, che dosa a pezzi o nell'unità del
// contenuto; la giacenza invece non cambia mai unità, resta in pezzi.
const CONTENUTO_UNITA = [
  ['l', 'L'],
  ['cl', 'cl'],
  ['ml', 'ml'],
  ['kg', 'kg'],
  ['g', 'g'],
  ['U', 'U'],
]

// ── COME SI COMPILA UNA SCHEDA PRODOTTO ──────────────────────────────
//
// I tre livelli, che sono il modello intero: il PEZZO è quello che si prende
// in mano, il CONTENUTO dice a quanto corrisponde, il COLLO quanti pezzi ci
// sono nella confezione che si compra. Il testo è asciutto di proposito: chi
// lo apre sta compilando, non leggendo (REQ-MAG-016).
function AiutoProdotto({ onClose }) {
  return (
    <div className="overlay confirm-overlay" onClick={onClose}>
      <div
        className="confirm-box"
        role="dialog"
        aria-label="Come si compila questa scheda"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Come si compila questa scheda</h3>

        <h4 style={{ margin: '14px 0 2px' }}>Si conta sempre a pezzi</h4>
        <p className="small" style={{ margin: 0 }}>
          Il pezzo è quello che si prende in mano: un cubetto, un limone, una
          bottiglia, un barattolo. La giacenza è in pezzi per tutti, e non si
          sceglie: così l&apos;inventario si fa contando quello che c&apos;è
          sullo scaffale.
        </p>

        <h4 style={{ margin: '14px 0 2px' }}>A quanto corrisponde un pezzo</h4>
        <p className="small" style={{ margin: 0 }}>
          Quanto contiene: una bottiglia 70 cl, un cubetto 8 g, una confezione
          10 U. Da qui escono il costo al cl e lo scarico di quello che si
          versa. Si può lasciare vuoto: allora in ricetta si dosa solo a pezzi.
        </p>

        <h4 style={{ margin: '14px 0 2px' }}>Il collo si dichiara al carico</h4>
        <p className="small" style={{ margin: 0 }}>
          Quanti pezzi ci sono nella confezione che si compra — 24 birre, 30
          cubetti, una cassetta di limoni — si scrive quando la merce arriva,
          col prezzo del cartone: il conto al pezzo lo fa la scheda del carico.
        </p>

        <h4 style={{ margin: '14px 0 2px' }}>La merce a peso si stima</h4>
        <p className="small" style={{ margin: 0 }}>
          Comprando a chili si carica a chili, e i pezzi si ricavano dal
          contenuto: un limone non pesa sempre uguale, quindi «47 pz» è una
          stima. Va benissimo finché quello che conta davvero è il peso.
        </p>

        <button type="button" className="btn block" style={{ marginTop: 16 }} onClick={onClose}>
          Chiudi
        </button>
      </div>
    </div>
  )
}

// I prezzi si tengono ai centesimi: dividere e rimoltiplicare per il
// contenuto lasciava code di decimali che a schermo si vedevano.
const arrotonda = (n) => Math.round((Number(n) || 0) * 10000) / 10000

// ── COSA VUOL DIRE IL CONTENUTO DI UN PEZZO ──────────────────────────
//
// La domanda si legge facilmente per un'altra: «quanto ne va in un drink?».
// Sono due cose diverse — quella la decide la ricetta, drink per drink — e
// confonderle vuol dire riempire il campo con la dose di un cocktail e
// scaricare il magazzino con numeri che non tornano.
function AiutoPezzo({ onClose }) {
  return (
    <div className="overlay confirm-overlay" onClick={onClose}>
      <div
        className="confirm-box"
        role="dialog"
        aria-label="A quanto corrisponde un pezzo"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>A quanto corrisponde un pezzo</h3>
        <p className="small" style={{ marginTop: 0 }}>
          È <strong>quanto contiene</strong> un pezzo: un pz da 100 cl, un
          cubetto da 8 g, una confezione da 10 U. Non è quanto ne va in un
          drink: quello si decide nella ricetta, drink per drink.
        </p>

        <h4 style={{ margin: '14px 0 2px' }}>Se lo scrivi</h4>
        <p className="small" style={{ margin: 0 }}>
          Nelle ricette puoi scegliere l&apos;unità: a <strong>pezzi</strong>
          (una lattina intera) o nell&apos;unità del contenuto —{' '}
          <strong>cl</strong>, g, U. Versando 4 cl da un pz da 100 cl il
          magazzino scala 0,04 pezzi, e si sa quanto costa al cl.
        </p>

        <h4 style={{ margin: '14px 0 2px' }}>Se lo lasci vuoto</h4>
        <p className="small" style={{ margin: 0 }}>
          Nelle ricette si dosa <strong>solo a pezzi</strong>: è il caso della
          birra che si serve intera. Il costo resta quello del pezzo, e non
          c&apos;è nessun costo al cl da calcolare.
        </p>

        <button type="button" className="btn block" style={{ marginTop: 16 }} onClick={onClose}>
          Chiudi
        </button>
      </div>
    </div>
  )
}

function ItemForm({ initial, categories, suppliers, listini = [], defaultVat = 22, onCancel, onSave, onCreateSupplier }) {
  const isEdit = !!initial
  // L'articolo arriva SEMPRE nella forma nuova, anche quando sul database è
  // ancora scritto a litri o a «U»: a rimetterlo in riga è la lettura
  // tollerante (REQ-MAG-018). Che sia da migrare o no non si dice QUI: lo
  // dice il banner in cima al magazzino, una volta sola. Un messaggio per
  // prodotto, moltiplicato per 388, è rumore che nasconde la cosa da fare.
  //
  // DA SISTEMARE A MANO è un'altra cosa, e va detta: di questo prodotto non
  // si sa abbastanza per portarlo a pezzi, e finché non lo si scrive qui
  // l'aggiornamento del magazzino non parte. È l'unico che si può ancora
  // aprire a magazzino bloccato, perché è così che si sblocca.
  const motivoDaSistemare = isEdit ? motivoNonMigrabile(initial) : null
  // Contato ancora a volume, a peso o a «U»: oltre al contenuto va convertita
  // la giacenza, che altrimenti resterebbe scritta come se fossero pezzi.
  const daConvertire = isEdit && (initial.unit || 'pz') !== 'pz'
  const baseVecchia = daConvertire ? baseUnit(initial.unit) : 'pz'
  const [aiuto, setAiuto] = useState(false)
  const [aiutoPezzo, setAiutoPezzo] = useState(false)
  // ── IL FORNITORE CHE MANCA SI AGGIUNGE DA QUI ──────────────────────
  // Accorgersi che il fornitore non c'è mentre si compila la scheda voleva
  // dire uscire, andare in Fornitori, crearlo e tornare a ricominciare da
  // capo. Il modello ce l'abbiamo già nel modulo del drink («➕ Nuova
  // categoria…»): basta il nome, il resto dei dati aziendali si mette dopo,
  // con calma, dalla sezione Fornitori (REQ-MAG-017).
  const [nuovoFornitore, setNuovoFornitore] = useState(null) // null = tendina normale
  const [salvandoFornitore, setSalvandoFornitore] = useState(false)
  // Il salvataggio bloccato si spiega QUI, sopra i tasti, e resta finché
  // non si corregge: un toast passa e chi stava guardando la tastiera non
  // lo vede.
  const [avviso, setAvviso] = useState(null)

  // Il contenuto com'era salvato, nell'unità in cui si legge (un pezzo è
  // «70 cl», non 700 ml).
  const contFamiglia = daConvertire ? initial.unit : initial?.content_unit
  const contUnita = unitaGenerica(contFamiglia) ? 'U' : contFamiglia === 'g' ? 'g' : 'cl'
  const packIniziale = Number(initial?.package_size) || 0
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    category_id: initial?.category_id ?? '',
    // Il fornitore si legge dal LISTINO, con la compatibilità già dentro
    // (`righeDiProdotto` ricade sul vecchio campo del prodotto). Fra più
    // fornitori si propone quello dell'ULTIMO ACQUISTO, che è la stessa
    // regola degli ordini: due schermate che propongono fornitori diversi
    // per lo stesso prodotto sono due risposte alla stessa domanda.
    supplier_id: fornitoreProposto(righeDiProdotto(initial, listini))?.supplier_id ?? '',
    // IL COSTO È SEMPRE QUELLO DI UN PEZZO. Sotto resta salvato nel campo
    // `cost`, che il resto dell'app legge come «costo della confezione» da
    // sempre: con l'unità bloccata sul pezzo le due cose coincidono.
    cost: initial?.cost ?? '',
    vat: initial?.vat ?? defaultVat,
    status: initial?.status ?? 'assortimento',
    content_size: packIniziale > 0 ? String(fromBaseQty(packIniziale, contUnita)) : '',
    content_unit: contUnita,
    // La soglia si è sempre scritta in quello che si compra: adesso quello
    // che si compra è il pezzo, quindi si legge e si riscrive in pezzi.
    low_threshold: (() => {
      const soglia = Number(initial?.low_threshold) || 0
      if (!(soglia > 0)) return ''
      // Su un prodotto da sistemare la soglia è ancora nella misura vecchia:
      // riscriverla tale e quale vorrebbe dire «avvisami sotto le 700
      // bottiglie», e mezzo magazzino risulterebbe in esaurimento.
      if (daConvertire) return packIniziale > 0 ? String(soglia / packIniziale) : ''
      return String(soglia)
    })(),
    bottles: '',
    open_content: '',
  })
  // SI SCARICA DAL MAGAZZINO? Lo decide il prodotto, non la sua unità: il
  // ghiaccio si conta a unità e finisce eccome, il tempo di lavorazione sta
  // a listino ma non su nessuno scaffale. Se rispondesse sempre «sì», al
  // primo drink la manodopera andrebbe a zero e il menù direbbe
  // «Ingrediente esaurito», facendo sparire il drink dalla carta.
  const [scorta, setScorta] = useState(initial ? eScorta(initial) : true)
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const num = (v) => Number(String(v).replace(',', '.')) || 0
  const costNum = num(form.cost)
  // Il contenuto di un pezzo, in unità base della sua famiglia.
  const contenutoPezzo = toBaseQty(num(form.content_size), form.content_unit)
  const contenutoBase = baseUnit(form.content_unit)
  // I pezzi si contano davvero solo per quello che si prende in mano: se il
  // contenuto è un peso, il numero è una stima e va detto (un limone non
  // pesa sempre uguale).
  const aPeso = contenutoPezzo > 0 && contenutoBase === 'g'
  const num0 = (v) => Number(v) || 0
  // Quanto vale un pezzo nella misura in cui il prodotto è ancora scritto:
  // solo così la giacenza vecchia si può contare in pezzi. Se il contenuto
  // che si sta scrivendo è di un'altra famiglia (comprato a chili, scritto
  // in cl) non c'è conversione possibile, e il salvataggio si ferma.
  const convertibile = daConvertire && contenutoBase === baseVecchia ? contenutoPezzo : 0

  // Il fornitore appena creato resta SELEZIONATO sul prodotto che si stava
  // compilando: se toccasse riselezionarlo a mano il giro non si sarebbe
  // accorciato di niente.
  async function creaFornitore() {
    const nome = String(nuovoFornitore || '').trim()
    if (!nome || salvandoFornitore) return
    setSalvandoFornitore(true)
    try {
      const creato = await onCreateSupplier(nome)
      if (creato?.id) setForm((f) => ({ ...f, supplier_id: creato.id }))
      setNuovoFornitore(null)
    } catch (e) {
      setAvviso(`Il fornitore non si è salvato: ${e.message}`)
    } finally {
      setSalvandoFornitore(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setAvviso(null)
    setSaving(true)
    try {
      const packBase = contenutoPezzo > 0 ? contenutoPezzo : null
      const base = {
        name: form.name.trim(),
        // L'unità non si sceglie più: è il pezzo, sempre. `display_unit`
        // resta perché il resto dell'app la legge, ma dice la stessa cosa.
        unit: 'pz',
        display_unit: 'pz',
        // Il campo `tipo` della scheda a quattro card non esiste più: si
        // azzera anche sui prodotti che l'avevano, per non lasciare in giro
        // un dato che non vuol dire più niente.
        tipo: null,
        category_id: form.category_id || null,
        cost: form.cost === '' ? null : arrotonda(costNum),
        vat: Number(form.vat) || 0,
        status: form.status || 'assortimento',
        package_size: packBase,
        // Dice se quel contenuto è un volume, un peso o delle unità.
        content_unit: packBase ? contenutoBase : null,
        // La resa serviva a legare due unità d'acquisto diverse: con il pezzo
        // fisso quel legame lo dice già il contenuto, e tenerla vorrebbe dire
        // due risposte alla stessa domanda (resaUso preferisce la resa).
        resa: null,
        resa_unit: null,
        scorta,
        // La soglia si scrive in pezzi, come la giacenza.
        low_threshold: scorta ? num(form.low_threshold) : 0,
      }
      // Il fornitore viaggia a parte perché non è più un campo del
      // prodotto: chi salva ne fa una riga di listino (REQ-MAG-029).
      const scelte = { supplier_id: form.supplier_id || null }
      if (isEdit) {
        // In modifica la giacenza non si tocca: quella la muovono il carico e
        // la conta. Due eccezioni, tutte e due sulla stessa cosa — il
        // passaggio ai pezzi:
        if (daConvertire) {
          // Prodotto ancora nella misura vecchia: la giacenza va convertita
          // adesso, se no «5000» resterebbe scritto come se fossero pezzi.
          if (!(convertibile > 0)) {
            setAvviso(
              `Scrivi a quanto corrisponde un pezzo in ${UNIT_LABEL[baseVecchia] || baseVecchia}: senza, la giacenza (${fmtItem(initial.stock, initial)}) non si può contare in pezzi.`
            )
            return
          }
          const stock = Math.round((num0(initial.stock) / convertibile) * 100) / 100
          await onSave({ ...base, stock, bottles_total: Math.round(stock) }, scelte)
          return
        }
        // La giacenza letta è già quella giusta anche per un prodotto
        // ancora da migrare: si salva com'è.
        await onSave({ ...base, stock: Number(initial?.stock) || 0 }, scelte)
      } else {
        // In creazione la giacenza è quello che si scrive: i pezzi interi più
        // la frazione della confezione già aperta, che non è né zero né uno.
        const pieni = Math.max(0, num(form.bottles))
        const apertaBase = toBaseQty(num(form.open_content), form.content_unit)
        const stock =
          pieni + (apertaBase > 0 && contenutoPezzo > 0 ? apertaBase / contenutoPezzo : 0)
        await onSave({ ...base, stock, bottles_total: 0 }, scelte)
      }
    } finally {
      setSaving(false)
    }
  }

  const etichettaContenuto =
    UNIT_LABEL[String(form.content_unit).toLowerCase()] || form.content_unit

  return (
    <form className="card inv-scheda" onSubmit={submit}>
      <div className="row between" style={{ alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{isEdit ? 'Modifica prodotto' : 'Nuovo prodotto'}</h3>
        {/* IL PUNTO INTERROGATIVO. Questa scheda decide come si scala il
            magazzino e quanto costa un drink: chi la compila la prima volta
            non deve indovinare cosa vogliono dire le domande. La spiegazione
            sta dietro un tasto, non in pagina: a chi la sa già non serve. */}
        <button
          type="button"
          className="inv-aiuto"
          aria-label="Come si compila questa scheda"
          title="Come si compila questa scheda"
          onClick={() => setAiuto(true)}
        >
          ?
        </button>
      </div>
      {aiuto && <AiutoProdotto onClose={() => setAiuto(false)} />}

      <label htmlFor="iname">Nome *</label>
      <input id="iname" value={form.name} onChange={set('name')} placeholder="Es. Rum Zacapa" required />

      <label htmlFor="icat">Categoria</label>
      <select id="icat" value={form.category_id || ''} onChange={set('category_id')}>
        <option value="">— Nessuna —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      <label htmlFor="isup">Fornitore</label>
      <p className="muted small" style={{ marginTop: 0 }}>
        Va nel listino di questo fornitore, col prezzo qui sotto. Gli altri
        fornitori dello stesso prodotto restano dove sono.
      </p>
      {nuovoFornitore != null ? (
        <div className="row" style={{ gap: 8 }}>
          <input
            aria-label="Nome nuovo fornitore"
            value={nuovoFornitore}
            onChange={(e) => setNuovoFornitore(e.target.value)}
            placeholder="Nome nuovo fornitore"
            autoFocus
          />
          <button
            type="button"
            className="btn small"
            disabled={salvandoFornitore || !nuovoFornitore.trim()}
            onClick={creaFornitore}
          >
            OK
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setNuovoFornitore(null)}
          >
            ✕
          </button>
        </div>
      ) : (
        <select
          id="isup"
          value={form.supplier_id || ''}
          onChange={(e) => {
            if (e.target.value === '__new__') {
              setNuovoFornitore('')
              return
            }
            setForm((f) => ({ ...f, supplier_id: e.target.value }))
          }}
        >
          <option value="">— Nessuno —</option>
          {(suppliers || []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          {onCreateSupplier && <option value="__new__">➕ Nuovo fornitore…</option>}
        </select>
      )}

      <label htmlFor="istatus">Stato</label>
      <select id="istatus" value={form.status} onChange={set('status')}>
        {STATUS_ITEM.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <div className="grid-2">
        <div>
          {/* Il prezzo è quello di un pezzo: l'unità non si sceglie più, e
              quello che arriva a colli si scompone al carico. */}
          <label htmlFor="icost">Costo €/pz (netto)</label>
          <input id="icost" type="number" step="any" min="0" value={form.cost} onChange={set('cost')} placeholder="Es. 12,9" />
        </div>
        <div>
          <label htmlFor="ivat">IVA acquisto %</label>
          <input id="ivat" type="number" step="any" min="0" value={form.vat} onChange={set('vat')} />
        </div>
      </div>
      {costNum > 0 && (
        <div className="muted small">+IVA {formatPrice(costWithVat(costNum, form.vat))}/pz</div>
      )}

      {/* ── LA SOLA DOMANDA ───────────────────────────────────────
          A quanto corrisponde un pezzo: una capacità, un peso o delle
          unità non definite. È facoltativa — vuota vuol dire che in
          ricetta si dosa solo a pezzi. */}
      <div className="row" style={{ gap: 6, alignItems: 'center', marginTop: 8 }}>
        <label htmlFor="icontent" style={{ margin: 0 }}>
          A quanto corrisponde un pezzo? (facoltativo)
        </label>
        <button
          type="button"
          className="inv-aiuto piccolo"
          aria-label="Come funziona il contenuto di un pezzo"
          title="Come funziona"
          onClick={() => setAiutoPezzo(true)}
        >
          ?
        </button>
      </div>
      {aiutoPezzo && <AiutoPezzo onClose={() => setAiutoPezzo(false)} />}
      <div className="row" style={{ gap: 6 }}>
        <span className="muted small" style={{ whiteSpace: 'nowrap' }}>1 pz =</span>
        <input
          id="icontent"
          type="number"
          step="any"
          min="0"
          className="grow"
          value={form.content_size}
          onChange={set('content_size')}
          placeholder="Es. 70 per un pz da 70 cl"
        />
        <select
          value={form.content_unit}
          onChange={set('content_unit')}
          aria-label="Unità del contenuto"
          style={{ width: 90 }}
        >
          {CONTENUTO_UNITA.map(([u, label]) => (
            <option key={u} value={u}>{label}</option>
          ))}
        </select>
      </div>
      <p className="muted small" style={{ margin: '2px 0 8px' }}>
        {contenutoPezzo > 0
          ? 'Da qui escono il costo al cl e lo scarico: 4 cl da un pz da 70 scalano la loro frazione.'
          : 'Vuoto: in ricetta si dosa solo a pezzi, e non c’è nessun costo al cl da calcolare.'}
      </p>
      {/* L'AVVERTENZA ONESTA: chi legge «47 pz» di limoni deve sapere che
          nessuno li ha contati uno per uno. */}
      {aPeso && (
        <p className="muted small" style={{ margin: '-4px 0 8px' }}>
          ⚖️ Comprato a peso, il conteggio in pezzi è una <strong>stima</strong>:
          un pezzo non pesa sempre uguale. Quello che conta davvero resta il peso.
        </p>
      )}

      {/* IL TRAVASO NON DEVE ESSERE SILENZIOSO SU UNA GIACENZA. Questo
          articolo sul database è ancora scritto col modello vecchio: si
          legge già in pezzi, e qui c'è scritto da dove viene quel numero,
          prima di salvarlo per sempre. */}
      {motivoDaSistemare && (
        <div className="banner" style={{ marginTop: 8 }}>
          ⚠️ Questo prodotto <strong>blocca l&apos;aggiornamento</strong> del
          magazzino: {motivoDaSistemare}.
          {daConvertire && (
            <>
              {' '}La giacenza ({fmtItem(initial.stock, initial)})
              {convertibile > 0 ? (
                <>
                  {' '}diventa{' '}
                  <strong>{formatPezzi(num0(initial.stock) / convertibile)} pz</strong>.
                </>
              ) : (
                <> si conterà da lì.</>
              )}
            </>
          )}
        </div>
      )}

      {/* SI SCARICA DAL MAGAZZINO? Lo decide il prodotto: il ghiaccio finisce,
          il tempo di lavorazione no. */}
      <label className="row between" style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span>
          È una scorta: si scarica quando si usa
          <span className="muted small"> — spegnilo per il lavoro a servizio</span>
        </span>
        <input
          type="checkbox"
          className="toggle"
          checked={scorta}
          onChange={(e) => setScorta(e.target.checked)}
        />
      </label>

      {!isEdit && scorta && (
        <>
          <label htmlFor="ibottles">Quantità iniziale (pz)</label>
          <input id="ibottles" type="number" step="any" min="0" value={form.bottles} onChange={set('bottles')} />
          {contenutoPezzo > 0 && (
            <>
              {/* Il pezzo già aperto al momento del censimento: mezzo gin non
                  è né zero né uno, è la sua frazione di pezzo. */}
              <label htmlFor="iopen">
                Confezione aperta — contenuto ({etichettaContenuto}) — opzionale
              </label>
              <input
                id="iopen"
                type="number"
                step="any"
                min="0"
                value={form.open_content}
                onChange={set('open_content')}
                placeholder="Es. 40 se una è aperta a metà"
              />
            </>
          )}
        </>
      )}

      {/* Niente soglia per quello che non è una scorta: non finisce, quindi
          non c'è niente da avvisare e niente da riordinare al fornitore. */}
      {scorta && (
        <>
          <label htmlFor="ithr">Soglia di avviso (pz)</label>
          <input
            id="ithr"
            type="number"
            step="any"
            min="0"
            value={form.low_threshold}
            onChange={set('low_threshold')}
            placeholder="Es. 2 se vuoi l’avviso quando ne restano due"
          />
          <p className="muted small" style={{ margin: '2px 0 8px' }}>
            Sotto questo livello l’articolo compare fra quelli in esaurimento.
          </p>
        </>
      )}

      {avviso && (
        <div className="banner" role="alert" style={{ marginTop: 8 }}>
          {avviso}
        </div>
      )}

      <div className="grid-2" style={{ marginTop: 16 }}>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Annulla</button>
        <button type="submit" className="btn" disabled={saving}>{saving ? 'Salvataggio…' : 'Salva'}</button>
      </div>
    </form>
  )
}

// LA SCELTA DELL'UNITÀ accanto a un campo. Le opzioni sono quelle
// compatibili con come si conta l'articolo (litri, cl, ml per un liquido;
// kg e grammi per un peso) più i PEZZI dove ha senso: la soglia di avviso
// di un liquido si pensa in bottiglie — «avvisami quando ne resta una» —
// e nessuno la vuole scrivere in 700 ml.
const UNITA_COMPATIBILI = {
  ml: ['l', 'cl', 'ml'],
  g: ['kg', 'g'],
  pz: ['pz'],
}

function ScegliUnita({ valore, unita, onChange, etichetta, conPezzi = false }) {
  const base = baseUnit(unita)
  const opzioni = [...(UNITA_COMPATIBILI[base] || [unita])]
  // Per un articolo contato a pezzi il «pezzo» c'è già; per un liquido lo si
  // aggiunge solo dove la conversione ha senso.
  if (conPezzi && base !== 'pz') opzioni.push('pz')
  return (
    <select value={valore} onChange={onChange} aria-label={etichetta} style={{ width: 90 }}>
      {opzioni.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  )
}

