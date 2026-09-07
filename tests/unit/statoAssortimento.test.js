'use strict'

// ── «IN ASSORTIMENTO» È DI PASSAGGIO, E IL PRODOTTO RICORDA DA DOVE VIENE
//
// REQ-MAG-037. Questa è la parte che, se sbagliata, fa danni silenziosi sui
// dati veri: un premium che torna indietro come prodotto qualunque non dà
// nessun errore a schermo, e la classificazione di Flavio si cancella da
// sola, un ordine per volta, su tutto il magazzino.
//
// I casi qui sotto sono le parole dell'utente del 27/08/2026, una per una.

import { describe, it, expect } from 'vitest'
import {
  IN_ASSORTIMENTO,
  cambioAMano,
  cambioDaAvvisare,
  entraInAssortimento,
  esceDaAssortimento,
  inAssortimentoAMano,
  inAssortimentoConOrdine,
  ordiniDiAssortimento,
  statoDaRestituire,
} from '../../src/lib/statoAssortimento.js'

const premium = { id: 'rum', status: 'premium' }
const linea = { id: 'campari', status: 'linea' }
const fuori = { id: 'amaro', status: 'out' }
// Il default storico: 'assortimento' senza niente dietro. Sono la metà del
// magazzino vero, ed è il caso che non deve rompere niente.
const vecchio = { id: 'gin', status: 'assortimento' }

describe('si entra solo alla conferma dell’ordine', () => {
  it('un premium ci passa e si ricorda di essere premium', () => {
    expect(entraInAssortimento(premium, 'po-1')).toEqual({
      status: IN_ASSORTIMENTO,
      assortimento_da: 'premium',
      ordini_assortimento: ['po-1'],
    })
  })

  it('un in linea ci passa e si ricorda di essere in linea', () => {
    expect(entraInAssortimento(linea, 'po-1')).toMatchObject({
      status: IN_ASSORTIMENTO,
      assortimento_da: 'linea',
    })
  })

  // «Il prodotto DEVE essere in linea o premium per poter passare allo stato
  // in assortimento»: un out è fuori linea e non lo si sta rifornendo.
  it('un fuori linea non ci passa', () => {
    expect(entraInAssortimento(fuori, 'po-1')).toBeNull()
  })

  // Niente ordine, niente passaggio: non la giacenza sotto soglia, non la
  // spunta in tabella, non l'aver aperto la schermata.
  it('senza un ordine non succede niente', () => {
    expect(entraInAssortimento(premium, null)).toBeNull()
  })

  it('lo stesso ordine due volte non scrive due volte', () => {
    const dentro = { ...premium, status: IN_ASSORTIMENTO, assortimento_da: 'premium', ordini_assortimento: ['po-1'] }
    expect(entraInAssortimento(dentro, 'po-1')).toBeNull()
  })

  // Due giri diversi, due ordini aperti sullo stesso prodotto: la memoria di
  // partenza è una sola e non si riscrive.
  it('un secondo ordine si aggiunge senza toccare la memoria', () => {
    const dentro = { ...premium, status: IN_ASSORTIMENTO, assortimento_da: 'premium', ordini_assortimento: ['po-1'] }
    expect(entraInAssortimento(dentro, 'po-2')).toEqual({ ordini_assortimento: ['po-1', 'po-2'] })
  })

  // Il default storico non ha uno stato di prima: si segna l'ordine e basta,
  // senza inventargli una classificazione che nessuno gli ha dato.
  it('sul vecchio default si segna solo l’ordine', () => {
    expect(entraInAssortimento(vecchio, 'po-1')).toEqual({ ordini_assortimento: ['po-1'] })
  })
})

describe('si esce per due sole strade, e si torna allo stato di prima', () => {
  const dentro = {
    ...premium,
    status: IN_ASSORTIMENTO,
    assortimento_da: 'premium',
    ordini_assortimento: ['po-1'],
  }

  it('l’ordine arrivato restituisce il premium', () => {
    expect(esceDaAssortimento(dentro, 'po-1')).toEqual({
      status: 'premium',
      assortimento_da: null,
      ordini_assortimento: [],
    })
  })

  // «Torna in linea o premium ma con scorte in esaurimento»: la giacenza non
  // c'entra, sono due assi diversi. Qui il prodotto esce con la memoria che
  // ha, e nessuno gli chiede quanto ne è rimasto.
  it('torna allo stato di prima anche se la memoria dice «in linea»', () => {
    const inLinea = { ...dentro, assortimento_da: 'linea' }
    expect(esceDaAssortimento(inLinea, 'po-1')).toMatchObject({ status: 'linea' })
  })

  it('con un altro ordine ancora aperto non esce', () => {
    const due = { ...dentro, ordini_assortimento: ['po-1', 'po-2'] }
    expect(esceDaAssortimento(due, 'po-1')).toEqual({ ordini_assortimento: ['po-2'] })
  })

  it('un ordine che non lo teneva dentro non cambia niente', () => {
    expect(esceDaAssortimento(dentro, 'po-9')).toBeNull()
  })

  // SE LA MEMORIA MANCA NON SI INVENTA NIENTE: il prodotto resta dov'è e i
  // campi si liberano. Meglio fermo che promosso a caso.
  it('senza memoria lo stato resta quello che è', () => {
    const senza = { ...vecchio, ordini_assortimento: ['po-1'] }
    expect(esceDaAssortimento(senza, 'po-1')).toEqual({
      assortimento_da: null,
      ordini_assortimento: [],
    })
  })

  // Memoria scritta male (un valore che non è uno stato): stessa prudenza.
  it('con una memoria incoerente non promuove niente', () => {
    const rotto = { ...dentro, assortimento_da: 'chissà' }
    expect(esceDaAssortimento(rotto, 'po-1')).toEqual({
      assortimento_da: null,
      ordini_assortimento: [],
    })
    expect(statoDaRestituire(rotto)).toBeNull()
  })

  // Stato già cambiato a mano nel frattempo: si liberano solo i campi.
  it('se intanto lo stato è cambiato a mano, non lo si riscrive', () => {
    const cambiato = { ...dentro, status: 'linea' }
    expect(esceDaAssortimento(cambiato, 'po-1')).toEqual({
      assortimento_da: null,
      ordini_assortimento: [],
    })
  })
})

describe('in assortimento con ordine, e senza', () => {
  it('con un ordine aperto è merce che sta arrivando', () => {
    const dentro = { ...premium, status: IN_ASSORTIMENTO, assortimento_da: 'premium', ordini_assortimento: ['po-1'] }
    expect(inAssortimentoConOrdine(dentro)).toBe(true)
    expect(inAssortimentoAMano(dentro)).toBe(false)
    expect(ordiniDiAssortimento(dentro)).toEqual(['po-1'])
  })

  it('messo a mano è «senza ordine», e si riconosce dalla memoria', () => {
    const aMano = { ...premium, status: IN_ASSORTIMENTO, assortimento_da: 'premium' }
    expect(inAssortimentoAMano(aMano)).toBe(true)
    expect(inAssortimentoConOrdine(aMano)).toBe(false)
  })

  // IL DEFAULT STORICO NON È UNA SCELTA DI FLAVIO. 'assortimento' era il
  // valore di partenza di ogni prodotto che non dichiarava niente: se
  // bastasse lo stato, mezzo magazzino risulterebbe messo a mano e si
  // ritroverebbe preselezionato al primo ordine.
  it('il vecchio default non conta come messo a mano', () => {
    expect(inAssortimentoAMano(vecchio)).toBe(false)
    expect(ordiniDiAssortimento(vecchio)).toEqual([])
  })
})

describe('a mano si può, ma costa una domanda', () => {
  it('mettercelo a mano registra da dove veniva', () => {
    expect(cambioAMano(premium, IN_ASSORTIMENTO)).toEqual({
      status: IN_ASSORTIMENTO,
      assortimento_da: 'premium',
      ordini_assortimento: [],
    })
  })

  // «Se cambia lo stato manualmente, il prodotto va eliminato dall'ordine»:
  // qui il legame si taglia, e chi chiama toglie il prodotto dagli ordini.
  it('toglierlo a mano libera la memoria e il legame con gli ordini', () => {
    const dentro = { ...premium, status: IN_ASSORTIMENTO, assortimento_da: 'premium', ordini_assortimento: ['po-1'] }
    expect(cambioAMano(dentro, 'linea')).toEqual({
      status: 'linea',
      assortimento_da: null,
      ordini_assortimento: [],
    })
    expect(cambioDaAvvisare(dentro, 'linea')).toEqual(['po-1'])
  })

  it('senza ordini aperti non c’è niente da avvisare', () => {
    expect(cambioDaAvvisare(premium, 'linea')).toBeNull()
    expect(cambioDaAvvisare({ ...premium, status: IN_ASSORTIMENTO, assortimento_da: 'premium' }, 'linea')).toBeNull()
  })

  it('lo stesso stato di prima non è un cambio', () => {
    expect(cambioAMano(premium, 'premium')).toBeNull()
    expect(cambioDaAvvisare(premium, 'premium')).toBeNull()
  })

  it('uno stato che non esiste non si scrive', () => {
    expect(cambioAMano(premium, 'chissà')).toBeNull()
  })
})
