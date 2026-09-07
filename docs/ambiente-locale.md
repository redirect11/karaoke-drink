# Provare un branch in locale, come se fosse il server

Serve per lavorare su un branch senza pubblicarlo: l'ambiente di test è
uno solo e ci passano a turno `develop` e i branch di tutti. In locale
invece si rompe quello che si vuole, si svuota il database e si ricomincia.

Nessun progetto vero viene toccato: gli emulatori girano su
`demo-tana-drink`, che vive solo sul tuo computer.

## Prima volta: due inciampi da togliere di mezzo

**Java 21.** `firebase-tools` dalla versione 15 non parte con Java più
vecchio, e sulle nostre macchine c'era il 17. L'errore lo dice chiaro
(«no longer supports Java version before 21»):

```powershell
winget install --id EclipseAdoptium.Temurin.21.JRE -e
```

Poi **si riapre il terminale**, se no resta il PATH di prima. Per una sola
sessione si può anche puntare al JRE senza riaprire niente:

```powershell
$env:PATH = "C:\Program Files\Eclipse Adoptium\jre-21.0.12.8-hotspot\bin;" + $env:PATH
```

**La porta 8080 è occupata.** Su questa macchina la tiene un servizio di
sistema (`AgentService`), e l'emulatore Firestore non parte. Per questo
esiste `firebase.collaudo.json`: è `firebase.json` con tre porte spostate —
Firestore **8081**, pannello **4001**, hub **4401** — e si passa con
`--config`. Il resto (Auth 9099, Storage 9199) resta dov'era.

Chi non ha quel servizio può ignorarlo e usare `firebase.json`; chi ce l'ha
ha una ricetta che funziona senza doverla ritrovare ogni volta.

## Una linea di rilascio nuova: cosa NON arriva col ramo

Ogni ramo si lavora nel suo git worktree ([docs/gitflow.md](gitflow.md)), e
un worktree appena creato ha solo i file **versionati**. Tre cose restano
indietro, e finché mancano l'ambiente non parte:

```sh
git worktree add ../tana-drink-1.5.x -b release/1.5.x origin/develop
cd ../tana-drink-1.5.x
cp ../tana-drink-1.4.x/.env .          # ← senza, «Firebase non è configurato»
npm ci                                  # ← node_modules non si eredita
```

Il terzo è l'**export dell'emulatore** (`.emulatori/`): se non lo si copia,
il database parte vuoto e va rifatto il seed (`npm run seed:dev`) più
l'account di prova. Nessuna delle tre è versionata, e ha senso così — il
`.env` porta le chiavi — ma vanno portate a mano.

Vale anche per il **dev server**: legge `.env` e il numero di versione
all'AVVIO, e resta agganciato alla cartella da cui è partito. Cambiando
linea va fermato e rilanciato da quella nuova, se no si prova il codice
vecchio sui dati nuovi — con la versione sbagliata scritta in fondo alla
pagina.

## Due modi

### 1. Sviluppo, per lavorare (ricarica a ogni salvataggio)

Il giro completo, da zero, in due terminali:

```powershell
# TERMINALE 1 — emulatori (Auth, Firestore, Storage)
npx firebase emulators:start --project demo-tana-drink `
  --only auth,firestore,storage --config firebase.collaudo.json

# TERMINALE 2 — dati finti, utente, app
node scripts/seed.js          # menù, magazzino, impostazioni
node scripts/mock-orders.js   # una serata di ordini
node scripts/set-role.js --emulator --email banco@tana.local --role bartender
npm run dev -- --port 5175    # http://localhost:5175
```

Serve un file **`.env`** (non versionato) che dica al client di parlare con
gli emulatori sulla porta giusta:

```
VITE_USE_FIREBASE_EMULATOR=true
VITE_FIREBASE_PROJECT_ID=demo-tana-drink
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-tana-drink.firebaseapp.com
VITE_APP_ENV=test
VITE_FIRESTORE_EMULATOR_HOST=localhost
VITE_FIRESTORE_EMULATOR_PORT=8081
```

Gli stessi valori servono agli script del passo 2 (`seed`, `mock-orders`):
o stanno nell'ambiente del terminale, o si passano davanti al comando.

**L'utente con cui entrare** si crea dal pannello
(http://localhost:4001 → Authentication → Add user) e poi gli si dà il
ruolo con `set-role.js`. Per le prove va bene
`banco@tana.local` / `collaudo123`.

**La 5173 può essere già occupata** da un altro dev server: `--port 5175`
toglie il dubbio (Vite altrimenti ne sceglie una a caso e poi non si sa
dove guardare).

**Gli emulatori si ricordano i dati fra un avvio e l'altro**
(`--export-on-exit=.emulatori`, e `--import` quando la cartella c'è):
uscendo li salvano, ripartendo li ricaricano. Se la cartella non c'è, si
risemina — sono dieci secondi. E tutto vive sul progetto finto
`demo-tana-drink`: né il test né la produzione vengono sfiorati.

### 2. Come il server, per provare davvero

```sh
npm run locale      # compila e avvia TUTTO
```

Compila l'app come in produzione (con `.env.locale`) e la fa servire
dall'**emulatore Hosting**, insieme ad Auth, Firestore, Storage e
**Functions**:

| Cosa | Indirizzo |
|---|---|
| App | http://localhost:5000 |
| Pannello emulatori | http://localhost:4000 |
| Functions | :5001 · Auth :9099 · Firestore :8080 · Storage :9199 |

È la differenza che conta: col dev server le Cloud Functions non ci sono e
il codice gira non compilato. Qui invece si prova quello che finirebbe
online — callable comprese (gestione utenti, pagamenti) — e in fondo al
menu si legge lo stesso ramo e commit che si vedrebbe sul server.

Prerequisiti: **Java** (lo vuole l'emulatore Firestore) e le dipendenze
delle Functions installate una volta (`cd functions && npm install`).

## Riempirlo di roba

Un database vuoto non si prova: si semina.

```sh
npm run seed:tutto    # tutto quello qui sotto, in fila
```

Oppure un pezzo per volta:

```sh
npm run seed:dev      # menù, inventario, impostazioni
npm run mock:orders   # ordini di una serata
npm run mock:history  # storico per le statistiche
npm run mock:casse    # chiude quelle serate: casse e incassi divisi per metodo
```

### I prodotti scritti col modello vecchio

```sh
npm run seed:vecchi                              # li aggiunge
node scripts/seed-magazzino-vecchio.js --pulisci # li toglie
node scripts/diagnosi-travaso.js                 # come si leggono adesso
```

Dal 1.5 il magazzino si conta solo a **pezzi**. I prodotti scritti coi
modelli di ieri si **leggono** già a pezzi, ma il database lo cambia solo
un gesto esplicito di chi lavora: entrando in Magazzino compare un avviso,
si guarda cosa cambia senza scrivere niente, e solo allora si aggiorna
(REQ-MAG-018). Il rischio è scoprire al primo aggiornamento che una forma
vecchia non l'avevamo prevista — e scoprirlo sulle giacenze vere del
locale: per questo il giro si prova qui, con dati come quelli veri.

`seed:vecchi` riempie l'emulatore con **tutte** le forme che esistono
davvero: a pezzo con e senza contenuto, a volume, a peso, a volume senza
confezione, «U» con e senza scorta, con la resa fra due unità, col campo
`tipo` delle quattro card, con la giacenza sotto zero — più una ricetta
che li usa, perché il numero che non deve muoversi è il costo del drink.
Sta **fuori** da `seed:tutto`: sporca il magazzino di prova con roba che
serve per una verifica precisa, non tutti i giorni.

`diagnosi-travaso.js` **non scrive niente**, mai: dice quanti articoli
sono ancora nella forma vecchia e se leggerli a pezzi muove valore, pezzi
o costi. Con `--project tana-drink-test` (o `tana-drink`) guarda gli
stessi numeri sui dati veri, sempre in sola lettura.

**Il magazzino vero, per provare il travaso.** I prodotti finti servono a
provare una schermata, non una migrazione: le stranezze che contano — il
contenuto scritto senza misura, il prodotto comprato al chilo e versato in
centilitri, le giacenze sotto zero — si sono accumulate in due anni e
stanno nei dati veri.

```sh
node scripts/copia-magazzino-da-test.js --pulisci   # articoli, categorie, fornitori
```

**Dalla produzione, e solo magazzino e menù.** Quando serve provare sui dati
veri veri, si scarica un backup PARZIALE — mai tutto: gli ordini, i clienti,
le ore e le paghe non servono a provare il magazzino, e portarli in giro
sposta dati di persone.

```sh
node scripts/backup-db.js --project tana-drink   --solo inventory_items,inventory_categories,suppliers,drinks,categories   --out backup/produzione-magazzino-menu.json
node scripts/carica-su-emulatore.js --file backup/produzione-magazzino-menu.json --pulisci
```

Il file finisce in `backup/`, che git ignora: dentro ci sono i dati del
locale e non vanno su GitHub. `carica-su-emulatore.js` scrive **solo**
sull'emulatore — la destinazione è cablata.

Legge `tana-drink-test` in **sola lettura** e scrive **solo** sull'emulatore
(la destinazione è cablata: la produzione non compare in quel file). Con
`--movimenti` porta anche lo storico dei carichi, che è grosso e serve di
rado.

**Le chiusure servono più di quanto sembri**: le statistiche si aprono
sull'ultima serata chiusa, e senza nemmeno una chiusura ripiegano sulle
«ultime 10 giornate» — sembra un difetto e invece è un database a metà.
Per lo stesso motivo `seed:tutto` le fa in fondo: una cassa si chiude
attorno a ordini che esistono già.

Gli script **cercano l'emulatore da soli** (`scripts/lib-emulatore.js`):
provano le porte scritte nelle configurazioni del progetto — 8081 del
collaudo, 8080 di quella normale — e usano la prima che risponde. Se
l'emulatore non c'è si fermano dicendolo, invece di scrivere «fatto» senza
aver scritto niente. Per puntarli altrove: `VITE_FIRESTORE_EMULATOR_PORT`.

Le utenze si creano dal pannello emulatori
(http://localhost:4000 → Authentication → Add user) e il ruolo si assegna
con:

```sh
node scripts/set-role.js --emulator --email tu@bar.it --role admin
```

Il seed crea anche **quattro utenze, una per ruolo** (solo sull'emulatore:
sul progetto vero non tocca gli account):

| Utenza | Ruolo |
|---|---|
| `banco@tana.local` | admin |
| `bartender@tana.local` | bartender |
| `sala@tana.local` | staff (sala) |
| `cliente@tana.local` | cliente |

Password per tutte: `collaudo123`. Servono perché quello che vede l'admin non
è quello che vede la sala, e i guai peggiori nascono lì — un tasto che c'è
per chi comanda e non per chi serve. Con una utenza sola quelle differenze
non le vede nessuno.

Gli articoli di magazzino hanno anche **costo e IVA d'acquisto**: senza,
costo al cl, valore di magazzino, margine e prezzo consigliato restano vuoti
— cioè metà delle schermate che si vogliono provare.

## Provare le regole Firestore

Le regole sono l'unica barriera fra i dati del locale e chiunque abbia letto
`apiKey` e `projectId` dal bundle — pubblici per disegno. Hanno una suite
loro, che gira contro l'emulatore con le regole **vere** lette da
`firestore.rules` (REQ-DEV-015):

```sh
npx firebase emulators:start --project demo-tana-drink   --only auth,firestore,storage --config firebase.collaudo.json
npm run test:regole
```

Non stanno in `npm test`: senza emulatore acceso non partirebbero, e la CI
diventerebbe rossa per un motivo che non è un difetto. Girano su progetti
loro (`regole-*`), quindi non toccano i dati con cui stai lavorando.

**Ogni prova è doppia**: che l'abuso sia bloccato conta quanto che l'uso
legittimo passi. Una regola che chiude tutto è facile da scrivere e la sera
manda a casa il locale.

## Cosa NON si prova in locale

- **La stampante vera**: è un apparecchio sulla rete del bar, e da qui non
  si raggiunge. In locale però ce n'è una **finta**: le comande e gli
  scontrini si aprono nella finestra di stampa del browser, da cui si
  salvano in PDF. Si accende da sé (server di sviluppo, build `locale` o
  emulatori) e **non** vale sull'ambiente di test, dove ci si collega a
  quella vera. Per spegnerla: `VITE_STAMPANTE_FINTA=false`.
- **SumUp**: le chiamate vere vogliono le credenziali del locale; in
  emulatore si simulano dai DevTools.
- **App Check / reCAPTCHA**: in locale è disattivato (non c'è dominio da
  verificare). È acceso solo in produzione.
- **Le push**: vogliono un dominio in HTTPS e le chiavi vere.

## Da un altro dispositivo della rete

Il server di sviluppo e gli emulatori ascoltano su tutte le interfacce
(`firebase.collaudo.json`), quindi da un altro computer o dal telefono si
apre `http://<ip-del-pc>:5175`. L'app capisce da sola a quale indirizzo
chiedere i dati: usa lo stesso host da cui è stata servita, non
`localhost` — che sull'altro dispositivo sarebbe l'altro dispositivo.

**Col Firestore emulato si parla in long-polling** (`firebaseClient.js`).
Il canale veloce di Firestore, raggiunto da un'altra macchina, a volte si
apre e non consegna mai niente: la pagina si carica, le connessioni si
vedono aperte, e i dati non arrivano — a schermo compare «il wifi risulta
collegato ma non sta passando niente», che è esattamente quello che
succede. In produzione resta il canale veloce, che è più leggero.

Se da un altro dispositivo non arriva comunque niente, la cosa da guardare
prima è il firewall di Windows sulle porte degli emulatori (8081 Firestore,
9099 Auth): `netstat -ano | findstr :8081` deve mostrare l'ascolto su
`0.0.0.0` e una connessione dall'IP dell'altro dispositivo.

## Quando l'emulatore si impianta

Capita, e la prima volta è costata mezza giornata a capirlo: il Firestore
emulato accetta le connessioni e **non risponde più** — né all'app né agli
script.

**Guarda subito i log.** L'emulatore scrive `firestore-debug.log` e
`firebase-debug.log` nella cartella del progetto, e li scrive con un
dettaglio altissimo: dopo qualche giorno di uso erano **16 GB e 34 GB**, il
disco al 96%, e il processo si è fermato lì — non morto, bloccato a
scrivere. Si cancellano e basta (sono log di debug, non dati):

```powershell
Remove-Item firebase-debug.log, firestore-debug.log
```

Vale la pena guardarli ogni tanto, o cancellarli quando si riavvia. Da fuori sembra un problema di rete, e l'app
infatti scrive «il wifi risulta collegato ma non sta passando niente»; in
locale però la causa è quasi sempre questa. Il modo per esserne sicuri, in
due secondi:

```sh
curl -m 5 "http://127.0.0.1:8081/v1/projects/demo-tana-drink/databases/(default)/documents/orders?pageSize=1"
```

Se va in timeout con zero byte, l'emulatore è impiantato: si riavvia e basta.
Un dettaglio che inganna: **l'app sullo stesso computer sembra funzionare**
perché legge dalla sua cache locale e accoda le scritture; un secondo
dispositivo, che la cache non ce l'ha, resta a mani vuote.

I dati dell'emulatore si salvano uscendo e si ricaricano al via successivo
(`--import=.emulatori --export-on-exit`): un riavvio non costa più la
serata di prova. Se la cartella non c'è ancora, la si ricrea con
`npm run seed:dev`, `npm run mock:history`, `npm run mock:casse`.
