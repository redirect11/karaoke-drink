// =====================================================================
//  DAL VECCHIO CAMPO FORNITORE AL LISTINO.
//
//    node scripts/migra-listini.mjs --prova      # non scrive, dice cosa farebbe
//    node scripts/migra-listini.mjs              # scrive SULL'EMULATORE
//
//  Fino a REQ-MAG-029 il fornitore stava SUL PRODOTTO (`supplier_id`), uno
//  solo. Adesso sta nel listino, una riga per coppia prodotto-fornitore,
//  perché lo stesso prodotto si compra da più fornitori a prezzi diversi.
//
//  Il ramo di compatibilità (`rigaVirtuale` in src/lib/listini.js) faceva
//  finta che quei prodotti avessero una riga; ma la schermata del listino
//  legge le righe VERE, quindi quei prodotti sparivano — è il difetto che
//  ha fatto vedere il listino di Nova vuoto. Si converte il dato una volta
//  e il ramo di compatibilità smette di servire.
//
//  SI SCRIVE SOLO SULL'EMULATORE. La produzione non compare in questo file
//  e non ci si arriva da qui: là ci sono i dati veri del locale.
// =====================================================================
const EMU = 'http://localhost:8081'
const PROGETTO = process.env.EMU_PROJECT || 'demo-tana-drink'
const BASE = `${EMU}/v1/projects/${PROGETTO}/databases/(default)/documents`
const PROVA = process.argv.includes('--prova')

const capo = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

async function leggi(coll) {
  const out = []
  let token = ''
  do {
    const r = await fetch(`${BASE}/${coll}?pageSize=300${token ? `&pageToken=${token}` : ''}`, { headers: capo })
    if (!r.ok) throw new Error(`${coll}: ${r.status} — l'emulatore risponde?`)
    const d = await r.json()
    out.push(...(d.documents || []))
    token = d.nextPageToken || ''
  } while (token)
  return out
}

const str = (f, k) => f?.[k]?.stringValue ?? null
const num = (f, k) =>
  f?.[k]?.doubleValue ?? (f?.[k]?.integerValue != null ? Number(f[k].integerValue) : null)

const items = await leggi('inventory_items')
const listini = await leggi('supplier_prices')
const gia = new Set(listini.map((d) => d.name.split('/').pop()))

const daFare = []
for (const doc of items) {
  const f = doc.fields || {}
  const supplier = str(f, 'supplier_id')
  if (!supplier) continue
  const itemId = doc.name.split('/').pop()
  const id = `${supplier}__${itemId}`
  if (gia.has(id)) continue
  daFare.push({ id, supplier, itemId, nome: str(f, 'name'), costo: num(f, 'cost') })
}

console.log(`prodotti          : ${items.length}`)
console.log(`righe di listino  : ${listini.length}`)
console.log(`da convertire     : ${daFare.length}`)
for (const d of daFare) console.log(`  ${d.nome} → ${d.supplier} @ ${d.costo ?? '—'}`)

if (PROVA) { console.log('\n(prova: non ho scritto niente)'); process.exit(0) }

for (const d of daFare) {
  const campi = {
    supplier_id: { stringValue: d.supplier },
    item_id: { stringValue: d.itemId },
    price: d.costo == null ? { nullValue: null } : { doubleValue: d.costo },
    // `last_price` resta vuoto: il vecchio campo diceva CHI, non a quanto si
    // era comprato l'ultima volta. Inventarlo falserebbe il fornitore
    // proposto al prossimo ordine, che si decide proprio su quel dato.
    last_price: { nullValue: null },
    last_price_at: { nullValue: null },
    package_label: { nullValue: null },
    code: { nullValue: null },
  }
  const r = await fetch(`${BASE}/supplier_prices?documentId=${d.id}`, {
    method: 'POST', headers: capo, body: JSON.stringify({ fields: campi }),
  })
  console.log(r.ok ? `✓ ${d.nome}` : `✗ ${d.nome}: ${r.status}`)
}
console.log('\nfatto — solo emulatore.')
