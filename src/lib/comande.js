// Logica pura del modello Ordine (conto) / Comande (ticket).
//
// L'ORDINE è il conto: resta `aperto` quanto serve (anche giorni), si chiude solo
// con il pagamento (`pagato`) o con l'annullo (`annullato`).
// Ogni invio di articoli è una COMANDA: è la comanda ad avere il ciclo di
// lavorazione (ricevuto → in_preparazione → pronto → ritirato), come i
// kitchen ticket dei POS di ristorazione.
//
// DETTO IN UNA RIGA: gli stati del SERVIZIO riguardano le COMANDE, che fanno
// parte dell'ordine. L'ordine ha i suoi stati; le comande ne hanno dei
// SOTTOSTATI, che sono quelli del servizio. Se un conto è gestito come una
// comanda sola — e DI BASE è così, la comanda esce tutta per l'intero
// ordine — tutti i suoi drink si trovano sempre nello stesso passo. Succede
// il contrario solo quando il bartender divide la comanda per prepararne una
// parte: è la deroga, non la regola, e quasi tutto quello che c'è qui sotto
// esiste per farla tornare senza perdere niente per strada.
//
// E il pagamento non è uno di quei passi: un conto si incassa in qualunque
// stato di servizio. Dalla cassa è chiuso, dal banco magari no — una comanda
// può essere ancora in preparazione — e le due cose vanno dette insieme.

import { ORDER_STATUSES } from './orderStatus.js'
import { mergeLines } from './orderLines.js'

// Stati dell'ORDINE (conto).
export const ORDER_OPEN = 'aperto'

// Flusso di lavorazione della COMANDA.
export const COMANDA_FLOW = [
  ORDER_STATUSES.RICEVUTO,
  ORDER_STATUSES.IN_PREPARAZIONE,
  ORDER_STATUSES.PRONTO,
  ORDER_STATUSES.RITIRATO,
]

// ── IN CHE PASSO NASCE UNA COMANDA ──────────────────────────
//
// Di suo «da fare»: si battono tre conti di fila e poi si comincia a
// versare, ed è «Lo preparo io» a dire quando si comincia — e chi. Con le
// corsie il difetto si vedeva in faccia: «Da fare» restava sempre vuota e
// tutto compariva già al banco, cioè la colonna diceva una cosa falsa.
//
// Ma non tutti i locali lavorano così: dove si prepara nell'istante in cui
// si batte, quel passo è un tocco in più per ogni comanda, tutta la sera.
// Lo decide il locale («Le comande nascono già in preparazione»), e vale
// per tutte allo stesso modo: la prima di un conto nuovo e le aggiunte a
// metà serata. Prima erano due regole diverse scritte in due posti — il
// conto nasceva «da fare» e le aggiunte «in preparazione» — e nessuno
// l'aveva deciso: era rimasto così.
//
// È UNA FUNZIONE, E NON C'È NESSUNA COSTANTE DA COPIARE. Chi scrive la
// comanda e chi la disegna mentre la scrittura vola devono dire la stessa
// cosa, o la card cambia passo da sola un istante dopo esser comparsa. Con
// un valore esportato bastava che qualcuno domani scrivesse un
// «ricevuto» a mano da qualche parte: quella strada non avrebbe seguito
// l'impostazione, e non se ne sarebbe accorto nessuno. Passando di qui,
// l'impostazione o vale dappertutto o non vale da nessuna parte.
export function statoComandaNuova(settings) {
  return settings?.comande_in_preparazione === true
    ? ORDER_STATUSES.IN_PREPARAZIONE
    : ORDER_STATUSES.RICEVUTO
}

export function nextComandaStatus(status) {
  const idx = COMANDA_FLOW.indexOf(status)
  if (idx === -1 || idx === COMANDA_FLOW.length - 1) return null
  return COMANDA_FLOW[idx + 1]
}

// Una comanda è "chiusa" quando servita o annullata.
export function comandaDone(c) {
  return c.status === ORDER_STATUSES.RITIRATO || c.status === ORDER_STATUSES.ANNULLATO
}

// La comanda "attiva": quella AL PASSO PIÙ INDIETRO tra le aperte (a parità
// di passo, la più vecchia), o null. È lei a dare lo stato dell'ordine in
// coda: se su un conto con una comanda già "pronta" arriva un'aggiunta in
// preparazione, l'ordine TORNA "in preparazione" — c'è di nuovo lavoro al
// banco (il concetto richiesto: nuova aggiunta ⇒ si riparte a preparare).
export function activeComanda(order) {
  const aperte = (order?.comande || []).filter((c) => !comandaDone(c))
  if (aperte.length === 0) return null
  return aperte.reduce((best, c) =>
    COMANDA_FLOW.indexOf(c.status) < COMANDA_FLOW.indexOf(best.status) ? c : best
  )
}

// ── LO STATO DI LAVORO DI UN CONTO ───────────────────────
//
// È quello che la coda mostra e fa avanzare, e NON è un campo suo: si
// ricava dalle comande. Lo dà la comanda ATTIVA — quella al passo più
// indietro — perché è lì che c'è ancora lavoro. Pagato e annullato invece
// sono stati del CONTO, e vincono: i soldi presi non li rimette in
// discussione una comanda.
//
// Sta qui, e non nella lettura da Firestore, perché serve anche a chi lo
// ricalcola in locale: chi avanza un conto dalla coda vede subito l'esito,
// e deve vedere lo STESSO stato che scriverà il server un istante dopo.
export function statoDiLavoro(order) {
  const stato = order?.status
  if (stato === ORDER_STATUSES.PAGATO || stato === ORDER_STATUSES.ANNULLATO) return stato
  const attiva = activeComanda(order)
  if (attiva) return attiva.status
  // Nessuna comanda aperta: se ce n'erano, sono tutte uscite.
  return (order?.comande || []).length > 0 ? ORDER_STATUSES.RITIRATO : ORDER_STATUSES.RICEVUTO
}

// Un conto PAGATO risulta interamente servito: le comande ancora in
// lavorazione passano a 'ritirato' (le annullate restano annullate, le
// già servite non vengono toccate).
export function serveAllComande(comande, nowIso) {
  return (comande || []).map((c) =>
    c.status === ORDER_STATUSES.ANNULLATO || c.status === ORDER_STATUSES.RITIRATO
      ? c
      : {
          ...c,
          status: ORDER_STATUSES.RITIRATO,
          status_times: { ...(c.status_times || {}), [ORDER_STATUSES.RITIRATO]: nowIso },
        }
  )
}

// Riepilogo comande per le card della coda: attive / pronte / servite.
export function comandeSummary(order) {
  const comande = order?.comande || []
  let attive = 0
  let pronte = 0
  let servite = 0
  for (const c of comande) {
    if (c.status === ORDER_STATUSES.ANNULLATO) continue
    if (c.status === ORDER_STATUSES.RITIRATO) servite += 1
    else {
      attive += 1
      if (c.status === ORDER_STATUSES.PRONTO) pronte += 1
    }
  }
  return { attive, pronte, servite, totale: attive + servite }
}

// Tutte le comande servite (o annullate)? Un conto "completo" da incassare.
export function allServed(order) {
  const comande = (order?.comande || []).filter((c) => c.status !== ORDER_STATUSES.ANNULLATO)
  return comande.length > 0 && comande.every((c) => c.status === ORDER_STATUSES.RITIRATO)
}

export function orderIsOpen(order) {
  return order?.status === ORDER_OPEN
}

// Il conto ha contenuto? (almeno un item in una comanda non annullata)
export function orderHasContent(order) {
  return (order?.comande || []).some(
    (c) => c.status !== ORDER_STATUSES.ANNULLATO && (c.items || []).length > 0
  )
}

// Vista iniziale del dettaglio POS: se il conto ha già contenuto si apre
// sulle COMANDE (si vede subito cosa contiene); se è vuoto, sul menù.
export function initialDetailView(order) {
  return orderHasContent(order) ? 'comande' : 'menu'
}

export function orderIsClosed(order) {
  return order?.status === ORDER_STATUSES.PAGATO || order?.status === ORDER_STATUSES.ANNULLATO
}

// Aggregato item dell'ordine: somma gli item di tutte le comande non
// annullate (stesso drink su comande diverse → riga unica con qty sommata;
// gli item custom restano righe separate).
export function aggregateItems(comande) {
  const out = []
  const byDrink = new Map()
  for (const c of comande || []) {
    if (c.status === ORDER_STATUSES.ANNULLATO) continue
    for (const i of c.items || []) {
      if (!i.custom && i.drink_id && byDrink.has(i.drink_id)) {
        const ex = byDrink.get(i.drink_id)
        ex.qty += i.qty
      } else {
        const copy = { ...i }
        out.push(copy)
        if (!i.custom && i.drink_id) byDrink.set(i.drink_id, copy)
      }
    }
  }
  return out
}

// ── SUL TICKET DEL BANCO LE VOCI SONO SEMPRE ACCORPATE (BUG-083) ─────
//
// «Per la comanda, le voci devono essere sempre accorpate. Al momento, se
// sono separate escono separate, se sono unite escono unite. Devono essere
// sempre unite sulla comanda» (l'utente, 22/08/2026).
//
// PERCHÉ NON È UNA PREFERENZA. «Unisci / Separa uguali» sul conto serve ai
// SOLDI: si separano le righe per dividere il conto fra chi paga cosa. Chi
// prepara, invece, conta PEZZI — e quattro righe «1 JEFFERSON» una sotto
// l'altra si contano peggio di una «4 JEFFERSON». Sono due domande diverse
// sulla stessa lista, e la comanda risponde sempre alla seconda: sullo
// scontrino e nella schermata di pagamento non cambia niente.
//
// LA CHIAVE È QUELLA DEL POS (`lineSignature` in lib/orderLines.js), non una
// nuova: se «uguali» volesse dire una cosa a schermo e un'altra sulla carta,
// il banco riceverebbe un ticket che non corrisponde a quello che si vede.
// Distingue drink, nome, PREZZO, ricetta e NOTA — e sono le due che contano
// qui: un prodotto libero «Coperto 2€» e uno «Coperto 3€» restano due righe
// (stesso nome, prezzi diversi: sommarli direbbe una bugia su cosa è stato
// battuto), e soprattutto «poco ghiaccio» su due dei quattro Jefferson è
// LAVORO DIVERSO — accorparli farebbe sparire la nota, o la stamperebbe su
// tutti e quattro.
//
// STA IN comande.js e non in pagamento.js perché è una regola sul CONTENUTO
// di una comanda, non sul denaro: pagamento.js non deve nemmeno sapere che
// esiste — quella parte non cambia.
export function righeDellaComanda(items) {
  // La quantità si normalizza PRIMA di sommare: sui documenti vecchi (e
  // sugli item scritti a mano dagli script) `qty` può mancare, e la stampa
  // se la cavava con `qty || 1`. Sommando, un `undefined` diventerebbe NaN
  // e il ticket uscirebbe con «NaN NEGRONI».
  return mergeLines((items || []).map((i) => ({ ...i, qty: Math.max(1, Math.floor(Number(i.qty) || 1)) })))
}

// I PEZZI DA PREPARARE: il «CL: N» in cima al ticket. Si conta sulle righe
// già accorpate — la somma non cambia, accorpare sposta le quantità ma non
// ne crea né ne perde, e questa è esattamente la cosa che deve restare vera.
export function pezziDellaComanda(items) {
  return (items || []).reduce((s, i) => s + (Number(i.qty) || 1), 0)
}

// Totale drink dell'ordine (senza coperto/servizio/mancia).
export function itemsTotal(items) {
  return (items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_price ?? i.price) || 0), 0)
}

// Stati presenti tra le comande (campo derivato `comande_statuses` sul doc,
// usato dalle query array-contains: coda ETA cliente, tabellone pronti).
export function comandeStatuses(comande) {
  return [...new Set((comande || []).map((c) => c.status))]
}

// ── Vista aggregata dell'ordine (UX senza comande in vista) ────────────
// Il bartender lavora sull'ordine aggregato: gli AUMENTI diventano una nuova
// comanda (gestita internamente), le DIMINUZIONI toccano solo le comande
// ancora modificabili. Una comanda pronta o servita non si tocca più.

// Modificabile = non ancora pronta/servita/annullata.
// QUANDO UN CONTO È CHIUSO — cioè non c'è più niente da fare. Con gli stati
// del servizio servono DUE cose: incassato E servito. Un conto pagato in
// anticipo ma non ancora consegnato è lavoro ancora da fare, e sparire
// sarebbe il modo migliore per dimenticarselo. Senza gli stati del servizio
// il pagamento chiude e basta.
// La regola sta qui perché la usano in tre: la coda (chi resta a schermo),
// il riepilogo di testata (quanti aperti e quanti chiusi) e il magazzino
// (quali conti hanno ancora ingredienti in ballo). Quando stava scritta in
// tre posti, il magazzino contava fra gli aperti conti già incassati e
// dava numeri da paura.
export function contoChiuso(o, { workflowOn = false } = {}) {
  if (!o) return false
  if (o.status === ORDER_STATUSES.ANNULLATO || o.workflow_status === ORDER_STATUSES.ANNULLATO)
    return true
  const pagato =
    o.payment_status === 'pagato' ||
    o.status === ORDER_STATUSES.PAGATO ||
    o.workflow_status === ORDER_STATUSES.PAGATO
  const servito = allServed(o) || o.workflow_status === ORDER_STATUSES.RITIRATO
  return workflowOn ? pagato && servito : pagato
}

// QUANDO IL MAGAZZINO SI SCALA DAVVERO: A «PRONTO».
//
// È il momento in cui il fatto succede. A «pronto» il drink è FATTO — il
// gin è già nel bicchiere — e chi lo segna è chi lo ha fatto: il banco.
// «Servito» è un'altra cosa, è il drink arrivato al tavolo, e fra i due
// passi in magazzino non si muove più niente.
//
// Prima si scaricava al RITIRATO, e c'erano due guai. Uno di sostanza: si
// aspettava la consegna per registrare un consumo già avvenuto, e un drink
// pronto sul banco restava fra gli «impegnati» come se potesse ancora non
// farsi. Uno pratico, che è quello che ha portato qui: «servito» ormai lo
// segna la SALA — è lei che porta il vassoio — e la sala sul magazzino non
// scrive (le regole glielo negano, ed è giusto così). Lo scarico falliva in
// silenzio e il magazzino restava fermo (BUG-040). Spostandolo a «pronto»
// il difetto sparisce da sé, e non perché si sia allargato un permesso.
//
// Non si scala PRIMA — allo «in preparazione» — perché un drink iniziato e
// poi non fatto (riga tolta, cliente che cambia idea, comanda annullata)
// avrebbe già portato via gli ingredienti.
//
// Una volta sola: se lo scarico è già stato applicato non si ripete, ed è
// questa guardia che regge il pronto → indietro → pronto.
//
// Senza gli stati del servizio non esiste nessun «pronto»: lì le comande
// risultano servite alla riscossione, ed è lì che si scala (vedi
// unappliedEntries in api.js). Quella strada non cambia.
export function comandaDaScaricare(comanda, nuovoStato) {
  return nuovoStato === ORDER_STATUSES.PRONTO && comanda?.inventory_applied !== true
}

export function comandaEditable(c) {
  // Regge anche il niente: da quando la usa comandaDivisibile le arriva
  // qualunque cosa abbia in mano la schermata, comprese le comande che non
  // ci sono (una card in volo, un id che non risponde piu').
  return c?.status === ORDER_STATUSES.RICEVUTO || c?.status === ORDER_STATUSES.IN_PREPARAZIONE
}

// ── DOVE FINISCONO LE RIGHE AGGIUNTE A UN CONTO APERTO ────────────
//
// SOLO IN UNA COMANDA ANCORA «DA FARE», e in nessun'altra.
//
// «Se una comanda passa da "da fare" a "in preparazione", i prodotti
// successivi che aggiungo all'ordine dovranno creare una NUOVA comanda. Al
// momento succede solo se da in preparazione passano a da servire. Se sono
// in preparazione significa che la vecchia comanda è stata già presa in
// carico» (l'utente, 20/08 sera). Il perché sta in quell'ultima riga: chi
// sta già shakerando non deve vedersi allungare il ticket sotto le mani.
//
// POI HA VISTO IL DANNO E HA CORRETTO LA REGOLA (20/08, dopo la prova al
// banco: un conto solo, DUE facsimili — un LIMONCELLO da solo, e poi tutto
// il resto). Parole sue: «mi crea più comande quando creo un solo ordine.
// In fase di creazione deve gestire tutto come UNA comanda. Devi
// aggiungere prodotti a una NUOVA comanda solo se lo stato viene PASSATO
// in preparazione (comanda presa in carico)».
//
// DA QUI DUE COSE, e sono l'una il seguito dell'altra.
//
// (1) IL DISCRIMINE È LA PRESA IN CARICO, NON LO STATO. Una comanda NATA
//     «in preparazione» perché il locale ha acceso quell'impostazione non
//     è presa in carico da nessuno: nessuno l'ha guardata, nessuno ha
//     premuto niente. Una comanda PORTATA a «in preparazione» da un gesto
//     — qualcuno ha detto «lo preparo io» — sì. I due casi si distinguono
//     solo con un segno, ed è `presa_in_carico`, scritto da advanceComanda
//     e solo da lì (mai alla nascita). Sui documenti vecchi il campo non
//     c'è: lì si guarda lo stato con la regola prudente — «in
//     preparazione» senza segno vale come presa in carico, così i ticket
//     già in mano al banco stasera non si gonfiano.
//
// (2) LA SESSIONE DI CREAZIONE È UN'ALTRA COSA ANCORA. Finché chi ha
//     battuto il conto non è uscito dalla creazione, quella è UNA COMANDA
//     SOLA: qualunque stato abbia, qualunque impostazione abbia il locale.
//     «Se non sono ancora uscito dalla creazione ordine quella è sempre
//     una sola comanda (anche se da creazione ordine vado in pagamento)».
//     Il segno sta sul conto (`in_creazione`) e lo toglie l'uscita.
//
// L'ESCLUSIONE DI IERI SULLA COMANDA GIÀ STAMPATA (`auto_print_at`) NON C'È
// PIÙ: contraddiceva la regola nuova. La ragione per cui era nata resta
// vera — se una comanda già stampata si gonfia, la carta al banco è
// vecchia — e la cura coerente è un'altra: quando una comanda non presa in
// carico riceve aggiunte, il suo `auto_print_at` si AZZERA e il ticket si
// RISTAMPA completo. Il banco butta il foglio vecchio e ha quello giusto.
//
// Una comanda PRONTA, SERVITA o ANNULLATA non risponde: quando non
// risponde nessuno, ne nasce una nuova.
// ── FIN DOVE SI PUÒ TORNARE INDIETRO ─────────────────────────
//
// I passi già passati, meno quelli PRIMA di dove nasce il lavoro. Col
// locale che fa nascere le comande già in preparazione, «da fare» non
// esiste: nessuna comanda ci nasce, nessuno guarda quella colonna, e
// rimandarci una comanda a mano vuol dire nasconderla in un posto dove non
// la cerca più nessuno.
//
// NON SI TOCCA QUELLO CHE C'È GIÀ: una comanda ferma a «da fare» da prima
// resta dov'è e va avanti normalmente. Qui si toglie solo la strada per
// andarci.
export function statiPrimaComanda(status, passo) {
  const daDove = Math.max(0, COMANDA_FLOW.indexOf(passo))
  const arrivata = COMANDA_FLOW.indexOf(status)
  if (arrivata <= daDove) return []
  return COMANDA_FLOW.slice(daDove, arrivata)
}

// QUALCUNO L'HA PRESA IN MANO? Non «in che stato è»: chi l'ha messa in
// quello stato. Il segno esplicito vince sempre; senza segno (documenti
// nati prima) si guarda lo stato, e «in preparazione» si dà per preso in
// carico — è la risposta prudente, quella che non allunga un ticket che
// forse è già al banco.
export function presaInCarico(comanda) {
  if (!comanda) return true
  if (comanda.presa_in_carico === true) return true
  if (comanda.status === ORDER_STATUSES.RICEVUTO) return false
  if (comanda.status === ORDER_STATUSES.IN_PREPARAZIONE) {
    return comanda.presa_in_carico === undefined
  }
  // Pronta, servita, ritirata: fuori dal banco comunque.
  return true
}

// L'ULTIMA comanda viva del conto: è quella a cui si riferisce «aggiungi
// alla comanda» quando a sceglierlo è una persona (servizio spento). Non la
// prima: quella che si ha davanti è l'ultima battuta.
export function ultimaComandaViva(comande) {
  const vive = (comande || []).filter((c) => c && c.status !== ORDER_STATUSES.ANNULLATO)
  return vive[vive.length - 1] || null
}

export function comandaPerLeAggiunte(comande, { inCreazione = false } = {}) {
  const vive = (comande || []).filter((c) => c && c.status !== ORDER_STATUSES.ANNULLATO)
  // IN CREAZIONE È UNA COMANDA SOLA, sempre: il conto lo si sta ancora
  // componendo, e chi lo compone non sta mandando ticket al banco.
  if (inCreazione) return vive[0] || null
  return vive.find((c) => !presaInCarico(c)) || null
}

// Quantità per item bloccate (comande pronte/servite): sotto questa soglia
// l'aggregato non può scendere.
export function lockedQtyByItem(comande) {
  const m = {}
  for (const c of comande || []) {
    if (c.status === ORDER_STATUSES.ANNULLATO || comandaEditable(c)) continue
    for (const i of c.items || []) {
      m[i.drink_id] = (m[i.drink_id] || 0) + (Number(i.qty) || 0)
    }
  }
  return m
}

// Piano per togliere 1 unità di `drinkId` dall'ordine: sceglie la comanda
// modificabile PIÙ RECENTE che contiene l'item e restituisce
// { comandaId, items } con la quantità decrementata (item rimosso a zero).
// null se l'item vive solo in comande non modificabili.
export function planDecrement(comande, drinkId) {
  const editable = (comande || []).filter(comandaEditable)
  for (let k = editable.length - 1; k >= 0; k--) {
    const c = editable[k]
    const idx = (c.items || []).findIndex((i) => i.drink_id === drinkId && (Number(i.qty) || 0) > 0)
    if (idx === -1) continue
    const items = c.items
      .map((i, j) => (j === idx ? { ...i, qty: i.qty - 1 } : i))
      .filter((i) => i.qty > 0)
    return { comandaId: c.id, items }
  }
  return null
}

// ── Retrocompatibilità ─────────────────────────────────────────────────
// Normalizza un doc ordine (raw Firestore) nel nuovo modello. I doc legacy
// (senza `comande`) diventano un ordine con una comanda sintetica che porta
// il vecchio stato di lavorazione.
export function normalizeOrderDoc(o) {
  if (Array.isArray(o.comande)) {
    return {
      status: o.status ?? ORDER_OPEN,
      comande: o.comande,
    }
  }
  const legacy = o.status
  const isPagato = legacy === ORDER_STATUSES.PAGATO
  const isAnnullato = legacy === ORDER_STATUSES.ANNULLATO
  const comanda = {
    id: 'c1',
    seq: 1,
    items: Array.isArray(o.items) ? o.items : [],
    // Un ordine legacy pagato era stato servito; annullato → comanda annullata.
    status: isPagato ? ORDER_STATUSES.RITIRATO : isAnnullato ? ORDER_STATUSES.ANNULLATO : (legacy ?? ORDER_STATUSES.RICEVUTO),
    status_times: o.status_times ?? {},
    inventory_applied: o.inventory_applied ?? false,
    inventory_consumption: o.inventory_consumption ?? null,
    created_at: o.created_at ?? null,
  }
  return {
    status: isPagato || isAnnullato ? legacy : ORDER_OPEN,
    comande: [comanda],
  }
}

// ── LA PREPARAZIONE PARZIALE ─────────────────────────────────────────
//
// Succede tutte le sere: nella comanda del tavolo 4 ci sono tre gin tonic,
// in quella del banco altri due, e chi sta allo shaker li prepara insieme
// per farli uscire in una volta sola. Non andrebbe fatto — una comanda è
// un ticket, e un ticket si lavora intero — ma si fa, e l'app non lo
// impedisce: lo REGISTRA, così il conto resta giusto e chi guarda la coda
// vede davvero cosa c'è al banco e cosa aspetta ancora.
//
// La divisione non tocca la comanda di partenza: quella si ANNULLA (resta
// come storia — la copia già stampata ha ancora un riscontro, e niente
// sparisce dal conto) e al suo posto nascono le righe scelte, che vanno in
// preparazione, e il resto, che torna in «Da fare».
//
// Qui c'è solo il conto delle unità, che è la parte che si può sbagliare
// in silenzio: se una divisione fa sparire un drink al banco non se ne
// accorge nessuno finché non lo reclama il cliente. Chi chiama passa le
// quantità scelte riga per riga — `righeScelte[i]` è quanto di
// `comanda.items[i]` si prepara adesso — e riceve le DUE liste di righe.
//
//   null                              → non si è scelto niente
//   { tutta: true,  nuova, resta: [] } → si prende tutto: non c'è niente
//                                        da dividere, la comanda avanza
//   { tutta: false, nuova, resta }     → si divide
//
// Le quantità fuori misura non fanno danni: sotto zero, non numeriche o
// più grandi di quello che c'è valgono rispettivamente zero e il massimo
// disponibile. La somma delle unità di `nuova` e `resta` è sempre uguale a
// quella di partenza.
export function dividiComanda(comanda, righeScelte) {
  const righe = comanda?.items || []
  const nuova = []
  const resta = []
  let prese = 0
  righe.forEach((riga, i) => {
    const avevo = Math.max(0, Number(riga.qty) || 0)
    const chiesto = Number(righeScelte?.[i])
    const presa = Math.min(avevo, Number.isFinite(chiesto) ? Math.max(0, Math.trunc(chiesto)) : 0)
    prese += presa
    if (presa > 0) nuova.push({ ...riga, qty: presa })
    if (avevo - presa > 0) resta.push({ ...riga, qty: avevo - presa })
  })
  if (prese === 0) return null
  return { tutta: resta.length === 0, nuova, resta }
}

// DUE ANNULLAMENTI CHE NON SONO LA STESSA COSA. Dividere una comanda la
// annulla — resta come storia, e la copia già stampata ha un riscontro —
// ma quello è CONTABILITÀ INTERNA, non un fatto della serata: quei drink
// non sono spariti, sono diventati le due comande lì accanto. Mostrarla in
// un elenco di annullati vorrebbe dire far vedere due volte la stessa roba
// e far sembrare che qualcosa sia andato storto. Si distingue col motivo
// scritto sulla comanda, non guardando lo stato: «annullata» lo sono tutte
// e due.
export const ANNULLATA_PER_DIVISIONE = 'divisione'

export function annullataPerDivisione(c) {
  return c?.status === ORDER_STATUSES.ANNULLATO && c?.annullata_per === ANNULLATA_PER_DIVISIONE
}

// ── SU QUALI COMANDE SI PROPONE LA PREPARAZIONE PARZIALE ──────────
//
// FINCHÉ IL DRINK NON È USCITO DAL BANCO: a «da fare» e a «in
// preparazione». Da «pronto» in poi no — quello che è già sul vassoio non
// si divide più, e per sbagli del genere c'è il ritorno indietro.
//
// Chiedeva «ricevuto» e basta, e col locale che fa nascere le comande già
// in preparazione il tasto era sparito da tutte le schermate: nessuna
// comanda stava più in «da fare» (BUG-025). Ma nemmeno legarlo al passo di
// nascita bastava: dividere una comanda GIÀ al banco è il caso vero — sto
// preparando cinque gin tonic, ne faccio uscire tre adesso e due dopo — e
// non c'entra niente con dove sia nata.
//
// Più la soglia di sempre: più di un'unità dentro, o la scelta sarebbe fra
// tutto e niente, cioè il tasto grande.
export function comandaDivisibile(c) {
  // La soglia «finché il drink non è uscito dal banco» è UNA, e sta in
  // comandaEditable: riscriverla qui è come è nato BUG-025 — la si cambia
  // in un posto e resta vecchia nell'altro.
  if (!comandaEditable(c)) return false
  return (c.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0) > 1
}

// ── IN CHE PASSO NASCONO LE DUE COMANDE DI UNA DIVISIONE ──────────
//
// Lo dice quella di partenza, e non è fisso:
//
//   da «DA FARE»   la parte scelta è quella che si comincia adesso e va
//                   in preparazione; il resto resta da fare, che nessuno
//                   l'ha ancora toccato.
//   da «IN PREPARAZIONE»  tutte e due in preparazione. Il lavoro è
//                   cominciato su entrambe: mandarne indietro una a «da
//                   fare» vorrebbe dire dire che quei drink non li ha
//                   ancora presi in mano nessuno, e non è vero.
//
// Sta qui perché lo devono sapere in due — chi scrive la divisione
// (api.js) e chi la disegna mentre la scrittura vola (il conto) — e due
// valori a mano finirebbero per non combaciare.
export function statiDopoLaDivisione(status) {
  return status === ORDER_STATUSES.IN_PREPARAZIONE
    ? { nuova: ORDER_STATUSES.IN_PREPARAZIONE, resta: ORDER_STATUSES.IN_PREPARAZIONE }
    : { nuova: ORDER_STATUSES.IN_PREPARAZIONE, resta: ORDER_STATUSES.RICEVUTO }
}

// ── LA FIRMA DEL LAVORO DI UN CONTO ─────────────────────────
//
// A che punto sta il lavoro di un conto, in una riga: per ogni comanda il
// passo e quante unità, messe in ordine. Serve a capire se il server ha
// ormai recepito il gesto fatto qui — un avanzamento, una divisione — per
// poter buttare via la copia locale senza far «rimbalzare» la card allo
// stato di prima.
//
// GLI ID NON CI SONO, ed è il punto: una comanda appena creata da qui non
// ha ancora il nome che le darà il server («c3» lo decide chi scrive), e
// confrontando gli id la copia locale di una divisione non se ne sarebbe
// andata mai più. Quello che conta è se a schermo cambia qualcosa: due
// comande in preparazione da tre unità sono la stessa cosa comunque si
// chiamino.
//
// E non ci sono nemmeno i campi che il server aggiunge per conto suo —
// orari, snapshot del magazzino — che non cambiano niente di quello che si
// vede e terrebbero la copia locale attaccata per sempre.
export function firmaLavoro(comande) {
  return (comande || [])
    .map((c) => `${c.status}:${(c.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0)}`)
    .sort()
    .join('|')
}

// ── COSA È IN PREPARAZIONE E COSA È GIÀ USCITO, DENTRO IL CONTO ──────
//
// IL MODELLO, detto una volta per tutte: gli stati del SERVIZIO riguardano
// le COMANDE, che fanno parte dell'ordine. L'ordine ha i suoi stati
// (aperto, pagato, annullato); le comande ne hanno dei SOTTOSTATI, che sono
// i passi del servizio. Se un conto è gestito come una comanda sola, tutti
// i suoi drink stanno sempre nello stesso passo — a meno che il bartender
// non divida la comanda per prepararne una parte.
//
// Da lì in poi «a che punto è questo conto» non ha più una risposta sola, e
// aprendolo si deve vedere cosa è al banco e cosa è già uscito. Si fa come
// si fa già con le righe pagate: un titolo, e sotto le sue.
//
// E le due cose non si contraddicono: un conto si può incassare in
// qualunque passo del servizio — dalla cassa è chiuso, dal banco magari no,
// perché una comanda è ancora in preparazione. Il gruppo «Pagati» dice la
// prima cosa, i gruppi del servizio la seconda.
export const SERVIZIO_ETICHETTA = {
  [ORDER_STATUSES.RICEVUTO]: '🧾 Da fare',
  [ORDER_STATUSES.IN_PREPARAZIONE]: '🍹 In preparazione',
  [ORDER_STATUSES.PRONTO]: '🔔 Pronto',
  [ORDER_STATUSES.RITIRATO]: '✅ Servito',
  [ORDER_STATUSES.ANNULLATO]: '✖️ Annullato',
}

// A quale gruppo appartiene una riga del conto. Le righe della BOZZA — non
// ancora inviate al banco — non ne hanno uno: non sono ancora lavoro di
// nessuno, e intestarle direbbe una cosa che non è.
export function gruppoDiRiga(riga) {
  if (riga?.paid) return 'pagati'
  if (riga?.source !== 'comanda') return null
  return riga.status || null
}

// I gruppi presenti nella lista, in ordine di lavorazione e coi pagati in
// fondo. Serve a decidere se intestarli: con UN gruppo solo non si mette un
// titolo per dire una cosa sola.
// `conServizio` a false quando il locale NON segue la preparazione: lì i
// passi del servizio non esistono per nessuno, e vedersi comparire «In
// preparazione» in mezzo alle righe di un conto è una parola che parla di
// una cosa che quel locale non fa. Resta la divisione che c'era già da
// sempre: quello che è stato pagato con un acconto, sotto «💳 Pagati».
export function gruppiDelConto(righe, { conServizio = true } = {}) {
  const visti = new Set((righe || []).map(gruppoDiRiga).filter(Boolean))
  const possibili = conServizio
    ? [...COMANDA_FLOW, ORDER_STATUSES.ANNULLATO, 'pagati']
    : ['pagati']
  return possibili.filter((g) => visti.has(g))
}

export function titoloGruppo(gruppo) {
  if (gruppo === 'pagati') return '💳 Pagati'
  return SERVIZIO_ETICHETTA[gruppo] || null
}

// ── I PASSI DI UNA COMANDA, CON L'ORA ────────────────────────────────
//
// «Da quanto sta lì» sulla card risponde a una domanda sola; aperta la
// comanda le domande diventano altre: quando è entrata, quando qualcuno
// l'ha presa in carico, quanto è rimasta pronta prima che partisse.
// Al banco quei minuti sono la differenza fra «siamo indietro» e «questo
// ticket è stato dimenticato», e senza gli orari accanto ai passi non c'è
// modo di dirlo — restava solo il totale.
//
// I passi sono quelli di sempre (COMANDA_FLOW): qui si dice solo quali
// sono già stati toccati, quando, e a quale si è fermi adesso. Una comanda
// ANNULLATA non torna indietro nel flusso: tiene gli orari che aveva e si
// porta in fondo il passo che l'ha chiusa.
export function tappeComanda(comanda) {
  const tempi = comanda?.status_times || {}
  const stato = comanda?.status
  const arrivata = COMANDA_FLOW.indexOf(stato)
  const tappe = COMANDA_FLOW.map((s, i) => ({
    stato: s,
    quando: tempi[s] || null,
    // Fuori dal flusso (annullata) l'unica prova di essere passati di lì è
    // l'orario segnato: contare i passi darebbe «mai arrivata» a una
    // comanda che al banco c'era stata davvero.
    fatta: arrivata >= 0 ? i <= arrivata : !!tempi[s],
    adesso: s === stato,
  }))
  if (stato === ORDER_STATUSES.ANNULLATO) {
    tappe.push({
      stato: ORDER_STATUSES.ANNULLATO,
      quando: tempi[ORDER_STATUSES.ANNULLATO] || null,
      fatta: true,
      adesso: true,
    })
  }
  return tappe
}

// LA COMANDA CHE SI STA PREPARANDO ADESSO, dopo una divisione. Dividendo
// nascono due figlie: quella che si è detto di preparare (già in
// preparazione) e il resto, che torna «da fare». Chi ha appena diviso ha in
// mano la prima — è quella che sta facendo — e lì va portato: la comanda
// che aveva davanti non esiste più.
//
// Si riconosce dal legame scritto sulle figlie (`divisa_da`) e dal passo in
// cui nasce, non dalla posizione nell'elenco: l'ordine di un array è la
// prima cosa che cambia quando qualcuno tocca il codice attorno.
export function comandaNataDallaDivisione(order, comandaId) {
  if (!comandaId) return null
  return (
    (order?.comande || []).find(
      (c) => c.divisa_da === comandaId && c.status === ORDER_STATUSES.IN_PREPARAZIONE
    ) || null
  )
}

// ── PERCHÉ QUESTA COMANDA È ANNULLATA ────────────────────────────────
//
// La colonna «Annullate» raccoglie OGNI comanda in stato annullato: quelle
// tolte a mano dal banco, quelle sparite dividendone una in due, e quelle
// cadute insieme a un conto annullato per intero. Ci vanno tutte perché la
// domanda a cui quella colonna risponde è una sola — «questa comanda che
// fine ha fatto?» — e una comanda che non si trova da nessuna parte è
// esattamente la cosa che manda a cercare un guasto.
//
// Ma le tre cose non sono la stessa cosa, e chi guarda deve capirlo a colpo
// d'occhio: una divisione non è un drink saltato (quei drink si stanno
// facendo, in due ticket), un conto annullato non è una decisione presa su
// quella comanda. Il motivo si legge dai dati, non si indovina: il marchio
// della divisione sulla comanda, lo stato sul conto.
export const MOTIVO_ANNULLO = {
  // Lo stesso valore che si scrive sul dato (`annullata_per`): due
  // costanti con la stessa stringa sono due modi di sbagliarne una.
  DIVISIONE: ANNULLATA_PER_DIVISIONE,
  CONTO: 'conto',
  MANO: 'mano',
}

export const ETICHETTA_ANNULLO = {
  [MOTIVO_ANNULLO.DIVISIONE]: '✂️ Divisa',
  [MOTIVO_ANNULLO.CONTO]: '✖️ Conto annullato',
  [MOTIVO_ANNULLO.MANO]: '✖️ Annullata',
}

export function motivoAnnullo(comanda, order) {
  // La divisione vince: quella comanda è sparita perché è stata divisa,
  // anche se più tardi è caduto pure il conto.
  if (annullataPerDivisione(comanda)) return MOTIVO_ANNULLO.DIVISIONE
  const contoMorto =
    order?.status === ORDER_STATUSES.ANNULLATO ||
    order?.workflow_status === ORDER_STATUSES.ANNULLATO
  return contoMorto ? MOTIVO_ANNULLO.CONTO : MOTIVO_ANNULLO.MANO
}

// ── CHE NUMERO HA QUESTA COMANDA DENTRO IL SUO CONTO ─────────────────
//
// «Comanda 2» è come la chiamano il banco e lo schermo (la corsia, il
// dettaglio del conto), e dal 25/08/2026 anche la fascia nera del ticket
// (REQ-STAMPA-014). Il numero è `seq`, assegnato quando la comanda nasce.
//
// TORNA null QUANDO NON SI SA, e succede in due casi veri: un documento
// vecchio senza `seq` — e allora vale la posizione nell'elenco, che è
// l'ordine in cui sono state battute — e il TICKET UNITO, che di comande
// ne contiene tutte e quindi non è nessuna. In quei casi chi stampa
// scrive solo il numero del conto invece di inventarsi un «Comanda
// undefined».
export function numeroComanda(order, comanda) {
  if (!comanda) return null
  if (Number(comanda.seq) > 0) return Number(comanda.seq)
  const posto = (order?.comande || []).findIndex((c) => c && c.id === comanda.id)
  return posto >= 0 ? posto + 1 : null
}
