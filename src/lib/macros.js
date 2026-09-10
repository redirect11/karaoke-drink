// MACRO-CATEGORIE: pochi gruppi (Distillati, Birre e bibite, Food…) su cui
// fare i conti di quello che si spende e di quello che si incassa.
//
// RIPENSATE IL 09/09/2026, su richiesta di Flavio: «clicco su una macro
// categoria e mi appaiono tutti i prodotti di magazzino e tutti gli items
// del menu … con una percentuale: il 100%, l'80%, il 60%». Prima una macro
// raggruppava CATEGORIE, e gli elenchi erano due (uno per quello che si
// compra, uno per quello che si vende). Adesso:
//
//   - l'elenco è UNO. La stessa macro tiene insieme quello che si spende
//     (i prodotti del magazzino) e quello che si incassa (le voci del
//     menù): è così che a fine mese speso e incassato si guardano uno
//     accanto all'altro senza un aggancio da compilare a parte.
//   - dentro ci vanno i SINGOLI prodotti e le SINGOLE voci, non le
//     categorie: «non mi mettere tutta la categoria bibite ma le singole
//     voci delle bibite».
//   - ogni legame porta una PERCENTUALE. Un prodotto può stare per il 60%
//     in una macro e per il 40% in un'altra; una voce di menù di solito sta
//     al 100% in una sola. Il resto, se le quote non arrivano a cento,
//     resta «non attribuito».
//
// I pesi vivono SULLA MACRO, in due mappe: `pesi_prodotti` (id prodotto →
// percentuale) e `pesi_voci` (id voce → percentuale), interi da 1 a 100.
// Stanno lì e non sul prodotto perché è la macro che si apre per
// compilarli, ed è la macro che si cancella: sparita lei, spariscono i suoi
// pesi e nessun prodotto resta a puntare un gruppo che non c'è più.
//
// Logica pura (niente Firebase), interamente testabile.

// Chiave di quello che non si sa attribuire: la quota di un prodotto o di
// una voce che nessuna macro reclama.
export const UNASSIGNED = 'none'

// I due lati di una macro, e il campo in cui stanno i pesi di ognuno.
export const LATI = { prodotti: 'pesi_prodotti', voci: 'pesi_voci' }

// UN PESO È UN INTERO DA 0 A `massimo` — cento, o cento meno quello che le
// altre macro hanno già preso. Quello che sfora si riporta al tetto, quello
// che non è un numero vale zero, e zero vuol dire «non c'è». È l'UNICA
// regola sul valore di un peso: la applicano la casella e chi scrive
// (impostaPesoMacro), perché un tetto che vive solo nell'interfaccia lo
// sfonda il primo script.
export function pesoAmmesso(perc, massimo = 100) {
  const n = Math.round(Number(perc))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, Math.max(0, Math.min(massimo, 100)))
}

// UNA MAPPA DI PESI CON DENTRO SOLO PESI VERI. È la forma in cui le macro
// stanno in memoria — dalla lettura (api.js, mapMacro) e dopo ogni
// scrittura (macroConPeso) — così chi legge un peso non deve rivalidarlo.
export function pesiPuliti(mappa) {
  const out = {}
  for (const [id, perc] of Object.entries(mappa || {})) {
    const p = pesoAmmesso(perc)
    if (p > 0) out[id] = p
  }
  return out
}

// Un solo modo di mettere in fila per nome, con la lingua giusta: senza
// il locale «È» e «E» finiscono lontani.
export const perNome = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'it')

export function ordinaMacro(macros) {
  return [...(macros || [])].sort((a, b) => a.sort_order - b.sort_order || perNome(a, b))
}

// Quanto di `id` sta in QUESTA macro, su un lato: 0 se niente.
export function pesoDi(macro, lato, id) {
  return macro?.[LATI[lato]]?.[id] || 0
}

// Quanto di `id` è già assegnato alle ALTRE macro (tutte tranne
// `escludi`): è il numero che dice quanto resta da dare, e oltre il quale
// la somma passerebbe cento. Per un id solo; per una colonna intera c'è
// `pesiAltrove`, che fa lo stesso conto per tutti in un giro.
export function quotaAltrove(macros, lato, id, escludi = null) {
  let somma = 0
  for (const m of macros || []) if (m.id !== escludi) somma += pesoDi(m, lato, id)
  return somma
}

export function pesiAltrove(macros, lato, escludi = null) {
  const somme = new Map()
  for (const m of macros || []) {
    if (m.id === escludi) continue
    for (const [id, p] of Object.entries(m[LATI[lato]] || {})) somme.set(id, (somme.get(id) || 0) + p)
  }
  return somme
}

// LA MACRO DOPO CHE UN PESO È STATO SCRITTO: si compone dalla macro di
// partenza più il peso nuovo, non si rilegge (BUG-045). Uno zero toglie.
export function macroConPeso(macro, lato, id, perc) {
  const campo = LATI[lato]
  return { ...macro, [campo]: pesiPuliti({ ...macro?.[campo], [id]: perc }) }
}

// COME SI SPARTISCE UN EURO di `id` fra le macro: [{ macro, quota }] con
// le quote in frazione (0,6 per il 60%). Se le percentuali non arrivano a
// cento, il resto va a UNASSIGNED; se lo superano — non dovrebbe, casella e
// scrittura lo impediscono, ma due persone possono scrivere insieme — le
// si riporta a cento in proporzione, così nessun euro viene contato due
// volte.
export function ripartizione(macros, lato, id) {
  const parti = []
  let somma = 0
  for (const m of macros || []) {
    const p = pesoDi(m, lato, id)
    if (p > 0) {
      parti.push({ macro: m.id, quota: p })
      somma += p
    }
  }
  if (somma === 0) return [{ macro: UNASSIGNED, quota: 1 }]
  const base = Math.max(somma, 100)
  for (const parte of parti) parte.quota = parte.quota / base
  if (somma < 100) parti.push({ macro: UNASSIGNED, quota: (100 - somma) / 100 })
  return parti
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// DEGLI IMPORTI SPARTITI FRA LE MACRO secondo i pesi di `id`: da
// { incasso: 10, costo: 2 } a [{ macro, incasso, costo }, …], ogni parte
// arrotondata al centesimo. È il punto unico in cui un euro diventa quote:
// vendite e acquisti passano tutti da qui.
export function ripartisci(macros, lato, id, importi) {
  return ripartizione(macros, lato, id).map(({ macro, quota }) => {
    const parte = { macro }
    for (const [k, v] of Object.entries(importi || {})) parte[k] = round2(v * quota)
    return parte
  })
}

// Quanti prodotti e quante voci ha dentro una macro: il riassunto che si
// legge nell'elenco prima di aprirla. Le mappe sono pulite (pesiPuliti):
// una chiave è un peso.
export function conteggioPesi(macro) {
  return {
    prodotti: Object.keys(macro?.pesi_prodotti || {}).length,
    voci: Object.keys(macro?.pesi_voci || {}).length,
  }
}
