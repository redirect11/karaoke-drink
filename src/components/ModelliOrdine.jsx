import { useMemo, useState } from 'react'
import { modelloConNome, nomeModello, testoAvviso } from '../lib/modelliOrdine.js'
import ConfirmDialog from './ConfirmDialog.jsx'

// ── I MODELLI D'ORDINE, DOVE SI COMPONE (REQ-MAG-039) ────────────────
//
// «Nella creazione dell'ordine, oltre alla precompilazione, deve poter usare
// un template salvato — con quantità già impostate e prodotti per fornitore
// già selezionati. Il template si può salvare in fase di creazione»
// (l'utente, 27/08/2026).
//
// Sta in una riga sola sopra la tabella, e ci sta tutto: la tendina dei
// modelli con i tre gesti che li governano (usa, rinomina, elimina) e, a
// destra, il salvataggio di quello che si sta componendo. È qui e non in
// un'altra schermata perché è qui che Flavio ha davanti quello che vuole
// conservare — e conservarlo dev'essere un gesto solo, non una visita.
//
// IL TASTO DEL SALVATAGGIO DICE QUANTE RIGHE SALVA, e non è una decorazione:
// un modello si salva mentre si compone, cioè mentre la tabella è piena di
// righe che NON sono nell'ordine, e senza quel numero non si saprebbe se sta
// per conservare le dodici scelte o tutto il magazzino.
//
// COSA SUCCEDE APPLICANDONE UNO si legge subito sotto, e non è un dettaglio
// del requisito: un modello può contenere un prodotto che non esiste più o un
// fornitore che non lo vende più, e «chi lo applica deve vedere cosa non è
// stato ripreso e perché, invece di trovarsi un ordine più corto senza
// spiegazione».
export default function ModelliOrdine({
  modelli = [],
  righe = [],
  onApplica,
  onSalva,
  onElimina,
}) {
  const [scelto, setScelto] = useState('')
  // Il modulo del nome: `null` quando è chiuso, se no dice se si sta
  // salvando quello che c'è in composizione o rinominando un modello.
  const [modulo, setModulo] = useState(null)
  const [nome, setNome] = useState('')
  const [daEliminare, setDaEliminare] = useState(null)
  const [esito, setEsito] = useState(null)

  const modello = useMemo(() => modelli.find((m) => m.id === scelto) || null, [modelli, scelto])
  // Salvando con un nome già usato si AGGIORNA quel modello: due voci con lo
  // stesso nome in tendina sono il modo più rapido per applicare quella
  // sbagliata. Lo si dice prima di salvare, non dopo.
  const omonimo = useMemo(
    () => (modulo === 'salva' ? modelloConNome(modelli, nome) : null),
    [modulo, modelli, nome]
  )

  function apri(quale) {
    setModulo(quale)
    setNome(quale === 'rinomina' ? modello?.nome || '' : '')
  }

  function chiudi() {
    setModulo(null)
    setNome('')
  }

  function conferma(e) {
    e.preventDefault()
    const pulito = nomeModello(nome)
    if (!pulito) return
    if (modulo === 'rinomina') {
      if (!modello) return
      onSalva?.({ id: modello.id, nome: pulito, righe: modello.righe })
    } else {
      // Le righe sono quelle in composizione: il nome dice quale giro è, le
      // righe dicono da cosa è fatto.
      const salvato = onSalva?.({ id: omonimo?.id ?? null, nome: pulito, righe })
      if (salvato?.id) setScelto(salvato.id)
    }
    chiudi()
  }

  function usa() {
    if (!modello) return
    // L'esito arriva dalla schermata che applica: qui si mostra e basta.
    setEsito(onApplica?.(modello) || null)
  }

  function elimina() {
    const id = daEliminare?.id
    setDaEliminare(null)
    if (!id) return
    onElimina?.(id)
    if (scelto === id) setScelto('')
  }

  return (
    <div className="modelli-ordine">
      <div className="modelli-riga">
        <label htmlFor="po-modello" className="muted small">
          Modelli d’ordine
        </label>
        <select
          id="po-modello"
          value={scelto}
          onChange={(e) => setScelto(e.target.value)}
          disabled={modelli.length === 0}
        >
          <option value="">
            {modelli.length === 0 ? 'Nessun modello salvato' : '— Scegli un modello —'}
          </option>
          {modelli.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} ({m.righe?.length || 0})
            </option>
          ))}
        </select>
        {/* Spenti quando non c'è un modello scelto: il motivo è la tendina qui
            accanto, che sta nella stessa riga e lo dice da sola. */}
        <button type="button" className="btn ghost small" disabled={!modello} onClick={usa}>
          Usa il modello
        </button>
        <button
          type="button"
          className="btn ghost small"
          disabled={!modello}
          onClick={() => apri('rinomina')}
        >
          Rinomina
        </button>
        <button
          type="button"
          className="btn ghost small"
          disabled={!modello}
          onClick={() => setDaEliminare(modello)}
        >
          Elimina
        </button>
        <span className="grow" />
        <button
          type="button"
          className="btn ghost small"
          disabled={righe.length === 0}
          onClick={() => apri('salva')}
        >
          {righe.length === 0
            ? 'Salva come modello'
            : `Salva le ${righe.length} righe come modello`}
        </button>
      </div>

      {modulo && (
        <form className="modelli-riga" onSubmit={conferma}>
          <label htmlFor="po-modello-nome" className="muted small">
            {modulo === 'rinomina' ? 'Nuovo nome' : 'Nome del modello'}
          </label>
          <input
            id="po-modello-nome"
            type="text"
            value={nome}
            autoFocus
            placeholder="Es. Giro della settimana"
            onChange={(e) => setNome(e.target.value)}
          />
          <button type="submit" className="btn small" disabled={!nomeModello(nome)}>
            Salva
          </button>
          <button type="button" className="btn ghost small" onClick={chiudi}>
            Annulla
          </button>
          {omonimo && (
            <span className="muted small">
              Un modello con questo nome c’è già: viene aggiornato.
            </span>
          )}
        </form>
      )}

      {/* COSA NON È STATO RIPRESO, E PERCHÉ. `role="status"` perché è la
          risposta a un gesto appena fatto, e chi legge con un lettore di
          schermo la deve sentire senza andarla a cercare. */}
      {esito && (
        <div className="modelli-esito" role="status">
          <div className="row between">
            <strong className="small">
              {esito.riprese === esito.totali
                ? `Riprese tutte le ${esito.totali} righe del modello.`
                : `Riprese ${esito.riprese} righe su ${esito.totali}.`}
            </strong>
            <button
              type="button"
              className="btn ghost small"
              aria-label="Chiudi il riepilogo del modello"
              onClick={() => setEsito(null)}
            >
              ✕
            </button>
          </div>
          {esito.avvisi.length > 0 && (
            <ul className="muted small modelli-avvisi">
              {esito.avvisi.map((a, i) => (
                <li key={`${a.item_id || 'x'}-${i}`}>{testoAvviso(a)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {daEliminare && (
        <ConfirmDialog
          title="Eliminare il modello?"
          message={`«${daEliminare.nome}» non comparirà più fra i modelli. Gli ordini già fatti non cambiano.`}
          confirmLabel="Elimina"
          danger
          onCancel={() => setDaEliminare(null)}
          onConfirm={elimina}
        />
      )}
    </div>
  )
}
