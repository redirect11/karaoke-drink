// =====================================================================
//  LA TABELLA DELLE DOSI DI GHIACCIO, e il conto che la applica a una
//  ricetta. Sta fuori dallo script perché è la parte che si prova: è lei
//  che decide se una riga si riscrive, si lascia o si segnala.
// =====================================================================

// Dose scritta → dose nuova (Flavio, 09/09/2026: «se ho 100 grammi
// diventano 150, se ho 200 diventano 300»). Le dosi d'arrivo (150, 300) si
// riconoscono come «già fatto»: è quello che rende lo script rilanciabile.
export const DOSI_GHIACCIO = { 100: 150, 200: 300 }
const GIA_FATTE = new Set(Object.values(DOSI_GHIACCIO))

// `righe`: le righe di ricetta ({ inventory_item_id, qty }), nell'ordine in
// cui stanno nel documento. Torna gli INDICI, non le righe: chi scrive deve
// rimettere la quantità nuova al suo posto lasciando intatto tutto il resto.
//
// Con `ancheFuoriTabella` le dosi che non stanno in tabella (un 220, un 80)
// si moltiplicano per 1,5 lo stesso: è la regola detta da Flavio, ma su
// quelle righe non c'è modo di capire dopo se è già stato fatto, quindi la
// si chiede a parte e la si usa UNA volta, guardando l'anteprima.
export function righeDaRiscrivere(righe, idGhiaccio, { ancheFuoriTabella = false } = {}) {
  const cambi = new Map()
  const giaFatte = []
  const inattese = []
  ;(righe || []).forEach((r, i) => {
    if (!r || r.inventory_item_id !== idGhiaccio) return
    const qty = Number(r.qty)
    if (Object.hasOwn(DOSI_GHIACCIO, qty)) cambi.set(i, DOSI_GHIACCIO[qty])
    else if (GIA_FATTE.has(qty)) giaFatte.push(i)
    else if (ancheFuoriTabella && qty > 0) cambi.set(i, Math.round(qty * 1.5))
    else inattese.push(i)
  })
  return { cambi, giaFatte, inattese }
}
