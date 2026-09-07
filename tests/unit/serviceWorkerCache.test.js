// @vitest-environment node
'use strict'

// ── IL LOGO NON SI ASPETTA DALLA RETE (BUG-086) ──────────────────────
//
// `logo.png` è la risorsa più richiesta dell'app — sta in cima allo
// scontrino, negli avvisi in pagina e nelle notifiche — ed è l'unica cosa
// che la STAMPA aspetta prima di far uscire la carta. Nel service worker
// non c'era: non fra le risorse precaricate, e servito come tutto il
// resto, cioè prima la rete.
//
// La sera del 24/08 quella richiesta è rimasta APPESA — la rete c'era ma
// non rispondeva — e una fetch appesa non risolve né rifiuta: il ripiego
// sulla cache non scatta, l'<img> non fa né onload né onerror, e lo
// scontrino di un conto appena riscosso è rimasto lì.
//
// Due cose, quindi, e nessuna delle due basta da sola: il logo si
// PRECARICA, e per lui si guarda PRIMA LA CACHE (la copia nuova si va a
// prendere in sottofondo, per la volta dopo).

import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

const sorgente = readFileSync('public/sw.js', 'utf8')
const ORIGINE = 'https://tana.example'

// Un magazzino di cache in memoria, quanto basta per rispondere come
// risponde il browser.
function magazzino(rete) {
  const cache = new Map() // nome → Map(url → risposta)
  const apri = (nome) => {
    if (!cache.has(nome)) cache.set(nome, new Map())
    const dentro = cache.get(nome)
    return {
      addAll: async (lista) => {
        for (const rel of lista) {
          const url = new URL(rel, `${ORIGINE}/`).href
          const res = await rete(url)
          if (!res?.ok) throw new Error(`addAll: ${rel}`)
          dentro.set(url, { ...res, daCache: true })
        }
      },
      put: async (req, res) => dentro.set(req.url, { ...res, daCache: true }),
      match: async (req) => dentro.get(typeof req === 'string' ? new URL(req, `${ORIGINE}/`).href : req.url),
    }
  }
  return {
    cache,
    api: {
      open: async (nome) => apri(nome),
      keys: async () => [...cache.keys()],
      delete: async (nome) => cache.delete(nome),
      match: async (req) => {
        const url = typeof req === 'string' ? new URL(req, `${ORIGINE}/`).href : req.url
        for (const dentro of cache.values()) if (dentro.has(url)) return dentro.get(url)
        return undefined
      },
    },
  }
}

// Il service worker vero, caricato dal file, con attorno il minimo per
// farlo girare: quello che si prova è il file che va in produzione.
function avviaSw(rete) {
  const ascoltatori = {}
  const m = magazzino(rete)
  let skip = false
  const self = {
    addEventListener: (nome, fn) => (ascoltatori[nome] = fn),
    skipWaiting: () => (skip = true),
    location: { origin: ORIGINE },
    clients: { claim: () => {}, matchAll: async () => [] },
    registration: { showNotification: async () => {} },
  }
  new Function('self', 'caches', 'Response', 'fetch', sorgente)(
    self,
    m.api,
    { error: () => ({ ok: false, tipo: 'errore' }) },
    rete
  )

  const evento = (nome, extra) => {
    const attese = []
    const ev = { ...extra, waitUntil: (p) => attese.push(p) }
    ascoltatori[nome](ev)
    return Promise.all(attese)
  }

  return {
    cache: m.cache,
    haSaltatoLAttesa: () => skip,
    install: () => evento('install', {}),
    attiva: () => evento('activate', {}),
    // Torna la promessa passata a respondWith: è la risposta che il
    // browser darà alla pagina.
    chiedi: (rel, opzioni = {}) => {
      let risposta
      ascoltatori.fetch({
        request: { url: new URL(rel, `${ORIGINE}/`).href, method: 'GET', mode: 'no-cors', ...opzioni },
        respondWith: (p) => (risposta = p),
      })
      return risposta
    },
  }
}

// Una rete che risponde a tutto, e che si può bloccare su un indirizzo.
function rete({ appesa = null } = {}) {
  const chieste = []
  return {
    chieste,
    fetch: async (req) => {
      const url = typeof req === 'string' ? new URL(req, `${ORIGINE}/`).href : req.url
      chieste.push(url)
      // LA RETE CHE NON DICE NÉ SÌ NÉ NO: è il caso del 24/08, e non è
      // un errore — è un'attesa che non finisce.
      if (appesa && url.includes(appesa)) return new Promise(() => {})
      return { ok: true, type: 'basic', url, clone: () => ({ ok: true, type: 'basic', url }) }
    },
  }
}

let vinta

// Una promessa che vince solo se arriva davvero: se resta appesa, la
// prova non aspetta per sempre.
const entro = (p, ms = 50) =>
  Promise.race([p, new Promise((ok) => setTimeout(() => ok((vinta = 'nessuna risposta')), ms))])

beforeEach(() => {
  vinta = null
})

describe('le risorse che l’app non deve andare a cercare', () => {
  it('il logo si precarica insieme al guscio dell’app', async () => {
    const r = rete()
    const sw = avviaSw(r.fetch)
    await sw.install()
    const dentro = [...sw.cache.get('tana-drink-v4').keys()]
    expect(dentro).toContain(`${ORIGINE}/logo.png`)
    // E il resto del guscio è rimasto dov'era.
    expect(dentro).toContain(`${ORIGINE}/index.html`)
    expect(dentro).toContain(`${ORIGINE}/manifest.webmanifest`)
    expect(sw.haSaltatoLAttesa()).toBe(true) // parte subito, non aspetta la scheda dopo
  })

  it('e se una risorsa manca, il service worker si installa lo stesso', async () => {
    // `addAll` è tutto-o-niente: senza il `catch` un file spostato
    // lascerebbe l'installazione a metà.
    const sw = avviaSw(async (req) => {
      const url = typeof req === 'string' ? req : req.url
      if (url.includes('favicon')) return { ok: false }
      return { ok: true, type: 'basic', url, clone: () => ({ ok: true, type: 'basic', url }) }
    })
    await expect(sw.install()).resolves.toBeDefined()
  })
})

describe('la rete che resta appesa', () => {
  it('IL DIFETTO DEL 24/08: il logo arriva lo stesso, dalla cache', async () => {
    const r = rete()
    const sw = avviaSw(r.fetch)
    await sw.install()

    // Adesso la rete c'è ma non risponde più: la stampa chiede il logo.
    const bloccata = rete({ appesa: 'logo.png' })
    const sw2 = avviaSw(bloccata.fetch)
    sw2.cache.set('tana-drink-v4', sw.cache.get('tana-drink-v4'))

    const risposta = await entro(sw2.chiedi('./logo.png'))
    expect(vinta).toBe(null) // ha risposto: nessuna attesa infinita
    expect(risposta.url).toBe(`${ORIGINE}/logo.png`)
  })

  it('senza copia in cache si va in rete, come per tutto il resto', async () => {
    const r = rete()
    const sw = avviaSw(r.fetch)
    const risposta = await entro(sw.chiedi('./logo.png'))
    expect(risposta.ok).toBe(true)
    expect(r.chieste).toContain(`${ORIGINE}/logo.png`)
  })

  it('la copia nuova si va a prendere lo stesso, in sottofondo', async () => {
    const r = rete()
    const sw = avviaSw(r.fetch)
    await sw.install()
    r.chieste.length = 0
    await entro(sw.chiedi('./logo.png'))
    // Risposta dalla cache MA rete interrogata: un logo cambiato entra
    // comunque, al giro dopo.
    expect(r.chieste).toContain(`${ORIGINE}/logo.png`)
  })
})

describe('il resto dell’app non cambia strada', () => {
  it('per le pagine si va prima in rete', async () => {
    const r = rete()
    const sw = avviaSw(r.fetch)
    await sw.install()
    r.chieste.length = 0
    const risposta = await entro(sw.chiedi('./index.html', { mode: 'navigate' }))
    expect(r.chieste).toContain(`${ORIGINE}/index.html`)
    expect(risposta.daCache).toBeUndefined() // è la copia fresca, non quella salvata
  })

  it('e la rete caduta ripiega sulla cache', async () => {
    const sw = avviaSw(async () => {
      throw new Error('offline')
    })
    // Con la cache vuota non c'è niente da dare: la richiesta fallisce e
    // basta. Quello che conta è che non resti appesa.
    const risposta = await entro(sw.chiedi('./index.html', { mode: 'navigate' }))
    expect(vinta).toBe(null)
    expect(risposta).toBeUndefined()
  })
})

describe('chi ha la versione vecchia', () => {
  it('la cache di prima viene buttata, quella nuova resta', async () => {
    const r = rete()
    const sw = avviaSw(r.fetch)
    // Come il tablet al banco che ha ancora la v3 in memoria.
    sw.cache.set('tana-drink-v3', new Map([[`${ORIGINE}/index.html`, { ok: true }]]))
    await sw.install()
    await sw.attiva()
    expect([...sw.cache.keys()]).toEqual(['tana-drink-v4'])
  })
})
