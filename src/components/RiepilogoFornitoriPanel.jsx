import { useEffect, useMemo, useState } from 'react'
import {
  fetchSuppliers,
  fetchSupplierInvoices,
  fetchPurchaseOrders,
  fetchAltreSpese,
} from '../lib/api.js'
import { formatPrice } from '../lib/orderStatus.js'
import { riepilogoMesi, totaleRiepilogo, nomeMese } from '../lib/riepilogoFornitori.js'

// ── RIEPILOGO: I SOLDI CHE ESCONO, MESE PER MESE (REQ-MAG-034) ───────
//
// Quarta voce di Fornitori. Mette insieme i tre elenchi della sezione — la
// merce dalle fatture, le altre spese, e quanto resta aperto — in un totale
// per mese. Sta QUI e non in Bilancio per la ragione scritta nel requisito:
// i soldi che escono si guardano dove si registrano; Bilancio → Mesi leggerà
// questi numeri per il netto (REQ-CASSA-012).
//
// I conti stanno in `lib/riepilogoFornitori.js`, dove si provano senza
// Firebase: qui c'è solo come si leggono.
//
// GLI ORDINI SI LEGGONO TUTTI, senza limite. Prima erano cento, e la ragione
// scritta qui era giusta a metà: si guarda indietro di mesi, e una consegna
// senza fattura di marzo sparirebbe dal conto del suo mese senza dire niente.
// Ma centouno ordini fa sparire lo stesso, e un troncamento silenzioso su dei
// soldi è peggio di una lettura lenta: il numero sbagliato non si vede.

export default function RiepilogoFornitoriPanel() {
  const [fatture, setFatture] = useState([])
  const [spese, setSpese] = useState([])
  const [ordini, setOrdini] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const [invs, sps, ords, sups] = await Promise.all([
          fetchSupplierInvoices({ limit: 500 }),
          fetchAltreSpese({ limit: 500 }),
          // I due elenchi di contorno non devono far cadere la pagina: il
          // riepilogo con una colonna in meno vale più di una schermata
          // vuota.
          fetchPurchaseOrders().catch(() => []),
          fetchSuppliers().catch(() => []),
        ])
        if (!vivo) return
        setFatture(invs)
        setSpese(sps)
        setOrdini(ords)
        setSuppliers(sups)
      } catch (e) {
        if (vivo) setError(e.message)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const righe = useMemo(
    () => riepilogoMesi({ fatture, spese, ordini, suppliers }),
    [fatture, spese, ordini, suppliers]
  )
  const totale = useMemo(() => totaleRiepilogo(righe), [righe])

  return (
    <div>
      {error && <div className="banner">Errore: {error}</div>}

      <div className="inv-summary">
        <span className="chip" style={{ cursor: 'default' }}>
          Merce <strong>{formatPrice(totale.merce)}</strong>
        </span>
        <span className="chip" style={{ cursor: 'default' }}>
          Altre spese <strong>{formatPrice(totale.altre)}</strong>
        </span>
        <span className="chip" style={{ cursor: 'default' }}>
          Totale <strong>{formatPrice(totale.totale)}</strong>
        </span>
      </div>

      {/* ⚠️ LA FRASE CHE EVITA IL PRIMO EQUIVOCO, e sta qui perché è qui che
          si confrontano i totali. Misurato sui fogli il 19/08: la riga
          «spese» del foglio mensile contiene ANCHE la merce (gen 2.380
          contro 1.809 di acquisti, giu 12.726 contro 8.673), quindi questi
          numeri sono più bassi dei suoi. Senza dirlo, al primo confronto
          sembra che l'app sbagli. */}
      <p className="muted small" style={{ margin: '0 4px 8px' }}>
        Qui c’è quello che è registrato nell’app: la merce dalle fatture dei
        fornitori, il resto dalle altre spese. Nel foglio mensile la riga
        «spese» comprende anche la merce, quindi questi totali sono più bassi:
        la merce si conta una volta sola, nella sua colonna.
      </p>

      <div className="inv-list">
        {righe.map((r) => (
          <div className="inv-item" key={r.mese}>
            <div className="inv-row" style={{ cursor: 'default' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="inv-name">{nomeMese(r.mese)}</div>
                <div className="muted small">
                  Merce {formatPrice(r.merce)} · Altre spese {formatPrice(r.altre)}
                </div>
              </div>
              <div className="inv-qty">
                <strong>{formatPrice(r.totale)}</strong>
              </div>
            </div>
            {/* QUANTO RESTA APERTO. Non si somma al totale, e non è una
                dimenticanza: «da pagare» è una fetta della merce già contata,
                «senza fattura» è merce arrivata di cui manca il documento —
                sommarla la conterebbe due volte il giorno che la fattura
                arriva. L'ambra dice lavoro che manca, non errore. */}
            {(r.daPagare > 0 || r.senzaFattura > 0) && (
              <div className="muted small" style={{ margin: '4px 4px 0' }}>
                {r.daPagare > 0 && <>Ancora da pagare {formatPrice(r.daPagare)}</>}
                {r.daPagare > 0 && r.senzaFattura > 0 && ' · '}
                {r.senzaFattura > 0 && (
                  <>Consegnato senza fattura {formatPrice(r.senzaFattura)} (netto)</>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {righe.length === 0 && <div className="empty">Nessun mese da riepilogare.</div>}

      {(totale.daPagare > 0 || totale.senzaFattura > 0) && (
        <p className="muted small" style={{ margin: '8px 4px 0' }}>
          Le due righe in fondo a ogni mese non entrano nel totale: quello che
          è ancora da pagare è già contato nella merce, e la merce consegnata
          senza fattura entrerà nel mese quando il documento arriva.
        </p>
      )}
    </div>
  )
}
