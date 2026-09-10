import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { conteggioPesi, ordinaMacro, perNome, pesiAltrove, pesoAmmesso, pesoDi } from '../lib/macros.js'
import {
  createMacroCategory,
  updateMacroCategory,
  deleteMacroCategory,
  impostaPesoMacro,
} from '../lib/api.js'

// ── MACRO-CATEGORIE ──────────────────────────────────────────────────
//
// Pochi gruppi su cui fare i conti di quello che si spende e di quello che
// si incassa. Un elenco solo, e dentro ogni macro i SINGOLI prodotti del
// magazzino (a sinistra) e le SINGOLE voci del menù (a destra), ognuno con
// la sua percentuale — è la schermata che Flavio ha descritto il
// 09/09/2026: «clicco su una macro categoria e mi appaiono tutti i prodotti
// di magazzino e tutti gli items del menu … con una percentuale … sinistra
// prodotti destra items … tutti in ordine alfabetico». Il perché dei pesi,
// e dove stanno, è in lib/macros.js.
//
// L'ELENCO È DEL COMPONENTE, E OGNI GESTO LO AGGIORNA SUL POSTO con quello
// che il writer compone (lib/api.js): niente attese, niente riletture. È
// una lista lunga da compilare casella dopo casella: un giro di rete a ogni
// casella la renderebbe inusabile, e offline si bloccherebbe. `macros` in
// ingresso è la fotografia letta all'apertura del pannello.
export default function MacroCategoryManager({ macros, prodotti, voci }) {
  const [name, setName] = useState('')
  const [aperta, setAperta] = useState(null)
  const [elenco, setElenco] = useState(() => ordinaMacro(macros))
  useEffect(() => setElenco(ordinaMacro(macros)), [macros])
  // La versione più recente dell'elenco, per chi scrive un peso: così la
  // funzione resta la stessa fra un render e l'altro e le righe già a
  // schermo non si ridisegnano tutte a ogni casella confermata.
  const elencoRef = useRef(elenco)
  elencoRef.current = elenco

  const sostituisci = (...dopo) =>
    setElenco((prev) => ordinaMacro(prev.map((m) => dopo.find((d) => d.id === m.id) || m)))

  function addMacro() {
    const n = name.trim()
    if (!n) return
    const nuova = createMacroCategory({ name: n, sort_order: elenco.length })
    setElenco((prev) => [...prev, nuova])
    setName('')
  }
  function renameMacro(m) {
    const n = prompt('Nuovo nome macro-categoria:', m.name)
    if (n == null || !n.trim()) return
    sostituisci(updateMacroCategory(m, { name: n.trim() }))
  }
  function removeMacro(m) {
    if (!confirm(`Eliminare la macro “${m.name}”? Prodotti e voci restano, senza la quota che avevano qui.`)) return
    deleteMacroCategory(m.id)
    setElenco((prev) => prev.filter((x) => x.id !== m.id))
  }
  function moveMacro(idx, dir) {
    const j = idx + dir
    if (j < 0 || j >= elenco.length) return
    const a = elenco[idx]
    const b = elenco[j]
    sostituisci(updateMacroCategory(a, { sort_order: b.sort_order }), updateMacroCategory(b, { sort_order: a.sort_order }))
  }
  const scriviPeso = useCallback((macroId, lato, id, perc) => {
    const dopo = impostaPesoMacro(elencoRef.current, macroId, lato, id, perc)
    if (dopo) setElenco((prev) => prev.map((m) => (m.id === dopo.id ? dopo : m)))
  }, [])

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        Ogni macro-categoria raccoglie i singoli prodotti del magazzino (quello
        che si spende) e le singole voci del menù (quello che si incassa),
        ciascuno con la percentuale con cui ci entra. Un prodotto può stare
        per una parte in una macro e per il resto in un'altra; la quota che
        nessuna macro reclama resta «non attribuita».
      </p>
      <div className="row" style={{ gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nuova macro (es. Distillati)"
        />
        <button className="btn small" onClick={addMacro}>Aggiungi</button>
      </div>

      {elenco.length === 0 && (
        <div className="muted small" style={{ marginTop: 8 }}>Nessuna macro-categoria.</div>
      )}

      {elenco.map((m, idx) => {
        const conta = conteggioPesi(m)
        const isAperta = aperta === m.id
        return (
          <div key={m.id} className="macro-group">
            <div className="row between" style={{ alignItems: 'center' }}>
              <button
                type="button"
                className="btn ghost small macro-apri"
                aria-expanded={isAperta}
                onClick={() => setAperta(isAperta ? null : m.id)}
              >
                <strong>🗂️ {m.name}</strong>
                <span className="muted small">
                  {conta.prodotti} prodotti · {conta.voci} voci
                </span>
              </button>
              <span className="row" style={{ gap: 4 }}>
                <button className="btn ghost small" onClick={() => moveMacro(idx, -1)} disabled={idx === 0}>↑</button>
                <button className="btn ghost small" onClick={() => moveMacro(idx, 1)} disabled={idx === elenco.length - 1}>↓</button>
                <button className="btn ghost small" onClick={() => renameMacro(m)}>✏️</button>
                <button className="btn ghost small" onClick={() => removeMacro(m)}>🗑</button>
              </span>
            </div>
            {isAperta && (
              <div className="macro-pesi">
                <ColonnaPesi
                  titolo="📦 Prodotti del magazzino"
                  cerca="Cerca fra i prodotti"
                  lato="prodotti"
                  elementi={prodotti}
                  macro={m}
                  macros={elenco}
                  onPeso={scriviPeso}
                />
                <ColonnaPesi
                  titolo="🍸 Voci del menù"
                  cerca="Cerca fra le voci"
                  lato="voci"
                  elementi={voci}
                  macro={m}
                  macros={elenco}
                  onPeso={scriviPeso}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Un lato di una macro: la lista alfabetica dei prodotti (o delle voci) con
// la casella della percentuale. «Solo senza macro» serve a scorrere quello
// che manca ancora da attribuire senza rileggere ogni volta tutta la lista.
function ColonnaPesi({ titolo, cerca, lato, elementi, macro, macros, onPeso }) {
  const [filtro, setFiltro] = useState('')
  const [soloLiberi, setSoloLiberi] = useState(false)
  // L'ordine non dipende da cosa si cerca: si mette in fila una volta.
  const ordinati = useMemo(() => [...(elementi || [])].sort(perNome), [elementi])
  const altrove = useMemo(() => pesiAltrove(macros, lato, macro.id), [macros, lato, macro.id])
  const righe = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    const out = []
    for (const e of ordinati) {
      if (q && !String(e.name || '').toLowerCase().includes(q)) continue
      const qui = pesoDi(macro, lato, e.id)
      const fuori = altrove.get(e.id) || 0
      if (soloLiberi && qui + fuori > 0) continue
      out.push({ id: e.id, nome: e.name, qui, altrove: fuori })
    }
    return out
  }, [ordinati, filtro, soloLiberi, macro, lato, altrove])
  const conferma = useCallback((id, p) => onPeso(macro.id, lato, id, p), [onPeso, macro.id, lato])

  return (
    <div className="macro-colonna">
      <div className="row between" style={{ alignItems: 'center', gap: 6 }}>
        <strong className="small">{titolo}</strong>
        <label className="row small muted" style={{ gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={soloLiberi} onChange={(e) => setSoloLiberi(e.target.checked)} />
          Solo senza macro
        </label>
      </div>
      <input
        className="inv-search"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder={cerca}
        aria-label={cerca}
      />
      {righe.length === 0 && <div className="muted small">Niente da mostrare.</div>}
      {righe.map((r) => (
        <RigaPeso key={r.id} {...r} nomeMacro={macro.name} onPeso={conferma} />
      ))}
    </div>
  )
}

// La casella si compila liberamente e si salva quando si esce (o con
// Invio): salvare a ogni tasto scriverebbe «8» prima di «80». Il tetto è
// cento meno quello che le altre macro hanno già preso: la somma non può
// passare cento, se no un euro si conta due volte. Ridisegnata solo quando
// cambia qualcosa di suo: le righe sono centinaia, e a ogni conferma
// cambia una riga sola.
const RigaPeso = memo(function RigaPeso({ id, nome, qui, altrove, nomeMacro, onPeso }) {
  const [bozza, setBozza] = useState(null)
  const massimo = Math.max(0, 100 - altrove)
  const valore = bozza ?? (qui > 0 ? String(qui) : '')

  function conferma() {
    if (bozza == null) return
    const p = pesoAmmesso(bozza, massimo)
    setBozza(null)
    if (p !== qui) onPeso(id, p)
  }

  return (
    <label className={`macro-peso-riga${qui > 0 ? ' con-quota' : ''}`}>
      <span className="macro-peso-nome">{nome}</span>
      {altrove > 0 && <span className="muted small">{altrove}% altrove</span>}
      <input
        type="number"
        min={0}
        max={massimo}
        step={10}
        inputMode="numeric"
        value={valore}
        placeholder="0"
        aria-label={`${nome}: quota in ${nomeMacro}`}
        onChange={(e) => setBozza(e.target.value)}
        onBlur={conferma}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      <span className="muted small">%</span>
    </label>
  )
})
