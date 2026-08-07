import { describe, expect, it } from "vitest";
import { createDocument, getNode, getPage } from "../src/document/document.js";
import { CURRENT_SCHEMA_VERSION } from "../src/document/types.js";
import { validateDocument } from "../src/document/invariants.js";

describe("createDocument", () => {
  it("produces a Document with a schemaVersion", () => {
    const document = createDocument();
    expect(document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("produces a Document with exactly one Page pointing at a valid, parent-less root node", () => {
    const document = createDocument();
    expect(document.pages.size).toBe(1);

    const page = getPage(document, document.rootPageId);
    expect(page).toBeDefined();

    const rootNode = getNode(document, page!.rootNodeId);
    expect(rootNode).toBeDefined();
    expect(rootNode!.parentId).toBeNull();
    expect(rootNode!.childrenIds).toEqual([]);
  });

  it("is invariant-valid out of the box", () => {
    const document = createDocument();
    expect(validateDocument(document)).toEqual([]);
  });

  it("respects custom ids and names", () => {
    const document = createDocument({
      rootPageId: "page-1",
      rootPageName: "Landing",
      rootNodeId: "node-1",
      rootNodeType: "frame",
    });
    expect(document.rootPageId).toBe("page-1");
    expect(getPage(document, "page-1")!.name).toBe("Landing");
    expect(getNode(document, "node-1")!.type).toBe("frame");
  });
});
