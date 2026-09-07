// ── GLI ORDINI: CHI PUÒ APRIRNE UNO, E COSA CI PUÒ SCRIVERE (BUG-093) ────
//
// Gli ordini sono l'unica collezione che un CLIENTE NON AUTENTICATO deve
// poter creare e leggere: è il modello «id ordine come lasciapassare», ed è
// una scelta, non una dimenticanza. Chi ha in mano il link del suo conto lo
// vede; nessun altro lo indovina, perché l'id è casuale a 20 caratteri.
//
// Ma «creare» non vuol dire «scrivere qualunque cosa». Prima bastava
// l'apiKey del bundle per far comparire in coda un conto firmato con
// l'email dell'admin, o già pagato, o già fatturato. Qui si prova che
// quella porta è chiusa e che il conto del cliente vero passa ancora.
//
// IN FONDO AL FILE STA LA LETTURA, che è la seconda metà di BUG-093.
// «Leggere» sono due mestieri diversi: prendere UN conto di cui si conosce
// l'id (get) e scaricarne tanti insieme (list). Il primo è il modello
// voluto; il secondo era concesso per errore, e con la sola chiave pubblica
// del bundle portava ai dati dei clienti. Qui si prova che l'archivio non si
// travasa più e che le liste legittime passano ancora.

import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import {
  doc, setDoc, getDoc, getDocs, collection, query, where,
  documentId, orderBy, limit, Timestamp,
} from 'firebase/firestore'
import { avviaAmbiente, CHI } from './ambiente.js'

let env

// Il conto come esce davvero da src/lib/api.js (creaOrdine) quando a
// ordinare è un cliente dal menù. Se questa forma smette di essere
// accettata, al bar il telefono del cliente non ordina più.
function contoDalMenu(extra = {}) {
  return {
    daily_number: 12,
    serial: 340,
    order_date: '2026-08-26',
    status: 'aperto',
    comande: [{ id: 'c1', seq: 1, items: [], status: 'ricevuto' }],
    comande_statuses: ['ricevuto'],
    total: 18,
    coperto_persons: 0,
    coperto_amount: 0,
    service_charge_amount: 0,
    tip_amount: 0,
    service_mode: 'tavolo',
    push_token: 'token-del-telefono',
    placed_by: null,
    customer_name: 'Giulia',
    customer_uid: null,
    payment_method: null,
    payment_status: 'non_richiesto',
    payment_required: false,
    group_id: null,
    items: [{ drink_id: 'd1', name: 'Negroni', unit_price: 9, qty: 2 }],
    ...extra,
  }
}

beforeAll(async () => {
  env = await avviaAmbiente('orders')
})
afterAll(async () => {
  await env?.cleanup()
})
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'orders/conto-in-coda'), contoDalMenu())
    await setDoc(
      doc(db, 'orders/conto-chiuso'),
      contoDalMenu({
        status: 'consegnato',
        comande_statuses: ['consegnato'],
        customer_name: 'Marco Esposito',
        placed_by: { email: 'admin@latanadelconiglio.it', role: 'admin' },
      })
    )
    // UN CONTO VECCHIO, di prima delle comande: `comande_statuses` non ce
    // l'ha proprio. Sta qui perché le regole della lettura ci passano
    // sopra, e un campo che manca in una regola non è `false`, è un errore
    // — se il tabellone del cliente lo incrociasse, si spegnerebbe.
    const vecchio = contoDalMenu({ status: 'consegnato' })
    delete vecchio.comande
    delete vecchio.comande_statuses
    await setDoc(doc(db, 'orders/conto-vecchio'), vecchio)
  })
})

describe('L’USO LEGITTIMO PASSA: il conto si apre da tutte e tre le mani', () => {
  it('il cliente non autenticato apre un conto dal menù', async () => {
    await assertSucceeds(setDoc(doc(CHI.anonimo(env), 'orders/nuovo-1'), contoDalMenu()))
  })

  it('e lo può aprire anche scegliendo di pagare online', async () => {
    await assertSucceeds(
      setDoc(
        doc(CHI.anonimo(env), 'orders/nuovo-2'),
        contoDalMenu({ payment_method: 'online', payment_status: 'in_attesa' })
      )
    )
  })

  // Il cliente REGISTRATO intesta il conto al suo account: è così che «i
  // miei ordini» lo ritrova da un altro telefono.
  it('il cliente registrato intesta il conto a sé stesso, e lo ritrova', async () => {
    const db = CHI.cliente(env, 'cliente-1')
    await assertSucceeds(
      setDoc(doc(db, 'orders/nuovo-3'), contoDalMenu({ customer_uid: 'cliente-1' }))
    )
    await assertSucceeds(
      getDocs(query(collection(db, 'orders'), where('customer_uid', '==', 'cliente-1')))
    )
  })

  // La sala prende l'ordine al tavolo col telefono: è personale, firma col
  // suo nome, e la comanda nasce già in preparazione.
  it('la sala apre un conto firmandolo col proprio nome', async () => {
    await assertSucceeds(
      setDoc(
        doc(CHI.sala(env), 'orders/nuovo-4'),
        contoDalMenu({
          placed_by: { email: 'sala@latanadelconiglio.it', role: 'staff', device: 'tel-1' },
          comande_statuses: ['in_preparazione'],
        })
      )
    )
  })

  // Il banco batte i conti e non ha vincoli di forma: dal POS nasce anche
  // un conto già incassato e scontato.
  it('il banco apre un conto già incassato, come fa il POS', async () => {
    await assertSucceeds(
      setDoc(
        doc(CHI.banco(env), 'orders/nuovo-5'),
        contoDalMenu({
          placed_by: { email: 'banco@latanadelconiglio.it', role: 'bartender' },
          payment_status: 'pagato',
          paid_at: '2026-08-26T21:00:00.000Z',
          discount_amount: 2,
        })
      )
    )
  })

})

describe('L’ABUSO È BLOCCATO: un conto non nasce firmato o già successo', () => {
  // Il peggiore: un conto che compare in coda intestato all'admin. La
  // legenda della coda, la stampa e lo storico direbbero tutti «l'ha
  // battuto lui», e non è vero.
  it('chi non è del personale non firma col nome del personale', async () => {
    await assertFails(
      setDoc(
        doc(CHI.anonimo(env), 'orders/falso-1'),
        contoDalMenu({ placed_by: { email: 'admin@latanadelconiglio.it', role: 'admin' } })
      )
    )
    // Nemmeno un cliente registrato: l'account non è un ruolo.
    await assertFails(
      setDoc(
        doc(CHI.cliente(env), 'orders/falso-2'),
        contoDalMenu({ placed_by: { email: 'chiunque@example.com', role: 'staff' } })
      )
    )
  })

  it('un conto non nasce già pagato', async () => {
    const db = CHI.anonimo(env)
    await assertFails(setDoc(doc(db, 'orders/falso-3'), contoDalMenu({ payment_status: 'pagato' })))
    await assertFails(
      setDoc(doc(db, 'orders/falso-4'), contoDalMenu({ paid_at: '2026-08-26T21:00:00.000Z' }))
    )
  })

  it('né già scontato, fatturato o incassato', async () => {
    const db = CHI.anonimo(env)
    await assertFails(setDoc(doc(db, 'orders/falso-5'), contoDalMenu({ discount_amount: 50 })))
    await assertFails(setDoc(doc(db, 'orders/falso-6'), contoDalMenu({ invoice_number: '1/2026' })))
    await assertFails(setDoc(doc(db, 'orders/falso-7'), contoDalMenu({ payments: [{ amount: 18 }] })))
    await assertFails(setDoc(doc(db, 'orders/falso-8'), contoDalMenu({ closed_in_session: 'cassa-1' })))
  })

  it('né già venduto a SumUp', async () => {
    await assertFails(
      setDoc(doc(CHI.anonimo(env), 'orders/falso-9'), contoDalMenu({ sumup_sale_id: 'sale-1' }))
    )
  })

  // Intestare un conto all'account di un altro vuol dire infilarglielo nei
  // «miei ordini» e nel suo gruppo-cliente.
  it('non si intesta un conto all’account di un altro cliente', async () => {
    await assertFails(
      setDoc(doc(CHI.anonimo(env), 'orders/falso-10'), contoDalMenu({ customer_uid: 'cliente-1' }))
    )
    await assertFails(
      setDoc(
        doc(CHI.cliente(env, 'cliente-1'), 'orders/falso-11'),
        contoDalMenu({ customer_uid: 'cliente-2' })
      )
    )
  })

  // Un conto che nasce già «consegnato» salta la coda: non lo prepara
  // nessuno e risulta servito.
  it('un conto non nasce già avanti di stato', async () => {
    await assertFails(
      setDoc(doc(CHI.anonimo(env), 'orders/falso-12'), contoDalMenu({ status: 'consegnato' }))
    )
  })

  it('né con un totale che non è un numero, o negativo', async () => {
    const db = CHI.anonimo(env)
    await assertFails(setDoc(doc(db, 'orders/falso-13'), contoDalMenu({ total: 'gratis' })))
    await assertFails(setDoc(doc(db, 'orders/falso-14'), contoDalMenu({ total: -100 })))
  })

  // Nel dubbio: quello che c'era già continua a valere.
  it('e il conto del banco non si tocca da fuori', async () => {
    await assertFails(
      setDoc(
        doc(CHI.anonimo(env), 'orders/conto-chiuso'),
        { payment_status: 'pagato' },
        { merge: true }
      )
    )
  })
})

describe('LA LETTURA: un conto per id sì, l’archivio no (BUG-093)', () => {
  // IL TRAVASO: un `getDocs` senza filtri sulla collezione. Prima tornava
  // tutto — mesi di nomi, note, importi ed email di chi ha battuto i conti —
  // e bastava la chiave pubblica del bundle per chiederlo.
  it('un anonimo non elenca gli ordini', async () => {
    await assertFails(getDocs(collection(CHI.anonimo(env), 'orders')))
  })

  // E non lo elenca nemmeno travestendo la domanda: un filtro qualunque non
  // è un filtro che dimostra qualcosa. È il punto per cui le regole non sono
  // un colino — misurano la query, non i documenti che ne tornerebbero.
  it('né lo elenca mettendo davanti un filtro qualsiasi', async () => {
    const db = CHI.anonimo(env)
    await assertFails(getDocs(query(collection(db, 'orders'), where('status', '==', 'aperto'))))
    await assertFails(
      getDocs(query(collection(db, 'orders'), where('customer_name', '==', 'Marco Esposito')))
    )
    await assertFails(
      getDocs(query(collection(db, 'orders'), orderBy('created_at', 'desc'), limit(300)))
    )
    await assertFails(
      getDocs(query(collection(db, 'orders'), where('created_at', '>=', Timestamp.fromMillis(0))))
    )
  })

  // Nemmeno con un account: registrarsi non è un ruolo.
  it('né lo elenca un cliente registrato, né sui conti di un altro', async () => {
    const db = CHI.cliente(env, 'cliente-1')
    await assertFails(getDocs(collection(db, 'orders')))
    await assertFails(
      getDocs(query(collection(db, 'orders'), where('customer_uid', '==', 'cliente-2')))
    )
  })

  // IL LASCIAPASSARE RESTA L'ID: per chi ha il link del proprio conto non è
  // cambiato niente, autenticato o no.
  it('con l’id in mano il conto si legge, anche da anonimo', async () => {
    await assertSucceeds(getDoc(doc(CHI.anonimo(env), 'orders/conto-in-coda')))
    await assertSucceeds(getDoc(doc(CHI.anonimo(env), 'orders/conto-chiuso')))
  })

  // «I MIEI ORDINI» DEL CLIENTE NON REGISTRATO: gli id stanno nel telefono e
  // si chiedono uno per uno. Era una query su `documentId() in [...]`, che
  // nessuna regola sa riconoscere; adesso sono N letture singole
  // (fetchOrdersByIds in src/lib/api.js), ed è questa la riga che le prova.
  it('«i miei ordini» del cliente non registrato passa per letture singole', async () => {
    const db = CHI.anonimo(env)
    const miei = ['conto-in-coda', 'conto-chiuso']
    const letti = await Promise.all(miei.map((id) => assertSucceeds(getDoc(doc(db, 'orders', id)))))
    expect(letti.map((snap) => snap.id)).toEqual(miei)
    // La vecchia strada è chiusa: se il client ci tornasse, quella schermata
    // resterebbe vuota.
    await assertFails(getDocs(query(collection(db, 'orders'), where(documentId(), 'in', miei))))
  })

  // IL CLIENTE REGISTRATO ritrova i suoi conti da un altro telefono, e solo
  // i suoi: la lista si dimostra col filtro sul proprio account.
  it('il cliente registrato elenca i propri conti', async () => {
    const db = CHI.cliente(env, 'cliente-1')
    await assertSucceeds(
      getDocs(query(collection(db, 'orders'), where('customer_uid', '==', 'cliente-1'), limit(30)))
    )
  })

  // IL PERSONALE LEGGE TUTTO, che è il suo mestiere: queste sono le liste
  // vere della coda, dello storico e della cassa (src/lib/api.js). Se una
  // smettesse di passare, la sera la coda resterebbe vuota — ed è per questo
  // che stanno qui una per una e non solo come «legge tutto».
  it('il personale elenca: sono le liste della coda e della cassa', async () => {
    for (const db of [CHI.banco(env), CHI.admin(env), CHI.sala(env)]) {
      await assertSucceeds(getDocs(collection(db, 'orders')))
      await assertSucceeds(
        getDocs(query(collection(db, 'orders'), where('status', 'in', ['aperto', 'ricevuto'])))
      )
      await assertSucceeds(
        getDocs(query(collection(db, 'orders'), where('created_at', '>=', Timestamp.fromMillis(0))))
      )
      await assertSucceeds(
        getDocs(query(collection(db, 'orders'), where('closed_in_session', '==', 'cassa-1')))
      )
      await assertSucceeds(
        getDocs(query(collection(db, 'orders'), orderBy('created_at', 'desc'), limit(300)))
      )
      await assertSucceeds(
        getDocs(query(collection(db, 'orders'), where('group_id', '==', 'gruppo-1')))
      )
    }
  })

  // IL TABELLONE DEL MENÙ resta acceso: le due liste che dicono a chi
  // aspetta quanta coda c'è e cosa è pronto al ritiro. Sono liste, ma sono
  // domande che si dimostrano da sé, e sono le sole che un anonimo può fare.
  it('il tabellone del cliente continua a funzionare', async () => {
    const db = CHI.anonimo(env)
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'orders'),
          where('comande_statuses', 'array-contains-any', ['ricevuto', 'in_preparazione'])
        )
      )
    )
    await assertSucceeds(
      getDocs(query(collection(db, 'orders'), where('comande_statuses', 'array-contains', 'pronto')))
    )
    // Ma sotto non gli si allarga: «tutti i conti serviti» non è il
    // tabellone, è l'archivio con un'altra faccia.
    await assertFails(
      getDocs(
        query(collection(db, 'orders'), where('comande_statuses', 'array-contains', 'consegnato'))
      )
    )
  })
})
