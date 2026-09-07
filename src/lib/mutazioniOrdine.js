'use strict'

// ── UNA MUTAZIONE PER VOLTA, PER CONTO ───────────────────────────────
//
// Il guaio, parole di chi stava al banco: «ho creato un ordine, ho
// aggiunto velocemente item, ma ha sincronizzato e mi ha lasciato solo il
// primo item» (20/08). E, dallo stesso giro: due comande separate per lo
// stesso conto.
//
// LA CAUSA. Ogni mutazione di un conto — aggiungere una comanda,
// correggerne le righe, farla avanzare — LEGGE il documento, ricompone
// l'array `comande` e lo RISCRIVE INTERO: Firestore un array lo riscrive
// intero, non esiste un percorso tipo `comande.2.items`. Due gesti
// ravvicinati sullo stesso conto partono insieme: il secondo legge PRIMA
// che la scrittura del primo sia comparsa in cache, quindi compone dal
// passato, e l'ultimo che scrive cancella l'altro. Battendo in fretta si
// perde una riga, o nascono due «comanda 2» che si sovrascrivono.
//
// LA CURA, due pezzi che stanno insieme.
//
// (1) LE MUTAZIONI DI UNO STESSO CONTO SI METTONO IN FILA. Una catena di
//     promesse per `orderId` — la stessa idea della coda di stampa
//     (BUG-052): il turno di ognuna comincia quando il precedente ha
//     finito. Conti DIVERSI non si aspettano fra loro: al banco si lavora
//     su più conti insieme e non devono farsi la coda a vicenda.
//
// (2) LA FILA NON BASTA, e questo è il punto meno ovvio. Il turno finisce
//     quando la scrittura è PARTITA (local-first: non si aspetta niente),
//     non quando la cache l'ha applicata — e fra le due cose ci passa un
//     giro. Quindi ogni mutazione, oltre a scrivere, RICORDA qui il conto
//     come lo ha appena composto; la mutazione dopo legge quello invece
//     della cache, finché la cache non ha recuperato. È la stessa regola
//     di `ordineDopo` in api.js — «quello che abbiamo appena scritto non
//     si va a chiedere, lo sappiamo già» — solo che qui serve alla
//     mutazione seguente invece che alla schermata.
//
// COME SI CAPISCE CHE LA CACHE HA RECUPERATO: si guarda se i campi che
// abbiamo scritto sono tornati indietro uguali. Nessun timer, nessuna
// scadenza a indovinare: appena la cache racconta la stessa cosa, la
// memoria si butta e si torna a leggere il documento vero — che è anche
// l'unico che sa cos'hanno fatto gli ALTRI terminali.
//
// IL LIMITE, dichiarato: finché la memoria è viva, una modifica arrivata
// da un altro terminale sugli stessi campi si perde. È la finestra fra la
// scrittura e la cache — millisecondi — ed è lo stesso «l'ultimo che
// scrive vince» che c'era già, ristretto invece che allargato.

// orderId -> { coda, attive, memoria, patch }
const catene = new Map()

// Quanti conti si tengono a mente. Ce ne sono in ballo pochi per volta: il
// tetto serve solo perché una scrittura che non arriva MAI in cache (il
// documento cancellato sotto, un rifiuto definitivo) non lasci il suo
// ricordo lì per tutta la serata.
const MAX_CONTI = 50

// PER QUANTO SI RICORDA, AL MASSIMO. Non è il meccanismo — quello è il
// confronto con la cache, che si accorge da sé quando la scrittura è
// arrivata, di solito in millisecondi. È la rete di sicurezza per la
// scrittura che in cache non arriverà MAI (documento cancellato sotto,
// rifiuto definitivo): senza, quel conto resterebbe composto per tutta la
// serata su una versione che non esiste da nessuna parte. Due secondi sono
// venti volte il tempo che ci mette la cache: nel caso normale scade la
// memoria di un conto che nessuno sta più toccando.
export const VITA_MEMORIA = 2000

function nodo(orderId) {
  let n = catene.get(orderId)
  if (!n) {
    n = { coda: Promise.resolve(), attive: 0, memoria: null, patch: null, at: 0 }
    catene.set(orderId, n)
    if (catene.size > MAX_CONTI) {
      // Il più vecchio inserito: le Map iterano in ordine di inserimento.
      for (const [id, v] of catene) {
        if (id !== orderId && v.attive === 0) {
          catene.delete(id)
          break
        }
      }
    }
  }
  return n
}

function forse(v) {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

// La cache racconta già quello che abbiamo scritto? Si confrontano solo i
// campi della nostra patch: se un altro terminale ha cambiato ALTRO, per
// noi la scrittura è arrivata lo stesso — e il documento vero è più fresco
// del nostro ricordo, quindi si prende quello.
function patchApplicata(dati, patch) {
  if (!dati || !patch) return true
  for (const k of Object.keys(patch)) {
    if (forse(dati[k]) !== forse(patch[k])) return false
  }
  return true
}

// Il lavoro gira nel turno di questo conto: comincia quando il precedente
// ha finito. Se il precedente è fallito, il turno parte lo stesso — un
// errore non deve tappare la fila per il resto della serata.
export function inCodaOrdine(orderId, lavoro) {
  if (!orderId) return Promise.resolve().then(lavoro)
  const n = nodo(orderId)
  n.attive += 1
  const turno = n.coda.then(lavoro)
  n.coda = turno.then(
    () => {},
    () => {}
  )
  const fine = () => {
    n.attive -= 1
    // Nessuno in fila e niente da ricordare: il conto esce dalla mappa.
    if (n.attive === 0 && !n.memoria) catene.delete(orderId)
  }
  turno.then(fine, fine)
  return turno
}

// QUELLO CHE ABBIAMO APPENA COMPOSTO. `dati` è il documento come sarà
// (cur + patch), `patch` i campi che stanno andando al server: servono per
// riconoscere, alla prossima lettura, che la cache ha recuperato.
export function ricordaOrdine(orderId, dati, patch) {
  if (!orderId || !dati) return
  const n = nodo(orderId)
  n.memoria = dati
  n.at = Date.now()
  // I PERCORSI COL PUNTO NON SI CONFRONTANO. Firestore accetta patch tipo
  // `status_times.pagato`: sul documento quel valore finisce ANNIDATO, non
  // in una chiave che si chiama così. Cercarla in cache non la troverebbe
  // mai, e il ricordo non se ne andrebbe più. Per capire se la scrittura è
  // arrivata bastano gli altri campi, che partono nella stessa patch.
  const confrontabili = {}
  for (const [k, v] of Object.entries(patch || {})) {
    if (!k.includes('.')) confrontabili[k] = v
  }
  n.patch = { ...(n.patch || {}), ...confrontabili }
}

// La lettura di una mutazione passa da qui: se la cache non ha ancora
// applicato quello che abbiamo scritto, si legge il ricordo. Restituisce
// uno snapshot della stessa forma di quello di Firestore — chi lo riceve
// non deve sapere da dove viene.
export function ordineRicordato(orderId, snap) {
  const n = catene.get(orderId)
  if (!n || !n.memoria) return snap
  const dati = snap?.exists?.() ? snap.data() : null
  // Arrivata in cache, o troppo vecchia per fidarsene: si torna al
  // documento vero, che è anche l'unico che sa cos'hanno fatto gli altri.
  if ((dati && patchApplicata(dati, n.patch)) || Date.now() - (n.at || 0) > VITA_MEMORIA) {
    scordaOrdine(orderId)
    return snap
  }
  const memoria = n.memoria
  return { exists: () => true, id: orderId, data: () => memoria }
}

export function scordaOrdine(orderId) {
  const n = catene.get(orderId)
  if (!n) return
  n.memoria = null
  n.patch = null
  if (n.attive === 0) catene.delete(orderId)
}

// Solo per i test: fra una prova e l'altra il banco è nuovo.
export function _azzeraMutazioni() {
  catene.clear()
}
