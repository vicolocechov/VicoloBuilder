import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/runtime/commands.js";
import { createDocument } from "../../src/document/document.js";
import { resolveDocument } from "../../src/resolver/resolveNode.js";
import { computeLayout } from "../../src/layout/computeLayout.js";
import { validateBox, assertValidBox, BoxInvariantError } from "../../src/layout/invariants.js";

// Fase 8: modalità "griglia" - N colonne uguali + gap, nessun concetto di
// "cella" nel Document Model (correzione esplicita ricevuta prima
// dell'implementazione): la griglia dispone automaticamente i figli che ha
// già, quanti siano, in base a `childrenIds` - non ne crea né ne limita il
// numero.
//
// NOTA sul disegno dei fixture: "grid" qui è sempre l'unico figlio della
// radice pagina, che resta "pila" (default) - una pila eredita SEMPRE la
// larghezza dall'alto ai propri figli (D-014/D-015, comportamento
// invariato, "griglia" lo eredita identico a "pila" - vedi anche il test
// dedicato più sotto), quindi un eventuale prop `width` sulla griglia
// stessa verrebbe ignorato in questa posizione. La larghezza della griglia
// si controlla perciò passando `viewportWidth` a `computeLayout` (che
// scorre invariata: radice "pila" -> unico figlio "grid"), non con un prop
// locale.

function docWithGridContainer(columns: number, gap = 0) {
  let doc = createDocument({ rootNodeId: "root" });
  doc = applyCommand(doc, {
    type: "CREATE_NODE",
    nodeId: "grid",
    nodeType: "box",
    parentId: "root",
    props: { layoutMode: "griglia", columns, gap },
  });
  return doc;
}

function addLeaf(doc: ReturnType<typeof docWithGridContainer>, nodeId: string, parentId: string, height?: number) {
  return applyCommand(doc, {
    type: "CREATE_NODE",
    nodeId,
    nodeType: "text",
    parentId,
    props: height !== undefined ? { height } : {},
  });
}

describe("computeLayout — modalità 'griglia': disposizione automatica dei figli esistenti", () => {
  it("2 colonne, 4 figli, gap 0: due righe di due, larghezza cella = larghezza/colonne", () => {
    let doc = docWithGridContainer(2, 0);
    doc = addLeaf(doc, "a", "grid", 10);
    doc = addLeaf(doc, "b", "grid", 10);
    doc = addLeaf(doc, "c", "grid", 10);
    doc = addLeaf(doc, "d", "grid", 10);

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 200 }); // cellWidth = 200/2 = 100
    const grid = box.children[0]!;

    expect(grid.mode).toBe("griglia");
    expect(grid.width).toBe(200);
    expect(grid.height).toBe(20); // due righe da 10
    expect(grid.children.map((c) => ({ nodeId: c.nodeId, x: c.x, y: c.y, width: c.width, height: c.height }))).toEqual([
      { nodeId: "a", x: 0, y: 0, width: 100, height: 10 },
      { nodeId: "b", x: 100, y: 0, width: 100, height: 10 },
      { nodeId: "c", x: 0, y: 10, width: 100, height: 10 },
      { nodeId: "d", x: 100, y: 10, width: 100, height: 10 },
    ]);
  });

  it("il gap si applica sia tra colonne sia tra righe", () => {
    let doc = docWithGridContainer(2, 20);
    doc = addLeaf(doc, "a", "grid", 10);
    doc = addLeaf(doc, "b", "grid", 10);
    doc = addLeaf(doc, "c", "grid", 10);

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    // cellWidth = (220 - 20*(2-1)) / 2 = 100
    const box = computeLayout(model, { viewportWidth: 220 });
    const grid = box.children[0]!;

    expect(grid.height).toBe(10 + 20 + 10); // riga1 + gap + riga2, NESSUN gap finale dopo l'ultima riga
    expect(grid.children.map((c) => ({ x: c.x, y: c.y }))).toEqual([
      { x: 0, y: 0 },
      { x: 120, y: 0 }, // 100 (cella) + 20 (gap)
      { x: 0, y: 30 }, // riga 2 dopo riga1(10) + gap(20)
    ]);
  });

  it("un numero di figli non multiplo di 'columns' lascia l'ultima riga parziale, senza placeholder per le celle mancanti", () => {
    let doc = docWithGridContainer(3, 0);
    doc = addLeaf(doc, "a", "grid", 10);
    doc = addLeaf(doc, "b", "grid", 10);
    doc = addLeaf(doc, "c", "grid", 10);
    doc = addLeaf(doc, "d", "grid", 10);
    doc = addLeaf(doc, "e", "grid", 10);

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 300 }); // cellWidth = 300/3 = 100
    const grid = box.children[0]!;

    expect(grid.children).toHaveLength(5); // nessun nodo fantasma per le celle mancanti della seconda riga
    expect(grid.children[3]).toMatchObject({ nodeId: "d", x: 0, y: 10 }); // seconda riga riparte da colonna 0
    expect(grid.children[4]).toMatchObject({ nodeId: "e", x: 100, y: 10 });
    expect(grid.height).toBe(20); // due righe, anche se l'ultima ha solo 2 celle occupate su 3
  });

  it("l'altezza di riga è quella della cella più alta DI QUELLA riga, non uniforme sull'intera griglia", () => {
    let doc = docWithGridContainer(2, 0);
    doc = addLeaf(doc, "a", "grid", 10);
    doc = addLeaf(doc, "b", "grid", 80); // riga 1 alta 80
    doc = addLeaf(doc, "c", "grid", 5);
    doc = addLeaf(doc, "d", "grid", 5); // riga 2 alta 5, NON influenzata dalla riga 1

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 200 });
    const grid = box.children[0]!;

    expect(grid.height).toBe(85); // 80 (riga 1) + 5 (riga 2)
    expect(grid.children.find((c) => c.nodeId === "c")!.y).toBe(80);
  });

  it("un contenitore 'griglia' senza figli non richiede 'columns' (nessuna cella da disporre - stesso comportamento di un contenitore vuoto)", () => {
    const doc = docWithGridContainer(undefined as unknown as number); // columns intenzionalmente assente
    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(() => computeLayout(model, { viewportWidth: 1280 })).not.toThrow();
  });

  it("'columns' assente con almeno un figlio lancia un errore esplicito, nessun default silenzioso", () => {
    let doc = docWithGridContainer(undefined as unknown as number);
    doc = addLeaf(doc, "a", "grid", 10);
    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(() => computeLayout(model, { viewportWidth: 1280 })).toThrow(/columns/);
  });

  it.each([0, -1, 1.5])("'columns' non valido (%s) lancia un errore esplicito", (columns) => {
    let doc = docWithGridContainer(columns);
    doc = addLeaf(doc, "a", "grid", 10);
    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(() => computeLayout(model, { viewportWidth: 1280 })).toThrow(/columns/);
  });

  it("nessuna violazione CHILD_OUT_OF_BOUNDS per una griglia valida (contenimento per costruzione, come 'pila')", () => {
    let doc = docWithGridContainer(2, 10);
    doc = addLeaf(doc, "a", "grid", 10);
    doc = addLeaf(doc, "b", "grid", 25);
    doc = addLeaf(doc, "c", "grid", 5);
    doc = addLeaf(doc, "d", "grid", 15);

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    // cellWidth = (210 - 10) / 2 = 100 esatto (evita artefatti in virgola
    // mobile nel controllo di contenimento sotto).
    const box = computeLayout(model, { viewportWidth: 210 }); // già chiama assertValidBox internamente
    expect(validateBox(box)).toEqual([]);
  });

  it("un gap eccessivo rispetto alla larghezza disponibile produce celle a larghezza negativa, intercettato da NEGATIVE_DIMENSION (nessun clamp silenzioso)", () => {
    let doc = docWithGridContainer(2, 500);
    doc = addLeaf(doc, "a", "grid", 10);
    doc = addLeaf(doc, "b", "grid", 10);

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    // cellWidth = (100 - 500) / 2 < 0
    expect(() => computeLayout(model, { viewportWidth: 100 })).toThrow(BoxInvariantError);
  });

  it("una griglia figlia di un genitore 'libero' richiede una larghezza esplicita propria (stessa regola di 'pila' in quella posizione)", () => {
    let doc = createDocument({ rootNodeId: "root" });
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "root", props: { layoutMode: "libero" } });
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "grid",
      nodeType: "box",
      parentId: "root",
      props: { layoutMode: "griglia", columns: 2 }, // nessuna width esplicita
    });
    doc = addLeaf(doc, "a", "grid", 10);
    doc = addLeaf(doc, "b", "grid", 10);

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(() => computeLayout(model, { viewportWidth: 1280 })).toThrow(/width/);
  });

  it("una griglia figlia di un genitore 'pila' eredita la larghezza dall'alto, come qualunque figlio a pila (un `width` proprio sarebbe ignorato)", () => {
    let doc = docWithGridContainer(2, 0);
    doc = addLeaf(doc, "a", "grid", 10);
    doc = addLeaf(doc, "b", "grid", 10);

    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 1280 });
    expect(box.children[0]!.width).toBe(1280);
  });

  it("assertValidBox non lancia su una griglia valida (regressione minima, mirror del pattern usato per 'libero')", () => {
    let doc = docWithGridContainer(2, 0);
    doc = addLeaf(doc, "a", "grid", 10);
    doc = addLeaf(doc, "b", "grid", 10);
    const model = resolveDocument(doc, { breakpoint: "desktop" });
    const box = computeLayout(model, { viewportWidth: 200 });
    expect(() => assertValidBox(box)).not.toThrow();
  });
});
