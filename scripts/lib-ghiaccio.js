// =====================================================================
//  IL CONTO CHE MOLTIPLICA IL GHIACCIO NELLE RICETTE. Sta fuori dallo
//  script perché è la parte che si prova: è lei che decide di quanto si
//  moltiplica e quali righe si riscrivono.
//
//  DUE VOLTE LA DOSE SCRITTA. Il 09/09/2026 Flavio aveva chiesto «per 1,5»;
//  il 12/09 si è corretto: «ho fatto un errore di calcolo, va raddoppiato
//  in tutte le ricette». L'obiettivo si dice sempre RISPETTO ALLA DOSE
//  ORIGINALE, quella scritta a mano nelle ricette: «×2» vuol dire che 100 g
//  diventano 200, qualunque cosa ci sia scritto adesso.
//
//  Da dove si parte lo dice un segno sull'articolo del ghiaccio
//  (`ricette_fattore`: 1,5 se il ×1,5 è già passato, niente se le dosi sono
//  ancora quelle originali). Con quel segno lo script sa di quanto
//  moltiplicare per arrivare all'obiettivo — su test, già a ×1,5, si
//  moltiplica per 4/3 — e, rilanciato per sbaglio, trova il segno a 2 e non
//  fa niente. Era il pericolo del primo script (100 → 150 → 225 senza che
//  nessuno se ne accorga), risolto allora con una tabella di dosi: con il
//  ×2 la tabella non basta, perché 200 è insieme una dose di partenza e una
//  d'arrivo.
// =====================================================================

// Di quanto moltiplicare ADESSO per portare le dosi da `attuale` volte
// l'originale a `obiettivo` volte l'originale. `attuale` mancante o non
// valido vuol dire «dosi originali» (1).
export function fattoreDaApplicare(attuale, obiettivo) {
  const a = Number(obiettivo)
  if (!(a > 0)) throw new Error(`Obiettivo non valido: ${obiettivo}`)
  const da = Number(attuale) > 0 ? Number(attuale) : 1
  return a / da
}

// `righe`: le righe di ricetta ({ inventory_item_id, qty }), nell'ordine in
// cui stanno nel documento. Torna gli INDICI, non le righe: chi scrive deve
// rimettere la quantità nuova al suo posto lasciando intatto tutto il resto.
// Si tocca SOLO il ghiaccio, e solo una dose vera (> 0): uno zero o una
// scritta si segnalano in `saltate` e restano com'erano.
export function righeDaRiscrivere(righe, idGhiaccio, fattore) {
  const cambi = new Map()
  const saltate = []
  ;(righe || []).forEach((r, i) => {
    if (!r || r.inventory_item_id !== idGhiaccio) return
    const qty = Number(r.qty)
    if (!(qty > 0)) {
      saltate.push(i)
      return
    }
    const nuova = Math.round(qty * fattore)
    if (nuova !== qty) cambi.set(i, nuova)
  })
  return { cambi, saltate }
}
