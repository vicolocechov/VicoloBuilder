import type { Box } from "./types.js";

/**
 * Invarianti minimali del Box Tree (decisione F, apertura Fase 2): nessuna
 * fonte le specifica oltre alla forma di RFC-004, quindi il set qui è
 * volutamente ridotto a ciò che è stato esplicitamente approvato:
 * dimensioni non negative, niente NaN/Infinity, children contenuti nei
 * bound del parent.
 */
export type BoxInvariantCode = "NEGATIVE_DIMENSION" | "NON_FINITE_VALUE" | "CHILD_OUT_OF_BOUNDS";

export interface BoxInvariantViolation {
  readonly code: BoxInvariantCode;
  readonly message: string;
  readonly nodeId: string;
}

function isFinite(n: number): boolean {
  return Number.isFinite(n);
}

/** "Contenuto nei bound del parent" (decisione F): definizione più semplice
 * approvata nel piano - il box del figlio interamente dentro
 * [0,width]x[0,height] del parent in coordinate assolute, estremi inclusi.
 * Non modella overflow/scroll. */
function isContained(child: Box, parent: Box): boolean {
  return (
    child.x >= parent.x &&
    child.y >= parent.y &&
    child.x + child.width <= parent.x + parent.width &&
    child.y + child.height <= parent.y + parent.height
  );
}

export function validateBox(box: Box): BoxInvariantViolation[] {
  const violations: BoxInvariantViolation[] = [];

  function visit(node: Box, parent: Box | null): void {
    for (const value of [node.x, node.y, node.width, node.height]) {
      if (!isFinite(value)) {
        violations.push({
          code: "NON_FINITE_VALUE",
          message: `Box "${node.nodeId}" has a non-finite coordinate/dimension.`,
          nodeId: node.nodeId,
        });
      }
    }

    if (node.width < 0 || node.height < 0) {
      violations.push({
        code: "NEGATIVE_DIMENSION",
        message: `Box "${node.nodeId}" has a negative width or height (width=${node.width}, height=${node.height}).`,
        nodeId: node.nodeId,
      });
    }

    // Fase 5, Blocco B (Decisione 1B): il contenimento nei bound del parent
    // è verificato solo se il parent dispone i figli in modalità "pila"
    // (default, anche quando `mode` è assente - vedi layout/types.ts). Un
    // parent in modalità "libero" può avere figli che sporgono di proposito
    // (posizionamento libero, guide di allineamento future): non è un
    // errore, è la modalità stessa.
    if (parent && parent.mode !== "libero" && !isContained(node, parent)) {
      violations.push({
        code: "CHILD_OUT_OF_BOUNDS",
        message: `Box "${node.nodeId}" is not contained within the bounds of its parent "${parent.nodeId}".`,
        nodeId: node.nodeId,
      });
    }

    for (const child of node.children) {
      visit(child, node);
    }
  }

  visit(box, null);
  return violations;
}

export class BoxInvariantError extends Error {
  readonly violations: readonly BoxInvariantViolation[];

  constructor(violations: readonly BoxInvariantViolation[]) {
    super(`Box tree violates ${violations.length} invariant(s): ${violations.map((v) => v.code).join(", ")}`);
    this.name = "BoxInvariantError";
    this.violations = violations;
  }
}

export function assertValidBox(box: Box): void {
  const violations = validateBox(box);
  if (violations.length > 0) {
    throw new BoxInvariantError(violations);
  }
}
