'use strict'

// Wiring delle Cloud Functions di Tana Drink: registrazione degli handler,
// lettura dei parametri, `fetch` reale, accesso a Firestore. La logica sta
// nei moduli di lib/, puri e testabili senza emulatori.
//
// I pagamenti SumUp (lettore Solo al banco e checkout online) vivono in
// lib/payment-core.js e lib/payment-service.js; la chiave non finisce mai
// nel repo:
//   firebase functions:secrets:set SUMUP_API_KEY

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const { onDocumentUpdated, onDocumentCreated } = require('firebase-functions/v2/firestore')
const { defineSecret } = require('firebase-functions/params')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { getAuth } = require('firebase-admin/auth')

const { numeroDaRiassegnare } = require('./lib/numerazione')
const {
  decideOrderPush,
  decideStaffCallPush,
  decideStaffServePush,
  decideNewOrderStaffPush,
  destinatariPush,
  terminaliDi,
} = require('./lib/push-core')
const { staffAdmin } = require('./lib/staff-service')
const {
  createCheckout,
  verifyCheckoutStatus,
  handleOnlineWebhook,
  pairReader,
  unpairReader,
  readerCheckout: readerCheckoutSvc,
  readerTerminate: readerTerminateSvc,
  handleReaderWebhook,
  createGroupCheckout,
  verifyGroupPayment,
  groupReaderCheckout: groupReaderCheckoutSvc,
} = require('./lib/payment-service')
const {
  decideAutoAdvance,
  parseCheckoutWebhookBody,
  parseReaderWebhookBody,
} = require('./lib/payment-core')

initializeApp()
const db = getFirestore()

const OPTS = { region: 'europe-west1' }

// ── Gestione utenze staff (solo bartender) ────────────────────────────────────
// Crea/elenca/modifica/elimina gli account dello staff con il ruolo
// (custom claim). La logica vive in lib/staff-service.js (testata).
exports.staffAdmin = onCall(OPTS, async (request) => {
  try {
    return await staffAdmin(getAuth(), request.auth, request.data)
  } catch (e) {
    if (e?.code && e?.message) throw new HttpsError(e.code, e.message)
    throw new HttpsError('internal', e?.message || 'Errore interno.')
  }
})

// ── Notifiche push al cliente (FCM) ───────────────────────────────────────────
// Quando un ordine passa a "pronto" (drink pronto) o ad "annullato" da parte
// del bartender con notifica richiesta, invia una push al dispositivo del
// cliente (token salvato sull'ordine alla creazione). La decisione su cosa
// inviare vive in lib/push-core.js (pura, testata).
exports.notifyOrderUpdate = onDocumentUpdated({ ...OPTS, document: 'orders/{orderId}' }, async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()

  // 1) Push al cliente (drink pronto / ordine annullato).
  const msg = decideOrderPush(before, after)
  if (msg) {
    try {
      await getMessaging().send({
        token: after.push_token,
        notification: { title: msg.title, body: msg.body },
        data: { url: `/ordine/${event.params.orderId}` },
        webpush: {
          fcmOptions: { link: `/ordine/${event.params.orderId}` },
          notification: { icon: '/logo.png', badge: '/logo.png' },
        },
      })
      // SEGNARE CHE È PARTITO. Le comande annunciate si scrivono
      // sull'ordine: se qualcuno riporta indietro lo stato e lo rimette
      // «pronto», il cliente non riceve un secondo squillo per un drink che
      // ha già in mano — al secondo si smette di credere al primo.
      // Si segna DOPO l'invio riuscito: un avviso mai partito non deve
      // risultare dato. La scrittura fa ripartire questo stesso trigger,
      // che con la comanda ormai segnata non manda più niente.
      if (msg.comande?.length) {
        await event.data.after.ref
          .update({ pronto_avvisate: FieldValue.arrayUnion(...msg.comande) })
          .catch((e) => console.error('[push] pronto_avvisate:', e?.message || e))
      }
    } catch (e) {
      // Token scaduto/non valido: rimuovilo dall'ordine, niente retry.
      if (e?.code === 'messaging/registration-token-not-registered') {
        await event.data.after.ref.update({ push_token: null }).catch(() => {})
      } else {
        console.error('[push] invio fallito:', e?.message || e)
      }
    }
  }

  // 2) Push allo staff al bancone quando un ordine in attesa di pagamento
  //    obbligatorio viene saldato ed entra in coda (è "nuovo" per la cucina).
  const newOrderMsg = decideNewOrderStaffPush(before, after)
  if (newOrderMsg) {
    await pushToStaff({
      kind: 'new_order',
      orderId: event.params.orderId,
      msg: newOrderMsg,
      dispositivoOrigine: after?.placed_by?.device ?? null,
    })
  }

  // 3) Push allo staff quando un drink e' pronto: da portare al tavolo
  //    oppure da consegnare a chi viene a ritirarlo. A TUTTI I TERMINALI
  //    tranne quello che ha premuto «pronto», che sa gia'. Prima si
  //    smistava per ruolo — roles: ['staff'] — e non arrivava a nessuno
  //    (BUG-036).
  const serveMsg = decideStaffServePush(before, after)
  if (serveMsg) {
    await pushToStaff({
      kind: 'staff_serve',
      orderId: event.params.orderId,
      msg: serveMsg,
      dispositivoOrigine: after?.avanzamento_device ?? null,
    })
  }
})

// Invia una push data-only a TUTTI i dispositivi staff registrati
// (staff_tokens). La notifica vera (titolo/corpo/vibrazione) la costruisce il
// service worker dal campo `kind`, così arriva anche ad app in background o
// chiusa. Rimuove in automatico i token scaduti.
async function pushToStaff({ kind, orderId, msg, url = '/bar', dispositivoOrigine = null }) {
  const tokensSnap = await db.collection('staff_tokens').get()
  // Chi avvisare lo decide destinatariPush (push-core, pura e provata):
  // tutti i terminali registrati, tranne quello da cui è partita la cosa
  // che si sta annunciando — chi ha battuto l'ordine, o chi ha appena
  // premuto «pronto», sa già di averlo fatto.
  const ammessi = new Set(
    destinatariPush(
      tokensSnap.docs.map((d) => ({ token: d.get('token'), device: d.get('device') })),
      { dispositivoOrigine }
    ).map((t) => t.token)
  )
  const docs = tokensSnap.docs.filter((d) => ammessi.has(d.get('token')))
  // A VOCE ALTA CHI SI E' AVVISATO. BUG-036 era invisibile dai log: la
  // funzione usciva in silenzio con zero destinatari, identica a una che
  // non era mai stata chiamata, e per scoprirlo e' servito leggere
  // `staff_tokens` a mano. Una riga sola dice se il messaggio e' partito
  // e a quanti terminali.
  if (docs.length === 0) {
    console.log(`[push staff] ${kind}: nessun terminale da avvisare (${tokensSnap.size} registrati)`)
    return
  }

  const res = await getMessaging().sendEachForMulticast({
    tokens: docs.map((d) => d.get('token')),
    data: { kind, order_id: orderId, title: msg.title, body: msg.body, url },
    webpush: { headers: { Urgency: 'high', TTL: '600' } },
  })

  console.log(
    `[push staff] ${kind}: inviata a ${docs.length}/${tokensSnap.size} terminali ` +
      `(ok ${res.successCount}, ko ${res.failureCount})`
  )

  await Promise.all(
    res.responses.map((r, i) =>
      r.error?.code === 'messaging/registration-token-not-registered'
        ? docs[i].ref.delete().catch(() => {})
        : null
    )
  )
}

// ── Push nuovo ordine allo staff (FCM) ────────────────────────────────────────
// Quando arriva un ordine, avvisa tutti i dispositivi al bancone: è l'unico
// modo per ricevere l'avviso a schermo bloccato / app in background su iPad
// (lì il listener realtime della pagina è sospeso dal sistema). Gli ordini con
// pagamento obbligatorio non ancora saldato NON si notificano qui: lo farà
// notifyOrderUpdate quando risulteranno pagati.
exports.notifyNewOrder = onDocumentCreated({ ...OPTS, document: 'orders/{orderId}' }, async (event) => {
  const after = event.data?.data()
  const msg = decideNewOrderStaffPush(null, after)
  if (!msg) return
  await pushToStaff({
    kind: 'new_order',
    orderId: event.params.orderId,
    msg,
    dispositivoOrigine: after?.placed_by?.device ?? null,
  })
})

// ── DUE TERMINALI, LO STESSO NUMERO: LA DISPUTA LA CHIUDE IL SERVER ──────────
//
// Il numero del conto lo assegna il dispositivo, senza chiedere niente a
// nessuno: è l'unico modo perché battere un conto sia immediato e funzioni
// offline. Il prezzo è che il telefono della sala e il tablet del banco, che
// battono nello stesso istante, possono prendersi lo stesso #15.
//
// Qui, dove esiste un «prima» e un «dopo» veri, si decide: tiene il numero
// chi è arrivato prima, e chi arriva dopo prende il primo libero. Automatico:
// al banco non si ferma una serata per un numero.
//
// Il numero cambia SOLO a chi ha perso, e resta scritto da dove veniva
// (`daily_number_precedente`): la comanda può essere già uscita dalla
// stampante col numero vecchio, e chi la tiene in mano deve ritrovarlo.
exports.risolviNumeroDuplicato = onDocumentCreated(
  { ...OPTS, document: 'orders/{orderId}' },
  async (event) => {
    const nuovo = event.data?.data()
    if (!nuovo || !(Number(nuovo.daily_number) > 0)) return
    // I conti si contendono il numero dentro la stessa CASSA; senza cassa
    // aperta, dentro la stessa giornata commerciale.
    const campo = nuovo.cash_session_id ? 'cash_session_id' : 'order_date'
    const valore = nuovo.cash_session_id || nuovo.order_date
    if (!valore) return

    const snap = await db.collection('orders').where(campo, '==', valore).get()
    const fratelli = snap.docs.map((d) => ({
      id: d.id,
      created_at: d.get('created_at'),
      daily_number: d.get('daily_number'),
    }))
    const conto = {
      id: event.params.orderId,
      created_at: nuovo.created_at,
      daily_number: nuovo.daily_number,
    }
    const numero = numeroDaRiassegnare(conto, fratelli)
    if (numero == null) return

    await db.collection('orders').doc(conto.id).update({
      daily_number: numero,
      daily_number_precedente: nuovo.daily_number,
      numero_riassegnato_at: FieldValue.serverTimestamp(),
    })
    // Il contatore si allinea, così il prossimo conto non ripesca il numero
    // appena assegnato.
    const contatore = nuovo.cash_session_id ? `cash-${nuovo.cash_session_id}` : nuovo.order_date
    await db
      .collection('counters')
      .doc(contatore)
      .set({ last: FieldValue.increment(1) }, { merge: true })
  }
)

// ── Push cerca-persone allo staff (FCM) ───────────────────────────────────────
// Quando il bartender crea una chiamata, invia una push al dispositivo del
// membro dello staff chiamato (token in staff_tokens/{uid}, registrato
// quando lo staff apre il gestionale). Messaggio data-only: la notifica
// con vibrazione la costruisce il service worker, così arriva anche con
// l'app in background o chiusa.
exports.notifyStaffCall = onDocumentCreated({ ...OPTS, document: 'staff_calls/{callId}' }, async (event) => {
  const call = event.data?.data()
  const msg = decideStaffCallPush(call)
  if (!msg) return

  // TUTTI I TERMINALI DI QUELLA PERSONA, non uno solo. La riga del token è
  // del DISPOSITIVO (`staff_tokens/<device>`, col campo `uid` dentro): da
  // quando è così, cercarla all'indirizzo `staff_tokens/<uid>` non trovava
  // niente e la chiamata non partiva — il telefono di chi veniva cercato
  // non vibrava mai. E chi lavora ha spesso due terminali accesi: la
  // chiamata deve suonare su entrambi, perché non si sa quale ha in mano.
  const tokensSnap = await db.collection('staff_tokens').get()
  const suoi = new Set(
    terminaliDi(
      tokensSnap.docs.map((d) => ({ id: d.id, uid: d.get('uid'), token: d.get('token') })),
      call.to_uid
    ).map((r) => r.token)
  )
  const docs = tokensSnap.docs.filter((d) => suoi.has(d.get('token')))
  if (docs.length === 0) return

  try {
    const res = await getMessaging().sendEachForMulticast({
      tokens: docs.map((d) => d.get('token')),
      data: {
        kind: 'staff_call',
        title: msg.title,
        body: msg.body,
        url: '/bar',
      },
      webpush: {
        // Consegna immediata: la chiamata ha senso solo nel momento.
        headers: { Urgency: 'high', TTL: '180' },
      },
    })
    // I terminali che non esistono più si tolgono dalla rubrica: se no
    // restano lì a far fallire ogni chiamata successiva.
    await Promise.all(
      res.responses.map((r, i) =>
        r.error?.code === 'messaging/registration-token-not-registered'
          ? docs[i].ref.delete().catch(() => {})
          : null
      )
    )
  } catch (e) {
    console.error('[push staff] invio fallito:', e?.message || e)
  }
})

// ── Pagamenti SumUp (checkout online + lettore) ───────────────────────────────
// La chiave API è un secret runtime (firebase functions:secrets:set
// SUMUP_API_KEY); il merchant code non è segreto e vive in functions/.env.
// Senza configurazione le funzioni rispondono { unavailable: true }.
const SUMUP_API_KEY = defineSecret('SUMUP_API_KEY')
const SUMUP_MERCHANT_CODE = process.env.SUMUP_MERCHANT_CODE || ''
const SUMUP_PAYMENTS_BASE = process.env.SUMUP_PAYMENTS_BASE || 'https://api.sumup.com'
// Affiliate key: obbligatoria per il checkout sul lettore (Cloud API).
// Non è un segreto (identifica l'app, non autentica): vive in .env.
const SUMUP_AFFILIATE_KEY = process.env.SUMUP_AFFILIATE_KEY || ''
const SUMUP_AFFILIATE_APP_ID = process.env.SUMUP_AFFILIATE_APP_ID || 'it.latanadelconiglio.drink'

function paymentDeps() {
  const apiKey = SUMUP_API_KEY.value() || ''
  return {
    db,
    isConfigured: () => Boolean(apiKey && SUMUP_MERCHANT_CODE),
    merchantCode: () => SUMUP_MERCHANT_CODE,
    now: () => new Date().toISOString(),
    webhookUrl: () =>
      `https://${OPTS.region}-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/paymentWebhook`,
    affiliate: () =>
      SUMUP_AFFILIATE_KEY
        ? { app_id: SUMUP_AFFILIATE_APP_ID, key: SUMUP_AFFILIATE_KEY }
        : null,
    paymentsFetch: async (path, options = {}) => {
      const res = await fetch(`${SUMUP_PAYMENTS_BASE}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      })
      const text = await res.text()
      if (!res.ok) {
        const e = new Error(`SumUp ${res.status} su ${path}: ${text}`)
        e.status = res.status
        throw e
      }
      return text ? JSON.parse(text) : null
    },
  }
}

function toHttpsError(e) {
  if (e?.code && e?.message && typeof e.code === 'string') {
    return new HttpsError(e.code, e.message)
  }
  return new HttpsError('internal', e?.message || 'Errore interno.')
}

// Checkout online: chiamabile anche da clienti anonimi (l'id ordine fa
// da capability token, come per la pagina ordine pubblica).
exports.createPaymentCheckout = onCall({ ...OPTS, secrets: [SUMUP_API_KEY] }, async (request) => {
  try {
    return await createCheckout(paymentDeps(), request.data || {})
  } catch (e) {
    throw toHttpsError(e)
  }
})

exports.getPaymentStatus = onCall({ ...OPTS, secrets: [SUMUP_API_KEY] }, async (request) => {
  try {
    return await verifyCheckoutStatus(paymentDeps(), request.data || {})
  } catch (e) {
    throw toHttpsError(e)
  }
})

// Webhook esiti di pagamento (checkout online + return_url del lettore).
// Smista per forma del payload; l'esito viene SEMPRE ri-verificato via
// API SumUp, quindi un payload malformato è innocuo.
exports.paymentWebhook = onRequest({ ...OPTS, secrets: [SUMUP_API_KEY], cors: false }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('')
  try {
    const deps = paymentDeps()
    const reader = parseReaderWebhookBody(req.body)
    if (reader.clientTransactionId) {
      await handleReaderWebhook(deps, reader)
    } else {
      const online = parseCheckoutWebhookBody(req.body)
      await handleOnlineWebhook(deps, online)
    }
  } catch (e) {
    console.error('[payments] webhook:', e?.message || e)
  }
  // Sempre 200: gli esiti veri si leggono dall'API, niente retry storm.
  res.status(200).json({ ok: true })
})

// Cintura server: ordine ritirato + pagato (in qualunque ordine) → chiuso.
exports.autoAdvancePaid = onDocumentUpdated({ ...OPTS, document: 'orders/{orderId}' }, async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()
  const advance = decideAutoAdvance(before, after)
  if (!advance) return
  const nowIso = new Date().toISOString()
  await event.data.after.ref
    .update({ status: advance, [`status_times.${advance}`]: nowIso })
    .catch((e) => console.error('[payments] auto-advance:', e?.message || e))
})

// ── Lettore SumUp Solo (Cloud API): pairing e incasso dalla coda ──────────────
exports.pairSumUpReader = onCall({ ...OPTS, secrets: [SUMUP_API_KEY] }, async (request) => {
  try {
    return await pairReader(paymentDeps(), request.auth, request.data || {})
  } catch (e) {
    throw toHttpsError(e)
  }
})

exports.unpairSumUpReader = onCall({ ...OPTS, secrets: [SUMUP_API_KEY] }, async (request) => {
  try {
    return await unpairReader(paymentDeps(), request.auth)
  } catch (e) {
    throw toHttpsError(e)
  }
})

exports.readerCheckout = onCall({ ...OPTS, secrets: [SUMUP_API_KEY] }, async (request) => {
  try {
    return await readerCheckoutSvc(paymentDeps(), request.auth, request.data || {})
  } catch (e) {
    throw toHttpsError(e)
  }
})

exports.readerTerminate = onCall({ ...OPTS, secrets: [SUMUP_API_KEY] }, async (request) => {
  try {
    return await readerTerminateSvc(paymentDeps(), request.auth, request.data || {})
  } catch (e) {
    throw toHttpsError(e)
  }
})

// ── Pagamento di un GRUPPO via SumUp (online + lettore) ───────────────────────
exports.createGroupCheckout = onCall({ ...OPTS, secrets: [SUMUP_API_KEY] }, async (request) => {
  try {
    return await createGroupCheckout(paymentDeps(), request.data || {})
  } catch (e) {
    throw toHttpsError(e)
  }
})

exports.getGroupPaymentStatus = onCall({ ...OPTS, secrets: [SUMUP_API_KEY] }, async (request) => {
  try {
    return await verifyGroupPayment(paymentDeps(), request.data || {})
  } catch (e) {
    throw toHttpsError(e)
  }
})

exports.groupReaderCheckout = onCall({ ...OPTS, secrets: [SUMUP_API_KEY] }, async (request) => {
  try {
    return await groupReaderCheckoutSvc(paymentDeps(), request.auth, request.data || {})
  } catch (e) {
    throw toHttpsError(e)
  }
})
