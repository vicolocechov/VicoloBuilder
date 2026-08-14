import { describe, expect, it } from "vitest";
import { applyCommand, type Command } from "../../src/runtime/commands.js";
import { createDocument } from "../../src/document/document.js";
import { resolveDocument } from "../../src/resolver/resolveNode.js";
import { serializeDocument } from "../../src/document/hash.js";

// Matrice #4: Resolver deterministico (stesso input -> stesso output),
// precondizione per l'export IR byte-identico (Criteri di successo del
// Vertical Slice). Stesso pattern di test/determinism.test.ts in Fase 1
// (due Document indipendenti, stessa sequenza di comandi).

function serializeResolvedModel(model: ReturnType<typeof resolveDocument>): string {
  const nodes = Array.from(model.nodes.values())
    .map((n) => ({
      id: n.id,
      type: n.type,
      parentId: n.parentId,
      childrenIds: [...n.childrenIds],
      resolvedProps: Object.keys(n.resolvedProps)
        .sort()
        .map((k) => [k, n.resolvedProps[k]]),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return JSON.stringify({ rootPageId: model.rootPageId, nodes });
}

describe("resolveDocument — determinismo (matrice #4)", () => {
  it("risolvere due volte lo stesso Document produce lo stesso ResolvedModel", () => {
    let doc = createDocument({ rootNodeId: "root" });
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "a",
      nodeType: "box",
      parentId: "root",
      props: { variant: "primary" },
    });

    const first = resolveDocument(doc, { breakpoint: "tablet-verticale" });
    const second = resolveDocument(doc, { breakpoint: "tablet-verticale" });

    expect(serializeResolvedModel(first)).toBe(serializeResolvedModel(second));
  });

  it("la stessa sequenza di comandi applicata a due Document indipendenti produce lo stesso ResolvedModel", () => {
    const commands: Command[] = [
      { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root", props: { variant: "secondary" } },
      { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a", props: { content: "hi" } },
      { type: "UPDATE_PROPS", nodeId: "b", props: { content: "hello" } },
    ];

    let docA = createDocument({ rootNodeId: "root" });
    let docB = createDocument({ rootNodeId: "root" });
    for (const command of commands) {
      docA = applyCommand(docA, command);
      docB = applyCommand(docB, command);
    }

    // sanity check: i Document sorgente sono già garantiti identici da Fase 1
    expect(serializeDocument(docA)).toBe(serializeDocument(docB));

    const modelA = resolveDocument(docA, { breakpoint: "desktop" });
    const modelB = resolveDocument(docB, { breakpoint: "desktop" });

    expect(serializeResolvedModel(modelA)).toBe(serializeResolvedModel(modelB));
  });

  it("breakpoint diversi possono produrre output diversi (sanity check anti falso-positivo di determinismo)", () => {
    let doc = createDocument({ rootNodeId: "root" });
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "a",
      nodeType: "box",
      parentId: "root",
      props: { padding: 8, responsive: { desktop: { padding: 40 } } },
    });

    const mobile = resolveDocument(doc, { breakpoint: "mobile-verticale" });
    const desktop = resolveDocument(doc, { breakpoint: "desktop" });

    expect(serializeResolvedModel(mobile)).not.toBe(serializeResolvedModel(desktop));
  });
});
