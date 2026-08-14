import { describe, expect, it } from "vitest";
import { applyCommand, type Command } from "../../src/runtime/commands.js";
import { createDocument } from "../../src/document/document.js";
import { resolveDocument } from "../../src/resolver/resolveNode.js";
import { computeLayout } from "../../src/layout/computeLayout.js";

// Matrice #6: LayoutEngine deterministico (stesso Document risolto -> stesso
// Box Tree), precondizione per l'export IR byte-identico.

describe("computeLayout — determinismo (matrice #6)", () => {
  it("calcolare il layout due volte sullo stesso ResolvedModel produce lo stesso Box Tree", () => {
    let doc = createDocument({ rootNodeId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a" });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const first = computeLayout(model, { viewportWidth: 1280 });
    const second = computeLayout(model, { viewportWidth: 1280 });

    expect(first).toEqual(second);
  });

  it("la stessa sequenza di comandi applicata a due Document indipendenti produce lo stesso Box Tree", () => {
    const commands: Command[] = [
      { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" },
      { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a", props: { height: 20 } },
      { type: "CREATE_NODE", nodeId: "c", nodeType: "text", parentId: "a", props: { height: 30 } },
    ];

    let docA = createDocument({ rootNodeId: "root" });
    let docB = createDocument({ rootNodeId: "root" });
    for (const command of commands) {
      docA = applyCommand(docA, command);
      docB = applyCommand(docB, command);
    }

    const boxA = computeLayout(resolveDocument(docA, { breakpoint: "tablet-verticale" }), { viewportWidth: 768 });
    const boxB = computeLayout(resolveDocument(docB, { breakpoint: "tablet-verticale" }), { viewportWidth: 768 });

    expect(boxA).toEqual(boxB);
  });

  it("viewportWidth diversi possono produrre output diversi (sanity check anti falso-positivo)", () => {
    const doc = createDocument({ rootNodeId: "root" });
    const model = resolveDocument(doc, { breakpoint: "desktop" });

    const narrow = computeLayout(model, { viewportWidth: 375 });
    const wide = computeLayout(model, { viewportWidth: 1280 });

    expect(narrow.width).not.toBe(wide.width);
  });
});
