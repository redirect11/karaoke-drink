// I SENSORI DEL TRASCINAMENTO SI SPENGONO, NON SI TOLGONO.
//
// Sia la griglia dei prodotti sia la lista del conto hanno una modalità
// «organizza»: fuori di lì niente si sposta. Il modo istintivo di ottenerlo
// è passare a dnd-kit una lista di sensori vuota quando la modalità è
// spenta — ed è sbagliato. dnd-kit quella lista la usa come dipendenze di
// un `useEffect` (`useSensorSetup`), e React le dipendenze le confronta una
// a una PER POSIZIONE: una lista che cambia lunghezza fra un disegno e
// l'altro è proprio ciò che vieta, e lo dice a voce alta. In pratica,
// entrando e uscendo da «organizza» il confronto slitta e il montaggio dei
// sensori viene rifatto — o saltato — senza una regola: il tipo di cosa che
// non si vede in prova e si paga al banco, con una maniglia che non prende.
//
// Qui la lista resta sempre lunga uguale. A spegnere il gesto è l'opzione
// `attiva`, che l'attivatore guarda prima ancora che il trascinamento
// parta: `useSensor(spegnibile(PointerSensor), { attiva: false, … })` è un
// sensore montato e muto.
export function spegnibile(Sensore) {
  return class extends Sensore {
    static activators = Sensore.activators.map((attivatore) => ({
      eventName: attivatore.eventName,
      handler: (evento, opzioni, ...resto) =>
        opzioni?.attiva === false ? false : attivatore.handler(evento, opzioni, ...resto),
    }))
  }
}
