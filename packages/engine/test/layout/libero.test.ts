import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/runtime/commands.js";
import { createDocument } from "../../src/document/document.js";
import { resolveDocument } from "../../src/resolver/resolveNode.js";
import { computeLayout } from "../../src/layout/computeLayout.js";
import { validateBox } from "../../src/layout/invariants.js";

// Fase 5, Blocco B (Decisioni 2A, 3A, 1B, 3, 4): modalità "libero".

function docWithLiberoContainer() {
  let doc = createDocument({ rootNodeId: "root" });
  doc = applyCommand(doc, {
    type: "CREATE_NODE",
    nodeId: "canvas",
    nodeType: "box",
    parentId: "root",
    props: { layoutMode: "libero", width: 400, height: 300 },
  });
  return doc;
}

describe("computeLayout — modalità 'pila' invariata quando layoutMode è assente", () => {
  it("un albero senza alcun layoutMode produce esattamente lo stesso Box Tree di prima del Blocco B", () => {
    let doc = createDocument({ rootNodeId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a", props: { height: 20 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "c", nodeType: "text", parentId: "a" });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 1280 });

    expect(box).toEqual({
      nodeId: "root",
      x: 0,
      y: 0,
      width: 1280,
      height: 60, // 20 (b, esplicita) + 40 (c, DEFAULT_LEAF_HEIGHT)
      mode: "pila",
      children: [
        {
          nodeId: "a",
          x: 0,
          y: 0,
          width: 1280,
          height: 60,
          mode: "pila",
          children: [
            { nodeId: "b", x: 0, y: 0, width: 1280, height: 20, mode: "pila", children: [] },
            { nodeId: "c", x: 0, y: 20, width: 1280, height: 40, mode: "pila", children: [] },
          ],
        },
      ],
    });
  });
});

describe("computeLayout — modalità 'libero': posizionamento esplicito dei figli", () => {
  it("un figlio con x/y/width/height espliciti viene posizionato come ancora del contenitore + offset locale", () => {
    let doc = docWithLiberoContainer();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "card",
      nodeType: "box",
      parentId: "canvas",
      props: { x: 50, y: 30, width: 120, height: 80 },
    });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 1280 });

    const canvas = box.children[0]!;
    expect(canvas).toMatchObject({ nodeId: "canvas", x: 0, y: 0, width: 400, height: 300, mode: "libero" });
    expect(canvas.children[0]).toMatchObject({ nodeId: "card", x: 50, y: 30, width: 120, height: 80 });
  });

  it("l'ancora del contenitore libero si sposta e trascina i figli liberi (coordinate locali, Decisione 2A)", () => {
    let doc = createDocument({ rootNodeId: "root" });
    // "root" è a pila; il suo unico figlio "canvas" eredita x=0,y=0 dalla pila,
    // ma se "canvas" stesso venisse spostato (qui simulato ponendolo come
    // secondo figlio della pila, cursorY>0) i figli liberi lo seguono.
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "spacer", nodeType: "box", parentId: "root", props: { height: 100 } });
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "canvas",
      nodeType: "box",
      parentId: "root",
      props: { layoutMode: "libero", width: 400, height: 300 },
    });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "card", nodeType: "box", parentId: "canvas", props: { x: 10, y: 5, width: 20, height: 20 } });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 1280 });

    const canvas = box.children[1]!;
    expect(canvas.y).toBe(100); // spostato dalla pila
    const card = canvas.children[0]!;
    expect(card.x).toBe(canvas.x + 10);
    expect(card.y).toBe(canvas.y + 5); // 105, non 5: l'offset locale segue l'ancora del contenitore
  });
});

describe("computeLayout — modalità 'libero': larghezza obbligatoria senza default (Decisione 3)", () => {
  it("lancia un errore se un figlio senza figli propri (leaf) in modalità libera non ha width esplicita", () => {
    let doc = docWithLiberoContainer();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "card", nodeType: "text", parentId: "canvas", props: { x: 0, y: 0 } });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(() => computeLayout(model, { viewportWidth: 1280 })).toThrow(/width.*mandatory|mandatory.*width/i);
  });

  it("lancia un errore anche per un figlio con figli propri la cui modalità propria è 'pila' (nessuna larghezza ereditabile)", () => {
    let doc = docWithLiberoContainer();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "stack", nodeType: "box", parentId: "canvas", props: { x: 0, y: 0 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "stack-child", nodeType: "text", parentId: "stack" });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(() => computeLayout(model, { viewportWidth: 1280 })).toThrow();
  });

  it("l'altezza di un figlio libero senza figli propri usa DEFAULT_LEAF_HEIGHT se assente (interpretazione, non decisione esplicita)", () => {
    let doc = docWithLiberoContainer();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "card", nodeType: "text", parentId: "canvas", props: { x: 0, y: 0, width: 50 } });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 1280 });
    expect(box.children[0]!.children[0]).toMatchObject({ height: 40 });
  });
});

describe("computeLayout — modalità 'libero': riquadro automatico (Decisione 3A/4)", () => {
  it("senza width/height espliciti, il contenitore racchiude esattamente i figli", () => {
    let doc = createDocument({ rootNodeId: "root" });
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "canvas",
      nodeType: "box",
      parentId: "root",
      props: { layoutMode: "libero" }, // nessuna width/height esplicita
    });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "canvas", props: { x: 10, y: 10, width: 30, height: 20 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "box", parentId: "canvas", props: { x: 60, y: 40, width: 15, height: 15 } });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 1280 });
    const canvas = box.children[0]!;

    // L'ancora di "canvas" è (0,0) (posizione data dalla pila radice) e resta
    // parte del riquadro finché nessun figlio sconfina prima di essa
    // (Decisione 4: "l'ancora resta fissa", il riquadro si allarga solo
    // verso l'esterno). a: [10,40] x [10,30]; b: [60,75] x [40,55];
    // ancora: (0,0) -> bbox = [0,75] x [0,55].
    expect(canvas.x).toBe(0);
    expect(canvas.y).toBe(0);
    expect(canvas.width).toBe(75);
    expect(canvas.height).toBe(55);
  });

  it("uno sconfinamento negativo allarga il contenitore verso l'esterno, senza ri-basare i figli (Decisione 4)", () => {
    // Il contenitore libero è qui il nodo radice stesso (nessun parent):
    // isola la sola meccanica del riquadro automatico, senza sovrapporla
    // alla verifica - già coperta a parte più sotto - del contenimento
    // rispetto a un parent "pila" esterno.
    let doc = createDocument({ rootNodeId: "root" });
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "root", props: { layoutMode: "libero" } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root", props: { x: -20, y: -10, width: 30, height: 30 } });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 1280 });
    const child = box.children[0]!;

    // l'ancora della radice è (0,0); il figlio ha coordinate assolute
    // (-20,-10), invariate rispetto all'offset locale.
    expect(child.x).toBe(-20);
    expect(child.y).toBe(-10);
    // la radice si allarga per includerlo interamente.
    expect(box.x).toBe(-20);
    expect(box.y).toBe(-10);
    expect(box.width).toBe(30);
    expect(box.height).toBe(30);
  });
});

describe("computeLayout / validateBox — CHILD_OUT_OF_BOUNDS condizionale alla modalità (Decisione 1B)", () => {
  it("un figlio che sconfina non viene segnalato quando il parent è in modalità 'libero'", () => {
    let doc = createDocument({ rootNodeId: "root" });
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "canvas",
      nodeType: "box",
      parentId: "root",
      props: { layoutMode: "libero", width: 100, height: 100 },
    });
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "overflow",
      nodeType: "box",
      parentId: "canvas",
      props: { x: 50, y: 0, width: 100, height: 20 }, // sborda oltre width=100 del contenitore
    });

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 1280 });

    expect(validateBox(box)).toEqual([]);
  });

  it("la stessa geometria di sconfinamento resta segnalata quando il parent è (di default) in modalità 'pila'", () => {
    // Costruita a mano, come già fatto in layout/invariants.test.ts, per
    // isolare la sola differenza introdotta dal campo `mode`.
    const parentPila = {
      nodeId: "root",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      mode: "pila" as const,
      children: [{ nodeId: "child", x: 50, y: 0, width: 100, height: 20, mode: "pila" as const, children: [] }],
    };
    expect(validateBox(parentPila)).toContainEqual(expect.objectContaining({ code: "CHILD_OUT_OF_BOUNDS", nodeId: "child" }));
  });
});
