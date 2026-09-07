// ── GLI STATI DELL'ORDINE FORNITORE (REQ-MAG-038) ────────────────────
//
// «Richiesto, consegnato, pagato RIMANGONO per ordine per fornitore, non
// vanno via completamente, mi raccomando» (utente, 27/08/2026). Con un
// ordine per fornitore (REQ-MAG-037) il livello per RIGA non serve più a
// distinguere consegne diverse: i tre livelli cambiano di posto, e il posto
// giusto è il documento.
//
// Qui c'è la macchina degli stati, in logica pura: se sbaglia, sbaglia sui
// numeri che a fine mese vanno dal commercialista.
//
// ── DUE ASSI, NON UNA FILA SOLA ──────────────────────────────────────
//
// È la decisione che regge tutto il file, ed è presa in implementazione
// leggendo il requisito fino in fondo. Sembrano cinque stati in fila
// (bozza → richiesto → consegnato → pagato → chiuso) ma non lo sono:
//
//   IL CICLO DELLA MERCE  bozza → richiesto → consegnato   (lo sa l'ordine)
//   IL PAGAMENTO          da pagare / pagato               (lo sa la FATTURA)
//   LA CHIUSURA           aperto / chiuso                  (un gesto a parte)
//
// Metterli in fila vorrebbe dire che un ordine pagato in anticipo — una
// proforma saldata prima che parta il camion — smetterebbe di risultare
// «richiesto», e la merce che non è mai arrivata non la cercherebbe più
// nessuno. Succede, e non è un caso di scuola: si paga per non far
// aspettare il fornitore.
//
// Quindi a schermo si legge lo stato della merce COME BADGE e il pagamento
// ACCANTO; il filtro invece è uno solo, e ogni voce fa la sua domanda
// all'asse che la riguarda (`ordineNelFiltro`).
//
// ── «PAGATO» NON È UN DATO DELL'ORDINE ───────────────────────────────
//
// «Il discorso degli ordini pagati è già nello scadenzario» (utente,
// 27/08). Sta scritto in un posto solo — `paid` sulla fattura — che è anche
// dove stanno il tasto, il filtro «solo da pagare» e il totale «Da pagare».
// Chi paga, paga un DOCUMENTO: il bonifico porta sopra il numero della
// fattura, non quello dell'ordine. Due copie dello stesso stato divergono
// sempre, e il giorno che divergono il totale del mese smette di valere
// qualcosa. Qui infatti non si legge nessun campo dell'ordine: si chiede
// alla fattura.
//
// ── «CONSEGNATO» E «ORDINE RICEVUTO» SONO LA STESSA COSA ─────────────
//
// «È solo estetica, parole — il concetto è lo stesso» (utente, 27/08). A
// schermo se ne usa UNA sola, sempre la stessa, in tutte le schermate: due
// nomi per lo stesso stato fanno cercare a chi legge una differenza che non
// c'è. La parola scelta è CONSEGNATO, ed è quella che ETICHETTA_STATO
// scrive ovunque.

import { livelloDelGruppo } from './listini.js'

// Il ciclo della merce, in ordine. «Chiuso» non è qui: è un gesto a parte,
// e un ordine chiuso resta consegnato.
export const STATI_ORDINE = ['bozza', 'richiesto', 'consegnato']

export const ETICHETTA_STATO = {
  bozza: 'Bozza',
  richiesto: 'Richiesto',
  consegnato: 'Consegnato',
  chiuso: 'Chiuso',
  pagato: 'Pagato',
}

// ── COME LO STATO STA SCRITTO SUL DOCUMENTO ──────────────────────────
//
// Sul documento il campo si chiama `status` e i suoi valori sono quelli che
// stanno già in archivio: 'inviato' e 'ricevuto'. Non si rinominano — sono
// scritti su ordini veri, e una migrazione per cambiare due parole sarebbe
// il modo più caro di non guadagnare niente. La traduzione avviene qui,
// UNA VOLTA SOLA: dentro si legge come è scritto, fuori si dice come Flavio
// lo chiama. 'bozza' è l'unico valore nuovo, perché è uno stato nuovo.
const DAL_DOCUMENTO = { bozza: 'bozza', inviato: 'richiesto', ricevuto: 'consegnato' }
export const SUL_DOCUMENTO = { bozza: 'bozza', richiesto: 'inviato', consegnato: 'ricevuto' }

// Lo stato della merce. Un ordine scritto prima di questa voce può non avere
// `status`: si ricava dalle sue righe, come faceva `statoOrdine`. Un ordine
// di ieri non è una bozza per il fatto di non avere il campo.
export function statoOrdineDi(order) {
  const scritto = DAL_DOCUMENTO[order?.status]
  if (scritto) return scritto
  return livelloDelGruppo(order?.lines || []) === 'richiesto' ? 'richiesto' : 'consegnato'
}

export const eBozza = (order) => statoOrdineDi(order) === 'bozza'

// CHIUSO: il gesto in più, e si può fare solo a fattura riconciliata. La
// data sta sull'ordine perché la chiusura è dell'ordine — è lui a dire che
// quei tre elenchi tornano.
export const ordineChiuso = (order) => !!order?.closed_at

// PAGATO: la domanda si fa alla fattura, e senza fattura non ha risposta.
// Un ordine senza documento collegato non è «da pagare»: è un ordine di cui
// non si sa niente, e va detto così invece che darlo per non pagato.
export const ordinePagato = (order, fattura) => !!fattura?.paid

// ── IL FILTRO DELLA LISTA ORDINI ─────────────────────────────────────
//
// «Lo storico di tutti gli ordini fatti, filtrabile per STATO dell'ordine».
// Una voce sola accesa per volta, come i chip della coda: sono domande
// diverse fatte a assi diversi, e sommarle non vorrebbe dire niente.
export const FILTRI_ORDINE = [
  { id: 'tutti', label: 'Tutti' },
  { id: 'bozza', label: 'Bozze' },
  { id: 'richiesto', label: 'Richiesti' },
  { id: 'consegnato', label: 'Consegnati' },
  { id: 'da_pagare', label: 'Da pagare' },
  { id: 'pagato', label: 'Pagati' },
  { id: 'chiuso', label: 'Chiusi' },
]

// «DA PAGARE» ESCLUDE LE BOZZE, e non è una sottigliezza: una bozza non è
// stata mandata a nessuno, quindi nessuno la fatturerà — comparire fra i
// debiti la farebbe sembrare un conto in sospeso.
export function ordineNelFiltro(order, fattura, filtro) {
  switch (filtro) {
    case 'bozza':
    case 'richiesto':
    case 'consegnato':
      return statoOrdineDi(order) === filtro
    case 'pagato':
      return ordinePagato(order, fattura)
    case 'da_pagare':
      return !eBozza(order) && !ordinePagato(order, fattura)
    case 'chiuso':
      return ordineChiuso(order)
    default:
      return true
  }
}

// Quanti ordini per ogni voce del filtro: il numero sta sul chip, perché
// «quanti me ne restano da pagare» è la domanda, e contarli scorrendo
// venticinque ordini è il modo in cui non ci si risponde.
export function contaFiltri(ordini, fatturaDi) {
  const conta = {}
  for (const f of FILTRI_ORDINE) {
    conta[f.id] = (ordini || []).filter((o) =>
      ordineNelFiltro(o, fatturaDi?.(o) ?? null, f.id)
    ).length
  }
  return conta
}

// ── LA STORIA DELL'ORDINE ────────────────────────────────────────────
//
// «Serve una LISTA DEI MOVIMENTI fatti per quell'ordine, una specie di
// history, se l'ordine è già stato confermato ma Flavio fa delle modifiche»
// (utente, 27/08).
//
// PERCHÉ SI SCRIVE INVECE DI RICOSTRUIRLA. La storia di un conto
// (`storiaOrdine.js`) si ricava da quello che il conto porta già addosso;
// qui no. Una riga tolta da un ordine non lascia traccia — la riga non c'è
// più — e una quantità corretta all'arrivo cancella quella di prima. Quello
// che non si scrive nel momento in cui succede non si ricostruisce dopo, e
// un ordine mandato al fornitore che poi cambia diventa un documento che non
// corrisponde più a niente.
//
// Sta in un array sul documento e non in una collezione a parte: un ordine
// ha una decina di movimenti in tutto, e si scrive nella stessa `updateDoc`
// che tocca le righe — una scrittura sola non può restare indietro a metà.
export const MOVIMENTI = [
  'creato',
  'bozza',
  'confermato',
  'consegnato',
  'riga_tolta',
  'quantita',
  'prezzo',
  'fattura_collegata',
  'fattura_scollegata',
  'fattura_generata',
  'prezzi_allineati',
  'chiuso',
  // LA CORREZIONE DI UN DOCUMENTO (REQ-MAG-041). È l'unico movimento che non
  // si scrive sull'ordine ma SUL DOCUMENTO, nel suo `storia`, e il posto è
  // quello giusto: un documento dello scadenzario può non avere nessun ordine
  // dietro — è uno dei due buchi di REQ-MAG-031 — e la sua correzione
  // resterebbe senza traccia proprio nei casi in cui non c'è nient'altro che
  // la spieghi. Il meccanismo però è lo stesso e si riusa invece di
  // scriverne un secondo: un array sul documento, `movimento`/`conMovimento`
  // per metterci una voce, `descriviMovimento` per leggerla.
  'documento_corretto',
]

// Una voce di storia. La data è quella del terminale, come per le comande:
// serve un ordine fra i movimenti anche con la rete staccata, e
// `serverTimestamp()` dentro un array Firestore non lo accetta comunque.
export function movimento(tipo, dettaglio = null, quando = null) {
  if (!MOVIMENTI.includes(tipo)) return null
  return { at: quando || new Date().toISOString(), tipo, ...(dettaglio ? { dettaglio } : {}) }
}

// La storia di un ordine, sempre un array: gli ordini scritti prima di
// questa voce non ce l'hanno, e non è un errore.
export const storiaDi = (order) => (Array.isArray(order?.storia) ? order.storia : [])

// La storia con in cima il movimento nuovo. Si compone — non si rilegge —
// perché la scrittura parte in sottofondo (BUG-045).
export function conMovimento(order, voce) {
  if (!voce) return storiaDi(order)
  return [...storiaDi(order), voce]
}

const euro = (v) => `${(Number(v) || 0).toFixed(2).replace('.', ',')} €`

// Come si legge un movimento. Frase piana, al passato, senza gergo: chi
// guarda uno storico vuole sapere cosa è successo, non come si chiama il
// campo.
export function descriviMovimento(v) {
  const d = v?.dettaglio || {}
  switch (v?.tipo) {
    case 'creato':
      return `Ordine creato${d.righe ? ` · ${d.righe} righe` : ''}`
    case 'bozza':
      return `Salvato come bozza${d.righe ? ` · ${d.righe} righe` : ''}`
    case 'confermato':
      return 'Ordine mandato al fornitore'
    case 'consegnato':
      return `Merce ricevuta${d.righe ? ` · ${d.righe} righe caricate` : ''}`
    case 'riga_tolta':
      return `Tolto dall’ordine: ${d.nome || 'un prodotto'}`
    case 'quantita':
      return `${d.nome || 'Un prodotto'}: ricevuti ${d.a} invece di ${d.da}`
    case 'prezzo':
      return `${d.nome || 'Un prodotto'}: prezzo da ${euro(d.da)} a ${euro(d.a)}`
    case 'fattura_collegata':
      return `Documento collegato${d.numero ? ` · n. ${d.numero}` : ''}`
    case 'fattura_scollegata':
      return 'Documento scollegato'
    case 'fattura_generata':
      return `Documento generato dall’ordine${d.importo != null ? ` · ${euro(d.importo)}` : ''}`
    case 'prezzi_allineati':
      return `Listino allineato al documento${d.righe ? ` · ${d.righe} prezzi` : ''}`
    case 'chiuso':
      return 'Ordine chiuso: ordinato, ricevuto e fatturato tornano'
    // LE FRASI ARRIVANO GIÀ SCRITTE (`cambiFattura` in fatture.js), e non è
    // pigrizia: una correzione si rilegge mesi dopo, e l'importo formattato
    // nel momento in cui è successo resta leggibile anche se il formato
    // cambia. In più tiene questo file fuori dai tipi di documento.
    // «GIÀ PAGATO» SI DICE SEMPRE: è il caso da cui nasce la voce — «mi
    // devono modificare il prezzo di una fattura magari già pagata» — ed è
    // anche l'unico in cui la correzione va guardata due volte, perché
    // quei soldi sono già usciti.
    case 'documento_corretto': {
      const cambi = Array.isArray(d.cambi) ? d.cambi : []
      const cosa = cambi.map((c) => `${c.campo} da ${c.da} a ${c.a}`).join(' · ')
      return `Documento corretto${d.pagato ? ' (già pagato)' : ''}${cosa ? ` · ${cosa}` : ''}`
    }
    default:
      return 'Modifica'
  }
}
