// @vitest-environment happy-dom
'use strict'

// LO STORICO DELLE NOTIFICHE STA ANCHE NELLE IMPOSTAZIONI. Prima viveva
// solo dietro la campanella, in un pannello che si chiude al primo tocco
// fuori: per ritrovare l'avviso di mezz'ora fa — chi ha annullato quel
// conto, cos'era finito in magazzino — bisognava riaprirlo e scorrere un
// riquadro alto quattro righe.

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from '../helpers/router.jsx'
import '@testing-library/jest-dom/vitest'

import StoricoNotifiche from '../../src/components/StoricoNotifiche.jsx'
import { recordNotif, segnaTutteLette, svuotaArchivio } from '../../src/lib/notifyStore.js'

const mostra = () =>
  render(
    <MemoryRouter>
      <StoricoNotifiche />
    </MemoryRouter>
  )

const righe = () =>
  [...document.querySelectorAll('.storico-notifica strong')].map((e) => e.textContent)

beforeEach(() => {
  // Il registro vive nel modulo, non solo in localStorage: si svuota per
  // davvero, o una prova si porta dietro gli avvisi della precedente.
  segnaTutteLette()
  svuotaArchivio()
  localStorage.clear()
})

describe('lo storico delle notifiche nelle impostazioni', () => {
  it('mostra da leggere e già lette insieme, le ultime in cima', () => {
    recordNotif('Ordine #1 annullato', 'da Anna')
    recordNotif('Nuova versione', 'ecco cosa è cambiato', { letta: true })
    mostra()
    // A chi cerca un avviso di prima non interessa in quale delle due
    // liste sia finito: conta quando è arrivato.
    expect(righe()).toEqual(['Nuova versione', 'Ordine #1 annullato'])
  })

  it('senza niente lo dice, invece di lasciare un riquadro muto', () => {
    mostra()
    expect(screen.getByText(/Ancora nessun avviso/)).toBeInTheDocument()
  })

  it('una notifica con una destinazione è una porta: si tocca e ci porta', () => {
    recordNotif('Scorte finite', 'Rum bianco', { href: '/bar?tab=inventario' })
    mostra()
    expect(screen.getByRole('link', { name: /Scorte finite/ })).toHaveAttribute(
      'href',
      '/bar?tab=inventario'
    )
  })

  it('svuotando qui si svuota anche la campanella: è lo stesso elenco', async () => {
    const user = userEvent.setup()
    recordNotif('Nuova versione', '', { letta: true })
    mostra()
    await user.click(screen.getByRole('button', { name: /Svuota lo storico/ }))
    expect(righe()).toEqual([])
    // Quelle ancora da leggere non si buttano insieme alle altre.
    expect(screen.getByText(/Ancora nessun avviso/)).toBeInTheDocument()
  })

  it('quelle già lette si distinguono senza doverle leggere', () => {
    recordNotif('Vecchia', '', { letta: true })
    recordNotif('Nuova', '')
    mostra()
    const lette = document.querySelectorAll('.storico-notifica.letta')
    expect(lette.length).toBe(1)
    expect(lette[0].textContent).toMatch(/Vecchia/)
  })
})
