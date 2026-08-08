import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/runtime/commands.js";
import { createDocument } from "../../src/document/document.js";
import { resolveDocument } from "../../src/resolver/resolveNode.js";
import { computeLayout } from "../../src/layout/computeLayout.js";
import { validateBox } from "../../src/layout/invariants.js";
import type { Box } from "../../src/layout/types.js";

function box(overrides: Partial<Box> & { nodeId: string }): Box {
  return { x: 0, y: 0, width: 100, height: 100, children: [], ...overrides };
}

describe("computeLayout — invarianti minimi (decisione F)", () => {
  it("un Box Tree reale (nested, con altezze esplicite e di default) non ha violazioni", () => {
    let doc = createDocument({ rootNodeId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a", props: { height: 20 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "c", nodeType: "text", parentId: "a" }); // altezza di default

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const result = computeLayout(model, { viewportWidth: 1280 });

    expect(validateBox(result)).toEqual([]);
  });
});

describe("validateBox — violazioni costruite a mano", () => {
  it("flags dimensioni negative", () => {
    const violations = validateBox(box({ nodeId: "root", width: -10 }));
    expect(violations).toContainEqual(expect.objectContaining({ code: "NEGATIVE_DIMENSION", nodeId: "root" }));
  });

  it("flags valori non finiti (NaN/Infinity)", () => {
    const violations = validateBox(box({ nodeId: "root", height: Number.NaN }));
    expect(violations).toContainEqual(expect.objectContaining({ code: "NON_FINITE_VALUE", nodeId: "root" }));

    const violationsInf = validateBox(box({ nodeId: "root", x: Number.POSITIVE_INFINITY }));
    expect(violationsInf).toContainEqual(expect.objectContaining({ code: "NON_FINITE_VALUE", nodeId: "root" }));
  });

  it("flags un figlio fuori dai bound del parent", () => {
    const parent = box({
      nodeId: "root",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [box({ nodeId: "child", x: 50, y: 0, width: 100, height: 20 })], // sborda oltre width=100 del parent
    });
    const violations = validateBox(parent);
    expect(violations).toContainEqual(expect.objectContaining({ code: "CHILD_OUT_OF_BOUNDS", nodeId: "child" }));
  });

  it("un figlio esattamente ai bordi del parent (bordi inclusi) non viola l'invariante", () => {
    const parent = box({
      nodeId: "root",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [box({ nodeId: "child", x: 0, y: 0, width: 100, height: 100 })],
    });
    expect(validateBox(parent)).toEqual([]);
  });
});
