import { describe, expect, it } from "vitest";
import type { Box } from "@vicolobuilder/engine";
import { dragCapabilities, flattenBoxes } from "../../src/canvas/flattenBoxes.js";

function box(overrides: Partial<Box> & { nodeId: string }): Box {
  return { x: 0, y: 0, width: 100, height: 100, children: [], ...overrides };
}

describe("flattenBoxes", () => {
  it("appiattisce un albero a 2 livelli in ordine pre-order (parent prima dei figli)", () => {
    const tree = box({
      nodeId: "root",
      mode: "libero",
      children: [box({ nodeId: "a" }), box({ nodeId: "b" })],
    });

    const entries = flattenBoxes(tree);
    expect(entries.map((e) => e.box.nodeId)).toEqual(["root", "a", "b"]);
  });

  it("porta il parentBox e la parentMode corretti per ogni entry", () => {
    const child = box({ nodeId: "a" });
    const tree = box({ nodeId: "root", mode: "libero", children: [child] });

    const entries = flattenBoxes(tree);
    expect(entries[0]!.parentBox).toBeNull();
    expect(entries[0]!.parentMode).toBe("pila"); // default per la radice (nessun parent reale)
    expect(entries[1]!.parentBox).toBe(tree);
    expect(entries[1]!.parentMode).toBe("libero");
  });

  it("un box senza 'mode' esplicito conta come 'pila' per i figli", () => {
    const child = box({ nodeId: "a" });
    const tree = box({ nodeId: "root", children: [child] }); // mode assente

    const entries = flattenBoxes(tree);
    expect(entries[1]!.parentMode).toBe("pila");
  });
});

describe("dragCapabilities", () => {
  it("un figlio di un parent 'pila' non è mai trascinabile su x/y né ridimensionabile in larghezza", () => {
    const entry = { box: box({ nodeId: "a" }), parentBox: box({ nodeId: "root" }), parentMode: "pila" as const };
    const caps = dragCapabilities(entry, true);
    expect(caps.canMoveXY).toBe(false);
    expect(caps.canResizeWidth).toBe(false);
  });

  it("una foglia in un parent 'pila' resta comunque ridimensionabile in altezza", () => {
    const entry = { box: box({ nodeId: "a" }), parentBox: box({ nodeId: "root" }), parentMode: "pila" as const };
    expect(dragCapabilities(entry, true).canResizeHeight).toBe(true);
  });

  it("un contenitore (non foglia) in modalità propria 'pila' NON è ridimensionabile in altezza (somma dei figli)", () => {
    const entry = {
      box: box({ nodeId: "a", mode: "pila" }),
      parentBox: box({ nodeId: "root" }),
      parentMode: "pila" as const,
    };
    expect(dragCapabilities(entry, false).canResizeHeight).toBe(false);
  });

  it("un contenitore in modalità propria 'libero' È ridimensionabile in altezza (riquadro esplicito)", () => {
    const entry = {
      box: box({ nodeId: "a", mode: "libero" }),
      parentBox: box({ nodeId: "root" }),
      parentMode: "pila" as const,
    };
    expect(dragCapabilities(entry, false).canResizeHeight).toBe(true);
  });

  it("un figlio di un parent 'libero' è trascinabile su x/y e ridimensionabile in larghezza", () => {
    const entry = { box: box({ nodeId: "a" }), parentBox: box({ nodeId: "root" }), parentMode: "libero" as const };
    const caps = dragCapabilities(entry, true);
    expect(caps.canMoveXY).toBe(true);
    expect(caps.canResizeWidth).toBe(true);
  });
});
