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
 * la forma dell'output. Due modalità, scelte da `resolvedProps.layoutMode`
 * di CIASCUN nodo (governa come QUEL nodo dispone i propri figli - non
 * come il nodo stesso viene posizionato dal proprio parent):
 *
 * - "pila" (default, anche quando `layoutMode` è assente/diverso da
 *   "libero"): comportamento storico, invariato. Pila verticale a colonna
 *   singola, ogni figlio prende la larghezza intera ereditata dall'alto;
 *   l'altezza di un nodo senza figli è `resolvedProps.height` se presente
 *   e numerico, altrimenti DEFAULT_LEAF_HEIGHT; l'altezza di un nodo con
 *   figli è la somma delle altezze dei figli (nessun padding/gap).
 *
 * - "libero" (Fase 5, Blocco B - Decisioni 2A/3A/4): i figli sono
 *   posizionati con un offset locale (`resolvedProps.x`/`y`, default 0 se
 *   assente - non deciso esplicitamente dal proprietario del prodotto,
 *   scelta implementativa, da segnalare) sommato all'ancora assoluta di
 *   QUESTO nodo (Decisione 2A: coordinate locali, non assolute - così
 *   spostare il contenitore trascina con sé i figli liberi "gratis").
 *   La dimensione propria di un nodo in modalità "libero" con figli usa
 *   `resolvedProps.width`/`height` se presenti (espliciti), altrimenti un
 *   riquadro automatico che racchiude tutti i figli, incluso lo
 *   sconfinamento negativo (Decisione 4) - l'ancora del contenitore resta
 *   il punto di riferimento, il riquadro si allarga verso l'esterno per
 *   includere ogni figlio, senza mai ri-basare le coordinate dei figli.
 *   La larghezza è OBBLIGATORIA (nessun default - Decisione 3) per un nodo
 *   SENZA figli propri posizionato in modalità libera, dato che un nodo
 *   senza figli non ha alcun contenuto da cui calcolare un riquadro
 *   automatico: si applica anche a un nodo con figli la cui PROPRIA
 *   modalità è "pila" (un contenitore a pila non ha un concetto di
 *   larghezza calcolata dal contenuto - la pila eredita sempre la
 *   larghezza dall'alto), estensione della Decisione 3 non discussa
 *   esplicitamente in quei termini, da segnalare.
 *
 * Scelto per essere deterministico, puro, e dimostrabile per costruzione
 * conforme agli invarianti minimi (dimensioni non negative, children
 * contenuti nei bound del parent quando il parent è in modalità "pila" -
 * vedi layout/invariants.ts), non per realismo visivo.
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

function ownLayoutMode(node: ResolvedNode): "pila" | "libero" | "griglia" {
  if (node.resolvedProps.layoutMode === "libero") return "libero";
  if (node.resolvedProps.layoutMode === "griglia") return "griglia";
  return "pila";
}

/**
 * `columns` obbligatoria per un nodo in modalità "griglia" (Fase 8, Punto 3
 * dell'analisi: nessun default sensato - un default silenzioso, es. 1,
 * trasformerebbe silenziosamente una griglia a card in una pila verticale).
 * Stesso trattamento di `requireExplicitWidth` per la larghezza in "libero"
 * (Decisione 3, D-015): un errore esplicito, non un fallback silenzioso.
 */
function requireColumns(node: ResolvedNode): number {
  const raw = node.resolvedProps.columns;
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 1) {
    throw new Error(
      `Layout: node "${node.id}" is in "griglia" mode and has no valid "columns" (a finite positive integer) ` +
        `in resolvedProps. In "griglia" mode, "columns" is mandatory with no default (see DECISIONS.md).`,
    );
  }
  return raw;
}

/**
 * Larghezza obbligatoria per un nodo posizionato in modalità "libero" dal
 * proprio parent, quando non esiste una larghezza ereditata dall'alto (nodo
 * senza figli, oppure nodo con figli la cui modalità propria è "pila" - vedi
 * commento sopra `computeLayout`). Nessun default (Decisione 3).
 */
function requireExplicitWidth(node: ResolvedNode): number {
  const width = asFiniteNumber(node.resolvedProps.width);
  if (width === undefined) {
    throw new Error(
      `Layout: node "${node.id}" is positioned in "libero" mode by its parent and has no explicit finite "width" ` +
        `in resolvedProps. In "libero" mode, width is mandatory with no default (see DECISIONS.md).`,
    );
  }
  return width;
}

function boundingBox(
  anchorX: number,
  anchorY: number,
  children: readonly Box[],
): { x: number; y: number; width: number; height: number } {
  let minX = anchorX;
  let minY = anchorY;
  let maxX = anchorX;
  let maxY = anchorY;
  for (const child of children) {
    minX = Math.min(minX, child.x);
    minY = Math.min(minY, child.y);
    maxX = Math.max(maxX, child.x + child.width);
    maxY = Math.max(maxY, child.y + child.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * @param widthFromParent Larghezza ereditata dall'alto, presente se e solo
 * se il PARENT di questo nodo dispone i propri figli in modalità "pila"
 * (o se questo è il nodo radice - vedi la chiamata in `computeLayout`).
 * `undefined` quando il parent è in modalità "libero": in quel caso questo
 * nodo determina la propria larghezza dalle proprie `resolvedProps`
 * (esplicita, o riquadro automatico se ha figli propri in modalità
 * "libero" - vedi commento sopra `computeLayout`).
 */
function layoutNode(
  node: ResolvedNode,
  model: ResolvedModel,
  x: number,
  y: number,
  widthFromParent: number | undefined,
): Box {
  const mode = ownLayoutMode(node);

  if (node.childrenIds.length === 0) {
    const width = widthFromParent ?? requireExplicitWidth(node);
    const height = asFiniteNumber(node.resolvedProps.height) ?? DEFAULT_LEAF_HEIGHT;
    return { nodeId: node.id, x, y, width, height, children: [], mode };
  }

  if (mode === "pila") {
    const width = widthFromParent ?? requireExplicitWidth(node);
    let cursorY = y;
    const children: Box[] = [];
    for (const childId of node.childrenIds) {
      const childNode = requireResolvedNode(model, childId);
      const childBox = layoutNode(childNode, model, x, cursorY, width);
      children.push(childBox);
      cursorY += childBox.height;
    }
    return { nodeId: node.id, x, y, width, height: cursorY - y, children, mode };
  }

  if (mode === "griglia") {
    // Fase 8: N colonne uguali (larghezza cella = (larghezza - gap*(N-1))/N)
    // + gap uniforme, generalizzazione diretta di "pila" lungo un asse in
    // più. I figli sono raggruppati in righe da `columns` elementi
    // nell'ordine di `childrenIds` (stessa convenzione d'ordine di "pila" -
    // nessun concetto di "cella": una griglia con 5 figli e 3 colonne ha
    // 2 righe, l'ultima con 2 celle occupate e nessun placeholder per le
    // 3 mancanti). Altezza di riga = altezza della sua cella più alta
    // (non uniforme sull'intera griglia): ogni figlio determina la propria
    // altezza con `layoutNode` esattamente come farebbe in "pila" (nessuna
    // nuova primitiva di posizionamento).
    const width = widthFromParent ?? requireExplicitWidth(node);
    const columns = requireColumns(node);
    const gap = asFiniteNumber(node.resolvedProps.gap) ?? 0;
    const cellWidth = (width - gap * (columns - 1)) / columns;

    const children: Box[] = [];
    let cursorY = y;
    for (let rowStart = 0; rowStart < node.childrenIds.length; rowStart += columns) {
      const rowIds = node.childrenIds.slice(rowStart, rowStart + columns);
      let rowHeight = 0;
      rowIds.forEach((childId, column) => {
        const childNode = requireResolvedNode(model, childId);
        const childX = x + column * (cellWidth + gap);
        const childBox = layoutNode(childNode, model, childX, cursorY, cellWidth);
        children.push(childBox);
        rowHeight = Math.max(rowHeight, childBox.height);
      });
      cursorY += rowHeight;
      if (rowStart + columns < node.childrenIds.length) cursorY += gap;
    }
    return { nodeId: node.id, x, y, width, height: cursorY - y, children, mode };
  }

  // mode === "libero" (unico ramo rimasto): i figli sono posizionati con un
  // offset locale sommato all'ancora (x, y) di questo nodo (Decisione 2A).
  // Nessuna larghezza viene propagata dall'alto ai figli: ognuno determina
  // la propria in base a `layoutMode`.
  const children: Box[] = [];
  for (const childId of node.childrenIds) {
    const childNode = requireResolvedNode(model, childId);
    const localX = asFiniteNumber(childNode.resolvedProps.x) ?? 0;
    const localY = asFiniteNumber(childNode.resolvedProps.y) ?? 0;
    children.push(layoutNode(childNode, model, x + localX, y + localY, undefined));
  }

  const explicitWidth = asFiniteNumber(node.resolvedProps.width);
  const explicitHeight = asFiniteNumber(node.resolvedProps.height);
  const auto = boundingBox(x, y, children);

  return {
    nodeId: node.id,
    x: explicitWidth !== undefined ? x : auto.x,
    y: explicitHeight !== undefined ? y : auto.y,
    width: explicitWidth ?? auto.width,
    height: explicitHeight ?? auto.height,
    children,
    mode,
  };
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
