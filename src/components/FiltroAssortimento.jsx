import { ASSORTIMENTI, assortimentoDi } from '../lib/inventory.js'
import { ASSORTIMENTO_TITOLO } from '../lib/assortimento.js'

// ── IL FILTRO PER ASSORTIMENTO, UNO SOLO PER DUE SCHERMATE ───────────
//
// Lo stesso blocco di quattro voci sta nella tendina del magazzino e in
// quella del nuovo ordine al fornitore (Flavio, 09/09/2026: «bisognerebbe
// mettere il filtro anche per in assortimento, premium e fuori
// assortimento» dove si compone l'ordine). Se fossero due copie, il giorno
// che cambia un'etichetta o un segno cambierebbe da una parte sola, e chi
// passa da una schermata all'altra troverebbe due nomi per la stessa cosa.
//
// I SEGNI: un bollino rosso «OUT» sui fuori assortimento (si vede subito
// che non si ricompra) e una coroncina piccola sui premium. Chi è «in
// linea» non porta niente: è la normalità, e un segno su tutto non segna
// nulla. Il chip del filtro porta lo STESSO segno che compare nella riga:
// è lì che si impara cosa vuol dire il bollino, senza una legenda a parte.
// I nomi in parole e le spiegazioni stanno in `lib/assortimento.js`.
const ASSORTIMENTO_LABEL = {
  assortimento: <>📦 In assortimento</>,
  linea: <>🍾 In linea</>,
  premium: <>👑 Premium</>,
  out: (
    <>
      <span className="badge-empty">OUT</span> Fuori assortimento
    </>
  ),
}
export default function FiltroAssortimento({ items = [], scelti = [], onToggle }) {
  return (
    <>
      <div className="tendina-titolo">Assortimento</div>
      {ASSORTIMENTI.map((k) => {
        const quanti = items.filter((it) => assortimentoDi(it) === k).length
        return (
          <button
            key={k}
            type="button"
            className={`tendina-voce${scelti.includes(k) ? ' scelta' : ''}`}
            onClick={() => onToggle(k)}
            title={ASSORTIMENTO_TITOLO[k]}
          >
            <span>{ASSORTIMENTO_LABEL[k]}</span>
            <strong>{quanti}</strong>
          </button>
        )
      })}
    </>
  )
}
