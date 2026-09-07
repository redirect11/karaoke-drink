// Logica pura del gestionale magazzino (niente Firebase): conta periodica,
// ordini fornitore e scadenzario. Replica i calcoli dei fogli Excel storici
// della Tana (INV / GENERATORE ORDINI / FORNITORI REC).

import { costWithVat } from './inventory.js'

// ── Conta periodica (INV: DEP → ACQ → RIM → CONS) ─────────────────────

// Consumo di una riga di conta: giacenza iniziale + acquisti − rimanenza.
// Valori in unità base (ml/g/pz); rim mancante ⇒ consumo non calcolabile (null).
export function countLineCons(line) {
  if (line?.rim == null || line.rim === '') return null
  const dep = Number(line.dep) || 0
  const acq = Number(line.acq) || 0
  const rim = Number(line.rim) || 0
  return dep + acq - rim
}

// Valore in € di una quantità in unità base di un item (con IVA di default).
export function qtyValue(qty, item, { gross = true } = {}) {
  const n = Number(qty) || 0
  if (n <= 0) return 0
  const unitCost = gross ? costWithVat(item?.cost, item?.vat) : (Number(item?.cost) || 0)
  if (item?.unit === 'pz') return n * unitCost
  const size = Number(item?.package_size) || 0
  return size > 0 ? (n / size) * unitCost : 0
}

// ── IL CONSUMO A SETTIMANA, SULLE SETTIMANE VERE ─────────────────────
// Nel foglio INV il consumo settimanale è diviso per una COSTANTE scritta
// a mano — «÷ 3», poi «÷ 2», poi «÷ 1,5», poi «÷ 4» — che si aggiorna ogni
// tanto e nel frattempo sbaglia di quanto è lontana dalla realtà: sei
// settimane divise per 4, e tre settimane e mezzo divise per 4 anche loro.
// È il numero su cui si decide quanto ordinare, quindi l'errore non resta
// dov'è.
//
// Qui il divisore non si tiene aggiornato: sono i GIORNI VERI del periodo,
// che l'app conosce perché le conte hanno una data.
const GIORNO_MS = 86400000

// SOTTO UN GIORNO PIENO NON SI DIVIDE. Una conta aperta e chiusa in tre ore
// darebbe un consumo settimanale di otto volte quello vero, e su quel
// numero si decide quanto ordinare: meglio non mostrarlo che mostrarne uno
// finto, che manda a comprare merce che non serve.
export const MIN_GIORNI_CONTA = 1

// Giorni veri di un periodo di conta. `al` mancante vuol dire ADESSO: la
// conta ancora aperta ha un periodo che si allunga mentre la si compila.
// Torna null dove il periodo non c'è o è troppo corto per dire qualcosa.
export function giorniDiConta(dal, al = null) {
  const da = dal ? new Date(dal).getTime() : NaN
  const a = al ? new Date(al).getTime() : Date.now()
  if (!Number.isFinite(da) || !Number.isFinite(a)) return null
  const giorni = (a - da) / GIORNO_MS
  return giorni >= MIN_GIORNI_CONTA ? giorni : null
}

// Consumo per settimana: consumo / giorni × 7. Niente giorni, niente
// numero — e un consumo che non si è potuto calcolare resta tale.
//
// SI ARROTONDA QUI, e non è un dettaglio: 1500 / 14 × 7 in virgola mobile
// fa 749,9999999999999, e chi scrive le quantità (formatQty) su quello non
// riconosce più i 75 cl tondi e stampa «750 ml». Due schermate finirebbero
// per scrivere lo stesso consumo in due modi diversi.
export function consumoSettimanale(cons, giorni) {
  if (cons == null || giorni == null || !(giorni > 0)) return null
  return Math.round((((Number(cons) || 0) / giorni) * 7 + Number.EPSILON) * 100) / 100
}

// Completa le righe della conta con consumo e valori e calcola i totali.
//   lines: [{ item_id, name, unit, dep, acq, rim, cost, vat, package_size }]
//   dal/al: gli estremi del periodo, per il consumo a settimana (`al`
//           mancante = adesso, cioè conta ancora aperta).
// Ritorna { lines: [...con cons, cons_week, rim_value, cons_value], totals,
// giorni }.
export function stockCountCompute(lines, { dal = null, al = null } = {}) {
  const giorni = giorniDiConta(dal, al)
  const out = (lines || []).map((l) => {
    const cons = countLineCons(l)
    return {
      ...l,
      cons,
      cons_week: consumoSettimanale(cons, giorni),
      rim_value: qtyValue(l.rim, l),
      cons_value: cons != null ? qtyValue(cons, l) : 0,
    }
  })
  const totals = out.reduce(
    (t, l) => ({
      rim_value: t.rim_value + (l.rim_value || 0),
      cons_value: t.cons_value + (l.cons_value || 0),
      counted: t.counted + (l.cons != null ? 1 : 0),
    }),
    { rim_value: 0, cons_value: 0, counted: 0 }
  )
  return { lines: out, totals, giorni }
}

// ── Ordini fornitore (GENERATORE ORDINI) ──────────────────────────────

// Confezioni SUGGERITE per il riordino: se il prodotto è sotto soglia si
// riporta la giacenza a 2× la soglia di avviso (minimo una confezione).
// Senza soglia impostata nessun suggerimento (0).
export function suggestedPackages(item) {
  const stock = Number(item?.stock) || 0
  const thr = Number(item?.low_threshold) || 0
  if (thr <= 0 || stock > thr) return 0
  const size = item?.unit === 'pz' ? 1 : Number(item?.package_size) || 0
  if (size <= 0) return 0
  return Math.max(1, Math.ceil((thr * 2 - stock) / size))
}

// Elenco fornitori incollato (import dall'Excel: un nome per riga,
// opzionale ";email"). Ritorna [{ name, email }] senza duplicati.
export function parseSupplierList(text) {
  const seen = new Set()
  const out = []
  for (const raw of String(text || '').split('\n')) {
    const [name, email] = raw.split(';').map((x) => (x || '').trim())
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, email: email || null })
  }
  return out
}

// Testo dell'ordine da mandare al fornitore (email, copia, stampa).
export function purchaseOrderText(order) {
  const righe = (order.lines || [])
    .map((l) => `- ${l.qty_packages}× ${l.name}`)
    .join('\n')
  return [
    `Ordine del ${String(order.created_at || '').slice(0, 10)}`,
    order.supplier_name ? `Fornitore: ${order.supplier_name}` : null,
    '',
    righe,
    '',
    `Totale netto: ${(Number(order.total_net) || 0).toFixed(2)} €`,
    `Totale ivato: ${(Number(order.total_gross) || 0).toFixed(2)} €`,
  ]
    .filter((r) => r !== null)
    .join('\n')
}


// Totali di un ordine: righe { qty_packages, unit_cost, vat }.
export function purchaseOrderTotals(lines) {
  return (lines || []).reduce(
    (t, l) => {
      const qty = Number(l.qty_packages) || 0
      const net = qty * (Number(l.unit_cost) || 0)
      return {
        net: t.net + net,
        gross: t.gross + qty * costWithVat(l.unit_cost, l.vat),
        pieces: t.pieces + qty,
      }
    },
    { net: 0, gross: 0, pieces: 0 }
  )
}

// ── Modifica ordine con scorte già scalate ────────────────────────────

// Differenza tra due consumi (liste { inventory_item_id, name, unit, qty }):
// delta > 0 = consumo aggiuntivo da scalare, delta < 0 = quantità da
// restituire a magazzino. Usato quando il bartender modifica un ordine già
// in preparazione (scarico già applicato).
export function consumptionDiff(oldCons, newCons) {
  // Chiave ARTICOLO + UNITÀ, come in computeConsumption: 40 ml di gin e 1 pz
  // di gin sono due consumi diversi dello stesso prodotto e non si sommano.
  const chiave = (c) => `${c.inventory_item_id}|${c.unit ?? 'pz'}`
  const byId = new Map()
  for (const c of newCons || []) {
    byId.set(chiave(c), {
      inventory_item_id: c.inventory_item_id,
      name: c.name ?? null,
      unit: c.unit ?? 'pz',
      delta: Number(c.qty) || 0,
    })
  }
  for (const c of oldCons || []) {
    const cur = byId.get(chiave(c))
    if (cur) {
      cur.delta -= Number(c.qty) || 0
    } else {
      byId.set(chiave(c), {
        inventory_item_id: c.inventory_item_id,
        name: c.name ?? null,
        unit: c.unit ?? 'pz',
        delta: -(Number(c.qty) || 0),
      })
    }
  }
  return [...byId.values()].filter((d) => d.delta !== 0)
}

// ── Scadenzario fornitori (FORNITORI REC) ─────────────────────────────
//
// `invoiceTotals` stava qui ed è passato in `fatture.js` con BUG-100: da
// quando una nota di credito sottrae, i totali devono conoscere i tipi di
// documento, e i tipi di documento vivono là.
