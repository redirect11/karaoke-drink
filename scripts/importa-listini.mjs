// =====================================================================
//  I LISTINI DEI FORNITORI, DAI FOGLI DI FLAVIO.
//
//    node scripts/importa-listini.mjs --prova    # non scrive, racconta
//    node scripts/importa-listini.mjs            # scrive SULL'EMULATORE
//
//  In `GEN ORD REC.xlsx` ogni riga d'ordine porta il FORNITORE (colonna
//  `FORNIT`) e il prezzo netto al pezzo: due anni di ordini veri, cioè
//  esattamente il listino che l'app chiede di compilare a mano.
//
//  L'AGGANCIO DEI NOMI NON SI FA A OCCHIO. Il nome sul foglio e il nome in
//  magazzino non coincidono quasi mai («MBU Westcost IPA California» contro
//  «MBU California»), quindi si usa `bestMatch` di src/lib/nameMatch.js —
//  lo stesso attrezzo nato per i listini fornitore. Sopra la soglia e senza
//  ambiguità si aggancia da solo; sotto, decide una persona, e le decisioni
//  prese stanno nel file passato con --decisioni: articolo del foglio →
//  nome in magazzino, oppure `null` per «è un altro prodotto».
//
//  QUELLE DECISIONI SONO STATE PRESE CONFRONTANDO I FORMATI, non a naso: la
//  colonna `cl` del foglio contro il contenuto del pezzo in magazzino.
//  «Estathe' Limone» a 33 cl è la lattina e non il vetro; «Pompelmo» a 20 cl
//  non è il «Pompelmo 1L» e va creato; «Schweppes Ginger» a 18 cl è la
//  Ginger Beer (180 ml) e non la Ginger Ale (200 ml).
//
//  SI SCRIVE SOLO SULL'EMULATORE. La produzione non compare qui e non ci si
//  arriva da questo file: là ci sono i dati veri del locale.
// =====================================================================
import { readFileSync } from 'node:fs'
import { bestMatch } from '../src/lib/nameMatch.js'
import { COLORI_FORNITORE, idRigaListino } from '../src/lib/listini.js'

const EMU = process.env.EMU_HOST || 'http://localhost:8081'
const PROGETTO = process.env.EMU_PROJECT || 'demo-tana-drink'
const BASE = `${EMU}/v1/projects/${PROGETTO}/databases/(default)/documents`
const PROVA = process.argv.includes('--prova')
const SOGLIA = 0.88

const capo = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }
const arg = (n) => {
  const i = process.argv.indexOf(n)
  return i > -1 ? process.argv[i + 1] : null
}
const coppie = JSON.parse(readFileSync(arg('--coppie') || 'coppie.json', 'utf8'))
const decisioni = JSON.parse(readFileSync(arg('--decisioni') || 'decisioni.json', 'utf8'))

async function leggi(coll) {
  const out = []
  let t = ''
  do {
    const r = await fetch(`${BASE}/${coll}?pageSize=300${t ? `&pageToken=${t}` : ''}`, { headers: capo })
    if (!r.ok) throw new Error(`${coll}: ${r.status} — l'emulatore risponde?`)
    const d = await r.json()
    out.push(...(d.documents || []))
    t = d.nextPageToken || ''
  } while (t)
  return out
}
const str = (f, k) => f?.[k]?.stringValue ?? null

const items = await leggi('inventory_items').then((l) =>
  l.map((d) => ({ id: d.name.split('/').pop(), nome: str(d.fields, 'name') })).filter((x) => x.nome)
)
const fornitori = await leggi('suppliers').then((l) =>
  l.map((d) => ({ id: d.name.split('/').pop(), nome: (str(d.fields, 'name') || '').toUpperCase() }))
)
const perNome = new Map(items.map((i) => [i.nome, i.id]))
const nomi = items.map((i) => i.nome)

// ── 1. i fornitori che nei fogli ci sono e in anagrafica no ──────────
const nuovi = [...new Set(coppie.map((c) => c.fornitore.toUpperCase()))].filter(
  (f) => !fornitori.some((s) => s.nome === f)
)
console.log(`fornitori nei fogli : ${new Set(coppie.map((c) => c.fornitore)).size}`)
console.log(`da creare           : ${nuovi.length}${nuovi.length ? ' → ' + nuovi.join(', ') : ''}`)

if (!PROVA) {
  let i = fornitori.length
  for (const nome of nuovi) {
    const campi = {
      name: { stringValue: nome },
      email: { nullValue: null },
      notes: { nullValue: null },
      sort_order: { integerValue: String(++i) },
      // Il colore non è casuale come nell'app: qui si importa in blocco, e
      // due fornitori dello stesso colore nella lista degli ordini si
      // distinguerebbero solo leggendo il nome — cioè proprio la fatica che
      // il colore doveva togliere. Si scorre la tavolozza.
      color: { stringValue: COLORI_FORNITORE[i % COLORI_FORNITORE.length] },
      created_at: { timestampValue: new Date().toISOString() },
    }
    const r = await fetch(`${BASE}/suppliers`, {
      method: 'POST',
      headers: capo,
      body: JSON.stringify({ fields: campi }),
    })
    const d = await r.json()
    if (r.ok) fornitori.push({ id: d.name.split('/').pop(), nome })
    else console.log(`  ✗ ${nome}: ${r.status}`)
  }
}
const fornPerNome = new Map(fornitori.map((s) => [s.nome, s.id]))

// ── 2. l'aggancio dei nomi ───────────────────────────────────────────
const chiaviDecise = Object.keys(decisioni)
function decisionePer(articolo) {
  if (Object.prototype.hasOwnProperty.call(decisioni, articolo)) return decisioni[articolo]
  // Alcuni nomi dei fogli portano caratteri che il foglio ha salvato male
  // (accenti, gradi): si riconoscono dal prefisso, che è già abbastanza
  // lungo da non prendere un prodotto per un altro.
  const k = chiaviDecise.find((x) => x.length > 6 && articolo.startsWith(x))
  return k ? decisioni[k] : undefined
}

const sicure = []
const decise = []
const daChiedere = []
const senzaProdotto = []
const memo = new Map()

for (const c of coppie) {
  const scelta = decisionePer(c.articolo)
  if (scelta === null) continue // deciso da una persona: è un altro prodotto
  if (typeof scelta === 'string') {
    if (perNome.has(scelta)) {
      decise.push({ ...c, prodotto: scelta })
    } else {
      console.log(`  ⚠ decisione verso un prodotto che non esiste: ${scelta}`)
    }
    continue
  }
  let m = memo.get(c.articolo)
  if (m === undefined) {
    m = bestMatch(c.articolo, nomi)
    memo.set(c.articolo, m)
  }
  if (m && m.score >= SOGLIA && !m.ambiguous) sicure.push({ ...c, prodotto: m.value })
  else if (m && m.score >= 0.6) daChiedere.push({ ...c, prodotto: m.value, score: m.score })
  else senzaProdotto.push(c)
}

console.log(`\ncoppie nei fogli    : ${coppie.length}`)
console.log(`  aggancio sicuro   : ${sicure.length}`)
console.log(`  decise a mano     : ${decise.length}`)
console.log(`  ancora da chiedere: ${daChiedere.length}`)
console.log(`  prodotto assente  : ${senzaProdotto.length}`)
for (const x of daChiedere) console.log(`     ? ${x.articolo} → ${x.prodotto} (${x.score})`)

// ── 3. le righe di listino ───────────────────────────────────────────
const daScrivere = [...sicure, ...decise]
console.log(`\nrighe di listino da scrivere: ${daScrivere.length}`)
if (PROVA) {
  console.log('\n(prova: non ho scritto niente)')
  process.exit(0)
}

let ok = 0
let ko = 0
for (const r of daScrivere) {
  const supplierId = fornPerNome.get(r.fornitore.toUpperCase())
  const itemId = perNome.get(r.prodotto)
  const id = idRigaListino(supplierId, itemId)
  if (!id) {
    ko++
    continue
  }
  const campi = {
    supplier_id: { stringValue: supplierId },
    item_id: { stringValue: itemId },
    price: { doubleValue: r.prezzo },
    // `last_price` resta vuoto: il foglio dice il prezzo di LISTINO, non che
    // quella merce sia stata comprata davvero l'ultima volta a quella cifra.
    // È su `last_price_at` che si decide il fornitore proposto al prossimo
    // ordine, e riempirlo di date inventate lo farebbe sbagliare.
    last_price: { nullValue: null },
    last_price_at: { nullValue: null },
    package_label: { nullValue: null },
    code: { nullValue: null },
  }
  const res = await fetch(`${BASE}/supplier_prices/${id}`, {
    method: 'PATCH',
    headers: capo,
    body: JSON.stringify({ fields: campi }),
  })
  res.ok ? ok++ : ko++
}
console.log(`\nscritte ${ok}, fallite ${ko} — solo emulatore.`)
