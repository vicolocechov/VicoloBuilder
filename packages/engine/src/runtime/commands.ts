import { requireNode, collectSubtreeIds } from "../document/document.js";
import { assertValidDocument } from "../document/invariants.js";
import type { Document, DocumentNode, NodeId } from "../document/types.js";

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
  | DeleteNodeCommand;

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

  const nextNodes = new Map(document.nodes);
  nextNodes.set(nextParent.id, nextParent);
  nextNodes.set(newNode.id, newNode);

  return { ...document, nodes: nextNodes };
}

function applyUpdateProps(document: Document, command: UpdatePropsCommand): Document {
  const node = requireNode(document, command.nodeId);
  const nextNode: DocumentNode = { ...node, props: { ...node.props, ...command.props } };

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
    default: {
      const exhaustive: never = command;
      throw new CommandError(exhaustive, `Unknown command type.`);
    }
  }

  assertValidDocument(next);
  return next;
}
