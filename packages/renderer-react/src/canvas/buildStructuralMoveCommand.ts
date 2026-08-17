import { getNode } from "@vicolobuilder/engine";
import type { Document, MoveNodeCommand, NodeId } from "@vicolobuilder/engine";
import type { DropTarget } from "./dropTarget.js";

/**
 * Blocco 3: traduce un `DropTarget` (geometria pura, `dropTarget.ts`) in un
 * `MoveNodeCommand`. Per "into": nessun `index`, il nodo va in coda ai
 * figli del bersaglio (stesso comportamento del vecchio "Sposta dentro…").
 * Per "before"/"after": `index` calcolato sui `childrenIds` del genitore
 * di destinazione ESCLUDENDO il nodo trascinato (se già presente) - stessa
 * semantica già decisa e implementata da `applyMoveNode`
 * (`packages/engine/src/runtime/commands.ts`, commento su
 * `MoveNodeCommand`): "posizione finale desiderata tra gli ALTRI figli",
 * valida sia per un riordino nello stesso genitore sia per un riparent con
 * inserimento in una posizione precisa. Se il fratello di riferimento non
 * si trova più (caso limite, Document cambiato sotto al gesto), l'indice
 * resta `undefined` - append in coda, mai un errore silenzioso su un
 * indice negativo.
 */
export function buildStructuralMoveCommand(document: Document, nodeId: NodeId, target: DropTarget): MoveNodeCommand {
  if (target.kind === "into") {
    return { type: "MOVE_NODE", nodeId, newParentId: target.parentNodeId };
  }

  const parent = getNode(document, target.parentNodeId);
  const siblingIds = (parent?.childrenIds ?? []).filter((id) => id !== nodeId);
  const targetIndex = siblingIds.indexOf(target.targetNodeId);

  // `exactOptionalPropertyTypes`: `index` va OMESSO, non impostato a
  // `undefined` esplicito, quando il fratello di riferimento non si trova
  // più - stesso comportamento (append in coda), forma diversa dell'oggetto.
  if (targetIndex < 0) {
    return { type: "MOVE_NODE", nodeId, newParentId: target.parentNodeId };
  }
  const index = target.kind === "before" ? targetIndex : targetIndex + 1;
  return { type: "MOVE_NODE", nodeId, newParentId: target.parentNodeId, index };
}
