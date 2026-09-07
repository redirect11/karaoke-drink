import { useEffect, useState } from 'react'
import {
  stampanteFintaAttiva,
  forzaStampanteFinta,
  guastoFinto,
  impostaGuastoFinto,
} from '../lib/stampanteFinta.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import {
  clearDatabase,
  resetWithMockData,
  createMockHistory,
  simulatePaymentResult,
  simulateReaderPayment,
  isDevEnvironment,
} from '../dev/devActions.js'
import { subscribeActiveOrders, subscribeSettings, updateSettings } from '../lib/api.js'
import {
  chiaveModulo,
  moduliPremium,
  moduloAcceso,
  moduloIncluso,
} from '../lib/licenza.js'
import ToggleRow from './ToggleRow.jsx'
import { runImport } from '../dev/importExcel.js'

// Opzioni sviluppatore: visibili SOLO in ambiente emulatore (Docker locale
// o ambiente di test). Permettono di svuotare il db o resettarlo coi mock.
export default function DevTools() {
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])
  const [error, setError] = useState(null)
  const [confirm, setConfirm] = useState(null) // { title, message, run }
  // La stampante finta com'è ADESSO su questo terminale (ambiente o forzatura).
  const [fintaAccesa, setFintaAccesa] = useState(() => stampanteFintaAttiva())
  // Il guasto che la stampante finta deve simulare, se ne deve simulare uno.
  const [guasto, setGuasto] = useState(() => guastoFinto() || '')

  // Pagamenti da simulare: in dev non ci sono Cloud Functions, quindi
  // l'esito del checkout SumUp si "recita" da qui.
  const [pending, setPending] = useState([])
  const [unpaid, setUnpaid] = useState([])
  // Le impostazioni del bar servono agli interruttori dei moduli premium
  // qui sotto: si guarda e si scrive lo stesso flag che legge lib/licenza.js.
  const [impostazioni, setImpostazioni] = useState(null)
  useEffect(() => subscribeSettings(setImpostazioni, () => {}), [])

  // L'inclusione si scrive SEMPRE per intero: `licenza.moduli` è la verità
  // completa su cosa il locale ha, e una mappa scritta a metà direbbe che
  // tutto il resto non è incluso. Si parte da com'è messo adesso ogni
  // modulo e si cambia solo quello toccato.
  const scriviInclusione = (id, incluso) => {
    const moduli = Object.fromEntries(
      moduliPremium().map((m) => [m.id, m.id === id ? incluso : moduloIncluso(impostazioni, m.id)])
    )
    updateSettings({ licenza: { ...(impostazioni?.licenza || {}), moduli } }).catch((e) =>
      setError(e.message)
    )
  }
  useEffect(() => {
    return subscribeActiveOrders((orders) => {
      setPending(orders.filter((o) => o.payment_status === 'in_attesa'))
      // Candidati alla simulazione del lettore: non pagati, in mano al
      // cliente (pronto/ritirato), senza pagamento già in corso.
      setUnpaid(
        orders.filter(
          (o) =>
            o.payment_status !== 'pagato' &&
            o.payment_status !== 'in_attesa' &&
            ['pronto', 'ritirato'].includes(o.status)
        )
      )
    })
  }, [])

  function pushLog(msg) {
    setLog((l) => [...l, msg])
  }

  async function run(action) {
    setBusy(true)
    setError(null)
    setLog([])
    try {
      await action(pushLog)
      // Lo svuotamento del db lascia appesi i listener realtime della
      // pagina: ricarica per ripartire da uno stato pulito.
      pushLog('✓ Operazione completata. Ricarico la pagina…')
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="banner">
        🛠 Strumenti di sviluppo — visibili solo in ambiente di sviluppo
        (emulatore locale) e di test, mai in produzione.
      </div>

      {error && <div className="banner">Errore: {error}</div>}

      {/* LA STAMPANTE FINTA SUL SITO DI TEST. In locale è accesa da sé;
          qui l'ambiente è quello vero e senza la Epson ogni prova di
          stampa fallirebbe in silenzio. L'interruttore è DEL TERMINALE
          (localStorage): chi prova da casa accende, il tablet del banco
          non ne sa niente. */}
      <div className="card settings-section">
        <strong>🖨 Stampante simulata</strong>
        <p className="muted small" style={{ margin: '4px 0 8px' }}>
          Le stampe escono come facsimile a schermo invece che sulla
          stampante vera. Vale solo per questo dispositivo.
        </p>
        <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={fintaAccesa}
            onChange={(e) => {
              forzaStampanteFinta(e.target.checked ? true : null)
              setFintaAccesa(stampanteFintaAttiva())
            }}
          />
          <span>Simula la stampa su questo dispositivo</span>
        </label>

        {/* IL GUASTO FINTO (BUG-098). La catena della diagnostica —
            risposta di errore, registro, avviso a schermo — fino a qui si
            provava solo al banco, con la carta finita in mano: ed è
            esattamente per questo che il difetto della chiusura di cassa è
            sopravvissuto tanto. Vale solo per la stampante SIMULATA,
            quindi in produzione non ha nemmeno un caso in cui accendersi. */}
        {fintaAccesa && (
          <div style={{ marginTop: 10 }}>
            <label htmlFor="dev-guasto">Guasto simulato</label>
            <select
              id="dev-guasto"
              value={guasto}
              onChange={(e) => {
                impostaGuastoFinto(e.target.value || null)
                setGuasto(e.target.value)
              }}
            >
              <option value="">Nessuno — la stampa riesce</option>
              <option value="carta">Carta finita — la stampante risponde in errore</option>
              <option value="muta">Nessuna risposta — la carta esce, l&apos;esito no</option>
            </select>
            <p className="muted small" style={{ margin: '4px 0 0' }}>
              Serve a provare cosa succede quando una stampa non riesce. La stampa
              parte comunque senza attese: l&apos;esito arriva dopo e si legge in{' '}
              <strong>Impostazioni → Stampante → Registro delle stampe</strong>.
            </p>
          </div>
        )}
      </div>

      {/* QUI SI FA LA LICENZA, e solo qui: nelle impostazioni normali si
          accende e si spegne quello che il locale HA, non si decide cosa
          ha (lib/licenza.js). Serve a provare i moduli — hanno i loro test
          e c'è l'ambiente di test — senza inventare un meccanismo di
          vendita che ancora non esiste.
          DUE INTERRUTTORI PER MODULO, che sono due domande diverse:
          «inclusa» scrive `licenza.moduli` su settings/bar, cioè la stessa
          forma che avrà il documento della licenza della Fase 3 — questa
          è la sua prova generale; «accesa» scrive il flag d'uso, quello
          che si tocca anche dalle impostazioni normali.
          L'altra strada, equivalente, è scrivere quei campi a mano dalla
          console Firestore o dall'emulatore.
          SPEGNERE NASCONDE, NON CANCELLA: conte e fatture già scritte
          restano dove sono e tornano quando il modulo si riaccende. */}
      <div className="card settings-section">
        <h3>Funzioni premium</h3>
        <p className="muted small" style={{ margin: '4px 0 8px' }}>
          Valgono per tutto il locale, non per questo dispositivo. Un modulo
          lavora solo se è incluso <em>e</em> acceso.
        </p>
        {moduliPremium().map((m) => (
          <div key={m.id}>
            <ToggleRow
              label={`${m.label} — inclusa nella licenza`}
              desc={`settings/bar · licenza.moduli.${m.id}`}
              checked={moduloIncluso(impostazioni, m.id)}
              onChange={(v) => scriviInclusione(m.id, v)}
            />
            <ToggleRow
              label={`${m.label} — accesa`}
              desc={`settings/bar · ${chiaveModulo(m.id)}`}
              checked={moduloAcceso(impostazioni, m.id)}
              onChange={(v) =>
                updateSettings({ [chiaveModulo(m.id)]: v }).catch((e) => setError(e.message))
              }
            />
          </div>
        ))}
      </div>

      {/* Azioni distruttive sul database: solo emulatore locale (usano un
          endpoint che sul progetto reale di test non esiste). */}
      {isDevEnvironment && (
      <div className="card settings-section">
        <h3>Database</h3>
        <div className="toggle-row">
          <div>
            <div>Reset con dati mock</div>
            <div className="desc">
              Svuota tutto e ripopola: menù completo con immagini, inventario,
              impostazioni e 12 ordini di esempio di oggi.
            </div>
          </div>
          <button
            className="btn small"
            disabled={busy}
            onClick={() =>
              setConfirm({
                title: '🔄 Reset con dati mock?',
                message:
                  'Tutti i dati attuali verranno cancellati e sostituiti con i dati di esempio.',
                run: () => run(resetWithMockData),
              })
            }
          >
            {busy ? '…' : 'Reset'}
          </button>
        </div>
        <div className="toggle-row">
          <div>
            <div>Genera storico giornate</div>
            <div className="desc">
              Aggiunge 12 giornate passate con ordini, incassi e tempi
              realistici: alimenta la sezione Statistiche.
            </div>
          </div>
          <button
            className="btn small"
            disabled={busy}
            onClick={() =>
              setConfirm({
                title: '📊 Generare lo storico?',
                message: 'Verranno aggiunte 12 giornate passate con ordini mock (i dati esistenti restano).',
                run: () =>
                  run(async (progress) => {
                    const n = await createMockHistory(progress)
                    progress(`Storico creato: ${n} giornate.`)
                  }),
              })
            }
          >
            Genera
          </button>
        </div>
        <div className="toggle-row">
          <div>
            <div>Svuota database</div>
            <div className="desc">
              Cancella tutti i dati (menù, inventario, ordini,
              impostazioni). L&apos;utente bartender resta.
            </div>
          </div>
          <button
            className="btn ghost small"
            disabled={busy}
            onClick={() =>
              setConfirm({
                title: '🧹 Svuotare il database?',
                message: 'Tutti i dati verranno cancellati. Operazione irreversibile.',
                danger: true,
                run: () =>
                  run(async (progress) => {
                    progress('Svuoto il database…')
                    await clearDatabase()
                  }),
              })
            }
          >
            Svuota
          </button>
        </div>
      </div>
      )}

      <div className="card settings-section">
        <h3>📥 Import storico da Excel (JSON)</h3>
        <p className="muted small">
          Carica il file <code>import-tana.json</code> (estratto dagli Excel:
          fornitori, scadenzario, catalogo inventario, ore staff). Idempotente:
          ciò che esiste già viene saltato, si può rilanciare.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setBusy(true)
            setError(null)
            try {
              const data = JSON.parse(await file.text())
              await runImport(data, (msg) => setLog((l) => [...l.slice(-30), msg]))
            } catch (err) {
              setError(err.message)
            } finally {
              setBusy(false)
            }
          }}
        />

        <h3 style={{ marginTop: 18 }}>Pagamenti (simulazione)</h3>
        <p className="muted small" style={{ marginTop: 0 }}>
          Simula qui l&apos;esito del pagamento SumUp per gli ordini in
          attesa (utile finché SumUp non è configurato con le credenziali
          sandbox).
        </p>
        {pending.length === 0 && (
          <div className="muted small">Nessun ordine con pagamento in attesa.</div>
        )}
        {pending.map((o) => (
          <div className="toggle-row" key={o.id}>
            <div>
              <div>#{o.daily_number} {o.customer_name || ''}</div>
              <div className="desc">
                {o.payment_method} · {o.status} · {o.payment_required ? 'obbligatorio' : 'opzionale'}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button
                className="btn small"
                onClick={() => simulatePaymentResult(o.id, true).catch((e) => setError(e.message))}
              >
                ✓ Pagato
              </button>
              <button
                className="btn ghost small"
                onClick={() => simulatePaymentResult(o.id, false).catch((e) => setError(e.message))}
              >
                ✗ Fallito
              </button>
            </div>
          </div>
        ))}

        {unpaid.length > 0 && (
          <>
            <p className="muted small" style={{ margin: '12px 0 4px' }}>
              📟 Simulazione lettore (ordini non pagati pronti/ritirati):
            </p>
            {unpaid.map((o) => (
              <div className="toggle-row" key={o.id}>
                <div>
                  <div>#{o.daily_number} {o.customer_name || ''}</div>
                  <div className="desc">{o.status}</div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    className="btn small"
                    onClick={() => simulateReaderPayment(o.id, true).catch((e) => setError(e.message))}
                  >
                    📟 ✓ Carta OK
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => simulateReaderPayment(o.id, false).catch((e) => setError(e.message))}
                  >
                    ✗ Rifiutata
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {log.length > 0 && (
        <div className="card">
          {log.map((l, i) => (
            <div key={i} className="muted small" style={{ padding: '2px 0' }}>
              {l}
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Procedi"
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const { run: fn } = confirm
            setConfirm(null)
            fn()
          }}
        />
      )}
    </div>
  )
}
