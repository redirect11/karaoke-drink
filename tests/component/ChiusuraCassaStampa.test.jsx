// @vitest-environment happy-dom
'use strict'

// LA CHIUSURA DI CASSA E LA SUA STAMPA — il gesto più scoperto della cassa.
//
// Flavio, 28/08/2026: «quando fanno la chiusura cassa, la stampante non
// stampa lo scontrino di chiusura molto spesso». E i fatti che ha dato,
// che valgono più di qualunque lettura del codice: la stampante durante la
// serata stampa SEMPRE — comande e scontrini escono anche nelle sere lente,
// con mezz'ora fra un ordine e l'altro — e la RISTAMPA della stessa
// chiusura, dalla lista delle serate, esce subito.
//
// Quel gesto, fino a qui, non aveva UN SOLO TEST. È l'unico della cassa
// completamente scoperto, ed è dove il difetto è saltato fuori: non è un
// caso, è la regola che questo progetto si è dato — quello che non è
// provato è quello che si rompe in silenzio.
//
// Questi due test non sanno ancora QUAL È il difetto: pinzano le due
// promesse che la chiusura fa oggi, e che nessuno verificava.
//   1. chiudere cassa CHIEDE la stampa, coi dati della serata appena finita;
//   2. se la stampa fallisce, la cassa resta chiusa lo stesso E il
//      fallimento si DICE — non sparisce in silenzio.
// Se un domani qualcuno tocca quella sequenza, questi due diventano rossi
// prima che se ne accorga il banco.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const SESSIONE = {
  id: 'sessione-di-stasera',
  status: 'open',
  opened_at: '2026-08-27T17:00:00.000Z',
  opening_float: 50,
}

// Due conti pagati e nessuno aperto: la cassa si può chiudere. Con un conto
// ancora da incassare la chiusura è BLOCCATA, e sarebbe un altro test.
const CONTI_PAGATI = [
  {
    id: 'c1',
    status: 'chiuso',
    payment_status: 'pagato',
    payment_method: 'banco',
    total: 30,
    closed_in_session: SESSIONE.id,
    paid_at: '2026-08-27T20:00:00.000Z',
    created_at: '2026-08-27T19:50:00.000Z',
    comande: [],
  },
  {
    id: 'c2',
    status: 'chiuso',
    payment_status: 'pagato',
    payment_method: 'carta',
    total: 20,
    closed_in_session: SESSIONE.id,
    paid_at: '2026-08-27T21:00:00.000Z',
    created_at: '2026-08-27T20:50:00.000Z',
    comande: [],
  },
]

// UN CONTO ANCORA APERTO BLOCCA LA CHIUSURA: un conto aperto è un incasso
// che manca, e far quadrare una serata con dentro un buco non si può.
const CONTO_APERTO = {
  id: 'c3',
  status: 'aperto',
  payment_status: 'non_richiesto',
  total: 18,
  created_at: '2026-08-27T22:00:00.000Z',
  comande: [],
}

// La lista che le due schermate si vedono arrivare: la si cambia prova per
// prova, perché è quello che distingue una cassa chiudibile da una bloccata.
let conti = CONTI_PAGATI

const chiusa = vi.fn()

// `api.js` si finge per intero: importarlo davvero vorrebbe dire parlare
// con Firestore al primo istante, e qui si prova una schermata, non la rete.
const IMPOSTAZIONI = { business_day_cutoff_hour: 5 }

vi.mock('../../src/lib/api.js', () => {
  return {
    DEFAULT_SETTINGS: IMPOSTAZIONI,
    subscribeSettings: (cb) => {
      cb(IMPOSTAZIONI)
      return () => {}
    },
    subscribeOpenCashSession: (cb) => {
      cb(SESSIONE)
      return () => {}
    },
    subscribeActiveOrders: (cb) => {
      cb(conti)
      return () => {}
    },
    openCashSession: vi.fn(),
    // Local-first: la chiusura non restituisce niente e non si aspetta.
    closeCashSession: (...a) => chiusa(...a),
  }
})

const stampaChiusura = vi.fn()
vi.mock('../../src/lib/printer.js', () => ({
  printChiusuraCassa: (...a) => stampaChiusura(...a),
}))

const avvisoErrore = vi.fn()
const avvisoOk = vi.fn()
vi.mock('../../src/lib/toast.js', () => ({
  toastError: (...a) => avvisoErrore(...a),
  toastSuccess: (...a) => avvisoOk(...a),
}))

vi.mock('../../src/lib/firebaseClient.js', () => ({
  isFirebaseConfigured: true,
  auth: { currentUser: { email: 'flavio@tana.it', uid: 'u1' } },
  db: {},
}))

const { default: CashFlow } = await import('../../src/components/CashFlow.jsx')
// L'ALTRA STRADA. La cassa si chiude anche dal riquadro della coda, senza
// passare dalla pagina della cassa: sono due percorsi diversi, e finché
// non li si prova tutti e due «la chiusura funziona» vuol dire metà.
const { default: ChiudiCassaBox } = await import('../../src/components/ChiudiCassaBox.jsx')

const tastoChiudi = () => screen.findByRole('button', { name: /Chiudi cassa/i })

describe('la chiusura di cassa chiede la stampa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conti = CONTI_PAGATI
    stampaChiusura.mockResolvedValue(undefined)
  })

  // IL PRIMO: che la stampa venga CHIESTA, e coi dati giusti.
  //
  // Sembra ovvio, ed è esattamente per questo che non era provato. Se un
  // giorno quella riga si perde in un rimaneggiamento della schermata, la
  // cassa continua a chiudersi e nessuno se ne accorge fino a quando
  // qualcuno, a fine serata, resta senza il suo foglio.
  it('chiudendo cassa parte lo scontrino di chiusura, con la serata dentro', async () => {
    const user = userEvent.setup()
    render(<CashFlow />)
    await user.click(await tastoChiudi())

    await waitFor(() => expect(stampaChiusura).toHaveBeenCalledTimes(1))
    const [recap, sessione] = stampaChiusura.mock.calls[0]
    // La serata è quella appena chiusa, non un'altra.
    expect(sessione.id).toBe(SESSIONE.id)
    // E il riepilogo porta i soldi veri: cinquanta incassati, due conti.
    expect(recap.incassato).toBe(50)
    expect(recap.nPagati).toBe(2)
    // La cassa si chiude comunque, e con lo stesso riepilogo che si stampa:
    // il foglio in mano e quello in archivio devono raccontare la stessa
    // serata.
    expect(chiusa).toHaveBeenCalledTimes(1)
    expect(chiusa.mock.calls[0][1].snapshot).toEqual(recap)
  })

  // IL SECONDO: che una stampa fallita NON sia silenziosa.
  //
  // È la promessa scritta nel commento del codice — «se la stampante non
  // risponde la cassa resta comunque chiusa» — e la sua metà mancante: se
  // resta chiusa ma nessuno dice che il foglio non è uscito, chi sta al
  // banco lo scopre solo cercandolo. La chiusura è l'unica stampa che non
  // si può rifare a memoria: le comande si riscrivono, lo scontrino si
  // ristampa dal conto, ma il foglio di chiusura è la fotografia di una
  // serata finita.
  it('se la stampa fallisce la cassa resta chiusa, ma il fallimento si dice', async () => {
    stampaChiusura.mockRejectedValue(new Error('stampante spenta'))
    const user = userEvent.setup()
    render(<CashFlow />)
    await user.click(await tastoChiudi())

    // La cassa è chiusa: una stampante spenta non deve tenere aperta la
    // serata.
    await waitFor(() => expect(chiusa).toHaveBeenCalledTimes(1))
    // E il banco lo viene a sapere, col motivo dentro.
    await waitFor(() => expect(avvisoErrore).toHaveBeenCalledTimes(1))
    expect(String(avvisoErrore.mock.calls[0][0])).toMatch(/stampante spenta/)
  })
})

// ── I CASI DELLA CHIUSURA, DALLA SCHERMATA DELLA CASSA ───────────────
//
// Il primo giro di test (sopra) pinzava le due promesse di base. Questi
// coprono i casi in cui il gesto CAMBIA: il contante contato, la
// differenza, e la cassa che non si deve chiudere affatto.
describe('la chiusura dalla schermata della cassa, caso per caso', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conti = CONTI_PAGATI
    stampaChiusura.mockResolvedValue(undefined)
  })

  it('col contante contato: il numero arriva sia alla cassa sia alla carta', async () => {
    const user = userEvent.setup()
    render(<CashFlow />)
    await user.type(await screen.findByLabelText(/Contante contato/i), '265')
    await user.click(await tastoChiudi())

    await waitFor(() => expect(stampaChiusura).toHaveBeenCalledTimes(1))
    // Il foglio e l'archivio devono raccontare la stessa serata: se il
    // contato finisse solo su uno dei due, la differenza sulla carta e
    // quella in archivio non tornerebbero.
    expect(stampaChiusura.mock.calls[0][2].countedCash).toBe('265')
    expect(chiusa.mock.calls[0][1].countedCash).toBe('265')
  })

  it('senza contante contato non si inventa uno zero', async () => {
    // Non tutti contano subito, e una differenza calcolata su uno zero
    // finto sarebbe un ammanco che non esiste.
    const user = userEvent.setup()
    render(<CashFlow />)
    await user.click(await tastoChiudi())
    await waitFor(() => expect(chiusa).toHaveBeenCalledTimes(1))
    expect(chiusa.mock.calls[0][1].countedCash).toBe(null)
  })

  it('la differenza si legge PRIMA di chiudere: in più, in meno e in pari', async () => {
    // È il momento in cui si decide se cercare l'errore o chiudere: il
    // numero deve stare a schermo, non solo sulla carta.
    const user = userEvent.setup()
    render(<CashFlow />)
    const campo = await screen.findByLabelText(/Contante contato/i)
    // In cassa ci si aspettano 30 euro: i contanti della serata (il conto
    // c1, battuto al banco). Il fondo di questa sessione non c'è.
    await user.type(campo, '45')
    expect(await screen.findByText(/Differenza/)).toHaveTextContent(/\+15/)
    await user.clear(campo)
    await user.type(campo, '20')
    await waitFor(() => expect(screen.getByText(/Differenza/)).toHaveTextContent(/-10/))
    await user.clear(campo)
    await user.type(campo, '30')
    await waitFor(() => expect(screen.getByText(/Differenza/)).toHaveTextContent(/0,00|0\.00/))
  })

  it('con un conto ancora aperto non si chiude e non si stampa niente', async () => {
    conti = [...CONTI_PAGATI, CONTO_APERTO]
    render(<CashFlow />)

    // Il tasto c'è ma è spento, e accanto c'è scritto perché: al banco
    // «non funziona» senza un motivo è la peggiore delle risposte.
    const tasto = await tastoChiudi()
    expect(tasto).toBeDisabled()
    expect(await screen.findByText(/conti non pagati/i)).toBeInTheDocument()
    // E il campo del contante non c'è: non è quello il problema da
    // risolvere adesso.
    expect(screen.queryByLabelText(/Contante contato/i)).not.toBeInTheDocument()

    await userEvent.setup().click(tasto)
    expect(chiusa).not.toHaveBeenCalled()
    expect(stampaChiusura).not.toHaveBeenCalled()
  })
})

// ── L'ALTRA STRADA: IL RIQUADRO DELLA CODA ───────────────────────────
//
// «A fine serata la cassa si chiude e basta»: il tasto nel menu della coda
// portava alla pagina della cassa — un viaggio di andata e ritorno con la
// coda che sparisce proprio mentre si sta finendo il servizio. Da allora
// le strade sono DUE, e passano da due componenti diversi: quello che vale
// per una deve valere per l'altra, o il difetto si sposta e basta.
describe('la chiusura dal riquadro della coda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conti = CONTI_PAGATI
    stampaChiusura.mockResolvedValue(undefined)
  })

  it('chiude la cassa, chiede la stampa e si toglie di mezzo', async () => {
    const chiudiIlRiquadro = vi.fn()
    const user = userEvent.setup()
    render(<ChiudiCassaBox by={{ email: 'flavio@tana.it' }} onClose={chiudiIlRiquadro} />)
    await user.click(await tastoChiudi())

    await waitFor(() => expect(chiusa).toHaveBeenCalledTimes(1))
    expect(stampaChiusura).toHaveBeenCalledTimes(1)
    const [recap, sessione] = stampaChiusura.mock.calls[0]
    expect(sessione.id).toBe(SESSIONE.id)
    expect(recap.incassato).toBe(50)
    // Il riquadro si chiude nell'istante del gesto: la stampa parte per
    // conto suo e nessuno la aspetta.
    expect(chiudiIlRiquadro).toHaveBeenCalled()
    expect(avvisoOk).toHaveBeenCalledWith('Cassa chiusa.')
  })

  it('anche qui il contante contato arriva alla carta', async () => {
    const user = userEvent.setup()
    render(<ChiudiCassaBox by={{ email: 'flavio@tana.it' }} onClose={() => {}} />)
    await user.type(await screen.findByLabelText(/Contante contato/i), '95')
    await user.click(await tastoChiudi())

    await waitFor(() => expect(stampaChiusura).toHaveBeenCalledTimes(1))
    expect(stampaChiusura.mock.calls[0][2].countedCash).toBe('95')
  })

  it('e anche qui un fallimento si dice, con la cassa che resta chiusa', async () => {
    stampaChiusura.mockRejectedValue(new Error('carta finita'))
    const user = userEvent.setup()
    render(<ChiudiCassaBox by={{ email: 'flavio@tana.it' }} onClose={() => {}} />)
    await user.click(await tastoChiudi())

    await waitFor(() => expect(chiusa).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(avvisoErrore).toHaveBeenCalledTimes(1))
    expect(String(avvisoErrore.mock.calls[0][0])).toMatch(/carta finita/)
  })

  it('con un conto aperto il riquadro non chiude niente', async () => {
    conti = [...CONTI_PAGATI, CONTO_APERTO]
    render(<ChiudiCassaBox by={{ email: 'flavio@tana.it' }} onClose={() => {}} />)
    const tasto = await tastoChiudi()
    expect(tasto).toBeDisabled()
    expect(await screen.findByText(/conti non pagati/i)).toBeInTheDocument()

    await userEvent.setup().click(tasto)
    expect(chiusa).not.toHaveBeenCalled()
    expect(stampaChiusura).not.toHaveBeenCalled()
  })
})

// ── LOCAL-FIRST: LA STAMPA NON TRATTIENE IL GESTO ────────────────────
//
// La prima stesura di BUG-098 (31/08/2026) aveva messo la stampa ad
// aspettare la RISPOSTA della stampante prima di dirsi finita: qualche
// secondo, e con una stampante che tace anche di più. Il giorno dopo
// quell'attesa è stata tolta, perché non doveva MAI arrivare fino al tasto
// — se no chiudere cassa diventa un tasto che sembra rotto proprio mentre
// si sta finendo. Questo test regge comunque, ed è il punto: qualunque
// cosa la stampa si metta a fare, la chiusura non la aspetta.
describe('la stampa non trattiene la chiusura', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conti = CONTI_PAGATI
    // Una stampa che non si risolve MAI: è la stampante che ha accettato
    // il foglio e non risponde più.
    stampaChiusura.mockReturnValue(new Promise(() => {}))
  })

  it('col riquadro della coda: la cassa è chiusa mentre la carta è ancora in volo', async () => {
    const chiudiIlRiquadro = vi.fn()
    const user = userEvent.setup()
    render(<ChiudiCassaBox by={{ email: 'flavio@tana.it' }} onClose={chiudiIlRiquadro} />)
    await user.click(await tastoChiudi())

    // Nessun `waitFor` che aspetti la carta: la scrittura è partita e il
    // riquadro si è chiuso nello stesso giro del tocco.
    expect(chiusa).toHaveBeenCalledTimes(1)
    expect(chiudiIlRiquadro).toHaveBeenCalled()
    expect(avvisoOk).toHaveBeenCalledWith('Cassa chiusa.')
    expect(avvisoErrore).not.toHaveBeenCalled()
  })

  it('e dalla schermata della cassa: il tasto torna subito disponibile', async () => {
    // `busy` si spegne nel `finally` della chiusura, non della stampa: se
    // aspettasse la carta, il tasto resterebbe grigio finché la stampante
    // non si decide.
    const user = userEvent.setup()
    render(<CashFlow />)
    await user.click(await tastoChiudi())

    await waitFor(() => expect(chiusa).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(tastoChiudiOra()).not.toBeDisabled())
  })
})

const tastoChiudiOra = () => screen.getByRole('button', { name: /Chiudi cassa/i })
