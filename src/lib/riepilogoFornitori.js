// ── IL RIEPILOGO: i soldi che escono, mese per mese ──────────────────
//
// Quarta voce di Fornitori (REQ-MAG-025). Mette insieme i tre elenchi della
// sezione in un totale PER MESE: la merce (dalle fatture dei fornitori), le
// altre spese (quelle comprate) e quanto resta aperto.
//
// PERCHÉ STA QUI E NON IN BILANCIO, ed è la ragione scritta nel requisito: i
// soldi che escono si guardano dove si registrano. Bilancio → Mesi leggerà
// questi numeri per il netto (REQ-CASSA-012), ma non è il posto dove si
// scrivono.
//
// ── COSA ENTRA NEL TOTALE E COSA NO ──────────────────────────────────
//
// TOTALE = merce + altre spese, e sono le due cose registrate. Le altre due
// colonne NON si sommano, e non è una dimenticanza:
//
//   DA PAGARE è una FETTA della merce, non un'aggiunta: quelle fatture sono
//   già dentro «merce», e sommarle conterebbe due volte la stessa uscita.
//   Dice solo quanta parte del mese è ancora un debito.
//
//   SENZA FATTURA è merce ARRIVATA di cui manca il documento — il primo dei
//   due buchi di REQ-MAG-031. Sommarla al totale la conterebbe una seconda
//   volta il giorno che la fattura arriva; tenerla fuori e mostrarla accanto
//   dice quanto manca ancora al mese senza sporcarlo.
//
// ⚠️ IL NUMERO È PIÙ BASSO DI QUELLO DEL FOGLIO DI FLAVIO, sempre, e va
// saputo prima che qualcuno confronti i totali (misurato il 19/08: gen 2.380
// contro 1.809 di acquisti, apr 5.005 contro 2.884, giu 12.726 contro
// 8.673). Nel foglio la riga «spese» contiene ANCHE la merce; nell'app le
// due cose restano separate — la merce si conta una volta sola, nella sua
// colonna. Questa frase sta anche a schermo, perché al primo confronto
// sembrerebbe che l'app sbagli.

import { monthKey } from './ore.js'
import { fetteSenzaFattura, importoContabile } from './fatture.js'
import { spesePerMese } from './spese.js'

const rigaVuota = (mese) => ({
  mese,
  merce: 0,
  altre: 0,
  totale: 0,
  daPagare: 0,
  senzaFattura: 0,
})

// Il riepilogo, un mese per riga, dal più recente. I mesi sono quelli in cui
// è successo qualcosa: nessuna riga inventata per i mesi vuoti in mezzo, che
// nel gestionale di un bar aperto tutte le sere non ci sono, e in un elenco
// lungo sarebbero solo rumore.
export function riepilogoMesi({ fatture = [], spese = [], ordini = [], suppliers = [] } = {}) {
  const per = new Map()
  const riga = (mese) => {
    if (!per.has(mese)) per.set(mese, rigaVuota(mese))
    return per.get(mese)
  }

  // LA MERCE è l'importo del documento, pagato o no: la spesa è del mese in
  // cui il fornitore l'ha fatturata, non di quando si è saldata. Una fattura
  // senza data non ha mese e resta fuori: metterla nel mese corrente
  // sposterebbe soldi da un mese all'altro senza che nessuno l'abbia deciso.
  //
  // IL SEGNO LO DÀ `importoContabile` (BUG-100), e non è un `Number()` scritto
  // stretto: una NOTA DI CREDITO sottrae, perché non è una spesa ma la spesa
  // tolta — il fornitore riconosce di aver chiesto troppo. Il mese è quello
  // della nota, che è quando la correzione è stata emessa: portarla indietro
  // sul mese della fattura corretta sposterebbe soldi fra due mesi già
  // chiusi col commercialista.
  for (const f of fatture || []) {
    const mese = monthKey(f?.date)
    if (!mese) continue
    const r = riga(mese)
    const importo = importoContabile(f)
    r.merce += importo
    if (!f?.paid) r.daPagare += importo
  }

  for (const [mese, totale] of spesePerMese(spese)) riga(mese).altre += totale

  // QUANTO RESTA APERTO DAL LATO DELLA MERCE: le fette consegnate e senza
  // documento, al netto delle righe d'ordine — è l'unico numero che se ne
  // abbia, e non è l'importo di una fattura (che avrà l'IVA e magari un
  // reso). Il mese è quello dell'ordine, che è quando la merce è arrivata.
  for (const fetta of fetteSenzaFattura(ordini, fatture, { suppliers })) {
    const mese = monthKey(fetta?.created_at)
    if (!mese) continue
    riga(mese).senzaFattura += Number(fetta?.total_net) || 0
  }

  return [...per.values()]
    .map((r) => ({ ...r, totale: r.merce + r.altre }))
    .sort((a, b) => b.mese.localeCompare(a.mese))
}

// La somma delle righe, per la testata. Stessa forma di una riga, senza
// mese: chi la mostra usa le stesse etichette e non una seconda versione.
export function totaleRiepilogo(righe) {
  const tot = rigaVuota(null)
  for (const r of righe || []) {
    tot.merce += r.merce
    tot.altre += r.altre
    tot.daPagare += r.daPagare
    tot.senzaFattura += r.senzaFattura
  }
  tot.totale = tot.merce + tot.altre
  return tot
}

// Il mese come si legge in italiano: «agosto 2026». Il codice YYYY-MM è
// quello che sta nei dati e non quello che si mostra a chi guarda i conti.
const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

export function nomeMese(mese) {
  const [anno, m] = String(mese || '').split('-')
  const nome = MESI[Number(m) - 1]
  return nome ? `${nome} ${anno}` : String(mese || '—')
}
