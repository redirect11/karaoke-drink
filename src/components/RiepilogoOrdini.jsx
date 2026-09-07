import { useState } from 'react'
import { formatPrice } from '../lib/orderStatus.js'

// ── IL RIEPILOGO, FORNITORE PER FORNITORE (REQ-MAG-037) ──────────────
//
// «La creazione dell'ordine deve portarmi a una schermata di RIEPILOGO dove
// avrò una serie di tabelle in base all'ordine che voglio fare ai vari
// fornitori. Le tabelle saranno A SCOMPARSA, una sotto l'altra: se clicco
// sul nome di un fornitore mi si apre la tabella dei prodotti selezionati
// per quel fornitore, che io posso revisionare, e PER SINGOLO FORNITORE
// posso creare l'ordine. Se confermo l'ordine per quel fornitore, sulla riga
// relativa al fornitore vedrò il badge ORDINATO» (utente, 27/08/2026).
//
// UN ORDINE PER FORNITORE: ogni riga qui dentro diventa un documento suo,
// col suo stato e la sua fattura. Confermare non è una cosa sola per tutti —
// i fornitori si chiamano in momenti diversi, e uno può restare in sospeso
// mentre gli altri sono già partiti.
//
// SI VEDONO SOLO I FORNITORI DA CUI SI STA ORDINANDO DAVVERO: la lista
// arriva già così da `ordiniDaCreare`, che scarta chi non ha righe.
//
// La conferma non aspetta la rete: l'ordine si compone in memoria e il badge
// compare nell'istante del gesto (`createPurchaseOrder` in api.js).
export default function RiepilogoOrdini({
  fette = [],
  confermati = {},
  onConferma,
  onTogli,
  onIndietro,
}) {
  // Una tabella aperta per volta, come nella lista del magazzino: due
  // tabelle aperte su un tablet vogliono dire scorrere per ritrovare il
  // fornitore che si stava guardando.
  const [aperta, setAperta] = useState(fette.length === 1 ? fette[0].chiave : null)
  const quanti = fette.filter((f) => !confermati[f.chiave]).length

  return (
    <div className="card ordine-riepilogo">
      <div className="row between" style={{ alignItems: 'center', gap: 8 }}>
        <strong>Riepilogo dell’ordine</strong>
        <button type="button" className="btn ghost small" onClick={onIndietro}>
          ← Torna alla composizione
        </button>
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>
        Si crea un ordine per ogni fornitore. Tocca il nome per rivedere i
        prodotti scelti per lui, poi conferma quel fornitore: i suoi prodotti
        passano <strong>in assortimento</strong> finché la merce non arriva.
        Una <strong>bozza</strong> si salva e basta: si riprende dalla Lista
        ordini e non tocca il magazzino.
      </p>

      {fette.length === 0 ? (
        <p className="muted small">Non è rimasto niente da ordinare.</p>
      ) : (
        <>
          <div className="inv-list">
            {fette.map((f) => (
              <FornitoreDaConfermare
                key={f.chiave}
                fetta={f}
                ordine={confermati[f.chiave] || null}
                aperta={aperta === f.chiave}
                onApri={() => setAperta(aperta === f.chiave ? null : f.chiave)}
                onConferma={(opzioni) => onConferma?.(f, opzioni)}
                onTogli={onTogli}
              />
            ))}
          </div>
          <p className="muted small ordine-conta">
            {quanti === 0
              ? 'Tutti i fornitori sono stati ordinati.'
              : quanti === 1
                ? 'Resta 1 fornitore da confermare.'
                : `Restano ${quanti} fornitori da confermare.`}
          </p>
        </>
      )}
    </div>
  )
}

function FornitoreDaConfermare({ fetta, ordine, aperta, onApri, onConferma, onTogli }) {
  const nome = fetta.supplier_name || 'Senza fornitore'
  const ordinato = !!ordine
  return (
    <div
      className={`inv-row${aperta ? ' open' : ''}`}
      style={{ borderLeftColor: fetta.colore || undefined }}
    >
      <div className="inv-row-main riepilogo-testa">
        {/* Si tocca il NOME per aprire, ed è il bersaglio grande: la riga di
            un fornitore si prende con le mani occupate. */}
        <button
          type="button"
          className="btn ghost grow riepilogo-nome"
          aria-expanded={aperta}
          aria-label={`I prodotti di ${nome}`}
          onClick={onApri}
        >
          <span className="inv-row-name">{nome}</span>
          <span className="muted small">
            {fetta.righe.length === 1 ? '1 prodotto' : `${fetta.righe.length} prodotti`} ·{' '}
            {fetta.totali.pieces} pezzi
          </span>
        </button>
        <span className="muted small">
          {formatPrice(fetta.totali.gross)} <span className="muted small">+IVA</span>
        </span>
        {ordinato ? (
          <span className={`pill small ${ordine.bozza ? '' : 'ordinato'}`}>
            {ordine.bozza ? 'In bozza' : 'Ordinato'}
          </span>
        ) : (
          <span className="row" style={{ gap: 4 }}>
            {/* LA BOZZA (REQ-MAG-038): «Flavio può riprendere la creazione
                dell'ordine in un altro momento e confermarlo quando
                effettivamente gli serve». Comporre venti righe è un lavoro
                che si interrompe — arriva gente, si apre il locale — e senza
                bozza si ricomincia da capo oppure si conferma un ordine solo
                per non perderlo, che è peggio. */}
            <button
              type="button"
              className="btn ghost small"
              title="Salva senza mandarlo: non tocca il magazzino"
              onClick={() => onConferma?.({ bozza: true })}
            >
              Salva in bozza
            </button>
            <button type="button" className="btn small" onClick={() => onConferma?.()}>
              Crea l’ordine
            </button>
          </span>
        )}
      </div>

      {aperta && (
        <div className="inv-row-dettaglio">
          <div className="inv-list inv-table riepilogo-tabella">
            <div className="inv-thead">
              <span className="inv-th">Prodotto</span>
              <span className="inv-th inv-cell-num">Pezzi</span>
              <span className="inv-th inv-cell-num">€/pz</span>
              <span className="inv-th inv-cell-num">Totale</span>
              <span aria-hidden />
            </div>
            {fetta.righe.map((r) => (
              <div className="inv-row" key={r.key}>
                <div className="inv-row-main">
                  <span className="inv-row-name">{r.item_name}</span>
                  {/* I PEZZI SONO I PEZZI, ANCHE ORDINANDO A COLLI
                      (REQ-MAG-040): due cartoni da 24 sono quarantotto
                      bottiglie, ed è quello che entra in magazzino. I colli
                      si leggono accanto, perché sono quelli che si chiedono
                      al fornitore e quelli scritti sulla sua bolla. */}
                  <span className="inv-cell-num muted">
                    {r.pezzi ?? r.qty}
                    {r.aCollo ? (
                      <span className="small ordine-collo">
                        {r.qty} × {r.perCollo}
                      </span>
                    ) : null}
                  </span>
                  <span className="inv-cell-num muted">{formatPrice(r.unit_cost)}</span>
                  <span className="inv-cell-num">{formatPrice(r.totale)}</span>
                  {/* Finché il fornitore non è confermato si può ancora
                      togliere: è quello che vuol dire «revisionare». Dopo
                      no — la riga è di un ordine mandato, e si toglie da
                      lì, dallo storico. */}
                  {ordinato ? (
                    <span aria-hidden />
                  ) : (
                    <button
                      type="button"
                      className="btn ghost small"
                      aria-label={`Togli ${r.item_name} dall’ordine di ${nome}`}
                      title="Togli dall’ordine"
                      onClick={() => onTogli?.(r)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
