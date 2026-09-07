# Piano di sbrandizzazione — da "app della Tana" a prodotto federabile

Obiettivo: trasformare l'app in un prodotto vendibile ad altri locali senza
mai rompere l'installazione della Tana del Coniglio, che resta in produzione
e in evoluzione per tutto il percorso.

Il modello scelto è la **federazione per replicazione**: un solo codice, un
progetto Firebase per cliente, il brand come configurazione. La Tana diventa
il primo cliente della flotta. Non esiste una "versione sbrandizzata" come
ramo o fork: esiste lo stesso commit compilato con configurazioni diverse.

## I principi (non negoziabili)

1. **La Tana non si accorge di niente.** Ogni release di questo piano deve
   lasciare l'app della Tana identica in produzione: stesso schermo, stesso
   scontrino, stessa PWA. Se un passo non può garantirlo, si spezza in passi
   più piccoli.
2. **Niente rami paralleli.** Tutto il lavoro viaggia nei normali treni di
   release (`release/x.y.z` da `develop`), mescolato alle fix ordinarie.
   Un ramo "white-label" a lunga vita divergerebbe e morirebbe.
3. **Strangler fig, sempre nello stesso ordine:** prima nasce il posto dove
   la configurazione vivrà (coi valori della Tana dentro), poi il codice
   viene ricablato a leggere da lì (col valore cablato come fallback), solo
   alla fine il fallback diventa neutro.
4. **Requisiti prima del codice.** Ogni passo entra in
   `requirements/requirements.yaml` (gruppo `REQ-VENUE-*` e affini) con i
   suoi test, nello stesso commit. Il metodo del progetto vale anche qui.
5. **Il progresso lo misura un test, non una speranza** (vedi il
   test-guardia in Fase 0).

## I dati: cosa succede ai database

- **Il database della Tana resta dov'è** (`tana-drink`) e continua la sua
  vita. Le uniche scritture previste da questo piano sono migrazioni
  additive (es. riempire `settings/bar.venue` coi dati della Tana).
- **Un cliente nuovo parte da un progetto Firebase vergine**: database
  vuoto, seed neutro, configurazione inserita in fase di attivazione.
  Nessun dato della Tana viaggia mai con il deploy: il deploy pubblica solo
  hosting, functions e regole.
- La regola "il codice nuovo legge i dati vecchi" (stile `REQ-ORD-002`)
  **non riguarda i nuovi clienti**: vale dentro la vita di ogni singola
  installazione, perché il DB di un locale attraversa le versioni. Per un
  DB nuovo è semplicemente vuota.

## Inventario del cablato (ricognizione 2026-08-13)

### Brand visibile nel codice (~8 punti da ricablare)

| Dove | Cosa |
|---|---|
| `src/lib/nomeApp.js:18` | `NOME_BASE = 'La Tana del Coniglio'` — già sorgente unica del nome, ma non tutti la usano |
| `src/App.jsx:376, 467` | marchio in topbar e titolo ActionSheet |
| `src/App.jsx:557-590` | costante `SOCIALS` con i link Instagram/TikTok/Facebook/Telegram/TripAdvisor della Tana |
| `src/components/ClientDrawer.jsx:57` | testata drawer cliente |
| `src/pages/LandingPage.jsx:27-98` | hero, "Chi siamo", "Nola (NA)", `mailto:info@latanadelconiglio.it`; righe 5, 46-75: blocco karaoke/Ceres morto |
| `src/pages/MenuPage.jsx:325, 334, 590` | hero e dialogo di benvenuto |
| `src/pages/AccountPages.jsx:177` | testo "alla Tana del Coniglio" |
| `src/components/UtentiTab.jsx:254` | placeholder email `@latanadelconiglio.it` |
| `index.html:13, 24, 26` | titolo, meta description, apple-title |
| `public/manifest.webmanifest` | `name`, `short_name`, descrizione, colori |

### Identità fiscale e legale

| Dove | Cosa |
|---|---|
| `src/lib/printer.js:28-31` | default intestazione scontrino: "La Tana del Coniglio", indirizzo di Nola, "EFFEVI - SRLS" (già sovrascrivibili da UI: il cablato è solo il default) |
| `public/privacy-policy.html`, `public/cookie-policy.html` | titolare del trattamento EFFEVI S.R.L.S., HTML statico con logo |

### Configurazione e infrastruttura

| Dove | Cosa |
|---|---|
| `functions/index.js:275` | `SUMUP_AFFILIATE_APP_ID` con default `it.latanadelconiglio.drink` |
| `src/lib/themes.js:20, 66` + `src/lib/api.js:3213-3214` | preset `tana-scuro` come tema di default |
| `public/sw.js:3` | cache `tana-drink-v3` |
| ~17 chiavi localStorage con prefisso `tana:`/`tana_` | carrello, stampante, dispositivo, zoom, ecc. |
| `src/dev/seedData.js` | seed con i drink signature della Tana ("Il Coniglio", "Tana Sour", "White Rabbit") |
| `.github/workflows/firebase-hosting.yml:63, 104` | mapping ramo→progetto letterale; measurement id Analytics cablati |
| `index.html:33` | SDK ePOS caricato con path assoluto `/epos-2.27.0.js` (rompe con `BASE_PATH` non-root) |
| `package.json:2` | `name: "karaoke-drink"` (residuo storico) |
| `scripts/diagnostica-permessi.js:32` | **API key web di produzione in chiaro** |
| `scripts/set-role.js:41-42`, `scripts/lib-firestore.js:15-16` | client id/secret del Firebase CLI in chiaro |
| `public/logo*.png`, icone, `cocktail-hero.jpg`, `drinks/coniglio.jpg` | asset grafici brandizzati (percorsi fissi → sostituibili per deployment senza toccare codice) |

### Cosa è GIÀ pronto (non serve lavoro)

- Config Firebase interamente da variabili `VITE_*` (`src/lib/firebaseClient.js`), nessun project id cablato nel client.
- `settings/bar` con decine di impostazioni per-locale già editabili da UI (IVA, coperto, geofence, pagamenti, temi…). Manca solo il blocco identitario.
- SumUp già no-op se non configurato (`isSumUpConfigured()`): il gating tecnico dei pagamenti esiste.
- Webhook URL costruito dinamicamente dal progetto runtime (`functions/index.js:285`).
- `scripts/setup-firebase-env.sh` automatizza già la creazione di un progetto completo (API, Firestore, IAM, web app).
- `manifestConNome()` (`src/lib/nomeApp.js:44-95`) riscrive già il manifest a runtime: è il punto di innesto per nome e colori da settings.
- Avviso nuova versione (`REQ-OFFLINE-004`, `src/lib/appVersion.js`) e bozza persistente (`REQ-POS-003`): l'aggiornamento dei dispositivi è già sicuro.

---

## Fase 0 — Fondamenta (candidata: release 1.5)

Nessun cambiamento visibile. Tutto il resto del piano si appoggia qui.

1. **Requisiti**: gruppo `REQ-VENUE-*` in `requirements/requirements.yaml`
   (identità del locale in settings; UI dal blocco venue; scontrino dal
   blocco venue; manifest da settings; moduli attivabili; build per
   cliente; seed neutro). Da lì nascono le issue con
   `scripts/generate-issues.mjs`.
2. **Test-guardia anti-brand** (stile del test sui ruoli): fallisce se
   `Tana`, `Coniglio`, `latanadelconiglio`, `EFFEVI` compaiono in `src/` o
   `functions/` fuori da una whitelist esplicita. La whitelist parte piena
   (le occorrenze dell'inventario) e ogni fase la accorcia: effetto
   cricchetto, si può solo migliorare. A whitelist vuota la
   sbrandizzazione è dimostrata.
3. **Blocco `venue` in `settings/bar`** (`src/lib/api.js`, `DEFAULT_SETTINGS`):
   `venue_name`, `venue_short_name`, `venue_tagline`, `venue_logo_url`,
   `venue_hero_url`, `venue_email`, `venue_phone`, `venue_socials[]`,
   `venue_legal_name`, `venue_vat`, `venue_address_line1/line2`,
   `venue_receipt_footer`. L'app **non lo legge ancora**: nasce solo il
   posto. Migrazione idempotente che lo riempie coi dati della Tana sul
   progetto di test prima, su produzione col via libera esplicito.
4. **Pulizia sicurezza** (da fare comunque, a prescindere dal piano):
   - rimuovere l'API key da `scripts/diagnostica-permessi.js:32` (passarla
     via env o leggerla dalla config del progetto);
   - rimuovere client id/secret da `scripts/set-role.js` e
     `scripts/lib-firestore.js`.
5. **Igiene minore**: `package.json` `name` → nome prodotto neutro;
   eliminare il blocco karaoke/Ceres morto in `LandingPage.jsx`.

**Criterio di uscita**: lint/test/build verdi; la Tana in produzione
identica; `settings/bar.venue` popolato; test-guardia attivo con whitelist
documentata.

## Fase 1 — L'app legge il venue (candidata: release 1.6)

La Tana continua a vedere lo stesso identico schermo, perché il suo blocco
`venue` contiene già i suoi dati e i fallback restano quelli attuali.

1. **UI dal venue**: gli 8 punti dell'inventario leggono
   `settings.venue_name` (fallback: `NOME_BASE`). `nomeApp.js` diventa
   l'unico punto che conosce il fallback.
2. **Manifest e titolo da settings**: `manifestConNome()` prende nome,
   short name e colori dal venue. La PWA di un futuro cliente si installa
   col suo nome senza rebuild.
3. **Scontrino unificato**: i default di `DEFAULT_PRINTER_SETTINGS`
   (`src/lib/printer.js:28-31`) si svuotano; `PrinterSetup` precompila da
   `venue_legal_name` / `venue_address_*` / `venue_receipt_footer`.
   Attenzione alla doppia persistenza esistente (localStorage
   `tana_printer_v2` + `settings/printer`): i dispositivi della Tana hanno
   già i valori salvati, quindi non cambiano nulla.
4. **Social dal venue**: `SOCIALS` (`App.jsx:557-590`) diventa
   `venue_socials[]` (mappa piattaforma→URL; icone per piattaforma nota,
   icona generica altrimenti). Se la lista è vuota il footer non si vede.
5. **Landing dal venue**: hero, tagline, "Chi siamo", contatti da settings
   (oggi hanno perfino dei `TODO: testo definitivo da fornire`).
6. **Policy templatizzate**: privacy e cookie policy generate a build (o
   pagina che interpola i dati del titolare dal venue), non più HTML
   statico con EFFEVI cablata.
7. Whitelist del test-guardia ridotta di conseguenza.

**Criterio di uscita**: whitelist quasi vuota in `src/`; svuotando il
blocco venue su un progetto di prova l'app mostra fallback neutri sensati
e nessun residuo Tana (verificabile sull'emulatore).

## Fase 2 — Build per cliente e istanza demo (candidata: release 1.7)

Qui nasce la "versione sbrandizzata" come **deployment**, non come ramo.

1. **Directory `clienti/`**:
   - `clienti/tana/` — `.env` di build (project id, VITE_*), asset
     (`logo.png`, icone, hero), dati venue per il seed, canale di rilascio;
   - `clienti/demo/` — configurazione neutra: nome prodotto (da decidere),
     logo generico, seed demo.
2. **Build parametrica**: `CLIENTE=<slug>` (default `tana`) fa pescare a
   Vite asset e variabili da `clienti/<slug>/`. Col default `tana` la
   pipeline attuale non cambia di una virgola. Il manifest e `index.html`
   vengono templatizzati a build (titolo, theme-color, descrizione);
   il path dell'SDK ePOS passa a `%BASE_URL%`.
3. **Progetto `drink-demo`** su Firebase (nome da decidere): terzo
   progetto accanto a `tana-drink` e `tana-drink-test`. La CI, a ogni push
   su `develop`/`release/**`, deploya sia il test della Tana (come oggi)
   sia la demo neutra. La demo è insieme: prova continua della
   sbrandizzazione, demo commerciale, stampo dell'onboarding.
4. **Seed sdoppiato**: `src/dev/seedData.js` si separa in listino demo
   generico e listino Tana (che migra in `clienti/tana/`).
5. **Namespace tecnici**: cache del service worker e chiavi localStorage
   da `tana:`/`tana_` a prefisso neutro, **con lettura di fallback dalle
   chiavi vecchie** (i dispositivi della Tana hanno carrelli, IP stampante
   e preferenze salvati: non si perde niente). Il prefisso può derivare
   dallo slug cliente per evitare collisioni future.
6. **Tema**: `tana-scuro` resta come alias, nasce il nome neutro; il
   default per i nuovi deployment è neutro, la Tana mantiene il suo per
   via del valore già salvato in `settings/bar`.
7. `SUMUP_AFFILIATE_APP_ID`: via il default brandizzato
   (`functions/index.js:275`), diventa env obbligatoria dove serve.

**Criterio di uscita**: la demo è raggiungibile online, senza alcun
residuo Tana (test-guardia a whitelist vuota su `src/` e `functions/`);
la Tana in produzione invariata; stesso commit → due deployment.

## Fase 3 — Licenza e moduli (candidata: release 1.8)

> **Un pezzo è già arrivato, in 1.5.x** (REQ-LIC-001, decisioni dell'utente
> del 26/08/2026). Esiste `src/lib/licenza.js`: la tabella dei moduli
> premium e le funzioni pure che rispondono per tutta l'app. I primi due
> moduli sono la **conta di magazzino** e le **fatture ai fornitori** — le
> due sezioni del magazzino.
>
> **La distinzione che serve a una licenza è già nel modello**, e vale la
> pena tenerla presente scrivendo il resto della fase:
>
> | Domanda | Chi risponde | Dove sta oggi |
> |---|---|---|
> | Il locale ce l'**ha**? (*incluso*) | la licenza | campo `incluso` nella tabella di `licenza.js`, cioè la build |
> | Lo sta **usando**? (*acceso*) | l'impostazione | flag su `settings/bar`, forma di `workflow_enabled` |
>
> Un modulo lavora quando è incluso **e** acceso. Senza la prima domanda non
> si distingue un locale che la funzione non ce l'ha da uno che ce l'ha e
> l'ha spenta — e sono due schermate diverse: interruttore bloccato con la
> spiegazione al tocco, oppure interruttore normale.
>
> Per la Tana, oggi: **scadenzario incluso e acceso, conta non inclusa**.
>
> **Quello che resta da fare qui**: il documento `settings/licenza` vero, e
> il controllo sul server. Il punto di innesto è già pronto e ha un nome —
> `moduloIncluso` guarda prima un campo `licenza.moduli` nello stato che
> riceve, e se c'è vince sulla tabella. Collegarlo vuol dire far arrivare il
> documento fin lì, senza toccare nessuna schermata; l'interruttore d'uso
> resta dov'è, perché è del locale e non della licenza. Gli strumenti di
> sviluppo scrivono già `licenza.moduli` in quella forma: è la prova
> generale del documento vero.

1. **Documento `settings/licenza`** (o campo nel venue): piano e moduli
   attivi. Per la Tana: tutto acceso.
2. **`sezioni.js` legge la licenza**: le voci del gestionale (magazzino,
   fatture, ore staff, statistiche…) compaiono solo se il modulo è attivo.
   Si estende lo schema già esistente di `workflow_enabled`. Le sezioni del
   MAGAZZINO lo fanno già (`InventoryManager.jsx` filtra `INV_VIEWS` con
   `voceVisibile`): quando toccherà alle voci del gestionale, `sezioni.js`
   userà la stessa funzione, non un secondo meccanismo.
3. **Il controllo vero sta sul server**: le Functions premium (pagamenti,
   staffAdmin, notifiche) e/o le regole verificano la licenza. Il flag
   client nasconde, non protegge: mai fidarsi del solo frontend per una
   funzione a pagamento.
4. Pacchetti proposti (da confermare): base = POS, comande, cassa,
   magazzino base, offline. Premium: pagamenti elettronici SumUp; analisi
   e controllo di gestione; self-ordering + notifiche push; team avanzato
   (utenti da UI, ore/paghe, cerca-persone); dati e brand (backup/export,
   white-label completo).

## Fase 4 — Fabbrica di onboarding e flotta (dopo il primo cliente)

1. **Onboarding**: `setup-firebase-env.sh` esteso fino a coprire App
   Check/reCAPTCHA, secret SumUp, seed, primo deploy. Obiettivo: nuovo
   cliente = copiare `clienti/demo/` in `clienti/<slug>/`, compilare i
   dati, lanciare lo script.
2. **Matrice di deploy**: al merge su `main` la CI legge `clienti/` e
   lancia un job per cliente (`fail-fast: false`), ognuno con la sua
   GitHub Environment e la guardia `VITE_FIREBASE_PROJECT_ID == target`
   già in uso oggi. Rollout ad anelli: demo → Tana (canarino reale al
   banco) → flotta, con approvazione manuale e deploy fuori orario di
   servizio.
3. **Migrazioni prodottizzate**: directory `migrazioni/` con script
   idempotenti numerati; doc `settings/schema_version` per database; passo
   CI post-deploy che applica solo le mancanti. Vincolo: l'app funziona
   anche se la migrazione non è ancora girata.
4. **Cruscotto flotta**: ogni installazione scrive la versione deployata
   in un doc; una pagina unica mostra chi è su cosa.
5. **Regola d'oro**: tutti i clienti sulla stessa versione, sempre. Le
   differenze passano solo da licenza e settings, mai dal codice.
6. **Infrastruttura come codice (deciso il 15/08)**: la fabbrica converge
   su **Terraform** — un modulo `cliente` in `infra/` che dichiara
   progetto GCP, API abilitate, database Firestore, web app, IAM, Secret
   Manager e budget; lo stato vive in un bucket GCS del progetto regia.
   Attivare un cliente = un blocco `module` + `terraform apply`; una
   disdetta = `destroy` controllato; la configurazione della flotta è
   versionata nel repo invece che nella console. Confine netto: Terraform
   per l'**infrastruttura**, la pipeline esistente per gli **artefatti**
   (build, hosting, functions, regole Firestore). Primo collaudo senza
   rischi: `terraform import` del progetto demo già esistente.
   `setup-firebase-env.sh` resta il ponte finché il modulo non lo
   rimpiazza.

## Fase 5 — Il prodotto pubblico: landing, pricing, registrazione

Questa è infrastruttura nuova, separata dall'app del locale. Il sito
pubblico del prodotto **non è la landing del bar** (`LandingPage.jsx`, che
resta la vetrina del singolo locale): è il sito con cui un barista scopre
il prodotto, vede i prezzi e si abbona.

1. **Sito prodotto** (nome e dominio da decidere, es. `drinkpos.it`):
   presentazione, pricing dei pacchetti (Fase 3), demo pubblica (il
   deployment `drink-demo` linkato come "provala"), contatti. Statico o
   quasi: può essere un piccolo sito Vite/Astro nello stesso monorepo
   (`sito/`), deployato sull'Hosting del progetto regia.
2. **Registrazione**: form di iscrizione → account "titolare" su Firebase
   Auth del progetto regia → scelta del piano → **Stripe Checkout** in
   abbonamento. Stripe, non SumUp, per gli incassi ricorrenti: SumUp resta
   l'integrazione operativa dei locali, Stripe è fatto per i subscription
   billing (portale self-service, fatture, dunning sui mancati pagamenti).
3. **Attivazione (provisioning)**: al webhook `checkout.completed` nasce il
   record cliente in Firestore della regia con stato `da_attivare`. La
   creazione dell'istanza parte **semi-automatica all'inizio** (notifica a
   noi + script), **automatizzabile poi**: una Function della regia lancia
   la GitHub Action di onboarding (`workflow_dispatch` via API) che crea il
   progetto Firebase del cliente, deploya, siedda e scrive la licenza. Il
   titolare riceve l'URL della sua istanza e il primo account admin.
4. **Ciclo di vita dell'abbonamento**: i webhook Stripe (pagamento fallito,
   disdetta, upgrade) aggiornano il record cliente; una Function di
   sincronizzazione riflette lo stato in `settings/licenza` dell'istanza
   (sospensione = moduli premium spenti e banner in app, mai il POS morto a
   metà serata: la degradazione è gentile, il locale deve poter battere
   conti anche con l'abbonamento scaduto da un giorno).
5. **Cruscotto flotta** (la pagina della Fase 4.4 vive qui): clienti,
   piano, stato pagamenti, versione deployata, ultima attività.

## Ipotesi di infrastruttura Firebase

```
                        ┌─────────────────────────────────────────┐
                        │   PROGETTO REGIA (es. drink-fleet)      │
                        │─────────────────────────────────────────│
                        │ Hosting    → sito prodotto + pricing    │
                        │ Auth       → account dei titolari       │
                        │ Firestore  → clienti, piani, licenze,   │
                        │              versioni della flotta      │
                        │ Functions  → webhook Stripe,            │
                        │              provisioning (→ GH Action),│
                        │              sync licenze → istanze     │
                        └───────────────┬─────────────────────────┘
                                        │  provisioning + licenze
              ┌───────────────┬─────────┴───────┬───────────────┐
              ▼               ▼                 ▼               ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │  tana-drink  │ │  drink-demo  │ │  cliente-a   │ │  cliente-b … │
      │ (+ tana-test)│ │  demo neutra │ │              │ │              │
      │──────────────│ │──────────────│ │──────────────│ │──────────────│
      │ Hosting: PWA │ │   idem, con  │ │   idem, con  │ │     idem     │
      │ Firestore:   │ │ config demo  │ │ config sua   │ │              │
      │  dati locale │ │              │ │              │ │              │
      │ Functions:   │ │              │ │              │ │              │
      │  SumUp, push │ │              │ │              │ │              │
      │ Auth + AppChk│ │              │ │              │ │              │
      └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
         un progetto Firebase per cliente = isolamento totale dei dati,
         fatturazione leggibile, App Check e credenziali SumUp per locale
```

Scelte e vincoli pratici:

- **Un solo account di fatturazione Cloud (Blaze)** a cui agganciare tutti
  i progetti: costi per cliente leggibili per progetto. Attenzione alla
  **quota di progetti per account di fatturazione** (di default bassa: va
  chiesto l'innalzamento a Google quando i clienti crescono).
- **Domini, in due livelli**:
  1. **Sottodominio incluso** (`<slug>.<dominio-prodotto>`): lo crea lo
     script di onboarding da solo — record DNS nella zona del dominio
     prodotto + dominio custom sull'Hosting dell'istanza via API, TLS
     automatico. Zero lavoro per il cliente.
  2. **Dominio del cliente** (es. `bardamario.it`): si aggiunge *in più*,
     mai al posto del sottodominio. Al cliente si danno i record da
     mettere al suo registrar (TXT di verifica + A/CNAME); il certificato
     lo provisiona Firebase. Candidato naturale per il pacchetto premium
     "Dati e brand".

  Checklist obbligatoria per ogni dominio aggiunto (cose che si rompono
  in silenzio): domini autorizzati di **Firebase Auth** (senza, il login
  muore), domini della chiave **reCAPTCHA/App Check** (c'è già
  `scripts/recaptcha-domini.js`, nato da un incidente vero), e verifica
  del flusso di login social sul dominio nuovo.

  ⚠️ **La PWA è legata al dominio**: app installata e storage locale
  (bozza, IP stampante, preferenze) appartengono all'origine. Cambiare
  dominio a un locale avviato = reinstallare l'app su tutti i dispositivi
  e ripartire con lo storage vuoto. Quindi il dominio si sceglie
  all'attivazione, e il sottodominio non si spegne mai: resta come alias,
  così QR stampati e dispositivi vecchi continuano a funzionare.

  Il sito prodotto sta sul dominio principale.
- **Licenze cross-progetto**: la regia crea i progetti col proprio service
  account di provisioning, quindi ha naturalmente i permessi per scrivere
  `settings/licenza` in ogni istanza (Admin SDK multi-progetto). In
  alternativa, licenza a token firmato che le Functions dell'istanza
  verificano: più disaccoppiato, ma da costruire; si parte con la
  scrittura diretta.
- **Regione unica** `europe-west1` per tutta la flotta (già cablata in
  client e Functions): semplifica script e quote, e va bene finché i
  clienti sono italiani.
- **Stripe solo nella regia**: le istanze non sanno niente di soldi
  dell'abbonamento; conoscono solo `settings/licenza`. Il POS non dipende
  mai da un servizio esterno per funzionare (coerente con la regola
  "niente aspetta la rete").

## Fase 6 — Backoffice: margini per cliente e stato della flotta

Il cruscotto della Fase 4.4 cresce fino a diventare il backoffice vero:
una sezione protetta della regia (Auth con claim admin, visibile solo a
noi) che risponde a tre domande: **quanto incasso, quanto spendo, come
stanno le istanze** — per ogni cliente.

### Da dove arrivano i numeri

| Numero | Fonte | Come |
|---|---|---|
| Ricavi per cliente | Stripe | webhook già previsti in Fase 5 (fatture pagate, upgrade, disdette) salvati sul record cliente; riconciliazione mensile via API |
| Costi cloud per cliente | **Export fatturazione → BigQuery** | l'account di fatturazione esporta ogni giorno il costo per progetto e servizio; siccome un progetto = un cliente, l'attribuzione è esatta, non stimata. ⚠️ L'export **non è retroattivo**: va acceso subito, ancora prima di avere clienti |
| Costi AI per cliente | le Functions stesse | quando arriverà `REQ-AI-001` (scansione fatture), ogni chiamata logga token e costo stimato su un doc contatore dell'istanza; una Function della regia li raccoglie |
| Stato istanza | le istanze + la regia | versione deployata (già prevista in Fase 4), ultimo deploy riuscito, esito health-check schedulato, conteggi aggregati di attività (es. ordini/giorno — solo numeri, mai contenuti: i dati dei locali restano loro) |

### Come si materializza

1. **Una Function schedulata (giornaliera)** nella regia aggrega tutto in
   documenti `metriche/{cliente}/{mese}`: ricavo, costo cloud (da query
   BigQuery), costo AI, margine, ordini totali, versione. Il backoffice
   legge solo questi documenti: niente query pesanti a ogni apertura.
2. **La dashboard**: elenco clienti con margine del mese e stato
   (verde/giallo/rosso), dettaglio per cliente con serie mensile
   ricavi/costi, spesa per servizio (Firestore, Functions, Hosting, AI),
   versione e ultimo contatto dell'istanza.
3. **Allarmi**, prima ancora della grafica:
   - budget Google Cloud per progetto (soglia sul piano venduto): un
     cliente che costa più del suo abbonamento si deve segnalare da solo;
   - istanza che non risponde all'health-check o ferma a una versione
     vecchia dopo un rollout;
   - pagamento Stripe fallito (già dai webhook di Fase 5).
4. **Privacy by design**: la regia vede aggregati (conteggi, costi,
   versioni), mai i dati operativi dei locali (ordini, incassi dei conti,
   clienti finali). Ogni titolare resta titolare dei suoi dati; cosa
   raccogliamo in aggregato va scritto nel contratto.

Ordine di costruzione consigliato: prima l'export BigQuery (subito, è
gratis e non retroattivo), poi la Function di aggregazione con i dati già
disponibili (versioni + Stripe), la dashboard per ultima — finché i
clienti sono pochi, i documenti `metriche/` si leggono anche dalla
console Firebase.

---

## Fuori dal piano (scelte deliberate, da riaprire solo se serve)

- **i18n** (~2.000 stringhe italiane), **valuta** (€ cablato),
  **timezone** (`Europe/Rome` in `src/lib/businessDay.js:12`): servono
  solo per vendere fuori Italia.
- **Multi-tenant vero** (tanti locali su un DB): richiederebbe riscrivere
  `src/lib/api.js` e `firestore.rules` e cambiare i claim; ha senso solo
  oltre le decine di clienti con onboarding self-service. La replicazione
  per progetto dà isolamento, fatturazione e sicurezza gratis.
- **Template scontrino configurabile** (layout 48 colonne fisso in
  `printer.js`): si affronta quando un cliente reale chiede un formato
  diverso.

## Rischi aperti (da chiudere prima di vendere, non prima di sbrandizzare)

- **15 requisiti implementati senza test**, concentrati proprio nelle aree
  premium (stampa, gruppi, vista cliente): vanno coperti prima di metterli
  a listino.
- **`REQ-STAMPA-003`** (certificato stampante che scade): irrisolto, ogni
  cliente con stampante è una chiamata di assistenza ricorrente.
- **Fiscale**: lo scontrino termico non è uno scontrino fiscale (serve un
  RT). Nel contratto va scritto cosa fa l'app e cosa no.
- **Privacy**: ogni cliente è titolare del trattamento dei propri dati; le
  policy vanno generate per titolare (coperto in Fase 1.6).

## Criteri di accettazione dell'intero piano

1. Test-guardia a whitelist vuota su `src/` e `functions/`.
2. La demo neutra online, deployata dallo stesso commit della Tana, senza
   alcun residuo di brand.
3. La Tana in produzione mai cambiata se non per migrazioni additive
   annunciate.
4. Attivare un cliente finto di prova (progetto vergine + cartella
   cliente + script) richiede meno di una giornata e zero modifiche al
   codice.
5. (Fase 5) Un'iscrizione di prova sul sito prodotto con Stripe in modalità
   test arriva fino a: record cliente nella regia, istanza attivata,
   licenza scritta, accesso admin funzionante.
6. (Fase 6) Per ogni cliente il backoffice mostra ricavo, costo cloud
   reale (da export BigQuery) e margine del mese, e un'istanza spenta o
   troppo costosa genera un allarme senza che nessuno la stia guardando.
