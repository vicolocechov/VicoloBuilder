import type { NodeId, Page, PageId } from "../document/types.js";

export type BreakpointName = string;

export interface Breakpoint {
  readonly name: BreakpointName;
  /** Larghezza minima, in px, a cui questo breakpoint si applica (mobile-first, come min-width CSS). */
  readonly minWidth: number;
}

/**
 * Un nodo dopo la risoluzione di breakpoint + variant. Stessa forma di
 * DocumentNode (id/type/parentId/childrenIds), `props` sostituito da
 * `resolvedProps`: il grafo (chi è figlio di chi) non cambia mai in questa
 * fase, solo i valori delle proprietà.
 */
export interface ResolvedNode {
  readonly id: NodeId;
  readonly type: string;
  readonly parentId: NodeId | null;
  readonly childrenIds: readonly NodeId[];
  readonly resolvedProps: Readonly<Record<string, unknown>>;
}

/** Document risolto (RFC-005: Document -> ResolvedModel -> IR). */
export interface ResolvedModel {
  readonly rootPageId: PageId;
  readonly nodes: ReadonlyMap<NodeId, ResolvedNode>;
  readonly pages: ReadonlyMap<PageId, Page>;
}

export interface ResolverContext {
  readonly breakpoint: BreakpointName;
}
