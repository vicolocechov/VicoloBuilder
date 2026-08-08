import { assertValidBox } from "./invariants.js";
import type { Box } from "./types.js";
import type { PageId } from "../document/types.js";
import type { ResolvedModel, ResolvedNode } from "../resolver/types.js";

export interface ComputeLayoutOptions {
  readonly pageId?: PageId;
  /** Larghezza del "viewport" in cui disporre la pagina, in px. */
  readonly viewportWidth: number;
}

/**
 * Algoritmo di layout: PLACEHOLDER minimale per il vertical slice, non un
 * motore flex/grid. Nessuna fonte (RFC-004) specifica un algoritmo - solo
 * la forma dell'output. Regola: pila verticale a colonna singola, ogni
 * figlio prende la larghezza intera del parent; l'altezza di un nodo senza
 * figli è `resolvedProps.height` se presente e numerico, altrimenti
 * DEFAULT_LEAF_HEIGHT; l'altezza di un nodo con figli è la somma delle
 * altezze dei figli (nessun padding/gap in questa prima versione). Scelto
 * per essere deterministico, puro, e dimostrabile per costruzione conforme
 * agli invarianti minimi (dimensioni non negative, children contenuti nei
 * bound del parent - vedi layout/invariants.ts), non per realismo visivo.
 */
const DEFAULT_LEAF_HEIGHT = 40;

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireResolvedNode(model: ResolvedModel, nodeId: string): ResolvedNode {
  const node = model.nodes.get(nodeId);
  if (!node) {
    throw new Error(`Layout: resolved node not found: ${nodeId}`);
  }
  return node;
}

function layoutNode(node: ResolvedNode, model: ResolvedModel, x: number, y: number, width: number): Box {
  if (node.childrenIds.length === 0) {
    const height = asFiniteNumber(node.resolvedProps.height) ?? DEFAULT_LEAF_HEIGHT;
    return { nodeId: node.id, x, y, width, height, children: [] };
  }

  let cursorY = y;
  const children: Box[] = [];
  for (const childId of node.childrenIds) {
    const childNode = requireResolvedNode(model, childId);
    const childBox = layoutNode(childNode, model, x, cursorY, width);
    children.push(childBox);
    cursorY += childBox.height;
  }

  return { nodeId: node.id, x, y, width, height: cursorY - y, children };
}

/**
 * Produce il Box Tree di una pagina a partire da un ResolvedModel. Pura:
 * nessuno stato di modulo, nessun I/O, stesso input -> stesso output.
 * Ricalcolo sempre completo, nessun incrementale (DECISIONS.md, D-007).
 * Valida sempre l'output prima di restituirlo, stesso schema di
 * applyCommand/resolveDocument (DECISIONS.md, decisione E).
 */
export function computeLayout(model: ResolvedModel, options: ComputeLayoutOptions): Box {
  const pageId = options.pageId ?? model.rootPageId;
  const page = model.pages.get(pageId);
  if (!page) {
    throw new Error(`Layout: page not found: ${pageId}`);
  }
  const rootNode = requireResolvedNode(model, page.rootNodeId);

  const box = layoutNode(rootNode, model, 0, 0, options.viewportWidth);
  assertValidBox(box);
  return box;
}
