import type { NodeId } from "@vicolobuilder/engine";
import type { FlatBoxEntry } from "./flattenBoxes.js";

export type DropTargetKind = "into" | "before" | "after";

export interface DropTarget {
  /** Il nodo sotto il puntatore: per "into" è il nuovo genitore stesso; per "before"/"after" è il fratello di riferimento. */
  readonly targetNodeId: NodeId;
  /** Il genitore in cui il nodo trascinato finirebbe in ogni caso - per "into" coincide con targetNodeId. */
  readonly parentNodeId: NodeId;
  readonly kind: DropTargetKind;
}

/**
 * Fascia di bordo (in alto/in basso dentro il box) interpretata come
 * "inserisci come fratello prima/dopo", non come percentuale fissa su box
 * altissimi (che altrimenti inghiottirebbero l'intera zona "dentro"
 * centrale) - stesso stile di soglia in pixel già usato altrove nel Canvas
 * (`DRAG_THRESHOLD_PX`, `SNAP_THRESHOLD_PX` di alignmentGuides.ts).
 */
const EDGE_ZONE_RATIO = 0.25;
const EDGE_ZONE_MAX_PX = 16;

/**
 * Blocco 3 (drag-and-drop reale per riparent/riordino): trova il box più in
 * cima (ultimo della lista, stesso ordine di paint di `entries.map(renderBox)`
 * in Canvas.tsx) sotto il puntatore, poi decide fra tre esiti in base alla
 * posizione VERTICALE dentro quel box - una fascia di bordo in alto/in
 * basso significa "inserisci come fratello prima/dopo"; il resto centrale
 * significa "riparenta dentro" (solo se il box può ricevere figli,
 * `canReceiveChildren` - altrimenti si prova il box sotto, tipicamente il
 * proprio contenitore, invece di rifiutare l'intero gesto). Puramente
 * geometrico sulle Box già calcolate (stesse coordinate assolute usate per
 * il rendering, D1 "Canvas piatto") - nessuna dipendenza dal DOM/
 * `elementFromPoint`, coerente con `alignmentGuides.ts`.
 */
export function computeDropTarget(
  entries: readonly FlatBoxEntry[],
  excludedNodeIds: ReadonlySet<NodeId>,
  canReceiveChildren: (nodeId: NodeId) => boolean,
  pointerX: number,
  pointerY: number,
): DropTarget | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    const { nodeId, x, y, width, height } = entry.box;
    if (excludedNodeIds.has(nodeId)) continue;
    if (pointerX < x || pointerX > x + width || pointerY < y || pointerY > y + height) continue;

    const parentNodeId = entry.parentBox?.nodeId;
    const edgeHeight = Math.min(height * EDGE_ZONE_RATIO, EDGE_ZONE_MAX_PX);
    if (parentNodeId !== undefined) {
      if (pointerY - y < edgeHeight) return { kind: "before", targetNodeId: nodeId, parentNodeId };
      if (y + height - pointerY < edgeHeight) return { kind: "after", targetNodeId: nodeId, parentNodeId };
    }
    if (canReceiveChildren(nodeId)) return { kind: "into", targetNodeId: nodeId, parentNodeId: nodeId };
    // Il box più in cima qui non può ricevere figli e non è in una fascia
    // di bordo utile per il riordino: si prova il box sotto invece di
    // rifiutare l'intero gesto (continua il ciclo).
  }
  return null;
}
