import { useRef, useState } from 'react'
import {
  CAMPI,
  CHIAVE_IMPOSTAZIONE,
  CHIAVE_LOGO,
  LARGHEZZA_LOGO,
  TIPI_LOGO,
  configStampa,
  immagineCaricata,
  logoAcceso,
  problemiLogo,
  quotaScura,
} from '../lib/campiStampa.js'
import { printAnteprima } from '../lib/printer.js'
import { isAdmin } from '../lib/ruoli.js'

// ── COSA C'È SULLO SCONTRINO, E COSA C'È SULLA COMANDA ───────────────
//
// Il vocabolario dei campi sta in lib/campiStampa.js; qui c'è solo il
// pannello che lo mostra. Interruttore per campo, e dove il campo è puro
// testo la casella per cambiarlo. Niente campi liberi: si sceglie fra
// quelli che una stampa ha, non se ne inventano di nuovi.

const TITOLI = {
  scontrino: 'Cosa c’è sullo scontrino',
  comanda: 'Cosa c’è sulla comanda',
  acconto: 'Cosa c’è sullo scontrino d’acconto',
}

const SPIEGAZIONI = {
  scontrino:
    'La lista dei prodotti e il totale ci sono sempre: sono lo scontrino, e per questo non stanno qui. Tutto il resto lo scegli tu.',
  comanda:
    'La lista dei prodotti c’è sempre: è la comanda. Il resto è quello che aiuta il banco a leggerla in mezzo secondo — o carta sprecata, se non serve.',
  acconto:
    'La scritta ACCONTO, quello che è stato pagato, l’importo versato e la riga che dice che il conto resta aperto ci sono sempre: sono quello che impedisce di scambiarlo per lo scontrino finale. Tutto il resto lo scegli tu.',
}

export default function CampiStampa({ quale, settings, onSave }) {
  const [stampando, setStampando] = useState(false)
  const [esito, setEsito] = useState(null)
  const cfg = configStampa(settings, quale)
  const campi = CAMPI[quale] || []
  const chiave = CHIAVE_IMPOSTAZIONE[quale]

  // Si scrive SEMPRE l'oggetto intero: il salvataggio è ottimistico e
  // rimpiazza la voce in pagina: mandandone metà, l'altra metà sparirebbe
  // sotto gli occhi di chi sta scegliendo.
  const salva = (parte, id, valore) => {
    const attuale = settings?.[chiave] || {}
    onSave({
      [chiave]: {
        ...attuale,
        [parte]: { ...(attuale[parte] || {}), [id]: valore },
      },
    })
  }

  async function prova() {
    setStampando(true)
    setEsito(null)
    try {
      await printAnteprima(quale)
      setEsito({ ok: true, testo: 'Prova inviata alla stampante.' })
    } catch (e) {
      setEsito({ ok: false, testo: e.message })
    } finally {
      setStampando(false)
    }
  }

  return (
    <div className="card settings-section">
      <h3>{TITOLI[quale]}</h3>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>
        {SPIEGAZIONI[quale]}
      </p>

      {campi.map((campo) => {
        const acceso = cfg.mostra(campo.id)
        return (
          <div key={campo.id} style={{ marginBottom: 4 }}>
            <div className="toggle-row">
              <div>
                <div>{campo.label}</div>
                {campo.desc && <div className="desc">{campo.desc}</div>}
              </div>
              <input
                type="checkbox"
                className="toggle"
                aria-label={campo.label}
                checked={acceso}
                onChange={(e) => salva('campi', campo.id, e.target.checked)}
              />
            </div>
            {/* La casella del testo compare solo col campo acceso: a
                interruttore spento non c'è niente da scrivere, e una
                casella che non serve fa perdere tempo a chi scorre. */}
            {campo.testo && acceso && (
              <div style={{ padding: '0 0 10px 12px' }}>
                <label htmlFor={`testo-${quale}-${campo.id}`}>{campo.testo.label}</label>
                <input
                  id={`testo-${quale}-${campo.id}`}
                  type="text"
                  maxLength={40}
                  placeholder={campo.testo.placeholder || campo.testo.valore}
                  value={cfg.testo(campo.id)}
                  onChange={(e) => salva('testi', campo.id, e.target.value)}
                />
              </div>
            )}
          </div>
        )
      })}

      <button
        type="button"
        className="btn secondary"
        style={{ marginTop: 12 }}
        onClick={prova}
        disabled={stampando}
      >
        {stampando ? 'Stampo…' : '🖨 Prova di stampa'}
      </button>
      <p className="muted" style={{ fontSize: '0.8rem', margin: '6px 0 0' }}>
        Stampa un {quale === 'comanda' ? 'ticket' : 'conto'} finto con i campi che hai scelto.
      </p>
      {esito && (
        <div className={esito.ok ? 'muted' : 'banner'} style={{ marginTop: 8, fontSize: '0.9rem' }}>
          {esito.ok ? `✓ ${esito.testo}` : esito.testo}
        </div>
      )}
    </div>
  )
}

// ── IL LOGO: SU QUALI STAMPE, E QUALE (REQ-STAMPA-011) ───────────────
//
// «Su quali stampe» lo può cambiare chi gestisce; l'IMMAGINE la cambia
// solo l'admin — è l'identità del locale, non una preferenza del
// terminale, e chi la sbaglia la sbaglia per tutti.
export function LogoStampe({ settings, onSave, role = null }) {
  const [problema, setProblema] = useState(null)
  const [lavorando, setLavorando] = useState(false)
  const fileRef = useRef(null)
  const immagine = immagineCaricata(settings)
  const puoCambiarla = isAdmin(role)

  const salva = (patch) => {
    onSave({ [CHIAVE_LOGO]: { ...(settings?.[CHIAVE_LOGO] || {}), ...patch } })
  }

  // ── SI DICE SUBITO, NON SULLA CARTA ────────────────────────────────
  //
  // L'immagine si riduce QUI, alla larghezza che vuole la testina, e si
  // guarda com'è venuta: una foto scura diventa un rettangolo nero in
  // cima a ogni scontrino della serata, e al banco nessuno capirebbe
  // perché. Se non va, non si salva e si dice cosa c'è che non va.
  async function scegliImmagine(e) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setProblema(null)
    setLavorando(true)
    try {
      const sorgente = await leggiFile(file)
      const img = await caricaImmagine(sorgente)
      const altezza = Math.round((img.height / img.width) * LARGHEZZA_LOGO)
      const canvas = document.createElement('canvas')
      canvas.width = LARGHEZZA_LOGO
      canvas.height = altezza
      const ctx = canvas.getContext('2d')
      // Fondo bianco: la carta è bianca, e un PNG trasparente
      // diventerebbe una macchia nera.
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, LARGHEZZA_LOGO, altezza)
      ctx.drawImage(img, 0, 0, LARGHEZZA_LOGO, altezza)
      const ridotta = canvas.toDataURL('image/png')
      const dati = ctx.getImageData(0, 0, LARGHEZZA_LOGO, altezza)?.data
      const guaio = problemiLogo({
        larghezza: img.width,
        altezza: img.height,
        quotaScura: quotaScura(dati),
        peso: ridotta.length,
      })
      if (guaio) {
        setProblema(guaio)
        if (guaio.grave) return
      }
      salva({ immagine: ridotta })
    } catch {
      setProblema({
        grave: true,
        testo: 'Questa immagine non si riesce ad aprire. Prova con un PNG o un JPG.',
      })
    } finally {
      setLavorando(false)
    }
  }

  return (
    <div className="card settings-section">
      <h3>Logo sulle stampe</h3>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>
        Il logo si stampa in bianco e nero, largo poco meno di metà carta.
        Scegli su quali stampe farlo uscire: di solito su quelle che restano
        al cliente.
      </p>

      {TIPI_LOGO.map((tipo) => (
        <div className="toggle-row" key={tipo.id}>
          <div>
            <div>{tipo.label}</div>
            {tipo.desc && <div className="desc">{tipo.desc}</div>}
          </div>
          <input
            type="checkbox"
            className="toggle"
            aria-label={tipo.label}
            checked={logoAcceso(settings, tipo.id)}
            onChange={(e) => salva({ [tipo.id]: e.target.checked })}
          />
        </div>
      ))}

      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 6 }}>L’immagine</div>
        <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Il fondo bianco è quello della carta: su un tema scuro un
              logo nero su trasparente sembrerebbe sparito. */}
          <img
            src={immagine || `${import.meta.env.BASE_URL || '/'}logo.png`}
            alt="Il logo come esce dalla stampante"
            style={{
              width: 110,
              background: '#fff',
              padding: 6,
              borderRadius: 6,
              objectFit: 'contain',
            }}
          />
          <div style={{ flex: '1 1 200px' }}>
            <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 8px' }}>
              {immagine
                ? 'Questa è l’immagine caricata dal locale.'
                : 'Questo è il logo di serie: caricane uno per cambiarlo.'}
            </p>
            {puoCambiarla ? (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <input
                  ref={fileRef}
                  id="logo-file"
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={scegliImmagine}
                />
                <button
                  type="button"
                  className="btn secondary small"
                  disabled={lavorando}
                  onClick={() => fileRef.current?.click()}
                >
                  {lavorando ? 'Guardo l’immagine…' : '🖼 Carica un’immagine'}
                </button>
                {immagine && (
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      setProblema(null)
                      salva({ immagine: null })
                    }}
                  >
                    Torna a quello di serie
                  </button>
                )}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                L’immagine la cambia chi ha l’accesso da amministratore.
              </p>
            )}
          </div>
        </div>

        {problema && (
          <div
            className={problema.grave ? 'banner' : 'muted'}
            style={{ marginTop: 10, fontSize: '0.9rem' }}
          >
            {problema.grave ? '⚠️ ' : ''}
            {problema.testo}
            {problema.grave && ' Il logo è rimasto quello di prima.'}
          </div>
        )}
      </div>
    </div>
  )
}

// Il file scelto, come indirizzo che un <img> sa aprire.
function leggiFile(file) {
  return new Promise((ok, ko) => {
    const lettore = new FileReader()
    lettore.onload = () => ok(String(lettore.result))
    lettore.onerror = ko
    lettore.readAsDataURL(file)
  })
}

function caricaImmagine(src) {
  return new Promise((ok, ko) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = ko
    img.src = src
  })
}
