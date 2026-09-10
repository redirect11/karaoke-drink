import { useEffect, useMemo, useState } from 'react'
import SectionPanels from './SectionPanels.jsx'
import {
  fetchDrinks,
  updateDrink,
  deleteDrink,
  subscribeCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  fetchInventoryItems,
  subscribePosPrefs,
  savePosColors,
  subscribeSettings,
  DEFAULT_SETTINGS,
  settingsIniziali,
} from '../lib/api.js'
import { coloreStriscia } from '../lib/strisce.js'
import { Sottosezioni } from '../lib/sottosezioni.js'
import { formatPrice } from '../lib/orderStatus.js'
import { deleteDrinkImageByUrl } from '../lib/storage.js'
import { formatQty, stockStatus } from '../lib/inventory.js'
import MarginList from './MarginList.jsx'
import DrinkForm from './DrinkForm.jsx'
import { saveDrinkFromForm } from '../lib/saveDrink.js'
import CategoryRail from './CategoryRail.jsx'
import {
  CATEGORY_ICONS,
  catColor,
  CATEGORY_PALETTE,
  drinkCategoryColor,
} from '../lib/categoryColors.js'

const EMPTY = {
  name: '',
  description: '',
  category_id: '',
  price: '',
  // Vuoto = si usa l'IVA di vendita del locale. Un prodotto nuovo non deve
  // chiedere niente a chi non ha eccezioni da scrivere.
  sale_vat: '',
  recipe: '',
  available: true,
  image_url: null,
  recipe_items: [],
}

export default function MenuManager() {
  // Cosa dice la striscia delle schede: lo sceglie il locale, in
  // Impostazioni → Vista ordine (vedi lib/strisce.js).
  const [settings, setSettings] = useState(settingsIniziali)
  useEffect(() => subscribeSettings(setSettings, () => {}), [])
  const [sezione, setSezione] = useState('catalogo') // catalogo | categorie | margini
  const modoStriscia = settings.stripe_menu || 'scorte'
  const scorteVerdi = !!settings.stripe_menu_ok_verde
  const [drinks, setDrinks] = useState([])
  const [categories, setCategories] = useState([])
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | drink object
  const [copiaDa, setCopiaDa] = useState(null) // il drink duplicato, prima di salvarlo
  // Filtri della lista (catalogo grande: ricerca + categoria + disponibilità).
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all') // 'all' | 'none' | categoryId
  const [availFilter, setAvailFilter] = useState('all') // 'all' | 'yes' | 'no'
  const [collapsed, setCollapsed] = useState(() => new Set()) // categorie chiuse
  const [openId, setOpenId] = useState(null)
  // COLORE DEL PRODOTTO NEL POS. Vive nelle preferenze del POS (pos_prefs),
  // non sul drink: qui si scrive nello stesso posto, così il colore scelto
  // dal menù e quello scelto dal POS sono la stessa cosa e non due verità.
  const [tileColors, setTileColors] = useState({})
  // Card con la tavolozza aperta (una alla volta).
  const [coloreId, setColoreId] = useState(null)
  useEffect(
    () =>
      subscribePosPrefs((p) => {
        if (p?.colors && typeof p.colors === 'object' && !Array.isArray(p.colors)) {
          setTileColors(p.colors)
        }
      }, () => {}),
    []
  )
  const setTileColor = (id, color) => {
    const next = { ...tileColors }
    if (color) next[id] = color
    else delete next[id]
    setTileColors(next)
    savePosColors(next).catch(() => {})
  } // card con azioni aperte

  const catName = (id) => categories.find((c) => c.id === id)?.name

  async function load() {
    setLoading(true)
    try {
      const [d, inv] = await Promise.all([
        fetchDrinks(),
        fetchInventoryItems().catch(() => []), // l'inventario richiede auth: in caso fallisca, lista vuota
      ])
      setDrinks(d)
      setInventory(inv)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // LE CATEGORIE RESTANO IN ASCOLTO finché la pagina è aperta. Erano lette
  // una volta sola all’apertura, e il numero di «Categorie (N)» nel menu a
  // lato restava quello: chi ne aggiungeva una dall’altro terminale (o la
  // creava al volo dalla scheda di un drink) vedeva il conteggio vecchio
  // finché non entrava nella sezione. Così il numero è sempre quello vero,
  // e rinomine e cancellazioni si vedono senza ricaricare.
  useEffect(() => subscribeCategories(setCategories, () => {}), [])

  // Crea una categoria al volo dal form drink e la restituisce.
  async function handleCreateCategory(name) {
    const cat = await createCategory({ name, sort_order: categories.length })
    setCategories((prev) => [...prev, cat].sort((a, b) => a.sort_order - b.sort_order))
    return cat
  }

  async function handleSave(form) {
    setError(null)
    try {
      await saveDrinkFromForm({
        form,
        existing: editing && editing !== 'new' ? editing : null,
        inventory,
        categories,
      })
      chiudiForm()
      await load()
    } catch (e) {
      setError(e.message)
      throw e
    }
  }

  async function toggleAvailable(d) {
    try {
      await updateDrink(d.id, { available: !d.available })
      setDrinks((prev) =>
        prev.map((x) => (x.id === d.id ? { ...x, available: !x.available } : x))
      )
    } catch (e) {
      setError(e.message)
    }
  }

  // ── DUPLICARE UN DRINK ───────────────────────────────────────────
  //
  // Mezzo listino sono variazioni: lo stesso drink col gin diverso, la
  // versione analcolica, il formato grande. Rifare a mano prezzo,
  // categoria, descrizione e soprattutto la RICETTA — che è la parte
  // lunga, ingrediente per ingrediente — è dove si sbaglia una dose e poi
  // il magazzino scala storto.
  //
  // La copia NON si salva da sola: si apre il form già pieno, così il nome
  // e quello che cambia si sistemano PRIMA che il drink esista. Un
  // doppione salvato di nascosto finirebbe in carta al cliente.
  function duplica(d) {
    setCopiaDa({
      ...d,
      id: undefined,
      name: `${d.name} (copia)`,
      // La foto resta all'originale: il file è agganciato al drink che
      // l'ha caricata e cancellandolo sparirebbe anche dalla copia
      // (handleDelete cancella l'immagine insieme al drink).
      image_url: null,
      recipe_items: (d.recipe_items || []).map((r) => ({ ...r })),
    })
    setEditing('new')
  }

  function chiudiForm() {
    setEditing(null)
    setCopiaDa(null)
  }

  async function handleDelete(d) {
    if (!confirm(`Eliminare “${d.name}” dal menù?`)) return
    try {
      await deleteDrink(d.id)
      if (d.image_url) deleteDrinkImageByUrl(d.image_url)
      setDrinks((prev) => prev.filter((x) => x.id !== d.id))
    } catch (e) {
      setError(e.message)
    }
  }

  // Drink che passano ricerca + disponibilità (la categoria filtra a parte,
  // così i chip possono mostrare i conteggi reali per ogni categoria).
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    return drinks.filter((d) => {
      if (availFilter === 'yes' && !d.available) return false
      if (availFilter === 'no' && d.available) return false
      if (!q) return true
      return (
        d.name?.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q) ||
        (catName(d.category_id) || d.category || '').toLowerCase().includes(q) ||
        d.recipe_items?.some((r) => r.name?.toLowerCase().includes(q))
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drinks, categories, search, availFilter])

  // Conteggi per i chip (su `searched`, prima del filtro categoria).
  const counts = useMemo(() => {
    const m = { all: searched.length, none: 0 }
    for (const d of searched) {
      const key = d.category_id || 'none'
      m[key] = (m[key] || 0) + 1
    }
    return m
  }, [searched])

  // Voci per la barra categorie a sinistra (come nel POS).
  const catItems = useMemo(
    () => [
      { key: 'all', label: 'Tutte', count: counts.all },
      // Colore e icona della categoria, come nel POS: la stessa categoria si
      // riconosce allo stesso modo in tutte le schermate.
      ...categories
        .filter((c) => counts[c.id])
        .map((c) => ({
          key: c.id,
          label: c.name,
          count: counts[c.id],
          color: catColor(c),
          icon: c.icon || null,
        })),
      ...(counts.none ? [{ key: 'none', label: 'Senza categoria', count: counts.none }] : []),
    ],
    [categories, counts]
  )

  // STATO DI UN PRODOTTO DEL MENÙ, con i colori dell'inventario.
  //   verde   si può fare
  //   arancio si può fare ma un ingrediente sta finendo
  //   rosso   spento a mano, oppure un ingrediente è esaurito
  // Prima lo si capiva solo dal grigio della card e da una scritta "off"
  // piccolissima: su una griglia piena non si vedeva.
  const scorteById = useMemo(
    () => Object.fromEntries((inventory || []).map((i) => [i.id, i])),
    [inventory]
  )
  // QUATTRO STATI, QUATTRO COLORI SULLA STRISCIA. Il rosso diceva due cose
  // opposte: «l'ho tolto io dal menu» e «è finito l'ingrediente» — la prima
  // si riaccende, la seconda si compra. Ora chi è fuori menu è GRIGIO:
  // spento, non rotto.
  const statoMenu = (d) => {
    if (!d.available) return { dot: 'nascosto', testo: 'Non in menu' }
    const ingredienti = (d.recipe_items || [])
      .map((r) => scorteById[r.inventory_item_id])
      .filter(Boolean)
    if (ingredienti.some((i) => stockStatus(i) === 'empty')) {
      return { dot: 'empty', testo: 'Ingrediente esaurito' }
    }
    if (ingredienti.some((i) => stockStatus(i) === 'low')) {
      return { dot: 'low', testo: 'Ingrediente in esaurimento' }
    }
    return { dot: 'ok', testo: 'Disponibile' }
  }

  // Applica il filtro categoria e raggruppa per categoria (ordine categorie).
  const groups = useMemo(() => {
    const inCat = searched.filter((d) => {
      if (catFilter === 'all') return true
      if (catFilter === 'none') return !d.category_id
      return d.category_id === catFilter
    })
    const byCat = new Map()
    for (const d of inCat) {
      const cat = categories.find((c) => c.id === d.category_id)
      const name = cat?.name || d.category || 'Senza categoria'
      const sort = cat ? cat.sort_order : 9998
      const id = d.category_id || 'none'
      if (!byCat.has(id)) byCat.set(id, { id, name, sort, list: [] })
      byCat.get(id).list.push(d)
    }
    return [...byCat.values()].sort(
      (a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name)
    )
  }, [searched, categories, catFilter])

  function toggleCollapse(id) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (editing) {
    return (
      <DrinkForm
        initial={editing === 'new' ? copiaDa || EMPTY : editing}
        categories={categories}
        inventory={inventory}
        saleVatLocale={settings.sale_vat}
        onCreateCategory={handleCreateCategory}
        onCancel={chiudiForm}
        onSave={handleSave}
      />
    )
  }

  const searching = search.trim().length > 0
  const availCount = drinks.filter((d) => d.available).length

  // LE SOTTOSEZIONI, nel menu laterale come nelle altre pagine. Categorie
  // e marginalità erano due pannelli a scomparsa in cima al catalogo: si
  // aprivano spingendo giù la griglia, e chi voleva solo guardare i
  // margini si portava dietro tutto il listino sotto.
  const sezioni = [
    { id: 'catalogo', icona: '🍸', label: 'Modifica menù' },
    { id: 'categorie', icona: '🏷️', label: `Categorie (${categories.length})` },
    { id: 'margini', icona: '📈', label: 'Marginalità listino' },
  ]

  if (sezione === 'categorie') {
    return (
      <div>
        <Sottosezioni voci={sezioni} attiva={sezione} scegli={setSezione} />
        <CategoryManager categories={categories} />
      </div>
    )
  }

  if (sezione === 'margini') {
    return (
      <div>
        <Sottosezioni voci={sezioni} attiva={sezione} scegli={setSezione} />
        <p className="muted small" style={{ margin: '0 0 8px' }}>
          Quali drink rendono meno di quanto dovrebbero.
        </p>
        <MarginList
          drinks={drinks}
          inventory={inventory}
          onEdit={(id) => {
            setSezione('catalogo')
            setEditing(drinks.find((d) => d.id === id) || null)
          }}
        />
      </div>
    )
  }

  return (
    <div>
      <Sottosezioni voci={sezioni} attiva={sezione} scegli={setSezione} />

      <button
        className="btn block"
        onClick={() => {
          // Da capo: un drink nuovo non eredita la copia rimasta in giro.
          setCopiaDa(null)
          setEditing('new')
        }}
      >
        + Aggiungi prodotto
      </button>

      {error && <div className="banner">Errore: {error}</div>}
      {loading && <div className="empty">Carico il menù…</div>}

      {!loading && drinks.length > 0 && (
        <>
          <input
            type="search"
            className="menu-search"
            placeholder="🔍 Cerca drink, ingrediente, categoria…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginTop: 10 }}
          />

          {/* Filtro disponibilità */}
          <div className="mode-choice" style={{ marginBottom: 8 }}>
            {[
              ['all', `Tutti (${drinks.length})`],
              ['yes', `Disponibili (${availCount})`],
              ['no', `Non disp. (${drinks.length - availCount})`],
            ].map(([v, label]) => (
              <button
                key={v}
                type="button"
                className={`mode-option${availFilter === v ? ' active' : ''}`}
                onClick={() => setAvailFilter(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Categorie a SINISTRA (come il POS), i drink a destra. */}
      {!loading && drinks.length > 0 && (
      <CategoryRail items={catItems} selected={catFilter} onSelect={setCatFilter}>

      {groups.length === 0 && (
        <div className="empty">Nessun drink per «{search}».</div>
      )}

      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.id) && !searching
        return (
          <section key={g.id} style={{ marginTop: 12 }}>
            <h3
              className="cat-header menu-admin-cat"
              onClick={() => toggleCollapse(g.id)}
            >
              <span>{isCollapsed ? '▸' : '▾'} {g.name}</span>
              <span className="muted small">{g.list.length}</span>
            </h3>
            {/* Card compatte in griglia (stessa UX delle card ordini):
                nome+prezzo a vista, azioni a scomparsa con «⋯». */}
            {!isCollapsed && (
              <div className="admin-grid">
                {g.list.map((d) => {
                  const open = openId === d.id
                  return (
                    <div
                      /* DUE SEGNI, DUE COSE DIVERSE, dove uno se le aspetta.
                         La STRISCIA A SINISTRA dice come sta il prodotto —
                         come sulle card della coda, dove la striscia dice
                         com'è messo il conto. La LINGUETTA nell'angolo è il
                         colore che il prodotto ha al banco, disegnata come
                         sulle tile del POS: là quel segno vuol dire già
                         quello, e qui si tocca per cambiarlo.
                         Prima erano un quadratino (che sembrava un'etichetta
                         e invece era un tasto) e un pallino il cui rosso
                         diceva due cose opposte: «l'ho spento io» e «è finito
                         il rum». */
                      /* La striscia dice quello che il locale ha scelto
                         (Impostazioni → Vista ordine): il colore del
                         prodotto, quello della categoria, le scorte, o
                         niente. La regola sta in lib/strisce.js, la stessa
                         che usa la griglia del conto. */
                      className={`card grid-card admin-card menu-card${d.available ? '' : ' off'}`}
                      key={d.id}
                      style={{
                        '--menu-colore': tileColors[d.id] || drinkCategoryColor(d, categories),
                        borderLeftColor: coloreStriscia({
                          modo: modoStriscia,
                          coloreProdotto: tileColors[d.id] || null,
                          coloreCategoria: drinkCategoryColor(d, categories),
                          scorte: statoMenu(d).dot,
                          verdeQuandoOk: scorteVerdi,
                        }),
                      }}
                    >
                      <button
                        type="button"
                        className="menu-colore-spia"
                        title="Colore al banco: tocca per cambiarlo"
                        aria-label={`Colore di ${d.name}`}
                        aria-expanded={coloreId === d.id}
                        onClick={() => setColoreId(coloreId === d.id ? null : d.id)}
                      />
                      {coloreId === d.id && (
                        <div className="menu-colori-riga">
                          <button
                            type="button"
                            className={`menu-colore auto${tileColors[d.id] ? '' : ' active'}`}
                            title="Colore della categoria"
                            onClick={() => setTileColor(d.id, null)}
                            style={{ background: drinkCategoryColor(d, categories) }}
                          >
                            A
                          </button>
                          {CATEGORY_PALETTE.map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-label={`Colore ${c}`}
                              className={`menu-colore${
                                (tileColors[d.id] || '').toLowerCase() === c.toLowerCase() ? ' active' : ''
                              }`}
                              onClick={() => setTileColor(d.id, c)}
                              style={{ background: c }}
                            />
                          ))}
                        </div>
                      )}
                      <div
                        className="grid-card-main"
                        role="button"
                        tabIndex={0}
                        onClick={() => setOpenId(open ? null : d.id)}
                      >
                        <div className="row between" style={{ alignItems: 'flex-start', gap: 6 }}>
                          <strong style={{ fontSize: '0.92rem', lineHeight: 1.25 }}>{d.name}</strong>
                        </div>
                        <div className="row between" style={{ alignItems: 'baseline' }}>
                          <span className="muted small">{statoMenu(d).testo}</span>
                          <span className="grid-card-tot">{formatPrice(d.price)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="grid-card-toggle"
                        onClick={() => setOpenId(open ? null : d.id)}
                        aria-expanded={open}
                      >
                        {open ? '▴ Chiudi' : '⋯ Azioni'}
                      </button>
                      {open && (
                        <div className="grid-card-actions">
                          {d.recipe_items && d.recipe_items.length > 0 && (
                            <p className="muted small" style={{ margin: '0 0 6px' }}>
                              {d.recipe_items.map((r) => `${r.name} ${formatQty(r.qty, r.unit)}`).join(' · ')}
                            </p>
                          )}
                          <button className="btn secondary small block" onClick={() => setEditing(d)}>
                            ✏️ Modifica
                          </button>
                          <button
                            className="btn ghost small block"
                            style={{ marginTop: 6 }}
                            onClick={() => duplica(d)}
                          >
                            📋 Duplica
                          </button>
                          <button
                            className="btn ghost small block"
                            style={{ marginTop: 6 }}
                            onClick={() => toggleAvailable(d)}
                          >
                            {d.available ? 'Rendi non disp.' : 'Rendi disponibile'}
                          </button>
                          <button
                            className="btn ghost small block"
                            style={{ marginTop: 6 }}
                            onClick={() => handleDelete(d)}
                          >
                            🗑 Elimina
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}

      </CategoryRail>
      )}

      {!loading && drinks.length === 0 && (
        <div className="empty">Nessun drink nel menù. Aggiungine uno!</div>
      )}
    </div>
  )
}

// --- Gestione categorie -------------------------------------------------

// L’elenco arriva dalla sottoscrizione della pagina: dopo una scrittura non
// si richiama nessuno, la lista si riscrive da sola (Firestore avvisa subito,
// anche prima che la scrittura arrivi al server).
function CategoryManager({ categories }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await createCategory({ name: name.trim(), sort_order: categories.length })
      setName('')
    } finally {
      setBusy(false)
    }
  }

  async function rename(cat) {
    const n = prompt('Nuovo nome categoria:', cat.name)
    if (n == null || !n.trim()) return
    await updateCategory(cat.id, { name: n.trim() })
  }

  async function remove(cat) {
    if (!confirm(`Eliminare la categoria “${cat.name}”? I drink resteranno, ma senza categoria.`)) return
    await deleteCategory(cat.id)
  }

  // Scambia l'ordine con il vicino (su/giù).
  async function move(idx, dir) {
    const j = idx + dir
    if (j < 0 || j >= categories.length) return
    const a = categories[idx]
    const b = categories[j]
    await Promise.all([
      updateCategory(a.id, { sort_order: b.sort_order }),
      updateCategory(b.id, { sort_order: a.sort_order }),
    ])
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nuova categoria"
        />
        <button className="btn small" onClick={add} disabled={busy}>
          Aggiungi
        </button>
      </div>
      {categories.length === 0 && (
        <div className="muted" style={{ marginTop: 8, fontSize: '0.85rem' }}>
          Nessuna categoria.
        </div>
      )}
      {categories.map((c, idx) => (
        <div key={c.id} style={{ marginTop: 8, borderTop: idx ? '1px solid var(--line)' : 'none', paddingTop: idx ? 8 : 0 }}>
          <div className="row between">
            <span className="row" style={{ gap: 6, alignItems: 'center' }}>
              <span aria-hidden style={{ fontSize: '1.1rem', width: 20, textAlign: 'center' }}>
                {c.icon || '•'}
              </span>
              {c.name}
            </span>
            <span className="row" style={{ gap: 4 }}>
              <button className="btn ghost small" onClick={() => move(idx, -1)} disabled={idx === 0}>↑</button>
              <button className="btn ghost small" onClick={() => move(idx, 1)} disabled={idx === categories.length - 1}>↓</button>
              <button className="btn ghost small" onClick={() => rename(c)}>✏️</button>
              <button className="btn ghost small" onClick={() => remove(c)}>🗑</button>
            </span>
          </div>
          {/* Icona (set di emoji) + colore per la categoria */}
          <div className="chips-row" style={{ marginTop: 6 }}>
            <button
              className={`chip ${!c.icon ? 'active' : ''}`}
              title="Nessuna icona"
              onClick={() => updateCategory(c.id, { icon: null })}
            >
              ∅
            </button>
            {CATEGORY_ICONS.map((ic) => (
              <button
                key={ic}
                className={`chip ${c.icon === ic ? 'active' : ''}`}
                onClick={() => updateCategory(c.id, { icon: ic })}
              >
                {ic}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center' }}>
            <span className="muted small">Colore</span>
            <input
              type="color"
              value={c.color || catColor(c)}
              onChange={(e) => updateCategory(c.id, { color: e.target.value })}
              style={{ width: 40, height: 28, padding: 0, border: 'none', background: 'none' }}
            />
            {c.color && (
              <button className="btn ghost small" onClick={() => updateCategory(c.id, { color: null })}>
                Auto
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
