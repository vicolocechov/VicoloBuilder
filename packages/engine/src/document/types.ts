export type NodeId = string;
export type PageId = string;

/** Current schema version for the Document format. Bump on breaking layout changes. */
export const CURRENT_SCHEMA_VERSION = 1;

export interface DocumentNode {
  readonly id: NodeId;
  readonly type: string;
  readonly parentId: NodeId | null;
  readonly childrenIds: readonly NodeId[];
  readonly props: Readonly<Record<string, unknown>>;
}

export interface Page {
  readonly id: PageId;
  readonly name: string;
  readonly rootNodeId: NodeId;
}

/**
 * Decisione di immutabilità (RFC-000 §1/§3), registrata esplicitamente per
 * non doverla ridiscutere da zero: nessun `Object.freeze` a runtime per ora.
 * `readonly`/`ReadonlyMap` qui sono garanzie solo compile-time. Valutate 4
 * opzioni (nessuna / freeze solo dev / freeze completo / freeze solo test
 * harness): scelta "nessuna" perché nessun consumer esterno esiste ancora
 * (CLI = Fase 3, renderer-react = Fase 5) che possa violare l'invariante, e
 * un freeze completo naive misura +40% di costo per comando a 10.000 nodi
 * per proteggere un rischio oggi inesistente nel codice. Da rivalutare
 * esplicitamente all'inizio della Fase 3.
 */
export interface Document {
  readonly schemaVersion: number;
  readonly rootPageId: PageId;
  readonly nodes: ReadonlyMap<NodeId, DocumentNode>;
  readonly pages: ReadonlyMap<PageId, Page>;
}
