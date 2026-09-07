// ── «IN ASSORTIMENTO» È UNO STATO DI PASSAGGIO (REQ-MAG-037) ─────────
//
// Qui sta la macchina degli stati del prodotto, e sta in logica pura per
// una ragione precisa: se sbaglia, sbaglia in silenzio sui dati veri di
// tutto il magazzino, un ordine per volta, e nessuno se ne accorge finché
// la classificazione di Flavio non è sparita.
//
// I VERI STATI COMMERCIALI SONO TRE: in linea, premium, fuori linea.
// «In assortimento» è uno stato SUPERIORE e TEMPORANEO che prende il posto
// di «in linea» o «premium» mentre c'è un ordine aperto, e alla fine
// RESTITUISCE quello di prima. Da qui la regola che governa tutto il file:
//
//   IL PRODOTTO DEVE RICORDARE DA DOVE VIENE.
//
// Senza quella memoria un premium tornerebbe indietro come un prodotto
// qualunque, e la classificazione si cancellerebbe da sola.
//
// DOVE VIVE LA MEMORIA, sul documento del prodotto:
//   `assortimento_da`       → lo stato a cui tornare ('linea' | 'premium' |
//                             'out'); assente su tutto quello che c'è già.
//   `ordini_assortimento`   → gli id degli ordini aperti che ce l'hanno
//                             dentro. Vuoto = «in assortimento SENZA
//                             ORDINE», che è lo stato messo a mano.
//
// È UNA LISTA E NON UN ID SOLO perché lo stesso prodotto può finire in due
// giri diversi (due ordini aperti, a due fornitori): si esce quando non
// resta più nessun ordine, se no il primo che arriva spegnerebbe lo stato
// mentre l'altra merce è ancora per strada.
//
// SE LA MEMORIA MANCA NON SI INVENTA NIENTE. Un prodotto che era
// 'assortimento' da prima di questa voce — e sono la metà del magazzino,
// perché 'assortimento' era il DEFAULT — non ha nessuno stato di prima da
// restituire: uscendo dall'ordine resta dov'è. Meglio fermo che promosso a
// caso.

import { assortimentoDi } from './inventory.js'

export const IN_ASSORTIMENTO = 'assortimento'

// I tre veri stati commerciali, in ordine di attenzione richiesta.
export const STATI_COMMERCIALI = ['linea', 'premium', 'out']

// Quelli da cui si può passare in assortimento per un ordine: «il prodotto
// DEVE essere in linea o premium» — un `out` è fuori linea e non lo si sta
// rifornendo.
export const STATI_CHE_ENTRANO = ['linea', 'premium']

// Gli ordini aperti che tengono dentro questo prodotto.
export function ordiniDiAssortimento(item) {
  const lista = item?.ordini_assortimento
  return Array.isArray(lista) ? lista.filter(Boolean) : []
}

// Lo stato a cui tornare, se il prodotto se lo ricorda.
export function statoDaRestituire(item) {
  const da = item?.assortimento_da
  return STATI_COMMERCIALI.includes(da) ? da : null
}

export const inAssortimento = (item) => assortimentoDi(item) === IN_ASSORTIMENTO

// IN ASSORTIMENTO PERCHÉ C'È UN ORDINE APERTO: è la merce che sta
// arrivando, ed è questo che Flavio vuole vedere a colpo d'occhio.
export const inAssortimentoConOrdine = (item) =>
  inAssortimento(item) && ordiniDiAssortimento(item).length > 0

// IN ASSORTIMENTO SENZA ORDINE: lo stato messo a mano dal magazzino.
// «Internamente sarà tipo in assortimento senza ordine, e anche in quel
// caso verrà preso in considerazione come un prodotto sotto soglia nella
// precompilazione dell'ordine» (utente, 27/08).
//
// SI RICONOSCE DALLA MEMORIA, e non dal solo stato: 'assortimento' è stato
// il valore di DEFAULT di ogni prodotto nato senza dichiarare niente — 65
// prodotti su 150 nella prima pagina del magazzino vero. Se bastasse lo
// stato, mezzo magazzino risulterebbe «messo a mano da Flavio» e si
// ritroverebbe preselezionato al primo ordine. Chi lo sceglie davvero
// scrive anche da dove veniva, e quella è la firma.
export const inAssortimentoAMano = (item) =>
  inAssortimento(item) && ordiniDiAssortimento(item).length === 0 && !!statoDaRestituire(item)

// ── SI ENTRA SOLO ALLA CONFERMA DELL'ORDINE ──────────────────────────
//
// «Va in assortimento SOLO DOPO CHE FLAVIO HA CREATO L'ORDINE, o solo se lo
// imposta manualmente, mi raccomando» (utente, 27/08). Non la giacenza
// sotto soglia, non la spunta in tabella, non l'aver aperto la schermata:
// la spunta porta il prodotto nel riepilogo e lì si ferma.
//
// Torna la patch da scrivere sul prodotto, oppure `null` se non cambia
// niente (un `out`, o un ordine già segnato).
export function entraInAssortimento(item, orderId) {
  if (!item || !orderId) return null
  const ordini = ordiniDiAssortimento(item)
  if (ordini.includes(orderId)) return null
  const attuale = assortimentoDi(item)
  if (attuale === IN_ASSORTIMENTO) {
    // Già in assortimento — messo a mano, o da un altro ordine ancora
    // aperto: si aggiunge solo l'ordine, e la memoria non si tocca. Se non
    // ce n'era (il vecchio default), non se ne inventa una.
    return { ordini_assortimento: [...ordini, orderId] }
  }
  if (!STATI_CHE_ENTRANO.includes(attuale)) return null
  return {
    status: IN_ASSORTIMENTO,
    assortimento_da: attuale,
    ordini_assortimento: [...ordini, orderId],
  }
}

// ── SI ESCE PER DUE SOLE STRADE ──────────────────────────────────────
//
// 1) l'ordine arriva (passa a consegnato); 2) si toglie l'item
// dall'ordine, anche se già fatto. Tutte e due passano di qui.
//
// SEMPRE LO STATO DI PRIMA, SENZA GUARDARE LA GIACENZA: «torna in linea o
// premium ma con scorte in esaurimento» (utente, 27/08). Sono due assi
// diversi — lo stato dice che posto ha il prodotto nel locale, la scorta
// dice se ce n'è abbastanza — e che le scorte siano basse lo dice già la
// scorta. Legare l'uscita alla soglia farebbe sparire l'informazione «sta
// arrivando altra merce» proprio quando serve.
//
// E IL CARICO A MANO NON C'ENTRA: alzare la giacenza dal magazzino non
// tocca lo stato, perché l'ordine dal fornitore è ancora per strada.
export function esceDaAssortimento(item, orderId) {
  if (!item || !orderId) return null
  const ordini = ordiniDiAssortimento(item)
  if (!ordini.includes(orderId)) return null
  const resto = ordini.filter((x) => x !== orderId)
  // Un altro ordine aperto tiene ancora il prodotto in assortimento: si
  // esce quando non ne resta nessuno.
  if (resto.length > 0) return { ordini_assortimento: resto }
  const da = statoDaRestituire(item)
  // Stato cambiato a mano nel frattempo, o memoria che non c'è (i prodotti
  // scritti prima di questa voce): si liberano i campi e lo stato resta
  // quello che è. Non si promuove niente a indovinare.
  if (!inAssortimento(item) || !da) return { assortimento_da: null, ordini_assortimento: [] }
  return { status: da, assortimento_da: null, ordini_assortimento: [] }
}

// ── A MANO SI PUÒ, MA COSTA UNA DOMANDA ──────────────────────────────
//
// «Bisogna fargli presente che se lo imposta bisogna associarlo anche a un
// ordine» e «se cambia lo stato manualmente, il prodotto va eliminato
// dall'ordine» (utente, 27/08). Le due cose sono la stessa decisione presa
// dai due capi e non possono divergere: un prodotto non più «in
// assortimento» che resta dentro un ordine aperto è un ordine che nessuno
// sa più di aver fatto.
//
// Qui si scrive solo la patch del PRODOTTO. Chi la chiama deve anche
// toglierlo dagli ordini che `ordiniDiAssortimento` elenca — sono quelli
// che l'avviso a schermo ha appena nominato.
export function cambioAMano(item, nuovo) {
  const attuale = assortimentoDi(item)
  if (nuovo !== IN_ASSORTIMENTO && !STATI_COMMERCIALI.includes(nuovo)) return null
  if (nuovo === attuale) return null
  if (nuovo === IN_ASSORTIMENTO) {
    // Messo a mano: la memoria dice da dove veniva, così se poi ci finisce
    // dentro un ordine e l'ordine arriva, torna al suo posto.
    return {
      status: IN_ASSORTIMENTO,
      assortimento_da: STATI_COMMERCIALI.includes(attuale) ? attuale : null,
      ordini_assortimento: ordiniDiAssortimento(item),
    }
  }
  return { status: nuovo, assortimento_da: null, ordini_assortimento: [] }
}

// Il cambio a mano tocca un ordine aperto? È la domanda che fa comparire
// l'avviso nel magazzino: si risponde col solo prodotto in mano, senza
// andare a leggere gli ordini.
export function cambioDaAvvisare(item, nuovo) {
  const ordini = ordiniDiAssortimento(item)
  if (ordini.length === 0) return null
  if (nuovo === assortimentoDi(item)) return null
  // A rompere il legame è USCIRE dall'assortimento: chi ci resta dentro non
  // toglie niente da nessun ordine.
  if (!STATI_COMMERCIALI.includes(nuovo)) return null
  return ordini
}
