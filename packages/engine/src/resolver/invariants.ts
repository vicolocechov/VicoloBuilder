import type { NodeId } from "../document/types.js";
import type { ResolvedModel } from "./types.js";

/**
 * Verifica strutturale del ResolvedModel: stesso genere di controlli di
 * document/invariants.ts (singolo parent, no cicli, childrenId/parentId
 * validi, page root valida), applicati al grafo risolto invece che al
 * Document. Duplicato deliberatamente invece di condiviso con un'astrazione
 * generica: due soli call site non giustificano un'astrazione (RFC-000 non
 * vieta la duplicazione minima, e un'astrazione prematura costerebbe più
 * di quanto risparmi qui).
 *
 * Nota onesta: dato che resolveNode/resolveDocument non alterano mai il
 * grafo (childrenIds/parentId restano quelli del Document sorgente, già
 * garantito valido da ogni applyCommand - vedi proprietà #14 della matrice
 * di apertura Fase 2), questi controlli oggi sono verdi per costruzione, non
 * perché stiano prevenendo un bug osservato. Restano come difesa in
 * profondità per quando il Resolver farà qualcosa di più (es. espansione di
 * Component in una fase futura) che potrebbe realmente alterare il grafo.
 */
export type ResolvedModelInvariantCode =
  | "PARENT_NOT_FOUND"
  | "CHILD_NOT_FOUND"
  | "MULTIPLE_PARENTS"
  | "ORPHAN_PARENT_LINK"
  | "CYCLE_DETECTED"
  | "PAGE_ROOT_NOT_FOUND"
  | "PAGE_ROOT_HAS_PARENT";

export interface ResolvedModelInvariantViolation {
  readonly code: ResolvedModelInvariantCode;
  readonly message: string;
  readonly nodeId?: NodeId;
  readonly pageId?: string;
}

export function validateResolvedModel(model: ResolvedModel): ResolvedModelInvariantViolation[] {
  const violations: ResolvedModelInvariantViolation[] = [];

  const parentCountByChild = new Map<NodeId, number>();
  for (const node of model.nodes.values()) {
    for (const childId of node.childrenIds) {
      if (!model.nodes.has(childId)) {
        violations.push({
          code: "CHILD_NOT_FOUND",
          message: `Resolved node "${node.id}" references missing child "${childId}".`,
          nodeId: node.id,
        });
        continue;
      }
      parentCountByChild.set(childId, (parentCountByChild.get(childId) ?? 0) + 1);
    }
  }

  for (const node of model.nodes.values()) {
    if (node.parentId !== null && !model.nodes.has(node.parentId)) {
      violations.push({
        code: "PARENT_NOT_FOUND",
        message: `Resolved node "${node.id}" has parentId "${node.parentId}" which does not exist.`,
        nodeId: node.id,
      });
    }

    const parentCount = parentCountByChild.get(node.id) ?? 0;
    if (node.parentId === null) {
      if (parentCount > 0) {
        violations.push({
          code: "ORPHAN_PARENT_LINK",
          message: `Resolved node "${node.id}" has parentId=null but is listed as a child elsewhere.`,
          nodeId: node.id,
        });
      }
    } else if (parentCount !== 1) {
      violations.push({
        code: "MULTIPLE_PARENTS",
        message: `Resolved node "${node.id}" is referenced as a child by ${parentCount} parent(s); expected exactly 1.`,
        nodeId: node.id,
      });
    }
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<NodeId, number>();
  for (const id of model.nodes.keys()) color.set(id, WHITE);

  let cycleFound = false;
  const visit = (id: NodeId): void => {
    if (cycleFound) return;
    color.set(id, GRAY);
    const node = model.nodes.get(id);
    if (node) {
      for (const childId of node.childrenIds) {
        if (!model.nodes.has(childId)) continue;
        const childColor = color.get(childId);
        if (childColor === GRAY) {
          cycleFound = true;
          violations.push({
            code: "CYCLE_DETECTED",
            message: `Cycle detected involving resolved node "${childId}".`,
            nodeId: childId,
          });
          return;
        }
        if (childColor === WHITE) visit(childId);
      }
    }
    color.set(id, BLACK);
  };
  for (const id of model.nodes.keys()) {
    if (color.get(id) === WHITE) visit(id);
  }

  for (const page of model.pages.values()) {
    const rootNode = model.nodes.get(page.rootNodeId);
    if (!rootNode) {
      violations.push({
        code: "PAGE_ROOT_NOT_FOUND",
        message: `Page "${page.id}" has rootNodeId "${page.rootNodeId}" which does not exist in the resolved model.`,
        pageId: page.id,
      });
    } else if (rootNode.parentId !== null) {
      violations.push({
        code: "PAGE_ROOT_HAS_PARENT",
        message: `Page "${page.id}" resolved root node "${rootNode.id}" must not have a parent.`,
        pageId: page.id,
        nodeId: rootNode.id,
      });
    }
  }

  return violations;
}

export class ResolvedModelInvariantError extends Error {
  readonly violations: readonly ResolvedModelInvariantViolation[];

  constructor(violations: readonly ResolvedModelInvariantViolation[]) {
    super(`ResolvedModel violates ${violations.length} invariant(s): ${violations.map((v) => v.code).join(", ")}`);
    this.name = "ResolvedModelInvariantError";
    this.violations = violations;
  }
}

export function assertValidResolvedModel(model: ResolvedModel): void {
  const violations = validateResolvedModel(model);
  if (violations.length > 0) {
    throw new ResolvedModelInvariantError(violations);
  }
}
