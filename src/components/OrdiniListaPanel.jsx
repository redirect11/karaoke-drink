import { useMemo, useState } from 'react'
import { fetteFornitore, livelloDi } from '../lib/listini.js'
import {
  ETICHETTA_STATO,
  FILTRI_ORDINE,
  contaFiltri,
  descriviMovimento,
  eBozza,
  ordineChiuso,
  ordineNelFiltro,
  ordinePagato,
  statoOrdineDi,
  storiaDi,
} from '../lib/statiOrdine.js'
import {
  ETICHETTA_PROBLEMA,
  fatturaConRighe,
  percheNonSiChiude,
  prezziDaAllineare,
  prospettoOrdine,
  scartiDiMerce,
  scartiDiPrezzo,
  totaliProspetto,
} from '../lib/confrontoOrdine.js'
import {
  DOC_NESSUNO,
  fattureCollegabili,
  fatturaGenerata,
  fetteSenzaFattura,
  importoLeggibile,
} from '../lib/fatture.js'
import { formatPrice } from '../lib/orderStatus.js'
import { giornoEOra } from '../lib/ore.js'

// ── LISTA ORDINI (REQ-MAG-038) ───────────────────────────────────────
//
// «Lo storico di tutti gli ordini fatti, filtrabile per STATO dell'ordine»
// (utente, 27/08/2026). Era in fondo alla schermata di composizione, sotto
// seicento righe di catalogo: per guardare un ordine di ieri bisognava
// scorrere tutto il magazzino.
//
// UNA PAROLA SOLA PER OGNI STATO. «Consegnato» e «ordine ricevuto» sono la
// stessa cosa — «è solo estetica, parole» — e qui si dice CONSEGNATO,
// sempre, come in tutte le altre schermate: due nomi per lo stesso stato
// fanno cercare a chi legge una differenza che non c'è.
//
// «PAGATO» NON STA SULL'ORDINE: si chiede alla sua fattura. Il chip accanto
// al badge lo dice, e toccarlo scrive `paid` sul documento — lo stesso campo
// che lo scadenzario mostra e su cui si fa il totale «Da pagare». Un secondo
// posto dove scriverlo vorrebbe dire due numeri che a fine mese non tornano.
//
// Le decisioni e i conti stanno in `statiOrdine.js` e `confrontoOrdine.js`,
// dove si provano senza Firebase: qui c'è solo come si vedono.
export default function OrdiniListaPanel({
  ordini = [],
  fatture = [],
  suppliers = [],
  bloccato = false,
  onConferma,
  onConsegna,
  onTogliRiga,
  onCollega,
  onGenera,
  onPagata,
  onAllinea,
  onChiudi,
  onElimina,
  onEmail,
  onCopia,
  onStampa,
  onSalvaModello,
}) {
  const [filtro, setFiltro] = useState('tutti')
  // Un ordine aperto per volta, come nella lista del magazzino: due dettagli
  // aperti su un tablet vogliono dire scorrere per ritrovare quello che si
  // stava guardando.
  const [aperto, setAperto] = useState(null)
  const [consegnaFor, setConsegnaFor] = useState(null)
  const [fatturaPer, setFatturaPer] = useState(null)

  const fatturaDi = useMemo(() => {
    const per = new Map()
    for (const f of fatture || []) if (f?.order_id) per.set(f.order_id, f)
    return (o) => per.get(o?.id) ?? null
  }, [fatture])

  const conta = useMemo(() => contaFiltri(ordini, fatturaDi), [ordini, fatturaDi])
  // IL PRIMO DEI DUE BUCHI (REQ-MAG-031): la merce è arrivata, il documento
  // no. Il numero sta in testa perché è la domanda che uno si fa a fine
  // mese, e scorrere venticinque ordini per contarle è il modo in cui non lo
  // si fa.
  const scoperte = useMemo(
    () => fetteSenzaFattura(ordini, fatture, { suppliers }),
    [ordini, fatture, suppliers]
  )
  const visibili = useMemo(
    () => (ordini || []).filter((o) => ordineNelFiltro(o, fatturaDi(o), filtro)),
    [ordini, fatturaDi, filtro]
  )

  if ((ordini || []).length === 0) {
    return (
      <div className="card">
        <strong>Lista ordini</strong>
        <p className="muted small" style={{ marginTop: 4 }}>
          Non è ancora stato fatto nessun ordine. Si compone da{' '}
          <strong>Nuovo ordine</strong>.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <strong>Lista ordini</strong>
      {scoperte.length > 0 && (
        <div className="muted small" style={{ marginTop: 2 }}>
          {scoperte.length === 1
            ? '1 consegna senza documento'
            : `${scoperte.length} consegne senza documento`}
        </div>
      )}
      {/* IL FILTRO PER STATO, col numero sul chip: «quanti me ne restano da
          pagare» è la domanda, e contarli scorrendo venticinque ordini è il
          modo in cui non ci si risponde. Le voci a zero restano, spente: un
          chip che sparisce fa dubitare di averlo visto. */}
      <div className="chips-row" style={{ marginTop: 8 }}>
        {FILTRI_ORDINE.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip ${filtro === f.id ? 'active' : ''}`}
            aria-pressed={filtro === f.id}
            onClick={() => setFiltro(f.id)}
          >
            {f.label} ({conta[f.id] ?? 0})
          </button>
        ))}
      </div>

      {visibili.length === 0 ? (
        <p className="muted small" style={{ marginTop: 10 }}>
          Nessun ordine in questo stato.
        </p>
      ) : (
        <div className="inv-list" style={{ marginTop: 8 }}>
          {visibili.map((o) => (
            <RigaOrdine
              key={o.id}
              ordine={o}
              fattura={fatturaDi(o)}
              fatture={fatture}
              suppliers={suppliers}
              bloccato={bloccato}
              aperto={aperto === o.id}
              onApri={() => setAperto(aperto === o.id ? null : o.id)}
              onConferma={() => onConferma?.(o)}
              onConsegna={() => setConsegnaFor(o)}
              onTogliRiga={onTogliRiga}
              onCollega={() => setFatturaPer(o)}
              onScollega={(f) => onCollega?.(o, null, f)}
              onGenera={(opzioni) => onGenera?.(o, opzioni)}
              onPagata={onPagata}
              onAllinea={onAllinea}
              onChiudi={() => onChiudi?.(o)}
              onElimina={() => onElimina?.(o)}
              onEmail={onEmail}
              onCopia={onCopia}
              onStampa={onStampa}
              onSalvaModello={onSalvaModello}
            />
          ))}
        </div>
      )}

      {consegnaFor && (
        <DialogoConsegna
          ordine={consegnaFor}
          suppliers={suppliers}
          onCancel={() => setConsegnaFor(null)}
          onConfirm={(dati) => {
            const o = consegnaFor
            setConsegnaFor(null)
            onConsegna?.(o, dati)
          }}
        />
      )}

      {fatturaPer && (
        <DialogoFattura
          ordine={fatturaPer}
          fatture={fatture}
          onCancel={() => setFatturaPer(null)}
          onConfirm={(invoiceId) => {
            const o = fatturaPer
            setFatturaPer(null)
            onCollega?.(o, invoiceId)
          }}
        />
      )}
    </div>
  )
}

// ── UNA RIGA DELLA LISTA ─────────────────────────────────────────────
//
// In testa quello che si legge di sfuggita — fornitore, data, stato,
// pagamento — e sotto, quando si apre, i tre elenchi e i due confronti. Un
// ordine si guarda per intero raramente; si cerca spesso.
function RigaOrdine({
  ordine,
  fattura,
  fatture,
  suppliers,
  bloccato,
  aperto,
  onApri,
  onConferma,
  onConsegna,
  onTogliRiga,
  onCollega,
  onScollega,
  onGenera,
  onPagata,
  onAllinea,
  onChiudi,
  onElimina,
  onEmail,
  onCopia,
  onStampa,
  onSalvaModello,
}) {
  // Gli ordini sono di un fornitore solo (REQ-MAG-037), ma quelli scritti
  // nella settimana in cui non lo erano stanno ancora in archivio: il nome e
  // il colore si prendono dalla prima fetta quando l'ordine non li porta.
  const fette = useMemo(() => fetteFornitore(ordine, { suppliers }), [ordine, suppliers])
  const capo = fette[0] || {}
  const nome = ordine.supplier_name || capo.supplier_name || 'Senza fornitore'
  const stato = statoOrdineDi(ordine)
  const chiuso = ordineChiuso(ordine)
  const pagato = ordinePagato(ordine, fattura)
  const data = String(ordine.created_at || '').slice(0, 10)
  const nonSiChiude = percheNonSiChiude(ordine, fattura)

  return (
    <div
      className={`inv-row ordine-riga${aperto ? ' open' : ''}`}
      style={{ borderLeftColor: capo.colore || undefined }}
    >
      <div className="inv-row-main" style={{ flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn ghost grow riepilogo-nome"
          aria-expanded={aperto}
          aria-label={`L’ordine di ${nome} del ${data}`}
          onClick={onApri}
        >
          <span className="inv-row-name">{nome}</span>
          <span className="muted small">
            {data} · {ordine.lines.length} art. · {formatPrice(ordine.total_gross)}
          </span>
        </button>
        <span className="row ordine-stati" style={{ gap: 4 }}>
          <span className={`pill small stato-${stato}`}>{ETICHETTA_STATO[stato]}</span>
          {chiuso && <span className="pill small stato-chiuso">{ETICHETTA_STATO.chiuso}</span>}
          {/* IL PAGAMENTO È UN ASSE A PARTE, e il chip lo dice accanto allo
              stato della merce invece che al posto suo: un ordine pagato in
              anticipo resta «richiesto», e la merce che non è arrivata deve
              continuare a cercarla qualcuno. */}
          {fattura ? (
            <button
              type="button"
              className={`chip ${pagato ? 'active' : ''}`}
              title={pagato ? 'Segna come da pagare' : 'Segna pagato'}
              aria-label={
                pagato
                  ? `Segna da pagare il documento di ${nome}`
                  : `Segna pagato il documento di ${nome}`
              }
              onClick={() => onPagata?.(fattura, !pagato)}
            >
              {pagato ? '✅ pagato' : '⏳ da pagare'}
            </button>
          ) : (
            // IL BUCO SI SEGNALA SOLO DOVE C'È (REQ-MAG-031): la merce è
            // arrivata e il documento no. Su un ordine ancora richiesto lì
            // non è arrivato niente, e segnalarlo insegnerebbe a ignorare il
            // segnale; su una bozza non è mai partito niente.
            stato === 'consegnato' && <span className="badge-low">senza documento</span>
          )}
        </span>
        <span className="row" style={{ gap: 4 }}>
          {stato === 'bozza' && (
            <button className="btn small" onClick={onConferma}>
              Manda l’ordine
            </button>
          )}
          {stato === 'richiesto' && (
            <button
              className="btn small"
              onClick={onConsegna}
              // Spento col perché, non sparito: un tasto che non c'è fa
              // dubitare di averlo immaginato, e chi aspetta la merce lo cerca.
              disabled={bloccato}
              title={
                bloccato
                  ? 'Prima va aggiornato il magazzino alla nuova gestione (Magazzino → il banner in alto).'
                  : undefined
              }
            >
              📦 Consegnato
            </button>
          )}
          {stato === 'consegnato' && !chiuso && (
            <button
              className="btn small"
              disabled={!!nonSiChiude}
              title={nonSiChiude || 'Ordinato, ricevuto e fatturato tornano'}
              onClick={onChiudi}
            >
              Chiudi
            </button>
          )}
          <button
            className="btn ghost small"
            aria-label={`Invia a ${nome}`}
            title={`Invia a ${nome}`}
            onClick={() => onEmail?.(capo)}
          >
            📧
          </button>
          <button
            className="btn ghost small"
            aria-label={`Copia l’ordine di ${nome}`}
            title="Copia il testo"
            onClick={() => onCopia?.(capo)}
          >
            📋
          </button>
          <button
            className="btn ghost small"
            aria-label={`Stampa l’ordine di ${nome}`}
            title="Stampa"
            onClick={() => onStampa?.(capo)}
          >
            🖨
          </button>
          <button className="btn ghost small" title="Elimina l’ordine" onClick={onElimina}>
            🗑
          </button>
        </span>
      </div>

      {aperto && (
        <div className="inv-row-dettaglio">
          <IlDocumento
            ordine={ordine}
            fattura={fattura}
            fatture={fatture}
            onCollega={onCollega}
            onScollega={onScollega}
            onGenera={onGenera}
          />
          <IlProspetto ordine={ordine} fattura={fattura} onAllinea={onAllinea} />
          <LeRigheAperte ordine={ordine} fette={fette} onTogliRiga={onTogliRiga} />
          <LaStoria ordine={ordine} />
          <SalvaComeModello ordine={ordine} nome={nome} onSalva={onSalvaModello} />
        </div>
      )}
    </div>
  )
}

// ── IL DOCUMENTO: DUE STRADE, LO STESSO POSTO (REQ-MAG-038) ──────────
//
// Si ASSOCIA un documento che c'è già, oppure lo si GENERA dall'ordine coi
// prezzi dell'ordine. E c'è la terza porta, che non è un'eccezione: quando
// non è arrivata nessuna carta si crea comunque la riga nello scadenzario,
// marcata «Nessun documento», e la si paga — se no quei soldi sarebbero gli
// unici a non comparire nel totale del mese.
function IlDocumento({ ordine, fattura, fatture, onCollega, onScollega, onGenera }) {
  const nome = ordine.supplier_name || 'questo fornitore'
  const collegabili = useMemo(
    () =>
      fattureCollegabili(fatture, {
        order_id: ordine.id,
        supplier_id: ordine.supplier_id,
        supplier_name: ordine.supplier_name,
      }),
    [fatture, ordine]
  )
  if (fattura) {
    return (
      <div className="ordine-blocco">
        <strong className="small">Il documento</strong>
        <div className="muted small">
          {fattura.doc_type}
          {fattura.number ? ` n. ${fattura.number}` : ''} · {fattura.date || '—'} ·{' '}
          {/* IL SEGNO SI LEGGE ANCHE QUI (BUG-100): una nota di credito
              scala dei soldi, e la cifra nuda si leggerebbe come una
              spesa in più. */}
          {importoLeggibile(fattura)}
        </div>
        <div className="row" style={{ gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
          {/* UNA FATTURA CHE CI SIAMO FATTI DA SOLI NON È QUELLA DEL
              FORNITORE: la prima dice quanto ci si aspetta di pagare, la
              seconda quanto lui chiede. Il chip lo scrive, perché la cifra
              si legge uguale. */}
          {fatturaGenerata(fattura) && (
            <span className="pill small">Generata dall’ordine</span>
          )}
          {!fattura.attachment && fattura.doc_type !== DOC_NESSUNO && (
            <span className="badge-low">Senza allegato</span>
          )}
          <button
            className="btn ghost small"
            aria-label={`Scollega il documento dall’ordine di ${nome}`}
            onClick={() => onScollega?.(fattura)}
          >
            🔗✕ Scollega
          </button>
        </div>
        {fatturaGenerata(fattura) && (
          <p className="muted small" style={{ marginTop: 4 }}>
            Il documento del fornitore si allega dallo <strong>Scadenzario</strong>:
            finché non arriva, questa cifra è quella che ci si aspetta di pagare.
          </p>
        )}
      </div>
    )
  }
  return (
    <div className="ordine-blocco">
      <strong className="small">Il documento</strong>
      <p className="muted small" style={{ marginTop: 2 }}>
        Senza documento collegato non si sa se questo ordine è stato pagato:
        il pagamento sta sul documento, non sull’ordine.
      </p>
      <div className="row" style={{ gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
        <button
          className="btn small"
          disabled={collegabili.length === 0}
          aria-label={`Associa un documento all’ordine di ${nome}`}
          onClick={onCollega}
        >
          🧾 Associa un documento
        </button>
        <button
          className="btn secondary small"
          disabled={!ordine.supplier_id}
          aria-label={`Genera il documento dall’ordine di ${nome}`}
          onClick={() => onGenera?.({})}
        >
          Genera dall’ordine
        </button>
        <button
          className="btn ghost small"
          disabled={!ordine.supplier_id}
          title="Crea la riga nello scadenzario e la segna pagata"
          aria-label={`Registra il pagamento dell’ordine di ${nome} senza documento`}
          onClick={() => onGenera?.({ doc_type: DOC_NESSUNO, paid: true })}
        >
          Pagato senza documento
        </button>
      </div>
    </div>
  )
}

// ── I DUE CONFRONTI ──────────────────────────────────────────────────
//
// Le tre colonne sono i tre elenchi che non vanno confusi: ORDINATO,
// RICEVUTO, FATTURATO. Sotto, quello che non torna — detto come fatto e non
// come colpa: una cassa in meno può essere un ritardo concordato al telefono.
function IlProspetto({ ordine, fattura, onAllinea }) {
  const prospetto = useMemo(() => prospettoOrdine(ordine, fattura), [ordine, fattura])
  const totali = useMemo(() => totaliProspetto(ordine, fattura), [ordine, fattura])
  const prezzi = scartiDiPrezzo(prospetto)
  const merce = scartiDiMerce(prospetto)
  const daAllineare = fattura ? prezziDaAllineare(ordine, fattura) : []

  return (
    <div className="ordine-blocco">
      <strong className="small">Ordinato, ricevuto, fatturato</strong>
      <div className="inv-list inv-table ordine-prospetto" style={{ marginTop: 4 }}>
        <div className="inv-thead">
          <span className="inv-th">Prodotto</span>
          <span className="inv-th inv-cell-num">Ordinato</span>
          <span className="inv-th inv-cell-num">Ricevuto</span>
          <span className="inv-th inv-cell-num">In fattura</span>
          <span className="inv-th inv-cell-num">Differenza</span>
        </div>
        {prospetto.map((r) => (
          <div className="inv-row" key={r.item_id || r.name}>
            <div className="inv-row-main">
              <span className="inv-row-name">{r.name}</span>
              <span className="inv-cell-num muted">{r.ordinato ?? '—'}</span>
              <span className="inv-cell-num muted">{r.ricevuto ?? '—'}</span>
              <span className="inv-cell-num muted">{r.fatturato ?? '—'}</span>
              {/* IL PRIMO CONFRONTO: da quanto costava all'ordine a quanto
                  costa in fattura. Il segno si scrive, perché «+0,40» e
                  «-0,40» sono due notizie molto diverse. */}
              <span className="inv-cell-num">
                {r.differenza == null
                  ? '—'
                  : `${r.differenza > 0 ? '+' : ''}${formatPrice(r.differenza)}`}
              </span>
            </div>
            {r.problemi.length > 0 && (
              <div className="muted small ordine-scarti">
                {r.problemi.map((p) => (
                  <span className="badge-low" key={p}>
                    {ETICHETTA_PROBLEMA[p]}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="muted small" style={{ marginTop: 4 }}>
        Netto ordinato {formatPrice(totali.ordinato)} · ricevuto{' '}
        {formatPrice(totali.ricevuto)}
        {totali.fatturato != null ? ` · fatturato ${formatPrice(totali.fatturato)}` : ''}
        {totali.documento != null ? ` · documento ${formatPrice(totali.documento)}` : ''}
      </div>
      {fattura && !fatturaConRighe(fattura) && (
        <p className="muted small" style={{ marginTop: 4 }}>
          Il documento non ha righe: si confrontano solo gli importi. I prodotti
          si aggiungono dallo <strong>Scadenzario</strong>.
        </p>
      )}
      {merce.length > 0 && (
        <p className="muted small" style={{ marginTop: 4 }}>
          {merce.length === 1
            ? '1 prodotto su cui la merce non torna.'
            : `${merce.length} prodotti su cui la merce non torna.`}
        </p>
      )}
      {/* IL CONFRONTO NON FINISCE IN UN AVVISO (REQ-MAG-035): il prezzo del
          documento allinea il listino di quel fornitore e la variazione
          finisce nello storico dei prezzi. Lasciare il listino fermo
          farebbe ricomparire lo stesso scarto al giro dopo, e a quel punto
          l'avviso diventa rumore che si impara a ignorare. */}
      {daAllineare.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <button className="btn small" onClick={() => onAllinea?.(ordine, fattura)}>
            Allinea il listino al documento ({daAllineare.length})
          </button>
          <p className="muted small" style={{ marginTop: 2 }}>
            {prezzi.length === 1
              ? 'Un prezzo è cambiato rispetto all’ordine.'
              : `${prezzi.length} prezzi sono cambiati rispetto all’ordine.`}{' '}
            Il prezzo del documento diventa quello di questo fornitore, e la
            variazione resta nello storico.
          </p>
        </div>
      )}
    </div>
  )
}

// LE RIGHE ANCORA IN ATTESA, che si possono togliere: è una delle due sole
// strade per far uscire un prodotto da «in assortimento» (REQ-MAG-037).
// Quello che è già arrivato non si toglie — ha alzato una giacenza — e si
// corregge dal magazzino.
function LeRigheAperte({ ordine, fette, onTogliRiga }) {
  const bozza = eBozza(ordine)
  const aperte = fette.flatMap((f) =>
    f.lines
      .map((l, k) => ({ l, i: f.indici[k], fetta: f }))
      .filter(({ l }) => livelloDi(l) === 'richiesto')
  )
  if (aperte.length === 0) return null
  return (
    <div className="ordine-blocco">
      <strong className="small">{bozza ? 'Le righe della bozza' : 'Ancora da ricevere'}</strong>
      <div className="muted small ordine-righe-storico">
        {aperte.map(({ l, i, fetta }) => (
          <span className="ordine-riga-storico" key={`${l.item_id || 'riga'}-${i}`}>
            {l.qty_packages}× {l.name}
            {/* La data nel nome del tasto non è un vezzo: due ordini allo
                stesso fornitore darebbero due tasti identici, e questo
                toglie roba da un ordine già mandato. */}
            <button
              type="button"
              className="btn ghost small"
              aria-label={`Togli ${l.name} dall’ordine di ${fetta.supplier_name || 'questo fornitore'} del ${String(ordine.created_at || '').slice(0, 10)}`}
              title="Togli dall’ordine"
              onClick={() => onTogliRiga?.(ordine, { indice: i, riga: l, fetta })}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── LA STORIA DELL'ORDINE ────────────────────────────────────────────
//
// «Serve una lista dei movimenti fatti per quell'ordine, una specie di
// history, se l'ordine è già stato confermato ma Flavio fa delle modifiche»
// (utente, 27/08). Dal più recente: la domanda è «cos'è successo ultimamente
// a quest'ordine», non il contrario.
function LaStoria({ ordine }) {
  const voci = storiaDi(ordine)
  if (voci.length === 0) return null
  return (
    <div className="ordine-blocco">
      <strong className="small">Cosa è successo</strong>
      <ul className="ordine-storia">
        {[...voci].reverse().map((v, k) => (
          <li key={`${v.at}-${k}`}>
            <span className="muted small">{giornoEOra(v.at)}</span> {descriviMovimento(v)}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── «SALVA QUESTO COME MODELLO» (REQ-MAG-039) ────────────────────────
//
// Un ordine già fatto è il modo più naturale di crearne uno: è il giro
// esatto, con le sue quantità, e non va ricomposto a mano nella tabella per
// riconservarlo. Sta DENTRO il dettaglio dell'ordine e non fra i tasti in
// testa alla riga, che sono già cinque e vanno tutti a un fornitore vero:
// questo non manda niente a nessuno, conserva.
//
// NON PORTA I PREZZI, come nessun modello: da un ordine si riprendono il
// prodotto, il fornitore e quanto se ne era chiesto. Il prezzo lo rimette il
// listino quando il modello si applica, e il listino lo tiene allineato la
// fattura — che è tutto il punto della catena.
function SalvaComeModello({ ordine, nome, onSalva }) {
  const [aperto, setAperto] = useState(false)
  const [testo, setTesto] = useState('')
  if (!onSalva || (ordine.lines || []).length === 0) return null
  return (
    <div className="ordine-blocco">
      <strong className="small">Rifarlo uguale</strong>
      {!aperto ? (
        <p className="muted small" style={{ marginTop: 4 }}>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              setTesto(nome)
              setAperto(true)
            }}
          >
            Salva come modello
          </button>{' '}
          Il modello conserva i prodotti, il fornitore e le quantità: i prezzi
          restano quelli del listino.
        </p>
      ) : (
        <form
          className="row"
          style={{ gap: 8, marginTop: 4, flexWrap: 'wrap' }}
          onSubmit={(e) => {
            e.preventDefault()
            const pulito = testo.trim()
            if (!pulito) return
            onSalva(ordine, pulito)
            setAperto(false)
          }}
        >
          <label htmlFor={`modello-${ordine.id}`} className="muted small">
            Nome del modello
          </label>
          <input
            id={`modello-${ordine.id}`}
            type="text"
            value={testo}
            autoFocus
            onChange={(e) => setTesto(e.target.value)}
          />
          <button type="submit" className="btn small" disabled={!testo.trim()}>
            Salva
          </button>
          <button type="button" className="btn ghost small" onClick={() => setAperto(false)}>
            Annulla
          </button>
        </form>
      )}
    </div>
  )
}

// ── IL DOCUMENTO DA ASSOCIARE ────────────────────────────────────────
//
// I documenti proposti sono solo quelli DELLO STESSO FORNITORE e ancora
// liberi: agganciare la fattura di Nova all'ordine di Enofel non è un errore
// di battitura, è merce pagata a chi non l'ha venduta. Il modo di impedirlo
// è non farla comparire, non spiegarlo dopo (REQ-MAG-031).
function DialogoFattura({ ordine, fatture, onCancel, onConfirm }) {
  const [scelta, setScelta] = useState('')
  const nome = ordine.supplier_name || 'questo fornitore'
  const candidate = useMemo(
    () =>
      fattureCollegabili(fatture, {
        order_id: ordine.id,
        supplier_id: ordine.supplier_id,
        supplier_name: ordine.supplier_name,
      }),
    [fatture, ordine]
  )
  return (
    <div className="overlay confirm-overlay" onClick={onCancel}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>🧾 Il documento di {nome}</h3>
        <p className="muted">
          Si collega un documento di {nome} a questo ordine: quello che ha
          mandato lui, per la merce che ha portato lui.
        </p>
        {candidate.length === 0 ? (
          <p className="muted small">
            Nessun documento di {nome} da collegare. Si scrive nello{' '}
            <strong>Scadenzario</strong>, oppure si genera dall’ordine.
          </p>
        ) : (
          <>
            <label htmlFor="pf-fattura">Documento</label>
            <select id="pf-fattura" value={scelta} onChange={(e) => setScelta(e.target.value)}>
              <option value="">— Scegli un documento —</option>
              {candidate.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.number ? `#${f.number} · ` : ''}
                  {f.date || '—'} · {formatPrice(f.amount)}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="row" style={{ gap: 10, marginTop: 16 }}>
          <button className="btn ghost grow" onClick={onCancel}>Annulla</button>
          <button className="btn grow" disabled={!scelta} onClick={() => onConfirm(scelta)}>
            Collega
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ALLA CONSEGNA SI CORREGGE QUANTO E QUANTO COSTA, MAI IL FORNITORE ─
//
// Flavio: «prendo dieci cose, mi esce 300 euro di ordine; una volta che il
// fornitore mi scarica l'ordine vedo se veramente sono 300 o di più o di
// meno, e modifico il prezzo quando necessario. NON POSSO MODIFICARE IL
// FORNITORE PERCHÉ DA LUI L'HO COMPRATO».
//
// E DA REQ-MAG-038 SI CORREGGE ANCHE LA QUANTITÀ: «quando l'ordine arriva
// deve poter MODIFICARE L'ORDINE in base a quello che ha effettivamente
// ricevuto». Il campo parte con quello che si era chiesto, che è il caso
// normale, e il magazzino si carica su quello che c'è scritto lì: caricare
// l'ordinato quando è arrivato meno vuol dire una giacenza che nessuno ha
// sullo scaffale.
//
// LA RIGA CHE NON È ARRIVATA PER NIENTE si spunta via: resta in attesa e si
// carica quando arriva. Zero è un'altra cosa — è il fornitore che dice «di
// quello non ne ho» — e va scritto.
//
// Le righe già consegnate non compaiono: di lì si carica, non si ricarica.
function DialogoConsegna({ ordine, suppliers, onCancel, onConfirm }) {
  const [prezzi, setPrezzi] = useState({})
  const [quantita, setQuantita] = useState({})
  const fette = useMemo(() => fetteFornitore(ordine, { suppliers }), [ordine, suppliers])
  const nome = ordine.supplier_name || fette[0]?.supplier_name || 'questo fornitore'
  const righe = useMemo(
    () =>
      fette.flatMap((f) =>
        f.lines
          .map((l, k) => ({ l, i: f.indici[k] }))
          .filter(({ l }) => livelloDi(l) === 'richiesto' && (Number(l.qty_packages) || 0) > 0)
      ),
    [fette]
  )
  const [scelti, setScelti] = useState(() => new Set(righe.map((r) => r.i)))
  const tutte = scelti.size === righe.length && righe.length > 0
  const prezzo = (i, l) => prezzi[i] ?? String(Number(l.unit_cost) || 0)
  const qta = (i, l) => quantita[i] ?? String(Number(l.qty_packages) || 0)
  const totale = righe.reduce(
    (t, { l, i }) =>
      t + (scelti.has(i) ? (Number(qta(i, l)) || 0) * (Number(prezzo(i, l)) || 0) : 0),
    0
  )
  const spunta = (i, dentro) =>
    setScelti((prev) => {
      const next = new Set(prev)
      if (dentro) next.add(i)
      else next.delete(i)
      return next
    })
  return (
    <div className="overlay confirm-overlay" onClick={onCancel}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>📦 Merce arrivata da {nome}?</h3>
        <p className="muted">
          Correggi i pezzi con quelli che sono arrivati davvero: il magazzino
          si carica su quelli. Togli la spunta a quello che non è arrivato
          per niente — resta in attesa e si carica quando arriva. I prezzi
          come sono sul documento diventano il prezzo di questo fornitore.
        </p>
        {righe.length > 1 && (
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setScelti(tutte ? new Set() : new Set(righe.map((r) => r.i)))}
          >
            {tutte ? 'Togli tutte le spunte' : 'Spunta tutte'}
          </button>
        )}
        {righe.map(({ l, i }) => (
          <div className="row between" key={i} style={{ alignItems: 'center', marginTop: 6, gap: 8 }}>
            <label className="row grow" style={{ minWidth: 0, gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={scelti.has(i)}
                aria-label={`Carica ${l.name}`}
                onChange={(e) => spunta(i, e.target.checked)}
              />
              <span style={{ minWidth: 0 }}>
                {l.name}
                <span className="muted small"> · chiesti {l.qty_packages}</span>
              </span>
            </label>
            <input
              type="number"
              step="1"
              min="0"
              aria-label={`Pezzi ricevuti di ${l.name}`}
              value={qta(i, l)}
              onChange={(e) => setQuantita((q) => ({ ...q, [i]: e.target.value }))}
              style={{ width: 'calc(72px / var(--zoom, 1))', textAlign: 'right' }}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              aria-label={`Prezzo di ${l.name}`}
              value={prezzo(i, l)}
              onChange={(e) => setPrezzi((p) => ({ ...p, [i]: e.target.value }))}
              style={{ width: 'calc(96px / var(--zoom, 1))', textAlign: 'right' }}
            />
          </div>
        ))}
        <div className="row between" style={{ marginTop: 10 }}>
          <span className="muted">Totale netto</span>
          <strong>{formatPrice(totale)}</strong>
        </div>
        <div className="row" style={{ gap: 10, marginTop: 16 }}>
          <button className="btn ghost grow" onClick={onCancel}>Annulla</button>
          <button
            className="btn grow"
            disabled={scelti.size === 0}
            onClick={() => onConfirm({ indici: [...scelti], prezzi, quantita })}
          >
            {tutte ? `Carica tutti (${scelti.size})` : `Carica i selezionati (${scelti.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
