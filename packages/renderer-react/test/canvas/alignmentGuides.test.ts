import { describe, expect, it } from "vitest";
import { computeAlignmentSnap, SNAP_THRESHOLD_PX } from "../../src/canvas/alignmentGuides.js";

// Fase 5: guide di allineamento di base. Paletti: solo fratelli nello
// stesso contenitore libero, "centro scena" = centro del contenitore
// immediato, soglia 6px, solo spostamento.

const container = { x: 0, y: 0, width: 400, height: 300 };

describe("computeAlignmentSnap — nessun aggancio fuori soglia", () => {
  it("restituisce la posizione grezza e nessuna guida se nulla è entro la soglia", () => {
    const dragged = { x: 50, y: 50, width: 20, height: 20 };
    const result = computeAlignmentSnap(dragged, [], container);
    expect(result).toEqual({ x: 50, y: 50, guideX: null, guideY: null });
  });
});

describe("computeAlignmentSnap — centro del contenitore ('centro scena')", () => {
  it("aggancia il centro dell'elemento trascinato al centro del contenitore entro la soglia", () => {
    // centro contenitore: (200, 150). Elemento 20x20: centro a (200±5, 150) se x=190..
    const dragged = { x: 191, y: 50, width: 20, height: 20 }; // centro x = 201, a 1px dal centro contenitore (200)
    const result = computeAlignmentSnap(dragged, [], container);
    expect(result.x).toBe(190); // centro esatto: x = 200 - 20/2
    expect(result.guideX).toEqual({ position: 200 });
    expect(result.guideY).toBeNull(); // y non entro soglia dal centro (150)
  });

  it("non aggancia se nessuno dei tre bordi (sinistro/centro/destro) è entro la soglia di 6px", () => {
    const dragged = { x: 170, y: 50, width: 20, height: 20 }; // bordi a 170/180/190, tutti a >=10px dal centro (200)
    const result = computeAlignmentSnap(dragged, [], container);
    expect(result.guideX).toBeNull();
    expect(result.x).toBe(170);
  });
});

describe("computeAlignmentSnap — bordi/centro di un fratello", () => {
  it("aggancia il bordo sinistro al bordo sinistro di un fratello", () => {
    const sibling = { x: 50, y: 10, width: 30, height: 30 };
    const dragged = { x: 52, y: 100, width: 20, height: 20 }; // 2px dal bordo sinistro del fratello (50)
    const result = computeAlignmentSnap(dragged, [sibling], container);
    expect(result.x).toBe(50);
    expect(result.guideX).toEqual({ position: 50 });
  });

  it("aggancia il centro al centro di un fratello", () => {
    const sibling = { x: 100, y: 10, width: 40, height: 40 }; // centro x = 120
    const dragged = { x: 108, y: 100, width: 20, height: 20 }; // centro x = 118, 2px dal centro fratello
    const result = computeAlignmentSnap(dragged, [sibling], container);
    expect(result.x).toBe(110); // centro esatto: 120 - 20/2
    expect(result.guideX).toEqual({ position: 120 });
  });

  it("sceglie il candidato più vicino quando più di uno è entro soglia", () => {
    const siblingA = { x: 100, y: 0, width: 0, height: 0 }; // bordo/centro/bordo tutti a 100
    const siblingB = { x: 103, y: 0, width: 0, height: 0 }; // tutti a 103
    const dragged = { x: 101, y: 0, width: 0, height: 0 }; // 1px da A, 2px da B
    const result = computeAlignmentSnap(dragged, [siblingA, siblingB], container);
    expect(result.guideX).toEqual({ position: 100 });
  });
});

describe("computeAlignmentSnap — assi X e Y indipendenti", () => {
  it("può agganciare un asse e lasciare l'altro libero nello stesso gesto", () => {
    const sibling = { x: 60, y: 60, width: 20, height: 20 }; // bordo sinistro 60, bordo superiore 60
    const dragged = { x: 61, y: 200, width: 20, height: 20 }; // x vicino al fratello, y lontano da tutto
    const result = computeAlignmentSnap(dragged, [sibling], container);
    expect(result.guideX).not.toBeNull();
    expect(result.guideY).toBeNull();
    expect(result.y).toBe(200); // invariato
  });
});

describe("SNAP_THRESHOLD_PX", () => {
  it("è 6, come da decisione approvata", () => {
    expect(SNAP_THRESHOLD_PX).toBe(6);
  });
});

// Blocco Z4 (Fit-to-screen/Zoom): `snapThresholdPx` è un parametro
// OPZIONALE - Canvas.tsx lo converte in spazio documento
// (`screenLengthToDocument(SNAP_THRESHOLD_PX, zoom)`) prima di chiamare
// questa funzione, mai al suo interno (il modulo resta ignaro dello zoom).
// Ogni test sopra, che non passa questo parametro, continua a verificare
// il comportamento di default (SNAP_THRESHOLD_PX, equivalente a zoom 100%).
describe("computeAlignmentSnap — soglia personalizzata (Blocco Z4)", () => {
  it("una soglia esplicita più ampia della costante di default aggancia dove il default non aggancerebbe", () => {
    const dragged = { x: 170, y: 50, width: 20, height: 20 }; // 10px dal centro contenitore (200) - fuori dal default 6px
    const withoutOverride = computeAlignmentSnap(dragged, [], container);
    expect(withoutOverride.guideX).toBeNull();

    const withOverride = computeAlignmentSnap(dragged, [], container, 12); // soglia esplicita 12px, copre i 10px
    expect(withOverride.guideX).toEqual({ position: 200 });
  });

  it("una soglia esplicita più stretta della costante di default NON aggancia dove il default agancerebbe", () => {
    const dragged = { x: 191, y: 50, width: 20, height: 20 }; // 1px dal centro contenitore (200) - entro il default 6px
    const withoutOverride = computeAlignmentSnap(dragged, [], container);
    expect(withoutOverride.guideX).not.toBeNull();

    const withOverride = computeAlignmentSnap(dragged, [], container, 0.5); // soglia esplicita 0.5px, non copre 1px
    expect(withOverride.guideX).toBeNull();
  });
});
