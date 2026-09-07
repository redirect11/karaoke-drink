'use strict'

// IL CSS DEVE CHIUDERE QUELLO CHE APRE.
//
// Una graffa mancante non fa fallire né il lint né la build: il browser
// legge tutto quello che viene dopo come se stesse DENTRO l'ultima regola
// aperta, e semplicemente lo ignora. È successo sciogliendo un conflitto —
// `.bar-nav-sottovoce` è rimasta senza `}` e da lì in poi trecento righe,
// compreso il menu agganciato alla pagina, non hanno più avuto effetto: il
// menu smetteva di aprirsi e nessuno strumento diceva niente.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const CARTELLA = join(process.cwd(), 'src')
const fogli = readdirSync(CARTELLA).filter((f) => f.endsWith('.css'))

// Le graffe dentro commenti o stringhe falserebbero il conto: via prima.
function nudo(testo) {
  return testo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
}

describe('i fogli di stile sono ben formati', () => {
  it('ce n’è almeno uno da controllare', () => {
    expect(fogli.length).toBeGreaterThan(0)
  })

  for (const foglio of fogli) {
    const testo = () => nudo(readFileSync(join(CARTELLA, foglio), 'utf8'))

    it(foglio + ': ogni blocco aperto viene chiuso', () => {
      const t = testo()
      const aperte = (t.match(/\{/g) || []).length
      const chiuse = (t.match(/\}/g) || []).length
      expect(aperte - chiuse).toBe(0)
    })

    it(foglio + ': nessuna regola resta appesa dentro un’altra', () => {
      // Un selettore che parte a colonna zero mentre siamo ancora dentro un
      // blocco: quasi sempre è la graffa mancante della regola precedente.
      // Dentro una media query le regole sono rientrate, quindi non scatta.
      const righe = testo().split('\n')
      let livello = 0
      const appese = []
      for (let i = 0; i < righe.length; i++) {
        const riga = righe[i]
        const prima = livello
        livello += (riga.match(/\{/g) || []).length - (riga.match(/\}/g) || []).length
        if (prima > 0 && /^[.#a-zA-Z@]/.test(riga)) {
          appese.push(i + 1 + ': ' + riga.slice(0, 50))
        }
      }
      expect(appese).toEqual([])
    })
  }
})

// ── IL TEMA DEVE ARRIVARE DAPPERTUTTO ────────────────────────────────
//
// L'oro di casa era scritto a mano in una dozzina di posti — il tab
// acceso, il «+», i tasti dei pannelli — e cambiando tema quelli
// restavano dorati: si sceglieva Pico e metà schermata non se ne
// accorgeva. Il colore dell'azione è UNO, e sta nei token.
describe('i colori dell’azione vengono dal tema, non dal foglio', () => {
  const CABLATI = ['#f7c45e', '#e8a32e', '#1c1305']

  for (const foglio of fogli) {
    it(foglio + ': l’oro compare solo dove si dichiarano i token', () => {
      const righe = readFileSync(join(CARTELLA, foglio), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(String.fromCharCode(10))
      const colpevoli = righe.filter(
        (r) => CABLATI.some((c) => r.toLowerCase().includes(c)) && !/^\s*--/.test(r)
      )
      expect(colpevoli).toEqual([])
    })
  }
})

// ── LE VISTE LARGHE NON SONO UNA COLONNA SOLA ────────────────────────
// Il flusso di cassa era una striscia verticale: giusta sul telefono, da
// scorrere all'infinito su un monitor mentre si conta la cassa.
describe('il flusso di cassa si dispone in griglia sugli schermi larghi', () => {
  const foglio = () => readFileSync(join(CARTELLA, 'index.css'), 'utf8')

  it('a schermo stretto resta una colonna, e la griglia scatta dopo', () => {
    const css = foglio()
    const i = css.indexOf('.cassa-flusso')
    expect(i).toBeGreaterThan(-1)
    // La griglia vive dentro una media query: senza, il telefono si
    // ritroverebbe due colonne da 160px.
    const dopo = css.slice(i)
    expect(dopo).toMatch(/@media \(min-width: 760px\)[\s\S]{0,400}grid-template-columns/)
  })

  it('l’andamento e la chiusura restano larghi tutta la riga', () => {
    expect(foglio()).toMatch(/\.cassa-larga[\s\S]{0,200}grid-column: 1 \/ -1/)
  })
})

// ── SUL TELEFONO LE CORSIE SI IMPILANO ───────────────────────────────
//
// Cinque o sei colonne su uno schermo di telefono non ci stanno: ognuna
// diventa una striscia dove non entra nemmeno il nome di un drink. E a
// dire quando c'è spazio dev'essere la LARGHEZZA VERA DELLA LAVAGNA, non
// la finestra: col menu agganciato alla pagina la lavagna ha 200-250px in
// meno di quello che dice la finestra. Contare gli elementi al posto dello
// spazio ha già spaccato il disegno una volta (BUG-021).
describe('le corsie della coda si impilano quando lo spazio manca', () => {
  const foglio = () => readFileSync(join(CARTELLA, 'index.css'), 'utf8')

  it('di suo sono una colonna sola: la pila è il caso normale, non l’eccezione', () => {
    const css = foglio()
    const i = css.indexOf('.corsie {')
    expect(i).toBeGreaterThan(-1)
    expect(css.slice(i, i + 300)).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/)
  })

  it('la lavagna è il contenitore su cui si misura', () => {
    // TUTTE E DUE le lavagne, non solo le corsie: anche la griglia ha i
    // filtri sulla riga dei conteggi, e con la sola `.corsie-board` quella
    // @container non trovava nessun contenitore — la regola non si
    // applicava mai e sul telefono i filtri restavano schiacciati a destra.
    expect(foglio()).toMatch(/\.queue-board \{[\s\S]{0,120}container:\s*corsie \/ inline-size/)
    expect(foglio()).not.toMatch(/\.queue-board\.corsie-board \{[\s\S]{0,120}container:\s*corsie/)
  })

  it('le soglie sono @container, non @media sulla finestra', () => {
    const css = foglio()
    expect(css).toMatch(/@container corsie \(min-width: 560px\)[\s\S]{0,200}grid-template-columns/)
    expect(css).toMatch(/@container corsie \(min-width: 900px\)[\s\S]{0,200}grid-template-columns/)
    // E la media query sulla finestra non decide più quante colonne fare:
    // lì resta solo l'altezza della lavagna, che è un'altra domanda.
    const media = css.slice(css.indexOf('@media (min-width: 901px)'))
    expect(media.slice(0, 400)).not.toMatch(/grid-template-columns/)
  })
})

// ── UN CONTENITORE CHE SCORRE TAGLIA LE OMBRE ────────────────────────
//
// Le corsie della lavagna scorrono ognuna per conto suo (overflow-y: auto).
// Ma un contenitore che scorre taglia tutto quello che esce dai suoi bordi,
// e l'ombra della card esce: senza spazio attorno, le card risultavano
// mozzate a destra e in basso, e nelle colonne strette sembravano
// addirittura piatte — come se l'ombra non ci fosse mai stata.
//
// Lo spazio va DENTRO il contenitore che scorre, quindi è un `padding`
// della lista, non un margine delle card: un margine sarebbe finito fuori
// dal riquadro di scorrimento e sarebbe stato tagliato come l'ombra.
describe('le ombre delle card hanno spazio per esistere', () => {
  const css = readFileSync(join(CARTELLA, 'index.css'), 'utf8')
  const regola = (nome) => {
    const i = css.indexOf(`
${nome} {`)
    expect(i, `${nome} non c'è più`).toBeGreaterThan(-1)
    return css.slice(i, css.indexOf('}', i))
  }

  it('la lista di una corsia lascia spazio sotto e ai lati', () => {
    const r = regola('.corsia-lista')
    // Non basta che un padding ESISTA: il primo giro ne aveva messo uno
    // da 6px e l'ombra usciva tagliata lo stesso. La misura viene
    // dall'ombra (0 4px 18px): almeno la sfocatura ai lati, sfocatura più
    // scostamento in basso.
    const m = r.match(/padding:\s*\d+px (\d+)px (\d+)px/)
    expect(m, 'la lista scorre e taglierebbe l’ombra: serve un padding').toBeTruthy()
    expect(Number(m[1]), 'ai lati ci sta la sfocatura intera (18px)').toBeGreaterThanOrEqual(16)
    expect(Number(m[2]), 'sotto ci stanno sfocatura più scostamento (22px)').toBeGreaterThanOrEqual(22)
  })

  it('e non fa comparire una barra orizzontale per quei pochi pixel', () => {
    // `overflow-y: auto` rende l'asse X `auto` a sua volta: senza dirlo
    // esplicitamente, lo spazio dell'ombra diventa una barra di
    // scorrimento orizzontale in fondo a ogni colonna.
    expect(regola('.corsia-lista')).toMatch(/overflow-x:\s*clip/)
  })
})

// ── I COLORI STRUTTURALI STANNO NEI GETTONI, NON IN BIANCHI FISSI ────
//
// Un bianco trasparente scritto a mano (rgba(255,255,255,…)) nasce per il
// fondo scuro e sul tema chiaro sparisce: è successo alla striscia degli
// stati spenti, poi ai tasti delle impostazioni e ai filtri — «hai
// aggiunto il bordo solo sul tema scuro» (l'utente, 20/08). I gettoni
// --line e --tile-bg hanno già la variante chiara (data-luma): bordo e
// fondo di un controllo si scrivono con quelli.
// Qui si sorvegliano i due controlli già corretti, non tutto il foglio:
// i bianchi fissi rimasti altrove si bonificano quando si tocca la loro
// schermata, non a tappeto.
describe('i controlli delle impostazioni seguono il tema', () => {
  const css = readFileSync(join(CARTELLA, 'index.css'), 'utf8')
  const regola = (nome) => {
    const i = css.indexOf(`
${nome} {`)
    expect(i, `${nome} non c'è più`).toBeGreaterThan(-1)
    return css.slice(i, css.indexOf('}', i))
  }

  it.each(['.mode-option', '.chip'])('%s non usa bianchi fissi per bordo e fondo', (sel) => {
    const r = regola(sel)
    expect(r, `${sel}: bordo/fondo vanno sui gettoni --line/--tile-bg`).not.toMatch(
      /rgba\(255,\s*255,\s*255/
    )
    expect(r).toMatch(/var\(--line\)/)
    expect(r).toMatch(/var\(--tile-bg\)/)
  })
})

// ── LA COLONNA DEL «CHIUDI CASSA» NON STIRA IL SUO TASTO (BUG-062) ───
//
// Il tasto sta incolonnato con la riga che spiega perché non si può
// chiudere — «Chiudi 3 conti e 2 comande» — e in una colonna con
// `align-items: stretch` la larghezza la fa il figlio più largo: il
// bottone veniva lungo quanto la frase, il doppio del suo nome, in una
// testata dove lo spazio è della barra di ricerca.
//
// La prima cura era stata togliere la frase, e ha tolto anche la sola cosa
// che diceva perché il tasto è grigio: «è scomparsa la label sotto al
// tasto» (l'utente, 20/08). La frase è tornata, e a tenere stretto il
// bottone adesso c'è l'allineamento. Questo test sorveglia quello, che il
// DOM da solo non lo può dire: jsdom non fa layout.
describe('il tasto della cassa resta largo quanto il suo nome', () => {
  const css = readFileSync(join(CARTELLA, 'index.css'), 'utf8')
  const regola = (nome) => {
    const i = css.indexOf(`
${nome} {`)
    expect(i, `${nome} non c'è più`).toBeGreaterThan(-1)
    return css.slice(i, css.indexOf('}', i))
  }

  it('la colonna centra i figli invece di stirarli', () => {
    const r = regola('.board-cassa-box')
    expect(r).toMatch(/align-items:\s*center/)
    expect(r, 'con stretch il bottone torna largo quanto la frase').not.toMatch(
      /align-items:\s*stretch/
    )
  })

  it('e la frase resta una riga sola, o alzerebbe tutta la testata', () => {
    expect(regola('.board-cassa-perche')).toMatch(/white-space:\s*nowrap/)
  })
})

// ── I DUE TASTINI DELLA FILA DEI FILTRI NON SCORRONO VIA ─────────────
//
// I DUE TASTINI NON STANNO PIÙ DENTRO LA FILA DEI CHIP. Ci stavano, e la
// fila doveva quindi esistere sempre — anche a filtri chiusi, per
// contenerli. «Il tasto dei filtri deve essere sulla destra insieme a
// quello dell'ordinamento non a sinistra dei filtri. […] i filtri devono
// uscire sotto» (l'utente, 20/08/2026): adesso si appoggiano a una riga che
// c'è comunque (i conteggi, la ricerca) e la fila dei chip esiste solo da
// aperta. `.chips-tastini` e il suo `sticky` non servono più: non c'è più
// una riga che scorre da cui restare fuori.
//
// Il DOM da solo non lo può dire: jsdom non fa layout. Si sorveglia il
// foglio.
describe('i due tastini che governano la vista', () => {
  const css = readFileSync(join(CARTELLA, 'index.css'), 'utf8')
  const regola = (nome) => {
    const i = css.indexOf(`
${nome} {`)
    expect(i, `${nome} non c'è più`).toBeGreaterThan(-1)
    return css.slice(i, css.indexOf('}', i))
  }

  it('stanno in fondo a destra della riga che li ospita', () => {
    const r = regola('.coda-tastini')
    expect(r).toMatch(/margin-left:\s*auto/)
    // La riga dei conteggi allinea alla BASE del testo: un tastino
    // allineato alla base pende.
    expect(r).toMatch(/align-self:\s*center/)
    // e non si stringono per far posto al testo dei conteggi
    expect(r).toMatch(/flex-shrink:\s*0/)
  })

  // ERANO SENZA RIQUADRO PER UN GIRO, e l'utente li ha rimandati indietro a
  // metà strada: «Ok, così com'è filtri, aggiungi un bordo e rendilo un
  // bottone ma lascia la freccetta e la scritta filtri. Il tasto non farlo
  // troppo alto come gli altri, stessa cosa per la freccetta
  // dell'ordinamento. Stessa dimensione dei filtri» (20/08/2026). Senza
  // riquadro non si vedeva che erano tasti; a 44px, in una riga di testo,
  // erano uno scalino.
  it('sono bottoni col riquadro, ma bassi — non i 44px degli altri', () => {
    const r = regola('.coda-tastino')
    expect(r).toMatch(/border:\s*1px solid var\(--line\)/)
    expect(r).toMatch(/background:\s*var\(--tile-bg\)/)
    expect(r).toMatch(/border-radius:\s*var\(--raggio-pill\)/)
    // L'altezza è quella dei chip della fila: sono la stessa specie di
    // comando e in riga si devono somigliare.
    expect(r).toMatch(/min-height:\s*var\(--tastino-alto\)/)
    expect(css).toMatch(/--tastino-alto:\s*34px/)
  })

  it('e sono gemelli: il verso della coda è quadrato, alto come i filtri', () => {
    // «Stessa dimensione dei filtri»: stessa altezza, e siccome è una
    // freccia sola il riquadro si fa quadrato invece che una pastiglia
    // lunga piena d'aria.
    const r = regola('.coda-tastino.solo-icona')
    expect(r).toMatch(/min-width:\s*var\(--tastino-alto\)/)
  })

  it('non alzano la riga dei conteggi: sporgono, non la spingono', () => {
    // Sono più alti del testo dei conteggi. Su una lavagna guardata da
    // lontano ogni pixel di testata è una comanda in meno sotto: i margini
    // negativi tolgono dall'altezza di riga quello che sporge, e i tasti
    // escono dentro il `gap` della testata, che c'è comunque.
    //
    // ED È UN CONTO, NON UN NUMERO BATTUTO A MANO. Era un `-5px` — il
    // risultato della sottrazione copiato nel foglio — e ritoccando
    // `--tastino-alto` i tasti tornavano ad alzare la riga senza che da
    // quel numero si capisse perché. Adesso l'altezza del tastino è
    // l'unico numero e la compensazione lo segue.
    const r = regola('.board-sotto .coda-tastini')
    expect(r).toMatch(/margin-block:\s*calc\(\(1lh - var\(--tastino-alto\)\) \/ 2\)/)
    // `1lh` si legge dall'altezza di riga di QUESTA regola: lasciata a
    // `normal` dipenderebbe dal font di ogni browser.
    expect(r).toMatch(/line-height:\s*[\d.]+/)
    // E SOLO LÌ: la stessa classe sta anche in riga col campo di ricerca
    // (lista e schede), che è alto quanto i tastini — lì non c'è niente da
    // compensare.
    expect(regola('.coda-tastini')).not.toMatch(/margin-block/)
  })

  it('la fila dei chip va a capo invece di scorrere, o taglierebbe la tendina', () => {
    // Dentro un contenitore che scorre in orizzontale un pannello in
    // `position: absolute` viene TAGLIATO: la tendina dello staff si
    // aprirebbe dentro una riga alta 40px.
    //
    // E LA FILA DICHIARA IL SUO. Indossava `.chips-row` — che scorre e non
    // va a capo — per poi disdirne metà: `overflow: visible` e
    // `flex-wrap: wrap` erano lì solo per annullare quello che la classe
    // di sopra aveva appena messo. Nel JSX adesso c'è `chips-filtri` da
    // sola, e quello che le serve si legge tutto in una regola.
    const r = regola('.chips-filtri')
    expect(r).toMatch(/display:\s*flex/)
    expect(r).toMatch(/flex-wrap:\s*wrap/)
    expect(r).toMatch(/gap:\s*6px/)
    expect(r).not.toMatch(/overflow/)
    expect(css).not.toMatch(/chips-row chips-filtri/)
  })

  // «E i tasti dei filtri, tutti, devono essere leggermente più piccoli»
  // (l'utente, 20/08/2026). Deroga circoscritta ai 44px di
  // docs/navigazione.md: vale SOLO dentro la fila dei filtri, che si tocca
  // quando si decide cosa guardare — non con l'ordine in mano.
  it('e i chip della fila sono leggermente più piccoli degli altri', () => {
    const filtri = regola('.chips-filtri .chip')
    expect(filtri).toMatch(/min-height:\s*var\(--tastino-alto\)/)
    // «Leggermente», non minuscoli: si resta sopra i 30px e sotto la
    // misura piena del chip, che è 40.
    const pieno = regola('.chip')
    expect(pieno).toMatch(/min-height:\s*40px/)
    const corpo = Number(/font-size:\s*([\d.]+)rem/.exec(filtri)[1])
    expect(corpo).toBeLessThan(0.95)
    expect(corpo).toBeGreaterThan(0.8)
  })

  // LA SECONDA RIGA NON ESISTE PIÙ. La scelta delle colonne aveva una fila
  // sua sotto quella dei filtri — chip che aprivano chip — e l'utente l'ha
  // bocciata: «quei filtri devono apparire sulla stessa riga degli altri
  // tasti» (20/08/2026). Adesso quei tasti si accodano ai fratelli e non
  // hanno più bisogno di una classe loro.
  it('la scelta delle colonne non ha più una riga sua', () => {
    expect(css).not.toMatch(/\n\.corsie-scelta \{/)
  })

  // ── IL PRONTO E IL SUO TASTINO SI TOCCANO ────────────────────
  //
  // «Dividi il pronto dobbiamo integrarlo meglio con gli altri due
  // bottoni, in qualche modo non si capisce a che serve» (l'utente,
  // 20/08/2026). In quella fila ogni chip è uguale all'altro e fa la
  // stessa cosa: il taglio del pronto, vestito uguale e messo in fondo,
  // era indistinguibile. Attaccati e col bordo condiviso si legge «questi
  // sono una cosa sola» — e a dirlo dev'essere il DISEGNO, non una frase.
  it('i chip di un gruppo si toccano, con gli angoli tondi solo agli estremi', () => {
    const r = regola('.chip-gruppo')
    expect(r).toMatch(/display:\s*inline-flex/)
    // Niente gap: fra i due c'è la cucitura, non uno spazio.
    expect(r).not.toMatch(/gap:/)
    // Il -1px è la cucitura: senza, i bordi si sommano e la giuntura è
    // spessa il doppio del resto.
    expect(regola('.chip-gruppo > .chip + .chip')).toMatch(/margin-left:\s*-1px/)
    expect(regola('.chip-gruppo > .chip')).toMatch(/border-radius:\s*0/)
    expect(regola('.chip-gruppo > .chip:first-child')).toMatch(/var\(--raggio-pill\)/)
    expect(regola('.chip-gruppo > .chip:last-child')).toMatch(/var\(--raggio-pill\)/)
  })

  it('il tastino del gruppo sta stretto: è un segno solo, non una parola', () => {
    // Attorno a un carattere una pastiglia larga come le altre è tutta
    // aria, e in una fila di sei o sette chip quell'aria è una riga in più.
    const laterale = (r) => Number(/padding:\s*[\d.]+px\s+([\d.]+)px/.exec(r)[1])
    expect(laterale(regola('.chips-filtri .chip-taglio'))).toBeLessThan(
      laterale(regola('.chips-filtri .chip'))
    )
    // E UNA REGOLA SOLA: c'era anche un `.chip-taglio` nudo che non ha mai
    // colorato un pixel — il tastino esiste solo dentro la fila, e lì
    // questa lo sovrascriveva per intero. Due regole di cui una morta
    // fanno ritoccare il valore sbagliato.
    expect(css).not.toMatch(/\n\.chip-taglio \{/)
  })
})


// ── I TASTI DI UNA CARD STRETTA SI IMPILANO (BUG-063) ────────────────
//
// «Quando sono attive tutte le lane il layout delle card si sballa. Nel
// caso siano troppo strette per i tasti, li impiliamo verticalmente» — e,
// col secondo screenshot: «anche con 4 corsie succede. Ovviamente dobbiamo
// farlo in modo che sia dinamico» (l'utente, 20/08/2026).
//
// I tasti sono TRE: «🧾 Conto», «⋯ Azioni» e quello che porta avanti il
// lavoro. In fila vogliono quasi 280px; in una colonna su sette ce ne sono
// 120, e si schiacciavano fino a tagliare le parole.
//
// jsdom non fa layout: la regola si sorveglia sul foglio, che è l'unico
// posto dove esiste.
describe('i tasti di una card di corsia si impilano quando manca la larghezza', () => {
  const css = readFileSync(join(CARTELLA, 'index.css'), 'utf8')
  const regola = (nome) => {
    const i = css.indexOf(`
${nome} {`)
    expect(i, `${nome} non c'è più`).toBeGreaterThan(-1)
    return css.slice(i, css.indexOf('}', i))
  }

  it('a misurare è la CARD, non la finestra e non il numero di colonne', () => {
    // La stessa card è stretta con sette corsie e larga con tre, sullo
    // stesso schermo: contare le colonne sarebbe l'errore di BUG-021, e
    // una media query sulla finestra mente di 250px col menu agganciato.
    expect(regola('.corsia-card')).toMatch(/container:\s*card-corsia \/ inline-size/)
    const impila = css.slice(css.indexOf('@container card-corsia (max-width: 300px)'))
    expect(impila.length).toBeGreaterThan(0)
    // e non c'è nessuna @media sulla finestra a decidere il piede
    expect(css).not.toMatch(/@media[^{]*\{[\s\S]{0,200}\.corsia-piede/)
  })

  it('il piede può andare a capo: è la premessa di tutto il resto', () => {
    expect(regola('.corsia-piede')).toMatch(/flex-wrap:\s*wrap/)
  })

  it('primo passo: il tasto grande scende sotto, a tutta larghezza', () => {
    // È il gesto più frequente della serata — si preme di corsa e al buio
    // — e quando lo spazio manca CRESCE invece di stringersi.
    const blocco = css.slice(
      css.indexOf('@container card-corsia (max-width: 300px)'),
      css.indexOf('@container card-corsia (max-width: 200px)')
    )
    expect(blocco).toMatch(/\.corsia-azione\s*\{[^}]*flex:\s*1 0 100%/)
    // e i due piccoli si spartiscono la riga di sopra invece di restare
    // affiancati e mezzi vuoti
    expect(blocco).toMatch(/\.corsia-azioni\s*\{[^}]*flex:\s*1 1 0/)
  })

  it('secondo passo: sotto i 200px vanno in colonna tutti e tre', () => {
    const i = css.indexOf('@container card-corsia (max-width: 200px)')
    const blocco = css.slice(i, i + 400)
    expect(blocco).toMatch(/\.corsia-piede\s*\{[^}]*flex-direction:\s*column/)
    expect(blocco).toMatch(/width:\s*100%/)
  })

  it('e il tempo non va a capo una lettera per riga', () => {
    // «5 min» si spezzava in verticale accanto al numero del conto: è
    // testo corto e va tenuto intero, a cedere è il nome del tavolo.
    expect(regola('.corsia-quando')).toMatch(/white-space:\s*nowrap/)
    expect(regola('.corsia-card > .row.between')).toMatch(/flex-wrap:\s*wrap/)
  })
})

// ── L'ORDINE DELLE REGOLE È LA REGOLA (BUG-064, REQ-UI-020) ──────────
//
// Sulla striscia da 4px a sinistra della card scrivono cinque famiglie di
// regole, tutte con lo stesso peso (`.order-card.qualcosa`): a parità di
// specificità decide chi sta più in basso nel foglio. Non è un dettaglio
// di stile, è la gerarchia dei significati — e scritta così è invisibile a
// chi riordina il foglio in buona fede.
//
// È già successo: `pagato-da-servire` era stata messa PRIMA delle `pay-*`,
// e nella griglia — l'unica vista dove la card porta tutte e due le classi
// — l'ambra non è mai comparsa. Un conto pagato e ancora da consegnare si
// vedeva verde come uno concluso, e chi passava a ritirare non aveva
// niente che glielo dicesse. Nelle corsie funzionava, perché lì le `pay-*`
// non ci sono: il difetto è vissuto mesi in produzione.
// L'a capo si scrive così e non con la sequenza di escape: il file passa
// per strumenti che quella sequenza la rimangiano, e una regola cercata
// senza a capo davanti troverebbe il primo selettore che le somiglia.
const A_CAPO = String.fromCharCode(10)

describe('la striscia della card: chi vince, e perché sta dove sta', () => {
  const css = readFileSync(join(CARTELLA, 'index.css'), 'utf8')
  const dove = (selettore) => {
    const i = css.indexOf(A_CAPO + selettore + ' {')
    expect(i, selettore + ' non c’è più').toBeGreaterThan(-1)
    return i
  }

  it('l’ambra del pagato-da-servire viene DOPO le regole del pagamento', () => {
    const ambra = dove('.order-card.pagato-da-servire')
    for (const pay of ['pay-aperto', 'pay-parziale', 'pay-pagato', 'pay-annullato']) {
      expect(ambra, `.order-card.${pay} vincerebbe sull’ambra`).toBeGreaterThan(
        dove('.order-card.' + pay)
      )
    }
  })

  it('e le regole del pagamento vengono dopo quelle della preparazione', () => {
    // L'ordine di prima non si è rotto sistemando quello dell'ambra.
    expect(dove('.order-card.pay-aperto')).toBeGreaterThan(dove('.order-card.pronto'))
  })

  it('il colore del conto sulla striscia è l’ULTIMA parola', () => {
    // Quando la classe c'è, è una scelta esplicita di chi manda avanti il
    // locale (impostazione «bordo_colore_conto») e deve vincere ovunque —
    // comprese le regole delle corsie, che stanno molto più in basso nel
    // foglio e a parità di peso vincerebbero.
    const bordo = dove('.order-card.bordo-conto')
    for (const prima of [
      '.order-card.pay-pagato',
      '.order-card.pagato-da-servire',
      '.corsia-card.pagato-da-servire',
      '.corsia-card.acconto',
    ]) {
      expect(bordo, prima + ' vincerebbe sul colore del conto').toBeGreaterThan(dove(prima))
    }
    expect(css.slice(bordo, bordo + 200)).toMatch(/border-left-color:\s*var\(--conto-colore\)/)
  })
})

// ── IL FONDO COLORATO SI DEVE VEDERE, E IL TESTO SI DEVE LEGGERE ─────
//
// «Il colore che viene assegnato al momento è sfumato ma è molto chiaro.
// Deve essere più visibile» (l'utente, 20/08/2026). Il fondo è passato da
// 16%/5% a 32%/12%, e i due numeri non hanno lo stesso peso.
// All'angolo c'è il NUMERO del conto, in --text: al 32% il caso peggiore
// delle dodici tinte per gli otto temi di themes.js è 4,4:1, e il 32% è il
// tetto — a 38% scende a 3,9. A metà cade il testo minore, in --muted, e
// lì si paga: il peggiore passa da 4,1 a 3,5 (Pico scuro e Catppuccin
// chiaro, i due temi che partivano stretti già sul fondo nudo). Il 12% è
// la soglia; chi la alza rifà quei conti prima, tema per tema.
// QUI SI SORVEGLIANO I NUMERI, non il contrasto: il calcolo sta scritto
// nel commento della regola in index.css, e un test che rifacesse la
// misura misurerebbe la propria formula.
describe('il colore del conto sul fondo della card', () => {
  const css = readFileSync(join(CARTELLA, 'index.css'), 'utf8')
  const regola = () => {
    const i = css.indexOf(A_CAPO + '.order-card.conto-colorato {')
    expect(i, '.order-card.conto-colorato non c’è più').toBeGreaterThan(-1)
    return css.slice(i, css.indexOf(A_CAPO + '}', i))
  }

  it('si vede: la tinta all’angolo è ben oltre il velo di prima', () => {
    const percentuali = [...regola().matchAll(/var\(--conto-colore\) (\d+)%/g)].map((m) =>
      Number(m[1])
    )
    expect(percentuali.length, 'la sfumatura ha due fermate colorate').toBe(2)
    expect(percentuali[0], 'all’angolo il colore si deve riconoscere da lontano').toBeGreaterThanOrEqual(28)
    expect(percentuali[1], 'a metà card ci passa sopra il testo minore').toBeLessThanOrEqual(12)
  })

  it('il testo sta su un fondo OPACO: si mescola con --card, non con la trasparenza', () => {
    // Mescolando con `transparent` ogni fermata è mezza trasparente, e
    // quello che c'è sotto — un altro tema, una card evidenziata — se ne
    // porta via un pezzo. Mescolata con --card, la tinta è un colore pieno
    // e il contrasto misurato è quello che si vede davvero.
    const r = regola()
    expect(r).toMatch(/color-mix\(in srgb, var\(--conto-colore\) \d+%, var\(--card\)\)/)
    expect(r).not.toMatch(/var\(--conto-colore\) \d+%, transparent/)
  })

  it('e l’alone dello stato resta sopra, da sinistra', () => {
    // Due sfumature, due domande: il passo del lavoro entra da sinistra, il
    // colore del conto scende dall'angolo. Riscrivendo il `background` è la
    // prima cosa che si perde.
    expect(regola()).toMatch(/linear-gradient\(90deg, var\(--tinta-stato/)
    expect(regola()).toMatch(/linear-gradient\(\s*135deg/)
  })
})

// ── I RIQUADRI DELLE SEZIONI NON DANNO PER SCONTATO IL TEMA SCURO ─────
//
// BUG-065. Segnalato al banco: «in alcune voci del menù e impostazioni vengono
// usati ancora dei box bianchi». Erano le superfici scritte con bianchi
// trasparenti — nati per il fondo scuro, dove un velo bianco è rilievo —
// che sul tema chiaro, con --card a #ffffff, diventavano un rettangolo
// bianco su fondo chiaro col bordo invisibile. I colori strutturali
// stanno nei gettoni (--line, --tile-bg, --velo-superficie), che hanno
// già la loro variante chiara.
describe('le superfici delle sezioni seguono il tema', () => {
  const css = () => readFileSync(join(CARTELLA, 'index.css'), 'utf8')

  // Il corpo di una regola, commenti tolti: quello che il browser applica.
  function regola(nome) {
    const testo = css().replace(/\/\*[\s\S]*?\*\//g, '')
    const i = testo.indexOf(A_CAPO + nome + ' {')
    expect(i, nome + ' non esiste più nel foglio').toBeGreaterThan(-1)
    return testo.slice(i, testo.indexOf('}', i))
  }

  const SUPERFICI = ['.card', '.toggle-row', '.cat-chip', '.group-tile', '.mode-option', '.chip']

  for (const nome of SUPERFICI) {
    it(nome + ': fondo e bordo vengono dai gettoni, non da un bianco fisso', () => {
      const corpo = regola(nome)
      const bianchi = corpo
        .split('\n')
        .filter((r) => /^\s*(background|border)/.test(r) && /rgba\(\s*255,\s*255,\s*255/.test(r))
      expect(bianchi).toEqual([])
    })
  }

  it('il velo di rilievo è un gettone, e sul tema chiaro si toglie', () => {
    const testo = css()
    expect(testo).toMatch(/--velo-superficie:\s*linear-gradient/)
    // La variante chiara: senza, il velo bianco resterebbe sul bianco.
    expect(testo).toMatch(/\[data-luma='light'\][\s\S]{0,300}--velo-superficie:\s*none/)
  })
})

// ── IL NOME DELLA SEZIONE SI DEVE LEGGERE ────────────────────────────
//
// Era `0.75rem` in maiuscoletto grigio: dodici pixel, e dentro un
// riquadro pieno di interruttori chi cercava «Stampante» andava a
// tentativi. È il titolo che dice cosa c'è nel riquadro, non
// un'etichetta di servizio.
describe('i titoli di sezione sono titoli', () => {
  const css = () => readFileSync(join(CARTELLA, 'index.css'), 'utf8')

  function regola(nome) {
    const testo = css().replace(/\/\*[\s\S]*?\*\//g, '')
    const i = testo.indexOf(A_CAPO + nome + ' {')
    expect(i, nome + ' non esiste più nel foglio').toBeGreaterThan(-1)
    return testo.slice(i, testo.indexOf('}', i))
  }

  it('il titolo di sezione non scende sotto 1rem', () => {
    const corpo = regola('.settings-section h3')
    const m = /font-size:\s*([\d.]+)rem/.exec(corpo)
    expect(m, 'il titolo di sezione deve dichiarare una misura').not.toBe(null)
    expect(Number(m[1])).toBeGreaterThanOrEqual(1)
  })

  it('il titolo di sezione non è maiuscoletto slavato', () => {
    const corpo = regola('.settings-section h3')
    expect(corpo).not.toMatch(/text-transform:\s*uppercase/)
    expect(corpo).not.toMatch(/color:\s*var\(--muted\)/)
    expect(corpo).toMatch(/color:\s*var\(--text\)/)
  })

  it('il sottotitolo sta un gradino sotto, e non è più uno style inline', () => {
    const sotto = regola('.settings-section h4')
    const m = /font-size:\s*([\d.]+)rem/.exec(sotto)
    expect(m).not.toBe(null)
    const titolo = /font-size:\s*([\d.]+)rem/.exec(regola('.settings-section h3'))
    expect(Number(m[1])).toBeLessThan(Number(titolo[1]))
  })
})


// ── I TASTI DI UNA CARD DELLA CODA STANNO A UNA MISURA SOLA ──────────
//
// «I tasti della card avvicinali in verticale 1/2 pixel (comunque di
// pochissimo)» (l'utente, 20/08/2026). Erano due numeri battuti a mano —
// 8px nel menu che si apre, 6px nel piede — e gli stessi tasti, a un dito
// di distanza, avevano due arie diverse.
//
// SI STRINGE LO SPAZIO, NON I TASTI: i bersagli restano quelli di
// docs/navigazione.md. E lo stacco dal contenuto sopra
// (`margin-top`/`padding-top` di `.corsia-azioni-aperte`) NON si tocca: sta
// lì perché il primo tasto del menu non sembri la seconda riga di quello
// del piede, e sotto ce n'è uno che rimanda indietro una comanda.
//
// Dal foglio e non dal DOM: happy-dom non applica il CSS, e una misura
// scritta due volte si scolla al primo ritocco senza che nessun test se ne
// accorga.
describe('i tasti di una card della coda hanno un solo respiro', () => {
  const css = () => readFileSync(join(CARTELLA, 'index.css'), 'utf8')

  const regola = (nome) => {
    const testo = css().replace(/\/\*[\s\S]*?\*\//g, '')
    const i = testo.indexOf(A_CAPO + nome + ' {')
    expect(i, nome + ' non esiste più nel foglio').toBeGreaterThan(-1)
    return testo.slice(i, testo.indexOf('}', i))
  }

  it('il gettone c’è, ed è di pochissimo più stretto degli 8px di prima', () => {
    const m = /--gap-tasti-card:\s*(\d+)px/.exec(css())
    expect(m, 'il respiro dei tasti della card è un gettone, non un numero sparso').not.toBe(null)
    const px = Number(m[1])
    expect(px).toBeLessThan(8)
    // «Di pochissimo»: uno o due pixel. A 4 i tasti si toccherebbero, e in
    // un menu dove uno rimanda indietro una comanda è un errore vero.
    expect(px).toBeGreaterThanOrEqual(6)
  })

  it('e lo usano tutti e due i posti dove quei tasti stanno', () => {
    expect(regola('.corsia-piede')).toMatch(/gap:\s*var\(--gap-tasti-card\)/)
    expect(regola('.corsia-azioni-aperte')).toMatch(/gap:\s*var\(--gap-tasti-card\)/)
  })

  it('lo stacco dal contenuto sopra resta dov’era', () => {
    // Il menu non deve attaccarsi alla card: la riga di sopra è
    // informazione, questi sono tasti, e presi di corsa si confondono.
    const r = regola('.corsia-azioni-aperte')
    expect(r).toMatch(/margin-top:\s*14px/)
    expect(r).toMatch(/padding-top:\s*12px/)
    expect(r).toMatch(/border-top:/)
  })
})

// ── I GETTONI DELLA TAVOLOZZA SI PRENDONO COL POLLICE ────────────────
//
// La tavolozza del conto stava dentro il ⋯ della card, e lì i gettoni
// erano 26px (34 sul touch) perché dovevano stare in una fila stretta:
// sotto la soglia di docs/navigazione.md, e per un colore preso male due
// tavoli si confondono. Adesso la tavolozza ha la sua modale e lo spazio
// c'è: 48px per tutti, senza più la deroga del puntatore grosso.
describe('la tavolozza del conto ha bersagli pieni', () => {
  const css = () => readFileSync(join(CARTELLA, 'index.css'), 'utf8')

  const regola = (nome) => {
    const testo = css().replace(/\/\*[\s\S]*?\*\//g, '')
    const i = testo.indexOf(A_CAPO + nome + ' {')
    expect(i, nome + ' non esiste più nel foglio').toBeGreaterThan(-1)
    return testo.slice(i, testo.indexOf('}', i))
  }

  it('un gettone non scende sotto i 44px', () => {
    const r = regola('.colore-conto')
    const w = /width:\s*(\d+)px/.exec(r)
    const h = /height:\s*(\d+)px/.exec(r)
    expect(w, 'il gettone deve dichiarare la sua misura').not.toBe(null)
    expect(Number(w[1])).toBeGreaterThanOrEqual(44)
    expect(Number(h[1])).toBeGreaterThanOrEqual(44)
  })

  it('e non c’è più una misura a parte per il touch', () => {
    // Era la deroga di quando i gettoni stavano nel menu: due misure per
    // la stessa cosa, e quella piccola era il caso normale.
    expect(css()).not.toMatch(/pointer: coarse\)[\s\S]{0,120}\.colore-conto/)
  })
})

// ── IL ☰ DELLA LAVAGNA, E LE TRE FASCE DELLA TESTATA SUL TELEFONO ────
//
// Due segnalazioni dello stesso giorno, e una cura sola.
//
// «Il tasto menu va a finire sulla label» (l'utente, 21/08/2026): il ☰ era
// un tasto FISSO nell'angolo, fuori dal flusso, e la testata gli teneva il
// posto a mano — 54px di rientro sul titolo, 62 sull'avviso della cassa, un
// `top` calcolato per centrarlo sulla riga 1. A pagina in cima tornava; ma
// la coda SCORRE, e scorrendo la testata gli passava sotto: il conteggio
// dei conti e il nome del terminale mangiati per i primi 36px. Un tasto
// fisso sopra una pagina che scorre finisce, prima o poi, su quello che
// c'è scritto sotto. Nel flusso il posto non si tiene: si occupa.
//
// «Il layout sopra le card non è il massimo su mobile» (l'utente, stesso
// giorno): quattro fasce prima della prima card, e la terza erano i due
// tastini soli, spinti a destra. Adesso sono tre.
//
// Queste sono le misure che tengono in piedi le due cose: un riordino
// futuro le può cambiare, ma non in silenzio.
describe('la testata della lavagna: il ☰ nel flusso, tre fasce sul telefono', () => {
  const css = readFileSync(join(CARTELLA, 'index.css'), 'utf8')
  const regola = (nome) => {
    const i = css.indexOf(`
${nome} {`)
    expect(i, `${nome} non c'è più`).toBeGreaterThan(-1)
    return css.slice(i, css.indexOf('}', i))
  }
  // Il blocco di una media query, dall'apertura alla sua chiusura. SENZA
  // COMMENTI: qui dentro si controlla anche che certe regole NON ci siano
  // più, e i commenti le nominano apposta per dire perché sono sparite —
  // cercarle nel testo le ritroverebbe tutte.
  // E LA SOGLIA NON BASTA A IDENTIFICARE IL BLOCCO: di `@media (max-width:
  // 700px)` il foglio ne ha più d'uno, e parlano di cose diverse. Si dice
  // anche di quale si sta parlando, con una classe che sta solo lì.
  const pulito = nudo(css)
  const dentro = (query, marcatore) => {
    let da = 0
    for (;;) {
      const i = pulito.indexOf(query, da)
      expect(i, `${query} con ${marcatore} non c'è più`).toBeGreaterThan(-1)
      let livello = 0
      for (let k = pulito.indexOf('{', i); k < pulito.length; k++) {
        if (pulito[k] === '{') livello++
        else if (pulito[k] === '}') {
          livello--
          if (livello === 0) {
            const blocco = pulito.slice(i, k)
            if (blocco.includes(marcatore)) return blocco
            da = k
            break
          }
        }
      }
    }
  }
  const TELEFONO = '@media (max-width: 700px)'
  const TABLET = '@media (min-width: 701px)'
  const STRETTO = '@media (max-width: 640px)'

  it('il ☰ della coda non è fisso: sta nel flusso della testata', () => {
    const r = regola('.board-burger')
    expect(r).not.toMatch(/position:\s*fixed/)
    expect(r).not.toMatch(/position:\s*absolute/)
    // Quadrato, e il lato lo legge dalla fascia: una misura sola.
    expect(r).toMatch(/width:\s*var\(--coda-riga\)/)
    expect(r).toMatch(/height:\s*var\(--coda-riga\)/)
  })

  it('la fascia dichiara la sua altezza, e sul telefono è un bersaglio pieno', () => {
    // 44px è il minimo di docs/navigazione.md: sul telefono il ☰ si preme
    // col pollice, di corsa. Da tablet in su la riga era già stata
    // allineata a 42, e quella misura non si tocca.
    expect(regola('.board-head')).toMatch(/--coda-riga:\s*44px/)
    expect(dentro(TABLET, '--coda-riga')).toMatch(/--coda-riga:\s*42px/)
  })

  it('e nessuno tiene più il posto a un tasto che nel flusso non c’era', () => {
    // Il rientro del titolo (54px sul telefono, un calc da tablet in su) e
    // quello dell'avviso «Cassa chiusa» (62px) esistevano solo per non
    // finire sotto al ☰ flottante.
    expect(css).not.toMatch(/\.queue-board > \.banner \{[^}]*padding-left/)
    expect(dentro(TELEFONO, '.board-title')).not.toMatch(/\.board-title \{[^}]*padding-left/)
    expect(dentro(TABLET, '.board-title')).not.toMatch(/padding-left:\s*calc\(12px \+ 42px/)
  })

  it('il guscio della ricerca sparisce da tablet in su', () => {
    // `display: contents` e il campo torna figlio della testata, in riga 1
    // dov'è sempre stato: il guscio serve solo al telefono, per tenere
    // insieme ricerca e tastini su una fascia sola.
    expect(regola('.board-cerca')).toMatch(/display:\s*contents/)
  })

  it('sul telefono le fasce sono tre, e in quest’ordine', () => {
    const tel = dentro(TELEFONO, '.board-cerca')
    // 1. titolo e azioni  2. ricerca e tastini  3. conteggi e legenda
    expect(tel).toMatch(/\.board-title \{[^}]*order:\s*1/)
    expect(tel).toMatch(/\.board-actions \{[^}]*order:\s*2/)
    expect(tel).toMatch(/\.board-cerca \{[^}]*order:\s*3/)
    expect(tel).toMatch(/\.board-sotto \{[^}]*order:\s*4/)
    // le due fasce larghe vanno a capo da sé
    expect(tel).toMatch(/\.board-cerca \{[^}]*flex-basis:\s*100%/)
    // e i chip dei filtri escono SOTTO il tastino che li apre: stanno
    // dentro `.board-sotto`, che è la fascia dopo.
  })

  it('e il titolo si accorcia coi puntini invece di andare a capo', () => {
    // «In servizio» spezzato in due alzava la fascia di una riga intera per
    // due parole, e sotto ci sono le card.
    const tel = dentro(TELEFONO, '.board-title')
    const titolo = tel.slice(tel.indexOf('.board-title {'))
    expect(titolo.slice(0, titolo.indexOf('}'))).toMatch(/white-space:\s*nowrap/)
    expect(titolo.slice(0, titolo.indexOf('}'))).toMatch(/text-overflow:\s*ellipsis/)
  })

  it('la testata del telefono è dichiarata in un posto solo', () => {
    // Era in due blocchi (700px e 640px) con ordini diversi: valevano
    // tutt'e due e vinceva l'ultima scritta, cioè si leggeva il foglio e
    // non si capiva cosa succedesse su un telefono da 380px.
    expect(dentro(STRETTO, '.board-search')).not.toMatch(/order:/)
  })

  it('e il ➕ resta grande anche sul telefono', () => {
    // C'era un `.board-add` da 46px nel blocco dei 640px che non ha mai
    // colorato un pixel: la regola di base che lo fa da 60 sta più in basso
    // nel foglio, stesso peso, e a parità vince l'ultima scritta. È il
    // tasto che si prende di corsa e con le mani occupate.
    expect(regola('.board-add')).toMatch(/width:\s*60px/)
    expect(dentro(STRETTO, '.grid-card-main')).not.toMatch(/\.board-add/)
  })
})

// ── LE VIE ALTERNATIVE PER INCASSARE NON TOCCANO IL TASTO GRANDE ─────
//
// «Serve mettere un po' di spazio tra i due bottoni» (l'utente,
// 21/08/2026, con lo screenshot): «Riscuoti e servi · chiude il conto»
// stava appiccicato a «Riscuotere», e i due non erano nemmeno la stessa
// cosa — uno incassa, l'altro incassa E dà per servito tutto quanto.
// Attaccati sembravano un tasto e la sua seconda riga, e con le mani di
// corsa si prende quello sbagliato.
//
// Il difetto stava nel non-detto: le due varianti non avevano NESSUNA
// regola, quindi ereditavano margine zero da `.btn.block` mentre il tasto
// grande si prendeva i suoi 10px. Il foglio è l'unico posto dove si può
// sorvegliare: jsdom non fa layout.
//
// Dal 21/08 quelle due stanno anche AFFIANCATE, in una riga sola: qui si
// sorveglia pure quello — metà e metà quando ci stanno, a capo quando la
// schermata è stretta, tutta la larghezza quando ce n'è una sola.
describe('i tasti per incassare: staccati dal grande, e in riga fra loro', () => {
  const css = readFileSync(join(CARTELLA, 'index.css'), 'utf8')
  const stacco = (nome) => {
    const i = css.indexOf(`
${nome},`) >= 0 ? css.indexOf(`
${nome},`) : css.indexOf(`
${nome} {`)
    expect(i, `${nome} non c'è più`).toBeGreaterThan(-1)
    const blocco = css.slice(i, css.indexOf('}', i))
    const m = blocco.match(/margin-top:\s*(\d+)px/)
    return m ? Number(m[1]) : 0
  }
  const regola = (nome) => {
    const i = css.indexOf(`
${nome} {`)
    expect(i, `${nome} non c'è più`).toBeGreaterThan(-1)
    return css.slice(i, css.indexOf('}', i))
  }

  it('«senza stampa» e «riscuoti e servi» non si appoggiano a «Riscuotere»', () => {
    // Lo stacco si è spostato di un gradino: adesso le due varianti stanno
    // dentro una riga sola, ed è la riga a tenersi lontana dal tasto
    // grande. Il difetto sorvegliato è sempre quello — zero margine.
    expect(stacco('.payscreen-collect-alt')).toBeGreaterThanOrEqual(6)
  })

  it('e il tasto grande tiene il suo stacco da quello che ha sopra', () => {
    expect(stacco('.payscreen-collect')).toBeGreaterThanOrEqual(8)
  })

  // «I tasti "riscuoti senza stampa" e "riscuoti e servi" mettili
  // affiancati, non uno sopra l'altro» (l'utente, 21/08/2026).
  it('e le due varianti stanno in riga, metà e metà', () => {
    const r = regola('.payscreen-collect-alt')
    expect(r).toMatch(/display:\s*flex/)
    // Nessun `flex-direction: column` di ritorno: sarebbe l'impilata di
    // prima con un contenitore attorno.
    expect(r).not.toMatch(/flex-direction:\s*column/)
    expect(r).toMatch(/gap:\s*\d+px/)
  })

  it('quando ce n’è una sola prende tutta la larghezza', () => {
    // Le due condizioni sono indipendenti: capita che in riga ce ne sia
    // una sola, e metà tasto con un buco accanto non si guarda. Il
    // `flex-grow` a 1 la fa arrivare da sola fino in fondo.
    expect(regola('.payscreen-collect-alt > .btn')).toMatch(/flex:\s*1\s/)
  })

  it('su un telefono stretto vanno a capo invece di stringersi', () => {
    // Le scritte sono lunghe e una porta pure l'importo: a 360px due
    // colonne le spezzerebbero in parole mozze. Il `flex-wrap` con una
    // base larga le rimette una sotto l'altra, e il bersaglio resta da
    // pollice.
    expect(regola('.payscreen-collect-alt')).toMatch(/flex-wrap:\s*wrap/)
    const tasto = regola('.payscreen-collect-alt > .btn')
    const base = tasto.match(/flex:\s*1\s+1\s+(\d+)px/)
    expect(base, 'la base del flex non c’è più').not.toBeNull()
    expect(Number(base[1])).toBeGreaterThanOrEqual(180)
    const alto = tasto.match(/min-height:\s*(\d+)px/)
    expect(alto, 'il bersaglio da pollice non è più garantito').not.toBeNull()
    expect(Number(alto[1])).toBeGreaterThanOrEqual(44)
  })
})

describe('il tastierino del pagamento non finisce sotto «Riscuotere»', () => {
  const css = readFileSync(join(CARTELLA, 'index.css'), 'utf8')
  const regola = (nome) => {
    const i = css.indexOf(`
${nome} {`)
    expect(i, `${nome} non c'è più`).toBeGreaterThan(-1)
    return css.slice(i, css.indexOf('}', i))
  }

  // «Lo zoom al 120% nel pagamento fa sì che i tasti del tastierino
  // finiscano dietro al tasto Riscuotere» (l'utente, 21/08/2026).
  //
  // Perché succedeva: `#root` è scalato dallo zoom dell'app, quindi
  // l’altezza a disposizione in pixel CSS SCENDE quando si ingrandisce,
  // mentre il minimo dei tasti restava 44px secchi. Cinque righe da 44 più
  // i vuoti fanno un pavimento che non scende: la griglia sbordava dalla
  // sua scatola e l’ultima riga (00 0 = ←) finiva sotto «Riscuotere», che
  // ha il fondo pieno e la copriva.
  //
  // Qui si guarda il foglio, non il layout: jsdom non impagina. Misurato
  // in Chrome vero (1440×600 a zoom 1,2 e 1440×768 a zoom 1,5) il difetto
  // torna esatto rimettendo una delle due righe.
  it('i tasti valgono 44px VERI: il minimo segue lo zoom', () => {
    const r = regola('.paypad-key')
    // Non `min-height: 44px` secchi: dentro un contenitore scalato sarebbero
    // 52,8px veri a zoom 1,2 — garanzia già superata, e intanto la griglia
    // non ci sta più.
    expect(r, 'il minimo dei tasti non segue più lo zoom: il tastierino sborda').toMatch(
      /min-height:\s*calc\(\s*44px\s*\/\s*var\(--zoom,\s*1\)\s*\)/
    )
  })

  it('e se anche così non ci sta, il tastierino scorre invece di sbordare', () => {
    // La seconda rete, per le finestre molto basse tenute a zoom alto:
    // scorre il tastierino, non i tasti che incassano — quelli restano dove
    // sono. Su una schermata che maneggia soldi un tasto che non si vede è
    // peggio di un tasto scomodo.
    expect(regola('.paypad')).toMatch(/overflow-y:\s*auto/)
    expect(regola('.payscreen-collect')).toMatch(/flex-shrink:\s*0/)
  })
})

describe('le tre colonne del pagamento si trascinano, ma non fino a coprire il tastierino', () => {
  const css = readFileSync(join(CARTELLA, 'index.css'), 'utf8')
  const regola = (nome) => {
    const i = css.indexOf(`
${nome} {`)
    expect(i, `${nome} non c'è più`).toBeGreaterThan(-1)
    return css.slice(i, css.indexOf('}', i))
  }

  // «Rendi ridimensionabili le tre colonne della schermata pagamento come lo
  // sono quelle nel dettaglio dell'ordine» (l'utente, 21/08/2026). La
  // larghezza trascinata arriva dal JS come variabile CSS, esattamente come
  // --pos-comanda-w nel POS.
  it('la larghezza trascinata arriva dal JS, per tutte e due le colonne laterali', () => {
    expect(regola('.payscreen-items')).toMatch(/width:\s*min\(\s*var\(--pay-items-w/)
    expect(regola('.payscreen-methods')).toMatch(/width:\s*min\(\s*var\(--pay-methods-w/)
  })

  // IL TETTO IN PERCENTUALE È LA RETE DI BUG-075. La misura trascinata è in
  // pixel e resta scritta per quel terminale, ma i pixel CSS disponibili
  // dipendono dallo zoom dell'app: a zoom 1,6 una finestra da 1440 ne ha
  // 900. Senza tetto, una colonna larga trascinata a zoom 1 schiaccia il
  // centro a zoom alto — e lì sotto ci sono i tasti del tastierino.
  // Con 34% + 30% al centro resta sempre almeno il 36%.
  it('nessuna colonna laterale può mangiarsi il centro: tetto in percentuale', () => {
    const voci = regola('.payscreen-items').match(/width:\s*min\([^)]*\)\s*,\s*(\d+)%\s*\)/)
    const metodi = regola('.payscreen-methods').match(/width:\s*min\([^)]*\)\s*,\s*(\d+)%\s*\)/)
    expect(voci, 'il tetto in percentuale della colonna voci non c’è più').not.toBeNull()
    expect(metodi, 'il tetto in percentuale della colonna metodi non c’è più').not.toBeNull()
    const restaAlCentro = 100 - Number(voci[1]) - Number(metodi[1])
    expect(restaAlCentro, 'al tastierino resta meno di un terzo della larghezza').toBeGreaterThanOrEqual(33)
  })

  // Le maniglie del pagamento hanno lo stile di quelle del POS — stesso
  // gesto, stessa presa — ma sono una classe a parte apposta: il POS impila
  // le colonne sotto i 900px, il pagamento sotto gli 800. Con un nome solo,
  // fra 800 e 899px le maniglie del pagamento sarebbero sparite mentre le
  // sue colonne sono ancora affiancate.
  it('la maniglia del pagamento è larga e afferrabile come quella del POS', () => {
    expect(regola('.payscreen-resize-handle')).toMatch(/cursor:\s*col-resize/)
    const largo = regola('.payscreen-resize-handle').match(/width:\s*(\d+)px/)
    expect(largo, 'la maniglia non ha più una larghezza da dito').not.toBeNull()
    expect(Number(largo[1])).toBeGreaterThanOrEqual(14)
    // `touch-action: none` o il dito che trascina fa scorrere la pagina.
    expect(regola('.payscreen-resize-handle')).toMatch(/touch-action:\s*none/)
  })

  it('sul telefono, con le colonne impilate, le maniglie spariscono', () => {
    // Sotto gli 800px .payscreen-body va in colonna: trascinare una
    // larghezza quando la colonna è larga quanto lo schermo non vuol dire
    // niente, e la maniglia sarebbe solo una barra da sfiorare per sbaglio.
    const i = css.indexOf('@media (max-width: 799px)')
    expect(i, 'la fascia telefono del pagamento non c’è più').toBeGreaterThan(-1)
    const blocco = css.slice(i, css.indexOf('\n}', i))
    expect(blocco).toMatch(/\.payscreen-resize-handle\s*\{\s*display:\s*none/)
  })
})

// ── LA MANIGLIA DEL PIEDE NON SI PRENDE ANCHE IL GAP ─────────────────
//
// «Diminuire lo spazio tra la maniglia e il contenuto nel dettaglio
// ordine» (l'utente, 21/08/2026). La maniglia è il primo figlio di una
// colonna flex con `gap`, quindi fra lei e la riga del Totale finivano
// insieme: i sedici pixel della sua area, il gap della colonna e il suo
// margine — un vuoto più alto della riga che stava separando, e che con lo
// zoom del piede cresceva insieme a tutto il resto.
//
// L'area da afferrare NON si tocca: sedici pixel sotto il dito restano
// sedici. A rientrare è solo lo spazio sotto, con un margine negativo che
// segue `--foot-scale` perché lo segue il gap che sta annullando.
describe('la maniglia del piede del conto', () => {
  const css = readFileSync(join(CARTELLA, 'index.css'), 'utf8')
  const regola = (nome) => {
    const i = css.indexOf(`
${nome} {`)
    expect(i, `${nome} non c'è più`).toBeGreaterThan(-1)
    return css.slice(i, css.indexOf('}', i))
  }

  it('tiene la sua area da afferrare', () => {
    const h = regola('.posd-foot-handle').match(/height:\s*(\d+)px/)
    expect(h, 'la maniglia ha perso l' + String.fromCharCode(39) + 'altezza').toBeTruthy()
    // Sotto i dodici non e' piu' una presa: e' una riga da centrare col dito.
    expect(Number(h[1])).toBeGreaterThanOrEqual(12)
  })

  it('ma rientra nei vicini invece di aggiungersi, sopra e sotto', () => {
    const r = regola('.posd-foot-handle')
    const m = r.match(/margin:\s*(-?\d+)px\s+-12px\s+calc\(([^)]*)\)/)
    expect(m, 'il margine non rientra piu da nessuna parte').toBeTruthy()
    // Sopra: si mangia il cuscino del piede.
    expect(Number(m[1]), 'sopra deve rientrare, non aggiungere').toBeLessThan(0)
    // Sotto: riassorbe il gap, e lo segue quando il piede si ingrandisce.
    expect(m[2], 'lo stacco deve seguire --foot-scale, come il gap').toMatch(/--foot-scale/)
    expect(m[2], 'e deve essere negativo, o non riassorbe').toMatch(/-\s*\d/)
  })

  it('e il piede non mette un cuscino sopra la maniglia', () => {
    const pad = regola('.posd-comanda-foot').match(/padding:\s*(\d+)px/)
    expect(pad, 'il piede ha perso il padding').toBeTruthy()
    expect(Number(pad[1]), 'sopra la maniglia bastano pochi pixel').toBeLessThanOrEqual(4)
  })
})

// ── UN TESTO SU FONDO TINTO NON PORTA UN PASTELLO CABLATO ────────────
//
// «Il colore verde del testo non si legge bene sullo sfondo verde qui»
// (l'utente, 22/08/2026): i passi del dettaglio comanda, dove i riquadri
// fatti erano verdi e le scritte dentro verde-menta (#c8f7da). Quel
// pastello è nato per il tema scuro, dove un testo chiaro su un velo
// verde si stacca; sul chiaro finiva su un fondo altrettanto chiaro e
// spariva — 1,03:1, misurato in Chrome sui preset di themes.js.
//
// È la stessa famiglia di BUG-065, un piano più in su: lì il velo e il
// bordo bianchi davano per scontato lo scuro, qui è l'inchiostro. E non
// era un caso solo: la pill dei turni in corso, quella dei conti chiusi,
// i numeri dei chip dell'inventario, i numeri in perdita.
//
// LA REGOLA (DESIGN.md): un inchiostro chiaro cablato non sta su un fondo
// tinto. O viene da un gettone che ha la sua variante chiara
// (--text, --muted, --btn-ink, --testo-rosso, --testo-ambra), o la regola
// ha accanto la sua `:root[data-luma='light']`, che è come il foglio
// tratta le pill degli stati da sempre.
describe('nessun inchiostro chiaro cablato su un fondo tinto', () => {
  // Qui NON si usa `nudo`: quella svuota anche le stringhe, e i selettori
  // che contano — `[data-luma='light']` — sono fatti di stringhe.
  const css = readFileSync(join(CARTELLA, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  // Le regole "foglia" del foglio: prelude + corpo, saltando le graffe
  // degli at-rule (@media, @container, @supports), che non dichiarano
  // niente di loro.
  function regoleFoglia(testo) {
    const trovate = []
    let profondita = 0
    let apertura = -1
    let dopoUltima = 0
    for (let i = 0; i < testo.length; i++) {
      const c = testo[i]
      if (c === '{') {
        if (profondita === 0) apertura = i
        profondita++
      } else if (c === '}') {
        profondita--
        if (profondita === 0) {
          trovate.push({
            prelude: testo.slice(dopoUltima, apertura).trim(),
            corpo: testo.slice(apertura + 1, i),
          })
          dopoUltima = i + 1
        }
      }
    }
    // Un at-rule contiene altre regole: si guarda dentro, non lui.
    return trovate.flatMap((r) => (r.prelude.startsWith('@') ? regoleFoglia(r.corpo) : [r]))
  }

  // Luminanza relativa WCAG: sopra 0,25 è un colore da fondo scuro (i
  // pastelli sono tutti ben oltre; #157347 e #b02a37, gli inchiostri
  // scuri delle varianti chiare, stanno sotto 0,1).
  function chiaro(hex) {
    const pieno = hex.length === 4 ? hex.slice(1).replace(/./g, (d) => d + d) : hex.slice(1)
    const n = parseInt(pieno, 16)
    const canali = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * canali[0] + 0.7152 * canali[1] + 0.0722 * canali[2] > 0.25
  }

  const regole = regoleFoglia(css)

  it('il foglio si lascia leggere: le regole si contano', () => {
    expect(regole.length).toBeGreaterThan(500)
  })

  it('e chi tinge il proprio fondo scrive il testo col gettone, o ha la sua variante chiara', () => {
    // Un fondo "tinto" è quello da cui il TEMA traspare: velature colorate,
    // mescole coi gettoni, il gradiente dell'azione. Se la pila ha sotto un
    // colore pieno — `#1c0709`, `linear-gradient(#2f6bd8, #3f7ce0)` — quello
    // che si vede non dipende dal tema e un bianco sopra ci sta benissimo:
    // è il tasto blu dell'incasso, non un difetto.
    // Bianchi e neri trasparenti sono l'ALTRO difetto (BUG-065) e hanno già
    // i loro test qui sopra: quello che si guarda qui è l'inchiostro.
    const tinto = (corpo) => {
      const m = /background(?:-color)?:((?:[^;{}]|\([^)]*\))*)/.exec(corpo)
      if (!m) return false
      const valore = m[1]
      if (/#[0-9a-fA-F]{3,8}\b/.test(valore)) return false
      if (/\brgb\(|rgba\([^)]*,\s*1\s*\)/.test(valore)) return false
      return /rgba\(\s*(?!255,\s*255,\s*255|0,\s*0,\s*0)\d|color-mix|var\(--btn-bg\)/.test(valore)
    }
    const pastello = (corpo) => {
      const m = /(?:^|[;{])\s*color:\s*(#[0-9a-fA-F]{3,8})\s*(?:!important)?\s*(?:;|$)/m.exec(corpo)
      return m && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(m[1]) && chiaro(m[1]) ? m[1] : null
    }

    const scoperte = []
    for (const r of regole) {
      if (r.prelude.includes("data-luma='light'")) continue
      if (!tinto(r.corpo)) continue
      const ink = pastello(r.corpo)
      if (!ink) continue
      // OGNI selettore della regola deve avere la sua variante chiara, non
      // uno solo: quando una pill si accoda a un elenco già coperto
      // (`.pill.pronto, .pill.live, .pill.chiuso`) è proprio lì che ci si
      // dimentica di elencarla anche di sotto — ed è così che «in corso» e
      // «chiuso» sono nate scoperte.
      const coperta = r.prelude
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .every((sel) =>
          new RegExp(
            ":root\\[data-luma='light'\\] " +
              sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
              '[\\s,{]'
          ).test(css)
        )
      if (!coperta) scoperte.push(r.prelude + ' → color: ' + ink)
    }
    expect(
      scoperte,
      'inchiostro chiaro cablato su fondo tinto, senza variante per i temi chiari'
    ).toEqual([])
  })

  it('i due gettoni d’allarme hanno la loro variante chiara', () => {
    for (const gettone of ['--testo-rosso', '--testo-ambra']) {
      expect(css, gettone + ' non è dichiarato').toMatch(
        new RegExp(':root \\{[^{}]*?' + gettone + ':\\s*#')
      )
      expect(css, gettone + ' non ha la variante per i temi chiari').toMatch(
        new RegExp("\\[data-luma='light'\\] \\{[^{}]*?" + gettone + ':\\s*#')
      )
    }
  })
})

// ── I PASSI DI UNA COMANDA SI LEGGONO SU TUTTI I TEMI ────────────────
//
// Il caso da cui è nata la regola qui sopra. Tre riquadri — da fare, in
// corso, fatto — e sotto ogni nome l'ora: al banco quei minuti dicono se
// il ticket è fermo, e sparivano insieme al nome.
describe('i passi del dettaglio comanda', () => {
  const css = nudo(readFileSync(join(CARTELLA, 'index.css'), 'utf8'))
  const regola = (nome) => {
    const i = css.indexOf('\n' + nome + ' {')
    expect(i, nome + ' non c’è più').toBeGreaterThan(-1)
    return css.slice(i, css.indexOf('}', i))
  }

  it('il riquadro spento è un gettone, non un velo bianco', () => {
    const r = regola('.step')
    expect(r, 'un velo bianco sul tema chiaro non si vede').not.toMatch(/rgba\(255,\s*255,\s*255/)
    expect(r).toMatch(/background:\s*var\(--tile-bg\)/)
  })

  it('il nome del passo è testo primario: dice cosa si sta facendo', () => {
    const r = regola('.step')
    expect(r).toMatch(/color:\s*var\(--text\)/)
    expect(r, '--muted qui cadeva sotto 4:1 su due temi').not.toMatch(/color:\s*var\(--muted\)/)
  })

  it('il passo fatto tinge il fondo col gettone --ok e scrive col testo', () => {
    const r = regola('.step.done')
    expect(r).toMatch(/color-mix\(in srgb, var\(--ok\) \d+%, var\(--card\)\)/)
    expect(r).toMatch(/color:\s*var\(--text\)/)
    expect(r, 'era #c8f7da: verde pallido su verde pallido').not.toMatch(/color:\s*#/)
  })

  it('e l’ora sotto prende l’inchiostro del suo riquadro, non lo sbiadito', () => {
    // Dentro il passo in corso il fondo è il dorato dei tasti: --muted ci
    // finiva sopra a 1,03:1.
    expect(regola('.step .muted')).toMatch(/color:\s*inherit/)
  })
})

// ── IL NUMERO DENTRO UN CHIP ACCESO ─────────────────────────────────
//
// I chip riassuntivi dell'inventario («scarsi 7», «finiti 3»): acceso, il
// chip prende il fondo dell'azione, e lì dentro il numero teneva la sua
// tinta d'allarme — 1,2:1 su tutti e otto i temi, il caso peggiore del
// foglio. L'etichetta accanto stava a `#fff` secco, che sul dorato di
// casa fa 1,7:1.
describe('i chip accesi dell’inventario', () => {
  const css = nudo(readFileSync(join(CARTELLA, 'index.css'), 'utf8'))

  it('scrivono tutto con --btn-ink, numero compreso', () => {
    const i = css.indexOf('.chip.warn.active,')
    expect(i, 'la regola dei chip accesi non c’è più').toBeGreaterThan(-1)
    const blocco = css.slice(i, css.indexOf('}', i))
    expect(blocco, 'il numero dentro il chip acceso resta scoperto').toMatch(
      /\.chip\.warn\.active strong/
    )
    expect(blocco).toMatch(/\.chip\.danger\.active strong/)
    expect(blocco).toMatch(/color:\s*var\(--btn-ink\)/)
    expect(blocco, '#fff sul dorato dei tasti fa 1,7:1').not.toMatch(/color:\s*#/)
  })
})

// ── LE RIGHE DELLE LISTE SI TOCCANO, E LA MISURA È UNA SOLA ─────────
//
// «Anche qui nei rendiconti delle chiusure di cassa serve una lista fatta
// meglio, stile quella del magazzino ma con righe più alte. […] E altra
// cosa, aumenta l'altezza anche delle righe della tabella dell'inventario
// per un touch migliore» (l'utente, 22/08/2026, BUG-082).
//
// Le righe erano alte quanto il loro testo — 8px di aria sopra e sotto,
// una trentina di pixel in tutto — e il magazzino al banco si tocca in
// piedi: sotto i 44px di docs/navigazione.md si apre la riga di fianco.
// La misura sta in UN gettone perché le liste della famiglia sono tre
// (magazzino, chiusure di cassa, statistiche) e devono somigliarsi senza
// che nessuno debba ricordarsi tre numeri.
describe('le righe delle liste sono un bersaglio da dito', () => {
  const css = () => readFileSync(join(CARTELLA, 'index.css'), 'utf8')
  const nudoCss = () => nudo(css())

  const regola = (nome) => {
    const testo = nudoCss()
    const i = testo.indexOf(A_CAPO + nome + ' {')
    expect(i, nome + ' non esiste più nel foglio').toBeGreaterThan(-1)
    return testo.slice(i, testo.indexOf('}', i))
  }

  it('il gettone vale 44px e SEGUE LO ZOOM', () => {
    // Non `44px` secchi: `#root` è scalato dallo zoom dell'app, quindi a
    // zoom 1,2 sarebbero 52,8px veri — garanzia già superata, e intanto
    // una schermata fatta di righe ne perde un quinto. Stesso idioma del
    // tastierino del pagamento (BUG-075).
    const radice = nudoCss()
    const i = radice.indexOf('--riga-lista:')
    expect(i, 'il gettone --riga-lista non c’è più').toBeGreaterThan(-1)
    const valore = radice.slice(i, radice.indexOf(';', i))
    expect(valore, 'la misura del bersaglio non segue più lo zoom').toMatch(
      /calc\(\s*44px\s*\/\s*var\(--zoom,\s*1\)\s*\)/
    )
  })

  it('è dichiarato UNA volta sola', () => {
    // Due dichiarazioni sono due misure che prima o poi divergono.
    const quante = (nudoCss().match(/--riga-lista:/g) || []).length
    expect(quante, 'il gettone è dichiarato più di una volta').toBe(1)
  })

  it('la riga della lista lo usa come minimo, non come altezza fissa', () => {
    // Minimo: una riga che va a capo cresce invece di tagliare il testo.
    const r = regola('.inv-row-main')
    expect(r, 'le righe sono tornate alte quanto il loro testo').toMatch(
      /min-height:\s*var\(--riga-lista\)/
    )
    expect(r, 'un’altezza fissa taglia la riga che va a capo').not.toMatch(/\n\s*height:/)
  })

  it('e nessuna lista si scrive un’altezza sua', () => {
    // Il gettone serve a questo: se una lista della famiglia dichiara un
    // suo min-height in pixel, le tre schermate ricominciano a divergere.
    const testo = nudoCss()
    for (const nome of ['.inv-row', '.inv-row-main', '.inv-row-dettaglio']) {
      const i = testo.indexOf(A_CAPO + nome + ' {')
      if (i < 0) continue
      const blocco = testo.slice(i, testo.indexOf('}', i))
      expect(blocco, nome + ' si è scritto un’altezza sua invece del gettone').not.toMatch(
        /min-height:\s*\d+px/
      )
    }
  })
})

// ── NEL CONTO NIENTE FINISCE FUORI DALLO SCHERMO (BUG-077) ───────────
//
// Lo zoom dell'app scala `#root`, quindi al 160% l'altezza disponibile in
// pixel CSS è i due terzi. Le misure fisse non lo sanno, e chi non cede
// spinge fuori chi viene dopo: i tasti in fondo al conto finivano sotto il
// bordo del riquadro, con `overflow: hidden` sopra e niente da scorrere per
// andarli a prendere. Irraggiungibili, non scomodi. Misurato in Chrome:
// 40 combinazioni di finestra e zoom su 77.
//
// Jsdom non fa layout: qui si sorveglia dal foglio la manciata di righe che
// tengono in piedi la cura. Sono quelle che, tolte, riportano il difetto —
// provato togliendole una per una. La STRUTTURA su cui si appoggiano (gli
// involucri nel componente) sta in tests/component/OrderPosDetail.test.jsx.
describe('il conto si stringe, e quello che conta resta', () => {
  const css = () => readFileSync(join(CARTELLA, 'index.css'), 'utf8')

  function regola(nome) {
    const testo = css().replace(/\/\*[\s\S]*?\*\//g, '')
    const i = testo.indexOf(A_CAPO + nome + ' {')
    expect(i, nome + ' non esiste piu’ nel foglio').toBeGreaterThan(-1)
    return testo.slice(i, testo.indexOf('}', i))
  }

  // LA REGOLA, in una riga: qui dentro non cede mai la riga con «Invia
  // comanda» e «Pagamento». Tutto il resto ha un pavimento e poi scorre.
  it('la riga con «Invia comanda» e «Pagamento» non si stringe mai', () => {
    expect(
      regola('.posd-comanda-foot .posd-foot-azioni .grid-2'),
      'i due gesti della serata hanno ricominciato a cedere'
    ).toMatch(/flex-shrink:\s*0/)
  })

  it('il piede puo’ stringersi, e `min-height: 0` e’ la riga che glielo permette', () => {
    // Su `auto` varrebbe il minimo di CONTENUTO, e per un flex annidato
    // Chrome lo calcola sommando le altezze piene dei figli: il piede non
    // cedeva di un pixel e i tasti restavano fuori dal riquadro.
    const r = regola('.posd-comanda-foot')
    expect(r, 'il piede e’ tornato una fascia rigida').not.toMatch(/flex-shrink:\s*0/)
    expect(r, 'senza min-height: 0 il piede non cede').toMatch(/min-height:\s*0/)
    // L'ultima rete: se anche i pavimenti non bastassero, a scorrere è il
    // piede — sempre meglio che veder sparire un tasto.
    expect(r, 'il piede puo’ tornare a sbordare invece di scorrere').toMatch(
      /overflow:\s*hidden auto/
    )
  })

  it('testata, numeri e tasti secondari hanno un pavimento e poi scorrono', () => {
    for (const [nome, pavimento] of [
      ['.posd-testa', /min-height:\s*var\(--riga-lista\)/],
      ['.posd-foot-info', /min-height:\s*[\d.]+em/],
      ['.posd-foot-secondarie', /min-height:\s*var\(--riga-lista\)/],
    ]) {
      const r = regola(nome)
      expect(r, nome + ' non ha piu’ un pavimento: puo’ schiacciarsi a zero').toMatch(pavimento)
      expect(r, nome + ' non scorre piu’: quello che avanza sparisce').toMatch(
        /overflow:\s*hidden auto/
      )
    }
  })

  it('i due tasti secondari sono alti una `--riga-lista`, non 44px secchi', () => {
    // 44px diviso lo zoom: il bersaglio è una misura FISICA (DESIGN.md,
    // guardrail 2). Al 160% 44px CSS sarebbero 70px veri, garanzia
    // stravinta che intanto ruba l'altezza che serve ai tasti stessi. Così
    // il tasto è alto quanto il pavimento del suo contenitore, e scorrendo
    // se ne vede sempre uno intero, mai mezzo.
    expect(regola('.posd-foot-secondarie .btn')).toMatch(/min-height:\s*var\(--riga-lista\)/)
  })

  it('sul telefono l’altezza del pannello e la riga dei tre gesti seguono lo zoom', () => {
    // `50dvh` dentro `#root` scalato vale mezzo schermo in pixel CSS, che
    // al 160% sono otto decimi di schermo veri: il pannello sfondava il
    // corpo e il suo piede finiva sotto il bordo.
    const testo = css().replace(/\/\*[\s\S]*?\*\//g, '')
    expect(testo, 'l’altezza del pannello del telefono non segue piu’ lo zoom').toMatch(
      /height:\s*calc\(\s*var\(--pos-comanda-h[^)]*\)\s*\/\s*var\(--zoom,\s*1\)\s*\)/
    )
    expect(
      regola('.posd-foot-telefono .btn'),
      'i tre gesti del telefono sono tornati a 52px secchi'
    ).toMatch(/min-height:\s*calc\(\s*52px\s*\/\s*var\(--zoom,\s*1\)\s*\)/)
    expect(
      regola('.posd-foot-telefono'),
      'la riga dei tre gesti si stringe invece di restare intera'
    ).toMatch(/flex-shrink:\s*0/)
  })
})

// ── LE FINESTRELLE DI CONFERMA NON SI TAGLIANO (BUG-076) ─────────────
//
// Centrare una cosa più alta dello schermo vuol dire tagliarla dai DUE
// lati: sopra spariva il titolo, sotto il tasto che applica, e il velo è
// fisso — non c'era niente da scorrere per arrivarci. Misurato in Chrome:
// 4 combinazioni su 77 sul portatile, 22 su 77 sul telefono. Vale per
// TUTTE le `.confirm-box` dell'app — sconto, buono, ripristino conto,
// apertura e chiusura cassa, prodotto libero — quindi la cura è una sola
// e sta qui, non in una schermata.
describe('le finestrelle di conferma stanno nello schermo', () => {
  const css = () => readFileSync(join(CARTELLA, 'index.css'), 'utf8')

  function regola(nome) {
    const testo = css().replace(/\/\*[\s\S]*?\*\//g, '')
    const i = testo.indexOf(A_CAPO + nome + ' {')
    expect(i, nome + ' non esiste piu’ nel foglio').toBeGreaterThan(-1)
    return testo.slice(i, testo.indexOf('}', i))
  }

  it('centrare non taglia piu’ dalla cima', () => {
    // `safe center`: quando la scatola non ci sta, il troppo esce solo di
    // sotto — dove il velo scorre. Con `center` secco usciva anche da
    // sopra, e sopra non si scorre mai: spariva il titolo.
    const r = regola('.confirm-overlay')
    expect(r, 'il velo e’ tornato a centrare in modo secco').toMatch(
      /align-items:\s*safe center/
    )
    expect(r, 'il velo non scorre piu’').toMatch(/overflow-y:\s*auto/)
  })

  it('la finestrella non e’ mai piu’ alta dello schermo, e dentro scorre lei', () => {
    const r = regola('.confirm-box')
    expect(r, 'la finestrella puo’ tornare piu’ alta dello schermo').toMatch(
      /max-height:\s*calc\(\s*100dvh\s*\/\s*var\(--zoom,\s*1\)/
    )
    expect(r, 'quello che avanza nella finestrella non si puo’ piu’ raggiungere').toMatch(
      /overflow-y:\s*auto/
    )
  })
})
