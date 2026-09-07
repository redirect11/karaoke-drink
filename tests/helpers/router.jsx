import { MemoryRouter as MemoryRouterVero } from 'react-router-dom'

// IL ROUTER DEI TEST, DICHIARATO IN UN POSTO SOLO.
//
// React Router 6 avvisa a ogni montaggio che nella 7 due cose cambiano: gli
// aggiornamenti di stato passeranno per `startTransition`, e i percorsi
// relativi dentro una rotta «splat» si risolveranno diversamente. Sono
// avvisi di MIGRAZIONE, non difetti nostri, e si spengono dicendo che quel
// comportamento lo vogliamo già adesso — in sedici file di test erano
// duemila righe di rumore in cui sparivano gli avvisi veri.
//
// Qui si può dichiararlo perché il router dei test è di prova e le rotte
// sono quelle che il singolo test monta. Nell'app vera (`src/main.jsx`) NON
// si tocca: cambiare come il router aggiorna lo stato è un cambio di
// comportamento sulla schermata con cui si incassa, e in produzione quegli
// avvisi react-router non li stampa nemmeno (li compila via col build).
export const FUTURO_ROUTER = { v7_startTransition: true, v7_relativeSplatPath: true }

// Si chiama come l'originale apposta: nei test cambia la riga di import e
// basta, il JSX resta quello. I `props` vengono dopo, così un test che
// volesse dichiarare un futuro diverso può ancora farlo.
export function MemoryRouter({ children, ...props }) {
  return (
    <MemoryRouterVero future={FUTURO_ROUTER} {...props}>
      {children}
    </MemoryRouterVero>
  )
}
