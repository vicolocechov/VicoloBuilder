import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/runtime/commands.js";
import { createDocument } from "../../src/document/document.js";
import { cascadingBreakpoints, getBreakpoint, BREAKPOINTS } from "../../src/resolver/breakpoints.js";
import { resolveDocument } from "../../src/resolver/resolveNode.js";

function baseDocument() {
  return createDocument({ rootNodeId: "root" });
}

describe("breakpoints — lista fissa (decisione C)", () => {
  it("mai lette da window/DOM: BREAKPOINTS è un array statico noto in anticipo", () => {
    expect(BREAKPOINTS.map((b) => b.name)).toEqual(["mobile", "tablet", "desktop"]);
  });

  it("getBreakpoint lancia su un nome sconosciuto invece di restituire un default silenzioso", () => {
    expect(() => getBreakpoint("does-not-exist")).toThrow();
  });

  it("cascadingBreakpoints('tablet') include mobile e tablet ma non desktop, in ordine crescente di minWidth", () => {
    expect(cascadingBreakpoints("tablet").map((b) => b.name)).toEqual(["mobile", "tablet"]);
  });
});

describe("resolveDocument — override responsive per breakpoint (matrice #9)", () => {
  function documentWithResponsiveNode() {
    let doc = baseDocument();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "box1",
      nodeType: "box",
      parentId: "root",
      props: {
        padding: 8,
        responsive: {
          tablet: { padding: 16 },
          desktop: { padding: 24 },
        },
      },
    });
    return doc;
  }

  it("a 'mobile' si applica solo la base, nessun override", () => {
    const model = resolveDocument(documentWithResponsiveNode(), { breakpoint: "mobile" });
    expect(model.nodes.get("box1")!.resolvedProps.padding).toBe(8);
  });

  it("a 'tablet' si applica l'override tablet", () => {
    const model = resolveDocument(documentWithResponsiveNode(), { breakpoint: "tablet" });
    expect(model.nodes.get("box1")!.resolvedProps.padding).toBe(16);
  });

  it("a 'desktop' si applica l'override desktop (il più largo vince, cascata mobile-first)", () => {
    const model = resolveDocument(documentWithResponsiveNode(), { breakpoint: "desktop" });
    expect(model.nodes.get("box1")!.resolvedProps.padding).toBe(24);
  });

  it("la chiave 'responsive' non compare mai in resolvedProps (è una convenzione di authoring, non una proprietà reale)", () => {
    const model = resolveDocument(documentWithResponsiveNode(), { breakpoint: "desktop" });
    expect(model.nodes.get("box1")!.resolvedProps).not.toHaveProperty("responsive");
  });

  it("un nodo senza responsive risolve identico a qualunque breakpoint", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "plain", nodeType: "box", parentId: "root", props: { color: "blue" } });

    const mobile = resolveDocument(doc, { breakpoint: "mobile" }).nodes.get("plain")!.resolvedProps;
    const desktop = resolveDocument(doc, { breakpoint: "desktop" }).nodes.get("plain")!.resolvedProps;
    expect(mobile).toEqual(desktop);
  });
});
