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

export interface Document {
  readonly schemaVersion: number;
  readonly rootPageId: PageId;
  readonly nodes: ReadonlyMap<NodeId, DocumentNode>;
  readonly pages: ReadonlyMap<PageId, Page>;
}
