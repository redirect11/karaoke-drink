// ── L'ASSORTIMENTO, IN PAROLE ────────────────────────────────────────
// I quattro stati stanno in `inventory.js` (ASSORTIMENTI, assortimentoDi);
// qui i nomi corti e le spiegazioni che servono ai FILTRI — nel magazzino e
// nel nuovo ordine al fornitore, che sono lo stesso filtro in due posti
// (vedi `components/FiltroAssortimento.jsx`). Le etichette lunghe per la
// riga del prodotto restano `ETICHETTA_ASSORTIMENTO`.

// I nomi in parole: servono al tasto della tendina, che deve dire cosa è
// scelto senza doversi aprire.
export const ASSORTIMENTO_NOME = {
  assortimento: 'In assortimento',
  linea: 'In linea',
  premium: 'Premium',
  out: 'Fuori assortimento',
}

export const ASSORTIMENTO_TITOLO = {
  assortimento: 'Si tiene, senza niente di speciale',
  linea: 'I primi da controllare prima di una serata',
  // «Bottiglie premium» dava per scontato che qui dentro ci fossero solo
  // bottiglie: un gestionale deve restare generico (REQ-MAG-019).
  premium: 'I prodotti buoni',
  out: 'Fuori assortimento: non si ricompra',
}

// Cosa dice il tasto di una tendina che contiene solo questo filtro.
export function riassuntoAssortimento(scelti) {
  if (scelti.length === 0) return 'Assortimento'
  if (scelti.length === 1) return ASSORTIMENTO_NOME[scelti[0]]
  return `${scelti.length} assortimenti`
}

// Accende o spegne una voce: si possono tenere accesi PIÙ valori insieme
// (linea + premium, linea + out…), e vuoto vuol dire «si vede tutto».
export const toggleVoce = (lista, k) =>
  lista.includes(k) ? lista.filter((x) => x !== k) : [...lista, k]
