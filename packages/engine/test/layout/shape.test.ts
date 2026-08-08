import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/runtime/commands.js";
import { createDocument } from "../../src/document/document.js";
import { resolveDocument } from "../../src/resolver/resolveNode.js";
import { computeLayout } from "../../src/layout/computeLayout.js";

// Matrice #7 (RFC-004): "{x,y,width,height,children}, mai CSS diretto".

function expectBoxShape(box: unknown): void {
  expect(box).toMatchObject({
    x: expect.any(Number),
    y: expect.any(Number),
    width: expect.any(Number),
    height: expect.any(Number),
    children: expect.any(Array),
  });
  // Nessuna proprietà CSS-like (classi, flex-direction, ecc.) nell'output.
  const keys = Object.keys(box as object);
  for (const forbidden of ["className", "style", "flexDirection", "css"]) {
    expect(keys).not.toContain(forbidden);
  }
}

describe("computeLayout — forma del Box Tree (matrice #7)", () => {
  it("una pagina vuota (solo root) produce un box con la forma corretta e children=[]", () => {
    const doc = createDocument({ rootNodeId: "root" });
    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 1280 });

    expectBoxShape(box);
    expect(box.children).toEqual([]);
  });

  it("una pagina con figli annidati a più livelli produce box coerenti a ogni livello", () => {
    let doc = createDocument({ rootNodeId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "box", parentId: "a" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "c", nodeType: "text", parentId: "b" });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 1280 });

    expectBoxShape(box);
    expect(box.children).toHaveLength(1);
    expectBoxShape(box.children[0]);
    expect(box.children[0]!.children).toHaveLength(1);
    expectBoxShape(box.children[0]!.children[0]);
  });

  it("ogni box ha un nodeId che corrisponde a un nodo reale del ResolvedModel", () => {
    let doc = createDocument({ rootNodeId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 1280 });

    function collectNodeIds(b: typeof box): string[] {
      return [b.nodeId, ...b.children.flatMap(collectNodeIds)];
    }
    for (const nodeId of collectNodeIds(box)) {
      expect(model.nodes.has(nodeId)).toBe(true);
    }
  });
});
