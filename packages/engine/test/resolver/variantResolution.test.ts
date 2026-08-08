import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/runtime/commands.js";
import { createDocument } from "../../src/document/document.js";
import { resolveDocument } from "../../src/resolver/resolveNode.js";

function baseDocument() {
  return createDocument({ rootNodeId: "root" });
}

describe("resolveDocument — variant resolution (matrice #9, RFC-000 §8)", () => {
  it("variant:'primary' produce esattamente background/color/padding/radius attesi", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "btn",
      nodeType: "box",
      parentId: "root",
      props: { variant: "primary" },
    });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const resolved = model.nodes.get("btn")!;

    expect(resolved.resolvedProps).toMatchObject({
      variant: "primary",
      background: "#0f8a7d",
      color: "#ffffff",
      padding: 12,
      radius: 8,
    });
  });

  it("le proprietà esplicite del nodo vincono sul default del variant", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "btn",
      nodeType: "box",
      parentId: "root",
      props: { variant: "primary", padding: 24 },
    });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(model.nodes.get("btn")!.resolvedProps.padding).toBe(24);
  });

  it("un variant sconosciuto non viene espanso: le proprietà esplicite restano invariate", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "btn",
      nodeType: "box",
      parentId: "root",
      props: { variant: "does-not-exist", color: "red" },
    });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(model.nodes.get("btn")!.resolvedProps).toEqual({ variant: "does-not-exist", color: "red" });
  });

  it("nessun variant dichiarato: resolvedProps coincide con le props originali", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "txt",
      nodeType: "text",
      parentId: "root",
      props: { content: "ciao" },
    });

    const model = resolveDocument(doc, { breakpoint: "mobile" });
    expect(model.nodes.get("txt")!.resolvedProps).toEqual({ content: "ciao" });
  });
});
