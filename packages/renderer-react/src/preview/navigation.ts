import type { Document, PageId } from "@vicolobuilder/engine";
import { sceneNodeIds } from "./scenes.js";

export interface PreviewPosition {
  readonly pageId: PageId;
  /** Indice dentro `sceneNodeIds(document, pageId)`, 0 se la pagina non ha scene (fallback Punto 1). */
  readonly sceneIndex: number;
}

/**
 * Fase 7 (analisi, Punto 5/9): indice successivo/precedente con clamp ai
 * confini della sequenza - nessun wrap. A inizio/fine, un ulteriore passo
 * nella stessa direzione non ha effetto invece di avvolgere all'altro
 * capo. Nessun requisito esplicito ha chiesto il wrap; scelta conservativa,
 * non vincolante, segnalata qui.
 */
function clampedNextIndex(current: number, delta: -1 | 1, length: number): number {
  if (length <= 0) return current;
  const next = current + delta;
  if (next < 0 || next >= length) return current;
  return next;
}

export function initialPosition(pageId: PageId): PreviewPosition {
  return { pageId, sceneIndex: 0 };
}

/**
 * Cambio pagina (frecce sinistra/destra - Punto 5): scorre `pageOrder`,
 * clampato ai confini. Al cambio pagina la scena riparte dalla prima
 * (`sceneIndex: 0`) - la posizione scena della pagina precedente non ha
 * significato per una pagina diversa.
 */
export function navigatePage(document: Document, position: PreviewPosition, delta: -1 | 1): PreviewPosition {
  const order = document.pageOrder;
  const currentIndex = order.indexOf(position.pageId);
  if (currentIndex === -1) return position;
  const nextIndex = clampedNextIndex(currentIndex, delta, order.length);
  if (nextIndex === currentIndex) return position;
  // `nextIndex` è garantito in [0, order.length) da `clampedNextIndex` (l'unica
  // altra uscita è il ramo sopra, quando è rimasto invariato).
  return { pageId: order[nextIndex]!, sceneIndex: 0 };
}

/**
 * Cambio scena (frecce su/giù - Punto 5): scorre le scene della pagina
 * corrente (Punto 1), clampato ai confini. Nessun effetto se la pagina non
 * ha scene (sequenza vuota - `clampedNextIndex` con `length <= 0`).
 */
export function navigateScene(document: Document, position: PreviewPosition, delta: -1 | 1): PreviewPosition {
  const scenes = sceneNodeIds(document, position.pageId);
  const nextIndex = clampedNextIndex(position.sceneIndex, delta, scenes.length);
  if (nextIndex === position.sceneIndex) return position;
  return { ...position, sceneIndex: nextIndex };
}
