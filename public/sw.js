// Service worker minimale per la PWA.
// Fornisce un cache di base e gestisce i click sulle notifiche.
const CACHE = 'tana-drink-v4'

// IL LOGO STA IN CIMA ALLA LISTA PERCHÉ LA STAMPA LO ASPETTA (BUG-086).
// `logo.png` è la risorsa più richiesta dell'app — scontrino, preconto,
// avvisi in pagina, notifiche di sistema — ed era l'unica di quelle fisse
// che qui dentro non c'era: la si andava a prendere in rete a ogni giro.
// La sera del 24/08 quella richiesta è rimasta appesa (rete che c'è ma non
// risponde) e con lei si è fermato lo scontrino di un conto appena
// riscosso.
const PRECARICATE = ['./', './index.html', './favicon.svg', './manifest.webmanifest', './logo.png']

// La lista cambia, e con lei il nome della cache (v3 → v4): un service
// worker nuovo si installa, `skipWaiting` lo fa partire subito e
// `activate` butta le cache vecchie. Chi ha l'app aperta con la versione
// di prima non perde niente — le pagine restano servite finché non si
// ricaricano, e tutto quello che sta in v3 sta anche in v4 (più il logo).
self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // `addAll` è tutto-o-niente: se una sola risorsa manca non si
      // precarica NULLA. L'errore si ingoia — il service worker si
      // installa lo stesso e le richieste passano dalla rete come prima.
      cache.addAll(PRECARICATE)
    ).catch(() => {})
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// PRIMA LA CACHE, SOLO PER IL LOGO. Precaricarlo non basta: qui sotto si
// va in rete PER PRIMA COSA e la cache si guarda solo quando la rete
// FALLISCE — e una richiesta che resta appesa non fallisce mai, quindi
// nessuno arriva mai alla copia salvata. È il difetto del 24/08: la rete
// non ha detto né sì né no, e la stampa dello scontrino è rimasta lì.
// Per il logo la rete esce dal percorso: si risponde con la copia che c'è
// e si va a riprendere quella nuova in sottofondo, per la volta dopo. Il
// logo può permetterselo perché è un'immagine ferma — cambiarlo cambia
// l'indirizzo (le impostazioni del locale) o passa da una versione nuova
// dell'app, che rifà la cache.
const PRIMA_LA_CACHE = /\/logo\.png$/

function dallaRete(request) {
  return fetch(request)
    .then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
      }
      return res
    })
}

// Network-first per le richieste same-origin, con fallback alla cache.
// IMPORTANTE: mai intercettare richieste cross-origin (Firestore/API in
// streaming): metterle in cache corrompe il protocollo realtime.
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (PRIMA_LA_CACHE.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((inCache) => {
        const inArrivo = dallaRete(request)
        if (!inCache) return inArrivo
        // La copia nuova aggiorna la cache quando arriva; se non arriva,
        // pazienza — quello che serviva è già stato dato.
        inArrivo.catch(() => {})
        return inCache
      })
    )
    return
  }
  event.respondWith(
    dallaRete(request)
      .catch(() =>
        caches.match(request).then((r) => {
          if (r) return r
          if (request.mode === 'navigate') return caches.match('./index.html')
          return Response.error()
        })
      )
  )
})

// Web Push (FCM): mostra la notifica quando l'app è chiusa o in background.
// La salta SOLO se il cliente sta già guardando la pagina di quell'ordine
// (lì ci pensa il listener realtime: evita la notifica doppia). Se sta
// guardando un'altra pagina — ad es. il menù — la notifica arriva comunque.
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload = {}
      try {
        payload = event.data ? event.data.json() : {}
      } catch { /* payload non JSON */ }

      // Chiamata cerca-persone allo staff (messaggio data-only): notifica
      // insistente con vibrazione forte, anche ad app chiusa o in
      // background. Mostrata sempre: la vibrazione è il punto.
      if (payload.data?.kind === 'staff_call') {
        return self.registration.showNotification(
          payload.data.title || '📟 Chiamata dal bancone',
          {
            body: payload.data.body || 'Rispondi sul telefono.',
            icon: './logo.png',
            badge: './logo.png',
            vibrate: [500, 200, 500, 200, 900],
            tag: 'staff-call',
            renotify: true,
            requireInteraction: true,
            data: { url: payload.data.url || '/bar' },
          }
        )
      }

      // Nuovo ordine al bancone (push allo staff): la notifica di sistema
      // ESCE SEMPRE, anche col gestionale aperto.
      //
      // Prima si saltava quando la coda era in primo piano, per non
      // mostrarla doppia: là suonava l'app. Il patto però non reggeva —
      // il tablet al banco sta sulla coda tutta la sera, quindi cadeva
      // sempre in quel ramo, e dall'altra parte l'avviso in pagina
      // scartava proprio gli ordini battuti dagli altri terminali: in
      // mezzo, il silenzio. Un avviso in più si chiude; uno in meno è un
      // drink che non parte.
      // Il doppione lo evita il `tag`: la notifica dell'app e questa
      // portano lo stesso nome, quindi il sistema le fonde in una.
      // (Quando arriveranno le preferenze per dispositivo, questo diventa
      // un interruttore invece di una regola cablata.)
      if (payload.data?.kind === 'new_order') {
        return self.registration.showNotification(
          payload.data.title || '🆕 Nuovo ordine',
          {
            body: payload.data.body || '',
            icon: './logo.png',
            badge: './logo.png',
            vibrate: [200, 100, 200],
            tag: payload.data.order_id ? `new-order-${payload.data.order_id}` : 'new-order',
            renotify: true,
            // Resta nel centro notifiche finché non viene toccata: in un bar
            // pieno è facile non vedere subito un banner che sparisce.
            requireInteraction: true,
            data: { url: payload.data.url || '/bar' },
          }
        )
      }

      // Drink pronto (da servire al tavolo o da consegnare al banco):
      // saltata solo se il gestionale è DAVVERO sotto gli occhi, che
      // lì la lista si aggiorna da sola.
      //
      // SI GUARDA LA VISIBILITÀ, NON IL FUOCO. Qui c'era un OR: bastava
      // che la finestra risultasse `focused` per non mostrare niente. Ma
      // il fuoco resta alla finestra anche a schermo spento, e un
      // telefono lasciato aperto sulla coda — cioè come sta tutta la
      // sera — ingoiava l'avviso senza che nessuno lo vedesse mai.
      if (payload.data?.kind === 'staff_serve') {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const onBar = wins.some((w) => {
          try {
            return w.visibilityState === 'visible' && new URL(w.url).pathname.startsWith('/bar')
          } catch {
            return false
          }
        })
        if (onBar) return
        return self.registration.showNotification(
          payload.data.title || '🫱 Drink pronti',
          {
            body: payload.data.body || '',
            icon: './logo.png',
            badge: './logo.png',
            vibrate: [300, 150, 300],
            // Tag per ordine: ogni ordine pronto ha la sua notifica nel
            // pannello (il sistema le raggruppa per app), senza che la
            // nuova sostituisca la precedente.
            tag: payload.data.order_id
              ? `staff-serve-${payload.data.order_id}`
              : 'staff-serve',
            renotify: true,
            data: { url: payload.data.url || '/bar' },
          }
        )
      }

      const orderUrl = payload.data?.url || null

      if (orderUrl) {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const onOrderPage = wins.some((w) => {
          try {
            return w.visibilityState === 'visible' && new URL(w.url).pathname.endsWith(orderUrl)
          } catch {
            return false
          }
        })
        if (onOrderPage) return
      }

      const n = payload.notification || {}
      await self.registration.showNotification(n.title || 'La Tana del Coniglio', {
        body: n.body || '',
        icon: './logo.png',
        badge: './logo.png',
        data: payload.data || {},
      })
    })()
  )
})

// Quando l'utente clicca la notifica, porta in primo piano l'app
// (sulla pagina dell'ordine, se indicata nei dati della notifica).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || './'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if (url !== './' && 'navigate' in client) client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
