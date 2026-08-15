import { describe, expect, it } from "vitest";
import { createDocument, getNode } from "../src/document/document.js";
import { validateDocument } from "../src/document/invariants.js";
import { applyCommand, CommandError, type Command } from "../src/runtime/commands.js";

function baseDocument() {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("applyCommand — CREATE_NODE", () => {
  it("adds a node and links it to its parent's childrenIds", () => {
    const doc = baseDocument();
    const next = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "text-1",
      nodeType: "text",
      parentId: "root",
      props: { content: "Hello" },
    });

    expect(getNode(next, "text-1")).toMatchObject({
      id: "text-1",
      type: "text",
      parentId: "root",
      props: { content: "Hello" },
    });
    expect(getNode(next, "root")!.childrenIds).toEqual(["text-1"]);
  });

  it("does not mutate the input Document (pure function)", () => {
    const doc = baseDocument();
    applyCommand(doc, { type: "CREATE_NODE", nodeId: "text-1", nodeType: "text", parentId: "root" });

    expect(doc.nodes.has("text-1")).toBe(false);
    expect(getNode(doc, "root")!.childrenIds).toEqual([]);
  });

  it("respects an explicit insertion index", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "root", index: 0 });

    expect(getNode(doc, "root")!.childrenIds).toEqual(["b", "a"]);
  });

  it("rejects a duplicate node id", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });

    expect(() =>
      applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" }),
    ).toThrow(CommandError);
  });

  it("rejects a non-existent parent", () => {
    const doc = baseDocument();
    expect(() =>
      applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "ghost" }),
    ).toThrow();
  });
});

describe("applyCommand — UPDATE_PROPS", () => {
  it("shallow-merges props into the existing node", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "a",
      nodeType: "text",
      parentId: "root",
      props: { color: "red", size: 12 },
    });
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "a", props: { color: "blue" } });

    expect(getNode(doc, "a")!.props).toEqual({ color: "blue", size: 12 });
  });

  it("rejects an update on a non-existent node", () => {
    const doc = baseDocument();
    expect(() => applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "ghost", props: {} })).toThrow();
  });
});

// Fase 16 (Font custom, Punto 1): mirror di UPDATE_PAGE_PROPS un livello più
// in alto - shallow merge diretto su document.props, nessun pageId da
// individuare (esiste un solo document.props per Document), quindi nessun
// caso "rejects on non-existent" analogo a UPDATE_PROPS/UPDATE_PAGE_PROPS.
describe("applyCommand — UPDATE_DOCUMENT_PROPS (Fase 16)", () => {
  it("shallow-merges props into document.props", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "UPDATE_DOCUMENT_PROPS", props: { fonts: [{ family: "Poppins", weight: "600", src: "x" }] } });
    doc = applyCommand(doc, { type: "UPDATE_DOCUMENT_PROPS", props: { theme: "dark" } });

    expect(doc.props).toEqual({ fonts: [{ family: "Poppins", weight: "600", src: "x" }], theme: "dark" });
  });

  it("a whole-array write replaces the previous 'fonts' value (shallow merge, not an array merge)", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "UPDATE_DOCUMENT_PROPS", props: { fonts: [{ family: "A", weight: "400", src: "a" }] } });
    doc = applyCommand(doc, {
      type: "UPDATE_DOCUMENT_PROPS",
      props: { fonts: [{ family: "A", weight: "400", src: "a" }, { family: "B", weight: "600", src: "b" }] },
    });

    expect(doc.props.fonts).toEqual([
      { family: "A", weight: "400", src: "a" },
      { family: "B", weight: "600", src: "b" },
    ]);
  });

  it("does not mutate the input Document (pure function)", () => {
    const doc = baseDocument();
    applyCommand(doc, { type: "UPDATE_DOCUMENT_PROPS", props: { theme: "dark" } });

    expect(doc.props).toEqual({});
  });
});

describe("applyCommand — DELETE_NODE", () => {
  it("removes a node and unlinks it from its parent", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });
    doc = applyCommand(doc, { type: "DELETE_NODE", nodeId: "a" });

    expect(getNode(doc, "a")).toBeUndefined();
    expect(getNode(doc, "root")!.childrenIds).toEqual([]);
  });

  it("cascades deletion to descendants", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a" });
    doc = applyCommand(doc, { type: "DELETE_NODE", nodeId: "a" });

    expect(getNode(doc, "a")).toBeUndefined();
    expect(getNode(doc, "b")).toBeUndefined();
  });

  it("cascades deletion through a subtree deeper than 3 levels, leaving no orphans", () => {
    // root -> a -> b -> c -> d  (4 livelli sotto root)
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "box", parentId: "a" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "c", nodeType: "box", parentId: "b" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "d", nodeType: "text", parentId: "c" });
    // un ramo laterale che NON deve essere toccato dalla cancellazione di "a"
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "sibling", nodeType: "text", parentId: "root" });

    expect(doc.nodes.size).toBe(6); // root, a, b, c, d, sibling

    doc = applyCommand(doc, { type: "DELETE_NODE", nodeId: "a" });

    for (const id of ["a", "b", "c", "d"]) {
      expect(getNode(doc, id)).toBeUndefined();
    }
    expect(getNode(doc, "sibling")).toBeDefined();
    expect(doc.nodes.size).toBe(2); // root + sibling, nessun orfano rimasto
    expect(getNode(doc, "root")!.childrenIds).toEqual(["sibling"]);
    expect(validateDocument(doc)).toEqual([]);
  });

  it("refuses to delete a page's root node", () => {
    const doc = baseDocument();
    expect(() => applyCommand(doc, { type: "DELETE_NODE", nodeId: "root" })).toThrow(CommandError);
  });

  it("rejects deletion of a non-existent node", () => {
    const doc = baseDocument();
    expect(() => applyCommand(doc, { type: "DELETE_NODE", nodeId: "ghost" })).toThrow();
  });
});

describe("applyCommand — MOVE_NODE (Fase 8)", () => {
  it("sposta un nodo in un genitore diverso, aggiornando entrambe le liste childrenIds", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "leaf", nodeType: "text", parentId: "a" });

    doc = applyCommand(doc, { type: "MOVE_NODE", nodeId: "leaf", newParentId: "b" });

    expect(getNode(doc, "leaf")!.parentId).toBe("b");
    expect(getNode(doc, "a")!.childrenIds).toEqual([]);
    expect(getNode(doc, "b")!.childrenIds).toEqual(["leaf"]);
    expect(validateDocument(doc)).toEqual([]);
  });

  it("rispetta un indice esplicito nel nuovo genitore", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "x", nodeType: "text", parentId: "b" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "y", nodeType: "text", parentId: "b" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "moved", nodeType: "text", parentId: "a" });

    doc = applyCommand(doc, { type: "MOVE_NODE", nodeId: "moved", newParentId: "b", index: 1 });

    expect(getNode(doc, "b")!.childrenIds).toEqual(["x", "moved", "y"]);
  });

  it("senza indice, va in fondo alla lista del nuovo genitore", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "x", nodeType: "text", parentId: "b" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "moved", nodeType: "text", parentId: "a" });

    doc = applyCommand(doc, { type: "MOVE_NODE", nodeId: "moved", newParentId: "b" });

    expect(getNode(doc, "b")!.childrenIds).toEqual(["x", "moved"]);
  });

  it("riordina nello stesso genitore: l'indice è interpretato DOPO aver tolto il nodo dalla lista (decisione esplicita, non prima)", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "c", nodeType: "text", parentId: "root" });
    // childrenIds di root: [a, b, c]. Sposto "a" (indice 0) a index:1 nello
    // STESSO genitore: tolto "a" -> [b, c], inserito a index 1 -> [b, a, c].
    // Se l'indice fosse stato interpretato PRIMA della rimozione (semantica
    // NON scelta), il risultato sarebbe stato [b, a, c] anche in quel caso
    // per questo esempio - il test seguente isola la differenza.
    doc = applyCommand(doc, { type: "MOVE_NODE", nodeId: "a", newParentId: "root", index: 1 });
    expect(getNode(doc, "root")!.childrenIds).toEqual(["b", "a", "c"]);
  });

  it("riordino nello stesso genitore: portare l'ULTIMO elemento in fondo (index = length-1 dopo rimozione) lo lascia in fondo, non prima dell'ultimo", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "c", nodeType: "text", parentId: "root" });
    // childrenIds: [a, b, c]. Sposto "a" a index:2 - se interpretato PRIMA
    // della rimozione (lista di 3 elementi), index 2 sarebbe "prima di c" ->
    // [b, a, c]. Con la semantica scelta (DOPO la rimozione, lista di soli
    // [b, c], lunghezza 2), index 2 è oltre la fine -> [b, c, a].
    doc = applyCommand(doc, { type: "MOVE_NODE", nodeId: "a", newParentId: "root", index: 2 });
    expect(getNode(doc, "root")!.childrenIds).toEqual(["b", "c", "a"]);
  });

  it("non muta il Document di input (funzione pura)", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "leaf", nodeType: "text", parentId: "a" });
    const before = doc;

    applyCommand(doc, { type: "MOVE_NODE", nodeId: "leaf", newParentId: "b" });

    expect(before).toBe(doc);
    expect(getNode(doc, "leaf")!.parentId).toBe("a");
    expect(getNode(doc, "a")!.childrenIds).toEqual(["leaf"]);
  });

  it("il `props` opzionale viene unito (shallow merge) ai props esistenti del nodo spostato, stesso comportamento di UPDATE_PROPS", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "leaf",
      nodeType: "text",
      parentId: "a",
      props: { x: 200, y: 150, text: "ciao" },
    });

    doc = applyCommand(doc, { type: "MOVE_NODE", nodeId: "leaf", newParentId: "b", props: { x: 0, y: 0 } });

    expect(getNode(doc, "leaf")!.props).toEqual({ x: 0, y: 0, text: "ciao" });
  });

  it("senza `props`, i props del nodo spostato restano invariati", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "leaf", nodeType: "text", parentId: "a", props: { text: "ciao" } });

    doc = applyCommand(doc, { type: "MOVE_NODE", nodeId: "leaf", newParentId: "b" });

    expect(getNode(doc, "leaf")!.props).toEqual({ text: "ciao" });
  });

  it("rifiuta di spostare la radice di una pagina (parentId null)", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    expect(() => applyCommand(doc, { type: "MOVE_NODE", nodeId: "root", newParentId: "a" })).toThrow(CommandError);
  });

  it("rifiuta di rendere un nodo genitore di se stesso", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    expect(() => applyCommand(doc, { type: "MOVE_NODE", nodeId: "a", newParentId: "a" })).toThrow(CommandError);
  });

  it("rifiuta di spostare un nodo dentro un proprio discendente (ciclo)", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "box", parentId: "a" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "c", nodeType: "box", parentId: "b" });

    expect(() => applyCommand(doc, { type: "MOVE_NODE", nodeId: "a", newParentId: "c" })).toThrow(CommandError);
  });

  it("rifiuta un nodeId o un newParentId inesistente", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });

    expect(() => applyCommand(doc, { type: "MOVE_NODE", nodeId: "ghost", newParentId: "a" })).toThrow();
    expect(() => applyCommand(doc, { type: "MOVE_NODE", nodeId: "a", newParentId: "ghost" })).toThrow();
  });

  it("funziona tra sottoalberi di pagine diverse (nessun vincolo di appartenenza a una pagina nel Document Model)", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_PAGE", pageId: "page-2", name: "Seconda", rootNodeId: "root-2" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "leaf", nodeType: "text", parentId: "root" });

    doc = applyCommand(doc, { type: "MOVE_NODE", nodeId: "leaf", newParentId: "root-2" });

    expect(getNode(doc, "leaf")!.parentId).toBe("root-2");
    expect(getNode(doc, "root")!.childrenIds).toEqual([]);
    expect(getNode(doc, "root-2")!.childrenIds).toEqual(["leaf"]);
    expect(validateDocument(doc)).toEqual([]);
  });
});

describe("applyCommand — every command produces a valid Document", () => {
  it("holds across a mixed sequence of commands", () => {
    let doc = baseDocument();
    const commands: Command[] = [
      { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" },
      { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a", props: { content: "hi" } },
      { type: "CREATE_NODE", nodeId: "c", nodeType: "text", parentId: "a" },
      { type: "UPDATE_PROPS", nodeId: "b", props: { content: "hello" } },
      { type: "DELETE_NODE", nodeId: "c" },
    ];

    for (const command of commands) {
      doc = applyCommand(doc, command);
      expect(validateDocument(doc)).toEqual([]);
    }
  });
});
