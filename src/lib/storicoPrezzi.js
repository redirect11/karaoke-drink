// ── LO STORICO DEI PREZZI DI LISTINO (REQ-MAG-035) ───────────────────
//
// La riga di listino (`supplier_prices`) tiene UN prezzo solo: ogni
// aggiornamento cancella quello di prima. Finché è così, «quanto è
// aumentato il Campari da gennaio» non ha dove leggersi — ed è la domanda
// da cui nasce il grafico che Flavio ha chiesto.
//
// Qui c'è la forma di una VARIAZIONE: prezzo, data e DA DOVE VIENE. Il
// grafico è un'altra voce e non esiste ancora; il dato si scrive lo stesso,
// perché uno storico non si ricostruisce all'indietro e ogni settimana
// senza è persa per sempre.
//
// Firebase non c'è apposta: chi decide se un prezzo è cambiato e come si
// chiama quella variazione sono conti, e vanno provati senza database.

// DA DOVE VIENE UN PREZZO, e non è un dettaglio: un numero battuto a mano
// è un'aspettativa, un numero preso da un documento fiscale è quello che si
// è pagato davvero. Mescolarli in un grafico racconterebbe una storia
// falsa, quindi la provenienza si scrive insieme al prezzo e non si ricava
// dopo.
export const ORIGINI_PREZZO = ['manuale', 'consegna', 'fattura']

export const ETICHETTA_ORIGINE = {
  manuale: 'compilato a mano',
  consegna: 'corretto alla consegna',
  fattura: 'allineato da una fattura',
}

// Un'origine sconosciuta vale «manuale»: è la più debole delle tre, e
// attribuire a una fattura un prezzo che nessuno sa da dove viene
// darebbe peso a un dato che non ce l'ha.
export const origineDi = (variazione) =>
  ORIGINI_PREZZO.includes(variazione?.origine) ? variazione.origine : 'manuale'

// L'id è DETERMINISTICO — coppia più istante — come quello della riga di
// listino. Serve alla ripetizione delle scritture in sottofondo: una
// scrittura fallita si riprova con la stessa chiamata, e con un id casuale
// il secondo tentativo lascerebbe due variazioni identiche nello storico.
export function idVariazionePrezzo(supplierId, itemId, quando) {
  if (!supplierId || !itemId || !quando) return null
  return `${supplierId}__${itemId}__${quando}`
}

// I prezzi si confrontano AL CENTESIMO. In virgola mobile 12.5 e 12.50
// possono non essere lo stesso numero, e lo storico si riempirebbe di
// variazioni che nessuno ha fatto — proprio il rumore che rende inutile un
// grafico.
const centesimi = (v) => {
  // Il campo svuotato arriva come `''`, e `Number('')` fa zero: senza questa
  // riga «ho tolto il prezzo» diventerebbe «costa zero», che è un'altra cosa
  // e finirebbe sul grafico.
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

// Cosa conta come variazione da registrare. Un prezzo che sparisce (campo
// svuotato) non è un prezzo: non c'è niente da mettere sul grafico, e
// scriverci uno zero direbbe che quel fornitore regala la merce.
export function prezzoCambiato(prima, dopo) {
  const b = centesimi(dopo)
  if (b == null) return false
  return centesimi(prima) !== b
}

// La variazione da scrivere, o `null` se non è successo niente. Torna
// `null` anche senza coppia o senza data: uno storico appeso a un prodotto
// che non si sa quale sia non serve a nessuno.
export function variazioneDiPrezzo({
  supplier_id,
  item_id,
  price,
  prezzo_prima = null,
  origine = 'manuale',
  quando,
}) {
  const id = idVariazionePrezzo(supplier_id, item_id, quando)
  if (!id) return null
  if (!prezzoCambiato(prezzo_prima, price)) return null
  return {
    id,
    supplier_id,
    item_id,
    price: Number(price),
    // Il prezzo di prima sta SULLA RIGA, e non si ricava ordinando la
    // collezione: chi legge una variazione da sola deve poter dire di
    // quanto è salita. La prima volta non c'è, e va detto con `null`
    // invece che con uno zero — «prima costava zero» sarebbe falso.
    previous_price: centesimi(prezzo_prima) == null ? null : Number(prezzo_prima),
    origine: ORIGINI_PREZZO.includes(origine) ? origine : 'manuale',
    // La data è quella del terminale, come per le comande: serve un ordine
    // fra le variazioni anche quando la rete non c'è.
    at: quando,
  }
}

// Le variazioni di una coppia, DALLA PIÙ RECENTE. È l'ordine in cui si
// legge uno storico: la domanda è «quanto costa adesso, e quanto costava
// prima», non il contrario.
export function storicoDiCoppia(variazioni, supplierId, itemId) {
  return (variazioni || [])
    .filter((v) => v?.supplier_id === supplierId && v?.item_id === itemId)
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
}

export function ultimaVariazione(variazioni, supplierId, itemId) {
  return storicoDiCoppia(variazioni, supplierId, itemId)[0] ?? null
}

// Le ultime variazioni di TUTTE le coppie, in una mappa `item_id`: la
// schermata del listino ne mostra una per riga, e cercarle una per una in
// un elenco che cresce a ogni consegna vorrebbe dire ripassarlo per intero
// a ogni riga.
export function ultimeVariazioniPerArticolo(variazioni, supplierId) {
  const mappa = new Map()
  for (const v of variazioni || []) {
    if (v?.supplier_id !== supplierId || !v?.item_id) continue
    const gia = mappa.get(v.item_id)
    if (!gia || String(v.at || '') > String(gia.at || '')) mappa.set(v.item_id, v)
  }
  return mappa
}
