import { useEffect, useMemo, useRef, useState } from 'react'
import {
  catalogoOrdinabile,
  filtraCatalogo,
  fornitoreProposto,
  fornitoriGiaUsati,
  piuEconomica,
  prezzoAlPezzo,
  righeDiProdotto,
} from '../lib/listini.js'
import {
  ETICHETTA_ASSORTIMENTO,
  ETICHETTA_SCORTA,
  assortimentoDi,
  contenutoDelPezzo,
  formatQty,
  stockStatus,
} from '../lib/inventory.js'
import {
  PASSO_RIGHE,
  didascaliaListino,
  etichettaQuantita,
  listinoDelFornitore,
  ordinaCatalogo,
  ordiniDaCreare,
  preselezioneIniziale,
  uniscePreselezione,
  prossimaFinestra,
  raggruppaPerFornitore,
  righeOrdine,
  righeScelte,
  vicinoAlFondo,
} from '../lib/composizioneOrdine.js'
import { applicaModello, righeModello } from '../lib/modelliOrdine.js'
import { purchaseOrderTotals } from '../lib/warehouse.js'
import { formatPrice } from '../lib/orderStatus.js'
import SortTh from './SortTh.jsx'
import RiepilogoOrdini from './RiepilogoOrdini.jsx'
import ModelliOrdine from './ModelliOrdine.jsx'

// ── NUOVO ORDINE: UNA TABELLA SOLA, E L'ORDINE DI FIANCO (REQ-MAG-036) ─
//
// Questa schermata era già stata fatta una volta, ed è stata bocciata
// (utente, 27/08/2026): «nella sezione ordini NON MI PIACE LA DOPPIA LISTA e
// quei box sono POSTICCI. Serve una UX e UI più moderna e semplice. Deve
// esserci UNA SOLA TABELLA dove su ogni riga vedrò il nome del prodotto e i
// vari campi per compilare l'ordine, compresa una dropdown per la scelta del
// fornitore». E: «è SCOMODISSIMO l'ordine in basso. Dobbiamo metterlo
// affianco, e già lì separare i prodotti di un fornitore rispetto a un
// altro».
//
// Quindi: a sinistra UNA tabella — spunta · prodotto · disponibilità ·
// fornitore · €/pz di listino · pezzi · totale · la riga che si apre — e a
// destra l'ordine che si sta componendo, già diviso per fornitore. I conti
// (ordinamento, preselezione, finestra, raggruppamento) stanno tutti in
// `lib/composizioneOrdine.js`, dove si provano senza Firebase.
//
// I doppioni non sono un difetto: lo stesso prodotto su due listini fa due
// righe, distinte dal nome del fornitore e dal colore della striscia
// (REQ-MAG-029).
export default function NuovoOrdinePanel({
  items = [],
  suppliers = [],
  listini = [],
  onCrea,
  // I MODELLI (REQ-MAG-039) sono il giro che si fa sempre, e stanno accanto
  // alla precompilazione senza sostituirla: quella guarda le scorte, questi
  // guardano l'abitudine.
  modelli = [],
  onSalvaModello,
  onEliminaModello,
}) {
  const [query, setQuery] = useState('')
  const [filtroFornitore, setFiltroFornitore] = useState('all')
  const [sort, setSort] = useState({ col: 'nome', dir: 'asc' })
  const toggleSort = (col) =>
    setSort((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }))
  // La riga aperta: una per volta, come nella lista del magazzino.
  const [aperta, setAperta] = useState(null)
  // Quello che si sta ordinando: chiave della riga → { qty, supplier_id,
  // totale }. `qty` e `totale` restano STRINGHE finché si scrive — un campo
  // svuotato deve poter restare vuoto, e con un numero diventerebbe «0» sotto
  // le dita di chi sta cancellando per riscrivere.
  const [selezioni, setSelezioni] = useState({})
  const [mostrate, setMostrate] = useState(PASSO_RIGHE)
  // IL RIEPILOGO LAVORA SU UNA FOTOGRAFIA (REQ-MAG-037). Confermare un
  // fornitore toglie le sue righe dalla composizione — sono ordinate, non
  // si ordinano due volte — ma la sua tabella deve restare a schermo col
  // badge «Ordinato»: se il riepilogo leggesse la composizione dal vivo, il
  // fornitore appena confermato sparirebbe nell'istante della conferma.
  const [inRevisione, setInRevisione] = useState(null)
  const [confermati, setConfermati] = useState({})
  // La preselezione si fa UNA VOLTA SOLA: il magazzino si ricarica anche
  // dopo un salvataggio, e rifarla cancellerebbe le spunte tolte a mano.
  const preselezionato = useRef(false)

  // FUORI LINEA IN TABELLA SÌ, PRESELEZIONATO NO. Prima gli `out` erano
  // esclusi dal catalogo: così però non c'era modo di farli rientrare, e
  // ordinarne uno è esattamente il gesto con cui rientrano (REQ-MAG-036).
  const catalogo = useMemo(
    () => catalogoOrdinabile({ items, listini, suppliers }),
    [items, listini, suppliers]
  )
  const perChiave = useMemo(() => new Map(catalogo.map((r) => [r.key, r])), [catalogo])

  const visibili = useMemo(
    () => ordinaCatalogo(filtraCatalogo(catalogo, { query, supplierId: filtroFornitore }), sort),
    [catalogo, query, filtroFornitore, sort]
  )
  const finestra = useMemo(() => visibili.slice(0, mostrate), [visibili, mostrate])

  useEffect(() => {
    if (preselezionato.current || catalogo.length === 0) return
    preselezionato.current = true
    const pre = preselezioneIniziale(catalogo)
    const iniziali = {}
    for (const [key, qty] of pre) {
      iniziali[key] = { qty: String(qty), supplier_id: perChiave.get(key)?.supplier_id ?? null }
    }
    // LA PRESELEZIONE SI AGGIUNGE, NON SOSTITUISCE: quello che è già stato
    // scritto vince. Prima qui c'era `setSelezioni(iniziali)`, che buttava via
    // l'intero stato — e questo effetto gira DOPO il primo disegno delle
    // righe, quindi chiunque tocchi un campo in quella finestra si vedeva
    // sparire quello che aveva appena scritto, senza un errore e senza un
    // segno. L'ha trovato la CI, dove la macchina è più lenta: due colli
    // scritti tornavano a uno. Sul tablet del banco, con 388 prodotti e 367
    // listini da mettere in fila, quella finestra non è zero.
    setSelezioni((prev) => uniscePreselezione(iniziali, prev))
  }, [catalogo, perChiave])

  // Cambiando filtro, ricerca o ordinamento si riparte dalla prima finestra:
  // restare a quattrocento righe caricate dopo aver cercato «campari» vuol
  // dire disegnare tutto il magazzino per mostrarne due.
  useEffect(() => {
    setMostrate(PASSO_RIGHE)
  }, [query, filtroFornitore, sort])

  const scelte = useMemo(
    () => righeScelte(selezioni, { perChiave, listini, suppliers }),
    [selezioni, perChiave, listini, suppliers]
  )
  const gruppi = useMemo(() => raggruppaPerFornitore(scelte), [scelte])
  const lines = useMemo(() => righeOrdine(scelte, { listini }), [scelte, listini])
  const totals = useMemo(() => purchaseOrderTotals(lines), [lines])
  const preselezionati = useMemo(
    () => scelte.filter((s) => stockStatus(s.item) !== 'ok').length,
    [scelte]
  )

  function spunta(riga, dentro) {
    if (!dentro) return togli(riga.key)
    setSelezioni((prev) => ({
      ...prev,
      [riga.key]: prev[riga.key] || { qty: '1', supplier_id: riga.supplier_id ?? null },
    }))
  }

  function togli(key) {
    setSelezioni((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // SCRIVERE UNA QUANTITÀ SELEZIONA LA RIGA: «se aggiungo una quantità sulla
  // riga del prodotto, questo viene selezionato automaticamente per
  // l'ordine». Scrivere una quantità È la decisione di ordinarlo, e chiedere
  // anche la spunta sarebbe far dire due volte la stessa cosa.
  function cambiaQta(riga, qty) {
    setSelezioni((prev) => {
      const attuale = prev[riga.key] || { supplier_id: riga.supplier_id ?? null }
      // Il totale corretto a mano vale per QUEI pezzi: cambiando i pezzi
      // torna a farsi dal listino, se no resterebbe la cifra di prima
      // attaccata a una quantità diversa.
      const { totale: _via, ...resto } = attuale
      return { ...prev, [riga.key]: { ...resto, qty } }
    })
  }

  function cambiaTotale(riga, totale) {
    setSelezioni((prev) => {
      const attuale = prev[riga.key] || { supplier_id: riga.supplier_id ?? null }
      // Un totale scritto su una riga ancora vuota vale per un pezzo: senza
      // quantità sarebbe una cifra che non compra niente.
      const qty = Number(attuale.qty) > 0 ? attuale.qty : '1'
      return { ...prev, [riga.key]: { ...attuale, qty, totale } }
    })
  }

  function cambiaFornitore(riga, supplier_id) {
    setSelezioni((prev) => {
      const attuale = prev[riga.key] || { qty: '1' }
      // Il prezzo viene dal listino del fornitore scelto: un totale corretto
      // a mano per l'altro fornitore non c'entra più niente.
      const { totale: _via, ...resto } = attuale
      return { ...prev, [riga.key]: { ...resto, supplier_id: supplier_id || null } }
    })
  }

  function altreRighe() {
    setMostrate((m) => prossimaFinestra(m, visibili.length))
  }

  // APPLICARE UN MODELLO SI SOMMA, NON SOSTITUISCE (REQ-MAG-039): la
  // precompilazione ha già messo quello che sta finendo adesso, il modello
  // aggiunge il giro che si fa sempre. Per le righe che il modello nomina
  // vince la sua quantità — è quella che Flavio ha deciso di conservare.
  // L'esito torna a chi l'ha chiesto e lo mostra: chi applica un modello deve
  // vedere cosa non è stato ripreso e perché.
  function applica(modello) {
    const esito = applicaModello(modello, { catalogo, suppliers, selezioni })
    setSelezioni(esito.selezioni)
    return esito
  }

  // SCORRIMENTO CONTINUO. Si guarda quanto manca al fondo del riquadro che
  // scorre — non della finestra: la tabella ha una barra sua, perché
  // l'intestazione deve restare in alto mentre si scorrono seicento righe.
  function scorre(e) {
    const el = e.currentTarget
    if (mostrate >= visibili.length) return
    if (vicinoAlFondo(el)) altreRighe()
  }

  const fette = useMemo(
    () => (inRevisione ? ordiniDaCreare(inRevisione, { listini }) : []),
    [inRevisione, listini]
  )

  // «La creazione dell'ordine deve portarmi a una schermata di RIEPILOGO»:
  // il tasto non manda niente a nessuno, porta a rivedere.
  const rivedi = () => {
    setInRevisione(scelte.filter((s) => s.qty > 0))
    setConfermati({})
  }

  // Confermato un fornitore, le sue righe escono dalla composizione: tornando
  // indietro resta da fare quello che non è ancora partito. Niente `await`
  // prima di mostrare l'esito — l'ordine si compone in memoria.
  //
  // LA BOZZA PASSA DA QUI (REQ-MAG-038) ed è lo stesso gesto con un
  // interruttore: «l'ordine bozza NON IMPATTA SUL MAGAZZINO», quindi nasce
  // un documento e basta — nessun prodotto in assortimento, nessun numero
  // nel riepilogo dei soldi che escono. Le righe escono comunque dalla
  // composizione: sono state messe da parte, non dimenticate, e si
  // riprendono dalla Lista ordini.
  function conferma(fetta, opzioni) {
    Promise.resolve(onCrea?.(fetta, opzioni)).then((ordine) => {
      if (!ordine?.id) return
      setConfermati((prev) => ({
        ...prev,
        [fetta.chiave]: { id: ordine.id, bozza: !!opzioni?.bozza },
      }))
      setSelezioni((prev) => {
        const next = { ...prev }
        for (const r of fetta.righe) delete next[r.key]
        return next
      })
    })
  }

  // Dal riepilogo si può ancora togliere: finché il fornitore non è
  // confermato, in magazzino non è cambiato niente.
  function togliDalRiepilogo(riga) {
    setInRevisione((prev) => (prev || []).filter((s) => s.key !== riga.key))
    togli(riga.key)
  }

  if (inRevisione) {
    return (
      <RiepilogoOrdini
        fette={fette}
        confermati={confermati}
        onConferma={conferma}
        onTogli={togliDalRiepilogo}
        onIndietro={() => setInRevisione(null)}
      />
    )
  }

  return (
    <div className="card ordine-composizione">
      <strong>Nuovo ordine</strong>
      <p className="muted small" style={{ marginTop: 4 }}>
        Sono già spuntati i prodotti esauriti o sotto la soglia di riordino.
        Il fornitore e i pezzi si cambiano sulla riga; a destra l’ordine in
        composizione, diviso per fornitore.
      </p>

      <ModelliOrdine
        modelli={modelli}
        righe={righeModello(scelte)}
        onApplica={applica}
        onSalva={onSalvaModello}
        onElimina={onEliminaModello}
      />

      <div className="ordine-filtri">
        <span className="grow">
          <label htmlFor="po-cerca">Cerca un prodotto</label>
          <input
            id="po-cerca"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Es. Campari"
          />
        </span>
        <span className="grow">
          <label htmlFor="po-filtro">Filtra per fornitore</label>
          <select
            id="po-filtro"
            value={filtroFornitore}
            onChange={(e) => setFiltroFornitore(e.target.value)}
          >
            <option value="all">Tutti i fornitori</option>
            <option value="none">Senza fornitore</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </span>
      </div>

      <div className="ordine-due-colonne">
        <div style={{ minWidth: 0 }}>
          {/* Finché il magazzino non è arrivato la tabella è vuota per un
              motivo diverso da «non c'è niente che corrisponda»: dirlo
              sbagliato manda a cercare un prodotto che c'è. */}
          {items.length === 0 ? (
            <div className="empty">Carico il magazzino…</div>
          ) : visibili.length === 0 ? (
            <p className="muted small">Nessun prodotto corrisponde alla ricerca.</p>
          ) : (
            <>
              <div className="inv-list inv-table ordine-tabella" onScroll={scorre}>
                <div className="inv-thead">
                  <span aria-hidden />
                  <SortTh label="Prodotto" col="nome" sort={sort} onSort={toggleSort} />
                  <SortTh label="Disponibilità" col="scorta" sort={sort} onSort={toggleSort} />
                  <SortTh label="Fornitore" col="fornitore" sort={sort} onSort={toggleSort} />
                  <SortTh label="€/pz" col="prezzo" sort={sort} onSort={toggleSort} num />
                  <span className="inv-th inv-cell-num" aria-hidden>Pezzi</span>
                  <span className="inv-th inv-cell-num" aria-hidden>Totale</span>
                  <span aria-hidden />
                </div>
                {finestra.map((riga) => (
                  <RigaCatalogo
                    key={riga.key}
                    riga={riga}
                    sel={selezioni[riga.key]}
                    suppliers={suppliers}
                    listini={listini}
                    scelte={scelte}
                    aperta={aperta === riga.key}
                    onApri={() => setAperta(aperta === riga.key ? null : riga.key)}
                    onSpunta={spunta}
                    onQta={cambiaQta}
                    onTotale={cambiaTotale}
                    onFornitore={cambiaFornitore}
                  />
                ))}
              </div>
              <p className="muted small ordine-conta">
                {mostrate < visibili.length ? (
                  <>
                    Mostrate {finestra.length} righe su {visibili.length}.{' '}
                    {/* Scorrendo si caricano da sole; il tasto serve a chi
                        arriva qui con la tastiera, che scorrendo col tabulatore
                        non fa scorrere niente. */}
                    <button type="button" className="btn ghost small" onClick={altreRighe}>
                      Mostra altre righe
                    </button>
                  </>
                ) : (
                  <>{visibili.length} righe, tutte in elenco.</>
                )}
              </p>
            </>
          )}
        </div>

        <aside className="ordine-carrello" aria-label="Ordine in composizione">
          <strong>Ordine in composizione</strong>
          {gruppi.length === 0 ? (
            <p className="muted small" style={{ marginTop: 6 }}>
              Nessun prodotto selezionato. Spunta una riga della tabella, o
              scrivi quanti pezzi ne servono.
            </p>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 2 }}>
                {preselezionati === 0
                  ? `${scelte.length} prodotti selezionati.`
                  : `${scelte.length} prodotti selezionati, ${preselezionati} sotto scorta.`}
              </p>
              {gruppi.map((g) => (
                <div
                  className="ordine-gruppo"
                  key={g.supplier_id || 'senza'}
                  style={{ borderLeftColor: g.colore || undefined }}
                >
                  <div className="row between">
                    <strong className="small">{g.supplier_name || 'Senza fornitore'}</strong>
                    <span className="muted small">{formatPrice(g.totale)}</span>
                  </div>
                  {g.righe.map((r) => (
                    <div className="row between ordine-gruppo-riga" key={r.key}>
                      <span className="muted small grow" style={{ minWidth: 0 }}>
                        {/* A collo si leggono i cartoni E i pezzi: sono i
                            cartoni che si chiedono al fornitore e i pezzi
                            che arrivano in magazzino (REQ-MAG-040). */}
                        {r.aCollo ? `${etichettaQuantita(r)} ` : `${r.qty}× `}
                        {r.item_name}
                      </span>
                      <span className="muted small">{formatPrice(r.totale)}</span>
                      <button
                        type="button"
                        className="btn ghost small"
                        aria-label={`Togli ${r.item_name} dall’ordine`}
                        title="Togli dall’ordine"
                        onClick={() => togli(r.key)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              <div className="row between ordine-totale">
                <span className="muted small">
                  {totals.pieces} pezzi · netto {formatPrice(totals.net)}
                </span>
                <strong>
                  {formatPrice(totals.gross)} <span className="muted small">+IVA</span>
                </strong>
              </div>
              <button
                className="btn block"
                style={{ marginTop: 8 }}
                onClick={rivedi}
                disabled={lines.length === 0}
              >
                Rivedi e conferma
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

// Come si chiama una riga quando bisogna nominarla a voce (screen reader) o
// in un test: il prodotto DA CHI. Col solo nome due righe dello stesso
// Campari sarebbero indistinguibili, ed è esattamente il caso normale.
const nomeRiga = (r) => `${r.item_name} (${r.supplier_name || 'senza fornitore'})`

function RigaCatalogo({
  riga,
  sel,
  suppliers,
  listini,
  scelte,
  aperta,
  onApri,
  onSpunta,
  onQta,
  onTotale,
  onFornitore,
}) {
  const item = riga.item
  const st = stockStatus(item)
  const scelta = sel ? scelte.find((s) => s.key === riga.key) : null
  const supplierId = sel?.supplier_id ?? riga.supplier_id ?? null
  // COLLI E PEZZI (REQ-MAG-040). `prezzoCollo` è quello che il fornitore
  // fattura e `prezzoPezzo` quello ricavato, l'unico con cui si confrontano
  // due fornitori che vendono in confezioni diverse. La colonna mostra il
  // pezzo. `aCollo` governa solo le PAROLE: dove il collo è da uno — la
  // grande maggioranza — la schermata resta identica a prima, e la parola
  // «collo» non compare da nessuna parte.
  const listino = listinoDelFornitore(item, listini, supplierId)
  const { perCollo, aCollo, prezzoPezzo, problema } = listino
  // Da dove viene quel prezzo al pezzo: il prezzo come il fornitore l'ha
  // scritto e il collo, dove un collo c'è. Null dove non c'è niente da
  // spiegare, e allora la riga è quella di sempre.
  const daDove = didascaliaListino(listino)
  const nome = nomeRiga(riga)
  // Un fornitore già usato per QUESTO prodotto in QUESTO ordine non si può
  // riscegliere: due righe uguali sono un doppione, e un doppione si paga
  // due volte (Flavio, 26/08).
  const usati = fornitoriGiaUsati(
    scelte.filter((s) => s.key !== riga.key),
    riga.item_id
  )
  // I listini di QUESTO prodotto: servono ai due suggerimenti della scheda.
  const altriListini = righeDiProdotto(item, listini)
  const ultimo = altriListini.length > 1 ? fornitoreProposto(altriListini) : null
  const economica = altriListini.length > 1 ? piuEconomica(altriListini, { item }) : null
  const nomeFornitore = (id) => suppliers.find((s) => s.id === id)?.name || '—'
  // Quello che si legge nel campo: la cifra scritta a mano se c'è — anche
  // mentre la si sta cancellando, o il campo non si potrebbe svuotare per
  // riscriverlo — se no il conto pezzi × listino.
  const totale = sel?.totale ?? (scelta && scelta.qty > 0 ? String(arrotonda(scelta.totale)) : '')

  // Quello che il tocco sulla riga NON deve prendere: i campi che si
  // scrivono, la tendina del fornitore e il tasto che apre la scheda. Se no
  // scriverci dentro toglierebbe il prodotto dall'ordine — ed è proprio il
  // gesto che si fa subito dopo averlo aggiunto.
  function tocca(e) {
    if (e.target.closest('input, select, textarea, button, label, a')) return
    onSpunta(riga, !sel)
  }

  const campoFornitore = (dettaglio) => (
    <select
      aria-label={`Fornitore per ${nome}${dettaglio ? ' nella scheda' : ''}`}
      value={supplierId || ''}
      onChange={(e) => onFornitore(riga, e.target.value)}
    >
      <option value="">— Nessun fornitore —</option>
      {suppliers.map((s) => (
        <option key={s.id} value={s.id} disabled={usati.has(s.id)}>
          {s.name}{usati.has(s.id) ? ' (già in questo ordine)' : ''}
        </option>
      ))}
    </select>
  )
  // SI ORDINA NELL'UNITÀ IN CUI QUEL FORNITORE VENDE (REQ-MAG-040): cartoni
  // da chi vende a cartoni, pezzi da tutti gli altri. Il nome del campo lo
  // dice, perché «8» su una riga a cartoni sono 192 bottiglie e chi scrive
  // deve saperlo mentre lo scrive, non dopo.
  const campoPezzi = (dettaglio) => (
    <input
      type="number"
      step="1"
      min="0"
      inputMode="numeric"
      aria-label={`${aCollo ? 'Colli' : 'Pezzi'} di ${nome}${dettaglio ? ' nella scheda' : ''}`}
      value={sel?.qty ?? ''}
      placeholder={aCollo ? 'colli' : 'pz'}
      onChange={(e) => onQta(riga, e.target.value)}
    />
  )
  const campoTotale = (dettaglio) => (
    <input
      type="number"
      step="0.01"
      min="0"
      inputMode="decimal"
      aria-label={`Totale di ${nome}${dettaglio ? ' nella scheda' : ''}`}
      value={totale}
      placeholder="€"
      onChange={(e) => onTotale(riga, e.target.value)}
    />
  )

  return (
    <div
      className={`inv-row${aperta ? ' open' : ''}${sel ? ' ordine-riga-scelta' : ''}`}
      style={{ borderLeftColor: riga.colore || undefined }}
    >
      {/* IL TOCCO SULLA RIGA AGGIUNGE E TOGLIE (REQ-MAG-036): «in pratica
          basta che tocco la riga». Si compone un ordine passando in rassegna
          decine di prodotti, e centrare una casella piccola decine di volte è
          il tipo di fatica che non si nota finché non la si fa.
          LA CASELLA RESTA, ed è voluto: è lei a portare ruolo e stato per chi
          legge con la tastiera o con un lettore di schermo — «Ordina Bjorne,
          casella di controllo, selezionata» — e a farsi premere con lo spazio.
          Qui sopra c'è solo un bersaglio più grande per il dito. Un `div`
          cliccabile al suo posto sarebbe un gesto che col tabulatore non
          esiste e che nessuno annuncia. */}
      <div className="inv-row-main ordine-riga-tocco" onClick={tocca}>
        {/* La spunta si tocca in piedi: il bersaglio è l'etichetta, alta
            quanto la riga, non il quadratino da venti pixel. */}
        <label className="ordine-spunta">
          <input
            type="checkbox"
            aria-label={`Ordina ${nome}`}
            checked={!!sel}
            onChange={(e) => onSpunta(riga, e.target.checked)}
          />
        </label>
        <span className="inv-row-name">
          {riga.item_name}
          {assortimentoDi(item) === 'out' && (
            <span className="muted small"> fuori linea</span>
          )}
          {/* Il fornitore accanto al nome si vede solo dove la sua colonna
              non c'è (telefono): due righe dello stesso Campari, senza,
              sarebbero identiche. */}
          <span className="muted small ordine-nome-fornitore" aria-hidden>
            {riga.supplier_name || 'senza fornitore'}
          </span>
        </span>
        <span className="muted small ordine-scorta">
          <span className={`dot dot-${st}`} aria-hidden /> {ETICHETTA_SCORTA[st]}
        </span>
        {campoFornitore(false)}
        {/* IL PREZZO DEL PEZZO STA SEMPRE IN COLONNA, ed è la difesa che vale
            più di tutte le altre: è il numero che una persona riconosce a
            colpo d'occhio, e un gin che risulta costare 0,80 € si vede
            subito. Sotto, da dove è uscito — il prezzo come il fornitore
            l'ha scritto, il collo dove c'è — perché per correggere un numero
            sbagliato bisogna sapere da quale è venuto.
            Se il conto non si può fare non esce un numero: esce il perché. */}
        <span className="inv-cell-num muted ordine-prezzo">
          {prezzoPezzo != null ? formatPrice(prezzoPezzo) : '—'}
          {daDove && <span className="small ordine-collo">{daDove}</span>}
          {problema && (
            <span className="small ordine-collo ordine-prezzo-guasto" title={problema}>
              prezzo da sistemare
            </span>
          )}
        </span>
        <span className="inv-cell-num ordine-quanti">
          {campoPezzi(false)}
          {/* I pezzi che entrano davvero in magazzino: due cartoni non sono
              due bottiglie, e la moltiplicazione non si fa a mente. */}
          {aCollo && Number(sel?.qty) > 0 && (
            <span className="muted small ordine-collo">= {Number(sel.qty) * perCollo} pz</span>
          )}
        </span>
        {campoTotale(false)}
        <button
          type="button"
          className="btn ghost small ordine-apri"
          aria-label={`Apri la scheda di ${nome}`}
          aria-expanded={aperta}
          onClick={onApri}
        >
          {aperta ? '▾' : '▸'}
        </button>
      </div>

      {/* LA RIGA CHE SI APRE: «mi dirà anche le info di quel prodotto — se in
          assortimento, out, in linea eccetera, quante scorte ho ancora in
          magazzino — più la possibilità di modificare gli stessi campi che
          modificherei inline sulla riga stessa». Le stesse cose, due strade:
          in linea per chi sa già cosa vuole, aperta per chi deve guardare
          prima di decidere. */}
      {aperta && (
        <div className="inv-row-dettaglio">
          <div className="muted small">
            {ETICHETTA_ASSORTIMENTO[assortimentoDi(item)]} · {ETICHETTA_SCORTA[st]}
          </div>
          <div className="muted small">
            In casa: {formatQty(item.stock, item.unit)}
            {Number(item.low_threshold) > 0
              ? ` · soglia ${formatQty(item.low_threshold, item.unit)}`
              : ''}
            {contenutoDelPezzo(item) ? ` · 1 pz = ${contenutoDelPezzo(item)}` : ''}
          </div>
          <div className="muted small">
            {prezzoPezzo != null
              ? `Listino ${formatPrice(prezzoPezzo)}/pz`
              : 'Nessun prezzo di listino'}
            {/* Per esteso: com'è scritto il listino di quel fornitore. Chi
                controlla la bolla cerca la cifra che c'è sul documento, non
                quella che l'app ha ricavato (REQ-MAG-040). */}
            {daDove ? ` · ${daDove}` : ''}
            {riga.package_label ? ` · ${riga.package_label}` : ''}
            {riga.code ? ` · codice ${riga.code}` : ''}
          </div>
          {problema && <div className="muted small">Prezzo da sistemare: {problema}</div>}
          {/* La riga scelta si rilegge per intero: quanti colli, quanti pezzi
              ne escono, quanto costa. È il conto che va sbagliato di venti
              volte se si moltiplicano i pezzi per il prezzo del collo. */}
          {scelta && scelta.qty > 0 && (
            <div className="muted small">
              In ordine: {etichettaQuantita(scelta)} · {formatPrice(scelta.totale)}
            </div>
          )}
          {/* CHI LO VENDE, E A QUANTO (REQ-MAG-029). Il fornitore proposto è
              quello dell'ULTIMO ACQUISTO; il più economico si MOSTRA e non si
              sceglie, perché il prezzo più basso in archivio è quasi sempre
              il più vecchio — nessuno aggiorna al rialzo il listino di un
              fornitore da cui non compra più. In tabella non ci stavano:
              stanno qui, che è dove si guarda prima di decidere. */}
          {altriListini.length > 1 && (
            <div className="muted small">
              Su {altriListini.length} listini
              {ultimo ? ` · ultimo acquisto ${nomeFornitore(ultimo.supplier_id)}` : ''}
              {/* Al pezzo, sempre: fra 1,23 a bottiglia e 25,05 al cartone da
                  24 il più economico è il cartone, e confrontando i due
                  numeri come sono scritti sembrerebbe il contrario. */}
              {economica
                ? ` · più economico ${nomeFornitore(economica.supplier_id)} a ${formatPrice(prezzoAlPezzo(economica, item))}/pz`
                : ''}
            </div>
          )}
          <div className="ordine-campi-scheda">
            <span className="grow">
              <label>Fornitore</label>
              {campoFornitore(true)}
            </span>
            <span>
              <label>{aCollo ? 'Colli' : 'Pezzi'}</label>
              {campoPezzi(true)}
            </span>
            <span>
              <label>Totale</label>
              {campoTotale(true)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// Il totale mostrato nel campo è in centesimi tondi: è una cifra che si
// legge e si corregge, non il risultato di una divisione con sei decimali.
const arrotonda = (n) => Math.round((Number(n) || 0) * 100) / 100
