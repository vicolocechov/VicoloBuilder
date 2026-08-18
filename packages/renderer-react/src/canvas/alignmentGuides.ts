/**
 * Fase 5 — guide di allineamento di base (PRODUCT_DESIGN.md sez. 7,
 * Decisione 3). Paletti dati esplicitamente prima dell'implementazione:
 * - solo allo spostamento, non al ridimensionamento;
 * - "elemento vicino" = solo i fratelli nello stesso contenitore libero;
 * - "centro scena" = il contenitore libero immediato del figlio trascinato,
 *   non la radice della pagina;
 * - soglia di snap 6px (SNAP_THRESHOLD_PX sotto) - valore scelto per
 *   analogia con strumenti simili, non misurato su questo prodotto, stesso
 *   trattamento di DEFAULT_LEAF_HEIGHT/DRAG_THRESHOLD_PX nel codice esistente.
 *
 * Puro: nessuno stato, nessun accesso a DOM/React - testabile senza jsdom.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AxisGuide {
  /** Coordinata assoluta della guida: X per una guida verticale, Y per una orizzontale. */
  readonly position: number;
}

export interface AlignmentSnapResult {
  readonly x: number;
  readonly y: number;
  readonly guideX: AxisGuide | null;
  readonly guideY: AxisGuide | null;
}

export const SNAP_THRESHOLD_PX = 6;

/** I tre bordi di interesse su un asse: inizio, centro, fine. "Snap semplice" (Decisione 3): non distingue quale dei tre ha agganciato, sceglie solo il più vicino. */
function edgesOf(start: number, size: number): readonly number[] {
  return [start, start + size / 2, start + size];
}

function bestSnap(
  draggedStart: number,
  draggedSize: number,
  targets: readonly number[],
  thresholdPx: number,
): { delta: number; position: number } | null {
  let best: { delta: number; position: number } | null = null;
  for (const edge of edgesOf(draggedStart, draggedSize)) {
    for (const target of targets) {
      const delta = target - edge;
      if (Math.abs(delta) <= thresholdPx && (best === null || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, position: target };
      }
    }
  }
  return best;
}

/**
 * `dragged`: posizione/dimensione PROPOSTA (già col delta del puntatore
 * applicato), non quella committata. `siblings`: solo i fratelli nello
 * stesso contenitore libero (non l'intero albero). `container`: il box del
 * contenitore libero immediato - il suo CENTRO (non i bordi) è l'unico
 * target di "scena" considerato, come da paletto dato.
 *
 * `snapThresholdPx` (Blocco Z4, Fit-to-screen/Zoom): parametro opzionale,
 * default `SNAP_THRESHOLD_PX` (comportamento invariato per ogni chiamante
 * che non lo specifica, incluso ogni test esistente). Questo modulo resta
 * ignaro dello zoom: Canvas.tsx converte la soglia in spazio documento
 * PRIMA di chiamare questa funzione (`screenLengthToDocument`,
 * zoomCoordinates.ts) - la conversione non avviene mai qui dentro.
 */
export function computeAlignmentSnap(
  dragged: Rect,
  siblings: readonly Rect[],
  container: Rect,
  snapThresholdPx: number = SNAP_THRESHOLD_PX,
): AlignmentSnapResult {
  const xTargets: number[] = [container.x + container.width / 2];
  const yTargets: number[] = [container.y + container.height / 2];
  for (const sibling of siblings) {
    xTargets.push(...edgesOf(sibling.x, sibling.width));
    yTargets.push(...edgesOf(sibling.y, sibling.height));
  }

  const snapX = bestSnap(dragged.x, dragged.width, xTargets, snapThresholdPx);
  const snapY = bestSnap(dragged.y, dragged.height, yTargets, snapThresholdPx);

  return {
    x: dragged.x + (snapX?.delta ?? 0),
    y: dragged.y + (snapY?.delta ?? 0),
    guideX: snapX ? { position: snapX.position } : null,
    guideY: snapY ? { position: snapY.position } : null,
  };
}
