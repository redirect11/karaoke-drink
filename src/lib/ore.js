// RAPP ORE: registro ore dello staff (replica del foglio Excel storico).
// Logica pura: calcolo ore di un turno (anche a cavallo di mezzanotte,
// siamo un bar) e totali mensili per persona.

// Ore lavorate: "HH:MM" → "HH:MM", meno la pausa. Se l'uscita è prima
// dell'entrata il turno passa la mezzanotte (+24h). Ritorna ore decimali
// arrotondate ai centesimi, oppure null se gli orari non sono validi.
export function computeHours(start, end, breakMinutes = 0) {
  const toMin = (t) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim())
    if (!m) return null
    const h = Number(m[1])
    const min = Number(m[2])
    if (h > 23 || min > 59) return null
    return h * 60 + min
  }
  const a = toMin(start)
  const b = toMin(end)
  if (a == null || b == null) return null
  let diff = b - a
  if (diff <= 0) diff += 24 * 60 // turno oltre la mezzanotte
  diff -= Math.max(0, Number(breakMinutes) || 0)
  if (diff < 0) return null
  return Math.round((diff / 60) * 100) / 100
}

// Chiave mese di una data ISO (YYYY-MM-DD → YYYY-MM).
export const monthKey = (date) => String(date || '').slice(0, 7)

// Ore tra due istanti ISO (timbratura entrata/uscita), decimali ai
// centesimi. Null se mancano o l'uscita precede l'entrata.
export function hoursBetweenIso(startIso, endIso) {
  const a = Date.parse(startIso)
  const b = Date.parse(endIso)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return Math.round(((b - a) / 3600000) * 100) / 100
}

// "HH:MM" locale da un istante ISO (per mostrare gli orari di timbratura).
export function hhmm(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// "GG/MM HH:MM" da un istante ISO: come si legge la riga di uno storico.
// Niente anno, niente secondi e niente fuso — chi guarda uno storico vuole
// sapere «quando», non un timestamp. Stava dentro la lista ordini ed è venuta
// qui quando anche lo scadenzario ha avuto la sua storia da leggere
// (REQ-MAG-041): due copie della stessa data prima o poi si scrivono in due
// modi diversi.
export function giornoEOra(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  const d = new Date(t)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hhmm(iso)}`
}

// Confronto ore EFFETTIVE vs PROGRAMMATE per una lista di voci giorno.
// entries: [{ hours, kind: 'effettivo'|'programmato' }]. Ritorna i due
// totali e lo scarto (effettivo − programmato).
export function effVsPlanned(entries) {
  let eff = 0
  let plan = 0
  for (const e of entries || []) {
    const h = Number(e.hours) || 0
    if (e.kind === 'programmato') plan += h
    else eff += h
  }
  eff = Math.round(eff * 100) / 100
  plan = Math.round(plan * 100) / 100
  return { effettivo: eff, programmato: plan, scarto: Math.round((eff - plan) * 100) / 100 }
}

// Etichetta oraria "da–a" di una voce, se ne ha: turno manuale (start/end)
// o timbratura (clock_in/clock_out; '…' se ancora aperta). Null per le ore
// importate senza orario (che quindi mostrano solo il monte ore).
export function shiftRange(e) {
  if (e?.start && e?.end) return `${e.start}–${e.end}`
  if (e?.clock_in) return `${hhmm(e.clock_in)}–${e.clock_out ? hhmm(e.clock_out) : '…'}`
  return null
}

// CHI è di turno in un giorno, con orari PROGRAMMATI ed EFFETTIVI. Raggruppa
// le voci per persona (per uid, ripiego sul nome) e per ciascuna riporta i
// due monti ore e gli intervalli "da–a" già pronti. Ordina per nome.
//   → [{ key, name, programmato: {hours, ranges:[]}, effettivo: {hours, ranges:[]} }]
export function peopleOfDay(entries) {
  const m = new Map()
  for (const e of entries || []) {
    const key = e.staff_uid || e.staff_name || '?'
    const cur =
      m.get(key) || {
        key,
        name: e.staff_name || '—',
        programmato: { hours: 0, ranges: [] },
        effettivo: { hours: 0, ranges: [] },
      }
    const bucket = e.kind === 'programmato' ? cur.programmato : cur.effettivo
    bucket.hours = Math.round((bucket.hours + (Number(e.hours) || 0)) * 100) / 100
    const r = shiftRange(e)
    if (r) bucket.ranges.push(r)
    m.set(key, cur)
  }
  return [...m.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

// Ore totali di un elenco di turni.
export const sumHours = (entries) =>
  Math.round((entries || []).reduce((s, e) => s + (Number(e.hours) || 0), 0) * 100) / 100

// Turni raggruppati per giorno: Map 'YYYY-MM-DD' → { total, entries }.
export function byDay(entries) {
  const m = new Map()
  for (const e of entries || []) {
    const cur = m.get(e.date) || { total: 0, entries: [] }
    cur.entries.push(e)
    cur.total = Math.round((cur.total + (Number(e.hours) || 0)) * 100) / 100
    m.set(e.date, cur)
  }
  return m
}

// Le 6 settimane (42 giorni) che coprono il mese, partendo dal lunedì:
// [{ date: 'YYYY-MM-DD', inMonth }]. `weekStartsMonday` per l'Italia.
export function monthGrid(monthStr) {
  const [y, mo] = String(monthStr).split('-').map(Number)
  const first = new Date(Date.UTC(y, mo - 1, 1))
  const dow = (first.getUTCDay() + 6) % 7 // 0 = lunedì
  const start = new Date(first)
  start.setUTCDate(first.getUTCDate() - dow)
  const days = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    days.push({ date: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === mo - 1 })
  }
  return days
}

// I 7 giorni (lun→dom) della settimana che contiene `dateStr`.
export function weekDays(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - dow)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday)
    x.setUTCDate(monday.getUTCDate() + i)
    return x.toISOString().slice(0, 10)
  })
}

// Sposta una data ISO di N giorni.
export function shiftDay(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

// Totali del mese per persona: [{ name, hours, turni }] ordinati per nome,
// più il totale complessivo.
export function monthlyTotals(entries) {
  const byName = new Map()
  let total = 0
  for (const e of entries || []) {
    const h = Number(e.hours) || 0
    total += h
    const cur = byName.get(e.staff_name) || { name: e.staff_name, hours: 0, turni: 0 }
    cur.hours = Math.round((cur.hours + h) * 100) / 100
    cur.turni += 1
    byName.set(e.staff_name, cur)
  }
  return {
    people: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    total: Math.round(total * 100) / 100,
  }
}
