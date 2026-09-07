import { useEffect, useMemo, useRef, useState } from 'react'
import {
  registerPayment,
  markOrderPaid,
  setOrderDiscount,
  setOrderLotteryCode,
  createInvoice,
  markInvoiceSent,
  subscribeVouchers,
  applyVoucherDiscount,
  segnaScontrinoStampato,
} from '../lib/api.js'
import { readerCheckout } from '../lib/paymentsApi.js'
import { formatPrice, PAYMENT_METHOD_LABELS } from '../lib/orderStatus.js'
import { useOnline } from '../lib/useOnline.js'
import { useResizable } from '../lib/useResizable.js'
import { allServed } from '../lib/comande.js'
import { activeVouchers } from '../lib/vouchers.js'
import { printScontrino, printScontrinoAcconto, printFattura, loadPrinterSettings, aliquotaScontrino, claimReceiptPrint, reclaimReceiptPrint, releaseReceiptPrint, scontrinoGiaUscito } from '../lib/printer.js'
import { accontoDaStampare, tastoAcconto } from '../lib/scontrinoAcconto.js'
import { moduloAttivo } from '../lib/licenza.js'
import { showToast, toastError } from '../lib/toast.js'
import {
  remainingItems,
  paidAmount,
  orderDue,
  scontoEccessivo,
  selectionAmount,
  discountAmount,
  discountAfterChange,
  lordoSelezione,
  scontoInPreparazione,
  scontiDelConto,
  paymentCloses,
  round2,
  dettaglioIncassi,
  unitaDaConteggio,
  selezioneVergine,
  selezioneDopoTocco,
  selezioneTotale,
} from '../lib/pagamento.js'

// ── Schermata Pagamento in stile POS SumUp (vedi foto di riferimento) ──
// SINISTRA: gli articoli del conto (selezionabili per lo split) e il
// riepilogo Pagato / Ammontare dovuto / Totale. CENTRO: il display
// dell'importo da incassare con il TASTIERINO calcolatrice (C, /2, /3,
// operazioni) e il tasto "Riscuotere"; sotto, il Preconto. DESTRA: i
// metodi di pagamento (Contante / lettore SumUp) e lo Sconto in basso.

// Selezione "tutto il conto": la schermata si apre con ogni articolo già
// in pagamento; si deseleziona solo per lo split del tavolo.
// La selezione è per RIGA (`key`), non per prodotto: lo stesso prodotto può
// stare su più righe, e muoverne una non deve muovere l'altra.
const fullSelection = (order) => selezioneTotale(remainingItems(order), true).sel

// SI RIENTRA SULLE RIGHE DELLO SCONTO. Lo sconto in preparazione è stato
// deciso su certe righe (`discount_items`): riaprendo la schermata con tutto
// selezionato, il primo sguardo lo ricalcolerebbe su tutto il conto e chi
// l'aveva preparato non lo riconoscerebbe più. Senza sconto in ballo — che è
// quasi sempre — si parte da tutto il conto, come si è sempre fatto.
const selezioneIniziale = (order) => {
  const righe = order?.discount_items
  if (!Array.isArray(righe) || righe.length === 0) return fullSelection(order)
  const sel = {}
  for (const r of remainingItems(order)) {
    const s = righe.find((x) => (x.key && r.key ? x.key === r.key : x.drink_id === r.drink_id))
    sel[r.key] = s ? Math.min(Number(s.qty) || 0, r.qty) : 0
  }
  return Object.values(sel).some((q) => q > 0) ? sel : fullSelection(order)
}

// Le righe come vanno scritte sul conto o dentro un pagamento: il minimo che
// serve a dire su che cosa cadeva lo sconto.
const righeSconto = (selection) =>
  selection.map((r) => ({
    key: r.key,
    drink_id: r.drink_id ?? null,
    name: r.name,
    qty: r.qty,
    unit_price: r.unit_price,
  }))

// Due selezioni sono la stessa? Serve a non riscrivere lo sconto a ogni
// respiro del componente.
const firmaRighe = (righe) =>
  (righe || [])
    .map((r) => `${r.key ?? r.drink_id}:${r.qty}`)
    .sort()
    .join('|')

// Il display del tastierino lavora in CENTESIMI digitati ("350" → 3,50 €).
const toDigits = (euro) => String(Math.max(0, Math.round(euro * 100)))
const digitsToEuro = (s) => (parseInt(s || '0', 10) || 0) / 100

// `resolveOrderId` (opzionale): quando la schermata si apre PRIMA che
// l'ordine esista sul server (pagamento diretto dal POS), le azioni
// aspettano qui l'id reale — la UI intanto è già piena e reattiva.
export default function PaymentScreen({ order: orderProp, settings, onClose, onPaid, onBeforePay, onError, resolveOrderId }) {
  const online = useOnline()
  // Chiusura per pagamento COMPLETATO (non semplice annulla): chiude e avvisa
  // il chiamante, che può tornare alla coda ordini.
  // `incasso` = { amount, method } appena registrato. Serve per lo SCONTRINO:
  // la registrazione va in background, quindi in questo istante l'ordine non
  // sa ancora com'è stato pagato — e lo scontrino usciva "Contante" anche per
  // una carta di credito. Qui glielo si dice.
  const closePaid = (incasso = null, { senzaStampa = false } = {}) => {
    const perStampa = incasso
      ? {
          ...order,
          payments: [
            ...(order.payments || []),
            { amount: incasso.amount, method: incasso.method, at: new Date().toISOString() },
          ],
          payment_method: incasso.method,
        }
      : order
    // Scontrino alla CHIUSURA del conto (se l'auto-stampa è attiva): prima
    // partiva solo quando l'ordine passava a "pronto", quindi con la gestione
    // preparazione spenta non usciva mai.
    try {
      // LO SCONTRINO ESCE DAL GESTO, SEMPRE E SOLO DA QUI (BUG-055). Non è
      // più la coda a stamparlo quando vede un conto pagato: quello faceva
      // uscire la carta di tutta la serata al primo sguardo di un browser
      // nuovo. Qui c'è il gesto, quindi qui esce.
      // Con un INCASSO in mano la pretesa si FORZA (reclaim): questo è un
      // pagamento che sta succedendo adesso, e se il conto era stato chiuso
      // e riaperto la copia vecchia non conta più. Senza incasso (chiusure
      // d'ufficio) vale la pretesa normale: una copia e basta.
      if (
        order.daily_number != null &&
        // «Riscuoti (senza stampa)»: il gesto dice esplicitamente che la
        // carta non serve — cliente che rifiuta lo scontrino di cortesia,
        // conto interno. Non si prende nemmeno la pretesa: se il conto
        // verrà riaperto e riscosso normale, la stampa esce come sempre.
        !senzaStampa &&
        loadPrinterSettings().autoPrintScontrino &&
        // Il segno sta SUL DATO: un altro terminale l'ha già stampato e qui
        // non esce la seconda copia.
        !scontrinoGiaUscito(order)
      ) {
        if (order.id) {
          if (incasso ? reclaimReceiptPrint(order.id) : claimReceiptPrint(order.id)) {
            printScontrino(perStampa)
              // Il segno sul conto va scritto A CARTA USCITA: prima vorrebbe
              // dire che una stampa fallita zittisce tutti i terminali.
              .then(() => segnaScontrinoStampato(order.id))
              .catch((e) => {
                console.warn('[printer] scontrino:', e.message)
                // La carta non è uscita: la prenotazione torna libera, così la
                // prossima chiusura ci riprova. Vedi BUG-047.
                releaseReceiptPrint(order.id)
                onError?.(`Scontrino non stampato: ${e.message}`)
              })
          }
        } else {
          // PAGAMENTO DIRETTO DAL POS: la schermata si è aperta su un guscio
          // locale (id nullo) mentre il conto nasce in sottofondo. La carta
          // non aspetta che nasca — esce adesso, col numero che la testata
          // mostra già — e la pretesa e il segno la raggiungono appena c'è
          // un id da segnare. Prima toccava alla coda stampare questo caso:
          // era l'unico legittimo, e per tenerlo si stampava tutto il resto.
          printScontrino(perStampa)
            .then(() =>
              Promise.resolve(orderId())
                .then((id) => {
                  if (!id) return
                  claimReceiptPrint(id) // la copia di questo conto è uscita da qui
                  segnaScontrinoStampato(id)
                })
                .catch(() => {
                  /* il conto non è nato: lo dice già il toast della creazione */
                })
            )
            .catch((e) => {
              console.warn('[printer] scontrino:', e.message)
              onError?.(`Scontrino non stampato: ${e.message}`)
            })
        }
      }
    } catch {
      /* stampante non configurata: si continua */
    }
    onPaid?.()
    onClose()
  }
  const [error, setError] = useState(null)
  // Sconto OTTIMISTICO: applicato subito a schermo, server in background.
  const [optimisticDisc, setOptimisticDisc] = useState(null) // { disc, amount, items }
  const order = useMemo(
    () =>
      optimisticDisc == null
        ? orderProp
        : {
            ...orderProp,
            discount: optimisticDisc.disc,
            discount_amount: optimisticDisc.amount,
            discount_items: optimisticDisc.items ?? null,
          },
    [orderProp, optimisticDisc]
  )
  // Quando il server ha recepito lo sconto, l'override locale si ritira.
  // ANCHE LE RIGHE DEVONO COMBACIARE, non solo l'importo: uno sconto dello
  // stesso valore su righe diverse è un altro sconto, e ritirandosi troppo
  // presto la schermata tornava a quelle di prima — poi il ricalcolo le
  // rimetteva a posto, e via così a ogni giro (schermata bloccata).
  useEffect(() => {
    if (
      optimisticDisc != null &&
      (orderProp.discount_amount || 0) === optimisticDisc.amount &&
      firmaRighe(orderProp.discount_items) === firmaRighe(optimisticDisc.items)
    ) {
      setOptimisticDisc(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderProp.discount_amount, orderProp.discount_items])
  const orderId = async () => (resolveOrderId ? await resolveOrderId() : order.id)
  const [saving, setSaving] = useState(false)
  const [sel, setSel] = useState(() => selezioneIniziale(order)) // riga -> quante unità pagare ora
  // QUALI unità, quando le righe uguali sono separate. Il conteggio dice
  // «due di questi tre»; separandole ognuna è una voce a sé e deve avere la
  // sua quantità — spegnendo la prima si spegne la prima, non le ultime
  // come farebbe un contatore che scende. Le due forme si convertono
  // (lib/pagamento.js) e restano allineate: il conteggio è quante ne sono
  // accese.
  const [selUnita, setSelUnita] = useState({})
  const unitaDi = (r) =>
    selUnita[r.key]?.length === r.qty ? selUnita[r.key] : unitaDaConteggio(r.qty, sel[r.key] ?? 0)
  // Vista SEPARATA delle righe uguali (al volo, come nel riepilogo ordine):
  // ogni unità è mostrata a sé e si sceglie fin dove pagare. Solo visuale: la
  // selezione resta per riga (sel[key] = quante unità di quella riga).
  //
  // SI PARTE SEPARATI. Al banco si paga quasi sempre a pezzi — uno paga il
  // suo, un altro offre due birre — e partire da «3× Birra» voleva dire un
  // tocco in più ogni volta, con la fila alla cassa. Chi ha un conto lungo
  // e illeggibile fa il contrario con «Unisci uguali», e chi incassa tutto
  // non tocca niente: la selezione parte piena in ogni caso.
  const [separati, setSeparati] = useState(true)
  const [method, setMethod] = useState('banco')
  // Tastierino: null = importo automatico (dalla selezione); altrimenti
  // la stringa di cifre digitata. `acc`/`op` per la calcolatrice.
  const [display, setDisplay] = useState(null)
  const [acc, setAcc] = useState(null)
  const [op, setOp] = useState(null)
  // Sconto: modale con tastierino (tipo % o €, cifre digitate).
  const [showDiscount, setShowDiscount] = useState(false)
  const [discType, setDiscType] = useState(order.discount?.type || 'percent')
  const [discDigits, setDiscDigits] = useState('')
  // Lotteria degli scontrini e fattura di cortesia.
  const [showLottery, setShowLottery] = useState(false)
  const [lotteryCode, setLotteryCode] = useState(order.lottery_code || '')
  const [showInvoice, setShowInvoice] = useState(false)
  const [invoice, setInvoice] = useState(null) // fattura appena emessa
  const [billing, setBilling] = useState({
    denominazione: '',
    piva: '',
    cf: '',
    sdi: '',
    indirizzo: '',
    email: '',
  })
  const [readerStarted, setReaderStarted] = useState(false)
  // Buoni VIP: elenco e beneficiario scelto per il pagamento col buono.
  const [vouchers, setVouchers] = useState([])
  const [voucherId, setVoucherId] = useState('')
  useEffect(() => subscribeVouchers(setVouchers, () => {}), [])
  const vipList = useMemo(() => activeVouchers(vouchers), [vouchers])
  const chosenVoucher = vipList.find((v) => v.id === voucherId) || null

  // Dopo ogni incasso registrato si riparte da "tutto il residuo" — o dalle
  // righe dello sconto ancora in preparazione, se ce n'è uno: è quello che
  // decide su che cosa cade, e ricalcolarlo su tutto il conto vorrebbe dire
  // cambiarlo alle spalle di chi l'aveva deciso.
  const paymentsCount = (order.payments || []).length
  useEffect(() => {
    setSel(selezioneIniziale(order))
    setSelUnita({})
    setDisplay(null)
    setAcc(null)
    setOp(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, paymentsCount])

  // LE TRE COLONNE SI RIDIMENSIONANO, come quelle del dettaglio ordine —
  // chiesto dall'utente il 21/08/2026, subito dopo il lavoro sullo zoom.
  // Stesso attrezzo del POS (useResizable): larghezza ricordata PER
  // TERMINALE, perché il tablet del banco e quello della sala non hanno lo
  // stesso schermo né lo stesso mestiere — al banco si guarda il
  // tastierino, in sala la lista delle voci.
  // I MINIMI NON SONO A OCCHIO. A sinistra 200px: sotto quella misura il
  // prezzo di una voce va a capo sotto il nome e la lista smette di
  // leggersi in colonna. A destra 170px: i metodi devono restare tutti
  // leggibili su una riga sola («Carta di Credito» è il più lungo), e
  // quella colonna non deve poter sparire — ci sono i tasti con cui si
  // sceglie come si incassa. I massimi (460 / 380) sono generosi ma finiti:
  // oltre, il centro comincia a stare stretto sul tablet del banco. Il
  // pavimento vero del centro però non sta qui: lo tiene il foglio, che
  // limita ogni colonna anche in percentuale (vedi .payscreen-items) — così
  // il tastierino resta grande abbastanza a QUALUNQUE zoom, che è
  // esattamente il guaio di BUG-075.
  const vociRz = useResizable('pay-items', { def: 340, min: 200, max: 460, side: 'right' })
  const metodiRz = useResizable('pay-methods', { def: 230, min: 170, max: 380, side: 'left' })

  const remaining = useMemo(() => remainingItems(order), [order])
  // LA LISTA PARTE DAL FONDO. Il conto lo si legge dall'ultima riga battuta:
  // aprendo il pagamento con quindici righe si vedevano le prime — quelle di
  // mezz'ora prima — e per controllare l'ultimo giro bisognava scorrere.
  const listaRef = useRef(null)
  // Di chi è questo conto: il tavolo se c'è, se no il nome. È la stessa
  // riga che la coda mette sulle card (destinazioneConto), e qui serve in
  // testata perché è così che si chiama un conto quando lo si incassa.
  const dove = [order.table_label ? `Tavolo ${order.table_label}` : '', order.customer_name]
    .filter(Boolean)
    .join(' · ')
  useEffect(() => {
    const el = listaRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [remaining.length])
  const paid = paidAmount(order)
  // Incassare non vuol dire aver consegnato: seguendo la preparazione il
  // conto resta aperto finché le comande non sono servite.
  const autoServeBase = settings?.workflow_enabled === false
  // Il tasto in più lo decide il locale (Impostazioni → Gestione
  // preparazione): serve dove si consegna e si incassa nello stesso gesto.
  const riscuotiEServi = settings?.riscuoti_e_servi === true
  // «Riscuoti (senza stampa)»: acceso dalle impostazioni del locale. Serve
  // dove capita spesso che lo scontrino di cortesia non lo voglia nessuno:
  // un tasto in più qui vale solo se quel caso è la normalità del locale.
  const riscuotiSenzaStampa = settings?.riscuoti_senza_stampa === true
  // La fattura di cortesia al cliente: funzione premium (lib/licenza.js).
  const fattureOn = moduloAttivo(settings, 'fatture')
  const due = orderDue(order)
  // Sconto più grande del conto: capita solo con la strategia "avvisa"
  // (Impostazioni → Sconto e righe del conto), quando si sconta e poi si
  // tolgono righe. Chiudere così significherebbe registrare un incasso che
  // non torna con niente: prima lo si sistema.
  const scontoFuoriMisura = scontoEccessivo(order)
  const served = allServed(order)
  const closed = order.payment_status === 'pagato'
  // LE DUE VIE ALTERNATIVE SI DECIDONO QUI, non nel JSX: la riga che le
  // ospita esiste solo se ce n'è almeno una, altrimenti sotto il tasto
  // grande resterebbe un contenitore vuoto con la sua aria.
  // Le condizioni restano INDIPENDENTI — sono due impostazioni diverse.
  const mostraSenzaStampa = !closed && riscuotiSenzaStampa && due > 0
  const mostraEServi = !closed && riscuotiEServi && !autoServeBase && !served
  // «Acconto con scontrino»: il terzo tasto. Acceso dal locale, e SOLO se
  // l'acconto automatico è spento — con quello acceso la carta esce da sé
  // e il tasto sarebbe una seconda strada per lo stesso foglio
  // (lib/scontrinoAcconto.js).
  const mostraAcconto = !closed && tastoAcconto(settings) && due > 0

  const selection = remaining
    .filter((r) => (sel[r.key] || 0) > 0)
    .map((r) => ({ ...r, qty: Math.min(sel[r.key], r.qty) }))
  // TUTTO IN RISCOSSIONE è anche la selezione «vergine»: finché è così, il
  // primo tocco su una voce restringe l'incasso a quella sola (vedi
  // `selezioneDopoTocco`). Una definizione sola per due cose che sono la
  // stessa cosa.
  const allSelected = selezioneVergine(remaining, sel)
  const splitting = !allSelected && selection.length > 0
  // Importo automatico: la selezione (o il residuo intero).
  const autoAmount =
    remaining.length === 0 || allSelected ? due : splitting ? selectionAmount(order, selection) : 0
  const manual = display !== null
  const amount = manual ? digitsToEuro(display) : autoAmount
  // Non si incassa mai oltre il dovuto: l'eccedenza digitata è il RESTO.
  const toPay = Math.min(round2(amount), due)
  const change = Math.max(0, round2(amount - due))
  // Questo incasso salda il conto? È la stessa domanda che `riscuoti` si fa
  // un istante dopo (`willClose`), e la fa la stessa funzione: il tasto
  // dell'acconto e la carta che esce non possono rispondere in modo diverso.
  const chiudeOra = paymentCloses(order, toPay)

  // ── LO SCONTO SEGUE LE RIGHE CHE SI STANNO RISCUOTENDO ──────────────
  //
  // «Se tolgo prodotti dalla schermata pagamento, lo sconto va applicato solo
  // sui prodotti che sto riscuotendo» (l'utente, 20/08). Quindi togliendo una
  // riga l'importo si rifà sulle righe rimaste: in percentuale è la sua
  // definizione, in euro decide la strategia del locale (tetto / proporzione /
  // avviso) — la stessa che governa un conto a cui si tolgono righe, e non se
  // ne scrive una seconda.
  //
  // Si riscrive anche sul conto, non solo a schermo: la selezione vive solo
  // qui dentro, mentre l'importo lo leggono la coda, l'altro tablet e il
  // webhook del lettore. Senza le righe accanto, quell'importo sarebbe un
  // numero di cui nessuno sa più il perché.
  const righeSelezionate = splitting ? righeSconto(selection) : null
  // NIENTE SELEZIONATO NON VUOL DIRE «TUTTO IL CONTO». `righeSelezionate` è
  // null in due casi opposti — tutto dentro e niente dentro — e per lo sconto
  // quei due non sono la stessa cosa. Prima questo stato si raggiungeva solo
  // spegnendo una riga per volta; con «Deseleziona tutti» è il punto di
  // partenza normale di ogni conto diviso, e va detto.
  const selezioneVuota = remaining.length > 0 && selection.length === 0
  const firmaSelezione = splitting ? firmaRighe(righeSelezionate) : ''
  // Il lordo su cui cade lo sconto: le righe scelte adesso, o tutto quello che
  // resta se non se n'è tolta nessuna.
  const baseSconto = lordoSelezione(order, righeSelezionate)
  const scontoPreparato = order.discount
  const scontoOra = scontoInPreparazione(order)
  useEffect(() => {
    // LO SCONTO PREPARATO RESTA SOSPESO, NON SI AZZERA E NON SI ALLARGA.
    // Con zero righe scelte non c'è niente su cui farlo cadere: ricalcolarlo
    // qui vorrebbe dire stenderlo su tutto il residuo (`righe` = null) alle
    // spalle di chi l'aveva deciso su tre voci — e con la strategia
    // «proporzione» farlo pure crescere. Buttarlo via sarebbe altrettanto
    // sbagliato: «Deseleziona tutti» è il gesto con cui si COMINCIA a
    // dividere un conto, non quello con cui si rinuncia allo sconto. Resta
    // dov'è, e appena si tocca la prima voce torna a seguire la selezione.
    if (closed || !scontoPreparato || !(scontoOra > 0) || selezioneVuota) return
    const righe = righeSelezionate
    if (firmaRighe(righe) === firmaRighe(order.discount_items)) return
    const buono = scontoPreparato.type === 'buono'
    // IL BUONO SI ACCORCIA E BASTA, con qualsiasi strategia: il credito è già
    // stato scalato al beneficiario, quindi se la selezione scende sotto il
    // valore del buono la differenza gli va RESTITUITA — e a farlo è
    // `applyVoucherDiscount`, che sa rimettere a posto il saldo. Lasciandolo
    // più grande di quello che paga, quel credito sarebbe bruciato per niente.
    const nuovo = buono
      ? Math.min(scontoOra, baseSconto)
      : discountAfterChange(
          {
            discount: scontoPreparato,
            prevAmount: scontoOra,
            prevTotal: lordoSelezione(order, order.discount_items || null),
            newTotal: baseSconto,
          },
          settings?.discount_policy
        )
    // Sotto zero non c'è più uno sconto: si toglie, e il buono torna intero
    // al beneficiario invece di restare appeso a un importo che non esiste.
    const aggiorna = async () => {
      const id = await orderId()
      if (buono && nuovo > 0) {
        return applyVoucherDiscount(id, scontoPreparato.voucher_id, nuovo, { items: righe })
      }
      return setOrderDiscount(id, nuovo > 0 ? scontoPreparato : null, { items: righe, amount: nuovo })
    }
    setOptimisticDisc({
      disc: nuovo > 0 ? (buono ? { ...scontoPreparato, value: nuovo } : scontoPreparato) : null,
      amount: nuovo,
      items: nuovo > 0 ? righe : null,
    })
    aggiorna().catch((e) => {
      setOptimisticDisc(null)
      toastError(`Sconto non aggiornato: ${e.message}`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaSelezione, splitting, selezioneVuota, scontoPreparato, scontoOra, closed])

  // Metodi come nella foto del POS: Contante, Carta di Credito (POS
  // esterno, si registra e basta) e SumUp (il lettore Solo, transazione
  // via Cloud API). SumUp è SEMPRE in lista: senza pairing è spento con
  // la nota su dove attivarlo (Impostazioni → Pagamenti).
  const readerReady = settings.payments_reader_enabled && settings.sumup_reader_id
  // Contante e carta si incassano anche SENZA RETE: la registrazione entra in
  // cache e si sincronizza dopo. Il lettore SumUp no — deve parlare con i suoi
  // server per autorizzare — quindi senza rete si spegne e lo dice, invece di
  // far aspettare il cassiere davanti a una transazione che non partirà.
  const senzaRete = !online
  const methods = [
    { key: 'banco', label: 'Contante', emoji: '💵' },
    { key: 'carta', label: 'Carta di Credito', emoji: '💳' },
    {
      key: 'lettore',
      label: 'SumUp',
      emoji: '📟',
      disabled: !readerReady || senzaRete,
      // Niente sottotitolo sul tasto: il motivo si legge SOLO se lo si tocca.
      // Scritto lì sotto stava sempre in mezzo, mangiava una riga a una
      // schermata che ne ha poche, e chi incassa non lo leggeva comunque.
      motivo: senzaRete
        ? '📶 Senza rete il lettore SumUp non può autorizzare: incassa e registra come Carta di Credito.'
        : 'Il lettore SumUp non è ancora configurato: si attiva in Impostazioni → Pagamenti.',
    },
  ]
  // Buono come SCONTO (non metodo di pagamento): si applica al totale e si
  // detrae dal saldo del beneficiario, anche parzialmente. Importo proposto:
  // il residuo, mai oltre il saldo o il totale.
  const voucherBalance = chosenVoucher ? round2(chosenVoucher.balance) : 0
  const voucherDefault = round2(Math.min(due, voucherBalance))
  const voucherReq = discDigits ? digitsToEuro(discDigits) : voucherDefault
  // Il buono non copre più delle righe che sta pagando: scalarne di più
  // brucerebbe credito del beneficiario per niente.
  const voucherRedeem = chosenVoucher
    ? round2(Math.min(voucherReq, voucherBalance, baseSconto))
    : 0

  async function run(fn) {
    setSaving(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Ogni tocco sulle righe passa da qui: etichetta, «+» e «−», vista unita e
  // vista separata. La regola («il primo tocco restringe, i successivi
  // aggiungono») sta tutta in `selezioneDopoTocco`, che è logica pura e si
  // prova a unità — qui si legge lo stato e si riscrive, e basta.
  const tocca = (r, gesto, indice = null) => {
    const st = selezioneDopoTocco({ sel, selUnita }, remaining, { riga: r, gesto, indice })
    setSel(st.sel)
    setSelUnita(st.selUnita)
  }

  // Tutte dentro o tutte fuori in un gesto solo. Non è una seconda regola di
  // selezione: riscrive lo stato ai due estremi e basta: il tocco riga per
  // riga resta quello di sempre.
  const portaTutte = (accesa) => {
    const st = selezioneTotale(remaining, accesa)
    setSel(st.sel)
    setSelUnita(st.selUnita)
  }

  // ── Tastierino ──
  const current = () => (display !== null ? digitsToEuro(display) : autoAmount)
  const key = (d) => setDisplay((s) => ((s === null ? '' : s) + d).slice(0, 8))
  const back = () =>
    setDisplay((s) => {
      const cur = s === null ? toDigits(autoAmount) : s
      const next = cur.slice(0, -1)
      return next.length ? next : '0'
    })
  const clear = () => {
    setDisplay(null)
    setAcc(null)
    setOp(null)
  }
  const divideBy = (n) => setDisplay(toDigits(round2(current() / n)))
  const setOperator = (o) => {
    setAcc(current())
    setOp(o)
    setDisplay('0')
  }
  const equals = () => {
    if (op === null || acc === null) return
    const b = current()
    const result =
      op === '+' ? acc + b : op === '-' ? acc - b : op === 'x' ? acc * b : b !== 0 ? acc / b : acc
    setDisplay(toDigits(round2(Math.max(0, result))))
    setAcc(null)
    setOp(null)
  }

  // «Riscuoti» e «Riscuoti e servi» sono lo stesso incasso: cambia solo se
  // le comande risultano servite — e quindi se il conto si chiude adesso.
  const riscuoti = ({ servi = false, senzaStampa = false, conAcconto = false } = {}) => {
    const autoServe = autoServeBase || servi
    const items = !manual && splitting ? selection : null
    // ── LO SCONTO SI CONSUMA QUI ──────────────────────────────────────
    // Se ne va dentro questo incasso, con le righe su cui cadeva, e sul conto
    // non resta niente di preparato: il prossimo che paga la sua parte parte
    // pulito e può farsi scontare le SUE righe. Due riscossioni scontate sono
    // due sconti, ognuno con le sue righe — è quello che chiedeva il locale.
    //
    // Con un importo battuto a mano NO: quello è un acconto, non salda le
    // righe scelte, e portarsi via tutto lo sconto vorrebbe dire regalarlo a
    // chi ha messo venti euro sul tavolo. Resta preparato per il saldo.
    const sconto =
      !manual && scontoOra > 0 && order.discount
        ? {
            type: order.discount.type,
            value: order.discount.value,
            amount: scontoOra,
            items: order.discount_items || null,
            ...(order.discount.voucher_id
              ? { voucher_id: order.discount.voucher_id, voucher_name: order.discount.voucher_name ?? null }
              : {}),
          }
        : null
    // Conto già coperto (sconto totale, buono o acconti): non c'è nulla da
    // incassare ma il conto va CHIUSO lo stesso, altrimenti resta aperto per
    // sempre e blocca anche la chiusura di cassa.
    if (due <= 0) {
      // Conto vuoto (nessun articolo, nessuno sconto, nessun acconto): non c'è
      // niente da chiudere.
      if (!(Number(order.total) > 0) && paid <= 0) return
      return run(async () => {
        await onBeforePay?.()
        await markOrderPaid(await orderId(), null, { autoServe })
        closePaid()
      })
    }
    if (method === 'lettore') {
      // Lettore SIMULATO (test/dev senza hardware): stessa UX del vero —
      // transazione "avviata", poi l'esito arriva da solo dopo 2,5s.
      if (settings.sumup_reader_id === 'sim') {
        setReaderStarted(true)
        ;(async () => {
          try {
            await onBeforePay?.()
            const oid = await orderId()
            setTimeout(() => {
              registerPayment(oid, { amount: toPay, method: 'lettore', items, autoServe, sconto }).catch((e) =>
                onError?.(`Lettore simulato: ${e.message}`)
              )
            }, 2500)
          } catch (e) {
            setError(e.message)
          }
        })()
        return
      }
      // Il lettore VERO avvia una transazione: qui si aspetta l'esito.
      return run(async () => {
        await onBeforePay?.()
        const res = await readerCheckout(await orderId(), { amount: toPay, items, sconto })
        if (res?.unavailable) {
          setError('Lettore non disponibile in ambiente di sviluppo: simula dai DevTools.')
          return
        }
        setReaderStarted(true)
      })
    }
    // Contante / carta (POS esterno): OTTIMISTICO — il conto si chiude
    // subito a schermo, la registrazione va in background; in errore
    // l'avviso arriva nel dettaglio ordine.
    const willClose = paymentCloses(order, toPay)
    ;(async () => {
      try {
        await onBeforePay?.()
        // `chiude`: quello che questa schermata ha davanti adesso. Senza,
        // l'api rilegge il conto per decidere e prende la versione di prima —
        // quella senza lo sconto appena applicato (BUG-046).
        await registerPayment(await orderId(), { amount: toPay, method, items, autoServe, chiude: willClose, sconto })
      } catch (e) {
        setError(e.message)
        onError?.(`Pagamento non registrato: ${e.message}`)
      }
    })()
    if (willClose) closePaid({ amount: toPay, method }, { senzaStampa })
    // ── LA CARTA DI CHI VERSA UNA PARTE E SE NE VA (REQ-STAMPA-015) ──
    //
    // L'incasso non chiude il conto: lo scontrino finale non c'entra —
    // uscirà al saldo — ma chi ha appena pagato la sua parte se ne va con
    // le mani vuote, e finora era così. Esce adesso, dal gesto, come tutto
    // il resto: la registrazione sta viaggiando in sottofondo e questa
    // schermata è l'unica che sa cosa è appena successo.
    //
    // NIENTE `await` PRIMA: la stampa parte e la schermata resta viva. Se
    // la carta non esce lo si dice, e basta — l'incasso è registrato lo
    // stesso, e ristampare un acconto è un gesto, non un guaio.
    else if (
      accontoDaStampare({
        settings,
        chiude: willClose,
        senzaStampa,
        colTasto: conAcconto,
        autoStampa: loadPrinterSettings().autoPrintScontrino,
      })
    ) {
      printScontrinoAcconto(order, { amount: toPay, method, items, sconto }).catch((e) => {
        console.warn('[printer] acconto:', e.message)
        onError?.(`Ricevuta d'acconto non stampata: ${e.message}`)
      })
    }
  }

  // ── Sconto dal tastierino della modale ──
  // In % le cifre sono la percentuale intera ("10" → 10%); in € sono
  // centesimi come nel tastierino principale ("350" → 3,50 €).
  const discValue =
    discType === 'percent'
      ? Math.min(parseInt(discDigits || '0', 10) || 0, 100)
      : digitsToEuro(discDigits)
  // L'ANTEPRIMA È SULLE RIGHE SELEZIONATE, non sul conto: è il numero che chi
  // incassa confronta con quello che ha davanti sul tavolo.
  const discPreview = discountAmount(baseSconto, { type: discType, value: discValue })

  // Applica SUBITO a schermo (override locale), server in background.
  // Lo sconto nasce già legato alle righe che si stanno riscuotendo: `items`
  // null vuol dire «tutto quello che resta», che è il caso di sempre.
  const applyDiscount = () => {
    // BUONO come sconto: attinge al saldo del beneficiario (anche parziale).
    if (discType === 'buono') {
      if (!chosenVoucher || !(voucherRedeem > 0)) return
      const disc = { type: 'buono', value: voucherRedeem, voucher_id: chosenVoucher.id, voucher_name: chosenVoucher.holder_name }
      setOptimisticDisc({ disc, amount: voucherRedeem, items: righeSelezionate })
      setShowDiscount(false)
      setDiscDigits('')
      const vid = chosenVoucher.id
      setVoucherId('')
      ;(async () => {
        try {
          await applyVoucherDiscount(await orderId(), vid, voucherReq, { items: righeSelezionate })
        } catch (e) {
          setOptimisticDisc(null)
          toastError(`Buono non applicato: ${e.message}`)
        }
      })()
      return
    }
    const disc = discValue > 0 ? { type: discType, value: discValue } : null
    setOptimisticDisc({
      disc,
      amount: discountAmount(baseSconto, disc),
      items: disc ? righeSelezionate : null,
    })
    setShowDiscount(false)
    setDiscDigits('')
    ;(async () => {
      try {
        // L'importo lo detta la schermata, che ha davanti le righe scelte:
        // rifarlo di là vorrebbe dire calcolarlo su un conto vecchio di un
        // istante, che è la strada da cui è nato BUG-046.
        await setOrderDiscount(await orderId(), disc, {
          items: righeSelezionate,
          amount: discountAmount(baseSconto, disc),
        })
      } catch (e) {
        setOptimisticDisc(null)
        toastError(`Sconto non applicato: ${e.message}`)
      }
    })()
  }

  const saveLottery = () => {
    setShowLottery(false)
    ;(async () => {
      try {
        await setOrderLotteryCode(await orderId(), lotteryCode)
      } catch (e) {
        toastError(`Codice lotteria non salvato: ${e.message}`)
      }
    })()
  }

  const emettiFattura = () =>
    run(async () => {
      const inv = await createInvoice({
        order: { ...order, id: await orderId() },
        customer: billing,
        // L'ALIQUOTA È UNA SOLA, quella del locale (BUG-084): la fattura
        // di cortesia deve dire la stessa cosa dello scontrino.
        ivaRate: aliquotaScontrino(settings),
      })
      setInvoice(inv)
    })

  // Invio via email: si apre il client di posta con la fattura già scritta.
  const invoiceMailto = (inv) => {
    const s = loadPrinterSettings()
    const righe = (inv.items || [])
      .map((i) => `${i.qty}x ${i.name} — ${formatPrice(i.qty * i.unit_price)}`)
      .join('\n')
    const c = inv.customer || {}
    const body = [
      `Fattura di cortesia n. ${inv.number}`,
      `${s.businessName || ''}`,
      '',
      `Intestata a: ${c.denominazione || ''}`,
      c.piva ? `P.IVA: ${c.piva}` : null,
      c.cf ? `CF: ${c.cf}` : null,
      c.indirizzo ? `Indirizzo: ${c.indirizzo}` : null,
      '',
      righe,
      inv.discount_amount > 0 ? `Sconto: −${formatPrice(inv.discount_amount)}` : null,
      `Totale: ${formatPrice(inv.total)}`,
      '',
      'Documento non fiscale — copia di cortesia.',
    ]
      .filter((r) => r !== null)
      .join('\n')
    return `mailto:${encodeURIComponent(c.email || '')}?subject=${encodeURIComponent(
      `Fattura di cortesia n. ${inv.number}`
    )}&body=${encodeURIComponent(body)}`
  }

  const sendInvoiceEmail = (inv) => {
    window.location.href = invoiceMailto(inv)
    markInvoiceSent(inv.id, inv.customer?.email || null).catch(() => {})
  }

  return (
    <div
      role="dialog"
      aria-label="Pagamento"
      style={{
        position: 'fixed',
        inset: 0,
        // Sotto la barra di sistema del tablet (ora, wifi, batteria): senza,
        // il titolo e il tasto Chiudi finiscono dietro l'orologio.
        paddingTop: 'var(--safe-top)',
        zIndex: 300,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Barra in alto */}
      <div
        className="row between"
        style={{
          alignItems: 'center',
          padding: '8px 14px',
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
        {/* CHI PAGA STA IN TESTATA, accanto al numero: quando si incassa
            si chiama il tavolo per nome («Lele», «tavolo 4»), e quel nome
            era in mezzo alle righe dei drink, dove sembrava una voce del
            conto. Qui sta dove si guarda per sapere di chi è il conto. */}
        <h3 style={{ margin: 0 }}>
          💳 Pagamento · #{order.daily_number ?? '—'}
          {dove && <span className="muted"> · {dove}</span>}
        </h3>
        <button className="btn ghost small" onClick={onClose}>✕ Chiudi</button>
      </div>

      {error && <div className="banner" style={{ margin: '8px 12px 0', flexShrink: 0 }}>{error}</div>}

      <div
        className="payscreen-body"
        style={{
          '--pay-items-w': `${vociRz.width}px`,
          '--pay-methods-w': `${metodiRz.width}px`,
        }}
      >
        {/* ── SINISTRA: articoli del conto (split) + riepilogo ── */}
        <div className="payscreen-items">
          <div ref={listaRef} style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            {/* Niente istruzioni sopra le righe: chi incassa le tocca e vede
                il totale muoversi. A dire da dove viene il numero ci pensa
                l'etichetta sopra l'importo — «RIGHE SCELTE» o «IMPORTO A
                MANO» — che si legge nel momento in cui serve. */}
            {/* I COMANDI DELLA LISTA STANNO IN UNA RIGA SOLA, in cima: come
                si sceglie di vedere le righe (separate o unite) e come si
                porta la selezione ai due estremi. «Così come c'è unisci
                uguali e separa uguali, si crea quest'altro tasto che
                deseleziona tutti e seleziona tutti» (Flavio, 21/08/2026). */}
            {remaining.length > 0 && !closed && (
              <div className="payscreen-comandi">
                {remaining.some((r) => r.qty > 1) && (
                  <button className="btn ghost small" onClick={() => setSeparati((v) => !v)}>
                    {separati ? '🔗 Unisci uguali' : '≣ Separa uguali'}
                  </button>
                )}
                {/* UN TASTO SOLO CHE CAMBIA SCRITTA, come i suoi vicini. Dice
                    che cosa FARÀ, non in che stato sei: con qualcosa dentro
                    «Deseleziona tutti», con la lista già a zero «Seleziona
                    tutti». A conto solo in parte selezionato dice ancora
                    «Deseleziona tutti», perché è quello il gesto che serve —
                    si riparte da zero e si rimettono dentro le voci giuste,
                    che è il motivo per cui questo tasto esiste.
                    Niente icona davanti, a differenza dei vicini: su un
                    telefono da 360px le due scritte devono stare sulla stessa
                    riga, e «Deseleziona tutti» è già la più lunga della
                    schermata. */}
                <button className="btn ghost small" onClick={() => portaTutte(selezioneVuota)}>
                  {selezioneVuota ? 'Seleziona tutti' : 'Deseleziona tutti'}
                </button>
              </div>
            )}
            {remaining.map((r) => {
              const s = Math.min(sel[r.key] || 0, r.qty)
              // SEPARATA: una riga per unità, e le righe sono FATTE COME LE
              // ALTRE — nome, prezzo e il contatore −/+ con «1/1». Prima
              // erano caselline da spuntare: nella stessa colonna
              // convivevano due modi diversi di dire la stessa cosa, e chi
              // incassa doveva capire quale valesse per quale riga.
              if (separati && r.qty > 1) {
                const unita = unitaDi(r)
                return (
                  <div key={r.key}>
                    {Array.from({ length: r.qty }, (_, i) => {
                      const on = !!unita[i]
                      return (
                        <div
                          className="row between"
                          key={`${r.key}#${i}`}
                          style={{ alignItems: 'center', marginTop: 8 }}
                        >
                          <button
                            type="button"
                            className={`payscreen-voce grow${on ? '' : ' spenta'}`}
                            aria-pressed={on}
                            onClick={() => tocca(r, 'etichetta', i)}
                            disabled={closed}
                          >
                            {r.custom ? '✨ ' : ''}{r.name}
                            <span className="muted small"> · 1× {formatPrice(r.unit_price)}</span>
                          </button>
                          <span className="qty">
                            {/* UNO ALLA VOLTA. Il «−» scriveva la nuova
                                quantità come «tutte quelle prima di questa»:
                                premendolo sulla PRIMA di tre si spegnevano
                                tutte e tre insieme, e chi stava dividendo il
                                conto si ritrovava da capo. Le unità sono
                                identiche — quale si toglie non cambia
                                niente — quindi si toglie e si aggiunge una
                                unità per volta. */}
                            <button
                              aria-label={`Togli ${r.name} dal pagamento`}
                              onClick={() => tocca(r, 'meno', i)}
                              disabled={closed || !on}
                            >
                              −
                            </button>
                            <strong>{on ? 1 : 0}/1</strong>
                            {/* Col conto ancora tutto in riscossione il «+»
                                resta VIVO anche su una unità già accesa: è
                                il gesto che l'utente ha chiesto per dire
                                «solo questa» — spento non lo sarebbe mai. */}
                            <button
                              aria-label={`Paga ${r.name}`}
                              onClick={() => tocca(r, 'piu', i)}
                              disabled={closed || (on && !allSelected)}
                            >
                              +
                            </button>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              }
              return (
                <div className="row between" key={r.key} style={{ alignItems: 'center', marginTop: 8 }}>
                  {/* L'ETICHETTA È UN TASTO. Al banco si punta il prodotto,
                      non il piccolo «+» accanto: toccando il nome la riga
                      entra intera in riscossione («questo lo paga lui»), e
                      chi ne vuole una parte scende col «−». `aria-pressed`
                      dice se la riga è dentro, che è l'unica cosa che serve
                      sapere anche senza vedere il colore. */}
                  <button
                    type="button"
                    className={`payscreen-voce grow${s > 0 ? '' : ' spenta'}`}
                    aria-pressed={s > 0}
                    onClick={() => tocca(r, 'etichetta')}
                    disabled={closed}
                  >
                    {r.custom ? '✨ ' : ''}{r.name}
                    <span className="muted small"> · {r.qty}× {formatPrice(r.unit_price)}</span>
                  </button>
                  <span className="qty">
                    <button aria-label={`Togli ${r.name} dal pagamento`} onClick={() => tocca(r, 'meno')} disabled={closed || s === 0}>−</button>
                    <strong>{s}/{r.qty}</strong>
                    <button aria-label={`Paga ${r.name}`} onClick={() => tocca(r, 'piu')} disabled={closed || (s >= r.qty && !allSelected)}>+</button>
                  </span>
                </div>
              )
            })}
            {remaining.length === 0 && !closed && (
              <p className="muted small">Nessun articolo da pagare{due > 0 ? ': resta il residuo (coperto/servizio).' : '.'}</p>
            )}
            {(order.payments || []).length > 0 && (
              <div style={{ marginTop: 14 }}>
                <span className="muted small" style={{ letterSpacing: 0.5 }}>GIÀ PAGATO</span>
                {dettaglioIncassi(order).incassi.map((p, idx) => (
                  <div key={idx} style={{ marginTop: 4 }}>
                    <div className="row between muted small">
                      <span>
                        {/* «Acconto» quando l'importo è stato battuto a mano:
                            quei 30 € non coprono nessuna riga in
                            particolare, sono soldi lasciati sul conto. Le
                            righe le copre solo chi le sceglie qui a
                            sinistra. */}
                        {p.cosa ? 'Pagate' : 'Acconto'}
                        {p.metodo ? ` · ${PAYMENT_METHOD_LABELS[p.metodo] || p.metodo}` : ''}
                        {p.quando ? ` · ${String(p.quando).slice(11, 16)}` : ''}
                      </span>
                      <span>{formatPrice(p.importo)}</span>
                    </div>
                    {p.cosa && (
                      <div className="muted small" style={{ paddingLeft: 10, opacity: 0.8 }}>
                        {p.cosa.join(' · ')}
                      </div>
                    )}
                    {/* Lo sconto che quel giro si è portato via, sotto al suo
                        incasso: è lì che si va a cercare perché quattro birre
                        hanno fatto quattordici euro invece di sedici. */}
                    {p.sconto && (
                      <div className="muted small" style={{ paddingLeft: 10, opacity: 0.8 }}>
                        🎁 {p.sconto.etichetta} −{formatPrice(p.sconto.importo)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Riepilogo come nel POS: Pagato (verde) / Dovuto (rosso) / Totale */}
          <div style={{ flexShrink: 0, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            {/* GLI SCONTI SONO UNA LISTA. Uno per ogni riscossione che se l'è
                portato via, più quello preparato adesso: sommarli in una riga
                sola vorrebbe dire tornare alla cifra di cui nessuno sa il
                perché. Con un solo sconto su tutto il conto la riga è quella
                di sempre. */}
            {scontiDelConto(order).map((sc, idx) => (
              <div className="row between muted small" key={idx}>
                <span>{sc.etichetta}</span>
                <span>−{formatPrice(sc.importo)}</span>
              </div>
            ))}
            <div className="row between small">
              <span style={{ color: '#2ecc71' }}>Pagato</span>
              <span style={{ color: '#2ecc71' }}>{formatPrice(paid)}</span>
            </div>
            <div className="row between small">
              <span style={{ color: '#e74c3c' }}>Ammontare dovuto</span>
              <span style={{ color: '#e74c3c' }}>{formatPrice(due)}</span>
            </div>
            <div className="row between" style={{ marginTop: 4 }}>
              <strong>Totale</strong>
              <strong className="price">{formatPrice(order.total)}</strong>
            </div>
          </div>
        </div>

        {/* Maniglia fra le voci e il tastierino. Sul telefono le colonne
            sono impilate e la maniglia sparisce (foglio, sotto gli 800px):
            trascinare una larghezza quando la colonna è larga quanto lo
            schermo non vuol dire niente. */}
        <div className="payscreen-resize-handle" {...vociRz.handleProps} />

        {/* ── CENTRO: display + tastierino + Riscuotere + Preconto ── */}
        <div className="payscreen-pad">
          <div className="row between" style={{ alignItems: 'baseline', flexShrink: 0 }}>
            <span className="muted small">
              AMMONTARE DOVUTO
              <br />
              <span style={{ fontSize: '1.2rem' }}>{formatPrice(due)}</span>
            </span>
            <span style={{ textAlign: 'right' }}>
              <span className="muted small" style={{ letterSpacing: 0.5 }}>
                {/* DA DOVE VIENE QUESTO NUMERO. «Pagamento» non distingue due
                    cose diverse: le righe scelte (che coprono esattamente
                    quelle) e un importo battuto a mano (che non copre
                    niente, è un acconto). Dirlo qui evita di scoprirlo dopo,
                    a conto chiuso. */}
                {manual
                  ? 'IMPORTO A MANO'
                  : selezioneVuota
                    ? 'NESSUNA RIGA SCELTA'
                    : splitting
                      ? `RIGHE SCELTE (${selection.reduce((n, r) => n + (Number(r.qty) || 0), 0)})`
                      : 'PAGAMENTO'}
                {op ? ` (${acc != null ? formatPrice(acc) : ''} ${op === 'x' ? '×' : op})` : ''}
              </span>
              <br />
              <strong style={{ fontSize: '2rem', color: '#3f7ce0' }} data-testid="pay-amount">
                {formatPrice(amount)}
              </strong>
            </span>
          </div>
          {/* Un importo battuto a mano che non salda il conto è un ACCONTO:
              resta sul conto e non copre righe precise. Meglio dirlo prima di
              incassare che scoprirlo dopo, quando restano righe «da pagare»
              che qualcuno credeva pagate. */}
          {manual && amount > 0 && amount < due && (
            <p className="muted small" style={{ margin: '2px 0 0', textAlign: 'right' }}>
              Acconto: resta sul conto, non copre righe precise.
            </p>
          )}
          {/* Zero righe scelte: lo zero grande in cima potrebbe sembrare un
              conto già chiuso. Qui c'è scritto perché è zero e come si esce —
              toccando le voci, o battendo un importo sul tastierino, che
              resta una strada buona anche da qui. */}
          {!manual && selezioneVuota && !closed && due > 0 && (
            <p className="muted small" style={{ margin: '2px 0 0', textAlign: 'right' }}>
              Nessuna riga scelta: tocca le voci da incassare, o batti un importo.
            </p>
          )}
          {change > 0 && method === 'banco' && (
            <p className="small" style={{ margin: '2px 0 0', textAlign: 'right', flexShrink: 0 }}>
              Resto: <strong>{formatPrice(change)}</strong> (si incassano {formatPrice(toPay)})
            </p>
          )}
          {readerStarted && order.payment_status === 'in_attesa' && (
            <p className="muted small" style={{ margin: '2px 0 0', flexShrink: 0 }}>
              📟 Transazione avviata sul lettore: il conto si aggiorna da solo all'esito.
            </p>
          )}
          {closed && <p style={{ margin: '2px 0 0', flexShrink: 0 }}>✅ Conto pagato e chiuso.</p>}

          <div className="paypad" role="group" aria-label="Tastierino importo">
            <button className="paypad-key danger" onClick={clear}>C</button>
            <button className="paypad-key accent" onClick={() => divideBy(2)}>/2</button>
            <button className="paypad-key accent" onClick={() => divideBy(3)}>/3</button>
            <button className="paypad-key accent" onClick={() => setOperator('/')}>÷</button>
            <button className="paypad-key" onClick={() => key('7')}>7</button>
            <button className="paypad-key" onClick={() => key('8')}>8</button>
            <button className="paypad-key" onClick={() => key('9')}>9</button>
            <button className="paypad-key accent" onClick={() => setOperator('x')}>×</button>
            <button className="paypad-key" onClick={() => key('4')}>4</button>
            <button className="paypad-key" onClick={() => key('5')}>5</button>
            <button className="paypad-key" onClick={() => key('6')}>6</button>
            <button className="paypad-key accent" onClick={() => setOperator('-')}>−</button>
            <button className="paypad-key" onClick={() => key('1')}>1</button>
            <button className="paypad-key" onClick={() => key('2')}>2</button>
            <button className="paypad-key" onClick={() => key('3')}>3</button>
            <button className="paypad-key accent" onClick={() => setOperator('+')}>+</button>
            <button className="paypad-key" onClick={() => key('00')}>00</button>
            <button className="paypad-key" onClick={() => key('0')}>0</button>
            <button className="paypad-key accent" onClick={equals}>=</button>
            <button className="paypad-key danger" aria-label="Cancella cifra" onClick={back}>←</button>
          </div>

          {scontoFuoriMisura && (
            <div className="banner" style={{ marginTop: 10 }}>
              Lo sconto ({formatPrice(order.discount_amount)}) supera quello che stai
              riscuotendo ({formatPrice(baseSconto)}): correggilo qui sotto prima di incassare.
            </div>
          )}

          {/* PERCHÉ QUESTO INCASSO POTREBBE NON CHIUDERE IL CONTO, e perché
              sta scritto QUI dentro invece che su una riga sua. Col servizio
              seguito, riscuotere non chiude: il conto resta aperto finché le
              comande non sono servite. Era un avviso a schermo — «Comande non
              ancora servite: il conto resta aperto anche dopo l'incasso» —
              tolto il 21/08/2026 su richiesta dell'utente: «questo messaggio
              toglilo, che occupa spazio quando zoomo». Una riga fissa nella
              colonna centrale, a zoom alto, è spazio tolto al tastierino
              (BUG-075), e la si legge una volta sola in una vita.
              L'informazione non sparisce, cambia posto e non costa altezza:
              nel `title` del tasto che la riguarda, e detta a voce alta dal
              gemello «Riscuoti e servi · chiude il conto» quando c'è — quel
              «chiude il conto» dice per differenza che l'altro non chiude.
              Quando quel tasto è spento nelle impostazioni resta solo questo
              `title`: è l'unico posto dov'era, e serviva un posto che non
              rubasse una riga. */}
          {!closed && (
            <button
              className="btn block payscreen-collect"
              title={
                !autoServeBase && !served
                  ? `Comande non ancora servite: il conto resta aperto anche dopo l'incasso${riscuotiEServi ? ', a meno di «Riscuoti e servi»' : ''}.`
                  : undefined
              }
              disabled={saving || scontoFuoriMisura || (due > 0 && !(toPay > 0))}
              onClick={() => riscuoti()}
            >
              {due <= 0 ? 'Chiudi conto · 0,00 €' : `Riscuotere · ${formatPrice(toPay)}`}
            </button>
          )}
          {/* LE DUE VIE ALTERNATIVE, AFFIANCATE SU UNA RIGA SOLA (chiesto
              dall'utente il 21/08/2026). Il tasto grande resta da solo a
              tutta larghezza — è il gesto normale; queste due sono le
              eccezioni, e stando in riga si vedono per quello che sono.
              Compaiono a condizioni INDIPENDENTI, quindi la riga può
              contenerne una sola: in quel caso si allarga e prende tutto
              (ci pensa il `flex-grow` in `.payscreen-collect-alt`), niente
              mezzo tasto con un buco accanto. */}
          {(mostraSenzaStampa || mostraEServi || mostraAcconto) && (
            <div className="payscreen-collect-alt">
              {/* Lo stesso incasso, ma la stampante tace: per il cliente che
                  lo scontrino di cortesia non lo vuole. Solo dove il locale
                  l'ha acceso, e solo se c'è davvero qualcosa da incassare. */}
              {mostraSenzaStampa && (
                <button
                  className="btn ghost payscreen-collect-muto"
                  disabled={saving || scontoFuoriMisura || !(toPay > 0)}
                  onClick={() => riscuoti({ senzaStampa: true })}
                >
                  Riscuoti (senza stampa) · {formatPrice(toPay)}
                </button>
              )}
              {/* ── IL TERZO TASTO ────────────────────────────────────
                  Incassa una parte e stampa la ricevuta di chi se ne va.
                  QUANDO L'INCASSO CHIUDE IL CONTO NON SPARISCE, si SPEGNE
                  e al tocco dice perché: la selezione si apre piena — cioè
                  chiudendo — e ogni riga tolta o rimessa la farebbe
                  comparire e sparire sotto il dito mentre si divide il
                  conto, con gli altri due tasti che ballano di conseguenza.
                  Spento resta al suo posto, e chi lo cerca lo trova. La
                  ragione è quella dei metodi di pagamento non disponibili,
                  poche righe più in là: `disabled` non spiegherebbe niente. */}
              {mostraAcconto && (
                <button
                  className={`btn ghost payscreen-collect-acconto${chiudeOra ? ' spento' : ''}`}
                  aria-disabled={chiudeOra || undefined}
                  disabled={saving || scontoFuoriMisura || !(toPay > 0)}
                  onClick={() =>
                    chiudeOra
                      ? showToast(
                          'Questo incasso salda il conto: la carta che esce è lo scontrino, non un acconto. Togli qualche riga per riscuoterne solo una parte.'
                        )
                      : riscuoti({ conAcconto: true })
                  }
                >
                  Acconto con scontrino · {formatPrice(toPay)}
                </button>
              )}
              {/* Consegnato e incassato nello stesso gesto: un tasto solo invece
                  di incassare qui e poi servire dalla coda. Solo dove il locale
                  lo ha chiesto, e solo se c'è ancora qualcosa da servire. */}
              {mostraEServi && (
                <button
                  className="btn ghost payscreen-collect-servi"
                  disabled={saving || scontoFuoriMisura || (due > 0 && !(toPay > 0))}
                  onClick={() => riscuoti({ servi: true })}
                >
                  Riscuoti e servi · chiude il conto
                </button>
              )}
            </div>
          )}

          {/* Come nel POS: Codice Lotteria · Preconto · Invia fattura.
              LA FATTURA È UNA FUNZIONE PREMIUM (REQ-LIC-001): dove il
              modulo non lavora il tasto non c'è, ed è l'unica porta della
              modale più in basso — `showInvoice` lo accende solo questo.
              Il numero di una fattura già emessa NON si tocca: resta
              sull'ordine e nella sua collezione, e torna a vedersi il
              giorno che il modulo si riaccende. */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexShrink: 0 }}>
            <button className="btn ghost small grow" onClick={() => setShowLottery(true)}>
              🎟 Codice Lotteria{order.lottery_code ? ' ✓' : ''}
            </button>
            <button
              className="btn ghost small grow"
              onClick={() => printScontrino(order).catch((e) => setError(`Stampa: ${e.message}`))}
            >
              🖨 Preconto
            </button>
            {fattureOn && (
              <button className="btn ghost small grow" onClick={() => setShowInvoice(true)}>
                📧 Invia fattura{order.invoice_number ? ' ✓' : ''}
              </button>
            )}
          </div>
        </div>

        {/* Maniglia fra il tastierino e i metodi */}
        <div className="payscreen-resize-handle" {...metodiRz.handleProps} />

        {/* ── DESTRA: metodi di pagamento + Sconto ── */}
        <div className="payscreen-methods">
          {methods.map((m) => {
            // Un metodo spento resta CLICCABILE apposta: `disabled` non fa
            // partire il tocco, e chi incassa resta a premere un tasto morto
            // senza sapere perché. Qui è spento a vedersi (`spento`), e al
            // tocco dice il motivo invece di non fare niente.
            const spento = m.disabled && !closed
            return (
              <button
                key={m.key}
                className={`payscreen-method${method === m.key ? ' active' : ''}${spento ? ' spento' : ''}`}
                aria-pressed={method === m.key}
                aria-disabled={spento || undefined}
                disabled={closed || (m.disabled && !m.motivo)}
                onClick={() => (spento ? toastError(m.motivo) : setMethod(m.key))}
              >
                {m.emoji} {m.label}
                {m.key === 'lettore' && readerReady && settings.sumup_reader_name ? (
                  <span className="muted small"> ({settings.sumup_reader_name})</span>
                ) : null}
              </button>
            )
          })}

          <div style={{ marginTop: 'auto' }}>
            {!closed && (
              <button className="btn ghost small block" onClick={() => setShowDiscount(true)}>
                {order.discount?.type === 'buono' ? '🎟 Buono' : '🎁 Sconto'}
                {(order.discount_amount || 0) > 0 ? ` (−${formatPrice(order.discount_amount)})` : ''}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Modale SCONTO: tastierino come quello del pagamento ── */}
      {showDiscount && (
        <div className="overlay confirm-overlay" onClick={() => setShowDiscount(false)}>
          <div
            className="confirm-box"
            role="dialog"
            aria-label="Sconto"
            style={{ width: 'min(320px, 94vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between" style={{ alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>🎁 Sconto</h3>
              <button className="btn ghost small" onClick={() => setShowDiscount(false)}>✕</button>
            </div>

            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              <button
                className={`btn small grow ${discType === 'percent' ? '' : 'ghost'}`}
                onClick={() => {
                  setDiscType('percent')
                  setDiscDigits('')
                }}
              >
                %
              </button>
              <button
                className={`btn small grow ${discType === 'euro' ? '' : 'ghost'}`}
                onClick={() => {
                  setDiscType('euro')
                  setDiscDigits('')
                }}
              >
                €
              </button>
              <button
                className={`btn small grow ${discType === 'buono' ? '' : 'ghost'}`}
                disabled={vipList.length === 0}
                title={vipList.length === 0 ? 'Nessun buono con saldo' : 'Sconto col buono'}
                onClick={() => {
                  setDiscType('buono')
                  setDiscDigits('')
                }}
              >
                🎟
              </button>
            </div>

            {/* BUONO: si sceglie il beneficiario; l'importo (parziale) attinge
                al suo saldo e si applica al totale come uno sconto. */}
            {discType === 'buono' && (
              <div style={{ marginTop: 10 }}>
                <label htmlFor="disc-voucher">🎟 Buono di</label>
                <select
                  id="disc-voucher"
                  value={voucherId}
                  onChange={(e) => {
                    setVoucherId(e.target.value)
                    setDiscDigits('')
                  }}
                  style={{ width: '100%' }}
                >
                  <option value="">— Scegli il beneficiario —</option>
                  {vipList.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.holder_name} · saldo {formatPrice(v.balance)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ textAlign: 'center', margin: '10px 0 2px' }}>
              <strong style={{ fontSize: '1.8rem' }} data-testid="disc-amount">
                {discType === 'percent'
                  ? `${discValue}%`
                  : discType === 'buono'
                    ? formatPrice(voucherReq)
                    : formatPrice(discValue)}
              </strong>
              <p className="muted small" style={{ margin: '2px 0 0' }}>
                {discType === 'buono'
                  ? chosenVoucher
                    ? `Dal buono: −${formatPrice(voucherRedeem)}${voucherRedeem < voucherReq ? ' (saldo/totale insufficiente)' : ''}`
                    : 'Scegli un beneficiario'
                  : `Sconto su quello che stai riscuotendo: −${formatPrice(discPreview)}`}
              </p>
            </div>

            {/* Tre colonne, non quattro: qui non ci sono gli operatori, e con la
                griglia del pagamento le cifre andavano a capo dove capitava
                (7 8 9 4 / 5 6 1 2 / 3 C 0 ←). Sul tastierino si batte a memoria. */}
            <div className="paypad paypad-cifre" style={{ marginTop: 8, minHeight: 'auto' }}>
              {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((d) => (
                <button key={d} className="paypad-key" onClick={() => setDiscDigits((s) => (s + d).slice(0, 6))}>
                  {d}
                </button>
              ))}
              <button className="paypad-key danger" onClick={() => setDiscDigits('')}>C</button>
              <button className="paypad-key" onClick={() => setDiscDigits((s) => (s + '0').slice(0, 6))}>0</button>
              <button
                className="paypad-key danger"
                aria-label="Cancella cifra sconto"
                onClick={() => setDiscDigits((s) => s.slice(0, -1))}
              >
                ←
              </button>
            </div>

            <button
              className="btn block"
              style={{ marginTop: 10 }}
              disabled={saving || (discType === 'buono' && !(voucherRedeem > 0))}
              onClick={applyDiscount}
            >
              Applica {(discType === 'buono' ? voucherRedeem : discPreview) > 0
                ? `(−${formatPrice(discType === 'buono' ? voucherRedeem : discPreview)})`
                : ''}
            </button>
            {(order.discount_amount || 0) > 0 && (
              <button
                className="btn ghost small block"
                style={{ marginTop: 6 }}
                disabled={saving}
                onClick={() => {
                  setOptimisticDisc({ disc: null, amount: 0, items: null })
                  setShowDiscount(false)
                  setDiscDigits('')
                  ;(async () => {
                    try {
                      await setOrderDiscount(await orderId(), null)
                    } catch (e) {
                      setOptimisticDisc(null)
                      toastError(`Sconto non rimosso: ${e.message}`)
                    }
                  })()
                }}
              >
                Rimuovi sconto
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Modale CODICE LOTTERIA (lotteria degli scontrini) ── */}
      {showLottery && (
        <div className="overlay confirm-overlay" onClick={() => setShowLottery(false)}>
          <div
            className="confirm-box"
            role="dialog"
            aria-label="Codice Lotteria"
            style={{ width: 'min(360px, 94vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between" style={{ alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>🎟 Codice Lotteria</h3>
              <button className="btn ghost small" onClick={() => setShowLottery(false)}>✕</button>
            </div>
            <p className="muted small" style={{ margin: '8px 0' }}>
              Il codice della "lotteria degli scontrini" che il cliente mostra
              al pagamento: viene salvato sul conto e stampato sullo scontrino.
            </p>
            <label htmlFor="ps-lottery">Codice</label>
            <input
              id="ps-lottery"
              value={lotteryCode}
              onChange={(e) => setLotteryCode(e.target.value.toUpperCase())}
              placeholder="Es. ABCD1234"
              style={{ width: '100%' }}
            />
            <button className="btn block" style={{ marginTop: 10 }} disabled={saving} onClick={saveLottery}>
              Salva codice
            </button>
          </div>
        </div>
      )}

      {/* ── Modale INVIA FATTURA (fattura di cortesia) ── */}
      {showInvoice && (
        <div className="overlay confirm-overlay" onClick={() => setShowInvoice(false)}>
          <div
            className="confirm-box"
            role="dialog"
            aria-label="Invia fattura"
            style={{ width: 'min(420px, 94vw)', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between" style={{ alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>📧 Fattura di cortesia</h3>
              <button className="btn ghost small" onClick={() => setShowInvoice(false)}>✕</button>
            </div>

            {invoice ? (
              <>
                <p style={{ margin: '10px 0 4px' }}>
                  ✅ Emessa la fattura <strong>n. {invoice.number}</strong> ·{' '}
                  {formatPrice(invoice.total)}
                </p>
                <p className="muted small" style={{ margin: '0 0 10px' }}>
                  Intestata a {invoice.customer?.denominazione}. La ritrovi nel
                  gestionale, tab Fatture.
                </p>
                <button className="btn block" onClick={() => sendInvoiceEmail(invoice)}>
                  📧 Invia via email{invoice.customer?.email ? ` a ${invoice.customer.email}` : ''}
                </button>
                <button
                  className="btn secondary block"
                  style={{ marginTop: 6 }}
                  onClick={() => printFattura(invoice).catch((e) => setError(`Stampa: ${e.message}`))}
                >
                  🖨 Stampa fattura
                </button>
              </>
            ) : (
              <>
                {order.invoice_number && (
                  <p className="muted small" style={{ margin: '8px 0 0' }}>
                    ⚠️ Per questo conto risulta già emessa la fattura n.{' '}
                    {order.invoice_number} (vedi tab Fatture).
                  </p>
                )}
                <p className="muted small" style={{ margin: '8px 0' }}>
                  Documento di cortesia con i dati del cliente (la fattura
                  elettronica vera resta al commercialista/SDI).
                </p>
                <label htmlFor="inv-den">Ragione sociale / Nome *</label>
                <input
                  id="inv-den"
                  value={billing.denominazione}
                  onChange={(e) => setBilling((b) => ({ ...b, denominazione: e.target.value }))}
                  style={{ width: '100%' }}
                />
                <div className="grid-2" style={{ marginTop: 6 }}>
                  <div>
                    <label htmlFor="inv-piva">P.IVA</label>
                    <input
                      id="inv-piva"
                      value={billing.piva}
                      onChange={(e) => setBilling((b) => ({ ...b, piva: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-cf">Codice fiscale</label>
                    <input
                      id="inv-cf"
                      value={billing.cf}
                      onChange={(e) => setBilling((b) => ({ ...b, cf: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid-2" style={{ marginTop: 6 }}>
                  <div>
                    <label htmlFor="inv-sdi">Codice SDI / PEC</label>
                    <input
                      id="inv-sdi"
                      value={billing.sdi}
                      onChange={(e) => setBilling((b) => ({ ...b, sdi: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-email">Email</label>
                    <input
                      id="inv-email"
                      type="email"
                      value={billing.email}
                      onChange={(e) => setBilling((b) => ({ ...b, email: e.target.value }))}
                    />
                  </div>
                </div>
                <label htmlFor="inv-addr" style={{ marginTop: 6, display: 'block' }}>Indirizzo</label>
                <input
                  id="inv-addr"
                  value={billing.indirizzo}
                  onChange={(e) => setBilling((b) => ({ ...b, indirizzo: e.target.value }))}
                  style={{ width: '100%' }}
                />
                <button
                  className="btn block"
                  style={{ marginTop: 10 }}
                  disabled={saving || !billing.denominazione.trim()}
                  onClick={emettiFattura}
                >
                  Emetti fattura · {formatPrice(order.total)}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
