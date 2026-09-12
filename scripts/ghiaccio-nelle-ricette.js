// =====================================================================
//  IL GHIACCIO NELLE RICETTE SI MOLTIPLICA: ×2 RISPETTO ALLA DOSE SCRITTA.
//
//    node scripts/ghiaccio-nelle-ricette.js                      # ANTEPRIMA
//    node scripts/ghiaccio-nelle-ricette.js --apply              # scrive
//    node scripts/ghiaccio-nelle-ricette.js --da 1.5 --apply     # se le dosi sono già a ×1,5 e il segno manca
//    node scripts/ghiaccio-nelle-ricette.js --a 2                # l'obiettivo (2 se non si dice altro)
//    node scripts/ghiaccio-nelle-ricette.js --ghiaccio <id>      # se di ghiaccio ce n'è più d'uno
//    node scripts/ghiaccio-nelle-ricette.js --project tana-drink --apply
//
//  Flavio, 09/09/2026: «bisognerebbe moltiplicare tutte le quantità di
//  ghiaccio per 1,5». E il 12/09: «ho fatto un errore di calcolo, quindi va
//  raddoppiato in tutte le ricette degli items di menù dove è presente». Il
//  consumo vero al banco è il doppio di quello scritto: la dose messa un
//  anno fa era bassa e il magazzino del ghiaccio scendeva meno di quanto
//  usciva davvero.
//
//  L'OBIETTIVO È SEMPRE RISPETTO ALLA DOSE ORIGINALE. Sull'articolo del
//  ghiaccio resta un segno, `ricette_fattore`, che dice a quante volte
//  l'originale stanno le dosi adesso: lo script parte da lì (o da `--da`
//  se il segno manca, come su test dove il ×1,5 è passato prima del segno),
//  moltiplica per quello che manca e alla fine scrive il segno nuovo.
//  Rilanciato per sbaglio, trova il segno già all'obiettivo e si ferma.
//
//  Si toccano SOLO le righe di ricetta (`recipe_items`) che puntano
//  all'articolo del ghiaccio, e solo la quantità: il resto della ricetta,
//  il testo libero `recipe` e la giacenza del ghiaccio restano com'erano.
//
//  Default: progetto tana-drink-test (la produzione va indicata a mano, e
//  prima si fa il backup: `node scripts/backup-db.js --project tana-drink`).
// =====================================================================
import { accessToken, client, idDi, arg, flag } from './lib-firestore.js'
import { righeDaRiscrivere, fattoreDaApplicare } from './lib-ghiaccio.js'

const PROJECT = arg('project', 'tana-drink-test')
const APPLY = flag('apply')
const GHIACCIO = arg('ghiaccio')
const OBIETTIVO = Number(arg('a', '2'))
const DA = arg('da')

const db = client(PROJECT, await accessToken())
const strOf = (f) => (f?.stringValue != null ? f.stringValue : null)
const numOf = (f) =>
  f?.doubleValue != null ? Number(f.doubleValue) : f?.integerValue != null ? Number(f.integerValue) : null

// ── L'articolo del ghiaccio, col suo segno ───────────────────────────
const articoli = await db.documenti('inventory_items', { campi: ['name', 'unit', 'ricette_fattore'] })
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
const segno = numOf(ghiaccio.fields?.ricette_fattore)
const attuale = DA != null ? Number(DA) : segno ?? 1
console.log(
  `[ghiaccio] articolo: ${strOf(ghiaccio.fields?.name)} (${idGhiaccio}, ${strOf(ghiaccio.fields?.unit) || '?'}) su "${PROJECT}"`
)
console.log(
  `[ghiaccio] dosi adesso a ×${attuale} dell'originale (${DA != null ? 'detto con --da' : segno != null ? 'segno sull’articolo' : 'nessun segno: originali'}), obiettivo ×${OBIETTIVO}`
)
if (attuale === OBIETTIVO) {
  console.log(`[ghiaccio] Le dosi sono già a ×${OBIETTIVO}: niente da fare.`)
  process.exit(0)
}
const fattore = fattoreDaApplicare(attuale, OBIETTIVO)
console.log(`[ghiaccio] si moltiplica per ${fattore}`)

// ── Le ricette ───────────────────────────────────────────────────────
const drinks = await db.documenti('drinks')
const scritture = []
const saltate = []
let righeToccate = 0
for (const d of drinks) {
  const valori = d.fields?.recipe_items?.arrayValue?.values || []
  const righe = valori.map((v) => {
    const rf = v.mapValue?.fields || {}
    return { inventory_item_id: strOf(rf.inventory_item_id), qty: numOf(rf.qty), unit: strOf(rf.unit) }
  })
  const esito = righeDaRiscrivere(righe, idGhiaccio, fattore)
  for (const i of esito.saltate) saltate.push(`${strOf(d.fields?.name) || idDi(d)}: ${righe[i].qty} ${righe[i].unit || ''}`)
  if (esito.cambi.size === 0) continue
  const nome = strOf(d.fields?.name) || idDi(d)
  for (const [i, nuova] of esito.cambi) console.log(`   ~ ${nome.padEnd(30)} ${righe[i].qty} → ${nuova}`)
  righeToccate += esito.cambi.size
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

console.log(`\n  ricette da riscrivere: ${scritture.length} (${righeToccate} righe di ghiaccio)`)
if (saltate.length) {
  console.log(`  righe senza una dose, NON toccate (${saltate.length}):`)
  for (const r of saltate) console.log(`   ! ${r}`)
}

if (!APPLY) {
  console.log('\n[ghiaccio] ANTEPRIMA: nessuna scrittura. Aggiungi --apply per salvare.')
  process.exit(0)
}
// Il segno si scrive anche se nessuna ricetta cambia: dice a quante volte
// l'originale stanno le dosi, ed è quello che ferma il prossimo lancio.
scritture.push({
  update: {
    name: ghiaccio.name,
    fields: {
      ricette_fattore: { doubleValue: OBIETTIVO },
      ricette_fattore_at: { timestampValue: new Date().toISOString() },
    },
  },
  updateMask: { fieldPaths: ['ricette_fattore', 'ricette_fattore_at'] },
})
await db.commit(scritture)
console.log(`\n[ghiaccio] ✓ riscritte ${scritture.length - 1} ricette su "${PROJECT}", segno a ×${OBIETTIVO}.`)
