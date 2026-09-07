// @vitest-environment happy-dom
'use strict'

// Test di COMPONENTE della schermata Pagamento in stile POS SumUp:
// articoli a SINISTRA (split per deselezione), tastierino calcolatrice e
// "Riscuotere" al CENTRO, metodi di pagamento e Sconto a DESTRA.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

vi.mock('../../src/lib/api.js', () => ({
  registerPayment: vi.fn(() => Promise.resolve({ closed: false })),
  markOrderPaid: vi.fn(() => Promise.resolve()),
  setOrderDiscount: vi.fn(() => Promise.resolve()),
  setOrderLotteryCode: vi.fn(() => Promise.resolve()),
  createInvoice: vi.fn(() =>
    Promise.resolve({
      id: 'inv1',
      number: '1/2026',
      total: 22,
      items: [],
      customer: { denominazione: 'ACME srl', email: 'amministrazione@acme.it' },
    })
  ),
  markInvoiceSent: vi.fn(() => Promise.resolve()),
  subscribeVouchers: vi.fn((cb) => {
    cb(mockVouchers)
    return () => {}
  }),
  applyVoucherDiscount: vi.fn(() => Promise.resolve({ redeemed: 10 })),
  segnaScontrinoStampato: vi.fn(),
}))
vi.mock('../../src/lib/paymentsApi.js', () => ({
  readerCheckout: vi.fn(() => Promise.resolve({})),
}))
vi.mock('../../src/lib/printer.js', () => ({
  printScontrino: vi.fn(() => Promise.resolve()),
  printScontrinoAcconto: vi.fn(() => Promise.resolve()),
  printFattura: vi.fn(() => Promise.resolve()),
  loadPrinterSettings: vi.fn(() => ({ businessName: 'La Tana' })),
  // L'ALIQUOTA È UNA SOLA, quella del locale (BUG-084): non sta più fra le
  // impostazioni della stampante. Qui il finto legge `sale_vat` come il vero.
  aliquotaScontrino: (impostazioni) => Number(impostazioni?.sale_vat ?? 10),
  // Guardia "una copia sola per conto": nei test lascia sempre passare.
  claimReceiptPrint: vi.fn(() => true),
  reclaimReceiptPrint: vi.fn(() => true),
  releaseReceiptPrint: vi.fn(),
  scontrinoGiaUscito: vi.fn(() => false),
}))
vi.mock('../../src/lib/toast.js', () => ({ showToast: vi.fn(), toastError: vi.fn() }))

import PaymentScreen from '../../src/components/PaymentScreen.jsx'
import { showToast, toastError } from '../../src/lib/toast.js'
import {
  registerPayment,
  setOrderDiscount,
  setOrderLotteryCode,
  createInvoice,
  segnaScontrinoStampato,
} from '../../src/lib/api.js'
import { readerCheckout } from '../../src/lib/paymentsApi.js'
import { applyVoucherDiscount } from '../../src/lib/api.js'
import {
  printScontrino,
  printScontrinoAcconto,
  printFattura,
  loadPrinterSettings,
  releaseReceiptPrint,
  scontrinoGiaUscito,
} from '../../src/lib/printer.js'

let mockVouchers = []

const baseOrder = (over = {}) => ({
  id: 'ord1',
  daily_number: 4,
  status: 'aperto',
  payment_status: 'non_richiesto',
  total: 22,
  discount: null,
  discount_amount: 0,
  payments: [],
  comande: [
    {
      id: 'c1',
      seq: 1,
      status: 'ritirato',
      items: [
        { drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 },
        { drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 },
      ],
    },
  ],
  ...over,
})

// Un conto con una comanda ancora da servire: è la condizione in cui
// «Riscuoti e servi» ha senso di esistere. Sta qui e non dentro un
// describe perché serve a due gruppi di prove diversi.
const conComandaDaServire = () =>
  baseOrder({
    comande: [
      {
        id: 'c1',
        seq: 1,
        status: 'in_preparazione',
        items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
      },
    ],
  })

const noReader = { payments_reader_enabled: false, sumup_reader_id: null, sale_vat: 10 }
const withReader = { payments_reader_enabled: true, sumup_reader_id: 'reader1' }
// LA FATTURA AL CLIENTE È UNA FUNZIONE PREMIUM (REQ-LIC-001) e per questa
// installazione non è inclusa: il tasto c'è solo dove la licenza la dà.
const conFatture = { ...noReader, licenza: { moduli: { fatture: true } } }

function mount(order, settings = noReader) {
  return render(
    <PaymentScreen order={order} settings={settings} onClose={vi.fn()} onBeforePay={vi.fn()} />
  )
}

const payAmount = () => screen.getByTestId('pay-amount')

beforeEach(() => {
  vi.clearAllMocks()
  mockVouchers = []
})

describe('layout POS: tutto già in pagamento, Riscuotere incassa', () => {
  it('si apre con il residuo intero e Riscuotere lo incassa in Contante', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    // sinistra: articoli con selezione piena; centro: importo = dovuto.
    // I due Mojito nascono SEPARATI (REQ-PAG-009): due righe da «1/1», non
    // una da «2/2».
    expect(screen.getAllByText('Mojito')).toHaveLength(2)
    expect(screen.queryByText('2/2')).toBeNull()
    expect(payAmount()).toHaveTextContent('22,00')
    // destra: Contante è il metodo di default
    expect(screen.getByRole('button', { name: /Contante/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    expect(registerPayment).toHaveBeenCalledWith('ord1', {
      amount: 22,
      method: 'banco',
      items: null,
      autoServe: false,
      chiude: true,
      sconto: null,
    })
  })

  it('split per deselezione: si incassa solo la selezione con il dettaglio articoli', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    // Partendo separati (REQ-PAG-009) i Mojito sono due righe: se ne toglie
    // una, e con lei il Gin Tonic.
    await user.click(screen.getAllByRole('button', { name: 'Togli Mojito dal pagamento' })[0])
    await user.click(screen.getByRole('button', { name: 'Togli Gin Tonic dal pagamento' }))
    expect(payAmount()).toHaveTextContent('7,00')
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    expect(registerPayment).toHaveBeenCalledWith('ord1', {
      amount: 7,
      method: 'banco',
      items: [expect.objectContaining({ drink_id: 'mojito', qty: 1 })],
      autoServe: false,
      chiude: false,
      sconto: null,
    })
  })

  it('gli articoli già pagati spariscono dalla lista e restano nello storico', () => {
    mount(
      baseOrder({
        payment_status: 'parziale',
        payments: [
          {
            id: 'p1',
            amount: 14,
            method: 'banco',
            at: '2026-07-12T21:00:00.000Z',
            items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
          },
        ],
      })
    )
    expect(screen.queryByText('Mojito')).not.toBeInTheDocument()
    expect(screen.getByText('Gin Tonic')).toBeInTheDocument()
    expect(screen.getByText('GIÀ PAGATO')).toBeInTheDocument()
    // residuo = 22 − 14
    expect(payAmount()).toHaveTextContent('8,00')
  })
})

describe('tastierino calcolatrice', () => {
  it('digitando un importo libero si incassa quello (senza dettaglio articoli)', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    // "500" in centesimi → 5,00 €
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: '00' }))
    expect(payAmount()).toHaveTextContent('5,00')
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    expect(registerPayment).toHaveBeenCalledWith('ord1', {
      amount: 5,
      method: 'banco',
      items: null,
      autoServe: false,
      chiude: false,
      sconto: null,
    })
  })

  it('/2 divide l\'importo corrente (split alla romana)', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: '/2' }))
    expect(payAmount()).toHaveTextContent('11,00')
  })

  it('oltre il dovuto: mostra il RESTO e incassa solo il residuo', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    // il cliente dà 25,00 €
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: '00' }))
    expect(payAmount()).toHaveTextContent('25,00')
    expect(screen.getByText(/Resto:/)).toBeInTheDocument()
    expect(screen.getByText('3,00 €')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    expect(registerPayment).toHaveBeenCalledWith('ord1', {
      amount: 22,
      method: 'banco',
      items: null,
      autoServe: false,
      chiude: true,
      sconto: null,
    })
  })

  it('C annulla il digitato e torna all\'importo della selezione', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: '5' }))
    expect(payAmount()).toHaveTextContent('0,05')
    await user.click(screen.getByRole('button', { name: 'C' }))
    expect(payAmount()).toHaveTextContent('22,00')
  })
})

describe('metodi di pagamento', () => {
  it('Carta di Credito (POS esterno): registra l\'incasso con metodo carta', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Carta di Credito/ }))
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    expect(registerPayment).toHaveBeenCalledWith('ord1', {
      amount: 22,
      method: 'carta',
      items: null,
      autoServe: false,
      chiude: true,
      sconto: null,
    })
  })

  it('SumUp (lettore Solo): selezionandolo, Riscuotere avvia readerCheckout', async () => {
    const user = userEvent.setup()
    mount(baseOrder(), withReader)
    await user.click(screen.getByRole('button', { name: /SumUp/ }))
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    expect(readerCheckout).toHaveBeenCalledWith('ord1', { amount: 22, items: null, sconto: null })
    expect(registerPayment).not.toHaveBeenCalled()
  })

  // «QUESTO MESSAGGIO TOGLILO, CHE OCCUPA SPAZIO QUANDO ZOOMO» (l'utente,
  // 21/08/2026). L'avviso «Comande non ancora servite: il conto resta aperto
  // anche dopo l'incasso» era una riga FISSA nella colonna centrale: a zoom
  // alto quella riga è spazio tolto al tastierino, che proprio lì finiva
  // sotto «Riscuotere» (BUG-075). E la si legge una volta sola in una vita.
  // È lo stesso ragionamento con cui il motivo di un metodo spento non sta
  // più scritto sotto al tasto (REQ-PAG-004).
  it('l’avviso sulle comande da servire non occupa più una riga', () => {
    mount(conComandaDaServire())
    expect(screen.queryByText(/Comande non ancora servite/)).toBeNull()
  })

  // L'informazione non è sparita: sta dove non costa altezza. Col servizio
  // seguito e comande ancora da servire, «Riscuotere» se la porta nel
  // `title` — e quando «Riscuoti e servi» è ACCESO la nomina, perché quella
  // è l'unica strada che chiude subito.
  it('il perché resta nel title di «Riscuotere», senza rubare una riga', () => {
    mount(conComandaDaServire())
    const tasto = screen.getByRole('button', { name: /Riscuotere/ })
    expect(tasto).toHaveAttribute('title', expect.stringContaining('resta aperto'))
    expect(tasto.getAttribute('title')).not.toMatch(/Riscuoti e servi/)
    cleanup()
    mount(conComandaDaServire(), { ...noReader, riscuoti_e_servi: true })
    expect(screen.getByRole('button', { name: /Riscuotere/ }).getAttribute('title')).toMatch(
      /Riscuoti e servi/
    )
  })

  // Senza gestione della preparazione non esistono comande «da servire» —
  // sono servite per definizione — e l'incasso chiude e basta: niente da
  // spiegare, nemmeno nel title.
  it('gestione preparazione SPENTA: «Riscuotere» non ha niente da spiegare', () => {
    mount(baseOrder(), { ...noReader, workflow_enabled: false })
    expect(screen.getByRole('button', { name: /Riscuotere/ })).not.toHaveAttribute('title')
  })

  // IL CONTO SI RISCUOTE SEMPRE, SI CHIUDE SOLO SE SERVITO. Ma al banco si
  // consegna e si incassa spesso nello stesso gesto: il locale può
  // accendere il tasto che fa le due cose insieme.
  it('«Riscuoti e servi» c’è solo se il locale lo ha chiesto', () => {
    mount(conComandaDaServire())
    expect(screen.queryByRole('button', { name: /Riscuoti e servi/ })).toBeNull()
    cleanup()
    mount(conComandaDaServire(), { ...noReader, riscuoti_e_servi: true })
    expect(screen.getByRole('button', { name: /Riscuoti e servi/ })).toBeInTheDocument()
  })

  it('«Riscuoti e servi» incassa E serve; «Riscuotere» da solo no', async () => {
    const user = userEvent.setup()
    mount(conComandaDaServire(), { ...noReader, riscuoti_e_servi: true })
    await user.click(screen.getByRole('button', { name: /Riscuoti e servi/ }))
    expect(registerPayment).toHaveBeenCalledWith(
      'ord1',
      expect.objectContaining({ autoServe: true })
    )
    cleanup()
    vi.clearAllMocks()
    mount(conComandaDaServire(), { ...noReader, riscuoti_e_servi: true })
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    expect(registerPayment).toHaveBeenCalledWith(
      'ord1',
      expect.objectContaining({ autoServe: false })
    )
  })

  it('senza gli stati del servizio il tasto in più non serve', () => {
    // Lì incassare serve già tutto: due tasti direbbero la stessa cosa.
    mount(conComandaDaServire(), { ...noReader, workflow_enabled: false, riscuoti_e_servi: true })
    expect(screen.queryByRole('button', { name: /Riscuoti e servi/ })).toBeNull()
  })

  it('lettore NON configurato: SumUp spento, senza sottotitolo sul tasto', () => {
    mount(baseOrder())
    expect(screen.getByRole('button', { name: /Carta di Credito/ })).toBeInTheDocument()
    const sumup = screen.getByRole('button', { name: /SumUp/ })
    expect(sumup).toHaveClass('spento')
    expect(sumup).toHaveAttribute('aria-disabled', 'true')
    expect(sumup).not.toHaveTextContent(/Impostazioni/)
  })

  it('toccando SumUp spento si legge perché, e il metodo non cambia', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /SumUp/ }))
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/Impostazioni → Pagamenti/))
    // Resta selezionato il contante: un tasto spento non cambia l'incasso.
    expect(screen.getByRole('button', { name: /Contante/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Buono come sconto: senza buoni l’opzione 🎟 è spenta nel modale sconto', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Sconto/ }))
    const modal = within(screen.getByRole('dialog', { name: 'Sconto' }))
    expect(modal.getByRole('button', { name: '🎟' })).toBeDisabled()
    // niente più metodo di pagamento "Buono VIP"
    expect(screen.queryByRole('button', { name: /Buono VIP/ })).not.toBeInTheDocument()
  })

  it('Buono come sconto: scelto il beneficiario, si applica come sconto dal saldo', async () => {
    mockVouchers = [{ id: 'v1', holder_name: 'Marco', balance: 10 }]
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Sconto/ }))
    const modal = within(screen.getByRole('dialog', { name: 'Sconto' }))
    await user.click(modal.getByRole('button', { name: '🎟' }))
    await user.selectOptions(modal.getByLabelText(/Buono di/), 'v1')
    // saldo 10 < dovuto 22 → si applicano 10 di sconto attingendo al buono
    expect(modal.getByText(/Dal buono: −10,00 €/)).toBeInTheDocument()
    await user.click(modal.getByRole('button', { name: /Applica/ }))
    expect(applyVoucherDiscount).toHaveBeenCalledWith('ord1', 'v1', 10, { items: null })
  })
})

describe('sconto: modale con tastierino', () => {
  it('percentuale: si digita sul tastierino della modale e si applica', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Sconto/ }))
    const modal = within(screen.getByRole('dialog', { name: 'Sconto' }))
    await user.click(modal.getByRole('button', { name: '1' }))
    await user.click(modal.getByRole('button', { name: '0' }))
    expect(modal.getByTestId('disc-amount')).toHaveTextContent('10%')
    // L'anteprima è su QUELLO CHE SI STA RISCUOTENDO: qui è tutto il conto.
    expect(modal.getByText(/Sconto su quello che stai riscuotendo: −/)).toHaveTextContent('2,20 €')
    await user.click(modal.getByRole('button', { name: /Applica/ }))
    expect(setOrderDiscount).toHaveBeenCalledWith('ord1', { type: 'percent', value: 10 }, { items: null, amount: 2.2 })
  })

  it('in euro: il toggle € interpreta le cifre come centesimi', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Sconto/ }))
    const modal = within(screen.getByRole('dialog', { name: 'Sconto' }))
    await user.click(modal.getByRole('button', { name: '€' }))
    await user.click(modal.getByRole('button', { name: '5' }))
    await user.click(modal.getByRole('button', { name: '0' }))
    await user.click(modal.getByRole('button', { name: '0' }))
    expect(modal.getByTestId('disc-amount')).toHaveTextContent('5,00')
    await user.click(modal.getByRole('button', { name: /Applica/ }))
    expect(setOrderDiscount).toHaveBeenCalledWith('ord1', { type: 'euro', value: 5 }, { items: null, amount: 5 })
  })

  // IL CONTO SCONTATO SI CHIUDE COME CHIUSO (BUG-046). Lo sconto si applica
  // un attimo prima di riscuotere e la sua scrittura parte in sottofondo:
  // l'api, rileggendo, prendeva la versione senza sconto e scriveva
  // «parziale». Quanto resta lo sa questa schermata, e ora glielo dice.
  it('incassando il residuo scontato dice all’api che il conto è saldato', async () => {
    const user = userEvent.setup()
    mount(baseOrder({ discount: { type: 'percent', value: 10 }, discount_amount: 2.2 }))
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    expect(registerPayment).toHaveBeenCalledWith(
      'ord1',
      expect.objectContaining({ amount: 19.8, chiude: true })
    )
  })

  it('lo sconto applicato riduce il dovuto e si può rimuovere', async () => {
    const user = userEvent.setup()
    mount(baseOrder({ discount: { type: 'percent', value: 10 }, discount_amount: 2.2 }))
    expect(payAmount()).toHaveTextContent('19,80')
    await user.click(screen.getByRole('button', { name: /Sconto/ }))
    const modal = within(screen.getByRole('dialog', { name: 'Sconto' }))
    await user.click(modal.getByRole('button', { name: 'Rimuovi sconto' }))
    expect(setOrderDiscount).toHaveBeenCalledWith('ord1', null)
  })

  // Il tastierino dello sconto riusava la griglia del pagamento, che ha quattro
  // colonne per far posto agli operatori: le cifre andavano a capo dove capitava
  // (7 8 9 4 / 5 6 1 2 / 3 C 0 ←) e al banco non si trovava più niente.
  it('le cifre stanno in ordine da tastierino, su tre colonne', async () => {
    const user = userEvent.setup()
    const { container } = mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Sconto/ }))
    const pad = container.querySelector('.paypad-cifre')
    expect(pad).toBeTruthy()
    expect([...pad.querySelectorAll('.paypad-key')].map((b) => b.textContent)).toEqual([
      '7', '8', '9',
      '4', '5', '6',
      '1', '2', '3',
      'C', '0', '←',
    ])
  })
})

describe('codice lotteria e fattura', () => {
  it('Codice Lotteria: modale, salva il codice in maiuscolo sul conto', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Codice Lotteria/ }))
    const modal = within(screen.getByRole('dialog', { name: 'Codice Lotteria' }))
    await user.type(modal.getByLabelText('Codice'), 'abcd1234')
    await user.click(modal.getByRole('button', { name: 'Salva codice' }))
    expect(setOrderLotteryCode).toHaveBeenCalledWith('ord1', 'ABCD1234')
  })

  it('Invia fattura: form dati cliente → emissione → invio/stampa', async () => {
    const user = userEvent.setup()
    mount(baseOrder(), conFatture)
    await user.click(screen.getByRole('button', { name: /Invia fattura/ }))
    const modal = within(screen.getByRole('dialog', { name: 'Invia fattura' }))
    await user.type(modal.getByLabelText(/Ragione sociale/), 'ACME srl')
    await user.type(modal.getByLabelText('Email'), 'amministrazione@acme.it')
    await user.click(modal.getByRole('button', { name: /Emetti fattura/ }))
    expect(createInvoice).toHaveBeenCalledWith({
      order: expect.objectContaining({ id: 'ord1' }),
      customer: expect.objectContaining({
        denominazione: 'ACME srl',
        email: 'amministrazione@acme.it',
      }),
      // L'aliquota della FATTURA è quella del locale, la stessa dello
      // scontrino: prima veniva dalle impostazioni della stampante di
      // questo terminale e le due potevano non tornare (BUG-084).
      ivaRate: 10,
    })
    // emessa: numero visibile + stampa
    expect(await screen.findByText(/n\. 1\/2026/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Stampa fattura/ }))
    expect(printFattura).toHaveBeenCalledTimes(1)
  })
})

describe('preconto e stato del conto', () => {
  it('"Preconto" stampa lo scontrino non fiscale', async () => {
    const user = userEvent.setup()
    const order = baseOrder()
    mount(order)
    await user.click(screen.getByRole('button', { name: /Preconto/ }))
    expect(printScontrino).toHaveBeenCalledWith(order)
    expect(registerPayment).not.toHaveBeenCalled()
  })

  it('conto pagato: niente Riscuotere, conferma visibile', () => {
    mount(baseOrder({ payment_status: 'pagato', status: 'pagato' }))
    expect(screen.queryByRole('button', { name: /Riscuotere/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Conto pagato e chiuso/)).toBeInTheDocument()
  })
})

// LO SCONTRINO DEVE DIRE COME SI È PAGATO.
// Segnalato dal locale: "il conteggio lo fa di carta, ma lo scontrino esce
// sempre contanti". La registrazione va in background, quindi al momento della
// stampa l'ordine non sa ancora com'è stato pagato: la stampa ripiegava sul
// contante, che è una dichiarazione falsa e non un default.
describe('scontrino: il metodo di pagamento', () => {
  // Lo scontrino a fine incasso esce solo con l'auto-stampa accesa.
  beforeEach(() => {
    loadPrinterSettings.mockReturnValue({
      businessName: 'La Tana',
      autoPrintScontrino: true,
    })
    scontrinoGiaUscito.mockReturnValue(false)
  })

  it('con la carta lo scontrino esce con la carta', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Carta di Credito/ }))
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    await waitFor(() => expect(printScontrino).toHaveBeenCalled())
    const stampato = printScontrino.mock.calls.at(-1)[0]
    expect(stampato.payment_method).toBe('carta')
    expect(stampato.payments.at(-1).method).toBe('carta')
  })

  // SE LA CARTA NON ESCE, LA PRENOTAZIONE TORNA LIBERA (BUG-047). Senza,
  // quel conto non stampava più lo scontrino automatico: né riaperto, né
  // richiuso, né da un altro terminale.
  it('stampa fallita: il conto torna stampabile invece di restare bruciato', async () => {
    const user = userEvent.setup()
    printScontrino.mockRejectedValueOnce(new Error('stampante spenta'))
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    await waitFor(() => expect(releaseReceiptPrint).toHaveBeenCalledWith('ord1'))
  })

  // IL CONTO CHE NON ESISTE ANCORA. Pagando dritto dal POS la schermata si
  // apre su un guscio locale (id nullo) mentre il conto nasce in sottofondo:
  // prima la carta la stampava LA CODA quando vedeva l'ordine vero pagato, ed
  // era l'unico caso legittimo di un blocco che stampava tutto (BUG-055).
  // Adesso esce da qui, col numero che la testata mostra già, e il segno sul
  // dato raggiunge il conto appena ha un id.
  it('pagamento diretto dal POS: la carta esce dal gesto, non dalla coda', async () => {
    const user = userEvent.setup()
    const guscio = baseOrder({ id: null, comande: [], order_items: [
      { drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 },
    ] })
    render(
      <PaymentScreen
        order={guscio}
        settings={noReader}
        onClose={vi.fn()}
        onBeforePay={vi.fn()}
        resolveOrderId={() => Promise.resolve('ord-nato')}
      />
    )
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    await waitFor(() => expect(printScontrino).toHaveBeenCalled())
    expect(printScontrino.mock.calls.at(-1)[0].daily_number).toBe(4)
    // E il segno finisce sul conto vero, quello appena nato.
    await waitFor(() => expect(segnaScontrinoStampato).toHaveBeenCalledWith('ord-nato'))
  })

  // Il segno sul DATO vale più della memoria di questo browser: se un altro
  // terminale ha già stampato, qui non esce la seconda copia.
  it('conto già segnato: niente seconda copia', async () => {
    const user = userEvent.setup()
    scontrinoGiaUscito.mockReturnValue(true)
    mount(baseOrder({ receipt_print_at: '2026-08-20T21:00:00.000Z' }))
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    await waitFor(() => expect(registerPayment).toHaveBeenCalled())
    expect(printScontrino).not.toHaveBeenCalled()
  })

  it('coi contanti resta contanti', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Contante/ }))
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    await waitFor(() => expect(printScontrino).toHaveBeenCalled())
    const stampato = printScontrino.mock.calls.at(-1)[0]
    expect(stampato.payment_method).toBe('banco')
  })
})

// ── Due righe dello stesso prodotto ──────────────────────────────────
// Difetto visto in produzione: con «Negroni, Coca Cola, Negroni», premere
// «+» sul primo Negroni alzava anche il secondo. La selezione era per
// PRODOTTO e le due righe condividevano il contatore: si incassava una
// quantità che nessuno aveva scelto.
describe('due righe uguali si muovono una per volta', () => {
  const dueNegroni = () =>
    baseOrder({
      total: 19,
      comande: [],
      order_items: [
        { drink_id: 'negroni', name: 'Negroni', unit_price: 8, qty: 1 },
        { drink_id: 'coca', name: 'Coca Cola', unit_price: 3, qty: 1 },
        { drink_id: 'negroni', name: 'Negroni', unit_price: 8, qty: 1, custom: true },
      ],
    })

  it('togliendo il primo Negroni, il secondo resta in pagamento', async () => {
    const user = userEvent.setup()
    mount(dueNegroni())
    // Si apre con tutto selezionato: 8 + 3 + 8.
    expect(payAmount()).toHaveTextContent('19,00')
    const togli = screen.getAllByRole('button', { name: /Togli Negroni dal pagamento/ })
    expect(togli).toHaveLength(2)
    await user.click(togli[0])
    // Se si muovessero insieme resterebbero solo 3,00 €.
    expect(payAmount()).toHaveTextContent('11,00')
  })

  it('e si incassa solo la riga scelta', async () => {
    const user = userEvent.setup()
    mount(dueNegroni())
    const togli = screen.getAllByRole('button', { name: /Togli Negroni dal pagamento/ })
    await user.click(togli[0])
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    const [, dati] = registerPayment.mock.calls.at(-1)
    expect(dati.amount).toBe(11)
    // Un solo Negroni nel dettaglio dell'incasso.
    const negroni = dati.items.filter((i) => i.drink_id === 'negroni')
    expect(negroni).toHaveLength(1)
    expect(negroni[0].qty).toBe(1)
  })
})

// IL CASO DEL VIDEO (#45): due Negroni «liberi/modificati» (la ✨), ognuno
// 1×, e in mezzo una Coca. Righe che NON si accorpano mai — quindi niente
// tasto «Separa uguali», e prima premendo + su uno si muovevano tutti e due.
describe('due prodotti liberi uguali, come nel conto #45', () => {
  const comeNelVideo = () =>
    baseOrder({
      total: 15,
      comande: [],
      order_items: [
        { drink_id: 'negroni', name: 'NEGRONI', unit_price: 6, qty: 1, custom: true },
        { drink_id: 'coca', name: 'COCA ZERO VETRO', unit_price: 3, qty: 1, custom: true },
        { drink_id: 'negroni', name: 'NEGRONI', unit_price: 6, qty: 1, custom: true },
      ],
    })

  it('il tasto unisci/separa non c’è: non c’è niente da unire né da separare', () => {
    mount(comeNelVideo())
    expect(screen.queryByRole('button', { name: /Separa uguali/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Unisci uguali/ })).toBeNull()
    // Tre righe distinte, ognuna col suo contatore.
    expect(screen.getAllByRole('button', { name: /Paga NEGRONI/ })).toHaveLength(2)
  })

  it('il + su un NEGRONI muove solo quello', async () => {
    const user = userEvent.setup()
    mount(comeNelVideo())
    // Si parte da tutto selezionato: si toglie tutto e si riprende un solo
    // Negroni, come nel video (0/1 su tutte le righe).
    for (const b of screen.getAllByRole('button', { name: /Togli .* dal pagamento/ })) {
      await user.click(b)
    }
    expect(payAmount()).toHaveTextContent('0,00')
    await user.click(screen.getAllByRole('button', { name: /Paga NEGRONI/ })[0])
    // Se si muovessero insieme sarebbero 12,00 €.
    expect(payAmount()).toHaveTextContent('6,00')
  })

  // Prodotti liberi veri: senza nemmeno un id di catalogo.
  it('anche due voci libere senza prodotto restano indipendenti', async () => {
    const user = userEvent.setup()
    mount(
      baseOrder({
        total: 10,
        comande: [],
        order_items: [
          { drink_id: null, name: 'Extra', unit_price: 5, qty: 1, custom: true },
          { drink_id: null, name: 'Extra', unit_price: 5, qty: 1, custom: true },
        ],
      })
    )
    expect(payAmount()).toHaveTextContent('10,00')
    await user.click(screen.getAllByRole('button', { name: /Togli Extra dal pagamento/ })[0])
    expect(payAmount()).toHaveTextContent('5,00')
  })
})

// SI PARTE SEPARATI (REQ-PAG-009). Al banco si paga quasi sempre a pezzi —
// uno paga il suo, un altro offre due birre — e partire dal gruppo «2×
// Mojito» voleva dire un tocco in più ogni volta, con la fila alla cassa.
// Il raggruppamento non sparisce: serve a chi ha un conto lungo e
// illeggibile, e adesso è lui a chiederlo.
describe('il pagamento si apre con le righe già separate', () => {
  it('due Mojito sono due righe da «1/1», non una da «2/2»', () => {
    mount(baseOrder())
    expect(screen.getAllByRole('button', { name: /Togli Mojito dal pagamento/ })).toHaveLength(2)
    expect(screen.queryByText('2/2')).toBeNull()
  })

  it('il tasto offre di UNIRE, che è la cosa che resta da fare', () => {
    mount(baseOrder())
    expect(screen.getByRole('button', { name: /Unisci uguali/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Separa uguali/ })).toBeNull()
  })

  it('unendo si torna al gruppo, e il tasto ripropone di separare', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Unisci uguali/ }))
    expect(screen.getByText('2/2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Separa uguali/ })).toBeInTheDocument()
  })

  // Chi incassa tutto non deve toccare niente: separare le righe non
  // cambia l'importo con cui la schermata si apre.
  it('chi incassa tutto non paga il prezzo della separazione', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    expect(payAmount()).toHaveTextContent('22,00')
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    expect(registerPayment).toHaveBeenCalledWith('ord1', {
      amount: 22,
      method: 'banco',
      items: null,
      autoServe: false,
      // L'incasso dell'intero dichiara che il conto si chiude (hotfix
      // BUG-046): senza, il conto scontato restava «parziale».
      chiude: true,
      sconto: null,
    })
  })
})

// La vista separata mostra le unità come le altre righe: nome, prezzo e il
// contatore −/+. Prima erano caselline da spuntare, e nella stessa colonna
// convivevano due modi diversi di dire la stessa cosa.
describe('vista separata: righe come tutte le altre', () => {
  it('due Mojito sono due righe col contatore, non caselle', () => {
    mount(baseOrder()) // Mojito 2× + Gin Tonic
    // Nessun tocco: si NASCE separati (REQ-PAG-009).
    // Due unità di Mojito, ognuna col suo −/+ e il suo 1/1.
    expect(screen.getAllByRole('button', { name: /Togli Mojito dal pagamento/ })).toHaveLength(2)
    expect(screen.getAllByText('1/1').length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByText(/☑/)).toBeNull()
  })

  it('togliendo una sola unità si incassa solo l’altra', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    // La seconda unità di Mojito esce dal pagamento: 22 − 7 = 15.
    await user.click(screen.getAllByRole('button', { name: /Togli Mojito dal pagamento/ })[1])
    expect(payAmount()).toHaveTextContent('15,00')
  })
})

// DUE MODI DI INCASSARE, E VANNO DISTINTI. Scegliere le righe compone il
// totale e copre esattamente quelle; battere un importo a mano è un
// ACCONTO, che resta sul conto e non copre niente in particolare. Il
// meccanismo c'era, ma le righe col −/+ sembravano un riepilogo: chi non lo
// sapeva batteva l'importo a mano e poi non capiva cosa fosse stato pagato.
describe('righe scelte o importo a mano', () => {
  it('scegliendo le righe il totale si compone, e si vede da dove viene', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    // Si toglie una unità di Mojito dalla selezione (parte tutto scelto, e
    // separato): il totale cala di 7 e l'etichetta dice che sono righe.
    await user.click(screen.getAllByRole('button', { name: /Togli Mojito dal pagamento/ })[0])
    expect(await screen.findByText(/RIGHE SCELTE/)).toBeInTheDocument()
    expect(payAmount()).toHaveTextContent('15,00')
  })

  it('un importo a mano si chiama col suo nome, e dice che resta sul conto', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    expect(screen.getByText('IMPORTO A MANO')).toBeInTheDocument()
    expect(screen.getByText(/Acconto: resta sul conto/)).toBeInTheDocument()
  })
})

// SEPARANDO LE UGUALI SI TOGLIE UNA UNITÀ ALLA VOLTA. Il «−» scriveva la
// nuova quantità come «tutte quelle prima di questa»: premuto sulla PRIMA
// di tre le spegneva tutte e tre insieme, e chi stava dividendo il conto si
// ritrovava da capo.
describe('separa uguali: ognuna ha la sua quantità', () => {
  it('si spegne QUELLA che si tocca, non le altre', async () => {
    const user = userEvent.setup()
    // Due Mojito, che all'apertura sono già due unità.
    mount(baseOrder())
    const meno = screen.getAllByRole('button', { name: /Togli Mojito dal pagamento/ })
    expect(meno).toHaveLength(2)
    await user.click(meno[0])
    // Una sola unità è uscita: il totale cala di 7, non di 14.
    expect(payAmount()).toHaveTextContent('15,00')
    // E la spenta è la PRIMA: il suo «−» ora è disabilitato, quello della
    // seconda no. Con un contatore che scende sarebbe stato il contrario.
    const dopo = screen.getAllByRole('button', { name: /Togli Mojito dal pagamento/ })
    expect(dopo[0]).toBeDisabled()
    expect(dopo[1]).not.toBeDisabled()
  })

  it('e si rimette dentro una alla volta', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getAllByRole('button', { name: /Togli Mojito dal pagamento/ })[0])
    // Si rimette dentro proprio quella: il «+» della prima riga.
    await user.click(screen.getAllByRole('button', { name: /Paga Mojito/ })[0])
    expect(payAmount()).toHaveTextContent('22,00')
  })
})
// ── RISCUOTI (SENZA STAMPA) ──────────────────────────────────────────
//
// Il gesto gemello di «Riscuotere» per il cliente che lo scontrino di
// cortesia non lo vuole: incassa e chiude uguale, ma la stampante tace.
// Compare solo se il locale l'ha acceso (riscuoti_senza_stampa), e non
// prende nemmeno la pretesa di stampa: se il conto verrà riaperto e
// riscosso normale, lo scontrino esce come sempre.
describe('riscuoti senza stampa', () => {
  it('spento di default: il tasto non c’è', () => {
    mount(baseOrder())
    expect(screen.queryByRole('button', { name: /senza stampa/ })).toBeNull()
  })

  it('acceso: incassa come Riscuotere ma la stampante tace', async () => {
    const user = userEvent.setup()
    mount(baseOrder(), { ...noReader, riscuoti_senza_stampa: true })
    await user.click(screen.getByRole('button', { name: /senza stampa/ }))
    await waitFor(() => expect(registerPayment).toHaveBeenCalled())
    // Chiude come una riscossione vera…
    expect(registerPayment.mock.calls[0][1]).toMatchObject({ amount: 22, chiude: true })
    // …ma niente carta, e nessuna pretesa presa: la prossima riscossione
    // normale stamperà come sempre.
    expect(printScontrino).not.toHaveBeenCalled()
  })
})

// ── LO SCONTRINO D'ACCONTO (REQ-STAMPA-015) ──────────────────────────
//
// «È normale che se riscuoto solo un acconto non mi stampa lo scontrino?»
// Sì, ed era di proposito: la stampa era appesa alla CHIUSURA del conto, e
// un acconto non chiude. «Lo scontrino esce ad ogni riscossione ma è
// configurabile. Va fatto così: una impostazione che attiva un terzo
// bottone, "riscuoti acconto con scontrino", e una ulteriore opzione che
// invece ad ogni riscossione stampa lo scontrino d'acconto. […] Quando la
// riscossione dello scontrino di acconto è attiva, disabilita l'opzione
// del terzo bottone» (l'utente, 21/08/2026).
//
// La regola pura sta in lib/scontrinoAcconto.js e si prova a unità; qui si
// prova la SCHERMATA: quando il tasto c'è, quando è spento e perché, e
// quale carta esce a ogni gesto.
describe('lo scontrino d’acconto', () => {
  const etichette = (nome) => screen.getAllByRole('button', { name: new RegExp(`^${nome} ·`) })
  // Solo una riga di 8 € su un conto da 22: l'incasso non chiude niente,
  // che è l'unica condizione in cui un acconto esiste.
  const riscuotiUnaRigaSola = async (user) => {
    await user.click(etichette('Gin Tonic')[0])
    expect(payAmount()).toHaveTextContent('8,00')
  }

  const conTasto = { ...noReader, scontrino_acconto_tasto: true }
  const sempre = { ...noReader, scontrino_acconto_sempre: true }

  beforeEach(() => {
    // L'acconto automatico segue la stampa automatica DI QUESTO
    // TERMINALE: è carta che esce da sola, e il telefono della sala che
    // gli scontrini non li stampa non deve cominciare a stampare acconti.
    loadPrinterSettings.mockReturnValue({
      businessName: 'La Tana',
      autoPrintScontrino: true,
    })
  })

  it('spente tutte e due: nessun tasto, e una riscossione parziale non stampa', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    expect(screen.queryByRole('button', { name: /Acconto con scontrino/ })).toBeNull()
    await riscuotiUnaRigaSola(user)
    await user.click(screen.getByRole('button', { name: /^Riscuotere/ }))
    await waitFor(() => expect(registerPayment).toHaveBeenCalled())
    expect(printScontrinoAcconto).not.toHaveBeenCalled()
    expect(printScontrino).not.toHaveBeenCalled()
  })

  it('col terzo tasto acceso, «Riscuotere» da solo continua a non stampare', async () => {
    // La differenza fra le due impostazioni è tutta qui: il tasto aggiunge
    // una strada, non cambia quella normale.
    const user = userEvent.setup()
    mount(baseOrder(), conTasto)
    await riscuotiUnaRigaSola(user)
    await user.click(screen.getByRole('button', { name: /^Riscuotere/ }))
    await waitFor(() => expect(registerPayment).toHaveBeenCalled())
    expect(printScontrinoAcconto).not.toHaveBeenCalled()
  })

  it('il terzo tasto incassa e stampa la carta di chi se ne va', async () => {
    const user = userEvent.setup()
    mount(baseOrder(), conTasto)
    await riscuotiUnaRigaSola(user)
    await user.click(screen.getByRole('button', { name: /Acconto con scontrino/ }))
    await waitFor(() => expect(registerPayment).toHaveBeenCalled())
    expect(registerPayment.mock.calls[0][1]).toMatchObject({ amount: 8, chiude: false })
    // La carta porta l'incasso appena battuto: importo, metodo e le righe
    // pagate. Senza le righe, chi resta al tavolo non sa cosa è già stato
    // pagato.
    const [conto, incasso] = printScontrinoAcconto.mock.calls.at(-1)
    expect(conto.id).toBe('ord1')
    expect(incasso).toMatchObject({ amount: 8, method: 'banco' })
    expect(incasso.items.map((i) => i.name)).toEqual(['Gin Tonic'])
    // E lo scontrino di chiusura NON esce: il conto è ancora aperto.
    expect(printScontrino).not.toHaveBeenCalled()
  })

  // QUANDO L'INCASSO CHIUDE IL CONTO IL TASTO NON SPARISCE, si spegne e
  // dice perché. La schermata si apre con tutto selezionato — cioè
  // chiudendo — e farlo comparire e sparire a ogni riga toccata farebbe
  // ballare tutta la riga dei tasti mentre si divide il conto.
  it('se l’incasso salda tutto, il tasto è spento e spiega perché', async () => {
    const user = userEvent.setup()
    mount(baseOrder(), conTasto)
    const tasto = screen.getByRole('button', { name: /Acconto con scontrino/ })
    expect(tasto).toHaveClass('spento')
    expect(tasto).toHaveAttribute('aria-disabled', 'true')
    await user.click(tasto)
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/salda il conto/))
    // Non ha incassato niente: un tasto spento non muove i soldi.
    expect(registerPayment).not.toHaveBeenCalled()
    expect(printScontrinoAcconto).not.toHaveBeenCalled()
  })

  it('e si riaccende appena si toglie una riga dalla riscossione', async () => {
    const user = userEvent.setup()
    mount(baseOrder(), conTasto)
    await riscuotiUnaRigaSola(user)
    const tasto = screen.getByRole('button', { name: /Acconto con scontrino/ })
    expect(tasto).not.toHaveClass('spento')
    expect(tasto).not.toHaveAttribute('aria-disabled')
  })

  it('l’automatico stampa senza premere niente di speciale', async () => {
    const user = userEvent.setup()
    mount(baseOrder(), sempre)
    // …e il terzo tasto non c'è: con l'automatico acceso sarebbe una
    // seconda strada per lo stesso foglio (mutua esclusione).
    expect(screen.queryByRole('button', { name: /Acconto con scontrino/ })).toBeNull()
    await riscuotiUnaRigaSola(user)
    await user.click(screen.getByRole('button', { name: /^Riscuotere/ }))
    await waitFor(() => expect(printScontrinoAcconto).toHaveBeenCalled())
    expect(printScontrinoAcconto.mock.calls.at(-1)[1]).toMatchObject({ amount: 8 })
  })

  it('l’automatico tace quando l’incasso chiude: lì esce lo scontrino', async () => {
    const user = userEvent.setup()
    mount(baseOrder(), sempre)
    await user.click(screen.getByRole('button', { name: /^Riscuotere/ }))
    await waitFor(() => expect(printScontrino).toHaveBeenCalled())
    expect(printScontrinoAcconto).not.toHaveBeenCalled()
  })

  it('«Riscuoti (senza stampa)» tace anche sull’acconto', async () => {
    // Il gesto dice che carta non se ne vuole: vale per qualunque carta.
    const user = userEvent.setup()
    mount(baseOrder(), { ...sempre, riscuoti_senza_stampa: true })
    await riscuotiUnaRigaSola(user)
    await user.click(screen.getByRole('button', { name: /senza stampa/ }))
    await waitFor(() => expect(registerPayment).toHaveBeenCalled())
    expect(printScontrinoAcconto).not.toHaveBeenCalled()
  })

  it('col terminale che non stampa da sé, l’automatico tace e il tasto no', async () => {
    // L'automatico è carta che esce DA SOLA e segue l'interruttore del
    // terminale; il terzo tasto è un gesto esplicito e stampa comunque,
    // come fa «Preconto».
    const user = userEvent.setup()
    loadPrinterSettings.mockReturnValue({ autoPrintScontrino: false })
    mount(baseOrder(), sempre)
    await riscuotiUnaRigaSola(user)
    await user.click(screen.getByRole('button', { name: /^Riscuotere/ }))
    await waitFor(() => expect(registerPayment).toHaveBeenCalled())
    expect(printScontrinoAcconto).not.toHaveBeenCalled()
    cleanup()
    vi.clearAllMocks()

    mount(baseOrder(), conTasto)
    await riscuotiUnaRigaSola(user)
    await user.click(screen.getByRole('button', { name: /Acconto con scontrino/ }))
    await waitFor(() => expect(printScontrinoAcconto).toHaveBeenCalled())
  })

  // Se la carta non esce lo si dice e basta: l'incasso è registrato lo
  // stesso, e ristampare un acconto è un gesto — non c'è nessuna pretesa
  // da restituire, perché l'acconto non ne prende nessuna (REQ-STAMPA-001
  // e BUG-047 restano solo dello scontrino di chiusura).
  it('stampa fallita: l’incasso resta, e si dice che la carta non è uscita', async () => {
    const user = userEvent.setup()
    const onError = vi.fn()
    printScontrinoAcconto.mockRejectedValueOnce(new Error('stampante spenta'))
    render(
      <PaymentScreen
        order={baseOrder()}
        settings={conTasto}
        onClose={vi.fn()}
        onBeforePay={vi.fn()}
        onError={onError}
      />
    )
    await riscuotiUnaRigaSola(user)
    await user.click(screen.getByRole('button', { name: /Acconto con scontrino/ }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/acconto/i)))
    expect(registerPayment).toHaveBeenCalled()
    expect(releaseReceiptPrint).not.toHaveBeenCalled()
  })
})

// ── LE DUE VIE ALTERNATIVE STANNO IN RIGA, NON IMPILATE ────────────
//
// «I tasti "riscuoti senza stampa" e "riscuoti e servi" mettili
// affiancati, non uno sopra l'altro» (l'utente, 21/08/2026, con lo
// screenshot). Sotto il tastierino c'erano tre tasti in colonna: il
// grande e le due eccezioni, che a colpo d'occhio sembravano una scala.
//
// Il tasto grande resta da solo a tutta larghezza — è il gesto normale.
// Le due eccezioni finiscono dentro `.payscreen-collect-alt`, che le mette
// in riga. QUI si prova la STRUTTURA (chi sta dentro cosa): che siano
// larghe metà e metà, o a capo su un telefono, lo dice il foglio di stile
// — jsdom non fa layout, e quel pezzo lo sorveglia tests/unit/css.test.js.
describe('«senza stampa» e «riscuoti e servi» stanno affiancati', () => {
  const riga = () => document.querySelector('.payscreen-collect-alt')

  it('accese tutte e due: stessa riga, e il tasto grande resta fuori', () => {
    mount(conComandaDaServire(), {
      ...noReader,
      riscuoti_senza_stampa: true,
      riscuoti_e_servi: true,
    })
    const r = riga()
    expect(r).not.toBeNull()
    expect(within(r).getByRole('button', { name: /senza stampa/ })).toBeInTheDocument()
    expect(within(r).getByRole('button', { name: /Riscuoti e servi/ })).toBeInTheDocument()
    // Il gesto principale NON è finito in riga con le eccezioni: sta sopra,
    // da solo, a tutta larghezza.
    expect(within(r).queryByRole('button', { name: /^Riscuotere/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Riscuotere/ })).toBeInTheDocument()
  })

  it('accesa una sola: nella riga c’è quel tasto e basta', () => {
    // Le due condizioni sono indipendenti: capita spesso di averne una
    // sola. La riga non deve restare mezza vuota — ci pensa il flex-grow.
    mount(conComandaDaServire(), { ...noReader, riscuoti_senza_stampa: true })
    expect(riga().children).toHaveLength(1)
    expect(within(riga()).getByRole('button', { name: /senza stampa/ })).toBeInTheDocument()
    cleanup()

    mount(conComandaDaServire(), { ...noReader, riscuoti_e_servi: true })
    expect(riga().children).toHaveLength(1)
    expect(within(riga()).getByRole('button', { name: /Riscuoti e servi/ })).toBeInTheDocument()
  })

  it('spente tutte e due: la riga non esiste proprio', () => {
    // Un contenitore vuoto avrebbe lasciato la sua aria sotto al tasto
    // grande: uno spazio che non spiega niente.
    mount(conComandaDaServire())
    expect(riga()).toBeNull()
  })

  // ── E DA TRE IN SU ──────────────────────────────────────────────
  // Col terzo tasto («Acconto con scontrino») la riga può ospitarne tre.
  // La regola del foglio di stile non cambia — ogni tasto non scende sotto
  // i 200px e a capo ci va da sé — quindi qui si guarda solo che stiano
  // tutti e tre DENTRO la riga, e che il tasto grande resti fuori.
  it('accesi tutti e tre: stessa riga, e il tasto grande resta fuori', () => {
    mount(conComandaDaServire(), {
      ...noReader,
      riscuoti_senza_stampa: true,
      riscuoti_e_servi: true,
      scontrino_acconto_tasto: true,
    })
    const r = riga()
    expect(r.children).toHaveLength(3)
    expect(within(r).getByRole('button', { name: /senza stampa/ })).toBeInTheDocument()
    expect(within(r).getByRole('button', { name: /Acconto con scontrino/ })).toBeInTheDocument()
    expect(within(r).getByRole('button', { name: /Riscuoti e servi/ })).toBeInTheDocument()
    expect(within(r).queryByRole('button', { name: /^Riscuotere/ })).toBeNull()
  })

  it('col solo acconto acceso la riga esiste e ha quel tasto e basta', () => {
    mount(conComandaDaServire(), { ...noReader, scontrino_acconto_tasto: true })
    expect(riga().children).toHaveLength(1)
    expect(within(riga()).getByRole('button', { name: /Acconto con scontrino/ })).toBeInTheDocument()
  })

  it('col servizio spento resta solo «senza stampa», e prende tutta la riga', () => {
    // Senza i passi del servizio «servire» non esiste: incassare serve già
    // tutto, e il tasto in più direbbe la stessa cosa del grande.
    mount(conComandaDaServire(), {
      ...noReader,
      workflow_enabled: false,
      riscuoti_senza_stampa: true,
      riscuoti_e_servi: true,
    })
    expect(riga().children).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Riscuoti e servi/ })).toBeNull()
  })
})

// ── LO SCONTO SEGUE QUELLO CHE SI STA RISCUOTENDO ────────────────────
//
// «Se tolgo prodotti dalla schermata pagamento, lo sconto va applicato solo
// sui prodotti che sto riscuotendo. Quindi gli sconti poi si accumulano nello
// scontrino» (l'utente, 20/08/2026). Prima lo sconto era uno solo, deciso sul
// totale del conto e poi ripartito in proporzione su chi pagava la sua parte:
// chi offriva due birre a un amico si vedeva scontare una fetta di tutto il
// tavolo, e la cifra non tornava con niente.
describe('lo sconto cade sulle righe selezionate', () => {
  // Conto da 22 (2 Mojito da 7 + un Gin Tonic da 8). Si parte separati
  // (REQ-PAG-009), quindi ogni Mojito ha il suo tasto.
  const togliUnMojito = async (user) =>
    user.click(screen.getAllByRole('button', { name: /Togli Mojito dal pagamento/ })[0])

  it('l’anteprima è sul lordo delle righe scelte, non sul conto', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await togliUnMojito(user) // restano un Mojito e un Gin Tonic: 15 €
    await user.click(screen.getByRole('button', { name: /Sconto/ }))
    const modal = within(screen.getByRole('dialog', { name: 'Sconto' }))
    await user.click(modal.getByRole('button', { name: '1' }))
    await user.click(modal.getByRole('button', { name: '0' }))
    expect(modal.getByText(/Sconto su quello che stai riscuotendo: −/)).toHaveTextContent('1,50 €')
  })

  it('applicandolo, resta scritto SU QUALI righe cade', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await togliUnMojito(user)
    await user.click(screen.getByRole('button', { name: /Sconto/ }))
    const modal = within(screen.getByRole('dialog', { name: 'Sconto' }))
    await user.click(modal.getByRole('button', { name: '1' }))
    await user.click(modal.getByRole('button', { name: '0' }))
    await user.click(modal.getByRole('button', { name: /Applica/ }))
    // Senza le righe accanto, l'altro tablet leggerebbe 1,50 € e non saprebbe
    // di che cosa: lo sconto vale per QUESTE due righe.
    expect(setOrderDiscount).toHaveBeenCalledWith(
      'ord1',
      { type: 'percent', value: 10 },
      {
        amount: 1.5,
        items: [
          expect.objectContaining({ drink_id: 'mojito', qty: 1 }),
          expect.objectContaining({ drink_id: 'gin', qty: 1 }),
        ],
      }
    )
  })

  it('togliendo una riga lo sconto si rifà sulle righe rimaste', async () => {
    const user = userEvent.setup()
    // 10% su tutto il conto: 2,20 €.
    mount(baseOrder({ discount: { type: 'percent', value: 10 }, discount_amount: 2.2 }))
    await togliUnMojito(user)
    // Restano 15 € di righe: il 10% adesso vale 1,50 €, e si riscrive anche
    // sul conto perché la selezione vive solo qui dentro.
    await waitFor(() =>
      expect(setOrderDiscount).toHaveBeenCalledWith(
        'ord1',
        { type: 'percent', value: 10 },
        expect.objectContaining({ amount: 1.5 })
      )
    )
    expect(payAmount()).toHaveTextContent('13,50')
  })

  it('riscuotendo, lo sconto se ne va DENTRO il pagamento', async () => {
    const user = userEvent.setup()
    mount(baseOrder({ discount: { type: 'euro', value: 2 }, discount_amount: 2 }))
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    expect(registerPayment).toHaveBeenCalledWith('ord1', {
      amount: 20,
      method: 'banco',
      items: null,
      autoServe: false,
      chiude: true,
      // Un gesto, una scrittura: lo sconto viaggia con l'incasso e sul conto
      // non resta niente di preparato — il prossimo che paga parte pulito.
      sconto: { type: 'euro', value: 2, amount: 2, items: null },
    })
  })

  it('un acconto battuto a mano NON si porta via lo sconto', async () => {
    const user = userEvent.setup()
    mount(baseOrder({ discount: { type: 'euro', value: 2 }, discount_amount: 2 }))
    // Dieci euro sul tavolo: non saldano le righe scelte, quindi lo sconto
    // resta preparato per chi verrà a chiudere.
    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: '00' }))
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    expect(registerPayment).toHaveBeenCalledWith(
      'ord1',
      expect.objectContaining({ amount: 10, sconto: null })
    )
  })

  // ── DOPO IL PRIMO INCASSO, IL SECONDO SCONTO È UN ALTRO SCONTO ──────
  it('il secondo sconto si calcola su quello che resta, non sul conto intero', async () => {
    const user = userEvent.setup()
    // Il Gin Tonic è già stato riscosso a 6 € con 2 € di sconto: restano i due
    // Mojito, 14 € di listino.
    mount(
      baseOrder({
        payment_status: 'parziale',
        payments: [
          {
            id: 'p1',
            amount: 6,
            method: 'banco',
            items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }],
            sconto: {
              type: 'euro',
              value: 2,
              amount: 2,
              items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }],
            },
          },
        ],
      })
    )
    expect(payAmount()).toHaveTextContent('14,00')
    await user.click(screen.getByRole('button', { name: /Sconto/ }))
    const modal = within(screen.getByRole('dialog', { name: 'Sconto' }))
    await user.click(modal.getByRole('button', { name: '1' }))
    await user.click(modal.getByRole('button', { name: '0' }))
    // 10% di 14, non di 22: le righe già pagate se ne sono andate col cliente.
    expect(modal.getByText(/Sconto su quello che stai riscuotendo: −/)).toHaveTextContent('1,40 €')
  })

  it('e il conto elenca gli sconti uno per uno', () => {
    mount(
      baseOrder({
        payment_status: 'parziale',
        payments: [
          {
            id: 'p1',
            amount: 6,
            method: 'banco',
            items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }],
            sconto: {
              type: 'euro',
              value: 2,
              amount: 2,
              items: [{ drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }],
            },
          },
        ],
        discount: { type: 'percent', value: 10 },
        discount_amount: 1.4,
        discount_items: [{ drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 2 }],
      })
    )
    // Il primo diceva su quali righe cadeva; il secondo prende tutto quello
    // che è rimasto, quindi le righe non servono a distinguerlo — serve il
    // «10%», che è quello che chi guarda si chiede.
    expect(screen.getByText('Sconto su 1 prodotto')).toBeInTheDocument()
    expect(screen.getByText('Sconto 10%')).toBeInTheDocument()
  })
})

// ── IL PRIMO TOCCO RESTRINGE, I SUCCESSIVI AGGIUNGONO ────────────────
//
// «Quando apro la schermata del pagamento, quando clicco su una voce, anche
// solo sulla label, si devono azzerare le altre voci [...] quando apro sono
// tutte selezionate, ma se premo o la label o il più le altre voci passano a
// 0, E DIVENTANO GRIGE O DI UN COLORE PIÙ SMORTO, e quando le premo le
// aggiungo al conto che voglio riscuotere» (l'utente, 20/08/2026).
//
// Il gesto vero al banco è «di tutto questo conto, adesso mi paghi QUESTI»:
// prima ci si arrivava spegnendo a una a una tutte le righe che NON
// servivano.
describe('la selezione riparte da zero al primo tocco', () => {
  // L'etichetta è il nome del prodotto col suo prezzo: si distingue dal «−»
  // («Togli…») e dal «+» («Paga…») perché comincia col nome.
  const etichette = (nome) => screen.getAllByRole('button', { name: new RegExp(`^${nome} ·`) })

  it('toccando l’etichetta resta in riscossione solo quella voce', async () => {
    const user = userEvent.setup()
    mount(baseOrder()) // 2× Mojito (7) + Gin Tonic (8) = 22
    expect(payAmount()).toHaveTextContent('22,00')
    await user.click(etichette('Gin Tonic')[0])
    // I due Mojito sono usciti: resta il Gin Tonic e basta.
    expect(payAmount()).toHaveTextContent('8,00')
  })

  it('e le voci uscite si vedono spente, ma restano toccabili', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(etichette('Gin Tonic')[0])
    const mojito = etichette('Mojito')
    // Spente a vedersi (la classe che le smorza) e spente da leggere
    // (`aria-pressed`), ma NON disabilitate: è toccandole che si rientra.
    expect(mojito[0]).toHaveClass('spenta')
    expect(mojito[0]).toHaveAttribute('aria-pressed', 'false')
    expect(mojito[0]).not.toBeDisabled()
    expect(etichette('Gin Tonic')[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('anche il «+» vale come primo tocco, e non spegne la sua riga', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    // Prima il «+» di una riga già intera era disabilitato: con tutto
    // selezionato non c'era niente da aggiungere. Adesso è il gesto che
    // l'utente ha chiesto per dire «solo questa».
    await user.click(screen.getByRole('button', { name: 'Paga Gin Tonic' }))
    expect(payAmount()).toHaveTextContent('8,00')
  })

  it('dal secondo tocco in poi si AGGIUNGE alla riscossione', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(etichette('Gin Tonic')[0])
    expect(payAmount()).toHaveTextContent('8,00')
    // Un Mojito rientra: 8 + 7. Se il tocco azzerasse ancora, sarebbe 7,00.
    await user.click(etichette('Mojito')[0])
    expect(payAmount()).toHaveTextContent('15,00')
  })

  // Il tasto che riporta tutto dentro non sta più in fondo alla lista e non
  // si chiama più «Rimetti tutto in pagamento»: è salito in cima, accanto a
  // «separa/unisci uguali», e dice «Seleziona tutti» (Flavio, 21/08/2026).
  // Quello che fa alla regola del primo tocco non è cambiato di una virgola,
  // ed è quello che questo test continua a guardare.
  it('«Seleziona tutti» riporta a tutte, e il tocco dopo restringe di nuovo', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(etichette('Gin Tonic')[0])
    // Con una parte fuori il tasto offre ancora «Deseleziona tutti»: per
    // rimettere tutto dentro si passa da lì.
    await user.click(screen.getByRole('button', { name: /Deseleziona tutti/ }))
    await user.click(screen.getByRole('button', { name: /Seleziona tutti/ }))
    expect(payAmount()).toHaveTextContent('22,00')
    // Tornati a «tutte selezionate», la regola riparte da sé: non c'è nessun
    // interruttore da rimettere a posto.
    await user.click(etichette('Mojito')[1])
    expect(payAmount()).toHaveTextContent('7,00')
  })

  it('l’incasso copre esattamente le voci scelte', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(etichette('Gin Tonic')[0])
    await user.click(screen.getByRole('button', { name: /Riscuotere/ }))
    const [, dati] = registerPayment.mock.calls.at(-1)
    expect(dati.amount).toBe(8)
    expect(dati.items).toEqual([expect.objectContaining({ drink_id: 'gin', qty: 1 })])
  })

  // SEPARA UGUALI: stesso meccanismo sulle unità, non una seconda regola.
  it('sulle righe separate il primo tocco spegne anche le altre unità', async () => {
    const user = userEvent.setup()
    mount(baseOrder()) // si nasce separati: i due Mojito sono due unità
    await user.click(etichette('Mojito')[0])
    // Restano 7 €: l'altra unità di Mojito e il Gin Tonic sono uscite.
    expect(payAmount()).toHaveTextContent('7,00')
    expect(etichette('Mojito')[1]).toHaveAttribute('aria-pressed', 'false')
    // E si aggiunge l'altra unità con un tocco.
    await user.click(etichette('Mojito')[1])
    expect(payAmount()).toHaveTextContent('14,00')
  })

  it('nella vista unita l’etichetta prende la riga INTERA', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Unisci uguali/ }))
    // «Questo prodotto lo paga lui»: due Mojito su due, non uno.
    await user.click(etichette('Mojito')[0])
    expect(payAmount()).toHaveTextContent('14,00')
    expect(screen.getByText('2/2')).toBeInTheDocument()
  })

  it('il «−» continua a togliere come sempre, anche al primo tocco', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    // È il vecchio modo di dividere il conto — spegnere quello che non serve
    // — e chi lo usa da mesi non deve accorgersi di niente.
    await user.click(screen.getAllByRole('button', { name: /Togli Mojito dal pagamento/ })[0])
    expect(payAmount()).toHaveTextContent('15,00')
  })

  // ── L'INCASTRO CON LO SCONTO GIÀ PREPARATO (REQ-PAG-013) ───────────
  it('rientrando sulle righe di uno sconto preparato, il tocco AGGIUNGE', async () => {
    const user = userEvent.setup()
    // Si era preparato un 10% su un Mojito solo e si è usciti: rientrando, la
    // schermata riparte da quelle righe. Quella NON è una selezione piena,
    // quindi non è vergine: un tocco non deve buttare via lo sconto che
    // qualcuno aveva deciso.
    mount(
      baseOrder({
        discount: { type: 'percent', value: 10 },
        discount_amount: 0.7,
        discount_items: [
          { key: 'mojito#0', drink_id: 'mojito', name: 'Mojito', unit_price: 7, qty: 1 },
        ],
      })
    )
    expect(payAmount()).toHaveTextContent('6,30') // 7 − 10%
    await user.click(etichette('Gin Tonic')[0])
    // Il Mojito è rimasto dentro insieme al Gin Tonic: 15 − 10%.
    expect(payAmount()).toHaveTextContent('13,50')
    await waitFor(() =>
      expect(setOrderDiscount).toHaveBeenCalledWith(
        'ord1',
        { type: 'percent', value: 10 },
        expect.objectContaining({
          amount: 1.5,
          items: [
            expect.objectContaining({ drink_id: 'mojito', qty: 1 }),
            expect.objectContaining({ drink_id: 'gin', qty: 1 }),
          ],
        })
      )
    )
  })

  it('con lo sconto su TUTTO il conto, il primo tocco lo porta sulla riga scelta', async () => {
    const user = userEvent.setup()
    // Sconto su tutto = selezione piena = vergine: qui il tocco restringe, e
    // lo sconto lo segue, che è quello che dice REQ-PAG-013.
    mount(baseOrder({ discount: { type: 'percent', value: 10 }, discount_amount: 2.2 }))
    await user.click(etichette('Gin Tonic')[0])
    expect(payAmount()).toHaveTextContent('7,20') // 8 − 10%
    await waitFor(() =>
      expect(setOrderDiscount).toHaveBeenCalledWith(
        'ord1',
        { type: 'percent', value: 10 },
        expect.objectContaining({ amount: 0.8 })
      )
    )
  })
})

// ── «DESELEZIONA TUTTI» / «SELEZIONA TUTTI» ──────────────────────────
//
// «Immagina un conto con venti prodotti sopra: ne deve pagare uno solo, io
// devo togliere la spunta a venti voci. Invece così premo un solo tasto, si
// deselezionano tutti, e seleziono poi io. Quindi così come c'è unisci uguali
// e separa uguali, si crea quest'altro tasto che deseleziona tutti e
// seleziona tutti» (Flavio, 21/08/2026, registrazione vocale).
describe('il tasto che porta la selezione tutta dentro o tutta fuori', () => {
  const etichette = (nome) => screen.getAllByRole('button', { name: new RegExp(`^${nome} ·`) })
  const comando = () => screen.getByRole('button', { name: /eleziona tutti/ })

  it('sta in cima, nella stessa riga di «separa/unisci uguali»', () => {
    mount(baseOrder())
    // La riga dei comandi è una sola: chi incassa li trova insieme, sopra le
    // voci, invece di cercarne uno in fondo alla lista.
    const riga = comando().closest('.payscreen-comandi')
    expect(riga).not.toBeNull()
    expect(within(riga).getByRole('button', { name: /Unisci uguali/ })).toBeInTheDocument()
  })

  it('a conto pieno dice «Deseleziona tutti» e porta tutto a zero', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    expect(comando()).toHaveTextContent('Deseleziona tutti')
    await user.click(comando())
    expect(payAmount()).toHaveTextContent('0,00')
    // Tutte le voci fuori: smorte, ma toccabili — è toccandole che rientrano.
    for (const e of [...etichette('Mojito'), ...etichette('Gin Tonic')]) {
      expect(e).toHaveAttribute('aria-pressed', 'false')
      expect(e).not.toBeDisabled()
    }
  })

  it('a zero cambia scritta in «Seleziona tutti» e rimette tutto dentro', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(comando())
    expect(comando()).toHaveTextContent('Seleziona tutti')
    await user.click(comando())
    expect(payAmount()).toHaveTextContent('22,00')
    expect(comando()).toHaveTextContent('Deseleziona tutti')
  })

  it('con una parte fuori dice ancora «Deseleziona tutti»', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(etichette('Gin Tonic')[0]) // resta solo il Gin Tonic
    expect(payAmount()).toHaveTextContent('8,00')
    // È il gesto che serve: si riparte da zero e si rimette dentro quello che
    // il cliente sta pagando — il motivo per cui questo tasto esiste.
    expect(comando()).toHaveTextContent('Deseleziona tutti')
  })

  // L'INCASTRO CON LA REGOLA DEL PRIMO TOCCO (REQ-PAG-009), che non è
  // cambiata: dopo l'azzeramento la selezione non è più piena, quindi il
  // tocco AGGIUNGE — «man mano mi metto il più uno, più due».
  it('dopo l’azzeramento il tocco su una voce AGGIUNGE, non azzera le altre', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(comando())
    await user.click(etichette('Gin Tonic')[0])
    expect(payAmount()).toHaveTextContent('8,00')
    await user.click(etichette('Mojito')[0])
    expect(payAmount()).toHaveTextContent('15,00') // 8 + 7, non 7
    await user.click(etichette('Mojito')[1])
    expect(payAmount()).toHaveTextContent('22,00')
  })

  it('vale anche in «separa uguali», dove le righe sono unità singole', async () => {
    const user = userEvent.setup()
    mount(baseOrder()) // si nasce separati: i due Mojito sono due unità
    await user.click(comando())
    // Anche le UNITÀ si spengono: il conteggio a zero senza le unità lasciava
    // le caselle accese, e il «−» di una unità spenta sarebbe restato vivo.
    // Tre voci a zero: le due unità di Mojito e il Gin Tonic.
    expect(screen.getAllByText('0/1')).toHaveLength(3)
    await user.click(etichette('Mojito')[1])
    expect(payAmount()).toHaveTextContent('7,00')
    expect(etichette('Mojito')[0]).toHaveAttribute('aria-pressed', 'false')
    expect(etichette('Mojito')[1]).toHaveAttribute('aria-pressed', 'true')
  })

  it('e nella vista unita porta la riga intera dentro o fuori', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(screen.getByRole('button', { name: /Unisci uguali/ }))
    await user.click(comando())
    expect(screen.getByText('0/2')).toBeInTheDocument()
    await user.click(comando())
    expect(screen.getByText('2/2')).toBeInTheDocument()
  })
})

// ── CON ZERO RIGHE SCELTE ────────────────────────────────────────────
//
// Prima ci si arrivava solo spegnendo una riga per volta; adesso è il punto
// di partenza normale di ogni conto diviso, quindi va retto bene.
describe('la schermata con niente selezionato', () => {
  const etichette = (nome) => screen.getAllByRole('button', { name: new RegExp(`^${nome} ·`) })
  const comando = () => screen.getByRole('button', { name: /eleziona tutti/ })

  it('propone zero, lo dice, e non lascia incassare', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(comando())
    expect(payAmount()).toHaveTextContent('0,00')
    expect(screen.getByText('NESSUNA RIGA SCELTA')).toBeInTheDocument()
    expect(screen.getByText(/Nessuna riga scelta: tocca le voci/)).toBeInTheDocument()
    // Un incasso «a caso» da qui non deve poter partire.
    expect(screen.getByRole('button', { name: /Riscuotere/ })).toBeDisabled()
  })

  it('ma il tastierino resta una strada buona per un importo a mano', async () => {
    const user = userEvent.setup()
    mount(baseOrder())
    await user.click(comando())
    // 10,00 € battuti a mano: è un acconto, e si incassa.
    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: '00' }))
    expect(payAmount()).toHaveTextContent('10,00')
    const riscuoti = screen.getByRole('button', { name: /Riscuotere/ })
    expect(riscuoti).not.toBeDisabled()
    await user.click(riscuoti)
    expect(registerPayment).toHaveBeenCalledWith(
      'ord1',
      expect.objectContaining({ amount: 10, items: null })
    )
  })

  // LO SCONTO PREPARATO RESTA SOSPESO. Azzerandolo si perderebbe un gesto già
  // fatto; allargandolo a tutto il conto si scontrerebbe con chi l'aveva
  // deciso su tre voci. Resta dov'è finché non si sceglie su cosa cade.
  it('lascia lo sconto già preparato dov’è, senza allargarlo a tutto il conto', async () => {
    const user = userEvent.setup()
    mount(
      baseOrder({
        discount: { type: 'euro', value: 2 },
        discount_amount: 2,
        discount_items: [{ key: 'gin#1', drink_id: 'gin', name: 'Gin Tonic', unit_price: 8, qty: 1 }],
      })
    )
    await user.click(comando())
    expect(payAmount()).toHaveTextContent('0,00')
    // Nessuna riscrittura sul conto: lo sconto non è stato toccato.
    expect(setOrderDiscount).not.toHaveBeenCalled()
    expect(screen.getByText('Sconto su 1 prodotto')).toBeInTheDocument()
    // E appena si sceglie una voce, torna a seguire la selezione (REQ-PAG-013).
    await user.click(etichette('Mojito')[0])
    await waitFor(() =>
      expect(setOrderDiscount).toHaveBeenCalledWith(
        'ord1',
        { type: 'euro', value: 2 },
        expect.objectContaining({
          amount: 2,
          items: [expect.objectContaining({ drink_id: 'mojito', qty: 1 })],
        })
      )
    )
  })
})


// «RENDI RIDIMENSIONABILI LE TRE COLONNE DELLA SCHERMATA PAGAMENTO come lo
// sono quelle nel dettaglio dell'ordine» (l'utente, 21/08/2026). Stesso
// attrezzo del POS (useResizable), quindi qui non si riprova come si arma
// una maniglia col dito — c'è tests/unit/useResizable.test.js: si prova che
// le maniglie CI SIANO, che muovano la colonna giusta nel verso giusto, che
// i limiti tengano e che la misura resti scritta per questo terminale.
describe('le tre colonne del pagamento si trascinano', () => {
  const corpo = () => document.querySelector('.payscreen-body')
  const larghezza = (nome) => corpo().style.getPropertyValue(nome)
  // Col mouse la maniglia prende subito: niente pressione lunga da simulare.
  const trascina = (maniglia, da, a) => {
    fireEvent.pointerDown(maniglia, { pointerType: 'mouse', pointerId: 1, clientX: da })
    fireEvent.pointerMove(maniglia, { pointerType: 'mouse', pointerId: 1, clientX: a })
    fireEvent.pointerUp(maniglia, { pointerType: 'mouse', pointerId: 1, clientX: a })
  }

  beforeEach(() => localStorage.clear())

  it('fra una colonna e l’altra c’è una maniglia, e sono due', () => {
    mount(baseOrder())
    const m = screen.getAllByRole('separator')
    expect(m).toHaveLength(2)
    for (const h of m) expect(h).toHaveAttribute('aria-orientation', 'vertical')
    // Sul telefono le colonne sono impilate e le maniglie spariscono: lo fa
    // il foglio (sotto gli 800px), e la prova sta in tests/unit/css.test.js —
    // qui non c'è impaginazione da guardare.
  })

  it('trascinare la maniglia di sinistra allarga le voci, quella di destra i metodi', () => {
    mount(baseOrder())
    const [voci, metodi] = screen.getAllByRole('separator')
    expect(larghezza('--pay-items-w')).toBe('340px')
    expect(larghezza('--pay-methods-w')).toBe('230px')
    trascina(voci, 500, 560) // verso destra: la colonna di sinistra cresce
    expect(larghezza('--pay-items-w')).toBe('400px')
    trascina(metodi, 900, 840) // verso sinistra: la colonna di destra cresce
    expect(larghezza('--pay-methods-w')).toBe('290px')
  })

  // I METODI NON DEVONO POTER SPARIRE: lì ci sono i tasti con cui si sceglie
  // come si incassa, e una colonna trascinata a zero è un pezzo di cassa che
  // non si trova più. Le voci hanno il loro pavimento per un altro motivo:
  // sotto i 200px il prezzo va a capo sotto il nome e la lista smette di
  // leggersi in colonna.
  it('nessuna delle due si può stringere fino a sparire', () => {
    mount(baseOrder())
    const [voci, metodi] = screen.getAllByRole('separator')
    trascina(metodi, 900, 9000) // tutta a destra: i metodi si stringono
    expect(Number.parseInt(larghezza('--pay-methods-w'), 10)).toBeGreaterThanOrEqual(170)
    trascina(voci, 500, -9000) // tutta a sinistra: le voci si stringono
    expect(Number.parseInt(larghezza('--pay-items-w'), 10)).toBeGreaterThanOrEqual(200)
  })

  // PER TERMINALE, non per conto e non per utente: il tablet del banco e
  // quello della sala hanno schermi e mestieri diversi — al banco si guarda
  // il tastierino, in sala la lista delle voci. Chi ha sistemato le colonne
  // una volta le ritrova così alla riapertura, non ogni sera da capo.
  it('la misura scelta si ritrova riaprendo la schermata', () => {
    mount(baseOrder())
    trascina(screen.getAllByRole('separator')[0], 500, 560)
    expect(larghezza('--pay-items-w')).toBe('400px')
    cleanup()
    mount(baseOrder())
    expect(larghezza('--pay-items-w')).toBe('400px')
  })
})

// ── LA FATTURA AL CLIENTE È PREMIUM (REQ-LIC-001) ────────────────────
// Chiesto dall'utente il 26/08/2026: col modulo spento sparisce la voce
// «Fatture» dal gestionale e il tasto «Invia fattura» da qui. Il tasto è
// l'UNICA porta della modale, quindi toglierlo chiude tutto il flusso.
describe('il tasto «Invia fattura» è una funzione premium', () => {
  it('col modulo non incluso il tasto non c’è, e gli altri due restano', () => {
    mount(baseOrder())
    expect(screen.queryByRole('button', { name: /Invia fattura/ })).toBeNull()
    // Gli altri due della riga non si toccano.
    expect(screen.getByRole('button', { name: /Codice Lotteria/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Preconto/ })).toBeInTheDocument()
  })

  it('col modulo incluso il tasto c’è e apre la modale', async () => {
    const user = userEvent.setup()
    mount(baseOrder(), conFatture)
    await user.click(screen.getByRole('button', { name: /Invia fattura/ }))
    expect(screen.getByRole('dialog', { name: 'Invia fattura' })).toBeInTheDocument()
  })

  it('un conto che una fattura ce l’ha già non la perde: il numero resta sul conto', async () => {
    // Spegnere NASCONDE, non cancella. Col modulo spento il numero non si
    // vede — non c'è nessuna schermata che lo mostri — ma è ancora scritto
    // sull'ordine, e torna a vedersi appena il modulo si riaccende.
    const user = userEvent.setup()
    const conto = { ...baseOrder(), invoice_number: 7 }
    const spento = mount(conto)
    expect(screen.queryByRole('button', { name: /Invia fattura/ })).toBeNull()
    spento.unmount()

    mount(conto, conFatture)
    const tasto = screen.getByRole('button', { name: /Invia fattura/ })
    expect(tasto).toHaveTextContent('✓')
    await user.click(tasto)
    expect(screen.getByText(/risulta già emessa la fattura n\./)).toBeInTheDocument()
  })
})
