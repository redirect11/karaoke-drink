# Tana Drink — istruzioni per chi lavora qui (persone e agenti)

App di cassa e gestione per **La Tana del Coniglio**, cocktail bar a Nola.
Non è una demo: ci si batte gli ordini la sera, col locale pieno. Ogni
scelta va pesata su quello — un errore qui vuol dire un conto sbagliato o
un drink che non arriva.

React + Vite (PWA) · Firebase (Firestore, Auth, Functions, Hosting) ·
SumUp per i pagamenti · stampante termica Epson al banco.

## La lingua

**Tutto in italiano**: interfaccia, commenti, messaggi di commit, titoli
delle PR, risposte nelle issue. Chi legge questo codice parla italiano.

## Come si lavora: GitFlow

Regole non negoziabili, per intero in [docs/gitflow.md](docs/gitflow.md).

- Il lavoro normale va su **`release/x.y.z`**, staccato da `develop`.
  Se ne esiste già uno aperto, si lavora lì.
- Un branch `feature/<nome>` solo per una funzione **grossa**, o quando lo
  si chiede esplicitamente.
- **Mai commit diretti su `develop` o `main`** — e i merge ci arrivano
  solo via **pull request**: sono rami protetti, il check della CI
  (lint, test, coverage con le soglie) è obbligatorio per mergiare.
- `hotfix/<nome>` nasce da `main` e torna in `main` **e** in `develop`. I
  bug urgenti stanno nelle issue con etichetta **`hotfix`**, e a lavorarli
  c'è l'agente
  [`rilascio-hotfix`](.claude/agents/rilascio-hotfix.md).
- **A pubblicare è il tag, non il push.** Un push fa girare lint, test e
  build e finisce lì. Un **tag su un commit non in `main`** va sul **test**;
  un **tag su un commit di `main`** manda in **produzione**, e quel deploy
  aspetta un'approvazione a mano su GitHub.
- La versione `x.y.z` si tagga su `develop` subito prima del merge su
  `main`.
- **Appena una versione esce, `package.json` sul ramo di lavoro torna
  subito alla PROSSIMA col `-beta`** (1.5.5 uscita -> `1.5.6-beta`). E'
  il primo commit della linea nuova, non una cosa da ricordarsi dopo:
  senza, in locale e sul test si legge il numero di quella gia' uscita e
  non si capisce piu' se quello che si ha davanti contiene le modifiche
  di oggi.

Per un agente che apre una pull request: la PR va **verso il
`release/x.y.z` aperto** (o verso `develop` se non ce n'è uno), mai verso
`main`.

## Prima di una PR — e il cancello del merge in `develop`

```sh
npm run lint             # deve essere pulito (può uscire 1 SENZA stampare: guarda l'esito)
npm test                 # deve essere verde (990+ test)
npm run build            # deve compilare
npm run test:coverage    # deve passare le soglie (vitest.config.mjs)
```

Per il **merge in `develop`** c'è un cancello in più, descritto per
intero in [docs/gitflow.md](docs/gitflow.md): requisiti e registro bug
aggiornati coi test citati, coverage sopra le soglie (sono un cricchetto:
si alzano, mai si abbassano), e **un giro di refactoring sul diff**
(riuso, complessità, commenti sul perché) — con Claude, `/simplify`.

La pipeline fa girare lint e test **prima** del deploy: se sono rossi non
viene pubblicato niente (e senza un tag non si pubblica comunque). Non aggirarla e non "sistemare" un test per farlo
passare: se un test fallisce, o il codice è sbagliato o il test descriveva
una cosa che abbiamo deciso di cambiare — e in quel secondo caso si cambia
il test spiegando perché.

## I test sono la specifica

I test in `tests/` dicono cosa fa l'app, e i loro commenti dicono **perché**
— quasi tutti nascono da un difetto vero visto al banco. Chi tocca un
comportamento aggiunge o aggiorna il test corrispondente.

- `tests/unit/` — logica pura (calcoli, regole, conversioni)
- `tests/component/` — schermate, con Firebase e hardware simulati
- `tests/bdd/` — le Cloud Functions

I requisiti in [requirements/requirements.yaml](requirements/requirements.yaml)
sono la mappa di cosa esiste; i difetti veri stanno nel registro
[requirements/bugs.yaml](requirements/bugs.yaml) (stesso formato, stati
`todo`/`fixed`/`wontfix`, campo `in_produzione`). Da entrambi nascono le
issue GitHub, idempotenti; un bug `fixed` nel registro **chiude** la sua
issue da solo.

## Come si scrive qui

- **L'interfaccia segue [DESIGN.md](DESIGN.md)**: tema, palette con ruoli,
  componenti e guardrail. I valori operativi stanno in `src/lib/themes.js`
  e `src/index.css`; se cambiano, DESIGN.md si aggiorna nello stesso commit.

- **I commenti spiegano il perché, non il cosa.** Il codice dice già cosa
  fa. Il commento serve a chi tra sei mesi si chiederà "perché è fatto
  così?" — di solito la risposta è un guaio successo davvero.
- Nomi in italiano dove il dominio è italiano (`conto`, `comanda`,
  `scorte`, `giornata`), in inglese dove lo è il codice attorno.
- Niente riscritture di massa non richieste, niente rinomini a tappeto.
- L'interfaccia va spiegata a chi ha in mano un vassoio: parole comuni,
  nessun gergo tecnico, nessun messaggio d'errore che scarica la colpa
  addosso a chi legge.
- **Ma il tono resta professionale.** Didascalie, descrizioni delle
  impostazioni e messaggi non danno del tu con la pacca sulla spalla, non
  fanno battute e non raccontano aneddoti: dicono cosa fa una cosa e a cosa
  serve, in una frase piana. «Parole comuni» vuol dire *comprensibili*, non
  *confidenziali* — questa è l'app con cui si incassano i soldi di un
  locale, e chi la legge sta lavorando. Il perché di una scelta, i casi
  visti al banco e il colore vanno nei COMMENTI del codice e nel registro,
  dove servono a chi sviluppa: non a schermo.
- **La navigazione ha delle regole scritte**: barra in alto a tre zone, cosa
  si toglie per primo quando lo spazio manca, dove stanno pagine,
  sottosezioni e filtri. Stanno in [docs/navigazione.md](docs/navigazione.md)
  e si seguono invece di ridiscuterle a ogni schermata.

## Regole del mestiere (imparate sbagliando)

Il disegno completo — modello dati, i cinque attrezzi del local-first,
flusso di un conto, sicurezza — sta in
[docs/architettura.md](docs/architettura.md): **da leggere prima di
toccare coda, conto, pagamento o il modello dati.** Qui i vincoli secchi:

### Il local-first è la prima regola, e non si negozia

Questa è la regola che viene prima di tutte le altre, per chi lavora qui —
persone e agenti. È già stata violata più volte, sempre per distrazione e
sempre con lo stesso danno: si aggiungono tre drink a un conto, si torna
alla coda, e la card mostra ancora il totale di prima «finché non
sincronizza». Al banco quello è un conto sbagliato.

**Coda ordini, comande, nuovo ordine, modifica ordine, contanti e
pagamenti lavorano SOLO in locale.** Tutto il giro di una serata con la
cassa aperta deve funzionare con la rete staccata: le card si aggiornano
subito, le liste anche quando un conto cambia stato, i pagamenti pure. La
sincronizzazione è una cosa che succede dopo, in sottofondo, e nessuno la
aspetta.

Da qui scendono quattro cose pratiche:

- **Niente `await` prima di mostrare l'esito di un gesto.** Un conto
  incassato, annullato, una riga aggiunta si vedono nell'istante in cui si
  tocca. Un `await` su una scrittura Firestore offline non torna mai: è
  l'app bloccata col locale pieno.
- **Non si rilegge quello che si è appena scritto: si compone.** La
  scrittura parte in sottofondo, quindi nell'istante della rilettura la
  cache contiene ancora la versione di prima — chi rilegge, rilegge il
  passato. Il risultato si costruisce in memoria dal documento di partenza
  più la patch appena mandata (`ordineDopo` in `src/lib/api.js`). Questo è
  stato il difetto di BUG-045, ed è tornato più di una volta.
- **Se un dato serve e non c'è, si precarica** (vedi
  `src/lib/progressivi.js`): non lo si va a chiedere nel mezzo di un gesto.
- **Le scritture partono in sottofondo** (`bgWrite`), con l'indicatore di
  sincronizzazione che dice come sta andando.

**E i test lo devono dimostrare, non darlo per buono.** Chi tocca queste
schermate scrive un test che gira **senza rete**: si mocka `firebase/firestore`
in modo che ogni scrittura resti appesa per sempre e ogni lettura risponda
con quello che c'era prima — che è quello che fa davvero una cache mentre
la scrittura è in coda. Non si mocka `src/lib/api.js`, se no si prova il
mock e non il codice. Il modello è
[`tests/unit/giroInLocale.test.js`](tests/unit/giroInLocale.test.js), che è
scritto apposta per essere copiato. I test con la rete che risponde si
fanno **in più**, non al posto di quelli.
- **Il magazzino si scala con lo snapshot**, non ricalcolando la ricetta:
  la ricetta cambia, il drink già fatto no.
- **I ruoli si confrontano solo con `src/lib/ruoli.js`.** C'è un test che
  boccia i confronti diretti sparsi nel codice.
- **Le quantità in magazzino sono in unità base** (ml, g, pz). "4 cl" non
  deve mai diventare 4 pezzi.
- **La produzione non si tocca** senza un via libera esplicito: gli script
  scrivono su `tana-drink-test` e la produzione va nominata a mano.

## Ambiente locale

```sh
npm run dev       # server di sviluppo (con emulatori: npm run emulators)
npm run locale    # come il server: app compilata + Functions + Hosting emulati
npm run seed:dev  # riempie il database locale
```

Dettagli in [docs/ambiente-locale.md](docs/ambiente-locale.md). Stampante,
SumUp, notifiche push e App Check in locale non si provano.

## I requisiti e i test sono la bibbia

`requirements/requirements.yaml` dice **cosa fa l'app**; i test dicono cosa
fa **davvero**. Le due cose vanno tenute insieme, e c'è un test che lo
verifica: ogni file di test dev'essere citato nei `test_cases` di almeno un
requisito, e ogni test citato deve esistere. Un requisito può avere più
test; un test appartiene a un requisito.

```sh
node scripts/requisiti.mjs              # a che punto siamo
node scripts/requisiti.mjs --documento  # rigenera la specifica di sistema
```

Il documento che ne esce, [docs/system_specifications.md](docs/system_specifications.md), è **la
specifica di sistema**: cosa fa l'app, area per area, coi test che lo
dimostrano, i lavori previsti in un capitolo a parte e i difetti noti in
fondo. È **generato** e non si tocca a mano — si tocca il registro e si
rigenera, se no torna vecchio come era già successo (REQ-DEV-012).

Tre stati che contano:

- ✅ **fatto e coperto** — `implemented`, con i test che lo dimostrano
- ⚠️ **fatto ma scoperto** — `implemented` senza test: funziona finché
  qualcuno non lo rompe senza accorgersene
- ⬜ **da fare** — `todo`, e da lì nascono le issue GitHub
  (`scripts/generate-issues.mjs`)

**Quindi:** OGNI richiesta lavorata — funzione o difetto — nasce o
aggiorna la sua voce (`REQ-*` o `BUG-*`), e codice, test e requisito
viaggiano insieme, nello stesso commit. Se nasce una funzione, prima il
requisito.

## Cose da sapere sull'infrastruttura

**Non si scrive mai in produzione di propria iniziativa.** Gli script che
toccano Firestore (import, seed, migrazioni, travasi) girano su
`tana-drink-test`; la produzione va nominata a mano e aspetta il via libera
esplicito. Vale anche per il **tag su `main`**, che è quello che manda in
produzione: il merge da solo non pubblica più niente. In produzione ci sono i dati veri del locale: un import
sbagliato lì non è una prova da rifare, è un danno.

**Deploy delle Functions (Gen2, girano su Cloud Run).** Il service account
del deploy (`firebase-adminsdk-fbsvc@tana-drink…`) deve poter "agire come"
il service account di runtime (`8401382511-compute@developer…`): serve
`roles/iam.serviceAccountUser` sul secondo. Senza, il deploy fallisce con
`iam.serviceaccounts.actAs`. Vanno abilitate le API cloudfunctions,
cloudbuild, artifactregistry, run, eventarc, pubsub, serviceusage, storage.
Richiede il piano Blaze, ma per un bar resta nel tier gratuito.

**`functions/.env` è committato apposta**, ed è esentato nel `.gitignore`:
è il posto dichiarato per la configurazione **non segreta** delle Functions,
e serve a far passare il deploy non interattivo, che senza un valore — anche
vuoto — per le variabili attese si blocca a chiederle da tastiera. Oggi non
contiene nessuna variabile: le due che ci stavano (`SUMUP_VENDOR_ID`,
`SUMUP_OUTLET_ID`) erano di **SumUp Cassa Pro**, rimossa il 26/08/2026. I
segreti veri lì non ci vanno mai: `firebase functions:secrets:set` — è così
che vive `SUMUP_API_KEY`, la chiave del **lettore**, che resta.

**La bozza del POS non si perde mai.** Le righe non confermate sopravvivono
all'uscita dalla schermata (chiave `new` in creazione, id ordine in
modifica); confermare o pagare la azzera. Trappola già vista: il
salvataggio non va dentro un updater di stato React — alla conferma si
svuota e si naviga via nello stesso giro, il componente si smonta, React
scarta l'updater e la cancellazione non avviene. Si salva in modo sincrono.

## Dove sta cosa

| Dove | Cosa |
|---|---|
| `src/pages/BartenderPage.jsx` | gestionale: coda ordini e sezioni |
| `src/components/OrderPosDetail.jsx` | il conto: la schermata più usata |
| `src/lib/api.js` | tutto ciò che tocca Firestore |
| `src/lib/comande.js` | conti e comande, logica pura |
| `src/lib/inventory.js` | magazzino, unità, consumi |
| `src/lib/ruoli.js` | chi può fare cosa |
| `functions/lib/` | logica delle Cloud Functions (pura e testabile) |
| `scripts/` | manutenzione: backup, travasi, ruoli, diagnostica |

## La biblioteca: cosa leggere prima di toccare cosa

| Prima di… | Leggi |
|---|---|
| coda, conto, pagamento, modello dati | [docs/architettura.md](docs/architettura.md) |
| qualunque interfaccia | [DESIGN.md](DESIGN.md) e [docs/navigazione.md](docs/navigazione.md) |
| branch, merge, rilasci, cancello di qualità | [docs/gitflow.md](docs/gitflow.md) |
| provare in locale | [docs/ambiente-locale.md](docs/ambiente-locale.md) |
| Cloud Functions / SumUp | [docs/functions.md](docs/functions.md) |
| capire cosa fa (o non fa) l'app | [docs/system_specifications.md](docs/system_specifications.md), la specifica — o i registri da cui nasce, [requirements/requirements.yaml](requirements/requirements.yaml) + [requirements/bugs.yaml](requirements/bugs.yaml) |
| ragionare sul futuro del prodotto (federazione, white-label) | [docs/piano-sbrandizzazione.md](docs/piano-sbrandizzazione.md) |
