import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/runtime/commands.js";
import { createDocument } from "../../src/document/document.js";
import { resolveDocument } from "../../src/resolver/resolveNode.js";
import { validateResolvedModel } from "../../src/resolver/invariants.js";
import type { ResolvedModel, ResolvedNode } from "../../src/resolver/types.js";

// Nota (vedi commento in src/resolver/invariants.ts): dato che
// resolveDocument non altera mai il grafo, un ResolvedModel prodotto da un
// Document valido è SEMPRE verde qui per costruzione - il primo test lo
// documenta esplicitamente. I test successivi costruiscono un ResolvedModel
// a mano (bypassando resolveDocument) per verificare che il validator
// stesso rilevi correttamente ogni violazione, esattamente come
// document/invariants.test.ts fa per validateDocument.

function resolvedNode(overrides: Partial<ResolvedNode> & { id: string }): ResolvedNode {
  return { type: "box", parentId: null, childrenIds: [], resolvedProps: {}, ...overrides };
}

function withNodes(base: ResolvedModel, nodes: ResolvedNode[]): ResolvedModel {
  const nextNodes = new Map(base.nodes);
  for (const node of nodes) nextNodes.set(node.id, node);
  return { ...base, nodes: nextNodes };
}

describe("validateResolvedModel — caso reale", () => {
  it("un ResolvedModel prodotto da un Document valido non ha violazioni", () => {
    let doc = createDocument({ rootNodeId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a" });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(validateResolvedModel(model)).toEqual([]);
  });
});

describe("validateResolvedModel — violazioni costruite a mano (il grafo del Document non le produce mai oggi)", () => {
  function base(): ResolvedModel {
    const doc = createDocument({ rootNodeId: "root" });
    return resolveDocument(doc, { breakpoint: "mobile" });
  }

  it("flags a childrenId inesistente", () => {
    const model = withNodes(base(), [resolvedNode({ id: "root", childrenIds: ["missing"] })]);
    expect(validateResolvedModel(model)).toContainEqual(
      expect.objectContaining({ code: "CHILD_NOT_FOUND", nodeId: "root" }),
    );
  });

  it("flags a parentId inesistente", () => {
    const model = withNodes(base(), [resolvedNode({ id: "orphan", parentId: "ghost" })]);
    expect(validateResolvedModel(model)).toContainEqual(
      expect.objectContaining({ code: "PARENT_NOT_FOUND", nodeId: "orphan" }),
    );
  });

  it("flags un nodo referenziato da più di un parent", () => {
    const model = withNodes(base(), [
      resolvedNode({ id: "root", childrenIds: ["a", "b"] }),
      resolvedNode({ id: "a", parentId: "root", childrenIds: ["shared"] }),
      resolvedNode({ id: "b", parentId: "root", childrenIds: ["shared"] }),
      resolvedNode({ id: "shared", parentId: "a" }),
    ]);
    expect(validateResolvedModel(model)).toContainEqual(
      expect.objectContaining({ code: "MULTIPLE_PARENTS", nodeId: "shared" }),
    );
  });

  it("detects un ciclo", () => {
    const model = withNodes(base(), [
      resolvedNode({ id: "root", childrenIds: ["a"] }),
      resolvedNode({ id: "a", parentId: "root", childrenIds: ["b"] }),
      resolvedNode({ id: "b", parentId: "a", childrenIds: ["a"] }),
    ]);
    expect(validateResolvedModel(model).some((v) => v.code === "CYCLE_DETECTED")).toBe(true);
  });

  it("flags un resolved node con parentId=null che è comunque referenziato come figlio da qualcun altro", () => {
    const model = withNodes(base(), [
      resolvedNode({ id: "root", childrenIds: ["a"] }),
      resolvedNode({ id: "a", parentId: null }),
    ]);
    expect(validateResolvedModel(model)).toContainEqual(
      expect.objectContaining({ code: "ORPHAN_PARENT_LINK", nodeId: "a" }),
    );
  });

  it("flags una Page il cui resolved root node ha un parent", () => {
    const model = withNodes(base(), [resolvedNode({ id: "root", parentId: "some-parent" })]);
    expect(validateResolvedModel(model).some((v) => v.code === "PAGE_ROOT_HAS_PARENT")).toBe(true);
  });

  it("flags una Page il cui rootNodeId non esiste nel modello risolto", () => {
    const model = base();
    const nextPages = new Map(model.pages);
    nextPages.set(model.rootPageId, { id: model.rootPageId, name: "Home", rootNodeId: "does-not-exist" });
    expect(validateResolvedModel({ ...model, pages: nextPages })).toContainEqual(
      expect.objectContaining({ code: "PAGE_ROOT_NOT_FOUND" }),
    );
  });
});
