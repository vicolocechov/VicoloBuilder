import { describe, expect, it } from "vitest";
import type { Box } from "@vicolobuilder/engine";
import { flattenBoxes } from "../../src/canvas/flattenBoxes.js";
import { computeDropTarget } from "../../src/canvas/dropTarget.js";

function box(overrides: Partial<Box> & { nodeId: string }): Box {
  return { x: 0, y: 0, width: 100, height: 100, children: [], ...overrides };
}

// Albero di prova (coordinate assolute, come da D1 "Canvas piatto"):
// root [0,0,600,400] (può ricevere figli)
//  ├─ container [10,10,300,200] (può ricevere figli)
//  │   ├─ a [20,20,100,50]
//  │   └─ b [20,90,100,50]
//  └─ leafText [350,10,100,30] (NON può ricevere figli, es. tipo "text")
const CONTAINERS = new Set(["root", "container"]);
function canReceiveChildren(nodeId: string): boolean {
  return CONTAINERS.has(nodeId);
}

function buildEntries() {
  const a = box({ nodeId: "a", x: 20, y: 20, width: 100, height: 50 });
  const b = box({ nodeId: "b", x: 20, y: 90, width: 100, height: 50 });
  const container = box({ nodeId: "container", x: 10, y: 10, width: 300, height: 200, mode: "libero", children: [a, b] });
  const leafText = box({ nodeId: "leafText", x: 350, y: 10, width: 100, height: 30 });
  const root = box({ nodeId: "root", x: 0, y: 0, width: 600, height: 400, mode: "libero", children: [container, leafText] });
  return flattenBoxes(root);
}

describe("computeDropTarget", () => {
  it("centro di un contenitore -> 'into' quel contenitore", () => {
    const entries = buildEntries();
    // Centro di "container": x in [10,310], y in [10,210] - punto (100,100) è ben dentro, lontano dai bordi di a/b.
    const target = computeDropTarget(entries, new Set(), canReceiveChildren, 250, 30);
    expect(target).toEqual({ kind: "into", targetNodeId: "container", parentNodeId: "container" });
  });

  it("bordo superiore di un fratello -> 'before' quel fratello", () => {
    const entries = buildEntries();
    // "a" è [20,20,100,50]: bordo superiore, y vicino a 20.
    const target = computeDropTarget(entries, new Set(), canReceiveChildren, 60, 22);
    expect(target).toEqual({ kind: "before", targetNodeId: "a", parentNodeId: "container" });
  });

  it("bordo inferiore di un fratello -> 'after' quel fratello", () => {
    const entries = buildEntries();
    // "a" è [20,20,100,50]: bordo inferiore, y vicino a 70.
    const target = computeDropTarget(entries, new Set(), canReceiveChildren, 60, 68);
    expect(target).toEqual({ kind: "after", targetNodeId: "a", parentNodeId: "container" });
  });

  it("centro di un elemento che NON può ricevere figli -> ricade sul contenitore sottostante", () => {
    const entries = buildEntries();
    // Centro di "leafText" [350,10,100,30]: y=20, lontano dai bordi (soglia 8px: min(30*0.25,16)=7.5).
    const target = computeDropTarget(entries, new Set(), canReceiveChildren, 400, 20);
    expect(target).toEqual({ kind: "into", targetNodeId: "root", parentNodeId: "root" });
  });

  it("bordo di un elemento che non può ricevere figli -> 'before'/'after' funzionano comunque (riordino tra fratelli qualunque)", () => {
    const entries = buildEntries();
    const target = computeDropTarget(entries, new Set(), canReceiveChildren, 400, 11);
    expect(target).toEqual({ kind: "before", targetNodeId: "leafText", parentNodeId: "root" });
  });

  it("il nodo trascinato è escluso: il puntatore sopra se stesso trova il box sottostante", () => {
    const entries = buildEntries();
    const target = computeDropTarget(entries, new Set(["container"]), canReceiveChildren, 250, 30);
    // Con "container" escluso, l'unico box che resta sotto quel punto è "root".
    expect(target).toEqual({ kind: "into", targetNodeId: "root", parentNodeId: "root" });
  });

  it("radice pagina (nessun genitore): solo 'into' è possibile, mai 'before'/'after'", () => {
    const entries = buildEntries();
    // Un punto dentro root ma fuori da container/leafText, es. (500,300).
    const target = computeDropTarget(entries, new Set(), canReceiveChildren, 500, 300);
    expect(target).toEqual({ kind: "into", targetNodeId: "root", parentNodeId: "root" });
  });

  it("puntatore fuori da ogni box -> null", () => {
    const entries = buildEntries();
    const target = computeDropTarget(entries, new Set(), canReceiveChildren, 900, 900);
    expect(target).toBeNull();
  });

  it("la fascia di bordo è limitata a 16px anche su un contenitore molto alto (non il 25% pieno)", () => {
    const entries = buildEntries();
    // "container" alto 200px: 25% sarebbe 50px, ma il cap è 16px - un
    // punto a 20px dal bordo superiore deve quindi ricadere su 'into', non 'before'.
    const target = computeDropTarget(entries, new Set(), canReceiveChildren, 250, 30);
    expect(target?.kind).toBe("into");
  });
});
