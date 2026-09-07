import { useEffect, useMemo, useState } from 'react'
import {
  fetchAltreSpese,
  creaAltraSpesa,
  aggiornaAltraSpesa,
  eliminaAltraSpesa,
} from '../lib/api.js'
import { formatPrice } from '../lib/orderStatus.js'
import {
  totaleSpesa,
  spesaComprata,
  totaliSpese,
  speseSenzaPrezzo,
  speseSenzaData,
} from '../lib/spese.js'

// ── ALTRE SPESE (REQ-MAG-034) ────────────────────────────────────────
//
// La terza sottosezione di Fornitori: quello che esce dal conto corrente e
// non entra in magazzino. Le colonne sono quelle del foglio «TO BUY» —
// articolo, quantità, prezzo, dove si compra, note — perché è lì che questa
// roba sta scritta oggi.
//
// LA COSA DA NON SBAGLIARE, ed è tutta la ragione di questa schermata: quel
// foglio è una LISTA DELLA SPESA, non un registro. Diverse righe hanno
// prezzo zero (non ancora prezzate) e diverse cose non sono mai state
// comprate. Solo le COMPRATE pesano sul mese; le altre sono un promemoria.
// Senza la distinzione un divano desiderato abbasserebbe l'utile di gennaio.
//
// NIENTE ESEMPI NEI CAMPI, e non è una svista: cosa ci sia dentro le spese
// di Flavio non lo sappiamo ancora (REQ-CASSA-012 — l'elenco «affitto, SIAE,
// commercialista, utenze» era inventato da chi scriveva quella voce, non una
// sua frase). Un suggerimento nel campo insegnerebbe a scriverci quello che
// abbiamo immaginato noi.
const oggi = () => new Date().toISOString().slice(0, 10)

export default function AltreSpesePanel() {
  const [spese, setSpese] = useState([])
  const [error, setError] = useState(null)
  // `modulo` è la riga in lavorazione: `null` niente aperto, un oggetto vuoto
  // la spesa nuova, una spesa esistente la modifica. Un campo solo, così le
  // due strade non possono restare aperte insieme.
  const [modulo, setModulo] = useState(null)
  const [soloDaComprare, setSoloDaComprare] = useState(false)
  const [soloSenzaPrezzo, setSoloSenzaPrezzo] = useState(false)

  async function carica() {
    try {
      setSpese(await fetchAltreSpese())
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    carica()
  }, [])

  const totali = useMemo(() => totaliSpese(spese), [spese])
  const senzaPrezzo = useMemo(() => speseSenzaPrezzo(spese), [spese])
  const senzaData = useMemo(() => speseSenzaData(spese), [spese])
  const daComprare = useMemo(() => spese.filter((s) => !spesaComprata(s)).length, [spese])
  const visibili = useMemo(
    () =>
      spese.filter((s) => {
        if (soloDaComprare && spesaComprata(s)) return false
        if (soloSenzaPrezzo && !senzaPrezzo.includes(s)) return false
        return true
      }),
    [spese, soloDaComprare, soloSenzaPrezzo, senzaPrezzo]
  )

  // NIENTE `await` PRIMA DI MOSTRARE L'ESITO: le funzioni di api.js scrivono
  // in sottofondo e compongono il risultato in memoria, quindi la riga
  // compare (o cambia) nell'istante del gesto anche senza rete.
  function salva(dati) {
    const quale = modulo
    setModulo(null)
    setError(null)
    if (quale?.id) {
      aggiornaAltraSpesa(quale.id, dati).then(
        (agg) => setSpese((prev) => prev.map((s) => (s.id === agg.id ? agg : s))),
        (e) => setError(e.message)
      )
    } else {
      creaAltraSpesa(dati).then(
        (nuova) => setSpese((prev) => [nuova, ...prev]),
        (e) => setError(e.message)
      )
    }
  }

  // LA DATA È QUELLA CHE DECIDE IL MESE: segnando comprata una voce che non
  // ce l'ha si mette oggi, che è quando il gesto sta succedendo. Chi l'ha
  // comprata un altro giorno corregge la data dalla modifica.
  function cambiaComprata(spesa) {
    setError(null)
    const dati = { bought: !spesa.bought, bought_at: spesa.bought_at || oggi() }
    setSpese((prev) => prev.map((s) => (s.id === spesa.id ? { ...s, ...dati } : s)))
    aggiornaAltraSpesa(spesa.id, dati).then(
      (agg) => setSpese((prev) => prev.map((s) => (s.id === agg.id ? agg : s))),
      (e) => {
        setError(e.message)
        carica()
      }
    )
  }

  function elimina(spesa) {
    if (!confirm(`Eliminare «${spesa.name || 'questa voce'}»?`)) return
    setError(null)
    setSpese((prev) => prev.filter((s) => s.id !== spesa.id))
    eliminaAltraSpesa(spesa.id).catch((e) => {
      setError(e.message)
      carica()
    })
  }

  return (
    <div>
      {error && <div className="banner">Errore: {error}</div>}

      <div className="inv-summary">
        <span className="chip" style={{ cursor: 'default' }}>
          Comprato <strong>{formatPrice(totali.comprato)}</strong>
        </span>
        <button
          className={`chip ${soloDaComprare ? 'active' : ''}`}
          onClick={() => setSoloDaComprare((v) => !v)}
        >
          Solo da comprare ({daComprare})
        </button>
        {/* Lo stesso mestiere dei chip dello Scadenzario: un buco si conta in
            testa e si isola con un tocco. Qui il buco è una voce segnata
            comprata che pesa zero sul mese — nessuno se ne accorgerebbe
            finché non si confrontano i totali. */}
        {senzaPrezzo.length > 0 && (
          <button
            className={`chip ${soloSenzaPrezzo ? 'active' : ''}`}
            onClick={() => setSoloSenzaPrezzo((v) => !v)}
          >
            Senza prezzo ({senzaPrezzo.length})
          </button>
        )}
      </div>

      <p className="muted small" style={{ margin: '0 4px 8px' }}>
        Quello che esce dal conto e non entra in magazzino. La merce dei
        fornitori non va qui: si conta dalle fatture, e riscriverla la
        conterebbe due volte. Pesa sul mese solo quello che è segnato come
        comprato; il resto è un promemoria.
      </p>

      {!modulo ? (
        <button className="btn block" onClick={() => setModulo({})}>
          + Nuova spesa
        </button>
      ) : (
        <SpesaForm spesa={modulo} onCancel={() => setModulo(null)} onSave={salva} />
      )}

      <div className="inv-list" style={{ marginTop: 8 }}>
        {visibili.map((s) => (
          <div className="inv-item" key={s.id}>
            <div className="inv-row" style={{ cursor: 'default' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="inv-name">{s.name || '—'}</div>
                <div className="muted small">
                  {s.qty > 1 ? `${s.qty} × ${formatPrice(s.unit_cost)}` : formatPrice(s.unit_cost)}
                  {s.shop ? ` · ${s.shop}` : ''}
                  {s.bought && s.bought_at ? ` · ${s.bought_at}` : ''}
                  {s.notes ? ` · ${s.notes}` : ''}
                </div>
                {/* L'ambra e non il rosso: non è un errore, è lavoro che manca
                    (DESIGN.md — qui il rosso vuol dire annullato). Sono i due
                    modi in cui una spesa comprata sparisce dai conti: senza
                    prezzo pesa zero, senza data non ha un mese su cui pesare.
                    Il secondo non nasce da questa schermata — che la data la
                    mette sempre — ma da quello che arriva da fuori. */}
                {spesaComprata(s) && totaleSpesa(s) <= 0 && (
                  <span className="badge-low">senza prezzo</span>
                )}
                {senzaData.includes(s) && <span className="badge-low">senza data</span>}
              </div>
              <div className="inv-qty">
                <div>{formatPrice(totaleSpesa(s))}</div>
                <button
                  className={s.bought ? 'chip active' : 'chip'}
                  style={{ marginTop: 4 }}
                  aria-label={
                    s.bought
                      ? `Segna «${s.name}» come da comprare`
                      : `Segna «${s.name}» come comprata`
                  }
                  onClick={() => cambiaComprata(s)}
                >
                  {s.bought ? '✅ comprata' : '🛒 da comprare'}
                </button>
              </div>
              <button
                className="btn ghost small"
                aria-label={`Modifica «${s.name}»`}
                onClick={() => setModulo(s)}
              >
                ✏️
              </button>
              <button
                className="btn ghost small"
                aria-label={`Elimina «${s.name}»`}
                onClick={() => elimina(s)}
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>

      {visibili.length === 0 && <div className="empty">Nessuna spesa.</div>}

      {/* Il costo della lista NON è una spesa: è la stima di un promemoria, e
          sta staccato dai totali di sopra perché i due numeri non si devono
          poter confondere. */}
      {totali.daComprare > 0 && (
        <div className="muted small" style={{ margin: '8px 4px 0' }}>
          Ancora da comprare: {formatPrice(totali.daComprare)}, che non pesa su
          nessun mese.
        </div>
      )}
    </div>
  )
}

// Il modulo, per la spesa nuova e per la modifica: sono la stessa cosa, e la
// seconda serve quanto la prima — una voce del foglio nasce spesso senza
// prezzo e lo prende il giorno che la si compra.
function SpesaForm({ spesa, onCancel, onSave }) {
  const [form, setForm] = useState({
    name: spesa.name ?? '',
    qty: spesa.qty ?? 1,
    unit_cost: spesa.unit_cost ?? '',
    shop: spesa.shop ?? '',
    notes: spesa.notes ?? '',
    bought: !!spesa.bought,
    bought_at: spesa.bought_at || oggi(),
  })
  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const numero = (v) => Number(String(v).replace(',', '.')) || 0

  function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave({
      name: form.name,
      qty: numero(form.qty),
      unit_cost: numero(form.unit_cost),
      shop: form.shop,
      notes: form.notes,
      bought: form.bought,
      bought_at: form.bought_at,
    })
  }

  return (
    <form className="card" onSubmit={submit}>
      <strong>{spesa.id ? 'Modifica spesa' : 'Nuova spesa'}</strong>

      <label htmlFor="sp-nome" style={{ marginTop: 8 }}>Articolo *</label>
      <input id="sp-nome" value={form.name} onChange={set('name')} required />

      <div className="grid-2">
        <div>
          <label htmlFor="sp-qty">Quantità</label>
          <input id="sp-qty" type="number" step="1" min="0" value={form.qty} onChange={set('qty')} />
        </div>
        <div>
          {/* IL PREZZO PUÒ RESTARE VUOTO, ed è la normalità di una lista della
              spesa: nel foglio diverse righe non sono ancora prezzate. Diventa
              un buco solo quando la voce si segna comprata. */}
          <label htmlFor="sp-prezzo">Prezzo €</label>
          <input
            id="sp-prezzo"
            type="number"
            step="any"
            min="0"
            value={form.unit_cost}
            onChange={set('unit_cost')}
          />
        </div>
      </div>

      <label htmlFor="sp-dove">Dove si compra</label>
      <input id="sp-dove" value={form.shop} onChange={set('shop')} />

      <label htmlFor="sp-note">Note</label>
      <input id="sp-note" value={form.notes} onChange={set('notes')} />

      <label className="row" style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={form.bought}
          onChange={set('bought')}
        />
        <span>Già comprata</span>
      </label>

      {/* La data compare solo dove serve: su un promemoria non c'è niente da
          datare, e chiederla comunque farebbe scrivere un mese di competenza
          per una cosa che non è successa. */}
      {form.bought && (
        <>
          <label htmlFor="sp-data">Data dell’acquisto</label>
          <input id="sp-data" type="date" value={form.bought_at} onChange={set('bought_at')} />
          <p className="muted small">Decide su quale mese pesa questa spesa.</p>
        </>
      )}

      <div className="grid-2" style={{ marginTop: 12 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Annulla
        </button>
        <button type="submit" className="btn">
          Salva
        </button>
      </div>
    </form>
  )
}
