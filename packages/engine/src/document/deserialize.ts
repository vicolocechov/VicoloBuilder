import { CURRENT_SCHEMA_VERSION, type Document, type DocumentNode, type Page } from "./types.js";

/**
 * Errore per JSON esterno che non può nemmeno essere trasformato in un
 * Document (sintassi non valida, o forma insufficiente a costruire la Map
 * dei nodi/pagine). Distinto da DocumentInvariantError (RFC-000 §12: grafo
 * strutturalmente valido ma violazioni di invariante, es. cicli) e da un
 * RangeError da esaurimento stack (D-011) - tre categorie di errore diverse
 * sul path di caricamento, gestite separatamente dal chiamante.
 */
export class DocumentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentParseError";
  }
}

function fail(message: string): never {
  throw new DocumentParseError(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePropsEntries(value: unknown, nodeId: string): Record<string, unknown> {
  if (!Array.isArray(value)) {
    fail(`Node "${nodeId}": "props" deve essere un array di coppie [chiave, valore].`);
  }
  const entries: [string, unknown][] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") {
      fail(`Node "${nodeId}": ogni voce di "props" deve essere una coppia [string, unknown].`);
    }
    entries.push([entry[0], entry[1]]);
  }
  return Object.fromEntries(entries);
}

function parseNode(value: unknown): DocumentNode {
  if (!isPlainObject(value)) fail('Ogni elemento di "nodes" deve essere un oggetto.');
  const { id, type, parentId, childrenIds, props } = value;

  if (typeof id !== "string") fail('Node: campo "id" mancante o non stringa.');
  if (typeof type !== "string") fail(`Node "${id}": campo "type" mancante o non stringa.`);
  if (parentId !== null && typeof parentId !== "string") {
    fail(`Node "${id}": campo "parentId" deve essere una stringa o null.`);
  }
  if (!Array.isArray(childrenIds) || !childrenIds.every((c) => typeof c === "string")) {
    fail(`Node "${id}": campo "childrenIds" deve essere un array di stringhe.`);
  }

  return {
    id,
    type,
    parentId,
    childrenIds: [...childrenIds],
    props: parsePropsEntries(props, id),
  };
}

function parsePage(value: unknown): Page {
  if (!isPlainObject(value)) fail('Ogni elemento di "pages" deve essere un oggetto.');
  const { id, name, rootNodeId } = value;

  if (typeof id !== "string") fail('Page: campo "id" mancante o non stringa.');
  if (typeof name !== "string") fail(`Page "${id}": campo "name" mancante o non stringa.`);
  if (typeof rootNodeId !== "string") fail(`Page "${id}": campo "rootNodeId" mancante o non stringa.`);

  return { id, name, rootNodeId };
}

/**
 * Ricostruisce un Document da una stringa JSON nel formato prodotto da
 * serializeDocument (array piatti di record, non un albero annidato).
 * Puramente iterativa: nessuna ricorsione, indipendentemente dalla
 * profondità logica del grafo rappresentato (D-011 - la profondità della
 * catena parentId/childrenIds non corrisponde alla profondità di nesting
 * JSON qui, perché il formato è già piatto).
 *
 * Costruisce solo la forma dati minima necessaria a popolare le Map; NON
 * valida gli invarianti del grafo (cicli, parent/child coerenti - quello è
 * compito di validateDocument/assertValidDocument, da chiamare
 * separatamente dal chiamante dopo la deserializzazione).
 */
export function deserializeDocument(json: string): Document {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new DocumentParseError(`JSON non valido: ${reason}`);
  }

  if (!isPlainObject(parsed)) fail("Il contenuto deserializzato deve essere un oggetto JSON.");
  const { schemaVersion, rootPageId, pages, nodes } = parsed;

  if (typeof schemaVersion !== "number") fail('Campo "schemaVersion" mancante o non numerico.');
  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    fail(`schemaVersion ${schemaVersion} non supportato (atteso ${CURRENT_SCHEMA_VERSION}).`);
  }
  if (typeof rootPageId !== "string") fail('Campo "rootPageId" mancante o non stringa.');
  if (!Array.isArray(pages)) fail('Campo "pages" deve essere un array.');
  if (!Array.isArray(nodes)) fail('Campo "nodes" deve essere un array.');

  const pageEntries = pages.map(parsePage);
  const nodeEntries = nodes.map(parseNode);

  return {
    schemaVersion,
    rootPageId,
    pages: new Map(pageEntries.map((p) => [p.id, p])),
    nodes: new Map(nodeEntries.map((n) => [n.id, n])),
  };
}
