import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Le costanti che di solito inietta Vite al build. Senza, il codice che le
  // legge cade nel ramo "non c'è versione" e i test che riguardano gli
  // aggiornamenti non potrebbero nemmeno partire.
  define: {
    __APP_VERSION__: JSON.stringify('v0.0.0-test'),
    __BUILD_ID__: JSON.stringify('test'),
    __GIT_BRANCH__: JSON.stringify('test'),
    __GIT_COMMIT__: JSON.stringify('0000000'),
  },
  test: {
    // Default: Node (functions e logica pura). I test COMPONENTE dichiarano
    // jsdom nel file con il docblock `// @vitest-environment jsdom`.
    environment: 'node',
    globals: true,
    // FUSO ORARIO DEL LOCALE, deciso qui e non nel comando: "TZ=… vitest"
    // funziona su Linux e sul Mac, su Windows no — e chi sviluppa da lì si
    // ritrovava "npm test" che non parte nemmeno. Le date del gestionale
    // (giornata commerciale, chiusure) dipendono dal fuso: senza, i test
    // passerebbero o fallirebbero a seconda di dove gira la macchina.
    env: { TZ: 'Europe/Rome' },
    // LA GUARDIA DELLA CONSOLE: un avviso che nessuno si aspetta fa fallire
    // il test che lo ha stampato, invece di finire in fondo a migliaia di
    // righe che nessuno legge più. Il perché — e la lista, corta, di quelli
    // ammessi — sta nel file.
    setupFiles: ['./tests/helpers/guardiaConsole.js'],
    include: ['tests/**/*.test.js', 'tests/**/*.test.jsx'],
    // Fuori i test delle REGOLE Firestore: vogliono l'emulatore acceso e
    // hanno una configurazione loro (vitest.regole.config.mjs, `npm run
    // test:regole`). Qui dentro renderebbero rossa la CI senza che ci sia
    // niente di rotto.
    exclude: [...configDefaults.exclude, 'tests/regole/**'],
    coverage: {
      provider: 'v8',
      include: ['functions/lib/**/*.js', 'src/**/*.js', 'src/**/*.jsx'],
      // Gli attrezzi da sviluppatore non sono prodotto: fuori dal conto.
      exclude: ['src/dev/**'],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // IL CANCELLO: sotto queste soglie `npm run test:coverage` fallisce,
      // e con lui la CI delle pull request. Ogni area ha la SUA soglia,
      // tarata appena sotto il misurato del 16/08 — un CRICCHETTO: si
      // alzano quando la copertura cresce, non si abbassano mai per far
      // passare un merge. Le pagine partono basse perché così stanno
      // (19,8% stmts): la soglia non certifica qualità, impedisce di
      // peggiorare — alzarla è REQ-DEV-005.
      thresholds: {
        'functions/lib/**/*.js': { statements: 92, branches: 76, functions: 88, lines: 92 },
        'src/lib/**': { statements: 64, branches: 74, functions: 62, lines: 64 },
        'src/components/**': { statements: 40, branches: 72, functions: 43, lines: 40 },
        'src/pages/**': { statements: 17, branches: 52, functions: 16, lines: 17 },
        // src/ alla radice: App.jsx e main.jsx (misurato 72,8 / 65,9 / 31,6).
        'src/*.{js,jsx}': { statements: 70, branches: 63, functions: 28, lines: 70 },
      },
    },
  },
})
