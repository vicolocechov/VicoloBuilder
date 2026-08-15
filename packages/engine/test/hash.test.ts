import { describe, expect, it } from "vitest";
import { hashDocument } from "../src/document/hash.js";
import type { Document, DocumentNode, Page } from "../src/document/types.js";

// Questi Document sono costruiti a mano (non via createDocument/applyCommand)
// deliberatamente: lo scopo è verificare che hashDocument sia insensibile a
// come i dati sono arrivati (ordine di inserimento nella Map, ordine delle
// chiavi di props), non che l'engine li produca in un certo modo.

function node(overrides: Partial<DocumentNode> & { id: string }): DocumentNode {
  return { type: "box", parentId: null, childrenIds: [], props: {}, ...overrides };
}

// Fase 14: Page porta ora anche `props` (mirror di DocumentNode.props) -
// stesso trattamento di default già usato sopra per `node()`.
function page(overrides: Partial<Page> & { id: string }): Page {
  return { name: "Home", rootNodeId: "root", props: {}, ...overrides };
}

describe("hashDocument — determinismo (RFC-005: export IR byte-identico)", () => {
  it("è indipendente dall'ordine di inserimento nella Map dei nodi", () => {
    const root = node({ id: "root", childrenIds: ["a", "b"] });
    const a = node({ id: "a", parentId: "root", props: { x: 1 } });
    const b = node({ id: "b", parentId: "root", type: "text", props: { content: "hi" } });
    const homePage = page({ id: "page-1" });

    const docInsertionOrderA: Document = {
      schemaVersion: 1,
      rootPageId: "page-1",
      nodes: new Map([["root", root], ["a", a], ["b", b]]),
      pages: new Map([["page-1", homePage]]),
      pageOrder: ["page-1"],
      props: {},
    };

    const docInsertionOrderB: Document = {
      schemaVersion: 1,
      rootPageId: "page-1",
      nodes: new Map([["b", b], ["root", root], ["a", a]]), // stesso contenuto, ordine diverso
      pages: new Map([["page-1", homePage]]),
      pageOrder: ["page-1"],
      props: {},
    };

    expect(hashDocument(docInsertionOrderA)).toBe(hashDocument(docInsertionOrderB));
  });

  it("è indipendente dall'ordine delle proprietà di un nodo", () => {
    const pageId = "page-1";
    const homePage = page({ id: pageId });

    const nodeOrderA = node({ id: "root", props: { color: "red", size: 12, visible: true } });
    const nodeOrderB = node({ id: "root", props: { visible: true, color: "red", size: 12 } });

    const docA: Document = {
      schemaVersion: 1,
      rootPageId: pageId,
      nodes: new Map([["root", nodeOrderA]]),
      pages: new Map([[pageId, homePage]]),
      pageOrder: [pageId],
      props: {},
    };
    const docB: Document = {
      schemaVersion: 1,
      rootPageId: pageId,
      nodes: new Map([["root", nodeOrderB]]),
      pages: new Map([[pageId, homePage]]),
      pageOrder: [pageId],
      props: {},
    };

    expect(hashDocument(docA)).toBe(hashDocument(docB));
  });

  it("due Document costruiti in modo completamente indipendente ma semanticamente identici hanno hash identico", () => {
    // Costruito "dall'alto in basso"
    const docTopDown: Document = {
      schemaVersion: 1,
      rootPageId: "page-1",
      nodes: new Map([
        ["root", node({ id: "root", childrenIds: ["a", "b"] })],
        ["a", node({ id: "a", parentId: "root", type: "box", props: { background: "#fff" } })],
        ["b", node({ id: "b", parentId: "root", type: "text", props: { content: "ciao", color: "#000" } })],
      ]),
      pages: new Map([["page-1", page({ id: "page-1" })]]),
      pageOrder: ["page-1"],
      props: {},
    };

    // Costruito "dal basso in alto", ordine di dichiarazione e ordine delle
    // props deliberatamente diversi, ma stesso contenuto semantico.
    const bIndependent = node({ id: "b", parentId: "root", type: "text", props: { color: "#000", content: "ciao" } });
    const aIndependent = node({ id: "a", parentId: "root", type: "box", props: { background: "#fff" } });
    const rootIndependent = node({ id: "root", childrenIds: ["a", "b"] });
    const docBottomUp: Document = {
      schemaVersion: 1,
      rootPageId: "page-1",
      nodes: new Map([
        ["b", bIndependent],
        ["a", aIndependent],
        ["root", rootIndependent],
      ]),
      pages: new Map([["page-1", page({ id: "page-1" })]]),
      pageOrder: ["page-1"],
      props: {},
    };

    expect(hashDocument(docTopDown)).toBe(hashDocument(docBottomUp));
  });

  it("due Document semanticamente diversi hanno hash diversi (sanity check anti falsi-positivi)", () => {
    const pageId = "page-1";
    const homePage = page({ id: pageId });

    const docA: Document = {
      schemaVersion: 1,
      rootPageId: pageId,
      nodes: new Map([["root", node({ id: "root", props: { color: "red" } })]]),
      pages: new Map([[pageId, homePage]]),
      pageOrder: [pageId],
      props: {},
    };
    const docB: Document = {
      schemaVersion: 1,
      rootPageId: pageId,
      nodes: new Map([["root", node({ id: "root", props: { color: "blue" } })]]),
      pages: new Map([[pageId, homePage]]),
      pageOrder: [pageId],
      props: {},
    };

    expect(hashDocument(docA)).not.toBe(hashDocument(docB));
  });
});
