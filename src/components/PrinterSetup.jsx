import { useState, useSyncExternalStore } from 'react'
import {
  loadPrinterSettings,
  savePrinterSettings,
  printTest,
  disconnectPrinter,
  DEFAULT_PRINTER_SETTINGS,
} from '../lib/printer.js'
import {
  ETICHETTA_ESITO,
  iscrivitiAlRegistro,
  statoRegistro,
  svuotaRegistro,
} from '../lib/registroStampe.js'
import { savePrinterConfig } from '../lib/api.js'

// Salva le impostazioni stampante sia in locale (uso immediato/offline) sia
// su server (così l'IP non si perde quando iPad/Safari svuota il localStorage).
//
// SOLO I CAMPI DI QUESTA SCHEDA. Prima si mandava il `form` intero, che è
// una fotografia scattata all'apertura del pannello: da quando la stampa
// automatica si accende altrove (REQ-UI-025), salvare qui avrebbe rimesso
// al loro posto i valori di mezz'ora fa — l'interruttore acceso al banco si
// sarebbe spento da solo perché qualcuno ha corretto l'indirizzo IP.
const CAMPI = [
  'ip',
  'port',
  'https',
  'businessName',
  'businessAddress',
  'businessCity',
  'businessFooter',
]
function persistPrinter(form) {
  const patch = Object.fromEntries(CAMPI.map((k) => [k, form[k]]))
  savePrinterSettings(patch)
  savePrinterConfig(patch)
}

export default function PrinterSetup() {
  const [form, setForm] = useState(() => loadPrinterSettings())
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  function set(key) {
    return (e) => {
      const val = e.target.type === 'checkbox' ? e.target.checked
        : e.target.type === 'number' ? Number(e.target.value)
        : e.target.value
      // Porta e HTTPS devono restare d'accordo: la connessione la decide la
      // PORTA (8008 = in chiaro, 8043 = sicura), quindi spuntare HTTPS senza
      // cambiare porta non avrebbe alcun effetto — e non funzionerebbe.
      setForm((f) => {
        const next = { ...f, [key]: val }
        if (key === 'https') next.port = val ? 8043 : 8008
        // Campo vuoto durante la digitazione: non si tocca il flag.
        if (key === 'port' && e.target.value !== '') next.https = Number(val) !== 8008
        return next
      })
      setSaved(false)
      setTestResult(null)
    }
  }

  function handleSave(e) {
    e.preventDefault()
    persistPrinter(form)
    disconnectPrinter() // forza riconnessione con nuovi parametri
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleTest() {
    persistPrinter(form)
    disconnectPrinter()
    setTesting(true)
    setTestResult(null)
    try {
      await printTest()
      setTestResult({ ok: true, msg: 'Stampa test inviata.' })
    } catch (e) {
      setTestResult({ ok: false, msg: e.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <form className="card" onSubmit={handleSave}>
      <h3 style={{ marginTop: 0 }}>Stampante termica Epson</h3>

      {/* ── Istruzioni connessione HTTPS ── */}
      <details style={{ marginBottom: 16 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: '0.9rem' }}>
          Come configurare (prima volta)
        </summary>
        <ol style={{ fontSize: '0.85rem', lineHeight: 1.7, paddingLeft: 18, marginTop: 8 }}>
          <li>Collega la stampante alla stessa rete Wi-Fi dell'iPad.</li>
          <li>Assegna un IP fisso alla stampante dal router (DHCP reservation).</li>
          <li>Apri <code>http://&lt;IP stampante&gt;</code> nel browser e abilita SSL/TLS
            dalle impostazioni di rete.</li>
          <li>Vai su <code>https://&lt;IP stampante&gt;:8043</code> in Safari e accetta
            il certificato (solo la prima volta).</li>
          <li>Inserisci l'IP qui sotto e premi "Test stampa".</li>
        </ol>
      </details>

      {/* ── Connessione ── */}
      <fieldset style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <legend className="muted" style={{ fontSize: '0.85rem', padding: '0 6px' }}>Connessione</legend>

        <label htmlFor="prn-ip">IP stampante</label>
        <input
          id="prn-ip"
          type="text"
          inputMode="decimal"
          placeholder="es. 192.168.1.100"
          value={form.ip}
          onChange={set('ip')}
        />

        <div className="grid-2" style={{ marginTop: 10 }}>
          <div>
            <label htmlFor="prn-port">Porta</label>
            <input
              id="prn-port"
              type="number"
              value={form.port}
              onChange={set('port')}
              min={1}
              max={65535}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
            <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.https}
                onChange={set('https')}
              />
              <span>HTTPS (WSS)</span>
            </label>
          </div>
        </div>
        <p className="muted" style={{ fontSize: '0.8rem', margin: '6px 0 0' }}>
          È la <strong>porta</strong> a decidere: <strong>8043</strong> = connessione
          sicura (obbligatoria con l'app in HTTPS), 8008 = in chiaro.
        </p>
        {typeof location !== 'undefined' &&
          location.protocol === 'https:' &&
          Number(form.port) === 8008 && (
            <div className="banner" style={{ marginTop: 8 }}>
              ⚠️ L'app è in HTTPS: con la porta <strong>8008</strong> il browser
              blocca la connessione e la stampa va in timeout. Usa la{' '}
              <strong>8043</strong> con SSL/TLS abilitato sulla stampante.
            </div>
          )}
      </fieldset>

      {/* LA STAMPA AUTOMATICA NON È PIÙ QUI (REQ-UI-025). «Le impostazioni
          di stampa automatica riguardano la cassa» (l'utente, 22/08/2026):
          qui c'è la MACCHINA — indirizzo, prova di stampa, i dati che
          finiscono sulla carta — mentre QUANDO la carta esce da sé è una
          faccenda dell'incasso, e sta con la cassa insieme a tutte le
          altre della sua famiglia. */}
      <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 12px' }}>
        Quando la comanda e lo scontrino escono <strong>da soli</strong> — e chi
        stampa le comande prese in sala — si decide in{' '}
        <strong>Impostazioni → Cassa e giornata → Stampa automatica</strong>.
      </p>

      {/* ── I dati del locale che finiscono sulla carta ── */}
      {/* Si chiamava «Scontrino», ma queste righe escono anche sulla
          chiusura di cassa e sulla fattura di cortesia — e da quando i
          CAMPI si scelgono nel riquadro qui sotto, due posti che si
          chiamano allo stesso modo erano un modo per cercare nel posto
          sbagliato. Qui ci sono le PAROLE; là si sceglie se stamparle. */}
      <fieldset style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <legend className="muted" style={{ fontSize: '0.85rem', padding: '0 6px' }}>Dati del locale</legend>

        {/* L'ALIQUOTA IVA NON È PIÙ QUI (BUG-084). Ce n'erano due — una in
            questa scheda, nel browser di ogni terminale, e una sulle
            impostazioni del bar — e due tablet potevano stampare scontrini
            con aliquote diverse. Un'aliquota è un fatto del LOCALE: si
            imposta una volta, in Impostazioni → Prezzi e supplementi. */}
        <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 10px' }}>
          L’<strong>aliquota IVA</strong> dello scontrino è quella del locale:
          si imposta in <strong>Impostazioni → Prezzi e supplementi</strong>,
          ed è la stessa che usano margini e statistiche.
        </p>

        <label htmlFor="prn-biz">Nome locale</label>
        <input id="prn-biz" value={form.businessName} onChange={set('businessName')} />

        <label htmlFor="prn-addr" style={{ marginTop: 10 }}>Indirizzo</label>
        <input id="prn-addr" value={form.businessAddress} onChange={set('businessAddress')} />

        <label htmlFor="prn-city" style={{ marginTop: 10 }}>Città / CAP</label>
        <input id="prn-city" value={form.businessCity} onChange={set('businessCity')} />

        <label htmlFor="prn-foot" style={{ marginTop: 10 }}>Footer (ragione sociale)</label>
        <input id="prn-foot" value={form.businessFooter} onChange={set('businessFooter')} />
      </fieldset>

      <RegistroStampe />

      {testResult && (
        <div
          className={testResult.ok ? '' : 'banner'}
          style={testResult.ok
            ? { color: 'var(--green, #4caf50)', marginBottom: 10, fontSize: '0.9rem' }
            : { marginBottom: 10 }
          }
        >
          {testResult.ok ? '✓ ' : ''}{testResult.msg}
          {/* Timeout = quasi sempre certificato della stampante non ancora
              accettato su questo dispositivo: il link ci porta direttamente. */}
          {!testResult.ok && form.ip && (
            <div style={{ marginTop: 8, fontSize: '0.85rem' }}>
              Sul <strong>questo</strong> dispositivo apri una volta{' '}
              <a
                href={`https://${form.ip}:${form.port || 8043}`}
                target="_blank"
                rel="noreferrer"
              >
                https://{form.ip}:{form.port || 8043}
              </a>{' '}
              e accetta il certificato (“Avanzate → Procedi”), poi torna qui e
              ripremi <strong>Test stampa</strong>. Verifica anche che la
              stampante sia accesa, sulla <strong>stessa rete Wi-Fi</strong> e
              con SSL/TLS abilitato.
            </div>
          )}
        </div>
      )}

      <div className="grid-2">
        <button
          type="button"
          className="btn secondary"
          onClick={handleTest}
          disabled={testing || !form.ip}
        >
          {testing ? 'Test…' : '🖨 Test stampa'}
        </button>
        <button type="submit" className="btn">
          {saved ? '✓ Salvato' : 'Salva'}
        </button>
      </div>
    </form>
  )
}

// ── IL REGISTRO DELLE STAMPE (REQ-STAMPA-017, BUG-098) ───────────────
//
// «Quando fanno la chiusura cassa, la stampante non stampa lo scontrino di
// chiusura molto spesso» (Flavio, 28/08/2026) — e nessun avviso, nessuna
// traccia. La cassa si chiude una volta a notte: senza un posto dove
// leggere com'è andata, un difetto così si insegue per settimane.
//
// Sta QUI perché qui c'è la MACCHINA — indirizzo, prova di stampa, i dati
// che finiscono sulla carta — ed è il posto dove si va quando la stampante
// fa i capricci.
function RegistroStampe() {
  // `useSyncExternalStore` e non un `useEffect`: la coda cambia mentre la
  // carta esce, e questa lista si deve muovere con lei senza un giro di
  // stato in mezzo. L'istantanea è la stessa finché niente cambia (vedi
  // registroStampe.js), se no sarebbe un ridisegno all'infinito.
  const stato = useSyncExternalStore(iscrivitiAlRegistro, statoRegistro, statoRegistro)
  const { inCorso, inAttesa, voci } = stato

  const ora = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }
  const giorno = (iso) => {
    try {
      return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
    } catch {
      return ''
    }
  }
  // Il puntino della voce appena mandata: la risposta della stampante
  // arriva dopo, e finché non arriva l'esito è sospeso — non riuscito e
  // nemmeno fallito.
  const segno = { inviata: '·', riuscita: '✓', fallita: '✕' }

  return (
    <fieldset
      style={{
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <legend className="muted" style={{ fontSize: '0.85rem', padding: '0 6px' }}>
        Registro delle stampe
      </legend>

      <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 10px' }}>
        Le ultime stampe di questo dispositivo e come sono andate. Resta qui,
        non viene inviato da nessuna parte. Una voce «in attesa di risposta»
        vuol dire che la stampa è partita e la stampante non ha detto come è
        finita.
      </p>

      {/* LA CODA. La seconda domanda davanti a una stampante ferma è «si è
          impiantata?»: qui si legge cosa sta uscendo e quanto c'è dietro. */}
      <div className="row between" style={{ marginBottom: 10 }}>
        <span className="small">
          {inCorso ? `In stampa: ${inCorso.che}` : 'Nessuna stampa in corso'}
        </span>
        <span className="muted small">
          {inAttesa.length === 0
            ? 'Coda vuota'
            : `${inAttesa.length} in attesa`}
        </span>
      </div>

      {voci.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          Nessuna stampa registrata su questo dispositivo.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {voci.map((v) => (
            <li
              key={v.id}
              style={{
                borderTop: '1px dashed var(--line)',
                padding: '6px 0',
                fontSize: '0.85rem',
              }}
            >
              <div className="row between" style={{ gap: 8 }}>
                <span>
                  {segno[v.esito] || '?'} {v.che}
                </span>
                <span className="muted small">
                  {giorno(v.quando)} {ora(v.quando)}
                </span>
              </div>
              <div className="muted small">
                {ETICHETTA_ESITO[v.esito] || v.esito}
                {v.motivo ? ` — ${v.motivo}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}

      {voci.length > 0 && (
        <button
          type="button"
          className="btn ghost small"
          style={{ marginTop: 10 }}
          onClick={svuotaRegistro}
        >
          Svuota il registro
        </button>
      )}
    </fieldset>
  )
}
