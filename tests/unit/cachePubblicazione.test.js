'use strict'

// ── LA PAGINA BIANCA DOPO UNA PUBBLICAZIONE (BUG-103) ────────────────
//
// Il 07/09/2026, pubblicata la 1.5.7, chi aveva l'app aperta sul telefono
// se l'è ritrovata BIANCA. Non un errore: bianca, senza niente.
//
// IL MECCANISMO, che è fatto di due pezzi innocui che insieme non lo sono.
//
// 1. `index.html` veniva servito con la cache di default di Firebase
//    Hosting: un'ora. Dopo una pubblicazione il telefono continua quindi a
//    usare la pagina di PRIMA, che chiede i file del rilascio precedente —
//    e quei file, che hanno l'impronta del contenuto nel nome, sull'hosting
//    non ci sono più.
// 2. In `firebase.json` c'è una riscrittura che manda QUALUNQUE indirizzo
//    inesistente su `/index.html`. Serve all'app, che ha le sue pagine
//    interne. Ma vuol dire che un file mancante non risponde «non ci
//    sono»: risponde **200 con dentro dell'HTML**.
//
// Messi insieme: il browser chiede un pezzo di JavaScript, riceve una
// pagina HTML, prova a eseguirla come JavaScript e si ferma lì. Niente si
// disegna, niente viene scritto a schermo. Pagina bianca, e si sistema da
// sola solo quando scade l'ora.
//
// LA CURA sta nelle intestazioni, ed è quella che questo test sorveglia:
// la pagina e il service worker si ricontrollano sempre, i file con
// l'impronta nel nome si tengono per sempre.
//
// PERCHÉ UN TEST SU UN FILE DI CONFIGURAZIONE. Perché è l'unico posto in
// cui questa regola vive: non c'è una schermata che la mostri e non c'è un
// utente che se ne accorga finché non succede di nuovo — e quando succede
// si vede un mese dopo, su un telefono, senza un errore da leggere. Chi un
// domani riordinasse `firebase.json` toglierebbe tre righe senza sapere
// cosa fanno.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const firebase = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'))
const hosting = firebase.hosting

// Il valore di `Cache-Control` che tocca a un indirizzo, o null.
function cachePer(percorso) {
  const regola = (hosting.headers || []).find((h) => h.source === percorso)
  const voce = (regola?.headers || []).find((x) => x.key === 'Cache-Control')
  return voce ? voce.value : null
}

describe('quello che dice quali pezzi caricare non si tiene in cache', () => {
  // La pagina e il service worker sono i due file che dicono all'app QUALI
  // pezzi andare a prendere. Tenerli fermi vuol dire chiedere i pezzi di
  // ieri, che non esistono più.
  for (const percorso of ['/', '/index.html', '/sw.js', '/manifest.webmanifest']) {
    it(`${percorso} si ricontrolla a ogni apertura`, () => {
      const valore = cachePer(percorso)
      expect(valore, `manca la regola per ${percorso}`).toBeTruthy()
      // `no-cache` non vuol dire «non salvarlo»: vuol dire «prima di usarlo
      // chiedi se è cambiato». Sono file piccoli, la domanda non costa
      // niente — e senza, ogni pubblicazione lascia la pagina bianca per
      // un'ora a chi aveva l'app aperta.
      expect(valore).toMatch(/no-cache|max-age=0/)
    })
  }

  it('i file con l’impronta nel nome invece si tengono, e a lungo', () => {
    // Il nome porta l'impronta del contenuto: cambiando una riga di codice
    // cambia il nome del file. A parità di nome quel file non cambia MAI,
    // quindi richiederlo di nuovo è tempo buttato.
    const valore = cachePer('/assets/**')
    expect(valore).toBeTruthy()
    expect(valore).toMatch(/immutable/)
    const anni = /max-age=(\d+)/.exec(valore)
    expect(Number(anni?.[1])).toBeGreaterThanOrEqual(2592000)
  })
})

describe('e la riscrittura che rende tutto questo pericoloso è ancora lì', () => {
  // Non è un difetto: serve all'app, che ha pagine interne raggiungibili
  // per indirizzo. Ma è la METÀ del meccanismo, ed è il motivo per cui le
  // intestazioni qui sopra non sono un dettaglio di prestazioni.
  it('un indirizzo che non esiste torna la pagina, non un «non c’è»', () => {
    const tutte = (hosting.rewrites || []).find((r) => r.source === '**')
    expect(tutte?.destination).toBe('/index.html')
  })
})
