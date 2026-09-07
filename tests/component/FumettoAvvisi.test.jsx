// @vitest-environment happy-dom
'use strict'

// IL FUMETTO ESCE DA DOVE POI L'AVVISO SI RITROVA: la campanella. È un
// richiamo, non una finestra — sparisce da sé — e toccandolo si aprono gli
// avvisi, perché chi lo tocca vuole vedere cos'è successo.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import FumettoAvvisi from '../../src/components/FumettoAvvisi.jsx'
import { annunciaFumetto } from '../../src/lib/avvisiInApp.js'

beforeEach(() => cleanup())
afterEach(() => vi.useRealTimers())

describe('il fumetto degli avvisi', () => {
  it('non c’è finché non succede niente', () => {
    render(<FumettoAvvisi />)
    expect(screen.queryByText(/Nuovo ordine/)).toBeNull()
  })

  it('compare quando arriva un avviso', async () => {
    render(<FumettoAvvisi />)
    // L'annuncio non e' un gesto sulla pagina: e' un evento sparato da
    // fuori (notify.js), e il fumetto ci si ridisegna sopra. `act` e' il
    // modo con cui si dichiara «questo aggiorna lo stato»: senza, la
    // schermata si aggiorna fuori dal giro e il test guarda quella di prima.
    act(() => annunciaFumetto({ title: 'Nuovo ordine #7', body: '2 prodotti' }))
    expect(await screen.findByText('Nuovo ordine #7')).toBeInTheDocument()
    expect(screen.getByText('2 prodotti')).toBeInTheDocument()
  })

  it('toccandolo si aprono gli avvisi, e il fumetto se ne va', async () => {
    const user = userEvent.setup()
    const apri = vi.fn()
    render(<FumettoAvvisi onApri={apri} />)
    act(() => annunciaFumetto({ title: 'Nuovo ordine #8' }))
    await user.click(await screen.findByText('Nuovo ordine #8'))
    expect(apri).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('Nuovo ordine #8')).toBeNull())
  })

  it('sparisce da sé: è un richiamo, non una cosa da chiudere', async () => {
    vi.useFakeTimers()
    render(<FumettoAvvisi />)
    act(() => annunciaFumetto({ title: 'Nuovo ordine #9' }))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByText('Nuovo ordine #9')).toBeInTheDocument()
    // Far scorrere l'orologio fa sparire il fumetto: e' un aggiornamento
    // di stato come un altro, e va dichiarato.
    await act(() => vi.advanceTimersByTimeAsync(9000))
    expect(screen.queryByText('Nuovo ordine #9')).toBeNull()
  })
})
