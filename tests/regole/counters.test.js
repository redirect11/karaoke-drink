// ── I NUMERI DEI CONTI NON SI AVVELENANO PIÙ (BUG-091) ───────────────────
//
// Prima queste regole erano `allow read, write: if true`. Chiunque, senza
// nemmeno un login, poteva scrivere `counters/2026-08-26 = {last: 0}` e far
// ripartire la numerazione: la sera dopo due conti #15, uno stampato e in
// mano al cliente. Qui si prova che quel gesto è chiuso — e, con la stessa
// cura, che il gesto BUONO (il cliente non autenticato che ordina dal menù
// e fa salire il contatore di uno) passa ancora.

import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, increment } from 'firebase/firestore'
import { avviaAmbiente, CHI } from './ambiente.js'

let env

beforeAll(async () => {
  env = await avviaAmbiente('counters')
})
afterAll(async () => {
  await env?.cleanup()
})
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'counters/2026-08-26'), { last: 14 })
    await setDoc(doc(db, 'counters/_active_cash'), { session_id: 'cassa-1' })
    await setDoc(doc(db, 'counters/fatture-2026'), { seq: 3 })
  })
})

describe('il contatore lo leggono tutti', () => {
  // Il cliente non autenticato deve poter seguire il contatore: è così che
  // il suo ordine prende un numero senza chiedere niente al server.
  it('anche chi non ha fatto il login', async () => {
    await assertSucceeds(getDoc(doc(CHI.anonimo(env), 'counters/2026-08-26')))
    await assertSucceeds(getDoc(doc(CHI.anonimo(env), 'counters/_active_cash')))
  })
})

describe('L’USO LEGITTIMO PASSA: il numero si prende senza aspettare nessuno', () => {
  // È esattamente quello che fa prendiNumero() in src/lib/progressivi.js.
  it('il cliente non autenticato fa salire il contatore di uno', async () => {
    const db = CHI.anonimo(env)
    await assertSucceeds(
      setDoc(doc(db, 'counters/2026-08-26'), { last: increment(1) }, { merge: true })
    )
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), 'counters/2026-08-26'))
      expect(snap.data().last).toBe(15)
    })
  })

  // Primo conto della giornata (o della serata di cassa): il documento non
  // esiste ancora e l'increment lo crea a 1. Se questa si rompesse, al banco
  // il primo conto della sera non prenderebbe un numero.
  it('il primo conto della giornata crea il contatore da zero', async () => {
    const db = CHI.anonimo(env)
    await assertSucceeds(
      setDoc(doc(db, 'counters/2026-08-27'), { last: increment(1) }, { merge: true })
    )
    await assertSucceeds(
      setDoc(doc(db, 'counters/cash-sessione-nuova'), { last: increment(1) }, { merge: true })
    )
  })

  it('e il banco, che è autenticato, fa lo stesso', async () => {
    await assertSucceeds(
      setDoc(doc(CHI.banco(env), 'counters/2026-08-26'), { last: increment(1) }, { merge: true })
    )
    await assertSucceeds(
      setDoc(doc(CHI.sala(env), 'counters/2026-08-26'), { last: increment(1) }, { merge: true })
    )
  })

  // Aprire la cassa e numerare una fattura sono gesti del personale, e
  // scrivono campi diversi da `last`: devono restare possibili.
  it('il banco apre la cassa e numera le fatture', async () => {
    await assertSucceeds(
      setDoc(doc(CHI.banco(env), 'counters/_active_cash'), { session_id: 'cassa-2' })
    )
    await assertSucceeds(
      setDoc(doc(CHI.banco(env), 'counters/fatture-2026'), { seq: 4 }, { merge: true })
    )
  })
})

describe('L’ABUSO È BLOCCATO: il contatore non torna indietro e non salta', () => {
  it('non si azzera', async () => {
    await assertFails(
      setDoc(doc(CHI.anonimo(env), 'counters/2026-08-26'), { last: 0 }, { merge: true })
    )
  })

  it('non si spara a un numero assurdo', async () => {
    await assertFails(
      setDoc(doc(CHI.anonimo(env), 'counters/2026-08-26'), { last: 999999 }, { merge: true })
    )
  })

  it('non si salta avanti con un increment grosso', async () => {
    await assertFails(
      setDoc(doc(CHI.anonimo(env), 'counters/2026-08-26'), { last: increment(50) }, { merge: true })
    )
  })

  it('non si torna indietro con un increment negativo', async () => {
    await assertFails(
      setDoc(doc(CHI.anonimo(env), 'counters/2026-08-26'), { last: increment(-5) }, { merge: true })
    )
  })

  it('non si infilano altri campi insieme all’incremento', async () => {
    await assertFails(
      setDoc(
        doc(CHI.anonimo(env), 'counters/2026-08-26'),
        { last: increment(1), session_id: 'mia' },
        { merge: true }
      )
    )
  })

  // Un contatore nuovo può nascere solo a 1: nascere già alto vorrebbe dire
  // scavalcare i numeri di una serata intera.
  it('un contatore nuovo non nasce già alto', async () => {
    await assertFails(
      setDoc(doc(CHI.anonimo(env), 'counters/2026-08-28'), { last: 5000 })
    )
  })

  // Il puntatore alla cassa aperta decide su QUALE contatore si numera:
  // spostarlo vuol dire mandare i conti della sera in un'altra serata.
  it('non si sposta la cassa aperta', async () => {
    await assertFails(
      setDoc(doc(CHI.anonimo(env), 'counters/_active_cash'), { session_id: 'mia' })
    )
    await assertFails(
      setDoc(doc(CHI.cliente(env), 'counters/_active_cash'), { session_id: 'mia' }, { merge: true })
    )
  })

  it('non si tocca la numerazione delle fatture', async () => {
    await assertFails(
      setDoc(doc(CHI.anonimo(env), 'counters/fatture-2026'), { seq: 1 }, { merge: true })
    )
  })

  // Un cliente REGISTRATO è un cliente: l'account non è un ruolo.
  it('nemmeno il cliente registrato ha più mano libera dell’anonimo', async () => {
    await assertFails(
      setDoc(doc(CHI.cliente(env), 'counters/2026-08-26'), { last: 999999 }, { merge: true })
    )
    await assertSucceeds(
      setDoc(doc(CHI.cliente(env), 'counters/2026-08-26'), { last: increment(1) }, { merge: true })
    )
  })
})
