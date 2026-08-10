import { describe, expect, it } from "vitest";
import { createDocument } from "../../src/document/document.js";
import { applyCommand } from "../../src/runtime/commands.js";
import { resolveDocument } from "../../src/resolver/resolveNode.js";
import { computeLayout } from "../../src/layout/computeLayout.js";
import { exportIR } from "../../src/export/exportIR.js";
import type { Document } from "../../src/document/types.js";

function buildSampleDocument(): Document {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "hero", nodeType: "box", parentId: "root", props: { variant: "primary" } });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "heading", nodeType: "text", parentId: "hero", props: { content: "hi" } });
  return doc;
}

const CONTEXT = { breakpoint: "desktop", pageId: "page-home", viewportWidth: 1280 } as const;

describe("exportIR — nessuna logica duplicata rispetto a resolveDocument+computeLayout", () => {
  it("ir.box coincide con computeLayout(resolveDocument(...)) chiamati direttamente", () => {
    const doc = buildSampleDocument();
    const ir = exportIR(doc, CONTEXT);

    const model = resolveDocument(doc, { breakpoint: CONTEXT.breakpoint });
    const expectedBox = computeLayout(model, { pageId: CONTEXT.pageId, viewportWidth: CONTEXT.viewportWidth });

    expect(ir.box).toEqual(expectedBox);
  });

  it("ir.meta riflette esattamente pageId e breakpoint passati nel context", () => {
    const ir = exportIR(buildSampleDocument(), CONTEXT);
    expect(ir.meta).toEqual({ pageId: "page-home", breakpoint: "desktop" });
  });
});

describe("exportIR — purezza/determinismo (byte-per-byte)", () => {
  it("due chiamate consecutive sullo stesso Document producono lo stesso IR", () => {
    const doc = buildSampleDocument();
    expect(exportIR(doc, CONTEXT)).toEqual(exportIR(doc, CONTEXT));
  });

  it("JSON.stringify(ir) è identico su due chiamate consecutive (nessun serializer dedicato necessario)", () => {
    const doc = buildSampleDocument();
    const first = JSON.stringify(exportIR(doc, CONTEXT));
    const second = JSON.stringify(exportIR(doc, CONTEXT));
    expect(first).toBe(second);
  });

  it("props impostate con più UPDATE_PROPS in ordine diverso, stesso stato finale, producono lo stesso IR (indipendenza dall'ordine di costruzione, non dall'ordine di childrenIds - quello è dato semantico, non incidentale)", () => {
    let docA = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    docA = applyCommand(docA, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    docA = applyCommand(docA, { type: "UPDATE_PROPS", nodeId: "a", props: { height: 10 } });
    docA = applyCommand(docA, { type: "UPDATE_PROPS", nodeId: "a", props: { variant: "primary" } });

    let docB = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    docB = applyCommand(docB, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    docB = applyCommand(docB, { type: "UPDATE_PROPS", nodeId: "a", props: { variant: "primary" } });
    docB = applyCommand(docB, { type: "UPDATE_PROPS", nodeId: "a", props: { height: 10 } });

    expect(JSON.stringify(exportIR(docA, CONTEXT))).toBe(JSON.stringify(exportIR(docB, CONTEXT)));
  });

  it("viewportWidth diversi possono produrre IR diversi (sanity check anti falso-positivo)", () => {
    const doc = buildSampleDocument();
    const narrow = exportIR(doc, { ...CONTEXT, viewportWidth: 375 });
    const wide = exportIR(doc, { ...CONTEXT, viewportWidth: 1280 });
    expect(narrow.box.width).not.toBe(wide.box.width);
  });
});

describe("exportIR — pageId (già oggi obbligo strutturale di computeLayout, non nuovo)", () => {
  it("un pageId che non esiste nel Document propaga l'errore già esistente di computeLayout, nessuna duplicazione del controllo", () => {
    const doc = buildSampleDocument();
    expect(() => exportIR(doc, { ...CONTEXT, pageId: "does-not-exist" })).toThrow(/page not found/i);
  });

  it("una seconda pagina dello stesso Document produce un IR radicato sul suo rootNodeId, distinto da quello della prima", () => {
    const doc = buildSampleDocument();
    const root2 = { id: "root2", type: "page-root", parentId: null, childrenIds: [], props: {} };
    const secondPageDoc: Document = {
      ...doc,
      nodes: new Map(doc.nodes).set("root2", root2),
      pages: new Map(doc.pages).set("page-second", { id: "page-second", name: "Second", rootNodeId: "root2" }),
    };

    const irFirst = exportIR(secondPageDoc, { ...CONTEXT, pageId: "page-home" });
    const irSecond = exportIR(secondPageDoc, { ...CONTEXT, pageId: "page-second" });

    expect(irFirst.box.nodeId).toBe("root");
    expect(irSecond.box.nodeId).toBe("root2");
    expect(irSecond.meta.pageId).toBe("page-second");
  });
});
