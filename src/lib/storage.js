import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebaseClient.js'
import {
  LATO_MASSIMO,
  QUALITA,
  percorsoAllegato,
  problemaDelCaricato,
  problemaDelFile,
  tipoAllegato,
} from './allegati.js'

// Lato massimo (px) e qualità JPEG per il ridimensionamento delle foto drink.
// Le foto scattate da smartphone pesano spesso diversi MB: le riduciamo prima
// dell'upload per risparmiare banda e spazio su Storage.
const MAX_DIM = 1200
const QUALITY = 0.82

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

// Ridimensiona l'immagine via canvas. In caso di errore (o immagine già piccola)
// restituisce il file originale, così l'upload non fallisce mai per questo.
//
// Lato e qualità si possono passare perché i due mestieri sono diversi: la
// foto di un drink è un francobollo in un menu, l'allegato di una fattura è
// una cosa che si deve poter leggere (REQ-MAG-033). Il conto è lo stesso e
// sta scritto una volta sola.
async function downscaleImage(file, { lato = MAX_DIM, qualita = QUALITY } = {}) {
  if (!file.type || !file.type.startsWith('image/')) return file
  try {
    const img = await loadImage(file)
    const scale = Math.min(1, lato / Math.max(img.width, img.height))
    if (scale >= 1) return file // già entro i limiti

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', qualita))
    return blob || file
  } catch {
    return file
  }
}

// Carica la foto di un drink su Firebase Storage e restituisce l'URL pubblico.
// Le immagini sono salvate sotto `drinks/` (lette pubblicamente, scritte solo
// da utenti autenticati — vedi storage.rules).
export async function uploadDrinkImage(file) {
  const processed = await downscaleImage(file)
  const isJpeg = (processed.type || '') === 'image/jpeg'
  const ext = isJpeg ? 'jpg' : (file.name.includes('.') ? file.name.split('.').pop() : 'img')
  const path = `drinks/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`

  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, processed, { contentType: processed.type || file.type || 'image/jpeg' })
  return getDownloadURL(storageRef)
}

// Cancella (best-effort) una foto a partire dal suo download URL.
// Non solleva eccezioni: l'eliminazione del drink non deve fallire se la foto
// è già assente o le regole lo impediscono.
export async function deleteDrinkImageByUrl(url) {
  if (!url) return
  try {
    await deleteObject(ref(storage, url))
  } catch {
    /* best effort: ignora */
  }
}

// ── L'ALLEGATO DI UNA FATTURA FORNITORE (REQ-MAG-033) ────────────────
//
// «Allegare = il documento vero (foto/PDF), non solo un numero» (l'utente,
// 20/08). La foto viene da un telefono e pesa: si riduce QUI, nel browser,
// prima di partire — la connessione del locale è quella che è, e chi scatta
// è in piedi in magazzino.
//
// Il controllo del formato sta prima del lavoro e non dopo: aprire in canvas
// un file che non è un'immagine è tempo perso a schermo fermo.
//
// Torna la scheda dell'allegato da scrivere sulla fattura. Solleva un errore
// con la frase da mostrare quando il file non si può allegare: chi ha
// toccato deve leggere cosa non va e cosa fare, non un codice di Firebase.
export async function caricaAllegatoFattura(idFattura, file) {
  const problema = problemaDelFile(file)
  if (problema) throw new Error(problema)

  // Il PDF non si tocca: ricomprimerlo vorrebbe dire rovinare il testo che è
  // esattamente la cosa da leggere. Si accetta o si rifiuta, e il rifiuto è
  // già avvenuto qui sopra.
  const pronto =
    tipoAllegato(file.type) === 'immagine'
      ? await downscaleImage(file, { lato: LATO_MASSIMO, qualita: QUALITA })
      : file

  const troppo = problemaDelCaricato(pronto.size)
  if (troppo) throw new Error(troppo)

  const contentType = pronto.type || file.type
  const path = percorsoAllegato(idFattura, contentType)
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, pronto, { contentType })
  return {
    url: await getDownloadURL(storageRef),
    // IL PERCORSO SI SCRIVE ACCANTO ALL'URL, ed è quello che serve per
    // cancellare: senza, il file di una fattura eliminata resterebbe su
    // Storage per sempre senza che nessuno sappia più di chi era.
    path,
    content_type: contentType,
    size: pronto.size ?? 0,
    // Il nome che il file aveva sul telefono: è l'unica cosa che permette a
    // chi guarda di riconoscere l'allegato senza aprirlo.
    name: file.name || 'documento',
    added_at: new Date().toISOString(),
  }
}

// Cancella (best-effort) un allegato dal suo percorso. Non solleva
// eccezioni: la fattura se ne va comunque, e un file già assente non è un
// motivo per far fallire un'eliminazione.
export async function eliminaAllegato(path) {
  if (!path) return
  try {
    await deleteObject(ref(storage, path))
  } catch {
    /* best effort: ignora */
  }
}
