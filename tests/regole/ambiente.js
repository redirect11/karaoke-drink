// ── PROVARE LE REGOLE FIRESTORE PER DAVVERO ──────────────────────────────
//
// Le regole sono l'unica barriera fra i dati del locale e chiunque abbia
// letto apiKey e projectId dal bundle (che sono pubblici per disegno). Fino
// all'audit del 26/08/2026 non avevano un solo test: si leggevano e si
// sperava.
//
// Qui girano contro l'EMULATORE Firestore, con le regole vere del progetto
// (firestore.rules, letto dal disco: se cambia, cambia quello che si prova).
// Per questo NON stanno nel giro di `npm test` — senza emulatore non
// partirebbero e la CI diventerebbe rossa per un motivo che non è un
// difetto. Si lanciano da soli:
//
//   npx firebase emulators:start --project demo-tana-drink \
//     --only auth,firestore,storage --config firebase.collaudo.json
//   npm run test:regole
//
// OGNI PROVA È DOPPIA: che l'abuso sia bloccato conta quanto che l'uso
// legittimo passi. Una regola che chiude tutto è facile da scrivere e la
// sera manda a casa il locale.

import { readFileSync } from 'node:fs'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'

const REGOLE = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')

// La porta è quella di firebase.collaudo.json (8081), non quella di
// firebase.json (8080): l'ambiente di prova del progetto è il primo.
const HOST = process.env.FIRESTORE_EMULATOR_HOST_ONLY || '127.0.0.1'
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT || 8081)

// Un progetto per file di prova: gli emulatori ne tengono tanti insieme, e
// così le regole e i dati di un test non si mescolano con quelli di un
// altro (né con i dati veri dell'ambiente locale di sviluppo).
export async function avviaAmbiente(nomeProgetto) {
  return initializeTestEnvironment({
    projectId: `regole-${nomeProgetto}`,
    firestore: { host: HOST, port: PORT, rules: REGOLE },
  })
}

// I quattro modi in cui qualcuno bussa a Firestore. Il ruolo sta nel custom
// claim `role`, come in produzione: chi non ce l'ha è un cliente, non staff.
export const CHI = {
  anonimo: (env) => env.unauthenticatedContext().firestore(),
  cliente: (env, uid = 'cliente-1') => env.authenticatedContext(uid).firestore(),
  sala: (env, uid = 'sala-1') => env.authenticatedContext(uid, { role: 'staff' }).firestore(),
  banco: (env, uid = 'banco-1') => env.authenticatedContext(uid, { role: 'bartender' }).firestore(),
  admin: (env, uid = 'admin-1') => env.authenticatedContext(uid, { role: 'admin' }).firestore(),
}
