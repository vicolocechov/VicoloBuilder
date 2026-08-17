import type { Box, IR, NodeId } from "@vicolobuilder/engine";
import { htmlTagFor } from "@vicolobuilder/render-conventions";
import { escapeHtmlAttribute, escapeHtmlText } from "./escape.js";

/**
 * Batch 3 dell'Exporter: markup HTML da `IR` (`box`+`nodes`+`types`,
 * D-036/D-039). Struttura PIATTA, non annidata secondo l'albero del
 * Document - stesso principio già stabilito da `flattenBoxes.ts`
 * (`renderer-react`, D1 "Canvas piatto"): `Box.x`/`Box.y` sono GIÀ
 * coordinate assolute di pagina (l'offset locale di ciascun nodo è
 * sommato all'ancora assoluta del genitore dentro `computeLayout`, prima
 * di scrivere il `Box` risultante - verificato leggendo
 * `layout/computeLayout.ts`), quindi non serve annidare i tag per
 * posizionarli correttamente: ogni nodo diventa un tag SIBLING con le
 * proprie coordinate assolute (il posizionamento CSS vero e proprio è
 * compito del Batch 4 - qui solo struttura/contenuto/attributi, coerente
 * con l'ambito del Batch 3 approvato). L'ordine di emissione rispecchia
 * l'ordine di visita di `Box.children` (radice, poi ricorsivamente ogni
 * figlio) - lo stesso ordine già prodotto da `flattenBoxes`.
 */

/**
 * Unico tag void oggi nel prodotto (Fase 15) - verificato in
 * `render-conventions`/Canvas.tsx, non un elenco generico di elementi
 * HTML void: questo Exporter emette solo i tag che `htmlTagFor` può
 * produrre (h1/h2/h3/p/a/img/div), di cui solo "img" è privo di tag di
 * chiusura.
 */
const VOID_TAGS: ReadonlySet<string> = new Set(["img"]);

/**
 * Whitelist B (analisi Exporter §3.5, approvata): schemi ammessi per
 * `href` - ancora interna, http(s), mailto, tel, o un riferimento
 * relativo privo di schema (nessun `letter+:` all'inizio della stringa,
 * sintassi RFC 3986 dello schema). Qualunque altro schema (`javascript:`,
 * `data:`, `vbscript:`, ...) è rifiutato. Comportamento su un valore
 * rifiutato: DEGRADAZIONE, non blocco dell'intero export - l'attributo
 * `href` viene omesso, il testo del link resta comunque visibile (stesso
 * principio già scelto per `href` senza validazione in editor, D-032:
 * qui la stessa filosofia si applica in output, non solo in scrittura).
 */
const ALLOWED_HREF_SCHEME = /^(https?|mailto|tel):/i;
const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function isAllowedHref(value: string): boolean {
  if (value === "" || value.startsWith("#")) return true;
  if (!HAS_SCHEME.test(value)) return true;
  return ALLOWED_HREF_SCHEME.test(value);
}

/**
 * Opzione C dell'analisi Exporter §3.6 (approvata): un `anchorId`
 * duplicato tra più nodi fa fallire l'INTERO export con un errore che
 * elenca ogni conflitto - a differenza di `href` (che degrada), un `id`
 * duplicato in output produce un comportamento ambiguo e silenzioso nel
 * browser del visitatore, un errore esplicito in fase di pubblicazione è
 * più onesto.
 */
export class DuplicateAnchorIdError extends Error {
  constructor(duplicates: ReadonlyMap<string, readonly NodeId[]>) {
    const lines = [...duplicates.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([anchorId, nodeIds]) => `  "${anchorId}": ${nodeIds.join(", ")}`);
    super(`Ancore duplicate (attributo id= non univoco) - correggi prima di pubblicare:\n${lines.join("\n")}`);
    this.name = "DuplicateAnchorIdError";
  }
}

function collectBoxNodeIds(box: Box, out: NodeId[]): void {
  out.push(box.nodeId);
  for (const child of box.children) collectBoxNodeIds(child, out);
}

function assertNoDuplicateAnchorIds(box: Box, nodes: IR["nodes"]): void {
  const nodeIds: NodeId[] = [];
  collectBoxNodeIds(box, nodeIds);

  const byAnchorId = new Map<string, NodeId[]>();
  for (const nodeId of nodeIds) {
    const anchorId = nodes[nodeId]?.anchorId;
    if (typeof anchorId === "string" && anchorId !== "") {
      const list = byAnchorId.get(anchorId) ?? [];
      list.push(nodeId);
      byAnchorId.set(anchorId, list);
    }
  }

  const duplicates = new Map<string, readonly NodeId[]>();
  for (const [anchorId, nodeIdsForAnchor] of byAnchorId) {
    if (nodeIdsForAnchor.length > 1) {
      duplicates.set(anchorId, [...nodeIdsForAnchor].sort());
    }
  }

  if (duplicates.size > 0) {
    throw new DuplicateAnchorIdError(duplicates);
  }
}

/**
 * `data-node-id`: stesso attributo, stesso nome, già usato da Canvas.tsx/
 * Preview.tsx - qui introdotto come selettore che i batch CSS successivi
 * (4+) useranno per agganciare geometria/stile a ciascun nodo. `nodeId` è
 * generato dall'Engine (`uniqueId()`, mai testo libero dell'utente), ma
 * escapato comunque per difesa in profondità - stesso principio già
 * scelto per lo stesso identico caso in `useHoverStyles.ts` (`CSS.escape`,
 * Fase 17).
 */
function renderAttributes(nodeId: NodeId, tag: string, props: Readonly<Record<string, unknown>>): string {
  const attrs: string[] = [`data-node-id="${escapeHtmlAttribute(nodeId)}"`];

  const anchorId = props.anchorId;
  if (typeof anchorId === "string" && anchorId !== "") {
    attrs.push(`id="${escapeHtmlAttribute(anchorId)}"`);
  }

  if (tag === "a") {
    const href = props.href;
    if (typeof href === "string" && isAllowedHref(href) && href !== "") {
      attrs.push(`href="${escapeHtmlAttribute(href)}"`);
    }
  }

  if (tag === "img") {
    const src = props.src;
    if (typeof src === "string" && src !== "") {
      attrs.push(`src="${escapeHtmlAttribute(src)}"`);
    }
    const alt = props.alt;
    attrs.push(`alt="${escapeHtmlAttribute(typeof alt === "string" ? alt : "")}"`);
  }

  return attrs.join(" ");
}

function renderSingleTag(nodeId: NodeId, type: string, props: Readonly<Record<string, unknown>>): string {
  const tag = htmlTagFor(type);
  const attributes = renderAttributes(nodeId, tag, props);

  if (VOID_TAGS.has(tag)) {
    return `<${tag} ${attributes}>`;
  }

  const text = props.text;
  const textContent = typeof text === "string" ? escapeHtmlText(text) : "";
  return `<${tag} ${attributes}>${textContent}</${tag}>`;
}

function renderFlatNodes(box: Box, nodes: IR["nodes"], types: IR["types"], out: string[]): void {
  out.push(renderSingleTag(box.nodeId, types[box.nodeId] ?? "", nodes[box.nodeId] ?? {}));
  for (const child of box.children) renderFlatNodes(child, nodes, types, out);
}

/**
 * Punto di ingresso del Batch 3: produce il frammento HTML da inserire in
 * `<body>` (l'assemblaggio del documento completo, incluso `<head>`, è
 * compito del Batch 8/9 - fuori da questo batch). Lancia
 * `DuplicateAnchorIdError` PRIMA di generare qualunque markup se trova
 * `anchorId` duplicati - nessun output parziale in quel caso.
 */
export function renderMarkup(ir: IR): string {
  assertNoDuplicateAnchorIds(ir.box, ir.nodes);
  const out: string[] = [];
  renderFlatNodes(ir.box, ir.nodes, ir.types, out);
  return out.join("");
}
