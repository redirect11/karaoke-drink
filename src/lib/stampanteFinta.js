// ── LA STAMPANTE FINTA, SOLO IN LOCALE ───────────────────────────────
//
// Al banco la stampante è un apparecchio sulla rete del locale: da un
// computer di sviluppo non si raggiunge, e ogni modifica a comande e
// scontrini si provava a occhio nel codice — oppure andando al bar.
//
// Qui la stampante c'è, ma è di carta finta: raccoglie le righe che l'app
// le manda e le apre in una finestra col FACSIMILE dello scontrino. Si
// prova quello che ESCE, che è la domanda vera («questa comanda si
// legge?»), non il collegamento.
//
// La finestra si guarda e si chiude: prima partiva da sola la stampa in
// PDF, e per leggere una comanda bisognava passare ogni volta da una
// finestra di sistema — con un file da buttare a ogni prova. Chi la stampa
// davvero la vuole ha il suo tasto.
//
// SOLO IN LOCALE. Sull'ambiente di test non si accende, perché lì ci si
// collega alla stampante VERA per provarla davvero; in produzione, va da
// sé, nemmeno si pone. Il segnale è l'ambiente di sviluppo o gli
// emulatori: entrambi vogliono dire «questo computer non è il bar».

const COL = 48 // colonne della testina 80 mm, come la stampante vera

// L'interruttore DEL TERMINALE, acceso dalla sezione Dev: serve sul sito
// di TEST, dove l'ambiente è quello vero (niente DEV, niente emulatori) ma
// la stampante spesso non c'è — chi prova da casa deve poter vedere i
// facsimili invece di stampe che falliscono in silenzio. È in localStorage
// perché la stampante è una faccenda del dispositivo, come le sue
// impostazioni. La sezione Dev esiste solo in locale e sul test
// (devToolsEnabled), quindi in produzione questo interruttore non ha una
// leva da nessuna parte.
const CHIAVE_FINTA = 'tana_stampante_finta'
export function stampanteFintaForzata() {
  try {
    return localStorage.getItem(CHIAVE_FINTA)
  } catch {
    return null
  }
}
export function forzaStampanteFinta(attiva) {
  try {
    if (attiva === null) localStorage.removeItem(CHIAVE_FINTA)
    else localStorage.setItem(CHIAVE_FINTA, attiva ? 'true' : 'false')
  } catch {
    /* niente memoria: resta la regola d'ambiente */
  }
}

// ── IL GUASTO FINTO (BUG-098) ────────────────────────────────────────
//
// La diagnostica della stampa — la risposta che arriva DOPO l'invio e
// racconta com'è andata — è una catena lunga: risposta di errore, registro,
// avviso a schermo. Senza un modo di romperla apposta, quella catena si
// prova solo al banco con la carta finita in mano, che è esattamente il
// motivo per cui BUG-098 è sopravvissuto tanto.
//
// La stampante finta sa quindi fingere due guasti:
//   · `carta` — risponde di errore, come quando il rotolo è finito;
//   · `muta` — la carta esce ma non conferma niente, che è il caso
//     sospettato dietro la chiusura di cassa che non si vede uscire.
//
// NON PUÒ CAPITARE PER SBAGLIO IN PRODUZIONE: lo legge solo la stampante
// FINTA, che in produzione non si accende, e la leva sta nel pannello Dev,
// che esiste solo in locale e sul test (devToolsEnabled).
const CHIAVE_GUASTO = 'tana_stampante_finta_guasto'
export const GUASTI_FINTI = ['carta', 'muta']

export function guastoFinto() {
  try {
    const v = localStorage.getItem(CHIAVE_GUASTO)
    return GUASTI_FINTI.includes(v) ? v : null
  } catch {
    return null
  }
}

export function impostaGuastoFinto(quale) {
  try {
    if (GUASTI_FINTI.includes(quale)) localStorage.setItem(CHIAVE_GUASTO, quale)
    else localStorage.removeItem(CHIAVE_GUASTO)
  } catch {
    /* niente memoria: nessuna simulazione, che è il caso normale */
  }
}

export function stampanteFintaAttiva(env = import.meta.env) {
  // La scelta del terminale vince su tutto: è chi sta provando a dire
  // «qui la stampante è finta» (o «voglio quella vera anche in locale»).
  const forzata = stampanteFintaForzata()
  if (forzata === 'true') return true
  if (forzata === 'false') return false
  if (env?.VITE_STAMPANTE_FINTA === 'false') return false
  // Forzabile a mano, per provarla dove serve.
  if (env?.VITE_STAMPANTE_FINTA === 'true') return true
  if (env?.DEV) return true
  if (env?.MODE === 'locale') return true
  // Gli emulatori Firebase: se il database è finto, lo è anche il bar.
  return env?.VITE_USE_FIREBASE_EMULATOR === 'true'
}

// Le righe come le vedrebbe la testina: testo grande raddoppiato, allineato
// nelle 48 colonne. Non è una simulazione fedele — è quanto basta per
// leggere la comanda com'è, invece di immaginarsela.
function componi(pezzi) {
  const out = []
  let allineamento = 'left'
  let doppio = false
  for (const p of pezzi) {
    if (p.tipo === 'align') allineamento = p.valore
    else if (p.tipo === 'size') doppio = p.doppio
    else if (p.tipo === 'feed') out.push(...Array(p.righe).fill(''))
    else if (p.tipo === 'cut') out.push('─'.repeat(COL))
    else if (p.tipo === 'text') {
      for (const riga of String(p.testo).split('\n')) {
        if (riga === '' && p.testo.endsWith('\n')) continue
        const t = doppio ? riga.split('').join(' ') : riga
        const largh = COL
        if (allineamento === 'center') out.push(t.trim().padStart(Math.floor((largh + t.trim().length) / 2)))
        else if (allineamento === 'right') out.push(t.trim().padStart(largh))
        else out.push(t)
      }
    }
  }
  return out
}

// Apre la finestra di stampa del browser con lo scontrino dentro: da lì
// «Salva come PDF». Se il browser blocca la finestra (succede), il testo
// finisce in console — meglio che perderlo.
function mostra(righe, titolo, logo) {
  const testo = righe.join('\n')
  const w = typeof window !== 'undefined' ? window.open('', '_blank', 'width=520,height=760') : null
  if (!w) {
    console.info(`[stampante finta] ${titolo}\n${testo}`)
    return
  }
  const scampato = (t) => String(t).replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))
  // Lo scontrino come esce dalla testina: carta stretta, fondo bianco,
  // monospaziato. Il logo, se c'è, sta in cima come sulla carta vera.
  w.document.write(
    `<!doctype html><meta charset="utf-8"><title>${scampato(titolo)}</title>` +
      '<style>' +
      'body{margin:0;padding:16px;background:#e8e8ee;font-family:system-ui,sans-serif}' +
      // LA CARTA È LARGA 48 CARATTERI, e il facsimile deve esserlo. Con una
      // misura in millimetri e un corpo fisso le righe andavano a capo dove
      // la stampante vera non le manda: «La Tana del Conigli / o», e ogni
      // riga di un drink spezzata in due. Qui la larghezza la decide il
      // TESTO — 48 caratteri di un monospaziato (48ch) — così quello che si
      // vede è quello che esce dalla stampante.
      '.scontrino{width:calc(48ch + 8mm);max-width:100%;margin:0 auto;background:#fff;padding:6mm 4mm;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.18)}' +
      '.scontrino img{display:block;margin:0 auto 6px;max-width:24ch}' +
      'pre{font:12px/1.35 "Courier New",monospace;color:#000;white-space:pre;margin:0;overflow-x:auto}' +
      '.barra{max-width:calc(48ch + 8mm);margin:0 auto 10px;display:flex;gap:8px;align-items:center;' +
      'font:13px system-ui,sans-serif;color:#333}' +
      '.barra button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #bbb;' +
      'background:#fff;cursor:pointer}' +
      '@media print{body{background:#fff;padding:0}.barra{display:none}' +
      '.scontrino{width:auto;box-shadow:none;padding:0}}' +
      '@page{size:80mm auto;margin:4mm}</style>' +
      `<div class="barra"><span>${scampato(titolo)} — facsimile</span>` +
      '<button onclick="window.print()">🖨 Stampa</button>' +
      '<button onclick="window.close()">Chiudi</button></div>' +
      `<div class="scontrino">${logo ? `<img src="${logo}" alt="">` : ''}<pre>${scampato(testo)}</pre></div>`
  )
  w.document.close()
  w.focus()
}

// L'oggetto che l'app crede una stampante: gli stessi metodi dell'SDK
// Epson, per la parte che usiamo (vedi lib/printer.js).
export function creaStampanteFinta(titolo = 'Stampa') {
  const pezzi = []
  const finta = {
    ALIGN_LEFT: 'left',
    ALIGN_CENTER: 'center',
    ALIGN_RIGHT: 'right',
    COLOR_1: 'color1',
    CUT_FEED: 'cut',
    addTextLang: () => finta,
    addTextSmooth: () => finta,
    addTextAlign: (v) => (pezzi.push({ tipo: 'align', valore: v }), finta),
    addTextSize: (w) => (pezzi.push({ tipo: 'size', doppio: Number(w) > 1 }), finta),
    addTextStyle: () => finta,
    addText: (t) => (pezzi.push({ tipo: 'text', testo: t }), finta),
    // Butta quello che è stato accumulato senza stamparlo. La stampante
    // vera ce l'ha (clearCommandBuffer dell'SDK) e serve alla coda delle
    // stampe: un lavoro che si ferma a metà non deve lasciare i suoi pezzi
    // sulla carta di quello dopo (BUG-052).
    clearCommandBuffer: () => ((pezzi.length = 0), finta),
    addFeedLine: (n) => (pezzi.push({ tipo: 'feed', righe: Number(n) || 1 }), finta),
    addCut: () => (pezzi.push({ tipo: 'cut' }), finta),
    // Il logo: la stampante vera riceve un'immagine, qui basta l'indirizzo
    // per rimetterlo in cima al facsimile.
    addImageUrl: (url) => (pezzi.push({ tipo: 'logo', url }), finta),
    send: () => {
      const guasto = guastoFinto()
      // Carta finita: la testina non stampa niente e lo dice. Il facsimile
      // non si apre, come non esce la carta.
      if (guasto === 'carta') {
        pezzi.length = 0
        finta.onreceive?.({ success: false, code: 'ASB_NO_PAPER', status: 0 })
        return finta
      }
      const logo = pezzi.find((p) => p.tipo === 'logo')?.url || null
      mostra(componi(pezzi), titolo, logo)
      pezzi.length = 0
      // Stampante muta: la carta esce e la conferma non arriva mai. È il
      // caso peggiore da riconoscere, e il solo che questa simulazione
      // riproduce facendo MENO, non di più.
      if (guasto === 'muta') return finta
      // L'SDK vero avvisa così: qualcuno guarda `onreceive`.
      finta.onreceive?.({ success: true, code: '', status: 0 })
      return finta
    },
    onreceive: null,
    ondisconnect: null,
  }
  return finta
}
