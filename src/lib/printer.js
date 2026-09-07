// Wrapper attorno all'Epson ePOS SDK per JavaScript.
// Il file epos-2.27.0.js deve essere in public/ e caricato via <script> in
// index.html (è una libreria legacy non-ESM che usa window.epson).
//
// Connettività: la stampante deve essere sulla stessa LAN del dispositivo.
// Poiché l'app è servita in HTTPS, il browser richiede WSS (WebSocket sicuro):
//   1. Apri l'interfaccia web della stampante (http://<IP>)
//   2. Abilita SSL/TLS nelle impostazioni di rete
//   3. Dal browser dell'iPad: vai su https://<IP>:8043 e accetta il certificato
//   4. Da quel momento la connessione WSS funziona senza dialoghi

import {
  CASH_METHOD_ORDER,
  cashMethodKeys,
  PAYMENT_METHOD_PRINT,
  placedByName,
} from './orderStatus.js'
import { stampanteFintaAttiva, creaStampanteFinta } from './stampanteFinta.js'
import {
  ESITO,
  lavoroInCoda,
  lavoroPartito,
  lavoroInviato,
  lavoroNonPartito,
  aggiornaEsito,
} from './registroStampe.js'
import { notify } from './notify.js'
import { numeroComanda, pezziDellaComanda, righeDellaComanda } from './comande.js'
import { battutoDaQui } from './dispositivo.js'
import { impostazioniRicordate } from './impostazioniLocali.js'
import {
  configStampa,
  immagineCaricata,
  logoAcceso,
  rigaPersone,
  rigaVendita,
  tipoScontrino,
  LARGHEZZA_LOGO,
} from './campiStampa.js'
import {
  contoDopoIncasso,
  etichettaSconto,
  orderDue,
  orderTotal,
  paidAmount,
  round2,
  scontiDelConto,
  scontoTotale,
} from './pagamento.js'

// ── COSA C'È SULLA CARTA LO DECIDE IL LOCALE ─────────────────────────
//
// I campi dello scontrino e della comanda stanno in settings/bar
// (REQ-STAMPA-014): sono l'identità del bar, non una preferenza del
// tablet che ha stampato. Ma la stampa NON PUÒ ASPETTARE LA RETE — al
// banco un ticket che arriva dopo la lettura di un documento è un ticket
// che non arriva — quindi qui si legge la copia locale che
// `subscribeSettings` riscrive a ogni risposta del server
// (lib/impostazioniLocali.js).
//
// Risposta mai arrivata: nessuna voce, e ogni campo torna al suo valore
// di partenza, che è il comportamento di sempre. Niente da migrare,
// niente da aspettare.
const impostazioniDelLocale = () => impostazioniRicordate({})

// Larghezza colonne stamante 80 mm (TM-m30II / TM-m30III): 48 chars std.
const COL = 48

// ── Impostazioni persistite in localStorage ───────────────────────────────────

// LE IMPOSTAZIONI DELLA STAMPANTE SONO DEL DISPOSITIVO **E** DI CHI CI
// LAVORA. Del dispositivo, perché l'indirizzo della stampante dipende da
// dove sei: il tablet del banco la raggiunge, il telefono della sala forse
// no. Di chi ci lavora, perché sullo stesso tablet si alternano persone
// diverse, e la stampa automatica delle comande la vuole accesa chi sta al
// banco, non chi passa di lì a battere due conti.
const SETTINGS_KEY = 'tana_printer_v2'
const UTENTE_KEY = 'tana_printer_utente'
const PERSONA_KEY = 'tana_printer_persona'

// L'ultimo utente lo si ricorda: le impostazioni si leggono anche prima che
// Firebase abbia finito di riconoscere chi è collegato, e senza memoria per
// un istante si leggerebbe la scheda di un altro — «nessuna stampante
// impostata» che compare e sparisce.
let _utente = null
// E DI QUELLA PERSONA SI RICORDA ANCHE IL NOME, perché è quello che va
// stampato sullo scontrino (REQ-STAMPA-014, BUG-088). Sta qui e non nel
// conto: la riga dice CHI STA STAMPANDO, cioè chi è collegato a questo
// terminale nell'istante in cui la carta esce. Una ristampa porta quindi
// il nome di chi ristampa — è lui che quel foglio lo consegna.
//
// Si ricorda in memoria locale per la stessa ragione dell'uid: la prima
// stampa può capitare prima che Firebase abbia finito di riconoscere chi
// è collegato, e uno scontrino senza nome sarebbe la conseguenza di un
// ritardo, non di un dato che manca.
let _persona = null
try {
  _utente = localStorage.getItem(UTENTE_KEY) || null
  _persona = JSON.parse(localStorage.getItem(PERSONA_KEY) || 'null')
} catch {
  /* storage negato: si lavora senza memoria, come prima */
}

// `persona`: { name, email } di chi è collegato, o niente se non c'è
// nessuno. Le due cose arrivano insieme perché insieme cambiano — è la
// stessa persona che si siede al terminale.
export function impostaUtenteStampante(uid, persona = null) {
  _utente = uid || null
  const nome = persona?.name || null
  const email = persona?.email || null
  _persona = nome || email ? { name: nome, email } : null
  try {
    if (uid) localStorage.setItem(UTENTE_KEY, uid)
    else localStorage.removeItem(UTENTE_KEY)
    if (_persona) localStorage.setItem(PERSONA_KEY, JSON.stringify(_persona))
    else localStorage.removeItem(PERSONA_KEY)
  } catch {
    /* niente memoria: le impostazioni restano quelle del dispositivo */
  }
}

// Il nome da mettere sulla carta, o stringa vuota se non si sa chi sta
// stampando. Si ricava con `placedByName`, la STESSA funzione della coda e
// del dettaglio conto: sullo scontrino e sullo schermo la stessa persona
// si deve chiamare allo stesso modo.
export function nomeDiChiStampa() {
  return placedByName(_persona)
}

const chiaveImpostazioni = () => (_utente ? `${SETTINGS_KEY}:${_utente}` : SETTINGS_KEY)

export const DEFAULT_PRINTER_SETTINGS = {
  ip: '',
  port: 8043,       // 8043 = HTTPS (WSS), 8008 = HTTP (WS)
  https: true,      // false → HTTP, solo se l'app è servita in HTTP
  autoPrintComanda: false,  // stampa automatica comanda all'arrivo dell'ordine
  autoPrintScontrino: false, // stampa automatica scontrino al "pronto"
  // CHI STAMPA LE COMANDE PRESE IN SALA: 'ip' = il telefono della sala parla
  // da sé con la stampante (ha l'IP: la configurazione arriva dal server);
  // 'rimbalzo' = la sala non stampa e la comanda esce al banco, che deve
  // avere la coda aperta e la stampa automatica accesa. Lo decide il locale,
  // una volta, dal terminale del banco.
  stampaSala: 'ip',
  businessName: 'La Tana del Coniglio',
  businessAddress: 'Corso Tommaso Vitale 87/89',
  businessCity: '80035 Nola - Italy',
  businessFooter: 'EFFEVI - SRLS',
}

// Scontrino automatico UNA SOLA VOLTA per conto: la chiusura può passare da
// più strade (schermata pagamento, coda, incasso di gruppo) e senza questa
// guardia lo stesso scontrino uscirebbe due volte.
const PRINTED_KEY = 'tana_printed_receipts'
export function claimReceiptPrint(orderId) {
  if (!orderId) return true
  try {
    const list = JSON.parse(localStorage.getItem(PRINTED_KEY) || '[]')
    if (list.includes(orderId)) return false
    localStorage.setItem(PRINTED_KEY, JSON.stringify([...list, orderId].slice(-300)))
    return true
  } catch {
    return true // storage non disponibile: meglio stampare che non stampare
  }
}

// LA PRENOTAZIONE SI RESTITUISCE SE LA CARTA NON È USCITA (BUG-047).
// `claimReceiptPrint` segna il conto PRIMA di stampare — deve, se no due
// schermate stampano la stessa cosa — ma se poi la stampa non riesce quel
// segno restava lì per sempre: quel conto non stampava più lo scontrino
// automatico nemmeno riaperto e richiuso, e chi stava al banco non aveva modo
// di capire perché. Si chiama quando la stampa fallisce e quando un conto
// torna aperto: da lì in poi la prossima chiusura ristampa.
export function releaseReceiptPrint(orderId) {
  if (!orderId) return
  try {
    const list = JSON.parse(localStorage.getItem(PRINTED_KEY) || '[]')
    localStorage.setItem(PRINTED_KEY, JSON.stringify(list.filter((id) => id !== orderId)))
  } catch {
    /* niente memoria: la guardia non c'è e si stampa comunque */
  }
}

// LO SCONTRINO DI CHIUSURA È GIÀ USCITO PER QUESTO CONTO? Il segno sta SUL
// DATO (`receipt_print_at` sull'ordine), esattamente come per le comande
// (`auto_print_at`, BUG-050). La pretesa qui sopra vive in localStorage e
// para solo i doppioni di QUESTO terminale: un browser nuovo, o una memoria
// svuotata, di pretese non ne ha nessuna — e vedeva i conti pagati della
// serata come conti da stampare. Il segno sul dato lo sanno tutti.
export function scontrinoGiaUscito(order) {
  return !!order?.receipt_print_at
}

// L'INCASSO È UNA CHIUSURA NUOVA, sempre: chi sta incassando adesso deve
// avere lo scontrino di adesso, anche se per questo conto ne era già
// uscito uno prima di una riapertura. «Se riapro il conto e cambio
// qualcosa e riscuoto di nuovo, deve ristampare il nuovo conto. Non ha
// senso che stampi solo una volta» (l'utente, 19/08). Si restituisce la
// pretesa vecchia e si prende quella nuova in un colpo: la coda, che
// vedrà il conto pagato fra un istante, troverà la pretesa già presa e
// non farà la seconda copia.
export function reclaimReceiptPrint(orderId) {
  releaseReceiptPrint(orderId)
  return claimReceiptPrint(orderId)
}

// ── L'AUTO-STAMPA DELLE COMANDE ──────────────────────────────────────
//
// LA STAMPA NON È UN AVVISO. Per anni ha vissuto dentro il blocco della
// notifica «nuovo ordine», e ne ereditava i filtri: «non avvisare chi l'ha
// battuto» è sacrosanto per un beep — lo sai già, l'hai appena fatto tu —
// ma la stampante non è una persona: la comanda serve al banco comunque,
// anche per l'ordine battuto da questo stesso terminale. E dentro quel
// blocco stampava solo l'ordine NUOVO: la seconda comanda aggiunta a un
// conto esistente non usciva mai.
//
// Qui la stampa ha la sua regola, per COMANDA e non per ordine, con la
// stessa pretesa in localStorage degli scontrini: ogni comanda esce UNA
// volta da questo terminale, chiunque l'abbia battuta, da qualunque vista.
//
// LA PRETESA È SUL CONTENUTO, non solo sul nome della comanda. Una comanda
// non ancora presa in carico può ACCOGLIERE righe nuove: il ticket già
// uscito diventa vecchio, e va ristampato completo (il segno sul dato si
// azzera, vedi api.js). Con una pretesa legata al solo id, il terminale che
// aveva già stampato sarebbe rimasto zitto per sempre — e il segno sul dato
// azzerato da un ALTRO terminale non avrebbe potuto liberargliela. Legata
// alle righe, invece, la comanda cambiata è un lavoro nuovo e la carta esce.
const COMANDE_KEY = 'tana_printed_comande'

// Le righe come sono adesso, in poche lettere: cambia una quantità o
// arriva un drink, cambia la firma.
function firmaRighe(comanda) {
  return (comanda?.items || [])
    .map((i) => `${i.drink_id || i.name || '?'}x${i.qty ?? 1}`)
    .join('|')
}

export function claimComandaPrint(orderId, comanda) {
  const comandaId = typeof comanda === 'string' ? comanda : comanda?.id
  if (!orderId || !comandaId) return false
  const chiave = `${orderId}:${comandaId}:${firmaRighe(comanda)}`
  try {
    const list = JSON.parse(localStorage.getItem(COMANDE_KEY) || '[]')
    if (list.includes(chiave)) return false
    localStorage.setItem(COMANDE_KEY, JSON.stringify([...list, chiave].slice(-500)))
    return true
  } catch {
    return true // niente memoria: meglio una copia doppia che nessuna
  }
}

// La stampa non è riuscita: la pretesa locale torna libera, così il
// prossimo snapshot ci riprova — carta finita, stampante spenta, si
// sistema e la comanda esce da sola.
export function releaseComandaPrint(orderId, comanda) {
  const comandaId = typeof comanda === 'string' ? comanda : comanda?.id
  if (!orderId || !comandaId) return
  const chiave = `${orderId}:${comandaId}:${firmaRighe(comanda)}`
  try {
    const list = JSON.parse(localStorage.getItem(COMANDE_KEY) || '[]')
    localStorage.setItem(COMANDE_KEY, JSON.stringify(list.filter((k) => k !== chiave)))
  } catch {
    /* niente memoria: la pretesa non c'era comunque */
  }
}

// ── CHI STAMPA LA COMANDA: IL TERMINALE CHE HA BATTUTO L'ORDINE ──────
//
// «Solo il terminale che inserisce l'ordine stampa automaticamente la
// comanda» (l'utente, 20/08). Prima stampava CHIUNQUE avesse l'interruttore
// acceso: il segno sul dato evitava i doppioni, ma a farla uscire era il
// primo che vedeva l'ordine — e la carta poteva finire sul tablet in fondo
// alla sala mentre chi aveva battuto il conto aspettava al banco.
//
// ATTENZIONE A NON RIFARE BUG-050 AL CONTRARIO: lì il proprio terminale era
// l'unico che NON stampava (la stampa viveva dentro i filtri dell'avviso, e
// «non avvisare chi l'ha battuto» tagliava fuori proprio lui). Qui è
// l'UNICO che stampa. La differenza sta tutta nel verso di questa riga, ed
// è il motivo per cui è scritta una volta sola e provata.
//
// DUE ECCEZIONI, e sono quelle che tengono in piedi il resto:
//
//   L'ORDINE DEL CLIENTE dal telefono non ha un terminale che l'ha
//   inserito: `placed_by` è vuoto. Quelli li stampa chi ha l'interruttore
//   acceso — il banco, di fatto — come si è sempre fatto, col segno sul
//   dato a evitare le copie doppie. È un'ASSUNZIONE, non una richiesta
//   (REQ-STAMPA-013): se cade, cade con questa riga.
//
//   IL RIMBALZO (REQ-STAMPA-008): il locale ha scelto che le comande della
//   sala escono AL BANCO, e il telefono che prende l'ordine non stampa
//   affatto (MenuPage). Se anche qui si tacesse, non stamperebbe nessuno —
//   e la regola nuova avrebbe spento una funzione che c'è.
//
// Pura: `daQui` e le impostazioni si passano, così si prova senza rete e
// senza memoria del browser.
export function stampaQuestoTerminale(order, { daQui = battutoDaQui, impostazioni } = {}) {
  if (!salaStampaDaSe(impostazioni || loadPrinterSettings())) return true
  // Ordini vecchi, nati prima che il campo esistesse, e ordini dei clienti:
  // nessun terminale li rivendica, e la carta deve uscire lo stesso.
  if (!order?.placed_by?.device) return true
  return daQui(order.placed_by)
}

// QUALI COMANDE DI UN CONTO VANNO STAMPATE ADESSO. Pura, così si prova
// senza rete e senza schermata.
//
// IL SEGNO «STAMPATA» STA SUL DATO (`auto_print_at` sulla comanda), non
// solo nella memoria del terminale: così un browser nuovo non ristampa la
// serata (vede i segni), e due tablet con l'interruttore acceso non fanno
// due copie — il secondo vede il segno del primo. C'era una finestra di
// dieci minuti al posto del segno, ed era un ripiego: «semplicemente non
// puoi segnare le comande stampate già?» (l'utente, 20/08). Sì.
// La pretesa locale (claimComandaPrint) resta come primo filtro: para i
// propri snapshot che arrivano prima che la scrittura del segno torni.
//
// E LA STAMPA UN TERMINALE SOLO: QUELLO CHE HA BATTUTO L'ORDINE
// (stampaQuestoTerminale, qui sopra).
// ── LAVORO ANNULLATO: NON SI STAMPA MAI (BUG-071) ────────────────────
//
// «Se alla creazione di un ordine lo annullo anche, la comanda non deve
// uscire se è abilitata la stampa automatica» (l'utente, 21/08/2026).
//
// La domanda sta in una funzione sola perché la fanno in due posti — chi
// sceglie cosa stampare (`comandeDaStampare`, l'auto-stampa) e chi mette
// l'inchiostro sulla carta (`printComanda`, che ci arriva anche dal tasto
// «Comanda» della coda) — e finora la faceva solo il primo. Il tasto a
// mano su un conto annullato stampava ANCORA: `comandaDelTicket` scarta
// le annullate, non ne trova nessuna, e `printComanda` ripiegava
// sull'aggregato del conto. Cioè il ticket peggiore possibile — tutte le
// righe di un conto che non si deve fare — proprio dove non doveva
// uscirne nessuno.
//
// SI GUARDANO TUTTI E DUE I CAMPI. `status` è quello scritto sul
// documento; `workflow_status` è lo stato di lavorazione che la coda
// calcola e che alcune viste passano al posto dell'altro. Un conto
// annullato è annullato da qualunque parte lo si guardi, e questa
// funzione non deve dipendere da quale delle due strade l'ha chiamata.
export function lavoroAnnullato(order, comanda = null) {
  return (
    order?.status === 'annullato' ||
    order?.workflow_status === 'annullato' ||
    comanda?.status === 'annullato'
  )
}

export function comandeDaStampare(order, opzioni = {}) {
  if (!order || lavoroAnnullato(order)) return []
  if (!stampaQuestoTerminale(order, opzioni)) return []
  // IL CONTO SI STA ANCORA COMPONENDO: niente carta. È il facsimile col
  // LIMONCELLO da solo visto al banco — stampato a metà battuta, mentre chi
  // stava al POS aveva ancora il vassoio da riempire. Il ticket esce quando
  // chi lo sta battendo esce dalla creazione (`in_creazione` si azzera lì).
  if (order.in_creazione) return []
  return (order.comande || []).filter((c) => {
    if (!c || lavoroAnnullato(order, c)) return false
    // Da stampare è la comanda ancora al banco: già pronta o uscita vuol
    // dire che qualcuno l'ha lavorata senza carta, e stamparla ora è tardi.
    if (c.status !== 'ricevuto' && c.status !== 'in_preparazione') return false
    return !c.auto_print_at
  })
}

// La sala stampa da sé? Una domanda sola, in un posto solo: la fanno la
// schermata che prende l'ordine e il pallino che dice se si stamperà.
export function salaStampaDaSe(s = loadPrinterSettings()) {
  return s.stampaSala !== 'rimbalzo'
}

// ── L'ALIQUOTA IVA È UNA SOLA, QUELLA DEL LOCALE (BUG-084) ───────────
//
// Ce n'erano DUE, e non lo sapeva nessuno: `ivaRate` qui fra le
// impostazioni della stampante — nel browser, per terminale — che finiva
// sulla riga IVA dello scontrino, e `sale_vat` su settings/bar — condivisa
// — che usano margini, prezzo consigliato e statistiche. Due tablet
// potevano stampare scontrini con aliquote diverse, e l'IVA sulla carta
// poteva non tornare con quella dei conti.
//
// Un'aliquota è del LOCALE: è un fatto fiscale, non una preferenza del
// tablet che ha stampato. Vince `sale_vat`, e il campo nelle impostazioni
// della stampante è sparito.
//
// Si legge dalla copia locale delle impostazioni del bar, come tutto il
// resto della stampa: la carta non aspetta la rete.
export const ALIQUOTA_DEFAULT = 10
export function aliquotaScontrino(impostazioni = impostazioniDelLocale()) {
  const scelta = impostazioni?.sale_vat
  // Uno ZERO è un'aliquota vera (non si scorpora niente): solo un valore
  // assente o storto torna al 10 della somministrazione. Il vuoto va
  // guardato PRIMA di `Number`, che di `null` e di `''` fa uno zero — e un
  // campo lasciato vuoto stamperebbe uno scontrino senza IVA.
  if (scelta === null || scelta === undefined || scelta === '') return ALIQUOTA_DEFAULT
  const aliquota = Number(scelta)
  return Number.isFinite(aliquota) ? aliquota : ALIQUOTA_DEFAULT
}

export function loadPrinterSettings() {
  try {
    const mie = JSON.parse(localStorage.getItem(chiaveImpostazioni()) || 'null')
    if (mie) return { ...DEFAULT_PRINTER_SETTINGS, ...mie }
    // PRIMA VOLTA DI QUESTA PERSONA SU QUESTO DISPOSITIVO: eredita quelle
    // del dispositivo. Senza, il giorno del passaggio a impostazioni per
    // utente ogni tablet del locale avrebbe perso l'indirizzo della
    // stampante — e la comanda non esce.
    const delDispositivo = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
    return { ...DEFAULT_PRINTER_SETTINGS, ...(delDispositivo || {}) }
  } catch {
    return { ...DEFAULT_PRINTER_SETTINGS }
  }
}

export function savePrinterSettings(patch) {
  const current = loadPrinterSettings()
  const next = { ...current, ...patch }
  try {
    localStorage.setItem(chiaveImpostazioni(), JSON.stringify(next))
  } catch {
    /* storage pieno o negato: si continua con quelle in memoria */
  }
  return next
}

// ── Connessione ───────────────────────────────────────────────────────────────

let _device = null   // ePOSDevice instance
let _printer = null  // printer object restituito da createDevice
let _connectPromise = null

function sdkAvailable() {
  return typeof window !== 'undefined' && typeof window.epson?.ePOSDevice === 'function'
}

// SI DIMENTICA IL COLLEGAMENTO: la prossima stampa rifà la stretta di mano.
// Non si chiama `disconnect()` — se il collegamento è appeso, quella
// chiamata può appendersi a sua volta, ed è proprio quello da cui si sta
// scappando. Serve alla caduta vista dal battito, al ritorno in primo piano
// e al lavoro di stampa che scade (BUG-086).
function scordaConnessione({ chiudendo = false } = {}) {
  fermaIlMonitor(_printer)
  // CHIUDERE O ABBANDONARE, e non è la stessa cosa.
  //
  // Di regola si ABBANDONA: qui ci si arriva quando il collegamento è
  // appeso o muto, e `disconnect()` su un collegamento appeso può
  // appendersi a sua volta — che è esattamente ciò da cui si sta
  // scappando.
  //
  // Ma quando si molla un collegamento che PROBABILMENTE STA BENE — la
  // stampa dopo una pausa, che riparte da zero per prudenza — abbandonarlo
  // lascerebbe sulla stampante una sessione mezza aperta finché non scade
  // da sé. Una alla volta non è un problema; ripetuto a ogni pausa, sì:
  // l'apparecchio di sessioni contemporanee ne regge poche. Lì si chiude,
  // dentro un try perché non deve poter fermare la stampa che segue.
  if (chiudendo) {
    try {
      _device?.disconnect()
    } catch {
      /* già caduta, o SDK in uno stato strano: si abbandona e basta */
    }
  }
  _printer = null
  _device = null
  _connectPromise = null
  dimenticaLAscolto()
}

// Termina la connessione corrente (se attiva).
export function disconnectPrinter() {
  fermaBattito()
  fermaIlMonitor(_printer)
  try { _device?.disconnect() } catch { /* ignora */ }
  _device = null
  _printer = null
  _connectPromise = null
  dimenticaLAscolto()
}

// ── LA RISPOSTA DELLA STAMPANTE È DIAGNOSTICA (REQ-STAMPA-016, BUG-098)
//
// LA STAMPA NON ASPETTA, E NON DEVE ASPETTARE. Il lavoro si chiude quando
// il foglio è stato MANDATO: chi chiude cassa o batte una comanda vede
// l'esito nell'istante in cui tocca. È il local-first del CLAUDE.md
// applicato alla stampante — come non si aspetta Firestore per mostrare un
// conto incassato, non si aspetta la testina per dire che la stampa è
// partita.
//
// LA RISPOSTA ARRIVA DOPO, PER CONTO SUO — `onreceive`, con esito e
// codice: carta finita, coperchio aperto, fuori linea — e serve solo a
// RACCONTARE: aggiorna la voce già scritta nel registro delle stampe (da
// «inviata» a com'è andata davvero) e, se è un errore, manda un avviso.
// Non chiude niente, non trattiene nessuno, non fa ritentare: a ristampare
// è una persona, che è anche l'unico modo di non rischiare il doppio
// scontrino.
//
// PERCHÉ STA SCRITTO QUI IN GRANDE: la prima stesura di BUG-098 aveva
// messo il lavoro ad ASPETTARE questa risposta, cioè un `await` sulla
// stampante nel mezzo di un gesto — la cosa che in questo progetto non si
// fa. Chi passa di qui a «migliorare» rimettendoci un await sta rifacendo
// quell'errore: la diagnostica non blocca mai chi ha il cliente davanti.
//
// COME SI CORRELA una risposta col foglio che l'ha causata, senza
// identificativi (l'SDK non ne dà): le risposte tornano nell'ordine degli
// invii, quindi si contano — chi aspetta l'invio n scarta la risposta n-1,
// che è di un foglio già passato. E si guarda anche l'oggetto stampante:
// dopo una riconnessione è un altro, e la risposta della connessione di
// prima non è di nessuno.
let _inAscolto = []
let _inviati = 0
let _risposte = 0
let _orologioAscolto = null

// QUANTO SI TIENE APERTO L'ASCOLTO — e non è un'attesa: il lavoro è già
// chiuso da un pezzo e nessuno sta fermo qui. È il momento in cui si
// smette di dare un padrone alle risposte, e serve perché contare gli
// invii funziona finché a ogni invio ne segue una: un foglio che non
// riceve MAI risposta lascerebbe il conto indietro di uno per sempre, e da
// lì in poi ogni risposta finirebbe sul foglio sbagliato — cioè un avviso
// di «carta finita» addosso a una stampa riuscita. Cinque secondi: la
// Epson risponde in meno di uno.
const TEMPO_ASCOLTO = 5000

function smettiDiAscoltare() {
  clearTimeout(_orologioAscolto)
  _orologioAscolto = null
  const muti = _inAscolto.length
  _inAscolto = []
  // Il conto riparte in pari. I fogli rimasti senza risposta restano
  // «inviata» nel registro, che è l'informazione vera: non lo sappiamo.
  _risposte = _inviati
  // MA TRE DI FILA NON SONO PIÙ «NON LO SAPPIAMO» (BUG-102). Uno può
  // perdersi; tre invii che nessuno raccoglie sono un collegamento che non
  // c'è più, e continuare a mandarci dentro fogli è quello che ha fatto
  // sparire una serata di stampe. Si molla e si dice.
  if (!muti) return
  _inviiMuti += muti
  if (_inviiMuti >= INVII_MUTI_PRIMA_DI_MOLLARE) {
    guaioDellaStampante('la stampante non risponde', { mollaIlCollegamento: true })
  }
}

function dimenticaLAscolto() {
  clearTimeout(_orologioAscolto)
  _orologioAscolto = null
  _inAscolto = []
  // I contatori valgono per UNA connessione: rifatta la stretta di mano si
  // riparte da zero, o resterebbero sfasati per sempre. Vale anche per gli
  // invii muti: quelli erano della strada di prima, e lasciandoli lì il
  // primo silenzio del collegamento nuovo la farebbe mollare subito.
  _inviati = 0
  _risposte = 0
  _inviiMuti = 0
}

// Si mette in ascolto della risposta a QUESTO invio. Va armato PRIMA di
// `send()`: la stampante finta risponde dentro `send()`, e chi si mettesse
// in ascolto dopo perderebbe la risposta.
function ascoltaLaRisposta(prn, atteso, racconta) {
  _inAscolto.push({ prn, atteso, racconta })
  clearTimeout(_orologioAscolto)
  _orologioAscolto = setTimeout(smettiDiAscoltare, TEMPO_ASCOLTO)
}

// Chiamata dall'`onreceive` di QUELLA stampante — vera o finta che sia.
function rispostaDallaStampante(res, prn) {
  // Da una connessione già buttata: non è di nessuno. I contatori sono
  // ripartiti da zero, contarla vorrebbe dire darla al foglio sbagliato.
  if (prn !== _printer) return
  _risposte += 1
  // Le risposte tornano nell'ordine degli invii: quelle rimaste indietro
  // non arriveranno più, e i loro fogli restano «inviata» nel registro.
  while (_inAscolto.length && _inAscolto[0].atteso < _risposte) _inAscolto.shift()
  if (_inAscolto[0]?.atteso !== _risposte) return
  const suo = _inAscolto.shift()
  if (_inAscolto.length === 0) {
    clearTimeout(_orologioAscolto)
    _orologioAscolto = null
  }
  // Qualcuno dall'altra parte c'è: la strada è aperta, e se la carta è
  // uscita il guaio di prima è passato (BUG-102).
  stampanteHaRisposto(!!res?.success)
  suo.racconta(res)
}

// Che cosa dice la risposta, in italiano. I codici dell'SDK sono quelli
// che si leggono sul manuale Epson; il resto passa com'è, perché un codice
// sconosciuto scritto per intero è più utile di un «errore generico».
const MOTIVI = {
  EPTR_COVER_OPEN: 'il coperchio della stampante è aperto',
  EPTR_REC_EMPTY: 'la carta è finita',
  EPTR_AUTOMATICAL: 'la stampante segnala un errore meccanico',
  EPTR_UNRECOVERABLE: 'la stampante è in errore e va riavviata',
  EPTR_CUTTER: 'la taglierina è bloccata',
  ASB_NO_PAPER: 'la carta è finita',
  ASB_COVER_OPEN: 'il coperchio della stampante è aperto',
  ASB_OFF_LINE: 'la stampante è fuori linea',
  EX_TIMEOUT: 'la stampante non ha risposto in tempo',
  DeviceNotFound: 'la stampante non risponde più',
}

function motivoDellaRisposta(res) {
  const codice = String(res?.code || '').trim()
  return MOTIVI[codice] || (codice ? `la stampante ha risposto «${codice}»` : 'la stampa non è riuscita')
}

// ── SOLO GLI ERRORI FANNO RUMORE (BUG-098) ───────────────────────────
//
// Una stampa riuscita non si annuncia: la carta è uscita e si vede, e un
// avviso a ogni comanda diventa rumore nel giro di mezz'ora. Una stampa
// NON riuscita sì, perché è l'unica cosa che nessuno nota — la chiusura di
// cassa che non esce è rimasta invisibile per settimane. L'avviso dice
// COSA non è uscito e PERCHÉ, in parole da banco; il codice dell'SDK resta
// nel registro, dove serve a chi ripara.
//
// E NIENTE VALANGHE. Con la stampante fuori linea falliscono dieci stampe
// di fila, e dieci strisce identiche una sull'altra sono peggio di una
// sola: si smette di leggerle, che è il modo migliore per non accorgersi
// di quella che conta. Lo STESSO motivo quindi non si ripete entro un
// minuto — il guasto è uno, e chi lo legge va a guardare il rotolo, non
// aspetta il decimo avviso. Le stampe mancate ci sono comunque TUTTE nel
// registro, che è il posto dove si contano.
const FINESTRA_AVVISO = 60000
let _ultimoAvviso = { motivo: '', quando: 0 }

function avvisaDiUnaStampaNonRiuscita(che, motivo) {
  const adesso = Date.now()
  if (motivo === _ultimoAvviso.motivo && adesso - _ultimoAvviso.quando < FINESTRA_AVVISO) return
  _ultimoAvviso = { motivo, quando: adesso }
  // `tag`: la notifica di sistema SOSTITUISCE la precedente invece di
  // impilarsi sulla schermata di blocco.
  notify('Stampa non riuscita', `${che}: ${motivo}`, { tag: 'stampa-non-riuscita' })
}

// Quello che la risposta ha da dire: al registro sempre, a schermo solo
// quando è andata male.
function raccontaLaRisposta(idLavoro, che, res) {
  if (res?.success) {
    aggiornaEsito(idLavoro, ESITO.riuscita, '')
    return
  }
  const motivo = motivoDellaRisposta(res)
  aggiornaEsito(idLavoro, ESITO.fallita, motivo)
  avvisaDiUnaStampaNonRiuscita(che, motivo)
}

// ── SE È VIVA LO DICE LEI, NON L'SDK (BUG-102) ───────────────────────
//
// La sera del 05/09 la stampante ha smesso di stampare tutto: non solo la
// chiusura — anche le RISTAMPE di chiusure vecchie, cioè fogli già pronti.
// E il pallino in alto è rimasto verde tutto il tempo.
//
// PERCHÉ IL VERDE MENTIVA. La vita del collegamento si chiedeva a
// `isConnected()` dell'SDK, che risponde di sì anche quando sta soltanto
// PROVANDO a riconnettersi (nel codice Epson lo stato `RECONNECTING` conta
// come connesso, ed è pure in OR fra due canali: basta che uno sembri su).
// Quindi: il battito non scattava mai, l'oggetto stampante restava in
// memoria, il controllo di stato lo trovava e diceva «ok», e ogni `send()`
// finiva in un collegamento che non c'era più. Nessun errore, nessun
// blocco, nessuna carta.
//
// LA CURA È SMETTERE DI CHIEDERLO ALL'SDK. La stampante quei fatti li dice
// da sé — `startMonitor()` la fa interrogare a intervalli e alza
// `onpoweroff` quando smette di rispondere, `onoffline` quando risponde ma
// è fuori linea, `ononline` quando torna, più coperchio e carta. L'app non
// ascoltava NESSUNO di questi: ascoltava solo la risposta ai singoli invii.
//
// PERCHÉ IL MONITOR NON PUÒ ROMPERE NIENTE, che è la condizione con cui è
// stato acceso. Non passa dal WebSocket delle stampe ma da una richiesta
// sua; quando fallisce alza `onstatuschange`/`onpoweroff` e NON butta giù
// il collegamento (nel codice Epson quella strada chiama `fireStatusEvent`,
// non `fireErrorEvent` — è l'altra che farebbe `cleanup()`); non alza
// `onreceive`, quindi non sballa il conto invii/risposte da cui dipende il
// registro; e nessuna stampa lo aspetta, mai.
//
// L'INTERROGAZIONE È UNA DOMANDA LUNGA, non un martellamento: la richiesta
// resta aperta fino a dieci secondi e la stampante risponde appena qualcosa
// cambia — un coperchio aperto si sa in un secondo, e a riposo il traffico
// è una richiesta ogni dieci secondi scarsi.
const INTERVALLO_MONITOR = 10000

// Quanti invii di fila possono restare senza risposta prima di dire che la
// strada è chiusa. UNO non vuol dire niente — una risposta può perdersi, e
// «non lo sappiamo» è la risposta onesta (BUG-098). TRE di fila no: quello
// è un collegamento che non c'è più, e continuare a mandarci fogli dentro è
// esattamente quello che è successo il 05/09. Serve da rete quando il
// monitor non c'è (firmware vecchio, richiesta bloccata dal browser).
const INVII_MUTI_PRIMA_DI_MOLLARE = 3

// L'ultimo guaio noto della STAMPANTE — non di una stampa. È quello che
// rende il pallino una informazione invece di una decorazione: verde perché
// la stampante ha risposto, non perché in memoria c'è un oggetto.
let _guasto = null
let _inviiMuti = 0

export function guastoStampante() {
  return _guasto
}

// HA RISPOSTO: la strada è aperta. Si azzera il conto dei muti — e se il
// guaio era suo (carta, coperchio, fuori linea) è passato, perché la carta
// è appena uscita.
function stampanteHaRisposto(andataBene) {
  _inviiMuti = 0
  _provataAlle = Date.now()
  if (andataBene) _guasto = null
}

// ── LA STAMPA CHE CONTA PARTE SU UN COLLEGAMENTO PROVATO ─────────────
//
// Il monitor scopre che la stampante non risponde piu', ma ci mette il suo
// giro: se il collegamento muore tre secondi prima della chiusura di cassa,
// dieci secondi non fanno in tempo. E la chiusura e' proprio la stampa che
// arriva dopo il buco piu' lungo — durante il servizio le comande si
// susseguono e il collegamento resta caldo, fra l'ultimo scontrino e la
// chiusura passano ore.
//
// Quindi prima di stampare, se il collegamento non e' stato PROVATO di
// recente, si fa quello che fa il tasto «Test stampa»: si butta e si rifa'
// la stretta di mano. E' l'unico gesto che non chiede niente a nessuno —
// chiedere «sei vivo?» all'SDK e' esattamente cio' che non funziona.
//
// PROVATO vuol dire UNA COSA SOLA: la stampante ha risposto a un invio. Non
// «l'SDK dice che il socket e' su» (mente, BUG-102) e nemmeno «il monitor
// gira»: il monitor alza `onstatuschange` solo quando lo stato CAMBIA, per
// cui una stampante sana e ferma non dice niente, e prenderlo per battito
// sarebbe un altro modo di credere a un silenzio.
//
// PERCHE' NON PRIMA DI OGNI STAMPA, che era la proposta di partenza. La
// connessione si tiene viva apposta: rifare la stretta di mano ogni volta
// faceva fallire la prima stampa quando l'eccezione del certificato era
// scaduta — cioe' in servizio, col cliente davanti — la stampante regge
// poche connessioni, e ogni riconnessione azzera il conto degli invii senza
// risposta, che e' la terza rete. Con la finestra si paga solo dove serve.
//
// LA FINESTRA E' UN NUMERO SOLO, e sta qui perche' si possa cambiare senza
// andare a cercare: a zero, si rifa' la stretta di mano prima di ogni
// singola stampa.
const FRESCHEZZA_COLLEGAMENTO = 120000
let _provataAlle = 0

// SI CHIEDE ALLA STAMPANTE, NON ALL'SDK — ed è la differenza fra le due
// domande che all'inizio avevamo confuso. «Il socket è vivo?» all'SDK non
// si può chiedere: mente (BUG-102). Ma il monitor a ogni giro scrive sulla
// testina lo stato che la STAMPANTE ha risposto, e quando smette di
// rispondere ci accende dentro il segno «nessuna risposta». Leggerlo costa
// zero: nessuna attesa, nessun traffico in più, e non è un'opinione — è
// quello che ha detto lei, al massimo dieci secondi fa.
//
// La costante si prende dall'oggetto invece di scrivere il numero a mano:
// è roba dell'SDK, e un giorno potrebbe non valere più uno.
function stampanteHaDettoDiNonRispondere(prn) {
  const segno = Number(prn?.ASB_NO_RESPONSE) || 0
  if (!segno) return false
  return ((Number(prn?.status) || 0) & segno) !== 0
}

function collegamentoDaRifare() {
  if (!_printer) return false
  // 1. QUELLO CHE HA DETTO LEI. Se il monitor gira, questo arriva entro un
  //    giro: molto prima che la finestra scada.
  if (stampanteHaDettoDiNonRispondere(_printer)) return true
  // 2. LA RETE DI RISERVA, per quando il monitor non c'è — firmware che non
  //    lo sostiene, richiesta bloccata. Senza monitor lo stato non si
  //    aggiorna mai, quindi il controllo qui sopra tace e a rispondere
  //    resta il tempo passato dall'ultima risposta vera.
  return Date.now() - _provataAlle >= FRESCHEZZA_COLLEGAMENTO
}

// UN GUAIO DELLA STAMPANTE. `mollaIlCollegamento` solo quando la stampante
// ha smesso di RISPONDERE: lì il collegamento non serve più a niente e la
// stampa dopo deve rifare la stretta di mano invece di parlare al vuoto.
// Carta finita e coperchio aperto no — quella è viva e ci parla, il
// collegamento è buono, e buttarlo vorrebbe dire una riconnessione inutile
// nel mezzo del servizio.
function guaioDellaStampante(motivo, { mollaIlCollegamento = false } = {}) {
  _guasto = motivo
  if (mollaIlCollegamento) scordaConnessione()
  avvisaDellaStampante(motivo)
}

// Come per le stampe non riuscite: lo stesso guaio non si ripete entro un
// minuto. Con la stampante spenta il monitor lo scoprirebbe ogni dieci
// secondi, e sei strisce identiche al minuto sono il modo migliore per
// smettere di leggerle.
let _ultimoAvvisoStampante = { motivo: '', quando: 0 }

function avvisaDellaStampante(motivo) {
  const adesso = Date.now()
  if (motivo === _ultimoAvvisoStampante.motivo && adesso - _ultimoAvvisoStampante.quando < FINESTRA_AVVISO) return
  _ultimoAvvisoStampante = { motivo, quando: adesso }
  notify('Stampante', motivo, { tag: 'stato-stampante' })
}

// Si ascolta quello che la stampante dice, e le si chiede di dirlo.
function ascoltaLaStampante(prn) {
  if (!prn) return
  // NON RISPONDE PIÙ: è il caso del 05/09. Si molla il collegamento.
  prn.onpoweroff = () => guaioDellaStampante('la stampante non risponde', { mollaIlCollegamento: true })
  // Risponde, ma non è in grado di stampare.
  prn.onoffline = () => guaioDellaStampante('la stampante è fuori linea')
  prn.oncoveropen = () => guaioDellaStampante('il coperchio della stampante è aperto')
  prn.onpaperend = () => guaioDellaStampante('la carta è finita')
  // È tornata: il pallino torna verde perché LEI ha risposto.
  prn.ononline = () => {
    _guasto = null
    _inviiMuti = 0
  }
  try {
    prn.interval = INTERVALLO_MONITOR
    prn.startMonitor?.()
  } catch {
    // Firmware che non lo sostiene, o richiesta bloccata: si resta come
    // prima, con la rete degli invii senza risposta. Non è un motivo per
    // non stampare.
  }
}

function fermaIlMonitor(prn) {
  try {
    prn?.stopMonitor?.()
  } catch {
    /* SDK in uno stato strano: si lascia stare */
  }
}

// ── CONNESSIONE TENUTA VIVA ───────────────────────────────────────────────
//
// Il certificato della stampante è auto-firmato: il browser lo accetta solo
// dopo che qualcuno è andato a mano su https://IP:8043 e ha detto sì, e
// quell'eccezione NON è per sempre — iPadOS la lascia cadere al riavvio, e
// l'app installata sulla home ha un suo spazio separato da Safari. Ogni volta
// che l'eccezione cade, la PRIMA stampa fallisce: cioè in servizio, con il
// cliente davanti.
//
// L'eccezione serve però solo alla STRETTA DI MANO. Finché il collegamento
// resta aperto non si ricontratta niente. Quindi lo si tiene vivo: un
// controllo ogni mezzo minuto e una riconnessione appena l'app torna in primo
// piano. Così la stretta di mano avviene una volta a inizio serata invece che
// a ogni scontrino — e se il certificato è caduto lo si scopre allora, non
// davanti al cliente.
//
// La soluzione DEFINITIVA non è codice: è installare il certificato della
// stampante come attendibile sul dispositivo (vedi la guida in Impostazioni →
// Stampante). Questo qui riduce i danni, non li elimina.
let _battito = null

function fermaBattito() {
  clearInterval(_battito)
  _battito = null
}

function avviaBattito() {
  fermaBattito()
  _battito = setInterval(() => {
    try {
      // `isConnected()` vale solo al contrario: quando dice DI NO la caduta
      // è certa e si libera tutto. Quando dice di sì non prova niente —
      // risponde così anche mentre sta soltanto provando a riconnettersi
      // (BUG-102), ed è per questo che a dire se la stampante è viva adesso
      // è LEI, col monitor, non questa riga.
      if (_device && !_device.isConnected()) scordaConnessione()
    } catch {
      /* SDK in uno stato strano: si lascia stare */
    }
  }, 30000)
}

// SCALDA LA CONNESSIONE: da chiamare quando si apre il gestionale o la cassa.
// Se il certificato non è più accettato, l'errore esce ADESSO — quando c'è
// tempo per sistemarlo — invece che al primo scontrino della serata.
export async function preparaStampante() {
  // Con la stampante finta non c'è niente da scaldare: risponde sempre.
  if (stampanteFintaAttiva()) return { ok: true }
  const s = loadPrinterSettings()
  if (!s.ip) return { ok: false, motivo: 'non configurata' }
  try {
    await getPrinter()
    // IL VERDE DEVE VOLER DIRE QUALCOSA (BUG-102). Prima bastava che la
    // stretta di mano fosse riuscita UNA volta: da lì in poi questa
    // funzione trovava l'oggetto in memoria e rispondeva «ok» senza
    // chiedere niente a nessuno — pallino verde con la stampante spenta.
    // Adesso se la stampante ha detto che c'è un guaio, quello si legge.
    return _guasto ? { ok: false, motivo: _guasto } : { ok: true }
  } catch (e) {
    return { ok: false, motivo: e.message }
  }
}

// Ritorno in primo piano (l'iPad si blocca fra un giro di tavoli e l'altro):
// si ricontrolla subito, così una caduta si scopre appena si riprende in mano
// il tablet e non alla prima comanda.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (!loadPrinterSettings().ip) return
    try {
      if (_device && !_device.isConnected()) scordaConnessione()
    } catch {
      /* niente da fare */
    }
  })
}

// Restituisce il printer object, connettendosi se necessario.
// Riusa la connessione esistente tra stampe consecutive.
async function getPrinter() {
  // IN LOCALE LA STAMPANTE È DI CARTA FINTA. Da un computer di sviluppo
  // l'apparecchio del bar non si raggiunge, e ogni modifica a comande e
  // scontrini si provava a occhio. Sull'ambiente di TEST no: lì ci si
  // collega a quella vera, ed è il posto dove provarla davvero.
  if (stampanteFintaAttiva()) {
    if (!_printer) {
      const finta = creaStampanteFinta('La Tana del Coniglio')
      // ANCHE LA FINTA RISPONDE. La catena della diagnostica (BUG-098) —
      // risposta, registro, avviso — si deve poter provare senza andare al
      // banco: la finta risponde come quella vera e sa fingere un guasto.
      finta.onreceive = (res) => rispostaDallaStampante(res, finta)
      // Anche la finta si ascolta: la catena «la stampante dice di stare
      // male → il pallino diventa rosso → parte l'avviso» si deve poter
      // provare senza avere l'apparecchio davanti.
      _guasto = null
      _provataAlle = Date.now()
      ascoltaLaStampante(finta)
      _printer = finta
    }
    return _printer
  }
  if (_printer) return _printer
  if (_connectPromise) return _connectPromise

  if (!sdkAvailable()) {
    throw new Error(
      'ePOS SDK non caricato. Scarica epos-2.27.0.js da Epson e mettilo in public/.'
    )
  }

  const s = loadPrinterSettings()
  if (!s.ip) throw new Error("Imposta l'IP della stampante nelle impostazioni.")

  // L'SDK sceglie il protocollo SOLO dalla porta: 8008 → ws (non sicuro),
  // qualunque altra → wss. Una pagina servita in HTTPS non può aprire un
  // WebSocket in chiaro: il browser lo blocca e l'SDK va in timeout dopo
  // ~10 s senza dire perché. Meglio fermarsi subito, spiegando cosa fare.
  const paginaSicura = typeof location !== 'undefined' && location.protocol === 'https:'
  if (paginaSicura && Number(s.port) === 8008) {
    throw new Error(
      "L'app è in HTTPS: la porta 8008 (non sicura) viene bloccata dal browser. " +
        'Usa la porta 8043 con SSL/TLS abilitato sulla stampante.'
    )
  }

  _connectPromise = new Promise((resolve, reject) => {
    const dev = new window.epson.ePOSDevice()
    _device = dev

    dev.connect(s.ip, s.port, (status) => {
      if (status !== 'OK' && status !== 'SSL_CONNECT_OK') {
        _device = null
        _connectPromise = null
        reject(new Error(`Connessione fallita (${status}). Controlla IP e che la stampante sia accesa.`))
        return
      }

      dev.createDevice(
        'local_printer',
        dev.DEVICE_TYPE_PRINTER,
        { crypto: s.https, buffer: false },
        (devobj, retcode) => {
          _connectPromise = null
          if (retcode !== 'OK') {
            _device = null
            reject(new Error(`Errore inizializzazione stampante: ${retcode}`))
            return
          }
          _printer = devobj
          avviaBattito()

          // Pulisce la connessione alla disconnessione così al prossimo
          // invio si riconnette in automatico.
          _printer.ondisconnect = () => {
            _printer = null
            _device = null
            fermaBattito()
          }

          // LA RISPOSTA FINIVA IN CONSOLE (BUG-098). Adesso torna al
          // foglio che l'ha causata e ne racconta l'esito nel registro —
          // senza trattenere nessuno: quel lavoro è chiuso da un pezzo.
          devobj.onreceive = (res) => rispostaDallaStampante(res, devobj)

          // E si sta a sentire quello che la stampante dice di sé: fuori
          // linea, carta, coperchio, e soprattutto «non rispondo più»
          // (BUG-102). Il collegamento è nuovo, quindi il guaio di prima
          // non vale più: lo ridirà lei, se c'è ancora.
          _guasto = null
          // La stretta di mano appena riuscita vale come prova: il
          // collegamento e' di adesso. Senza questo, la prima stampa dopo
          // una riconnessione lo troverebbe gia' scaduto e ne farebbe
          // un'altra, all'infinito.
          _provataAlle = Date.now()
          ascoltaLaStampante(devobj)

          resolve(_printer)
        }
      )
    })
  })

  return _connectPromise
}

// ── Utility di formattazione ──────────────────────────────────────────────────

// ── UN DATO STORTO NON FERMA LA CARTA (BUG-086) ──────────────────────
//
// `item.name.toUpperCase()` sulla comanda: una riga senza nome — un
// documento vecchio, una scrittura arrivata a metà — faceva saltare il
// ticket a metà builder, e l'auto-stampa ci riprovava a ogni snapshot
// senza uscire mai. Due funzioni più sotto, l'ordine al fornitore faceva
// già `String(l.name || '')`: la difesa c'era, ma in un posto solo.
//
// La scelta è che la carta ESCA COMUNQUE, e che si veda cos'è storto: al
// banco un ticket con «(senza nome)» si legge e si rimedia, un ticket che
// non esce no. Vale per tutte le stampe: comanda, scontrino, acconto,
// fattura.
const nomeRiga = (item) => String(item?.name ?? '').trim() || '(senza nome)'

// Quanti pezzi. Un valore che non è un numero non diventa «undefined»
// sulla carta: la riga c'è, quindi il pezzo è almeno uno.
const qtaRiga = (item) => {
  const q = Number(item?.qty)
  return Number.isFinite(q) ? q : 1
}

// Quanti euro. Un prezzo mancante vale zero e si stampa «0.00€»: prima
// diventava «NaN€», che sullo scontrino del cliente è peggio di uno zero.
const euroRiga = (v) => Number(v) || 0

// Riga testo-sinistra + testo-destra allineato col padding spazi.
function row(left, right, width = COL) {
  const avail = width - right.length
  const l = left.substring(0, avail - 1).padEnd(avail)
  return l + right + '\n'
}

function line(char = '-', width = COL) {
  return char.repeat(width) + '\n'
}

// Come si chiama un metodo di pagamento sulla carta. Metodo sconosciuto o
// assente: si scrive che non è indicato. Prima si ripiegava su "Contante", e
// uno scontrino pagato con la carta usciva con scritto contante — una
// dichiarazione falsa, non un default.
const nomeMetodo = (m) => PAYMENT_METHOD_PRINT[m] || 'Non indicato'

function italianDateTime(iso) {
  const d = new Date(iso || Date.now())
  const date = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return { date, time }
}

// ── UN LAVORO PER VOLTA, E MAI I RESTI DI QUELLO PRIMA (BUG-052) ─────
//
// LA STAMPANTE HA UN BUILDER SOLO. `getPrinter()` restituisce sempre lo
// stesso oggetto — la connessione si tiene viva fra una stampa e l'altra,
// ed è giusto così — ma quell'oggetto ACCUMULA i comandi e li spedisce
// tutti insieme a `send()`. Chi ci scrive dentro sta scrivendo in un posto
// condiviso, e finché non chiama `send()` quel posto è suo.
//
// DUE MODI DI ROVINARE LA CARTA, tutti e due visti:
//
// 1. UNA STAMPA CHE SI FERMA A METÀ. Se fra il primo comando e `send()`
//    salta un'eccezione — una riga senza nome, un dato storto — i pezzi già
//    scritti RESTANO nel builder. Il lavoro dopo ci scrive sopra e se li
//    porta via: è uscita una comanda con dentro DUE ordini diversi, due
//    intestazioni e due numeri, e al banco è un ticket da buttare. Peggio
//    ancora perché l'auto-stampa RIPROVA (releaseComandaPrint), quindi il
//    residuo si accumula a ogni giro.
// 2. DUE STAMPE CHE SI ACCAVALLANO. Ogni print* comincia con un `await`
//    (getPrinter), e `printScontrino` ne ha un altro DENTRO, sul logo:
//    se due lavori partono nello stesso giro — e partono, la coda ordini
//    stampa comande e scontrini di più conti nello stesso snapshot — il
//    secondo scrive nel builder mentre il primo è sospeso.
//
// LA CURA STA QUI E NON NEI CHIAMANTI. Sistemare il `for` dell'auto-stampa
// avrebbe lasciato la porta aperta a tutti gli altri (il tasto della coda,
// quello del conto, la sala, il fornitore): ogni lavoro passa da questa
// coda, aspetta chi lo precede, parte da un builder PULITO e lo lascia
// pulito anche quando fallisce. Nessun chiamante può più intrecciarsi,
// nemmeno uno scritto domani.
let _codaStampa = Promise.resolve()

// ── UNA STAMPA CHE NON FINISCE NON PUÒ TENERSI IL CONTO (BUG-086) ────
//
// La sera del 24/08 il logo non è mai arrivato e `printScontrino` è
// rimasto sospeso lì dentro. Il danno non è stato solo la carta che non
// usciva: una promessa che non si chiude NÉ BENE NÉ MALE non fa partire
// il `catch` di chi ha chiesto la stampa, e quel `catch` è l'unico posto
// dove la pretesa dello scontrino torna libera (`releaseReceiptPrint`).
// Risultato: la pretesa presa per sempre — quel conto non stampava più,
// nemmeno riaperto, nemmeno dalla coda — e nessun errore a schermo. Al
// banco: cinque riscossioni, zero scontrini, e nessuno che capisse perché.
//
// Il tempo massimo sul logo (BUG-053) copre QUEL passaggio. Questo copre
// il lavoro INTERO — la connessione che non risponde, un `await` aggiunto
// qui domani, qualunque cosa si impicchi: scaduto il tempo la promessa
// RIFIUTA, e da lì funziona tutto quello che è già scritto (pretesa
// liberata, messaggio a schermo, stampa dopo che parte).
//
// QUINDICI SECONDI. Sotto ci sta comoda ogni attesa legittima: l'SDK molla
// il collegamento da sé intorno ai dieci secondi, il logo ai tre. Sopra non
// c'è più niente da aspettare — è una stampante che non risponde, e chi ha
// il cliente davanti deve saperlo adesso, non a fine serata.
const TEMPO_MASSIMO_LAVORO = 15000

// E NIENTE DOPPIONI. Un lavoro scaduto non si può interrompere a metà —
// una Promise non si annulla — ma gli si può togliere la penna: da lì in
// poi scrive su un guscio sordo. Così se poi arriva davvero in fondo, il
// suo `send()` non fa uscire una seconda copia e il suo
// `clearCommandBuffer()` non cancella la carta di chi sta stampando
// adesso. Le costanti (ALIGN_CENTER, COLOR_1…) passano sempre: sono
// valori, non gesti.
function pennaDelLavoro(prn, vivo) {
  const guscio = new Proxy(prn, {
    get(target, chiave) {
      const v = target[chiave]
      if (typeof v !== 'function') return v
      return (...args) => {
        // L'SDK Epson concatena (`prn.addText(...).addCut()`): chi
        // restituisce sé stesso deve restituire il GUSCIO, o il resto del
        // ticket scavalcherebbe la difesa scrivendo sulla stampante vera.
        if (!vivo()) return guscio
        const esito = v.apply(target, args)
        return esito === target ? guscio : esito
      }
    },
  })
  return guscio
}

// L'ETICHETTA DEL LAVORO NEL REGISTRO. Dice COSA si sta stampando e di
// quale conto, e si ferma lì: il numero di giornata basta a ritrovarlo, e
// non è il dato di nessuno. Il nome del cliente in un registro di
// diagnostica non ci deve entrare (vedi registroStampe.js).
const etichettaConto = (che, order) =>
  order?.daily_number ? `${che} conto #${order.daily_number}` : che

// IL LAVORO SI CHIUDE SULL'INVIO. Chi ha chiesto la stampa ha il suo esito
// appena il foglio è partito: nessuna attesa della stampante nel mezzo di
// un gesto. La risposta, se e quando arriva, aggiorna la voce nel registro
// per conto suo (vedi «la risposta della stampante è diagnostica»).
function lavoroDiStampa(componi, che = 'Stampa') {
  const idLavoro = lavoroInCoda(che)
  let scaduto = false
  const mio = _codaStampa.then(async () => {
    lavoroPartito(idLavoro)
    // Il cronometro parte col LAVORO, non con la richiesta: chi aspetta il
    // suo turno in coda non ha ancora fatto niente di lento.
    let cronometro
    const scadenza = new Promise((_, ko) => {
      cronometro = setTimeout(() => {
        scaduto = true
        // Il collegamento non è più affidabile: la stampa dopo rifà la
        // stretta di mano invece di mettersi in fila dietro la stessa
        // attesa appesa.
        scordaConnessione()
        ko(new Error('la stampante non ha risposto entro 15 secondi'))
      }, TEMPO_MASSIMO_LAVORO)
    })
    const lavoro = (async () => {
      // PRIMA DI STAMPARE SI GUARDA COM'È MESSO IL COLLEGAMENTO: se la
      // stampante ha detto di non rispondere, o se dall'ultima risposta è
      // passato troppo, si riparte da zero come fa «Test stampa». Si chiude
      // per bene, perché qui il collegamento può benissimo essere sano e
      // lasciarlo mezzo aperto sulla stampante non serve a nessuno.
      if (collegamentoDaRifare()) scordaConnessione({ chiudendo: true })
      const vera = await getPrinter()
      const prn = pennaDelLavoro(vera, () => !scaduto)
      // Si parte puliti: se chi c'era prima si è fermato a metà, i suoi pezzi
      // non finiscono sulla nostra carta.
      prn.clearCommandBuffer?.()
      try {
        await componi(prn)
        // Se il lavoro è già scaduto la penna è sorda e `send()` non parte:
        // quell'invio non si conta e non si ascolta, perché una risposta
        // non arriverà mai.
        if (!scaduto) {
          _inviati += 1
          // LA VOCE ENTRA NEL REGISTRO PRIMA DELLA `send()`, come
          // «inviata»: la stampante finta risponde DENTRO `send()`, e una
          // risposta che arrivasse prima della voce non avrebbe niente da
          // aggiornare.
          lavoroInviato(idLavoro)
          ascoltaLaRisposta(vera, _inviati, (res) => raccontaLaRisposta(idLavoro, che, res))
        }
        prn.send()
      } catch (e) {
        // E non si lasciano resti a chi viene dopo.
        prn.clearCommandBuffer?.()
        throw e
      }
    })()
    // Se ha già vinto la scadenza, il rifiuto del lavoro non lo ascolta più
    // nessuno: si raccoglie qui, per non lasciarlo per aria.
    lavoro.catch(() => {})
    try {
      await Promise.race([lavoro, scadenza])
    } catch (e) {
      // Non è nemmeno arrivato a mandare: documento storto o lavoro
      // impiccato (BUG-086). Nessun avviso da qui — il chiamante riceve il
      // rifiuto e lo dice già lui; questo lo scrive solo nel registro.
      lavoroNonPartito(idLavoro, e.message)
      throw e
    } finally {
      clearTimeout(cronometro)
    }
  })
  // La catena non si spezza su un errore: la stampa dopo deve partire
  // comunque — carta finita adesso non vuol dire stampante morta.
  _codaStampa = mio.catch(() => {})
  return mio
}

// ── COMANDA ───────────────────────────────────────────────────────────────────
// Ticket per il barista: numero ordine grande, articoli senza prezzi.
// Formato ispirato al template fotografato (sfondo nero, orario, sezione BAR).

// ── UN TICKET È UNA COMANDA SOLA (BUG-051) ──────────────────────────
//
// Chi chiama la stampa dice QUALE comanda: se non lo dice, qui c'era il
// ripiego `order.order_items`, cioè l'AGGREGATO del conto — le righe di
// tutte le comande fuse in una, con le quantità sommate. Su un conto con
// due comande usciva un ticket solo che sembrava una comanda e ne
// conteneva due, e dal facsimile non si vedeva nemmeno: la comanda non
// porta scritto il suo numero. Il chiamante che ci arrivava davvero è il
// tasto «Comanda» della coda, che cerca la comanda ATTIVA: appena non ce
// n'è più una aperta (tutto servito, o il conto pagato) la ricerca non
// trova niente e si stampava l'intero conto.
//
// La scelta sta qui e non nei cinque chiamanti: senza comanda si stampa
// l'ULTIMA del conto — quella che si vuole ristampare quando si chiede
// «la comanda» senza dire quale. L'aggregato resta solo per un ordine che
// di comande non ne ha (i doc vecchi, e un conto appena nato in locale).
export function comandaDelTicket(order, comanda = null) {
  if (comanda) return comanda
  const aperte = (order?.comande || []).filter((c) => c && c.status !== 'annullato')
  return aperte.at(-1) || null
}

// ── LA FASCIA NERA DICE QUALE TICKET È (BUG-089) ─────────────────────
//
// «Non usiamo Diretto o Subito. Chiamiamo Comanda X - Ordine Y sulla
// comanda» (l'utente, 25/08/2026).
//
// PRIMA C'ERA «DIRETTO», SU OGNI TICKET. È un'etichetta di SumUp POS Pro
// — il modello da cui questa carta è stata copiata — e là vuol dire una
// cosa precisa: quando un ordine si spedisce in cucina a portate,
// «Diretto» è la PRIMA infornata, quella che parte subito, e le
// successive si chiamano «Ordine 1», «Ordine 2». Noi la stampavamo
// uguale su tutte, anche sulla seconda e sulla terza comanda dello stesso
// tavolo: un ticket che dichiarava «questo va adesso» mentre era il
// secondo invio. La parola giusta ce l'avevamo già nei dati.
//
// DUE RIGHE E NON UNA. A corpo doppio sulla carta da 80 mm ci stanno 24
// caratteri: «COMANDA 2 - ORDINE 28» ne occupa 21, e con l'ora accanto
// sfonderebbe. L'ora scende sotto, dentro lo stesso rettangolo nero, e le
// due righe si pareggiano in larghezza — se no il nero uscirebbe a
// scaletta.
//
// Torna l'elenco delle righe da scrivere, vuoto se la fascia è spenta:
// resta una funzione pura, che si prova senza stampante.
export const LARGHEZZA_FASCIA = COL / 2

export function strisciaComanda(cfg, hhmm, order = null, comanda = null) {
  if (!cfg.mostra('fascia')) return []
  const quale = numeroComanda(order, comanda)
  const conto = order?.daily_number
  // Niente «undefined» sulla carta: quello che non si sa non si scrive, e
  // se non si sa niente la fascia non esce (stessa regola di nomeRiga e
  // compagni, BUG-086).
  const nomi = [
    quale ? `COMANDA ${quale}` : '',
    conto == null || conto === '' ? '' : `ORDINE ${conto}`,
  ].filter(Boolean)
  const righe = [nomi.join(' - '), cfg.mostra('ora') ? hhmm : ''].filter(Boolean)
  if (!righe.length) return []
  // Il respiro ai lati si dà solo se ci sta: senza, la fascia andrebbe a
  // capo da sola e il rettangolo nero si spezzerebbe in due.
  const testo = Math.max(...righe.map((r) => r.length))
  const largo = Math.min(testo + 2, LARGHEZZA_FASCIA)
  return righe.map((r) => {
    const vuoto = Math.max(largo - r.length, 0)
    const sinistra = Math.floor(vuoto / 2)
    return `${' '.repeat(sinistra)}${r}${' '.repeat(vuoto - sinistra)}`
  })
}

// `comanda` opzionale: stampa i soli item di quella comanda (aggiunte a un
// conto aperto). Senza, la sceglie comandaDelTicket — e mai due insieme.
export function printComanda(order, comanda = null) {
  // IL CANCELLO STA QUI, all'ultimo passo, e non nei cinque chiamanti: è
  // la stessa ragione per cui la coda delle stampe vive in `lavoroDiStampa`
  // (BUG-052). Un conto annullato non ha carta da far uscire, nemmeno dal
  // tasto a mano, nemmeno da un chiamante scritto domani.
  if (lavoroAnnullato(order, comandaDelTicket(order, comanda))) return Promise.resolve()
  return lavoroDiStampa(async (prn) => {
    const cfg = configStampa(impostazioniDelLocale(), 'comanda')
    const now = new Date()
    const hhmm = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    // ACCORPATE SEMPRE, qui e non nei chiamanti: la regola vale per la
    // CARTA — comanda singola, ristampa, ticket unito — e passa tutta da
    // questo punto (BUG-083). La regola è pura e sta in lib/comande.js.
    const ticketItems = righeDellaComanda(
      comandaDelTicket(order, comanda)?.items ?? order.order_items ?? []
    )
    const totalQty = pezziDellaComanda(ticketItems)

    prn.addTextLang('it')
    prn.addTextSmooth(true)

    // Di suo il logo sulla comanda non esce: al banco è carta consumata.
    await stampaLogo(prn, 'comanda')

    // ── Header nero: "COMANDA 2 - ORDINE 28", e sotto l'ora ──
    const striscia = strisciaComanda(cfg, hhmm, order, comandaDelTicket(order, comanda))
    if (striscia.length) {
      prn.addTextAlign(prn.ALIGN_CENTER)
      prn.addTextStyle(true, false, true, prn.COLOR_1)  // reverse = bianco su nero
      prn.addTextSize(2, 2)
      for (const riga of striscia) prn.addText(`${riga}\n`)
      prn.addTextSize(1, 1)
      prn.addTextStyle(false, false, false, prn.COLOR_1)
      prn.addText('\n')
    }

    // ── Contatore / sezione ──
    prn.addTextAlign(prn.ALIGN_LEFT)
    const conteggio = cfg.mostra('conteggio')
    const reparto = cfg.mostra('reparto')
    if (conteggio) prn.addText(row(cfg.testo('conteggio'), `CL: ${totalQty}`))
    if (reparto) prn.addText(row(cfg.testo('reparto'), 'Vendeur'))
    // La riga vuota è il respiro DI QUELLE righe: senza di loro non
    // separerebbe niente, e sarebbe solo carta.
    if (conteggio || reparto) prn.addText('\n')

    // ── Tavolo / numero ordine (grande, centrato) ──
    prn.addTextAlign(prn.ALIGN_CENTER)
    const titolo = cfg.mostra('titolo')
    if (titolo) {
      prn.addTextSize(2, 2)
      prn.addTextStyle(false, false, true, prn.COLOR_1)
      const label = order.customer_name
        || (order.table_label ? `Tavolo ${order.table_label}` : null)
        || `#${order.daily_number}`
      prn.addText(`${label}\n`)
      prn.addTextSize(1, 1)
      prn.addTextStyle(false, false, false, prn.COLOR_1)
    }
    const sottotitolo = cfg.parole('sottotitolo')
    if (sottotitolo) prn.addText(`${sottotitolo}\n`)
    if (titolo || sottotitolo) prn.addText('\n')

    // ── Articoli (doppia altezza per leggibilità dal barista) ──
    // LA LISTA DEI PRODOTTI NON SI TOGLIE: non è fra i campi, e non c'è
    // impostazione che possa arrivare qui.
    prn.addTextAlign(prn.ALIGN_LEFT)
    prn.addText(line())
    prn.addTextSize(1, 2)
    const conNote = cfg.mostra('note_riga')
    for (const item of ticketItems) {
      prn.addText(`${qtaRiga(item)}  ${nomeRiga(item).toUpperCase()}\n`)
      // Nota della singola riga (es. "poco ghiaccio", o per chi è): il banco
      // deve vederla sotto al prodotto, in corpo normale.
      if (item.note && conNote) {
        prn.addTextSize(1, 1)
        prn.addText(`     > ${item.note}\n`)
        prn.addTextSize(1, 2)
      }
    }
    prn.addTextSize(1, 1)
    prn.addText(line())

    if (order.note && cfg.mostra('nota_conto')) {
      prn.addTextStyle(false, false, true, prn.COLOR_1)
      prn.addText(`Nota: ${order.note}\n`)
      prn.addTextStyle(false, false, false, prn.COLOR_1)
      prn.addText(line())
    }

    const saluto = cfg.parole('riga_cortesia')
    if (saluto) {
      prn.addTextAlign(prn.ALIGN_CENTER)
      prn.addText(`${saluto}\n`)
      prn.addTextAlign(prn.ALIGN_LEFT)
    }

    prn.addFeedLine(3)
    prn.addCut(prn.CUT_FEED)
  }, etichettaConto('Comanda', order))
}

// ── PIÙ COMANDE DELLO STESSO CONTO, IN UN COLPO ──────────────────────
//
// «Se ho più di una comanda (dello stesso ordine!) devo poterle stampare
// insieme» (l'utente, 20/08). Un conto battuto in tre riprese ha tre
// ticket, e ristamparli uno per uno col conto in mano è tempo perso al
// banco.
//
// IN SEQUENZA, NON FUSE. Ogni comanda resta il SUO ticket, identico a
// quello che esce da solo — stesso formato, stesso taglio in fondo: al
// banco un ticket è un giro di lavoro, e due giri su una striscia sola
// sarebbero il difetto di BUG-051 rifatto apposta. Si aspetta ogni stampa
// prima della successiva: il builder della stampante è UNO SOLO
// (getPrinter tiene la connessione viva fra una stampa e l'altra), e due
// stampe che si accavallano si scriverebbero addosso.
//
// Le annullate restano fuori: è lavoro buttato, e ristamparlo rimetterebbe
// al banco un ticket che non si deve preparare.
export function comandeStampabili(order) {
  return (order?.comande || []).filter((c) => c && c.status !== 'annullato')
}

export async function printComande(order, comande) {
  const lista = comande?.length ? comande : comandeStampabili(order)
  // Uno per volta: ci pensa già la coda delle stampe (lavoroDiStampa), ma
  // aspettare qui tiene anche l'ORDINE — i ticket escono nella sequenza in
  // cui il conto è stato battuto, che è come il banco li legge.
  for (const c of lista) {
    await printComanda(order, c)
  }
  return lista.length
}

// ── TUTTO SU UNA RICEVUTA SOLA, MA DI UN ORDINE SOLO ─────────────────
//
// «Avere la possibilità di stampare comande separate se ci sono più
// comande è giusto, e anche di stampare UNA SOLA comanda con tutti i
// prodotti di più comande ma sempre dello stesso ordine. Va bene stampare
// tutte le comande insieme su più ricevute ma serve anche stampare tutto
// su una sola ricevuta» (l'utente, 20/08).
//
// Il ticket è quello di sempre — stesso formato, non c'è un secondo
// disegno da mantenere: cambia solo cosa ci finisce dentro, cioè le righe
// di tutte le comande del conto messe insieme (accorpate come su ogni
// comanda, vedi `righeDellaComanda`: stesso drink allo stesso prezzo e con
// la stessa nota fa una riga sola, il resto resta riga a sé).
//
// È LA STESSA FORMA che in BUG-051 era il ripiego accidentale di
// `printComanda` senza comanda. La differenza è tutta qui: prima capitava,
// adesso la sceglie chi stampa. E il confine non si sposta — UN ORDINE:
// questa funzione prende un ordine, non una lista, e non c'è modo di
// passarle roba di conti diversi.
export function printComandaUnita(order) {
  // LE RIGHE GREZZE DI TUTTE LE COMANDE, e ad accorparle ci pensa
  // `printComanda` come per ogni altro ticket. Prima qui c'era
  // `aggregateItems`, che è l'aggregato PER I SOLDI: fonde per `drink_id` e
  // basta, quindi due Spritz con note diverse diventavano una riga sola e
  // una delle due note spariva dalla carta.
  return printComanda(order, {
    id: 'unita',
    items: comandeStampabili(order).flatMap((c) => c.items || []),
  })
}

// ── SCONTRINO NON FISCALE ─────────────────────────────────────────────────────
// Per il cliente: intestazione locale, articoli con prezzi, IVA, totale.
// Formato ispirato al template fotografato di SumUp POS Pro.

// ── IL LOGO IN CIMA ALLO SCONTRINO ───────────────────────────────────
//
// Il preconto è il pezzo di carta che resta in mano al cliente: senza segno
// del locale è un tabulato, e non si distingue da quello del bar accanto.
//
// La testina stampa immagini in bianco e nero, riga per riga: l'immagine va
// portata su un canvas e passata come contesto 2D (è l'unica forma che
// l'SDK Epson accetta). Si tiene STRETTA — 220 punti, meno di metà della
// carta da 80 mm — perché una testina termica disegna a puntini e un logo
// grande esce sporco e mangia carta a ogni conto.
//
// Se non si carica non se ne fa niente: uno scontrino senza logo è ancora
// uno scontrino, uno scontrino che non esce è un cliente che aspetta.
//
// QUALE immagine e SU QUALI stampe lo decide il locale (REQ-STAMPA-011,
// lib/campiStampa.js). Senza niente di scelto vale quella del programma,
// `public/logo.png`, e vale dove è sempre valsa: scontrino e preconto.

// TRE STATI, NON DUE. Qui c'era `null` a dire due cose diverse — «mai
// provato» e «provato, non c'è» — e la seconda non veniva mai ricordata:
// se `logo.png` manca, o non è nella cache del service worker, OGNI
// scontrino rifaceva il caricamento e aspettava l'errore prima di stampare.
// La carta usciva dopo, ogni volta. `undefined` vuol dire «mai provato»,
// `null` vuol dire «provato e non c'è»: si tenta una volta sola.
let _logoCanvas // undefined = mai provato
// …ma «una volta sola» vale PER QUELL'IMMAGINE. Da quando il logo si
// carica dalle impostazioni, cambiarlo cambia l'indirizzo: senza questa
// riga il locale caricava il logo nuovo e continuava a stampare il
// vecchio finché non riavviava l'app.
let _logoUrl

// Esportata per la prova: dall'esterno non la chiama nessuno, ma il
// «si tenta una volta sola» si dimostra solo contando i tentativi.
export async function logoPerStampa(immagine = null) {
  if (typeof document === 'undefined') return null
  const url = immagine || `${import.meta.env.BASE_URL || '/'}logo.png`
  if (_logoCanvas !== undefined && _logoUrl === url) return _logoCanvas
  _logoUrl = url
  try {
    const img = await new Promise((ok, ko) => {
      const i = new Image()
      // TEMPO MASSIMO. Da quando la stampa è una coda (BUG-052), un logo
      // che non arriva mai non sporca più i ticket — li FERMA: nessuna
      // stampa esce finché questa promessa non si risolve. Tre secondi e
      // si stampa senza logo; il risultato finisce in _logoCanvas come
      // «provato e non c'è», quindi non si riprova a ogni scontrino.
      const tempoScaduto = setTimeout(() => ko(new Error('logo: tempo scaduto')), 3000)
      i.onload = () => {
        clearTimeout(tempoScaduto)
        ok(i)
      }
      i.onerror = (e) => {
        clearTimeout(tempoScaduto)
        ko(e)
      }
      i.src = url
    })
    const h = Math.round((img.height / img.width) * LARGHEZZA_LOGO)
    const canvas = document.createElement('canvas')
    canvas.width = LARGHEZZA_LOGO
    canvas.height = h
    const ctx = canvas.getContext('2d')
    // Fondo bianco: la carta è bianca, e un PNG trasparente diventerebbe
    // una macchia nera.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, LARGHEZZA_LOGO, h)
    ctx.drawImage(img, 0, 0, LARGHEZZA_LOGO, h)
    _logoCanvas = { ctx, larghezza: LARGHEZZA_LOGO, altezza: h, url }
  } catch {
    _logoCanvas = null
  }
  return _logoCanvas
}

// Mette il logo in cima, se il locale lo vuole SU QUESTA stampa, se la
// stampante sa farlo e se l'immagine c'è.
async function stampaLogo(prn, tipo) {
  const impostazioni = impostazioniDelLocale()
  if (!logoAcceso(impostazioni, tipo)) return
  const logo = await logoPerStampa(immagineCaricata(impostazioni))
  if (!logo) return
  try {
    prn.addTextAlign(prn.ALIGN_CENTER)
    // La stampante finta vuole solo l'indirizzo: lo mostra nel facsimile.
    if (typeof prn.addImageUrl === 'function') prn.addImageUrl(logo.url)
    else if (typeof prn.addImage === 'function') {
      prn.addImage(logo.ctx, 0, 0, logo.larghezza, logo.altezza, prn.COLOR_1)
    }
  } catch {
    /* la carta esce lo stesso: il logo è un di più */
  }
}

export function printScontrino(order, opts = {}) {
  return lavoroDiStampa(async (prn) => {
    const s = loadPrinterSettings()
    const impostazioni = impostazioniDelLocale()
    const cfg = configStampa(impostazioni, 'scontrino')
    const ivaRate = Number(opts.ivaRate ?? aliquotaScontrino(impostazioni)) / 100
    const { date, time } = italianDateTime(order.created_at)
    const lordo = Number(order.total ?? 0)
    // GLI SCONTI, AL PLURALE. Uno per ogni riscossione che se n'è portato via
    // uno: due amici che pagano il loro e ognuno si fa scontare le sue birre
    // sono due righe, non una somma che non si sa da dove esce.
    const sconti = scontiDelConto(order)
    const sconto = scontoTotale(order)
    // Il totale dello scontrino è quello REALMENTE pagato: prima si stampava il
    // lordo e lo sconto applicato non compariva da nessuna parte.
    const total = Math.max(0, Math.round((lordo - sconto) * 100) / 100)
    const ivaAmount = total - total / (1 + ivaRate)
    const imponibile = total / (1 + ivaRate)

    prn.addTextLang('it')
    prn.addTextSmooth(true)

    // ── Intestazione ──
    // Preconto o scontrino lo dice il conto, non chi ha premuto: il logo
    // può stare sull'uno e non sull'altro (REQ-STAMPA-011).
    await stampaLogo(prn, tipoScontrino(order))
    prn.addTextAlign(prn.ALIGN_CENTER)
    const nome = cfg.mostra('nome_locale')
    const via = cfg.mostra('indirizzo')
    const citta = cfg.mostra('citta')
    if (nome) {
      prn.addTextSize(2, 2)
      prn.addTextStyle(false, false, true, prn.COLOR_1)
      prn.addText(`${s.businessName}\n`)
      prn.addTextSize(1, 1)
      prn.addTextStyle(false, false, false, prn.COLOR_1)
    }
    if (via) prn.addText(`${s.businessAddress}\n`)
    if (citta) prn.addText(`${s.businessCity}\n`)
    // Il vuoto sotto l'intestazione la stacca dal conto: senza
    // intestazione non stacca niente.
    if (nome || via || citta) prn.addText('\n')
    prn.addTextAlign(prn.ALIGN_LEFT)

    // ── Numero scontrino + data ──
    if (cfg.mostra('numero')) {
      prn.addText(row(`SCONTRINO - ${order.daily_number ?? '-'}`, `${date}, ${time}`))
    }
    // ── LE TRE RIGHE SOTTO AL NUMERO (BUG-088) ──────────────────────
    // Erano un residuo del modello da cui il ticket è nato: una
    // costante scritta a mano («Utente A»), il numero del conto
    // ripetuto e chiamato comanda, e un plurale attaccato male («2
    // clientei»). Le regole stanno in campiStampa.js, pure e provate
    // senza stampante; qui restano gli interruttori, che nessuno ha
    // chiesto di togliere.
    //
    // Nome e riga di vendita si stampano SOLO SE DICONO QUALCOSA: senza
    // nessuno collegato, e senza tavolo né cliente, la riga non esce
    // affatto. Meglio una riga in meno di una formula vuota.
    const operatore = nomeDiChiStampa()
    if (operatore && cfg.mostra('operatore')) prn.addText(`${operatore}\n`)
    if (cfg.mostra('persone')) prn.addText(`${rigaPersone(order.coperto_persons)}\n`)
    const vendita = rigaVendita(order)
    if (vendita && cfg.mostra('riga_vendita')) prn.addText(`${vendita}\n`)
    prn.addText(line())

    // ── Header colonne ──
    if (cfg.mostra('intestazione_colonne')) {
      prn.addTextStyle(false, false, true, prn.COLOR_1)
      prn.addText(row('QTA  Prodotto', 'PU       Prezzo'))
      prn.addTextStyle(false, false, false, prn.COLOR_1)
      prn.addText(line())
    }

    // ── Articoli ──
    // NON SI TOLGONO: le righe e il totale sono lo scontrino. Non stanno
    // fra i campi, e nessuna impostazione può arrivare qui.
    for (const item of (order.order_items || [])) {
      const pu = `${euroRiga(item.unit_price).toFixed(2)}€`
      const tot = `${(qtaRiga(item) * euroRiga(item.unit_price)).toFixed(2)}€`
      const left = `${qtaRiga(item)}x  ${nomeRiga(item)}`
      prn.addText(row(left, `${pu.padStart(7)} ${tot.padStart(7)}`))
    }

    // Coperto (se presente)
    if (order.coperto_amount > 0 && cfg.mostra('coperto')) {
      const cop = `${Number(order.coperto_amount).toFixed(2)}€`
      prn.addText(row(`${order.coperto_persons}x  Coperto`, `${cop.padStart(7)} ${cop.padStart(7)}`))
    }

    // ── Sconti applicati ──
    // Con UNO SOLO su tutto il conto la riga resta quella di sempre
    // («Sconto»), che è come esce lo scontrino di un conto vecchio. Da due in
    // su ognuno dice su che cosa cadeva, se no sono cifre senza una ragione.
    if (sconto > 0 && cfg.mostra('sconto')) {
      prn.addText(row('Subtotale', `${lordo.toFixed(2)}€`))
      for (const s of sconti) {
        prn.addText(row(s.etichetta, `-${s.importo.toFixed(2)}€`))
      }
    }

    prn.addText(line())

    // ── IVA ──
    if (cfg.mostra('iva')) {
      const ivaLabel = `IVA ${(ivaRate * 100).toFixed(1)}% (A)`
      prn.addText(row(ivaLabel, `${ivaAmount.toFixed(2)}€`))
      prn.addText(row('Subtotale', `${imponibile.toFixed(2)}€`))
    }
    prn.addText('\n')

    // ── Totale grande ──
    prn.addTextAlign(prn.ALIGN_CENTER)
    prn.addTextSize(1, 2)
    prn.addTextStyle(false, false, true, prn.COLOR_1)
    prn.addText('Totale con IVA\n')
    prn.addTextSize(3, 3)
    prn.addText(`${total.toFixed(2)}€\n`)
    prn.addTextSize(1, 1)
    prn.addTextStyle(false, false, false, prn.COLOR_1)
    prn.addText('\n')
    prn.addTextAlign(prn.ALIGN_LEFT)
    prn.addText(line())

    // ── Pagamenti ──
    if (cfg.mostra('pagamenti')) {
      prn.addTextStyle(false, false, true, prn.COLOR_1)
      prn.addText('Pagamenti\n')
      prn.addTextStyle(false, false, false, prn.COLOR_1)
      // Metodo sconosciuto o assente: si scrive che non è indicato. Prima si
      // ripiegava su "Contante", e uno scontrino pagato con la carta usciva
      // con scritto contante — una dichiarazione falsa, non un default.
      // Se ci sono incassi registrati si elencano uno per uno (conti divisi o
      // acconti): così su ogni scontrino si legge quanto in contanti e quanto in
      // carta. Altrimenti si usa il metodo di chiusura del conto.
      const incassi = (order.payments || []).filter((p) => Number(p.amount) > 0)
      if (incassi.length > 0) {
        for (const p of incassi) {
          prn.addText(row(`${nomeMetodo(p.method)} (A)`, `${Number(p.amount).toFixed(2)}€`))
        }
      } else {
        prn.addText(row(`${nomeMetodo(order.payment_method)} (A)`, `${total.toFixed(2)}€`))
      }
      // ── E QUANTO RESTA ────────────────────────────────────────────
      // Sul PRECONTO di un conto su cui sono già stati presi degli acconti
      // qui finiva l'elenco: «Totale con IVA 46,00» sopra e «Contante
      // 13,00» sotto, e la sottrazione la faceva a mente chi teneva il
      // foglio davanti al cliente. Su uno scontrino di chiusura il residuo
      // è zero e la riga non compare — è solo il conto ancora aperto che
      // ha qualcosa da dire.
      const residuo = orderDue(order)
      if (incassi.length > 0 && residuo > 0) {
        prn.addTextStyle(false, false, true, prn.COLOR_1)
        prn.addText(row('Resta da pagare', `${residuo.toFixed(2)}€`))
        prn.addTextStyle(false, false, false, prn.COLOR_1)
      }
      prn.addText(line())
    }

    // ── Codice lotteria degli scontrini (se comunicato dal cliente) ──
    if (order.lottery_code && cfg.mostra('lotteria')) {
      prn.addText(row('Codice Lotteria', order.lottery_code))
      prn.addText(line())
    }

    // ── Footer ──
    prn.addTextAlign(prn.ALIGN_CENTER)
    if (cfg.mostra('codice_conto')) {
      const shortId = (order.id || '').substring(0, 36)
      prn.addText(`${shortId}\n`)
    }
    if (cfg.mostra('ragione_sociale')) prn.addText(`${s.businessFooter}\n`)
    const saluto = cfg.parole('riga_cortesia')
    if (saluto) prn.addText(`${saluto}\n`)

    prn.addFeedLine(4)
    prn.addCut(prn.CUT_FEED)
  }, etichettaConto('Scontrino', order))
}

// ── SCONTRINO D'ACCONTO ──────────────────────────────────────────────────────
//
// «Lo scontrino esce ad ogni riscossione ma è configurabile» (l'utente,
// 21/08/2026). Questa NON è la carta del conto: è la carta di chi versa
// una parte e se ne va, e per lui il conto non è finito. Quattro domande,
// in mezzo secondo: cosa ho pagato, quanto, come, quanto resta.
//
// CHE NON SIA SCAMBIABILE PER LO SCONTRINO FINALE è il vincolo che tiene
// insieme il disegno: la fascia nera ACCONTO in cima e la riga in fondo
// che dice che il conto resta aperto NON sono campi, non si spengono, e
// non c'è impostazione che possa arrivarci. Una carta che sembra dire
// «pagato» su un conto ancora aperto è un cliente che discute al banco.
//
// L'ORDINE CHE ARRIVA QUI È QUELLO DI PRIMA. La riscossione parte in
// sottofondo — niente aspetta la rete — quindi l'incasso appena battuto
// non c'è ancora sul documento e lo sconto è ancora «in preparazione»:
// `contoDopoIncasso` (pagamento.js) fa i conti sul DOPO, che è quello che
// il cliente si porta via.
//
// NIENTE PRETESA E NIENTE SEGNO SUL DATO, al contrario dello scontrino di
// chiusura. `receipt_print_at` e `claimReceiptPrint` dicono «la carta di
// QUESTO CONTO è già uscita»: è uno stato del conto, e ce n'è uno solo.
// Un acconto è un EVENTO — su un conto ce ne stanno tre — e legarlo a
// quel segno vorrebbe dire che il secondo acconto non stampa più, o
// peggio che stampandolo si brucia la pretesa dello scontrino finale
// (BUG-047). La carta esce dal gesto, su chi ha fatto il gesto, una
// volta: non c'è nessun altro terminale che possa stamparla per sbaglio,
// perché nessuno guarda i pagamenti altrui per decidere di stampare.
//
// `incasso`: { amount, method, items|null, sconto|null } — la riscossione
// che sta succedendo adesso, così com'è stata mandata a `registerPayment`.
export function printScontrinoAcconto(order, incasso = {}) {
  return lavoroDiStampa(async (prn) => {
    const s = loadPrinterSettings()
    const cfg = configStampa(impostazioniDelLocale(), 'acconto')
    const dopo = contoDopoIncasso(order, incasso)
    const { date, time } = italianDateTime(incasso?.at || new Date().toISOString())
    const versato = round2(incasso?.amount)
    // Le righe di QUESTA riscossione. Su un acconto battuto a mano non ce
    // n'è nessuna — «venti euro sul tavolo» non salda niente in
    // particolare — e allora la lista non si stampa affatto: meglio niente
    // che un elenco che non è quello che si è pagato.
    const righe = (incasso?.items || []).filter((i) => (Number(i.qty) || 0) > 0)
    const scontoOra =
      incasso?.sconto && (Number(incasso.sconto.amount) || 0) > 0 ? incasso.sconto : null

    prn.addTextLang('it')
    prn.addTextSmooth(true)

    // ── Intestazione ──
    await stampaLogo(prn, 'acconto')
    prn.addTextAlign(prn.ALIGN_CENTER)
    const nome = cfg.mostra('nome_locale')
    const via = cfg.mostra('indirizzo')
    const citta = cfg.mostra('citta')
    if (nome) {
      prn.addTextSize(2, 2)
      prn.addTextStyle(false, false, true, prn.COLOR_1)
      prn.addText(`${s.businessName}\n`)
      prn.addTextSize(1, 1)
      prn.addTextStyle(false, false, false, prn.COLOR_1)
    }
    if (via) prn.addText(`${s.businessAddress}\n`)
    if (citta) prn.addText(`${s.businessCity}\n`)
    if (nome || via || citta) prn.addText('\n')

    // ── La fascia: si legge da lontano, e non si spegne ──
    prn.addTextStyle(true, false, true, prn.COLOR_1) // reverse: bianco su nero
    prn.addTextSize(2, 2)
    prn.addText('  ACCONTO  \n')
    prn.addTextSize(1, 1)
    prn.addTextStyle(false, false, false, prn.COLOR_1)
    prn.addText('\n')

    // ── Di che conto è ──
    prn.addTextAlign(prn.ALIGN_LEFT)
    if (cfg.mostra('numero')) {
      prn.addText(row(`ACCONTO - ${order.daily_number ?? '-'}`, `${date}, ${time}`))
    }
    // Le stesse due righe dello scontrino, e per le stesse ragioni
    // (BUG-088): il nome di chi sta stampando, e a chi appartiene il
    // conto. Il numero è già scritto qui sopra, e nessuna delle due esce
    // se non ha niente da dire.
    const operatore = nomeDiChiStampa()
    if (operatore && cfg.mostra('operatore')) prn.addText(`${operatore}\n`)
    const vendita = rigaVendita(order)
    if (vendita && cfg.mostra('riga_vendita')) prn.addText(`${vendita}\n`)
    prn.addText(line())

    // ── Cosa ha pagato ──
    // Non sta fra i campi: è la risposta alla prima domanda che fa chi ha
    // appena messo dei soldi sul tavolo con altri sei intorno.
    if (righe.length > 0) {
      if (cfg.mostra('intestazione_colonne')) {
        prn.addTextStyle(false, false, true, prn.COLOR_1)
        prn.addText(row('QTA  Prodotto', 'PU       Prezzo'))
        prn.addTextStyle(false, false, false, prn.COLOR_1)
        prn.addText(line())
      }
      for (const i of righe) {
        const pu = `${euroRiga(i.unit_price).toFixed(2)}€`
        const tot = `${(qtaRiga(i) * euroRiga(i.unit_price)).toFixed(2)}€`
        prn.addText(row(`${qtaRiga(i)}x  ${nomeRiga(i)}`, `${pu.padStart(7)} ${tot.padStart(7)}`))
      }
      prn.addText(line())
    }

    // Lo sconto che questa riscossione si è portato via: dice su che cosa
    // cadeva, perché su un conto diviso ce ne può essere uno per ognuno
    // che paga la sua parte (REQ-PAG-013).
    if (scontoOra && cfg.mostra('sconto')) {
      prn.addText(row(etichettaSconto(scontoOra), `-${round2(scontoOra.amount).toFixed(2)}€`))
      prn.addText(line())
    }

    // ── Quanto, in grande ──
    // L'importo non è un campo, come non lo è il totale dello scontrino:
    // un acconto senza l'importo versato non è un documento.
    prn.addTextAlign(prn.ALIGN_CENTER)
    prn.addTextSize(1, 2)
    prn.addTextStyle(false, false, true, prn.COLOR_1)
    prn.addText('Versato\n')
    prn.addTextSize(3, 3)
    prn.addText(`${versato.toFixed(2)}€\n`)
    prn.addTextSize(1, 1)
    prn.addTextStyle(false, false, false, prn.COLOR_1)
    if (cfg.mostra('metodo')) prn.addText(`${nomeMetodo(incasso?.method)}\n`)
    prn.addText('\n')
    prn.addTextAlign(prn.ALIGN_LEFT)
    prn.addText(line())

    // ── Come sta il conto ──
    if (cfg.mostra('riepilogo_conto')) {
      prn.addText(row('Totale del conto', `${orderTotal(dopo).toFixed(2)}€`))
      prn.addText(row('Versato in tutto', `${paidAmount(dopo).toFixed(2)}€`))
      prn.addTextStyle(false, false, true, prn.COLOR_1)
      prn.addText(row('Resta da pagare', `${orderDue(dopo).toFixed(2)}€`))
      prn.addTextStyle(false, false, false, prn.COLOR_1)
      prn.addText(line())
    }

    // ── E che il conto è ancora aperto ──
    // Fissa, come la fascia in cima. È la riga che al banco evita la
    // discussione: «ma io lo scontrino ce l'avevo già».
    prn.addTextAlign(prn.ALIGN_CENTER)
    prn.addText('Ricevuta di acconto, non fiscale.\n')
    prn.addText('Il conto resta aperto.\n')
    prn.addText('\n')

    if (cfg.mostra('codice_conto')) prn.addText(`${(order.id || '').substring(0, 36)}\n`)
    if (cfg.mostra('ragione_sociale')) prn.addText(`${s.businessFooter}\n`)
    const saluto = cfg.parole('riga_cortesia')
    if (saluto) prn.addText(`${saluto}\n`)

    prn.addFeedLine(4)
    prn.addCut(prn.CUT_FEED)
  }, etichettaConto('Acconto', order))
}

// ── FATTURA DI CORTESIA ──────────────────────────────────────────────────────
// Documento non fiscale con i dati di fatturazione del cliente: numero
// progressivo per anno, articoli, scorporo IVA. (La fattura elettronica
// vera passa dal commercialista/SDI: questa è la copia di cortesia.)

export function printFattura(invoice) {
  return lavoroDiStampa(async (prn) => {
    const s = loadPrinterSettings()
    const ivaRate = (Number(invoice.iva_rate) || 0) / 100
    const { date, time } = italianDateTime(invoice.created_at)
    const total = Number(invoice.total ?? 0)
    const ivaAmount = total - total / (1 + ivaRate)
    const imponibile = total / (1 + ivaRate)
    const c = invoice.customer || {}

    prn.addTextLang('it')
    prn.addTextSmooth(true)

    prn.addTextAlign(prn.ALIGN_CENTER)
    prn.addTextSize(2, 2)
    prn.addTextStyle(false, false, true, prn.COLOR_1)
    prn.addText(`${s.businessName}\n`)
    prn.addTextSize(1, 1)
    prn.addTextStyle(false, false, false, prn.COLOR_1)
    prn.addText(`${s.businessAddress}\n`)
    prn.addText(`${s.businessCity}\n\n`)
    prn.addTextSize(1, 2)
    prn.addTextStyle(false, false, true, prn.COLOR_1)
    prn.addText(`FATTURA DI CORTESIA n. ${invoice.number}\n`)
    prn.addTextSize(1, 1)
    prn.addTextStyle(false, false, false, prn.COLOR_1)
    prn.addTextAlign(prn.ALIGN_LEFT)
    prn.addText(`${date}, ${time}\n`)
    prn.addText(line())

    // ── Dati del cliente ──
    prn.addTextStyle(false, false, true, prn.COLOR_1)
    prn.addText('Intestata a\n')
    prn.addTextStyle(false, false, false, prn.COLOR_1)
    prn.addText(`${c.denominazione || '-'}\n`)
    if (c.piva) prn.addText(`P.IVA: ${c.piva}\n`)
    if (c.cf) prn.addText(`CF: ${c.cf}\n`)
    if (c.sdi) prn.addText(`SDI/PEC: ${c.sdi}\n`)
    if (c.indirizzo) prn.addText(`${c.indirizzo}\n`)
    prn.addText(line())

    // ── Articoli ──
    prn.addTextStyle(false, false, true, prn.COLOR_1)
    prn.addText(row('QTA  Prodotto', 'PU       Prezzo'))
    prn.addTextStyle(false, false, false, prn.COLOR_1)
    prn.addText(line())
    for (const item of invoice.items || []) {
      const pu = `${euroRiga(item.unit_price).toFixed(2)}€`
      const tot = `${(qtaRiga(item) * euroRiga(item.unit_price)).toFixed(2)}€`
      prn.addText(row(`${qtaRiga(item)}x  ${nomeRiga(item)}`, `${pu.padStart(7)} ${tot.padStart(7)}`))
    }
    prn.addText(line())
    if (invoice.discount_amount > 0) {
      prn.addText(row('Sconto', `-${Number(invoice.discount_amount).toFixed(2)}€`))
    }
    prn.addText(row(`IVA ${(ivaRate * 100).toFixed(1)}%`, `${ivaAmount.toFixed(2)}€`))
    prn.addText(row('Imponibile', `${imponibile.toFixed(2)}€`))
    prn.addText('\n')
    prn.addTextAlign(prn.ALIGN_CENTER)
    prn.addTextSize(2, 2)
    prn.addTextStyle(false, false, true, prn.COLOR_1)
    prn.addText(`Totale ${total.toFixed(2)}€\n`)
    prn.addTextSize(1, 1)
    prn.addTextStyle(false, false, false, prn.COLOR_1)
    prn.addText('\nDocumento non fiscale - copia di cortesia\n')
    prn.addText(`${s.businessFooter}\n`)

    prn.addFeedLine(4)
    prn.addCut(prn.CUT_FEED)
  }, 'Fattura di cortesia')
}

// ── ORDINE FORNITORE ─────────────────────────────────────────────────────────
// Ticket dell'ordine d'acquisto (GENERATORE ORDINI): righe a confezioni
// e totali, da allegare/spuntare all'arrivo della merce.

export function printOrdineFornitore(order) {
  return lavoroDiStampa(async (prn) => {
    const s = loadPrinterSettings()

    prn.addTextLang('it')
    prn.addTextSmooth(true)
    prn.addTextAlign(prn.ALIGN_CENTER)
    prn.addTextSize(2, 2)
    prn.addTextStyle(false, false, true, prn.COLOR_1)
    prn.addText('ORDINE FORNITORE\n')
    prn.addTextSize(1, 1)
    prn.addTextStyle(false, false, false, prn.COLOR_1)
    prn.addText(`${s.businessName}\n\n`)
    prn.addTextAlign(prn.ALIGN_LEFT)
    prn.addText(row(order.supplier_name || '-', String(order.created_at || '').slice(0, 10)))
    prn.addText(line())
    prn.addTextSize(1, 2)
    for (const l of order.lines || []) {
      prn.addText(`${l.qty_packages}  ${nomeRiga(l).toUpperCase()}\n`)
    }
    prn.addTextSize(1, 1)
    prn.addText(line())
    prn.addText(row('Totale netto', `${(Number(order.total_net) || 0).toFixed(2)}€`))
    prn.addText(row('Totale ivato', `${(Number(order.total_gross) || 0).toFixed(2)}€`))

    prn.addFeedLine(3)
    prn.addCut(prn.CUT_FEED)
  }, 'Ordine fornitore')
}

// ── TEST STAMPA ───────────────────────────────────────────────────────────────

// ── CHIUSURA CASSA ───────────────────────────────────────────────────────────
// Riepilogo di fine serata da allegare al fondo: incassato per metodo
// (contante, carta, POS, online), sconti concessi, conti chiusi e contante
// atteso in cassa. `recap` è quello di cashRecap().
// Gli stessi nomi dello scontrino: la chiusura di cassa si confronta con la
// striscia degli scontrini, e due parole diverse per la stessa cosa
// costringono a tradurre a mente mentre si contano i soldi.
const scontrinoMetodo = (k) => PAYMENT_METHOD_PRINT[k] || k

export function printChiusuraCassa(recap, session, opts = {}) {
  return lavoroDiStampa(async (prn) => {
    const s = loadPrinterSettings()
    const { date, time } = italianDateTime(new Date().toISOString())
    const eur = (n) => `${(Number(n) || 0).toFixed(2)}€`

    prn.addTextLang('it')
    prn.addTextSmooth(true)

    // Di suo il logo qui non c'è: la chiusura è un foglio interno, non
    // esce dal locale. Chi la allega alla contabilità lo accende.
    await stampaLogo(prn, 'chiusura')
    prn.addTextAlign(prn.ALIGN_CENTER)
    prn.addTextSize(2, 2)
    prn.addTextStyle(false, false, true, prn.COLOR_1)
    prn.addText(`${s.businessName}\n`)
    prn.addTextSize(1, 1)
    prn.addText('CHIUSURA CASSA\n')
    prn.addTextStyle(false, false, false, prn.COLOR_1)
    prn.addTextAlign(prn.ALIGN_LEFT)
    prn.addText(`${date}, ${time}\n`)
    if (session?.opened_at) {
      const a = italianDateTime(session.opened_at)
      prn.addText(`Apertura: ${a.date}, ${a.time}\n`)
    }
    if (opts.by) prn.addText(`Operatore: ${opts.by}\n`)
    prn.addText(line())

    // ── Incassi per metodo ──
    prn.addTextStyle(false, false, true, prn.COLOR_1)
    prn.addText('Incassi per metodo\n')
    prn.addTextStyle(false, false, false, prn.COLOR_1)
    // Una riga per metodo battuto: i soliti sempre (anche a zero, così la
    // striscia si legge uguale ogni sera) e in coda quelli nuovi, senza dover
    // ristampare il codice quando si aggiunge un metodo di pagamento.
    const m = recap?.byMethod || {}
    for (const k of cashMethodKeys(m)) {
      const noto = CASH_METHOD_ORDER.includes(k)
      if (!noto && !(Number(m[k]) > 0)) continue
      prn.addText(row(scontrinoMetodo(k), eur(m[k])))
    }
    prn.addText(line())

    // ── Sconti concessi (già dedotti dagli incassi) ──
    // Sempre stampati, anche a zero: è una voce che si controlla ogni sera.
    prn.addText(row('Sconti concessi', `-${eur(recap?.sconti)}`))
    prn.addText(line())

    // ── Totale ──
    prn.addTextAlign(prn.ALIGN_CENTER)
    prn.addTextSize(1, 2)
    prn.addTextStyle(false, false, true, prn.COLOR_1)
    prn.addText('Totale incassato\n')
    prn.addTextSize(3, 3)
    prn.addText(`${eur(recap?.incassato)}\n`)
    prn.addTextSize(1, 1)
    prn.addTextStyle(false, false, false, prn.COLOR_1)
    prn.addTextAlign(prn.ALIGN_LEFT)
    prn.addText(line())

    // ── Cassa ──
    prn.addText(row('Conti chiusi', String(recap?.nPagati ?? 0)))
    prn.addText(row('Fondo cassa', eur(recap?.fondo)))
    prn.addText(row('Contante atteso', eur(recap?.contanteAtteso)))
    if (opts.countedCash != null && opts.countedCash !== '') {
      const counted = Number(String(opts.countedCash).replace(',', '.')) || 0
      prn.addText(row('Contante contato', eur(counted)))
      const diff = Math.round((counted - (Number(recap?.contanteAtteso) || 0)) * 100) / 100
      prn.addText(row('Differenza', `${diff > 0 ? '+' : ''}${eur(diff)}`))
    }
    if (Number(recap?.apertoDaIncassare) > 0) {
      prn.addText(line())
      prn.addText(row(`Conti aperti (${recap.nAperti})`, eur(recap.apertoDaIncassare)))
    }
    prn.addText(line())

    prn.addTextAlign(prn.ALIGN_CENTER)
    prn.addText(`${s.businessFooter}\n`)
    prn.addFeedLine(4)
    prn.addCut(prn.CUT_FEED)
  }, 'Chiusura cassa')
}

// ── LA PROVA DI STAMPA COI CAMPI SCELTI ──────────────────────────────
//
// Cambiare i campi senza vedere la carta è scegliere alla cieca: il
// pannello ha un tasto che stampa un conto FINTO — un nome, due drink,
// uno sconto, un coperto — passando dalle STESSE funzioni della serata.
// Non c'è un secondo disegno da tenere allineato: se l'anteprima è giusta
// lo è perché lo è la stampa vera.
//
// In locale la stampante è finta e il facsimile si apre in una finestra;
// al banco esce un pezzo di carta, ed è quello che si voleva.
const CONTO_DI_PROVA = {
  id: 'prova-di-stampa',
  daily_number: 42,
  status: 'pagato',
  customer_name: 'Prova',
  table_label: '4',
  created_at: '2026-08-20T21:30:00.000Z',
  total: 23,
  discount_amount: 3,
  coperto_persons: 2,
  coperto_amount: 4,
  note: 'Tavolo vicino alla finestra',
  payment_method: 'contanti',
  order_items: [
    { qty: 2, name: 'Negroni', unit_price: 8, note: 'poco ghiaccio' },
    { qty: 1, name: 'Spritz', unit_price: 7 },
  ],
  comande: [
    {
      id: 'prova-comanda',
      status: 'ricevuto',
      items: [
        { qty: 2, name: 'Negroni', unit_price: 8, note: 'poco ghiaccio' },
        { qty: 1, name: 'Spritz', unit_price: 7 },
      ],
    },
  ],
}

export function printAnteprima(quale) {
  if (quale === 'comanda') return printComanda(CONTO_DI_PROVA)
  // L'acconto ha bisogno di una RISCOSSIONE, non solo di un conto: senza,
  // non c'è niente da mostrare. Se ne inventa una parziale e scontata —
  // il caso per cui questa carta esiste.
  if (quale === 'acconto') {
    return printScontrinoAcconto(
      { ...CONTO_DI_PROVA, status: 'aperto', discount_amount: 0 },
      {
        amount: 13,
        method: 'contanti',
        items: [{ qty: 2, name: 'Negroni', unit_price: 8 }],
        sconto: { type: 'euro', value: 3, amount: 3, items: [{ qty: 2, name: 'Negroni' }] },
        at: '2026-08-21T21:30:00.000Z',
      }
    )
  }
  return printScontrino(CONTO_DI_PROVA)
}

export function printTest() {
  return lavoroDiStampa(async (prn) => {
    const s = loadPrinterSettings()

    prn.addTextLang('it')
    prn.addTextSmooth(true)
    prn.addTextAlign(prn.ALIGN_CENTER)
    prn.addTextSize(2, 2)
    prn.addTextStyle(false, false, true, prn.COLOR_1)
    prn.addText('Test stampa\n')
    prn.addTextSize(1, 1)
    prn.addTextStyle(false, false, false, prn.COLOR_1)
    prn.addText(`${s.businessName}\n`)
    prn.addText('Connessione OK\n')
    prn.addFeedLine(3)
    prn.addCut(prn.CUT_FEED)
  }, 'Prova di stampa')
}
