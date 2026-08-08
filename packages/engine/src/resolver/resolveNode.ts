import { cascadingBreakpoints } from "./breakpoints.js";
import { assertValidResolvedModel } from "./invariants.js";
import type { ResolvedModel, ResolvedNode, ResolverContext } from "./types.js";
import { VARIANT_TABLE } from "./variantTable.js";
import type { Document, DocumentNode } from "../document/types.js";

/**
 * Convenzione di autoring per gli override responsive: un nodo può avere
 * `props.responsive = { <breakpointName>: { ...override } }`. Non è una
 * proprietà "reale" - viene consumata qui e non compare in resolvedProps.
 */
const RESPONSIVE_KEY = "responsive";

function applyBreakpointOverrides(
  props: Readonly<Record<string, unknown>>,
  breakpoint: string,
): Record<string, unknown> {
  const { [RESPONSIVE_KEY]: responsive, ...base } = props;
  const result: Record<string, unknown> = { ...base };

  if (responsive && typeof responsive === "object") {
    // Ordine: dal breakpoint più stretto al più largo, così quelli più
    // larghi sovrascrivono quelli più stretti (mobile-first, come min-width CSS).
    for (const bp of cascadingBreakpoints(breakpoint)) {
      const override = (responsive as Record<string, unknown>)[bp.name];
      if (override && typeof override === "object") {
        Object.assign(result, override);
      }
    }
  }

  return result;
}

function applyVariantExpansion(props: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const variant = props.variant;
  if (typeof variant !== "string" || !(variant in VARIANT_TABLE)) {
    return { ...props };
  }
  // Il default derivato dal variant fa da base; le proprietà esplicite del
  // nodo (già risolte per breakpoint) vincono in caso di conflitto - il
  // variant è una comodità di default, non un vincolo non sovrascrivibile
  // (RFC-000 §8: "resolver uno-a-molti", non un mandato rigido).
  return { ...VARIANT_TABLE[variant], ...props };
}

/**
 * Risolve un singolo nodo: breakpoint prima, poi variant (ordine di
 * implementazione, non dettato da nessuna fonte - documentato qui).
 * Pura: nessuno stato di modulo, nessun I/O, stesso input -> stesso output.
 */
export function resolveNode(node: DocumentNode, context: ResolverContext): ResolvedNode {
  const afterBreakpoint = applyBreakpointOverrides(node.props, context.breakpoint);
  const resolvedProps = applyVariantExpansion(afterBreakpoint);

  return {
    id: node.id,
    type: node.type,
    parentId: node.parentId,
    childrenIds: node.childrenIds,
    resolvedProps,
  };
}

/**
 * Risolve l'intero Document. Pura, come resolveNode. Non altera mai il
 * grafo (childrenIds/parentId restano identici) - solo props->resolvedProps
 * cambia. Valida sempre l'output prima di restituirlo, stesso schema di
 * applyCommand/assertValidDocument in Fase 1 (DECISIONS.md, decisione E).
 */
export function resolveDocument(document: Document, context: ResolverContext): ResolvedModel {
  const nodes = new Map<string, ResolvedNode>();
  for (const node of document.nodes.values()) {
    nodes.set(node.id, resolveNode(node, context));
  }

  const model: ResolvedModel = {
    rootPageId: document.rootPageId,
    nodes,
    pages: document.pages,
  };

  assertValidResolvedModel(model);
  return model;
}
