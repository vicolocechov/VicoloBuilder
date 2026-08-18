/**
 * Blocco Z2 (Fit-to-screen/Zoom): conversione screen->documento per il
 * gesto basato su `rect` (drag-and-drop strutturale, `localPoint()` in
 * Canvas.tsx - l'unico consumatore RECT-based individuato nell'analisi
 * "Fit-to-screen / Device Preview", gli altri sono a DELTA e restano
 * rimandati a Z3). Puro: nessuno stato, nessun accesso a DOM/React -
 * testabile senza jsdom (che non implementa comunque una vera geometria
 * scalata, vedi commento in Canvas.tsx sul perché la verifica end-to-end
 * di questo modulo resta comunque affidata al browser reale).
 *
 * `rect` è il `getBoundingClientRect()` GIÀ RENDERIZZATO (quindi già
 * scalato) della radice del Canvas - la stessa trasformazione CSS
 * (`transform: scale(zoom)`, `transformOrigin: "0 0"`) applicata in
 * Canvas.tsx fa sì che `rect.left`/`rect.top` coincidano ESATTAMENTE con
 * l'origine documento (0,0) indipendentemente dallo zoom (l'origine della
 * trasformazione è l'angolo in alto a sinistra) - solo LARGHEZZA/ALTEZZA
 * del rect cambiano con lo zoom, mai la posizione dell'origine. Per
 * questo la formula resta una traslazione (sottrarre `rect.left/top`)
 * seguita da UNA sola divisione per `zoom` - nessuna correzione aggiuntiva
 * di origine necessaria.
 */
export interface ClientOrigin {
  readonly left: number;
  readonly top: number;
}

export function screenPointToDocument(clientX: number, clientY: number, origin: ClientOrigin, zoom: number): { x: number; y: number } {
  return { x: (clientX - origin.left) / zoom, y: (clientY - origin.top) / zoom };
}

/**
 * Blocco Z3 (Fit-to-screen/Zoom): conversione per i gesti a DELTA
 * (spostamento, resize - `moveDrag`/`resizeDrag` in Canvas.tsx), a
 * differenza di `screenPointToDocument` sopra (usata dal gesto a `rect`,
 * Blocco Z2). Nessuna origine da sottrarre qui: un delta è per natura
 * indipendente dalla posizione (una traslazione), serve solo dividere per
 * `zoom` - a differenza di un punto assoluto, non serve MAI il
 * `getBoundingClientRect()` della radice del Canvas per un delta, coerente
 * con l'analisi originale ("Fit-to-screen / Device Preview": i gesti a
 * delta erano già indipendenti da scroll/origine anche prima di questo
 * blocco). Vincolo esplicito rispettato: `alignmentGuides.ts`/
 * `resizeGeometry.ts` non vengono mai toccati - ricevono SEMPRE un delta
 * già in spazio documento da questa funzione, applicata qui in Canvas.tsx,
 * mai al loro interno.
 */
export function screenDeltaToDocument(dx: number, dy: number, zoom: number): { dx: number; dy: number } {
  return { dx: dx / zoom, dy: dy / zoom };
}

/**
 * Blocco Z4 (Fit-to-screen/Zoom): conversione per le SOGLIE geometriche
 * rimaste in spazio documento dopo Z1-Z3 (`SNAP_THRESHOLD_PX` in
 * alignmentGuides.ts, `EDGE_ZONE_MAX_PX` in dropTarget.ts) - decisione già
 * presa all'approvazione dell'analisi "Fit-to-screen / Device Preview":
 * tutte e tre le soglie geometriche del Canvas restano costanti in spazio
 * SCHERMO (come `DRAG_THRESHOLD_PX`, già così fin da Z1), mai in spazio
 * documento - altrimenti la stessa soglia "6px" agganciherebbe a distanze
 * documento diverse a seconda dello zoom, un comportamento percepito come
 * incoerente. Stessa formula di `screenDeltaToDocument` (dividere per
 * `zoom`), qui per una singola lunghezza scalare invece di una coppia
 * dx/dy - una soglia in pixel è concettualmente una lunghezza, non un
 * punto né un delta direzionale, ma la relazione schermo->documento è
 * identica. Il valore convertito viene passato come PARAMETRO a
 * `computeAlignmentSnap`/`computeDropTarget` (mai come `zoom` stesso):
 * quei moduli restano ignari dello zoom, ricevono solo un numero già in
 * spazio documento, esattamente come già avviene per i delta convertiti
 * in Z3.
 */
export function screenLengthToDocument(px: number, zoom: number): number {
  return px / zoom;
}
