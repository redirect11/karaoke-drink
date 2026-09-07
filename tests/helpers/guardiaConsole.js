import { afterEach, beforeEach } from 'vitest'

// ── LE RIGHE ROSSE NON SI ACCUMULANO PIÙ ─────────────────────────────
//
// La suite è arrivata a sputare migliaia di righe di avvisi: chiavi
// mancanti, `act` non dichiarati, proprietà di stile in conflitto. Nessuno
// li leggeva più, e in mezzo ci sono finiti difetti veri — la striscia
// delle tile che a volte tornava grigia ci è stata dentro per mesi.
//
// Da qui in poi un `console.error` o un `console.warn` che nessuno si
// aspetta FA FALLIRE il test che lo ha stampato. Non è un filtro: la riga
// si stampa lo stesso (si chiama la console vera), e in più il test diventa
// rosso, così l'avviso torna a costare qualcosa nel momento in cui nasce.
//
// Se un avviso è LEGITTIMO ci sono due strade, in ordine di preferenza:
//   1. il test dichiara che se lo aspetta, zittendo la console per quella
//      prova sola (`vi.spyOn(console, 'error')`) — è la strada giusta
//      quando è il codice in prova a scrivere apposta;
//   2. si aggiunge una riga qui sotto, con scritto PERCHÉ.
// Questa lista deve restare corta: se si allunga, vuol dire che stiamo
// tornando indietro.
const AMMESSE = [
  // La stampa che fallisce è un caso previsto, non un guaio: PaymentScreen
  // scrive in console quando la stampante è spenta, e i test dello
  // scontrino spengono la stampante apposta per vedere che il conto torni
  // stampabile invece di restare bruciato.
  /^\[printer\] /,
]

const ammessa = (testo) => AMMESSE.some((r) => r.test(testo))

// Il testo della riga, come lo si leggerebbe a schermo. Basta il primo
// pezzo: serve solo a decidere e a dire cosa è successo.
const testoDi = (args) => args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')

let inattese = []
let veroError = null
let veroWarn = null

beforeEach(() => {
  inattese = []
  veroError = console.error
  veroWarn = console.warn
  const sorveglia = (vera) => (...args) => {
    const testo = testoDi(args)
    if (!ammessa(testo)) inattese.push(testo.split('\n')[0])
    // La riga si stampa comunque: il messaggio di React dice DOVE, e senza
    // di lui resterebbe solo «c'è un avviso».
    vera(...args)
  }
  console.error = sorveglia(veroError)
  console.warn = sorveglia(veroWarn)
})

afterEach(() => {
  // Rimesse a posto prima di lanciare: se no il fallimento stesso finirebbe
  // dentro la sorveglianza del test dopo.
  if (veroError) console.error = veroError
  if (veroWarn) console.warn = veroWarn
  if (inattese.length === 0) return
  const elenco = [...new Set(inattese)].map((r) => `  • ${r}`).join('\n')
  inattese = []
  throw new Error(
    `Questo test ha stampato ${elenco.split('\n').length} avviso/i che nessuno si aspettava:\n${elenco}\n\n` +
      'Si cura la CAUSA, non il sintomo: quasi sempre è un test che asserisce ' +
      'prima che la schermata abbia finito di caricarsi (si aspetta con findBy…/waitFor), ' +
      'oppure un difetto vero nel componente. Se invece è un avviso previsto, ' +
      'vedi tests/helpers/guardiaConsole.js.'
  )
})
