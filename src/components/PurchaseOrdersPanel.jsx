import { useEffect, useMemo, useState } from 'react'
import {
  fetchInventoryItems,
  fetchSuppliers,
  fetchSupplierPrices,
  createPurchaseOrder,
  confermaOrdine,
  chiudiOrdine,
  registraMovimentoOrdine,
  fetchPurchaseOrders,
  consegnaRigheOrdine,
  segnaInAssortimento,
  liberaDaAssortimento,
  togliRigaOrdine,
  deletePurchaseOrder,
  fetchSupplierInvoices,
  collegaFatturaAFetta,
  generaFatturaDaOrdine,
  segnaFatturaPagata,
  allineaPrezziDaFattura,
  fetchModelliOrdine,
  salvaModelloOrdine,
  eliminaModelloOrdine,
} from '../lib/api.js'
import { righeModelloDaOrdine } from '../lib/modelliOrdine.js'
import { magazzinoBloccato } from '../lib/inventory.js'
import { purchaseOrderText } from '../lib/warehouse.js'
import { printOrdineFornitore } from '../lib/printer.js'
import { toastSuccess, toastError } from '../lib/toast.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import NuovoOrdinePanel from './NuovoOrdinePanel.jsx'
import OrdiniListaPanel from './OrdiniListaPanel.jsx'

// ── ORDINI FORNITORE: LA STANZA DEI DATI E DEI GESTI ─────────────────
//
// Le schermate sono due, e da REQ-MAG-038 sono due SOTTOSEZIONI: «Nuovo
// ordine» è la composizione (`NuovoOrdinePanel`, REQ-MAG-036) e «Lista
// ordini» è lo storico filtrabile (`OrdiniListaPanel`). Questo pannello non
// disegna niente di suo: legge i dati una volta e tiene i GESTI, perché sono
// gli stessi da tutte e due le parti — un ordine si crea di là e si modifica
// di qua, ma il magazzino che si muove è lo stesso.
//
// I dati si leggono una volta sola e si passano giù: magazzino, fornitori e
// listini servono a tutte e due, e leggerli due volte vorrebbe dire due
// versioni della stessa serata a schermo nello stesso momento.
//
// NIENTE `await` PRIMA DI MOSTRARE L'ESITO. Ogni gesto qui sotto compone il
// risultato in memoria e manda la scrittura in sottofondo: con la cassa
// offline un'attesa su Firestore non torna mai, e il tasto resterebbe
// premuto senza che succeda niente.
export default function PurchaseOrdersPanel({ vista = 'nuovo' }) {
  const [suppliers, setSuppliers] = useState([])
  const [items, setItems] = useState([])
  const [listini, setListini] = useState([])
  const [orders, setOrders] = useState([])
  // I documenti servono a dire, ordine per ordine, se la fattura c'è
  // (REQ-MAG-031) e se è stata pagata (REQ-MAG-038): «pagato» non è un dato
  // dell'ordine, è una domanda alla sua fattura.
  const [invoices, setInvoices] = useState([])
  // I MODELLI D'ORDINE (REQ-MAG-039): servono da tutte e due le parti — si
  // salvano componendo, e da un ordine già fatto — quindi stanno qui come
  // tutto il resto.
  const [modelli, setModelli] = useState([])
  const [error, setError] = useState(null)

  const [togliFor, setTogliFor] = useState(null) // { ordine, indice, riga, fetta }

  async function load() {
    try {
      const [sups, its, list, ords, fatt, mod] = await Promise.all([
        fetchSuppliers(),
        fetchInventoryItems(),
        // La schermata deve reggere anche con ZERO listini: sono da
        // compilare a mano e nessuno ha ancora cominciato.
        fetchSupplierPrices().catch(() => []),
        fetchPurchaseOrders(),
        // E deve reggere anche se lo scadenzario non risponde: gli ordini
        // sono la cosa che serve sempre, il documento è un di più.
        fetchSupplierInvoices({ limit: 200 }).catch(() => []),
        // E anche senza modelli si ordina: sono una comodità, non un dato
        // senza il quale la schermata non ha senso.
        fetchModelliOrdine().catch(() => []),
      ])
      setSuppliers(sups)
      setItems(its)
      setListini(list)
      setOrders(ords)
      setInvoices(fatt)
      setModelli(mod)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // IL MAGAZZINO IN SOLA LETTURA VALE ANCHE QUI. Finché il travaso non è
  // fatto, il carico scriverebbe pezzi su giacenze ancora in centilitri: il
  // buco di BUG-029, che questa schermata aveva perché il blocco viveva
  // dentro la schermata del magazzino. La regola sta in inventory.js, e la si
  // chiede — non la si riscrive.
  const bloccato = useMemo(() => magazzinoBloccato(items), [items])

  const rimpiazza = (o) => setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x)))

  // ── UN ORDINE PER FORNITORE (REQ-MAG-037) ──────────────────
  //
  // Il riepilogo conferma un fornitore per volta, e ogni conferma è un
  // documento suo. Niente `await` e niente ricarica: l'ordine si compone in
  // memoria e si infila in cima alla lista.
  //
  // ED È QUI CHE I PRODOTTI PASSANO IN ASSORTIMENTO, non un momento prima:
  // «va in assortimento SOLO DOPO CHE FLAVIO HA CREATO L'ORDINE». Gli
  // articoli li abbiamo già in mano, quindi non si rilegge niente.
  //
  // MA UNA BOZZA NON TOCCA NIENTE (REQ-MAG-038): è l'unico stato che non fa
  // niente, e in assortimento ci si va alla conferma — che per una bozza
  // arriva dopo, dalla Lista ordini.
  function creaOrdine(fetta, { bozza = false } = {}) {
    setError(null)
    return Promise.resolve(
      createPurchaseOrder({
        supplier_id: fetta.supplier_id ?? null,
        supplier_name: fetta.supplier_name ?? '',
        lines: fetta.lines,
        total_net: fetta.totali.net,
        total_gross: fetta.totali.gross,
        bozza,
      })
    ).then(
      (ordine) => {
        if (!ordine?.id) return null
        setOrders((prev) => [ordine, ...prev])
        if (!bozza) inAssortimento(ordine)
        return ordine
      },
      (e) => {
        setError(e.message)
        return null
      }
    )
  }

  // I prodotti di un ordine passano in assortimento. Gli articoli sono già
  // quelli in mano alla schermata: nessuna lettura in mezzo a un gesto.
  function inAssortimento(ordine) {
    const articoli = (ordine.lines || [])
      .map((l) => items.find((i) => i.id === l.item_id))
      .filter(Boolean)
    const aggiornati = segnaInAssortimento(articoli, ordine.id)
    if (aggiornati.length > 0)
      setItems((prev) => prev.map((i) => aggiornati.find((a) => a.id === i.id) || i))
  }

  // LA BOZZA CHE PARTE. È il momento in cui l'ordine diventa una cosa che
  // esiste anche per il fornitore, quindi è qui che i suoi prodotti passano
  // in assortimento — non alla creazione, che per una bozza non vuol dire
  // ancora niente.
  function conferma(ordine) {
    setError(null)
    try {
      const agg = confermaOrdine(ordine)
      rimpiazza(agg)
      inAssortimento(agg)
    } catch (e) {
      setError(e.message)
    }
  }

  // TOGLIERE UN ITEM DA UN ORDINE GIÀ FATTO (REQ-MAG-037): è una delle due
  // sole strade per far uscire un prodotto da «in assortimento». L'esito si
  // vede subito — l'ordine si ricompone in memoria.
  function togliRiga() {
    const { ordine, indice } = togliFor
    setTogliFor(null)
    setError(null)
    togliRigaOrdine(ordine.id, { indice }).then(
      ({ ordine: agg, articolo }) => {
        rimpiazza(agg)
        if (articolo)
          setItems((prev) => prev.map((i) => (i.id === articolo.id ? articolo : i)))
      },
      (e) => setError(e.message)
    )
  }

  // LA CONSEGNA CARICA IL MAGAZZINO SULLE QUANTITÀ RICEVUTE (REQ-MAG-038) e
  // fa uscire i prodotti da «in assortimento»: è il momento in cui l'ordine
  // finisce. `consegnaRigheOrdine` compone l'ordine aggiornato in memoria e
  // le scritture partono in sottofondo.
  function consegna(ordine, { indici, prezzi, quantita }) {
    setError(null)
    consegnaRigheOrdine(ordine.id, { indici, prezzi, quantita }).then(
      (o) => rimpiazza(o),
      (e) => setError(e.message)
    )
  }

  // ATTACCARE E STACCARE SONO LO STESSO GESTO AL CONTRARIO, e passano dalla
  // stessa strada: `order_id` a null stacca. Il legame resta scritto in un
  // posto solo, sulla fattura (REQ-MAG-031); nella storia dell'ordine ne
  // resta la riga di diario, che è un'altra cosa dal dato.
  function collega(ordine, invoiceId, fatturaAttuale = null) {
    setError(null)
    const id = invoiceId || fatturaAttuale?.id
    if (!id) return
    collegaFatturaAFetta(id, { order_id: invoiceId ? ordine.id : null }).then(
      (agg) => {
        setInvoices((prev) => prev.map((f) => (f.id === agg.id ? agg : f)))
        rimpiazza(
          registraMovimentoOrdine(
            ordine,
            invoiceId ? 'fattura_collegata' : 'fattura_scollegata',
            invoiceId ? { numero: agg.number || null } : null
          )
        )
      },
      (e) => setError(e.message)
    )
  }

  // LA FATTURA GENERATA DALL'ORDINE, e la stessa strada per «Nessun
  // documento»: non esiste pagare un fornitore senza una riga nello
  // scadenzario, se no quei soldi sarebbero gli unici a non comparire nel
  // totale del mese (REQ-MAG-038).
  function genera(ordine, opzioni) {
    setError(null)
    try {
      const fattura = generaFatturaDaOrdine(ordine, opzioni)
      setInvoices((prev) => [fattura, ...prev])
      rimpiazza(
        registraMovimentoOrdine(ordine, 'fattura_generata', { importo: fattura.amount })
      )
    } catch (e) {
      setError(e.message)
    }
  }

  // PAGATO SI SCRIVE SULLA FATTURA, sempre: è lì che stanno anche il filtro
  // «solo da pagare» dello scadenzario e il totale del mese.
  function pagata(fattura, paid) {
    setError(null)
    try {
      const agg = segnaFatturaPagata(fattura, paid)
      setInvoices((prev) => prev.map((f) => (f.id === agg.id ? agg : f)))
    } catch (e) {
      setError(e.message)
    }
  }

  // IL PREZZO DEL DOCUMENTO ALLINEA IL LISTINO (REQ-MAG-035): mostrare la
  // differenza e lasciare il listino fermo farebbe ricomparire lo stesso
  // scarto al giro dopo, e l'avviso diventerebbe rumore.
  function allinea(ordine, fattura) {
    setError(null)
    allineaPrezziDaFattura(ordine, fattura).then(
      (agg) => {
        rimpiazza(agg)
        toastSuccess('Listino allineato al documento')
      },
      (e) => setError(e.message)
    )
  }

  // ── I MODELLI D'ORDINE (REQ-MAG-039) ───────────────────────────────
  //
  // Salvare non aspetta la rete: il modello si compone in memoria e compare
  // in tendina nell'istante in cui si tocca «Salva». Con l'`id` di uno che
  // c'è già lo si aggiorna — è la stessa strada per cambiargli le righe e per
  // rinominarlo — e la lista si ricompone al posto di rileggersi, che offline
  // risponderebbe col passato.
  function salvaModello({ id = null, nome, righe }) {
    setError(null)
    try {
      const modello = salvaModelloOrdine({ id, nome, righe })
      setModelli((prev) => {
        const senza = prev.filter((m) => m.id !== modello.id)
        return [...senza, modello].sort((a, b) => a.nome.localeCompare(b.nome, 'it-IT'))
      })
      toastSuccess(`Modello «${modello.nome}» salvato`)
      return modello
    } catch (e) {
      setError(e.message)
      return null
    }
  }

  // «SALVA QUESTO COME MODELLO» DALLA LISTA ORDINI. Un ordine è di un
  // fornitore solo (REQ-MAG-037), quindi ne esce un modello di un fornitore
  // solo: il giro intero si rifà applicandone più d'uno, perché applicare
  // SOMMA a quello che è già selezionato.
  const salvaModelloDaOrdine = (ordine, nome) =>
    salvaModello({ nome, righe: righeModelloDaOrdine(ordine) })

  function eliminaModello(id) {
    setError(null)
    eliminaModelloOrdine(id)
    setModelli((prev) => prev.filter((m) => m.id !== id))
  }

  function chiudi(ordine) {
    setError(null)
    try {
      rimpiazza(chiudiOrdine(ordine))
    } catch (e) {
      setError(e.message)
    }
  }

  // Invia l'ordine di quel fornitore. La fetta ha la stessa forma di un
  // ordine, quindi testo e stampa non cambiano di una riga.
  function inviaEmail(fetta) {
    const body = purchaseOrderText(fetta)
    window.location.href = `mailto:${encodeURIComponent(fetta.email || '')}?subject=${encodeURIComponent(
      `Ordine ${fetta.supplier_name || ''} — ${String(fetta.created_at || '').slice(0, 10)}`
    )}&body=${encodeURIComponent(body)}`
  }

  async function copia(fetta) {
    try {
      await navigator.clipboard.writeText(purchaseOrderText(fetta))
      toastSuccess('Ordine copiato negli appunti')
    } catch (e) {
      toastError(`Copia non riuscita: ${e.message}`)
    }
  }

  async function remove(order) {
    if (!confirm(`Eliminare l'ordine del ${order.created_at?.slice(0, 10)}?`)) return
    try {
      await deletePurchaseOrder(order.id)
      setOrders((prev) => prev.filter((o) => o.id !== order.id))
      // L'ordine cancellato libera i suoi prodotti (REQ-MAG-037): senza,
      // resterebbero «in arrivo» da un ordine che non esiste più.
      const articoli = (order.lines || [])
        .map((l) => items.find((i) => i.id === l.item_id))
        .filter(Boolean)
      const aggiornati = liberaDaAssortimento(articoli, order.id)
      if (aggiornati.length > 0)
        setItems((prev) => prev.map((i) => aggiornati.find((a) => a.id === i.id) || i))
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      {error && <div className="banner">Errore: {error}</div>}

      {/* Gli ordini si scrivono lo stesso — sono carta, non giacenze — ma la
          merce non si può ancora caricare. Dirlo qui, e non solo sul tasto:
          un tasto spento su un tablet non ha nessun posto dove far leggere
          il perché. */}
      {bloccato && (
        <div className="banner">
          <strong>Il magazzino va aggiornato.</strong> Gli ordini si possono
          preparare e mandare; per <strong>caricare la merce</strong> serve
          prima l’aggiornamento, dal <strong>Magazzino</strong> (il banner in
          alto). Se no si sommerebbero pezzi a giacenze scritte alla vecchia
          maniera, e i numeri non tornerebbero più.
        </div>
      )}

      {vista === 'lista' ? (
        <OrdiniListaPanel
          ordini={orders}
          fatture={invoices}
          suppliers={suppliers}
          bloccato={bloccato}
          onConferma={conferma}
          onConsegna={consegna}
          onTogliRiga={(ordine, dati) => setTogliFor({ ordine, ...dati })}
          onCollega={collega}
          onGenera={genera}
          onPagata={pagata}
          onAllinea={allinea}
          onChiudi={chiudi}
          onElimina={remove}
          onEmail={inviaEmail}
          onCopia={copia}
          onSalvaModello={salvaModelloDaOrdine}
          onStampa={(fetta) =>
            printOrdineFornitore(fetta).catch((e) => toastError(`Stampa: ${e.message}`))
          }
        />
      ) : (
        <NuovoOrdinePanel
          items={items}
          suppliers={suppliers}
          listini={listini}
          onCrea={creaOrdine}
          modelli={modelli}
          onSalvaModello={salvaModello}
          onEliminaModello={eliminaModello}
        />
      )}

      {togliFor && (
        <ConfirmDialog
          title="Togliere il prodotto dall’ordine?"
          message={`«${togliFor.riga.name}» esce dall’ordine di ${togliFor.fetta?.supplier_name || 'questo fornitore'} e torna allo stato che aveva prima: non risulta più in arrivo.`}
          confirmLabel="Togli dall’ordine"
          onCancel={() => setTogliFor(null)}
          onConfirm={togliRiga}
        />
      )}
    </div>
  )
}
