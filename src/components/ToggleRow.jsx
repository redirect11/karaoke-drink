import { showToast } from '../lib/toast.js'

// L'INTERRUTTORE CON LA SUA SPIEGAZIONE: una riga, il nome sopra e il
// perché sotto. È la forma di ogni acceso/spento del pannello impostazioni
// e degli avvisi — stava scritta uguale in due file, e da quando la usa
// anche «Stampa automatica» sarebbero stati tre.
//
// DUE MODI DI ESSERE SPENTO, e non sono lo stesso:
// · `disabled` — non si tocca e non c'è niente da spiegare (di solito
//   perché un altro interruttore in pagina lo governa, e si vede).
// · `motivo` — non si tocca ma AL TOCCO DICE PERCHÉ. Qui l'input non è
//   `disabled` ma `aria-disabled`: un `disabled` non fa nemmeno partire
//   l'evento, e chi preme resta a premere un tasto morto senza sapere cosa
//   ha sbagliato. È lo stesso modo dei metodi di pagamento non disponibili
//   e del tasto «Acconto» che salderebbe il conto (PaymentScreen).
// `onChange` ha un default apposta: un interruttore con un `motivo` non lo
// chiama mai, e chiedere a chi lo usa di passare una funzione vuota
// sarebbe rumore.
export default function ToggleRow({
  label,
  desc,
  checked,
  onChange = () => {},
  disabled,
  motivo,
}) {
  const spento = !!motivo
  return (
    <div className="toggle-row">
      <div>
        <div>{label}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <input
        type="checkbox"
        className={`toggle${spento ? ' spento' : ''}`}
        checked={!!checked}
        disabled={disabled && !spento}
        aria-disabled={spento || undefined}
        onChange={(e) => (spento ? showToast(motivo) : onChange(e.target.checked))}
      />
    </div>
  )
}
