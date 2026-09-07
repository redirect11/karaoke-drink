// =====================================================================
//  LE RIGHE DI LISTINO CHE SONO COLLI, NON PEZZI (REQ-MAG-040).
//
//    node scripts/correggi-colli.mjs --prova    # non scrive, racconta
//    node scripts/correggi-colli.mjs            # scrive SULL'EMULATORE
//
//  L'import dei listini (`importa-listini.mjs`) ha ricopiato dai fogli il
//  prezzo così com'era scritto, e per dieci righe quel prezzo è quello del
//  CARTONE: la Bjorne di FONT sta a 25,05 perché FONT la vende a cassa da
//  24. Senza dire quanti pezzi c'è dentro, l'app moltiplica i pezzi voluti
//  per il prezzo del cartone e chiede 200 euro per otto bottiglie. Questo
//  script scrive il numero che mancava — `pezzi_per_collo` — su quelle
//  dieci righe e basta.
//
//  DA DOVE VENGONO LE DIECI. Le ha trovate una misura fatta il 27/08 su 409
//  coppie prodotto-fornitore: dove il `cl` del foglio non tornava col
//  contenuto del prodotto si è guardato il prezzo, e se `prezzo / cl`
//  somigliava al costo già in archivio, allora quel `cl` erano i pezzi del
//  collo. Ne sono uscite dieci, tutte FONT — 24 per bibite e birre
//  industriali, 12 per le due artigianali MBU — e stanno scritte in
//  `colli-noti.json` con dentro anche il costo che l'app conosceva, che è
//  la prova del nove: MBU California 19,98 / 12 = 1,665 contro 1,67.
//
//  IL PREZZO NON CAMBIA, ed è il punto: 25,05 resta 25,05, perché è la
//  cifra che FONT fattura ed è quella che si controlla contro la bolla. A
//  cambiare è che adesso l'app sa che sono 24 pezzi, e il prezzo al pezzo
//  se lo ricava (`prezzoAlPezzo` in src/lib/listini.js).
//
//  SI RIPUÒ LANCIARE. Una riga già a posto si salta e si conta a parte: chi
//  lo rilancia dopo un `seed` non deve chiedersi se ha fatto danni.
//
//  SI SCRIVE SOLO SULL'EMULATORE. La produzione non compare qui e non ci si
//  arriva da questo file: là ci sono i dati veri del locale.
// =====================================================================
import { readFileSync } from 'node:fs'
import { idRigaListino } from '../src/lib/listini.js'

const EMU = process.env.EMU_HOST || 'http://localhost:8081'
const PROGETTO = process.env.EMU_PROJECT || 'demo-tana-drink'
const BASE = `${EMU}/v1/projects/${PROGETTO}/databases/(default)/documents`
const PROVA = process.argv.includes('--prova')

const capo = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }
const arg = (n) => {
  const i = process.argv.indexOf(n)
  return i > -1 ? process.argv[i + 1] : null
}
const colli = JSON.parse(
  readFileSync(new URL(`../${arg('--colli') || 'scripts/colli-noti.json'}`, import.meta.url), 'utf8')
)

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
// L'emulatore risponde `integerValue` o `doubleValue` a seconda di come il
// numero è stato scritto: si leggono tutti e due, se no una riga già a posto
// sembrerebbe da rifare a ogni giro.
const num = (f, k) => {
  const v = f?.[k]
  if (!v || v.nullValue !== undefined) return null
  if (v.integerValue !== undefined) return Number(v.integerValue)
  if (v.doubleValue !== undefined) return Number(v.doubleValue)
  return null
}
// Due prezzi sono lo stesso prezzo se coincidono al centesimo: il foglio ha
// due decimali e la virgola mobile no.
const stessoPrezzo = (a, b) => a != null && b != null && Math.abs(a - b) < 0.005

const items = (await leggi('inventory_items')).map((d) => ({
  id: d.name.split('/').pop(),
  nome: str(d.fields, 'name'),
}))
const fornitori = (await leggi('suppliers')).map((d) => ({
  id: d.name.split('/').pop(),
  nome: (str(d.fields, 'name') || '').toUpperCase(),
}))
const perNome = new Map(items.filter((i) => i.nome).map((i) => [i.nome, i.id]))
const fornPerNome = new Map(fornitori.map((s) => [s.nome, s.id]))

console.log(`emulatore           : ${EMU} (${PROGETTO})`)
console.log(`righe da sistemare  : ${colli.length}`)
if (PROVA) console.log('modo PROVA: non scrivo niente\n')
else console.log('')

let giaAPosto = 0
let scritte = 0
let mancanti = 0
let fallite = 0

for (const c of colli) {
  const itemId = perNome.get(c.prodotto)
  const supplierId = fornPerNome.get(String(c.fornitore).toUpperCase())
  const id = idRigaListino(supplierId, itemId)
  const etichetta = `${c.prodotto} da ${c.fornitore}`
  if (!id) {
    // Un prodotto o un fornitore che qui non c'è NON si inventa: sarebbe una
    // riga di listino nata da uno script, e nessuno saprebbe più da dove.
    console.log(`  ⚠ ${etichetta}: ${itemId ? 'fornitore' : 'prodotto'} non trovato — salto`)
    mancanti++
    continue
  }

  const r = await fetch(`${BASE}/supplier_prices/${id}`, { headers: capo })
  if (!r.ok) {
    console.log(`  ⚠ ${etichetta}: nessuna riga di listino (${r.status}) — salto`)
    mancanti++
    continue
  }
  const campi = (await r.json()).fields || {}
  const perColloOra = num(campi, 'pezzi_per_collo')
  const prezzoOra = num(campi, 'price')

  if (perColloOra === c.pezziPerCollo && stessoPrezzo(prezzoOra, c.prezzo)) {
    giaAPosto++
    continue
  }

  const alPezzo = (c.prezzo / c.pezziPerCollo).toFixed(4)
  console.log(
    `  ${etichetta}: ${c.prezzo} il collo da ${c.pezziPerCollo} → ${alPezzo}/pz` +
      ` (in archivio ${c.costoApp}/pz)`
  )
  if (PROVA) continue

  // `updateMask` tocca SOLO i due campi che ci riguardano: la riga ha anche
  // il codice del fornitore, la dicitura della confezione e lo storico degli
  // acquisti, e una PATCH senza maschera li azzererebbe.
  const url =
    `${BASE}/supplier_prices/${id}` +
    '?updateMask.fieldPaths=pezzi_per_collo&updateMask.fieldPaths=price'
  const res = await fetch(url, {
    method: 'PATCH',
    headers: capo,
    body: JSON.stringify({
      fields: {
        pezzi_per_collo: { integerValue: String(c.pezziPerCollo) },
        price: { doubleValue: c.prezzo },
      },
    }),
  })
  res.ok ? scritte++ : fallite++
  if (!res.ok) console.log(`     ✗ ${res.status}`)
}

console.log(
  `\ngià a posto ${giaAPosto}, ${PROVA ? 'da scrivere' : 'scritte'} ${colli.length - giaAPosto - mancanti - fallite}` +
    `, non trovate ${mancanti}, fallite ${fallite} — solo emulatore.`
)
