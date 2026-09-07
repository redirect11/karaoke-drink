// ── IL REGISTRO DELLE STAMPE (REQ-STAMPA-017, BUG-098) ───────────────
//
// Flavio, 28/08/2026: «quando fanno la chiusura cassa, la stampante non
// stampa lo scontrino di chiusura molto spesso». Fin qui una stampa
// fallita non lasciava NIENTE: l'avviso viveva otto secondi in una
// striscia che compare insieme a quella verde «Cassa chiusa» — e con i
// toast che si accavallano (BUG-078) passa inosservata — mentre la
// risposta della stampante finiva in una riga di console che nessuno
// legge. Con una cassa che si chiude UNA VOLTA A NOTTE, così si va per
// tentativi per settimane.
//
// Qui c'è la traccia: cosa si è provato a stampare, quando, com'è andata
// e il motivo quando è andata male. Più lo stato della CODA — cosa è in
// corso e cosa aspetta — perché la seconda domanda che ci si fa davanti a
// una stampante muta è «si è impiantata?».
//
// TRE VINCOLI, e sono il motivo per cui questo file è fatto così:
//
// 1. NON CRESCE ALL'INFINITO. Sta in localStorage, che su iPadOS è
//    memoria che il browser può svuotare quando vuole: le ultime 50 voci
//    e basta. Cinquanta perché la voce che conta — la chiusura di cassa —
//    è l'ULTIMA stampa della serata, quindi non viene mai spinta fuori
//    dalle comande della sera dopo; e cinquanta righe stanno in pochi KB.
// 2. NIENTE DATI PERSONALI. La voce dice «Scontrino conto #42», mai il
//    nome del cliente né la mail di chi ha battuto. Un registro di
//    diagnostica non è il posto dove tenere i clienti del locale, e chi
//    ripara la stampante non ha motivo di leggerli.
// 3. NON RALLENTA LA STAMPA. Si scrive DI LATO: la voce entra in memoria
//    subito, il salvataggio in localStorage parte su un microtask. Il
//    percorso critico è la carta che esce, e un `JSON.stringify` non ci
//    si mette in mezzo.

const CHIAVE = 'tana:registro-stampe'

// Il tetto: vedi il punto 1 qui sopra.
export const TETTO_VOCI = 50

// Gli esiti, e cosa vogliono dire.
//
// `inviata` è quello con cui OGNI stampa nasce, ed è il perno di come
// funziona questo registro: il foglio è partito e la risposta della
// stampante arriverà dopo — o non arriverà mai. Nessuno la aspetta (chi ha
// chiesto la stampa è andato avanti da un pezzo: vedi il commento sulla
// diagnostica in `printer.js`), ma una voce rimasta «inviata» è
// un'informazione anche lei: quella stampante non conferma niente, ed è la
// prima cosa da leggere alla prossima chiusura mancata.
export const ESITO = {
  inviata: 'inviata',
  riuscita: 'riuscita',
  fallita: 'fallita',
}

export const ETICHETTA_ESITO = {
  inviata: 'In attesa di risposta',
  riuscita: 'Stampata',
  fallita: 'Non stampata',
}

let _voci = null
// La coda vive SOLO in memoria: «in corso» scritto su disco, dopo un
// ricaricamento, sarebbe una bugia — quel lavoro è morto con la pagina.
let _coda = []
let _prossimoId = 0
let _istantanea = null
const _ascoltatori = new Set()

function leggiDaMemoria() {
  try {
    const grezzo = localStorage.getItem(CHIAVE)
    const lette = grezzo ? JSON.parse(grezzo) : []
    return Array.isArray(lette) ? lette.filter((v) => v && typeof v === 'object') : []
  } catch {
    /* memoria negata o illeggibile: si riparte da un registro vuoto */
    return []
  }
}

function voci() {
  if (_voci === null) _voci = leggiDaMemoria()
  return _voci
}

// ── SI SCRIVE DI LATO ────────────────────────────────────────────────
// Un solo salvataggio per giro di eventi, su un microtask: chi ha chiesto
// la stampa non aspetta nemmeno la serializzazione.
let _salvataggioInVolo = false
function salvaDiLato() {
  if (_salvataggioInVolo) return
  _salvataggioInVolo = true
  Promise.resolve().then(() => {
    _salvataggioInVolo = false
    try {
      localStorage.setItem(CHIAVE, JSON.stringify(_voci ?? []))
    } catch {
      /* memoria piena o negata: il registro vale per questa sessione */
    }
  })
}

function cambiato() {
  // L'istantanea si ricostruisce solo quando qualcosa è cambiato: chi
  // legge (useSyncExternalStore) confronta i riferimenti, e ricrearla a
  // ogni lettura sarebbe un ridisegno all'infinito.
  _istantanea = null
  for (const cb of _ascoltatori) {
    try {
      cb()
    } catch {
      /* un ascoltatore rotto non ferma gli altri */
    }
  }
}

// Quello che serve a chi disegna: la coda di adesso e le voci passate,
// dalla più recente.
export function statoRegistro() {
  if (!_istantanea) {
    _istantanea = {
      inCorso: _coda.find((l) => l.stato === 'in corso') || null,
      inAttesa: _coda.filter((l) => l.stato === 'in attesa'),
      voci: [...voci()].reverse(),
    }
  }
  return _istantanea
}

export function iscrivitiAlRegistro(cb) {
  _ascoltatori.add(cb)
  return () => _ascoltatori.delete(cb)
}

// ── LA VITA DI UN LAVORO ─────────────────────────────────────────────
//
// Quattro momenti, e i primi tre li chiama `lavoroDiStampa` in printer.js:
// entra in coda, parte, ed esce dalla coda — «inviata» se il foglio è
// partito, «fallita» se non ci è nemmeno arrivato. Il quarto momento
// arriva DOPO e per conto suo (`aggiornaEsito`): è la risposta della
// stampante, che dice com'è andata davvero.
//
// `che` è l'etichetta — senza dati personali dentro.

export function lavoroInCoda(che) {
  const id = `stampa-${++_prossimoId}`
  _coda = [..._coda, { id, che: String(che || 'Stampa'), stato: 'in attesa' }]
  cambiato()
  return id
}

export function lavoroPartito(id) {
  _coda = _coda.map((l) => (l.id === id ? { ...l, stato: 'in corso' } : l))
  cambiato()
}

// Il motivo si taglia: è una frase, non un registro di sistema, e una
// stringa lunga in localStorage la paga chi legge il pannello.
const motivoCorto = (motivo) => String(motivo || '').slice(0, 200)

function esciDallaCoda(id, esito, motivo) {
  const lavoro = _coda.find((l) => l.id === id)
  // Chi non è più in coda ci è già uscito: succede al lavoro che scade
  // DOPO aver mandato il foglio, e in quel caso la voce c'è già.
  if (!lavoro) return
  _coda = _coda.filter((l) => l.id !== id)
  const elenco = voci()
  elenco.push({
    id,
    che: lavoro.che,
    quando: new Date().toISOString(),
    esito: ESITO[esito] || ESITO.inviata,
    motivo: motivoCorto(motivo),
  })
  // Il tetto si applica QUI e non alla lettura: quello che non entra non
  // deve nemmeno restare in memoria.
  if (elenco.length > TETTO_VOCI) elenco.splice(0, elenco.length - TETTO_VOCI)
  salvaDiLato()
  cambiato()
}

// Il foglio è partito. La voce entra nel registro SUBITO — è l'istante in
// cui chi ha chiesto la stampa va avanti — e resta così finché la
// stampante non dice altro.
export function lavoroInviato(id) {
  esciDallaCoda(id, ESITO.inviata, '')
}

// Non è nemmeno arrivato a mandare: documento storto o lavoro impiccato
// (BUG-086). Qui il fallimento è certo, e il chiamante l'ha già saputo.
export function lavoroNonPartito(id, motivo) {
  esciDallaCoda(id, ESITO.fallita, motivo)
}

// LA RISPOSTA DELLA STAMPANTE, che arriva dopo: cambia l'esito della voce
// già scritta. Se quella voce non c'è più — spinta fuori dal tetto delle
// 50 in una serata di comande — non si inventa niente: la risposta di una
// stampa vecchia non vale una riga nuova in cima al registro.
export function aggiornaEsito(id, esito, motivo = '') {
  const elenco = voci()
  const i = elenco.findIndex((v) => v.id === id)
  if (i === -1) return
  // Si SOSTITUISCE l'oggetto invece di modificarlo: chi disegna la lista
  // confronta i riferimenti, e una riga cambiata sul posto non si
  // ridisegnerebbe.
  elenco[i] = { ...elenco[i], esito: ESITO[esito] || elenco[i].esito, motivo: motivoCorto(motivo) }
  salvaDiLato()
  cambiato()
}

export function svuotaRegistro() {
  _voci = []
  salvaDiLato()
  cambiato()
}

// Solo per i test: la coda vive in un modulo, e ogni prova deve ripartire
// da un banco pulito anche senza `vi.resetModules()`.
export function dimenticaTuttoIlRegistro() {
  _voci = []
  _coda = []
  _prossimoId = 0
  try {
    localStorage.removeItem(CHIAVE)
  } catch {
    /* niente memoria: non c'era niente da togliere */
  }
  cambiato()
}
