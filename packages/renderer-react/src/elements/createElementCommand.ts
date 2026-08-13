import { getNode, resolveNode } from "@vicolobuilder/engine";
import type { BreakpointName, CreateNodeCommand, Document, NodeId } from "@vicolobuilder/engine";

/**
 * Fase 5 — creazione interattiva di elementi, scope ridotto approvato:
 * solo "testo" e "contenitore" in questo giro. "Immagine" rimandata
 * esplicitamente (toccherebbe l'elenco chiuso CONTENT_KEYS in
 * write/buildUpdatePropsCommand.ts, che resta bloccato com'è).
 */
export type ElementType = "text" | "container";

/**
 * Valori di default approvati esplicitamente (versione uniforme, non
 * condizionale sul parent - vedi turno di decisione). Il contenitore nasce
 * "libero": è l'unica modalità che questo stesso giro rende utilizzabile
 * come bersaglio di annidamento (vedi `resolveNewElementParent` - un
 * contenitore a pila non può mai ricevere un nuovo elemento tramite questa
 * funzione), non per comodità implementativa (DECISIONS.md, D-015).
 */
const ELEMENT_DEFAULTS: Record<ElementType, { readonly nodeType: string; readonly idBase: string; readonly props: Readonly<Record<string, unknown>> }> = {
  text: { nodeType: "text", idBase: "testo", props: { x: 20, y: 20, width: 160, height: 40, text: "Testo" } },
  container: { nodeType: "box", idBase: "contenitore", props: { x: 20, y: 20, width: 200, height: 120, layoutMode: "libero" } },
};

export function elementIdBase(elementType: ElementType): string {
  return ELEMENT_DEFAULTS[elementType].idBase;
}

function isLiberoContainer(document: Document, nodeId: NodeId, activeBreakpoint: BreakpointName): boolean {
  const node = getNode(document, nodeId);
  if (!node) return false;
  return resolveNode(node, { breakpoint: activeBreakpoint }).resolvedProps.layoutMode === "libero";
}

/**
 * Collocamento (paletto dato): dentro il contenitore selezionato se è in
 * modalità libera - risolta alla vista attiva, non solo il prop base, così
 * un override responsive di `layoutMode` viene rispettato; altrimenti la
 * radice della pagina attiva, ANCHE se il contenitore selezionato è a
 * pila (non si forza mai libero dentro pila).
 */
export function resolveNewElementParent(
  document: Document,
  pageRootNodeId: NodeId,
  selection: NodeId | null,
  activeBreakpoint: BreakpointName,
): NodeId {
  if (selection !== null && isLiberoContainer(document, selection, activeBreakpoint)) {
    return selection;
  }
  return pageRootNodeId;
}

export function buildCreateElementCommand(elementType: ElementType, nodeId: NodeId, parentId: NodeId): CreateNodeCommand {
  const { nodeType, props } = ELEMENT_DEFAULTS[elementType];
  return { type: "CREATE_NODE", nodeId, nodeType, parentId, props: { ...props } };
}
