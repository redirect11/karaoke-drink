import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Caricamento from './Caricamento.jsx'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DrinkTile } from './PosBits.jsx'
import { catBtnStyle } from '../lib/posStyles.js'
import { catColor, drinkCategoryColor, CATEGORY_PALETTE } from '../lib/categoryColors.js'
import {
  coloreStriscia,
  scorteDelDrink,
  striscaGuardaLeScorte,
  MODO_STRISCIA_DEFAULT,
} from '../lib/strisce.js'
import { stockStatus } from '../lib/inventory.js'
import { spegnibile } from '../lib/sensoriDnd.js'
import {
  applyOrder,
  moveInOrder,
  toggleFavorite,
  loadOrder,
  saveOrder,
  loadFavorites,
  saveFavorites,
  loadColors,
  saveColors,
  prodottoCorrisponde,
  primoProdottoCorrispondente,
} from '../lib/posCatalog.js'
import {
  subscribePosPrefs,
  savePosOrder,
  savePosFavorites,
  savePosColors,
  updateDrink,
  createCategory,
  fetchInventoryItems,
} from '../lib/api.js'
import { saveDrinkFromForm } from '../lib/saveDrink.js'
import { toastError } from '../lib/toast.js'
import DrinkForm from './DrinkForm.jsx'

// Colonna categorie + griglia prodotti (il "centro" del POS). Oltre alle
// categorie ci sono due raccolte speciali: ⭐ Preferiti (i drink che il
// bartender fissa in alto) e 🕘 Recenti (gli ultimi item ordinati, passati
// via `recentIds`). In "Tutti" le card si RIORDINANO col drag (attivando la
// modalità riordino) e l'ordine è ricordato per dispositivo.
// Il guscio del trascinamento. STA SEMPRE, anche fuori da «organizza»:
// montarlo solo lì significava spostare la griglia in un altro posto
// dell'albero, e React a quel punto butta il riquadro e ne fa uno nuovo.
// Si vedeva: per un attimo le card cambiavano misura e poi tornavano —
// il tempo di rifare il riquadro, rimisurarlo e ridisegnare. Senza gesti
// attivi (sensori spenti) e senza niente di trascinabile dentro, qui non
// fa nulla: è solo un contenitore che resta al suo posto.
//
// E ANCHE I SENSORI STANNO SEMPRE, TUTTI E TRE: la lista non si svuota più
// fuori da «organizza» — cambiarle lunghezza è il difetto spiegato in
// `lib/sensoriDnd.js` — e a spegnere il gesto è l'opzione `attiva`.
const PointerSensorSpegnibile = spegnibile(PointerSensor)
const TouchSensorSpegnibile = spegnibile(TouchSensor)
const KeyboardSensorSpegnibile = spegnibile(KeyboardSensor)

// LA CARD IN MANO NON ESCE DALLA GRIGLIA.
//
// Trascinandola verso destra finiva oltre il bordo: lì fuori non c'è
// niente da riordinare, ma la griglia — che scorre — si allargava per
// contenerla e partiva uno scorrimento orizzontale senza fine. Per
// tornare a vedere le card bisognava riportare indietro la barra a mano.
//
// Qui il movimento si ferma ai bordi del riquadro che scorre: si può
// prendere una card e portarla dove ha senso lasciarla, e basta. È un
// «modifier» di dnd-kit, cioè una funzione che corregge lo spostamento
// prima che venga applicato.
function dentroLaGriglia({ transform, draggingNodeRect, containerNodeRect }) {
  if (!draggingNodeRect || !containerNodeRect) return transform
  const minX = containerNodeRect.left - draggingNodeRect.left
  const maxX = containerNodeRect.right - draggingNodeRect.right
  const minY = containerNodeRect.top - draggingNodeRect.top
  const maxY = containerNodeRect.bottom - draggingNodeRect.bottom
  return {
    ...transform,
    x: Math.min(Math.max(transform.x, minX), maxX),
    y: Math.min(Math.max(transform.y, minY), maxY),
  }
}

function Riordinabile({ sensori, ids, onFine, children }) {
  return (
    <DndContext
      sensors={sensori}
      collisionDetection={closestCenter}
      modifiers={[dentroLaGriglia]}
      onDragEnd={onFine}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

// Una cella della griglia in modalità organizza: la maniglia porta i
// gesti, la card dentro resta com'è. Il movimento — la card che segue il
// dito e le altre che fanno spazio — lo mette dnd-kit.
function CellaOrdinabile({ drink, qty, color, striscia, onApri }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: drink.id })
  return (
    <div
      ref={setNodeRef}
      className={`reorder-cell${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div
        className="reorder-grip"
        title="Trascina per spostare"
        aria-label={`Trascina ${drink.name}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </div>
      <DrinkTile
        drink={drink}
        qty={qty}
        color={color}
        striscia={striscia}
        onAdd={onApri}
        onSetQty={() => {}}
      />
    </div>
  )
}

export default function PosProductPicker({
  drinks,
  cats,
  loading,
  qtyByDrink,
  onInfo,
  onAdd,
  onSetQty,
  onInteract = null, // notifica il parent quando si lavora sulla griglia (scroll/ricerca)
  disabled = false,
  categoryDisplay = 'dot',
  catsHandleProps = null,
  recentIds = [],
  // Cosa fa la ricerca: filtrare le card (come è sempre stato) oppure
  // lasciarle tutte in griglia e accendere la prima che risponde.
  ricercaEvidenzia = false,
  // Cosa dice la striscia a sinistra delle tile (vedi lib/strisce.js).
  modoStriscia = MODO_STRISCIA_DEFAULT,
  scorteVerdi = false,
}) {
  const [selectedCat, setSelectedCat] = useState(null)
  const [query, setQuery] = useState('')
  const cercaRef = useRef(null)
  const [order, setOrder] = useState(() => loadOrder())
  const [favorites, setFavorites] = useState(() => loadFavorites())
  const [tileColors, setTileColors] = useState(() => loadColors())
  const [reordering, setReordering] = useState(false)
  const [menuDrink, setMenuDrink] = useState(null) // MENU del singolo prodotto
  const [editDrink, setEditDrink] = useState(null) // scheda prodotto in modifica
  const [savingDrink, setSavingDrink] = useState(false)
  const [inventory, setInventory] = useState([]) // per la ricetta nella scheda
  const gridRef = useRef(null)

  // Le card (e il loro testo) seguono la larghezza della colonna centrale, che
  // cambia quando si ridimensionano le colonne laterali. Vale in creazione e in
  // modifica (stesso picker).
  const [gridW, setGridW] = useState(0)
  // IL METRO VA RIATTACCATO QUANDO LA GRIGLIA RINASCE. Entrando in
  // «organizza» la griglia finisce dentro il contesto di trascinamento: per
  // React è un altro posto nell'albero, quindi butta via il riquadro e ne
  // fa uno nuovo. Il misuratore restava attaccato a quello vecchio, ormai
  // staccato dalla pagina, che misura zero: le card tornavano alla misura
  // di partenza e i testi si rimpicciolivano di colpo, appena si toccava
  // «Organizza». Con un ref-funzione lo si riaggancia al riquadro nuovo.
  const osservatore = useRef(null)
  const agganciaGriglia = useCallback((el) => {
    gridRef.current = el
    osservatore.current?.disconnect()
    osservatore.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) =>
      setGridW(Math.round(entries[0].contentRect.width))
    )
    ro.observe(el)
    osservatore.current = ro
    // La prima misura senza aspettare il giro dell'osservatore: se no per
    // un disegno le card sono della misura sbagliata.
    setGridW(Math.round(el.getBoundingClientRect().width))
  }, [])
  const GRID_GAP = 8
  // Centro stretto (smartphone): barra alta compatta e font più piccoli.
  const compact = gridW > 0 && gridW < 520
  // Base più grande su tablet/desktop (leggibile su iPad); su smartphone il
  // floor è più basso, così le card non escono enormi.
  const tileScale = gridW ? Math.max(compact ? 0.9 : 1.05, Math.min(1.5, gridW / 440)) : 1
  // Card più grandi ma SEMPRE almeno 3 per riga (finché ci stanno: sotto
  // una certa misura si toccano col dito e basta, e allora meglio due
  // grandi che tre inservibili).
  //
  // IL TERZO DI LARGHEZZA LO CALCOLA IL BROWSER, non noi. Prima lo si
  // faceva in JS con la larghezza misurata, che arriva SEMPRE in ritardo:
  // trascinando la maniglia di fianco alla griglia, per qualche fotogramma
  // la misura era ancora quella di prima — più larga — e il browser ci
  // faceva stare due colonne invece di tre, fino a quando la misura non
  // arrivava. Con min()/max() dentro il CSS il conto si rifà a ogni
  // fotogramma insieme al ridimensionamento, e le colonne non ballano.
  const tileBase = Math.max(112, Math.round(172 * tileScale))
  const colonne = `repeat(auto-fill, minmax(max(112px, min(${tileBase}px, calc((100% - ${2 * GRID_GAP}px) / 3))), 1fr))`

  useEffect(() => {
    if (cats.length > 0 && selectedCat === null) setSelectedCat('__all__')
  }, [cats, selectedCat])

  // Inventario: serve alla scheda prodotto (ricetta) e, se la striscia
  // dice le scorte, a disegnare la griglia. Si carica alla prima apertura
  // del menu prodotto — o subito, ma SOLO quando le scorte servono
  // davvero: sono ricette e giacenze, non si leggono per niente.
  const serveMagazzino = striscaGuardaLeScorte(modoStriscia)
  useEffect(() => {
    if ((!menuDrink && !serveMagazzino) || inventory.length > 0) return
    fetchInventoryItems().then((inv) => setInventory(inv || [])).catch(() => setInventory([]))
  }, [menuDrink, serveMagazzino, inventory.length])
  const scorteById = useMemo(
    () => Object.fromEntries((inventory || []).map((i) => [i.id, i])),
    [inventory]
  )
  // localStorage = cache locale immediata (funziona offline al primo avvio).
  useEffect(() => saveOrder(order), [order])
  useEffect(() => saveFavorites(favorites), [favorites])
  useEffect(() => saveColors(tileColors), [tileColors])

  // SINCRONIZZAZIONE COL SERVER: l'arrangiamento vale per tutto il locale.
  // La sottoscrizione adotta il valore dal server (arriva anche dalla cache
  // Firestore offline); le scritture partono dagli edit dell'utente, in
  // background, quindi il server NON viene riscritto qui (niente loop).
  useEffect(
    () =>
      subscribePosPrefs((p) => {
        if (!p) return
        if (Array.isArray(p.order)) setOrder(p.order)
        if (Array.isArray(p.favorites)) setFavorites(p.favorites)
        if (p.colors && typeof p.colors === 'object' && !Array.isArray(p.colors)) setTileColors(p.colors)
      }, () => {}),
    []
  )
  // Applica SUBITO in locale, poi sincronizza col server (offline si accoda).
  const commitOrder = (next) => {
    setOrder(next)
    savePosOrder(next).catch(() => {})
  }
  const commitFavorites = (next) => {
    setFavorites(next)
    savePosFavorites(next).catch(() => {})
  }
  // Colore del tab di un prodotto: null/assente = colore della categoria.
  const setTileColor = (id, color) => {
    const next = { ...tileColors }
    if (color) next[id] = color
    else delete next[id]
    setTileColors(next)
    savePosColors(next).catch(() => {})
  }
  // Il colore del PRODOTTO: la linguetta in alto a sinistra, che si tocca
  // per cambiarlo. Non dipende dall'impostazione della striscia — un
  // colore scelto a mano deve restare visibile.
  const coloreProdotto = (d) => tileColors[d.id] || drinkCategoryColor(d, cats)
  // Il colore della STRISCIA: la regola sta in lib/strisce.js, così la
  // stessa striscia significa la stessa cosa anche nelle schede del menù.
  const tileColor = (d) =>
    coloreStriscia({
      modo: modoStriscia,
      coloreProdotto: tileColors[d.id] || null,
      coloreCategoria: drinkCategoryColor(d, cats),
      scorte: serveMagazzino ? scorteDelDrink(d, scorteById, stockStatus) : null,
      verdeQuandoOk: scorteVerdi,
    })
  const catKey = (c) => c.id ?? c.name
  const favSet = useMemo(() => new Set(favorites), [favorites])
  const byId = useMemo(() => new Map((drinks || []).map((d) => [d.id, d])), [drinks])
  const q = query.trim().toLowerCase()

  // ORDINE GLOBALE: una sola sequenza per tutti i drink. Le categorie non
  // riordinano da sole — filtrano soltanto questa sequenza, così lo stesso
  // ordinamento vale ovunque (una birra spostata in "Tutti" resta prima
  // delle altre anche filtrando per Birre).
  const availableAll = useMemo(() => (drinks || []).filter((d) => d.available), [drinks])
  const orderedAll = useMemo(() => applyOrder(availableAll, order), [availableAll, order])
  const orderedAllIds = useMemo(() => orderedAll.map((d) => d.id), [orderedAll])

  const inCat = (d) => d.category_id === selectedCat || d.category === selectedCat
  const visibleDrinks = useMemo(() => {
    // MODO "ACCENDI": cercando non si toglie NIENTE dalla griglia. Si passa
    // però a mostrare tutto il catalogo, perché il prodotto cercato può
    // stare in un'altra categoria (o fuori dai preferiti) e altrimenti non
    // ci sarebbe niente da accendere. Cancellando la ricerca si torna dov'era.
    if (q && ricercaEvidenzia) return orderedAll
    if (q) return orderedAll.filter((d) => prodottoCorrisponde(d, q))
    if (selectedCat === '__recent__') {
      return recentIds.map((id) => byId.get(id)).filter((d) => d && d.available)
    }
    if (selectedCat === '__fav__') return orderedAll.filter((d) => favSet.has(d.id))
    if (!selectedCat || selectedCat === '__all__') return orderedAll
    return orderedAll.filter(inCat)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ricercaEvidenzia, orderedAll, selectedCat, favSet, recentIds, byId])

  // LA CARD ACCESA. È la prima che risponde NELL'ORDINE IN CUI STA NELLA
  // GRIGLIA — non nell'ordine in cui arrivano i prodotti dal database:
  // accendere una card e far scorrere da un'altra parte sarebbe peggio che
  // non fare niente.
  const acceso = ricercaEvidenzia ? primoProdottoCorrispondente(visibleDrinks, q) : null
  const idAcceso = acceso?.id || null

  // Portarla sotto gli occhi. Si muove SOLO la griglia (scrollTop suo), non
  // `scrollIntoView`: quello scorre anche i contenitori sopra e al banco fa
  // saltare via mezza schermata del conto mentre si sta ancora scrivendo.
  useEffect(() => {
    if (!idAcceso) return
    const grid = gridRef.current
    const el = grid?.querySelector(`[data-drink-id="${idAcceso}"]`)
    if (!grid || !el) return
    const r = el.getBoundingClientRect()
    const g = grid.getBoundingClientRect()
    // In mezzo alla griglia, non incollata a un bordo: si vede anche cosa
    // c'è intorno, che è il motivo per cui non si filtra.
    const delta = r.top - g.top - (g.height - r.height) / 2
    grid.scrollTo?.({ top: grid.scrollTop + delta, behavior: 'smooth' })
  }, [idAcceso])

  // ── Riordino card dalla MANIGLIA (modalità riordino) ──
  // Sul touch "scorri col dito + long-press per spostare" sullo stesso
  // punto non è affidabile: il browser decide scroll o drag all'inizio del
  // tocco (touch-action) e non si torna indietro. Quindi si trascina da una
  // MANIGLIA dedicata (touch-action:none): il resto della card scorre
  // normalmente. Il riordino agisce sull'ordine GLOBALE, valido anche
  // filtrando per categoria.
  // ── RIORDINO DELLA GRIGLIA (modalità organizza) ────────────────────
  // Lo fa dnd-kit, non noi. La versione scritta a mano — cattura del
  // puntatore, ciclo di auto-scroll, animazioni a mano — aveva un difetto
  // dopo l'altro: lo scorrimento che non si fermava, le card che si
  // spostavano solo mentre la griglia scorreva, il rilascio fuori area.
  // Trascinare col dito è un problema risolto da altri, con dieci casi
  // limite che non si vedono finché non capitano al banco.
  //
  // Quello che resta nostro è la REGOLA: l'ordine è uno solo e globale
  // (`moveInOrder` su tutti gli id), anche quando a schermo c'è una sola
  // categoria — se no spostare una birra dentro «Birre» la lascerebbe al suo
  // posto in «Tutti».
  // Riordino disponibile ovunque tranne Recenti (ordine per recenza) e in
  // ricerca; con l'ordine globale, filtrare per categoria lo preserva.
  // Sta qui sopra perché lo leggono già i sensori, subito sotto.
  const canReorder = reordering && selectedCat !== '__recent__' && !q
  // `attiva` è quello che spegne i gesti fuori da «organizza» (vedi
  // `spegnibile` in cima): i sensori restano tre in ogni caso.
  const sensori = useSensors(
    // Col dito: si parte dopo un attimo di pressione, se no scorrere la
    // griglia trascinerebbe le card. Col mouse basta uno spostamento.
    useSensor(PointerSensorSpegnibile, {
      attiva: canReorder,
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensorSpegnibile, {
      attiva: canReorder,
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensorSpegnibile, {
      attiva: canReorder,
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )
  const fineRiordino = ({ active, over }) => {
    if (!over || active.id === over.id) return
    commitOrder(moveInOrder(orderedAllIds, String(active.id), String(over.id)))
  }

  const toggleFav = (id) => commitFavorites(toggleFavorite(favorites, id))

  // Voci della barra: Preferiti e Recenti in cima, poi le categorie.
  const specialCats = [
    ...(favorites.length ? [{ key: '__fav__', label: '⭐ Preferiti', count: favorites.length }] : []),
    ...(recentIds.length ? [{ key: '__recent__', label: '🕘 Recenti', count: recentIds.length }] : []),
  ]

  // Etichetta categoria: una riga sola, si accorcia con l'ellissi (mai a capo).
  const catLabel = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

  return (
    <>
      <aside className="posd-cats">
        <button onClick={() => setSelectedCat('__all__')} style={catBtnStyle(selectedCat === '__all__')} title="Tutti">
          {categoryDisplay === 'icon' ? (
            <span aria-hidden style={{ fontSize: '1.25em' }}>▦</span>
          ) : (
            <>
              <span aria-hidden style={catDotStyle(null)} />
              <span style={catLabel}>Tutti</span>
            </>
          )}
        </button>
        {specialCats.map((sc) => (
          <button
            key={sc.key}
            onClick={() => setSelectedCat(sc.key)}
            style={catBtnStyle(selectedCat === sc.key)}
            title={sc.label}
          >
            {categoryDisplay === 'icon' ? (
              <span aria-hidden style={{ fontSize: '1.2em' }}>{sc.label.slice(0, 2)}</span>
            ) : (
              <span style={catLabel}>{sc.label}</span>
            )}
          </button>
        ))}
        {cats.map((c) => (
          <button
            key={catKey(c)}
            title={c.name}
            onClick={() => {
              setSelectedCat(catKey(c))
              gridRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            style={catBtnStyle(selectedCat === catKey(c))}
          >
            {categoryDisplay === 'icon' ? (
              c.icon ? (
                <span aria-hidden style={{ fontSize: '1.25em', lineHeight: 1 }}>{c.icon}</span>
              ) : (
                <span aria-hidden style={{ ...catDotStyle(catColor(c)), width: 16, height: 16 }} />
              )
            ) : (
              <>
                {/* icona (se scelta 'icona+testo' e la categoria ne ha una),
                    altrimenti il pallino colore; poi SEMPRE il nome. */}
                <span aria-hidden style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                  {categoryDisplay === 'icon_text' && c.icon ? (
                    <span style={{ fontSize: '1.05em', lineHeight: 1 }}>{c.icon}</span>
                  ) : (
                    <span style={catDotStyle(catColor(c))} />
                  )}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.name}
                </span>
              </>
            )}
          </button>
        ))}
      </aside>

      {catsHandleProps && <div className="posd-resize-handle" {...catsHandleProps} />}

      {/* Colonna centrale: ricerca (+ riordino in "Tutti") + griglia. minHeight:0
          è essenziale: senza, su mobile (posd-body in colonna) questo contenitore
          cresce col contenuto e la griglia non scrolla (bug flexbox classico). */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Barra alta compatta: su schermo stretto la ricerca prende tutto lo
            spazio e "Organizza" diventa solo icona. */}
        <div style={{ padding: compact ? '6px 6px 0' : '8px 8px 0', display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <input
            ref={cercaRef}
            type="search"
            value={query}
            onChange={(e) => {
              onInteract?.()
              setQuery(e.target.value)
            }}
            onFocus={() => onInteract?.()}
            placeholder="🔍 Cerca prodotto…"
            aria-label="Cerca prodotto"
            style={{ flex: 1, minWidth: 0, ...(compact ? { fontSize: '0.9rem', padding: '8px 10px' } : {}) }}
          />
          {/* CANCELLARE LA RICERCA CON UN TOCCO (Flavio, 03/09/2026: «nella
              selezione degli items di menù aggiungere qui il tastino di
              cancellazione scrittura»). La ✕ nativa dei campi `search` non
              c'è su tutte le piattaforme e dov'è è un bersaglio da mouse:
              qui si batte col dito, di sera, con una mano occupata. Il fuoco
              torna nel campo perché il gesto dopo è quasi sempre riscrivere.
              Compare solo con del testo dentro: un tasto che non fa niente
              e' un tasto in piu' da capire. */}
          {query !== '' && (
            <button
              className="chip"
              onClick={() => {
                onInteract?.()
                setQuery('')
                cercaRef.current?.focus()
              }}
              aria-label="Cancella la ricerca"
              title="Cancella la ricerca"
              style={{ flexShrink: 0 }}
            >
              ✕
            </button>
          )}
          {selectedCat !== '__recent__' && !q && (
            <button
              className={`chip ${reordering ? 'active' : ''}`}
              onClick={() => setReordering((v) => !v)}
              title="Trascina dalla maniglia per spostare · tocca una card per il menu prodotto (colore)"
              aria-label={reordering ? 'Fine organizzazione' : 'Organizza griglia'}
              style={{ flexShrink: 0 }}
            >
              {reordering ? (compact ? '✓' : '✓ Fine') : compact ? '↕' : '↕ Organizza'}
            </button>
          )}
        </div>
        {/* Accendendo invece di filtrare, la griglia non cambia: se non c'è
            niente da accendere non succede nulla e si resta a chiedersi se
            abbia capito. Quindi lo si dice. */}
        {ricercaEvidenzia && q && !idAcceso && (
          <p
            className="muted small"
            style={{ margin: 0, padding: compact ? '4px 8px 0' : '6px 10px 0', flexShrink: 0 }}
          >
            🔍 Nessun prodotto per «{query.trim()}».
          </p>
        )}
        {/* In «organizza» la griglia sta dentro il contesto di
            trascinamento; fuori da quella modalità non c'è niente da
            trascinare e non serve. */}
        <Riordinabile
          sensori={sensori}
          ids={visibleDrinks.map((d) => d.id)}
          onFine={fineRiordino}
        >
        <div
          ref={agganciaGriglia}
          onScroll={() => onInteract?.()}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            // Arrivati in cima, il trascinamento si ferma qui: non passa al
            // documento, dove Android farebbe partire il ricaricamento
            // della pagina in mezzo a un ordine.
            // Niente scorrimento LATERALE: la griglia va a capo, non di
            // lato. Restava aperto perché `overflow-y: auto` porta con sé
            // l'orizzontale, e bastava una card trascinata oltre il bordo
            // per allargare tutto.
            overflowX: 'hidden',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            padding: '10px 8px',
            // LA BARRA DI SCORRIMENTO NON DEVE SPOSTARE LE COLONNE. Compare
            // e sparisce a seconda di quanti prodotti ha la categoria, e
            // con lei cambiava la larghezza utile: al confine fra tre e
            // quattro card per riga la griglia si riassestava da sola
            // mentre la si guardava. Lo spazio è sempre riservato.
            scrollbarGutter: 'stable',
            display: 'grid',
            gridTemplateColumns: colonne,
            alignContent: 'start',
            gap: GRID_GAP,
            // il font-size della griglia guida i testi em delle card
            fontSize: `${tileScale}rem`,
            opacity: disabled ? 0.5 : 1,
            pointerEvents: disabled ? 'none' : 'auto',
          }}
        >
          {loading && (
            <div style={{ gridColumn: '1/-1' }}>
              <Caricamento testo="Preparo il listino…" />
            </div>
          )}
          {!loading && visibleDrinks.length === 0 && (
            <div className="empty" style={{ gridColumn: '1/-1' }}>
              {selectedCat === '__fav__'
                ? 'Nessun preferito: tocca la ☆ su un prodotto per fissarlo qui.'
                : selectedCat === '__recent__'
                  ? 'Ancora nessun item ordinato di recente.'
                  : 'Nessun prodotto in questa categoria.'}
            </div>
          )}
          {visibleDrinks.map((d) =>
            canReorder ? (
              // Modalità ORGANIZZA: si trascina dalla MANIGLIA; toccando la
              // card si apre il menu del prodotto (colore).
              <CellaOrdinabile
                key={d.id}
                drink={d}
                qty={qtyByDrink[d.id] ?? 0}
                color={coloreProdotto(d)}
                striscia={tileColor(d)}
                onApri={() => setMenuDrink(d)}
              />
            ) : (
              <DrinkTile
                key={d.id}
                drink={d}
                qty={qtyByDrink[d.id] ?? 0}
                onInfo={onInfo ? () => onInfo(d) : undefined}
                color={coloreProdotto(d)}
                striscia={tileColor(d)}
                acceso={d.id === idAcceso}
                favorite={favSet.has(d.id)}
                onToggleFav={() => toggleFav(d.id)}
                onAdd={() => {
                  // Scelto un prodotto, la ricerca ha finito il suo lavoro:
                  // lasciarla scritta vorrebbe dire ritrovarsi il catalogo
                  // intero e una card accesa al prodotto dopo.
                  if (ricercaEvidenzia && query) setQuery('')
                  onAdd(d)
                }}
                onSetQty={(nq) => onSetQty(d, nq)}
              />
            )
          )}
        </div>
        </Riordinabile>
      </div>

      {/* ── MENU del singolo prodotto (in Organizza): cambio colore del tab ── */}
      {menuDrink && (
        <div className="overlay confirm-overlay" onClick={() => setMenuDrink(null)}>
          <div
            className="confirm-box"
            role="dialog"
            aria-label={`Menu ${menuDrink.name}`}
            style={{ width: 'min(360px, 94vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between" style={{ alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{menuDrink.name}</h3>
              <button className="btn ghost small" onClick={() => setMenuDrink(null)}>✕</button>
            </div>
            <p className="muted small" style={{ margin: '8px 0' }}>Colore del tab</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
              {CATEGORY_PALETTE.map((c) => {
                const active = (tileColors[menuDrink.id] || '').toLowerCase() === c.toLowerCase()
                return (
                  <button
                    key={c}
                    aria-label={`Colore ${c}`}
                    onClick={() => setTileColor(menuDrink.id, c)}
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 8,
                      background: c,
                      border: active ? '3px solid var(--text)' : '1px solid var(--line)',
                      cursor: 'pointer',
                    }}
                  />
                )
              })}
            </div>
            <button
              className="btn ghost small block"
              style={{ marginTop: 12 }}
              onClick={() => setTileColor(menuDrink.id, null)}
            >
              ↩︎ Colore della categoria (default)
            </button>

            {/* Scheda prodotto completa (prezzo, ingredienti, disponibilità):
                la stessa del Menù, così si corregge un prezzo sbagliato senza
                passare dal backoffice. */}
            <button
              className="btn block"
              style={{ marginTop: 10 }}
              onClick={() => {
                setEditDrink(menuDrink)
                setMenuDrink(null)
              }}
            >
              ✏️ Modifica prodotto (prezzo, ingredienti…)
            </button>
            <button
              className="btn ghost small block"
              style={{ marginTop: 8 }}
              disabled={savingDrink}
              onClick={async () => {
                setSavingDrink(true)
                try {
                  await updateDrink(menuDrink.id, { available: false })
                  setMenuDrink(null)
                } catch (e) {
                  toastError(`Non disattivato: ${e.message}`)
                } finally {
                  setSavingDrink(false)
                }
              }}
            >
              🚫 Togli dalla griglia (non disponibile)
            </button>
          </div>
        </div>
      )}

      {/* Scheda prodotto in modifica (aperta dal menu prodotto) */}
      {editDrink && (
        <div className="overlay confirm-overlay" onClick={() => setEditDrink(null)}>
          <div
            style={{ width: 'min(520px, 96vw)', maxHeight: '92vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <DrinkForm
              initial={editDrink}
              categories={cats}
              inventory={inventory}
              onCreateCategory={async (name) => {
                const cat = await createCategory({ name, sort_order: cats.length })
                return cat
              }}
              onCancel={() => setEditDrink(null)}
              onSave={async (form) => {
                await saveDrinkFromForm({ form, existing: editDrink, inventory, categories: cats })
                setEditDrink(null)
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}

// Pallino colore categoria: dimensione fissa e anello di contrasto.
function catDotStyle(color) {
  return {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
    background: color || 'transparent',
    boxShadow: color ? '0 0 0 1.5px var(--line)' : 'none',
  }
}
