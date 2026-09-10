// =====================================================================
//  IL GHIACCIO NELLE RICETTE PASSA A UNA VOLTA E MEZZO.
//
//    node scripts/ghiaccio-per-uno-e-mezzo.js                       # ANTEPRIMA
//    node scripts/ghiaccio-per-uno-e-mezzo.js --apply               # scrive
//    node scripts/ghiaccio-per-uno-e-mezzo.js --ghiaccio <id> ...   # se di ghiaccio ce n'è più d'uno
//    node scripts/ghiaccio-per-uno-e-mezzo.js --anche-fuori-tabella  # ×1,5 anche alle dosi non in tabella
//    node scripts/ghiaccio-per-uno-e-mezzo.js --project tana-drink --apply
//
//  Flavio, 09/09/2026: «bisognerebbe moltiplicare tutte le quantità di
//  ghiaccio per 1,5. Quindi se ho 100 grammi diventano 150, se ho 200
//  diventano 300». Il consumo vero al banco è quello: la dose scritta un
//  anno fa era bassa e il magazzino del ghiaccio scendeva meno di quanto
//  usciva davvero.
//
//  Si toccano SOLO le righe di ricetta (`recipe_items`) che puntano
//  all'articolo del ghiaccio, e solo la quantità: il resto della ricetta,
//  il testo libero `recipe` e l'articolo in magazzino restano com'erano.
//
//  NON È UN «×1,5» CIECO, ed è voluto: uno script che moltiplica si può
//  lanciare due volte per sbaglio, e la seconda volta il ghiaccio va a 225.
//  Qui le dosi si riconoscono da una tabella — 100 → 150, 200 → 300 — e una
//  riga già a 150 o 300 si lascia stare. Una dose che non è in tabella si
//  SEGNALA e non si tocca: si guarda l'anteprima e, se va moltiplicata
//  anche lei, si rilancia con --anche-fuori-tabella — una volta sola,
//  perché su quelle righe non c'è modo di riconoscere il «già fatto».
//
//  Default: progetto tana-drink-test (la produzione va indicata a mano, e
//  prima si fa il backup: `node scripts/backup-db.js --project tana-drink`).
// =====================================================================
import { accessToken, client, idDi, arg, flag } from './lib-firestore.js'
import { righeDaRiscrivere, DOSI_GHIACCIO } from './lib-ghiaccio.js'

const PROJECT = arg('project', 'tana-drink-test')
const APPLY = flag('apply')
const GHIACCIO = arg('ghiaccio')
const ANCHE_FUORI_TABELLA = flag('anche-fuori-tabella')

const db = client(PROJECT, await accessToken())
const strOf = (f) => (f?.stringValue != null ? f.stringValue : null)
const numOf = (f) =>
  f?.doubleValue != null ? Number(f.doubleValue) : f?.integerValue != null ? Number(f.integerValue) : null

// ── L'articolo del ghiaccio ──────────────────────────────────────────
const articoli = await db.documenti('inventory_items', { campi: ['name', 'unit'] })
const candidati = articoli.filter((d) => /ghiacc/i.test(strOf(d.fields?.name) || ''))
let ghiaccio = GHIACCIO ? candidati.find((d) => idDi(d) === GHIACCIO) : null
if (!ghiaccio && candidati.length === 1) ghiaccio = candidati[0]
if (!ghiaccio) {
  if (candidati.length === 0) console.error(`[ghiaccio] Nessun articolo «ghiaccio» su "${PROJECT}".`)
  else {
    console.error(`[ghiaccio] Più di un articolo si chiama ghiaccio: scegli con --ghiaccio <id>.`)
    for (const d of candidati) console.error(`   ${idDi(d).padEnd(24)} ${strOf(d.fields?.name)} (${strOf(d.fields?.unit)})`)
  }
  process.exit(1)
}
const idGhiaccio = idDi(ghiaccio)
console.log(
  `[ghiaccio] articolo: ${strOf(ghiaccio.fields?.name)} (${idGhiaccio}, ${strOf(ghiaccio.fields?.unit) || '?'}) su "${PROJECT}"`
)
console.log(`[ghiaccio] dosi: ${Object.entries(DOSI_GHIACCIO).map(([da, a]) => `${da} → ${a}`).join(', ')}`)

// ── Le ricette ───────────────────────────────────────────────────────
const drinks = await db.documenti('drinks')
const scritture = []
let giaFatte = 0
const inattese = []
for (const d of drinks) {
  const valori = d.fields?.recipe_items?.arrayValue?.values || []
  const righe = valori.map((v) => {
    const rf = v.mapValue?.fields || {}
    return { inventory_item_id: strOf(rf.inventory_item_id), qty: numOf(rf.qty), unit: strOf(rf.unit) }
  })
  const esito = righeDaRiscrivere(righe, idGhiaccio, { ancheFuoriTabella: ANCHE_FUORI_TABELLA })
  giaFatte += esito.giaFatte.length
  for (const i of esito.inattese) {
    inattese.push(`${strOf(d.fields?.name) || idDi(d)}: ${righe[i].qty} ${righe[i].unit || ''}`)
  }
  if (esito.cambi.size === 0) continue
  const nome = strOf(d.fields?.name) || idDi(d)
  for (const [i, nuova] of esito.cambi) console.log(`   ~ ${nome.padEnd(30)} ${righe[i].qty} → ${nuova}`)
  const nuovi = valori.map((v, i) => {
    if (!esito.cambi.has(i)) return v
    const rf = v.mapValue.fields
    // `qty` mantiene il tipo che aveva: un intero resta intero.
    const tipo = rf.qty?.integerValue != null ? 'integerValue' : 'doubleValue'
    return { mapValue: { fields: { ...rf, qty: { [tipo]: esito.cambi.get(i) } } } }
  })
  scritture.push({
    update: { name: d.name, fields: { recipe_items: { arrayValue: { values: nuovi } } } },
    updateMask: { fieldPaths: ['recipe_items'] },
  })
}

console.log(`\n  ricette da riscrivere: ${scritture.length}`)
console.log(`  righe già a una volta e mezzo: ${giaFatte}`)
if (inattese.length) {
  console.log(`  dosi fuori tabella, NON toccate (${inattese.length}):`)
  for (const r of inattese) console.log(`   ! ${r}`)
}

if (!APPLY) {
  console.log('\n[ghiaccio] ANTEPRIMA: nessuna scrittura. Aggiungi --apply per salvare.')
  process.exit(0)
}
if (scritture.length === 0) {
  console.log('\n[ghiaccio] Niente da scrivere.')
  process.exit(0)
}
await db.commit(scritture)
console.log(`\n[ghiaccio] ✓ riscritte ${scritture.length} ricette su "${PROJECT}".`)
