// ── L'ALLEGATO DI UN DOCUMENTO FORNITORE (REQ-MAG-033) ───────────────
//
// L'utente, 20/08: «Allegare = il documento vero (foto/PDF), non solo un
// numero. Serve lo Storage; da decidere in implementazione limite di peso e
// formati». Qui ci sono quelle decisioni, e ci sono da sole: sono numeri e
// regole, si provano senza database e senza browser.
//
// Chi allega è in piedi in magazzino con la fattura in mano e il telefono
// nell'altra. Quindi il limite si dice PRIMA di scegliere il file, e chi lo
// supera legge cosa fare — non un errore che gli dà la colpa.

// ── QUALI FORMATI, E PERCHÉ QUESTI ───────────────────────────────────
//
// Una fattura arriva in due modi soli: fotografata col telefono, oppure
// scaricata dal portale del fornitore. Il primo caso è JPEG (e PNG per gli
// screenshot, WebP per qualche Android), il secondo è PDF. Tutto il resto —
// un HEIC che il browser non sa aprire, un DOCX, uno ZIP — non è una cosa
// che il locale possa poi guardare, e accettarlo vorrebbe dire scoprirlo
// mesi dopo davanti al commercialista.
//
// L'ELENCO È CHIUSO APPOSTA, e non è `image/*`: un HEIC di iPhone passa da
// `image/*`, ma il canvas non lo sa decodificare — finirebbe su Storage a
// piena dimensione e non si aprirebbe più. Meglio dirlo nell'istante in cui
// lo si sceglie. (In pratica quasi non capita: quando si carica dalla
// libreria foto, iOS consegna già un JPEG.)
export const FORMATI_IMMAGINE = ['image/jpeg', 'image/png', 'image/webp']
export const FORMATO_PDF = 'application/pdf'

// ── QUANTO PUÒ PESARE ────────────────────────────────────────────────
//
// 8 MB è quello che finisce su Storage, ed è la stessa cifra scritta in
// `storage.rules`: il limite vero lo mette la regola, questo qui davanti
// serve solo a dirlo prima invece di far fallire un caricamento a metà.
//
// Perché 8 e non meno: una foto ridotta qui sotto sta in mezzo mega, un PDF
// di fattura pure — ma un PDF scansionato di più pagine, che è la cosa che
// certi fornitori mandano, arriva tranquillamente a cinque. Perché 8 e non
// di più: sopra quella soglia non è più una fattura, è un catalogo, e
// scaricarlo dalla connessione del locale per guardarlo costerebbe più che
// ricercare la carta.
export const PESO_MASSIMO = 8 * 1024 * 1024

// La foto NON RIDOTTA oltre la quale non si prova nemmeno ad aprirla. Uno
// scatto da telefono sta fra i 3 e i 5 MB e passa di qui senza accorgersene;
// venticinque vuol dire un file che non viene da una fotocamera, e provare a
// decodificarlo in canvas su un telefono di tre anni fa vuol dire la
// schermata che si pianta con la merce in mano.
export const PESO_MASSIMO_SCATTO = 25 * 1024 * 1024

// ── QUANTO SI RIDUCE UNA FOTO ────────────────────────────────────────
//
// UNA FATTURA SI DEVE LEGGERE, NON STAMPARE. Duemila punti sul lato lungo di
// un A4 fanno circa 170 punti per pollice: è la soglia sotto la quale il
// corpo piccolo — le aliquote, i numeri di riga — comincia a impastarsi. Le
// foto dei drink si riducono a 1200 perché sono francobolli in un menu; qui
// il numero è più alto per la ragione opposta, e la qualità un filo più
// bassa perché su un testo nero su bianco non si vede la differenza.
//
// Il conto pratico: uno scatto da 4 MB esce da qui intorno al mezzo mega.
export const LATO_MASSIMO = 2000
export const QUALITA = 0.72

// Che tipo di allegato è questo file: 'immagine' (da ridurre), 'pdf' (da
// lasciare com'è) oppure niente, che vuol dire «non si allega».
export function tipoAllegato(contentType) {
  const tipo = String(contentType || '').toLowerCase()
  if (FORMATI_IMMAGINE.includes(tipo)) return 'immagine'
  if (tipo === FORMATO_PDF) return 'pdf'
  return null
}

// IL CONTROLLO PRIMA, sul file appena scelto. Torna la frase da mostrare
// oppure `null` quando si può procedere. Le frasi dicono cosa fare: chi è in
// magazzino non deve indovinare quale sia il problema.
export function problemaDelFile(file) {
  if (!file) return 'Non è stato scelto nessun file.'
  const tipo = tipoAllegato(file.type)
  if (!tipo) {
    return 'Questo tipo di file non si può allegare. Vanno bene una foto JPG, PNG o WebP, oppure un PDF.'
  }
  // Il PDF non si tocca — non c'è niente da ricomprimere che non rovini il
  // testo — quindi per lui il limite è subito quello finale.
  if (tipo === 'pdf' && file.size > PESO_MASSIMO) {
    return `Questo PDF pesa ${pesoLeggibile(file.size)}: il limite è ${pesoLeggibile(PESO_MASSIMO)}. Allega solo le pagine che servono, oppure fotografa il documento.`
  }
  if (tipo === 'immagine' && file.size > PESO_MASSIMO_SCATTO) {
    return `Questa immagine pesa ${pesoLeggibile(file.size)} ed è troppo grande da lavorare. Rifai la foto con la fotocamera del telefono.`
  }
  return null
}

// IL CONTROLLO DOPO, sul file come esce dalla riduzione. Serve perché la
// riduzione può non riuscire — un'immagine che il browser non decodifica
// torna com'era — e in quel caso il peso è ancora quello di partenza. Senza
// questo controllo la regola di Storage rifiuterebbe il caricamento con un
// errore che non spiega niente a nessuno.
export function problemaDelCaricato(peso) {
  if ((Number(peso) || 0) <= PESO_MASSIMO) return null
  return `Il file resta troppo pesante (${pesoLeggibile(peso)}, il limite è ${pesoLeggibile(PESO_MASSIMO)}). Prova a fotografare il documento invece di allegare il file originale.`
}

// L'estensione con cui il file va salvato. Si guarda il tipo e non il nome:
// dopo la riduzione il file È un JPEG anche se si chiamava `.png`, e un
// nome sbagliato vorrebbe dire un allegato che non si apre.
export function estensioneDi(contentType) {
  const tipo = String(contentType || '').toLowerCase()
  if (tipo === FORMATO_PDF) return 'pdf'
  if (tipo === 'image/png') return 'png'
  if (tipo === 'image/webp') return 'webp'
  return 'jpg'
}

// Dove finisce il file. Sotto la cartella della fattura, perché così la
// regola di Storage può parlare del documento e non di un mucchio comune, e
// perché a colpo d'occhio nella console si vede di chi è quel file.
//
// Il nome ha data e caso: due allegati della stessa fattura caricati nello
// stesso secondo da due terminali diversi non si sovrascrivono.
export function percorsoAllegato(idFattura, contentType, adesso = Date.now(), caso = Math.random()) {
  return `fatture/${idFattura}/${adesso}-${Math.round(caso * 1e6)}.${estensioneDi(contentType)}`
}

// L'allegato di una fattura, o niente. Una fattura scritta prima di questa
// voce non ha il campo, e non è un errore: è la normalità di tutte quelle
// già in archivio.
export function allegatoDi(fattura) {
  const a = fattura?.attachment
  return a && a.url && a.path ? a : null
}

export const haAllegato = (fattura) => allegatoDi(fattura) !== null

// IL TERZO BUCO, e si guarda come gli altri due (REQ-MAG-031): a fine mese
// il commercialista chiede la carta, e una fattura registrata senza il suo
// documento è lavoro che manca — non un errore dell'app.
export function fattureSenzaAllegato(fatture) {
  return (fatture || []).filter((f) => !haAllegato(f))
}

// Il peso scritto come lo scriverebbe una persona. Sotto il mega si contano
// i kB: «0,3 MB» non dice niente, «312 kB» sì.
export function pesoLeggibile(byte) {
  const n = Number(byte) || 0
  if (n < 1024) return `${n} byte`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`
  // Il decimale solo dove dice qualcosa: «8 MB» è il limite, «8,0 MB» è un
  // numero che sembra il risultato di un calcolo.
  return `${String(Number((n / (1024 * 1024)).toFixed(1))).replace('.', ',')} MB`
}
