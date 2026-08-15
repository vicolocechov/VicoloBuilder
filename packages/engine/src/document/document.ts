import { CURRENT_SCHEMA_VERSION, type Document, type DocumentNode, type NodeId, type Page, type PageId } from "./types.js";

export interface CreateDocumentOptions {
  readonly rootPageId?: PageId;
  readonly rootPageName?: string;
  readonly rootNodeId?: NodeId;
  readonly rootNodeType?: string;
}

/**
 * Creates a new, empty, invariant-valid Document: one Page whose root node
 * is a single empty container node.
 */
export function createDocument(options: CreateDocumentOptions = {}): Document {
  const pageId = options.rootPageId ?? "page-home";
  const nodeId = options.rootNodeId ?? "node-root";

  const rootNode: DocumentNode = {
    id: nodeId,
    type: options.rootNodeType ?? "page-root",
    parentId: null,
    childrenIds: [],
    props: {},
  };

  const page: Page = {
    id: pageId,
    name: options.rootPageName ?? "Home",
    rootNodeId: nodeId,
    props: {},
  };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rootPageId: pageId,
    nodes: new Map([[nodeId, rootNode]]),
    pages: new Map([[pageId, page]]),
    pageOrder: [pageId],
  };
}

export function getNode(document: Document, nodeId: NodeId): DocumentNode | undefined {
  return document.nodes.get(nodeId);
}

export function requireNode(document: Document, nodeId: NodeId): DocumentNode {
  const node = document.nodes.get(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  return node;
}

export function getPage(document: Document, pageId: PageId): Page | undefined {
  return document.pages.get(pageId);
}

/** Collects a node and all of its descendants (depth-first, node included first). */
export function collectSubtreeIds(document: Document, nodeId: NodeId): NodeId[] {
  const result: NodeId[] = [];
  const stack: NodeId[] = [nodeId];
  const seen = new Set<NodeId>();

  while (stack.length > 0) {
    const currentId = stack.pop() as NodeId;
    if (seen.has(currentId)) continue;
    seen.add(currentId);
    result.push(currentId);

    const node = document.nodes.get(currentId);
    if (!node) continue;
    for (const childId of node.childrenIds) {
      stack.push(childId);
    }
  }

  return result;
}
