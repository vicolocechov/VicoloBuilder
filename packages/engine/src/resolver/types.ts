import type { NodeId, Page, PageId } from "../document/types.js";

export type BreakpointName = string;

/**
 * Fase 6 (DECISIONS.md, D-019): "combinazioni nominate", non assi
 * ortogonali indipendenti. Ogni fascia è un nome opaco con un predicato
 * descrittivo proprio - `minWidth`/`maxWidth`/`orientation`/`minHeight`/
 * `maxHeight` sono tutti opzionali e indipendenti tra loro (una fascia può
 * usarne solo alcuni, esattamente come le fasce reali che hanno motivato
 * questo modello: 3 delle 7 non hanno alcun vincolo di orientamento).
 * Il predicato NON viene mai valutato contro un viewport reale in questo
 * pacchetto (nessun consumer esistente ne ha bisogno - vedi D-019): serve
 * solo (a) come base per l'ordine di cascata curato in `CASCADE_ORDER`
 * (breakpoints.ts) e (b) come riferimento descrittivo per chi definisce le
 * fasce.
 */
export interface Breakpoint {
  readonly name: BreakpointName;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly orientation?: "portrait" | "landscape";
  readonly minHeight?: number;
  readonly maxHeight?: number;
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
