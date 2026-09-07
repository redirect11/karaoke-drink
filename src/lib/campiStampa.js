// ── COSA C'È SULLO SCONTRINO E COSA C'È SULLA COMANDA ────────────────
//
// «Servono delle impostazioni per cambiare/modificare/aggiungere/eliminare
// i campi dello scontrino. I campi che si possono aggiungere/togliere NON
// sono campi liberi: sono i campi che in genere si trovano su uno
// scontrino. La stessa cosa per la comanda. Sicuramente deve andarci la
// lista dei prodotti, quella è fissa» (l'utente, 20/08).
//
// QUINDI UN VOCABOLARIO CHIUSO, non un editor di modelli. I campi sono
// quelli che le due stampe già maneggiano (src/lib/printer.js): qui c'è
// l'elenco, con l'etichetta da vassoio e il valore di partenza. Chi
// stampa chiede «questo blocco lo scrivo?» e «con che parole?», e non sa
// nient'altro — la composizione della carta resta tutta in printer.js.
//
// LA LISTA DEI PRODOTTI NON È QUI, e non è una dimenticanza: uno
// scontrino senza le righe non è uno scontrino. Non compare fra le
// scelte, così non c'è nemmeno il modo di spegnerla per sbaglio. Stessa
// cosa per il TOTALE dello scontrino: un conto senza totale non è un
// conto, e chi lo riceve non avrebbe niente da controllare.
//
// I VALORI DI PARTENZA SONO IL COMPORTAMENTO DI OGGI. Un locale che non
// ha mai aperto questo pannello ha il documento delle impostazioni senza
// queste voci, e la carta che esce deve essere IDENTICA a prima —
// nessuna migrazione da far girare, nessuna sera in cui gli scontrini
// cambiano da soli.

// ── I CAMPI DELLO SCONTRINO ──────────────────────────────────────────
//
// `testo` c'è solo dove il blocco è PURO TESTO, cioè dove cambiare le
// parole è tutto quello che si può fare. Dove il blocco stampa un dato
// del conto (il numero, l'ora, i pagamenti) di testo da cambiare non ce
// n'è: c'è solo l'interruttore.
export const CAMPI_SCONTRINO = [
  {
    id: 'nome_locale',
    label: 'Nome del locale',
    desc: 'In cima, grande. Le parole si cambiano in «Dati del locale», qui sopra.',
    acceso: true,
  },
  { id: 'indirizzo', label: 'Indirizzo', desc: 'La via, sotto al nome.', acceso: true },
  { id: 'citta', label: 'CAP e città', acceso: true },
  {
    id: 'numero',
    label: 'Numero dello scontrino e data',
    desc: 'La riga «SCONTRINO - 12» con giorno e ora.',
    acceso: true,
  },
  {
    id: 'operatore',
    label: 'Chi stampa lo scontrino',
    desc: 'Il nome di chi è collegato a questo terminale. Se non si sa chi è, la riga non esce.',
    acceso: true,
  },
  { id: 'persone', label: 'Quante persone', desc: 'La riga «2 clienti».', acceso: true },
  {
    id: 'riga_vendita',
    label: 'Tavolo o nome del cliente',
    desc: 'La riga «Vendita - Tavolo 4». Senza tavolo e senza nome non esce: il numero è già in cima.',
    acceso: true,
  },
  {
    id: 'intestazione_colonne',
    label: 'Intestazione delle colonne',
    desc: 'La riga «QTA Prodotto — PU Prezzo» sopra ai prodotti.',
    acceso: true,
  },
  { id: 'coperto', label: 'Coperto', desc: 'Solo quando c’è.', acceso: true },
  {
    id: 'sconto',
    label: 'Sconto',
    desc: 'Subtotale e sconto, quando ne è stato fatto uno.',
    acceso: true,
  },
  { id: 'iva', label: 'IVA e imponibile', acceso: true },
  {
    id: 'pagamenti',
    label: 'Come è stato pagato',
    desc: 'Contante, carta, e quanto per ognuno.',
    acceso: true,
  },
  { id: 'lotteria', label: 'Codice lotteria', desc: 'Solo quando il cliente lo dà.', acceso: true },
  {
    id: 'codice_conto',
    label: 'Codice del conto',
    desc: 'La riga lunga in fondo: serve a noi per ritrovarlo, al cliente non dice niente.',
    acceso: true,
  },
  {
    id: 'ragione_sociale',
    label: 'Ragione sociale in fondo',
    desc: 'Le parole si cambiano in «Dati del locale», qui sopra.',
    acceso: true,
  },
  {
    id: 'riga_cortesia',
    label: 'Riga di saluto',
    desc: 'Una riga tua, in fondo allo scontrino.',
    acceso: false,
    testo: { valore: '', label: 'Cosa c’è scritto', placeholder: 'Grazie e a presto!' },
  },
]

// ── I CAMPI DELLA COMANDA ────────────────────────────────────────────
//
// Qui il lettore è il banco, non il cliente: quello che non si legge in
// mezzo secondo è carta sprecata. Le parole delle righe di servizio
// arrivano dal modello da cui il ticket è nato — «CONTATORIE»,
// «Vendeur» — e sono le prime che un locale vuole cambiare o togliere.
//
// LA FASCIA NON HA PIÙ PAROLE DA SCRIVERE (BUG-089). Fino al 25/08/2026
// era una casella di testo con dentro «DIRETTO»; adesso la fascia dice
// QUALE TICKET È — «COMANDA 2 - ORDINE 28» — e quel contenuto viene dai
// dati, non da un'impostazione: un testo libero lì sopra vorrebbe dire
// poterla far mentire, e a corpo doppio non ci starebbe comunque
// accanto. L'interruttore resta: chi la fascia non la vuole la spegne.
// Un locale che aveva scritto la sua parola non trova niente di rotto —
// quel testo semplicemente non viene più letto, e la fascia esce piena.
// Per dire «questo ticket è del bar» c'è la riga del reparto, che di
// parole ne ha ancora.
export const CAMPI_COMANDA = [
  {
    id: 'fascia',
    label: 'Fascia nera in cima',
    desc: 'La riga bianco-su-nero che si vede da lontano: «COMANDA 2 - ORDINE 28».',
    acceso: true,
  },
  {
    id: 'ora',
    label: 'Ora nella fascia',
    desc: 'Quando è stata battuta: sta sotto al numero, dentro il nero.',
    acceso: true,
  },
  {
    id: 'conteggio',
    label: 'Riga del conteggio',
    desc: 'A sinistra la scritta, a destra quanti pezzi.',
    acceso: true,
    testo: { valore: 'CONTATORIE', label: 'Come si chiama il conteggio' },
  },
  {
    id: 'reparto',
    label: 'Riga del reparto',
    acceso: true,
    testo: { valore: 'BAR', label: 'Come si chiama il reparto' },
  },
  {
    id: 'titolo',
    label: 'Nome o tavolo, grande',
    desc: 'Chi ha ordinato: il nome, il tavolo, o il numero del conto.',
    acceso: true,
  },
  {
    id: 'sottotitolo',
    label: 'Riga sotto al nome',
    acceso: true,
    testo: { valore: 'Il tuo menu', label: 'Cosa c’è scritto' },
  },
  {
    id: 'note_riga',
    label: 'Note dei singoli prodotti',
    desc: '«poco ghiaccio», «per Anna»: sotto al prodotto a cui appartengono.',
    acceso: true,
  },
  { id: 'nota_conto', label: 'Nota del conto', desc: 'In fondo, quando c’è.', acceso: true },
  {
    id: 'riga_cortesia',
    label: 'Riga tua in fondo',
    acceso: false,
    testo: { valore: '', label: 'Cosa c’è scritto', placeholder: 'Turno di sala' },
  },
]

// ── I CAMPI DELLO SCONTRINO D'ACCONTO ────────────────────────────────
//
// «Lo scontrino esce ad ogni riscossione ma è configurabile» (l'utente,
// 21/08/2026). Questo NON è lo scontrino del conto: è la carta di chi
// versa una parte e se ne va, e deve rispondere a quattro domande in
// mezzo secondo — cosa ho pagato, quanto, come, quanto resta.
//
// TRE COSE NON STANNO QUI, e non è una dimenticanza:
//   · la scritta ACCONTO in cima e la riga che dice che il conto resta
//     aperto: sono quello che impedisce di scambiare questa carta per lo
//     scontrino finale, e spegnerle vorrebbe dire stampare un documento
//     che mente;
//   · la lista delle righe riscosse, quando ce n'è una: è il «cosa ho
//     pagato», la stessa ragione per cui i prodotti non si tolgono dallo
//     scontrino;
//   · l'importo versato: un acconto senza l'importo non è niente, come un
//     conto senza totale.
export const CAMPI_ACCONTO = [
  {
    id: 'nome_locale',
    label: 'Nome del locale',
    desc: 'In cima, grande. Le parole si cambiano in «Dati del locale».',
    acceso: true,
  },
  { id: 'indirizzo', label: 'Indirizzo', acceso: true },
  { id: 'citta', label: 'CAP e città', acceso: true },
  {
    id: 'numero',
    label: 'Numero del conto e data',
    desc: 'La riga «ACCONTO - 12» con giorno e ora.',
    acceso: true,
  },
  {
    id: 'operatore',
    label: 'Chi stampa la ricevuta',
    desc: 'Il nome di chi è collegato a questo terminale: al banco è chi ha appena preso i soldi.',
    acceso: true,
  },
  {
    id: 'riga_vendita',
    label: 'Tavolo o nome del cliente',
    desc: 'Di che conto è questo acconto. Senza tavolo e senza nome non esce.',
    acceso: true,
  },
  {
    id: 'intestazione_colonne',
    label: 'Intestazione delle colonne',
    desc: 'La riga «QTA Prodotto — PU Prezzo» sopra alle righe riscosse.',
    acceso: true,
  },
  {
    id: 'sconto',
    label: 'Sconto di questa riscossione',
    desc: 'Solo quando chi versa si è fatto scontare le sue righe.',
    acceso: true,
  },
  {
    id: 'metodo',
    label: 'Come è stato pagato',
    desc: 'Contante, carta, lettore: sotto all’importo versato.',
    acceso: true,
  },
  {
    id: 'riepilogo_conto',
    label: 'Come sta il conto',
    desc: 'Totale, quanto è stato versato in tutto e quanto resta da pagare. È la domanda che fa chi resta al tavolo.',
    acceso: true,
  },
  {
    id: 'codice_conto',
    label: 'Codice del conto',
    desc: 'La riga lunga in fondo: serve a noi per ritrovarlo.',
    acceso: true,
  },
  {
    id: 'ragione_sociale',
    label: 'Ragione sociale in fondo',
    acceso: true,
  },
  {
    id: 'riga_cortesia',
    label: 'Riga di saluto',
    desc: 'Una riga tua, in fondo.',
    acceso: false,
    testo: { valore: '', label: 'Cosa c’è scritto', placeholder: 'A dopo!' },
  },
]

export const CAMPI = { scontrino: CAMPI_SCONTRINO, comanda: CAMPI_COMANDA, acconto: CAMPI_ACCONTO }

// Dove il locale scrive le sue scelte, dentro settings/bar. Sono
// impostazioni DEL LOCALE e non del terminale: lo scontrino è l'identità
// del bar, non una preferenza del tablet che l'ha stampato.
export const CHIAVE_IMPOSTAZIONE = {
  scontrino: 'stampa_scontrino',
  comanda: 'stampa_comanda',
  acconto: 'stampa_acconto',
}

// ── CHIEDERE «QUESTO BLOCCO LO SCRIVO?» ──────────────────────────────
//
// Torna due funzioni e basta: chi stampa non deve sapere dove stanno le
// impostazioni né cosa succede quando mancano. Un campo che nel
// vocabolario non esiste si stampa: se domani printer.js scrive un blocco
// nuovo e qui nessuno l'ha ancora elencato, la carta esce COMPLETA — una
// riga sparita in silenzio è il difetto peggiore che questa roba possa
// avere.
export function configStampa(settings, quale) {
  const vocabolario = CAMPI[quale] || []
  const salvato = settings?.[CHIAVE_IMPOSTAZIONE[quale]] || {}
  const campi = salvato.campi || {}
  const testi = salvato.testi || {}
  const perId = new Map(vocabolario.map((c) => [c.id, c]))
  return {
    mostra(id) {
      const campo = perId.get(id)
      if (!campo) return true
      const scelto = campi[id]
      return typeof scelto === 'boolean' ? scelto : campo.acceso
    },
    testo(id) {
      const campo = perId.get(id)
      const scelto = testi[id]
      if (typeof scelto === 'string') return scelto
      return campo?.testo?.valore ?? ''
    },
    // Le parole da mettere sulla carta: vuote se il campo è spento, e
    // vuote anche se qualcuno ha cancellato il testo — «acceso ma senza
    // parole» vuol dire quella riga non la voglio, non una riga vuota
    // stampata. Chi stampa chiede questo; `testo` serve alla casella
    // delle impostazioni, che il testo lo mostra com'è.
    parole(id) {
      return this.mostra(id) ? this.testo(id).trim() : ''
    },
  }
}

// ── LE DUE RIGHE SOTTO AL NUMERO (BUG-088) ───────────────────────────
//
// «"Utente A" che sarebbe? E poi scrivi "scontrino 28" e poi "comanda n
// 28". Non ha molto senso» (l'utente, 25/08/2026, con in mano uno
// scontrino appena uscito).
//
// Quelle righe venivano dal modello da cui il ticket è nato — la stessa
// provenienza di «CONTATORIE» e «Vendeur» sulla comanda: una costante
// scritta a mano, e il numero del conto ripetuto e chiamato comanda. Qui
// ci sono le regole che le compongono adesso: pure, così la carta si
// prova senza stampante, e accanto ai campi che le accendono.
//
// Il NOME di chi stampa non sta qui ma in printer.js (`nomeDiChiStampa`):
// non è un dato del conto, è chi è collegato a questo terminale
// nell'istante in cui la carta esce.

// A CHI APPARTIENE IL CONTO, e solo quello. Senza tavolo si ripiegava su
// «Vendita - Comanda #28»: il numero era già stampato in cima
// («SCONTRINO - 28»), quindi la riga non aggiungeva niente, e per giunta
// lo chiamava comanda mentre 28 è il numero del CONTO — le sue comande
// sono la 1 e la 2, ed è così che il banco le chiama.
//
// Adesso o dice il tavolo, o dice il nome del cliente — la stessa scelta
// che fa il titolo grande della comanda — oppure non si stampa: una riga
// che ripete si legge come un secondo numero, e chi tiene il foglio in
// mano si ferma a capire quale dei due conta.
export function rigaVendita(order) {
  if (order?.table_label) return `Vendita - Tavolo ${order.table_label}`
  const nome = String(order?.customer_name || '').trim()
  return nome ? `Vendita - ${nome}` : ''
}

// Con due coperti usciva «2 clientei»: la «i» del plurale attaccata a
// «cliente». Senza coperto il conto è di una persona, com'è sempre stato.
export function rigaPersone(persone) {
  const n = Number(persone) > 0 ? Number(persone) : 1
  return `${n} ${n === 1 ? 'cliente' : 'clienti'}`
}

// ── IL LOGO: SE STAMPARLO, SU COSA, E QUALE (REQ-STAMPA-011) ─────────
//
// «Su quali stampe» è una domanda per TIPO DI CARTA, non per schermata:
// sulla comanda il logo è solo carta consumata al banco, sul preconto che
// resta in mano al cliente è il segno del locale. I valori di partenza
// sono quelli di oggi: il logo esce sullo scontrino e sul preconto (che
// sono la stessa stampa), non sulla comanda né sulla chiusura di cassa.
// Lo scontrino d'acconto nasce con il logo acceso per la stessa ragione
// del preconto: è carta che se ne va in mano al cliente.
export const TIPI_LOGO = [
  { id: 'scontrino', label: 'Scontrino', desc: 'Quello che si dà a conto pagato.', acceso: true },
  {
    id: 'preconto',
    label: 'Preconto',
    desc: 'Il conto portato al tavolo, prima di pagare.',
    acceso: true,
  },
  {
    id: 'acconto',
    label: 'Scontrino d’acconto',
    desc: 'La carta di chi versa una parte e se ne va: resta in mano al cliente come il preconto.',
    acceso: true,
  },
  {
    id: 'comanda',
    label: 'Comanda',
    // PARTE SPENTO, e il perché sta qui e non a schermo: la comanda resta al
    // banco, non la vede nessun cliente, e il logo su ogni ticket è solo
    // carta e inchiostro. Detto in didascalia — «al banco non serve a
    // nessuno» — sembrava un giudizio sulla COMANDA invece che sul logo, e
    // faceva pensare a una funzione inutile. Le altre righe di questo
    // elenco descrivono il documento: questa fa lo stesso.
    desc: 'Il ticket con cui il banco prepara.',
    acceso: false,
  },
  {
    id: 'chiusura',
    label: 'Chiusura di cassa',
    desc: 'Il riepilogo di fine serata.',
    acceso: false,
  },
]

export const CHIAVE_LOGO = 'stampa_logo'

export function logoAcceso(settings, tipo) {
  const noto = TIPI_LOGO.find((t) => t.id === tipo)
  if (!noto) return false
  const scelto = (settings?.[CHIAVE_LOGO] || {})[tipo]
  return typeof scelto === 'boolean' ? scelto : noto.acceso
}

// L'immagine caricata dal locale, se ce n'è una. Torna null quando non è
// mai stata caricata: allora vale quella del programma (public/logo.png),
// che è il comportamento di sempre.
export function immagineCaricata(settings) {
  const url = settings?.[CHIAVE_LOGO]?.immagine
  return typeof url === 'string' && url.startsWith('data:image/') ? url : null
}

// ── PRECONTO O SCONTRINO: LO DICE IL CONTO ───────────────────────────
//
// Sono la stessa stampa — `printScontrino` — e nessuno dei chiamanti
// passa un tipo. Ma la differenza vera non è il tasto premuto: è se il
// conto è già stato pagato. Il foglio stampato su un conto ancora aperto
// È il preconto, chiunque l'abbia chiesto, e lo resta anche quando esce
// dalla coda invece che dalla schermata di pagamento.
export function tipoScontrino(order) {
  const pagato = order?.status === 'pagato' || order?.payment_status === 'pagato'
  return pagato ? 'scontrino' : 'preconto'
}

// ── L'IMMAGINE CHE LA TESTINA SA STAMPARE ────────────────────────────
//
// La stampa è in bianco e nero, a puntini, su carta larga 80 mm: il logo
// si tiene STRETTO a 220 punti — meno di metà della carta — perché
// grande esce sporco e mangia carta a ogni conto.
export const LARGHEZZA_LOGO = 220

// Oltre questo peso l'immagine non si tiene: sta dentro le impostazioni
// del locale, che ogni terminale si porta dietro a ogni apertura. Un logo
// ridotto a 220 punti sta in pochi kB — se ne pesa cento vuol dire che
// non è un logo, è una fotografia.
export const PESO_MASSIMO_LOGO = 150_000

// ── DIRLO SUBITO, NON SULLA CARTA (REQ-STAMPA-011) ───────────────────
//
// «Il caricamento deve dire subito se l'immagine non va bene invece di
// stampare un rettangolo nero». Una foto scura, ridotta in bianco e nero
// a puntini, diventa esattamente quello: un rettangolo nero in cima a
// ogni scontrino della serata, e chi sta al banco non ha modo di capire
// perché.
//
// Si guarda l'immagine GIÀ RIDOTTA — la stessa che finirebbe sulla
// testina — e si contano i punti scuri. Funzione pura: prende numeri,
// torna un problema o niente. `grave` distingue il «non si può» dal «si
// può, ma sappilo».
export function problemiLogo({ larghezza, altezza, quotaScura: scura = 0, peso = 0 } = {}) {
  if (!larghezza || !altezza) {
    return {
      grave: true,
      testo: 'Questa immagine non si riesce ad aprire. Prova con un PNG o un JPG.',
    }
  }
  if (peso > PESO_MASSIMO_LOGO) {
    return {
      grave: true,
      testo:
        'L’immagine resta troppo pesante anche dopo la riduzione. Serve un logo semplice, a pochi colori.',
    }
  }
  if (altezza > larghezza * 1.5) {
    return {
      grave: true,
      testo:
        'L’immagine è molto più alta che larga: sulla carta si mangerebbe mezzo scontrino. Ritagliala più bassa.',
    }
  }
  if (scura > 0.75) {
    return {
      grave: true,
      testo:
        'L’immagine è quasi tutta scura: la stampante la farebbe uscire come un rettangolo nero. Serve un logo su fondo chiaro.',
    }
  }
  if (scura < 0.01) {
    return {
      grave: true,
      testo: 'L’immagine è quasi tutta chiara: sulla carta non si vedrebbe niente.',
    }
  }
  if (larghezza < LARGHEZZA_LOGO / 2) {
    return {
      grave: false,
      testo:
        'L’immagine è piccola: sulla carta uscirà un po’ sgranata. Se ne hai una più grande, meglio quella.',
    }
  }
  return null
}

// Quanti punti dell'immagine ridotta sono scuri: è quello che la testina
// annerisce davvero. Sta qui e non nel pannello perché è la metà del
// controllo qui sopra, e le due si provano insieme.
export function quotaScura(dati, soglia = 90) {
  if (!dati || !dati.length) return 0
  let scuri = 0
  let totali = 0
  for (let i = 0; i < dati.length; i += 4) {
    // Luminosità percepita: il verde pesa più del rosso, il blu quasi niente.
    const luce = 0.299 * dati[i] + 0.587 * dati[i + 1] + 0.114 * dati[i + 2]
    if (luce < soglia) scuri++
    totali++
  }
  return totali ? scuri / totali : 0
}
