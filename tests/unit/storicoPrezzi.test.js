'use strict'

// ── LO STORICO DEI PREZZI DI LISTINO (REQ-MAG-035) ───────────────────
//
// L'utente, 27/08/2026: «se il fornitore cambia i prezzi rispetto
// all'ordine — e possiamo vederlo solo dalla fattura — I PREZZI DEL LISTINO
// VANNO ALLINEATI A QUELLI DELLA FATTURA, mantenendo lo STORICO DEI PREZZI
// per le statistiche che voleva Flavio sull'andamento dei prezzi».
//
// La riga di listino tiene UN prezzo solo: ogni aggiornamento cancella
// quello di prima, e «quanto è aumentato il Campari da gennaio» non ha dove
// leggersi. Qui si provano i conti che decidono quando una variazione va
// scritta e come si chiama la sua provenienza — un prezzo battuto a mano e
// uno preso da un documento fiscale non hanno lo stesso peso.

import { describe, it, expect } from 'vitest'
import {
  ORIGINI_PREZZO,
  ETICHETTA_ORIGINE,
  origineDi,
  idVariazionePrezzo,
  prezzoCambiato,
  variazioneDiPrezzo,
  storicoDiCoppia,
  ultimaVariazione,
  ultimeVariazioniPerArticolo,
} from '../../src/lib/storicoPrezzi.js'

const QUANDO = '2026-08-27T10:00:00.000Z'

describe('l’id di una variazione', () => {
  // Le scritture in sottofondo si RIPETONO quando falliscono (`sync.js`
  // riprova la stessa chiamata): con un id casuale il secondo tentativo
  // lascerebbe due variazioni identiche, e uno storico con i doppioni
  // racconta un'oscillazione che non c'è stata.
  it('è deterministico: coppia più istante', () => {
    expect(idVariazionePrezzo('nova', 'campari', QUANDO)).toBe(
      idVariazionePrezzo('nova', 'campari', QUANDO)
    )
    expect(idVariazionePrezzo('nova', 'campari', QUANDO)).not.toBe(
      idVariazionePrezzo('enofel', 'campari', QUANDO)
    )
  })

  it('senza coppia o senza data non c’è variazione da scrivere', () => {
    expect(idVariazionePrezzo(null, 'campari', QUANDO)).toBeNull()
    expect(idVariazionePrezzo('nova', null, QUANDO)).toBeNull()
    expect(idVariazionePrezzo('nova', 'campari', null)).toBeNull()
  })
})

describe('quando un prezzo è cambiato davvero', () => {
  it('il primo prezzo è una variazione: prima non ce n’era nessuno', () => {
    expect(prezzoCambiato(null, 12.5)).toBe(true)
  })

  // In virgola mobile 12.5 e 12.50 possono non essere lo stesso numero: lo
  // storico si riempirebbe di variazioni che nessuno ha fatto, ed è il
  // rumore che rende inutile un grafico.
  it('lo stesso prezzo scritto in due modi non è una variazione', () => {
    expect(prezzoCambiato(12.5, 12.5)).toBe(false)
    expect(prezzoCambiato('12.50', 12.5)).toBe(false)
    expect(prezzoCambiato(12.5, 12.504)).toBe(false)
  })

  it('un centesimo di differenza è una variazione', () => {
    expect(prezzoCambiato(12.5, 12.51)).toBe(true)
  })

  // Un prezzo svuotato non è un prezzo: non c'è niente da mettere su un
  // grafico, e scriverci uno zero direbbe che quel fornitore regala la merce.
  it('togliere il prezzo non si registra', () => {
    expect(prezzoCambiato(12.5, null)).toBe(false)
    expect(prezzoCambiato(12.5, '')).toBe(false)
  })
})

describe('la variazione da scrivere', () => {
  it('porta prezzo, data e da dove viene', () => {
    const v = variazioneDiPrezzo({
      supplier_id: 'nova',
      item_id: 'campari',
      price: 13,
      prezzo_prima: 12.5,
      origine: 'fattura',
      quando: QUANDO,
    })
    expect(v).toMatchObject({
      supplier_id: 'nova',
      item_id: 'campari',
      price: 13,
      previous_price: 12.5,
      origine: 'fattura',
      at: QUANDO,
    })
  })

  // Chi legge una variazione da sola deve poter dire di quanto è salita,
  // senza rimettere in fila tutta la collezione.
  it('la prima volta il prezzo di prima è null, non zero', () => {
    const v = variazioneDiPrezzo({
      supplier_id: 'nova',
      item_id: 'campari',
      price: 12.5,
      prezzo_prima: null,
      origine: 'manuale',
      quando: QUANDO,
    })
    expect(v.previous_price).toBeNull()
  })

  it('se il prezzo non è cambiato non nasce niente', () => {
    expect(
      variazioneDiPrezzo({
        supplier_id: 'nova',
        item_id: 'campari',
        price: 12.5,
        prezzo_prima: 12.5,
        quando: QUANDO,
      })
    ).toBeNull()
  })

  // Attribuire a una fattura un prezzo che non si sa da dove viene darebbe
  // peso a un dato che non ce l'ha: nel dubbio vale la più debole delle tre.
  it('un’origine sconosciuta vale «manuale»', () => {
    const v = variazioneDiPrezzo({
      supplier_id: 'nova',
      item_id: 'campari',
      price: 12.5,
      origine: 'inventata',
      quando: QUANDO,
    })
    expect(v.origine).toBe('manuale')
    expect(origineDi({ origine: 'inventata' })).toBe('manuale')
    expect(origineDi(null)).toBe('manuale')
  })

  it('le tre provenienze hanno tutte il loro nome a schermo', () => {
    for (const o of ORIGINI_PREZZO) expect(ETICHETTA_ORIGINE[o]).toBeTruthy()
    expect(ORIGINI_PREZZO).toEqual(['manuale', 'consegna', 'fattura'])
  })
})

describe('lo storico di una coppia', () => {
  const VARIAZIONI = [
    { id: 'a', supplier_id: 'nova', item_id: 'campari', price: 12, at: '2026-01-10T00:00:00.000Z', origine: 'manuale' },
    { id: 'b', supplier_id: 'nova', item_id: 'campari', price: 13, at: '2026-06-10T00:00:00.000Z', origine: 'fattura' },
    { id: 'c', supplier_id: 'enofel', item_id: 'campari', price: 11, at: '2026-07-10T00:00:00.000Z', origine: 'consegna' },
    { id: 'd', supplier_id: 'nova', item_id: 'gin', price: 30, at: '2026-05-10T00:00:00.000Z', origine: 'manuale' },
  ]

  // Lo stesso Campari da due fornitori sono due storie diverse: mescolarle
  // farebbe vedere un prezzo che scende quando invece è solo un altro
  // fornitore.
  it('tiene solo la coppia chiesta, e parte dalla più recente', () => {
    const storia = storicoDiCoppia(VARIAZIONI, 'nova', 'campari')
    expect(storia.map((v) => v.id)).toEqual(['b', 'a'])
    expect(ultimaVariazione(VARIAZIONI, 'nova', 'campari').price).toBe(13)
  })

  it('una coppia senza variazioni non ne inventa', () => {
    expect(storicoDiCoppia(VARIAZIONI, 'enofel', 'gin')).toEqual([])
    expect(ultimaVariazione(VARIAZIONI, 'enofel', 'gin')).toBeNull()
  })

  // La schermata del listino ne mostra una per riga: ripassare l'elenco
  // intero per ogni riga vorrebbe dire rileggerlo cinquanta volte.
  it('l’ultima variazione di ogni prodotto di un fornitore, in una mappa', () => {
    const mappa = ultimeVariazioniPerArticolo(VARIAZIONI, 'nova')
    expect(mappa.get('campari').id).toBe('b')
    expect(mappa.get('gin').id).toBe('d')
    expect(mappa.has('enofel')).toBe(false)
  })
})
