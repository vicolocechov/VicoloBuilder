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
