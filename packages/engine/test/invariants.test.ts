import { describe, expect, it } from "vitest";
import { createDocument } from "../src/document/document.js";
import { validateDocument } from "../src/document/invariants.js";
import type { Document, DocumentNode } from "../src/document/types.js";

function withNodes(base: Document, nodes: DocumentNode[]): Document {
  const nextNodes = new Map(base.nodes);
  for (const node of nodes) nextNodes.set(node.id, node);
  return { ...base, nodes: nextNodes };
}

function node(overrides: Partial<DocumentNode> & { id: string }): DocumentNode {
  return {
    type: "box",
    parentId: null,
    childrenIds: [],
    props: {},
    ...overrides,
  };
}

describe("validateDocument — RFC-000 §12 invariants", () => {
  it("a freshly created Document has no violations", () => {
    expect(validateDocument(createDocument())).toEqual([]);
  });

  it("flags a childrenId that does not exist in the node Map", () => {
    const base = createDocument({ rootNodeId: "root" });
    const doc = withNodes(base, [node({ id: "root", childrenIds: ["missing-child"] })]);

    const violations = validateDocument(doc);
    expect(violations).toContainEqual(expect.objectContaining({ code: "CHILD_NOT_FOUND", nodeId: "root" }));
  });

  it("flags a parentId that does not exist", () => {
    const base = createDocument({ rootNodeId: "root" });
    const doc = withNodes(base, [
      node({ id: "root", childrenIds: [] }),
      node({ id: "orphan", parentId: "ghost-parent" }),
    ]);

    const violations = validateDocument(doc);
    expect(violations).toContainEqual(expect.objectContaining({ code: "PARENT_NOT_FOUND", nodeId: "orphan" }));
  });

  it("flags a node referenced as a child by more than one parent", () => {
    const base = createDocument({ rootNodeId: "root" });
    const doc = withNodes(base, [
      node({ id: "root", childrenIds: ["a", "b"] }),
      node({ id: "a", parentId: "root", childrenIds: ["shared"] }),
      node({ id: "b", parentId: "root", childrenIds: ["shared"] }),
      node({ id: "shared", parentId: "a" }),
    ]);

    const violations = validateDocument(doc);
    expect(violations).toContainEqual(expect.objectContaining({ code: "MULTIPLE_PARENTS", nodeId: "shared" }));
  });

  it("flags a node with parentId=null that is still listed as someone's child", () => {
    const base = createDocument({ rootNodeId: "root" });
    const doc = withNodes(base, [
      node({ id: "root", childrenIds: ["a"] }),
      node({ id: "a", parentId: null }),
    ]);

    const violations = validateDocument(doc);
    expect(violations).toContainEqual(expect.objectContaining({ code: "ORPHAN_PARENT_LINK", nodeId: "a" }));
  });

  it("detects a cycle in the node graph", () => {
    const base = createDocument({ rootNodeId: "root" });
    const doc = withNodes(base, [
      node({ id: "root", childrenIds: ["a"] }),
      node({ id: "a", parentId: "root", childrenIds: ["b"] }),
      node({ id: "b", parentId: "a", childrenIds: ["a"] }),
    ]);

    const violations = validateDocument(doc);
    expect(violations.some((v) => v.code === "CYCLE_DETECTED")).toBe(true);
  });

  it("flags a Page whose rootNodeId does not exist", () => {
    const doc = createDocument({ rootPageId: "page-1", rootNodeId: "node-1" });
    const nextPages = new Map(doc.pages);
    nextPages.set("page-1", { id: "page-1", name: "Home", rootNodeId: "does-not-exist" });

    const violations = validateDocument({ ...doc, pages: nextPages });
    expect(violations).toContainEqual(expect.objectContaining({ code: "PAGE_ROOT_NOT_FOUND", pageId: "page-1" }));
  });

  it("flags a Page root node that has a parent", () => {
    const base = createDocument({ rootPageId: "page-1", rootNodeId: "root" });
    const doc = withNodes(base, [node({ id: "root", parentId: "some-parent" })]);

    const violations = validateDocument(doc);
    expect(violations.some((v) => v.code === "PAGE_ROOT_HAS_PARENT")).toBe(true);
  });
});
