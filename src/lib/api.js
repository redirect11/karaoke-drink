import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  getDocsFromCache,
  getDocFromCache,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fbLimit,
  onSnapshot,
  serverTimestamp,
  increment,
  writeBatch,
  Timestamp,
} from 'firebase/firestore'
import { db, auth } from './firebaseClient.js'
import { ORDER_STATUSES } from './orderStatus.js'
import { splitAmounts } from './groups.js'
import {
  computeConsumption,
  eScorta,
  formatQty,
  qtyInStockUnit,
  scaricoPossibile,
  giacenzaPerCarico,
  articoloNormalizzato,
  patchNormalizza,
  caricoDaConfezioni,
  prodottoDaRigaOrdine,
} from './inventory.js'
import { consumptionDiff, purchaseOrderTotals } from './warehouse.js'
import {
  idRigaListino,
  livelloDi,
  statoOrdine,
  coloreACaso,
  fetteFornitore,
  pezziPerCollo,
  unitaPrezzo,
} from './listini.js'
import { entraInAssortimento, esceDaAssortimento } from './statoAssortimento.js'
import { variazioneDiPrezzo, prezzoCambiato } from './storicoPrezzi.js'
import {
  aggancioAmmesso,
  righeDaOrdine,
  cambiFattura,
  modificaAmmessa,
  CAMPI_MODIFICABILI,
  DOC_NESSUNO,
} from './fatture.js'
import { SUL_DOCUMENTO, conMovimento, movimento, storiaDi } from './statiOrdine.js'
import { prezziDaAllineare } from './confrontoOrdine.js'
import { cambioModoPermesso, supplementiPerModo } from './consegna.js'
import { idDispositivo } from './dispositivo.js'
import { leggiAvvisi, avvisoAttivo, idAvvisoScorta } from './preferenzeNotifiche.js'
import { patchRipristino, buoniDaRestituire, segnaBuoniRestituiti } from './ripristino.js'
import { riaddebitoBuono } from './vouchers.js'
import {
  ORDER_OPEN,
  normalizeOrderDoc,
  activeComanda,
  statoDiLavoro,
  allServed,
  serveAllComande,
  aggregateItems,
  comandeStatuses,
  comandaDaScaricare,
  comandaDivisibile,
  dividiComanda,
  statiDopoLaDivisione,
  statoComandaNuova,
  presaInCarico,
  ANNULLATA_PER_DIVISIONE,
  itemsTotal as sumItems,
} from './comande.js'
import {
  discountAmount,
  discountAfterChange,
  DEFAULT_DISCOUNT_POLICY,
  lordoSelezione,
  orderDue,
  paymentCloses,
  summaryMethod,
} from './pagamento.js'
import { coloreAutomatico, coloreValido } from './coloriConto.js'
import { hoursBetweenIso } from './ore.js'
import { businessDayKey, coverageStart, DEFAULT_CUTOFF_HOUR } from './businessDay.js'
import { recentDrinkIds } from './posCatalog.js'
import { DEFAULT_MARKUP, DEFAULT_ROUND_STEP } from './pricing.js'
import { notify } from './notify.js'
import { bgWrite } from './sync.js'
import { caricaAllegatoFattura, eliminaAllegato } from './storage.js'
import {
  inCodaOrdine,
  ricordaOrdine,
  ordineRicordato,
  VITA_MEMORIA,
} from './mutazioniOrdine.js'
import { ricordaImpostazioni, impostazioniRicordate } from './impostazioniLocali.js'
import {
  cassaCorrente,
  prendiNumero,
  numeroPrevisto,
  contatoreCorrente,
} from './progressivi.js'

const drinksCol = collection(db, 'drinks')
const ordersCol = collection(db, 'orders')
// Progressivo assoluto degli ordini (id interno che non riparte mai).
const categoriesCol = collection(db, 'categories')
const inventoryCol = collection(db, 'inventory_items')
const inventoryCategoriesCol = collection(db, 'inventory_categories')
const macroCategoriesCol = collection(db, 'macro_categories')
const suppliersCol = collection(db, 'suppliers')
// IL LISTINO: una riga per coppia prodotto-fornitore (REQ-MAG-029). Sta
// accanto ai fornitori e non dentro il prodotto perché il prodotto resta
// UNO — è la riga a duplicarsi, non il Campari.
const supplierPricesCol = collection(db, 'supplier_prices')
// LO STORICO DEI PREZZI (REQ-MAG-035): una riga per ogni volta che il
// prezzo di una coppia prodotto-fornitore cambia. È un registro, non uno
// stato: le righe si aggiungono e non si riscrivono, perché la domanda a
// cui risponde — «quanto è aumentato da gennaio» — vive nel passato.
const supplierPriceHistoryCol = collection(db, 'supplier_price_history')
// I MODELLI D'ORDINE (REQ-MAG-039): il giro che si fa sempre, con i prodotti,
// il fornitore scelto per ognuno e le quantità. Senza prezzi — quelli restano
// del listino, che è tenuto allineato dalle fatture.
const orderTemplatesCol = collection(db, 'purchase_order_templates')
const movementsCol = collection(db, 'stock_movements')
const settingsDoc = doc(db, 'settings', 'bar')
const groupsCol = collection(db, 'groups')
const paymentsCol = collection(db, 'payments')
const cashSessionsCol = collection(db, 'cash_sessions')
const invoicesCol = collection(db, 'invoices')
const vouchersCol = collection(db, 'vouchers')

// --- Helpers ------------------------------------------------------------

// Converte un Timestamp Firestore in stringa ISO (compatibile con created_at).
function toIso(value) {
  if (!value) return null
  if (value instanceof Timestamp) return value.toDate().toISOString()
  return value
}

// Mappa un documento "drink" alla forma usata dalla UI.
function mapDrink(snap) {
  const d = snap.data() || {}
  return {
    id: snap.id,
    name: d.name,
    description: d.description ?? null,
    category: d.category ?? null,
    category_id: d.category_id ?? null,
    recipe: d.recipe ?? null,
    recipe_items: Array.isArray(d.recipe_items) ? d.recipe_items : [],
    price: d.price ?? 0,
    // IVA DI VENDITA DELLA SINGOLA VOCE, e `null` vuol dire «quella del
    // locale» (settings.sale_vat). Un ZERO invece è un'aliquota vera —
    // esente — quindi i due casi non si possono confondere in un falsy.
    sale_vat: d.sale_vat ?? null,
    available: d.available ?? true,
    image_url: d.image_url ?? null,
    created_at: toIso(d.created_at),
  }
}

// Mappa una categoria.
function mapCategory(snap) {
  const c = snap.data() || {}
  return {
    id: snap.id,
    name: c.name ?? '',
    sort_order: c.sort_order ?? 0,
    icon: c.icon ?? null, // emoji scelta per la categoria (opzionale)
    color: c.color ?? null, // colore custom (hex); null = colore automatico
    macro_id: c.macro_id ?? null, // macro-categoria di appartenenza (inventario)
    created_at: toIso(c.created_at),
  }
}

// Mappa un item di inventario.
//
// QUI PASSA IL TRAVASO AL MODELLO A PEZZI (REQ-MAG-018). I prodotti scritti
// coi modelli di ieri — liquidi in cl, sacchi in «U», la resa fra due unità —
// arrivano al resto dell'app già nella forma nuova, senza che nessuno abbia
// lanciato niente contro il database: si aggiorna il bundle e i prodotti si
// leggono adeguati. È lo stesso trucco degli ordini vecchi, che nessuno ha
// mai migrato (normalizeOrderDoc, REQ-ORD-002).
function mapItem(snap) {
  const i = snap.data() || {}
  return articoloNormalizzato({
    id: snap.id,
    name: i.name ?? '',
    unit: i.unit ?? 'pz',
    stock: Number(i.stock) || 0,
    package_size: i.package_size ?? null,
    // Famiglia del contenuto per gli articoli contati a pezzo: senza, una
    // bottiglia da 33 cl non ha un costo al cl (vedi contentBase).
    content_unit: i.content_unit ?? null,
    display_unit: i.display_unit ?? null,
    // La resa dei prodotti scritti col modello vecchio: la legge solo il
    // travaso, che la riassorbe nel contenuto del pezzo.
    resa: i.resa != null ? Number(i.resa) : null,
    resa_unit: i.resa_unit ?? null,
    // SI SCARICA DAL MAGAZZINO? Lo dice il PRODOTTO, non la sua unità: senza
    // questo campo il «Tempo di Lavorazione», appena l'unità passa al pezzo,
    // ridiventerebbe merce — a zero al primo drink, e il menù farebbe
    // sparire dalla carta i drink che lo usano.
    scorta: typeof i.scorta === 'boolean' ? i.scorta : null,
    bottles_total: Number(i.bottles_total) || 0,
    low_threshold: Number(i.low_threshold) || 0,
    category_id: i.category_id ?? null,
    supplier_id: i.supplier_id ?? null,
    cost: i.cost != null ? Number(i.cost) : null,
    vat: i.vat != null ? Number(i.vat) : 22,
    // Chi non lo dichiara è semplicemente in assortimento: "in linea" è una
    // scelta esplicita (i prodotti che non devono mancare), non il default.
    status: i.status ?? 'assortimento',
    // LA MEMORIA DELLO STATO DI PRIMA (REQ-MAG-037). «In assortimento» è uno
    // stato di PASSAGGIO che prende il posto di «in linea» o «premium»
    // mentre c'è un ordine aperto: `assortimento_da` dice a quale stato
    // tornare, `ordini_assortimento` quali ordini lo tengono lì. Assenti su
    // tutto quello che c'è già, ed è giusto così: un prodotto senza memoria
    // uscendo dall'ordine resta dov'è, non si promuove a indovinare.
    assortimento_da: i.assortimento_da ?? null,
    ordini_assortimento: Array.isArray(i.ordini_assortimento) ? i.ordini_assortimento : [],
    // SCHEDA DA COMPLETARE (REQ-MAG-032): il prodotto è nato da una consegna,
    // quindi porta solo quello che l'ordine sapeva. Non è la lista «da
    // sistemare» del travaso, che blocca il magazzino: qui non blocca niente.
    scheda_da_completare: i.scheda_da_completare === true,
    created_at: toIso(i.created_at),
  })
}

function mapMovement(snap) {
  const m = snap.data() || {}
  return {
    id: snap.id,
    item_id: m.item_id ?? null,
    item_name: m.item_name ?? '',
    type: m.type ?? 'unload',
    qty: Number(m.qty) || 0,
    unit: m.unit ?? null,
    reason: m.reason ?? null,
    order_id: m.order_id ?? null,
    created_at: toIso(m.created_at),
  }
}

function mapOrder(snap) {
  const o = snap.data() || {}
  const items = Array.isArray(o.items) ? o.items : []
  // Normalizza al modello conto/comande (i doc legacy ottengono una comanda
  // sintetica). `workflow_status` è lo stato di lavorazione della comanda
  // attiva: è ciò che coda/cliente mostrano e fanno avanzare.
  const norm = normalizeOrderDoc(o)
  const comande = norm.comande.map((c) => ({ ...c, created_at: toIso(c.created_at) }))
  const active = activeComanda({ comande })
  // La stessa regola che usa la coda quando lo ricalcola in locale: due
  // strade per lo stesso stato sono due strade per farle divergere.
  const workflow = statoDiLavoro({ status: norm.status, comande })
  return {
    id: snap.id,
    daily_number: o.daily_number ?? null,
    order_date: o.order_date ?? null,
    cash_session_id: o.cash_session_id ?? null,
    table_label: o.table_label ?? null,
    note: o.note ?? null,
    status: norm.status,
    workflow_status: workflow,
    comande,
    active_comanda_id: active?.id ?? null,
    total: o.total ?? 0,
    coperto_persons: o.coperto_persons ?? 0,
    coperto_amount: o.coperto_amount ?? 0,
    service_charge_amount: o.service_charge_amount ?? 0,
    tip_amount: o.tip_amount ?? 0,
    service_mode: o.service_mode ?? null,
    // IL COLORE DEL CONTO. Sta scritto sul documento e non si ricalcola
    // qui: il perché — tavolozza che cambia, terminali che devono vedere
    // lo stesso colore — sta in lib/coloriConto.js. Un conto nato coi
    // colori automatici spenti non ce l'ha, e resta senza finché qualcuno
    // non gliene dà uno a mano.
    colore: o.colore ?? null,
    placed_by: o.placed_by ?? null,
    customer_name: o.customer_name ?? null,
    customer_uid: o.customer_uid ?? null,
    // Tempi di lavorazione: quelli della comanda attiva (o gli ultimi).
    status_times: (active ?? comande[comande.length - 1])?.status_times ?? o.status_times ?? {},
    // TEMPI DEL CONTO, non della comanda: `status_times` qui sopra è quello
    // della comanda attiva (serve ai tempi di preparazione), e lì dentro non
    // c'è né la chiusura né l'annullo del conto. La storia del conto legge
    // questi.
    tempi_conto: o.status_times ?? {},
    riaperture: (o.riaperture || []).map((r) => ({ ...r, at: toIso(r.at) })),
    cancelled_by: o.cancelled_by ?? null,
    cancelled_persona: o.cancelled_persona ?? null,
    cancelled_device: o.cancelled_device ?? null,
    // DA QUALE TERMINALE è stato rimesso in piedi: serve a non ripetere
    // l'avviso a chi ha appena premuto «Ripristina» (vedi BartenderPage).
    ripristinato_device: o.ripristinato_device ?? null,
    cancel_kind: o.cancel_kind ?? null,
    cancel_phrase: o.cancel_phrase ?? null,
    cancel_message: o.cancel_message ?? null,
    cancel_notify: o.cancel_notify ?? false,
    serial: o.serial ?? null,
    created_at: toIso(o.created_at),
    sumup_sale_id: o.sumup_sale_id ?? null,
    inventory_applied: o.inventory_applied ?? false,
    payment_method: o.payment_method ?? null,
    payment_status: o.payment_status ?? 'non_richiesto',
    // Sconto sul conto e pagamenti parziali (split alla cassa).
    discount: o.discount ?? null,
    discount_amount: o.discount_amount ?? 0,
    // Le righe su cui cade lo sconto in preparazione. `null` = tutto quello
    // che resta da riscuotere, ed è anche come si leggono i conti vecchi: lì
    // lo sconto era per forza uno solo, su tutto il conto.
    discount_items: o.discount_items ?? null,
    payments: (o.payments || []).map((p) => ({ ...p, at: toIso(p.at) })),
    // Lotteria degli scontrini e fattura di cortesia emessa.
    lottery_code: o.lottery_code ?? null,
    invoice_id: o.invoice_id ?? null,
    invoice_number: o.invoice_number ?? null,
    payment_required: o.payment_required ?? false,
    sumup_checkout_id: o.sumup_checkout_id ?? null,
    sumup_checkout_attempts: o.sumup_checkout_attempts ?? 0,
    sumup_client_transaction_id: o.sumup_client_transaction_id ?? null,
    sumup_transaction_id: o.sumup_transaction_id ?? null,
    paid_at: o.paid_at ?? null,
    // Lo scontrino di chiusura è già uscito: il segno sta sul DATO, non
    // solo nella memoria del terminale che l'ha stampato (BUG-055).
    receipt_print_at: o.receipt_print_at ?? null,
    // IL CONTO SI STA ANCORA COMPONENDO. Sottostato della creazione: finché
    // chi l'ha battuto non è uscito, le righe nuove restano nella prima
    // comanda e il ticket non esce (REQ-ORD-016, 20/08).
    in_creazione: o.in_creazione === true,
    payment_after_cancel: o.payment_after_cancel ?? false,
    group_id: o.group_id ?? null,
    group_name_snapshot: o.group_name_snapshot ?? null,
    payment_id: o.payment_id ?? null,
    client_temp_id: o.client_temp_id ?? null,
    order_items: items.map((i, idx) => ({
      id: `${snap.id}-${idx}`,
      drink_id: i.drink_id ?? null,
      name: i.name,
      unit_price: i.unit_price ?? 0,
      qty: i.qty ?? 1,
      sumup_product_id: i.sumup_product_id ?? null,
      custom: i.custom ?? false,
      recipe_items: i.recipe_items ?? null,
    })),
  }
}

// --- DRINKS (menù / ricette) ---

export async function fetchDrinks({ onlyAvailable = false } = {}) {
  const constraints = []
  if (onlyAvailable) constraints.push(where('available', '==', true))
  const snap = await getDocs(query(drinksCol, ...constraints))
  const drinks = snap.docs.map(mapDrink)
  // Ordina lato client per categoria poi nome (evita indici compositi).
  drinks.sort((a, b) => {
    const ca = (a.category || '').localeCompare(b.category || '')
    if (ca !== 0) return ca
    return (a.name || '').localeCompare(b.name || '')
  })
  return drinks
}

// Menù in tempo reale: i listener Firestore ritentano da soli con
// backoff — al primo accesso (token App Check non ancora pronto, rete
// lenta, prompt permessi in corso) il menù arriva appena possibile,
// senza dover ricaricare la pagina. E si aggiorna live se il bartender
// modifica il catalogo.
export function subscribeDrinks({ onlyAvailable = false } = {}, onChange, onError) {
  const constraints = []
  if (onlyAvailable) constraints.push(where('available', '==', true))
  return onSnapshot(
    query(drinksCol, ...constraints),
    (snap) => {
      const drinks = snap.docs.map(mapDrink)
      drinks.sort((a, b) => {
        const ca = (a.category || '').localeCompare(b.category || '')
        if (ca !== 0) return ca
        return (a.name || '').localeCompare(b.name || '')
      })
      onChange(drinks)
    },
    onError ?? (() => {})
  )
}

export function subscribeCategories(onChange, onError) {
  return onSnapshot(
    categoriesCol,
    (snap) => {
      const cats = snap.docs.map(mapCategory)
      cats.sort(
        (a, b) => (a.sort_order - b.sort_order) || (a.name || '').localeCompare(b.name || '')
      )
      onChange(cats)
    },
    onError ?? (() => {})
  )
}

export async function createDrink(drink) {
  const ref = await addDoc(drinksCol, {
    ...drink,
    created_at: serverTimestamp(),
  })
  const snap = await getDoc(ref)
  return mapDrink(snap)
}

export async function updateDrink(id, patch) {
  const ref = doc(db, 'drinks', id)
  await updateDoc(ref, patch)
  const snap = await getDoc(ref)
  return mapDrink(snap)
}

export async function deleteDrink(id) {
  await deleteDoc(doc(db, 'drinks', id))
}

// --- CATEGORIES ---

export async function fetchCategories() {
  const snap = await getDocs(categoriesCol)
  const cats = snap.docs.map(mapCategory)
  cats.sort((a, b) => (a.sort_order - b.sort_order) || (a.name || '').localeCompare(b.name || ''))
  return cats
}

export async function createCategory({ name, sort_order = 0, icon = null, color = null }) {
  const ref = await addDoc(categoriesCol, {
    name,
    sort_order,
    icon: icon || null,
    color: color || null,
    created_at: serverTimestamp(),
  })
  return mapCategory(await getDoc(ref))
}

export async function updateCategory(id, patch) {
  const ref = doc(db, 'categories', id)
  await updateDoc(ref, patch)
  return mapCategory(await getDoc(ref))
}

export async function deleteCategory(id) {
  await deleteDoc(doc(db, 'categories', id))
}

// --- INVENTORY ---

export async function fetchInventoryItems() {
  const snap = await getDocs(inventoryCol)
  const items = snap.docs.map(mapItem)
  items.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  return items
}

// Categorie dedicate ai prodotti di magazzino (distinte da quelle del menù).
export async function fetchInventoryCategories() {
  const snap = await getDocs(inventoryCategoriesCol)
  const cats = snap.docs.map(mapCategory)
  cats.sort((a, b) => (a.sort_order - b.sort_order) || (a.name || '').localeCompare(b.name || ''))
  return cats
}

export async function createInventoryCategory({ name, sort_order = 0, macro_id = null }) {
  const ref = await addDoc(inventoryCategoriesCol, { name, sort_order, macro_id, created_at: serverTimestamp() })
  return mapCategory(await getDoc(ref))
}

export async function updateInventoryCategory(id, patch) {
  const ref = doc(db, 'inventory_categories', id)
  await updateDoc(ref, patch)
  return mapCategory(await getDoc(ref))
}

export async function deleteInventoryCategory(id) {
  await deleteDoc(doc(db, 'inventory_categories', id))
}

// --- MACRO-CATEGORIE ---
// Raggruppano le categorie d'inventario (Distillati, Birre+Bibite, Vino…) per
// i conti aggregati di acquisti/fatturato. Il legame vive sulla categoria
// (campo macro_id), così una categoria sta in al più una macro.

// DUE ELENCHI, NON UNO. Le macro nascono sul MAGAZZINO — raggruppano quello
// che si compra — ma servono anche sul MENÙ, sulle categorie dei drink che
// si vendono: sono due mestieri diversi (si compra «Distillati», si vende
// «Cocktail classici») e mescolarli farebbe due somme sbagliate.
// Stessa collezione, campo `ambito`: le righe vecchie non ce l'hanno e sono
// tutte di magazzino, che è come stavano prima.
export const AMBITI_MACRO = ['magazzino', 'menu']

function mapMacro(snap) {
  const m = snap.data() || {}
  return {
    id: snap.id,
    name: m.name ?? '',
    sort_order: m.sort_order ?? 0,
    ambito: m.ambito === 'menu' ? 'menu' : 'magazzino',
    // Solo sulle macro di magazzino: a quale macro di VENDITA corrisponde
    // questa spesa. È l'aggancio che fa il confronto speso/incassato.
    macro_menu_id: m.macro_menu_id ?? null,
    created_at: toIso(m.created_at),
  }
}

export async function fetchMacroCategories(ambito = 'magazzino') {
  const snap = await getDocs(macroCategoriesCol)
  const list = snap.docs.map(mapMacro).filter((m) => m.ambito === ambito)
  list.sort((a, b) => (a.sort_order - b.sort_order) || (a.name || '').localeCompare(b.name || ''))
  return list
}

export async function createMacroCategory({ name, sort_order = 0, ambito = 'magazzino' }) {
  const ref = await addDoc(macroCategoriesCol, {
    name,
    sort_order,
    ambito: ambito === 'menu' ? 'menu' : 'magazzino',
    created_at: serverTimestamp(),
  })
  return mapMacro(await getDoc(ref))
}

export async function updateMacroCategory(id, patch) {
  const ref = doc(db, 'macro_categories', id)
  await updateDoc(ref, patch)
  return mapMacro(await getDoc(ref))
}

// Eliminando una macro, le sue categorie tornano "senza macro" (non si
// perdono): si azzera macro_id su quelle che la puntano — quelle del
// magazzino o quelle del menù, secondo l'ambito. E si sgancia da chi la
// indicava come macro di vendita, altrimenti resterebbe un aggancio a un
// gruppo che non esiste più e il confronto mostrerebbe una riga vuota.
export async function deleteMacroCategory(id, ambito = 'magazzino') {
  const collezione = ambito === 'menu' ? categoriesCol : inventoryCategoriesCol
  const cats = await getDocs(query(collezione, where('macro_id', '==', id)))
  await Promise.all(cats.docs.map((d) => updateDoc(d.ref, { macro_id: null })))
  if (ambito === 'menu') {
    const agganciate = await getDocs(query(macroCategoriesCol, where('macro_menu_id', '==', id)))
    await Promise.all(agganciate.docs.map((d) => updateDoc(d.ref, { macro_menu_id: null })))
  }
  await deleteDoc(doc(db, 'macro_categories', id))
}

// --- FORNITORI ---

function mapSupplier(snap) {
  const s = snap.data() || {}
  return {
    id: snap.id,
    name: s.name ?? '',
    sort_order: s.sort_order ?? 0,
    notes: s.notes ?? null,
    email: s.email ?? null,
    // Il colore con cui il fornitore si riconosce nelle liste degli ordini
    // (REQ-MAG-029). Chi non ce l'ha ne riceve uno stabile calcolato dal
    // suo id: la regola sta in `listini.js`, non qui.
    color: s.color ?? null,
    created_at: toIso(s.created_at),
  }
}

export async function fetchSuppliers() {
  const snap = await getDocs(suppliersCol)
  const list = snap.docs.map(mapSupplier)
  list.sort((a, b) => (a.sort_order - b.sort_order) || (a.name || '').localeCompare(b.name || ''))
  return list
}

// IL COLORE SI SCEGLIE ALLA CREAZIONE: a caso, oppure a mano. A caso e non
// «il prossimo libero» perché i fornitori si creano anche dalla scheda
// prodotto, di corsa, e chiedere lì una scelta cromatica sarebbe un passo
// in più in un momento in cui si sta inventariando una bottiglia.
export async function createSupplier({ name, sort_order = 0, notes = null, color = null }) {
  const ref = await addDoc(suppliersCol, {
    name,
    sort_order,
    notes,
    color: color || coloreACaso(),
    created_at: serverTimestamp(),
  })
  return mapSupplier(await getDoc(ref))
}


export async function updateSupplier(id, patch) {
  const ref = doc(db, 'suppliers', id)
  await updateDoc(ref, patch)
  return mapSupplier(await getDoc(ref))
}

export async function deleteSupplier(id) {
  await deleteDoc(doc(db, 'suppliers', id))
}

// ── IL LISTINO: UN PRODOTTO, PIÙ FORNITORI (REQ-MAG-029) ─────────────
//
// Una riga per coppia prodotto-fornitore, con id DETERMINISTICO: l'unicità
// della coppia è così un fatto strutturale del database e non un controllo
// applicativo che un secondo terminale può scavalcare.

function mapSupplierPrice(snap) {
  const r = snap.data() || {}
  return {
    id: snap.id,
    supplier_id: r.supplier_id ?? null,
    item_id: r.item_id ?? null,
    // Il prezzo NETTO di CIÒ CHE QUEL FORNITORE FATTURA (REQ-MAG-040): il
    // pezzo per quasi tutti, il COLLO per chi vende a cartoni — 25,05 per il
    // cartone da 24 di Bjorne, non 1,04. Il prezzo al pezzo si ricava
    // (`prezzoAlPezzo` in listini.js) e resta quello con cui si confrontano
    // due fornitori e si valorizza il magazzino.
    price: r.price == null ? null : Number(r.price),
    // Quanti PEZZI ci sono nel collo di questo fornitore. È suo e non del
    // prodotto: la stessa Bjorne da MAR va a bottiglia e da FONT a cartone
    // da 24, e sul prodotto ce ne starebbe uno solo per tutti.
    // Si normalizza già qui, con la stessa funzione che lo rilegge ovunque:
    // le 367 righe scritte prima di REQ-MAG-040 quel campo non ce l'hanno, e
    // nessun conto a valle deve trovarsi un `undefined` da moltiplicare.
    pezzi_per_collo: pezziPerCollo(r),
    // In che unità è espresso `price`: «collo» (quello che fattura) è il
    // caso normale e il valore di partenza, ma un fornitore può quotare la
    // bottiglia o il contenuto (il vino al litro, la frutta al chilo). Il
    // contenuto del pezzo NON sta qui: sta sul prodotto, ed è da lì che si
    // legge — duplicarlo vorrebbe dire due numeri che prima o poi litigano.
    unita_prezzo: unitaPrezzo(r),
    // La confezione DI QUEL FORNITORE («cartone da 6») e il codice sul suo
    // listino: servono a chi scrive l'ordine e a chi lo riceve dall'altra
    // parte, e non sono la confezione del prodotto in magazzino. È una
    // SCRITTA, e su una scritta non ci si moltiplica: il numero è qui sopra.
    package_label: r.package_label ?? null,
    code: r.code ?? null,
    last_price: r.last_price == null ? null : Number(r.last_price),
    last_price_at: r.last_price_at ?? null,
  }
}

export async function fetchSupplierPrices() {
  const snap = await getDocs(supplierPricesCol)
  return snap.docs.map(mapSupplierPrice)
}

// ── LO STORICO DELLE VARIAZIONI DI PREZZO (REQ-MAG-035) ─────────────
//
// Una porta sola per scriverlo, e la usano TUTTE le strade che cambiano un
// prezzo di listino: il listino compilato a mano nella scheda del
// fornitore, la correzione alla consegna di un ordine, l'allineamento
// fatto da una fattura. Se una delle tre non passasse di qui, il grafico
// che verrà racconterebbe una storia con dei buchi dentro, e i buchi in uno
// storico non si riempiono dopo.
//
// `prezzo_prima` lo porta il chiamante, letto PRIMA di scrivere: qui non si
// rilegge niente, perché la scrittura parte in sottofondo e nell'istante
// della rilettura la cache conterrebbe ancora il prezzo di prima.
function scriviVariazionePrezzo({ supplier_id, item_id, price, prezzo_prima, origine, quando }) {
  const variazione = variazioneDiPrezzo({
    supplier_id,
    item_id,
    price,
    prezzo_prima,
    origine,
    quando: quando || new Date().toISOString(),
  })
  // Niente variazione, niente riga: uno storico che registra anche i
  // «non è cambiato niente» smette di essere leggibile alla terza consegna.
  if (!variazione) return null
  const { id, ...dati } = variazione
  bgWrite(
    () => setDoc(doc(db, 'supplier_price_history', id), dati),
    'storico prezzi fornitore'
  )
  return variazione
}

function mapVariazionePrezzo(snap) {
  const v = snap.data() || {}
  return {
    id: snap.id,
    supplier_id: v.supplier_id ?? null,
    item_id: v.item_id ?? null,
    price: v.price == null ? null : Number(v.price),
    previous_price: v.previous_price == null ? null : Number(v.previous_price),
    origine: v.origine ?? 'manuale',
    at: v.at ?? null,
  }
}

// Le variazioni di un fornitore. Il filtro è su un campo solo — niente
// indice composto da tenere allineato — e l'ordine si fa in memoria, dove
// costa niente: sono le variazioni di un fornitore, non di un magazzino.
export async function fetchVariazioniPrezzo({ supplier_id = null } = {}) {
  const q = supplier_id
    ? query(supplierPriceHistoryCol, where('supplier_id', '==', supplier_id))
    : supplierPriceHistoryCol
  const snap = await getDocs(q)
  return snap.docs.map(mapVariazionePrezzo)
}

// Salva (o aggiorna) una riga di listino. `merge` perché la consegna scrive
// solo il prezzo e la sua data: riscrivere tutto cancellerebbe il codice
// articolo e la confezione che qualcuno aveva compilato a mano.
//
// NON SI ASPETTA LA RETE e non si rilegge: la riga che torna è composta in
// memoria da quella di partenza più quello che si è appena scritto. Chi
// compila un listino ne tocca venti righe di fila, e ogni riga che aspetta
// l'ACK del server è una riga che al primo buco di rete resta ferma con il
// prezzo vecchio a schermo.
//
// `precedente` è la riga com'era prima — la schermata ce l'ha già davanti —
// e serve a due cose: sapere se il prezzo è cambiato davvero, e non perdere
// i campi che questa scrittura non tocca.
export function salvaRigaListino({
  supplier_id,
  item_id,
  price = null,
  // Sta a parte dagli altri campi, e il valore di partenza è `undefined` e
  // non `null` apposta (REQ-MAG-040): chi non lo nomina — la consegna che
  // aggiorna un prezzo, il prodotto che nasce dal listino — NON deve
  // cancellare il collo già scritto. La scrittura è un `merge`, e un `null`
  // esplicito è una cancellazione: un fornitore che aumenta di dieci
  // centesimi il cartone si ritroverebbe a vendere a pezzo.
  pezzi_per_collo = undefined,
  // Come i pezzi per collo, e per lo stesso motivo: chi non la nomina non
  // deve cancellarla. La consegna che aggiorna un prezzo non sa in che unità
  // quel listino è scritto, e sovrascriverla la manderebbe a «collo».
  unita_prezzo = undefined,
  package_label = null,
  code = null,
  precedente = null,
  origine = 'manuale',
}) {
  const id = idRigaListino(supplier_id, item_id)
  if (!id) throw new Error('Serve il fornitore e il prodotto')
  const riga = {
    supplier_id,
    item_id,
    price: price == null || price === '' ? null : Number(price),
    package_label: package_label || null,
    code: code || null,
  }
  // Si scrive il numero NORMALIZZATO dalla stessa funzione che poi lo
  // rilegge: un campo svuotato, zero o una virgola andata storta diventano 1,
  // che è il collo da un pezzo — cioè «si compra a bottiglia», il caso
  // normale. Così un collo messo per sbaglio si toglie davvero invece di
  // restare a dividere il prezzo, e sul database non finisce mai un valore
  // che un conto non sa moltiplicare.
  if (pezzi_per_collo !== undefined) {
    riga.pezzi_per_collo = pezziPerCollo({ pezzi_per_collo })
  }
  if (unita_prezzo !== undefined) riga.unita_prezzo = unitaPrezzo({ unita_prezzo })
  bgWrite(() => setDoc(doc(db, 'supplier_prices', id), riga, { merge: true }), 'listino fornitore')
  const variazione = scriviVariazionePrezzo({
    supplier_id,
    item_id,
    price: riga.price,
    prezzo_prima: precedente?.price ?? null,
    origine,
  })
  // `last_price` e `last_price_at` dicono l'ultimo acquisto VERO, e un
  // prezzo battuto a mano non è un acquisto: si tengono quelli di prima,
  // se no il fornitore proposto al prossimo ordine sarebbe quello che
  // qualcuno ha toccato per ultimo invece di quello da cui si è comprato.
  //
  // La variazione torna INSIEME alla riga perché la schermata la mostra
  // accanto al prezzo: andarsela a rileggere vorrebbe dire aspettare la
  // rete per far comparire una cosa che si è appena scritta.
  return {
    riga: { last_price: null, last_price_at: null, ...(precedente || {}), id, ...riga },
    variazione,
  }
}

export function eliminaRigaListino(supplier_id, item_id) {
  const id = idRigaListino(supplier_id, item_id)
  if (!id) return
  // Lo storico NON si cancella: quel prezzo è stato pagato davvero, e
  // togliere un prodotto dal catalogo di un fornitore non lo rende falso.
  bgWrite(() => deleteDoc(doc(db, 'supplier_prices', id)), 'listino fornitore')
}

// ── UN PRODOTTO CHE NASCE DAL LISTINO (REQ-MAG-035) ──────────────────
//
// «Posso associare i prodotti già in magazzino a quel fornitore, o
// addirittura CREARE un prodotto che poi andrà a finire in magazzino»
// (l'utente, 27/08/2026). La strada è la stessa del prodotto che nasce da
// una consegna (REQ-MAG-032) e passa dalla stessa funzione: nome, prezzo e
// nient'altro, contato a pezzi, con la SCHEDA DA COMPLETARE addosso. Le tre
// cose che mancano — categoria, quanto contiene un pezzo, soglia di
// riordino — un listino non le sa, e inventarle sarebbe peggio.
//
// L'ID SE LO DÀ IL CLIENT. `addDoc` risolve solo con l'ACK del server:
// offline non torna mai, e chi ha appena creato un prodotto resterebbe a
// guardare una schermata ferma. Con un id generato qui la scrittura parte
// in sottofondo e il prodotto esiste subito, anche senza rete.
export function creaProdottoAListino({ supplier_id, name, price = null }) {
  if (!supplier_id) throw new Error('Serve il fornitore')
  const nome = String(name || '').trim()
  if (!nome) throw new Error('Serve il nome del prodotto')
  const prodotto = prodottoDaRigaOrdine({ name: nome, unit_cost: price })
  const ref = doc(inventoryCol)
  bgWrite(
    () => setDoc(ref, { ...prodotto, created_at: serverTimestamp() }),
    'prodotto nuovo dal listino'
  )
  const { riga, variazione } = salvaRigaListino({ supplier_id, item_id: ref.id, price })
  return { item: { id: ref.id, ...prodotto }, riga, variazione }
}

export async function createInventoryItem(item) {
  const ref = await addDoc(inventoryCol, {
    ...item,
    stock: Number(item.stock) || 0,
    low_threshold: Number(item.low_threshold) || 0,
    created_at: serverTimestamp(),
  })
  return mapItem(await getDoc(ref))
}

export async function updateInventoryItem(id, patch) {
  const ref = doc(db, 'inventory_items', id)
  await updateDoc(ref, patch)
  return mapItem(await getDoc(ref))
}

export async function deleteInventoryItem(id) {
  await deleteDoc(doc(db, 'inventory_items', id))
}

// ── IL TRAVASO DEL MAGAZZINO AL MODELLO A PEZZI (REQ-MAG-018) ────────
//
// Lo lancia l'utente da un tasto, dopo aver visto cosa cambia. Qui si
// rileggono i documenti COM'È SCRITTO SUL DATABASE — non come li legge
// l'app, che li vede già a pezzi — e si scrive la forma nuova.
//
// A LOTTI, e ripetibile. Sono centinaia di documenti: scriverli tutti in una
// volta blocca la schermata, e se la rete cade a metà bisogna poter
// ricominciare. Ogni giro guarda cos'è ancora da fare, quindi ripartire
// riprende da dove stava e nessuno viene scritto due volte.
//
// `onAvanzamento(fatti, totale)` serve a far vedere che si sta muovendo: al
// banco una schermata ferma vuol dire «è bloccata».
export const ATTESA_TRAVASO =
  'Prima va aggiornato il magazzino alla nuova gestione (Magazzino → il banner in alto).'

// ── UNA PORTA SOLA PER SCRIVERE IN MAGAZZINO ─────────────────────────
//
// In LETTURA il modello vecchio si legge con tolleranza — `articoloNormalizzato`,
// applicato in `mapItem` — e quello che si vede a schermo è già a pezzi. In
// SCRITTURA no: si rilegge il documento com'è scritto sul database, e sommare
// pezzi a una giacenza ancora in centilitri dà un numero senza senso. Un
// numero storto in magazzino sembra plausibile a chi lo legge.
//
// Il controllo «prima va aggiornato il magazzino» era stato copiato a mano in
// due casi su sette: ce l'avevano il carico e la rettifica, non ce l'avevano
// `receiveBottles`, `receivePurchaseOrder`, l'allineamento della conta e lo
// scarico delle comande. Il buco concreto: da Acquisti → «ricevi ordine» si
// scriveva su un magazzino non ancora aggiornato, e quella schermata non era
// bloccata perché il blocco viveva dentro `InventoryManager`.
//
// Finché è una riga da ricopiare, ogni percorso nuovo nasce senza.

// Da uno snapshot già letto: torna null se il prodotto non c'è più (chi cicla
// su una lista lo salta e va avanti), e si ferma se è ancora nella forma
// vecchia.
function articoloScrivibile(snap) {
  if (!snap?.exists()) return null
  const cur = snap.data()
  if (patchNormalizza(cur)) throw new Error(ATTESA_TRAVASO)
  return cur
}

// Per chi ne scrive uno solo: rilegge, controlla, e restituisce l'articolo.
async function leggiArticoloPerScrittura(ref) {
  const cur = articoloScrivibile(await getDoc(ref))
  if (!cur) throw new Error('Prodotto non trovato')
  return cur
}

export async function travasaMagazzinoAPezzi({ onAvanzamento, lotto = 25 } = {}) {
  // UN GIRO PER LOTTO, E OGNI GIRO RILEGGE. Fidarsi della lista di partenza
  // vuol dire scrivere su prodotti che nel frattempo qualcuno ha cancellato
  // da un altro terminale — succede, ed è successo — e non accorgersi di
  // quelli nati mentre l'aggiornamento girava, che resterebbero indietro
  // senza che nessuno lo sappia. Rileggere costa una lettura per lotto e
  // toglie tutti e due i guai.
  let scritti = 0
  let saltati = 0
  // Chi è sparito e chi non si è lasciato scrivere: senza tenerli da parte
  // tornerebbero nella lista a ogni giro, e il giro non finirebbe mai.
  const spariti = new Set()
  const bloccati = new Set()
  // Chi è già stato scritto: la lista in memoria porta ancora i dati di
  // prima, e senza questo lo si riconoscerebbe «da fare» a ogni giro.
  const fatti = new Set()
  // SI RILEGGE, MA NON A OGNI LOTTO. La rilettura serve a prendere chi è
  // nato o cambiato mentre l'aggiornamento gira — e a non riscrivere chi
  // nel frattempo è sparito — ma rifarla per ognuno dei sedici lotti vuol
  // dire leggere quattrocento articoli sedici volte: soldi veri e sedici
  // attese in fila, con chi sta al banco che guarda la barra. Si legge
  // all'inizio, si lavora dalla lista, e si rilegge quando la lista finisce
  // — che è l'unico momento in cui la risposta può cambiare qualcosa.
  let elenco = null
  for (;;) {
    if (!elenco) {
      const snap = await getDocs(inventoryCol)
      elenco = snap.docs.map((d) => ({ id: d.id, dati: d.data() }))
    }
    const daFare = []
    for (const d of elenco) {
      if (spariti.has(d.id) || bloccati.has(d.id) || fatti.has(d.id)) continue
      const patch = patchNormalizza({ id: d.id, ...d.dati })
      if (patch) daFare.push({ id: d.id, patch })
    }
    onAvanzamento?.(scritti, scritti + daFare.length)
    if (daFare.length === 0) {
      // Finita la lista in mano: si rilegge una volta sola per vedere se
      // nel frattempo è arrivato altro. Se non c'è più niente, è finita
      // davvero.
      if (elenco === null) break
      elenco = null
      const snap = await getDocs(inventoryCol)
      const ancora = snap.docs.filter(
        (d) =>
          !spariti.has(d.id) &&
          !bloccati.has(d.id) &&
          patchNormalizza({ id: d.id, ...d.data() })
      )
      if (ancora.length === 0) break
      elenco = snap.docs.map((d) => ({ id: d.id, dati: d.data() }))
      continue
    }
    const gruppo = daFare.slice(0, lotto)
    // allSettled e non all: uno che va storto non si porta dietro gli altri
    // ventiquattro del lotto, che sono a posto.
    const esiti = await Promise.allSettled(
      gruppo.map(({ id, patch }) => updateDoc(doc(db, 'inventory_items', id), patch))
    )
    esiti.forEach((esito, i) => {
      const { id } = gruppo[i]
      if (esito.status === 'fulfilled') {
        scritti += 1
        fatti.add(id)
        return
      }
      if (nonEsistePiu(esito.reason)) {
        spariti.add(id)
        saltati += 1
        return
      }
      // Il motivo tecnico serve a noi, non a chi sta al banco: finisce nella
      // console, e a schermo va una frase in italiano (vedi InventoryManager).
      console.error('[travaso] prodotto non aggiornato', id, esito.reason)
      bloccati.add(id)
    })
  }
  return { travasati: scritti, saltati, bloccati: bloccati.size }
}

// Il documento non c'è più: qualcuno l'ha cancellato mentre giravamo, o la
// lista da cui eravamo partiti era di dieci minuti fa. Non è un errore da
// fermare tutto — quel prodotto semplicemente non c'è.
function nonEsistePiu(errore) {
  if (errore?.code === 'not-found') return true
  return /not[_\s-]?found|no entity to update/i.test(String(errore?.message || ''))
}

// Carico merce: incrementa lo stock e registra un movimento (atomico).
// `qty` è già in unità base; può essere negativo per uno scarico manuale.
export async function loadStock(itemId, qty, { reason = 'carico' } = {}) {
  const ref = doc(db, 'inventory_items', itemId)
  // Un carico parte da quello che c'è, e quello che c'è non è mai negativo:
  // una bottiglia caricata su −0,04 deve valere una bottiglia. Lo scarico a
  // mano, dall'altra parte, non può scavare sotto lo zero.
  const cur = await leggiArticoloPerScrittura(ref)
  const partenza = giacenzaPerCarico(cur.stock)
  const nuovo = qty >= 0 ? partenza + qty : partenza - scaricoPossibile(partenza, -qty)
  await updateDoc(ref, { stock: nuovo })
  await addDoc(movementsCol, {
    item_id: itemId,
    item_name: cur.name,
    type: qty >= 0 ? 'load' : 'unload',
    qty: Math.abs(qty),
    unit: cur.unit ?? null,
    reason,
    created_at: serverTimestamp(),
  })
  return mapItem(await getDoc(ref))
}

// Carico a confezioni: aggiunge `count` bottiglie piene (+ eventuale bottiglia
// aperta con `openQty` di contenuto). Aggiorna giacenza e numero totale di
// bottiglie, scartando le vuote accumulate (al riassortimento si buttano).
export async function receiveBottles(itemId, count, openQty = 0) {
  const ref = doc(db, 'inventory_items', itemId)
  const cur = await leggiArticoloPerScrittura(ref)
  const size = Number(cur.package_size) || 0
  // Il carico riparte da zero se la giacenza era andata sotto: altrimenti la
  // bottiglia appena comprata copre il buco e in magazzino ne risulta meno
  // di una, mentre sullo scaffale c'è tutta.
  const stock = giacenzaPerCarico(cur.stock)
  const full = size ? Math.floor(stock / size) : 0
  const hasOpen = size ? stock - full * size > 1e-9 : false
  const withContent = full + (hasOpen ? 1 : 0)

  const addQty = count * size + openQty
  const newStock = stock + addQty
  const newTotal = withContent + count + (openQty > 0 ? 1 : 0)

  await updateDoc(ref, { stock: newStock, bottles_total: newTotal })
  await addDoc(movementsCol, {
    item_id: itemId,
    item_name: cur.name,
    type: 'load',
    qty: addQty,
    unit: cur.unit ?? null,
    reason: 'carico',
    created_at: serverTimestamp(),
  })
  return mapItem(await getDoc(ref))
}

// Rettifica: imposta lo stock a un valore assoluto e registra il delta.
export async function adjustStock(itemId, newStock) {
  const ref = doc(db, 'inventory_items', itemId)
  // Come nel carico: la conta arriva in pezzi, e su una giacenza ancora
  // scritta alla vecchia maniera vorrebbe dire un'altra cosa.
  const cur = await leggiArticoloPerScrittura(ref)
  const delta = newStock - (Number(cur.stock) || 0)
  const size = Number(cur.package_size) || 0
  // Mantieni coerente il numero totale di bottiglie con la nuova giacenza.
  // Contando a pezzi le bottiglie SONO i pezzi: dividerle per il contenuto
  // darebbe «1» su venti lattine da 33 cl.
  const minTotal =
    (cur.unit || 'pz') === 'pz' ? Math.ceil(newStock) : size ? Math.ceil(newStock / size) : 0
  const patch = { stock: newStock }
  if (minTotal > (Number(cur.bottles_total) || 0)) patch.bottles_total = minTotal
  await updateDoc(ref, patch)
  if (delta !== 0) {
    await addDoc(movementsCol, {
      item_id: itemId,
      item_name: cur.name,
      type: delta > 0 ? 'load' : 'unload',
      qty: Math.abs(delta),
      unit: cur.unit ?? null,
      reason: 'rettifica',
      created_at: serverTimestamp(),
    })
  }
  return mapItem(await getDoc(ref))
}

export async function fetchStockMovements({ limit = 50 } = {}) {
  const snap = await getDocs(query(movementsCol, orderBy('created_at', 'desc'), fbLimit(limit)))
  return snap.docs.map(mapMovement)
}

// Carichi registrati dopo una certa data (per la colonna ACQ della conta).
// Filtro per tipo lato client: la query resta su un solo campo (niente
// indici compositi).
export async function fetchLoadMovementsSince(iso) {
  const snap = await getDocs(
    query(movementsCol, where('created_at', '>', Timestamp.fromDate(new Date(iso))))
  )
  return snap.docs.map(mapMovement).filter((m) => m.type === 'load')
}

// --- CONTA DI MAGAZZINO (inventario periodico: DEP → ACQ → RIM → CONS) ---

function mapStockCount(snap) {
  const c = snap.data() || {}
  return {
    id: snap.id,
    status: c.status ?? 'open',
    started_at: toIso(c.started_at),
    closed_at: toIso(c.closed_at),
    lines: Array.isArray(c.lines) ? c.lines : [],
    totals: c.totals ?? null,
  }
}

// La conta aperta (al più una), o null.
export async function getOpenStockCount() {
  const snap = await getDocs(
    query(collection(db, 'stock_counts'), where('status', '==', 'open'), fbLimit(1))
  )
  return snap.empty ? null : mapStockCount(snap.docs[0])
}

// Apre una nuova conta fotografando la giacenza corrente (DEP) di ogni
// prodotto; costi/formnum denormalizzati per calcolare i valori alla chiusura.
export async function startStockCount(items) {
  const existing = await getOpenStockCount()
  if (existing) return existing
  const lines = (items || []).map((it) => ({
    item_id: it.id,
    name: it.name,
    unit: it.unit,
    package_size: it.package_size ?? null,
    cost: it.cost ?? null,
    vat: it.vat ?? 22,
    dep: it.stock,
    acq: 0,
    rim: null,
  }))
  const ref = await addDoc(collection(db, 'stock_counts'), {
    status: 'open',
    started_at: serverTimestamp(),
    lines,
    totals: null,
  })
  return mapStockCount(await getDoc(ref))
}

// Salva le rimanenze inserite (senza chiudere la conta).
export async function updateStockCountLines(id, lines) {
  await updateDoc(doc(db, 'stock_counts', id), { lines })
}

// Chiude la conta salvando righe complete (cons/valori) e totali.
// Se align=true le giacenze dei prodotti vengono allineate alle rimanenze
// contate (con movimento di rettifica per la differenza).
export async function closeStockCount(id, { lines, totals, align = true }) {
  const countRef = doc(db, 'stock_counts', id)
  const countSnap = await getDoc(countRef)
  if (!countSnap.exists()) throw new Error('Conta non trovata')
  if (countSnap.data().status !== 'open') throw new Error('Conta già chiusa')

  const toAlign = align ? lines.filter((l) => l.rim != null && l.rim !== '') : []
  const itemSnaps = await Promise.all(
    toAlign.map((l) => getDoc(doc(db, 'inventory_items', l.item_id)))
  )

  for (let idx = 0; idx < toAlign.length; idx++) {
    const l = toAlign[idx]
    const cur = articoloScrivibile(itemSnaps[idx])
    if (!cur) continue
    const rim = Number(l.rim) || 0
    const delta = rim - (Number(cur.stock) || 0)
    if (delta === 0) continue
    // Rettifica a valore assoluto: la conta è una fotografia autorevole,
    // quindi qui si imposta lo stock (non increment).
    await updateDoc(doc(db, 'inventory_items', l.item_id), { stock: rim })
    await addDoc(movementsCol, {
      item_id: l.item_id,
      item_name: cur.name,
      type: delta > 0 ? 'load' : 'unload',
      qty: Math.abs(delta),
      unit: cur.unit ?? null,
      reason: 'conta',
      created_at: serverTimestamp(),
    })
  }

  await updateDoc(countRef, {
    status: 'closed',
    closed_at: serverTimestamp(),
    lines,
    totals,
  })
}

export async function fetchStockCounts({ limit = 20 } = {}) {
  const snap = await getDocs(
    query(collection(db, 'stock_counts'), orderBy('started_at', 'desc'), fbLimit(limit))
  )
  return snap.docs.map(mapStockCount)
}

// --- ORDINI FORNITORE (generatore ordini + storico) ---

function mapPurchaseOrder(snap) {
  const o = snap.data() || {}
  return {
    id: snap.id,
    supplier_id: o.supplier_id ?? null,
    supplier_name: o.supplier_name ?? '',
    // LO STATO DELLA MERCE, come sta scritto in archivio (REQ-MAG-038):
    // 'bozza' | 'inviato' | 'ricevuto'. Le due parole vecchie non si
    // rinominano — stanno su ordini veri — e a tradurle in «richiesto» e
    // «consegnato» ci pensa `statiOrdine.js`, una volta sola.
    status: o.status ?? 'inviato',
    created_at: toIso(o.created_at),
    received_at: toIso(o.received_at),
    // LA CHIUSURA (REQ-MAG-038): si può mettere solo a fattura riconciliata,
    // e non è un sinonimo di pagato. Un ordine chiuso resta consegnato: la
    // data si aggiunge, non sostituisce lo stato.
    closed_at: toIso(o.closed_at),
    // LA STORIA DELL'ORDINE (REQ-MAG-038). Gli ordini scritti prima non ce
    // l'hanno, e non è un errore: la storia comincia da quando la si scrive.
    storia: Array.isArray(o.storia) ? o.storia : [],
    lines: Array.isArray(o.lines) ? o.lines : [],
    total_net: Number(o.total_net) || 0,
    total_gross: Number(o.total_gross) || 0,
  }
}

// UN ORDINE PER FORNITORE (REQ-MAG-037): alla conferma del riepilogo ne
// nasce uno per ogni fornitore da cui si sta ordinando. I due campi in testa
// restano quelli che leggono la stampa, l'email e lo scadenzario; il
// fornitore sulla riga resta scritto, ed è il motivo per cui `fetteFornitore`
// continua a funzionare sullo storico già in archivio (REQ-MAG-038 lo
// rifarà).
//
// NON SI ASPETTA LA RETE. Prima erano due attese in fila — la scrittura e la
// rilettura — e con la cassa offline la conferma restava appesa per sempre:
// il tasto premuto e niente che succede, che al banco vuol dire premerlo di
// nuovo. L'id si prende da Firestore senza chiedere niente a nessuno, la
// scrittura parte in sottofondo e l'ordine si compone in memoria — non lo si
// rilegge, che la cache direbbe ancora il passato (BUG-045).
export function createPurchaseOrder({
  supplier_id,
  supplier_name,
  lines,
  total_net,
  total_gross,
  // LA BOZZA (REQ-MAG-038): «l'ordine bozza NON IMPATTA SUL MAGAZZINO. In
  // questo modo Flavio può riprendere la creazione dell'ordine in un altro
  // momento e confermarlo quando effettivamente gli serve». È l'unico stato
  // che non fa niente — niente «in assortimento», niente numeri nel
  // riepilogo dei soldi che escono — e chi la crea NON deve chiamare
  // `segnaInAssortimento`: quel passaggio è della conferma.
  bozza = false,
} = {}) {
  const fornitori = new Set((lines || []).map((l) => l.supplier_id ?? supplier_id ?? null))
  const unico = fornitori.size === 1 ? [...fornitori][0] : null
  const ref = doc(collection(db, 'purchase_orders'))
  const righe = Array.isArray(lines) ? lines : []
  const dati = {
    supplier_id: supplier_id ?? unico ?? null,
    supplier_name:
      supplier_name ??
      (unico ? (lines || []).find((l) => l.supplier_id === unico)?.supplier_name ?? '' : ''),
    status: bozza ? 'bozza' : 'inviato',
    created_at: serverTimestamp(),
    received_at: null,
    closed_at: null,
    // La storia comincia qui, con quello che è appena successo: senza la
    // prima voce, il primo cambiamento non avrebbe niente da cui distinguersi.
    storia: [movimento(bozza ? 'bozza' : 'creato', { righe: righe.length })],
    lines: righe,
    total_net: Number(total_net) || 0,
    total_gross: Number(total_gross) || 0,
  }
  bgWrite(() => setDoc(ref, dati), 'ordine fornitore')
  return {
    ...dati,
    id: ref.id,
    // La data del terminale al posto del segnaposto del server: è quella che
    // il riepilogo e lo storico mostrano nell'istante della conferma.
    created_at: new Date().toISOString(),
  }
}

// ── LA BOZZA CHE PARTE, E L'ORDINE CHE SI CHIUDE (REQ-MAG-038) ───────
//
// Tutti e due prendono l'ORDINE GIÀ IN MANO alla schermata invece del suo
// id: non c'è niente da leggere — lo stato nuovo è deciso, la storia si
// compone su quella che si ha davanti — e una lettura in mezzo a un gesto
// offline risponderebbe comunque col passato (BUG-045).
//
// CHI CONFERMA UNA BOZZA deve anche far passare i prodotti in assortimento
// (`segnaInAssortimento`): è la conferma il grilletto, non la creazione
// (REQ-MAG-037). La schermata ha già gli articoli in mano, quindi lo fa lei.
export function confermaOrdine(ordine) {
  if (!ordine?.id) throw new Error('Ordine non trovato')
  const patch = {
    status: SUL_DOCUMENTO.richiesto,
    storia: conMovimento(ordine, movimento('confermato')),
  }
  bgWrite(() => updateDoc(doc(db, 'purchase_orders', ordine.id), patch), 'ordine fornitore')
  return { ...ordine, ...patch }
}

// CHIUDERE È UN GESTO A PARTE e non arriva da solo: si può fare solo quando
// la fattura è stata riconciliata — cioè quando ordinato, ricevuto e
// fatturato tornano. Chi chiama ha già chiesto a `percheNonSiChiude` se si
// può; qui non si ricontrolla, perché quel controllo ha bisogno della
// fattura e riportarselo dietro vorrebbe dire due copie della stessa regola.
export function chiudiOrdine(ordine) {
  if (!ordine?.id) throw new Error('Ordine non trovato')
  const adesso = new Date().toISOString()
  const patch = {
    closed_at: adesso,
    storia: conMovimento(ordine, movimento('chiuso', null, adesso)),
  }
  bgWrite(() => updateDoc(doc(db, 'purchase_orders', ordine.id), patch), 'ordine fornitore')
  return { ...ordine, ...patch }
}

// UN MOVIMENTO SCRITTO DA FUORI. Collegare o generare un documento è una
// cosa che succede all'ordine, e senza questa riga la storia salterebbe
// proprio i passaggi che spiegano perché i numeri sono cambiati.
//
// REQ-MAG-031 aveva deciso di NON scrivere niente sull'ordine dal lato della
// fattura, per non avere due scrittori sullo stesso documento. Quella
// ragione resta buona per i DATI — il legame sta ancora su un campo solo,
// sulla fattura — e qui si accetta il rischio solo per la storia: se due
// terminali scrivono nello stesso istante si perde una RIGA DI DIARIO, non
// un numero.
export function registraMovimentoOrdine(ordine, tipo, dettaglio = null) {
  const voce = movimento(tipo, dettaglio)
  if (!ordine?.id || !voce) return ordine
  const patch = { storia: conMovimento(ordine, voce) }
  bgWrite(() => updateDoc(doc(db, 'purchase_orders', ordine.id), patch), 'storia ordine')
  return { ...ordine, ...patch }
}

// ── I PRODOTTI DELL'ORDINE PASSANO IN ASSORTIMENTO (REQ-MAG-037) ─────
//
// «Va in assortimento SOLO DOPO CHE FLAVIO HA CREATO L'ORDINE»: il grilletto
// è la conferma di quel fornitore nel riepilogo, e nient'altro.
//
// GLI ARTICOLI ARRIVANO GIÀ IN MANO A CHI CHIAMA — la schermata degli ordini
// ha il magazzino caricato — quindi qui non si legge niente: si calcola la
// patch, la si manda in sottofondo e si restituiscono i prodotti aggiornati,
// che è quello che la schermata mostra nell'istante del gesto.
export function segnaInAssortimento(articoli, orderId) {
  return scriviStatoAssortimento(articoli, (it) => entraInAssortimento(it, orderId), 'in assortimento')
}

// L'ordine cancellato libera i suoi prodotti: senza questo resterebbero «in
// arrivo» per sempre, da un ordine che non esiste più, e l'unico modo di
// tirarli fuori sarebbe cambiargli stato a mano uno per uno.
export function liberaDaAssortimento(articoli, orderId) {
  return scriviStatoAssortimento(articoli, (it) => esceDaAssortimento(it, orderId), 'fuori assortimento')
}

function scriviStatoAssortimento(articoli, patchDi, motivo) {
  const aggiornati = []
  for (const it of articoli || []) {
    if (!it?.id) continue
    const patch = patchDi(it)
    if (!patch) continue
    bgWrite(() => updateDoc(doc(db, 'inventory_items', it.id), patch), motivo)
    aggiornati.push({ ...it, ...patch })
  }
  return aggiornati
}

// SENZA `limit` SI LEGGONO TUTTI, ed è il pre-impostato voluto. Il limite
// c'era da quando questa era «gli ultimi ordini» in fondo alla schermata del
// magazzino, e lì andava bene; da quando è la LISTA ORDINI con i filtri
// (REQ-MAG-038) è diventato una bugia: un filtro su una lettura troncata dà
// una risposta troncata che sembra intera — chi filtra «pagati» vede i pagati
// fra i venticinque letti, e niente glielo dice. Lo stesso
// valeva per il riepilogo dei soldi che escono, che sommava un pezzo di anno,
// e per l'elenco da cui si aggancia una fattura, che non arrivava agli ordini
// più vecchi. Un troncamento silenzioso su dei soldi è peggio di una lettura
// lenta: il numero sbagliato non si vede, la lentezza sì.
export async function fetchPurchaseOrders({ limit = null } = {}) {
  const vincoli = [collection(db, 'purchase_orders'), orderBy('created_at', 'desc')]
  if (Number(limit) > 0) vincoli.push(fbLimit(Number(limit)))
  const snap = await getDocs(query(...vincoli))
  return snap.docs.map(mapPurchaseOrder)
}

export async function deletePurchaseOrder(id) {
  await deleteDoc(doc(db, 'purchase_orders', id))
}

// ── I MODELLI D'ORDINE (REQ-MAG-039) ─────────────────────────────────
//
// «Flavio potrebbe voler salvare un ordine come TEMPLATE […] con quantità
// già impostate e prodotti per fornitore già selezionati» (l'utente,
// 27/08/2026). Il documento porta un nome e delle righe, e le righe portano
// tre cose: il prodotto, il fornitore scelto e la quantità.
//
// IL PREZZO NON C'È, e non è una dimenticanza: «il modello non memorizza il
// prezzo, ma quando lo carico il prezzo sulla creazione/modifica ordine è
// sempre quello del listino del fornitore, aggiornato all'ultima fattura».
// La catena è fattura → listino → ordine e il modello non ci si mette in
// mezzo. Chi aggiungesse un campo prezzo qui riaprirebbe il difetto che il
// confronto ordine-fattura (REQ-MAG-038) esiste apposta per scoprire.
//
// STA IN UNA COLLEZIONE SUA e non fra gli ordini: un modello non è un ordine
// — non ha stato, non ha una data di consegna, non entra nei soldi che
// escono — e tenerlo lì vorrebbe dire che ogni filtro e ogni totale della
// Lista ordini debba ricordarsi di scartarlo.
function mapModelloOrdine(snap) {
  const m = snap.data() || {}
  return {
    id: snap.id,
    nome: m.nome ?? '',
    // Le righe si rileggono normalizzate: una quantità arrivata come stringa
    // da una versione più vecchia non deve finire dentro una moltiplicazione.
    righe: (Array.isArray(m.righe) ? m.righe : []).map((r) => ({
      item_id: r?.item_id ?? null,
      item_name: r?.item_name ?? null,
      supplier_id: r?.supplier_id ?? null,
      qty: Number(r?.qty) || 0,
    })),
    created_at: m.created_at ?? null,
    updated_at: m.updated_at ?? null,
  }
}

export async function fetchModelliOrdine() {
  const snap = await getDocs(orderTemplatesCol)
  // In ordine di nome, e l'ordinamento si fa in memoria: sono una manciata di
  // documenti, e un `orderBy` su Firestore vorrebbe dire un indice da tenere
  // allineato per una tendina di cinque voci.
  return snap.docs
    .map(mapModelloOrdine)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it-IT'))
}

// Salva un modello, nuovo o già esistente. NON SI ASPETTA LA RETE e non si
// rilegge niente: il modello che torna è composto qui, così compare in
// tendina nell'istante in cui si tocca «Salva» anche con la cassa offline.
// Passando l'`id` di uno che c'è già lo si aggiorna — ed è la stessa strada
// per cambiargli le righe e per rinominarlo.
export function salvaModelloOrdine({ id = null, nome, righe = [] } = {}) {
  const nomePulito = String(nome ?? '').trim()
  if (!nomePulito) throw new Error('Serve un nome per il modello')
  const ref = id ? doc(db, 'purchase_order_templates', id) : doc(orderTemplatesCol)
  const adesso = new Date().toISOString()
  const dati = {
    nome: nomePulito,
    righe: (righe || []).map((r) => ({
      item_id: r.item_id,
      item_name: r.item_name ?? null,
      supplier_id: r.supplier_id ?? null,
      qty: Number(r.qty) || 0,
    })),
    updated_at: adesso,
  }
  // La data di nascita si scrive una volta sola: il `merge` lascia dov'è
  // quella del modello che c'era già.
  if (!id) dati.created_at = adesso
  bgWrite(() => setDoc(ref, dati, { merge: true }), 'modello d’ordine')
  return { id: ref.id, created_at: adesso, ...dati }
}

export function eliminaModelloOrdine(id) {
  if (!id) return
  bgWrite(() => deleteDoc(doc(db, 'purchase_order_templates', id)), 'modello d’ordine')
}

// ── UNA STRADA SOLA PER LA MERCE CHE ENTRA (REQ-MAG-029, REQ-MAG-030) ─
//
// Il carico di un ordine consegnato e i prodotti aggiunti a una fattura
// fanno lo stesso mestiere: prezzo accettato → riga di listino di QUEL
// fornitore con la sua data → costo di riferimento del prodotto → giacenza
// e movimento. Erano la stessa sequenza scritta due volte, ed è il genere
// di duplicato che si scopre il mese dopo, quando una delle due copie ha
// smesso di aggiornare il listino e nessuno se n'è accorto.
//
// LE DUE LEVE SONO SEPARATE PERCHÉ AL BANCO LO SONO. Dalla fattura si
// possono aggiungere le righe SENZA toccare le giacenze — «magari me li
// sono caricati già prima in altro modo» (Flavio, REQ-MAG-030) — e senza
// muovere i prezzi, perché chi non risponde alla domanda non aggiorna
// niente. Alla consegna di un ordine sono accese tutte e due.
function registraAcquisto({
  articolo,
  itemId,
  qtyPackages,
  costo,
  supplierId = null,
  adesso,
  motivo,
  carica = true,
  aggiornaPrezzo = true,
  nasce = false,
  // I campi dello stato commerciale da riscrivere insieme al carico
  // (REQ-MAG-037): il prodotto esce da «in assortimento» e torna a quello di
  // prima. Si passa già calcolata — la macchina degli stati sta in
  // `statoAssortimento.js`, dove si prova senza Firebase.
  patchStato = null,
  // Il prezzo che quel fornitore faceva PRIMA di questa merce, letto dalla
  // riga di listino insieme all'articolo: serve solo allo storico, e si
  // legge prima di scrivere perché dopo la cache direbbe già il nuovo.
  prezzoPrima = null,
  // Da dove viene il prezzo che si sta accettando (REQ-MAG-035): alla
  // consegna lo detta la bolla, sulla fattura il documento fiscale.
  origine = 'consegna',
}) {
  // Nessun articolo, nessuna giacenza da alzare e nessun costo da scrivere:
  // il documento resta valido lo stesso, il magazzino non c'entra.
  if (!articolo) return
  const { addQty, bottles_total } = caricoDaConfezioni(articolo, qtyPackages)
  // I VALORI CHE IL CARICO SCRIVE SUL PRODOTTO. Su un prodotto che c'è già
  // sono una patch e la giacenza si somma; su uno che nasce adesso
  // (REQ-MAG-032) sono i suoi valori di partenza, perché `increment()` non ha
  // niente da incrementare su un documento che non esiste.
  const patch = {}
  if (carica) {
    patch.stock = nasce ? addQty : increment(addQty)
    if (bottles_total != null) patch.bottles_total = bottles_total
  }
  // IL COSTO DEL PRODOTTO RESTA UN NUMERO SOLO: l'ultimo effettivamente
  // pagato, chiunque fosse il fornitore. È quello che valorizza il
  // magazzino e il costo ricetta; il confronto fra fornitori vive nel
  // listino, che è un'altra cosa (REQ-MAG-029). Il PREZZO DI VENDITA del
  // menu non lo tocca nessuno: è di Flavio.
  if (aggiornaPrezzo) patch.cost = costo
  // LA MERCE È ARRIVATA, QUINDI SI ESCE DA «IN ASSORTIMENTO» (REQ-MAG-037).
  // È il contrario di quello che si faceva fino a ieri, e non per caso: da
  // quando «in assortimento» vuol dire «c'è un ordine aperto», la consegna è
  // il momento in cui quello stato finisce e il prodotto torna a essere in
  // linea o premium com'era prima.
  if (patchStato) Object.assign(patch, patchStato)
  const ref = doc(db, 'inventory_items', itemId)
  if (nasce) {
    bgWrite(
      () => setDoc(ref, { ...articolo, ...patch, created_at: serverTimestamp() }),
      `prodotto nuovo da ${motivo}`
    )
  } else if (Object.keys(patch).length > 0) {
    bgWrite(() => updateDoc(ref, patch), `carico ${motivo}`)
  }
  if (carica) {
    bgWrite(
      () =>
        addDoc(movementsCol, {
          item_id: itemId,
          item_name: articolo.name,
          type: 'load',
          qty: addQty,
          unit: articolo.unit ?? null,
          reason: motivo,
          created_at: serverTimestamp(),
        }),
      `movimento ${motivo}`
    )
  }
  // IL PREZZO ACCETTATO AGGIORNA IL LISTINO DI QUEL FORNITORE, con la sua
  // data. È anche il modo in cui i listini si popolano da soli usandoli:
  // chi ordina e riceve scrive il prezzo vero senza compilare niente a
  // parte.
  const rigaId = aggiornaPrezzo ? idRigaListino(supplierId, itemId) : null
  if (rigaId) {
    bgWrite(
      () =>
        setDoc(
          doc(db, 'supplier_prices', rigaId),
          {
            supplier_id: supplierId,
            item_id: itemId,
            price: costo,
            last_price: costo,
            last_price_at: adesso,
          },
          { merge: true }
        ),
      'listino fornitore'
    )
    // E LA VARIAZIONE RESTA SCRITTA (REQ-MAG-035). La riga di listino tiene
    // un prezzo solo: senza questa seconda scrittura, l'aumento che si sta
    // accettando cancellerebbe per sempre quello che si pagava prima.
    scriviVariazionePrezzo({
      supplier_id: supplierId,
      item_id: itemId,
      price: costo,
      prezzo_prima: prezzoPrima,
      origine,
      quando: adesso,
    })
  }
}

// Il prezzo che quel fornitore faceva finora, letto dalla riga di listino.
// Si legge INSIEME agli articoli, nella lettura che precede le scritture:
// dopo non si potrebbe più: la riga sarebbe già stata riscritta in cache.
async function prezzoDiListino(supplierId, itemId) {
  const rigaId = idRigaListino(supplierId, itemId)
  if (!rigaId) return null
  try {
    const snap = await getDoc(doc(db, 'supplier_prices', rigaId))
    const p = snap.exists() ? snap.data()?.price : null
    return p == null ? null : Number(p)
  } catch {
    // Il listino non è il motivo per cui si sta caricando la merce: se non
    // si riesce a leggerlo, la consegna va avanti e lo storico registra una
    // variazione senza il prezzo di prima.
    return null
  }
}

// ── I TRE LIVELLI DELLA RIGA D'ORDINE (REQ-MAG-029) ─────────────────
//
// Flavio: «io mi creo l'ordine che devo mandare al fornitore e in quel
// momento lui non mi carica ancora i prodotti; una volta che me li ha
// portati io faccio consegnato, e dopo mi fa il carico». IL CARICO A
// MAGAZZINO AVVIENE QUI, al passaggio a CONSEGNATO — non alla creazione
// dell'ordine e non al pagamento.
//
// Prima c'era `receivePurchaseOrder`, che caricava l'ordine INTERO in un
// colpo al «ricevuto»: con un ordine di più fornitori quel gesto non esiste
// più, perché i fornitori consegnano in giorni diversi.
//
// `indici` sono le posizioni delle righe nell'array `lines`; `prezzi` è la
// correzione del prezzo per riga, indicizzata allo stesso modo — ALLA
// CONSEGNA SI CORREGGE IL PREZZO, MAI IL FORNITORE: «non posso modificare
// il fornitore perché da lui l'ho comprato» (Flavio).
//
// ── E ADESSO ANCHE LE QUANTITÀ (REQ-MAG-038) ─────────────────────────
//
// «Quando l'ordine arriva deve poter MODIFICARE L'ORDINE in base a quello
// che ha effettivamente ricevuto» (utente, 27/08). `quantita` è la quantità
// davvero arrivata, riga per riga, e IL CARICO A MAGAZZINO VA SU QUELLA:
// caricare l'ordinato quando è arrivato meno vuol dire una giacenza che
// nessuno ha sullo scaffale.
//
// L'ORDINATO NON SI SOVRASCRIVE. `qty_packages` resta quello che si è
// chiesto e il ricevuto va in `qty_received`; lo stesso per il prezzo, dove
// `unit_cost_ordinato` conserva quello di partenza. Sono i due elenchi che
// il confronto tiene distinti, e se il ricevuto cancellasse l'ordinato la
// cassa mancante non la vedrebbe più nessuno — la si pagherebbe in fattura.
export async function consegnaRigheOrdine(id, { indici = null, prezzi = {}, quantita = {} } = {}) {
  const orderRef = doc(db, 'purchase_orders', id)
  const orderSnap = await getDoc(orderRef)
  if (!orderSnap.exists()) throw new Error('Ordine non trovato')
  const order = orderSnap.data()
  const lines = (Array.isArray(order.lines) ? order.lines : []).map((l) => ({ ...l }))

  const scelti = (indici ?? lines.map((_, i) => i)).filter(
    (i) =>
      lines[i] &&
      livelloDi(lines[i]) === 'richiesto' &&
      (Number(lines[i].qty_packages) || 0) > 0
  )
  if (scelti.length === 0) return mapPurchaseOrder(orderSnap)

  // PRIMA SI LEGGE TUTTO, POI SI SCRIVE. `articoloScrivibile` si ferma se il
  // magazzino è ancora scritto alla vecchia maniera (BUG-029): fermandosi a
  // metà del giro, metà ordine risulterebbe consegnato e metà no, e nessuno
  // saprebbe più dove ricominciare.
  const [snaps, prezziPrima] = await Promise.all([
    Promise.all(scelti.map((i) => getDoc(doc(db, 'inventory_items', lines[i].item_id)))),
    // Il prezzo di listino di prima, per lo storico (REQ-MAG-035): si legge
    // qui, nella stessa attesa degli articoli, perché più avanti la riga di
    // listino sarà già stata riscritta e la cache direbbe il prezzo nuovo.
    Promise.all(
      scelti.map((i) =>
        prezzoDiListino(lines[i].supplier_id ?? order.supplier_id ?? null, lines[i].item_id)
      )
    ),
  ])
  const articoli = snaps.map(articoloScrivibile)

  // Firestore non accetta `serverTimestamp()` DENTRO un array: la data della
  // riga è quella del terminale, come per le comande.
  const adesso = new Date().toISOString()
  // I MOVIMENTI DA SCRIVERE NELLA STORIA (REQ-MAG-038). Si raccolgono
  // mentre si scorrono le righe e si scrivono con loro, nella stessa
  // `updateDoc`: una quantità corretta all'arrivo cancella quella di prima,
  // e quello che non si scrive adesso non si ricostruisce dopo.
  const movimenti = []

  for (let k = 0; k < scelti.length; k++) {
    const i = scelti[k]
    const l = lines[i]
    const corretto = prezzi?.[i]
    const costo =
      corretto == null || corretto === '' || !(Number(corretto) >= 0)
        ? Number(l.unit_cost) || 0
        : Number(corretto)
    const ordinati = Number(l.qty_packages) || 0
    const dettoRicevuto = quantita?.[i]
    // Il campo lasciato com'era vuol dire «è arrivato quello che ho
    // chiesto», che è il caso normale. Uno svuotato non è zero: zero lo si
    // scrive, e chi non ha ricevuto niente toglie la spunta alla riga.
    const ricevuti =
      dettoRicevuto == null || dettoRicevuto === '' || !(Number(dettoRicevuto) >= 0)
        ? ordinati
        : Number(dettoRicevuto)
    // Il prezzo dell'ordine si conserva la PRIMA volta che lo si corregge:
    // riscriverlo a ogni consegna parziale lo sostituirebbe con quello della
    // consegna precedente, e il confronto direbbe sempre «nessuna
    // differenza».
    if (l.unit_cost_ordinato == null) l.unit_cost_ordinato = Number(l.unit_cost) || 0
    if (prezzoCambiato(l.unit_cost_ordinato, costo))
      movimenti.push(movimento('prezzo', { nome: l.name, da: l.unit_cost_ordinato, a: costo }, adesso))
    if (ricevuti !== ordinati)
      movimenti.push(movimento('quantita', { nome: l.name, da: ordinati, a: ricevuti }, adesso))
    l.unit_cost = costo
    l.qty_received = ricevuti
    l.stato = 'consegnato'
    l.delivered_at = adesso

    // IL PRODOTTO CHE NON C'È IN ANAGRAFICA NASCE QUI (REQ-MAG-032). Prima
    // la riga avanzava a «consegnato» e basta: niente giacenza, nessun
    // movimento, nessun messaggio — la merce di una referenza nuova spariva
    // mentre a schermo la consegna sembrava andata a buon fine. Adesso il
    // prodotto si crea CON LO STESSO id della riga: l'ordine continua a
    // puntare a un prodotto vero, e una seconda consegna della stessa
    // referenza ritrova quello di prima invece di farne un doppione.
    //
    // ALLA CONSEGNA IL PREZZO SI ACCETTA SEMPRE: quello scritto qui è quello
    // del documento in mano al fornitore, quindi è il prezzo vero.
    const nasce = !articoli[k]
    registraAcquisto({
      articolo: articoli[k] ?? prodottoDaRigaOrdine(l),
      nasce,
      itemId: l.item_id,
      // SI CARICA QUELLO CHE È ARRIVATO, non quello che si era chiesto.
      qtyPackages: ricevuti,
      costo,
      supplierId: l.supplier_id ?? order.supplier_id ?? null,
      adesso,
      motivo: 'ordine fornitore',
      prezzoPrima: prezziPrima[k],
      origine: 'consegna',
      // La merce è arrivata: il prodotto esce dall'ordine e torna allo stato
      // di prima (REQ-MAG-037). Sui prodotti che nascono adesso non c'è
      // niente da restituire.
      patchStato: nasce ? null : esceDaAssortimento(articoli[k], id),
    })
  }

  movimenti.unshift(movimento('consegnato', { righe: scelti.length }, adesso))
  return scriviRigheOrdine(orderRef, orderSnap, lines, movimenti)
}

// ── «PAGATO» NON SI SCRIVE PIÙ SULLA RIGA (REQ-MAG-038) ──────────────
//
// C'era `segnaRighePagate`, che portava le righe consegnate al livello
// «pagato». Non c'è più, ed è una cancellazione voluta: «il discorso degli
// ordini pagati è già nello scadenzario» (utente, 27/08). Lo stato del
// pagamento sta in un posto solo — `paid` sulla fattura — e chi paga paga un
// DOCUMENTO, non un ordine: il bonifico porta sopra il numero della fattura.
// Due copie dello stesso stato divergono sempre, e il giorno che divergono
// il totale «Da pagare» smette di valere qualcosa proprio a fine mese.
//
// IL LIVELLO 'pagato' SULLA RIGA RESTA LEGGIBILE (`LIVELLI` in listini.js):
// sta scritto su ordini veri, e toglierlo di lì farebbe rileggere una riga
// pagata come se non fosse mai stata consegnata. Non si scrive più, si legge
// ancora.
//
// SEGNARE PAGATO SENZA DOCUMENTO NON ESISTE: si crea la riga nello
// scadenzario, la si marca «Nessun documento» e la si paga
// (`generaFatturaDaOrdine` qui sotto).

// ── TOGLIERE UN ITEM DA UN ORDINE GIÀ FATTO (REQ-MAG-037) ────────
//
// «Quello che Flavio può fare è eliminare quell'item dall'ordine ANCHE SE
// GIÀ FATTO, e si ripristina lo stato in linea o premium» (utente, 27/08).
// È una delle due sole strade per uscire da «in assortimento», e prima di
// oggi non esisteva.
//
// SI TOGLIE SOLO QUELLO CHE NON È ANCORA ARRIVATO. Una riga già consegnata
// ha alzato la giacenza, scritto un movimento e aggiornato il listino:
// toglierla vorrebbe dire scaricare merce che sta sullo scaffale, e non è
// quello che è stato chiesto. Chi ha ricevuto per sbaglio corregge con una
// rettifica di magazzino, che è il gesto fatto apposta.
//
// L'ordine che resta senza righe NON si cancella: è comunque un ordine che
// è stato mandato a un fornitore, e farlo sparire vorrebbe dire non poter
// più spiegare la telefonata che arriva dopo.
export async function togliRigaOrdine(id, { indice, item_id = null } = {}) {
  const orderRef = doc(db, 'purchase_orders', id)
  const orderSnap = await getDoc(orderRef)
  if (!orderSnap.exists()) throw new Error('Ordine non trovato')
  const order = orderSnap.data()
  const lines = (Array.isArray(order.lines) ? order.lines : []).map((l) => ({ ...l }))
  const riga = lines[indice]
  if (!riga) return { ordine: mapPurchaseOrder(orderSnap), articolo: null }
  if (livelloDi(riga) !== 'richiesto')
    throw new Error('La merce di questa riga è già arrivata: si corregge dal magazzino.')
  lines.splice(indice, 1)
  const articolo = await ripristinaStatoFuoriOrdine(item_id ?? riga.item_id, id)
  const voce = movimento('riga_tolta', { nome: riga.name || null })
  return { ordine: scriviRigheOrdine(orderRef, orderSnap, lines, [voce]), articolo }
}

// Rimette il prodotto allo stato che aveva prima dell'ordine, se quell'ordine
// era l'ultimo a tenerlo in assortimento. Legge il prodotto perché la memoria
// sta lì e chi chiama non ce l'ha sempre in mano; offline la lettura risponde
// dalla cache, che è la stessa strada del carico.
async function ripristinaStatoFuoriOrdine(itemId, orderId) {
  if (!itemId) return null
  const ref = doc(db, 'inventory_items', itemId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const articolo = mapItem(snap)
  const patch = esceDaAssortimento(articolo, orderId)
  if (!patch) return articolo
  bgWrite(() => updateDoc(ref, patch), 'fuori assortimento')
  return { ...articolo, ...patch }
}

// ── LO STATO CAMBIATO A MANO TOGLIE IL PRODOTTO DAGLI ORDINI ───────
//
// «Se cambia lo stato manualmente, il prodotto va eliminato dall'ordine»
// (utente, 27/08). Sono la stessa decisione presa dai due capi e non possono
// divergere: un prodotto non più «in assortimento» che resta dentro un ordine
// aperto è un ordine che nessuno sa più di aver fatto.
//
// Lo stato sul prodotto lo scrive chi salva la scheda del magazzino, con la
// patch di `cambioAMano`: qui si taglia solo il legame dall'altra parte.
export async function togliProdottoDagliOrdini(itemId, orderIds = []) {
  const toccati = []
  for (const orderId of orderIds || []) {
    const orderRef = doc(db, 'purchase_orders', orderId)
    const orderSnap = await getDoc(orderRef)
    if (!orderSnap.exists()) continue
    const order = orderSnap.data()
    const lines = (Array.isArray(order.lines) ? order.lines : []).map((l) => ({ ...l }))
    // Solo le righe ancora in attesa: quello che è già arrivato è storia
    // dell'ordine, e cancellarlo farebbe sparire una consegna dai conti.
    const restano = lines.filter((l) => !(l.item_id === itemId && livelloDi(l) === 'richiesto'))
    if (restano.length === lines.length) continue
    toccati.push(scriviRigheOrdine(orderRef, orderSnap, restano))
  }
  return toccati
}

// Scrive le righe toccate e ricompone l'ordine IN MEMORIA. Non lo si
// rilegge: la scrittura parte in sottofondo, quindi nell'istante della
// rilettura la cache conterrebbe ancora la versione di prima e la schermata
// mostrerebbe il passato (è stato il difetto di BUG-045).
function scriviRigheOrdine(orderRef, orderSnap, lines, movimenti = []) {
  const totali = purchaseOrderTotals(lines)
  const prima = mapPurchaseOrder(orderSnap)
  // Lo stato si ricava dalle righe, ma una BOZZA resta una bozza: le sue
  // righe sono tutte «richieste» per definizione, e senza lo stato di prima
  // la prima modifica la manderebbe da sola al fornitore (REQ-MAG-038).
  const status = statoOrdine({ lines, status: prima.status })
  const patch = {
    lines,
    total_net: totali.net,
    total_gross: totali.gross,
    status,
    // La storia si compone su quella che si ha in mano e va nella STESSA
    // scrittura delle righe: due scritture, e una delle due può restare
    // indietro — resterebbe indietro proprio il diario che spiega l'altra.
    storia: (movimenti || []).filter(Boolean).reduce((st, v) => conMovimento({ storia: st }, v), storiaDi(prima)),
  }
  // La data del ricevimento si scrive una volta sola, quando non resta più
  // niente da consegnare.
  const primoRicevimento = status === 'ricevuto' && !prima.received_at
  if (primoRicevimento) patch.received_at = serverTimestamp()
  bgWrite(() => updateDoc(orderRef, patch), 'ordine fornitore')
  return {
    ...prima,
    ...patch,
    received_at: primoRicevimento ? new Date().toISOString() : prima.received_at,
  }
}

// --- SCADENZARIO FORNITORI (documenti / pagamenti) ---

function mapInvoice(snap) {
  const i = snap.data() || {}
  return {
    id: snap.id,
    supplier_id: i.supplier_id ?? null,
    supplier_name: i.supplier_name ?? '',
    number: i.number ?? '',
    doc_type: i.doc_type ?? 'Proforma',
    date: i.date ?? null, // YYYY-MM-DD
    amount: Number(i.amount) || 0,
    paid: !!i.paid,
    notes: i.notes ?? null,
    // LE RIGHE (REQ-MAG-030). Una fattura scritta prima di questa voce non
    // ce le ha, ed è la normalità di tutte quelle già in archivio: la
    // testata resta valida, le righe si aggiungono quando qualcuno le mette.
    lines: Array.isArray(i.lines) ? i.lines : [],
    // IL LEGAME CON LA FETTA (REQ-MAG-031): l'ordine da cui viene la merce
    // di questo documento. Il fornitore è già qui sopra, e la coppia dei due
    // è la fetta. Chi non ce l'ha è una fattura senza ordine, che è uno dei
    // due buchi da vedere a colpo d'occhio.
    order_id: i.order_id ?? null,
    // IL DOCUMENTO VERO (REQ-MAG-033): foto o PDF su Storage. `null` per
    // tutte quelle registrate a mano senza allegare niente, che è il terzo
    // buco da vedere a colpo d'occhio.
    attachment: i.attachment ?? null,
    // GENERATA DA NOI O ARRIVATA DAL FORNITORE (REQ-MAG-038). Una fattura
    // che ci siamo fatti da soli coi prezzi dell'ordine dice quanto ci si
    // ASPETTA di pagare; quella del fornitore dice quanto chiede. Confonderle
    // vorrebbe dire dare per buona una cifra che nessuno ha ancora emesso.
    generata: !!i.generata,
    // LE CORREZIONI FATTE A QUESTO DOCUMENTO (REQ-MAG-041). Come la storia
    // dell'ordine: un array sul documento, vuoto per tutti quelli scritti
    // prima di questa voce — e non è un errore, è la normalità dell'archivio.
    storia: Array.isArray(i.storia) ? i.storia : [],
    created_at: toIso(i.created_at),
  }
}

export async function fetchSupplierInvoices({ limit = 100 } = {}) {
  const snap = await getDocs(
    query(collection(db, 'supplier_invoices'), orderBy('date', 'desc'), fbLimit(limit))
  )
  return snap.docs.map(mapInvoice)
}

export async function createSupplierInvoice(invoice) {
  const ref = await addDoc(collection(db, 'supplier_invoices'), {
    ...invoice,
    amount: Number(invoice.amount) || 0,
    paid: !!invoice.paid,
    created_at: serverTimestamp(),
  })
  return mapInvoice(await getDoc(ref))
}

export async function updateSupplierInvoice(id, patch) {
  await updateDoc(doc(db, 'supplier_invoices', id), patch)
}

// ── CORREGGERE UN DOCUMENTO (REQ-MAG-041) ────────────────────────────
//
// «In Scadenzario i documenti creati devono essere modificabili nel caso di
// variazione o errore» (Flavio, 03/09/2026).
//
// SI CORREGGE, NON SI STRAVOLGE: nella patch entrano SOLO i campi della
// testata (`CAMPI_MODIFICABILI`). Righe, allegato e `order_id` non sono
// nominati, quindi restano dove sono — e questa non è una precauzione
// teorica: prima di questa voce l'unico modo di cambiare una cifra era
// cancellare il documento e rifarlo, che quelle tre cose se le portava via.
//
// NIENTE `await` E NESSUNA RILETTURA. Il documento di partenza è quello che
// la schermata ha già in mano, il risultato si COMPONE in memoria e la
// scrittura parte in sottofondo: rileggendo, la cache risponderebbe con la
// versione di prima (BUG-045).
//
// LA TRACCIA STA SUL DOCUMENTO. Una correzione su una fattura già pagata è
// legittima — è proprio il caso di Flavio — ma è il gesto che a fine mese
// qualcuno vorrà spiegarsi, e allora deve trovarci scritto cosa è cambiato,
// da cosa a cosa, e che quei soldi erano già usciti.
export function modificaFattura(fattura, modifiche = {}) {
  if (!fattura?.id) throw new Error('Documento non trovato')
  const dopo = { ...fattura }
  for (const campo of CAMPI_MODIFICABILI) {
    if (campo in modifiche) dopo[campo] = modifiche[campo]
  }
  dopo.amount = Number(dopo.amount) || 0

  const motivo = modificaAmmessa(fattura, dopo)
  if (motivo) throw new Error(motivo)

  const cambi = cambiFattura(fattura, dopo)
  // NIENTE SCRITTURA SE NIENTE È CAMBIATO: aprire il modulo, guardarlo e
  // chiuderlo non deve lasciare una riga di storia che dice «corretto» senza
  // dire cosa — è così che uno storico smette di valere qualcosa.
  if (cambi.length === 0) return fattura

  const voce = movimento('documento_corretto', { cambi, pagato: !!fattura.paid })
  const patch = { storia: conMovimento(fattura, voce) }
  for (const campo of CAMPI_MODIFICABILI) patch[campo] = dopo[campo] ?? null

  bgWrite(() => updateDoc(doc(db, 'supplier_invoices', fattura.id), patch), 'documento corretto')
  return { ...fattura, ...patch }
}

// CHI CANCELLA LA FATTURA PORTA VIA ANCHE L'ALLEGATO (REQ-MAG-033): il file
// resterebbe su Storage per sempre, e senza il documento che lo nomina
// nessuno saprebbe più di chi era né perché è lì. Prima se ne va la fattura
// — è quella che conta e la si aspetta — poi il file, che è un tentativo e
// non solleva niente.
export async function deleteSupplierInvoice(id) {
  const ref = doc(db, 'supplier_invoices', id)
  const snap = await getDoc(ref)
  const allegato = snap.exists() ? mapInvoice(snap).attachment : null
  await deleteDoc(ref)
  if (allegato?.path) await eliminaAllegato(allegato.path)
}

// ── L'ALLEGATO: IL DOCUMENTO VERO, NON SOLO UN NUMERO (REQ-MAG-033) ──
//
// «Allegare = il documento vero (foto/PDF), non solo un numero. Serve lo
// Storage» (l'utente, 20/08).
//
// QUI SI ASPETTA, ed è l'eccezione che conferma la regola: non c'è modo di
// scrivere sulla fattura il riferimento a un file che non è ancora su
// Storage, e comporre in memoria un allegato che potrebbe non esistere
// vorrebbe dire una fattura che dice di avere una foto e non ce l'ha. Questa
// è una schermata di gestione e non la coda: l'attesa si può permettere,
// purché si veda — e a mostrarla è il pannello.
//
// La scrittura su Firestore invece resta in sottofondo come tutte le altre,
// e il documento aggiornato si COMPONE: la cache risponderebbe con quello di
// prima (BUG-045).
export async function allegaDocumentoAFattura(id, file) {
  const ref = doc(db, 'supplier_invoices', id)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Documento non trovato')
  const fattura = mapInvoice(snap)

  const allegato = await caricaAllegatoFattura(id, file)

  bgWrite(() => updateDoc(ref, { attachment: allegato }), 'allegato fattura')
  // IL VECCHIO SI TOGLIE DOPO CHE IL NUOVO È SU. Sostituire è caricare e
  // basta: se il caricamento non riesce, la riga qui sopra non è mai stata
  // eseguita e sulla fattura c'è ancora l'allegato di prima, intero.
  if (fattura.attachment?.path && fattura.attachment.path !== allegato.path) {
    await eliminaAllegato(fattura.attachment.path)
  }
  return { ...fattura, attachment: allegato }
}

// Togliere l'allegato è cancellarlo davvero: tenerlo su Storage senza niente
// che lo nomini sarebbe lo stesso orfano di una fattura eliminata.
export async function togliAllegatoDaFattura(id) {
  const ref = doc(db, 'supplier_invoices', id)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Documento non trovato')
  const fattura = mapInvoice(snap)
  bgWrite(() => updateDoc(ref, { attachment: null }), 'allegato fattura')
  if (fattura.attachment?.path) await eliminaAllegato(fattura.attachment.path)
  return { ...fattura, attachment: null }
}

// ── LA FATTURA SI AGGANCIA ALLA FETTA DEL SUO FORNITORE (REQ-MAG-031) ─
//
// «La vista degli ordini contiene più fornitori, ma la fattura è collegata
// all'ordine PER IL FORNITORE, perché è il fornitore che rilascia la
// fattura» (l'utente, 20/08). Si scrive un campo solo, `order_id` sulla
// fattura: il fornitore ce l'ha già, e la coppia dei due è la fetta.
//
// `order_id` a null STACCA, ed è lo stesso gesto al contrario: un documento
// attaccato all'ordine sbagliato si stacca, non si corregge di nascosto.
export async function collegaFatturaAFetta(id, { order_id = null } = {}) {
  const ref = doc(db, 'supplier_invoices', id)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Documento non trovato')
  const fattura = mapInvoice(snap)
  if (order_id) await verificaAggancio(order_id, fattura)
  // Non si rilegge quello che si è appena scritto: la scrittura parte in
  // sottofondo e la cache risponderebbe col documento di prima (BUG-045).
  bgWrite(() => updateDoc(ref, { order_id: order_id || null }), 'legame fattura-ordine')
  return { ...fattura, order_id: order_id || null }
}

// LA GUARDIA STA DAVANTI ALLA SCRITTURA, non solo davanti all'elenco delle
// candidate: le schermate aperte sono due e i terminali del locale pure, e
// una fetta coperta da un altro terminale un minuto fa non si vede.
//
// La regola è la stessa che filtra gli elenchi — `aggancioAmmesso` in
// fatture.js — e viene chiamata, non riscritta: due copie della stessa
// regola divergono, e quella che perde è sempre la copia che scrive.
async function verificaAggancio(orderId, fattura) {
  const ordineSnap = await getDoc(doc(db, 'purchase_orders', orderId))
  if (!ordineSnap.exists()) throw new Error('Ordine non trovato')
  const ordine = mapPurchaseOrder(ordineSnap)
  const fetta = fetteFornitore(ordine).find((f) => f.supplier_id === fattura.supplier_id)
  if (!fetta) {
    throw new Error(`In quell’ordine non c’è niente di ${fattura.supplier_name || 'questo fornitore'}`)
  }
  // Le altre fatture di QUELL'ordine, non tutte: è l'unica lettura che serve
  // per sapere se la fetta è già coperta.
  const altre = await getDocs(
    query(collection(db, 'supplier_invoices'), where('order_id', '==', orderId))
  )
  const motivo = aggancioAmmesso(fattura, fetta, { fatture: altre.docs.map(mapInvoice) })
  if (motivo) throw new Error(motivo)
}

// ── LA FATTURA GENERATA DALL'ORDINE (REQ-MAG-038) ────────────────────
//
// Sono due strade che finiscono nello stesso posto: si ASSOCIA un documento
// che c'è già (`collegaFatturaAFetta`), oppure «la posso anche generare
// dall'ordine, coi prezzi dell'ordine» (utente, 27/08) — che sono quelli del
// listino di quel fornitore (REQ-MAG-035).
//
// LA STESSA STRADA SERVE A «NESSUN DOCUMENTO»: con `doc_type` a «Nessun
// documento» e `paid` acceso nasce la riga di scadenzario che paga un ordine
// per cui non è arrivata nessuna carta. Non è un secondo modo di segnare
// pagato un ordine — è l'unico, e passa comunque dallo scadenzario, se no
// quei soldi sarebbero gli unici a non comparire nel totale del mese.
//
// LE RIGHE SONO QUELLE DELL'ORDINE, prese con `righeDaOrdine`: la stessa
// funzione con cui lo scadenzario le ricopia quando si riprende un ordine.
// Una seconda versione qui vorrebbe dire due forme della stessa riga.
//
// NON SI ASPETTA LA RETE: l'id si prende in locale, la scrittura parte in
// sottofondo e il documento si compone in memoria (BUG-045).
export function generaFatturaDaOrdine(ordine, { doc_type = 'Proforma', paid = false, date = null } = {}) {
  if (!ordine?.id) throw new Error('Ordine non trovato')
  if (!ordine.supplier_id) throw new Error('Questo ordine non ha un fornitore: il documento lo emette qualcuno.')
  const righe = righeDaOrdine(ordine, ordine.supplier_id)
  const totali = purchaseOrderTotals(righe)
  const ref = doc(collection(db, 'supplier_invoices'))
  const dati = {
    supplier_id: ordine.supplier_id,
    supplier_name: ordine.supplier_name ?? '',
    number: null,
    doc_type,
    date: date || new Date().toISOString().slice(0, 10),
    // L'IMPORTO È IL LORDO, come su qualunque documento dello scadenzario:
    // è la cifra che si paga, non l'imponibile.
    amount: totali.gross,
    paid: !!paid,
    notes: null,
    lines: righe,
    order_id: ordine.id,
    attachment: null,
    generata: true,
    created_at: serverTimestamp(),
  }
  bgWrite(() => setDoc(ref, dati), 'documento generato dall’ordine')
  return { ...dati, id: ref.id, created_at: new Date().toISOString() }
}

// PAGATO SI SCRIVE SULLA FATTURA, e da qualunque schermata lo si tocchi è
// sempre quel campo (REQ-MAG-038). Niente `await` prima di mostrare l'esito
// e nessuna rilettura: il documento aggiornato si compone su quello in mano.
export function segnaFatturaPagata(fattura, paid) {
  if (!fattura?.id) throw new Error('Documento non trovato')
  bgWrite(() => updateDoc(doc(db, 'supplier_invoices', fattura.id), { paid: !!paid }), 'fattura pagata')
  return { ...fattura, paid: !!paid }
}

// ── IL PREZZO DELLA FATTURA ALLINEA IL LISTINO (REQ-MAG-035/038) ─────
//
// «Il confronto non finisce in un avviso»: mostrare la differenza e lasciare
// il listino fermo vorrebbe dire far ricomparire lo stesso scarto al giro
// dopo, e a quel punto l'avviso diventa rumore che si impara a ignorare.
//
// PASSA DA `registraAcquisto`, con il carico SPENTO: qui non entra niente in
// magazzino — la merce è già entrata alla consegna — si tocca solo il prezzo
// di quel fornitore e la sua variazione nello storico, con origine
// «fattura». È la strada unica per cui un prezzo si aggiorna, e una seconda
// copia smetterebbe di aggiornare il listino senza che nessuno se ne accorga.
export async function allineaPrezziDaFattura(ordine, fattura) {
  const righe = prezziDaAllineare(ordine, fattura)
  if (righe.length === 0) return ordine
  const supplierId = fattura?.supplier_id ?? ordine?.supplier_id ?? null
  // PRIMA SI LEGGE TUTTO, POI SI SCRIVE: il prezzo di listino di prima va
  // letto adesso, perché dopo la riga sarà già stata riscritta e la cache
  // direbbe il nuovo.
  const [snaps, prezziPrima] = await Promise.all([
    Promise.all(righe.map((r) => getDoc(doc(db, 'inventory_items', r.item_id)))),
    Promise.all(righe.map((r) => prezzoDiListino(supplierId, r.item_id))),
  ])
  const adesso = new Date().toISOString()
  righe.forEach((r, k) => {
    registraAcquisto({
      articolo: snaps[k].exists() ? snaps[k].data() : null,
      itemId: r.item_id,
      qtyPackages: 0,
      costo: r.prezzo,
      supplierId,
      adesso,
      motivo: 'fattura fornitore',
      carica: false,
      aggiornaPrezzo: true,
      prezzoPrima: prezziPrima[k] ?? r.prezzo_prima,
      origine: 'fattura',
    })
  })
  return registraMovimentoOrdine(ordine, 'prezzi_allineati', { righe: righe.length })
}

// ── «AGGIUNGI PRODOTTI» A UNA FATTURA (REQ-MAG-030) ──────────────────
//
// Flavio: «sotto mi deve apparire un tasto che fa il carico. Dobbiamo usare
// un'altra dicitura sicuramente, tipo AGGIUNGI PRODOTTI magari, e ci
// mettiamo anche i prodotti, in modo tale che li va già a caricare
// all'interno dei prodotti di magazzino. Sempre che poi dopo mi fa la
// domanda se voglio aggiornare il prezzo — nel caso lo vado a modificare —
// oppure lasciarlo invariato, così, senza carico, perché magari me li sono
// caricati già prima in altro modo».
//
// DUE COSE DISTINTE, e la seconda è FACOLTATIVA: ricostruire un documento
// contabile (le righe sulla fattura) e muovere una giacenza. Con `carica` a
// false le righe si scrivono e il magazzino non si tocca.
//
// `righe` sono le righe da aggiungere: item_id, quantità in confezioni,
// prezzo e — per riga — se quel prezzo deve aggiornare l'archivio.
//
// `order_id` AGGANCIA LA FATTURA MENTRE SE NE RIPRENDONO LE RIGHE
// (REQ-MAG-031): sono lo stesso gesto — si ricopia il documento dall'ordine
// che l'ha generato — e tenerli separati voleva dire lasciare il legame non
// scritto proprio nel momento in cui uno l'aveva appena dimostrato. Va in
// una sola scrittura con le righe: due scritture, e una delle due può
// restare indietro.
export async function aggiungiProdottiAFattura(id, { righe = [], carica = true, order_id = null } = {}) {
  const ref = doc(db, 'supplier_invoices', id)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Documento non trovato')
  const fattura = snap.data()
  const collega = !!order_id && order_id !== (fattura.order_id ?? null)
  if (collega) await verificaAggancio(order_id, mapInvoice(snap))
  const nuove = (righe || []).filter((r) => r?.item_id && (Number(r.qty_packages) || 0) > 0)
  if (nuove.length === 0 && !collega) return mapInvoice(snap)

  // PRIMA SI LEGGE TUTTO, POI SI SCRIVE, come alla consegna di un ordine:
  // fermandosi a metà, metà fattura risulterebbe caricata e metà no, e
  // nessuno saprebbe più dove ricominciare.
  const [snaps, prezziPrima] = await Promise.all([
    Promise.all(nuove.map((r) => getDoc(doc(db, 'inventory_items', r.item_id)))),
    // Il prezzo di listino di prima, per lo storico (REQ-MAG-035): la
    // fattura è il documento che ALLINEA il listino, quindi è anche la
    // strada da cui arrivano le variazioni che pesano di più.
    Promise.all(
      nuove.map((r) =>
        r?.aggiorna_prezzo ? prezzoDiListino(fattura.supplier_id ?? null, r.item_id) : null
      )
    ),
  ])
  // `articoloScrivibile` si ferma se il magazzino è ancora scritto alla
  // vecchia maniera (BUG-029) — ma solo quando c'è davvero una giacenza da
  // alzare. Senza carico non si tocca nessuno stock: bloccare anche lì
  // impedirebbe di ricostruire una fattura per un motivo che non la
  // riguarda.
  const articoli = snaps.map((sn) =>
    carica ? articoloScrivibile(sn) : sn.exists() ? sn.data() : null
  )

  // Firestore non accetta `serverTimestamp()` DENTRO un array: la data della
  // riga è quella del terminale, come per le comande.
  const adesso = new Date().toISOString()
  const supplierId = fattura.supplier_id ?? null

  const scritte = nuove.map((r, k) => {
    const costo = Number(r.unit_cost) || 0
    registraAcquisto({
      articolo: articoli[k],
      itemId: r.item_id,
      qtyPackages: r.qty_packages,
      costo,
      supplierId,
      adesso,
      motivo: 'fattura fornitore',
      carica,
      // CHI NON RISPONDE NON AGGIORNA NIENTE: il pre-impostato della domanda
      // sul prezzo è «lascia com'è», e qui si limita a obbedire.
      aggiornaPrezzo: !!r.aggiorna_prezzo,
      prezzoPrima: prezziPrima[k],
      origine: 'fattura',
    })
    return {
      item_id: r.item_id,
      name: r.name ?? articoli[k]?.name ?? '',
      unit: r.unit ?? articoli[k]?.unit ?? 'pz',
      package_size: r.package_size ?? articoli[k]?.package_size ?? null,
      qty_packages: Number(r.qty_packages) || 0,
      unit_cost: costo,
      vat: r.vat ?? 22,
      // SE IL CARICO È GIÀ AVVENUTO RESTA SCRITTO SULLA RIGA: è quello che
      // impedisce di caricare due volte la stessa merce, che è l'errore da
      // evitare (REQ-MAG-030). Una riga già in archivio non si ripresenta
      // mai nella finestra: da lì si aggiunge, non si ricarica.
      caricata: !!carica,
      added_at: adesso,
    }
  })

  const lines = [...(Array.isArray(fattura.lines) ? fattura.lines : []), ...scritte]
  const patch = collega ? { lines, order_id } : { lines }
  // Non si rilegge quello che si è appena scritto: la scrittura parte in
  // sottofondo e la cache risponderebbe col documento di prima (BUG-045).
  // Il risultato si compone qui.
  bgWrite(() => updateDoc(ref, patch), 'prodotti fattura')
  return { ...mapInvoice(snap), ...patch }
}

// ── ALTRE SPESE: QUELLO CHE ESCE E NON ENTRA IN MAGAZZINO ────────────
//
// Terza sottosezione di Fornitori (REQ-MAG-034, da REQ-MAG-025). I campi
// sono le colonne del foglio «TO BUY» — articolo, quantità, prezzo, dove si
// compra, note — più la cosa che il foglio non sa dire: se quella voce è
// GIÀ STATA COMPRATA. Solo le comprate pesano sul mese; le altre sono un
// promemoria, e senza quella distinzione un divano desiderato abbasserebbe
// l'utile di gennaio.
//
// I conti (cosa pesa, su quale mese, quanto) stanno in `lib/spese.js`: qui
// c'è solo il giro su Firestore.
function mapSpesa(snap) {
  const s = snap.data() || {}
  return {
    id: snap.id,
    name: s.name ?? '',
    qty: Number(s.qty) || 0,
    unit_cost: Number(s.unit_cost) || 0,
    // DOVE SI COMPRA: nel foglio è una colonna sua (Amazon, Bricoware,
    // IKEA, Vente-Unique) e serve a ritrovare la stessa cosa la volta dopo.
    shop: s.shop ?? '',
    notes: s.notes ?? null,
    // I DUE CAMPI DELLA DISTINZIONE: `bought` dice SE, `bought_at` dice
    // QUANDO — ed è la data che decide su quale mese l'uscita pesa.
    bought: !!s.bought,
    bought_at: s.bought_at ?? null, // YYYY-MM-DD
    created_at: toIso(s.created_at),
  }
}

// I campi come vanno scritti, da qualunque parte arrivino: i numeri numeri e
// il testo ripulito. Sta qui e non nel modulo dei conti perché è la forma del
// DOCUMENTO, e chi scrive è uno solo.
function datiSpesa(dati = {}) {
  const testo = (v) => (typeof v === 'string' ? v.trim() : (v ?? ''))
  return {
    name: testo(dati.name),
    qty: Number(dati.qty) || 0,
    unit_cost: Number(dati.unit_cost) || 0,
    shop: testo(dati.shop),
    notes: testo(dati.notes) || null,
    bought: !!dati.bought,
    // La data serve solo a quello che è stato comprato: su un promemoria
    // sarebbe un mese di competenza per una cosa che non è successa.
    bought_at: dati.bought ? dati.bought_at || null : null,
  }
}

export async function fetchAltreSpese({ limit = 200 } = {}) {
  const snap = await getDocs(
    query(collection(db, 'altre_spese'), orderBy('created_at', 'desc'), fbLimit(limit))
  )
  return snap.docs.map(mapSpesa)
}

// L'IDENTIFICATIVO SE LO FA IL TERMINALE, e non è un vezzo: con `addDoc` si
// aspetta il server per sapere come si chiama il documento appena scritto, e
// senza rete quell'attesa non finisce mai. Così invece la riga compare
// nell'istante in cui si tocca «Salva» e la scrittura la insegue.
export async function creaAltraSpesa(dati) {
  const ref = doc(collection(db, 'altre_spese'))
  const spesa = datiSpesa(dati)
  bgWrite(() => setDoc(ref, { ...spesa, created_at: serverTimestamp() }), 'altra spesa')
  // Non si rilegge quello che si è appena scritto: si compone (BUG-045). La
  // data di creazione la mette il server, e qui vale quella del terminale —
  // serve solo a mettere in ordine l'elenco.
  return { id: ref.id, ...spesa, created_at: new Date().toISOString() }
}

// La spesa di partenza si legge, si scrive in sottofondo e il risultato si
// COMPONE: rileggere dopo la scrittura tornerebbe la versione di prima
// (BUG-045).
export async function aggiornaAltraSpesa(id, patch) {
  const ref = doc(db, 'altre_spese', id)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Spesa non trovata')
  const prima = mapSpesa(snap)
  const dopo = datiSpesa({ ...prima, ...patch })
  bgWrite(() => updateDoc(ref, dopo), 'altra spesa')
  return { ...prima, ...dopo }
}

// Niente da portarsi dietro (nessun allegato, nessuna giacenza): la riga
// sparisce dall'elenco nell'istante del gesto e la cancellazione parte in
// sottofondo come tutte le altre scritture.
export async function eliminaAltraSpesa(id) {
  bgWrite(() => deleteDoc(doc(db, 'altre_spese', id)), 'altra spesa')
}

// --- SERVIZIO (perpetuo) ---
// Niente più "serate": il locale lavora in continuità. I conti restano
// aperti finché non li si chiude a mano, anche a giorni di distanza. Le
// giornate servono solo a RAGGRUPPARE a posteriori (giornata commerciale
// con ora di taglio, vedi businessDay.js), non a delimitare il lavoro.

// Statistiche tempi del servizio (perpetue, non più per serata):
// prep_stats (attesa+preparazione, tutti gli ordini) e eta_stats (ciclo
// completo, solo ordini serviti al tavolo). Alimentano la stima ETA.
const serviceStatsDoc = doc(db, 'service_stats', 'global')

export function subscribeServiceStats(onChange, onError) {
  return onSnapshot(
    serviceStatsDoc,
    (snap) => onChange(snap.exists() ? snap.data() : {}),
    onError ?? (() => {})
  )
}

// Ordini della CODA: i conti aperti (sempre, per sempre) più quelli già
// chiusi nella giornata commerciale corrente (per ristampe e verifiche).
// Due sottoscrizioni unite: Firestore non fa OR fra campi diversi.
// LEGGE IL CONTO SENZA ASPETTARE LA RETE. Chiudere, annullare o riaprire un
// conto vuol dire prima rileggerlo: `getDoc`, quando c'e' rete, va al
// SERVER — e con una rete lenta (o collegata e che non passa) quel momento
// diventa un'attesa in mezzo al servizio. Il conto pero' e' gia' in cache:
// la coda ci sta sopra con un listener, quindi la copia locale e' quella
// dell'ultimo aggiornamento arrivato.
// Si legge da li'; solo se in cache non c'e' si va a chiedere.
// TUTTO QUELLO CHE TOCCA UN CONTO PASSA DA QUI, e parte dalla CACHE. Ogni
// azione — incassare, annullare, avanzare, aggiungere righe — leggeva prima
// il documento dal SERVER: da lì il mezzo secondo (o i due secondi) fra il
// tocco e la coda che si muove, e il riepilogo in cima che sembrava
// aggiornarsi «solo quando risponde il server». Perché in effetti era così.
//
// La cache è già allineata: la coda tiene un ascolto vivo su quei conti, e
// le scritture locali ci finiscono dentro subito. Leggendo da lì, l'azione
// si vede all'istante e la scrittura va per conto suo.
//
// Il rischio: si lavora su una fotografia di un istante fa, come prima
// (anche il server dà una fotografia). Se nel frattempo ha scritto un altro
// terminale, l'ultimo che scrive vince — ed è il comportamento che c'era già.
// Come leggiOrdine, per qualunque documento: cache se c'è, server solo se
// manca. Lo scarico di magazzino legge ricette e articoli — roba che l'app
// ha già in cache perché il listino e il magazzino sono sottoscritti.
async function leggiDoc(ref) {
  try {
    const c = await getDocFromCache(ref)
    if (c.exists()) return c
  } catch {
    /* niente cache: si chiede al server */
  }
  return getDoc(ref)
}

// ── QUELLO CHE ABBIAMO APPENA SCRITTO, SENZA ANDARLO A CHIEDERE ──────
//
// Chi tocca un conto deve riavere indietro il conto TOCCATO, e deve
// riaverlo subito. Rileggerlo non funziona, e non è una questione di
// velocità: la scrittura parte in sottofondo (bgWrite), quindi nell'istante
// in cui si rileggerebbe la cache contiene ancora la versione di prima.
// Chi rilegge, rilegge il passato — e al banco vuol dire aggiungere tre
// drink e vedere ancora il totale vecchio finché non torna la rete.
//
// Il conto nuovo però lo conosciamo già: è quello di partenza con sopra la
// patch che abbiamo appena mandato. Si compone qui, e si passa da `mapOrder`
// come se fosse arrivato dal server — perché la forma dev'essere la stessa:
// chi lo riceve non deve sapere da dove viene.
function ordineDopo(id, cur, patch) {
  const dati = { ...cur, ...patch }
  // E LO RICORDIAMO ANCHE PER LA MUTAZIONE DOPO, non solo per la schermata:
  // la prossima ricomposizione dell'array `comande` deve partire da qui e
  // non dalla cache, che la scrittura appena partita non ce l'ha ancora
  // (vedi lib/mutazioniOrdine.js).
  ricordaOrdine(id, dati, patch)
  return mapOrder({ id, exists: () => true, data: () => dati })
}

// OGNI MUTAZIONE DI UN CONTO GIRA NEL TURNO DI QUEL CONTO. Il corpo resta
// quello di sempre: cambia solo che due gesti ravvicinati sullo stesso conto
// non compongono più lo stesso array partendo dallo stesso passato. Conti
// diversi non si aspettano fra loro. Il perché per esteso sta in
// lib/mutazioniOrdine.js.
const perConto = (fn) => (orderId, ...resto) => inCodaOrdine(orderId, () => fn(orderId, ...resto))

// Scrive una patch sul conto in sottofondo e la RICORDA: la mutazione dopo
// deve comporre da qui, non dalla cache, che questa scrittura non ce l'ha
// ancora. Chi restituisce il conto composto passa da `ordineDopo`, che
// ricorda per conto suo; questa serve a chi scrive e basta.
function scriviOrdine(ref, cur, patch, etichetta) {
  ricordaOrdine(ref?.id, { ...cur, ...patch }, patch)
  bgWrite(() => updateDoc(ref, patch), etichetta)
}

async function leggiOrdine(ref) {
  return ordineRicordato(ref?.id, await leggiOrdineDallaCache(ref))
}

async function leggiOrdineDallaCache(ref) {
  try {
    const c = await getDocFromCache(ref)
    if (c.exists()) return c
  } catch {
    /* niente cache (primo avvio, storage pieno): si chiede al server */
  }
  return getDoc(ref)
}

export function subscribeActiveOrders(
  onChange,
  onError,
  { cutoffHour = DEFAULT_CUTOFF_HOUR, cashSessionId = null } = {}
) {
  // I DOCUMENTI COME ARRIVANO, non i conti già composti. La composizione
  // (`mapOrder`) è scesa dentro `componi`, perché è lì che si consulta la
  // memoria di quello che questo terminale ha appena scritto — e per
  // consultarla serve il documento grezzo, non il conto già mappato.
  let docsAperti = []
  let docsRecenti = []
  // CHIUSI O ANNULLATI IN QUESTA CASSA, anche se il conto era di ieri.
  // Senza questo terzo ascolto un conto vecchio rimasto aperto spariva
  // dallo schermo nell'istante in cui lo si annullava: usciva dalla query
  // dei conti aperti e non entrava in quella di oggi, che guarda la data di
  // APERTURA. Si agisce su un conto e quello svanisce, senza sapere se
  // l'operazione è andata a buon fine.
  let docsChiusi = []

  // ── LA MEMORIA VALE PER LA LISTA COME PER IL SINGOLO CONTO ───────────
  //
  // È la riga che qualcuno toglierà «semplificando», ed è il difetto di
  // BUG-099: si riscuote un conto, si torna alla coda, e per un attimo il
  // conto è ancora lì — poi sparisce. Il lampo.
  //
  // Il perché: `scriviOrdine` manda la scrittura in sottofondo e RICORDA
  // com'è il conto dopo (`ricordaOrdine`, lib/mutazioniOrdine.js). Quel
  // ricordo però era consultato solo rileggendo UN conto (`leggiOrdine`),
  // mai componendo la LISTA: la coda si dipinge dalla cache, che
  // nell'istante del gesto ha ancora la versione di prima, e mostrava il
  // conto aperto finché la scrittura non atterrava. Una memoria e due
  // letture, e una non la guardava.
  //
  // Il ricordo si difende da solo e qui non lo si indebolisce: muore appena
  // il documento vero racconta la stessa cosa (confronto della patch) e
  // scade comunque dopo `VITA_MEMORIA`, così un ricordo orfano non copre per
  // sempre quello che fanno gli ALTRI terminali.
  //
  // Si applica a TUTTI e tre gli elenchi (aperti, recenti, chiusi in questa
  // cassa) e una volta sola per conto: applicarlo a uno solo vorrebbe dire
  // un conto che sparisce da un elenco e ricompare in un altro, che al banco
  // è peggio del lampo.
  let ricordiInUso = false
  const componi = () => {
    ricordiInUso = false
    const oggi = businessDayKey(new Date(), cutoffHour)
    // Il documento più fresco per ogni conto: vince l'ultimo elenco che ce
    // l'ha, come faceva la fusione di prima (aperti, poi recenti, poi chiusi
    // in questa cassa).
    const perId = new Map()
    for (const d of docsAperti) perId.set(d.id, d)
    for (const d of docsRecenti) perId.set(d.id, d)
    for (const d of docsChiusi) perId.set(d.id, d)
    // Chi sta in coda senza guardare la data: i conti APERTI (si chiudono
    // solo a mano, anche se sono di tre giorni fa) e quelli chiusi in questa
    // cassa. Agli altri — gli «ultimi arrivati» — si applica la giornata
    // commerciale, esattamente come prima.
    const senzaLimiteDiData = new Set()
    for (const d of docsAperti) senzaLimiteDiData.add(d.id)
    for (const d of docsChiusi) senzaLimiteDiData.add(d.id)

    const list = []
    for (const [id, d] of perId) {
      const visto = ordineRicordato(id, d)
      if (visto !== d) ricordiInUso = true
      const o = mapOrder(visto)
      if (!senzaLimiteDiData.has(id) && businessDayKey(o.created_at, cutoffHour) !== oggi) continue
      list.push(o)
    }
    list.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    return list
  }

  // `soloSeCiSonoConti` serve alla prima pennellata dalla cache: lì una lista
  // vuota non vuol dire «non c'è niente», vuol dire «la cache non sapeva» — e
  // si aspetta il listener, come ha sempre fatto.
  const emit = (soloSeCiSonoConti = false) => {
    const list = componi()
    if (soloSeCiSonoConti && list.length === 0) return
    // QUANDO IL RICORDO SCADE, LA CODA RIFÀ I CONTI DA SOLA. Il ricordo copre
    // il documento vero al massimo per `VITA_MEMORIA`; se in quella finestra
    // non arriva nessun altro snapshot — di notte, con un conto solo in
    // ballo, capita — la lista resterebbe ferma su una versione che non
    // esiste più da nessuna parte, e a quel punto sarebbe il ricordo a
    // nascondere quello che hanno fatto gli altri terminali. Non è un
    // ritardo che indovina la velocità della macchina (il meccanismo resta
    // il confronto con la cache): è la sveglia che rimette in moto la
    // ricomposizione quando il ricordo non vale più. Stessa idea del
    // `setTimeout` di `ordiniNascosti`.
    if (ricordiInUso) programmaRicontrollo()
    onChange(list)
  }
  let sveglia = null
  const programmaRicontrollo = () => {
    if (sveglia) return
    sveglia = setTimeout(() => {
      sveglia = null
      emit()
    }, VITA_MEMORIA + 50)
  }
  const fail = onError ?? (() => {})

  // Stati che tengono un conto "in vita". Include i vecchi stati di
  // lavorazione: la query lavora sul campo grezzo, quindi senza questi un
  // conto storico non ancora saldato resterebbe invisibile.
  const STATI_APERTI = [
    ORDER_OPEN,
    ORDER_STATUSES.RICEVUTO,
    ORDER_STATUSES.IN_PREPARAZIONE,
    ORDER_STATUSES.PRONTO,
    ORDER_STATUSES.RITIRATO,
  ]
  // Finestra volutamente abbondante per i conti chiusi di oggi; il taglio
  // esatto lo fa businessDayKey.
  const copertura = Timestamp.fromDate(coverageStart(new Date()))

  // PRIMA DI TUTTO, LA CACHE. onSnapshot di norma risponde subito col dato
  // locale, ma non quando la rete c'è e non funziona (wifi collegato senza
  // internet, portale captive, DNS che non risponde): lì l'SDK crede di
  // essere online e ASPETTA il server, anche per minuti. La coda restava
  // sullo spinner pur avendo tutti gli ordini già in cache.
  // Con una lettura esplicita dalla cache la schermata è utilizzabile
  // subito; il listener poi allinea da solo quando la rete torna.
  const dallaCache = async () => {
    try {
      const [a, r] = await Promise.all([
        getDocsFromCache(query(ordersCol, where('status', 'in', STATI_APERTI))),
        getDocsFromCache(query(ordersCol, where('created_at', '>=', copertura))),
      ])
      if (docsAperti.length === 0 && docsRecenti.length === 0) {
        docsAperti = a.docs
        docsRecenti = r.docs
        emit(true)
      }
    } catch {
      // Cache vuota o non disponibile: si aspetta il listener, come prima.
    }
  }

  dallaCache()

  // Conti aperti: nessun limite di data, si chiudono solo a mano.
  const unsubAperti = onSnapshot(
    query(ordersCol, where('status', 'in', STATI_APERTI)),
    (snap) => {
      docsAperti = snap.docs
      emit()
    },
    fail
  )

  // Chiusi/annullati della giornata commerciale in corso.
  const unsubRecenti = onSnapshot(
    query(ordersCol, where('created_at', '>=', copertura)),
    (snap) => {
      docsRecenti = snap.docs
      emit()
    },
    fail
  )

  // Il terzo ascolto c'è solo a cassa aperta: senza una cassa non c'è
  // «questa serata» a cui appartenere.
  const unsubChiusi = cashSessionId
    ? onSnapshot(
        query(ordersCol, where('closed_in_session', '==', cashSessionId)),
        (snap) => {
          docsChiusi = snap.docs
          emit()
        },
        fail
      )
    : () => {}

  return () => {
    if (sveglia) clearTimeout(sveglia)
    sveglia = null
    unsubChiusi()
    unsubAperti()
    unsubRecenti()
  }
}

// Riporta a "ricevuto" le comande dei conti ancora APERTI: si usa quando
// si spegne la gestione della preparazione, altrimenti resterebbero in
// stati che non si possono più far avanzare.
// Lo scarico di magazzino NON si tocca: `inventory_applied` resta com'è,
// quindi le scorte già consumate restano consumate (il drink è stato
// fatto davvero) e, se un domani si riaccende la gestione, l'avanzamento
// non le scala una seconda volta.
export async function resetOpenOrdersToReceived() {
  const snap = await getDocs(
    query(
      ordersCol,
      where('status', 'in', [
        ORDER_OPEN,
        ORDER_STATUSES.RICEVUTO,
        ORDER_STATUSES.IN_PREPARAZIONE,
        ORDER_STATUSES.PRONTO,
        ORDER_STATUSES.RITIRATO,
      ])
    )
  )
  let toccati = 0
  for (const d of snap.docs) {
    const data = d.data() || {}
    const comande = Array.isArray(data.comande) ? data.comande : []
    // Le comande annullate restano annullate: non sono lavorazioni in corso.
    const nuove = comande.map((c) =>
      c.status === ORDER_STATUSES.ANNULLATO ? c : { ...c, status: ORDER_STATUSES.RICEVUTO }
    )
    const cambia =
      comande.some((c, i) => c.status !== nuove[i].status) || data.status !== ORDER_OPEN
    if (!cambia) continue
    bgWrite(() => updateDoc(d.ref, {
      status: ORDER_OPEN,
      comande: nuove,
      comande_statuses: comandeStatuses(nuove),
    }), 'ripristino ordine')
    toccati += 1
  }
  return toccati
}

// IL TIMBRO DI CHIUSURA. Quando un conto si chiude — incassato o annullato
// — si scrive in quale cassa è successo: è così che la coda sa tenerlo a
// schermo per questa serata, anche se il conto era stato aperto giorni
// prima (vedi subscribeActiveOrders). Senza cassa aperta non si scrive
// niente: non c'è una serata a cui riferirsi.
// Il timbro si mette solo se il conto si sta davvero CHIUDENDO: un incasso
// parziale, o un pagamento che lascia il conto aperto perché non è ancora
// servito, non è una chiusura.
function conTimbro(chiusura, nowIso) {
  if (chiusura?.status !== ORDER_STATUSES.PAGATO) return chiusura
  return { ...chiusura, ...timbroChiusura(nowIso) }
}

function timbroChiusura(nowIso) {
  const cassa = cassaCorrente()
  return cassa ? { closed_in_session: cassa, closed_at: nowIso } : { closed_at: nowIso }
}

// CHIUDE SUBITO un conto già pagato: serve tutte le comande e porta
// l'ordine a "pagato", senza far avanzare gli stati uno per uno. È la
// scorciatoia per quando si è incassato in anticipo e poi si consegna
// tutto insieme. Le comande mai prese in carico vengono scaricate a
// magazzino adesso (una sola volta, come sempre).
export const closePaidOrder = perConto(async function closePaidOrder(id) {
  const ref = doc(db, 'orders', id)
  const snap = await leggiOrdine(ref)
  if (!snap.exists()) throw new Error('Ordine non trovato')
  const data = snap.data()
  if (data.payment_status !== 'pagato') {
    throw new Error('Il conto non è ancora pagato.')
  }
  const nowIso = new Date().toISOString()
  const chiusura = conTimbro(chiusuraPagamento(data, nowIso, { autoServe: true }), nowIso)
  // PRIMA SI CHIUDE IL CONTO. Lo scarico di magazzino ha bisogno di leggere
  // ricette e articoli, e finché quelle letture non tornavano il conto non
  // risultava chiuso: si incassava e la coda si muoveva mezzo secondo dopo
  // — di più, con la linea del locale. Il magazzino si allinea subito dopo,
  // per conto suo (vedi scaricaInSottofondo, stessa idea).
  scriviOrdine(ref, data, chiusura, 'chiusura conto')
  if (chiusura.comande) {
    depleteComandeInventory(unappliedEntries(id, chiusura.comande))
      .then(notifyLowStock)
      .catch(() => {})
  }
})

// PREFERENZE POS condivise (ordine card e preferiti): stanno sul server
// così l'arrangiamento è lo stesso su tutti i dispositivi del locale. Il
// client applica SEMPRE prima in locale (localStorage) e scrive qui in
// background — offline la scrittura si accoda e va al ritorno della rete.
const posPrefsRef = doc(db, 'pos_prefs', 'global')

export function subscribePosPrefs(cb, onError) {
  return onSnapshot(
    posPrefsRef,
    (snap) => cb(snap.exists() ? snap.data() : null),
    onError ?? (() => {})
  )
}
export async function savePosOrder(order) {
  await setDoc(posPrefsRef, { order: order || [], order_updated_at: serverTimestamp() }, { merge: true })
}
export async function savePosFavorites(favorites) {
  await setDoc(posPrefsRef, { favorites: favorites || [], favorites_updated_at: serverTimestamp() }, { merge: true })
}
// Colore del "tab" (angolo) di ogni prodotto: mappa { drinkId: '#rrggbb' }.
// Vale per tutto il locale (come ordine/preferiti), sincronizzato in background.
export async function savePosColors(colors) {
  await setDoc(posPrefsRef, { colors: colors || {}, colors_updated_at: serverTimestamp() }, { merge: true })
}

// Id dei drink usati di RECENTE negli ordini (per la raccolta "Recenti" del
// POS): ultimi item distinti, più recenti prima. Legge un blocco di ordini
// recenti e li riduce lato client.
export async function fetchRecentDrinkIds(limit = 20) {
  const snap = await getDocs(query(ordersCol, orderBy('created_at', 'desc'), fbLimit(60)))
  return recentDrinkIds(snap.docs.map(mapOrder), limit)
}

// PROSSIMO numero d'ordine (senza consumarlo): serve al POS per mostrare il
// progressivo già all'apertura della schermata, prima ancora del primo item.
// Segue lo stesso contatore di createOrder (sessione di cassa, o giornata).
export function peekNextDailyNumber({ cutoffHour = DEFAULT_CUTOFF_HOUR } = {}) {
  // Anche questo senza chiedere niente a nessuno: il numero si sa già (vedi
  // lib/progressivi.js). Aprire il POS non deve aspettare due risposte dal
  // server per scrivere «#21» in cima.
  return Promise.resolve(numeroPrevisto(contatoreCorrente(cutoffHour)))
}

// STORICO ordini in ordine cronologico (più recenti prima), qualunque sia lo
// stato: aperti, chiusi, annullati. Usato dallo storico nel Flusso cassa.
// STORICO ordini in tempo reale (più recenti prima), qualunque sia lo stato:
// aperti, chiusi, annullati. onSnapshot e non getDocs: OFFLINE la lista arriva
// SUBITO dalla cache locale (una lettura una-tantum resterebbe appesa), e si
// aggiorna da sola quando torna la rete.
export function subscribeOrdersHistory(cb, onError, { limit = 300 } = {}) {
  const byDate = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))
  let stopFallback = null
  const stopMain = onSnapshot(
    query(ordersCol, orderBy('created_at', 'desc'), fbLimit(limit)),
    (snap) => cb(snap.docs.map(mapOrder)),
    () => {
      // Ordinamento non disponibile (indice/campo): si ripiega su una lettura
      // semplice ordinata qui. NON si segnala errore se il ripiego funziona,
      // altrimenti resterebbe un avviso rosso sopra una lista piena.
      stopFallback = onSnapshot(
        query(ordersCol, fbLimit(limit)),
        (snap) => cb(snap.docs.map(mapOrder).sort(byDate)),
        onError ?? (() => {})
      )
    }
  )
  // Disiscrive ENTRAMBE: senza questo il ripiego restava vivo per sempre.
  return () => {
    stopMain()
    if (stopFallback) stopFallback()
  }
}

// ORDINI DI UN PERIODO, per la ricerca nella lista ordini. La lista in
// tempo reale tiene gli ultimi conti: per ritrovare una serata di due
// settimane fa serve andarla a prendere. Si legge una finestra larga
// attorno alle date e si taglia con la giornata commerciale, come per la
// singola giornata qui sotto.
export async function fetchOrdersRange(daKey, aKey, cutoffHour = DEFAULT_CUTOFF_HOUR) {
  if (!daKey) return []
  const fine = aKey || daKey
  const from = new Date(`${daKey}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - 1)
  const to = new Date(`${fine}T00:00:00Z`)
  to.setUTCDate(to.getUTCDate() + 2)
  const snap = await getDocs(
    query(
      ordersCol,
      where('created_at', '>=', Timestamp.fromDate(from)),
      where('created_at', '<', Timestamp.fromDate(to))
    )
  )
  return snap.docs
    .map(mapOrder)
    .filter((o) => {
      const g = o.order_date || businessDayKey(o.created_at, cutoffHour)
      return g && g >= daKey && g <= fine
    })
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

// Ordini di una giornata commerciale (per statistiche e storico).
export async function fetchOrdersForBusinessDay(dayKey, cutoffHour = DEFAULT_CUTOFF_HOUR) {
  // Prendo una finestra larga attorno al giorno e taglio con businessDayKey.
  const from = new Date(`${dayKey}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - 1)
  const to = new Date(`${dayKey}T00:00:00Z`)
  to.setUTCDate(to.getUTCDate() + 2)
  const snap = await getDocs(
    query(
      ordersCol,
      where('created_at', '>=', Timestamp.fromDate(from)),
      where('created_at', '<', Timestamp.fromDate(to))
    )
  )
  return snap.docs
    .map(mapOrder)
    .filter((o) => businessDayKey(o.created_at, cutoffHour) === dayKey)
}

// Ordini in un intervallo di giornate commerciali (estremi inclusi).
export async function fetchOrdersBetween(fromDayKey, toDayKey, cutoffHour = DEFAULT_CUTOFF_HOUR) {
  const from = new Date(`${fromDayKey}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - 1)
  const to = new Date(`${toDayKey}T00:00:00Z`)
  to.setUTCDate(to.getUTCDate() + 2)
  const snap = await getDocs(
    query(
      ordersCol,
      where('created_at', '>=', Timestamp.fromDate(from)),
      where('created_at', '<', Timestamp.fromDate(to))
    )
  )
  return snap.docs.map(mapOrder).filter((o) => {
    const k = businessDayKey(o.created_at, cutoffHour)
    return k && k >= fromDayKey && k <= toDayKey
  })
}

// --- GROUPS (contenitori di ordini) ---

function mapGroup(snap) {
  const g = snap.data() || {}
  return {
    id: snap.id,
    name: g.name ?? '',
    kind: g.kind ?? 'manual',
    customer_uid: g.customer_uid ?? null,
    parent_group_id: g.parent_group_id ?? null,
    has_child_groups: g.has_child_groups ?? false,
    status: g.status ?? 'aperto',
    split_count: g.split_count ?? null,
    pinned: g.pinned ?? false,
    last_order_at: toIso(g.last_order_at),
    created_at: toIso(g.created_at),
    created_by: g.created_by ?? null,
    closed_at: toIso(g.closed_at),
  }
}

// Gruppo-cliente: id == uid, idempotente. Aggiorna nome e ultimo ordine.
export async function ensureCustomerGroup(uid, name) {
  await setDoc(
    doc(groupsCol, uid),
    {
      kind: 'customer',
      customer_uid: uid,
      name: name || 'Cliente',
      parent_group_id: null,
      has_child_groups: false,
      status: 'aperto',
      last_order_at: serverTimestamp(),
    },
    { merge: true }
  )
}

// Gruppo manuale creato dallo staff (eventualmente annidato in un padre).
export async function createManualGroup({ name, parent_group_id = null, created_by = null }) {
  const ref = await addDoc(groupsCol, {
    kind: 'manual',
    name: name?.trim() || 'Gruppo',
    customer_uid: null,
    parent_group_id: parent_group_id || null,
    has_child_groups: false,
    status: 'aperto',
    split_count: null,
    pinned: true,
    last_order_at: serverTimestamp(),
    created_at: serverTimestamp(),
    created_by: created_by ?? null,
  })
  if (parent_group_id) {
    await updateDoc(doc(groupsCol, parent_group_id), { has_child_groups: true }).catch(() => {})
  }
  return mapGroup(await getDoc(ref))
}

export async function renameGroup(id, name) {
  await updateDoc(doc(groupsCol, id), { name: name.trim() })
}

// Annida `childId` dentro `parentId` (il padre diventa contenitore).
export async function nestGroup(childId, parentId) {
  await updateDoc(doc(groupsCol, childId), { parent_group_id: parentId })
  await updateDoc(doc(groupsCol, parentId), { has_child_groups: true })
}

// Sgancia un gruppo dal padre; se il padre resta senza figli, non è più
// un contenitore (torna a poter ricevere ordini diretti).
export async function unnestGroup(childId) {
  const childSnap = await getDoc(doc(groupsCol, childId))
  const parentId = childSnap.exists() ? childSnap.data().parent_group_id : null
  await updateDoc(doc(groupsCol, childId), { parent_group_id: null })
  if (parentId) {
    const rest = await getDocs(query(groupsCol, where('parent_group_id', '==', parentId)))
    if (rest.empty) {
      await updateDoc(doc(groupsCol, parentId), { has_child_groups: false }).catch(() => {})
    }
  }
}

export async function setGroupPinned(id, pinned) {
  await updateDoc(doc(groupsCol, id), { pinned: !!pinned })
}

// CHIUDE (archivia) uno o più gruppi: escono dalla lista dei gruppi aperti.
// Gli ordini restano dove sono (col loro stato/pagamento). Local-first.
export function closeGroups(ids) {
  for (const id of ids || []) {
    updateDoc(doc(groupsCol, id), { status: 'chiuso', closed_at: serverTimestamp() }).catch(() => {})
  }
}
export const closeGroup = (id) => closeGroups([id])

// ELIMINA un gruppo: gli ordini vengono SGANCIATI (restano, senza etichetta
// gruppo) e gli eventuali sottogruppi tornano indipendenti. Local-first: le
// scritture partono e si sincronizzano in background.
export async function deleteGroup(id) {
  const snap = await getDoc(doc(groupsCol, id))
  const parentId = snap.exists() ? snap.data().parent_group_id : null
  // Ordini del gruppo → senza gruppo.
  const os = await getDocs(query(ordersCol, where('group_id', '==', id)))
  os.docs.forEach((d) => updateDoc(d.ref, { group_id: null, group_name_snapshot: null }).catch(() => {}))
  // Sottogruppi → indipendenti.
  const cs = await getDocs(query(groupsCol, where('parent_group_id', '==', id)))
  cs.docs.forEach((d) => updateDoc(d.ref, { parent_group_id: null }).catch(() => {}))
  deleteDoc(doc(groupsCol, id)).catch(() => {})
  // Se era l'ultimo figlio, il padre non è più contenitore.
  if (parentId) {
    const rest = await getDocs(query(groupsCol, where('parent_group_id', '==', parentId)))
    const others = rest.docs.filter((d) => d.id !== id)
    if (others.length === 0) updateDoc(doc(groupsCol, parentId), { has_child_groups: false }).catch(() => {})
  }
}

export async function fetchGroup(id) {
  const snap = await getDoc(doc(groupsCol, id))
  return snap.exists() ? mapGroup(snap) : null
}

// Gruppi APERTI (perpetui) — per drawer e coda. Si chiudono a mano.
export function subscribeOpenGroups(onChange, onError) {
  const q = query(groupsCol, where('status', '==', 'aperto'))
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map(mapGroup)),
    onError ?? (() => {})
  )
}

// Gruppi-cliente recenti (hanno ordinato): per "richiamare" il cliente.
export function subscribeRecentGroups(onChange, onError, limitN = 20) {
  const q = query(
    groupsCol,
    where('kind', '==', 'customer'),
    orderBy('last_order_at', 'desc'),
    fbLimit(limitN)
  )
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map(mapGroup)),
    onError ?? (() => {})
  )
}

// --- PAGAMENTI DI GRUPPO (contanti) + ledger ---

// ── INCASSARE NON VUOL DIRE AVER SERVITO ─────────────────────
//
// Il pagamento NON può portare avanti nel flusso una comanda che sta a «da
// fare», «in preparazione» o «pronto»: quei drink vanno fatti lo stesso.
// Una comanda che risulta servita senza esserlo fa due danni, tutti e due
// silenziosi — sparisce dagli occhi di chi doveva prepararla, e scarica il
// magazzino per roba mai uscita. Pagare in anticipo è normale: il conto
// resta APERTO finché non è uscito tutto.
//
// A servire c'è UNA strada sola, ed è un gesto esplicito: «Riscuoti e
// servi» nella schermata di pagamento, cioè qualcuno che dice «è tutto
// fuori, prendo i soldi». Senza gli stati del servizio i passi non
// esistono e il pagamento chiude, come ha sempre fatto: lì `autoServe`
// arriva acceso da chi chiama.
//
// IL VALORE DI PARTENZA È «NON SERVIRE», e non per pignoleria: era acceso,
// e ogni strada che si dimenticava di dirlo — il pagamento di un gruppo, per
// esempio — serviva tutto in silenzio. Sbagliando in questo verso resta un
// conto aperto, e si chiude; sbagliando nell'altro si perde un drink e si
// scarica una scorta che non è mai uscita, e da lì non si torna indietro.
//
// Incassa in contanti un insieme di ordini (un (sotto)gruppo o una sua
// quota). In un'unica transazione: marca pagati gli ordini non ancora
// saldati e scrive nel ledger `payments` (1 documento, o N se diviso per
// N). `split` = { count } per il conto diviso. Restituisce settlement_id.
function chiusuraPagamento(rawOrder, nowIso, { autoServe = false } = {}) {
  const norm = normalizeOrderDoc(rawOrder)
  if (!autoServe && !allServed(norm)) {
    // Resta APERTO: pagato, ma ancora da consegnare.
    return { payment_status: 'pagato', paid_at: nowIso }
  }
  const comande = serveAllComande(norm.comande, nowIso)
  return {
    status: ORDER_STATUSES.PAGATO,
    [`status_times.${ORDER_STATUSES.PAGATO}`]: nowIso,
    payment_status: 'pagato',
    paid_at: nowIso,
    comande,
    comande_statuses: comandeStatuses(comande),
  }
}

export async function payGroupCash({
  orderIds,
  by = null,
  group_id = null,
  group_ids = [],
  split = null,
  // COME si è incassato. Era cablato a 'banco': un tavolo pagato con la carta
  // finiva nei contanti, e a fine serata la cassa non tornava.
  method = 'banco',
}) {
  if (!orderIds || orderIds.length === 0) return null
  const nowIso = new Date().toISOString()
  const settlementId = doc(paymentsCol).id

  const refs = orderIds.map((id) => doc(ordersCol, id))
  const snaps = await Promise.all(refs.map((r) => getDoc(r)))
  let total = 0
  const covered = []
  const items = []
  snaps.forEach((s, i) => {
    if (!s.exists()) return
    const o = s.data()
    if (o.status === ORDER_STATUSES.ANNULLATO || o.payment_status === 'pagato') return
    total += Number(o.total) || 0
    covered.push({ ref: refs[i], raw: o })
    for (const it of o.items || []) {
      items.push({ order_id: refs[i].id, name: it.name, qty: it.qty, unit_price: it.unit_price })
    }
  })
  if (covered.length === 0) return null

  // PAGARE UN GRUPPO NON SERVE I DRINK. Qui si serviva tutto, sempre, senza
  // guardare a che punto stessero le comande: un tavolo di sei che paga
  // insieme mentre due giri sono ancora al banco faceva sparire dalla coda
  // quei due giri, già «serviti», e ne scaricava gli ingredienti. Adesso
  // passa dalla regola di tutti (chiusuraPagamento): il conto si chiude solo
  // se non resta niente da consegnare, e in un gruppo non c'è nessuno che
  // possa dire è tutto fuori — quel gesto sta nella schermata del conto.
  const chiusure = covered.map(({ ref, raw }) => ({
    ref,
    raw,
    chiusura: chiusuraPagamento(raw, nowIso, { autoServe: false }),
  }))
  const timbro = timbroChiusura(nowIso)
  for (const { ref, raw, chiusura } of chiusure) {
    // SI PASSA DA `scriviOrdine` E NON DA `bgWrite` NUDO, e non è un
    // riordino: è l'unico modo perché la coda veda sparire INSIEME tutti i
    // conti del gruppo. `scriviOrdine` ricorda com'è il conto dopo, e la coda
    // consulta quel ricordo (vedi subscribeActiveOrders); scrivendo e basta,
    // i conti del tavolo restavano aperti a schermo finché non atterrava la
    // scrittura, uno per volta.
    scriviOrdine(
      ref,
      raw,
      {
        ...chiusura,
        payment_method: method,
        payment_id: settlementId,
        ...timbro,
      },
      'pagamento gruppo'
    )
  }
  // Il magazzino dopo, per conto suo: vedi closePaidOrder. Si scarica solo
  // quello che è davvero risultato servito — cioè niente, se è rimasta
  // roba da preparare.
  depleteComandeInventory(
    chiusure.flatMap(({ ref, chiusura }) =>
      chiusura.comande ? unappliedEntries(ref.id, chiusura.comande) : []
    )
  )
    .then(notifyLowStock)
    .catch(() => {})

  const orderIdsCovered = covered.map((c) => c.ref.id)
  const baseDoc = {
    created_at: serverTimestamp(),
    by,
    direction: 'incasso',
    method,
    status: 'pagato',
    group_id: group_id || null,
    group_ids: group_ids || [],
    order_ids: orderIdsCovered,
    items,
    settlement_id: settlementId,
    paid_at: nowIso,
  }
  if (split && split.count > 1) {
    const amounts = splitAmounts(total, split.count)
    for (let idx = 0; idx < amounts.length; idx++) {
      bgWrite(() => addDoc(paymentsCol, {
        ...baseDoc,
        amount: amounts[idx],
        split_count: split.count,
        split_index: idx + 1,
      }), 'ledger pagamento')
    }
  } else {
    bgWrite(() => addDoc(paymentsCol, { ...baseDoc, amount: Math.round(total * 100) / 100, split_count: null, split_index: null }), 'ledger pagamento')
  }
  return settlementId
}

// Crea un pagamento "in attesa" per un gruppo (usato dai pagamenti SumUp:
// il documento porta importo e order_ids; il checkout SumUp lo salda via
// Cloud Function/webhook). Restituisce il paymentId.
export async function createPendingGroupPayment({
  orderIds,
  amount,
  method, // 'online' | 'lettore'
  group_id = null,
  group_ids = [],
  items = [],
  by = null,
}) {
  const ref = await addDoc(paymentsCol, {
    created_at: serverTimestamp(),
    by,
    direction: 'incasso',
    method,
    status: 'in_attesa',
    amount: Math.round((Number(amount) || 0) * 100) / 100,
    group_id: group_id || null,
    group_ids: group_ids || [],
    order_ids: orderIds || [],
    items,
    split_count: null,
    split_index: null,
    settlement_id: null,
    sumup_checkout_id: null,
    sumup_client_transaction_id: null,
    sumup_transaction_id: null,
    paid_at: null,
  })
  return ref.id
}

function mapPayment(snap) {
  const p = snap.data() || {}
  return {
    id: snap.id,
    created_at: toIso(p.created_at),
    by: p.by ?? null,
    method: p.method ?? 'banco',
    status: p.status ?? 'pagato',
    amount: p.amount ?? 0,
    group_id: p.group_id ?? null,
    group_ids: p.group_ids ?? [],
    order_ids: p.order_ids ?? [],
    items: p.items ?? [],
    split_count: p.split_count ?? null,
    split_index: p.split_index ?? null,
    settlement_id: p.settlement_id ?? null,
    paid_at: toIso(p.paid_at),
  }
}

// Pagamenti della giornata commerciale corrente (realtime, più recenti prima).
export function subscribePayments(onChange, onError, { cutoffHour = DEFAULT_CUTOFF_HOUR } = {}) {
  const from = Timestamp.fromDate(coverageStart(new Date()))
  const q = query(paymentsCol, where('created_at', '>=', from))
  return onSnapshot(
    q,
    (snap) => {
      const oggi = businessDayKey(new Date(), cutoffHour)
      const list = snap.docs
        .map(mapPayment)
        .filter((x) => businessDayKey(x.created_at, cutoffHour) === oggi)
      list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      onChange(list)
    },
    onError ?? (() => {})
  )
}

// --- CASSA (apertura/chiusura serata) ---
// Una sessione di cassa marca la finestra della "serata": si apre a inizio
// servizio (con un fondo cassa opzionale) e si chiude a fine, salvando il
// riepilogo. Il flusso cassa è calcolato dagli ordini nella finestra.

function mapCashSession(snap) {
  const s = snap.data() || {}
  return {
    id: snap.id,
    status: s.status ?? 'open',
    opened_at: toIso(s.opened_at),
    closed_at: toIso(s.closed_at),
    opened_by: s.opened_by ?? null,
    closed_by: s.closed_by ?? null,
    fondo_cassa: Number(s.fondo_cassa) || 0,
    business_day: s.business_day ?? null,
    snapshot: s.snapshot ?? null,
    counted_cash: s.counted_cash != null ? Number(s.counted_cash) : null,
    difference: s.difference != null ? Number(s.difference) : null,
    note: s.note ?? null,
  }
}

// Id della sessione di cassa APERTA (o null). Letta anche dalla cache offline.
// Puntatore PUBBLICO alla sessione di cassa aperta: `cash_sessions` è
// leggibile solo dallo staff (dentro ci sono incassi e nomi), ma il
// progressivo dev'essere lo stesso ANCHE per gli ordini dei clienti. Chi lo
// legge è lib/progressivi.js, che lo tiene aggiornato con un ascolto: qui lo
// si scrive e basta.
const activeCashRef = doc(db, 'counters', '_active_cash')


// Sessione di cassa attualmente aperta (una sola alla volta), in realtime.
// Niente orderBy nella query (eviterebbe un indice composito e, soprattutto,
// escluderebbe il doc appena creato offline finché opened_at è nullo): si
// ordina lato client.
export function subscribeOpenCashSession(onChange, onError) {
  const q = query(cashSessionsCol, where('status', '==', 'open'))
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(mapCashSession)
      list.sort((a, b) => String(b.opened_at || '').localeCompare(String(a.opened_at || '')))
      onChange(list[0] || null)
    },
    onError ?? (() => {})
  )
}

// Apre la cassa. LOCAL-FIRST: id generato dal client e opened_at come ISO del
// client (così il doc compare subito nella subscription anche offline); la
// scrittura va in background senza attendere il server — altrimenti offline la
// promise non si risolverebbe mai e il tasto sembrerebbe non fare nulla. Il
// "una sola cassa aperta" è garantito dalla UI (il bottone c'è solo se non ce
// n'è una aperta).
export function openCashSession({ by = null, fondo = 0, cutoffHour = DEFAULT_CUTOFF_HOUR } = {}) {
  const ref = doc(cashSessionsCol)
  setDoc(ref, {
    status: 'open',
    opened_at: new Date().toISOString(),
    opened_by: by,
    fondo_cassa: Number(fondo) || 0,
    business_day: businessDayKey(new Date(), cutoffHour),
    created_at: serverTimestamp(),
  }).catch(() => {})
  // Puntatore pubblico: da qui anche gli ordini dei clienti prendono il
  // progressivo della sessione (vedi currentCashSessionId).
  setDoc(activeCashRef, { session_id: ref.id }, { merge: true }).catch(() => {})
  return ref.id
}

// Chiude la cassa: salva il riepilogo (snapshot) ed eventuale contante contato.
// Anche qui local-first: scrittura in background, closed_at come ISO client.
export function closeCashSession(id, { by = null, snapshot = null, countedCash = null, note = null } = {}) {
  const patch = {
    status: 'closed',
    closed_at: new Date().toISOString(),
    closed_by: by,
    snapshot: snapshot || null,
    note: note || null,
  }
  if (countedCash != null && countedCash !== '') {
    const counted = Number(countedCash) || 0
    patch.counted_cash = counted
    const atteso = Number(snapshot?.contanteAtteso) || 0
    patch.difference = Math.round((counted - atteso) * 100) / 100
  }
  updateDoc(doc(db, 'cash_sessions', id), patch).catch(() => {})
  // Cassa chiusa: il puntatore pubblico si svuota, così il progressivo riparte
  // alla prossima apertura (e intanto si ricade sulla giornata commerciale).
  setDoc(activeCashRef, { session_id: null }, { merge: true }).catch(() => {})
}

// Storico delle sessioni di cassa chiuse, più recenti prima.
export async function fetchCashSessions({ limit = 30 } = {}) {
  const snap = await getDocs(query(cashSessionsCol, orderBy('opened_at', 'desc'), fbLimit(limit)))
  return snap.docs.map(mapCashSession)
}

// --- ORDERS ---

// Conti già creati in questa sessione dell'app, per chiave di battuta: vedi
// createOrder. Serve a non far nascere due conti dalla stessa battuta.
const creazioniInCorso = new Map()

// Crea un ordine con i relativi item. Il numero progressivo riparte ad ogni
// giornata commerciale: è assegnato da un contatore per giornata
// (counters/{YYYY-MM-DD}), che riparte a ogni nuova giornata.
// UNA BATTUTA, UN CONTO. La schermata può chiedere la creazione due volte —
// l'auto-creazione che scatta mentre si preme «Paga», un doppio tocco, due
// copie della schermata aperte — e ogni chiamata creava un conto suo: sono
// nati due #15 nella stessa serata, con dentro le stesse quattro righe. La
// chiave della battuta dice che è la stessa cosa: la seconda volta si
// restituisce il conto che sta già nascendo, invece di farne un altro.
export function createOrder(params) {
  const chiave = params?.client_temp_id
  if (!chiave) return creaOrdine(params)
  const gia = creazioniInCorso.get(chiave)
  if (gia) return gia
  const nascita = creaOrdine(params)
  creazioniInCorso.set(chiave, nascita)
  // Non si tiene per sempre: è una guardia contro il doppio scatto, non una
  // cronologia. Mezz'ora copre qualunque doppione ravvicinato.
  setTimeout(() => creazioniInCorso.delete(chiave), 30 * 60 * 1000)
  // Se la creazione fallisce, la chiave si libera subito: al secondo
  // tentativo il conto deve nascere davvero.
  nascita.catch(() => creazioniInCorso.delete(chiave))
  return nascita
}

async function creaOrdine({
  table_label,
  note,
  items,
  coperto_persons = 0,
  coperto_amount = 0,
  service_charge_amount = 0,
  tip_amount = 0,
  service_mode = null, // 'tavolo' | 'banco' | null (scelta non attiva)
  push_token = null, // token FCM del dispositivo (per le notifiche push)
  placed_by = null, // { email, role } se inserito manualmente dallo staff
  customer_name = null, // nome/pseudonimo (+ cognome) del cliente
  customer_uid = null, // uid dell'account cliente (null per anonimi)
  payment_method = null, // 'online' se il cliente sceglie di pagare subito
  payment_status = 'non_richiesto', // 'in_attesa' per i pagamenti online
  payment_required = false, // fotografa l'impostazione alla creazione
  group_id = null, // gruppo a cui associare l'ordine (null = nessuno)
  group_name_snapshot = null, // nome gruppo al momento dell'ordine (storico)
  // In che passo nasce la prima comanda: lo dice il locale, e lo dice in un
  // posto solo (statoComandaNuova). Resta un parametro perché chi crea
  // l'ordine ha già le impostazioni in mano e le passa; qui c'è il valore
  // di riserva, che è la stessa regola letta dalla cache.
  status = statoComandaNuova(impostazioni()),
  // COLORI AUTOMATICI: se il locale li ha accesi, il conto nasce col suo,
  // scritto sul documento. Come per lo stato qui sopra, il valore di
  // riserva è la stessa impostazione letta dalla cache.
  conti_colorati = impostazioni().conti_colorati === true,
  client_temp_id = null, // id del placeholder POS: la griglia scambia SENZA doppioni
  // SESSIONE DI CREAZIONE APERTA: lo dice il POS quando il conto nasce
  // mentre si sta ancora battendo. Chi crea da altre strade (il cliente dal
  // telefono, un import) non ha nessuna sessione da tenere aperta.
  in_creazione = false,
  cutoff_hour = DEFAULT_CUTOFF_HOUR, // ora di taglio della giornata commerciale
}) {
  // Cliente registrato senza gruppo esplicito → gruppo-cliente automatico
  // (id == uid). Il documento è idempotente (merge).
  if (!group_id && customer_uid) {
    group_id = customer_uid
    if (!group_name_snapshot) group_name_snapshot = customer_name || null
    await ensureCustomerGroup(customer_uid, customer_name || 'Cliente').catch(
      (e) => console.error('[groups] ensureCustomerGroup:', e?.message || e)
    )
  }
  // Un gruppo-contenitore (con sottogruppi) non può avere ordini diretti.
  if (group_id) {
    const gSnap = await getDoc(doc(groupsCol, group_id))
    if (gSnap.exists() && gSnap.data().has_child_groups) {
      throw new Error('Questo gruppo contiene altri gruppi: aggiungi l’ordine a un sottogruppo.')
    }
  }
  const itemsTotal = items.reduce((s, i) => s + i.qty * Number(i.price || 0), 0)
  const total = itemsTotal + coperto_amount + service_charge_amount + tip_amount
  // Giornata commerciale: raggruppa e fa ripartire il progressivo #N. La
  // nottata oltre la mezzanotte resta nella giornata in cui è cominciata.
  const orderDate = businessDayKey(new Date(), cutoff_hour)
  // I NUMERI CI SONO GIÀ: nessuna lettura, nessuna attesa. Stanno in memoria,
  // tenuti aggiornati dagli ascolti che partono all'avvio (lib/progressivi.js).
  // Prima si aspettavano TRE risposte dal server prima di scrivere l'ordine —
  // il mezzo secondo fra «Conferma» e il conto che compare — e due creazioni
  // ravvicinate leggevano lo stesso numero: sono nati due conti #15 nella
  // stessa serata.
  const cashSessionId = cassaCorrente()
  const idContatore = cashSessionId ? `cash-${cashSessionId}` : orderDate
  const newOrderRef = doc(ordersCol)
  const dailyNumber = prendiNumero(idContatore)
  // Progressivo ASSOLUTO del sistema: non riparte mai, identifica l'ordine
  // per sempre (id interno mostrato in piccolo nel dettaglio).
  const serial = prendiNumero('serial')

  const nowIso = new Date().toISOString()
  const mappedItems = items.map((i) => ({
    drink_id: i.drink_id,
    name: i.name,
    unit_price: i.price,
    qty: i.qty,
    sumup_product_id: i.sumup_product_id ?? null,
    // Identita' della riga nella schermata: la si porta dietro cosi' la riga
    // non viene ricreata quando la bozza diventa item confermato.
    ...(i.line_id ? { line_id: i.line_id } : {}),
    ...(i.custom ? { custom: true, recipe_items: i.recipe_items ?? [] } : {}),
    ...(i.note ? { note: i.note } : {}),
  }))
  // Modello conto/comande: l'ordine nasce `aperto` con la COMANDA 1, che
  // porta lo stato di lavorazione (il POS la crea già in preparazione).
  const comanda1 = {
    id: 'c1',
    seq: 1,
    items: mappedItems,
    status,
    status_times: { [status]: nowIso },
    inventory_applied: false,
    inventory_consumption: null,
    created_at: nowIso,
  }
  // Anche l'ordine è local-first: la scrittura entra subito in cache (la
  // sottoscrizione lo mostra all'istante, online e offline), il server la
  // riceve appena c'è rete. Niente await: offline non si sbloccherebbe.
  setDoc(newOrderRef, {
    daily_number: dailyNumber, // progressivo della SESSIONE DI CASSA (o del giorno se la cassa è chiusa)
    serial, // progressivo assoluto di sistema (non riparte mai)
    order_date: orderDate, // giornata commerciale (YYYY-MM-DD)
    // QUANDO È STATO APERTO, secondo l'orologio di qui. `created_at` è un
    // orario del SERVER e finché la scrittura non arriva vale null: la
    // storia del conto restava senza la riga «Conto aperto» — proprio sul
    // conto appena battuto, che è quello che si guarda.
    status_times: { [ORDER_OPEN]: nowIso },
    cash_session_id: cashSessionId, // sessione di cassa che numera l'ordine
    table_label: table_label || null,
    note: note || null,
    // Il colore si decide QUI, una volta sola, e si scrive: dal numero del
    // conto, così due conti battuti di fila non sono mai dello stesso
    // colore (vedi lib/coloriConto.js).
    colore: conti_colorati ? coloreAutomatico(dailyNumber) : null,
    status: ORDER_OPEN,
    comande: [comanda1],
    comande_statuses: [status],
    total,
    coperto_persons,
    coperto_amount,
    service_charge_amount,
    tip_amount,
    service_mode,
    push_token,
    // DA QUALE DISPOSITIVO. Lo stesso account sta su più terminali: senza
    // questo, avvisare «tutti tranne chi l'ha battuto» non si può fare, e
    // infatti prima non si avvisava nessuno (vedi BartenderPage).
    placed_by: placed_by ? { ...placed_by, device: idDispositivo() } : null,
    customer_name,
    customer_uid,
    payment_method,
    payment_status,
    payment_required,
    group_id: group_id || null,
    group_name_snapshot: group_name_snapshot || null,
    payment_id: null,
    client_temp_id,
    in_creazione,
    created_at: serverTimestamp(),
    // Aggregato di tutte le comande (qui solo la prima): usato per totale,
    // scontrino e compatibilità con le viste esistenti.
    items: mappedItems,
  }).catch(() => {})

  // getDoc legge la scrittura locale appena applicata (risolve anche offline):
  // niente attesa del server.
  const snap = await getDoc(newOrderRef)
  const order = mapOrder(snap)

  return order
}

export async function fetchOrder(id) {
  const snap = await getDoc(doc(db, 'orders', id))
  if (!snap.exists()) throw new Error('Ordine non trovato')
  return mapOrder(snap)
}

// Ordini dell'account cliente (su qualunque dispositivo).
export async function fetchOrdersByCustomer(uid, limitN = 30) {
  const snap = await getDocs(
    query(ordersCol, where('customer_uid', '==', uid), fbLimit(limitN))
  )
  const orders = snap.docs.map(mapOrder)
  orders.sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  )
  return orders
}

export async function fetchOrdersByIds(ids) {
  if (!ids || ids.length === 0) return []
  // LETTURE SINGOLE, NON UNA LISTA (BUG-093). Qui prima c'era una query su
  // `documentId() in [...]`, spezzata in blocchi da 30 per il limite della
  // clausola `in`. Ma una query è un `list`, e sugli ordini il `list` adesso
  // passa solo dove la domanda si dimostra sicura da sé (firestore.rules):
  // «solo questi id» non è una domanda che una regola sappia riconoscere,
  // mentre il `get` per id è esattamente il modello che regge il link del
  // conto. Gli id sono al massimo venti — tanti ne tiene il telefono
  // (cart.js) — quindi venti letture in parallelo: non si sente, e la
  // complicazione dei blocchi sparisce.
  const unici = [...new Set(ids)]
  // Un conto che non risponde non azzera la lista degli altri: la query,
  // senza rete, tornava quello che la cache aveva e non un errore, e questa
  // schermata deve comportarsi allo stesso modo.
  const snaps = await Promise.all(
    unici.map((id) => getDoc(doc(ordersCol, id)).catch(() => null))
  )
  const results = snaps.filter((s) => s && s.exists()).map(mapOrder)
  results.sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  )
  return results
}

// Coda del bartender: ordini attivi (non ancora ritirati/pagati).
// Ordini attivi = conti aperti (il flusso di lavorazione vive sulle comande).

export async function fetchActiveOrders() {
  const snap = await getDocs(
    query(ordersCol, where('status', '==', ORDER_OPEN))
  )
  const orders = snap.docs.map(mapOrder)
  orders.sort((a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || ''))
  )
  return orders
}

// Codice della "lotteria degli scontrini" comunicato dal cliente al
// pagamento: si salva sul conto e finisce stampato sullo scontrino.
export async function setOrderLotteryCode(id, code) {
  await updateDoc(doc(db, 'orders', id), {
    lottery_code: String(code || '').trim().toUpperCase() || null,
  })
}

// ── FATTURE DI CORTESIA ────────────────────────────────────────────────
// Non è fatturazione elettronica (SDI): è il documento di cortesia con i
// dati del cliente, numerato per anno, da inviare via email o stampare.
// La numerazione usa un contatore transazionale per anno.
export async function createInvoice({ order, customer, ivaRate = 10 }) {
  const year = new Date().getFullYear()
  const counterRef = doc(db, 'counters', `fatture-${year}`)
  const invoiceRef = doc(invoicesCol)
  const orderRef = doc(db, 'orders', order.id)
  const nowIso = new Date().toISOString()

  const counterSnap = await getDoc(counterRef)
  const seq = ((counterSnap.exists() ? counterSnap.data().seq : 0) || 0) + 1
  const number = `${seq}/${year}`
  await setDoc(counterRef, { seq }, { merge: true })
  await setDoc(invoiceRef, {
    number,
    seq,
    year,
    order_id: order.id,
    order_daily_number: order.daily_number ?? null,
    customer: {
      denominazione: customer.denominazione || '',
      piva: customer.piva || null,
      cf: customer.cf || null,
      sdi: customer.sdi || null,
      indirizzo: customer.indirizzo || null,
      email: customer.email || null,
    },
    items: (order.order_items || []).map((i) => ({
      name: i.name,
      qty: i.qty,
      unit_price: i.unit_price,
    })),
    total: order.total ?? 0,
    discount_amount: order.discount_amount ?? 0,
    iva_rate: Number(ivaRate) || 0,
    status: 'emessa',
    sent_to: null,
    sent_at: null,
    created_at: nowIso,
  })
  await updateDoc(orderRef, { invoice_id: invoiceRef.id, invoice_number: number })
  const snap = await getDoc(invoiceRef)
  return { id: invoiceRef.id, ...snap.data() }
}

// Segna la fattura come inviata (dopo l'apertura del client email).
export async function markInvoiceSent(invoiceId, email) {
  await updateDoc(doc(invoicesCol, invoiceId), {
    sent_to: email || null,
    sent_at: new Date().toISOString(),
  })
}

// Elenco fatture (gestionale), più recenti in alto.
export function subscribeInvoices(cb, onError) {
  const q = query(invoicesCol, orderBy('created_at', 'desc'), fbLimit(200))
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  )
}

// ── BUONI VIP (credito ricaricabile) ──────────────────────────────────
// Un buono ha un saldo in € associato a una persona: si ricarica e si
// scala al pagamento (metodo 'buono'). Tutte le variazioni sono in una
// transazione e lasciano una traccia in `movements`.

export function subscribeVouchers(cb, onError) {
  const q = query(vouchersCol, orderBy('holder_name'))
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data(), created_at: toIso(d.data().created_at) }))),
    onError
  )
}

export async function createVoucher({
  holder_name,
  amount = 0,
  note = null,
  expiry_type = 'none', // 'none' | 'daily' | 'monthly' | 'yearly' | 'date'
  expires_at = null, // ISO date per expiry_type 'date'
  auto_renew = false,
}) {
  const nowIso = new Date().toISOString()
  const initial = Math.max(0, Math.round((Number(amount) || 0) * 100) / 100)
  const ref = await addDoc(vouchersCol, {
    holder_name: String(holder_name || '').trim(),
    balance: initial,
    initial,
    note: note || null,
    expiry_type,
    expires_at: expiry_type === 'date' ? expires_at || null : null,
    auto_renew: !!auto_renew,
    movements: initial > 0 ? [{ type: 'carica', amount: initial, at: nowIso }] : [],
    created_at: serverTimestamp(),
  })
  return { id: ref.id, ...(await getDoc(ref)).data() }
}

// Aggiorna la scadenza di un buono esistente.
export async function updateVoucherExpiry(id, { expiry_type, expires_at = null, auto_renew = false }) {
  await updateDoc(doc(vouchersCol, id), {
    expiry_type,
    expires_at: expiry_type === 'date' ? expires_at || null : null,
    auto_renew: !!auto_renew,
  })
}

// Ricarica un buono (aggiunge al saldo).
export async function topUpVoucher(id, amount) {
  const ref = doc(vouchersCol, id)
  const add = Math.max(0, Math.round((Number(amount) || 0) * 100) / 100)
  if (!(add > 0)) throw new Error('Importo di ricarica non valido')
  const nowIso = new Date().toISOString()
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Buono non trovato')
  const v = snap.data()
  await updateDoc(ref, {
    balance: increment(add),
    movements: [...(v.movements || []), { type: 'carica', amount: add, at: nowIso }],
  })
}

// Elimina un buono (solo a saldo zero, dal gestionale).
export async function deleteVoucher(id) {
  await deleteDoc(doc(vouchersCol, id))
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Rimette `amount` sul saldo di un buono (storno di un buono-sconto rimosso o
// di un ordine annullato). increment(+) è commutativo e si accoda offline.
async function refundVoucher(voucherId, amount, orderId, atIso) {
  const amt = r2(amount)
  if (!voucherId || !(amt > 0)) return
  const ref = doc(vouchersCol, voucherId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const v = snap.data()
  await updateDoc(ref, {
    balance: increment(amt),
    movements: [...(v.movements || []), { type: 'storno', amount: amt, order_id: orderId, at: atIso }],
  })
}

// BUONO come SCONTO: il buono non è un metodo di pagamento ma uno sconto che
// attinge al saldo del beneficiario. Si applica come uno sconto in euro — dal
// 20/08/2026 sulle RIGHE che si stanno riscuotendo, non sul totale — e si
// detrae dal buono, anche PARZIALMENTE (il cliente sceglie quanto usare, fino
// al saldo). Rimuoverlo/annullare l'ordine ristorna il saldo.
export async function applyVoucherDiscount(orderId, voucherId, requestedAmount, { items = null } = {}) {
  const orderRef = doc(db, 'orders', orderId)
  const voucherRef = doc(vouchersCol, voucherId)
  const nowIso = new Date().toISOString()
  const [oSnap, vSnap] = await Promise.all([getDoc(orderRef), getDoc(voucherRef)])
  if (!oSnap.exists()) throw new Error('Ordine non trovato')
  if (!vSnap.exists()) throw new Error('Buono non trovato')
  const o = oSnap.data()
  const v = vSnap.data()
  if (o.status === ORDER_STATUSES.ANNULLATO) throw new Error('Ordine annullato')
  if (o.payment_status === 'pagato') throw new Error('Ordine già pagato')

  // Se c'era già un buono-sconto: quello su un ALTRO buono va ristornato; se
  // era lo STESSO buono, il suo valore torna disponibile (lo si rimpiazza).
  const prev = o.discount && o.discount.type === 'buono' ? o.discount : null
  if (prev && prev.voucher_id && prev.voucher_id !== voucherId) {
    await refundVoucher(prev.voucher_id, prev.value, orderId, nowIso)
  }
  const sameBack = prev && prev.voucher_id === voucherId ? r2(prev.value) : 0
  const balance = Math.max(0, r2((Number(v.balance) || 0) + sameBack))
  // IL BUONO NON PUÒ VALERE PIÙ DELLE RIGHE CHE STA PAGANDO. Come ogni altro
  // sconto cade sulla selezione: scalare dal buono più di quanto si sta
  // riscuotendo vorrebbe dire bruciare credito del beneficiario per niente.
  const righe = Array.isArray(items) && items.length ? items : null
  const base = lordoSelezione(o, righe)
  const redeemed = r2(Math.min(Math.max(0, Number(requestedAmount) || 0), balance, base))
  if (!(redeemed > 0)) throw new Error('Saldo del buono insufficiente')

  const disc = { type: 'buono', value: redeemed, voucher_id: voucherId, voucher_name: v.holder_name }
  await updateDoc(orderRef, { discount: disc, discount_amount: redeemed, discount_items: righe })
  // Netto sul buono: rimetti l'eventuale vecchio valore (stesso buono) e togli
  // il nuovo. movements registra la variazione netta di questo passaggio.
  const net = r2(sameBack - redeemed)
  await updateDoc(voucherRef, {
    balance: increment(net),
    movements: [...(v.movements || []), { type: net >= 0 ? 'storno' : 'uso', amount: net, order_id: orderId, at: nowIso }],
  })
  return { redeemed }
}

// Imposta (o rimuove, con null) lo sconto IN PREPARAZIONE: percentuale o euro.
// L'importo in euro viene calcolato e persistito, così residuo e webhook dei
// pagamenti ragionano sempre sullo stesso numero. Se c'era un buono-sconto lo
// si ristorna prima (il buono torna al beneficiario).
//
// `items` sono le righe che si sta riscuotendo: lo sconto cade su quelle, e
// restano scritte perché altrimenti un altro terminale legge un importo senza
// sapere a che cosa si riferisce. `null` = tutto quello che resta.
//
// `amount` lo può dettare la schermata: quando la selezione cambia sotto uno
// sconto in euro, l'importo nuovo lo decide la strategia del locale
// (discountAfterChange), che qui non si conosce.
export const setOrderDiscount = perConto(async function setOrderDiscount(
  id,
  discount,
  { items = null, amount = null } = {}
) {
  const ref = doc(db, 'orders', id)
  const snap = await leggiOrdine(ref)
  if (!snap.exists()) throw new Error('Ordine non trovato')
  const o = snap.data()
  if (o.payment_status === 'pagato') throw new Error('Ordine già pagato')
  const prev = o.discount && o.discount.type === 'buono' ? o.discount : null
  if (prev && prev.voucher_id) {
    await refundVoucher(prev.voucher_id, prev.value, id, new Date().toISOString())
  }
  const clean =
    discount && Number(discount.value) > 0
      ? { type: discount.type === 'percent' ? 'percent' : 'euro', value: Number(discount.value) }
      : null
  const righe = clean && Array.isArray(items) && items.length ? items : null
  const base = lordoSelezione(o, righe)
  scriviOrdine(
    ref,
    o,
    {
      discount: clean,
      discount_amount: clean
        ? Math.min(amount != null ? r2(amount) : discountAmount(base, clean), base)
        : 0,
      discount_items: righe,
    },
    'sconto ordine'
  )
})

// Registra un incasso (anche PARZIALE, per lo split del conto): appende il
// pagamento e, se il residuo va a zero, chiude il conto come "pagato" —
// anche con comande non servite (l'avviso sta nella UI, come concordato).
// `items` è la selezione pagata (null = importo sul residuo, senza dettaglio).
// CHI STA INCASSANDO, per il rendiconto: in una serata si alternano in due
// o tre alla cassa, e se il contante non torna è la prima domanda che ci si
// fa. Si scrive sul pagamento, che è la riga a cui la domanda si riferisce.
function chiIncassa() {
  const u = auth.currentUser
  if (!u) return null
  return { uid: u.uid, email: u.email || null, name: u.displayName || null }
}

// ── LO SCONTO VIAGGIA COL PAGAMENTO ──────────────────────────────────
//
// `sconto` è lo sconto che questa riscossione si porta via: viene scritto
// DENTRO il pagamento e quello in preparazione sul conto si azzera. Un gesto,
// una scrittura — e da lì in poi quello sconto è storia.
//
// È anche la cura definitiva di BUG-046. `chiude` era nato perché lo sconto
// si applicava un attimo prima di riscuotere, la sua scrittura partiva in
// sottofondo e qui si rileggeva il conto per decidere se l'incasso lo saldava:
// la rilettura prendeva la versione di PRIMA, quella senza sconto, il residuo
// risultava più alto dell'incasso e il conto restava «parziale» mentre a
// schermo era chiuso (con lo scontrino automatico che non usciva mai).
// Adesso lo sconto arriva qui insieme all'importo, quindi il residuo si
// calcola giusto anche su un documento vecchio di un istante. `chiude` resta,
// perché resta vero che quanto è dovuto lo sa la schermata e non la rilettura:
// è la cintura, questa è la bretella.
export const registerPayment = perConto(async function registerPayment(id, { amount, method = 'banco', items = null, autoServe = false, chiude = null, sconto = null } = {}) {
  const ref = doc(db, 'orders', id)
  const nowIso = new Date().toISOString()
  const snap = await leggiOrdine(ref)
  if (!snap.exists()) throw new Error('Ordine non trovato')
  const o = snap.data()
  if (o.status === ORDER_STATUSES.ANNULLATO) throw new Error('Ordine annullato')
  if (o.payment_status === 'pagato') throw new Error('Ordine già pagato')
  // Lo sconto dichiarato dal gesto SOSTITUISCE quello sul documento: è lo
  // stesso, solo più fresco di quanto la cache sappia dire.
  const consumato = sconto && r2(sconto.amount) > 0 ? { ...sconto, amount: r2(sconto.amount) } : null
  const oConSconto = consumato
    ? { ...o, discount: null, discount_amount: consumato.amount, discount_items: null }
    : o
  const due = orderDue(oConSconto)
  // Il tetto sul residuo riletto resta per chi non dice niente: non si
  // registra mai più di quanto risulta dovuto. Chi invece dichiara di star
  // saldando il conto incassa la cifra che ha battuto.
  const paid =
    chiude === true
      ? Math.round((Number(amount) || 0) * 100) / 100
      : Math.min(Number(amount) || 0, due)
  if (!(paid > 0)) throw new Error('Importo non valido')
  const payments = [
    ...(o.payments || []),
    {
      id: `pay-${Date.now()}-${(o.payments || []).length + 1}`,
      amount: paid,
      method,
      items: items?.length ? items : null,
      at: nowIso,
      by: chiIncassa(),
      ...(consumato ? { sconto: consumato } : {}),
    },
  ]
  const closed = chiude === true || paymentCloses(oConSconto, paid)
  const chiusura = closed ? conTimbro(chiusuraPagamento(o, nowIso, { autoServe }), nowIso) : null
  // PRIMA L'INCASSO, POI IL MAGAZZINO. Lo scarico legge ricette e articoli:
  // aspettarlo voleva dire che il conto risultava pagato solo dopo quelle
  // letture, e nella coda compariva fra i chiusi mezzo secondo più tardi.
  scriviOrdine(
    ref,
    o,
    {
      payments,
      // Lo sconto in preparazione è finito dentro il pagamento: sul conto non
      // c'è più niente di preparato, e il prossimo giro parte pulito.
      ...(consumato ? { discount: null, discount_amount: 0, discount_items: null } : {}),
      ...(closed
        ? { ...chiusura, payment_method: summaryMethod(payments) }
        : { payment_status: 'parziale' }),
    },
    'incasso ordine'
  )
  if (chiusura?.comande) {
    // Conto saldato E servito ⇒ le comande mai prese in carico vengono
    // scaricate a magazzino adesso, in sottofondo.
    depleteComandeInventory(unappliedEntries(id, chiusura.comande))
      .then(notifyLowStock)
      .catch(() => {})
  }
  return { closed }
})

// Chiude definitivamente l'ordine come pagato, registrando il metodo
// d'incasso ('banco' per contanti/POS esterno, 'lettore', 'online').
// Conto pagato. Con `autoServe` le comande risultano anche SERVITE (e
// quelle mai prese in carico vengono scaricate a magazzino): lo dice solo
// chi sa che è uscito tutto — gli stati del servizio spenti, o il gesto
// «Riscuoti e servi». Di suo NO: vedi chiusuraPagamento.
export const markOrderPaid = perConto(async function markOrderPaid(id, method, { autoServe = false } = {}) {
  const ref = doc(db, 'orders', id)
  const nowIso = new Date().toISOString()
  const snap = await leggiOrdine(ref)
  if (!snap.exists()) throw new Error('Ordine non trovato')
  const chiusura = conTimbro(chiusuraPagamento(snap.data(), nowIso, { autoServe }), nowIso)
  // Prima il conto, poi il magazzino: vedi closePaidOrder.
  scriviOrdine(ref, snap.data(), { ...chiusura, payment_method: method }, 'pagamento ordine')
  if (chiusura.comande) {
    depleteComandeInventory(unappliedEntries(id, chiusura.comande))
      .then(notifyLowStock)
      .catch(() => {})
  }
})

// Avanza lo stato di UNA COMANDA (il ticket di lavorazione). È qui che vive
// il flusso ricevuto→in_preparazione→pronto→ritirato: l'ordine (conto) resta
// `aperto` e si chiude solo con pagamento/annullo. Allo "in preparazione"
// scala l'inventario sugli item della comanda (snapshot per-comanda usato
// per storni e riallineamenti). I doc legacy vengono convertiti al volo.
// Scarico inventario di PIÙ COMANDE — OFFLINE-FRIENDLY. Legge ricette e
// giacenze dalla cache (getDoc funziona offline con la persistenza) e
// aggiorna le giacenze con increment(-qty): commutativo, si accoda offline
// e non richiede una transazione. Muta le comande (inventory_applied/
// snapshot) e ritorna le scorte basse stimate dallo stock in cache.
// `entries` = [{ orderId, comanda }].
// SCARICO IN SOTTOFONDO — la vendita si scrive PRIMA, le scorte dopo.
//
// Lo scarico ha bisogno di leggere ricette e articoli di inventario. Sono
// letture che offline arrivano dalla cache, ma se quei documenti non ci sono
// (o sono stati riscritti dal server, come dopo un import) partono verso la
// rete — e con una rete collegata che non passa restano appese. Aspettarle
// prima di scrivere l'ordine significava PERDERE GLI ITEM: il conto non si
// salvava perché il magazzino non rispondeva.
//
// Qui l'ordine è già scritto. Se lo scarico non riesce, la comanda resta
// `inventory_applied: false` e viene ripresa al pagamento (unappliedEntries):
// le scorte si allineano più tardi, la vendita non si perde mai.
// ── UNA SCRITTURA IN SOTTOFONDO TOCCA SOLO I CAMPI CHE LE COMPETONO ──
//
// `comande` è un ARRAY, e Firestore un array lo riscrive intero: non
// esiste un percorso tipo `comande.2.inventory_applied`. Chi scrive in
// sottofondo si rilegge quindi il documento — ma la rilettura NON può
// stare all'inizio del lavoro, perché in mezzo ci sono le letture di
// ricette e articoli, che vanno in rete e ci mettono quello che ci mettono.
// Con l'array letto prima di tutto quello, il magazzino riscriveva sopra
// gli avanzamenti fatti nel frattempo: si premeva «Ritirato/Servito», la
// card tornava indietro, e bisognava premere due volte.
//
// Quindi: si rilegge NELL'ISTANTE PRIMA DI SCRIVERE, e si cambiano solo i
// due campi del magazzino — tutto il resto della comanda resta com'è
// arrivato dalla rilettura, stato compreso. La finestra fra rilettura e
// scrittura resta di microsecondi, invece che lunga quanto la rete.
function scriviCampiComanda(ref, comandaId, campi, etichetta) {
  // La rilettura sta DENTRO la scrittura in sottofondo, non prima: cosi'
  // fra il leggere e lo scrivere non passa niente, nemmeno il giro di coda
  // che separa le due cose. E se la scrittura viene ritentata, si rilegge
  // — un tentativo con l'array di dieci secondi fa rimetterebbe indietro
  // quello che nel frattempo e' stato fatto al banco.
  // NEL TURNO DI QUESTO CONTO, come ogni altra mutazione: anche questa
  // riscrive l'array intero, e partire mentre un'aggiunta sta componendo il
  // suo vorrebbe dire cancellarla.
  bgWrite(
    () =>
      inCodaOrdine(ref?.id, async () => {
        const snap = await leggiOrdine(ref)
        if (!snap.exists()) return
        const cur = snap.data()
        const comande = normalizeOrderDoc(cur).comande.map((c) =>
          c.id === comandaId ? { ...c, ...campi } : { ...c }
        )
        ricordaOrdine(ref?.id, { ...cur, comande }, { comande })
        await updateDoc(ref, { comande })
      }),
    etichetta
  )
}

// La comanda è uscita dalla stampante: si segna SUL DATO, così ogni
// terminale lo sa — un browser nuovo non ristampa la serata, e il secondo
// tablet con l'auto-stampa accesa vede il segno del primo. Scrittura in
// sottofondo come tutto il resto: la carta è già fuori, il segno la segue.
export function segnaComandaStampata(orderId, comandaId) {
  if (!orderId || !comandaId) return
  scriviCampiComanda(
    doc(db, 'orders', orderId),
    comandaId,
    { auto_print_at: new Date().toISOString() },
    'comanda stampata'
  )
}

// LA CREAZIONE È FINITA: chi stava battendo il conto è uscito. Da adesso il
// conto è un conto come gli altri — le aggiunte seguono la regola della
// presa in carico, e le comande possono uscire dalla stampante.
//
// LO TOGLIE SOLO L'USCITA, e va bene così: se l'app muore a metà battuta il
// segno resta appeso e quella comanda non esce da sé. «Non è un problema,
// Flavio può ristampare la comanda con l'apposito tasto» (l'utente, 20/08):
// è una decisione, non un buco. Anche un avanzamento di stato lo toglie —
// se qualcuno l'ha preso in mano, la composizione è finita comunque.
export function chiudiCreazione(orderId) {
  if (!orderId) return
  bgWrite(() => updateDoc(doc(db, 'orders', orderId), { in_creazione: false }), 'fine creazione')
}

// LO SCONTRINO È USCITO DALLA STAMPANTE: si segna SUL CONTO, così ogni
// terminale lo sa. Stessa idea di `segnaComandaStampata`, e per lo stesso
// guaio visto al banco: la pretesa vive in localStorage, quindi un browser
// nuovo — o una memoria svuotata — non sapeva niente e stampava in raffica
// gli scontrini di tutti i conti pagati che vedeva (BUG-055). Il segno si
// scrive A CARTA USCITA: segnare prima vorrebbe dire che una stampa fallita
// mette a tacere tutti i terminali per sempre. Campo singolo, niente array:
// non serve rileggere niente.
export function segnaScontrinoStampato(orderId) {
  if (!orderId) return
  bgWrite(
    () => updateDoc(doc(db, 'orders', orderId), { receipt_print_at: new Date().toISOString() }),
    'scontrino stampato'
  )
}

function scaricaInSottofondo(orderId, comandaId) {
  ;(async () => {
    try {
      const ref = doc(db, 'orders', orderId)
      const snap = await leggiOrdine(ref)
      if (!snap.exists()) return
      const norm = normalizeOrderDoc(snap.data())
      const comanda = norm.comande.find((c) => c.id === comandaId)
      if (!comanda || comanda.inventory_applied === true) return
      // depleteComandeInventory segna sulla copia che le si passa cosa ha
      // scaricato: si prende quello, e si scrive solo quello.
      const copia = { ...comanda }
      const lowStock = await depleteComandeInventory([{ orderId, comanda: copia }])
      await scriviCampiComanda(
        ref,
        comandaId,
        {
          inventory_applied: copia.inventory_applied === true,
          inventory_consumption: copia.inventory_consumption ?? null,
        },
        'scarico scorte'
      )
      notifyLowStock(lowStock)
    } catch {
      /* si riprende al pagamento */
    }
  })()
}

// RIALLINEO IN SOTTOFONDO dopo una modifica di comanda già scaricata: si
// confronta il consumo di prima con quello di adesso e si applica solo la
// differenza. Come per lo scarico, la vendita è già scritta: qui si insegue
// il magazzino, non viceversa.
function riallineaInSottofondo(orderId, comandaId) {
  ;(async () => {
    try {
      const ref = doc(db, 'orders', orderId)
      const snap = await leggiOrdine(ref)
      if (!snap.exists()) return
      const norm = normalizeOrderDoc(snap.data())
      const comanda = norm.comande.find((c) => c.id === comandaId)
      if (!comanda) return
      const items = Array.isArray(comanda.items) ? comanda.items : []
      const drinkIds = [...new Set(items.filter((i) => !i.custom).map((i) => i.drink_id).filter(Boolean))]
      const drinkSnaps = await Promise.all(drinkIds.map((d) => leggiDoc(doc(db, 'drinks', d))))
      const drinksById = {}
      drinkSnaps.forEach((sn, idx) => {
        drinksById[drinkIds[idx]] = sn.exists() ? sn.data() : null
      })
      const oldCons = Array.isArray(comanda.inventory_consumption) ? comanda.inventory_consumption : []
      const newCons = computeConsumption(items, drinksById)
      const diffs = consumptionDiff(oldCons, newCons)
      const invSnaps = await Promise.all(
        diffs.map((d) => getDoc(doc(db, 'inventory_items', d.inventory_item_id)))
      )
      for (let idx = 0; idx < diffs.length; idx++) {
        const d = diffs[idx]
        const sn = invSnaps[idx]
        if (!sn.exists()) continue
        const curItem = sn.data()
        // QUELLO CHE NON È UNA SCORTA NON SI TOCCA: la manodopera entra nel
        // costo del drink, non nel magazzino. Lo dice il prodotto, non la sua
        // unità — il ghiaccio si conta a unità e si scarica eccome.
        if (!eScorta(curItem)) continue
        // Il delta si applica com'è, nei due versi. Fermarlo a zero non
        // toglieva soltanto il meno: una comanda RIDOTTA porta un delta
        // negativo, cioè merce che torna sullo scaffale, e il freno lo
        // azzerava — il movimento diceva «carico» e la giacenza non si
        // muoveva di niente (BUG-101). Qui non si riparte da zero come fa un
        // carico merce: questo non è un rifornimento, è la stessa uscita
        // annullata, e deve rimettere il meno dov'era.
        const scarico = qtyInStockUnit(d.delta, d.unit, curItem)
        bgWrite(() => updateDoc(doc(db, 'inventory_items', d.inventory_item_id), {
          stock: increment(-scarico),
        }), 'riallineo scorta')
        bgWrite(() => addDoc(movementsCol, {
          item_id: d.inventory_item_id,
          item_name: curItem.name,
          type: d.delta > 0 ? 'unload' : 'load',
          qty: Math.abs(d.delta),
          unit: curItem.unit ?? null,
          reason: 'modifica ordine',
          order_id: orderId,
          created_at: serverTimestamp(),
        }), 'movimento scorta')
      }
      // Stesso motivo dello scarico: fin qui si è andati in rete a leggere
      // ricette e articoli, e l'array letto all'inizio è vecchio. Si
      // rilegge adesso e si scrive SOLO il consumo.
      await scriviCampiComanda(ref, comandaId, { inventory_consumption: newCons }, 'consumo comanda')
    } catch {
      /* il magazzino si riallinea alla prossima occasione */
    }
  })()
}

async function depleteComandeInventory(entries) {
  if (!entries.length) return []
  const plans = []
  for (const { orderId, comanda } of entries) {
    const items = Array.isArray(comanda.items) ? comanda.items : []
    const drinkIds = [...new Set(items.filter((i) => !i.custom).map((i) => i.drink_id).filter(Boolean))]
    const drinkSnaps = await Promise.all(drinkIds.map((d) => leggiDoc(doc(db, 'drinks', d))))
    const drinksById = {}
    drinkSnaps.forEach((sn, idx) => {
      drinksById[drinkIds[idx]] = sn.exists() ? sn.data() : null
    })
    plans.push({ orderId, comanda, consumption: computeConsumption(items, drinksById) })
  }
  const itemIds = [...new Set(plans.flatMap((p) => p.consumption.map((c) => c.inventory_item_id)))]
  const itemSnaps = await Promise.all(itemIds.map((id) => leggiDoc(doc(db, 'inventory_items', id))))
  const itemsById = {}
  itemSnaps.forEach((sn, idx) => {
    // ARTICOLO ANCORA NELLA FORMA VECCHIA: si SALTA. Qui si è in sottofondo,
    // dietro un gesto che deve andare avanti comunque — la comanda è pronta,
    // il drink è uscito — e fermarlo per un numero vorrebbe dire fermare il
    // servizio. Scalare su una giacenza scritta in centilitri, invece,
    // scriverebbe un numero sbagliato: e in magazzino un numero sbagliato
    // sembra plausibile a chi lo legge.
    if (sn.exists() && !patchNormalizza(sn.data())) itemsById[itemIds[idx]] = sn.data()
  })
  // Un movimento per comanda/ingrediente; la giacenza cala una volta per
  // ingrediente con il delta cumulato (increment: sicuro anche offline).
  const delta = {}
  for (const p of plans) {
    for (const c of p.consumption) {
      const cur = itemsById[c.inventory_item_id]
      if (!cur) continue
      // Dalla ricetta alla giacenza: le unità possono non coincidere.
      delta[c.inventory_item_id] =
        (delta[c.inventory_item_id] || 0) + qtyInStockUnit(c.qty, c.unit, cur)
      bgWrite(() => addDoc(movementsCol, {
        item_id: c.inventory_item_id,
        item_name: cur.name,
        type: 'unload',
        // Nel movimento resta scritto quanto è stato VERSATO (40 ml), che è
        // il dato leggibile; la giacenza cala di quello che vale in pezzi.
        qty: c.qty,
        unit: c.unit ?? cur.unit ?? null,
        reason: 'ordine',
        order_id: p.orderId,
        created_at: serverTimestamp(),
      }), 'movimento scorta')
    }
    p.comanda.inventory_applied = true
    p.comanda.inventory_consumption = p.consumption
  }
  const lowStock = []
  for (const [id, qty] of Object.entries(delta)) {
    const cur = itemsById[id]
    // Come sopra: si scarica solo quello che sta davvero su uno scaffale.
    if (!eScorta(cur)) continue
    // SI SCENDE SOTTO ZERO, ed è voluto (BUG-101). Un prodotto che continua a
    // uscire dopo essere finito non è finito davvero: è arrivato senza che
    // nessuno lo caricasse, o l'ultimo inventario era vecchio. Fermandosi a
    // zero si cancellava proprio il numero che lo dice — quanto se n'è
    // versato senza che risultasse.
    //
    // Il meno non è merce che manca: da uno scaffale vuoto non si versa.
    // È la misura del buco di conteggio, e si chiude da sé al primo carico,
    // che riparte da zero (giacenzaPerCarico): le bottiglie appena arrivate
    // sullo scaffale ci sono tutte, e il magazzino deve contarle tutte.
    // L'increment resta (commutativo, si accoda offline).
    const scarico = Number(qty) || 0
    const newStock = (Number(cur.stock) || 0) - scarico
    bgWrite(() => updateDoc(doc(db, 'inventory_items', id), { stock: increment(-scarico) }), 'scarico scorta')
    if (newStock <= (Number(cur.low_threshold) || 0)) {
      lowStock.push({ name: cur.name, stock: newStock, unit: cur.unit })
    }
  }
  return lowStock
}

// LA RETE DI SICUREZZA. Comande di un conto pagato ancora da scaricare a
// magazzino: è la strada dei locali che NON seguono la preparazione — lì
// non esiste nessun «pronto», le comande risultano servite alla riscossione
// (serveAllComande) e il consumo entra tutto qui. E resta anche con gli
// stati accesi, per quello che a «pronto» non è passato: una scrittura
// persa, o una comanda vecchia di prima che lo scarico si spostasse.
const unappliedEntries = (orderId, comande) =>
  comande
    .filter((c) => c.status === ORDER_STATUSES.RITIRATO && c.inventory_applied !== true)
    .map((comanda) => ({ orderId, comanda }))

// Notifica scorte basse/finite (da chiamare fuori dalla transazione).
// Chi non tiene il magazzino può spegnerle dalle impostazioni: in sala un
// avviso su un ingrediente sotto soglia è solo una riga da chiudere.
function notifyLowStock(lowStock) {
  // Quasi sempre non c'è niente da dire, e leggere le preferenze è comunque
  // un giro sul localStorage in mezzo a un gesto: si esce prima.
  if (!lowStock || lowStock.length === 0) return
  const preferenze = leggiAvvisi(auth.currentUser?.uid)
  for (const it of lowStock) {
    const finito = it.stock <= 0
    if (!avvisoAttivo(preferenze, idAvvisoScorta(finito ? 'empty' : 'low'))) continue
    notify(
      `⚠️ Scorta ${finito ? 'esaurita' : 'in esaurimento'}`,
      `${it.name}: rimasti ${formatQty(it.stock, it.unit)}`
    )
  }
}

// L'AVANZAMENTO, SENZA IL TURNO. Esiste separato per un motivo solo: la
// preparazione parziale lo chiama DENTRO il proprio turno, e mettersi in
// fila dietro se stessi vuol dire non ripartire mai. Da fuori si usa
// `advanceComanda`, che il turno ce l'ha.
async function advanceComandaOra(orderId, comandaId, newStatus) {
  const orderRef = doc(db, 'orders', orderId)
  const nowIso = new Date().toISOString()

  const orderSnap = await leggiOrdine(orderRef)
  if (!orderSnap.exists()) throw new Error('Ordine non trovato')
  const raw = orderSnap.data()
  const norm = normalizeOrderDoc(raw)
  const comande = norm.comande.map((c) => ({ ...c }))
  const comanda = comandaId
    ? comande.find((c) => c.id === comandaId)
    : activeComanda({ comande })
  if (!comanda) throw new Error('Comanda non trovata')

  // IL MAGAZZINO SI SCALA A «PRONTO»: lì il drink è fatto, e a segnarlo è
  // chi l'ha fatto. Prima e dopo gli ingredienti sono IMPEGNATI, e si
  // leggono in magazzino nella colonna «a fine serata» (lib/impegnato.js).
  // La regola sta tutta in comandaDaScaricare (comande.js), col perché.
  // Sempre una volta sola, e DOPO aver salvato l'avanzamento.
  const daScaricare = comandaDaScaricare(comanda, newStatus)

  comanda.status = newStatus
  comanda.status_times = { ...(comanda.status_times || {}), [newStatus]: nowIso }
  // QUALCUNO L'HA PRESA IN MANO, e da adesso è quello a decidere dove
  // finiscono le righe che arrivano dopo (comandaPerLeAggiunte). Il segno lo
  // scrive SOLO il gesto: una comanda NATA in preparazione perché il locale
  // ha acceso quell'impostazione non l'ha presa in mano nessuno.
  if (newStatus === ORDER_STATUSES.IN_PREPARAZIONE) comanda.presa_in_carico = true
  const comandaScritta = { ...comanda, order: raw }

  const patch = {
    status: norm.status,
    comande,
    comande_statuses: comandeStatuses(comande),
    // DA QUALE TERMINALE E' PARTITO L'AVANZAMENTO. Serve alla Cloud
    // Function che avvisa gli altri quando un drink e' pronto: chi ha
    // appena premuto il tasto non ha bisogno che il telefono gli squilli
    // in mano. Sta sul conto e non sulla comanda perche' la funzione
    // guarda il documento, e l'ultimo che l'ha toccato e' quello giusto.
    avanzamento_device: idDispositivo(),
    // Se qualcuno fa avanzare una comanda, il conto non lo sta più
    // componendo nessuno: la sessione di creazione si chiude qui.
    ...(raw.in_creazione ? { in_creazione: false } : {}),
  }
  // Conto già pagato (online/lettore) e tutte le comande servite: il conto
  // si chiude da solo (c'è anche la cintura lato server).
  if (
    newStatus === ORDER_STATUSES.RITIRATO &&
    raw.payment_status === 'pagato' &&
    allServed({ comande })
  ) {
    patch.status = ORDER_STATUSES.PAGATO
    patch[`status_times.${ORDER_STATUSES.PAGATO}`] = nowIso
  }
  scriviOrdine(orderRef, raw, patch, 'stato comanda')

  // Scorte dopo: se il magazzino non risponde l'avanzamento è comunque salvo.
  // Gli avvisi di scorta li manda lo scarico quando ha finito davvero
  // (scaricaInSottofondo): qui non si sa ancora cosa è sceso sotto soglia.
  if (daScaricare) scaricaInSottofondo(orderId, comanda.id)

  // Statistiche tempi del servizio (per ETA cliente), per comanda.
  updateServiceTimeStats(raw, comandaScritta, newStatus).catch((e) =>
    console.error('[eta] aggiornamento statistiche fallito:', e)
  )
}

export const advanceComanda = perConto(advanceComandaOra)

// Retrocompatibilità: avanza la comanda ATTIVA dell'ordine (le viste che
// ragionano per workflow_status continuano a funzionare).
export async function updateOrderStatus(id, status) {
  return advanceComanda(id, null, status)
}

// Incrementa le statistiche tempi del SERVIZIO (perpetue) quando una COMANDA raggiunge
// "pronto" (attesa+preparazione) o "ritirato" (ciclo completo, solo tavolo).
async function updateServiceTimeStats(orderRaw, comanda, status) {
  const ms = (v) => {
    if (!v) return null
    if (typeof v?.toMillis === 'function') return v.toMillis()
    const t = Date.parse(v)
    return Number.isFinite(t) ? t : null
  }
  const t0 = ms(comanda.created_at) ?? ms(orderRaw.created_at)
  const t1 = ms(comanda.status_times?.[ORDER_STATUSES.IN_PREPARAZIONE])
  const t2 = ms(comanda.status_times?.[ORDER_STATUSES.PRONTO])
  const t3 = ms(comanda.status_times?.[ORDER_STATUSES.RITIRATO])

  // setDoc+merge: il documento perpetuo può non esistere ancora.
  if (status === ORDER_STATUSES.PRONTO && t0 && t1 && t2 && t2 >= t1 && t1 >= t0) {
    await setDoc(
      serviceStatsDoc,
      {
        prep_stats: {
          count: increment(1),
          attesa_ms: increment(t1 - t0),
          prep_ms: increment(t2 - t1),
          total_ms: increment(t2 - t0),
        },
      },
      { merge: true }
    )
  }

  if (
    status === ORDER_STATUSES.RITIRATO &&
    orderRaw.service_mode === 'tavolo' &&
    t0 && t1 && t2 && t3 && t3 >= t2 && t2 >= t1 && t1 >= t0
  ) {
    await setDoc(
      serviceStatsDoc,
      {
        eta_stats: {
          count: increment(1),
          attesa_ms: increment(t1 - t0),
          prep_ms: increment(t2 - t1),
          ritiro_ms: increment(t3 - t2),
          total_ms: increment(t3 - t0),
        },
      },
      { merge: true }
    )
  }
}

// Modifica gli item di un ordine (solo finché è 'ricevuto', prima della
// preparazione). Ricalcola il totale. Usato dal cliente dalla pagina ordine.
// Aggancia (o aggiorna) il token push del dispositivo a un ordine già
// creato: utile quando il cliente attiva le notifiche dalla pagina
// dell'ordine, o dopo la scansione del QR di un ordine manuale.
// Consentito dalle regole solo finché l'ordine è in stato "ricevuto".
export async function updateOrderPushToken(id, token) {
  await updateDoc(doc(db, 'orders', id), { push_token: token })
}

// ── SALVARE LE COMANDE E RIFARE IL TOTALE ────────────────────────
//
// È IL PUNTO IN CUI SI SCRIVONO I SOLDI DI UN CONTO, e stava scritto quattro
// volte: la modifica del cliente, l'aggiunta al conto, la divisione di una
// comanda e la modifica dal banco. Quattro copie delle stesse cinque righe —
// aggrega, somma coperto/servizio/mancia, ricalcola lo sconto, scrivi —
// vogliono dire che basta che una resti indietro perché lo stesso conto
// valga due cifre diverse a seconda del gesto che l'ha toccato.
//
// `righe` si passa solo dove le righe da scrivere sono già in mano e NON
// coincidono con l'aggregato: la modifica del cliente riscrive la sua unica
// comanda riga per riga, e `aggregateItems` invece fonde due righe dello
// stesso drink — due Mojito battuti separati diventerebbero uno da due, e
// una nota o un prezzo cambiato a mano su una delle due sparirebbe.
function salvaComandeERifaiTotale(ref, cur, comande, etichetta, righe = null) {
  const items = righe || aggregateItems(comande)
  const extras =
    Number(cur.coperto_amount || 0) +
    Number(cur.service_charge_amount || 0) +
    Number(cur.tip_amount || 0)
  const total = sumItems(items) + extras
  // Lo sconto segue il conto secondo la strategia scelta (vedi
  // discountAfterChange): un importo fisso su un conto cambiato non ha più
  // il significato che aveva quando è stato deciso.
  const sconto = scontoRicalcolato(cur, total, items)
  bgWrite(
    () =>
      updateDoc(ref, {
        status: ORDER_OPEN,
        comande,
        comande_statuses: comandeStatuses(comande),
        items,
        total,
        ...(sconto != null ? { discount_amount: sconto } : {}),
      }),
    etichetta
  )
  // Si restituisce la PATCH INTERA, non i due campi: chi ha chiamato deve
  // poter comporre il conto aggiornato senza rileggerlo, e per farlo gli
  // serve tutto quello che è stato scritto.
  const patch = {
    status: ORDER_OPEN,
    comande,
    comande_statuses: comandeStatuses(comande),
    items,
    total,
    ...(sconto != null ? { discount_amount: sconto } : {}),
  }
  // Ricordato qui e non solo in `ordineDopo`: c'è chi scrive senza dover
  // restituire niente (la preparazione parziale), e anche il suo array deve
  // arrivare intero alla mutazione dopo.
  ricordaOrdine(ref?.id, { ...cur, ...patch }, patch)
  return patch
}

// Modifica del CLIENTE: consentita solo finché il conto ha la sola prima
// comanda ancora "ricevuta" (prima della preparazione). Aggiorna la comanda
// e l'aggregato dell'ordine, ricalcolando il totale.
export const updateOrderItems = perConto(async function updateOrderItems(id, items) {
  const ref = doc(db, 'orders', id)
  const snap = await leggiOrdine(ref)
  if (!snap.exists()) throw new Error('Ordine non trovato')
  const cur = snap.data()
  const norm = normalizeOrderDoc(cur)
  const comande = norm.comande.map((c) => ({ ...c }))
  if (
    norm.status !== ORDER_OPEN ||
    comande.length !== 1 ||
    comande[0].status !== ORDER_STATUSES.RICEVUTO
  ) {
    throw new Error('Ordine già in preparazione: non più modificabile')
  }
  const mapped = items.map((i) => ({
    drink_id: i.drink_id,
    name: i.name,
    unit_price: i.unit_price ?? i.price ?? 0,
    qty: i.qty,
    sumup_product_id: i.sumup_product_id ?? null,
    // Identita' della riga nella schermata: la si porta dietro cosi' la riga
    // non viene ricreata quando la bozza diventa item confermato.
    ...(i.line_id ? { line_id: i.line_id } : {}),
    ...(i.custom ? { custom: true, recipe_items: i.recipe_items ?? [] } : {}),
    ...(i.note ? { note: i.note } : {}),
  }))
  // Come per la modifica dal banco: il ticket già uscito va ristampato
  // completo (qui la comanda è per forza una sola e ancora «da fare»).
  comande[0] = { ...comande[0], items: mapped, ...(comande[0].auto_print_at ? { auto_print_at: null } : {}) }
  // Le righe si scrivono come sono arrivate: qui la comanda è una sola
  // (lo garantisce il controllo qui sopra) e fonderle sarebbe una perdita.
  const patch = salvaComandeERifaiTotale(ref, cur, comande, 'modifica ordine', mapped)
  return ordineDopo(id, cur, patch)
})

// Campi "anagrafici" del conto (nome, tavolo, note): modificabili dal
// bartender finché l'ordine non è chiuso.
// GRUPPO di un conto già aperto: si può associare (o togliere) anche dopo,
// non solo alla creazione. Al bancone il tavolo lo si decide spesso a conto
// avviato — "questi tre li metto insieme" — e prima si poteva farlo solo
// prima del primo drink.
export const setOrderGroup = perConto(async function setOrderGroup(id, groupId) {
  const ref = doc(db, 'orders', id)
  // Serve il conto com'è adesso per poter restituire quello aggiornato
  // senza rileggerlo dopo la scrittura: `leggiOrdine` prende dalla cache, e
  // offline è l'unica copia che c'è.
  const cur = (await leggiOrdine(ref)).data() || {}
  let nome = null
  if (groupId) {
    try {
      const g = await getDoc(doc(groupsCol, groupId))
      if (g.exists()) nome = g.data().name ?? null
    } catch {
      /* nome non leggibile: resta l'associazione, l'etichetta si rilegge dopo */
    }
  }
  const patchGruppo = { group_id: groupId || null, group_name_snapshot: nome }
  bgWrite(() => updateDoc(ref, patchGruppo), 'gruppo del conto')
  return ordineDopo(id, cur, patchGruppo)
})

export async function updateOrderInfo(id, { table_label, note, customer_name }) {
  const patch = {}
  if (table_label !== undefined) patch.table_label = table_label || null
  if (note !== undefined) patch.note = note || null
  if (customer_name !== undefined) patch.customer_name = customer_name || null
  if (Object.keys(patch).length) bgWrite(() => updateDoc(doc(db, 'orders', id), patch), 'dati conto')
  return mapOrder(await getDoc(doc(db, 'orders', id)))
}

// ── IL COLORE DI QUESTO CONTO, SCELTO A MANO ──────────────────────────
//
// Vale sempre: che i colori automatici siano accesi o spenti, e anche sui
// conti nati prima che l'impostazione esistesse. `null` toglie il colore.
//
// La scrittura parte in sottofondo come tutte le altre: il pallino sulla
// card cambia nell'istante in cui si tocca, la rete arriva quando arriva.
export function setOrderColore(id, colore) {
  // Solo tinte della tavolozza: una stringa qualunque finirebbe dentro
  // uno `style` senza che nessuno l'abbia mai guardata.
  const c = coloreValido(colore) ? colore || null : null
  bgWrite(() => updateDoc(doc(db, 'orders', id), { colore: c }), 'colore del conto')
}

// ── SERVIZIO O RITIRO, SU QUESTO CONTO ───────────────────────
//
// L'impostazione del locale dice come NASCONO i conti; qui si cambia
// quello che si ha in mano. Un tavolo che viene a ritirare al banco
// succede tutte le sere.
//
// E CAMBIA I SOLDI: il ritiro azzera coperto e servizio, il servizio li
// rimette coi valori del locale. Le regole — chi può cambiare e cosa
// succede ai supplementi — stanno in lib/consegna.js, che è dove si
// provano; qui si scrive.
export const setOrderServiceMode = perConto(async function setOrderServiceMode(orderId, modo) {
  const ref = doc(db, 'orders', orderId)
  const snap = await leggiOrdine(ref)
  if (!snap.exists()) throw new Error('Ordine non trovato')
  const cur = snap.data()
  const permesso = cambioModoPermesso(cur)
  if (permesso === 'no') {
    throw new Error('Conto chiuso: per cambiarlo riaprilo prima')
  }
  const patch = { service_mode: modo || null }

  // Coi soldi già in cassa i supplementi non si toccano: erano stati
  // calcolati sul totale su cui si è incassato. Si cambia solo il modo.
  if (permesso === 'si') {
    const norm = normalizeOrderDoc(cur)
    const subtotale = sumItems(aggregateItems(norm.comande))
    const supplementi = supplementiPerModo({
      modo,
      // Quante persone erano state contate: passando a ritiro il coperto
      // si azzera, ma il numero resta scritto per quando si torna indietro.
      persone: Number(cur.coperto_persons) || Number(cur.coperto_persons_scelti) || 0,
      subtotale,
      settings: impostazioni(),
    })
    Object.assign(patch, supplementi)
    // Il numero di persone si ricorda a parte: tornando al servizio il
    // coperto deve poter tornare quello di prima, e `coperto_persons` nel
    // frattempo è stato azzerato.
    if (Number(cur.coperto_persons) > 0) {
      patch.coperto_persons_scelti = Number(cur.coperto_persons)
    }
    const nuovoTotale =
      subtotale +
      supplementi.coperto_amount +
      supplementi.service_charge_amount +
      (Number(cur.tip_amount) || 0)
    patch.total = nuovoTotale
    const nuovoSconto = scontoRicalcolato(cur, nuovoTotale)
    if (nuovoSconto != null) patch.discount_amount = nuovoSconto
  }

  bgWrite(() => updateDoc(ref, patch), 'modo consegna')
})

// AGGIUNTA a un conto aperto: crea una NUOVA COMANDA con i soli item
// aggiunti (come "aggiungi un ordine" nei POS) e aggiorna aggregato+totale.
// La comanda nasce già IN PREPARAZIONE (l'aggiunta la fa il banco, che la
// prepara subito): lo stato dell'ordine in coda TORNA "in preparazione"
// anche se le comande precedenti erano pronte/servite, e le scorte si
// scalano subito (snapshot per-comanda, come in advanceComanda).
export const addComanda = perConto(async function addComanda(orderId, items, { note = null } = {}) {
  const ref = doc(db, 'orders', orderId)
  const nowIso = new Date().toISOString()
  const snap = await leggiOrdine(ref)
  if (!snap.exists()) throw new Error('Ordine non trovato')
  const cur = snap.data()
  const norm = normalizeOrderDoc(cur)
  if (norm.status !== ORDER_OPEN) throw new Error('Conto chiuso: non più modificabile')
  const comande = norm.comande.map((c) => ({ ...c }))
  const seq = comande.reduce((m, c) => Math.max(m, c.seq || 0), 0) + 1
  const statoNuova = statoComandaNuova(impostazioni())
  const nuova = {
    id: `c${seq}`,
    seq,
    items: items.map((i) => ({
      drink_id: i.drink_id,
      name: i.name,
      unit_price: i.unit_price ?? i.price ?? 0,
      qty: i.qty,
      sumup_product_id: i.sumup_product_id ?? null,
      ...(i.line_id ? { line_id: i.line_id } : {}),
      ...(i.custom ? { custom: true, recipe_items: i.recipe_items ?? [] } : {}),
      ...(i.note ? { note: i.note } : {}),
    })),
    // In che passo nasce lo dice il locale, e lo dice in un posto solo
    // (statoComandaNuova). L'ora del «ricevuto» c'è comunque: la comanda è
    // arrivata adesso anche se il banco la prende in carico nello stesso
    // istante, e senza quell'orario i tempi di servizio non tornano.
    status: statoNuova,
    status_times: {
      [ORDER_STATUSES.RICEVUTO]: nowIso,
      ...(statoNuova === ORDER_STATUSES.RICEVUTO ? {} : { [statoNuova]: nowIso }),
    },
    note: note || null,
    inventory_applied: false,
    inventory_consumption: null,
    created_at: nowIso,
  }
  comande.push(nuova)
  const patch = salvaComandeERifaiTotale(ref, cur, comande, 'aggiunta al conto')
  // LE SCORTE NON SI SCALANO QUI. Aggiungere una riga al conto non vuol
  // dire aver versato niente: la riga si toglie, il conto si annulla, il
  // cliente cambia idea. Da adesso quegli ingredienti sono IMPEGNATI — si
  // vedono in magazzino, colonna «a fine serata» — e se ne vanno davvero
  // quando la comanda risulta servita (o, senza gli stati del servizio,
  // alla riscossione, che è il momento in cui tutto risulta servito).
  return ordineDopo(orderId, cur, patch)
})

// ── PREPARAZIONE PARZIALE DI UNA COMANDA ─────────────────────
//
// Al banco capita di vedere tre gin tonic in una comanda e due in
// un'altra e prepararli insieme, per farli uscire in una volta. Non
// andrebbe fatto — un ticket si lavora intero — ma si fa, e l'app non lo
// impedisce: lo registra, così il conto resta giusto e la coda dice
// davvero cosa è al banco e cosa aspetta ancora.
//
// La comanda di partenza NON si modifica in silenzio: si ANNULLA e al suo
// posto ne nascono due — le righe scelte, già in preparazione, e il resto,
// che resta «da fare». Così la copia già stampata al banco ha ancora un
// riscontro nella storia del conto, invece di parlare di una comanda che
// nel frattempo è cambiata sotto le mani.
//
// UNA SOLA SCRITTURA. Le tre operazioni toccano lo stesso array `comande`:
// farle con tre chiamate separate vorrebbe dire tre letture e tre
// riscritture dello stesso documento, e chi arriva secondo cancella il
// primo. Le quantità le conta dividiComanda (logica pura, provata a
// unità); qui si scrive e basta.
export const preparazioneParziale = perConto(async function preparazioneParziale(orderId, comandaId, righeScelte) {
  const ref = doc(db, 'orders', orderId)
  const nowIso = new Date().toISOString()
  const snap = await leggiOrdine(ref)
  if (!snap.exists()) throw new Error('Ordine non trovato')
  const cur = snap.data()
  const norm = normalizeOrderDoc(cur)
  if (norm.status !== ORDER_OPEN) throw new Error('Conto chiuso: non più modificabile')
  const comande = norm.comande.map((c) => ({ ...c }))
  const comanda = comande.find((c) => c.id === comandaId)
  if (!comanda) throw new Error('Comanda non trovata')
  // Finché il drink non è uscito dal banco: da «pronto» in poi è roba sul
  // vassoio, e su una comanda servita gli ingredienti sono già stati
  // scalati. La regola sta in comande.js, che è dove si prova.
  if (!comandaDivisibile(comanda)) {
    throw new Error('Questa comanda non si divide più')
  }

  const divisa = dividiComanda(comanda, righeScelte)
  if (!divisa) throw new Error('Non hai scelto niente da preparare')
  // In che passo nascono le due parti lo dice quella di partenza: da «da
  // fare» la parte scelta è quella che si comincia adesso; da «in
  // preparazione» sono tutte e due già al banco.
  const passi = statiDopoLaDivisione(comanda.status)
  // Prese tutte le righe non c'è niente da dividere: la comanda avanza e
  // basta — e se è già dove dovrebbe andare non si tocca niente.
  // Annullarla per rifarla identica lascerebbe in giro una comanda annullata
  // che non racconta niente.
  if (divisa.tutta) {
    // `advanceComandaOra` e non `advanceComanda`: siamo GIÀ nel turno di
    // questo conto, e rimettersi in fila dietro se stessi è un'attesa che
    // non finisce.
    if (comanda.status !== passi.nuova) await advanceComandaOra(orderId, comandaId, passi.nuova)
    return
  }

  comanda.status = ORDER_STATUSES.ANNULLATO
  comanda.status_times = {
    ...(comanda.status_times || {}),
    [ORDER_STATUSES.ANNULLATO]: nowIso,
  }
  // PERCHÉ È ANNULLATA. Questo annullamento è contabilità interna, non un
  // fatto della serata: quei drink non sono spariti, sono diventati le due
  // comande qui sotto. Senza il motivo scritto finirebbe negli elenchi
  // degli annullati insieme a quelli veri, e la stessa roba si vedrebbe due
  // volte (vedi annullataPerDivisione in comande.js).
  comanda.annullata_per = ANNULLATA_PER_DIVISIONE
  comanda.divisa_in = [] // i figli, riempiti sotto: così la storia si legge

  // I numeri delle comande nuove partono dopo l'ultimo usato nel conto:
  // riusare il numero di quella annullata vorrebbe dire due «comanda 2».
  let seq = comande.reduce((m, c) => Math.max(m, c.seq || 0), 0)
  const figlia = (items, stato) => {
    seq += 1
    const tempi = { [ORDER_STATUSES.RICEVUTO]: comanda.status_times?.[ORDER_STATUSES.RICEVUTO] || nowIso }
    if (stato === ORDER_STATUSES.IN_PREPARAZIONE) tempi[ORDER_STATUSES.IN_PREPARAZIONE] = nowIso
    return {
      id: `c${seq}`,
      seq,
      items,
      status: stato,
      status_times: tempi,
      note: comanda.note || null,
      // Le scorte non sono state toccate: si scalano alla comanda SERVITA, e
      // questa non lo è mai stata.
      inventory_applied: false,
      inventory_consumption: null,
      // L'ORARIO RESTA QUELLO DI PARTENZA: il cliente aspetta da quando ha
      // ordinato, non da quando qualcuno ha diviso la comanda. Con l'ora di
      // adesso «da quanto sta lì» sulla card sarebbe ripartito da zero.
      created_at: comanda.created_at || nowIso,
      divisa_da: comanda.id,
    }
  }
  const inPreparazione = figlia(divisa.nuova, passi.nuova)
  const daFare = figlia(divisa.resta, passi.resta)
  comanda.divisa_in = [inPreparazione.id, daFare.id]
  comande.push(inPreparazione, daFare)

  // Il totale del conto non cambia — le stesse unità stanno solo in due
  // ticket invece che in uno — ma si ricalcola con la regola di sempre:
  // scriverlo a mano qui sarebbe il punto in cui un giorno divergerebbe.
  salvaComandeERifaiTotale(ref, cur, comande, 'preparazione parziale')
})

// Modifica di UNA COMANDA da parte del bartender (quantità, rimozioni,
// aggiunte, custom) finché non è servita. Se lo scarico era già stato
// applicato, l'inventario viene riallineato con la DIFFERENZA tra il
// vecchio snapshot della comanda e il nuovo consumo.
export const bartenderUpdateComanda = perConto(async function bartenderUpdateComanda(orderId, comandaId, { items }) {
  const ref = doc(db, 'orders', orderId)
  const newItems = items.map((i) => ({
    drink_id: i.drink_id,
    name: i.name,
    unit_price: i.unit_price ?? i.price ?? 0,
    qty: i.qty,
    sumup_product_id: i.sumup_product_id ?? null,
    // Identita' della riga nella schermata: la si porta dietro cosi' la riga
    // non viene ricreata quando la bozza diventa item confermato.
    ...(i.line_id ? { line_id: i.line_id } : {}),
    ...(i.custom ? { custom: true, recipe_items: i.recipe_items ?? [] } : {}),
    ...(i.note ? { note: i.note } : {}),
  }))

  const snap = await leggiOrdine(ref)
  if (!snap.exists()) throw new Error('Ordine non trovato')
  const cur = snap.data()
  const norm = normalizeOrderDoc(cur)
  if (norm.status !== ORDER_OPEN) throw new Error('Conto chiuso: non più modificabile')
  const comande = norm.comande.map((c) => ({ ...c }))
  const comanda = comande.find((c) => c.id === comandaId)
  if (!comanda) throw new Error('Comanda non trovata')
  // SU UN CONTO RIAPERTO SI TOCCA TUTTO. Di norma una comanda servita non
  // si modifica più: il drink è stato fatto e portato. Ma riaprire un conto
  // serve ESATTAMENTE a rimettere a posto quello che c'è dentro — un giro
  // battuto sul tavolo sbagliato, una birra di troppo — e se le righe di
  // prima restano bloccate il conto riaperto non serve a niente. Le scorte
  // si riallineano con la differenza, come per ogni altra modifica.
  const riaperto = Array.isArray(cur.riaperture) && cur.riaperture.length > 0
  if (comanda.status === ORDER_STATUSES.ANNULLATO) {
    throw new Error('Comanda annullata: non più modificabile')
  }
  if (comanda.status === ORDER_STATUSES.RITIRATO && !riaperto) {
    throw new Error('Comanda già servita: non più modificabile')
  }

  // Scarico già applicato: le scorte si riallineano con la DIFFERENZA, ma
  // DOPO aver salvato le righe. Prima si aspettavano qui le letture di
  // ricette e articoli: se il magazzino non rispondeva, la modifica dell'ordine
  // non veniva scritta e gli item andavano persi.
  const daRiallineare = comanda.inventory_applied === true

  comanda.items = newItems
  // IL TICKET CHE ERA USCITO ADESSO È VECCHIO. Una comanda non ancora presa
  // in carico può accogliere righe nuove (comandaPerLeAggiunte): se era già
  // stata stampata, la carta al banco non racconta più il conto. Il segno si
  // azzera e la coda la ristampa COMPLETA — il foglio vecchio si butta.
  // Su una comanda presa in carico non si tocca niente: quella carta è in
  // mano a qualcuno che ci sta lavorando.
  if (comanda.auto_print_at && !presaInCarico(comanda)) comanda.auto_print_at = null
  const patch = salvaComandeERifaiTotale(ref, cur, comande, 'modifica comanda')
  // Scorte dopo: se erano già state scalate si applica solo la differenza.
  if (daRiallineare) riallineaInSottofondo(orderId, comandaId)
  return ordineDopo(orderId, cur, patch)
})

// Annulla un ordine. Se lo stock era già stato scalato lo ripristina dallo
// snapshot del consumo — TRANNE per kind 'non_ritirato': il drink è stato
// preparato (e sprecato), quindi le scorte restano consumate.
// opts: { by: 'cliente'|'bartender', kind, phrase, message, notify }
export const cancelOrder = perConto(async function cancelOrder(id, opts = {}) {
  const {
    by = 'cliente',
    kind = null,
    phrase = null,
    message = null,
    notify: notifyClient = false,
  } = opts
  const orderRef = doc(db, 'orders', id)
  const snap = await leggiOrdine(orderRef)
  if (!snap.exists()) throw new Error('Ordine non trovato')
  const order = snap.data()
  if (order.status === ORDER_STATUSES.ANNULLATO) return mapOrder(snap)

  // Somma gli snapshot di consumo di TUTTE le comande già scalate (i doc
  // legacy hanno lo snapshot a livello ordine, gestito da normalize).
  const norm = normalizeOrderDoc(order)
  const comande = norm.comande.map((c) => ({ ...c }))
  const consumption = comande
    .filter((c) => c.inventory_applied === true && Array.isArray(c.inventory_consumption))
    .flatMap((c) => c.inventory_consumption)
  const restoreStock = kind !== 'non_ritirato'

  // Le comande non servite diventano annullate (le servite restano a storico).
  const nowIso = new Date().toISOString()
  // I BUONI TORNANO AL LORO POSTO, MA DOPO. Annullando, il conto non si
  // incassa più: se il saldo restasse scalato il cliente avrebbe perso il
  // credito per un conto mai pagato. Le righe restituite si segnano
  // (`restituito_at`), così riaprendo il conto non tornano una seconda
  // volta — sarebbe credito inventato.
  const buoniIncasso = buoniDaRestituire(order)
  for (const c of comande) {
    if (c.status !== ORDER_STATUSES.RITIRATO && c.status !== ORDER_STATUSES.ANNULLATO) {
      c.status = ORDER_STATUSES.ANNULLATO
      c.status_times = { ...(c.status_times || {}), [ORDER_STATUSES.ANNULLATO]: nowIso }
    }
    if (restoreStock) c.inventory_applied = false
  }
  // PRIMA SI ANNULLA IL CONTO. Storni di magazzino e buoni hanno bisogno di
  // leggere altri documenti, e finché quelle letture non tornavano il conto
  // non risultava annullato: si annullava e nella tab «Annullati» compariva
  // mezzo secondo dopo — chi guarda, in quel mezzo secondo, non sa se
  // l'operazione è andata. Il resto si sistema subito dopo, per conto suo.
  const timbro = timbroChiusura(nowIso)
  const patchAnnullo = {
    status: ORDER_STATUSES.ANNULLATO,
    ...timbro,
    // ── L'ANNULLO CHIUDE ANCHE LA COMPOSIZIONE (BUG-071) ────────────
    //
    // «Se alla creazione di un ordine lo annullo anche, la comanda non
    // deve uscire se è abilitata la stampa automatica» (l'utente,
    // 21/08/2026). Il segno `in_creazione` è il cancello della stampa:
    // finché c'è, la comanda non esce (comandeDaStampare); toglierlo la
    // fa uscire. Annullando dalla creazione i due gesti partivano
    // separati — l'uscita dalla schermata toglieva il segno subito,
    // l'annullo arrivava dopo la sua lettura — e in quel buco la coda
    // vedeva un conto composto, aperto e da stampare: la carta usciva.
    // Qui il cancello si chiude INSIEME allo stato, in una scrittura
    // sola: non esiste più un istante in cui il conto è stampabile.
    in_creazione: false,
    comande,
    comande_statuses: comandeStatuses(comande),
    ...(buoniIncasso.length
      ? { payments: segnaBuoniRestituiti(order.payments, nowIso) }
      : {}),
    [`status_times.${ORDER_STATUSES.ANNULLATO}`]: nowIso,
    cancelled_by: by,
    // E CHI, di persona: `cancelled_by` dice solo se è stato il cliente o il
    // banco, e nella storia del conto compariva «bartender» mentre le altre
    // righe dicevano il nome. Tre etichette diverse per la stessa persona.
    cancelled_persona: chiIncassa(),
    // DA QUALE TERMINALE. Serve a non ripetere l'avviso a chi ha appena
    // annullato: lo sa già. Stesso metro degli ordini (placed_by.device).
    cancelled_device: idDispositivo(),
    cancel_kind: kind,
    cancel_phrase: phrase,
    cancel_message: message || null,
    cancel_notify: !!notifyClient,
  }
  bgWrite(() => updateDoc(orderRef, patchAnnullo), 'annullo ordine')

  // E ADESSO IL RESTO, per conto suo: le scorte tornano dentro e i buoni
  // tornano al loro posto. Sono letture di altri documenti, e aspettarle
  // teneva il conto «non ancora annullato» a schermo.
  if (restoreStock && consumption.length > 0) stornaScorte(id, consumption)
  if (order.discount && order.discount.type === 'buono' && order.discount.voucher_id) {
    refundVoucher(order.discount.voucher_id, order.discount.value, id, nowIso).catch(() => {})
  }
  for (const b of buoniIncasso) {
    refundVoucher(b.voucher_id, b.amount, id, nowIso).catch(() => {})
  }
  // Il conto annullato lo conosciamo gia': non si rilegge, si compone.
  // Sulla coda l'annullo deve vedersi nell'istante del gesto, anche a
  // rete ferma.
  return ordineDopo(id, order, patchAnnullo)
})

// Rimette dentro quello che era stato scalato, dallo snapshot del consumo.
// Con `increment(+qty)`: commutativo, si accoda offline e non litiga con le
// altre scritture sullo stesso articolo.
async function stornaScorte(orderId, consumption) {
  try {
    const snaps = await Promise.all(
      consumption.map((c) => leggiDoc(doc(db, 'inventory_items', c.inventory_item_id)))
    )
    for (let idx = 0; idx < consumption.length; idx++) {
      const c = consumption[idx]
      const s = snaps[idx]
      // Come lo scarico: un articolo ancora nella forma vecchia si salta,
      // che rimetterci dentro pezzi darebbe un numero senza senso.
      if (!s.exists() || patchNormalizza(s.data())) continue
      const cur = s.data()
      // Si rimette a posto solo quello che era stato tolto: se non è una
      // scorta non era mai uscito dal magazzino, e rimetterlo dentro
      // regalerebbe giacenza dal nulla.
      if (!eScorta(cur)) continue
      bgWrite(() => updateDoc(doc(db, 'inventory_items', c.inventory_item_id), {
        stock: increment(qtyInStockUnit(c.qty, c.unit, cur)),
      }), 'storno scorta')
      bgWrite(() => addDoc(movementsCol, {
        item_id: c.inventory_item_id,
        item_name: cur.name,
        type: 'load',
        qty: c.qty,
        unit: cur.unit ?? null,
        reason: 'storno',
        order_id: orderId,
        created_at: serverTimestamp(),
      }), 'movimento scorta')
    }
  } catch {
    /* il magazzino si riallinea alla prossima occasione */
  }
}

// RIPRISTINO DI UN CONTO CHIUSO O ANNULLATO. Capita: si chiude un conto sul
// tavolo sbagliato, si annulla per un malinteso, il cliente torna e ordina
// ancora sullo stesso conto. Finora l'unica strada era batterlo da capo, e
// il conto vero restava lì a sporcare la serata.
//
// Cosa NON si tocca, apposta:
//   • gli incassi già registrati restano dove sono. Riaprire un conto non è
//     un rimborso: i soldi presi sono presi, e la cassa deve continuare a
//     tornare. Il dovuto si ricalcola da sé (totale − incassato).
//   • la storia resta tutta: l'annullo, la chiusura, i tempi. In più si
//     scrive la riapertura, con chi e perché.
//   • le comande GIÀ SERVITE restano servite: quei drink sono usciti davvero.
//     Tornano da fare solo quelle annullate insieme al conto.
//
// Sul magazzino: annullando, le scorte erano state rimesse dentro e le
// comande segnate come non scalate — quindi rifacendole si scalano di nuovo,
// una volta sola. È giusto così: il drink va rifatto.
export const restoreOrder = perConto(async function restoreOrder(id, { motivo = null, chi = null } = {}) {
  const orderRef = doc(db, 'orders', id)
  const snap = await leggiOrdine(orderRef)
  if (!snap.exists()) throw new Error('Ordine non trovato')
  const data = snap.data()
  if (data.status !== ORDER_STATUSES.PAGATO && data.status !== ORDER_STATUSES.ANNULLATO) {
    throw new Error('Il conto è già in corso')
  }
  const nowIso = new Date().toISOString()
  const norm = normalizeOrderDoc(data)


  // BUONO VIP: annullando, il saldo era tornato al beneficiario. Riaprendo,
  // lo sconto è ancora sul conto: se non lo si ri-addebita diventa un regalo
  // che nessuno ha pagato, e il credito in circolazione non torna più con i
  // conti. Solo per i conti ANNULLATI: su uno chiuso il buono non era mai
  // stato ristornato, e riprenderlo lo scalerebbe due volte.
  let scontoRiscritto = null
  const buono = data.status === ORDER_STATUSES.ANNULLATO && data.discount?.type === 'buono'
    ? data.discount
    : null
  if (buono?.voucher_id) {
    const vRef = doc(vouchersCol, buono.voucher_id)
    const vSnap = await getDoc(vRef)
    if (!vSnap.exists()) {
      // Buono sparito: lo sconto non ha più un padrone e si toglie.
      scontoRiscritto = { discount: null, discount_amount: 0 }
    } else {
      const v = vSnap.data()
      const esito = riaddebitoBuono(buono, v.balance)
      if (esito.addebito > 0) {
        await updateDoc(vRef, {
          balance: increment(-esito.addebito),
          movements: [
            ...(v.movements || []),
            { type: 'uso', amount: -esito.addebito, order_id: id, at: nowIso },
          ],
        })
      }
      if (esito.discount_amount !== r2(buono.value)) {
        scontoRiscritto = { discount: esito.discount, discount_amount: esito.discount_amount }
      }
    }
  }


  // PAGATO COL BUONO: il saldo torna. La riga di incasso sparisce insieme
  // alle altre (il conto è di nuovo da incassare) e lasciare il saldo
  // scalato vorrebbe dire farlo pagare due volte: una col buono che non
  // torna, una quando ripaga il conto.
  for (const b of buoniDaRestituire(data)) {
    await refundVoucher(b.voucher_id, b.amount, id, nowIso)
  }

  // La regola sta in lib/ripristino.js, pura e provata; qui si scrive.
  const patch = patchRipristino(data, {
    comande: norm.comande,
    nowIso,
    motivo,
    chi,
  })
  const patchRiapertura = {
    status: ORDER_OPEN,
    ...patch,
    comande_statuses: comandeStatuses(patch.comande),
    // Solo se il buono non copriva più tutto: se copre, il conto resta
    // identico a com'era.
    ...(scontoRiscritto || {}),
    // UN CONTO RIAPERTO È UN CONTO DA RICHIUDERE, e alla chiusura lo
    // scontrino deve poter uscire di nuovo (BUG-047): il segno sul dato si
    // azzera qui, insieme alla pretesa locale che libera chi riapre.
    receipt_print_at: null,
    // DA QUALE TERMINALE. Il conto rientra in coda e va annunciato a tutti
    // gli altri, non a chi ha appena premuto: stesso metro di
    // `cancelled_device` (vedi lib/dispositivo.js).
    ripristinato_device: idDispositivo(),
  }
  bgWrite(() => updateDoc(orderRef, patchRiapertura), 'ripristino conto')
  // Riaperto: si compone, non si rilegge. Riaprire un conto e vederlo
  // ancora chiuso e' il difetto che questa riga evitava di avere.
  return ordineDopo(id, data, patchRiapertura)
})

// --- REALTIME ---

// Ascolta in tempo reale un singolo ordine. Restituisce una funzione di
// disiscrizione. `onChange` riceve l'ordine mappato (o null se eliminato).
export function subscribeOrder(id, onChange, onError) {
  const ref = doc(db, 'orders', id)
  // PRIMA DI TUTTO, LA CACHE. Il conto lo si apre dalla card che lo sta già
  // mostrando: è in cache di sicuro. Ma onSnapshot risponde subito col dato
  // locale solo quando SA di essere offline — con la rete collegata e muta
  // (wifi del locale, portale captive, DNS che non risponde) crede di essere
  // online e ASPETTA il server, e la schermata resta sullo spinner con il
  // conto già in tasca. È la stessa medicina della coda (subscribeActiveOrders).
  let arrivato = false
  getDocFromCache(ref)
    .then((snap) => {
      if (!arrivato && snap.exists()) onChange(mapOrder(snap))
    })
    .catch(() => {
      // Cache vuota: si aspetta il listener, come prima.
    })
  return onSnapshot(
    ref,
    (snap) => {
      arrivato = true
      onChange(snap.exists() ? mapOrder(snap) : null)
    },
    onError
  )
}


// Coda attiva (solo ricevuto/in_preparazione): usata per la
// stima personalizzata dei tempi. `onChange` riceve [{daily_number, status}]
// — dati minimi, gli altri ordini non vengono mostrati al cliente.
export function subscribeQueue(onChange, onError) {
  const q = query(
    ordersCol,
    where('comande_statuses', 'array-contains-any', [
      ORDER_STATUSES.RICEVUTO,
      ORDER_STATUSES.IN_PREPARAZIONE,
    ])
  )
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((d) => ({
            daily_number: d.data().daily_number ?? 0,
            // Stato di lavorazione più avanzato tra le comande in coda.
            status: (d.data().comande_statuses || []).includes(ORDER_STATUSES.IN_PREPARAZIONE)
              ? ORDER_STATUSES.IN_PREPARAZIONE
              : ORDER_STATUSES.RICEVUTO,
            payment_required: d.data().payment_required ?? false,
            payment_status: d.data().payment_status ?? 'non_richiesto',
          }))
          // In attesa di pagamento obbligatorio: non è in coda di lavorazione.
          .filter((o) => !(o.payment_required && o.payment_status !== 'pagato'))
      )
    },
    onError ?? (() => {})
  )
}

// Ordini "pronti", in tempo reale: alimenta il tabellone
// "stiamo servendo / pronti al ritiro" nel menù cliente. Espone solo
// numero e modalità di consegna.
export function subscribeReadyOrders(onChange, onError) {
  const q = query(
    ordersCol,
    where('comande_statuses', 'array-contains', ORDER_STATUSES.PRONTO)
  )
  return onSnapshot(
    q,
    (snap) => {
      const ready = snap.docs
        .map((d) => ({
          daily_number: d.data().daily_number ?? 0,
          service_mode: d.data().service_mode ?? null,
        }))
        .sort((a, b) => a.daily_number - b.daily_number)
      onChange(ready)
    },
    onError ?? (() => {})
  )
}

// Sostituisce l'intero catalogo (drinks + categories) con i prodotti
// importati da un CSV. Usato dal pannello admin; richiede bartender
// autenticato (rules). `onProgress(msg)` per il feedback in UI.
export async function replaceCatalog({ categories, products }, onProgress = () => {}) {
  const now = new Date().toISOString()

  // 1. Svuota il catalogo esistente (a blocchi: writeBatch max 500 op).
  for (const [col, ref] of [['drinks', drinksCol], ['categories', categoriesCol]]) {
    const snap = await getDocs(ref)
    const docs = snap.docs
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db)
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    if (docs.length) onProgress(`Svuotata "${col}" (${docs.length})`)
  }

  // 2. Categorie (id pre-generati per collegare i drink nello stesso giro).
  const catIds = {}
  {
    const batch = writeBatch(db)
    categories.forEach((name, i) => {
      const ref = doc(categoriesCol)
      catIds[name] = ref.id
      batch.set(ref, { name, sort_order: i, created_at: now })
    })
    await batch.commit()
    onProgress(`Create ${categories.length} categorie`)
  }

  // 3. Prodotti.
  for (let i = 0; i < products.length; i += 400) {
    const batch = writeBatch(db)
    for (const p of products.slice(i, i + 400)) {
      batch.set(doc(drinksCol), {
        name: p.name,
        description: p.description ?? null,
        category: p.category,
        category_id: catIds[p.category] ?? null,
        recipe: null,
        recipe_items: [],
        price: p.price,
        available: true,
        image_url: null,
        sumup_product_id: p.sumup_product_id ?? null,
        created_at: now,
      })
    }
    await batch.commit()
    onProgress(`Importati ${Math.min(i + 400, products.length)}/${products.length} prodotti`)
  }
}

// --- STAFF CALLS (cerca-persone) ---

const staffCallsCol = collection(db, 'staff_calls')
const staffHoursCol = collection(db, 'staff_hours')

// ── RAPP ORE: registro ore dello staff (per mese) ─────────────────────

export async function addStaffHours({ staff_uid = null, staff_name, date, start, end, break_minutes = 0, hours, note = null, kind = 'effettivo' }) {
  const ref = await addDoc(staffHoursCol, {
    // Il turno è di un MEMBRO dello staff: l'uid è il riferimento stabile,
    // il nome resta come etichetta leggibile nei registri.
    staff_uid,
    staff_name: String(staff_name || '').trim(),
    date, // YYYY-MM-DD
    month: String(date || '').slice(0, 7), // per la query mensile
    start,
    end,
    break_minutes: Number(break_minutes) || 0,
    hours: Number(hours) || 0,
    note: note || null,
    // 'programmato' = turno pianificato, 'effettivo' = ore realmente
    // lavorate (correzione manuale o storico Excel). I doc legacy senza
    // campo sono ore effettive (era il registro RAPP ORE).
    kind: kind === 'programmato' ? 'programmato' : 'effettivo',
    created_at: serverTimestamp(),
  })
  return ref.id
}

export function subscribeStaffHours(month, cb, onError) {
  const q = query(staffHoursCol, where('month', '==', month))
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.start).localeCompare(String(b.start)))
      cb(rows)
    },
    onError
  )
}

export async function deleteStaffHours(id) {
  await deleteDoc(doc(staffHoursCol, id))
}

// Turni in un intervallo di date (per le viste calendario giorno/
// settimana/mese, anche a cavallo di due mesi).
export function subscribeStaffHoursRange(from, to, cb, onError) {
  const q = query(staffHoursCol, where('date', '>=', from), where('date', '<=', to))
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      rows.sort(
        (a, b) =>
          String(a.date).localeCompare(String(b.date)) ||
          String(a.start || '').localeCompare(String(b.start || ''))
      )
      cb(rows)
    },
    onError
  )
}

// Tutto il registro ore (per il dedup dell'import storico).
export async function fetchAllStaffHours() {
  const snap = await getDocs(staffHoursCol)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// ── PAGHE: tariffa oraria per persona, storicizzata ───────────────────
// Un documento per persona (id = nome normalizzato, come sono registrate
// le ore) con l'elenco delle tariffe e la data da cui valgono. Dato
// sensibile: le regole lo riservano al bartender.

const staffRatesCol = collection(db, 'staff_rates')

// Le paghe sono legate al MEMBRO DELLO STAFF (uid dell'account), non a un
// nome scritto a mano: due persone possono chiamarsi uguale e un nome si
// può correggere, l'account no. Il nome si salva comunque come etichetta
// leggibile per i registri storici.

export function subscribeStaffRates(cb, onError) {
  return onSnapshot(
    staffRatesCol,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError ?? (() => {})
  )
}

// Salva l'elenco tariffe di un membro dello staff (già ordinato da paghe.js).
export async function saveStaffRates({ uid, name }, rates) {
  if (!uid) throw new Error('Serve il membro dello staff.')
  await setDoc(
    doc(staffRatesCol, uid),
    { uid, name: String(name || '').trim(), rates: rates || [], updated_at: serverTimestamp() },
    { merge: true }
  )
}

export async function deleteStaffRates(uid) {
  await deleteDoc(doc(staffRatesCol, uid))
}

// ── BADGE VIRTUALE: timbrature entrata/uscita dello staff ─────────────
// Al login lo staff "timbra" l'entrata, al logout l'uscita. Ogni sessione
// è un doc con clock_in/clock_out; finché `open` è vero il turno è in
// corso. Le ore effettive del calendario sommano queste sessioni chiuse
// (kind 'effettivo' come le voci manuali).

const staffShiftsCol = collection(db, 'staff_shifts')

// Timbra ENTRATA: apre una sessione, ma solo se non ce n'è già una aperta
// per questo uid (idempotente: un refresh a sessione aperta non duplica).
// Offline la query legge dalla cache; se la cache è fredda può creare un
// doppione, che il bartender corregge dal backoffice.
export async function clockIn({ uid, name }) {
  if (!uid) return null
  const openQ = query(staffShiftsCol, where('staff_uid', '==', uid), where('open', '==', true))
  const existing = await getDocs(openQ)
  if (!existing.empty) return existing.docs[0].id
  const now = new Date().toISOString()
  const ref = await addDoc(staffShiftsCol, {
    staff_uid: uid,
    staff_name: String(name || '').trim(),
    clock_in: now,
    clock_out: null,
    open: true,
    date: now.slice(0, 10),
    month: now.slice(0, 7),
    hours: 0,
    created_at: serverTimestamp(),
  })
  return ref.id
}

// Timbra USCITA: chiude la/e sessione/i aperta/e dell'uid calcolando le ore.
export async function clockOut({ uid }) {
  if (!uid) return
  const openQ = query(staffShiftsCol, where('staff_uid', '==', uid), where('open', '==', true))
  const snap = await getDocs(openQ)
  const now = new Date().toISOString()
  for (const d of snap.docs) {
    const inIso = d.data().clock_in
    await updateDoc(d.ref, {
      clock_out: now,
      open: false,
      hours: hoursBetweenIso(inIso, now) || 0,
    })
  }
}

// Timbrature in un intervallo di date (per le viste calendario). Marcate
// kind 'effettivo' per il confronto con le ore programmate.
export function subscribeStaffShiftsRange(from, to, cb, onError) {
  const q = query(staffShiftsCol, where('date', '>=', from), where('date', '<=', to))
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), kind: 'effettivo' }))
      rows.sort(
        (a, b) =>
          String(a.date).localeCompare(String(b.date)) ||
          String(a.clock_in || '').localeCompare(String(b.clock_in || ''))
      )
      cb(rows)
    },
    onError
  )
}

// Correzione manuale di una timbratura (bartender): se imposta entrambi
// gli orari ricalcola le ore e chiude la sessione.
export async function updateStaffShift(id, patch) {
  const p = { ...patch }
  if (p.clock_in) {
    p.date = String(p.clock_in).slice(0, 10)
    p.month = String(p.clock_in).slice(0, 7)
  }
  if (p.clock_in && p.clock_out) {
    p.hours = hoursBetweenIso(p.clock_in, p.clock_out) || 0
    p.open = false
  }
  await updateDoc(doc(staffShiftsCol, id), p)
}

export async function deleteStaffShift(id) {
  await deleteDoc(doc(staffShiftsCol, id))
}

// ── CHI È COLLEGATO ADESSO ───────────────────────────────────────────
//
// Serve alla legenda della coda: chi si collega compare fra le iniziali
// anche prima di battere il primo conto. Le regole di chi può vederlo, e
// quando uno «c'è ancora», stanno in lib/presenza.js.
//
// UNA RIGA PER PERSONA, non per dispositivo: la legenda mostra PERSONE, e
// lo stesso Marco su tablet e telefono è un Marco solo. È il contrario di
// `staff_tokens`, che è per dispositivo perché lì si deve far squillare
// ogni apparecchio.
//
// LA SCRITTURA NON SI ASPETTA MAI. È un colpo di vita, non un gesto: se
// fallisce — rete che manca, regole vecchie su un terminale — non deve
// rompere niente e non deve dire niente a nessuno. Al banco un `await` su
// una scrittura offline non torna mai, e per una cosa che si ripete ogni
// tre minuti sarebbe l'app ferma.
export function segnalaPresenza({ uid, name, role }) {
  if (!uid) return
  setDoc(
    doc(db, 'presenze', uid),
    {
      uid,
      name: name || '',
      role: role || null,
      // Orologio DEL CLIENT, non `serverTimestamp`: la finestra si misura
      // con lo stesso orologio che poi la legge, se no due terminali con
      // l'ora storta si vedrebbero l'un l'altro sempre online o mai.
      last_seen: new Date().toISOString(),
    },
    { merge: true }
  ).catch(() => {})
}

// Chi risulta collegato. Si legge tutto e si filtra a valle (presenza.js):
// sono poche righe — quante sono le persone che lavorano — e la finestra
// va confrontata con l'orologio di chi guarda, non con una query.
export function subscribePresenze(onChange, onError) {
  return onSnapshot(
    collection(db, 'presenze'),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError ?? (() => {})
  )
}

// Token push del dispositivo di un membro dello staff: la Cloud Function
// lo usa per recapitare la chiamata cerca-persone anche quando l'app è
// in background o chiusa.
// UN DISPOSITIVO, UNA RIGA. Prima si scriveva una riga per PERSONA
// (`staff_tokens/<uid>`): lo stesso account su tablet e telefono si
// sovrascriveva a vicenda, e gli avvisi arrivavano solo all'ultimo che
// aveva aperto il gestionale — al banco, il tablet muto. La riga adesso è
// del dispositivo, con dentro chi ci sta collegato: due terminali con lo
// stesso account sono due righe, e tutti e due vengono avvisati.
// Senza id dispositivo (memoria locale non disponibile) si ripiega
// sull'uid, che è meglio di niente.
//
// NIENTE RUOLO SULLA RIGA. C'era un campo `role`, e chi mandava le push
// lo usava per smistarle — il «pronto da servire» solo ai dispositivi
// 'staff'. Ma non era il ruolo di nessuno: era il nome della SCHERMATA
// che aveva registrato il dispositivo per ultima, e siccome si finisce
// tutti sulla coda, ci finiva scritto sempre 'bartender'. Il campo
// mentiva, e per colpa sua le notifiche non partivano (BUG-036).
// Adesso non lo scrive più nessuno e non lo legge più nessuno: la riga
// dice chi è collegato e su che apparecchio, che è tutto quello che
// serve a far squillare la cosa giusta.
export async function saveStaffToken(uid, token, device = null) {
  const riga = { uid, token, device: device || null, updated_at: serverTimestamp() }
  try {
    await setDoc(doc(db, 'staff_tokens', device || uid), riga, { merge: true })
    // La riga vecchia, intestata alla persona, va tolta se e' dello stesso
    // apparecchio: altrimenti resta li' senza dispositivo scritto e chi ha
    // appena mandato l'ordine si becca l'avviso del proprio ordine.
    if (device && device !== uid) {
      const vecchia = doc(db, 'staff_tokens', uid)
      const s = await getDoc(vecchia).catch(() => null)
      if (s?.exists() && s.get('token') === token) await deleteDoc(vecchia).catch(() => {})
    }
  } catch (e) {
    // Le regole di sicurezza viaggiano col deploy, ma un terminale può
    // trovarsi davanti alle regole vecchie (che accettavano solo la riga
    // intestata alla persona). Meglio registrarsi lì che restare senza
    // avvisi: l'invio salta i doppioni per token.
    if (device) {
      await setDoc(doc(db, 'staff_tokens', uid), riga, { merge: true })
    } else {
      throw e
    }
  }
}

// USCENDO SI SPENGONO GLI AVVISI DI QUESTO DISPOSITIVO. Il token resta
// valido anche dopo il logout — è del browser, non della persona — e chi si
// era scollegato continuava a sentire suonare gli ordini del locale sul
// telefono di casa. Al prossimo accesso il dispositivo si registra di
// nuovo, quindi non si perde niente.
// Si toglie sia la riga del dispositivo sia quella vecchia intestata alla
// persona, se e' rimasta in giro.
export async function rimuoviStaffToken(uid, device) {
  for (const id of [device, uid].filter(Boolean)) {
    try {
      const snap = await getDoc(doc(db, 'staff_tokens', id))
      if (snap.exists() && (!uid || snap.get('uid') === uid)) {
        await deleteDoc(doc(db, 'staff_tokens', id))
      }
    } catch {
      /* non si riesce: peggio che vada, restano gli avvisi finche' il
         token non scade. Non e' un motivo per non far uscire nessuno. */
    }
  }
}

// Questo dispositivo è registrato per ricevere gli avvisi? Serve alla
// campanella per rispondere alla domanda che al banco si fa per prima.
export async function staffTokenRegistrato(uid, device) {
  for (const id of [device, uid].filter(Boolean)) {
    try {
      const snap = await getDoc(doc(db, 'staff_tokens', id))
      if (snap.exists() && snap.get('token')) return true
    } catch {
      /* non leggibile: si prova l'altra */
    }
  }
  return false
}

// Il bartender chiama un membro dello staff (con messaggio opzionale).
export async function createStaffCall({ to_uid, to_email, message, from_email, from_name }) {
  const ref = await addDoc(staffCallsCol, {
    to_uid,
    to_email,
    from_email: from_email ?? null,
    from_name: from_name ?? null,
    message: message || null,
    status: 'pending',
    created_at: serverTimestamp(),
    acked_at: null,
  })
  return ref.id
}

// Chiamate in attesa per un membro dello staff (realtime).
export function subscribeMyCalls(uid, onChange, onError) {
  const q = query(
    staffCallsCol,
    where('to_uid', '==', uid),
    where('status', '==', 'pending')
  )
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError ?? (() => {})
  )
}

// Tutte le chiamate in attesa (per il feedback del bartender).
export function subscribePendingCalls(onChange, onError) {
  const q = query(staffCallsCol, where('status', '==', 'pending'))
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError ?? (() => {})
  )
}

// Lo staff risponde alla chiamata.
export async function ackStaffCall(id) {
  await updateDoc(doc(db, 'staff_calls', id), {
    status: 'acked',
    acked_at: serverTimestamp(),
  })
}

// --- SETTINGS ---

export const DEFAULT_SETTINGS = {
  menu_only: false,
  // GIORNATA COMMERCIALE: ora a cui "gira" la giornata. Il locale lavora
  // oltre la mezzanotte, quindi la nottata resta contata nella giornata in
  // cui è cominciata. Raggruppa statistiche e fa ripartire il progressivo
  // #N. Non chiude nulla: i conti restano aperti finché non li si chiude.
  business_day_cutoff_hour: DEFAULT_CUTOFF_HOUR,
  // PREZZO CONSIGLIATO: ricarico sul costo degli ingredienti (di norma
  // ×3, ma dipende dal drink) e passo di arrotondamento del listino.
  // È solo un suggerimento: il prezzo resta sempre modificabile a mano.
  // GESTIONE PREPARAZIONE: se spenta il locale tiene traccia solo degli
  // ordini (ricevuto → pagato), senza il ciclo di lavorazione. Sparisce
  // tutto ciò che ne dipende: avanzamenti di stato, tempi di servizio,
  // stima ETA e notifiche di "pronto". Disattivata di default: la si accende
  // solo se si vuole tracciare la preparazione.
  // LA ⓘ CON LA RICETTA sulle card della griglia: accesa di suo. Dove il
  // listino lo sanno tutti a memoria si spegne, e le card restano pulite.
  pos_ricetta_info: true,
  workflow_enabled: false,
  // LE FUNZIONI PREMIUM (lib/licenza.js). Questi sono gli interruttori
  // D'USO — «il locale lo sta usando?» — e NON dicono cosa il locale ha
  // comprato: quella è la licenza, e sta in licenza.js (campo `incluso`)
  // finché non arriva il documento `settings/licenza` della Fase 3. Un
  // modulo non incluso resta spento comunque, qualunque cosa dica il flag.
  // Accesi di suo, come `workflow_enabled !== false`: quello che il locale
  // ha comprato funziona senza che nessuno lo debba accendere.
  modulo_conta_enabled: true,
  modulo_scadenzario_enabled: true,
  modulo_fatture_enabled: true,
  // RISCUOTI E SERVI: col servizio seguito, incassare non chiude il conto —
  // si può pagare in anticipo con tre drink ancora da fare. Ma al banco
  // capita spessissimo il contrario: si consegna e si incassa nello stesso
  // gesto, e in quel caso due passaggi sono uno di troppo. Acceso, nella
  // schermata di pagamento compare anche «Riscuoti e servi», che chiude
  // tutto in un colpo. Spento di default: chi segue il servizio di solito
  // lo segue apposta.
  riscuoti_e_servi: false,
  // «Riscuoti (senza stampa)» nella schermata di pagamento: spento di suo.
  riscuoti_senza_stampa: false,
  // LO SCONTRINO D'ACCONTO (REQ-STAMPA-015). Chi versa una parte e se ne va
  // non aveva niente in mano: la stampa era appesa alla CHIUSURA del conto, e
  // un acconto non chiude. Due interruttori, tutti e due spenti di suo — chi
  // non tocca niente non vede cambiare niente:
  //   `scontrino_acconto_tasto`  fa comparire il terzo tasto «Acconto con
  //                              scontrino», da premere quando serve;
  //   `scontrino_acconto_sempre` la carta esce da sé a ogni riscossione che
  //                              non chiude, e allora il terzo tasto non ha
  //                              più niente da fare: la sua opzione si
  //                              disabilita (lib/scontrinoAcconto.js).
  scontrino_acconto_tasto: false,
  scontrino_acconto_sempre: false,
  price_markup: DEFAULT_MARKUP,
  price_round_step: DEFAULT_ROUND_STEP,
  // IVA di vendita (somministrazione bar = 10%): serve a scorporare l'IVA dal
  // fatturato per confrontarlo al netto con gli acquisti (Dashboard mensile).
  sale_vat: 10,
  // IVA di ACQUISTO (ordinaria = 22%): è quella delle fatture fornitore, quindi
  // il default dei prodotti in Inventario. Diversa da quella di vendita.
  purchase_vat: 22,
  // COSA FA LO SCONTO quando si tolgono righe da un conto già scontato:
  // 'tetto' (default) | 'proporzione' | 'avviso'. Le tre strategie sono
  // spiegate per esteso in pagamento.js e nella schermata Impostazioni.
  discount_policy: DEFAULT_DISCOUNT_POLICY,
  coperto_enabled: false,
  coperto_amount: 2,
  service_charge_enabled: false,
  service_charge_percent: 10,
  tip_enabled: false,
  show_ingredient_quantities: true,
  // Modalità di consegna: 'tavolo' (servizio), 'banco' (ritiro) o 'entrambi'
  // (sceglie il cliente all'ordine). Il ritiro al banco azzera coperto e
  // costo di servizio.
  // I DUE MONDI: 'tavolo' (solo servizio) o 'entrambi' (ritiro e servizio
  // convivono). Non è un vincolo — lo staff cambia il modo sul singolo
  // conto — ma dice cosa esiste nel locale. I vecchi valori si leggono
  // ancora: la traduzione sta in lib/consegna.js, in un posto solo.
  service_mode: 'tavolo',
  // Dentro «ritiro e servizio»: con che modo NASCONO i conti battuti dallo
  // staff. Un valore di partenza, non una regola.
  consegna_default: 'tavolo',
  // Dentro «ritiro e servizio»: il cliente sceglie il suo ordinando dal
  // telefono. Parla di CHI sceglie, quindi vuole le ordinazioni accese.
  cliente_sceglie_consegna: false,
  // Tempo stimato di servizio mostrato ai clienti: parte dal tempo base e si
  // raffina con i tempi reali del servizio.
  eta_enabled: false,
  eta_base_minutes: 10,
  // Frase di default mostrata al cliente quando il bartender annulla un
  // ordine: 'bancone' o 'staff' (vedi CANCEL_PHRASES).
  cancel_phrase_default: 'bancone',
  // Tabellone "stiamo servendo / pronti al ritiro" nel menù cliente.
  show_serving_board: true,
  // Account clienti: se disattivato, login/registrazione clienti nascosti
  // (lo staff continua ad accedere da /bar).
  customer_accounts_enabled: true,
  // Geolocalizzazione obbligatoria per ordinare (verifica di prossimità).
  geofence_enabled: false,
  venue_address: '',
  venue_lat: null,
  venue_lng: null,
  venue_radius_m: 150,
  // Coda ordini bartender: 'tabs' (schede per stato) o 'lista' (lista unica
  // con stato indicato da colore/etichetta sulla card).
  queue_view: 'griglia',
  // LA VISTA DEL BANCO. Chi sta allo shaker non guarda la stessa cosa di chi
  // tiene la cassa: a lui servono le COMANDE, nei passi del servizio. Ad
  // accenderla sono gli stati del servizio — senza quei passi non ci
  // sarebbe niente da mostrare — e questa impostazione dice soltanto COME
  // disegnarla. È una lista di viste possibili, non un interruttore: per
  // ora ce n'è una sola, ma quando se ne aggiungerà un'altra il valore che
  // c'è già scritto su settings/bar resta buono — con un booleano si
  // sarebbe dovuto migrare.
  bartender_view: 'corsie',
  // LE COMANDE NASCONO GIÀ IN PREPARAZIONE? Di suo no: si battono tre conti
  // di fila e poi si comincia a versare, ed è «Lo preparo io» a dire quando
  // si comincia — e chi. Dove invece si prepara nell'istante in cui si
  // batte, quel passo è un tocco in più per ogni comanda, tutta la sera.
  // A leggerla è statoComandaNuova (comande.js), che è l'unico posto dove
  // si decide in che passo nasce una comanda.
  comande_in_preparazione: false,
  // Cosa fa la ricerca nella coda: 'filtra' lascia in pagina solo i conti
  // che rispondono (come è sempre stato), 'evidenzia' non toglie niente —
  // accende il primo conto trovato e ce lo porta sotto gli occhi. Il
  // secondo modo serve a chi vuole tenere davanti tutta la coda mentre
  // cerca un nome.
  queue_search: 'filtra',
  // OGNI CONTO NUOVO NASCE COL SUO COLORE? Di suo no: è un segno in più
  // sulla card, e dove i conti sono pochi non serve a niente. Dove invece
  // un conto si spezza in tre comande che finiscono in tre colonne
  // diverse, il pallino colorato è l'unica cosa che da lontano dice che
  // sono lo stesso tavolo. Il colore a mano si può dare comunque, acceso
  // o spento che sia questo (vedi lib/coloriConto.js).
  conti_colorati: false,
  // COSA DICE LA STRISCIA a sinistra della card, in tutte le viste della
  // coda: di suo lo STATO — a che punto sta il lavoro e com'è messo il
  // pagamento — che è com'è sempre stato e resta il default. Acceso,
  // invece, la striscia porta il COLORE DEL CONTO (quello scelto a mano o
  // assegnato in automatico): chiesto dall'utente il 20/08/2026, perché
  // dove un conto si spezza in tante comande sparse riconoscere il tavolo
  // vale più del passo di lavoro. Chi vince, e le due eccezioni, stanno in
  // lib/coloriConto.js.
  bordo_colore_conto: false,
  // Vista ordine: raggruppamento di default degli item aggiunti —
  // 'separati' (ogni tocco una riga a sé) o 'uniti' (item uguali sommati).
  // Si può comunque unire/separare al volo dal riepilogo ordine.
  // Dove finisce l'item appena aggiunto nella lista ordine: in fondo (default,
  // e la lista scorre a mostrarlo) o in cima (subito visibile senza scorrere).
  pos_add_top: false,
  // Il MINIMO della scala del testo nelle righe del conto (il testo segue
  // la larghezza del pannello, ma sotto questa soglia non scende): 1.1 è
  // com'era da sempre; chi lo trova un manifesto lo abbassa.
  pos_testo_min: 1.1,
  // Come mostrare le categorie nel POS: 'dot' (pallino + testo, come ora),
  // 'icon_text' (icona + testo) o 'icon' (solo icona).
  category_display: 'dot',
  // Cosa fa la ricerca nella griglia prodotti del POS: 'filtra' lascia le
  // sole card che rispondono (come è sempre stato), 'evidenzia' non toglie
  // niente — accende la prima card trovata e ci porta sopra la griglia. Chi
  // lavora a memoria di posizione la griglia la vuole sempre uguale.
  pos_search: 'filtra',
  // COSA DICE LA STRISCIA A SINISTRA DELLE CARD (vedi lib/strisce.js):
  // 'spenta' | 'prodotto' | 'categoria' | 'scorte'. Due scelte separate —
  // la griglia del conto e le schede del menù si guardano per motivi
  // diversi — e una terza per il colore del «ce n'è abbastanza»: grigio
  // (discreto) o verde. La scelta è del LOCALE: la griglia dev'essere la
  // stessa su tutti i terminali, o due persone parlano di due schermate
  // diverse.
  stripe_pos: 'prodotto',
  stripe_menu: 'scorte',
  // «Ce n'è abbastanza» in verde o in grigio: SEPARATO per le due
  // schermate. Nel conto si batte di corsa e una griglia tutta verde è
  // rumore — lì interessano i guai; nel catalogo invece si guarda con
  // calma cosa si può fare, e il verde è un'informazione.
  stripe_ok_verde: false,
  stripe_menu_ok_verde: false,
  // Pagamenti: online (SumUp Checkout) e lettore Solo (Cloud API).
  payments_online_enabled: false,
  payments_online_required: false,
  payments_reader_enabled: false,
  sumup_reader_id: null,
  sumup_reader_name: null,
  // Chi non paga online deve ritirare al banco (dove c'è un banco).
  banco_required_if_unpaid: false,
  // Gruppi di ordini (contenitori associabili ai clienti).
  groups_enabled: false,
  groups_in_drawer: true,
  groups_in_queue: true,
  // Temi: preset + eventuali override colore, separati per gestionale
  // (staff/bartender) e vista cliente. Vedi src/lib/themes.js.
  theme_staff: { preset: 'tana-scuro', custom: null },
  theme_client: { preset: 'tana-scuro', custom: null },
}

// IMPOSTAZIONI IN CACHE. Le scritture sugli ordini devono sapere che sconto
// applicare quando cambiano le righe, e non possono permettersi una lettura
// di rete a ogni tocco del + o del −. La cache si popola da subscribeSettings
// (che il gestionale tiene sempre aperto); se nessuno l'ha ancora aperto si
// legge una volta sola, dalla cache offline se serve.
let settingsCache = null

// I valori con cui disegnare la prima volta, prima che il server risponda:
// l'ultima risposta ricordata, o i default. Serve dove l'impostazione
// decide un colore — se no si vede il lampo.
export const settingsIniziali = () => impostazioniRicordate(DEFAULT_SETTINGS)

// SUBITO, senza aspettare NIENTE. Una preferenza non deve poter ritardare —
// né tantomeno impedire — il salvataggio di un ordine: se la cache non c'è
// ancora si parte dai default e la si riempie in sottofondo, per la prossima
// volta. (Prima qui c'era un `await getDoc`: con una rete collegata che non
// passa quella lettura resta appesa, e con lei restava appesa la scrittura
// degli item — gli ordini non si salvavano più.)
function impostazioni() {
  if (!settingsCache) {
    getDoc(settingsDoc)
      .then((snap) => {
        if (snap.exists()) settingsCache = snap.data()
      })
      .catch(() => {})
  }
  return { ...DEFAULT_SETTINGS, ...(settingsCache || {}) }
}

// Sconto da riscrivere quando cambiano le righe del conto. Ritorna null se
// sull'ordine non c'è nessuno sconto in preparazione: in quel caso non si
// tocca il campo.
//
// LA BASE NON È PIÙ IL TOTALE, sono le righe su cui lo sconto cade
// (`discount_items`; null = tutto il residuo, che è il caso di sempre). Se una
// di quelle righe sparisce dal conto, la sua base cala e lo sconto la segue
// secondo la strategia scelta — senza `discount_items` si scontavano righe che
// dal conto erano già state tolte.
function scontoRicalcolato(cur, nuovoTotale, nuoviItems = null) {
  const discount = cur?.discount || null
  if (!discount) return null
  const righe = cur.discount_items || null
  const prima = { ...cur }
  const dopo = { ...cur, total: nuovoTotale, ...(nuoviItems ? { order_items: nuoviItems, comande: null } : {}) }
  return discountAfterChange(
    {
      discount,
      prevAmount: cur.discount_amount,
      prevTotal: lordoSelezione(prima, righe),
      newTotal: lordoSelezione(dopo, righe),
    },
    impostazioni().discount_policy
  )
}

export function subscribeSettings(onChange, onError) {
  return onSnapshot(
    settingsDoc,
    (snap) => {
      if (!snap.exists()) return onChange({ ...DEFAULT_SETTINGS })
      const data = snap.data()
      settingsCache = data
      // Per la PROSSIMA apertura: si disegna con l'ultima verità nota
      // invece che coi valori di partenza (vedi impostazioniLocali.js).
      ricordaImpostazioni(data)
      const merged = { ...DEFAULT_SETTINGS, ...data }
      // Retrocompatibilità col vecchio flag booleano della scelta consegna.
      if (!data.service_mode && data.service_mode_choice_enabled) {
        merged.service_mode = 'entrambi'
      }
      onChange(merged)
    },
    onError ?? (() => {})
  )
}

export async function updateSettings(data) {
  await setDoc(settingsDoc, { ...data, updated_at: serverTimestamp() }, { merge: true })
}

// --- CONFIG STAMPANTE (persistita anche su server) ---
// L'IP e le preferenze stampante stavano solo in localStorage, che su iPad/
// Safari (PWA) viene svuotato dopo giorni di inattività (ITP): l'IP si perdeva.
// Le mirror-iamo su Firestore (doc condiviso del locale) e reidratiamo il
// localStorage all'avvio, così l'IP sopravvive alla pulizia della cache.
const printerConfigDoc = doc(db, 'settings', 'printer')

export function subscribePrinterConfig(onChange, onError) {
  return onSnapshot(
    printerConfigDoc,
    (snap) => onChange(snap.exists() ? snap.data() : null),
    onError ?? (() => {})
  )
}

// Salvataggio local-first: scrittura in background, non blocca offline.
export function savePrinterConfig(patch) {
  setDoc(printerConfigDoc, { ...patch, updated_at: serverTimestamp() }, { merge: true }).catch(() => {})
}
