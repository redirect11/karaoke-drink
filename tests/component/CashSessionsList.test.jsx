// @vitest-environment happy-dom
'use strict'

// LA LISTA DELLE CHIUSURE DI CASSA È LA LISTA DEL MAGAZZINO.
//
// «Anche qui nei rendiconti delle chiusure di cassa serve una lista fatta
// meglio, stile quella del magazzino ma con righe più alte» (l'utente,
// 22/08/2026). Prima ogni serata era una card a sé con dentro una riga
// alta quanto il suo testo: lo stesso elenco — righe uguali che si aprono
// su un dettaglio — si leggeva in tre modi diversi in tre pagine.
//
// Qui si controlla che la lista usi DAVVERO la famiglia condivisa
// (`.inv-list`, `.inv-row`, `.inv-row-main`, `.inv-row-dettaglio`): è da
// lì che le righe prendono l'altezza del bersaglio, e una lista che si
// riscrive la sua forma se la perde senza che nessuno se ne accorga.
// E che la serata IN CORSO si riconosca a colpo d'occhio, che è l'unica
// riga della lista che sta ancora cambiando.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const sessioni = [
  // La serata di stasera: aperta, senza snapshot (nasce alla chiusura).
  {
    id: 'aperta',
    status: 'open',
    opened_at: '2026-08-22T17:00:00.000Z',
  },
  {
    id: 'chiusa',
    status: 'closed',
    opened_at: '2026-08-21T17:00:00.000Z',
    closed_at: '2026-08-22T00:30:00.000Z',
    snapshot: { incassato: 1240.5, nPagati: 31, byMethod: { contanti: 1240.5 } },
    // Chi ha chiuso e quanto aveva contato: la ristampa deve riportarli
    // sulla carta, non metterci chi sta ristampando adesso.
    closed_by: { email: 'flavio@tana.it' },
    counted_cash: 1200,
  },
  // Una serata più indietro: fra questa e quella del 21 resta scoperto il
  // 20, ed è il giorno su cui si prova la ricerca a vuoto.
  {
    id: 'vecchia',
    status: 'closed',
    opened_at: '2026-08-19T17:00:00.000Z',
    closed_at: '2026-08-19T23:00:00.000Z',
    snapshot: { incassato: 420, nPagati: 12, byMethod: { contanti: 420 } },
  },
]

vi.mock('../../src/lib/api.js', () => ({
  fetchCashSessions: vi.fn(async () => sessioni),
  fetchOrdersBetween: vi.fn(async () => []),
  fetchDrinks: vi.fn(async () => []),
  fetchInventoryItems: vi.fn(async () => []),
}))
vi.mock('../../src/lib/printer.js', () => ({ printChiusuraCassa: vi.fn(async () => {}) }))

// Gli avvisi a schermo: la ristampa che non riesce deve dirlo, e per
// vederlo bisogna guardare dove finisce.
const avvisoErrore = vi.fn()
vi.mock('../../src/lib/toast.js', () => ({
  toastError: (...a) => avvisoErrore(...a),
  toastSuccess: vi.fn(),
}))

const { default: CashSessionsList } = await import('../../src/components/CashSessionsList.jsx')

describe('la lista delle chiusure di cassa', () => {
  beforeEach(() => vi.clearAllMocks())

  it('è la lista del magazzino: stesso riquadro, stessa riga toccabile', async () => {
    const { container } = render(<CashSessionsList />)
    await screen.findByText(/1\.240,50/)
    // Il riquadro unico con le righe dentro, non una card per serata.
    expect(container.querySelector('.inv-list'), 'la lista non usa più la famiglia condivisa').not.toBe(null)
    const righe = container.querySelectorAll('.inv-list > .inv-row')
    expect(righe.length).toBe(sessioni.length)
    // La riga è il bottone della famiglia: da lì scende `--riga-lista`.
    for (const riga of righe) {
      const bottone = riga.querySelector('button.inv-row-main')
      expect(bottone, 'la riga non è più un .inv-row-main: perde l’altezza del bersaglio').not.toBe(null)
    }
  })

  it('la serata in corso si riconosce senza leggere: pastiglia e striscia', async () => {
    render(<CashSessionsList />)
    const pastiglia = await screen.findByText('in corso')
    // Non è solo un colore: c'è la parola, e la pastiglia è quella verde
    // del «sta succedendo adesso» usata anche nel registro ore.
    expect(pastiglia.className).toMatch(/\bpill\b/)
    expect(pastiglia.className).toMatch(/\blive\b/)
    // E la riga porta la striscia accesa a sinistra.
    expect(pastiglia.closest('.inv-row').className).toMatch(/\bin-corso\b/)
  })

  it('e non finge un incasso a zero finché la serata è aperta', async () => {
    // Lo snapshot nasce alla chiusura: prima al suo posto usciva «0,00 €»,
    // che in una lista di soldi si legge come «stasera non è entrato
    // niente». Meglio dire che il dato non c'è ancora.
    render(<CashSessionsList />)
    const riga = (await screen.findByText('in corso')).closest('.inv-row')
    expect(riga.textContent, 'la serata in corso dichiara un incasso che non conosce').not.toMatch(
      /0,00/
    )
    expect(riga.textContent).toMatch(/—/)
  })

  it('la serata chiusa dice quanto ha fatto, e il numero pesa', async () => {
    const { container } = render(<CashSessionsList />)
    const incasso = await screen.findByText(/1\.240,50/)
    // L'incasso è il numero che si cerca: sta in coda alla riga, con
    // l'oro dei soldi e un gradino più grande del resto.
    expect(incasso.className).toMatch(/\bprice\b/)
    expect(incasso.className).toMatch(/\bcash-sess-incasso\b/)
    expect(container.querySelector('.inv-row-cifra-fantasma')).toBe(null)
  })

  it('toccando la riga il dettaglio si apre SOTTO, dentro la stessa riga', async () => {
    const user = userEvent.setup()
    const { container } = render(<CashSessionsList />)
    const riga = (await screen.findByText(/1\.240,50/)).closest('.inv-row')
    await user.click(riga.querySelector('button.inv-row-main'))
    await waitFor(() => {
      expect(riga.querySelector('.inv-row-dettaglio'), 'il dettaglio non si apre sotto la riga').not.toBe(null)
    })
    // La riga aperta si distingue, come in magazzino.
    expect(riga.className).toMatch(/\bopen\b/)
    expect(container.querySelectorAll('.inv-row-dettaglio').length).toBe(1)
  })
})

// ── NIENTE RIQUADRO, E UN SELETTORE DI DATA ──────────────────────────
//
// «Togli il box, lascia solo la lista, e aggiungi un selettore di data per
// cercare una chiusura cassa» (l'utente, 22/08/2026).
//
// Il riquadro non separava questa lista da nient'altro — è l'unica cosa
// della sottosezione — e il titolo dentro ripeteva quello della barra in
// alto. Il selettore risponde a «com'è andata il 15 agosto?» senza far
// scorrere due mesi di righe: PORTA alla serata invece di filtrare la
// lista, perché la lista serve anche a confrontare le serate fra loro e
// filtrandola ne resterebbe una sola.
describe('le chiusure di cassa senza riquadro, con la ricerca per data', () => {
  beforeEach(() => vi.clearAllMocks())

  it('non è dentro un riquadro, e non ripete il titolo della barra', async () => {
    const { container } = render(<CashSessionsList />)
    await screen.findByText(/1\.240,50/)
    expect(container.querySelector('.card'), 'la lista è tornata dentro una card').toBe(null)
    // Il titolo della pagina sta nella barra in alto (src/lib/sezioni.js):
    // qui sarebbe la stessa parola due volte, dieci pixel più sotto.
    expect(screen.queryByText(/Chiusure di cassa/)).toBe(null)
    // E la didascalia diceva quello che la riga ha già scritto sopra.
    expect(screen.queryByText(/Una riga per serata/)).toBe(null)
  })

  it('il campo data non lascia cercare nel futuro né prima della prima chiusura', async () => {
    render(<CashSessionsList />)
    const campo = await screen.findByLabelText('Cerca per data')
    expect(campo).toHaveAttribute('type', 'date')
    // I bordi sono la prima e l'ultima serata in elenco, e vengono dalle
    // sessioni già caricate: nessuna lettura in più per saperli.
    expect(campo).toHaveAttribute('min', '2026-08-19')
    expect(campo).toHaveAttribute('max', '2026-08-22')
  })

  it('cercando una data porta alla serata: la riga si accende, la lista resta intera', async () => {
    const { container } = render(<CashSessionsList />)
    const campo = await screen.findByLabelText('Cerca per data')
    fireEvent.change(campo, { target: { value: '2026-08-21' } })

    const accesa = container.querySelector('.inv-row.trovata')
    expect(accesa, 'la serata cercata non viene evidenziata').not.toBe(null)
    expect(accesa.textContent).toMatch(/1\.240,50/)
    // Non si è filtrato niente: le altre serate sono ancora lì da
    // confrontare, ed è per questo che non serve un modo per «togliere il
    // filtro».
    expect(container.querySelectorAll('.inv-list > .inv-row').length).toBe(sessioni.length)
    // E l'esito si legge, non si deduce dal colore della riga.
    expect(screen.getByRole('status').textContent).toMatch(/evidenziata nell’elenco/)
  })

  it('la serata è quella della nottata: chi cerca il 22 non trova la serata del 21', async () => {
    // La serata del 21 chiude alle 02:30 del 22 (giornata commerciale del
    // 21). Il 22 c'è la sua serata, quella ancora aperta: se il taglio
    // fosse sbagliato uscirebbe l'incasso della sera prima.
    const { container } = render(<CashSessionsList />)
    const campo = await screen.findByLabelText('Cerca per data')
    fireEvent.change(campo, { target: { value: '2026-08-22' } })
    const accesa = container.querySelector('.inv-row.trovata')
    expect(accesa.textContent).toMatch(/in corso/)
    expect(accesa.textContent).not.toMatch(/1\.240,50/)
  })

  it('un giorno senza chiusura lo dice, e non lascia la lista muta', async () => {
    // Il locale è chiuso il lunedì: capiterà spesso, e la lista non si
    // svuota — chi ha cercato vede ancora tutte le serate.
    const { container } = render(<CashSessionsList />)
    const campo = await screen.findByLabelText('Cerca per data')
    fireEvent.change(campo, { target: { value: '2026-08-20' } })

    expect(screen.getByRole('status').textContent).toMatch(
      /Nessuna chiusura di cassa registrata/
    )
    expect(container.querySelector('.inv-row.trovata')).toBe(null)
    expect(container.querySelectorAll('.inv-list > .inv-row').length).toBe(sessioni.length)
  })
})

// ── PER SERATA, PER SETTIMANA O PER MESE ─────────────────────────────
//
// «Aggiungi dei filtri alla lista delle chiusure cassa per mostrare quelle
// settimanali o mensili oltre che per data» (l'utente, 22/08/2026).
//
// La lista resta la stessa lista: cambia di cosa parla una riga. Si sceglie
// coi gettoni che il progetto usa già per i filtri della coda, dentro la riga
// della ricerca — che c'è comunque — così non costano altezza a una pagina che
// esiste per la lista. Una riga aggregata SI APRE sulle sue serate, che sono
// le righe di sempre: la settimana si spiega con le sue sere, e da lì si
// arriva al riepilogo di cassa per la strada che si conosce già.
describe('le chiusure raggruppate per settimana e per mese', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  const gettone = (nome) => screen.getByRole('button', { name: nome })
  // Le righe di primo livello: la sotto-lista di un periodo aperto porta la
  // stessa classe di famiglia, ed è apposta — ma qui si contano i periodi.
  const primoLivello = (c) => c.querySelectorAll('.inv-list:not(.inv-sotto-lista) > .inv-row')

  it('si sceglie coi gettoni, e non costano una riga alla lista', async () => {
    const { container } = render(<CashSessionsList />)
    await screen.findByText(/1\.240,50/)
    // Un gruppo solo di gettoni attaccati: è una domanda con tre risposte,
    // non tre interruttori indipendenti.
    const gruppo = container.querySelector('.chip-gruppo')
    expect(gruppo, 'i gettoni non usano il gruppo condiviso').not.toBe(null)
    expect([...gruppo.querySelectorAll('.chip')].map((b) => b.textContent)).toEqual([
      'Serata',
      'Settimana',
      'Mese',
    ])
    // Stanno nella riga della ricerca per data, che esisteva già: nessuna
    // riga in più sopra la lista.
    expect(gruppo.closest('.cerca-serata')).not.toBe(null)
    // Di suo la lista è per serata, com'era.
    expect(gettone('Serata').className).toMatch(/\bactive\b/)
    expect(primoLivello(container).length).toBe(sessioni.length)
  })

  it('per settimana la lista diventa una riga per settimana: periodo, serate, media e totale', async () => {
    const user = userEvent.setup()
    const { container } = render(<CashSessionsList />)
    await screen.findByText(/1\.240,50/)
    await user.click(gettone('Settimana'))

    // Le tre serate stanno tutte nella settimana di lunedì 17 agosto 2026
    // (mer 19, ven 21, sab 22): una riga sola.
    const righe = primoLivello(container)
    expect(righe.length).toBe(1)
    const riga = righe[0].querySelector('.inv-row-main')
    expect(riga.textContent).toMatch(/17–23 ago/)
    expect(riga.textContent).toMatch(/3 serate/)
    // Il totale è la somma dei numeri congelati alla chiusura: 1240,50 + 420.
    expect(riga.querySelector('.cash-sess-incasso').textContent).toMatch(/1\.660,50/)
    // E LA MEDIA È SU DUE SERATE, non su tre: quella di stasera è ancora
    // aperta e il suo incasso si saprà alla chiusura. Divisa per tre uscirebbe
    // 553,50, e la settimana sembrerebbe peggiore di com'è andata.
    expect(riga.textContent).toMatch(/830,25/)
    expect(riga.textContent).toMatch(/a serata/)
    // La pastiglia dice perché il totale non è ancora quello definitivo.
    expect(riga.textContent).toMatch(/in corso/)
  })

  it('per mese è una riga per mese, e i numeri sono gli stessi sommati più in là', async () => {
    const user = userEvent.setup()
    const { container } = render(<CashSessionsList />)
    await screen.findByText(/1\.240,50/)
    await user.click(gettone('Mese'))
    const righe = primoLivello(container)
    expect(righe.length).toBe(1)
    expect(righe[0].textContent).toMatch(/agosto 2026/)
    expect(righe[0].querySelector('.cash-sess-incasso').textContent).toMatch(/1\.660,50/)
  })

  it('la riga aggregata si apre sulle sue serate, che sono le righe di sempre', async () => {
    const user = userEvent.setup()
    const { container } = render(<CashSessionsList />)
    await screen.findByText(/1\.240,50/)
    await user.click(gettone('Settimana'))

    const settimana = primoLivello(container)[0]
    // Chiusa non mostra nessuna serata: la lista resta corta.
    expect(settimana.querySelector('.inv-sotto-lista')).toBe(null)
    await user.click(settimana.querySelector('button.inv-row-main'))

    const dentro = settimana.querySelectorAll('.inv-sotto-lista > .inv-row')
    expect(dentro.length).toBe(sessioni.length)
    // Sono le righe della famiglia condivisa, non un secondo tipo di riga.
    for (const r of dentro) expect(r.querySelector('button.inv-row-main')).not.toBe(null)
    // La più recente in cima, come nell'elenco piatto.
    expect(dentro[0].textContent).toMatch(/in corso/)

    // E da lì il dettaglio della cassa si apre come sempre, sotto la serata:
    // non c'è un secondo dettaglio da imparare.
    const serata = [...dentro].find((r) => r.textContent.includes('1.240,50'))
    await user.click(serata.querySelector('button.inv-row-main'))
    await waitFor(() => {
      expect(serata.querySelector('.inv-row-dettaglio')).not.toBe(null)
    })
    expect(serata.textContent).toMatch(/Conti chiusi/)
  })

  it('cercando una data apre il periodo che la contiene e accende la serata, senza cambiare vista', async () => {
    const user = userEvent.setup()
    const { container } = render(<CashSessionsList />)
    await screen.findByText(/1\.240,50/)
    await user.click(gettone('Settimana'))

    const campo = screen.getByLabelText('Cerca per data')
    fireEvent.change(campo, { target: { value: '2026-08-21' } })

    // LA VISTA SCELTA NON SI PERDE: si continua a guardare per settimana.
    expect(gettone('Settimana').className).toMatch(/\bactive\b/)
    expect(primoLivello(container).length).toBe(1)
    // La settimana si è aperta da sé e la serata cercata è accesa lì dentro.
    const accesa = container.querySelector('.inv-sotto-lista .inv-row.trovata')
    expect(accesa, 'la serata cercata non si trova dentro il suo periodo').not.toBe(null)
    expect(accesa.textContent).toMatch(/1\.240,50/)
    // E la frase sopra l'elenco dice DOVE guardare, che dentro una riga
    // aggregata non è più ovvio.
    expect(screen.getByRole('status').textContent).toMatch(/evidenziata nella settimana 17–23 ago/)
  })

  it('e per mese la frase dice il mese', async () => {
    const user = userEvent.setup()
    render(<CashSessionsList />)
    await screen.findByText(/1\.240,50/)
    await user.click(gettone('Mese'))
    fireEvent.change(screen.getByLabelText('Cerca per data'), { target: { value: '2026-08-19' } })
    expect(screen.getByRole('status').textContent).toMatch(/evidenziata in agosto 2026/)
  })

  it('un giorno senza chiusura lo dice anche da raggruppati, e non apre niente', async () => {
    const user = userEvent.setup()
    const { container } = render(<CashSessionsList />)
    await screen.findByText(/1\.240,50/)
    await user.click(gettone('Settimana'))
    fireEvent.change(screen.getByLabelText('Cerca per data'), { target: { value: '2026-08-20' } })
    expect(screen.getByRole('status').textContent).toMatch(/Nessuna chiusura di cassa registrata/)
    expect(container.querySelector('.inv-row.trovata')).toBe(null)
  })

  it('la scelta si ricorda su questo terminale', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<CashSessionsList />)
    await screen.findByText(/1\.240,50/)
    await user.click(gettone('Mese'))
    unmount()

    render(<CashSessionsList />)
    await screen.findByText(/agosto 2026/)
    expect(gettone('Mese').className).toMatch(/\bactive\b/)
  })
})

// ── LA RISTAMPA DELLA CHIUSURA (BUG-098) ─────────────────────────────
//
// «La ristampa della stessa chiusura, dalla lista delle serate, esce
// subito» (Flavio, 28/08/2026): è il fatto che ha dato la direzione a
// tutto il resto — la stessa carta, dagli stessi dati, dalla stessa
// stampante, ma da un'altra strada. Ed era scoperta: il tasto c'era e
// nessun test lo premeva.
describe('la ristampa della chiusura, dalla lista delle serate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Il raggruppamento si ricorda su questo terminale: qui la lista deve
    // essere quella delle SERATE, o la riga della chiusura non c'è.
    localStorage.clear()
  })

  // Il tasto vive dentro il dettaglio della riga, che si apre toccandola.
  const apriLaSerataChiusa = async (user) => {
    const riga = (await screen.findByText(/1\.240,50/)).closest('.inv-row')
    await user.click(riga.querySelector('button.inv-row-main'))
    await waitFor(() => expect(riga.querySelector('.inv-row-dettaglio')).not.toBe(null))
    return riga
  }

  it('ristampa la serata giusta, e chi l’aveva chiusa resta chi l’aveva chiusa', async () => {
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    const user = userEvent.setup()
    render(<CashSessionsList />)
    await apriLaSerataChiusa(user)
    await user.click(await screen.findByRole('button', { name: /Ristampa chiusura/i }))

    await waitFor(() => expect(printChiusuraCassa).toHaveBeenCalledTimes(1))
    const [snap, sessione, opzioni] = printChiusuraCassa.mock.calls[0]
    expect(sessione.id).toBe('chiusa')
    // IL FOGLIO E LO SCHERMO RACCONTANO LA STESSA SERATA. Con la riga
    // aperta il riepilogo è quello RICALCOLATO dagli ordini — vedi il
    // commento in CashSessionsList: le serate chiuse con una versione
    // vecchia avevano le carte finite nel secchio dei contanti — e la
    // ristampa parte da lì, non dallo snapshot vecchio. Qui gli ordini non
    // ci sono, quindi il ricalcolo è a zero: quello che conta è che sia lo
    // STESSO numero che si legge sulla riga.
    expect(snap.incassato).toBe(0)
    // Operatore e contante contato sono quelli di ALLORA: la chiusura è la
    // fotografia di una serata finita, e chi ristampa oggi non ci entra.
    expect(opzioni.by).toBe('flavio@tana.it')
    expect(opzioni.countedCash).toBe(1200)
  })

  it('e se non esce, il banco lo viene a sapere', async () => {
    const { printChiusuraCassa } = await import('../../src/lib/printer.js')
    printChiusuraCassa.mockRejectedValueOnce(new Error('la carta è finita'))
    const user = userEvent.setup()
    render(<CashSessionsList />)
    await apriLaSerataChiusa(user)
    await user.click(await screen.findByRole('button', { name: /Ristampa chiusura/i }))

    await waitFor(() => expect(avvisoErrore).toHaveBeenCalledTimes(1))
    expect(String(avvisoErrore.mock.calls[0][0])).toMatch(/la carta è finita/)
  })

  it('la serata ANCORA APERTA non si ristampa: quel foglio non esiste', async () => {
    // Lo snapshot nasce alla chiusura. Un tasto che stampasse una serata
    // in corso farebbe uscire un foglio di chiusura di una cassa aperta,
    // che in contabilità è peggio di nessun foglio.
    const user = userEvent.setup()
    render(<CashSessionsList />)
    const riga = (await screen.findByText('in corso')).closest('.inv-row')
    await user.click(riga.querySelector('button.inv-row-main'))
    await waitFor(() => expect(riga.querySelector('.inv-row-dettaglio')).not.toBe(null))
    expect(riga.querySelector('.inv-row-dettaglio').textContent).not.toMatch(/Ristampa/)
  })
})
