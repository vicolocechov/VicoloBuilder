import type { Document, NodeId } from "./types.js";

export type InvariantCode =
  | "PARENT_NOT_FOUND"
  | "CHILD_NOT_FOUND"
  | "MULTIPLE_PARENTS"
  | "ORPHAN_PARENT_LINK"
  | "CYCLE_DETECTED"
  | "PAGE_ROOT_NOT_FOUND"
  | "PAGE_ROOT_HAS_PARENT"
  | "ROOT_PAGE_NOT_FOUND"
  | "PAGE_ORDER_MISMATCH";

export interface InvariantViolation {
  readonly code: InvariantCode;
  readonly message: string;
  readonly nodeId?: NodeId;
  readonly pageId?: string;
}

/**
 * Checks every RFC-000 §12 invariant that applies at the Document/graph
 * level (Component invariants are out of scope until Components exist).
 * Pure: no side effects, same input -> same output.
 */
export function validateDocument(document: Document): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  // Every childId referenced by a node must exist, and a child must be
  // referenced by exactly one parent (single-parent invariant).
  const parentCountByChild = new Map<NodeId, number>();
  for (const node of document.nodes.values()) {
    for (const childId of node.childrenIds) {
      if (!document.nodes.has(childId)) {
        violations.push({
          code: "CHILD_NOT_FOUND",
          message: `Node "${node.id}" references missing child "${childId}".`,
          nodeId: node.id,
        });
        continue;
      }
      parentCountByChild.set(childId, (parentCountByChild.get(childId) ?? 0) + 1);
    }
  }

  for (const node of document.nodes.values()) {
    // parentId must point to an existing node.
    if (node.parentId !== null && !document.nodes.has(node.parentId)) {
      violations.push({
        code: "PARENT_NOT_FOUND",
        message: `Node "${node.id}" has parentId "${node.parentId}" which does not exist.`,
        nodeId: node.id,
      });
    }

    const parentCount = parentCountByChild.get(node.id) ?? 0;

    if (node.parentId === null) {
      // Root-like node: must not be claimed as a child by anyone.
      if (parentCount > 0) {
        violations.push({
          code: "ORPHAN_PARENT_LINK",
          message: `Node "${node.id}" has parentId=null but is listed as a child elsewhere.`,
          nodeId: node.id,
        });
      }
    } else if (parentCount !== 1) {
      violations.push({
        code: "MULTIPLE_PARENTS",
        message: `Node "${node.id}" is referenced as a child by ${parentCount} parent(s); expected exactly 1.`,
        nodeId: node.id,
      });
    }
  }

  // Cycle detection across the whole graph (not just reachable from a page root).
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<NodeId, number>();
  for (const id of document.nodes.keys()) color.set(id, WHITE);

  let cycleFound = false;
  const visit = (id: NodeId): void => {
    if (cycleFound) return;
    color.set(id, GRAY);
    const node = document.nodes.get(id);
    if (node) {
      for (const childId of node.childrenIds) {
        if (!document.nodes.has(childId)) continue; // already reported above
        const childColor = color.get(childId);
        if (childColor === GRAY) {
          cycleFound = true;
          violations.push({
            code: "CYCLE_DETECTED",
            message: `Cycle detected involving node "${childId}".`,
            nodeId: childId,
          });
          return;
        }
        if (childColor === WHITE) visit(childId);
      }
    }
    color.set(id, BLACK);
  };

  for (const id of document.nodes.keys()) {
    if (color.get(id) === WHITE) visit(id);
  }

  // Every Page must point to a valid, parent-less root node.
  for (const page of document.pages.values()) {
    const rootNode = document.nodes.get(page.rootNodeId);
    if (!rootNode) {
      violations.push({
        code: "PAGE_ROOT_NOT_FOUND",
        message: `Page "${page.id}" has rootNodeId "${page.rootNodeId}" which does not exist.`,
        pageId: page.id,
      });
    } else if (rootNode.parentId !== null) {
      violations.push({
        code: "PAGE_ROOT_HAS_PARENT",
        message: `Page "${page.id}" root node "${rootNode.id}" must not have a parent.`,
        pageId: page.id,
        nodeId: rootNode.id,
      });
    }
  }

  // Document.rootPageId deve puntare a una pagina realmente esistente
  // (Fase 5, Blocco A: nessun invariante lo controllava prima che esistesse
  // più di una pagina - un documento con una sola pagina non poteva mai
  // violarlo per costruzione).
  if (!document.pages.has(document.rootPageId)) {
    violations.push({
      code: "ROOT_PAGE_NOT_FOUND",
      message: `Document.rootPageId "${document.rootPageId}" does not match any page.`,
      pageId: document.rootPageId,
    });
  }

  // pageOrder deve essere esattamente una permutazione delle pagine esistenti
  // (Fase 5, Blocco A) - nessun id mancante, nessuno in più, nessun duplicato.
  const pageIds = new Set(document.pages.keys());
  const orderIds = new Set(document.pageOrder);
  const isPermutation =
    document.pageOrder.length === orderIds.size &&
    pageIds.size === orderIds.size &&
    [...pageIds].every((id) => orderIds.has(id));
  if (!isPermutation) {
    violations.push({
      code: "PAGE_ORDER_MISMATCH",
      message: `Document.pageOrder must be exactly a permutation of the existing page ids (pages: [${[...pageIds].join(", ")}], pageOrder: [${document.pageOrder.join(", ")}]).`,
    });
  }

  return violations;
}

export class DocumentInvariantError extends Error {
  readonly violations: readonly InvariantViolation[];

  constructor(violations: readonly InvariantViolation[]) {
    super(`Document violates ${violations.length} invariant(s): ${violations.map((v) => v.code).join(", ")}`);
    this.name = "DocumentInvariantError";
    this.violations = violations;
  }
}

export function assertValidDocument(document: Document): void {
  const violations = validateDocument(document);
  if (violations.length > 0) {
    throw new DocumentInvariantError(violations);
  }
}
