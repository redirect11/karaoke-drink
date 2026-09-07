'use strict'

// ── PESO E FORMATI DELL'ALLEGATO (REQ-MAG-033) ───────────────────────
//
// L'utente, 20/08: «Allegare = il documento vero (foto/PDF), non solo un
// numero. Serve lo Storage; da decidere in implementazione limite di peso e
// formati».
//
// Quelle decisioni stanno in `src/lib/allegati.js` e si provano qui, senza
// browser e senza database: sono numeri e regole. Quello che questo file
// sorveglia davvero è che il limite si dica PRIMA e con parole che dicono
// cosa fare — chi allega è in piedi in magazzino con la fattura in mano.

import { describe, it, expect } from 'vitest'
import {
  PESO_MASSIMO,
  PESO_MASSIMO_SCATTO,
  allegatoDi,
  estensioneDi,
  fattureSenzaAllegato,
  haAllegato,
  percorsoAllegato,
  pesoLeggibile,
  problemaDelCaricato,
  problemaDelFile,
  tipoAllegato,
} from '../../src/lib/allegati.js'

const file = (type, size, name = 'documento') => ({ type, size, name })

describe('quali formati si allegano', () => {
  it('una foto e un PDF sono i due modi in cui arriva una fattura', () => {
    expect(tipoAllegato('image/jpeg')).toBe('immagine')
    expect(tipoAllegato('image/png')).toBe('immagine')
    expect(tipoAllegato('image/webp')).toBe('immagine')
    expect(tipoAllegato('application/pdf')).toBe('pdf')
  })

  // L'ELENCO È CHIUSO APPOSTA. Un HEIC di iPhone passerebbe da `image/*` ma
  // il canvas non lo sa decodificare: finirebbe su Storage a piena
  // dimensione e non si aprirebbe più. Meglio dirlo mentre lo si sceglie.
  it('un HEIC, un DOCX e uno ZIP non sono allegati', () => {
    expect(tipoAllegato('image/heic')).toBeNull()
    expect(tipoAllegato('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBeNull()
    expect(tipoAllegato('application/zip')).toBeNull()
    expect(tipoAllegato('')).toBeNull()
    expect(tipoAllegato(undefined)).toBeNull()
  })

  it('il rifiuto dice cosa va bene, non solo che non va', () => {
    const problema = problemaDelFile(file('image/heic', 1000))
    expect(problema).toMatch(/JPG/)
    expect(problema).toMatch(/PDF/)
  })
})

describe('il limite di peso, detto prima', () => {
  it('una foto da telefono passa senza accorgersene', () => {
    // Cinque mega è uno scatto di una fattura A4 con un telefono qualunque:
    // è IL caso normale, e non deve inciampare in nessun controllo — la
    // riduzione nel browser la porta sotto il mega.
    expect(problemaDelFile(file('image/jpeg', 5 * 1024 * 1024))).toBeNull()
  })

  // Sopra questa soglia non è più roba che venga da una fotocamera, e
  // provare ad aprirla in canvas su un telefono di tre anni fa vuol dire la
  // schermata piantata con la merce in mano.
  it('un’immagine enorme si ferma prima ancora di essere aperta', () => {
    const problema = problemaDelFile(file('image/jpeg', PESO_MASSIMO_SCATTO + 1))
    expect(problema).toMatch(/troppo grande/)
    expect(problema).toMatch(/Rifai la foto/)
  })

  // Il PDF non si tocca — ricomprimerlo rovinerebbe il testo, che è
  // esattamente la cosa da leggere — quindi per lui il limite è subito
  // quello finale, e la frase dice come cavarsela.
  it('un PDF oltre il limite lo dice subito, col numero e con la via d’uscita', () => {
    const problema = problemaDelFile(file('application/pdf', PESO_MASSIMO + 1))
    expect(problema).toMatch(/8 MB/)
    expect(problema).toMatch(/solo le pagine che servono/)
  })

  it('un PDF di fattura normale passa', () => {
    expect(problemaDelFile(file('application/pdf', 400 * 1024))).toBeNull()
  })

  it('senza file non si va avanti', () => {
    expect(problemaDelFile(null)).toBeTruthy()
  })
})

describe('il controllo dopo la riduzione', () => {
  // La riduzione può NON riuscire: un’immagine che il browser non
  // decodifica torna com’era. Senza questo secondo controllo il rifiuto
  // arriverebbe dalla regola di Storage, con un errore che non spiega niente
  // a nessuno.
  it('quello che resta pesante si ferma qui, non su Storage', () => {
    expect(problemaDelCaricato(400 * 1024)).toBeNull()
    expect(problemaDelCaricato(PESO_MASSIMO)).toBeNull()
    expect(problemaDelCaricato(PESO_MASSIMO + 1)).toMatch(/troppo pesante/)
  })
})

describe('dove finisce il file', () => {
  // Il nome si fa col TIPO e non con quello che c’era scritto: dopo la
  // riduzione il file È un JPEG anche se si chiamava `.png`, e un nome
  // sbagliato vuol dire un allegato che non si apre.
  it('l’estensione la decide il tipo, non il nome di partenza', () => {
    expect(estensioneDi('image/jpeg')).toBe('jpg')
    expect(estensioneDi('image/png')).toBe('png')
    expect(estensioneDi('application/pdf')).toBe('pdf')
  })

  it('sta nella cartella della sua fattura', () => {
    expect(percorsoAllegato('inv-1', 'application/pdf', 1000, 0.5)).toBe('fatture/inv-1/1000-500000.pdf')
  })

  // Due terminali che allegano nello stesso secondo non si sovrascrivono:
  // il secondo file non deve cancellare il primo prima ancora che qualcuno
  // se ne accorga.
  it('due allegati dello stesso istante non finiscono sullo stesso nome', () => {
    const a = percorsoAllegato('inv-1', 'image/jpeg', 1000, 0.1)
    const b = percorsoAllegato('inv-1', 'image/jpeg', 1000, 0.9)
    expect(a).not.toBe(b)
  })
})

describe('chi ha la carta e chi no', () => {
  const conAllegato = { id: 'a', attachment: { url: 'https://x/1.jpg', path: 'fatture/a/1.jpg' } }
  const senza = { id: 'b' }

  // Una fattura registrata prima di questa voce non ha il campo, e non è un
  // errore: è la normalità di tutte quelle già in archivio.
  it('una fattura vecchia non ha allegato, e non esplode', () => {
    expect(allegatoDi(senza)).toBeNull()
    expect(allegatoDi(null)).toBeNull()
    expect(haAllegato(senza)).toBe(false)
  })

  // Mezza scheda non è un allegato: senza percorso non si potrebbe più
  // cancellare, senza URL non si potrebbe aprire.
  it('una scheda a metà vale come niente', () => {
    expect(allegatoDi({ attachment: { url: 'https://x/1.jpg' } })).toBeNull()
    expect(allegatoDi({ attachment: { path: 'fatture/a/1.jpg' } })).toBeNull()
  })

  it('il terzo buco si conta come gli altri due', () => {
    expect(fattureSenzaAllegato([conAllegato, senza]).map((f) => f.id)).toEqual(['b'])
    expect(fattureSenzaAllegato(null)).toEqual([])
  })
})

describe('il peso scritto come lo scriverebbe una persona', () => {
  it('sotto il mega si contano i kB', () => {
    expect(pesoLeggibile(312 * 1024)).toBe('312 kB')
    expect(pesoLeggibile(900)).toBe('900 byte')
  })

  // «8,0 MB» sembra il risultato di un calcolo; il limite si dice «8 MB».
  it('il decimale c’è solo dove dice qualcosa', () => {
    expect(pesoLeggibile(PESO_MASSIMO)).toBe('8 MB')
    expect(pesoLeggibile(5.3 * 1024 * 1024)).toBe('5,3 MB')
  })
})
