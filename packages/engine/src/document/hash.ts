import type { Document, DocumentNode, Page } from "./types.js";

function sortedEntries(props: Readonly<Record<string, unknown>>): [string, unknown][] {
  return Object.keys(props)
    .sort()
    .map((key) => [key, props[key]]);
}

function serializeNode(node: DocumentNode): unknown {
  return {
    id: node.id,
    type: node.type,
    parentId: node.parentId,
    childrenIds: [...node.childrenIds],
    props: sortedEntries(node.props),
  };
}

function serializePage(page: Page): unknown {
  return { id: page.id, name: page.name, rootNodeId: page.rootNodeId, props: sortedEntries(page.props) };
}

/**
 * Deterministic, order-independent JSON representation of a Document.
 * Two Documents with identical content always serialize identically,
 * regardless of Map insertion order — this is what makes `hashDocument`
 * (and, later, byte-identical IR export) possible.
 */
export function serializeDocument(document: Document): string {
  const nodes = Array.from(document.nodes.values())
    .map(serializeNode)
    .sort((a, b) => ((a as { id: string }).id < (b as { id: string }).id ? -1 : 1));

  const pages = Array.from(document.pages.values())
    .map(serializePage)
    .sort((a, b) => ((a as { id: string }).id < (b as { id: string }).id ? -1 : 1));

  return JSON.stringify({
    schemaVersion: document.schemaVersion,
    rootPageId: document.rootPageId,
    pages,
    nodes,
    // A differenza di pages/nodes (ordinati per id: l'ordine di inserimento
    // nella Map non è dato significativo), pageOrder va preservato così
    // com'è: qui l'ordine *è* il dato (Fase 5, Blocco A).
    pageOrder: [...document.pageOrder],
    // Fase 16 (Font custom): stesso trattamento di page.props/node.props -
    // ordinato per chiave per l'indipendenza dall'ordine di scrittura.
    props: sortedEntries(document.props),
  });
}

/** FNV-1a: small, dependency-free, deterministic across Node and browser. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Content hash of a Document. Same content -> same hash, independent of
 * object identity, Map insertion order, or key order inside `props`.
 */
export function hashDocument(document: Document): string {
  return fnv1a(serializeDocument(document));
}
