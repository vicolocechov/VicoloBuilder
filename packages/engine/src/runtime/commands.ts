import { requireNode, collectSubtreeIds } from "../document/document.js";
import { assertValidDocument } from "../document/invariants.js";
import type { Document, DocumentNode, NodeId, Page, PageId } from "../document/types.js";

/**
 * A Command is a plain, serializable description of a single mutation.
 * Nothing in the engine ever mutates a Document directly — every write
 * goes through `applyCommand` (RFC-000 §3, Command Bus unico punto di
 * scrittura). Node ids are supplied by the caller (not generated inside
 * `applyCommand`) so that commands stay deterministic and replayable.
 */
export type Command =
  | CreateNodeCommand
  | UpdatePropsCommand
  | DeleteNodeCommand
  | MoveNodeCommand
  | CreatePageCommand
  | DeletePageCommand
  | ReorderPagesCommand;

export interface CreateNodeCommand {
  readonly type: "CREATE_NODE";
  readonly nodeId: NodeId;
  readonly nodeType: string;
  readonly parentId: NodeId;
  /** Insertion index among the parent's children; defaults to the end. */
  readonly index?: number;
  readonly props?: Readonly<Record<string, unknown>>;
}

export interface UpdatePropsCommand {
  readonly type: "UPDATE_PROPS";
  readonly nodeId: NodeId;
  /** Shallow-merged into the node's existing props. */
  readonly props: Readonly<Record<string, unknown>>;
}

export interface DeleteNodeCommand {
  readonly type: "DELETE_NODE";
  readonly nodeId: NodeId;
}

/**
 * Fase 8 (analisi dedicata, approvata): riassegna il genitore di un nodo
 * ESISTENTE — capacità generale (vale per qualunque `layoutMode` del
 * genitore, non specifica della griglia), non esisteva prima di Fase 8.
 *
 * `index`: posizione tra i figli del nuovo genitore, default fine lista.
 * Se `newParentId` è lo STESSO genitore attuale del nodo (riordino),
 * `index` è interpretato DOPO aver rimosso il nodo dalla lista - "posizione
 * finale desiderata tra gli altri figli" (decisione esplicita del
 * proprietario del prodotto, stesso comportamento intuitivo di un
 * drag-and-drop di riordino).
 *
 * `props`: eccezione MINIMA, non una seconda via generale di scrittura -
 * serve solo a permettere, nello stesso comando/passo di undo, di
 * aggiornare le coordinate che uno spostamento tra contenitori può rendere
 * insensate (x/y locali di D-015, relative all'ancora del contenitore
 * ATTUALE - vedi analisi Fase 8). Qualunque altro aggiornamento di
 * proprietà non strettamente necessario a questo scopo deve continuare a
 * passare da `buildUpdatePropsCommand` (renderer-react), l'unico che
 * applica il congelamento responsive Desktop-first (D-018) - vincolo
 * esplicito del proprietario del prodotto, da non allargare in autonomia.
 */
export interface MoveNodeCommand {
  readonly type: "MOVE_NODE";
  readonly nodeId: NodeId;
  readonly newParentId: NodeId;
  readonly index?: number;
  readonly props?: Readonly<Record<string, unknown>>;
}

/** Fase 5, Blocco A. Stesso schema di CreateNodeCommand: chi chiama fornisce gli id, per restare deterministico/replayabile. */
export interface CreatePageCommand {
  readonly type: "CREATE_PAGE";
  readonly pageId: PageId;
  readonly name: string;
  readonly rootNodeId: NodeId;
  readonly rootNodeType?: string;
}

/** Fase 5, Blocco A. Elimina anche l'intero sottoalbero di nodi della pagina (Decisione 2, cascata). */
export interface DeletePageCommand {
  readonly type: "DELETE_PAGE";
  readonly pageId: PageId;
}

/** Fase 5, Blocco A. Riceve l'ordine completo, non uno spostamento incrementale - deve essere una permutazione esatta delle pagine esistenti. */
export interface ReorderPagesCommand {
  readonly type: "REORDER_PAGES";
  readonly pageOrder: readonly PageId[];
}

export class CommandError extends Error {
  constructor(
    readonly command: Command,
    message: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

function applyCreateNode(document: Document, command: CreateNodeCommand): Document {
  if (document.nodes.has(command.nodeId)) {
    throw new CommandError(command, `Node id "${command.nodeId}" already exists.`);
  }
  const parent = requireNode(document, command.parentId);

  const newNode: DocumentNode = {
    id: command.nodeId,
    type: command.nodeType,
    parentId: command.parentId,
    childrenIds: [],
    props: { ...(command.props ?? {}) },
  };

  const nextChildrenIds = [...parent.childrenIds];
  const insertAt = command.index ?? nextChildrenIds.length;
  nextChildrenIds.splice(insertAt, 0, newNode.id);
  const nextParent: DocumentNode = { ...parent, childrenIds: nextChildrenIds };

  // KNOWN COST (misurato, non ancora un problema): questa copia è O(n) nel
  // numero totale di nodi del documento, ripetuta ad ogni comando -> O(n^2)
  // cumulativo su lunghe sequenze di comandi senza pause. A N=10.000 il costo
  // marginale di UN comando è ~6-6.6ms, entro tutti i budget di RFC-000 §6
  // (margine >=1.9x anche sul piu' stretto, 16ms) - vedi packages/engine/test/performance.test.ts.
  // Da rivedere solo se: (a) il target nodi cresce molto oltre 10.000, oppure
  // (b) viene introdotta un'operazione di bulk-edit che emette molti comandi
  // senza rendering/pause fra uno e l'altro. Non riscrivere per "eleganza".
  const nextNodes = new Map(document.nodes);
  nextNodes.set(nextParent.id, nextParent);
  nextNodes.set(newNode.id, newNode);

  return { ...document, nodes: nextNodes };
}

function applyUpdateProps(document: Document, command: UpdatePropsCommand): Document {
  const node = requireNode(document, command.nodeId);
  const nextNode: DocumentNode = { ...node, props: { ...node.props, ...command.props } };

  // Vedi la nota in applyCreateNode: stesso costo O(n), stessa conclusione.
  const nextNodes = new Map(document.nodes);
  nextNodes.set(nextNode.id, nextNode);

  return { ...document, nodes: nextNodes };
}

function applyDeleteNode(document: Document, command: DeleteNodeCommand): Document {
  const node = requireNode(document, command.nodeId);

  for (const page of document.pages.values()) {
    if (page.rootNodeId === node.id) {
      throw new CommandError(command, `Cannot delete "${node.id}": it is the root node of page "${page.id}".`);
    }
  }

  // Vedi la nota in applyCreateNode: stesso costo O(n) di copia della Map.
  // Nota separata: la cascata (collectSubtreeIds + le delete sotto) NON è il
  // collo di bottiglia - misurato: cancellare un sottoalbero da 5000 nodi in
  // un documento da 10.000 costa ~7.9ms, quasi come cancellarne uno da 10
  // nodi (~6.0ms). Il costo è quasi tutto nella riga sopra.
  const nextNodes = new Map(document.nodes);
  for (const id of collectSubtreeIds(document, node.id)) {
    nextNodes.delete(id);
  }

  if (node.parentId !== null) {
    const parent = nextNodes.get(node.parentId);
    if (parent) {
      nextNodes.set(parent.id, {
        ...parent,
        childrenIds: parent.childrenIds.filter((id) => id !== node.id),
      });
    }
  }

  return { ...document, nodes: nextNodes };
}

/**
 * Vedi il commento su `MoveNodeCommand`. Riusa lo stesso pattern già usato
 * da `applyCreateNode`/`applyDeleteNode`: più voci della stessa `Map` vengono
 * scritte (qui: vecchio genitore, nuovo genitore, il nodo stesso) prima di
 * restituire un unico `Document` nuovo - nessuno stato intermedio è mai
 * osservabile da chi chiama. `assertValidDocument` (fine di `applyCommand`)
 * resta la rete di sicurezza generica per MULTIPLE_PARENTS/ORPHAN_PARENT_LINK
 * nel caso (già escluso dalle guardie qui sotto) di una scrittura incompleta.
 */
function applyMoveNode(document: Document, command: MoveNodeCommand): Document {
  const node = requireNode(document, command.nodeId);
  const newParent = requireNode(document, command.newParentId);

  if (node.parentId === null) {
    throw new CommandError(command, `Cannot move "${node.id}": it is a page root node (parentId is null).`);
  }
  if (command.newParentId === node.id) {
    throw new CommandError(command, `Cannot move "${node.id}": a node cannot become its own parent.`);
  }
  // Guardia esplicita anti-ciclo (messaggio leggibile) prima di costruire il
  // documento - il controllo generico dei cicli in assertValidDocument lo
  // intercetterebbe comunque, ma dopo il fatto e con un errore meno chiaro.
  if (collectSubtreeIds(document, node.id).includes(command.newParentId)) {
    throw new CommandError(
      command,
      `Cannot move "${node.id}" into "${command.newParentId}": the target is a descendant of the node being moved (would create a cycle).`,
    );
  }

  const oldParent = requireNode(document, node.parentId);
  const nextNodes = new Map(document.nodes);

  if (oldParent.id === newParent.id) {
    // Riordino nello stesso genitore: `index` è già "posizione finale tra
    // gli altri figli" (decisione esplicita) - si applica alla lista DOPO
    // aver tolto il nodo, non prima.
    const withoutNode = oldParent.childrenIds.filter((id) => id !== node.id);
    const nextChildrenIds = [...withoutNode];
    nextChildrenIds.splice(command.index ?? nextChildrenIds.length, 0, node.id);
    nextNodes.set(oldParent.id, { ...oldParent, childrenIds: nextChildrenIds });
  } else {
    const nextOldChildrenIds = oldParent.childrenIds.filter((id) => id !== node.id);
    nextNodes.set(oldParent.id, { ...oldParent, childrenIds: nextOldChildrenIds });

    const nextNewChildrenIds = [...newParent.childrenIds];
    nextNewChildrenIds.splice(command.index ?? nextNewChildrenIds.length, 0, node.id);
    nextNodes.set(newParent.id, { ...newParent, childrenIds: nextNewChildrenIds });
  }

  const nextNode: DocumentNode = {
    ...node,
    parentId: command.newParentId,
    props: command.props ? { ...node.props, ...command.props } : node.props,
  };
  nextNodes.set(nextNode.id, nextNode);

  return { ...document, nodes: nextNodes };
}

function applyCreatePage(document: Document, command: CreatePageCommand): Document {
  if (document.pages.has(command.pageId)) {
    throw new CommandError(command, `Page id "${command.pageId}" already exists.`);
  }
  if (document.nodes.has(command.rootNodeId)) {
    throw new CommandError(command, `Node id "${command.rootNodeId}" already exists.`);
  }

  const rootNode: DocumentNode = {
    id: command.rootNodeId,
    type: command.rootNodeType ?? "page-root",
    parentId: null,
    childrenIds: [],
    props: {},
  };
  const page: Page = { id: command.pageId, name: command.name, rootNodeId: command.rootNodeId };

  const nextNodes = new Map(document.nodes);
  nextNodes.set(rootNode.id, rootNode);
  const nextPages = new Map(document.pages);
  nextPages.set(page.id, page);

  return { ...document, nodes: nextNodes, pages: nextPages, pageOrder: [...document.pageOrder, page.id] };
}

function applyDeletePage(document: Document, command: DeletePageCommand): Document {
  const page = document.pages.get(command.pageId);
  if (!page) {
    throw new CommandError(command, `Page id "${command.pageId}" does not exist.`);
  }
  if (document.pages.size <= 1) {
    throw new CommandError(command, `Cannot delete "${command.pageId}": it is the only remaining page.`);
  }
  // Nessun comando oggi permette di cambiare Document.rootPageId - eliminare
  // la pagina che lo è renderebbe il documento privo di una pagina
  // predefinita valida (ROOT_PAGE_NOT_FOUND), senza modo di ripararlo dopo.
  // Scelta conservativa (Fase 5, Blocco A, non nel piano originale - vedi
  // il messaggio riportato all'utente): la pagina rootPageId non è eliminabile.
  if (command.pageId === document.rootPageId) {
    throw new CommandError(command, `Cannot delete "${command.pageId}": it is the document's root page (rootPageId).`);
  }

  const nextNodes = new Map(document.nodes);
  for (const id of collectSubtreeIds(document, page.rootNodeId)) {
    nextNodes.delete(id);
  }
  const nextPages = new Map(document.pages);
  nextPages.delete(command.pageId);

  return {
    ...document,
    nodes: nextNodes,
    pages: nextPages,
    pageOrder: document.pageOrder.filter((id) => id !== command.pageId),
  };
}

function applyReorderPages(document: Document, command: ReorderPagesCommand): Document {
  const currentIds = new Set(document.pages.keys());
  const newIds = new Set(command.pageOrder);
  const isValidPermutation =
    command.pageOrder.length === currentIds.size &&
    newIds.size === command.pageOrder.length &&
    [...currentIds].every((id) => newIds.has(id));

  if (!isValidPermutation) {
    throw new CommandError(command, `"pageOrder" must be exactly a permutation of the existing page ids.`);
  }

  return { ...document, pageOrder: [...command.pageOrder] };
}

/**
 * Applies a single Command to a Document and returns a new Document.
 * Pure: never mutates its input. Always validates the result against
 * RFC-000 §12 invariants before returning (RFC-000 §12: "Ogni Command
 * produce sempre un Document valido") — an invalid result throws instead
 * of being returned, so callers never observe a corrupt Document.
 */
export function applyCommand(document: Document, command: Command): Document {
  let next: Document;
  switch (command.type) {
    case "CREATE_NODE":
      next = applyCreateNode(document, command);
      break;
    case "UPDATE_PROPS":
      next = applyUpdateProps(document, command);
      break;
    case "DELETE_NODE":
      next = applyDeleteNode(document, command);
      break;
    case "MOVE_NODE":
      next = applyMoveNode(document, command);
      break;
    case "CREATE_PAGE":
      next = applyCreatePage(document, command);
      break;
    case "DELETE_PAGE":
      next = applyDeletePage(document, command);
      break;
    case "REORDER_PAGES":
      next = applyReorderPages(document, command);
      break;
    default: {
      const exhaustive: never = command;
      throw new CommandError(exhaustive, `Unknown command type.`);
    }
  }

  assertValidDocument(next);
  return next;
}
