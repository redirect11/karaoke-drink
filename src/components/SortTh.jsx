// ── L'INTESTAZIONE DI UNA COLONNA CHE ORDINA ─────────────────────────
//
// Un click ordina, il ri-click inverte, la freccia dice il verso attivo.
// Sta in un file suo perché le tabelle che la usano sono due — la lista del
// magazzino e la tabella del nuovo ordine (REQ-MAG-036) — e l'intestazione
// deve restare la stessa cosa in tutte e due: stesse classi, stesso gesto,
// stessa freccia. Il grid delle colonne è dichiarato dalla tabella
// (`--inv-cols`), quindi qui dentro non si aggiunge imbottitura orizzontale
// o le colonne si sfalsano dall'intestazione.
export default function SortTh({ label, col, sort, onSort, num = false }) {
  const active = sort.col === col
  return (
    <button
      type="button"
      className={`inv-th${num ? ' inv-cell-num' : ''}${active ? ' active' : ''}`}
      onClick={() => onSort(col)}
      title={`Ordina per ${label}`}
    >
      {label}
      <span aria-hidden className="inv-th-arrow">{active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
    </button>
  )
}
