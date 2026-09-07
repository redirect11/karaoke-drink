// ── ALTRE SPESE: quello che esce dal conto e non entra in magazzino ───
//
// Nasce da una domanda dell'utente (19/08): «quelle spese da inserire a mano
// non sono gli ordini?». La risposta, misurata sui fogli, è che in parte sì:
// la riga SPESE del foglio mensile è SEMPRE più grande degli acquisti dello
// stesso mese (gen 2.380 contro 1.809, apr 5.005 contro 2.884, giu 12.726
// contro 8.673), quindi lì dentro c'è la merce PIÙ altro.
//
// COS'È QUELL'ALTRO, e non è un'ipotesi: sta in FORNITORI REC.xlsx, foglio
// «TO BUY» — tavoli da esterno, sgabelli, divani, una tenda, uno scaffale,
// bicchieri di plastica in cinque misure, con quantità, prezzo, dove si
// compra e note. Roba che esce dal conto corrente, non entra in magazzino, e
// che nessun ordine fornitore intercetterà mai. Da qui i campi di una spesa:
// sono le colonne di quel foglio.
//
// ⚠️ LA MERCE NON STA QUI (REQ-CASSA-012): arriva dalle fatture fornitore e
// si conta da sola. Se le due cose si mescolano la stessa uscita viene
// contata due volte e il netto del mese sbaglia in silenzio.
//
// ── LA DISTINZIONE CHE REGGE TUTTO: COMPRATA O SOLO DESIDERATA ───────
//
// Quel foglio è una LISTA DELLA SPESA, non un registro: si chiama «da
// comprare» e diverse righe hanno prezzo zero, cioè non sono ancora state
// prezzate. Serve quindi sapere se una voce è GIÀ STATA COMPRATA: solo
// quelle comprate pesano sul mese, le altre sono un promemoria. Senza questa
// distinzione un divano desiderato abbasserebbe l'utile di gennaio.
//
// Il dato che la porta sono due campi e non uno: `bought` dice SE, `bought_at`
// dice QUANDO — ed è la data che decide su quale mese l'uscita pesa. Una
// spesa non comprata non ha mese, perché non è successo niente.
//
// Qui dentro non c'è Firebase apposta: sono i conti che decidono cosa pesa
// sul mese, e vanno provati senza database.

import { monthKey } from './ore.js'

// LA QUANTITÀ MANCANTE VALE UNO, e non zero: chi scrive solo il prezzo ha
// comprato una cosa, non zero cose. Con lo zero il totale sparirebbe dal
// mese in silenzio, che è l'errore peggiore dei due.
export function quantitaSpesa(spesa) {
  const q = Number(spesa?.qty)
  return Number.isFinite(q) && q > 0 ? q : 1
}

// Il totale di una riga: quantità per prezzo, come nel foglio. Non si scrive
// sul documento — sarebbe un terzo numero da tenere d'accordo con gli altri
// due, e il primo che si dimentica di aggiornarlo fa sbagliare il mese.
export function totaleSpesa(spesa) {
  const prezzo = Number(spesa?.unit_cost)
  if (!Number.isFinite(prezzo) || prezzo <= 0) return 0
  return quantitaSpesa(spesa) * prezzo
}

// Comprata davvero. Il campo può mancare — una riga scritta come promemoria
// non lo porta — e chi non ce l'ha è ancora un desiderio.
export const spesaComprata = (spesa) => spesa?.bought === true

// Il mese su cui pesa, dalla data dell'acquisto. Chi non è comprata non ha
// mese: non è ancora uscito niente dal conto.
export function meseSpesa(spesa) {
  if (!spesaComprata(spesa)) return null
  return monthKey(spesa?.bought_at) || null
}

export const speseComprate = (spese) => (spese || []).filter(spesaComprata)
export const speseDaComprare = (spese) => (spese || []).filter((s) => !spesaComprata(s))

// IL BUCO DI QUESTA SOTTOSEZIONE, ed è lo stesso linguaggio degli altri due
// (REQ-MAG-031): una spesa segnata comprata ma senza prezzo pesa zero sul
// mese, e nessuno se ne accorge finché non si confrontano i totali. Su una
// riga ancora da comprare invece il prezzo a zero è la normalità — il foglio
// è pieno di righe non ancora prezzate — e segnalarla insegnerebbe a
// ignorare il segnale.
export const speseSenzaPrezzo = (spese) =>
  speseComprate(spese).filter((s) => totaleSpesa(s) <= 0)

// Una spesa comprata ma senza data non ha mese, e quindi non entra in nessuna
// riga del riepilogo: si vede a parte, come il buco che è.
export const speseSenzaData = (spese) => speseComprate(spese).filter((s) => !meseSpesa(s))

// I due totali della sottosezione: quello che è uscito davvero e quello che
// costerebbe la lista se la si comprasse tutta. Il secondo NON è una spesa —
// è la stima di un promemoria — e sta scritto qui perché a schermo i due
// numeri non si devono poter confondere.
export function totaliSpese(spese) {
  let comprato = 0
  let daComprare = 0
  for (const s of spese || []) {
    if (spesaComprata(s)) comprato += totaleSpesa(s)
    else daComprare += totaleSpesa(s)
  }
  return { comprato, daComprare }
}

// Il totale delle spese comprate, mese per mese. È il numero che il
// Riepilogo mette accanto alla merce, e che Bilancio → Mesi userà per il
// netto (REQ-CASSA-012).
export function spesePerMese(spese) {
  const per = new Map()
  for (const s of speseComprate(spese)) {
    const mese = meseSpesa(s)
    if (!mese) continue
    per.set(mese, (per.get(mese) || 0) + totaleSpesa(s))
  }
  return per
}

export const totaleSpeseDelMese = (spese, mese) => spesePerMese(spese).get(mese) || 0
