// ── LE FUNZIONI PREMIUM: un posto solo che dice se sono accese ────────
// Decisione dell'utente del 26/08/2026: la conta di magazzino e le fatture
// ai fornitori si attivano all'occorrenza. Sono le prime due di una
// famiglia — il piano di sbrandizzazione (Fase 3,
// docs/piano-sbrandizzazione.md) prevede pacchetti interi — quindi la
// risposta sta QUI e non in un `if` dentro ogni schermata: due interruttori
// sparsi diventano tre, poi cinque, e a quel punto per sapere cosa vede un
// locale bisogna leggersi mezza app. Aggiungere il prossimo modulo è una
// voce in questa tabella; il resto del codice non cambia.
//
// ── DUE DOMANDE, NON UNA ─────────────────────────────────────────────
// È la distinzione che una licenza fa per mestiere, e vale la pena averla
// nel modello fin da subito (l'utente, 26/08/2026: «dobbiamo riattivare lo
// scadenziario, ma lasciamolo sempre funzione premium: va abilitato lo
// switch e abilitata la funzione»).
//
//   INCLUSO  — la licenza dice cosa il locale HA comprato.
//   ACCESO   — l'impostazione dice se in questo momento lo USA.
//
// Un modulo è ATTIVO quando è incluso E acceso. Le due domande non si
// possono impastare in un flag solo: senza «incluso» non si distingue un
// locale che la funzione non ce l'ha da uno che ce l'ha e l'ha spenta —
// e sono due schermate diverse, una con l'interruttore bloccato e una con
// l'interruttore normale.
//
// COSA È INCLUSO, OGGI: lo dice `incluso` in questa tabella. Sta nel
// CODICE apposta, non nelle impostazioni del bar: quello che un locale ha
// comprato non è una preferenza che si cambia dal pannello — lì si accende
// e si spegne quello che si ha, non si decide cosa si ha. Finché non esiste
// il documento della licenza, la licenza di questa installazione è la sua
// build; è lo stesso posto dove finirà la configurazione per cliente della
// Fase 2 (`clienti/<slug>/`).
//
// COME SI AGGANCERÀ LA LICENZA VERA. La Fase 3 prevede `settings/licenza`
// (o un campo nel venue) con piano e moduli attivi, estendendo lo schema
// che c'è già — quello di `workflow_enabled` su settings/bar. Il punto di
// innesto è uno solo, `moduloIncluso`: se lo stato porta con sé una
// `licenza` con l'elenco dei moduli, comanda lei e la colonna `incluso`
// della tabella non si guarda nemmeno. L'interruttore d'uso resta dov'è,
// perché quello è del locale e non della licenza — un locale che ha
// comprato lo scadenzario può comunque volerlo spento a gennaio.
// Gli strumenti di sviluppo scrivono già `licenza.moduli` in quella forma
// (DevTools.jsx): è la prova generale del documento vero.
//
// ⚠️ IL FLAG NASCONDE, NON PROTEGGE. Oggi c'è un locale solo e la
// distinzione è teorica; il giorno che i locali sono tanti, il controllo
// vero va sul server (Cloud Functions e regole Firestore), perché chiunque
// apra la console del browser può accendersi un modulo da sé. Sta scritto
// anche nel requisito, così chi arriva dopo non pensa che basti questo.

// I MODULI, uno per riga. La chiave `id` è la stessa della sezione che il
// modulo accende (`conta`, `scadenzario` nel magazzino): così filtrare un
// elenco di sezioni è una riga sola e non una tabella di corrispondenze.
// `chiave` è il nome del flag D'USO su settings/bar — scritto per esteso e
// non calcolato, perché è un nome che finisce su documenti veri e chi lo
// cerca nel codice lo deve trovare.
// `incluso` è cosa ha QUESTA installazione finché non c'è una licenza vera.
export const MODULI_PREMIUM = {
  conta: {
    chiave: 'modulo_conta_enabled',
    incluso: false,
    label: 'Conta di magazzino',
    descrizione:
      'Inventario periodico: si contano le rimanenze, l’app calcola il consumo del periodo e allinea le giacenze.',
  },
  fatture: {
    // Le fatture di cortesia al CLIENTE (collezione `invoices`), da non
    // confondere con lo scadenzario qui sotto, che è dei FORNITORI: sono
    // due mestieri opposti — soldi che entrano e soldi che escono — e
    // l'unica cosa che hanno in comune è la parola. Le etichette lo dicono
    // a schermo, perché stanno una sotto l'altra nelle impostazioni.
    chiave: 'modulo_fatture_enabled',
    incluso: false,
    label: 'Fatture ai clienti',
    descrizione:
      'Fattura di cortesia per il cliente che la chiede: dati di fatturazione, numero progressivo, stampa e invio per email.',
  },
  scadenzario: {
    // Riacceso il 26/08/2026 su richiesta dell'utente: la Tana lo usa
    // davvero. Resta una funzione premium — cambia che qui è INCLUSA, e
    // quindi il suo interruttore si tocca.
    chiave: 'modulo_scadenzario_enabled',
    incluso: true,
    label: 'Fatture ai fornitori',
    descrizione:
      'Registro delle fatture di acquisto con importi, scadenze e stato dei pagamenti.',
  },
}

// Quello che si legge al tocco dell'interruttore di un modulo NON INCLUSO.
// Dice il perché senza promettere niente: l'inclusione è una faccenda della
// licenza dell'installazione, non di questa schermata.
export const MOTIVO_PREMIUM =
  'Funzione premium: fa parte della licenza dell’installazione e non si attiva da questa schermata.'

// L'elenco dei moduli come lo mostra un pannello: id davanti, il resto
// dietro, nell'ordine in cui sono scritti qui sopra.
export const moduliPremium = () =>
  Object.entries(MODULI_PREMIUM).map(([id, m]) => ({ id, ...m }))

// Il flag su settings/bar che accende un modulo, per chi va a guardare (o a
// scrivere) il documento del locale. Null se l'id non è di un modulo.
export const chiaveModulo = (id) => MODULI_PREMIUM[id]?.chiave ?? null

// Questo id è una funzione premium? Serve dove si filtra un elenco misto:
// una voce che non è premium non ha una licenza da controllare.
export const ePremium = (id) => Object.hasOwn(MODULI_PREMIUM, id)

// PRIMA DOMANDA: il locale ce l'ha? È quello che dirà la licenza.
//
// Un id sconosciuto non è incluso: una funzione a pagamento non si regala
// per una svista di chi chiama.
export function moduloIncluso(stato, id) {
  const modulo = MODULI_PREMIUM[id]
  if (!modulo) return false
  // Il punto di innesto della licenza vera (Fase 3). Se la licenza c'è, è
  // LEI la verità, anche per quello che non nomina: ricadere sulla tabella
  // vorrebbe dire riaprirsi da soli un modulo che la licenza non dà.
  const moduli = stato?.licenza?.moduli
  if (moduli && typeof moduli === 'object') return moduli[id] === true
  return modulo.incluso === true
}

// SECONDA DOMANDA: il locale lo sta usando? È l'interruttore delle
// impostazioni, e vale solo per quello che è incluso.
//
// Acceso di suo, con l'idioma di `workflow_enabled`: quello che il locale
// ha comprato funziona senza che nessuno debba accenderlo, e si spegne solo
// se qualcuno lo spegne davvero. La sicurezza («di partenza spento») sta
// tutta nella prima domanda, che è quella che non si può sbagliare.
export function moduloAcceso(stato, id) {
  const modulo = MODULI_PREMIUM[id]
  if (!modulo) return false
  return stato?.[modulo.chiave] !== false
}

// LA DOMANDA CHE FANNO LE SCHERMATE: questa funzione lavora, qui e adesso?
// `stato` sono le impostazioni del bar già in mano a chi chiama
// (settings/bar, dalla cache: nessuna lettura nuova, vedi CLAUDE.md sul
// local-first).
export const moduloAttivo = (stato, id) => moduloIncluso(stato, id) && moduloAcceso(stato, id)

// Una voce di un elenco (sezioni del magazzino, domani le voci del
// gestionale) si può mostrare? È la riga che serve a chi filtra: le voci
// che non sono premium passano sempre.
export const voceVisibile = (stato, id) => !ePremium(id) || moduloAttivo(stato, id)
