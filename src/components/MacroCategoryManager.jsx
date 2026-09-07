import { useState } from 'react'
import { groupCategoriesByMacro } from '../lib/macros.js'
import {
  createMacroCategory,
  updateMacroCategory,
  deleteMacroCategory,
} from '../lib/api.js'

// ── MACRO-CATEGORIE ──────────────────────────────────────────────────
//
// Raggruppano le categorie in pochi gruppi su cui fare i conti. Ce ne sono
// DUE elenchi, perché sono due mestieri diversi:
//
//   magazzino — quello che si COMPRA (Distillati, Birre, Food…)
//   menù      — quello che si VENDE (Cocktail classici, Analcolici…)
//
// Tenerli separati serve a incrociarli: quanto è uscito su una macro di
// spesa contro quanto è entrato su una macro di vendita. Per questo su ogni
// macro di magazzino si sceglie a quale macro di menù corrisponde: l'aggancio
// si fa a mano perché non c'è una regola che lo indovini — il gin del
// Negroni è «Distillati» in acquisto e «Cocktail classici» in vendita, ma il
// gin tonic pesca dagli stessi distillati e sta in un'altra macro di vendita.
//
// Una categoria sta in AL PIÙ una macro, così le somme non contano due volte
// la stessa cosa.
export default function MacroCategoryManager({
  ambito = 'magazzino',
  macros,
  categories,
  onChange,
  aggiornaCategoria,
  creaCategoria,
  macroDiVendita = null,
  prodottiDaCompletare = [],
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const { groups, unassigned } = groupCategoriesByMacro(macros, categories)

  async function addMacro() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await createMacroCategory({ name: name.trim(), sort_order: macros.length, ambito })
      setName('')
      await onChange()
    } finally {
      setBusy(false)
    }
  }
  async function renameMacro(m) {
    const n = prompt('Nuovo nome macro-categoria:', m.name)
    if (n == null || !n.trim()) return
    await updateMacroCategory(m.id, { name: n.trim() })
    await onChange()
  }
  async function removeMacro(m) {
    if (!confirm(`Eliminare la macro “${m.name}”? Le sue categorie restano, senza macro.`)) return
    await deleteMacroCategory(m.id, ambito)
    await onChange()
  }
  async function moveMacro(idx, dir) {
    const j = idx + dir
    if (j < 0 || j >= groups.length) return
    const a = groups[idx]
    const b = groups[j]
    await Promise.all([
      updateMacroCategory(a.id, { sort_order: b.sort_order }),
      updateMacroCategory(b.id, { sort_order: a.sort_order }),
    ])
    await onChange()
  }
  // Aggancia/sgancia una categoria a una macro (scrive macro_id sulla categoria).
  const setCatMacro = async (catId, macroId) => {
    await aggiornaCategoria(catId, { macro_id: macroId })
    await onChange()
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        {ambito === 'menu'
          ? 'Le macro-categorie del menù raggruppano le categorie dei drink per sapere quanto si è incassato su ognuna. Una categoria può stare in una sola macro.'
          : 'Le macro-categorie del magazzino raggruppano le categorie dei prodotti che si comprano, per i conti di acquisti e fatturato. Una categoria può stare in una sola macro.'}
      </p>
      <div className="row" style={{ gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={ambito === 'menu' ? 'Nuova macro (es. Cocktail)' : 'Nuova macro (es. Distillati)'}
        />
        <button className="btn small" onClick={addMacro} disabled={busy}>Aggiungi</button>
      </div>

      {groups.length === 0 && (
        <div className="muted small" style={{ marginTop: 8 }}>Nessuna macro-categoria.</div>
      )}

      {groups.map((g, idx) => (
        <div key={g.id} className="macro-group">
          <div className="row between" style={{ alignItems: 'center' }}>
            <strong>🗂️ {g.name}</strong>
            <span className="row" style={{ gap: 4 }}>
              <button className="btn ghost small" onClick={() => moveMacro(idx, -1)} disabled={idx === 0}>↑</button>
              <button className="btn ghost small" onClick={() => moveMacro(idx, 1)} disabled={idx === groups.length - 1}>↓</button>
              <button className="btn ghost small" onClick={() => renameMacro(g)}>✏️</button>
              <button className="btn ghost small" onClick={() => removeMacro(g)}>🗑</button>
            </span>
          </div>
          {/* A QUALE MACRO DI VENDITA CORRISPONDE questa spesa. Senza,
              speso e incassato restano due elenchi che non si parlano. */}
          {macroDiVendita && (
            <label className="row small" style={{ gap: 6, margin: '4px 0', alignItems: 'center' }}>
              <span className="muted">Corrisponde, in vendita, a</span>
              <select
                value={g.macro_menu_id || ''}
                aria-label={`Macro di vendita per ${g.name}`}
                onChange={async (e) => {
                  await updateMacroCategory(g.id, { macro_menu_id: e.target.value || null })
                  await onChange()
                }}
                style={{ maxWidth: 200 }}
              >
                <option value="">— nessuna —</option>
                {macroDiVendita.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          )}
          {g.categories.length === 0 ? (
            <div className="muted small" style={{ margin: '4px 0' }}>Nessuna categoria collegata.</div>
          ) : (
            <div className="chips-row" style={{ margin: '6px 0' }}>
              {g.categories.map((c) => (
                <span key={c.id} className="chip" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  {c.name}
                  <button
                    type="button"
                    aria-label={`Togli ${c.name} da ${g.name}`}
                    className="chip-x"
                    onClick={() => setCatMacro(c.id, null)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <AddCategoryToMacro
            macro={g}
            unassigned={unassigned}
            onChange={onChange}
            aggiornaCategoria={aggiornaCategoria}
            creaCategoria={creaCategoria}
          />
        </div>
      ))}

      {unassigned.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <span className="muted small">Categorie senza macro: </span>
          <span className="small">{unassigned.map((c) => c.name).join(', ')}</span>
        </div>
      )}

      {/* GLI STESSI CONTI, L'ALTRO BUCO (REQ-MAG-032). Un prodotto nato da
          una consegna non ha categoria, quindi non ha macro d'acquisto: la
          sua spesa non compare in «Acquisti × Fatturato» invece di risultare
          sbagliata, che è peggio. Sta accanto alle categorie senza macro
          perché è la stessa mancanza vista dall'altro lato, e si guardano
          nello stesso momento. */}
      {prodottiDaCompletare.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <span className="muted small">
            Prodotti con la scheda da completare, senza categoria:{' '}
          </span>
          <span className="small">{prodottiDaCompletare.map((p) => p.name).join(', ')}</span>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Sono arrivati con una consegna e in anagrafica non c'erano. Finché
            restano senza categoria, quello che si spende per loro non entra
            nei conti degli acquisti: si aprono dai <strong>Prodotti</strong>.
          </p>
        </div>
      )}
    </div>
  )
}

// Aggancio di una categoria a una macro: sceglie una categoria "libera" già
// esistente, oppure ne crea una nuova direttamente dentro la macro.
function AddCategoryToMacro({ macro, unassigned, onChange, aggiornaCategoria, creaCategoria }) {
  const [pick, setPick] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  async function attach() {
    if (!pick) return
    setBusy(true)
    try {
      await aggiornaCategoria(pick, { macro_id: macro.id })
      setPick('')
      await onChange()
    } finally {
      setBusy(false)
    }
  }
  async function createInto() {
    if (!newName.trim()) return
    setBusy(true)
    try {
      await creaCategoria({ name: newName.trim(), macro_id: macro.id })
      setNewName('')
      await onChange()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {unassigned.length > 0 && (
        <>
          <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ maxWidth: 180 }}>
            <option value="">+ collega categoria…</option>
            {unassigned.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="btn ghost small" onClick={attach} disabled={!pick || busy}>Collega</button>
          <span className="muted small">oppure</span>
        </>
      )}
      <input
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder="nuova categoria…"
        style={{ maxWidth: 160 }}
      />
      <button className="btn ghost small" onClick={createInto} disabled={!newName.trim() || busy}>+ Crea</button>
    </div>
  )
}
